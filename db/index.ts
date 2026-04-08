/**
 * PODBIT v0.5 - DATABASE MODULE
 *
 * Public entry point for all database operations. All consuming code imports
 * from this module (via `../db.js` re-export). Loads environment variables,
 * dynamically imports the SQLite backend, and re-exports its API surface.
 *
 * Dual-DB architecture:
 * - **Project DB** (`query`/`queryOne`/`transactionSync`): per-project knowledge data
 * - **System DB** (`systemQuery`/`systemQueryOne`/`systemTransactionSync`): permanent
 *   model registry, assignments, prompts, config — survives project switches
 *
 * @module db/index
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const backend = await import('./sqlite-backend.js');

// ── Project DB ───────────────────────────────────────────────────────────────

/** Execute a SQL query against the project DB and return all matching rows. */
export const query: (...args: any[]) => Promise<any[]> = backend.query;

/** Execute a SQL query against the project DB and return the first row, or undefined. */
export const queryOne: (...args: any[]) => Promise<any | undefined> = backend.queryOne;

/** Execute a synchronous, atomic transaction against the project DB. */
export const transactionSync: <T>(fn: (client: any) => T) => T = backend.transactionSync;

/** Check health of both project and system databases. */
export const healthCheck: () => Promise<boolean> = backend.healthCheck;

/** Close all database connections (project + system, read + write). */
export const close: () => Promise<void> = backend.close;

/** SQL dialect identifier — always `'sqlite'`. */
export const dialect: 'sqlite' = 'sqlite';

// ── System DB (permanent, survives project switches) ─────────────────────────

/** Execute a SQL query against the system DB and return all matching rows. */
export const systemQuery: (...args: any[]) => Promise<any[]> = backend.systemQuery;

/** Execute a SQL query against the system DB and return the first row, or undefined. */
export const systemQueryOne: (...args: any[]) => Promise<any | undefined> = backend.systemQueryOne;

/** Execute a synchronous, atomic transaction against the system DB. */
export const systemTransactionSync: <T>(fn: (client: any) => T) => T = backend.systemTransactionSync;

/**
 * Determine whether a settings key belongs in system.db vs project DB.
 * @param key - The settings key to check (e.g. `'proxy.config'`, `'project.name'`).
 * @returns `true` if the key should be stored in system.db.
 */
export const isSystemSetting: (key: string) => boolean = backend.isSystemSetting;

// ── Event loop yielding ──────────────────────────────────────────────────────

/**
 * Yield to the macrotask queue to prevent microtask starvation during
 * write-heavy operations (e.g. handlePropose with 12+ sequential writes).
 */
export const yieldToEventLoop: () => Promise<void> = backend.yieldToEventLoop;

// ── Backup / restore ─────────────────────────────────────────────────────────

/**
 * Create a timestamped backup of both project and system databases.
 * @param label - Optional human-readable label for the backup filename.
 */
export const backupDatabase: (label?: string) => Promise<any> = backend.backupDatabase;

/**
 * Restore the project database from a backup file. DANGEROUS: replaces the
 * current database entirely. The server should be restarted after restore.
 * @param filename - Name of the backup file (must exist in the backups directory).
 */
export const restoreDatabase: (filename: string) => Promise<any> = backend.restoreDatabase;

/**
 * List available database backups (both project and system), newest first.
 * @returns Array of backup metadata objects.
 */
export const listBackups: () => any[] = backend.listBackups;

// ── Project management ───────────────────────────────────────────────────────

/**
 * Switch to a different project database file. Closes the current project DB
 * and reopens at the new path (runs migrations, sets up pragmas).
 * System DB stays open.
 * @param projectDbPath - Absolute path to the target project `.db` file.
 */
export const switchProject: (projectDbPath: string) => Promise<void> = backend.switchProject;

/**
 * Save a copy of the current project database to a destination path.
 * Uses SQLite's online backup API (safe with WAL mode).
 * @param destPath - Absolute path for the destination `.db` file.
 */
export const saveProjectCopy: (destPath: string) => Promise<void> = backend.saveProjectCopy;

/**
 * Create a new empty project database. If `newProjectPath` is provided, opens
 * a fresh DB at that path; otherwise clears project-specific tables in the current DB.
 * @param newProjectPath - Optional path for the new project `.db` file.
 */
export const createEmptyProject: (newProjectPath?: string) => Promise<void> = backend.createEmptyProject;

/**
 * Get the projects directory path (`data/projects/`), creating it if needed.
 * @returns Absolute path to the projects directory.
 */
export const getProjectDir: () => string = backend.getProjectDir;

// ── Diagnostics ──────────────────────────────────────────────────────────────

/** Build a full diagnostics snapshot (active ops, slow queries, percentile latencies). */
export const getDbDiagnostics = backend.getDbDiagnostics;

/** Reset all diagnostic counters and ring buffers. */
export const resetDbDiagnostics = backend.resetDbDiagnostics;

// ── Legacy ───────────────────────────────────────────────────────────────────

/** @deprecated Raw better-sqlite3 instance for backward compatibility. Prefer `query`/`queryOne`. */
export const pool: any = backend.getPoolInstance();
