/**
 * Unit tests for handlers/elevation.ts —
 * handleVoice, handlePromote, handleDemote.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetAccessibleDomains = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCanOverride = jest.fn<() => Promise<any>>().mockResolvedValue({ allowed: true });
const mockInvalidateKnowledgeCache = jest.fn<(domain: string) => Promise<void>>().mockResolvedValue(undefined);
const mockRegisterBreakthrough = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('new-hash-abc');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDemoteFromElite = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

const mockAppConfig = {
    nodes: { promoteWeight: 2.0, defaultSalience: 0.8 },
    engine: { weightCeiling: 3.0 },
};

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    getAccessibleDomains: mockGetAccessibleDomains,
    logDecision: mockLogDecision,
    canOverride: mockCanOverride,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../handlers/breakthrough-registry.js', () => ({
    registerBreakthrough: mockRegisterBreakthrough,
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

jest.unstable_mockModule('../../core/elite-pool.js', () => ({
    demoteFromElite: mockDemoteFromElite,
}));

const { handleVoice, handlePromote, handleDemote } = await import('../../handlers/elevation.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetAccessibleDomains.mockResolvedValue([]);
    mockLogDecision.mockResolvedValue(undefined);
    mockCanOverride.mockResolvedValue({ allowed: true });
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockRegisterBreakthrough.mockResolvedValue(undefined);
    mockComputeContentHash.mockReturnValue('new-hash-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockDemoteFromElite.mockResolvedValue({ success: true });
});

// =============================================================================
// handleVoice
// =============================================================================

describe('handleVoice', () => {
    it('returns error when source node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.error).toContain('not found');
    });

    it('returns source and partner nodes from parents when parent exists', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source content', domain: 'science' });
        mockQuery.mockResolvedValueOnce([{ id: 'parent1', content: 'Parent content', domain: 'science' }]);

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.sourceNode.id).toBe('n1');
        expect(result.partnerNode.id).toBe('parent1');
    });

    it('uses random high-weight node when no parents', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source content', domain: 'science' });
        mockQuery
            .mockResolvedValueOnce([])  // no parents
            .mockResolvedValueOnce([{ id: 'random1', content: 'Random node', domain: 'math' }]); // random node

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.partnerNode.id).toBe('random1');
    });

    it('returns error when no partner node found', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source', domain: 'science' });
        mockQuery
            .mockResolvedValueOnce([])  // no parents
            .mockResolvedValueOnce([]); // no random nodes

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.error).toContain('No partner node found');
    });

    it('defaults to object-following mode', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', domain: 'd' });
        mockQuery.mockResolvedValueOnce([{ id: 'p1', content: 'c', domain: 'd' }]);

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.mode).toBe('object-following');
    });

    it('applies custom mode from params', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', domain: 'd' });
        mockQuery.mockResolvedValueOnce([{ id: 'p1', content: 'c', domain: 'd' }]);

        const result = await handleVoice({ nodeId: 'n1', mode: 'cynic' });

        expect(result.mode).toBe('cynic');
        expect(result.modeInstruction).toContain('Challenge');
    });

    it('includes instruction to use podbit.propose to save the result', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', domain: 'd' });
        mockQuery.mockResolvedValueOnce([{ id: 'p1', content: 'c', domain: 'd' }]);

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.instruction).toContain('podbit.propose');
        expect(result.instruction).toContain('voiced');
    });

    it('restricts random partner to accessible domains', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', domain: 'science' });
        mockGetAccessibleDomains.mockResolvedValue(['science', 'math']);
        mockQuery
            .mockResolvedValueOnce([])  // no parents
            .mockResolvedValueOnce([{ id: 'r1', content: 'c', domain: 'math' }]);

        await handleVoice({ nodeId: 'n1' });

        // The second query call (random selection) should include 'science' and 'math' in params
        const [, params] = mockQuery.mock.calls[1] as any[];
        expect(params).toContain('science');
        expect(params).toContain('math');
    });
});

// =============================================================================
// handlePromote
// =============================================================================

describe('handlePromote', () => {
    it('returns blocked error when tier override not allowed', async () => {
        mockCanOverride.mockResolvedValue({ allowed: false, reason: 'Tier 2 cannot override Tier 1 decision' });

        const result = await handlePromote({ nodeId: 'n1', reason: 'Great', contributor: 'human' });

        expect(result.error).toContain('Tier 2');
        expect(result.blocked).toBe(true);
    });

    it('returns error when node not found after update', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne.mockResolvedValue(null); // UPDATE RETURNING returns null

        const result = await handlePromote({ nodeId: 'n1', reason: 'Reason', contributor: 'human' });

        expect(result.error).toContain('not found');
    });

    it('promotes node and returns success with node info', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'Content', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'alice', created_at: '2024-01-01', content_hash: 'old-hash', trajectory: 'knowledge' })
            .mockResolvedValueOnce(null); // hash update

        const result = await handlePromote({ nodeId: 'n1', reason: 'Novel insight', contributor: 'human' });

        expect(result.success).toBe(true);
        expect(result.node.id).toBe('n1');
        expect(result.promotedBy).toBe('human');
        expect(result.reason).toBe('Novel insight');
    });

    it('computes composite score from individual dimension scores', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null);

        const scores = { synthesis: 8, novelty: 7, testability: 6, tension_resolution: 5 };

        const result = await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'c', scores });

        // 8*0.3 + 7*0.35 + 6*0.2 + 5*0.15 = 2.4 + 2.45 + 1.2 + 0.75 = 6.8
        expect(result.node.scores.composite).toBeCloseTo(6.8, 1);
    });

    it('uses system tier when decidedByTier not provided', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null);

        await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human' });

        expect(mockCanOverride).toHaveBeenCalledWith('node', 'n1', 'node_type', 'system');
    });

    it('passes decidedByTier to canOverride when provided', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null);

        await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human', decidedByTier: '2' });

        expect(mockCanOverride).toHaveBeenCalledWith('node', 'n1', 'node_type', '2');
    });

    it('calls logDecision after promotion', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null);

        await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human' });

        expect(mockLogDecision).toHaveBeenCalledWith('node', 'n1', 'node_type', null, 'breakthrough', expect.any(String), 'human', 'r');
    });

    it('invalidates knowledge cache for the domain after promotion', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null);

        await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human' });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
    });

    it('includes generativity info when ancestors are boosted', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'c', node_type: 'breakthrough', weight: 2.0, domain: 'science', contributor: 'a', created_at: '2024-01-01', content_hash: null, trajectory: 'knowledge' })
            .mockResolvedValueOnce(null); // hash update
        // boostGenerativeAncestors: parents query returns one parent
        mockQuery
            .mockResolvedValueOnce([])  // parent hash query (integrity)
            .mockResolvedValueOnce([{ source_id: 'parent1', content: 'p', weight: 1.5 }]) // parents for boost
            .mockResolvedValueOnce([])  // grandparents
            .mockResolvedValueOnce([])  // parent nodes for registry
            .mockResolvedValue([]);

        const result = await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human' });

        expect(result.generativity).toBeDefined();
        expect(result.generativity.boostedAncestors).toBe(1);
    });
});

// =============================================================================
// handleDemote
// =============================================================================

describe('handleDemote', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleDemote({ nodeId: 'n1' });

        expect(result.error).toContain('not found');
    });

    it('returns alreadyDemoted=true when node is already synthesis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'synthesis', weight: 1.0, domain: 'science' });

        const result = await handleDemote({ nodeId: 'n1', reason: 'Test' });

        expect(result.alreadyDemoted).toBe(true);
        expect(result.previousType).toBe('synthesis');
        expect(result.newType).toBe('synthesis');
    });

    it('delegates to demoteFromElite for elite_verification nodes', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });
        mockDemoteFromElite.mockResolvedValue({ success: true, demoted: true });

        const result = await handleDemote({ nodeId: 'n1', reason: 'Not elite' });

        expect(mockDemoteFromElite).toHaveBeenCalledWith('n1', 'Not elite', 'system');
        expect(result.success).toBe(true);
    });

    it('returns error when node type is not possible, synthesis, or elite', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'voiced', weight: 1.0, domain: 'science' });

        const result = await handleDemote({ nodeId: 'n1' });

        expect(result.error).toContain('not a "possible" breakthrough');
    });

    it('demotes possible node back to synthesis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.5, domain: 'science' });

        const result = await handleDemote({ nodeId: 'n1', reason: 'Not ready', contributor: 'alice' });

        expect(result.previousType).toBe('possible');
        expect(result.newType).toBe('synthesis');
        expect(result.reason).toBe('Not ready');
    });

    it('invalidates knowledge cache for domain when demoting possible node', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.5, domain: 'physics' });

        await handleDemote({ nodeId: 'n1' });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('physics');
    });

    it('does not invalidate cache when domain is null', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.5, domain: null });

        await handleDemote({ nodeId: 'n1' });

        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });

    it('logs demotion decision', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.5, domain: 'science' });

        await handleDemote({ nodeId: 'n1', reason: 'Demotion reason', contributor: 'bob' });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'node_type', 'possible', 'synthesis', 'bob', 'demotion', 'Demotion reason'
        );
    });
});
