import { query } from '../../db.js';
import type { ProjectManifest } from '../../core/project-context.js';

// =============================================================================
// MANIFEST HANDLERS
// =============================================================================

/**
 * Update the stored project manifest (purpose, goals, key questions, etc.)
 * Merges the provided fields with the existing manifest.
 */
export async function handleUpdateManifest(params: Record<string, any>) {
    const { manifest } = params;
    if (!manifest || typeof manifest !== 'object') {
        return { error: 'manifest object is required' };
    }

    // Read existing manifest to merge
    let existing: Partial<ProjectManifest> = {};
    try {
        const row = await query(`SELECT value FROM settings WHERE key = 'project.manifest'`);
        if (row.length > 0 && row[0].value) {
            existing = JSON.parse(row[0].value);
        }
    } catch { /* settings table may not exist */ }

    const updated: ProjectManifest = {
        purpose: manifest.purpose ?? existing.purpose ?? '',
        domains: manifest.domains ?? existing.domains ?? [],
        goals: manifest.goals ?? existing.goals ?? [],
        bridges: manifest.bridges ?? existing.bridges ?? [],
        autoBridge: manifest.autoBridge ?? existing.autoBridge ?? false,
        keyQuestions: manifest.keyQuestions ?? existing.keyQuestions ?? [],
        constraints: manifest.constraints ?? existing.constraints,
    };

    // Store updated manifest
    try {
        await query(
            `INSERT OR REPLACE INTO settings (key, value) VALUES ('project.manifest', $1)`,
            [JSON.stringify(updated)]
        );
    } catch (err: any) {
        return { error: `Failed to save manifest: ${err.message}` };
    }

    // Also update individual settings for backward compat
    if (updated.purpose) {
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.purpose', $1)`, [updated.purpose]);
    }
    if (updated.goals && updated.goals.length > 0) {
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.goals', $1)`, [JSON.stringify(updated.goals)]);
    }

    // Invalidate manifest cache so prompt injection picks up changes
    try {
        const { invalidateManifestCache } = await import('../../core/project-context.js');
        invalidateManifestCache();
    } catch { /* module may not be loaded */ }

    return { success: true, manifest: updated };
}

/**
 * Get the stored project manifest.
 *
 * Follows a fallback chain:
 * 1. Reads the unified `project.manifest` JSON from settings.
 * 2. Falls back to reading individual `project.purpose` and `project.goals` settings.
 * 3. Returns `{ manifest: null }` with a help message if nothing is found.
 */
export async function handleManifest() {
    try {
        const row = await query(`SELECT value FROM settings WHERE key = 'project.manifest'`);
        if (row.length > 0 && row[0].value) {
            return { manifest: JSON.parse(row[0].value) };
        }
    } catch { /* settings table may not exist */ }

    // Fall back to reading purpose/goals from individual settings
    try {
        const purpose = await query(`SELECT value FROM settings WHERE key = 'project.purpose'`);
        const goals = await query(`SELECT value FROM settings WHERE key = 'project.goals'`);
        if (purpose.length > 0 && purpose[0].value) {
            return {
                manifest: {
                    purpose: purpose[0].value,
                    goals: goals.length > 0 && goals[0].value ? JSON.parse(goals[0].value) : [],
                },
            };
        }
    } catch { /* settings table may not exist */ }

    return { manifest: null, message: 'No project manifest found. Use action: "interview" to create one.' };
}
