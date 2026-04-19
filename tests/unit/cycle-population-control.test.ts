/**
 * Unit tests for core/cycles/population-control.ts — runPopulationControlCycleSingle().
 *
 * Tests: candidate selection, parent recovery, single consultant call,
 * outcome application (boost/demote/archive), weight clamping, error handling.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockRunComprehensiveConsultant = jest.fn<(...args: any[]) => Promise<any>>();

const mockCfg = {
    enabled: true,
    gracePeriodHours: 2,
    batchSize: 5,
    threshold: 4.0,
    archiveThreshold: 2.0,
    boostWeight: 1.1,
    demoteWeight: 0.5,
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        populationControl: mockCfg,
        engine: { weightCeiling: 3.0, weightFloor: 0.05 },
        feedback: { weightFloor: 0.1 },
    },
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    runComprehensiveConsultant: mockRunComprehensiveConsultant,
}));

const { runPopulationControlCycleSingle } = await import('../../core/cycles/population-control.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(id = 'node-1', weight = 1.0) {
    return {
        id, content: 'Synthesized insight about topic', weight, domain: 'sci',
        node_type: 'synthesis', specificity: 1.5, embedding: '[0.1,0.2,0.3]',
        embedding_bin: null, salience: 0.8,
    };
}

function makeParent(id = 'parent-1') {
    return {
        id, content: 'Parent node content with sufficient words for testing',
        weight: 1.0, domain: 'sci', node_type: 'seed', specificity: 1.0,
        embedding: '[0.1,0.2,0.3]', embedding_bin: null,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(mockCfg, {
        enabled: true, gracePeriodHours: 2, batchSize: 5,
        threshold: 4.0, archiveThreshold: 2.0,
        boostWeight: 1.1, demoteWeight: 0.5,
    });
    mockRunComprehensiveConsultant.mockResolvedValue({ composite: 7.0, accept: true, reasoning: 'Good synthesis' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runPopulationControlCycleSingle', () => {
    it('returns early when disabled', async () => {
        mockCfg.enabled = false;
        await runPopulationControlCycleSingle();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns early when no candidates found', async () => {
        mockQuery.mockResolvedValueOnce([]); // candidates
        await runPopulationControlCycleSingle();
        expect(mockEmitActivity).not.toHaveBeenCalled();
    });

    it('skips nodes with no parents (marks evaluated)', async () => {
        const node = makeNode();
        mockQuery
            .mockResolvedValueOnce([node])   // candidates
            .mockResolvedValueOnce([])        // parents (none)
            .mockResolvedValueOnce([]);       // UPDATE cull_evaluated_at
        await runPopulationControlCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('cull_evaluated_at'),
            [node.id]
        );
        expect(mockRunComprehensiveConsultant).not.toHaveBeenCalled();
    });

    it('calls runComprehensiveConsultant with correct args', async () => {
        const node = makeNode('n1', 1.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        expect(mockRunComprehensiveConsultant).toHaveBeenCalledWith(
            node.content,
            expect.arrayContaining([expect.objectContaining({ id: 'p1' }), expect.objectContaining({ id: 'p2' })]),
            node.domain
        );
    });

    it('boosts node when consultant score is above threshold', async () => {
        const node = makeNode('n1', 1.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockResolvedValue({ composite: 7.0, accept: true, reasoning: 'Strong' });

        await runPopulationControlCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('cull_evaluated_at'),
            expect.arrayContaining([expect.closeTo(1.1, 1)]) // weight * 1.1
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_boost', expect.any(String),
            expect.objectContaining({ action: 'boost', nodeId: 'n1' })
        );
    });

    it('demotes node when score is between thresholds', async () => {
        const node = makeNode('n1', 1.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockResolvedValue({ composite: 3.0, accept: false, reasoning: 'Weak' });

        await runPopulationControlCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('cull_evaluated_at'),
            expect.arrayContaining([expect.closeTo(0.5, 1)]) // weight * 0.5
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_demote', expect.any(String),
            expect.objectContaining({ action: 'demote', nodeId: 'n1' })
        );
    });

    it('archives node when score is below archive threshold', async () => {
        const node = makeNode('n1', 1.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockResolvedValue({ composite: 1.0, accept: false, reasoning: 'Terrible' });

        await runPopulationControlCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('archived = 1'),
            expect.arrayContaining([1.0, 'n1'])
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_archive', expect.any(String),
            expect.objectContaining({ action: 'archive', nodeId: 'n1' })
        );
    });

    it('handles consultant errors gracefully (defaults to mid-range score)', async () => {
        const node = makeNode('n1', 1.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockRejectedValue(new Error('LLM timeout'));

        await runPopulationControlCycleSingle();

        // Should still complete — default score 5.0 → boost (>= 4.0 threshold)
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', expect.stringContaining('population_control_'), expect.any(String),
            expect.objectContaining({ nodeId: 'n1' })
        );
    });

    it('clamps weight to ceiling and floor', async () => {
        // Node already at weight ceiling
        const node = makeNode('n1', 3.0);
        const parents = [makeParent('p1'), makeParent('p2')];
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce(parents)
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockResolvedValue({ composite: 8.0, accept: true });

        await runPopulationControlCycleSingle();

        // weight * 1.1 = 3.3, clamped to ceiling 3.0
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('cull_evaluated_at'),
            expect.arrayContaining([3.0, 'n1'])
        );
    });
});
