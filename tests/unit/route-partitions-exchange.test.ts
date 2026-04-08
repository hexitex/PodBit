/**
 * Unit tests for routes/partitions/exchange.ts —
 * Covers uncovered branches: route handlers via supertest, export error paths,
 * import integrity verification, integrity log import, edge skip on error,
 * number variable outer catch, elite metadata import, overwrite cleanup catch,
 * and POST route non-validation error forwarding.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    VERSION: '1.0.0-test',
}));

const mockInvalidateKnowledgeCache = jest.fn<(domain: string) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const mockComputeMerkleRoot = jest.fn<(hashes: string[]) => string>().mockReturnValue('merkle-root-hash');
const mockGetIntegrityLogForNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockVerifyPartitionIntegrity = jest.fn<() => any>().mockReturnValue({
    merkleValid: true,
    chainValid: true,
    chainVerified: 0,
    nodesWithHashes: 0,
    nodesTotal: 0,
});

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeMerkleRoot: mockComputeMerkleRoot,
    getIntegrityLogForNodes: mockGetIntegrityLogForNodes,
    verifyPartitionIntegrity: mockVerifyPartitionIntegrity,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const { registerExchangeRoutes, exportPartition, importPartition } =
    await import('../../routes/partitions/exchange.js');

// Build test app with routes
const router = express.Router();
registerExchangeRoutes(router);
const app = express();
app.use(express.json());
app.use(router);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockComputeMerkleRoot.mockReturnValue('merkle-root-hash');
    mockGetIntegrityLogForNodes.mockResolvedValue([]);
    mockVerifyPartitionIntegrity.mockReturnValue({
        merkleValid: true, chainValid: true, chainVerified: 0, nodesWithHashes: 0, nodesTotal: 0,
    });
});

// =============================================================================
// Route: GET /partitions/:id/export
// =============================================================================

describe('GET /partitions/:id/export', () => {
    it('returns 400 when owner query parameter is missing', async () => {
        const res = await request(app).get('/partitions/part-1/export');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/owner/i);
    });

    it('returns 404 when partition is not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/partitions/nonexistent/export?owner=alice');

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('returns export JSON with Content-Disposition header', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // no domains

        const res = await request(app).get('/partitions/part-1/export?owner=bob');

        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toContain('bob-part-1.podbit.json');
        expect(res.body.owner).toBe('bob');
        expect(res.body.podbitExport).toBe('1.0');
    });
});

// =============================================================================
// Route: POST /partitions/import
// =============================================================================

describe('POST /partitions/import', () => {
    it('returns 400 for VALIDATION errors', async () => {
        const res = await request(app)
            .post('/partitions/import')
            .send({ owner: 'bob' }); // missing podbitExport and partition

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/VALIDATION:/);
    });

    it('returns 400 for CONFLICT errors', async () => {
        mockQueryOne.mockResolvedValue({ id: 'bob/my-part' }); // existing partition

        const res = await request(app)
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'bob',
                partition: { id: 'my-part', domains: ['science'] },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/CONFLICT:/);
    });

    it('passes overwrite=true from query parameter', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'bob/my-part' }) // existing partition
            .mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }]) // existing domains for cleanup
            .mockResolvedValue([]);

        const res = await request(app)
            .post('/partitions/import?overwrite=true')
            .send({
                podbitExport: '1.0',
                owner: 'bob',
                partition: { id: 'my-part', name: 'My Part', domains: ['science'] },
                nodes: [],
                edges: [],
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('forwards non-VALIDATION/CONFLICT errors to Express error handler', async () => {
        // Force importPartition to throw a generic error after validation passes
        mockQueryOne.mockRejectedValue(new Error('DB connection lost'));

        const res = await request(app)
            .post('/partitions/import')
            .send({
                podbitExport: '1.0',
                owner: 'bob',
                partition: { id: 'my-part', domains: ['science'] },
            });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/DB connection lost/);
    });
});

// =============================================================================
// exportPartition — bridge direction branch
// =============================================================================

describe('exportPartition — bridge direction', () => {
    it('uses partition_a as target when partition_b matches the exported partition', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([{ partition_a: 'part-other', partition_b: 'part-1' }]) // bridge — partition_b is ours
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValueOnce([]) // refs
            .mockResolvedValueOnce([]) // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('part-1', 'alice');

        expect(result!.bridges).toHaveLength(1);
        expect(result!.bridges[0].targetPartition).toBe('part-other');
    });
});

// =============================================================================
// exportPartition — integrity with log entries
// =============================================================================

describe('exportPartition — integrity log entries', () => {
    it('includes integrity with merkle root and mapped log entries', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockGetIntegrityLogForNodes.mockResolvedValue([
            {
                node_id: 'n1',
                operation: 'create',
                content_hash_before: null,
                content_hash_after: 'hash-after',
                parent_hashes: 'ph1,ph2',
                contributor: 'alice',
                prev_log_hash: null,
                log_hash: 'log-hash-1',
                partition_id: 'p1',
                timestamp: '2024-01-01T00:00:00Z',
            },
        ]);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: 'hash-after' }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockResolvedValueOnce([])  // refs
            .mockResolvedValueOnce([])  // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.podbitExport).toBe('1.1'); // integrity present => 1.1
        expect(result!.integrity).toBeDefined();
        expect(result!.integrity.merkleRoot).toBe('merkle-root-hash');
        expect(result!.integrity.log).toHaveLength(1);
        expect(result!.integrity.log[0].nodeId).toBe('n1');
        expect(result!.integrity.log[0].operation).toBe('create');
        expect(result!.integrity.chainLength).toBe(1);
        expect(result!.integrity.nodesWithHashes).toBe(1);
    });

    it('returns version 1.0 and no integrity when integrity computation fails', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        // Make integrity import throw
        mockComputeMerkleRoot.mockImplementation(() => { throw new Error('integrity module broken'); });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: 'h1' }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]) // refs
            .mockResolvedValueOnce([]) // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.podbitExport).toBe('1.0'); // no integrity => 1.0
        expect(result!.integrity).toBeUndefined();
    });
});

// =============================================================================
// exportPartition — number variables error catch
// =============================================================================

describe('exportPartition — number variables error', () => {
    it('skips number variables gracefully when table does not exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockRejectedValueOnce(new Error('no such table: node_number_refs')) // refs query fails
            .mockResolvedValueOnce([])  // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result).toBeDefined();
        expect(result!.numberVariables).toBeUndefined();
    });
});

// =============================================================================
// exportPartition — elite metadata
// =============================================================================

describe('exportPartition — elite metadata', () => {
    it('includes elite metadata when elite nodes exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockResolvedValueOnce([])  // node_number_refs (no refs)
            .mockResolvedValueOnce([{ node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' }]) // elite_nodes
            .mockResolvedValueOnce([{ id: 'mm1', node_id: 'n1', manifest_target_type: 'feature', manifest_target_text: 'search', relevance_score: 0.8, mapped_at: '2024-01-01' }]) // manifest_mappings
            .mockResolvedValueOnce([{ id: 'vv1', var_id: 'VAR1', elite_node_id: 'n1', verification_confidence: 0.95, verified_value: '42', verified_at: '2024-01-01' }]) // verified_variables
            .mockResolvedValueOnce([{ id: 'bl1', parent_a_id: 'n1', parent_b_id: 'n2', synthesis_node_id: 'n3', outcome: 'success', attempted_at: '2024-01-01' }]) // bridging_log
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.eliteMetadata).toBeDefined();
        expect(result!.eliteMetadata.eliteNodes).toHaveLength(1);
        expect(result!.eliteMetadata.manifestMappings).toHaveLength(1);
        expect(result!.eliteMetadata.verifiedVariables).toHaveLength(1);
        expect(result!.eliteMetadata.bridgingLog).toHaveLength(1);
    });

    it('skips elite metadata gracefully when elite table does not exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockResolvedValueOnce([])  // node_number_refs (no refs)
            .mockRejectedValueOnce(new Error('no such table: elite_nodes')) // elite query fails
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result).toBeDefined();
        expect(result!.eliteMetadata).toBeUndefined();
    });

    it('does not include elite metadata when no elite nodes exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockResolvedValueOnce([])  // node_number_refs
            .mockResolvedValueOnce([])  // elite_nodes (empty)
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.eliteMetadata).toBeUndefined();
    });
});

// =============================================================================
// exportPartition — no edges when no nodes
// =============================================================================

describe('exportPartition — edge query skipped with no nodes', () => {
    it('skips edge query when no nodes exist in domains', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([])  // nodes (empty)
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.edges).toEqual([]);
        expect(result!.nodeCount).toBe(0);
        // The edge query should not have been called since nodeIds is empty
        const edgeQueryCalls = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('FROM edges')
        );
        expect(edgeQueryCalls).toHaveLength(0);
    });
});

// =============================================================================
// importPartition — integrity verification branches
// =============================================================================

describe('importPartition — integrity verification', () => {
    function makePayload(overrides: Record<string, any> = {}) {
        return {
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', description: 'Sci', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            ...overrides,
        };
    }

    it('warns when merkle root is invalid (non-blocking)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockVerifyPartitionIntegrity.mockReturnValue({
            merkleValid: false,
            chainValid: true,
            chainVerified: 0,
            nodesWithHashes: 0,
            nodesTotal: 0,
            merkleComputed: 'computed-hash-1234567890',
        });

        const result = await importPartition(makePayload({
            integrity: { merkleRoot: 'wrong-root', log: [] },
        }), false);

        // Import still succeeds
        expect(result.success).toBe(true);
        expect(result.integrity).toBeDefined();
        expect(result.integrity.merkleValid).toBe(false);
    });

    it('warns when chain is broken (non-blocking)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockVerifyPartitionIntegrity.mockReturnValue({
            merkleValid: true,
            chainValid: false,
            chainVerified: 2,
            chainBrokenAt: 3,
            chainReason: 'hash mismatch',
            nodesWithHashes: 5,
            nodesTotal: 5,
        });

        const result = await importPartition(makePayload({
            integrity: { merkleRoot: 'some-root', log: [] },
        }), false);

        expect(result.success).toBe(true);
        expect(result.integrity.chainValid).toBe(false);
    });

    it('continues import when integrity verification throws', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockVerifyPartitionIntegrity.mockImplementation(() => {
            throw new Error('integrity module broken');
        });

        const result = await importPartition(makePayload({
            integrity: { merkleRoot: 'some-root', log: [] },
        }), false);

        // Import succeeds without integrity result
        expect(result.success).toBe(true);
        expect(result.integrity).toBeUndefined();
    });
});

// =============================================================================
// importPartition — integrity log import
// =============================================================================

describe('importPartition — integrity log import', () => {
    function makePayload(overrides: Record<string, any> = {}) {
        return {
            podbitExport: '1.1',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', description: 'Sci', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            ...overrides,
        };
    }

    it('inserts integrity log entries with camelCase field names', async () => {
        mockQueryOne.mockResolvedValue(null);

        await importPartition(makePayload({
            integrity: {
                merkleRoot: 'root',
                log: [{
                    nodeId: 'n1',
                    operation: 'create',
                    contentHashBefore: null,
                    contentHashAfter: 'hash-after',
                    parentHashes: 'ph1',
                    contributor: 'alice',
                    prevLogHash: null,
                    logHash: 'log-hash-1',
                    partitionId: 'sci',
                    timestamp: '2024-01-01T00:00:00Z',
                }],
            },
        }), false);

        const logInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT INTO integrity_log')
        );
        expect(logInserts).toHaveLength(1);
    });

    it('inserts integrity log entries with snake_case field names', async () => {
        mockQueryOne.mockResolvedValue(null);

        await importPartition(makePayload({
            integrity: {
                merkleRoot: 'root',
                log: [{
                    node_id: 'n1',
                    operation: 'create',
                    content_hash_before: null,
                    content_hash_after: 'hash-after',
                    parent_hashes: 'ph1',
                    contributor: 'alice',
                    prev_log_hash: null,
                    log_hash: 'log-hash-1',
                    partition_id: 'sci',
                    timestamp: '2024-01-01T00:00:00Z',
                }],
            },
        }), false);

        const logInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT INTO integrity_log')
        );
        expect(logInserts).toHaveLength(1);
    });

    it('continues import when integrity log insert fails (non-fatal)', async () => {
        mockQueryOne.mockResolvedValue(null);
        // Let the integrity log INSERT throw
        let callCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT INTO integrity_log')) {
                throw new Error('no such table: integrity_log');
            }
            return [];
        });

        const result = await importPartition(makePayload({
            integrity: {
                merkleRoot: 'root',
                log: [{ nodeId: 'n1', operation: 'create', contentHashAfter: 'h', logHash: 'lh', timestamp: '2024-01-01' }],
            },
        }), false);

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// importPartition — edge import error handling
// =============================================================================

describe('importPartition — edge skip on error', () => {
    it('counts skipped edges when INSERT throws', async () => {
        mockQueryOne.mockResolvedValue(null);

        let insertCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('INSERT INTO edges')) {
                insertCount++;
                if (insertCount === 1) throw new Error('UNIQUE constraint failed');
            }
            return [];
        });

        const result = await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [],
            edges: [
                { source_id: 'n1', target_id: 'n2', edge_type: 'parent', strength: 1.0 },
                { source_id: 'n3', target_id: 'n4', edge_type: 'parent', strength: 0.5 },
            ],
            bridges: [],
        }, false);

        expect(result.skipped.edges).toBe(1);
        expect(result.imported.edges).toBe(1);
    });
});

// =============================================================================
// importPartition — number variable import errors
// =============================================================================

describe('importPartition — number variable import errors', () => {
    it('catches outer number variable import failure (non-fatal)', async () => {
        mockQueryOne.mockResolvedValue(null);

        // Let the first number_registry INSERT throw, and the outer catch catches it
        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('INSERT INTO number_registry')) {
                throw new Error('no such table: number_registry');
            }
            return [];
        });

        const result = await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            numberVariables: {
                registry: [{ var_id: 'V1', value: '10', scope_text: 'ctx', source_node_id: 'n1', domain: 'science' }],
                refs: [{ node_id: 'n1', var_id: 'V1' }],
            },
        }, false);

        expect(result.success).toBe(true);
        // The outer catch swallowed the error; vars not imported
    });

    it('skips individual variable ref insert on conflict', async () => {
        mockQueryOne.mockResolvedValue(null);

        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('INSERT OR IGNORE INTO node_number_refs')) {
                throw new Error('constraint failed');
            }
            return [];
        });

        const result = await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            numberVariables: {
                registry: [{ var_id: 'V1', value: '10', scope_text: 'ctx', source_node_id: 'n1', domain: 'science' }],
                refs: [{ node_id: 'n1', var_id: 'V1' }],
            },
        }, false);

        expect(result.success).toBe(true);
        expect(result.imported.numberVariables).toBe(1); // registry succeeded, ref silently failed
    });
});

// =============================================================================
// importPartition — elite metadata import
// =============================================================================

describe('importPartition — elite metadata import', () => {
    function makePayload(overrides: Record<string, any> = {}) {
        return {
            podbitExport: '1.1',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            ...overrides,
        };
    }

    it('imports elite nodes, manifest mappings, verified variables, and bridging log', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makePayload({
            eliteMetadata: {
                eliteNodes: [
                    { node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' },
                ],
                manifestMappings: [
                    { id: 'mm1', node_id: 'n1', manifest_target_type: 'feature', manifest_target_text: 'search', relevance_score: 0.8, mapped_at: '2024-01-01' },
                ],
                verifiedVariables: [
                    { id: 'vv1', var_id: 'V1', elite_node_id: 'n1', verification_confidence: 0.95, verified_value: '42', verified_at: '2024-01-01' },
                ],
                bridgingLog: [
                    { id: 'bl1', parent_a_id: 'n1', parent_b_id: 'n2', synthesis_node_id: 'n3', outcome: 'success', attempted_at: '2024-01-01' },
                ],
            },
        }), false);

        expect(result.success).toBe(true);
        expect(result.imported.eliteNodes).toBe(1);

        // Verify the INSERT queries were called
        const eliteInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT OR IGNORE INTO elite_nodes')
        );
        expect(eliteInserts).toHaveLength(1);

        const manifestInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT OR IGNORE INTO elite_manifest_mappings')
        );
        expect(manifestInserts).toHaveLength(1);

        const varInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT OR IGNORE INTO elite_verified_variables')
        );
        expect(varInserts).toHaveLength(1);

        const bridgeInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT OR IGNORE INTO elite_bridging_log')
        );
        expect(bridgeInserts).toHaveLength(1);
    });

    it('skips individual elite node insert on conflict', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT OR IGNORE INTO elite_nodes')) {
                throw new Error('constraint failed');
            }
            return [];
        });

        const result = await importPartition(makePayload({
            eliteMetadata: {
                eliteNodes: [
                    { node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' },
                ],
            },
        }), false);

        expect(result.success).toBe(true);
        expect(result.imported.eliteNodes).toBe(0); // skipped due to error
    });

    it('catches outer elite metadata import failure (non-fatal)', async () => {
        mockQueryOne.mockResolvedValue(null);
        // The outer try-catch: make the first elite_nodes query throw
        // by throwing on the iteration itself (outer catch)
        const originalMock = mockQuery.getMockImplementation();
        let eliteCallCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('elite_nodes') && !s.includes('INSERT')) {
                // This shouldn't happen in import, only in export
            }
            if (s.includes('INSERT OR IGNORE INTO elite_nodes')) {
                eliteCallCount++;
                // Return successfully
                return [];
            }
            if (s.includes('INSERT OR IGNORE INTO elite_manifest_mappings')) {
                // Throw here to trigger the outer catch
                throw new Error('no such table: elite_manifest_mappings');
            }
            return [];
        });

        const result = await importPartition(makePayload({
            eliteMetadata: {
                eliteNodes: [
                    { node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' },
                ],
                manifestMappings: [
                    { id: 'mm1', node_id: 'n1', manifest_target_type: 'feature', manifest_target_text: 'search', relevance_score: 0.8, mapped_at: '2024-01-01' },
                ],
            },
        }), false);

        // The outer catch swallows the error; import still succeeds
        expect(result.success).toBe(true);
    });

    it('handles empty sub-arrays in elite metadata gracefully', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makePayload({
            eliteMetadata: {
                eliteNodes: [
                    { node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' },
                ],
                manifestMappings: [],
                verifiedVariables: [],
                bridgingLog: [],
            },
        }), false);

        expect(result.success).toBe(true);
        expect(result.imported.eliteNodes).toBe(1);
    });
});

// =============================================================================
// importPartition — overwrite with number variable cleanup catch
// =============================================================================

describe('importPartition — overwrite cleanup', () => {
    it('continues overwrite when number variable cleanup fails (table missing)', async () => {
        // First queryOne finds existing partition
        mockQueryOne
            .mockResolvedValueOnce({ id: 'alice/sci' }) // existing partition found
            .mockResolvedValue(null); // subsequent queryOne calls

        let numVarDeleteAttempted = false;
        mockQuery.mockImplementation(async (sql: any) => {
            const s = String(sql);
            if (s.includes('DELETE FROM node_number_refs')) {
                numVarDeleteAttempted = true;
                throw new Error('no such table: node_number_refs');
            }
            if (s.includes('SELECT domain FROM partition_domains')) {
                return [{ domain: 'science' }];
            }
            return [];
        });

        const result = await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
        }, true);

        expect(result.success).toBe(true);
        expect(numVarDeleteAttempted).toBe(true);
    });
});

// =============================================================================
// importPartition — bridge ordering
// =============================================================================

describe('importPartition — bridge ordering', () => {
    it('orders bridge partition IDs alphabetically (a < b)', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null) // no existing partition
            .mockResolvedValueOnce({ id: 'alice/aaa-part' }); // target bridge exists

        await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'zzz-part', name: 'Z', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [{ targetPartition: 'aaa-part' }],
        }, false);

        const bridgeInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO partition_bridges')
        );
        expect(bridgeInsert).toBeDefined();
        // alice/aaa-part < alice/zzz-part, so a=alice/aaa-part, b=alice/zzz-part
        expect(bridgeInsert[1][0]).toBe('alice/aaa-part');
        expect(bridgeInsert[1][1]).toBe('alice/zzz-part');
    });

    it('orders bridge partition IDs when target is after imported', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'alice/zzz-part' }); // target exists

        await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'aaa-part', name: 'A', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [{ targetPartition: 'zzz-part' }],
        }, false);

        const bridgeInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO partition_bridges')
        );
        expect(bridgeInsert).toBeDefined();
        // alice/aaa-part < alice/zzz-part
        expect(bridgeInsert[1][0]).toBe('alice/aaa-part');
        expect(bridgeInsert[1][1]).toBe('alice/zzz-part');
    });
});

// =============================================================================
// importPartition — defaults for missing optional fields
// =============================================================================

describe('importPartition — node defaults', () => {
    it('uses default values for optional node fields', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition({
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'sci', name: 'Science', domains: ['science'] },
            nodes: [{ id: 'n1', content: 'Minimal node', node_type: 'seed', domain: 'science' }],
            edges: [],
        }, false);

        expect(result.imported.nodes).toBe(1);

        // Find the node INSERT call and verify defaults
        const nodeInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO nodes')
        );
        expect(nodeInsert).toBeDefined();
        const params = nodeInsert[1];
        // weight defaults to 1.0
        expect(params[5]).toBe(1.0);
        // salience defaults to 1.0
        expect(params[6]).toBe(1.0);
        // origin defaults to 'import'
        expect(params[8]).toBe('import');
    });
});
