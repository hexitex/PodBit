/**
 * Extended unit tests for routes/partitions/transient.ts —
 * Covers uncovered branches: route handlers, number variable import,
 * edge error paths, ratio limits, domain-aware approve/depart paths,
 * stub creation, cleanup, and fallback defaults.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInvalidateKnowledgeCache = jest.fn<(domain: string) => Promise<void>>().mockResolvedValue(undefined);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClearTransientCache = jest.fn<() => void>();
const mockExportPartition = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockDetectInjection = jest.fn<(content: string) => any>().mockReturnValue({ isInjection: false, reasons: [] });

const mockTransientConfig: Record<string, any> = {
    enabled: true,
    maxTransientPartitions: 3,
    maxNodesPerImport: 500,
    maxTransientNodeRatio: 0.3,
    minCycles: 2,
    maxCycles: 10,
    exhaustionThreshold: 0.8,
    quarantine: { scanFailThreshold: 0.1 },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: { transient: mockTransientConfig },
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
    clearTransientCache: mockClearTransientCache,
}));

jest.unstable_mockModule('../../routes/partitions/exchange.js', () => ({
    exportPartition: mockExportPartition,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    detectInjection: mockDetectInjection,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next),
}));

const { importTransient, approveTransient, departTransient, registerTransientRoutes } = await import('../../routes/partitions/transient.js');

function resetConfig() {
    Object.assign(mockTransientConfig, {
        enabled: true,
        maxTransientPartitions: 3,
        maxNodesPerImport: 500,
        maxTransientNodeRatio: 0.3,
        minCycles: 2,
        maxCycles: 10,
        exhaustionThreshold: 0.8,
        quarantine: { scanFailThreshold: 0.1 },
    });
}

/** Set up mockQueryOne calls for a successful importTransient flow. */
function setupImportQueryOneMocks(overrides: { hostCnt?: number | null; collision?: any; projectName?: string | null } = {}) {
    const { hostCnt = 100, collision = null, projectName = null } = overrides;
    mockQueryOne
        .mockResolvedValueOnce(hostCnt !== null ? { cnt: hostCnt } : null)  // host count
        .mockResolvedValueOnce(collision)                                    // collision check
        .mockResolvedValueOnce(projectName ? { value: projectName } : null); // project setting
}

beforeEach(() => {
    jest.clearAllMocks();
    // Reset implementations (clearAllMocks does not clear mockResolvedValueOnce queues)
    mockQuery.mockReset().mockResolvedValue([]);
    mockQueryOne.mockReset().mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockReset().mockResolvedValue(undefined);
    mockLogDecision.mockReset().mockResolvedValue(undefined);
    mockExportPartition.mockReset().mockResolvedValue(null);
    mockDetectInjection.mockReset().mockReturnValue({ isInjection: false, reasons: [] });
    mockClearTransientCache.mockReset();
    resetConfig();
});

// Helper to create a supertest app with the transient routes registered
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerTransientRoutes(router);
    app.use(router);
    // Error handler so next(err) doesn't crash
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

// =============================================================================
// registerTransientRoutes — Express route handlers
// =============================================================================

