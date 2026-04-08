/**
 * KNOWLEDGE BASE - TEXT READER
 *
 * Reads plain text, markdown, JSON, XML, YAML, and similar text formats.
 * Splits content into sections based on format-specific rules.
 * Does not require an LLM — pure text extraction.
 */

import fs from 'fs';
import type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';

const DEFAULT_MAX_CHUNK = 4000;
const MIN_SECTION_SIZE = 200; // Sections smaller than this get merged with neighbors

/**
 * Split text content into chunks at markdown heading boundaries.
 * Small adjacent sections (below {@link MIN_SECTION_SIZE}) are merged to reduce
 * the number of chunks and improve LLM curation quality.
 * Sections that still exceed `maxChunkSize` after merging are sub-split by paragraphs.
 *
 * @param content - The full text content to split
 * @param maxChunkSize - Maximum character length per chunk
 * @returns Array of {@link ChunkResult} with type 'section'
 */
function splitByHeadings(content: string, maxChunkSize: number): ChunkResult[] {
    // Markdown-style heading split
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const sections: { heading: string; level: number; start: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(content)) !== null) {
        sections.push({
            heading: match[2].trim(),
            level: match[1].length,
            start: match.index,
        });
    }

    if (sections.length === 0) {
        // No headings — split by paragraphs or max size
        return splitByParagraphs(content, maxChunkSize);
    }

    // First pass: extract raw sections
    const rawSections: { heading: string; level: number; text: string }[] = [];

    // Content before first heading
    if (sections[0].start > 0) {
        const preamble = content.slice(0, sections[0].start).trim();
        if (preamble.length > 30) {
            rawSections.push({ heading: 'Preamble', level: 0, text: preamble });
        }
    }

    for (let i = 0; i < sections.length; i++) {
        const start = sections[i].start;
        const end = i + 1 < sections.length ? sections[i + 1].start : content.length;
        const text = content.slice(start, end).trim();

        // Skip truly empty sections
        const headingLine = text.split('\n')[0];
        const bodyText = text.slice(headingLine.length).trim();
        if (bodyText.length === 0) continue;

        rawSections.push({
            heading: sections[i].heading,
            level: sections[i].level,
            text,
        });
    }

    // Second pass: merge small adjacent sections to reduce LLM call volume.
    // A file like CLAUDE-COMPACT.md has 15+ tiny table sections (~100-300 chars each).
    // Each would trigger a separate LLM curation call with nearly identical prompts.
    // Merging them into larger chunks produces better curations and fewer API calls.
    const merged: { headings: string[]; text: string; level: number }[] = [];
    let accumText = '';
    let accumHeadings: string[] = [];
    let accumLevel = 0;

    for (const sec of rawSections) {
        if (accumText.length > 0 && accumText.length + sec.text.length + 2 > maxChunkSize) {
            // Flush accumulated content before it exceeds max
            merged.push({ headings: accumHeadings, text: accumText, level: accumLevel });
            accumText = '';
            accumHeadings = [];
        }

        if (accumText.length === 0) {
            // Start new accumulation
            accumText = sec.text;
            accumHeadings = [sec.heading];
            accumLevel = sec.level;
        } else if (sec.text.length < MIN_SECTION_SIZE || accumText.length < MIN_SECTION_SIZE) {
            // Merge small sections with their neighbor
            accumText += '\n\n' + sec.text;
            accumHeadings.push(sec.heading);
        } else {
            // Both sections are large enough — flush previous, start new
            merged.push({ headings: accumHeadings, text: accumText, level: accumLevel });
            accumText = sec.text;
            accumHeadings = [sec.heading];
            accumLevel = sec.level;
        }
    }
    if (accumText.length > 0) {
        merged.push({ headings: accumHeadings, text: accumText, level: accumLevel });
    }

    // Convert to chunks
    const chunks: ChunkResult[] = [];
    for (const m of merged) {
        const label = m.headings.length === 1
            ? m.headings[0]
            : m.headings.join(' + ');

        if (m.text.length <= maxChunkSize) {
            chunks.push({
                index: chunks.length,
                type: 'section',
                label,
                content: m.text,
                metadata: { heading: m.headings[0], level: m.level, mergedCount: m.headings.length },
            });
        } else {
            // Still too large after merging — sub-split by paragraphs
            const subChunks = splitByParagraphs(m.text, maxChunkSize);
            for (const sub of subChunks) {
                sub.label = `${label} (part ${sub.index + 1})`;
                sub.index = chunks.length;
                chunks.push(sub);
            }
        }
    }

    return chunks;
}

