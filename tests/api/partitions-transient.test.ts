/**
 * API tests for routes/partitions/transient.ts
 *
 * Tests: POST /partitions/transient/import (VALIDATION, LIMIT, success),
 *        POST /partitions/:id/approve (error paths, success),
 *        POST /partitions/:id/depart (error paths, success),
 *        GET /partitions/:id/visits
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Set env before any module loads so config/defaults.ts picks up transient.enabled=true
process.env.TRANSIENT_ENABLED = 'true';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClearTransientCache = jest.fn<() => void>();
const mockExportPartition = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockDetectInjection = jest.fn<(content: string) => { isInjection: boolean; reasons: string[] }>()
    .mockReturnValue({ isInjection: false, reasons: [] });

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
    clearTransientCache: mockClearTransientCache,
}));

// exchange.js is statically imported by transient.ts for exportPartition
jest.unstable_mockModule('../../routes/partitions/exchange.js', () => ({
    exportPartition: mockExportPartition,
}));

// scoring.js is dynamically imported inside approveTransient
jest.unstable_mockModule('../../core/scoring.js', () => ({
    detectInjection: mockDetectInjection,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { registerTransientRoutes } = await import('../../routes/partitions/transient.js');

/** Express app with transient router + 500 error handler. */
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerTransientRoutes(router);
    app.use('/', router);
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

beforeEach(() => {
    // resetAllMocks clears call history AND queued once-values (unlike clearAllMocks)
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockExportPartition.mockResolvedValue(null);
    mockDetectInjection.mockReturnValue({ isInjection: false, reasons: [] });
});

// =============================================================================
// POST /partitions/transient/import
// =============================================================================

describe('POST /partitions/transient/import', () => {
    it('returns 400 when podbitExport field is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({ owner: 'alice', partition: { id: 'p-1', domains: ['test'] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 when owner is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({ podbitExport: '1.0', partition: { id: 'p-1', domains: ['test'] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 when partition.id is missing', async () => {
        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({ podbitExport: '1.0', owner: 'alice', partition: { domains: ['test'] } });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('VALIDATION:');
    });

    it('returns 400 with LIMIT error when max transient partitions reached', async () => {
        // Default maxTransientPartitions = 3; return 3 existing to hit the limit
        mockQuery.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);
        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({
                podbitExport: '1.0',
                owner: 'alice',
                partition: { id: 'p-1', domains: ['test'] },
                nodes: [],
                edges: [],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('LIMIT:');
    });

    it('returns 400 with LIMIT error when node count exceeds max', async () => {
        // Default maxNodesPerImport = 500; send 501
        mockQuery.mockResolvedValueOnce([]);            // transient count (0 existing)
        mockQueryOne.mockResolvedValueOnce({ cnt: 0 }); // host count

        const manyNodes = Array.from({ length: 501 }, (_, i) => ({
            id: `n-${i}`, content: 'test', node_type: 'seed', domain: 'test',
        }));

        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({
                podbitExport: '1.0',
                owner: 'alice',
                partition: { id: 'p-1', domains: ['test'] },
                nodes: manyNodes,
                edges: [],
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('LIMIT:');
    });

    it('returns 200 with import summary on success', async () => {
        // DB call order in importTransient:
        // query #1: SELECT transient count → [] (0 = under limit)
        // queryOne #1: SELECT host count → { cnt: 100 }
        // queryOne #2: SELECT existing partition (collision) → null
        // queryOne #3: SELECT project name → { value: 'my-project' }
        // query #2+: INSERT partition, domain, visits → []
        mockQuery
            .mockResolvedValueOnce([])  // transient count
            .mockResolvedValue([]);      // all INSERT queries
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 100 })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ value: 'my-project' });

        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({
                podbitExport: '1.0',
                owner: 'alice',
                partition: { id: 'p-1', domains: ['test-domain'] },
                nodes: [],
                edges: [],
            });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.partitionId).toBe('transient/alice/p-1');
        expect(res.body.state).toBe('quarantine');
        expect(res.body.imported.domains).toBe(1);
        expect(res.body.imported.nodes).toBe(0);
        expect(mockClearTransientCache).toHaveBeenCalled();
        expect(mockLogDecision).toHaveBeenCalled();
    });

    it('uses transient/owner/id format for partitionId', async () => {
        mockQuery.mockResolvedValueOnce([]).mockResolvedValue([]);
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ value: 'proj' });

        const res = await request(buildApp())
            .post('/partitions/transient/import')
            .send({
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'research-graph', domains: [] },
                nodes: [],
                edges: [],
            });
        expect(res.status).toBe(200);
        expect(res.body.partitionId).toBe('transient/rob/research-graph');
    });
});

