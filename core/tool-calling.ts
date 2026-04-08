/**
 * LLM Function Calling (Tool Use)
 *
 * Provides graph tools in OpenAI function calling format, tool execution
 * dispatch via existing MCP handlers, and an agent loop for iterative
 * tool use until the model produces a text response.
 */

import { emitActivity } from '../services/event-bus.js';
import { extractTextContent } from '../models/providers.js';
import { RC } from '../config/constants.js';
import type { CallWithMessagesOptions, CallWithMessagesResult } from '../models.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}

export interface ModelEntry {
    name: string;
    provider: string;
    model?: string;
    endpoint?: string;
    apiKey?: string;
}

export interface AgentLoopOptions {
    messages: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }>;
    model: ModelEntry;
    callOptions: CallWithMessagesOptions;
    tools: ToolDefinition[];
    maxIterations?: number;
    contextWindow?: number | null;
    onToolCall?: (toolName: string, args: any, result: any, durationMs: number) => void;
}

export interface AgentLoopResult {
    finalResponse: CallWithMessagesResult;
    toolCallsExecuted: Array<{
        iteration: number;
        toolName: string;
        args: any;
        result: any;
        durationMs: number;
    }>;
    iterations: number;
    aborted: boolean;
    fallbackReason?: string;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const READ_ONLY_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'graph_query',
            description: 'Search the knowledge graph for nodes. Call once per domain — do NOT combine multiple domains into one call.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Semantic search query (natural language)' },
                    domain: { type: 'string', description: 'A SINGLE domain name to filter by (e.g. "skincare" or "ai-rag"). Omit to search all domains.' },
                    nodeType: { type: 'string', enum: ['seed', 'proto', 'voiced', 'synthesis', 'breakthrough', 'question', 'raw'], description: 'Filter by node type' },
                    limit: { type: 'integer', description: 'Max results (default 10)', default: 10 },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_get',
            description: 'Retrieve a specific knowledge node by its UUID, including full content and metadata.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'UUID of the node' },
                },
                required: ['id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_summarize',
            description: 'Get a structured summary of the most important knowledge about a topic from the graph.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'Topic to summarize' },
                    domains: { type: 'array', items: { type: 'string' }, description: 'Optional domain filter' },
                },
                required: ['topic'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_compress',
            description: 'Generate a compressed meta-prompt capturing essential knowledge about a topic. Returns a dense system prompt.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'Topic to compress' },
                    task: { type: 'string', description: 'Optional task to focus the output on' },
                    domains: { type: 'array', items: { type: 'string' }, description: 'Optional domain filter' },
                },
                required: ['topic'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_tensions',
            description: 'Find contradicting knowledge pairs — nodes with high similarity but opposing claims. Great for discovering gaps.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'A SINGLE domain name to search within. Omit to find cross-domain tensions.' },
                    limit: { type: 'integer', description: 'Max results (default 5)', default: 5 },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_lineage',
            description: 'Get the parent and child relationships for a knowledge node.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'UUID of the node' },
                    depth: { type: 'integer', description: 'Generations to traverse (default 2)', default: 2 },
                },
                required: ['id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_voice',
            description: 'Get context for voicing a node — returns two nodes and synthesis instructions. Read the context, synthesize an insight, then call graph_propose with nodeType "voiced" to save it.',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'UUID of the node to voice' },
                    mode: { type: 'string', enum: ['object-following', 'sincere', 'cynic', 'pragmatist', 'child'], description: 'Voicing mode (default: object-following)' },
                },
                required: ['nodeId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_validate',
            description: 'Get context for validating whether a node is a genuine breakthrough. Returns the node, its sources, and scoring criteria. If it qualifies, use graph_promote to elevate it.',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'UUID of the node to validate' },
                },
                required: ['nodeId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_stats',
            description: 'Get statistics about the knowledge graph: node counts by type, domain distribution, synthesis health, and recent activity.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Filter stats by domain' },
                    days: { type: 'integer', description: 'Time window in days (default 7)', default: 7 },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_patterns',
            description: 'Find cross-domain connections via abstract patterns. Use action "search" to find patterns, "siblings" to find nodes sharing patterns with a node.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['search', 'siblings', 'stats'], description: 'Action to perform' },
                    query: { type: 'string', description: 'For search: semantic query to find patterns' },
                    nodeId: { type: 'string', description: 'For siblings: UUID of the node' },
                    limit: { type: 'integer', description: 'Max results (default 10)', default: 10 },
                },
                required: ['action'],
            },
        },
    },
];