/**
 * Split text by double-newline paragraph boundaries.
 * Paragraphs that individually exceed `maxChunkSize` are truncated.
 * If the entire content fits in one chunk, it is returned with type 'full'.
 *
 * @param content - The text content to split
 * @param maxChunkSize - Maximum character length per chunk
 * @returns Array of {@link ChunkResult} chunks
 */
function splitByParagraphs(content: string, maxChunkSize: number): ChunkResult[] {
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: ChunkResult[] = [];
    let current = '';
    let partNum = 1;

    for (const para of paragraphs) {
        // If a single paragraph exceeds maxChunkSize, truncate it
        const safePara = para.length > maxChunkSize ? para.slice(0, maxChunkSize) : para;

        if (current.length + safePara.length + 2 > maxChunkSize && current.length > 0) {
            chunks.push({
                index: chunks.length,
                type: 'section',
                label: `Part ${partNum}`,
                content: current.trim(),
                metadata: { part: partNum },
            });
            partNum++;
            current = '';
        }
        current += (current ? '\n\n' : '') + safePara;
    }

    if (current.trim()) {
        chunks.push({
            index: chunks.length,
            type: chunks.length === 0 ? 'full' : 'section',
            label: chunks.length === 0 ? 'Full content' : `Part ${partNum}`,
            content: current.trim(),
            metadata: chunks.length === 0 ? {} : { part: partNum },
        });
    }

    return chunks;
}

/**
 * Plain text and structured text format reader.
 *
 * Handles txt, markdown, JSON, XML, YAML, config files, and similar text formats.
 * Chunks markdown files by heading boundaries (merging small adjacent sections);
 * all other formats are split by paragraph/double-newline boundaries.
 * Does not require an LLM -- pure text extraction and splitting.
 */
export const textReader: ReaderPlugin = {
    id: 'text',
    name: 'Text Reader',
    subsystem: 'reader_text',
    extensions: [
        'txt', 'md', 'markdown', 'mdx', 'rst', 'adoc', 'asciidoc', 'org', 'tex', 'latex',
        'json', 'jsonc', 'json5', 'jsonl', 'ndjson',
        'xml', 'xsl', 'xslt', 'xsd', 'dtd', 'svg',
        'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'env',
        'rtf', 'log', 'diff', 'patch',
        'editorconfig', 'gitignore', 'gitattributes', 'dockerignore', 'npmrc', 'nvmrc',
        'bib', 'bibtex',
    ],
    mimeTypes: ['text/plain', 'text/markdown', 'application/json', 'application/xml', 'text/xml', 'text/yaml'],
    requiresLLM: false,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const maxChunkSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK;
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = filePath.split('.').pop()?.toLowerCase() || '';

        let chunks: ChunkResult[];

        if (['md', 'markdown'].includes(ext)) {
            chunks = splitByHeadings(content, maxChunkSize);
        } else if (['json'].includes(ext)) {
            // JSON files: treat as single chunk (or split by top-level keys if large)
            if (content.length <= maxChunkSize) {
                chunks = [{ index: 0, type: 'full', label: 'Full content', content, metadata: { format: 'json' } }];
            } else {
                chunks = splitByParagraphs(content, maxChunkSize);
            }
        } else {
            chunks = splitByParagraphs(content, maxChunkSize);
        }

        // Ensure we have at least one chunk
        if (chunks.length === 0) {
            chunks = [{
                index: 0,
                type: 'full',
                label: 'Full content',
                content: content.slice(0, maxChunkSize) || '(empty file)',
                metadata: {},
            }];
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
