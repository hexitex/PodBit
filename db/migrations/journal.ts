/**
 * Journal/transaction control migrations.
 *
 * Creates the journaling infrastructure for graph rollback:
 * - `graph_journal` — undo log capturing every INSERT/UPDATE/DELETE on core tables
 * - `timeline_markers` — high-impact event markers (config, KB scan, lab, dedup, etc.)
 * - `journal_pins` — nodes pinned for preservation during rollback
 * - SQLite BEFORE/AFTER triggers on Tier 1 tables for automatic capture
 *
 * Triggers dynamically build column lists via PRAGMA table_info to adapt
 * to whatever columns exist at migration time.
 *
 * @module db/migrations/journal
 */

import type Database from 'better-sqlite3';

/** Columns to exclude from journal snapshots (regeneratable, large) */
const EXCLUDE_COLUMNS = new Set([
    'embedding',
    'embedding_bin',
]);

/**
 * Build a json_object() SQL fragment for all columns in a table,
 * excluding any in the EXCLUDE_COLUMNS set.
 */
function buildJsonObjectSql(db: Database.Database, tableName: string, prefix: string): string {
    const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>;
    const parts = cols
        .filter(c => !EXCLUDE_COLUMNS.has(c.name))
        .map(c => `'${c.name}', ${prefix}.${c.name}`);
    return `json_object(${parts.join(', ')})`;
}

/**
 * Get the primary key column name for a table.
 */
function getPrimaryKey(db: Database.Database, tableName: string): string {
    const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string; pk: number }>;
    const pkCol = cols.find(c => c.pk === 1);
    return pkCol?.name || 'id';
}

/**
 * Columns on nodes that represent STRUCTURAL changes worth journaling.
 * Scoring/lifecycle columns (weight, salience, barren_cycles, total_children,
 * lifecycle_state, etc.) are excluded — they're recalculated by the engine
 * and generate thousands of noise entries per synthesis cycle.
 */
const NODES_STRUCTURAL_COLUMNS = [
    'content', 'node_type', 'trajectory', 'domain', 'origin', 'contributor',
    'archived', 'junk', 'excluded', 'metadata', 'content_hash',
    'voice_mode', 'breedable', 'synthesizable',
    'verification_status', 'verification_score', 'verification_results',
    'validation_synthesis', 'validation_novelty', 'validation_testability',
    'validation_tension_resolution', 'validation_composite',
    'lab_status', 'lab_experiment_id', 'lab_taint_source_id',
];

/**
 * Build a WHEN clause that only fires when structural columns change.
 * Returns empty string for non-nodes tables (journal all updates).
 */
function buildUpdateWhenClause(tableName: string): string {
    if (tableName !== 'nodes') return '';
    // Fire when ANY structural column differs between OLD and NEW
    const checks = NODES_STRUCTURAL_COLUMNS.map(c => `OLD.${c} IS NOT NEW.${c}`);
    return `AND (${checks.join(' OR ')})`;
}

/**
 * Create journal triggers for a single table.
 * - AFTER INSERT: records new row ID (before_state = NULL)
 * - BEFORE UPDATE: records full row as JSON before structural change
 * - BEFORE DELETE: records full row as JSON before deletion
 */
