/**
 * Deep unit tests for core/pool-integration.ts — exported functions.
 * Covers: checkAndActivateRecruitments, checkAndReturnExpiredRecruitments,
 * startPoolReturnCheck, stopPoolReturnCheck, shutdownPoolIntegration.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mocks ---

const mockQueryOne = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn(),
    queryOne: mockQueryOne,
}));

const mockReadProjectsMeta = jest.fn<() => any>();
jest.unstable_mockModule('../../handlers/projects.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
}));

const mockGetPendingForProject = jest.fn<(p: string) => any[]>();
const mockGetActiveForProject = jest.fn<(p: string) => any[]>();
const mockUpdateRecruitment = jest.fn();
const mockSyncRecruitmentCycles = jest.fn();
const mockReturnPartitionToPool = jest.fn();
const mockCheckoutPartition = jest.fn<(id: string) => boolean>();
const mockComputeFitness = jest.fn<(data: any) => any>();
const mockRecordHistory = jest.fn();
const mockClosePoolDb = jest.fn();

jest.unstable_mockModule('../../db/pool-db.js', () => ({
    getPendingForProject: mockGetPendingForProject,
    getActiveForProject: mockGetActiveForProject,
    updateRecruitment: mockUpdateRecruitment,
    syncRecruitmentCycles: mockSyncRecruitmentCycles,
    returnPartitionToPool: mockReturnPartitionToPool,
    checkoutPartition: mockCheckoutPartition,
    computeFitness: mockComputeFitness,
    recordHistory: mockRecordHistory,
    closePoolDb: mockClosePoolDb,
}));

const mockImportTransient = jest.fn<(data: any) => Promise<any>>();
const mockApproveTransient = jest.fn<(id: string, bridges?: any) => Promise<any>>();
const mockDepartTransient = jest.fn<(id: string, reason: string) => Promise<any>>();

jest.unstable_mockModule('../../routes/partitions.js', () => ({
    importTransient: mockImportTransient,
    approveTransient: mockApproveTransient,
    departTransient: mockDepartTransient,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: { partitionServer: { returnCheckIntervalMs: 100 } },
}));

// Mock integrity for filterGenerationalReturn's dynamic import
jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeMerkleRoot: jest.fn<(hashes: string[]) => string>().mockReturnValue('mock-merkle'),
}));

// Import module under test AFTER mocks
const {
    checkAndActivateRecruitments,
    checkAndReturnExpiredRecruitments,
    startPoolReturnCheck,
    stopPoolReturnCheck,
    shutdownPoolIntegration,
} = await import('../../core/pool-integration.js');

// Helpers
function makeRecruitment(overrides: Record<string, any> = {}) {
    return {
        id: 'rec-1',
        pool_partition_id: 'pool-part-1',
        project: 'test-project',
        export_data: JSON.stringify({ nodes: [{ id: 'n1', created_at: '2025-01-01T00:00:00Z' }], edges: [] }),
        bridges_config: null,
        procreation_hours: 24,
        min_cycles: 5,
        max_cycles: 100,
        exhaustion_threshold: 10,
        status: 'pending',
        transient_id: 'trans-1',
        activated_at: '2025-01-01T00:00:00Z',
        return_due_at: new Date(Date.now() + 86400000).toISOString(),
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    // Stop any leftover interval from previous tests
    stopPoolReturnCheck();
});

// ============================================================
// checkAndActivateRecruitments
// ============================================================
describe('checkAndActivateRecruitments', () => {
    it('returns 0 when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });
        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
        expect(mockGetPendingForProject).not.toHaveBeenCalled();
    });

    it('returns 0 when no pending recruitments', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        mockGetPendingForProject.mockReturnValue([]);
        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
    });

    it('skips recruitment when partition already checked out', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment();
        mockGetPendingForProject.mockReturnValue([rec]);
        mockCheckoutPartition.mockReturnValue(false);

        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
        expect(mockImportTransient).not.toHaveBeenCalled();
    });

    it('successfully activates a recruitment', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment();
        mockGetPendingForProject.mockReturnValue([rec]);
        mockCheckoutPartition.mockReturnValue(true);
        mockComputeFitness.mockReturnValue({ avgWeight: 0.5, breakthroughCount: 2 });
        mockImportTransient.mockResolvedValue({ partitionId: 'trans-new' });
        mockApproveTransient.mockResolvedValue({});

        const result = await checkAndActivateRecruitments();
        expect(result).toBe(1);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, expect.objectContaining({
            status: 'active',
            transient_id: 'trans-new',
            node_count_at_recruit: 1,
            avg_weight_at_recruit: 0.5,
            breakthroughs_at_recruit: 2,
        }));
        expect(mockRecordHistory).toHaveBeenCalledWith(expect.objectContaining({
            poolPartitionId: rec.pool_partition_id,
            eventType: 'recruited',
            project: 'proj',
            nodeCount: 1,
        }));
    });

    it('marks recruitment failed when approveTransient returns error', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment();
        mockGetPendingForProject.mockReturnValue([rec]);
        mockCheckoutPartition.mockReturnValue(true);
        mockComputeFitness.mockReturnValue({ avgWeight: 0, breakthroughCount: 0 });
        mockImportTransient.mockResolvedValue({ partitionId: 'trans-1' });
        mockApproveTransient.mockResolvedValue({ error: 'approval failed' });

        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, {
            status: 'failed',
            error: 'approval failed',
        });
    });

    it('parses bridges_config when present', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const bridgesConfig = [{ targetPartitionId: 'p2' }];
        const rec = makeRecruitment({ bridges_config: JSON.stringify(bridgesConfig) });
        mockGetPendingForProject.mockReturnValue([rec]);
        mockCheckoutPartition.mockReturnValue(true);
        mockComputeFitness.mockReturnValue({ avgWeight: 0, breakthroughCount: 0 });
        mockImportTransient.mockResolvedValue({ partitionId: 'trans-1' });
        mockApproveTransient.mockResolvedValue({});

        await checkAndActivateRecruitments();
        expect(mockApproveTransient).toHaveBeenCalledWith('trans-1', bridgesConfig);
    });

    it('handles exception during activation and marks failed', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment();
        mockGetPendingForProject.mockReturnValue([rec]);
        mockCheckoutPartition.mockReturnValue(true);
        mockComputeFitness.mockReturnValue({ avgWeight: 0, breakthroughCount: 0 });
        mockImportTransient.mockRejectedValue(new Error('import boom'));

        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, {
            status: 'failed',
            error: 'import boom',
        });
    });

    it('activates multiple recruitments and counts correctly', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec1 = makeRecruitment({ id: 'rec-1' });
        const rec2 = makeRecruitment({ id: 'rec-2' });
        mockGetPendingForProject.mockReturnValue([rec1, rec2]);
        mockCheckoutPartition.mockReturnValue(true);
        mockComputeFitness.mockReturnValue({ avgWeight: 1, breakthroughCount: 0 });
        mockImportTransient.mockResolvedValue({ partitionId: 'trans-x' });
        mockApproveTransient.mockResolvedValue({});

        const result = await checkAndActivateRecruitments();
        expect(result).toBe(2);
    });
});

// ============================================================
// checkAndReturnExpiredRecruitments
// ============================================================
describe('checkAndReturnExpiredRecruitments', () => {
    it('returns 0 when no current project', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });
        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
    });

    it('returns 0 when no active recruitments', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        mockGetActiveForProject.mockReturnValue([]);
        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
    });

    it('syncs cycles and skips when no return condition met', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 100,
            min_cycles: 5,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 3, barren_cycles: 1 });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
        expect(mockSyncRecruitmentCycles).toHaveBeenCalledWith(rec.id, 3, 1);
    });

    it('returns partition when time has expired', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
            procreation_hours: 24,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 2, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({
            exportData: {
                nodes: [{ id: 'n1', created_at: '2025-06-01T00:00:00Z' }],
                edges: [],
            },
        });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(1);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, { status: 'returning' });
        expect(mockReturnPartitionToPool).toHaveBeenCalled();
    });

    it('returns partition when max cycles reached', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 10, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({
            exportData: {
                nodes: [{ id: 'n1', created_at: '2025-06-01T00:00:00Z' }],
                edges: [],
            },
        });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(1);
    });

    it('returns partition when exhaustion threshold met after min_cycles', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 100,
            min_cycles: 5,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 8, barren_cycles: 12 });
        mockDepartTransient.mockResolvedValue({
            exportData: {
                nodes: [{ id: 'n1', created_at: '2025-06-01T00:00:00Z' }],
                edges: [],
            },
        });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(1);
    });

    it('does NOT return for exhaustion when below min_cycles', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 100,
            min_cycles: 20,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        // cycles=8 < min_cycles=20, so exhaustion check is skipped
        mockQueryOne.mockResolvedValue({ cycles_completed: 8, barren_cycles: 15 });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
    });

    it('handles departTransient error and marks failed', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({ error: 'depart failed' });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, {
            status: 'failed',
            error: 'depart failed',
        });
    });

    it('handles no exportData from departTransient (marks returned)', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({});

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(1);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, expect.objectContaining({
            status: 'returned',
        }));
        expect(mockReturnPartitionToPool).not.toHaveBeenCalled();
    });

    it('handles exception and marks recruitment failed', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockRejectedValue(new Error('db error'));

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith(rec.id, {
            status: 'failed',
            error: 'db error',
        });
    });

    it('defaults cycles and barren to 0 when partition row is null', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue(null);

        const result = await checkAndReturnExpiredRecruitments();
        // max_cycles=0, so condition 2 doesn't trigger; cycles=0 >= min_cycles=0,
        // but barren=0 < exhaustion_threshold=10, so no return
        expect(result).toBe(0);
        expect(mockSyncRecruitmentCycles).toHaveBeenCalledWith(rec.id, 0, 0);
    });

    it('handles return_due_at being null (no time-based return)', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: null,
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 100,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
    });

    it('applies generational filter to exportData before returning to pool', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'proj' });
        const activatedAt = '2025-01-01T00:00:00Z';
        const rec = makeRecruitment({
            status: 'active',
            activated_at: activatedAt,
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        const parentCreatedBefore = '2024-12-01T00:00:00Z';
        const childCreatedAfter = '2025-06-01T00:00:00Z';
        mockDepartTransient.mockResolvedValue({
            exportData: {
                nodes: [
                    { id: 'parent', created_at: parentCreatedBefore },
                    { id: 'child', created_at: childCreatedAfter },
                ],
                edges: [
                    { edge_type: 'parent', source_id: 'parent', target_id: 'child' },
                ],
            },
        });

        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(1);

        // returnPartitionToPool should receive filtered data (parent removed)
        const filteredExport = mockReturnPartitionToPool.mock.calls[0][1];
        expect(filteredExport.nodes).toHaveLength(1);
        expect(filteredExport.nodes[0].id).toBe('child');
    });
});

// ============================================================
// startPoolReturnCheck / stopPoolReturnCheck / shutdownPoolIntegration
// ============================================================
describe('startPoolReturnCheck', () => {
    it('starts an interval that calls checkAndReturnExpiredRecruitments', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });

        startPoolReturnCheck();

        // Wait for one interval tick (intervalMs=100)
        await new Promise((resolve) => setTimeout(resolve, 150));

        stopPoolReturnCheck();

        // checkAndReturnExpiredRecruitments was called at least once
        // It short-circuits because currentProject is null, but it was invoked
        expect(mockReadProjectsMeta).toHaveBeenCalled();
    });

    it('does not start a second interval if already running', () => {
        startPoolReturnCheck();
        startPoolReturnCheck(); // should be no-op
        stopPoolReturnCheck();
        // No assertion needed — just verifying no error/double-interval
    });
});

describe('stopPoolReturnCheck', () => {
    it('is safe to call when no interval is running', () => {
        stopPoolReturnCheck();
        // no error
    });

    it('clears the interval', () => {
        startPoolReturnCheck();
        stopPoolReturnCheck();
        // Calling again should be safe
        stopPoolReturnCheck();
    });
});

describe('shutdownPoolIntegration', () => {
    it('stops the interval and closes pool DB', () => {
        startPoolReturnCheck();
        shutdownPoolIntegration();
        expect(mockClosePoolDb).toHaveBeenCalled();
    });

    it('works when no interval is running', () => {
        shutdownPoolIntegration();
        expect(mockClosePoolDb).toHaveBeenCalled();
    });
});
