/**
 * Additional unit tests for core/lifecycle.ts — targets previously uncovered branches.
 *
 * Covers: compostNode internals (partition lookup, children/parents, born_at fallback),
 * getMetabolism, preserveBreakthroughs=false, declined activity emit, stillborn path,
 * recordBirth null-generation parents, lifecycle sweep full composting flow.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockEmitActivity = jest.fn<() => void>();
const mockGetPartitionForDomain = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);

const mockConfig: Record<string, any> = {
    lifecycle: {
        enabled: true,
        barrenThreshold: 5,
        compostAfter: 10,
        composting: {
            preserveBreakthroughs: true,
            summaryMaxLength: 200,
        },
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

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getPartitionForDomain: mockGetPartitionForDomain,
}));

const { recordBirth, incrementBarren, lifecycleSweep, getMetabolism } =
    await import('../../core/lifecycle.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGetPartitionForDomain.mockResolvedValue(null);
    mockConfig.lifecycle.enabled = true;
    mockConfig.lifecycle.composting.preserveBreakthroughs = true;
    mockConfig.lifecycle.composting.summaryMaxLength = 200;
});

// =============================================================================
// recordBirth — edge cases
// =============================================================================

describe('recordBirth', () => {
    it('handles parents with null generation (defaults to 0)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'active', total_children: 1, generation: null },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        // generation should be max(0, 0) + 1 = 1
        const genUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('generation = $1') && String(sql).includes('born_at')
        );
        expect(genUpdate).toBeDefined();
        expect(genUpdate[1][0]).toBe(1);
    });

    it('handles parents with null total_children', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'active', total_children: null, generation: 0 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        const childCountUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('total_children = $1') && String(sql).includes('barren_cycles = 0')
        );
        expect(childCountUpdate).toBeDefined();
        expect(childCountUpdate[1][0]).toBe(1); // (null || 0) + 1 = 1
    });

    it('defaults lifecycle_state to active when null (no transition)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: null, total_children: 5, generation: 2 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        // oldState defaults to 'active', newTotal=6, so no state transition should fire
        expect(mockEmitActivity).not.toHaveBeenCalled();
    });

    it('does not transition nascent parent if not first child (newTotal > 1)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'nascent', total_children: 1, generation: 1 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1']);

        // newTotal = 2, so nascent→active condition (newTotal === 1) fails
        const activationUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes("lifecycle_state = 'active'") && String(sql).includes('activated_at')
        );
        expect(activationUpdate).toBeUndefined();
        expect(mockEmitActivity).not.toHaveBeenCalled();
    });

    it('handles multiple parents with mixed states', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', lifecycle_state: 'nascent', total_children: 0, generation: 1 },
                { id: 'p2', lifecycle_state: 'declining', total_children: 3, generation: 2 },
                { id: 'p3', lifecycle_state: 'active', total_children: 10, generation: 5 },
            ])
            .mockResolvedValue([]);

        await recordBirth('child-1', ['p1', 'p2', 'p3']);

        // p1: nascent→active (first child), p2: declining→active (revival), p3: no transition
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'activated', expect.any(String),
            expect.objectContaining({ nodeId: 'p1', transition: 'nascent→active' })
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'revived', expect.any(String),
            expect.objectContaining({ nodeId: 'p2', transition: 'declining→active' })
        );
        expect(mockEmitActivity).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// lifecycleSweep — composting & stillborn paths
// =============================================================================

describe('lifecycleSweep', () => {
    it('emits activity when declined > 0', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1' }])  // declining candidates
            .mockResolvedValueOnce([])                // UPDATE for n1
            .mockResolvedValueOnce([])                // compost candidates
            .mockResolvedValueOnce([]);               // stillborn candidates

        const result = await lifecycleSweep();

        expect(result.declined).toBe(1);
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'sweep_declined', expect.stringContaining('1'),
            expect.objectContaining({ count: 1 })
        );
    });

    it('composts declining nodes through full compostNode flow', async () => {
        mockGetPartitionForDomain.mockResolvedValue('partition-a');

        mockQuery
            .mockResolvedValueOnce([])   // declining candidates (none)
            .mockResolvedValueOnce([     // compost candidates
                { id: 'n1', content: 'A long content string', domain: 'science',
                  weight: 0.5, generation: 3, total_children: 2, created_at: '2025-01-01' },
            ])
            // compostNode internals for n1:
            .mockResolvedValueOnce([{ target_id: 'child-a' }, { target_id: 'child-b' }])  // surviving children
            .mockResolvedValueOnce([{ source_id: 'parent-x' }])                            // parent IDs
            .mockResolvedValueOnce([])   // INSERT stub
            .mockResolvedValueOnce([])   // UPDATE archive
            .mockResolvedValueOnce([]);  // stillborn candidates (none)

        const result = await lifecycleSweep();

        expect(result.composted).toBe(1);
        expect(mockGetPartitionForDomain).toHaveBeenCalledWith('science');

        // Verify stub INSERT with surviving children and parent IDs
        const stubInsert = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO node_stubs')
        );
        expect(stubInsert).toBeDefined();
        const params = stubInsert[1];
        expect(params[0]).toBe('n1');                              // node_id
        expect(params[1]).toBe('science');                          // domain
        expect(params[2]).toBe('partition-a');                      // partition_id
        expect(params[10]).toBe(JSON.stringify(['child-a', 'child-b'])); // surviving_children
        expect(params[11]).toBe(JSON.stringify(['parent-x']));      // parent_ids
        expect(params[12]).toBe('barren');                          // cause

        // Verify composted activity event
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'composted', expect.stringContaining('barren'),
            expect.objectContaining({ nodeId: 'n1', cause: 'barren', domain: 'science' })
        );
    });

    it('handles composted nodes with no children and no parents', async () => {
        mockGetPartitionForDomain.mockResolvedValue(null);

        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([     // compost candidates
                { id: 'n2', content: 'orphan', domain: 'd1',
                  weight: 0.1, generation: null, total_children: null, created_at: null, born_at: '2025-06-01' },
            ])
            .mockResolvedValueOnce([])   // surviving children (none)
            .mockResolvedValueOnce([])   // parent IDs (none)
            .mockResolvedValueOnce([])   // INSERT stub
            .mockResolvedValueOnce([])   // UPDATE archive
            .mockResolvedValueOnce([]);  // stillborn candidates

        const result = await lifecycleSweep();
        expect(result.composted).toBe(1);

        const stubInsert = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO node_stubs')
        );
        const params = stubInsert[1];
        expect(params[2]).toBe('unknown');    // partition fallback
        expect(params[6]).toBe(0);            // generation fallback
        expect(params[7]).toBe('2025-06-01'); // born_at fallback (created_at was null)
        expect(params[9]).toBe(0);            // total_children fallback
        expect(params[10]).toBeNull();        // no surviving children
        expect(params[11]).toBeNull();        // no parent IDs
    });

    it('handles stillborn nodes (nascent too long without children)', async () => {
        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([])   // compost candidates
            .mockResolvedValueOnce([     // stillborn candidates
                { id: 'still-1', content: 'never grew', domain: 'bio',
                  weight: 0.2, generation: 0, total_children: 0, created_at: '2025-03-01' },
            ])
            .mockResolvedValueOnce([])   // surviving children
            .mockResolvedValueOnce([])   // parents
            .mockResolvedValueOnce([])   // INSERT stub
            .mockResolvedValueOnce([]);  // UPDATE archive

        const result = await lifecycleSweep();

        expect(result.stillborn).toBe(1);
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'composted', expect.stringContaining('stillbirth'),
            expect.objectContaining({ nodeId: 'still-1', cause: 'stillbirth' })
        );
        // Should also emit sweep_composted for the total
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle', 'sweep_composted', expect.any(String),
            expect.objectContaining({ composted: 0, stillborn: 1 })
        );
    });

    it('omits breakthrough guard when preserveBreakthroughs is false', async () => {
        mockConfig.lifecycle.composting.preserveBreakthroughs = false;

        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([])   // compost candidates (query doesn't filter breakthroughs)
            .mockResolvedValueOnce([]);  // stillborn candidates

        await lifecycleSweep();

        // The compost candidates query (2nd call) should NOT contain "AND node_type != 'breakthrough'"
        const compostQuery = mockQuery.mock.calls[1] as any[];
        expect(String(compostQuery[0])).not.toContain("node_type != 'breakthrough'");
    });

    it('includes breakthrough guard when preserveBreakthroughs is true', async () => {
        mockConfig.lifecycle.composting.preserveBreakthroughs = true;

        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([])   // compost candidates
            .mockResolvedValueOnce([]);  // stillborn candidates

        await lifecycleSweep();

        const compostQuery = mockQuery.mock.calls[1] as any[];
        expect(String(compostQuery[0])).toContain("node_type != 'breakthrough'");
    });

    it('does not emit sweep_composted when composted + stillborn = 0', async () => {
        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([])   // compost candidates
            .mockResolvedValueOnce([]);  // stillborn candidates

        await lifecycleSweep();

        expect(mockEmitActivity).not.toHaveBeenCalledWith(
            'lifecycle', 'sweep_composted', expect.any(String), expect.any(Object)
        );
    });

    it('truncates content summary to summaryMaxLength', async () => {
        const longContent = 'A'.repeat(500);
        mockConfig.lifecycle.composting.summaryMaxLength = 50;

        mockQuery
            .mockResolvedValueOnce([])   // declining candidates
            .mockResolvedValueOnce([     // compost candidates
                { id: 'n-long', content: longContent, domain: 'd1',
                  weight: 0.3, generation: 1, total_children: 1, created_at: '2025-01-01' },
            ])
            .mockResolvedValueOnce([])   // children
            .mockResolvedValueOnce([])   // parents
            .mockResolvedValueOnce([])   // INSERT stub
            .mockResolvedValueOnce([])   // UPDATE archive
            .mockResolvedValueOnce([]);  // stillborn

        await lifecycleSweep();

        const stubInsert = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO node_stubs')
        );
        const summary = stubInsert[1][4]; // summary param
        expect(summary.length).toBe(50);
    });
});

// =============================================================================
// getMetabolism
// =============================================================================

describe('getMetabolism', () => {
    it('returns computed metrics from DB counts', async () => {
        mockQueryOne
            .mockResolvedValueOnce({  // main counts query
                total: 100, nascent: 20, active: 60, declining: 15,
                avg_generation: 2.5, fertile_active: 45, total_active: 60,
            })
            .mockResolvedValueOnce({ count: 10 })   // stubs count
            .mockResolvedValueOnce({ count: 5 })     // recent births
            .mockResolvedValueOnce({ count: 3 });    // recent composts

        const result = await getMetabolism();

        expect(result.totalNodes).toBe(100);
        expect(result.nascentCount).toBe(20);
        expect(result.activeCount).toBe(60);
        expect(result.decliningCount).toBe(15);
        expect(result.compostedStubs).toBe(10);
        expect(result.birthRate).toBe(5);
        expect(result.compostRate).toBe(3);
        expect(result.activeRatio).toBe(0.6);       // 60/100
        expect(result.nascentRatio).toBe(0.2);       // 20/100
        expect(result.avgGeneration).toBe(2.5);
        expect(result.fertilityRate).toBe(0.75);     // 45/60
    });

    it('returns zeros when DB returns nulls', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await getMetabolism();

        expect(result.totalNodes).toBe(0);
        expect(result.nascentCount).toBe(0);
        expect(result.activeCount).toBe(0);
        expect(result.decliningCount).toBe(0);
        expect(result.compostedStubs).toBe(0);
        expect(result.birthRate).toBe(0);
        expect(result.compostRate).toBe(0);
        expect(result.activeRatio).toBe(0);
        expect(result.nascentRatio).toBe(0);
        expect(result.avgGeneration).toBe(0);
        expect(result.fertilityRate).toBe(0);
    });

    it('handles zero total nodes (avoids division by zero)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: 0, nascent: 0, active: 0, declining: 0,
                avg_generation: null, fertile_active: 0, total_active: 0,
            })
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 0 });

        const result = await getMetabolism();

        expect(result.activeRatio).toBe(0);
        expect(result.nascentRatio).toBe(0);
        expect(result.fertilityRate).toBe(0);
    });

    it('handles zero active but nonzero total (fertilityRate edge)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: 50, nascent: 30, active: 0, declining: 20,
                avg_generation: 1.0, fertile_active: 0, total_active: 0,
            })
            .mockResolvedValueOnce({ count: 5 })
            .mockResolvedValueOnce({ count: 2 })
            .mockResolvedValueOnce({ count: 1 });

        const result = await getMetabolism();

        expect(result.totalNodes).toBe(50);
        expect(result.activeRatio).toBe(0);          // 0/50
        expect(result.nascentRatio).toBeCloseTo(0.6); // 30/50
        expect(result.fertilityRate).toBe(0);          // totalActive=0
    });
});
