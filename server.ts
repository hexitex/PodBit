/**
 * Main HTTP server for Podbit.
 *
 * Express application providing the full REST API (`/api/*`), Server-Sent Events
 * for the activity feed, static file serving for the GUI SPA, and graceful
 * shutdown orchestration. Supports optional TLS (via `PODBIT_TLS_CERT`/`KEY`
 * env vars), CORS lockdown for remote deployments, security headers, and
 * JWT-based auth when running in remote mode.
 *
 * On startup the server initialises the database, loads saved config/models,
 * auto-starts enabled autonomous cycles, recovers stuck EVM/KB entries,
 * and activates pool integration. Graceful shutdown stops all background
 * services in dependency order and flushes the WAL before exit.
 *
 * @module server
 */

import { interceptConsole } from './utils/logger.js';
interceptConsole();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'http';
import https from 'https';
import fs from 'fs';
import type { Server } from 'http';
import { config, VERSION } from './config.js';
import { healthCheck as dbHealthCheck, getDbDiagnostics } from './db.js';
import { loadSavedModels } from './models.js';
import { loadSavedConfig } from './config.js';
import { checkPartitionHealth, startValidationCycle, startQuestionCycle, startTensionCycle, startResearchCycle, startAutoratingCycle, startEvmCycle, startVoicingCycle, startGroundRulesCycle, startPopulationControlCycle } from './core.js';
import apiRoutes from './routes/api.js';
import securityRouter, { requireKey } from './routes/security.js';
import { getSecurityKey, isAdminPasswordSet, isLocalhostAddress, isRemoteMode, cleanupExpiredRefreshTokens } from './core/security.js';
import { emitActivity, onActivity } from './services/event-bus.js';

const app = express();
let httpServer: Server | null = null;
let isShuttingDown = false;

// =============================================================================
// TLS CONFIGURATION
// =============================================================================

const tlsCertPath = process.env.PODBIT_TLS_CERT;
const tlsKeyPath = process.env.PODBIT_TLS_KEY;
const tlsEnabled = !!(tlsCertPath && tlsKeyPath);

let tlsOptions: https.ServerOptions | null = null;
if (tlsEnabled) {
    try {
        tlsOptions = {
            cert: fs.readFileSync(tlsCertPath!),
            key: fs.readFileSync(tlsKeyPath!),
        };
    } catch (err: any) {
        console.error(`[security] Failed to read TLS certificate: ${err.message}`);
        console.error(`  PODBIT_TLS_CERT=${tlsCertPath}`);
        console.error(`  PODBIT_TLS_KEY=${tlsKeyPath}`);
        process.exit(1);
    }
}

// API stats
const apiStats = {
    startedAt: new Date().toISOString(),
    requestCount: 0,
};

// =============================================================================
// SECURITY HEADERS
// =============================================================================

app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0'); // Disabled — modern CSP is better, X-XSS can cause issues
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (tlsEnabled) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

// =============================================================================
// CORS CONFIGURATION
// =============================================================================

/**
 * Determine CORS origin policy based on configuration and binding mode.
 * - Explicit origins configured: use them
 * - Localhost binding: allow all origins
 * - Remote binding with no configured origins: same-origin only
 * @returns CORS origin value for the cors middleware
 */
function getCorsOrigin(): cors.CorsOptions['origin'] {
    const configured = config.server.corsOrigins;
    // Explicit CORS origins configured — use them
    if (configured && configured.length > 0) return configured;
    // Localhost mode — allow all origins (same behavior as before)
    if (isLocalhostAddress(config.server.host)) return true;
    // Remote mode with no configured origins — same-origin only
    return false;
}

app.use(cors({
    origin: getCorsOrigin(),
    credentials: true, // Required for httpOnly refresh token cookies
    exposedHeaders: ['x-podbit-key'],
}));

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Request counting
app.use((_req, _res, next) => {
    apiStats.requestCount++;
    next();
});

