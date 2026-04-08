/**
 * Tests for scaffold/assemble.ts — assemble function.
 * Builds a document from outline + section content; markdown or plain format.
 * Pure function with no external dependencies — direct import.
 */
import { describe, it, expect } from '@jest/globals';
import { assemble } from '../../scaffold/assemble.js';

describe('assemble', () => {
    const outline = {
        title: 'Research Brief',
        sections: [
            { id: 'intro', title: 'Introduction' },
            { id: 'methods', title: 'Methods' },
            { id: 'results', title: 'Results' },
            { id: 'conclusion', title: 'Conclusion' },
        ],
    };

    it('assembles sections in outline order (markdown)', () => {
        const sections = {
            intro: 'This is the introduction.',
            methods: 'We used method X.',
            results: 'Results were positive.',
            conclusion: 'In conclusion, it works.',
        };
        const doc = assemble(sections, outline);
        expect(doc).toContain('# Research Brief');
        expect(doc).toContain('## Introduction');
        expect(doc).toContain('This is the introduction.');
        expect(doc).toContain('## Methods');
        expect(doc).toContain('## Results');
        expect(doc).toContain('## Conclusion');
    });

    it('uses markdown headers by default', () => {
        const doc = assemble({ intro: 'text' }, outline);
        expect(doc).toContain('# Research Brief');
        expect(doc).toContain('## Introduction');
    });

    it('uses plain text format when specified', () => {
        const doc = assemble({ intro: 'text' }, outline, { format: 'plain' });
        expect(doc).not.toContain('#');
        expect(doc).toContain('Research Brief');
        expect(doc).toContain('Introduction');
        expect(doc).toContain('text');
    });

    it('skips sections without content', () => {
        const sections = { intro: 'Only intro here.' };
        const doc = assemble(sections, outline);
        expect(doc).toContain('## Introduction');
        expect(doc).not.toContain('## Methods');
        expect(doc).not.toContain('## Results');
        expect(doc).not.toContain('## Conclusion');
    });

    it('preserves section order from outline, not sections object', () => {
        const sections = {
            conclusion: 'End.',
            intro: 'Start.',
        };
        const doc = assemble(sections, outline);
        const introPos = doc.indexOf('Introduction');
        const conclusionPos = doc.indexOf('Conclusion');
        expect(introPos).toBeLessThan(conclusionPos);
    });

    it('handles outline without title', () => {
        const noTitleOutline = {
            sections: [{ id: 'body', title: 'Body' }],
        };
        const doc = assemble({ body: 'Content here.' }, noTitleOutline);
        expect(doc).toContain('## Body');
        expect(doc).toContain('Content here.');
        // Should not start with "# " since no title
        expect(doc.startsWith('## Body')).toBe(true);
    });

    it('handles empty sections object', () => {
        const doc = assemble({}, outline);
        expect(doc).toContain('# Research Brief');
        expect(doc).not.toContain('## Introduction');
    });

    it('handles empty outline sections array', () => {
        const doc = assemble({ intro: 'text' }, { title: 'Title', sections: [] });
        expect(doc).toBe('# Title\n\n');
    });

    it('handles multiline section content', () => {
        const sections = {
            intro: 'Line 1.\nLine 2.\nLine 3.',
        };
        const doc = assemble(sections, outline);
        expect(doc).toContain('Line 1.\nLine 2.\nLine 3.');
    });

    it('adds double newlines between sections', () => {
        const sections = {
            intro: 'Intro text.',
            methods: 'Methods text.',
        };
        const doc = assemble(sections, outline);
        expect(doc).toContain('Intro text.\n\n## Methods');
    });

    it('skips falsy section content (empty string)', () => {
        const sections = { intro: '', methods: 'Has content' };
        const doc = assemble(sections, outline);
        expect(doc).not.toContain('## Introduction');
        expect(doc).toContain('## Methods');
    });

    it('skips null section content', () => {
        const sections = { intro: null, methods: 'Has content' };
        const doc = assemble(sections, outline);
        expect(doc).not.toContain('## Introduction');
        expect(doc).toContain('## Methods');
    });

    it('plain format without title omits header markers', () => {
        const noTitleOutline = {
            sections: [{ id: 'body', title: 'Body' }],
        };
        const doc = assemble({ body: 'Plain text.' }, noTitleOutline, { format: 'plain' });
        expect(doc).not.toContain('#');
        expect(doc).toContain('Body');
        expect(doc).toContain('Plain text.');
    });

    it('returns empty string for no title and no matching sections', () => {
        const doc = assemble({}, { sections: [] });
        expect(doc).toBe('');
    });

    it('handles sections with undefined content (from outline mismatch)', () => {
        const doc = assemble(
            { nonexistent: 'Content for section not in outline' },
            { title: 'Doc', sections: [{ id: 'real', title: 'Real Section' }] }
        );
        // 'nonexistent' is not in outline, 'real' has no content -> only title
        expect(doc).toBe('# Doc\n\n');
    });
});
