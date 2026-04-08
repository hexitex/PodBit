/**
 * KNOWLEDGE BASE - CORE TYPES
 *
 * Types for folder tracking, file state, chunk records,
 * pipeline status, and configuration.
 */

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

/**
 * A watched folder registered for KB ingestion.
 * Maps directly to a `kb_folders` database row.
 * Each folder is associated with a knowledge graph domain and can be
 * configured for recursive scanning, real-time watching, and raw vs. curated mode.
 */
export interface KBFolder {
    id: string;
    /** Absolute path to the watched directory on disk. */
    folder_path: string;
    /** Knowledge graph domain that ingested nodes are assigned to. */
    domain: string;
    /** Whether to scan subdirectories recursively. */
    recursive: boolean;
    /** Whether real-time chokidar file watching is active for this folder. */
    watch_enabled: boolean;
    /** Glob patterns for files to include (null = all supported extensions). */
    include_patterns: string[] | null;
    /** Glob patterns for files to exclude from scanning. */
    exclude_patterns: string[] | null;
    /** When true, subfolders map to sub-domains automatically (e.g. `domain:subfolder`). */
    auto_domain_subfolders: boolean;
    /** When true, files are ingested verbatim as `node_type='raw'` (no LLM curation). */
    raw_mode: boolean;
    last_scanned: string | null;
    /** Current operational state of this folder in the pipeline. */
    status: 'idle' | 'scanning' | 'watching' | 'error';
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * A single file tracked by the KB ingestion pipeline.
 * Maps directly to a `kb_files` database row.
 * Tracks processing status, content hash for change detection, and the
 * resulting parent node in the knowledge graph.
 */
export interface KBFile {
    id: string;
    /** Foreign key to the parent {@link KBFolder}. */
    folder_id: string;
    /** Relative path from the folder root (forward slashes). */
    file_path: string;
    file_name: string;
    /** Lowercase extension without dot (e.g. 'ts', 'pdf'). */
    extension: string;
    file_size: number;
    modified_at: string;
    /** SHA-256 hash of file content, used for change detection across re-scans. */
    content_hash: string;
    /** ID of the reader plugin that processed this file (e.g. 'text', 'code', 'pdf'). */
    reader_plugin: string;
    /** Current processing state in the pipeline. */
    status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped' | 'deleted';
    error_message: string | null;
    chunk_count: number;
    /** UUID of the parent graph node created for this file (null until processed). */
    node_id: string | null;
    domain: string;
    processed_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * A chunk extracted from a file by a reader plugin.
 * Maps directly to a `kb_chunks` database row.
 * Each chunk becomes a child node in the knowledge graph, linked to the
 * file's parent node via a 'parent' edge.
 */
export interface KBChunk {
    id: string;
    /** Foreign key to the parent {@link KBFile}. */
    file_id: string;
    /** Zero-based position within the file's chunk sequence. */
    chunk_index: number;
    /** Reader-assigned type (e.g. 'section', 'code_block', 'page', 'sheet', 'full'). */
    chunk_type: string;
    /** Human-readable label (e.g. heading text, function name, page number). */
    chunk_label: string | null;
    content: string;
    content_length: number;
    /** UUID of the graph node created for this chunk (null until processed). */
    node_id: string | null;
    /** Reader-specific metadata (language, page number, sheet name, etc.). */
    metadata: Record<string, any> | null;
    created_at: string;
}

// =============================================================================
// PIPELINE TYPES
// =============================================================================

/**
 * An in-memory job queued for the KB processing pipeline.
 * Created by the scanner or watcher and consumed by the pipeline worker.
 * Not persisted to the database -- queue state lives only in memory.
 */
export interface ProcessingJob {
    fileId: string;
    /** Absolute path to the file on disk. */
    filePath: string;
    folderId: string;
    /** Target knowledge graph domain for the resulting nodes. */
    domain: string;
    extension: string;
    /** 0 = normal (scan/watch), 1 = high priority (manual reprocess). */
    priority: number;
    /** When true, content is ingested verbatim as `node_type='raw'` (no LLM curation). */
    rawMode: boolean;
}

/**
 * Snapshot of the KB processing pipeline's current state.
 * Returned by `getStatus()` in the pipeline admin module.
 * Counters reset on project switch or explicit `resetCounters()` call.
 */
export interface PipelineStatus {
    /** True if any jobs are active or queued. */
    running: boolean;
    queueLength: number;
    activeJobs: number;
    /** Files successfully processed since last counter reset. */
    completed: number;
    /** Files that failed processing since last counter reset. */
    failed: number;
    /** Files skipped (unchanged hash) since last counter reset. */
    skipped: number;
}

/**
 * Aggregate statistics about KB ingestion across all folders.
 * Computed from database queries in `getStats()`.
 */
export interface IngestionStats {
    totalFolders: number;
    totalFiles: number;
    /** File counts grouped by processing status (e.g. pending, completed, error). */
    filesByStatus: Record<string, number>;
    /** File counts grouped by reader plugin ID (e.g. text, code, pdf). */
    filesByReader: Record<string, number>;
    totalChunks: number;
    /** Count of distinct graph nodes created from chunks. */
    totalNodes: number;
}

// =============================================================================
// SCANNER TYPES
// =============================================================================

export interface ScannedFile {
    /** Relative path from folder root (forward slashes) */
    relativePath: string;
    /** Absolute path on disk */
    absolutePath: string;
    /** File name only */
    fileName: string;
    /** Lowercase extension without dot */
    extension: string;
    /** File size in bytes */
    size: number;
    /** Last modified time as ISO string */
    modifiedAt: string;
}
