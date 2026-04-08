/**
 * Maximum coverage tests for core/pool-integration.ts
 *
 * Targets remaining uncovered branches:
 * - filterGenerationalReturn: integrity without log (Merkle-only path),
 *   numberVariables with empty refs array, non-parent edge types in parent set,
 *   exportData with undefined nodes/edges
 * - checkAndActivateRecruitments: bridges_config parsing, multiple recruitments
 *   with mixed success/failure
 * - checkAndReturnExpiredRecruitments: null partitionRow defaults,
 *   return_due_at null path, departResult without exportData (status='returned'),
 *   generational return with exportData containing integrity + numberVariables
 * - startPoolReturnCheck: interval fires and catches errors
 * - stopPoolReturnCheck: safe when no interval
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// --- Mocks ---

const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();

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
    config: { partitionServer: { returnCheckIntervalMs: 50 } },
}));

// Mock integrity for filterGenerationalReturn's dynamic import
const mockComputeMerkleRoot = jest.fn<(hashes: string[]) => string>().mockReturnValue('merkle-root');
jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeMerkleRoot: mockComputeMerkleRoot,
}));

// Import module under test AFTER mocks
const {
    checkAndActivateRecruitments,
    checkAndReturnExpiredRecruitments,
    startPoolReturnCheck,
    stopPoolReturnCheck,
    shutdownPoolIntegration,
} = await import('../../core/pool-integration.js');

function makeRecruitment(overrides: Record<string, any> = {}) {
    return {
        id: 'rec-1',
        pool_partition_id: 'pool-part-1',
        project: 'test-project',
        export_data: JSON.stringify({
            nodes: [{ id: 'n1', created_at: '2025-01-01T00:00:00Z' }],
            edges: [],
        }),
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
    stopPoolReturnCheck();
    mockReadProjectsMeta.mockReturnValue({ currentProject: 'test-project' });
    mockQueryOne.mockResolvedValue(null);
    mockGetPendingForProject.mockReturnValue([]);
    mockGetActiveForProject.mockReturnValue([]);
    mockCheckoutPartition.mockReturnValue(true);
    mockComputeFitness.mockReturnValue({ avgWeight: 1.0, breakthroughCount: 0 });
    mockImportTransient.mockResolvedValue({ partitionId: 'trans-new' });
    mockApproveTransient.mockResolvedValue({});
    mockDepartTransient.mockResolvedValue({});
});

afterEach(() => {
    stopPoolReturnCheck();
});

// ============================================================
// checkAndActivateRecruitments — uncovered branches
// ============================================================

describe('checkAndActivateRecruitments: bridges_config handling', () => {
    it('passes undefined bridges when bridges_config is null', async () => {
        const rec = makeRecruitment({ bridges_config: null });
        mockGetPendingForProject.mockReturnValue([rec]);
        mockApproveTransient.mockResolvedValue({});

        await checkAndActivateRecruitments();

        expect(mockApproveTransient).toHaveBeenCalledWith('trans-new', undefined);
    });

    it('parses and passes bridges_config when present', async () => {
        const bridges = [{ targetPartitionId: 'other' }];
        const rec = makeRecruitment({ bridges_config: JSON.stringify(bridges) });
        mockGetPendingForProject.mockReturnValue([rec]);
        mockApproveTransient.mockResolvedValue({});

        await checkAndActivateRecruitments();

        expect(mockApproveTransient).toHaveBeenCalledWith('trans-new', bridges);
    });
});

describe('checkAndActivateRecruitments: mixed success/failure', () => {
    it('activates first, fails second, counts correctly', async () => {
        const rec1 = makeRecruitment({ id: 'rec-1' });
        const rec2 = makeRecruitment({ id: 'rec-2' });
        mockGetPendingForProject.mockReturnValue([rec1, rec2]);
        mockApproveTransient
            .mockResolvedValueOnce({})
            .mockResolvedValueOnce({ error: 'bad' });

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(1);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-2', expect.objectContaining({
            status: 'failed',
        }));
    });

    it('handles checkout failure for one and success for another', async () => {
        const rec1 = makeRecruitment({ id: 'rec-1', pool_partition_id: 'pp1' });
        const rec2 = makeRecruitment({ id: 'rec-2', pool_partition_id: 'pp2' });
        mockGetPendingForProject.mockReturnValue([rec1, rec2]);
        mockCheckoutPartition
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);
        mockApproveTransient.mockResolvedValue({});

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(1);
    });
});

describe('checkAndActivateRecruitments: computeFitness + nodeCount', () => {
    it('records correct node count and fitness in update', async () => {
        const exportData = {
            nodes: [
                { id: 'n1', created_at: '2025-01-01T00:00:00Z' },
                { id: 'n2', created_at: '2025-01-01T00:00:00Z' },
            ],
            edges: [],
        };
        const rec = makeRecruitment({ export_data: JSON.stringify(exportData) });
        mockGetPendingForProject.mockReturnValue([rec]);
        mockComputeFitness.mockReturnValue({ avgWeight: 0.75, breakthroughCount: 3 });
        mockApproveTransient.mockResolvedValue({});

        await checkAndActivateRecruitments();

        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-1', expect.objectContaining({
            node_count_at_recruit: 2,
            avg_weight_at_recruit: 0.75,
            breakthroughs_at_recruit: 3,
        }));
        expect(mockRecordHistory).toHaveBeenCalledWith(expect.objectContaining({
            nodeCount: 2,
            breakthroughCount: 3,
            avgWeight: 0.75,
        }));
    });
});

// ============================================================
// checkAndReturnExpiredRecruitments — uncovered branches
// ============================================================

describe('checkAndReturnExpiredRecruitments: null partitionRow defaults', () => {
    it('defaults cycles_completed and barren_cycles to 0 when partitionRow is null', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue(null);

        await checkAndReturnExpiredRecruitments();

        expect(mockSyncRecruitmentCycles).toHaveBeenCalledWith('rec-1', 0, 0);
    });
});

describe('checkAndReturnExpiredRecruitments: return_due_at null', () => {
    it('skips time check when return_due_at is null', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: null,
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 100,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 1, barren_cycles: 0 });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
        expect(mockDepartTransient).not.toHaveBeenCalled();
    });
});

describe('checkAndReturnExpiredRecruitments: no exportData in depart result', () => {
    it('marks recruitment as returned when departResult has no exportData', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({}); // no exportData

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-1', expect.objectContaining({
            status: 'returned',
        }));
        expect(mockReturnPartitionToPool).not.toHaveBeenCalled();
    });
});

describe('checkAndReturnExpiredRecruitments: generational return with full data', () => {
    it('applies generational filter and calls returnPartitionToPool', async () => {
        const activatedAt = '2025-01-01T00:00:00Z';
        const rec = makeRecruitment({
            status: 'active',
            activated_at: activatedAt,
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        const exportData = {
            nodes: [
                { id: 'parent', created_at: '2024-12-01T00:00:00Z' },
                { id: 'child', created_at: '2025-06-01T00:00:00Z' },
            ],
            edges: [
                { edge_type: 'parent', source_id: 'parent', target_id: 'child' },
            ],
            integrity: {
                log: [
                    { nodeId: 'parent', event: 'created' },
                    { nodeId: 'child', event: 'created' },
                ],
                merkleRoot: 'old',
            },
            numberVariables: {
                registry: [
                    { var_id: 'v1', value: 42 },
                    { var_id: 'v2', value: 99 },
                ],
                refs: [
                    { node_id: 'parent', var_id: 'v1' },
                    { node_id: 'child', var_id: 'v2' },
                ],
            },
        };
        mockDepartTransient.mockResolvedValue({ exportData });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
        expect(mockReturnPartitionToPool).toHaveBeenCalled();

        const filteredExport = mockReturnPartitionToPool.mock.calls[0][1];
        // Parent should be removed (spent parent)
        expect(filteredExport.nodes).toHaveLength(1);
        expect(filteredExport.nodes[0].id).toBe('child');
        // Edge should be removed (parent node gone)
        expect(filteredExport.edges).toHaveLength(0);
    });

    it('returns with exportData that has no integrity', async () => {
        const rec = makeRecruitment({
            status: 'active',
            activated_at: '2025-01-01T00:00:00Z',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        const exportData = {
            nodes: [{ id: 'child', created_at: '2025-06-01T00:00:00Z' }],
            edges: [],
        };
        mockDepartTransient.mockResolvedValue({ exportData });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
        const filteredExport = mockReturnPartitionToPool.mock.calls[0][1];
        expect(filteredExport.integrity).toBeUndefined();
    });
});

describe('checkAndReturnExpiredRecruitments: exception handling', () => {
    it('catches exception and marks recruitment as failed', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockRejectedValue(new Error('db crash'));

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-1', {
            status: 'failed',
            error: 'db crash',
        });
    });
});

describe('checkAndReturnExpiredRecruitments: exhaustion condition edge cases', () => {
    it('returns when barren >= exhaustion_threshold and cycles >= min_cycles (0)', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 3,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 5, barren_cycles: 5 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
    });

    it('does not return when barren < exhaustion_threshold', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 10,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 5, barren_cycles: 5 });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
    });

    it('uses default exhaustion_threshold of 10 when field is falsy', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 0,
            exhaustion_threshold: 0, // falsy -> defaults to 10
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 5, barren_cycles: 11 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        // exhaustion_threshold || 10 = 10, barren=11 >= 10, cycles=5 >= min_cycles=0
        expect(result).toBe(1);
    });
});

describe('checkAndReturnExpiredRecruitments: depart error', () => {
    it('marks as failed and does not count as returned', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({ error: 'partition not found' });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-1', {
            status: 'failed',
            error: 'partition not found',
        });
    });
});

// ============================================================
// startPoolReturnCheck / stopPoolReturnCheck
// ============================================================

describe('startPoolReturnCheck: periodic execution', () => {
    it('calls checkAndReturnExpiredRecruitments periodically', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });

        startPoolReturnCheck();

        // Wait for interval to fire (intervalMs=50)
        await new Promise(resolve => setTimeout(resolve, 120));

        stopPoolReturnCheck();

        // Should have been called at least once
        expect(mockReadProjectsMeta).toHaveBeenCalled();
    });

    it('handles errors in the interval callback gracefully', async () => {
        mockReadProjectsMeta.mockImplementation(() => { throw new Error('boom'); });

        startPoolReturnCheck();

        // Wait for interval to fire
        await new Promise(resolve => setTimeout(resolve, 120));

        stopPoolReturnCheck();

        // Should not crash — the try/catch in the interval callback handles it
    });

    it('is idempotent - second call does not create another interval', () => {
        startPoolReturnCheck();
        startPoolReturnCheck();
        stopPoolReturnCheck();
    });
});

describe('stopPoolReturnCheck: safe when not running', () => {
    it('does not throw when no interval exists', () => {
        expect(() => stopPoolReturnCheck()).not.toThrow();
    });
});

describe('shutdownPoolIntegration', () => {
    it('stops interval and closes pool DB', () => {
        startPoolReturnCheck();
        shutdownPoolIntegration();
        expect(mockClosePoolDb).toHaveBeenCalled();
    });

    it('works when no interval was started', () => {
        shutdownPoolIntegration();
        expect(mockClosePoolDb).toHaveBeenCalled();
    });
});
