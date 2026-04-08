/**
 * @module proxy/handler
 *
 * Chat completions request handler for the OpenAI-compatible proxy.
 *
 * Handles the full lifecycle of a POST /v1/chat/completions request:
 * budget enforcement, model resolution, session tracking, context engine
 * knowledge injection, telegraphic compression, tool calling injection,
 * upstream LLM call, context engine feedback update, and response
 * normalization (including SSE streaming conversion).
 */
import crypto from 'crypto';
import type express from 'express';
import {
    callWithMessages,
    extractTextContent,
} from '../models.js';
import { getModelProvider } from '../models/types.js';
import { prepare, update } from '../context-engine.js';
import { toTelegraphic } from '../telegraphic.js';
import { emitActivity } from '../services/event-bus.js';
import {
    resolveModel,
    resolveSessionId,
    profileFromContextSize,
    estimateTokens,
    PROFILE_CONTEXT_WINDOWS,
} from './model-resolution.js';
import {
    proxySettings,
    ensureProxySettings,
    injectKnowledge,
} from './knowledge.js';

/**
 * Register the POST /v1/chat/completions route on the Express app.
 *
 * The handler performs: budget check (429 if exceeded), model resolution,
 * session ID derivation, context engine knowledge injection (with telegraphic
 * compression and entropy-aware options), post-injection safety checks,
 * optional tool calling injection and agent loop, upstream LLM call,
 * context engine feedback update (fire-and-forget), and response normalization
 * to the OpenAI chat completions format (including SSE streaming conversion).
 *
 * @param app - The Express application to register the route on
 * @param proxyStats - Mutable stats object for request/enriched/error counters
 */
