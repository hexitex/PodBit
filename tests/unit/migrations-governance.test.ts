/**
 * Unit tests for db/migrations/governance.ts —
 * runGovernanceInitMigrations and runGovernanceSchemaMigrations.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
    runGovernanceInitMigrations,
    runGovernanceSchemaMigrations,
} from '../../db/migrations/governance.js';

// ---------- helpers ----------

interface MockStatement {
    get: jest.Mock<any>;
    run: jest.Mock<any>;
    all: jest.Mock<any>;
}

function makeMockDb(opts: {
    existingColumns?: string[];
    existingTables?: string[];
} = {}) {
    const { existingColumns = [], existingTables = [] } = opts;
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];

    const db = {
        exec: jest.fn<any>((sql: string) => { execCalls.push(sql); }),
        prepare: jest.fn<any>((sql: string): MockStatement => {
            prepareCalls.push(sql);

            // sqlite_master table existence check
            const masterMatch = sql.match(/SELECT name FROM sqlite_master.*AND name='(\w+)'/);
            if (masterMatch) {
                const tableName = masterMatch[1];
                return {
                    get: jest.fn<any>().mockReturnValue(
                        existingTables.includes(tableName) ? { name: tableName } : undefined
                    ),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // Column existence check: SELECT col FROM table LIMIT 1
            const colMatch = sql.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+LIMIT\s+1/i);
            if (colMatch) {
                const col = colMatch[1];
                const table = colMatch[2];

                // "id" or "node_id" checks are table existence probes
                if (col === 'id' || col === 'node_id') {
                    if (existingTables.includes(table)) {
                        return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
                    }
                    return {
                        get: jest.fn<any>().mockImplementation(() => { throw new Error(`no such table: ${table}`); }),
                        run: jest.fn<any>(),
                        all: jest.fn<any>(),
                    };
                }

                if (existingColumns.includes(`${table}.${col}`) || existingColumns.includes(col)) {
                    return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => { throw new Error(`no such column: ${col}`); }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // UPDATE / DELETE statements
            if (sql.includes('UPDATE') || sql.includes('DELETE')) {
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>().mockReturnValue({ changes: 0 }),
                    all: jest.fn<any>(),
                };
            }

            // Default: succeed
            return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
        }),
        _execCalls: execCalls,
        _prepareCalls: prepareCalls,
    };

    return db;
}

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// =============================================================================
// runGovernanceInitMigrations
// =============================================================================

describe('runGovernanceInitMigrations', () => {
    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runGovernanceInitMigrations(db as any)).not.toThrow();
    });

    it('adds source column to domain_synonyms when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_synonyms ADD COLUMN source')
        );
        expect(alter).toBeDefined();
    });

    it('skips source column when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['domain_synonyms.source'] });
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_synonyms ADD COLUMN source')
        );
        expect(alter).toBeUndefined();
    });

    it('adds system column to domain_partitions when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_partitions ADD COLUMN system')
        );
        expect(alter).toBeDefined();
    });

    it('skips system column when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['domain_partitions.system'] });
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_partitions ADD COLUMN system')
        );
        expect(alter).toBeUndefined();
    });

    it('marks know-thyself as system partition', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const update = db._prepareCalls.find((s: string) =>
            s.includes("system = 1") && s.includes("know-thyself")
        );
        expect(update).toBeDefined();
    });

    it('removes bridges from system partitions', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const del = db._prepareCalls.find((s: string) =>
            s.includes('DELETE FROM partition_bridges') && s.includes('system = 1')
        );
        expect(del).toBeDefined();
    });

    it('logs when bridges are removed', () => {
        const db = makeMockDb();
        // Override to return changes > 0
        const origPrepare = db.prepare;
        db.prepare = jest.fn<any>((sql: string) => {
            if (sql.includes('DELETE FROM partition_bridges')) {
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>().mockReturnValue({ changes: 2 }),
                    all: jest.fn<any>(),
                };
            }
            return origPrepare(sql);
        });
        runGovernanceInitMigrations(db as any);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Removed 2 bridge(s)')
        );
    });

    it('adds transient partition columns when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN transient')
        );
        expect(alter).toBeDefined();
    });

    it('skips transient columns when they already exist', () => {
        const db = makeMockDb({ existingColumns: ['domain_partitions.transient'] });
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN transient')
        );
        expect(alter).toBeUndefined();
    });

    it('creates partition_visits table when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS partition_visits')
        );
        expect(create).toBeDefined();
    });

    it('skips partition_visits when it already exists', () => {
        const db = makeMockDb({ existingTables: ['partition_visits'] });
        runGovernanceInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS partition_visits')
        );
        expect(create).toBeUndefined();
    });

    it('adds allowed_cycles column when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN allowed_cycles')
        );
        expect(alter).toBeDefined();
    });

    it('skips allowed_cycles when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['domain_partitions.allowed_cycles'] });
        runGovernanceInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN allowed_cycles')
        );
        expect(alter).toBeUndefined();
    });

    it('creates node_stubs table when missing', () => {
        const db = makeMockDb();
        runGovernanceInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS node_stubs')
        );
        expect(create).toBeDefined();
    });

    it('skips node_stubs when it already exists', () => {
        const db = makeMockDb({ existingTables: ['node_stubs'] });
        runGovernanceInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS node_stubs')
        );
        expect(create).toBeUndefined();
    });
});

// =============================================================================
// runGovernanceSchemaMigrations
// =============================================================================

describe('runGovernanceSchemaMigrations', () => {
    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runGovernanceSchemaMigrations(db as any)).not.toThrow();
    });

    it('creates partition tables when domain_partitions does not exist', () => {
        const db = makeMockDb();
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS domain_partitions')
        );
        expect(create).toBeDefined();
        const createDomains = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS partition_domains')
        );
        expect(createDomains).toBeDefined();
    });

    it('skips partition table creation when domain_partitions already exists', () => {
        const db = makeMockDb({ existingTables: ['domain_partitions'] });
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS domain_partitions')
        );
        expect(create).toBeUndefined();
    });

    it('creates partition_bridges table when it does not exist', () => {
        const db = makeMockDb();
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS partition_bridges')
        );
        expect(create).toBeDefined();
    });

    it('skips partition_bridges when it already exists', () => {
        const db = makeMockDb({ existingTables: ['partition_bridges'] });
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS partition_bridges')
        );
        expect(create).toBeUndefined();
    });

    it('creates decisions table when it does not exist', () => {
        const db = makeMockDb();
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS decisions')
        );
        expect(create).toBeDefined();
    });

    it('skips decisions when it already exists', () => {
        const db = makeMockDb({ existingTables: ['decisions'] });
        runGovernanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS decisions')
        );
        expect(create).toBeUndefined();
    });

    it('adds source column to domain_synonyms when missing', () => {
        const db = makeMockDb();
        runGovernanceSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_synonyms ADD COLUMN source')
        );
        expect(alter).toBeDefined();
    });

    it('skips source column when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['domain_synonyms.source'] });
        runGovernanceSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('domain_synonyms ADD COLUMN source')
        );
        expect(alter).toBeUndefined();
    });
});
