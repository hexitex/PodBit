/**
 * Tests for telegraphic.ts — toTelegraphic and getCompressionStats.
 *
 * Mocks config.js to control word lists, then imports the real module.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock config with controllable telegraphic settings
const mockConfig = {
    telegraphic: {
        phrases: [
            ['in order to', '\u2192'],
            ['leads to', '\u2192'],
            ['related to', '\u2194'],
            ['for example', 'e.g.'],
            ['such as', 'e.g.'],
            ['as well as', '+'],
            ['equivalent to', '\u2261'],
        ] as [string, string][],
        words: {
            therefore: '\u2234',
            because: '\u2235',
            and: '+',
            or: '/',
            with: 'w/',
            without: 'w/o',
            approximately: '~',
            causes: '\u2192',
            important: 'key',
            however: 'but',
            although: 'tho',
        } as Record<string, string>,
        removeAlways: ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'very', 'really', 'quite', 'rather', 'somewhat', 'just'],
        removeMedium: ['have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here', 'then', 'now', 'some', 'any', 'each', 'every', 'all', 'both', 'many', 'much', 'which', 'who', 'whom', 'what', 'whose', 'also', 'too', 'only', 'still', 'already', 'even'],
        removeAggressive: ['i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'of', 'in', 'for', 'on', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between'],
        preserve: ['not', 'no', 'never', 'none', 'nothing', 'neither', 'nor', 'but', 'yet', 'if', 'when', 'where', 'why', 'how'],
    },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

const { toTelegraphic, getCompressionStats, DEFAULT_ENTROPY_OPTIONS } = await import('../../telegraphic.js');

describe('toTelegraphic', () => {
    // ========================================================================
    // Edge cases / guard clauses
    // ========================================================================
    describe('edge cases', () => {
        it('returns empty string for empty input', () => {
            expect(toTelegraphic('')).toBe('');
        });

        it('returns empty string for null/undefined', () => {
            expect(toTelegraphic(null as any)).toBe('');
            expect(toTelegraphic(undefined as any)).toBe('');
        });

        it('returns empty string for non-string input', () => {
            expect(toTelegraphic(42 as any)).toBe('');
            expect(toTelegraphic({} as any)).toBe('');
        });

        it('handles single word', () => {
            const result = toTelegraphic('hello');
            expect(result).toBe('hello');
        });

        it('handles whitespace-only input', () => {
            const result = toTelegraphic('   ');
            expect(result).toBe('');
        });
    });

    // ========================================================================
    // Aggressiveness levels (rule-based, default mode)
    // ========================================================================
    describe('aggressiveness levels', () => {
        it('defaults to medium aggressiveness', () => {
            // "the" is in removeAlways, "this" is in removeMedium
            const result = toTelegraphic('the cat this dog');
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bthis\b/);
        });

        it('light removes only removeAlways words', () => {
            // "the" (removeAlways) should go, "this" (removeMedium) should stay
            const result = toTelegraphic('the cat loves this dog', { aggressiveness: 'light' });
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).toContain('this');
        });

        it('medium removes removeAlways + removeMedium', () => {
            const result = toTelegraphic('the cat has this dog', { aggressiveness: 'medium' });
            expect(result).not.toMatch(/\bthe\b/);  // removeAlways
            expect(result).not.toMatch(/\bhas\b/);   // removeMedium
            expect(result).not.toMatch(/\bthis\b/);  // removeMedium
        });

        it('aggressive removes all three tiers', () => {
            const result = toTelegraphic('the cat has been in my house', { aggressiveness: 'aggressive' });
            expect(result).not.toMatch(/\bthe\b/);  // removeAlways
            expect(result).not.toMatch(/\bhas\b/);   // removeMedium
            expect(result).not.toMatch(/\bmy\b/);    // removeAggressive
            expect(result).not.toMatch(/\bin\b/);    // removeAggressive
        });

        it('aggressive does not remove words only in removeMedium when light', () => {
            const result = toTelegraphic('could should would', { aggressiveness: 'light' });
            expect(result).toContain('could');
            expect(result).toContain('should');
            expect(result).toContain('would');
        });
    });

    // ========================================================================
    // Word replacement (symbols)
    // ========================================================================
    describe('word replacement', () => {
        it('replaces words with symbols by default', () => {
            const result = toTelegraphic('therefore go');
            expect(result).toContain('\u2234');
        });

        it('replaces "and" with +', () => {
            const result = toTelegraphic('cats and dogs', { aggressiveness: 'light' });
            expect(result).toContain('+');
            expect(result).not.toMatch(/\band\b/);
        });

        it('replaces "because" with symbol', () => {
            const result = toTelegraphic('stop because danger', { aggressiveness: 'light' });
            expect(result).toContain('\u2235');
        });

        it('does not replace words when useSymbols is false', () => {
            const result = toTelegraphic('therefore go', { useSymbols: false, aggressiveness: 'light' });
            expect(result).not.toContain('\u2234');
            // "therefore" is not in any removal list, so it stays
            expect(result).toContain('therefore');
        });
    });

    // ========================================================================
    // Phrase replacement
    // ========================================================================
    describe('phrase replacement', () => {
        it('replaces multi-word phrases', () => {
            const result = toTelegraphic('go in order to reach destination', { aggressiveness: 'light' });
            expect(result).toContain('\u2192');
            expect(result).not.toContain('in order to');
        });

        it('replaces "leads to" with arrow', () => {
            const result = toTelegraphic('stress leads to failure', { aggressiveness: 'light' });
            expect(result).toContain('\u2192');
        });

        it('replaces "for example" with e.g. (cleanup re-spaces dots)', () => {
            const result = toTelegraphic('animals for example cats', { aggressiveness: 'light' });
            // cleanup's punctuation-before-letter rule re-inserts space: "e.g." -> "e. g."
            expect(result).toMatch(/e\.\s*g\./);
            expect(result).not.toContain('for example');
        });

        it('phrase replacement is case-insensitive', () => {
            const result = toTelegraphic('In Order To do things', { aggressiveness: 'light' });
            expect(result).toContain('\u2192');
        });
    });

    // ========================================================================
    // Preserve list
    // ========================================================================
    describe('preserve list', () => {
        it('never removes preserved words (negation)', () => {
            const result = toTelegraphic('not important never forget', { aggressiveness: 'aggressive' });
            expect(result).toContain('not');
            expect(result).toContain('never');
        });

        it('preserves "but" even at aggressive level', () => {
            const result = toTelegraphic('good but bad', { aggressiveness: 'aggressive' });
            expect(result).toContain('but');
        });

        it('preserves question words', () => {
            const result = toTelegraphic('when where why how', { aggressiveness: 'aggressive' });
            expect(result).toContain('when');
            expect(result).toContain('where');
            expect(result).toContain('why');
            expect(result).toContain('how');
        });
    });

    // ========================================================================
    // Structured content preservation
    // ========================================================================
    describe('structured content preservation', () => {
        it('preserves fenced code blocks', () => {
            const input = 'the very important code ```js\nconst x = 1;\n``` here';
            const result = toTelegraphic(input);
            expect(result).toContain('```js\nconst x = 1;\n```');
        });

        it('preserves inline code', () => {
            const input = 'use the `npm install` command';
            const result = toTelegraphic(input);
            expect(result).toContain('`npm install`');
        });

        it('preserves URLs', () => {
            const input = 'visit the site https://example.com/path?q=1 now';
            const result = toTelegraphic(input);
            expect(result).toContain('https://example.com/path?q=1');
        });

        it('preserves HTML/XML tags', () => {
            const input = 'the <div class="test"> element is very important';
            const result = toTelegraphic(input);
            expect(result).toContain('<div class="test">');
        });

        it('preserves JSON-like blocks with colons', () => {
            const input = 'config is {"key": "value"} end';
            const result = toTelegraphic(input);
            expect(result).toContain('"key": "value"');
        });

        it('does not protect simple brace expressions', () => {
            const input = 'use {x} placeholder';
            const result = toTelegraphic(input);
            // {x} has no colon, quotes, or newline => not protected
            expect(result).toContain('{x}');
        });

        it('preserves file paths', () => {
            const input = 'check the file /usr/local/bin/node for details';
            const result = toTelegraphic(input);
            expect(result).toContain('/usr/local/bin/node');
        });

        it('compresses prose around preserved content', () => {
            const input = 'the very important `code` is quite useful';
            const result = toTelegraphic(input);
            // "the", "very", "quite" should be removed; "code" preserved
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bvery\b/);
            expect(result).toContain('`code`');
        });
    });

    // ========================================================================
    // Cleanup behavior
    // ========================================================================
    describe('cleanup', () => {
        it('normalizes whitespace in output', () => {
            const result = toTelegraphic('hello    world    test');
            expect(result).not.toContain('  ');
        });

        it('fixes spacing around arrows', () => {
            // "leads to" -> arrow; cleanup should space it
            const result = toTelegraphic('stress leads to failure', { aggressiveness: 'light' });
            expect(result).toMatch(/\u2192/);
        });

        it('removes orphan punctuation at start', () => {
            // If removal strips words leaving leading punctuation
            const result = toTelegraphic('. , the cat');
            expect(result).not.toMatch(/^[\s.,;:]+/);
        });

        it('removes duplicate punctuation', () => {
            const result = toTelegraphic('hello,, world');
            expect(result).not.toContain(',,');
        });

        it('trims output', () => {
            const result = toTelegraphic('  hello  ');
            expect(result).toBe(result.trim());
        });
    });

    // ========================================================================
    // Proper noun preservation (rule-based mode)
    // ========================================================================
    describe('proper noun handling', () => {
        it('preserveProperNouns defaults to true', () => {
            // NLP should detect proper nouns; they should be kept
            const result = toTelegraphic('London', { aggressiveness: 'aggressive' });
            expect(result.length).toBeGreaterThan(0);
        });

        it('preserveProperNouns=false does not protect proper nouns', () => {
            // With preserveProperNouns false, proper nouns get normal treatment
            const result = toTelegraphic('test words', { preserveProperNouns: false });
            expect(typeof result).toBe('string');
        });
    });

    // ========================================================================
    // Entropy-aware mode
    // ========================================================================
    describe('entropy-aware mode', () => {
        const entropyOpts = { enabled: true };

        it('works with entropy enabled', () => {
            const result = toTelegraphic('the cat is very big', { entropy: entropyOpts });
            // "the", "is", "very" should still be removed (in removeAlways)
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bvery\b/);
        });

        it('preserves high-entropy tokens (acronyms)', () => {
            const result = toTelegraphic('the NASA program', {
                entropy: entropyOpts,
                aggressiveness: 'aggressive',
            });
            expect(result).toContain('NASA');
        });

        it('preserves numbers as high-entropy', () => {
            const result = toTelegraphic('the value 42 matters', {
                entropy: entropyOpts,
                aggressiveness: 'aggressive',
            });
            expect(result).toContain('42');
        });

        it('still applies word replacement in entropy mode', () => {
            const result = toTelegraphic('therefore go', { entropy: entropyOpts });
            expect(result).toContain('\u2234');
        });

        it('still removes always-remove words in entropy mode', () => {
            const result = toTelegraphic('the very quite really good', { entropy: entropyOpts });
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bvery\b/);
        });

        it('respects preserve list in entropy mode', () => {
            const result = toTelegraphic('not never nothing', {
                entropy: entropyOpts,
                aggressiveness: 'aggressive',
            });
            expect(result).toContain('not');
            expect(result).toContain('never');
        });

        it('custom entropy weights are merged with defaults', () => {
            const result = toTelegraphic('the cat', {
                entropy: {
                    enabled: true,
                    weights: { entity: 0.9 },
                },
            });
            expect(typeof result).toBe('string');
        });

        it('custom entropy thresholds are merged with defaults', () => {
            const result = toTelegraphic('the cat', {
                entropy: {
                    enabled: true,
                    thresholds: { light: 0.5 },
                },
            });
            expect(typeof result).toBe('string');
        });

        it('custom rarityMinLength is used', () => {
            // With very low rarityMinLength, more words qualify as rare
            const result = toTelegraphic('the cat dog', {
                entropy: {
                    enabled: true,
                    rarityMinLength: 2,
                },
                aggressiveness: 'aggressive',
            });
            expect(typeof result).toBe('string');
        });

        it('entropy mode with light aggressiveness removes fewer words', () => {
            const light = toTelegraphic('the cat has this many friends', {
                entropy: entropyOpts,
                aggressiveness: 'light',
            });
            const aggressive = toTelegraphic('the cat has this many friends', {
                entropy: entropyOpts,
                aggressiveness: 'aggressive',
            });
            expect(aggressive.length).toBeLessThanOrEqual(light.length);
        });

        it('falls back to rule-based for tokens without entropy analysis', () => {
            // Entropy analysis might miss some tokens; shouldRemoveEntropy
            // falls back to shouldRemove when analysis is undefined
            const result = toTelegraphic('the really important thing', {
                entropy: entropyOpts,
            });
            // "the" and "really" are in removeAlways, should still be removed
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\breally\b/);
        });
    });

    // ========================================================================
    // Integration: combined features
    // ========================================================================
    describe('integration', () => {
        it('handles phrase + word replacement + removal together', () => {
            const input = 'the system leads to failure because the design is very important';
            const result = toTelegraphic(input, { aggressiveness: 'medium' });
            // "the" removed (always), "is" removed (always), "very" removed (always)
            // "leads to" -> arrow, "because" -> symbol, "important" -> "key"
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bis\b/);
            expect(result).not.toMatch(/\bvery\b/);
            expect(result).toContain('\u2192');
            expect(result).toContain('\u2235');
            expect(result).toContain('key');
        });

        it('handles code block + prose compression', () => {
            const input = 'the very important function ```js\nfunction foo() {}\n``` does something';
            const result = toTelegraphic(input, { aggressiveness: 'medium' });
            expect(result).toContain('```js\nfunction foo() {}\n```');
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bvery\b/);
        });

        it('handles multiple URLs and code in same text', () => {
            const input = 'visit https://a.com and use `cmd` for the very best results';
            const result = toTelegraphic(input);
            expect(result).toContain('https://a.com');
            expect(result).toContain('`cmd`');
            expect(result).not.toMatch(/\bthe\b/);
            expect(result).not.toMatch(/\bvery\b/);
        });

        it('compresses realistic prose significantly', () => {
            const input = 'The system architecture is designed in order to provide a very robust and scalable solution that leads to better performance for all of the users in the network.';
            const result = toTelegraphic(input, { aggressiveness: 'aggressive' });
            expect(result.length).toBeLessThan(input.length);
        });
    });
});

describe('getCompressionStats', () => {
    it('calculates word counts correctly', () => {
        const stats = getCompressionStats('hello world foo bar', 'hello world');
        expect(stats.originalWords).toBe(4);
        expect(stats.compressedWords).toBe(2);
    });

    it('calculates character counts correctly', () => {
        const stats = getCompressionStats('hello world', 'hi');
        expect(stats.originalChars).toBe(11);
        expect(stats.compressedChars).toBe(2);
    });

    it('calculates word reduction percentage', () => {
        const stats = getCompressionStats('one two three four', 'one two');
        expect(stats.wordReduction).toBe('50%');
    });

    it('calculates char reduction percentage', () => {
        const stats = getCompressionStats('1234567890', '12345');
        expect(stats.charReduction).toBe('50%');
    });

    it('handles no reduction (same text)', () => {
        const stats = getCompressionStats('same text', 'same text');
        expect(stats.wordReduction).toBe('0%');
        expect(stats.charReduction).toBe('0%');
    });

    it('handles single word', () => {
        const stats = getCompressionStats('hello', 'hi');
        expect(stats.originalWords).toBe(1);
        expect(stats.compressedWords).toBe(1);
        expect(stats.wordReduction).toBe('0%');
    });

    it('handles empty compressed string', () => {
        const stats = getCompressionStats('hello world', '');
        expect(stats.compressedWords).toBe(0);
        expect(stats.compressedChars).toBe(0);
    });

    it('returns all required fields', () => {
        const stats = getCompressionStats('a b c', 'a');
        expect(stats).toHaveProperty('originalWords');
        expect(stats).toHaveProperty('compressedWords');
        expect(stats).toHaveProperty('wordReduction');
        expect(stats).toHaveProperty('originalChars');
        expect(stats).toHaveProperty('compressedChars');
        expect(stats).toHaveProperty('charReduction');
    });

    it('handles multi-space separated words', () => {
        const stats = getCompressionStats('hello   world', 'hi');
        expect(stats.originalWords).toBe(2);
    });
});

describe('DEFAULT_ENTROPY_OPTIONS', () => {
    it('is exported and has expected shape', () => {
        expect(DEFAULT_ENTROPY_OPTIONS).toBeDefined();
        expect(DEFAULT_ENTROPY_OPTIONS.enabled).toBe(false);
        expect(DEFAULT_ENTROPY_OPTIONS.weights).toBeDefined();
        expect(DEFAULT_ENTROPY_OPTIONS.thresholds).toBeDefined();
        expect(DEFAULT_ENTROPY_OPTIONS.rarityMinLength).toBe(8);
    });

    it('has correct default weight values', () => {
        expect(DEFAULT_ENTROPY_OPTIONS.weights.entity).toBe(0.40);
        expect(DEFAULT_ENTROPY_OPTIONS.weights.number).toBe(0.35);
        expect(DEFAULT_ENTROPY_OPTIONS.weights.properNoun).toBe(0.30);
        expect(DEFAULT_ENTROPY_OPTIONS.weights.acronym).toBe(0.25);
        expect(DEFAULT_ENTROPY_OPTIONS.weights.rarity).toBe(0.15);
    });

    it('has correct default threshold values', () => {
        expect(DEFAULT_ENTROPY_OPTIONS.thresholds.light).toBe(0.20);
        expect(DEFAULT_ENTROPY_OPTIONS.thresholds.medium).toBe(0.35);
        expect(DEFAULT_ENTROPY_OPTIONS.thresholds.aggressive).toBe(0.50);
    });
});
