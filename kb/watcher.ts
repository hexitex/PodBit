/**
 * KNOWLEDGE BASE - FOLDER WATCHER
 *
 * Cross-platform real-time file watching using chokidar.
 * Supports local and network folders with polling fallback.
 * Queues new/changed files for processing via the pipeline.
 */

import chokidar from 'chokidar';
import path from 'path';
import { RC } from '../config/constants.js';
import { config } from '../config.js';
import { query as dbQuery } from '../db.js';
import { normalizePath, resolveDomain } from './scanner.js';
import { getReaderForExtension } from './readers/registry.js';
import { hashFile } from './hasher.js';
import type { KBFolder } from './types.js';

// =============================================================================
// WATCHER STATE
// =============================================================================

interface WatcherInstance {
    folderId: string;
    path: string;
    domain: string;
    recursive: boolean;
    autoDomainSubfolders: boolean;
    rawMode: boolean;
    watcher: ReturnType<typeof chokidar.watch>;
}

const watchers = new Map<string, WatcherInstance>();

// Default directories to ignore
const IGNORED_DIRS = [
    '**/node_modules/**', '**/.git/**', '**/__pycache__/**',
    '**/.venv/**', '**/venv/**', '**/.tox/**',
    '**/.idea/**', '**/.vscode/**', '**/dist/**', '**/build/**',
    '**/.next/**', '**/.nuxt/**', '**/coverage/**', '**/.cache/**',
    '**/.DS_Store', '**/Thumbs.db',
    '**/logs/**', '**/backups/**', '**/*.log',
];

// =============================================================================
// START / STOP
// =============================================================================

/**
 * Start watching a specific folder for file changes.
 * Stops any existing watcher for the same folder before starting a new one.
 * On error, automatically attempts to restart after a 10-second backoff.
 *
 * @param folderId - UUID of the kb_folders row to watch
 * @returns Success status and descriptive message
 */
export async function startWatcher(folderId: string): Promise<{ success: boolean; message: string }> {
    // Stop existing watcher for this folder if any
    if (watchers.has(folderId)) {
        await stopWatcher(folderId);
    }

    // Load folder config
    const folders = await dbQuery('SELECT * FROM kb_folders WHERE id = $1', [folderId]);
    if (!folders || folders.length === 0) {
        return { success: false, message: `Folder not found: ${folderId}` };
    }
    const f = folders[0] as KBFolder;

    if (!f.watch_enabled) {
        return { success: false, message: `Watching is disabled for this folder` };
    }

    // Ensure readers are registered
    await import('./readers/index.js');

    // Build ignore patterns
    const ignorePatterns = [...IGNORED_DIRS];
    if (f.exclude_patterns) {
        try {
            const excludes = JSON.parse(f.exclude_patterns as any);
            if (Array.isArray(excludes)) ignorePatterns.push(...excludes);
        } catch {}
    }

    const watchPath = path.resolve(f.folder_path);
    const pollInterval = config.knowledgeBase?.watcherPollInterval || 1000;
    const awaitWriteFinish = config.knowledgeBase?.awaitWriteFinish || 2000;

    const watcher = chokidar.watch(watchPath, {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: true, // Don't fire for existing files (scan handles that)
        depth: f.recursive ? undefined : 0,
        awaitWriteFinish: {
            stabilityThreshold: awaitWriteFinish,
            pollInterval: 100,
        },
        // Use polling for network folders (auto-detected via usePolling or explicit)
        usePolling: false,
        interval: pollInterval,
    });

    const instance: WatcherInstance = {
        folderId,
        path: watchPath,
        domain: f.domain,
        recursive: Boolean(f.recursive),
        autoDomainSubfolders: Boolean(f.auto_domain_subfolders),
        rawMode: Boolean(f.raw_mode),
        watcher,
    };

    watcher.on('add', (filePath: string) => handleFileEvent('add', filePath, instance));
    watcher.on('change', (filePath: string) => handleFileEvent('change', filePath, instance));
    watcher.on('unlink', (filePath: string) => handleFileRemove(filePath, instance));

    watcher.on('error', async (error: any) => {
        console.error(`[kb-watcher] Error for ${f.folder_path}: ${error?.message ?? error}`);
        await dbQuery(
            `UPDATE kb_folders SET status = 'error', error_message = $2, updated_at = datetime('now') WHERE id = $1`,
            [folderId, (error?.message ?? String(error)).slice(0, 500)]
        ).catch(() => {});

        // Auto-restart after error with backoff
        watchers.delete(folderId);
        setTimeout(async () => {
            try {
                console.log(`[kb-watcher] Auto-restarting watcher for ${f.folder_path}...`);
                await startWatcher(folderId);
            } catch (e: any) {
                console.error(`[kb-watcher] Failed to restart watcher for ${f.folder_path}: ${e.message}`);
            }
        }, RC.timeouts.watcherRestartBackoffMs);
    });

    watcher.on('ready', async () => {
        console.error(`[kb-watcher] Watching: ${f.folder_path} → domain:${f.domain}`);
        await dbQuery(
            `UPDATE kb_folders SET status = 'watching', error_message = NULL, updated_at = datetime('now') WHERE id = $1`,
            [folderId]
        ).catch(() => {});
    });

    watchers.set(folderId, instance);
    return { success: true, message: `Watcher started for ${f.folder_path}` };
}

/**
 * Stop watching a specific folder and set its status back to 'idle'.
 *
 * @param folderId - UUID of the kb_folders row to stop watching
 * @returns Success status and descriptive message
 */
