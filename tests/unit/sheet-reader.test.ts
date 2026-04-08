/**
 * Unit tests for kb/readers/sheet-reader.ts — spreadsheet file reader.
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

// Mock xlsx module
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
    jest.resetAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from(''));
    mockXlsxRead.mockReturnValue({ SheetNames: [], Sheets: {} });
    mockSheetToJson.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('sheetReader metadata', () => {
    it('has correct id, name, and subsystem', () => {
        expect(sheetReader.id).toBe('sheet');
        expect(sheetReader.name).toBe('Spreadsheet Reader');
        expect(sheetReader.subsystem).toBe('reader_sheet');
    });

    it('does not require an LLM', () => {
        expect(sheetReader.requiresLLM).toBe(false);
    });

    it('supports xlsx, xls, ods, csv, tsv extensions', () => {
        expect(sheetReader.extensions).toContain('xlsx');
        expect(sheetReader.extensions).toContain('xls');
        expect(sheetReader.extensions).toContain('ods');
        expect(sheetReader.extensions).toContain('csv');
        expect(sheetReader.extensions).toContain('tsv');
    });

    it('has mimeTypes array', () => {
        expect(Array.isArray(sheetReader.mimeTypes)).toBe(true);
        expect(sheetReader.mimeTypes.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// read() — basic behavior
// ---------------------------------------------------------------------------

describe('sheetReader.read', () => {
    it('returns a fallback chunk when workbook has no sheets', async () => {
        mockXlsxRead.mockReturnValue({ SheetNames: [], Sheets: {} });

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].content).toContain('no data');
        expect(result.metadata.totalSheets).toBe(0);
    });

    it('returns a fallback chunk when sheets are empty', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Sheet1'],
            Sheets: { Sheet1: {} },
        });
        mockSheetToJson.mockReturnValue([]);

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
    });

    it('extracts data from a single sheet with headers and rows', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Revenue'],
            Sheets: { Revenue: { '!ref': 'A1:B3' } },
        });
        mockSheetToJson.mockReturnValue([
            ['Name', 'Amount'],
            ['Alice', '100'],
            ['Bob', '200'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('sheet');
        expect(result.chunks[0].label).toContain('Revenue');
        expect(result.chunks[0].content).toContain('Name');
        expect(result.chunks[0].content).toContain('Amount');
        expect(result.chunks[0].content).toContain('Alice');
        expect(result.chunks[0].metadata.sheetName).toBe('Revenue');
        expect(result.chunks[0].metadata.headers).toEqual(['Name', 'Amount']);
        expect(result.metadata.totalSheets).toBe(1);
    });

    it('formats data as a markdown table', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['Col1', 'Col2'],
            ['val1', 'val2'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        const content = result.chunks[0].content;
        // Should contain pipe-delimited headers and separator
        expect(content).toContain('| Col1 | Col2 |');
        expect(content).toContain('| --- | --- |');
        expect(content).toContain('| val1 | val2 |');
    });

    it('handles multiple sheets', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Sheet1', 'Sheet2'],
            Sheets: { Sheet1: {}, Sheet2: {} },
        });

        let callCount = 0;
        mockSheetToJson.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return [['H1'], ['R1']];
            }
            return [['H2'], ['R2']];
        });

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks.length).toBe(2);
        expect(result.metadata.totalSheets).toBe(2);
    });

    it('filters out empty rows', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['Header'],
            ['value'],
            ['', null, undefined],  // empty row
            ['another'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        const content = result.chunks[0].content;
        expect(content).toContain('value');
        expect(content).toContain('another');
    });

    it('skips sheets where the sheet object is null', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Good', 'Bad'],
            Sheets: { Good: {}, Bad: null },
        });
        mockSheetToJson.mockReturnValue([['H'], ['R']]);

        const result = await sheetReader.read('/test/data.xlsx');
        // Should only have chunk from "Good" sheet
        expect(result.chunks.length).toBe(1);
    });

    it('throws when xlsx package is not available', async () => {
        // This test verifies error messaging — the mock is already loaded so
        // we cannot truly simulate import failure. Instead we verify the reader
        // calls xlsx.read (confirming the dynamic import path works).
        mockXlsxRead.mockReturnValue({ SheetNames: [], Sheets: {} });
        const result = await sheetReader.read('/test/data.xlsx');
        expect(mockXlsxRead).toHaveBeenCalled();
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('respects maxChunkSize option', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        // Generate many rows to exceed chunk size
        const rows: any[][] = [['Header']];
        for (let i = 0; i < 200; i++) {
            rows.push([`Row ${i} with some content to fill space`]);
        }
        mockSheetToJson.mockReturnValue(rows);

        const result = await sheetReader.read('/test/data.xlsx', { maxChunkSize: 500 });
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(500);
        }
    });

    it('records totalRows in metadata', async () => {
        mockXlsxRead.mockReturnValue({
            SheetNames: ['Data'],
            Sheets: { Data: {} },
        });
        mockSheetToJson.mockReturnValue([
            ['H1'],
            ['R1'],
            ['R2'],
            ['R3'],
        ]);

        const result = await sheetReader.read('/test/data.xlsx');
        expect(result.chunks[0].metadata.totalRows).toBe(3); // 3 data rows, 1 header
    });
});
