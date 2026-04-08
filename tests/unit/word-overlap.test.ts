/**
 * Tests for handlers/dedup.ts — computeWordOverlap (re-implemented, private function).
 * Used with embedding similarity in the dedup gate. Logic re-implemented here for isolation.
 */
import { describe, it, expect } from '@jest/globals';

/**
 * Jaccard-like overlap: |A ∩ B| / min(|A|, |B|) over word sets.
 * Words are lowercased and filtered by length > minWordLength.
 * @param minWordLength - Words with length <= this are excluded (default 2).
 */
function computeWordOverlap(contentA: string, contentB: string, minWordLength = 2): number {
    const wordsA = new Set(contentA.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    const wordsB = new Set(contentB.toLowerCase().split(/\s+/).filter(w => w.length > minWordLength));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
    return overlap / Math.min(wordsA.size, wordsB.size);
}

describe('computeWordOverlap', () => {
    describe('identical content', () => {
        it('returns 1.0 for identical strings', () => {
            const text = 'neural network training improves accuracy';
            expect(computeWordOverlap(text, text)).toBe(1.0);
        });

        it('returns 1.0 for different casing of same words', () => {
            expect(computeWordOverlap('Neural Network', 'neural network')).toBe(1.0);
        });

        it('returns 1.0 for same words in different order', () => {
            expect(computeWordOverlap('training network neural', 'neural training network')).toBe(1.0);
        });
    });

    describe('no overlap', () => {
        it('returns 0.0 for completely different words', () => {
            const a = 'quantum physics particles';
            const b = 'biology ecology metabolism';
            expect(computeWordOverlap(a, b)).toBe(0.0);
        });

        it('returns 0.0 when both strings are empty', () => {
            expect(computeWordOverlap('', '')).toBe(0.0);
        });

        it('returns 0.0 when one string is empty', () => {
            expect(computeWordOverlap('neural network', '')).toBe(0.0);
            expect(computeWordOverlap('', 'neural network')).toBe(0.0);
        });

        it('returns 0.0 when all words are too short (filtered out)', () => {
            // With minWordLength=2, words with length <= 2 are excluded
            // 'a' (1 char), 'is' (2 chars), 'on' (2 chars) all filtered with minWordLength=2
            expect(computeWordOverlap('a is on', 'a is on', 2)).toBe(0.0);
        });
    });

    describe('partial overlap', () => {
        it('returns 0.5 when half the shorter set overlaps', () => {
            // A: {'neural', 'network'} = 2 words
            // B: {'neural', 'learning'} = 2 words
            // Overlap: {'neural'} = 1 word
            // min(2,2) = 2 → 1/2 = 0.5
            const result = computeWordOverlap('neural network', 'neural learning');
            expect(result).toBeCloseTo(0.5, 10);
        });

        it('normalizes by minimum set size (not union)', () => {
            // A: {'neural', 'network', 'training', 'accuracy'} = 4 words
            // B: {'neural'} = 1 word
            // Overlap: {'neural'} = 1
            // min(4,1) = 1 → 1/1 = 1.0
            const result = computeWordOverlap('neural network training accuracy', 'neural');
            expect(result).toBe(1.0);
        });

        it('computes partial overlap correctly with 3 matching words', () => {
            // A: {'cats', 'dogs', 'birds', 'fish'} = 4 unique words
            // B: {'cats', 'dogs', 'birds'} = 3 unique words
            // Overlap = 3, min = 3 → 1.0
            const result = computeWordOverlap('cats dogs birds fish', 'cats dogs birds');
            expect(result).toBe(1.0);
        });
    });

    describe('deduplication within content', () => {
        it('treats each word as unique (set semantics)', () => {
            // Repeated words don't inflate the set size
            // A: {'neural'} = 1 word (repeated 3 times)
            // B: {'neural'} = 1 word
            // Overlap = 1, min = 1 → 1.0
            const result = computeWordOverlap('neural neural neural', 'neural');
            expect(result).toBe(1.0);
        });

        it('handles repeated words without double-counting overlap', () => {
            // A: {'word', 'repeat'} = 2 unique
            // B: {'word', 'other'} = 2 unique
            // Overlap: {'word'} = 1 → 1/2 = 0.5
            const result = computeWordOverlap('word repeat word', 'word other');
            expect(result).toBeCloseTo(0.5, 10);
        });
    });

    describe('short word filtering', () => {
        it('filters words with length <= minWordLength', () => {
            // With minWordLength=2, 'is' (2 chars) is filtered out, only 'neural' and 'network' remain
            const result = computeWordOverlap('neural is network', 'neural is training', 2);
            // A: {'neural', 'network'}, B: {'neural', 'training'}
            // Overlap: {'neural'} = 1, min = 2 → 0.5
            expect(result).toBeCloseTo(0.5, 10);
        });

        it('handles content with only short words as empty set', () => {
            // All words filtered → returns 0
            expect(computeWordOverlap('a b c', 'a b c', 1)).toBe(0.0); // words len <= 1 filtered
        });
    });

    describe('real-world use cases', () => {
        it('detects near-duplicate sentences', () => {
            const a = 'Neural networks learn representations through gradient descent optimization';
            const b = 'Neural networks learn representations using gradient descent';
            const overlap = computeWordOverlap(a, b);
            expect(overlap).toBeGreaterThan(0.7);
        });

        it('returns low overlap for semantically different sentences', () => {
            const a = 'Quantum entanglement allows non-local correlations between particles';
            const b = 'Machine learning models require large datasets for training';
            const overlap = computeWordOverlap(a, b);
            expect(overlap).toBeLessThan(0.2);
        });
    });
});
