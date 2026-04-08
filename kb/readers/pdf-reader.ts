/**
 * KNOWLEDGE BASE - PDF READER
 *
 * Extracts text from PDF files using pdf-parse.
 * Each page becomes a separate chunk.
 * Does not require an LLM for text-based PDFs.
 */

import fs from 'fs';
import type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';

const DEFAULT_MAX_CHUNK = 4000;

/**
 * PDF text extraction reader using the `pdf-parse` library.
 *
 * Extracts full text content and splits into per-page chunks based on
 * estimated page boundaries. Pages that exceed the max chunk size are
 * sub-split at sentence or newline boundaries.
 * Does not require an LLM for text-based PDFs.
 * Requires `pdf-parse` npm dependency (dynamically imported).
 */
export const pdfReader: ReaderPlugin = {
    id: 'pdf',
    name: 'PDF Reader',
    subsystem: 'reader_pdf',
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    requiresLLM: false,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const maxChunkSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK;

        // Dynamic import to handle cases where pdf-parse isn't installed
        let PDFParse: any;
        try {
            const mod = await import('pdf-parse') as any;
            PDFParse = mod.PDFParse || mod.default;
        } catch {
            throw new Error('pdf-parse not installed. Run: npm install pdf-parse');
        }

        const buffer = fs.readFileSync(filePath);

        // pdf-parse v2 uses a class-based API
        const parser = new PDFParse({ data: buffer });
        const doc = await parser.load();
        const numPages = doc.numPages || 1;
        const result = await parser.getText(doc);
        const fullText = result.text || '';
        const pages: { text: string; num: number }[] = result.pages || [];
        parser.destroy();

        const chunks: ChunkResult[] = [];

        if (pages.length <= 1 || fullText.length <= maxChunkSize) {
            // Single chunk for small PDFs
            chunks.push({
                index: 0,
                type: fullText.length <= maxChunkSize ? 'full' : 'page',
                label: numPages <= 1 ? 'Full content' : 'All pages',
                content: fullText.slice(0, maxChunkSize),
                metadata: { totalPages: numPages },
            });
        } else {
            // Use per-page text from pdf-parse v2
            for (const page of pages) {
                const pageText = (page.text || '').trim();
                if (!pageText) continue;

                if (pageText.length > maxChunkSize) {
                    const subParts = splitLongText(pageText, maxChunkSize);
                    for (let j = 0; j < subParts.length; j++) {
                        chunks.push({
                            index: chunks.length,
                            type: 'page',
                            label: `Page ${page.num}${subParts.length > 1 ? ` (part ${j + 1})` : ''}`,
                            content: subParts[j],
                            metadata: { page: page.num, part: j + 1, totalPages: numPages },
                        });
                    }
                } else {
                    chunks.push({
                        index: chunks.length,
                        type: 'page',
                        label: `Page ${page.num}`,
                        content: pageText,
                        metadata: { page: page.num, totalPages: numPages },
                    });
                }
            }
        }

        // Ensure at least one chunk
        if (chunks.length === 0) {
            chunks.push({
                index: 0,
                type: 'full',
                label: 'Full content',
                content: fullText.slice(0, maxChunkSize) || '(no text extracted from PDF)',
                metadata: { totalPages: numPages },
            });
        }

        return {
            chunks,
            metadata: {
                totalPages: numPages,
                encoding: 'utf-8',
            },
        };
    },
};

/**
 * Split a long text string into parts that fit within `maxSize`.
 * Attempts to split at sentence boundaries ('. ') first, then newlines,
 * falling back to hard splits at `maxSize`.
 *
 * @param text - The text to split
 * @param maxSize - Maximum character length per part
 * @returns Array of text parts
 */
function splitLongText(text: string, maxSize: number): string[] {
    const parts: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxSize) {
            parts.push(remaining);
            break;
        }
        // Try to split at a sentence boundary
        let splitIdx = remaining.lastIndexOf('. ', maxSize);
        if (splitIdx < maxSize * 0.5) splitIdx = remaining.lastIndexOf('\n', maxSize);
        if (splitIdx < maxSize * 0.5) splitIdx = maxSize;
        parts.push(remaining.slice(0, splitIdx + 1).trim());
        remaining = remaining.slice(splitIdx + 1).trim();
    }
    return parts;
}
