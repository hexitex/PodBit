/**
 * Unit tests for handlers/feedback.ts —
 * handleFeedback (dispatch), handleRate, handleStats, handleUnrated, getNodeFeedback.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockConfig: any = {
    feedback: {
        usefulWeight: 0.2,
        notUsefulWeight: -0.1,
        harmfulWeight: -0.3,
        weightFloor: 0.1,
    },
    engine: {
        weightFloor: 0.1,
    },
};

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockInvalidateKnowledgeCache = jest.fn<() => void>();

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const {
    handleFeedback, handleRate, handleStats, handleUnrated, getNodeFeedback,
    getWeightAdjustments, getWeightFloor,
} = await import('../../handlers/feedback.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLogDecision.mockResolvedValue(undefined);
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);

    mockConfig.feedback.usefulWeight = 0.2;
    mockConfig.feedback.notUsefulWeight = -0.1;
    mockConfig.feedback.harmfulWeight = -0.3;
    mockConfig.feedback.weightFloor = 0.1;
});

// =============================================================================
// getWeightAdjustments / getWeightFloor helpers
// =============================================================================

describe('getWeightAdjustments / getWeightFloor', () => {
    it('returns adjustments from config', () => {
        const adj = getWeightAdjustments();
        expect(adj[1]).toBe(0.2);
        expect(adj[0]).toBe(-0.1);
        expect(adj[-1]).toBe(-0.3);
    });

    it('returns weight floor from config', () => {
        expect(getWeightFloor()).toBe(0.1);
    });
});

// =============================================================================
// handleFeedback — dispatch
// =============================================================================

describe('handleFeedback dispatch', () => {
    it('dispatches to handleRate', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', weight: 1.0, domain: 'sci', node_type: 'seed' });
        mockQuery.mockResolvedValue([{ id: 'fb-1', created_at: '2024-01-01' }]);

        const result = await handleFeedback({ action: 'rate', nodeId: 'n1', rating: 1 });

        expect(result.success).toBe(true);
        expect(result.rating).toBe(1);
    });

    it('dispatches to handleStats', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        const result = await handleFeedback({ action: 'stats' });

        expect(result.totalFeedback).toBeDefined();
    });

    it('dispatches to handleUnrated', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        const result = await handleFeedback({ action: 'unrated' });

        expect(result.total).toBeDefined();
        expect(result.nodes).toBeDefined();
    });

    it('returns error for unknown action', async () => {
        const result = await handleFeedback({ action: 'bogus' });
        expect(result.error).toContain('Unknown action');
    });
});

// =============================================================================
// handleRate
// =============================================================================

describe('handleRate', () => {
    const makeNode = (overrides: Record<string, any> = {}) => ({
        id: 'node-1',
        content: 'Test content',
        weight: 1.0,
        domain: 'science',
        node_type: 'seed',
        ...overrides,
    });

    function setupRate(node: any) {
        mockQueryOne.mockResolvedValue(node);
        mockQuery.mockResolvedValue([{ id: 'fb-1', created_at: '2024-01-01T00:00:00Z' }]);
    }

    it('returns error when nodeId missing', async () => {
        const result = await handleRate({ rating: 1 });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when rating missing', async () => {
        const result = await handleRate({ nodeId: 'n1' });
        expect(result.error).toContain('rating is required');
    });

    it('returns error when rating is invalid', async () => {
        const result = await handleRate({ nodeId: 'n1', rating: 5 });
        expect(result.error).toContain('must be 1');
    });

    it('returns error when source is invalid', async () => {
        const result = await handleRate({ nodeId: 'n1', rating: 1, source: 'bot' });
        expect(result.error).toContain('source must be one of');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleRate({ nodeId: 'ghost', rating: 1 });
        expect(result.error).toContain('not found');
    });

    it('increases weight by usefulWeight for rating=1', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        const result = await handleRate({ nodeId: 'node-1', rating: 1 });

        expect(result.success).toBe(true);
        expect(result.weightAfter).toBeCloseTo(1.2, 5);
        expect(result.ratingLabel).toBe('useful');
    });

    it('decreases weight by notUsefulWeight for rating=0', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        const result = await handleRate({ nodeId: 'node-1', rating: 0 });

        expect(result.weightAfter).toBeCloseTo(0.9, 5);
        expect(result.ratingLabel).toBe('not useful');
    });

    it('halves weight for rating=-1 from human source', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        const result = await handleRate({ nodeId: 'node-1', rating: -1, source: 'human' });

        expect(result.weightAfter).toBeCloseTo(0.5, 5); // 1.0 / 2
        expect(result.ratingLabel).toBe('harmful');
    });

    it('uses harmfulWeight delta for rating=-1 from auto source (not halving)', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        const result = await handleRate({ nodeId: 'node-1', rating: -1, source: 'auto' });

        // Auto uses adjustment (-0.3), not halving
        expect(result.weightAfter).toBeCloseTo(0.7, 5);
    });

    it('enforces weight floor of 0.1', async () => {
        setupRate(makeNode({ weight: 0.15 }));

        const result = await handleRate({ nodeId: 'node-1', rating: -1, source: 'agent' });

        expect(result.weightAfter).toBeCloseTo(0.1, 5); // floor at 0.1
    });

    it('auto-demotes "possible" nodes to "synthesis" on human feedback', async () => {
        setupRate(makeNode({ weight: 1.0, node_type: 'possible', domain: 'science' }));

        const result = await handleRate({ nodeId: 'node-1', rating: 1, source: 'human' });

        expect(result.demoted).toBe(true);
        expect(result.previousType).toBe('possible');
        expect(result.newType).toBe('synthesis');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');

        const demoteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("node_type = 'synthesis'")
        );
        expect(demoteCall).toBeDefined();
    });

    it('does NOT auto-demote "possible" on auto-source feedback', async () => {
        setupRate(makeNode({ weight: 1.0, node_type: 'possible' }));

        const result = await handleRate({ nodeId: 'node-1', rating: 0, source: 'auto' });

        expect(result.demoted).toBeUndefined();
        const demoteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("node_type = 'synthesis'")
        );
        expect(demoteCall).toBeUndefined();
    });

    it('does NOT demote non-possible node types', async () => {
        setupRate(makeNode({ weight: 1.0, node_type: 'seed' }));

        const result = await handleRate({ nodeId: 'node-1', rating: 1, source: 'human' });

        expect(result.demoted).toBeUndefined();
    });

    it('calls logDecision with weight change audit', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        await handleRate({ nodeId: 'node-1', rating: 1, contributor: 'user-1' });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'weight', '1', '1.2', 'human', 'user-1',
            expect.stringContaining('useful')
        );
    });

    it('returns weightChange in result', async () => {
        setupRate(makeNode({ weight: 1.0 }));

        const result = await handleRate({ nodeId: 'node-1', rating: 1 });

        expect(result.weightChange).toBeCloseTo(0.2, 3);
    });
});

// =============================================================================
// handleStats
// =============================================================================

describe('handleStats', () => {
    it('returns zero stats when no feedback', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ total: 0 })    // totalFeedback
            .mockResolvedValueOnce({ covered: 0 })  // nodesCovered
            .mockResolvedValueOnce({ avg_change: null }); // avgWeightChange
        mockQuery
            .mockResolvedValueOnce([]) // byRating
            .mockResolvedValueOnce([]) // bySource
            .mockResolvedValueOnce([]); // recentFeedback

        const result = await handleStats({});

        expect(result.totalFeedback).toBe(0);
        expect(result.byRating.useful).toBe(0);
        expect(result.byRating.notUseful).toBe(0);
        expect(result.byRating.harmful).toBe(0);
        expect(result.nodesCovered).toBe(0);
        expect(result.avgWeightChange).toBe(0);
    });

    it('aggregates byRating correctly', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ total: 10 })
            .mockResolvedValueOnce({ covered: 8 })
            .mockResolvedValueOnce({ avg_change: 0.05 });
        mockQuery
            .mockResolvedValueOnce([
                { rating: 1, count: '7' },
                { rating: 0, count: '2' },
                { rating: -1, count: '1' },
            ])
            .mockResolvedValueOnce([{ source: 'human', count: '8' }, { source: 'auto', count: '2' }])
            .mockResolvedValueOnce([]);

        const result = await handleStats({});

        expect(result.totalFeedback).toBe(10);
        expect(result.byRating.useful).toBe(7);
        expect(result.byRating.notUseful).toBe(2);
        expect(result.byRating.harmful).toBe(1);
        expect(result.bySource.human).toBe(8);
        expect(result.bySource.auto).toBe(2);
        expect(result.nodesCovered).toBe(8);
    });

    it('returns mapped recentFeedback rows', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ total: 1 })
            .mockResolvedValueOnce({ covered: 1 })
            .mockResolvedValueOnce({ avg_change: 0.1 });
        mockQuery
            .mockResolvedValueOnce([]) // byRating
            .mockResolvedValueOnce([]) // bySource
            .mockResolvedValueOnce([{
                id: 'fb-1', node_id: 'n1', rating: 1, source: 'human',
                contributor: 'user-1', note: 'Great', weight_before: 1.0, weight_after: 1.2,
                created_at: '2024-01-01', content: 'Node content', domain: 'science', node_type: 'seed',
            }]);

        const result = await handleStats({});

        expect(result.recentFeedback).toHaveLength(1);
        expect(result.recentFeedback[0].ratingLabel).toBe('useful');
        expect(result.recentFeedback[0].node.domain).toBe('science');
    });

    it('applies domain filter', async () => {
        mockQueryOne.mockResolvedValue({ total: 0, covered: 0, avg_change: null });
        mockQuery.mockResolvedValue([]);

        await handleStats({ domain: 'physics' });

        const firstCall = mockQueryOne.mock.calls[0] as any[];
        // Domain param should be present in the query params
        expect(firstCall[1]).toContain('physics');
    });
});

// =============================================================================
// handleUnrated
// =============================================================================

describe('handleUnrated', () => {
    it('returns empty list when no unrated nodes', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        const result = await handleUnrated({});

        expect(result.total).toBe(0);
        expect(result.count).toBe(0);
        expect(result.nodes).toHaveLength(0);
    });

    it('maps unrated nodes to expected shape', async () => {
        mockQueryOne.mockResolvedValue({ total: 1 });
        mockQuery.mockResolvedValue([{
            id: 'n1', content: 'Unrated node', node_type: 'seed', domain: 'tech',
            weight: 0.9, salience: 0.5, specificity: 1.2, contributor: 'human',
            created_at: '2024-01-01T00:00:00Z',
        }]);

        const result = await handleUnrated({});

        expect(result.nodes[0].id).toBe('n1');
        expect(result.nodes[0].type).toBe('seed');
        expect(result.nodes[0].createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('applies domain and nodeType filters', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await handleUnrated({ domain: 'biology', nodeType: 'synthesis' });

        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('biology');
        expect(params).toContain('synthesis');
    });

    it('applies minWeight and maxWeight filters', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await handleUnrated({ minWeight: 0.5, maxWeight: 1.5 });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(0.5);
        expect(params).toContain(1.5);
    });
});

// =============================================================================
// getNodeFeedback
// =============================================================================

describe('getNodeFeedback', () => {
    it('returns empty array when no feedback', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await getNodeFeedback('node-1');

        expect(result).toHaveLength(0);
    });

    it('parses context JSON when present', async () => {
        mockQuery.mockResolvedValue([{
            id: 'fb-1', node_id: 'node-1', rating: 1, source: 'human',
            contributor: 'user', note: null,
            context: '{"domain":"science","model":"gpt-4"}',
            weight_before: 1.0, weight_after: 1.2, created_at: '2024-01-01',
        }]);

        const result = await getNodeFeedback('node-1');

        expect(result[0].context).toEqual({ domain: 'science', model: 'gpt-4' });
    });

    it('sets context to null when field is null', async () => {
        mockQuery.mockResolvedValue([{
            id: 'fb-1', node_id: 'node-1', rating: 0, source: 'auto',
            contributor: null, note: null, context: null,
            weight_before: 1.0, weight_after: 0.9, created_at: '2024-01-01',
        }]);

        const result = await getNodeFeedback('node-1');

        expect(result[0].context).toBeNull();
    });
});
