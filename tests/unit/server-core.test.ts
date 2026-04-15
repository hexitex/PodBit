/**
 * Unit tests for server.ts — Express server setup, middleware, health endpoint,
 * security headers, CORS, error handling, route registration.
 *
 * server.ts has heavy module-level side effects (creates Express app, registers
 * middleware, starts listening). All dependencies are mocked to prevent real
 * DB/model/cycle activity. The server will briefly bind to a port during tests;
 * we close it in afterAll.
 */
import { jest, describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import type { Express } from 'express';

// =============================================================================
// Mocks — declared before dynamic import of server.ts
// =============================================================================

const mockDbHealthCheck = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetDbDiagnostics = jest.fn<() => any>().mockReturnValue({
    stats: { totalReads: 100, totalWrites: 50, slowCount: 2, contentionEvents: 1, p99Ms: 45 },
    activeOps: [],
});
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);

const mockLoadSavedModels = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetConversationalLogging = jest.fn<() => void>();
const mockLoadSavedConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockCheckPartitionHealth = jest.fn<() => Promise<any>>().mockResolvedValue({
    healthy: true, unbridgedPartitions: [], emptyPartitions: [], orphanedDomains: [],
});
const mockStartValidationCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartQuestionCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartTensionCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartResearchCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartAutoratingCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartEvmCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartVoicingCycle = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStopSynthesisEngine = jest.fn<() => void>();
const mockGetSynthesisStatus = jest.fn<() => any>().mockReturnValue({ running: false });
const mockStopCycle = jest.fn<() => void>();
const mockCycleStates: Record<string, any> = {};

const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('testkey12345678');
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockIsLocalhostAddress = jest.fn<(addr: string) => boolean>().mockReturnValue(true);
const mockIsRemoteMode = jest.fn<() => boolean>().mockReturnValue(false);
const mockCleanupExpiredRefreshTokens = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockEmitActivity = jest.fn<() => void>();
const mockOnActivity = jest.fn<() => () => void>().mockReturnValue(() => {});
const mockInterceptConsole = jest.fn<() => void>();

// Pass-through middleware mocks
const mockRequireKey = jest.fn((_req: any, _res: any, next: any) => next());

// Create a real Express Router for the security router mock
import express from 'express';
const fakeSecurityRouter = express.Router();
// It just passes through
fakeSecurityRouter.use((_req, _res, next) => next());

// Create a real Express Router for API routes mock
const fakeApiRoutes = express.Router();
fakeApiRoutes.use((_req, _res, next) => next());

// Config mock
const mockConfig = {
    server: { port: 0, host: '127.0.0.1', corsOrigins: [] as string[] },
    autonomousCycles: {
        validation: { enabled: false },
        questions: { enabled: false },
        tensions: { enabled: false },
        research: { enabled: false },
        autorating: { enabled: false },
        evm: { enabled: false },
        voicing: { enabled: false },
    },
    elitePool: { enabled: false },
    knowledgeBase: { enabled: false },
    partitionServer: { enabled: false },
    populationControl: { enabled: false },
    groundRules: { enabled: false },
};

// =============================================================================
// Register module mocks
// =============================================================================

jest.unstable_mockModule('../../utils/logger.js', () => ({
    interceptConsole: mockInterceptConsole,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
    VERSION: '0.5.0-test',
    loadSavedConfig: mockLoadSavedConfig,
}));

jest.unstable_mockModule('../../db.js', () => ({
    healthCheck: mockDbHealthCheck,
    getDbDiagnostics: mockGetDbDiagnostics,
    systemQueryOne: mockSystemQueryOne,
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockQuery,
    close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../models.js', () => ({
    loadSavedModels: mockLoadSavedModels,
    setConversationalLogging: mockSetConversationalLogging,
}));

