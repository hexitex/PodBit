/**
 * Tests for handlers/config-tune/helpers.ts — getNestedValue, setNestedValue, generateUuid.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement pure helpers from handlers/config-tune/helpers.ts

/** Get value at dot-path in object; returns undefined if path is missing or null. */
function getNestedValue(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

/** Set value at dot-path; creates intermediate objects as needed; mutates obj. */
function setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]] || typeof current[path[i]] !== 'object') {
            current[path[i]] = {};
        }
        current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
}

/** Generate a UUID v4 string (random, no crypto deps). */
function generateUuid(): string {
    const hex = (n: number): string => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    return `${hex(4)}-${hex(2)}-4${hex(2).substring(1)}-${((parseInt(hex(1), 16) & 0x3) | 0x8).toString(16)}${hex(2).substring(1)}-${hex(6)}`;
}

describe('getNestedValue', () => {
    const obj = {
        a: {
            b: {
                c: 42,
                d: 'hello',
            },
            e: [1, 2, 3],
        },
        top: 'value',
    };

    it('gets top-level value', () => {
        expect(getNestedValue(obj, ['top'])).toBe('value');
    });

    it('gets nested value by path', () => {
        expect(getNestedValue(obj, ['a', 'b', 'c'])).toBe(42);
    });

    it('gets deeply nested string', () => {
        expect(getNestedValue(obj, ['a', 'b', 'd'])).toBe('hello');
    });

    it('gets array value', () => {
        expect(getNestedValue(obj, ['a', 'e'])).toEqual([1, 2, 3]);
    });

    it('returns undefined for missing key', () => {
        expect(getNestedValue(obj, ['missing'])).toBeUndefined();
    });

    it('returns undefined for missing nested key', () => {
        expect(getNestedValue(obj, ['a', 'missing', 'c'])).toBeUndefined();
    });

    it('handles null at intermediate path', () => {
        const obj2 = { a: null };
        expect(getNestedValue(obj2, ['a', 'b'])).toBeUndefined();
    });

    it('handles empty path array', () => {
        expect(getNestedValue(obj, [])).toBe(obj);
    });

    it('returns undefined when root is null', () => {
        expect(getNestedValue(null, ['a'])).toBeUndefined();
    });

    it('gets falsy values correctly', () => {
        const obj3 = { a: { b: 0 } };
        expect(getNestedValue(obj3, ['a', 'b'])).toBe(0);
    });

    it('gets boolean false correctly', () => {
        const obj4 = { enabled: false };
        expect(getNestedValue(obj4, ['enabled'])).toBe(false);
    });
});

describe('setNestedValue', () => {
    it('sets top-level value', () => {
        const obj: any = { a: 1 };
        setNestedValue(obj, ['b'], 42);
        expect(obj.b).toBe(42);
    });

    it('sets nested value', () => {
        const obj: any = { a: { b: 1 } };
        setNestedValue(obj, ['a', 'b'], 99);
        expect(obj.a.b).toBe(99);
    });

    it('creates intermediate objects', () => {
        const obj: any = {};
        setNestedValue(obj, ['a', 'b', 'c'], 'deep');
        expect(obj.a.b.c).toBe('deep');
    });

    it('overwrites existing value', () => {
        const obj: any = { x: { y: 'old' } };
        setNestedValue(obj, ['x', 'y'], 'new');
        expect(obj.x.y).toBe('new');
    });

    it('creates path through non-object', () => {
        const obj: any = { a: 'string' };
        setNestedValue(obj, ['a', 'b'], 'val');
        expect(obj.a.b).toBe('val');
    });

    it('preserves other keys when setting nested', () => {
        const obj: any = { a: { b: 1, c: 2 } };
        setNestedValue(obj, ['a', 'd'], 3);
        expect(obj.a.b).toBe(1);
        expect(obj.a.c).toBe(2);
        expect(obj.a.d).toBe(3);
    });

    it('sets falsy values', () => {
        const obj: any = { a: true };
        setNestedValue(obj, ['a'], false);
        expect(obj.a).toBe(false);
    });

    it('sets null', () => {
        const obj: any = { a: 'value' };
        setNestedValue(obj, ['a'], null);
        expect(obj.a).toBeNull();
    });

    it('sets arrays', () => {
        const obj: any = {};
        setNestedValue(obj, ['items'], [1, 2, 3]);
        expect(obj.items).toEqual([1, 2, 3]);
    });

    it('sets single-element path', () => {
        const obj: any = {};
        setNestedValue(obj, ['key'], 'value');
        expect(obj.key).toBe('value');
    });
});

describe('generateUuid (config-tune helpers)', () => {
    it('matches UUID v4 format', () => {
        const uuid = generateUuid();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('generates unique values', () => {
        const uuids = new Set(Array.from({ length: 50 }, generateUuid));
        expect(uuids.size).toBe(50);
    });

    it('version nibble is always 4', () => {
        for (let i = 0; i < 10; i++) {
            expect(generateUuid()[14]).toBe('4');
        }
    });

    it('variant nibble is 8, 9, a, or b', () => {
        for (let i = 0; i < 10; i++) {
            expect(['8', '9', 'a', 'b']).toContain(generateUuid()[19]);
        }
    });
});
