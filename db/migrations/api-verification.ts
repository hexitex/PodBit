/**
 * API verification migrations — external API registry, prompt versioning,
 * verification audit trail, and node breedability/impact columns.
 *
 * Init phase creates `api_registry`, `api_prompt_history`, `api_verifications`
 * tables and adds `breedable`/`verification_impact` columns to nodes.
 *
 * Schema phase adds incremental columns (test_url, mode, prompt_extract,
 * enrichment tracking, decision_mode).
 *
 * Note: `api_registry` and `api_prompt_history` are also in system.db (shared
 * across projects). The project-DB copies are dropped after migrations.
 *
 * @module db/migrations/api-verification
 */

import type Database from 'better-sqlite3';
import { addColumnIfMissing } from './helpers.js';

// =============================================================================
// INIT MIGRATIONS — run every time the DB is opened
// =============================================================================

/**
 * Run API verification init migrations.
 *
 * Creates api_registry, api_prompt_history (shared tables duplicated for
 * migration compatibility), api_verifications (project-specific), and adds
 * breedable + verification_impact columns to nodes.
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runApiVerificationInitMigrations(db: Database.Database): void {
    // api_registry — one row per registered external API (SHARED across projects)
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
        console.error('[sqlite] Created api_registry table');
    }

    // api_prompt_history — version history for per-API prompt changes (SHARED)
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
        console.error('[sqlite] Created api_prompt_history table');
    }

    // api_verifications — audit trail of API calls during EVM (PROJECT-specific)
    try {
        db.prepare('SELECT id FROM api_verifications LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS api_verifications (
                id                  TEXT PRIMARY KEY,
                node_id             TEXT NOT NULL,
                api_id              TEXT NOT NULL,
                execution_id        TEXT,
                decision_reason     TEXT,
                decision_confidence REAL,
                request_method      TEXT DEFAULT 'GET',
                request_url         TEXT,
                request_body        TEXT,
                response_status     INTEGER,
                response_body       TEXT,
                response_time_ms    INTEGER,
                verification_impact TEXT,
                interpreted_values  TEXT,
                corrections_applied INTEGER NOT NULL DEFAULT 0,
                evidence_summary    TEXT,
                confidence          REAL,
                status              TEXT NOT NULL DEFAULT 'pending',
                error               TEXT,
                created_at          TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_apiv_node ON api_verifications (node_id);
            CREATE INDEX IF NOT EXISTS idx_apiv_api ON api_verifications (api_id);
            CREATE INDEX IF NOT EXISTS idx_apiv_exec ON api_verifications (execution_id);
        `);
        console.error('[sqlite] Created api_verifications table');
    }

    // Add breedable column to nodes — 1 = breeds normally, 0 = sterile (structural refutation)
    try {
        db.prepare('SELECT breedable FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN breedable INTEGER NOT NULL DEFAULT 1');
        console.error('[sqlite] Added breedable column to nodes');
    }

    // Add verification_impact column to nodes — tracks API verification outcome
    try {
        db.prepare('SELECT verification_impact FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN verification_impact TEXT');
        console.error('[sqlite] Added verification_impact column to nodes');
    }
}

// =============================================================================
// SCHEMA MIGRATIONS — for later incremental changes
// =============================================================================

/**
 * Run API verification schema migrations (test_url, mode, prompt_extract
 * columns on api_registry; enrichment and decision_mode on api_verifications).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runApiVerificationSchemaMigrations(db: Database.Database): void {
    // Add test_url column — a known-good endpoint for connectivity checks
    addColumnIfMissing(db, 'api_registry', 'test_url', 'ALTER TABLE api_registry ADD COLUMN test_url TEXT', '[sqlite] Added test_url column to api_registry');

    // Add mode column — verify, enrich, or both
    addColumnIfMissing(db, 'api_registry', 'mode', "ALTER TABLE api_registry ADD COLUMN mode TEXT NOT NULL DEFAULT 'verify'", '[sqlite] Added mode column to api_registry');

    // Add prompt_extract column — per-API instructions for extracting new knowledge
    addColumnIfMissing(db, 'api_registry', 'prompt_extract', 'ALTER TABLE api_registry ADD COLUMN prompt_extract TEXT', '[sqlite] Added prompt_extract column to api_registry');

    // Add enrichment tracking columns to api_verifications
    addColumnIfMissing(db, 'api_verifications', 'enrichment_node_ids', 'ALTER TABLE api_verifications ADD COLUMN enrichment_node_ids TEXT', '[sqlite] Added enrichment columns to api_verifications');
    addColumnIfMissing(db, 'api_verifications', 'enrichment_count', 'ALTER TABLE api_verifications ADD COLUMN enrichment_count INTEGER NOT NULL DEFAULT 0');

    // Add decision_mode column to api_verifications
    addColumnIfMissing(db, 'api_verifications', 'decision_mode', 'ALTER TABLE api_verifications ADD COLUMN decision_mode TEXT', '[sqlite] Added decision_mode column to api_verifications');
}
