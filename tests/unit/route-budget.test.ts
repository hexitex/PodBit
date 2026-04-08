/**
 * Unit tests for routes/budget.ts — budget status, config, update, resume.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetBudgetStatus = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
const mockLoadBudgetConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ limits: {} });
const mockUpdateBudgetConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ updated: true });
const mockForceResume = jest.fn<() => Promise<any>>().mockResolvedValue({ resumed: true });

jest.unstable_mockModule('../../models/budget.js', () => ({
    getBudgetStatus: mockGetBudgetStatus,
    loadBudgetConfig: mockLoadBudgetConfig,
    updateBudgetConfig: mockUpdateBudgetConfig,
    forceResume: mockForceResume,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

// =============================================================================
// Import router after mocks
// =============================================================================

const { default: budgetRouter } = await import('../../routes/budget.js');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(budgetRouter);
    return app;
}

// =============================================================================
// Tests
// =============================================================================

describe('routes/budget', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // GET /budget/status
    // -------------------------------------------------------------------------
    describe('GET /budget/status', () => {
        it('returns budget status', async () => {
            const status = { paused: false, utilization: 0.4, warnings: [] };
            mockGetBudgetStatus.mockResolvedValue(status);

            const res = await request(buildApp()).get('/budget/status');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(status);
            expect(mockGetBudgetStatus).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // GET /budget/config
    // -------------------------------------------------------------------------
    describe('GET /budget/config', () => {
        it('returns budget config', async () => {
            const cfg = { limits: { daily: 5 }, warningThreshold: 0.8 };
            mockLoadBudgetConfig.mockResolvedValue(cfg);

            const res = await request(buildApp()).get('/budget/config');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(cfg);
            expect(mockLoadBudgetConfig).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // PUT /budget/config
    // -------------------------------------------------------------------------
    describe('PUT /budget/config', () => {
        it('updates config with valid body', async () => {
            const result = { updated: true };
            mockUpdateBudgetConfig.mockResolvedValue(result);

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 0.9 });

            expect(res.status).toBe(200);
            expect(res.body).toEqual(result);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ warningThreshold: 0.9 })
            );
        });

        it('passes through body with no special fields', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ someOtherField: 'hello' });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith({ someOtherField: 'hello' });
        });

        // warningThreshold validation
        it('rejects warningThreshold below 0.5', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 0.3 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/warningThreshold/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects warningThreshold above 0.99', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 1.0 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/warningThreshold/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects NaN warningThreshold', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 'abc' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/warningThreshold/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('accepts warningThreshold at boundary 0.5', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 0.5 });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ warningThreshold: 0.5 })
            );
        });

        it('accepts warningThreshold at boundary 0.99', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: 0.99 });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ warningThreshold: 0.99 })
            );
        });

        it('coerces warningThreshold string to number', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ warningThreshold: '0.75' });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ warningThreshold: 0.75 })
            );
        });

        // forceResumeBudget validation
        it('rejects forceResumeBudget <= 0', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ forceResumeBudget: 0 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/forceResumeBudget/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects negative forceResumeBudget', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ forceResumeBudget: -5 });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/forceResumeBudget/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects NaN forceResumeBudget', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ forceResumeBudget: 'notanumber' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/forceResumeBudget/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('accepts valid forceResumeBudget', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ forceResumeBudget: 10.5 });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ forceResumeBudget: 10.5 })
            );
        });

        it('coerces forceResumeBudget string to number', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ forceResumeBudget: '25' });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({ forceResumeBudget: 25 })
            );
        });

        // limits validation
        it('rejects invalid limits.hourly', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { hourly: -1 } });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/limits\.hourly/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects NaN limits.daily', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { daily: 'bad' } });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/limits\.daily/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects zero limits.weekly', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { weekly: 0 } });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/limits\.weekly/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('rejects invalid limits.monthly', async () => {
            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { monthly: 'nope' } });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/limits\.monthly/);
            expect(mockUpdateBudgetConfig).not.toHaveBeenCalled();
        });

        it('accepts valid limits', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { hourly: 1, daily: 5, weekly: 20, monthly: 50 } });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    limits: { hourly: 1, daily: 5, weekly: 20, monthly: 50 },
                })
            );
        });

        it('allows null limits (to clear a limit)', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { hourly: null, daily: 10 } });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    limits: { hourly: null, daily: 10 },
                })
            );
        });

        it('coerces limits string values to numbers', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({ limits: { daily: '7.5' } });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith(
                expect.objectContaining({
                    limits: { daily: 7.5 },
                })
            );
        });

        it('validates all fields together', async () => {
            mockUpdateBudgetConfig.mockResolvedValue({ ok: true });

            const res = await request(buildApp())
                .put('/budget/config')
                .send({
                    warningThreshold: 0.85,
                    forceResumeBudget: 15,
                    limits: { daily: 10 },
                });

            expect(res.status).toBe(200);
            expect(mockUpdateBudgetConfig).toHaveBeenCalledWith({
                warningThreshold: 0.85,
                forceResumeBudget: 15,
                limits: { daily: 10 },
            });
        });
    });

    // -------------------------------------------------------------------------
    // POST /budget/resume
    // -------------------------------------------------------------------------
    describe('POST /budget/resume', () => {
        it('calls forceResume and returns result', async () => {
            const result = { resumed: true, message: 'Budget resumed' };
            mockForceResume.mockResolvedValue(result);

            const res = await request(buildApp()).post('/budget/resume');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(result);
            expect(mockForceResume).toHaveBeenCalledTimes(1);
        });
    });
});
