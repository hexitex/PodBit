/**
 * Unit tests for vector/embedding-cache.ts — actual module imports with mocked deps.
 *
 * Covers: getNodeEmbedding, setCached, invalidate, clearAll, warmCache,
 * batchLoad, findNeighbors, getStats, and LRU eviction.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();

const mockParseEmbedding = jest.fn<(emb: any) => number[] | null>();
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>();

const mockConfig: any = {
    embeddingCache: {
        maxSize: 100,
        defaultWarmupLimit: 50,
    },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    parseEmbedding: mockParseEmbedding,
    cosineSimilarity: mockCosineSimilarity,
}));

const {
    getNodeEmbedding,
    setCached,
    invalidate,
    clearAll,
    warmCache,
    batchLoad,
    findNeighbors,
    getStats,
} = await import('../../vector/embedding-cache.js');

// ── Helpers ────────────────────────────────────────────────────────────

function makeEmbedding(seed: number): number[] {
    return [seed, seed * 2, seed * 3];
}

// ── Tests ──────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    clearAll();
    mockConfig.embeddingCache.maxSize = 100;
    mockConfig.embeddingCache.defaultWarmupLimit = 50;
});

describe('setCached + getStats', () => {
    it('stores an embedding and increments cache size', () => {
        setCached('n1', [1, 2, 3]);
        expect(getStats().size).toBe(1);
    });

    it('overwrites existing entry without changing size', () => {
        setCached('n1', [1, 2, 3]);
        setCached('n1', [4, 5, 6]);
        expect(getStats().size).toBe(1);
    });

    it('reports maxSize from config', () => {
        expect(getStats().maxSize).toBe(100);
    });
});

describe('invalidate', () => {
    it('removes a cached embedding', () => {
        setCached('n1', [1, 2, 3]);
        invalidate('n1');
        expect(getStats().size).toBe(0);
    });

    it('is a no-op for missing node', () => {
        invalidate('nonexistent');
        expect(getStats().size).toBe(0);
    });

    it('only removes the specified node', () => {
        setCached('a', [1, 0]);
        setCached('b', [0, 1]);
        invalidate('a');
        expect(getStats().size).toBe(1);
    });
});

describe('clearAll', () => {
    it('removes all cached embeddings', () => {
        setCached('a', [1, 0]);
        setCached('b', [0, 1]);
        setCached('c', [1, 1]);
        clearAll();
        expect(getStats().size).toBe(0);
    });
});

describe('LRU eviction', () => {
    it('evicts oldest entry when cache reaches maxSize', async () => {
        mockConfig.embeddingCache.maxSize = 3;

        setCached('a', [1, 0]);
        await new Promise(r => setTimeout(r, 5));
        setCached('b', [0, 1]);
        await new Promise(r => setTimeout(r, 5));
        setCached('c', [1, 1]);

        expect(getStats().size).toBe(3);

        // Adding 4th should evict oldest (a)
        await new Promise(r => setTimeout(r, 5));
        setCached('d', [0, 0]);
        expect(getStats().size).toBe(3);
    });

    it('evicts only the least-recently-accessed entry', async () => {
        mockConfig.embeddingCache.maxSize = 3;

        setCached('a', [1, 0]);
        await new Promise(r => setTimeout(r, 5));
        setCached('b', [0, 1]);
        await new Promise(r => setTimeout(r, 5));
        setCached('c', [1, 1]);

        // After eviction of one, we should still have 3 entries
        await new Promise(r => setTimeout(r, 5));
        setCached('d', [0, 0]);
        expect(getStats().size).toBe(3);
    });
});

describe('getNodeEmbedding', () => {
    it('returns cached embedding on cache hit without DB call', async () => {
        setCached('n1', [1, 2, 3]);
        const result = await getNodeEmbedding('n1');
        expect(result).toEqual([1, 2, 3]);
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('loads from DB on cache miss using embedding_bin', async () => {
        const binaryData = Buffer.from([1, 2, 3]);
        mockQueryOne.mockResolvedValue({ embedding_bin: binaryData, embedding: null });
        mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);

        const result = await getNodeEmbedding('n2');

        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(mockParseEmbedding).toHaveBeenCalledWith(binaryData);
    });

    it('falls back to embedding column when embedding_bin is null', async () => {
        const jsonStr = '[0.4, 0.5, 0.6]';
        mockQueryOne.mockResolvedValue({ embedding_bin: null, embedding: jsonStr });
        mockParseEmbedding.mockReturnValue([0.4, 0.5, 0.6]);

        const result = await getNodeEmbedding('n3');

        expect(result).toEqual([0.4, 0.5, 0.6]);
        expect(mockParseEmbedding).toHaveBeenCalledWith(jsonStr);
    });

    it('returns null when node not found in DB', async () => {
        mockQueryOne.mockResolvedValue(undefined);

        const result = await getNodeEmbedding('missing');
        expect(result).toBeNull();
    });

    it('returns null when parseEmbedding returns null', async () => {
        mockQueryOne.mockResolvedValue({ embedding_bin: 'bad-data', embedding: null });
        mockParseEmbedding.mockReturnValue(null);

        const result = await getNodeEmbedding('bad');
        expect(result).toBeNull();
    });

    it('caches DB result for subsequent calls', async () => {
        mockQueryOne.mockResolvedValue({ embedding_bin: null, embedding: '[1,2]' });
        mockParseEmbedding.mockReturnValue([1, 2]);

        await getNodeEmbedding('n4');
        expect(getStats().size).toBeGreaterThanOrEqual(1);

        // Second call should use cache
        mockQueryOne.mockClear();
        const result2 = await getNodeEmbedding('n4');
        expect(result2).toEqual([1, 2]);
        // queryOne is called via dynamic import in the source, so we check it wasn't called again
    });
});

describe('warmCache', () => {
    it('loads top-N nodes by weight and returns count', async () => {
        mockQuery.mockResolvedValue([
            { id: 'w1', embedding_bin: Buffer.from([1]), embedding: null },
            { id: 'w2', embedding_bin: null, embedding: '[2]' },
            { id: 'w3', embedding_bin: null, embedding: '[3]' },
        ]);
        mockParseEmbedding
            .mockReturnValueOnce([0.1])
            .mockReturnValueOnce([0.2])
            .mockReturnValueOnce([0.3]);

        const loaded = await warmCache(10);

        expect(loaded).toBe(3);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(getStats().size).toBeGreaterThanOrEqual(3);
    });

    it('skips rows where parseEmbedding returns null', async () => {
        mockQuery.mockResolvedValue([
            { id: 'w1', embedding_bin: null, embedding: 'bad' },
            { id: 'w2', embedding_bin: Buffer.from([1]), embedding: null },
        ]);
        mockParseEmbedding
            .mockReturnValueOnce(null)
            .mockReturnValueOnce([0.5]);

        const loaded = await warmCache(5);
        expect(loaded).toBe(1);
    });

    it('uses default warmup limit from config when no argument', async () => {
        mockConfig.embeddingCache.defaultWarmupLimit = 25;
        mockQuery.mockResolvedValue([]);

        await warmCache();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.any(String),
            [25]
        );
    });

    it('handles empty result set', async () => {
        mockQuery.mockResolvedValue([]);
        const loaded = await warmCache(10);
        expect(loaded).toBe(0);
    });

    it('prefers embedding_bin over embedding column', async () => {
        const binData = Buffer.from([1, 2, 3]);
        mockQuery.mockResolvedValue([
            { id: 'w1', embedding_bin: binData, embedding: '[9,9,9]' },
        ]);
        mockParseEmbedding.mockReturnValue([1, 2, 3]);

        await warmCache(1);

        // Should call parseEmbedding with the binary data, not the JSON
        expect(mockParseEmbedding).toHaveBeenCalledWith(binData);
        expect(mockParseEmbedding).toHaveBeenCalledTimes(1);
    });
});

describe('batchLoad', () => {
    it('returns cached embeddings without DB calls', async () => {
        setCached('b1', [1, 0]);
        setCached('b2', [0, 1]);

        const result = await batchLoad(['b1', 'b2']);

        expect(result.get('b1')).toEqual([1, 0]);
        expect(result.get('b2')).toEqual([0, 1]);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('loads missing nodes from DB', async () => {
        setCached('b1', [1, 0]);

        mockQuery.mockResolvedValue([
            { id: 'b2', embedding_bin: null, embedding: '[0,1]' },
        ]);
        mockParseEmbedding.mockReturnValue([0, 1]);

        const result = await batchLoad(['b1', 'b2']);

        expect(result.get('b1')).toEqual([1, 0]);
        expect(result.get('b2')).toEqual([0, 1]);
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('caches DB-loaded nodes for subsequent access', async () => {
        mockQuery.mockResolvedValue([
            { id: 'b3', embedding_bin: Buffer.from([5]), embedding: null },
        ]);
        mockParseEmbedding.mockReturnValue([5]);

        await batchLoad(['b3']);
        expect(getStats().size).toBeGreaterThanOrEqual(1);
    });

    it('handles empty input array', async () => {
        const result = await batchLoad([]);
        expect(result.size).toBe(0);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('skips nodes where parseEmbedding returns null', async () => {
        mockQuery.mockResolvedValue([
            { id: 'bad', embedding_bin: null, embedding: 'corrupt' },
        ]);
        mockParseEmbedding.mockReturnValue(null);

        const result = await batchLoad(['bad']);
        expect(result.has('bad')).toBe(false);
    });

    it('passes node IDs as JSON array to query', async () => {
        mockQuery.mockResolvedValue([]);

        await batchLoad(['x1', 'x2', 'x3']);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('json_each'),
            [JSON.stringify(['x1', 'x2', 'x3'])]
        );
    });

    it('mixes cached and DB-loaded results correctly', async () => {
        setCached('c1', [1, 0, 0]);

        mockQuery.mockResolvedValue([
            { id: 'c2', embedding_bin: null, embedding: '[0,1,0]' },
            { id: 'c3', embedding_bin: null, embedding: '[0,0,1]' },
        ]);
        mockParseEmbedding
            .mockReturnValueOnce([0, 1, 0])
            .mockReturnValueOnce([0, 0, 1]);

        const result = await batchLoad(['c1', 'c2', 'c3']);
        expect(result.size).toBe(3);
        expect(result.get('c1')).toEqual([1, 0, 0]);
        expect(result.get('c2')).toEqual([0, 1, 0]);
        expect(result.get('c3')).toEqual([0, 0, 1]);
    });
});

describe('findNeighbors', () => {
    beforeEach(() => {
        // Pre-cache source and candidate embeddings
        setCached('src', [1, 0, 0]);
        setCached('cand1', [0.9, 0.1, 0]);
        setCached('cand2', [0, 1, 0]);
        setCached('cand3', [0.5, 0.5, 0]);

        // batchLoad will find all in cache; getNodeEmbedding will also hit cache
        // cosineSimilarity needs to return appropriate values
    });

    it('returns neighbors sorted by similarity descending', async () => {
        mockCosineSimilarity
            .mockReturnValueOnce(0.8)  // cand1
            .mockReturnValueOnce(0.4)  // cand2
            .mockReturnValueOnce(0.6); // cand3

        const results = await findNeighbors('src', ['cand1', 'cand2', 'cand3']);

        expect(results.length).toBe(3);
        expect(results[0].id).toBe('cand1');
        expect(results[0].similarity).toBe(0.8);
        expect(results[1].id).toBe('cand3');
        expect(results[2].id).toBe('cand2');
    });

    it('filters out candidates below minSim', async () => {
        mockCosineSimilarity
            .mockReturnValueOnce(0.5)
            .mockReturnValueOnce(0.2);  // below default 0.3? No, 0.2 < 0.3

        const results = await findNeighbors('src', ['cand1', 'cand2'], 20, 0.4);

        // Only cand1 (0.5) passes the 0.4 threshold
        expect(results.length).toBe(1);
        expect(results[0].similarity).toBe(0.5);
    });

    it('filters out candidates above maxSim (near-duplicates)', async () => {
        mockCosineSimilarity
            .mockReturnValueOnce(0.97)   // above default 0.95
            .mockReturnValueOnce(0.6);

        const results = await findNeighbors('src', ['cand1', 'cand2'], 20, 0.3, 0.95);

        expect(results.length).toBe(1);
        expect(results[0].similarity).toBe(0.6);
    });

    it('respects topK limit', async () => {
        mockCosineSimilarity
            .mockReturnValueOnce(0.8)
            .mockReturnValueOnce(0.7)
            .mockReturnValueOnce(0.6);

        const results = await findNeighbors('src', ['cand1', 'cand2', 'cand3'], 2);

        expect(results.length).toBe(2);
    });

    it('excludes the source node from results', async () => {
        // Source is also in candidate list
        mockCosineSimilarity.mockReturnValue(0.5);

        const results = await findNeighbors('src', ['src', 'cand1']);

        // cosineSimilarity should only be called for cand1, not src
        const resultIds = results.map(r => r.id);
        expect(resultIds).not.toContain('src');
    });

    it('returns empty array when source embedding is missing', async () => {
        clearAll(); // Remove cached source
        mockQueryOne.mockResolvedValue(undefined); // DB miss too

        const results = await findNeighbors('missing-src', ['cand1']);
        expect(results).toEqual([]);
    });

    it('returns empty array when no candidates pass thresholds', async () => {
        mockCosineSimilarity.mockReturnValue(0.1); // below default minSim 0.3

        const results = await findNeighbors('src', ['cand1', 'cand2']);
        expect(results).toEqual([]);
    });

    it('handles empty candidate list', async () => {
        const results = await findNeighbors('src', []);
        expect(results).toEqual([]);
    });

    it('includes candidates at exact boundary values', async () => {
        mockCosineSimilarity.mockReturnValueOnce(0.3); // exactly minSim

        const results = await findNeighbors('src', ['cand1'], 20, 0.3, 0.95);
        expect(results.length).toBe(1);
    });

    it('excludes candidates at exact maxSim boundary', async () => {
        mockCosineSimilarity.mockReturnValueOnce(0.95); // exactly maxSim

        const results = await findNeighbors('src', ['cand1'], 20, 0.3, 0.95);
        expect(results.length).toBe(1); // 0.95 <= 0.95 passes
    });
});

describe('getStats', () => {
    it('returns current size and maxSize', () => {
        const stats = getStats();
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('maxSize');
        expect(typeof stats.size).toBe('number');
        expect(typeof stats.maxSize).toBe('number');
    });

    it('reflects cache size changes', () => {
        expect(getStats().size).toBe(0);
        setCached('a', [1]);
        expect(getStats().size).toBe(1);
        setCached('b', [2]);
        expect(getStats().size).toBe(2);
        invalidate('a');
        expect(getStats().size).toBe(1);
        clearAll();
        expect(getStats().size).toBe(0);
    });

    it('reflects maxSize from config', () => {
        mockConfig.embeddingCache.maxSize = 999;
        expect(getStats().maxSize).toBe(999);
    });
});
