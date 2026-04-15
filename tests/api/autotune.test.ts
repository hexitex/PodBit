/**
 * API tests for routes/autotune.ts
 *
 * Tests: POST /models/autotune/start, /cancel, /reset, GET /progress, POST /apply
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockStartAutoTune = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCancelAutoTune = jest.fn<() => void>();
const mockResetAutoTune = jest.fn<() => void>();
const mockGetAutoTuneProgress = jest.fn<() => any>().mockReturnValue({ status: 'idle', results: [] });
const mockUpdateConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();
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

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../handlers/config-tune/know-thyself.js', () => ({
    seedTuningKnowledge: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: autotuneRouter } = await import('../../routes/autotune.js');

/** Express app with autotune router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', autotuneRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetAutoTuneProgress.mockReturnValue({ status: 'idle', results: [] });
    mockStartAutoTune.mockResolvedValue(undefined);
});

// =============================================================================
// POST /models/autotune/start
// =============================================================================

describe('POST /models/autotune/start', () => {
    it('starts auto-tune and returns ok', async () => {
        const res = await request(buildApp())
            .post('/models/autotune/start')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.message).toContain('started');
        expect(mockStartAutoTune).toHaveBeenCalled();
    });

    it('returns 409 when already running', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'running', results: [] });
        const res = await request(buildApp())
            .post('/models/autotune/start')
            .send({});
        expect(res.status).toBe(409);
        expect(res.body.error).toContain('running');
        expect(mockStartAutoTune).not.toHaveBeenCalled();
    });

    it('passes params to startAutoTune', async () => {
        await request(buildApp())
            .post('/models/autotune/start')
            .send({ subsystems: ['voice'], runsPerCombo: 5, maxCombos: 10, convergenceThreshold: 0.1 });
        expect(mockStartAutoTune).toHaveBeenCalledWith(expect.objectContaining({
            subsystems: ['voice'],
            runsPerCombo: 5,
            maxCombos: 10,
            convergenceThreshold: 0.1,
        }));
    });

    it('uses defaults when no params provided', async () => {
        await request(buildApp()).post('/models/autotune/start').send({});
        expect(mockStartAutoTune).toHaveBeenCalledWith(expect.objectContaining({
            subsystems: [],
            runsPerCombo: 3,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }));
    });
});

// =============================================================================
// POST /models/autotune/cancel
// =============================================================================

describe('POST /models/autotune/cancel', () => {
    it('cancels auto-tune', async () => {
        const res = await request(buildApp()).post('/models/autotune/cancel');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockCancelAutoTune).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /models/autotune/reset
// =============================================================================

describe('POST /models/autotune/reset', () => {
    it('resets auto-tune state', async () => {
        const res = await request(buildApp()).post('/models/autotune/reset');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockResetAutoTune).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /models/autotune/progress
// =============================================================================

describe('GET /models/autotune/progress', () => {
    it('returns current progress', async () => {
        mockGetAutoTuneProgress.mockReturnValue({
            status: 'running',
            currentCombo: 3,
            totalCombos: 25,
            results: [],
        });
        const res = await request(buildApp()).get('/models/autotune/progress');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('running');
        expect(res.body.currentCombo).toBe(3);
    });

    it('returns idle status when not running', async () => {
        mockGetAutoTuneProgress.mockReturnValue({ status: 'idle', results: [] });
        const res = await request(buildApp()).get('/models/autotune/progress');
        expect(res.body.status).toBe('idle');
    });
});

// =============================================================================
// POST /models/autotune/apply
// =============================================================================

describe('POST /models/autotune/apply', () => {
    it('returns 400 when changes is missing', async () => {
        const res = await request(buildApp())
            .post('/models/autotune/apply')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('changes array required');
    });

    it('returns 400 when changes is not an array', async () => {
        const res = await request(buildApp())
            .post('/models/autotune/apply')
            .send({ changes: 'invalid' });
        expect(res.status).toBe(400);
    });

    it('applies changes and calls updateConfig', async () => {
        const changes = [
            { subsystem: 'voice', params: { temperature: 0.7, topP: 0.9, minP: 0.05, topK: 40, repeatPenalty: 1.1 } },
        ];
        const res = await request(buildApp())
            .post('/models/autotune/apply')
            .send({ changes });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.applied).toBe(1);
        expect(mockUpdateConfig).toHaveBeenCalled();
        expect(mockEmitActivity).toHaveBeenCalled();
    });

    it('handles consultant subsystem prefix c:', async () => {
        const changes = [
            { subsystem: 'c:voice', params: { temperature: 0.8, topP: 0.95, minP: 0.0, topK: 0, repeatPenalty: 1.0 } },
        ];
        const res = await request(buildApp())
            .post('/models/autotune/apply')
            .send({ changes });
        expect(res.status).toBe(200);
        // updateConfig should be called with consultantTemperatures key
        const updateCall = (mockUpdateConfig.mock.calls[0] as any[])[0];
        expect(updateCall.consultantTemperatures).toHaveProperty('voice', 0.8);
    });
});
