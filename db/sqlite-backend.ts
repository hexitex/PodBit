/**
 * PODBIT v0.5 - SQLITE BACKEND
 *
 * SQLite database backend using better-sqlite3.
 * Exports: query, queryOne, transaction, healthCheck, close, etc.
 * Auto-translates $1/$2/$3 parameter placeholders to SQLite ? placeholders.
 */

import Database from 'better-sqlite3';
import { translate } from './sql.js';
import { runInitMigrations, runSchemaMigrations } from './migrations.js';
import { runSystemMigrations } from './migrations/system.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    handleReturning,
} from './sqlite-backend-returning.js';
import { RC } from '../config/constants.js';
import {
    type SlowQueryEntry,
    type DbDiagnostics,
    isReadQuery,
    beginOp,
    endOp,
    checkContention,
    recordBusyRetry,
    getDbDiagnostics as _getDbDiagnostics,
    resetDbDiagnostics,
} from './sqlite-backend-diag.js';

export type { SlowQueryEntry, DbDiagnostics };
export { resetDbDiagnostics };

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
// Project root (db/ is one level below) — use this so path is correct when MCP runs with different cwd
const projectRoot: string = path.join(__dirname, '..');
// Data directory — configurable via PODBIT_DATA_DIR env var, defaults to <projectRoot>/data
export const dataDir: string = process.env.PODBIT_DATA_DIR
    ? path.resolve(process.env.PODBIT_DATA_DIR)
    : path.join(projectRoot, 'data');

let db: Database.Database | null = null;
let readDb: Database.Database | null = null;  // WAL read connection for GUI reads (non-readonly for WAL visibility)
let switching = false;
let dbPathOverride: string | null = null;  // Set by switchProject to open a different DB path

// System database — permanent, survives project switches
let systemDb: Database.Database | null = null;
let systemReadDb: Database.Database | null = null;
const SYSTEM_DB_PATH = path.join(dataDir, 'system.db');

// Database encryption key — set via PODBIT_DB_KEY env var.
// Requires `better-sqlite3-multiple-ciphers` to be installed (optional dependency).
const DB_ENCRYPTION_KEY = process.env.PODBIT_DB_KEY || '';

/**
 * Apply encryption key to a database connection if PODBIT_DB_KEY is set.
 * Uses SQLCipher-compatible PRAGMA key. Requires better-sqlite3-multiple-ciphers.
 * With regular better-sqlite3, this is a no-op (pragma silently ignored).
 * Exported so pool-db.ts and other modules can reuse it.
 */
export function applyEncryptionKey(database: Database.Database): void {
    if (!DB_ENCRYPTION_KEY) return;
    database.pragma(`key='${DB_ENCRYPTION_KEY.replace(/'/g, "''")}'`);
}

/**
 * On startup, check projects.json for a current project and return its DB path.
 * Returns null if no project is active or the DB file doesn't exist.
 */
function resolveProjectDbPath(): string | null {
    try {
        const metaPath = path.join(dataDir, 'projects.json');
        if (!fs.existsSync(metaPath)) return null;
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (!meta.currentProject) return null;
        const projectDir = path.join(dataDir, 'projects');
        const dbFile = path.join(projectDir, `${meta.currentProject}.db`);
        if (!fs.existsSync(dbFile)) return null;
        console.error(`[sqlite] Resolved startup DB from projects.json: ${meta.currentProject}`);
        return dbFile;
    } catch {
        return null;
    }
}

// =============================================================================
// SYSTEM SETTINGS ROUTING
// =============================================================================

/** Prefixes that route to system.db settings table (not project DB) */
const SYSTEM_SETTINGS_PREFIXES = [
    'config_overrides',
    'proxy.',
    'reader_image.',
    'budget.',
    'llm.',
    'knowThyself.',
    'knowthyself.',
    'kb.extensionMappings',
    'apiKey.',
    'api.keys',
    '_migration_system_',
] as const;

/** True if the key should be read/written from system.db (config, models, prompts, etc.). */
export function isSystemSetting(key: string): boolean {
    return SYSTEM_SETTINGS_PREFIXES.some(prefix => key.startsWith(prefix));
}

// =============================================================================
// SYSTEM DATABASE
// =============================================================================

/** Tables that live in system.db — used by first-startup migration */
const SYSTEM_TABLES = [
    'model_registry',
    'subsystem_assignments',
    'prompts',
    'config_history',
    'config_snapshots',
    'breakthrough_registry',
    'prompt_gold_standards',
    'tuning_registry',
    'api_registry',
    'api_prompt_history',
    'llm_usage_log',
] as const;

/**
 * Open (or return existing) the system database.
 * This database holds models, assignments, prompts, config — all system-wide data.
 * It opens once and stays open permanently across project switches.
 */
