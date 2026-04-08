/**
 * Unit tests for context/api.ts — prepare(), update(), warmUpSession().
 *
 * Mocks: prompts.js, context/types.js, context/session.js, context/topics.js,
 * context/knowledge.js, context/feedback.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('Identity prompt');

function makeSession() {
    return {
        id: 'sess-1',
        topics: [],
        domains: [],
        history: [],
        turnCount: 0,
        compressedHistory: null,
        compressedUpTo: 0,
        lastContext: null,
        lastDeliveredNodeIds: [],
        _lastDeliveredCount: 0,
        conceptClusters: [],
    };
}

let currentSession = makeSession();

const mockGetOrCreateSession = jest.fn<(id: string) => any>(() => currentSession);
const mockGetSession = jest.fn<(id: string) => any>(() => currentSession);

const mockExtractTopics = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
    keywords: [{ term: 'test', weight: 1 }],
    domains: ['test-domain'],
});

const mockDetectIntent = jest.fn<(msg: string) => any>().mockReturnValue({
    intent: 'retrieval',
    confidence: 0.8,
});

const mockGetIntentWeights = jest.fn<(...args: any[]) => any>().mockReturnValue({
    textSimilarity: 0.4,
    topicOverlap: 0.3,
    domainMatch: 0.2,
    recency: 0.1,
});

const mockSelectKnowledge = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([
    { id: 'k1', content: 'Knowledge fact', domain: 'test', nodeType: 'seed', relevance: 0.9, tokens: 10 },
]);

const mockBuildSystemPrompt = jest.fn<(...args: any[]) => any>().mockReturnValue({
    prompt: 'System prompt with knowledge',
    tokens: 50,
});

const mockCompressHistory = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ compressed: false });
const mockDetectKnowledgeUsage = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
    usedNodeIds: ['k1'],
    unusedNodeIds: [],
});
const mockComputeTurnMetrics = jest.fn<(...args: any[]) => any>().mockReturnValue({
    knowledgeUtilization: 0.8,
    responseGrounding: 0.7,
});
const mockLoadSessionInsights = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
    topics: [],
    nodeWeights: {},
});

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));
jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => ({
        totalBudget: 4096,
        compressionThreshold: 0.8,
        relevanceWeights: { textSimilarity: 0.4, topicOverlap: 0.3, domainMatch: 0.2, recency: 0.1 },
        crossSession: { enabled: true, boostExisting: 0.5, dampeningNew: 0.3 },
    }),
    getModelProfiles: () => ({
        small: { budgetMultiplier: 0.5, maxKnowledgeNodes: 5, preferCompressed: true },
        medium: { budgetMultiplier: 1.0, maxKnowledgeNodes: 10, preferCompressed: false },
        large: { budgetMultiplier: 1.5, maxKnowledgeNodes: 20, preferCompressed: false },
    }),
    estimateTokens: (text: string) => Math.ceil((text || '').length / 4),
    getDynamicBudgets: () => ({ total: 4096, knowledge: 2048, history: 1024, response: 1024 }),
}));
jest.unstable_mockModule('../../context/session.js', () => ({
    getSession: mockGetSession,
    getOrCreateSession: mockGetOrCreateSession,
}));
jest.unstable_mockModule('../../context/topics.js', () => ({
    extractTopics: mockExtractTopics,
}));
jest.unstable_mockModule('../../context/knowledge.js', () => ({
    detectIntent: mockDetectIntent,
    getIntentWeights: mockGetIntentWeights,
    selectKnowledge: mockSelectKnowledge,
    buildSystemPrompt: mockBuildSystemPrompt,
}));
jest.unstable_mockModule('../../context/feedback.js', () => ({
    compressHistory: mockCompressHistory,
    detectKnowledgeUsage: mockDetectKnowledgeUsage,
    computeTurnMetrics: mockComputeTurnMetrics,
    loadSessionInsights: mockLoadSessionInsights,
}));

const { prepare, update, warmUpSession } = await import('../../context/api.js');

beforeEach(() => {
    jest.resetAllMocks();
    currentSession = makeSession();
    mockGetOrCreateSession.mockImplementation(() => currentSession);
    mockGetSession.mockImplementation(() => currentSession);
    mockExtractTopics.mockResolvedValue({ keywords: [{ term: 'test', weight: 1 }], domains: ['test-domain'] });
    mockDetectIntent.mockReturnValue({ intent: 'retrieval', confidence: 0.8 });
    mockGetIntentWeights.mockReturnValue({ textSimilarity: 0.4, topicOverlap: 0.3, domainMatch: 0.2, recency: 0.1 });
    mockSelectKnowledge.mockResolvedValue([{ id: 'k1', content: 'Knowledge', domain: 'test', nodeType: 'seed', relevance: 0.9, tokens: 10 }]);
    mockBuildSystemPrompt.mockReturnValue({ prompt: 'System prompt', tokens: 50 });
    mockGetPrompt.mockResolvedValue('Identity prompt');
    mockCompressHistory.mockResolvedValue({ compressed: false });
    mockDetectKnowledgeUsage.mockResolvedValue({ usedNodeIds: ['k1'], unusedNodeIds: [] });
    mockComputeTurnMetrics.mockReturnValue({ knowledgeUtilization: 0.8, responseGrounding: 0.7 });
    mockLoadSessionInsights.mockResolvedValue({ topics: [], nodeWeights: {} });
});

// =============================================================================
// prepare()
// =============================================================================

describe('prepare', () => {
    it('returns a complete context package', async () => {
        const result = await prepare('What is quantum computing?', 'sess-1');

        expect(result.sessionId).toBe('sess-1');
        expect(result.systemPrompt).toContain('Identity prompt');
        expect(result.knowledge).toHaveLength(1);
        expect(result.knowledge[0].id).toBe('k1');
        expect(result.intent.intent).toBe('retrieval');
        expect(result.budget).toBeDefined();
        expect(result.turnCount).toBe(1);
    });

    it('extracts topics from message', async () => {
        await prepare('quantum entanglement', 'sess-1');

        expect(mockExtractTopics).toHaveBeenCalledWith('quantum entanglement', currentSession);
    });

    it('detects intent from message', async () => {
        await prepare('how does X work?', 'sess-1');

        expect(mockDetectIntent).toHaveBeenCalledWith('how does X work?');
    });

    it('selects knowledge with intent-adjusted weights', async () => {
        await prepare('test message', 'sess-1');

        expect(mockSelectKnowledge).toHaveBeenCalledWith(
            'test message',
            currentSession,
            expect.objectContaining({ weights: expect.any(Object) }),
        );
    });

    it('increments session turnCount', async () => {
        expect(currentSession.turnCount).toBe(0);

        await prepare('message 1', 'sess-1');
        expect(currentSession.turnCount).toBe(1);

        await prepare('message 2', 'sess-1');
        expect(currentSession.turnCount).toBe(2);
    });

    it('adds message to session history', async () => {
        await prepare('my message', 'sess-1');

        expect(currentSession.history).toHaveLength(1);
        expect(currentSession.history[0].role).toBe('user');
        expect(currentSession.history[0].content).toBe('my message');
    });

    it('uses medium profile by default', async () => {
        const result = await prepare('test', 'sess-1');

        expect(result.modelProfile).toBe('medium');
    });

    it('respects custom modelProfile option', async () => {
        const result = await prepare('test', 'sess-1', { modelProfile: 'small' });

        expect(result.modelProfile).toBe('small');
    });

    it('includes budget status in response', async () => {
        const result = await prepare('test', 'sess-1');

        expect(result.budget.total).toBeGreaterThan(0);
        expect(result.budget.knowledge).toBeDefined();
        expect(result.budget.history).toBeDefined();
        expect(result.budget.response).toBeDefined();
    });

    it('warm-starts from cross-session insights on first turn', async () => {
        mockLoadSessionInsights.mockResolvedValue({
            topics: [{ term: 'prior-topic', weight: 2.0, domain: 'test' }],
            nodeWeights: {},
        });

        const result = await prepare('new session', 'sess-1');

        expect(mockLoadSessionInsights).toHaveBeenCalled();
        expect(result.crossSessionTopics.length).toBeGreaterThan(0);
        expect(result.crossSessionTopics[0].term).toBe('prior-topic');
    });

    it('caches lastContext on session', async () => {
        await prepare('test', 'sess-1');

        expect(currentSession.lastContext).toBeDefined();
        expect(currentSession.lastContext!.knowledgeCount).toBe(1);
    });

    it('tracks delivered node IDs', async () => {
        await prepare('test', 'sess-1');

        expect(currentSession.lastDeliveredNodeIds).toEqual(['k1']);
    });

    it('returns null systemPrompt when no knowledge and no identity', async () => {
        mockBuildSystemPrompt.mockReturnValue({ prompt: null, tokens: 0 });
        mockGetPrompt.mockRejectedValue(new Error('no prompt'));

        const result = await prepare('test', 'sess-1');

        expect(result.systemPrompt).toBeNull();
    });
});

// =============================================================================
// update()
// =============================================================================

describe('update', () => {
    it('returns error when session not found', async () => {
        mockGetSession.mockReturnValue(null);

        const result = await update('nonexistent', 'response text');

        expect(result.error).toBe('Session not found');
    });

    it('adds response to session history', async () => {
        const result = await update('sess-1', 'The answer is 42');

        expect(currentSession.history).toHaveLength(1);
        expect(currentSession.history[0].role).toBe('assistant');
        expect(currentSession.history[0].content).toBe('The answer is 42');
    });

    it('increments turnCount', async () => {
        expect(currentSession.turnCount).toBe(0);

        await update('sess-1', 'response');

        expect(currentSession.turnCount).toBe(1);
    });

    it('extracts topics from response', async () => {
        await update('sess-1', 'quantum entanglement is fascinating');

        expect(mockExtractTopics).toHaveBeenCalledWith('quantum entanglement is fascinating', currentSession);
    });

    it('detects knowledge usage in response', async () => {
        await update('sess-1', 'response text');

        expect(mockDetectKnowledgeUsage).toHaveBeenCalledWith('response text', currentSession);
    });

    it('computes turn metrics', async () => {
        await update('sess-1', 'response text');

        expect(mockComputeTurnMetrics).toHaveBeenCalledWith('response text', currentSession);
    });

    it('returns feedback and metrics', async () => {
        const result = await update('sess-1', 'response');

        expect(result.feedback).toBeDefined();
        expect(result.metrics).toBeDefined();
        expect(result.turnCount).toBe(1);
    });
});

// =============================================================================
// warmUpSession()
// =============================================================================

describe('warmUpSession', () => {
    it('replays messages into session', async () => {
        const messages = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
        ];

        const session = await warmUpSession('sess-1', messages);

        expect(session.turnCount).toBe(2);
        expect(session.history).toHaveLength(2);
        expect(mockExtractTopics).toHaveBeenCalledTimes(2);
    });

    it('limits replay to maxReplay', async () => {
        const messages = Array.from({ length: 20 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
        }));

        const session = await warmUpSession('sess-1', messages, 4);

        expect(session.turnCount).toBe(4);
    });

    it('skips replay when session already warm', async () => {
        currentSession.turnCount = 5; // already warm

        const session = await warmUpSession('sess-1', [{ role: 'user', content: 'test' }]);

        expect(mockExtractTopics).not.toHaveBeenCalled();
        expect(session.turnCount).toBe(5); // unchanged
    });
});
