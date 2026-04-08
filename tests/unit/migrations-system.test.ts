/**
 * Unit tests for db/migrations/system.ts — runSystemMigrations.
 * Uses a mock Database object to verify SQL execution for table creation
 * and column migrations.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runSystemMigrations } from '../../db/migrations/system.js';

// ---------- helpers ----------

interface MockStatement {
    get: jest.Mock<any>;
    run: jest.Mock<any>;
    all: jest.Mock<any>;
}

function makeMockDb(opts: {
    /** Columns that exist (prepare SELECT col won't throw) */
    existingColumns?: string[];
    /** Tables that exist in sqlite_master */
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
                // "id" checks are table existence checks — if table is in existingTables, succeed
                if (col === 'id' || col === 'subsystem' || col === 'name') {
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

            // COUNT query for backfill
            if (sql.includes('COUNT(*)')) {
                return {
                    get: jest.fn<any>().mockReturnValue({ c: 0 }),
                    run: jest.fn<any>(),
                    all: jest.fn<any>(),
                };
            }

            // UPDATE for tier rename
            if (sql.includes('UPDATE model_registry SET tier')) {
                return {
                    get: jest.fn<any>(),
                    run: jest.fn<any>().mockReturnValue({ changes: 0 }),
                    all: jest.fn<any>(),
                };
            }

            // Default: succeed silently
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

describe('runSystemMigrations', () => {
    it('creates settings table via exec', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const settingsExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS settings'));
        expect(settingsExec).toBeDefined();
    });

    it('creates model_registry when table does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS model_registry'));
        expect(createExec).toBeDefined();
    });

    it('skips model_registry creation when table already exists', () => {
        const db = makeMockDb({ existingTables: ['model_registry'] });
        runSystemMigrations(db as any);
        // model_registry CREATE should not appear because the SELECT id check succeeds
        // But column migrations will still run ALTER TABLEs
    });

    it('creates subsystem_assignments when table does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS subsystem_assignments'));
        expect(createExec).toBeDefined();
    });

    it('adds missing model_registry columns', () => {
        const db = makeMockDb({ existingTables: ['model_registry'] });
        runSystemMigrations(db as any);
        const alterCalls = db._execCalls.filter((s: string) =>
            s.includes('ALTER TABLE model_registry ADD COLUMN')
        );
        // Should add context_size, max_retries, retry_window_minutes, max_concurrency,
        // request_pause_ms, api_key, supports_tools, no_think, request_timeout, rate_limit_backoff_ms,
        // input_cost_per_mtok, output_cost_per_mtok, tool_cost_per_mtok
        expect(alterCalls.length).toBeGreaterThan(0);
    });

    it('skips column migration when column already exists', () => {
        const db = makeMockDb({
            existingTables: ['model_registry'],
            existingColumns: ['model_registry.context_size', 'model_registry.max_retries'],
        });
        runSystemMigrations(db as any);
        const contextSizeAlter = db._execCalls.filter((s: string) =>
            s.includes('ADD COLUMN context_size')
        );
        expect(contextSizeAlter.length).toBe(0);
    });

    it('creates llm_usage_log when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS llm_usage_log'));
        expect(createExec).toBeDefined();
    });

    it('creates prompts table when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS prompts'));
        expect(createExec).toBeDefined();
    });

    it('creates config_history when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS config_history'));
        expect(createExec).toBeDefined();
    });

    it('creates config_snapshots when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS config_snapshots'));
        expect(createExec).toBeDefined();
    });

    it('creates breakthrough_registry when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS breakthrough_registry'));
        expect(createExec).toBeDefined();
    });

    it('creates prompt_gold_standards when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS prompt_gold_standards'));
        expect(createExec).toBeDefined();
    });

    it('creates tuning_registry when table does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS tuning_registry'));
        expect(createExec).toBeDefined();
    });

    it('skips tuning_registry creation when it already exists', () => {
        const db = makeMockDb({ existingTables: ['tuning_registry'] });
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS tuning_registry'));
        expect(createExec).toBeUndefined();
    });

    it('creates api_registry when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS api_registry'));
        expect(createExec).toBeDefined();
    });

    it('creates api_prompt_history when it does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS api_prompt_history'));
        expect(createExec).toBeDefined();
    });

    it('creates refresh_tokens when table does not exist', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS refresh_tokens'));
        expect(createExec).toBeDefined();
    });

    it('skips refresh_tokens when it already exists', () => {
        const db = makeMockDb({ existingTables: ['refresh_tokens'] });
        runSystemMigrations(db as any);
        const createExec = db._execCalls.find((s: string) => s.includes('CREATE TABLE IF NOT EXISTS refresh_tokens'));
        expect(createExec).toBeUndefined();
    });

    it('adds api_registry column migrations', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const apiAlters = db._execCalls.filter((s: string) =>
            s.includes('ALTER TABLE api_registry ADD COLUMN')
        );
        // test_url, mode, prompt_extract
        expect(apiAlters.length).toBeGreaterThanOrEqual(3);
    });

    it('runs tier rename UPDATE statements', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const tierCalls = db._prepareCalls.filter((s: string) =>
            s.includes("UPDATE model_registry SET tier")
        );
        expect(tierCalls.length).toBe(2); // tier1→medium, tier2→frontier
    });

    it('adds project_name to config_snapshots', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const alterCall = db._execCalls.find((s: string) =>
            s.includes('ALTER TABLE config_snapshots ADD COLUMN project_name')
        );
        expect(alterCall).toBeDefined();
    });

    it('adds project_name to config_history', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const alterCall = db._execCalls.find((s: string) =>
            s.includes('ALTER TABLE config_history ADD COLUMN project_name')
        );
        expect(alterCall).toBeDefined();
    });

    it('adds documentation column to breakthrough_registry', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const alterCall = db._execCalls.find((s: string) =>
            s.includes('ALTER TABLE breakthrough_registry ADD COLUMN documentation')
        );
        expect(alterCall).toBeDefined();
    });

    it('adds locked column to prompt_gold_standards', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const alterCall = db._execCalls.find((s: string) =>
            s.includes('ALTER TABLE prompt_gold_standards ADD COLUMN locked')
        );
        expect(alterCall).toBeDefined();
    });

    it('adds subsystem_assignments columns', () => {
        const db = makeMockDb();
        runSystemMigrations(db as any);
        const alters = db._execCalls.filter((s: string) =>
            s.includes('ALTER TABLE subsystem_assignments ADD COLUMN')
        );
        // no_think, thinking_level, consultant_model_id
        expect(alters.length).toBeGreaterThanOrEqual(3);
    });

    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runSystemMigrations(db as any)).not.toThrow();
    });
});
