/**
 * Service orchestrator for Podbit.
 *
 * Standalone Express server that manages child processes for all Podbit
 * services (API server, GUI dev server, partition pool, etc.). Provides
 * start/stop/restart endpoints, periodic health monitoring via configurable
 * heartbeat, and automatic restart with per-service max-retry and cooldown
 * logic. On startup, kills zombie processes from previous sessions, then
 * auto-starts services marked with `autoStart: true`.
 *
 * Run this process first; the GUI and MCP server connect to it for service
 * control. Graceful shutdown stops all managed children (HTTP endpoint then
 * force-kill fallback) before exiting.
 *
 * @module orchestrator
 */

import express from 'express';
import cors from 'cors';
import net from 'net';
import { spawn, exec } from 'child_process';
import { config, VERSION } from './config.js';
import { RC } from './config/constants.js';

const app = express();
app.use(cors());
app.use(express.json());

// Track managed processes
const processes: Record<string, any> = {};

// Track service status
const serviceStatus: Record<string, any> = {};

// Track restart attempts per service
const restartState: Record<string, any> = {};

// Heartbeat subscribers
const heartbeatListeners = new Set<(results: Record<string, any>) => void>();

// Orchestrator stats
const stats: { startedAt: string; startedAtMs: number; lastHeartbeat: string | null } = {
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    lastHeartbeat: null,
};

/**
 * Check if a managed service process is still alive.
 * Only detects processes spawned by this orchestrator instance.
 * @param serviceId - The service identifier from `config.managedServices`
 * @returns True if the process handle exists, is not killed, and has no exit code
 */
function isManagedServiceRunning(serviceId: string) {
    const proc = processes[serviceId];
    return proc && !proc.killed && proc.exitCode === null;
}

/**
 * Check health of a managed service via its HTTP health endpoint.
 * Detects running services even if started independently (not via orchestrator).
 * Falls back to process-handle check when no health endpoint is configured.
 * @param serviceId - The service identifier
 * @param serviceConfig - Service configuration from `config.managedServices`
 * @returns Health status object with status, healthy flag, pid, and optional external flag
 */
async function checkManagedServiceHealth(serviceId: string, serviceConfig: any) {
    const isOrchestratorManaged = isManagedServiceRunning(serviceId);
    const proc = processes[serviceId];

    // If service has a health endpoint, check it regardless of how it was started
    if (serviceConfig.healthEndpoint) {
        try {
            const response = await fetch(serviceConfig.healthEndpoint, {
                signal: AbortSignal.timeout(RC.timeouts.healthCheckMs),
            });
            if (response.ok) {
                const data = await response.json().catch(() => ({}));
                // Spread data first so we don't overwrite our status
                const { status: _ignore, ...rest } = data;
                return {
                    ...rest,
                    status: 'running',
                    healthy: true,
                    pid: isOrchestratorManaged ? proc.pid : null,
                    external: !isOrchestratorManaged, // Flag if started externally
                };
            }
        } catch (_err: any) {
            // If we spawned it but it's not responding, it's starting up
            if (isOrchestratorManaged) {
                return {
                    status: 'starting',
                    healthy: false,
                    pid: proc.pid,
                    error: 'Not responding yet',
                };
            }
            // Not managed and not responding = stopped
            return {
                status: 'stopped',
                healthy: false,
                pid: null,
            };
        }
    }

    // No health endpoint - check if we're managing the process
    if (isOrchestratorManaged) {
        return {
            status: 'running',
            healthy: true,
            pid: proc.pid,
        };
    }

    // No health endpoint and not managed = unknown/stopped
    return {
        status: 'stopped',
        healthy: false,
        pid: null,
    };
}

/**
 * Check health of the SQLite database by running a diagnostic health check.
 * Uses dynamic import to avoid loading the full DB module at orchestrator startup.
 * @returns Health status object with status and healthy flag
 */
async function checkDatabaseHealth() {
    try {
        // Dynamically import to avoid loading everything at startup
        const { healthCheck } = await import('./db.js');
        const healthy = await healthCheck();
        return {
            status: healthy ? 'running' : 'stopped',
            healthy,
        };
    } catch (err: any) {
        return {
            status: 'error',
            healthy: false,
            error: err.message,
        };
    }
}

/**
 * Check health of an external HTTP service via TCP liveness probe.
 * Uses a raw TCP connection (not HTTP) to avoid polluting the service's access logs.
 * @param serviceConfig - Service configuration with `endpoint` and optional `timeout`
 * @returns Health status object with status, healthy flag, endpoint, and optional error
 */
