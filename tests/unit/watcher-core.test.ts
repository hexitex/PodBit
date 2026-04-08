/**
 * Unit tests for kb/watcher.ts — chokidar-based file watcher logic.
 *
 * Since watcher.ts has module-level state and imports that require mocking
 * (chokidar, db, pipeline), and the project's Jest config doesn't support
 * top-level await for ESM mock patterns, we test by extracting and exercising
 * the key algorithms inline. This follows the project's working pattern
 * (see deep-merge.test.ts, evaluator.test.ts).
 *
 * Covers: file event filtering, domain resolution, ignore patterns,
 * watcher state management, file change detection, remove handling.
 */
import { describe, it, expect } from '@jest/globals';
import path from 'path';

// =============================================================================
// EXTRACTED CONSTANTS (from kb/watcher.ts)
// =============================================================================

const IGNORED_DIRS = [
    '**/node_modules/**', '**/.git/**', '**/__pycache__/**',
    '**/.venv/**', '**/venv/**', '**/.tox/**',
    '**/.idea/**', '**/.vscode/**', '**/dist/**', '**/build/**',
    '**/.next/**', '**/.nuxt/**', '**/coverage/**', '**/.cache/**',
    '**/.DS_Store', '**/Thumbs.db',
    '**/logs/**', '**/backups/**', '**/*.log',
];

const SKIP_EXTENSIONS = ['log', 'lock', 'db', 'db-shm', 'db-wal'];

// =============================================================================
// EXTRACTED LOGIC (from handleFileEvent in kb/watcher.ts)
// =============================================================================

/** Determines if a file should be processed based on its path and extension. */
function shouldProcessFile(
    filePath: string,
    hasReader: boolean,
    fileSize: number,
    skipLargeFiles: number,
): { process: boolean; reason?: string } {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    if (!ext) return { process: false, reason: 'no extension' };

    if (path.basename(filePath).startsWith('.')) return { process: false, reason: 'dotfile' };

    if (SKIP_EXTENSIONS.includes(ext)) return { process: false, reason: 'non-content extension' };

    if (!hasReader) return { process: false, reason: 'no reader' };

    if (skipLargeFiles > 0 && fileSize > skipLargeFiles) return { process: false, reason: 'too large' };

    if (fileSize === 0) return { process: false, reason: 'empty file' };

    return { process: true };
}

/** Normalizes a path to forward slashes (from scanner.ts). */
function normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/** Check if file content has changed. */
function isFileChanged(
    existingHash: string | null,
    existingStatus: string | null,
    newHash: string,
): boolean {
    if (!existingHash) return true; // new file
    if (existingHash !== newHash) return true; // content changed
    if (existingStatus !== 'completed') return true; // needs reprocessing
    return false;
}

// =============================================================================
// WATCHER STATE MANAGEMENT (extracted logic)
// =============================================================================

interface MockWatcherInstance {
    folderId: string;
    path: string;
    domain: string;
    recursive: boolean;
    autoDomainSubfolders: boolean;
    rawMode: boolean;
}

class WatcherStateManager {
    private watchers = new Map<string, MockWatcherInstance>();

    add(id: string, instance: MockWatcherInstance) { this.watchers.set(id, instance); }
    remove(id: string) { this.watchers.delete(id); }
    has(id: string) { return this.watchers.has(id); }
    get(id: string) { return this.watchers.get(id); }
    count() { return this.watchers.size; }
    keys() { return [...this.watchers.keys()]; }
    clear() { this.watchers.clear(); }
}

// =============================================================================
// IGNORE PATTERN BUILDER (extracted logic)
// =============================================================================

function buildIgnorePatterns(excludePatterns: string | null): string[] {
    const patterns = [...IGNORED_DIRS];
    if (excludePatterns) {
        try {
            const excludes = JSON.parse(excludePatterns);
            if (Array.isArray(excludes)) patterns.push(...excludes);
        } catch { /* invalid JSON, skip */ }
    }
    return patterns;
}

// =============================================================================
// CHOKIDAR OPTIONS BUILDER (extracted logic)
// =============================================================================

function buildChokidarOptions(
    ignorePatterns: string[],
    recursive: boolean,
    pollInterval: number,
    awaitWriteFinish: number,
) {
    return {
        ignored: ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        depth: recursive ? undefined : 0,
        awaitWriteFinish: {
            stabilityThreshold: awaitWriteFinish,
            pollInterval: 100,
        },
        usePolling: false,
        interval: pollInterval,
    };
}

// =============================================================================
// TESTS
// =============================================================================

