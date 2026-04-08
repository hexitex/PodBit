/**
 * KNOWLEDGE BASE - READER AUTO-REGISTRATION
 *
 * Imports all reader plugins and registers them in the registry.
 * Import this module once at startup to activate all readers.
 * Advanced readers are loaded dynamically — missing deps are handled gracefully.
 */

import { registerReader } from './registry.js';
import { textReader } from './text-reader.js';
import { codeReader } from './code-reader.js';

// Register built-in readers (no external deps)
registerReader(textReader);
registerReader(codeReader);

/**
 * Dynamically import and register advanced reader plugins.
 * Each reader is wrapped in a try/catch so missing npm dependencies
 * (pdf-parse, mammoth, xlsx, sharp) cause graceful skips rather than crashes.
 */
async function registerAdvancedReaders() {
    try {
        const { pdfReader } = await import('./pdf-reader.js');
        registerReader(pdfReader);
    } catch { /* pdf-parse not installed */ }

    try {
        const { docReader } = await import('./doc-reader.js');
        registerReader(docReader);
    } catch { /* mammoth not installed */ }

    try {
        const { sheetReader } = await import('./sheet-reader.js');
        registerReader(sheetReader);
    } catch { /* xlsx not installed */ }

    try {
        const { imageReader } = await import('./image-reader.js');
        registerReader(imageReader);
    } catch { /* image reader import failed */ }
}

/**
 * Promise that resolves when all advanced reader plugins (PDF, Doc, Sheet, Image)
 * have attempted registration. Callers that need guaranteed reader availability
 * (e.g. the scanner and watcher) should `await readersReady` before processing files.
 * The promise never rejects -- individual reader import failures are silently caught
 * so that missing npm dependencies cause graceful skips rather than crashes.
 */
export const readersReady = registerAdvancedReaders().catch(() => {});

export { registerReader } from './registry.js';
export { getReaderForExtension, getAllReaders, getSupportedExtensions } from './registry.js';
export type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';
