/**
 * RETURNING clause emulation for SQLite.
 *
 * SQLite gained native RETURNING support in 3.35.0, but better-sqlite3 may
 * be built against an older version.  These helpers emulate PostgreSQL-style
 * RETURNING by running a SELECT against the affected rows before/after the DML.
 *
 * All functions are pure: they operate only on the arguments supplied and hold
 * no module-level state.  The sole imports are better-sqlite3 (type only) and
 * the SQL translator.
 */

import type Database from 'better-sqlite3';
import { translate } from './sql.js';

/**
 * Dispatch a DML statement that carries a RETURNING clause to the appropriate
 * emulation helper. The caller must have already matched the RETURNING clause
 * from the SQL string.
 *
 * @param database - The open better-sqlite3 database connection.
 * @param sql - The full SQL string including the RETURNING clause.
 * @param params - Bound parameter values (PostgreSQL `$N` style, not yet translated).
 * @param returningMatch - RegExp match result where `index` marks the RETURNING
 *   clause position and `[1]` captures the column list.
 * @returns Array of row objects returned by the emulated RETURNING clause,
 *   or `[]` if the DML type is unrecognized.
 */
export function handleReturning(
    database: Database.Database,
    sql: string,
    params: any[],
    returningMatch: RegExpMatchArray,
): any[] {
    const baseSql = sql.substring(0, returningMatch.index!).trim();
    const returningColumns = returningMatch[1].trim();

    const { sql: translated, params: translatedParams } = translate(baseSql, params);
    const trimmed = translated.trim().toUpperCase();

    if (trimmed.startsWith('INSERT')) {
        return handleInsertReturning(database, translated, translatedParams, returningColumns);
    } else if (trimmed.startsWith('UPDATE')) {
        return handleUpdateReturning(database, translated, translatedParams, returningColumns);
    } else if (trimmed.startsWith('DELETE')) {
        return handleDeleteReturning(database, translated, translatedParams, returningColumns);
    }

    database.prepare(translated).run(...translatedParams as any[]);
    return [];
}

/**
 * Emulate `INSERT ... RETURNING` by executing the INSERT, then reading back
 * the inserted row via `last_insert_rowid`.
 *
 * @param database - The open better-sqlite3 database connection.
 * @param sql - Translated INSERT SQL (without RETURNING clause).
 * @param params - Translated parameter values (SQLite `?` style).
 * @param columns - Comma-separated column list or `'*'` from the RETURNING clause.
 * @returns Array containing the inserted row, or `[]` if no rows were affected.
 */
export function handleInsertReturning(
    database: Database.Database,
    sql: string,
    params: any[],
    columns: string,
): any[] {
    const tableMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    if (!tableMatch) throw new Error('Could not parse table name from INSERT for RETURNING');
    const tableName = tableMatch[1];

    const result = database.prepare(sql).run(...params as any[]);
    if (result.changes === 0) return [];

    const selectCols = columns === '*' ? '*' : columns;
    const row = database.prepare(
        `SELECT ${selectCols} FROM ${tableName} WHERE rowid = ?`,
    ).get(result.lastInsertRowid);
    return row ? [row] : [];
}

/**
 * Emulate `UPDATE ... RETURNING` by pre-selecting affected `id` values, running
 * the UPDATE, then fetching those rows with the updated values.
 *
 * Assumes the target table has an `id` column for pre-selection. If the
 * pre-select fails (e.g. no `id` column), the UPDATE still executes but
 * returns an empty array.
 *
 * @param database - The open better-sqlite3 database connection.
 * @param sql - Translated UPDATE SQL (without RETURNING clause).
 * @param params - Translated parameter values (SQLite `?` style).
 * @param columns - Comma-separated column list or `'*'` from the RETURNING clause.
 * @returns Array of updated row objects, or `[]` if pre-select failed or no rows matched.
 */
export function handleUpdateReturning(
    database: Database.Database,
    sql: string,
    params: any[],
    columns: string,
): any[] {
    const tableMatch = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (!tableMatch) throw new Error('Could not parse table name from UPDATE for RETURNING');
    const tableName = tableMatch[1];

    const whereMatch = sql.match(/\bWHERE\b(.+)$/i);
    let affectedIds: any[] = [];

    if (whereMatch) {
        const whereClause = whereMatch[0];
        const selectSql = `SELECT id FROM ${tableName} ${whereClause}`;
        try {
            const rows = database.prepare(selectSql).all(
                ...(params as any[]).slice(-countPlaceholders(whereClause)),
            ) as any[];
            affectedIds = rows.map((r: any) => r.id);
        } catch {
            // Pre-select failed — update proceeds without RETURNING data
        }
    }

    database.prepare(sql).run(...params as any[]);

    if (affectedIds.length > 0) {
        const selectCols = columns === '*' ? '*' : columns;
        const placeholders = affectedIds.map(() => '?').join(', ');
        return database.prepare(
            `SELECT ${selectCols} FROM ${tableName} WHERE id IN (${placeholders})`,
        ).all(...affectedIds) as any[];
    }

    return [];
}

/**
 * Emulate `DELETE ... RETURNING` by capturing matching rows **before** the
 * deletion, then executing the DELETE.
 *
 * If no WHERE clause is present, selects all rows from the table before
 * deleting. If pre-select fails, the DELETE still executes but returns `[]`.
 *
 * @param database - The open better-sqlite3 database connection.
 * @param sql - Translated DELETE SQL (without RETURNING clause).
 * @param params - Translated parameter values (SQLite `?` style).
 * @param columns - Comma-separated column list or `'*'` from the RETURNING clause.
 * @returns Array of row objects that were deleted, or `[]` if pre-select failed.
 */
export function handleDeleteReturning(
    database: Database.Database,
    sql: string,
    params: any[],
    columns: string,
): any[] {
    const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (!tableMatch) throw new Error('Could not parse table name from DELETE for RETURNING');
    const tableName = tableMatch[1];

    const whereMatch = sql.match(/\bWHERE\b(.+)$/i);
    const selectCols = columns === '*' ? '*' : columns;
    let rows: any[] = [];

    if (whereMatch) {
        const selectSql = `SELECT ${selectCols} FROM ${tableName} ${whereMatch[0]}`;
        try {
            const whereParams = (params as any[]).slice(-countPlaceholders(whereMatch[0]));
            rows = database.prepare(selectSql).all(...whereParams) as any[];
        } catch {
            // Pre-select failed — delete proceeds, caller gets empty RETURNING result
        }
    } else {
        try {
            rows = database.prepare(`SELECT ${selectCols} FROM ${tableName}`).all() as any[];
        } catch {
            // Continue with delete even if pre-select fails
        }
    }

    database.prepare(sql).run(...params as any[]);
    return rows;
}

/**
 * Count `?` placeholder occurrences in a SQL fragment.
 *
 * Used to determine how many parameters from the end of the params array
 * belong to a WHERE clause extracted from the full SQL.
 *
 * @param sql - SQL fragment to scan for `?` placeholders.
 * @returns Number of `?` occurrences found.
 */
export function countPlaceholders(sql: string): number {
    return (sql.match(/\?/g) || []).length;
}
