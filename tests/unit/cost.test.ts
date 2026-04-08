/**
 * Tests for models/cost.ts — applyReasoningBonus (pure function).
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        tokenLimits: {
            reasoningModelPatterns: ['o1', 'o3', 'reasoning'],
            reasoningExtraTokens: 16000,
        },
    },
}));
jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: jest.fn(),
}));

const { applyReasoningBonus } = await import('../../models/cost.js');

describe('applyReasoningBonus', () => {
    it('adds bonus for reasoning models', () => {
        expect(applyReasoningBonus('o1-preview', 4096)).toBe(4096 + 16000);
        expect(applyReasoningBonus('o3-mini', 8192)).toBe(8192 + 16000);
    });

    it('adds bonus for case-insensitive match', () => {
        expect(applyReasoningBonus('O1-Preview', 4096)).toBe(4096 + 16000);
        expect(applyReasoningBonus('REASONING-MODEL', 2048)).toBe(2048 + 16000);
    });

    it('does not add bonus for non-reasoning models', () => {
        expect(applyReasoningBonus('gpt-4', 4096)).toBe(4096);
        expect(applyReasoningBonus('claude-3-opus', 8192)).toBe(8192);
        expect(applyReasoningBonus('llama-3.1', 2048)).toBe(2048);
    });

    it('handles empty model ID', () => {
        expect(applyReasoningBonus('', 4096)).toBe(4096);
    });

    it('handles null/undefined model ID', () => {
        expect(applyReasoningBonus(null as any, 4096)).toBe(4096);
        expect(applyReasoningBonus(undefined as any, 4096)).toBe(4096);
    });

    it('pattern matches substring (not just prefix)', () => {
        expect(applyReasoningBonus('my-custom-o1-fine-tuned', 4096)).toBe(4096 + 16000);
    });

    it('handles zero maxTokens', () => {
        expect(applyReasoningBonus('o1', 0)).toBe(16000);
    });
});