function createTriggersForTable(db: Database.Database, tableName: string): void {
    const pk = getPrimaryKey(db, tableName);
    const jsonOld = buildJsonObjectSql(db, tableName, 'OLD');
    const updateWhen = buildUpdateWhenClause(tableName);

    // Drop existing triggers first (idempotent re-creation)
    db.exec(`DROP TRIGGER IF EXISTS journal_${tableName}_insert`);
    db.exec(`DROP TRIGGER IF EXISTS journal_${tableName}_update`);
    db.exec(`DROP TRIGGER IF EXISTS journal_${tableName}_delete`);

    // AFTER INSERT — record that a row was created (no before_state)
    db.exec(`
        CREATE TRIGGER journal_${tableName}_insert
        AFTER INSERT ON ${tableName}
        FOR EACH ROW
        WHEN (SELECT value FROM settings WHERE key = 'journal.enabled') IS NULL
           OR (SELECT value FROM settings WHERE key = 'journal.enabled') != '0'
        BEGIN
            INSERT INTO graph_journal (table_name, row_id, operation, before_state)
            VALUES ('${tableName}', NEW.${pk}, 'INSERT', NULL);
        END
    `);

    // BEFORE UPDATE — snapshot full row before STRUCTURAL change only
    db.exec(`
        CREATE TRIGGER journal_${tableName}_update
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        WHEN ((SELECT value FROM settings WHERE key = 'journal.enabled') IS NULL
           OR (SELECT value FROM settings WHERE key = 'journal.enabled') != '0')
           ${updateWhen}
        BEGIN
            INSERT INTO graph_journal (table_name, row_id, operation, before_state)
            VALUES ('${tableName}', OLD.${pk}, 'UPDATE', ${jsonOld});
        END
    `);

    // BEFORE DELETE — snapshot full row before deletion
    db.exec(`
        CREATE TRIGGER journal_${tableName}_delete
        BEFORE DELETE ON ${tableName}
        FOR EACH ROW
        WHEN (SELECT value FROM settings WHERE key = 'journal.enabled') IS NULL
           OR (SELECT value FROM settings WHERE key = 'journal.enabled') != '0'
        BEGIN
            INSERT INTO graph_journal (table_name, row_id, operation, before_state)
            VALUES ('${tableName}', OLD.${pk}, 'DELETE', ${jsonOld});
        END
    `);
}

/** Tier 1 tables — core graph state that must be journaled */
const TIER1_TABLES = [
    'nodes',
    'edges',
    'domain_partitions',
    'partition_domains',
    'partition_bridges',
    'number_registry',
    'node_number_refs',
];

// =============================================================================
// INIT MIGRATIONS
// =============================================================================

/**
 * Run journal init migrations — create tables and indexes.
 */
export function runJournalInitMigrations(db: Database.Database): void {
    // =========================================================================
    // graph_journal table
    // =========================================================================
    try {
        db.prepare('SELECT id FROM graph_journal LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS graph_journal (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name    TEXT NOT NULL,
                row_id        TEXT NOT NULL,
                operation     TEXT NOT NULL,
                before_state  TEXT,
                timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
                marker_id     INTEGER
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_journal_time ON graph_journal (timestamp DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_journal_table_time ON graph_journal (table_name, timestamp DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_journal_row ON graph_journal (table_name, row_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_journal_marker ON graph_journal (marker_id) WHERE marker_id IS NOT NULL');
        console.error('[sqlite] Created graph_journal table with indexes');
    }

    // =========================================================================
    // timeline_markers table
    // =========================================================================
    try {
        db.prepare('SELECT id FROM timeline_markers LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS timeline_markers (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type  TEXT NOT NULL,
                label       TEXT NOT NULL,
                detail      TEXT,
                timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
                contributor TEXT
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_timeline_time ON timeline_markers (timestamp DESC)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline_markers (event_type, timestamp DESC)');
        console.error('[sqlite] Created timeline_markers table');
    }

    // =========================================================================
    // journal_pins table
    // =========================================================================
    try {
        db.prepare('SELECT id FROM journal_pins LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS journal_pins (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id     TEXT NOT NULL,
                pin_group   TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(node_id, pin_group)
            )
        `);
        console.error('[sqlite] Created journal_pins table');
    }
}

// =============================================================================
// SCHEMA MIGRATIONS
// =============================================================================

/**
 * Run journal schema migrations — create triggers on Tier 1 tables.
 * Triggers are recreated on every startup to adapt to schema changes.
 */
export function runJournalSchemaMigrations(db: Database.Database): void {
    for (const table of TIER1_TABLES) {
        // Only create triggers if the table exists
        const exists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (exists) {
            createTriggersForTable(db, table);
        }
    }
    console.error(`[sqlite] Journal triggers created/updated for ${TIER1_TABLES.length} tables`);
}
