/**
 * KNOWLEDGE BASE - FOLDER MANAGEMENT & SCANNING
 *
 * Handles folder CRUD operations (add, remove, update) and the scan-and-queue
 * workflow that discovers new/changed/deleted files and enqueues them for processing.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../../config.js';
import { query as dbQuery } from '../../db.js';
import { getReaderForExtension } from '../readers/registry.js';
import { hashFile } from '../hasher.js';
import { normalizePath, resolveDomain, scanFolder } from '../scanner.js';
import { emitActivity } from '../../services/event-bus.js';
import { enqueue } from './queue.js';
import { archiveFileNodes } from './file-processing.js';
import type { KBFolder, KBFile } from '../types.js';

// =============================================================================
// SCAN & IMPORT
// =============================================================================

/**
 * Scan a folder and queue new/changed files for processing.
 * Performs content-hash-based change detection: unchanged files are skipped,
 * changed files have their old nodes archived before re-queuing, and files
 * no longer on disk are marked as deleted with their nodes archived.
 *
 * @param folderId - UUID of the kb_folders row to scan
 * @returns Counts of files queued, unchanged, unsupported (no reader), and deleted
 * @throws If the folder is not found in the database or the scan itself fails
 */
export async function scanAndQueue(folderId: string): Promise<{ queued: number; unchanged: number; unsupported: number; deleted: number }> {
    // Load folder config
    const folder = await dbQuery('SELECT * FROM kb_folders WHERE id = $1', [folderId]);
    if (!folder || folder.length === 0) throw new Error(`Folder not found: ${folderId}`);
    const f = folder[0] as KBFolder;

    // Update status
    await dbQuery(
        `UPDATE kb_folders SET status = 'scanning', updated_at = datetime('now') WHERE id = $1`,
        [folderId]
    );

    try {
        const rawInclude = f.include_patterns ? JSON.parse(f.include_patterns as any) : null;
        const includePatterns = Array.isArray(rawInclude)
            ? rawInclude
            : (typeof rawInclude === 'string'
                ? rawInclude.split(',').map(s => s.trim()).filter(Boolean)
                : null);
        const rawExclude = f.exclude_patterns ? JSON.parse(f.exclude_patterns as any) : [];
        const folderExcludes = Array.isArray(rawExclude)
            ? rawExclude
            : (typeof rawExclude === 'string'
                ? rawExclude.split(',').map(s => s.trim()).filter(Boolean)
                : []);
        const defaultExcludes = config.knowledgeBase?.defaultExcludePatterns || [];
        const excludePatterns = [...defaultExcludes, ...folderExcludes];
        const skipLargeFiles = config.knowledgeBase?.skipLargeFiles || 0;

        // Scan the file system
        const scanned = scanFolder(f.folder_path, f.recursive, includePatterns, excludePatterns, skipLargeFiles);

        let queued = 0;
        let unchanged = 0;
        let unsupported = 0;

        for (const file of scanned) {
            // Check if reader exists for this extension
            const reader = getReaderForExtension(file.extension);
            if (!reader) {
                unsupported++;
                continue;
            }

            // Check if file already exists and hasn't changed
            const existing = await dbQuery(
                `SELECT id, content_hash, status FROM kb_files WHERE folder_id = $1 AND file_path = $2`,
                [folderId, file.relativePath]
            );

            const contentHash = await hashFile(file.absolutePath);

            if (existing && existing.length > 0) {
                const ex = existing[0] as KBFile;
                if (ex.content_hash === contentHash && ex.status === 'completed') {
                    unchanged++;
                    continue;
                }

                // File changed — archive old nodes, then update record and re-queue
                await archiveFileNodes(ex.id);

                await dbQuery(
                    `UPDATE kb_files SET content_hash = $2, file_size = $3, modified_at = $4, status = 'pending',
                     error_message = NULL, chunk_count = 0, node_id = NULL, updated_at = datetime('now') WHERE id = $1`,
                    [ex.id, contentHash, file.size, file.modifiedAt]
                );

                // Delete old chunks (node references already archived above)
                await dbQuery(`DELETE FROM kb_chunks WHERE file_id = $1`, [ex.id]);

                const domain = resolveDomain(f.domain, file.relativePath, f.auto_domain_subfolders);
                enqueue({
                    fileId: ex.id,
                    filePath: file.absolutePath,
                    folderId,
                    domain,
                    extension: file.extension,
                    priority: 0,
                    rawMode: !!f.raw_mode,
                });
                queued++;
            } else {
                // New file — insert record and queue
                const domain = resolveDomain(f.domain, file.relativePath, f.auto_domain_subfolders);
                const result = await dbQuery(
                    `INSERT INTO kb_files (folder_id, file_path, file_name, extension, file_size, modified_at, content_hash, reader_plugin, domain, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING id`,
                    [folderId, file.relativePath, file.fileName, file.extension, file.size, file.modifiedAt,
                     contentHash, reader.id, domain]
                );

                if (result && result.length > 0) {
                    enqueue({
                        fileId: (result[0] as any).id,
                        filePath: file.absolutePath,
                        folderId,
                        domain,
                        extension: file.extension,
                        priority: 0,
                        rawMode: !!f.raw_mode,
                    });
                    queued++;
                }
            }
        }

        // Detect deleted files — files in DB but no longer on disk
        // We verify each file actually doesn't exist on disk rather than relying
        // solely on the scan results, because the scanner applies filters (include/
        // exclude patterns, extension checks, size limits) that may legitimately
        // exclude files that still exist. Without this check, re-scans with
        // different filter settings would falsely mark filtered-out files as deleted.
        const scannedPaths = new Set(scanned.map(s => s.relativePath));
        const folderRoot = path.resolve(f.folder_path);
        const allDbFiles = await dbQuery(
            `SELECT id, file_path, status FROM kb_files WHERE folder_id = $1 AND status != 'deleted'`,
            [folderId]
        );
        let deleted = 0;
        for (const dbFile of allDbFiles as any[]) {
            if (!scannedPaths.has(dbFile.file_path)) {
                // Not in scan results — but verify the file is actually gone from disk
                const absolutePath = path.join(folderRoot, dbFile.file_path);
                if (fs.existsSync(absolutePath)) {
                    // File still exists on disk but was excluded by scanner filters — skip
                    continue;
                }
                // File genuinely deleted from disk — archive its nodes and mark deleted
                await archiveFileNodes(dbFile.id);
                await dbQuery(`DELETE FROM kb_chunks WHERE file_id = $1`, [dbFile.id]);
                await dbQuery(
                    `UPDATE kb_files SET status = 'deleted', error_message = 'File no longer exists on disk', updated_at = datetime('now') WHERE id = $1`,
                    [dbFile.id]
                );
                deleted++;
            }
        }
        if (deleted > 0) {
            console.log(`[kb-pipeline] Detected ${deleted} deleted files in folder ${f.folder_path}, archived their nodes`);
        }

        // Update folder status — stay in 'processing' if files were queued
        const postScanStatus = queued > 0 ? 'processing' : (f.watch_enabled ? 'watching' : 'idle');
        await dbQuery(
            `UPDATE kb_folders SET status = $2, last_scanned = datetime('now'), error_message = NULL, updated_at = datetime('now') WHERE id = $1`,
            [folderId, postScanStatus]
        );

        emitActivity('kb', 'scan_complete', `Scan complete: ${queued} queued, ${unchanged} unchanged, ${deleted} deleted`, { folderId, queued, unchanged, unsupported, deleted });
        return { queued, unchanged, unsupported, deleted };

    } catch (err: any) {
        await dbQuery(
            `UPDATE kb_folders SET status = 'error', error_message = $2, updated_at = datetime('now') WHERE id = $1`,
            [folderId, err.message?.slice(0, 500)]
        );
        throw err;
    }
}

