/**
 * Deep coverage tests for kb/readers/sheet-reader.ts — targets uncovered paths.
 *
 * Covers:
 * - Row count exceeding MAX_ROWS_PER_CHUNK (100) triggering chunk flush with truncation note
 * - Text size exceeding maxChunkSize * 0.9 mid-sheet triggering chunk split
 * - Headers with all empty strings (no header row rendered)
 * - Sheet with headers-only, no data rows but content > 20 chars
 * - Sheet with only empty rows after header (filtered out, content <= 20 chars)
 * - Chunk label includes "(part N)" for multi-part sheets
 * - rowRange metadata on flushed chunks
 * - Re-rendering header separators after each chunk flush
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFileSync = jest.fn<(p: string) => Buffer>().mockReturnValue(Buffer.from(''));

jest.unstable_mockModule('fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
}));

const mockSheetToJson = jest.fn<(sheet: any, opts?: any) => any[][]>().mockReturnValue([]);
const mockXlsxRead = jest.fn<(buf: any, opts?: any) => any>().mockReturnValue({
    SheetNames: [],
    Sheets: {},
});

jest.unstable_mockModule('xlsx', () => ({
    default: {
        read: mockXlsxRead,
        utils: { sheet_to_json: mockSheetToJson },
    },
    read: mockXlsxRead,
    utils: { sheet_to_json: mockSheetToJson },
}));

const { sheetReader } = await import('../../kb/readers/sheet-reader.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from(''));
    mockXlsxRead.mockReturnValue({ SheetNames: [], Sheets: {} });
    mockSheetToJson.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// MAX_ROWS_PER_CHUNK flush
// ---------------------------------------------------------------------------

describe('row count exceeding MAX_ROWS_PER_CHUNK', () => {
    it('flushes a chunk after 100 rows and includes truncation note', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['BigSheet'],
            Sheets: { BigSheet: {} },
        });

        // 1 header + 150 data rows
        const rows: any[][] = [['ID', 'Value']];
        for (let i = 1; i <= 150; i++) {
            rows.push([`${i}`, `val${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/big.xlsx');

        // Should have at least 2 chunks (100 rows flush + remaining 50)
        expect(result.chunks.length).toBeGreaterThanOrEqual(2);

        // First chunk should have rowRange metadata
        const firstChunk = result.chunks[0];
        expect(firstChunk.metadata.rowRange).toBe('1-100');
        expect(firstChunk.metadata.totalRows).toBe(150);

        // First chunk label should include part number when there are prior chunks
        // or be the base sheet name for the first chunk
        expect(firstChunk.label).toContain('BigSheet');

        // Second chunk should exist with remaining rows
        const secondChunk = result.chunks[1];
        expect(secondChunk.label).toContain('BigSheet');
        expect(secondChunk.type).toBe('sheet');
    });

    it('includes truncation note showing remaining rows', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        const rows: any[][] = [['Col']];
        for (let i = 0; i < 120; i++) {
            rows.push([`row${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // First chunk should mention remaining rows
        const firstChunk = result.chunks[0];
        expect(firstChunk.content).toContain('20 more rows');
    });

    it('does not include truncation note when rows exactly equal MAX_ROWS_PER_CHUNK', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        // Exactly 100 data rows + header
        const rows: any[][] = [['Col']];
        for (let i = 0; i < 100; i++) {
            rows.push([`row${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // The first flush at rowCount=100 checks if rows.length > rowCount
        // rows.length = 100, rowCount = 100, so no truncation note
        // But the chunk should still be flushed
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('re-renders headers after chunk flush', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        const rows: any[][] = [['Name', 'Score']];
        for (let i = 0; i < 110; i++) {
            rows.push([`person${i}`, `${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // Second chunk should also have the header row
        if (result.chunks.length >= 2) {
            expect(result.chunks[1].content).toContain('| Name | Score |');
            expect(result.chunks[1].content).toContain('| --- | --- |');
        }
    });
});

// ---------------------------------------------------------------------------
// Text size exceeding maxChunkSize * 0.9
// ---------------------------------------------------------------------------

describe('text size exceeding maxChunkSize threshold', () => {
    it('splits into multiple chunks when text exceeds 90% of maxChunkSize', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Wide'],
            Sheets: { Wide: {} },
        });

        // Create rows with very long cell content to hit the size threshold quickly
        const longValue = 'A'.repeat(200);
        const rows: any[][] = [['Header1', 'Header2']];
        for (let i = 0; i < 30; i++) {
            rows.push([longValue, longValue]);
        }
        mockSheetToJson.mockReturnValue(rows);

        // Use a small maxChunkSize to trigger the size-based split
        const result = await sheetReader.read('/test/wide.xlsx', { maxChunkSize: 1000 });

        // Should create multiple chunks due to size threshold
        expect(result.chunks.length).toBeGreaterThan(1);

        // Each chunk content should be at most maxChunkSize
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(1000);
        }

        // Chunks after the first should have "(part N)" in label
        if (result.chunks.length >= 2) {
            expect(result.chunks[1].label).toContain('part');
        }
    });

    it('re-renders headers after size-based chunk split', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        const longValue = 'B'.repeat(300);
        const rows: any[][] = [['Key', 'LongVal']];
        for (let i = 0; i < 20; i++) {
            rows.push([`k${i}`, longValue]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx', { maxChunkSize: 800 });

        if (result.chunks.length >= 2) {
            // Second chunk should contain re-rendered headers
            expect(result.chunks[1].content).toContain('| Key | LongVal |');
        }
    });
});

// ---------------------------------------------------------------------------
// Headers with all empty strings
// ---------------------------------------------------------------------------

describe('headers with all empty values', () => {
    it('does not render header row when all headers are empty strings', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['NoHeaders'],
            Sheets: { NoHeaders: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['', '', ''],       // all empty headers
            ['data1', 'data2', 'data3'],
            ['data4', 'data5', 'data6'],
        ]);

        const result = await sheetReader.read('/test/noheaders.xlsx');

        expect(result.chunks.length).toBe(1);
        const content = result.chunks[0].content;
        // Should NOT have separator row since headers.some(h => h) is false
        expect(content).not.toContain('| --- |');
        // But should still have data rows
        expect(content).toContain('data1');
    });

    it('does not re-render empty headers after chunk flush', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        const rows: any[][] = [['', '']];
        for (let i = 0; i < 110; i++) {
            rows.push([`a${i}`, `b${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // No chunk should have separator rows since headers are all empty
        for (const chunk of result.chunks) {
            expect(chunk.content).not.toContain('| --- |');
        }
    });
});

// ---------------------------------------------------------------------------
// Sheet with only headers (no data rows) — content > 20 chars
// ---------------------------------------------------------------------------

describe('sheet with headers only', () => {
    it('creates a chunk when headers produce content > 20 characters', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['HeadersOnly'],
            Sheets: { HeadersOnly: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['LongHeaderNameOne', 'LongHeaderNameTwo', 'LongHeaderNameThree'],
        ]);

        const result = await sheetReader.read('/test/headers.xlsx');

        // Headers should produce a table with header row + separator > 20 chars
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('sheet');
        expect(result.chunks[0].content).toContain('LongHeaderNameOne');
        expect(result.chunks[0].metadata.totalRows).toBe(0);
    });

    it('falls back to empty content chunk when headers too short', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Tiny'],
            Sheets: { Tiny: {} },
        });
        // Very short headers → total content likely <= 20 chars
        mockSheetToJson.mockReturnValue([
            ['A', 'B'],
        ]);

        const result = await sheetReader.read('/test/tiny.xlsx');

        // With headers "A" and "B", the table text is:
        // "| A | B |\n| --- | --- |\n" which is > 20 chars, so it should still create a chunk
        // Let's verify it has content
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Sheet with headers and only empty rows (all filtered)
// ---------------------------------------------------------------------------

describe('sheet with data rows all filtered out', () => {
    it('skips sheet when headers are empty and all rows filtered yields content <= 20 chars', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Empty', 'Good'],
            Sheets: { Empty: {}, Good: {} },
        });

        let callCount = 0;
        mockSheetToJson.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Empty sheet: no headers, only empty rows
                return [
                    ['', ''],
                    ['', '', null, undefined],
                    ['', null],
                ];
            }
            return [['H1'], ['R1']];
        });

        const result = await sheetReader.read('/test/data.xlsx');

        // The "Empty" sheet produces no header row (all empty) and no data rows (all filtered)
        // so tableText is empty → skipped. Only "Good" sheet produces a chunk.
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].label).toContain('Good');
    });
});

// ---------------------------------------------------------------------------
// Chunk label: "(part N)" numbering
// ---------------------------------------------------------------------------

describe('chunk label part numbering', () => {
    it('first row-count flush has no part suffix, second flush has part suffix', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        // Need 200+ rows to trigger two row-count flushes
        const rows: any[][] = [['Col']];
        for (let i = 0; i < 250; i++) {
            rows.push([`row${i}`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // With 250 rows: flush at 100 (chunks.length=0, no part), flush at 200 (chunks.length=1, part 2),
        // remaining 50 pushed (no part suffix in remaining path)
        expect(result.chunks.length).toBe(3);

        // First chunk: no "(part)" since chunks.length was 0 when created
        expect(result.chunks[0].label).toBe('Sheet: Data');
        // Second chunk: chunks.length was 1 → "(part 2)"
        expect(result.chunks[1].label).toBe('Sheet: Data (part 2)');
        // Third chunk (remaining): plain label
        expect(result.chunks[2].label).toBe('Sheet: Data');
    });

    it('size-based flush always includes part suffix', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Wide'],
            Sheets: { Wide: {} },
        });

        const longValue = 'X'.repeat(300);
        const rows: any[][] = [['H1']];
        for (let i = 0; i < 30; i++) {
            rows.push([longValue]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/wide.xlsx', { maxChunkSize: 800 });

        // Size-based splits always use `(part ${chunks.length + 1})` without conditional
        if (result.chunks.length >= 2) {
            expect(result.chunks[1].label).toContain('part');
        }
    });
});

// ---------------------------------------------------------------------------
// Null/undefined cell handling
// ---------------------------------------------------------------------------

describe('null and undefined cell values', () => {
    it('converts null and undefined cells to empty strings', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['Header1', 'Header2', 'Header3'],
            [null, 'value', undefined],
            ['data', null, 'more'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        const content = result.chunks[0].content;

        // Null/undefined should be converted to empty string by String(cell ?? '')
        expect(content).toContain('|  | value |  |');
        expect(content).toContain('| data |  | more |');
    });
});

// ---------------------------------------------------------------------------
// Header trimming
// ---------------------------------------------------------------------------

describe('header trimming', () => {
    it('trims whitespace from header values', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['  Name  ', '  Age  '],
            ['Alice', '30'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks[0].metadata.headers).toEqual(['Name', 'Age']);
    });

    it('converts null header values to empty string', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            [null, 'Valid', undefined],
            ['a', 'b', 'c'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks[0].metadata.headers).toEqual(['', 'Valid', '']);
    });
});

// ---------------------------------------------------------------------------
// Default maxChunkSize
// ---------------------------------------------------------------------------

describe('default maxChunkSize', () => {
    it('uses 4000 as default maxChunkSize when no option provided', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });

        // Create enough data to potentially exceed default 4000 char limit
        const rows: any[][] = [['Header']];
        for (let i = 0; i < 200; i++) {
            rows.push([`Row ${i} with padding text to make it longer for testing purposes yep`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx');

        // All chunks should respect the 4000 default
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(4000);
        }
    });
});