export function getSystemDb(): Database.Database {
    if (!systemDb) {
        const dir = path.dirname(SYSTEM_DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        systemDb = new Database(SYSTEM_DB_PATH);
        applyEncryptionKey(systemDb);

        // Same pragmas as project DB
        systemDb.pragma('journal_mode = WAL');
        systemDb.pragma('foreign_keys = ON');
        systemDb.pragma(`busy_timeout = ${RC.database.systemDb.busyTimeoutMs}`);
        systemDb.pragma('synchronous = NORMAL');
        systemDb.pragma(`cache_size = -${RC.database.systemDb.cacheSizeKb}`);     // 16 MB (smaller than project DB)
        systemDb.pragma('temp_store = 2');
        systemDb.pragma(`mmap_size = ${RC.database.systemDb.mmapSizeBytes}`);    // 64 MB

        registerFunctions(systemDb);
        runSystemMigrations(systemDb);

        // First-startup migration: copy shared data from existing project DBs
        migrateSharedDataToSystemDb(systemDb);

        systemDb.exec('ANALYZE');
        console.error(`[system-db] Opened: ${SYSTEM_DB_PATH}`);
    }
    return systemDb;
}

/** Read-only connection to system.db for concurrent GUI reads; shares WAL with writer for latest data. */
function _getSystemReadDb(): Database.Database {
    if (!systemReadDb) {
        const writer = getSystemDb();
        systemReadDb = new Database(writer.name, { fileMustExist: true });
        applyEncryptionKey(systemReadDb);
        systemReadDb.pragma('journal_mode = WAL');
        systemReadDb.pragma('cache_size = -8000');
        systemReadDb.pragma('mmap_size = 67108864');
        systemReadDb.pragma('busy_timeout = 5000');
        registerFunctions(systemReadDb);
        console.error('[system-db] Read connection opened (WAL-aware)');
    }
    return systemReadDb;
}

/**
 * First-startup migration: when system.db is new, copy shared data from
 * an existing project DB.
 *
 * Prefers `neuralnetworks.db` as source (most complete), falls back to
 * `resonance.db`. Copies all rows from {@link SYSTEM_TABLES} and system
 * settings keys. Marks completion with `_system_db_initialized` setting.
 * After migration, calls {@link cleanAllProjectDbs} to drop system tables
 * from all project DBs so bugs surface immediately.
 *
 * @param sysDb - The open system database connection.
 */
function migrateSharedDataToSystemDb(sysDb: Database.Database): void {
    // Check if already done
    try {
        const done = sysDb.prepare("SELECT value FROM settings WHERE key = '_system_db_initialized'").get();
        if (done) return;
    } catch {
        // settings table may not exist yet (shouldn't happen since runSystemMigrations creates it)
    }

    // One-off migration: use neuralnetworks.db as source (most complete project with all model assignments)
    let sourceDbPath: string | null = null;
    const preferredPath = path.join(projectRoot, 'data', 'projects', 'neuralnetworks.db');
    if (fs.existsSync(preferredPath)) {
        sourceDbPath = preferredPath;
        console.error('[system-db] First-startup migration: using neuralnetworks as source');
    }

    // Fallback: try legacy resonance.db
    if (!sourceDbPath) {
        const legacyPath = path.join(dataDir, 'resonance.db');
        if (fs.existsSync(legacyPath)) {
            sourceDbPath = legacyPath;
            console.error('[system-db] First-startup migration: using legacy resonance.db as source');
        }
    }

    if (!sourceDbPath) {
        sysDb.prepare("INSERT INTO settings (key, value) VALUES ('_system_db_initialized', 'done')").run();
        console.error('[system-db] First-startup migration: no existing project DBs found, starting fresh');
        return;
    }

    // Open source DB read-only and copy shared tables
    let sourceDb: Database.Database | null = null;
    try {
        sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
        applyEncryptionKey(sourceDb);

        for (const table of SYSTEM_TABLES) {
            try {
                const rows = sourceDb.prepare(`SELECT * FROM ${table}`).all();
                if (rows.length === 0) continue;

                const columns = Object.keys(rows[0] as any);
                const _placeholders = columns.map(() => '?').join(', ');

                // Verify all columns exist in system DB (skip those that don't)
                const validCols: string[] = [];
                for (const col of columns) {
                    try {
                        sysDb.prepare(`SELECT ${col} FROM ${table} LIMIT 0`).get();
                        validCols.push(col);
                    } catch {
                        // Column doesn't exist in target — skip it
                    }
                }

                if (validCols.length === 0) continue;

                const validPlaceholders = validCols.map(() => '?').join(', ');
                const stmt = sysDb.prepare(
                    `INSERT OR IGNORE INTO ${table} (${validCols.join(', ')}) VALUES (${validPlaceholders})`
                );
                const txn = sysDb.transaction(() => {
                    for (const row of rows) {
                        stmt.run(...validCols.map(c => (row as any)[c]));
                    }
                });
                txn();
                console.error(`[system-db] Migrated ${rows.length} rows from ${table}`);
            } catch (err: any) {
                console.error(`[system-db] Skipped ${table}: ${err.message}`);
            }
        }

        // Copy system settings keys
        try {
            const allSettings = sourceDb.prepare('SELECT * FROM settings').all() as any[];
            const settingsStmt = sysDb.prepare(
                'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
            );
            let settingsCount = 0;
            const txn = sysDb.transaction(() => {
                for (const row of allSettings) {
                    if (isSystemSetting(row.key)) {
                        settingsStmt.run(row.key, row.value, row.updated_at || null);
                        settingsCount++;
                    }
                }
            });
            txn();
            if (settingsCount > 0) {
                console.error(`[system-db] Migrated ${settingsCount} system settings keys`);
            }
        } catch (err: any) {
            console.error(`[system-db] Settings migration skipped: ${err.message}`);
        }
    } catch (err: any) {
        console.error(`[system-db] First-startup migration failed: ${err.message}`);
    } finally {
        if (sourceDb) {
            try { sourceDb.close(); } catch { /* ignore */ }
        }
    }

    sysDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('_system_db_initialized', 'done')").run();
    console.error('[system-db] First-startup migration complete');

    // Clean system tables from ALL project DBs so any missed call sites fail immediately
    cleanAllProjectDbs();
}

/**
 * Drop system tables from every project DB on disk.
 * Called once during first-startup migration so bugs surface immediately.
 */
function cleanAllProjectDbs(): void {
    const tablesToDrop = [
        'api_prompt_history',
        'subsystem_assignments',
        'llm_usage_log',
        'model_registry',
        'prompts',
        'config_history',
        'config_snapshots',
        'breakthrough_registry',
        'prompt_gold_standards',
        'tuning_registry',
        'api_registry',
    ];

    // Collect all project DB paths
    const projectPaths: { name: string; path: string }[] = [];
    try {
        const metaPath = path.join(dataDir, 'projects.json');
        if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            for (const [name] of Object.entries(meta.projects || {})) {
                const dbPath = path.join(projectRoot, 'data', 'projects', `${name}.db`);
                if (fs.existsSync(dbPath)) {
                    projectPaths.push({ name, path: dbPath });
                }
            }
        }
    } catch { /* projects.json may not exist */ }

    // Also check legacy resonance.db
    const legacyPath = path.join(dataDir, 'resonance.db');
    if (fs.existsSync(legacyPath)) {
        projectPaths.push({ name: 'resonance (legacy)', path: legacyPath });
    }

    for (const project of projectPaths) {
        let pDb: Database.Database | null = null;
        try {
            pDb = new Database(project.path);
            applyEncryptionKey(pDb);
            pDb.pragma('foreign_keys = OFF');

            let dropped = 0;
            for (const table of tablesToDrop) {
                try {
                    const exists = pDb.prepare(
                        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
                    ).get();
                    if (exists) {
                        pDb.exec(`DROP TABLE IF EXISTS ${table}`);
                        dropped++;
                    }
                } catch { /* skip */ }
            }

            // Remove system settings keys
            let settingsCleaned = 0;
            try {
                const allSettings = pDb.prepare('SELECT key FROM settings').all() as any[];
                for (const row of allSettings) {
                    if (isSystemSetting(row.key)) {
                        pDb.prepare('DELETE FROM settings WHERE key = ?').run(row.key);
                        settingsCleaned++;
                    }
                }
            } catch { /* settings table may not exist */ }

            if (dropped > 0 || settingsCleaned > 0) {
                console.error(`[system-db] Cleaned ${project.name}: dropped ${dropped} tables, removed ${settingsCleaned} settings`);
            }
        } catch (err: any) {
            console.error(`[system-db] Failed to clean ${project.name}: ${err.message}`);
        } finally {
            if (pDb) try { pDb.close(); } catch {}
        }
    }
}

