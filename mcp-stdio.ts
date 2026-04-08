#!/usr/bin/env node
/**
 * MCP server over stdio transport for direct IDE/agent integration.
 *
 * Communicates with LLM IDE agents (e.g. Cursor, VS Code Copilot) via
 * JSON-RPC over stdin/stdout. An EPIPE guard at the top of the file
 * detects broken pipes (IDE disconnect) and suppresses all further writes
 * to prevent crash loops. Console output is intercepted by the logger so
 * diagnostic messages go to disk without corrupting the MCP protocol stream.
 *
 * On startup, loads persisted config/models from the database, connects the
 * MCP stdio transport, then asynchronously ensures the orchestrator (and
 * thus API server + GUI) is running. Graceful shutdown is handled via
 * transport close detection, stdin EOF, and EPIPE guards with a 5-second
 * delayed exit to avoid rapid IDE respawn loops.
 *
 * Usage: `node mcp-stdio.js` or configure in IDE MCP settings / `.mcp.json`.
 *
 * @module mcp-stdio
 */

// ---------------------------------------------------------------------------
// EPIPE GUARD — must be FIRST, before any import that writes to stdout/stderr.
// ---------------------------------------------------------------------------
// EPIPE = client (IDE) disconnected the stdio pipe.  Once detected, we
// suppress ALL further writes and exceptions.  We do NOT process.exit()
// because the IDE would just respawn us into the same broken pipe.
let _epipeDetected = false;

/**
 * Detect whether an error is an EPIPE (broken pipe) condition.
 * Checks error code, errno, and message for EPIPE indicators.
 * @param err - The error object to inspect
 * @returns True if the error represents an EPIPE condition
 */
function _isEpipe(err: any): boolean {
    if (!err) return false;
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return true;
    if (err.errno === -4047) return true;
    if (err.message?.includes('EPIPE')) return true;
    return false;
}

/**
 * Handle EPIPE detection by suppressing all further writes and scheduling
 * a delayed exit. The 5-second delay prevents rapid respawn loops where
 * the IDE spawns a new process immediately after the old one exits.
 */
function _epipeGuard(): void {
    if (_epipeDetected) return;
    _epipeDetected = true;
    // Exit after 5s delay.  Immediate exit causes rapid respawn loops
    // (IDE spawns → EPIPE → exit → IDE spawns again).  A short delay lets
    // the IDE settle.  Previous 30s + .unref() meant the timer could never
    // fire if the event loop had no other refs, or the process hung for 30s
    // with a broken pipe — either way, zombies accumulated.
    setTimeout(() => process.exit(0), RC.timeouts.epipeExitDelayMs);
}

process.stdout?.on('error', (err: any) => { if (_isEpipe(err)) _epipeGuard(); });
process.stderr?.on('error', (err: any) => { if (_isEpipe(err)) _epipeGuard(); });
// ---------------------------------------------------------------------------

// Intercept console to also write to log files on disk.
// Original stdout/stderr behavior is preserved — MCP protocol still works.
import { interceptConsole } from './utils/logger.js';
interceptConsole();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Mark this process as an MCP stdio server BEFORE any imports that
// register signal handlers (db.js).  This prevents process.exit()
// calls from killing the server unexpectedly.
process.env.MCP_STDIO_SERVER = '1';

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn as cpSpawn, exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { loadSavedConfig } from './config.js';
import { loadSavedModels } from './models.js';
import { RC } from './config/constants.js';

import { tools } from './mcp-server.js';
import { handleToolCall } from './mcp/dispatch.js';

// Create MCP server
const server = new Server(
    {
        name: 'podbit',
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        })),
    };
});

// Cross-process activity forwarding is handled by event-bus.ts
// (detects MCP_STDIO_SERVER=1 and auto-forwards to HTTP server).

/**
 * JSON replacer for MCP responses. Strips fields that are only needed by
 * the GUI (e.g. base64 SVG avatar URLs which are 3-5KB each).
 * @param key - JSON key being serialized
 * @param value - Value to potentially filter
 * @returns The value or undefined to omit the key
 */
