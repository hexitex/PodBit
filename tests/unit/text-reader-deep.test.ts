/**
 * Deep coverage tests for kb/readers/text-reader.ts
 * Targets: multi-heading merged label, sub-split of oversized merged sections,
 * paragraph splitting edge cases, empty file fallback, large JSON splitting.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';

const mockReadFileSync = jest.spyOn(fs, 'readFileSync');

const { textReader } = await import('../../kb/readers/text-reader.js');

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// splitByHeadings — merged label with multiple headings
// ---------------------------------------------------------------------------

describe('textReader — merged section labels', () => {
    it('joins multiple heading names with " + " when small sections merge', async () => {
        // Create sections that are individually below MIN_SECTION_SIZE (200 chars)
        // so they merge, producing a multi-heading label
        const md = [
            '## Alpha',
            'Small content A.',
            '',
            '## Beta',
            'Small content B.',
            '',
            '## Gamma',
            'Small content C.',
        ].join('\n');
        mockReadFileSync.mockReturnValue(md);

        const result = await textReader.read('/fake/file.md');

        // At least one chunk should have a joined label
        const joinedLabels = result.chunks.filter(c => c.label.includes(' + '));
        expect(joinedLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('sets mergedCount metadata when sections are merged', async () => {
        const md = [
            '## First',
            'Tiny A.',
            '',
            '## Second',
            'Tiny B.',
        ].join('\n');
        mockReadFileSync.mockReturnValue(md);

        const result = await textReader.read('/fake/file.md');

        const merged = result.chunks.find(c => c.metadata.mergedCount && c.metadata.mergedCount > 1);
        expect(merged).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// splitByHeadings — sub-split oversized merged sections
// ---------------------------------------------------------------------------

describe('textReader — sub-split of large merged sections', () => {
    it('sub-splits by paragraphs when a merged section exceeds maxChunkSize', async () => {
        // Create one heading with a massive body that exceeds maxChunkSize even after merging
        const bigBody = Array.from({ length: 50 }, (_, i) =>
            `Paragraph ${i} with sufficient length to contribute to the total size of this section content.`
        ).join('\n\n');
        const md = `## Massive Section\n${bigBody}`;
        mockReadFileSync.mockReturnValue(md);

        const result = await textReader.read('/fake/file.md', { maxChunkSize: 300 });

        // Should produce multiple chunks with "(part N)" labels
        const partChunks = result.chunks.filter(c => c.label.includes('part'));
        expect(partChunks.length).toBeGreaterThan(1);
    });

    it('sub-split chunks inherit the parent section label as prefix', async () => {
        const bigBody = Array.from({ length: 30 }, (_, i) =>
            `Paragraph ${i} padded with extra words to ensure it crosses the boundary.`
        ).join('\n\n');
        const md = `## My Big Section\n${bigBody}`;
        mockReadFileSync.mockReturnValue(md);

        const result = await textReader.read('/fake/file.md', { maxChunkSize: 200 });

        const partChunks = result.chunks.filter(c => c.label.includes('My Big Section'));
        expect(partChunks.length).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// splitByHeadings — flush accumulated on maxChunkSize boundary
// ---------------------------------------------------------------------------

describe('textReader — merge flush on maxChunkSize boundary', () => {
    it('flushes accumulated content before it exceeds maxChunkSize', async () => {
        // Two large sections that individually fit in maxChunkSize but together exceed it
        const sec1Body = 'A'.repeat(250);
        const sec2Body = 'B'.repeat(250);
        const md = `## Section One\n${sec1Body}\n\n## Section Two\n${sec2Body}`;
        mockReadFileSync.mockReturnValue(md);

        const result = await textReader.read('/fake/file.md', { maxChunkSize: 300 });

        // Should be split into separate chunks, not merged together
        expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// splitByParagraphs — multi-part splitting
// ---------------------------------------------------------------------------

describe('textReader — paragraph splitting edge cases', () => {
    it('creates multiple parts for plain text exceeding maxChunkSize', async () => {
        const content = Array.from({ length: 20 }, (_, i) =>
            `Paragraph ${i}: this is a moderately long paragraph to test splitting behavior.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(content);

        const result = await textReader.read('/fake/file.txt', { maxChunkSize: 300 });

        expect(result.chunks.length).toBeGreaterThan(1);
        // First chunk beyond the initial should have type 'section'
        const sectionChunks = result.chunks.filter(c => c.type === 'section');
        expect(sectionChunks.length).toBeGreaterThan(0);
    });

    it('assigns sequential "Part N" labels to paragraph chunks', async () => {
        const content = Array.from({ length: 15 }, (_, i) =>
            `Paragraph ${i}: enough text to ensure splitting into multiple parts.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(content);

        const result = await textReader.read('/fake/file.txt', { maxChunkSize: 200 });

        const partLabels = result.chunks.map(c => c.label);
        expect(partLabels.some(l => l.startsWith('Part '))).toBe(true);
    });

    it('includes part number in metadata for multi-part chunks', async () => {
        const content = Array.from({ length: 10 }, (_, i) =>
            `Paragraph ${i}: padding text to make this paragraph long enough for splitting.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(content);

        const result = await textReader.read('/fake/file.txt', { maxChunkSize: 200 });

        const parted = result.chunks.filter(c => c.metadata.part !== undefined);
        expect(parted.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// JSON — large JSON paragraph splitting
// ---------------------------------------------------------------------------

describe('textReader — large JSON splitting', () => {
    it('splits large JSON by paragraphs when exceeding maxChunkSize', async () => {
        // JSON.stringify with indent 2 creates paragraph-like blocks separated by double newlines
        const largeObj: Record<string, string> = {};
        for (let i = 0; i < 50; i++) {
            largeObj[`key_${i}`] = 'x'.repeat(80);
        }
        // Manually create content with double newlines to trigger paragraph splitting
        const content = Object.entries(largeObj).map(([k, v]) =>
            `"${k}": "${v}"`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(content);

        const result = await textReader.read('/fake/file.json', { maxChunkSize: 500 });

        expect(result.chunks.length).toBeGreaterThan(1);
    });
});

// ---------------------------------------------------------------------------
// Empty/edge cases
// ---------------------------------------------------------------------------

describe('textReader — empty content fallback', () => {
    it('returns "(empty file)" for markdown with no content', async () => {
        mockReadFileSync.mockReturnValue('');

        const result = await textReader.read('/fake/file.md');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].content).toBe('(empty file)');
        expect(result.chunks[0].type).toBe('full');
    });

    it('returns "(empty file)" for yaml with empty content', async () => {
        mockReadFileSync.mockReturnValue('');

        const result = await textReader.read('/fake/file.yaml');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].content).toBe('(empty file)');
    });
});

// ---------------------------------------------------------------------------
// Preamble edge case — short preamble ignored
// ---------------------------------------------------------------------------

describe('textReader — preamble handling', () => {
    it('skips preamble shorter than 30 characters', async () => {
        mockReadFileSync.mockReturnValue('Short.\n# Heading\nBody content that is long enough.');

        const result = await textReader.read('/fake/file.md');

        const preamble = result.chunks.find(c => c.label === 'Preamble');
        expect(preamble).toBeUndefined();
    });
});
