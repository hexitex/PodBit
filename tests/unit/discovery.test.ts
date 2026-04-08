/**
 * Unit tests for handlers/discovery.ts — handleTensions, handleQuestion, handleValidate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFindTensions = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetSourceNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core.js', () => ({
    findTensions: mockFindTensions,
    queryOne: mockQueryOne,
    getSourceNodes: mockGetSourceNodes,
}));

const { handleTensions, handleQuestion, handleValidate } =
    await import('../../handlers/discovery.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockFindTensions.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetSourceNodes.mockResolvedValue([]);
});

// =============================================================================
// handleTensions
// =============================================================================

describe('handleTensions', () => {
    it('returns empty tensions list when none found', async () => {
        mockFindTensions.mockResolvedValue([]);
        const result = await handleTensions({ limit: 10, domain: null });

        expect(result.count).toBe(0);
        expect(result.tensions).toEqual([]);
        expect(result.domain).toBe('all');
    });

    it('maps tension pairs with rounded similarity', async () => {
        mockFindTensions.mockResolvedValue([
            {
                nodeA: { id: 'n1', content: 'Claim A', domain: 'science' },
                nodeB: { id: 'n2', content: 'Claim B', domain: 'philosophy' },
                similarity: 0.87654,
                tensionScore: 0.45,
                signals: { negation: true },
            },
        ]);

        const result = await handleTensions({ limit: 5 });

        expect(result.count).toBe(1);
        expect(result.tensions[0].similarity).toBe(0.88); // rounded to 2dp
        expect(result.tensions[0].nodeA.id).toBe('n1');
        expect(result.tensions[0].nodeB.domain).toBe('philosophy');
        expect(result.tensions[0].signals).toEqual({ negation: true });
    });

    it('passes domain filter to findTensions', async () => {
        await handleTensions({ domain: 'physics', limit: 5 });

        expect(mockFindTensions).toHaveBeenCalledWith(5, 'physics');
        const result = await handleTensions({ domain: 'physics', limit: 5 });
        expect(result.domain).toBe('physics');
    });

    it('uses default limit=10 and domain=null', async () => {
        await handleTensions({});
        expect(mockFindTensions).toHaveBeenCalledWith(10, null);
    });

    it('includes all-domain note when no domain filter', async () => {
        const result = await handleTensions({});
        expect(result.note).toContain('Cross-domain');
    });

    it('includes domain-specific note when domain given', async () => {
        const result = await handleTensions({ domain: 'biology' });
        expect(result.note).toContain('biology');
    });
});

// =============================================================================
// handleQuestion
// =============================================================================

describe('handleQuestion', () => {
    it('returns error when nodeA not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleQuestion({ nodeIdA: 'missing-a', nodeIdB: 'n2' });

        expect(result.error).toBe('One or both nodes not found');
    });

    it('returns error when nodeB not found', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'Node A content', domain: 'science' })
            .mockResolvedValueOnce(null);

        const result = await handleQuestion({ nodeIdA: 'n1', nodeIdB: 'missing-b' });

        expect(result.error).toBe('One or both nodes not found');
    });

    it('returns context with both nodes and instruction', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'Node A content', domain: 'science' })
            .mockResolvedValueOnce({ id: 'n2', content: 'Node B content', domain: 'philosophy' });

        const result = await handleQuestion({ nodeIdA: 'n1', nodeIdB: 'n2' });

        expect(result.error).toBeUndefined();
        expect(result.nodeA).toEqual({ id: 'n1', content: 'Node A content', domain: 'science' });
        expect(result.nodeB).toEqual({ id: 'n2', content: 'Node B content', domain: 'philosophy' });
        expect(result.instruction).toContain('research question');
        expect(result.instruction).toContain('podbit.propose');
    });

    it('fetches nodes with archived=FALSE filter', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', content: 'A', domain: 'd1' })
            .mockResolvedValueOnce({ id: 'n2', content: 'B', domain: 'd2' });

        await handleQuestion({ nodeIdA: 'n1', nodeIdB: 'n2' });

        const calls = mockQueryOne.mock.calls as any[];
        expect(String(calls[0][0])).toContain('archived = FALSE');
        expect(calls[0][1]).toEqual(['n1']);
        expect(calls[1][1]).toEqual(['n2']);
    });
});

// =============================================================================
// handleValidate
// =============================================================================

describe('handleValidate', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleValidate({ nodeId: 'missing' });

        expect(result.error).toBe('Node not found');
    });

    it('returns validation context with node + sources', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'n1',
            content: 'AI systems exhibit emergent reasoning',
            node_type: 'synthesis',
            domain: 'ai',
        });
        mockGetSourceNodes.mockResolvedValue([
            { id: 's1', content: 'Source A' },
            { id: 's2', content: 'Source B' },
        ]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.error).toBeUndefined();
        expect(result.node.id).toBe('n1');
        expect(result.node.content).toBe('AI systems exhibit emergent reasoning');
        expect(result.node.type).toBe('synthesis');
        expect(result.node.domain).toBe('ai');
        expect(result.sources).toHaveLength(2);
        expect(result.sources[0]).toEqual({ id: 's1', content: 'Source A' });
    });

    it('includes evaluation criteria and calibration questions', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'n1', content: 'insight', node_type: 'voiced', domain: 'science',
        });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.criteria).toHaveProperty('synthesis');
        expect(result.criteria).toHaveProperty('novelty');
        expect(result.criteria).toHaveProperty('testability');
        expect(result.criteria).toHaveProperty('tension_resolution');
        expect(Array.isArray(result.calibration_questions)).toBe(true);
        expect(result.calibration_questions.length).toBeGreaterThan(0);
    });

    it('includes breakthrough threshold and instruction', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'n1', content: 'test', node_type: 'seed', domain: 'biology',
        });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.breakthrough_threshold).toContain('novelty >= 7');
        expect(result.instruction).toContain('SKEPTICAL');
    });

    it('calls getSourceNodes with the nodeId', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'n5', content: 'c', node_type: 'seed', domain: 'd',
        });

        await handleValidate({ nodeId: 'n5' });

        expect(mockGetSourceNodes).toHaveBeenCalledWith('n5');
    });
});
