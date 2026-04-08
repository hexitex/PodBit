/**
 * API tests for routes/budget.ts
 *
 * Tests: GET /budget/status, GET /budget/config,
 *        PUT /budget/config (validation), POST /budget/resume
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetBudgetStatus = jest.fn<() => Promise<any>>();
const mockLoadBudgetConfig = jest.fn<() => Promise<any>>();
const mockUpdateBudgetConfig = jest.fn<() => Promise<any>>();
const mockForceResume = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../models/budget.js', () => ({
    getBudgetStatus: mockGetBudgetStatus,
    loadBudgetConfig: mockLoadBudgetConfig,
    updateBudgetConfig: mockUpdateBudgetConfig,
    forceResume: mockForceResume,
    isBudgetExceeded: jest.fn<() => boolean>().mockReturnValue(false),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: budgetRouter } = await import('../../routes/budget.js');

/** Express app with budget router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', budgetRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetBudgetStatus.mockResolvedValue({ status: 'ok', spending: 0 });
    mockLoadBudgetConfig.mockResolvedValue({ warningThreshold: 0.8, limits: {} });
    mockUpdateBudgetConfig.mockResolvedValue({ ok: true });
    mockForceResume.mockResolvedValue({ resumed: true });
});

// =============================================================================
// GET /budget/status
// =============================================================================

describe('GET /budget/status', () => {
    it('returns budget status object', async () => {
        const res = await request(buildApp()).get('/budget/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status');
    });
});

// =============================================================================
// GET /budget/config
// =============================================================================

describe('GET /budget/config', () => {
    it('returns budget config', async () => {
        const res = await request(buildApp()).get('/budget/config');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('warningThreshold');
    });
});

// =============================================================================
// PUT /budget/config
// =============================================================================

describe('PUT /budget/config', () => {
    it('accepts valid warningThreshold', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ warningThreshold: 0.8 });
        expect(res.status).toBe(200);
        expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(expect.objectContaining({ warningThreshold: 0.8 }));
    });

    it('returns 400 when warningThreshold < 0.5', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ warningThreshold: 0.3 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/warningThreshold/i);
    });

    it('returns 400 when warningThreshold >= 1.0', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ warningThreshold: 1.0 });
        expect(res.status).toBe(400);
    });

    it('returns 400 when warningThreshold is NaN', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ warningThreshold: 'abc' });
        expect(res.status).toBe(400);
    });

    it('accepts valid forceResumeBudget', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ forceResumeBudget: 10 });
        expect(res.status).toBe(200);
    });

    it('returns 400 when forceResumeBudget <= 0', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ forceResumeBudget: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/forceResumeBudget/i);
    });

    it('returns 400 when forceResumeBudget is negative', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ forceResumeBudget: -5 });
        expect(res.status).toBe(400);
    });

    it('accepts valid limits object', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ limits: { daily: 5, monthly: 50 } });
        expect(res.status).toBe(200);
    });

    it('returns 400 when limits.daily <= 0', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ limits: { daily: 0 } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/limits\.daily/i);
    });

    it('returns 400 when limits.weekly is NaN', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ limits: { weekly: 'bad' } });
        expect(res.status).toBe(400);
    });

    it('allows null values in limits (clear limit)', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({ limits: { hourly: null } });
        expect(res.status).toBe(200);
    });

    it('passes empty body through without error', async () => {
        const res = await request(buildApp())
            .put('/budget/config')
            .send({});
        expect(res.status).toBe(200);
    });
});

// =============================================================================
// POST /budget/resume
// =============================================================================

describe('POST /budget/resume', () => {
    it('returns result from forceResume', async () => {
        const res = await request(buildApp()).post('/budget/resume');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('resumed');
        expect(mockForceResume).toHaveBeenCalled();
    });
});
