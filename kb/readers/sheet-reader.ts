/**
 * KNOWLEDGE BASE - SPREADSHEET READER
 *
 * Reads Excel (.xlsx, .xls) and OpenDocument Spreadsheet (.ods) files.
 * Each sheet becomes a separate chunk.
 * Does not require an LLM.
 */

import fs from 'fs';
import type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';

const DEFAULT_MAX_CHUNK = 4000;
const MAX_ROWS_PER_CHUNK = 100;

/**
 * Spreadsheet reader for Excel (.xlsx, .xls), OpenDocument (.ods), CSV, and TSV files.
 *
 * Uses the `xlsx` library to parse workbooks. Each sheet is converted to markdown
 * table format (pipe-delimited rows with header separator). Large sheets are split
 * into chunks by row count ({@link MAX_ROWS_PER_CHUNK}) or character size limit.
 * Does not require an LLM. Requires `xlsx` npm dependency (dynamically imported).
 */
export const sheetReader: ReaderPlugin = {
    id: 'sheet',
    name: 'Spreadsheet Reader',
    subsystem: 'reader_sheet',
    extensions: ['xlsx', 'xls', 'ods', 'csv', 'tsv'],
    mimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.oasis.opendocument.spreadsheet',
        'text/csv',
        'text/tab-separated-values',
    ],
    requiresLLM: false,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const maxChunkSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK;

        let XLSX: any;
        try {
            XLSX = await import('xlsx');
        } catch {
            throw new Error('xlsx not installed. Run: npm install xlsx');
        }

        const buffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetNames = workbook.SheetNames || [];

        const chunks: ChunkResult[] = [];

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;

            // Convert to array of arrays
            const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (!data || data.length === 0) continue;

            // Format as readable table text
            const headers = data[0]?.map((h: any) => String(h || '').trim()) || [];
            const rows = data.slice(1).filter((row: any[]) =>
                row.some((cell: any) => cell !== '' && cell !== null && cell !== undefined)
            );

            if (headers.length === 0 && rows.length === 0) continue;

            // Build table text
            let tableText = '';
            if (headers.some(h => h)) {
                tableText += `| ${headers.join(' | ')} |\n`;
                tableText += `| ${headers.map(() => '---').join(' | ')} |\n`;
            }

            let rowCount = 0;
            for (const row of rows) {
                if (rowCount >= MAX_ROWS_PER_CHUNK) {
                    // Flush current chunk
                    if (tableText.length > 20) {
                        const truncNote = rows.length > rowCount ? `\n... (${rows.length - rowCount} more rows)` : '';
                        chunks.push({
                            index: chunks.length,
                            type: 'sheet',
                            label: `Sheet: ${sheetName}${chunks.length > 0 ? ` (part ${chunks.length + 1})` : ''}`,
                            content: (tableText + truncNote).slice(0, maxChunkSize),
                            metadata: {
                                sheetName,
                                totalRows: rows.length,
                                headers,
                                rowRange: `1-${rowCount}`,
                            },
                        });
                    }
                    tableText = '';
                    if (headers.some(h => h)) {
                        tableText += `| ${headers.join(' | ')} |\n`;
                        tableText += `| ${headers.map(() => '---').join(' | ')} |\n`;
                    }
                    rowCount = 0;
                }

                const cells = row.map((cell: any) => String(cell ?? '').trim());
                tableText += `| ${cells.join(' | ')} |\n`;
                rowCount++;

                // Also check text size
                if (tableText.length >= maxChunkSize * 0.9) {
                    chunks.push({
                        index: chunks.length,
                        type: 'sheet',
                        label: `Sheet: ${sheetName} (part ${chunks.length + 1})`,
                        content: tableText.slice(0, maxChunkSize),
                        metadata: { sheetName, totalRows: rows.length, headers },
                    });
                    tableText = '';
                    if (headers.some(h => h)) {
                        tableText += `| ${headers.join(' | ')} |\n`;
                        tableText += `| ${headers.map(() => '---').join(' | ')} |\n`;
                    }
                    rowCount = 0;
                }
            }

            // Push remaining
            if (tableText.trim().length > 20) {
                chunks.push({
                    index: chunks.length,
                    type: 'sheet',
                    label: `Sheet: ${sheetName}`,
                    content: tableText.slice(0, maxChunkSize),
                    metadata: {
                        sheetName,
                        totalRows: rows.length,
                        headers,
                    },
                });
            }
        }

        if (chunks.length === 0) {
            chunks.push({
                index: 0,
                type: 'full',
                label: 'Full content',
                content: '(no data extracted from spreadsheet)',
                metadata: { totalSheets: sheetNames.length },
            });
        }

        return {
            chunks,
            metadata: {
                totalSheets: sheetNames.length,
            },
        };
    },
};
