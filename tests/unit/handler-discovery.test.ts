/**
 * Unit tests for handlers/discovery.ts —
 * handleTensions, handleQuestion, handleValidate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockFindTensions = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetSourceNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    findTensions: mockFindTensions,
    getSourceNodes: mockGetSourceNodes,
}));

const { handleTensions, handleQuestion, handleValidate } = await import('../../handlers/discovery.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockFindTensions.mockResolvedValue([]);
    mockGetSourceNodes.mockResolvedValue([]);
});

// =============================================================================
// handleTensions
// =============================================================================

describe('handleTensions', () => {
    it('returns count and empty tensions array when no tensions found', async () => {
        mockFindTensions.mockResolvedValue([]);

        const result = await handleTensions({});

        expect(result.count).toBe(0);
        expect(result.tensions).toEqual([]);
    });

    it('uses default limit of 10 and domain null', async () => {
        await handleTensions({});

        expect(mockFindTensions).toHaveBeenCalledWith(10, null);
    });

    it('passes custom limit and domain to findTensions', async () => {
        await handleTensions({ limit: 25, domain: 'science' });

        expect(mockFindTensions).toHaveBeenCalledWith(25, 'science');
    });

    it('returns formatted tensions with rounded similarity', async () => {
        mockFindTensions.mockResolvedValue([
            {
                nodeA: { id: 'a1', content: 'Content A' },
                nodeB: { id: 'b1', content: 'Content B' },
                similarity: 0.789456,
                tensionScore: 0.85,
                signals: ['s1', 's2'],
            },
        ]);

        const result = await handleTensions({});

        expect(result.count).toBe(1);
        expect(result.tensions[0].similarity).toBe(0.79); // Math.round(0.789456 * 100) / 100
        expect(result.tensions[0].tensionScore).toBe(0.85);
        expect(result.tensions[0].signals).toEqual(['s1', 's2']);
    });

    it('sets domain in result when domain filter applied', async () => {
        const result = await handleTensions({ domain: 'math' });

        expect(result.domain).toBe('math');
    });

    it('sets domain to all when no domain filter', async () => {
        const result = await handleTensions({});

        expect(result.domain).toBe('all');
    });

    it('includes cross-domain note when no domain filter', async () => {
        const result = await handleTensions({});

        expect(result.note).toContain('Cross-domain');
    });

    it('includes domain-specific note when domain filter applied', async () => {
        const result = await handleTensions({ domain: 'physics' });

        expect(result.note).toContain('physics');
    });
});

// =============================================================================
// handleQuestion
// =============================================================================

describe('handleQuestion', () => {
    it('returns error when nodeA not found', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null) // nodeA not found
            .mockResolvedValueOnce({ id: 'b1', content: 'Content B', domain: 'math' });

        const result = await handleQuestion({ nodeIdA: 'a1', nodeIdB: 'b1' });

        expect(result.error).toContain('not found');
    });

    it('returns error when nodeB not found', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'a1', content: 'Content A', domain: 'science' })
            .mockResolvedValueOnce(null); // nodeB not found

        const result = await handleQuestion({ nodeIdA: 'a1', nodeIdB: 'b1' });

        expect(result.error).toContain('not found');
    });

    it('returns context with both nodes when found', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'a1', content: 'Content A', domain: 'science' })
            .mockResolvedValueOnce({ id: 'b1', content: 'Content B', domain: 'math' });

        const result = await handleQuestion({ nodeIdA: 'a1', nodeIdB: 'b1' });

        expect(result.nodeA).toEqual({ id: 'a1', content: 'Content A', domain: 'science' });
        expect(result.nodeB).toEqual({ id: 'b1', content: 'Content B', domain: 'math' });
    });

    it('includes instruction for generating research question', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'a1', content: 'c', domain: 'd' })
            .mockResolvedValueOnce({ id: 'b1', content: 'c', domain: 'd' });

        const result = await handleQuestion({ nodeIdA: 'a1', nodeIdB: 'b1' });

        expect(result.instruction).toContain('research question');
        expect(result.instruction).toContain('podbit.propose');
    });

    it('queries each node by id with archived=FALSE', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'a1', content: 'c', domain: 'd' })
            .mockResolvedValueOnce({ id: 'b1', content: 'c', domain: 'd' });

        await handleQuestion({ nodeIdA: 'a1', nodeIdB: 'b1' });

        const [, paramsA] = mockQueryOne.mock.calls[0] as any[];
        const [, paramsB] = mockQueryOne.mock.calls[1] as any[];
        expect(paramsA).toContain('a1');
        expect(paramsB).toContain('b1');
    });
});

// =============================================================================
// handleValidate
// =============================================================================

describe('handleValidate', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleValidate({ nodeId: 'nonexistent' });

        expect(result.error).toContain('not found');
    });

    it('returns node context with type and domain', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'Test content', node_type: 'synthesis', domain: 'science' });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.node.id).toBe('n1');
        expect(result.node.content).toBe('Test content');
        expect(result.node.type).toBe('synthesis');
        expect(result.node.domain).toBe('science');
    });

    it('calls getSourceNodes with nodeId to get parents', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'd' });
        mockGetSourceNodes.mockResolvedValue([]);

        await handleValidate({ nodeId: 'n1' });

        expect(mockGetSourceNodes).toHaveBeenCalledWith('n1');
    });

    it('includes source nodes in result', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'd' });
        mockGetSourceNodes.mockResolvedValue([
            { id: 's1', content: 'Source 1' },
            { id: 's2', content: 'Source 2' },
        ]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.sources).toHaveLength(2);
        expect(result.sources[0]).toEqual({ id: 's1', content: 'Source 1' });
    });

    it('includes criteria with four scoring dimensions', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'd' });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.criteria.synthesis).toBeDefined();
        expect(result.criteria.novelty).toBeDefined();
        expect(result.criteria.testability).toBeDefined();
        expect(result.criteria.tension_resolution).toBeDefined();
    });

    it('includes breakthrough threshold instruction', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'd' });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.breakthrough_threshold).toBeDefined();
        expect(result.breakthrough_threshold).toContain('novelty >= 7');
    });

    it('includes calibration questions to prevent over-scoring', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'd' });
        mockGetSourceNodes.mockResolvedValue([]);

        const result = await handleValidate({ nodeId: 'n1' });

        expect(result.calibration_questions).toBeInstanceOf(Array);
        expect(result.calibration_questions.length).toBeGreaterThan(0);
    });
});
