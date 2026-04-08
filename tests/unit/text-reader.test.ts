/**
 * Unit tests for kb/readers/text-reader.ts — splitByHeadings, splitByParagraphs, textReader.read.
 *
 * No mocks needed except fs.readFileSync — these are pure text-processing functions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'fs';

const mockReadFileSync = jest.spyOn(fs, 'readFileSync');

// Direct import — no ESM mocking needed for pure functions
const { textReader } = await import('../../kb/readers/text-reader.js');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('textReader metadata', () => {
    it('has correct id and name', () => {
        expect(textReader.id).toBe('text');
        expect(textReader.name).toBe('Text Reader');
    });

    it('does not require LLM', () => {
        expect(textReader.requiresLLM).toBe(false);
    });

    it('supports expected extensions', () => {
        expect(textReader.extensions).toContain('txt');
        expect(textReader.extensions).toContain('md');
        expect(textReader.extensions).toContain('json');
        expect(textReader.extensions).toContain('yaml');
        expect(textReader.extensions).toContain('xml');
    });
});

describe('textReader.read — markdown', () => {
    it('splits markdown by headings', async () => {
        mockReadFileSync.mockReturnValue(
            '# Introduction\nThis is the intro paragraph with enough content.\n\n' +
            '## Section A\nSection A has some real content here that is meaningful.\n\n' +
            '## Section B\nSection B also has substantial content for testing.'
        );

        const result = await textReader.read('/fake/file.md');

        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        expect(result.metadata.language).toBe('md');
        expect(result.metadata.encoding).toBe('utf-8');
    });

    it('includes preamble before first heading if long enough', async () => {
        const preamble = 'This is a long preamble that comes before any headings and is over 30 characters.';
        mockReadFileSync.mockReturnValue(
            preamble + '\n\n# First Heading\nSome content here for testing.'
        );

        const result = await textReader.read('/fake/file.md');

        const preambleChunk = result.chunks.find(c => c.label?.includes('Preamble'));
        expect(preambleChunk).toBeTruthy();
    });

    it('merges small adjacent sections', async () => {
        // Create many tiny sections — should merge
        const sections = Array.from({ length: 10 }, (_, i) =>
            `## Section ${i}\nTiny.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(sections);

        const result = await textReader.read('/fake/file.md');

        // Should be fewer chunks than sections due to merging
        expect(result.chunks.length).toBeLessThan(10);
    });

    it('sub-splits large sections by paragraphs', async () => {
        const bigContent = '# Big Section\n' + Array.from({ length: 100 }, (_, i) =>
            `Paragraph ${i} with enough text to fill a real paragraph for testing.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(bigContent);

        const result = await textReader.read('/fake/file.md', { maxChunkSize: 500 });

        expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('skips empty sections', async () => {
        mockReadFileSync.mockReturnValue(
            '# Non-empty\nThis has content.\n\n## Empty Heading\n\n## Another\nThis also has content.'
        );

        const result = await textReader.read('/fake/file.md');

        // The empty heading section should be skipped
        const labels = result.chunks.map(c => c.label);
        expect(labels.join(' ')).not.toContain('Empty Heading');
    });
});

describe('textReader.read — plain text', () => {
    it('splits plain text by paragraphs', async () => {
        const paragraphs = Array.from({ length: 5 }, (_, i) =>
            `This is paragraph ${i} with enough words to make it meaningful for testing purposes.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(paragraphs);

        const result = await textReader.read('/fake/file.txt');

        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        expect(result.metadata.language).toBe('txt');
    });

    it('returns single chunk for short content', async () => {
        mockReadFileSync.mockReturnValue('Short content.');

        const result = await textReader.read('/fake/file.txt');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].label).toBe('Full content');
    });

    it('truncates oversized paragraphs', async () => {
        const huge = 'x'.repeat(5000);
        mockReadFileSync.mockReturnValue(huge);

        const result = await textReader.read('/fake/file.txt', { maxChunkSize: 500 });

        // Should still produce chunks, truncated
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(500);
        }
    });
});

describe('textReader.read — JSON', () => {
    it('returns single chunk for small JSON', async () => {
        mockReadFileSync.mockReturnValue('{"key": "value", "num": 42}');

        const result = await textReader.read('/fake/file.json');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].metadata.format).toBe('json');
    });

    it('treats large JSON as single chunk when no paragraph breaks', async () => {
        const largeJson = JSON.stringify(
            Array.from({ length: 100 }, (_, i) => ({ key: `value-${i}`, data: 'x'.repeat(100) })),
            null, 2
        );
        mockReadFileSync.mockReturnValue(largeJson);

        const result = await textReader.read('/fake/file.json', { maxChunkSize: 500 });

        // JSON.stringify uses single newlines, not double — splitByParagraphs
        // treats each truncated block as one chunk
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });
});

describe('textReader.read — empty file', () => {
    it('returns at least one chunk for empty content', async () => {
        mockReadFileSync.mockReturnValue('');

        const result = await textReader.read('/fake/file.txt');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].content).toBe('(empty file)');
    });
});

describe('textReader.read — options', () => {
    it('uses default max chunk size when not specified', async () => {
        mockReadFileSync.mockReturnValue('Content');

        const result = await textReader.read('/fake/file.txt');

        expect(result.chunks).toBeTruthy();
    });

    it('respects custom maxChunkSize', async () => {
        const content = Array.from({ length: 50 }, (_, i) =>
            `Paragraph ${i}: some additional text to pad it out a bit.`
        ).join('\n\n');
        mockReadFileSync.mockReturnValue(content);

        const smallChunks = await textReader.read('/fake/file.txt', { maxChunkSize: 200 });
        const largeChunks = await textReader.read('/fake/file.txt', { maxChunkSize: 5000 });

        expect(smallChunks.chunks.length).toBeGreaterThan(largeChunks.chunks.length);
    });
});
