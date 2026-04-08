/**
 * Unit tests for handlers/graph/query.ts — handleQuery, parseEmbeddingField.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue(null);
const mockCosineSimilarity = jest.fn<() => number>().mockReturnValue(0.5);
const mockInvalidateKnowledgeCache = jest.fn<() => void>();

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const { parseEmbeddingField, handleQuery } = await import('../../handlers/graph/query.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodeRow(id: string, overrides: Record<string, any> = {}): Record<string, any> {
    return {
        id,
        content: `Content of ${id}`,
        node_type: 'seed',
        trajectory: 'knowledge',
        domain: 'science',
        weight: 1.0,
        salience: 0.5,
        specificity: 1.5,
        origin: 'manual',
        contributor: 'human',
        excluded: 0,
        feedback_rating: null,
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        validation_synthesis: null,
        validation_novelty: null,
        validation_testability: null,
        validation_tension_resolution: null,
        validation_composite: null,
        validation_reason: null,
        validated_at: null,
        validated_by: null,
        lifecycle_state: 'active',
        barren_cycles: 0,
        total_children: 0,
        generation: 0,
        born_at: null,
        activated_at: null,
        declining_since: null,
        composted_at: null,
        avatar_url: null,
        partition_id: null,
        partition_name: null,
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ cnt: 0 });
    mockGetEmbedding.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.5);
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);
});

// =============================================================================
// parseEmbeddingField
// =============================================================================

describe('parseEmbeddingField', () => {
    it('returns null for null input', () => {
        expect(parseEmbeddingField(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(parseEmbeddingField(undefined)).toBeNull();
    });

    it('returns array directly when already an array', () => {
        const arr = [0.1, 0.2, 0.3];
        expect(parseEmbeddingField(arr)).toBe(arr);
    });

    it('parses JSON string to array', () => {
        expect(parseEmbeddingField('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    });

    it('returns null for invalid JSON string', () => {
        expect(parseEmbeddingField('not-json')).toBeNull();
    });

    it('parses Buffer (Float32Array layout)', () => {
        const floats = new Float32Array([0.5, 0.25, 0.75]);
        const buf = Buffer.from(floats.buffer);
        const result = parseEmbeddingField(buf);
        expect(result).not.toBeNull();
        expect(result!.length).toBe(3);
        expect(result![0]).toBeCloseTo(0.5, 3);
    });
});

// =============================================================================
// handleQuery — basic keyword search
// =============================================================================

describe('handleQuery keyword/filter search', () => {
    it('returns empty result when no nodes', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue({ cnt: 0 });

        const result = await handleQuery({});

        expect(result.total).toBe(0);
        expect(result.count).toBe(0);
        expect(result.nodes).toHaveLength(0);
    });

    it('returns nodes with mapped shape', async () => {
        mockQuery.mockResolvedValueOnce([makeNodeRow('n1'), makeNodeRow('n2')]) // main query
                 .mockResolvedValueOnce([]); // provenance batch
        mockQueryOne.mockResolvedValue({ cnt: 2 });

        const result = await handleQuery({ search: 'test' });

        expect(result.total).toBe(2);
        expect(result.count).toBe(2);
        expect(result.nodes[0].id).toBe('n1');
        expect(result.nodes[0].excluded).toBe(false);
    });

    it('adds domain filter to SQL when domain param provided', async () => {
        await handleQuery({ domain: 'science' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('domain IN');
    });

    it('handles domains array (takes precedence over domain)', async () => {
        await handleQuery({ domains: ['science', 'tech'], domain: 'ignored' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('domain IN');
        expect(params).toContain('science');
        expect(params).toContain('tech');
        expect(params).not.toContain('ignored');
    });

    it('adds nodeType filter when specified', async () => {
        await handleQuery({ nodeType: 'breakthrough' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('node_type =');
        expect(params).toContain('breakthrough');
    });

    it('excludes raw nodes by default when nodeType not specified', async () => {
        await handleQuery({});

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain("node_type != 'raw'");
    });

    it('adds minWeight filter when specified', async () => {
        await handleQuery({ minWeight: 1.5 });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('weight >=');
        expect(params).toContain(1.5);
    });

    it('adds trajectory filter when specified', async () => {
        await handleQuery({ trajectory: 'abstraction' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('trajectory =');
        expect(params).toContain('abstraction');
    });

    it('adds partition filter when specified', async () => {
        await handleQuery({ partition: 'part-1' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('partition_id IN');
        expect(params).toContain('part-1');
    });

    it('adds feedbackRating=useful filter', async () => {
        await handleQuery({ feedbackRating: 'useful' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('feedback_rating =');
        expect(params).toContain(1);
    });

    it('adds feedbackRating=not_useful filter', async () => {
        await handleQuery({ feedbackRating: 'not_useful' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('feedback_rating =');
        expect(params).toContain(0);
    });

    it('adds feedbackRating=harmful filter', async () => {
        await handleQuery({ feedbackRating: 'harmful' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('feedback_rating =');
        expect(params).toContain(-1);
    });

    it('adds feedbackRating=unrated filter (IS NULL)', async () => {
        await handleQuery({ feedbackRating: 'unrated' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('feedback_rating IS NULL');
    });

    it('returns total from count query', async () => {
        mockQuery.mockResolvedValueOnce([makeNodeRow('n1')]).mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 42 });

        const result = await handleQuery({});

        expect(result.total).toBe(42);
    });

    it('includes validation in node shape when validation_composite is set', async () => {
        const nodeWithValidation = makeNodeRow('n1', {
            validation_composite: 0.9,
            validation_synthesis: 0.95,
            validation_novelty: 0.85,
            validation_testability: 0.88,
            validation_tension_resolution: 0.92,
            validation_reason: 'Excellent',
            validated_at: '2024-02-01T00:00:00Z',
            validated_by: 'gpt-4',
        });
        mockQuery.mockResolvedValueOnce([nodeWithValidation]).mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].validation).not.toBeNull();
        expect(result.nodes[0].validation!.composite).toBe(0.9);
    });

    it('batch-fetches provenance for returned nodes', async () => {
        mockQuery
            .mockResolvedValueOnce([makeNodeRow('n1')]) // main data
            .mockResolvedValueOnce([{ entity_id: 'n1', decided_by_tier: 'tier2', contributor: 'claude' }]); // provenance batch
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].provenance).toEqual({ tier: 'tier2', contributor: 'claude' });
    });

    it('sets provenance to null for nodes not in provenance batch', async () => {
        mockQuery
            .mockResolvedValueOnce([makeNodeRow('n1')]) // main data
            .mockResolvedValueOnce([]); // no provenance rows
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].provenance).toBeNull();
    });
});

// =============================================================================
// handleQuery — semantic search
// =============================================================================

describe('handleQuery semantic search', () => {
    it('calls getEmbedding when text param provided', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 0 });

        await handleQuery({ text: 'AI alignment' });

        expect(mockGetEmbedding).toHaveBeenCalledWith('AI alignment');
    });

    it('falls back to LIKE search when embedding unavailable', async () => {
        mockGetEmbedding.mockResolvedValue(null);

        await handleQuery({ text: 'some topic' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('LIKE');
    });

    it('falls back to LIKE search when getEmbedding throws', async () => {
        mockGetEmbedding.mockRejectedValue(new Error('Service unavailable'));

        await handleQuery({ text: 'fallback topic' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('LIKE');
    });

    it('includes embedding_bin in SELECT when semantic search active', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 0 });

        await handleQuery({ text: 'AI safety', limit: 10 });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('embedding_bin');
    });

    it('reranks nodes by cosine similarity when embedding present', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        const nodeHigh = makeNodeRow('n-high', { weight: 0.5, embedding_bin: [0.9, 0.1, 0.1] });
        const nodeLow = makeNodeRow('n-low', { weight: 0.5, embedding_bin: [0.1, 0.9, 0.1] });

        // Return both as candidates; cosineSimilarity returns different values per call
        mockCosineSimilarity
            .mockReturnValueOnce(0.9) // n-high similarity
            .mockReturnValueOnce(0.2); // n-low similarity

        mockQuery
            .mockResolvedValueOnce([nodeHigh, nodeLow]) // candidate pool
            .mockResolvedValueOnce([]); // provenance
        mockQueryOne.mockResolvedValue({ cnt: 2 });

        const result = await handleQuery({ text: 'query', limit: 2 });

        // Higher similarity should rank first
        expect(result.nodes[0].id).toBe('n-high');
        expect(result.nodes[0].relevance).toBeDefined();
    });

    it('fetches wider candidate pool for semantic search', async () => {
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 0 });

        await handleQuery({ text: 'topic', limit: 5 });

        // Candidate pool should be at least limit * 5 = 25 (or 100, whichever is larger)
        const params = mockQuery.mock.calls[0][1] as any[];
        const candidateLimit = params[params.length - 2]; // second to last = LIMIT
        expect(candidateLimit).toBeGreaterThanOrEqual(25);
    });
});
