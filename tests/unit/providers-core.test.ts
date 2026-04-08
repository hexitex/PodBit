/**
 * Unit tests for models/providers.ts — LLM provider integrations.
 *
 * Covers: provider selection (callSingleModel), API call formatting for
 * OpenAI/Anthropic/Ollama, response parsing, error handling, think block
 * stripping, unsupported param caching, extractTextContent, response format
 * building, thinking level application, and callWithMessages.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — all external dependencies
// ---------------------------------------------------------------------------

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
    eventBus: { emit: jest.fn() },
}));

const mockGetApiKey = jest.fn<() => string | undefined>(() => 'test-key');
jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

const mockLogUsage = jest.fn<() => Promise<void>>(() => Promise.resolve());
jest.unstable_mockModule('../../models/cost.js', () => ({
    logUsage: mockLogUsage,
}));

const mockIsBudgetExceeded = jest.fn<() => boolean>(() => false);
jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

const mockAcquireModelSlot = jest.fn<() => Promise<() => void>>(() => Promise.resolve(() => {}));
jest.unstable_mockModule('../../models/semaphore.js', () => ({
    acquireModelSlot: mockAcquireModelSlot,
    reportRateLimit: jest.fn(),
}));

// Mock the db module for loadUnsupportedParamsCache
const mockSystemQueryOne = jest.fn<() => Promise<any>>(() => Promise.resolve(null));
const mockSystemQuery = jest.fn<() => Promise<void>>(() => Promise.resolve());
jest.unstable_mockModule('../../db.js', () => ({
    systemQueryOne: mockSystemQueryOne,
    systemQuery: mockSystemQuery,
}));

// Mock fetch globally
const mockFetch = jest.fn<typeof globalThis.fetch>();
(globalThis as any).fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import the module under test AFTER all mocks are registered
// ---------------------------------------------------------------------------
const {
    callSingleModel,
    callWithMessages,
    extractTextContent,
    getUnsupportedParams,
    loadUnsupportedParamsCache,
    setConversationalLogging,
    isConversationalLogging,
} = await import('../../models/providers.js');

// Re-import types for convenience
import type { ModelEntry, CallOptions } from '../../models/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
    return {
        name: 'test-model',
        provider: 'openai',
        model: 'gpt-4',
        endpoint: 'http://localhost:9999/v1',
        apiKey: 'sk-test',
        ...overrides,
    };
}

function mockFetchOk(body: any): void {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as any);
}

/**
 * Streaming variant — GLM/Z.AI models route through readStreamingResponse() and need
 * an SSE-formatted ReadableStream body. The plain `mockFetchOk` only sets `json()`.
 */
function mockFetchStreamingOk(content: string, finishReason = 'stop'): void {
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
    mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
        json: async () => ({ choices: [{ message: { content } }] }),
        text: async () => sseChunks.join(''),
    } as any);
}

function mockFetchError(status: number, body: string): void {
    mockFetch.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({}),
        text: async () => body,
    } as any);
}