const SYSTEM_TABLES_TO_DROP = [
    'api_prompt_history', 'subsystem_assignments', 'llm_usage_log',
    'model_registry', 'prompts', 'config_history', 'config_snapshots',
    'breakthrough_registry', 'prompt_gold_standards', 'tuning_registry', 'api_registry',
];

/**
 * Drop system tables from a project DB after migrations.
 *
 * Migrations create these tables (model_registry, prompts, etc.) for backward
 * compatibility, but the authoritative copies live in system.db. Dropping them
 * from the project DB ensures call sites that accidentally use `query()` instead
 * of `systemQuery()` fail immediately.
 *
 * @param projectDb - The open project database connection.
 */
function dropSystemTablesFromProjectDb(projectDb: Database.Database): void {
    projectDb.pragma('foreign_keys = OFF');
    try {
        for (const table of SYSTEM_TABLES_TO_DROP) {
            try { projectDb.exec(`DROP TABLE IF EXISTS ${table}`); } catch {}
        }
    } finally {
        projectDb.pragma('foreign_keys = ON');
    }
}

/** Returns the project DB connection (opens from projects.json or env/default path, runs migrations). */
function getDb(): Database.Database {
    if (switching) {
        throw new Error('Database is switching projects. Please retry.');
    }
    if (!db) {
        // Ensure system DB is ready before opening project DB
        getSystemDb();

        // Use override path (set by switchProject), or resolve from projects.json, env, or default
        const defaultPath: string = path.join(dataDir, 'resonance.db');
        const dbPath: string = dbPathOverride
            ?? resolveProjectDbPath()
            ?? (process.env.SQLITE_PATH
                ? (path.isAbsolute(process.env.SQLITE_PATH)
                    ? process.env.SQLITE_PATH
                    : path.join(projectRoot, process.env.SQLITE_PATH))
                : defaultPath);

        // If SQLITE_PATH or default path is a directory (e.g. CANTOPEN_ISDIR), append filename
        let pathToOpen: string = fs.existsSync(dbPath) && fs.statSync(dbPath).isDirectory()
            ? path.join(dbPath, 'resonance.db')
            : dbPath;
        if (fs.existsSync(pathToOpen) && fs.statSync(pathToOpen).isDirectory()) {
            pathToOpen = path.join(pathToOpen, 'resonance.db');
        }

        // Ensure data directory exists
        const dir: string = path.dirname(pathToOpen);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        db = new Database(pathToOpen);
        applyEncryptionKey(db);

        // Performance pragmas
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma(`busy_timeout = ${RC.database.projectDb.busyTimeoutMs}`);
        db.pragma('synchronous = NORMAL');   // WAL makes FULL unnecessary; halves write latency
        db.pragma(`cache_size = -${RC.database.projectDb.cacheSizeKb}`);     // 64 MB page cache (default ~2 MB)
        db.pragma('temp_store = 2');         // 2 = MEMORY: ORDER BY / GROUP BY temp data in RAM
        db.pragma(`mmap_size = ${RC.database.projectDb.mmapSizeBytes}`);   // 256 MB memory-mapped I/O for reads

        // Verify pragmas took effect
        const pragmaCheck = {
            journal_mode: db.pragma('journal_mode', { simple: true }),
            synchronous: db.pragma('synchronous', { simple: true }),
            cache_size: db.pragma('cache_size', { simple: true }),
            temp_store: db.pragma('temp_store', { simple: true }),
            mmap_size: db.pragma('mmap_size', { simple: true }),
        };
        console.error(`[sqlite] Pragmas: journal=${pragmaCheck.journal_mode} sync=${pragmaCheck.synchronous} cache=${pragmaCheck.cache_size} temp_store=${pragmaCheck.temp_store} mmap=${pragmaCheck.mmap_size}`);

        // Register custom functions
        registerFunctions(db);
        // Initialize schema if needed
        initializeSchema(db);
        // Run all column/table migrations
        runInitMigrations(db);
        // Run schema migrations (partition/decision tables, integrity, elite pool)
        runSchemaMigrations(db);

        // Drop system tables from project DB — migrations recreate them but they belong in system.db
        dropSystemTablesFromProjectDb(db);

        // Update query planner statistics so indexes are used effectively
        db.exec('ANALYZE');

        console.error(`[sqlite] Database opened: ${pathToOpen}`);
    }
    return db;
}

/**
 * Get a read connection for SELECT queries.
 * WAL mode allows concurrent readers without blocking/being blocked by the writer.
 * GUI/API reads use this to avoid being starved by background write operations.
 *
 * NOT opened with readonly:true — in WAL mode, readonly connections use heap memory
 * for the WAL index instead of the shared-memory file, which means they can only see
 * checkpointed data (not recent WAL writes). A non-readonly reader sees all committed
 * writes immediately through the shared WAL index.
 */
