/**
 * Unit tests for db/pool-db.ts — partition pool database layer.
 * Covers: getPoolDb, closePoolDb, computeFitness, checkoutPartition, checkinPartition,
 * recordHistory, getPartitionHistory, getDashboardStats, getExpiredRecruitments,
 * addToPool, listPool, getPoolPartition, removeFromPool, createRecruitment,
 * listRecruitments, getRecruitment, updateRecruitment, getPendingForProject,
 * getActiveForProject, syncRecruitmentCycles, returnPartitionToPool, updateIntegrityStatus.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mock infrastructure ---

// Track all prepared statements and their operations
const mockRunResult = { changes: 1 };
const mockAllResult: any[] = [];
const mockGetResult: any = null;

const mockRun = jest.fn<(...args: any[]) => any>().mockReturnValue(mockRunResult);
const mockAll = jest.fn<(...args: any[]) => any[]>().mockReturnValue(mockAllResult);
const mockGet = jest.fn<(...args: any[]) => any>().mockReturnValue(mockGetResult);

const mockPrepare = jest.fn<(sql: string) => any>().mockReturnValue({
    run: mockRun,
    all: mockAll,
    get: mockGet,
});
const mockExec = jest.fn();
const mockPragma = jest.fn();
const mockClose = jest.fn();
const mockTransaction = jest.fn<(fn: Function) => Function>().mockImplementation((fn: Function) => {
    // Return a function that when called, executes the transaction body
    return fn;
});

const mockDbInstance = {
    prepare: mockPrepare,
    exec: mockExec,
    pragma: mockPragma,
    close: mockClose,
    transaction: mockTransaction,
};

const MockDatabase = jest.fn<() => any>().mockReturnValue(mockDbInstance);

jest.unstable_mockModule('better-sqlite3', () => ({
    default: MockDatabase,
}));

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(true);
const mockMkdirSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: { existsSync: mockExistsSync, mkdirSync: mockMkdirSync, readFileSync: jest.fn<any>().mockReturnValue('{}') },
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: jest.fn<any>().mockReturnValue('{}'),
}));

jest.unstable_mockModule('url', () => ({
    fileURLToPath: jest.fn<(url: string) => string>().mockReturnValue('/mock/db/pool-db.ts'),
}));

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: { database: { projectDb: { busyTimeoutMs: 5000 }, stmtCacheMax: 200, systemDb: { busyTimeoutMs: 5000, cacheSizeKb: 2000, mmapSizeMb: 0, walAutoCheckpoint: 1000 }, readDb: { busyTimeoutMs: 5000, cacheSizeKb: 2000, mmapSizeMb: 0 } } },
}));

const mockConfig = {
    partitionServer: {
        dbPath: 'data/pool.db',
        minPoolNodes: 3,
    },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

const mockApplyEncryptionKey = jest.fn();
jest.unstable_mockModule('../../db/sqlite-backend.js', () => ({
    applyEncryptionKey: mockApplyEncryptionKey,
}));

// --- Import module under test ---
const {
    getPoolDb,
    closePoolDb,
    computeFitness,
    checkoutPartition,
    checkinPartition,
    recordHistory,
    getPartitionHistory,
    getDashboardStats,
    getExpiredRecruitments,
    addToPool,
    listPool,
    getPoolPartition,
    removeFromPool,
    createRecruitment,
    listRecruitments,
    getRecruitment,
    updateRecruitment,
    getPendingForProject,
    getActiveForProject,
    syncRecruitmentCycles,
    returnPartitionToPool,
    updateIntegrityStatus,
} = await import('../../db/pool-db.js');

// --- Helpers ---

function resetMocks() {
    jest.clearAllMocks();
    mockRun.mockReturnValue({ changes: 1 });
    mockAll.mockReturnValue([]);
    mockGet.mockReturnValue(null);
    mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
    mockExistsSync.mockReturnValue(true);
    mockTransaction.mockImplementation((fn: Function) => fn);
    MockDatabase.mockReturnValue(mockDbInstance);
}

/** Close and reset the singleton db between tests */
function resetDbSingleton() {
    closePoolDb();
    resetMocks();
}

// =============================================================================
// computeFitness (pure function — no DB needed)
// =============================================================================

