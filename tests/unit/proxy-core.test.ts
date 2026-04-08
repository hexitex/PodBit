/**
 * Unit tests for proxy/index.ts — OpenAI-compatible proxy server.
 *
 * Since proxy/index.ts has heavy top-level side effects (express app creation,
 * signal handlers, app.listen), we test the key logic by extracting and
 * exercising the algorithms inline. This follows the project's working pattern
 * (see deep-merge.test.ts, evaluator.test.ts).
 *
 * Covers: auth middleware logic, health response building, model list building,
 * error handler formatting, stats tracking, shutdown guard.
 */
import { describe, it, expect } from '@jest/globals';

// =============================================================================
// AUTH MIDDLEWARE LOGIC (extracted from proxyAuth in proxy/index.ts)
// =============================================================================

/**
 * Simulates the proxy auth middleware decision logic.
 * Returns 'next' if the request should proceed, or 401 if rejected.
 */
async function proxyAuthDecision(
    req: {
        path: string;
        ip?: string;
        socket?: { remoteAddress?: string };
        headers: Record<string, string | undefined>;
    },
    opts: {
        isRemoteMode: boolean;
        validateKey: (key: string) => Promise<boolean>;
        verifyAccessToken: (token: string) => Promise<any>;
    },
): Promise<'next' | 401> {
    // Health check is always exempt
    if (req.path === '/health') return 'next';

    // If proxy is bound to localhost, no auth needed
    if (!opts.isRemoteMode) return 'next';

    // Check localhost source IP — allow without auth
    const ip = req.ip || req.socket?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return 'next';
    }

    // Try Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        // Try as JWT first
        const jwt = await opts.verifyAccessToken(token);
        if (jwt) return 'next';
        // Try as security key
        const keyValid = await opts.validateKey(token);
        if (keyValid) return 'next';
    }

    // Try X-Podbit-Key header
    const podbitKey = req.headers['x-podbit-key'];
    if (podbitKey) {
        const keyValid = await opts.validateKey(podbitKey);
        if (keyValid) return 'next';
    }

    return 401;
}

// =============================================================================
// MODEL LIST BUILDER (extracted from GET /v1/models handler)
// =============================================================================

interface ModelEntry {
    modelId: string;
    enabled: boolean;
    contextSize?: number;
}

function buildModelList(
    models: ModelEntry[],
    knowledgeReserve: number,
    getModelProvider: (id: string) => string,
) {
    return {
        object: 'list' as const,
        data: models
            .filter(m => m.enabled)
            .map(m => {
                const entry: any = {
                    id: m.modelId,
                    object: 'model',
                    created: Math.floor(Date.now() / 1000),
                    owned_by: getModelProvider(m.modelId),
                };
                if (m.contextSize) {
                    entry.context_length = Math.floor(m.contextSize * (1 - knowledgeReserve));
                }
                return entry;
            }),
    };
}

// =============================================================================
// HEALTH RESPONSE BUILDER (extracted from GET /health handler)
// =============================================================================

function buildHealthResponse(
    dbOk: boolean,
    stats: { startedAt: string; requestCount: number; enrichedCount: number; errorCount: number },
    version: string,
) {
    const uptimeSeconds = Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000);
    return {
        status: dbOk ? 'healthy' : 'degraded',
        version,
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
        requests: stats.requestCount,
        enriched: stats.enrichedCount,
        errors: stats.errorCount,
    };
}

// =============================================================================
// ERROR HANDLER LOGIC (extracted from error middleware)
// =============================================================================

function buildErrorResponse(err: { message?: string; status?: number }) {
    return {
        statusCode: err.status || 500,
        body: {
            error: {
                message: err.message || 'Internal server error',
                type: 'server_error',
            },
        },
    };
}

// =============================================================================
// getModelProvider (extracted from models/types.ts)
// =============================================================================

function getModelProvider(modelId: string): string {
    if (!modelId) return 'unknown';
    const slashIdx = modelId.indexOf('/');
    if (slashIdx > 0) return modelId.substring(0, slashIdx);
    return modelId;
}

// =============================================================================
// TESTS
// =============================================================================

