/**
 * Provenance migrations — number variable registry and Merkle DAG integrity.
 *
 * Init phase creates `number_registry` and `node_number_refs` tables for
 * domain-scoped numeric variable isolation.
 *
 * Schema phase adds `content_hash` to nodes (with SHA-256 backfill),
 * creates the `integrity_log` append-only audit table, and fixes the FK
 * cascade policy on integrity_log if needed.
 *
 * @module db/migrations/provenance
 */

import type Database from 'better-sqlite3';

/**
 * Run provenance init migrations (number_registry + node_number_refs tables).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runProvenanceInitMigrations(db: Database.Database): void {
    // =========================================================================
    // NUMBER VARIABLES — domain-scoped numeric reference registry
    // =========================================================================

    try {
        db.prepare('SELECT var_id FROM number_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS number_registry (
                var_id          TEXT PRIMARY KEY,
                value           TEXT NOT NULL,
                scope_text      TEXT NOT NULL,
                source_node_id  TEXT NOT NULL,
                domain          TEXT NOT NULL,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS node_number_refs (
                node_id    TEXT NOT NULL,
                var_id     TEXT NOT NULL,
                PRIMARY KEY (node_id, var_id)
            );
            CREATE INDEX IF NOT EXISTS idx_number_registry_source ON number_registry (source_node_id);
            CREATE INDEX IF NOT EXISTS idx_number_registry_domain ON number_registry (domain);
            CREATE INDEX IF NOT EXISTS idx_node_number_refs_node ON node_number_refs (node_id);
            CREATE INDEX IF NOT EXISTS idx_node_number_refs_var ON node_number_refs (var_id);
        `);
        console.error('[sqlite] Added number_registry + node_number_refs tables');
    }
}

/**
 * Run provenance schema migrations (nodes.content_hash with SHA-256 backfill,
 * integrity_log table creation, FK cascade fix).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runProvenanceSchemaMigrations(db: Database.Database): void {
    // =========================================================================
    // INTEGRITY — Merkle DAG cryptographic provenance
    // =========================================================================

    // Migrate: add content_hash column to nodes
    try {
        db.prepare('SELECT content_hash FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN content_hash TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_content_hash ON nodes (content_hash) WHERE content_hash IS NOT NULL`);
        console.error('[sqlite] Added content_hash column to nodes');

        // Backfill: compute parentless content hashes for all existing nodes
        try {
            const { createHash } = require('crypto');
            const allNodes = db.prepare(
                `SELECT id, content, node_type, contributor, created_at FROM nodes WHERE archived = 0`
            ).all() as any[];

            if (allNodes.length > 0) {
                const update = db.prepare('UPDATE nodes SET content_hash = ? WHERE id = ?');
                const tx = db.transaction(() => {
                    for (const node of allNodes) {
                        const parts = [
                            node.content || '',
                            node.node_type || '',
                            node.contributor || '',
                            node.created_at || '',
                            '', // no parent hashes for backfill
                        ];
                        const hash = createHash('sha256').update(parts.join('\0'), 'utf-8').digest('hex');
                        update.run(hash, node.id);
                    }
                });
                tx();
                console.error(`[sqlite] Backfilled content_hash for ${allNodes.length} nodes`);
            }
        } catch (e: any) {
            console.error(`[sqlite] content_hash backfill failed (non-fatal): ${e.message}`);
        }
    }

    // Migrate: add integrity_log table
    try {
        db.prepare('SELECT id FROM integrity_log LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS integrity_log (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id             TEXT NOT NULL,
                operation           TEXT NOT NULL,
                content_hash_before TEXT,
                content_hash_after  TEXT NOT NULL,
                parent_hashes       TEXT,
                contributor         TEXT,
                details             TEXT,
                prev_log_hash       TEXT,
                log_hash            TEXT NOT NULL,
                partition_id        TEXT,
                timestamp           TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_integrity_log_node ON integrity_log (node_id);
            CREATE INDEX IF NOT EXISTS idx_integrity_log_partition ON integrity_log (partition_id);
            CREATE INDEX IF NOT EXISTS idx_integrity_log_chain ON integrity_log (prev_log_hash);
        `);
        console.error('[sqlite] Added integrity_log table');
    }

    // Fix: integrity_log FK was ON DELETE NO ACTION — recreate with CASCADE
    try {
        const fk = db.prepare(
            `SELECT "on_delete" FROM pragma_foreign_key_list('integrity_log') WHERE "table" = 'nodes'`
        ).get() as any;
        if (fk && fk.on_delete !== 'CASCADE') {
            db.exec(`
                CREATE TABLE integrity_log_new (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    node_id             TEXT NOT NULL,
                    operation           TEXT NOT NULL,
                    content_hash_before TEXT,
                    content_hash_after  TEXT NOT NULL,
                    parent_hashes       TEXT,
                    contributor         TEXT,
                    details             TEXT,
                    prev_log_hash       TEXT,
                    log_hash            TEXT NOT NULL,
                    partition_id        TEXT,
                    timestamp           TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
                );
                INSERT INTO integrity_log_new SELECT * FROM integrity_log;
                DROP TABLE integrity_log;
                ALTER TABLE integrity_log_new RENAME TO integrity_log;
                CREATE INDEX IF NOT EXISTS idx_integrity_log_node ON integrity_log (node_id);
                CREATE INDEX IF NOT EXISTS idx_integrity_log_partition ON integrity_log (partition_id);
                CREATE INDEX IF NOT EXISTS idx_integrity_log_chain ON integrity_log (prev_log_hash);
            `);
            console.error('[sqlite] Fixed integrity_log FK to ON DELETE CASCADE');
        }
    } catch { /* table may not exist yet */ }
}
