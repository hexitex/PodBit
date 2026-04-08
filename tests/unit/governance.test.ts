/**
 * Unit tests for core/governance.ts
 *
 * Tests: canOverride, logDecision, ensurePartition, getAccessibleDomains,
 *        getPartitionForDomain, checkPartitionHealth, isTransientDomain,
 *        clearTransientCache, renameDomain.
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
    canOverride,
    logDecision,
    ensurePartition,
    getAccessibleDomains,
    getPartitionForDomain,
    checkPartitionHealth,
    isTransientDomain,
    clearTransientCache,
    renameDomain,
    getTransientDomains,
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
// canOverride
// =============================================================================

describe('canOverride', () => {
    it('always allows human overrides', async () => {
        const result = await canOverride('node', 'n1', 'domain', 'human');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('Human override');
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('allows when no prior decision exists', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await canOverride('node', 'n1', 'domain', 'system');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('No prior decision');
    });

    it('blocks non-human from overriding a human decision', async () => {
        mockQueryOne.mockResolvedValue({
            decided_by_tier: 'human',
            contributor: 'gui:user',
            created_at: '2024-01-01',
        });
        const result = await canOverride('node', 'n1', 'domain', 'system');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Human decision');
    });

    it('allows system to override another system decision', async () => {
        mockQueryOne.mockResolvedValue({
            decided_by_tier: 'system',
            contributor: 'auto',
            created_at: '2024-01-01',
        });
        const result = await canOverride('node', 'n1', 'domain', 'system');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('system overriding system');
    });

    it('allows when decisions table is unavailable (throws)', async () => {
        mockQueryOne.mockRejectedValue(new Error('no such table: decisions'));
        const result = await canOverride('node', 'n1', 'domain', 'api');
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain('not available');
    });
});

// =============================================================================
// logDecision
// =============================================================================

describe('logDecision', () => {
    it('inserts a decision row', async () => {
        await logDecision('node', 'n1', 'domain', 'old-domain', 'new-domain', 'human', 'gui:user', 'User changed domain');

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('INSERT INTO decisions');
        expect(args).toEqual(['node', 'n1', 'domain', 'old-domain', 'new-domain', 'human', 'gui:user', 'User changed domain']);
    });

    it('does not throw when DB call fails', async () => {
        mockQuery.mockRejectedValue(new Error('disk full'));
        await expect(logDecision('node', 'n1', 'f', null, 'v', 'human', 'u', 'r')).resolves.toBeUndefined();
    });
});

// =============================================================================
// ensurePartition
// =============================================================================

describe('ensurePartition', () => {
    it('returns null for empty domain', async () => {
        const result = await ensurePartition('');
        expect(result).toBeNull();
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('returns existing partition_id when domain already has one', async () => {
        mockQueryOne.mockResolvedValue({ partition_id: 'existing-partition' });
        const result = await ensurePartition('science');
        expect(result).toBe('existing-partition');
        // Only one query needed (the lookup)
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('skips system-managed domains (e.g. tuning)', async () => {
        mockQueryOne.mockResolvedValue(null); // not in any partition
        const result = await ensurePartition('tuning');
        expect(result).toBeNull();
        // No INSERT queries should have been made
        const inserts = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).toUpperCase().includes('INSERT')
        );
        expect(inserts).toHaveLength(0);
    });

    it('creates a new partition and assigns domain', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)        // domain not in any partition
            .mockResolvedValueOnce(null)         // autoBridge setting absent
            .mockResolvedValue(null);            // logDecision (swallowed)

        const result = await ensurePartition('ai-safety');
        expect(result).toBe('ai-safety');

        // Should have made INSERT queries
        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).toUpperCase().includes('INSERT')
        );
        expect(insertCalls.length).toBeGreaterThanOrEqual(2); // partition + domain
    });

    it('auto-bridges when project.autoBridge = true', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)                         // domain not in partition
            .mockResolvedValueOnce({ value: 'true' })            // autoBridge = true
            .mockResolvedValue(null);                            // other calls
        mockQuery.mockImplementation(async (sql: any) => {
            if (String(sql).includes('domain_partitions') && String(sql).includes('id != ')) {
                return [{ id: 'other-partition' }];              // one other partition
            }
            return [];
        });

        await ensurePartition('new-domain');

        const bridgeInserts = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('partition_bridges')
        );
        expect(bridgeInserts.length).toBeGreaterThanOrEqual(1);
    });
});

// =============================================================================
// getAccessibleDomains
// =============================================================================

describe('getAccessibleDomains', () => {
    it('returns empty array for empty domain', async () => {
        const result = await getAccessibleDomains('');
        expect(result).toEqual([]);
    });

    it('returns only that domain when not in any partition', async () => {
        mockQueryOne.mockResolvedValue(null); // not in partition
        mockQuery.mockResolvedValue([]); // no transient domains
        const result = await getAccessibleDomains('isolated-domain');
        expect(result).toEqual(['isolated-domain']);
    });

    it('returns all domains in the same partition', async () => {
        mockQueryOne.mockResolvedValue({ partition_id: 'p1' }); // in partition p1

        mockQuery
            .mockResolvedValueOnce([  // own partition domains
                { domain: 'science' },
                { domain: 'math' },
            ])
            .mockResolvedValueOnce([])  // no bridges
            .mockResolvedValueOnce([]); // transient domains

        const result = await getAccessibleDomains('science');
        expect(result).toContain('science');
        expect(result).toContain('math');
    });

    it('includes bridged partition domains', async () => {
        mockQueryOne.mockResolvedValue({ partition_id: 'p1' });

        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])           // own domains
            .mockResolvedValueOnce([{ partition_a: 'p1', partition_b: 'p2' }])  // bridge
            .mockResolvedValueOnce([{ domain: 'philosophy' }])         // bridged domains
            .mockResolvedValueOnce([]);                                // transient domains

        const result = await getAccessibleDomains('science');
        expect(result).toContain('science');
        expect(result).toContain('philosophy');
    });

    it('excludes quarantined transient domains', async () => {
        mockQueryOne.mockResolvedValue({ partition_id: 'p1' });

        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }, { domain: 'transient-domain' }])  // own
            .mockResolvedValueOnce([])                                // no bridges
            .mockResolvedValueOnce([{ domain: 'transient-domain', state: 'quarantine' }]);    // transient

        const result = await getAccessibleDomains('science');
        expect(result).toContain('science');
        expect(result).not.toContain('transient-domain');
    });
});

// =============================================================================
// getPartitionForDomain
// =============================================================================

describe('getPartitionForDomain', () => {
    it('returns null for empty domain', async () => {
        const result = await getPartitionForDomain('');
        expect(result).toBeNull();
    });

    it('returns partition_id when found', async () => {
        mockQueryOne.mockResolvedValue({ partition_id: 'p-science' });
        const result = await getPartitionForDomain('science');
        expect(result).toBe('p-science');
    });

    it('returns null when domain not in any partition', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await getPartitionForDomain('orphan');
        expect(result).toBeNull();
    });
});

// =============================================================================
// checkPartitionHealth
// =============================================================================

describe('checkPartitionHealth', () => {
    it('reports healthy when everything is bridged and non-empty', async () => {
        mockQuery
            .mockResolvedValueOnce([  // partitions
                { id: 'p1', name: 'Science', system: 0, transient: 0 },
                { id: 'p2', name: 'Philosophy', system: 0, transient: 0 },
            ])
            .mockResolvedValueOnce([{ partition_a: 'p1', partition_b: 'p2' }])  // bridges
            .mockResolvedValueOnce([  // partition_domains
                { partition_id: 'p1', domain: 'science' },
                { partition_id: 'p2', domain: 'philosophy' },
            ])
            .mockResolvedValueOnce([]);  // orphaned domains

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(true);
        expect(result.unbridgedPartitions).toHaveLength(0);
        expect(result.emptyPartitions).toHaveLength(0);
        expect(result.orphanedDomains).toHaveLength(0);
    });

    it('reports unbridged partitions (non-system, non-transient)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', name: 'Lonely', system: 0, transient: 0 },
            ])
            .mockResolvedValueOnce([])  // no bridges
            .mockResolvedValueOnce([{ partition_id: 'p1', domain: 'lonely-domain' }])
            .mockResolvedValueOnce([]);

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(false);
        expect(result.unbridgedPartitions).toHaveLength(1);
        expect(result.unbridgedPartitions[0].id).toBe('p1');
    });

    it('reports empty partitions', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', name: 'Empty', system: 0, transient: 0 },
            ])
            .mockResolvedValueOnce([])  // no bridges
            .mockResolvedValueOnce([])  // no partition_domains
            .mockResolvedValueOnce([]);

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(false);
        expect(result.emptyPartitions).toHaveLength(1);
    });

    it('skips system partitions from unbridged warnings', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'know-thyself', name: 'Know Thyself', system: 1, transient: 0 },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ partition_id: 'know-thyself', domain: 'tuning' }])
            .mockResolvedValueOnce([]);

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(true);
        expect(result.unbridgedPartitions).toHaveLength(0);
    });

    it('reports orphaned domains (active nodes without partition)', async () => {
        mockQuery
            .mockResolvedValueOnce([])  // no partitions
            .mockResolvedValueOnce([])  // no bridges
            .mockResolvedValueOnce([])  // no partition_domains
            .mockResolvedValueOnce([{ domain: 'floating' }]);  // orphaned

        const result = await checkPartitionHealth();
        expect(result.healthy).toBe(false);
        expect(result.orphanedDomains).toContain('floating');
    });
});

// =============================================================================
// isTransientDomain
// =============================================================================

describe('isTransientDomain', () => {
    it('returns true when domain is in the transient list', () => {
        expect(isTransientDomain('visitor', ['visitor', 'guest'])).toBe(true);
    });

    it('returns false when domain is not in the list', () => {
        expect(isTransientDomain('permanent', ['visitor'])).toBe(false);
    });

    it('returns false for null domain', () => {
        expect(isTransientDomain(null, ['visitor'])).toBe(false);
    });
});

// =============================================================================
// renameDomain
// =============================================================================

describe('renameDomain', () => {
    it('returns error when oldDomain or newDomain is empty', async () => {
        const r1 = await renameDomain('', 'new');
        expect(r1.success).toBe(false);
        expect(r1.error).toContain('required');

        const r2 = await renameDomain('old', '');
        expect(r2.success).toBe(false);
    });

    it('returns error when new domain name normalises to the same as old', async () => {
        const result = await renameDomain('science', 'science');
        expect(result.success).toBe(false);
        expect(result.error).toContain('same');
    });

    it('returns error when old domain not found', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '0' })  // no nodes in old domain
            .mockResolvedValueOnce(null);          // not in partition_domains

        const result = await renameDomain('nonexistent', 'new-name');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('returns error when new domain already exists', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '5' })  // old domain: node count (exists)
            .mockResolvedValueOnce(null)           // old domain: not in partition_domains (but nodes exist)
            .mockResolvedValueOnce({ cnt: '3' })  // new domain: node count (already exists)
            .mockResolvedValueOnce(null);          // new domain: partition check (not needed, cnt > 0 triggers)

        const result = await renameDomain('old-name', 'existing-domain');
        expect(result.success).toBe(false);
        expect(result.error).toContain('already exists');
    });

    it('renames domain across tables on success', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '5' })   // old nodes exist
            .mockResolvedValueOnce(null)            // not in partition yet
            .mockResolvedValueOnce({ cnt: '0' })   // new domain has no nodes
            .mockResolvedValueOnce(null)            // new not in partition
            .mockResolvedValueOnce({ partition_id: 'p-old' })  // existing partition row
            .mockResolvedValueOnce(null)            // no PK conflict
            .mockResolvedValue(null);               // remaining calls

        mockQuery.mockResolvedValue([]);

        const result = await renameDomain('old-name', 'new-name');
        expect(result.success).toBe(true);
        expect(result.tablesUpdated).toBeDefined();

        // Verify UPDATE nodes was called
        const nodeUpdates = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes SET domain')
        );
        expect(nodeUpdates.length).toBeGreaterThanOrEqual(1);
    });

    it('normalises new domain name to kebab-case', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '1' })  // old domain nodes
            .mockResolvedValueOnce(null)           // not in partition
            .mockResolvedValueOnce({ cnt: '0' })  // new domain no nodes
            .mockResolvedValueOnce(null)           // new not in partition
            .mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await renameDomain('old-domain', 'New Name With Spaces');
        expect(result.success).toBe(true);
        // The slug 'new-name-with-spaces' should be used
        const nodeUpdates = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes SET domain')
        );
        expect((nodeUpdates[0][1] as any[])[0]).toBe('new-name-with-spaces');
    });
});

// =============================================================================
// getExcludedDomainsForCycle
// =============================================================================

describe('getExcludedDomainsForCycle', () => {
    it('returns empty set when no partitions have allowed_cycles', async () => {
        mockQuery.mockResolvedValue([]);
        const excluded = await getExcludedDomainsForCycle('research');
        expect(excluded.size).toBe(0);
    });

    it('excludes domains from cycles not in allowed_cycles', async () => {
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["synthesis","voicing"]', domain: 'kb-curated' },
        ]);
        const researchExcluded = await getExcludedDomainsForCycle('research');
        expect(researchExcluded.has('kb-curated')).toBe(true);

        // Cache is populated — synthesis should NOT be excluded
        clearCycleExclusionCache();
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["synthesis","voicing"]', domain: 'kb-curated' },
        ]);
        const synthExcluded = await getExcludedDomainsForCycle('synthesis');
        expect(synthExcluded.has('kb-curated')).toBe(false);
    });

    it('does not exclude domains when allowed_cycles is null (all cycles)', async () => {
        // NULL allowed_cycles rows are filtered out by the SQL WHERE clause
        mockQuery.mockResolvedValue([]);
        const excluded = await getExcludedDomainsForCycle('tensions');
        expect(excluded.size).toBe(0);
    });

    it('handles multiple domains in same partition', async () => {
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["synthesis"]', domain: 'code-a' },
            { allowed_cycles: '["synthesis"]', domain: 'code-b' },
        ]);
        const excluded = await getExcludedDomainsForCycle('research');
        expect(excluded.has('code-a')).toBe(true);
        expect(excluded.has('code-b')).toBe(true);

        clearCycleExclusionCache();
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["synthesis"]', domain: 'code-a' },
            { allowed_cycles: '["synthesis"]', domain: 'code-b' },
        ]);
        const synthExcluded = await getExcludedDomainsForCycle('synthesis');
        expect(synthExcluded.has('code-a')).toBe(false);
        expect(synthExcluded.has('code-b')).toBe(false);
    });

    it('handles invalid JSON in allowed_cycles gracefully', async () => {
        mockQuery.mockResolvedValue([
            { allowed_cycles: 'not valid json', domain: 'broken' },
        ]);
        const excluded = await getExcludedDomainsForCycle('synthesis');
        // Invalid JSON is skipped — domain is NOT excluded
        expect(excluded.has('broken')).toBe(false);
    });

    it('caches results across calls', async () => {
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["synthesis"]', domain: 'cached-domain' },
        ]);

        await getExcludedDomainsForCycle('research');
        await getExcludedDomainsForCycle('tensions');

        // Only one query should have been made (cached)
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('clearCycleExclusionCache forces re-query', async () => {
        mockQuery.mockResolvedValue([]);
        await getExcludedDomainsForCycle('research');
        expect(mockQuery).toHaveBeenCalledTimes(1);

        clearCycleExclusionCache();
        mockQuery.mockResolvedValue([
            { allowed_cycles: '["voicing"]', domain: 'new-domain' },
        ]);
        const excluded = await getExcludedDomainsForCycle('research');
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(excluded.has('new-domain')).toBe(true);
    });
});