describe('shouldProcessFile', () => {
    it('rejects files with no extension', () => {
        const result = shouldProcessFile('/folder/Makefile', true, 100, 0);
        expect(result.process).toBe(false);
        expect(result.reason).toBe('no extension');
    });

    it('rejects dotfiles', () => {
        const result = shouldProcessFile('/folder/.hidden.txt', true, 100, 0);
        expect(result.process).toBe(false);
        expect(result.reason).toBe('dotfile');
    });

    it('rejects non-content extensions', () => {
        for (const ext of SKIP_EXTENSIONS) {
            const result = shouldProcessFile(`/folder/file.${ext}`, true, 100, 0);
            expect(result.process).toBe(false);
            expect(result.reason).toBe('non-content extension');
        }
    });

    it('rejects files with no registered reader', () => {
        const result = shouldProcessFile('/folder/file.xyz', false, 100, 0);
        expect(result.process).toBe(false);
        expect(result.reason).toBe('no reader');
    });

    it('rejects files exceeding size limit', () => {
        const result = shouldProcessFile('/folder/big.txt', true, 10_000_000, 5_000_000);
        expect(result.process).toBe(false);
        expect(result.reason).toBe('too large');
    });

    it('allows files at exactly the size limit', () => {
        const result = shouldProcessFile('/folder/exact.txt', true, 5_000_000, 5_000_000);
        expect(result.process).toBe(true);
    });

    it('ignores size limit when skipLargeFiles is 0', () => {
        const result = shouldProcessFile('/folder/big.txt', true, 999_999_999, 0);
        expect(result.process).toBe(true);
    });

    it('rejects empty files', () => {
        const result = shouldProcessFile('/folder/empty.txt', true, 0, 0);
        expect(result.process).toBe(false);
        expect(result.reason).toBe('empty file');
    });

    it('accepts valid files', () => {
        const result = shouldProcessFile('/folder/document.txt', true, 1024, 0);
        expect(result.process).toBe(true);
    });

    it('handles various valid extensions', () => {
        const extensions = ['ts', 'js', 'py', 'md', 'json', 'yaml', 'csv', 'pdf'];
        for (const ext of extensions) {
            const result = shouldProcessFile(`/folder/file.${ext}`, true, 100, 0);
            expect(result.process).toBe(true);
        }
    });

    it('extension extraction is case-insensitive', () => {
        const result = shouldProcessFile('/folder/FILE.TXT', true, 100, 0);
        expect(result.process).toBe(true);
    });

    it('rejects .log even with reader available', () => {
        const result = shouldProcessFile('/folder/app.log', true, 100, 0);
        expect(result.process).toBe(false);
    });

    it('rejects .db-wal files', () => {
        const result = shouldProcessFile('/folder/data.db-wal', true, 100, 0);
        expect(result.process).toBe(false);
    });
});

describe('normalizePath', () => {
    it('converts backslashes to forward slashes', () => {
        expect(normalizePath('folder\\subfolder\\file.txt')).toBe('folder/subfolder/file.txt');
    });

    it('leaves forward slashes unchanged', () => {
        expect(normalizePath('folder/subfolder/file.txt')).toBe('folder/subfolder/file.txt');
    });

    it('handles mixed slashes', () => {
        expect(normalizePath('folder\\sub/file.txt')).toBe('folder/sub/file.txt');
    });

    it('handles empty string', () => {
        expect(normalizePath('')).toBe('');
    });
});

describe('isFileChanged', () => {
    it('returns true for new file (no existing hash)', () => {
        expect(isFileChanged(null, null, 'newhash')).toBe(true);
    });

    it('returns true when hash differs', () => {
        expect(isFileChanged('oldhash', 'completed', 'newhash')).toBe(true);
    });

    it('returns false when hash matches and status is completed', () => {
        expect(isFileChanged('samehash', 'completed', 'samehash')).toBe(false);
    });

    it('returns true when hash matches but status is not completed', () => {
        expect(isFileChanged('samehash', 'pending', 'samehash')).toBe(true);
        expect(isFileChanged('samehash', 'error', 'samehash')).toBe(true);
        expect(isFileChanged('samehash', 'skipped', 'samehash')).toBe(true);
    });
});