function _getReadDb(): Database.Database {
    if (switching) {
        throw new Error('Database is switching projects. Please retry.');
    }
    if (!readDb) {
        // Ensure write connection is initialized first (creates file, runs migrations)
        const writer = getDb();
        readDb = new Database(writer.name, { fileMustExist: true });
        applyEncryptionKey(readDb);
        // Read-performance PRAGMAs
        readDb.pragma('journal_mode = WAL');      // Ensure WAL mode on reader too
        readDb.pragma(`cache_size = -${RC.database.readDb.cacheSizeKb}`);     // 32 MB page cache for reader
        readDb.pragma(`mmap_size = ${RC.database.readDb.mmapSizeBytes}`);   // 256 MB memory-mapped I/O
        readDb.pragma(`busy_timeout = ${RC.database.readDb.busyTimeoutMs}`);     // Wait on WAL checkpoint contention
        // Register same custom functions so SELECT queries can use them (e.g. LOG() in scoring)
        registerFunctions(readDb);
        console.error('[sqlite] Read connection opened for GUI reads (WAL-aware)');
    }
    return readDb;
}

/** Registers SQLite custom functions (gen_random_uuid, LOG) on the given database. */
function registerFunctions(database: Database.Database): void {
    // gen_random_uuid() - matches PostgreSQL function name
    database.function('gen_random_uuid', () => {
        const hex = (n: number): string => {
            const bytes = new Uint8Array(n);
            for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        };
        const a = hex(4);
        const b = hex(2);
        const c = '4' + hex(2).substring(1); // version 4
        const d = ((parseInt(hex(1), 16) & 0x3) | 0x8).toString(16) + hex(2).substring(1); // variant 10
        const e = hex(6);
        return `${a}-${b}-${c}-${d}-${e}`;
    });

    // LOG() - natural log (SQLite does not have it natively in all builds)
    database.function('LOG', (x: number) => {
        if (x <= 0) return -999999; // Avoid -Infinity
        return Math.log(x);
    });
}

/** Creates core tables from schema.sql if the nodes table does not exist. */
function initializeSchema(database: Database.Database): void {
    const tableExists = database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'"
    ).get();

    if (!tableExists) {
        const schemaPath: string = path.join(__dirname, 'schema.sql');
        const schema: string = fs.readFileSync(schemaPath, 'utf8');
        database.exec(schema);
        console.error('[sqlite] Database initialized with schema');
    }
}

// =============================================================================
// PREPARED STATEMENT CACHE
// =============================================================================

const STMT_CACHE_MAX = RC.database.stmtCacheMax;
// Per-database statement caches: statements compiled on one connection MUST NOT
// be used on another (better-sqlite3 binds statements to their source connection).
// Using a WeakMap keyed by DB instance ensures project DB and system DB never
// share cached statements, even when the SQL strings are identical.
const stmtCaches = new WeakMap<Database.Database, { read: Map<string, Database.Statement>, write: Map<string, Database.Statement> }>();

/** Per-DB statement cache (read/write maps); statements are bound to connection so project and system DB have separate caches. */
function getDbCaches(d: Database.Database): { read: Map<string, Database.Statement>, write: Map<string, Database.Statement> } {
    let caches = stmtCaches.get(d);
    if (!caches) {
        caches = { read: new Map(), write: new Map() };
        stmtCaches.set(d, caches);
    }
    return caches;
}

/** Get or create a prepared statement (avoids recompiling SQL on every call). */
function cachedPrepare(d: Database.Database, sql: string, isRead: boolean = false): Database.Statement {
    const cache = isRead ? getDbCaches(d).read : getDbCaches(d).write;
    let stmt = cache.get(sql);
    if (stmt) return stmt;
    stmt = d.prepare(sql);
    // Evict oldest entry if cache is full
    if (cache.size >= STMT_CACHE_MAX) {
        const first = cache.keys().next().value!;
        cache.delete(first);
    }
    cache.set(sql, stmt);
    return stmt;
}

/** Clear the statement cache (must be called when DB handle changes). */
export function clearStatementCache(): void {
    // WeakMap entries are automatically collected when DB handles are GC'd.
    // For explicit clears (e.g., project switch), clear caches for known DBs.
    try { const d = getDb(); stmtCaches.delete(d); } catch {}
    try { const d = getSystemDb(); stmtCaches.delete(d); } catch {}
}

// =============================================================================
// QUERY EXECUTION (instrumented)
// =============================================================================

/**
 * Raw query execution — no instrumentation, no write queue.
 *
 * Handles RETURNING clause emulation, PostgreSQL-to-SQLite translation,
 * and statement caching. SELECT queries use `.all()`, mutations use `.run()`.
 * On prepared-statement errors, retries once without the cache.
 *
 * @param d - The database connection to execute against.
 * @param sql - SQL string (PostgreSQL-flavored, pre-translation).
 * @param params - Positional parameter values.
 * @returns Array of row objects for SELECTs, or `[]` for mutations.
 */
function _queryExec(d: Database.Database, sql: string, params: any[]): any[] {
    // Handle RETURNING clause before translation
    const returningMatch = sql.match(/\bRETURNING\s+(.+?)\s*$/is);
    if (returningMatch) {
        return handleReturning(d, sql, params, returningMatch);
    }

    // Translate PostgreSQL -> SQLite
    const { sql: translated, params: translatedParams } = translate(sql, params);

    const trimmed = translated.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');

    if (isSelect) {
        try {
            return cachedPrepare(d, translated, isSelect).all(...translatedParams as any[]);
        } catch (err: any) {
            getDbCaches(d).read.delete(translated);
            try {
                return d.prepare(translated).all(...translatedParams as any[]);
            } catch {
                console.error('[sqlite] Query error:', err.message);
                console.error('[sqlite] SQL:', translated);
                console.error('[sqlite] Params:', translatedParams);
                throw err;
            }
        }
    } else {
        try {
            cachedPrepare(d, translated, false).run(...translatedParams as any[]);
            return [];
        } catch (err: any) {
            getDbCaches(d).write.delete(translated);
            try {
                d.prepare(translated).run(...translatedParams as any[]);
                return [];
            } catch {
                console.error('[sqlite] Mutation error:', err.message);
                console.error('[sqlite] SQL:', translated);
                console.error('[sqlite] Params:', translatedParams);
                throw err;
            }
        }
    }
}

/**
 * Raw single-row query execution — no instrumentation, no write queue.
 *
 * Uses `.get()` for SELECT efficiency (avoids allocating an array).
 * Falls back to `.run()` for mutations. Handles RETURNING emulation and
 * statement caching with retry on prepared-statement errors.
 *
 * @param d - The database connection to execute against.
 * @param sql - SQL string (PostgreSQL-flavored, pre-translation).
 * @param params - Positional parameter values.
 * @returns First row object for SELECTs, or `null` for mutations / empty results.
 */
