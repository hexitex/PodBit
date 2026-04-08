/**
 * KNOWLEDGE BASE - READER PLUGIN REGISTRY
 *
 * Maps file extensions to reader plugins.
 * Readers self-register at import time via registerReader().
 */

import type { ReaderPlugin } from './types.js';

const readerRegistry = new Map<string, ReaderPlugin>();
const readers: ReaderPlugin[] = [];
/** Tracks extensions explicitly mapped via mapExtensionToReader (custom overrides). */
const customMapped = new Set<string>();

/**
 * Register a reader plugin. Maps all its declared extensions to the plugin
 * in the internal registry. If an extension was already registered by a
 * previous reader, it is silently overwritten.
 *
 * @param reader - The reader plugin instance to register
 */
export function registerReader(reader: ReaderPlugin): void {
    readers.push(reader);
    for (const ext of reader.extensions) {
        readerRegistry.set(ext.toLowerCase(), reader);
    }
}

/**
 * Get the reader that handles a given file extension.
 * Strips a leading dot if present before lookup.
 *
 * @param ext - Extension without dot (case-insensitive; leading dot is stripped)
 * @returns The matching {@link ReaderPlugin}, or `null` if no reader handles this extension
 */
export function getReaderForExtension(ext: string): ReaderPlugin | null {
    return readerRegistry.get(ext.toLowerCase().replace(/^\./, '')) || null;
}

/**
 * Get all registered readers as a shallow copy of the internal list.
 *
 * @returns Array of all registered {@link ReaderPlugin} instances
 */
export function getAllReaders(): ReaderPlugin[] {
    return [...readers];
}

/**
 * Get all supported file extensions currently mapped in the registry.
 *
 * @returns Array of lowercase extension strings (without dots)
 */
export function getSupportedExtensions(): string[] {
    return [...readerRegistry.keys()];
}

/**
 * Map a custom extension to an existing reader by name.
 * Tracks the mapping as "custom" so it can be reverted via {@link unmapExtension}.
 *
 * @param ext - File extension to map (with or without leading dot, case-insensitive)
 * @param readerName - The `name` property of a registered reader (case-insensitive match)
 * @returns `true` if the reader was found and the extension mapped, `false` otherwise
 */
export function mapExtensionToReader(ext: string, readerName: string): boolean {
    const normalized = ext.toLowerCase().replace(/^\./, '');
    const reader = readers.find(r => r.name.toLowerCase() === readerName.toLowerCase());
    if (!reader) return false;
    readerRegistry.set(normalized, reader);
    customMapped.add(normalized);
    return true;
}

/**
 * Remove a custom extension mapping. If the extension was originally
 * registered by a built-in reader, restores the original mapping.
 * If not built-in, removes the extension from the registry entirely.
 *
 * @param ext - File extension to unmap (with or without leading dot, case-insensitive)
 * @returns `true` if a custom mapping existed and was removed, `false` if no custom mapping found
 */
export function unmapExtension(ext: string): boolean {
    const normalized = ext.toLowerCase().replace(/^\./, '');
    if (!customMapped.has(normalized)) return false;
    customMapped.delete(normalized);

    // Restore built-in mapping if one exists
    for (const reader of readers) {
        if (reader.extensions.some(e => e.toLowerCase() === normalized)) {
            readerRegistry.set(normalized, reader);
            return true;
        }
    }
    // Not built-in — remove entirely
    readerRegistry.delete(normalized);
    return true;
}

/**
 * Get all custom extension mappings created via {@link mapExtensionToReader}.
 * Includes both new extensions and overrides of built-in mappings.
 *
 * @returns Array of extension-to-reader-name pairs
 */
export function getCustomMappings(): Array<{ extension: string; readerName: string }> {
    const custom: Array<{ extension: string; readerName: string }> = [];
    for (const ext of customMapped) {
        const reader = readerRegistry.get(ext);
        if (reader) {
            custom.push({ extension: ext, readerName: reader.name });
        }
    }
    return custom;
}
