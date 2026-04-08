/**
 * Unit tests for routes/partitions/transient.ts —
 * importTransient, approveTransient, departTransient, getVisitHistory.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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

const mockTransientConfig = {
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

const { importTransient, approveTransient, departTransient, getVisitHistory } = await import('../../routes/partitions/transient.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockExportPartition.mockResolvedValue(null);
    mockDetectInjection.mockReturnValue({ isInjection: false, reasons: [] });
    // Reset transient config
    Object.assign(mockTransientConfig, {
        enabled: true,
        maxTransientPartitions: 3,
        maxNodesPerImport: 500,
        maxTransientNodeRatio: 0.3,
    });
});

// =============================================================================
// importTransient — validation
// =============================================================================

describe('importTransient — validation', () => {
    it('throws VALIDATION when transient partitions are disabled', async () => {
        mockTransientConfig.enabled = false;

        await expect(importTransient({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: [] } }))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION when podbitExport is missing', async () => {
        await expect(importTransient({ owner: 'bob', partition: { id: 'p', domains: [] } }))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION when owner is missing', async () => {
        await expect(importTransient({ podbitExport: '1.0', partition: { id: 'p', domains: [] } }))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws VALIDATION when partition.id is missing', async () => {
        await expect(importTransient({ podbitExport: '1.0', owner: 'bob', partition: { domains: ['science'] } }))
            .rejects.toThrow('VALIDATION:');
    });

    it('throws LIMIT when maxTransientPartitions exceeded', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }, { id: 't3' }]); // 3 existing = at limit

        await expect(importTransient({ podbitExport: '1.0', owner: 'bob', partition: { id: 'new', domains: ['science'] } }))
            .rejects.toThrow('LIMIT:');
    });

    it('throws LIMIT when nodes exceed maxNodesPerImport', async () => {
        mockTransientConfig.maxNodesPerImport = 2;
        mockQuery.mockResolvedValueOnce([]); // existing transient count OK
        mockQueryOne.mockResolvedValueOnce({ cnt: 100 }); // host count

        const tooManyNodes = Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, content: 'c', node_type: 'seed', domain: 's' }));

        await expect(importTransient({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: ['science'] }, nodes: tooManyNodes }))
            .rejects.toThrow('LIMIT:');
    });

    it('throws VALIDATION when partition already exists', async () => {
        mockQuery.mockResolvedValueOnce([]); // existing transient OK
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 100 })  // host count
            .mockResolvedValueOnce({ id: 'transient/bob/p' }); // collision!

        await expect(importTransient({ podbitExport: '1.0', owner: 'bob', partition: { id: 'p', domains: ['science'] } }))
            .rejects.toThrow('VALIDATION:');
    });
});

// =============================================================================
// importTransient — successful import
// =============================================================================

describe('importTransient — successful import', () => {
    function makeImportData(overrides: Record<string, any> = {}) {
        return {
            podbitExport: '1.0',
            owner: 'alice',
            partition: { id: 'my-part', name: 'My Partition', domains: ['science'] },
            nodes: [],
            edges: [],
            ...overrides,
        };
    }

    beforeEach(() => {
        // Default: no existing transient partitions, no collision
        mockQuery.mockResolvedValue([]);
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 100 }) // host count
            .mockResolvedValueOnce(null)          // no collision
            .mockResolvedValueOnce(null);         // project setting
    });

    it('creates partition with transient/owner/id naming', async () => {
        await importTransient(makeImportData());

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') &&
            Array.isArray(params) && params.includes('transient/alice/my-part')
        );
        expect(insertCall).toBeDefined();
    });

    it('returns success with correct partitionId', async () => {
        const result = await importTransient(makeImportData());

        expect(result.success).toBe(true);
        expect(result.partitionId).toBe('transient/alice/my-part');
        expect(result.state).toBe('quarantine');
    });

    it('counts imported nodes correctly', async () => {
        const result = await importTransient(makeImportData({
            nodes: [
                { id: 'n1', content: 'c', node_type: 'seed', domain: 'science' },
                { id: 'n2', content: 'c', node_type: 'seed', domain: 'science' },
            ],
        }));

        expect(result.imported.nodes).toBe(2);
        expect(result.skipped.nodes).toBe(0);
    });

    it('counts skipped nodes on UNIQUE constraint failure', async () => {
        // Reset to re-setup the beforeEach calls
        jest.resetAllMocks();
        mockQuery
            .mockResolvedValueOnce([]) // existing transient
            .mockResolvedValueOnce([]) // INSERT partition
            .mockResolvedValueOnce([]) // INSERT domain
            .mockRejectedValueOnce(new Error('UNIQUE constraint failed')) // node INSERT fails
            .mockResolvedValue([]);
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 100 })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);

        const result = await importTransient(makeImportData({
            nodes: [{ id: 'n1', content: 'c', node_type: 'seed', domain: 'science' }],
        }));

        expect(result.skipped.nodes).toBe(1);
        expect(result.imported.nodes).toBe(0);
    });

    it('inserts domain into partition_domains', async () => {
        await importTransient(makeImportData());

        const domainInsert = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_domains') &&
            Array.isArray(params) && params.includes('science')
        );
        expect(domainInsert).toBeDefined();
    });

    it('calls clearTransientCache', async () => {
        await importTransient(makeImportData());
        expect(mockClearTransientCache).toHaveBeenCalled();
    });
});

// =============================================================================
// approveTransient
// =============================================================================

describe('approveTransient', () => {
    it('returns error when partition not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await approveTransient('transient/alice/p');

        expect(result.error).toContain('not found');
    });

    it('returns error when not a transient partition', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p', state: 'active', transient: 0 });

        const result = await approveTransient('p');

        expect(result.error).toContain('Not a transient partition');
    });

    it('returns error when state is not quarantine', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p', state: 'active', transient: 1 });

        const result = await approveTransient('transient/alice/p');

        expect(result.error).toContain('quarantine');
    });

    it('approves partition when scan passes', async () => {
        mockQueryOne.mockResolvedValue({ id: 'transient/alice/p', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])      // domains
            .mockResolvedValueOnce([{ id: 'n1', content: 'Clean content about science' }]) // nodes
            .mockResolvedValueOnce([])  // UPDATE state
            .mockResolvedValueOnce([])  // non-system partitions
            .mockResolvedValue([]);
        mockDetectInjection.mockReturnValue({ isInjection: false, reasons: [] });

        const result = await approveTransient('transient/alice/p');

        expect(result.success).toBe(true);
        expect(result.state).toBe('active');
    });

    it('rejects and cleans up when scan fail rate exceeds threshold', async () => {
        mockQueryOne.mockResolvedValue({ id: 'transient/alice/p', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }]) // domains
            .mockResolvedValueOnce([
                { id: 'n1', content: 'Injection attempt 1' },
                { id: 'n2', content: 'Injection attempt 2' },
                { id: 'n3', content: 'Injection attempt 3' },
            ]) // nodes — all flagged
            .mockResolvedValue([]);

        // All nodes flagged as injections
        mockDetectInjection.mockReturnValue({ isInjection: true, reasons: ['Detected pattern'] });
        mockTransientConfig.quarantine = { scanFailThreshold: 0.2 }; // 20% threshold

        const result = await approveTransient('transient/alice/p') as any;

        expect(result.error).toContain('scan failed');
        expect(result.rejected).toBe(true);
    });

    it('creates bridges to bridgeTo partitions when specified', async () => {
        mockQueryOne.mockResolvedValue({ id: 'transient/alice/p', state: 'quarantine', transient: 1 });
        mockQuery
            .mockResolvedValueOnce([])  // no domains
            .mockResolvedValueOnce([])  // UPDATE state
            .mockResolvedValue([]);

        await approveTransient('transient/alice/p', ['host-partition-1']);

        const bridgeInsert = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO partition_bridges')
        );
        expect(bridgeInsert).toBeDefined();
    });

    it('calls clearTransientCache and logDecision on approval', async () => {
        mockQueryOne.mockResolvedValue({ id: 'transient/alice/p', state: 'quarantine', transient: 1 });
        mockQuery.mockResolvedValue([]);

        await approveTransient('transient/alice/p', []);

        expect(mockClearTransientCache).toHaveBeenCalled();
        expect(mockLogDecision).toHaveBeenCalled();
    });
});

// =============================================================================
// departTransient
// =============================================================================

describe('departTransient', () => {
    it('returns error when partition not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await departTransient('transient/alice/p');

        expect(result.error).toContain('not found');
    });

    it('returns error when not a transient partition', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p', state: 'active', transient: 0, source_owner: 'alice' });

        const result = await departTransient('p');

        expect(result.error).toContain('Not a transient partition');
    });

    it('returns error when already departed', async () => {
        mockQueryOne.mockResolvedValue({ id: 'p', state: 'departed', transient: 1, source_owner: 'alice' });

        const result = await departTransient('p');

        expect(result.error).toContain('already departed');
    });

    it('sets state to departed on success', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'transient/alice/p', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 5 }) // cycles query
            .mockResolvedValueOnce({ cnt: 3, avg_weight: 1.2 }); // children stats
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue({ nodes: [], edges: [] });

        const result = await departTransient('transient/alice/p', 'Test departure');

        expect(result.success).toBe(true);
        expect(result.state).toBe('departed');
    });

    it('includes export data in departure result', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'transient/alice/p', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 3 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);
        mockExportPartition.mockResolvedValue({ nodes: [{ id: 'n1' }], edges: [] });

        const result = await departTransient('transient/alice/p');

        expect(result.exportData).toBeDefined();
        expect(result.exportData.podbitExport).toBe('2.0');
        expect(result.exportData.transient).toBe(true);
    });

    it('calls clearTransientCache on departure', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'transient/alice/p', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 0 })
            .mockResolvedValueOnce(null);
        mockQuery.mockResolvedValue([]);

        await departTransient('transient/alice/p');

        expect(mockClearTransientCache).toHaveBeenCalled();
    });

    it('includes visit stats with cycles count', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'transient/alice/p', state: 'active', transient: 1, source_owner: 'alice' })
            .mockResolvedValueOnce({ cycles_completed: 7 })
            .mockResolvedValueOnce(null); // childrenStats (null when no domains)
        mockQuery.mockResolvedValue([]);

        const result = await departTransient('transient/alice/p');

        // cyclesRun comes from cycles_completed query
        expect(result.visit.cyclesRun).toBe(7);
        // childrenCreated is 0 when no domain nodes exist
        expect(result.visit.childrenCreated).toBe(0);
    });
});

// =============================================================================
// getVisitHistory
// =============================================================================

describe('getVisitHistory', () => {
    it('returns visit history for a partition', async () => {
        mockQuery.mockResolvedValue([
            { id: 'v1', partition_id: 'transient/alice/p', arrived_at: '2024-01-01' },
            { id: 'v2', partition_id: 'transient/alice/p', arrived_at: '2023-12-01' },
        ]);

        const result = await getVisitHistory('transient/alice/p');

        expect(result.partitionId).toBe('transient/alice/p');
        expect(result.visits).toHaveLength(2);
    });

    it('returns empty visits array when no history', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await getVisitHistory('transient/alice/p');

        expect(result.visits).toEqual([]);
    });

    it('queries by partition_id', async () => {
        await getVisitHistory('transient/alice/my-part');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('transient/alice/my-part');
    });
});
