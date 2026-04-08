/**
 * In-memory embedding cache for fast similarity operations.
 *
 * Stores pre-parsed Float32Arrays keyed by node ID.
 * Eliminates repeated JSON.parse / DB reads for hot-path operations
 * (tension detection, synthesis engine junk filter, context selection).
 *
 * Binary (embedding_bin) is preferred; falls back to JSON (embedding) column.
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { parseEmbedding, cosineSimilarity } from '../core/scoring.js';

interface CachedEmbedding {
    embedding: number[];
    accessedAt: number;
}

const cache = new Map<string, CachedEmbedding>();

/**
 * Get a parsed embedding for a node, using the in-memory cache if available.
 * Falls back to a DB lookup (preferring the binary column) if not cached,
 * and populates the cache on successful load.
 *
 * @param nodeId - UUID of the node to retrieve the embedding for
 * @returns Parsed embedding array, or null if the node has no embedding
 */
export async function getNodeEmbedding(nodeId: string): Promise<number[] | null> {
    const cached = cache.get(nodeId);
    if (cached) {
        cached.accessedAt = Date.now();
        return cached.embedding;
    }

    // Load from DB (prefer binary column)
    const row = await import('../db.js').then(db =>
        db.queryOne('SELECT embedding_bin, embedding FROM nodes WHERE id = $1', [nodeId])
    );
    if (!row) return null;

    const emb = row.embedding_bin
        ? parseEmbedding(row.embedding_bin)
        : parseEmbedding(row.embedding);
    if (!emb) return null;

    setCached(nodeId, emb);
    return emb;
}

/**
 * Cache an embedding directly (e.g., after node creation when we already have it).
 * Evicts the least-recently-accessed entry if the cache is at capacity.
 *
 * @param nodeId - UUID of the node
 * @param embedding - Parsed embedding array to cache
 */
export function setCached(nodeId: string, embedding: number[]): void {
    if (cache.size >= appConfig.embeddingCache.maxSize) {
        evictOldest();
    }
    cache.set(nodeId, { embedding, accessedAt: Date.now() });
}

/**
 * Remove a node's embedding from the cache (e.g., on node deletion or content update).
 *
 * @param nodeId - UUID of the node to evict
 */
export function invalidate(nodeId: string): void {
    cache.delete(nodeId);
}

/**
 * Clear the entire cache.
 */
export function clearAll(): void {
    cache.clear();
}

/**
 * Pre-warm the cache with the top-N active nodes ordered by weight.
 * Intended to be called at startup or after bulk operations to reduce
 * cache misses on hot-path similarity lookups.
 *
 * @param limit - Maximum number of nodes to load (defaults to config value)
 * @returns The number of embeddings successfully loaded into cache
 */
export async function warmCache(limit: number = appConfig.embeddingCache.defaultWarmupLimit): Promise<number> {
    const rows = await query(
        `SELECT id, embedding_bin, embedding FROM nodes
         WHERE archived = 0 AND (embedding_bin IS NOT NULL OR embedding IS NOT NULL)
         ORDER BY weight DESC
         LIMIT $1`,
        [limit]
    );

    let loaded = 0;
    for (const row of rows) {
        const emb = row.embedding_bin
            ? parseEmbedding(row.embedding_bin)
            : parseEmbedding(row.embedding);
        if (emb) {
            setCached(row.id, emb);
            loaded++;
        }
    }
    return loaded;
}

/**
 * Batch-load embeddings for specific node IDs, using the cache for hits
 * and loading the rest from the DB in a single query via `json_each`.
 *
 * @param nodeIds - Array of node UUIDs to load
 * @returns Map of nodeId to parsed embedding array (only includes nodes that have embeddings)
 */
export async function batchLoad(nodeIds: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const toLoad: string[] = [];

    // Check cache first
    for (const id of nodeIds) {
        const cached = cache.get(id);
        if (cached) {
            cached.accessedAt = Date.now();
            result.set(id, cached.embedding);
        } else {
            toLoad.push(id);
        }
    }

    // Load missing from DB
    if (toLoad.length > 0) {
        const nodeIdsJson = JSON.stringify(toLoad);
        const rows = await query(
            `SELECT id, embedding_bin, embedding FROM nodes WHERE id IN (SELECT value FROM json_each($1))`,
            [nodeIdsJson]
        );

        for (const row of rows) {
            const emb = row.embedding_bin
                ? parseEmbedding(row.embedding_bin)
                : parseEmbedding(row.embedding);
            if (emb) {
                setCached(row.id, emb);
                result.set(row.id, emb);
            }
        }
    }

    return result;
}

/**
 * Find the top-K nearest neighbors of a node within a set of candidates.
 * Used by the synthesis engine for directed search.
 *
 * @param nodeId - The source node to find neighbors for
 * @param candidateIds - Set of candidate node IDs to compare against
 * @param topK - Number of neighbors to return
 * @param minSim - Minimum similarity threshold (default 0.3)
 * @param maxSim - Maximum similarity threshold (default 0.95, filters near-duplicates)
 */
export async function findNeighbors(
    nodeId: string,
    candidateIds: string[],
    topK: number = 20,
    minSim: number = 0.3,
    maxSim: number = 0.95,
): Promise<{ id: string; similarity: number }[]> {
    const sourceEmb = await getNodeEmbedding(nodeId);
    if (!sourceEmb) return [];

    const candidates = await batchLoad(candidateIds);
    const results: { id: string; similarity: number }[] = [];

    for (const [candidateId, candidateEmb] of candidates) {
        if (candidateId === nodeId) continue;
        const sim = cosineSimilarity(sourceEmb, candidateEmb);
        if (sim >= minSim && sim <= maxSim) {
            results.push({ id: candidateId, similarity: sim });
        }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
}

/**
 * Get current cache statistics.
 * @returns Object with current `size` and configured `maxSize`
 */
export function getStats(): { size: number; maxSize: number } {
    return {
        size: cache.size,
        maxSize: appConfig.embeddingCache.maxSize,
    };
}

// --- Internal ---

/** Evicts the least-recently-accessed entry when the cache is at max size. */
function evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
        if (entry.accessedAt < oldestTime) {
            oldestTime = entry.accessedAt;
            oldestKey = key;
        }
    }

    if (oldestKey) {
        cache.delete(oldestKey);
    }
}
