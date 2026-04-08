/**
 * Tuning Registry -- saves and restores per-model subsystem inference params.
 *
 * When a model is swapped out of a subsystem, its tuned inference params
 * (temperature, topP, topK, minP) are saved. When swapped back in, they're restored.
 * Only subsystem-specific inference params are stored -- NOT the full config.
 *
 * Stored in the `tuning_registry` table (system DB). Each model has at most one entry
 * (keyed by model_id). The `parameters` JSON column holds only subsystem-prefixed params.
 * @module models/tuning-registry
 */

import { systemQuery as query, systemQueryOne as queryOne } from '../db.js';
import { loadSavedConfig, updateConfig } from '../config.js';
import { config } from '../config.js';
import {
    buildParamLookup,
    getNestedValue,
    setNestedValue,
    getApiBaseUrl,
    securedFetch,
    generateUuid,
} from '../handlers/config-tune/helpers.js';
import { emitActivity } from '../services/event-bus.js';

/** Prefixes for subsystem-specific inference params (the only params we save/restore). */
const SUBSYSTEM_PREFIXES = ['subsystemTemp.', 'subsystemTopP.', 'subsystemTopK.', 'subsystemMinP.'];

/**
 * Check whether a config path represents a subsystem-specific inference parameter.
 * @param pathStr - Dot-delimited config path (e.g. "subsystemTemp.voice")
 * @returns true if the path starts with a known subsystem prefix
 */
function isSubsystemParam(pathStr: string): boolean {
    return SUBSYSTEM_PREFIXES.some(prefix => pathStr.startsWith(prefix));
}

/**
 * Save subsystem inference params for a model being unassigned.
 * Only stores temp/topP/topK/minP -- not the full config.
 * Creates or updates the tuning_registry row for this model.
 * @param modelId - Registry model UUID
 * @param modelName - Human-readable model name (for display)
 * @param modelProvider - Provider key
 * @param subsystems - List of subsystem names this model was assigned to
 * @returns Object with saved status, registry ID, and count of parameters saved
 */
export async function saveToRegistry(
    modelId: string,
    modelName: string,
    modelProvider: string,
    subsystems: string[],
): Promise<{ saved: boolean; registryId: string; parameterCount: number }> {
    const paramLookup = buildParamLookup();
    const inferenceParams: Record<string, any> = {};

    for (const [pathStr, meta] of Object.entries(paramLookup)) {
        if (!isSubsystemParam(pathStr)) continue;
        const value = getNestedValue(config, meta.configPath);
        if (value !== undefined) {
            inferenceParams[pathStr] = value;
        }
    }

    let existing: any = null;
    try {
        existing = await queryOne(
            `SELECT id, tuning_changes FROM tuning_registry WHERE model_id = $1`,
            [modelId]
        );
    } catch (err: any) {
        if (err.message?.includes('no such table')) return { saved: false, registryId: '', parameterCount: 0 };
        throw err;
    }

    const id = existing?.id || generateUuid();
    const tuningChanges = existing?.tuning_changes ?? 0;

    await query(`
        INSERT INTO tuning_registry (id, model_id, model_name, model_provider, parameters, tuning_changes, subsystems, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))
        ON CONFLICT (model_id) DO UPDATE SET
            model_name = $3,
            model_provider = $4,
            parameters = $5,
            tuning_changes = $6,
            subsystems = $7,
            updated_at = datetime('now')
    `, [
        id, modelId, modelName, modelProvider,
        JSON.stringify(inferenceParams),
        tuningChanges, JSON.stringify(subsystems),
    ]);

    emitActivity('config', 'tuning_registry_save', `Saved inference params for ${modelName} (${Object.keys(inferenceParams).length} params)`);

    return { saved: true, registryId: id, parameterCount: Object.keys(inferenceParams).length };
}

/**
 * Restore subsystem inference params from the registry for a model being assigned.
 * Returns null if no registry entry exists (first time using this model).
 * When a subsystem is specified, only restores params for that subsystem.
 * Writes audit trail entries and syncs with the API server.
 * @param modelId - Registry model UUID to look up
 * @param subsystem - Optional: only restore params for this specific subsystem
 * @returns Object with restored status, registry ID, changes applied, and model name; or null if no entry
 */
