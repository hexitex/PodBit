/**
 * @module prompts/backup
 *
 * Prompt backup and restore utilities. Exports all database prompt overrides
 * to a JSON file (`data/prompts.bak`) and restores them via upsert merge.
 * Backup is called automatically on every save/delete and can be triggered
 * manually via the API.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { systemQuery as query } from '../db.js';
import { invalidateCache } from './api.js';
import type { PromptBackupEntry, PromptBackup } from './types.js';

const __filename_backup = fileURLToPath(import.meta.url);
const __dirname_backup = path.dirname(__filename_backup);

/** Absolute path to the prompt backup file. */
const BACKUP_PATH = path.join(__dirname_backup, '..', 'data', 'prompts.bak');

/**
 * Export all database prompt overrides to `data/prompts.bak` as JSON.
 * Called automatically on every save/delete, or manually via API.
 * Creates the data directory if it does not exist.
 * @returns Object with the backup file path and number of exported entries
 */
export async function backupPrompts(): Promise<{ path: string; count: number }> {
    let rows: PromptBackupEntry[] = [];
    try {
        rows = await query(
            'SELECT id, locale, category, content, description, updated_at FROM prompts ORDER BY id, locale',
            []
        );
    } catch {
        // Table may not exist yet
    }

    const backup: PromptBackup = {
        version: 1,
        exported_at: new Date().toISOString(),
        count: rows.length,
        prompts: rows,
    };

    const dir = path.dirname(BACKUP_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2), 'utf-8');
    return { path: BACKUP_PATH, count: rows.length };
}

/**
 * Restore prompt overrides from `data/prompts.bak` into the database.
 * Merges with existing data: entries in the backup are upserted; existing
 * entries not present in the backup are left unchanged. Invalidates the
 * in-memory cache for each restored prompt.
 * @returns Object with counts of restored and skipped (failed) entries
 * @throws {Error} If no backup file exists or the version is unsupported
 */
export async function restorePrompts(): Promise<{ restored: number; skipped: number }> {
    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error('No backup file found at data/prompts.bak');
    }

    const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
    const backup: PromptBackup = JSON.parse(raw);

    if (backup.version !== 1) {
        throw new Error(`Unsupported backup version: ${backup.version}`);
    }

    let restored = 0;
    let skipped = 0;

    for (const entry of backup.prompts) {
        try {
            await query(
                `INSERT INTO prompts (id, category, locale, content, description, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id, locale) DO UPDATE SET
                     content = $4,
                     description = COALESCE($5, prompts.description),
                     category = $2,
                     updated_at = $6`,
                [entry.id, entry.category, entry.locale, entry.content, entry.description, entry.updated_at]
            );
            restored++;
            invalidateCache(entry.id, entry.locale);
        } catch (err) {
            console.warn(`[prompts] Failed to restore ${entry.id}: ${(err as Error).message}`);
            skipped++;
        }
    }

    return { restored, skipped };
}

/**
 * Get backup file metadata without performing a restore.
 * @returns Object with existence flag, file path, and optionally the export timestamp and entry count
 */
export function getBackupInfo(): { exists: boolean; path: string; exported_at?: string; count?: number } {
    if (!fs.existsSync(BACKUP_PATH)) {
        return { exists: false, path: BACKUP_PATH };
    }

    try {
        const raw = fs.readFileSync(BACKUP_PATH, 'utf-8');
        const backup: PromptBackup = JSON.parse(raw);
        return {
            exists: true,
            path: BACKUP_PATH,
            exported_at: backup.exported_at,
            count: backup.count,
        };
    } catch {
        return { exists: true, path: BACKUP_PATH };
    }
}