// Request logging (skip noisy health checks)
app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Health check endpoint
app.get('/health', async (_req, res) => {
    const dbOk = await dbHealthCheck();
    const diag = getDbDiagnostics();
    const uptimeSeconds = Math.floor((Date.now() - new Date(apiStats.startedAt).getTime()) / 1000);
    res.json({
        status: dbOk ? 'healthy' : 'degraded',
        version: VERSION,
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
        requests: apiStats.requestCount,
        tls: tlsEnabled,
        remoteMode: isRemoteMode(),
        db_stats: {
            queries: diag.stats.totalReads,
            mutations: diag.stats.totalWrites,
            slow: diag.stats.slowCount,
            contention: diag.stats.contentionEvents,
            p99_ms: diag.stats.p99Ms,
            active: diag.activeOps.length,
        },
    });
});

// Security: handshake + auth endpoints (must be before requireKey middleware)
app.use('/api', securityRouter);

// Security: require key/JWT for all API calls
app.use('/api', requireKey);

// API routes
app.use('/api', apiRoutes);

// Static files for GUI (when built)
app.use(express.static('gui/dist'));

// SPA fallback - serve index.html for any unmatched routes
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile('gui/dist/index.html', { root: '.' }, (err) => {
        if (err) {
            res.status(404).json({ error: 'Not found' });
        }
    });
});

/**
 * Graceful shutdown sequence. Stops all background services in order:
 * HTTP server, synthesis engine, autonomous cycles, EVM queue worker,
 * budget monitor, KB watchers, pool integration. Then waits 500ms for
 * in-flight operations and closes the database to flush the WAL.
 * @param signal - Optional signal name for logging (e.g. 'SIGINT', 'API')
 */