function openAiResponse(content: string, usage?: any): any {
    return {
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
}

function anthropicResponse(content: string, usage?: any): any {
    return {
        content: [{ type: 'text', text: content }],
        usage: usage ?? { input_tokens: 10, output_tokens: 20 },
        stop_reason: 'end_turn',
    };
}

function ollamaResponse(content: string): any {
    return {
        response: content,
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    setConversationalLogging(false);
});

// ── extractTextContent ──────────────────────────────────────────────────────

describe('extractTextContent', () => {
    it('returns empty string for null/undefined', () => {
        expect(extractTextContent(null)).toBe('');
        expect(extractTextContent(undefined)).toBe('');
    });

    it('returns string content as-is', () => {
        expect(extractTextContent('hello world')).toBe('hello world');
    });

    it('extracts text from OpenAI multipart array', () => {
        const content = [
            { type: 'text', text: 'Hello' },
            { type: 'image_url', url: 'http://...' },
            { type: 'text', text: 'World' },
        ];
        expect(extractTextContent(content)).toBe('Hello World');
    });

    it('filters non-text parts from array', () => {
        const content = [
            { type: 'image_url', url: 'http://...' },
        ];
        expect(extractTextContent(content)).toBe('');
    });

    it('converts non-string non-array to string', () => {
        expect(extractTextContent(42)).toBe('42');
    });
});

// ── conversational logging toggle ───────────────────────────────────────────

describe('conversational logging', () => {
    it('defaults to disabled', () => {
        // We set it false in beforeEach, so this confirms the getter works
        expect(isConversationalLogging()).toBe(false);
    });

    it('can be toggled on and off', () => {
        setConversationalLogging(true);
        expect(isConversationalLogging()).toBe(true);
        setConversationalLogging(false);
        expect(isConversationalLogging()).toBe(false);
    });
});

// ── callSingleModel — OpenAI-compatible path ────────────────────────────────

describe('callSingleModel — OpenAI-compatible', () => {
    it('sends correct request shape and returns parsed result', async () => {
        mockFetchOk(openAiResponse('test output'));

        const result = await callSingleModel(
            makeModel(),
            'What is 2+2?',
            { temperature: 0.5, maxTokens: 100 },
        );

        expect(result.text).toBe('test output');
        expect(result.usage).toBeDefined();
        expect(result.usage!.prompt_tokens).toBe(10);
        expect(result.finishReason).toBe('stop');

        // Verify fetch was called with correct URL
        const fetchCall = mockFetch.mock.calls[0];
        const url = fetchCall[0] as string;
        expect(url).toContain('/chat/completions');

        // Verify request body
        const body = JSON.parse((fetchCall[1] as any).body);
        expect(body.model).toBe('gpt-4');
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].role).toBe('user');
        expect(body.messages[0].content).toBe('What is 2+2?');
        expect(body.max_tokens).toBe(100);
        expect(body.temperature).toBe(0.5);
        expect(body.stream).toBe(false);
    });

    it('includes system prompt when provided', async () => {
        mockFetchOk(openAiResponse('response'));

        await callSingleModel(
            makeModel(),
            'Question?',
            { systemPrompt: 'You are helpful.' },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[0].content).toBe('You are helpful.');
        expect(body.messages[1].role).toBe('user');
    });

    it('throws on empty content response', async () => {
        mockFetchOk({
            choices: [{ message: { content: null }, finish_reason: 'stop' }],
        });

        await expect(
            callSingleModel(makeModel(), 'test', {}),
        ).rejects.toThrow('returned empty content');
    });

    it('throws on HTTP error', async () => {
        mockFetchError(500, 'Internal Server Error');

        await expect(
            callSingleModel(makeModel(), 'test', {}),
        ).rejects.toThrow('API error (500)');
    });

    it('uses Authorization Bearer header for OpenAI provider', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(makeModel(), 'test', {});

        const headers = (mockFetch.mock.calls[0][1] as any).headers;
        expect(headers['Authorization']).toBe('Bearer sk-test');
    });

    it('appends /chat/completions to endpoint without it', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ endpoint: 'http://localhost:8080/v1' }),
            'test', {},
        );

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('http://localhost:8080/v1/chat/completions');
    });

    it('does not duplicate /chat/completions if already present', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ endpoint: 'http://localhost:8080/v1/chat/completions' }),
            'test', {},
        );

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('http://localhost:8080/v1/chat/completions');
    });

    it('includes images as image_url parts for OpenAI', async () => {
        mockFetchOk(openAiResponse('I see a cat'));

        await callSingleModel(
            makeModel(),
            'Describe this image',
            { images: [{ type: 'base64', media_type: 'image/png', data: 'abc123' }] },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        const userMsg = body.messages.find((m: any) => m.role === 'user');
        expect(Array.isArray(userMsg.content)).toBe(true);
        expect(userMsg.content[0].type).toBe('image_url');
        expect(userMsg.content[0].image_url.url).toContain('data:image/png;base64,abc123');
        expect(userMsg.content[1].type).toBe('text');
    });
});

// ── callSingleModel — Anthropic path ────────────────────────────────────────

