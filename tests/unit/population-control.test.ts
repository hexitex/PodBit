/**
 * Unit tests for population-control.ts — evaluateNode with embedding eval integration.
 *
 * Tests: config gating, embedding pre-screen (live mode vs shadow mode),
 * LLM consultant fallback, weight clamping, activity emission.
 *
 * The dedup sweep is tested separately in dedup-sweep.test.ts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockRunComprehensiveConsultant = jest.fn<(...args: any[]) => Promise<any>>();
const mockEvaluateNodeEmbed = jest.fn<(...args: any[]) => Promise<any>>();

const mockPopulationCfg = {
    enabled: true,
    gracePeriodHours: 2,
    batchSize: 5,
    threshold: 4.0,
    archiveThreshold: 2.0,
    boostWeight: 1.1,
    demoteWeight: 0.5,
    dedupSweep: { enabled: false },
};

const mockEmbeddingEvalCfg = {
    enabled: false,
    shadowMode: true,
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        populationControl: mockPopulationCfg,
        embeddingEval: mockEmbeddingEvalCfg,
        engine: { weightCeiling: 3.0, weightFloor: 0.1 },
        feedback: { weightFloor: 0.1 },
    },
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    runComprehensiveConsultant: mockRunComprehensiveConsultant,
}));

jest.unstable_mockModule('../../core/embedding-eval.js', () => ({
    evaluateNode: mockEvaluateNodeEmbed,
}));

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    buildClusters: jest.fn().mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 }),
}));

const { runPopulationControlCycleSingle } = await import('../../core/cycles/population-control.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockPopulationCfg, {
        enabled: true,
        gracePeriodHours: 2,
        batchSize: 5,
        threshold: 4.0,
        archiveThreshold: 2.0,
        boostWeight: 1.1,
        demoteWeight: 0.5,
        dedupSweep: { enabled: false },
    });
    Object.assign(mockEmbeddingEvalCfg, {
        enabled: false,
        shadowMode: true,
    });
    mockRunComprehensiveConsultant.mockResolvedValue({
        composite: 5.0, reasoning: 'good', accept: true,
    });
});

function makeCandidate(overrides: Record<string, any> = {}) {
    return {
        id: 'test-node-1234',
        content: 'test synthesis content',
        weight: 1.0,
        domain: 'test-domain',
        node_type: 'voiced',
        specificity: 0.5,
        embedding: null,
        embedding_bin: null,
        salience: 0.5,
        ...overrides,
    };
}

function makeParent(overrides: Record<string, any> = {}) {
    return {
        id: 'parent-node-1234',
        content: 'parent content',
        weight: 1.5,
        domain: 'test-domain',
        node_type: 'seed',
        specificity: 0.5,
        embedding: null,
        embedding_bin: null,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runPopulationControlCycleSingle', () => {
    it('returns early when disabled', async () => {
        mockPopulationCfg.enabled = false;
        await runPopulationControlCycleSingle();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('does nothing when no candidates found', async () => {
        mockQuery.mockResolvedValueOnce([]); // candidates query
        await runPopulationControlCycleSingle();
        expect(mockRunComprehensiveConsultant).not.toHaveBeenCalled();
    });

    it('skips orphan nodes (no parents) and marks as evaluated', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate()]) // candidates
            .mockResolvedValueOnce([])                  // parents (empty = orphan)
            .mockResolvedValue([]);                     // update

        await runPopulationControlCycleSingle();

        // Should mark as evaluated
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('cull_evaluated_at'),
        );
        expect(updateCalls.length).toBeGreaterThan(0);
        // Should NOT call consultant for orphans
        expect(mockRunComprehensiveConsultant).not.toHaveBeenCalled();
    });

    it('boosts node when consultant score exceeds threshold', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate({ weight: 1.0 })]) // candidates
            .mockResolvedValueOnce([makeParent()])                     // parents
            .mockResolvedValue([]);                                    // updates

        mockRunComprehensiveConsultant.mockResolvedValue({
            composite: 6.0, reasoning: 'excellent', accept: true,
        });

        await runPopulationControlCycleSingle();

        // Should boost weight: 1.0 * 1.1 = 1.1
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('weight = $1'),
        );
        expect(updateCalls.length).toBeGreaterThan(0);

        // Activity should show boost
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_boost',
            expect.stringContaining('boost'),
            expect.objectContaining({ action: 'boost' }),
        );
    });

    it('demotes node when score is between archive and boost thresholds', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate({ weight: 1.0 })]) // candidates
            .mockResolvedValueOnce([makeParent()])                     // parents
            .mockResolvedValue([]);                                    // updates

        mockRunComprehensiveConsultant.mockResolvedValue({
            composite: 3.0, reasoning: 'mediocre', accept: false,
        });

        await runPopulationControlCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_demote',
            expect.stringContaining('demote'),
            expect.objectContaining({ action: 'demote' }),
        );
    });

    it('archives node when score is below archive threshold', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate({ weight: 1.0 })]) // candidates
            .mockResolvedValueOnce([makeParent()])                     // parents
            .mockResolvedValue([]);                                    // updates

        mockRunComprehensiveConsultant.mockResolvedValue({
            composite: 1.0, reasoning: 'bad content', accept: false,
        });

        await runPopulationControlCycleSingle();

        // Should set archived = 1
        const archiveCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('archived = 1'),
        );
        expect(archiveCalls.length).toBeGreaterThan(0);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_archive',
            expect.stringContaining('archive'),
            expect.objectContaining({ action: 'archive' }),
        );
    });

    it('clamps weight to ceiling and floor', async () => {
        // Weight that would exceed ceiling after boost
        mockQuery
            .mockResolvedValueOnce([makeCandidate({ weight: 2.8 })]) // weight * 1.1 = 3.08 > ceiling 3.0
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockResolvedValue({
            composite: 6.0, reasoning: 'great', accept: true,
        });

        await runPopulationControlCycleSingle();

        // Weight should be clamped to 3.0
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('weight = $1'),
        );
        const lastUpdate = updateCalls[updateCalls.length - 1];
        if (lastUpdate) {
            expect(lastUpdate[1][0]).toBeLessThanOrEqual(3.0);
        }
    });
});

// ---------------------------------------------------------------------------
// Embedding eval integration
// ---------------------------------------------------------------------------
describe('embedding eval integration', () => {
    it('skips embedding eval when disabled', async () => {
        mockEmbeddingEvalCfg.enabled = false;

        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        expect(mockEvaluateNodeEmbed).not.toHaveBeenCalled();
        expect(mockRunComprehensiveConsultant).toHaveBeenCalled();
    });

    it('runs embedding eval in shadow mode then falls through to consultant', async () => {
        mockEmbeddingEvalCfg.enabled = true;
        mockEmbeddingEvalCfg.shadowMode = true;

        mockEvaluateNodeEmbed.mockResolvedValue({
            checks: [{ mode: 8, modeName: 'self_reinforcing_drift', result: 'FAIL', score: 0.95, comparedTo: 'test', instructionUsed: 'test' }],
            anyFail: true,
        });

        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        // Both should run in shadow mode
        expect(mockEvaluateNodeEmbed).toHaveBeenCalled();
        expect(mockRunComprehensiveConsultant).toHaveBeenCalled();

        // Embedding eval result should be logged
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'embedding_eval',
            expect.stringContaining('Embedding eval'),
            expect.objectContaining({ shadowMode: true }),
        );
    });

    it('archives directly in live mode when embedding eval fails', async () => {
        mockEmbeddingEvalCfg.enabled = true;
        mockEmbeddingEvalCfg.shadowMode = false; // LIVE mode

        mockEvaluateNodeEmbed.mockResolvedValue({
            checks: [{ mode: 8, modeName: 'self_reinforcing_drift', result: 'FAIL', score: 0.95, comparedTo: 'test', instructionUsed: 'test' }],
            anyFail: true,
        });

        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        // Should NOT fall through to consultant in live mode with failure
        expect(mockRunComprehensiveConsultant).not.toHaveBeenCalled();

        // Should archive
        const archiveCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('archived = 1'),
        );
        expect(archiveCalls.length).toBeGreaterThan(0);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_archive',
            expect.stringContaining('embedding'),
            expect.objectContaining({ action: 'archive' }),
        );
    });

    it('boosts in live mode when all embedding checks pass', async () => {
        mockEmbeddingEvalCfg.enabled = true;
        mockEmbeddingEvalCfg.shadowMode = false; // LIVE mode

        mockEvaluateNodeEmbed.mockResolvedValue({
            checks: [{ mode: 8, modeName: 'self_reinforcing_drift', result: 'PASS', score: 0.5, comparedTo: 'test', instructionUsed: 'test' }],
            anyFail: false,
        });

        mockQuery
            .mockResolvedValueOnce([makeCandidate({ weight: 1.0 })])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        // Should NOT call consultant — embedding decides in live mode
        expect(mockRunComprehensiveConsultant).not.toHaveBeenCalled();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_boost',
            expect.stringContaining('embedding'),
            expect.objectContaining({ action: 'boost' }),
        );
    });

    it('handles embedding eval errors gracefully (falls through to consultant)', async () => {
        mockEmbeddingEvalCfg.enabled = true;
        mockEmbeddingEvalCfg.shadowMode = false;

        mockEvaluateNodeEmbed.mockRejectedValue(new Error('embedding service down'));

        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        await runPopulationControlCycleSingle();

        // Should fall through to consultant on embedding error
        expect(mockRunComprehensiveConsultant).toHaveBeenCalled();
    });

    it('handles consultant errors gracefully (mid-range score, no punishment)', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makeParent()])
            .mockResolvedValue([]);

        mockRunComprehensiveConsultant.mockRejectedValue(new Error('LLM down'));

        await runPopulationControlCycleSingle();

        // Should still mark as evaluated (default score 5.0 → boost)
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', expect.stringContaining('population_control_'),
            expect.any(String),
            expect.any(Object),
        );
    });
});
