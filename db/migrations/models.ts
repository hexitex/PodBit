/**
 * Model registry and subsystem assignment migrations.
 *
 * Creates the `model_registry` and `subsystem_assignments` tables if missing,
 * then adds columns incrementally (context_size, retry config, concurrency,
 * API key, thinking control, per-token costs, llm_usage_log, etc.).
 *
 * Note: These tables are also created in system.db by `system.ts`. The project-DB
 * copies are dropped after migrations by `dropSystemTablesFromProjectDb()`.
 *
 * @module db/migrations/models
 */

import type Database from 'better-sqlite3';
import { columnExists } from './helpers.js';

/**
 * Run model registry and subsystem assignment migrations on the project database.
 *
 * Creates `model_registry`, `subsystem_assignments`, and `llm_usage_log` tables, then
 * incrementally adds columns (context_size, retry config, concurrency, api_key, thinking
 * control, per-token costs, consultant model, etc.). These are project-local copies that
 * get dropped after migration by `dropSystemTablesFromProjectDb()` — the canonical
 * versions live in system.db.
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runModelsMigrations(db: Database.Database): void {
    // Migrate: add model_registry and subsystem_assignments tables if missing
    try {
        db.prepare('SELECT id FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS model_registry (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                provider        TEXT NOT NULL,
                model_id        TEXT NOT NULL,
                tier            TEXT NOT NULL DEFAULT 'medium',
                endpoint_url    TEXT,
                enabled         INTEGER DEFAULT 1,
                max_tokens      INTEGER,
                context_size    INTEGER,
                cost_per_1k     REAL DEFAULT 0,
                sort_order      INTEGER DEFAULT 0,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS subsystem_assignments (
                subsystem       TEXT PRIMARY KEY,
                model_id        TEXT REFERENCES model_registry(id) ON DELETE SET NULL,
                updated_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_model_registry_tier ON model_registry (tier) WHERE enabled = 1;
            CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry (provider);
        `);
        console.error('[sqlite] Added model_registry and subsystem_assignments tables');
    }

    // Migrate: add context_size column to model_registry if missing
    try {
        db.prepare('SELECT context_size FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN context_size INTEGER`);
        console.error('[sqlite] Added context_size column to model_registry');
    }

    // Migrate: add retry config columns to model_registry if missing
    try {
        db.prepare('SELECT max_retries FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN max_retries INTEGER DEFAULT 3`);
        db.exec(`ALTER TABLE model_registry ADD COLUMN retry_window_minutes REAL DEFAULT 2`);
        console.error('[sqlite] Added max_retries and retry_window_minutes columns to model_registry');
    }

    // Migrate: add max_concurrency column to model_registry if missing
    try {
        db.prepare('SELECT max_concurrency FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN max_concurrency INTEGER DEFAULT 1`);
        console.error('[sqlite] Added max_concurrency column to model_registry');
    }

    // Migrate: add request_pause_ms column to model_registry if missing
    try {
        db.prepare('SELECT request_pause_ms FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN request_pause_ms INTEGER DEFAULT 0`);
        console.error('[sqlite] Added request_pause_ms column to model_registry');
    }

    // Migrate: add api_key column to model_registry if missing
    try {
        db.prepare('SELECT api_key FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN api_key TEXT`);
        console.error('[sqlite] Added api_key column to model_registry');
    }

    // Migrate: add supports_tools column to model_registry
    try {
        db.prepare('SELECT supports_tools FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN supports_tools INTEGER DEFAULT NULL`);
        console.error('[sqlite] Added supports_tools column to model_registry');
    }

    // Migrate: add no_think column to model_registry
    try {
        db.prepare('SELECT no_think FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN no_think INTEGER DEFAULT 0`);
        console.error('[sqlite] Added no_think column to model_registry');
    }

    // Migrate: add request_timeout column to model_registry
    try {
        db.prepare('SELECT request_timeout FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN request_timeout INTEGER DEFAULT 180`);
        console.error('[sqlite] Added request_timeout column to model_registry');
    }

    // Migrate: add rate_limit_backoff_ms column to model_registry
    try {
        db.prepare('SELECT rate_limit_backoff_ms FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN rate_limit_backoff_ms INTEGER DEFAULT 120000`);
        console.error('[sqlite] Added rate_limit_backoff_ms column to model_registry');
    }

    // Migrate: add per-token cost columns to model_registry (input, output, tool call)
    try {
        db.prepare('SELECT input_cost_per_mtok FROM model_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE model_registry ADD COLUMN input_cost_per_mtok REAL DEFAULT 0`);
        db.exec(`ALTER TABLE model_registry ADD COLUMN output_cost_per_mtok REAL DEFAULT 0`);
        db.exec(`ALTER TABLE model_registry ADD COLUMN tool_cost_per_mtok REAL DEFAULT 0`);
        // Migrate existing cost_per_1k (per-1k tokens) → input_cost_per_mtok (per-million tokens)
        db.exec(`UPDATE model_registry SET input_cost_per_mtok = cost_per_1k * 1000 WHERE cost_per_1k > 0`);
        console.error('[sqlite] Added input_cost_per_mtok, output_cost_per_mtok, tool_cost_per_mtok columns to model_registry');
    }

    // Migrate: add llm_usage_log table for persistent call tracking
    try {
        db.prepare('SELECT id FROM llm_usage_log LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS llm_usage_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                subsystem       TEXT NOT NULL,
                model_id        TEXT NOT NULL,
                model_name      TEXT NOT NULL,
                provider        TEXT NOT NULL,
                input_tokens    INTEGER DEFAULT 0,
                output_tokens   INTEGER DEFAULT 0,
                tool_tokens     INTEGER DEFAULT 0,
                total_tokens    INTEGER DEFAULT 0,
                input_cost      REAL DEFAULT 0,
                output_cost     REAL DEFAULT 0,
                tool_cost       REAL DEFAULT 0,
                total_cost      REAL DEFAULT 0,
                latency_ms      INTEGER,
                finish_reason   TEXT,
                error           TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage_log (model_id);
            CREATE INDEX IF NOT EXISTS idx_llm_usage_subsystem ON llm_usage_log (subsystem);
            CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_log (created_at DESC);
        `);
        console.error('[sqlite] Added llm_usage_log table');
    }

    // Migrate: add no_think column to subsystem_assignments for per-subsystem thinking control
    try {
        db.prepare('SELECT no_think FROM subsystem_assignments LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE subsystem_assignments ADD COLUMN no_think INTEGER DEFAULT NULL`);
        console.error('[sqlite] Added no_think column to subsystem_assignments');
    }

    // Migrate: add thinking_level column to subsystem_assignments for multi-level thinking control
    try {
        db.prepare('SELECT thinking_level FROM subsystem_assignments LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE subsystem_assignments ADD COLUMN thinking_level TEXT DEFAULT NULL`);
        // Backfill: convert existing no_think overrides to thinking levels
        db.exec(`UPDATE subsystem_assignments SET thinking_level = 'off' WHERE no_think = 1 AND thinking_level IS NULL`);
        db.exec(`UPDATE subsystem_assignments SET thinking_level = 'high' WHERE no_think = 0 AND thinking_level IS NULL`);
        console.error('[sqlite] Added thinking_level column to subsystem_assignments (backfilled from no_think)');
    }

    // Migrate: add consultant_model_id column for per-subsystem escalation model
    if (!columnExists(db, 'subsystem_assignments', 'consultant_model_id')) {
        db.exec(`ALTER TABLE subsystem_assignments ADD COLUMN consultant_model_id TEXT REFERENCES model_registry(id) ON DELETE SET NULL`);
        console.error('[sqlite] Added consultant_model_id column to subsystem_assignments');
    }

    // Migrate: remove deprecated EVM subsystem assignments (moved to lab servers)
    // These subsystems no longer exist in Podbit — codegen, triage, routing, evaluation
    // are all handled by external lab servers now.
    try {
        const deprecated = ['evm_codegen', 'evm_triage', 'evm_research', 'evm_structural', 'evm_expert'];
        const removed = db.prepare(
            `DELETE FROM subsystem_assignments WHERE subsystem IN (${deprecated.map(() => '?').join(',')})`
        ).run(...deprecated);
        if (removed.changes > 0) {
            console.error(`[sqlite] Removed ${removed.changes} deprecated EVM subsystem assignment(s) (moved to lab servers)`);
        }
    } catch { /* non-fatal */ }
}
