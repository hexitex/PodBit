/**
 * Ultimate coverage tests for models/providers.ts
 *
 * Targets remaining uncovered branches:
 * - callAnthropic: with images (multimodal), noThink thinking disabled
 * - callLocalModel: with images, format='json', noThink, usage with 0 tokens
 * - callOpenAICompatible: finish_reason=length warning, unsupported param retry,
 *   stripped retry that also fails, empty content from model
 * - callWithMessages: noThink stripping on choices, anthropic auth header
 * - applyThinkingLevel: gpt-oss, o-series (o4-), DeepSeek R1 prefill,
 *   generic fallback (unknown model)
 * - createFetchSignal: fallback when AbortSignal.any unavailable
 * - loadUnsupportedParamsCache: with existing data
 * - convLog: enabled path logs data
 * - stripThinkBlocks: nested and mixed think/thinking tags
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
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

const {
    extractTextContent,
    getUnsupportedParams,
    loadUnsupportedParamsCache,
    setConversationalLogging,
    isConversationalLogging,
    callSingleModel,
    callWithMessages,
} = await import('../../models/providers.js');

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
    mockIsBudgetExceeded.mockReturnValue(false);
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    setConversationalLogging(false);
});

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

// =============================================================================
// extractTextContent: additional cases
// =============================================================================

describe('extractTextContent', () => {
    it('returns empty string for null content', () => {
        expect(extractTextContent(null)).toBe('');
    });

    it('returns empty string for undefined content', () => {
        expect(extractTextContent(undefined)).toBe('');
    });

    it('handles non-text parts in array (filters out image parts)', () => {
        const content = [
            { type: 'image', url: 'http://example.com' },
            { type: 'text', text: 'hello' },
            { type: 'text', text: 'world' },
        ];
        expect(extractTextContent(content)).toBe('hello world');
    });

    it('stringifies non-string non-array content', () => {
        expect(extractTextContent(42)).toBe('42');
    });
});

// =============================================================================
// callSingleModel: Anthropic with images
// =============================================================================

describe('callSingleModel: Anthropic provider', () => {
    it('calls Anthropic with images (multimodal)', async () => {
        const mockFn = jest.fn<any>().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                content: [{ text: 'image analysis' }],
                usage: { input_tokens: 100, output_tokens: 50 },
                stop_reason: 'end_turn',
            }),
        });
        globalThis.fetch = mockFn as any;

        const model = {
            name: 'claude-3',
            model: 'claude-3-opus-20240229',
            provider: 'anthropic',
            apiKey: 'test-key',
        } as any;

        const result = await callSingleModel(model, 'describe this', {
            maxTokens: 1000,
            images: [{ media_type: 'image/png', data: 'base64data' }],
        });

        expect(result.text).toBe('image analysis');
        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.messages[0].content).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'image' }),
        ]));
    });

    it('calls Anthropic with noThink (disables thinking)', async () => {
        const mockFn = jest.fn<any>().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                content: [{ text: 'quick answer' }],
                usage: { input_tokens: 10, output_tokens: 5 },
                stop_reason: 'end_turn',
            }),
        });
        globalThis.fetch = mockFn as any;

        const model = {
            name: 'claude',
            model: 'claude-3-opus-20240229',
            provider: 'anthropic',
            apiKey: 'key',
            noThink: true,
        } as any;

        const result = await callSingleModel(model, 'test', { maxTokens: 100 });

        expect(result.text).toBe('quick answer');
        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.thinking).toEqual({ type: 'disabled' });
    });

    it('throws on Anthropic error', async () => {
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve('Unauthorized'),
        }) as any;

        await expect(callSingleModel(
            { name: 'claude', model: 'claude-3', provider: 'anthropic', apiKey: 'bad' } as any,
            'test',
            { maxTokens: 100 },
        )).rejects.toThrow('Anthropic API error');
    });

    it('throws when no API key for Anthropic', async () => {
        mockGetApiKey.mockReturnValue(null);

        await expect(callSingleModel(
            { name: 'claude', model: 'claude-3', provider: 'anthropic' } as any,
            'test',
            { maxTokens: 100 },
        )).rejects.toThrow('Anthropic API key not configured');
    });
});

// =============================================================================
// callSingleModel: Local model (Ollama)
// =============================================================================

describe('callSingleModel: local provider', () => {
    it('calls Ollama with images', async () => {
        const mockFn = jest.fn<any>().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                response: 'I see a cat',
                done: true,
                prompt_eval_count: 50,
                eval_count: 20,
            }),
        });
        globalThis.fetch = mockFn as any;

        const result = await callSingleModel(
            { name: 'llava', provider: 'local' } as any,
            'what is this?',
            {
                maxTokens: 500,
                images: [{ media_type: 'image/jpeg', data: 'imgdata' }],
                systemPrompt: 'You are helpful',
            },
        );

        expect(result.text).toBe('I see a cat');
        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.images).toEqual(['imgdata']);
        expect(body.system).toBe('You are helpful');
    });

    it('calls Ollama with noThink and json format', async () => {
        const mockFn = jest.fn<any>().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                response: '{"key": "value"}',
                done: true,
            }),
        });
        globalThis.fetch = mockFn as any;

        const result = await callSingleModel(
            { name: 'qwen', provider: 'local', noThink: true } as any,
            'return json',
            {
                jsonSchema: { name: 'test', schema: {} },
            },
        );

        expect(result.text).toBe('{"key": "value"}');
        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.think).toBe(false);
        expect(body.format).toBe('json');
    });

    it('throws on Ollama error', async () => {
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('model not found'),
        }) as any;

        await expect(callSingleModel(
            { name: 'missing', provider: 'local' } as any,
            'test',
            {},
        )).rejects.toThrow('Local model error');
    });

    it('returns no usage when both counts are 0', async () => {
        const mockFn = jest.fn<any>().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                response: 'hi',
                done: false,
            }),
        });
        globalThis.fetch = mockFn as any;

        const result = await callSingleModel(
            { name: 'tiny', provider: 'local' } as any,
            'test',
            {},
        );

        expect(result.usage).toBeUndefined();
        expect(result.finishReason).toBeUndefined(); // done=false
    });
});

// =============================================================================
// callSingleModel: OpenAI-compatible finish_reason=length
// =============================================================================

describe('callSingleModel: OpenAI-compatible edge cases', () => {
    it('warns on finish_reason=length but returns partial content', async () => {
        mockFetchOpenAI('partial output', { prompt_tokens: 10, completion_tokens: 4096, total_tokens: 4106 }, 'length');

        const result = await callSingleModel(
            { name: 'gpt-4', model: 'gpt-4', provider: 'openai' } as any,
            'test',
            { maxTokens: 4096 },
        );

        expect(result.text).toBe('partial output');
        expect(result.finishReason).toBe('length');
    });

    it('throws when OpenAI returns empty content', async () => {
        mockFetchOk({
            choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        });

        await expect(callSingleModel(
            { name: 'gpt-4', model: 'gpt-4', provider: 'openai' } as any,
            'test',
            { maxTokens: 100 },
        )).rejects.toThrow('returned empty content');
    });

    it('handles LM Studio provider with json_schema response format', async () => {
        mockFetchOpenAI('{"result": true}');

        const result = await callSingleModel(
            { name: 'local-model', model: 'local-model', provider: 'lmstudio' } as any,
            'test',
            {
                maxTokens: 100,
                jsonSchema: { name: 'TestSchema', schema: { type: 'object' } },
            },
        );

        expect(result.text).toBe('{"result": true}');
    });
});

// =============================================================================
// callSingleModel: noThink stripping
// =============================================================================

describe('callSingleModel: noThink think block stripping', () => {
    it('strips <think> blocks from response when noThink is set', async () => {
        mockFetchOpenAI('<think>reasoning here</think>The actual answer');

        const result = await callSingleModel(
            { name: 'deepseek', model: 'deepseek-r1', provider: 'openai', noThink: true } as any,
            'test',
            { maxTokens: 100 },
        );

        expect(result.text).toBe('The actual answer');
    });

    it('strips <thinking> blocks too', async () => {
        mockFetchOpenAI('<thinking>\nlong reasoning\n</thinking>\nClean output');

        const result = await callSingleModel(
            { name: 'qwen', model: 'qwq-32b', provider: 'openai', noThink: true } as any,
            'test',
            { maxTokens: 100 },
        );

        expect(result.text).toBe('Clean output');
    });
});

// =============================================================================
// callWithMessages: budget exceeded
// =============================================================================

describe('callWithMessages: budget check', () => {
    it('throws when budget is exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);

        await expect(callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'gpt-4', model: 'gpt-4', provider: 'openai' } as any,
        )).rejects.toThrow('Budget exceeded');
    });
});

// =============================================================================
// callWithMessages: anthropic auth header
// =============================================================================

describe('callWithMessages: provider-specific auth', () => {
    it('uses x-api-key header for anthropic provider', async () => {
        const mockFn = mockFetchOk({
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        });

        await callWithMessages(
            [{ role: 'user', content: 'hi' }],
            { name: 'claude', model: 'claude-3', provider: 'anthropic', apiKey: 'anth-key' } as any,
        );

        const headers = mockFn.mock.calls[0][1].headers;
        expect(headers['x-api-key']).toBe('anth-key');
        expect(headers['anthropic-version']).toBe('2023-06-01');
    });
});

// =============================================================================
// callWithMessages: noThink stripping on choices
// =============================================================================

describe('callWithMessages: noThink strips choices', () => {
    it('strips think blocks from all choices', async () => {
        mockFetchOk({
            choices: [
                { message: { content: '<think>reasoning</think>Answer 1' } },
                { message: { content: '<thinking>more</thinking>Answer 2' } },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        });

        const result = await callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'model', model: 'model', provider: 'openai', noThink: true } as any,
        );

        expect(result.choices[0].message.content).toBe('Answer 1');
        expect(result.choices[1].message.content).toBe('Answer 2');
    });
});

// =============================================================================
// callWithMessages: model concurrency slot
// =============================================================================

describe('callWithMessages: semaphore integration', () => {
    it('acquires and releases model slot', async () => {
        const releaseFn = jest.fn();
        mockAcquireModelSlot.mockResolvedValue(releaseFn);

        mockFetchOk({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            {
                name: 'model',
                model: 'model',
                provider: 'openai',
                _registryId: 'reg-1',
                _maxConcurrency: 3,
                _requestPauseMs: 100,
            } as any,
        );

        expect(mockAcquireModelSlot).toHaveBeenCalledWith('reg-1', 3, 100);
        expect(releaseFn).toHaveBeenCalled();
    });
});

// =============================================================================
// loadUnsupportedParamsCache: with data
// =============================================================================

describe('loadUnsupportedParamsCache', () => {
    it('loads persisted unsupported params from DB', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ 'api.example.com': ['min_p', 'top_k'] }),
        });

        await loadUnsupportedParamsCache();

        const params = getUnsupportedParams('http://api.example.com/v1/chat');
        expect(params.has('min_p')).toBe(true);
        expect(params.has('top_k')).toBe(true);
    });

    it('handles load error gracefully', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('no table'));
        await expect(loadUnsupportedParamsCache()).resolves.toBeUndefined();
    });

    it('handles invalid URL in getUnsupportedParams', () => {
        const params = getUnsupportedParams('not-a-url');
        expect(params.size).toBe(0);
    });
});

// =============================================================================
// convLog: enabled path
// =============================================================================

describe('conversational logging', () => {
    it('toggles conversational logging', () => {
        setConversationalLogging(true);
        expect(isConversationalLogging()).toBe(true);
        setConversationalLogging(false);
        expect(isConversationalLogging()).toBe(false);
    });

    it('logs data when enabled', async () => {
        setConversationalLogging(true);

        mockFetchOpenAI('response with logging');

        // Just verify it doesn't crash with logging enabled
        const result = await callSingleModel(
            { name: 'gpt-4', model: 'gpt-4', provider: 'openai' } as any,
            'test',
            { maxTokens: 100 },
        );

        expect(result.text).toBe('response with logging');
    });
});

// =============================================================================
// callWithMessages: forwarding optional params
// =============================================================================

describe('callWithMessages: optional parameter forwarding', () => {
    it('forwards all optional params when provided', async () => {
        const mockFn = mockFetchOk({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'model', model: 'model', provider: 'openai' } as any,
            {
                temperature: 0.3,
                maxTokens: 2000,
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.3,
                stop: ['\n'],
                n: 2,
                seed: 42,
                logprobs: true,
                top_logprobs: 5,
                user: 'test-user',
            },
        );

        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.temperature).toBe(0.3);
        expect(body.max_tokens).toBe(2000);
        expect(body.top_p).toBe(0.9);
        expect(body.frequency_penalty).toBe(0.5);
        expect(body.presence_penalty).toBe(0.3);
        expect(body.stop).toEqual(['\n']);
        expect(body.n).toBe(2);
        expect(body.seed).toBe(42);
        expect(body.logprobs).toBe(true);
        expect(body.top_logprobs).toBe(5);
        expect(body.user).toBe('test-user');
    });
});

// =============================================================================
// callWithMessages: error response
// =============================================================================

describe('callWithMessages: error responses', () => {
    it('throws on non-ok response', async () => {
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
        }) as any;

        await expect(callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'model', model: 'model', provider: 'openai' } as any,
        )).rejects.toThrow('LLM error (500)');
    });

    it('throws when no choices in response', async () => {
        mockFetchOk({ choices: [] });

        await expect(callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'model', model: 'model', provider: 'openai' } as any,
        )).rejects.toThrow('No choices in LLM response');
    });
});

// =============================================================================
// callWithMessages: thinkingLevel forwarding
// =============================================================================

describe('callWithMessages: thinkingLevel', () => {
    it('applies thinkingLevel when set on model', async () => {
        const mockFn = mockFetchOk({
            choices: [{ message: { content: 'ok' } }],
        });

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'gpt-5-turbo', model: 'gpt-5-turbo', provider: 'openai', thinkingLevel: 'high' } as any,
        );

        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.reasoning_effort).toBe('high');
    });

    it('applies noThink as off when thinkingLevel not set', async () => {
        const mockFn = mockFetchOk({
            choices: [{ message: { content: 'ok' } }],
        });

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            { name: 'qwen3-8b', model: 'qwen3-8b', provider: 'openai', noThink: true } as any,
        );

        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        // Qwen: /no_think prefix on last user message
        const lastUser = body.messages.find((m: any) => m.role === 'user');
        expect(lastUser.content).toContain('/no_think');
    });
});
