/**
 * Deep unit tests for db/migrations/provenance.ts —
 * covers uncovered branches: backfill with nodes, empty backfill,
 * backfill failure, and pragma_foreign_key_list error path.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createRequire } from 'module';

// The source uses require('crypto') which needs `require` in scope.
// In ESM mode, `require` is not globally available. Polyfill it so
// the backfill code path can execute.
if (typeof globalThis.require === 'undefined') {
    (globalThis as any).require = createRequire(import.meta.url);
}

import {
    runProvenanceInitMigrations,
    runProvenanceSchemaMigrations,
} from '../../db/migrations/provenance.js';

// ---------- helpers ----------

interface MockStatement {
    get: jest.Mock<any>;
    run: jest.Mock<any>;
    all: jest.Mock<any>;
}

function makeMockDb(opts: {
    existingColumns?: string[];
    existingTables?: string[];
    backfillNodes?: any[];
    integrityFkOnDelete?: string;
    /** Make the backfill SELECT throw */
    backfillSelectError?: string;
    /** Make pragma_foreign_key_list throw */
    pragmaFkError?: boolean;
} = {}) {
    const {
        existingColumns = [],
        existingTables = [],
        backfillNodes = [],
        integrityFkOnDelete,
        backfillSelectError,
        pragmaFkError = false,
    } = opts;
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];
    const runCalls: { sql: string; args: any[] }[] = [];

    const db = {
        exec: jest.fn<any>((sql: string) => { execCalls.push(sql); }),
        transaction: jest.fn<any>((fn: Function) => fn),
        prepare: jest.fn<any>((sql: string): MockStatement => {
            prepareCalls.push(sql);

            // Column / table existence check: SELECT col FROM table LIMIT 1
            const colMatch = sql.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+LIMIT\s+1/i);
            if (colMatch) {
                const col = colMatch[1];
                const table = colMatch[2];

                if (col === 'id' || col === 'var_id') {
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

            // Backfill query for nodes
            if (sql.includes('SELECT id, content, node_type, contributor, created_at FROM nodes')) {
                if (backfillSelectError) {
                    return {
                        get: jest.fn<any>(),
                        run: jest.fn<any>(),
                        all: jest.fn<any>().mockImplementation(() => { throw new Error(backfillSelectError); }),
                    };
                }
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>(),
                    all: jest.fn<any>().mockReturnValue(backfillNodes),
                };
            }

            // UPDATE for content_hash backfill
            if (sql.includes('UPDATE nodes SET content_hash')) {
                const runMock = jest.fn<any>((...args: any[]) => {
                    runCalls.push({ sql, args });
                });
                return {
                    get: jest.fn<any>(),
                    run: runMock,
                    all: jest.fn<any>(),
                };
            }

            // pragma_foreign_key_list check
            if (sql.includes('pragma_foreign_key_list')) {
                if (pragmaFkError) {
                    return {
                        get: jest.fn<any>().mockImplementation(() => { throw new Error('pragma error'); }),
                        run: jest.fn<any>(),
                        all: jest.fn<any>(),
                    };
                }
                if (integrityFkOnDelete !== undefined) {
                    return {
                        get: jest.fn<any>().mockReturnValue({ on_delete: integrityFkOnDelete }),
                        run: jest.fn<any>(),
                        all: jest.fn<any>(),
                    };
                }
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
        _runCalls: runCalls,
    };

    return db;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// =============================================================================
// runProvenanceInitMigrations — deep coverage
// =============================================================================

describe('runProvenanceInitMigrations — deep', () => {
    it('creates tables on fresh DB and logs creation', () => {
        const db = makeMockDb();
        runProvenanceInitMigrations(db as any);
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added number_registry + node_number_refs tables');
    });

    it('skips creation when number_registry exists', () => {
        const db = makeMockDb({ existingTables: ['number_registry'] });
        runProvenanceInitMigrations(db as any);
        expect(db._execCalls.length).toBe(0);
    });
});

// =============================================================================
// runProvenanceSchemaMigrations — backfill branches
// =============================================================================

describe('runProvenanceSchemaMigrations — content_hash backfill', () => {
    it('backfills content_hash for existing nodes when column is added', () => {
        const nodes = [
            { id: 'n1', content: 'hello', node_type: 'seed', contributor: 'user', created_at: '2025-01-01' },
            { id: 'n2', content: 'world', node_type: 'voiced', contributor: 'system', created_at: '2025-01-02' },
        ];
        const db = makeMockDb({ backfillNodes: nodes });
        runProvenanceSchemaMigrations(db as any);

        // Column should be added
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN content_hash'));
        expect(alter).toBeDefined();

        // Backfill should run for each node
        expect(db._runCalls.length).toBe(2);
        expect(db._runCalls[0].args[1]).toBe('n1');
        expect(db._runCalls[1].args[1]).toBe('n2');
        // Hash should be a 64-char hex string (SHA-256)
        expect(db._runCalls[0].args[0]).toMatch(/^[a-f0-9]{64}$/);
        expect(db._runCalls[1].args[0]).toMatch(/^[a-f0-9]{64}$/);
        // Different content should produce different hashes
        expect(db._runCalls[0].args[0]).not.toBe(db._runCalls[1].args[0]);

        expect(console.error).toHaveBeenCalledWith('[sqlite] Backfilled content_hash for 2 nodes');
    });

    it('skips backfill when no nodes exist', () => {
        const db = makeMockDb({ backfillNodes: [] });
        runProvenanceSchemaMigrations(db as any);

        // Should not prepare UPDATE or call transaction
        const updatePreps = db._prepareCalls.filter((s: string) =>
            s.includes('UPDATE nodes SET content_hash')
        );
        expect(updatePreps.length).toBe(0);
        expect(db._runCalls.length).toBe(0);

        // Should still add the column
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN content_hash')
        );
        expect(alter).toBeDefined();
    });

    it('handles backfill SELECT failure gracefully (non-fatal)', () => {
        const db = makeMockDb({ backfillSelectError: 'nodes table corrupt' });
        // Should NOT throw
        expect(() => runProvenanceSchemaMigrations(db as any)).not.toThrow();

        // Column should still be added
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN content_hash')
        );
        expect(alter).toBeDefined();

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('content_hash backfill failed (non-fatal)')
        );
    });

    it('handles node with null/undefined fields during backfill without throwing', () => {
        const nodes = [
            { id: 'n3', content: null, node_type: null, contributor: null, created_at: null },
        ];
        const db = makeMockDb({ backfillNodes: nodes });
        // Should not throw — the `|| ''` fallback handles nulls
        expect(() => runProvenanceSchemaMigrations(db as any)).not.toThrow();

        // Column should be added
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN content_hash'));
        expect(alter).toBeDefined();

        // Backfill should produce a valid hash even with null fields
        expect(db._runCalls.length).toBe(1);
        expect(db._runCalls[0].args[0]).toMatch(/^[a-f0-9]{64}$/);
        expect(db._runCalls[0].args[1]).toBe('n3');
    });
});