async function checkExternalServiceHealth(serviceConfig: any) {
    if (!serviceConfig.endpoint) {
        return {
            status: 'not configured',
            healthy: false,
        };
    }

    try {
        const timeout = serviceConfig.timeout || 5000;

        // Pure TCP liveness check — just verify the port is open.
        // No HTTP request at all, so nothing shows up in server logs.
        const url = new URL(serviceConfig.endpoint);
        const host = url.hostname;
        const port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);

        const alive = await new Promise<boolean>((resolve) => {
            const sock = net.createConnection({ host, port }, () => {
                sock.destroy();
                resolve(true);
            });
            sock.setTimeout(timeout);
            sock.on('timeout', () => { sock.destroy(); resolve(false); });
            sock.on('error', () => { resolve(false); });
        });

        if (alive) {
            return {
                status: 'running',
                healthy: true,
                endpoint: serviceConfig.endpoint,
                model: serviceConfig.model || serviceConfig.models?.[0],
            };
        }

        return {
            status: 'stopped',
            healthy: false,
            endpoint: serviceConfig.endpoint,
            error: 'Not responding',
        };
    } catch (err: any) {
        return {
            status: 'error',
            healthy: false,
            endpoint: serviceConfig.endpoint,
            error: err.message,
        };
    }
}

/**
 * Evaluate whether any managed services need auto-restarting.
 * Skips during the startup grace period. Respects per-service max restart
 * counts and cooldown periods. Resets counters after sustained healthy period.
 * @param currentStatus - Current health status of all services
 */
async function evaluateRestarts(currentStatus: Record<string, any>) {
    // Skip during startup grace period — services may still be booting
    const gracePeriodMs = config.orchestrator.startupGracePeriodMs || RC.timeouts.startupGraceMs;
    if (Date.now() - stats.startedAtMs < gracePeriodMs) return;

    for (const [id, svcConfig] of Object.entries(config.managedServices) as [string, any][]) {
        if (!svcConfig.autoRestart) continue;

        const status = currentStatus[id];
        if (!status || status.status === 'starting') continue;
        if (status.external) continue;

        const rs = restartState[id];
        const cooldownMs = svcConfig.restartCooldownMs || RC.timeouts.restartCooldownMs;

        // Reset counter if service has recovered and been healthy long enough
        if (status.healthy && rs?.lastAttempt) {
            if (Date.now() - rs.lastAttempt > cooldownMs * 2) {
                restartState[id] = { count: 0, lastAttempt: null, disabled: false };
            }
            continue;
        }

        // Skip healthy services that don't need restart counter reset
        if (status.healthy) continue;

        // Initialize restart state if needed
        if (!restartState[id]) {
            restartState[id] = { count: 0, lastAttempt: null, disabled: false };
        }

        const rsState = restartState[id];
        const maxRestarts = svcConfig.maxRestarts || 5;

        // Skip if disabled (hit max restarts)
        if (rsState.disabled) continue;

        // Skip if within cooldown period
        if (rsState.lastAttempt && (Date.now() - rsState.lastAttempt) < cooldownMs) continue;

        // Check if exceeded max restarts
        if (rsState.count >= maxRestarts) {
            console.log(`[${id}] Max restarts (${maxRestarts}) reached. Disabling auto-restart.`);
            rsState.disabled = true;
            continue;
        }

        // Attempt restart
        rsState.count++;
        rsState.lastAttempt = Date.now();
        console.log(`[${id}] Service down. Auto-restarting (attempt ${rsState.count}/${maxRestarts})...`);

        const result = await startService(id);
        if (result.success) {
            console.log(`[${id}] Auto-restart successful (PID: ${result.pid})`);
        } else {
            console.log(`[${id}] Auto-restart failed: ${result.error}`);
        }
    }
}

/**
 * Subscribe to heartbeat updates. The callback is invoked after each
 * health check cycle with the full status of all services.
 * @param callback - Function called with service status map on each heartbeat
 * @returns Unsubscribe function
 */
function _subscribeToHeartbeat(callback: (results: Record<string, any>) => void) {
    heartbeatListeners.add(callback);
    return () => heartbeatListeners.delete(callback);
}

/**
 * Check health of all managed and external services. Runs auto-restart
 * evaluation if enabled, updates cached status, and notifies heartbeat listeners.
 * @returns Record mapping service IDs to their current health status
 */
