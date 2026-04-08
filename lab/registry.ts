/**
 * Lab Registry — CRUD for registered lab servers.
 *
 * Lab registry lives in the SYSTEM DB (labs are infrastructure, not per-project).
 * Uses `systemQuery`/`systemQueryOne` for all database access.
 *
 * @module lab/registry
 */

import { randomUUID } from 'crypto';
import type { LabRegistryEntry, LabCapabilities, LabPortKey } from './types.js';
import { PORTS, localUrl } from '../config/ports.js';

/**
 * Resolve the effective URL for a lab. If `portKey` is set, the URL is built fresh from
 * `PORTS[portKey]` and the stored `storedUrl` column is ignored — this is what makes
 * built-in labs survive port changes without DB migrations. If `portKey` is null, the
 * stored URL is used as-is (for remote / user-added labs).
 */
function resolveLabUrl(portKey: LabPortKey | null, storedUrl: string): string {
    if (!portKey) return storedUrl;
    const port = PORTS[portKey];
    if (typeof port !== 'number') {
        // Unknown portKey — fall back to stored URL rather than crash
        return storedUrl;
    }
    return localUrl(port);
}

// =============================================================================
// DB HELPERS (lazy import to avoid circular deps)
// =============================================================================

async function sysQuery(sql: string, params: any[] = []): Promise<any[]> {
    const { systemQuery } = await import('../db/sqlite-backend.js');
    return systemQuery(sql, params);
}

async function sysQueryOne(sql: string, params: any[] = []): Promise<any | null> {
    const { systemQueryOne } = await import('../db/sqlite-backend.js');
    return systemQueryOne(sql, params);
}

async function sysExec(sql: string, params: any[] = []): Promise<void> {
    const { systemQuery } = await import('../db/sqlite-backend.js');
    await systemQuery(sql, params);
}

// =============================================================================
// ROW → ENTRY CONVERSION
// =============================================================================

