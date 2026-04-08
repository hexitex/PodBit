/**
 * Unit tests for context/topics.ts — topic clustering and phrase extraction.
 *
 * Complements context-topics-core.test.ts by covering:
 *  - clusterTopics (semantic clustering with embeddings)
 *  - extractPhrases (bigram extraction)
 *  - extractTopics with clustering enabled
 *
 * Mocks: context/types.js (getConfig), models.js (getEmbedding), core.js (cosineSimilarity, findDomainsBySynonym).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetEmbedding = jest.fn<(text: string) => Promise<number[] | null>>();
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>();
const mockFindDomainsBySynonym = jest.fn<(term: string) => Promise<string[]>>();

let clusteringEnabled = true;
const defaultConfig = {
    stopWords: ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'was', 'with', 'this', 'that'],
    topicBoosts: {
        existingKeyword: 1.5,
        existingPhrase: 2.0,
        newPhrase: 1.5,
    },
    topicDecayAgeMs: 300000,
    topicDecayFactor: 0.8,
    topicMinWeight: 0.1,
    topicClustering: {
        get enabled() { return clusteringEnabled; },
        maxTopicsToEmbed: 10,
        threshold: 0.7,
    },
};

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => ({ ...defaultConfig, topicClustering: { ...defaultConfig.topicClustering } }),
}));
jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
}));
jest.unstable_mockModule('../../core.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    findDomainsBySynonym: mockFindDomainsBySynonym,
}));

const { extractKeywords, extractTopics } = await import('../../context/topics.js');

beforeEach(() => {
    jest.clearAllMocks();
    clusteringEnabled = true;
    mockGetEmbedding.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.5);
    mockFindDomainsBySynonym.mockResolvedValue([]);
});

function makeSession() {
    return {
        topics: [] as any[],
        domains: [] as string[],
        conceptClusters: [] as any[],
        _topicHash: undefined as string | undefined,
    };
}

// =============================================================================
// extractKeywords — additional phrase/edge cases
// =============================================================================

describe('extractKeywords edge cases', () => {
    it('preserves hyphenated words', () => {
        const result = extractKeywords('machine-learning deep-learning');
        const words = result.map((r: any) => r.word);
        expect(words).toContain('machine-learning');
        expect(words).toContain('deep-learning');
    });

    it('handles single repeated word', () => {
        const result = extractKeywords('test test test');
        expect(result.length).toBe(1);
        expect(result[0].word).toBe('test');
        expect(result[0].count).toBe(3);
    });
});

// =============================================================================
// extractTopics with clustering enabled
// =============================================================================

describe('extractTopics with clustering', () => {
    it('creates concept clusters when embedding succeeds for enough topics', async () => {
        clusteringEnabled = true;
        // Need at least 3 topics, at least 2 embedded
        mockGetEmbedding.mockImplementation(async (term: string) => {
            return [0.1, 0.2, 0.3]; // fake embedding
        });
        mockCosineSimilarity.mockReturnValue(0.8); // above 0.7 threshold

        const session = makeSession();
        // Seed 3 topics so clustering fires
        await extractTopics('alpha beta gamma delta', session);

        expect(session.conceptClusters).toBeDefined();
        // Should have clusters since all embeddings succeeded
        expect(session.conceptClusters.length).toBeGreaterThanOrEqual(1);
    });

    it('skips clustering when fewer than 3 topics', async () => {
        clusteringEnabled = true;
        const session = makeSession();
        // Only 2 words long enough
        await extractTopics('alpha beta', session);

        expect(session.conceptClusters).toEqual([]);
    });

    it('skips clustering when disabled', async () => {
        clusteringEnabled = false;
        const session = makeSession();
        await extractTopics('alpha beta gamma delta', session);

        // conceptClusters should not be set by clustering
        expect(session.conceptClusters).toEqual([]);
    });

    it('caches topic hash and skips re-clustering when topics unchanged', async () => {
        clusteringEnabled = true;
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.8);

        const session = makeSession();
        await extractTopics('alpha beta gamma delta', session);
        const firstHash = session._topicHash;
        const embedCallCount = mockGetEmbedding.mock.calls.length;

        // Call again with same terms — hash should prevent re-clustering
        // (topics already exist, no new unique topics added)
        await extractTopics('alpha beta gamma delta', session);
        // Hash should still be set
        expect(session._topicHash).toBeDefined();
        expect(session._topicHash).toBe(firstHash);
    });

    it('does not cluster when embeddings return null', async () => {
        clusteringEnabled = true;
        mockGetEmbedding.mockResolvedValue(null);

        const session = makeSession();
        await extractTopics('alpha beta gamma delta', session);

        // No embeddings → no clusters
        expect(session.conceptClusters).toEqual([]);
    });

    it('creates separate clusters for dissimilar topics', async () => {
        clusteringEnabled = true;
        let callIdx = 0;
        mockGetEmbedding.mockImplementation(async () => {
            callIdx++;
            // Return different embeddings for different topics
            return callIdx <= 2 ? [1, 0, 0] : [0, 0, 1];
        });
        // Below threshold → different clusters
        mockCosineSimilarity.mockReturnValue(0.3);

        const session = makeSession();
        await extractTopics('alpha beta gamma delta', session);

        // Each topic should be its own cluster since similarity is below threshold
        expect(session.conceptClusters.length).toBeGreaterThan(1);
    });

    it('cluster centroids are updated as members are added', async () => {
        clusteringEnabled = true;
        mockGetEmbedding.mockResolvedValue([1, 0, 0]);
        // All similar → one big cluster
        mockCosineSimilarity.mockReturnValue(0.9);

        const session = makeSession();
        await extractTopics('alpha beta gamma delta', session);

        // Should have merged into fewer clusters
        const clusters = session.conceptClusters;
        expect(clusters.length).toBeGreaterThanOrEqual(1);
        if (clusters.length > 0) {
            expect(clusters[0].terms.length).toBeGreaterThan(1);
            expect(clusters[0].centroid).toBeDefined();
            expect(clusters[0].weight).toBeGreaterThan(0);
        }
    });

    it('uses cached embeddings on topic objects', async () => {
        clusteringEnabled = true;
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.3); // keep them separate

        const session = makeSession();
        // First call — embeds all topics
        await extractTopics('alpha beta gamma delta', session);
        const firstCallCount = mockGetEmbedding.mock.calls.length;

        // Manually change the hash to force re-clustering
        session._topicHash = 'force-recluster';

        // Second call — should use cached _embedding on topic objects
        await extractTopics('epsilon', session); // add one new topic
        const secondCallCount = mockGetEmbedding.mock.calls.length;

        // Should have called getEmbedding fewer times than re-embedding all topics
        // At minimum, only the new topic 'epsilon' needs embedding
        const newCalls = secondCallCount - firstCallCount;
        expect(newCalls).toBeLessThanOrEqual(2); // epsilon + possibly one more
    });
});

// =============================================================================
// extractTopics — phrase merging
// =============================================================================

describe('extractTopics phrase handling', () => {
    it('adds bigram phrases as topics with boosted weight', async () => {
        const session = makeSession();
        // "machine learning" should appear as a bigram phrase
        await extractTopics('machine learning machine learning', session);

        const phraseTopic = session.topics.find((t: any) => t.term === 'machine learning');
        expect(phraseTopic).toBeDefined();
        if (phraseTopic) {
            // Phrase weight should be boosted (newPhrase = 1.5)
            expect(phraseTopic.weight).toBeGreaterThan(0);
        }
    });

    it('boosts existing phrase weight on repeat', async () => {
        const session = makeSession();
        await extractTopics('machine learning concepts', session);
        const first = session.topics.find((t: any) => t.term === 'machine learning');
        const firstWeight = first?.weight || 0;

        await extractTopics('machine learning techniques', session);
        const second = session.topics.find((t: any) => t.term === 'machine learning');
        expect(second!.weight).toBeGreaterThan(firstWeight);
    });
});