async function checkAllServices() {
    const results: Record<string, any> = {};

    // Phase 1: Check health of all services
    for (const [id, svcConfig] of Object.entries(config.managedServices) as [string, any][]) {
        results[id] = {
            ...await checkManagedServiceHealth(id, svcConfig),
            name: svcConfig.name,
            type: 'managed',
            required: svcConfig.required,
            manageable: true,
        };
    }

    for (const [id, svcConfig] of Object.entries(config.externalServices) as [string, any][]) {
        if (svcConfig.ideManaged) {
            // IDE-managed services (e.g. MCP via Cursor stdio) — we can't check health
            results[id] = {
                status: 'running',
                healthy: true,
                name: svcConfig.name,
                type: 'external',
                required: svcConfig.required,
                manageable: false,
                ideManaged: true,
            };
        } else if (id === 'database') {
            results[id] = {
                ...await checkDatabaseHealth(),
                name: svcConfig.name,
                type: 'external',
                required: svcConfig.required,
                manageable: false,
            };
        } else {
            results[id] = {
                ...await checkExternalServiceHealth(svcConfig),
                name: svcConfig.name,
                type: 'external',
                required: svcConfig.required,
                manageable: false,
            };
        }
    }

    // Phase 2: Auto-restart evaluation
    if (config.orchestrator.autoRestartEnabled) {
        await evaluateRestarts(results);
    }

    // Update cached status
    Object.assign(serviceStatus, results);
    stats.lastHeartbeat = new Date().toISOString();

    // Phase 3: Notify listeners
    for (const listener of heartbeatListeners) {
        try { listener(results); } catch (_e) { /* ignore */ }
    }

    return results;
}

/**
 * Start a managed service by spawning its configured command.
 * Uses shell mode on Windows for npm/npx commands (which are .cmd scripts).
 * Waits 1 second after spawn to check for immediate exit failures.
 * @param serviceId - The service identifier from `config.managedServices`
 * @returns Result object with `success`, `pid`, and optional `error`
 */
async function startService(serviceId: string) {
    const svcConfig = config.managedServices[serviceId];
    if (!svcConfig) {
        return { success: false, error: `Unknown service: ${serviceId}` };
    }

    if (isManagedServiceRunning(serviceId)) {
        return { success: false, error: `${svcConfig.name} is already running` };
    }

    try {
        console.log(`Starting ${svcConfig.name}...`);

        // Use shell only for npm/npx commands (they're .cmd scripts on Windows).
        // Direct node invocations skip the shell to avoid unnecessary cmd.exe wrappers.
        const needsShell = process.platform === 'win32' &&
            !svcConfig.command.endsWith('node.exe') &&
            !svcConfig.command.endsWith('node');

        const proc = spawn(svcConfig.command, svcConfig.args, {
            cwd: svcConfig.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: needsShell,
            detached: false,
        });

        processes[serviceId] = proc;

        // Log output
        proc.stdout?.on('data', (data) => {
            for (const line of data.toString().trimEnd().split('\n')) {
                console.log(`[${serviceId}] ${line}`);
            }
        });

        proc.stderr?.on('data', (data) => {
            for (const line of data.toString().trimEnd().split('\n')) {
                console.error(`[${serviceId}] ${line}`);
            }
        });

        proc.on('error', (err) => {
            console.error(`[${serviceId}] Error:`, err.message);
        });

        proc.on('exit', (code) => {
            console.log(`[${serviceId}] Exited with code ${code}`);
        });

        // Give it a moment to start
        await new Promise(r => setTimeout(r, 1000));

        if (proc.exitCode !== null) {
            return { success: false, error: `Process exited immediately with code ${proc.exitCode}` };
        }

        return { success: true, pid: proc.pid };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Find the PID of a process listening on a given port.
 * Uses `netstat` on Windows and `lsof` on Unix.
 * @param port - TCP port number to search for
 * @returns The PID if found, or null
 */
async function findPidByPort(port: number): Promise<number | null> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err: any, stdout: string) => {
                if (err || !stdout) return resolve(null);
                // Parse: TCP    0.0.0.0:4710    0.0.0.0:0    LISTENING    12345
                const match = stdout.match(/LISTENING\s+(\d+)/);
                resolve(match ? parseInt(match[1], 10) : null);
            });
        } else {
            exec(`lsof -i :${port} -t`, (err: any, stdout: string) => {
                if (err || !stdout) return resolve(null);
                resolve(parseInt(stdout.trim(), 10) || null);
            });
        }
    });
}

/**
 * Force-kill a process by PID. Uses `taskkill /f /t` on Windows (kills
 * the process tree) and `kill -9` on Unix.
 * @param pid - Process ID to kill
 * @returns Resolves after a 500ms grace period
 */
async function killProcessByPid(pid: number) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { shell: true });
        } else {
            spawn('kill', ['-9', pid.toString()]);
        }
        // Give it a moment
        setTimeout(() => resolve(true), 500);
    });
}

