/**
 * Unit tests for routes/decisions.ts —
 * GET /decisions/:entityType/:entityId and GET /decisions
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const decisionsRouter = (await import('../../routes/decisions.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(decisionsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// GET /decisions/:entityType/:entityId
// =============================================================================

describe('GET /decisions/:entityType/:entityId', () => {
    it('returns rows from query', async () => {
        mockQuery.mockResolvedValue([
            { id: 'd1', entity_type: 'node', entity_id: 'n1', field: 'weight' },
        ]);

        const res = await request(app).get('/decisions/node/n1');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].entity_type).toBe('node');
    });

    it('queries with entityType and entityId', async () => {
        await request(app).get('/decisions/node/n1');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('node');
        expect(params).toContain('n1');
    });

    it('adds field filter when provided', async () => {
        await request(app).get('/decisions/node/n1?field=weight');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('field');
        expect(params).toContain('weight');
    });

    it('does not add field clause when field is absent', async () => {
        await request(app).get('/decisions/node/n1');

        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        // field = ? should not appear in params when not requested
        expect(params).not.toContain('weight');
    });

    it('applies default limit when not specified', async () => {
        await request(app).get('/decisions/node/n1');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(50); // default limit
    });

    it('returns empty array when no decisions found', async () => {
        mockQuery.mockResolvedValue([]);

        const res = await request(app).get('/decisions/node/nonexistent');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('uses ORDER BY created_at DESC', async () => {
        await request(app).get('/decisions/node/n1');

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('ORDER BY created_at DESC');
    });
});

// =============================================================================
// GET /decisions (audit log)
// =============================================================================

describe('GET /decisions', () => {
    it('returns rows with no filters', async () => {
        mockQuery.mockResolvedValue([
            { id: 'd1', decided_by_tier: '2', entity_type: 'node' },
        ]);

        const res = await request(app).get('/decisions');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('applies tier filter when provided', async () => {
        await request(app).get('/decisions?tier=2');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('decided_by_tier');
        expect(params).toContain('2');
    });

    it('applies entityType filter when provided', async () => {
        await request(app).get('/decisions?entityType=node');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('entity_type');
        expect(params).toContain('node');
    });

    it('applies search filter across multiple columns', async () => {
        await request(app).get('/decisions?search=hello');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('field LIKE');
        expect(params).toContain('%hello%');
    });

    it('uses default limit of 100', async () => {
        await request(app).get('/decisions');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(100);
    });

    it('uses ORDER BY created_at DESC', async () => {
        await request(app).get('/decisions');

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('ORDER BY created_at DESC');
    });

    it('can combine tier and entityType filters', async () => {
        await request(app).get('/decisions?tier=1&entityType=synthesis');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('decided_by_tier');
        expect(String(sql)).toContain('entity_type');
        expect(params).toContain('1');
        expect(params).toContain('synthesis');
    });
});
