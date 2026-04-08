#!/usr/bin/env node
/**
 * PODBIT - REMOTE MCP STDIO SERVER
 *
 * Lightweight MCP server that forwards all tool calls to a remote Podbit
 * API server over HTTP. No local database or dependencies required beyond
 * the MCP SDK.
 *
 * Usage:
 *   PODBIT_API_URL=https://my-server:4710 PODBIT_API_KEY=my-key npx tsx mcp-stdio-remote.ts
 *
 * Environment variables:
 *   PODBIT_API_URL  — Base URL of the remote Podbit API server (required)
 *   PODBIT_API_KEY  — Security key or JWT token for authentication (required for remote)
 *
 * Configure in .mcp.json or claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "podbit": {
 *         "command": "npx",
 *         "args": ["tsx", "mcp-stdio-remote.ts"],
 *         "env": {
 *           "PODBIT_API_URL": "https://my-server:4710",
 *           "PODBIT_API_KEY": "your-security-key"
 *         }
 *       }
 *     }
 *   }
 */

// ---------------------------------------------------------------------------
// EPIPE GUARD — same as mcp-stdio.ts
// ---------------------------------------------------------------------------
let _epipeDetected = false;

function _isEpipe(err: any): boolean {
    if (!err) return false;
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return true;
    if (err.errno === -4047) return true;
    if (err.message?.includes('EPIPE')) return true;
    return false;
}

function _epipeGuard(): void {
    if (_epipeDetected) return;
    _epipeDetected = true;
    setTimeout(() => process.exit(0), 5_000);
}

process.stdout?.on('error', (err: any) => { if (_isEpipe(err)) _epipeGuard(); });
process.stderr?.on('error', (err: any) => { if (_isEpipe(err)) _epipeGuard(); });

// ---------------------------------------------------------------------------

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = process.env.PODBIT_API_URL;
const API_KEY = process.env.PODBIT_API_KEY || '';
const INSECURE = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';

if (!API_URL) {
    console.error('[mcp-remote] ERROR: PODBIT_API_URL environment variable is required.');
    console.error('[mcp-remote] Example: PODBIT_API_URL=https://my-server:4710');
    process.exit(1);
}

console.error(`[mcp-remote] Connecting to: ${API_URL}`);
if (INSECURE) {
    console.error('[mcp-remote] TLS verification disabled (NODE_TLS_REJECT_UNAUTHORIZED=0)');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const headers: Record<string, string> = {
    'Content-Type': 'application/json',
};
if (API_KEY) {
    // Support both security key and JWT Bearer token
    if (API_KEY.startsWith('ey')) {
        headers['Authorization'] = `Bearer ${API_KEY}`;
    } else {
        headers['X-Podbit-Key'] = API_KEY;
    }
}

async function apiCall(path: string, body?: any): Promise<any> {
    const url = `${API_URL}/api${path}`;
    const opts: RequestInit = {
        method: body ? 'POST' : 'GET',
        headers,
        signal: AbortSignal.timeout(Number(process.env.PODBIT_API_TIMEOUT_MS) || 300_000), // 5 min default, configurable via PODBIT_API_TIMEOUT_MS
    };
    if (body) {
        opts.body = JSON.stringify(body);
    }

    const response = await fetch(url, opts);

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`API ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.json();
}

// ---------------------------------------------------------------------------
// Fetch tool schemas from remote server
// ---------------------------------------------------------------------------

let cachedTools: any[] | null = null;

async function getTools(): Promise<any[]> {
    if (cachedTools) return cachedTools;
    try {
        const data = await apiCall('/mcp/tools');
        cachedTools = data.tools || [];
        console.error(`[mcp-remote] Loaded ${cachedTools!.length} tool schemas from server`);
    } catch (err: any) {
        console.error(`[mcp-remote] Failed to fetch tool schemas: ${err.message}`);
        console.error('[mcp-remote] Using empty tool list — server may be unreachable');
        cachedTools = [];
    }
    return cachedTools!;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new Server(
    {
        name: 'podbit-remote',
        version: '2.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List tools — fetched from remote server
server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await getTools();
    return {
        tools: tools.map((tool: any) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        })),
    };
});

// Response size limit — same as local MCP
const MAX_MCP_RESPONSE = 80_000;

// Call tool — forward to remote API
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        const result = await apiCall('/mcp/tool', { name, params: args || {} });

        let serialized = JSON.stringify(result, null, 2);

        // Truncate oversized responses
        if (serialized.length > MAX_MCP_RESPONSE) {
            serialized = serialized.slice(0, MAX_MCP_RESPONSE) + '\n...(truncated)';
        }

        return {
            content: [{ type: 'text', text: serialized }],
        };
    } catch (err: any) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
            isError: true,
        };
    }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason: any) => {
    if (_epipeDetected) return;
    if (_isEpipe(reason)) return _epipeGuard();
    try { console.error('[mcp-remote] Unhandled rejection:', reason); } catch {}
});

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    if (_epipeDetected) return;
    if (_isEpipe(err)) return _epipeGuard();
    try { console.error('[mcp-remote] Uncaught exception:', err); } catch {}
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
    // Pre-fetch tool schemas to validate connectivity
    await getTools();

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[mcp-remote] MCP remote server started (stdio)');
}

main().catch(err => {
    console.error('[mcp-remote] Fatal error:', err);
    process.exit(1);
});
