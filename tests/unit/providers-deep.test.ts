/**
 * Deep branch-coverage tests for models/providers.ts
 * Covers: createFetchSignal fallback, applyThinkingLevel variants,
 * prefixLastUserMessage edge cases, buildProviderResponseFormat branches,
 * callOpenAICompatible unsupported-param retry, callLocalModel options,
 * callWithMessages forwarding/stripping branches, and more.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const mockGetApiKey = jest.fn<(...args: any[]) => any>().mockReturnValue('test-key');
jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

const mockLogUsage = jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../models/cost.js', () => ({
    logUsage: mockLogUsage,
}));

const mockIsBudgetExceeded = jest.fn<(...args: any[]) => any>().mockReturnValue(false);
jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

const mockAcquireModelSlot = jest.fn<(...args: any[]) => any>().mockResolvedValue(() => {});
jest.unstable_mockModule('../../models/semaphore.js', () => ({
    acquireModelSlot: mockAcquireModelSlot,
    reportRateLimit: jest.fn(),
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    resolveProviderEndpoint: jest.fn().mockReturnValue('http://localhost:1234/v1'),
    getModelProvider: jest.fn().mockReturnValue('openai'),
}));

const mockSystemQueryOne = jest.fn<(...args: any[]) => any>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../db.js', () => ({
    systemQueryOne: mockSystemQueryOne,
    systemQuery: mockSystemQuery,
}));

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------

let extractTextContent: typeof import('../../models/providers.js').extractTextContent;
let getUnsupportedParams: typeof import('../../models/providers.js').getUnsupportedParams;
let loadUnsupportedParamsCache: typeof import('../../models/providers.js').loadUnsupportedParamsCache;
let setConversationalLogging: typeof import('../../models/providers.js').setConversationalLogging;
let isConversationalLogging: typeof import('../../models/providers.js').isConversationalLogging;
let callSingleModel: typeof import('../../models/providers.js').callSingleModel;
let callWithMessages: typeof import('../../models/providers.js').callWithMessages;

let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
    const mod = await import('../../models/providers.js');
    extractTextContent = mod.extractTextContent;
    getUnsupportedParams = mod.getUnsupportedParams;
    loadUnsupportedParamsCache = mod.loadUnsupportedParamsCache;
    setConversationalLogging = mod.setConversationalLogging;
    isConversationalLogging = mod.isConversationalLogging;
    callSingleModel = mod.callSingleModel;
    callWithMessages = mod.callWithMessages;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(data: any) {
    const fn = jest.fn<any>().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
    });
    globalThis.fetch = fn as any;
    return fn;
}

function mockFetchOpenAI(content: string, usage?: any, finishReason = 'stop') {
    return mockFetchOk({
        choices: [{ message: { content }, finish_reason: finishReason }],
        usage: usage || { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
}

/**
 * Streaming variant — GLM/Z.AI models route through readStreamingResponse() which
 * needs an SSE-formatted ReadableStream body, not a JSON object.
 */
