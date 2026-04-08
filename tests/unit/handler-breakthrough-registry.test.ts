/**
 * Unit tests for handlers/breakthrough-registry.ts —
 * registerBreakthrough, queryRegistry, registryStats,
 * updateBreakthroughScores, getDocumentation, rebuildDocumentation.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

// Mock fs so getCurrentProject reads a predictable value
jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: () => true,
        readFileSync: () => JSON.stringify({ currentProject: 'test-project' }),
    },
    existsSync: () => true,
    readFileSync: () => JSON.stringify({ currentProject: 'test-project' }),
}));

// dynamic imports used inside collectBreakthroughDocumentation
jest.unstable_mockModule('../../evm/feedback.js', () => ({
    getNodeVerifications: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getSubsystemAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    getConsultantAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
}));

const {
    registerBreakthrough, queryRegistry, registryStats,
    updateBreakthroughScores, getDocumentation, rebuildDocumentation,
} = await import('../../handlers/breakthrough-registry.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
});

// =============================================================================
// registerBreakthrough
// =============================================================================

describe('registerBreakthrough', () => {
    const baseEntry = {
        nodeId: 'n1',
        content: 'A breakthrough insight',
        domain: 'science',
        trajectory: 'knowledge',
        promotionSource: 'manual' as const,
        promotedBy: 'user',
        scores: { synthesis: 8, novelty: 9, testability: 7, tension_resolution: 6, composite: 7.7 },
    };

    it('inserts new entry when not found in registry', async () => {
        // getPartitionForDomain (queryOne on partition)
        mockQueryOne.mockResolvedValue(null);
        // systemQueryOne for existing check
        mockSystemQueryOne.mockResolvedValueOnce(null);
        // systemQueryOne for INSERT RETURNING id
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-1' });
        // Documentation collection queries return empty
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const result = await registerBreakthrough(baseEntry);

        expect(result.id).toBe('reg-1');
        expect(result.deduplicated).toBe(false);
    });

    it('updates existing entry when found in registry (dedup)', async () => {
        // getPartitionForDomain
        mockQueryOne.mockResolvedValue(null);
        // systemQueryOne existing check
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'existing-id' });
        // systemQuery for UPDATE (non-returning)
        mockSystemQuery.mockResolvedValue([]);
        // documentation collection
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        const result = await registerBreakthrough(baseEntry);

        expect(result.id).toBe('existing-id');
        expect(result.deduplicated).toBe(true);
    });

    it('uses partition info when available', async () => {
        // getPartitionForDomain returns a partition
        mockQueryOne.mockResolvedValueOnce({ id: 'part-1', name: 'Science Partition' });
        // existing check
        mockSystemQueryOne.mockResolvedValueOnce(null);
        // INSERT returns id
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-2' });
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const result = await registerBreakthrough(baseEntry);

        expect(result.id).toBe('reg-2');
        // The INSERT should have been called with partition info
        const insertCall = mockSystemQueryOne.mock.calls[1] as any[];
        expect(insertCall[1]).toContain('part-1'); // partition_id in params
    });

    it('handles null domain gracefully', async () => {
        const entryNoDomain = { ...baseEntry, domain: undefined };

        mockQueryOne.mockResolvedValue(null);
        mockSystemQueryOne
            .mockResolvedValueOnce(null)  // existing check
            .mockResolvedValueOnce({ id: 'reg-3' }); // INSERT
        mockQuery.mockResolvedValue([]);
        mockSystemQuery.mockResolvedValue([]);

        const result = await registerBreakthrough(entryNoDomain);

        expect(result.id).toBe('reg-3');
    });
});

// =============================================================================
// queryRegistry
// =============================================================================

describe('queryRegistry', () => {
    it('returns empty list when no results', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        const result = await queryRegistry({});

        expect(result.breakthroughs).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('uses default limit=50 and offset=0', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({});

        const [_sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(params).toContain(50);  // limit
        expect(params).toContain(0);   // offset
    });

    it('applies project filter', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ project: 'my-project' });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('project_name');
        expect(params).toContain('my-project');
    });

    it('applies domain filter', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ domain: 'science' });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('domain');
        expect(params).toContain('science');
    });

    it('applies promotionSource filter', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ promotionSource: 'autonomous' });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('promotion_source');
        expect(params).toContain('autonomous');
    });

    it('parses parent_contents JSON in rows', async () => {
        mockSystemQuery.mockResolvedValue([
            { id: 'r1', content: 'insight', parent_contents: JSON.stringify(['parent A', 'parent B']) },
        ]);
        mockSystemQueryOne.mockResolvedValue({ total: 1 });

        const result = await queryRegistry({});

        expect(result.breakthroughs[0].parent_contents).toEqual(['parent A', 'parent B']);
    });

    it('defaults orderBy to promoted_at DESC', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({});

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('promoted_at DESC');
    });

    it('rejects non-whitelisted orderBy columns (uses promoted_at as default)', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ orderBy: 'injection_attempt; DROP TABLE' });

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('promoted_at');
        expect(String(sql)).not.toContain('injection');
    });
});

// =============================================================================
// registryStats
// =============================================================================

describe('registryStats', () => {
    it('returns zero stats when registry is empty', async () => {
        mockSystemQueryOne.mockResolvedValue({ total: 0, recent: 0, avg_composite: null });
        mockSystemQuery.mockResolvedValue([]);

        const result = await registryStats({});

        expect(result.total).toBe(0);
        expect(result.recent).toBe(0);
        expect(result.avgComposite).toBeNull();
    });

    it('rounds avgComposite to 1 decimal', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 5 })
            .mockResolvedValueOnce({ recent: 2 })
            .mockResolvedValueOnce({ avg_composite: 7.456 });
        mockSystemQuery.mockResolvedValue([]);

        const result = await registryStats({});

        expect(result.avgComposite).toBe(7.5);
    });

    it('maps byDomain results', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 3 })
            .mockResolvedValueOnce({ recent: 1 })
            .mockResolvedValueOnce({ avg_composite: 8.0 });
        mockSystemQuery
            .mockResolvedValueOnce([{ project_name: 'proj1', count: 3, avg_composite: 8.0 }]) // byProject
            .mockResolvedValueOnce([{ domain: 'science', count: 2, avg_composite: 7.5 }]) // byDomain
            .mockResolvedValueOnce([{ promotion_source: 'autonomous', count: 2 }]) // bySource
            .mockResolvedValueOnce([]); // timeline

        const result = await registryStats({});

        expect(result.byDomain[0].domain).toBe('science');
        expect(result.bySource.autonomous).toBe(2);
    });

    it('applies project filter to stats queries', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 0 })
            .mockResolvedValueOnce({ recent: 0 })
            .mockResolvedValueOnce({ avg_composite: null });
        mockSystemQuery.mockResolvedValue([]);

        await registryStats({ project: 'specific-project' });

        const [_sql, params] = mockSystemQueryOne.mock.calls[0] as any[];
        expect(params).toContain('specific-project');
    });
});

// =============================================================================
// updateBreakthroughScores
// =============================================================================

describe('updateBreakthroughScores', () => {
    it('returns error when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await updateBreakthroughScores('nonexistent', {
            synthesis: 8, novelty: 9, testability: 7, tension_resolution: 6,
        });

        expect(result.error).toContain('not found');
    });

    it('calculates composite score correctly', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'n1' });
        mockQuery.mockResolvedValue([]);

        const result = await updateBreakthroughScores('reg-1', {
            synthesis: 8,
            novelty: 9,
            testability: 7,
            tension_resolution: 6,
        });

        // composite = 8*0.3 + 9*0.35 + 7*0.2 + 6*0.15 = 2.4 + 3.15 + 1.4 + 0.9 = 7.85 → rounded to 7.9
        expect(result.success).toBe(true);
        expect(result.composite).toBeCloseTo(7.9, 1);
    });

    it('updates nodes table with same scores', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'n42' });
        mockQuery.mockResolvedValue([]);

        await updateBreakthroughScores('reg-1', {
            synthesis: 5, novelty: 6, testability: 4, tension_resolution: 3,
        });

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            expect.arrayContaining(['n42'])
        );
    });
});

// =============================================================================
// getDocumentation
// =============================================================================

describe('getDocumentation', () => {
    it('returns null when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await getDocumentation('nonexistent');

        expect(result).toBeNull();
    });

    it('returns null when documentation field is empty', async () => {
        mockSystemQueryOne.mockResolvedValue({ documentation: null });

        const result = await getDocumentation('reg-1');

        expect(result).toBeNull();
    });

    it('parses and returns JSON documentation', async () => {
        const doc = { version: 1, node: { id: 'n1', content: 'insight' } };
        mockSystemQueryOne.mockResolvedValue({ documentation: JSON.stringify(doc) });

        const result = await getDocumentation('reg-1');

        expect(result).toEqual(doc);
    });

    it('returns null when documentation JSON is invalid', async () => {
        mockSystemQueryOne.mockResolvedValue({ documentation: 'INVALID_JSON{' });

        const result = await getDocumentation('reg-1');

        expect(result).toBeNull();
    });
});

// =============================================================================
// rebuildDocumentation
// =============================================================================

describe('rebuildDocumentation', () => {
    it('returns error when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await rebuildDocumentation('nonexistent');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('collects documentation and stores it', async () => {
        // SELECT breakthrough
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'reg-1', node_id: 'n1',
            promoted_by: 'user', promotion_source: 'manual',
            validation_reason: 'high scores',
            validation_synthesis: 8, validation_novelty: 9,
            validation_testability: 7, validation_tension_resolution: 6,
            validation_composite: 7.9,
        });
        // collectBreakthroughDocumentation queries (queryOne for node)
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'insight', node_type: 'breakthrough', domain: 'science', weight: 1 });
        mockQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue(null); // for partition lookup
        // UPDATE breakthrough_registry
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('reg-1');

        expect(result.success).toBe(true);
    });
});
