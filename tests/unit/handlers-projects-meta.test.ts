/**
 * Unit tests for handlers/projects/meta.ts —
 * readProjectsMeta, writeProjectsMeta, and the project-switching guard functions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks for fs (the only external dependency that has side effects)
// =============================================================================

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);
const mockReadFileSync = jest.fn<() => string>().mockReturnValue('{}');
const mockWriteFileSync = jest.fn<() => void>();
const mockMkdirSync = jest.fn<() => void>();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        writeFileSync: mockWriteFileSync,
        mkdirSync: mockMkdirSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
}));

const {
    readProjectsMeta,
    writeProjectsMeta,
    isProjectSwitching,
    getProjectAbortSignal,
    setProjectSwitching,
    getAbortController,
    resetAbortController,
} = await import('../../handlers/projects/meta.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');

    // Reset module-level state
    setProjectSwitching(false);
    resetAbortController();
});

// =============================================================================
// readProjectsMeta
// =============================================================================

describe('readProjectsMeta', () => {
    it('returns empty defaults when projects.json does not exist', () => {
        mockExistsSync.mockReturnValue(false);

        const result = readProjectsMeta();

        expect(result.currentProject).toBeNull();
        expect(result.projects).toEqual({});
    });

    it('returns parsed JSON when file exists and is valid', () => {
        const data = {
            currentProject: 'my-project',
            projects: { 'my-project': { created: '2024-01-01', lastSaved: '2024-01-02', description: 'Test', nodeCount: 5, domains: ['science'] } },
        };
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(data));

        const result = readProjectsMeta();

        expect(result.currentProject).toBe('my-project');
        expect(result.projects['my-project'].description).toBe('Test');
    });

    it('returns empty defaults when file exists but contains invalid JSON', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('{ invalid json !!!');

        const result = readProjectsMeta();

        expect(result.currentProject).toBeNull();
        expect(result.projects).toEqual({});
    });

    it('returns empty defaults when readFileSync throws', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

        const result = readProjectsMeta();

        expect(result.currentProject).toBeNull();
        expect(result.projects).toEqual({});
    });

    it('does not call readFileSync when file does not exist', () => {
        mockExistsSync.mockReturnValue(false);

        readProjectsMeta();

        expect(mockReadFileSync).not.toHaveBeenCalled();
    });
});

// =============================================================================
// writeProjectsMeta
// =============================================================================

describe('writeProjectsMeta', () => {
    it('writes JSON to the projects file', () => {
        mockExistsSync.mockReturnValue(true); // dir exists

        const data = { currentProject: 'proj', projects: {} };
        writeProjectsMeta(data);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
            expect.stringContaining('projects.json'),
            JSON.stringify(data, null, 2),
        );
    });

    it('creates the data directory when it does not exist', () => {
        mockExistsSync.mockReturnValue(false); // dir does not exist

        writeProjectsMeta({ currentProject: null, projects: {} });

        expect(mockMkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('data'),
            { recursive: true },
        );
    });

    it('does not call mkdirSync when directory already exists', () => {
        mockExistsSync.mockReturnValue(true); // dir exists

        writeProjectsMeta({ currentProject: null, projects: {} });

        expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('writes the file path under the data/ directory', () => {
        mockExistsSync.mockReturnValue(true);

        writeProjectsMeta({ currentProject: 'test', projects: {} });

        const [writePath] = (mockWriteFileSync.mock.calls[0] as any[]);
        expect(String(writePath)).toMatch(/data[/\\]projects\.json$/);
    });
});

// =============================================================================
// Project switching guard
// =============================================================================

describe('isProjectSwitching / setProjectSwitching', () => {
    it('returns false initially', () => {
        expect(isProjectSwitching()).toBe(false);
    });

    it('returns true after setProjectSwitching(true)', () => {
        setProjectSwitching(true);
        expect(isProjectSwitching()).toBe(true);
    });

    it('returns false after setProjectSwitching(false)', () => {
        setProjectSwitching(true);
        setProjectSwitching(false);
        expect(isProjectSwitching()).toBe(false);
    });
});

// =============================================================================
// AbortController management
// =============================================================================

describe('getAbortController / getProjectAbortSignal / resetAbortController', () => {
    it('getAbortController returns an AbortController', () => {
        const ctrl = getAbortController();
        expect(typeof ctrl.abort).toBe('function');
        expect(ctrl.signal).toBeDefined();
    });

    it('getProjectAbortSignal returns the same signal as the current controller', () => {
        const signal = getProjectAbortSignal();
        const ctrl = getAbortController();
        expect(signal).toBe(ctrl.signal);
    });

    it('resetAbortController creates a new controller with a fresh signal', () => {
        const originalSignal = getProjectAbortSignal();
        resetAbortController();
        const newSignal = getProjectAbortSignal();
        expect(newSignal).not.toBe(originalSignal);
    });

    it('aborted original signal is not aborted after reset', () => {
        getAbortController().abort();
        expect(getProjectAbortSignal().aborted).toBe(true);

        resetAbortController();
        expect(getProjectAbortSignal().aborted).toBe(false);
    });

    it('getAbortController after reset returns new controller', () => {
        const originalCtrl = getAbortController();
        resetAbortController();
        const newCtrl = getAbortController();
        expect(newCtrl).not.toBe(originalCtrl);
    });
});