// =============================================================================
// runProvenanceSchemaMigrations — integrity_log FK fix
// =============================================================================

describe('runProvenanceSchemaMigrations — integrity_log FK fix', () => {
    it('fixes FK when on_delete is NO ACTION', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'NO ACTION',
        });
        runProvenanceSchemaMigrations(db as any);
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(rebuild).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Fixed integrity_log FK to ON DELETE CASCADE');
    });

    it('skips FK fix when already CASCADE', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'CASCADE',
        });
        runProvenanceSchemaMigrations(db as any);
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(rebuild).toBeUndefined();
    });

    it('skips FK fix when pragma returns null (no FK row)', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
        });
        runProvenanceSchemaMigrations(db as any);
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(rebuild).toBeUndefined();
    });

    it('catches error when pragma_foreign_key_list throws', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            pragmaFkError: true,
        });
        // Should NOT throw — the outer catch silences
        expect(() => runProvenanceSchemaMigrations(db as any)).not.toThrow();
        // FK rebuild should not happen
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(rebuild).toBeUndefined();
    });

    it('fixes FK when on_delete is SET NULL', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'SET NULL',
        });
        runProvenanceSchemaMigrations(db as any);
        const rebuild = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(rebuild).toBeDefined();
    });
});

// =============================================================================
// Full path coverage
// =============================================================================

describe('runProvenanceSchemaMigrations — combined', () => {
    it('does nothing when all columns and tables exist with correct FK', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'CASCADE',
        });
        runProvenanceSchemaMigrations(db as any);
        // No ALTER TABLE or CREATE TABLE calls
        expect(db._execCalls.length).toBe(0);
    });

    it('handles completely fresh DB without errors', () => {
        const db = makeMockDb({ backfillNodes: [] });
        expect(() => runProvenanceSchemaMigrations(db as any)).not.toThrow();
        // Should add content_hash column and create integrity_log
        const alter = db._execCalls.find((s: string) => s.includes('ADD COLUMN content_hash'));
        expect(alter).toBeDefined();
        const create = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS integrity_log'));
        expect(create).toBeDefined();
    });
});
