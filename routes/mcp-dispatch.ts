/**
 * MCP tool dispatch route.
 *
 * POST /mcp/tool — Accepts { name, params } and dispatches to the MCP tool handler.
 * Used by the remote MCP stdio server (mcp-stdio-remote.ts) to forward tool calls
 * from a client machine to the API server over HTTP.
 *
 * Also exposes GET /mcp/tools to list available tool schemas.
 *
 * Auth: same as all /api routes (requireKey middleware in server.ts).
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { handleToolCall } from '../mcp/dispatch.js';
import { tools } from '../mcp/schemas.js';

const router = Router();

/** List available MCP tools (schemas only, no execution). */
router.get('/mcp/tools', (_req, res) => {
    res.json({ tools });
});

/** Dispatch a single MCP tool call. */
router.post('/mcp/tool', asyncHandler(async (req, res) => {
    const { name, params } = req.body;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "name" field' });
    }

    const result = await handleToolCall(name, params || {});
    res.json(result);
}));

export default router;
