/**
 * Governance migrations — domain partitions, bridges, synonyms, transient
 * partition support, partition visits, and node stubs.
 *
 * Init phase adds columns and tables required for partition governance
 * (system flag, transient partitions, visit tracking, node stubs, allowed_cycles).
 *
 * Schema phase creates the base governance tables (domain_partitions,
 * partition_domains, partition_bridges, decisions) if they don't exist.
 *
 * @module db/migrations/governance
 */

import type Database from 'better-sqlite3';

/**
 * Run governance init migrations (domain_synonyms.source, domain_partitions.system,
 * transient partition columns, partition_visits, allowed_cycles, node_stubs).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runGovernanceInitMigrations(db: Database.Database): void {
    // Migrate: add source column to domain_synonyms if missing
    try {
        db.prepare('SELECT source FROM domain_synonyms LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE domain_synonyms ADD COLUMN source TEXT DEFAULT 'rule'`);
        console.error('[sqlite] Added source column to domain_synonyms');
    }

    // Migrate: add system column to domain_partitions if missing
    try {
        db.prepare('SELECT system FROM domain_partitions LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN system INTEGER DEFAULT 0`);
        console.error('[sqlite] Added system column to domain_partitions');
    }

    // Backfill: mark know-thyself as system partition
    try {
        db.prepare(`UPDATE domain_partitions SET system = 1 WHERE id = 'know-thyself'`).run();
    } catch { /* know-thyself may not exist yet */ }

    // Migrate: remove stale bridges from system partitions (know-thyself must never bridge)
    try {
        const removed = db.prepare(
            `DELETE FROM partition_bridges WHERE partition_a IN (SELECT id FROM domain_partitions WHERE system = 1) OR partition_b IN (SELECT id FROM domain_partitions WHERE system = 1)`
        ).run();
        if (removed.changes > 0) {
            console.error(`[sqlite] Removed ${removed.changes} bridge(s) from system partition(s)`);
        }
    } catch { /* partition_bridges may not exist yet */ }

    // =========================================================================
    // TRANSIENT PARTITIONS — Phase 1
    // =========================================================================

    // Migrate: add transient partition columns to domain_partitions
    try {
        db.prepare('SELECT transient FROM domain_partitions LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN transient INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN source_project TEXT`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN source_owner TEXT`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN imported_at TEXT`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN state TEXT DEFAULT 'active'`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN visit_config TEXT`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN cycles_completed INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN barren_cycles INTEGER DEFAULT 0`);
        console.error('[sqlite] Added transient partition columns to domain_partitions');
    }

    // Migrate: add partition_visits table
    try {
        db.prepare('SELECT id FROM partition_visits LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS partition_visits (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                partition_id            TEXT NOT NULL,
                project_name            TEXT NOT NULL,
                arrived_at              TEXT NOT NULL,
                departed_at             TEXT,
                cycles_run              INTEGER DEFAULT 0,
                children_created        INTEGER DEFAULT 0,
                children_avg_weight     REAL DEFAULT 0,
                children_breakthroughs  INTEGER DEFAULT 0,
                departure_reason        TEXT,
                FOREIGN KEY (partition_id) REFERENCES domain_partitions(id)
            );
            CREATE INDEX IF NOT EXISTS idx_partition_visits_partition ON partition_visits (partition_id);
        `);
        console.error('[sqlite] Added partition_visits table');
    }

    // Migrate: add allowed_cycles column to domain_partitions
    // JSON array of cycle names this partition participates in.
    // NULL = all cycles (default). E.g. '["synthesis","voicing"]' = only those two.
    try {
        db.prepare('SELECT allowed_cycles FROM domain_partitions LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE domain_partitions ADD COLUMN allowed_cycles TEXT DEFAULT NULL`);
        console.error('[sqlite] Added allowed_cycles column to domain_partitions');
    }

    // Migrate: add unified node_stubs table (serves both composting and transient departure)
    try {
        db.prepare('SELECT node_id FROM node_stubs LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS node_stubs (
                node_id             TEXT PRIMARY KEY,
                domain              TEXT NOT NULL,
                partition_id        TEXT NOT NULL,
                content_hash        TEXT NOT NULL,
                summary             TEXT,
                weight_at_stub      REAL,
                generation          INTEGER DEFAULT 0,
                born_at             TEXT,
                stubbed_at          TEXT NOT NULL,
                total_children      INTEGER DEFAULT 0,
                surviving_children  TEXT,
                parent_ids          TEXT,
                cause               TEXT NOT NULL,
                source_project      TEXT,
                visit_id            INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_node_stubs_partition ON node_stubs (partition_id);
            CREATE INDEX IF NOT EXISTS idx_node_stubs_hash ON node_stubs (content_hash);
            CREATE INDEX IF NOT EXISTS idx_node_stubs_cause ON node_stubs (cause);
        `);
        console.error('[sqlite] Added node_stubs table');
    }
}

/**
 * Run governance schema migrations (domain_partitions, partition_domains,
 * partition_bridges, decisions tables, domain_synonyms.source column).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runGovernanceSchemaMigrations(db: Database.Database): void {
    // Add partition tables if they don't exist
    const partitionExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='domain_partitions'"
    ).get();

    if (!partitionExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS domain_partitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                system INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS partition_domains (
                partition_id TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
                domain TEXT NOT NULL,
                added_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (partition_id, domain)
            );

            CREATE INDEX IF NOT EXISTS idx_partition_domains_domain ON partition_domains (domain);
        `);
        console.error('[sqlite] Added partition tables');
    }

    // Add partition bridges table if it doesn't exist
    const bridgesExist = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='partition_bridges'"
    ).get();

    if (!bridgesExist) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS partition_bridges (
                partition_a TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
                partition_b TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
                created_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (partition_a, partition_b)
            );
        `);
        console.error('[sqlite] Added partition bridges table');
    }

    // Add decisions table if it doesn't exist
    const decisionsExist = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='decisions'"
    ).get();

    if (!decisionsExist) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS decisions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type     TEXT NOT NULL,
                entity_id       TEXT NOT NULL,
                field           TEXT NOT NULL,
                old_value       TEXT,
                new_value       TEXT NOT NULL,
                decided_by_tier TEXT NOT NULL,
                contributor     TEXT,
                reason          TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions (entity_type, entity_id, field);
            CREATE INDEX IF NOT EXISTS idx_decisions_tier ON decisions (decided_by_tier);
        `);
        console.error('[sqlite] Added decisions table');
    }

    // Migrate: add source column to domain_synonyms if missing
    try {
        db.prepare('SELECT source FROM domain_synonyms LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE domain_synonyms ADD COLUMN source TEXT DEFAULT 'rule'`);
        console.error('[sqlite] Added source column to domain_synonyms');
    }
}
