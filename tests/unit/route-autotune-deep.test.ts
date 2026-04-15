/**
 * Deep branch-coverage tests for routes/autotune.ts —
 * Covers the fire-and-forget IIFE in /apply (know-thyself seeding,
 * decision logging, error handling) and startAutoTune rejection.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockStartAutoTune = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCancelAutoTune = jest.fn<() => void>();
const mockResetAutoTune = jest.fn<() => void>();
const mockGetAutoTuneProgress = jest.fn<() => any>().mockReturnValue({ status: 'idle', results: [] });
const mockUpdateConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();
const mockSeedTuningKnowledge = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core/autotune.js', () => ({
    startAutoTune: mockStartAutoTune,
    cancelAutoTune: mockCancelAutoTune,
    resetAutoTune: mockResetAutoTune,
    getAutoTuneProgress: mockGetAutoTuneProgress,
}));

jest.unstable_mockModule('../../config.js', () => ({
    updateConfig: mockUpdateConfig,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../handlers/config-tune/know-thyself.js', () => ({
    seedTuningKnowledge: mockSeedTuningKnowledge,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const autotuneRouter = (await import('../../routes/autotune.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(autotuneRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

// Helper to flush microtask queue so fire-and-forget IIFEs complete
const flush = () => new Promise(r => setTimeout(r, 50));

beforeEach(() => {
    jest.clearAllMocks();
    mockStartAutoTune.mockResolvedValue(undefined);
    mockGetAutoTuneProgress.mockReturnValue({ status: 'idle', results: [] });
    mockUpdateConfig.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([]);
    mockSeedTuningKnowledge.mockResolvedValue(undefined);
});

// =============================================================================
// POST /models/autotune/start — error branch
// =============================================================================

describe('POST /models/autotune/start — startAutoTune rejection', () => {
    it('logs error to console when startAutoTune rejects', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle' });
        const error = new Error('tune exploded');
        mockStartAutoTune.mockRejectedValue(error);

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app).post('/models/autotune/start').send({});
        expect(res.status).toBe(200); // fire-and-forget, response is immediate

        await flush();

        expect(spy).toHaveBeenCalledWith('[autotune] Unhandled error:', error);
        spy.mockRestore();
    });
});

// =============================================================================
// POST /models/autotune/apply — fire-and-forget IIFE branches
// =============================================================================

describe('POST /models/autotune/apply — know-thyself seeding', () => {
    const currentParams = {
        temperature: 0.5,
        topP: 0.8,
        minP: 0.05,
        topK: 40,
        repeatPenalty: 1.0,
    };

    const makeResult = (subsystem: string, overrides: any = {}) => ({
        subsystem,
        currentScore: 0.6,
        bestScore: 0.8,
        improvement: 0.2,
        testedCombos: 10,
        modelName: 'test-model',
        phase: 'exploration',
        currentParams,
        ...overrides,
    });

    it('seeds tuning knowledge when matching result exists', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7, topP: 0.9, minP: 0.1, topK: 50, repeatPenalty: 1.2 },
                }],
            });

        await flush();

        expect(mockSeedTuningKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeType: 'seed',
                salience: 0.7,
                contributor: 'autotune',
                content: expect.stringContaining('Auto-tune result for voice'),
            }),
        );
        expect(mockSeedTuningKnowledge.mock.calls[0][0].content).toContain('test-model');
        expect(mockSeedTuningKnowledge.mock.calls[0][0].content).toContain('exploration');
    });

    it('logs decisions for each changed parameter', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7, topP: 0.9, minP: 0.05, topK: 40, repeatPenalty: 1.2 },
                }],
            });

        await flush();

        // temperature changed (0.5 -> 0.7), topP changed (0.8 -> 0.9), repeatPenalty changed (1.0 -> 1.2)
        // minP unchanged (0.05), topK unchanged (40) — should be skipped
        const queryCalls = mockQuery.mock.calls;
        const decisionInserts = queryCalls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO decisions'),
        );

        expect(decisionInserts.length).toBe(3); // temperature, topP, repeatPenalty

        // Check one decision has correct old/new values
        const tempDecision = decisionInserts.find((c: any) => c[1][2] === 'temperature');
        expect(tempDecision).toBeDefined();
        expect(tempDecision![1][3]).toBe('0.5'); // old
        expect(tempDecision![1][4]).toBe('0.7'); // new
        expect(tempDecision![1][5]).toBe('system');
        expect(tempDecision![1][6]).toBe('autotune');
    });

    it('skips params where newVal is null', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    // Only temperature set, rest are undefined/null
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        const decisionInserts = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO decisions'),
        );

        // Only temperature changed
        expect(decisionInserts.length).toBe(1);
        expect(decisionInserts[0][1][2]).toBe('temperature');
    });

    it('skips seeding when no matching result found (continue branch)', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('chat')], // result for 'chat', not 'voice'
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        expect(mockSeedTuningKnowledge).not.toHaveBeenCalled();
        const decisionInserts = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO decisions'),
        );
        expect(decisionInserts.length).toBe(0);
    });

    it('handles missing results array gracefully (defaults to [])', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            // no results property
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        expect(mockSeedTuningKnowledge).not.toHaveBeenCalled();
    });

    it('catches and logs error when seeding fails', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });
        mockSeedTuningKnowledge.mockRejectedValue(new Error('seed boom'));

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        expect(spy).toHaveBeenCalledWith(
            '[autotune] Know-thyself/decision seeding failed:',
            'seed boom',
        );
        spy.mockRestore();
    });

    it('catches and logs error when decision query fails', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });
        mockQuery.mockRejectedValue(new Error('db write fail'));

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        expect(spy).toHaveBeenCalledWith(
            '[autotune] Know-thyself/decision seeding failed:',
            'db write fail',
        );
        spy.mockRestore();
    });

    it('seeds and logs decisions for consultant subsystems (c: prefix)', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('c:voice')],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'c:voice',
                    params: { temperature: 0.7, minP: 0.1, topK: 50 },
                }],
            });

        await flush();

        // Consultant params should go to consultant keys in updateConfig
        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                consultantTemperatures: { voice: 0.7 },
                consultantMinP: { voice: 0.1 },
                consultantTopK: { voice: 50 },
            }),
        );

        // Know-thyself seed should reference c:voice
        expect(mockSeedTuningKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining('c:voice'),
            }),
        );

        // Decision logs for changed params
        const decisionInserts = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO decisions'),
        );
        expect(decisionInserts.length).toBe(3); // temperature, minP, topK changed
    });

    it('processes multiple changes with mixed results', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [
                makeResult('voice'),
                // no result for 'chat' — should be skipped
            ],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [
                    { subsystem: 'voice', params: { temperature: 0.7 } },
                    { subsystem: 'chat', params: { temperature: 0.8 } },
                ],
            });

        await flush();

        // Only voice gets seeded
        expect(mockSeedTuningKnowledge).toHaveBeenCalledTimes(1);
        expect(mockSeedTuningKnowledge.mock.calls[0][0].content).toContain('voice');
    });

    it('formats score percentages and improvement correctly in reason', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice', {
                currentScore: 0.654,
                bestScore: 0.821,
                improvement: 0.167,
                testedCombos: 15,
            })],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7 },
                }],
            });

        await flush();

        const content = mockSeedTuningKnowledge.mock.calls[0][0].content;
        // currentScore 0.654 → 65%, bestScore 0.821 → 82%, improvement 0.167 → 16.7%
        expect(content).toContain('65%');
        expect(content).toContain('82%');
        expect(content).toContain('+16.7%');
        expect(content).toContain('15 combos');
    });

    it('includes previous params in seed content via fmt()', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'complete',
            results: [makeResult('voice')],
        });

        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'voice',
                    params: { temperature: 0.7, topP: 0.9, minP: 0.1, topK: 50, repeatPenalty: 1.2 },
                }],
            });

        await flush();

        const content = mockSeedTuningKnowledge.mock.calls[0][0].content;
        // Best params fmt
        expect(content).toContain('temp=0.7');
        expect(content).toContain('topP=0.9');
        // Previous params fmt
        expect(content).toContain('temp=0.5');
        expect(content).toContain('topP=0.8');
    });
});