/**
 * Request graceful shutdown of a service via its HTTP `/api/shutdown` endpoint.
 * Derives the shutdown URL from the service's health endpoint.
 * @param svcConfig - Service configuration with `healthEndpoint`
 * @returns True if the shutdown request was sent successfully, false otherwise
 */
async function requestGracefulStop(svcConfig: any): Promise<boolean> {
    if (!svcConfig.healthEndpoint) return false;
    try {
        const url = new URL(svcConfig.healthEndpoint);
        const shutdownUrl = `${url.protocol}//${url.host}/api/shutdown`;
        await fetch(shutdownUrl, { method: 'POST', signal: AbortSignal.timeout(2000) });
        return true;
    } catch {
        return false;
    }
}

/**
 * Stop a managed service using a two-phase approach:
 * 1. Request graceful shutdown via HTTP endpoint (5s timeout)
 * 2. Force-kill via process handle or port-based PID lookup as fallback
 *
 * Can stop both orchestrator-managed and externally-started services.
 * @param serviceId - The service identifier from `config.managedServices`
 * @returns Result object with `success`, optional `graceful`/`wasExternal` flags, and `error`
 */
async function stopService(serviceId: string) {
    const svcConfig = config.managedServices[serviceId];
    if (!svcConfig) {
        return { success: false, error: `Unknown service: ${serviceId}` };
    }

    const proc = processes[serviceId];

    // Check if we have a process handle (started by orchestrator)
    if (proc && !proc.killed && proc.exitCode === null) {
        try {
            console.log(`Stopping ${svcConfig.name}...`);

            // Phase 1: Request graceful shutdown via HTTP
            const graceful = await requestGracefulStop(svcConfig);
            if (graceful) {
                // Wait up to 5 seconds for graceful exit
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline && !proc.killed && proc.exitCode === null) {
                    await new Promise(r => setTimeout(r, 250));
                }
                if (proc.killed || proc.exitCode !== null) {
                    console.log(`  ${svcConfig.name} exited cleanly.`);
                    return { success: true, graceful: true };
                }
            }

            // Phase 2: Force-kill if still running
            console.log(`  Force-killing ${svcConfig.name}...`);
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true });
            } else {
                proc.kill('SIGKILL');
            }
            await new Promise(r => setTimeout(r, 500));

            return { success: true, graceful: false };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    // Service might be running externally — try graceful shutdown first
    if (svcConfig.healthEndpoint) {
        const graceful = await requestGracefulStop(svcConfig);
        if (graceful) {
            // Wait for it to actually exit
            await new Promise(r => setTimeout(r, 3000));
            // Verify it's gone
            try {
                await fetch(svcConfig.healthEndpoint, { signal: AbortSignal.timeout(1000) });
                // Still responding — fall through to force-kill by port
            } catch {
                // Connection refused = it exited
                return { success: true, wasExternal: true, graceful: true };
            }
        }

        // Force-kill by port as last resort
        try {
            const url = new URL(svcConfig.healthEndpoint);
            const port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);

            console.log(`Looking for ${svcConfig.name} on port ${port}...`);
            const pid = await findPidByPort(port);

            if (pid) {
                console.log(`Found ${svcConfig.name} running externally (PID: ${pid}), stopping...`);
                await killProcessByPid(pid);
                return { success: true, wasExternal: true, pid };
            }
        } catch (err: any) {
            console.error(`Error finding external process:`, err.message);
        }
    }

    return { success: false, error: `${svcConfig.name} is not running` };
}

// ============ API ROUTES ============

// Get orchestrator status
app.get('/status', async (_req, res) => {
    const services = await checkAllServices();
    res.json({
        orchestrator: {
            status: 'running',
            startedAt: stats.startedAt,
            lastHeartbeat: stats.lastHeartbeat,
            autoRestartEnabled: config.orchestrator.autoRestartEnabled,
        },
        services,
        restartState,
    });
});

// Get all service status (returns cached state from last heartbeat — no live polling)
app.get('/services', (_req, res) => {
    res.json(serviceStatus);
});

// Start all stopped services
app.post('/services/start-all', async (_req, res) => {
    const started: string[] = [];
    const alreadyRunning: string[] = [];
    const failed: string[] = [];

    for (const [id, _svc] of Object.entries(config.managedServices) as [string, any][]) {
        if (isManagedServiceRunning(id)) {
            alreadyRunning.push(id);
            continue;
        }
        const result = await startService(id);
        if (result.success) {
            started.push(id);
        } else {
            failed.push(id);
        }
    }

    // Let services settle, then refresh status
    if (started.length > 0) {
        await new Promise(r => setTimeout(r, 1000));
    }
    const status = await checkAllServices();

    res.json({ started, alreadyRunning, failed, services: status });
});

