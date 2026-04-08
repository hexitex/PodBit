/**
 * @module mcp
 *
 * MCP (Model Context Protocol) server entry point.
 *
 * Re-exports tool schemas (JSON Schema definitions for all MCP tools) and
 * handler functions (dispatch + individual tool handlers). The MCP server
 * uses these to register tools and route incoming tool calls to the
 * appropriate handler.
 */
export { tools } from './schemas.js';
export {
    handleToolCall,

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
} from './dispatch.js';