describe('registerTransientRoutes', () => {
    describe('POST /partitions/transient/import', () => {
        it('returns 400 for VALIDATION errors', async () => {
            mockTransientConfig.enabled = false;
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/transient/import')
                .send({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: [] } });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('VALIDATION:');
        });

        it('returns 400 for LIMIT errors', async () => {
            mockQuery.mockResolvedValueOnce([{ id: '1' }, { id: '2' }, { id: '3' }]);
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/transient/import')
                .send({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: ['d'] } });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('LIMIT:');
        });

        it('passes non-validation errors to next()', async () => {
            // Cause the first query (existing transient check) to throw
            mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/transient/import')
                .send({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: ['d'] } });

            expect(res.status).toBe(500);
        });

        it('returns success on valid import', async () => {
            mockQuery.mockResolvedValue([]);
            setupImportQueryOneMocks({ hostCnt: 10, projectName: 'test-project' });
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/transient/import')
                .send({ podbitExport: '1.0', owner: 'alice', partition: { id: 'p', domains: ['sci'] } });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /partitions/:id/approve', () => {
        it('returns 400 when partition not found', async () => {
            mockQueryOne.mockResolvedValueOnce(null);
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/transient-alice-p/approve')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('not found');
        });

        it('returns 200 on successful approval', async () => {
            mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
            mockQuery.mockResolvedValue([]);
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/tp/approve')
                .send({ bridgeTo: [] });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('POST /partitions/:id/depart', () => {
        it('returns 400 when not transient', async () => {
            mockQueryOne.mockResolvedValueOnce({ id: 'p', state: 'active', transient: 0, source_owner: 'x' });
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/p/depart')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Not a transient');
        });

        it('returns 200 on successful departure', async () => {
            mockQueryOne
                .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
                .mockResolvedValueOnce({ cycles_completed: 0 })
                .mockResolvedValueOnce(null);
            mockQuery.mockResolvedValue([]);
            const app = buildApp();

            const res = await request(app)
                .post('/partitions/tp/depart')
                .send({ reason: 'done' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('GET /partitions/:id/visits', () => {
        it('returns visit history', async () => {
            mockQuery.mockResolvedValue([{ partition_id: 'tp', arrived_at: '2024-01-01' }]);
            const app = buildApp();

            const res = await request(app).get('/partitions/tp/visits');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
        });
    });
});

// =============================================================================
// importTransient — node ratio limit
// =============================================================================

describe('importTransient — node ratio limit', () => {
    it('throws LIMIT when node ratio exceeds maxTransientNodeRatio', async () => {
        mockTransientConfig.maxTransientNodeRatio = 0.1; // 10%
        mockQuery.mockResolvedValueOnce([]); // existing transient count OK
        mockQueryOne.mockResolvedValueOnce({ cnt: 5 }); // host has 5 nodes

        // 5 nodes + 5 new = 10 total, ratio = 5/10 = 0.5 > 0.1
        const nodes = Array.from({ length: 5 }, (_, i) => ({
            id: `n${i}`, content: 'c', node_type: 'seed', domain: 'sci',
        }));

        await expect(importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: ['sci'] }, nodes,
        })).rejects.toThrow('LIMIT:');
    });

    it('passes ratio check when hostCount is 0 and nodes empty', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ hostCnt: 0 });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.success).toBe(true);
    });

    it('passes ratio check when hostCount is null', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ hostCnt: null });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// importTransient — fallback defaults and optional fields
// =============================================================================

describe('importTransient — fallback defaults', () => {
    it('uses "unknown" when project.name setting is missing', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: null });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.success).toBe(true);
        const visitInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_visits') && params?.includes('unknown')
        );
        expect(visitInsert).toBeDefined();
    });

    it('uses targetPartitionId as name when partition.name is missing', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks();

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') &&
            params?.[0] === 'transient/bob/p' &&
            params?.[1] === 'transient/bob/p' // name = partitionId when name not provided
        );
        expect(insertCall).toBeDefined();
    });

    it('uses null for description when partition.description is missing', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks();

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') &&
            params?.[2] === null
        );
        expect(insertCall).toBeDefined();
    });

    it('defaults nodes to empty array when not provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks();

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.imported.nodes).toBe(0);
    });

    it('defaults edges to empty array when not provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks();

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.imported.edges).toBe(0);
    });
});

// =============================================================================
// importTransient — edge import
// =============================================================================

describe('importTransient — edge import', () => {
    it('imports edges with default strength when not specified', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            edges: [{ source_id: 's1', target_id: 't1', edge_type: 'parent' }],
        });

        expect(result.imported.edges).toBe(1);
        const edgeInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO edges') && params?.[3] === 1.0
        );
        expect(edgeInsert).toBeDefined();
    });

    it('does not increment edgesImported when insert throws', async () => {
        setupImportQueryOneMocks({ projectName: 'proj' });

        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT INTO edges')) {
                throw new Error('constraint');
            }
            return [];
        });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            edges: [{ source_id: 's1', target_id: 't1', edge_type: 'parent', strength: 0.5 }],
        });

        expect(result.imported.edges).toBe(0);
    });
});

// =============================================================================
// importTransient — number variables import
// =============================================================================

