/**
 * Shared node name resolution with in-memory cache.
 * Batches concurrent requests and caches results to minimize API calls.
 */
import { resonance } from './api';

const _cache = new Map();
let _pendingIds = new Set();
let _pendingPromise = null;
let _pendingResolve = null;

/**
 * Resolve a batch of node IDs to human-readable names.
 * Results are cached — subsequent calls for the same IDs are instant.
 * @param {string[]} ids - Node IDs to resolve
 * @returns {Promise<Record<string, string>>} Map of id -> name
 */
export async function resolveNodeNames(ids) {
  if (!ids || ids.length === 0) return {};

  const uncached = ids.filter(id => id && !_cache.has(id));
  if (uncached.length === 0) {
    const result = {};
    for (const id of ids) if (id) result[id] = _cache.get(id) || id.slice(0, 8);
    return result;
  }

  // Batch: collect IDs and flush in a microtask
  for (const id of uncached) _pendingIds.add(id);

  if (!_pendingPromise) {
    _pendingPromise = new Promise(resolve => { _pendingResolve = resolve; });
    // Flush after microtask to batch concurrent calls
    queueMicrotask(async () => {
      const batch = [..._pendingIds];
      _pendingIds = new Set();
      const currentResolve = _pendingResolve;
      _pendingPromise = null;
      _pendingResolve = null;

      try {
        const names = await resonance.getNodeNames(batch);
        for (const [id, name] of Object.entries(names)) {
          _cache.set(id, name);
        }
        // Cache misses as truncated IDs
        for (const id of batch) {
          if (!_cache.has(id)) _cache.set(id, id.slice(0, 8));
        }
      } catch {
        // Fallback: cache as truncated IDs
        for (const id of batch) {
          if (!_cache.has(id)) _cache.set(id, id.slice(0, 8));
        }
      }
      currentResolve();
    });
  }

  await _pendingPromise;

  const result = {};
  for (const id of ids) if (id) result[id] = _cache.get(id) || id.slice(0, 8);
  return result;
}

/**
 * Get a cached node name synchronously. Returns truncated ID if not cached yet.
 * @param {string} id - Node ID
 * @returns {string} Cached name or truncated ID
 */
export function getCachedName(id) {
  if (!id) return '';
  return _cache.has(id) ? _cache.get(id) : id.slice(0, 8);
}

/** Clear the name cache (e.g. on project switch). */
export function clearNameCache() {
  _cache.clear();
}
