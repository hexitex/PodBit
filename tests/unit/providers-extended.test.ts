/**
 * Tests for models/providers.ts — pure/utility functions and exported APIs.
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

beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../../models/providers.js');
    extractTextContent = mod.extractTextContent;
    getUnsupportedParams = mod.getUnsupportedParams;
    loadUnsupportedParamsCache = mod.loadUnsupportedParamsCache;
    setConversationalLogging = mod.setConversationalLogging;
    isConversationalLogging = mod.isConversationalLogging;
    callSingleModel = mod.callSingleModel;
    callWithMessages = mod.callWithMessages;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('models/providers', () => {
    describe('extractTextContent', () => {
        it('returns empty string for falsy content', () => {
            expect(extractTextContent(null)).toBe('');
            expect(extractTextContent(undefined)).toBe('');
            expect(extractTextContent('')).toBe('');
        });

        it('returns string content as-is', () => {
            expect(extractTextContent('hello world')).toBe('hello world');
        });

        it('extracts text from array of content parts', () => {
            const content = [
                { type: 'text', text: 'Hello' },
                { type: 'image_url', image_url: { url: 'data:...' } },
                { type: 'text', text: 'World' },
            ];
            expect(extractTextContent(content)).toBe('Hello World');
        });

        it('filters out non-text parts', () => {
            const content = [
                { type: 'image_url', image_url: {} },
                { type: 'text', text: 'Only text' },
            ];
            expect(extractTextContent(content)).toBe('Only text');
        });

        it('handles empty array', () => {
            expect(extractTextContent([])).toBe('');
        });

        it('converts non-string non-array to string', () => {
            expect(extractTextContent(42)).toBe('42');
            expect(extractTextContent(true)).toBe('true');
        });

        it('skips array items where text is not a string', () => {
            const content = [
                { type: 'text', text: 123 },
                { type: 'text', text: 'valid' },
            ];
            expect(extractTextContent(content)).toBe('valid');
        });
    });

    describe('getUnsupportedParams', () => {
        it('returns empty set for unknown endpoint', () => {
            const result = getUnsupportedParams('http://unknown.example.com/v1');
            expect(result.size).toBe(0);
        });

        it('returns empty set for invalid URL', () => {
            const result = getUnsupportedParams('not-a-url');
            expect(result.size).toBe(0);
        });
    });

    describe('loadUnsupportedParamsCache', () => {
        it('loads cached params from system DB', async () => {
            mockSystemQueryOne.mockResolvedValue({
                value: JSON.stringify({ 'api.groq.com': ['min_p', 'top_k'] }),
            });
            await loadUnsupportedParamsCache();
            const result = getUnsupportedParams('https://api.groq.com/v1');
            expect(result.has('min_p')).toBe(true);
            expect(result.has('top_k')).toBe(true);
        });

        it('handles missing settings gracefully', async () => {
            mockSystemQueryOne.mockResolvedValue(null);
            await expect(loadUnsupportedParamsCache()).resolves.not.toThrow();
        });

        it('handles DB error gracefully', async () => {
            mockSystemQueryOne.mockRejectedValue(new Error('DB not ready'));
            await expect(loadUnsupportedParamsCache()).resolves.not.toThrow();
        });
    });

    describe('conversational logging', () => {
        it('defaults to false', () => {
            expect(isConversationalLogging()).toBe(false);
        });

        it('can be enabled and disabled', () => {
            setConversationalLogging(true);
            expect(isConversationalLogging()).toBe(true);
            setConversationalLogging(false);
            expect(isConversationalLogging()).toBe(false);
        });
    });

    describe('callWithMessages', () => {
        it('throws when budget exceeded', async () => {
            mockIsBudgetExceeded.mockReturnValue(true);
            await expect(
                callWithMessages(
                    [{ role: 'user', content: 'hello' }],
                    { name: 'test-model', provider: 'openai', model: 'test-model' } as any,
                )
            ).rejects.toThrow('Budget exceeded');
        });

        it('acquires model slot when registry info is available', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            // Mock fetch to return a valid response
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'response' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            }) as any;

            try {
                await callWithMessages(
                    [{ role: 'user', content: 'hello' }],
                    {
                        name: 'test-model',
                        provider: 'openai',
                        model: 'test-model',
                        _registryId: 1,
                        _maxConcurrency: 3,
                        _requestPauseMs: 0,
                    } as any,
                );
                expect(mockAcquireModelSlot).toHaveBeenCalledWith(1, 3, 0);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('strips think blocks when noThink is set', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: { content: '<think>reasoning here</think>actual answer' },
                        finish_reason: 'stop',
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            }) as any;

            try {
                const result = await callWithMessages(
                    [{ role: 'user', content: 'hello' }],
                    {
                        name: 'test-model',
                        provider: 'openai',
                        model: 'test-model',
                        noThink: true,
                    } as any,
                );
                expect(result.choices[0].message.content).toBe('actual answer');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('throws on non-ok response', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Server Error'),
            }) as any;

            try {
                await expect(
                    callWithMessages(
                        [{ role: 'user', content: 'hello' }],
                        { name: 'test-model', provider: 'openai', model: 'test-model' } as any,
                    )
                ).rejects.toThrow('LLM error (500)');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('throws on empty choices', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ choices: [] }),
            }) as any;

            try {
                await expect(
                    callWithMessages(
                        [{ role: 'user', content: 'hello' }],
                        { name: 'test-model', provider: 'openai', model: 'test-model' } as any,
                    )
                ).rejects.toThrow('No choices');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('forwards optional OpenAI params', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    { name: 'm', provider: 'openai', model: 'm' } as any,
                    {
                        temperature: 0.5,
                        maxTokens: 100,
                        top_p: 0.9,
                        frequency_penalty: 0.3,
                        presence_penalty: 0.1,
                        stop: ['\n'],
                        seed: 42,
                        n: 2,
                    },
                );
                const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
                expect(body.temperature).toBe(0.5);
                expect(body.max_tokens).toBe(100);
                expect(body.top_p).toBe(0.9);
                expect(body.frequency_penalty).toBe(0.3);
                expect(body.presence_penalty).toBe(0.1);
                expect(body.stop).toEqual(['\n']);
                expect(body.seed).toBe(42);
                expect(body.n).toBe(2);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('applies thinkingLevel to request body', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    { name: 'o3-mini', provider: 'openai', model: 'o3-mini', thinkingLevel: 'high' } as any,
                );
                const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
                expect(body.reasoning_effort).toBe('high');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('uses anthropic headers for anthropic provider', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    { name: 'claude', provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant-123' } as any,
                );
                const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
                expect(headers['x-api-key']).toBe('sk-ant-123');
                expect(headers['anthropic-version']).toBe('2023-06-01');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('logs usage when present in response', async () => {
            mockIsBudgetExceeded.mockReturnValue(false);
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'result' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
                }),
            }) as any;

            try {
                await callWithMessages(
                    [{ role: 'user', content: 'hi' }],
                    { name: 'm', provider: 'openai', model: 'm' } as any,
                );
                expect(mockLogUsage).toHaveBeenCalled();
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    describe('callSingleModel', () => {
        it('calls anthropic provider for anthropic models', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'anthropic response' }],
                    usage: { input_tokens: 10, output_tokens: 5 },
                    stop_reason: 'end_turn',
                }),
            }) as any;

            try {
                const result = await callSingleModel(
                    { name: 'claude', provider: 'anthropic', model: 'claude-3', apiKey: 'sk-ant-test' } as any,
                    'test prompt',
                    { maxTokens: 100 },
                );
                expect(result.text).toBe('anthropic response');
                expect(result.usage).toBeDefined();
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('calls openai-compatible for openai provider', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'openai response' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            }) as any;

            try {
                const result = await callSingleModel(
                    { name: 'gpt4', provider: 'openai', model: 'gpt-4', endpoint: 'http://localhost:1234/v1' } as any,
                    'test prompt',
                    { maxTokens: 100, temperature: 0.5 },
                );
                expect(result.text).toBe('openai response');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('calls local model for local provider', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    response: 'local response',
                    done: true,
                    eval_count: 50,
                    prompt_eval_count: 10,
                }),
            }) as any;

            try {
                const result = await callSingleModel(
                    { name: 'llama3', provider: 'local', model: 'llama3' } as any,
                    'test prompt',
                    { maxTokens: 100 },
                );
                expect(result.text).toBe('local response');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('strips think blocks when noThink is set', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: { content: '<thinking>long reasoning</thinking>clean output' },
                        finish_reason: 'stop',
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            }) as any;

            try {
                const result = await callSingleModel(
                    { name: 'qwq', provider: 'openai', model: 'qwq-32b', noThink: true, endpoint: 'http://localhost:1234/v1' } as any,
                    'test',
                    {},
                );
                expect(result.text).toBe('clean output');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('throws when anthropic key is missing', async () => {
            mockGetApiKey.mockReturnValue(null);
            await expect(
                callSingleModel(
                    { name: 'claude', provider: 'anthropic', model: 'claude-3' } as any,
                    'test',
                    {},
                )
            ).rejects.toThrow('Anthropic API key not configured');
        });

        it('handles openai API error', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 429,
                text: () => Promise.resolve('Rate limited'),
            }) as any;

            try {
                await expect(
                    callSingleModel(
                        { name: 'gpt4', provider: 'openai', model: 'gpt-4', endpoint: 'http://localhost:1234/v1' } as any,
                        'test',
                        {},
                    )
                ).rejects.toThrow('API error (429)');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles local model error', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.resolve('Model not loaded'),
            }) as any;

            try {
                await expect(
                    callSingleModel(
                        { name: 'llama3', provider: 'local', model: 'llama3' } as any,
                        'test',
                        {},
                    )
                ).rejects.toThrow('Local model error');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles openai empty content', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: null }, finish_reason: 'length' }],
                }),
            }) as any;

            try {
                await expect(
                    callSingleModel(
                        { name: 'gpt4', provider: 'openai', model: 'gpt-4', endpoint: 'http://localhost:1234/v1' } as any,
                        'test',
                        { maxTokens: 10 },
                    )
                ).rejects.toThrow('returned empty content');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles lmstudio provider with json_schema format', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: '{"key":"val"}' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callSingleModel(
                    { name: 'local-model', provider: 'lmstudio', model: 'local-model', endpoint: 'http://localhost:1234/v1' } as any,
                    'test',
                    {
                        jsonSchema: { name: 'test_schema', schema: { type: 'object', properties: { key: { type: 'string' } } } },
                    },
                );
                const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
                expect(body.response_format.type).toBe('json_schema');
                expect(body.response_format.json_schema.name).toBe('test_schema');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles images for anthropic provider', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    content: [{ text: 'image description' }],
                    usage: { input_tokens: 100, output_tokens: 10 },
                    stop_reason: 'end_turn',
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callSingleModel(
                    { name: 'claude', provider: 'anthropic', model: 'claude-3', apiKey: 'sk-test' } as any,
                    'describe this',
                    { images: [{ media_type: 'image/png', data: 'base64data' }] },
                );
                const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
                expect(body.messages[0].content).toBeInstanceOf(Array);
                expect(body.messages[0].content[0].type).toBe('image');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles images for openai-compatible provider', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{ message: { content: 'image desc' }, finish_reason: 'stop' }],
                    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
                }),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callSingleModel(
                    { name: 'gpt4v', provider: 'openai', model: 'gpt-4-vision', endpoint: 'http://localhost:1234/v1' } as any,
                    'describe this',
                    { images: [{ media_type: 'image/png', data: 'base64data' }] },
                );
                const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
                const userMsg = body.messages.find((m: any) => m.role === 'user');
                expect(Array.isArray(userMsg.content)).toBe(true);
                expect(userMsg.content[0].type).toBe('image_url');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