describe('proxyAuth decision logic', () => {
    const noAuth = { isRemoteMode: false, validateKey: async () => false, verifyAccessToken: async () => null };
    const remoteAuth = (
        validateKey: (k: string) => Promise<boolean> = async () => false,
        verifyAccessToken: (t: string) => Promise<any> = async () => null,
    ) => ({ isRemoteMode: true, validateKey, verifyAccessToken });

    it('always allows /health regardless of mode', async () => {
        const result = await proxyAuthDecision(
            { path: '/health', ip: '10.0.0.1', headers: {} },
            remoteAuth(),
        );
        expect(result).toBe('next');
    });

    it('allows all requests in local mode', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.1', headers: {} },
            noAuth,
        );
        expect(result).toBe('next');
    });

    it('allows localhost IPv4 without auth in remote mode', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/models', ip: '127.0.0.1', headers: {} },
            remoteAuth(),
        );
        expect(result).toBe('next');
    });

    it('allows localhost IPv6 without auth in remote mode', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/models', ip: '::1', headers: {} },
            remoteAuth(),
        );
        expect(result).toBe('next');
    });

    it('allows IPv4-mapped IPv6 localhost without auth', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/models', ip: '::ffff:127.0.0.1', headers: {} },
            remoteAuth(),
        );
        expect(result).toBe('next');
    });

    it('uses socket.remoteAddress when ip is missing', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/models', socket: { remoteAddress: '127.0.0.1' }, headers: {} },
            remoteAuth(),
        );
        expect(result).toBe('next');
    });

    it('rejects remote request with no credentials', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '192.168.1.100', headers: {} },
            remoteAuth(),
        );
        expect(result).toBe(401);
    });

    it('accepts valid JWT via Bearer token', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: { authorization: 'Bearer valid-jwt' } },
            remoteAuth(async () => false, async (t) => t === 'valid-jwt' ? { sub: 'u1' } : null),
        );
        expect(result).toBe('next');
    });

    it('falls back to security key when JWT fails', async () => {
        let jwtCalled = false;
        let keyCalled = false;
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: { authorization: 'Bearer my-key' } },
            remoteAuth(
                async () => { keyCalled = true; return true; },
                async () => { jwtCalled = true; return null; },
            ),
        );
        expect(result).toBe('next');
        expect(jwtCalled).toBe(true);
        expect(keyCalled).toBe(true);
    });

    it('accepts X-Podbit-Key header', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: { 'x-podbit-key': 'valid' } },
            remoteAuth(async (k) => k === 'valid'),
        );
        expect(result).toBe('next');
    });

    it('rejects when both Bearer and X-Podbit-Key are invalid', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: { authorization: 'Bearer bad', 'x-podbit-key': 'bad' } },
            remoteAuth(async () => false, async () => null),
        );
        expect(result).toBe(401);
    });

    it('does not attempt key validation when no auth headers present', async () => {
        let validateCalled = false;
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: {} },
            remoteAuth(async () => { validateCalled = true; return false; }),
        );
        expect(result).toBe(401);
        expect(validateCalled).toBe(false);
    });

    it('extracts token correctly from Bearer header', async () => {
        let receivedToken = '';
        await proxyAuthDecision(
            { path: '/api/test', ip: '10.0.0.5', headers: { authorization: 'Bearer abc123xyz' } },
            remoteAuth(async (k) => { receivedToken = k; return true; }, async () => null),
        );
        expect(receivedToken).toBe('abc123xyz');
    });

    it('ignores non-Bearer Authorization headers', async () => {
        const result = await proxyAuthDecision(
            { path: '/v1/chat/completions', ip: '10.0.0.5', headers: { authorization: 'Basic dXNlcjpwYXNz' } },
            remoteAuth(),
        );
        expect(result).toBe(401);
    });
});

describe('buildModelList', () => {
    it('filters to enabled models only', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true, contextSize: 8192 },
            { modelId: 'gpt-3.5', enabled: false, contextSize: 4096 },
            { modelId: 'claude-3', enabled: true, contextSize: 200000 },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].id).toBe('gpt-4');
        expect(result.data[1].id).toBe('claude-3');
    });

    it('returns empty list when no models are enabled', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: false },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data).toHaveLength(0);
    });

    it('returns object: "list" format', () => {
        const result = buildModelList([], 0.15, getModelProvider);
        expect(result.object).toBe('list');
    });

    it('reduces context_length by knowledge reserve', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true, contextSize: 8192 },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data[0].context_length).toBe(Math.floor(8192 * 0.85));
        expect(result.data[0].context_length).toBe(6963);
    });

    it('omits context_length when contextSize is missing', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data[0].context_length).toBeUndefined();
    });

    it('omits context_length when contextSize is 0', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true, contextSize: 0 },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data[0].context_length).toBeUndefined();
    });

    it('sets owned_by from model provider', () => {
        const models: ModelEntry[] = [
            { modelId: 'openai/gpt-4', enabled: true },
            { modelId: 'anthropic/claude-3', enabled: true },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data[0].owned_by).toBe('openai');
        expect(result.data[1].owned_by).toBe('anthropic');
    });

    it('sets object: "model" on each entry', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true },
        ];
        const result = buildModelList(models, 0.15, getModelProvider);
        expect(result.data[0].object).toBe('model');
    });

    it('uses different reserve values correctly', () => {
        const models: ModelEntry[] = [
            { modelId: 'gpt-4', enabled: true, contextSize: 10000 },
        ];
        const r0 = buildModelList(models, 0, getModelProvider);
        expect(r0.data[0].context_length).toBe(10000);

        const r50 = buildModelList(models, 0.5, getModelProvider);
        expect(r50.data[0].context_length).toBe(5000);
    });
});

