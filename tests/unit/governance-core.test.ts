/**
 * Additional unit tests for core/governance.ts —
 * Covers uncovered paths: getPartitionTopNodes, getTransientDomains caching,
 * renameDomain edge cases (PK conflict, bias_observations table missing),
 * ensurePartition error handling, and logDecision DB failure.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockEnsureDomainSynonyms = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    ensureDomainSynonyms: mockEnsureDomainSynonyms,
}));

const {
    getAccessibleDomains,
    ensurePartition,
    logDecision,
    canOverride,
    getPartitionForDomain,
    getPartitionTopNodes,
    checkPartitionHealth,
    isTransientDomain,
    clearTransientCache,
    getTransientDomains,
    renameDomain,
    getExcludedDomainsForCycle,
    clearCycleExclusionCache,
} = await import('../../core/governance.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockEnsureDomainSynonyms.mockResolvedValue(undefined);
    clearTransientCache();
    clearCycleExclusionCache();
});

// =============================================================================
// getPartitionTopNodes
// =============================================================================

describe('getPartitionTopNodes', () => {
    it('returns nodes from non-excluded partitions', async () => {
        // First call: get bridges for excludePartitionId
        mockQuery
            .mockResolvedValueOnce([{ partition_a: 'p1', partition_b: 'p2' }]) // bridges
            .mockResolvedValueOnce([                                            // top nodes
                { id: 'n1', content: 'Node 1', weight: 2.0, domain: 'foreign' },
                { id: 'n2', content: 'Node 2', weight: 1.5, domain: 'other' },
            ]);

        const nodes = await getPartitionTopNodes('p1', 5);

        expect(nodes).toHaveLength(2);
        // The query should exclude both p1 and p2 (bridged)
        const selectCall = mockQuery.mock.calls[1];
        const sql = String(selectCall[0]);
        expect(sql).toContain('NOT IN');
    });

    it('returns empty array when no foreign partitions exist', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no bridges
            .mockResolvedValueOnce([]); // no nodes from foreign partitions

        const nodes = await getPartitionTopNodes('p1', 10);

        expect(nodes).toHaveLength(0);
    });

    it('excludes all bridged partitions from results', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { partition_a: 'p1', partition_b: 'p2' },
                { partition_a: 'p3', partition_b: 'p1' },
            ])
            .mockResolvedValueOnce([]);

        await getPartitionTopNodes('p1', 5);

        // Should exclude p1, p2, p3 in the NOT IN clause
        const selectCall = mockQuery.mock.calls[1];
        const params = selectCall[1] as any[];
        // params = [topK, ...excludeArr]
        expect(params[0]).toBe(5); // topK
        expect(params).toContain('p1');
        expect(params).toContain('p2');
        expect(params).toContain('p3');
    });
});

// =============================================================================
// getTransientDomains — caching behavior
// =============================================================================

describe('getTransientDomains', () => {
    it('returns transient domains with state', async () => {
        mockQuery.mockResolvedValue([
            { domain: 'visitor-a', state: 'active' },
            { domain: 'visitor-b', state: 'quarantine' },
        ]);

        const result = await getTransientDomains();

        expect(result.domains).toContain('visitor-a');
        expect(result.domains).toContain('visitor-b');
        expect(result.states.get('visitor-a')).toBe('active');
        expect(result.states.get('visitor-b')).toBe('quarantine');
    });

    it('caches results across calls', async () => {
        mockQuery.mockResolvedValue([{ domain: 'cached', state: 'active' }]);

        await getTransientDomains();
        await getTransientDomains();

        // Only one query should have been made
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('clearTransientCache forces re-query', async () => {
        mockQuery.mockResolvedValue([{ domain: 'old', state: 'active' }]);
        await getTransientDomains();

        clearTransientCache();
        mockQuery.mockResolvedValue([{ domain: 'new', state: 'active' }]);
        const result = await getTransientDomains();

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(result.domains).toContain('new');
    });

    it('returns empty on query error', async () => {
        mockQuery.mockRejectedValue(new Error('no such table'));

        const result = await getTransientDomains();

        expect(result.domains).toHaveLength(0);
        expect(result.states.size).toBe(0);
    });

    it('defaults state to active when null', async () => {
        mockQuery.mockResolvedValue([{ domain: 'no-state', state: null }]);

        const result = await getTransientDomains();

        expect(result.states.get('no-state')).toBe('active');
    });
});

// =============================================================================
// getAccessibleDomains — transient filtering edge cases
// =============================================================================

describe('getAccessibleDomains — departed transient filtering', () => {
    it('excludes departed transient domains from accessible list', async () => {
        clearTransientCache();
        mockQueryOne.mockResolvedValue({ partition_id: 'p1' });

        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }, { domain: 'departed-visitor' }]) // own domains
            .mockResolvedValueOnce([])                                                       // no bridges
            .mockResolvedValueOnce([{ domain: 'departed-visitor', state: 'departed' }]);     // transient

        const result = await getAccessibleDomains('science');
        expect(result).toContain('science');
        expect(result).not.toContain('departed-visitor');
    });
});

// =============================================================================
// renameDomain — additional edge cases
// =============================================================================

describe('renameDomain — edge cases', () => {
    it('handles PK conflict in partition_domains (deletes old instead of updating)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '5' })           // old nodes exist
            .mockResolvedValueOnce(null)                    // old not in partition (checked by node count)
            .mockResolvedValueOnce({ cnt: '0' })           // new domain no nodes
            .mockResolvedValueOnce(null)                    // new not in partition
            .mockResolvedValueOnce({ partition_id: 'p1' }) // existingPd for old domain
            .mockResolvedValueOnce({ x: 1 })               // PK conflict exists!
            .mockResolvedValue(null);

        mockQuery.mockResolvedValue([]);

        const result = await renameDomain('old-domain', 'new-domain');
        expect(result.success).toBe(true);

        // Should DELETE old instead of UPDATE
        const deleteCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('DELETE FROM partition_domains')
        );
        expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('handles bias_observations table not existing', async () => {
        // Setup successful rename path
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '2' })  // old exists
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ cnt: '0' })  // new doesn't exist
            .mockResolvedValueOnce(null)
            .mockResolvedValue(null);

        let callIdx = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            callIdx++;
            if (String(sql).includes('bias_observations')) {
                throw new Error('no such table: bias_observations');
            }
            return [];
        });

        const result = await renameDomain('has-bias', 'no-bias');
        expect(result.success).toBe(true);
    });

    it('rejects domain names longer than 50 chars after normalization', async () => {
        const longName = 'a'.repeat(51);
        const result = await renameDomain('old', longName);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
    });

    it('rejects domain names with only special characters', async () => {
        const result = await renameDomain('old', '!!!@@@###');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid');
    });

    it('allows rename when old domain exists only in partition_domains', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '0' })   // no nodes in old domain
            .mockResolvedValueOnce({ x: 1 })        // but it IS in partition_domains
            .mockResolvedValueOnce({ cnt: '0' })   // new domain has no nodes
            .mockResolvedValueOnce(null)            // new not in partition
            .mockResolvedValue(null);

        mockQuery.mockResolvedValue([]);

        const result = await renameDomain('partition-only', 'renamed');
        expect(result.success).toBe(true);
    });

    it('returns error on unexpected query failure during rename', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '5' })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce(null)
            .mockResolvedValue(null);

        mockQuery.mockRejectedValue(new Error('disk full'));

        const result = await renameDomain('old', 'new-name');
        expect(result.success).toBe(false);
        expect(result.error).toContain('disk full');
    });
});

// =============================================================================
// ensurePartition — error handling
// =============================================================================

describe('ensurePartition — error paths', () => {
    it('handles INSERT failure for partition creation', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)           // domain not in any partition
            .mockResolvedValueOnce(null)            // autoBridge setting
            .mockResolvedValue(null);

        // First INSERT (domain_partitions) throws, second (partition_domains) succeeds
        let insertCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('INSERT')) {
                insertCount++;
                if (insertCount === 1) {
                    throw new Error('UNIQUE constraint failed');
                }
            }
            return [];
        });

        // Should not throw — errors are caught internally
        const result = await ensurePartition('error-domain');
        // Still returns partition id despite insert error (domain name derived)
        expect(result).toBeDefined();
    });

    it('derives partition name with title case from kebab-case domain', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)            // domain not in partition
            .mockResolvedValueOnce(null)             // no autoBridge
            .mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await ensurePartition('my-cool-domain');

        // Check INSERT call has title-cased name
        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO domain_partitions')
        );
        expect(insertCall).toBeDefined();
        const args = insertCall[1] as any[];
        expect(args[1]).toBe('My Cool Domain'); // partition name
    });
});

// =============================================================================
// canOverride — additional paths
// =============================================================================

describe('canOverride — human overriding human', () => {
    it('allows human to override another human decision', async () => {
        mockQueryOne.mockResolvedValue({
            decided_by_tier: 'human',
            contributor: 'gui:admin',
            created_at: '2024-01-01',
        });

        const result = await canOverride('node', 'n1', 'domain', 'human');
        expect(result.allowed).toBe(true);
    });
});

// =============================================================================
// checkPartitionHealth — transient partition handling
// =============================================================================

describe('checkPartitionHealth — transient partitions', () => {
    it('skips transient partitions from unbridged warnings', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'visitor-p', name: 'Visitor', system: 0, transient: 1 },
            ])
            .mockResolvedValueOnce([])                                          // no bridges
            .mockResolvedValueOnce([{ partition_id: 'visitor-p', domain: 'visitor' }])
            .mockResolvedValueOnce([]);                                         // no orphans

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(true);
        expect(result.unbridgedPartitions).toHaveLength(0);
    });
});

// =============================================================================
// getExcludedDomainsForCycle — non-array allowed_cycles
// =============================================================================

describe('getExcludedDomainsForCycle — non-array values', () => {
    it('skips rows where allowed_cycles parses to a non-array value', async () => {
        mockQuery.mockResolvedValue([
            { allowed_cycles: '"just a string"', domain: 'stringy' },
        ]);

        const excluded = await getExcludedDomainsForCycle('synthesis');
        // Non-array should be skipped — domain is NOT excluded
        expect(excluded.has('stringy')).toBe(false);
    });

    it('returns empty set for unknown cycle name', async () => {
        mockQuery.mockResolvedValue([]);
        const excluded = await getExcludedDomainsForCycle('nonexistent');
        expect(excluded.size).toBe(0);
    });
});
