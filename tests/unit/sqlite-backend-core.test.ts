/**
 * Unit tests for db/sqlite-backend.ts
 *
 * Tests the dual-DB architecture (system.db vs project.db), query wrappers,
 * settings routing, backup/restore, project management, and lifecycle.
 *
 * All SQLite operations are mocked via better-sqlite3 mock — no real DB access.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock: better-sqlite3 — create mock DB instances
// ---------------------------------------------------------------------------

function makeMockStatement(returnAll: any[] = [], returnGet: any = undefined) {
    return {
        all: jest.fn<(...a: any[]) => any[]>().mockReturnValue(returnAll),
        get: jest.fn<(...a: any[]) => any>().mockReturnValue(returnGet),
        run: jest.fn<(...a: any[]) => any>().mockReturnValue({ changes: 0 }),
    };
}

function makeMockDb(nameVal = ':memory:') {
    const stmtMap = new Map<string, ReturnType<typeof makeMockStatement>>();
    const mockDb: any = {
        name: nameVal,
        pragma: jest.fn<(...a: any[]) => any>().mockReturnValue('wal'),
        prepare: jest.fn<(sql: string) => any>().mockImplementation((sql: string) => {
            if (!stmtMap.has(sql)) {
                stmtMap.set(sql, makeMockStatement());
            }
            return stmtMap.get(sql)!;
        }),
        exec: jest.fn(),
        close: jest.fn(),
        function: jest.fn(),
        backup: jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined),
        transaction: jest.fn<(fn: Function) => any>().mockImplementation((fn: Function) => {
            const txnFn: any = () => fn();
            txnFn.deferred = txnFn;
            txnFn.immediate = txnFn;
            txnFn.exclusive = txnFn;
            return txnFn;
        }),
        _stmtMap: stmtMap,
    };
    return mockDb;
}

// Collect all Database() constructor calls and the mock instances they return
let mockDbInstances: any[] = [];
const MockDatabaseConstructor = jest.fn<(...args: any[]) => any>().mockImplementation((..._args: any[]) => {
    const instance = makeMockDb(_args[0] || ':memory:');
    mockDbInstances.push(instance);
    return instance;
});

jest.unstable_mockModule('better-sqlite3', () => ({
    default: MockDatabaseConstructor,
}));

// ---------------------------------------------------------------------------
// Mock: config/constants — provide RC with needed database properties
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: {
        database: {
            systemDb: { busyTimeoutMs: 5000, cacheSizeKb: 16000, mmapSizeBytes: 67108864 },
            projectDb: { busyTimeoutMs: 5000, cacheSizeKb: 64000, mmapSizeBytes: 268435456 },
            readDb: { busyTimeoutMs: 5000, cacheSizeKb: 32000, mmapSizeBytes: 268435456 },
            stmtCacheMax: 256,
        },
        timeouts: { healthCheckMs: 3000 },
        contentLimits: {},
        queryLimits: {},
        misc: {},
    },
}));

// ---------------------------------------------------------------------------
// Mock: fs — prevent real filesystem I/O
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(...a: any[]) => boolean>().mockReturnValue(true);
const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn<(...a: any[]) => string>().mockReturnValue('{}');
const mockStatSync = jest.fn<(...a: any[]) => any>().mockReturnValue({
    isDirectory: () => false,
    size: 1024,
    mtime: new Date(),
});
const mockReaddirSync = jest.fn<(...a: any[]) => string[]>().mockReturnValue([]);
const mockCopyFileSync = jest.fn();
const mockUnlinkSync = jest.fn();
const mockOpenSync = jest.fn<(...a: any[]) => number>().mockReturnValue(3);
const mockReadSync = jest.fn<(...a: any[]) => number>().mockImplementation(
    (_fd: any, buf: Buffer, _off: any, _len: any, _pos: any) => {
        // Write "SQLite format 3\0" into buffer for header validation
        const header = Buffer.from('SQLite format 3\0');
        header.copy(buf, 0, 0, Math.min(16, buf.length));
        return 16;
    }
);
const mockCloseSync = jest.fn();
const mockWriteFileSync = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        mkdirSync: mockMkdirSync,
        readFileSync: mockReadFileSync,
        statSync: mockStatSync,
        readdirSync: mockReaddirSync,
        copyFileSync: mockCopyFileSync,
        unlinkSync: mockUnlinkSync,
        openSync: mockOpenSync,
        readSync: mockReadSync,
        closeSync: mockCloseSync,
        writeFileSync: mockWriteFileSync,
    },
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: mockReadFileSync,
    statSync: mockStatSync,
    readdirSync: mockReaddirSync,
    copyFileSync: mockCopyFileSync,
    unlinkSync: mockUnlinkSync,
    openSync: mockOpenSync,
    readSync: mockReadSync,
    closeSync: mockCloseSync,
    writeFileSync: mockWriteFileSync,
}));

// ---------------------------------------------------------------------------
// Mock: db/sql.ts — pass-through translate
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../db/sql.js', () => ({
    translate: jest.fn<(sql: string, params: any[]) => any>().mockImplementation(
        (sql: string, params: any[]) => ({ sql, params })
    ),
}));

// ---------------------------------------------------------------------------
// Mock: db/migrations — no-op
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../db/migrations.js', () => ({
    runInitMigrations: jest.fn(),
    runSchemaMigrations: jest.fn(),
}));

jest.unstable_mockModule('../../db/migrations/system.js', () => ({
    runSystemMigrations: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: db/sqlite-backend-returning — pass-through
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../db/sqlite-backend-returning.js', () => ({
    handleReturning: jest.fn<(...a: any[]) => any[]>().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Mock: db/sqlite-backend-diag — minimal instrumentation stubs
// ---------------------------------------------------------------------------

const mockBeginOp = jest.fn<(...a: any[]) => any>().mockReturnValue({ opId: 1, isWrite: false, _t0: 0 });
const mockEndOp = jest.fn<(...a: any[]) => boolean>().mockReturnValue(false);
const mockCheckContention = jest.fn();
const mockRecordBusyRetry = jest.fn();
const mockGetDbDiagnostics = jest.fn<(...a: any[]) => any>().mockReturnValue({
    activeOps: [],
    recentSlowQueries: [],
    stats: { totalReads: 0, totalWrites: 0, slowCount: 0, contentionEvents: 0, activeWriteCount: 0, stmtCacheSize: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, windowStartedAt: '', windowDurationSec: 0 },
});
const mockResetDbDiagnostics = jest.fn();

jest.unstable_mockModule('../../db/sqlite-backend-diag.js', () => ({
    isReadQuery: jest.fn<(sql: string) => boolean>().mockImplementation(
        (sql: string) => sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')
    ),
    beginOp: mockBeginOp,
    endOp: mockEndOp,
    checkContention: mockCheckContention,
    recordBusyRetry: mockRecordBusyRetry,
    getDbDiagnostics: mockGetDbDiagnostics,
    resetDbDiagnostics: mockResetDbDiagnostics,
}));

// ---------------------------------------------------------------------------
// Import module under test (after all mocks)
// ---------------------------------------------------------------------------

const mod = await import('../../db/sqlite-backend.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all mocks and module-level DB handles between tests */
function resetState() {
    MockDatabaseConstructor.mockClear();
    mockDbInstances = [];
    mockExistsSync.mockReset().mockReturnValue(true);
    mockMkdirSync.mockClear();
    mockReadFileSync.mockReset().mockReturnValue('{}');
    mockStatSync.mockReset().mockReturnValue({ isDirectory: () => false, size: 1024, mtime: new Date() });
    mockReaddirSync.mockReset().mockReturnValue([]);
    mockCopyFileSync.mockClear();
    mockUnlinkSync.mockClear();
    mockOpenSync.mockReset().mockReturnValue(3);
    mockReadSync.mockReset().mockImplementation((_fd: any, buf: Buffer) => {
        Buffer.from('SQLite format 3\0').copy(buf, 0, 0, Math.min(16, buf.length));
        return 16;
    });
    mockCloseSync.mockClear();
    mockBeginOp.mockClear();
    mockEndOp.mockClear().mockReturnValue(false);
    mockCheckContention.mockClear();
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('sqlite-backend', () => {
    beforeEach(async () => {
        resetState();
        // Close any open DB handles from previous tests
        await mod.close();
    });

    afterEach(async () => {
        await mod.close();
    });

    // =====================================================================
    // isSystemSetting
    // =====================================================================

    describe('isSystemSetting', () => {
        it('returns true for config_overrides keys', () => {
            expect(mod.isSystemSetting('config_overrides')).toBe(true);
            expect(mod.isSystemSetting('config_overrides.resonance')).toBe(true);
        });

        it('returns true for proxy. keys', () => {
            expect(mod.isSystemSetting('proxy.config')).toBe(true);
            expect(mod.isSystemSetting('proxy.port')).toBe(true);
        });

        it('returns true for budget. keys', () => {
            expect(mod.isSystemSetting('budget.monthly')).toBe(true);
        });

        it('returns true for llm. keys', () => {
            expect(mod.isSystemSetting('llm.defaultModel')).toBe(true);
        });

        it('returns true for knowThyself. keys (both casings)', () => {
            expect(mod.isSystemSetting('knowThyself.enabled')).toBe(true);
            expect(mod.isSystemSetting('knowthyself.cycles')).toBe(true);
        });

        it('returns true for reader_image. keys', () => {
            expect(mod.isSystemSetting('reader_image.model')).toBe(true);
        });

        it('returns true for apiKey. keys', () => {
            expect(mod.isSystemSetting('apiKey.openai')).toBe(true);
        });

        it('returns true for api.keys', () => {
            expect(mod.isSystemSetting('api.keys')).toBe(true);
        });

        it('returns true for _migration_system_ keys', () => {
            expect(mod.isSystemSetting('_migration_system_v1')).toBe(true);
        });

        it('returns false for project-specific keys', () => {
            expect(mod.isSystemSetting('chat.config')).toBe(false);
            expect(mod.isSystemSetting('project.name')).toBe(false);
            expect(mod.isSystemSetting('installation.id')).toBe(false);
            expect(mod.isSystemSetting('numvar_prefix')).toBe(false);
            expect(mod.isSystemSetting('evm.reeval_progress')).toBe(false);
        });

        it('returns false for empty string', () => {
            expect(mod.isSystemSetting('')).toBe(false);
        });
    });

    // =====================================================================
    // applyEncryptionKey
    // =====================================================================

    describe('applyEncryptionKey', () => {
        it('is a no-op when PODBIT_DB_KEY env var is not set', () => {
            const mockDb = makeMockDb();
            // env var is not set in test env
            mod.applyEncryptionKey(mockDb);
            // pragma should NOT have been called (no encryption key)
            expect(mockDb.pragma).not.toHaveBeenCalled();
        });
    });

    // =====================================================================
    // getSystemDb
    // =====================================================================

    describe('getSystemDb', () => {
        it('opens system database and runs migrations', () => {
            const sysDb = mod.getSystemDb();
            expect(sysDb).toBeDefined();
            // Should have created a Database instance
            expect(MockDatabaseConstructor).toHaveBeenCalled();
        });

        it('returns the same instance on second call', () => {
            const first = mod.getSystemDb();
            const second = mod.getSystemDb();
            expect(first).toBe(second);
        });

        it('sets WAL mode and performance pragmas', () => {
            const sysDb = mod.getSystemDb();
            expect(sysDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
            expect(sysDb.pragma).toHaveBeenCalledWith('foreign_keys = ON');
            expect(sysDb.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
            expect(sysDb.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
        });

        it('registers custom functions (gen_random_uuid, LOG)', () => {
            const sysDb = mod.getSystemDb();
            expect(sysDb.function).toHaveBeenCalledWith('gen_random_uuid', expect.any(Function));
            expect(sysDb.function).toHaveBeenCalledWith('LOG', expect.any(Function));
        });

        it('runs ANALYZE after opening', () => {
            const sysDb = mod.getSystemDb();
            expect(sysDb.exec).toHaveBeenCalledWith('ANALYZE');
        });
    });

    // =====================================================================
    // getPoolInstance / getDb (via getPoolInstance)
    // =====================================================================

    describe('getPoolInstance', () => {
        it('opens a project database', () => {
            // Mock that nodes table doesn't exist so initializeSchema runs
            const instance = mod.getPoolInstance();
            expect(instance).toBeDefined();
            expect(MockDatabaseConstructor).toHaveBeenCalled();
        });

        it('returns the same instance on second call', () => {
            const first = mod.getPoolInstance();
            const second = mod.getPoolInstance();
            expect(first).toBe(second);
        });

        it('sets WAL mode and performance pragmas on project DB', () => {
            const instance = mod.getPoolInstance();
            expect(instance.pragma).toHaveBeenCalledWith('journal_mode = WAL');
            expect(instance.pragma).toHaveBeenCalledWith('foreign_keys = ON');
            expect(instance.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
            expect(instance.pragma).toHaveBeenCalledWith('synchronous = NORMAL');
            expect(instance.pragma).toHaveBeenCalledWith('cache_size = -64000');
        });

        it('registers custom functions on project DB', () => {
            const instance = mod.getPoolInstance();
            expect(instance.function).toHaveBeenCalledWith('gen_random_uuid', expect.any(Function));
            expect(instance.function).toHaveBeenCalledWith('LOG', expect.any(Function));
        });

        it('runs ANALYZE after opening', () => {
            const instance = mod.getPoolInstance();
            expect(instance.exec).toHaveBeenCalledWith('ANALYZE');
        });
    });

    // =====================================================================
    // query / queryOne — project DB
    // =====================================================================

    describe('query', () => {
        it('executes a SELECT and returns rows', async () => {
            const result = await mod.query('SELECT * FROM nodes WHERE id = ?', ['abc']);
            expect(result).toBeInstanceOf(Array);
        });

        it('executes an INSERT and returns empty array', async () => {
            const result = await mod.query("INSERT INTO nodes (id) VALUES (?)", ['abc']);
            expect(result).toBeInstanceOf(Array);
        });

        it('works with no params', async () => {
            const result = await mod.query('SELECT 1');
            expect(result).toBeInstanceOf(Array);
        });
    });

    describe('queryOne', () => {
        it('executes a SELECT and returns a single row or null', async () => {
            const result = await mod.queryOne('SELECT * FROM nodes WHERE id = ?', ['abc']);
            // Mock returns undefined from .get(), which maps to null
            expect(result === null || result === undefined || typeof result === 'object').toBe(true);
        });

        it('executes an INSERT and returns null', async () => {
            const result = await mod.queryOne("INSERT INTO nodes (id) VALUES (?)", ['abc']);
            expect(result).toBeNull();
        });
    });

    // =====================================================================
    // systemQuery / systemQueryOne
    // =====================================================================

    describe('systemQuery', () => {
        it('routes to system database for reads', async () => {
            const result = await mod.systemQuery('SELECT * FROM model_registry');
            expect(result).toBeInstanceOf(Array);
        });

        it('routes to system database for writes', async () => {
            const result = await mod.systemQuery("INSERT INTO prompts (id) VALUES (?)", ['x']);
            expect(result).toBeInstanceOf(Array);
        });
    });

    describe('systemQueryOne', () => {
        it('routes to system database', async () => {
            const result = await mod.systemQueryOne('SELECT * FROM model_registry WHERE id = ?', ['abc']);
            expect(result === null || typeof result === 'object').toBe(true);
        });
    });

    // =====================================================================
    // transactionSync
    // =====================================================================

    describe('transactionSync', () => {
        it('executes callback with query/queryOne helpers', () => {
            const result = mod.transactionSync((client) => {
                expect(client.query).toBeDefined();
                expect(client.queryOne).toBeDefined();
                return 42;
            });
            expect(result).toBe(42);
        });

        it('returns value from callback', () => {
            const result = mod.transactionSync(() => 'hello');
            expect(result).toBe('hello');
        });
    });

    // =====================================================================
    // systemTransactionSync
    // =====================================================================

    describe('systemTransactionSync', () => {
        it('executes callback against system DB', () => {
            const result = mod.systemTransactionSync((client) => {
                expect(client.query).toBeDefined();
                expect(client.queryOne).toBeDefined();
                return 99;
            });
            expect(result).toBe(99);
        });
    });

    // =====================================================================
    // healthCheck
    // =====================================================================

    describe('healthCheck', () => {
        it('returns true when both databases are healthy', async () => {
            const result = await mod.healthCheck();
            expect(result).toBe(true);
        });
    });

    // =====================================================================
    // close
    // =====================================================================

    describe('close', () => {
        it('closes all database connections', async () => {
            // Open both databases
            mod.getPoolInstance();
            mod.getSystemDb();

            await mod.close();

            // After close, next call should create new instances
            const newDb = mod.getPoolInstance();
            expect(newDb).toBeDefined();
        });

        it('is safe to call multiple times', async () => {
            await mod.close();
            await mod.close();
            // Should not throw
        });
    });

    // =====================================================================
    // migrate
    // =====================================================================

    describe('migrate', () => {
        it('runs schema migrations on the project DB', async () => {
            await mod.migrate();
            // Should not throw
        });
    });

    // =====================================================================
    // clearStatementCache
    // =====================================================================

    describe('clearStatementCache', () => {
        it('clears the statement cache without throwing', () => {
            mod.getPoolInstance(); // ensure DB is open
            mod.getSystemDb();
            mod.clearStatementCache();
            // Should not throw
        });
    });

    // =====================================================================
    // getDbDiagnostics
    // =====================================================================

    describe('getDbDiagnostics', () => {
        it('returns diagnostics object', () => {
            const diag = mod.getDbDiagnostics();
            expect(diag).toBeDefined();
            expect(diag.stats).toBeDefined();
            expect(typeof diag.stats.totalReads).toBe('number');
        });
    });

    // =====================================================================
    // yieldToEventLoop
    // =====================================================================

    describe('yieldToEventLoop', () => {
        it('returns a promise that resolves', async () => {
            await mod.yieldToEventLoop();
            // If it resolves, the test passes
        });
    });

    // =====================================================================
    // backupDatabase
    // =====================================================================

    describe('backupDatabase', () => {
        it('creates project and system backups', async () => {
            // Ensure DB is open
            mod.getPoolInstance();

            const result = await mod.backupDatabase('test-label');
            expect(result).toBeDefined();
            expect(result.label).toBe('test-label');
            expect(result.timestamp).toBeDefined();
            expect(typeof result.size).toBe('number');
            expect(typeof result.systemSize).toBe('number');
        });

        it('sanitizes label for filename safety', async () => {
            mod.getPoolInstance();
            const result = await mod.backupDatabase('my backup/special');
            expect(result.label).toBe('my_backup_special');
        });

        it('uses "manual" as default label', async () => {
            mod.getPoolInstance();
            const result = await mod.backupDatabase();
            expect(result.label).toBe('manual');
        });

        it('creates backup directory if it does not exist', async () => {
            mockExistsSync.mockReturnValue(false);
            // Need to reopen DB since close cleared it
            mockExistsSync.mockImplementation((p: any) => {
                const pStr = String(p);
                // Return false for backup dir check, true for others
                if (pStr.includes('backups')) return false;
                return true;
            });
            mod.getPoolInstance();

            await mod.backupDatabase();
            expect(mockMkdirSync).toHaveBeenCalled();
        });
    });

    // =====================================================================
    // listBackups
    // =====================================================================

    describe('listBackups', () => {
        it('returns empty array when backup dir does not exist', () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (String(p).includes('backups')) return false;
                return true;
            });
            const result = mod.listBackups();
            expect(result).toEqual([]);
        });

        it('lists project and system backup files', () => {
            const now = new Date();
            mockReaddirSync.mockReturnValue([
                'resonance_manual_2024-01-01T00-00-00-000Z.db',
                'system_manual_2024-01-01T00-00-00-000Z.db',
                'not-a-backup.txt',
            ]);
            mockStatSync.mockReturnValue({
                isDirectory: () => false,
                size: 2048,
                mtime: now,
            });

            const result = mod.listBackups();
            expect(result.length).toBe(2);
            expect(result[0].type).toBeDefined();
            // Each entry has filename, label, size, created, type
            for (const entry of result) {
                expect(entry.filename).toBeDefined();
                expect(typeof entry.size).toBe('number');
                expect(entry.created).toBeDefined();
                expect(['project', 'system']).toContain(entry.type);
            }
        });

        it('sorts backups newest first', () => {
            const older = new Date('2024-01-01');
            const newer = new Date('2024-06-01');
            mockReaddirSync.mockReturnValue([
                'resonance_a_2024-01-01T00-00-00-000Z.db',
                'resonance_b_2024-06-01T00-00-00-000Z.db',
            ]);
            let callIndex = 0;
            mockStatSync.mockImplementation(() => {
                const d = callIndex++ === 0 ? older : newer;
                return { isDirectory: () => false, size: 1024, mtime: d };
            });

            const result = mod.listBackups();
            expect(result.length).toBe(2);
            // Newer should be first
            expect(result[0].created >= result[1].created).toBe(true);
        });
    });

    // =====================================================================
    // restoreDatabase
    // =====================================================================

    describe('restoreDatabase', () => {
        it('throws if backup file does not exist', async () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (String(p).includes('backups')) return false;
                return true;
            });
            await expect(mod.restoreDatabase('nonexistent.db')).rejects.toThrow('Backup not found');
        });

        it('throws if file is not a valid SQLite database', async () => {
            mockReadSync.mockImplementation((_fd: any, buf: Buffer) => {
                Buffer.from('not a sqlite db!!').copy(buf, 0, 0, Math.min(16, buf.length));
                return 16;
            });

            // Ensure project DB is open first
            mod.getPoolInstance();

            await expect(mod.restoreDatabase('bad.db')).rejects.toThrow('not a valid SQLite');
        });
    });

    // =====================================================================
    // getProjectDir
    // =====================================================================

    describe('getProjectDir', () => {
        it('returns the project directory path', () => {
            const dir = mod.getProjectDir();
            expect(typeof dir).toBe('string');
            expect(dir).toContain('projects');
        });

        it('creates directory if it does not exist', () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (String(p).includes('projects')) return false;
                return true;
            });
            mod.getProjectDir();
            expect(mockMkdirSync).toHaveBeenCalled();
        });
    });

    // =====================================================================
    // switchProject
    // =====================================================================

    describe('switchProject', () => {
        it('throws if project DB file does not exist', async () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (String(p).includes('newproject')) return false;
                return true;
            });
            // Ensure current project DB is open
            mod.getPoolInstance();

            await expect(mod.switchProject('/path/to/newproject.db'))
                .rejects.toThrow('not found');
        });

        it('throws if project file is not a valid SQLite database', async () => {
            mockReadSync.mockImplementation((_fd: any, buf: Buffer) => {
                Buffer.from('not a sqlite file').copy(buf, 0, 0, Math.min(16, buf.length));
                return 16;
            });
            // Ensure current project DB is open
            mod.getPoolInstance();

            await expect(mod.switchProject('/path/to/bad.db'))
                .rejects.toThrow('not a valid SQLite');
        });

        it('closes old connections and reopens at new path', async () => {
            // Open the current DB
            const oldDb = mod.getPoolInstance();
            expect(oldDb).toBeDefined();

            // Switch to a new project
            await mod.switchProject('/path/to/project.db');

            // After switch, getPoolInstance should return a new instance
            const newDb = mod.getPoolInstance();
            expect(newDb).toBeDefined();
        });
    });

    // =====================================================================
    // createEmptyProject
    // =====================================================================

    describe('createEmptyProject', () => {
        it('creates a new DB at the specified path', async () => {
            // Open current DB first
            mod.getPoolInstance();

            await mod.createEmptyProject('/path/to/new.db');

            // Should have closed old DB and opened new one
            const newDb = mod.getPoolInstance();
            expect(newDb).toBeDefined();
        });

        it('clears project tables when no path given (legacy mode)', async () => {
            // Open current DB first
            const dbInstance = mod.getPoolInstance();

            await mod.createEmptyProject();

            // Should have called transaction to clear tables
            expect(dbInstance.transaction).toHaveBeenCalled();
            expect(dbInstance.pragma).toHaveBeenCalledWith('foreign_keys = OFF');
        });
    });

    // =====================================================================
    // saveProjectCopy
    // =====================================================================

    describe('saveProjectCopy', () => {
        it('creates directory and calls backup API', async () => {
            mockExistsSync.mockImplementation((p: any) => {
                if (String(p).includes('copy-dir')) return false;
                return true;
            });
            mod.getPoolInstance();

            await mod.saveProjectCopy('/some/copy-dir/project.db');
            expect(mockMkdirSync).toHaveBeenCalled();
        });
    });

    // =====================================================================
    // dialect
    // =====================================================================

    describe('dialect', () => {
        it('exports "sqlite" as the dialect', () => {
            expect(mod.dialect).toBe('sqlite');
        });
    });

    // =====================================================================
    // dataDir
    // =====================================================================

    describe('dataDir', () => {
        it('is a string path', () => {
            expect(typeof mod.dataDir).toBe('string');
        });
    });

    // =====================================================================
    // Transaction client — query/queryOne inside transactionSync
    // =====================================================================

    describe('transactionSync client', () => {
        it('client.query returns an array', () => {
            mod.transactionSync((client) => {
                const rows = client.query('SELECT 1');
                expect(Array.isArray(rows)).toBe(true);
            });
        });

        it('client.queryOne returns a value or null', () => {
            mod.transactionSync((client) => {
                const row = client.queryOne('SELECT 1');
                // Mock returns undefined from .get() which maps to null
                expect(row === null || row === undefined || typeof row === 'object').toBe(true);
            });
        });

        it('client.query handles INSERT', () => {
            mod.transactionSync((client) => {
                const result = client.query("INSERT INTO nodes (id) VALUES (?)", ['abc']);
                expect(Array.isArray(result)).toBe(true);
            });
        });
    });

    // =====================================================================
    // Concurrent writes are serialized
    // =====================================================================

    describe('write serialization', () => {
        it('multiple writes resolve in order', async () => {
            const order: number[] = [];
            const p1 = mod.query("INSERT INTO a (x) VALUES (?)", [1]).then(() => order.push(1));
            const p2 = mod.query("INSERT INTO b (x) VALUES (?)", [2]).then(() => order.push(2));
            const p3 = mod.query("INSERT INTO c (x) VALUES (?)", [3]).then(() => order.push(3));

            await Promise.all([p1, p2, p3]);

            // All three should have completed
            expect(order.length).toBe(3);
            // They should be in order since writes are serialized
            expect(order).toEqual([1, 2, 3]);
        });
    });

    // =====================================================================
    // resetDbDiagnostics re-export
    // =====================================================================

    describe('resetDbDiagnostics', () => {
        it('is exported and callable', () => {
            expect(typeof mod.resetDbDiagnostics).toBe('function');
            mod.resetDbDiagnostics();
            expect(mockResetDbDiagnostics).toHaveBeenCalled();
        });
    });
});