describe('importTransient — number variables import', () => {
    it('imports number variables registry entries and refs', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [
                    { var_id: 'ABCD1', value: '42', scope_text: 'around 42', source_node_id: 'n1', domain: 'sci', created_at: '2024-01-01' },
                ],
                refs: [
                    { node_id: 'n1', var_id: 'ABCD1' },
                ],
            },
        });

        expect(result.success).toBe(true);
        const registryInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO number_registry')
        );
        expect(registryInsert).toBeDefined();
        const refInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT OR IGNORE INTO node_number_refs')
        );
        expect(refInsert).toBeDefined();
    });

    it('skips number variables when registry is empty', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: { registry: [] },
        });

        expect(result.success).toBe(true);
        const registryInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO number_registry')
        );
        expect(registryInsert).toBeUndefined();
    });

    it('skips number variables when numberVariables is not provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        expect(result.success).toBe(true);
    });

    it('handles individual registry entry insert failures', async () => {
        setupImportQueryOneMocks({ projectName: 'proj' });

        let registryInsertCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT INTO number_registry')) {
                registryInsertCount++;
                if (registryInsertCount === 1) throw new Error('UNIQUE constraint');
            }
            return [];
        });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [
                    { var_id: 'ABCD1', value: '42', scope_text: 'x', source_node_id: 'n1', domain: 'sci' },
                    { var_id: 'ABCD2', value: '99', scope_text: 'y', source_node_id: 'n2', domain: 'sci' },
                ],
            },
        });

        expect(result.success).toBe(true);
    });

    it('handles outer number variable import failure (non-fatal)', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: 'not-an-array', // will cause for..of to fail in the outer try
            },
        });

        expect(result.success).toBe(true);
    });

    it('handles refs insert failures silently', async () => {
        setupImportQueryOneMocks({ projectName: 'proj' });

        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT OR IGNORE INTO node_number_refs')) {
                throw new Error('constraint');
            }
            return [];
        });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [{ var_id: 'ABCD1', value: '42', scope_text: 'x', source_node_id: 'n1', domain: 'sci' }],
                refs: [{ node_id: 'n1', var_id: 'ABCD1' }],
            },
        });

        expect(result.success).toBe(true);
    });

    it('defaults created_at for registry entry when not provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [
                    { var_id: 'ABCD1', value: '42', scope_text: 'x', source_node_id: 'n1', domain: 'sci' },
                ],
            },
        });

        const registryInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO number_registry') && params?.[5] // created_at should be set
        );
        expect(registryInsert).toBeDefined();
    });

    it('handles empty refs array', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [{ var_id: 'ABCD1', value: '42', scope_text: 'x', source_node_id: 'n1', domain: 'sci' }],
                refs: [],
            },
        });

        expect(result.success).toBe(true);
    });

    it('defaults refs to empty array when not provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
            numberVariables: {
                registry: [{ var_id: 'ABCD1', value: '42', scope_text: 'x', source_node_id: 'n1', domain: 'sci' }],
            },
        });

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// importTransient — node import with optional fields
// =============================================================================

describe('importTransient — node optional fields', () => {
    it('handles nodes with minimal fields (no trajectory, contributor, content_hash, created_at)', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        const result = await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: ['sci'] },
            nodes: [{ id: 'n1', content: 'test', node_type: 'seed', domain: 'sci' }],
        });

        expect(result.imported.nodes).toBe(1);
        const nodeInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO nodes') && params?.[0] === 'n1'
        );
        expect(nodeInsert).toBeDefined();
        const params = nodeInsert[1];
        expect(params[3]).toBeNull();      // trajectory
        expect(params[7]).toBeNull();      // specificity
        expect(params[9]).toBeNull();      // contributor
        expect(params[10]).toBeNull();     // content_hash
    });

    it('preserves specificity when provided', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: ['sci'] },
            nodes: [{ id: 'n1', content: 'test', node_type: 'seed', domain: 'sci', specificity: 0.85 }],
        });

        const nodeInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO nodes') && params?.[0] === 'n1'
        );
        expect(nodeInsert[1][7]).toBe(0.85);
    });
});

// =============================================================================
// approveTransient — zero-domain partition and auto-bridge
// =============================================================================

