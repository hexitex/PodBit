/**
 * Context engine and chat migrations.
 *
 * Init phase creates tables for the context engine's cross-session learning
 * (session_insights, session_node_usage) and the GUI chat system
 * (chat_conversations).
 *
 * Schema phase creates the project-level `settings` key-value table.
 *
 * @module db/migrations/context
 */

import type Database from 'better-sqlite3';

/**
 * Run context init migrations (session_insights, session_node_usage,
 * chat_conversations tables).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runContextInitMigrations(db: Database.Database): void {
    // Migrate: add session_insights table if missing
    try {
        db.prepare('SELECT id FROM session_insights LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS session_insights (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                session_id      TEXT NOT NULL,
                topic           TEXT NOT NULL,
                weight          REAL DEFAULT 1.0,
                domain          TEXT,
                usage_count     INTEGER DEFAULT 1,
                last_seen       TEXT NOT NULL,
                first_seen      TEXT NOT NULL,
                cluster_terms   TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_session_insights_topic ON session_insights (topic);
            CREATE INDEX IF NOT EXISTS idx_session_insights_domain ON session_insights (domain);
        `);
        console.error('[sqlite] Added session_insights table');
    }

    // Migrate: add session_node_usage table if missing
    try {
        db.prepare('SELECT id FROM session_node_usage LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS session_node_usage (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                session_id      TEXT NOT NULL,
                node_id         TEXT NOT NULL,
                times_delivered INTEGER DEFAULT 0,
                times_used      INTEGER DEFAULT 0,
                avg_similarity  REAL DEFAULT 0,
                last_used       TEXT NOT NULL,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_session_node_usage_node ON session_node_usage (node_id);
        `);
        console.error('[sqlite] Added session_node_usage table');
    }

    // Migrate: add chat_conversations table if missing
    try {
        db.prepare('SELECT id FROM chat_conversations LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL DEFAULT 'New Chat',
                session_id      TEXT,
                messages        TEXT NOT NULL DEFAULT '[]',
                scope_partition TEXT,
                scope_domains   TEXT,
                action_mode     TEXT DEFAULT 'research',
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                archived        INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
                ON chat_conversations (updated_at DESC) WHERE archived = 0;
        `);
        console.error('[sqlite] Added chat_conversations table');
    }
}

/**
 * Run context schema migrations (project-level settings key-value table).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runContextSchemaMigrations(db: Database.Database): void {
    // Add settings table if it doesn't exist
    const settingsExist = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
    ).get();

    if (!settingsExist) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key     TEXT PRIMARY KEY,
                value   TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[sqlite] Added settings table');
    }
}
