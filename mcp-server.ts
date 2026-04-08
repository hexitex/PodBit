/**
 * @module mcp-server
 *
 * Re-exports all MCP tool definitions and handler functions from `mcp/index.ts`.
 * This module serves as the public API surface for MCP tool registration,
 * consumed by `mcp-stdio.ts` to wire handlers into the MCP protocol server.
 */
export * from './mcp/index.js';
