/**
 * API tests for routes/partitions/crud.ts (via routes/partitions/index.ts)
 *
 * Tests: POST /partitions/bridges (validation),
 *        DELETE /partitions/bridges, GET /partitions/bridges,
 *        POST /partitions (required fields), GET /partitions,
 *        GET /partitions/:id (404), POST /partitions/:id/domains
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    renameDomain: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true }),
}));

// Mock the exchange and transient modules (registered from index.ts)
jest.unstable_mockModule('../../routes/partitions/exchange.js', () => ({
    registerExchangeRoutes: (_router: any) => { /* no-op */ },
    exportPartition: jest.fn(),
    importPartition: jest.fn(),
}));

jest.unstable_mockModule('../../routes/partitions/transient.js', () => ({
    registerTransientRoutes: (_router: any) => { /* no-op */ },
    importTransient: jest.fn(),
    approveTransient: jest.fn(),
    departTransient: jest.fn(),
    getVisitHistory: jest.fn(),
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: partitionsRouter } = await import('../../routes/partitions/index.js');

/** Express app with partitions router (crud + stubbed exchange/transient). */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', partitionsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// POST /partitions/bridges
// =============================================================================

describe('POST /partitions/bridges', () => {
    it('returns 400 when partitionA is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionB: 'p2' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when partitionB is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'p1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when both are missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({});
        expect(res.status).toBe(400);
    });

    it('returns 400 when partitionA === partitionB (self-bridge)', async () => {
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'same', partitionB: 'same' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/itself/i);
    });

    it('returns 400 when either partition is a system partition', async () => {
        // pA is system
        mockQueryOne
            .mockResolvedValueOnce({ system: 1 }) // pA
            .mockResolvedValueOnce({ system: 0 }); // pB
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'sys-part', partitionB: 'user-part' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/system partition/i);
    });

    it('returns 400 when partitionB is a system partition', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 }) // pA
            .mockResolvedValueOnce({ system: 1 }); // pB
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'user-part', partitionB: 'sys-part' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/system partition/i);
    });

    it('creates bridge when both partitions are valid', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'alpha', partitionB: 'beta' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.bridge).toBeDefined();
    });

    it('sorts partitions alphabetically for the bridge key', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });
        const res = await request(buildApp())
            .post('/partitions/bridges')
            .send({ partitionA: 'zzz', partitionB: 'aaa' });
        expect(res.status).toBe(200);
        expect(res.body.bridge.partition_a).toBe('aaa');
        expect(res.body.bridge.partition_b).toBe('zzz');
    });
});

// =============================================================================
// DELETE /partitions/bridges
// =============================================================================

describe('DELETE /partitions/bridges', () => {
    it('returns 400 when partitionA is missing', async () => {
        const res = await request(buildApp())
            .delete('/partitions/bridges')
            .send({ partitionB: 'p2' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    it('returns 400 when partitionB is missing', async () => {
        const res = await request(buildApp())
            .delete('/partitions/bridges')
            .send({ partitionA: 'p1' });
        expect(res.status).toBe(400);
    });

    it('deletes bridge and returns success', async () => {
        const res = await request(buildApp())
            .delete('/partitions/bridges')
            .send({ partitionA: 'alpha', partitionB: 'beta' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// GET /partitions/bridges
// =============================================================================

describe('GET /partitions/bridges', () => {
    it('returns array of bridges', async () => {
        mockQuery.mockResolvedValue([
            { partition_a: 'p1', partition_b: 'p2', name_a: 'Part A', name_b: 'Part B' },
        ]);
        const res = await request(buildApp()).get('/partitions/bridges');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns empty array when no bridges exist', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/partitions/bridges');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

// =============================================================================
// GET /partitions
// =============================================================================

describe('GET /partitions', () => {
    it('returns array of partitions', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'Partition A', system: 0, transient: 0, domains: 'domain-a,domain-b' },
        ]);
        const res = await request(buildApp()).get('/partitions');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('splits domains string into array', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'Test', system: 0, transient: 0, domains: 'a,b,c' },
        ]);
        const res = await request(buildApp()).get('/partitions');
        expect(res.body[0].domains).toEqual(['a', 'b', 'c']);
    });

    it('returns empty domains array when null', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'Test', system: 0, transient: 0, domains: null },
        ]);
        const res = await request(buildApp()).get('/partitions');
        expect(res.body[0].domains).toEqual([]);
    });

    it('converts system integer to boolean', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'Sys', system: 1, transient: 0, domains: null },
        ]);
        const res = await request(buildApp()).get('/partitions');
        expect(res.body[0].system).toBe(true);
    });
});

// =============================================================================
// GET /partitions/:id
// =============================================================================

describe('GET /partitions/:id', () => {
    it('returns 404 when partition not found', async () => {
        mockQuery.mockResolvedValueOnce([]); // partition lookup
        const res = await request(buildApp()).get('/partitions/nonexistent');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('returns partition with domains', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'p1', name: 'Test', system: 0 }]) // partition
            .mockResolvedValueOnce([{ domain: 'ideas' }, { domain: 'concepts' }]); // domains
        const res = await request(buildApp()).get('/partitions/p1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('p1');
        expect(res.body.domains).toEqual(['ideas', 'concepts']);
    });
});

// =============================================================================
// POST /partitions
// =============================================================================

describe('POST /partitions', () => {
    it('returns 400 when id is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions')
            .send({ name: 'Test Partition' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/id/i);
    });

    it('returns 400 when name is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions')
            .send({ id: 'p1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name/i);
    });

    it('creates partition and returns it', async () => {
        const res = await request(buildApp())
            .post('/partitions')
            .send({ id: 'my-partition', name: 'My Partition' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBe('my-partition');
    });

    it('creates partition with domains', async () => {
        const res = await request(buildApp())
            .post('/partitions')
            .send({ id: 'p1', name: 'Test', domains: ['domain-a', 'domain-b'] });
        expect(res.status).toBe(200);
        expect(res.body.domains).toEqual(['domain-a', 'domain-b']);
    });
});

// =============================================================================
// POST /partitions/:id/domains
// =============================================================================

describe('POST /partitions/:id/domains', () => {
    it('returns 400 when domain is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/p1/domains')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/domain/i);
    });

    it('adds domain to partition', async () => {
        const res = await request(buildApp())
            .post('/partitions/p1/domains')
            .send({ domain: 'new-domain' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.domain).toBe('new-domain');
    });
});
