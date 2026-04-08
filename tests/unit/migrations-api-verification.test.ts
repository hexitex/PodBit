/**
 * Unit tests for db/migrations/api-verification.ts —
 * runApiVerificationInitMigrations and runApiVerificationSchemaMigrations.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
    runApiVerificationInitMigrations,
    runApiVerificationSchemaMigrations,
} from '../../db/migrations/api-verification.js';

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

            // Default: succeed
            return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
        }),
        _execCalls: execCalls,
        _prepareCalls: prepareCalls,
    };

    return db;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// =============================================================================
// runApiVerificationInitMigrations
// =============================================================================

describe('runApiVerificationInitMigrations', () => {
    it('creates api_registry table when missing', () => {
        const db = makeMockDb();
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_registry')
        );
        expect(create).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Created api_registry table');
    });

    it('skips api_registry when it already exists', () => {
        const db = makeMockDb({ existingTables: ['api_registry'] });
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_registry')
        );
        expect(create).toBeUndefined();
    });

    it('creates api_prompt_history table when missing', () => {
        const db = makeMockDb();
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_prompt_history')
        );
        expect(create).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Created api_prompt_history table');
    });

    it('skips api_prompt_history when it already exists', () => {
        const db = makeMockDb({ existingTables: ['api_prompt_history'] });
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_prompt_history')
        );
        expect(create).toBeUndefined();
    });

    it('creates api_verifications table with indexes when missing', () => {
        const db = makeMockDb();
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_verifications')
        );
        expect(create).toBeDefined();
        expect(create).toContain('idx_apiv_node');
        expect(create).toContain('idx_apiv_api');
        expect(create).toContain('idx_apiv_exec');
        expect(console.error).toHaveBeenCalledWith('[sqlite] Created api_verifications table');
    });

    it('skips api_verifications when it already exists', () => {
        const db = makeMockDb({ existingTables: ['api_verifications'] });
        runApiVerificationInitMigrations(db as any);
        const create = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS api_verifications')
        );
        expect(create).toBeUndefined();
    });

    it('adds breedable column to nodes when missing', () => {
        const db = makeMockDb();
        runApiVerificationInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN breedable')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added breedable column to nodes');
    });

    it('skips breedable when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.breedable'] });
        runApiVerificationInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN breedable')
        );
        expect(alter).toBeUndefined();
    });

    it('adds verification_impact column to nodes when missing', () => {
        const db = makeMockDb();
        runApiVerificationInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN verification_impact')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added verification_impact column to nodes');
    });

    it('skips verification_impact when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['nodes.verification_impact'] });
        runApiVerificationInitMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN verification_impact')
        );
        expect(alter).toBeUndefined();
    });

    it('does not throw when all tables and columns exist', () => {
        const db = makeMockDb({
            existingTables: ['api_registry', 'api_prompt_history', 'api_verifications'],
            existingColumns: ['nodes.breedable', 'nodes.verification_impact'],
        });
        expect(() => runApiVerificationInitMigrations(db as any)).not.toThrow();
        // No exec calls for table creation or ALTER
        expect(db._execCalls.length).toBe(0);
    });
});

// =============================================================================
// runApiVerificationSchemaMigrations
// =============================================================================

describe('runApiVerificationSchemaMigrations', () => {
    it('adds test_url column when missing', () => {
        const db = makeMockDb();
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN test_url')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added test_url column to api_registry');
    });

    it('skips test_url when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['api_registry.test_url'] });
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN test_url')
        );
        expect(alter).toBeUndefined();
    });

    it('adds mode column when missing', () => {
        const db = makeMockDb();
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN mode')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added mode column to api_registry');
    });

    it('skips mode when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['api_registry.mode'] });
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN mode')
        );
        expect(alter).toBeUndefined();
    });

    it('adds prompt_extract column when missing', () => {
        const db = makeMockDb();
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN prompt_extract')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added prompt_extract column to api_registry');
    });

    it('skips prompt_extract when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['api_registry.prompt_extract'] });
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN prompt_extract')
        );
        expect(alter).toBeUndefined();
    });

    it('adds enrichment columns to api_verifications when missing', () => {
        const db = makeMockDb();
        runApiVerificationSchemaMigrations(db as any);
        const alterIds = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN enrichment_node_ids')
        );
        expect(alterIds).toBeDefined();
        const alterCount = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN enrichment_count')
        );
        expect(alterCount).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added enrichment columns to api_verifications');
    });

    it('skips enrichment columns when enrichment_node_ids already exists', () => {
        const db = makeMockDb({ existingColumns: ['api_verifications.enrichment_node_ids'] });
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN enrichment_node_ids')
        );
        expect(alter).toBeUndefined();
    });

    it('adds decision_mode column when missing', () => {
        const db = makeMockDb();
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN decision_mode')
        );
        expect(alter).toBeDefined();
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added decision_mode column to api_verifications');
    });

    it('skips decision_mode when it already exists', () => {
        const db = makeMockDb({ existingColumns: ['api_verifications.decision_mode'] });
        runApiVerificationSchemaMigrations(db as any);
        const alter = db._execCalls.find((s: string) =>
            s.includes('ADD COLUMN decision_mode')
        );
        expect(alter).toBeUndefined();
    });

    it('does not throw when all columns exist', () => {
        const db = makeMockDb({
            existingColumns: [
                'api_registry.test_url',
                'api_registry.mode',
                'api_registry.prompt_extract',
                'api_verifications.enrichment_node_ids',
                'api_verifications.decision_mode',
            ],
        });
        expect(() => runApiVerificationSchemaMigrations(db as any)).not.toThrow();
        expect(db._execCalls.length).toBe(0);
    });
});
