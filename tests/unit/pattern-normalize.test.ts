/**
 * Tests for core/abstract-patterns.ts — pattern name normalization (re-implemented),
 * and isTransientDomain / governance utilities from core/governance.ts.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement name normalization from createOrGetPattern in core/abstract-patterns.ts line 20
function normalizePatternName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Re-implement isTransientDomain from core/governance.ts line 42-44
function isTransientDomain(domain: string | null, transientDomains: string[]): boolean {
    return domain !== null && transientDomains.includes(domain);
}

describe('normalizePatternName', () => {
    it('lowercases the input', () => {
        expect(normalizePatternName('STRUCTURE')).toBe('structure');
    });

    it('replaces spaces with hyphens', () => {
        expect(normalizePatternName('structure vs process')).toBe('structure-vs-process');
    });

    it('handles multiple spaces (collapsed to single hyphen by \\s+)', () => {
        // \s+ matches one or more spaces as a single group → replaced with one '-'
        expect(normalizePatternName('multiple   spaces   here')).toBe('multiple-spaces-here');
    });

    it('removes non-alphanumeric characters (except hyphens)', () => {
        expect(normalizePatternName('pattern!@#$%')).toBe('pattern');
        expect(normalizePatternName('hello.world')).toBe('helloworld');
    });

    it('preserves hyphens', () => {
        expect(normalizePatternName('already-hyphenated')).toBe('already-hyphenated');
    });

    it('preserves numbers', () => {
        expect(normalizePatternName('pattern-42')).toBe('pattern-42');
    });

    it('handles empty string', () => {
        expect(normalizePatternName('')).toBe('');
    });

    it('handles string that becomes empty after normalization', () => {
        expect(normalizePatternName('!@#$%')).toBe('');
    });

    it('converts spaces to hyphens then removes special chars', () => {
        expect(normalizePatternName('structure-vs-process gap')).toBe('structure-vs-process-gap');
    });

    it('handles real pattern name examples', () => {
        expect(normalizePatternName('Structure vs Process Gap')).toBe('structure-vs-process-gap');
        expect(normalizePatternName('cross-domain tension')).toBe('cross-domain-tension');
        expect(normalizePatternName('Emergence from Constraints')).toBe('emergence-from-constraints');
    });
});

describe('isTransientDomain', () => {
    const transientDomains = ['visitor-1', 'visitor-2', 'temp-research'];

    it('returns true when domain is in transient list', () => {
        expect(isTransientDomain('visitor-1', transientDomains)).toBe(true);
        expect(isTransientDomain('temp-research', transientDomains)).toBe(true);
    });

    it('returns false when domain is not in transient list', () => {
        expect(isTransientDomain('main-domain', transientDomains)).toBe(false);
        expect(isTransientDomain('permanent', transientDomains)).toBe(false);
    });

    it('returns false when domain is null', () => {
        expect(isTransientDomain(null, transientDomains)).toBe(false);
    });

    it('returns false when transient list is empty', () => {
        expect(isTransientDomain('visitor-1', [])).toBe(false);
    });

    it('is case-sensitive', () => {
        expect(isTransientDomain('VISITOR-1', transientDomains)).toBe(false);
        expect(isTransientDomain('Visitor-1', transientDomains)).toBe(false);
    });

    it('returns false for empty string domain', () => {
        expect(isTransientDomain('', transientDomains)).toBe(false);
    });

    it('returns true for exact match only', () => {
        expect(isTransientDomain('visitor', transientDomains)).toBe(false); // prefix, not exact
        expect(isTransientDomain('visitor-1-extra', transientDomains)).toBe(false); // suffix
    });
});
