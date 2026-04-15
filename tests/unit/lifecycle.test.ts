/**
 * Unit tests for core/lifecycle.ts — recordBirth, incrementBarren, lifecycleSweep.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockEmitActivity = jest.fn<() => void>();
const mockGetPartitionForDomain = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);

const mockConfig = {
    lifecycle: {
        enabled: true,
        barrenThreshold: 5,
        compostAfter: 10,
        composting: { preserveBreakthroughs: true },
        nascent: { maxCycles: 20 },
    },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getPartitionForDomain: mockGetPartitionForDomain,
}));

const { recordBirth, incrementBarren, lifecycleSweep } =
    await import('../../core/lifecycle.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGetPartitionForDomain.mockResolvedValue(null);
    mockConfig.lifecycle.enabled = true;
});

// =============================================================================
// recordBirth
// =============================================================================

describe('recordBirth', () => {
    it('does nothing when lifecycle is disabled', async () => {
        mockConfig.lifecycle.enabled = false;
        await recordBirth('child-1', ['parent-1']);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('does nothing when no parent IDs provided', async () => {
        await recordBirth('child-1', []);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('sets child generation = max(parent generations) + 1', async () => {
        mockQuery
            .mockResolvedValueOnce([  // SELECT parents
                { id: 'p1', lifecycle_state: 'active', total_children: 3, generation: 2 },
                { id: 'p2', lifecycle_state: 'active', total_children: 1, generation: 4 },
            ])
            .mockResolvedValue([]);  // remaining UPDATEs

        await recordBirth('child-1', ['p1', 'p2']);

        const generationUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('generation = $1') && String(sql).includes('born_at')
        );
        expect(generationUpdate).toBeDefined();
        expect(generationUpdate[1][0]).toBe(5); // max(2,4) + 1 = 5
        expect(generationUpdate[1][2]).toBe('child-1');
    });

    it('transitions nascent parent to active on first child', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'nascent', total_children: 0, generation: 1 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        const activationUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes("lifecycle_state = 'active'") && String(sql).includes('activated_at')
        );
        expect(activationUpdate).toBeDefined();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'activated', expect.any(String), expect.objectContaining({ nodeId: 'p1' })
        );
    });

    it('revives declining parent when new child is born', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'declining', total_children: 2, generation: 1 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        const revivalUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes("lifecycle_state = 'active'") && String(sql).includes('declining_since = NULL')
        );
        expect(revivalUpdate).toBeDefined();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'revived', expect.any(String), expect.objectContaining({ nodeId: 'p1' })
        );
    });

    it('increments total_children and resets barren_cycles for each parent', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'active', total_children: 5, generation: 2 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        const childCountUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('total_children = $1') && String(sql).includes('barren_cycles = 0')
        );
        expect(childCountUpdate).toBeDefined();
        expect(childCountUpdate[1][0]).toBe(6); // 5 + 1
    });
});

// =============================================================================
// incrementBarren
// =============================================================================

describe('incrementBarren', () => {
    it('does nothing when lifecycle is disabled', async () => {
        mockConfig.lifecycle.enabled = false;
        await incrementBarren(['n1', 'n2']);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('does nothing when nodeIds is empty', async () => {
        await incrementBarren([]);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('increments barren_cycles for sampled nodes', async () => {
        await incrementBarren(['n1', 'n2', 'n3']);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('barren_cycles = barren_cycles + 1');
        expect(params).toContain('n1');
        expect(params).toContain('n2');
        expect(params).toContain('n3');
    });

    it('only updates active and nascent nodes (not composted)', async () => {
        await incrementBarren(['n1']);
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain("lifecycle_state IN ('active', 'nascent')");
    });
});

// =============================================================================
// lifecycleSweep
// =============================================================================

describe('lifecycleSweep', () => {
    it('returns zero counts when lifecycle is disabled', async () => {
        mockConfig.lifecycle.enabled = false;
        const result = await lifecycleSweep();
        expect(result.activated).toBe(0);
        expect(result.declined).toBe(0);
        expect(result.composted).toBe(0);
    });

    it('transitions active → declining for barren nodes', async () => {
        // decliningCandidates = 2 nodes
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }])  // declining candidates
            .mockResolvedValueOnce([])                              // UPDATE declining
            .mockResolvedValueOnce([])                              // compost candidates (active)
            .mockResolvedValueOnce([])                              // compost candidates (nascent/stillborn)
            .mockResolvedValue([]);

        const result = await lifecycleSweep();
        expect(result.declined).toBe(2);
    });

    it('returns zero when no nodes need transitions', async () => {
        // All queries return empty
        mockQuery.mockResolvedValue([]);

        const result = await lifecycleSweep();
        expect(result.declined).toBe(0);
        expect(result.composted).toBe(0);
        expect(result.stillborn).toBe(0);
    });

    it('counts composted nodes', async () => {
        mockQuery
            .mockResolvedValueOnce([])   // declining candidates (none)
            .mockResolvedValueOnce([{ id: 'n3', content: 'old node', domain: 'science', lifecycle_state: 'declining' }])  // compost candidates
            .mockResolvedValueOnce([])   // stillborn
            .mockResolvedValue([]);

        const result = await lifecycleSweep();
        expect(result.composted).toBeGreaterThanOrEqual(1);
    });
});
