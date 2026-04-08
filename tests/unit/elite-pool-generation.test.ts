/**
 * Unit tests for core/elite-pool-generation.ts — computeGeneration, backfillGenerations.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

const mockAppConfig = {
    elitePool: { maxGeneration: 5 },
};

jest.unstable_mockModule('../../db.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));

const { computeGeneration, backfillGenerations } = await import('../../core/elite-pool-generation.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockAppConfig.elitePool.maxGeneration = 5;
});

// =============================================================================
// computeGeneration
// =============================================================================

describe('computeGeneration', () => {
    it('returns generation=0 when no parents', async () => {
        const result = await computeGeneration([]);
        expect(result.generation).toBe(0);
        expect(result.maxGeneration).toBe(5);
        expect(result.atCeiling).toBe(false);
        expect(result.parentGenerations).toEqual([]);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns generation = max parent generation + 1', async () => {
        mockQuery.mockResolvedValue([{ generation: 2 }, { generation: 4 }]);
        const result = await computeGeneration(['parent-a', 'parent-b']);
        expect(result.generation).toBe(5); // max(2,4)+1
        expect(result.parentGenerations).toEqual([2, 4]);
    });

    it('uses 0 when parent generation is null', async () => {
        mockQuery.mockResolvedValue([{ generation: null }, { generation: 3 }]);
        const result = await computeGeneration(['parent-a', 'parent-b']);
        expect(result.generation).toBe(4); // max(0,3)+1
    });

    it('sets atCeiling=false when generation <= maxGeneration', async () => {
        mockQuery.mockResolvedValue([{ generation: 3 }]);
        const result = await computeGeneration(['parent-a']);
        expect(result.generation).toBe(4);
        expect(result.atCeiling).toBe(false); // 4 <= 5
    });

    it('sets atCeiling=true when generation exceeds maxGeneration', async () => {
        mockAppConfig.elitePool.maxGeneration = 3;
        mockQuery.mockResolvedValue([{ generation: 3 }]);
        const result = await computeGeneration(['parent-a']);
        expect(result.generation).toBe(4);
        expect(result.atCeiling).toBe(true); // 4 > 3
    });

    it('passes parent ids to query', async () => {
        mockQuery.mockResolvedValue([{ generation: 1 }]);
        await computeGeneration(['id-aaa', 'id-bbb']);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('id-aaa');
        expect(params).toContain('id-bbb');
        expect(String(sql)).toContain('nodes WHERE id IN');
    });

    it('uses maxGeneration from config', async () => {
        mockAppConfig.elitePool.maxGeneration = 10;
        const result = await computeGeneration([]);
        expect(result.maxGeneration).toBe(10);
    });

    it('handles single parent', async () => {
        mockQuery.mockResolvedValue([{ generation: 0 }]);
        const result = await computeGeneration(['parent-x']);
        expect(result.generation).toBe(1);
        expect(result.parentGenerations).toEqual([0]);
    });
});

// =============================================================================
// backfillGenerations
// =============================================================================

describe('backfillGenerations', () => {
    it('returns 0 when no nodes exist', async () => {
        mockQuery.mockResolvedValueOnce([]); // allNodes query
        const count = await backfillGenerations();
        expect(count).toBe(0);
    });

    it('sets root nodes to generation=0', async () => {
        // 1 root node, no parents
        mockQuery
            .mockResolvedValueOnce([{ id: 'root-1', parent_ids: null }]) // allNodes
            .mockResolvedValueOnce([]); // UPDATE root-1

        const count = await backfillGenerations();

        // Should have called UPDATE root to generation=0
        const updateRoot = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('generation = 0')
        );
        expect(updateRoot).toBeDefined();
        expect(updateRoot[1]).toContain('root-1');
        expect(count).toBe(0); // roots don't count as "updated" (they're seeds)
    });

    it('assigns generation=1 to direct children of roots', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'root-1', parent_ids: null },
                { id: 'child-1', parent_ids: 'root-1' },
            ])
            .mockResolvedValue([]); // all subsequent UPDATE calls

        const count = await backfillGenerations();

        // Should have updated child-1 to generation=1
        const updateChild = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('generation = $1') &&
            Array.isArray(params) && params.includes('child-1') && params.includes(1)
        );
        expect(updateChild).toBeDefined();
        expect(count).toBe(1);
    });

    it('computes max(parent generations) + 1 for multi-parent nodes', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'root-a', parent_ids: null },
                { id: 'root-b', parent_ids: null },
                { id: 'child', parent_ids: 'root-a,root-b' }, // both parents are gen=0, so child=1
            ])
            .mockResolvedValue([]);

        const count = await backfillGenerations();

        const updateChild = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('generation = $1') &&
            Array.isArray(params) && params.includes('child') && params.includes(1)
        );
        expect(updateChild).toBeDefined();
        expect(count).toBe(1);
    });

    it('handles multi-level chains', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'root', parent_ids: null },
                { id: 'gen1', parent_ids: 'root' },
                { id: 'gen2', parent_ids: 'gen1' },
            ])
            .mockResolvedValue([]);

        const count = await backfillGenerations();
        expect(count).toBe(2); // gen1 (gen=1) + gen2 (gen=2)

        const gen2Update = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('generation = $1') &&
            Array.isArray(params) && params.includes('gen2') && params.includes(2)
        );
        expect(gen2Update).toBeDefined();
    });

    it('skips nodes whose parents are not yet computed', async () => {
        // Cyclic or unresolvable: child has parent not in the node list
        mockQuery
            .mockResolvedValueOnce([
                { id: 'child', parent_ids: 'missing-parent' },
            ])
            .mockResolvedValue([]);

        const count = await backfillGenerations();
        expect(count).toBe(0); // child can't be assigned since parent unknown
    });
});
