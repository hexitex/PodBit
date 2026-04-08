/**
 * Knowledge Base folder ingestion migrations.
 *
 * Creates `kb_folders`, `kb_files`, and `kb_chunks` tables. Also handles
 * the `raw_mode` column addition and the UNIQUE constraint migration from
 * `UNIQUE(folder_path)` to `UNIQUE(folder_path, domain, raw_mode)` (requires
 * table rebuild since SQLite cannot alter constraints in-place).
 *
 * @module db/migrations/kb
 */

import type Database from 'better-sqlite3';

/**
 * Run Knowledge Base migrations (folders, files, chunks tables and constraints).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runKbMigrations(db: Database.Database): void {
    // Migrate: add knowledge base tables if missing
    try {
        db.prepare('SELECT id FROM kb_folders LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS kb_folders (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                folder_path     TEXT NOT NULL,
                domain          TEXT NOT NULL,
                recursive       INTEGER DEFAULT 1,
                watch_enabled   INTEGER DEFAULT 1,
                include_patterns TEXT,
                exclude_patterns TEXT,
                auto_domain_subfolders INTEGER DEFAULT 0,
                raw_mode        INTEGER DEFAULT 0,
                last_scanned    TEXT,
                status          TEXT DEFAULT 'idle',
                error_message   TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(folder_path, domain, raw_mode)
            );
            CREATE INDEX IF NOT EXISTS idx_kb_folders_domain ON kb_folders (domain);
        `);
        console.error('[sqlite] Added kb_folders table');
    }

    try {
        db.prepare('SELECT id FROM kb_files LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS kb_files (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                folder_id       TEXT NOT NULL REFERENCES kb_folders(id) ON DELETE CASCADE,
                file_path       TEXT NOT NULL,
                file_name       TEXT NOT NULL,
                extension       TEXT NOT NULL,
                file_size       INTEGER NOT NULL,
                modified_at     TEXT NOT NULL,
                content_hash    TEXT NOT NULL,
                reader_plugin   TEXT NOT NULL,
                status          TEXT DEFAULT 'pending',
                error_message   TEXT,
                chunk_count     INTEGER DEFAULT 0,
                node_id         TEXT,
                domain          TEXT NOT NULL,
                processed_at    TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(folder_id, file_path)
            );
            CREATE INDEX IF NOT EXISTS idx_kb_files_folder ON kb_files (folder_id);
            CREATE INDEX IF NOT EXISTS idx_kb_files_hash ON kb_files (content_hash);
            CREATE INDEX IF NOT EXISTS idx_kb_files_status ON kb_files (status);
            CREATE INDEX IF NOT EXISTS idx_kb_files_domain ON kb_files (domain);
        `);
        console.error('[sqlite] Added kb_files table');
    }

    try {
        db.prepare('SELECT id FROM kb_chunks LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS kb_chunks (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                file_id         TEXT NOT NULL REFERENCES kb_files(id) ON DELETE CASCADE,
                chunk_index     INTEGER NOT NULL,
                chunk_type      TEXT NOT NULL,
                chunk_label     TEXT,
                content         TEXT NOT NULL,
                content_length  INTEGER NOT NULL,
                node_id         TEXT,
                metadata        TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(file_id, chunk_index)
            );
            CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks (file_id);
            CREATE INDEX IF NOT EXISTS idx_kb_chunks_node ON kb_chunks (node_id);
        `);
        console.error('[sqlite] Added kb_chunks table');
    }

    // Migrate: add raw_mode column to kb_folders if missing
    try {
        db.prepare('SELECT raw_mode FROM kb_folders LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE kb_folders ADD COLUMN raw_mode INTEGER DEFAULT 0`);
        console.error('[sqlite] Added raw_mode column to kb_folders');
    }

    // Migrate: change kb_folders UNIQUE(folder_path) → UNIQUE(folder_path, domain, raw_mode)
    // SQLite can't alter constraints — must rebuild the table.
    // Detect old constraint by checking for the autoindex on folder_path alone.
    try {
        const autoIdx = db.prepare(
            `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='kb_folders' AND name LIKE 'sqlite_autoindex_kb_folders%'`
        ).all() as any[];
        if (autoIdx.length > 0) {
            // Old single-column UNIQUE exists — rebuild table with composite UNIQUE
            db.pragma('foreign_keys = OFF');
            db.exec(`
                CREATE TABLE kb_folders_new (
                    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                    folder_path     TEXT NOT NULL,
                    domain          TEXT NOT NULL,
                    recursive       INTEGER DEFAULT 1,
                    watch_enabled   INTEGER DEFAULT 1,
                    include_patterns TEXT,
                    exclude_patterns TEXT,
                    auto_domain_subfolders INTEGER DEFAULT 0,
                    raw_mode        INTEGER DEFAULT 0,
                    last_scanned    TEXT,
                    status          TEXT DEFAULT 'idle',
                    error_message   TEXT,
                    created_at      TEXT DEFAULT (datetime('now')),
                    updated_at      TEXT DEFAULT (datetime('now')),
                    UNIQUE(folder_path, domain, raw_mode)
                );
                INSERT INTO kb_folders_new (id, folder_path, domain, recursive, watch_enabled, include_patterns, exclude_patterns, auto_domain_subfolders, raw_mode, last_scanned, status, error_message, created_at, updated_at)
                SELECT id, folder_path, domain, recursive, watch_enabled, include_patterns, exclude_patterns, auto_domain_subfolders, raw_mode, last_scanned, status, error_message, created_at, updated_at FROM kb_folders;
                DROP TABLE kb_folders;
                ALTER TABLE kb_folders_new RENAME TO kb_folders;
                CREATE INDEX IF NOT EXISTS idx_kb_folders_domain ON kb_folders (domain);
            `);
            db.pragma('foreign_keys = ON');
            console.error('[sqlite] Rebuilt kb_folders: UNIQUE(folder_path, domain, raw_mode)');
        }
    } catch (err: any) {
        // Non-fatal — old constraint just means you can't add same path twice
        console.error(`[sqlite] kb_folders constraint migration skipped: ${err.message}`);
        try { db.pragma('foreign_keys = ON'); } catch {}
    }
}
