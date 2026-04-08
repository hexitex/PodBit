/**
 * Tests for handlers/graph/query.ts — parseEmbeddingField (re-implemented, private).
 *
 * Handles three input shapes:
 *   Buffer → Float32Array → number[]
 *   Array  → return as-is
 *   string → JSON.parse → number[]
 *   other  → null
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement parseEmbeddingField from handlers/graph/query.ts
function parseEmbeddingField(emb: any): number[] | null {
    if (!emb) return null;
    if (Buffer.isBuffer(emb)) {
        const f32 = new Float32Array(emb.buffer, emb.byteOffset, emb.byteLength / 4);
        return Array.from(f32);
    }
    if (Array.isArray(emb)) return emb;
    if (typeof emb === 'string') {
        try { return JSON.parse(emb); } catch { return null; }
    }
    return null;
}

describe('parseEmbeddingField', () => {
    describe('null / falsy inputs', () => {
        it('returns null for null', () => {
            expect(parseEmbeddingField(null)).toBeNull();
        });

        it('returns null for undefined', () => {
            expect(parseEmbeddingField(undefined)).toBeNull();
        });

        it('returns null for 0 (falsy number)', () => {
            expect(parseEmbeddingField(0)).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(parseEmbeddingField('')).toBeNull();
        });
    });

    describe('Buffer input (binary Float32 format)', () => {
        it('converts a Float32Array buffer to number array', () => {
            const floats = new Float32Array([0.1, 0.5, 0.9]);
            const buf = Buffer.from(floats.buffer);
            const result = parseEmbeddingField(buf);
            expect(result).toBeDefined();
            expect(result).toHaveLength(3);
            expect(result![0]).toBeCloseTo(0.1, 5);
            expect(result![1]).toBeCloseTo(0.5, 5);
            expect(result![2]).toBeCloseTo(0.9, 5);
        });

        it('handles empty buffer', () => {
            const buf = Buffer.from(new Float32Array([]).buffer);
            const result = parseEmbeddingField(buf);
            expect(result).toEqual([]);
        });

        it('handles single-element buffer', () => {
            const floats = new Float32Array([1.0]);
            const buf = Buffer.from(floats.buffer);
            const result = parseEmbeddingField(buf);
            expect(result).toHaveLength(1);
            expect(result![0]).toBeCloseTo(1.0, 5);
        });

        it('handles 384-dim embedding buffer (typical size)', () => {
            const floats = new Float32Array(384).fill(0.1);
            const buf = Buffer.from(floats.buffer);
            const result = parseEmbeddingField(buf);
            expect(result).toHaveLength(384);
        });
    });

    describe('Array input (already parsed)', () => {
        it('returns the array as-is', () => {
            const arr = [0.1, 0.2, 0.3];
            const result = parseEmbeddingField(arr);
            expect(result).toBe(arr); // same reference
        });

        it('returns empty array as-is', () => {
            const result = parseEmbeddingField([]);
            expect(result).toEqual([]);
        });

        it('returns nested array as-is', () => {
            const arr = [[1, 2], [3, 4]];
            const result = parseEmbeddingField(arr);
            expect(result).toBe(arr);
        });
    });

    describe('String input (JSON-serialized)', () => {
        it('parses a JSON number array string', () => {
            const result = parseEmbeddingField('[0.1, 0.2, 0.3]');
            expect(result).toEqual([0.1, 0.2, 0.3]);
        });

        it('parses an empty JSON array string', () => {
            const result = parseEmbeddingField('[]');
            expect(result).toEqual([]);
        });

        it('returns null for invalid JSON string', () => {
            const result = parseEmbeddingField('not json');
            expect(result).toBeNull();
        });

        it('returns null for malformed JSON string', () => {
            const result = parseEmbeddingField('[1, 2, 3');
            expect(result).toBeNull();
        });

        it('parses a large embedding string correctly', () => {
            const floats = Array.from({ length: 128 }, (_, i) => i * 0.01);
            const json = JSON.stringify(floats);
            const result = parseEmbeddingField(json);
            expect(result).toHaveLength(128);
            expect(result![0]).toBeCloseTo(0, 5);
            expect(result![127]).toBeCloseTo(1.27, 5);
        });
    });

    describe('other types', () => {
        it('returns null for number input', () => {
            expect(parseEmbeddingField(42)).toBeNull();
        });

        it('returns null for boolean input', () => {
            expect(parseEmbeddingField(true)).toBeNull();
        });

        it('returns null for plain object', () => {
            expect(parseEmbeddingField({ values: [1, 2, 3] })).toBeNull();
        });
    });
});
