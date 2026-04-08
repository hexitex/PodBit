/**
 * Unit tests for db/migrations/features.ts
 *
 * Tests runFeaturesInitMigrations and runFeaturesSchemaMigrations
 * with a mock better-sqlite3 Database object.
 *
 * Strategy: mock db.prepare().get() to throw (column/table missing) or return data,
 * then verify db.exec() is called with the correct CREATE/ALTER statements.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runFeaturesInitMigrations, runFeaturesSchemaMigrations } from '../../db/migrations/features.js';

// ── Mock DB factory ──────────────────────────────────────────────────────────

interface MockStatement {
    get: jest.Mock;
    all: jest.Mock;
    run: jest.Mock;
}

interface MockDb {
    prepare: jest.Mock<(sql: string) => MockStatement>;
    exec: jest.Mock<(sql: string) => void>;
    transaction: jest.Mock<(fn: Function) => Function>;
    _stmts: Map<string, MockStatement>;
    /** Register a prepare() result: when SQL matches `pattern`, return this statement. */
    _whenPrepare: (pattern: string, stmt: Partial<MockStatement>) => void;
    /** Set prepare to throw for SQL matching `pattern` (simulating missing column/table). */
    _whenPrepareFails: (pattern: string) => void;
}

function createMockDb(): MockDb {
    const stmts = new Map<string, MockStatement>();
    const failPatterns = new Set<string>();

    const defaultStmt = (): MockStatement => ({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        run: jest.fn(),
    });

    const db: MockDb = {
        _stmts: stmts,
        prepare: jest.fn((sql: string) => {
            // Check if this SQL should throw (simulates missing table/column)
            for (const pattern of failPatterns) {
                if (sql.includes(pattern)) {
                    throw new Error(`no such column: ${pattern}`);
                }
            }
            // Check for registered stmts
            for (const [pattern, stmt] of stmts) {
                if (sql.includes(pattern)) {
                    return stmt;
                }
            }
            return defaultStmt();
        }),
        exec: jest.fn(),
        transaction: jest.fn((fn: Function) => {
            // Return a function that when called, runs fn immediately
            return (...args: any[]) => fn(...args);
        }),
        _whenPrepare: (pattern: string, stmt: Partial<MockStatement>) => {
            const full: MockStatement = {
                get: jest.fn().mockReturnValue(undefined),
                all: jest.fn().mockReturnValue([]),
                run: jest.fn(),
                ...stmt,
            };
            stmts.set(pattern, full);
        },
        _whenPrepareFails: (pattern: string) => {
            failPatterns.add(pattern);
        },
    };

    return db;
}

/** Check if db.exec was called with SQL containing a given substring. */
function execCalledWith(db: MockDb, substring: string): boolean {
    return db.exec.mock.calls.some(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes(substring),
    );
}

/** Count how many times db.exec was called with SQL containing a given substring. */
function execCallCount(db: MockDb, substring: string): number {
    return db.exec.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes(substring),
    ).length;
}

// =============================================================================
// runFeaturesInitMigrations
// =============================================================================

