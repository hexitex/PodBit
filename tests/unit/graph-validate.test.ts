/**
 * Tests for handlers/graph/validate.ts — validateProposal gate.
 * Covers word count, generic filler detection, duplicate detection, junk filter,
 * and specificity checks for synthesis/breakthrough node types.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockMeasureSpecificity = jest.fn<(...args: any[]) => number>();

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    measureSpecificity: mockMeasureSpecificity,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        nodeValidation: {
            genericStartPatterns: ['^(this is|it is|there is)\\b'],
            genericFillerPatterns: ['\\b(very important|crucial|essential)\\b'],
            genericRatioThreshold: 0.3,
            genericMinWordCount: 20,
        },
        magicNumbers: { junkFilterLimit: 200 },
    },
}));

const { validateProposal } = await import('../../handlers/graph/validate.js');

describe('validateProposal', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockQuery.mockResolvedValue([]);
    });

    // -----------------------------------------------------------------------
    // Word count bounds
    // -----------------------------------------------------------------------
    describe('word count validation', () => {
        it('rejects content shorter than 5 words', async () => {
            const result = await validateProposal('too few words', 'test-domain', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/too short/i);
            expect(result.scores!.wordCount).toBe(3);
        });

        it('rejects content longer than 200 words', async () => {
            const longContent = Array(201).fill('word').join(' ');
            const result = await validateProposal(longContent, 'test-domain', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/too long/i);
        });

        it('accepts content within word count bounds', async () => {
            const content = 'This specific mechanism controls the reaction rate in organic chemistry';
            const result = await validateProposal(content, null, 'seed');
            expect(result.accepted).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Generic/filler detection
    // -----------------------------------------------------------------------
    describe('generic content detection', () => {
        it('rejects short content with high generic ratio', async () => {
            // 8 words, starts with "this is" and has "very important" — high ratio
            const content = 'this is very important and crucial for understanding';
            const result = await validateProposal(content, null, 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/generic/i);
            expect(result.scores!.genericRatio).toBeGreaterThan(0);
        });

        it('accepts longer content even with some generic words', async () => {
            // Over genericMinWordCount (20), so the check is bypassed
            const words = Array(25).fill('specific').join(' ');
            const content = 'this is ' + words;
            const result = await validateProposal(content, null, 'seed');
            expect(result.accepted).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Duplicate detection (domain-scoped)
    // -----------------------------------------------------------------------
    describe('duplicate detection', () => {
        it('rejects exact duplicates in the same domain', async () => {
            const content = 'Neural networks use backpropagation for gradient descent optimization';
            // First query = domain nodes, second query = junk nodes
            mockQuery
                .mockResolvedValueOnce([{ id: 'node-1', content }])
                .mockResolvedValueOnce([]);

            const result = await validateProposal(content, 'ml-domain', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/exact duplicate/i);
            expect(result.scores!.duplicateOf).toBe('node-1');
        });

        it('rejects high word-overlap duplicates (>85%)', async () => {
            const existing = 'Neural networks use backpropagation for gradient descent optimization today';
            const proposed = 'Neural networks use backpropagation for gradient descent optimization always';
            mockQuery
                .mockResolvedValueOnce([{ id: 'node-2', content: existing }])
                .mockResolvedValueOnce([]);

            const result = await validateProposal(proposed, 'ml-domain', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/similar/i);
            expect(result.scores!.similarTo).toBe('node-2');
        });

        it('accepts content with low overlap against existing nodes', async () => {
            mockQuery
                .mockResolvedValueOnce([{ id: 'node-3', content: 'Completely different topic about geology and plate tectonics' }])
                .mockResolvedValueOnce([]);

            const result = await validateProposal(
                'Quantum entanglement enables faster-than-classical communication protocols',
                'physics', 'seed'
            );
            expect(result.accepted).toBe(true);
        });

        it('skips duplicate check when domain is null', async () => {
            const content = 'Valid content without a domain assignment for testing purposes here';
            // Only the junk query should fire (no domain query)
            mockQuery.mockResolvedValueOnce([]);

            const result = await validateProposal(content, null, 'seed');
            expect(result.accepted).toBe(true);
            // Should have been called once (junk query only)
            expect(mockQuery).toHaveBeenCalledTimes(1);
        });
    });

    // -----------------------------------------------------------------------
    // Junk filter
    // -----------------------------------------------------------------------
    describe('junk filter', () => {
        it('rejects content matching a junked node exactly', async () => {
            const content = 'Specific claim about protein folding dynamics in extreme conditions';
            // domain query returns nothing, junk query returns exact match
            mockQuery
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ id: 'junk-1', content, domain: 'bio' }]);

            const result = await validateProposal(content, 'bio', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/junked/i);
            expect(result.scores!.matchesJunk).toBe('junk-1');
        });

        it('rejects content with >70% word overlap against junk', async () => {
            const junkContent = 'Protein folding dynamics under extreme temperature pressure conditions are fascinating';
            const proposed = 'Protein folding dynamics under extreme temperature pressure conditions are remarkable';
            mockQuery
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ id: 'junk-2', content: junkContent, domain: 'bio' }]);

            const result = await validateProposal(proposed, 'bio', 'seed');
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/similar to a junked/i);
        });

        it('accepts content dissimilar to junk nodes', async () => {
            mockQuery
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ id: 'junk-3', content: 'Totally unrelated junk about cooking recipes and ingredient lists', domain: 'bio' }]);

            const result = await validateProposal(
                'Quantum coherence persists longer than expected in biological photosynthesis systems',
                'bio', 'seed'
            );
            expect(result.accepted).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Specificity for breakthrough/synthesis
    // -----------------------------------------------------------------------
    describe('specificity checks', () => {
        it('rejects breakthroughs with specificity < 0.10', async () => {
            mockQuery.mockResolvedValue([]);
            mockMeasureSpecificity.mockReturnValue(0.05);

            const result = await validateProposal(
                'Some general insight about systems thinking and emergent properties here',
                'design', 'breakthrough'
            );
            expect(result.accepted).toBe(false);
            expect(result.reason).toMatch(/specificity/i);
            expect(result.scores!.specificity).toBe(0.05);
        });

        it('accepts breakthroughs with specificity >= 1.0', async () => {
            mockQuery.mockResolvedValue([]);
            mockMeasureSpecificity.mockReturnValue(1.5);

            const result = await validateProposal(
                'Reaction rate increases 3.7x when temperature exceeds 450K in catalytic converters',
                'chemistry', 'breakthrough'
            );
            expect(result.accepted).toBe(true);
            expect(result.scores!.specificity).toBe(1.5);
        });

        it('records specificity for synthesis without rejecting', async () => {
            mockQuery.mockResolvedValue([]);
            mockMeasureSpecificity.mockReturnValue(0.3);

            const result = await validateProposal(
                'Synthesis nodes can have lower specificity than breakthroughs for flexibility',
                'test', 'synthesis'
            );
            expect(result.accepted).toBe(true);
            expect(result.scores!.specificity).toBe(0.3);
        });

        it('skips specificity for seed nodes', async () => {
            mockQuery.mockResolvedValue([]);

            const result = await validateProposal(
                'Regular seed content does not need specificity checking at all here',
                'test', 'seed'
            );
            expect(result.accepted).toBe(true);
            expect(mockMeasureSpecificity).not.toHaveBeenCalled();
            expect(result.scores!.specificity).toBeUndefined();
        });
    });
});
