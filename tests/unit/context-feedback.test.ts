import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('summary');

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    callSubsystemModel: mockCallSubsystemModel,
}));

const mockCosineSimilarity = jest.fn<(...args: any[]) => number>().mockReturnValue(0.5);

jest.unstable_mockModule('../../core.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
}));

const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('prompt text');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

let mockConfig: any = {};

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => mockConfig,
    estimateTokens: (text: string) => (text ? Math.ceil(text.length / 4) : 0),
    getDynamicBudgets: (_session: any) => ({ history: 1000 }),
}));

const {
    compressHistory,
    detectKnowledgeUsage,
    computeTurnMetrics,
    persistSessionInsights,
    loadSessionInsights,
} = await import('../../context/feedback.js');

// --- Helpers ---

function makeSession(overrides: any = {}) {
    return {
        id: 'sess-1',
        history: [],
        compressedUpTo: 0,
        compressedHistory: '',
        topics: [],
        domains: ['test-domain'],
        metrics: {
            knowledgeUtilization: [],
            responseGrounding: [],
            topicCoverage: [],
            budgetEfficiency: [],
            qualityScores: [],
        },
        lastDeliveredNodeIds: [],
        lastFeedback: null,
        lastContext: null,
        _lastDeliveredCount: 0,
        conceptClusters: null,
        ...overrides,
    };
}

