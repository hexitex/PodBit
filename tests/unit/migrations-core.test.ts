/**
 * Unit tests for db/migrations/core.ts — runCoreMigrations.
 * Uses a mock Database object to verify SQL execution for column additions,
 * table creation, renames, and index creation.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runCoreMigrations } from '../../db/migrations/core.js';

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

            // Column existence check: SELECT col FROM table LIMIT 1
            const colMatch = sql.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+LIMIT\s+1/i);
            if (colMatch) {
                const col = colMatch[1];
                const table = colMatch[2];
                if (existingColumns.includes(`${table}.${col}`) || existingColumns.includes(col)) {
                    return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => { throw new Error(`no such column: ${col}`); }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // COUNT query for rename backfills
            if (sql.includes('COUNT(*)')) {
                return {
                    get: jest.fn<any>().mockReturnValue({ c: 0 }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // Subsystem assignment check
            if (sql.includes("subsystem = 'dream'")) {
                return {
                    get: jest.fn<any>().mockReturnValue(null),
                    run: jest.fn<any>(),
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

// ---------- tests ----------

describe('runCoreMigrations', () => {
    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runCoreMigrations(db as any)).not.toThrow();
    });

    it('adds voice_mode column when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN voice_mode'));
        expect(alter).toBeDefined();
    });

    it('skips voice_mode when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.voice_mode'] });
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN voice_mode'));
        expect(alter).toBeUndefined();
    });

    it('renames temperature to salience when salience is missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const rename = db._execCalls.find((s: string) => s.includes('RENAME COLUMN temperature TO salience'));
        expect(rename).toBeDefined();
    });

    it('skips salience rename when column already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.salience'] });
        runCoreMigrations(db as any);
        const rename = db._execCalls.find((s: string) => s.includes('RENAME COLUMN temperature'));
        expect(rename).toBeUndefined();
    });

    it('adds junk column and index when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN junk'));
        expect(alter).toBeDefined();
        const idx = db._execCalls.find((s: string) => s.includes('idx_nodes_junk'));
        expect(idx).toBeDefined();
    });

    it('skips junk column when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.junk'] });
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN junk'));
        expect(alter).toBeUndefined();
    });

    it('creates knowledge_cache table when cache_type column is missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const create = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS knowledge_cache'));
        expect(create).toBeDefined();
    });

    it('skips knowledge_cache creation when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['knowledge_cache.cache_type'] });
        runCoreMigrations(db as any);
        const create = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS knowledge_cache'));
        expect(create).toBeUndefined();
    });

    it('adds stale and changes_since_cached columns when missing', () => {
        const db = makeMockDb({ existingColumns: ['knowledge_cache.cache_type'] });
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN stale'));
        expect(alter).toBeDefined();
        const alter2 = db._execCalls.find((s: string) => s.includes('ADD COLUMN changes_since_cached'));
        expect(alter2).toBeDefined();
    });

    it('skips stale column when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['knowledge_cache.cache_type', 'knowledge_cache.stale'] });
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN stale'));
        expect(alter).toBeUndefined();
    });

    it('adds rejection_reason column to dream_cycles when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN rejection_reason'));
        expect(alter).toBeDefined();
    });

    it('adds domain column to dream_cycles when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.filter((s: string) => s.includes('ADD COLUMN domain'));
        expect(alter.length).toBeGreaterThan(0);
    });

    it('adds parent_ids column to dream_cycles when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN parent_ids'));
        expect(alter).toBeDefined();
    });

    it('checks for dream subsystem rename', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const check = db._prepareCalls.find((s: string) => s.includes("subsystem = 'dream'"));
        expect(check).toBeDefined();
    });

    it('renames dream subsystem to synthesis when found', () => {
        const db = makeMockDb();
        // Override to return a match for the dream assignment check
        const origPrepare = db.prepare;
        db.prepare = jest.fn<any>((sql: string) => {
            if (sql.includes("subsystem = 'dream'")) {
                return {
                    get: jest.fn<any>().mockReturnValue({ subsystem: 'dream' }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }
            return origPrepare(sql);
        });
        runCoreMigrations(db as any);
        const rename = db._execCalls.find((s: string) =>
            s.includes("SET subsystem = 'synthesis'")
        );
        expect(rename).toBeDefined();
    });

    it('renames origin dream to synthesis when count > 0', () => {
        const db = makeMockDb();
        const origPrepare = db.prepare;
        db.prepare = jest.fn<any>((sql: string) => {
            if (sql.includes("origin = 'dream'") && sql.includes('COUNT')) {
                return {
                    get: jest.fn<any>().mockReturnValue({ c: 5 }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }
            return origPrepare(sql);
        });
        runCoreMigrations(db as any);
        const rename = db._execCalls.find((s: string) =>
            s.includes("SET origin = 'synthesis'")
        );
        expect(rename).toBeDefined();
    });

    it('renames contributor dream-engine to synthesis-engine when count > 0', () => {
        const db = makeMockDb();
        const origPrepare = db.prepare;
        db.prepare = jest.fn<any>((sql: string) => {
            if (sql.includes("contributor = 'dream-engine'") && sql.includes('COUNT')) {
                return {
                    get: jest.fn<any>().mockReturnValue({ c: 3 }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }
            return origPrepare(sql);
        });
        runCoreMigrations(db as any);
        const rename = db._execCalls.find((s: string) =>
            s.includes("SET contributor = 'synthesis-engine'")
        );
        expect(rename).toBeDefined();
    });

    it('adds excluded column when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN excluded'));
        expect(alter).toBeDefined();
    });

    it('adds metadata column when missing', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN metadata'));
        expect(alter).toBeDefined();
    });

    it('creates composite indexes on edges', () => {
        const db = makeMockDb();
        runCoreMigrations(db as any);
        const idx1 = db._execCalls.find((s: string) => s.includes('idx_edges_target_type'));
        const idx2 = db._execCalls.find((s: string) => s.includes('idx_edges_source_type'));
        expect(idx1).toBeDefined();
        expect(idx2).toBeDefined();
    });
});
