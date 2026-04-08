/**
 * Unit tests for handlers/dedup.ts —
 * handleDedup and checkDuplicate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    logDecision: mockLogDecision,
}));

const mockConfig = {
    dedup: {
        embeddingSimilarityThreshold: 0.90,
        wordOverlapThreshold: 0.85,
        maxNodesPerDomain: 1000,
        minWordLength: 3,
        llmJudgeEnabled: false,
        llmJudgeDoubtFloor: 0.80,
        llmJudgeHardCeiling: 0.97,
        attractorWeightDecay: 0.01,
        attractorThreshold: 30,
    },
    consultantReview: {
        enabled: false,
        thresholds: {},
    },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0);
const mockInvalidateKnowledgeCache = jest.fn<() => void>();

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const mockCacheGet = jest.fn<() => Promise<Map<string, any>>>().mockResolvedValue(new Map());
const mockCacheInvalidate = jest.fn<() => void>();

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
    createCachedLoader: (_fn: any) => ({
        get: mockCacheGet,
        invalidate: mockCacheInvalidate,
    }),
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: jest.fn<() => Promise<string>>().mockResolvedValue('prompt'),
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: (s: string) => Promise.resolve(s),
}));

const { handleDedup, checkDuplicate } = await import('../../handlers/dedup.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockLogDecision.mockResolvedValue(undefined);
    mockCosineSimilarity.mockReturnValue(0);
    mockCacheGet.mockResolvedValue(new Map());
    mockInvalidateKnowledgeCache.mockReset();
    mockEmitActivity.mockReset();
});

// =============================================================================
// handleDedup
// =============================================================================

describe('handleDedup', () => {
    it('returns dryRun=true and zero results when no domains', async () => {
        mockQuery.mockResolvedValue([]); // no distinct domains

        const result = await handleDedup({ dryRun: true });

        expect(result.dryRun).toBe(true);
        expect(result.totalNodesArchived).toBe(0);
        expect(result.results).toEqual([]);
    });

    it('uses provided domain directly', async () => {
        // Call 1: nodes for the domain (< 2 → skipped)
        mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'a', weight: 1, domain: 'science', embedding: null }]);

        const result = await handleDedup({ domain: 'science', dryRun: true });

        expect(result.domainsProcessed).toBe(1);
        // Only 1 node → no clusters
        expect(result.totalClustersFound).toBe(0);
    });

    it('skips domains with fewer than 2 nodes', async () => {
        // distinct domains query
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        // nodes for science (only 1)
        mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'a', weight: 1, domain: 'science', embedding: null }]);

        const result = await handleDedup({ dryRun: true });

        expect(result.results).toHaveLength(0);
    });

    it('reports clusters found in dry run without archiving', async () => {
        // domains query
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        // nodes for science (2 nodes)
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'the quick brown fox', weight: 2, domain: 'science', embedding: null },
            { id: 'n2', content: 'the quick brown fox', weight: 1, domain: 'science', embedding: null },
        ]);
        // edges query
        mockQuery.mockResolvedValueOnce([]);
        // word overlap will be 1.0 for identical content → cluster found
        // no additional DB calls for dry run

        const result = await handleDedup({ dryRun: true });

        expect(result.totalClustersFound).toBe(1);
        expect(result.totalNodesArchived).toBe(1);
        // dry run: no UPDATE calls
        expect(mockLogDecision).not.toHaveBeenCalled();
    });

    it('archives nodes when dryRun=false', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'the quick brown fox jumped', weight: 2, domain: 'science', embedding: null },
            { id: 'n2', content: 'the quick brown fox jumped', weight: 1, domain: 'science', embedding: null },
        ]);
        mockQuery.mockResolvedValueOnce([]); // edges
        mockQuery.mockResolvedValue([]); // UPDATE calls

        const result = await handleDedup({ dryRun: false });

        expect(result.totalNodesArchived).toBe(1);
        expect(mockLogDecision).toHaveBeenCalled();
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
    });

    it('does not invalidate cache when no nodes archived', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        // Only 1 node → no clusters
        mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'a', weight: 1, domain: 'science', embedding: null }]);

        await handleDedup({ dryRun: false });

        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });

    it('respects custom thresholds passed as params', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'hello world test', weight: 2, domain: 'science', embedding: null },
            { id: 'n2', content: 'hello world test', weight: 1, domain: 'science', embedding: null },
        ]);
        mockQuery.mockResolvedValueOnce([]); // edges

        const result = await handleDedup({ dryRun: true, wordOverlapThreshold: 0.99 });

        // With 0.99 threshold, word overlap of "hello world test" vs itself = 1.0 → still duplicate
        expect(result.thresholds.wordOverlap).toBe(0.99);
    });

    it('excludes parent-child lineage pairs from clustering', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'the quick brown fox', weight: 2, domain: 'science', embedding: null },
            { id: 'n2', content: 'the quick brown fox', weight: 1, domain: 'science', embedding: null },
        ]);
        // Edge: n1 → n2 (parent-child) → they should NOT cluster
        mockQuery.mockResolvedValueOnce([{ source_id: 'n1', target_id: 'n2' }]);

        const result = await handleDedup({ dryRun: true });

        // No clusters found (both pairs excluded by lineage), so domain is skipped entirely
        expect(result.totalClustersFound).toBe(0);
        expect(result.results).toHaveLength(0);
    });
});

// =============================================================================
// checkDuplicate
// =============================================================================

describe('checkDuplicate', () => {
    it('returns isDuplicate=false when no domain', async () => {
        const result = await checkDuplicate('content', null, null);

        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0);
    });

    it('returns isDuplicate=false when no existing nodes', async () => {
        mockQuery.mockResolvedValue([]); // no existing nodes

        const result = await checkDuplicate('content', null, 'science');

        expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate=false when similarity below thresholds', async () => {
        mockQuery.mockResolvedValue([
            // Use content with no overlapping long words
            { id: 'n1', content: 'tiger zebra elephant rhinoceros', embedding: JSON.stringify([0.1, 0.2]) },
        ]);
        mockCosineSimilarity.mockReturnValue(0.5); // below 0.90 threshold

        const result = await checkDuplicate('apple banana cherry strawberry', [0.9, 0.8], 'science');

        expect(result.isDuplicate).toBe(false);
    });

    it('returns isDuplicate=true when embedding hits hard ceiling', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content here', embedding: JSON.stringify([1, 0]) },
        ]);
        mockCosineSimilarity.mockReturnValue(0.98); // >= 0.97 hard ceiling

        const result = await checkDuplicate('new content', [1, 0], 'science');

        expect(result.isDuplicate).toBe(true);
        expect(result.matchedNodeId).toBe('n1');
        expect(result.reason).toContain('hard ceiling');
    });

    it('returns isDuplicate=true when word overlap exceeds threshold', async () => {
        // Use content with high word overlap
        const content = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
        mockQuery.mockResolvedValue([
            { id: 'n1', content, embedding: null }, // same content = 1.0 overlap
        ]);
        mockCosineSimilarity.mockReturnValue(0); // no embedding

        const result = await checkDuplicate(content, null, 'science');

        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Word overlap');
    });

    it('returns isDuplicate=true when embedding threshold met (not hard ceiling)', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing', embedding: JSON.stringify([1, 0]) },
        ]);
        mockCosineSimilarity.mockReturnValue(0.92); // >= 0.90 but < 0.97

        const result = await checkDuplicate('new', [1, 0], 'science');

        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Embedding similarity');
    });

    it('returns isDuplicate=false with no domain and null embedding', async () => {
        const result = await checkDuplicate('content', null, null);

        expect(result.isDuplicate).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