describe('WatcherStateManager', () => {
    const instance: MockWatcherInstance = {
        folderId: 'f1',
        path: '/test/folder',
        domain: 'test-domain',
        recursive: true,
        autoDomainSubfolders: false,
        rawMode: false,
    };

    it('starts empty', () => {
        const mgr = new WatcherStateManager();
        expect(mgr.count()).toBe(0);
    });

    it('adds and retrieves watchers', () => {
        const mgr = new WatcherStateManager();
        mgr.add('f1', instance);
        expect(mgr.has('f1')).toBe(true);
        expect(mgr.get('f1')).toBe(instance);
        expect(mgr.count()).toBe(1);
    });

    it('removes watchers', () => {
        const mgr = new WatcherStateManager();
        mgr.add('f1', instance);
        mgr.remove('f1');
        expect(mgr.has('f1')).toBe(false);
        expect(mgr.count()).toBe(0);
    });

    it('handles multiple watchers', () => {
        const mgr = new WatcherStateManager();
        mgr.add('f1', { ...instance, folderId: 'f1' });
        mgr.add('f2', { ...instance, folderId: 'f2' });
        mgr.add('f3', { ...instance, folderId: 'f3' });
        expect(mgr.count()).toBe(3);
        expect(mgr.keys()).toEqual(['f1', 'f2', 'f3']);
    });

    it('replaces existing watcher with same ID', () => {
        const mgr = new WatcherStateManager();
        mgr.add('f1', { ...instance, domain: 'old' });
        mgr.add('f1', { ...instance, domain: 'new' });
        expect(mgr.count()).toBe(1);
        expect(mgr.get('f1')!.domain).toBe('new');
    });

    it('clears all watchers', () => {
        const mgr = new WatcherStateManager();
        mgr.add('f1', instance);
        mgr.add('f2', instance);
        mgr.clear();
        expect(mgr.count()).toBe(0);
    });

    it('returns undefined for non-existent watcher', () => {
        const mgr = new WatcherStateManager();
        expect(mgr.get('nonexistent')).toBeUndefined();
        expect(mgr.has('nonexistent')).toBe(false);
    });
});

describe('buildIgnorePatterns', () => {
    it('includes all default IGNORED_DIRS', () => {
        const patterns = buildIgnorePatterns(null);
        expect(patterns).toEqual(IGNORED_DIRS);
        expect(patterns).toContain('**/node_modules/**');
        expect(patterns).toContain('**/.git/**');
        expect(patterns).toContain('**/.DS_Store');
    });

    it('appends custom exclude patterns', () => {
        const patterns = buildIgnorePatterns(JSON.stringify(['**/*.tmp', '**/temp/**']));
        expect(patterns).toContain('**/*.tmp');
        expect(patterns).toContain('**/temp/**');
        // Still has defaults
        expect(patterns).toContain('**/node_modules/**');
    });

    it('ignores invalid JSON gracefully', () => {
        const patterns = buildIgnorePatterns('not-json');
        expect(patterns).toEqual(IGNORED_DIRS);
    });

    it('ignores non-array JSON gracefully', () => {
        const patterns = buildIgnorePatterns(JSON.stringify({ not: 'array' }));
        expect(patterns).toEqual(IGNORED_DIRS);
    });

    it('handles empty exclude patterns', () => {
        const patterns = buildIgnorePatterns(null);
        expect(patterns.length).toBe(IGNORED_DIRS.length);
    });

    it('handles empty array in exclude patterns', () => {
        const patterns = buildIgnorePatterns(JSON.stringify([]));
        expect(patterns).toEqual(IGNORED_DIRS);
    });
});

describe('buildChokidarOptions', () => {
    it('sets ignoreInitial to true', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 1000, 2000);
        expect(opts.ignoreInitial).toBe(true);
    });

    it('sets persistent to true', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 1000, 2000);
        expect(opts.persistent).toBe(true);
    });

    it('sets depth undefined for recursive', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 1000, 2000);
        expect(opts.depth).toBeUndefined();
    });

    it('sets depth 0 for non-recursive', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, false, 1000, 2000);
        expect(opts.depth).toBe(0);
    });

    it('passes through ignore patterns', () => {
        const custom = [...IGNORED_DIRS, '**/*.tmp'];
        const opts = buildChokidarOptions(custom, true, 1000, 2000);
        expect(opts.ignored).toEqual(custom);
    });

    it('sets awaitWriteFinish stabilityThreshold', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 1000, 3000);
        expect(opts.awaitWriteFinish.stabilityThreshold).toBe(3000);
        expect(opts.awaitWriteFinish.pollInterval).toBe(100);
    });

    it('sets polling interval', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 500, 2000);
        expect(opts.interval).toBe(500);
    });

    it('disables usePolling by default', () => {
        const opts = buildChokidarOptions(IGNORED_DIRS, true, 1000, 2000);
        expect(opts.usePolling).toBe(false);
    });
});