describe('runFeaturesInitMigrations', () => {
    let db: MockDb;

    beforeEach(() => {
        db = createMockDb();
    });

    // ── prompts table ────────────────────────────────────────────────────

    it('creates prompts table when it does not exist', () => {
        db._whenPrepareFails('FROM prompts');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS prompts')).toBe(true);
    });

    it('skips prompts table creation when it already exists', () => {
        db._whenPrepare('FROM prompts', { get: jest.fn().mockReturnValue({ id: 'test' }) });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS prompts')).toBe(false);
    });

    // ── scaffold_jobs table ──────────────────────────────────────────────

    it('creates scaffold_jobs table when it does not exist', () => {
        db._whenPrepareFails('FROM scaffold_jobs');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS scaffold_jobs')).toBe(true);
        expect(execCalledWith(db, 'idx_scaffold_jobs_status')).toBe(true);
    });

    it('skips scaffold_jobs table creation when it already exists', () => {
        db._whenPrepare('FROM scaffold_jobs', { get: jest.fn().mockReturnValue({ id: 'j1' }) });

        runFeaturesInitMigrations(db as any);

        // The init migration creates scaffold_jobs only when prepare throws
        const scaffoldCreates = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' && (c[0] as string).includes('CREATE TABLE IF NOT EXISTS scaffold_jobs'),
        );
        expect(scaffoldCreates.length).toBe(0);
    });

    // ── scaffold → docs rename ───────────────────────────────────────────

    it('renames scaffold subsystem assignments to docs when present', () => {
        db._whenPrepare("subsystem = 'scaffold'", {
            get: jest.fn().mockReturnValue({ count: 3 }),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "UPDATE subsystem_assignments SET subsystem = 'docs'")).toBe(true);
    });

    it('skips scaffold rename when no scaffold assignments exist', () => {
        db._whenPrepare("subsystem = 'scaffold'", {
            get: jest.fn().mockReturnValue({ count: 0 }),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "UPDATE subsystem_assignments SET subsystem = 'docs'")).toBe(false);
    });

    it('renames scaffold prompt overrides to docs when present', () => {
        db._whenPrepare("LIKE 'scaffold.%'", {
            get: jest.fn().mockReturnValue({ count: 2 }),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "REPLACE(id, 'scaffold.', 'docs.')")).toBe(true);
    });

    // ── feedback columns on nodes ────────────────────────────────────────

    it('adds feedback columns when feedback_rating is missing', () => {
        db._whenPrepareFails('feedback_rating');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN feedback_rating')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN feedback_source')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN feedback_at')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN feedback_note')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_feedback')).toBe(true);
    });

    it('skips feedback columns when they already exist', () => {
        // Don't fail on feedback_rating
        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN feedback_rating')).toBe(false);
    });

    // ── node_feedback table ──────────────────────────────────────────────

    it('creates node_feedback table when missing', () => {
        db._whenPrepareFails('FROM node_feedback');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS node_feedback')).toBe(true);
        expect(execCalledWith(db, 'idx_node_feedback_node')).toBe(true);
        expect(execCalledWith(db, 'idx_node_feedback_rating')).toBe(true);
    });

    // ── breakthrough_registry table ──────────────────────────────────────

    it('creates breakthrough_registry table when missing', () => {
        db._whenPrepareFails('FROM breakthrough_registry');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS breakthrough_registry')).toBe(true);
        expect(execCalledWith(db, 'idx_breakthrough_registry_project')).toBe(true);
        expect(execCalledWith(db, 'idx_breakthrough_registry_dedup')).toBe(true);
    });

    // ── documentation column on breakthrough_registry ────────────────────

    it('adds documentation column to breakthrough_registry when missing', () => {
        db._whenPrepareFails('documentation');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN documentation')).toBe(true);
    });

    it('skips documentation column when it already exists', () => {
        // Default mock doesn't throw on 'documentation'
        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN documentation')).toBe(false);
    });

    // ── node_keywords table ──────────────────────────────────────────────

    it('creates node_keywords table when missing', () => {
        db._whenPrepareFails('FROM node_keywords');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS node_keywords')).toBe(true);
        expect(execCalledWith(db, 'idx_node_keywords_keyword')).toBe(true);
    });

    // ── prompt_gold_standards table ──────────────────────────────────────

    it('creates prompt_gold_standards table when missing', () => {
        db._whenPrepareFails('FROM prompt_gold_standards');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS prompt_gold_standards')).toBe(true);
        expect(execCalledWith(db, 'idx_gold_standards_prompt')).toBe(true);
    });

    // ── dedup_gate_overrides table ───────────────────────────────────────

    it('creates dedup_gate_overrides table when missing', () => {
        db._whenPrepareFails('FROM dedup_gate_overrides');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS dedup_gate_overrides')).toBe(true);
    });

    // ── locked column on prompt_gold_standards ───────────────────────────

    it('adds locked column to prompt_gold_standards when missing', () => {
        db._whenPrepareFails('locked');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN locked')).toBe(true);
    });

    // ── lifecycle columns on nodes ───────────────────────────────────────

    it('adds lifecycle columns when lifecycle_state is missing', () => {
        db._whenPrepareFails('lifecycle_state');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "ADD COLUMN lifecycle_state")).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN born_at')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN activated_at')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN declining_since')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN composted_at')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN barren_cycles')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN total_children')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN generation')).toBe(true);
        // Backfill should run
        expect(execCalledWith(db, "lifecycle_state = 'active'")).toBe(true);
    });

    // ── lifecycle index ──────────────────────────────────────────────────

    it('creates lifecycle index when it does not exist', () => {
        db._whenPrepare("name='idx_nodes_lifecycle'", {
            get: jest.fn().mockReturnValue(undefined),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'idx_nodes_lifecycle')).toBe(true);
    });

    it('skips lifecycle index creation when it already exists', () => {
        db._whenPrepare("name='idx_nodes_lifecycle'", {
            get: jest.fn().mockReturnValue({ name: 'idx_nodes_lifecycle' }),
        });

        runFeaturesInitMigrations(db as any);

        // The index name may appear in the prepare check but NOT in an exec CREATE
        // We check that the CREATE INDEX is not called
        const createIndexCalls = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' &&
                (c[0] as string).includes('CREATE INDEX') &&
                (c[0] as string).includes('idx_nodes_lifecycle'),
        );
        expect(createIndexCalls.length).toBe(0);
    });

    // ── avatar_url column ────────────────────────────────────────────────

    it('adds avatar_url column when missing', () => {
        db._whenPrepareFails('avatar_url');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN avatar_url')).toBe(true);
    });

    // ── external avatar URL cleanup ──────────────────────────────────────

    it('clears external avatar URLs that are not data URIs', () => {
        db._whenPrepare("avatar_url IS NOT NULL AND avatar_url NOT LIKE 'data:%'", {
            get: jest.fn().mockReturnValue({ count: 5 }),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "SET avatar_url = NULL WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE 'data:%'")).toBe(true);
    });

    it('skips avatar URL cleanup when no external URLs exist', () => {
        db._whenPrepare("avatar_url IS NOT NULL AND avatar_url NOT LIKE 'data:%'", {
            get: jest.fn().mockReturnValue({ count: 0 }),
        });

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, "SET avatar_url = NULL")).toBe(false);
    });

    // ── question lifecycle backfill ──────────────────────────────────────

    it('backfills lifecycle for answered question nodes', () => {
        const updateStmt: MockStatement = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
        };
        db._whenPrepare('UPDATE nodes SET total_children', updateStmt);
        db._whenPrepare("node_type = 'question'", {
            all: jest.fn().mockReturnValue([
                { id: 'q1', child_count: 3 },
                { id: 'q2', child_count: 1 },
            ]),
            get: jest.fn(),
            run: jest.fn(),
        });

        runFeaturesInitMigrations(db as any);

        expect(updateStmt.run).toHaveBeenCalledTimes(2);
    });

    it('skips question backfill when no stale questions exist', () => {
        db._whenPrepare("node_type = 'question'", {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn(),
            run: jest.fn(),
        });

        runFeaturesInitMigrations(db as any);

        // No update should run for questions
        // Just verify no error
    });

    // ── config_history table ─────────────────────────────────────────────

    it('creates config_history table when missing', () => {
        db._whenPrepareFails('FROM config_history');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS config_history')).toBe(true);
        expect(execCalledWith(db, 'idx_config_history_path')).toBe(true);
        expect(execCalledWith(db, 'idx_config_history_time')).toBe(true);
    });

    // ── config_snapshots table ───────────────────────────────────────────

    it('creates config_snapshots table when missing', () => {
        db._whenPrepareFails('FROM config_snapshots');

        runFeaturesInitMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS config_snapshots')).toBe(true);
    });

    // ── complete run without errors ──────────────────────────────────────

    it('completes without errors when all tables already exist', () => {
        // Default mock: prepare().get() returns undefined (not throwing)
        // This means all "check if column exists" checks pass
        expect(() => runFeaturesInitMigrations(db as any)).not.toThrow();
    });

    it('completes without errors when all tables need creation', () => {
        // Make everything fail
        db._whenPrepareFails('FROM prompts');
        db._whenPrepareFails('FROM scaffold_jobs');
        db._whenPrepareFails('feedback_rating');
        db._whenPrepareFails('FROM node_feedback');
        db._whenPrepareFails('FROM breakthrough_registry');
        db._whenPrepareFails('documentation');
        db._whenPrepareFails('FROM node_keywords');
        db._whenPrepareFails('FROM prompt_gold_standards');
        db._whenPrepareFails('FROM dedup_gate_overrides');
        db._whenPrepareFails('locked');
        db._whenPrepareFails('lifecycle_state');
        db._whenPrepareFails('avatar_url');
        db._whenPrepareFails('FROM config_history');
        db._whenPrepareFails('FROM config_snapshots');

        expect(() => runFeaturesInitMigrations(db as any)).not.toThrow();
    });
});