describe('callSingleModel — Anthropic', () => {
    it('sends correct request shape and returns parsed result', async () => {
        mockFetchOk(anthropicResponse('Claude says hello'));

        const result = await callSingleModel(
            makeModel({ provider: 'anthropic', model: 'claude-3-opus' }),
            'Hello Claude',
            { maxTokens: 500 },
        );

        expect(result.text).toBe('Claude says hello');
        expect(result.usage).toBeDefined();
        expect(result.usage!.prompt_tokens).toBe(10);
        expect(result.usage!.completion_tokens).toBe(20);
        expect(result.usage!.total_tokens).toBe(30);

        // Verify Anthropic endpoint
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('https://api.anthropic.com/v1/messages');

        // Verify headers
        const headers = (mockFetch.mock.calls[0][1] as any).headers;
        expect(headers['x-api-key']).toBe('sk-test');
        expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('throws when no API key is available', async () => {
        mockGetApiKey.mockReturnValue(undefined);

        await expect(
            callSingleModel(
                makeModel({ provider: 'anthropic', model: 'claude-3', apiKey: undefined }),
                'test', {},
            ),
        ).rejects.toThrow('Anthropic API key not configured');
    });

    it('includes thinking: disabled when noThink is set', async () => {
        mockFetchOk(anthropicResponse('ok'));

        await callSingleModel(
            makeModel({ provider: 'anthropic', model: 'claude-3', noThink: true }),
            'test', { maxTokens: 100 },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.thinking).toEqual({ type: 'disabled' });
    });

    it('sends images as Anthropic image blocks', async () => {
        mockFetchOk(anthropicResponse('I see a photo'));

        await callSingleModel(
            makeModel({ provider: 'anthropic', model: 'claude-3' }),
            'What is this?',
            { images: [{ type: 'base64', media_type: 'image/jpeg', data: 'xyz789' }] },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        const content = body.messages[0].content;
        expect(Array.isArray(content)).toBe(true);
        expect(content[0].type).toBe('image');
        expect(content[0].source.media_type).toBe('image/jpeg');
        expect(content[1].type).toBe('text');
    });

    it('throws on HTTP error from Anthropic', async () => {
        mockFetchError(429, 'Rate limited');

        await expect(
            callSingleModel(
                makeModel({ provider: 'anthropic', model: 'claude-3' }),
                'test', {},
            ),
        ).rejects.toThrow('Anthropic API error: 429');
    });
});

// ── callSingleModel — Ollama (local) path ───────────────────────────────────

describe('callSingleModel — Ollama local', () => {
    it('sends correct request shape to /api/generate', async () => {
        mockFetchOk(ollamaResponse('Local model says hi'));

        const result = await callSingleModel(
            makeModel({ provider: 'local', name: 'llama3', model: undefined, endpoint: 'http://localhost:11434' }),
            'Hello local',
            { temperature: 0.3, maxTokens: 200 },
        );

        expect(result.text).toBe('Local model says hi');
        expect(result.usage).toBeDefined();
        expect(result.usage!.prompt_tokens).toBe(10);
        expect(result.usage!.completion_tokens).toBe(20);
        expect(result.finishReason).toBe('stop');

        // Verify Ollama endpoint
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toBe('http://localhost:11434/api/generate');

        // Verify body uses Ollama format
        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.model).toBe('llama3');
        expect(body.prompt).toBe('Hello local');
        expect(body.stream).toBe(false);
        expect(body.options.num_predict).toBe(200);
        expect(body.options.temperature).toBe(0.3);
    });

    it('sets think: false when noThink is set', async () => {
        mockFetchOk(ollamaResponse('ok'));

        await callSingleModel(
            makeModel({ provider: 'local', name: 'deepseek-r1', noThink: true, endpoint: 'http://localhost:11434' }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.think).toBe(false);
    });

    it('includes images as base64 array for Ollama', async () => {
        mockFetchOk(ollamaResponse('I see something'));

        await callSingleModel(
            makeModel({ provider: 'local', name: 'llava', endpoint: 'http://localhost:11434' }),
            'What is this?',
            { images: [{ type: 'base64', media_type: 'image/png', data: 'imgdata' }] },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.images).toEqual(['imgdata']);
    });
});

// ── noThink / think block stripping ─────────────────────────────────────────

describe('noThink — think block stripping', () => {
    it('strips <think>...</think> blocks from output', async () => {
        mockFetchOk(openAiResponse('<think>internal reasoning</think>The answer is 42.'));

        const result = await callSingleModel(
            makeModel({ noThink: true }),
            'test', {},
        );

        expect(result.text).toBe('The answer is 42.');
    });

    it('strips <thinking>...</thinking> blocks from output', async () => {
        mockFetchOk(openAiResponse('<thinking>step by step</thinking>Final answer'));

        const result = await callSingleModel(
            makeModel({ noThink: true }),
            'test', {},
        );

        expect(result.text).toBe('Final answer');
    });

    it('does not strip when noThink is not set', async () => {
        mockFetchOk(openAiResponse('<think>reasoning</think>Answer'));

        const result = await callSingleModel(
            makeModel({ noThink: false }),
            'test', {},
        );

        expect(result.text).toBe('<think>reasoning</think>Answer');
    });

    it('strips multiline think blocks', async () => {
        const content = '<think>\nLine 1\nLine 2\n</think>\nClean output';
        mockFetchOk(openAiResponse(content));

        const result = await callSingleModel(
            makeModel({ noThink: true }),
            'test', {},
        );

        expect(result.text).toBe('Clean output');
    });
});

// ── thinkingLevel application ───────────────────────────────────────────────

describe('thinkingLevel — provider-specific mechanisms', () => {
    it('sets reasoning_effort for GPT-5 models', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ model: 'gpt-5-turbo', thinkingLevel: 'low' }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.reasoning_effort).toBe('low');
    });

    it('sets reasoning_effort=none for GPT-5 with level=off', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ model: 'gpt-5', thinkingLevel: 'off' }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.reasoning_effort).toBe('none');
    });

    it('sets minimum reasoning_effort=low for o-series with level=off', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ model: 'o3-mini', thinkingLevel: 'off' }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.reasoning_effort).toBe('low');
    });

    it('prefixes /no_think for Qwen models with level=off', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ model: 'qwen3-72b', noThink: true }),
            'test prompt', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        const userMsg = body.messages.find((m: any) => m.role === 'user');
        expect(userMsg.content).toContain('/no_think');
    });

    it('sets thinking.type=disabled for GLM models with level=off', async () => {
        // GLM uses streaming (stream:true) — needs the streaming-aware mock.
        mockFetchStreamingOk('ok');

        await callSingleModel(
            makeModel({ model: 'glm-4-plus', noThink: true }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.thinking).toEqual({ type: 'disabled' });
        const userMsg = body.messages.find((m: any) => m.role === 'user');
        expect(userMsg.content).not.toContain('/nothink');
    });

    it('prefills empty think tags for DeepSeek R1 with level=off', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            makeModel({ model: 'deepseek-r1', noThink: true }),
            'test', {},
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        const assistantMsg = body.messages.find((m: any) => m.role === 'assistant');
        expect(assistantMsg).toBeDefined();
        expect(assistantMsg.content).toContain('<think>');
        expect(assistantMsg.content).toContain('</think>');
    });
});