// Stop all running services (orchestrator, API, and GUI stay alive)
const STOP_ALL_EXEMPT = new Set(['resonance', 'gui']);
app.post('/services/stop-all', async (_req, res) => {
    const stopped: string[] = [];
    const alreadyStopped: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const [id, _svc] of Object.entries(config.managedServices) as [string, any][]) {
        if (STOP_ALL_EXEMPT.has(id)) {
            skipped.push(id);
            continue;
        }
        if (!isManagedServiceRunning(id)) {
            alreadyStopped.push(id);
            continue;
        }
        const result = await stopService(id);
        if (result.success) {
            stopped.push(id);
        } else {
            failed.push(id);
        }
    }

    await new Promise(r => setTimeout(r, 500));
    const status = await checkAllServices();

    res.json({ stopped, alreadyStopped, failed, skipped, services: status });
});

// Graceful full shutdown — stop all services then exit the orchestrator
app.post('/shutdown', async (_req, res) => {
    console.log('[orchestrator] Shutdown requested via API');

    // Stop all managed services first
    for (const [id] of Object.entries(config.managedServices) as [string, any][]) {
        if (isManagedServiceRunning(id)) {
            await stopService(id);
        }
    }

    // Respond before exiting so the client gets the response
    res.json({ shutting_down: true, message: 'All services stopped. Orchestrator exiting.' });

    // Give the response time to flush, then exit
    setTimeout(() => {
        console.log('[orchestrator] Exiting.');
        process.exit(0);
    }, 500);
});

// Start a service
app.post('/services/:id/start', async (req, res) => {
    const { id } = req.params;
    const result = await startService(id);

    // Check status after start
    await new Promise(r => setTimeout(r, 500));
    const status = await checkAllServices();

    res.json({
        ...result,
        service: status[id],
    });
});

// Stop a service
app.post('/services/:id/stop', async (req, res) => {
    const { id } = req.params;
    const result = await stopService(id);

    // Check status after stop
    await new Promise(r => setTimeout(r, 500));
    const status = await checkAllServices();

    res.json({
        ...result,
        service: status[id],
    });
});

// Restart a service (stop + start)
app.post('/services/:id/restart', async (req, res) => {
    const { id } = req.params;
    await stopService(id);
    await new Promise(r => setTimeout(r, 1000));
    const result = await startService(id);
    await new Promise(r => setTimeout(r, 500));
    const status = await checkAllServices();
    res.json({ ...result, service: status[id] });
});

// Get restart state for a service
app.get('/services/:id/restarts', (req, res) => {
    const { id } = req.params;
    res.json(restartState[id] || { count: 0, lastAttempt: null, disabled: false });
});

// Reset restart counter for a service
app.post('/services/:id/restarts/reset', (req, res) => {
    const { id } = req.params;
    restartState[id] = { count: 0, lastAttempt: null, disabled: false };
    res.json({ success: true, message: `Restart counter for ${id} reset` });
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        version: VERSION,
        timestamp: new Date().toISOString(),
    });
});

// ============ ZOMBIE CLEANUP ============

/**
 * Extract port number from a health endpoint URL.
 * Falls back to 443 for HTTPS and 80 for HTTP if no explicit port is specified.
 * @param healthEndpoint - Full URL string (e.g. 'http://localhost:4710/health')
 * @returns The extracted port number, or null if URL parsing fails
 */
function extractPort(healthEndpoint: string): number | null {
    try {
        const url = new URL(healthEndpoint);
        return parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
    } catch {
        return null;
    }
}

/**
 * Kill all processes listening on a given port. Cross-platform:
 * uses `netstat`+`taskkill` on Windows, `lsof`+`kill -9` on Unix.
 * @param port - TCP port number to clear
 * @returns The number of processes successfully killed
 */
async function killProcessesOnPort(port: number): Promise<number> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err: any, stdout: string) => {
                if (err || !stdout) return resolve(0);
                // Collect unique PIDs
                const pids = new Set<number>();
                for (const line of stdout.trim().split('\n')) {
                    const match = line.match(/LISTENING\s+(\d+)/);
                    if (match) pids.add(parseInt(match[1], 10));
                }
                if (pids.size === 0) return resolve(0);
                let killed = 0;
                let remaining = pids.size;
                for (const pid of pids) {
                    exec(`taskkill /pid ${pid} /f /t`, (killErr) => {
                        if (!killErr) killed++;
                        remaining--;
                        if (remaining === 0) resolve(killed);
                    });
                }
            });
        } else {
            exec(`lsof -i :${port} -t`, (err: any, stdout: string) => {
                if (err || !stdout) return resolve(0);
                const pids = stdout.trim().split('\n').map(p => parseInt(p, 10)).filter(p => !Number.isNaN(p));
                if (pids.length === 0) return resolve(0);
                let killed = 0;
                let remaining = pids.length;
                for (const pid of pids) {
                    exec(`kill -9 ${pid}`, (killErr) => {
                        if (!killErr) killed++;
                        remaining--;
                        if (remaining === 0) resolve(killed);
                    });
                }
            });
        }
    });
}