const WRITE_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'graph_propose',
            description: 'Add new knowledge to the graph. Use nodeType "seed" for facts/research, "synthesis" for insights from existing nodes, "voiced" for cross-node synthesis, "question" for research gaps. Always provide a domain.',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The knowledge content to add' },
                    nodeType: { type: 'string', enum: ['seed', 'synthesis', 'voiced', 'question'], description: 'Type of node' },
                    domain: { type: 'string', description: 'A SINGLE domain name to add to (must match an existing domain)' },
                    contributor: { type: 'string', description: 'Who is proposing this', default: 'llm' },
                    parentIds: { type: 'array', items: { type: 'string' }, description: 'UUIDs of parent nodes that inspired this' },
                },
                required: ['content', 'nodeType', 'contributor'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_promote',
            description: 'Promote a node to breakthrough status. Use this when a node represents a genuinely novel insight with high synthesis quality. Increases the node weight significantly.',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'UUID of the node to promote' },
                    reason: { type: 'string', description: 'Why this node deserves breakthrough status' },
                    contributor: { type: 'string', description: 'Who is promoting', default: 'llm' },
                    scores: {
                        type: 'object',
                        description: 'Validation scores (each 0-10)',
                        properties: {
                            synthesis: { type: 'number', description: 'Quality of cross-domain synthesis' },
                            novelty: { type: 'number', description: 'How genuinely new is this insight' },
                            testability: { type: 'number', description: 'Can this be verified or applied' },
                            tension_resolution: { type: 'number', description: 'Does it resolve a known contradiction' },
                        },
                    },
                },
                required: ['nodeId', 'reason', 'contributor'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_dedup',
            description: 'Find and archive duplicate nodes. Always run with dryRun=true first to preview clusters, then examine nodes before archiving.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Domain to check (omit for all domains)' },
                    dryRun: { type: 'boolean', description: 'Preview only — do not archive (default true)', default: true },
                    embeddingThreshold: { type: 'number', description: 'Cosine similarity threshold (default 0.90)', default: 0.90 },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_remove',
            description: 'Remove a node from the graph. Use mode "archive" for soft-delete, "junk" to also prevent similar future content.',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'UUID of the node to remove' },
                    mode: { type: 'string', enum: ['archive', 'junk'], description: 'archive = soft-delete, junk = archive + negative filter (default: archive)', default: 'archive' },
                    reason: { type: 'string', description: 'Why this node is being removed' },
                },
                required: ['nodeId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'graph_feedback',
            description: 'Rate a node\'s quality. Useful=+weight, not_useful=-weight, harmful=--weight. Helps improve graph quality over time.',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['rate'], description: 'Action (currently only "rate")' },
                    nodeId: { type: 'string', description: 'UUID of the node to rate' },
                    rating: { type: 'integer', enum: [1, 0, -1], description: '1=useful, 0=not useful, -1=harmful' },
                    note: { type: 'string', description: 'Explanation for the rating' },
                    contributor: { type: 'string', description: 'Who is rating', default: 'llm' },
                    source: { type: 'string', enum: ['agent'], description: 'Source of feedback', default: 'agent' },
                },
                required: ['action', 'nodeId', 'rating'],
            },
        },
    },
];

/**
 * Build the array of tool definitions in OpenAI function-calling format.
 *
 * In `'read-only'` mode only query/retrieval tools are returned (safe for
 * untrusted callers). `'read-write'` adds mutation tools (propose, promote,
 * dedup, remove, feedback). The returned array is a fresh copy each call
 * so callers can safely mutate it.
 *
 * @param mode - `'read-only'` (default) or `'read-write'`.
 * @returns An array of {@link ToolDefinition} objects.
 */
export function getToolDefinitions(mode: 'read-only' | 'read-write' = 'read-only'): ToolDefinition[] {
    if (mode === 'read-write') {
        return [...READ_ONLY_TOOLS, ...WRITE_TOOLS];
    }
    return [...READ_ONLY_TOOLS];
}