function mcpReplacer(key: string, value: any): any {
    if (key === 'avatarUrl') return undefined; // base64 SVG avatars (~3-5KB each)
    return value;
}

const MAX_MCP_RESPONSE = 80_000;
const CONTENT_TRUNCATE_LEN = 100;

/**
 * Intelligently compact a large response to fit within MCP size limits.
 * Instead of slicing JSON strings (which produces invalid JSON), this:
 * 1. Strips heavy metadata fields from nodes (lifecycle, validation, provenance, metadata)
 * 2. Truncates node content to {@link CONTENT_TRUNCATE_LEN} chars
 * 3. Progressively reduces array sizes (keeping at least 5 items) if still too large
 * @param result - The original response object to compact
 * @returns Object with the compacted result and a human-readable warning message
 */
function compactResponse(result: any): { compacted: any; warning: string } {
    const r = structuredClone(result);

    // Identify the main array to compact
    const arrayKey = ['nodes', 'tensions', 'clusters', 'results', 'discoveries', 'partitions', 'history', 'potentiallySuperseded', 'sources']
        .find(k => Array.isArray(r[k]));

    if (!arrayKey) {
        // No known array — strip to top-level keys summary
        return {
            compacted: { warning: 'Response too large, showing keys only', keys: Object.keys(r) },
            warning: `Response exceeded ${MAX_MCP_RESPONSE} chars`,
        };
    }

    const arr = r[arrayKey];
    const originalCount = arr.length;

    // Phase 1: Strip heavy per-node fields and truncate content
    for (const item of arr) {
        compactNode(item);
        // Handle nested nodes in tensions/clusters
        if (item.nodeA) compactNode(item.nodeA);
        if (item.nodeB) compactNode(item.nodeB);
        if (item.keptNode) compactNode(item.keptNode);
        if (Array.isArray(item.archivedNodes)) {
            for (const an of item.archivedNodes) compactNode(an);
        }
    }

    let serialized = JSON.stringify(r, mcpReplacer, 2);

    // Phase 2: If still too large, progressively reduce array size
    while (serialized.length > MAX_MCP_RESPONSE && arr.length > 5) {
        const removed = arr.length - Math.max(Math.floor(arr.length * 0.6), 5);
        arr.splice(Math.floor(arr.length * 0.6));
        r[`${arrayKey}Omitted`] = (r[`${arrayKey}Omitted`] || 0) + removed;
        if (r.count !== undefined) r.count = arr.length;
        serialized = JSON.stringify(r, mcpReplacer, 2);
    }

    const warning = arr.length < originalCount
        ? `Response compacted: ${originalCount - arr.length} items omitted, metadata stripped`
        : 'Response compacted: metadata stripped to fit size limit';

    return { compacted: r, warning };
}

/**
 * Strip heavy metadata fields from a node-like object and truncate content.
 * Modifies the object in place. Removes lifecycle, validation, provenance,
 * metadata, avatarUrl, and embedding fields.
 * @param node - Node object to compact (modified in place)
 */
function compactNode(node: any): void {
    if (!node || typeof node !== 'object') return;
    // Truncate content
    if (typeof node.content === 'string' && node.content.length > CONTENT_TRUNCATE_LEN) {
        node.content = node.content.slice(0, CONTENT_TRUNCATE_LEN) + '…';
    }
    // Strip heavy fields that aren't essential for MCP consumers
    delete node.lifecycle;
    delete node.validation;
    delete node.provenance;
    delete node.metadata;
    delete node.avatarUrl;
    delete node.embedding;
}

// Handle tool calls — all calls go through handleToolCall which proxies
// to the HTTP server (single source of truth) when running as MCP stdio.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        const result = await handleToolCall(name, args || {});

        // Serialize with replacer that strips GUI-only fields (avatarUrl = ~3-5KB base64 SVG per node)
        let serialized = JSON.stringify(result, mcpReplacer, 2);

        // If response exceeds limit, intelligently compact instead of slicing JSON
        if (serialized.length > MAX_MCP_RESPONSE) {
            const { compacted, warning } = compactResponse(result);
            compacted._compacted = warning;
            serialized = JSON.stringify(compacted, mcpReplacer, 2);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: serialized,
                },
            ],
        };
    } catch (err: any) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ error: err.message }),
                },
            ],
            isError: true,
        };
    }
});