/**
 * Build the set of PIDs that are part of the current session and must NOT be killed.
 * Walks the full parent chain from our PID using ALL processes (not just node.exe),
 * since the ancestry includes non-node processes like Code.exe, cmd.exe, etc.
 * Also marks all child processes of the current orchestrator as safe.
 */
async function getCurrentSessionPids(): Promise<Set<number>> {
    const safePids = new Set<number>([process.pid]);

    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            // Query ALL processes for pid/ppid — not just node.exe — so we can
            // walk the full ancestry (Code.exe → cmd.exe → node.exe → ...)
            exec('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Csv -NoTypeInformation"', {
                maxBuffer: 2 * 1024 * 1024,
            }, (err, stdout) => {
                if (err || !stdout) return resolve(safePids);

                const parentMap = new Map<number, number>();
                const childMap = new Map<number, number[]>();
                for (const line of stdout.trim().split('\n').slice(1)) {
                    // CSV: "PID","ParentPID"
                    const match = line.match(/"(\d+)","(\d+)"/);
                    if (!match) continue;
                    const pid = parseInt(match[1], 10);
                    const ppid = parseInt(match[2], 10);
                    parentMap.set(pid, ppid);
                    if (!childMap.has(ppid)) childMap.set(ppid, []);
                    childMap.get(ppid)!.push(pid);
                }

                // Walk UP: mark all ancestors safe
                let current: number | undefined = process.pid;
                for (let depth = 0; depth < 30 && current != null; depth++) {
                    safePids.add(current);
                    current = parentMap.get(current);
                }

                // Walk DOWN: mark all descendants of this process safe
                // (services we may have already started in this session)
                const queue = [process.pid];
                while (queue.length > 0) {
                    const pid = queue.pop()!;
                    const children = childMap.get(pid) || [];
                    for (const child of children) {
                        if (!safePids.has(child)) {
                            safePids.add(child);
                            queue.push(child);
                        }
                    }
                }

                resolve(safePids);
            });
        } else {
            exec('ps -eo pid,ppid', (err, stdout) => {
                if (err || !stdout) return resolve(safePids);

                const parentMap = new Map<number, number>();
                const childMap = new Map<number, number[]>();
                for (const line of stdout.trim().split('\n').slice(1)) {
                    const [pidStr, ppidStr] = line.trim().split(/\s+/);
                    const pid = parseInt(pidStr, 10);
                    const ppid = parseInt(ppidStr, 10);
                    if (!Number.isNaN(pid) && !Number.isNaN(ppid)) {
                        parentMap.set(pid, ppid);
                        if (!childMap.has(ppid)) childMap.set(ppid, []);
                        childMap.get(ppid)!.push(pid);
                    }
                }

                // Walk UP
                let current: number | undefined = process.pid;
                for (let depth = 0; depth < 30 && current != null; depth++) {
                    safePids.add(current);
                    current = parentMap.get(current);
                }

                // Walk DOWN
                const queue = [process.pid];
                while (queue.length > 0) {
                    const pid = queue.pop()!;
                    const children = childMap.get(pid) || [];
                    for (const child of children) {
                        if (!safePids.has(child)) {
                            safePids.add(child);
                            queue.push(child);
                        }
                    }
                }

                resolve(safePids);
            });
        }
    });
}

/**
 * Kill stale node/tsx processes from previous Podbit sessions.
 * Uses PowerShell (Windows) or ps (Unix) to find node processes whose
 * command line matches one of the Podbit script names or contains "podbit"
 * in the cwd path. Excludes the entire current process tree (ancestors +
 * descendants). Kills individually - no tree kill.
 */
