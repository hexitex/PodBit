/**
 * Unit tests for routes/activity.ts —
 * POST /activity/emit, GET /activity/recent, GET /activity/log, GET /activity/categories
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetRecentActivity = jest.fn<() => any[]>().mockReturnValue([]);
const mockEmitActivityLocal = jest.fn<() => void>();
const mockOnActivity = jest.fn<() => () => void>().mockReturnValue(() => {});
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivityLocal: mockEmitActivityLocal,
    onActivity: mockOnActivity,
    getRecentActivity: mockGetRecentActivity,
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const activityRouter = (await import('../../routes/activity.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(activityRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockGetRecentActivity.mockReturnValue([]);
    mockOnActivity.mockReturnValue(() => {});
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /activity/emit
// =============================================================================

describe('POST /activity/emit', () => {
    it('returns 400 when category is missing', async () => {
        const res = await request(app).post('/activity/emit').send({ message: 'hello' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('category and message required');
    });

    it('returns 400 when message is missing', async () => {
        const res = await request(app).post('/activity/emit').send({ category: 'system' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('category and message required');
    });

    it('calls emitActivityLocal with category, type, message, detail', async () => {
        await request(app).post('/activity/emit').send({
            category: 'system',
            type: 'info',
            message: 'Test event',
            detail: { foo: 'bar' },
        });

        expect(mockEmitActivityLocal).toHaveBeenCalledWith('system', 'info', 'Test event', { foo: 'bar' });
    });

    it('defaults type to event when not provided', async () => {
        await request(app).post('/activity/emit').send({ category: 'system', message: 'hello' });

        expect(mockEmitActivityLocal).toHaveBeenCalledWith('system', 'event', 'hello', undefined);
    });

    it('returns 204 on success', async () => {
        const res = await request(app).post('/activity/emit').send({ category: 'system', message: 'hello' });
        expect(res.status).toBe(204);
    });
});

// =============================================================================
// GET /activity/recent
// =============================================================================

describe('GET /activity/recent', () => {
    it('returns buffered recent events', async () => {
        mockGetRecentActivity.mockReturnValue([
            { id: 1, category: 'synthesis', message: 'Voicing complete' },
        ]);

        const res = await request(app).get('/activity/recent');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].category).toBe('synthesis');
    });

    it('applies limit parameter (max 200)', async () => {
        await request(app).get('/activity/recent?limit=50');

        expect(mockGetRecentActivity).toHaveBeenCalledWith(50);
    });

    it('caps limit at 200', async () => {
        await request(app).get('/activity/recent?limit=500');

        expect(mockGetRecentActivity).toHaveBeenCalledWith(200);
    });

    it('defaults limit to 100', async () => {
        await request(app).get('/activity/recent');

        expect(mockGetRecentActivity).toHaveBeenCalledWith(100);
    });
});

// =============================================================================
// GET /activity/log
// =============================================================================

describe('GET /activity/log', () => {
    it('returns events and total', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'e1', category: 'synthesis', detail: null }])
            .mockResolvedValueOnce([{ total: 1 }]);

        const res = await request(app).get('/activity/log');

        expect(res.status).toBe(200);
        expect(res.body.events).toHaveLength(1);
        expect(res.body.total).toBe(1);
    });

    it('applies category filter when provided', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await request(app).get('/activity/log?category=synthesis');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('category');
        expect(params).toContain('synthesis');
    });

    it('applies type filter when provided', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await request(app).get('/activity/log?type=voicing_complete');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('type');
        expect(params).toContain('voicing_complete');
    });

    it('applies search filter with LIKE', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await request(app).get('/activity/log?search=synthesis');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('LIKE');
        expect(params).toContain('%synthesis%');
    });

    it('parses JSON detail string into object', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'e1', detail: '{"nodeId":"n1","score":0.9}' }])
            .mockResolvedValueOnce([{ total: 1 }]);

        const res = await request(app).get('/activity/log');

        expect(res.body.events[0].detail).toEqual({ nodeId: 'n1', score: 0.9 });
    });

    it('leaves detail as string when JSON parse fails', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'e1', detail: 'not-json-string' }])
            .mockResolvedValueOnce([{ total: 1 }]);

        const res = await request(app).get('/activity/log');

        expect(res.body.events[0].detail).toBe('not-json-string');
    });

    it('caps days at 3', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await request(app).get('/activity/log?days=10');

        const [sql] = mockQuery.mock.calls[0] as any[];
        // days is capped at 3; the SQL should reference days=3 window
        expect(String(sql)).toContain('3 days');
    });

    it('defaults to limit=50, offset=0', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await request(app).get('/activity/log');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(50);
        expect(params).toContain(0);
    });
});

// =============================================================================
// GET /activity/categories
// =============================================================================

describe('GET /activity/categories', () => {
    it('returns categories with counts', async () => {
        mockQuery.mockResolvedValue([
            { category: 'synthesis', count: 42 },
            { category: 'system', count: 10 },
        ]);

        const res = await request(app).get('/activity/categories');

        expect(res.status).toBe(200);
        expect(res.body.categories).toHaveLength(2);
        expect(res.body.categories[0].category).toBe('synthesis');
    });

    it('caps days at 3', async () => {
        await request(app).get('/activity/categories?days=99');

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('3 days');
    });

    it('defaults to 2 days window', async () => {
        await request(app).get('/activity/categories');

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('2 days');
    });
});
