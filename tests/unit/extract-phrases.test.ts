/**
 * Tests for context/topics.ts — extractPhrases (re-implemented, private function).
 * Bigram phrase extraction for context engine topic detection; stop words and short words excluded.
 */
import { describe, it, expect } from '@jest/globals';

const stopWords = new Set(['the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'it', 'be', 'as']);

/** Extract bigram phrases (counts), lowercased; words length > 2, no stop words; sorted by count desc. */
function extractPhrases(text: string) {
    if (!text) return [];

    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 2);

    const phrases = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
        if (stopWords.has(words[i]) || stopWords.has(words[i + 1])) continue;
        const phrase = `${words[i]} ${words[i + 1]}`;
        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    return [...phrases.entries()]
        .filter(([, count]) => count >= 1)
        .sort((a, b) => b[1] - a[1])
        .map(([phrase, count]) => ({ phrase, count }));
}

describe('extractPhrases', () => {
    it('returns empty for empty string', () => {
        expect(extractPhrases('')).toEqual([]);
    });

    it('returns empty for null/undefined', () => {
        expect(extractPhrases(null as any)).toEqual([]);
        expect(extractPhrases(undefined as any)).toEqual([]);
    });

    it('extracts bigram phrases from text', () => {
        const result = extractPhrases('neural network training');
        expect(result.some(r => r.phrase === 'neural network')).toBe(true);
        expect(result.some(r => r.phrase === 'network training')).toBe(true);
    });

    it('counts repeated phrases', () => {
        const result = extractPhrases('neural network and neural network improves');
        const neuralNetwork = result.find(r => r.phrase === 'neural network');
        expect(neuralNetwork).toBeDefined();
        expect(neuralNetwork!.count).toBe(2);
    });

    it('sorts by frequency (highest first)', () => {
        const result = extractPhrases('machine learning machine learning deep learning');
        expect(result[0].phrase).toBe('machine learning');
        expect(result[0].count).toBe(2);
    });

    it('filters phrases where either word is a stop word', () => {
        const result = extractPhrases('neural the network');
        // "neural the" should be filtered (the is stop word)
        // "the network" should be filtered (the is stop word)
        expect(result.some(r => r.phrase.includes('the'))).toBe(false);
    });

    it('filters phrases where short words are involved (len <= 2)', () => {
        const result = extractPhrases('AI neural network');
        // 'ai' has length 2, filtered out by .filter(w => w.length > 2)
        // Only "neural network" remains
        expect(result.every(r => !r.phrase.startsWith('ai '))).toBe(true);
    });

    it('lowercases all phrases', () => {
        const result = extractPhrases('Neural Network Training');
        expect(result.some(r => r.phrase === 'neural network')).toBe(true);
    });

    it('strips non-alphanumeric characters', () => {
        const result = extractPhrases('machine-learning, deep learning!');
        const phrases = result.map(r => r.phrase);
        expect(phrases).toContain('deep learning');
    });

    it('handles single word input (no pairs)', () => {
        expect(extractPhrases('word')).toEqual([]);
    });

    it('handles two words (one pair)', () => {
        const result = extractPhrases('neural network');
        expect(result).toHaveLength(1);
        expect(result[0].phrase).toBe('neural network');
        expect(result[0].count).toBe(1);
    });

    it('handles text with only stop words', () => {
        const result = extractPhrases('the is a an and or');
        expect(result).toEqual([]);
    });

    it('filters pairs with stop word in either position', () => {
        const result = extractPhrases('knowledge for transfer');
        // "knowledge for" → 'for' is stop word → filtered
        // "for transfer" → 'for' is stop word → filtered
        expect(result).toHaveLength(0);
    });

    it('extracts multiple distinct phrases', () => {
        const result = extractPhrases('deep learning enables neural network optimization');
        const phrases = result.map(r => r.phrase);
        expect(phrases).toContain('deep learning');
        expect(phrases).toContain('neural network');
    });
});