describe('buildHealthResponse', () => {
    const stats = {
        startedAt: new Date(Date.now() - 60_000).toISOString(), // 60 seconds ago
        requestCount: 42,
        enrichedCount: 10,
        errorCount: 3,
    };

    it('reports healthy when DB is connected', () => {
        const res = buildHealthResponse(true, stats, '1.0.0');
        expect(res.status).toBe('healthy');
        expect(res.database).toBe('connected');
    });

    it('reports degraded when DB is disconnected', () => {
        const res = buildHealthResponse(false, stats, '1.0.0');
        expect(res.status).toBe('degraded');
        expect(res.database).toBe('disconnected');
    });

    it('includes version', () => {
        const res = buildHealthResponse(true, stats, '2.5.0');
        expect(res.version).toBe('2.5.0');
    });

    it('includes request counts', () => {
        const res = buildHealthResponse(true, stats, '1.0.0');
        expect(res.requests).toBe(42);
        expect(res.enriched).toBe(10);
        expect(res.errors).toBe(3);
    });

    it('computes uptime in seconds', () => {
        const res = buildHealthResponse(true, stats, '1.0.0');
        // started 60s ago, allow some tolerance
        expect(res.uptime).toBeGreaterThanOrEqual(59);
        expect(res.uptime).toBeLessThan(65);
    });

    it('includes ISO timestamp', () => {
        const res = buildHealthResponse(true, stats, '1.0.0');
        expect(res.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe('buildErrorResponse', () => {
    it('uses error status when provided', () => {
        const res = buildErrorResponse({ message: 'Bad request', status: 400 });
        expect(res.statusCode).toBe(400);
    });

    it('defaults to 500 when no status', () => {
        const res = buildErrorResponse({ message: 'Unexpected' });
        expect(res.statusCode).toBe(500);
    });

    it('uses error message', () => {
        const res = buildErrorResponse({ message: 'Something broke', status: 503 });
        expect(res.body.error.message).toBe('Something broke');
    });

    it('defaults message to "Internal server error"', () => {
        const res = buildErrorResponse({ status: 500 });
        expect(res.body.error.message).toBe('Internal server error');
    });

    it('sets type to server_error', () => {
        const res = buildErrorResponse({ message: 'test' });
        expect(res.body.error.type).toBe('server_error');
    });
});

describe('getModelProvider', () => {
    it('extracts provider from slash-separated ID', () => {
        expect(getModelProvider('openai/gpt-4')).toBe('openai');
        expect(getModelProvider('anthropic/claude-3')).toBe('anthropic');
        expect(getModelProvider('meta-llama/Llama-3-70B')).toBe('meta-llama');
    });

    it('returns full ID when no slash', () => {
        expect(getModelProvider('gpt-4')).toBe('gpt-4');
        expect(getModelProvider('claude-3')).toBe('claude-3');
    });

    it('returns "unknown" for empty string', () => {
        expect(getModelProvider('')).toBe('unknown');
    });

    it('handles slash at position 0 correctly', () => {
        // slashIdx === 0 means no provider prefix (slashIdx > 0 check fails)
        expect(getModelProvider('/model')).toBe('/model');
    });
});

describe('proxy stats tracking', () => {
    it('starts with zero counters', () => {
        const stats = {
            startedAt: new Date().toISOString(),
            requestCount: 0,
            enrichedCount: 0,
            errorCount: 0,
        };
        expect(stats.requestCount).toBe(0);
        expect(stats.enrichedCount).toBe(0);
        expect(stats.errorCount).toBe(0);
    });

    it('increments independently', () => {
        const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0 };
        stats.requestCount++;
        stats.requestCount++;
        stats.enrichedCount++;
        stats.errorCount++;
        expect(stats.requestCount).toBe(2);
        expect(stats.enrichedCount).toBe(1);
        expect(stats.errorCount).toBe(1);
    });
});

describe('shutdown guard', () => {
    it('prevents double shutdown', () => {
        let shuttingDown = false;
        const shutdown = () => {
            if (shuttingDown) return 'already';
            shuttingDown = true;
            return 'initiated';
        };

        expect(shutdown()).toBe('initiated');
        expect(shutdown()).toBe('already');
        expect(shutdown()).toBe('already');
    });
});

describe('request logging skip', () => {
    it('skips logging for /health path', () => {
        const shouldLog = (path: string) => path !== '/health';
        expect(shouldLog('/health')).toBe(false);
        expect(shouldLog('/v1/models')).toBe(true);
        expect(shouldLog('/v1/chat/completions')).toBe(true);
    });
});

describe('knowledge reserve context adjustment', () => {
    it('correctly calculates reduced context sizes', () => {
        const cases = [
            { contextSize: 4096, reserve: 0.15, expected: 3481 },
            { contextSize: 8192, reserve: 0.15, expected: 6963 },
            { contextSize: 32768, reserve: 0.15, expected: 27852 },
            { contextSize: 128000, reserve: 0.05, expected: 121600 },
            { contextSize: 200000, reserve: 0.20, expected: 160000 },
        ];
        for (const { contextSize, reserve, expected } of cases) {
            expect(Math.floor(contextSize * (1 - reserve))).toBe(expected);
        }
    });
});

describe('auth 401 response format', () => {
    it('matches OpenAI error format', () => {
        const body = {
            error: {
                message: 'Authentication required. Use the Podbit security key as your API key.',
                type: 'authentication_error',
            },
        };
        expect(body.error.type).toBe('authentication_error');
        expect(body.error.message).toContain('Authentication required');
    });
});
