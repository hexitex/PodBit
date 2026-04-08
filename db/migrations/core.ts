/**
 * Core node schema migrations.
 *
 * Adds or renames columns on the `nodes`, `dream_cycles`, and `knowledge_cache`
 * tables, renames legacy subsystem/origin/contributor values, and creates
 * composite indexes on `edges` for lineage lookups.
 *
 * All migrations are idempotent (try SELECT → catch → ALTER TABLE).
 *
 * @module db/migrations/core
 */

import type Database from 'better-sqlite3';

/**
 * Run core node/schema migrations.
 *
 * Handles: voice_mode, salience (renamed from temperature), junk column,
 * knowledge_cache table + staleness columns, dream_cycles extras,
 * subsystem/origin/contributor renames (dream → synthesis), excluded,
 * metadata, and edge composite indexes.
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runCoreMigrations(db: Database.Database): void {
    // Migrate: add voice_mode column to nodes
    try {
        db.prepare('SELECT voice_mode FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN voice_mode TEXT`);
        console.error('[sqlite] Added voice_mode column to nodes');
    }

    // Migrate: rename temperature column to salience
    try {
        db.prepare('SELECT salience FROM nodes LIMIT 1').get();
    } catch {
        try {
            db.exec(`ALTER TABLE nodes RENAME COLUMN temperature TO salience`);
            console.error('[sqlite] Renamed temperature column to salience in nodes');
        } catch (e: any) {
            // Column might not exist yet (fresh DB) — will be created as salience in schema
            console.error('[sqlite] temperature→salience rename skipped:', e.message);
        }
    }

    // Migrate: add junk column if missing
    try {
        db.prepare('SELECT junk FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN junk INTEGER DEFAULT 0`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_junk ON nodes (junk) WHERE junk = 1`);
        console.error('[sqlite] Added junk column to nodes');
    }

    // Migrate: add knowledge_cache table if missing
    try {
        db.prepare('SELECT cache_type FROM knowledge_cache LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS knowledge_cache (
                cache_type TEXT NOT NULL,
                topic TEXT NOT NULL,
                domains TEXT NOT NULL,
                node_count INTEGER NOT NULL,
                result TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (cache_type, topic)
            )
        `);
        console.error('[sqlite] Added knowledge_cache table');
    }

    // Migrate: add stale + changes_since_cached columns to knowledge_cache
    try {
        db.prepare('SELECT stale FROM knowledge_cache LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE knowledge_cache ADD COLUMN stale INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE knowledge_cache ADD COLUMN changes_since_cached INTEGER DEFAULT 0`);
        console.error('[sqlite] Added stale/changes_since_cached columns to knowledge_cache');
    }

    // Migrate: add rejection_reason column to dream_cycles
    try {
        db.prepare('SELECT rejection_reason FROM dream_cycles LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE dream_cycles ADD COLUMN rejection_reason TEXT`);
        console.error('[sqlite] Added rejection_reason column to dream_cycles');
    }

    // Migrate: add domain and parent_ids columns to dream_cycles (GA improvements)
    try {
        db.prepare('SELECT domain FROM dream_cycles LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE dream_cycles ADD COLUMN domain TEXT`);
        console.error('[sqlite] Added domain column to dream_cycles');
    }
    try {
        db.prepare('SELECT parent_ids FROM dream_cycles LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE dream_cycles ADD COLUMN parent_ids TEXT`);
        console.error('[sqlite] Added parent_ids column to dream_cycles');
    }

    // Migrate: rename 'dream' subsystem to 'synthesis'
    try {
        const dreamAssignment = db.prepare("SELECT subsystem FROM subsystem_assignments WHERE subsystem = 'dream'").get();
        if (dreamAssignment) {
            db.exec(`UPDATE subsystem_assignments SET subsystem = 'synthesis' WHERE subsystem = 'dream'`);
            console.error('[sqlite] Renamed dream subsystem to synthesis in subsystem_assignments');
        }
    } catch { /* table may not exist yet */ }

    // Migrate: rename origin='dream' to 'synthesis' in nodes
    try {
        const count = db.prepare("SELECT COUNT(*) as c FROM nodes WHERE origin = 'dream'").get() as any;
        if (count?.c > 0) {
            db.exec(`UPDATE nodes SET origin = 'synthesis' WHERE origin = 'dream'`);
            console.error(`[sqlite] Renamed origin 'dream' to 'synthesis' in ${count.c} nodes`);
        }
    } catch { /* origin column may not exist */ }

    // Migrate: rename contributor='dream-engine' to 'synthesis-engine' in nodes
    try {
        const count = db.prepare("SELECT COUNT(*) as c FROM nodes WHERE contributor = 'dream-engine'").get() as any;
        if (count?.c > 0) {
            db.exec(`UPDATE nodes SET contributor = 'synthesis-engine' WHERE contributor = 'dream-engine'`);
            console.error(`[sqlite] Renamed contributor 'dream-engine' to 'synthesis-engine' in ${count.c} nodes`);
        }
    } catch { /* contributor column may not exist */ }

    // Migrate: add excluded column to nodes (for brief exclusion toggle)
    try {
        db.prepare('SELECT excluded FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN excluded INTEGER DEFAULT 0`);
        console.error('[sqlite] Added excluded column to nodes');
    }

    // Migrate: add metadata column to nodes (JSON for source provenance, etc.)
    try {
        db.prepare('SELECT metadata FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN metadata TEXT`);
        console.error('[sqlite] Added metadata column to nodes');
    }

    // Composite indexes on edges for faster lineage lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_edges_target_type ON edges (target_id, edge_type);
        CREATE INDEX IF NOT EXISTS idx_edges_source_type ON edges (source_id, edge_type);
    `);
}
