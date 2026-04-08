/**
 * Empirical Verification Module (EVM) migrations.
 *
 * Init phase creates `lab_executions` and adds columns for claim types,
 * test categories, assertion polarity, guidance, and multi-claim indexing.
 * Also adds verification columns to the `nodes` table.
 *
 * Schema phase creates the `lab_queue` persistent job queue and recovers
 * stuck entries from prior crashes.
 *
 * @module db/migrations/evm
 */

import type Database from 'better-sqlite3';

/**
 * Run EVM init migrations (lab_executions table + columns, nodes.verification_*).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runEvmInitMigrations(db: Database.Database): void {
    // Migrate: add lab_executions table if missing
    try {
        db.prepare('SELECT id FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS lab_executions (
                id              TEXT PRIMARY KEY,
                node_id         TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'pending',
                hypothesis      TEXT,
                code            TEXT,
                evaluation_mode TEXT,
                stdout          TEXT,
                stderr          TEXT,
                exit_code       INTEGER,
                execution_time_ms INTEGER,
                verified        INTEGER,
                confidence      REAL,
                score           REAL,
                weight_before   REAL,
                weight_after    REAL,
                error           TEXT,
                attempt         INTEGER DEFAULT 1,
                created_at      TEXT DEFAULT (datetime('now')),
                completed_at    TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_lab_executions_node ON lab_executions (node_id);
            CREATE INDEX IF NOT EXISTS idx_lab_executions_status ON lab_executions (status);
            CREATE INDEX IF NOT EXISTS idx_lab_executions_verified ON lab_executions (verified);
            CREATE INDEX IF NOT EXISTS idx_lab_executions_created ON lab_executions (created_at DESC);
        `);
        console.error('[sqlite] Added lab_executions table');
    }

    // Migrate: add claim_type column to lab_executions if missing
    try {
        db.prepare('SELECT claim_type FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE lab_executions ADD COLUMN claim_type TEXT');
        console.error('[sqlite] Added claim_type column to lab_executions');
    }

    // Migrate: add test_category column to lab_executions for 4-way triage classification
    try {
        db.prepare('SELECT test_category FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE lab_executions ADD COLUMN test_category TEXT');
        console.error('[sqlite] Added test_category column to lab_executions');
    }

    // Migrate: add claim_supported and assertion_polarity columns to lab_executions
    try {
        db.prepare('SELECT claim_supported FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE lab_executions ADD COLUMN claim_supported INTEGER');
        db.exec('ALTER TABLE lab_executions ADD COLUMN assertion_polarity TEXT');
        console.error('[sqlite] Added claim_supported + assertion_polarity columns to lab_executions');
    }

    // Migrate: add guidance column to lab_executions for guided restatement
    try {
        db.prepare('SELECT guidance FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE lab_executions ADD COLUMN guidance TEXT');
        console.error('[sqlite] Added guidance column to lab_executions');
    }

    // Migrate: add verification columns to nodes table
    try {
        db.prepare('SELECT verification_status FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN verification_status TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN verification_score REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN verification_results TEXT`);
        console.error('[sqlite] Added verification columns to nodes');
    }

    // Migrate: add claim_index column for multi-claim EVM iteration
    try {
        db.prepare('SELECT claim_index FROM lab_executions LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE lab_executions ADD COLUMN claim_index INTEGER DEFAULT 0');
        console.error('[sqlite] Added claim_index column to lab_executions');
    }
}

/**
 * Run EVM schema migrations (lab_queue persistent job queue, startup recovery).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runEvmSchemaMigrations(db: Database.Database): void {
    // =========================================================================
    // EVM QUEUE — persistent verification job queue
    // =========================================================================
    try {
        db.prepare('SELECT id FROM lab_queue LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS lab_queue (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id          TEXT NOT NULL,
                status           TEXT NOT NULL DEFAULT 'pending',
                priority         INTEGER NOT NULL DEFAULT 0,
                retry_count      INTEGER NOT NULL DEFAULT 0,
                max_retries      INTEGER NOT NULL DEFAULT 3,
                guidance         TEXT,
                queued_by        TEXT NOT NULL DEFAULT 'manual',
                error            TEXT,
                execution_id     TEXT,
                queued_at        TEXT NOT NULL DEFAULT (datetime('now')),
                started_at       TEXT,
                completed_at     TEXT,
                next_eligible_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_lab_queue_status ON lab_queue (status);
            CREATE INDEX IF NOT EXISTS idx_lab_queue_node ON lab_queue (node_id);
            CREATE INDEX IF NOT EXISTS idx_lab_queue_priority ON lab_queue (status, priority DESC, queued_at ASC);
        `);
        console.error('[sqlite] Added lab_queue table');
    }

    // Add columns that were introduced after the initial lab_queue schema
    const addCol = (col: string, typedef: string) => {
        try {
            db.prepare(`SELECT ${col} FROM lab_queue LIMIT 1`).get();
        } catch {
            db.exec(`ALTER TABLE lab_queue ADD COLUMN ${col} ${typedef}`);
            console.error(`[sqlite] lab_queue: added column ${col}`);
        }
    };
    addCol('template_id', 'TEXT');
    addCol('external_job_id', 'TEXT');
    addCol('last_polled_at', 'TEXT');
    addCol('poll_count', 'INTEGER NOT NULL DEFAULT 0');
    addCol('chain_parent_id', 'INTEGER');
    addCol('chain_depth', 'INTEGER NOT NULL DEFAULT 0');
    addCol('chain_type', 'TEXT');
    addCol('chain_spec', 'TEXT');

    // Startup recovery: reset any entries stuck in 'processing' from a previous crash
    try {
        const stuck = db.prepare(
            "UPDATE lab_queue SET status = 'pending', started_at = NULL WHERE status = 'processing'"
        ).run();
        if (stuck.changes > 0) {
            console.error(`[sqlite] EVM queue: recovered ${stuck.changes} stuck entries`);
        }
    } catch { /* non-fatal */ }

    // =========================================================================
    // ONE-SHOT BACKFILL: lift legacy double-encoded `details` strings into
    // structured payloads. Earlier critique-lab versions JSON.stringify()'d
    // the full critique decision into the `details` text field, which left ~24%
    // of verdicts and verification_results blobs holding escaped JSON instead
    // of fielded data. The new code prefers `structuredDetails` everywhere; this
    // backfill rewrites those rows so the GUI renders them properly without
    // requiring re-verification.
    // =========================================================================
    try {
        const settingExists = db.prepare(
            "SELECT value FROM settings WHERE key = '_migration_lab_details_backfill_v1'"
        ).get() as { value?: string } | undefined;
        if (!settingExists?.value) {
            backfillLegacyDoubleEncodedDetails(db);
            db.prepare(
                "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('_migration_lab_details_backfill_v1', $1, datetime('now'))"
            ).run(new Date().toISOString());
        }
    } catch (e: any) {
        console.error(`[sqlite] details backfill skipped: ${e.message}`);
    }
}

