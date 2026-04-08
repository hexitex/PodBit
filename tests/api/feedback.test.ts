/**
 * API tests for routes/feedback.ts
 *
 * Tests: POST /nodes/:id/feedback, GET /nodes/:id/feedback,
 *        GET /feedback/stats, GET /feedback/unrated
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleFeedback = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockGetNodeFeedback = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleFeedback: mockHandleFeedback,
}));

jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    getNodeFeedback: mockGetNodeFeedback,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: feedbackRouter } = await import('../../routes/feedback.js');

/** Express app with feedback router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', feedbackRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleFeedback.mockResolvedValue({ success: true });
    mockGetNodeFeedback.mockResolvedValue([]);
});

// =============================================================================
// POST /nodes/:id/feedback
// =============================================================================

describe('POST /nodes/:id/feedback', () => {
    it('records feedback and returns result', async () => {
        mockHandleFeedback.mockResolvedValue({ success: true, nodeId: 'node-1', rating: 1 });
        const res = await request(buildApp())
            .post('/nodes/node-1/feedback')
            .send({ rating: 1, source: 'human' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('calls handleFeedback with action:rate and nodeId', async () => {
        await request(buildApp())
            .post('/nodes/node-1/feedback')
            .send({ rating: 1, note: 'useful' });
        expect(mockHandleFeedback).toHaveBeenCalledWith(expect.objectContaining({
            action: 'rate',
            nodeId: 'node-1',
            rating: 1,
            note: 'useful',
        }));
    });

    it('returns 400 when result has error', async () => {
        mockHandleFeedback.mockResolvedValue({ error: 'Node not found' });
        const res = await request(buildApp())
            .post('/nodes/node-1/feedback')
            .send({ rating: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Node not found');
    });
});

// =============================================================================
// GET /nodes/:id/feedback
// =============================================================================

describe('GET /nodes/:id/feedback', () => {
    it('returns nodeId, count, and feedback array', async () => {
        mockGetNodeFeedback.mockResolvedValue([
            { rating: 1, source: 'human', created_at: '2024-01-01' },
        ]);
        const res = await request(buildApp()).get('/nodes/node-1/feedback');
        expect(res.status).toBe(200);
        expect(res.body.nodeId).toBe('node-1');
        expect(res.body.count).toBe(1);
        expect(Array.isArray(res.body.feedback)).toBe(true);
    });

    it('calls getNodeFeedback with the node id', async () => {
        await request(buildApp()).get('/nodes/node-42/feedback');
        expect(mockGetNodeFeedback).toHaveBeenCalledWith('node-42');
    });

    it('returns count 0 when no feedback', async () => {
        mockGetNodeFeedback.mockResolvedValue([]);
        const res = await request(buildApp()).get('/nodes/node-1/feedback');
        expect(res.body.count).toBe(0);
        expect(res.body.feedback).toEqual([]);
    });
});

// =============================================================================
// GET /feedback/stats
// =============================================================================

describe('GET /feedback/stats', () => {
    it('returns stats from handleFeedback', async () => {
        mockHandleFeedback.mockResolvedValue({ total: 100, positive: 80, negative: 5, neutral: 15 });
        const res = await request(buildApp()).get('/feedback/stats');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(100);
    });

    it('passes domain and days params', async () => {
        await request(buildApp()).get('/feedback/stats?domain=ideas&days=7&limit=5');
        expect(mockHandleFeedback).toHaveBeenCalledWith(expect.objectContaining({
            action: 'stats',
            domain: 'ideas',
            days: 7,
            limit: 5,
        }));
    });

    it('returns 400 on error', async () => {
        mockHandleFeedback.mockResolvedValue({ error: 'DB failure' });
        const res = await request(buildApp()).get('/feedback/stats');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('DB failure');
    });
});

// =============================================================================
// GET /feedback/unrated
// =============================================================================

describe('GET /feedback/unrated', () => {
    it('returns unrated nodes', async () => {
        mockHandleFeedback.mockResolvedValue({ nodes: [{ id: 'n-1', content: 'test' }], total: 1 });
        const res = await request(buildApp()).get('/feedback/unrated');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
    });

    it('passes all filter params', async () => {
        await request(buildApp()).get(
            '/feedback/unrated?domain=test&nodeType=seed&limit=10&minWeight=0.5&maxWeight=2.0&orderBy=recent'
        );
        expect(mockHandleFeedback).toHaveBeenCalledWith(expect.objectContaining({
            action: 'unrated',
            domain: 'test',
            nodeType: 'seed',
            limit: 10,
            minWeight: 0.5,
            maxWeight: 2.0,
            orderBy: 'recent',
        }));
    });

    it('returns 400 on error', async () => {
        mockHandleFeedback.mockResolvedValue({ error: 'Invalid domain' });
        const res = await request(buildApp()).get('/feedback/unrated');
        expect(res.status).toBe(400);
    });
});