async function gracefulShutdown(signal?: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal ? `[${signal}] ` : ''}Graceful shutdown initiated...`);

    // 1. Stop accepting new HTTP connections
    if (httpServer) {
        httpServer.close();
        console.log('  ✓ HTTP server closed');
    }

    // 2. Stop synthesis engine
    try {
        const { stopSynthesisEngine, getSynthesisStatus } = await import('./core.js');
        if (getSynthesisStatus().running) {
            stopSynthesisEngine();
            console.log('  ✓ Synthesis engine stopped');
        }
    } catch { /* not loaded */ }

    // 3. Stop autonomous cycles
    try {
        const { stopCycle, cycleStates } = await import('./core.js');
        const types = ['validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing', 'population_control'] as const;
        const stopped: string[] = [];
        for (const type of types) {
            if (cycleStates[type]?.running) {
                stopCycle(type);
                stopped.push(type);
            }
        }
        if (stopped.length > 0) console.log(`  ✓ Autonomous cycles stopped (${stopped.join(', ')})`);
    } catch { /* not loaded */ }

    // 3b. Stop EVM queue worker
    try {
        const { stopQueueWorker } = await import('./evm/queue-worker.js');
        await stopQueueWorker();
        console.log('  ✓ EVM queue worker stopped');
    } catch { /* not loaded */ }

    // 4. Stop budget monitor
    try {
        const { stopBudgetSystem } = await import('./models/budget.js');
        stopBudgetSystem();
    } catch { /* not loaded */ }

    // 5. Stop KB watchers
    try {
        const { stopAllWatchers } = await import('./kb/watcher.js');
        await stopAllWatchers();
        console.log('  ✓ KB watchers stopped');
    } catch { /* not loaded */ }

    // 6. Stop pool integration
    try {
        const { shutdownPoolIntegration } = await import('./core/pool-integration.js');
        shutdownPoolIntegration();
        console.log('  ✓ Pool integration stopped');
    } catch { /* not loaded */ }

    // 7. Wait for in-flight operations to finish
    await new Promise(r => setTimeout(r, 500));

    // 8. Close database (flushes WAL)
    try {
        const { close } = await import('./db/index.js');
        await close();
        console.log('  ✓ Database closed');
    } catch { /* already closed */ }

    console.log('Shutdown complete.');
    process.exit(0);
}

// Shutdown endpoint — called by orchestrator for clean shutdown
// Protected by security key (requireKey middleware doesn't cover direct app.post)
app.post('/api/shutdown', requireKey, async (_req, res) => {
    res.json({ message: 'Shutdown initiated' });
    setTimeout(() => gracefulShutdown('API'), 100);
});

// Error handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('Error:', err.message);
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// Override db.ts signal handlers with comprehensive shutdown
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// =============================================================================
// START SERVER
// =============================================================================

const PORT = config.server.port;
const HOST = config.server.host;
const remote = isRemoteMode();
const protocol = tlsEnabled ? 'https' : 'http';

// =============================================================================
// STARTUP SAFETY CHECKS
// =============================================================================

if (remote) {
    // Check admin password before allowing remote binding
    // We do this asynchronously just before listen
    (async () => {
        const passwordSet = await isAdminPasswordSet().catch(() => false);
        if (!passwordSet) {
            console.error('');
            console.error('╔═══════════════════════════════════════════════════════════════╗');
            console.error('║  SECURITY WARNING: Remote mode without admin password        ║');
            console.error('╠═══════════════════════════════════════════════════════════════╣');
            console.error(`║  Server is binding to ${HOST}, which is network-accessible.`.padEnd(62) + '║');
            console.error('║  No admin password is set — the API will be unprotected.     ║');
            console.error('║                                                              ║');
            console.error('║  Set a password via the GUI or API:                          ║');
            console.error('║    POST /api/security/admin/setup { "password": "..." }      ║');
            console.error('║                                                              ║');
            console.error('║  Until a password is set, login-based auth is unavailable.   ║');
            console.error('║  Only localhost handshake and security key will work.         ║');
            console.error('╚═══════════════════════════════════════════════════════════════╝');
            console.error('');
        }

        if (!tlsEnabled) {
            console.error('');
            console.error('╔═══════════════════════════════════════════════════════════════╗');
            console.error('║  SECURITY WARNING: Remote mode without TLS                   ║');
            console.error('╠═══════════════════════════════════════════════════════════════╣');
            console.error('║  Credentials will be transmitted in cleartext over HTTP.      ║');
            console.error('║                                                              ║');
            console.error('║  To enable TLS:                                              ║');
            console.error('║    npx tsx scripts/generate-cert.ts                          ║');
            console.error('║    Set PODBIT_TLS_CERT and PODBIT_TLS_KEY env vars           ║');
            console.error('╚═══════════════════════════════════════════════════════════════╝');
            console.error('');
        }

        startServer();
    })();
} else {
    startServer();
}

/**
 * Create and start the HTTP/HTTPS server. After binding, performs startup
 * initialization: DB health check, security key init, config/model loading,
 * activity persistence, partition health check, number variable backfill,
 * budget system init, autonomous cycle auto-start, EVM queue recovery,
 * elite pool backfill, KB file recovery, KB watcher start, and pool
 * integration activation.
 */
function startServer(): void {
    // Create HTTP or HTTPS server
    if (tlsOptions) {
        httpServer = https.createServer(tlsOptions, app);
    } else {
        httpServer = http.createServer(app);
    }

    httpServer.listen(PORT, HOST, async () => {
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log(`║              PODBIT v${VERSION} - SERVER`.padEnd(56) + '║');
        console.log('╠═══════════════════════════════════════════════════════╣');
        console.log(`║  Server running on ${protocol}://${HOST}:${PORT}`.padEnd(56) + '║');
        console.log(`║  API endpoints at /api`.padEnd(56) + '║');
        if (tlsEnabled) {
            console.log(`║  TLS: enabled`.padEnd(56) + '║');
        }
        if (remote) {
            console.log(`║  Mode: REMOTE (network-accessible)`.padEnd(56) + '║');
        } else {
            console.log(`║  Mode: localhost (local only)`.padEnd(56) + '║');
        }
        if (config.server.corsOrigins.length > 0) {
            console.log(`║  CORS: ${config.server.corsOrigins.join(', ').slice(0, 40)}`.padEnd(56) + '║');
        }
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');

        // Check database connection
        const dbOk = await dbHealthCheck();
        console.log(`  ${dbOk ? '✓' : '✗'} Database: ${dbOk ? 'connected' : 'disconnected'}`);

        // Initialize security key
        const secKey = await getSecurityKey();
        console.log(`  ✓ Security: key active (${secKey.slice(0, 8)}...)`);

        // Show auth mode
        if (remote) {
            const pwSet = await isAdminPasswordSet().catch(() => false);
            console.log(`  ${pwSet ? '✓' : '⚠'} Auth: ${pwSet ? 'password set, JWT auth active' : 'NO PASSWORD — set one immediately!'}`);
        } else {
            console.log('  ✓ Auth: localhost handshake (auto)');
        }

        emitActivity('system', 'server_start', `Podbit v${VERSION} started on :${PORT}`, {
            database: dbOk ? 'connected' : 'disconnected',
            tls: tlsEnabled,
            remoteMode: remote,
        });

        // Ensure a default project exists on first-ever startup
        if (dbOk) {
            try {
                const { ensureDefaultProject } = await import('./handlers/projects/default-project.js');
                const created = await ensureDefaultProject();
                if (created) {
                    console.log('  ✓ Default project: created (ideas + questions)');
                }
            } catch (e: any) {
                console.error(`  ✗ Default project check failed: ${e.message}`);
            }
        }

        // Load saved config overrides and model selections from database
        if (dbOk) {
            await loadSavedConfig();
            await loadSavedModels();

            // Restore conversational logging toggle from DB
            try {
                const { systemQueryOne: queryOne } = await import('./db.js');
                const { setConversationalLogging } = await import('./models.js');
                const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, ['llm.conversational_logging']);
                if (row) {
                    const enabled = JSON.parse(row.value);
                    if (enabled) {
                        setConversationalLogging(true);
                        console.log('  ✓ Conversational logging: enabled');
                    }
                }
            } catch { /* non-fatal */ }

            // Load cached endpoint param support discoveries
            try {
                const { loadUnsupportedParamsCache } = await import('./models/providers.js');
                await loadUnsupportedParamsCache();
            } catch { /* non-fatal */ }

            // Hydrate specificity dictionary from previously extracted keywords
            try {
                const { loadLearnedTerms } = await import('./core/specificity.js');
                await loadLearnedTerms();
            } catch { /* non-fatal */ }

            // Persist activity events to database
            try {
                const { query: dbQuery } = await import('./db/index.js');
                onActivity((event) => {
                    dbQuery(
                        `INSERT INTO activity_log (category, type, message, detail, created_at) VALUES ($1, $2, $3, $4, $5)`,
                        [event.category, event.type, event.message, event.detail ? JSON.stringify(event.detail) : null, event.timestamp]
                    ).catch(() => {}); // non-fatal — don't break event emission
                });
                // Prune entries older than 48 hours, check every hour
                const pruneActivityLog = () => {
                    dbQuery(`DELETE FROM activity_log WHERE created_at < datetime('now', '-2 days')`)
                        .then((r: any) => { if (r?.length !== 0) console.log(`[activity] Pruned old log entries`); })
                        .catch(() => {});
                };
                pruneActivityLog(); // run once at startup
                setInterval(pruneActivityLog, 60 * 60 * 1000);
                console.log('  ✓ Activity persistence: enabled (48h retention)');
            } catch { /* non-fatal */ }

            // Cleanup expired refresh tokens periodically
            cleanupExpiredRefreshTokens().catch(() => {});
            setInterval(() => cleanupExpiredRefreshTokens().catch(() => {}), 6 * 60 * 60 * 1000); // every 6 hours

            // Partition health check
            try {
                const health = await checkPartitionHealth();
                if (health.healthy) {
                    console.log('  ✓ Partitions: healthy');
                } else {
                    const issues: string[] = [];
                    if (health.unbridgedPartitions.length > 0) {
                        issues.push(`${health.unbridgedPartitions.length} unbridged (${health.unbridgedPartitions.map(p => p.id).join(', ')})`);
                    }
                    if (health.emptyPartitions.length > 0) {
                        issues.push(`${health.emptyPartitions.length} empty (${health.emptyPartitions.map(p => p.id).join(', ')})`);
                    }
                    if (health.orphanedDomains.length > 0) {
                        issues.push(`${health.orphanedDomains.length} orphaned domains (${health.orphanedDomains.join(', ')})`);
                    }
                    console.log(`  ⚠ Partitions: ${issues.join('; ')}`);
                }
            } catch (e: any) {
                console.log(`  ✗ Partitions: check failed (${e.message})`);
            }

            // Number variable backfill — annotate nodes that missed extraction (one-time, fire-and-forget)
            import('./core/number-variables.js').then(({ backfillNumberVariables }) => {
                backfillNumberVariables().then(result => {
                    if (result.processed > 0) {
                        console.log(`  ✓ Number variables: backfilled ${result.processed} nodes`);
                    }
                }).catch((e: any) => {
                    console.log(`  ✗ Number variable backfill: ${e.message}`);
                });
            }).catch(() => {});

            // Initialize budget control (must be before cycle auto-start)
            try {
                const { initBudgetSystem } = await import('./models/budget.js');
                await initBudgetSystem();
            } catch (e: any) {
                console.log(`  ✗ Budget control: failed (${e.message})`);
            }

            // Auto-start autonomous cycles
            const cycles = [
                { name: 'Validation', enabled: config.autonomousCycles.validation.enabled, start: startValidationCycle },
                { name: 'Questions', enabled: config.autonomousCycles.questions.enabled, start: startQuestionCycle },
                { name: 'Tensions', enabled: config.autonomousCycles.tensions.enabled, start: startTensionCycle },
                { name: 'Research', enabled: config.autonomousCycles.research.enabled, start: startResearchCycle },
                { name: 'Autorating', enabled: config.autonomousCycles.autorating.enabled, start: startAutoratingCycle },
                { name: 'EVM', enabled: config.autonomousCycles.evm.enabled, start: startEvmCycle },
                { name: 'Voicing', enabled: config.autonomousCycles.voicing.enabled, start: startVoicingCycle },
                { name: 'Ground Rules', enabled: config.groundRules.enabled, start: startGroundRulesCycle },
                { name: 'Population Control', enabled: config.populationControl.enabled, start: startPopulationControlCycle },
            ];
            for (const cycle of cycles) {
                if (cycle.enabled) {
                    try {
                        await cycle.start();
                        console.log(`  ✓ ${cycle.name} cycle: started`);
                    } catch (e: any) {
                        console.log(`  ✗ ${cycle.name} cycle: failed (${e.message})`);
                    }
                } else {
                    console.log(`  - ${cycle.name} cycle: disabled`);
                }
            }

            // EVM queue — recover stuck entries and start background worker
            try {
                const { recoverStuck } = await import('./evm/queue.js');
                const recovered = await recoverStuck();
                if (recovered > 0) console.log(`  ✓ EVM queue: recovered ${recovered} stuck entries`);

                const { startQueueWorker } = await import('./evm/queue-worker.js');
                startQueueWorker();
                console.log('  ✓ EVM queue worker: started');
            } catch (e: any) {
                console.log(`  ✗ EVM queue worker: failed (${e.message})`);
            }

            // Lab resource lock — register cycle pause/resume callbacks
            try {
                const { registerCycleControl } = await import('./lab/resource-lock.js');
                const { pauseAllCycles, resumeAllCycles } = await import('./core/synthesis-engine-state.js');
                registerCycleControl(pauseAllCycles, resumeAllCycles);
                console.log('  ✓ Lab resource lock: registered');
            } catch (e: any) {
                console.log(`  ✗ Lab resource lock: failed (${e.message})`);
            }

            // Lab health checker
            try {
                const { startLabHealthChecker } = await import('./lab/health.js');
                startLabHealthChecker(config.lab.healthCheckIntervalMs);
                console.log('  ✓ Lab health checker: started');
            } catch (e: any) {
                console.log(`  ✗ Lab health checker: failed (${e.message})`);
            }

            // Ensure subsystems exist for all local labs (backfill for labs created before this feature)
            try {
                const { listLabs } = await import('./lab/registry.js');
                const { systemQuery } = await import('./db/sqlite-backend.js');
                const { loadAssignmentCache } = await import('./models/assignments.js');
                const labs = await listLabs();
                let created = 0;
                for (const lab of labs) {
                    try {
                        const host = new URL(lab.url).hostname.toLowerCase();
                        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
                        if (!isLocal) continue;
                        const sub = `lab:${lab.id}`;
                        const existing = await systemQuery('SELECT subsystem FROM subsystem_assignments WHERE subsystem = $1', [sub]);
                        if ((existing as any[]).length > 0) continue;
                        await systemQuery(`INSERT INTO subsystem_assignments (subsystem, model_id, updated_at) VALUES ($1, NULL, datetime('now'))`, [sub]);
                        created++;
                    } catch { /* per-lab, non-fatal */ }
                }
                if (created > 0) {
                    await loadAssignmentCache();
                    console.log(`  ✓ Lab subsystems: created ${created} new subsystem(s)`);
                }
            } catch (e: any) {
                console.log(`  ✗ Lab subsystems: failed (${e.message})`);
            }

            // Elite pool — scan existing verified nodes for promotion (background, non-blocking)
            if (config.elitePool?.enabled) {
                console.log(`  ⏳ Elite Pool: backfill scan starting (background)`);
                import('./core/elite-pool.js').then(({ scanExistingVerified }) => {
                    scanExistingVerified().then(result => {
                        if (result.promoted > 0) {
                            console.log(`  ✓ Elite Pool: promoted ${result.promoted} verified node(s) (${result.skipped} skipped)`);
                        } else {
                            console.log(`  - Elite Pool: no nodes to promote (${result.skipped} skipped)`);
                        }
                    }).catch((e: any) => {
                        console.log(`  ✗ Elite Pool: backfill failed (${e.message})`);
                    });
                });
            }

            // Recover any KB files stuck in 'processing' from a previous crash/restart
            if (config.knowledgeBase?.enabled) {
                try {
                    const { processingPipeline } = await import('./kb/pipeline.js');
                    const recovered = await processingPipeline.recoverStuckFiles();
                    if (recovered > 0) console.log(`  ✓ Knowledge Base: recovered ${recovered} stuck file(s)`);
                    // Backfill filename keywords for nodes ingested before this feature
                    await processingPipeline.backfillFilenameKeywords();
                    // Re-queue any pending/error files into the in-memory pipeline
                    const requeued = await processingPipeline.requeuePendingFiles();
                    if (requeued > 0) console.log(`  ✓ Knowledge Base: re-queued ${requeued} pending file(s)`);
                } catch { /* non-fatal */ }
            }

            // Auto-start KB watchers for all folders with watch_enabled = 1
            if (config.knowledgeBase?.enabled) {
                try {
                    const { startAllWatchers } = await import('./kb/watcher.js');
                    const started = await startAllWatchers();
                    console.log(`  ${started > 0 ? '✓' : '-'} Knowledge Base: ${started} watcher(s) started`);
                } catch (e: any) {
                    console.log(`  ✗ Knowledge Base watchers: failed (${e.message})`);
                }
            }

            // Pool integration: activate pending recruitments and start return check
            if (config.partitionServer.enabled) {
                try {
                    const { checkAndActivateRecruitments, startPoolReturnCheck } = await import('./core/pool-integration.js');
                    const activated = await checkAndActivateRecruitments();
                    if (activated > 0) {
                        console.log(`  ✓ Pool: activated ${activated} pending recruitment(s)`);
                    } else {
                        console.log(`  - Pool: no pending recruitments`);
                    }
                    startPoolReturnCheck();
                } catch (e: any) {
                    console.log(`  - Pool: ${e.message}`);
                }
            }
        }
        console.log('');
    });
}

export default app;
