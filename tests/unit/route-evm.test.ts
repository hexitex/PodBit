/**
 * Unit tests for routes/evm.ts —
 * EVM REST API routes: queue, verify, history, stats, reviews, reevaluate, prune, decompose.
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

// Build test app
const app = express();
app.use(express.json());
app.use(evmRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockHandleEVM.mockResolvedValue({ success: true });
    mockBulkApproveReview.mockResolvedValue({ processed: 2 });
    mockGetReevalProgress.mockResolvedValue({ status: 'idle' });
    mockResetReevalProgress.mockResolvedValue(undefined);
    mockCoreQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /evm/queue/bulk
// =============================================================================

describe('POST /evm/queue/bulk', () => {
    it('enqueues multiple nodes', async () => {
        mockHandleEVM.mockResolvedValue({ success: true, queued: 3 });

        const res = await request(app)
            .post('/lab/queue/bulk')
            .send({ nodeIds: ['n1', 'n2', 'n3'], priority: 5, queuedBy: 'test' });

        expect(res.status).toBe(200);
        expect(res.body.queued).toBe(3);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'enqueue',
            nodeIds: ['n1', 'n2', 'n3'],
            priority: 5,
            queuedBy: 'test',
        }));
    });

    it('returns 400 on error from handler', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'No nodeIds provided' });

        const res = await request(app)
            .post('/lab/queue/bulk')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No nodeIds');
    });

    it('defaults queuedBy to bulk', async () => {
        await request(app)
            .post('/lab/queue/bulk')
            .send({ nodeIds: ['n1'] });

        expect(mockHandleEVM).toHaveBeenCalledWith(
            expect.objectContaining({ queuedBy: 'bulk' })
        );
    });
});

// =============================================================================
// GET /evm/queue/stats
// =============================================================================

describe('GET /evm/queue/stats', () => {
    it('returns queue stats', async () => {
        mockHandleEVM.mockResolvedValue({ pending: 5, running: 1 });

        const res = await request(app).get('/lab/queue/stats');

        expect(res.status).toBe(200);
        expect(res.body.pending).toBe(5);
        expect(mockHandleEVM).toHaveBeenCalledWith({ action: 'queue_stats' });
    });

    it('returns 400 on handler error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Queue unavailable' });

        const res = await request(app).get('/lab/queue/stats');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/queue
// =============================================================================

describe('GET /evm/queue', () => {
    it('returns queue entries', async () => {
        mockHandleEVM.mockResolvedValue({ entries: [{ id: 1 }] });

        const res = await request(app).get('/lab/queue');

        expect(res.status).toBe(200);
        expect(res.body.entries).toHaveLength(1);
    });

    it('passes filter params', async () => {
        await request(app).get('/lab/queue?status=pending&nodeId=abc&limit=10&offset=5');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'queue',
            status: 'pending',
            nodeId: 'abc',
            limit: 10,
            offset: 5,
        }));
    });
});

// =============================================================================
// POST /evm/queue/:nodeId
// =============================================================================

describe('POST /evm/queue/:nodeId', () => {
    it('enqueues single node', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        const res = await request(app)
            .post('/lab/queue/node-123')
            .send({ priority: 10 });

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'enqueue',
            nodeId: 'node-123',
            priority: 10,
            queuedBy: 'manual',
        }));
    });
});

// =============================================================================
// DELETE /evm/queue/node/:nodeId
// =============================================================================

describe('DELETE /evm/queue/node/:nodeId', () => {
    it('cancels by node ID', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        const res = await request(app).delete('/lab/queue/node/abc-123');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'cancel',
            nodeId: 'abc-123',
        }));
    });
});

// =============================================================================
// DELETE /evm/queue/:id
// =============================================================================

describe('DELETE /evm/queue/:id', () => {
    it('cancels by queue ID', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        const res = await request(app).delete('/lab/queue/42');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'cancel',
            queueId: 42,
        }));
    });
});

// =============================================================================
// POST /evm/verify/:nodeId
// =============================================================================

describe('POST /evm/verify/:nodeId', () => {
    it('verifies a node', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'verified', confidence: 0.9 });

        const res = await request(app)
            .post('/lab/verify/node-1')
            .send({ guidance: 'Check carefully' });

        expect(res.status).toBe(200);
        expect(res.body.confidence).toBe(0.9);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'verify',
            nodeId: 'node-1',
            guidance: 'Check carefully',
        }));
    });

    it('returns 429 on budget exceeded', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'skipped', error: 'Budget exceeded for today' });

        const res = await request(app).post('/lab/verify/node-1');

        expect(res.status).toBe(429);
    });

    it('returns 200 for pipeline failures (not client errors)', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'failed', error: 'Code execution failed' });

        const res = await request(app).post('/lab/verify/node-1');

        expect(res.status).toBe(200);
    });
});

// =============================================================================
// POST /evm/suggest/:nodeId
// =============================================================================

describe('POST /evm/suggest/:nodeId', () => {
    it('returns suggestions', async () => {
        mockHandleEVM.mockResolvedValue({ suggestions: ['test X'] });

        const res = await request(app).post('/lab/suggest/node-1');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'suggest',
            nodeId: 'node-1',
        }));
    });

    it('returns 400 on handler error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Node not found' });

        const res = await request(app).post('/lab/suggest/bad-id');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/analyse/:nodeId
// =============================================================================

describe('POST /evm/analyse/:nodeId', () => {
    it('returns analysis', async () => {
        mockHandleEVM.mockResolvedValue({ analysis: { score: 0.8 } });

        const res = await request(app).post('/lab/analyse/node-1');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'analyse',
            nodeId: 'node-1',
        }));
    });
});

// =============================================================================
// GET /evm/history/:nodeId
// =============================================================================

describe('GET /evm/history/:nodeId', () => {
    it('returns history for a node (slim by default)', async () => {
        mockHandleEVM.mockResolvedValue({ history: [] });

        const res = await request(app).get('/lab/history/node-1');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'history',
            nodeId: 'node-1',
            slim: true,
        }));
    });

    it('passes full=true to disable slim', async () => {
        mockHandleEVM.mockResolvedValue({ history: [] });

        await request(app).get('/lab/history/node-1?full=true');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            slim: false,
        }));
    });
});

// =============================================================================
// GET /evm/recent
// =============================================================================

describe('GET /evm/recent', () => {
    it('returns recent executions', async () => {
        mockHandleEVM.mockResolvedValue({ executions: [] });

        const res = await request(app).get('/lab/recent');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'recent',
        }));
    });

    it('passes all filter params', async () => {
        await request(app).get('/lab/recent?days=7&limit=20&offset=5&status=passed&verified=true&minConfidence=0.5&maxConfidence=0.9&search=test&nodeId=n1');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'recent',
            days: 7,
            limit: 20,
            offset: 5,
            status: 'passed',
            verified: 'true',
            minConfidence: 0.5,
            maxConfidence: 0.9,
            search: 'test',
            nodeId: 'n1',
        }));
    });
});

// =============================================================================
// GET /evm/reviews
// =============================================================================

describe('GET /evm/reviews', () => {
    it('returns review queue', async () => {
        mockHandleEVM.mockResolvedValue({ items: [] });

        const res = await request(app).get('/lab/reviews');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'reviews',
        }));
    });

    it('passes status, limit, offset', async () => {
        await request(app).get('/lab/reviews?status=pending&limit=10&offset=0');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            limit: 10,
            offset: 0,
        }));
    });
});

// =============================================================================
// POST /evm/review/bulk
// =============================================================================

describe('POST /evm/review/bulk', () => {
    it('bulk approves reviews', async () => {
        const res = await request(app)
            .post('/lab/review/bulk')
            .send({ nodeIds: ['n1', 'n2'], approved: true, reviewer: 'admin' });

        expect(res.status).toBe(200);
        expect(mockBulkApproveReview).toHaveBeenCalledWith(['n1', 'n2'], true, 'admin');
    });

    it('returns 400 when nodeIds missing', async () => {
        const res = await request(app)
            .post('/lab/review/bulk')
            .send({ approved: true });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('nodeIds');
    });

    it('returns 400 when nodeIds is empty', async () => {
        const res = await request(app)
            .post('/lab/review/bulk')
            .send({ nodeIds: [], approved: true });

        expect(res.status).toBe(400);
    });

    it('returns 400 when approved not boolean', async () => {
        const res = await request(app)
            .post('/lab/review/bulk')
            .send({ nodeIds: ['n1'], approved: 'yes' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('approved');
    });

    it('defaults reviewer to human', async () => {
        await request(app)
            .post('/lab/review/bulk')
            .send({ nodeIds: ['n1'], approved: false });

        expect(mockBulkApproveReview).toHaveBeenCalledWith(['n1'], false, 'human');
    });
});

// =============================================================================
// POST /evm/review/:nodeId
// =============================================================================

describe('POST /evm/review/:nodeId', () => {
    it('reviews a node', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        const res = await request(app)
            .post('/lab/review/node-1')
            .send({ approved: true, reviewer: 'test-user' });

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'review',
            nodeId: 'node-1',
            approved: true,
            reviewer: 'test-user',
        }));
    });
});

// =============================================================================
// POST /evm/dismiss/:nodeId
// =============================================================================

describe('POST /evm/dismiss/:nodeId', () => {
    it('dismisses a node', async () => {
        mockHandleEVM.mockResolvedValue({ success: true });

        const res = await request(app).post('/lab/dismiss/node-1');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'dismiss',
            nodeId: 'node-1',
        }));
    });
});

// =============================================================================
// POST /evm/reevaluate-reviews
// =============================================================================

describe('POST /evm/reevaluate-reviews', () => {
    it('starts reevaluation in background', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app).post('/lab/reevaluate-reviews');

        expect(res.status).toBe(200);
        expect(res.body.started).toBe(true);
        expect(res.body.rerunLLM).toBe(false);
    });

    it('returns 409 when already running', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'running', progress: 50 });

        const res = await request(app).post('/lab/reevaluate-reviews');

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already running');
    });

    it('passes rerunLLM from query string', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app).post('/lab/reevaluate-reviews?rerunLLM=true');

        expect(res.body.rerunLLM).toBe(true);
    });

    it('passes nodeId from body', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app)
            .post('/lab/reevaluate-reviews')
            .send({ nodeId: 'specific-node' });

        expect(res.body.nodeId).toBe('specific-node');
    });
});

// =============================================================================
// GET /evm/reevaluate-reviews/progress
// =============================================================================

describe('GET /evm/reevaluate-reviews/progress', () => {
    it('returns progress', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'running', processed: 10, total: 50 });

        const res = await request(app).get('/lab/reevaluate-reviews/progress');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('running');
    });
});

// =============================================================================
// POST /evm/reevaluate-reviews/reset
// =============================================================================

describe('POST /evm/reevaluate-reviews/reset', () => {
    it('resets progress when idle', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'idle' });

        const res = await request(app).post('/lab/reevaluate-reviews/reset');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockResetReevalProgress).toHaveBeenCalled();
    });

    it('returns 409 when running', async () => {
        mockGetReevalProgress.mockResolvedValue({ status: 'running' });

        const res = await request(app).post('/lab/reevaluate-reviews/reset');

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('Cannot reset');
    });
});

// =============================================================================
// POST /evm/reevaluate
// =============================================================================

describe('POST /evm/reevaluate', () => {
    it('reevaluates with defaults', async () => {
        mockHandleEVM.mockResolvedValue({ processed: 5 });

        const res = await request(app).post('/lab/reevaluate');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'reevaluate',
            dryRun: false,
        }));
    });

    it('passes dryRun from query', async () => {
        await request(app).post('/lab/reevaluate?dryRun=true');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            dryRun: true,
        }));
    });

    it('passes nodeId from body', async () => {
        await request(app)
            .post('/lab/reevaluate')
            .send({ nodeId: 'n1' });

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 'n1',
        }));
    });
});

// =============================================================================
// POST /evm/prune
// =============================================================================

describe('POST /evm/prune', () => {
    it('prunes old executions', async () => {
        mockHandleEVM.mockResolvedValue({ deleted: 10 });

        const res = await request(app)
            .post('/lab/prune')
            .send({ olderThanDays: 30 });

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'prune',
            olderThanDays: 30,
        }));
    });

    it('passes dryRun from body', async () => {
        await request(app)
            .post('/lab/prune')
            .send({ dryRun: true });

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            dryRun: true,
        }));
    });
});

// =============================================================================
// GET /evm/stats
// =============================================================================

describe('GET /evm/stats', () => {
    it('returns EVM stats', async () => {
        mockHandleEVM.mockResolvedValue({ total: 100, passed: 80 });

        const res = await request(app).get('/lab/stats');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(100);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'stats',
        }));
    });

    it('passes days param', async () => {
        await request(app).get('/lab/stats?days=30');

        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            days: 30,
        }));
    });
});

// =============================================================================
// GET /evm/parents/:nodeId
// =============================================================================

describe('GET /evm/parents/:nodeId', () => {
    it('returns parent nodes', async () => {
        mockCoreQuery.mockResolvedValue([
            { id: 'p1', content: 'Parent 1', domain: 'test', node_type: 'seed', created_at: '2025-01-01' },
        ]);

        const res = await request(app).get('/lab/parents/child-1');

        expect(res.status).toBe(200);
        expect(res.body.parents).toHaveLength(1);
        expect(res.body.parents[0].id).toBe('p1');
    });
});

// =============================================================================
// POST /evm/decompose/:nodeId
// =============================================================================

describe('POST /evm/decompose/:nodeId', () => {
    it('decomposes a node', async () => {
        mockHandleEVM.mockResolvedValue({ facts: ['fact1'], questions: ['q1'] });

        const res = await request(app).post('/lab/decompose/node-1');

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'decompose',
            nodeId: 'node-1',
        }));
    });

    it('returns 400 on handler error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'Node not found' });

        const res = await request(app).post('/lab/decompose/bad-id');

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/decompose/:nodeId/apply
// =============================================================================

describe('POST /evm/decompose/:nodeId/apply', () => {
    it('applies decomposition', async () => {
        mockHandleEVM.mockResolvedValue({ applied: true });

        const res = await request(app)
            .post('/lab/decompose/node-1/apply')
            .send({ facts: ['fact1'], questions: ['q1'] });

        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'decompose_apply',
            nodeId: 'node-1',
            facts: ['fact1'],
            questions: ['q1'],
        }));
    });
});
