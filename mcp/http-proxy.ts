/**
 * @module mcp/http-proxy
 *
 * Generic HTTP proxy for MCP tool calls. When the MCP stdio process
 * (MCP_STDIO_SERVER=1) handles a tool call, it delegates to the HTTP
 * server's POST /api/mcp/tool endpoint instead of calling handlers
 * directly. This ensures the HTTP server (single source of truth)
 * processes all mutations — keeping its DB connection, caches, event
 * bus, and running cycles in sync.
 *
 * Falls back to null (caller should use direct handler) when the
 * HTTP server is unreachable.
 */

import { PORTS, localUrl } from '../config/ports.js';

let _cachedKey: string | null = null;

/** Lazily resolve the security key for HTTP forwarding. */
async function getKey(): Promise<string> {
    if (_cachedKey !== null) return _cachedKey;
    try {
        const { getSecurityKey } = await import('../core/security.js');
        _cachedKey = await getSecurityKey();
    } catch {
        _cachedKey = '';
    }
    return _cachedKey;
}

/** Build the base URL for the HTTP server API. */
function baseUrl(): string {
    return `${localUrl(PORTS.api)}/api`;
}

/**
 * Proxy a tool call to the HTTP server.
 *
 * @returns The parsed JSON result from the server, or `null` if the
 *          server is unreachable (caller should fall back to direct handler).
 */
export async function proxyToolCall(
    name: string,
    params: Record<string, any>,
): Promise<any | null> {
    // Only proxy from the MCP stdio process
    if (process.env.MCP_STDIO_SERVER !== '1') return null;

    const key = await getKey();
    const url = `${baseUrl()}/mcp/tool`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-podbit-key': key,
            },
            body: JSON.stringify({ name, params }),
            signal: AbortSignal.timeout(300_000), // 5 min for LLM-heavy tools
        });

        const data = await res.json();

        // After project switch, reload MCP process DB so subsequent calls
        // (including fallback-to-direct) use the correct project.
        if (name === 'podbit_projects') {
            const action = params.action;
            if ((action === 'load' || action === 'new') && data.success) {
                try {
                    const { switchProject, getProjectDir } = await import('../db.js');
                    const { clearAllCaches } = await import('../handlers/projects/services.js');
                    const path = await import('path');
                    const { readProjectsMeta } = await import('../handlers/projects/meta.js');
                    const projectName = readProjectsMeta().currentProject;
                    if (projectName) {
                        const dbPath = path.join(getProjectDir(), `${projectName}.db`);
                        await switchProject(dbPath);
                        await clearAllCaches();
                    }
                } catch (e: any) {
                    console.error(`[mcp/proxy] Post-switch DB reload failed: ${e.message}`);
                }
            }
        }

        return data;
    } catch (err: any) {
        console.error(`[mcp/proxy] HTTP server unreachable, falling back to direct: ${err.message}`);
        return null;
    }
}
