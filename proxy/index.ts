/**
 * @module proxy
 *
 * OpenAI-compatible knowledge proxy server. Intercepts chat completion requests,
 * enriches them with relevant knowledge from the Podbit graph, and forwards to
 * the resolved upstream model. Supports model resolution (proxy assignment,
 * client-requested, chat assignment, first-enabled), session tracking, telegraphic
 * compression, tool calling injection, budget enforcement, and SSE streaming
 * conversion.
 *
 * Entry points:
 * - GET  /health               - Health check with DB status and uptime
 * - GET  /v1/models            - List enabled models (OpenAI-compatible)
 * - POST /v1/chat/completions  - Chat completions with knowledge injection
 * - POST /api/shutdown         - Graceful shutdown
 */
import { interceptConsole } from '../utils/logger.js';
interceptConsole();

import express from 'express';
import cors from 'cors';
import { RC } from '../config/constants.js';
import { config, loadSavedConfig, VERSION } from '../config.js';
import { healthCheck as dbHealthCheck } from '../db.js';
import {
    getRegisteredModels,
    loadSavedModels,
} from '../models.js';
import { getModelProvider } from '../models/types.js';
import { proxySettings, ensureProxySettings } from './knowledge.js';
import { registerCompletionsHandler } from './handler.js';
import { validateKey, verifyAccessToken, isRemoteMode, } from '../core/security.js';

export { resolveModel, registeredToModelEntry, profileFromContextSize, estimateTokens, PROFILE_CONTEXT_WINDOWS, resolveSessionId } from './model-resolution.js';
export type { ResolvedModel } from './model-resolution.js';
export { injectKnowledge, ensureProxySettings, proxySettings } from './knowledge.js';

const app = express();

// Stats
const proxyStats = {
    startedAt: new Date().toISOString(),
    requestCount: 0,
    enrichedCount: 0,
    errorCount: 0,
};

// Middleware
app.use(cors());
app.use(express.json({ limit: RC.contentLimits.expressBodySizeLimit }));

// Request counting
app.use((_req, _res, next) => {
    proxyStats.requestCount++;
    next();
});

// Request logging (skip noisy health checks)
app.use((req, res, next) => {
    if (req.path === '/health') return next();
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[proxy] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// =============================================================================
// PROXY AUTH MIDDLEWARE (for remote mode)
// =============================================================================

/**
 * Authentication middleware for network-accessible proxy mode.
 *
 * Accepts three credential formats:
 * - `Authorization: Bearer <security-key>` (OpenAI-compatible API key pattern)
 * - `Authorization: Bearer <jwt-access-token>` (JWT from auth flow)
 * - `X-Podbit-Key: <security-key>` (custom header)
 *
 * Exempt from auth: health check endpoint (`/health`) and localhost requests.
 * When proxy is bound to localhost (not remote mode), all requests pass without auth.
 *
 * @param req - Express request
 * @param res - Express response (401 on auth failure)
 * @param next - Express next function
 */
async function proxyAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
    // Health check is always exempt
    if (req.path === '/health') { next(); return; }

    // If proxy is bound to localhost, no auth needed
    if (!isRemoteMode()) { next(); return; }

    // Check localhost source IP — allow without auth
    const ip = req.ip || req.socket.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        next();
        return;
    }

    // Try Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);

        // Try as JWT first
        const jwt = await verifyAccessToken(token);
        if (jwt) { next(); return; }

        // Try as security key
        const keyValid = await validateKey(token);
        if (keyValid) { next(); return; }
    }

    // Try X-Podbit-Key header
    const podbitKey = req.headers['x-podbit-key'] as string | undefined;
    if (podbitKey) {
        const keyValid = await validateKey(podbitKey);
        if (keyValid) { next(); return; }
    }

    res.status(401).json({
        error: {
            message: 'Authentication required. Use the Podbit security key as your API key.',
            type: 'authentication_error',
        },
    });
}