// =============================================================================
// runFeaturesSchemaMigrations
// =============================================================================

describe('runFeaturesSchemaMigrations', () => {
    let db: MockDb;

    beforeEach(() => {
        db = createMockDb();
    });

    // ── scaffold_jobs table ──────────────────────────────────────────────

    it('creates scaffold_jobs table when sqlite_master check returns nothing', () => {
        db._whenPrepare("name='scaffold_jobs'", {
            get: jest.fn().mockReturnValue(undefined),
        });

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS scaffold_jobs')).toBe(true);
    });

    it('skips scaffold_jobs when table already exists in sqlite_master', () => {
        db._whenPrepare("name='scaffold_jobs'", {
            get: jest.fn().mockReturnValue({ name: 'scaffold_jobs' }),
        });

        runFeaturesSchemaMigrations(db as any);

        // The schema migration creates scaffold_jobs in a different code path
        // (sqlite_master check), so we verify it's not in exec calls
        const scaffoldCreates = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' && (c[0] as string).includes('CREATE TABLE IF NOT EXISTS scaffold_jobs'),
        );
        expect(scaffoldCreates.length).toBe(0);
    });

    // ── node_keywords table ──────────────────────────────────────────────

    it('creates node_keywords table when missing', () => {
        db._whenPrepareFails('FROM node_keywords');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS node_keywords')).toBe(true);
    });

    // ── validation columns on nodes ──────────────────────────────────────

    it('adds validation columns when validation_synthesis is missing', () => {
        db._whenPrepareFails('validation_synthesis');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN validation_synthesis')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validation_novelty')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validation_testability')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validation_tension_resolution')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validation_composite')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validation_reason')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validated_at')).toBe(true);
        expect(execCalledWith(db, 'ADD COLUMN validated_by')).toBe(true);
    });

    it('skips validation columns when they already exist', () => {
        // Default mock doesn't throw on validation_synthesis
        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN validation_synthesis')).toBe(false);
    });

    // ── tuning_registry table ────────────────────────────────────────────

    it('creates tuning_registry table when sqlite_master check returns nothing', () => {
        db._whenPrepare("name='tuning_registry'", {
            get: jest.fn().mockReturnValue(undefined),
        });

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS tuning_registry')).toBe(true);
        expect(execCalledWith(db, 'idx_tuning_registry_model')).toBe(true);
    });

    it('skips tuning_registry when it already exists', () => {
        db._whenPrepare("name='tuning_registry'", {
            get: jest.fn().mockReturnValue({ name: 'tuning_registry' }),
        });

        runFeaturesSchemaMigrations(db as any);

        const creates = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' && (c[0] as string).includes('CREATE TABLE IF NOT EXISTS tuning_registry'),
        );
        expect(creates.length).toBe(0);
    });

    // ── elite_nodes table ────────────────────────────────────────────────

    it('creates elite_nodes table when missing', () => {
        db._whenPrepareFails('FROM elite_nodes');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS elite_nodes')).toBe(true);
    });

    // ── elite_manifest_mappings table ────────────────────────────────────

    it('creates elite_manifest_mappings table when missing', () => {
        db._whenPrepareFails('FROM elite_manifest_mappings');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS elite_manifest_mappings')).toBe(true);
        expect(execCalledWith(db, 'idx_elite_manifest_node')).toBe(true);
    });

    // ── elite_verified_variables table ───────────────────────────────────

    it('creates elite_verified_variables table when missing', () => {
        db._whenPrepareFails('FROM elite_verified_variables');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS elite_verified_variables')).toBe(true);
    });

    // ── elite_bridging_log table ─────────────────────────────────────────

    it('creates elite_bridging_log table when missing', () => {
        db._whenPrepareFails('FROM elite_bridging_log');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS elite_bridging_log')).toBe(true);
        expect(execCalledWith(db, 'idx_elite_bridging_time')).toBe(true);
    });

    // ── generation backfill ──────────────────────────────────────────────

    it('runs generation backfill when migration marker is absent', () => {
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockReturnValue(undefined),
        });

        // Return some nodes for the BFS
        db._whenPrepare('FROM nodes n', {
            all: jest.fn().mockReturnValue([
                { id: 'root1', parent_ids: null },
                { id: 'child1', parent_ids: 'root1' },
            ]),
            get: jest.fn(),
            run: jest.fn(),
        });

        // The update statement for generation
        const updateStmt: MockStatement = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
        };
        db._whenPrepare('UPDATE nodes SET generation', updateStmt);

        // The settings insert for migration marker
        const markerStmt: MockStatement = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
        };
        db._whenPrepare("INSERT INTO settings", markerStmt);

        runFeaturesSchemaMigrations(db as any);

        // The transaction should have been called
        expect(db.transaction).toHaveBeenCalled();
        // Marker should be inserted
        expect(markerStmt.run).toHaveBeenCalled();
    });

    it('skips generation backfill when migration marker exists', () => {
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockReturnValue({ value: 'done' }),
        });

        runFeaturesSchemaMigrations(db as any);

        // Transaction should NOT be called for backfill
        // (transaction is only used in the backfill path)
        expect(db.transaction).not.toHaveBeenCalled();
    });

    it('handles generation backfill with no nodes gracefully', () => {
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockReturnValue(undefined),
        });
        db._whenPrepare('FROM nodes n', {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn(),
            run: jest.fn(),
        });
        const updateStmt: MockStatement = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
        };
        db._whenPrepare('UPDATE nodes SET generation', updateStmt);
        const markerStmt: MockStatement = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
        };
        db._whenPrepare("INSERT INTO settings", markerStmt);

        runFeaturesSchemaMigrations(db as any);

        expect(markerStmt.run).toHaveBeenCalled();
    });

    it('handles generation backfill failure gracefully (non-critical)', () => {
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockImplementation(() => {
                throw new Error('settings table does not exist');
            }),
        });

        // Should not throw — error is caught
        expect(() => runFeaturesSchemaMigrations(db as any)).not.toThrow();
    });

    // ── composite indexes ────────────────────────────────────────────────

    it('creates composite indexes unconditionally', () => {
        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'idx_nodes_domain_type_weight')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_type_weight')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_created')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_junk_created')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_domain_created')).toBe(true);
        expect(execCalledWith(db, 'idx_elite_nodes_gen')).toBe(true);
        expect(execCalledWith(db, 'idx_lab_node_created')).toBe(true);
        expect(execCalledWith(db, 'idx_nodes_verif_status')).toBe(true);
        expect(execCalledWith(db, 'idx_dream_cycles_domain_completed')).toBe(true);
    });

    // ── elite_considered column ──────────────────────────────────────────

    it('adds elite_considered column when missing', () => {
        db._whenPrepareFails('elite_considered');

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN elite_considered')).toBe(true);
    });

    it('skips elite_considered column when it exists', () => {
        // Default doesn't throw
        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'ADD COLUMN elite_considered')).toBe(false);
    });

    // ── activity_log table ───────────────────────────────────────────────

    it('creates activity_log table when sqlite_master check returns nothing', () => {
        db._whenPrepare("name='activity_log'", {
            get: jest.fn().mockReturnValue(undefined),
        });

        runFeaturesSchemaMigrations(db as any);

        expect(execCalledWith(db, 'CREATE TABLE IF NOT EXISTS activity_log')).toBe(true);
        expect(execCalledWith(db, 'idx_activity_log_cat_time')).toBe(true);
        expect(execCalledWith(db, 'idx_activity_log_type')).toBe(true);
    });

    it('skips activity_log when it already exists', () => {
        db._whenPrepare("name='activity_log'", {
            get: jest.fn().mockReturnValue({ name: 'activity_log' }),
        });

        runFeaturesSchemaMigrations(db as any);

        const creates = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' && (c[0] as string).includes('CREATE TABLE IF NOT EXISTS activity_log'),
        );
        expect(creates.length).toBe(0);
    });

    // ── model provenance columns ─────────────────────────────────────────

    it('adds model_id and model_name columns when missing', () => {
        // The code uses db.exec('SELECT model_id FROM nodes LIMIT 0')
        // which means it goes through exec, not prepare. We need to make exec throw
        // for this specific call only.
        const execCalls: string[] = [];
        db.exec = jest.fn((sql: string) => {
            execCalls.push(sql);
            if (sql.includes('SELECT model_id FROM nodes')) {
                throw new Error('no such column: model_id');
            }
        }) as any;

        runFeaturesSchemaMigrations(db as any);

        expect(execCalls.some(s => s.includes('ADD COLUMN model_id'))).toBe(true);
        expect(execCalls.some(s => s.includes('ADD COLUMN model_name'))).toBe(true);
    });

    it('skips model provenance columns when they exist', () => {
        // Default exec doesn't throw
        runFeaturesSchemaMigrations(db as any);

        // Should not call ALTER TABLE for model_id
        const alterCalls = db.exec.mock.calls.filter(
            (c) => typeof c[0] === 'string' && (c[0] as string).includes('ADD COLUMN model_id'),
        );
        expect(alterCalls.length).toBe(0);
    });

    // ── complete run ─────────────────────────────────────────────────────

    it('completes without errors when all tables exist', () => {
        // Set up all sqlite_master checks to return existing tables
        db._whenPrepare("name='scaffold_jobs'", {
            get: jest.fn().mockReturnValue({ name: 'scaffold_jobs' }),
        });
        db._whenPrepare("name='tuning_registry'", {
            get: jest.fn().mockReturnValue({ name: 'tuning_registry' }),
        });
        db._whenPrepare("name='activity_log'", {
            get: jest.fn().mockReturnValue({ name: 'activity_log' }),
        });
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockReturnValue({ value: 'done' }),
        });

        expect(() => runFeaturesSchemaMigrations(db as any)).not.toThrow();
    });

    it('completes without errors when all tables need creation', () => {
        db._whenPrepareFails('FROM node_keywords');
        db._whenPrepareFails('validation_synthesis');
        db._whenPrepareFails('FROM elite_nodes');
        db._whenPrepareFails('FROM elite_manifest_mappings');
        db._whenPrepareFails('FROM elite_verified_variables');
        db._whenPrepareFails('FROM elite_bridging_log');
        db._whenPrepareFails('elite_considered');

        db._whenPrepare("name='scaffold_jobs'", { get: jest.fn().mockReturnValue(undefined) });
        db._whenPrepare("name='tuning_registry'", { get: jest.fn().mockReturnValue(undefined) });
        db._whenPrepare("name='activity_log'", { get: jest.fn().mockReturnValue(undefined) });
        db._whenPrepare("key = '_migration_elite_gen_backfill'", {
            get: jest.fn().mockReturnValue(undefined),
        });
        db._whenPrepare('FROM nodes n', {
            all: jest.fn().mockReturnValue([]),
            get: jest.fn(),
            run: jest.fn(),
        });
        const updateStmt: MockStatement = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
        db._whenPrepare('UPDATE nodes SET generation', updateStmt);
        const markerStmt: MockStatement = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
        db._whenPrepare("INSERT INTO settings", markerStmt);

        expect(() => runFeaturesSchemaMigrations(db as any)).not.toThrow();
    });
});
