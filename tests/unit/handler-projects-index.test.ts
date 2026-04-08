/**
 * Tests for handlers/projects/index.ts — handleProjects dispatcher.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleList = jest.fn<(...args: any[]) => any>().mockResolvedValue({ projects: [] });
const mockHandleCurrent = jest.fn<(...args: any[]) => any>().mockResolvedValue({ name: 'test' });
const mockHandleSave = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });
const mockHandleLoad = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });
const mockHandleNew = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });
const mockHandleDelete = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });
const mockHandleUpdate = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });
const mockHandleEnsure = jest.fn<(...args: any[]) => any>().mockResolvedValue({ name: 'test' });
const mockHandleInterview = jest.fn<(...args: any[]) => any>().mockResolvedValue({ stage: 'started' });
const mockHandleManifest = jest.fn<(...args: any[]) => any>().mockResolvedValue({ manifest: {} });
const mockHandleUpdateManifest = jest.fn<(...args: any[]) => any>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/projects/crud.js', () => ({
    handleList: mockHandleList,
    handleCurrent: mockHandleCurrent,
    handleSave: mockHandleSave,
    handleLoad: mockHandleLoad,
    handleNew: mockHandleNew,
    handleDelete: mockHandleDelete,
    handleUpdate: mockHandleUpdate,
    handleEnsure: mockHandleEnsure,
}));

jest.unstable_mockModule('../../handlers/projects/interview.js', () => ({
    handleInterview: mockHandleInterview,
    cleanupStaleInterviews: jest.fn(),
}));

jest.unstable_mockModule('../../handlers/projects/manifest.js', () => ({
    handleManifest: mockHandleManifest,
    handleUpdateManifest: mockHandleUpdateManifest,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: jest.fn(),
    writeProjectsMeta: jest.fn(),
    isProjectSwitching: jest.fn(),
    getProjectAbortSignal: jest.fn(),
}));

jest.unstable_mockModule('../../handlers/projects/services.js', () => ({
    stopAllBackgroundServices: jest.fn(),
    clearAllCaches: jest.fn(),
    restartBackgroundServices: jest.fn(),
}));

jest.unstable_mockModule('../../handlers/projects/bootstrap.js', () => ({
    bootstrapProject: jest.fn(),
    generateBootstrapSeeds: jest.fn(),
}));

const { handleProjects } = await import('../../handlers/projects/index.js');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleProjects', () => {
    it('dispatches list action', async () => {
        await handleProjects({ action: 'list' });
        expect(mockHandleList).toHaveBeenCalled();
    });

    it('dispatches current action', async () => {
        await handleProjects({ action: 'current' });
        expect(mockHandleCurrent).toHaveBeenCalled();
    });

    it('dispatches save action with params', async () => {
        await handleProjects({ action: 'save', name: 'proj' });
        expect(mockHandleSave).toHaveBeenCalledWith({ action: 'save', name: 'proj' });
    });

    it('dispatches load action', async () => {
        await handleProjects({ action: 'load', name: 'proj' });
        expect(mockHandleLoad).toHaveBeenCalledWith({ action: 'load', name: 'proj' });
    });

    it('dispatches new action', async () => {
        await handleProjects({ action: 'new', name: 'new-proj' });
        expect(mockHandleNew).toHaveBeenCalled();
    });

    it('dispatches delete action', async () => {
        await handleProjects({ action: 'delete', name: 'old' });
        expect(mockHandleDelete).toHaveBeenCalled();
    });

    it('dispatches update action', async () => {
        await handleProjects({ action: 'update', name: 'proj' });
        expect(mockHandleUpdate).toHaveBeenCalled();
    });

    it('dispatches ensure action', async () => {
        await handleProjects({ action: 'ensure' });
        expect(mockHandleEnsure).toHaveBeenCalled();
    });

    it('dispatches interview action', async () => {
        await handleProjects({ action: 'interview' });
        expect(mockHandleInterview).toHaveBeenCalled();
    });

    it('dispatches manifest action', async () => {
        await handleProjects({ action: 'manifest' });
        expect(mockHandleManifest).toHaveBeenCalled();
    });

    it('dispatches updateManifest action', async () => {
        await handleProjects({ action: 'updateManifest', content: 'new' });
        expect(mockHandleUpdateManifest).toHaveBeenCalled();
    });

    it('returns error for unknown action', async () => {
        const result = await handleProjects({ action: 'unknown' });
        expect(result).toEqual(expect.objectContaining({ error: expect.stringContaining('Unknown action') }));
    });
});
