/**
 * Tests for context/topics.ts — extractKeywords (pure-ish, needs config mock).
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        contextEngine: {
            stopWords: ['the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'it', 'be', 'as'],
        },
    },
}));
jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: jest.fn<any>().mockResolvedValue(null),
}));
jest.unstable_mockModule('../../core.js', () => ({
    cosineSimilarity: jest.fn().mockReturnValue(0),
    findDomainsBySynonym: jest.fn<any>().mockResolvedValue([]),
}));

const { extractKeywords } = await import('../../context/topics.js');

describe('extractKeywords', () => {
    it('extracts keywords sorted by frequency', () => {
        const result = extractKeywords('neural network training neural network optimization');
        expect(result[0].word).toBe('neural');
        expect(result[0].count).toBe(2);
        expect(result[1].word).toBe('network');
        expect(result[1].count).toBe(2);
    });

    it('filters stop words', () => {
        const result = extractKeywords('the neural network is a model for the brain');
        const words = result.map(r => r.word);
        expect(words).not.toContain('the');
        expect(words).not.toContain('is');
        expect(words).not.toContain('a');
        expect(words).not.toContain('for');
        expect(words).toContain('neural');
        expect(words).toContain('network');
        expect(words).toContain('model');
        expect(words).toContain('brain');
    });

    it('filters short words (<=2 chars)', () => {
        const result = extractKeywords('AI is an ML model');
        const words = result.map(r => r.word);
        expect(words).not.toContain('ai');
        expect(words).not.toContain('ml');
        // 'an' is a stop word AND short
    });

    it('lowercases all words', () => {
        const result = extractKeywords('Neural Network TRAINING');
        const words = result.map(r => r.word);
        expect(words).toContain('neural');
        expect(words).toContain('network');
        expect(words).toContain('training');
    });

    it('strips non-alphanumeric characters (except hyphens)', () => {
        const result = extractKeywords('machine-learning, deep_learning! great');
        const words = result.map(r => r.word);
        // Hyphens are preserved in the regex [a-z0-9\s-], so machine-learning stays whole
        expect(words).toContain('machine-learning');
        expect(words).toContain('deep');
        expect(words).toContain('learning');
        expect(words).toContain('great');
    });

    it('returns empty array for empty input', () => {
        expect(extractKeywords('')).toEqual([]);
    });

    it('returns empty array for null/undefined', () => {
        expect(extractKeywords(null as any)).toEqual([]);
        expect(extractKeywords(undefined as any)).toEqual([]);
    });

    it('returns empty array for stop-words-only input', () => {
        const result = extractKeywords('the is a an and or but in on at to for');
        expect(result).toEqual([]);
    });

    it('handles numbers in text', () => {
        const result = extractKeywords('model has 100 parameters and 200 layers');
        const words = result.map(r => r.word);
        expect(words).toContain('model');
        expect(words).toContain('parameters');
        expect(words).toContain('100');
        expect(words).toContain('200');
        expect(words).toContain('layers');
    });

    it('preserves hyphenated compound words', () => {
        const result = extractKeywords('cross-domain knowledge-graph');
        const words = result.map(r => r.word);
        expect(words).toContain('cross-domain');
        expect(words).toContain('knowledge-graph');
    });
});
