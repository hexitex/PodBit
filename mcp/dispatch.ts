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
    'podbit_query': handleQuery,
    'podbit_get': handleGet,
    'podbit_lineage': handleLineage,
    'podbit_propose': handlePropose,
    'podbit_remove': handleRemove,
    'podbit_edit': handleEdit,
    'podbit_dedup': handleDedup,
    'podbit_voice': handleVoice,
    'podbit_promote': handlePromote,
    'podbit_stats': handleStats,
    'podbit_tensions': handleTensions,
    'podbit_question': handleQuestion,
    'podbit_validate': handleValidate,
    'podbit_patterns': handleAbstractPatterns,
    'podbit_pending': handlePending,
    'podbit_complete': handleComplete,
    'podbit_synthesis': handleSynthesisEngine,
    'podbit_summarize': handleSummarize,
    'podbit_compress': handleCompress,
    'podbit_partitions': handlePartitions,
    'podbit_context': handleContext,
    'podbit_config': handleConfig,
    'podbit_feedback': handleFeedback,
    'podbit_labVerify': handleLabVerify,
    'podbit_elite': handleElite,
    'podbit_kb': handleKnowledgeBase,
    'podbit_projects': handleProjects,
    'podbit_api': handleGenericApi,
    'podbit_apiRegistry': handleApiRegistry,
    'podbit_lab': handleLab,
    'podbit_journal': handleJournal,
    'docs_templates': handleScaffoldTemplates,
    'docs_decompose': handleScaffoldDecompose,
    'docs_generate': handleScaffoldGenerate,
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
    const shortName = name.replace('podbit_', '').replace('docs_', '');
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