/**
 * Estimate the token cost of injecting tool definitions into a prompt.
 *
 * Uses the heuristic of ~3 characters per token (conservative for most
 * tokenizers). Called by {@link runAgentLoop} before each LLM call to
 * check whether the conversation + tools still fit within the context window.
 *
 * @param tools - The tool definition array to measure.
 * @returns Estimated token count.
 */
export function estimateToolTokens(tools: ToolDefinition[]): number {
    const jsonLength = JSON.stringify(tools).length;
    return Math.ceil(jsonLength / 3);
}

// =============================================================================
// TOOL EXECUTION
// =============================================================================

/** Map external tool names to internal handler functions */
const TOOL_HANDLER_MAP: Record<string, { module: string; handler: string }> = {
    // Read-only
    'graph_query':     { module: '../handlers/graph.js',      handler: 'handleQuery' },
    'graph_get':       { module: '../handlers/graph.js',      handler: 'handleGet' },
    'graph_lineage':   { module: '../handlers/graph.js',      handler: 'handleLineage' },
    'graph_summarize': { module: '../handlers/knowledge.js',  handler: 'handleSummarize' },
    'graph_compress':  { module: '../handlers/knowledge.js',  handler: 'handleCompress' },
    'graph_tensions':  { module: '../handlers/discovery.js',  handler: 'handleTensions' },
    'graph_voice':     { module: '../handlers/elevation.js',  handler: 'handleVoice' },
    'graph_validate':  { module: '../handlers/discovery.js',  handler: 'handleValidate' },
    'graph_stats':     { module: '../handlers/governance.js', handler: 'handleStats' },
    'graph_patterns':  { module: '../handlers/abstract-patterns.js', handler: 'handleAbstractPatterns' },
    // Write
    'graph_propose':   { module: '../handlers/graph.js',      handler: 'handlePropose' },
    'graph_promote':   { module: '../handlers/elevation.js',  handler: 'handlePromote' },
    'graph_dedup':     { module: '../handlers/dedup.js',      handler: 'handleDedup' },
    'graph_remove':    { module: '../handlers/graph.js',      handler: 'handleRemove' },
    'graph_feedback':  { module: '../handlers/feedback.js',   handler: 'handleFeedback' },
};

/** Max characters for a single tool result before truncation */
const MAX_RESULT_CHARS = RC.contentLimits.toolResultCharLimit;

/**
 * Execute a single tool call by dynamically importing and invoking the
 * corresponding MCP handler function.
 *
 * Tool names are mapped to handler modules via {@link TOOL_HANDLER_MAP}.
 * The handler's return value is JSON-serialized and truncated to
 * {@link MAX_RESULT_CHARS} to prevent blowing the context budget on
 * subsequent LLM calls.
 *
 * @param toolName - The function name from the LLM's `tool_calls` array.
 * @param args - Parsed arguments object for the tool.
 * @returns `{ success, result, error? }` -- never throws.
 */
export async function executeToolCall(
    toolName: string,
    args: Record<string, any>,
): Promise<{ success: boolean; result: any; error?: string }> {
    const mapping = TOOL_HANDLER_MAP[toolName];
    if (!mapping) {
        return { success: false, result: null, error: `Unknown tool: ${toolName}` };
    }

    try {
        const mod = await import(mapping.module);
        const handler = mod[mapping.handler];
        if (!handler) {
            return { success: false, result: null, error: `Handler ${mapping.handler} not found in ${mapping.module}` };
        }

        const result = await handler(args);

        // Truncate large results to stay within token budget
        const serialized = JSON.stringify(result);
        if (serialized.length > MAX_RESULT_CHARS) {
            const truncated = serialized.slice(0, MAX_RESULT_CHARS) + '...(truncated)';
            return { success: true, result: JSON.parse(JSON.stringify({ _truncated: true, data: truncated })) };
        }

        return { success: true, result };
    } catch (err: any) {
        return { success: false, result: null, error: err.message };
    }
}

// =============================================================================
// AGENT LOOP
// =============================================================================

