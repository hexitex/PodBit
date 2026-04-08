/**
 * API Verification Registry — CRUD operations for the api_registry table.
 *
 * Registry entries persist in SHARED_TABLES across project switches.
 */

import { systemQuery as query, systemQueryOne as queryOne } from '../../core.js';
import { generateUuid } from '../../models/types.js';
import type { ApiRegistryEntry, ApiRegistryRow } from './types.js';

// =============================================================================
// ROW → ENTRY MAPPING
// =============================================================================

/** Maps a DB row (snake_case) to an ApiRegistryEntry (camelCase) for API consumers. */
function rowToEntry(row: ApiRegistryRow): ApiRegistryEntry {
    return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        description: row.description,
        enabled: row.enabled === 1,
        mode: (row.mode || 'verify') as ApiRegistryEntry['mode'],
        baseUrl: row.base_url,
        testUrl: row.test_url,
        authType: row.auth_type as ApiRegistryEntry['authType'],
        authKey: row.auth_key,
        authHeader: row.auth_header,
        maxRpm: row.max_rpm,
        maxConcurrent: row.max_concurrent,
        timeoutMs: row.timeout_ms,
        promptQuery: row.prompt_query,
        promptInterpret: row.prompt_interpret,
        promptExtract: row.prompt_extract,
        promptNotes: row.prompt_notes,
        responseFormat: row.response_format as ApiRegistryEntry['responseFormat'],
        maxResponseBytes: row.max_response_bytes,
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
        domains: row.domains ? JSON.parse(row.domains) : null,
        testCases: row.test_cases ? JSON.parse(row.test_cases) : null,
        onboardedAt: row.onboarded_at,
        onboardedBy: row.onboarded_by,
        totalCalls: row.total_calls,
        totalErrors: row.total_errors,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// =============================================================================
// LIST / GET
// =============================================================================

/**
 * Returns all API registry entries ordered by name.
 *
 * @returns Array of all ApiRegistryEntry records
 */
export async function listApis(): Promise<ApiRegistryEntry[]> {
    const rows = await query('SELECT * FROM api_registry ORDER BY name') as ApiRegistryRow[];
    return rows.map(rowToEntry);
}

/**
 * Returns a single API entry by id or null if not found.
 *
 * @param id - UUID of the API registry entry
 * @returns ApiRegistryEntry or null
 */
export async function getApi(id: string): Promise<ApiRegistryEntry | null> {
    const row = await queryOne('SELECT * FROM api_registry WHERE id = $1', [id]) as ApiRegistryRow | null;
    return row ? rowToEntry(row) : null;
}

/**
 * Returns a single API entry by name or null if not found.
 *
 * @param name - Unique API name (e.g., 'wikipedia', 'pubchem')
 * @returns ApiRegistryEntry or null
 */
export async function getApiByName(name: string): Promise<ApiRegistryEntry | null> {
    const row = await queryOne('SELECT * FROM api_registry WHERE name = $1', [name]) as ApiRegistryRow | null;
    return row ? rowToEntry(row) : null;
}

/** Returns only enabled API entries for verification/orchestrator use. */
export async function getEnabledApis(): Promise<ApiRegistryEntry[]> {
    const rows = await query('SELECT * FROM api_registry WHERE enabled = 1 ORDER BY name') as ApiRegistryRow[];
    return rows.map(rowToEntry);
}

// =============================================================================
// CREATE
// =============================================================================

/**
 * Inserts a new API registry entry and returns the created record.
 *
 * @param entry - API configuration with required name, displayName, and baseUrl
 * @returns The newly created ApiRegistryEntry
 */
export async function createApi(entry: {
    name: string;
    displayName: string;
    baseUrl: string;
    testUrl?: string;
    description?: string;
    mode?: string;
    authType?: string;
    authKey?: string;
    authHeader?: string;
    maxRpm?: number;
    maxConcurrent?: number;
    timeoutMs?: number;
    promptQuery?: string;
    promptInterpret?: string;
    promptExtract?: string;
    promptNotes?: string;
    responseFormat?: string;
    maxResponseBytes?: number;
    capabilities?: string[];
    domains?: string[];
    testCases?: any[];
    onboardedBy?: string;
}): Promise<ApiRegistryEntry> {
    const id = generateUuid();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    await query(`
        INSERT INTO api_registry (
            id, name, display_name, description, mode, base_url, test_url,
            auth_type, auth_key, auth_header,
            max_rpm, max_concurrent, timeout_ms,
            prompt_query, prompt_interpret, prompt_extract, prompt_notes,
            response_format, max_response_bytes,
            capabilities, domains, test_cases,
            onboarded_at, onboarded_by,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19,
            $20, $21, $22,
            $23, $24,
            $25, $26
        )
    `, [
        id, entry.name, entry.displayName, entry.description ?? null, entry.mode ?? 'verify', entry.baseUrl, entry.testUrl ?? null,
        entry.authType ?? 'none', entry.authKey ?? null, entry.authHeader ?? null,
        entry.maxRpm ?? 5, entry.maxConcurrent ?? 1, entry.timeoutMs ?? 30000,
        entry.promptQuery ?? null, entry.promptInterpret ?? null, entry.promptExtract ?? null, entry.promptNotes ?? null,
        entry.responseFormat ?? 'json', entry.maxResponseBytes ?? 65536,
        entry.capabilities ? JSON.stringify(entry.capabilities) : null,
        entry.domains ? JSON.stringify(entry.domains) : null,
        entry.testCases ? JSON.stringify(entry.testCases) : null,
        entry.onboardedBy ? now : null, entry.onboardedBy ?? null,
        now, now,
    ]);

    return (await getApi(id))!;
}

// =============================================================================
// UPDATE
// =============================================================================

/**
 * Updates an API entry with the given fields; returns the updated entry or null.
 *
 * @param id - UUID of the API entry to update
 * @param updates - Partial fields to update (only provided fields are changed)
 * @returns Updated ApiRegistryEntry, or null if not found
 */
export async function updateApi(id: string, updates: Partial<{
    name: string;
    displayName: string;
    description: string;
    enabled: boolean;
    mode: string;
    baseUrl: string;
    testUrl: string;
    authType: string;
    authKey: string;
    authHeader: string;
    maxRpm: number;
    maxConcurrent: number;
    timeoutMs: number;
    promptQuery: string;
    promptInterpret: string;
    promptExtract: string;
    promptNotes: string;
    responseFormat: string;
    maxResponseBytes: number;
    capabilities: string[];
    domains: string[];
    testCases: any[];
}>): Promise<ApiRegistryEntry | null> {
    const existing = await getApi(id);
    if (!existing) return null;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
        name: 'name',
        displayName: 'display_name',
        description: 'description',
        enabled: 'enabled',
        mode: 'mode',
        baseUrl: 'base_url',
        testUrl: 'test_url',
        authType: 'auth_type',
        authKey: 'auth_key',
        authHeader: 'auth_header',
        maxRpm: 'max_rpm',
        maxConcurrent: 'max_concurrent',
        timeoutMs: 'timeout_ms',
        promptQuery: 'prompt_query',
        promptInterpret: 'prompt_interpret',
        promptExtract: 'prompt_extract',
        promptNotes: 'prompt_notes',
        responseFormat: 'response_format',
        maxResponseBytes: 'max_response_bytes',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
        if (jsKey in updates) {
            let val = (updates as any)[jsKey];
            if (jsKey === 'enabled') val = val ? 1 : 0;
            sets.push(`${dbCol} = $${idx++}`);
            params.push(val);
        }
    }

    // JSON fields
    if ('capabilities' in updates) {
        sets.push(`capabilities = $${idx++}`);
        params.push(updates.capabilities ? JSON.stringify(updates.capabilities) : null);
    }
    if ('domains' in updates) {
        sets.push(`domains = $${idx++}`);
        params.push(updates.domains ? JSON.stringify(updates.domains) : null);
    }
    if ('testCases' in updates) {
        sets.push(`test_cases = $${idx++}`);
        params.push(updates.testCases ? JSON.stringify(updates.testCases) : null);
    }

    if (sets.length === 0) return existing;

    sets.push(`updated_at = $${idx++}`);
    params.push(new Date().toISOString().replace('T', ' ').replace('Z', ''));
    params.push(id);

    await query(`UPDATE api_registry SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    return (await getApi(id))!;
}

// =============================================================================
// DELETE
// =============================================================================

/**
 * Deletes an API and its prompt history; returns true if it existed.
 *
 * @param id - UUID of the API entry to delete
 * @returns True if the API was found and deleted, false if not found
 */
export async function deleteApi(id: string): Promise<boolean> {
    const existing = await getApi(id);
    if (!existing) return false;

    await query('DELETE FROM api_prompt_history WHERE api_id = $1', [id]);
    await query('DELETE FROM api_registry WHERE id = $1', [id]);
    return true;
}

// =============================================================================
// ENABLE / DISABLE
// =============================================================================

/**
 * Sets the enabled flag for an API; returns true if the API existed.
 *
 * @param id - UUID of the API entry
 * @param enabled - Whether to enable (true) or disable (false) the API
 * @returns True if the API was found and updated, false if not found
 */
export async function setApiEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = await updateApi(id, { enabled });
    return result !== null;
}

// =============================================================================
// CALL TRACKING
// =============================================================================

/**
 * Increments total_calls (and total_errors on failure) for the API.
 *
 * @param id - UUID of the API entry
 * @param success - True if the call succeeded, false if it failed
 */
export async function recordApiCall(id: string, success: boolean): Promise<void> {
    if (success) {
        await query(`
            UPDATE api_registry
            SET total_calls = total_calls + 1,
                updated_at = datetime('now')
            WHERE id = $1
        `, [id]);
    } else {
        await query(`
            UPDATE api_registry
            SET total_calls = total_calls + 1,
                total_errors = total_errors + 1,
                updated_at = datetime('now')
            WHERE id = $1
        `, [id]);
    }
}

// =============================================================================
// PROMPT HISTORY
// =============================================================================

/**
 * Appends a prompt version to api_prompt_history for audit/rollback.
 * Auto-increments the version number for the given api+field combination.
 *
 * @param apiId - UUID of the API entry
 * @param promptField - Which prompt field ('prompt_query', 'prompt_interpret', 'prompt_extract')
 * @param content - The prompt content to save
 * @param reason - Why this version was created (e.g., 'onboarding', 'manual edit')
 * @param contributor - Who created this version
 */
export async function savePromptVersion(
    apiId: string,
    promptField: string,
    content: string,
    reason: string,
    contributor: string,
): Promise<void> {
    // Get current max version for this api+field
    const current = await queryOne(
        'SELECT MAX(version) as max_ver FROM api_prompt_history WHERE api_id = $1 AND prompt_field = $2',
        [apiId, promptField],
    );
    const nextVersion = (current?.max_ver ?? 0) + 1;

    await query(`
        INSERT INTO api_prompt_history (api_id, prompt_field, content, version, reason, contributor)
        VALUES ($1, $2, $3, $4, $5, $6)
    `, [apiId, promptField, content, nextVersion, reason, contributor]);
}

/**
 * Returns prompt history for an API, optionally filtered by prompt field.
 * Results are ordered by version descending (newest first).
 *
 * @param apiId - UUID of the API entry
 * @param promptField - Optional field filter ('prompt_query', 'prompt_interpret', etc.)
 * @returns Array of prompt history records
 */
export async function getPromptHistory(
    apiId: string,
    promptField?: string,
): Promise<any[]> {
    if (promptField) {
        return query(
            'SELECT * FROM api_prompt_history WHERE api_id = $1 AND prompt_field = $2 ORDER BY version DESC',
            [apiId, promptField],
        );
    }
    return query(
        'SELECT * FROM api_prompt_history WHERE api_id = $1 ORDER BY prompt_field, version DESC',
        [apiId],
    );
}
