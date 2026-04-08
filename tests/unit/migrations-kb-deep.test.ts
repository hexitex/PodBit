/**
 * Unit tests for db/migrations/kb.ts — runKbMigrations.
 * Covers all branches: table creation, raw_mode column, and
 * UNIQUE constraint rebuild (autoindex found, not found, and error path).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runKbMigrations } from '../../db/migrations/kb.js';

// ---------- helpers ----------

interface MockStatement {
    get: jest.Mock<any>;
    run: jest.Mock<any>;
    all: jest.Mock<any>;
}

function makeMockDb(opts: {
    existingColumns?: string[];
    existingTables?: string[];
    /** autoindex rows returned for the constraint migration check */
    autoIndexRows?: any[];
    /** Make the constraint rebuild exec throw */
    constraintRebuildError?: string;
} = {}) {
    const { existingColumns = [], existingTables = [], autoIndexRows, constraintRebuildError } = opts;
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];
    const pragmaCalls: string[] = [];

    const db = {
        exec: jest.fn<any>((sql: string) => {
            execCalls.push(sql);
            // Simulate constraint rebuild failure if configured
            if (constraintRebuildError && sql.includes('kb_folders_new')) {
                throw new Error(constraintRebuildError);
            }
        }),
        pragma: jest.fn<any>((sql: string) => { pragmaCalls.push(sql); }),
        prepare: jest.fn<any>((sql: string): MockStatement => {
            prepareCalls.push(sql);

            // Column existence check: SELECT col FROM table LIMIT 1
            const colMatch = sql.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+LIMIT\s+1/i);
            if (colMatch) {
                const col = colMatch[1];
                const table = colMatch[2];

                // "id" checks are table existence probes
                if (col === 'id') {
                    if (existingTables.includes(table)) {
                        return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
                    }
                    return {
                        get: jest.fn<any>().mockImplementation(() => { throw new Error(`no such table: ${table}`); }),
                        run: jest.fn<any>(),
                        all: jest.fn<any>(),
                    };
                }

                // Column migration checks
                if (existingColumns.includes(`${table}.${col}`) || existingColumns.includes(col)) {
                    return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => { throw new Error(`no such column: ${col}`); }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // sqlite_master autoindex check for constraint migration
            if (sql.includes('sqlite_autoindex_kb_folders')) {
                const rows = autoIndexRows !== undefined ? autoIndexRows : [];
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>(),
                    all: jest.fn<any>().mockReturnValue(rows),
                };
            }

            // Default: succeed
            return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
        }),
        _execCalls: execCalls,
        _prepareCalls: prepareCalls,
        _pragmaCalls: pragmaCalls,
    };

    return db;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// =============================================================================
// Table creation branches
// =============================================================================

describe('runKbMigrations — table creation', () => {
    it('creates kb_folders table when missing', () => {
        const db = makeMockDb();
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_folders')
        );
        expect(create).toBeDefined();
        expect(create).toContain('idx_kb_folders_domain');
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added kb_folders table');
    });

    it('skips kb_folders when it already exists', () => {
        const db = makeMockDb({ existingTables: ['kb_folders', 'kb_files', 'kb_chunks'], existingColumns: ['kb_folders.raw_mode'] });
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_folders')
        );
        expect(create).toBeUndefined();
    });

    it('creates kb_files table with indexes when missing', () => {
        const db = makeMockDb();
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_files')
        );
        expect(create).toBeDefined();
        expect(create).toContain('idx_kb_files_folder');
        expect(create).toContain('idx_kb_files_hash');
        expect(create).toContain('idx_kb_files_status');
        expect(create).toContain('idx_kb_files_domain');
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added kb_files table');
    });

    it('skips kb_files when it already exists', () => {
        const db = makeMockDb({ existingTables: ['kb_files'] });
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_files')
        );
        expect(create).toBeUndefined();
    });

    it('creates kb_chunks table with indexes when missing', () => {
        const db = makeMockDb();
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_chunks')
        );
        expect(create).toBeDefined();
        expect(create).toContain('idx_kb_chunks_file');
        expect(create).toContain('idx_kb_chunks_node');
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added kb_chunks table');
    });

    it('skips kb_chunks when it already exists', () => {
        const db = makeMockDb({ existingTables: ['kb_chunks'] });
        runKbMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS kb_chunks')
        );
        expect(create).toBeUndefined();
    });
});

