/**
 * KNOWLEDGE BASE - BARREL EXPORTS
 *
 * Central export point for the KB subsystem.
 */

// Types
export type { KBFolder, KBFile, KBChunk, ProcessingJob, PipelineStatus, IngestionStats, ScannedFile } from './types.js';
export type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './readers/types.js';

// Reader registry
export { getReaderForExtension, getAllReaders, getSupportedExtensions, registerReader } from './readers/registry.js';

// Scanner
export { scanFolder, normalizePath, resolveDomain } from './scanner.js';

// Hasher
export { hashFile, hashString } from './hasher.js';

// Pipeline
export { processingPipeline } from './pipeline.js';