describe('approveTransient — domain and bridge paths', () => {
    it('skips node scanning when partition has no domains', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([])  // no domains
            .mockResolvedValueOnce([])  // UPDATE state
            .mockResolvedValueOnce([{ id: 'host1' }]) // auto-bridge query
            .mockResolvedValue([]);

        const result = await approveTransient('tp');

        expect(result.success).toBe(true);
        expect(result.scan.totalNodes).toBe(0);
        expect(result.scan.failedNodes).toBe(0);
        expect(result.scan.failRate).toBe('0.000');
    });

    it('auto-bridges to all non-system non-transient partitions when bridgeTo not specified', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([])  // no domains
            .mockResolvedValueOnce([])  // UPDATE state
            .mockResolvedValueOnce([{ id: 'host-a' }, { id: 'host-b' }]) // non-system partitions
            .mockResolvedValue([]);

        const result = await approveTransient('tp');

        expect(result.bridgesCreated).toBe(2);
    });

    it('orders bridge pair correctly when partitionId < targetId', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'aaa', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([])  // no domains
            .mockResolvedValueOnce([])  // UPDATE
            .mockResolvedValue([]);

        await approveTransient('aaa', ['zzz']);

        const bridgeInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_bridges') && params?.[0] === 'aaa' && params?.[1] === 'zzz'
        );
        expect(bridgeInsert).toBeDefined();
    });

    it('orders bridge pair correctly when partitionId > targetId', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'zzz', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([])  // no domains
            .mockResolvedValueOnce([])  // UPDATE
            .mockResolvedValue([]);

        await approveTransient('zzz', ['aaa']);

        const bridgeInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_bridges') && params?.[0] === 'aaa' && params?.[1] === 'zzz'
        );
        expect(bridgeInsert).toBeDefined();
    });

    it('invalidates knowledge cache for each domain on approval', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'd1' }, { domain: 'd2' }]) // domains
            .mockResolvedValueOnce([])  // nodes (none)
            .mockResolvedValueOnce([])  // UPDATE state
            .mockResolvedValue([]);

        await approveTransient('tp', []);

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d1');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d2');
    });

    it('scans nodes for injection and passes when below threshold', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'sci' }]) // domains
            .mockResolvedValueOnce([
                { id: 'n1', content: 'clean' },
                { id: 'n2', content: 'also clean' },
            ])
            .mockResolvedValueOnce([])  // UPDATE
            .mockResolvedValue([]);
        mockDetectInjection.mockReturnValue({ isInjection: false, reasons: [] });

        const result = await approveTransient('tp', []);

        expect(result.success).toBe(true);
        expect(result.scan.totalNodes).toBe(2);
        expect(result.scan.failedNodes).toBe(0);
    });

    it('rejects when scan fail rate exceeds threshold with multiple domains', async () => {
        mockQueryOne.mockResolvedValueOnce({ id: 'tp', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'd1' }, { domain: 'd2' }]) // two domains
            .mockResolvedValueOnce([{ id: 'n1', content: 'bad' }])  // all nodes flagged
            .mockResolvedValue([]);
        mockDetectInjection.mockReturnValue({ isInjection: true, reasons: ['injection pattern'] });
        mockTransientConfig.quarantine = { scanFailThreshold: 0.5 };

        const result = await approveTransient('tp') as any;

        expect(result.error).toContain('scan failed');
        expect(result.rejected).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// departTransient — stubs, children, parents, fallbacks
// =============================================================================

describe('departTransient — stub creation', () => {
    it('creates stubs for nodes with surviving children and parents', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 3 })
            .mockResolvedValueOnce({ cnt: 2, avg_weight: 1.5 });

        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('SELECT domain FROM partition_domains')) {
                return [{ domain: 'sci' }];
            }
            if (s.includes('SELECT id, content, domain, weight FROM nodes')) {
                return [{ id: 'node-abc', content: 'Some knowledge about science', domain: 'sci', weight: 2.0 }];
            }
            if (s.includes('JOIN nodes n ON n.id = e.target_id') && s.includes('edge_type')) {
                return [{ id: 'child-1' }]; // surviving child
            }
            if (s.includes('SELECT e.source_id FROM edges')) {
                return [{ source_id: 'parent-1' }]; // parent
            }
            return [];
        });
        mockExportPartition.mockResolvedValue({ nodes: [], edges: [] });

        const result = await departTransient('tp', 'test reason');

        expect(result.success).toBe(true);
        expect(result.stubs).toBe(1);

        const stubInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO node_stubs') &&
            params?.[7] !== null &&
            params?.[8] !== null
        );
        expect(stubInsert).toBeDefined();
        expect(JSON.parse(stubInsert[1][7])).toEqual(['child-1']);
        expect(JSON.parse(stubInsert[1][8])).toEqual(['parent-1']);
    });

    it('creates stubs with null children/parents when none exist', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);

        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('SELECT domain FROM partition_domains')) {
                return [{ domain: 'sci' }];
            }
            if (s.includes('SELECT id, content, domain, weight FROM nodes')) {
                return [{ id: 'node-xyz', content: 'Short', domain: 'sci', weight: 1.0 }];
            }
            return []; // no children, no parents
        });

        const result = await departTransient('tp');

        expect(result.stubs).toBe(1);
        const stubInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO node_stubs') &&
            params?.[7] === null &&
            params?.[8] === null
        );
        expect(stubInsert).toBeDefined();
    });

    it('handles stub insert failure silently', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);

        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('SELECT domain FROM partition_domains')) {
                return [{ domain: 'sci' }];
            }
            if (s.includes('SELECT id, content, domain, weight FROM nodes')) {
                return [{ id: 'node-1', content: 'content', domain: 'sci', weight: 1.0 }];
            }
            if (s.includes('INSERT INTO node_stubs')) {
                throw new Error('UNIQUE constraint');
            }
            return [];
        });

        const result = await departTransient('tp');

        expect(result.success).toBe(true);
        expect(result.stubs).toBe(0);
    });

    it('uses "unknown" when source_owner is null', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: null })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);

        const result = await departTransient('tp');

        expect(result.success).toBe(true);
        expect(mockExportPartition).toHaveBeenCalledWith('tp', 'unknown');
    });

    it('defaults reason to "manual" when not provided', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);

        await departTransient('tp');

        const visitUpdate = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('UPDATE partition_visits') && params?.includes('manual')
        );
        expect(visitUpdate).toBeDefined();
    });

    it('defaults cycles_completed to 0 when query returns null', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce(null) // cycles_completed returns null
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);

        const result = await departTransient('tp');

        expect(result.visit.cyclesRun).toBe(0);
    });

    it('returns null exportData when exportPartition returns null', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue(null);

        const result = await departTransient('tp');

        expect(result.exportData).toBeNull();
    });

    it('returns exportData with podbitExport and transient flags when export succeeds', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 5 })
            .mockResolvedValueOnce({ cnt: 1, avg_weight: 0.8 });
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue({ nodes: [{ id: 'n1' }], edges: [], someField: 'preserved' });

        const result = await departTransient('tp', 'returning home');

        expect(result.exportData).toBeDefined();
        expect(result.exportData.podbitExport).toBe('2.0');
        expect(result.exportData.transient).toBe(true);
        expect(result.exportData.someField).toBe('preserved');
    });

    it('computes childrenStats when domainList is non-empty', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 2 })
            .mockResolvedValueOnce({ cnt: 5, avg_weight: 1.3 });

        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('SELECT domain FROM partition_domains')) {
                return [{ domain: 'sci' }];
            }
            if (String(sql).includes('SELECT id, content, domain, weight FROM nodes')) {
                return []; // no nodes to stub
            }
            return [];
        });
        mockExportPartition.mockResolvedValue(null);

        const result = await departTransient('tp');

        expect(result.visit.childrenCreated).toBe(5);
        expect(result.visit.childrenAvgWeight).toBe(1.3);
    });

    it('handles childrenStats null when domainList is empty', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'tp', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]); // no domains returned

        const result = await departTransient('tp');

        expect(result.visit.childrenCreated).toBe(0);
        expect(result.visit.childrenAvgWeight).toBe(0);
    });
});