// ── callWithMessages ────────────────────────────────────────────────────────

describe('callWithMessages', () => {
    it('sends messages array and returns choices', async () => {
        mockFetchOk(openAiResponse('response text'));

        const result = await callWithMessages(
            [{ role: 'user', content: 'Hi' }],
            makeModel(),
            { temperature: 0.5 },
        );

        expect(result.choices).toHaveLength(1);
        expect(result.choices[0].message.content).toBe('response text');
    });

    it('throws on budget exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);

        await expect(
            callWithMessages(
                [{ role: 'user', content: 'Hi' }],
                makeModel(),
            ),
        ).rejects.toThrow('Budget exceeded');

        mockIsBudgetExceeded.mockReturnValue(false);
    });

    it('acquires semaphore slot when model has concurrency config', async () => {
        const mockRelease = jest.fn();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockFetchOk(openAiResponse('ok'));

        await callWithMessages(
            [{ role: 'user', content: 'Hi' }],
            makeModel({ _registryId: 'model-1', _maxConcurrency: 3 }),
        );

        expect(mockAcquireModelSlot).toHaveBeenCalledWith('model-1', 3, 0);
        expect(mockRelease).toHaveBeenCalled();
    });

    it('releases semaphore slot even on error', async () => {
        const mockRelease = jest.fn();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockFetchError(500, 'fail');

        await expect(
            callWithMessages(
                [{ role: 'user', content: 'Hi' }],
                makeModel({ _registryId: 'model-1', _maxConcurrency: 2 }),
            ),
        ).rejects.toThrow();

        expect(mockRelease).toHaveBeenCalled();
    });

    it('throws when response has no choices', async () => {
        mockFetchOk({ choices: [] });

        await expect(
            callWithMessages(
                [{ role: 'user', content: 'Hi' }],
                makeModel(),
            ),
        ).rejects.toThrow('No choices in LLM response');
    });

    it('strips think blocks from all choices when noThink is set', async () => {
        mockFetchOk({
            choices: [
                { index: 0, message: { role: 'assistant', content: '<think>blah</think>Clean' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        });

        const result = await callWithMessages(
            [{ role: 'user', content: 'test' }],
            makeModel({ noThink: true }),
        );

        expect(result.choices[0].message.content).toBe('Clean');
    });

    it('forwards optional OpenAI params when provided', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            makeModel(),
            {
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.3,
                stop: ['\n'],
                seed: 42,
            },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.top_p).toBe(0.9);
        expect(body.frequency_penalty).toBe(0.5);
        expect(body.presence_penalty).toBe(0.3);
        expect(body.stop).toEqual(['\n']);
        expect(body.seed).toBe(42);
    });

    it('uses Anthropic headers when provider is anthropic', async () => {
        mockFetchOk(openAiResponse('ok'));

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            makeModel({ provider: 'anthropic', model: 'claude-3' }),
        );

        const headers = (mockFetch.mock.calls[0][1] as any).headers;
        expect(headers['x-api-key']).toBe('sk-test');
        expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('logs usage when present in response', async () => {
        mockFetchOk(openAiResponse('ok', {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            completion_tokens_details: { reasoning_tokens: 10 },
        }));

        await callWithMessages(
            [{ role: 'user', content: 'test' }],
            makeModel(),
        );

        expect(mockLogUsage).toHaveBeenCalledWith(expect.objectContaining({
            subsystem: 'proxy',
            inputTokens: 100,
            outputTokens: 50,
            toolTokens: 10,
            totalTokens: 150,
        }));
    });
});

// ── getUnsupportedParams ────────────────────────────────────────────────────

describe('getUnsupportedParams', () => {
    it('returns empty set for unknown endpoint', () => {
        const params = getUnsupportedParams('http://unknown-host:8080/v1');
        expect(params.size).toBe(0);
    });

    it('returns empty set for invalid URL', () => {
        const params = getUnsupportedParams('not-a-url');
        expect(params.size).toBe(0);
    });
});

// ── loadUnsupportedParamsCache ──────────────────────────────────────────────

describe('loadUnsupportedParamsCache', () => {
    it('loads cached params from system DB', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ 'api.groq.com': ['min_p', 'top_k'] }),
        });

        await loadUnsupportedParamsCache();

        const params = getUnsupportedParams('https://api.groq.com/v1');
        expect(params.has('min_p')).toBe(true);
        expect(params.has('top_k')).toBe(true);
    });

    it('handles missing settings gracefully', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        // Should not throw
        await loadUnsupportedParamsCache();
    });

    it('handles DB errors gracefully', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB not ready'));

        // Should not throw
        await loadUnsupportedParamsCache();
    });
});