// Catch any EPIPE that escapes the stream-level guard (e.g. from async writes).
// Uses the same _epipeGuard from the top of this file — go silent, don't exit.
process.on('unhandledRejection', (reason: any) => {
    if (_epipeDetected) return;
    if (_isEpipe(reason)) return _epipeGuard();
    try { console.error('MCP server unhandled rejection:', reason); } catch {}
});

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (_epipeDetected) return;
    if (_isEpipe(err)) return _epipeGuard();
    try { console.error('MCP server uncaught exception:', err); } catch {}
});

// =============================================================================
// AUTO-START ORCHESTRATOR
// =============================================================================

/**
 * Ensure the orchestrator is running. Probes the configured port for an
 * existing orchestrator, and if not found, spawns one as a detached process.
 * On Windows, opens a visible console window for the orchestrator.
 * Polls for health with a 30-second timeout.
 */
async function ensureOrchestratorRunning(): Promise<void> {
    const host = process.env.HOST || 'localhost';
    const { PORTS } = await import('./config/ports.js');
    const port = String(PORTS.orchestrator);

    // When bound to a remote address, the orchestrator health endpoint may not
    // be reachable via localhost.  Always probe via 127.0.0.1 first (the
    // orchestrator listens on 0.0.0.0 which includes localhost), then fall
    // back to the configured host.
    const probeHosts = host === '0.0.0.0' ? ['127.0.0.1'] : [host];
    let orchestratorUrl = `http://${probeHosts[0]}:${port}`;

    // Check if already running
    for (const h of probeHosts) {
        try {
            const url = `http://${h}:${port}/health`;
            const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (response.ok) {
                orchestratorUrl = `http://${h}:${port}`;
                console.error('[mcp] Orchestrator already running');
                return;
            }
        } catch {
            // Not running on this host — try next or proceed to spawn
        }
    }

    // Skip auto-start if explicitly disabled (e.g. remote server manages its own orchestrator)
    if (process.env.PODBIT_NO_AUTO_ORCHESTRATOR === '1') {
        console.error('[mcp] Orchestrator auto-start disabled (PODBIT_NO_AUTO_ORCHESTRATOR=1)');
        console.error('[mcp] MCP tools that require the synthesis engine will not work until the orchestrator is started separately.');
        return;
    }

    // Spawn orchestrator as detached process
    // CRITICAL: stdio must NOT inherit from MCP process — that would corrupt the stdio stream
    // Strip MCP_STDIO_SERVER so child processes don't think they're the MCP server
    // (otherwise event-bus.ts would forward events back to the HTTP server in a loop)
    console.error('[mcp] Starting orchestrator...');
    const { MCP_STDIO_SERVER: _, ...cleanEnv } = process.env;

    // Use npx tsx to run the orchestrator — Node 22 changed the loader API,
    // so raw --require/--loader flags no longer work reliably.
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const tsxArgs = ['tsx', 'orchestrator.ts'];

    let proc;
    try {
        if (process.platform === 'win32') {
            // Windows: use 'start' to open a visible console window for the orchestrator.
            // This keeps MCP stdio clean (new window has its own stdin/stdout) while
            // giving the user a console to monitor server output.
            // NOTE: 'start' treats the first quoted arg as the window title.
            // '""' is the empty title — without it, 'start' misparses the command.
            proc = cpSpawn('cmd', ['/c', 'start', '""', npxCmd, ...tsxArgs], {
                cwd: __dirname,
                stdio: 'ignore',
                detached: true,
                shell: false,
                env: cleanEnv,
            });
        } else {
            proc = cpSpawn(npxCmd, tsxArgs, {
                cwd: __dirname,
                stdio: 'ignore',
                detached: true,
                shell: false,
                env: cleanEnv,
            });
        }
        proc.unref();
    } catch (spawnErr: any) {
        console.error(`[mcp] Failed to spawn orchestrator: ${spawnErr.message}`);
        console.error('[mcp] MCP server will continue without orchestrator. Start it separately with: npm run orchestrate');
        return;
    }

    // Listen for immediate spawn failures (e.g. port in use, missing deps)
    proc.on('error', (err: any) => {
        console.error(`[mcp] Orchestrator process error: ${err.message}`);
    });

    // Poll for health with timeout
    const maxWaitMs = 30000;
    const pollIntervalMs = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        try {
            const response = await fetch(`${orchestratorUrl}/health`, {
                signal: AbortSignal.timeout(2000),
            });
            if (response.ok) {
                console.error('[mcp] Orchestrator is healthy');
                return;
            }
        } catch {
            // Still starting up
        }
    }

    console.error('[mcp] Warning: Orchestrator did not become healthy within 30s');
    console.error('[mcp] MCP server will continue without orchestrator. Tools that need it may fail.');
    console.error('[mcp] To start manually: npm run orchestrate');
}

