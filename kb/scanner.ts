/**
 * KNOWLEDGE BASE - FOLDER SCANNER
 *
 * Recursively scans a directory and returns file metadata.
 * Cross-platform (Windows + Linux), handles network folders.
 * All paths stored internally with forward slashes.
 */

import fs from 'fs';
import path from 'path';
// @ts-expect-error — minimatch lacks type declarations in this setup
import minimatch from 'minimatch';
import type { ScannedFile } from './types.js';

/**
 * Normalize a path to forward slashes for consistent cross-platform storage.
 *
 * @param filePath - File path potentially containing backslashes
 * @returns Path with all backslashes replaced by forward slashes
 */
export function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Recursively scan a directory and return file metadata.
 *
 * @param folderPath - Absolute path to the folder
 * @param recursive - Whether to recurse into subdirectories
 * @param includePatterns - Glob patterns to include (null = all)
 * @param excludePatterns - Glob patterns to exclude
 * @param skipLargeFiles - Skip files larger than this (bytes, 0 = no limit)
 * @returns Array of {@link ScannedFile} metadata for each discovered file
 */
export function scanFolder(
    folderPath: string,
    recursive: boolean = true,
    includePatterns: string[] | null = null,
    excludePatterns: string[] | null = null,
    skipLargeFiles: number = 0,
): ScannedFile[] {
    const results: ScannedFile[] = [];
    const resolvedRoot = path.resolve(folderPath);

    function walk(dir: string): void {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (err: any) {
            // Permission denied, network offline, etc.
            console.error(`[kb-scanner] Cannot read ${dir}: ${err.message}`);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Skip common non-content directories
                if (['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.tox',
                    '.idea', '.vscode', 'dist', 'build', '.next', '.nuxt',
                    'coverage', '.cache', '.DS_Store', 'Thumbs.db',
                    'logs', 'backups'].includes(entry.name)) {
                    continue;
                }
                if (recursive) {
                    walk(fullPath);
                }
                continue;
            }

            if (!entry.isFile()) continue;

            const relativePath = normalizePath(path.relative(resolvedRoot, fullPath));
            const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();

            // Skip dotfiles, files without extensions, and log/lock/db files
            if (entry.name.startsWith('.') || !ext) continue;
            if (['log', 'lock', 'db', 'db-shm', 'db-wal'].includes(ext)) continue;

            // Apply include patterns
            // matchBase: true makes *.ext match files in any subdirectory (matches against basename)
            if (includePatterns && includePatterns.length > 0) {
                const matches = includePatterns.some(p => minimatch(relativePath, p, { nocase: true, matchBase: true }));
                if (!matches) continue;
            }

            // Apply exclude patterns
            if (excludePatterns && excludePatterns.length > 0) {
                const excluded = excludePatterns.some(p => minimatch(relativePath, p, { nocase: true, matchBase: true }));
                if (excluded) continue;
            }

            // Get file stats
            let stat: fs.Stats;
            try {
                stat = fs.statSync(fullPath);
            } catch {
                continue; // File may have been deleted between readdir and stat
            }

            // Skip large files
            if (skipLargeFiles > 0 && stat.size > skipLargeFiles) continue;

            // Skip empty files
            if (stat.size === 0) continue;

            results.push({
                relativePath,
                absolutePath: fullPath,
                fileName: entry.name,
                extension: ext,
                size: stat.size,
                modifiedAt: stat.mtime.toISOString(),
            });
        }
    }

    walk(resolvedRoot);
    return results;
}

/**
 * Resolve the domain for a file based on its folder path and subfolder.
 * If auto_domain_subfolders is enabled, the first subfolder level becomes a
 * colon-separated sub-domain (e.g., `myDomain:subfolder`).
 *
 * @param folderDomain - The base domain assigned to the folder
 * @param relativePath - Forward-slash-separated relative path from folder root
 * @param autoSubfolderDomains - Whether to derive sub-domains from subfolder names
 * @returns The resolved domain string
 */
export function resolveDomain(
    folderDomain: string,
    relativePath: string,
    autoSubfolderDomains: boolean,
): string {
    if (!autoSubfolderDomains) return folderDomain;

    const parts = relativePath.split('/');
    if (parts.length <= 1) return folderDomain;

    // Use first subfolder as sub-domain
    const subfolder = parts[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${folderDomain}:${subfolder}`;
}