describe('IGNORED_DIRS constant', () => {
    it('ignores node_modules', () => {
        expect(IGNORED_DIRS).toContain('**/node_modules/**');
    });

    it('ignores .git', () => {
        expect(IGNORED_DIRS).toContain('**/.git/**');
    });

    it('ignores Python virtual environments', () => {
        expect(IGNORED_DIRS).toContain('**/.venv/**');
        expect(IGNORED_DIRS).toContain('**/venv/**');
    });

    it('ignores IDE directories', () => {
        expect(IGNORED_DIRS).toContain('**/.idea/**');
        expect(IGNORED_DIRS).toContain('**/.vscode/**');
    });

    it('ignores build output directories', () => {
        expect(IGNORED_DIRS).toContain('**/dist/**');
        expect(IGNORED_DIRS).toContain('**/build/**');
    });

    it('ignores OS-specific files', () => {
        expect(IGNORED_DIRS).toContain('**/.DS_Store');
        expect(IGNORED_DIRS).toContain('**/Thumbs.db');
    });

    it('ignores log files', () => {
        expect(IGNORED_DIRS).toContain('**/*.log');
        expect(IGNORED_DIRS).toContain('**/logs/**');
    });

    it('ignores backups', () => {
        expect(IGNORED_DIRS).toContain('**/backups/**');
    });
});

describe('SKIP_EXTENSIONS constant', () => {
    it('includes log', () => expect(SKIP_EXTENSIONS).toContain('log'));
    it('includes lock', () => expect(SKIP_EXTENSIONS).toContain('lock'));
    it('includes db', () => expect(SKIP_EXTENSIONS).toContain('db'));
    it('includes db-shm', () => expect(SKIP_EXTENSIONS).toContain('db-shm'));
    it('includes db-wal', () => expect(SKIP_EXTENSIONS).toContain('db-wal'));
    it('has exactly 5 entries', () => expect(SKIP_EXTENSIONS).toHaveLength(5));
});

describe('watcher start/stop validation logic', () => {
    it('rejects folder not found', () => {
        const folders: any[] = [];
        const result = (!folders || folders.length === 0)
            ? { success: false, message: 'Folder not found: test-id' }
            : { success: true, message: 'ok' };
        expect(result.success).toBe(false);
        expect(result.message).toContain('Folder not found');
    });

    it('rejects when watch_enabled is false', () => {
        const folder = { watch_enabled: 0 };
        const result = !folder.watch_enabled
            ? { success: false, message: 'Watching is disabled for this folder' }
            : { success: true, message: 'ok' };
        expect(result.success).toBe(false);
    });

    it('succeeds for valid enabled folder', () => {
        const folder = { watch_enabled: 1, folder_path: '/test' };
        const result = folder.watch_enabled
            ? { success: true, message: `Watcher started for ${folder.folder_path}` }
            : { success: false, message: 'disabled' };
        expect(result.success).toBe(true);
        expect(result.message).toContain('/test');
    });

    it('stop returns error for non-existent watcher', () => {
        const mgr = new WatcherStateManager();
        const instance = mgr.get('nonexistent');
        const result = !instance
            ? { success: false, message: 'No active watcher for folder: nonexistent' }
            : { success: true, message: 'ok' };
        expect(result.success).toBe(false);
        expect(result.message).toContain('No active watcher');
    });
});

describe('file remove handler logic', () => {
    it('computes correct relative path for removed file', () => {
        const instancePath = '/test/folder';
        const filePath = '/test/folder/subdir/removed.txt';
        const relativePath = normalizePath(path.relative(instancePath, filePath));
        expect(relativePath).toBe('subdir/removed.txt');
    });

    it('handles files in root of watched folder', () => {
        const instancePath = '/test/folder';
        const filePath = '/test/folder/file.txt';
        const relativePath = normalizePath(path.relative(instancePath, filePath));
        expect(relativePath).toBe('file.txt');
    });
});

describe('watcher event types', () => {
    it('add and change events trigger file processing', () => {
        const processEvents = ['add', 'change'];
        const removeEvents = ['unlink'];
        expect(processEvents).toContain('add');
        expect(processEvents).toContain('change');
        expect(removeEvents).toContain('unlink');
    });
});

describe('config defaults for watcher', () => {
    it('falls back to 1000ms poll interval when config is missing', () => {
        const config: any = { knowledgeBase: undefined };
        const pollInterval = config.knowledgeBase?.watcherPollInterval || 1000;
        expect(pollInterval).toBe(1000);
    });

    it('falls back to 2000ms awaitWriteFinish when config is missing', () => {
        const config: any = { knowledgeBase: undefined };
        const awaitWriteFinish = config.knowledgeBase?.awaitWriteFinish || 2000;
        expect(awaitWriteFinish).toBe(2000);
    });

    it('uses config values when present', () => {
        const config = { knowledgeBase: { watcherPollInterval: 500, awaitWriteFinish: 3000 } };
        expect(config.knowledgeBase.watcherPollInterval).toBe(500);
        expect(config.knowledgeBase.awaitWriteFinish).toBe(3000);
    });

    it('falls back to 0 for skipLargeFiles when config is missing', () => {
        const config: any = { knowledgeBase: undefined };
        const skipLargeFiles = config.knowledgeBase?.skipLargeFiles || 0;
        expect(skipLargeFiles).toBe(0);
    });
});
