/**
 * Generic cached loader with TTL-based invalidation.
 *
 * Replaces the repeated pattern of module-level cache + timestamp + TTL check.
 * The first call to `get()` invokes the loader; subsequent calls return
 * the cached value until the TTL expires, at which point the loader runs again.
 * Call `invalidate()` to force a reload on the next `get()`.
 *
 * @typeParam T - The type of the cached value
 * @param loadFn - Async function that fetches/computes the value to cache
 * @param ttlMs - Time-to-live in milliseconds before the cache expires (default 60s)
 * @returns Object with `get()` to retrieve the cached value and `invalidate()` to force a refresh
 */
export function createCachedLoader<T>(
    loadFn: () => Promise<T>,
    ttlMs: number = 60_000
): { get: () => Promise<T>; invalidate: () => void } {
    let cache: T | undefined;
    let loadedAt = 0;

    return {
        async get(): Promise<T> {
            if (cache !== undefined && Date.now() - loadedAt < ttlMs) return cache;
            cache = await loadFn();
            loadedAt = Date.now();
            return cache;
        },
        invalidate(): void {
            loadedAt = 0;
        },
    };
}
