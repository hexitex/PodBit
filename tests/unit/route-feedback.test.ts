/**
 * Unit tests for routes/feedback.ts —
 * POST/GET node feedback, GET feedback stats, GET unrated nodes.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleFeedback = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleFeedback: mockHandleFeedback,
}));

const mockGetNodeFeedback = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    getNodeFeedback: mockGetNodeFeedback,
}));

// =============================================================================
// Import under test (after mocks)
// =============================================================================

const { default: feedbackRouter } = await import('../../routes/feedback.js');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', feedbackRouter);
    return app;
}

// =============================================================================
// Tests
// =============================================================================

describe('routes/feedback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // POST /nodes/:id/feedback
    // =========================================================================
    describe('POST /nodes/:id/feedback', () => {
        it('records feedback and returns result', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ success: true, feedbackId: 'fb-1' });
            const app = buildApp();
            const res = await request(app)
                .post('/nodes/node-abc/feedback')
                .send({ rating: 1, source: 'human', note: 'great insight' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, feedbackId: 'fb-1' });
            expect(mockHandleFeedback).toHaveBeenCalledWith({
                action: 'rate',
                nodeId: 'node-abc',
                rating: 1,
                source: 'human',
                note: 'great insight',
            });
        });

        it('returns 400 when handler returns error', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ error: 'Invalid rating' });
            const app = buildApp();
            const res = await request(app)
                .post('/nodes/node-xyz/feedback')
                .send({ rating: 99 });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Invalid rating' });
        });
    });

    // =========================================================================
    // GET /nodes/:id/feedback
    // =========================================================================
    describe('GET /nodes/:id/feedback', () => {
        it('returns feedback history for a node', async () => {
            const feedbackItems = [
                { id: 'fb-1', rating: 1, source: 'human' },
                { id: 'fb-2', rating: -1, source: 'agent' },
            ];
            mockGetNodeFeedback.mockResolvedValueOnce(feedbackItems);
            const app = buildApp();
            const res = await request(app).get('/nodes/node-abc/feedback');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                nodeId: 'node-abc',
                count: 2,
                feedback: feedbackItems,
            });
            expect(mockGetNodeFeedback).toHaveBeenCalledWith('node-abc');
        });

        it('returns empty feedback list', async () => {
            mockGetNodeFeedback.mockResolvedValueOnce([]);
            const app = buildApp();
            const res = await request(app).get('/nodes/node-empty/feedback');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                nodeId: 'node-empty',
                count: 0,
                feedback: [],
            });
        });
    });

    // =========================================================================
    // GET /feedback/stats
    // =========================================================================
    describe('GET /feedback/stats', () => {
        it('returns aggregated stats with default params', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ totalRatings: 50 });
            const app = buildApp();
            const res = await request(app).get('/feedback/stats');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ totalRatings: 50 });
            expect(mockHandleFeedback).toHaveBeenCalledWith({
                action: 'stats',
                domain: undefined,
                days: undefined,
                limit: undefined,
            });
        });

        it('passes query params for domain, days, limit', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ totalRatings: 10 });
            const app = buildApp();
            const res = await request(app).get('/feedback/stats?domain=physics&days=7&limit=5');

            expect(res.status).toBe(200);
            expect(mockHandleFeedback).toHaveBeenCalledWith({
                action: 'stats',
                domain: 'physics',
                days: 7,
                limit: 5,
            });
        });

        it('returns 400 on handler error', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ error: 'DB error' });
            const app = buildApp();
            const res = await request(app).get('/feedback/stats');

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'DB error' });
        });
    });

    // =========================================================================
    // GET /feedback/unrated
    // =========================================================================
    describe('GET /feedback/unrated', () => {
        it('returns unrated nodes with default params', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ nodes: [{ id: 'n1' }] });
            const app = buildApp();
            const res = await request(app).get('/feedback/unrated');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ nodes: [{ id: 'n1' }] });
            expect(mockHandleFeedback).toHaveBeenCalledWith({
                action: 'unrated',
                domain: undefined,
                nodeType: undefined,
                limit: undefined,
                minWeight: undefined,
                maxWeight: undefined,
                orderBy: undefined,
            });
        });

        it('passes all query params', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ nodes: [] });
            const app = buildApp();
            const res = await request(app).get(
                '/feedback/unrated?domain=bio&nodeType=seed&limit=10&minWeight=0.5&maxWeight=2.0&orderBy=salience'
            );

            expect(res.status).toBe(200);
            expect(mockHandleFeedback).toHaveBeenCalledWith({
                action: 'unrated',
                domain: 'bio',
                nodeType: 'seed',
                limit: 10,
                minWeight: 0.5,
                maxWeight: 2.0,
                orderBy: 'salience',
            });
        });

        it('returns 400 on handler error', async () => {
            mockHandleFeedback.mockResolvedValueOnce({ error: 'No access' });
            const app = buildApp();
            const res = await request(app).get('/feedback/unrated');

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'No access' });
        });
    });
});