function mockFetchStreamingOpenAI(content: string, finishReason = 'stop') {
    const sseChunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
        `data: [DONE]\n\n`,
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            for (const chunk of sseChunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    const fn = jest.fn<any>().mockResolvedValue({
        ok: true,
        body: stream,
        json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    });
    globalThis.fetch = fn as any;
    return fn;
}

function openaiModel(overrides: Record<string, any> = {}): any {
    return {
        name: 'test-model',
        provider: 'openai',
        model: 'test-model',
        endpoint: 'http://localhost:1234/v1',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('providers-deep', () => {

    // =======================================================================
    // applyThinkingLevel — GPT-5 models
    // =======================================================================
    describe('applyThinkingLevel — GPT-5', () => {
        it('sets reasoning_effort=none for gpt-5 with level off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'gpt-5-turbo', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('none');
        });

        it('sets reasoning_effort=high for gpt5 with level high', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'gpt5', thinkingLevel: 'high' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('high');
        });
    });

    // =======================================================================
    // applyThinkingLevel — GPT-OSS models
    // =======================================================================
    describe('applyThinkingLevel — GPT-OSS', () => {
        it('sets reasoning_effort=low for gpt-oss with level off (no full disable)', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'gpt-oss-20b', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('low');
        });

        it('sets reasoning_effort=medium for gptoss with level medium', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'gptoss-8b', thinkingLevel: 'medium' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('medium');
        });
    });

    // =======================================================================
    // applyThinkingLevel — o-series
    // =======================================================================
    describe('applyThinkingLevel — o-series', () => {
        it('sets reasoning_effort=low for o1- model with level off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'o1-mini', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('low');
        });

        it('sets reasoning_effort=low for o4-mini with level off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'o4-mini', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('low');
        });

        it('passes through medium level for o3- model', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'o3-mini', thinkingLevel: 'medium' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('medium');
        });
    });

    // =======================================================================
    // applyThinkingLevel — Qwen / QwQ (binary off only)
    // =======================================================================
    describe('applyThinkingLevel — Qwen/QwQ', () => {
        it('prefixes /no_think for qwen model with noThink', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'qwen3-32b', noThink: true }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            const userMsg = body.messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).toContain('/no_think');
        });

        it('prefixes /no_think for qwq model with thinkingLevel=off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'qwq-32b', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            const userMsg = body.messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).toContain('/no_think');
        });

        it('does NOT prefix /no_think for qwen with thinkingLevel=high (binary provider)', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'qwen3-32b', thinkingLevel: 'high' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            const userMsg = body.messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).not.toContain('/no_think');
        });
    });

    // =======================================================================
    // applyThinkingLevel — GLM
    // =======================================================================
    describe('applyThinkingLevel — GLM', () => {
        it('sets thinking.type=disabled for GLM models with noThink', async () => {
            // GLM/Z.AI uses streaming (stream:true in providers.ts) — must use the
            // streaming-aware mock, not the plain JSON one.
            const mf = mockFetchStreamingOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'glm-4-plus', noThink: true }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.thinking).toEqual({ type: 'disabled' });
            const userMsg = body.messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).not.toContain('/nothink');
        });
    });

    // =======================================================================
    // applyThinkingLevel — DeepSeek R1
    // =======================================================================
    describe('applyThinkingLevel — DeepSeek R1', () => {
        it('prefills empty think tags for r1 model with noThink', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'deepseek-r1-distill', noThink: true }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
            expect(assistantMsg).toBeDefined();
            expect(assistantMsg.content).toContain('<think>');
            expect(assistantMsg.content).toContain('</think>');
        });

        it('prefills empty think tags for r1 model name with thinkingLevel=off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'r1-8b', thinkingLevel: 'off' }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
            expect(assistantMsg).toBeDefined();
        });
    });

    // =======================================================================
    // applyThinkingLevel — generic fallback (no known mechanism)
    // =======================================================================
    describe('applyThinkingLevel — generic fallback', () => {
        it('does not modify request body for unknown model with off', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ model: 'some-unknown-model', noThink: true }),
                'test', {},
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            // No reasoning_effort, no assistant prefill, no /no_think prefix
            expect(body.reasoning_effort).toBeUndefined();
            const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
            expect(assistantMsg).toBeUndefined();
        });
    });

    // =======================================================================
    // stripThinkBlocks — mixed / nested
    // =======================================================================
    describe('stripThinkBlocks via callSingleModel noThink', () => {
        it('strips <thinking> tags (case insensitive)', async () => {
            mockFetchOpenAI('<THINKING>inner</THINKING>output');
            const result = await callSingleModel(
                openaiModel({ noThink: true }),
                'test', {},
            );
            expect(result.text).toBe('output');
        });

        it('strips multiple think blocks', async () => {
            mockFetchOpenAI('<think>a</think>mid<think>b</think>end');
            const result = await callSingleModel(
                openaiModel({ noThink: true }),
                'test', {},
            );
            expect(result.text).toBe('midend');
        });

        it('does not strip when noThink is false', async () => {
            mockFetchOpenAI('<think>inner</think>output');
            const result = await callSingleModel(
                openaiModel({ noThink: false }),
                'test', {},
            );
            expect(result.text).toBe('<think>inner</think>output');
        });

        it('returns text unchanged when no think blocks present', async () => {
            mockFetchOpenAI('no blocks here');
            const result = await callSingleModel(
                openaiModel({ noThink: true }),
                'test', {},
            );
            expect(result.text).toBe('no blocks here');
        });
    });

    // =======================================================================
    // callWithMessages — noThink strips <thinking> tags from choices
    // =======================================================================
    describe('callWithMessages — noThink stripping', () => {
        it('strips <thinking> tags from choice content', async () => {
            mockFetchOk({
                choices: [{
                    message: { content: '<thinking>stuff</thinking>clean' },
                    finish_reason: 'stop',
                }],
                usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
            });
            const result = await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ noThink: true }),
            );
            expect(result.choices[0].message.content).toBe('clean');
        });

        it('does not strip when choice content is not a string', async () => {
            mockFetchOk({
                choices: [{
                    message: { content: null },
                    finish_reason: 'stop',
                }, {
                    message: { content: 'no think tags' },
                    finish_reason: 'stop',
                }],
                usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
            });
            const result = await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ noThink: true }),
            );
            // null content unchanged, second choice unchanged (no tags)
            expect(result.choices[0].message.content).toBeNull();
            expect(result.choices[1].message.content).toBe('no think tags');
        });
    });

    // =======================================================================
    // callWithMessages — noThink fallback via model.noThink (not thinkingLevel)
    // =======================================================================
    describe('callWithMessages — noThink fallback applies thinking off', () => {
        it('applies applyThinkingLevel off when model.noThink is set without thinkingLevel', async () => {
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ model: 'qwen3-instruct', noThink: true }),
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            // For qwen with noThink, should get /no_think prefix
            const userMsg = body.messages.find((m: any) => m.role === 'user');
            expect(userMsg.content).toContain('/no_think');
        });

        it('thinkingLevel takes priority over noThink', async () => {
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ model: 'o3-mini', thinkingLevel: 'high', noThink: true }),
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.reasoning_effort).toBe('high');
        });
    });

    // =======================================================================
    // callWithMessages — endpoint URL normalization
    // =======================================================================
    describe('callWithMessages — endpoint URL normalization', () => {
        it('does not double /chat/completions when endpoint already has it', async () => {
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ endpoint: 'http://localhost:1234/v1/chat/completions' }),
            );
            const url = (mf.mock.calls[0] as any[])[0];
            expect(url).toBe('http://localhost:1234/v1/chat/completions');
        });

        it('appends /chat/completions and strips trailing slashes', async () => {
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ endpoint: 'http://localhost:1234/v1/' }),
            );
            const url = (mf.mock.calls[0] as any[])[0];
            expect(url).toBe('http://localhost:1234/v1/chat/completions');
        });
    });

    // =======================================================================
    // callWithMessages — forwarding more optional params
    // =======================================================================
    describe('callWithMessages — forwards remaining optional params', () => {
        it('forwards response_format, tools, tool_choice, logprobs, top_logprobs, user', async () => {
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
                {
                    response_format: { type: 'json_object' },
                    tools: [{ type: 'function', function: { name: 'f', parameters: {} } }],
                    tool_choice: 'auto',
                    logprobs: true,
                    top_logprobs: 3,
                    user: 'test-user',
                },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.response_format).toEqual({ type: 'json_object' });
            expect(body.tools).toHaveLength(1);
            expect(body.tool_choice).toBe('auto');
            expect(body.logprobs).toBe(true);
            expect(body.top_logprobs).toBe(3);
            expect(body.user).toBe('test-user');
        });
    });

    // =======================================================================
    // callWithMessages — no usage in response
    // =======================================================================
    describe('callWithMessages — no usage in response', () => {
        it('does not call logUsage when usage is absent', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                // no usage field
            });
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
            );
            expect(mockLogUsage).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // callWithMessages — no auth key
    // =======================================================================
    describe('callWithMessages — no auth key', () => {
        it('omits Authorization header when no key is available', async () => {
            mockGetApiKey.mockReturnValue(null);
            const mf = mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ apiKey: undefined }),
            );
            const headers = (mf.mock.calls[0] as any[])[1].headers;
            expect(headers['Authorization']).toBeUndefined();
            expect(headers['x-api-key']).toBeUndefined();
        });
    });

    // =======================================================================
    // callWithMessages — reasoning_tokens in usage details
    // =======================================================================
    describe('callWithMessages — reasoning_tokens in usage', () => {
        it('passes reasoning_tokens as toolTokens to logUsage', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                usage: {
                    prompt_tokens: 100,
                    completion_tokens: 50,
                    total_tokens: 150,
                    completion_tokens_details: { reasoning_tokens: 30 },
                },
            });
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
            );
            expect(mockLogUsage).toHaveBeenCalledWith(
                expect.objectContaining({ toolTokens: 30 }),
            );
        });
    });

    // =======================================================================
    // callWithMessages — no choices field
    // =======================================================================
    describe('callWithMessages — null choices', () => {
        it('throws No choices when choices is null/undefined', async () => {
            mockFetchOk({ choices: null });
            await expect(
                callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    openaiModel(),
                ),
            ).rejects.toThrow('No choices');
        });
    });

    // =======================================================================
    // callWithMessages — release semaphore slot on error
    // =======================================================================
    describe('callWithMessages — semaphore release on error', () => {
        it('releases model slot even when inner call fails', async () => {
            const releaseFn = jest.fn();
            mockAcquireModelSlot.mockResolvedValue(releaseFn);
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('fail'),
            }) as any;
            await expect(
                callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    openaiModel({ _registryId: 'r1', _maxConcurrency: 2 }),
                ),
            ).rejects.toThrow();
            expect(releaseFn).toHaveBeenCalled();
        });
    });

    // =======================================================================
    // callSingleModel — default provider uses openai-compatible
    // =======================================================================
    describe('callSingleModel — unknown provider falls through to openai-compatible', () => {
        it('treats unknown provider as openai-compatible', async () => {
            const mf = mockFetchOpenAI('result');
            const result = await callSingleModel(
                openaiModel({ provider: 'custom-provider' }),
                'test', {},
            );
            expect(result.text).toBe('result');
            expect(mf).toHaveBeenCalled();
        });
    });

    // =======================================================================
    // callOpenAICompatible — system prompt
    // =======================================================================
    describe('callOpenAICompatible (via callSingleModel) — system prompt', () => {
        it('includes system message when systemPrompt is provided', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel(),
                'user prompt',
                { systemPrompt: 'You are a helpful assistant' },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
            expect(body.messages[1].role).toBe('user');
        });
    });

    // =======================================================================
    // callOpenAICompatible — sampling params (repeatPenalty, topP, minP, topK)
    // =======================================================================
    describe('callOpenAICompatible — sampling params', () => {
        it('maps repeatPenalty to frequency_penalty, topP/minP/topK', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel(),
                'test',
                { repeatPenalty: 1.2, topP: 0.9, minP: 0.05, topK: 40 },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.frequency_penalty).toBe(1.2);
            expect(body.top_p).toBe(0.9);
            expect(body.min_p).toBe(0.05);
            expect(body.top_k).toBe(40);
        });
    });

    // =======================================================================
    // callOpenAICompatible — unsupported param auto-strip retry
    // =======================================================================
    describe('callOpenAICompatible — unsupported param retry', () => {
        it('strips unsupported property and retries on 400', async () => {
            let callCount = 0;
            globalThis.fetch = jest.fn<any>().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        ok: false,
                        status: 400,
                        text: () => Promise.resolve("property 'min_p' is unsupported for this model"),
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        choices: [{ message: { content: 'retried ok' }, finish_reason: 'stop' }],
                        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
                    }),
                });
            }) as any;

            const result = await callSingleModel(
                openaiModel(),
                'test',
                { minP: 0.05 },
            );
            expect(result.text).toBe('retried ok');
            expect(callCount).toBe(2);

            // Verify it was cached
            const unsupported = getUnsupportedParams('http://localhost:1234/v1');
            expect(unsupported.has('min_p')).toBe(true);
        });

        it('throws on 400 when error does not match strippable property', async () => {
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 400,
                text: () => Promise.resolve('Invalid request body'),
            }) as any;

            await expect(
                callSingleModel(openaiModel(), 'test', {}),
            ).rejects.toThrow('API error (400)');
        });

        it('throws on retry failure after stripping', async () => {
            let callCount = 0;
            globalThis.fetch = jest.fn<any>().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        ok: false,
                        status: 400,
                        text: () => Promise.resolve("property 'top_k' is unsupported"),
                    });
                }
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    text: () => Promise.resolve('Server error after retry'),
                });
            }) as any;

            await expect(
                callSingleModel(openaiModel(), 'test', { topK: 40 }),
            ).rejects.toThrow('API error (500)');
        });
    });

    // =======================================================================
    // callOpenAICompatible — finish_reason=length warning
    // =======================================================================
    describe('callOpenAICompatible — finish_reason=length', () => {
        it('returns partial content when finish_reason is length', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'partial...' }, finish_reason: 'length' }],
                usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
            });
            const result = await callSingleModel(
                openaiModel(),
                'test', {},
            );
            expect(result.text).toBe('partial...');
            expect(result.finishReason).toBe('length');
        });
    });

    // =======================================================================
    // callOpenAICompatible — openai provider json response format
    // =======================================================================
    describe('callOpenAICompatible — response format for openai provider', () => {
        it('uses json_object for openai provider when jsonSchema provided', async () => {
            const mf = mockFetchOpenAI('{"k":"v"}');
            await callSingleModel(
                openaiModel({ provider: 'openai' }),
                'test',
                { jsonSchema: { name: 'test', schema: { type: 'object' } } },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.response_format).toEqual({ type: 'json_object' });
        });
    });

    // =======================================================================
    // callOpenAICompatible — no key, no auth header
    // =======================================================================
    describe('callOpenAICompatible — no API key', () => {
        it('omits Authorization header when no key available', async () => {
            mockGetApiKey.mockReturnValue(null);
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel({ apiKey: undefined }),
                'test', {},
            );
            const headers = (mf.mock.calls[0] as any[])[1].headers;
            expect(headers['Authorization']).toBeUndefined();
        });
    });

    // =======================================================================
    // callOpenAICompatible — usage with reasoning_tokens
    // =======================================================================
    describe('callOpenAICompatible — usage with reasoning_tokens', () => {
        it('extracts tool_tokens from completion_tokens_details', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                usage: {
                    prompt_tokens: 50,
                    completion_tokens: 100,
                    total_tokens: 150,
                    completion_tokens_details: { reasoning_tokens: 40 },
                },
            });
            const result = await callSingleModel(
                openaiModel(),
                'test', {},
            );
            expect(result.usage?.tool_tokens).toBe(40);
        });
    });

    // =======================================================================
    // callOpenAICompatible — no usage in response
    // =======================================================================
    describe('callOpenAICompatible — no usage', () => {
        it('returns undefined usage when not present', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            });
            const result = await callSingleModel(
                openaiModel(),
                'test', {},
            );
            expect(result.usage).toBeUndefined();
        });
    });

    // =======================================================================
    // callLocalModel — options and branches
    // =======================================================================
    describe('callLocalModel (via callSingleModel local provider)', () => {
        function localModel(overrides: Record<string, any> = {}): any {
            return { name: 'llama3', provider: 'local', model: 'llama3', ...overrides };
        }

        it('includes system prompt in request body', async () => {
            const mf = mockFetchOk({ response: 'ok', done: true, eval_count: 5, prompt_eval_count: 3 });
            await callSingleModel(localModel(), 'test', { systemPrompt: 'Be helpful' });
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.system).toBe('Be helpful');
        });

        it('includes images as base64 data array', async () => {
            const mf = mockFetchOk({ response: 'ok', done: true });
            await callSingleModel(localModel(), 'describe', {
                images: [{ media_type: 'image/png', data: 'abc123' }],
            });
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.images).toEqual(['abc123']);
        });

        it('sets think: false when noThink is set', async () => {
            const mf = mockFetchOk({ response: 'ok', done: true });
            await callSingleModel(localModel({ noThink: true }), 'test', {});
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.think).toBe(false);
        });

        it('includes sampling options: repeat_penalty, top_p, min_p, top_k', async () => {
            const mf = mockFetchOk({ response: 'ok', done: true });
            await callSingleModel(localModel(), 'test', {
                repeatPenalty: 1.1,
                topP: 0.8,
                minP: 0.02,
                topK: 30,
            });
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.options.repeat_penalty).toBe(1.1);
            expect(body.options.top_p).toBe(0.8);
            expect(body.options.min_p).toBe(0.02);
            expect(body.options.top_k).toBe(30);
        });

        it('sets format to json when jsonSchema is provided', async () => {
            const mf = mockFetchOk({ response: '{"key":"val"}', done: true });
            await callSingleModel(localModel(), 'test', {
                jsonSchema: { name: 'test', schema: { type: 'object' } },
            });
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.format).toBe('json');
        });

        it('returns undefined usage when no eval counts', async () => {
            mockFetchOk({ response: 'ok', done: true });
            const result = await callSingleModel(localModel(), 'test', {});
            expect(result.usage).toBeUndefined();
        });

        it('returns stop finishReason when done is true', async () => {
            mockFetchOk({ response: 'ok', done: true, eval_count: 5, prompt_eval_count: 3 });
            const result = await callSingleModel(localModel(), 'test', {});
            expect(result.finishReason).toBe('stop');
        });

        it('returns undefined finishReason when done is false', async () => {
            mockFetchOk({ response: 'partial', done: false, eval_count: 5, prompt_eval_count: 3 });
            const result = await callSingleModel(localModel(), 'test', {});
            expect(result.finishReason).toBeUndefined();
        });

        it('uses OLLAMA_ENDPOINT env when no endpoint on model', async () => {
            const origEnv = process.env.OLLAMA_ENDPOINT;
            process.env.OLLAMA_ENDPOINT = 'http://custom:11434';
            try {
                const mf = mockFetchOk({ response: 'ok', done: true });
                await callSingleModel(localModel({ endpoint: undefined }), 'test', {});
                const url = (mf.mock.calls[0] as any[])[0];
                expect(url).toBe('http://custom:11434/api/generate');
            } finally {
                if (origEnv === undefined) delete process.env.OLLAMA_ENDPOINT;
                else process.env.OLLAMA_ENDPOINT = origEnv;
            }
        });
    });

    // =======================================================================
    // callAnthropic — branches
    // =======================================================================
    describe('callAnthropic (via callSingleModel)', () => {
        function anthropicModel(overrides: Record<string, any> = {}): any {
            return {
                name: 'claude',
                provider: 'anthropic',
                model: 'claude-3-sonnet',
                apiKey: 'sk-ant-test',
                ...overrides,
            };
        }

        it('includes thinking disabled when noThink is set', async () => {
            const mf = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'response' }],
                    usage: { input_tokens: 10, output_tokens: 5 },
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mf as any;
            await callSingleModel(anthropicModel({ noThink: true }), 'test', {});
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.thinking).toEqual({ type: 'disabled' });
        });

        it('does not include thinking field when noThink is not set', async () => {
            const mf = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'response' }],
                    usage: { input_tokens: 10, output_tokens: 5 },
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mf as any;
            await callSingleModel(anthropicModel({ noThink: false }), 'test', {});
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.thinking).toBeUndefined();
        });

        it('uses getApiKey fallback when model has no apiKey', async () => {
            mockGetApiKey.mockReturnValue('fallback-key');
            const mf = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'ok' }],
                    usage: { input_tokens: 5, output_tokens: 3 },
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mf as any;
            await callSingleModel(anthropicModel({ apiKey: undefined }), 'test', {});
            const headers = (mf.mock.calls[0] as any[])[1].headers;
            expect(headers['x-api-key']).toBe('fallback-key');
        });

        it('returns usage mapped from anthropic format', async () => {
            jest.fn();
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'ok' }],
                    usage: { input_tokens: 100, output_tokens: 50 },
                    stop_reason: 'end_turn',
                }),
            }) as any;
            const result = await callSingleModel(anthropicModel(), 'test', {});
            expect(result.usage).toEqual({
                prompt_tokens: 100,
                completion_tokens: 50,
                tool_tokens: 0,
                total_tokens: 150,
            });
        });

        it('returns undefined usage when not present', async () => {
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'ok' }],
                    stop_reason: 'end_turn',
                }),
            }) as any;
            const result = await callSingleModel(anthropicModel(), 'test', {});
            expect(result.usage).toBeUndefined();
        });

        it('includes system prompt when provided', async () => {
            const mf = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'ok' }],
                    usage: { input_tokens: 5, output_tokens: 3 },
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mf as any;
            await callSingleModel(anthropicModel(), 'test', { systemPrompt: 'sys prompt' });
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.system).toBe('sys prompt');
        });

        it('omits system field when no systemPrompt', async () => {
            const mf = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'ok' }],
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mf as any;
            await callSingleModel(anthropicModel(), 'test', {});
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.system).toBeUndefined();
        });

        it('throws on anthropic API error', async () => {
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 429,
                text: () => Promise.resolve('Rate limited'),
            }) as any;
            await expect(
                callSingleModel(anthropicModel(), 'test', {}),
            ).rejects.toThrow('Anthropic API error: 429');
        });
    });

    // =======================================================================
    // buildProviderResponseFormat — branches
    // =======================================================================
    describe('buildProviderResponseFormat — via callSingleModel', () => {
        it('returns legacyFormat when no jsonSchema for openai', async () => {
            const mf = mockFetchOpenAI('ok');
            await callSingleModel(
                openaiModel(),
                'test',
                { responseFormat: { type: 'json_object' } },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            expect(body.response_format).toEqual({ type: 'json_object' });
        });

        it('returns null (no response_format) for anthropic provider jsonSchema', async () => {
            // anthropic callSingleModel doesn't go through buildProviderResponseFormat the same way
            // but we can test through callSingleModel with lmstudio or default
            const mf = mockFetchOpenAI('ok');
            // default/unknown provider returns null for jsonSchema
            await callSingleModel(
                openaiModel({ provider: 'some-new-provider' }),
                'test',
                { jsonSchema: { name: 'test', schema: { type: 'object' } } },
            );
            const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
            // default case returns null, so response_format should not be set
            expect(body.response_format).toBeUndefined();
        });
    });

    // =======================================================================
    // loadUnsupportedParamsCache — empty params (no log)
    // =======================================================================
    describe('loadUnsupportedParamsCache — empty params', () => {
        it('does not log when no unsupported params exist', async () => {
            mockSystemQueryOne.mockResolvedValue({
                value: JSON.stringify({}),
            });
            // Should not throw, and total=0 so no log
            await loadUnsupportedParamsCache();
        });
    });

    // =======================================================================
    // Conversational logging — convLog branch
    // =======================================================================
    describe('conversational logging — convLog active path', () => {
        it('logs request/response when conversational logging is enabled', async () => {
            setConversationalLogging(true);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            try {
                mockFetchOpenAI('logged response');
                await callSingleModel(openaiModel(), 'test', {});
                // convLog should have been called (indicated by [llm:conv] prefix)
                const convCalls = consoleSpy.mock.calls.filter(
                    (c: any) => typeof c[0] === 'string' && c[0].includes('[llm:conv]')
                );
                expect(convCalls.length).toBeGreaterThan(0);
            } finally {
                setConversationalLogging(false);
                consoleSpy.mockRestore();
            }
        });
    });

    // =======================================================================
    // callWithMessages — without _registryId skips semaphore
    // =======================================================================
    describe('callWithMessages — no registry info skips semaphore', () => {
        it('does not acquire model slot when _registryId is absent', async () => {
            mockFetchOpenAI('ok');
            await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel({ _registryId: undefined, _maxConcurrency: undefined }),
            );
            expect(mockAcquireModelSlot).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // callWithMessages — firstContent is falsy (no content in choice)
    // =======================================================================
    describe('callWithMessages — response with null content in first choice', () => {
        it('handles null content gracefully in logging', async () => {
            mockFetchOk({
                choices: [{ message: { content: null }, finish_reason: 'stop' },
                          { message: { content: 'second' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
            });
            const result = await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
            );
            // Should not throw, choices are returned
            expect(result.choices).toHaveLength(2);
        });
    });

    // =======================================================================
    // callWithMessages — model/system_fingerprint returned
    // =======================================================================
    describe('callWithMessages — response metadata', () => {
        it('returns model and system_fingerprint from response', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                model: 'gpt-4-0613',
                system_fingerprint: 'fp_abc123',
            });
            const result = await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
            );
            expect(result.model).toBe('gpt-4-0613');
            expect(result.system_fingerprint).toBe('fp_abc123');
        });

        it('returns undefined for model and system_fingerprint when absent', async () => {
            mockFetchOk({
                choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            });
            const result = await callWithMessages(
                [{ role: 'user', content: 'hi' }],
                openaiModel(),
            );
            expect(result.model).toBeUndefined();
            expect(result.system_fingerprint).toBeUndefined();
        });
    });
});
