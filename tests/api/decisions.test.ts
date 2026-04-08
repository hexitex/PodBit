/**
 * API tests for routes/decisions.ts
 *
 * Tests: GET /decisions, GET /decisions/:entityType/:entityId
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(sql: string, params?: any[]) => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: decisionsRouter } = await import('../../routes/decisions.js');

/** Express app with decisions router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', decisionsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// GET /decisions
// =============================================================================

describe('GET /decisions', () => {
    it('returns empty array by default', async () => {
        const res = await request(buildApp()).get('/decisions');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('passes tier filter to query', async () => {
        mockQuery.mockResolvedValue([{ id: 1, decided_by_tier: 'tier1' }]);
        const res = await request(buildApp()).get('/decisions?tier=tier1');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Verify query was called with the tier param
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[0]).toContain('decided_by_tier');
        expect(callArgs[1]).toContain('tier1');
    });

    it('passes entityType filter to query', async () => {
        await request(buildApp()).get('/decisions?entityType=node');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[0]).toContain('entity_type');
        expect(callArgs[1]).toContain('node');
    });

    it('passes search filter to query', async () => {
        await request(buildApp()).get('/decisions?search=hello');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[0]).toContain('LIKE');
        expect(callArgs[1]).toContain('%hello%');
    });

    it('uses default limit of 100', async () => {
        await request(buildApp()).get('/decisions');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[1]).toContain(100);
    });

    it('accepts custom limit', async () => {
        await request(buildApp()).get('/decisions?limit=25');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[1]).toContain(25);
    });
});

// =============================================================================
// GET /decisions/:entityType/:entityId
// =============================================================================

describe('GET /decisions/:entityType/:entityId', () => {
    it('returns decisions for entity', async () => {
        mockQuery.mockResolvedValue([{ id: 1, entity_type: 'node', entity_id: 'uuid-1' }]);
        const res = await request(buildApp()).get('/decisions/node/uuid-1');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('passes entityType and entityId as query params', async () => {
        await request(buildApp()).get('/decisions/node/uuid-1');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[1]).toContain('node');
        expect(callArgs[1]).toContain('uuid-1');
    });

    it('filters by field when provided', async () => {
        await request(buildApp()).get('/decisions/node/uuid-1?field=weight');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[0]).toContain('field');
        expect(callArgs[1]).toContain('weight');
    });

    it('uses default limit of 50', async () => {
        await request(buildApp()).get('/decisions/node/uuid-1');
        const callArgs = mockQuery.mock.calls[0];
        expect(callArgs[1]).toContain(50);
    });

    it('returns empty array when no decisions found', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/decisions/node/nonexistent-id');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
