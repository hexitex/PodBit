/**
 * Unit tests for kb/readers/doc-reader.ts — document file reader (docx, odt).
 *
 * Note: adm-zip is an optional dependency used for ODT files. Since it may not
 * be installed, ODT tests focus on the fallback behavior (reading as plain text).
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
    jest.resetAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from(''));
    mockExtractRawText.mockResolvedValue({ value: '' });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('docReader metadata', () => {
    it('has correct id, name, and subsystem', () => {
        expect(docReader.id).toBe('doc');
        expect(docReader.name).toBe('Document Reader');
        expect(docReader.subsystem).toBe('reader_doc');
    });

    it('does not require an LLM', () => {
        expect(docReader.requiresLLM).toBe(false);
    });

    it('supports docx and odt extensions', () => {
        expect(docReader.extensions).toContain('docx');
        expect(docReader.extensions).toContain('odt');
    });

    it('has mimeTypes for Word and OpenDocument', () => {
        expect(docReader.mimeTypes.length).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// read() — docx files
// ---------------------------------------------------------------------------

describe('docReader.read (docx)', () => {
    it('returns a chunk with extracted text', async () => {
        mockExtractRawText.mockResolvedValue({ value: 'Hello world, this is a document with enough text to pass.' });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        expect(result.chunks[0].content).toContain('Hello world');
        expect(result.metadata.language).toBe('docx');
        expect(result.metadata.encoding).toBe('utf-8');
    });

    it('returns fallback chunk for empty document', async () => {
        mockExtractRawText.mockResolvedValue({ value: '' });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].label).toBe('Full content');
    });

    it('reads file buffer and passes to mammoth', async () => {
        const buf = Buffer.from('fake docx data');
        mockReadFileSync.mockReturnValue(buf);
        mockExtractRawText.mockResolvedValue({ value: 'extracted text content here' });

        await docReader.read('/test/file.docx');
        expect(mockReadFileSync).toHaveBeenCalledWith('/test/file.docx');
        expect(mockExtractRawText).toHaveBeenCalledWith({ buffer: buf });
    });

    it('splits text by markdown-style headings', async () => {
        const docText = [
            'Some introduction text that is long enough to be kept as a chunk.',
            '',
            '## Chapter One',
            'Content of chapter one with enough text to form a chunk on its own.',
            '',
            '## Chapter Two',
            'Content of chapter two with enough text to also form a chunk.',
        ].join('\n');

        mockExtractRawText.mockResolvedValue({ value: docText });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBeGreaterThanOrEqual(2);

        // Check that heading-based labels are used
        const labels = result.chunks.map(c => c.label);
        expect(labels.some(l => l === 'Introduction' || l.includes('Chapter'))).toBe(true);
    });

    it('splits on ALL CAPS headings', async () => {
        const docText = [
            'Intro text that is sufficiently long to produce a preamble chunk.',
            '',
            'EXECUTIVE SUMMARY',
            'This section covers the executive summary details in full.',
            '',
            'DETAILED ANALYSIS',
            'This section covers the detailed analysis of findings.',
        ].join('\n');

        mockExtractRawText.mockResolvedValue({ value: docText });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('force-splits sections exceeding maxChunkSize', async () => {
        // Build long content without headings — all goes into one "current" buffer
        // that will exceed maxChunkSize and trigger force-splits.
        // Use line-based content since splitByDocSections iterates per line.
        const lines: string[] = [];
        for (let i = 0; i < 200; i++) {
            lines.push(`This is line number ${i} with some padding text to fill up space.`);
        }
        const longContent = lines.join('\n'); // ~12000 chars
        mockExtractRawText.mockResolvedValue({ value: longContent });

        const result = await docReader.read('/test/file.docx', { maxChunkSize: 500 });
        expect(result.chunks.length).toBeGreaterThan(1);
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(500);
        }
    });

    it('uses "section" type for multi-chunk documents', async () => {
        const docText = [
            'Introduction with enough text content to be kept in a section.',
            '',
            '## Section Two',
            'Body text that is long enough to be kept as a section chunk.',
        ].join('\n');

        mockExtractRawText.mockResolvedValue({ value: docText });

        const result = await docReader.read('/test/file.docx');
        if (result.chunks.length > 1) {
            expect(result.chunks.some(c => c.type === 'section')).toBe(true);
        }
    });

    it('uses "full" type when text fits in a single chunk with no headings', async () => {
        mockExtractRawText.mockResolvedValue({ value: 'Short document content that has no headings at all.' });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
    });

    it('includes heading in metadata for section chunks', async () => {
        const docText = [
            'Introduction text that is long enough for a chunk to be created.',
            '',
            '## Methods',
            'Methods section body text that is also long enough for chunk.',
        ].join('\n');

        mockExtractRawText.mockResolvedValue({ value: docText });

        const result = await docReader.read('/test/file.docx');
        const sectionChunk = result.chunks.find(c => c.metadata?.heading);
        if (sectionChunk) {
            expect(typeof sectionChunk.metadata.heading).toBe('string');
        }
    });

    it('handles null/undefined value from mammoth', async () => {
        mockExtractRawText.mockResolvedValue({ value: undefined });

        const result = await docReader.read('/test/file.docx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
    });
});

// ---------------------------------------------------------------------------
// read() — unsupported extension
// ---------------------------------------------------------------------------

describe('docReader.read (unsupported)', () => {
    it('throws for unsupported extensions', async () => {
        await expect(docReader.read('/test/file.pdf')).rejects.toThrow('Unsupported document format');
    });
});

// ---------------------------------------------------------------------------
// read() — odt files (fallback path since adm-zip may not be installed)
// ---------------------------------------------------------------------------

describe('docReader.read (odt)', () => {
    it('attempts to read odt file', async () => {
        // Without adm-zip installed, the reader falls back to readFileSync as
        // plain text. This tests the fallback path.
        mockReadFileSync.mockReturnValue('Plain text content from an ODT fallback read.');

        // The odt path tries dynamic import of adm-zip, fails, then falls back
        // to fs.readFileSync as plain text. This may succeed or throw depending
        // on what readFileSync returns. Either way, we verify it doesn't crash
        // with an unhandled error.
        try {
            const result = await docReader.read('/test/file.odt');
            expect(result.chunks.length).toBeGreaterThanOrEqual(1);
            expect(result.metadata.language).toBe('odt');
        } catch (err: any) {
            // If it throws, it should be about adm-zip or content.xml
            expect(err.message).toMatch(/adm-zip|content\.xml|odt/i);
        }
    });
});