app.use(proxyAuth);

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (_req, res) => {
    const dbOk = await dbHealthCheck();
    const uptimeSeconds = Math.floor((Date.now() - new Date(proxyStats.startedAt).getTime()) / 1000);
    res.json({
        status: dbOk ? 'healthy' : 'degraded',
        version: VERSION,
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
        requests: proxyStats.requestCount,
        enriched: proxyStats.enrichedCount,
        errors: proxyStats.errorCount,
    });
});

// =============================================================================
// LIST MODELS — GET /v1/models
// =============================================================================

app.get('/v1/models', async (_req, res) => {
    try {
        const models = await getRegisteredModels();
        const reserve = proxySettings.knowledgeReserve;
        res.json({
            object: 'list',
            data: models
                .filter(m => m.enabled)
                .map(m => {
                    const entry: any = {
                        id: m.modelId,
                        object: 'model',
                        created: Math.floor(Date.now() / 1000),
                        owned_by: getModelProvider(m.modelId),
                    };
                    // Report reduced context size so clients leave room for knowledge injection
                    if (m.contextSize) {
                        entry.context_length = Math.floor(m.contextSize * (1 - reserve));
                    }
                    return entry;
                }),
        });
    } catch (err: any) {
        console.error('[proxy] Failed to list models:', err.message);
        res.status(500).json({ error: { message: 'Failed to list models', type: 'server_error' } });
    }
});

// =============================================================================
// CHAT COMPLETIONS
// =============================================================================

registerCompletionsHandler(app, proxyStats);

// =============================================================================
// ERROR HANDLER
// =============================================================================

app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[proxy] Error:', err.message);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal server error',
            type: 'server_error',
        },
    });
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

let proxyShuttingDown = false;

/**
 * Perform graceful shutdown: close the database and exit.
 *
 * Idempotent: subsequent calls after the first are no-ops. Called on
 * SIGINT, SIGTERM signals, or via the POST /api/shutdown endpoint.
 *
 * @param signal - Optional signal name for logging (e.g., 'SIGINT', 'API')
 */
async function gracefulProxyShutdown(signal?: string): Promise<void> {
    if (proxyShuttingDown) return;
    proxyShuttingDown = true;
    console.log(`[proxy] ${signal ? `[${signal}] ` : ''}Shutdown initiated...`);
    try {
        const { close } = await import('../db/index.js');
        await close();
        console.log('[proxy] Database closed');
    } catch { /* already closed */ }
    process.exit(0);
}

app.post('/api/shutdown', async (_req, res) => {
    res.json({ message: 'Proxy shutdown initiated' });
    setTimeout(() => gracefulProxyShutdown('API'), 100);
});

process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
process.on('SIGINT', () => gracefulProxyShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulProxyShutdown('SIGTERM'));

// =============================================================================
// START SERVER
// =============================================================================

const PORT = config.proxy.port;
const HOST = config.server.host;

app.listen(PORT, async () => {
    console.log('');
    console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
    console.log(`\u2551         PODBIT v${VERSION} - KNOWLEDGE PROXY`.padEnd(56) + '\u2551');
    console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
    console.log(`\u2551  Proxy running on http://${HOST}:${PORT}`.padEnd(56) + '\u2551');
    console.log(`\u2551  OpenAI-compatible: POST /v1/chat/completions`.padEnd(56) + '\u2551');
    console.log(`\u2551  Models: GET /v1/models`.padEnd(56) + '\u2551');
    if (isRemoteMode()) {
        console.log(`\u2551  Auth: REQUIRED (security key or JWT)`.padEnd(56) + '\u2551');
    }
    console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
    console.log('');

    // Initialize database + models
    const dbOk = await dbHealthCheck();
    console.log(`  ${dbOk ? '\u2713' : '\u2717'} Database: ${dbOk ? 'connected' : 'disconnected'}`);

    if (dbOk) {
        await loadSavedConfig();
        await loadSavedModels();
        await ensureProxySettings();
        const models = await getRegisteredModels();
        const enabled = models.filter(m => m.enabled);
        console.log(`  \u2713 Models: ${enabled.length} enabled in registry`);
    }
    console.log('');
});
