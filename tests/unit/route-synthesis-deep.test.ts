/**
 * Deep coverage tests for routes/synthesis.ts —
 * Targets uncovered lines: 16 (synthesis engine error catch in /synthesis/start),
 * 117-121 (cycle params parsing from parameters field in /synthesis/history),
 * 189 (already running for synthesis via /cycles/synthesis/start),
 * 192 (synthesis engine error catch in /cycles/synthesis/start).
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
    jest.clearAllMocks();
    mockRunSynthesisEngine.mockResolvedValue(undefined);
    mockStopSynthesisEngine.mockReturnValue({ stopped: true });
    mockGetSynthesisStatus.mockReturnValue({ running: false });
    mockGetDiscoveries.mockReturnValue([]);
    mockClearDiscovery.mockReturnValue(true);
    mockIsBudgetExceeded.mockReturnValue(false);
    mockUpdateConfig.mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValue([]);
});

// =============================================================================
// Line 16: synthesis engine error catch in POST /synthesis/start
// =============================================================================

describe('POST /synthesis/start — engine error handling (line 16)', () => {
    it('logs error to console when synthesis engine throws asynchronously', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false });

        // Set up a rejecting promise that fires after the response is sent
        const engineError = new Error('Engine crash during synthesis');
        mockRunSynthesisEngine.mockRejectedValue(engineError);

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app).post('/synthesis/start');

        // Response should still be success (fire-and-forget)
        expect(res.body.success).toBe(true);

        // Wait a tick for the catch handler to fire
        await new Promise(r => setTimeout(r, 50));

        const engineErrorLog = errorSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('Synthesis engine error')
        );
        expect(engineErrorLog).toBeDefined();

        errorSpy.mockRestore();
    });
});

// =============================================================================
// Lines 117-121: cycle params parsing from parameters field in history
// =============================================================================

describe('GET /synthesis/history — cycle params parsing (lines 117-121)', () => {
    it('parses cycle_type and params from parameters field', async () => {
        const cycleRow = {
            id: 'c-params',
            node_a_content: 'Node A',
            node_b_content: 'Node B',
            resonance_score: 0.8,
            threshold_used: 0.5,
            created_child: 1,
            child_node_id: 'child-1',
            child_trajectory: 'knowledge',
            rejection_reason: null,
            domain: 'test',
            started_at: '2024-01-01',
            completed_at: '2024-01-01',
            parameters: JSON.stringify({
                cycle_type: 'research',
                seedsGenerated: 5,
                seedsAccepted: 3,
                questionsGenerated: 2,
                questionsAccepted: 1,
                tensionsFound: 4,
                tensionsProcessed: 2,
                candidatesFound: 10,
                candidatesValidated: 7,
                is_breakthrough: true,
                composite: 0.85,
            }),
        };

        mockDbQuery
            .mockResolvedValueOnce([cycleRow])
            .mockResolvedValueOnce([{ total: '1', passed: '1', rejected: '0' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        expect(res.status).toBe(200);
        const cycle = res.body.cycles[0];
        expect(cycle.cycleType).toBe('research');
        expect(cycle.cycleParams).toEqual({
            seedsGenerated: 5,
            seedsAccepted: 3,
            questionsGenerated: 2,
            questionsAccepted: 1,
            tensionsFound: 4,
            tensionsProcessed: 2,
            candidatesFound: 10,
            candidatesValidated: 7,
            isBreakthrough: true,
            composite: 0.85,
        });
    });

    it('detects validation cycle type from validation_type field', async () => {
        const cycleRow = {
            id: 'c-validation',
            node_a_content: 'Node A',
            node_b_content: 'Node B',
            resonance_score: 0.6,
            threshold_used: 0.5,
            created_child: 0,
            child_node_id: null,
            child_trajectory: null,
            rejection_reason: null,
            domain: 'test',
            started_at: '2024-01-01',
            completed_at: '2024-01-01',
            parameters: JSON.stringify({
                validation_type: 'breakthrough',
                candidatesFound: 3,
                candidatesValidated: 1,
            }),
        };

        mockDbQuery
            .mockResolvedValueOnce([cycleRow])
            .mockResolvedValueOnce([{ total: '1', passed: '0', rejected: '1' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        const cycle = res.body.cycles[0];
        expect(cycle.cycleType).toBe('validation');
        expect(cycle.cycleParams).not.toBeNull();
        expect(cycle.cycleParams.candidatesFound).toBe(3);
    });

    it('returns null cycleType/cycleParams when parameters has no cycle_type', async () => {
        const cycleRow = {
            id: 'c-no-type',
            node_a_content: 'Node A',
            node_b_content: 'Node B',
            resonance_score: 0.5,
            threshold_used: 0.5,
            created_child: 0,
            child_node_id: null,
            child_trajectory: null,
            rejection_reason: null,
            domain: 'test',
            started_at: '2024-01-01',
            completed_at: '2024-01-01',
            parameters: JSON.stringify({ some_other_field: 'value' }),
        };

        mockDbQuery
            .mockResolvedValueOnce([cycleRow])
            .mockResolvedValueOnce([{ total: '0', passed: '0', rejected: '0' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        const cycle = res.body.cycles[0];
        expect(cycle.cycleType).toBeNull();
        expect(cycle.cycleParams).toBeNull();
    });

    it('handles malformed JSON in parameters field gracefully', async () => {
        const cycleRow = {
            id: 'c-bad-json',
            node_a_content: 'Node A',
            node_b_content: 'Node B',
            resonance_score: 0.5,
            threshold_used: 0.5,
            created_child: 0,
            child_node_id: null,
            child_trajectory: null,
            rejection_reason: null,
            domain: 'test',
            started_at: '2024-01-01',
            completed_at: '2024-01-01',
            parameters: '{invalid json!!!',
        };

        mockDbQuery
            .mockResolvedValueOnce([cycleRow])
            .mockResolvedValueOnce([{ total: '0', passed: '0', rejected: '0' }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/synthesis/history');

        expect(res.status).toBe(200);
        const cycle = res.body.cycles[0];
        expect(cycle.cycleType).toBeNull();
        expect(cycle.cycleParams).toBeNull();
    });
});

// =============================================================================
// Lines 189, 192: /cycles/synthesis/start — already running + error catch
// =============================================================================

describe('POST /cycles/synthesis/start — already running (line 189)', () => {
    it('returns already-running when synthesis is active via cycles endpoint', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: true });

        const res = await request(app).post('/cycles/synthesis/start');

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Already running');
    });
});

describe('POST /cycles/synthesis/start — engine error catch (line 192)', () => {
    it('logs error when synthesis engine throws via cycles start endpoint', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false });
        const engineError = new Error('Cycle engine crash');
        mockRunSynthesisEngine.mockRejectedValue(engineError);

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app).post('/cycles/synthesis/start');

        expect(res.body.success).toBe(true);

        // Wait for async catch
        await new Promise(r => setTimeout(r, 50));

        const errorLog = errorSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('Synthesis engine error')
        );
        expect(errorLog).toBeDefined();

        errorSpy.mockRestore();
    });
});