export function registerCompletionsHandler(app: express.Express, proxyStats: { requestCount: number; enrichedCount: number; errorCount: number; startedAt: string }): void {

app.post('/v1/chat/completions', async (req, res) => {
    try {
        await ensureProxySettings();

        // Budget check — reject early with 429 before any processing
        try {
            const { getBudgetStatus, computeRetryAfterSeconds } = await import('../models/budget.js');
            const budgetStatus = await getBudgetStatus();
            if (budgetStatus.exceeded) {
                const retryAfter = computeRetryAfterSeconds(budgetStatus);
                res.setHeader('Retry-After', String(retryAfter));
                return res.status(429).json({
                    error: {
                        message: `Budget limit exceeded (${budgetStatus.exceededPeriod}). Retry after ${retryAfter} seconds.`,
                        type: 'budget_exceeded',
                        code: 'budget_exceeded',
                    },
                });
            }
        } catch { /* budget module not loaded — proceed without check */ }

        const {
            model: requestedModel, messages, temperature, max_tokens, stream, user,
            top_p, frequency_penalty, presence_penalty, stop, response_format,
            tools, tool_choice, n, seed: requestSeed, logprobs, top_logprobs,
        } = req.body;

        // Validate
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' },
            });
        }

        // Streaming: proxy always fetches non-streaming from upstream, then converts to SSE if needed
        const streamRequested = !!stream;

        // --- 1. Resolve session ID ---
        const sessionId = resolveSessionId(req, messages, user);
        console.log(`[proxy] Session: ${sessionId}`);

        // --- 2. Resolve model ---
        const resolvedModel = await resolveModel(requestedModel);
        const displayProvider = getModelProvider(resolvedModel.model || resolvedModel.name);
        console.log(`[proxy] Model: ${resolvedModel.name} (${displayProvider})`);
        emitActivity('proxy', 'request', `${resolvedModel.name} (${displayProvider})`, { model: resolvedModel.name, provider: displayProvider, session: sessionId });

        // --- 3. Extract last user message for context engine ---
        const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
        const userContent = extractTextContent(lastUserMsg?.content);

        // --- 4. Enrich with context engine (graceful degradation) ---
        const contextSizeKnown = !!resolvedModel.contextSize;
        const modelProfile = contextSizeKnown
            ? profileFromContextSize(resolvedModel.contextSize!)
            : proxySettings.defaultModelProfile;

        // When context size is known, use dynamic budgeting; when unknown, inject freely
        const contextWindow = resolvedModel.contextSize || null;
        const messageTokens = estimateTokens(messages);
        // Client tool definitions consume context too — must account for them in budget
        const toolTokens = tools && tools.length > 0 ? Math.ceil(JSON.stringify(tools).length / 3) : 0;

        let knowledgeBudget: number;
        let skipInjection = false;
        let responseReserve: number;

        if (contextWindow) {
            // Known context size — dynamic knowledge budget with guaranteed minimum
            const maxKnowledgeBudget = Math.floor(contextWindow * proxySettings.knowledgeReserve);
            const minKnowledgeBudget = Math.floor(contextWindow * proxySettings.knowledgeMinReserve);
            responseReserve = max_tokens || Math.floor(contextWindow * 0.2);
            const available = contextWindow - messageTokens - toolTokens - responseReserve;
            knowledgeBudget = Math.max(Math.min(available, maxKnowledgeBudget), minKnowledgeBudget);
            skipInjection = available < minKnowledgeBudget;
            console.log(`[proxy] window: ${contextWindow}, messages: ~${messageTokens}tok, tools: ~${toolTokens}tok, response: ~${responseReserve}tok, knowledge: ${skipInjection ? 'SKIP' : `${knowledgeBudget}tok (range ${minKnowledgeBudget}-${maxKnowledgeBudget})`}`);
        } else {
            // Unknown context size — use a reasonable default budget, skip safety checks
            responseReserve = max_tokens || 1024;
            knowledgeBudget = PROFILE_CONTEXT_WINDOWS[modelProfile] || 4096;
            console.log(`[proxy] window: unknown, messages: ~${messageTokens}tok, knowledge budget: ${knowledgeBudget}tok (default)`);
        }

        let enrichedMessages = [...messages];
        let _knowledgeInjected = false;
        // 'replace' strategy: skip passive injection, rely on tool calling only
        const skipForToolReplace = proxySettings.toolCallingEnabled && proxySettings.toolCallingStrategy === 'replace';
        if (skipInjection) {
            console.log(`[proxy] Skipping knowledge — insufficient space`);
        } else if (skipForToolReplace) {
            console.log(`[proxy] Skipping passive injection — tool calling strategy: replace`);
        } else try {
            const prepareOpts: Record<string, any> = { modelProfile, budget: knowledgeBudget };
            if (proxySettings.maxKnowledgeNodes > 0) prepareOpts.maxNodes = proxySettings.maxKnowledgeNodes;
            const ctxResult = await prepare(userContent, sessionId, prepareOpts);

            if (ctxResult.systemPrompt) {
                let knowledgeText = ctxResult.systemPrompt;
                if (proxySettings.telegraphicEnabled) {
                    const before = knowledgeText.length;
                    knowledgeText = toTelegraphic(knowledgeText, {
                        aggressiveness: proxySettings.telegraphicAggressiveness,
                        entropy: {
                            enabled: proxySettings.entropyEnabled,
                            weights: proxySettings.entropyWeights,
                            thresholds: proxySettings.entropyThresholds,
                            rarityMinLength: proxySettings.entropyRarityMinLength,
                        },
                    });
                    const mode = proxySettings.entropyEnabled ? ' (entropy)' : '';
                    console.log(`[proxy] Telegraphic${mode} compression: ${before} \u2192 ${knowledgeText.length} chars (${Math.round((1 - knowledgeText.length / before) * 100)}% reduction)`);
                }
                enrichedMessages = injectKnowledge(enrichedMessages, knowledgeText, !!(tools && tools.length > 0));
                _knowledgeInjected = true;
                proxyStats.enrichedCount++;
                console.log(`[proxy] Injected knowledge (${ctxResult.knowledge?.length || 0} nodes, ${ctxResult.topics?.length || 0} topics)`);
                emitActivity('proxy', 'enriched', `Injected ${ctxResult.knowledge?.length || 0} nodes, ${ctxResult.topics?.length || 0} topics`, { nodes: ctxResult.knowledge?.length || 0, topics: ctxResult.topics?.length || 0 });
            }
        } catch (err: any) {
            console.warn(`[proxy] Context engine failed (proceeding without enrichment): ${err.message}`);
        }

        // --- 4b. Telegraphic compression of client system prompt ---
        if (proxySettings.telegraphicEnabled && proxySettings.compressClientPrompt) {
            const systemIdx = enrichedMessages.findIndex((m: any) => m.role === 'system');
            if (systemIdx >= 0) {
                const original = enrichedMessages[systemIdx].content;
                if (typeof original === 'string' && original.length > 200) {
                    // Split on knowledge-context boundary so we don't double-compress injected knowledge
                    const knowledgeEnd = original.indexOf('</knowledge-context>');
                    let clientPart: string;
                    let knowledgePart: string;
                    if (knowledgeEnd >= 0) {
                        // Knowledge was prepended — find where client prompt starts after the separator
                        const sepIdx = original.indexOf('---\n', knowledgeEnd);
                        const splitAt = sepIdx >= 0 ? sepIdx + 4 : knowledgeEnd + '</knowledge-context>\n\n'.length;
                        knowledgePart = original.slice(0, splitAt);
                        clientPart = original.slice(splitAt);
                    } else {
                        knowledgePart = '';
                        clientPart = original;
                    }

                    if (clientPart.length > 200) {
                        const before = clientPart.length;
                        const compressed = toTelegraphic(clientPart, {
                            aggressiveness: proxySettings.telegraphicAggressiveness,
                            entropy: {
                                enabled: proxySettings.entropyEnabled,
                                weights: proxySettings.entropyWeights,
                                thresholds: proxySettings.entropyThresholds,
                                rarityMinLength: proxySettings.entropyRarityMinLength,
                            },
                        });
                        enrichedMessages[systemIdx] = {
                            ...enrichedMessages[systemIdx],
                            content: knowledgePart + compressed,
                        };
                        console.log(`[proxy] Client prompt compression: ${before} \u2192 ${compressed.length} chars (${Math.round((1 - compressed.length / before) * 100)}% reduction)`);
                    }
                }
            }
        }

        // --- 4c. Post-injection safety check (only when context size is known) ---
        if (contextWindow && enrichedMessages !== messages) {
            const enrichedTokens = estimateTokens(enrichedMessages);
            if (enrichedTokens + toolTokens + responseReserve > contextWindow) {
                console.warn(`[proxy] Safety check: enriched ~${enrichedTokens}tok + tools ~${toolTokens}tok + response ~${responseReserve}tok exceeds window ${contextWindow} \u2014 dropping knowledge`);
                enrichedMessages = [...messages];
                _knowledgeInjected = false;
            }
        }

        // --- 4d. Tool calling injection ---
        let useAgentLoop = false;
        const modelSupportsTools = resolvedModel._registryModel?.supportsTools !== false;
        const clientHasOwnTools = tools && tools.length > 0;
        // Strip client tools when model doesn't support them — prevents garbled output
        let allTools = modelSupportsTools ? tools : undefined;
        if (!modelSupportsTools && clientHasOwnTools) {
            console.log(`[proxy] Stripping ${tools.length} client tools \u2014 model "${resolvedModel.name}" has supportsTools=false`);
        }

        // Only inject graph tools + agent loop when the CLIENT doesn't provide its own tools.
        // Clients like Roo Code, Cursor, etc. manage their own tool calling loop — the proxy's
        // agent loop would intercept their tool calls (read_file, write_file, etc.), fail to
        // execute them, and feed errors back to the model, producing junk output.
        // When the client has tools, knowledge injection via the context engine is sufficient.
        if (proxySettings.toolCallingEnabled && modelSupportsTools && !clientHasOwnTools) {
            const { getToolDefinitions, estimateToolTokens } = await import('../core/tool-calling.js');
            const graphTools = getToolDefinitions(proxySettings.toolCallingMode);
            const toolTokenCost = estimateToolTokens(graphTools);

            // Check we have budget for tool definitions
            const canAffordTools = !contextWindow || (contextWindow - estimateTokens(enrichedMessages) - responseReserve - toolTokenCost > 0);
            if (canAffordTools) {
                allTools = [...(tools || []), ...graphTools];
                useAgentLoop = true;
                console.log(`[proxy] Tool calling: ${graphTools.length} graph tools injected (~${toolTokenCost} tokens)`);
            } else {
                console.log(`[proxy] Tool calling: skipped \u2014 insufficient context budget for ~${toolTokenCost} tool tokens`);
            }
        } else if (proxySettings.toolCallingEnabled && clientHasOwnTools) {
            console.log(`[proxy] Tool calling: skipped \u2014 client provides ${tools.length} own tools (passthrough mode)`);
        }

        // --- 5. Call LLM (forward all OpenAI-compatible params) ---
        // When tools are present:
        // - Default tool_choice to "auto" (OpenAI spec default) — some serving layers
        //   (LM Studio, vLLM) require this explicitly to activate tool calling templates
        // - Strip response_format: { type: "text" } — it's the default and some serving
        //   layers interpret it as "never output structured tool_calls"
        const effectiveToolChoice = allTools
            ? (tool_choice || 'auto')
            : undefined;
        const effectiveResponseFormat = (allTools && response_format?.type === 'text')
            ? undefined
            : response_format;

        if (clientHasOwnTools) {
            console.log(`[proxy] Passthrough request: model=${resolvedModel.model || resolvedModel.name}, tools=${allTools?.length || 0}, tool_choice=${effectiveToolChoice}, response_format=${effectiveResponseFormat ? JSON.stringify(effectiveResponseFormat) : 'none'}, stream=false`);
        }

        const callOpts = {
            maxTokens: max_tokens,
            temperature,
            top_p,
            frequency_penalty,
            presence_penalty,
            stop,
            response_format: effectiveResponseFormat,
            tools: allTools,
            tool_choice: effectiveToolChoice,
            n,
            seed: requestSeed,
            logprobs,
            top_logprobs,
            user,
        };

        let result;
        if (useAgentLoop) {
            const { runAgentLoop } = await import('../core/tool-calling.js');
            const loopResult = await runAgentLoop({
                messages: enrichedMessages,
                model: resolvedModel as any,
                callOptions: callOpts,
                tools: allTools!,
                maxIterations: proxySettings.toolCallingMaxIterations,
                contextWindow,
                onToolCall: (name, args, _result, durationMs) => {
                    emitActivity('proxy', 'tool_call', `${name}(${JSON.stringify(args).slice(0, 80)}) \u2014 ${durationMs}ms`);
                },
            });
            result = loopResult.finalResponse;
            if (loopResult.toolCallsExecuted.length > 0) {
                console.log(`[proxy] Agent loop: ${loopResult.iterations} iteration(s), ${loopResult.toolCallsExecuted.length} tool call(s)${loopResult.aborted ? ' (aborted)' : ''}`);
            }
            if (loopResult.fallbackReason) {
                console.log(`[proxy] Tool calling fallback: ${loopResult.fallbackReason}`);
            }
        } else {
            result = await callWithMessages(enrichedMessages, resolvedModel, callOpts);
        }

        // --- 6. Detect raw tool call tokens in response ---
        // Some local models output tool calls as raw text (e.g. <|channel|>commentary functions:)
        // instead of structured tool_calls. This means the serving layer (LM Studio, Ollama, etc.)
        // isn't converting the model's native tool call format to OpenAI's structured format.
        const firstChoiceContent = result.choices[0]?.message?.content || '';
        if (firstChoiceContent && /^<\|[^|]+\|>|^functions:\s|^\{"tool_calls"/.test(firstChoiceContent)) {
            console.warn(`[proxy] \u26a0 Model "${resolvedModel.name}" output raw tool call tokens as text \u2014 serving layer may not support tool calling for this model. Consider setting supportsTools=false in the model registry, or check your serving software's tool calling configuration.`);
        }

        // --- 7. Update context engine (fire-and-forget) ---
        if (firstChoiceContent) {
            update(sessionId, firstChoiceContent).catch((err: any) => {
                console.warn(`[proxy] Context update failed: ${err.message}`);
            });
        }

        // --- 7. Return OpenAI-compatible response ---
        // Normalize choices to ensure all spec-required fields are present
        const normalizedChoices = (result.choices || []).map((choice: any, i: number) => ({
            index: choice.index ?? i,
            message: {
                role: choice.message?.role || 'assistant',
                content: choice.message?.content ?? null,
                ...(choice.message?.tool_calls ? { tool_calls: choice.message.tool_calls } : {}),
                ...(choice.message?.function_call ? { function_call: choice.message.function_call } : {}),
                ...(choice.message?.refusal ? { refusal: choice.message.refusal } : {}),
            },
            finish_reason: choice.finish_reason || 'stop',
            ...(choice.logprobs ? { logprobs: choice.logprobs } : {}),
        }));

        const responseId = `chatcmpl-${crypto.randomUUID()}`;
        const created = Math.floor(Date.now() / 1000);
        const modelName = result.model || resolvedModel.name;

        if (streamRequested) {
            // Convert to SSE format for clients that requested streaming
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            for (const choice of normalizedChoices) {
                // Role chunk (includes empty content per OpenAI spec)
                res.write(`data: ${JSON.stringify({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: modelName,
                    choices: [{
                        index: choice.index,
                        delta: { role: choice.message.role, content: '' },
                        logprobs: null,
                        finish_reason: null,
                    }],
                })}\n\n`);

                // Content chunk
                if (choice.message.content) {
                    res.write(`data: ${JSON.stringify({
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model: modelName,
                        choices: [{
                            index: choice.index,
                            delta: { content: choice.message.content },
                            logprobs: null,
                            finish_reason: null,
                        }],
                    })}\n\n`);
                }

                // Tool calls chunk (if present)
                if (choice.message.tool_calls) {
                    for (let tcIdx = 0; tcIdx < choice.message.tool_calls.length; tcIdx++) {
                        const tc = choice.message.tool_calls[tcIdx];
                        res.write(`data: ${JSON.stringify({
                            id: responseId,
                            object: 'chat.completion.chunk',
                            created,
                            model: modelName,
                            choices: [{
                                index: choice.index,
                                delta: {
                                    tool_calls: [{
                                        index: tcIdx,
                                        id: tc.id,
                                        type: 'function',
                                        function: tc.function,
                                    }],
                                },
                                logprobs: null,
                                finish_reason: null,
                            }],
                        })}\n\n`);
                    }
                }

                // Finish chunk
                res.write(`data: ${JSON.stringify({
                    id: responseId,
                    object: 'chat.completion.chunk',
                    created,
                    model: modelName,
                    choices: [{
                        index: choice.index,
                        delta: {},
                        logprobs: null,
                        finish_reason: choice.finish_reason,
                    }],
                })}\n\n`);
            }

            // Usage chunk
            res.write(`data: ${JSON.stringify({
                id: responseId,
                object: 'chat.completion.chunk',
                created,
                model: modelName,
                choices: [],
                usage: result.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.json({
                id: responseId,
                object: 'chat.completion',
                created,
                model: modelName,
                choices: normalizedChoices,
                usage: result.usage || {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
                ...(result.system_fingerprint ? { system_fingerprint: result.system_fingerprint } : {}),
            });
        }

    } catch (err: any) {
        proxyStats.errorCount++;
        console.error('[proxy] Completion error:', err.message);
        res.status(502).json({
            error: {
                message: `LLM call failed: ${err.message}`,
                type: 'upstream_error',
            },
        });
    }
});

}
