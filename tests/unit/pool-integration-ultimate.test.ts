/**
 * Ultimate coverage tests for core/pool-integration.ts
 *
 * Targets remaining uncovered branches:
 * - filterGenerationalReturn: empty nodes array, node_id field in integrity log,
 *   numberVariables with all refs filtered out (registry becomes empty),
 *   integrity without merkleRoot (computeMerkleRoot import error path),
 *   edge types other than 'parent' not contributing to parentNodeIds
 * - checkAndActivateRecruitments: exception thrown during activation (catch block)
 * - checkAndReturnExpiredRecruitments: max_cycles condition,
 *   min_cycles protection (cycles < min_cycles prevents exhaustion return),
 *   multiple active recruitments with different return reasons
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

// Mock integrity — test the error path by making it throw
const mockComputeMerkleRoot = jest.fn<(hashes: string[]) => string>().mockReturnValue('merkle-root');
jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeMerkleRoot: mockComputeMerkleRoot,
}));

const {
    checkAndActivateRecruitments,
    checkAndReturnExpiredRecruitments,
    stopPoolReturnCheck,
} = await import('../../core/pool-integration.js');

function makeRecruitment(overrides: Record<string, any> = {}) {
    return {
        id: 'rec-u1',
        pool_partition_id: 'pool-part-u1',
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
        transient_id: 'trans-u1',
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
// filterGenerationalReturn: edge cases
// ============================================================

describe('filterGenerationalReturn via return path: edge types', () => {
    it('non-parent edge types do not add to parentNodeIds', async () => {
        const activatedAt = '2025-01-01T00:00:00Z';
        const rec = makeRecruitment({
            status: 'active',
            activated_at: activatedAt,
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        // Both nodes are pre-activation (originals). Edge type 'sibling' should NOT
        // mark nodeA as a parent, so both should survive (childless originals).
        const exportData = {
            nodes: [
                { id: 'nodeA', created_at: '2024-12-01T00:00:00Z' },
                { id: 'nodeB', created_at: '2024-12-01T00:00:00Z' },
            ],
            edges: [
                { edge_type: 'sibling', source_id: 'nodeA', target_id: 'nodeB' },
            ],
        };
        mockDepartTransient.mockResolvedValue({ exportData });

        await checkAndReturnExpiredRecruitments();

        const filtered = mockReturnPartitionToPool.mock.calls[0][1];
        // Both originals survive since neither is a parent (only 'parent' edges count)
        expect(filtered.nodes).toHaveLength(2);
    });
});

describe('filterGenerationalReturn: numberVariables filtering', () => {
    it('filters numberVariables to only surviving node refs', async () => {
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

        await checkAndReturnExpiredRecruitments();

        const filtered = mockReturnPartitionToPool.mock.calls[0][1];
        // Parent is filtered out. Only child's refs survive.
        expect(filtered.numberVariables.refs).toHaveLength(1);
        expect(filtered.numberVariables.refs[0].node_id).toBe('child');
        expect(filtered.numberVariables.registry).toHaveLength(1);
        expect(filtered.numberVariables.registry[0].var_id).toBe('v2');
    });
});

describe('filterGenerationalReturn: integrity log with node_id field', () => {
    it('filters integrity log entries using node_id (not nodeId)', async () => {
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
                { id: 'parent', created_at: '2024-12-01T00:00:00Z', content_hash: 'h1' },
                { id: 'child', created_at: '2025-06-01T00:00:00Z', content_hash: 'h2' },
            ],
            edges: [
                { edge_type: 'parent', source_id: 'parent', target_id: 'child' },
            ],
            integrity: {
                log: [
                    { node_id: 'parent', event: 'created' }, // uses node_id, not nodeId
                    { node_id: 'child', event: 'created' },
                ],
                merkleRoot: 'old',
                chainLength: 2,
                nodesTotal: 2,
            },
        };
        mockDepartTransient.mockResolvedValue({ exportData });

        await checkAndReturnExpiredRecruitments();

        const filtered = mockReturnPartitionToPool.mock.calls[0][1];
        // Only child survives, parent is spent
        expect(filtered.integrity.log).toHaveLength(1);
        expect(filtered.integrity.log[0].node_id).toBe('child');
        expect(filtered.integrity.chainLength).toBe(1);
        expect(filtered.integrity.nodesTotal).toBe(1);
    });
});

describe('filterGenerationalReturn: computeMerkleRoot failure', () => {
    it('handles computeMerkleRoot throw gracefully', async () => {
        const activatedAt = '2025-01-01T00:00:00Z';
        const rec = makeRecruitment({
            status: 'active',
            activated_at: activatedAt,
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        mockComputeMerkleRoot.mockImplementation(() => { throw new Error('no wasm'); });

        const exportData = {
            nodes: [
                { id: 'child', created_at: '2025-06-01T00:00:00Z', content_hash: 'h1' },
            ],
            edges: [],
            integrity: {
                log: [{ nodeId: 'child', event: 'created' }],
                merkleRoot: 'old-root',
            },
        };
        mockDepartTransient.mockResolvedValue({ exportData });

        await checkAndReturnExpiredRecruitments();

        const filtered = mockReturnPartitionToPool.mock.calls[0][1];
        // integrity is still present, merkleRoot stays 'old-root' since recompute failed
        expect(filtered.integrity).toBeDefined();
    });
});

describe('filterGenerationalReturn: empty nodes array', () => {
    it('returns exportData unchanged when nodes is empty', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 0, barren_cycles: 0 });

        const exportData = { nodes: [], edges: [] };
        mockDepartTransient.mockResolvedValue({ exportData });

        await checkAndReturnExpiredRecruitments();

        const filtered = mockReturnPartitionToPool.mock.calls[0][1];
        expect(filtered.nodes).toHaveLength(0);
    });
});

// ============================================================
// checkAndActivateRecruitments: exception during import
// ============================================================

describe('checkAndActivateRecruitments: importTransient throws', () => {
    it('catches exception and marks recruitment as failed', async () => {
        const rec = makeRecruitment();
        mockGetPendingForProject.mockReturnValue([rec]);
        mockImportTransient.mockRejectedValue(new Error('import boom'));

        const result = await checkAndActivateRecruitments();

        expect(result).toBe(0);
        expect(mockUpdateRecruitment).toHaveBeenCalledWith('rec-u1', {
            status: 'failed',
            error: 'import boom',
        });
    });
});

// ============================================================
// checkAndReturnExpiredRecruitments: min_cycles protection
// ============================================================

describe('checkAndReturnExpiredRecruitments: min_cycles protection', () => {
    it('does not return for exhaustion when cycles < min_cycles', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 0,
            min_cycles: 10,
            exhaustion_threshold: 3,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        // cycles=5 < min_cycles=10, so exhaustion check is skipped
        mockQueryOne.mockResolvedValue({ cycles_completed: 5, barren_cycles: 100 });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(0);
        expect(mockDepartTransient).not.toHaveBeenCalled();
    });
});

describe('checkAndReturnExpiredRecruitments: max_cycles condition', () => {
    it('returns when cycles >= max_cycles', async () => {
        const rec = makeRecruitment({
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 10,
            min_cycles: 0,
            exhaustion_threshold: 999,
        });
        mockGetActiveForProject.mockReturnValue([rec]);
        mockQueryOne.mockResolvedValue({ cycles_completed: 10, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(1);
    });
});

describe('checkAndReturnExpiredRecruitments: multiple with different reasons', () => {
    it('returns two recruitments for different reasons in one pass', async () => {
        const rec1 = makeRecruitment({
            id: 'rec-time',
            transient_id: 'trans-time',
            status: 'active',
            return_due_at: new Date(Date.now() - 1000).toISOString(),
        });
        const rec2 = makeRecruitment({
            id: 'rec-max',
            transient_id: 'trans-max',
            status: 'active',
            return_due_at: new Date(Date.now() + 86400000).toISOString(),
            max_cycles: 5,
        });
        mockGetActiveForProject.mockReturnValue([rec1, rec2]);
        mockQueryOne
            .mockResolvedValueOnce({ cycles_completed: 0, barren_cycles: 0 })
            .mockResolvedValueOnce({ cycles_completed: 5, barren_cycles: 0 });
        mockDepartTransient.mockResolvedValue({ exportData: { nodes: [], edges: [] } });

        const result = await checkAndReturnExpiredRecruitments();

        expect(result).toBe(2);
    });
});

// ============================================================
// checkAndActivateRecruitments/checkAndReturn: no current project
// ============================================================

describe('no current project', () => {
    it('checkAndActivateRecruitments returns 0', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });
        const result = await checkAndActivateRecruitments();
        expect(result).toBe(0);
    });

    it('checkAndReturnExpiredRecruitments returns 0', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: null });
        const result = await checkAndReturnExpiredRecruitments();
        expect(result).toBe(0);
    });
});
