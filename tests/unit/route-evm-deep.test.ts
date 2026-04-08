/**
 * Deep branch-coverage tests for routes/evm.ts
 * Covers: error paths for analyse, history, reviews, dismiss, stats, decompose/apply,
 * queue error paths, reevaluate-reviews body params, prune query dryRun, reevaluate error.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleEVM = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../handlers/evm.js', () => ({
    handleLabVerify: mockHandleEVM,
}));

const mockBulkApproveReview = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 2 });
const mockGetReevalProgress = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'idle' });
const mockResetReevalProgress = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../evm/feedback.js', () => ({
    bulkApproveReview: mockBulkApproveReview,
    getReevalProgress: mockGetReevalProgress,
    resetReevalProgress: mockResetReevalProgress,
}));

const mockCoreQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockCoreQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const evmRouter = (await import('../../routes/evm.js')).default;

const app = express();
app.use(express.json());
app.use(evmRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleEVM.mockResolvedValue({ success: true });
    mockBulkApproveReview.mockResolvedValue({ processed: 2 });
    mockGetReevalProgress.mockResolvedValue({ status: 'idle' });
    mockResetReevalProgress.mockResolvedValue(undefined);
    mockCoreQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /evm/analyse/:nodeId — error path
// =============================================================================

describe('POST /evm/analyse/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Node not found' });

        const res = await request(app).post('/lab/analyse/bad-node');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Node not found');
    });
});

// =============================================================================
// GET /evm/history/:nodeId — error path
// =============================================================================

describe('GET /evm/history/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Node has no history' });

        const res = await request(app).get('/lab/history/bad-node');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('no history');
    });
});

// =============================================================================
// GET /evm/reviews — error path
// =============================================================================

describe('GET /evm/reviews — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Database error' });

        const res = await request(app).get('/lab/reviews');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/dismiss/:nodeId — error path
// =============================================================================

describe('POST /evm/dismiss/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Cannot dismiss' });

        const res = await request(app).post('/lab/dismiss/bad-node');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/stats — error path
// =============================================================================

describe('GET /evm/stats — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Stats unavailable' });

        const res = await request(app).get('/lab/stats');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/decompose/:nodeId/apply — error path
// =============================================================================

describe('POST /evm/decompose/:nodeId/apply — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Decomposition not found' });

        const res = await request(app)
            .post('/lab/decompose/node-1/apply')
            .send({ facts: [], questions: [] });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/queue/:nodeId — error path
// =============================================================================

describe('POST /evm/queue/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Node already queued' });

        const res = await request(app)
            .post('/lab/queue/node-1')
            .send({});

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// DELETE /evm/queue/node/:nodeId — error path
// =============================================================================

describe('DELETE /evm/queue/node/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Not in queue' });

        const res = await request(app).delete('/lab/queue/node/node-1');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// DELETE /evm/queue/:id — error path
// =============================================================================

describe('DELETE /evm/queue/:id — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Queue item not found' });

        const res = await request(app).delete('/lab/queue/999');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/queue — error path
// =============================================================================

describe('GET /evm/queue — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Queue fetch failed' });

        const res = await request(app).get('/lab/queue');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/reevaluate-reviews — body params
// =============================================================================

describe('POST /evm/reevaluate-reviews — body rerunLLM', () => {
    it('passes rerunLLM from body', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app)
            .post('/lab/reevaluate-reviews')
            .send({ rerunLLM: true });

        expect(res.status).toBe(200);
        expect(res.body.rerunLLM).toBe(true);
    });

    it('passes nodeId from query string', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app)
            .post('/lab/reevaluate-reviews?nodeId=query-node');

        expect(res.status).toBe(200);
        expect(res.body.nodeId).toBe('query-node');
    });

    it('returns null nodeId when none provided', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app).post('/lab/reevaluate-reviews');

        expect(res.body.nodeId).toBeNull();
    });
});

// =============================================================================
// POST /evm/reevaluate — error path
// =============================================================================

describe('POST /evm/reevaluate — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'No executions found' });

        const res = await request(app).post('/lab/reevaluate');

        expect(res.status).toBe(400);
    });

    it('passes dryRun from body', async () => {
        mockHandleEVM.mockResolvedValue({ processed: 0 });

        await request(app)
            .post('/lab/reevaluate')
            .send({ dryRun: true });

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            dryRun: true,
        }));
    });

    it('passes nodeId from query', async () => {
        mockHandleEVM.mockResolvedValue({ processed: 0 });

        await request(app).post('/lab/reevaluate?nodeId=q-node');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 'q-node',
        }));
    });
});

// =============================================================================
// POST /evm/prune — dryRun from query string
// =============================================================================

describe('POST /evm/prune — query params', () => {
    it('passes dryRun from query string', async () => {
        mockHandleEVM.mockResolvedValue({ deleted: 0 });

        await request(app).post('/lab/prune?dryRun=true');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            dryRun: true,
        }));
    });

    it('passes olderThanDays from query string', async () => {
        mockHandleEVM.mockResolvedValue({ deleted: 0 });

        await request(app).post('/lab/prune?olderThanDays=60');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            olderThanDays: '60',
        }));
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Prune failed' });

        const res = await request(app).post('/lab/prune');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/recent — error path
// =============================================================================

describe('GET /evm/recent — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Query failed' });

        const res = await request(app).get('/lab/recent');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/review/:nodeId — error path
// =============================================================================

describe('POST /evm/review/:nodeId — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Review failed' });

        const res = await request(app)
            .post('/lab/review/node-1')
            .send({ approved: true });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/suggest/:nodeId — success without error
// =============================================================================

describe('POST /evm/suggest/:nodeId — success', () => {
    it('returns suggestions successfully', async () => {
        mockHandleEVM.mockResolvedValue({ suggestions: ['test hypothesis'] });

        const res = await request(app).post('/lab/suggest/node-1');

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toContain('test hypothesis');
    });
});

// =============================================================================
// GET /evm/recent — partial filter params
// =============================================================================

describe('GET /evm/recent — partial filters', () => {
    it('handles undefined optional params gracefully', async () => {
        mockHandleEVM.mockResolvedValue({ executions: [] });

        await request(app).get('/lab/recent?days=3');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'recent',
            days: 3,
            limit: undefined,
            offset: undefined,
            status: undefined,
        }));
    });

    it('passes minConfidence and maxConfidence as numbers', async () => {
        mockHandleEVM.mockResolvedValue({ executions: [] });

        await request(app).get('/lab/recent?minConfidence=0.3&maxConfidence=0.95');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            minConfidence: 0.3,
            maxConfidence: 0.95,
        }));
    });
});

// =============================================================================
// POST /evm/verify/:nodeId — no guidance
// =============================================================================

describe('POST /evm/verify/:nodeId — no guidance', () => {
    it('passes undefined guidance when not provided', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'verified' });

        await request(app).post('/lab/verify/node-1');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'verify',
            nodeId: 'node-1',
            guidance: undefined,
        }));
    });
});

// =============================================================================
// POST /evm/queue/:nodeId — custom queuedBy
// =============================================================================

describe('POST /evm/queue/:nodeId — queuedBy', () => {
    it('uses provided queuedBy instead of default', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        await request(app)
            .post('/lab/queue/node-1')
            .send({ queuedBy: 'automated-scan' });

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            queuedBy: 'automated-scan',
        }));
    });
});

// =============================================================================
// GET /evm/queue — no filters
// =============================================================================

describe('GET /evm/queue — no filters', () => {
    it('passes undefined for all optional params', async () => {
        mockHandleEVM.mockResolvedValue({ entries: [] });

        await request(app).get('/lab/queue');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'queue',
            status: undefined,
            nodeId: undefined,
            limit: undefined,
            offset: undefined,
        }));
    });
});