async function killStaleNodeProcesses(): Promise<number> {
    const safePids = await getCurrentSessionPids();

    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            // Use PowerShell to get node.exe processes with their command lines
            // This avoids WMIC CSV parsing issues (commas in CommandLine)
            const ps = `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation`;
            exec(`powershell -NoProfile -Command "${ps}"`, {
                maxBuffer: 2 * 1024 * 1024,
            }, (err, stdout) => {
                if (err || !stdout) return resolve(0);

                const podbitPatterns = [
                    'server.ts', 'orchestrator.ts', 'proxy-server.ts',
                    'partition-server.ts', 'mcp-stdio.ts', 'podbit',
                ];
                const pidsToKill: number[] = [];

                for (const line of stdout.trim().split('\n').slice(1)) {
                    // CSV: "PID","CommandLine" — but CommandLine may contain quotes
                    // Extract PID from the first quoted field
                    const pidMatch = line.match(/^"(\d+)"/);
                    if (!pidMatch) continue;
                    const pid = parseInt(pidMatch[1], 10);
                    if (Number.isNaN(pid) || safePids.has(pid)) continue;

                    const cmdLine = line.substring(pidMatch[0].length);
                    if (podbitPatterns.some(p => cmdLine.includes(p))) {
                        pidsToKill.push(pid);
                    }
                }

                if (pidsToKill.length === 0) return resolve(0);

                console.log(`  Found ${pidsToKill.length} stale Podbit process(es) to kill: ${pidsToKill.join(', ')}`);

                let killed = 0;
                let remaining = pidsToKill.length;
                for (const pid of pidsToKill) {
                    exec(`taskkill /pid ${pid} /f`, (killErr) => {
                        if (!killErr) killed++;
                        remaining--;
                        if (remaining === 0) resolve(killed);
                    });
                }
            });
        } else {
            exec('ps aux | grep -E "node.*(server\\.ts|orchestrator\\.ts|proxy-server\\.ts|partition-server\\.ts|mcp-stdio\\.ts|podbit)" | grep -v grep', (err, stdout) => {
                if (err || !stdout) return resolve(0);

                const pidsToKill: number[] = [];
                for (const line of stdout.trim().split('\n')) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parseInt(parts[1], 10);
                    if (Number.isNaN(pid) || safePids.has(pid)) continue;
                    pidsToKill.push(pid);
                }

                if (pidsToKill.length === 0) return resolve(0);

                let killed = 0;
                let remaining = pidsToKill.length;
                for (const pid of pidsToKill) {
                    exec(`kill -9 ${pid}`, (killErr) => {
                        if (!killErr) killed++;
                        remaining--;
                        if (remaining === 0) resolve(killed);
                    });
                }
            });
        }
    });
}

/**
 * Clean up zombie processes from previous orchestrator sessions.
 * Phase 1: Kill stale node processes by command-line pattern (catches orphans
 *          that no longer hold a port binding).
 * Phase 2: Kill any remaining processes on known service ports (catches
 *          non-node processes or those missed by pattern matching).
 * Waits 1 second after cleanup to allow the OS to release ports.
 */
async function cleanupZombieProcesses(): Promise<void> {
    console.log('Checking for zombie processes from previous sessions...');
    let totalKilled = 0;

    // Phase 1: Kill stale node processes by command-line pattern
    const staleKilled = await killStaleNodeProcesses();
    if (staleKilled > 0) {
        console.log(`  Killed ${staleKilled} stale Podbit node process(es) by name.`);
        totalKilled += staleKilled;
    }

    // Phase 2: Kill remaining processes on known service ports
    for (const [_id, svcConfig] of Object.entries(config.managedServices) as [string, any][]) {
        if (!svcConfig.healthEndpoint) continue;
        const port = extractPort(svcConfig.healthEndpoint);
        if (!port) continue;

        const killed = await killProcessesOnPort(port);
        if (killed > 0) {
            console.log(`  Killed ${killed} zombie process(es) on port ${port} (${svcConfig.name})`);
            totalKilled += killed;
        }
    }

    if (totalKilled > 0) {
        console.log(`Cleaned up ${totalKilled} zombie process(es) total.`);
        // Give OS a moment to release ports
        await new Promise(r => setTimeout(r, 1000));
    } else {
        console.log('  No zombie processes found.');
    }
}

// ============ STARTUP ============

const PORT = config.orchestrator.port;
const HOST = config.server.host;

// Heartbeat interval
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Shut down any previous orchestrator on our port before binding.
 * Without this, the old orchestrator's auto-restart heartbeat would
 * respawn services that the new zombie cleanup just killed, leading
 * to unbounded process accumulation.
 *
 * Phase 1: Graceful shutdown via `/shutdown` endpoint (8s timeout).
 * Phase 2: Force-kill anything on the orchestrator port as fallback.
 */
