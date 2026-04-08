/**
 * API tests for routes/evm.ts
 *
 * Tests: POST /evm/queue/bulk (error propagation),
 *        GET /evm/queue/stats, GET /evm/queue,
 *        POST /evm/queue/:nodeId, DELETE /evm/queue/node/:nodeId,
 *        POST /evm/verify/:nodeId (budget-exceeded → 429),
 *        GET /evm/history/:nodeId, GET /evm/recent, GET /evm/stats
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleEVM = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../handlers/evm.js', () => ({
    handleLabVerify: mockHandleEVM,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: evmRouter } = await import('../../routes/evm.js');

/** Express app with EVM router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', evmRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleEVM.mockResolvedValue({ success: true });
});

// =============================================================================
// POST /evm/queue/bulk
// =============================================================================

describe('POST /evm/queue/bulk', () => {
    it('returns handler result on success', async () => {
        mockHandleEVM.mockResolvedValue({ enqueued: 3 });
        const res = await request(buildApp())
            .post('/lab/queue/bulk')
            .send({ nodeIds: ['a', 'b', 'c'] });
        expect(res.status).toBe(200);
        expect(res.body.enqueued).toBe(3);
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'nodeIds required' });
        const res = await request(buildApp())
            .post('/lab/queue/bulk')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('nodeIds required');
    });
});

// =============================================================================
// GET /evm/queue/stats
// =============================================================================

describe('GET /evm/queue/stats', () => {
    it('returns queue statistics', async () => {
        mockHandleEVM.mockResolvedValue({ pending: 5, running: 1, done: 20 });
        const res = await request(buildApp()).get('/lab/queue/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pending');
        expect(mockHandleEVM).toHaveBeenCalledWith({ action: 'queue_stats' });
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'DB unavailable' });
        const res = await request(buildApp()).get('/lab/queue/stats');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/queue
// =============================================================================

describe('GET /evm/queue', () => {
    it('returns queue items', async () => {
        mockHandleEVM.mockResolvedValue({ items: [], total: 0 });
        const res = await request(buildApp()).get('/lab/queue');
        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ action: 'queue' }));
    });

    it('passes status filter', async () => {
        mockHandleEVM.mockResolvedValue({ items: [] });
        await request(buildApp()).get('/lab/queue?status=pending');
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    });

    it('passes nodeId filter', async () => {
        mockHandleEVM.mockResolvedValue({ items: [] });
        await request(buildApp()).get('/lab/queue?nodeId=uuid-1');
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'uuid-1' }));
    });
});

// =============================================================================
// POST /evm/queue/:nodeId
// =============================================================================

describe('POST /evm/queue/:nodeId', () => {
    it('enqueues a node for verification', async () => {
        mockHandleEVM.mockResolvedValue({ queued: true, id: 42 });
        const res = await request(buildApp())
            .post('/lab/queue/uuid-1')
            .send({ priority: 10 });
        expect(res.status).toBe(200);
        expect(res.body.queued).toBe(true);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'enqueue',
            nodeId: 'uuid-1',
            priority: 10,
        }));
    });

    it('defaults queuedBy to manual', async () => {
        mockHandleEVM.mockResolvedValue({ queued: true });
        await request(buildApp()).post('/lab/queue/uuid-1').send({});
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ queuedBy: 'manual' }));
    });
});

// =============================================================================
// DELETE /evm/queue/node/:nodeId
// =============================================================================

describe('DELETE /evm/queue/node/:nodeId', () => {
    it('cancels queue item for node', async () => {
        mockHandleEVM.mockResolvedValue({ cancelled: true });
        const res = await request(buildApp()).delete('/lab/queue/node/uuid-1');
        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith({ action: 'cancel', nodeId: 'uuid-1' });
    });

    it('returns 400 on handler error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'not found' });
        const res = await request(buildApp()).delete('/lab/queue/node/uuid-x');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /evm/verify/:nodeId
// =============================================================================

describe('POST /evm/verify/:nodeId', () => {
    it('returns 200 with verify result on success', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'verified', confidence: 0.9 });
        const res = await request(buildApp())
            .post('/lab/verify/uuid-1')
            .send({ guidance: 'focus on math claims' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('verified');
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'verify',
            nodeId: 'uuid-1',
            guidance: 'focus on math claims',
        }));
    });

    it('returns 200 even on pipeline rejection (client should handle)', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'rejected', reason: 'unverifiable' });
        const res = await request(buildApp()).post('/lab/verify/uuid-1').send({});
        expect(res.status).toBe(200);
    });

    it('returns 429 when budget exceeded', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'skipped', error: 'Budget exceeded — paused' });
        const res = await request(buildApp()).post('/lab/verify/uuid-1').send({});
        expect(res.status).toBe(429);
    });

    it('passes undefined guidance when not provided', async () => {
        mockHandleEVM.mockResolvedValue({ status: 'verified' });
        await request(buildApp()).post('/lab/verify/uuid-1').send({});
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            guidance: undefined,
        }));
    });
});

// =============================================================================
// GET /evm/history/:nodeId
// =============================================================================

describe('GET /evm/history/:nodeId', () => {
    it('returns verification history for node', async () => {
        mockHandleEVM.mockResolvedValue({ history: [], nodeId: 'uuid-1' });
        const res = await request(buildApp()).get('/lab/history/uuid-1');
        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({
            action: 'history',
            nodeId: 'uuid-1',
            slim: true,
        }));
    });

    it('passes slim=false when ?full=true', async () => {
        mockHandleEVM.mockResolvedValue({ history: [] });
        await request(buildApp()).get('/lab/history/uuid-1?full=true');
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ slim: false }));
    });

    it('returns 400 on handler error', async () => {
        mockHandleEVM.mockResolvedValue({ error: 'node not found' });
        const res = await request(buildApp()).get('/lab/history/nonexistent');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /evm/recent
// =============================================================================

describe('GET /evm/recent', () => {
    it('returns recent verifications', async () => {
        mockHandleEVM.mockResolvedValue({ items: [], total: 0 });
        const res = await request(buildApp()).get('/lab/recent');
        expect(res.status).toBe(200);
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ action: 'recent' }));
    });

    it('passes days and limit from query', async () => {
        mockHandleEVM.mockResolvedValue({ items: [] });
        await request(buildApp()).get('/lab/recent?days=7&limit=20');
        expect(mockHandleEVM).toHaveBeenCalledWith(expect.objectContaining({ days: 7, limit: 20 }));
    });
});