export async function stopWatcher(folderId: string): Promise<{ success: boolean; message: string }> {
    const instance = watchers.get(folderId);
    if (!instance) {
        return { success: false, message: `No active watcher for folder: ${folderId}` };
    }

    await instance.watcher.close();
    watchers.delete(folderId);

    await dbQuery(
        `UPDATE kb_folders SET status = 'idle', updated_at = datetime('now') WHERE id = $1`,
        [folderId]
    ).catch(() => {});

    return { success: true, message: `Watcher stopped for ${instance.path}` };
}

/**
 * Start watchers for all folders with watch_enabled = true.
 * Called on server startup.
 *
 * @returns The number of watchers successfully started
 */
export async function startAllWatchers(): Promise<number> {
    const folders = await dbQuery(
        `SELECT id FROM kb_folders WHERE watch_enabled = 1`
    );

    let started = 0;
    for (const folder of folders as any[]) {
        try {
            const result = await startWatcher(folder.id);
            if (result.success) started++;
        } catch (err: any) {
            console.error(`[kb-watcher] Failed to start watcher for ${folder.id}: ${err.message}`);
        }
    }

    return started;
}

/**
 * Stop all active folder watchers, closing their chokidar instances
 * and resetting each folder's status to 'idle'. Called during server
 * shutdown and project switches.
 */
export async function stopAllWatchers(): Promise<void> {
    for (const folderId of [...watchers.keys()]) {
        await stopWatcher(folderId);
    }
}

/**
 * Return the number of currently active chokidar folder watchers.
 * Used by status endpoints and health checks to report watcher state.
 */
export function getActiveWatcherCount(): number {
    return watchers.size;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Handle a file add or change event from chokidar.
 * Computes content hash to detect actual changes, then either inserts a new
 * kb_files record or updates the existing one and enqueues for processing.
 *
 * @param event - The type of file event ('add' or 'change')
 * @param filePath - Absolute path to the affected file
 * @param instance - The watcher instance that fired the event
 */
async function handleFileEvent(
    event: 'add' | 'change',
    filePath: string,
    instance: WatcherInstance,
): Promise<void> {
    try {
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
        if (!ext) return;

        // Skip dotfiles
        if (path.basename(filePath).startsWith('.')) return;

        // Skip non-content file types (same list as scanner.ts)
        if (['log', 'lock', 'db', 'db-shm', 'db-wal'].includes(ext)) return;

        // Check if reader exists
        const reader = getReaderForExtension(ext);
        if (!reader) return;

        // Check file size
        const { statSync } = await import('fs');
        const stat = statSync(filePath);
        const skipLargeFiles = config.knowledgeBase?.skipLargeFiles || 0;
        if (skipLargeFiles > 0 && stat.size > skipLargeFiles) return;
        if (stat.size === 0) return;

        const relativePath = normalizePath(path.relative(instance.path, filePath));
        const domain = resolveDomain(instance.domain, relativePath, instance.autoDomainSubfolders);
        const contentHash = await hashFile(filePath);

        // Check if unchanged
        const existing = await dbQuery(
            `SELECT id, content_hash, status FROM kb_files WHERE folder_id = $1 AND file_path = $2`,
            [instance.folderId, relativePath]
        );

        if (existing && existing.length > 0) {
            const ex = existing[0] as any;
            if (ex.content_hash === contentHash && ex.status === 'completed') return;

            // File changed — update and re-queue
            await dbQuery(
                `UPDATE kb_files SET content_hash = $2, file_size = $3, modified_at = $4, status = 'pending',
                 error_message = NULL, updated_at = datetime('now') WHERE id = $1`,
                [ex.id, contentHash, stat.size, stat.mtime.toISOString()]
            );
            await dbQuery(`DELETE FROM kb_chunks WHERE file_id = $1`, [ex.id]);

            const { processingPipeline } = await import('./pipeline.js');
            processingPipeline.enqueue({
                fileId: ex.id,
                filePath,
                folderId: instance.folderId,
                domain,
                extension: ext,
                priority: 0,
                rawMode: instance.rawMode,
            });
        } else {
            // New file
            const result = await dbQuery(
                `INSERT INTO kb_files (folder_id, file_path, file_name, extension, file_size, modified_at, content_hash, reader_plugin, domain, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING id`,
                [instance.folderId, relativePath, path.basename(filePath), ext, stat.size,
                 stat.mtime.toISOString(), contentHash, reader.id, domain]
            );

            if (result && result.length > 0) {
                const { processingPipeline } = await import('./pipeline.js');
                processingPipeline.enqueue({
                    fileId: (result[0] as any).id,
                    filePath,
                    folderId: instance.folderId,
                    domain,
                    extension: ext,
                    priority: 0,
                    rawMode: instance.rawMode,
                });
            }
        }
    } catch (err: any) {
        console.error(`[kb-watcher] Error handling ${event} for ${filePath}: ${err.message}`);
    }
}

/**
 * Handle a file deletion event from chokidar.
 * Marks the file as 'skipped' in the database rather than deleting the record,
 * preserving an audit trail.
 *
 * @param filePath - Absolute path to the deleted file
 * @param instance - The watcher instance that fired the event
 */
async function handleFileRemove(filePath: string, instance: WatcherInstance): Promise<void> {
    try {
        const relativePath = normalizePath(path.relative(instance.path, filePath));

        // Mark file as removed (don't delete the record — keep for audit)
        await dbQuery(
            `UPDATE kb_files SET status = 'skipped', error_message = 'File deleted from disk', updated_at = datetime('now')
             WHERE folder_id = $1 AND file_path = $2`,
            [instance.folderId, relativePath]
        );
    } catch (err: any) {
        console.error(`[kb-watcher] Error handling unlink for ${filePath}: ${err.message}`);
    }
}
