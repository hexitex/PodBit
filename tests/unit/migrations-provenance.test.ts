/**
 * Unit tests for db/migrations/provenance.ts —
 * runProvenanceInitMigrations and runProvenanceSchemaMigrations.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
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
    /** Nodes to return for backfill query */
    backfillNodes?: any[];
    /** FK on_delete value for integrity_log */
    integrityFkOnDelete?: string;
} = {}) {
    const { existingColumns = [], existingTables = [], backfillNodes = [], integrityFkOnDelete } = opts;
    const execCalls: string[] = [];
    const prepareCalls: string[] = [];

    const db = {
        exec: jest.fn<any>((sql: string) => { execCalls.push(sql); }),
        transaction: jest.fn<any>((fn: Function) => fn),
        prepare: jest.fn<any>((sql: string): MockStatement => {
            prepareCalls.push(sql);

            // Column existence check: SELECT col FROM table LIMIT 1
            const colMatch = sql.match(/SELECT\s+(\w+)\s+FROM\s+(\w+)\s+LIMIT\s+1/i);
            if (colMatch) {
                const col = colMatch[1];
                const table = colMatch[2];

                // "id" or "var_id" checks are table existence probes
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
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>(),
                    all: jest.fn<any>().mockReturnValue(backfillNodes),
                };
            }

            // UPDATE for content_hash backfill
            if (sql.includes('UPDATE nodes SET content_hash')) {
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // pragma_foreign_key_list check
            if (sql.includes('pragma_foreign_key_list')) {
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
    };

    return db;
}

beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// =============================================================================
// runProvenanceInitMigrations
// =============================================================================

describe('runProvenanceInitMigrations', () => {
    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runProvenanceInitMigrations(db as any)).not.toThrow();
    });

    it('creates number_registry and node_number_refs tables when missing', () => {
        const db = makeMockDb();
        runProvenanceInitMigrations(db as any);
        const createRegistry = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS number_registry')
        );
        expect(createRegistry).toBeDefined();
        const createRefs = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS node_number_refs')
        );
        expect(createRefs).toBeDefined();
    });

    it('creates indexes on number_registry and node_number_refs', () => {
        const db = makeMockDb();
        runProvenanceInitMigrations(db as any);
        const idxSource = db._execCalls.find((s: string) =>
            s.includes('idx_number_registry_source')
        );
        expect(idxSource).toBeDefined();
        const idxDomain = db._execCalls.find((s: string) =>
            s.includes('idx_number_registry_domain')
        );
        expect(idxDomain).toBeDefined();
        const idxNode = db._execCalls.find((s: string) =>
            s.includes('idx_node_number_refs_node')
        );
        expect(idxNode).toBeDefined();
        const idxVar = db._execCalls.find((s: string) =>
            s.includes('idx_node_number_refs_var')
        );
        expect(idxVar).toBeDefined();
    });

    it('skips table creation when number_registry already exists', () => {
        const db = makeMockDb({ existingTables: ['number_registry'] });
        runProvenanceInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS number_registry')
        );
        expect(create).toBeUndefined();
    });
});

// =============================================================================
// runProvenanceSchemaMigrations
// =============================================================================

describe('runProvenanceSchemaMigrations', () => {
    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runProvenanceSchemaMigrations(db as any)).not.toThrow();
    });

    it('adds content_hash column when missing', () => {
        const db = makeMockDb();
        runProvenanceSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN content_hash')
        );
        expect(alter).toBeDefined();
    });

    it('creates content_hash index when adding column', () => {
        const db = makeMockDb();
        runProvenanceSchemaMigrations(db as any);
        const idx = db._execCalls.find((s: string) =>
            s.includes('idx_nodes_content_hash')
        );
        expect(idx).toBeDefined();
    });

    it('skips content_hash when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.content_hash'] });
        runProvenanceSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN content_hash')
        );
        expect(alter).toBeUndefined();
    });

    it('creates integrity_log table when missing', () => {
        const db = makeMockDb();
        runProvenanceSchemaMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS integrity_log')
        );
        expect(create).toBeDefined();
    });

    it('skips integrity_log when it already exists', () => {
        const db = makeMockDb({ existingTables: ['integrity_log'] });
        runProvenanceSchemaMigrations(db as any);
        // The initial CREATE is skipped but the FK fix may still run
        const create = db._execCalls.filter((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS integrity_log')
        );
        expect(create.length).toBe(0);
    });

    it('creates integrity_log indexes', () => {
        const db = makeMockDb();
        runProvenanceSchemaMigrations(db as any);
        const idxNode = db._execCalls.find((s: string) =>
            s.includes('idx_integrity_log_node')
        );
        expect(idxNode).toBeDefined();
        const idxPartition = db._execCalls.find((s: string) =>
            s.includes('idx_integrity_log_partition')
        );
        expect(idxPartition).toBeDefined();
        const idxChain = db._execCalls.find((s: string) =>
            s.includes('idx_integrity_log_chain')
        );
        expect(idxChain).toBeDefined();
    });

    it('fixes integrity_log FK when on_delete is not CASCADE', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'NO ACTION',
        });
        runProvenanceSchemaMigrations(db as any);
        const recreate = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(recreate).toBeDefined();
        const drop = db._execCalls.find((s: string) =>
            s.includes('DROP TABLE integrity_log')
        );
        expect(drop).toBeDefined();
        const rename = db._execCalls.find((s: string) =>
            s.includes('ALTER TABLE integrity_log_new RENAME TO integrity_log')
        );
        expect(rename).toBeDefined();
    });

    it('skips FK fix when on_delete is already CASCADE', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
            integrityFkOnDelete: 'CASCADE',
        });
        runProvenanceSchemaMigrations(db as any);
        const recreate = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(recreate).toBeUndefined();
    });

    it('skips FK fix when pragma returns null', () => {
        const db = makeMockDb({
            existingColumns: ['nodes.content_hash'],
            existingTables: ['integrity_log'],
        });
        runProvenanceSchemaMigrations(db as any);
        const recreate = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE integrity_log_new')
        );
        expect(recreate).toBeUndefined();
    });
});
