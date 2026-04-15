/**
 * Unit tests for handlers/dedup.ts —
 * checkDuplicate, handleDedup.
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

// Gate overrides loader — returns empty cache by default
const mockCachedLoader = {
    get: jest.fn<() => Promise<Map<string, any>>>().mockResolvedValue(new Map()),
    invalidate: jest.fn<() => void>(),
};
const mockCreateCachedLoader = jest.fn(() => mockCachedLoader);

const mockConfig = {
    dedup: {
        embeddingSimilarityThreshold: 0.82,
        wordOverlapThreshold: 0.70,
        minWordLength: 3,
        maxNodesPerDomain: 500,
        attractorThreshold: 30,
        attractorWeightDecay: 0.01,
        llmJudgeEnabled: false,      // disable LLM judge — avoids dynamic import
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

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
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

const { handleDedup, checkDuplicate } = await import('../../handlers/dedup.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockLogDecision.mockResolvedValue(undefined);
    mockCosineSimilarity.mockReturnValue(0);
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGetPrompt.mockResolvedValue('dedup prompt');
    mockResolveContent.mockImplementation(async (s) => s);
    mockCachedLoader.get.mockResolvedValue(new Map());
    mockCachedLoader.invalidate.mockReturnValue(undefined as any);
    mockCreateCachedLoader.mockReturnValue(mockCachedLoader as any);
});

// =============================================================================
// checkDuplicate
// =============================================================================

describe('checkDuplicate', () => {
    it('returns not-duplicate when no domain provided', async () => {
        const result = await checkDuplicate('some content', [0.1, 0.2], null);
        expect(result.isDuplicate).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns not-duplicate when no existing nodes', async () => {
        mockQuery.mockResolvedValue([]); // no nodes in domain

        const result = await checkDuplicate('unique content', [0.1, 0.2], 'science');
        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0);
    });

    it('detects duplicate via hard ceiling (immediate early return)', async () => {
        const storedEmb = '[0.9, 0.8, 0.7]';
        mockQuery.mockResolvedValue([
            { id: 'existing-1', content: 'existing content', embedding: storedEmb },
        ]);
        // Hard ceiling is 0.97 — return similarity above that
        mockCosineSimilarity.mockReturnValue(0.98);

        const result = await checkDuplicate(
            'near-copy content',
            [0.9, 0.8, 0.7],
            'science',
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.matchedNodeId).toBe('existing-1');
        expect(result.similarity).toBe(0.98);
        expect(result.reason).toContain('hard ceiling');
    });

    it('detects duplicate via embedding threshold (after scan)', async () => {
        const storedEmb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'existing-2', content: 'similar node', embedding: storedEmb },
        ]);
        // Above embeddingThreshold (0.82) but below hard ceiling (0.97)
        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await checkDuplicate(
            'similar content',
            [0.5, 0.5],
            'physics',
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.matchedNodeId).toBe('existing-2');
        expect(result.reason).toContain('0.82');
    });

    it('detects duplicate via word overlap', async () => {
        // No embedding on node — forces word overlap path
        mockQuery.mockResolvedValue([
            { id: 'existing-3', content: 'the quick brown fox jumped over the lazy dog', embedding: null },
        ]);

        const result = await checkDuplicate(
            'the quick brown fox jumped over the lazy dog and ran away',
            null, // no embedding
            'literature',
        );

        // Word overlap of this content should exceed 0.70 threshold
        // Both have many of the same long words
        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Word overlap');
    });

    it('returns not-duplicate when similarity below all thresholds', async () => {
        const storedEmb = '[0.1, 0.2]';
        mockQuery.mockResolvedValue([
            { id: 'existing-4', content: 'completely different topic', embedding: storedEmb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.30); // below 0.82 threshold

        const result = await checkDuplicate(
            'unrelated content about other stuff',
            [0.9, 0.1],
            'history',
        );

        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0.30);
    });

    it('queries nodes in the given domain', async () => {
        mockQuery.mockResolvedValue([]);
        await checkDuplicate('content', null, 'target-domain');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('domain = $1');
        expect(params[0]).toBe('target-domain');
    });
});

// =============================================================================
// handleDedup (dry run)
// =============================================================================

describe('handleDedup', () => {
    it('returns empty results when no domains have nodes', async () => {
        // First query: get distinct domains
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }])
            // Second query: nodes in domain
            .mockResolvedValueOnce([{ id: 'n1', content: 'only node', weight: 1.0, domain: 'science', embedding: null }])
            // edges
            .mockResolvedValueOnce([]);

        const result = await handleDedup({ dryRun: true });

        // Only 1 node — cluster needs 2+ to form
        expect(result.totalClustersFound).toBe(0);
        expect(result.totalNodesArchived).toBe(0);
        expect(result.dryRun).toBe(true);
    });

    it('reports clusters found in dry-run without archiving', async () => {
        // Two nodes that are similar (embedding cosine >= threshold)
        const emb1 = JSON.stringify([1, 0, 0]);
        const emb2 = JSON.stringify([1, 0, 0]);

        mockQuery
            .mockResolvedValueOnce([{ domain: 'science' }])       // distinct domains
            .mockResolvedValueOnce([                               // nodes in domain
                { id: 'n1', content: 'node one content', weight: 2.0, domain: 'science', embedding: emb1 },
                { id: 'n2', content: 'node two content', weight: 1.0, domain: 'science', embedding: emb2 },
            ])
            .mockResolvedValueOnce([]);                           // no edges

        // Simulate high similarity between nodes
        mockCosineSimilarity.mockReturnValue(0.95); // above 0.82 threshold but below 0.97 ceiling

        const result = await handleDedup({ dryRun: true });

        expect(result.totalClustersFound).toBe(1);
        // In dry run, nodesArchived reports what WOULD be archived (not 0)
        expect(result.totalNodesArchived).toBe(1);
        expect(result.dryRun).toBe(true);

        // No UPDATE queries should be issued in dry-run
        const updateCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE')
        );
        expect(updateCalls).toHaveLength(0);
    });

    it('archives duplicates when not dry-run', async () => {
        const emb = JSON.stringify([1, 0]);
        // When domain is specified, handleDedup skips the DISTINCT domains query
        // Call sequence: nodes → edges → UPDATE archived=1 → ...
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'high weight node', weight: 3.0, domain: 'tech', embedding: emb },
                { id: 'n2', content: 'low weight node', weight: 1.0, domain: 'tech', embedding: emb },
            ])
            .mockResolvedValueOnce([]) // no edges
            .mockResolvedValue([]);    // archive UPDATEs + logDecision

        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await handleDedup({ domain: 'tech', dryRun: false });

        expect(result.totalNodesArchived).toBe(1); // n2 archived (lower weight)

        const archiveCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('archived = 1')
        );
        expect(archiveCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('uses specific domain when provided (skips distinct domains query)', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // nodes query returns empty
            .mockResolvedValueOnce([]); // edge query

        await handleDedup({ domain: 'specific-domain', dryRun: true });

        // The first query should fetch nodes (not domains), since domain was specified
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('domain = $1');
        // Should NOT be a DISTINCT domain query
        expect(sql).not.toContain('DISTINCT domain');
    });

    it('excludes lineage pairs from clustering', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'bio' }])
            .mockResolvedValueOnce([
                { id: 'parent-1', content: 'parent node', weight: 2.0, domain: 'bio', embedding: emb },
                { id: 'child-1', content: 'child node', weight: 1.0, domain: 'bio', embedding: emb },
            ])
            .mockResolvedValueOnce([
                // parent-child edge between the two nodes
                { source_id: 'parent-1', target_id: 'child-1' },
            ]);

        mockCosineSimilarity.mockReturnValue(0.95);

        const result = await handleDedup({ dryRun: true });

        // Despite high similarity, the parent-child pair should not form a cluster
        // When no clusters found, the domain is skipped — results array is empty
        expect(result.totalClustersFound).toBe(0);
        expect(result.results).toHaveLength(0);
    });
});
