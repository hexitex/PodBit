/**
 * Unit tests for handlers/projects/crud.ts —
 * handleList, handleCurrent, handleSave, handleLoad, handleNew, handleDelete,
 * handleUpdate, handleEnsure.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadProjectsMeta = jest.fn<() => any>();
const mockWriteProjectsMeta = jest.fn<() => void>();
const mockSetProjectSwitching = jest.fn<() => void>();
const mockResetAbortController = jest.fn<() => void>();

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockBackupDatabase = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSwitchProject = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSaveProjectCopy = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCreateEmptyProject = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetProjectDir = jest.fn<() => string>().mockReturnValue('/projects');

const mockApplyEncryptionKey = jest.fn<() => void>();
const mockStopAllBackgroundServices = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClearAllCaches = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRestartBackgroundServices = jest.fn<() => Promise<number>>().mockResolvedValue(0);
const mockBootstrapProject = jest.fn<() => Promise<any>>().mockResolvedValue({
    partitions: 1, bridges: 0, seeded: 0,
});

// fs mock
const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockStatSync = jest.fn<(p: string) => any>().mockReturnValue({ size: 1024 });
const mockUnlinkSync = jest.fn<() => void>();

// better-sqlite3 mock — stub out the Database class
const mockPrepare = jest.fn<() => any>().mockReturnValue({ get: jest.fn().mockReturnValue(null) });
const mockClose = jest.fn<() => void>();
const MockDatabase = jest.fn<() => any>().mockImplementation(() => ({
    prepare: mockPrepare,
    close: mockClose,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
    writeProjectsMeta: mockWriteProjectsMeta,
    setProjectSwitching: mockSetProjectSwitching,
    resetAbortController: mockResetAbortController,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    backupDatabase: mockBackupDatabase,
    switchProject: mockSwitchProject,
    saveProjectCopy: mockSaveProjectCopy,
    createEmptyProject: mockCreateEmptyProject,
    getProjectDir: mockGetProjectDir,
}));

jest.unstable_mockModule('../../db/sqlite-backend.js', () => ({
    applyEncryptionKey: mockApplyEncryptionKey,
}));

jest.unstable_mockModule('../../handlers/projects/services.js', () => ({
    stopAllBackgroundServices: mockStopAllBackgroundServices,
    clearAllCaches: mockClearAllCaches,
    restartBackgroundServices: mockRestartBackgroundServices,
}));

jest.unstable_mockModule('../../handlers/projects/bootstrap.js', () => ({
    bootstrapProject: mockBootstrapProject,
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        statSync: mockStatSync,
        unlinkSync: mockUnlinkSync,
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
        mkdirSync: jest.fn(),
    },
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    unlinkSync: mockUnlinkSync,
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

jest.unstable_mockModule('better-sqlite3', () => ({
    default: MockDatabase,
}));

// Config mock for handleLoad's pool activation
jest.unstable_mockModule('../../config.js', () => ({
    config: { partitionServer: { enabled: false } },
}));

const {
    handleList,
    handleCurrent,
    handleSave,
    handleLoad,
    handleNew,
    handleDelete,
    handleUpdate,
    handleEnsure,
} = await import('../../handlers/projects/crud.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMeta(overrides: Record<string, any> = {}) {
    return {
        currentProject: 'default',
        projects: {
            default: {
                created: '2024-01-01T00:00:00Z',
                lastSaved: '2024-01-01T00:00:00Z',
                description: 'Default project',
                nodeCount: 10,
                domains: ['science'],
            },
        },
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockReadProjectsMeta.mockReturnValue(makeMeta());
    mockWriteProjectsMeta.mockReturnValue(undefined);
    mockSetProjectSwitching.mockReturnValue(undefined);
    mockResetAbortController.mockReturnValue(undefined);
    mockQuery.mockResolvedValue([]);
    mockBackupDatabase.mockResolvedValue(undefined);
    mockSwitchProject.mockResolvedValue(undefined);
    mockSaveProjectCopy.mockResolvedValue(undefined);
    mockCreateEmptyProject.mockResolvedValue(undefined);
    mockGetProjectDir.mockReturnValue('/projects');
    mockStopAllBackgroundServices.mockResolvedValue(undefined);
    mockClearAllCaches.mockResolvedValue(undefined);
    mockRestartBackgroundServices.mockResolvedValue(0);
    mockBootstrapProject.mockResolvedValue({ partitions: 1, bridges: 0, seeded: 0 });
    mockExistsSync.mockReturnValue(false);
    mockStatSync.mockReturnValue({ size: 1024 });
    mockUnlinkSync.mockReturnValue(undefined);
    MockDatabase.mockImplementation(() => ({
        prepare: mockPrepare,
        close: mockClose,
    }));
    mockPrepare.mockReturnValue({ get: jest.fn().mockReturnValue(null) });
    mockClose.mockReturnValue(undefined);
});

// =============================================================================
// handleCurrent
// =============================================================================

describe('handleCurrent', () => {
    it('returns null when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        const result = await handleCurrent();
        expect(result.currentProject).toBeNull();
    });

    it('returns current project name and meta', async () => {
        const result = await handleCurrent();
        expect(result.currentProject).toBe('default');
        expect((result as any).description).toBe('Default project');
    });
});

// =============================================================================
// handleEnsure
// =============================================================================

describe('handleEnsure', () => {
    it('returns switched: false and current project without switching', async () => {
        const result = await handleEnsure({});
        expect(result.switched).toBe(false);
        expect(result.project).toBe('default');
        expect(result.message).toContain('default');
    });

    it('reports none when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        const result = await handleEnsure({});
        expect(result.project).toBeNull();
        expect(result.message).toContain('none');
    });
});

// =============================================================================
// handleUpdate
// =============================================================================

describe('handleUpdate', () => {
    it('returns error when name is missing', async () => {
        const result = await handleUpdate({});
        expect(result.error).toContain('name is required');
    });

    it('returns error when project not found', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        const result = await handleUpdate({ name: 'nonexistent' });
        expect(result.error).toContain('not found');
    });

    it('updates description and returns success', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);

        const result = await handleUpdate({ name: 'default', description: 'Updated description' });
        expect(result.success).toBe(true);
        expect(result.name).toBe('default');
        expect(meta.projects.default.description).toBe('Updated description');
        expect(mockWriteProjectsMeta).toHaveBeenCalledWith(meta);
    });

    it('does not update description when not provided', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);
        const originalDesc = meta.projects.default.description;

        await handleUpdate({ name: 'default' });

        expect(meta.projects.default.description).toBe(originalDesc);
    });
});

// =============================================================================
// handleDelete
// =============================================================================

describe('handleDelete', () => {
    it('returns error when name is missing', async () => {
        const result = await handleDelete({});
        expect(result.error).toContain('name is required');
    });

    it('returns error when trying to delete active project', async () => {
        const result = await handleDelete({ name: 'default' });
        expect(result.error).toContain('Cannot delete the currently active project');
    });

    it('deletes project DB files and removes from meta', async () => {
        const meta = makeMeta({
            currentProject: 'other',
            projects: {
                default: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                other: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);

        const result = await handleDelete({ name: 'default' });
        expect(result.success).toBe(true);
        expect(result.message).toContain('default');
        expect(meta.projects.default).toBeUndefined();
        expect(mockWriteProjectsMeta).toHaveBeenCalledWith(meta);
    });

    it('skips unlinkSync when DB files do not exist', async () => {
        const meta = makeMeta({
            currentProject: 'other',
            projects: {
                default: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                other: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(false);

        await handleDelete({ name: 'default' });

        expect(mockUnlinkSync).not.toHaveBeenCalled();
    });
});

// =============================================================================
// handleSave
// =============================================================================

describe('handleSave', () => {
    it('returns error when name is invalid', async () => {
        const result = await handleSave({ name: 'invalid name!' });
        expect(result.error).toContain('Invalid project name');
    });

    it('saves project and returns success', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '42' }])      // node count
            .mockResolvedValueOnce([{ domain: 'science' }]); // domains

        const result = await handleSave({ name: 'myproject', description: 'My project' });

        expect(result.success).toBe(true);
        expect(result.name).toBe('myproject');
        expect(mockSaveProjectCopy).toHaveBeenCalled();
        expect(mockWriteProjectsMeta).toHaveBeenCalled();

        // Verify meta was updated with node count and domains
        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.projects.myproject.nodeCount).toBe(42);
        expect(writtenMeta.projects.myproject.domains).toEqual(['science']);
    });

    it('handles query errors gracefully (nodeCount stays 0)', async () => {
        mockQuery.mockRejectedValue(new Error('table not found'));

        const result = await handleSave({ name: 'myproject' });

        expect(result.success).toBe(true);
        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.projects.myproject.nodeCount).toBe(0);
    });
});

// =============================================================================
// handleLoad
// =============================================================================

describe('handleLoad', () => {
    it('returns error when name is missing', async () => {
        const result = await handleLoad({});
        expect(result.error).toContain('name is required');
    });

    it('returns error when project DB file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);
        const result = await handleLoad({ name: 'nonexistent' });
        expect(result.error).toContain('not found');
    });

    it('loads project: stops services, switches DB, clears caches, restarts services', async () => {
        mockExistsSync.mockReturnValue(true);
        // first call: srcPath exists. subsequent calls in handleSave (auto-save) can be false
        const meta = makeMeta({
            currentProject: 'other',
            projects: {
                default: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                other: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockRestartBackgroundServices.mockResolvedValue(2);

        const result = await handleLoad({ name: 'default' });

        expect(result.success).toBe(true);
        expect(result.name).toBe('default');
        expect(mockStopAllBackgroundServices).toHaveBeenCalled();
        expect(mockSwitchProject).toHaveBeenCalled();
        expect(mockClearAllCaches).toHaveBeenCalled();
        expect(mockRestartBackgroundServices).toHaveBeenCalled();
        expect(result.message).toContain('2 KB watcher(s)');
    });
});

// =============================================================================
// handleNew
// =============================================================================

describe('handleNew', () => {
    it('returns error when name is invalid', async () => {
        const result = await handleNew({ name: 'bad name!' });
        expect(result.error).toContain('Invalid project name');
    });

    it('returns error when project already exists', async () => {
        mockExistsSync.mockReturnValue(true);
        const result = await handleNew({ name: 'default' });
        expect(result.error).toContain('already exists');
    });

    it('creates new project with bootstrap result', async () => {
        mockExistsSync.mockReturnValue(false);
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        mockBootstrapProject.mockResolvedValue({ partitions: 2, bridges: 1, seeded: 5 });

        const result = await handleNew({ name: 'newproject', description: 'New', domains: ['art'] });

        expect(result.success).toBe(true);
        expect(result.name).toBe('newproject');
        expect(result.message).toContain('2 partition(s)');
        expect(result.message).toContain('5 foundational seed(s)');
        expect(mockCreateEmptyProject).toHaveBeenCalled();
        expect(mockBootstrapProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'newproject' }));
    });

    it('uses generic message when no seeds', async () => {
        mockExistsSync.mockReturnValue(false);
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        mockBootstrapProject.mockResolvedValue({ partitions: 0, bridges: 0, seeded: 0 });

        const result = await handleNew({ name: 'emptyproject' });

        expect(result.message).toContain('Fresh knowledge base ready');
    });
});

// =============================================================================
// handleList
// =============================================================================

describe('handleList', () => {
    it('returns current project and projects list', async () => {
        mockExistsSync.mockReturnValue(false); // DB files don't exist

        const result = await handleList();

        expect(result.currentProject).toBe('default');
        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].name).toBe('default');
        expect(result.projects[0].fileExists).toBe(false);
        expect(result.projects[0].fileSize).toBe(0);
    });

    it('includes file size when DB exists', async () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 4096 });

        const result = await handleList();

        expect(result.projects[0].fileSize).toBe(4096);
        expect(result.projects[0].fileExists).toBe(true);
    });

    it('reads manifest from non-active project DB', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                default: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 512 });

        const manifestData = { name: 'default', purpose: 'Testing' };
        const mockGet = jest.fn().mockReturnValue({ value: JSON.stringify(manifestData) });
        mockPrepare.mockReturnValue({ get: mockGet });

        const result = await handleList();

        const defaultProject = result.projects.find((p: any) => p.name === 'default');
        expect(defaultProject.manifest).toEqual(manifestData);
    });
});
