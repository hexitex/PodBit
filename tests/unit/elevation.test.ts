/**
 * Unit tests for handlers/elevation.ts
 *
 * Tests: handleVoice, handlePromote, handleDemote.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetAccessibleDomains = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCanOverride = jest.fn<() => Promise<any>>().mockResolvedValue({ allowed: true });

const mockConfig = {
    nodes: { promoteWeight: 2.0, defaultSalience: 1.5 },
    engine: { weightCeiling: 3.0 },
};

const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRegisterBreakthrough = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('sha256-abc');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDemoteFromElite = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    getAccessibleDomains: mockGetAccessibleDomains,
    logDecision: mockLogDecision,
    canOverride: mockCanOverride,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
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

const { handleVoice, handlePromote, handleDemote } =
    await import('../../handlers/elevation.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetAccessibleDomains.mockResolvedValue([]);
    mockLogDecision.mockResolvedValue(undefined);
    mockCanOverride.mockResolvedValue({ allowed: true });
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockRegisterBreakthrough.mockResolvedValue(undefined);
    mockComputeContentHash.mockReturnValue('sha256-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockDemoteFromElite.mockResolvedValue({ success: true });
});

// =============================================================================
// handleVoice
// =============================================================================

describe('handleVoice', () => {
    it('returns error when source node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleVoice({ nodeId: 'missing' });
        expect(result.error).toBe('Node not found');
    });

    it('uses parent node as partner when parents exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source node', domain: 'science' });
        mockQuery.mockResolvedValueOnce([
            { id: 'parent-1', content: 'Parent content', domain: 'science' },
        ]); // parents query

        const result = await handleVoice({ nodeId: 'n1', mode: 'sincere' });

        expect(result.error).toBeUndefined();
        expect(result.sourceNode.id).toBe('n1');
        expect(result.partnerNode.id).toBe('parent-1');
        expect(result.mode).toBe('sincere');
        expect(result.modeInstruction).toContain('genuine');
    });

    it('uses accessible-domain random node when no parents', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source', domain: 'science' });
        mockQuery
            .mockResolvedValueOnce([])   // no parents
            .mockResolvedValueOnce([{ id: 'rand-1', content: 'Random', domain: 'science' }]); // random
        mockGetAccessibleDomains.mockResolvedValue(['science', 'math']);

        const result = await handleVoice({ nodeId: 'n1' });

        expect(result.partnerNode.id).toBe('rand-1');
        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('science');
    });

    it('returns error when no partner node found', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Lonely', domain: 'science' });
        mockQuery.mockResolvedValue([]);  // no parents, no randoms
        mockGetAccessibleDomains.mockResolvedValue([]);

        const result = await handleVoice({ nodeId: 'n1' });
        expect(result.error).toBe('No partner node found for voicing');
    });

    it('includes instruction with mode name', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source', domain: 'science' });
        mockQuery
            .mockResolvedValueOnce([{ id: 'p1', content: 'Parent', domain: 'science' }]);

        const result = await handleVoice({ nodeId: 'n1', mode: 'cynic' });
        expect(result.instruction).toContain('cynic');
        expect(result.instruction).toContain('podbit.propose');
        expect(result.modeInstruction).toContain('Challenge');
    });

    it('defaults to object-following mode', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source', domain: 'd' });
        mockQuery.mockResolvedValueOnce([{ id: 'p1', content: 'P', domain: 'd' }]);

        const result = await handleVoice({ nodeId: 'n1' });
        expect(result.mode).toBe('object-following');
    });

    it('falls back to any node when accessible domains empty', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Source', domain: 'science' });
        mockQuery
            .mockResolvedValueOnce([])   // no parents
            .mockResolvedValueOnce([{ id: 'any-node', content: 'Any', domain: 'other' }]);
        mockGetAccessibleDomains.mockResolvedValue([]); // empty

        const result = await handleVoice({ nodeId: 'n1' });
        expect(result.partnerNode.id).toBe('any-node');
    });
});

// =============================================================================
// handlePromote
// =============================================================================

describe('handlePromote', () => {
    it('returns error when canOverride denies promotion', async () => {
        mockCanOverride.mockResolvedValue({ allowed: false, reason: 'Human decision exists' });

        const result = await handlePromote({ nodeId: 'n1', reason: 'good', contributor: 'system' });
        expect(result.error).toBe('Human decision exists');
        expect(result.blocked).toBe(true);
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('returns error when node not found after override check', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne.mockResolvedValue(null); // UPDATE RETURNING returns null

        const result = await handlePromote({ nodeId: 'n1', reason: 'good', contributor: 'human' });
        expect(result.error).toBe('Node not found');
    });

    it('promotes node and returns success with composite score', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({  // UPDATE RETURNING
                id: 'n1',
                content: 'Breakthrough insight',
                node_type: 'breakthrough',
                weight: 2.0,
                domain: 'science',
                trajectory: 'knowledge',
                contributor: 'claude',
                created_at: '2024-01-01',
                content_hash: 'old-hash',
            })
            .mockResolvedValue(null);  // hash update

        mockQuery.mockResolvedValue([]); // parentRows, generativity

        const scores = { synthesis: 8, novelty: 7, testability: 6, tension_resolution: 5 };
        const result = await handlePromote({ nodeId: 'n1', reason: 'Significant', contributor: 'human', scores });

        expect(result.success).toBe(true);
        expect(result.node.id).toBe('n1');
        expect(result.node.scores.composite).toBeDefined();
        expect(result.node.scores.composite).toBeCloseTo(8 * 0.3 + 7 * 0.35 + 6 * 0.2 + 5 * 0.15, 1);
        expect(result.promotedBy).toBe('human');
        expect(mockLogDecision).toHaveBeenCalled();
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
    });

    it('boosts generative ancestors (parents and grandparents)', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne
            .mockResolvedValueOnce({
                id: 'n1', content: 'B', node_type: 'breakthrough', weight: 2.0,
                domain: 'science', trajectory: 'knowledge', contributor: 'c', created_at: '2024', content_hash: null,
            })
            .mockResolvedValue(null);

        mockQuery
            .mockResolvedValueOnce([])  // integrity: parentRows
            .mockResolvedValueOnce([   // generativity: direct parents
                { source_id: 'p1', content: 'Parent', weight: 1.0 },
            ])
            .mockResolvedValueOnce([])  // UPDATE parent weight
            .mockResolvedValueOnce([   // generativity: grandparents
                { source_id: 'gp1', content: 'Grandparent', weight: 0.8 },
            ])
            .mockResolvedValueOnce([])  // UPDATE grandparent weight
            .mockResolvedValueOnce([])  // registerBreakthrough parentNodes
            .mockResolvedValue([]);

        const result = await handlePromote({ nodeId: 'n1', reason: 'reason', contributor: 'human' });

        expect(result.generativity).not.toBeNull();
        expect(result.generativity.boostedAncestors).toBeGreaterThanOrEqual(1);
    });

    it('uses system tier when decidedByTier not provided', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQueryOne.mockResolvedValueOnce({
            id: 'n1', content: 'c', node_type: 'b', weight: 2.0, domain: 'd',
            trajectory: 't', contributor: 'c', created_at: '2024', content_hash: null,
        }).mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await handlePromote({ nodeId: 'n1', reason: 'r', contributor: 'human' });
        expect(result.node.decidedByTier).toBe('system');
        expect(mockCanOverride).toHaveBeenCalledWith('node', 'n1', 'node_type', 'system');
    });
});

// =============================================================================
// handleDemote
// =============================================================================

describe('handleDemote', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleDemote({ nodeId: 'missing' });
        expect(result.error).toContain('not found');
    });

    it('returns error when node type is not possible or elite', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'seed', weight: 1.0, domain: 'd' });
        const result = await handleDemote({ nodeId: 'n1' });
        expect(result.error).toContain('not a "possible"');
    });

    it('returns success idempotently when already synthesis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'synthesis', weight: 1.0, domain: 'd' });
        const result = await handleDemote({ nodeId: 'n1' });
        expect(result.alreadyDemoted).toBe(true);
        expect(result.newType).toBe('synthesis');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('delegates to demoteFromElite for elite_verification nodes', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'd' });
        mockDemoteFromElite.mockResolvedValue({ success: true, nodeId: 'n1' });

        const result = await handleDemote({ nodeId: 'n1', reason: 'not ready' });
        expect(mockDemoteFromElite).toHaveBeenCalledWith('n1', 'not ready', 'system');
        expect(result.success).toBe(true);
    });

    it('demotes possible node back to synthesis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.5, domain: 'science' });
        mockQuery.mockResolvedValue([]);

        const result = await handleDemote({ nodeId: 'n1', reason: 'Not ready', contributor: 'human' });

        expect(result.previousType).toBe('possible');
        expect(result.newType).toBe('synthesis');
        expect(result.reason).toBe('Not ready');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
        expect(mockLogDecision).toHaveBeenCalled();
    });

    it('uses default reason and contributor when not provided', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'possible', weight: 1.0, domain: 'd' });
        mockQuery.mockResolvedValue([]);

        const result = await handleDemote({ nodeId: 'n1' });
        expect(result.reason).toBe('Demoted via review');
    });
});