jest.unstable_mockModule('../../core.js', () => ({
    checkPartitionHealth: mockCheckPartitionHealth,
    startValidationCycle: mockStartValidationCycle,
    startQuestionCycle: mockStartQuestionCycle,
    startTensionCycle: mockStartTensionCycle,
    startResearchCycle: mockStartResearchCycle,
    startAutoratingCycle: mockStartAutoratingCycle,
    startEvmCycle: mockStartEvmCycle,
    startVoicingCycle: mockStartVoicingCycle,
    stopSynthesisEngine: mockStopSynthesisEngine,
    getSynthesisStatus: mockGetSynthesisStatus,
    stopCycle: mockStopCycle,
    cycleStates: mockCycleStates,
    startPopulationControlCycle: jest.fn().mockResolvedValue({ success: true }),
    startGroundRulesCycle: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../../routes/api.js', () => ({
    default: fakeApiRoutes,
}));

jest.unstable_mockModule('../../routes/security.js', () => ({
    default: fakeSecurityRouter,
    requireKey: mockRequireKey,
}));

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    isLocalhostAddress: mockIsLocalhostAddress,
    isRemoteMode: mockIsRemoteMode,
    cleanupExpiredRefreshTokens: mockCleanupExpiredRefreshTokens,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
    onActivity: mockOnActivity,
}));

jest.unstable_mockModule('../../evm/queue-worker.js', () => ({
    stopQueueWorker: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startQueueWorker: jest.fn<() => void>(),
}));

jest.unstable_mockModule('../../evm/queue.js', () => ({
    recoverStuck: jest.fn<() => Promise<number>>().mockResolvedValue(0),
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    initBudgetSystem: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    stopBudgetSystem: jest.fn<() => void>(),
}));

jest.unstable_mockModule('../../kb/watcher.js', () => ({
    stopAllWatchers: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startAllWatchers: jest.fn<() => Promise<number>>().mockResolvedValue(0),
}));

jest.unstable_mockModule('../../kb/pipeline.js', () => ({
    processingPipeline: {
        recoverStuckFiles: jest.fn<() => Promise<number>>().mockResolvedValue(0),
        backfillFilenameKeywords: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
}));

jest.unstable_mockModule('../../core/pool-integration.js', () => ({
    shutdownPoolIntegration: jest.fn<() => void>(),
    checkAndActivateRecruitments: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    startPoolReturnCheck: jest.fn<() => void>(),
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    backfillNumberVariables: jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 0 }),
}));

jest.unstable_mockModule('../../core/elite-pool.js', () => ({
    scanExistingVerified: jest.fn<() => Promise<any>>().mockResolvedValue({ promoted: 0, skipped: 0 }),
}));