/**
 * Walk lab_evidence verdict rows and nodes.verification_results blobs and
 * convert any `details: "<JSON-string>"` shape into a real `structuredDetails`
 * object. Idempotent — rows that already have `structuredDetails` or whose
 * `details` is plain prose are left untouched.
 */
function backfillLegacyDoubleEncodedDetails(db: Database.Database): void {
    let evidenceFixed = 0;
    let nodesFixed = 0;

    // 1. lab_evidence verdict rows
    try {
        const rows = db.prepare(
            "SELECT id, data_inline FROM lab_evidence WHERE label = 'verdict' AND data_inline IS NOT NULL"
        ).all() as Array<{ id: string; data_inline: string }>;

        const updateStmt = db.prepare('UPDATE lab_evidence SET data_inline = $1, size_bytes = $2 WHERE id = $3');
        for (const row of rows) {
            const rewritten = rewriteVerdictBlob(row.data_inline);
            if (rewritten && rewritten !== row.data_inline) {
                updateStmt.run(rewritten, rewritten.length, row.id);
                evidenceFixed++;
            }
        }
    } catch (e: any) {
        console.error(`[sqlite] lab_evidence backfill error: ${e.message}`);
    }

    // 2. nodes.verification_results blobs
    try {
        const rows = db.prepare(
            "SELECT id, verification_results FROM nodes WHERE verification_results IS NOT NULL"
        ).all() as Array<{ id: string; verification_results: string }>;

        const updateStmt = db.prepare('UPDATE nodes SET verification_results = $1 WHERE id = $2');
        for (const row of rows) {
            const rewritten = rewriteVerdictBlob(row.verification_results);
            if (rewritten && rewritten !== row.verification_results) {
                updateStmt.run(rewritten, row.id);
                nodesFixed++;
            }
        }
    } catch (e: any) {
        console.error(`[sqlite] nodes.verification_results backfill error: ${e.message}`);
    }

    if (evidenceFixed + nodesFixed > 0) {
        console.error(`[sqlite] details backfill: ${evidenceFixed} evidence rows, ${nodesFixed} node rows lifted to structuredDetails`);
    }
}

/**
 * Take a verdict-shaped JSON blob (whatever was stored as `data_inline` or
 * `verification_results`) and, if it has a `details` string that's actually
 * stringified JSON, lift the inner object into `structuredDetails` and
 * collapse `details` down to a short prose hint (or null).
 *
 * Returns the rewritten JSON string, or null if no rewrite was needed.
 */
function rewriteVerdictBlob(raw: string): string | null {
    let outer: any;
    try { outer = JSON.parse(raw); } catch { return null; }
    if (!outer || typeof outer !== 'object') return null;
    if (outer.structuredDetails && typeof outer.structuredDetails === 'object') return null;
    if (typeof outer.details !== 'string') return null;

    const trimmed = outer.details.trim();
    if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
        return null;
    }
    let parsed: any;
    try { parsed = JSON.parse(outer.details); } catch { return null; }
    if (!parsed || typeof parsed !== 'object') return null;

    outer.structuredDetails = parsed;
    // Try to recover a prose hint from the structured payload — fall back to null
    // so the GUI renders only fields, never the escaped JSON wall.
    const proseHint = parsed.summary ?? parsed.critique ?? parsed.rewrittenClaim;
    outer.details = typeof proseHint === 'string' ? proseHint : null;

    return JSON.stringify(outer);
}
