/**
 * Integration flow: Partition export → import roundtrip.
 *
 * GET /partitions/:id/export?owner=rob
 *   → returns JSON payload (partition + domain + node)
 *
 * POST /partitions/import  { body: <captured export JSON> }
 *   → imports under "rob/<original-id>", returns success counts
 *
 * The export response body is the exact payload passed to the import request,
 * verifying that the serialised format produced by export is accepted by import.
 *
 * Mocks: db.js (query, queryOne), config.js (VERSION),
 *        core/integrity.js (Merkle + log helpers),
 *        handlers/knowledge.js (invalidateKnowledgeCache),
 *        async-handler
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Integrity helpers — simplified deterministic implementations
const mockComputeMerkleRoot = jest.fn<(hashes: string[]) => string | null>(
    (hashes) => hashes.length > 0 ? 'mock-merkle-root' : null,
);
const mockGetIntegrityLogForNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockVerifyPartitionIntegrity = jest.fn<() => any>().mockReturnValue({
    merkleValid: true,
    chainValid: true,
    chainVerified: 0,
    nodesWithHashes: 1,
    nodesTotal: 1,
});

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    VERSION: '1.2.3-test',
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeMerkleRoot: mockComputeMerkleRoot,
    getIntegrityLogForNodes: mockGetIntegrityLogForNodes,
    verifyPartitionIntegrity: mockVerifyPartitionIntegrity,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { registerExchangeRoutes } = await import('../../routes/partitions/exchange.js');

/** Express app with exchange routes + error handler for VALIDATION/CONFLICT errors. */
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerExchangeRoutes(router);
    app.use('/', router);
    app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(500).json({ error: err.message });
    });
    return app;
}

// Sample node fixture — matches the SELECT column list in exportPartition
const EXPORTED_NODE = {
    id: 'n-abc123',
    content: 'AI safety research requires multi-domain collaboration.',
    node_type: 'seed',
    trajectory: 'knowledge',
    domain: 'ai-safety',
    weight: 1.5,
    salience: 1.2,
    specificity: 2.4,
    origin: 'manual',
    contributor: 'user',
    validation_synthesis: null,
    validation_novelty: null,
    validation_testability: null,
    validation_tension_resolution: null,
    validation_composite: null,
    validation_reason: null,
    validated_at: null,
    validated_by: null,
    content_hash: 'sha256-abc123def456',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
};

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockGetIntegrityLogForNodes.mockResolvedValue([]);
    mockVerifyPartitionIntegrity.mockReturnValue({
        merkleValid: true, chainValid: true, chainVerified: 0,
        nodesWithHashes: 1, nodesTotal: 1,
    });
    mockComputeMerkleRoot.mockImplementation((hashes) => hashes.length > 0 ? 'mock-merkle-root' : null);
});

// =============================================================================
// Export → Import roundtrip
// =============================================================================