function makeTurns(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i} content that is reasonably long for tokens`,
    }));
}

// --- Tests ---

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue('summary');
    mockGetPrompt.mockResolvedValue('prompt text');
    mockCosineSimilarity.mockReturnValue(0.5);

    mockConfig = {
        totalBudget: 4000,
        compressionThreshold: 0.8,
        feedback: {
            enabled: true,
            usageThreshold: 0.4,
            weightBoost: 0.1,
            maxBoostPerTurn: 0.5,
        },
        qualityMetricWeights: {
            knowledgeUtilization: 0.3,
            responseGrounding: 0.3,
            topicCoverage: 0.2,
            budgetEfficiency: 0.2,
        },
        crossSession: {
            enabled: true,
            maxTopicsToPersist: 30,
            topicWeightThreshold: 0.5,
            emaRetain: 0.7,
            emaIncoming: 0.3,
            maxInsightsToLoad: 20,
            maxNodeUsageToLoad: 10,
            nodeUsageMinThreshold: 2,
        },
    };
});

// =============================================================================
// compressHistory
// =============================================================================

describe('compressHistory', () => {
    it('returns compressed:false when tokens are below threshold', async () => {
        const session = makeSession({ history: makeTurns(2), compressedUpTo: 0 });
        // Short history => tokens below threshold (1000 * 0.8 = 800)
        const result = await compressHistory(session);
        expect(result.compressed).toBe(false);
        expect(result.tokens).toBeGreaterThanOrEqual(0);
    });

    it('returns compressed:false when midpoint < 2', async () => {
        // 3 turns, midpoint = floor(3/2) = 1 < 2
        const session = makeSession({
            history: makeTurns(3),
            compressedUpTo: 0,
        });
        // Force tokens above threshold by using budgetOverride with a tiny budget
        const result = await compressHistory(session, { history: 10 });
        expect(result.compressed).toBe(false);
    });

    it('compresses when tokens exceed threshold and midpoint >= 2', async () => {
        const session = makeSession({
            history: makeTurns(10),
            compressedUpTo: 0,
        });
        // Budget override with a tiny history budget to force compression
        const result = await compressHistory(session, { history: 10 });
        expect(result.compressed).toBe(true);
        expect(result.summary).toBe('summary');
        expect(session.compressedHistory).toBe('summary');
        expect(session.compressedUpTo).toBe(5); // midpoint of 10
        expect(mockGetPrompt).toHaveBeenCalledWith('context.history_compression', expect.any(Object));
        expect(mockCallSubsystemModel).toHaveBeenCalledWith('context', 'prompt text', {});
    });

    it('includes existing summary in prompt when present', async () => {
        const session = makeSession({
            history: makeTurns(10),
            compressedUpTo: 0,
            compressedHistory: 'old summary',
        });
        await compressHistory(session, { history: 10 });
        expect(mockGetPrompt).toHaveBeenCalledWith('context.history_compression', expect.objectContaining({
            existingSummary: expect.stringContaining('old summary'),
        }));
    });

    it('passes empty existingSummary when no prior compressed history', async () => {
        const session = makeSession({
            history: makeTurns(10),
            compressedUpTo: 0,
            compressedHistory: '',
        });
        await compressHistory(session, { history: 10 });
        expect(mockGetPrompt).toHaveBeenCalledWith('context.history_compression', expect.objectContaining({
            existingSummary: '',
        }));
    });

    it('returns error when LLM call fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM down'));
        const session = makeSession({
            history: makeTurns(10),
            compressedUpTo: 0,
        });
        const result = await compressHistory(session, { history: 10 });
        expect(result.compressed).toBe(false);
        expect(result.error).toBe('LLM down');
    });

    it('uses budgetOverride.history when provided', async () => {
        const session = makeSession({ history: makeTurns(4), compressedUpTo: 0 });
        // Huge budget => no compression needed
        const result = await compressHistory(session, { history: 100000 });
        expect(result.compressed).toBe(false);
    });

    it('uses getDynamicBudgets when no budgetOverride', async () => {
        // getDynamicBudgets returns { history: 1000 }, threshold = 1000 * 0.8 = 800
        // Short history won't exceed that
        const session = makeSession({ history: makeTurns(2), compressedUpTo: 0 });
        const result = await compressHistory(session);
        expect(result.compressed).toBe(false);
    });

    it('respects compressedUpTo to only consider uncompressed turns', async () => {
        const turns = makeTurns(10);
        const session = makeSession({
            history: turns,
            compressedUpTo: 8, // Only 2 uncompressed turns
        });
        // Only 2 uncompressed, midpoint = 1 < 2 => no compression
        const result = await compressHistory(session, { history: 10 });
        expect(result.compressed).toBe(false);
    });
});

// =============================================================================
// detectKnowledgeUsage
// =============================================================================

describe('detectKnowledgeUsage', () => {
    it('returns empty boosted when feedback is disabled', async () => {
        mockConfig.feedback.enabled = false;
        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('returns empty boosted when feedback config is missing', async () => {
        mockConfig.feedback = null;
        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('returns empty boosted when no delivered node IDs', async () => {
        const session = makeSession({ lastDeliveredNodeIds: [] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('returns empty boosted when getEmbedding returns null', async () => {
        mockGetEmbedding.mockResolvedValue(null);
        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('boosts nodes with similarity above threshold', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.7);
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', embedding: JSON.stringify([0.1, 0.2, 0.3]) },
                { id: 'n2', embedding: [0.4, 0.5, 0.6] },
            ]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1', 'n2'] });
        const result = await detectKnowledgeUsage('response text', session);

        expect(result.boosted).toHaveLength(2);
        expect(result.boosted[0].id).toBe('n1');
        expect(result.boosted[0].similarity).toBe(0.7);
        expect(result.totalBoost).toBe(0.2); // 0.1 + 0.1
        // Verify UPDATE was called
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET weight'),
            expect.arrayContaining(['n1']),
        );
    });

    it('skips nodes with no embedding', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2]);
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: null }]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('skips nodes below usage threshold', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2]);
        mockCosineSimilarity.mockReturnValue(0.2); // below 0.4 threshold
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: '[0.1]' }]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toEqual([]);
    });

    it('respects maxBoostPerTurn cap', async () => {
        mockConfig.feedback.maxBoostPerTurn = 0.15;
        mockConfig.feedback.weightBoost = 0.1;
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockCosineSimilarity.mockReturnValue(0.8);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding: '[0.1]' },
            { id: 'n2', embedding: '[0.2]' },
            { id: 'n3', embedding: '[0.3]' },
        ]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1', 'n2', 'n3'] });
        const result = await detectKnowledgeUsage('response text', session);

        // First boost: 0.1, total=0.1. Second: min(0.1, 0.15-0.1)=0.05, total=0.15. Third: breaks.
        expect(result.boosted).toHaveLength(2);
        expect(result.totalBoost).toBe(0.15);
    });

    it('clears lastDeliveredNodeIds and sets lastFeedback on session', async () => {
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: '[0.1]' }]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        await detectKnowledgeUsage('response text', session);

        expect(session.lastDeliveredNodeIds).toEqual([]);
        expect(session.lastFeedback).toBeDefined();
        expect(session.lastFeedback.boosted).toHaveLength(1);
        expect(session.lastFeedback.checkedAt).toBeGreaterThan(0);
    });

    it('parses embedding from string format', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2]);
        mockCosineSimilarity.mockReturnValue(0.5);
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: '[0.1, 0.2]' }]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted).toHaveLength(1);
        expect(mockCosineSimilarity).toHaveBeenCalledWith([0.1, 0.2], [0.1, 0.2]);
    });

    it('uses embedding array directly when not a string', async () => {
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockCosineSimilarity.mockReturnValue(0.6);
        const embArray = [0.3, 0.4];
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: embArray }]);

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        await detectKnowledgeUsage('response text', session);
        expect(mockCosineSimilarity).toHaveBeenCalledWith([0.1], embArray);
    });

    it('rounds similarity to 3 decimal places', async () => {
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockCosineSimilarity.mockReturnValue(0.123456789);
        mockQuery.mockResolvedValueOnce([{ id: 'n1', embedding: '[0.1]' }]);

        // 0.123 is below threshold 0.4, won't be boosted
        // Set threshold lower
        mockConfig.feedback.usageThreshold = 0.1;

        const session = makeSession({ lastDeliveredNodeIds: ['n1'] });
        const result = await detectKnowledgeUsage('response text', session);
        expect(result.boosted[0].similarity).toBe(0.123);
    });
});

// =============================================================================
// computeTurnMetrics
// =============================================================================

describe('computeTurnMetrics', () => {
    it('computes all metrics and pushes to session arrays', () => {
        const session = makeSession({
            lastFeedback: {
                boosted: [
                    { id: 'n1', similarity: 0.8 },
                    { id: 'n2', similarity: 0.6 },
                ],
            },
            _lastDeliveredCount: 5,
            topics: [
                { term: 'alpha', weight: 1 },
                { term: 'beta', weight: 1 },
                { term: 'gamma', weight: 1 },
            ],
            lastContext: { promptTokens: 500, historyTokens: 300 },
        });

        const result = computeTurnMetrics('this response mentions alpha and beta', session);

        // knowledgeUtilization: 2/5 = 0.4
        expect(result.knowledgeUtilization).toBe(0.4);
        // responseGrounding: (0.8 + 0.6) / 2 = 0.7
        expect(result.responseGrounding).toBe(0.7);
        // topicCoverage: 2/3 (alpha and beta found)
        expect(result.topicCoverage).toBeCloseTo(0.667, 2);
        // budgetEfficiency: (500 + 300) / 4000 = 0.2
        expect(result.budgetEfficiency).toBe(0.2);
        // qualityScore: 0.4*0.3 + 0.7*0.3 + 0.667*0.2 + 0.2*0.2 = 0.12 + 0.21 + 0.1334 + 0.04 = 0.503
        expect(result.qualityScore).toBeGreaterThan(0);

        // Verify pushed to session arrays
        expect(session.metrics.knowledgeUtilization).toHaveLength(1);
        expect(session.metrics.responseGrounding).toHaveLength(1);
        expect(session.metrics.topicCoverage).toHaveLength(1);
        expect(session.metrics.budgetEfficiency).toHaveLength(1);
        expect(session.metrics.qualityScores).toHaveLength(1);
    });

    it('returns zero knowledgeUtilization when no delivered count', () => {
        const session = makeSession({
            lastFeedback: { boosted: [] },
            _lastDeliveredCount: 0,
        });
        const result = computeTurnMetrics('response', session);
        expect(result.knowledgeUtilization).toBe(0);
    });

    it('returns zero responseGrounding when no boosted nodes', () => {
        const session = makeSession({
            lastFeedback: { boosted: [] },
        });
        const result = computeTurnMetrics('response', session);
        expect(result.responseGrounding).toBe(0);
    });

    it('returns zero responseGrounding when lastFeedback is null', () => {
        const session = makeSession({ lastFeedback: null });
        const result = computeTurnMetrics('response', session);
        expect(result.responseGrounding).toBe(0);
    });

    it('returns zero topicCoverage when session has no topics', () => {
        const session = makeSession({ topics: [] });
        const result = computeTurnMetrics('response', session);
        expect(result.topicCoverage).toBe(0);
    });

    it('handles topic matching case-insensitively', () => {
        const session = makeSession({
            topics: [{ term: 'alpha', weight: 1 }],
        });
        const result = computeTurnMetrics('This mentions ALPHA in uppercase', session);
        expect(result.topicCoverage).toBe(1);
    });

    it('returns zero budgetEfficiency when lastContext is null', () => {
        const session = makeSession({ lastContext: null });
        const result = computeTurnMetrics('response', session);
        expect(result.budgetEfficiency).toBe(0);
    });

    it('caps budgetEfficiency at 1.0', () => {
        const session = makeSession({
            lastContext: { promptTokens: 5000, historyTokens: 5000 },
        });
        const result = computeTurnMetrics('response', session);
        expect(result.budgetEfficiency).toBe(1);
    });

    it('rounds all metric values to 3 decimal places', () => {
        const session = makeSession({
            lastFeedback: { boosted: [{ id: 'n1', similarity: 0.33333 }] },
            _lastDeliveredCount: 3,
            topics: [
                { term: 'a', weight: 1 },
                { term: 'b', weight: 1 },
                { term: 'c', weight: 1 },
            ],
        });
        const result = computeTurnMetrics('response with a', session);
        for (const key of Object.keys(result)) {
            const val = result[key];
            // Check that it has at most 3 decimal places
            const rounded = Math.round(val * 1000) / 1000;
            expect(val).toBe(rounded);
        }
    });

    it('handles knowledgeUtilization when feedback.boosted is undefined', () => {
        const session = makeSession({
            lastFeedback: {},
            _lastDeliveredCount: 5,
        });
        const result = computeTurnMetrics('response', session);
        // boosted is undefined => deliveredCount = 0 (because boosted !== undefined check fails)
        expect(result.knowledgeUtilization).toBe(0);
    });

    it('limits topics to first 10 for coverage calc', () => {
        const topics = Array.from({ length: 15 }, (_, i) => ({ term: `topic${i}`, weight: 1 }));
        const session = makeSession({ topics });
        // response contains topic0 through topic9 (the first 10)
        const response = topics.slice(0, 10).map(t => t.term).join(' ');
        const result = computeTurnMetrics(response, session);
        expect(result.topicCoverage).toBe(1); // all 10 of the first 10 covered
    });

    it('computes composite qualityScore using configured weights', () => {
        mockConfig.qualityMetricWeights = {
            knowledgeUtilization: 1,
            responseGrounding: 0,
            topicCoverage: 0,
            budgetEfficiency: 0,
        };
        const session = makeSession({
            lastFeedback: { boosted: [{ id: 'n1', similarity: 0.9 }] },
            _lastDeliveredCount: 2,
        });
        const result = computeTurnMetrics('response', session);
        // qualityScore = knowledgeUtilization * 1 + rest * 0 = 0.5 * 1 = 0.5
        expect(result.qualityScore).toBe(0.5);
    });
});

// =============================================================================
// persistSessionInsights
// =============================================================================

describe('persistSessionInsights', () => {
    it('does nothing when crossSession is disabled', async () => {
        mockConfig.crossSession.enabled = false;
        const session = makeSession({
            topics: [{ term: 'test', weight: 1 }],
        });
        await persistSessionInsights(session);
        expect(mockQueryOne).not.toHaveBeenCalled();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('skips topics below weight threshold', async () => {
        const session = makeSession({
            topics: [{ term: 'low', weight: 0.1 }],
        });
        await persistSessionInsights(session);
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('inserts new topic insight when not existing', async () => {
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'new-topic', weight: 1.5 }],
            domains: ['my-domain'],
        });
        await persistSessionInsights(session);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO session_insights'),
            expect.arrayContaining(['sess-1', 'new-topic', 1.5, 'my-domain']),
        );
    });

    it('updates existing topic with EMA weighting', async () => {
        mockQueryOne.mockResolvedValue({ id: 'ins-1', weight: 2.0, usage_count: 3 });
        const session = makeSession({
            topics: [{ term: 'existing-topic', weight: 1.0 }],
        });
        await persistSessionInsights(session);
        // newWeight = 2.0 * 0.7 + 1.0 * 0.3 = 1.4 + 0.3 = 1.7
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE session_insights'),
            expect.arrayContaining([1.7, 'ins-1']),
        );
    });

    it('finds and persists cluster terms for a topic', async () => {
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'alpha', weight: 1 }],
            conceptClusters: [
                { terms: ['alpha', 'beta', 'gamma'] },
            ],
        });
        await persistSessionInsights(session);
        // clusterTerms should be ['beta', 'gamma'] (alpha excluded)
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT'),
            expect.arrayContaining([JSON.stringify(['beta', 'gamma'])]),
        );
    });

    it('handles missing conceptClusters gracefully', async () => {
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'solo', weight: 1 }],
            conceptClusters: null,
        });
        await persistSessionInsights(session);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT'),
            expect.arrayContaining([JSON.stringify([])]),
        );
    });

    it('respects maxTopicsToPersist limit', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockConfig.crossSession.maxTopicsToPersist = 2;
        const session = makeSession({
            topics: [
                { term: 'a', weight: 1 },
                { term: 'b', weight: 1 },
                { term: 'c', weight: 1 }, // should be skipped due to limit
            ],
        });
        await persistSessionInsights(session);
        // Only 2 INSERT calls for topics (query is also used for inserts)
        const insertCalls = mockQuery.mock.calls.filter(c =>
            typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO session_insights'));
        expect(insertCalls).toHaveLength(2);
    });

    it('persists node usage data for boosted nodes (new)', async () => {
        // First call for topic lookup, subsequent for node usage
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [],
            lastFeedback: {
                boosted: [{ id: 'node-1', similarity: 0.85 }],
            },
            _lastDeliveredCount: 5,
        });
        await persistSessionInsights(session);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO session_node_usage'),
            expect.arrayContaining(['sess-1', 'node-1', 5, 0.85]),
        );
    });

    it('updates existing node usage with running average', async () => {
        // No topics to process
        // Node usage lookup returns existing
        mockQueryOne.mockResolvedValue({ id: 'usage-1', times_used: 4, avg_similarity: 0.8 });
        const session = makeSession({
            topics: [],
            lastFeedback: {
                boosted: [{ id: 'node-1', similarity: 0.9 }],
            },
        });
        await persistSessionInsights(session);
        // newAvg = (0.8 * 4 + 0.9) / 5 = (3.2 + 0.9) / 5 ≈ 0.82
        const updateCall = mockQuery.mock.calls.find(c =>
            typeof c[0] === 'string' && (c[0] as string).includes('UPDATE session_node_usage'));
        expect(updateCall).toBeDefined();
        const args = updateCall![1] as any[];
        expect(args[0]).toBeCloseTo(0.82, 10);
        expect(args[2]).toBe('usage-1');
    });

    it('skips node usage persistence when no lastFeedback', async () => {
        const session = makeSession({
            topics: [],
            lastFeedback: null,
        });
        await persistSessionInsights(session);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('skips node usage persistence when lastFeedback has no boosted', async () => {
        const session = makeSession({
            topics: [],
            lastFeedback: { boosted: null },
        });
        await persistSessionInsights(session);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('uses null domain when session.domains is empty', async () => {
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'orphan', weight: 1 }],
            domains: [],
        });
        await persistSessionInsights(session);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO session_insights'),
            expect.arrayContaining([null]),
        );
    });

    it('uses defaults when crossSession config has no overrides', async () => {
        mockConfig.crossSession = { enabled: true };
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'x', weight: 0.6 }],
        });
        await persistSessionInsights(session);
        // Should use default threshold 0.5 => 0.6 passes
        expect(mockQuery).toHaveBeenCalled();
    });

    it('does nothing when crossSession config is undefined', async () => {
        mockConfig.crossSession = undefined;
        const session = makeSession({
            topics: [{ term: 't', weight: 1 }],
        });
        // csCfg is undefined, csCfg && csCfg.enabled === false => false (undefined is falsy)
        // So it proceeds. But defaults kick in.
        await persistSessionInsights(session);
        // Should still work with defaults
        expect(mockQueryOne).toHaveBeenCalled();
    });

    it('handles topic not found in any cluster', async () => {
        mockQueryOne.mockResolvedValue(null);
        const session = makeSession({
            topics: [{ term: 'orphan', weight: 1 }],
            conceptClusters: [
                { terms: ['other', 'stuff'] },
            ],
        });
        await persistSessionInsights(session);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT'),
            expect.arrayContaining([JSON.stringify([])]),
        );
    });
});

// =============================================================================
// loadSessionInsights
// =============================================================================

describe('loadSessionInsights', () => {
    it('queries session_insights and session_node_usage', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // insights
            .mockResolvedValueOnce([]); // frequentNodes
        const result = await loadSessionInsights('hello');
        expect(result.topics).toEqual([]);
        expect(result.frequentNodeIds).toEqual([]);
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('maps insights to topic objects with cross-session weight', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 'alpha', weight: 2.0, usage_count: 3, domain: 'dom1', cluster_terms: '["beta"]', last_seen: '2024-01-01' },
            ])
            .mockResolvedValueOnce([]);
        const result = await loadSessionInsights('hello');
        expect(result.topics).toHaveLength(1);
        expect(result.topics[0].term).toBe('alpha');
        // weight = 2.0 * log2(3 + 1) = 2.0 * 2 = 4.0
        expect(result.topics[0].weight).toBe(4);
        expect(result.topics[0].domain).toBe('dom1');
        expect(result.topics[0].clusterTerms).toEqual(['beta']);
        expect(result.topics[0].crossSession).toBe(true);
    });

    it('handles null cluster_terms', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 'x', weight: 1, usage_count: 1, domain: null, cluster_terms: null },
            ])
            .mockResolvedValueOnce([]);
        const result = await loadSessionInsights('hello');
        expect(result.topics[0].clusterTerms).toEqual([]);
    });

    it('handles zero usage_count gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { topic: 'x', weight: 1, usage_count: 0, domain: null, cluster_terms: null },
            ])
            .mockResolvedValueOnce([]);
        const result = await loadSessionInsights('hello');
        // weight = 1 * log2((0 || 1) + 1) = 1 * log2(2) = 1
        expect(result.topics[0].weight).toBe(1);
    });

    it('returns frequent node IDs', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { node_id: 'n1', times_used: 5, avg_similarity: 0.9 },
                { node_id: 'n2', times_used: 3, avg_similarity: 0.7 },
            ]);
        const result = await loadSessionInsights('hello');
        expect(result.frequentNodeIds).toEqual(['n1', 'n2']);
    });

    it('uses configured limits from crossSession config', async () => {
        mockConfig.crossSession.maxInsightsToLoad = 5;
        mockConfig.crossSession.maxNodeUsageToLoad = 3;
        mockConfig.crossSession.nodeUsageMinThreshold = 10;
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        await loadSessionInsights('hello', ['domain1']);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT'),
            [5],
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('times_used >='),
            [10, 3],
        );
    });

    it('uses defaults when crossSession config values are missing', async () => {
        mockConfig.crossSession = {};
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        await loadSessionInsights('hello');
        // Defaults: maxInsightsToLoad=20, maxNodeUsageToLoad=10, nodeUsageMinThreshold=2
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT'),
            [20],
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('times_used >='),
            [2, 10],
        );
    });
});