describe('computeFitness', () => {
    it('returns zeros for empty/missing nodes', () => {
        expect(computeFitness({})).toEqual({ fitness: 0, avgWeight: 0, breakthroughCount: 0 });
        expect(computeFitness({ nodes: [] })).toEqual({ fitness: 0, avgWeight: 0, breakthroughCount: 0 });
        expect(computeFitness(null)).toEqual({ fitness: 0, avgWeight: 0, breakthroughCount: 0 });
        expect(computeFitness(undefined)).toEqual({ fitness: 0, avgWeight: 0, breakthroughCount: 0 });
    });

    it('computes fitness for a single node with default weight', () => {
        const result = computeFitness({ nodes: [{ node_type: 'seed', weight: 1.0 }] });
        expect(result.avgWeight).toBe(1.0);
        expect(result.breakthroughCount).toBe(0);
        // fitness = 1.0 * log2(max(2,1)) * 1.0 + 0 = 1.0 * 1 * 1.0 = 1.0
        expect(result.fitness).toBe(1.0);
    });

    it('counts breakthroughs and applies bonus', () => {
        const nodes = [
            { node_type: 'breakthrough', weight: 2.0 },
            { node_type: 'breakthrough', weight: 3.0 },
            { node_type: 'seed', weight: 1.0 },
        ];
        const result = computeFitness({ nodes });
        expect(result.breakthroughCount).toBe(2);
        expect(result.avgWeight).toBe(2.0);
        // bonus = 2 * 0.05 = 0.10
        expect(result.fitness).toBeGreaterThan(0);
    });

    it('rewards type diversity', () => {
        const singleType = { nodes: [
            { node_type: 'seed', weight: 1.0 },
            { node_type: 'seed', weight: 1.0 },
        ]};
        const multiType = { nodes: [
            { node_type: 'seed', weight: 1.0 },
            { node_type: 'voiced', weight: 1.0 },
        ]};
        const fitSingle = computeFitness(singleType).fitness;
        const fitMulti = computeFitness(multiType).fitness;
        // More types → higher typeDiversity multiplier
        expect(fitMulti).toBeGreaterThan(fitSingle);
    });

    it('caps type diversity at 1.5', () => {
        // 7 different types → 1.0 + 0.1*6 = 1.6 → capped to 1.5
        const nodes = [
            { node_type: 'a', weight: 1.0 },
            { node_type: 'b', weight: 1.0 },
            { node_type: 'c', weight: 1.0 },
            { node_type: 'd', weight: 1.0 },
            { node_type: 'e', weight: 1.0 },
            { node_type: 'f', weight: 1.0 },
            { node_type: 'g', weight: 1.0 },
        ];
        const result = computeFitness({ nodes });
        // typeDiversity capped at 1.5 by Math.min
        // fitness = 1.0 * log2(7) * 1.5 + 0
        const expected = 1.0 * Math.log2(7) * 1.5;
        expect(result.fitness).toBe(Math.round(expected * 100) / 100);
    });

    it('uses weight=1.0 for nodes missing weight', () => {
        const result = computeFitness({ nodes: [{ node_type: 'seed' }] });
        expect(result.avgWeight).toBe(1.0);
    });

    it('rounds fitness and avgWeight to 2 decimal places', () => {
        const nodes = [
            { node_type: 'seed', weight: 1.333 },
            { node_type: 'voiced', weight: 2.666 },
        ];
        const result = computeFitness({ nodes });
        // Check rounding: string representation should have at most 2 decimal digits
        expect(String(result.avgWeight).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
        expect(String(result.fitness).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    });
});

// =============================================================================
// getPoolDb / closePoolDb — singleton lifecycle
// =============================================================================

describe('getPoolDb', () => {
    beforeEach(resetDbSingleton);

    it('creates the database on first call', () => {
        getPoolDb();
        expect(MockDatabase).toHaveBeenCalledTimes(1);
    });

    it('returns the same instance on subsequent calls', () => {
        const db1 = getPoolDb();
        const db2 = getPoolDb();
        expect(db1).toBe(db2);
        // Constructor called only once
        expect(MockDatabase).toHaveBeenCalledTimes(1);
    });

    it('applies encryption key on open', () => {
        getPoolDb();
        expect(mockApplyEncryptionKey).toHaveBeenCalledWith(mockDbInstance);
    });

    it('sets WAL journal mode, foreign keys, and busy timeout', () => {
        getPoolDb();
        expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
        expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON');
        expect(mockPragma).toHaveBeenCalledWith('busy_timeout = 5000');
    });

    it('runs initSchema (exec is called for table creation)', () => {
        getPoolDb();
        expect(mockExec).toHaveBeenCalled();
    });

    it('creates data directory if missing', () => {
        mockExistsSync.mockReturnValue(false);
        getPoolDb();
        expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('skips directory creation when it already exists', () => {
        mockExistsSync.mockReturnValue(true);
        getPoolDb();
        expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('uses absolute dbPath as-is', () => {
        mockConfig.partitionServer.dbPath = '/absolute/path/pool.db';
        getPoolDb();
        expect(MockDatabase).toHaveBeenCalledWith('/absolute/path/pool.db');
        mockConfig.partitionServer.dbPath = 'data/pool.db';
    });
});

describe('closePoolDb', () => {
    beforeEach(resetDbSingleton);

    it('closes the database and resets singleton', () => {
        getPoolDb();
        MockDatabase.mockClear();
        closePoolDb();
        expect(mockClose).toHaveBeenCalledTimes(1);
        // Next call should create a new instance since singleton is cleared
        getPoolDb();
        expect(MockDatabase).toHaveBeenCalledTimes(1);
    });

    it('is safe to call when no db is open', () => {
        // Should not throw
        closePoolDb();
        expect(mockClose).not.toHaveBeenCalled();
    });
});

// =============================================================================
// migrateSchema (tested indirectly via getPoolDb)
// =============================================================================

describe('migrateSchema (via getPoolDb)', () => {
    beforeEach(resetDbSingleton);

    it('calls prepare for each migration column check', () => {
        // The initSchema calls migrateSchema which does SELECT checks
        // then ALTER TABLE if they fail. We just verify prepare is called
        // multiple times during schema init.
        getPoolDb();
        // initSchema runs exec + migrateSchema runs multiple prepare().get() calls
        expect(mockPrepare).toHaveBeenCalled();
    });

    it('adds columns when SELECT throws', () => {
        // Make get() throw for migration checks, triggering ALTER TABLE
        let callCount = 0;
        mockGet.mockImplementation(() => {
            callCount++;
            // Throw on migration checks (get calls during migrateSchema)
            throw new Error('no such column');
        });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        getPoolDb();
        // Should have called exec for ALTER TABLE statements
        // The exec call count includes both initSchema CREATE TABLE and ALTER TABLE calls
        expect(mockExec.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
});

// =============================================================================
// checkoutPartition / checkinPartition
// =============================================================================

describe('checkoutPartition', () => {
    beforeEach(resetDbSingleton);

    it('returns true when partition was available (changes > 0)', () => {
        getPoolDb();
        mockRun.mockReturnValue({ changes: 1 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
        expect(checkoutPartition('owner/part-1')).toBe(true);
    });

    it('returns false when partition was already checked out (changes = 0)', () => {
        getPoolDb();
        mockRun.mockReturnValue({ changes: 0 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
        expect(checkoutPartition('owner/part-1')).toBe(false);
    });
});

describe('checkinPartition', () => {
    beforeEach(resetDbSingleton);

    it('runs update query with partition id', () => {
        getPoolDb();
        checkinPartition('owner/part-1');
        // Should have called prepare and run with the id
        expect(mockRun).toHaveBeenCalled();
    });
});

// =============================================================================
// recordHistory / getPartitionHistory
// =============================================================================

describe('recordHistory', () => {
    beforeEach(resetDbSingleton);

    it('inserts history row with auto-derived generation', () => {
        getPoolDb();
        // Mock the SELECT MAX(generation) query
        mockGet.mockReturnValue({ max_gen: 2 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        recordHistory({
            poolPartitionId: 'owner/part-1',
            eventType: 'added',
            nodeCount: 10,
        });

        // run should be called for the INSERT (generation = 2 + 1 = 3)
        expect(mockRun).toHaveBeenCalled();
        // The third argument to run should be generation 3
        const insertCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
        // Args: poolPartitionId, recruitmentId, generation, eventType, project, nodeCount, ...
        expect(insertCall[2]).toBe(3);
    });

    it('starts at generation 0 when no prior history', () => {
        getPoolDb();
        mockGet.mockReturnValue({ max_gen: -1 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        recordHistory({
            poolPartitionId: 'owner/part-new',
            eventType: 'added',
        });

        const insertCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
        expect(insertCall[2]).toBe(0);
    });

    it('defaults optional params to 0 or null', () => {
        getPoolDb();
        mockGet.mockReturnValue({ max_gen: -1 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        recordHistory({
            poolPartitionId: 'p1',
            eventType: 'test',
        });

        const insertCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
        // recruitmentId defaults to null
        expect(insertCall[1]).toBeNull();
        // project defaults to null
        expect(insertCall[4]).toBeNull();
        // nodeCount defaults to 0
        expect(insertCall[5]).toBe(0);
        // domains defaults to null
        expect(insertCall[10]).toBeNull();
    });
});

describe('getPartitionHistory', () => {
    beforeEach(resetDbSingleton);

    it('returns rows from partition_history query', () => {
        getPoolDb();
        const fakeRows = [{ id: 1, event_type: 'added' }, { id: 2, event_type: 'returned' }];
        mockAll.mockReturnValue(fakeRows);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const result = getPartitionHistory('owner/part-1');
        expect(result).toEqual(fakeRows);
    });
});

// =============================================================================
// getDashboardStats
// =============================================================================

describe('getDashboardStats', () => {
    beforeEach(resetDbSingleton);

    it('returns aggregate pool stats', () => {
        getPoolDb();
        let getCallCount = 0;
        mockGet.mockImplementation(() => {
            getCallCount++;
            if (getCallCount === 1) {
                return { total_partitions: 5, avg_fitness: 3.456, oldest: '2025-01-01' };
            }
            return { cnt: 2 };
        });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const stats = getDashboardStats();
        expect(stats.totalPartitions).toBe(5);
        expect(stats.totalActive).toBe(2);
        expect(stats.avgFitness).toBe(3.46);
        expect(stats.oldestPartition).toBe('2025-01-01');
    });

    it('handles empty pool', () => {
        getPoolDb();
        mockGet.mockReturnValue({ total_partitions: 0, avg_fitness: 0, oldest: null, cnt: 0 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const stats = getDashboardStats();
        expect(stats.totalPartitions).toBe(0);
        expect(stats.totalActive).toBe(0);
        expect(stats.avgFitness).toBe(0);
        expect(stats.oldestPartition).toBeNull();
    });
});

// =============================================================================
// getExpiredRecruitments
// =============================================================================

describe('getExpiredRecruitments', () => {
    beforeEach(resetDbSingleton);

    it('passes grace hours to the query', () => {
        getPoolDb();
        const fakeExpired = [{ id: 'r1', status: 'active' }];
        mockAll.mockReturnValue(fakeExpired);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const result = getExpiredRecruitments(24);
        expect(result).toEqual(fakeExpired);
        expect(mockAll).toHaveBeenCalledWith(24);
    });
});

// =============================================================================
// addToPool
// =============================================================================

describe('addToPool', () => {
    beforeEach(resetDbSingleton);

    const validExport = {
        podbitExport: '1.0',
        partition: { id: 'test-part', name: 'Test Partition', description: 'A test' },
        owner: 'alice',
        nodes: [
            { node_type: 'seed', weight: 1.0 },
            { node_type: 'voiced', weight: 2.0 },
            { node_type: 'seed', weight: 1.5 },
        ],
        domains: [{ domain: 'physics' }, { domain: 'chemistry' }],
    };

    it('throws on missing podbitExport field', () => {
        getPoolDb();
        expect(() => addToPool({ partition: { id: 'x' } })).toThrow('Invalid export format');
    });

    it('throws on missing partition field', () => {
        getPoolDb();
        expect(() => addToPool({ podbitExport: '1.0' })).toThrow('Invalid export format');
    });

    it('throws when node count below minimum', () => {
        getPoolDb();
        mockConfig.partitionServer.minPoolNodes = 5;
        expect(() => addToPool({
            podbitExport: '1.0',
            partition: { id: 'x' },
            nodes: [{ node_type: 'seed', weight: 1.0 }],
        })).toThrow(/minimum is 5/);
        mockConfig.partitionServer.minPoolNodes = 3;
    });

    it('constructs correct pool partition id from owner/partition.id', () => {
        getPoolDb();
        // Mock the get call for existing check to return null (new partition)
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const result = addToPool(validExport);
        expect(result.id).toBe('alice/test-part');
    });

    it('computes fitness and returns it', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const result = addToPool(validExport);
        expect(result.fitness).toBeGreaterThan(0);
        expect(typeof result.fitness).toBe('number');
    });

    it('uses "unknown" owner when not provided', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const noOwner = { ...validExport, owner: undefined };
        const result = addToPool(noOwner);
        expect(result.id).toBe('unknown/test-part');
    });

    it('runs inside a transaction', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        addToPool(validExport);
        expect(mockTransaction).toHaveBeenCalled();
    });

    it('handles integrity data in export', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const withIntegrity = {
            ...validExport,
            integrity: { merkleRoot: 'abc123', log: [1, 2, 3] },
        };
        const result = addToPool(withIntegrity);
        expect(result.id).toBe('alice/test-part');
    });

    it('does not record history for existing (update) partitions', () => {
        getPoolDb();
        // Clear init calls
        mockRun.mockClear();
        // First get call returns existing partition
        let getCount = 0;
        mockGet.mockImplementation(() => {
            getCount++;
            if (getCount === 1) return { id: 'alice/test-part', generation: 2 };
            return { max_gen: -1 }; // for recordHistory's max gen query (should not be reached)
        });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        addToPool(validExport);
        // run should be called once for the INSERT/UPDATE, not for recordHistory INSERT
        // The UPSERT is 1 call; recordHistory would add 1 more; we should see only 1
        expect(mockRun).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// listPool / getPoolPartition / removeFromPool
// =============================================================================

describe('listPool', () => {
    beforeEach(resetDbSingleton);

    it('returns all partitions ordered by fitness', () => {
        getPoolDb();
        const fakeList = [{ id: 'a', fitness: 5.0 }, { id: 'b', fitness: 3.0 }];
        mockAll.mockReturnValue(fakeList);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(listPool()).toEqual(fakeList);
    });
});

describe('getPoolPartition', () => {
    beforeEach(resetDbSingleton);

    it('returns partition when found', () => {
        getPoolDb();
        const fakePart = { id: 'owner/p1', name: 'P1' };
        mockGet.mockReturnValue(fakePart);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getPoolPartition('owner/p1')).toEqual(fakePart);
    });

    it('returns null when not found', () => {
        getPoolDb();
        mockGet.mockReturnValue(undefined);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getPoolPartition('nonexistent')).toBeNull();
    });
});

describe('removeFromPool', () => {
    beforeEach(resetDbSingleton);

    it('deletes pending recruitments, history, and partition in a transaction', () => {
        getPoolDb();
        // Clear calls from init so we only count removeFromPool's calls
        mockRun.mockClear();
        mockTransaction.mockClear();
        mockPrepare.mockClear();
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });
        removeFromPool('owner/p1');
        expect(mockTransaction).toHaveBeenCalled();
        // 3 prepare+run calls: delete recruitments, delete history, delete partition
        expect(mockRun).toHaveBeenCalledTimes(3);
    });
});

// =============================================================================
// createRecruitment
// =============================================================================

describe('createRecruitment', () => {
    beforeEach(resetDbSingleton);

    it('throws when partition not found', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(() => createRecruitment({
            poolPartitionId: 'nonexistent',
            targetProject: 'proj',
            procreationHours: 24,
        })).toThrow('Pool partition not found');
    });

    it('throws when partition is checked out', () => {
        getPoolDb();
        mockGet.mockReturnValue({ checked_out: 1 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(() => createRecruitment({
            poolPartitionId: 'owner/p1',
            targetProject: 'proj',
            procreationHours: 24,
        })).toThrow('currently checked out');
    });

    it('returns an id when partition is available', () => {
        getPoolDb();
        mockGet.mockReturnValue({ checked_out: 0 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const result = createRecruitment({
            poolPartitionId: 'owner/p1',
            targetProject: 'myproject',
            procreationHours: 48,
        });
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('string');
        expect(result.id.length).toBeGreaterThan(0);
    });

    it('uses default values for optional params', () => {
        getPoolDb();
        mockGet.mockReturnValue({ checked_out: 0 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        createRecruitment({
            poolPartitionId: 'owner/p1',
            targetProject: 'proj',
            procreationHours: 12,
        });

        // The INSERT run call has: id, poolPartitionId, targetProject, bridgesConfig, procreationHours, minCycles, maxCycles, exhaustionThreshold
        const insertCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
        // bridgesConfig null (index 3)
        expect(insertCall[3]).toBeNull();
        // minCycles default 5 (index 5)
        expect(insertCall[5]).toBe(5);
        // maxCycles default 100 (index 6)
        expect(insertCall[6]).toBe(100);
        // exhaustionThreshold default 10 (index 7)
        expect(insertCall[7]).toBe(10);
    });

    it('serializes bridgesConfig to JSON', () => {
        getPoolDb();
        mockGet.mockReturnValue({ checked_out: 0 });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        createRecruitment({
            poolPartitionId: 'owner/p1',
            targetProject: 'proj',
            procreationHours: 12,
            bridgesConfig: ['domain-a', 'domain-b'],
        });

        const insertCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
        expect(insertCall[3]).toBe(JSON.stringify(['domain-a', 'domain-b']));
    });
});

// =============================================================================
// listRecruitments
// =============================================================================

describe('listRecruitments', () => {
    beforeEach(resetDbSingleton);

    it('returns all recruitments with no filters', () => {
        getPoolDb();
        const fakeRows = [{ id: 'r1' }];
        mockAll.mockReturnValue(fakeRows);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(listRecruitments()).toEqual(fakeRows);
        // Called with no spread args
        expect(mockAll).toHaveBeenCalled();
    });

    it('filters by status', () => {
        getPoolDb();
        mockAll.mockReturnValue([]);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        listRecruitments({ status: 'active' });
        expect(mockAll).toHaveBeenCalledWith('active');
    });

    it('filters by project', () => {
        getPoolDb();
        mockAll.mockReturnValue([]);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        listRecruitments({ project: 'myproj' });
        expect(mockAll).toHaveBeenCalledWith('myproj');
    });

    it('filters by both status and project', () => {
        getPoolDb();
        mockAll.mockReturnValue([]);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        listRecruitments({ status: 'pending', project: 'proj2' });
        expect(mockAll).toHaveBeenCalledWith('pending', 'proj2');
    });
});

// =============================================================================
// getRecruitment
// =============================================================================

describe('getRecruitment', () => {
    beforeEach(resetDbSingleton);

    it('returns recruitment when found', () => {
        getPoolDb();
        const fakeRec = { id: 'r1', status: 'active' };
        mockGet.mockReturnValue(fakeRec);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getRecruitment('r1')).toEqual(fakeRec);
    });

    it('returns null when not found', () => {
        getPoolDb();
        mockGet.mockReturnValue(undefined);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getRecruitment('nonexistent')).toBeNull();
    });
});

// =============================================================================
// updateRecruitment
// =============================================================================

describe('updateRecruitment', () => {
    beforeEach(resetDbSingleton);

    it('builds SET clause from update keys', () => {
        getPoolDb();
        updateRecruitment('r1', { status: 'active', activated_at: '2025-01-01' });
        expect(mockRun).toHaveBeenCalledWith('active', '2025-01-01', 'r1');
    });

    it('does nothing for empty updates', () => {
        getPoolDb();
        // Clear calls from getPoolDb initialization
        mockRun.mockClear();
        mockPrepare.mockClear();
        updateRecruitment('r1', {});
        // No prepare or run should be called for empty updates
        expect(mockPrepare).not.toHaveBeenCalled();
    });
});

// =============================================================================
// getPendingForProject / getActiveForProject
// =============================================================================

describe('getPendingForProject', () => {
    beforeEach(resetDbSingleton);

    it('returns pending recruitments for a project', () => {
        getPoolDb();
        const fakeRows = [{ id: 'r1', status: 'pending', export_data: '{}' }];
        mockAll.mockReturnValue(fakeRows);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getPendingForProject('myproj')).toEqual(fakeRows);
        expect(mockAll).toHaveBeenCalledWith('myproj');
    });
});

describe('getActiveForProject', () => {
    beforeEach(resetDbSingleton);

    it('returns active recruitments for a project', () => {
        getPoolDb();
        const fakeRows = [{ id: 'r2', status: 'active' }];
        mockAll.mockReturnValue(fakeRows);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(getActiveForProject('myproj')).toEqual(fakeRows);
        expect(mockAll).toHaveBeenCalledWith('myproj');
    });
});

// =============================================================================
// syncRecruitmentCycles
// =============================================================================

describe('syncRecruitmentCycles', () => {
    beforeEach(resetDbSingleton);

    it('updates cycles and barren count', () => {
        getPoolDb();
        syncRecruitmentCycles('r1', 15, 3);
        expect(mockRun).toHaveBeenCalledWith(15, 3, 'r1');
    });
});

// =============================================================================
// returnPartitionToPool
// =============================================================================

describe('returnPartitionToPool', () => {
    beforeEach(resetDbSingleton);

    it('throws when recruitment not found', () => {
        getPoolDb();
        mockGet.mockReturnValue(null);
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        expect(() => returnPartitionToPool('nonexistent', { nodes: [] }))
            .toThrow('Recruitment nonexistent not found');
    });

    it('updates partition, marks recruitment returned, and records history in a transaction', () => {
        getPoolDb();
        // Clear init calls
        mockRun.mockClear();
        mockTransaction.mockClear();
        let getCallCount = 0;
        mockGet.mockImplementation(() => {
            getCallCount++;
            if (getCallCount === 1) {
                // recruitment lookup
                return {
                    id: 'r1',
                    pool_partition_id: 'owner/p1',
                    target_project: 'proj',
                    current_cycles: 20,
                };
            }
            // recordHistory MAX(generation) query
            return { max_gen: 0 };
        });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const exportData = {
            nodes: [
                { node_type: 'seed', weight: 1.5 },
                { node_type: 'voiced', weight: 2.0 },
                { node_type: 'breakthrough', weight: 3.0 },
            ],
            domains: [{ domain: 'physics' }],
        };

        returnPartitionToPool('r1', exportData);
        expect(mockTransaction).toHaveBeenCalled();
        // 3 run calls: UPDATE pool_partitions, UPDATE recruitments, INSERT partition_history
        expect(mockRun).toHaveBeenCalledTimes(3);
    });

    it('handles export data with integrity info', () => {
        getPoolDb();
        mockGet.mockImplementation(() => {
            return { id: 'r1', pool_partition_id: 'owner/p1', target_project: 'proj', current_cycles: 5 };
        });
        // After first get, subsequent gets return max_gen
        let callNum = 0;
        mockGet.mockImplementation(() => {
            callNum++;
            if (callNum === 1) return { id: 'r1', pool_partition_id: 'owner/p1', target_project: 'proj', current_cycles: 5 };
            return { max_gen: -1 };
        });
        mockPrepare.mockReturnValue({ run: mockRun, all: mockAll, get: mockGet });

        const exportData = {
            nodes: [{ node_type: 'seed', weight: 1.0 }, { node_type: 'seed', weight: 1.0 }, { node_type: 'seed', weight: 1.0 }],
            domains: [],
            integrity: { merkleRoot: 'hash123', log: [1, 2] },
        };

        returnPartitionToPool('r1', exportData);
        // Should not throw — integrity data is extracted and passed to UPDATE
        expect(mockRun).toHaveBeenCalled();
    });
});

// =============================================================================
// updateIntegrityStatus
// =============================================================================

describe('updateIntegrityStatus', () => {
    beforeEach(resetDbSingleton);

    it('updates status only when no merkle root provided', () => {
        getPoolDb();
        updateIntegrityStatus('owner/p1', 'verified');
        expect(mockRun).toHaveBeenCalledWith('verified', 'owner/p1');
    });

    it('updates status and merkle root when both provided', () => {
        getPoolDb();
        updateIntegrityStatus('owner/p1', 'verified', 'hash456');
        expect(mockRun).toHaveBeenCalledWith('verified', 'hash456', 'owner/p1');
    });
});
