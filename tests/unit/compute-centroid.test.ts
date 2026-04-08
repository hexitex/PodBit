/**
 * Tests for computeCentroid — mean embedding vector computation.
 *
 * computeCentroid computes the mean embedding vector from a set of embeddings.
 */
import { describe, it, expect } from '@jest/globals';

// Standalone implementation of computeCentroid for testing
function computeCentroid(embeddings: number[][]): number[] {
    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);
    for (const emb of embeddings) {
        for (let i = 0; i < dim; i++) centroid[i] += emb[i];
    }
    const n = embeddings.length;
    for (let i = 0; i < dim; i++) centroid[i] /= n;
    return centroid;
}

describe('computeCentroid', () => {
    describe('basic averaging', () => {
        it('returns the same values for a single embedding', () => {
            const emb = [0.1, 0.5, 0.9];
            const centroid = computeCentroid([emb]);
            expect(centroid).toEqual([0.1, 0.5, 0.9]);
        });

        it('averages two identical embeddings to the same value', () => {
            const emb = [0.4, 0.6, 0.8];
            const centroid = computeCentroid([emb, emb]);
            expect(centroid[0]).toBeCloseTo(0.4, 10);
            expect(centroid[1]).toBeCloseTo(0.6, 10);
            expect(centroid[2]).toBeCloseTo(0.8, 10);
        });

        it('averages two opposite unit vectors to zero', () => {
            const a = [1, 0, 0];
            const b = [-1, 0, 0];
            const centroid = computeCentroid([a, b]);
            expect(centroid[0]).toBeCloseTo(0, 10);
            expect(centroid[1]).toBeCloseTo(0, 10);
            expect(centroid[2]).toBeCloseTo(0, 10);
        });

        it('computes midpoint of two vectors', () => {
            const a = [1, 0];
            const b = [0, 1];
            const centroid = computeCentroid([a, b]);
            expect(centroid[0]).toBeCloseTo(0.5, 10);
            expect(centroid[1]).toBeCloseTo(0.5, 10);
        });

        it('averages three embeddings correctly', () => {
            const embs = [
                [3, 0, 0],
                [0, 6, 0],
                [0, 0, 9],
            ];
            const centroid = computeCentroid(embs);
            expect(centroid[0]).toBeCloseTo(1, 10);
            expect(centroid[1]).toBeCloseTo(2, 10);
            expect(centroid[2]).toBeCloseTo(3, 10);
        });
    });

    describe('dimensionality', () => {
        it('returns a vector with the same dimension as the input', () => {
            const embs = [
                [0.1, 0.2, 0.3, 0.4, 0.5],
                [0.5, 0.4, 0.3, 0.2, 0.1],
            ];
            const centroid = computeCentroid(embs);
            expect(centroid).toHaveLength(5);
        });

        it('handles 1-dimensional embeddings', () => {
            const centroid = computeCentroid([[2], [4], [6]]);
            expect(centroid[0]).toBeCloseTo(4, 10);
        });

        it('handles high-dimensional embeddings (384-dim)', () => {
            const dim = 384;
            const emb1 = new Array(dim).fill(0.5);
            const emb2 = new Array(dim).fill(1.5);
            const centroid = computeCentroid([emb1, emb2]);
            expect(centroid).toHaveLength(dim);
            expect(centroid[0]).toBeCloseTo(1.0, 10);
            expect(centroid[383]).toBeCloseTo(1.0, 10);
        });
    });

    describe('numeric precision', () => {
        it('handles negative values correctly', () => {
            const embs = [
                [-1, -2, -3],
                [1, 2, 3],
            ];
            const centroid = computeCentroid(embs);
            expect(centroid[0]).toBeCloseTo(0, 10);
            expect(centroid[1]).toBeCloseTo(0, 10);
            expect(centroid[2]).toBeCloseTo(0, 10);
        });

        it('handles all-zero embeddings', () => {
            const embs = [[0, 0, 0], [0, 0, 0]];
            const centroid = computeCentroid(embs);
            expect(centroid).toEqual([0, 0, 0]);
        });

        it('handles many embeddings (100) without accumulated error', () => {
            const n = 100;
            const embs = Array.from({ length: n }, () => [1.0, 2.0, 3.0]);
            const centroid = computeCentroid(embs);
            expect(centroid[0]).toBeCloseTo(1.0, 5);
            expect(centroid[1]).toBeCloseTo(2.0, 5);
            expect(centroid[2]).toBeCloseTo(3.0, 5);
        });

        it('weights all embeddings equally (no frequency bias)', () => {
            // Three embeddings: [0,0], [1,1], [2,2] → centroid [1,1]
            const centroid = computeCentroid([[0, 0], [1, 1], [2, 2]]);
            expect(centroid[0]).toBeCloseTo(1.0, 10);
            expect(centroid[1]).toBeCloseTo(1.0, 10);
        });
    });
});
