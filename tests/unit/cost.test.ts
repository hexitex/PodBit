/**
 * Tests for models/cost.ts -- isReasoningModel (pure function).
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        tokenLimits: {
            reasoningModelPatterns: ['o1', 'o3', 'reasoning'],
        },
    },
}));
jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: jest.fn(),
}));

const { isReasoningModel } = await import('../../models/cost.js');

describe('isReasoningModel', () => {
    it('detects reasoning models', () => {
        expect(isReasoningModel('o1-preview')).toBe(true);
        expect(isReasoningModel('o3-mini')).toBe(true);
    });

    it('case-insensitive match', () => {
        expect(isReasoningModel('O1-Preview')).toBe(true);
        expect(isReasoningModel('REASONING-MODEL')).toBe(true);
    });

    it('returns false for non-reasoning models', () => {
        expect(isReasoningModel('gpt-4')).toBe(false);
        expect(isReasoningModel('claude-3-opus')).toBe(false);
        expect(isReasoningModel('llama-3.1')).toBe(false);
    });

    it('handles empty model ID', () => {
        expect(isReasoningModel('')).toBe(false);
    });

    it('handles null/undefined model ID', () => {
        expect(isReasoningModel(null as any)).toBe(false);
        expect(isReasoningModel(undefined as any)).toBe(false);
    });

    it('pattern matches substring (not just prefix)', () => {
        expect(isReasoningModel('my-custom-o1-fine-tuned')).toBe(true);
    });
});