function _queryOneExec(d: Database.Database, sql: string, params: any[]): any | null {
    const returningMatch = sql.match(/\bRETURNING\s+(.+?)\s*$/is);
    if (returningMatch) {
        const rows = handleReturning(d, sql, params, returningMatch);
        return rows[0] || null;
    }

    const { sql: translated, params: translatedParams } = translate(sql, params);

    const trimmed = translated.trim().toUpperCase();
    const isSelect = trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');

    if (!isSelect) {
        try {
            cachedPrepare(d, translated, false).run(...translatedParams as any[]);
            return null;
        } catch (err: any) {
            getDbCaches(d).write.delete(translated);
            try {
                d.prepare(translated).run(...translatedParams as any[]);
                return null;
            } catch {
                console.error('[sqlite] QueryOne mutation error:', err.message);
                console.error('[sqlite] SQL:', translated);
                throw err;
            }
        }
    }

    try {
        return cachedPrepare(d, translated, isSelect).get(...translatedParams as any[]) || null;
    } catch (err: any) {
        getDbCaches(d)[isSelect ? 'read' : 'write'].delete(translated);
        try {
            return d.prepare(translated).get(...translatedParams as any[]) || null;
        } catch {
            console.error('[sqlite] QueryOne error:', err.message);
            console.error('[sqlite] SQL:', translated);
            console.error('[sqlite] Params:', translatedParams);
            throw err;
        }
    }
}

/**
 * Execute a query and return all rows.
 * Auto-translates PostgreSQL SQL to SQLite.
 * Instrumented with timing, slow query detection, and contention tracking.
 */
export async function query(sql: string, params: any[] = []): Promise<any[]> {
    const isRead = isReadQuery(sql);
    if (isRead) {
        // Use dedicated read connection — WAL mode allows concurrent reads even during writes.
        // The read connection is non-readonly so it sees all committed WAL writes immediately.
        const d = _getReadDb();
        const handle = beginOp(sql.substring(0, 120), false);
        try {
            return _queryExec(d, sql, params);
        } finally {
            endOp(handle, sql.substring(0, 200), params.length);
        }
    }
    // Writes serialize through the queue — prevents SQLITE_BUSY & yields between writes
    return enqueueProjectWrite(() => {
        const d = getDb();
        const handle = beginOp(sql.substring(0, 120), true);
        checkContention(true, 'Write', sql.substring(0, 80));
        try {
            return withBusyRetry(() => _queryExec(d, sql, params));
        } finally {
            if (endOp(handle, sql.substring(0, 200), params.length)) maybeCheckpointWAL();
        }
    });
}

/**
 * Execute a query and return the first row.
 * Uses .get() for SELECT efficiency — avoids allocating an array for single-row lookups.
 * Falls back to .run() for mutations (INSERT/UPDATE/DELETE without RETURNING).
 * Instrumented with timing, slow query detection, and contention tracking.
 */
export async function queryOne(sql: string, params: any[] = []): Promise<any | null> {
    const isRead = isReadQuery(sql);
    if (isRead) {
        const d = _getReadDb();
        const handle = beginOp(sql.substring(0, 120), false);
        try {
            return _queryOneExec(d, sql, params);
        } finally {
            endOp(handle, sql.substring(0, 200), params.length);
        }
    }
    return enqueueProjectWrite(() => {
        const d = getDb();
        const handle = beginOp(sql.substring(0, 120), true);
        checkContention(true, 'Write', sql.substring(0, 80));
        try {
            return withBusyRetry(() => _queryOneExec(d, sql, params));
        } finally {
            if (endOp(handle, sql.substring(0, 200), params.length)) maybeCheckpointWAL();
        }
    });
}

// =============================================================================
// SYSTEM DATABASE QUERIES
// =============================================================================

/**
 * Execute a query against the system database (models, assignments, prompts, config).
 * Same interface and instrumentation as query(), but routes to system.db.
 */
export async function systemQuery(sql: string, params: any[] = []): Promise<any[]> {
    const isRead = isReadQuery(sql);
    if (isRead) {
        const d = _getSystemReadDb();
        const handle = beginOp('[sys] ' + sql.substring(0, 110), false);
        try {
            return _queryExec(d, sql, params);
        } finally {
            endOp(handle, '[sys] ' + sql.substring(0, 194), params.length, '[sys] ');
        }
    }
    return enqueueSystemWrite(() => {
        const d = getSystemDb();
        const handle = beginOp('[sys] ' + sql.substring(0, 110), true);
        try {
            return withBusyRetry(() => _queryExec(d, sql, params));
        } finally {
            endOp(handle, '[sys] ' + sql.substring(0, 194), params.length, '[sys] ');
        }
    });
}

/**
 * Execute a single-row query against the system database.
 * Same interface as queryOne(), but routes to system.db.
 */
export async function systemQueryOne(sql: string, params: any[] = []): Promise<any | null> {
    const isRead = isReadQuery(sql);
    if (isRead) {
        const d = _getSystemReadDb();
        const handle = beginOp('[sys] ' + sql.substring(0, 110), false);
        try {
            return _queryOneExec(d, sql, params);
        } finally {
            endOp(handle, '[sys] ' + sql.substring(0, 194), params.length, '[sys] ');
        }
    }
    return enqueueSystemWrite(() => {
        const d = getSystemDb();
        const handle = beginOp('[sys] ' + sql.substring(0, 110), true);
        try {
            return withBusyRetry(() => _queryOneExec(d, sql, params));
        } finally {
            endOp(handle, '[sys] ' + sql.substring(0, 194), params.length, '[sys] ');
        }
    });
}

/** Synchronous query helper for system DB — for use inside systemTransactionSync() callbacks. */
function systemQuerySync(sql: string, params: any[] = []): any[] {
    return withBusyRetry(() => _queryExec(getSystemDb(), sql, params));
}

/** Synchronous queryOne helper for system DB — for use inside systemTransactionSync() callbacks. */
function systemQueryOneSync(sql: string, params: any[] = []): any | null {
    return withBusyRetry(() => _queryOneExec(getSystemDb(), sql, params));
}

/**
 * Execute a synchronous transaction against the system database.
 * Same interface as transactionSync(), but on system.db.
 */
