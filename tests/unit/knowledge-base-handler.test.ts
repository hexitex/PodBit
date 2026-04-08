/**
 * Unit tests for handlers/knowledge-base.ts — handleKnowledgeBase dispatch.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// processingPipeline mock
const mockListFolders = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockAddFolder = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'folder-1' });
const mockRemoveFolder = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateFolder = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockScanAndQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ queued: 0, skipped: 0 });
const mockGetStatus = jest.fn<() => any>().mockReturnValue({ running: false, queued: 0 });
const mockListFiles = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetFileDetail = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockReprocessFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRetryFailed = jest.fn<() => Promise<number>>().mockResolvedValue(0);
const mockGetStats = jest.fn<() => Promise<any>>().mockResolvedValue({ totalFiles: 0, totalChunks: 0 });
const mockStop = jest.fn<() => Promise<any>>().mockResolvedValue({ stopped: true });

const mockResume = jest.fn<() => void>();

const mockPipeline = {
    listFolders: mockListFolders,
    addFolder: mockAddFolder,
    removeFolder: mockRemoveFolder,
    updateFolder: mockUpdateFolder,
    scanAndQueue: mockScanAndQueue,
    getStatus: mockGetStatus,
    listFiles: mockListFiles,
    getFileDetail: mockGetFileDetail,
    reprocessFile: mockReprocessFile,
    retryFailed: mockRetryFailed,
    getStats: mockGetStats,
    stop: mockStop,
    resume: mockResume,
};

// Reader registry mocks
const mockGetAllReaders = jest.fn<() => any[]>().mockReturnValue([]);
const mockGetSupportedExtensions = jest.fn<() => string[]>().mockReturnValue([]);
const mockGetCustomMappings = jest.fn<() => any[]>().mockReturnValue([]);
const mockGetReaderForExtension = jest.fn<() => any>().mockReturnValue(null);
const mockMapExtensionToReader = jest.fn<() => boolean>().mockReturnValue(true);
const mockUnmapExtension = jest.fn<() => void>();

// KB readers index mock (just needs readersReady)
const readersReady = Promise.resolve();

// config mock
const mockConfig = {
    knowledgeBase: {
        defaultExcludePatterns: ['*.log'],
        skipLargeFiles: 10000000,
        maxChunkSize: 4000,
        minChunkLength: 50,
        curationMaxTokens: 2000,
    },
};

// db mock
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

// fs mock
const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(true);
const mockStatSync = jest.fn<(p: string) => any>().mockReturnValue({ isDirectory: () => true });

jest.unstable_mockModule('../../kb/pipeline.js', () => ({
    processingPipeline: mockPipeline,
}));

jest.unstable_mockModule('../../kb/readers/registry.js', () => ({
    getAllReaders: mockGetAllReaders,
    getSupportedExtensions: mockGetSupportedExtensions,
    getCustomMappings: mockGetCustomMappings,
    getReaderForExtension: mockGetReaderForExtension,
    mapExtensionToReader: mockMapExtensionToReader,
    unmapExtension: mockUnmapExtension,
}));

jest.unstable_mockModule('../../kb/readers/index.js', () => ({
    readersReady,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

const mockUpdateConfig = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../../config/loader.js', () => ({
    updateConfig: mockUpdateConfig,
}));

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        statSync: mockStatSync,
        readFileSync: jest.fn<any>().mockReturnValue('{}'),
    },
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    readFileSync: jest.fn<any>().mockReturnValue('{}'),
}));

const { handleKnowledgeBase, loadSavedExtensionMappings } = await import('../../handlers/knowledge-base.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockListFolders.mockResolvedValue([]);
    mockAddFolder.mockResolvedValue({ id: 'folder-1' });
    mockRemoveFolder.mockResolvedValue(undefined);
    mockUpdateFolder.mockResolvedValue(undefined);
    mockScanAndQueue.mockResolvedValue({ queued: 3, skipped: 1 });
    mockGetStatus.mockReturnValue({ running: false, queued: 0 });
    mockListFiles.mockResolvedValue([]);
    mockGetFileDetail.mockResolvedValue(null);
    mockReprocessFile.mockResolvedValue(undefined);
    mockRetryFailed.mockResolvedValue(0);
    mockGetStats.mockResolvedValue({ totalFiles: 5, totalChunks: 20 });
    mockStop.mockResolvedValue({ stopped: true });
    mockGetAllReaders.mockReturnValue([]);
    mockGetSupportedExtensions.mockReturnValue(['.txt', '.pdf']);
    mockGetCustomMappings.mockReturnValue([]);
    mockGetReaderForExtension.mockReturnValue(null);
    mockMapExtensionToReader.mockReturnValue(true);
    mockUnmapExtension.mockReturnValue(undefined);
    mockSystemQuery.mockResolvedValue([]);
    mockUpdateConfig.mockResolvedValue([]);
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
});

// =============================================================================
// Unknown action
// =============================================================================

describe('handleKnowledgeBase — unknown action', () => {
    it('returns error for unrecognized action', async () => {
        const result = await handleKnowledgeBase({ action: 'bogus' });
        expect(result.error).toContain('Unknown KB action');
        expect(result.error).toContain('bogus');
    });
});

// =============================================================================
// folders
// =============================================================================

describe('action: folders', () => {
    it('returns folder list', async () => {
        mockListFolders.mockResolvedValue([{ id: 'f1', folder_path: '/docs' }]);
        const result = await handleKnowledgeBase({ action: 'folders' });
        expect(result.folders).toHaveLength(1);
        expect(result.folders[0].id).toBe('f1');
    });
});

// =============================================================================
// add
// =============================================================================

describe('action: add', () => {
    it('returns error when folderPath missing', async () => {
        const result = await handleKnowledgeBase({ action: 'add' });
        expect(result.error).toContain('folderPath is required');
    });

    it('returns error when folder does not exist', async () => {
        mockExistsSync.mockReturnValue(false);
        const result = await handleKnowledgeBase({ action: 'add', folderPath: '/nonexistent' });
        expect(result.error).toContain('does not exist');
    });

    it('returns error when path is not a directory', async () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => false });
        const result = await handleKnowledgeBase({ action: 'add', folderPath: '/some/file.txt' });
        expect(result.error).toContain('Not a directory');
    });

    it('returns error when duplicate mode detected', async () => {
        // Use the actual resolved path so the comparison in the handler matches
        const folderPath = process.cwd();
        const resolved = path.resolve(folderPath).replace(/\\/g, '/');
        mockListFolders.mockResolvedValue([
            { folder_path: resolved, raw_mode: false, domain: 'docs' },
        ]);
        const result = await handleKnowledgeBase({
            action: 'add',
            folderPath,
            domain: 'docs2',
            rawMode: false, // same mode as existing
        });
        expect(result.error).toContain('already registered in curated mode');
    });

    it('returns warning for valid dual-folder pattern (different modes)', async () => {
        const folderPath = process.cwd();
        const resolved = path.resolve(folderPath).replace(/\\/g, '/');
        mockListFolders.mockResolvedValue([
            { folder_path: resolved, raw_mode: false, domain: 'docs-curated' },
        ]);
        mockAddFolder.mockResolvedValue({ id: 'folder-2', domain: 'docs-raw' });

        const result = await handleKnowledgeBase({
            action: 'add',
            folderPath,
            domain: 'docs-raw',
            rawMode: true, // different mode — valid dual-folder
        });
        expect(result.success).toBe(true);
        expect(result.warning).toContain('Dual-folder pattern');
    });

    it('adds folder successfully and returns folder object', async () => {
        const folder = { id: 'folder-1', folder_path: '/docs', domain: 'science' };
        mockAddFolder.mockResolvedValue(folder);

        const result = await handleKnowledgeBase({
            action: 'add',
            folderPath: '/docs',
            domain: 'science',
        });
        expect(result.success).toBe(true);
        expect(result.folder.id).toBe('folder-1');
        expect(mockAddFolder).toHaveBeenCalledWith(expect.objectContaining({
            domain: 'science',
            recursive: true,
            watchEnabled: true,
        }));
    });

    it('auto-derives domain from folder name when not provided', async () => {
        mockAddFolder.mockResolvedValue({ id: 'f1' });
        await handleKnowledgeBase({ action: 'add', folderPath: '/my docs' });
        // 'my docs' normalized to 'my-docs'
        expect(mockAddFolder).toHaveBeenCalledWith(expect.objectContaining({ domain: 'my-docs' }));
    });
});

// =============================================================================
// remove
// =============================================================================

describe('action: remove', () => {
    it('returns error when folderId missing', async () => {
        const result = await handleKnowledgeBase({ action: 'remove' });
        expect(result.error).toContain('folderId is required');
    });

    it('removes folder and returns success', async () => {
        const result = await handleKnowledgeBase({ action: 'remove', folderId: 'f1', deleteNodes: true });
        expect(result.success).toBe(true);
        expect(mockRemoveFolder).toHaveBeenCalledWith('f1', true);
    });
});

// =============================================================================
// update
// =============================================================================

describe('action: update', () => {
    it('returns error when folderId missing', async () => {
        const result = await handleKnowledgeBase({ action: 'update' });
        expect(result.error).toContain('folderId is required');
    });

    it('maps camelCase params to snake_case and calls updateFolder', async () => {
        await handleKnowledgeBase({
            action: 'update',
            folderId: 'f1',
            watchEnabled: false,
            includePatterns: ['*.ts'],
        });
        expect(mockUpdateFolder).toHaveBeenCalledWith('f1', expect.objectContaining({
            watch_enabled: false,
            include_patterns: ['*.ts'],
        }));
    });
});

// =============================================================================
// scan
// =============================================================================

describe('action: scan', () => {
    it('returns error when folderId missing', async () => {
        const result = await handleKnowledgeBase({ action: 'scan' });
        expect(result.error).toContain('folderId is required');
    });

    it('scans folder and returns queued count', async () => {
        mockScanAndQueue.mockResolvedValue({ queued: 5, skipped: 2 });
        const result = await handleKnowledgeBase({ action: 'scan', folderId: 'f1' });
        expect(result.success).toBe(true);
        expect(result.queued).toBe(5);
        expect(result.skipped).toBe(2);
    });
});

// =============================================================================
// status
// =============================================================================

describe('action: status', () => {
    it('returns pipeline status', async () => {
        mockGetStatus.mockReturnValue({ running: true, queued: 3 });
        const result = await handleKnowledgeBase({ action: 'status' });
        expect(result.running).toBe(true);
        expect(result.queued).toBe(3);
    });
});

// =============================================================================
// files
// =============================================================================

describe('action: files', () => {
    it('returns files list', async () => {
        mockListFiles.mockResolvedValue([{ id: 'file-1', path: '/docs/a.txt' }]);
        const result = await handleKnowledgeBase({ action: 'files', folderId: 'f1' });
        expect(result.files).toHaveLength(1);
        expect(mockListFiles).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'f1' }));
    });
});

// =============================================================================
// file
// =============================================================================

describe('action: file', () => {
    it('returns error when fileId missing', async () => {
        const result = await handleKnowledgeBase({ action: 'file' });
        expect(result.error).toContain('fileId is required');
    });

    it('returns error when file not found', async () => {
        mockGetFileDetail.mockResolvedValue(null);
        const result = await handleKnowledgeBase({ action: 'file', fileId: 'missing' });
        expect(result.error).toContain('not found');
    });

    it('returns file detail when found', async () => {
        mockGetFileDetail.mockResolvedValue({ id: 'file-1', chunks: [] });
        const result = await handleKnowledgeBase({ action: 'file', fileId: 'file-1' });
        expect(result.id).toBe('file-1');
    });
});

// =============================================================================
// reprocess
// =============================================================================

describe('action: reprocess', () => {
    it('returns error when fileId missing', async () => {
        const result = await handleKnowledgeBase({ action: 'reprocess' });
        expect(result.error).toContain('fileId is required');
    });

    it('reprocesses file and returns success', async () => {
        const result = await handleKnowledgeBase({ action: 'reprocess', fileId: 'file-1' });
        expect(result.success).toBe(true);
        expect(mockReprocessFile).toHaveBeenCalledWith('file-1');
    });
});

// =============================================================================
// retry
// =============================================================================

describe('action: retry', () => {
    it('retries failed files and returns count', async () => {
        mockRetryFailed.mockResolvedValue(3);
        const result = await handleKnowledgeBase({ action: 'retry', folderId: 'f1' });
        expect(result.success).toBe(true);
        expect(result.retriedCount).toBe(3);
    });
});

// =============================================================================
// readers
// =============================================================================

describe('action: readers', () => {
    it('returns readers, supportedExtensions, and customMappings', async () => {
        mockGetAllReaders.mockReturnValue([
            { id: 'text', name: 'Text Reader', subsystem: 'reader_text', extensions: ['.txt'], requiresLLM: false },
        ]);
        mockGetSupportedExtensions.mockReturnValue(['.txt', '.md']);
        mockGetCustomMappings.mockReturnValue([{ extension: 'log', readerName: 'Text Reader' }]);

        const result = await handleKnowledgeBase({ action: 'readers' });
        expect(result.readers).toHaveLength(1);
        expect(result.readers[0].id).toBe('text');
        expect(result.supportedExtensions).toContain('.txt');
        expect(result.customMappings).toHaveLength(1);
    });
});

// =============================================================================
// stats
// =============================================================================

describe('action: stats', () => {
    it('returns stats merged with pipeline status', async () => {
        mockGetStats.mockResolvedValue({ totalFiles: 10, totalChunks: 50 });
        mockGetStatus.mockReturnValue({ running: false });

        const result = await handleKnowledgeBase({ action: 'stats' });
        expect(result.totalFiles).toBe(10);
        expect(result.totalChunks).toBe(50);
        expect(result.pipeline).toEqual({ running: false });
    });
});

// =============================================================================
// stop
// =============================================================================

describe('action: stop', () => {
    it('stops pipeline and returns success', async () => {
        mockStop.mockResolvedValue({ stopped: true, processed: 5 });
        const result = await handleKnowledgeBase({ action: 'stop' });
        expect(result.success).toBe(true);
        expect(result.stopped).toBe(true);
    });
});

// =============================================================================
// defaults
// =============================================================================

describe('action: defaults', () => {
    it('returns KB config defaults', async () => {
        const result = await handleKnowledgeBase({ action: 'defaults' });
        expect(result.defaultExcludePatterns).toEqual(['*.log']);
        expect(result.maxChunkSize).toBe(4000);
    });
});

// =============================================================================
// mapExtension
// =============================================================================

describe('action: mapExtension', () => {
    it('returns error when extension missing', async () => {
        const result = await handleKnowledgeBase({ action: 'mapExtension', readerName: 'Text Reader' });
        expect(result.error).toContain('extension and readerName are required');
    });

    it('returns error when readerName missing', async () => {
        const result = await handleKnowledgeBase({ action: 'mapExtension', extension: '.log' });
        expect(result.error).toContain('extension and readerName are required');
    });

    it('returns error when extension already natively mapped to same reader', async () => {
        mockGetReaderForExtension.mockReturnValue({ name: 'Text Reader' });
        const result = await handleKnowledgeBase({ action: 'mapExtension', extension: '.txt', readerName: 'text reader' });
        expect(result.error).toContain('already handled by');
    });

    it('returns error when reader not found', async () => {
        mockMapExtensionToReader.mockReturnValue(false);
        const result = await handleKnowledgeBase({ action: 'mapExtension', extension: '.xyz', readerName: 'Unknown' });
        expect(result.error).toContain('Reader "Unknown" not found');
    });

    it('maps extension and persists to DB', async () => {
        mockGetCustomMappings.mockReturnValue([{ extension: 'log', readerName: 'Text Reader' }]);
        const result = await handleKnowledgeBase({ action: 'mapExtension', extension: '.LOG', readerName: 'Text Reader' });
        expect(result.success).toBe(true);
        expect(result.extension).toBe('log'); // lowercased, dot stripped
        expect(mockSystemQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// unmapExtension
// =============================================================================

describe('action: unmapExtension', () => {
    it('returns error when extension missing', async () => {
        const result = await handleKnowledgeBase({ action: 'unmapExtension' });
        expect(result.error).toContain('extension is required');
    });

    it('unmaps extension and persists to DB', async () => {
        mockGetCustomMappings.mockReturnValue([]);
        const result = await handleKnowledgeBase({ action: 'unmapExtension', extension: '.log' });
        expect(result.success).toBe(true);
        expect(result.extension).toBe('log');
        expect(mockUnmapExtension).toHaveBeenCalledWith('log');
        expect(mockSystemQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// loadSavedExtensionMappings
// =============================================================================

describe('loadSavedExtensionMappings', () => {
    it('returns 0 when no mappings in DB', async () => {
        mockSystemQuery.mockResolvedValue([]);
        const count = await loadSavedExtensionMappings();
        expect(count).toBe(0);
    });

    it('loads mappings from DB and applies them', async () => {
        mockSystemQuery.mockResolvedValue([
            { value: JSON.stringify([{ extension: 'log', readerName: 'Text Reader' }]) },
        ]);
        mockMapExtensionToReader.mockReturnValue(true);

        const count = await loadSavedExtensionMappings();
        expect(count).toBe(1);
        expect(mockMapExtensionToReader).toHaveBeenCalledWith('log', 'Text Reader');
    });

    it('returns 0 on DB error', async () => {
        mockSystemQuery.mockRejectedValue(new Error('DB error'));
        const count = await loadSavedExtensionMappings();
        expect(count).toBe(0);
    });
});

// =============================================================================
// normalizePatterns (tested via add/update actions)
// =============================================================================

describe('pattern normalization', () => {
    it('normalizes comma-separated string to array on add', async () => {
        await handleKnowledgeBase({
            action: 'add',
            folderPath: '/tmp/test',
            domain: 'test',
            excludePatterns: 'node_modules/*, tests/*, coverage/*',
        });
        const call = mockAddFolder.mock.calls[0]?.[0];
        expect(call.excludePatterns).toEqual(['node_modules/*', 'tests/*', 'coverage/*']);
    });

    it('passes array through unchanged on add', async () => {
        await handleKnowledgeBase({
            action: 'add',
            folderPath: '/tmp/test',
            domain: 'test',
            excludePatterns: ['a/*', 'b/*'],
        });
        const call = mockAddFolder.mock.calls[0]?.[0];
        expect(call.excludePatterns).toEqual(['a/*', 'b/*']);
    });

    it('normalizes null/empty to undefined on add', async () => {
        await handleKnowledgeBase({
            action: 'add',
            folderPath: '/tmp/test',
            domain: 'test',
            excludePatterns: '',
        });
        const call = mockAddFolder.mock.calls[0]?.[0];
        expect(call.excludePatterns).toBeUndefined();
    });

    it('normalizes patterns on update', async () => {
        await handleKnowledgeBase({
            action: 'update',
            folderId: 'f1',
            excludePatterns: '*.log, *.tmp',
        });
        expect(mockUpdateFolder).toHaveBeenCalledWith('f1', expect.objectContaining({
            exclude_patterns: ['*.log', '*.tmp'],
        }));
    });

    it('flattens comma-separated entries within arrays', async () => {
        await handleKnowledgeBase({
            action: 'add',
            folderPath: '/tmp/test',
            domain: 'test',
            includePatterns: ['*.ts, *.js', '*.py'],
        });
        const call = mockAddFolder.mock.calls[0]?.[0];
        expect(call.includePatterns).toEqual(['*.ts', '*.js', '*.py']);
    });
});

// =============================================================================
// updateDefaults
// =============================================================================

describe('action: updateDefaults', () => {
    it('returns error when patterns is not an array', async () => {
        const result = await handleKnowledgeBase({ action: 'updateDefaults', defaultExcludePatterns: 'not-an-array' });
        expect(result.error).toContain('must be an array');
    });

    it('calls updateConfig with cleaned patterns', async () => {
        const result = await handleKnowledgeBase({
            action: 'updateDefaults',
            defaultExcludePatterns: ['*.log', '', '  *.tmp  ', null, '*.db'],
        });
        expect(result.success).toBe(true);
        expect(result.defaultExcludePatterns).toEqual(['*.log', '*.tmp', '*.db']);
        expect(mockUpdateConfig).toHaveBeenCalledWith({
            knowledgeBase: { defaultExcludePatterns: ['*.log', '*.tmp', '*.db'] },
        });
    });

    it('handles empty array', async () => {
        const result = await handleKnowledgeBase({
            action: 'updateDefaults',
            defaultExcludePatterns: [],
        });
        expect(result.success).toBe(true);
        expect(result.defaultExcludePatterns).toEqual([]);
    });
});
