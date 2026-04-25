import type Database from 'better-sqlite3';

/**
 * Return true when a SQLite table exists in the current database.
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
    const existing = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(tableName);
    if (existing) return true;

    try {
        db.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`).get();
        return true;
    } catch {
        return false;
    }
}

/**
 * Return true when a SQLite table has a named column.
 */
export function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
    const escapedTableName = tableName.replace(/'/g, "''");
    const columns = db.prepare(`PRAGMA table_info('${escapedTableName}')`).all() as Array<{ name: string }> | undefined;
    if (Array.isArray(columns) && columns.some(column => column.name === columnName)) return true;

    try {
        db.prepare(`SELECT ${columnName} FROM ${tableName} LIMIT 1`).get();
        return true;
    } catch {
        return false;
    }
}

/**
 * Add a column only when it is absent. Missing compatibility tables are skipped
 * because some project DBs no longer carry system-owned table copies.
 */
export function addColumnIfMissing(
    db: Database.Database,
    tableName: string,
    columnName: string,
    alterSql: string,
    logMessage?: string,
): void {
    if (columnExists(db, tableName, columnName)) return;

    try {
        db.exec(alterSql);
        if (logMessage) console.error(logMessage);
    } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.includes('no such table')) return;
        throw err;
    }
}
