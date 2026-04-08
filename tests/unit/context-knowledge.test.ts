/**
 * Tests for context/knowledge.ts — detectIntent, getIntentWeights, selectKnowledge, buildSystemPrompt.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn<any>().mockResolvedValue(null),
}));

const mockGetEmbedding = jest.fn<any>().mockResolvedValue(null);
jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
}));

const mockCosineSimilarity = jest.fn<any>().mockReturnValue(0.5);
const mockGetAccessibleDomains = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../core.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    getAccessibleDomains: mockGetAccessibleDomains,
}));

const mockResolveContent = jest.fn<any>().mockImplementation(async (c: string) => c);
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

const mockBuildProvenanceTag = jest.fn<any>().mockReturnValue('[seed|g0|human]');
jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
    PROVENANCE_GUIDE_USER: 'PROVENANCE GUIDE',
}));

// Default config for context engine
const defaultContextConfig = {
    intentPatterns: {
        retrieval: ['what is', 'tell me about', 'explain'],
        action: ['create', 'update', 'delete', 'add'],
        diagnosis: ['why', 'error', 'problem', 'broken'],
        exploration: ['explore', 'brainstorm', 'ideas'],
    },
    intentScoring: {
        scorePerMatch: 1.0,
        maxConfidenceScore: 3.0,
    },
    intentMinConfidence: 0.3,
    intentBlendMax: 0.7,
    intentWeightProfiles: {
        retrieval: { embedding: 0.5, topicMatch: 0.3, nodeWeight: 0.15, recency: 0.05 },
        action: { embedding: 0.3, topicMatch: 0.2, nodeWeight: 0.3, recency: 0.2 },
        diagnosis: { embedding: 0.4, topicMatch: 0.3, nodeWeight: 0.2, recency: 0.1 },
        exploration: { embedding: 0.35, topicMatch: 0.35, nodeWeight: 0.15, recency: 0.15 },
    },
    maxKnowledgeNodes: 10,
    relevanceWeights: { embedding: 0.4, topicMatch: 0.3, nodeWeight: 0.2, recency: 0.1 },
    recencyDays: 30,
    minRelevanceScore: 0.0,
    totalBudget: 4000,
    allocation: { knowledge: 0.5, history: 0.2, systemPrompt: 0.2, response: 0.1 },
    modelProfiles: {
        small: { label: 'Small', contextWindow: 4096, budgetMultiplier: 0.5, preferCompressed: true, maxKnowledgeNodes: 5, historyTurns: 3 },
        medium: { label: 'Medium', contextWindow: 8192, budgetMultiplier: 1.0, preferCompressed: false, maxKnowledgeNodes: 10, historyTurns: 6 },
    },
    dedupInSelectionThreshold: 0.6,
    topicClustering: { clusterWeight: 0.1 },
    dynamicBudget: { enabled: false },
    stopWords: [],
};

jest.unstable_mockModule('../../config.js', () => ({
    config: { contextEngine: { ...defaultContextConfig } },
}));

// Import after mocks
const { detectIntent, getIntentWeights, selectKnowledge, buildSystemPrompt } =
    await import('../../context/knowledge.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, any> = {}) {
    return {
        id: overrides.id || 'node-1',
        content: overrides.content || 'test node content here',
        embedding: 'embedding' in overrides ? overrides.embedding : JSON.stringify([0.1, 0.2, 0.3]),
        weight: overrides.weight ?? 1.0,
        salience: overrides.salience ?? 0.5,
        domain: overrides.domain || 'test-domain',
        node_type: overrides.node_type || 'seed',
        created_at: overrides.created_at || new Date().toISOString(),
        specificity: overrides.specificity ?? 0.5,
        generation: overrides.generation ?? 0,
        contributor: overrides.contributor || 'human',
        origin: overrides.origin || null,
        verification_status: overrides.verification_status || null,
        verification_score: overrides.verification_score ?? null,
    };
}

function makeSession(overrides: Record<string, any> = {}) {
    return {
        topics: overrides.topics || [],
        domains: overrides.domains || [],
        turnCount: overrides.turnCount || 0,
        conceptClusters: overrides.conceptClusters || [],
        _modelProfile: overrides._modelProfile || null,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectIntent', () => {
    beforeEach(() => jest.resetAllMocks());

    it('detects retrieval intent from "what is" pattern', () => {
        const result = detectIntent('What is a knowledge graph?');
        expect(result.intent).toBe('retrieval');
        expect(result.confidence).toBeGreaterThan(0.3);
        expect(result.signals.length).toBeGreaterThan(0);
    });

    it('detects action intent from "create" pattern', () => {
        const result = detectIntent('Create a new node in the graph');
        expect(result.intent).toBe('action');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.signals.some(s => s.startsWith('action:'))).toBe(true);
    });

    it('detects diagnosis intent from "error" pattern', () => {
        const result = detectIntent('There is an error in the system');
        expect(result.intent).toBe('diagnosis');
        expect(result.signals.some(s => s.startsWith('diagnosis:'))).toBe(true);
    });

    it('detects exploration intent', () => {
        const result = detectIntent('Let us explore some new ideas and brainstorm');
        expect(result.intent).toBe('exploration');
        expect(result.signals.some(s => s.startsWith('exploration:'))).toBe(true);
    });

    it('defaults to retrieval with minimum confidence when no patterns match', () => {
        const result = detectIntent('xyzzy blorp');
        expect(result.intent).toBe('retrieval');
        expect(result.confidence).toBe(0.3); // intentMinConfidence
        expect(result.signals).toEqual([]);
    });

    it('higher confidence when multiple patterns match for same intent', () => {
        // "why" and "error" both match diagnosis
        const result = detectIntent('Why is there an error and a problem?');
        expect(result.intent).toBe('diagnosis');
        expect(result.confidence).toBeGreaterThan(0.33);
    });

    it('confidence is capped at 1.0', () => {
        // "why", "error", "problem", "broken" — 4 matches, scorePerMatch=1, maxConfScore=3
        const result = detectIntent('why error problem broken');
        expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('is case-insensitive', () => {
        const result = detectIntent('WHAT IS this about?');
        expect(result.intent).toBe('retrieval');
    });

    it('signals include truncated pattern source', () => {
        const result = detectIntent('Tell me about something');
        for (const sig of result.signals) {
            const parts = sig.split(':');
            expect(parts.length).toBe(2);
            expect(parts[1].length).toBeLessThanOrEqual(25);
        }
    });
});

describe('getIntentWeights', () => {
    beforeEach(() => jest.resetAllMocks());

    const defaults = { embedding: 0.4, topicMatch: 0.3, nodeWeight: 0.2, recency: 0.1 };

    it('returns defaults when confidence is at or below minimum', () => {
        const result = getIntentWeights('retrieval', 0.3, defaults);
        expect(result).toEqual(defaults);
    });

    it('returns defaults when confidence is below minimum', () => {
        const result = getIntentWeights('retrieval', 0.1, defaults);
        expect(result).toEqual(defaults);
    });

    it('blends weights when confidence exceeds minimum', () => {
        const result = getIntentWeights('retrieval', 0.8, defaults);
        // With blend = 0.8 * 0.7 = 0.56, the weights should differ from defaults
        expect(result.embedding).not.toBe(defaults.embedding);
        // retrieval profile has embedding=0.5, defaults 0.4
        // result = 0.4*(1-0.56) + 0.5*0.56 = 0.176 + 0.28 = 0.456
        expect(result.embedding).toBeCloseTo(0.456, 2);
    });

    it('handles confidence of 1.0 (max blend)', () => {
        const result = getIntentWeights('action', 1.0, defaults);
        // blend = 1.0 * 0.7 = 0.7
        // action profile: embedding=0.3, topicMatch=0.2, nodeWeight=0.3, recency=0.2
        // embedding: 0.4*(1-0.7) + 0.3*0.7 = 0.12 + 0.21 = 0.33
        expect(result.embedding).toBeCloseTo(0.33, 2);
        // nodeWeight: 0.2*(1-0.7) + 0.3*0.7 = 0.06 + 0.21 = 0.27
        expect(result.nodeWeight).toBeCloseTo(0.27, 2);
    });

    it('preserves keys not in profile using default values', () => {
        const extended = { ...defaults, customKey: 0.5 };
        const result = getIntentWeights('retrieval', 0.8, extended);
        // customKey not in profile, so: 0.5*(1-0.56) + 0.5*0.56 = 0.5
        expect(result.customKey).toBeCloseTo(0.5, 2);
    });

    it('returns all keys from defaults', () => {
        const result = getIntentWeights('exploration', 0.9, defaults);
        expect(Object.keys(result).sort()).toEqual(Object.keys(defaults).sort());
    });
});

describe('selectKnowledge', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.5);
        mockResolveContent.mockImplementation(async (c: string) => c);
    });

    it('returns empty array when no candidates found', async () => {
        mockQuery.mockResolvedValue([]);
        const session = makeSession();
        const result = await selectKnowledge('test query', session);
        expect(result).toEqual([]);
    });

    it('queries all nodes when session has no domains', async () => {
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession({ domains: [] });
        await selectKnowledge('test query', session);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        const sql = mockQuery.mock.calls[0][0] as string;
        expect(sql).not.toContain('domain IN');
    });

    it('queries accessible domains when session has domains', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['test-domain', 'bridged-domain']);
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession({ domains: ['test-domain'] });
        await selectKnowledge('test query', session);
        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('test-domain');
        const sql = mockQuery.mock.calls[0][0] as string;
        expect(sql).toContain('domain IN');
    });

    it('deduplicates accessible domains from multiple session domains', async () => {
        mockGetAccessibleDomains
            .mockResolvedValueOnce(['domain-a', 'domain-b'])
            .mockResolvedValueOnce(['domain-b', 'domain-c']);
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession({ domains: ['domain-a', 'domain-b'] });
        await selectKnowledge('test query', session);
        // The Set deduplicates — should query with unique domains
        const args = mockQuery.mock.calls[0][1] as string[];
        const uniqueDomains = new Set(args);
        expect(uniqueDomains.size).toBe(args.length);
    });

    it('scores nodes using embedding similarity', async () => {
        mockCosineSimilarity.mockReturnValue(0.9);
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession();
        const result = await selectKnowledge('test query', session);
        expect(result.length).toBe(1);
        expect(result[0].relevance).toBeGreaterThan(0);
        expect(mockCosineSimilarity).toHaveBeenCalled();
    });

    it('scores nodes using topic match', async () => {
        mockCosineSimilarity.mockReturnValue(0);
        mockQuery.mockResolvedValue([makeNode({ content: 'neural network architecture' })]);
        const session = makeSession({
            topics: [
                { term: 'neural', weight: 2.0 },
                { term: 'network', weight: 1.5 },
            ],
        });
        const result = await selectKnowledge('neural networks', session);
        expect(result.length).toBe(1);
        expect(result[0].topicMatches).toBe(2);
    });

    it('scores nodes using node weight', async () => {
        mockCosineSimilarity.mockReturnValue(0);
        mockQuery.mockResolvedValue([
            makeNode({ id: 'heavy', weight: 2.0 }),
            makeNode({ id: 'light', weight: 0.2 }),
        ]);
        const session = makeSession();
        const result = await selectKnowledge('test', session);
        const heavy = result.find((n: any) => n.id === 'heavy');
        const light = result.find((n: any) => n.id === 'light');
        expect(heavy!.relevance).toBeGreaterThan(light!.relevance);
    });

    it('scores nodes using recency (newer = higher)', async () => {
        mockCosineSimilarity.mockReturnValue(0);
        const now = new Date();
        const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
        mockQuery.mockResolvedValue([
            makeNode({ id: 'new', created_at: now.toISOString(), weight: 1.0 }),
            makeNode({ id: 'old', created_at: oldDate.toISOString(), weight: 1.0 }),
        ]);
        const session = makeSession();
        const result = await selectKnowledge('test', session);
        const newNode = result.find((n: any) => n.id === 'new');
        const oldNode = result.find((n: any) => n.id === 'old');
        expect(newNode!.relevance).toBeGreaterThan(oldNode!.relevance);
    });

    it('parses string embeddings from DB', async () => {
        const embedding = [0.1, 0.2, 0.3];
        mockQuery.mockResolvedValue([makeNode({ embedding: JSON.stringify(embedding) })]);
        const session = makeSession();
        await selectKnowledge('test', session);
        expect(mockCosineSimilarity).toHaveBeenCalledWith([0.1, 0.2, 0.3], embedding);
    });

    it('handles array embeddings directly', async () => {
        const embedding = [0.4, 0.5, 0.6];
        mockQuery.mockResolvedValue([makeNode({ embedding })]);
        const session = makeSession();
        await selectKnowledge('test', session);
        expect(mockCosineSimilarity).toHaveBeenCalledWith([0.1, 0.2, 0.3], embedding);
    });

    it('skips embedding scoring when message embedding is null', async () => {
        mockGetEmbedding.mockResolvedValue(null);
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession();
        await selectKnowledge('test', session);
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });

    it('skips embedding scoring when node embedding is null', async () => {
        mockQuery.mockResolvedValue([makeNode({ embedding: null })]);
        const session = makeSession({ conceptClusters: [] });
        await selectKnowledge('test', session);
        // Embedding similarity branch requires both messageEmbedding and node.embedding.
        // Cluster branch also requires node.embedding. With null embedding, neither fires.
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });

    it('filters nodes below minRelevanceScore', async () => {
        // Set all scores to 0 and minRelevanceScore > 0
        mockCosineSimilarity.mockReturnValue(0);
        mockGetEmbedding.mockResolvedValue(null);
        // Node with weight 0 and no topic match, no embedding → score=0
        mockQuery.mockResolvedValue([makeNode({ weight: 0 })]);
        const session = makeSession();
        // Use a high minRelevanceScore via options — scores should be near 0
        // The default minRelevanceScore is 0.0, so the node should pass with weight 0
        // But recency adds a bit, so let's make node old enough
        const oldNode = makeNode({
            weight: 0,
            created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
        mockQuery.mockResolvedValue([oldNode]);
        const result = await selectKnowledge('test', session);
        // With minRelevanceScore=0.0, even score=0 passes (>= 0)
        expect(result.length).toBe(1);
    });

    it('respects maxNodes option', async () => {
        mockQuery.mockResolvedValue([
            makeNode({ id: 'n1' }),
            makeNode({ id: 'n2' }),
            makeNode({ id: 'n3' }),
        ]);
        const session = makeSession();
        const result = await selectKnowledge('test', session, { maxNodes: 2 });
        expect(result.length).toBeLessThanOrEqual(2);
    });

    it('respects token budget', async () => {
        // Each node content is ~20 chars → ~5 tokens
        mockQuery.mockResolvedValue([
            makeNode({ id: 'n1', content: 'short' }),
            makeNode({ id: 'n2', content: 'a'.repeat(10000) }), // ~2500 tokens
            makeNode({ id: 'n3', content: 'also short' }),
        ]);
        mockCosineSimilarity.mockReturnValue(0.5);
        const session = makeSession();
        // Budget of 20 tokens should skip the big node
        const result = await selectKnowledge('test', session, { budget: 20 });
        const ids = result.map((n: any) => n.id);
        expect(ids).not.toContain('n2');
    });

    it('resolves number variable placeholders in selected nodes', async () => {
        mockResolveContent.mockImplementation(async (c: string) => c.replace('[[[X1]]]', '42'));
        mockQuery.mockResolvedValue([makeNode({ content: 'value is [[[X1]]]' })]);
        const session = makeSession();
        const result = await selectKnowledge('test', session);
        expect(result[0].content).toBe('value is 42');
        expect(mockResolveContent).toHaveBeenCalled();
    });

    it('sorts results by relevance descending', async () => {
        mockCosineSimilarity
            .mockReturnValueOnce(0.9)  // high similarity for n1
            .mockReturnValueOnce(0.1); // low similarity for n2
        mockQuery.mockResolvedValue([
            makeNode({ id: 'n1', content: 'first node content' }),
            makeNode({ id: 'n2', content: 'second node content' }),
        ]);
        const session = makeSession();
        const result = await selectKnowledge('test', session);
        expect(result.length).toBe(2);
        expect(result[0].relevance).toBeGreaterThanOrEqual(result[1].relevance);
    });

    it('maps node fields correctly in output', async () => {
        const node = makeNode({
            id: 'abc-123',
            content: 'mapped content',
            domain: 'my-domain',
            node_type: 'synthesis',
            weight: 1.5,
            generation: 2,
            contributor: 'claude',
            origin: 'voicing',
            verification_status: 'verified',
            verification_score: 0.95,
        });
        mockQuery.mockResolvedValue([node]);
        const session = makeSession();
        const result = await selectKnowledge('test', session);
        expect(result[0]).toMatchObject({
            id: 'abc-123',
            content: 'mapped content',
            domain: 'my-domain',
            nodeType: 'synthesis',
            weight: 1.5,
            generation: 2,
            contributor: 'claude',
            origin: 'voicing',
            verificationStatus: 'verified',
            verificationScore: 0.95,
        });
        expect(typeof result[0].relevance).toBe('number');
        expect(typeof result[0].tokens).toBe('number');
        expect(typeof result[0].topicMatches).toBe('number');
    });

    it('concept cluster scoring boosts relevance', async () => {
        const embedding = [0.1, 0.2, 0.3];
        // Return different similarity values: first call for message embedding, second for cluster
        mockCosineSimilarity
            .mockReturnValueOnce(0.5)  // embedding similarity
            .mockReturnValueOnce(0.8); // cluster similarity
        mockQuery.mockResolvedValue([makeNode({ embedding })]);
        const session = makeSession({
            conceptClusters: [
                { centroid: [0.1, 0.2, 0.3], weight: 1.0 },
            ],
        });
        const result = await selectKnowledge('test', session);
        expect(result.length).toBe(1);
        // Cluster scoring was reached
        expect(mockCosineSimilarity).toHaveBeenCalledTimes(2);
    });

    it('skips cluster scoring when no clusters exist', async () => {
        mockQuery.mockResolvedValue([makeNode()]);
        const session = makeSession({ conceptClusters: [] });
        await selectKnowledge('test', session);
        // Only one cosineSimilarity call (for embedding), not cluster
        expect(mockCosineSimilarity).toHaveBeenCalledTimes(1);
    });

    it('normalizes topic score to max 1', async () => {
        mockCosineSimilarity.mockReturnValue(0);
        mockGetEmbedding.mockResolvedValue(null);
        // Node matches all topics
        mockQuery.mockResolvedValue([
            makeNode({ content: 'alpha beta gamma delta epsilon' }),
        ]);
        const session = makeSession({
            topics: [
                { term: 'alpha', weight: 10 },
                { term: 'beta', weight: 8 },
                { term: 'gamma', weight: 6 },
                { term: 'delta', weight: 4 },
                { term: 'epsilon', weight: 2 },
                { term: 'zeta', weight: 1 },
            ],
        });
        const result = await selectKnowledge('test', session);
        // normalizedTopicScore is capped at 1 by Math.min
        // topicMatch weight is 0.3, so max contribution from topics is 0.3
        expect(result[0].relevance).toBeLessThanOrEqual(1.0);
    });

    describe('dedup-in-selection', () => {
        it('removes duplicate nodes when profile prefers compressed', async () => {
            mockQuery.mockResolvedValue([
                makeNode({ id: 'n1', content: 'the quick brown fox jumps over the lazy' }),
                makeNode({ id: 'n2', content: 'the quick brown fox jumps over a lazy' }), // very similar
                makeNode({ id: 'n3', content: 'completely different unique content here' }),
            ]);
            const session = makeSession();
            const result = await selectKnowledge('test', session, { profileKey: 'small' });
            const ids = result.map((r: any) => r.id);
            // n2 should be deduped against n1 (high Jaccard)
            expect(ids).toContain('n1');
            expect(ids).not.toContain('n2');
            expect(ids).toContain('n3');
        });

        it('does not dedup when profile does not prefer compressed', async () => {
            mockQuery.mockResolvedValue([
                makeNode({ id: 'n1', content: 'the quick brown fox jumps over the lazy' }),
                makeNode({ id: 'n2', content: 'the quick brown fox jumps over a lazy' }),
            ]);
            const session = makeSession();
            const result = await selectKnowledge('test', session, { profileKey: 'medium' });
            expect(result.length).toBe(2);
        });

        it('does not dedup when no profileKey given', async () => {
            mockQuery.mockResolvedValue([
                makeNode({ id: 'n1', content: 'the quick brown fox jumps over the lazy' }),
                makeNode({ id: 'n2', content: 'the quick brown fox jumps over a lazy' }),
            ]);
            const session = makeSession();
            const result = await selectKnowledge('test', session);
            expect(result.length).toBe(2);
        });
    });
});

describe('buildSystemPrompt', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockBuildProvenanceTag.mockReturnValue('[seed|g0|human]');
    });

    it('returns null prompt when knowledge is empty', () => {
        const session = makeSession();
        const result = buildSystemPrompt([], session);
        expect(result.prompt).toBeNull();
        expect(result.tokens).toBe(0);
    });

    it('builds structured prompt with domain headers for non-compressed mode', () => {
        const knowledge = [
            { domain: 'physics', content: 'E equals mc squared', nodeType: 'seed', weight: 1.0 },
            { domain: 'physics', content: 'F equals ma', nodeType: 'seed', weight: 1.0 },
            { domain: 'math', content: 'pi is irrational', nodeType: 'seed', weight: 1.0 },
        ];
        const session = makeSession({ topics: [], domains: [] });
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('## physics');
        expect(result.prompt).toContain('## math');
        expect(result.prompt).toContain('E equals mc squared');
        expect(result.prompt).toContain('F equals ma');
        expect(result.prompt).toContain('pi is irrational');
        expect(result.tokens).toBeGreaterThan(0);
    });

    it('includes provenance tags in non-compressed mode', () => {
        mockBuildProvenanceTag.mockReturnValue('[synthesis|g1]');
        const knowledge = [
            { domain: 'test', content: 'test content', nodeType: 'synthesis' },
        ];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('[synthesis|g1]');
        expect(mockBuildProvenanceTag).toHaveBeenCalled();
    });

    it('includes provenance guide in non-compressed mode', () => {
        const knowledge = [{ domain: 'test', content: 'content' }];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('PROVENANCE GUIDE');
    });

    it('includes active topics in non-compressed mode', () => {
        const knowledge = [{ domain: 'test', content: 'content' }];
        const session = makeSession({
            topics: [
                { term: 'neural', weight: 2 },
                { term: 'network', weight: 1.5 },
            ],
        });
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('Active topics: neural, network');
    });

    it('limits active topics to 8', () => {
        const knowledge = [{ domain: 'test', content: 'content' }];
        const topics = Array.from({ length: 12 }, (_, i) => ({ term: `topic${i}`, weight: 12 - i }));
        const session = makeSession({ topics });
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('topic0');
        expect(result.prompt).toContain('topic7');
        expect(result.prompt).not.toContain('topic8');
    });

    it('includes active domains in non-compressed mode', () => {
        const knowledge = [{ domain: 'test', content: 'content' }];
        const session = makeSession({ domains: ['physics', 'math'] });
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('Active domains: physics, math');
    });

    it('does not include topics/domains sections when empty', () => {
        const knowledge = [{ domain: 'test', content: 'content' }];
        const session = makeSession({ topics: [], domains: [] });
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).not.toContain('Active topics:');
        expect(result.prompt).not.toContain('Active domains:');
    });

    it('builds compressed format when preferCompressed option is set', () => {
        const knowledge = [
            { domain: 'physics', content: 'E equals mc squared' },
            { domain: 'physics', content: 'F equals ma' },
            { domain: 'math', content: 'pi is irrational' },
        ];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session, { preferCompressed: true });
        expect(result.prompt).toContain('[physics]');
        expect(result.prompt).toContain('[math]');
        // Compressed mode should NOT have markdown headers
        expect(result.prompt).not.toContain('## physics');
        // Should not include provenance guide
        expect(result.prompt).not.toContain('PROVENANCE GUIDE');
    });

    it('compressed format normalizes trailing dots', () => {
        const knowledge = [
            { domain: 'test', content: 'no dot at end' },
            { domain: 'test', content: 'has dot at end.' },
        ];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session, { preferCompressed: true });
        // Both should end with a single dot
        expect(result.prompt).toContain('no dot at end.');
        expect(result.prompt).toContain('has dot at end.');
        // No double dots
        expect(result.prompt).not.toContain('..');
    });

    it('uses "general" domain when node domain is missing', () => {
        const knowledge = [
            { content: 'orphan content' }, // no domain property
        ];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session);
        expect(result.prompt).toContain('## general');
    });

    it('compressed format uses "general" when domain is missing', () => {
        const knowledge = [{ content: 'orphan content' }];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session, { preferCompressed: true });
        expect(result.prompt).toContain('[general]');
    });

    it('recursively reduces knowledge when prompt exceeds token budget', () => {
        // Create knowledge that generates a long prompt in compressed mode (less overhead)
        const knowledge = Array.from({ length: 20 }, (_, i) => ({
            domain: 'test',
            content: 'A'.repeat(100) + ` node ${i}`,
        }));
        const session = makeSession();
        // Budget that fits a few nodes but not all 20 (compressed mode keeps overhead low)
        const result = buildSystemPrompt(knowledge, session, { budget: 200, preferCompressed: true });
        expect(result.tokens).toBeLessThanOrEqual(200);
        // Should have fewer nodes than the original 20
        expect(result.prompt).not.toBeNull();
    });

    it('keeps at least 1 node even under extreme budget pressure', () => {
        // Use compressed mode with short content so 1 node fits in budget
        const knowledge = [
            { domain: 'test', content: 'hi' },
            { domain: 'test', content: 'also short' },
            { domain: 'test', content: 'third item with more text to exceed budget' },
        ];
        const session = makeSession();
        // Budget large enough for 1 compressed node but not all 3
        const result = buildSystemPrompt(knowledge, session, { budget: 10, preferCompressed: true });
        // Should not return null — keeps at least 1 node
        expect(result.prompt).not.toBeNull();
    });

    it('returns correct token count', () => {
        const knowledge = [{ domain: 'test', content: 'hello world' }];
        const session = makeSession();
        const result = buildSystemPrompt(knowledge, session);
        // estimateTokens = Math.ceil(text.length / 4)
        expect(result.tokens).toBe(Math.ceil(result.prompt!.length / 4));
    });
});
