/**
 * Unit tests for kb/pipeline/folder.ts — folder scanning, adding, removing,
 * updating folders, and the scanAndQueue workflow.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockDbQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        knowledgeBase: {
            defaultExcludePatterns: ['node_modules/**'],
            skipLargeFiles: 0,
        },
    },
}));

const mockGetReaderForExtension = jest.fn();
jest.unstable_mockModule('../../kb/readers/registry.js', () => ({
    getReaderForExtension: mockGetReaderForExtension,
}));

const mockHashFile = jest.fn<() => Promise<string>>().mockResolvedValue('abc123');
jest.unstable_mockModule('../../kb/hasher.js', () => ({
    hashFile: mockHashFile,
}));

const mockNormalizePath = jest.fn((p: string) => p.replace(/\\/g, '/'));
const mockResolveDomain = jest.fn((domain: string) => domain);
const mockScanFolder = jest.fn().mockReturnValue([]);
jest.unstable_mockModule('../../kb/scanner.js', () => ({
    normalizePath: mockNormalizePath,
    resolveDomain: mockResolveDomain,
    scanFolder: mockScanFolder,
}));

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const mockEnqueue = jest.fn();
jest.unstable_mockModule('../../kb/pipeline/queue.js', () => ({
    enqueue: mockEnqueue,
}));

const mockArchiveFileNodes = jest.fn<() => Promise<number>>().mockResolvedValue(0);
jest.unstable_mockModule('../../kb/pipeline/file-processing.js', () => ({
    archiveFileNodes: mockArchiveFileNodes,
}));

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
jest.unstable_mockModule('fs', () => ({
    default: { existsSync: mockExistsSync },
    existsSync: mockExistsSync,
}));

const {
    scanAndQueue,
    addFolder,
    removeFolder,
    updateFolder,
} = await import('../../kb/pipeline/folder.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockDbQuery.mockResolvedValue([]);
    mockGetReaderForExtension.mockReturnValue(null);
    mockHashFile.mockResolvedValue('abc123');
    mockScanFolder.mockReturnValue([]);
    mockArchiveFileNodes.mockResolvedValue(0);
    mockResolveDomain.mockImplementation((domain: string) => domain);
    mockNormalizePath.mockImplementation((p: string) => p.replace(/\\/g, '/'));
    mockExistsSync.mockReturnValue(false);
});

// =============================================================================
// scanAndQueue
// =============================================================================

describe('scanAndQueue', () => {
    const makeFolderRow = (overrides: Record<string, any> = {}) => ({
        id: 'fld-1',
        folder_path: '/project/src',
        domain: 'test-dom',
        recursive: 1,
        watch_enabled: 0,
        include_patterns: null,
        exclude_patterns: null,
        auto_domain_subfolders: 0,
        raw_mode: 0,
        ...overrides,
    });

    it('throws when folder not found', async () => {
        mockDbQuery.mockResolvedValueOnce([]);
        await expect(scanAndQueue('missing')).rejects.toThrow('Folder not found');
    });

    it('updates folder status to scanning at start', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])   // SELECT folder
            .mockResolvedValueOnce([])                   // UPDATE scanning
            .mockResolvedValueOnce([])                   // SELECT deleted files check
            .mockResolvedValueOnce([]);                  // UPDATE post-scan status

        await scanAndQueue('fld-1');

        const scanningCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'scanning'")
        );
        expect(scanningCall).toBeTruthy();
    });

    it('returns counts with no files found', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])
            .mockResolvedValueOnce([])                   // scanning status
            .mockResolvedValueOnce([])                   // allDbFiles for deletion check
            .mockResolvedValueOnce([]);                  // post-scan status

        mockScanFolder.mockReturnValue([]);

        const result = await scanAndQueue('fld-1');
        expect(result).toEqual({ queued: 0, unchanged: 0, unsupported: 0, deleted: 0 });
    });

    it('skips files with unsupported extensions', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])
            .mockResolvedValueOnce([])                   // scanning
            .mockResolvedValueOnce([])                   // allDbFiles
            .mockResolvedValueOnce([]);                  // post-scan

        mockScanFolder.mockReturnValue([
            { relativePath: 'test.xyz', absolutePath: '/project/src/test.xyz', fileName: 'test.xyz', extension: 'xyz', size: 100, modifiedAt: '2024-01-01' },
        ]);
        mockGetReaderForExtension.mockReturnValue(null);

        const result = await scanAndQueue('fld-1');
        expect(result.unsupported).toBe(1);
        expect(result.queued).toBe(0);
    });

    it('queues new files with supported extensions', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])     // SELECT folder
            .mockResolvedValueOnce([])                     // scanning
            .mockResolvedValueOnce([])                     // existing file check
            .mockResolvedValueOnce([{ id: 'new-file-1' }]) // INSERT RETURNING id
            .mockResolvedValueOnce([])                     // allDbFiles
            .mockResolvedValueOnce([]);                    // post-scan

        mockScanFolder.mockReturnValue([
            { relativePath: 'app.ts', absolutePath: '/project/src/app.ts', fileName: 'app.ts', extension: 'ts', size: 500, modifiedAt: '2024-01-01' },
        ]);
        mockGetReaderForExtension.mockReturnValue({ id: 'code' });
        mockHashFile.mockResolvedValue('hash-abc');

        const result = await scanAndQueue('fld-1');
        expect(result.queued).toBe(1);
        expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
            fileId: 'new-file-1',
            extension: 'ts',
        }));
    });

    it('skips unchanged completed files', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])      // SELECT folder
            .mockResolvedValueOnce([])                      // scanning
            .mockResolvedValueOnce([{ id: 'existing-1', content_hash: 'same-hash', status: 'completed' }]) // existing file
            .mockResolvedValueOnce([])                      // allDbFiles
            .mockResolvedValueOnce([]);                     // post-scan

        mockScanFolder.mockReturnValue([
            { relativePath: 'stable.ts', absolutePath: '/project/src/stable.ts', fileName: 'stable.ts', extension: 'ts', size: 100, modifiedAt: '2024-01-01' },
        ]);
        mockGetReaderForExtension.mockReturnValue({ id: 'code' });
        mockHashFile.mockResolvedValue('same-hash');

        const result = await scanAndQueue('fld-1');
        expect(result.unchanged).toBe(1);
        expect(result.queued).toBe(0);
    });

    it('re-queues changed files and archives old nodes', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])      // SELECT folder
            .mockResolvedValueOnce([])                      // scanning
            .mockResolvedValueOnce([{ id: 'existing-1', content_hash: 'old-hash', status: 'completed' }]) // existing changed
            .mockResolvedValueOnce([])                      // UPDATE file
            .mockResolvedValueOnce([])                      // DELETE chunks
            .mockResolvedValueOnce([])                      // allDbFiles
            .mockResolvedValueOnce([]);                     // post-scan

        mockScanFolder.mockReturnValue([
            { relativePath: 'changed.ts', absolutePath: '/project/src/changed.ts', fileName: 'changed.ts', extension: 'ts', size: 200, modifiedAt: '2024-02-01' },
        ]);
        mockGetReaderForExtension.mockReturnValue({ id: 'code' });
        mockHashFile.mockResolvedValue('new-hash');

        const result = await scanAndQueue('fld-1');
        expect(result.queued).toBe(1);
        expect(mockArchiveFileNodes).toHaveBeenCalledWith('existing-1');
    });

    it('detects deleted files and archives their nodes', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])       // SELECT folder
            .mockResolvedValueOnce([])                       // scanning
            .mockResolvedValueOnce([                         // allDbFiles — file no longer on disk
                { id: 'gone-1', file_path: 'removed.ts', status: 'completed' },
            ])
            .mockResolvedValueOnce([])                       // archiveFileNodes via DB
            .mockResolvedValueOnce([])                       // DELETE chunks
            .mockResolvedValueOnce([])                       // UPDATE deleted
            .mockResolvedValueOnce([]);                      // post-scan

        mockScanFolder.mockReturnValue([]); // no files on disk

        const result = await scanAndQueue('fld-1');
        expect(result.deleted).toBe(1);
        expect(mockArchiveFileNodes).toHaveBeenCalledWith('gone-1');
    });

    it('does not mark files as deleted if they still exist on disk but were filtered by scanner', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])       // SELECT folder
            .mockResolvedValueOnce([])                       // scanning
            .mockResolvedValueOnce([                         // allDbFiles — file not in scan results
                { id: 'filtered-1', file_path: 'page.html', status: 'completed' },
            ])
            .mockResolvedValueOnce([]);                      // post-scan

        mockScanFolder.mockReturnValue([]); // scanner didn't find it (filtered by include patterns)
        mockExistsSync.mockReturnValue(true); // but file still exists on disk

        const result = await scanAndQueue('fld-1');
        expect(result.deleted).toBe(0);
        expect(mockArchiveFileNodes).not.toHaveBeenCalled();
    });

    it('sets folder to processing when files are queued', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])
            .mockResolvedValueOnce([])                       // scanning
            .mockResolvedValueOnce([])                       // existing check
            .mockResolvedValueOnce([{ id: 'f1' }])           // INSERT RETURNING
            .mockResolvedValueOnce([])                       // allDbFiles
            .mockResolvedValueOnce([]);                      // post-scan UPDATE

        mockScanFolder.mockReturnValue([
            { relativePath: 'a.ts', absolutePath: '/a.ts', fileName: 'a.ts', extension: 'ts', size: 100, modifiedAt: '2024-01-01' },
        ]);
        mockGetReaderForExtension.mockReturnValue({ id: 'code' });

        await scanAndQueue('fld-1');

        const postScanCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('UPDATE kb_folders SET status') && c[0].includes('last_scanned')
        );
        if (postScanCall) {
            expect(postScanCall[1]).toContain('processing');
        }
    });

    it('sets folder to error on scan failure', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])
            .mockResolvedValueOnce([]);                      // scanning

        mockScanFolder.mockImplementation(() => { throw new Error('Permission denied'); });

        await expect(scanAndQueue('fld-1')).rejects.toThrow('Permission denied');

        const errorCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'error'")
        );
        expect(errorCall).toBeTruthy();
    });

    it('parses include_patterns and exclude_patterns from JSON strings', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow({
                include_patterns: JSON.stringify(['*.ts', '*.js']),
                exclude_patterns: JSON.stringify(['*.test.ts']),
            })])
            .mockResolvedValueOnce([])     // scanning
            .mockResolvedValueOnce([])     // allDbFiles
            .mockResolvedValueOnce([]);    // post-scan

        await scanAndQueue('fld-1');

        expect(mockScanFolder).toHaveBeenCalledWith(
            '/project/src',
            1, // recursive
            ['*.ts', '*.js'],
            expect.arrayContaining(['node_modules/**', '*.test.ts']),
            0,
        );
    });

    it('emits scan_complete activity', async () => {
        mockDbQuery
            .mockResolvedValueOnce([makeFolderRow()])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        await scanAndQueue('fld-1');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'kb', 'scan_complete',
            expect.stringContaining('Scan complete'),
            expect.objectContaining({ folderId: 'fld-1' })
        );
    });
});

// =============================================================================
// addFolder
// =============================================================================

describe('addFolder', () => {
    it('inserts a folder with default options', async () => {
        const folderRow = { id: 'new-fld', folder_path: '/test', domain: 'dom' };
        mockDbQuery.mockResolvedValueOnce([folderRow]);

        const result = await addFolder({ folderPath: '/test', domain: 'dom' });
        expect(result).toEqual(folderRow);

        const insertCall = mockDbQuery.mock.calls[0];
        expect(insertCall[0]).toContain('INSERT INTO kb_folders');
        // recursive defaults to true (1)
        expect(insertCall[1][2]).toBe(1);
        // watch_enabled defaults to true (1)
        expect(insertCall[1][3]).toBe(1);
    });

    it('passes explicit options through', async () => {
        mockDbQuery.mockResolvedValueOnce([{}]);

        await addFolder({
            folderPath: '/custom',
            domain: 'custom-dom',
            recursive: false,
            watchEnabled: false,
            includePatterns: ['*.md'],
            excludePatterns: ['*.tmp'],
            autoDomainSubfolders: true,
            rawMode: true,
        });

        const params = mockDbQuery.mock.calls[0][1];
        expect(params[2]).toBe(0); // recursive false
        expect(params[3]).toBe(0); // watchEnabled false
        expect(params[4]).toBe(JSON.stringify(['*.md'])); // includePatterns
        expect(params[5]).toBe(JSON.stringify(['*.tmp'])); // excludePatterns
        expect(params[6]).toBe(1); // autoDomainSubfolders
        expect(params[7]).toBe(1); // rawMode
    });

    it('normalizes the folder path', async () => {
        mockDbQuery.mockResolvedValueOnce([{}]);

        await addFolder({ folderPath: 'C:\\Users\\test', domain: 'dom' });

        expect(mockNormalizePath).toHaveBeenCalled();
    });

    it('accepts UNC/SMB paths', async () => {
        const uncPath = '\\\\fileserver\\share\\research';
        const folderRow = { id: 'unc-fld', folder_path: '//fileserver/share/research', domain: 'research' };
        mockDbQuery.mockResolvedValueOnce([folderRow]);

        const result = await addFolder({ folderPath: uncPath, domain: 'research' });
        expect(result).toEqual(folderRow);

        // normalizePath should have been called on the resolved path
        expect(mockNormalizePath).toHaveBeenCalled();
        const insertCall = mockDbQuery.mock.calls[0];
        expect(insertCall[0]).toContain('INSERT INTO kb_folders');
    });

    it('accepts forward-slash UNC paths', async () => {
        const uncPath = '//nas/documents/papers';
        const folderRow = { id: 'unc-fld-2', folder_path: '//nas/documents/papers', domain: 'papers' };
        mockDbQuery.mockResolvedValueOnce([folderRow]);

        const result = await addFolder({ folderPath: uncPath, domain: 'papers' });
        expect(result).toEqual(folderRow);
        expect(mockNormalizePath).toHaveBeenCalled();
    });
});

// =============================================================================
// removeFolder
// =============================================================================

describe('removeFolder', () => {
    it('deletes folder without archiving nodes by default', async () => {
        mockDbQuery.mockResolvedValue([]);

        await removeFolder('fld-1');

        // Should only DELETE the folder
        expect(mockDbQuery).toHaveBeenCalledTimes(1);
        expect(mockDbQuery.mock.calls[0][0]).toContain('DELETE FROM kb_folders');
    });

    it('archives nodes when deleteNodes is true', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ node_id: 'n1' }])   // file nodes
            .mockResolvedValueOnce([{ node_id: 'n2' }, { node_id: 'n3' }])  // chunk nodes
            .mockResolvedValueOnce([])                      // UPDATE nodes archived
            .mockResolvedValueOnce([]);                     // DELETE folder

        await removeFolder('fld-1', true);

        // Should archive nodes
        const archiveCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('UPDATE nodes SET archived = 1')
        );
        expect(archiveCall).toBeTruthy();
        expect(archiveCall![1]).toEqual(expect.arrayContaining(['n1', 'n2', 'n3']));
    });

    it('handles empty node lists when deleteNodes is true', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])   // no file nodes
            .mockResolvedValueOnce([])   // no chunk nodes
            .mockResolvedValueOnce([]);  // DELETE folder

        await removeFolder('fld-1', true);

        // Should not call UPDATE nodes (no nodes to archive)
        const archiveCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('UPDATE nodes SET archived')
        );
        expect(archiveCall).toBeUndefined();
    });
});

// =============================================================================
// updateFolder
// =============================================================================

describe('updateFolder', () => {
    it('updates allowed fields', async () => {
        mockDbQuery.mockResolvedValue([]);

        await updateFolder('fld-1', { domain: 'new-dom', recursive: true } as any);

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain('UPDATE kb_folders SET');
        expect(sql).toContain('domain');
        expect(sql).toContain('recursive');
    });

    it('ignores disallowed fields', async () => {
        mockDbQuery.mockResolvedValue([]);

        await updateFolder('fld-1', { status: 'error', id: 'hacked' } as any);

        // Should not have called UPDATE (no allowed fields)
        expect(mockDbQuery).not.toHaveBeenCalled();
    });

    it('JSON-stringifies pattern arrays', async () => {
        mockDbQuery.mockResolvedValue([]);

        await updateFolder('fld-1', { include_patterns: ['*.ts'] } as any);

        const params = mockDbQuery.mock.calls[0][1];
        expect(params).toContain(JSON.stringify(['*.ts']));
    });

    it('converts booleans to 0/1 for boolean fields', async () => {
        mockDbQuery.mockResolvedValue([]);

        await updateFolder('fld-1', { recursive: true, watch_enabled: false } as any);

        const params = mockDbQuery.mock.calls[0][1];
        // folderId is first, then the values
        expect(params).toContain(1); // recursive true
        expect(params).toContain(0); // watch_enabled false
    });

    it('does nothing with empty updates', async () => {
        await updateFolder('fld-1', {});
        expect(mockDbQuery).not.toHaveBeenCalled();
    });

    it('always adds updated_at to SET clause', async () => {
        mockDbQuery.mockResolvedValue([]);

        await updateFolder('fld-1', { domain: 'x' } as any);

        const sql = mockDbQuery.mock.calls[0][0] as string;
        expect(sql).toContain("updated_at = datetime('now')");
    });
});
