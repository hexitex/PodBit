/**
 * Tests for utils/cached-settings.ts — createCachedLoader.
 */
import { jest, describe, it, expect } from '@jest/globals';

const { createCachedLoader } = await import('../../utils/cached-settings.js');

describe('createCachedLoader', () => {
    it('calls loadFn on first get()', async () => {
        const loadFn = jest.fn<any>().mockResolvedValue('data');
        const loader = createCachedLoader(loadFn);

        const result = await loader.get();
        expect(result).toBe('data');
        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it('returns cached value within TTL', async () => {
        const loadFn = jest.fn<any>().mockResolvedValue('cached');
        const loader = createCachedLoader(loadFn, 60000);

        await loader.get();
        await loader.get();
        await loader.get();

        expect(loadFn).toHaveBeenCalledTimes(1);
    });

    it('reloads after TTL expires', async () => {
        const loadFn = jest.fn<any>()
            .mockResolvedValueOnce('first')
            .mockResolvedValueOnce('second');

        // Very short TTL for testing
        const loader = createCachedLoader(loadFn, 1);

        const first = await loader.get();
        expect(first).toBe('first');

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        const second = await loader.get();
        expect(second).toBe('second');
        expect(loadFn).toHaveBeenCalledTimes(2);
    });

    it('invalidate() forces reload on next get()', async () => {
        const loadFn = jest.fn<any>()
            .mockResolvedValueOnce('original')
            .mockResolvedValueOnce('refreshed');

        const loader = createCachedLoader(loadFn, 60000);

        await loader.get();
        expect(loadFn).toHaveBeenCalledTimes(1);

        loader.invalidate();

        const result = await loader.get();
        expect(result).toBe('refreshed');
        expect(loadFn).toHaveBeenCalledTimes(2);
    });

    it('handles loadFn that throws', async () => {
        const loadFn = jest.fn<any>().mockRejectedValue(new Error('load failed'));
        const loader = createCachedLoader(loadFn);

        await expect(loader.get()).rejects.toThrow('load failed');
    });

    it('retries after loadFn failure (no stale cache)', async () => {
        const loadFn = jest.fn<any>()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce('recovered');

        const loader = createCachedLoader(loadFn);

        await expect(loader.get()).rejects.toThrow('transient');

        const result = await loader.get();
        expect(result).toBe('recovered');
        expect(loadFn).toHaveBeenCalledTimes(2);
    });

    it('caches different value types', async () => {
        const objLoader = createCachedLoader(async () => ({ key: 'val' }));
        const arrLoader = createCachedLoader(async () => [1, 2, 3]);
        const numLoader = createCachedLoader(async () => 42);

        expect(await objLoader.get()).toEqual({ key: 'val' });
        expect(await arrLoader.get()).toEqual([1, 2, 3]);
        expect(await numLoader.get()).toBe(42);
    });

    it('uses default TTL of 60 seconds', async () => {
        const loadFn = jest.fn<any>().mockResolvedValue('data');
        const loader = createCachedLoader(loadFn);

        await loader.get();
        await loader.get();

        // Within default 60s TTL, should only call once
        expect(loadFn).toHaveBeenCalledTimes(1);
    });
});
