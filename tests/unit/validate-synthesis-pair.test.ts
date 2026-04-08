/**
 * Tests for core/synthesis-engine.ts — validateSynthesisPair (re-implemented).
 *
 * Three quality gates:
 *   1. Anti-tautology: one node is a near-subset of the other (word overlap > threshold)
 *   2. Similarity ceiling: resonance score too high (near-duplicate)
 *   3. Minimum vocabulary: both nodes need enough unique long words
 *   4. Average specificity: at least one node must have substance
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement validateSynthesisPair from core/synthesis-engine.ts
const CONFIG = {
    subsetOverlapThreshold: 0.8,
    similarityCeiling: 0.92,
    minVocabulary: 5,
    minCombinedSpecificity: 1.5, // average specificity threshold (was 3 when additive)
};

function validateSynthesisPair(
    nodeA: { content: string; specificity?: number },
    nodeB: { content: string; specificity?: number },
    resonance: number,
): { valid: boolean; reason?: string } {
    const wordsA = new Set(nodeA.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const wordsB = new Set(nodeB.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));

    // 1. Anti-tautology
    if (wordsA.size > 0 && wordsB.size > 0) {
        const overlapAB = [...wordsA].filter((w: string) => wordsB.has(w)).length;
        const subsetRatioA = overlapAB / wordsA.size;
        const subsetRatioB = overlapAB / wordsB.size;
        if (subsetRatioA > CONFIG.subsetOverlapThreshold || subsetRatioB > CONFIG.subsetOverlapThreshold) {
            return { valid: false, reason: `Near-tautology: ${Math.round(Math.max(subsetRatioA, subsetRatioB) * 100)}% word overlap` };
        }
    }

    // 2. Similarity ceiling
    if (resonance > CONFIG.similarityCeiling) {
        return { valid: false, reason: `Similarity too high (${resonance.toFixed(3)}), likely near-duplicate` };
    }

    // 3. Minimum vocabulary
    if (wordsA.size < CONFIG.minVocabulary || wordsB.size < CONFIG.minVocabulary) {
        return { valid: false, reason: 'Insufficient vocabulary in one or both nodes' };
    }

    // 4. Average specificity
    const specA = nodeA.specificity || 0;
    const specB = nodeB.specificity || 0;
    const avgSpec = (specA + specB) / 2;
    if (avgSpec < CONFIG.minCombinedSpecificity) {
        return { valid: false, reason: `Average specificity too low (${avgSpec.toFixed(3)}). Both nodes are too generic.` };
    }

    return { valid: true };
}

const GOOD_A = 'Neural networks learn distributed representations from training data through gradient descent optimization.';
const GOOD_B = 'Biological synaptic plasticity follows Hebbian learning rules that strengthen frequently co-activated connections.';

describe('validateSynthesisPair — valid pairs', () => {
    it('accepts two diverse nodes', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 5 }, { content: GOOD_B, specificity: 4 }, 0.6);
        expect(result.valid).toBe(true);
    });

    it('accepts at boundary resonance (exactly 0.92 — not above ceiling)', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 5 }, { content: GOOD_B, specificity: 4 }, 0.92);
        expect(result.valid).toBe(true);
    });

    it('accepts minimum average specificity (exactly 1.5)', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 2 }, { content: GOOD_B, specificity: 1 }, 0.5);
        expect(result.valid).toBe(true);
    });
});

describe('validateSynthesisPair — anti-tautology gate', () => {
    it('rejects when one node is a near-subset of the other', () => {
        const a = 'neural network learns representations gradient training optimization methods';
        const b = 'neural network learns representations gradient training optimization approaches';
        const result = validateSynthesisPair({ content: a, specificity: 5 }, { content: b, specificity: 5 }, 0.5);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Near-tautology');
    });

    it('includes percentage in rejection reason', () => {
        const a = 'neural network learns representations gradient training optimization methods';
        const b = 'neural network learns representations gradient training optimization approaches';
        const result = validateSynthesisPair({ content: a, specificity: 5 }, { content: b, specificity: 5 }, 0.5);
        if (!result.valid) expect(result.reason).toMatch(/\d+%/);
    });

    it('accepts nodes with sufficiently different vocabularies', () => {
        const nodeA = 'machine learning algorithms optimize neural weights training batch validation convergence';
        const nodeB = 'biological neurons fire action potentials through electrochemical gradients synaptic cleft';
        const result = validateSynthesisPair({ content: nodeA, specificity: 4 }, { content: nodeB, specificity: 4 }, 0.4);
        expect(result.valid).toBe(true);
    });
});

describe('validateSynthesisPair — similarity ceiling gate', () => {
    it('rejects when resonance exceeds 0.92', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 5 }, { content: GOOD_B, specificity: 4 }, 0.93);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('Similarity too high');
        expect(result.reason).toContain('0.930');
    });

    it('rejects at resonance of 1.0 (identical embedding)', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 5 }, { content: GOOD_B, specificity: 4 }, 1.0);
        expect(result.valid).toBe(false);
    });
});

describe('validateSynthesisPair — minimum vocabulary gate', () => {
    it('rejects node with no words longer than 3 chars', () => {
        // all words <= 3 chars
        const sparse = 'the cat sat on a mat';
        const result = validateSynthesisPair({ content: sparse, specificity: 5 }, { content: GOOD_B, specificity: 4 }, 0.5);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('vocabulary');
    });

    it('rejects when both nodes have sparse vocabulary', () => {
        const result = validateSynthesisPair(
            { content: 'too short', specificity: 5 },
            { content: 'also short', specificity: 5 },
            0.5,
        );
        expect(result.valid).toBe(false);
    });
});

describe('validateSynthesisPair — average specificity gate', () => {
    it('rejects when both nodes have zero specificity', () => {
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 0 }, { content: GOOD_B, specificity: 0 }, 0.5);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('specificity');
    });

    it('rejects when average specificity is below threshold', () => {
        // avg = (1 + 1) / 2 = 1.0 < 1.5
        const result = validateSynthesisPair({ content: GOOD_A, specificity: 1 }, { content: GOOD_B, specificity: 1 }, 0.5);
        expect(result.valid).toBe(false);
    });

    it('defaults missing specificity to 0', () => {
        const result = validateSynthesisPair({ content: GOOD_A }, { content: GOOD_B }, 0.5);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('specificity');
    });
});