function rowToEntry(row: any): LabRegistryEntry {
    const portKey = (row.port_key as LabPortKey | null) || null;
    return {
        id: row.id,
        name: row.name,
        description: row.description || null,
        url: resolveLabUrl(portKey, row.url),
        portKey,
        authType: row.auth_type || 'none',
        authCredential: row.auth_credential || null,
        authHeader: row.auth_header || 'Authorization',
        capabilities: parseJson(row.capabilities, {}),
        specTypes: parseJson(row.spec_types, []),
        queueLimit: row.queue_limit ?? null,
        artifactTtlSeconds: row.artifact_ttl_seconds ?? null,
        version: row.version || null,
        healthStatus: row.health_status || 'unknown',
        healthCheckedAt: row.health_checked_at || null,
        healthMessage: row.health_message || null,
        queueDepth: row.queue_depth ?? 0,
        enabled: !!row.enabled,
        priority: row.priority ?? 0,
        tags: parseJson(row.tags, []),
        templateId: row.template_id || null,
        contextPrompt: row.context_prompt || null,
        contextPromptEdited: !!row.context_prompt_edited,
        uiUrl: row.ui_url || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function parseJson(raw: string | null | undefined, fallback: any): any {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
}

// =============================================================================
// CRUD
// =============================================================================

export async function listLabs(filters?: { enabled?: boolean; healthStatus?: string }): Promise<LabRegistryEntry[]> {
    let sql = 'SELECT * FROM lab_registry';
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters?.enabled !== undefined) {
        conditions.push(`enabled = $${paramIdx++}`);
        params.push(filters.enabled ? 1 : 0);
    }
    if (filters?.healthStatus) {
        conditions.push(`health_status = $${paramIdx++}`);
        params.push(filters.healthStatus);
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY priority DESC, name ASC';

    const rows = await sysQuery(sql, params);
    return rows.map(rowToEntry);
}

export async function getLab(id: string): Promise<LabRegistryEntry | null> {
    const row = await sysQueryOne('SELECT * FROM lab_registry WHERE id = $1', [id]);
    return row ? rowToEntry(row) : null;
}

export async function createLab(data: {
    name: string;
    url: string;
    description?: string;
    authType?: string;
    authCredential?: string;
    authHeader?: string;
    specTypes?: string[];
    queueLimit?: number;
    artifactTtlSeconds?: number;
    priority?: number;
    tags?: string[];
    templateId?: string;
    uiUrl?: string;
    /** If set, the URL is overlaid from `PORTS[portKey]` at read time. Use for built-in / co-located labs. */
    portKey?: LabPortKey | null;
}): Promise<LabRegistryEntry> {
    const id = randomUUID();
    await sysExec(`
        INSERT INTO lab_registry (id, name, description, url, port_key, auth_type, auth_credential, auth_header, spec_types, queue_limit, artifact_ttl_seconds, priority, tags, template_id, ui_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
        id, data.name, data.description || null, data.url, data.portKey ?? null,
        data.authType || 'none', data.authCredential || null, data.authHeader || 'Authorization',
        JSON.stringify(data.specTypes || []),
        data.queueLimit ?? null, data.artifactTtlSeconds ?? null,
        data.priority ?? 0, JSON.stringify(data.tags || []),
        data.templateId || null, data.uiUrl || null,
    ]);
    return (await getLab(id))!;
}

export async function updateLab(id: string, changes: Partial<{
    name: string;
    description: string;
    url: string;
    authType: string;
    authCredential: string;
    authHeader: string;
    specTypes: string[];
    queueLimit: number | null;
    artifactTtlSeconds: number | null;
    priority: number;
    tags: string[];
    templateId: string | null;
    enabled: boolean;
    uiUrl: string | null;
    portKey: LabPortKey | null;
}>): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const map: Record<string, string> = {
        name: 'name', description: 'description', url: 'url',
        authType: 'auth_type', authCredential: 'auth_credential', authHeader: 'auth_header',
        queueLimit: 'queue_limit', artifactTtlSeconds: 'artifact_ttl_seconds',
        priority: 'priority', templateId: 'template_id', contextPrompt: 'context_prompt',
        uiUrl: 'ui_url', portKey: 'port_key',
    };

    for (const [key, col] of Object.entries(map)) {
        if ((changes as any)[key] !== undefined) {
            sets.push(`${col} = $${idx++}`);
            vals.push((changes as any)[key]);
        }
    }
    if (changes.specTypes !== undefined) {
        sets.push(`spec_types = $${idx++}`);
        vals.push(JSON.stringify(changes.specTypes));
    }
    if (changes.tags !== undefined) {
        sets.push(`tags = $${idx++}`);
        vals.push(JSON.stringify(changes.tags));
    }
    if (changes.enabled !== undefined) {
        sets.push(`enabled = $${idx++}`);
        vals.push(changes.enabled ? 1 : 0);
    }

    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await sysExec(`UPDATE lab_registry SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
}

export async function deleteLab(id: string): Promise<boolean> {
    const rows = await sysQuery('DELETE FROM lab_registry WHERE id = $1 RETURNING id', [id]);
    return rows.length > 0;
}

export async function enableLab(id: string): Promise<void> {
    await updateLab(id, { enabled: true });
}

export async function disableLab(id: string): Promise<void> {
    await updateLab(id, { enabled: false });
}

// =============================================================================
// HEALTH UPDATES
// =============================================================================

export async function updateLabHealth(id: string, status: string, message?: string, queueDepth?: number, capabilities?: LabCapabilities): Promise<void> {
    let idx = 1;
    const sets = [
        `health_status = $${idx++}`,
        "health_checked_at = datetime('now')",
    ];
    const vals: any[] = [status];

    if (message !== undefined) { sets.push(`health_message = $${idx++}`); vals.push(message); }
    if (queueDepth !== undefined) { sets.push(`queue_depth = $${idx++}`); vals.push(queueDepth); }
    if (capabilities) {
        sets.push(`capabilities = $${idx++}`);
        vals.push(JSON.stringify(capabilities));
        if (capabilities.specTypes) {
            // Normalize: if object (name→description), extract names for the spec_types column
            const specTypeNames = Array.isArray(capabilities.specTypes)
                ? capabilities.specTypes
                : Object.keys(capabilities.specTypes);
            sets.push(`spec_types = $${idx++}`);
            vals.push(JSON.stringify(specTypeNames));
        }
        if (capabilities.queueLimit !== undefined) {
            sets.push(`queue_limit = $${idx++}`);
            vals.push(capabilities.queueLimit);
        }
        if (capabilities.artifactTtlSeconds !== undefined) {
            sets.push(`artifact_ttl_seconds = $${idx++}`);
            vals.push(capabilities.artifactTtlSeconds);
        }
        if (capabilities.version) {
            sets.push(`version = $${idx++}`);
            vals.push(capabilities.version);
        }
    }

    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await sysExec(`UPDATE lab_registry SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

export async function getLabsForSpecType(specType: string): Promise<LabRegistryEntry[]> {
    const all = await listLabs({ enabled: true });
    return all.filter(lab =>
        lab.specTypes.includes(specType) || lab.specTypes.length === 0
    );
}

export async function getLabWithLowestQueue(specType: string): Promise<LabRegistryEntry | null> {
    const labs = await getLabsForSpecType(specType);
    if (labs.length === 0) return null;

    // Among healthy labs, pick highest priority then lowest queue depth
    const healthy = labs.filter(l => l.healthStatus === 'ok' || l.healthStatus === 'unknown');
    const candidates = healthy.length > 0 ? healthy : labs;

    candidates.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.queueDepth - b.queueDepth;
    });

    return candidates[0];
}
