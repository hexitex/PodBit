/**
 * Deep unit tests for handlers/dedup.ts — targets uncovered branches/statements
 * not covered by dedup-core.test.ts.
 *
 * Covers: askLlmJudge (success, error, consultant override), checkDuplicate LLM judge
 * doubt zone flow, LLM judge cap, attractor recording + weight decay, computeWordOverlap
 * empty sets, areSimilar method fallbacks, checkDuplicate null domain early return,
 * resolveGateConfig partial overrides, handleDedup non-dry-run no-archive path.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0);
const mockInvalidateKnowledgeCache = jest.fn<() => void>();
const mockEmitActivity = jest.fn<() => void>();
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('dedup prompt');
const mockResolveContent = jest.fn<(s: string) => Promise<string>>()
    .mockImplementation(async (s) => s);

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('DUPLICATE\nreason here');
const mockConsultantReview = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetSubsystemAssignments = jest.fn<() => Promise<Record<string, any>>>()
    .mockResolvedValue({ dedup_judge: { id: 'model1' } });

const mockCachedLoader = {
    get: jest.fn<() => Promise<Map<string, any>>>().mockResolvedValue(new Map()),
    invalidate: jest.fn<() => void>(),
};
const mockCreateCachedLoader = jest.fn(() => mockCachedLoader);

const mockConfig: Record<string, any> = {
    dedup: {
        embeddingSimilarityThreshold: 0.82,
        wordOverlapThreshold: 0.70,
        minWordLength: 3,
        maxNodesPerDomain: 500,
        attractorThreshold: 30,
        attractorWeightDecay: 0.01,
        llmJudgeEnabled: false,
        llmJudgeDoubtFloor: 0.75,
        llmJudgeHardCeiling: 0.97,
    },
    consultantReview: { enabled: false },
};

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
    createCachedLoader: mockCreateCachedLoader,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
    consultantReview: mockConsultantReview,
}));

const { handleDedup, checkDuplicate, invalidateGateOverrideCache } = await import('../../handlers/dedup.js');

function resetConfig() {
    mockConfig.dedup = {
        embeddingSimilarityThreshold: 0.82,
        wordOverlapThreshold: 0.70,
        minWordLength: 3,
        maxNodesPerDomain: 500,
        attractorThreshold: 30,
        attractorWeightDecay: 0.01,
        llmJudgeEnabled: false,
        llmJudgeDoubtFloor: 0.75,
        llmJudgeHardCeiling: 0.97,
    };
    mockConfig.consultantReview = { enabled: false };
}

beforeEach(() => {
    jest.clearAllMocks();
    resetConfig();
    mockQuery.mockResolvedValue([]);
    mockLogDecision.mockResolvedValue(undefined);
    mockCosineSimilarity.mockReturnValue(0);
    mockGetPrompt.mockResolvedValue('dedup prompt');
    mockResolveContent.mockImplementation(async (s) => s);
    mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nreason here');
    mockConsultantReview.mockResolvedValue(null);
    mockGetSubsystemAssignments.mockResolvedValue({ dedup_judge: { id: 'model1' } });
    mockCachedLoader.get.mockResolvedValue(new Map());
});

// =============================================================================
// checkDuplicate — null domain early return
// =============================================================================

describe('checkDuplicate — null domain early return', () => {
    it('returns isDuplicate false immediately when domain is null', async () => {
        const result = await checkDuplicate('some content', [0.1, 0.2], null);
        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0);
        // Should not query the database at all
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// =============================================================================
// checkDuplicate — LLM judge doubt zone flow
// =============================================================================

describe('checkDuplicate — LLM judge doubt zone', () => {
    beforeEach(() => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.dedup.llmJudgeDoubtFloor = 0.75;
        mockConfig.dedup.llmJudgeHardCeiling = 0.97;
    });

    it('calls LLM judge when similarity is in the doubt zone and judge says DUPLICATE', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing node content about physics', embedding: emb },
        ]);
        // Similarity in doubt zone: >= 0.75 but < 0.97
        mockCosineSimilarity.mockReturnValue(0.85);
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame core claim about physics');

        const result = await checkDuplicate('new content about physics', [0.5, 0.5], 'science', 'synthesis');

        expect(result.isDuplicate).toBe(true);
        expect(result.llmJudged).toBe(true);
        expect(result.reason).toContain('LLM judge');
        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'dedup_judge',
            expect.any(String),
            expect.objectContaining({ temperature: 0.1 }),
        );
    });

    it('continues checking when LLM judge says NOVEL', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'first node', embedding: emb },
            { id: 'n2', content: 'second node', embedding: emb },
        ]);
        // Both in doubt zone
        mockCosineSimilarity.mockReturnValue(0.80);
        mockCallSubsystemModel.mockResolvedValue('NOVEL\nDifferent perspectives');

        const result = await checkDuplicate('new unique content', [0.5, 0.5], 'domain', 'synthesis');

        // LLM said NOVEL for both, and embedding 0.80 < threshold 0.82
        expect(result.isDuplicate).toBe(false);
        // Should have called judge twice (once per node in doubt zone)
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(2);
    });

    it('stops calling LLM judge after maxLlmJudgeCalls (3) reached', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'node one', embedding: emb },
            { id: 'n2', content: 'node two', embedding: emb },
            { id: 'n3', content: 'node three', embedding: emb },
            { id: 'n4', content: 'node four', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80); // All in doubt zone
        mockCallSubsystemModel.mockResolvedValue('NOVEL\nAll different');

        await checkDuplicate('brand new content', [0.5, 0.5], 'domain', 'synthesis');

        // Should only call judge 3 times (maxLlmJudgeCalls = 3), 4th node skipped
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(3);
    });

    it('does not call LLM judge when dedup_judge subsystem is not assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ dedup_judge: null });

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'aardvark xylophone vermillion', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80); // In doubt zone

        const result = await checkDuplicate('zephyr quixotic palindrome', [0.5, 0.5], 'domain', 'synthesis');

        // No judge call — hasJudge is false
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
        // 0.80 < 0.82 threshold, no word overlap match (completely different words)
        expect(result.isDuplicate).toBe(false);
    });
});

// =============================================================================
// askLlmJudge — error handling (fail-open)
// =============================================================================

describe('checkDuplicate — LLM judge error (fail-open)', () => {
    it('allows content through when LLM judge throws an error', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80); // In doubt zone
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM service unavailable'));

        const result = await checkDuplicate('new content', [0.5, 0.5], 'domain', 'synthesis');

        // Fail-open: should not be marked as duplicate
        expect(result.isDuplicate).toBe(false);
        // Should emit error activity
        const errorCalls = (mockEmitActivity.mock.calls as any[]).filter(
            ([, type]: any[]) => type === 'dedup_judge'
        );
        expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });
});

// =============================================================================
// askLlmJudge — consultant review flipping verdict
// =============================================================================

describe('checkDuplicate — LLM judge with consultant review', () => {
    it('flips verdict when consultant disagrees', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.consultantReview = {
            enabled: true,
            thresholds: { dedup_judge: 0.80 },
        };

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content about neural networks', embedding: emb },
        ]);
        // Similarity in doubt zone AND close to consultant threshold (0.80 +/- 0.075)
        mockCosineSimilarity.mockReturnValue(0.79);
        // Primary judge says DUPLICATE
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame content');
        // Consultant disagrees
        mockConsultantReview.mockResolvedValue({
            accept: false,
            reasoning: 'The new content has novel perspective on backpropagation not present in original',
        });

        const result = await checkDuplicate(
            'new content about neural network backpropagation',
            [0.5, 0.5],
            'domain',
            'synthesis',
        );

        // Verdict should be flipped to NOVEL by consultant
        // Since primary was DUPLICATE and consultant flipped to NOVEL, isDuplicate should be false
        // But the result is returned from askLlmJudge which returns { isDuplicate: false }
        // Then checkDuplicate continues (it was in doubt zone, LLM said not duplicate after flip)
        expect(result.isDuplicate).toBe(false);
        expect(mockConsultantReview).toHaveBeenCalled();
    });

    it('keeps verdict when consultant agrees', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.consultantReview = {
            enabled: true,
            thresholds: { dedup_judge: 0.80 },
        };

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content about deep learning', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.79); // Near consultant threshold
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame claim');
        // Consultant agrees (accept: true)
        mockConsultantReview.mockResolvedValue({ accept: true, reasoning: 'Agree, duplicate' });

        const result = await checkDuplicate(
            'new content about deep learning',
            [0.5, 0.5],
            'domain',
            'synthesis',
        );

        // DUPLICATE verdict kept
        expect(result.isDuplicate).toBe(true);
        expect(result.llmJudged).toBe(true);
    });

    it('handles consultant review error gracefully (non-fatal)', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.consultantReview = {
            enabled: true,
            thresholds: { dedup_judge: 0.80 },
        };

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.79);
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame content');
        // Consultant throws
        mockConsultantReview.mockRejectedValue(new Error('Consultant unavailable'));

        const result = await checkDuplicate(
            'new content',
            [0.5, 0.5],
            'domain',
            'synthesis',
        );

        // Original verdict kept despite consultant error
        expect(result.isDuplicate).toBe(true);
    });
});

// =============================================================================
// checkDuplicate — attractor skipping and emission
// =============================================================================

describe('checkDuplicate — attractor count tracking', () => {
    it('records attractor match on hard ceiling hit', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'attractor-node', content: 'generic content', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.98); // Above hard ceiling 0.97

        const result = await checkDuplicate('near copy', [0.5, 0.5], 'domain');
        expect(result.isDuplicate).toBe(true);

        // The attractor count should have been incremented.
        // Verify by checking that query was called with UPDATE (weight decay)
        const updateCalls = (mockQuery.mock.calls as any[]).filter(
            ([sql]: any[]) => typeof sql === 'string' && sql.includes('UPDATE nodes SET weight')
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('skips attractor nodes that exceeded threshold and emits activity', async () => {
        mockConfig.dedup.attractorThreshold = 1; // Very low threshold for testing

        const emb = '[0.5, 0.5]';
        // First call: trigger attractor count by hitting hard ceiling
        mockQuery.mockResolvedValue([
            { id: 'hot-node', content: 'very generic broad concept', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.98); // Hard ceiling hit

        await checkDuplicate('copy one', [0.5, 0.5], 'domain');

        // Now hot-node has count=1 which equals threshold=1
        // Second call: hot-node should be skipped
        jest.clearAllMocks();
        mockQuery.mockResolvedValue([
            { id: 'hot-node', content: 'very generic broad concept', embedding: emb },
        ]);

        const result = await checkDuplicate('something new', [0.5, 0.5], 'domain');

        expect(result.isDuplicate).toBe(false);
        // Should emit attractor skipped activity
        const attractorCalls = (mockEmitActivity.mock.calls as any[]).filter(
            ([, type]: any[]) => type === 'dedup_attractors_skipped'
        );
        expect(attractorCalls).toHaveLength(1);
        expect(attractorCalls[0][3]).toMatchObject({ skippedAttractors: 1 });
    });

    it('does not decay weight when attractorWeightDecay is 0', async () => {
        mockConfig.dedup.attractorWeightDecay = 0;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.98); // Hard ceiling

        await checkDuplicate('copy', [0.5, 0.5], 'domain');

        // No UPDATE weight query should have been issued
        const updateCalls = (mockQuery.mock.calls as any[]).filter(
            ([sql]: any[]) => typeof sql === 'string' && sql.includes('UPDATE nodes SET weight')
        );
        expect(updateCalls).toHaveLength(0);
    });
});

// =============================================================================
// checkDuplicate — word overlap match after scanning all nodes
// =============================================================================

describe('checkDuplicate — word overlap best match post-scan', () => {
    it('reports word overlap duplicate after full scan when embedding below threshold', async () => {
        // Node has embedding but similarity is below embedding threshold but above doubt floor
        // and node also has high word overlap
        mockConfig.dedup.llmJudgeEnabled = false;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            {
                id: 'n1',
                content: 'quantum entanglement physics research methodology advanced experimental results',
                embedding: emb,
            },
        ]);
        // Embedding similarity below threshold (0.82) and below doubt floor
        mockCosineSimilarity.mockReturnValue(0.50);

        const result = await checkDuplicate(
            'quantum entanglement physics research methodology advanced experimental results today',
            [0.5, 0.5],
            'domain',
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Word overlap');
    });
});

// =============================================================================
// checkDuplicate — embedding threshold match (not hard ceiling, not doubt zone)
// =============================================================================

describe('checkDuplicate — embedding threshold match after full scan', () => {
    it('reports embedding duplicate when bestSimilarity >= embeddingThreshold', async () => {
        mockConfig.dedup.llmJudgeEnabled = false;
        mockConfig.dedup.wordOverlapThreshold = 0.99; // Prevent word overlap match

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'completely unique words aardvark xylophone', embedding: emb },
            { id: 'n2', content: 'totally different vocabulary zephyr quixotic', embedding: emb },
        ]);
        // First node: 0.80, second node: 0.85 (above threshold 0.82)
        mockCosineSimilarity
            .mockReturnValueOnce(0.80)
            .mockReturnValueOnce(0.85);

        const result = await checkDuplicate(
            'brand new distinct phrasing vermillion',
            [0.5, 0.5],
            'domain',
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.bestSimilarity).toBe(0.85);
        expect(result.reason).toContain('Embedding similarity');
    });
});

// =============================================================================
// handleDedup — non-dry-run with zero archives (no cache invalidation)
// =============================================================================

describe('handleDedup — non-dry-run with no duplicates', () => {
    it('does not invalidate cache when no nodes were archived', async () => {
        const emb1 = JSON.stringify([1, 0]);
        const emb2 = JSON.stringify([0, 1]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'alpha topic physics', weight: 2, domain: 'dom', embedding: emb1 },
                { id: 'n2', content: 'beta topic biology', weight: 1, domain: 'dom', embedding: emb2 },
            ])
            .mockResolvedValueOnce([]); // edges

        mockCosineSimilarity.mockReturnValue(0.10); // No clusters form

        await handleDedup({ domain: 'dom', dryRun: false });

        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });
});

// =============================================================================
// handleDedup — word-overlap-only clustering (no embeddings)
// =============================================================================

describe('handleDedup — word overlap clustering', () => {
    it('clusters nodes by word overlap when embeddings are null', async () => {
        mockQuery
            .mockResolvedValueOnce([
                {
                    id: 'n1',
                    content: 'quantum entanglement physics research methodology advanced experimental results',
                    weight: 2.0,
                    domain: 'phys',
                    embedding: null,
                },
                {
                    id: 'n2',
                    content: 'quantum entanglement physics research methodology advanced experimental results today',
                    weight: 1.0,
                    domain: 'phys',
                    embedding: null,
                },
            ])
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValue([]);    // archive queries

        const result = await handleDedup({ domain: 'phys', dryRun: true });

        expect(result.totalClustersFound).toBe(1);
        expect(result.results[0].clusters[0].keptNode.id).toBe('n1');
        expect(result.results[0].clusters[0].archivedNodes[0].id).toBe('n2');
    });
});

// =============================================================================
// handleDedup — lineage exclusion prevents clustering
// =============================================================================

describe('handleDedup — lineage parent-child exclusion', () => {
    it('excludes parent-child pairs from clustering via edge lookup', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'parent', content: 'parent node', weight: 2.0, domain: 'dom', embedding: emb },
                { id: 'child', content: 'child node', weight: 1.0, domain: 'dom', embedding: emb },
            ])
            .mockResolvedValueOnce([
                { source_id: 'parent', target_id: 'child' }, // parent edge
            ])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.95); // Would cluster without lineage exclusion

        const result = await handleDedup({ domain: 'dom', dryRun: true });

        // Should NOT cluster because they are parent-child
        expect(result.totalClustersFound).toBe(0);
        expect(result.results).toHaveLength(0);
    });

    it('reports lineageExcludedPairs count', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', content: 'parent one', weight: 3.0, domain: 'dom', embedding: emb },
                { id: 'c1', content: 'child one', weight: 2.0, domain: 'dom', embedding: emb },
                { id: 'c2', content: 'child two', weight: 1.0, domain: 'dom', embedding: emb },
            ])
            .mockResolvedValueOnce([
                { source_id: 'p1', target_id: 'c1' },
                { source_id: 'p1', target_id: 'c2' },
            ])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.95);

        const result = await handleDedup({ domain: 'dom', dryRun: true });

        // c1-c2 still cluster (not directly related), but p1-c1 and p1-c2 are excluded
        // The lineageExcludedPairs should count the excluded pairs
        // p1-c1 and p1-c2 => 2 excluded (each registered bidirectionally but only counted once in loop)
        expect(result.results[0].lineageExcludedPairs).toBe(2);
    });
});

// =============================================================================
// askLlmJudge — NOVEL verdict emits activity with passed: true
// =============================================================================

describe('checkDuplicate — LLM judge emits activity', () => {
    it('emits dedup_judge activity with verdict NOVEL when judge says novel', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80); // In doubt zone
        mockCallSubsystemModel.mockResolvedValue('NOVEL\nThis adds new perspective');

        await checkDuplicate('new perspective content', [0.5, 0.5], 'domain', 'synthesis');

        const judgeCalls = (mockEmitActivity.mock.calls as any[]).filter(
            ([, type]: any[]) => type === 'dedup_judge'
        );
        expect(judgeCalls).toHaveLength(1);
        expect(judgeCalls[0][3]).toMatchObject({
            passed: true,
            verdict: 'NOVEL',
            source: 'synthesis',
        });
    });

    it('emits dedup_judge activity with source "unknown" when no source provided', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80);
        mockCallSubsystemModel.mockResolvedValue('NOVEL\nDifferent');

        await checkDuplicate('new content', [0.5, 0.5], 'domain');

        const judgeCalls = (mockEmitActivity.mock.calls as any[]).filter(
            ([, type]: any[]) => type === 'dedup_judge'
        );
        expect(judgeCalls).toHaveLength(1);
        expect(judgeCalls[0][3].source).toBe('unknown');
    });
});

// =============================================================================
// resolveGateConfig — partial overrides merge correctly
// =============================================================================

describe('checkDuplicate — partial gate overrides', () => {
    it('applies only the overridden fields, keeps global defaults for the rest', async () => {
        const overrides = new Map();
        overrides.set('kb-ingestion', {
            embeddingThreshold: 0.95,
            // wordOverlapThreshold NOT overridden — should use global 0.70
        });
        mockCachedLoader.get.mockResolvedValue(overrides);

        // Node with no embedding — forces word overlap path
        mockQuery.mockResolvedValue([
            {
                id: 'n1',
                content: 'quantum entanglement physics research methodology advanced experimental results',
                embedding: null,
            },
        ]);

        // Word overlap should use the global threshold (0.70), not be undefined
        const result = await checkDuplicate(
            'quantum entanglement physics research methodology advanced experimental results today',
            null,
            'domain',
            'kb-ingestion',
        );

        // Word overlap >= 0.70 (global default) should detect duplicate
        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Word overlap');
    });
});

// =============================================================================
// checkDuplicate — no existing nodes returns not duplicate
// =============================================================================

describe('checkDuplicate — empty domain', () => {
    it('returns not duplicate when domain has no nodes', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await checkDuplicate('new content', [0.1, 0.2], 'empty-domain');

        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0);
    });
});

// =============================================================================
// handleDedup — non-dry-run archives nodes and calls logDecision
// =============================================================================

describe('handleDedup — non-dry-run archival flow', () => {
    it('archives nodes and calls logDecision with correct weight formatting', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'kept', content: 'kept node content here', weight: 2.5, domain: 'dom', embedding: emb },
                { id: 'dup', content: 'duplicate node content', weight: 1.3, domain: 'dom', embedding: emb },
            ])
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValue([]);    // archive + logDecision

        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await handleDedup({ domain: 'dom', dryRun: false });

        expect(result.totalNodesArchived).toBe(1);
        expect(result.dryRun).toBe(false);

        // Check archive query
        const archiveCalls = (mockQuery.mock.calls as any[]).filter(
            ([sql]: any[]) => typeof sql === 'string' && sql.includes('UPDATE nodes SET archived')
        );
        expect(archiveCalls).toHaveLength(1);
        expect(archiveCalls[0][1]).toEqual(['dup']);

        // Check logDecision
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'dup', 'archived', 'false', 'true',
            'system', 'dedup',
            expect.stringContaining('2.50'),
        );

        // Cache should be invalidated
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('dom');
    });
});

// =============================================================================
// handleDedup — uses default config thresholds when params not specified
// =============================================================================

describe('handleDedup — default params', () => {
    it('uses appConfig thresholds when no params provided', async () => {
        mockConfig.dedup.embeddingSimilarityThreshold = 0.90;
        mockConfig.dedup.wordOverlapThreshold = 0.80;

        mockQuery.mockResolvedValueOnce([]); // no nodes in domain

        const result = await handleDedup({ domain: 'test' });

        expect(result.thresholds.embedding).toBe(0.90);
        expect(result.thresholds.wordOverlap).toBe(0.80);
        expect(result.dryRun).toBe(false); // default
    });
});

// =============================================================================
// askLlmJudge — resolves number variable content before LLM call
// =============================================================================

describe('checkDuplicate — number variable resolution in LLM judge', () => {
    it('resolves content placeholders before sending to LLM judge', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'value is [[[SBKR1]]]', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.80); // In doubt zone
        mockCallSubsystemModel.mockResolvedValue('NOVEL\nDifferent');
        mockResolveContent.mockImplementation(async (s) =>
            s.replace('[[[SBKR1]]]', '42')
        );

        await checkDuplicate('value is [[[SBKR2]]]', [0.5, 0.5], 'domain', 'synthesis');

        // resolveContent should have been called for both existing and new content
        expect(mockResolveContent).toHaveBeenCalledTimes(2);
        expect(mockResolveContent).toHaveBeenCalledWith('value is [[[SBKR1]]]');
        expect(mockResolveContent).toHaveBeenCalledWith('value is [[[SBKR2]]]');
    });
});

// =============================================================================
// askLlmJudge — consultant review outside doubt zone (not triggered)
// =============================================================================

describe('checkDuplicate — consultant review boundary', () => {
    it('does not trigger consultant when similarity is far from consultant threshold', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.consultantReview = {
            enabled: true,
            thresholds: { dedup_judge: 0.90 },
        };

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        // 0.76 is in LLM doubt zone (>=0.75) but far from consultant threshold (0.90)
        // |0.76 - 0.90| = 0.14 > 0.075
        mockCosineSimilarity.mockReturnValue(0.76);
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame stuff');

        await checkDuplicate('new stuff', [0.5, 0.5], 'domain', 'synthesis');

        // Consultant should NOT have been called
        expect(mockConsultantReview).not.toHaveBeenCalled();
    });
});

// =============================================================================
// askLlmJudge — consultant review with default threshold
// =============================================================================

describe('checkDuplicate — consultant uses default threshold when not configured', () => {
    it('uses default dedup_judge threshold of 0.75 when not specified in config', async () => {
        mockConfig.dedup.llmJudgeEnabled = true;
        mockConfig.consultantReview = {
            enabled: true,
            // No thresholds object at all
        };

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content', embedding: emb },
        ]);
        // Default threshold is 0.75. |0.76 - 0.75| = 0.01 <= 0.075 => consultant triggers
        mockCosineSimilarity.mockReturnValue(0.76);
        mockCallSubsystemModel.mockResolvedValue('DUPLICATE\nSame');
        mockConsultantReview.mockResolvedValue({ accept: true, reasoning: 'Agree' });

        await checkDuplicate('new', [0.5, 0.5], 'domain', 'synthesis');

        expect(mockConsultantReview).toHaveBeenCalled();
    });
});
