/**
 * API tests for routes/context.ts
 *
 * Tests: POST /context/prepare, POST /context/update, GET /context/session/:id,
 *        GET /context/sessions, DELETE /context/session/:id, GET /context/budgets,
 *        GET /context/metrics/:id, GET/DELETE /context/insights, GET /context/aggregate
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleContext = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
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
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: contextRouter } = await import('../../routes/context.js');

/** Express app with context router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', contextRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleContext.mockResolvedValue({ success: true });
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// POST /context/prepare
// =============================================================================

describe('POST /context/prepare', () => {
    it('calls handleContext with action:prepare and body', async () => {
        mockHandleContext.mockResolvedValue({ systemPrompt: 'You know things.', knowledge: [] });
        const res = await request(buildApp())
            .post('/context/prepare')
            .send({ message: 'hello', sessionId: 'sess-1', modelProfile: 'small' });
        expect(res.status).toBe(200);
        expect(res.body.systemPrompt).toBe('You know things.');
        expect(mockHandleContext).toHaveBeenCalledWith(expect.objectContaining({
            action: 'prepare',
            message: 'hello',
            sessionId: 'sess-1',
            modelProfile: 'small',
        }));
    });
});

// =============================================================================
// POST /context/update
// =============================================================================

describe('POST /context/update', () => {
    it('calls handleContext with action:update and body', async () => {
        mockHandleContext.mockResolvedValue({ updated: true });
        const res = await request(buildApp())
            .post('/context/update')
            .send({ sessionId: 'sess-1', message: 'The response was...' });
        expect(res.status).toBe(200);
        expect(mockHandleContext).toHaveBeenCalledWith(expect.objectContaining({
            action: 'update',
            sessionId: 'sess-1',
        }));
    });
});

// =============================================================================
// GET /context/session/:id
// =============================================================================

describe('GET /context/session/:id', () => {
    it('returns session state', async () => {
        mockHandleContext.mockResolvedValue({ sessionId: 'sess-1', turnCount: 3, topics: ['ai'] });
        const res = await request(buildApp()).get('/context/session/sess-1');
        expect(res.status).toBe(200);
        expect(res.body.sessionId).toBe('sess-1');
        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'session', sessionId: 'sess-1' });
    });
});

// =============================================================================
// GET /context/sessions
// =============================================================================

describe('GET /context/sessions', () => {
    it('lists all sessions', async () => {
        mockHandleContext.mockResolvedValue({ sessions: [{ id: 's-1' }, { id: 's-2' }] });
        const res = await request(buildApp()).get('/context/sessions');
        expect(res.status).toBe(200);
        expect(res.body.sessions).toHaveLength(2);
        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'sessions' });
    });
});

// =============================================================================
// DELETE /context/session/:id
// =============================================================================

describe('DELETE /context/session/:id', () => {
    it('deletes session', async () => {
        mockHandleContext.mockResolvedValue({ deleted: true });
        const res = await request(buildApp()).delete('/context/session/sess-1');
        expect(res.status).toBe(200);
        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'delete', sessionId: 'sess-1' });
    });
});

// =============================================================================
// GET /context/budgets
// =============================================================================

describe('GET /context/budgets', () => {
    it('returns budget configuration', async () => {
        mockHandleContext.mockResolvedValue({ profiles: { small: 2048 } });
        const res = await request(buildApp()).get('/context/budgets');
        expect(res.status).toBe(200);
        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'budgets' });
    });
});

// =============================================================================
// GET /context/metrics/:id
// =============================================================================

describe('GET /context/metrics/:id', () => {
    it('returns per-turn quality metrics', async () => {
        mockHandleContext.mockResolvedValue({ metrics: [{ turn: 1, utilization: 0.8 }] });
        const res = await request(buildApp()).get('/context/metrics/sess-1');
        expect(res.status).toBe(200);
        expect(mockHandleContext).toHaveBeenCalledWith({ action: 'metrics', sessionId: 'sess-1' });
    });
});

// =============================================================================
// GET /context/insights
// =============================================================================

describe('GET /context/insights', () => {
    it('returns insights and node usage', async () => {
        mockQuery.mockImplementation(async (sql: any) => {
            if (sql.includes('session_insights')) {
                return [{ topic: 'ai', weight: 2.5, usage_count: 5, domain: 'ideas', cluster_terms: '["ai","ml"]', last_seen: '2024-01-01', first_seen: '2023-01-01' }];
            }
            if (sql.includes('session_node_usage')) {
                return [{ node_id: 'n-1', times_delivered: 10, times_used: 7, avg_similarity: 0.85, last_used: '2024-01-01' }];
            }
            return [];
        });

        const res = await request(buildApp()).get('/context/insights');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('insights');
        expect(res.body).toHaveProperty('nodeUsage');
        expect(res.body.totalInsights).toBe(1);
        expect(res.body.totalNodeUsage).toBe(1);
        expect(Array.isArray(res.body.insights[0].cluster_terms)).toBe(true);
    });

    it('parses cluster_terms JSON', async () => {
        mockQuery.mockImplementation(async (sql: any) => {
            if (sql.includes('session_insights')) {
                return [{ topic: 'test', weight: 1, usage_count: 1, domain: 'd', cluster_terms: '["a","b"]', last_seen: '', first_seen: '' }];
            }
            return [];
        });
        const res = await request(buildApp()).get('/context/insights');
        expect(res.body.insights[0].cluster_terms).toEqual(['a', 'b']);
    });
});

// =============================================================================
// DELETE /context/insights
// =============================================================================

describe('DELETE /context/insights', () => {
    it('clears all cross-session insights', async () => {
        const res = await request(buildApp()).delete('/context/insights');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('cleared');
        expect(mockQuery).toHaveBeenCalledWith('DELETE FROM session_insights');
        expect(mockQuery).toHaveBeenCalledWith('DELETE FROM session_node_usage');
    });
});

// =============================================================================
// GET /context/aggregate
// =============================================================================

describe('GET /context/aggregate', () => {
    it('returns aggregate stats', async () => {
        mockHandleContext.mockResolvedValue({ sessions: [{ turnCount: 3, topics: ['ai', 'coding'] }] });
        mockQueryOne.mockResolvedValue({ total: '5', domains: '2', avgUsage: '3.5' });
        const res = await request(buildApp()).get('/context/aggregate');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('activeSessions');
        expect(res.body).toHaveProperty('totalTurns');
        expect(res.body).toHaveProperty('persistedInsights');
        expect(res.body.activeSessions).toBe(1);
        expect(res.body.totalTurns).toBe(3);
    });

    it('handles no active sessions', async () => {
        mockHandleContext.mockResolvedValue({ sessions: [] });
        mockQueryOne.mockResolvedValue({ total: '0', domains: '0', avgUsage: '0' });
        const res = await request(buildApp()).get('/context/aggregate');
        expect(res.status).toBe(200);
        expect(res.body.activeSessions).toBe(0);
        expect(res.body.totalTurns).toBe(0);
    });
});