// =============================================================================
// importTransient — with partition metadata
// =============================================================================

describe('importTransient — with partition metadata', () => {
    it('uses provided partition.name and partition.description', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'my-project' });

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', name: 'Custom Name', description: 'A description', domains: [] },
        });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') &&
            params?.[1] === 'Custom Name' &&
            params?.[2] === 'A description'
        );
        expect(insertCall).toBeDefined();
    });

    it('uses project name from settings in visit record', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'my-project' });

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        });

        const visitInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_visits') && params?.includes('my-project')
        );
        expect(visitInsert).toBeDefined();
    });
});

// =============================================================================
// importTransient — config edge cases
// =============================================================================

describe('importTransient — config edge cases', () => {
    it('throws VALIDATION when config.transient.enabled is falsy', async () => {
        mockTransientConfig.enabled = false;

        await expect(importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: [] },
        })).rejects.toThrow('VALIDATION:');
    });
});

// =============================================================================
// importTransient — multiple domains inserted
// =============================================================================

describe('importTransient — multiple domains', () => {
    it('inserts each domain into partition_domains', async () => {
        mockQuery.mockResolvedValue([]);
        setupImportQueryOneMocks({ projectName: 'proj' });

        await importTransient({
            podbitExport: '1.0', owner: 'bob',
            partition: { id: 'p', domains: ['d1', 'd2', 'd3'] },
        });

        const domainInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT INTO partition_domains')
        );
        expect(domainInserts).toHaveLength(3);
    });
});
