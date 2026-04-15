/**
 * Unit tests for routes/autotune.ts —
 * start, cancel, reset, progress, and apply auto-tune endpoints.
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

beforeEach(() => {
    jest.resetAllMocks();
    mockStartAutoTune.mockResolvedValue(undefined);
    mockGetAutoTuneProgress.mockReturnValue({ status: 'idle', results: [] });
    mockUpdateConfig.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /models/autotune/start
// =============================================================================

describe('POST /models/autotune/start', () => {
    it('returns 409 when auto-tune is already running', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'running' });

        const res = await request(app).post('/models/autotune/start');

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already running');
    });

    it('starts auto-tune and returns ok=true', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle' });

        const res = await request(app).post('/models/autotune/start');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockStartAutoTune).toHaveBeenCalled();
    });

    it('passes subsystems and runsPerCombo to startAutoTune', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle' });

        await request(app)
            .post('/models/autotune/start')
            .send({ subsystems: ['voice', 'chat'], runsPerCombo: 5, maxCombos: 20, convergenceThreshold: 0.03 });

        expect(mockStartAutoTune).toHaveBeenCalledWith({
            subsystems: ['voice', 'chat'],
            runsPerCombo: 5,
            maxCombos: 20,
            convergenceThreshold: 0.03,
        });
    });

    it('uses defaults when params not provided', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle' });

        await request(app).post('/models/autotune/start').send({});

        expect(mockStartAutoTune).toHaveBeenCalledWith({
            subsystems: [],
            runsPerCombo: 3,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        });
    });

    it('does not await startAutoTune (fire and forget)', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle' });
        let _resolveStart: () => void;
        mockStartAutoTune.mockReturnValue(new Promise(r => { _resolveStart = r; }) as any);

        const res = await request(app).post('/models/autotune/start');

        expect(res.status).toBe(200); // response arrives before completion
    });
});

// =============================================================================
// POST /models/autotune/cancel
// =============================================================================

describe('POST /models/autotune/cancel', () => {
    it('calls cancelAutoTune and returns ok=true', async () => {
        const res = await request(app).post('/models/autotune/cancel');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockCancelAutoTune).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /models/autotune/reset
// =============================================================================

describe('POST /models/autotune/reset', () => {
    it('calls resetAutoTune and returns ok=true', async () => {
        const res = await request(app).post('/models/autotune/reset');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockResetAutoTune).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /models/autotune/progress
// =============================================================================

describe('GET /models/autotune/progress', () => {
    it('returns current auto-tune progress', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'running',
            currentCombo: 5,
            totalCombos: 25,
            bestScore: 0.82,
        });

        const res = await request(app).get('/models/autotune/progress');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('running');
        expect(res.body.currentCombo).toBe(5);
        expect(res.body.bestScore).toBe(0.82);
    });
});

// =============================================================================
// POST /models/autotune/apply
// =============================================================================

describe('POST /models/autotune/apply', () => {
    it('returns 400 when changes is missing', async () => {
        const res = await request(app).post('/models/autotune/apply').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('changes array required');
    });

    it('returns 400 when changes is not an array', async () => {
        const res = await request(app).post('/models/autotune/apply').send({ changes: 'invalid' });
        expect(res.status).toBe(400);
    });

    it('applies temperature change and returns applied count', async () => {
        const res = await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [
                    { subsystem: 'voice', params: { temperature: 0.7 } },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.applied).toBe(1);
        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                subsystemTemperatures: { voice: 0.7 },
            })
        );
    });

    it('routes consultant subsystems (c: prefix) to consultantTemperatures', async () => {
        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [
                    { subsystem: 'c:voice', params: { temperature: 0.6, topP: 0.9 } },
                ],
            });

        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                consultantTemperatures: { voice: 0.6 },
                consultantTopP: { voice: 0.9 },
            })
        );
    });

    it('applies multiple subsystem changes', async () => {
        const res = await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [
                    { subsystem: 'voice', params: { temperature: 0.7 } },
                    { subsystem: 'chat', params: { temperature: 0.8 } },
                ],
            });

        expect(res.body.applied).toBe(2);
        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                subsystemTemperatures: { voice: 0.7, chat: 0.8 },
            })
        );
    });

    it('calls emitActivity after applying changes', async () => {
        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{ subsystem: 'voice', params: { temperature: 0.7 } }],
            });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config',
            'autotune_applied',
            expect.stringContaining('1 subsystem'),
            expect.anything()
        );
    });

    it('applies topP, minP, topK, and repeatPenalty params', async () => {
        await request(app)
            .post('/models/autotune/apply')
            .send({
                changes: [{
                    subsystem: 'synthesis',
                    params: { temperature: 0.5, topP: 0.9, minP: 0.1, topK: 50, repeatPenalty: 1.1 },
                }],
            });

        expect(mockUpdateConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                subsystemTemperatures: { synthesis: 0.5 },
                subsystemTopP: { synthesis: 0.9 },
                subsystemMinP: { synthesis: 0.1 },
                subsystemTopK: { synthesis: 50 },
                subsystemRepeatPenalties: { synthesis: 1.1 },
            })
        );
    });
});
