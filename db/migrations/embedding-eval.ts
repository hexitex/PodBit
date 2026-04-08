/**
 * Embedding evaluation cache migrations.
 *
 * Creates the `embedding_eval_cache` table for storing instruction-aware
 * embeddings keyed by (node_id, instruction_hash). Also creates the
 * `embedding_eval_results` table for storing per-node check results
 * (used in both shadow mode and live gating).
 *
 * @module db/migrations/embedding-eval
 */

import type Database from 'better-sqlite3';

/**
 * Run embedding eval init migrations.
 *
 * Creates:
 * - `embedding_eval_cache` — cached instruction-aware embeddings (node_id + instruction_hash → vector)
 * - `embedding_eval_results` — per-node check results from the embedding evaluation layer
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runEmbeddingEvalInitMigrations(db: Database.Database): void {
    // Table: embedding_eval_cache — stores instruction-aware embeddings
    db.exec(`CREATE TABLE IF NOT EXISTS embedding_eval_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        instruction_hash TEXT NOT NULL,
        embedding_bin BLOB NOT NULL,
        embedding_dims INTEGER NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(node_id, instruction_hash)
    )`);

    // Index for fast lookups by node_id
    db.exec(`CREATE INDEX IF NOT EXISTS idx_embedding_eval_cache_node
        ON embedding_eval_cache(node_id)`);

    // Table: embedding_eval_results — stores check results per node
    db.exec(`CREATE TABLE IF NOT EXISTS embedding_eval_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        mode INTEGER NOT NULL,
        mode_name TEXT NOT NULL,
        result TEXT NOT NULL CHECK(result IN ('PASS', 'FAIL', 'REVIEW')),
        score REAL NOT NULL,
        compared_to TEXT,
        instruction_used TEXT NOT NULL,
        shadow_mode INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    // Index for querying results by node
    db.exec(`CREATE INDEX IF NOT EXISTS idx_embedding_eval_results_node
        ON embedding_eval_results(node_id)`);

    // Index for querying results by mode (for calibration analysis)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_embedding_eval_results_mode
        ON embedding_eval_results(mode, result)`);

    // One-time cleanup: clear stale cache/results from wrong model name (score=0 artifacts)
    try {
        const marker = db.prepare(`SELECT value FROM settings WHERE key = '_migration_ee_model_fix'`).get() as any;
        if (!marker) {
            const cacheDeleted = db.prepare(`DELETE FROM embedding_eval_cache`).run().changes;
            const resultsDeleted = db.prepare(`DELETE FROM embedding_eval_results WHERE score = 0`).run().changes;
            db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('_migration_ee_model_fix', '1', datetime('now'))`).run();
            if (cacheDeleted || resultsDeleted) {
                console.error(`[embedding-eval] Cleared stale data: ${cacheDeleted} cached embeddings, ${resultsDeleted} zero-score results`);
            }
        }
    } catch { /* settings table may not exist yet in project DB — non-critical */ }
}