export async function restoreFromRegistry(
    modelId: string,
    subsystem?: string,
): Promise<{ restored: boolean; registryId: string; changesApplied: number; modelName: string } | null> {
    const entry = await queryOne(
        `SELECT * FROM tuning_registry WHERE model_id = $1`,
        [modelId]
    );

    if (!entry) return null;

    const savedParams = JSON.parse(entry.parameters);
    const paramLookup = buildParamLookup();

    const updateObj: any = {};
    const restored: { configPath: string[]; oldValue: any; newValue: any; label: string }[] = [];

    for (const [pathStr, savedValue] of Object.entries(savedParams)) {
        const meta = paramLookup[pathStr];
        if (!meta) continue;
        if (!isSubsystemParam(pathStr)) continue;

        // If we know which subsystem is being assigned, only restore that one
        if (subsystem) {
            const paramSubsystem = SUBSYSTEM_PREFIXES.reduce((acc, prefix) =>
                pathStr.startsWith(prefix) ? pathStr.substring(prefix.length) : acc, '');
            if (paramSubsystem !== subsystem) continue;
        } else {
            // No subsystem specified — restore params for the registry's saved subsystems
            const savedSubsystems: string[] = JSON.parse(entry.subsystems || '[]');
            const paramSubsystem = SUBSYSTEM_PREFIXES.reduce((acc, prefix) =>
                pathStr.startsWith(prefix) ? pathStr.substring(prefix.length) : acc, '');
            if (!savedSubsystems.includes(paramSubsystem)) continue;
        }

        const currentValue = getNestedValue(config, meta.configPath);
        if (JSON.stringify(currentValue) === JSON.stringify(savedValue)) continue;

        setNestedValue(updateObj, meta.configPath, savedValue);
        restored.push({
            configPath: meta.configPath,
            oldValue: currentValue,
            newValue: savedValue,
            label: meta.label,
        });
    }

    if (restored.length > 0) {
        await loadSavedConfig();
        await updateConfig(updateObj);

        // Sync API server (best-effort)
        try {
            const base = getApiBaseUrl();
            const applyRes = await securedFetch(`${base}/api/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateObj),
            });
            if (!applyRes.ok) {
                console.warn('[tuning-registry] API server sync failed during restore (changes persisted to DB)');
            }
        } catch (err: any) {
            console.warn(`[tuning-registry] API server unreachable during restore: ${err.message}`);
        }

        // Write audit trail
        for (const r of restored) {
            const pathStr = r.configPath.join('.');
            const meta = paramLookup[pathStr];
            try {
                await query(`
                    INSERT INTO config_history
                    (config_path, old_value, new_value, changed_by, contributor, reason, section_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    pathStr,
                    JSON.stringify(r.oldValue),
                    JSON.stringify(r.newValue),
                    'system',
                    'tuning-registry',
                    `Auto-restored inference params for model: ${entry.model_name}`,
                    meta?.sectionId || null,
                ]);
            } catch (err: any) {
                console.error('[tuning-registry] Audit trail write failed:', err.message);
            }
        }
    }

    emitActivity('config', 'tuning_registry_restore',
        `Restored ${restored.length} inference params for ${entry.model_name}`);

    return {
        restored: restored.length > 0,
        registryId: entry.id,
        changesApplied: restored.length,
        modelName: entry.model_name,
    };
}

/**
 * Delete a tuning registry entry by its primary key.
 * @param registryId - The registry entry UUID to delete
 * @returns Always returns true (delete is idempotent)
 */
export async function deleteRegistryEntry(registryId: string): Promise<boolean> {
    await query(`DELETE FROM tuning_registry WHERE id = $1`, [registryId]);
    return true;
}

/**
 * Increment the tuning_changes counter for a model in the registry.
 * Called after each config change that affects this model's inference params.
 * @param modelId - Registry model UUID
 */
export async function incrementTuningChanges(modelId: string): Promise<void> {
    await query(
        `UPDATE tuning_registry SET tuning_changes = tuning_changes + 1, updated_at = datetime('now') WHERE model_id = $1`,
        [modelId]
    );
}
