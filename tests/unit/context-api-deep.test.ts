/**
 * Deep branch-coverage tests for context/api.ts — prepare(), update(), warmUpSession().
 * Targets uncovered branches: fallback profiles, digest substitution, compressed history,
 * history budget overflow, cross-session edge cases, compression triggering.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('Identity prompt');

function makeSession(overrides: Record<string, any> = {}) {
    return {
        id: 'sess-1',
        topics: [] as any[],
        domains: [] as string[],
        history: [] as any[],
        turnCount: 0,
        compressedHistory: null as string | null,
        compressedUpTo: 0,
        lastContext: null as any,
        lastDeliveredNodeIds: [] as string[],
        _lastDeliveredCount: 0,
        conceptClusters: [],
        ...overrides,
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

const mockGenerateDomainDigest = jest.fn<(...args: any[]) => Promise<string | null>>();

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

let configOverrides: Record<string, any> = {};

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => ({
        totalBudget: 4096,
        compressionThreshold: 0.8,
        relevanceWeights: { textSimilarity: 0.4, topicOverlap: 0.3, domainMatch: 0.2, recency: 0.1 },
        crossSession: { enabled: true, boostExisting: 0.5, dampeningNew: 0.3 },
        ...configOverrides,
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
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    generateDomainDigest: mockGenerateDomainDigest,
}));

const { prepare, update, warmUpSession } = await import('../../context/api.js');

beforeEach(() => {
    jest.clearAllMocks();
    configOverrides = {};
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
    mockGenerateDomainDigest.mockResolvedValue(null);
});

// =============================================================================
// prepare() — uncovered branches
// =============================================================================

describe('prepare — profile fallback', () => {
    it('falls back to medium profile when unknown profileKey is given', async () => {
        const result = await prepare('test', 'sess-1', { modelProfile: 'nonexistent' });

        // Should use medium budgetMultiplier (1.0) → budget = 4096 * 1.0 = 4096
        expect(result.modelProfile).toBe('nonexistent');
        expect(result.budget.total).toBe(4096);
        // selectKnowledge should have been called with medium's maxKnowledgeNodes (10)
        expect(mockSelectKnowledge).toHaveBeenCalledWith(
            'test',
            currentSession,
            expect.objectContaining({ maxNodes: 10 }),
        );
    });
});

describe('prepare — custom budget and maxNodes options', () => {
    it('respects explicit budget option over profile multiplier', async () => {
        const result = await prepare('test', 'sess-1', { budget: 2000 });

        expect(mockSelectKnowledge).toHaveBeenCalledWith(
            'test',
            currentSession,
            expect.objectContaining({ budget: 2000 }),
        );
    });

    it('respects explicit maxNodes option over profile default', async () => {
        await prepare('test', 'sess-1', { maxNodes: 3 });

        expect(mockSelectKnowledge).toHaveBeenCalledWith(
            'test',
            currentSession,
            expect.objectContaining({ maxNodes: 3 }),
        );
    });
});

describe('prepare — cross-session insights', () => {
    it('skips cross-session insights when turnCount > 1', async () => {
        currentSession.turnCount = 2;

        await prepare('test', 'sess-1');

        expect(mockLoadSessionInsights).not.toHaveBeenCalled();
    });

    it('skips cross-session insights when crossSession.enabled is false', async () => {
        configOverrides = { crossSession: { enabled: false } };

        await prepare('test', 'sess-1');

        expect(mockLoadSessionInsights).not.toHaveBeenCalled();
    });

    it('boosts existing topic weight from cross-session data', async () => {
        // Pre-seed session with a topic
        currentSession.topics.push({ term: 'quantum', weight: 0.5, firstSeen: Date.now(), lastSeen: Date.now() });

        mockLoadSessionInsights.mockResolvedValue({
            topics: [{ term: 'quantum', weight: 2.0, domain: 'physics' }],
            nodeWeights: {},
        });

        await prepare('test', 'sess-1');

        // boostExisting = 0.5 → boosted = max(0.5, 2.0 * 0.5) = max(0.5, 1.0) = 1.0
        const qt = currentSession.topics.find((t: any) => t.term === 'quantum');
        expect(qt.weight).toBe(1.0);
    });

    it('adds new cross-session topic with dampened weight', async () => {
        mockLoadSessionInsights.mockResolvedValue({
            topics: [{ term: 'new-topic', weight: 2.0, domain: 'physics' }],
            nodeWeights: {},
        });

        await prepare('test', 'sess-1');

        // dampeningNew = 0.3 → weight = 2.0 * 0.3 = 0.6
        const nt = currentSession.topics.find((t: any) => t.term === 'new-topic');
        expect(nt).toBeDefined();
        expect(nt.weight).toBeCloseTo(0.6);
    });

    it('handles loadSessionInsights failure gracefully', async () => {
        mockLoadSessionInsights.mockRejectedValue(new Error('DB error'));

        const result = await prepare('test', 'sess-1');

        // Should still return a valid context
        expect(result.sessionId).toBe('sess-1');
        expect(result.crossSessionTopics).toEqual([]);
    });

    it('limits cross-session topics to 10', async () => {
        const manyTopics = Array.from({ length: 15 }, (_, i) => ({
            term: `topic-${i}`, weight: 1.0, domain: 'test',
        }));
        mockLoadSessionInsights.mockResolvedValue({ topics: manyTopics, nodeWeights: {} });

        await prepare('test', 'sess-1');

        // All 15 topics are processed but only first 10 get merged
        // The result crossSessionTopics is sliced to 5
        expect(currentSession.topics.filter((t: any) => t.term.startsWith('topic-'))).toHaveLength(10);
    });
});

describe('prepare — identity prefix failure', () => {
    it('proceeds without identity when getPrompt throws', async () => {
        mockGetPrompt.mockRejectedValue(new Error('Prompt not found'));

        const result = await prepare('test', 'sess-1');

        // systemPrompt should still have knowledge prompt, no identity prefix
        expect(result.systemPrompt).toContain('System prompt');
        // Should NOT contain identity since it failed
        expect(result.systemPrompt).not.toContain('Identity prompt');
    });
});

describe('prepare — digest substitution (preferCompressed)', () => {
    it('substitutes digest when compact and preferCompressed profile', async () => {
        // Use small profile which has preferCompressed: true
        mockSelectKnowledge.mockResolvedValue([
            { id: 'k1', content: 'A very long knowledge node content that takes many tokens to represent', domain: 'physics', nodeType: 'seed', relevance: 0.9, tokens: 100 },
        ]);
        // Digest is shorter than the knowledge content
        mockGenerateDomainDigest.mockResolvedValue('Short digest');

        const result = await prepare('test', 'sess-1', { modelProfile: 'small' });

        expect(mockGenerateDomainDigest).toHaveBeenCalledWith('physics');
        // Knowledge should be replaced with the digest
        expect(result.knowledge).toHaveLength(1);
        expect(result.knowledge[0].nodeType).toBe('digest');
        expect(result.knowledge[0].content).toContain('Short digest');
    });

    it('keeps original knowledge when digest is larger', async () => {
        mockSelectKnowledge.mockResolvedValue([
            { id: 'k1', content: 'Short', domain: 'physics', nodeType: 'seed', relevance: 0.9, tokens: 5 },
        ]);
        // Digest is longer than original
        mockGenerateDomainDigest.mockResolvedValue('This is a much longer digest that takes more tokens than the short original knowledge content');

        const result = await prepare('test', 'sess-1', { modelProfile: 'small' });

        expect(result.knowledge[0].nodeType).toBe('seed');
        expect(result.knowledge[0].id).toBe('k1');
    });

    it('skips digest when more than 2 domains', async () => {
        mockSelectKnowledge.mockResolvedValue([
            { id: 'k1', content: 'Content A', domain: 'domain-a', nodeType: 'seed', relevance: 0.9, tokens: 10 },
            { id: 'k2', content: 'Content B', domain: 'domain-b', nodeType: 'seed', relevance: 0.8, tokens: 10 },
            { id: 'k3', content: 'Content C', domain: 'domain-c', nodeType: 'seed', relevance: 0.7, tokens: 10 },
        ]);

        await prepare('test', 'sess-1', { modelProfile: 'small' });

        expect(mockGenerateDomainDigest).not.toHaveBeenCalled();
    });

    it('skips digest when knowledge is empty', async () => {
        mockSelectKnowledge.mockResolvedValue([]);

        await prepare('test', 'sess-1', { modelProfile: 'small' });

        expect(mockGenerateDomainDigest).not.toHaveBeenCalled();
    });

    it('falls back to normal nodes when digest generation throws', async () => {
        mockSelectKnowledge.mockResolvedValue([
            { id: 'k1', content: 'Content', domain: 'physics', nodeType: 'seed', relevance: 0.9, tokens: 10 },
        ]);
        mockGenerateDomainDigest.mockRejectedValue(new Error('Digest failed'));

        const result = await prepare('test', 'sess-1', { modelProfile: 'small' });

        // Should still have the original knowledge
        expect(result.knowledge[0].id).toBe('k1');
        expect(result.knowledge[0].nodeType).toBe('seed');
    });

    it('handles null digest from generateDomainDigest', async () => {
        mockSelectKnowledge.mockResolvedValue([
            { id: 'k1', content: 'Long content that takes many tokens', domain: 'physics', nodeType: 'seed', relevance: 0.9, tokens: 50 },
        ]);
        mockGenerateDomainDigest.mockResolvedValue(null);

        const result = await prepare('test', 'sess-1', { modelProfile: 'small' });

        // digest is null → no digests pushed → digests.length == 0 → no substitution
        expect(result.knowledge[0].id).toBe('k1');
    });
});

describe('prepare — systemPrompt construction', () => {
    it('returns identityPrefix alone when knowledgePrompt is null', async () => {
        mockBuildSystemPrompt.mockReturnValue({ prompt: null, tokens: 0 });

        const result = await prepare('test', 'sess-1');

        expect(result.systemPrompt).toBe('Identity prompt');
    });

    it('returns null when both identity and knowledge are empty', async () => {
        mockBuildSystemPrompt.mockReturnValue({ prompt: null, tokens: 0 });
        mockGetPrompt.mockRejectedValue(new Error('no prompt'));

        const result = await prepare('test', 'sess-1');

        expect(result.systemPrompt).toBeNull();
    });

    it('combines identity and knowledge prompt with separator', async () => {
        const result = await prepare('test', 'sess-1');

        expect(result.systemPrompt).toContain('Identity prompt');
        expect(result.systemPrompt).toContain('---');
        expect(result.systemPrompt).toContain('System prompt');
    });
});

describe('prepare — compressed history', () => {
    it('includes compressed history as system message in context', async () => {
        currentSession.compressedHistory = 'Previous conversation about quantum physics';
        currentSession.compressedUpTo = 0;

        const result = await prepare('test', 'sess-1');

        const summaryMsg = result.history.find((h: any) => h.content.includes('Previous conversation summary'));
        expect(summaryMsg).toBeDefined();
        expect(summaryMsg.role).toBe('system');
        expect(summaryMsg.content).toContain('quantum physics');
    });
});

describe('prepare — history budget overflow', () => {
    it('stops adding history turns when budget is exceeded', async () => {
        // Fill session with many turns — each with content long enough to hit budget
        // Budget is 1024 tokens, estimateTokens = text.length / 4
        // So 1024 tokens = 4096 chars. Each turn needs to be large enough.
        currentSession.compressedUpTo = 0;
        for (let i = 0; i < 10; i++) {
            currentSession.history.push({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: 'x'.repeat(600), // 600 chars = 150 tokens each
                timestamp: Date.now(),
            });
        }

        const result = await prepare('test', 'sess-1');

        // 1024 token budget / 150 tokens per turn ≈ 6 turns max
        // The 7th would push over 1024
        expect(result.history.length).toBeLessThan(10);
        expect(result.budget.history.used).toBeLessThanOrEqual(1024);
    });
});

// =============================================================================
// update() — uncovered branches
// =============================================================================

describe('update — compression', () => {
    it('skips compression when options.compress is false', async () => {
        // Make history large enough to normally trigger compression
        currentSession.history = Array.from({ length: 20 }, (_, i) => ({
            role: 'user',
            content: 'x'.repeat(400),
            timestamp: Date.now(),
        }));

        await update('sess-1', 'response', { compress: false });

        expect(mockCompressHistory).not.toHaveBeenCalled();
    });

    it('triggers compression when history tokens exceed threshold', async () => {
        // compressionThreshold = 0.8, historyBudget = 1024
        // Need historyTokens > 1024 * 0.8 = 819.2 tokens = 3277+ chars
        currentSession.compressedUpTo = 0;
        currentSession.history = Array.from({ length: 10 }, (_, i) => ({
            role: 'user',
            content: 'y'.repeat(400), // 10 * ~408 chars per entry (role: content) > 3277
            timestamp: Date.now(),
        }));

        await update('sess-1', 'response');

        expect(mockCompressHistory).toHaveBeenCalled();
    });

    it('does not trigger compression when history tokens are below threshold', async () => {
        currentSession.compressedUpTo = 0;
        currentSession.history = [
            { role: 'user', content: 'short', timestamp: Date.now() },
        ];

        await update('sess-1', 'response');

        expect(mockCompressHistory).not.toHaveBeenCalled();
    });

    it('includes compressed history tokens in compression calculation', async () => {
        // compressedHistory adds to the token count
        currentSession.compressedHistory = 'z'.repeat(3000); // 750 tokens
        currentSession.compressedUpTo = 0;
        currentSession.history = Array.from({ length: 3 }, (_, i) => ({
            role: 'user',
            content: 'a'.repeat(200), // ~56 tokens per entry line
            timestamp: Date.now(),
        }));
        // Total: ~750 + ~170 > 819.2 threshold

        await update('sess-1', 'response');

        expect(mockCompressHistory).toHaveBeenCalled();
    });
});

describe('update — returns domains and topics', () => {
    it('returns session topics and domains in result', async () => {
        currentSession.topics = [
            { term: 'alpha', weight: 1 },
            { term: 'beta', weight: 0.5 },
        ];
        currentSession.domains = ['domain-a'];

        const result = await update('sess-1', 'response text');

        expect(result.topics).toContain('alpha');
        expect(result.domains).toContain('domain-a');
    });

    it('limits topics to 10 in result', async () => {
        currentSession.topics = Array.from({ length: 15 }, (_, i) => ({
            term: `t${i}`, weight: 1,
        }));

        const result = await update('sess-1', 'response text');

        expect(result.topics).toHaveLength(10);
    });
});

// =============================================================================
// warmUpSession() — additional edge cases
// =============================================================================

describe('warmUpSession — edge cases', () => {
    it('uses default maxReplay of 6', async () => {
        const messages = Array.from({ length: 10 }, (_, i) => ({
            role: 'user',
            content: `Msg ${i}`,
        }));

        const session = await warmUpSession('sess-1', messages);

        expect(session.turnCount).toBe(6);
        expect(session.history).toHaveLength(6);
    });

    it('handles empty messages array', async () => {
        const session = await warmUpSession('sess-1', []);

        expect(session.turnCount).toBe(0);
        expect(session.history).toHaveLength(0);
        expect(mockExtractTopics).not.toHaveBeenCalled();
    });

    it('returns existing session without replay when already warm', async () => {
        currentSession.turnCount = 1;
        const session = await warmUpSession('sess-1', [{ role: 'user', content: 'test' }]);

        expect(session).toBe(currentSession);
        expect(mockExtractTopics).not.toHaveBeenCalled();
    });
});
