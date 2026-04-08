/**
 * @module routes/chat/tools
 *
 * Tool-calling agent loop for chat.  When tool calling is enabled and a
 * compatible model is assigned to the `chat` subsystem, messages are routed
 * through an iterative agent loop that can invoke graph query/compress/get
 * tools before generating a final response.
 */

import { query } from '../../db.js';
import { getPrompt } from '../../prompts.js';
import { extractTextContent } from '../../models/providers.js';
import { chatSettings, } from './settings.js';

/**
 * Routes a message through the tool-calling agent loop.
 *
 * The function checks that a model is assigned to the `chat` subsystem and
 * that it supports tool calling, then runs the multi-iteration agent loop
 * (`runAgentLoop`).  After the loop completes, tool call findings are
 * extracted into a concise `toolContext` string that gets persisted in
 * conversation history for multi-turn continuity.
 *
 * @param message              - The user's message text.
 * @param ctxResult            - Context engine `prepare()` result (provides system prompt / knowledge).
 * @param conversationMessages - Prior conversation messages for multi-turn context.
 * @returns A response object with `response`, `type`, and `metadata`; or `null` if the
 *          agent loop is unavailable (no model, model doesn't support tools, or error).
 */
export async function handleChatWithTools(
    message: string,
    ctxResult?: any,
    conversationMessages?: Array<{ role: string; content: string }>
): Promise<{ response: string; type: string; metadata: any } | null> {
    try {
        const { getSubsystemAssignments } = await import('../../models.js');
        const assignments = await getSubsystemAssignments();
        const chatModel = assignments.chat;

        if (!chatModel) {
            console.warn('[chat] Tool calling enabled but no model assigned to "chat" subsystem');
            return null;
        }
        if (chatModel.supportsTools === false) {
            console.warn('[chat] Tool calling enabled but chat model marked as supportsTools=false');
            return null;
        }

        console.log(`[chat] Tool calling active — model=${chatModel.name}, mode=${chatSettings.toolCallingMode}, maxIter=${chatSettings.toolCallingMaxIterations}`);
        const { getToolDefinitions, runAgentLoop } = await import('../../core/tool-calling.js');
        const tools = getToolDefinitions(chatSettings.toolCallingMode);

        // Strip slash command prefix so the LLM gets a natural query
        // e.g. "/research quantum computing" → "Research quantum computing"
        let userMessage = message;
        const slashMatch = message.match(/^\/(\w+)\s+(.*)/s);
        if (slashMatch) {
            const action = slashMatch[1];
            const topic = slashMatch[2];
            userMessage = `${action.charAt(0).toUpperCase() + action.slice(1)} ${topic}`;
        }

        // Fetch available domains and node counts so the LLM knows what to query
        let domainInfo = '';
        try {
            const rows = await query(
                `SELECT domain, COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND domain IS NOT NULL GROUP BY domain ORDER BY cnt DESC`,
                []
            );
            domainInfo = rows.map((r: any) => `  ${r.domain} (${r.cnt} nodes)`).join('\n');
        } catch { /* non-critical */ }

        // Get project manifest for context
        let projectContext = '';
        try {
            const { getProjectContextBlock } = await import('../../core/project-context.js');
            projectContext = await getProjectContextBlock() || '';
        } catch { /* non-critical */ }

        const knowledgeBlock = ctxResult?.systemPrompt || '';

        const systemPrompt = await getPrompt('chat.tool_system', {
            projectContext: projectContext ? '\n' + projectContext : '',
            knowledgeBlock: knowledgeBlock || 'No pre-loaded knowledge for this turn. Use your tools to find relevant information.',
            domainInfo: domainInfo || 'No domains found — the graph may be empty.',
        });

        const chatMessages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];
        // Limit conversation history to last 20 messages to keep context manageable
        if (conversationMessages) {
            const recentMessages = conversationMessages.slice(-20);
            for (const m of recentMessages) {
                chatMessages.push({ role: m.role, content: m.content });
            }
        }
        chatMessages.push({ role: 'user', content: userMessage });

        const modelEntry = {
            name: chatModel.modelId,
            provider: chatModel.provider,
            model: chatModel.modelId,
            endpoint: chatModel.endpointUrl || undefined,
            apiKey: chatModel.apiKey || undefined,
            noThink: chatModel.noThink || false,
            _registryId: chatModel.id,
            _maxConcurrency: chatModel.maxConcurrency ?? 1,
            _requestPauseMs: chatModel.requestPauseMs ?? 0,
        };

        const loopResult = await runAgentLoop({
            messages: chatMessages,
            model: modelEntry,
            callOptions: {},
            tools,
            maxIterations: chatSettings.toolCallingMaxIterations,
            contextWindow: chatModel.contextSize,
        });

        const rawContent = loopResult.finalResponse.choices[0]?.message?.content;
        const responseText = extractTextContent(rawContent);
        const toolCallSummary = loopResult.toolCallsExecuted.map(tc => ({
            name: tc.toolName,
            args: tc.args,
            durationMs: tc.durationMs,
        }));

        // Build concise tool context for conversation history continuity.
        // On subsequent turns the model only sees saved message content — not tool results.
        // Embedding key findings here lets multi-turn follow-ups work.
        let toolContext: string | undefined;
        if (loopResult.toolCallsExecuted.length > 0) {
            const findings = loopResult.toolCallsExecuted
                .filter(tc => tc.result && tc.toolName !== 'graph_stats')
                .map(tc => {
                    const r = tc.result;
                    // Extract the most useful bits from common tool results
                    if (tc.toolName === 'graph_query' && r.nodes) {
                        return r.nodes.slice(0, 3).map((n: any) =>
                            `[${n.domain || '?'}] ${(n.content || '').slice(0, 150)}`
                        ).join('\n');
                    }
                    if (tc.toolName === 'graph_get' && r.content) {
                        return `[${r.domain || '?'}] ${r.content.slice(0, 300)}`;
                    }
                    if (tc.toolName === 'graph_summarize' && r.summary) {
                        return r.summary.slice(0, 400);
                    }
                    if (tc.toolName === 'graph_compress' && r.compressed) {
                        return r.compressed.slice(0, 400);
                    }
                    // Generic fallback — truncated JSON
                    const s = JSON.stringify(r);
                    return s.length > 200 ? s.slice(0, 200) + '...' : s;
                })
                .filter(Boolean);

            if (findings.length > 0) {
                toolContext = findings.join('\n');
            }
        }

        if (!responseText) {
            console.warn(`[chat] Tool calling returned empty response — rawContent type=${typeof rawContent}, isArray=${Array.isArray(rawContent)}, value=${JSON.stringify(rawContent)?.slice(0, 200)}`);
        }
        console.log(`[chat] Tool calling complete — iterations=${loopResult.iterations}, toolCalls=${toolCallSummary.length}, aborted=${loopResult.aborted}, fallback=${loopResult.fallbackReason || 'none'}, responseChars=${responseText.length}`);

        return {
            response: responseText,
            type: 'text',
            metadata: {
                system: 'llm',
                contextEnriched: !!ctxResult,
                toolCalls: toolCallSummary.length > 0 ? toolCallSummary : undefined,
                toolContext,
                agentIterations: loopResult.iterations > 0 ? loopResult.iterations : undefined,
                fallbackReason: loopResult.fallbackReason,
            },
        };
    } catch (err: any) {
        console.error(`[chat] Tool calling failed, falling through to legacy routing:`, err.message);
        return null;
    }
}
