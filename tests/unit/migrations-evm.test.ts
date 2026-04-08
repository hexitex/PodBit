/**
 * Unit tests for db/migrations/evm.ts —
 * runEvmInitMigrations and runEvmSchemaMigrations with fake Database.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Import under test (no external deps to mock — uses injected db)
// =============================================================================

const { runEvmInitMigrations, runEvmSchemaMigrations } = await import('../../db/migrations/evm.js');

// =============================================================================
// Helpers
// =============================================================================

/** Columns that runEvmInitMigrations probes via SELECT ... LIMIT 1 */
const INIT_PROBE_COLUMNS = [
    'id',           // lab_executions table existence check
    'claim_type',
    'test_category',
    'claim_supported',
    'guidance',
    'verification_status', // nodes table column
    'claim_index',
];

/** Builds a fake better-sqlite3 Database that tracks prepare/exec calls. */
function buildFakeDb(opts: { missingColumns?: string[] } = {}) {
    const missing = new Set(opts.missingColumns ?? []);
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];

    const db = {
        prepare: jest.fn((sql: string) => {
            prepareCalls.push(sql);
            // Extract the column name from "SELECT <col> FROM ..."
            const match = sql.match(/SELECT\s+(\w+)\s+FROM/i);
            const col = match?.[1];
            if (col && missing.has(col)) {
                throw new Error(`no such column: ${col}`);
            }
            return {
                get: jest.fn().mockReturnValue(undefined),
                run: jest.fn().mockReturnValue({ changes: 0 }),
            };
        }),
        exec: jest.fn((sql: string) => {
            execCalls.push(sql);
        }),
        _execCalls: execCalls,
        _prepareCalls: prepareCalls,
    };

    return db as any;
}

// =============================================================================
// Tests — runEvmInitMigrations
// =============================================================================

describe('runEvmInitMigrations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does nothing when all columns already exist', () => {
        const db = buildFakeDb({ missingColumns: [] });
        runEvmInitMigrations(db);

        // All probes succeed → no exec calls needed
        expect(db.exec).not.toHaveBeenCalled();
    });

    it('creates lab_executions table when missing', () => {
        const db = buildFakeDb({ missingColumns: ['id'] });
        runEvmInitMigrations(db);

        const createSql = db._execCalls.find((s: string) => s.includes('CREATE TABLE'));
        expect(createSql).toBeDefined();
        expect(createSql).toContain('lab_executions');
        expect(createSql).toContain('idx_lab_executions_node');
    });

    it('adds claim_type column when missing', () => {
        const db = buildFakeDb({ missingColumns: ['claim_type'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN claim_type'),
        );
    });

    it('adds test_category column when missing', () => {
        const db = buildFakeDb({ missingColumns: ['test_category'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN test_category'),
        );
    });

    it('adds claim_supported and assertion_polarity when missing', () => {
        const db = buildFakeDb({ missingColumns: ['claim_supported'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN claim_supported'),
        );
        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN assertion_polarity'),
        );
    });

    it('adds guidance column when missing', () => {
        const db = buildFakeDb({ missingColumns: ['guidance'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN guidance'),
        );
    });

    it('adds verification columns to nodes when missing', () => {
        const db = buildFakeDb({ missingColumns: ['verification_status'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN verification_status'),
        );
        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN verification_score'),
        );
        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN verification_results'),
        );
    });

    it('adds claim_index column when missing', () => {
        const db = buildFakeDb({ missingColumns: ['claim_index'] });
        runEvmInitMigrations(db);

        expect(db.exec).toHaveBeenCalledWith(
            expect.stringContaining('ADD COLUMN claim_index'),
        );
    });

    it('handles all columns missing at once', () => {
        const db = buildFakeDb({ missingColumns: INIT_PROBE_COLUMNS });
        runEvmInitMigrations(db);

        // Should have CREATE TABLE + multiple ALTER TABLE calls
        expect(db.exec).toHaveBeenCalled();
        const calls = db._execCalls as string[];
        expect(calls.some((s: string) => s.includes('CREATE TABLE'))).toBe(true);
        expect(calls.some((s: string) => s.includes('claim_type'))).toBe(true);
        expect(calls.some((s: string) => s.includes('claim_index'))).toBe(true);
    });
});

// =============================================================================
// Tests — runEvmSchemaMigrations
// =============================================================================

describe('runEvmSchemaMigrations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does nothing when lab_queue table already exists and no stuck entries', () => {
        const db = buildFakeDb({ missingColumns: [] });
        runEvmSchemaMigrations(db);

        // Table exists → no CREATE, but UPDATE for stuck entries runs
        expect(db.exec).not.toHaveBeenCalled();
    });

    it('creates lab_queue table when missing', () => {
        const db = buildFakeDb({ missingColumns: ['id'] });

        // The schema migration probes SELECT id FROM lab_queue
        // but our fake treats any 'id' column as missing. We need a
        // more targeted fake for this test.
        const execCalls: string[] = [];
        const specificDb = {
            prepare: jest.fn((sql: string) => {
                if (sql.includes('lab_queue') && sql.includes('SELECT id')) {
                    throw new Error('no such table: lab_queue');
                }
                return {
                    get: jest.fn().mockReturnValue(undefined),
                    run: jest.fn().mockReturnValue({ changes: 0 }),
                };
            }),
            exec: jest.fn((sql: string) => {
                execCalls.push(sql);
            }),
        } as any;

        runEvmSchemaMigrations(specificDb);

        const createSql = execCalls.find(s => s.includes('CREATE TABLE'));
        expect(createSql).toBeDefined();
        expect(createSql).toContain('lab_queue');
        expect(createSql).toContain('idx_lab_queue_status');
    });

    it('recovers stuck processing entries', () => {
        const mockRun = jest.fn().mockReturnValue({ changes: 2 });
        const db = {
            prepare: jest.fn((sql: string) => {
                if (sql.includes('UPDATE lab_queue')) {
                    return { run: mockRun };
                }
                return {
                    get: jest.fn().mockReturnValue(undefined),
                    run: jest.fn().mockReturnValue({ changes: 0 }),
                };
            }),
            exec: jest.fn(),
        } as any;

        runEvmSchemaMigrations(db);

        expect(mockRun).toHaveBeenCalled();
    });

    it('handles recovery failure gracefully', () => {
        const db = {
            prepare: jest.fn((sql: string) => {
                if (sql.includes('UPDATE lab_queue')) {
                    throw new Error('table locked');
                }
                return {
                    get: jest.fn().mockReturnValue(undefined),
                    run: jest.fn().mockReturnValue({ changes: 0 }),
                };
            }),
            exec: jest.fn(),
        } as any;

        // Should not throw
        expect(() => runEvmSchemaMigrations(db)).not.toThrow();
    });
});
