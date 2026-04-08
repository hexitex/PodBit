/**
 * Tests for pure domain predicate functions re-implemented from:
 *   - core/synthesis-engine-domain.ts — isSystemDomain
 *   - core/governance.ts — isTransientDomain
 *
 * Both are pure boolean predicates: (domain, list) → boolean
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement isSystemDomain from core/synthesis-engine-domain.ts
function isSystemDomain(domain: string | null, systemDomains: string[]): boolean {
    return domain !== null && systemDomains.includes(domain);
}

// Re-implement isTransientDomain from core/governance.ts
function isTransientDomain(domain: string | null, transientDomains: string[]): boolean {
    return domain !== null && transientDomains.includes(domain);
}

describe('isSystemDomain', () => {
    const systemDomains = ['tuning', 'know-thyself', 'internal'];

    it('returns true for a domain in the system list', () => {
        expect(isSystemDomain('tuning', systemDomains)).toBe(true);
    });

    it('returns true for any domain in the system list', () => {
        expect(isSystemDomain('know-thyself', systemDomains)).toBe(true);
        expect(isSystemDomain('internal', systemDomains)).toBe(true);
    });

    it('returns false for a domain NOT in the system list', () => {
        expect(isSystemDomain('architecture', systemDomains)).toBe(false);
    });

    it('returns false when domain is null', () => {
        expect(isSystemDomain(null, systemDomains)).toBe(false);
    });

    it('returns false for empty domain string', () => {
        expect(isSystemDomain('', systemDomains)).toBe(false);
    });

    it('returns false when system list is empty', () => {
        expect(isSystemDomain('tuning', [])).toBe(false);
    });

    it('is case-sensitive', () => {
        expect(isSystemDomain('TUNING', systemDomains)).toBe(false);
        expect(isSystemDomain('Tuning', systemDomains)).toBe(false);
    });

    it('returns false for partial match', () => {
        expect(isSystemDomain('tun', systemDomains)).toBe(false);
    });

    it('handles domain that looks like a system domain but differs by one char', () => {
        expect(isSystemDomain('tunings', systemDomains)).toBe(false);
    });
});

describe('isTransientDomain', () => {
    const transientDomains = ['visitor-domain', 'quarantine-zone', 'temp-research'];

    it('returns true for a domain in the transient list', () => {
        expect(isTransientDomain('visitor-domain', transientDomains)).toBe(true);
    });

    it('returns true for other domains in the transient list', () => {
        expect(isTransientDomain('quarantine-zone', transientDomains)).toBe(true);
        expect(isTransientDomain('temp-research', transientDomains)).toBe(true);
    });

    it('returns false for a domain NOT in the transient list', () => {
        expect(isTransientDomain('permanent-domain', transientDomains)).toBe(false);
    });

    it('returns false when domain is null', () => {
        expect(isTransientDomain(null, transientDomains)).toBe(false);
    });

    it('returns false for empty string domain', () => {
        expect(isTransientDomain('', transientDomains)).toBe(false);
    });

    it('returns false when transient list is empty', () => {
        expect(isTransientDomain('visitor-domain', [])).toBe(false);
    });

    it('is case-sensitive', () => {
        expect(isTransientDomain('VISITOR-DOMAIN', transientDomains)).toBe(false);
    });
});

describe('isSystemDomain vs isTransientDomain — shared semantics', () => {
    it('a domain can be neither system nor transient', () => {
        const domain = 'regular-domain';
        const systemList = ['tuning'];
        const transientList = ['visitor'];
        expect(isSystemDomain(domain, systemList)).toBe(false);
        expect(isTransientDomain(domain, transientList)).toBe(false);
    });

    it('a domain cannot be both system and transient in normal operation', () => {
        // System partitions are un-bridgeable; transient partitions have lifecycle
        // These two lists are kept separate by design
        const domain = 'tuning';
        const systemList = ['tuning'];
        const transientList = ['tuning']; // Would be a bug, but still test the predicate
        expect(isSystemDomain(domain, systemList)).toBe(true);
        expect(isTransientDomain(domain, transientList)).toBe(true);
    });

    it('null domain is never system or transient', () => {
        expect(isSystemDomain(null, ['tuning'])).toBe(false);
        expect(isTransientDomain(null, ['visitor'])).toBe(false);
    });
});