// =============================================================================
// POST /partitions/:id/approve
// =============================================================================

describe('POST /partitions/:id/approve', () => {
    it('returns 400 when partition not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).post('/partitions/p-missing/approve').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Partition not found');
    });

    it('returns 400 when partition is not transient', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'active', transient: 0 });
        const res = await request(buildApp()).post('/partitions/p-1/approve').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Not a transient partition');
    });

    it('returns 400 when partition is not in quarantine state', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'active', transient: 1 });
        const res = await request(buildApp()).post('/partitions/p-1/approve').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('quarantine');
    });

    it('approves partition with no nodes and returns success', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'quarantine', transient: 1 });
        // domains → [], UPDATE state → [], SELECT host partitions → []
        mockQuery.mockResolvedValue([]);

        const res = await request(buildApp()).post('/partitions/p-1/approve').send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.state).toBe('active');
        expect(res.body.scan.totalNodes).toBe(0);
        expect(mockClearTransientCache).toHaveBeenCalled();
        expect(mockLogDecision).toHaveBeenCalled();
    });

    it('passes bridgeTo parameter and creates bridges', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'quarantine', transient: 1 });
        mockQuery.mockResolvedValue([]);

        const res = await request(buildApp())
            .post('/partitions/p-1/approve')
            .send({ bridgeTo: ['partition-a', 'partition-b'] });
        expect(res.status).toBe(200);
        expect(res.body.bridgesCreated).toBe(2);
    });
});

// =============================================================================
// POST /partitions/:id/depart
// =============================================================================

describe('POST /partitions/:id/depart', () => {
    it('returns 400 when partition not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).post('/partitions/p-missing/depart').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Partition not found');
    });

    it('returns 400 when partition is not transient', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'active', transient: 0, source_owner: 'alice' });
        const res = await request(buildApp()).post('/partitions/p-1/depart').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Not a transient partition');
    });

    it('returns 400 when partition has already departed', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p-1', state: 'departed', transient: 1, source_owner: 'alice' });
        const res = await request(buildApp()).post('/partitions/p-1/depart').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('already departed');
    });

    it('departs partition and returns summary', async () => {
        // DB call order in departTransient (empty domainList):
        // queryOne #1: partition lookup
        // query #1: UPDATE state='departing'
        // exportPartition (mocked → null)
        // query #2: SELECT domains → []
        // queryOne #2: cycles_completed
        // query #3: UPDATE partition_visits
        // cleanupTransientPartition: DELETE bridges, DELETE partition_domains
        // query #4: UPDATE state='departed'
        mockQueryOne
            .mockResolvedValueOnce({ id: 'p-1', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 3 });
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue(null);

        const res = await request(buildApp())
            .post('/partitions/p-1/depart')
            .send({ reason: 'visit complete' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.state).toBe('departed');
        expect(res.body.stubs).toBe(0);
        expect(res.body.visit.cyclesRun).toBe(3);
        expect(mockClearTransientCache).toHaveBeenCalled();
        expect(mockLogDecision).toHaveBeenCalled();
    });

    it('includes export data when exportPartition returns data', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'p-1', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 });
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue({
            podbitExport: '1.0', owner: 'alice', nodes: [], edges: [], nodeCount: 0,
        });

        const res = await request(buildApp()).post('/partitions/p-1/depart').send({});
        expect(res.status).toBe(200);
        expect(res.body.exportData).toBeDefined();
        expect(res.body.exportData.transient).toBe(true);
        expect(res.body.exportData.podbitExport).toBe('2.0');
    });
});

// =============================================================================
// GET /partitions/:id/visits
// =============================================================================

describe('GET /partitions/:id/visits', () => {
    it('returns visits list for the partition', async () => {
        mockQuery.mockResolvedValue([
            { id: 1, partition_id: 'p-1', project_name: 'proj-a', arrived_at: '2024-01-01', departed_at: null },
            { id: 2, partition_id: 'p-1', project_name: 'proj-b', arrived_at: '2023-06-01', departed_at: '2023-07-01' },
        ]);
        const res = await request(buildApp()).get('/partitions/p-1/visits');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].project_name).toBe('proj-a');
    });

    it('returns empty array when no visits', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/partitions/p-1/visits');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('queries with the correct partition id', async () => {
        mockQuery.mockResolvedValue([]);
        await request(buildApp()).get('/partitions/transient-part-xyz/visits');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('partition_visits'),
            ['transient-part-xyz']
        );
    });
});