async function shutdownPreviousOrchestrator(): Promise<void> {
    const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;

    // Phase 1: Try graceful shutdown via the /shutdown endpoint
    try {
        const resp = await fetch(`${url}/shutdown`, {
            method: 'POST',
            signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
            console.log('Requested previous orchestrator to shut down...');
            // Wait for it to actually exit and release the port
            const deadline = Date.now() + 8000;
            while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 500));
                try {
                    await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
                    // Still alive — keep waiting
                } catch {
                    // Connection refused = it exited
                    console.log('Previous orchestrator exited cleanly.');
                    return;
                }
            }
            console.log('Previous orchestrator did not exit in time, force-killing...');
        }
    } catch {
        // No orchestrator running or unreachable — check if port is occupied anyway
    }

    // Phase 2: Force-kill anything on the orchestrator port
    const killed = await killProcessesOnPort(PORT);
    if (killed > 0) {
        console.log(`Force-killed ${killed} process(es) on orchestrator port ${PORT}.`);
        await new Promise(r => setTimeout(r, 1000));
    }
}

// Shut down previous orchestrator before binding
await shutdownPreviousOrchestrator();

app.listen(PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log(`║            PODBIT v${VERSION} - ORCHESTRATOR`.padEnd(56) + '║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  Orchestrator running on http://${HOST}:${PORT}`.padEnd(56) + '║');
    console.log(`║  GUI can connect to control services`.padEnd(56) + '║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');

    // Phase 0: Clean up zombies from previous sessions, then proceed
    cleanupZombieProcesses().then(async () => {
        // Phase 1: Check current state
        console.log('Checking services...');
        const services = await checkAllServices();
        (Object.entries(services) as [string, any][]).forEach(([_id, status]) => {
            const icon = status.healthy ? '✓' : '✗';
            console.log(`  ${icon} ${status.name}: ${status.status}`);
        });
        console.log('');

        // Phase 2: Auto-start services marked with autoStart: true
        const autoStartIds = (Object.entries(config.managedServices) as [string, any][])
            .filter(([_, svc]) => svc.autoStart)
            .map(([id]) => id);

        for (const serviceId of autoStartIds) {
            const service = services[serviceId];
            if (service && !service.healthy) {
                console.log(`Auto-starting ${service.name}...`);
                const result = await startService(serviceId);
                if (result.success) {
                    console.log(`  ✓ ${service.name} started (PID: ${result.pid})`);
                } else {
                    console.log(`  ✗ ${service.name} failed: ${result.error}`);
                }
            }
        }

        // Phase 3: Start heartbeat
        heartbeatInterval = setInterval(() => {
            checkAllServices();
        }, config.orchestrator.heartbeatIntervalMs);
    });
});

// Cleanup on exit — graceful shutdown then force-kill as fallback
async function shutdownManagedProcesses(): Promise<void> {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    const procs = Object.entries(processes) as [string, any][];
    const running = procs.filter(([_, proc]) => proc && !proc.killed && proc.exitCode === null);

    if (running.length === 0) return;

    console.log(`Stopping ${running.length} managed process(es)...`);

    // Phase 1: Request graceful shutdown via HTTP endpoint
    for (const [id] of running) {
        const svcConfig = config.managedServices[id];
        if (svcConfig?.healthEndpoint) {
            try {
                const url = new URL(svcConfig.healthEndpoint);
                const shutdownUrl = `${url.protocol}//${url.host}/api/shutdown`;
                console.log(`  Requesting graceful shutdown: ${id}...`);
                await fetch(shutdownUrl, {
                    method: 'POST',
                    signal: AbortSignal.timeout(2000),
                });
            } catch {
                // Endpoint may not exist (e.g., GUI dev server) — will force-kill below
            }
        }
    }

    // Phase 2: Wait for processes to exit gracefully (up to 5 seconds)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        const alive = running.filter(([_, proc]) => proc && !proc.killed && proc.exitCode === null);
        if (alive.length === 0) {
            console.log('  All processes exited cleanly.');
            return;
        }
        await new Promise(r => setTimeout(r, 250));
    }

    // Phase 3: Force-kill any remaining processes
    const remaining = running.filter(([_, proc]) => proc && !proc.killed && proc.exitCode === null);
    if (remaining.length > 0) {
        console.log(`  Force-killing ${remaining.length} remaining process(es)...`);
        const killPromises = remaining.map(([id, proc]) => {
            return new Promise<void>((resolve) => {
                console.log(`    Killing ${id} (PID: ${proc.pid})...`);
                if (process.platform === 'win32') {
                    exec(`taskkill /pid ${proc.pid} /f /t`, () => resolve());
                } else {
                    proc.kill('SIGKILL');
                    resolve();
                }
            });
        });
        await Promise.all(killPromises);
        await new Promise(r => setTimeout(r, 500));
    }
}

process.on('SIGINT', async () => {
    console.log('\nShutting down orchestrator...');
    await shutdownManagedProcesses();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down orchestrator...');
    await shutdownManagedProcesses();
    process.exit(0);
});

export default app;
