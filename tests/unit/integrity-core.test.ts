/**
 * Extended tests for core/integrity.ts — covers DB-aware functions (logOperation,
 * getPartitionIntegrityLog, getIntegrityLogForNodes, computeNodeContentHash) and
 * verifyPartitionIntegrity with log chain verification including camelCase/snake_case
 * log entry conversion.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const {
    computeContentHash,
    computeLogEntryHash,
    computeMerkleRoot,
    verifyMerkleRoot,
    verifyLogChain,
    verifyPartitionIntegrity,
    logOperation,
    getPartitionIntegrityLog,
    getIntegrityLogForNodes,
    computeNodeContentHash,
} = await import('../../core/integrity.js');

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// logOperation
// =============================================================================

describe('logOperation', () => {
    it('resolves partition from domain and inserts with chain linking', async () => {
        // resolvePartitionId: find partition for domain
        mockQueryOne
            .mockResolvedValueOnce({ partition_id: 'part-1' })   // resolvePartitionId
            .mockResolvedValueOnce({ log_hash: 'prev-hash-123' }); // getLastLogHash

        mockQuery.mockResolvedValueOnce([]); // INSERT

        await logOperation({
            nodeId: 'node-1',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'abc123',
            contributor: 'human',
            domain: 'test-domain',
        });

        expect(mockQueryOne).toHaveBeenCalledTimes(2);
        // First call: resolvePartitionId
        expect(mockQueryOne).toHaveBeenNthCalledWith(1,
            expect.stringContaining('partition_domains'),
            ['test-domain']
        );
        // Second call: getLastLogHash
        expect(mockQueryOne).toHaveBeenNthCalledWith(2,
            expect.stringContaining('integrity_log'),
            ['part-1']
        );
        // INSERT call
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO integrity_log'),
            expect.arrayContaining(['node-1', 'create', null, 'abc123'])
        );
    });

    it('handles null domain (no partition)', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await logOperation({
            nodeId: 'node-1',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'abc',
            contributor: null,
        });

        // queryOne should NOT be called for resolvePartitionId (domain is null/undefined)
        // But getLastLogHash with null partitionId also returns null immediately
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO integrity_log'),
            expect.arrayContaining(['node-1', 'create'])
        );
    });

    it('serializes parentHashes and details as JSON', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null) // no partition
            .mockResolvedValueOnce(null); // no prev hash

        mockQuery.mockResolvedValueOnce([]);

        await logOperation({
            nodeId: 'node-1',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'abc',
            parentHashes: ['h1', 'h2'],
            contributor: 'bot',
            details: { reason: 'test' },
            domain: 'missing-domain',
        });

        const insertArgs = mockQuery.mock.calls[0][1] as any[];
        // parentHashes should be JSON serialized
        expect(insertArgs).toContain(JSON.stringify(['h1', 'h2']));
        // details should be JSON serialized
        expect(insertArgs).toContain(JSON.stringify({ reason: 'test' }));
    });
});

// =============================================================================
// getPartitionIntegrityLog
// =============================================================================

describe('getPartitionIntegrityLog', () => {
    it('queries integrity_log for partition ordered by id ASC', async () => {
        const mockRows = [
            { id: 1, node_id: 'n1', operation: 'create' },
            { id: 2, node_id: 'n2', operation: 'create' },
        ];
        mockQuery.mockResolvedValueOnce(mockRows);

        const result = await getPartitionIntegrityLog('part-1');

        expect(result).toEqual(mockRows);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('partition_id = $1'),
            ['part-1']
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('ORDER BY id ASC'),
            expect.any(Array)
        );
    });
});

// =============================================================================
// getIntegrityLogForNodes
// =============================================================================

describe('getIntegrityLogForNodes', () => {
    it('returns empty array for empty nodeIds', async () => {
        const result = await getIntegrityLogForNodes([]);
        expect(result).toEqual([]);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries with IN clause for multiple nodeIds', async () => {
        const mockRows = [{ id: 1, node_id: 'n1' }];
        mockQuery.mockResolvedValueOnce(mockRows);

        const result = await getIntegrityLogForNodes(['n1', 'n2', 'n3']);

        expect(result).toEqual(mockRows);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('$1,$2,$3'),
            ['n1', 'n2', 'n3']
        );
    });

    it('queries with single placeholder for one nodeId', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await getIntegrityLogForNodes(['n1']);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('$1'),
            ['n1']
        );
    });
});

// =============================================================================
// computeNodeContentHash
// =============================================================================

describe('computeNodeContentHash', () => {
    it('returns null when node not found', async () => {
        mockQueryOne.mockResolvedValueOnce(null);

        const result = await computeNodeContentHash('missing-id');

        expect(result).toBeNull();
    });

    it('computes hash from node data and parent hashes', async () => {
        const nodeData = {
            content: 'test content',
            node_type: 'seed',
            contributor: 'human',
            created_at: '2024-01-01T00:00:00Z',
        };
        // mockReset needed to clear stale mockResolvedValue(null) from initial setup
        mockQueryOne.mockReset();
        mockQueryOne.mockResolvedValue(nodeData);
        mockQuery.mockReset();
        mockQuery.mockResolvedValue([
            { content_hash: 'parent-hash-1' },
            { content_hash: 'parent-hash-2' },
        ]);

        const result = await computeNodeContentHash('node-1');

        expect(mockQueryOne).toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result).toMatch(/^[a-f0-9]{64}$/);
        // Verify deterministic hash matches manual computation
        const expected = computeContentHash({
            content: 'test content',
            nodeType: 'seed',
            contributor: 'human',
            createdAt: '2024-01-01T00:00:00Z',
            parentHashes: ['parent-hash-1', 'parent-hash-2'],
        });
        expect(result).toBe(expected);
    });

    it('computes hash with no parents', async () => {
        const nodeData = {
            content: 'solo node',
            node_type: 'seed',
            contributor: null,
            created_at: '2024-06-15T12:00:00Z',
        };
        mockQueryOne.mockReset();
        mockQueryOne.mockResolvedValue(nodeData);
        mockQuery.mockReset();
        mockQuery.mockResolvedValue([]);

        const result = await computeNodeContentHash('node-solo');

        expect(result).toMatch(/^[a-f0-9]{64}$/);
        const expected = computeContentHash({
            content: 'solo node',
            nodeType: 'seed',
            contributor: null,
            createdAt: '2024-06-15T12:00:00Z',
            parentHashes: [],
        });
        expect(result).toBe(expected);
    });
});

// =============================================================================
// verifyPartitionIntegrity — log chain with camelCase/snake_case conversion
// =============================================================================

describe('verifyPartitionIntegrity — log chain verification', () => {
    it('verifies log chain from snake_case entries', () => {
        // Build a valid chain using snake_case keys (as might come from DB)
        const entry0 = {
            node_id: 'n1',
            operation: 'create',
            content_hash_before: null,
            content_hash_after: 'hash1',
            parent_hashes: null,
            contributor: 'bot',
            details: null,
            prev_log_hash: null,
            partition_id: 'part-1',
            timestamp: '2024-01-01T00:00:00Z',
            log_hash: '',
        };
        // Compute the hash using the function (which expects camelCase)
        entry0.log_hash = computeLogEntryHash({
            nodeId: entry0.node_id,
            operation: entry0.operation,
            contentHashBefore: entry0.content_hash_before,
            contentHashAfter: entry0.content_hash_after,
            parentHashes: entry0.parent_hashes,
            contributor: entry0.contributor,
            details: entry0.details,
            prevLogHash: entry0.prev_log_hash,
            partitionId: entry0.partition_id,
            timestamp: entry0.timestamp,
        });

        const result = verifyPartitionIntegrity({
            nodes: [{ content_hash: 'hash1' }],
            integrity: {
                merkleRoot: computeMerkleRoot(['hash1']),
                log: [entry0],
            },
        });

        expect(result.merkleValid).toBe(true);
        expect(result.chainValid).toBe(true);
        expect(result.chainVerified).toBe(1);
    });

    it('verifies multi-entry log chain with camelCase entries', () => {
        const entry0 = {
            nodeId: 'n1',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'hash1',
            parentHashes: null,
            contributor: 'bot',
            details: null,
            prevLogHash: null,
            partitionId: 'part-1',
            timestamp: '2024-01-01T00:00:00Z',
            logHash: '',
        };
        entry0.logHash = computeLogEntryHash(entry0);

        const entry1 = {
            nodeId: 'n2',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'hash2',
            parentHashes: null,
            contributor: 'bot',
            details: null,
            prevLogHash: entry0.logHash,
            partitionId: 'part-1',
            timestamp: '2024-01-02T00:00:00Z',
            logHash: '',
        };
        entry1.logHash = computeLogEntryHash(entry1);

        const result = verifyPartitionIntegrity({
            nodes: [{ content_hash: 'hash1' }, { content_hash: 'hash2' }],
            integrity: {
                merkleRoot: computeMerkleRoot(['hash1', 'hash2']),
                log: [entry0, entry1],
            },
        });

        expect(result.merkleValid).toBe(true);
        expect(result.chainValid).toBe(true);
        expect(result.chainVerified).toBe(2);
    });

    it('detects broken chain in export data', () => {
        const entry0 = {
            nodeId: 'n1',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'hash1',
            parentHashes: null,
            contributor: 'bot',
            details: null,
            prevLogHash: null,
            partitionId: 'part-1',
            timestamp: '2024-01-01T00:00:00Z',
            logHash: '',
        };
        entry0.logHash = computeLogEntryHash(entry0);

        const entry1 = {
            nodeId: 'n2',
            operation: 'create',
            contentHashBefore: null,
            contentHashAfter: 'hash2',
            parentHashes: null,
            contributor: 'bot',
            details: null,
            prevLogHash: 'wrong-prev-hash',
            partitionId: 'part-1',
            timestamp: '2024-01-02T00:00:00Z',
            logHash: 'tampered-hash',
        };

        const result = verifyPartitionIntegrity({
            nodes: [{ content_hash: 'hash1' }, { content_hash: 'hash2' }],
            integrity: {
                merkleRoot: computeMerkleRoot(['hash1', 'hash2']),
                log: [entry0, entry1],
            },
        });

        expect(result.chainValid).toBe(false);
        expect(result.chainBrokenAt).toBe(1);
    });

    it('handles export with no integrity field', () => {
        const result = verifyPartitionIntegrity({
            nodes: [{ content_hash: 'h1' }],
        });

        expect(result.merkleValid).toBe(false);
        expect(result.chainValid).toBe(true);
        expect(result.nodesTotal).toBe(1);
    });

    it('handles integrity with empty log array', () => {
        const result = verifyPartitionIntegrity({
            nodes: [{ content_hash: 'h1' }],
            integrity: {
                merkleRoot: computeMerkleRoot(['h1']),
                log: [],
            },
        });

        expect(result.merkleValid).toBe(true);
        expect(result.chainValid).toBe(true);
        expect(result.chainVerified).toBe(0);
    });
});

// =============================================================================
// computeContentHash — additional edge cases
// =============================================================================

describe('computeContentHash — edge cases', () => {
    it('empty parent hashes produces same hash as no parentHashes', () => {
        const base = { content: 'test', nodeType: 'seed', contributor: 'a', createdAt: '2024-01-01' };
        const h1 = computeContentHash(base);
        const h2 = computeContentHash({ ...base, parentHashes: [] });
        expect(h1).toBe(h2);
    });

    it('different contributors produce different hashes', () => {
        const base = { content: 'test', nodeType: 'seed', createdAt: '2024-01-01' };
        const h1 = computeContentHash({ ...base, contributor: 'alice' });
        const h2 = computeContentHash({ ...base, contributor: 'bob' });
        expect(h1).not.toBe(h2);
    });

    it('different timestamps produce different hashes', () => {
        const base = { content: 'test', nodeType: 'seed', contributor: 'a' };
        const h1 = computeContentHash({ ...base, createdAt: '2024-01-01' });
        const h2 = computeContentHash({ ...base, createdAt: '2024-01-02' });
        expect(h1).not.toBe(h2);
    });
});

// =============================================================================
// verifyMerkleRoot — additional cases
// =============================================================================

describe('verifyMerkleRoot — edge cases', () => {
    it('works with nodes that have undefined content_hash', () => {
        const nodes = [
            { content_hash: undefined },
            { content_hash: 'h1' },
        ];
        const expected = computeMerkleRoot(['h1']);
        const result = verifyMerkleRoot(nodes, expected);
        expect(result.valid).toBe(true);
        expect(result.nodesWithHashes).toBe(1);
        expect(result.nodesTotal).toBe(2);
    });
});