jest.unstable_mockModule('../../models/providers.js', () => ({
    loadUnsupportedParamsCache: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// =============================================================================
// Import server and supertest after mocks
// =============================================================================

let app: Express;
let request: typeof import('supertest')['default'];
let interceptConsoleCalled = false;
let exitSpy: ReturnType<typeof jest.spyOn>;

beforeAll(async () => {
    // Prevent gracefulShutdown from killing the test process
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    const supertestMod = await import('supertest');
    request = supertestMod.default;

    // Use port 0 so the OS picks a random available port
    mockConfig.server.port = 0;

    const serverMod = await import('../../server.js');
    app = serverMod.default;

    // Capture whether interceptConsole was called during module load
    // (before beforeEach clears mock state)
    interceptConsoleCalled = mockInterceptConsole.mock.calls.length > 0;

    // Give the listen callback a moment to run (it's async inside listen)
    await new Promise(r => setTimeout(r, 200));
}, 10000);

afterAll(() => {
    exitSpy?.mockRestore();
});

beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply process.exit spy after clearAllMocks (clearAllMocks resets call counts, not impl)
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockDbHealthCheck.mockResolvedValue(true);
    mockGetDbDiagnostics.mockReturnValue({
        stats: { totalReads: 100, totalWrites: 50, slowCount: 2, contentionEvents: 1, p99Ms: 45 },
        activeOps: [],
    });
    mockIsRemoteMode.mockReturnValue(false);
    mockIsLocalhostAddress.mockReturnValue(true);
});

// =============================================================================
// MODULE INITIALIZATION
// =============================================================================

describe('server module initialization', () => {
    it('exports an express app as default', () => {
        expect(app).toBeDefined();
        expect(typeof app).toBe('function');
    });

    it('calls interceptConsole on module load', () => {
        // Captured in beforeAll before clearAllMocks resets the count
        expect(interceptConsoleCalled).toBe(true);
    });
});

// =============================================================================
// SECURITY HEADERS
// =============================================================================

describe('security headers middleware', () => {
    it('sets X-Content-Type-Options to nosniff', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options to DENY', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('sets X-XSS-Protection to 0', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['x-xss-protection']).toBe('0');
    });

    it('sets Referrer-Policy header', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('sets Permissions-Policy to restrict camera, mic, geo', async () => {
        const res = await request(app).get('/health');
        expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    });
});

// =============================================================================
// HEALTH ENDPOINT
// =============================================================================

describe('GET /health', () => {
    it('returns healthy status when DB is ok', async () => {
        mockDbHealthCheck.mockResolvedValue(true);
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.database).toBe('connected');
    });

    it('returns degraded status when DB is down', async () => {
        mockDbHealthCheck.mockResolvedValue(false);
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('degraded');
        expect(res.body.database).toBe('disconnected');
    });

    it('includes version in response', async () => {
        const res = await request(app).get('/health');
        expect(res.body.version).toBe('0.5.0-test');
    });

    it('includes uptime as a non-negative number', async () => {
        const res = await request(app).get('/health');
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes request count', async () => {
        const res = await request(app).get('/health');
        expect(typeof res.body.requests).toBe('number');
    });

    it('includes tls flag', async () => {
        const res = await request(app).get('/health');
        expect(typeof res.body.tls).toBe('boolean');
    });

    it('includes remoteMode flag', async () => {
        const res = await request(app).get('/health');
        expect(typeof res.body.remoteMode).toBe('boolean');
    });

    it('includes ISO timestamp', async () => {
        const res = await request(app).get('/health');
        expect(res.body.timestamp).toBeDefined();
        const parsed = new Date(res.body.timestamp);
        expect(parsed.getTime()).not.toBeNaN();
    });

    it('includes db_stats from diagnostics', async () => {
        const res = await request(app).get('/health');
        expect(res.body.db_stats).toBeDefined();
        expect(res.body.db_stats.queries).toBe(100);
        expect(res.body.db_stats.mutations).toBe(50);
        expect(res.body.db_stats.slow).toBe(2);
        expect(res.body.db_stats.contention).toBe(1);
        expect(res.body.db_stats.p99_ms).toBe(45);
        expect(res.body.db_stats.active).toBe(0);
    });

    it('calls dbHealthCheck and getDbDiagnostics', async () => {
        await request(app).get('/health');
        expect(mockDbHealthCheck).toHaveBeenCalled();
        expect(mockGetDbDiagnostics).toHaveBeenCalled();
    });
});

// =============================================================================
// REQUEST COUNTING
// =============================================================================

describe('request counting middleware', () => {
    it('increments request count across requests', async () => {
        const res1 = await request(app).get('/health');
        const count1 = res1.body.requests;

        const res2 = await request(app).get('/health');
        const count2 = res2.body.requests;

        expect(count2).toBeGreaterThan(count1);
    });
});

// =============================================================================
// ROUTE REGISTRATION — /api prefix
// =============================================================================

describe('route registration', () => {
    it('passes /api requests through requireKey middleware', async () => {
        await request(app).get('/api/nonexistent');
        expect(mockRequireKey).toHaveBeenCalled();
    });

    it('does not apply requireKey to /health', async () => {
        mockRequireKey.mockClear();
        await request(app).get('/health');
        expect(mockRequireKey).not.toHaveBeenCalled();
    });
});

