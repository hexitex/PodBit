/**
 * Maximum coverage tests for models/providers.ts
 *
 * Targets remaining uncovered lines:
 * - L28-34: createFetchSignal fallback (AbortSignal.any not available)
 * - L128-130: prefixLastUserMessage with array content (multimodal user msg)
 * - L135: prefixLastUserMessage returns false (no user message found)
 * - L245: buildProviderResponseFormat anthropic case
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Import SUT
// ---------------------------------------------------------------------------

const {
    callSingleModel,
    callWithMessages,
    setConversationalLogging,
} = await import('../../models/providers.js');

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
    setConversationalLogging(false);
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
        text: () => Promise.resolve(JSON.stringify(data)),
    });
    globalThis.fetch = fn as any;
    return fn;
}

/**
 * Mock fetch for streaming responses (Z.AI / GLM models). Builds a fake ReadableStream
 * that emits a single SSE chunk with the given content and a [DONE] terminator.
 * Use this whenever the model under test would route through readStreamingResponse() —
 * any model with stream:true (currently the GLM family in providers.ts).
 */
function mockFetchStreamingOk(content: string, finishReason: string = 'stop') {
    const sseChunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`,
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
        text: () => Promise.resolve(sseChunks.join('')),
    });
    globalThis.fetch = fn as any;
    return fn;
}

function openAiResponse(content: string, usage?: any): any {
    return {
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
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

// =============================================================================
// createFetchSignal fallback — Lines 28-34
// When AbortSignal.any is NOT available, the fallback creates a manual controller
// wired to both the caller signal and timeout signal.
// =============================================================================

describe('createFetchSignal fallback (AbortSignal.any unavailable)', () => {
    it('falls back to manual AbortController when AbortSignal.any is not available', async () => {
        // Temporarily remove AbortSignal.any to trigger the fallback path
        const originalAny = (AbortSignal as any).any;
        delete (AbortSignal as any).any;

        try {
            const mf = mockFetchOk(openAiResponse('ok'));

            // Pass a caller signal to trigger the fallback path
            const ac = new AbortController();
            await callSingleModel(
                openaiModel(),
                'test',
                { signal: ac.signal },
            );

            // Verify the fetch was called (signal was created successfully)
            expect(mf).toHaveBeenCalledTimes(1);
            const fetchOpts = (mf.mock.calls[0] as any[])[1];
            expect(fetchOpts.signal).toBeDefined();
        } finally {
            // Restore AbortSignal.any
            if (originalAny) {
                (AbortSignal as any).any = originalAny;
            }
        }
    });

    it('fallback signal aborts when caller signal fires', async () => {
        const originalAny = (AbortSignal as any).any;
        delete (AbortSignal as any).any;

        try {
            // Create a caller abort controller that we'll abort
            const callerAc = new AbortController();

            // Mock fetch to hang so we can abort it
            globalThis.fetch = jest.fn<any>().mockImplementation(() => {
                return new Promise((_, reject) => {
                    // Listen for abort
                    setTimeout(() => {
                        callerAc.abort();
                    }, 10);
                    setTimeout(() => {
                        reject(new DOMException('The operation was aborted', 'AbortError'));
                    }, 50);
                });
            }) as any;

            await expect(
                callSingleModel(
                    openaiModel(),
                    'test',
                    { signal: callerAc.signal },
                ),
            ).rejects.toThrow();
        } finally {
            if (originalAny) {
                (AbortSignal as any).any = originalAny;
            }
        }
    });
});

// =============================================================================
// prefixLastUserMessage with array content — Lines 128-130
// When a Qwen/GLM model has noThink=true and the user message content is an
// array (multimodal), the prefix should be prepended to the text part.
// =============================================================================

describe('prefixLastUserMessage with multimodal array content', () => {
    it('prefixes /no_think into array-content user message for Qwen model', async () => {
        const mf = mockFetchOk(openAiResponse('ok'));

        await callSingleModel(
            openaiModel({ model: 'qwen3-72b', noThink: true }),
            'describe this image',
            { images: [{ type: 'base64', media_type: 'image/png', data: 'abc123' }] },
        );

        const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
        // User message content is an array (image + text parts)
        const userMsg = body.messages.find((m: any) => m.role === 'user');
        expect(Array.isArray(userMsg.content)).toBe(true);
        // The text part should contain /no_think prefix
        const textPart = userMsg.content.find((p: any) => p.type === 'text');
        expect(textPart.text).toContain('/no_think');
        expect(textPart.text).toContain('describe this image');
    });

    it('sets thinking.type=disabled for GLM model with array-content user message', async () => {
        // GLM/Z.AI routes through streaming (stream:true), so the fetch mock has to
        // supply a ReadableStream body — mockFetchOk's plain JSON shape doesn't satisfy
        // readStreamingResponse(). See providers.ts:33.
        const mf = mockFetchStreamingOk('ok');

        await callSingleModel(
            openaiModel({ model: 'glm-4-vision', noThink: true }),
            'what is this',
            { images: [{ type: 'base64', media_type: 'image/jpeg', data: 'xyz' }] },
        );

        const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
        expect(body.thinking).toEqual({ type: 'disabled' });
        const userMsg = body.messages.find((m: any) => m.role === 'user');
        expect(Array.isArray(userMsg.content)).toBe(true);
        const textPart = userMsg.content.find((p: any) => p.type === 'text');
        expect(textPart.text).not.toContain('/nothink');
    });
});

// =============================================================================
// prefixLastUserMessage returns false — Line 135
// When there are no user messages, the function returns false.
// This happens via applyThinkingLevel for Qwen/GLM when messages array has
// no user messages. Indirectly tested by sending messages without user role.
// =============================================================================

describe('prefixLastUserMessage — no user message found', () => {
    it('does not crash when Qwen model has no user messages (system-only)', async () => {
        const mf = mockFetchOk(openAiResponse('ok'));

        // callWithMessages with only system messages (no user)
        // Qwen + noThink triggers prefixLastUserMessage which should return false
        await callWithMessages(
            [{ role: 'system', content: 'You are helpful' }],
            openaiModel({ model: 'qwen3-72b', noThink: true }),
        );

        // Should not crash, message should not have /no_think
        const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
        const sysMsg = body.messages.find((m: any) => m.role === 'system');
        expect(sysMsg.content).not.toContain('/no_think');
    });
});

// =============================================================================
// buildProviderResponseFormat anthropic case — Line 245
// When provider is 'anthropic' and jsonSchema is provided, returns null.
// Anthropic doesn't use response_format.
// =============================================================================

describe('buildProviderResponseFormat — anthropic returns null', () => {
    it('does not set response_format for anthropic provider with jsonSchema', async () => {
        const mf = mockFetchOk({
            content: [{ type: 'text', text: '{"key":"value"}' }],
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: 'end_turn',
        });

        await callSingleModel(
            openaiModel({ provider: 'anthropic', model: 'claude-3-opus', apiKey: 'sk-ant-test' }),
            'test',
            { jsonSchema: { name: 'test_schema', schema: { type: 'object' } } },
        );

        // Anthropic request body should NOT have response_format
        const body = JSON.parse((mf.mock.calls[0] as any[])[1].body);
        expect(body.response_format).toBeUndefined();
    });
});

// =============================================================================
// callWithMessages — requestTimeout forwarding
// =============================================================================

describe('callWithMessages — requestTimeout option', () => {
    it('passes requestTimeout through to createFetchSignal', async () => {
        const mf = mockFetchOk(openAiResponse('ok'));

        await callWithMessages(
            [{ role: 'user', content: 'hi' }],
            openaiModel(),
            { requestTimeout: 30 },
        );

        // Verify fetch was called with a signal (timeout was applied)
        const fetchOpts = (mf.mock.calls[0] as any[])[1];
        expect(fetchOpts.signal).toBeDefined();
    });
});

// =============================================================================
// callOpenAICompatible — finish_reason=length warning
// =============================================================================

describe('callOpenAICompatible — finish_reason=length', () => {
    it('warns but returns partial content on finish_reason=length', async () => {
        mockFetchOk({
            choices: [{ message: { content: 'partial...' }, finish_reason: 'length' }],
            usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
        });

        const result = await callSingleModel(
            openaiModel(),
            'generate a long essay',
            { maxTokens: 100 },
        );

        // Should return the partial content, not throw
        expect(result.text).toBe('partial...');
        expect(result.finishReason).toBe('length');
    });
});

// =============================================================================
// callLocalModel — done: false branch
// =============================================================================

describe('callLocalModel — model not done', () => {
    it('returns undefined finishReason when done is false', async () => {
        mockFetchOk({
            response: 'incomplete response',
            done: false,
            prompt_eval_count: 5,
            eval_count: 10,
        });

        const result = await callSingleModel(
            openaiModel({ provider: 'local', name: 'llama3', endpoint: 'http://localhost:11434' }),
            'test',
            {},
        );

        expect(result.text).toBe('incomplete response');
        expect(result.finishReason).toBeUndefined();
    });

    it('handles zero token counts (no usage)', async () => {
        mockFetchOk({
            response: 'output',
            done: true,
            // No prompt_eval_count or eval_count
        });

        const result = await callSingleModel(
            openaiModel({ provider: 'local', name: 'llama3', endpoint: 'http://localhost:11434' }),
            'test',
            {},
        );

        expect(result.text).toBe('output');
        expect(result.usage).toBeUndefined();
    });
});

// =============================================================================
// callOpenAICompatible — no usage in response
// =============================================================================

describe('callOpenAICompatible — no usage data', () => {
    it('returns undefined usage when response has no usage field', async () => {
        mockFetchOk({
            choices: [{ message: { content: 'result' }, finish_reason: 'stop' }],
            // no usage field
        });

        const result = await callSingleModel(
            openaiModel(),
            'test',
            {},
        );

        expect(result.text).toBe('result');
        expect(result.usage).toBeUndefined();
    });
});

// =============================================================================
// callAnthropic — no usage in response
// =============================================================================

describe('callAnthropic — no usage data', () => {
    it('returns undefined usage when Anthropic response has no usage', async () => {
        mockFetchOk({
            content: [{ type: 'text', text: 'claude says' }],
            // no usage field
            stop_reason: 'end_turn',
        });

        const result = await callSingleModel(
            openaiModel({ provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant-x' }),
            'test',
            {},
        );

        expect(result.text).toBe('claude says');
        expect(result.usage).toBeUndefined();
    });
});
