/**
 * Unit tests for routes/partitions/exchange.ts —
 * exportPartition and importPartition.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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
    VERSION: '1.0.0',
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

const { exportPartition, importPartition } = await import('../../routes/partitions/exchange.js');

beforeEach(() => {
    jest.resetAllMocks();
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
// exportPartition
// =============================================================================

describe('exportPartition', () => {
    it('returns null when partition is not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await exportPartition('nonexistent', 'alice');

        expect(result).toBeNull();
    });

    it('returns empty export when partition has no domains', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'Partition One', description: 'Test', created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // no domains

        const result = await exportPartition('part-1', 'alice');

        expect(result).toBeDefined();
        expect(result!.nodes).toEqual([]);
        expect(result!.edges).toEqual([]);
        expect(result!.nodeCount).toBe(0);
        expect(result!.edgeCount).toBe(0);
    });

    it('includes owner and partition metadata in export', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'Science', description: 'Science partition', created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]); // no domains

        const result = await exportPartition('part-1', 'alice');

        expect(result!.owner).toBe('alice');
        expect(result!.partition.id).toBe('part-1');
        expect(result!.partition.name).toBe('Science');
    });

    it('returns podbitExport version 1.0 in empty-domain case', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery.mockResolvedValueOnce([]);

        const result = await exportPartition('p1', 'bob');

        expect(result!.podbitExport).toBe('1.0');
    });

    it('returns nodes and edges when domains and nodes exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'Science', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }, { domain: 'math' }]) // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'node-1', content: 'Content', domain: 'science', content_hash: 'abc' }]) // nodes
            .mockResolvedValueOnce([{ source_id: 'node-1', target_id: 'node-2', edge_type: 'parent', strength: 1.0 }]) // edges
            .mockResolvedValueOnce([])  // node_number_refs (no refs)
            .mockResolvedValueOnce([]) // elite_nodes
            .mockResolvedValue([]);

        const result = await exportPartition('part-1', 'alice');

        expect(result!.nodes).toHaveLength(1);
        expect(result!.edges).toHaveLength(1);
        expect(result!.nodeCount).toBe(1);
        expect(result!.edgeCount).toBe(1);
    });

    it('builds bridge list showing target partitions', async () => {
        mockQueryOne.mockResolvedValue({ id: 'part-1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([{ partition_a: 'part-1', partition_b: 'part-2' }]) // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValueOnce([]) // refs
            .mockResolvedValueOnce([]) // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('part-1', 'alice');

        expect(result!.bridges).toHaveLength(1);
        expect(result!.bridges[0].targetPartition).toBe('part-2');
    });

    it('includes number variables when nodes have variable refs', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P', description: null, created_at: '2024-01-01' });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])  // domains
            .mockResolvedValueOnce([])  // bridges
            .mockResolvedValueOnce([{ id: 'n1', content: 'c with [[[VAR001]]]', domain: 'science', content_hash: null }]) // nodes
            .mockResolvedValueOnce([])  // edges
            .mockResolvedValueOnce([{ node_id: 'n1', var_id: 'SBKR001' }]) // refs
            .mockResolvedValueOnce([{ var_id: 'SBKR001', value: '42', scope_text: 'context', source_node_id: 'n1', domain: 'science', created_at: '2024-01-01' }]) // registry
            .mockResolvedValueOnce([]) // elite nodes
            .mockResolvedValue([]);

        const result = await exportPartition('p1', 'alice');

        expect(result!.numberVariables).toBeDefined();
        expect(result!.numberVariables.registry).toHaveLength(1);
    });
});

// =============================================================================
// importPartition — validation
// =============================================================================

describe('importPartition — validation', () => {
    it('throws VALIDATION error when podbitExport is missing', async () => {
        await expect(importPartition({ owner: 'bob', partition: { id: 'p', domains: [] } }, false))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION error when owner is missing', async () => {
        await expect(importPartition({ podbitExport: '1.0', partition: { id: 'p', domains: [] } }, false))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION error when partition is missing', async () => {
        await expect(importPartition({ podbitExport: '1.0', owner: 'bob' }, false))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION error when partition.id is missing', async () => {
        await expect(importPartition({ podbitExport: '1.0', owner: 'bob', partition: { domains: ['science'] } }, false))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION error when partition.domains is missing', async () => {
        await expect(importPartition({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p' } }, false))
            .rejects.toThrow('VALIDATION:');
    });
});

// =============================================================================
// importPartition — conflict handling
// =============================================================================

describe('importPartition — conflict handling', () => {
    it('throws CONFLICT error when partition exists and overwrite=false', async () => {
        mockQueryOne.mockResolvedValue({ id: 'bob/my-part' }); // existing partition found

        await expect(importPartition({
            podbitExport: '1.0',
            owner: 'bob',
            partition: { id: 'my-part', domains: ['science'] },
        }, false)).rejects.toThrow('CONFLICT:');
    });

    it('deletes existing partition data when overwrite=true', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'bob/my-part' }) // existing partition found
            .mockResolvedValue(null);  // subsequent queryOne calls
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }]) // existing domains
            .mockResolvedValue([]);  // all DELETEs and INSERTs

        await importPartition({
            podbitExport: '1.0',
            owner: 'bob',
            partition: { id: 'my-part', domains: ['science'] },
            nodes: [],
            edges: [],
        }, true);

        // Should have deleted the old partition
        const deletePartition = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM domain_partitions')
        );
        expect(deletePartition).toBeDefined();
    });
});

// =============================================================================
// importPartition — successful import
// =============================================================================

describe('importPartition — successful import', () => {
    function makeImportPayload(overrides: Record<string, any> = {}) {
        return {
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'science-part', name: 'Science', description: 'Science domain', domains: ['science'] },
            nodes: [],
            edges: [],
            bridges: [],
            ...overrides,
        };
    }

    it('creates the partition with namespaced ID (owner/original-id)', async () => {
        mockQueryOne.mockResolvedValue(null); // no existing partition

        await importPartition(makeImportPayload(), false);

        const createCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') && Array.isArray(params) && params.includes('alice/science-part')
        );
        expect(createCall).toBeDefined();
    });

    it('inserts partition domains', async () => {
        mockQueryOne.mockResolvedValue(null);

        await importPartition(makeImportPayload({
            partition: { id: 'p', name: 'P', domains: ['science', 'math'] },
        }), false);

        const domainInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT INTO partition_domains')
        );
        expect(domainInserts).toHaveLength(2);
    });

    it('counts imported nodes correctly', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]); // all queries succeed

        const result = await importPartition(makeImportPayload({
            nodes: [
                { id: 'n1', content: 'Content 1', node_type: 'seed', domain: 'science' },
                { id: 'n2', content: 'Content 2', node_type: 'voiced', domain: 'science' },
            ],
        }), false);

        expect(result.imported.nodes).toBe(2);
        expect(result.skipped.nodes).toBe(0);
    });

    it('counts skipped nodes when INSERT throws (UUID collision)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([]) // INSERT partition
            .mockResolvedValueOnce([]) // INSERT domain
            .mockRejectedValueOnce(new Error('UNIQUE constraint failed')) // node INSERT fails
            .mockResolvedValue([]);

        const result = await importPartition(makeImportPayload({
            nodes: [{ id: 'n1', content: 'c', node_type: 'seed', domain: 'science' }],
        }), false);

        expect(result.skipped.nodes).toBe(1);
        expect(result.imported.nodes).toBe(0);
    });

    it('counts imported edges correctly', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makeImportPayload({
            edges: [
                { source_id: 'n1', target_id: 'n2', edge_type: 'parent', strength: 1.0 },
            ],
        }), false);

        expect(result.imported.edges).toBe(1);
    });

    it('creates bridges when target partition exists on system', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null) // no existing partition for our import
            .mockResolvedValueOnce({ id: 'alice/other-part' }); // target bridge exists

        const result = await importPartition(makeImportPayload({
            bridges: [{ targetPartition: 'other-part' }],
        }), false);

        expect(result.imported.bridges).toBe(1);
    });

    it('skips bridges when target partition does not exist', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null) // no existing import partition
            .mockResolvedValueOnce(null); // target bridge NOT found

        const result = await importPartition(makeImportPayload({
            bridges: [{ targetPartition: 'nonexistent-part' }],
        }), false);

        expect(result.imported.bridges).toBe(0);
        expect(result.skipped.bridges).toContain('alice/nonexistent-part');
    });

    it('imports number variables when present', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makeImportPayload({
            numberVariables: {
                registry: [{ var_id: 'ABCD001', value: '42', scope_text: 'ctx', source_node_id: 'n1', domain: 'science', created_at: '2024-01-01' }],
                refs: [{ node_id: 'n1', var_id: 'ABCD001' }],
            },
        }), false);

        expect(result.imported.numberVariables).toBe(1);
    });

    it('invalidates knowledge cache for each imported domain', async () => {
        mockQueryOne.mockResolvedValue(null);

        await importPartition(makeImportPayload({
            partition: { id: 'p', name: 'P', domains: ['science', 'math'] },
        }), false);

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('math');
    });

    it('includes integrity validation result in response when data has integrity field', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockVerifyPartitionIntegrity.mockReturnValue({
            merkleValid: true, chainValid: true, chainVerified: 3, nodesWithHashes: 2, nodesTotal: 2,
        });

        const result = await importPartition(makeImportPayload({
            integrity: { merkleRoot: 'abc', log: [] },
        }), false);

        expect(result.integrity).toBeDefined();
        expect(result.integrity.merkleValid).toBe(true);
    });

    it('returns success=true on successful import', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makeImportPayload(), false);

        expect(result.success).toBe(true);
    });

    it('sets correct partitionId in response', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await importPartition(makeImportPayload(), false);

        expect(result.imported.partitionId).toBe('alice/science-part');
    });
});