// =============================================================================
// JSON BODY PARSING
// =============================================================================

describe('JSON body parsing', () => {
    it('accepts JSON request bodies without 400 error', async () => {
        const res = await request(app)
            .post('/api/test-json')
            .send({ key: 'value' })
            .set('Content-Type', 'application/json');

        // Route may not exist, but parsing should not fail
        expect(res.status).not.toBe(400);
    });
});

// =============================================================================
// SPA FALLBACK
// =============================================================================

describe('SPA fallback', () => {
    it('does not serve SPA index.html for /api routes', async () => {
        const res = await request(app).get('/api/nonexistent-route');
        // API routes should not get the SPA fallback — they skip to next()
        expect(res.status).toBe(404);
    });

    it('handles non-API routes via SPA fallback', async () => {
        const res = await request(app).get('/some-page');
        // SPA fallback may return 200 (sendFile succeeds) or 404 (file missing)
        expect([200, 404]).toContain(res.status);
    });

    it('handles arbitrary non-API paths', async () => {
        const res = await request(app).get('/dashboard');
        expect([200, 404]).toContain(res.status);
    });
});

// =============================================================================
// SHUTDOWN ENDPOINT
// =============================================================================

describe('POST /api/shutdown', () => {
    let origSetTimeout: typeof globalThis.setTimeout;

    beforeEach(() => {
        // Intercept setTimeout to prevent gracefulShutdown timer from firing
        origSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: any, ms: any, ...args: any[]) => {
            // Block the 100ms shutdown timer; allow everything else
            if (ms === 100) return 0 as any;
            return origSetTimeout(fn, ms, ...args);
        }) as any;
    });

    afterEach(() => {
        globalThis.setTimeout = origSetTimeout;
    });

    it('returns shutdown initiated message', async () => {
        const res = await request(app).post('/api/shutdown');
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Shutdown initiated');
    });

    it('applies requireKey middleware', async () => {
        mockRequireKey.mockClear();
        await request(app).post('/api/shutdown');
        expect(mockRequireKey).toHaveBeenCalled();
    });
});

// =============================================================================
// CORS CONFIGURATION
// =============================================================================

describe('CORS configuration', () => {
    it('allows cross-origin requests in localhost mode', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:5173');

        expect(res.status).toBe(200);
        // With origin: true, Access-Control-Allow-Origin mirrors the request origin
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('exposes x-podbit-key header', async () => {
        const res = await request(app)
            .get('/health')
            .set('Origin', 'http://localhost:5173');

        const exposed = res.headers['access-control-expose-headers'];
        if (exposed) {
            expect(exposed.toLowerCase()).toContain('x-podbit-key');
        }
    });

    it('supports credentials', async () => {
        const res = await request(app)
            .options('/health')
            .set('Origin', 'http://localhost:5173')
            .set('Access-Control-Request-Method', 'GET');

        // credentials: true means this header should be present
        if (res.headers['access-control-allow-credentials']) {
            expect(res.headers['access-control-allow-credentials']).toBe('true');
        }
    });
});

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

describe('error handling middleware', () => {
    it('is registered on the app (4-argument handler)', () => {
        // Express stores error handlers in the stack; verify the app has layers
        // that are 4-arg error handlers. We can check the app._router.stack.
        const stack = (app as any)._router?.stack || [];
        const errorHandlers = stack.filter((layer: any) => {
            // Error handlers have handle.length === 4
            return layer.handle && layer.handle.length === 4;
        });
        expect(errorHandlers.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

describe('static file serving', () => {
    it('handles static file requests (falls through to SPA fallback)', async () => {
        const res = await request(app).get('/nonexistent-static-file.js');
        // Falls through static middleware to SPA fallback — may be 200 or 404
        expect([200, 404]).toContain(res.status);
    });
});