// ── unsupported param auto-discovery on 400 ─────────────────────────────────

describe('unsupported param auto-discovery', () => {
    it('strips unsupported param and retries on 400', async () => {
        // First call returns 400 with unsupported property error
        mockFetchError(400, "property 'min_p' is unsupported for this model");
        // Second call (retry) succeeds
        mockFetchOk(openAiResponse('ok after retry'));

        const result = await callSingleModel(
            makeModel({ endpoint: 'http://api.example.com/v1' }),
            'test',
            { minP: 0.1 },
        );

        expect(result.text).toBe('ok after retry');
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Verify the param was stripped from the retry request
        const retryBody = JSON.parse((mockFetch.mock.calls[1][1] as any).body);
        expect(retryBody.min_p).toBeUndefined();
    });
});

// ── response format building ────────────────────────────────────────────────

describe('response format — provider-specific', () => {
    it('uses json_object for openai provider with jsonSchema', async () => {
        mockFetchOk(openAiResponse('{"key":"value"}'));

        await callSingleModel(
            makeModel({ provider: 'openai' }),
            'test',
            { jsonSchema: { name: 'test', schema: { type: 'object' } } },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('uses json_schema for lmstudio provider with jsonSchema', async () => {
        mockFetchOk(openAiResponse('{"key":"value"}'));

        await callSingleModel(
            makeModel({ provider: 'lmstudio' }),
            'test',
            { jsonSchema: { name: 'testSchema', schema: { type: 'object', properties: {} } } },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.response_format.type).toBe('json_schema');
        expect(body.response_format.json_schema.name).toBe('testSchema');
        expect(body.response_format.json_schema.strict).toBe(true);
    });

    it('uses format: json for local (Ollama) provider', async () => {
        mockFetchOk(ollamaResponse('{"result":true}'));

        await callSingleModel(
            makeModel({ provider: 'local', name: 'llama3', endpoint: 'http://localhost:11434' }),
            'test',
            { jsonSchema: { name: 'test', schema: { type: 'object' } } },
        );

        const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
        expect(body.format).toBe('json');
    });
});