/**
 * Open the GUI in the default browser if not disabled via
 * `PODBIT_AUTO_OPEN_BROWSER=false` environment variable.
 */
async function maybeOpenBrowser(): Promise<void> {
    if (process.env.PODBIT_AUTO_OPEN_BROWSER === 'false') return;

    const { PORTS } = await import('./config/ports.js');
    const guiPort = String(PORTS.gui);
    const host = process.env.HOST || 'localhost';
    const url = `http://${host}:${guiPort}`;

    try {
        const cmd = process.platform === 'win32' ? `start "" "${url}"` :
                    process.platform === 'darwin' ? `open "${url}"` :
                    `xdg-open "${url}"`;
        exec(cmd);
        console.error(`[mcp] Opened browser to ${url}`);
    } catch {
        console.error(`[mcp] GUI available at ${url}`);
    }
}

// =============================================================================
// STARTUP
// =============================================================================

/**
 * MCP stdio server main entry point. Loads saved config and models,
 * connects the MCP stdio transport, then asynchronously ensures the
 * orchestrator is running and optionally opens the browser.
 */
async function main() {
    console.error('[mcp-stdio] Starting Podbit MCP server...');

    // Load persisted config overrides and model assignments from database
    // This must happen before MCP handlers execute, so tuning changes survive restarts
    try {
        await loadSavedConfig();
        await loadSavedModels();
        console.error('[mcp-stdio] Loaded saved config and models from database');
    } catch (err: any) {
        console.error('[mcp-stdio] Config/model load warning (non-critical):', err.message);
    }

    // Start MCP stdio transport FIRST - this is critical for Cursor to recognize the server
    const transport = new StdioServerTransport();

    // Detect IDE disconnect via transport close (stdin EOF).
    // Without this, the process hangs forever as a zombie — EPIPE only triggers
    // on writes, and if the process isn't writing when the IDE disconnects,
    // it never detects the broken pipe.
    transport.onclose = () => {
        try { console.error('[mcp-stdio] Transport closed (IDE disconnected). Exiting in 5s...'); } catch {}
        setTimeout(() => process.exit(0), 5000).unref();
    };
    transport.onerror = (err: Error) => {
        if (_isEpipe(err)) return _epipeGuard();
        try { console.error('[mcp-stdio] Transport error:', err.message); } catch {}
    };

    // Belt-and-suspenders: also listen for stdin close directly.
    // If the MCP SDK swallows the close event, this catches it.
    process.stdin.on('close', () => {
        if (_epipeDetected) return;
        try { console.error('[mcp-stdio] stdin closed. Exiting in 5s...'); } catch {}
        setTimeout(() => process.exit(0), 5000).unref();
    });

    await server.connect(transport);
    console.error('[mcp-stdio] MCP transport connected');

    // Then ensure orchestrator (and thus API server + GUI) is running in background
    // Don't await this - let it run asynchronously so it doesn't block MCP initialization
    ensureOrchestratorRunning()
        .then(() => maybeOpenBrowser())
        .catch(err => console.error('[mcp-stdio] Orchestrator startup warning:', err.message));

    console.error('[mcp-stdio] Podbit MCP server ready');
}

main().catch((err) => {
    console.error('MCP server error:', err);
    process.exit(1);
});
