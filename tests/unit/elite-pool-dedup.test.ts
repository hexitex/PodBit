/**
 * Unit tests for core/elite-pool-dedup.ts — checkEliteDedup, getNodeVarIds.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue(null);
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0);
const mockParseEmbedding = jest.fn<(row: any) => number[] | null>().mockReturnValue(null);

const mockDedupConfig = {
    checkVariableOverlap: true,
    checkParentLineage: true,
    semanticThreshold: 0.92,
};

const mockAppConfig = {
    elitePool: { dedup: mockDedupConfig },
};

jest.unstable_mockModule('../../db.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../models.js', () => ({ getEmbedding: mockGetEmbedding }));
jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
}));

const { checkEliteDedup, getNodeVarIds } = await import('../../core/elite-pool-dedup.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetEmbedding.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0);
    mockParseEmbedding.mockReturnValue(null);
    mockDedupConfig.checkVariableOverlap = true;
    mockDedupConfig.checkParentLineage = true;
    mockDedupConfig.semanticThreshold = 0.92;
});

// =============================================================================
// getNodeVarIds
// =============================================================================

describe('getNodeVarIds', () => {
    it('returns empty array when node has no variables', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getNodeVarIds('node-1');
        expect(result).toEqual([]);
    });

    it('returns var_id array from query', async () => {
        mockQuery.mockResolvedValue([
            { var_id: 'VAR001' },
            { var_id: 'VAR002' },
        ]);
        const result = await getNodeVarIds('node-1');
        expect(result).toEqual(['VAR001', 'VAR002']);
    });

    it('passes node id to query', async () => {
        mockQuery.mockResolvedValue([]);
        await getNodeVarIds('test-node-id');
        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('test-node-id');
    });
});

// =============================================================================
// checkEliteDedup — skip gates based on config / inputs
// =============================================================================

describe('checkEliteDedup — gate skipping', () => {
    it('skips variable overlap gate when candidateVarIds is empty', async () => {
        // No varIds → gate 1 skipped; parent gate: no candidates returned; embedding: null
        mockQuery
            .mockResolvedValueOnce([])  // elite nodes for parent lineage
            .mockResolvedValueOnce([]); // query for parent matches

        const result = await checkEliteDedup('some content', [], ['parent-1']);
        expect(result.isDuplicate).toBe(false);
    });

    it('skips variable overlap gate when checkVariableOverlap=false', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        // Even with varIds, gate 1 should be skipped
        mockQuery.mockResolvedValue([]); // parent lineage check

        const result = await checkEliteDedup('content', ['VAR001'], ['parent-1']);
        // The elite node fetch query for variable overlap should NOT be the first call
        // (parent lineage query is the only one)
        expect(result.isDuplicate).toBe(false);
    });

    it('skips parent lineage gate when candidateParentIds is empty', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        // No parentIds → gate 2 skipped; embedding: null
        const result = await checkEliteDedup('content', [], []);
        expect(result.isDuplicate).toBe(false);
        expect(mockQuery).not.toHaveBeenCalled(); // no queries needed
    });

    it('skips semantic gate when getEmbedding returns null', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockDedupConfig.checkParentLineage = false;
        mockGetEmbedding.mockResolvedValue(null);

        const result = await checkEliteDedup('content', ['VAR001'], ['parent-1']);
        expect(result.isDuplicate).toBe(false);
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });
});

// =============================================================================
// checkEliteDedup — Gate 1: Variable Overlap
// =============================================================================

describe('checkEliteDedup — gate 1: variable overlap', () => {
    it('returns duplicate when candidate has identical variable set as elite node', async () => {
        // Elite nodes query returns one node
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', domain: 'science' }]) // elite nodes
            .mockResolvedValueOnce([{ var_id: 'VAR001' }, { var_id: 'VAR002' }]); // elite node vars

        const result = await checkEliteDedup('content', ['VAR001', 'VAR002'], []);
        expect(result.isDuplicate).toBe(true);
        expect(result.matchType).toBe('variable_overlap');
        expect(result.matchedNodeId).toBe('elite-1');
        expect(result.details).toContain('VAR001');
    });

    it('returns not duplicate when variable sets differ', async () => {
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', domain: 'science' }])
            .mockResolvedValueOnce([{ var_id: 'VAR999' }]); // elite has different var

        const result = await checkEliteDedup('content', ['VAR001', 'VAR002'], []);
        expect(result.isDuplicate).toBe(false);
    });

    it('returns not duplicate when elite node has no variables', async () => {
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', domain: 'science' }])
            .mockResolvedValueOnce([]); // elite node has no vars — skip it
        // Then embedding check (gate 3):
        mockGetEmbedding.mockResolvedValue(null);

        const result = await checkEliteDedup('content', ['VAR001'], []);
        expect(result.isDuplicate).toBe(false);
    });

    it('returns not duplicate when variable set sizes differ', async () => {
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', domain: 'science' }])
            .mockResolvedValueOnce([{ var_id: 'VAR001' }]); // elite has only 1, candidate has 2
        mockGetEmbedding.mockResolvedValue(null);

        const result = await checkEliteDedup('content', ['VAR001', 'VAR002'], []);
        expect(result.isDuplicate).toBe(false);
    });
});

// =============================================================================
// checkEliteDedup — Gate 2: Parent Lineage
// =============================================================================

describe('checkEliteDedup — gate 2: parent lineage', () => {
    it('returns duplicate when candidate shares a parent with an elite node', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockQuery.mockResolvedValueOnce([
            { node_id: 'elite-1', shared_parent: 'parent-node-abc' },
        ]);

        const result = await checkEliteDedup('content', [], ['parent-node-abc']);
        expect(result.isDuplicate).toBe(true);
        expect(result.matchType).toBe('parent_lineage');
        expect(result.matchedNodeId).toBe('elite-1');
        expect(result.details).toContain('parent-n'); // slice(0,8) of 'parent-node-abc'
    });

    it('returns not duplicate when no shared parent found', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockQuery.mockResolvedValueOnce([]); // no matches
        mockGetEmbedding.mockResolvedValue(null);

        const result = await checkEliteDedup('content', [], ['parent-node-abc']);
        expect(result.isDuplicate).toBe(false);
    });

    it('passes candidate parent ids to query', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockQuery.mockResolvedValueOnce([]);
        mockGetEmbedding.mockResolvedValue(null);

        await checkEliteDedup('content', [], ['parent-abc', 'parent-def']);
        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('parent-abc');
        expect(params).toContain('parent-def');
    });
});

// =============================================================================
// checkEliteDedup — Gate 3: Semantic Similarity
// =============================================================================

describe('checkEliteDedup — gate 3: semantic similarity', () => {
    it('returns duplicate when similarity exceeds threshold', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockDedupConfig.checkParentLineage = false;
        const embedding = [0.1, 0.2, 0.3];
        mockGetEmbedding.mockResolvedValue(embedding);
        mockQuery.mockResolvedValueOnce([
            { id: 'elite-1', embedding: null, embedding_bin: null },
        ]);
        mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
        mockCosineSimilarity.mockReturnValue(0.95); // above 0.92

        const result = await checkEliteDedup('content', [], []);
        expect(result.isDuplicate).toBe(true);
        expect(result.matchType).toBe('semantic_similarity');
        expect(result.matchedNodeId).toBe('elite-1');
        expect(result.score).toBe(0.95);
        expect(result.details).toContain('0.950');
    });

    it('returns not duplicate when similarity is below threshold', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockDedupConfig.checkParentLineage = false;
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([
            { id: 'elite-1', embedding: null, embedding_bin: null },
        ]);
        mockParseEmbedding.mockReturnValue([0.4, 0.5, 0.6]);
        mockCosineSimilarity.mockReturnValue(0.80); // below 0.92

        const result = await checkEliteDedup('content', [], []);
        expect(result.isDuplicate).toBe(false);
    });

    it('skips elite nodes where parseEmbedding returns null', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockDedupConfig.checkParentLineage = false;
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([
            { id: 'elite-1', embedding: null, embedding_bin: null },
        ]);
        mockParseEmbedding.mockReturnValue(null); // can't parse

        const result = await checkEliteDedup('content', [], []);
        expect(result.isDuplicate).toBe(false);
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });

    it('returns not duplicate when no elite nodes have embeddings', async () => {
        mockDedupConfig.checkVariableOverlap = false;
        mockDedupConfig.checkParentLineage = false;
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([]); // no elite nodes with embeddings

        const result = await checkEliteDedup('content', [], []);
        expect(result.isDuplicate).toBe(false);
    });
});

// =============================================================================
// checkEliteDedup — short-circuit behavior
// =============================================================================

describe('checkEliteDedup — short-circuit on first match', () => {
    it('stops at gate 1 and does not check parent lineage', async () => {
        // Gate 1 finds duplicate
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', domain: 'science' }])
            .mockResolvedValueOnce([{ var_id: 'VAR001' }]);

        const result = await checkEliteDedup('content', ['VAR001'], ['parent-abc']);
        expect(result.isDuplicate).toBe(true);
        expect(result.matchType).toBe('variable_overlap');
        // Only 2 calls: elite nodes query + var ids query
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });
});
