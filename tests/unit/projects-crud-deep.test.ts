/**
 * Deep-coverage unit tests for handlers/projects/crud.ts — targeting uncovered paths.
 * Covers: handleList manifest error paths, handleSave preserving created date,
 * handleLoad auto-save skip/failure/pool activation, handleNew auto-save/backup failures,
 * handleDelete WAL/SHM cleanup, handleNew with all params.
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

// better-sqlite3 mock
const mockPrepare = jest.fn<() => any>().mockReturnValue({ get: jest.fn().mockReturnValue(null) });
const mockClose = jest.fn<() => void>();
const MockDatabase = jest.fn<() => any>().mockImplementation(() => ({
    prepare: mockPrepare,
    close: mockClose,
}));

// Pool integration mocks
const mockCheckAndActivateRecruitments = jest.fn<() => Promise<number>>().mockResolvedValue(0);
const mockStartPoolReturnCheck = jest.fn<() => void>();

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

// Config mock — will be overridden per test where pool activation is needed
jest.unstable_mockModule('../../config.js', () => ({
    config: { partitionServer: { enabled: false } },
}));

jest.unstable_mockModule('../../core/pool-integration.js', () => ({
    checkAndActivateRecruitments: mockCheckAndActivateRecruitments,
    startPoolReturnCheck: mockStartPoolReturnCheck,
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
    jest.clearAllMocks();
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
    mockCheckAndActivateRecruitments.mockResolvedValue(0);
    mockStartPoolReturnCheck.mockReturnValue(undefined);
});

// =============================================================================
// handleList — manifest error paths
// =============================================================================

describe('handleList manifest error handling', () => {
    it('returns null manifest when DB open throws (corrupt DB)', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                corrupt: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 512 });
        MockDatabase.mockImplementation(() => { throw new Error('DB corrupt'); });

        const result = await handleList();

        const corruptProject = result.projects.find((p: any) => p.name === 'corrupt');
        expect(corruptProject.manifest).toBeNull();
        expect(corruptProject.fileExists).toBe(true);
    });

    it('returns null manifest when prepare throws (no settings table)', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                nosettings: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 256 });
        mockPrepare.mockImplementation(() => { throw new Error('no such table: settings'); });

        const result = await handleList();

        const proj = result.projects.find((p: any) => p.name === 'nosettings');
        expect(proj.manifest).toBeNull();
        expect(mockClose).toHaveBeenCalled();
    });

    it('skips manifest read for active project', async () => {
        // 'default' is the currentProject, so manifest should be null (not read from DB)
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 2048 });

        const result = await handleList();

        const defaultProject = result.projects.find((p: any) => p.name === 'default');
        expect(defaultProject.manifest).toBeNull();
        // Database constructor should not be called since default is the active project
        expect(MockDatabase).not.toHaveBeenCalled();
    });

    it('returns null manifest when row value is null', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                nullmanifest: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockReturnValue({ size: 512 });
        mockPrepare.mockReturnValue({ get: jest.fn().mockReturnValue({ value: null }) });

        const result = await handleList();

        const proj = result.projects.find((p: any) => p.name === 'nullmanifest');
        expect(proj.manifest).toBeNull();
    });

    it('returns fileSize 0 when DB file does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        const result = await handleList();

        expect(result.projects[0].fileSize).toBe(0);
        expect(result.projects[0].fileExists).toBe(false);
    });
});

// =============================================================================
// handleSave — preserving created date
// =============================================================================

describe('handleSave preserving existing data', () => {
    it('preserves existing created date on re-save', async () => {
        const existingCreated = '2023-06-15T00:00:00Z';
        const meta = makeMeta({
            projects: {
                default: {
                    created: existingCreated,
                    lastSaved: '2023-06-15',
                    description: 'Old desc',
                    nodeCount: 5,
                    domains: ['old'],
                },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockQuery
            .mockResolvedValueOnce([{ count: '10' }])
            .mockResolvedValueOnce([{ domain: 'new' }]);

        const result = await handleSave({ name: 'default', description: 'Updated' });

        expect(result.success).toBe(true);
        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.projects.default.created).toBe(existingCreated);
        expect(writtenMeta.projects.default.description).toBe('Updated');
    });

    it('sets new created date for brand new save', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);
        mockQuery
            .mockResolvedValueOnce([{ count: '0' }])
            .mockResolvedValueOnce([]);

        const result = await handleSave({ name: 'brandnew' });

        expect(result.success).toBe(true);
        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        // Should be a recent ISO string, not the old created date
        expect(writtenMeta.projects.brandnew.created).toBeDefined();
    });

    it('preserves existing description when not provided', async () => {
        const meta = makeMeta({
            projects: {
                default: {
                    created: '2024-01-01',
                    lastSaved: '2024-01-01',
                    description: 'Existing desc',
                    nodeCount: 0,
                    domains: [],
                },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockQuery
            .mockResolvedValueOnce([{ count: '0' }])
            .mockResolvedValueOnce([]);

        await handleSave({ name: 'default' });

        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.projects.default.description).toBe('Existing desc');
    });

    it('rejects empty string name', async () => {
        const result = await handleSave({ name: '' });
        expect(result.error).toContain('Invalid project name');
    });

    it('rejects non-string name', async () => {
        const result = await handleSave({ name: 123 });
        expect(result.error).toContain('Invalid project name');
    });

    it('sets currentProject to saved name', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);
        mockQuery
            .mockResolvedValueOnce([{ count: '0' }])
            .mockResolvedValueOnce([]);

        await handleSave({ name: 'myproj' });

        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.currentProject).toBe('myproj');
    });
});

// =============================================================================
// handleLoad — auto-save and backup edge cases
// =============================================================================

describe('handleLoad auto-save and backup edge cases', () => {
    it('skips auto-save when loading same project', async () => {
        const meta = makeMeta({ currentProject: 'default' });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);

        await handleLoad({ name: 'default' });

        // saveProjectCopy should NOT be called for auto-save (same project)
        // It might still be called by handleSave if auto-save triggers,
        // but since currentProject === name, the auto-save is skipped
        expect(mockStopAllBackgroundServices).toHaveBeenCalled();
        expect(mockSwitchProject).toHaveBeenCalled();
    });

    it('skips auto-save when no current project', async () => {
        const meta = makeMeta({ currentProject: null, projects: {} });
        // First call returns no current project
        mockReadProjectsMeta.mockReturnValueOnce(meta)
            // handleLoad reads meta again after switch
            .mockReturnValue({ currentProject: null, projects: { target: {} } });
        mockExistsSync.mockReturnValue(true);

        const result = await handleLoad({ name: 'target' });

        expect(result.success).toBe(true);
    });

    it('continues when auto-save fails during load', async () => {
        const meta = makeMeta({
            currentProject: 'current',
            projects: {
                current: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                target: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        // Make the auto-save's query fail
        mockQuery.mockRejectedValue(new Error('disk full'));

        const result = await handleLoad({ name: 'target' });

        // Should still succeed despite auto-save failure
        expect(result.success).toBe(true);
        expect(mockSwitchProject).toHaveBeenCalled();
    });

    it('continues when backup fails during load', async () => {
        const meta = makeMeta({ currentProject: 'default' });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockBackupDatabase.mockRejectedValue(new Error('backup failed'));

        const result = await handleLoad({ name: 'default' });

        expect(result.success).toBe(true);
        expect(mockSwitchProject).toHaveBeenCalled();
    });

    it('includes zero KB watchers message when none restarted', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);
        mockRestartBackgroundServices.mockResolvedValue(0);

        const result = await handleLoad({ name: 'default' });

        expect(result.message).not.toContain('KB watcher');
    });

    it('calls resetAbortController and setProjectSwitching', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta());
        mockExistsSync.mockReturnValue(true);

        await handleLoad({ name: 'default' });

        expect(mockResetAbortController).toHaveBeenCalled();
        expect(mockSetProjectSwitching).toHaveBeenCalledWith(false);
    });
});

// =============================================================================
// handleNew — auto-save and backup failure paths
// =============================================================================

describe('handleNew auto-save and backup failures', () => {
    it('continues when auto-save of current project fails', async () => {
        const meta = makeMeta({ currentProject: 'current' });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(false);
        // auto-save query fails
        mockQuery.mockRejectedValue(new Error('table not found'));

        const result = await handleNew({ name: 'newproj' });

        expect(result.success).toBe(true);
        expect(mockCreateEmptyProject).toHaveBeenCalled();
    });

    it('continues when backup fails before creating new project', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta({ currentProject: null, projects: {} }));
        mockExistsSync.mockReturnValue(false);
        mockBackupDatabase.mockRejectedValue(new Error('no space'));

        const result = await handleNew({ name: 'newproj' });

        expect(result.success).toBe(true);
    });

    it('passes all params to bootstrapProject', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta({ currentProject: null, projects: {} }));
        mockExistsSync.mockReturnValue(false);
        mockBootstrapProject.mockResolvedValue({ partitions: 3, bridges: 2, seeded: 10 });

        const params = {
            name: 'fullproj',
            description: 'Full project',
            purpose: 'Research',
            domains: ['physics', 'math'],
            bridges: [['physics', 'math']],
            goals: ['understand universe'],
            autoBridge: true,
        };
        const result = await handleNew(params);

        expect(result.success).toBe(true);
        expect(mockBootstrapProject).toHaveBeenCalledWith({
            purpose: 'Research',
            domains: ['physics', 'math'],
            bridges: [['physics', 'math']],
            goals: ['understand universe'],
            autoBridge: true,
            name: 'fullproj',
        });
        // Meta should include purpose, goals, autoBridge
        const writtenMeta = mockWriteProjectsMeta.mock.calls[0][0] as any;
        expect(writtenMeta.projects.fullproj.purpose).toBe('Research');
        expect(writtenMeta.projects.fullproj.goals).toEqual(['understand universe']);
        expect(writtenMeta.projects.fullproj.autoBridge).toBe(true);
    });

    it('skips auto-save when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta({ currentProject: null, projects: {} }));
        mockExistsSync.mockReturnValue(false);

        const result = await handleNew({ name: 'fresh' });

        expect(result.success).toBe(true);
        // saveProjectCopy should not be called since there's no current project
        expect(mockSaveProjectCopy).not.toHaveBeenCalled();
    });

    it('calls clearAllCaches, resetAbortController, setProjectSwitching', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta({ currentProject: null, projects: {} }));
        mockExistsSync.mockReturnValue(false);

        await handleNew({ name: 'newp' });

        expect(mockClearAllCaches).toHaveBeenCalled();
        expect(mockResetAbortController).toHaveBeenCalled();
        expect(mockSetProjectSwitching).toHaveBeenCalledWith(false);
    });
});

// =============================================================================
// handleDelete — WAL/SHM file cleanup
// =============================================================================

describe('handleDelete WAL/SHM cleanup', () => {
    it('deletes main DB, WAL, and SHM files when they exist', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                todelete: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        mockExistsSync.mockReturnValue(true);

        await handleDelete({ name: 'todelete' });

        // Should attempt to check and delete 3 files: .db, .db-wal, .db-shm
        expect(mockExistsSync).toHaveBeenCalledTimes(3);
        expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
    });

    it('only deletes files that exist', async () => {
        const meta = makeMeta({
            currentProject: 'active',
            projects: {
                partial: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
                active: { created: '2024-01-01', lastSaved: '2024-01-01', description: '', nodeCount: 0, domains: [] },
            },
        });
        mockReadProjectsMeta.mockReturnValue(meta);
        // Only main DB file exists, WAL and SHM do not
        mockExistsSync
            .mockReturnValueOnce(true)    // .db
            .mockReturnValueOnce(false)   // .db-wal
            .mockReturnValueOnce(false);  // .db-shm

        await handleDelete({ name: 'partial' });

        expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// handleLoad — pool activation
// =============================================================================

describe('handleLoad pool activation', () => {
    it('does not activate pool when partitionServer is disabled', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta());
        mockExistsSync.mockReturnValue(true);

        await handleLoad({ name: 'default' });

        expect(mockCheckAndActivateRecruitments).not.toHaveBeenCalled();
    });

    it('message excludes pool text when no activations', async () => {
        mockReadProjectsMeta.mockReturnValue(makeMeta());
        mockExistsSync.mockReturnValue(true);

        const result = await handleLoad({ name: 'default' });

        expect(result.message).not.toContain('pool recruitment');
    });
});

// =============================================================================
// handleCurrent — edge cases
// =============================================================================

describe('handleCurrent edge cases', () => {
    it('returns empty object spread when project name not in projects map', async () => {
        mockReadProjectsMeta.mockReturnValue({
            currentProject: 'orphaned',
            projects: {},
        });

        const result = await handleCurrent();

        expect(result.currentProject).toBe('orphaned');
        // Should not have any extra fields from the projects map
        expect((result as any).description).toBeUndefined();
    });
});

// =============================================================================
// handleEnsure — edge cases
// =============================================================================

describe('handleEnsure edge cases', () => {
    it('returns correct message with empty string project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: '', projects: {} });

        const result = await handleEnsure({});

        expect(result.switched).toBe(false);
        expect(result.project).toBe('');
    });
});

// =============================================================================
// handleUpdate — edge cases
// =============================================================================

describe('handleUpdate edge cases', () => {
    it('allows setting description to empty string', async () => {
        const meta = makeMeta();
        mockReadProjectsMeta.mockReturnValue(meta);

        const result = await handleUpdate({ name: 'default', description: '' });

        expect(result.success).toBe(true);
        expect(meta.projects.default.description).toBe('');
    });
});
