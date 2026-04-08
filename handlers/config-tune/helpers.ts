/**
 * Config tuning — utility helpers.
 */
import { queryOne } from '../../core.js';
import { withinDays } from '../../db/sql.js';
import { config } from '../../config.js';
import { SECTION_METADATA, type ParameterMeta } from '../../config-sections.js';
import { getSecurityKey } from '../../core/security.js';

/** Base URL of the HTTP API (host:port) for MCP→server requests. */
export function getApiBaseUrl() {
    return `http://${config.server.host}:${config.server.port}`;
}

/**
 * Fetch wrapper that injects the X-Podbit-Key header for authenticated API calls.
 * Use this for all MCP → HTTP server requests.
 */
export async function securedFetch(url: string, init?: RequestInit): Promise<Response> {
    const key = await getSecurityKey();
    const headers = new Headers(init?.headers);
    headers.set('x-podbit-key', key);
    if (!headers.has('content-type') && init?.method && init.method !== 'GET') {
        headers.set('content-type', 'application/json');
    }
    return fetch(url, { ...init, headers });
}

/** Generates a v4-style UUID without crypto dependency (for snapshots and audit IDs). */
export function generateUuid(): string {
    const hex = (n: number): string => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    return `${hex(4)}-${hex(2)}-4${hex(2).substring(1)}-${((parseInt(hex(1), 16) & 0x3) | 0x8).toString(16)}${hex(2).substring(1)}-${hex(6)}`;
}

/** Build a lookup from dotted config path to parameter metadata + section ID. */
export function buildParamLookup(): Record<string, ParameterMeta & { sectionId: string }> {
    const lookup: Record<string, ParameterMeta & { sectionId: string }> = {};
    for (const [sectionId, section] of Object.entries(SECTION_METADATA)) {
        for (const param of section.parameters) {
            const pathStr = param.configPath.join('.');
            lookup[pathStr] = { ...param, sectionId };
        }
    }
    return lookup;
}

/** Read a nested value from an object by path array. */
export function getNestedValue(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
}

/** Set a nested value in an object by path array, creating intermediates. */
export function setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]] || typeof current[path[i]] !== 'object') {
            current[path[i]] = {};
        }
        current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
}

/** Get lightweight quality metrics for audit trail snapshots. */
export async function getQuickMetrics(): Promise<Record<string, any>> {
    try {
        const synthesisStats = await queryOne(`
            SELECT
                COUNT(*) as total_cycles,
                SUM(CASE WHEN dc.created_child = 1
                      AND dc.child_node_id IS NOT NULL
                      AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                    THEN 1 ELSE 0 END) as children_created,
                AVG(dc.resonance_score) as avg_resonance
            FROM dream_cycles dc
            WHERE ${withinDays('dc.started_at', '$1')}
        `, [7]);

        const nodeStats = await queryOne(`
            SELECT COUNT(*) as total, AVG(weight) as avg_weight, AVG(specificity) as avg_specificity
            FROM nodes WHERE archived = 0 AND node_type != 'raw'
        `);

        const total = parseInt(synthesisStats?.total_cycles, 10) || 0;
        const created = parseInt(synthesisStats?.children_created, 10) || 0;

        return {
            synthesisSuccessRate: total > 0 ? Math.round((created / total) * 1000) / 1000 : null,
            avgResonance: parseFloat(synthesisStats?.avg_resonance) || null,
            totalNodes: parseInt(nodeStats?.total, 10) || 0,
            avgWeight: parseFloat(nodeStats?.avg_weight) || null,
            avgSpecificity: parseFloat(nodeStats?.avg_specificity) || null,
            capturedAt: new Date().toISOString(),
        };
    } catch {
        return { capturedAt: new Date().toISOString(), error: 'metrics unavailable' };
    }
}