// =============================================================================
// raw_mode column migration
// =============================================================================

describe('runKbMigrations — raw_mode column', () => {
    it('adds raw_mode column when missing', () => {
        const db = makeMockDb();
        runKbMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN raw_mode')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added raw_mode column to kb_folders');
    });

    it('skips raw_mode when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['kb_folders.raw_mode'] });
        runKbMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN raw_mode')
        );
        expect(alter).toBeUndefined();
    });
});

// =============================================================================
// UNIQUE constraint rebuild
// =============================================================================

describe('runKbMigrations — UNIQUE constraint rebuild', () => {
    it('rebuilds table when autoindex exists (old constraint found)', () => {
        const db = makeMockDb({
            autoIndexRows: [{ name: 'sqlite_autoindex_kb_folders_1' }],
        });
        runKbMigrations(db as any);

        // Should disable foreign keys, rebuild, re-enable
        expect(db.pragma).toHaveBeenCalledWith('foreign_keys = OFF');
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE kb_folders_new')
        );
        expect(rebuild).toBeDefined();
        expect(rebuild).toContain('UNIQUE(folder_path, domain, raw_mode)');
        expect(rebuild).toContain('DROP TABLE kb_folders');
        expect(rebuild).toContain('ALTER TABLE kb_folders_new RENAME TO kb_folders');
        expect(db.pragma).toHaveBeenCalledWith('foreign_keys = ON');
        expect(console.error).toHaveBeenCalledWith('[sqlite] Rebuilt kb_folders: UNIQUE(folder_path, domain, raw_mode)');
    });

    it('skips rebuild when no autoindex found (no old constraint)', () => {
        const db = makeMockDb({ autoIndexRows: [] });
        runKbMigrations(db as any);

        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE kb_folders_new')
        );
        expect(rebuild).toBeUndefined();
        // foreign_keys pragma should NOT have been called
        expect(db._pragmaCalls.length).toBe(0);
    });

    it('handles constraint rebuild error gracefully and re-enables foreign keys', () => {
        const db = makeMockDb({
            autoIndexRows: [{ name: 'sqlite_autoindex_kb_folders_1' }],
            constraintRebuildError: 'table already exists',
        });
        // Should not throw
        expect(() => runKbMigrations(db as any)).not.toThrow();
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('kb_folders constraint migration skipped')
        );
        // Should try to re-enable foreign keys even on error
        expect(db.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('handles error in foreign_keys re-enable within catch block', () => {
        const db = makeMockDb({
            autoIndexRows: [{ name: 'sqlite_autoindex_kb_folders_1' }],
            constraintRebuildError: 'something broke',
        });
        // Make pragma throw on the second call (the one inside the catch block)
        let pragmaCallCount = 0;
        (db.pragma as jest.Mock<any>).mockImplementation(() => {
            pragmaCallCount++;
            if (pragmaCallCount >= 2) {
                throw new Error('pragma failed too');
            }
        });
        // Should not throw even if the catch block's pragma fails
        expect(() => runKbMigrations(db as any)).not.toThrow();
    });

    it('does not throw on a completely fresh database', () => {
        const db = makeMockDb();
        expect(() => runKbMigrations(db as any)).not.toThrow();
    });

    it('handles all tables existing with no pending migrations', () => {
        const db = makeMockDb({
            existingTables: ['kb_folders', 'kb_files', 'kb_chunks'],
            existingColumns: ['kb_folders.raw_mode'],
            autoIndexRows: [],
        });
        runKbMigrations(db as any);
        // No CREATE TABLE or ALTER TABLE calls
        const creates = db._execCalls.filter((s: string) => s.includes('CREATE TABLE'));
        const alters = db._execCalls.filter((s: string) => s.includes('ALTER TABLE'));
        expect(creates.length).toBe(0);
        expect(alters.length).toBe(0);
    });
});
