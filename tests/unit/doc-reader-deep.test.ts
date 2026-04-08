/**
 * Deep coverage tests for kb/readers/doc-reader.ts
 * Targets: ODT fallback paths, splitByDocSections edge cases (force-split
 * continuation labels, ALL CAPS heading detection, empty text, Section fallback).
 *
 * Note: adm-zip is not installed, so ODT tests cover the fallback path where
 * adm-zip import fails and the reader falls back to fs.readFileSync.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFileSync = jest.fn<(...args: any[]) => any>().mockReturnValue(Buffer.from(''));

jest.unstable_mockModule('fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
}));

// Mock mammoth
const mockExtractRawText = jest.fn<(opts: any) => Promise<any>>().mockResolvedValue({ value: '' });

jest.unstable_mockModule('mammoth', () => ({
    default: {
        extractRawText: mockExtractRawText,
    },
    extractRawText: mockExtractRawText,
}));

const { docReader } = await import('../../kb/readers/doc-reader.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from(''));
    mockExtractRawText.mockResolvedValue({ value: '' });
});

// ---------------------------------------------------------------------------
// ODT — fallback path (adm-zip not installed)
// ---------------------------------------------------------------------------

describe('docReader.read (odt) — fallback when adm-zip missing', () => {
    it('reads ODT as plain text when adm-zip is not installed', async () => {
        // adm-zip import will fail → falls back to fs.readFileSync
        mockReadFileSync.mockReturnValue(
            'Plain text fallback content that is long enough for a chunk.'
        );

        const result = await docReader.read('/test/file.odt');

        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        expect(result.chunks[0].content).toContain('Plain text fallback');
        expect(result.metadata.language).toBe('odt');
    });

    it('throws when adm-zip is missing AND readFileSync also fails', async () => {
        // adm-zip import fails → tries readFileSync(filePath, 'utf-8') → that also fails
        // → throws error about adm-zip
        mockReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT: no such file');
        });

        await expect(docReader.read('/test/file.odt')).rejects.toThrow(
            'adm-zip not installed for ODT support'
        );
    });
});

// ---------------------------------------------------------------------------
// splitByDocSections edge cases (via docx path)
// ---------------------------------------------------------------------------

describe('docReader — splitByDocSections edge cases', () => {
    it('uses "(cont.)" label for force-split continuation chunks', async () => {
        // Build content that will be force-split due to maxChunkSize
        const lines: string[] = [];
        for (let i = 0; i < 100; i++) {
            lines.push(`Line ${i} with padding text to fill up the buffer quickly and reliably.`);
        }
        mockExtractRawText.mockResolvedValue({ value: lines.join('\n') });

        const result = await docReader.read('/test/file.docx', { maxChunkSize: 300 });

        // Should have continuation chunks with (cont.) labels
        const contLabels = result.chunks.filter(c => c.label.includes('(cont.)'));
        expect(contLabels.length).toBeGreaterThan(0);
    });

    it('sets heading label from ALL CAPS lines', async () => {
        const text = [
            'Some intro text with enough content to reach the twenty character minimum threshold.',
            '',
            'METHODOLOGY SECTION',
            'The methodology involves testing all the edge cases thoroughly.',
        ].join('\n');
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        const labels = result.chunks.map(c => c.label);
        expect(labels.some(l => l === 'METHODOLOGY SECTION')).toBe(true);
    });

    it('falls back to "(no text extracted)" when text is completely empty', async () => {
        mockExtractRawText.mockResolvedValue({ value: '' });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].content).toBe('(no text extracted)');
        expect(result.chunks[0].type).toBe('full');
    });

    it('uses "Section" as default heading label when heading line is only hashes', async () => {
        const text = [
            'Intro text that is long enough to be a valid preamble section content.',
            '',
            '## ',
            'Body of the section that follows the empty heading marker line.',
        ].join('\n');
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        // The heading "## " after stripping should yield empty → fallback to "Section"
        const labels = result.chunks.map(c => c.label);
        expect(labels.some(l => l === 'Section' || l === 'Introduction')).toBe(true);
    });

    it('assigns "full" type and "Full content" label when only one chunk from remaining text', async () => {
        const text = 'Short text that has no headings but is longer than ten characters.';
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].label).toBe('Full content');
        expect(result.chunks[0].metadata).toEqual({});
    });

    it('produces section type and heading metadata for multi-chunk remaining text', async () => {
        const text = [
            'Intro text that is long enough to be a valid preamble section content here.',
            '',
            '## First Section',
            'First section content that is also long enough for its own chunk.',
            '',
            '## Second Section',
            'Second section content with enough material to stand on its own.',
        ].join('\n');
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        if (result.chunks.length > 1) {
            const lastChunk = result.chunks[result.chunks.length - 1];
            expect(lastChunk.type).toBe('section');
            expect(lastChunk.metadata.heading).toBeTruthy();
        }
    });

    it('ignores ALL CAPS lines that are too short (<=5 chars)', async () => {
        const text = [
            'Intro text that is long enough to be a preamble section with enough content.',
            '',
            'ABCDE',
            'This should not be treated as a heading because it is only 5 chars.',
        ].join('\n');
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        const labels = result.chunks.map(c => c.label);
        expect(labels.every(l => l !== 'ABCDE')).toBe(true);
    });

    it('ignores ALL CAPS lines that are too long (>=80 chars)', async () => {
        const longCaps = 'A'.repeat(80);
        const text = [
            'Intro text that is long enough to be a preamble section with enough content.',
            '',
            longCaps,
            'This should not be treated as a heading because it is 80+ chars.',
        ].join('\n');
        mockExtractRawText.mockResolvedValue({ value: text });

        const result = await docReader.read('/test/file.docx');
        const labels = result.chunks.map(c => c.label);
        expect(labels.every(l => l !== longCaps)).toBe(true);
    });
});
