/**
 * Deep-coverage unit tests for handlers/graph/query.ts — targeting uncovered paths.
 * Covers: keyword filter, minSalience, minComposite, partitions array, orderBy variants,
 * metadata parsing, domains-as-string coercion, semantic search edge cases,
 * parseEmbeddingField unknown type.
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
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ cnt: 0 });
    mockGetEmbedding.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.5);
});

// =============================================================================
// parseEmbeddingField — edge cases
// =============================================================================

describe('parseEmbeddingField edge cases', () => {
    it('returns null for number input (unknown type)', () => {
        expect(parseEmbeddingField(42)).toBeNull();
    });

    it('returns null for object input (non-array, non-buffer)', () => {
        expect(parseEmbeddingField({ foo: 'bar' })).toBeNull();
    });

    it('returns null for boolean input', () => {
        expect(parseEmbeddingField(true)).toBeNull();
    });

    it('returns null for empty string', () => {
        // empty string is falsy so caught at line 7
        expect(parseEmbeddingField('')).toBeNull();
    });

    it('returns null for zero (falsy)', () => {
        expect(parseEmbeddingField(0)).toBeNull();
    });
});

// =============================================================================
// handleQuery — keyword filter
// =============================================================================

describe('handleQuery keyword filter', () => {
    it('adds keyword filter for single keyword string', async () => {
        await handleQuery({ keywords: 'quantum' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('node_keywords');
        expect(String(mainSql)).toContain('json_each');
        expect(params).toContainEqual(JSON.stringify(['quantum']));
    });

    it('adds keyword filter for keyword array', async () => {
        await handleQuery({ keywords: ['quantum', 'physics'] });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('json_each');
        expect(params).toContainEqual(JSON.stringify(['quantum', 'physics']));
    });

    it('skips keyword filter for empty array', async () => {
        await handleQuery({ keywords: [] });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).not.toContain('json_each');
    });
});

// =============================================================================
// handleQuery — minSalience and minComposite filters
// =============================================================================

describe('handleQuery minSalience and minComposite', () => {
    it('adds minSalience filter when specified', async () => {
        await handleQuery({ minSalience: 0.7 });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('salience >=');
        expect(params).toContain(0.7);
    });

    it('adds minComposite filter when specified', async () => {
        await handleQuery({ minComposite: 0.8 });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('validation_composite >=');
        expect(params).toContain(0.8);
    });

    it('combines minWeight, minSalience, minComposite', async () => {
        await handleQuery({ minWeight: 0.5, minSalience: 0.3, minComposite: 0.6 });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('weight >=');
        expect(String(mainSql)).toContain('salience >=');
        expect(String(mainSql)).toContain('validation_composite >=');
        expect(params).toContain(0.5);
        expect(params).toContain(0.3);
        expect(params).toContain(0.6);
    });
});

// =============================================================================
// handleQuery — partitions array
// =============================================================================

describe('handleQuery partitions array', () => {
    it('handles partitions array (takes precedence over partition)', async () => {
        await handleQuery({ partitions: ['p1', 'p2'], partition: 'ignored' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('partition_id IN');
        expect(params).toContain('p1');
        expect(params).toContain('p2');
        expect(params).not.toContain('ignored');
    });

    it('coerces partitions string to array', async () => {
        await handleQuery({ partitions: 'single-part' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('partition_id IN');
        expect(params).toContain('single-part');
    });
});

// =============================================================================
// handleQuery — domains as string coercion
// =============================================================================

describe('handleQuery domains coercion', () => {
    it('coerces domains string to array', async () => {
        await handleQuery({ domains: 'single-domain' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('domain IN');
        expect(params).toContain('single-domain');
    });
});

// =============================================================================
// handleQuery — orderBy variants
// =============================================================================

describe('handleQuery orderBy', () => {
    it('orders by salience DESC', async () => {
        await handleQuery({ orderBy: 'salience' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.salience DESC');
    });

    it('orders by specificity DESC', async () => {
        await handleQuery({ orderBy: 'specificity' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.specificity DESC');
    });

    it('orders by composite DESC NULLS LAST', async () => {
        await handleQuery({ orderBy: 'composite' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.validation_composite DESC NULLS LAST');
    });

    it('orders by recent (created_at DESC)', async () => {
        await handleQuery({ orderBy: 'recent' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.created_at DESC');
    });

    it('orders by oldest (created_at ASC)', async () => {
        await handleQuery({ orderBy: 'oldest' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.created_at ASC');
    });

    it('falls back to weight DESC for unknown orderBy', async () => {
        await handleQuery({ orderBy: 'nonexistent' });

        const [mainSql] = mockQuery.mock.calls[0] as any[];
        expect(String(mainSql)).toContain('n.weight DESC');
    });
});

// =============================================================================
// handleQuery — metadata JSON parsing
// =============================================================================

describe('handleQuery metadata parsing', () => {
    it('parses metadata JSON string into object', async () => {
        const metaObj = { source: 'paper', year: 2024 };
        const node = makeNodeRow('n1', { metadata: JSON.stringify(metaObj) });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]); // provenance
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].metadata).toEqual(metaObj);
    });

    it('returns null metadata when field is null', async () => {
        const node = makeNodeRow('n1', { metadata: null });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].metadata).toBeNull();
    });
});

// =============================================================================
// handleQuery — lifecycle mapping
// =============================================================================

describe('handleQuery lifecycle mapping', () => {
    it('returns null lifecycle when lifecycle_state is null', async () => {
        const node = makeNodeRow('n1', { lifecycle_state: null });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].lifecycle).toBeNull();
    });

    it('maps lifecycle fields when lifecycle_state is set', async () => {
        const node = makeNodeRow('n1', {
            lifecycle_state: 'declining',
            barren_cycles: 3,
            total_children: 5,
            generation: 2,
            born_at: '2024-01-01',
            activated_at: '2024-01-15',
            declining_since: '2024-06-01',
            composted_at: null,
        });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].lifecycle).toEqual({
            state: 'declining',
            barrenCycles: 3,
            totalChildren: 5,
            generation: 2,
            bornAt: '2024-01-01',
            activatedAt: '2024-01-15',
            decliningSince: '2024-06-01',
            compostedAt: null,
        });
    });
});

// =============================================================================
// handleQuery — partition mapping
// =============================================================================

describe('handleQuery partition mapping', () => {
    it('maps partition when partition_id is set', async () => {
        const node = makeNodeRow('n1', { partition_id: 'p1', partition_name: 'Science Partition' });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].partition).toEqual({ id: 'p1', name: 'Science Partition' });
    });
});

// =============================================================================
// handleQuery — semantic search edge cases
// =============================================================================

describe('handleQuery semantic search edge cases', () => {
    it('handles node without embedding_bin during semantic rerank', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5]);
        const node = makeNodeRow('n1', { embedding_bin: null });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({ text: 'test', limit: 5 });

        // Node should still be returned but with 0 similarity
        expect(result.nodes.length).toBe(1);
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });

    it('handles cosineSimilarity throwing during rerank', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5]);
        const floats = new Float32Array([0.1, 0.2]);
        const buf = Buffer.from(floats.buffer);
        const node = makeNodeRow('n1', { embedding_bin: buf });
        mockCosineSimilarity.mockImplementation(() => { throw new Error('dim mismatch'); });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({ text: 'test', limit: 5 });

        // Should not throw; node returned with 0 similarity
        expect(result.nodes.length).toBe(1);
    });

    it('slices candidates to limit after semantic rerank', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5]);
        const nodes = Array.from({ length: 10 }, (_, i) => {
            const floats = new Float32Array([i * 0.1, 0.5]);
            return makeNodeRow(`n${i}`, { embedding_bin: Buffer.from(floats.buffer) });
        });
        mockCosineSimilarity.mockImplementation((_q: any, emb: any) => emb[0]);
        mockQuery
            .mockResolvedValueOnce(nodes)
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 10 });

        const result = await handleQuery({ text: 'test', limit: 3 });

        expect(result.nodes.length).toBe(3);
        // Highest similarity first
        expect(result.nodes[0].id).toBe('n9');
    });

    it('uses both search and text params together', async () => {
        mockGetEmbedding.mockResolvedValue(null); // embedding fails

        await handleQuery({ text: 'semantic', search: 'keyword' });

        const [mainSql, params] = mockQuery.mock.calls[0] as any[];
        // search param is used for LIKE, not text (since search takes precedence)
        expect(String(mainSql)).toContain('LIKE');
        expect(params).toContain('%keyword%');
    });

    it('includes avatarUrl in output shape', async () => {
        const node = makeNodeRow('n1', { avatar_url: 'data:image/svg+xml;base64,abc' });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].avatarUrl).toBe('data:image/svg+xml;base64,abc');
    });

    it('returns feedback_rating in output shape', async () => {
        const node = makeNodeRow('n1', { feedback_rating: 4 });
        mockQuery
            .mockResolvedValueOnce([node])
            .mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValue({ cnt: 1 });

        const result = await handleQuery({});

        expect(result.nodes[0].feedback_rating).toBe(4);
    });

    it('defaults cnt to 0 when countResult is null', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleQuery({});

        expect(result.total).toBe(0);
    });

    it('respects offset parameter', async () => {
        await handleQuery({ offset: 20, limit: 10 });

        const params = mockQuery.mock.calls[0][1] as any[];
        // Last param is offset
        expect(params[params.length - 1]).toBe(20);
        const result = await handleQuery({ offset: 20 });
        expect(result.offset).toBe(20);
    });
});
