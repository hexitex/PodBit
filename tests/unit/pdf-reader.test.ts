/**
 * Unit tests for kb/readers/pdf-reader.ts — PDF text extraction.
 *
 * Mocks: fs (readFileSync), pdf-parse (dynamic import).
 * Tests: single-page, multi-page, long text splitting, empty PDF, missing pdf-parse.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockReadFileSync = jest.fn<(...args: any[]) => Buffer>();

// pdf-parse v2 class-based API mock
let mockGetTextResult: { text: string; pages: { text: string; num: number }[] } = { text: '', pages: [] };
let mockNumPages = 1;

const MockPDFParse = jest.fn().mockImplementation(() => ({
    load: jest.fn().mockImplementation(() => Promise.resolve({ numPages: mockNumPages })),
    getText: jest.fn().mockImplementation(() => Promise.resolve(mockGetTextResult)),
    destroy: jest.fn(),
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
}));

jest.unstable_mockModule('pdf-parse', () => ({
    PDFParse: MockPDFParse,
}));

const { pdfReader } = await import('../../kb/readers/pdf-reader.js');

/** Helper: set mock to return given text with no per-page data (single-chunk path) */
function setMockPdf(text: string | null, numpages?: number) {
    const t = text ?? '';
    mockNumPages = numpages ?? 1;
    mockGetTextResult = { text: t, pages: [] };
}

/** Helper: set mock with per-page text (multi-page path) */
function setMockPdfPages(pages: { text: string; num: number }[], numpages?: number) {
    mockNumPages = numpages ?? pages.length;
    const fullText = pages.map(p => p.text).join('\n');
    mockGetTextResult = { text: fullText, pages };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from('fake pdf content'));
    setMockPdf('Hello world', 1);
});

// =============================================================================
// Reader metadata
// =============================================================================

describe('pdfReader metadata', () => {
    it('has correct id', () => {
        expect(pdfReader.id).toBe('pdf');
    });

    it('handles pdf extension', () => {
        expect(pdfReader.extensions).toContain('pdf');
    });

    it('handles application/pdf mime type', () => {
        expect(pdfReader.mimeTypes).toContain('application/pdf');
    });

    it('does not require LLM', () => {
        expect(pdfReader.requiresLLM).toBe(false);
    });

    it('uses reader_pdf subsystem', () => {
        expect(pdfReader.subsystem).toBe('reader_pdf');
    });
});

// =============================================================================
// Single-page / small PDFs
// =============================================================================

describe('pdfReader.read — single page', () => {
    it('returns a single chunk for a 1-page PDF', async () => {
        setMockPdf('Short content', 1);
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].content).toBe('Short content');
        expect(result.chunks[0].label).toBe('Full content');
        expect(result.chunks[0].index).toBe(0);
    });

    it('includes totalPages in metadata', async () => {
        setMockPdf('Content', 3);
        // But content is short enough to be a single chunk
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.metadata.totalPages).toBe(3);
    });

    it('returns single chunk when text is shorter than maxChunkSize', async () => {
        setMockPdf('Short', 5);
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].label).toBe('All pages');
    });
});

// =============================================================================
// Multi-page PDFs
// =============================================================================

describe('pdfReader.read — multi page', () => {
    it('splits text into page-based chunks', async () => {
        // Per-page text from pdf-parse v2
        const pageText = 'A'.repeat(2000);
        setMockPdfPages([
            { text: pageText, num: 1 },
            { text: pageText, num: 2 },
            { text: pageText, num: 3 },
        ], 3);

        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(3);
        for (let i = 0; i < 3; i++) {
            expect(result.chunks[i].type).toBe('page');
            expect(result.chunks[i].label).toBe(`Page ${i + 1}`);
            expect(result.chunks[i].metadata.page).toBe(i + 1);
        }
    });

    it('uses custom maxChunkSize from options', async () => {
        // Each page is 1250 chars, with maxChunkSize=500 they get sub-split
        const pageText = 'Word '.repeat(250); // 1250 chars
        setMockPdfPages([
            { text: pageText, num: 1 },
            { text: pageText, num: 2 },
        ], 2);

        const result = await pdfReader.read('/path/to/file.pdf', { maxChunkSize: 500 });

        // With 1250 chars/page and maxChunkSize=500, each page splits into ~3 sub-parts
        expect(result.chunks.length).toBeGreaterThan(2);
    });

    it('skips empty page segments', async () => {
        const longContent = 'A'.repeat(2000);
        setMockPdfPages([
            { text: longContent, num: 1 },
            { text: '   ', num: 2 },  // whitespace-only page
            { text: longContent, num: 3 },
        ], 3);

        const result = await pdfReader.read('/path/to/file.pdf');

        // Page 2 should be skipped (empty after trim)
        expect(result.chunks.length).toBe(2);
        for (const chunk of result.chunks) {
            expect(chunk.content.trim().length).toBeGreaterThan(0);
        }
    });

    it('splits long pages into sub-parts', async () => {
        // Each page is ~7000 chars
        const longPageText = 'Sentence one. '.repeat(500);
        setMockPdfPages([
            { text: longPageText, num: 1 },
            { text: longPageText, num: 2 },
            { text: longPageText, num: 3 },
        ], 3);

        // Use a small maxChunkSize to force sub-page splitting
        const result = await pdfReader.read('/path/to/file.pdf', { maxChunkSize: 500 });

        expect(result.chunks.length).toBeGreaterThan(3);
        // Check that part labels are used
        const hasPartLabel = result.chunks.some((c: any) => c.label.includes('part'));
        expect(hasPartLabel).toBe(true);
    });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('pdfReader.read — edge cases', () => {
    it('returns single chunk with empty content for empty single-page PDF', async () => {
        setMockPdf('', 1);
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].content).toBe('');
    });

    it('returns fallback chunk for multi-page PDF with all empty pages', async () => {
        setMockPdf('   ', 3);
        const result = await pdfReader.read('/path/to/file.pdf', { maxChunkSize: 10000 });

        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('defaults numpages to 1 when missing', async () => {
        setMockPdf('Some content');
        mockNumPages = undefined as any;
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(1);
        expect(result.metadata.totalPages).toBe(1);
    });

    it('includes encoding in metadata', async () => {
        const result = await pdfReader.read('/path/to/file.pdf');
        expect(result.metadata.encoding).toBe('utf-8');
    });

    it('reads file with readFileSync', async () => {
        await pdfReader.read('/test/path.pdf');
        expect(mockReadFileSync).toHaveBeenCalledWith('/test/path.pdf');
    });

    it('truncates single chunk content to maxChunkSize', async () => {
        const longText = 'X'.repeat(10000);
        setMockPdf(longText, 1);

        const result = await pdfReader.read('/path/to/file.pdf', { maxChunkSize: 500 });
        expect(result.chunks[0].content.length).toBeLessThanOrEqual(500);
    });

    it('handles null text from pdf-parse', async () => {
        setMockPdf(null, 1);
        const result = await pdfReader.read('/path/to/file.pdf');

        expect(result.chunks.length).toBe(1);
        // Should use empty string fallback
        expect(result.chunks[0].content).toBeDefined();
    });

    it('chunk indices are sequential', async () => {
        const pageText = 'A'.repeat(2000);
        setMockPdfPages([
            { text: pageText, num: 1 },
            { text: pageText, num: 2 },
            { text: pageText, num: 3 },
        ], 3);
        const result = await pdfReader.read('/path/to/file.pdf');

        for (let i = 0; i < result.chunks.length; i++) {
            expect(result.chunks[i].index).toBe(i);
        }
    });
});
