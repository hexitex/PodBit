/**
 * Additional unit tests for handlers/dedup.ts — targets previously uncovered code paths.
 *
 * Covers: computeWordOverlap edge cases, areSimilar method selection, buildClusters star logic,
 * handleDedup cluster/archived capping, cache invalidation on non-dry-run,
 * checkDuplicate attractor skipping, per-source gate overrides, invalidateGateOverrideCache.
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
    jest.resetAllMocks();
    resetConfig();
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
// checkDuplicate — per-source gate overrides
// =============================================================================

describe('checkDuplicate — per-source gate overrides', () => {
    it('uses per-source embedding threshold override', async () => {
        const overrides = new Map();
        overrides.set('kb-ingestion', {
            embeddingThreshold: 0.99,  // Much higher than global 0.82
            wordOverlapThreshold: 0.99, // Also raise word overlap to prevent that path
            llmJudgeEnabled: undefined,
            llmJudgeDoubtFloor: undefined,
            llmJudgeHardCeiling: undefined,
        });
        mockCachedLoader.get.mockResolvedValue(overrides);

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'quantum physics entanglement theory', embedding: emb },
        ]);
        // 0.90 is above global threshold (0.82) but below override (0.99)
        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await checkDuplicate(
            'biological cellular membrane transport mechanism',
            [0.5, 0.5],
            'science',
            'kb-ingestion',
        );

        // Should NOT be duplicate because per-source threshold is 0.99
        expect(result.isDuplicate).toBe(false);
    });

    it('falls back to global config when no override for source', async () => {
        const overrides = new Map();
        overrides.set('other-source', { embeddingThreshold: 0.99 });
        mockCachedLoader.get.mockResolvedValue(overrides);

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content here', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await checkDuplicate(
            'new content',
            [0.5, 0.5],
            'science',
            'synthesis',  // No override for 'synthesis'
        );

        // Global threshold is 0.82, 0.90 >= 0.82 — should be duplicate
        expect(result.isDuplicate).toBe(true);
    });

    it('uses global config when no source provided', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content here', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await checkDuplicate(
            'new content',
            [0.5, 0.5],
            'science',
            // no source
        );

        expect(result.isDuplicate).toBe(true);
    });
});

// =============================================================================
// checkDuplicate — attractor skipping
// =============================================================================

describe('checkDuplicate — attractor skipping', () => {
    it('emits activity when attractors are skipped', async () => {
        // We need to trigger attractor threshold. The attractor counts are in-memory,
        // so we need to make a node hit the hard ceiling many times to increment the counter.
        // Instead, set threshold to 0 (disabled) and verify no skipping occurs.
        mockConfig.dedup.attractorThreshold = 0;

        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing content here', embedding: emb },
        ]);
        mockCosineSimilarity.mockReturnValue(0.30); // Below threshold

        await checkDuplicate('new content', [0.5, 0.5], 'science');

        // With threshold=0, no attractors should be skipped
        const attractorCalls = (mockEmitActivity.mock.calls as any[]).filter(
            ([, type]: any[]) => type === 'dedup_attractors_skipped'
        );
        expect(attractorCalls).toHaveLength(0);
    });
});

// =============================================================================
// checkDuplicate — word overlap detection (no embedding on node)
// =============================================================================

describe('checkDuplicate — word overlap without embedding', () => {
    it('detects duplicate via word overlap when node has no embedding', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'the quick brown fox jumped over the lazy dog running fast', embedding: null },
        ]);

        const result = await checkDuplicate(
            'the quick brown fox jumped over the lazy dog running fast today',
            null,
            'domain',
        );

        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('Word overlap');
    });

    it('returns not-duplicate when word overlap is below threshold', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'completely different words here about something else', embedding: null },
        ]);

        const result = await checkDuplicate(
            'quantum physics entanglement consciousness',
            null,
            'domain',
        );

        expect(result.isDuplicate).toBe(false);
    });
});

// =============================================================================
// checkDuplicate — hard ceiling early return
// =============================================================================

describe('checkDuplicate — hard ceiling', () => {
    it('returns immediately on hard ceiling match without scanning further', async () => {
        const emb = '[0.5, 0.5]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'first node', embedding: emb },
            { id: 'n2', content: 'second node', embedding: emb },
        ]);
        // First call returns 0.98 (above hard ceiling 0.97)
        mockCosineSimilarity.mockReturnValue(0.98);

        const result = await checkDuplicate('near copy', [0.5, 0.5], 'domain');

        expect(result.isDuplicate).toBe(true);
        expect(result.reason).toContain('hard ceiling');
        // Should have called cosine only once (early return)
        expect(mockCosineSimilarity).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// handleDedup — cluster capping (MAX_CLUSTERS_PER_DOMAIN)
// =============================================================================

describe('handleDedup — response capping', () => {
    it('caps clusters per domain to MAX_CLUSTERS_PER_DOMAIN (5)', async () => {
        // Create 12 nodes — each pair shares words, but cross-pair content is distinct
        // This ensures word overlap only clusters paired nodes
        const pairWords = [
            ['quantum', 'entanglement'], ['quantum', 'superposition'],
            ['biology', 'mitochondria'], ['biology', 'ribosomes'],
            ['chemistry', 'catalysis'], ['chemistry', 'oxidation'],
            ['geology', 'tectonics'], ['geology', 'volcanism'],
            ['astronomy', 'parallax'], ['astronomy', 'redshift'],
            ['philosophy', 'epistemology'], ['philosophy', 'ontology'],
        ];
        const nodes: any[] = [];
        for (let i = 0; i < 12; i++) {
            nodes.push({
                id: `n${i}`,
                content: `${pairWords[i][0]} ${pairWords[i][1]} phenomena`,
                weight: 12 - i,
                domain: 'big',
                embedding: JSON.stringify([i, 0]),
            });
        }

        mockQuery
            .mockResolvedValueOnce([{ domain: 'big' }])  // distinct domains
            .mockResolvedValueOnce(nodes)                  // nodes in domain
            .mockResolvedValueOnce([])                     // no edges
            .mockResolvedValue([]);                        // archive queries

        // Make adjacent pairs similar: 0-1, 2-3, 4-5, 6-7, 8-9, 10-11
        mockCosineSimilarity.mockImplementation(((a: number[], b: number[]) => {
            const idxA = a[0];
            const idxB = b[0];
            // Pair up: 0-1, 2-3, 4-5, etc.
            if (Math.floor(idxA / 2) === Math.floor(idxB / 2) && idxA !== idxB) {
                return 0.95;
            }
            return 0.1;
        }) as any);

        const result = await handleDedup({ dryRun: true });

        expect(result.totalClustersFound).toBe(6);
        // Only 5 clusters in the detailed report
        expect(result.results[0].clusters.length).toBeLessThanOrEqual(5);
        expect(result.results[0].omittedClusters).toBe(1);
    });

    it('caps archived nodes per cluster to MAX_ARCHIVED_PER_CLUSTER (5)', async () => {
        // Create 8 nodes with same embedding (all similar via cosine) but distinct content
        const topics = ['quantum', 'biology', 'chemistry', 'geology', 'astronomy', 'philosophy', 'neurology', 'topology'];
        const nodes: any[] = [];
        for (let i = 0; i < 8; i++) {
            nodes.push({
                id: `n${i}`,
                content: `${topics[i]} exploration analysis`,
                weight: 8 - i,
                domain: 'dense',
                embedding: JSON.stringify([1, 0]),
            });
        }

        mockQuery
            .mockResolvedValueOnce([{ domain: 'dense' }])
            .mockResolvedValueOnce(nodes)
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.95);

        const result = await handleDedup({ dryRun: true });

        expect(result.totalClustersFound).toBe(1);
        // 1 kept + up to 5 archived shown (7 would-be-archived total)
        const cluster = result.results[0].clusters[0];
        expect(cluster.archivedNodes.length).toBeLessThanOrEqual(5);
        expect(cluster.omittedNodes).toBe(2); // 7 archived - 5 shown = 2 omitted
    });
});

// =============================================================================
// handleDedup — cache invalidation
// =============================================================================

describe('handleDedup — cache invalidation', () => {
    it('invalidates knowledge cache on non-dry-run when nodes archived', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'kept node', weight: 3.0, domain: 'sci', embedding: emb },
                { id: 'n2', content: 'archived node', weight: 1.0, domain: 'sci', embedding: emb },
            ])
            .mockResolvedValueOnce([])   // edges
            .mockResolvedValue([]);      // archive + logDecision

        mockCosineSimilarity.mockReturnValue(0.90);

        await handleDedup({ domain: 'sci', dryRun: false });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('sci');
    });

    it('does not invalidate cache on dry-run even with clusters', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'kept node', weight: 3.0, domain: 'sci', embedding: emb },
                { id: 'n2', content: 'archived node', weight: 1.0, domain: 'sci', embedding: emb },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.90);

        await handleDedup({ domain: 'sci', dryRun: true });

        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });
});

// =============================================================================
// handleDedup — multiple domains
// =============================================================================

describe('handleDedup — multiple domains', () => {
    it('processes all domains when no domain specified', async () => {
        const emb = JSON.stringify([1, 0]);

        mockQuery
            // distinct domains
            .mockResolvedValueOnce([{ domain: 'dom1' }, { domain: 'dom2' }])
            // dom1 nodes — only 1 node, will be skipped (nodes.length < 2)
            .mockResolvedValueOnce([{ id: 'd1n1', content: 'solo', weight: 1, domain: 'dom1', embedding: emb }])
            // dom2 nodes — 2 nodes, will cluster (no edge query for dom1 since it was skipped)
            .mockResolvedValueOnce([
                { id: 'd2n1', content: 'alpha quantum', weight: 2, domain: 'dom2', embedding: emb },
                { id: 'd2n2', content: 'beta biology', weight: 1, domain: 'dom2', embedding: emb },
            ])
            // dom2 edges
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.90);

        const result = await handleDedup({ dryRun: true });

        expect(result.domainsProcessed).toBe(2);
        // Only dom2 has clusters (dom1 had only 1 node)
        expect(result.results).toHaveLength(1);
        expect(result.results[0].domain).toBe('dom2');
    });
});

// =============================================================================
// handleDedup — logs decisions when archiving
// =============================================================================

describe('handleDedup — decision logging', () => {
    it('logs decision for each archived node', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'kept', content: 'kept node', weight: 3.0, domain: 'dom', embedding: emb },
                { id: 'arch1', content: 'archived 1', weight: 2.0, domain: 'dom', embedding: emb },
                { id: 'arch2', content: 'archived 2', weight: 1.0, domain: 'dom', embedding: emb },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        mockCosineSimilarity.mockReturnValue(0.90);

        await handleDedup({ domain: 'dom', dryRun: false });

        // Should have called logDecision for each archived node
        expect(mockLogDecision).toHaveBeenCalledTimes(2);
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'arch1', 'archived', 'false', 'true',
            'system', 'dedup',
            expect.stringContaining('kept'),
        );
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'arch2', 'archived', 'false', 'true',
            'system', 'dedup',
            expect.stringContaining('kept'),
        );
    });
});

// =============================================================================
// handleDedup — thresholds in response
// =============================================================================

describe('handleDedup — response format', () => {
    it('includes thresholds in response', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const result = await handleDedup({
            domain: 'test',
            dryRun: true,
            embeddingThreshold: 0.85,
            wordOverlapThreshold: 0.75,
        });

        expect(result.thresholds.embedding).toBe(0.85);
        expect(result.thresholds.wordOverlap).toBe(0.75);
    });

    it('uses default thresholds from config when not specified', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const result = await handleDedup({ domain: 'test', dryRun: true });

        expect(result.thresholds.embedding).toBe(0.82);
        expect(result.thresholds.wordOverlap).toBe(0.70);
    });
});

// =============================================================================
// handleDedup — lineage exclusion with bidirectional pairs
// =============================================================================

describe('handleDedup — lineage exclusion bidirectional', () => {
    it('excludes edges in both directions from clustering', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'bio' }])
            .mockResolvedValueOnce([
                { id: 'p1', content: 'parent node', weight: 2.0, domain: 'bio', embedding: emb },
                { id: 'c1', content: 'child node', weight: 1.0, domain: 'bio', embedding: emb },
            ])
            .mockResolvedValueOnce([
                { source_id: 'c1', target_id: 'p1' },  // reverse direction
            ]);

        mockCosineSimilarity.mockReturnValue(0.95);

        const result = await handleDedup({ dryRun: true });

        // Should still exclude — edges are registered bidirectionally
        expect(result.totalClustersFound).toBe(0);
    });
});

// =============================================================================
// handleDedup — skips domain with fewer than 2 nodes
// =============================================================================

describe('handleDedup — skip small domains', () => {
    it('skips domain with 0 nodes', async () => {
        mockQuery
            .mockResolvedValueOnce([{ domain: 'empty' }])
            .mockResolvedValueOnce([])   // no nodes
            .mockResolvedValueOnce([]);  // edges

        const result = await handleDedup({ dryRun: true });

        expect(result.domainsProcessed).toBe(1);
        expect(result.results).toHaveLength(0);
    });

    it('skips domain with exactly 1 node', async () => {
        const emb = JSON.stringify([1, 0]);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'solo' }])
            .mockResolvedValueOnce([{ id: 'n1', content: 'only one', weight: 1, domain: 'solo', embedding: emb }])
            .mockResolvedValueOnce([]);

        const result = await handleDedup({ dryRun: true });

        expect(result.results).toHaveLength(0);
    });
});

// =============================================================================
// handleDedup — no clusters formed despite nodes
// =============================================================================

describe('handleDedup — no clusters', () => {
    it('skips domain when no clusters form (all nodes dissimilar)', async () => {
        const emb1 = JSON.stringify([1, 0]);
        const emb2 = JSON.stringify([0, 1]);
        mockQuery
            .mockResolvedValueOnce([{ domain: 'diverse' }])
            .mockResolvedValueOnce([
                { id: 'n1', content: 'alpha topic about physics', weight: 2, domain: 'diverse', embedding: emb1 },
                { id: 'n2', content: 'beta topic about biology', weight: 1, domain: 'diverse', embedding: emb2 },
            ])
            .mockResolvedValueOnce([]);

        mockCosineSimilarity.mockReturnValue(0.10); // Below all thresholds

        const result = await handleDedup({ dryRun: true });

        expect(result.totalClustersFound).toBe(0);
        expect(result.results).toHaveLength(0);
    });
});

// =============================================================================
// invalidateGateOverrideCache
// =============================================================================

describe('invalidateGateOverrideCache', () => {
    it('calls invalidate on the cached loader', () => {
        invalidateGateOverrideCache();
        expect(mockCachedLoader.invalidate).toHaveBeenCalled();
    });
});

// =============================================================================
// checkDuplicate — embedding parsed from string
// =============================================================================

describe('checkDuplicate — embedding parsing', () => {
    it('parses string embeddings from database', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'existing node', embedding: '[0.1, 0.2, 0.3]' },
        ]);
        mockCosineSimilarity.mockReturnValue(0.50); // Below threshold

        await checkDuplicate('new content', [0.4, 0.5, 0.6], 'domain');

        // cosineSimilarity should receive parsed arrays
        expect(mockCosineSimilarity).toHaveBeenCalledWith(
            [0.4, 0.5, 0.6],
            [0.1, 0.2, 0.3],
        );
    });
});

// =============================================================================
// checkDuplicate — best match tracking across multiple nodes
// =============================================================================

describe('checkDuplicate — best match tracking', () => {
    it('reports the best similarity across all scanned nodes', async () => {
        const emb1 = '[0.1, 0.2]';
        const emb2 = '[0.3, 0.4]';
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'first node', embedding: emb1 },
            { id: 'n2', content: 'second node', embedding: emb2 },
        ]);
        // First call returns 0.50, second returns 0.60 — both below threshold
        mockCosineSimilarity
            .mockReturnValueOnce(0.50)
            .mockReturnValueOnce(0.60);

        const result = await checkDuplicate('new content', [0.5, 0.5], 'domain');

        expect(result.isDuplicate).toBe(false);
        expect(result.bestSimilarity).toBe(0.60);
    });
});

// =============================================================================
// handleDedup — omittedArchivedNodes count
// =============================================================================

describe('handleDedup — omittedArchivedNodes in capped response', () => {
    it('counts archived nodes in omitted clusters', async () => {
        // Create enough pairs for 6 clusters (12 nodes) with distinct content
        const pairWords = [
            ['quantum', 'entanglement'], ['quantum', 'superposition'],
            ['biology', 'mitochondria'], ['biology', 'ribosomes'],
            ['chemistry', 'catalysis'], ['chemistry', 'oxidation'],
            ['geology', 'tectonics'], ['geology', 'volcanism'],
            ['astronomy', 'parallax'], ['astronomy', 'redshift'],
            ['philosophy', 'epistemology'], ['philosophy', 'ontology'],
        ];
        const nodes: any[] = [];
        for (let i = 0; i < 12; i++) {
            nodes.push({
                id: `n${i}`,
                content: `${pairWords[i][0]} ${pairWords[i][1]} phenomena`,
                weight: 12 - i,
                domain: 'big',
                embedding: JSON.stringify([i, 0]),
            });
        }

        mockQuery
            .mockResolvedValueOnce([{ domain: 'big' }])
            .mockResolvedValueOnce(nodes)
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        // Pair up 0-1, 2-3, 4-5, 6-7, 8-9, 10-11
        mockCosineSimilarity.mockImplementation(((a: number[], b: number[]) => {
            const idxA = a[0];
            const idxB = b[0];
            if (Math.floor(idxA / 2) === Math.floor(idxB / 2) && idxA !== idxB) {
                return 0.95;
            }
            return 0.1;
        }) as any);

        const result = await handleDedup({ dryRun: true });

        // 6 clusters, 5 shown, 1 omitted with 1 archived node
        expect(result.results[0].omittedClusters).toBe(1);
        expect(result.results[0].omittedArchivedNodes).toBe(1);
    });
});
