/**
 * API tests for routes/partitions/exchange.ts
 *
 * Tests: GET /partitions/:id/export (validation, 404, 200 with/without domains),
 *        POST /partitions/import (VALIDATION errors, CONFLICT errors, success)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    VERSION: '0.5.0',
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { registerExchangeRoutes } = await import('../../routes/partitions/exchange.js');

/** Express app with exchange router + generic 500 JSON error handler. */
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerExchangeRoutes(router);
    app.use('/', router);
    // Generic error handler so next(err) doesn't crash supertest
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
});

// =============================================================================
// GET /partitions/:id/export
// =============================================================================

describe('GET /partitions/:id/export', () => {
    it('returns 400 when owner query param is missing', async () => {
        const res = await request(buildApp()).get('/partitions/p-1/export');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('owner');
    });

    it('returns 404 when partition not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).get('/partitions/p-missing/export?owner=rob');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Partition not found');
    });

    it('returns export JSON when partition has no domains', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', name: 'Test', description: null, created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // domains → empty

        const res = await request(buildApp()).get('/partitions/p-1/export?owner=rob');
        expect(res.status).toBe(200);
        expect(res.body.podbitExport).toBe('1.0');
        expect(res.body.owner).toBe('rob');
        expect(res.body.partition.id).toBe('p-1');
        expect(res.body.partition.domains).toEqual([]);
        expect(res.body.nodes).toEqual([]);
        expect(res.body.nodeCount).toBe(0);
    });

    it('returns export JSON when partition has domains but no nodes', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', name: 'Test Partition', description: 'desc', created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'test-domain' }])  // domains
            .mockResolvedValueOnce([])                            // bridges
            .mockResolvedValueOnce([]);                           // nodes (empty → no edge/numvar/elite queries)

        const res = await request(buildApp()).get('/partitions/p-1/export?owner=rob');
        expect(res.status).toBe(200);
        expect(res.body.partition.domains).toEqual(['test-domain']);
        expect(res.body.nodes).toEqual([]);
        expect(res.body.edges).toEqual([]);
        expect(res.body.nodeCount).toBe(0);
        expect(res.body.edgeCount).toBe(0);
    });

    it('sets Content-Disposition attachment header', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', name: 'Test', description: null, created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // domains → empty

        const res = await request(buildApp()).get('/partitions/p-1/export?owner=rob');
        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.headers['content-disposition']).toContain('p-1.podbit.json');
    });

    it('includes systemVersion in export', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', name: 'Test', description: null, created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // domains → empty

        const res = await request(buildApp()).get('/partitions/p-1/export?owner=rob');
        expect(res.body.systemVersion).toBe('0.5.0');
    });

    it('includes bridges in export', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', name: 'Test', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'test-domain' }])                               // domains
            .mockResolvedValueOnce([{ partition_a: 'p-1', partition_b: 'p-2' }])              // bridges
            .mockResolvedValueOnce([]);                                                        // nodes

        const res = await request(buildApp()).get('/partitions/p-1/export?owner=rob');
        expect(res.status).toBe(200);
        expect(res.body.bridges).toHaveLength(1);
        expect(res.body.bridges[0].targetPartition).toBe('p-2');
    });
});

// =============================================================================
// POST /partitions/import
// =============================================================================

describe('POST /partitions/import', () => {
    it('returns 400 when podbitExport field is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/import')
            .send({ owner: 'rob', partition: { id: 'p-1', domains: [] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 when owner is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/import')
            .send({ podbitExport: '1.0', partition: { id: 'p-1', domains: [] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 when partition is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/import')
            .send({ podbitExport: '1.0', owner: 'rob' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 when partition.id is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/import')
            .send({ podbitExport: '1.0', owner: 'rob', partition: { domains: ['test'] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 with CONFLICT error when partition already exists and overwrite is false', async () => {
        // queryOne returns existing partition
        mockQueryOne.mockResolvedValue({ id: 'rob/p-1' });

        const res = await request(buildApp())
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p-1', domains: ['test-domain'] },
                nodes: [],
                edges: [],
                bridges: [],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('CONFLICT:');
        expect(res.body.error).toContain('rob/p-1');
    });

    it('returns 200 with import summary on success', async () => {
        // queryOne → null (no existing partition)
        mockQueryOne.mockResolvedValue(null);

        const res = await request(buildApp())
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p-1', domains: ['test-domain'] },
                nodes: [],
                edges: [],
                bridges: [],
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.imported).toBeDefined();
        expect(res.body.imported.partitionId).toBe('rob/p-1');
        expect(res.body.imported.domains).toBe(1);
        expect(res.body.imported.nodes).toBe(0);
        expect(res.body.imported.edges).toBe(0);
    });

    it('invalidates knowledge cache for each imported domain', async () => {
        mockQueryOne.mockResolvedValue(null);

        await request(buildApp())
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p-1', domains: ['domain-a', 'domain-b'] },
                nodes: [],
                edges: [],
                bridges: [],
            });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('domain-a');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('domain-b');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledTimes(2);
    });

    it('overwrites existing partition when overwrite=true', async () => {
        // First queryOne → existing partition found (collision check)
        // Then queryOne → null for bridge check later
        mockQueryOne
            .mockResolvedValueOnce({ id: 'rob/p-1' })  // collision check → exists
            .mockResolvedValue(null);                    // bridge checks

        // query calls for overwrite cleanup + create
        mockQuery.mockResolvedValue([]);

        const res = await request(buildApp())
            .post('/partitions/import?overwrite=true')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p-1', domains: ['test-domain'] },
                nodes: [],
                edges: [],
                bridges: [],
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.imported.partitionId).toBe('rob/p-1');
    });

    it('skips bridges whose target partition does not exist', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)   // collision check → no existing partition
            .mockResolvedValueOnce(null);  // bridge target → does not exist

        const res = await request(buildApp())
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p-1', domains: ['test-domain'] },
                nodes: [],
                edges: [],
                bridges: [{ targetPartition: 'other-partition' }],
            });
        expect(res.status).toBe(200);
        expect(res.body.imported.bridges).toBe(0);
        expect(res.body.skipped.bridges).toHaveLength(1);
        expect(res.body.skipped.bridges[0]).toContain('other-partition');
    });
});
