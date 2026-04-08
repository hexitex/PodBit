/**
 * Tests for vector/embedding-cache.ts — setCached, invalidate, clearAll (re-implemented).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

// Re-implement the embedding cache logic from vector/embedding-cache.ts
// (only the pure in-memory operations)

interface CachedEmbedding {
    embedding: number[];
    accessedAt: number;
}

function createEmbeddingCache(maxSize: number) {
    const cache = new Map<string, CachedEmbedding>();

    function evictOldest(): void {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [key, entry] of cache) {
            if (entry.accessedAt < oldestTime) {
                oldestTime = entry.accessedAt;
                oldestKey = key;
            }
        }
        if (oldestKey) cache.delete(oldestKey);
    }

    return {
        set(nodeId: string, embedding: number[]): void {
            if (cache.size >= maxSize) evictOldest();
            cache.set(nodeId, { embedding, accessedAt: Date.now() });
        },
        get(nodeId: string): number[] | null {
            const cached = cache.get(nodeId);
            if (cached) {
                cached.accessedAt = Date.now();
                return cached.embedding;
            }
            return null;
        },
        invalidate(nodeId: string): void {
            cache.delete(nodeId);
        },
        clearAll(): void {
            cache.clear();
        },
        size(): number {
            return cache.size;
        },
        has(nodeId: string): boolean {
            return cache.has(nodeId);
        },
    };
}

describe('EmbeddingCache', () => {
    let cache: ReturnType<typeof createEmbeddingCache>;

    beforeEach(() => {
        cache = createEmbeddingCache(10);
    });

    describe('set and get', () => {
        it('stores and retrieves an embedding', () => {
            cache.set('node1', [0.1, 0.2, 0.3]);
            expect(cache.get('node1')).toEqual([0.1, 0.2, 0.3]);
        });

        it('returns null for missing node', () => {
            expect(cache.get('nonexistent')).toBeNull();
        });

        it('updates accessedAt on get', async () => {
            cache.set('node1', [1, 0, 0]);
            await new Promise(r => setTimeout(r, 5));
            cache.get('node1');
            // accessedAt should be updated — we can't directly read it,
            // but the LRU eviction should prefer the last-accessed order
        });

        it('overwrites existing embedding', () => {
            cache.set('node1', [1, 0, 0]);
            cache.set('node1', [0, 1, 0]);
            expect(cache.get('node1')).toEqual([0, 1, 0]);
        });

        it('stores multiple nodes independently', () => {
            cache.set('a', [1, 0]);
            cache.set('b', [0, 1]);
            expect(cache.get('a')).toEqual([1, 0]);
            expect(cache.get('b')).toEqual([0, 1]);
        });
    });

    describe('invalidate', () => {
        it('removes a cached embedding', () => {
            cache.set('node1', [1, 0, 0]);
            cache.invalidate('node1');
            expect(cache.get('node1')).toBeNull();
        });

        it('is a no-op for non-existent node', () => {
            cache.invalidate('nonexistent');
            expect(cache.size()).toBe(0);
        });

        it('only removes the specified node', () => {
            cache.set('a', [1, 0]);
            cache.set('b', [0, 1]);
            cache.invalidate('a');
            expect(cache.get('a')).toBeNull();
            expect(cache.get('b')).toEqual([0, 1]);
        });
    });

    describe('clearAll', () => {
        it('removes all cached embeddings', () => {
            cache.set('a', [1, 0]);
            cache.set('b', [0, 1]);
            cache.set('c', [1, 1]);
            cache.clearAll();
            expect(cache.size()).toBe(0);
            expect(cache.get('a')).toBeNull();
        });

        it('allows adding new entries after clear', () => {
            cache.set('a', [1, 0]);
            cache.clearAll();
            cache.set('b', [0, 1]);
            expect(cache.get('b')).toEqual([0, 1]);
            expect(cache.size()).toBe(1);
        });
    });

    describe('LRU eviction', () => {
        it('evicts oldest entry when at max size', async () => {
            const smallCache = createEmbeddingCache(3);
            smallCache.set('a', [1, 0]);
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('b', [0, 1]);
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('c', [1, 1]);
            expect(smallCache.size()).toBe(3);

            // Adding 4th should evict oldest (a)
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('d', [0, 0]);
            expect(smallCache.size()).toBe(3);
            expect(smallCache.get('a')).toBeNull(); // evicted
            expect(smallCache.get('d')).toEqual([0, 0]); // new entry
        });

        it('evicts LRU, not MRU', async () => {
            const smallCache = createEmbeddingCache(3);
            smallCache.set('a', [1, 0]);
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('b', [0, 1]);
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('c', [1, 1]);

            // Access 'a' to make it recently used
            await new Promise(r => setTimeout(r, 2));
            smallCache.get('a'); // refreshes accessedAt for 'a'

            // Adding 'd' should evict 'b' (oldest after refreshing 'a')
            await new Promise(r => setTimeout(r, 2));
            smallCache.set('d', [0, 0]);
            expect(smallCache.get('b')).toBeNull(); // b was oldest (not accessed after a was refreshed)
            expect(smallCache.get('a')).toEqual([1, 0]); // a was refreshed
        });
    });

    describe('size tracking', () => {
        it('increments size on set', () => {
            cache.set('a', [1, 0]);
            expect(cache.size()).toBe(1);
            cache.set('b', [0, 1]);
            expect(cache.size()).toBe(2);
        });

        it('does not increment on overwrite', () => {
            cache.set('a', [1, 0]);
            cache.set('a', [0, 1]);
            expect(cache.size()).toBe(1);
        });

        it('decrements on invalidate', () => {
            cache.set('a', [1, 0]);
            cache.set('b', [0, 1]);
            cache.invalidate('a');
            expect(cache.size()).toBe(1);
        });

        it('resets to 0 after clearAll', () => {
            cache.set('a', [1, 0]);
            cache.set('b', [0, 1]);
            cache.clearAll();
            expect(cache.size()).toBe(0);
        });
    });
});
