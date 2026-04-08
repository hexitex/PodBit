/**
 * KNOWLEDGE BASE - DOCUMENT READER
 *
 * Reads Word (.docx) and OpenDocument (.odt) files.
 * Extracts text and splits by headings into sections.
 * Does not require an LLM.
 */

import fs from 'fs';
import type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';

const DEFAULT_MAX_CHUNK = 4000;

/**
 * Document reader for Word (.docx) and OpenDocument (.odt) files.
 *
 * Uses `mammoth` for .docx extraction and `adm-zip` for .odt (reads content.xml
 * from the ZIP archive and strips XML tags). Splits extracted text into sections
 * based on heading-like patterns (markdown headings from mammoth output, ALL-CAPS
 * lines). Both libraries are dynamically imported with graceful failure messages.
 * Does not require an LLM.
 */
export const docReader: ReaderPlugin = {
    id: 'doc',
    name: 'Document Reader',
    subsystem: 'reader_doc',
    extensions: ['docx', 'odt', 'doc', 'rtf', 'pages', 'epub'],
    mimeTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.oasis.opendocument.text',
    ],
    requiresLLM: false,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const maxChunkSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK;
        const ext = filePath.split('.').pop()?.toLowerCase() || '';

        let text: string;

        if (ext === 'docx') {
            text = await readDocx(filePath);
        } else if (ext === 'odt') {
            text = await readOdt(filePath);
        } else {
            throw new Error(`Unsupported document format: ${ext}`);
        }

        // Split by heading-like patterns (common in extracted document text)
        const chunks = splitByDocSections(text, maxChunkSize);

        if (chunks.length === 0) {
            chunks.push({
                index: 0,
                type: 'full',
                label: 'Full content',
                content: text.slice(0, maxChunkSize) || '(no text extracted)',
                metadata: {},
            });
        }

        return {
            chunks,
            metadata: {
                encoding: 'utf-8',
                language: ext,
            },
        };
    },
};

/**
 * Extract raw text from a .docx file using the mammoth library.
 *
 * @param filePath - Absolute path to the .docx file
 * @returns Extracted plain text content
 * @throws If mammoth is not installed or the file cannot be read
 */
async function readDocx(filePath: string): Promise<string> {
    let mammoth: any;
    try {
        mammoth = await import('mammoth');
    } catch {
        throw new Error('mammoth not installed. Run: npm install mammoth');
    }

    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
}

/**
 * Extract text from an .odt (OpenDocument Text) file.
 * ODT files are ZIP archives containing content.xml; this function extracts
 * that XML and strips tags to produce plain text with markdown-style headings.
 * Falls back to reading as plain text if adm-zip is not installed.
 *
 * @param filePath - Absolute path to the .odt file
 * @returns Extracted plain text content
 * @throws If neither adm-zip nor plain-text fallback can read the file
 */
async function readOdt(filePath: string): Promise<string> {
    // ODT files are ZIP archives containing content.xml
    // Use a simple approach: read the ZIP, extract content.xml, strip XML tags
    let AdmZip: any;
    try {
        // @ts-expect-error — adm-zip lacks type declarations
        AdmZip = (await import('adm-zip') as any).default;
    } catch {
        // Fallback: try to read as plain text (won't work for real ODT but graceful failure)
        try {
            return fs.readFileSync(filePath, 'utf-8');
        } catch {
            throw new Error('adm-zip not installed for ODT support. Run: npm install adm-zip');
        }
    }

    const zip = new AdmZip(filePath);
    const contentEntry = zip.getEntry('content.xml');
    if (!contentEntry) {
        throw new Error('No content.xml found in ODT file');
    }

    const xml = contentEntry.getData().toString('utf-8');
    // Strip XML tags, keep text content
    return xml
        .replace(/<text:p[^>]*>/g, '\n')
        .replace(/<text:h[^>]*>/g, '\n## ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Split extracted document text into sections based on heading-like patterns.
 * Recognizes markdown-style headings (from mammoth) and ALL-CAPS lines.
 * Forces a split when content exceeds `maxChunkSize` even mid-section.
 *
 * @param text - The full extracted document text
 * @param maxChunkSize - Maximum character length per chunk
 * @returns Array of {@link ChunkResult} sections
 */
function splitByDocSections(text: string, maxChunkSize: number): ChunkResult[] {
    // Look for heading-like patterns
    const lines = text.split('\n');
    const chunks: ChunkResult[] = [];
    let current = '';
    let currentLabel = 'Introduction';

    for (const line of lines) {
        // Detect heading patterns (markdown-style from mammoth, or ALL CAPS lines, etc.)
        const isHeading = /^#{1,6}\s+/.test(line) ||
            (/^[A-Z][A-Z\s]{5,}$/.test(line.trim()) && line.trim().length > 5 && line.trim().length < 80);

        if (isHeading && current.trim().length > 20) {
            chunks.push({
                index: chunks.length,
                type: 'section',
                label: currentLabel,
                content: current.trim().slice(0, maxChunkSize),
                metadata: { heading: currentLabel },
            });
            current = '';
            currentLabel = line.replace(/^#+\s*/, '').trim() || 'Section';
        }

        current += line + '\n';

        // Force split if current chunk is too large
        if (current.length > maxChunkSize) {
            chunks.push({
                index: chunks.length,
                type: 'section',
                label: currentLabel,
                content: current.trim().slice(0, maxChunkSize),
                metadata: { heading: currentLabel },
            });
            current = '';
            currentLabel = `${currentLabel} (cont.)`;
        }
    }

    // Push remaining
    if (current.trim().length > 10) {
        chunks.push({
            index: chunks.length,
            type: chunks.length === 0 ? 'full' : 'section',
            label: chunks.length === 0 ? 'Full content' : currentLabel,
            content: current.trim().slice(0, maxChunkSize),
            metadata: chunks.length === 0 ? {} : { heading: currentLabel },
        });
    }

    return chunks;
}
