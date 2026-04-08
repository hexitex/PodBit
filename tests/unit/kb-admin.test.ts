/**
 * Unit tests for kb/pipeline/admin.ts — folder listing, file management,
 * pipeline status, stats, stop/resume, recovery, and keyword backfill.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockDbQuery,
}));

// Mock queue state
let mockQueue: any[] = [];
let mockActiveJobs = 0;
let mockCompletedCount = 0;
let mockFailedCount = 0;
let mockSkippedCount = 0;

const mockSetQueue = jest.fn((q: any[]) => { mockQueue = q; });
const mockSetStopRequested = jest.fn();
const mockSetCompletedCount = jest.fn((n: number) => { mockCompletedCount = n; });
const mockSetFailedCount = jest.fn((n: number) => { mockFailedCount = n; });
const mockSetSkippedCount = jest.fn((n: number) => { mockSkippedCount = n; });
const mockEnqueue = jest.fn();

jest.unstable_mockModule('../../kb/pipeline/queue.js', () => ({
    get queue() { return mockQueue; },
    get activeJobs() { return mockActiveJobs; },
    get completedCount() { return mockCompletedCount; },
    get failedCount() { return mockFailedCount; },
    get skippedCount() { return mockSkippedCount; },
    setQueue: mockSetQueue,
    setActiveJobs: jest.fn((n: number) => { mockActiveJobs = n; }),
    setCompletedCount: mockSetCompletedCount,
    setFailedCount: mockSetFailedCount,
    setSkippedCount: mockSetSkippedCount,
    setStopRequested: mockSetStopRequested,
    enqueue: mockEnqueue,
}));

// Mock archiveFileNodes for reprocessFile
const mockArchiveFileNodes = jest.fn<() => Promise<number>>().mockResolvedValue(0);
jest.unstable_mockModule('../../kb/pipeline/file-processing.js', () => ({
    archiveFileNodes: mockArchiveFileNodes,
}));

const {
    listFolders,
    listFiles,
    getFileDetail,
    reprocessFile,
    retryFailed,
    getStatus,
    getStats,
    stop,
    resume,
    resetCounters,
    recoverStuckFiles,
    backfillFilenameKeywords,
} = await import('../../kb/pipeline/admin.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockDbQuery.mockResolvedValue([]);
    mockArchiveFileNodes.mockResolvedValue(0);
    mockQueue = [];
    mockActiveJobs = 0;
    mockCompletedCount = 0;
    mockFailedCount = 0;
    mockSkippedCount = 0;
});

// =============================================================================
// listFolders
// =============================================================================

describe('listFolders', () => {
    it('returns all folders ordered by created_at DESC', async () => {
        const folders = [
            { id: 'f1', folder_path: '/a', domain: 'dom1' },
            { id: 'f2', folder_path: '/b', domain: 'dom2' },
        ];
        mockDbQuery.mockResolvedValueOnce(folders);

        const result = await listFolders();
        expect(result).toEqual(folders);
        expect(mockDbQuery).toHaveBeenCalledWith('SELECT * FROM kb_folders ORDER BY created_at DESC');
    });
});

// =============================================================================
// listFiles
// =============================================================================

describe('listFiles', () => {
    it('returns files with no filters', async () => {
        const files = [{ id: 'file-1' }];
        mockDbQuery.mockResolvedValueOnce(files);

        const result = await listFiles({});
        expect(result).toEqual(files);
        expect(mockDbQuery.mock.calls[0][0]).toContain('SELECT * FROM kb_files');
        expect(mockDbQuery.mock.calls[0][0]).not.toContain('WHERE');
    });

    it('filters by folderId', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({ folderId: 'f1' });

        expect(mockDbQuery.mock.calls[0][0]).toContain('folder_id = $1');
        expect(mockDbQuery.mock.calls[0][1]).toEqual(['f1']);
    });

    it('filters by status', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({ status: 'error' });

        expect(mockDbQuery.mock.calls[0][0]).toContain('status = $1');
        expect(mockDbQuery.mock.calls[0][1]).toEqual(['error']);
    });

    it('filters by domain', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({ domain: 'test-dom' });

        expect(mockDbQuery.mock.calls[0][0]).toContain('domain = $1');
        expect(mockDbQuery.mock.calls[0][1]).toEqual(['test-dom']);
    });

    it('combines multiple filters with AND', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({ folderId: 'f1', status: 'completed', domain: 'd1' });

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain('folder_id = $1');
        expect(sql).toContain('status = $2');
        expect(sql).toContain('domain = $3');
        expect(sql).toContain('AND');
        expect(mockDbQuery.mock.calls[0][1]).toEqual(['f1', 'completed', 'd1']);
    });

    it('applies limit and offset', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({ limit: 50, offset: 100 });

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain('LIMIT 50');
        expect(sql).toContain('OFFSET 100');
    });

    it('uses default limit of 1000 and offset of 0', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await listFiles({});

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain('LIMIT 1000');
        expect(sql).toContain('OFFSET 0');
    });
});

// =============================================================================
// getFileDetail
// =============================================================================

describe('getFileDetail', () => {
    it('returns null when file not found', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        const result = await getFileDetail('missing');
        expect(result).toBeNull();
    });

    it('returns file with chunks', async () => {
        const file = { id: 'f1', file_path: 'test.ts' };
        const chunks = [{ chunk_index: 0 }, { chunk_index: 1 }];
        mockDbQuery
            .mockResolvedValueOnce([file])
            .mockResolvedValueOnce(chunks);

        const result = await getFileDetail('f1');
        expect(result).toEqual({ file, chunks });
        expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// reprocessFile
// =============================================================================

describe('reprocessFile', () => {
    it('throws when file not found', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await expect(reprocessFile('missing')).rejects.toThrow('File not found');
    });

    it('throws when folder not found', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ id: 'f1', folder_id: 'folder-1', file_path: 'test.ts' }])
            .mockResolvedValueOnce([]);  // folder not found
        await expect(reprocessFile('f1')).rejects.toThrow('Folder not found');
    });

    it('archives old nodes, deletes chunks, resets status, and enqueues', async () => {
        const file = {
            id: 'f1', folder_id: 'folder-1', file_path: 'src/test.ts',
            domain: 'test-dom', extension: 'ts',
        };
        const folder = { id: 'folder-1', folder_path: '/project', raw_mode: 0 };

        mockDbQuery
            .mockResolvedValueOnce([file])    // file lookup
            .mockResolvedValueOnce([folder])  // folder lookup
            .mockResolvedValueOnce([])        // DELETE chunks
            .mockResolvedValueOnce([]);       // UPDATE status

        await reprocessFile('f1');

        // Should archive old nodes
        expect(mockArchiveFileNodes).toHaveBeenCalledWith('f1');

        // Should delete old chunks
        const deleteCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('DELETE FROM kb_chunks')
        );
        expect(deleteCall).toBeTruthy();

        // Should reset status to pending
        const statusCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'pending'")
        );
        expect(statusCall).toBeTruthy();

        // Should enqueue with high priority
        expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
            fileId: 'f1',
            priority: 1,
        }));
    });
});

// =============================================================================
// retryFailed
// =============================================================================

describe('retryFailed', () => {
    it('returns 0 when no failed files', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        const result = await retryFailed();
        expect(result).toBe(0);
    });

    it('re-queues all failed files', async () => {
        const files = [
            { id: 'f1', folder_id: 'fld1', file_path: 'a.ts', folder_path: '/proj', domain: 'dom', extension: 'ts', raw_mode: 0 },
            { id: 'f2', folder_id: 'fld1', file_path: 'b.ts', folder_path: '/proj', domain: 'dom', extension: 'ts', raw_mode: 1 },
        ];
        mockDbQuery
            .mockResolvedValueOnce(files)  // SELECT failed files
            .mockResolvedValue([]);         // UPDATE calls

        const count = await retryFailed();
        expect(count).toBe(2);
        expect(mockEnqueue).toHaveBeenCalledTimes(2);
    });

    it('filters by folderId when provided', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await retryFailed('folder-x');

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain('AND folder_id = $1');
        expect(mockDbQuery.mock.calls[0][1]).toEqual(['folder-x']);
    });

    it('sets rawMode correctly from folder raw_mode', async () => {
        const files = [
            { id: 'f1', folder_id: 'fld1', file_path: 'a.ts', folder_path: '/proj', domain: 'dom', extension: 'ts', raw_mode: 1 },
        ];
        mockDbQuery.mockResolvedValueOnce(files).mockResolvedValue([]);

        await retryFailed();

        expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
            rawMode: true,
        }));
    });
});

// =============================================================================
// getStatus
// =============================================================================

describe('getStatus', () => {
    // NOTE: getStatus reads queue/activeJobs/etc from its own import bindings.
    // With ts-jest, these are snapshot values from mock getters at import time,
    // not live bindings. So we can only test the shape and default-state behavior.

    it('returns a PipelineStatus object with correct shape', () => {
        const status = getStatus();
        expect(status).toHaveProperty('running');
        expect(status).toHaveProperty('queueLength');
        expect(status).toHaveProperty('activeJobs');
        expect(status).toHaveProperty('completed');
        expect(status).toHaveProperty('failed');
        expect(status).toHaveProperty('skipped');
    });

    it('reports not running in default state', () => {
        const status = getStatus();
        expect(status.running).toBe(false);
        expect(status.queueLength).toBe(0);
        expect(status.activeJobs).toBe(0);
    });
});

// =============================================================================
// getStats
// =============================================================================

describe('getStats', () => {
    it('aggregates ingestion statistics', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ count: 5 }])                               // folder count
            .mockResolvedValueOnce([{ count: 100 }])                              // file count
            .mockResolvedValueOnce([                                               // status counts
                { status: 'completed', count: 80 },
                { status: 'error', count: 10 },
                { status: 'pending', count: 10 },
            ])
            .mockResolvedValueOnce([                                               // reader counts
                { reader_plugin: 'text', count: 60 },
                { reader_plugin: 'code', count: 40 },
            ])
            .mockResolvedValueOnce([{ count: 250 }])                              // chunk count
            .mockResolvedValueOnce([{ count: 200 }]);                             // node count

        const stats = await getStats();
        expect(stats).toEqual({
            totalFolders: 5,
            totalFiles: 100,
            filesByStatus: { completed: 80, error: 10, pending: 10 },
            filesByReader: { text: 60, code: 40 },
            totalChunks: 250,
            totalNodes: 200,
        });
    });

    it('handles empty database', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ count: 0 }])
            .mockResolvedValueOnce([{ count: 0 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ count: 0 }])
            .mockResolvedValueOnce([{ count: 0 }]);

        const stats = await getStats();
        expect(stats.totalFolders).toBe(0);
        expect(stats.totalFiles).toBe(0);
        expect(stats.filesByStatus).toEqual({});
        expect(stats.filesByReader).toEqual({});
    });
});

// =============================================================================
// stop
// =============================================================================

describe('stop', () => {
    it('calls setQueue and setStopRequested', async () => {
        // queue.length is a stale binding (always 0), so cleared will be 0
        mockDbQuery.mockResolvedValueOnce([]).mockResolvedValue([]);

        const result = await stop();
        expect(result.cleared).toBe(0); // stale binding reads empty queue
        expect(mockSetQueue).toHaveBeenCalledWith([]);
        expect(mockSetStopRequested).toHaveBeenCalledWith(true);
    });

    it('resets processing files to pending', async () => {
        mockDbQuery.mockResolvedValueOnce([{ id: 'f1' }, { id: 'f2' }]).mockResolvedValue([]);

        const result = await stop();
        expect(result.reset).toBe(2);
    });

    it('resets folders stuck in scanning/processing', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])   // files RETURNING
            .mockResolvedValueOnce([]);  // folders UPDATE

        await stop();

        const folderResetCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("UPDATE kb_folders") && c[0].includes("'idle'")
        );
        expect(folderResetCall).toBeTruthy();
    });
});

// =============================================================================
// resume
// =============================================================================

describe('resume', () => {
    it('clears stop flag', () => {
        resume();
        expect(mockSetStopRequested).toHaveBeenCalledWith(false);
    });
});

// =============================================================================
// resetCounters
// =============================================================================

describe('resetCounters', () => {
    it('resets all counters to 0', () => {
        resetCounters();
        expect(mockSetCompletedCount).toHaveBeenCalledWith(0);
        expect(mockSetFailedCount).toHaveBeenCalledWith(0);
        expect(mockSetSkippedCount).toHaveBeenCalledWith(0);
    });
});

// =============================================================================
// recoverStuckFiles
// =============================================================================

describe('recoverStuckFiles', () => {
    it('resets processing files to pending and returns count', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }])  // stuck files
            .mockResolvedValueOnce([{ id: 'fld1' }]);                              // stuck folders

        const count = await recoverStuckFiles();
        expect(count).toBe(3);
    });

    it('returns 0 when no stuck files', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])   // no stuck files
            .mockResolvedValueOnce([]);  // no stuck folders

        const count = await recoverStuckFiles();
        expect(count).toBe(0);
    });

    it('also recovers stuck folders', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'fld1' }]);

        await recoverStuckFiles();

        const folderCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("UPDATE kb_folders") && c[0].includes("'idle'")
        );
        expect(folderCall).toBeTruthy();
    });
});

// =============================================================================
// backfillFilenameKeywords
// =============================================================================

describe('backfillFilenameKeywords', () => {
    it('returns 0 when no nodes need backfill', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        const count = await backfillFilenameKeywords();
        expect(count).toBe(0);
    });

    it('generates keywords from filename metadata', async () => {
        mockDbQuery.mockResolvedValueOnce([
            {
                id: 'node-1',
                metadata: JSON.stringify({
                    source: { fileName: 'MyComponent.tsx' },
                }),
            },
        ]).mockResolvedValue([]); // INSERT calls

        const count = await backfillFilenameKeywords();
        expect(count).toBe(1);

        // Should have inserted keywords for the node
        const insertCalls = mockDbQuery.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO node_keywords')
        );
        expect(insertCalls.length).toBeGreaterThan(0);

        // Check keywords include filename, stem, extension, camelCase parts
        const allKeywords = insertCalls.map(c => c[1]?.[1]);
        expect(allKeywords).toContain('mycomponent.tsx');
        expect(allKeywords).toContain('mycomponent');
        expect(allKeywords).toContain('tsx');
    });

    it('handles object metadata (not string)', async () => {
        mockDbQuery.mockResolvedValueOnce([
            {
                id: 'node-2',
                metadata: { source: { fileName: 'test-utils.js' } },
            },
        ]).mockResolvedValue([]);

        const count = await backfillFilenameKeywords();
        expect(count).toBe(1);
    });

    it('skips rows with no fileName in metadata', async () => {
        mockDbQuery.mockResolvedValueOnce([
            { id: 'node-3', metadata: JSON.stringify({ source: {} }) },
        ]);

        const count = await backfillFilenameKeywords();
        expect(count).toBe(0);
    });

    it('handles errors gracefully and returns 0', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('DB error'));
        const count = await backfillFilenameKeywords();
        expect(count).toBe(0);
    });

    it('splits hyphenated and underscored filenames', async () => {
        mockDbQuery.mockResolvedValueOnce([
            {
                id: 'node-4',
                metadata: JSON.stringify({
                    source: { fileName: 'my-great_component.ts' },
                }),
            },
        ]).mockResolvedValue([]);

        await backfillFilenameKeywords();

        const insertCalls = mockDbQuery.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO node_keywords')
        );
        const allKeywords = insertCalls.map(c => c[1]?.[1]);
        expect(allKeywords).toContain('my');
        expect(allKeywords).toContain('great');
        expect(allKeywords).toContain('component');
    });
});