// =============================================================================
// FOLDER MANAGEMENT
// =============================================================================

/**
 * Add a new watched folder to the KB system.
 * The folder path is resolved to an absolute path and normalized to forward slashes.
 *
 * @param opts - Folder configuration options
 * @param opts.folderPath - Path to the folder on disk (resolved to absolute)
 * @param opts.domain - Knowledge graph domain for ingested content
 * @param opts.recursive - Whether to scan subdirectories (default true)
 * @param opts.watchEnabled - Whether to enable real-time file watching (default true)
 * @param opts.includePatterns - Glob patterns to include (null = all files)
 * @param opts.excludePatterns - Glob patterns to exclude
 * @param opts.autoDomainSubfolders - Derive sub-domains from subfolder names
 * @param opts.rawMode - Store content as-is without LLM curation
 * @returns The newly created {@link KBFolder} record
 */
export async function addFolder(opts: {
    folderPath: string;
    domain: string;
    recursive?: boolean;
    watchEnabled?: boolean;
    includePatterns?: string[];
    excludePatterns?: string[];
    autoDomainSubfolders?: boolean;
    rawMode?: boolean;
}): Promise<KBFolder> {
    // Normalize the path
    const normalizedPath = normalizePath(path.resolve(opts.folderPath));

    const result = await dbQuery(
        `INSERT INTO kb_folders (folder_path, domain, recursive, watch_enabled, include_patterns, exclude_patterns, auto_domain_subfolders, raw_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
            normalizedPath,
            opts.domain,
            opts.recursive !== false ? 1 : 0,
            opts.watchEnabled !== false ? 1 : 0,
            opts.includePatterns ? JSON.stringify(opts.includePatterns) : null,
            opts.excludePatterns ? JSON.stringify(opts.excludePatterns) : null,
            opts.autoDomainSubfolders ? 1 : 0,
            opts.rawMode ? 1 : 0,
        ]
    );

    return result[0] as KBFolder;
}

/**
 * Remove a watched folder and optionally archive its graph nodes.
 * Deletion of the kb_folders row cascades to remove associated kb_files and kb_chunks.
 *
 * @param folderId - UUID of the kb_folders row to remove
 * @param deleteNodes - If true, archives all graph nodes created from this folder's files
 */
export async function removeFolder(folderId: string, deleteNodes: boolean = false): Promise<void> {
    if (deleteNodes) {
        // Get all node IDs created from this folder
        const fileNodes = await dbQuery(
            `SELECT node_id FROM kb_files WHERE folder_id = $1 AND node_id IS NOT NULL`, [folderId]
        );
        const chunkNodes = await dbQuery(
            `SELECT node_id FROM kb_chunks WHERE file_id IN (SELECT id FROM kb_files WHERE folder_id = $1) AND node_id IS NOT NULL`,
            [folderId]
        );

        // Archive the nodes
        const nodeIds = [
            ...fileNodes.map((r: any) => r.node_id),
            ...chunkNodes.map((r: any) => r.node_id),
        ].filter(Boolean);

        if (nodeIds.length > 0) {
            const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
            await dbQuery(
                `UPDATE nodes SET archived = 1 WHERE id IN (${placeholders})`,
                nodeIds
            );
        }
    }

    // CASCADE delete will remove kb_files and kb_chunks
    await dbQuery(`DELETE FROM kb_folders WHERE id = $1`, [folderId]);
}

/**
 * Update a folder's configuration. Only whitelisted fields are applied:
 * folder_path, domain, recursive, watch_enabled, include_patterns,
 * exclude_patterns, and auto_domain_subfolders.
 *
 * @param folderId - UUID of the kb_folders row to update
 * @param updates - Partial folder object with fields to change
 */
export async function updateFolder(folderId: string, updates: Partial<KBFolder>): Promise<void> {
    const allowedFields = ['folder_path', 'domain', 'recursive', 'watch_enabled', 'include_patterns', 'exclude_patterns', 'auto_domain_subfolders'];
    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            sets.push(`${key} = $${++paramIdx}`);
            if (key === 'include_patterns' || key === 'exclude_patterns') {
                values.push(value ? JSON.stringify(value) : null);
            } else if (key === 'recursive' || key === 'watch_enabled' || key === 'auto_domain_subfolders') {
                values.push(value ? 1 : 0);
            } else {
                values.push(value);
            }
        }
    }

    if (sets.length === 0) return;

    sets.push(`updated_at = datetime('now')`);
    await dbQuery(
        `UPDATE kb_folders SET ${sets.join(', ')} WHERE id = $1`,
        [folderId, ...values]
    );
}
