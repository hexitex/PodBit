/**
 * SYSTEM DATABASE MIGRATIONS
 *
 * Creates and migrates tables that live in data/system.db (permanent, project-independent).
 * These tables hold model config, assignments, prompts, tuning, and other system-wide data.
 *
 * Extracted from models.ts, features.ts, and api-verification.ts.
 */

import type Database from 'better-sqlite3';
import { PORTS, localUrl } from '../../config/ports.js';

/**
 * Create and migrate all system.db tables.
 *
 * Handles: settings key-value store, model_registry + column migrations,
 * subsystem_assignments + thinking_level backfill, llm_usage_log, prompts,
 * config_history + config_snapshots, breakthrough_registry, prompt_gold_standards,
 * tuning_registry, api_registry + column migrations, api_prompt_history,
 * tier renames (tier1/tier2 to medium/frontier), project_name columns on
 * config tables, and refresh_tokens for JWT auth.
 *
 * @param db - The open better-sqlite3 system database connection.
 */
export function runSystemMigrations(db: Database.Database): void {
    // =========================================================================
    // SETTINGS (key-value store for system config)
    // =========================================================================
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT,
            updated_at  TEXT DEFAULT (datetime('now'))
        )
    `);

    // =========================================================================
    // MODEL REGISTRY
    // =========================================================================
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
            CREATE INDEX IF NOT EXISTS idx_model_registry_tier ON model_registry (tier) WHERE enabled = 1;
            CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry (provider);
        `);
        console.error('[system-db] Created model_registry table');
    }

    // =========================================================================
    // SUBSYSTEM ASSIGNMENTS
    // =========================================================================
    try {
        db.prepare('SELECT subsystem FROM subsystem_assignments LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS subsystem_assignments (
                subsystem       TEXT PRIMARY KEY,
                model_id        TEXT REFERENCES model_registry(id) ON DELETE SET NULL,
                updated_at      TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[system-db] Created subsystem_assignments table');
    }

    // Model registry column migrations
    const modelColumns: Array<{ col: string; sql: string }> = [
        { col: 'context_size', sql: 'ALTER TABLE model_registry ADD COLUMN context_size INTEGER' },
        { col: 'max_retries', sql: 'ALTER TABLE model_registry ADD COLUMN max_retries INTEGER DEFAULT 3' },
        { col: 'retry_window_minutes', sql: 'ALTER TABLE model_registry ADD COLUMN retry_window_minutes REAL DEFAULT 2' },
        { col: 'max_concurrency', sql: 'ALTER TABLE model_registry ADD COLUMN max_concurrency INTEGER DEFAULT 1' },
        { col: 'request_pause_ms', sql: 'ALTER TABLE model_registry ADD COLUMN request_pause_ms INTEGER DEFAULT 0' },
        { col: 'api_key', sql: 'ALTER TABLE model_registry ADD COLUMN api_key TEXT' },
        { col: 'supports_tools', sql: 'ALTER TABLE model_registry ADD COLUMN supports_tools INTEGER DEFAULT NULL' },
        { col: 'no_think', sql: 'ALTER TABLE model_registry ADD COLUMN no_think INTEGER DEFAULT 0' },
        { col: 'request_timeout', sql: 'ALTER TABLE model_registry ADD COLUMN request_timeout INTEGER DEFAULT 180' },
        { col: 'rate_limit_backoff_ms', sql: 'ALTER TABLE model_registry ADD COLUMN rate_limit_backoff_ms INTEGER DEFAULT 120000' },
    ];

    for (const { col, sql } of modelColumns) {
        try {
            db.prepare(`SELECT ${col} FROM model_registry LIMIT 1`).get();
        } catch {
            db.exec(sql);
            console.error(`[system-db] Added ${col} column to model_registry`);
        }
    }

    // Per-token cost columns
    try {
        db.prepare('SELECT input_cost_per_mtok FROM model_registry LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE model_registry ADD COLUMN input_cost_per_mtok REAL DEFAULT 0');
        db.exec('ALTER TABLE model_registry ADD COLUMN output_cost_per_mtok REAL DEFAULT 0');
        db.exec('ALTER TABLE model_registry ADD COLUMN tool_cost_per_mtok REAL DEFAULT 0');
        db.exec('UPDATE model_registry SET input_cost_per_mtok = cost_per_1k * 1000 WHERE cost_per_1k > 0');
        console.error('[system-db] Added per-token cost columns to model_registry');
    }

    // Subsystem assignments column migrations
    const assignmentColumns: Array<{ col: string; sql: string }> = [
        { col: 'no_think', sql: 'ALTER TABLE subsystem_assignments ADD COLUMN no_think INTEGER DEFAULT NULL' },
        { col: 'thinking_level', sql: 'ALTER TABLE subsystem_assignments ADD COLUMN thinking_level TEXT DEFAULT NULL' },
        { col: 'consultant_model_id', sql: 'ALTER TABLE subsystem_assignments ADD COLUMN consultant_model_id TEXT REFERENCES model_registry(id) ON DELETE SET NULL' },
    ];

    for (const { col, sql } of assignmentColumns) {
        try {
            db.prepare(`SELECT ${col} FROM subsystem_assignments LIMIT 1`).get();
        } catch {
            db.exec(sql);
            console.error(`[system-db] Added ${col} column to subsystem_assignments`);
        }
    }

    // Backfill thinking_level from no_think
    try {
        const needsBackfill = db.prepare(
            "SELECT COUNT(*) as c FROM subsystem_assignments WHERE no_think IS NOT NULL AND thinking_level IS NULL"
        ).get() as any;
        if (needsBackfill?.c > 0) {
            db.exec("UPDATE subsystem_assignments SET thinking_level = 'off' WHERE no_think = 1 AND thinking_level IS NULL");
            db.exec("UPDATE subsystem_assignments SET thinking_level = 'high' WHERE no_think = 0 AND thinking_level IS NULL");
            console.error('[system-db] Backfilled thinking_level from no_think');
        }
    } catch { /* columns may not exist yet */ }

    // =========================================================================
    // LLM USAGE LOG
    // =========================================================================
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
        console.error('[system-db] Created llm_usage_log table');
    }

    // =========================================================================
    // PROMPTS
    // =========================================================================
    try {
        db.prepare('SELECT id FROM prompts LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS prompts (
                id          TEXT NOT NULL,
                category    TEXT NOT NULL,
                locale      TEXT NOT NULL DEFAULT 'en',
                content     TEXT NOT NULL,
                description TEXT,
                updated_at  TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (id, locale)
            )
        `);
        console.error('[system-db] Created prompts table');
    }

    // =========================================================================
    // CONFIG HISTORY & SNAPSHOTS
    // =========================================================================
    try {
        db.prepare('SELECT id FROM config_history LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS config_history (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                config_path     TEXT NOT NULL,
                old_value       TEXT,
                new_value       TEXT NOT NULL,
                changed_by      TEXT NOT NULL,
                contributor     TEXT,
                reason          TEXT,
                section_id      TEXT,
                metrics_before  TEXT,
                snapshot_id     TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_config_history_path ON config_history (config_path);
            CREATE INDEX IF NOT EXISTS idx_config_history_time ON config_history (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_config_history_contributor ON config_history (contributor);
        `);
        console.error('[system-db] Created config_history table');
    }

    try {
        db.prepare('SELECT id FROM config_snapshots LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS config_snapshots (
                id              TEXT PRIMARY KEY,
                label           TEXT NOT NULL,
                parameters      TEXT NOT NULL,
                metrics_at_save TEXT,
                created_by      TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[system-db] Created config_snapshots table');
    }

    // =========================================================================
    // BREAKTHROUGH REGISTRY (cross-project)
    // =========================================================================
    try {
        db.prepare('SELECT id FROM breakthrough_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS breakthrough_registry (
                id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                node_id                     TEXT NOT NULL,
                content                     TEXT NOT NULL,
                domain                      TEXT,
                partition_id                 TEXT,
                partition_name               TEXT,
                trajectory                   TEXT,
                validation_synthesis         REAL,
                validation_novelty           REAL,
                validation_testability       REAL,
                validation_tension_resolution REAL,
                validation_composite         REAL,
                validation_reason            TEXT,
                project_name                 TEXT NOT NULL,
                promoted_by                  TEXT,
                promotion_source             TEXT NOT NULL DEFAULT 'manual',
                parent_contents              TEXT,
                promoted_at                  TEXT DEFAULT (datetime('now')),
                created_at                   TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_project ON breakthrough_registry (project_name);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_domain ON breakthrough_registry (domain);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_promoted ON breakthrough_registry (promoted_at DESC);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_composite ON breakthrough_registry (validation_composite DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_breakthrough_registry_dedup ON breakthrough_registry (node_id, project_name);
        `);
        console.error('[system-db] Created breakthrough_registry table');
    }

    // Documentation column on breakthrough_registry
    try {
        db.prepare('SELECT documentation FROM breakthrough_registry LIMIT 1').get();
    } catch {
        try {
            db.exec('ALTER TABLE breakthrough_registry ADD COLUMN documentation TEXT');
            console.error('[system-db] Added documentation column to breakthrough_registry');
        } catch { /* table may not exist yet */ }
    }

    // =========================================================================
    // PROMPT GOLD STANDARDS (autotune reference)
    // =========================================================================
    try {
        db.prepare('SELECT id FROM prompt_gold_standards LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS prompt_gold_standards (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                prompt_id       TEXT NOT NULL,
                tier            INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
                content         TEXT NOT NULL,
                test_input      TEXT NOT NULL,
                embedding       BLOB,
                model_used      TEXT,
                generated_at    TEXT DEFAULT (datetime('now')),
                UNIQUE(prompt_id, tier)
            );
            CREATE INDEX IF NOT EXISTS idx_gold_standards_prompt ON prompt_gold_standards (prompt_id);
        `);
        console.error('[system-db] Created prompt_gold_standards table');
    }

    // Locked column on prompt_gold_standards
    try {
        db.prepare('SELECT locked FROM prompt_gold_standards LIMIT 1').get();
    } catch {
        try {
            db.exec('ALTER TABLE prompt_gold_standards ADD COLUMN locked INTEGER DEFAULT 0');
            console.error('[system-db] Added locked column to prompt_gold_standards');
        } catch { /* table may not exist yet */ }
    }

    // =========================================================================
    // TUNING REGISTRY
    // =========================================================================
    const tuningExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tuning_registry'"
    ).get();
    if (!tuningExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS tuning_registry (
                id              TEXT PRIMARY KEY,
                model_id        TEXT NOT NULL,
                model_name      TEXT NOT NULL,
                model_provider  TEXT NOT NULL,
                parameters      TEXT NOT NULL,
                metrics_at_save TEXT,
                tuning_changes  INTEGER DEFAULT 0,
                subsystems      TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(model_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tuning_registry_model ON tuning_registry (model_id);
        `);
        console.error('[system-db] Created tuning_registry table');
    }

    // =========================================================================
    // API REGISTRY (external verification APIs)
    // =========================================================================
    try {
        db.prepare('SELECT id FROM api_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS api_registry (
                id                  TEXT PRIMARY KEY,
                name                TEXT NOT NULL UNIQUE,
                display_name        TEXT NOT NULL,
                description         TEXT,
                enabled             INTEGER NOT NULL DEFAULT 1,
                base_url            TEXT NOT NULL,
                auth_type           TEXT NOT NULL DEFAULT 'none',
                auth_key            TEXT,
                auth_header         TEXT,
                max_rpm             INTEGER NOT NULL DEFAULT 5,
                max_concurrent      INTEGER NOT NULL DEFAULT 1,
                timeout_ms          INTEGER NOT NULL DEFAULT 30000,
                prompt_query        TEXT,
                prompt_interpret    TEXT,
                prompt_notes        TEXT,
                response_format     TEXT NOT NULL DEFAULT 'json',
                max_response_bytes  INTEGER NOT NULL DEFAULT 65536,
                capabilities        TEXT,
                domains             TEXT,
                test_cases          TEXT,
                onboarded_at        TEXT,
                onboarded_by        TEXT,
                total_calls         INTEGER NOT NULL DEFAULT 0,
                total_errors        INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT DEFAULT (datetime('now')),
                updated_at          TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[system-db] Created api_registry table');
    }

    // api_registry column migrations
    const apiCols: Array<{ col: string; sql: string }> = [
        { col: 'test_url', sql: 'ALTER TABLE api_registry ADD COLUMN test_url TEXT' },
        { col: 'mode', sql: "ALTER TABLE api_registry ADD COLUMN mode TEXT NOT NULL DEFAULT 'verify'" },
        { col: 'prompt_extract', sql: 'ALTER TABLE api_registry ADD COLUMN prompt_extract TEXT' },
    ];
    for (const { col, sql } of apiCols) {
        try {
            db.prepare(`SELECT ${col} FROM api_registry LIMIT 1`).get();
        } catch {
            db.exec(sql);
            console.error(`[system-db] Added ${col} column to api_registry`);
        }
    }

    // =========================================================================
    // API PROMPT HISTORY
    // =========================================================================
    try {
        db.prepare('SELECT id FROM api_prompt_history LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS api_prompt_history (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                api_id          TEXT NOT NULL,
                prompt_field    TEXT NOT NULL,
                content         TEXT NOT NULL,
                version         INTEGER NOT NULL DEFAULT 1,
                reason          TEXT,
                contributor     TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_aph_api ON api_prompt_history (api_id, prompt_field);
        `);
        console.error('[system-db] Created api_prompt_history table');
    }

    // Rename tier values: tier1 → medium, tier2 → frontier
    try {
        const changed = db.prepare("UPDATE model_registry SET tier = 'medium' WHERE tier = 'tier1'").run();
        const changed2 = db.prepare("UPDATE model_registry SET tier = 'frontier' WHERE tier = 'tier2'").run();
        if ((changed.changes ?? 0) + (changed2.changes ?? 0) > 0) {
            console.error(`[system-db] Renamed tier values: tier1→medium (${changed.changes}), tier2→frontier (${changed2.changes})`);
        }
    } catch { /* already renamed or column missing — safe to ignore */ }

    // =========================================================================
    // CONFIG SNAPSHOTS: add project_name column
    // =========================================================================
    try {
        db.prepare('SELECT project_name FROM config_snapshots LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE config_snapshots ADD COLUMN project_name TEXT DEFAULT 'default'`);
        console.error('[system-db] Added project_name to config_snapshots');
    }

    // =========================================================================
    // CONFIG HISTORY: add project_name column
    // =========================================================================
    try {
        db.prepare('SELECT project_name FROM config_history LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE config_history ADD COLUMN project_name TEXT DEFAULT 'default'`);
        console.error('[system-db] Added project_name to config_history');
    }

    // =========================================================================
    // LAB REGISTRY (lab server registration — system-wide, not per-project)
    // =========================================================================
    try {
        db.prepare('SELECT id FROM lab_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS lab_registry (
                id                  TEXT PRIMARY KEY,
                name                TEXT NOT NULL UNIQUE,
                description         TEXT,
                url                 TEXT NOT NULL,
                auth_type           TEXT NOT NULL DEFAULT 'none',
                auth_credential     TEXT,
                auth_header         TEXT DEFAULT 'Authorization',
                capabilities        TEXT DEFAULT '{}',
                spec_types          TEXT DEFAULT '[]',
                queue_limit         INTEGER,
                artifact_ttl_seconds INTEGER,
                version             TEXT,
                health_status       TEXT NOT NULL DEFAULT 'unknown',
                health_checked_at   TEXT,
                health_message      TEXT,
                queue_depth         INTEGER NOT NULL DEFAULT 0,
                enabled             INTEGER NOT NULL DEFAULT 1,
                priority            INTEGER NOT NULL DEFAULT 0,
                tags                TEXT DEFAULT '[]',
                template_id         TEXT,
                context_prompt      TEXT,
                context_prompt_edited INTEGER NOT NULL DEFAULT 0,
                created_at          TEXT DEFAULT (datetime('now')),
                updated_at          TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_lab_registry_enabled ON lab_registry (enabled);
            CREATE INDEX IF NOT EXISTS idx_lab_registry_health ON lab_registry (health_status);
        `);
        console.error('[system-db] Created lab_registry table');

        // Seed default math-lab entry. The stored `url` is a hint only; because port_key
        // is set, registry.ts overlays the URL from PORTS.mathLab on every read, so future
        // port changes via .env propagate without DB edits.
        db.prepare(`
            INSERT OR IGNORE INTO lab_registry (id, name, description, url, port_key, auth_type, spec_types, template_id, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'math-lab',
            'Math Lab',
            'Mathematical and computational verification — numerical identity, convergence, symbolic, parameter sweep, simulation',
            localUrl(PORTS.mathLab),
            'mathLab',
            'none',
            JSON.stringify(['math', 'structural_analysis', 'parameter_sweep', 'simulation']),
            'math-lab',
            0
        );
        console.error('[system-db] Seeded math-lab registry entry');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PORT_KEY column — config-driven URL overlay for built-in / co-located labs.
    // When set, registry.ts builds the URL from PORTS[port_key] on every read,
    // so port changes in .env propagate without any DB migration. The stored
    // `url` column becomes a hint only. Remote (user-added) labs leave port_key
    // null and continue to use the stored URL.
    // ─────────────────────────────────────────────────────────────────────────
    try { db.prepare('SELECT port_key FROM lab_registry LIMIT 1').get(); } catch {
        try {
            db.exec('ALTER TABLE lab_registry ADD COLUMN port_key TEXT');
            console.error('[system-db] Added port_key column to lab_registry');
        } catch { /* already exists or table missing */ }
    }

    // Lab registry: add context_prompt columns if missing
    try { db.prepare('SELECT context_prompt FROM lab_registry LIMIT 1').get(); } catch {
        try {
            db.exec('ALTER TABLE lab_registry ADD COLUMN context_prompt TEXT');
            db.exec('ALTER TABLE lab_registry ADD COLUMN context_prompt_edited INTEGER NOT NULL DEFAULT 0');
            console.error('[system-db] Added context_prompt columns to lab_registry');
        } catch { /* already exists or table missing */ }
    }
    try { db.prepare('SELECT context_prompt_edited FROM lab_registry LIMIT 1').get(); } catch {
        try {
            db.exec('ALTER TABLE lab_registry ADD COLUMN context_prompt_edited INTEGER NOT NULL DEFAULT 0');
        } catch { /* */ }
    }

    // =========================================================================
    // LAB REGISTRY — ui_url column (queue management / dashboard URL)
    // =========================================================================
    try { db.prepare('SELECT ui_url FROM lab_registry LIMIT 1').get(); } catch {
        try {
            db.exec('ALTER TABLE lab_registry ADD COLUMN ui_url TEXT');
            console.error('[sqlite] Added ui_url column to lab_registry');
        } catch { /* */ }
    }

    // =========================================================================
    // REFRESH TOKENS (JWT auth for remote access)
    // =========================================================================
    const refreshExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='refresh_tokens'"
    ).get();
    if (!refreshExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id          TEXT PRIMARY KEY,
                token_hash  TEXT NOT NULL UNIQUE,
                family      TEXT NOT NULL,
                expires_at  TEXT NOT NULL,
                revoked     INTEGER DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family);
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);
        `);
        console.error('[system-db] Created refresh_tokens table');
    }

    // =========================================================================
    // PROMPT CLEANUP — remove stale evm.spec_extraction override that blocks
    // new labs by hardcoding "training neural networks" as untestable
    // =========================================================================
    try {
        const stale = db.prepare(
            "SELECT id FROM prompts WHERE id = 'evm.spec_extraction' AND content LIKE '%training neural networks%'"
        ).get();
        if (stale) {
            db.prepare("DELETE FROM prompts WHERE id = 'evm.spec_extraction'").run();
            console.error('[system-db] Removed stale evm.spec_extraction prompt override (contained hardcoded lab bias)');
        }
    } catch { /* prompts table may not exist yet */ }

    // Backfill port_key on pre-existing built-in labs by matching name + historical/current port.
    // No-op once every row has port_key set. New labs set port_key explicitly at create time.
    try {
        const labRoleHints: Array<{ portKey: 'mathLab' | 'nnLab' | 'critiqueLab'; namePattern: string; legacyPorts: number[] }> = [
            { portKey: 'mathLab',     namePattern: '%math%',     legacyPorts: [3580, PORTS.mathLab] },
            { portKey: 'nnLab',       namePattern: '%nn%',       legacyPorts: [3581, PORTS.nnLab] },
            { portKey: 'critiqueLab', namePattern: '%critique%', legacyPorts: [3583, PORTS.critiqueLab] },
        ];
        for (const hint of labRoleHints) {
            // Find labs that look like they should be bound to this port key but currently aren't
            const candidates = db.prepare(
                `SELECT id, name, url FROM lab_registry
                 WHERE (port_key IS NULL OR port_key = '')
                   AND LOWER(name) LIKE ?
                   AND (${hint.legacyPorts.map(() => 'url LIKE ?').join(' OR ')})`
            ).all(hint.namePattern, ...hint.legacyPorts.map(p => `%:${p}%`)) as Array<{ id: string; name: string; url: string }>;
            for (const c of candidates) {
                db.prepare('UPDATE lab_registry SET port_key = ? WHERE id = ?').run(hint.portKey, c.id);
                console.error(`[system-db] Backfilled port_key for "${c.name}" (${c.id}): port_key=${hint.portKey} (was url=${c.url})`);
            }
        }
    } catch (err: any) {
        console.error('[system-db] port_key backfill failed (non-fatal):', err.message);
    }
}
