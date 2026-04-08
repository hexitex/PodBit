/**
 * KNOWLEDGE BASE - PIPELINE ADMIN OPERATIONS
 *
 * Provides file listing, reprocessing, retry, status queries,
 * pipeline stop/resume, counter management, and stuck-file recovery.
 */

import path from 'path';
import { query as dbQuery } from '../../db.js';
import {
    queue, setQueue,
    activeJobs,
    completedCount, setCompletedCount,
    failedCount, setFailedCount,
    skippedCount, setSkippedCount,
    setStopRequested,
    enqueue,
} from './queue.js';
import type { PipelineStatus, KBFolder, KBFile, IngestionStats } from '../types.js';

// =============================================================================
// FILE MANAGEMENT
// =============================================================================

/**
 * List all watched folders, ordered by creation date (newest first).
 *
 * @returns Array of {@link KBFolder} records
 */
export async function listFolders(): Promise<KBFolder[]> {
    const rows = await dbQuery('SELECT * FROM kb_folders ORDER BY created_at DESC');
    return rows as KBFolder[];
}

/**
 * List files with optional filters for folder, status, and domain.
 * Supports pagination via `limit` and `offset`.
 *
 * @param opts - Filter and pagination options
 * @param opts.folderId - Filter by folder UUID
 * @param opts.status - Filter by file processing status
 * @param opts.domain - Filter by knowledge graph domain
 * @param opts.limit - Maximum results to return (default 1000)
 * @param opts.offset - Number of results to skip (default 0)
 * @returns Array of {@link KBFile} records
 */
