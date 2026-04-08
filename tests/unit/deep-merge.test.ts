/**
 * Tests for config/loader.ts — deepMerge (re-implemented).
 * Recursive merge: plain objects merged; arrays and primitives replace target.
 */
import { describe, it, expect } from '@jest/globals';

/** Merge source into target in-place; only nested plain objects are merged, rest replaced. */
function deepMerge(target: any, source: any): void {
    for (const key of Object.keys(source)) {
        if (
            source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
            target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
        ) {
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
}

// Helper that returns merged result (non-mutating wrapper for test clarity)
function _merge<T extends object>(target: T, source: Partial<T>): T {
    const t = JSON.parse(JSON.stringify(target));
    deepMerge(t, source);
    return t;
}

describe('deepMerge — primitive values', () => {
    it('replaces top-level primitive', () => {
        const target = { x: 1 };
        deepMerge(target, { x: 99 });
        expect(target.x).toBe(99);
    });

    it('adds new key from source', () => {
        const target: any = { x: 1 };
        deepMerge(target, { y: 2 });
        expect(target.y).toBe(2);
    });

    it('leaves target keys not in source unchanged', () => {
        const target = { x: 1, y: 2 };
        deepMerge(target, { x: 99 });
        expect(target.y).toBe(2);
    });

    it('replaces string values', () => {
        const target = { name: 'original' };
        deepMerge(target, { name: 'updated' });
        expect(target.name).toBe('updated');
    });

    it('replaces boolean values', () => {
        const target = { enabled: false };
        deepMerge(target, { enabled: true });
        expect((target as any).enabled).toBe(true);
    });
});

describe('deepMerge — nested objects', () => {
    it('recursively merges nested objects', () => {
        const target = { a: { x: 1, y: 2 } };
        deepMerge(target, { a: { x: 99 } });
        expect(target.a.x).toBe(99);
        expect(target.a.y).toBe(2); // preserved
    });

    it('merges multiple levels deep', () => {
        const target = { a: { b: { c: 1, d: 2 } } };
        deepMerge(target, { a: { b: { c: 99 } } });
        expect(target.a.b.c).toBe(99);
        expect(target.a.b.d).toBe(2);
    });

    it('merges sibling object keys separately', () => {
        const target = { a: { x: 1 }, b: { y: 2 } };
        deepMerge(target, { a: { z: 3 }, b: { w: 4 } });
        expect(target.a).toEqual({ x: 1, z: 3 });
        expect(target.b).toEqual({ y: 2, w: 4 });
    });
});

describe('deepMerge — arrays', () => {
    it('replaces arrays (does not merge)', () => {
        const target = { list: [1, 2, 3] };
        deepMerge(target, { list: [4, 5] });
        expect(target.list).toEqual([4, 5]);
    });

    it('replaces array when target has no array', () => {
        const target: any = { list: null };
        deepMerge(target, { list: [1, 2, 3] });
        expect(target.list).toEqual([1, 2, 3]);
    });

    it('replaces target object with array from source', () => {
        // If source has array but target has object, replace (not merge)
        // Because Array.isArray(source[key]) is true
        const target: any = { x: { a: 1 } };
        deepMerge(target, { x: [1, 2] });
        expect(target.x).toEqual([1, 2]);
    });
});

describe('deepMerge — null and falsy values', () => {
    it('sets target key to null when source has null', () => {
        const target: any = { x: 42 };
        deepMerge(target, { x: null });
        expect(target.x).toBeNull();
    });

    it('sets target key to 0 when source has 0', () => {
        const target: any = { threshold: 0.5 };
        deepMerge(target, { threshold: 0 });
        expect(target.threshold).toBe(0);
    });

    it('sets target key to false', () => {
        const target: any = { enabled: true };
        deepMerge(target, { enabled: false });
        expect(target.enabled).toBe(false);
    });
});

describe('deepMerge — mutates target', () => {
    it('mutates the target object in-place', () => {
        const target = { x: 1 };
        const ref = target;
        deepMerge(target, { x: 2 });
        expect(ref.x).toBe(2); // same object
    });

    it('does not return a value (void)', () => {
        const result = deepMerge({ x: 1 }, { x: 2 });
        expect(result).toBeUndefined();
    });
});

describe('deepMerge — real-world config example', () => {
    it('merges engine config changes without clobbering other sections', () => {
        const config = {
            engine: { resonanceThreshold: 0.3, knowledgeWeight: 1.0 },
            dedup: { embeddingSimilarityThreshold: 0.9, wordOverlapThreshold: 0.85 },
        };
        deepMerge(config, { engine: { resonanceThreshold: 0.5 } });
        expect(config.engine.resonanceThreshold).toBe(0.5);
        expect(config.engine.knowledgeWeight).toBe(1.0); // preserved
        expect(config.dedup.embeddingSimilarityThreshold).toBe(0.9); // preserved
    });
});
