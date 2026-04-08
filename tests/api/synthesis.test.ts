/**
 * API tests for routes/synthesis.ts
 *
 * Tests: POST /synthesis/start, POST /synthesis/stop,
 *        GET /synthesis/status, POST /synthesis/discoveries/clear,
 *        GET /synthesis/discoveries, GET /synthesis/history,
 *        POST /cycles/:type/start (validation), POST /cycles/:type/stop,
 *        GET /cycles/status
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockRunSynthesisEngine = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStopSynthesisEngine = jest.fn<() => any>().mockReturnValue({ stopped: true });
const mockGetSynthesisStatus = jest.fn<() => any>().mockReturnValue({ running: false });
const mockGetDiscoveries = jest.fn<() => any[]>().mockReturnValue([]);
const mockClearDiscovery = jest.fn<() => boolean>().mockReturnValue(true);
const mockGetAllCycleStatuses = jest.fn<() => any>().mockReturnValue({
    validation: { running: false }, questions: { running: false },
    tensions: { running: false }, research: { running: false },
    autorating: { running: false }, evm: { running: false }, voicing: { running: false },
});
const mockStartValidationCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStopCycle = jest.fn<() => any>().mockReturnValue({ stopped: true });

jest.unstable_mockModule('../../core.js', () => ({
    runSynthesisEngine: mockRunSynthesisEngine,
    stopSynthesisEngine: mockStopSynthesisEngine,
    getSynthesisStatus: mockGetSynthesisStatus,
    getDiscoveries: mockGetDiscoveries,
    clearDiscovery: mockClearDiscovery,
    getAllCycleStatuses: mockGetAllCycleStatuses,
    startValidationCycle: mockStartValidationCycle,
    startQuestionCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    startTensionCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    startResearchCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    startAutoratingCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    startEvmCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    startVoicingCycle: jest.fn<() => Promise<any>>().mockResolvedValue({ started: true }),
    stopCycle: mockStopCycle,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        synthesisEngine: { enabled: true },
        autonomousCycles: {
            validation: { enabled: false }, questions: { enabled: false },
            tensions: { enabled: false }, research: { enabled: false },
            autorating: { enabled: false }, evm: { enabled: false }, voicing: { enabled: false },
        },
        populationControl: { enabled: false },
        groundRules: { enabled: false },
    },
    updateConfig: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: jest.fn<() => boolean>().mockReturnValue(false),
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: synthesisRouter } = await import('../../routes/synthesis.js');

/** Express app with synthesis + cycles router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', synthesisRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSynthesisStatus.mockReturnValue({ running: false });
    mockGetDiscoveries.mockReturnValue([]);
    mockGetAllCycleStatuses.mockReturnValue({
        validation: { running: false }, questions: { running: false },
        tensions: { running: false }, research: { running: false },
        autorating: { running: false }, evm: { running: false }, voicing: { running: false },
    });
});

// =============================================================================
// POST /synthesis/start
// =============================================================================

describe('POST /synthesis/start', () => {
    it('starts synthesis when not running', async () => {
        const res = await request(buildApp()).post('/synthesis/start').send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toMatch(/started/i);
    });

    it('returns success:false when already running', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: true });
        const res = await request(buildApp()).post('/synthesis/start').send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/already/i);
    });

    it('does not await the engine (fire-and-forget)', async () => {
        // The handler should return immediately without waiting for engine to complete
        let engineResolved = false;
        mockRunSynthesisEngine.mockImplementation(
            () => new Promise(resolve => setTimeout(() => { engineResolved = true; resolve(); }, 500))
        );
        const res = await request(buildApp()).post('/synthesis/start').send({});
        expect(res.status).toBe(200);
        expect(engineResolved).toBe(false); // Not waited for
    });
});

// =============================================================================
// POST /synthesis/stop
// =============================================================================

describe('POST /synthesis/stop', () => {
    it('stops the synthesis engine', async () => {
        mockStopSynthesisEngine.mockReturnValue({ stopped: true, message: 'Engine stopped' });
        const res = await request(buildApp()).post('/synthesis/stop');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stopped');
        expect(mockStopSynthesisEngine).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /synthesis/status
// =============================================================================

describe('GET /synthesis/status', () => {
    it('returns status with enabled and pendingDiscoveries fields', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false, cycles: 0 });
        mockGetDiscoveries.mockReturnValue([{ id: 'a' }, { id: 'b' }]);
        const res = await request(buildApp()).get('/synthesis/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('enabled');
        expect(res.body).toHaveProperty('pendingDiscoveries');
        expect(res.body.pendingDiscoveries).toBe(2);
        expect(Array.isArray(res.body.discoveries)).toBe(true);
    });

    it('caps discoveries at 10 in response', async () => {
        const many = Array.from({ length: 15 }, (_, i) => ({ id: `node-${i}` }));
        mockGetDiscoveries.mockReturnValue(many);
        const res = await request(buildApp()).get('/synthesis/status');
        expect(res.body.discoveries.length).toBeLessThanOrEqual(10);
        expect(res.body.pendingDiscoveries).toBe(15);
    });
});

// =============================================================================
// GET /synthesis/discoveries
// =============================================================================

describe('GET /synthesis/discoveries', () => {
    it('returns all discoveries', async () => {
        mockGetDiscoveries.mockReturnValue([{ nodeAId: 'a', nodeBId: 'b' }]);
        const res = await request(buildApp()).get('/synthesis/discoveries');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('discoveries');
        expect(res.body.discoveries.length).toBe(1);
    });
});

// =============================================================================
// POST /synthesis/discoveries/clear
// =============================================================================

describe('POST /synthesis/discoveries/clear', () => {
    it('clears a discovery pair', async () => {
        mockClearDiscovery.mockReturnValue(true);
        const res = await request(buildApp())
            .post('/synthesis/discoveries/clear')
            .send({ nodeAId: 'a', nodeBId: 'b' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockClearDiscovery).toHaveBeenCalledWith('a', 'b');
    });

    it('returns success:false when pair not found', async () => {
        mockClearDiscovery.mockReturnValue(false);
        const res = await request(buildApp())
            .post('/synthesis/discoveries/clear')
            .send({ nodeAId: 'x', nodeBId: 'y' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });
});

// =============================================================================
// POST /cycles/:type/start
// =============================================================================

describe('POST /cycles/:type/start', () => {
    it('returns 400 for invalid cycle type', async () => {
        const res = await request(buildApp())
            .post('/cycles/invalidtype/start')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/invalid cycle type/i);
    });

    it('starts validation cycle', async () => {
        const res = await request(buildApp())
            .post('/cycles/validation/start')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('started');
    });

    it('handles synthesis cycle type (delegates to synthesis engine)', async () => {
        const res = await request(buildApp())
            .post('/cycles/synthesis/start')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns already-running when synthesis is running', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: true });
        const res = await request(buildApp())
            .post('/cycles/synthesis/start')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });
});

// =============================================================================
// POST /cycles/:type/stop
// =============================================================================

describe('POST /cycles/:type/stop', () => {
    it('returns 400 for invalid cycle type', async () => {
        const res = await request(buildApp())
            .post('/cycles/badtype/stop')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('stops a valid cycle type', async () => {
        mockStopCycle.mockReturnValue({ stopped: true });
        const res = await request(buildApp())
            .post('/cycles/validation/stop')
            .send({});
        expect(res.status).toBe(200);
    });

    it('stops synthesis cycle via synthesis engine', async () => {
        mockStopSynthesisEngine.mockReturnValue({ stopped: true });
        const res = await request(buildApp())
            .post('/cycles/synthesis/stop')
            .send({});
        expect(res.status).toBe(200);
        expect(mockStopSynthesisEngine).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /cycles/status
// =============================================================================

describe('GET /cycles/status', () => {
    it('returns status for all cycle types', async () => {
        const res = await request(buildApp()).get('/cycles/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('synthesis');
        expect(res.body).toHaveProperty('validation');
        expect(res.body).toHaveProperty('questions');
        expect(res.body).toHaveProperty('tensions');
        expect(res.body).toHaveProperty('research');
    });

    it('synthesis status includes enabled and pendingDiscoveries', async () => {
        mockGetDiscoveries.mockReturnValue([{ id: 'a' }]);
        const res = await request(buildApp()).get('/cycles/status');
        expect(res.body.synthesis).toHaveProperty('enabled');
        expect(res.body.synthesis).toHaveProperty('pendingDiscoveries');
    });
});
