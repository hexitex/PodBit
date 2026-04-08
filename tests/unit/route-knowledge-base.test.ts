/**
 * Unit tests for routes/knowledge-base.ts —
 * KB folder CRUD, file operations, pipeline control, status, OS integration
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleKnowledgeBase = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/knowledge-base.js', () => ({
    handleKnowledgeBase: mockHandleKnowledgeBase,
}));

const mockStartWatcher = jest.fn<() => Promise<any>>().mockResolvedValue({ watching: true });
const mockStopWatcher = jest.fn<() => Promise<any>>().mockResolvedValue({ stopped: true });

jest.unstable_mockModule('../../kb/watcher.js', () => ({
    startWatcher: mockStartWatcher,
    stopWatcher: mockStopWatcher,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

// Mock child_process.exec
const mockExec = jest.fn<any>();
jest.unstable_mockModule('child_process', () => ({
    exec: mockExec,
}));

// Mock fs
const mockExistsSync = jest.fn<() => boolean>().mockReturnValue(true);
const mockStatSync = jest.fn<() => any>().mockReturnValue({ isDirectory: () => true });

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        statSync: mockStatSync,
    },
    existsSync: mockExistsSync,
    statSync: mockStatSync,
}));

const kbRouter = (await import('../../routes/knowledge-base.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(kbRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleKnowledgeBase.mockResolvedValue({ ok: true });
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => true });
});

// =============================================================================
// Folders
// =============================================================================

describe('GET /kb/folders', () => {
    it('returns folder list', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ folders: [{ id: 'f1' }] });

        const res = await request(app).get('/kb/folders');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'folders' });
    });
});

describe('POST /kb/folders', () => {
    it('creates folder and returns 201', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ folderId: 'new-folder' });

        const res = await request(app)
            .post('/kb/folders')
            .send({ folderPath: '/data/docs', domain: 'docs' });

        expect(res.status).toBe(201);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'add', folderPath: '/data/docs', domain: 'docs' })
        );
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Invalid path' });

        const res = await request(app)
            .post('/kb/folders')
            .send({ folderPath: '/bad/path' });

        expect(res.status).toBe(400);
    });
});

describe('PUT /kb/folders/:id', () => {
    it('updates folder settings', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });

        const res = await request(app)
            .put('/kb/folders/f1')
            .send({ recursive: true });

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'update', folderId: 'f1', recursive: true })
        );
    });

    it('returns 400 on handler error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Not found' });

        const res = await request(app)
            .put('/kb/folders/f1')
            .send({ recursive: true });

        expect(res.status).toBe(400);
    });
});

describe('DELETE /kb/folders/:id', () => {
    it('removes folder', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });

        const res = await request(app).delete('/kb/folders/f1');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'remove', folderId: 'f1', deleteNodes: false })
        );
    });

    it('passes deleteNodes query param', async () => {
        const res = await request(app).delete('/kb/folders/f1?deleteNodes=true');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ deleteNodes: true })
        );
    });
});

// =============================================================================
// Folder Actions
// =============================================================================

describe('POST /kb/folders/:id/scan', () => {
    it('triggers a scan', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ scanned: 5 });

        const res = await request(app).post('/kb/folders/f1/scan');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'scan', folderId: 'f1' })
        );
    });

    it('returns 400 on scan error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Folder not found' });

        const res = await request(app).post('/kb/folders/f1/scan');

        expect(res.status).toBe(400);
    });
});

describe('POST /kb/folders/:id/watch/start', () => {
    it('starts watcher', async () => {
        const res = await request(app).post('/kb/folders/f1/watch/start');

        expect(res.status).toBe(200);
        expect(mockStartWatcher).toHaveBeenCalledWith('f1');
    });
});

describe('POST /kb/folders/:id/watch/stop', () => {
    it('stops watcher', async () => {
        const res = await request(app).post('/kb/folders/f1/watch/stop');

        expect(res.status).toBe(200);
        expect(mockStopWatcher).toHaveBeenCalledWith('f1');
    });
});

// =============================================================================
// Files
// =============================================================================

describe('GET /kb/files', () => {
    it('returns file list', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ files: [{ id: 'file1' }] });

        const res = await request(app).get('/kb/files');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'files' })
        );
    });

    it('passes query filters', async () => {
        await request(app).get('/kb/files?folderId=f1&status=processed&domain=docs&limit=10&offset=5');

        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'files',
                folderId: 'f1',
                status: 'processed',
                domain: 'docs',
                limit: 10,
                offset: 5,
            })
        );
    });
});

describe('GET /kb/files/:id', () => {
    it('returns file detail', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ id: 'file1', chunks: [] });

        const res = await request(app).get('/kb/files/file1');

        expect(res.status).toBe(200);
    });

    it('returns 404 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'File not found' });

        const res = await request(app).get('/kb/files/nonexistent');

        expect(res.status).toBe(404);
    });
});

describe('POST /kb/files/:id/reprocess', () => {
    it('reprocesses a file', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ reprocessed: true });

        const res = await request(app).post('/kb/files/file1/reprocess');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'reprocess', fileId: 'file1' })
        );
    });

    it('returns 400 on handler error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Cannot reprocess' });

        const res = await request(app).post('/kb/files/file1/reprocess');

        expect(res.status).toBe(400);
    });
});

describe('POST /kb/files/retry-failed', () => {
    it('retries failed files', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ retried: 3 });

        const res = await request(app)
            .post('/kb/files/retry-failed')
            .send({ folderId: 'f1' });

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'retry', folderId: 'f1' })
        );
    });
});

// =============================================================================
// Pipeline Control
// =============================================================================

describe('POST /kb/stop', () => {
    it('stops pipeline', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ stopped: true });

        const res = await request(app).post('/kb/stop');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'stop' });
    });
});

// =============================================================================
// Status & Info
// =============================================================================

describe('GET /kb/status', () => {
    it('returns pipeline status', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ running: true, queue: 0 });

        const res = await request(app).get('/kb/status');

        expect(res.status).toBe(200);
    });
});

describe('GET /kb/readers', () => {
    it('returns reader list', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ readers: ['text', 'pdf'] });

        const res = await request(app).get('/kb/readers');

        expect(res.status).toBe(200);
    });
});

describe('GET /kb/defaults', () => {
    it('returns KB defaults', async () => {
        const res = await request(app).get('/kb/defaults');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'defaults' });
    });
});

describe('GET /kb/stats', () => {
    it('returns ingestion stats', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ totalFiles: 50, totalChunks: 200 });

        const res = await request(app).get('/kb/stats');

        expect(res.status).toBe(200);
    });
});

// =============================================================================
// Extension Mappings
// =============================================================================

describe('POST /kb/extensions/map', () => {
    it('maps an extension', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });

        const res = await request(app)
            .post('/kb/extensions/map')
            .send({ extension: '.xyz', reader: 'text' });

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'mapExtension' })
        );
    });

    it('returns 400 on handler error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Invalid extension' });

        const res = await request(app)
            .post('/kb/extensions/map')
            .send({ extension: '' });

        expect(res.status).toBe(400);
    });
});

describe('DELETE /kb/extensions/:ext', () => {
    it('unmaps an extension', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });

        const res = await request(app).delete('/kb/extensions/.xyz');

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'unmapExtension', extension: '.xyz' })
        );
    });
});

// =============================================================================
// OS Integration — /kb/open-path
// =============================================================================

describe('POST /kb/open-path', () => {
    it('returns 400 when filePath missing', async () => {
        const res = await request(app)
            .post('/kb/open-path')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns 404 when path does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/nonexistent/path' });

        expect(res.status).toBe(404);
    });

    it('opens a directory', async () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => true });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/some/folder' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('opens a file (selects in explorer)', async () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => false });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/some/file.txt' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns 500 when exec fails', async () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => true });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(new Error('exec failed'), '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/some/folder' });

        expect(res.status).toBe(500);
    });
});

// =============================================================================
// OS Integration — /kb/browse-folder
// =============================================================================

describe('POST /kb/browse-folder', () => {
    it('returns selected folder path', async () => {
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, '/selected/path\n', '');
        });
        mockExistsSync.mockReturnValue(true);

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBe('/selected/path');
    });

    it('returns null when user cancels', async () => {
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBeNull();
        expect(res.body.error).toBe('cancelled');
    });

    it('returns null on exec error', async () => {
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(new Error('dialog failed'), '', '');
        });

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBeNull();
    });

    it('returns null when selected path does not exist', async () => {
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, '/ghost/path\n', '');
        });
        mockExistsSync.mockReturnValue(false);

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBeNull();
    });
});
