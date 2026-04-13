/**
 * Provider-specific LLM calling logic.
 *
 * Implements the transport layer for all LLM providers: Anthropic (Claude),
 * OpenAI-compatible (OpenAI, LM Studio, Z.AI, Groq), and Ollama native API.
 * Handles thinking level control, think block stripping, unsupported parameter
 * auto-discovery, structured output formatting, and conversational debug logging.
 * @module models/providers
 */
import { emitActivity } from '../services/event-bus.js';
import type { ModelEntry, CallOptions, CallWithMessagesOptions, CallWithMessagesResult, JsonSchema, LlmCallResult, LlmUsage } from './types.js';
import { resolveProviderEndpoint, getModelProvider } from './types.js';
import { getApiKey } from './api-keys.js';
import { logUsage } from './cost.js';
import { isBudgetExceeded } from './budget.js';
import { acquireModelSlot, reportRateLimit } from './semaphore.js';

// =============================================================================
// FETCH TIMEOUT — prevents hung connections from consuming retry windows
// =============================================================================

/** Default fetch timeout: 900 seconds. Configurable per-model via model_registry.request_timeout. */
const DEFAULT_FETCH_TIMEOUT_MS = 900_000;

// =============================================================================
// STREAMING SSE READER — keeps connections alive for slow reasoning models
// =============================================================================

/**
 * Read an SSE streaming response and return concatenated content + usage.
 * Used for Z.AI/GLM endpoints where the server drops idle connections at ~300s.
 */
async function readStreamingResponse(response: Response): Promise<{ text: string; usage?: LlmUsage; finishReason?: string }> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let content = '';
    let buffer = '';
    let usage: LlmUsage | undefined;
    let finishReason: string | undefined;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                processSSELine(line);
            }
        }
        // Flush remaining buffer - the final SSE chunk may not end with \n,
        // leaving the last data line unprocessed. Without this, content from
        // the final chunk is silently dropped, causing truncated responses.
        if (buffer.trim()) {
            processSSELine(buffer);
        }
    } finally {
        reader.releaseLock();
    }

    function processSSELine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') return;
        if (!trimmed.startsWith('data: ')) return;
        try {
            const chunk = JSON.parse(trimmed.slice(6));
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) content += delta;
            if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
            if (chunk.usage) {
                usage = {
                    prompt_tokens: chunk.usage.prompt_tokens || 0,
                    completion_tokens: chunk.usage.completion_tokens || 0,
                    tool_tokens: chunk.usage.completion_tokens_details?.reasoning_tokens || 0,
                    total_tokens: chunk.usage.total_tokens || 0,
                };
            }
        } catch { /* skip malformed chunk */ }
    }

    return { text: content, usage, finishReason };
}

/**
 * Create an AbortSignal that fires on timeout OR when a caller signal fires.
 * Timeout comes from model_registry.request_timeout (in seconds), falling back to 180s.
 */
function createFetchSignal(callerSignal?: AbortSignal, timeoutSeconds?: number): AbortSignal {
    const timeoutMs = (timeoutSeconds && timeoutSeconds > 0) ? timeoutSeconds * 1000 : DEFAULT_FETCH_TIMEOUT_MS;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!callerSignal) return timeoutSignal;
    // AbortSignal.any() is available in Node 20+
    if ('any' in AbortSignal) return (AbortSignal as any).any([callerSignal, timeoutSignal]);
    // Fallback: create a manual controller wired to both
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    callerSignal.addEventListener('abort', onAbort, { once: true });
    timeoutSignal.addEventListener('abort', onAbort, { once: true });
    return ac.signal;
}

// =============================================================================
// CONVERSATIONAL LOGGING — full request/response payload logging
// =============================================================================

let _conversationalLogging = false;

// Per-endpoint cache of unsupported sampling params — auto-discovered on 400 errors.
// Keyed by endpoint host (e.g. "api.groq.com"), value is set of property names ("min_p", "top_k").
// Persisted to system DB settings so it survives restarts.
const _unsupportedParams = new Map<string, Set<string>>();

/** Get the set of unsupported param names for an endpoint URL (e.g. "min_p", "top_k"). */
export function getUnsupportedParams(endpointUrl: string): Set<string> {
    try {
        const host = new URL(endpointUrl).host;
        return _unsupportedParams.get(host) ?? new Set();
    } catch {
        return new Set();
    }
}

/** Load persisted unsupported param discoveries from system DB. */
export async function loadUnsupportedParamsCache(): Promise<void> {
    try {
        const { systemQueryOne } = await import('../db.js');
        const row = await systemQueryOne(`SELECT value FROM settings WHERE key = 'llm.unsupportedParams'`) as any;
        if (row?.value) {
            const data = JSON.parse(row.value) as Record<string, string[]>;
            for (const [host, params] of Object.entries(data)) {
                _unsupportedParams.set(host, new Set(params));
            }
            const total = [..._unsupportedParams.values()].reduce((s, v) => s + v.size, 0);
            if (total > 0) console.error(`[llm] Loaded ${total} unsupported param(s) for ${_unsupportedParams.size} endpoint(s)`);
        }
    } catch { /* settings table may not exist yet */ }
}