export function systemTransactionSync<T>(callback: (client: TransactionClient) => T): T {
    const d = getSystemDb();
    const handle = beginOp('[sys] TRANSACTION_SYNC', true);
    try {
        const txn = d.transaction(() => {
            return callback({ query: systemQuerySync, queryOne: systemQueryOneSync });
        });
        return withBusyRetry(() => txn());
    } finally {
        endOp(handle, '[sys] TRANSACTION_SYNC', 0, '[sys] TRANSACTION_SYNC');
    }
}

// =============================================================================
// EVENT LOOP YIELDING
// =============================================================================

/**
 * Yield to the macrotask queue so HTTP request handlers can run.
 *
 * `await query()` creates microtasks (already-resolved promises), which all execute
 * before any macrotask (HTTP handler). Chains of 12+ DB writes in handlers like
 * handlePropose() starve the Express server. setImmediate schedules a macrotask,
 * giving HTTP handlers a chance to run between write phases.
 */
export function yieldToEventLoop(): Promise<void> {
    return new Promise<void>(resolve => setImmediate(resolve));
}

// =============================================================================
// WRITE QUEUE — serialize all writes to prevent SQLITE_BUSY & event loop starvation
// =============================================================================

/**
 * Write queue serializes all writes so only one runs at a time.
 * This prevents SQLITE_BUSY (SQLite allows only one writer) and yields to the
 * event loop between writes via setImmediate so HTTP handlers don't starve.
 *
 * Separate chains for project DB and system DB (different files, no cross-contention).
 */
let projectWriteChain: Promise<void> = Promise.resolve();
let systemWriteChain: Promise<void> = Promise.resolve();

/**
 * Enqueue a synchronous write operation on the project DB write chain.
 *
 * Only one project write executes at a time. After each write completes,
 * yields to the macrotask queue via `setImmediate` so HTTP handlers can run.
 *
 * @param fn - Synchronous function that performs the DB write.
 * @returns Promise resolving to the write function's return value.
 */
function enqueueProjectWrite<T>(fn: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        projectWriteChain = projectWriteChain.then(async () => {
            try {
                resolve(fn());
            } catch (err) {
                reject(err);
            }
            // Yield to macrotask queue — lets HTTP handlers run between writes
            await new Promise<void>(r => setImmediate(r));
        });
    });
}

/**
 * Enqueue a synchronous write operation on the system DB write chain.
 *
 * Separate from project writes since project and system DBs are different
 * files with no cross-contention.
 *
 * @param fn - Synchronous function that performs the DB write.
 * @returns Promise resolving to the write function's return value.
 */
function enqueueSystemWrite<T>(fn: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        systemWriteChain = systemWriteChain.then(async () => {
            try {
                resolve(fn());
            } catch (err) {
                reject(err);
            }
            await new Promise<void>(r => setImmediate(r));
        });
    });
}

// =============================================================================
// SQLITE_BUSY RETRY
// =============================================================================

const MAX_BUSY_RETRIES = 3;
const BUSY_RETRY_BASE_MS = 50;

// Proper sleep buffer — Atomics.wait sleeps the thread without spin-burning CPU.
// Still blocks the event loop, but the write queue should prevent this path entirely.
const _busySleepBuf = new Int32Array(new SharedArrayBuffer(4));

/**
 * Retry a synchronous DB operation on SQLITE_BUSY.
 *
 * Safety net only — the write queue should prevent SQLITE_BUSY in normal
 * operation. Uses `Atomics.wait` for sleeping (no CPU spin) with exponential
 * backoff (50ms, 100ms, 200ms).
 *
 * @param fn - Synchronous function to attempt.
 * @returns The function's return value on success.
 * @throws The last error if all retries are exhausted or a non-BUSY error occurs.
 */
