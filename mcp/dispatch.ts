/**
 * @module mcp/dispatch
 *
 * MCP tool dispatch registry. Maps tool names to handler functions and
 * provides `handleToolCall()` as the single entry point.
 *
 * **Architecture**: When running in the MCP stdio process (MCP_STDIO_SERVER=1),
 * ALL tool calls are proxied to the HTTP server via POST /api/mcp/tool.
 * The HTTP server is the single source of truth — it owns the DB connection,
 * caches, event bus, and background services. The MCP stdio process only
 * falls back to direct handler execution when the HTTP server is unreachable.
 *
 * When running inside the HTTP server (routes/mcp-dispatch.ts), handlers
 * are called directly — no proxy, no recursion.
 */

import { proxyToolCall } from './http-proxy.js';

// ---------------------------------------------------------------------------
// Direct handler imports — used by the HTTP server process only.
// The MCP stdio process proxies through HTTP and never calls these directly
// (except as a fallback when the server is unreachable).
// ---------------------------------------------------------------------------

import { handleQuery, handleGet, handleLineage, handlePropose, handleRemove, handleEdit } from '../handlers/graph.js';
import { handleVoice, handlePromote } from '../handlers/elevation.js';
import { handleTensions, handleQuestion, handleValidate } from '../handlers/discovery.js';
import { handleAbstractPatterns } from '../handlers/abstract-patterns.js';
import { handleDedup } from '../handlers/dedup.js';
import { handleSummarize, handleCompress } from '../handlers/knowledge.js';
import { handleScaffoldTemplates, handleScaffoldDecompose, handleScaffoldGenerate } from '../handlers/scaffold-handlers.js';
import { handleStats, handlePending, handleComplete, handleSynthesisEngine, handlePartitions, handleContext } from '../handlers/governance.js';
import { handleConfig } from '../handlers/config-tune-handler.js';
import { handleFeedback } from '../handlers/feedback.js';
import { handleLabVerify } from '../handlers/evm.js';
import { handleElite } from '../handlers/elite.js';
import { handleKnowledgeBase } from '../handlers/knowledge-base.js';
import { handleProjects } from '../handlers/projects.js';
import { handleApiRegistry } from '../handlers/api-registry.js';
import { handleLab } from '../handlers/lab.js';
import { handleJournal } from '../handlers/journal.js';
import { handleGenericApi } from '../handlers/generic-api.js';
import { emitActivity } from '../services/event-bus.js';

// =============================================================================
// TOOL DISPATCH
// =============================================================================

/** Direct handler registry — used by HTTP server and as MCP fallback. */
const toolHandlers: Record<string, (params: Record<string, any>) => Promise<any>> = {
    'podbit.query': handleQuery,
    'podbit.get': handleGet,
    'podbit.lineage': handleLineage,
    'podbit.propose': handlePropose,
    'podbit.remove': handleRemove,
    'podbit.edit': handleEdit,
    'podbit.dedup': handleDedup,
    'podbit.voice': handleVoice,
    'podbit.promote': handlePromote,
    'podbit.stats': handleStats,
    'podbit.tensions': handleTensions,
    'podbit.question': handleQuestion,
    'podbit.validate': handleValidate,
    'podbit.patterns': handleAbstractPatterns,
    'podbit.pending': handlePending,
    'podbit.complete': handleComplete,
    'podbit.synthesis': handleSynthesisEngine,
    'podbit.summarize': handleSummarize,
    'podbit.compress': handleCompress,
    'podbit.partitions': handlePartitions,
    'podbit.context': handleContext,
    'podbit.config': handleConfig,
    'podbit.feedback': handleFeedback,
    'podbit.labVerify': handleLabVerify,
    'podbit.elite': handleElite,
    'podbit.kb': handleKnowledgeBase,
    'podbit.projects': handleProjects,
    'podbit.api': handleGenericApi,
    'podbit.apiRegistry': handleApiRegistry,
    'podbit.lab': handleLab,
    'podbit.journal': handleJournal,
    'docs.templates': handleScaffoldTemplates,
    'docs.decompose': handleScaffoldDecompose,
    'docs.generate': handleScaffoldGenerate,
};

/**
 * Dispatch a single MCP tool call.
 *
 * When running in MCP stdio (MCP_STDIO_SERVER=1), proxies to the HTTP
 * server first. Falls back to direct handler on connection failure.
 * When running in the HTTP server, always uses direct handlers.
 */
async function handleToolCall(name: string, params: Record<string, any>) {
    const handler = toolHandlers[name];
    if (!handler) {
        return { error: `Unknown tool: ${name}` };
    }

    // Activity event (emitted by caller — HTTP server or MCP stdio)
    const shortName = name.replace('podbit.', '').replace('docs.', '');
    const suffix = params.action ? `.${params.action}` : '';
    const textHint = params.text ? ` — "${params.text.slice(0, 60)}"` : '';
    const domainHint = params.domain ? ` [${params.domain}]` : '';

    // Try HTTP proxy first (only active in MCP stdio process)
    const proxied = await proxyToolCall(name, params);
    if (proxied !== null) {
        // Proxy succeeded — activity event was already emitted by the HTTP server
        return proxied;
    }

    // Direct execution (HTTP server process, or MCP fallback)
    emitActivity('mcp', 'tool_call', `${shortName}${suffix}${textHint}${domainHint}`);
    try {
        return await handler(params);
    } catch (err: any) {
        console.error(`Tool error (${name}):`, err);
        return { error: err.message };
    }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
    handleToolCall,

    // Direct handler re-exports — consumed by HTTP routes via mcp-server.ts
    handleQuery,
    handleGet,
    handleLineage,
    handlePropose,
    handleVoice,
    handlePromote,
    handleStats,
    handleTensions,
    handleQuestion,
    handleValidate,
    handleAbstractPatterns,
    handlePending,
    handleComplete,
    handleSynthesisEngine,
    handleSummarize,
    handleCompress,
    handleRemove,
    handleEdit,
    handleDedup,
    handlePartitions,
    handleContext,
    handleConfig,
    handleFeedback,

    handleScaffoldTemplates,
    handleScaffoldDecompose,
    handleScaffoldGenerate,
};