/** Persist the unsupported params cache to system DB. */
async function _persistUnsupportedParams(): Promise<void> {
    try {
        const { systemQuery: sysQ } = await import('../db.js');
        const data: Record<string, string[]> = {};
        for (const [host, params] of _unsupportedParams) {
            data[host] = [...params];
        }
        await sysQ(
            `INSERT INTO settings (key, value) VALUES ('llm.unsupportedParams', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1`,
            [JSON.stringify(data)],
        );
    } catch { /* non-fatal */ }
}

/**
 * Enable or disable verbose conversational logging (full request/response payloads).
 * @param enabled - Whether to enable logging
 */
export function setConversationalLogging(enabled: boolean): void {
    _conversationalLogging = enabled;
    console.log(`[llm:conv] Conversational logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/** @returns Whether conversational logging is currently enabled. */
export function isConversationalLogging(): boolean {
    return _conversationalLogging;
}

/**
 * Log a labeled payload to console when conversational logging is enabled.
 * @param label - Descriptive label for the log entry
 * @param data - Object to JSON-serialize
 */
function convLog(label: string, data: any): void {
    if (!_conversationalLogging) return;
    console.log(`[llm:conv] ── ${label} ──`);
    console.log(JSON.stringify(data, null, 2));
}

/**
 * Strip <think>...</think> and <thinking>...</thinking> blocks from model output.
 * Reasoning models (DeepSeek R1, QwQ, etc.) emit chain-of-thought in these tags.
 * When noThink is enabled, we remove them so callers get clean output.
 */
function stripThinkBlocks(text: string): string {
    // Handle both <think>...</think> and <thinking>...</thinking>
    // Use dotAll (s flag) so . matches newlines inside think blocks
    let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    return result.trim();
}

/**
 * Prefix the last user message in a chat messages array with a string.
 * Handles both string content and multimodal (array) content.
 * @param messages - Array of chat messages (mutated in place)
 * @param prefix - String to prepend to the last user message
 * @returns true if a user message was found and prefixed, false otherwise
 */
function prefixLastUserMessage(messages: any[], prefix: string): boolean {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user') {
            if (typeof msg.content === 'string') {
                msg.content = `${prefix}\n${msg.content}`;
            } else if (Array.isArray(msg.content)) {
                const textPart = msg.content.find((p: any) => p.type === 'text');
                if (textPart) textPart.text = `${prefix}\n${textPart.text}`;
            }
            return true;
        }
    }
    return false;
}

/**
 * Apply thinking level control. Supports granular levels for capable providers.
 *
 * | Model               | Levels supported        | Mechanism                                    |
 * |---------------------|-------------------------|----------------------------------------------|
 * | GPT-5.2+            | off/low/medium/high     | `reasoning_effort` (off→"none")              |
 * | OpenAI o1/o3/o4     | low/medium/high (no off)| `reasoning_effort` (off→"low" minimum)       |
 * | Qwen3 / QwQ         | on/off only             | `/no_think` prefix in last user message      |
 * | GLM (Z.AI)          | on/off only             | `thinking: { type: "disabled" }` body param  |
 * | DeepSeek R1         | on/off only             | Prefill empty `<think>` tags                 |
 * | Gemini 2.5 Flash    | Not yet supported       | (would need `thinkingBudget: 0`)             |
 * | Anthropic Claude    | on/off only             | Handled in callAnthropic via thinking param  |
 * | Ollama (any model)  | on/off only             | Handled in callLocalModel via `think: false` |
 *
 * For binary-only providers, levels low/medium/high are treated as "on" (no-op).
 * For models without native disable, think block stripping acts as a safety net.
 */
/**
 * Apply thinking level control to the request body.
 * For models supporting granular levels (OpenAI GPT/o-series), sets reasoning_effort.
 * For binary-only models (Qwen, GLM, DeepSeek), only 'off' triggers the disable mechanism.
 */
function applyThinkingLevel(requestBody: any, modelName: string, level: string): void {
    const id = (modelName || '').toLowerCase();

    // GPT-5.2+: reasoning_effort maps directly (off→none, low/medium/high→same)
    if (id.includes('gpt-5') || id.includes('gpt5')) {
        const effort = level === 'off' ? 'none' : level;
        requestBody.reasoning_effort = effort;
        console.log(`[llm] thinking: set reasoning_effort=${effort} for ${modelName}`);
        return;
    }

    // GPT OSS (e.g. gpt-oss-20b): reasoning_effort like o-series (minimum 'low', no 'off')
    if (id.includes('gpt-oss') || id.includes('gptoss')) {
        const effort = level === 'off' ? 'low' : level;
        requestBody.reasoning_effort = effort;
        console.log(`[llm] thinking: set reasoning_effort=${effort} for ${modelName}`);
        return;
    }

    // OpenAI o-series (o1, o3, o4): reasoning_effort (minimum is 'low', can't fully disable)
    if (/(?:^|[-/])o[134](?:$|[-/])/.test(id) || id.includes('o1-') || id.includes('o3-') || id.includes('o4-')) {
        const effort = level === 'off' ? 'low' : level;
        requestBody.reasoning_effort = effort;
        console.log(`[llm] thinking: set reasoning_effort=${effort} for ${modelName}`);
        return;
    }

    // GLM (Z.AI): thinking parameter supported on GLM-4.5, GLM-4.6, GLM-4.7, GLM-5
    // Format: { type: "enabled", clear_thinking: false } or { type: "disabled" }
    if (id.includes('glm')) {
        if (level === 'off') {
            requestBody.thinking = { type: 'disabled' };
            console.log(`[llm] thinking: set thinking.type=disabled for ${modelName}`);
        } else {
            requestBody.thinking = { type: 'enabled', clear_thinking: false };
            console.log(`[llm] thinking: set thinking.type=enabled for ${modelName}`);
        }
        return;
    }

    // Binary-only providers: only 'off' triggers the disable mechanism
    if (level !== 'off') return;

    // Qwen3 / QwQ: /no_think prefix — model was trained with think/no_think toggling
    if (id.includes('qwen') || id.includes('qwq')) {
        if (requestBody.messages && Array.isArray(requestBody.messages)) {
            prefixLastUserMessage(requestBody.messages, '/no_think');
            console.log(`[llm] thinking: prefixed /no_think for ${modelName}`);
        }
        return;
    }

    // DeepSeek R1: no native flag. Prefill empty think tags so the model
    // believes it already completed its chain-of-thought and skips reasoning.
    if (id.includes('r1') || id.includes('deepseek-r')) {
        if (requestBody.messages && Array.isArray(requestBody.messages)) {
            requestBody.messages.push({
                role: 'assistant',
                content: '<think>\n\n</think>',
            });
            console.log(`[llm] thinking: prefilled empty <think> tags for ${modelName}`);
        }
        return;
    }

    // Generic fallback: no known native mechanism — rely on think block stripping
    console.log(`[llm] thinking: no known disable mechanism for ${modelName}, will strip think blocks from output`);
}

/**
 * Build the provider-appropriate response_format for structured output.
 * @param provider - Normalized provider key
 * @param jsonSchema - Typed JSON schema (preferred)
 * @param legacyFormat - Legacy response_format passthrough
 * @returns Provider-specific response_format value, or null if not applicable
 */
function buildProviderResponseFormat(provider: string, jsonSchema?: JsonSchema, legacyFormat?: any): any {
    if (!jsonSchema) return legacyFormat || null;

    switch (provider) {
        case 'lmstudio':
            // LM Studio supports full json_schema structured output for capable models
            return {
                type: 'json_schema',
                json_schema: {
                    name: jsonSchema.name,
                    strict: true,
                    schema: jsonSchema.schema,
                }
            };
        case 'openai':
            // Z.AI and most OpenAI-compatible APIs only support json_object, not json_schema.
            // Schema is injected into the system prompt separately (see injectSchemaIntoPrompt).
            return { type: 'json_object' };
        case 'local':
            return 'json';
        case 'anthropic':
            return null;
        default:
            return null;
    }
}

/**
 * For providers that support json_object but NOT json_schema (e.g. Z.AI/GLM),
 * inject the JSON schema definition into the system prompt so the model knows
 * the exact structure to produce. This follows Z.AI's documented best practice:
 * define schema in prompt + use response_format: {"type": "json_object"}.
 *
 * @param messages - The messages array (mutated: prepends or appends to system message)
 * @param provider - Normalized provider key
 * @param jsonSchema - The JSON schema to inject
 */
function injectSchemaIntoPrompt(messages: any[], provider: string, jsonSchema?: JsonSchema): void {
    if (!jsonSchema) return;

    // LM Studio has native json_schema support — no need for prompt injection
    if (provider === 'lmstudio') return;

    const schemaBlock = `\n\nYou MUST return valid JSON conforming to this JSON Schema:\n${JSON.stringify(jsonSchema.schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no extra text.`;

    // Append to existing system message, or create one
    const systemMsg = messages.find((m: any) => m.role === 'system');
    if (systemMsg) {
        if (typeof systemMsg.content === 'string') {
            systemMsg.content += schemaBlock;
        }
    } else {
        messages.unshift({ role: 'system', content: schemaBlock.trim() });
    }
}

/**
 * Route a single-prompt LLM call to the appropriate provider handler.
 * Strips think blocks from the response when model.noThink is set.
 * @param model - Model descriptor with provider routing info
 * @param prompt - The prompt text
 * @param options - Call options (maxTokens, temperature, images, etc.)
 * @returns The LLM call result with text, usage, and finish reason
 */
export async function callSingleModel(model: ModelEntry, prompt: string, options: CallOptions): Promise<LlmCallResult> {
    // Acquire model concurrency slot when registry info is available.
    // This is the lowest-level entry point for single-prompt LLM calls —
    // enforcing here guarantees every code path respects rate limits.
    let release: (() => void) | undefined;
    if (model._registryId) {
        release = await acquireModelSlot(model._registryId, model._maxConcurrency || 1, model._requestPauseMs ?? 0);
    }

    try {
        let result: LlmCallResult;
        switch (model.provider) {
            case 'anthropic':
                result = await callAnthropic(model, prompt, options);
                break;
            case 'local':
                result = await callLocalModel(model, prompt, options);
                break;
            case 'openai':
            case 'lmstudio':
            default:
                // All OpenAI-compatible providers (including unknown ones)
                result = await callOpenAICompatible(model, prompt, options);
                break;
        }

        // When noThink is set, strip reasoning blocks from the response.
        // Covers: DeepSeek R1, QwQ, Qwen3, and any model that emits <think>/<thinking> tags.
        if (model.noThink && result.text) {
            const stripped = stripThinkBlocks(result.text);
            if (stripped !== result.text) {
                console.log(`[llm] noThink: stripped ${result.text.length - stripped.length} chars of think blocks from ${model.model || model.name}`);
                result.text = stripped;
            }
        }

        return result;
    } catch (err: any) {
        // Signal rate limit to the semaphore BEFORE releasing the slot.
        // This is critical: release() wakes the next queued caller, and they
        // must see the cooldown before dispatching. If we waited for the
        // caller (callSubsystemModel) to report, the next caller would
        // already be in-flight.
        if (model._registryId && (
            err.message?.includes('429') ||
            err.message?.toLowerCase().includes('rate limit') ||
            err.message?.toLowerCase().includes('rate_limit')
        )) {
            reportRateLimit(model._registryId, 120_000);
        }
        throw err;
    } finally {
        release?.();
    }
}

/**
 * Send a pre-formed messages array to an OpenAI-compatible endpoint.
 * Unlike callSingleModel() which takes a single prompt string and wraps it,
 * this accepts the caller's full messages array as-is.
 */
export async function callWithMessages(
    messages: Array<{ role: string; content: string }>,
    model: ModelEntry,
    options: CallWithMessagesOptions = {}
): Promise<CallWithMessagesResult> {
    if (isBudgetExceeded()) {
        throw new Error('Budget exceeded — LLM calls paused until budget resets.');
    }

    // Acquire model concurrency slot when registry info is available
    let release: (() => void) | undefined;
    if (model._registryId) {
        release = await acquireModelSlot(model._registryId, model._maxConcurrency || 1, model._requestPauseMs ?? 0);
    }

    try {
        return await _callWithMessagesInner(messages, model, options);
    } catch (err: any) {
        if (model._registryId && (
            err.message?.includes('429') ||
            err.message?.toLowerCase().includes('rate limit') ||
            err.message?.toLowerCase().includes('rate_limit')
        )) {
            reportRateLimit(model._registryId, 120_000);
        }
        throw err;
    } finally {
        release?.();
    }
}

async function _callWithMessagesInner(
    messages: Array<{ role: string; content: string }>,
    model: ModelEntry,
    options: CallWithMessagesOptions = {}
): Promise<CallWithMessagesResult> {
    const endpoint = model.endpoint
        || resolveProviderEndpoint(model.provider);

    const modelName = model.model || model.name;

    const displayProvider = getModelProvider(modelName);
    console.log(`\n[proxy] ── callWithMessages → ${modelName} (${displayProvider}) ──`);
    console.log(`[proxy] Messages: ${messages.length}, endpoint: ${endpoint}`);
    emitActivity('llm', 'proxy_call', `proxy → ${modelName} (${messages.length} msgs)`, { model: modelName, provider: displayProvider, messages: messages.length });

    const requestBody: any = {
        model: modelName,
        messages,
        temperature: options.temperature ?? 0.7,
        stream: false,
    };

    // Only include max_tokens if client explicitly sent one — don't preempt
    if (options.maxTokens != null) requestBody.max_tokens = options.maxTokens;

    // Forward OpenAI-compatible params only if explicitly provided
    if (options.top_p !== undefined) requestBody.top_p = options.top_p;
    if (options.frequency_penalty !== undefined) requestBody.frequency_penalty = options.frequency_penalty;
    if (options.presence_penalty !== undefined) requestBody.presence_penalty = options.presence_penalty;
    if (options.stop !== undefined) requestBody.stop = options.stop;
    if (options.response_format !== undefined) requestBody.response_format = options.response_format;
    if (options.tools !== undefined) requestBody.tools = options.tools;
    if (options.tool_choice !== undefined) requestBody.tool_choice = options.tool_choice;
    if (options.n !== undefined) requestBody.n = options.n;
    if (options.seed !== undefined) requestBody.seed = options.seed;
    if (options.logprobs !== undefined) requestBody.logprobs = options.logprobs;
    if (options.top_logprobs !== undefined) requestBody.top_logprobs = options.top_logprobs;
    if (options.user !== undefined) requestBody.user = options.user;

    // Thinking level: apply provider-specific mechanisms
    if (model.thinkingLevel) {
        applyThinkingLevel(requestBody, modelName, model.thinkingLevel);
    } else if (model.noThink) {
        applyThinkingLevel(requestBody, modelName, 'off');
    }

    // Z.AI: strip unsupported parameters, enable streaming for connection keepalive.
    // Only trigger for actual Z.AI endpoints — NOT for local models with 'glm' in the name.
    const isZaiProxy = endpoint.includes('z.ai');
    if (isZaiProxy) {
        requestBody.stream = true;             // Z.AI drops idle connections at ~300s; streaming keeps alive
        delete requestBody.frequency_penalty;  // not supported
        delete requestBody.presence_penalty;   // not supported
        delete requestBody.logprobs;           // not supported
        delete requestBody.top_logprobs;       // not supported
        delete requestBody.seed;               // not supported
        delete requestBody.n;                  // not supported
        console.log(`[llm] Z.AI sanitized request keys: ${Object.keys(requestBody).join(', ')}`);
    }

    const url = endpoint.endsWith('/chat/completions')
        ? endpoint
        : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Add auth header — per-model key takes priority over provider-level key
    const key = model.apiKey || getApiKey(model.provider);
    if (key && model.provider === 'anthropic') {
        headers['x-api-key'] = key;
        headers['anthropic-version'] = '2023-06-01';
    } else if (key) {
        headers['Authorization'] = `Bearer ${key}`;
    }

    convLog(`REQUEST callWithMessages → ${modelName}`, { url, model: modelName, provider: model.provider, noThink: model.noThink, body: requestBody });

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: createFetchSignal(options.signal, options.requestTimeout),
    });

    if (!response.ok) {
        const error = await response.text();
        convLog(`ERROR callWithMessages → ${modelName}`, { status: response.status, error });
        emitActivity('llm', 'proxy_failed', `proxy → ${modelName} FAILED (${response.status})`, { model: modelName, status: response.status });
        throw new Error(`LLM error (${response.status}): ${error}`);
    }

    let data: any;
    let firstContent: string | undefined;

    if (isZaiProxy) {
        const result = await readStreamingResponse(response);
        firstContent = result.text;
        data = { choices: [{ message: { content: result.text }, finish_reason: result.finishReason }], usage: result.usage ? { prompt_tokens: result.usage.prompt_tokens, completion_tokens: result.usage.completion_tokens, total_tokens: result.usage.total_tokens, completion_tokens_details: { reasoning_tokens: result.usage.tool_tokens } } : undefined };
        convLog(`RESPONSE callWithMessages (streaming) -> ${modelName}`, { textLen: result.text?.length, finishReason: result.finishReason, usage: result.usage });
    } else {
        data = await response.json();
        convLog(`RESPONSE callWithMessages → ${modelName}`, data);
        if (!data.choices || data.choices.length === 0) {
            throw new Error('No choices in LLM response');
        }
        firstContent = data.choices[0]?.message?.content;
    }

    if (firstContent) {
        console.log(`[proxy] Response (${firstContent.length} chars): ${firstContent.slice(0, 200)}${firstContent.length > 200 ? '...' : ''}`);
    }
    console.log(`[proxy] ── done ──\n`);
    emitActivity('llm', 'proxy_complete', `proxy → ${modelName} (${firstContent?.length || 0} chars)`, { model: modelName, chars: firstContent?.length || 0, usage: data.usage });

    // Log usage to persistent store (fire-and-forget)
    if (data.usage) {
        const toolTokens = data.usage.completion_tokens_details?.reasoning_tokens || 0;
        logUsage({
            subsystem: 'proxy',
            modelId: modelName,
            modelName: modelName,
            provider: model.provider,
            inputTokens: data.usage.prompt_tokens || 0,
            outputTokens: data.usage.completion_tokens || 0,
            toolTokens,
            totalTokens: data.usage.total_tokens || 0,
            finishReason: data.choices?.[0]?.finish_reason,
            inputCostPerMtok: model.inputCostPerMtok,
            outputCostPerMtok: model.outputCostPerMtok,
            toolCostPerMtok: model.toolCostPerMtok,
        }).catch(() => {});
    }

    // When noThink is set, strip reasoning blocks from each choice's content
    if (model.noThink && data.choices) {
        for (const choice of data.choices) {
            if (choice.message?.content && typeof choice.message.content === 'string') {
                const stripped = stripThinkBlocks(choice.message.content);
                if (stripped !== choice.message.content) {
                    console.log(`[proxy] noThink: stripped ${choice.message.content.length - stripped.length} chars of think blocks`);
                    choice.message.content = stripped;
                }
            }
        }
    }

    return {
        choices: data.choices,
        usage: data.usage || undefined,
        model: data.model || undefined,
        system_fingerprint: data.system_fingerprint || undefined,
    };
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

/**
 * Extract text from OpenAI message content — handles both string and array formats.
 * OpenAI content can be a string OR an array of {type: "text", text: "..."} parts.
 */
export function extractTextContent(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
            .map((p: any) => p.text)
            .join(' ');
    }
    return String(content);
}

// =============================================================================
// ANTHROPIC (Claude)
// =============================================================================

/**
 * Call the Anthropic (Claude) Messages API.
 * Supports vision (base64 images), thinking control, and system prompts.
 * @param model - Model entry with Anthropic-specific config
 * @param prompt - User prompt text
 * @param options - Call options including images, systemPrompt, maxTokens
 * @returns LLM call result with text, usage (mapped from Anthropic format), and stop reason
 */
async function callAnthropic(model: ModelEntry, prompt: string, options: CallOptions): Promise<LlmCallResult> {
    const apiKey = model.apiKey || getApiKey('anthropic');
    if (!apiKey) {
        throw new Error('Anthropic API key not configured. Set it in the Models page.');
    }

    // Inject JSON schema into system prompt for better structure adherence
    let systemPrompt = options.systemPrompt || '';
    if (options.jsonSchema) {
        const schemaBlock = `\n\nYou MUST return valid JSON conforming to this JSON Schema:\n${JSON.stringify(options.jsonSchema.schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no extra text.`;
        systemPrompt += schemaBlock;
    }

    const requestBody = {
        model: model.model,
        max_tokens: options.maxTokens || 16384,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        // Explicitly disable extended thinking when noThink is set.
        // Thinking is opt-in for Claude, but models with adaptive thinking
        // (Opus 4.6+) may auto-engage it — this ensures it stays off.
        ...(model.noThink ? { thinking: { type: 'disabled' } } : {}),
        messages: [{
            role: 'user',
            content: options.images && options.images.length > 0
                ? [
                    ...options.images.map(img => ({
                        type: 'image' as const,
                        source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
                    })),
                    { type: 'text' as const, text: prompt },
                ]
                : prompt,
        }],
    };

    convLog(`REQUEST callAnthropic → ${model.model}`, { noThink: model.noThink, body: requestBody });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        signal: createFetchSignal(options.signal, options.requestTimeout),
    });

    if (!response.ok) {
        const error = await response.text();
        convLog(`ERROR callAnthropic → ${model.model}`, { status: response.status, error });
        throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    convLog(`RESPONSE callAnthropic → ${model.model}`, data);
    const text = data.content[0].text;

    // Anthropic usage: { input_tokens, output_tokens }
    const usage: LlmUsage | undefined = data.usage ? {
        prompt_tokens: data.usage.input_tokens || 0,
        completion_tokens: data.usage.output_tokens || 0,
        tool_tokens: 0,
        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined;

    return { text, usage, finishReason: data.stop_reason };
}

// =============================================================================
// OPENAI-COMPATIBLE
// =============================================================================

/**
 * Call an OpenAI-compatible chat completions endpoint (OpenAI, LM Studio, Z.AI, Groq, etc.).
 * Handles thinking level control, unsupported parameter auto-discovery on 400 errors,
 * structured output formatting, and KV cache busting via unique user IDs.
 * @param model - Model entry with endpoint and provider info
 * @param prompt - User prompt text
 * @param options - Call options including sampling params, images, JSON schema
 * @returns LLM call result with text, usage, and finish reason
 */
async function callOpenAICompatible(model: ModelEntry, prompt: string, options: CallOptions): Promise<LlmCallResult> {
    const endpoint = model.endpoint || resolveProviderEndpoint(model.provider);
    const modelName = model.model || model.name;

    const messages: any[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });

    // Build user message — multimodal if images are provided
    if (options.images && options.images.length > 0) {
        const content: any[] = options.images.map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.media_type};base64,${img.data}` },
        }));
        content.push({ type: 'text', text: prompt });
        messages.push({ role: 'user', content });
    } else {
        messages.push({ role: 'user', content: prompt });
    }

    const requestBody: any = {
        model: modelName,
        messages,
        stream: false,
        // Prevent LM Studio / llama.cpp from reusing KV cache across calls.
        // A unique user ID per request forces a fresh context each time.
        user: `podbit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    // Only include optional parameters when they have actual values —
    // some OpenAI-compatible APIs (e.g. Z.AI) reject null/undefined params
    if (options.maxTokens != null) requestBody.max_tokens = options.maxTokens;
    if (options.temperature != null) requestBody.temperature = options.temperature;
    if (options.repeatPenalty != null) requestBody.frequency_penalty = options.repeatPenalty;
    if (options.topP != null) requestBody.top_p = options.topP;
    // Extension sampling params — may not be supported by all endpoints.
    // Unsupported params are auto-discovered and stripped (see retry loop below).
    const endpointHost = new URL(endpoint).host;
    const unsupported = _unsupportedParams.get(endpointHost);
    if (options.minP != null && !unsupported?.has('min_p')) requestBody.min_p = options.minP;
    if (options.topK != null && !unsupported?.has('top_k')) requestBody.top_k = options.topK;

    // Thinking level: apply provider-specific mechanisms
    if (model.thinkingLevel) {
        applyThinkingLevel(requestBody, modelName, model.thinkingLevel);
    } else if (model.noThink) {
        applyThinkingLevel(requestBody, modelName, 'off');
    }

    const fmt = buildProviderResponseFormat(model.provider, options.jsonSchema, options.responseFormat);
    if (fmt) requestBody.response_format = fmt;

    // For providers that use json_object mode (no native json_schema support),
    // inject the schema definition into the system prompt per Z.AI best practice
    injectSchemaIntoPrompt(messages, model.provider, options.jsonSchema);

    // Z.AI: strip unsupported parameters, enable streaming for connection keepalive.
    // Only trigger for actual Z.AI endpoints — NOT for local models with 'glm' in the name.
    const isZai = endpoint.includes('z.ai');
    if (isZai) {
        requestBody.stream = true;             // Z.AI drops idle connections at ~300s; streaming keeps alive
        delete requestBody.frequency_penalty;  // not supported
        delete requestBody.presence_penalty;   // not supported
        delete requestBody.logprobs;           // not supported
        delete requestBody.top_logprobs;       // not supported
        delete requestBody.seed;               // not supported
        delete requestBody.n;                  // not supported
        delete requestBody.user;               // Z.AI rejects custom user field
        delete requestBody.min_p;
        delete requestBody.top_k;
        console.log(`[llm] Z.AI request keys: ${Object.keys(requestBody).join(', ')}`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = model.apiKey || getApiKey(model.provider);
    if (key) {
        headers['Authorization'] = `Bearer ${key}`;
    }

    const url = endpoint.endsWith('/chat/completions')
        ? endpoint
        : `${endpoint.replace(/\/+$/, '')}/chat/completions`;

    convLog(`REQUEST callOpenAICompatible → ${modelName}`, { url, provider: model.provider, noThink: model.noThink, body: requestBody });

    // Retry loop: auto-discover unsupported params and strip them
    let response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: createFetchSignal(options.signal, options.requestTimeout),
    });

    if (!response.ok) {
        const error = await response.text();
        let retried = false;

        if (response.status === 400) {
            // Auto-strip unsupported properties and retry
            const strippableProps = ['min_p', 'top_k', 'frequency_penalty'];
            const propMatch = error.match(/property\s+'([^']+)'\s+is unsupported/i);
            const prop = propMatch?.[1];
            if (prop && strippableProps.includes(prop) && prop in requestBody) {
                delete requestBody[prop];
                if (!_unsupportedParams.has(endpointHost)) _unsupportedParams.set(endpointHost, new Set());
                _unsupportedParams.get(endpointHost)!.add(prop);
                console.error(`[llm] ${endpointHost} does not support '${prop}' — stripped and cached`);
                _persistUnsupportedParams();
                response = await fetch(url, {
                    method: 'POST', headers, body: JSON.stringify(requestBody),
                    signal: createFetchSignal(options.signal, options.requestTimeout),
                });
                retried = true;
            }

            // json_schema validation failure — model doesn't support structured output.
            // Downgrade to json_object mode and inject schema into prompt, then retry.
            if (!retried && error.includes('json_validate_failed') && requestBody.response_format?.type === 'json_schema') {
                console.error(`[llm] ${modelName} rejected json_schema structured output — falling back to json_object with prompt injection`);
                requestBody.response_format = { type: 'json_object' };
                // Inject schema into the prompt so the model knows what to produce
                const schema = requestBody.response_format?.json_schema?.schema || options.jsonSchema?.schema;
                if (schema) {
                    const schemaInstruction = `\n\nYou MUST return valid JSON conforming to this JSON Schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no extra text.`;
                    const sysMsg = messages.find((m: any) => m.role === 'system');
                    if (sysMsg) { sysMsg.content += schemaInstruction; }
                    else { messages.unshift({ role: 'system', content: schemaInstruction }); }
                }
                // Update the request body with mutated messages
                requestBody.messages = messages;
                response = await fetch(url, {
                    method: 'POST', headers, body: JSON.stringify(requestBody),
                    signal: createFetchSignal(options.signal, options.requestTimeout),
                });
                retried = true;
            }
        }

        if (!response.ok) {
            if (!retried) convLog(`ERROR callOpenAICompatible → ${modelName}`, { status: response.status, error });
            const finalError = retried ? await response.text() : error;
            throw new Error(`${model.provider} API error (${response.status}): ${finalError}`);
        }
    }

    // Z.AI uses streaming — read SSE chunks; others use normal JSON response
    if (isZai) {
        const result = await readStreamingResponse(response);
        convLog(`RESPONSE callOpenAICompatible (streaming) -> ${modelName}`, { textLen: result.text?.length, finishReason: result.finishReason, usage: result.usage });
        if (!result.text) {
            const lengthHint = result.finishReason === 'length'
                ? ` — model exhausted output budget on reasoning/chain-of-thought with nothing left for the response. Increase max_tokens in the model registry (Models page)`
                : '';
            throw new Error(`${model.provider} returned empty content from ${modelName} (streaming, finish_reason=${result.finishReason}, max_tokens=${options.maxTokens})${lengthHint}`);
        }
        if (result.finishReason === 'length') {
            console.warn(`[llm] ${modelName} output truncated (finish_reason=length, max_tokens=${options.maxTokens}) — returning partial content`);
        }
        return result;
    }

    const data = await response.json() as any;
    convLog(`RESPONSE callOpenAICompatible → ${modelName}`, data);
    const content = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;
    if (!content) {
        const lengthHint = finishReason === 'length'
            ? ` — model exhausted output budget on reasoning/chain-of-thought with nothing left for the response. Increase max_tokens in the model registry (Models page)`
            : '';
        throw new Error(`${model.provider} returned empty content from ${modelName} (finish_reason=${finishReason}, max_tokens=${options.maxTokens})${lengthHint}`);
    }
    if (finishReason === 'length') {
        console.warn(`[llm] ${modelName} output truncated (finish_reason=length, max_tokens=${options.maxTokens}) — returning partial content`);
    }

    // OpenAI usage: { prompt_tokens, completion_tokens, total_tokens, completion_tokens_details? }
    const usage: LlmUsage | undefined = data.usage ? {
        prompt_tokens: data.usage.prompt_tokens || 0,
        completion_tokens: data.usage.completion_tokens || 0,
        tool_tokens: data.usage.completion_tokens_details?.reasoning_tokens || 0,
        total_tokens: data.usage.total_tokens || 0,
    } : undefined;

    return { text: content, usage, finishReason };
}

// =============================================================================
// LOCAL MODELS (Ollama native API — NOT OpenAI-compatible)
// =============================================================================

/**
 * Call an Ollama model using the native /api/generate endpoint (NOT OpenAI-compatible).
 * Supports Ollama-specific features: think toggle, JSON format, vision (base64 images).
 * @param model - Model entry for a local Ollama model
 * @param prompt - User prompt text
 * @param options - Call options including sampling params, images, JSON format
 * @returns LLM call result with text, usage (from Ollama eval counts), and finish status
 */
async function callLocalModel(model: ModelEntry, prompt: string, options: CallOptions): Promise<LlmCallResult> {
    const endpoint = model.endpoint || process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';

    const requestBody: any = {
        model: model.name,
        prompt: prompt,
        stream: false,
        // Ollama's native think toggle — works across DeepSeek R1, Qwen3, QwQ, etc.
        ...(model.noThink ? { think: false } : {}),
        ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
        ...(options.images && options.images.length > 0 ? { images: options.images.map(img => img.data) } : {}),
        options: {
            ...(options.maxTokens != null ? { num_predict: options.maxTokens } : {}),
            temperature: options.temperature,
            ...(options.repeatPenalty != null ? { repeat_penalty: options.repeatPenalty } : {}),
            ...(options.topP != null ? { top_p: options.topP } : {}),
            ...(options.minP != null ? { min_p: options.minP } : {}),
            ...(options.topK != null ? { top_k: options.topK } : {}),
        },
    };

    const fmt = buildProviderResponseFormat('local', options.jsonSchema, options.responseFormat);
    if (fmt === 'json') requestBody.format = 'json';

    // Inject JSON schema into system prompt for better structure adherence
    if (options.jsonSchema) {
        const schemaBlock = `\n\nYou MUST return valid JSON conforming to this JSON Schema:\n${JSON.stringify(options.jsonSchema.schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no extra text.`;
        requestBody.system = (requestBody.system || '') + schemaBlock;
    }

    const generateUrl = `${endpoint}/api/generate`;
    convLog(`REQUEST callLocalModel → ${model.name}`, { url: generateUrl, noThink: model.noThink, body: requestBody });

    const response = await fetch(generateUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: createFetchSignal(options.signal, options.requestTimeout),
    });

    if (!response.ok) {
        const error = await response.text();
        convLog(`ERROR callLocalModel → ${model.name}`, { status: response.status, error });
        throw new Error(`Local model error: ${response.status} ${error}`);
    }

    const data = await response.json() as any;
    convLog(`RESPONSE callLocalModel → ${model.name}`, { response: data.response?.slice(0, 2000), done: data.done, eval_count: data.eval_count, prompt_eval_count: data.prompt_eval_count });

    // Ollama usage: prompt_eval_count (input), eval_count (output)
    const promptTokens = data.prompt_eval_count || 0;
    const completionTokens = data.eval_count || 0;
    const usage: LlmUsage | undefined = (promptTokens || completionTokens) ? {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        tool_tokens: 0,
        total_tokens: promptTokens + completionTokens,
    } : undefined;

    return { text: data.response, usage, finishReason: data.done ? 'stop' : undefined };
}