function withBusyRetry<T>(fn: () => T): T {
    let lastErr: any;
    for (let attempt = 0; attempt <= MAX_BUSY_RETRIES; attempt++) {
        try {
            return fn();
        } catch (err: any) {
            if (err.code === 'SQLITE_BUSY' && attempt < MAX_BUSY_RETRIES) {
                lastErr = err;
                const delayMs = BUSY_RETRY_BASE_MS * 2 ** attempt;
                // Atomics.wait is a proper sleep — doesn't spin-burn CPU
                Atomics.wait(_busySleepBuf, 0, 0, delayMs);
                recordBusyRetry();
                console.error(`[db:busy] Retry ${attempt + 1}/${MAX_BUSY_RETRIES} after ${delayMs}ms (write queue should prevent this)`);
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

// =============================================================================
// WAL CHECKPOINT
// =============================================================================

let lastCheckpointAt = 0;
const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Periodic passive WAL checkpoint. Prevents unbounded WAL growth during heavy writes.
 * PASSIVE mode doesn't block readers or writers — it just checkpoints what it can.
 */
function maybeCheckpointWAL(): void {
    const now = Date.now();
    if (now - lastCheckpointAt < WAL_CHECKPOINT_INTERVAL_MS) return;
    lastCheckpointAt = now;

    try {
        const d = getDb();
        d.pragma('wal_checkpoint(PASSIVE)');
    } catch (err: any) {
        // Non-fatal — next checkpoint will try again
        console.error(`[sqlite] WAL checkpoint failed: ${err.message}`);
    }
}

// =============================================================================
// TRANSACTIONS
// =============================================================================

/** Synchronous query helper — for use inside transactionSync() callbacks. */
function querySync(sql: string, params: any[] = []): any[] {
    return withBusyRetry(() => _queryExec(getDb(), sql, params));
}

/** Synchronous queryOne helper — for use inside transactionSync() callbacks. */
function queryOneSync(sql: string, params: any[] = []): any | null {
    return withBusyRetry(() => _queryOneExec(getDb(), sql, params));
}

/** Synchronous client type for transaction callbacks. */
export interface TransactionClient {
    query: (sql: string, params?: any[]) => any[];
    queryOne: (sql: string, params?: any[]) => any | null;
}

/**
 * Execute a REAL synchronous transaction with better-sqlite3.
 * The callback receives synchronous query/queryOne helpers.
 * All DB operations inside the callback execute atomically (BEGIN...COMMIT).
 */
export function transactionSync<T>(callback: (client: TransactionClient) => T): T {
    const d = getDb();
    const handle = beginOp('TRANSACTION_SYNC', true);
    checkContention(true, 'Transaction');
    try {
        const txn = d.transaction(() => {
            return callback({ query: querySync, queryOne: queryOneSync });
        });
        return withBusyRetry(() => txn());
    } finally {
        if (endOp(handle, 'TRANSACTION_SYNC', 0, 'TRANSACTION_SYNC')) maybeCheckpointWAL();
    }
}


// =============================================================================
// DIAGNOSTICS API
// =============================================================================

/** Get full diagnostics snapshot (injects stmt-cache size from this module). */
export function getDbDiagnostics(): DbDiagnostics {
    let cacheSize = 0;
    try { const c = stmtCaches.get(getDb()); if (c) cacheSize += c.read.size + c.write.size; } catch {}
    try { const c = stmtCaches.get(getSystemDb()); if (c) cacheSize += c.read.size + c.write.size; } catch {}
    return _getDbDiagnostics(cacheSize);
}

// =============================================================================
// HEALTH CHECK & LIFECYCLE
// =============================================================================

/**
 * Probe both project and system databases with `SELECT 1` to confirm they are responsive.
 * Returns true during a project switch (when the DB is temporarily unavailable) to
 * prevent the orchestrator from triggering false-alarm restarts.
 */
export async function healthCheck(): Promise<boolean> {
    // During project switch, DB is temporarily unavailable — report healthy
    // to prevent the orchestrator from triggering unnecessary restarts.
    if (switching) return true;
    try {
        const d = getDb();
        d.prepare('SELECT 1').get();
    } catch (err) {
        console.error('[sqlite] Project DB health check failed:', err);
        return false;
    }
    try {
        const s = getSystemDb();
        s.prepare('SELECT 1').get();
    } catch (err) {
        console.error('[sqlite] System DB health check failed:', err);
        return false;
    }
    return true;
}

/**
 * Close all four database connections (project write + read, system write + read)
 * and clear their prepared-statement caches. Call during graceful shutdown.
 */
export async function close(): Promise<void> {
    // Close project DB connections
    if (readDb) {
        stmtCaches.delete(readDb);
        readDb.close();
        readDb = null;
        console.error('[sqlite] Project read connection closed');
    }
    if (db) {
        stmtCaches.delete(db);
        db.close();
        db = null;
        console.error('[sqlite] Project database closed');
    }
    // Close system DB connections
    if (systemReadDb) {
        stmtCaches.delete(systemReadDb);
        systemReadDb.close();
        systemReadDb = null;
        console.error('[system-db] Read connection closed');
    }
    if (systemDb) {
        stmtCaches.delete(systemDb);
        systemDb.close();
        systemDb = null;
        console.error('[system-db] Database closed');
    }
}

/**
 * @deprecated Use {@link getDb} instead. Returns the raw better-sqlite3 project database
 * handle for legacy callers that need synchronous prepared-statement access.
 */
export function getPoolInstance(): Database.Database {
    return getDb();
}

/**
 * Manually trigger schema migrations on the project database. Normally called
 * automatically by {@link openDatabase} at startup; exported for cases where
 * re-migration is needed without a full DB reopen (e.g., after a restore).
 */
export async function migrate(): Promise<void> {
    const d = getDb();
    runSchemaMigrations(d);
}

// =============================================================================
// DATABASE BACKUP & RESTORE
// =============================================================================

const backupDir: string = path.join(dataDir, 'backups');

/**
 * Create a timestamped backup of both databases.
 * Uses SQLite's online backup API (safe while DB is open and being written to).
 * Returns info for both project and system backups.
 */
export async function backupDatabase(label?: string): Promise<{ path: string; systemPath: string; label: string; size: number; systemSize: number; timestamp: string }> {
    const d = getDb();

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = label ? label.replace(/[^a-zA-Z0-9_-]/g, '_') : 'manual';

    // Back up project database
    const projectFilename = `resonance_${safeName}_${timestamp}.db`;
    const projectBackupPath = path.join(backupDir, projectFilename);
    await d.backup(projectBackupPath);
    const projectStats = fs.statSync(projectBackupPath);
    console.error(`[sqlite] Project backup: ${projectBackupPath} (${(projectStats.size / 1024 / 1024).toFixed(1)} MB)`);

    // Back up system database
    const s = getSystemDb();
    const systemFilename = `system_${safeName}_${timestamp}.db`;
    const systemBackupPath = path.join(backupDir, systemFilename);
    await s.backup(systemBackupPath);
    const systemStats = fs.statSync(systemBackupPath);
    console.error(`[system-db] System backup: ${systemBackupPath} (${(systemStats.size / 1024 / 1024).toFixed(1)} MB)`);

    return {
        path: projectBackupPath,
        systemPath: systemBackupPath,
        label: safeName,
        size: projectStats.size,
        systemSize: systemStats.size,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Restore the database from a backup file.
 * DANGEROUS: This replaces the current database entirely.
 * The server should be restarted after restore.
 */
export async function restoreDatabase(backupFilename: string): Promise<{ restored: boolean; from: string }> {
    const backupPath = path.join(backupDir, backupFilename);
    if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupFilename}`);
    }

    // Validate it's a real SQLite database
    const header = Buffer.alloc(16);
    const fd = fs.openSync(backupPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
        throw new Error('File is not a valid SQLite database');
    }

    const d = getDb();
    const currentDbPath = d.name; // better-sqlite3 exposes the file path

    // Checkpoint WAL to flush all data into the main .db file before closing
    d.pragma('wal_checkpoint(TRUNCATE)');

    // Close all connections
    if (readDb) {
        stmtCaches.delete(readDb);
        readDb.close();
        readDb = null;
    }
    stmtCaches.delete(d);
    d.close();
    db = null;

    // Remove now-empty WAL/SHM files (retry on Windows EBUSY)
    await unlinkWithRetry(currentDbPath + '-wal');
    await unlinkWithRetry(currentDbPath + '-shm');

    fs.copyFileSync(backupPath, currentDbPath);

    console.error(`[sqlite] Database restored from: ${backupPath}`);

    // Reopen the database (triggers schema migrations, pragma setup, etc.)
    getDb();

    return { restored: true, from: backupFilename };
}

/**
 * List available database backups, newest first.
 * Includes both project (resonance_*) and system (system_*) backups.
 * @returns Array of objects with `filename`, `label` (extracted from filename),
 *   `size` (bytes), `created` (ISO timestamp), and `type` ('project' | 'system').
 */
export function listBackups(): { filename: string; label: string; size: number; created: string; type: 'project' | 'system' }[] {
    if (!fs.existsSync(backupDir)) return [];

    const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db') && (f.startsWith('resonance_') || f.startsWith('system_')))
        .map(filename => {
            const filePath = path.join(backupDir, filename);
            const stats = fs.statSync(filePath);
            const isSystem = filename.startsWith('system_');
            const prefix = isSystem ? 'system_' : 'resonance_';
            const match = filename.match(new RegExp(`^${prefix}(.+?)_\\d{4}-\\d{2}-\\d{2}T`));
            const label = match ? match[1] : filename;
            return {
                filename,
                label,
                size: stats.size,
                created: stats.mtime.toISOString(),
                type: (isSystem ? 'system' : 'project') as 'project' | 'system',
            };
        })
        .sort((a, b) => b.created.localeCompare(a.created));

    return files;
}

// =============================================================================
// PROJECT MANAGEMENT
// =============================================================================

const projectDir: string = path.join(dataDir, 'projects');

/**
 * Get the projects directory path (default: `data/projects/`), creating it if it
 * does not already exist. Used by project management to locate per-project DB files.
 */
export function getProjectDir(): string {
    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }
    return projectDir;
}

// extractSharedData/restoreSharedData REMOVED — system data lives permanently in system.db

/**
 * Try to unlink a file, retrying on EBUSY (Windows holds file handles briefly after close).
 */
async function unlinkWithRetry(filePath: string, retries = 5, delayMs = 100): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return;
        } catch (err: any) {
            if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < retries - 1) {
                await new Promise(r => setTimeout(r, delayMs * (i + 1)));
                continue;
            }
            // On final retry or non-EBUSY error, log but don't throw for WAL/SHM
            if (filePath.endsWith('-wal') || filePath.endsWith('-shm')) {
                console.error(`[projects] Could not remove ${path.basename(filePath)}: ${err.code} (non-fatal)`);
                return;
            }
            throw err;
        }
    }
}

/**
 * Save a copy of the current database to a destination path.
 * Uses SQLite's online backup API (safe with WAL mode).
 */
export async function saveProjectCopy(destPath: string): Promise<void> {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const d = getDb();

    // If already working directly on this file, just checkpoint WAL — no backup needed
    const resolvedDest = path.resolve(destPath);
    const resolvedCurrent = path.resolve(d.name);
    if (resolvedDest === resolvedCurrent) {
        d.pragma('wal_checkpoint(TRUNCATE)');
        console.error(`[projects] Checkpointed in-place: ${destPath}`);
        return;
    }

    await d.backup(destPath);
    console.error(`[projects] Saved project copy to: ${destPath}`);
}

/**
 * Switch to a different project database.
 * System data (models, assignments, config) stays in system.db — only the project
 * connection is closed and reopened at the new path.
 */
export async function switchProject(projectDbPath: string): Promise<void> {
    if (!fs.existsSync(projectDbPath)) {
        throw new Error(`Project database not found: ${projectDbPath}`);
    }

    // Validate SQLite header
    const header = Buffer.alloc(16);
    const fd = fs.openSync(projectDbPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
        throw new Error('Project file is not a valid SQLite database');
    }

    const d = getDb();

    // Checkpoint WAL to flush all data into the main .db file
    d.pragma('wal_checkpoint(TRUNCATE)');

    switching = true;
    try {
        // Close project read connection
        if (readDb) {
            stmtCaches.delete(readDb);
            readDb.close();
            readDb = null;
        }
        // Close project write connection
        stmtCaches.delete(d);
        d.close();
        db = null;

        // Point getDb() at the new project DB
        dbPathOverride = projectDbPath;

        console.error(`[projects] Switched to project: ${projectDbPath}`);
    } finally {
        switching = false;
    }

    // Reopen at the new path (triggers schema migrations, pragma setup)
    getDb();
}

// Tables that hold project-specific knowledge (cleared when creating a new project).
// Order matters: child tables (FK references) before parent tables.
const PROJECT_TABLES = [
    // Children of nodes
    'edges',
    'node_abstract_patterns',
    'node_feedback',
    'voicings',
    'dream_cycles',
    'bias_observations',
    'decisions',
    // Children of domain_partitions
    'partition_domains',
    'partition_bridges',
    // Parent tables
    'nodes',
    'abstract_patterns',
    'domain_partitions',
    // Knowledge Base (children first — kb_chunks → kb_files → kb_folders)
    'kb_chunks',
    'kb_files',
    'kb_folders',
    // Standalone tables
    'knowledge_cache',
    'session_insights',
    'session_node_usage',
    'chat_conversations',
    'scaffold_jobs',
    'domain_synonyms',
    'parameters',
    'node_keywords',
] as const;

/**
 * Create an empty project by opening a fresh DB at the given path.
 * System data (models, assignments, config) lives in system.db — no copying needed.
 */
export async function createEmptyProject(newProjectPath?: string): Promise<void> {
    if (newProjectPath) {
        const d = getDb();
        d.pragma('wal_checkpoint(TRUNCATE)');

        switching = true;
        try {
            if (readDb) {
                stmtCaches.delete(readDb);
                readDb.close();
                readDb = null;
            }
            stmtCaches.delete(d);
            d.close();
            db = null;
            dbPathOverride = newProjectPath;
        } finally {
            switching = false;
        }

        // getDb() creates the new file + runs schema migrations
        getDb();
        console.error(`[projects] Created new project DB at: ${newProjectPath}`);
    } else {
        // Legacy: clear tables in the current DB
        const d = getDb();
        d.pragma('foreign_keys = OFF');
        try {
            d.transaction(() => {
                for (const table of PROJECT_TABLES) {
                    try {
                        d.prepare(`DELETE FROM ${table}`).run();
                    } catch {
                        // Table may not exist in older schema — skip
                    }
                }
            })();
        } finally {
            d.pragma('foreign_keys = ON');
        }
        console.error('[projects] Cleared project-specific tables for new project');
    }
}

export const dialect = 'sqlite' as const;
