/**
 * Deep unit tests for routes/knowledge-base.ts —
 * Covers uncovered paths: browse-folder timeout/killed, extension unmap error,
 * open-path filePath type validation, retry-failed without body, files with no query params.
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

// Mock os for platform-specific branches
const mockPlatform = jest.fn<() => string>().mockReturnValue('win32');
jest.unstable_mockModule('os', () => ({
    default: { platform: mockPlatform },
    platform: mockPlatform,
}));

// Mock SMB service
const mockConnectShare = jest.fn<() => Promise<any>>().mockResolvedValue({
    id: 'server/docs', host: 'server', share: 'docs', username: 'user',
    uncPath: '\\\\server\\docs', connectedAt: new Date().toISOString(),
});
const mockDisconnectShare = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockListConnections = jest.fn<() => any[]>().mockReturnValue([]);
const mockTestConnection = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, fileCount: 5 });

jest.unstable_mockModule('../../services/smb.js', () => ({
    connectShare: mockConnectShare,
    disconnectShare: mockDisconnectShare,
    listConnections: mockListConnections,
    testConnection: mockTestConnection,
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
    mockPlatform.mockReturnValue('win32');
});

// =============================================================================
// POST /kb/browse-folder — timeout/killed edge case
// =============================================================================

describe('POST /kb/browse-folder — timeout/killed', () => {
    it('returns error=timeout when exec error has killed=true', async () => {
        const killedErr = new Error('killed') as any;
        killedErr.killed = true;
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(killedErr, '', '');
        });

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBeNull();
        expect(res.body.error).toBe('timeout');
    });

    it('returns error=cancelled when exec error has killed=false', async () => {
        const err = new Error('user cancelled') as any;
        err.killed = false;
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(err, '', '');
        });

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBeNull();
        expect(res.body.error).toBe('cancelled');
    });
});

// =============================================================================
// POST /kb/browse-folder — platform-specific commands
// =============================================================================

describe('POST /kb/browse-folder — platform commands', () => {
    it('uses osascript on darwin', async () => {
        mockPlatform.mockReturnValue('darwin');
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, '/Users/test/folder\n', '');
        });
        mockExistsSync.mockReturnValue(true);

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBe('/Users/test/folder');
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('osascript'),
            expect.any(Object),
            expect.any(Function),
        );
    });

    it('uses zenity/kdialog on linux', async () => {
        mockPlatform.mockReturnValue('linux');
        mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
            cb(null, '/home/user/docs\n', '');
        });
        mockExistsSync.mockReturnValue(true);

        const res = await request(app).post('/kb/browse-folder');

        expect(res.status).toBe(200);
        expect(res.body.selected).toBe('/home/user/docs');
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('zenity'),
            expect.any(Object),
            expect.any(Function),
        );
    });
});

// =============================================================================
// DELETE /kb/extensions/:ext — error path
// =============================================================================

describe('DELETE /kb/extensions/:ext — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ error: 'Extension not found' });

        const res = await request(app).delete('/kb/extensions/.xyz');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Extension not found');
    });
});

// =============================================================================
// POST /kb/open-path — filePath type validation
// =============================================================================

describe('POST /kb/open-path — filePath type validation', () => {
    it('returns 400 when filePath is a number', async () => {
        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: 123 });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('filePath is required');
    });

    it('returns 400 when filePath is empty string', async () => {
        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('filePath is required');
    });
});

// =============================================================================
// POST /kb/open-path — platform-specific commands
// =============================================================================

describe('POST /kb/open-path — platform variations', () => {
    it('uses open on darwin for directories', async () => {
        mockPlatform.mockReturnValue('darwin');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => true });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/Users/test/folder' });

        expect(res.status).toBe(200);
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('open'),
            expect.any(Function),
        );
    });

    it('uses open -R on darwin for files', async () => {
        mockPlatform.mockReturnValue('darwin');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => false });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/Users/test/file.txt' });

        expect(res.status).toBe(200);
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('open -R'),
            expect.any(Function),
        );
    });

    it('uses xdg-open on linux for directories', async () => {
        mockPlatform.mockReturnValue('linux');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => true });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/home/user/docs' });

        expect(res.status).toBe(200);
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('xdg-open'),
            expect.any(Function),
        );
    });

    it('uses xdg-open on linux for files (opens containing folder)', async () => {
        mockPlatform.mockReturnValue('linux');
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ isDirectory: () => false });
        mockExec.mockImplementation((_cmd: string, cb: Function) => {
            cb(null, '', '');
        });

        const res = await request(app)
            .post('/kb/open-path')
            .send({ filePath: '/home/user/file.txt' });

        expect(res.status).toBe(200);
        expect(mockExec).toHaveBeenCalledWith(
            expect.stringContaining('xdg-open'),
            expect.any(Function),
        );
    });
});

// =============================================================================
// POST /kb/files/retry-failed — without folderId
// =============================================================================

describe('POST /kb/files/retry-failed — no body', () => {
    it('retries all failed files when no folderId provided', async () => {
        mockHandleKnowledgeBase.mockResolvedValue({ retried: 10 });

        const res = await request(app)
            .post('/kb/files/retry-failed')
            .send({});

        expect(res.status).toBe(200);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'retry', folderId: undefined })
        );
    });
});

// =============================================================================
// GET /kb/files — partial query params (limit without offset and vice versa)
// =============================================================================

describe('GET /kb/files — partial query params', () => {
    it('passes limit without offset', async () => {
        await request(app).get('/kb/files?limit=25');

        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'files',
                limit: 25,
                offset: undefined,
            })
        );
    });

    it('passes offset without limit', async () => {
        await request(app).get('/kb/files?offset=10');

        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'files',
                limit: undefined,
                offset: 10,
            })
        );
    });

    it('passes no filters when query is empty', async () => {
        await request(app).get('/kb/files');

        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'files',
                folderId: undefined,
                status: undefined,
                domain: undefined,
                limit: undefined,
                offset: undefined,
            })
        );
    });
});

// =============================================================================
// SMB Routes
// =============================================================================

describe('GET /kb/smb/connections', () => {
    it('returns list of connections', async () => {
        mockListConnections.mockReturnValue([
            { id: 'a/b', host: 'a', share: 'b', uncPath: '\\\\a\\b', username: 'u', connectedAt: '2025-01-01T00:00:00Z' },
        ]);

        const res = await request(app).get('/kb/smb/connections');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].uncPath).toBe('\\\\a\\b');
    });
});

describe('POST /kb/smb/connect', () => {
    it('connects with valid credentials', async () => {
        const res = await request(app).post('/kb/smb/connect').send({
            host: 'server', share: 'docs', username: 'admin', password: 'secret',
        });

        expect(res.status).toBe(200);
        expect(res.body.uncPath).toBe('\\\\server\\docs');
        expect(mockConnectShare).toHaveBeenCalledWith(expect.objectContaining({
            host: 'server', share: 'docs', username: 'admin', password: 'secret',
        }));
    });

    it('includes domain when provided', async () => {
        const res = await request(app).post('/kb/smb/connect').send({
            host: 'server', share: 'docs', username: 'admin', password: 'secret', domain: 'CORP',
        });

        expect(res.status).toBe(200);
        expect(mockConnectShare).toHaveBeenCalledWith(expect.objectContaining({ domain: 'CORP' }));
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app).post('/kb/smb/connect').send({
            host: 'server',
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/);
    });

    it('returns 400 when connectShare throws', async () => {
        mockConnectShare.mockRejectedValueOnce(new Error('System error 53'));

        const res = await request(app).post('/kb/smb/connect').send({
            host: 'bad', share: 'nope', username: 'u', password: 'p',
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('System error 53');
    });
});

describe('POST /kb/smb/test', () => {
    it('returns success result', async () => {
        const res = await request(app).post('/kb/smb/test').send({
            host: 'nas', share: 'research', username: 'admin', password: 'pass',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.fileCount).toBe(5);
    });

    it('returns 400 when fields are missing', async () => {
        const res = await request(app).post('/kb/smb/test').send({ host: 'nas' });
        expect(res.status).toBe(400);
    });
});

describe('POST /kb/smb/disconnect', () => {
    it('disconnects a share', async () => {
        const res = await request(app).post('/kb/smb/disconnect').send({
            host: 'server', share: 'docs',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDisconnectShare).toHaveBeenCalledWith('server', 'docs');
    });

    it('returns 400 when fields are missing', async () => {
        const res = await request(app).post('/kb/smb/disconnect').send({});
        expect(res.status).toBe(400);
    });
});