describe('Partition export → import roundtrip', () => {
    it('exports a partition with nodes then imports the payload successfully', async () => {
        const app = buildApp();

        // ── Step 1: Export ─────────────────────────────────────────────────────
        // DB call order in exportPartition (has domains):
        // queryOne #1: partition metadata
        // query #1:    domains
        // query #2:    bridges
        // query #3:    nodes (domain IN placeholders)
        // query #4:    edges (nodeIds IN placeholders × 2)
        // query #5:    node_number_refs
        // (no refs → no number_registry query)
        // query #6:    elite_nodes
        // integrity dynamic-import calls: computeMerkleRoot, getIntegrityLogForNodes

        mockQueryOne.mockResolvedValueOnce({
            id: 'p-export',
            name: 'AI Safety Research',
            description: 'Core alignment nodes',
            created_at: '2024-01-01T00:00:00Z',
        });

        mockQuery
            .mockResolvedValueOnce([{ domain: 'ai-safety' }])  // domains
            .mockResolvedValueOnce([])                          // bridges
            .mockResolvedValueOnce([EXPORTED_NODE])             // nodes
            .mockResolvedValueOnce([])                          // edges
            .mockResolvedValueOnce([])                          // node_number_refs
            .mockResolvedValueOnce([])                          // elite_nodes
            .mockResolvedValue([]);                             // catch-all

        const exportRes = await request(app)
            .get('/partitions/p-export/export')
            .query({ owner: 'rob' });

        expect(exportRes.status).toBe(200);
        expect(exportRes.body.podbitExport).toMatch(/^1\./);
        expect(exportRes.body.owner).toBe('rob');
        expect(exportRes.body.partition.id).toBe('p-export');
        expect(exportRes.body.partition.domains).toEqual(['ai-safety']);
        expect(exportRes.body.nodes).toHaveLength(1);
        expect(exportRes.body.nodes[0].id).toBe('n-abc123');
        expect(exportRes.body.nodeCount).toBe(1);
        expect(exportRes.body.edgeCount).toBe(0);
        expect(exportRes.headers['content-disposition']).toContain('rob-p-export.podbit.json');

        const exportPayload = exportRes.body; // flows into Step 2

        // ── Step 2: Import the captured payload ────────────────────────────────
        // DB call order in importPartition (no overwrite, no bridges, 1 node):
        // queryOne #1: collision check → null
        // query #1:    INSERT domain_partitions
        // query #2:    INSERT partition_domains (ai-safety)
        // (integrity.log is [] so no integrity_log inserts)
        // query #3:    INSERT nodes (n-abc123)
        // (no edges, no bridges, no numberVariables, no eliteMetadata)
        // invalidateKnowledgeCache('ai-safety')

        mockQueryOne.mockResolvedValueOnce(null); // no collision
        mockQuery.mockResolvedValue([]);           // all INSERTs

        const importRes = await request(app)
            .post('/partitions/import')
            .send(exportPayload);

        expect(importRes.status).toBe(200);
        expect(importRes.body.success).toBe(true);
        expect(importRes.body.imported.partitionId).toBe('rob/p-export');
        expect(importRes.body.imported.domains).toBe(1);
        expect(importRes.body.imported.nodes).toBe(1);
        expect(importRes.body.imported.edges).toBe(0);
        expect(importRes.body.imported.bridges).toBe(0);

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('ai-safety');
    });

    it('exports a no-domains partition (early return) and imports the empty payload', async () => {
        const app = buildApp();

        // ── Step 1: Export (no domains → early return) ────────────────────────
        mockQueryOne.mockResolvedValueOnce({
            id: 'p-empty',
            name: 'Empty Partition',
            description: null,
            created_at: '2024-01-01T00:00:00Z',
        });
        mockQuery.mockResolvedValueOnce([]); // domains → empty → early return

        const exportRes = await request(app)
            .get('/partitions/p-empty/export')
            .query({ owner: 'alice' });

        expect(exportRes.status).toBe(200);
        expect(exportRes.body.partition.domains).toEqual([]);
        expect(exportRes.body.nodes).toEqual([]);
        expect(exportRes.body.edges).toEqual([]);

        const emptyPayload = exportRes.body;

        // ── Step 2: Import (no domains → no cache invalidation) ───────────────
        mockQueryOne.mockResolvedValueOnce(null); // no collision
        mockQuery.mockResolvedValue([]);

        const importRes = await request(app)
            .post('/partitions/import')
            .send(emptyPayload);

        expect(importRes.status).toBe(200);
        expect(importRes.body.success).toBe(true);
        expect(importRes.body.imported.partitionId).toBe('alice/p-empty');
        expect(importRes.body.imported.domains).toBe(0);
        expect(importRes.body.imported.nodes).toBe(0);

        // No domains → invalidateKnowledgeCache not called
        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });

    it('import returns CONFLICT when partition already exists without overwrite', async () => {
        const app = buildApp();

        // Craft a minimal valid export payload (no export call needed here)
        const payload = {
            podbitExport: '1.0',
            systemVersion: '1.0.0',
            exportedAt: new Date().toISOString(),
            owner: 'rob',
            partition: { id: 'p-existing', name: 'Existing', description: null, domains: ['test'] },
            bridges: [],
            nodes: [],
            edges: [],
            nodeCount: 0,
            edgeCount: 0,
        };

        // Collision check → partition already exists
        mockQueryOne.mockResolvedValueOnce({ id: 'rob/p-existing' });

        const importRes = await request(app)
            .post('/partitions/import')
            .send(payload);

        expect(importRes.status).toBe(400);
        expect(importRes.body.error).toContain('CONFLICT:');
        expect(importRes.body.error).toContain('rob/p-existing');
    });
});
