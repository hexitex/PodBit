/**
 * API tests for routes/knowledge-base.ts
 *
 * Tests: KB folder CRUD, file management, pipeline status, extension mappings
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleKnowledgeBase = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../handlers/knowledge-base.js', () => ({
    handleKnowledgeBase: mockHandleKnowledgeBase,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: kbRouter } = await import('../../routes/knowledge-base.js');

/** Express app with KB router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', kbRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleKnowledgeBase.mockResolvedValue({ success: true });
});

// =============================================================================
// GET /kb/folders
// =============================================================================

describe('GET /kb/folders', () => {
    it('returns folders list', async () => {
        mockHandleKnowledgeBase.mockResolvedValue([{ id: 'f-1', domain: 'test' }]);
        const res = await request(buildApp()).get('/kb/folders');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('calls handleKnowledgeBase with action:folders', async () => {
        await request(buildApp()).get('/kb/folders');
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'folders' });
    });
});

// =============================================================================
// POST /kb/folders
// =============================================================================

describe('POST /kb/folders', () => {
    it('creates folder and returns 201', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ id: 'f-new', domain: 'research' });
        const res = await request(buildApp())
            .post('/kb/folders')
            .send({ folderPath: '/docs', domain: 'research' });
        expect(res.status).toBe(201);
        expect(res.body.id).toBe('f-new');
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Folder not found' });
        const res = await request(buildApp())
            .post('/kb/folders')
            .send({ folderPath: '/nonexistent' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Folder not found');
    });

    it('passes body to handler with action:add', async () => {
        await request(buildApp())
            .post('/kb/folders')
            .send({ folderPath: '/docs', domain: 'research', recursive: true });
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'add',
            folderPath: '/docs',
            domain: 'research',
            recursive: true,
        }));
    });
});

// =============================================================================
// PUT /kb/folders/:id
// =============================================================================

describe('PUT /kb/folders/:id', () => {
    it('updates folder settings', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });
        const res = await request(buildApp())
            .put('/kb/folders/f-1')
            .send({ watchEnabled: false });
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'update',
            folderId: 'f-1',
        }));
    });

    it('returns 400 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Folder not found' });
        const res = await request(buildApp())
            .put('/kb/folders/missing')
            .send({});
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// DELETE /kb/folders/:id
// =============================================================================

describe('DELETE /kb/folders/:id', () => {
    it('removes folder', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });
        const res = await request(buildApp()).delete('/kb/folders/f-1');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'remove',
            folderId: 'f-1',
            deleteNodes: false,
        }));
    });

    it('passes deleteNodes query param', async () => {
        await request(buildApp()).delete('/kb/folders/f-1?deleteNodes=true');
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            deleteNodes: true,
        }));
    });
});

// =============================================================================
// POST /kb/folders/:id/scan
// =============================================================================

describe('POST /kb/folders/:id/scan', () => {
    it('triggers scan', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ queued: 5 });
        const res = await request(buildApp()).post('/kb/folders/f-1/scan');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'scan', folderId: 'f-1' });
    });

    it('returns 400 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Folder not found' });
        const res = await request(buildApp()).post('/kb/folders/missing/scan');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /kb/files
// =============================================================================

describe('GET /kb/files', () => {
    it('returns files list', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ files: [], total: 0 });
        const res = await request(buildApp()).get('/kb/files');
        expect(res.status).toBe(200);
    });

    it('passes query params to handler', async () => {
        await request(buildApp()).get('/kb/files?folderId=f-1&status=processed&domain=test&limit=20&offset=40');
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'files',
            folderId: 'f-1',
            status: 'processed',
            domain: 'test',
            limit: 20,
            offset: 40,
        }));
    });
});

// =============================================================================
// GET /kb/files/:id
// =============================================================================

describe('GET /kb/files/:id', () => {
    it('returns file detail', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ id: 'file-1', chunks: [] });
        const res = await request(buildApp()).get('/kb/files/file-1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('file-1');
    });

    it('returns 404 when handler returns error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'File not found' });
        const res = await request(buildApp()).get('/kb/files/missing');
        expect(res.status).toBe(404);
    });
});

// =============================================================================
// POST /kb/files/:id/reprocess
// =============================================================================

describe('POST /kb/files/:id/reprocess', () => {
    it('reprocesses file', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ queued: true });
        const res = await request(buildApp()).post('/kb/files/file-1/reprocess');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'reprocess', fileId: 'file-1' });
    });

    it('returns 400 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'File not found' });
        const res = await request(buildApp()).post('/kb/files/missing/reprocess');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /kb/files/retry-failed
// =============================================================================

describe('POST /kb/files/retry-failed', () => {
    it('retries failed files', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ retried: 3 });
        const res = await request(buildApp()).post('/kb/files/retry-failed').send({});
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'retry' })
        );
    });
});

// =============================================================================
// GET /kb/status, /kb/readers, /kb/defaults, /kb/stats
// =============================================================================

describe('GET /kb/status', () => {
    it('returns pipeline status', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ running: false, queued: 0 });
        const res = await request(buildApp()).get('/kb/status');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'status' });
    });
});

describe('GET /kb/readers', () => {
    it('returns registered readers', async () => {
        mockHandleKnowledgeBase.mockResolvedValue([{ name: 'text', extensions: ['.txt'] }]);
        const res = await request(buildApp()).get('/kb/readers');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'readers' });
    });
});

describe('GET /kb/stats', () => {
    it('returns ingestion statistics', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ totalFiles: 10, processed: 8 });
        const res = await request(buildApp()).get('/kb/stats');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith({ action: 'stats' });
    });
});

// =============================================================================
// POST /kb/extensions/map
// =============================================================================

describe('POST /kb/extensions/map', () => {
    it('maps extension to reader', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });
        const res = await request(buildApp())
            .post('/kb/extensions/map')
            .send({ extension: '.mdx', reader: 'text' });
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'mapExtension',
            extension: '.mdx',
            reader: 'text',
        }));
    });

    it('returns 400 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Unknown reader' });
        const res = await request(buildApp())
            .post('/kb/extensions/map')
            .send({ extension: '.xyz', reader: 'unknown' });
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// DELETE /kb/extensions/:ext
// =============================================================================

describe('DELETE /kb/extensions/:ext', () => {
    it('unmaps extension', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ success: true });
        const res = await request(buildApp()).delete('/kb/extensions/.mdx');
        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
            action: 'unmapExtension',
            extension: '.mdx',
        }));
    });

    it('returns 400 on error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Extension not mapped' });
        const res = await request(buildApp()).delete('/kb/extensions/.xyz');
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /kb/open-path
// =============================================================================

describe('POST /kb/open-path', () => {
    it('returns 400 when filePath is missing', async () => {
        const res = await request(buildApp()).post('/kb/open-path').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('filePath');
    });
});
