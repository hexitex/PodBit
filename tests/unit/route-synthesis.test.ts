/**
 * Unit tests for routes/synthesis.ts —
 * synthesis engine control, discovery management, history, and cycle endpoints.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

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
const mockStartQuestionCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStartTensionCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStartResearchCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStartAutoratingCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStartEvmCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStartVoicingCycle = jest.fn<() => Promise<any>>().mockResolvedValue({ started: true });
const mockStopCycle = jest.fn<() => any>().mockReturnValue({ stopped: true });
const mockIsBudgetExceeded = jest.fn<() => boolean>().mockReturnValue(false);
const mockUpdateConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

const mockConfig = {
    synthesisEngine: { enabled: true },
    autonomousCycles: {
        validation: { enabled: true },
        questions: { enabled: false },
        tensions: { enabled: true },
        research: { enabled: false },
        autorating: { enabled: false },
        evm: { enabled: true },
        voicing: { enabled: true },
    },
    populationControl: { enabled: false },
    groundRules: { enabled: false },
};

jest.unstable_mockModule('../../core.js', () => ({
    runSynthesisEngine: mockRunSynthesisEngine,
    stopSynthesisEngine: mockStopSynthesisEngine,
    getSynthesisStatus: mockGetSynthesisStatus,
    getDiscoveries: mockGetDiscoveries,
    clearDiscovery: mockClearDiscovery,
    getAllCycleStatuses: mockGetAllCycleStatuses,
    startValidationCycle: mockStartValidationCycle,
    startQuestionCycle: mockStartQuestionCycle,
    startTensionCycle: mockStartTensionCycle,
    startResearchCycle: mockStartResearchCycle,
    startAutoratingCycle: mockStartAutoratingCycle,
    startEvmCycle: mockStartEvmCycle,
    startVoicingCycle: mockStartVoicingCycle,
    stopCycle: mockStopCycle,
    startPopulationControlCycle: jest.fn().mockResolvedValue({ success: true }),
    startGroundRulesCycle: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
    updateConfig: mockUpdateConfig,
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockDbQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const synthesisRouter = (await import('../../routes/synthesis.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(synthesisRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockRunSynthesisEngine.mockResolvedValue(undefined);
    mockStopSynthesisEngine.mockReturnValue({ stopped: true });
    mockGetSynthesisStatus.mockReturnValue({ running: false });
    mockGetDiscoveries.mockReturnValue([]);
    mockClearDiscovery.mockReturnValue(true);
    mockGetAllCycleStatuses.mockReturnValue({
        validation: { running: false }, questions: { running: false },
        tensions: { running: false }, research: { running: false },
        autorating: { running: false }, evm: { running: false }, voicing: { running: false },
    });
    mockStartValidationCycle.mockResolvedValue({ started: true });
    mockStartQuestionCycle.mockResolvedValue({ started: true });
    mockStartTensionCycle.mockResolvedValue({ started: true });
    mockStartResearchCycle.mockResolvedValue({ started: true });
    mockStartAutoratingCycle.mockResolvedValue({ started: true });
    mockStartEvmCycle.mockResolvedValue({ started: true });
    mockStartVoicingCycle.mockResolvedValue({ started: true });
    mockStopCycle.mockReturnValue({ stopped: true });
    mockIsBudgetExceeded.mockReturnValue(false);
    mockUpdateConfig.mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /synthesis/start
// =============================================================================

describe('POST /synthesis/start', () => {
    it('returns already-running message when engine is running', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: true });

        const res = await request(app).post('/synthesis/start');

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Already running');
    });

    it('starts synthesis engine when not running', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false });

        const res = await request(app).post('/synthesis/start');

        expect(res.body.success).toBe(true);
        expect(mockRunSynthesisEngine).toHaveBeenCalled();
    });

    it('does not await synthesis engine (fire and forget)', async () => {
        let _resolveEngine: () => void;
        mockRunSynthesisEngine.mockReturnValue(new Promise(r => { _resolveEngine = r; }));

        const res = await request(app).post('/synthesis/start');

        // Response should arrive before engine completes
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /synthesis/stop
// =============================================================================

describe('POST /synthesis/stop', () => {
    it('calls stopSynthesisEngine and returns result', async () => {
        mockStopSynthesisEngine.mockReturnValue({ stopped: true, message: 'Engine stopped' });

        const res = await request(app).post('/synthesis/stop');

        expect(res.status).toBe(200);
        expect(res.body.stopped).toBe(true);
        expect(mockStopSynthesisEngine).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /synthesis/status
// =============================================================================

describe('GET /synthesis/status', () => {
    it('returns synthesis status with enabled flag and discoveries', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: true, cycles: 5 });
        mockGetDiscoveries.mockReturnValue([{ id: 'd1' }, { id: 'd2' }]);

        const res = await request(app).get('/synthesis/status');

        expect(res.status).toBe(200);
        expect(res.body.running).toBe(true);
        expect(res.body.enabled).toBe(true); // from mockConfig
        expect(res.body.pendingDiscoveries).toBe(2);
        expect(res.body.discoveries).toHaveLength(2);
    });

    it('limits discoveries to 10 in status response', async () => {
        const manyDiscoveries = Array.from({ length: 15 }, (_, i) => ({ id: `d${i}` }));
        mockGetDiscoveries.mockReturnValue(manyDiscoveries);

        const res = await request(app).get('/synthesis/status');

        expect(res.body.discoveries).toHaveLength(10);
        expect(res.body.pendingDiscoveries).toBe(15);
    });
});

// =============================================================================
// GET /synthesis/discoveries
// =============================================================================

describe('GET /synthesis/discoveries', () => {
    it('returns all discoveries', async () => {
        mockGetDiscoveries.mockReturnValue([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]);

        const res = await request(app).get('/synthesis/discoveries');

        expect(res.status).toBe(200);
        expect(res.body.discoveries).toHaveLength(3);
    });
});

// =============================================================================
// POST /synthesis/discoveries/clear
// =============================================================================

describe('POST /synthesis/discoveries/clear', () => {
    it('clears a discovery by node IDs', async () => {
        mockClearDiscovery.mockReturnValue(true);

        const res = await request(app)
            .post('/synthesis/discoveries/clear')
            .send({ nodeAId: 'n1', nodeBId: 'n2' });

        expect(res.body.success).toBe(true);
        expect(mockClearDiscovery).toHaveBeenCalledWith('n1', 'n2');
    });

    it('returns success=false when discovery not found', async () => {
        mockClearDiscovery.mockReturnValue(false);

        const res = await request(app)
            .post('/synthesis/discoveries/clear')
            .send({ nodeAId: 'nx', nodeBId: 'ny' });

        expect(res.body.success).toBe(false);
    });
});

// =============================================================================
// GET /synthesis/history
// =============================================================================

describe('GET /synthesis/history', () => {
    it('returns cycles with pipeline stats', async () => {
        mockDbQuery
            .mockResolvedValueOnce([
                { id: 'c1', node_a_content: 'Content A long enough', node_b_content: 'Content B long enough', resonance_score: 0.7, threshold_used: 0.5, created_child: 1, child_node_id: 'n3', child_trajectory: 'knowledge', rejection_reason: null, domain: 'science', started_at: '2024-01-01', completed_at: '2024-01-01' },
            ])
            .mockResolvedValueOnce([{ total: '10', passed: '7', rejected: '3' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        expect(res.status).toBe(200);
        expect(res.body.cycles).toHaveLength(1);
        expect(res.body.cycles[0].createdChild).toBe(true);
        expect(res.body.pipeline.total).toBe(10);
        expect(res.body.pipeline.passed).toBe(7);
        expect(res.body.pipeline.rejected).toBe(3);
    });

    it('truncates node content to 80 chars in cycle list', async () => {
        const longContent = 'A'.repeat(200);
        mockDbQuery
            .mockResolvedValueOnce([
                { id: 'c1', node_a_content: longContent, node_b_content: 'Short', resonance_score: 0.5, threshold_used: 0.5, created_child: 0, child_node_id: null, child_trajectory: null, rejection_reason: 'too_similar', domain: 'science', started_at: '2024-01-01' },
            ])
            .mockResolvedValueOnce([{ total: '1', passed: '0', rejected: '1' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        expect(res.body.cycles[0].nodeA).toHaveLength(80);
    });

    it('returns null nodeA/nodeB when content is null', async () => {
        mockDbQuery
            .mockResolvedValueOnce([
                { id: 'c1', node_a_content: null, node_b_content: null, resonance_score: 0.5, threshold_used: 0.5, created_child: 0, child_node_id: null, child_trajectory: null, rejection_reason: null, domain: 'science', started_at: '2024-01-01' },
            ])
            .mockResolvedValueOnce([{ total: '0', passed: '0', rejected: '0' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        expect(res.body.cycles[0].nodeA).toBeNull();
        expect(res.body.cycles[0].nodeB).toBeNull();
    });

    it('applies default limit of 20', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '0', passed: '0', rejected: '0' }])
            .mockResolvedValueOnce([]);

        await request(app).get('/synthesis/history');

        const [, params] = mockDbQuery.mock.calls[0] as any[];
        expect(params).toContain(20);
    });

    it('caps limit at 50', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '0', passed: '0', rejected: '0' }])
            .mockResolvedValueOnce([]);

        await request(app).get('/synthesis/history?limit=999');

        const [, params] = mockDbQuery.mock.calls[0] as any[];
        expect(params).toContain(50);
    });

    it('includes rejection breakdown from third query', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '5', passed: '2', rejected: '3' }])
            .mockResolvedValueOnce([
                { rejection_reason: 'too_similar', count: '2' },
                { rejection_reason: 'derivative', count: '1' },
            ]);

        const res = await request(app).get('/synthesis/history');

        expect(res.body.pipeline.rejectionBreakdown).toHaveLength(2);
        expect(res.body.pipeline.rejectionBreakdown[0].reason).toBe('too_similar');
        expect(res.body.pipeline.rejectionBreakdown[0].count).toBe(2);
    });
});

// =============================================================================
// POST /cycles/:type/start
// =============================================================================

describe('POST /cycles/:type/start', () => {
    it('returns 400 for invalid cycle type', async () => {
        const res = await request(app).post('/cycles/invalid-type/start');

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid cycle type');
    });

    it('returns 429 when budget is exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);

        const res = await request(app).post('/cycles/validation/start');

        expect(res.status).toBe(429);
        expect(res.body.message).toContain('Budget exceeded');
    });

    it('starts synthesis engine for synthesis cycle type', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false });

        const res = await request(app).post('/cycles/synthesis/start');

        expect(res.body.success).toBe(true);
        expect(mockRunSynthesisEngine).toHaveBeenCalled();
    });

    it('starts validation cycle', async () => {
        const res = await request(app).post('/cycles/validation/start');
        expect(res.body.started).toBe(true);
        expect(mockStartValidationCycle).toHaveBeenCalled();
    });

    it('starts questions cycle', async () => {
        const res = await request(app).post('/cycles/questions/start');
        expect(res.body.started).toBe(true);
        expect(mockStartQuestionCycle).toHaveBeenCalled();
    });

    it('starts tensions cycle', async () => {
        const _res = await request(app).post('/cycles/tensions/start');
        expect(mockStartTensionCycle).toHaveBeenCalled();
    });

    it('starts research cycle', async () => {
        await request(app).post('/cycles/research/start');
        expect(mockStartResearchCycle).toHaveBeenCalled();
    });

    it('starts autorating cycle', async () => {
        await request(app).post('/cycles/autorating/start');
        expect(mockStartAutoratingCycle).toHaveBeenCalled();
    });

    it('starts evm cycle', async () => {
        await request(app).post('/cycles/evm/start');
        expect(mockStartEvmCycle).toHaveBeenCalled();
    });

    it('starts voicing cycle', async () => {
        await request(app).post('/cycles/voicing/start');
        expect(mockStartVoicingCycle).toHaveBeenCalled();
    });

    it('updates config to enable=true when starting non-synthesis cycle', async () => {
        await request(app).post('/cycles/validation/start');

        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                autonomousCycles: { validation: { enabled: true } },
            })
        );
    });
});

// =============================================================================
// POST /cycles/:type/stop
// =============================================================================

describe('POST /cycles/:type/stop', () => {
    it('returns 400 for invalid cycle type', async () => {
        const res = await request(app).post('/cycles/bogus/stop');

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Invalid cycle type');
    });

    it('stops synthesis engine for synthesis cycle', async () => {
        mockStopSynthesisEngine.mockReturnValue({ stopped: true });

        const res = await request(app).post('/cycles/synthesis/stop');

        expect(mockStopSynthesisEngine).toHaveBeenCalled();
        expect(res.body.stopped).toBe(true);
    });

    it('calls stopCycle for non-synthesis cycle types', async () => {
        await request(app).post('/cycles/validation/stop');

        expect(mockStopCycle).toHaveBeenCalledWith('validation');
    });

    it('updates config to enabled=false when stopping non-synthesis cycle', async () => {
        await request(app).post('/cycles/research/stop');

        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                autonomousCycles: { research: { enabled: false } },
            })
        );
    });
});

// =============================================================================
// GET /cycles/status
// =============================================================================

describe('GET /cycles/status', () => {
    it('returns status for all cycle types', async () => {
        const res = await request(app).get('/cycles/status');

        expect(res.status).toBe(200);
        expect(res.body.synthesis).toBeDefined();
        expect(res.body.validation).toBeDefined();
        expect(res.body.questions).toBeDefined();
        expect(res.body.tensions).toBeDefined();
        expect(res.body.research).toBeDefined();
        expect(res.body.autorating).toBeDefined();
        expect(res.body.evm).toBeDefined();
        expect(res.body.voicing).toBeDefined();
    });

    it('includes enabled flags from config', async () => {
        const res = await request(app).get('/cycles/status');

        expect(res.body.synthesis.enabled).toBe(true);
        expect(res.body.validation.enabled).toBe(true);
        expect(res.body.questions.enabled).toBe(false);
    });

    it('includes synthesis pendingDiscoveries count', async () => {
        mockGetDiscoveries.mockReturnValue([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]);

        const res = await request(app).get('/cycles/status');

        expect(res.body.synthesis.pendingDiscoveries).toBe(3);
    });
});
