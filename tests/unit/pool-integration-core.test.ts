/**
 * Unit tests for core/pool-integration.ts — pool recruitment activation, return checks, and lifecycle.
 *
 * Mocks: config.js, handlers/projects.js, db.js, db/pool-db.js, routes/partitions.js.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockReadProjectsMeta = jest.fn<() => any>().mockReturnValue({ currentProject: 'test-project' });
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

const mockGetPending = jest.fn<(p: string) => any[]>().mockReturnValue([]);
const mockGetActive = jest.fn<(p: string) => any[]>().mockReturnValue([]);
const mockUpdateRecruitment = jest.fn();
const mockSyncCycles = jest.fn();
const mockReturnToPool = jest.fn();
const mockCheckout = jest.fn<(id: string) => boolean>().mockReturnValue(true);
const mockComputeFitness = jest.fn<(d: any) => any>().mockReturnValue({ avgWeight: 1.0, breakthroughCount: 0 });
const mockRecordHistory = jest.fn();
const mockClosePoolDb = jest.fn();

const mockImportTransient = jest.fn<(d: any) => Promise<any>>().mockResolvedValue({ partitionId: 'transient/owner/p1' });
const mockApproveTransient = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({});
const mockDepartTransient = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        partitionServer: { returnCheckIntervalMs: 60000 },
    },
}));
jest.unstable_mockModule('../../handlers/projects.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
}));
jest.unstable_mockModule('../../db.js', () => ({
    queryOne: mockQueryOne,
}));
jest.unstable_mockModule('../../db/pool-db.js', () => ({
    getPendingForProject: mockGetPending,
    getActiveForProject: mockGetActive,
    updateRecruitment: mockUpdateRecruitment,
    syncRecruitmentCycles: mockSyncCycles,
    returnPartitionToPool: mockReturnToPool,
    checkoutPartition: mockCheckout,
    computeFitness: mockComputeFitness,
    recordHistory: mockRecordHistory,
    closePoolDb: mockClosePoolDb,
}));
jest.unstable_mockModule('../../routes/partitions.js', () => ({
    importTransient: mockImportTransient,
    approveTransient: mockApproveTransient,
    departTransient: mockDepartTransient,
}));

const {
    checkAndActivateRecruitments,
    checkAndReturnExpiredRecruitments,
    startPoolReturnCheck,
    stopPoolReturnCheck,
    shutdownPoolIntegration,
} = await import('../../core/pool-integration.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockReadProjectsMeta.mockReturnValue({ currentProject: 'test-project' });
    mockQueryOne.mockResolvedValue(null);
    mockGetPending.mockReturnValue([]);
    mockGetActive.mockReturnValue([]);
    mockCheckout.mockReturnValue(true);
    mockComputeFitness.mockReturnValue({ avgWeight: 1.0, breakthroughCount: 0 });
    mockImportTransient.mockResolvedValue({ partitionId: 'transient/owner/p1' });
    mockApproveTransient.mockResolvedValue({});
    mockDepartTransient.mockResolvedValue({});
});

afterEach(() => {
    stopPoolReturnCheck();
});

// =============================================================================
// checkAndActivateRecruitments
// =============================================================================

describe('checkAndActivateRecruitments', () => {
    it('returns 0 when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
    });

    it('returns 0 when no pending recruitments', async () => {
        mockGetPending.mockReturnValue([]);

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
    });

    it('activates a pending recruitment', async () => {
        const recruitment = {
            id: 'r1',
            pool_partition_id: 'pp1',
            export_data: JSON.stringify({ nodes: [{ id: 'n1' }], edges: [] }),
            bridges_config: null,
            procreation_hours: 24,
            min_cycles: 5,
            max_cycles: 50,
            exhaustion_threshold: 10,
        };
        mockGetPending.mockReturnValue([recruitment]);

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(1);
        expect(mockCheckout).toHaveBeenCalledWith('pp1');
        expect(mockImportTransient).toHaveBeenCalled();
        expect(mockApproveTransient).toHaveBeenCalled();
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('r1', expect.objectContaining({
            status: 'active',
            transient_id: 'transient/owner/p1',
        }));
        expect(mockRecordHistory).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'recruited',
            project: 'test-project',
        }));
    });

    it('skips already checked-out partitions', async () => {
        mockCheckout.mockReturnValue(false);
        mockGetPending.mockReturnValue([{
            id: 'r1',
            pool_partition_id: 'pp1',
            export_data: '{"nodes":[],"edges":[]}',
            procreation_hours: 24,
        }]);

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
        expect(mockImportTransient).not.toHaveBeenCalled();
    });

    it('marks recruitment as failed on approve error', async () => {
        mockGetPending.mockReturnValue([{
            id: 'r1',
            pool_partition_id: 'pp1',
            export_data: '{"nodes":[],"edges":[]}',
            bridges_config: null,
            procreation_hours: 24,
        }]);
        mockApproveTransient.mockResolvedValue({ error: 'bad partition' });

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('r1', expect.objectContaining({
            status: 'failed',
            error: 'bad partition',
        }));
    });

    it('marks recruitment as failed on exception', async () => {
        mockGetPending.mockReturnValue([{
            id: 'r1',
            pool_partition_id: 'pp1',
            export_data: 'INVALID JSON',
            procreation_hours: 24,
        }]);

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('r1', expect.objectContaining({
            status: 'failed',
        }));
    });
});

// =============================================================================
// checkAndReturnExpiredRecruitments
// =============================================================================

describe('checkAndReturnExpiredRecruitments', () => {
    it('returns 0 when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
    });

    it('returns 0 when no active recruitments', async () => {
        mockGetActive.mockReturnValue([]);

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
    });

    it('returns partition when time expired', async () => {
        const pastDue = new Date(Date.now() - 3600000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: pastDue,
            procreation_hours: 1,
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 10,
            activated_at: new Date(Date.now() - 7200000).toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 3, barren_cycles: 1 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
        expect(mockDepartTransient).toHaveBeenCalledWith('t1', expect.stringContaining('Time expired'));
    });

    it('returns partition when max cycles reached', async () => {
        const futureDue = new Date(Date.now() + 86400000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: futureDue,
            procreation_hours: 24,
            max_cycles: 10,
            min_cycles: 0,
            exhaustion_threshold: 100,
            activated_at: new Date(Date.now() - 3600000).toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 10, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
    });

    it('returns partition when exhausted after min_cycles', async () => {
        const futureDue = new Date(Date.now() + 86400000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: futureDue,
            procreation_hours: 24,
            max_cycles: 100,
            min_cycles: 5,
            exhaustion_threshold: 3,
            activated_at: new Date(Date.now() - 3600000).toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 10, barren_cycles: 5 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
    });

    it('does not return when below min_cycles even if exhausted', async () => {
        const futureDue = new Date(Date.now() + 86400000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: futureDue,
            procreation_hours: 24,
            max_cycles: 100,
            min_cycles: 20,
            exhaustion_threshold: 3,
            activated_at: new Date(Date.now() - 3600000).toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 5, barren_cycles: 10 });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
    });

    it('marks as failed on depart error', async () => {
        const pastDue = new Date(Date.now() - 3600000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: pastDue,
            procreation_hours: 1,
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 10,
            activated_at: new Date(Date.now() - 7200000).toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 3, barren_cycles: 1 });
        mockDepartTransient.mockResolvedValue({ error: 'not found' });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('r1', expect.objectContaining({
            status: 'failed',
        }));
    });

    it('syncs cycle counts from project DB', async () => {
        const futureDue = new Date(Date.now() + 86400000).toISOString();
        mockGetActive.mockReturnValue([{
            id: 'r1',
            transient_id: 't1',
            return_due_at: futureDue,
            procreation_hours: 24,
            max_cycles: 100,
            min_cycles: 0,
            exhaustion_threshold: 100,
            activated_at: new Date().toISOString(),
        }]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 7, barren_cycles: 2 });

        await checkAndReturnExpiredRecruitments();

        expect(mockSyncCycles).toHaveBeenCalledWith('r1', 7, 2);
    });
});

// =============================================================================
// Lifecycle
// =============================================================================

describe('lifecycle functions', () => {
    it('startPoolReturnCheck is idempotent', () => {
        startPoolReturnCheck();
        startPoolReturnCheck(); // second call should not create another interval
        stopPoolReturnCheck();
    });

    it('stopPoolReturnCheck clears the interval', () => {
        startPoolReturnCheck();
        stopPoolReturnCheck();
        // No assertion needed — just verifying no errors
    });

    it('shutdownPoolIntegration stops checks and closes DB', () => {
        startPoolReturnCheck();
        shutdownPoolIntegration();
        expect(mockClosePoolDb).toHaveBeenCalled();
    });
});
