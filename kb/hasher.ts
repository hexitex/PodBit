/**
 * KNOWLEDGE BASE - CONTENT HASHER
 *
 * SHA-256 content hashing for change detection.
 * Files are only re-processed when their content hash changes.
 */

import { createHash } from 'crypto';
import fs from 'fs';

/**
 * Compute SHA-256 hash of a file's contents.
 * Uses streaming for memory efficiency on large files.
 *
 * @param filePath - Absolute path to the file to hash
 * @returns Hex-encoded SHA-256 digest of the file contents
 */
export function hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Compute SHA-256 hash of a string.
 *
 * @param content - The string content to hash
 * @returns Hex-encoded SHA-256 digest
 */
export function hashString(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}
