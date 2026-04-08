/**
 * Generic API gateway handler for the podbit.api MCP tool.
 *
 * Provides LLM access to:
 * - `tools`  — list all registered MCP tools (names + descriptions)
 * - `schema` — get the full input schema for a specific tool
 * - `call`   — execute any MCP tool by name with arbitrary params
 * - `routes` — list all HTTP API endpoints with method/path/description
 * - `http`   — call any HTTP API endpoint directly (method/path/body)
 *
 * This gives the LLM full access to the entire Podbit API surface
 * without needing a dedicated MCP tool for every operation.
 */

import { PORTS, localUrl } from '../config/ports.js';

/** Lazily resolve the security key. */
let _key: string | null = null;
async function getKey(): Promise<string> {
    if (_key !== null) return _key;
    try {
        const { getSecurityKey } = await import('../core/security.js');
        _key = await getSecurityKey();
    } catch { _key = ''; }
    return _key;
}

function baseUrl(): string {
    return `${localUrl(PORTS.api)}/api`;
}

export async function handleGenericApi(params: Record<string, any>): Promise<any> {
    const { action } = params;

    switch (action) {
        case 'tools':
            return handleTools();
        case 'schema':
            return handleSchema(params);
        case 'call':
            return handleCall(params);
        case 'routes':
            return handleRoutes();
        case 'http':
            return handleHttp(params);
        default:
            return { error: `Unknown action: ${action}. Valid: tools, schema, call, routes, http` };
    }
}

/** List all MCP tools with names and descriptions. */
async function handleTools(): Promise<any> {
    const { tools } = await import('../mcp/schemas.js');
    return {
        tools: tools.map((t: any) => ({
            name: t.name,
            description: t.description,
        })),
        count: tools.length,
        hint: 'Use podbit.api(action: "schema", tool: "<name>") to see full parameters for any tool, then podbit.api(action: "call", tool: "<name>", params: {...}) to execute it.',
    };
}

/** Get the full input schema for a specific tool. */
async function handleSchema(params: Record<string, any>): Promise<any> {
    const { tool } = params;
    if (!tool) return { error: 'tool is required' };

    const { tools } = await import('../mcp/schemas.js');
    const found = tools.find((t: any) => t.name === tool);
    if (!found) return { error: `Tool "${tool}" not found. Use podbit.api(action: "tools") to list available tools.` };

    return {
        name: found.name,
        description: found.description,
        inputSchema: found.inputSchema,
    };
}

/** Execute any MCP tool by name. */
async function handleCall(params: Record<string, any>): Promise<any> {
    const { tool, params: toolParams } = params;
    if (!tool) return { error: 'tool is required' };
    if (!toolParams || typeof toolParams !== 'object') return { error: 'params is required (object)' };

    const { handleToolCall } = await import('../mcp/dispatch.js');
    return handleToolCall(tool, toolParams);
}

/** List all HTTP API endpoints. */
async function handleRoutes(): Promise<any> {
    try {
        const { getRouteMetadata } = await import('../routes/route-metadata.js');
        return { routes: getRouteMetadata(), hint: 'Use podbit.api(action: "http", method: "GET", path: "/some/path") to call any endpoint.' };
    } catch {
        return { error: 'Route metadata not available. The HTTP server may not be running.' };
    }
}

/** Call any HTTP API endpoint directly. */
async function handleHttp(params: Record<string, any>): Promise<any> {
    const { method = 'GET', path, body, query: queryParams } = params;
    if (!path) return { error: 'path is required (e.g. "/models/registry")' };

    const key = await getKey();
    let url = `${baseUrl()}${path.startsWith('/') ? path : '/' + path}`;

    // Append query params
    if (queryParams && typeof queryParams === 'object') {
        const qs = new URLSearchParams(queryParams).toString();
        if (qs) url += `?${qs}`;
    }

    try {
        const fetchOpts: RequestInit = {
            method: method.toUpperCase(),
            headers: { 'Content-Type': 'application/json', 'x-podbit-key': key },
            signal: AbortSignal.timeout(60_000),
        };

        if (body && method.toUpperCase() !== 'GET') {
            fetchOpts.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOpts);
        const contentType = res.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            return await res.json();
        } else {
            const text = await res.text();
            return { status: res.status, body: text.slice(0, 5000) };
        }
    } catch (err: any) {
        return { error: `HTTP request failed: ${err.message}` };
    }
}
