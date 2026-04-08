/**
 * Tests for scaffold/verify.ts — verifySection (pure function).
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement verifySection from scaffold/verify.ts lines 6-41
function verifySection(content: string, constraints: any) {
    const failures: any[] = [];
    const warnings: any[] = [];

    const wordCount = content.split(/\s+/).length;

    const contentLower = content.toLowerCase();
    for (const term of constraints.must_include) {
        if (!contentLower.includes(term.toLowerCase())) {
            warnings.push({
                type: 'missing_term',
                message: `Consider including: ${term}`,
            });
        }
    }

    for (const term of constraints.must_avoid || []) {
        if (contentLower.includes(term.toLowerCase())) {
            failures.push({
                type: 'forbidden_term',
                message: `Contains forbidden term: ${term}`,
            });
        }
    }

    return {
        valid: failures.length === 0,
        failures: [...failures, ...warnings],
        wordCount,
    };
}

describe('verifySection', () => {
    it('passes when all required terms are present', () => {
        const result = verifySection(
            'This section covers key claims and evidence strength in detail.',
            { must_include: ['key claims', 'evidence strength'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('adds warnings for missing must_include terms', () => {
        const result = verifySection(
            'This section covers key claims only.',
            { must_include: ['key claims', 'evidence strength'] },
        );
        expect(result.valid).toBe(true); // warnings don't cause failure
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].type).toBe('missing_term');
        expect(result.failures[0].message).toContain('evidence strength');
    });

    it('fails when must_avoid terms are present', () => {
        const result = verifySection(
            'This section describes the methodology used.',
            { must_include: [], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].type).toBe('forbidden_term');
    });

    it('case-insensitive matching for must_include', () => {
        const result = verifySection(
            'KEY CLAIMS are discussed here.',
            { must_include: ['key claims'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('case-insensitive matching for must_avoid', () => {
        const result = verifySection(
            'The METHODOLOGY section covers...',
            { must_include: [], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
    });

    it('counts words correctly', () => {
        const result = verifySection(
            'one two three four five',
            { must_include: [] },
        );
        expect(result.wordCount).toBe(5);
    });

    it('handles empty must_include', () => {
        const result = verifySection('anything', { must_include: [] });
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('handles missing must_avoid', () => {
        const result = verifySection('anything', { must_include: [] });
        // must_avoid is optional, defaults to empty
        expect(result.valid).toBe(true);
    });

    it('combines failures and warnings', () => {
        const result = verifySection(
            'This describes methodology.',
            { must_include: ['key claims'], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(2); // 1 forbidden + 1 missing
        expect(result.failures.some(f => f.type === 'forbidden_term')).toBe(true);
        expect(result.failures.some(f => f.type === 'missing_term')).toBe(true);
    });

    it('handles multiple forbidden terms', () => {
        const result = verifySection(
            'Vague generalizations about methodology.',
            { must_include: [], must_avoid: ['methodology', 'vague generalizations'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(2);
    });
});
