/**
 * KNOWLEDGE BASE - READER PLUGIN TYPES
 *
 * Defines the interface all reader plugins must implement.
 * Each reader handles one or more file extensions and extracts
 * structured chunks from files for ingestion into the knowledge graph.
 */

import type { Subsystem } from '../../models.js';

// =============================================================================
// CHUNK TYPES
// =============================================================================

export interface ChunkResult {
    /** 0-based position within the file */
    index: number;
    /** Semantic chunk type */
    type: 'page' | 'section' | 'sheet' | 'full' | 'code_block';
    /** Human-readable label (e.g., "Page 3", "## Setup", "Sheet: Revenue") */
    label: string;
    /** Extracted text content */
    content: string;
    /** Chunk-specific metadata (page number, language, section heading, etc.) */
    metadata: Record<string, any>;
}

export interface ReaderResult {
    /** Extracted content chunks */
    chunks: ChunkResult[];
    /** Optional file-level summary */
    summary?: string;
    /** File-level metadata */
    metadata: {
        totalPages?: number;
        totalSheets?: number;
        language?: string;
        encoding?: string;
        [key: string]: any;
    };
}

// =============================================================================
// READER PLUGIN INTERFACE
// =============================================================================

export interface ReaderOptions {
    /** Max characters per chunk (default varies by reader) */
    maxChunkSize?: number;
    /** Target domain (for context in LLM calls) */
    domain?: string;
}

export interface ReaderPlugin {
    /** Unique identifier (matches subsystem suffix: 'text', 'pdf', etc.) */
    id: string;
    /** Human-readable name */
    name: string;
    /** Subsystem name for model assignment */
    subsystem: Subsystem;
    /** File extensions this reader handles (lowercase, no dot) */
    extensions: string[];
    /** MIME types this reader handles */
    mimeTypes: string[];
    /** Whether this reader requires an LLM call */
    requiresLLM: boolean;

    /**
     * Read a file and return content chunks.
     *
     * @param filePath - Absolute path to the file
     * @param options - Reader-specific options (max chunk size, target domain)
     * @returns Extracted chunks with file-level metadata
     */
    read(filePath: string, options?: ReaderOptions): Promise<ReaderResult>;
}