export async function listFiles(opts: {
    folderId?: string;
    status?: string;
    domain?: string;
    limit?: number;
    offset?: number;
}): Promise<KBFile[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 0;

    if (opts.folderId) {
        conditions.push(`folder_id = $${++paramIdx}`);
        params.push(opts.folderId);
    }
    if (opts.status) {
        conditions.push(`status = $${++paramIdx}`);
        params.push(opts.status);
    }
    if (opts.domain) {
        conditions.push(`domain = $${++paramIdx}`);
        params.push(opts.domain);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit || 1000;
    const offset = opts.offset || 0;

    const rows = await dbQuery(
        `SELECT * FROM kb_files ${where} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
        params
    );
    return rows as KBFile[];
}

/**
 * Get file details including all associated chunks, ordered by chunk index.
 *
 * @param fileId - UUID of the kb_files row
 * @returns Object with file metadata and chunks array, or `null` if not found
 */
export async function getFileDetail(fileId: string): Promise<{ file: KBFile; chunks: any[] } | null> {
    const files = await dbQuery('SELECT * FROM kb_files WHERE id = $1', [fileId]);
    if (!files || files.length === 0) return null;

    const chunks = await dbQuery(
        'SELECT * FROM kb_chunks WHERE file_id = $1 ORDER BY chunk_index',
        [fileId]
    );

    return { file: files[0] as KBFile, chunks };
}

/**
 * Reprocess a single file: archives old graph nodes, deletes old chunks,
 * resets the file status to 'pending', and re-enqueues with high priority.
 *
 * @param fileId - UUID of the kb_files row to reprocess
 * @throws If the file or its parent folder is not found in the database
 */
export async function reprocessFile(fileId: string): Promise<void> {
    const { archiveFileNodes } = await import('./file-processing.js');

    const files = await dbQuery('SELECT * FROM kb_files WHERE id = $1', [fileId]);
    if (!files || files.length === 0) throw new Error(`File not found: ${fileId}`);
    const file = files[0] as KBFile;

    // Get folder to resolve absolute path
    const folders = await dbQuery('SELECT * FROM kb_folders WHERE id = $1', [file.folder_id]);
    if (!folders || folders.length === 0) throw new Error(`Folder not found: ${file.folder_id}`);
    const folder = folders[0] as KBFolder;

    // Archive old nodes before deleting chunks
    await archiveFileNodes(fileId);

    // Delete old chunks
    await dbQuery(`DELETE FROM kb_chunks WHERE file_id = $1`, [fileId]);

    // Reset status
    await dbQuery(
        `UPDATE kb_files SET status = 'pending', error_message = NULL, chunk_count = 0, node_id = NULL, updated_at = datetime('now') WHERE id = $1`,
        [fileId]
    );

    // Resolve absolute path
    const absolutePath = path.resolve(folder.folder_path, file.file_path);

    enqueue({
        fileId: file.id,
        filePath: absolutePath,
        folderId: file.folder_id,
        domain: file.domain,
        extension: file.extension,
        priority: 1, // High priority for manual re-process
        rawMode: !!(folder as any).raw_mode,
    });
}

/**
 * Retry all files in 'error' status by resetting them to 'pending' and re-enqueuing.
 * Optionally scoped to a single folder.
 *
 * @param folderId - Optional folder UUID to scope the retry to
 * @returns Number of files re-queued
 */
export async function retryFailed(folderId?: string): Promise<number> {
    const condition = folderId ? `AND folder_id = $1` : '';
    const params = folderId ? [folderId] : [];

    const files = await dbQuery(
        `SELECT f.*, kf.folder_path, kf.raw_mode FROM kb_files f JOIN kb_folders kf ON f.folder_id = kf.id
         WHERE f.status = 'error' ${condition}`,
        params
    );

    let count = 0;
    for (const file of files as any[]) {
        await dbQuery(
            `UPDATE kb_files SET status = 'pending', error_message = NULL, updated_at = datetime('now') WHERE id = $1`,
            [file.id]
        );
        enqueue({
            fileId: file.id,
            filePath: path.resolve(file.folder_path, file.file_path),
            folderId: file.folder_id,
            domain: file.domain,
            extension: file.extension,
            priority: 0,
            rawMode: !!file.raw_mode,
        });
        count++;
    }
    return count;
}

/**
 * Reprocess ALL files in a folder: archives old nodes (including synthesis children),
 * deletes chunks, resets status, and re-enqueues every file for processing.
 *
 * @param folderId - UUID of the folder to reprocess
 * @returns Number of files queued for reprocessing
 */
export async function reprocessFolder(folderId: string): Promise<number> {
    const { archiveFileNodes } = await import('./file-processing.js');

    const folders = await dbQuery('SELECT * FROM kb_folders WHERE id = $1', [folderId]);
    if (!folders || folders.length === 0) throw new Error(`Folder not found: ${folderId}`);
    const folder = folders[0] as KBFolder;

    const files = await dbQuery(
        `SELECT * FROM kb_files WHERE folder_id = $1`,
        [folderId]
    );

    let count = 0;
    for (const file of files as any[]) {
        // Archive old nodes + synthesis children
        await archiveFileNodes(file.id);

        // Delete old chunks
        await dbQuery(`DELETE FROM kb_chunks WHERE file_id = $1`, [file.id]);

        // Reset status
        await dbQuery(
            `UPDATE kb_files SET status = 'pending', error_message = NULL, chunk_count = 0, node_id = NULL, updated_at = datetime('now') WHERE id = $1`,
            [file.id]
        );

        const absolutePath = path.resolve(folder.folder_path, file.file_path);
        enqueue({
            fileId: file.id,
            filePath: absolutePath,
            folderId,
            domain: file.domain,
            extension: file.extension,
            priority: 0,
            rawMode: !!(folder as any).raw_mode,
        });
        count++;
    }

    console.log(`[kb-pipeline] Reprocess folder: queued ${count} files from "${folder.folder_path}"`);
    return count;
}

// =============================================================================
// STATUS & STATS
// =============================================================================

/**
 * Get current pipeline status including queue depth, active jobs, and counters.
 *
 * @returns Current {@link PipelineStatus} snapshot
 */
export function getStatus(): PipelineStatus {
    return {
        running: activeJobs > 0 || queue.length > 0,
        queueLength: queue.length,
        activeJobs,
        completed: completedCount,
        failed: failedCount,
        skipped: skippedCount,
    };
}

/**
 * Get aggregate ingestion statistics: folder/file/chunk/node counts,
 * files grouped by status, and files grouped by reader plugin.
 *
 * @returns Aggregate {@link IngestionStats}
 */
export async function getStats(): Promise<IngestionStats> {
    const folderCount = await dbQuery('SELECT COUNT(*) as count FROM kb_folders');
    const fileCount = await dbQuery('SELECT COUNT(*) as count FROM kb_files');
    const statusCounts = await dbQuery(
        'SELECT status, COUNT(*) as count FROM kb_files GROUP BY status'
    );
    const readerCounts = await dbQuery(
        'SELECT reader_plugin, COUNT(*) as count FROM kb_files GROUP BY reader_plugin'
    );
    const chunkCount = await dbQuery('SELECT COUNT(*) as count FROM kb_chunks');
    const nodeCount = await dbQuery(
        'SELECT COUNT(DISTINCT node_id) as count FROM kb_chunks WHERE node_id IS NOT NULL'
    );

    return {
        totalFolders: (folderCount[0] as any)?.count || 0,
        totalFiles: (fileCount[0] as any)?.count || 0,
        filesByStatus: Object.fromEntries(
            (statusCounts as any[]).map(r => [r.status, r.count])
        ),
        filesByReader: Object.fromEntries(
            (readerCounts as any[]).map(r => [r.reader_plugin, r.count])
        ),
        totalChunks: (chunkCount[0] as any)?.count || 0,
        totalNodes: (nodeCount[0] as any)?.count || 0,
    };
}

/**
 * Stop the pipeline: clears the queue, signals in-progress jobs to abort,
 * and resets files/folders stuck in processing states.
 * The stop remains in effect until {@link resume} is called explicitly.
 *
 * @returns Object with `cleared` (queue items removed) and `reset` (processing files reset to pending)
 */
export async function stop(): Promise<{ cleared: number; reset: number }> {
    const cleared = queue.length;
    setQueue([]);
    setStopRequested(true);

    // Reset any files stuck in 'processing' back to pending
    const stuck = await dbQuery(
        `UPDATE kb_files SET status = 'pending', error_message = NULL, updated_at = datetime('now')
         WHERE status = 'processing'
         RETURNING id`
    );
    const reset = stuck?.length || 0;

    // Reset folders stuck in 'scanning'/'processing' back to 'idle'
    await dbQuery(
        `UPDATE kb_folders SET status = 'idle', updated_at = datetime('now')
         WHERE status IN ('scanning', 'processing')`
    );

    console.log(`[kb-pipeline] Stopped: cleared ${cleared} queued, reset ${reset} processing → pending`);

    // stopRequested stays true until explicitly resumed via resume()
    // The old setTimeout auto-reset was dangerous during project switches —
    // it would re-enable processing 2s later, writing old-project jobs into the new DB.

    return { cleared, reset };
}

/**
 * Resume pipeline processing after a stop.
 * Clears the `stopRequested` flag so the queue worker will process new jobs.
 * Does not re-enqueue previously cleared jobs -- only future enqueues and scans
 * will produce new work. Called when restarting services for a new project.
 */
export function resume(): void {
    setStopRequested(false);
}

/**
 * Zero all pipeline progress counters (completed, failed, skipped).
 * Called on project switch to give the new project a clean baseline
 * for its pipeline status display.
 */
export function resetCounters(): void {
    setCompletedCount(0);
    setFailedCount(0);
    setSkippedCount(0);
}

/**
 * Recover files stuck in 'processing' state (e.g. from a server restart mid-processing).
 * Resets them to 'pending' so they get re-queued on the next scan.
 * Also resets folders stuck in 'scanning'/'processing' back to 'idle'.
 *
 * @returns Number of files recovered (reset from 'processing' to 'pending')
 */
export async function recoverStuckFiles(): Promise<number> {
    const stuck = await dbQuery(
        `UPDATE kb_files SET status = 'pending', error_message = NULL, updated_at = datetime('now')
         WHERE status = 'processing'
         RETURNING id`
    );
    const count = stuck?.length || 0;
    if (count > 0) {
        console.log(`[kb-pipeline] Recovered ${count} files stuck in 'processing' state`);
    }

    // Also reset folders stuck in 'scanning'/'processing' — these can't be
    // in-progress if we just started up, so set back to 'idle'
    const stuckFolders = await dbQuery(
        `UPDATE kb_folders SET status = 'idle', updated_at = datetime('now')
         WHERE status IN ('scanning', 'processing')
         RETURNING id`
    );
    if (stuckFolders?.length) {
        console.log(`[kb-pipeline] Recovered ${stuckFolders.length} folders stuck in scanning/processing state`);
    }

    return count;
}

/**
 * Re-queue all files in 'pending' or 'error' status into the in-memory pipeline.
 * Called at startup so that pending work (from recovery or incomplete prior runs)
 * is automatically processed without requiring a manual scan.
 *
 * @returns Number of files enqueued
 */
export async function requeuePendingFiles(): Promise<number> {
    const pending = await dbQuery(
        `SELECT f.id as file_id, f.file_path, f.folder_id, f.domain, f.extension,
                fo.folder_path, fo.raw_mode
         FROM kb_files f
         JOIN kb_folders fo ON fo.id = f.folder_id
         WHERE f.status IN ('pending', 'error')
         ORDER BY f.created_at ASC`
    );
    if (!pending || pending.length === 0) return 0;

    // Reset error files back to pending before re-queuing
    await dbQuery(
        `UPDATE kb_files SET status = 'pending', error_message = NULL, updated_at = datetime('now')
         WHERE status = 'error'`
    );

    for (const row of pending) {
        const r = row as any;
        enqueue({
            fileId: r.file_id,
            filePath: path.join(r.folder_path, r.file_path),
            folderId: r.folder_id,
            domain: r.domain,
            extension: r.extension,
            priority: 0,
            rawMode: !!r.raw_mode,
        });
    }
    return pending.length;
}

/**
 * Backfill filename-derived keywords for existing KB nodes that are missing them.
 * Runs once at startup. Finds nodes with KB source metadata but no 'rule'-source
 * keywords, then inserts keywords derived from the file name (stem, parts, extension).
 * Limited to 500 nodes per invocation to avoid long-running queries.
 *
 * @returns Number of nodes that had keywords backfilled
 */
export async function backfillFilenameKeywords(): Promise<number> {
    try {
        // Find KB nodes without rule-source keywords
        const rows = await dbQuery(
            `SELECT n.id, n.metadata FROM nodes n
             WHERE n.archived = 0
               AND n.metadata IS NOT NULL
               AND json_extract(n.metadata, '$.source.fileName') IS NOT NULL
               AND n.id NOT IN (SELECT node_id FROM node_keywords WHERE source = 'rule')
             LIMIT 500`
        );
        if (!rows?.length) return 0;

        let count = 0;
        for (const row of rows as any[]) {
            try {
                const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
                const fileName = meta?.source?.fileName;
                if (!fileName) continue;

                const ext = path.extname(fileName).replace('.', '');
                const stem = path.basename(fileName, path.extname(fileName));
                const keywords = new Set<string>();
                keywords.add(fileName.toLowerCase());
                keywords.add(stem.toLowerCase());
                for (const part of stem.split(/[-_.]+/).filter((p: string) => p.length >= 2)) {
                    keywords.add(part.toLowerCase());
                }
                for (const part of stem.split(/(?<=[a-z])(?=[A-Z])/).filter((p: string) => p.length >= 2)) {
                    keywords.add(part.toLowerCase());
                }
                if (ext) keywords.add(ext.toLowerCase());

                for (const kw of keywords) {
                    await dbQuery(
                        `INSERT INTO node_keywords (node_id, keyword, source) VALUES ($1, $2, 'rule') ON CONFLICT DO NOTHING`,
                        [row.id, kw]
                    ).catch(() => {});
                }
                count++;
            } catch { /* skip bad rows */ }
        }
        if (count > 0) console.log(`[kb-pipeline] Backfilled filename keywords for ${count} existing nodes`);
        return count;
    } catch (err: any) {
        console.error(`[kb-pipeline] Filename keyword backfill failed: ${err.message}`);
        return 0;
    }
}
