/**
 * Unit tests for context/topics.ts — keyword/phrase extraction, topic management, and clustering.
 *
 * Mocks: context/types.js (getConfig), models.js (getEmbedding), core.js (cosineSimilarity, findDomainsBySynonym).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetEmbedding = jest.fn<(text: string) => Promise<number[] | null>>().mockResolvedValue(null);
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0.5);
const mockFindDomainsBySynonym = jest.fn<(term: string) => Promise<string[]>>().mockResolvedValue([]);

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
        enabled: false,
        maxTopicsToEmbed: 10,
        threshold: 0.7,
    },
};

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => ({ ...defaultConfig }),
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
    jest.resetAllMocks();
    mockGetEmbedding.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.5);
    mockFindDomainsBySynonym.mockResolvedValue([]);
});

// =============================================================================
// extractKeywords
// =============================================================================

describe('extractKeywords', () => {
    it('returns empty array for empty string', () => {
        expect(extractKeywords('')).toEqual([]);
    });

    it('returns empty array for null/undefined', () => {
        expect(extractKeywords(null as any)).toEqual([]);
    });

    it('extracts keywords from text', () => {
        const result = extractKeywords('quantum computing uses quantum mechanics');
        const words = result.map((r: any) => r.word);
        expect(words).toContain('quantum');
        expect(words).toContain('computing');
        expect(words).toContain('mechanics');
    });

    it('filters stop words', () => {
        const result = extractKeywords('the quick brown fox and the lazy dog');
        const words = result.map((r: any) => r.word);
        expect(words).not.toContain('the');
        expect(words).not.toContain('and');
    });

    it('filters short words (< 3 chars)', () => {
        const result = extractKeywords('I am a big fan of AI');
        const words = result.map((r: any) => r.word);
        expect(words).not.toContain('am');
        expect(words).not.toContain('of');
    });

    it('counts word frequency and sorts by count', () => {
        const result = extractKeywords('data science data analysis data processing');
        expect(result[0].word).toBe('data');
        expect(result[0].count).toBe(3);
    });

    it('converts to lowercase', () => {
        const result = extractKeywords('Quantum Computing RESEARCH');
        const words = result.map((r: any) => r.word);
        expect(words).toContain('quantum');
        expect(words).toContain('computing');
        expect(words).toContain('research');
    });

    it('strips punctuation', () => {
        const result = extractKeywords('hello, world! testing... okay?');
        const words = result.map((r: any) => r.word);
        expect(words).toContain('hello');
        expect(words).toContain('world');
        expect(words).toContain('testing');
        expect(words).toContain('okay');
    });
});

// =============================================================================
// extractTopics
// =============================================================================

describe('extractTopics', () => {
    function makeSession() {
        return {
            topics: [],
            domains: [],
            conceptClusters: [],
        };
    }

    it('adds new keywords as topics', async () => {
        const session = makeSession();
        await extractTopics('quantum computing research', session);

        const terms = session.topics.map((t: any) => t.term);
        expect(terms).toContain('quantum');
        expect(terms).toContain('computing');
        expect(terms).toContain('research');
    });

    it('boosts existing topic weights on repeat mention', async () => {
        const session = makeSession();
        await extractTopics('quantum computing', session);

        const initialWeight = session.topics.find((t: any) => t.term === 'quantum')?.weight;

        await extractTopics('quantum mechanics quantum physics', session);

        const boostedWeight = session.topics.find((t: any) => t.term === 'quantum')?.weight;
        expect(boostedWeight).toBeGreaterThan(initialWeight!);
    });

    it('detects domains from top topics', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['physics']);
        const session = makeSession();

        await extractTopics('quantum mechanics entanglement', session);

        expect(session.domains).toContain('physics');
    });

    it('accumulates domains across calls', async () => {
        const session = makeSession();
        mockFindDomainsBySynonym
            .mockResolvedValueOnce(['physics'])
            .mockResolvedValue([]);

        await extractTopics('quantum mechanics', session);
        expect(session.domains).toContain('physics');

        mockFindDomainsBySynonym
            .mockResolvedValueOnce(['biology'])
            .mockResolvedValue([]);

        await extractTopics('cell division', session);
        expect(session.domains).toContain('physics');
        expect(session.domains).toContain('biology');
    });

    it('decays old topics', async () => {
        const session = makeSession();
        session.topics = [{
            term: 'old-topic',
            weight: 5,
            firstSeen: Date.now() - 600000, // 10 min ago
            lastSeen: Date.now() - 600000,
        }];

        await extractTopics('new stuff here', session);

        const oldTopic = session.topics.find((t: any) => t.term === 'old-topic');
        // Weight should be decayed (multiplied by 0.8)
        if (oldTopic) {
            expect(oldTopic.weight).toBeLessThan(5);
        }
    });

    it('removes topics with negligible weight', async () => {
        const session = makeSession();
        session.topics = [{
            term: 'dying-topic',
            weight: 0.05, // below topicMinWeight of 0.1
            firstSeen: Date.now() - 600000,
            lastSeen: Date.now() - 600000,
        }];

        await extractTopics('new content words', session);

        const dying = session.topics.find((t: any) => t.term === 'dying-topic');
        expect(dying).toBeUndefined();
    });

    it('sorts topics by weight descending', async () => {
        const session = makeSession();
        await extractTopics('data data data science analysis', session);

        for (let i = 1; i < session.topics.length; i++) {
            expect(session.topics[i - 1].weight).toBeGreaterThanOrEqual(session.topics[i].weight);
        }
    });

    it('returns keywords and domains', async () => {
        const session = makeSession();
        const result = await extractTopics('machine learning algorithms', session);

        expect(result.keywords).toBeDefined();
        expect(result.domains).toBeDefined();
        expect(Array.isArray(result.keywords)).toBe(true);
    });
});
