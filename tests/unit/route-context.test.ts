/**
 * Unit tests for routes/context.ts —
 * context engine REST endpoints and cross-session insights.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleContext = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleContext: mockHandleContext,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const contextRouter = (await import('../../routes/context.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(contextRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockHandleContext.mockResolvedValue({ ok: true });
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// POST /context/prepare
// =============================================================================

describe('POST /context/prepare', () => {
    it('calls handleContext with action=prepare and body fields', async () => {
        await request(app)
            .post('/context/prepare')
            .send({ sessionId: 'sess-1', message: 'hello world', modelProfile: 'small' });

        expect(mockHandleContext).toHaveBeenCalledWith({
            action: 'prepare',
            sessionId: 'sess-1',
            message: 'hello world',
            modelProfile: 'small',
        });
    });

    it('returns the handleContext result', async () => {
        mockHandleContext.mockResolvedValue({ systemPrompt: 'You are helpful', nodes: [] });

        const res = await request(app).post('/context/prepare').send({ sessionId: 's1', message: 'hi' });

        expect(res.status).toBe(200);
        expect(res.body.systemPrompt).toBe('You are helpful');
    });
});

// =============================================================================
// POST /context/update
// =============================================================================

describe('POST /context/update', () => {
    it('calls handleContext with action=update and body', async () => {
        await request(app)
            .post('/context/update')
            .send({ sessionId: 'sess-1', message: 'model response text' });

        expect(mockHandleContext).toHaveBeenCalledWith({
            action: 'update',
            sessionId: 'sess-1',
            message: 'model response text',
        });
    });

    it('returns the handleContext result', async () => {
        mockHandleContext.mockResolvedValue({ qualityScore: 0.8 });

        const res = await request(app).post('/context/update').send({ sessionId: 's1', message: 'r' });

        expect(res.body.qualityScore).toBe(0.8);
    });
});

// =============================================================================
// GET /context/session/:id
// =============================================================================

describe('GET /context/session/:id', () => {
    it('calls handleContext with action=session and sessionId from param', async () => {
        await request(app).get('/context/session/my-session-id');

        expect(mockHandleContext).toHaveBeenCalledWith({
            action: 'session',
            sessionId: 'my-session-id',
        });
    });

    it('returns session state', async () => {
        mockHandleContext.mockResolvedValue({ sessionId: 'my-session-id', turnCount: 5 });

        const res = await request(app).get('/context/session/my-session-id');

        expect(res.status).toBe(200);
        expect(res.body.turnCount).toBe(5);
    });
});

// =============================================================================
// GET /context/sessions
// =============================================================================

describe('GET /context/sessions', () => {
    it('calls handleContext with action=sessions', async () => {
        await request(app).get('/context/sessions');

        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'sessions' });
    });

    it('returns sessions list', async () => {
        mockHandleContext.mockResolvedValue({ sessions: [{ id: 's1' }, { id: 's2' }] });

        const res = await request(app).get('/context/sessions');

        expect(res.body.sessions).toHaveLength(2);
    });
});

// =============================================================================
// DELETE /context/session/:id
// =============================================================================

describe('DELETE /context/session/:id', () => {
    it('calls handleContext with action=delete and sessionId', async () => {
        await request(app).delete('/context/session/to-delete');

        expect(mockHandleContext).toHaveBeenCalledWith({
            action: 'delete',
            sessionId: 'to-delete',
        });
    });

    it('returns deletion result', async () => {
        mockHandleContext.mockResolvedValue({ deleted: true });

        const res = await request(app).delete('/context/session/s1');

        expect(res.body.deleted).toBe(true);
    });
});

// =============================================================================
// GET /context/budgets
// =============================================================================

describe('GET /context/budgets', () => {
    it('calls handleContext with action=budgets', async () => {
        await request(app).get('/context/budgets');

        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'budgets' });
    });

    it('returns budget config', async () => {
        mockHandleContext.mockResolvedValue({ micro: 1000, small: 2000 });

        const res = await request(app).get('/context/budgets');

        expect(res.body.micro).toBe(1000);
    });
});

// =============================================================================
// GET /context/metrics/:id
// =============================================================================

describe('GET /context/metrics/:id', () => {
    it('calls handleContext with action=metrics and sessionId', async () => {
        await request(app).get('/context/metrics/sess-123');

        expect(mockHandleContext).toHaveBeenCalledWith({
            action: 'metrics',
            sessionId: 'sess-123',
        });
    });

    it('returns quality metrics', async () => {
        mockHandleContext.mockResolvedValue({ knowledgeUtilization: 0.75, responseGrounding: 0.6 });

        const res = await request(app).get('/context/metrics/s1');

        expect(res.body.knowledgeUtilization).toBe(0.75);
    });
});

// =============================================================================
// GET /context/insights
// =============================================================================

describe('GET /context/insights', () => {
    it('returns insights and node usage', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 'synthesis', weight: 0.9, usage_count: 5, domain: 'science', cluster_terms: '["a","b"]', last_seen: '2024-01-01', first_seen: '2024-01-01' },
            ])
            .mockResolvedValueOnce([
                { node_id: 'n1', times_delivered: 3, times_used: 2, avg_similarity: 0.8, last_used: '2024-01-01' },
            ]);

        const res = await request(app).get('/context/insights');

        expect(res.status).toBe(200);
        expect(res.body.insights).toHaveLength(1);
        expect(res.body.insights[0].cluster_terms).toEqual(['a', 'b']);
        expect(res.body.nodeUsage).toHaveLength(1);
        expect(res.body.totalInsights).toBe(1);
        expect(res.body.totalNodeUsage).toBe(1);
    });

    it('parses cluster_terms JSON for each insight', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 't1', weight: 1, usage_count: 1, domain: 'd', cluster_terms: '["term1","term2"]', last_seen: '', first_seen: '' },
            ])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/context/insights');

        expect(res.body.insights[0].cluster_terms).toEqual(['term1', 'term2']);
    });

    it('returns empty cluster_terms array when cluster_terms is null', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 't1', weight: 1, usage_count: 1, domain: 'd', cluster_terms: null, last_seen: '', first_seen: '' },
            ])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/context/insights');

        expect(res.body.insights[0].cluster_terms).toEqual([]);
    });
});

// =============================================================================
// DELETE /context/insights
// =============================================================================

describe('DELETE /context/insights', () => {
    it('deletes session_insights and session_node_usage tables', async () => {
        const res = await request(app).delete('/context/insights');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const deletedInsights = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM session_insights')
        );
        const deletedNodeUsage = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM session_node_usage')
        );
        expect(deletedInsights).toBeDefined();
        expect(deletedNodeUsage).toBeDefined();
    });
});

// =============================================================================
// GET /context/aggregate
// =============================================================================

describe('GET /context/aggregate', () => {
    it('returns aggregate stats combining sessions and DB insights', async () => {
        mockHandleContext.mockResolvedValue({
            sessions: [
                { turnCount: 3, topics: ['synthesis', 'voicing'] },
                { turnCount: 5, topics: ['research'] },
            ],
        });
        mockQueryOne.mockResolvedValue({ total: '10', domains: '3', avgUsage: '2.5' });

        const res = await request(app).get('/context/aggregate');

        expect(res.status).toBe(200);
        expect(res.body.activeSessions).toBe(2);
        expect(res.body.totalTurns).toBe(8);
        expect(res.body.persistedInsights).toBe(10);
        expect(res.body.insightDomains).toBe(3);
    });

    it('accumulates topic counts from all sessions', async () => {
        mockHandleContext.mockResolvedValue({
            sessions: [
                { turnCount: 1, topics: ['synthesis', 'voicing'] },
                { turnCount: 1, topics: ['synthesis'] },
            ],
        });
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/context/aggregate');

        expect(res.body.topTopics.synthesis).toBe(2);
        expect(res.body.topTopics.voicing).toBe(1);
    });

    it('handles empty sessions gracefully', async () => {
        mockHandleContext.mockResolvedValue({ sessions: [] });
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/context/aggregate');

        expect(res.status).toBe(200);
        expect(res.body.activeSessions).toBe(0);
        expect(res.body.totalTurns).toBe(0);
    });
});