/**
 * Run an iterative agent loop: call the LLM with tool definitions, execute
 * any requested tool calls, append tool results to the conversation, and
 * repeat until the model produces a final text response.
 *
 * **Stopping conditions** (checked each iteration):
 * 1. The model returns a message with no `tool_calls` (natural completion).
 * 2. `maxIterations` is reached -- a forced "answer now" user message is
 *    injected and the LLM is called one last time without tools.
 * 3. The estimated token usage exceeds 85% of `contextWindow` -- same
 *    forced-text behaviour as (2).
 *
 * **Error handling:**
 * - If the first LLM call fails with a tool-related error (400/422),
 *   the model is marked as non-tool-capable in the DB and a tool-free
 *   retry is attempted (returned as `fallbackReason: 'model_unsupported'`).
 * - If an API call fails mid-loop (after tools have already been executed),
 *   a tool-free fallback call is made so the model can summarize the
 *   results gathered so far (`fallbackReason: 'mid_loop_api_failure'`).
 * - If both the mid-loop call and its fallback fail, the original error
 *   is re-thrown.
 *
 * @param options - See {@link AgentLoopOptions}.
 * @returns See {@link AgentLoopResult}.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
    const {
        model,
        callOptions,
        tools,
        maxIterations = 5,
        contextWindow,
        onToolCall,
    } = options;

    // Clone messages to avoid mutating caller's data
    const messages = [...options.messages];
    const toolCallsExecuted: AgentLoopResult['toolCallsExecuted'] = [];
    let iterations = 0;

    // Lazy import to avoid circular dependency
    const { callWithMessages } = await import('../models.js');

    // First call — may fail if model doesn't support tools
    let result: CallWithMessagesResult;
    try {
        result = await callWithMessages(messages as any, model as any, {
            ...callOptions,
            tools,
            tool_choice: 'auto',
        });
    } catch (err: any) {
        // Check if the error is because the model doesn't support tools
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('tool') || msg.includes('function') || msg.includes('400') || msg.includes('422')) {
            console.warn(`[tool-calling] Model does not support tools, falling back: ${err.message}`);

            // Try to mark in DB
            try {
                const { updateRegisteredModel } = await import('../models.js');
                if ((model as any)._registryId) {
                    await updateRegisteredModel((model as any)._registryId, { supportsTools: false });
                }
            } catch { /* best effort */ }

            // Retry without tools
            result = await callWithMessages(messages as any, model as any, callOptions);
            return {
                finalResponse: result,
                toolCallsExecuted: [],
                iterations: 0,
                aborted: false,
                fallbackReason: 'model_unsupported',
            };
        }
        throw err;
    }

    while (iterations < maxIterations) {
        const choice = result.choices[0];
        if (!choice) break;

        // If no tool calls, we have a final text response
        const toolCalls = choice.message?.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            return {
                finalResponse: result,
                toolCallsExecuted,
                iterations,
                aborted: false,
            };
        }

        // Model wants to call tools — append assistant message
        messages.push({
            role: 'assistant',
            content: choice.message.content,
            tool_calls: toolCalls,
        });

        // Execute each tool call
        for (const tc of toolCalls) {
            const funcName = tc.function?.name;
            let args: Record<string, any> = {};
            try {
                args = JSON.parse(tc.function?.arguments || '{}');
            } catch {
                args = {};
            }

            const start = Date.now();
            const execResult = await executeToolCall(funcName, args);
            const durationMs = Date.now() - start;

            // Append tool result message (OpenAI spec)
            messages.push({
                role: 'tool' as any,
                tool_call_id: tc.id,
                name: funcName,
                content: JSON.stringify(execResult.success ? execResult.result : { error: execResult.error }),
            });

            toolCallsExecuted.push({
                iteration: iterations,
                toolName: funcName,
                args,
                result: execResult.result,
                durationMs,
            });

            emitActivity('llm', 'tool_exec', `${funcName}(${Object.keys(args).join(', ')})`, {
                tool: funcName,
                args,
                success: execResult.success,
                durationMs,
            });

            if (onToolCall) {
                onToolCall(funcName, args, execResult.result, durationMs);
            }
        }

        iterations++;

        // Context budget check — abort if approaching limit
        if (contextWindow) {
            const estTokens = estimateMessageTokens(messages) + estimateToolTokens(tools);
            if (estTokens > contextWindow * 0.85) {
                console.warn(`[tool-calling] Approaching context limit (~${estTokens}/${contextWindow} tokens), forcing text response`);
                break;
            }
        }

        // Next iteration — call LLM again with tool results
        try {
            result = await callWithMessages(messages as any, model as any, {
                ...callOptions,
                tools,
                tool_choice: 'auto',
            });
        } catch (loopErr: any) {
            // Mid-loop API failure — don't throw away tool results from earlier iterations.
            // Force a text-only response so the model summarizes what it found so far.
            console.warn(`[tool-calling] API call failed mid-loop (iteration ${iterations}): ${loopErr.message} — forcing text response from accumulated tool results`);
            emitActivity('llm', 'tool_loop_error', `API call failed, summarizing ${toolCallsExecuted.length} tool results`, {
                iteration: iterations,
                error: loopErr.message?.slice(0, 100),
                toolCallsSoFar: toolCallsExecuted.length,
            });
            try {
                result = await callWithMessages(messages as any, model as any, {
                    ...callOptions,
                    // No tools — force text summary of accumulated results
                });
                return {
                    finalResponse: result,
                    toolCallsExecuted,
                    iterations,
                    aborted: true,
                    fallbackReason: 'mid_loop_api_failure',
                };
            } catch (fallbackErr: any) {
                // Even the fallback failed — give up
                console.error(`[tool-calling] Fallback text call also failed: ${fallbackErr.message}`);
                throw loopErr;
            }
        }
    }

    // Hit max iterations or context limit — force a text response
    const choice = result.choices[0];
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        console.warn(`[tool-calling] Max iterations (${maxIterations}) reached, forcing text response`);

        // Tell the model explicitly to stop calling tools and answer
        messages.push({
            role: 'user' as any,
            content: 'You have used all your available tool calls. Do NOT request any more tools. Based on the information you have gathered so far, provide your complete answer now.',
        });

        result = await callWithMessages(messages as any, model as any, {
            ...callOptions,
            // No tools — force text output
        });
    }

    // If the forced text response is still empty, synthesize from intermediate assistant text
    const forcedContent = extractTextContent(result.choices[0]?.message?.content);
    if (!forcedContent && toolCallsExecuted.length > 0) {
        console.warn(`[tool-calling] Forced text response was empty, synthesizing from ${toolCallsExecuted.length} tool call results`);

        // Collect intermediate assistant text from the messages array
        const intermediateTexts: string[] = [];
        for (const msg of messages) {
            if (msg.role === 'assistant' && msg.content) {
                const text = typeof msg.content === 'string' ? msg.content : extractTextContent(msg.content);
                if (text) intermediateTexts.push(text);
            }
        }

        // Build a fallback response from tool results
        const toolSummary = toolCallsExecuted
            .map(tc => {
                const resultStr = JSON.stringify(tc.result);
                const truncated = resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr;
                return `**${tc.toolName}**: ${truncated}`;
            })
            .join('\n\n');

        const fallbackContent = intermediateTexts.length > 0
            ? `${intermediateTexts.join(' ')}\n\n---\n*Tool results (model failed to summarize):*\n\n${toolSummary}`
            : `*The model used ${toolCallsExecuted.length} tool calls but failed to produce a summary. Raw results:*\n\n${toolSummary}`;

        // Inject fallback content into the result
        if (result.choices[0]?.message) {
            result.choices[0].message.content = fallbackContent;
        }
    }

    return {
        finalResponse: result,
        toolCallsExecuted,
        iterations,
        aborted: iterations >= maxIterations,
    };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Estimate total token usage of a message array using the ~3 chars/token
 * heuristic, adding 20 chars of overhead per message for chat template
 * wrapping. Also accounts for `tool_calls` payloads on assistant messages.
 *
 * @param messages - The conversation history (user, assistant, tool messages).
 * @returns Estimated token count for the entire array.
 */
function estimateMessageTokens(messages: Array<{ role: string; content: any }>): number {
    let chars = 0;
    for (const msg of messages) {
        const content = msg.content;
        if (typeof content === 'string') {
            chars += content.length + 20;
        } else if (content) {
            chars += JSON.stringify(content).length + 20;
        } else {
            chars += 20;
        }
        // tool_calls add tokens too
        if ((msg as any).tool_calls) {
            chars += JSON.stringify((msg as any).tool_calls).length;
        }
    }
    return Math.ceil(chars / 3);
}
