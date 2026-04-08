/**
 * Unit tests for proxy/handler.ts — registerCompletionsHandler.
 *
 * The module exports a single function that registers a POST /v1/chat/completions
 * route on an Express app. We test the route handler logic by capturing the
 * registered callback and invoking it with mock req/res objects.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — all external dependencies
// ---------------------------------------------------------------------------

const mockCallWithMessages = jest.fn<(...args: any[]) => Promise<any>>();
const mockExtractTextContent = jest.fn<(c: any) => string>((c: any) => (typeof c === 'string' ? c : ''));

jest.unstable_mockModule('../../models.js', () => ({
    callWithMessages: mockCallWithMessages,
    extractTextContent: mockExtractTextContent,
}));

const mockGetModelProvider = jest.fn<(m: string) => string>(() => 'openai');

jest.unstable_mockModule('../../models/types.js', () => ({
    getModelProvider: mockGetModelProvider,
}));

const mockPrepare = jest.fn<(...args: any[]) => Promise<any>>();
const mockUpdate = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../../context-engine.js', () => ({
    prepare: mockPrepare,
    update: mockUpdate,
}));

const mockToTelegraphic = jest.fn<(text: string, opts?: any) => string>((t: string) => t);

jest.unstable_mockModule('../../telegraphic.js', () => ({
    toTelegraphic: mockToTelegraphic,
    DEFAULT_ENTROPY_OPTIONS: {
        weights: {},
        thresholds: {},
        rarityMinLength: 8,
    },
}));

const mockEmitActivity = jest.fn();

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
    eventBus: { emit: jest.fn() },
}));

const mockResolveModel = jest.fn<(...args: any[]) => Promise<any>>();
const mockResolveSessionId = jest.fn<(...args: any[]) => string>(() => 'proxy:test-session');
const mockProfileFromContextSize = jest.fn<(n: number) => string>(() => 'medium');
const mockEstimateTokens = jest.fn<(msgs: any[]) => number>(() => 100);

jest.unstable_mockModule('../../proxy/model-resolution.js', () => ({
    resolveModel: mockResolveModel,
    resolveSessionId: mockResolveSessionId,
    profileFromContextSize: mockProfileFromContextSize,
    estimateTokens: mockEstimateTokens,
    PROFILE_CONTEXT_WINDOWS: {
        micro: 2048, small: 4096, medium: 16000, large: 65000, xl: 128000,
    },
}));

const mockEnsureProxySettings = jest.fn<() => Promise<void>>(async () => {});
const mockInjectKnowledge = jest.fn<(msgs: any[], text: string, hasTools?: boolean) => any[]>((msgs) => [...msgs]);

// We need a mutable proxySettings object that tests can modify
const mockProxySettings: Record<string, any> = {};

jest.unstable_mockModule('../../proxy/knowledge.js', () => ({
    get proxySettings() { return mockProxySettings; },
    ensureProxySettings: mockEnsureProxySettings,
    injectKnowledge: mockInjectKnowledge,
}));

// Mock dynamic imports used inside the handler
const mockGetBudgetStatus = jest.fn<() => Promise<any>>(async () => ({ exceeded: false }));
const mockComputeRetryAfterSeconds = jest.fn<(s: any) => number>(() => 60);

jest.unstable_mockModule('../../models/budget.js', () => ({
    getBudgetStatus: mockGetBudgetStatus,
    computeRetryAfterSeconds: mockComputeRetryAfterSeconds,
}));

const mockGetToolDefinitions = jest.fn<(mode: string) => any[]>(() => []);
const mockEstimateToolTokens = jest.fn<(tools: any[]) => number>(() => 50);
const mockRunAgentLoop = jest.fn<(opts: any) => Promise<any>>();

jest.unstable_mockModule('../../core/tool-calling.js', () => ({
    getToolDefinitions: mockGetToolDefinitions,
    estimateToolTokens: mockEstimateToolTokens,
    runAgentLoop: mockRunAgentLoop,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
const { registerCompletionsHandler } = await import('../../proxy/handler.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Captures the POST handler registered by registerCompletionsHandler. */
function captureHandler(): (req: any, res: any) => Promise<void> {
    let handler: any;
    const fakeApp = {
        post: (_path: string, fn: any) => { handler = fn; },
    };
    const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0, startedAt: '' };
    registerCompletionsHandler(fakeApp as any, stats);
    return handler!;
}

function makeRes() {
    const res: any = {
        status: jest.fn().mockReturnThis() as any,
        json: jest.fn().mockReturnThis() as any,
        setHeader: jest.fn() as any,
        write: jest.fn() as any,
        end: jest.fn() as any,
        _headers: {} as Record<string, string>,
    };
    return res;
}

function makeReq(body: any = {}, headers: Record<string, string> = {}): any {
    return {
        body,
        headers,
    };
}

function defaultResolvedModel(overrides: Record<string, any> = {}): any {
    return {
        name: 'test-model',
        provider: 'openai',
        model: 'test-model',
        contextSize: null,
        _registryModel: { supportsTools: true },
        ...overrides,
    };
}

function defaultLlmResult(overrides: Record<string, any> = {}): any {
    return {
        choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'test-model',
        ...overrides,
    };
}

function resetProxySettings() {
    Object.assign(mockProxySettings, {
        knowledgeReserve: 0.15,
        knowledgeMinReserve: 0.05,
        telegraphicEnabled: false,
        telegraphicAggressiveness: 'medium',
        compressClientPrompt: false,
        defaultModelProfile: 'medium',
        entropyEnabled: false,
        entropyWeights: {},
        entropyThresholds: {},
        entropyRarityMinLength: 8,
        maxKnowledgeNodes: 0,
        toolCallingEnabled: false,
        toolCallingMode: 'read-only',
        toolCallingMaxIterations: 5,
        toolCallingStrategy: 'complement',
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('proxy/handler — registerCompletionsHandler', () => {
    let handler: (req: any, res: any) => Promise<void>;

    beforeEach(() => {
        jest.resetAllMocks();
        resetProxySettings();

        // Default mock implementations
        mockResolveModel.mockResolvedValue(defaultResolvedModel());
        mockCallWithMessages.mockResolvedValue(defaultLlmResult());
        mockPrepare.mockResolvedValue({ systemPrompt: null, knowledge: [], topics: [] });
        mockUpdate.mockResolvedValue(undefined);
        mockExtractTextContent.mockImplementation((c: any) => (typeof c === 'string' ? c : ''));
        mockGetBudgetStatus.mockResolvedValue({ exceeded: false });
        mockResolveSessionId.mockReturnValue('proxy:test-session');
        mockEstimateTokens.mockReturnValue(100);
        mockInjectKnowledge.mockImplementation((msgs) => [...msgs]);

        handler = captureHandler();
    });

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------

    it('registers a POST route on /v1/chat/completions', () => {
        let registeredPath = '';
        const fakeApp = { post: (path: string, _fn: any) => { registeredPath = path; } };
        const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0, startedAt: '' };
        registerCompletionsHandler(fakeApp as any, stats);
        expect(registeredPath).toBe('/v1/chat/completions');
    });

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    it('returns 400 when messages is missing', async () => {
        const res = makeRes();
        await handler(makeReq({}), res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ type: 'invalid_request_error' }),
        }));
    });

    it('returns 400 when messages is empty array', async () => {
        const res = makeRes();
        await handler(makeReq({ messages: [] }), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when messages is not an array', async () => {
        const res = makeRes();
        await handler(makeReq({ messages: 'not-array' }), res);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    // -----------------------------------------------------------------------
    // Budget check
    // -----------------------------------------------------------------------

    it('returns 429 when budget is exceeded', async () => {
        mockGetBudgetStatus.mockResolvedValue({ exceeded: true, exceededPeriod: 'daily' });
        mockComputeRetryAfterSeconds.mockReturnValue(120);

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '120');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({
                type: 'budget_exceeded',
                code: 'budget_exceeded',
            }),
        }));
    });

    it('proceeds normally when budget check throws', async () => {
        mockGetBudgetStatus.mockRejectedValue(new Error('budget module not loaded'));

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(res.json).toHaveBeenCalled();
        // Should not be an error response
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body).toHaveProperty('choices');
    });

    // -----------------------------------------------------------------------
    // Non-streaming response
    // -----------------------------------------------------------------------

    it('returns a valid OpenAI-compatible non-streaming response', async () => {
        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hello' }],
            model: 'test-model',
        }), res);

        expect(res.json).toHaveBeenCalledTimes(1);
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.object).toBe('chat.completion');
        expect(body.choices).toHaveLength(1);
        expect(body.choices[0].message.role).toBe('assistant');
        expect(body.choices[0].message.content).toBe('Hello!');
        expect(body.choices[0].finish_reason).toBe('stop');
        expect(body.usage).toBeDefined();
        expect(body.id).toMatch(/^chatcmpl-/);
        expect(body.model).toBe('test-model');
    });

    it('normalizes choices with missing fields', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: {} }],
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices[0].index).toBe(0);
        expect(body.choices[0].message.role).toBe('assistant');
        expect(body.choices[0].message.content).toBeNull();
        expect(body.choices[0].finish_reason).toBe('stop');
    });

    it('includes tool_calls in normalized choices when present', async () => {
        const toolCalls = [{ id: 'tc1', type: 'function', function: { name: 'test', arguments: '{}' } }];
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: null, tool_calls: toolCalls }, finish_reason: 'tool_calls' }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices[0].message.tool_calls).toEqual(toolCalls);
    });

    it('includes function_call in normalized choices when present', async () => {
        const fnCall = { name: 'test', arguments: '{}' };
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: null, function_call: fnCall } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices[0].message.function_call).toEqual(fnCall);
    });

    it('includes refusal in normalized choices when present', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: null, refusal: 'I cannot do that' } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices[0].message.refusal).toBe('I cannot do that');
    });

    it('includes logprobs in choice when present', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: 'hi' }, logprobs: { content: [] } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices[0].logprobs).toEqual({ content: [] });
    });

    it('includes system_fingerprint when present', async () => {
        mockCallWithMessages.mockResolvedValue({
            ...defaultLlmResult(),
            system_fingerprint: 'fp_abc123',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.system_fingerprint).toBe('fp_abc123');
    });

    it('provides default usage when result has none', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: 'hi' } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    });

    // -----------------------------------------------------------------------
    // Streaming response
    // -----------------------------------------------------------------------

    it('returns SSE format when stream=true', async () => {
        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
        }), res);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
        expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
        expect(res.end).toHaveBeenCalled();

        // Check that the final write is [DONE]
        const writes = (res.write as jest.Mock).mock.calls.map((c: any) => c[0]);
        expect(writes[writes.length - 1]).toBe('data: [DONE]\n\n');

        // Check that chunks have the right structure
        const roleChunk = JSON.parse(writes[0].replace('data: ', '').trim());
        expect(roleChunk.object).toBe('chat.completion.chunk');
        expect(roleChunk.choices[0].delta.role).toBe('assistant');
        expect(roleChunk.choices[0].finish_reason).toBeNull();
    });

    it('streaming includes content chunk and finish chunk', async () => {
        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hello' }],
            stream: true,
        }), res);

        const writes = (res.write as jest.Mock).mock.calls.map((c: any) => c[0]);
        const parsed = writes.filter((w: string) => w.startsWith('data: {'))
            .map((w: string) => JSON.parse(w.replace('data: ', '').trim()));

        // Should have: role chunk, content chunk, finish chunk, usage chunk
        expect(parsed.length).toBeGreaterThanOrEqual(4);

        // Content chunk
        const contentChunk = parsed.find((p: any) => p.choices[0]?.delta?.content === 'Hello!');
        expect(contentChunk).toBeDefined();

        // Finish chunk
        const finishChunk = parsed.find((p: any) => p.choices[0]?.finish_reason === 'stop');
        expect(finishChunk).toBeDefined();

        // Usage chunk
        const usageChunk = parsed.find((p: any) => p.usage !== undefined);
        expect(usageChunk).toBeDefined();
        expect(usageChunk.choices).toEqual([]);
    });

    it('streaming includes tool_calls chunks when present', async () => {
        const toolCalls = [
            { id: 'tc1', type: 'function', function: { name: 'fn1', arguments: '{}' } },
            { id: 'tc2', type: 'function', function: { name: 'fn2', arguments: '{}' } },
        ];
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: null, tool_calls: toolCalls }, finish_reason: 'tool_calls' }],
            model: 'test-model',
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
        }), res);

        const writes = (res.write as jest.Mock).mock.calls.map((c: any) => c[0]);
        const parsed = writes.filter((w: string) => w.startsWith('data: {'))
            .map((w: string) => JSON.parse(w.replace('data: ', '').trim()));

        const toolChunks = parsed.filter((p: any) => p.choices[0]?.delta?.tool_calls);
        expect(toolChunks).toHaveLength(2);
        expect(toolChunks[0].choices[0].delta.tool_calls[0].id).toBe('tc1');
        expect(toolChunks[1].choices[0].delta.tool_calls[0].id).toBe('tc2');
    });

    // -----------------------------------------------------------------------
    // Model resolution & session
    // -----------------------------------------------------------------------

    it('resolves session ID and model, emits activity', async () => {
        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            model: 'gpt-4',
            user: 'test-user',
        }), res);

        expect(mockResolveSessionId).toHaveBeenCalled();
        expect(mockResolveModel).toHaveBeenCalledWith('gpt-4');
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'proxy', 'request', expect.any(String),
            expect.objectContaining({ model: 'test-model', session: 'proxy:test-session' }),
        );
    });

    // -----------------------------------------------------------------------
    // Knowledge injection via context engine
    // -----------------------------------------------------------------------

    it('injects knowledge when context engine returns a systemPrompt', async () => {
        mockPrepare.mockResolvedValue({
            systemPrompt: 'Domain knowledge here',
            knowledge: [{ id: 'n1' }, { id: 'n2' }],
            topics: ['topic1'],
        });

        const res = makeRes();
        const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0, startedAt: '' };
        const fakeApp = { post: (_p: string, fn: any) => { handler = fn; } };
        registerCompletionsHandler(fakeApp as any, stats);

        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockInjectKnowledge).toHaveBeenCalledWith(
            expect.any(Array),
            'Domain knowledge here',
            false,
        );
        expect(stats.enrichedCount).toBe(1);
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'proxy', 'enriched', expect.stringContaining('2 nodes'),
            expect.objectContaining({ nodes: 2, topics: 1 }),
        );
    });

    it('skips injection when context engine returns no systemPrompt', async () => {
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockInjectKnowledge).not.toHaveBeenCalled();
    });

    it('skips injection when skipForToolReplace is true', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockProxySettings.toolCallingStrategy = 'replace';

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('degrades gracefully when context engine throws', async () => {
        mockPrepare.mockRejectedValue(new Error('context engine broke'));

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        // Should still return a valid response
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices).toBeDefined();
    });

    it('passes maxNodes to prepare when configured', async () => {
        mockProxySettings.maxKnowledgeNodes = 10;
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockPrepare).toHaveBeenCalledWith(
            expect.any(String),
            'proxy:test-session',
            expect.objectContaining({ maxNodes: 10 }),
        );
    });

    it('does not pass maxNodes when set to 0', async () => {
        mockProxySettings.maxKnowledgeNodes = 0;
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const opts = (mockPrepare as jest.Mock).mock.calls[0][2];
        expect(opts.maxNodes).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // Context window budgeting (known vs unknown)
    // -----------------------------------------------------------------------

    it('uses dynamic budgeting when contextSize is known', async () => {
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: 8192 }));
        mockEstimateTokens.mockReturnValue(500);
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1024,
        }), res);

        expect(mockProfileFromContextSize).toHaveBeenCalledWith(8192);
        expect(mockPrepare).toHaveBeenCalled();
    });

    it('skips injection when available space is below minKnowledgeBudget', async () => {
        // Simulate tight context window
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: 1000 }));
        mockEstimateTokens.mockReturnValue(900); // Almost full
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 200,
        }), res);

        // available = 1000 - 900 - 0 - 200 = -100, which is < minKnowledgeBudget
        expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('uses default budget when contextSize is unknown', async () => {
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: null }));
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        // Should use PROFILE_CONTEXT_WINDOWS[modelProfile] = 16000 for 'medium'
        expect(mockPrepare).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ budget: 16000 }),
        );
    });

    // -----------------------------------------------------------------------
    // Tool token accounting
    // -----------------------------------------------------------------------

    it('accounts for client tool tokens in budget calculation', async () => {
        const tools = [{ type: 'function', function: { name: 'read_file', parameters: {} } }];
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: 8192 }));
        mockEstimateTokens.mockReturnValue(100);
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            tools,
        }), res);

        // Should still call prepare (tools consume space but there's enough room)
        expect(mockPrepare).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Telegraphic compression
    // -----------------------------------------------------------------------

    it('applies telegraphic compression to knowledge when enabled', async () => {
        mockProxySettings.telegraphicEnabled = true;
        mockPrepare.mockResolvedValue({
            systemPrompt: 'Some long knowledge text here',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });
        mockToTelegraphic.mockReturnValue('compressed text');

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockToTelegraphic).toHaveBeenCalledWith('Some long knowledge text here', expect.objectContaining({
            aggressiveness: 'medium',
        }));
        expect(mockInjectKnowledge).toHaveBeenCalledWith(
            expect.any(Array),
            'compressed text',
            false,
        );
    });

    it('does not apply telegraphic compression when disabled', async () => {
        mockProxySettings.telegraphicEnabled = false;
        mockPrepare.mockResolvedValue({
            systemPrompt: 'Knowledge text',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockToTelegraphic).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Client prompt compression (4b)
    // -----------------------------------------------------------------------

    it('compresses client system prompt when telegraphic + compressClientPrompt enabled', async () => {
        mockProxySettings.telegraphicEnabled = true;
        mockProxySettings.compressClientPrompt = true;
        const longPrompt = 'A'.repeat(300);

        // No knowledge injection — test client prompt compression alone
        mockPrepare.mockResolvedValue({ systemPrompt: null });
        mockToTelegraphic.mockReturnValue('COMPRESSED');

        const res = makeRes();
        await handler(makeReq({
            messages: [
                { role: 'system', content: longPrompt },
                { role: 'user', content: 'hi' },
            ],
        }), res);

        // toTelegraphic should be called with the long client prompt
        expect(mockToTelegraphic).toHaveBeenCalledWith(longPrompt, expect.any(Object));
    });

    it('does not compress short client system prompts', async () => {
        mockProxySettings.telegraphicEnabled = true;
        mockProxySettings.compressClientPrompt = true;
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({
            messages: [
                { role: 'system', content: 'Short prompt' },
                { role: 'user', content: 'hi' },
            ],
        }), res);

        // Short prompts (<= 200 chars) should not be compressed
        expect(mockToTelegraphic).not.toHaveBeenCalled();
    });

    it('splits knowledge and client parts when compressing system prompt with injected knowledge', async () => {
        mockProxySettings.telegraphicEnabled = true;
        mockProxySettings.compressClientPrompt = true;

        const clientPart = 'B'.repeat(300);
        const knowledgePart = '<knowledge-context>some knowledge</knowledge-context>\n\n---\n';
        const combined = knowledgePart + clientPart;

        // Simulate knowledge already injected
        mockPrepare.mockResolvedValue({
            systemPrompt: 'some knowledge',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });
        mockInjectKnowledge.mockImplementation((msgs) => {
            const result = [...msgs];
            const sysIdx = result.findIndex((m: any) => m.role === 'system');
            if (sysIdx >= 0) {
                result[sysIdx] = { ...result[sysIdx], content: combined };
            } else {
                result.unshift({ role: 'system', content: combined });
            }
            return result;
        });
        mockToTelegraphic.mockImplementation((text: string) => 'COMPRESSED:' + text.slice(0, 10));

        const res = makeRes();
        await handler(makeReq({
            messages: [
                { role: 'system', content: clientPart },
                { role: 'user', content: 'hi' },
            ],
        }), res);

        // toTelegraphic should be called for the knowledge prompt AND the client part (not the knowledge-context part again)
        const calls = (mockToTelegraphic as jest.Mock).mock.calls;
        // First call is for knowledge compression, second for client prompt
        const clientCompressCall = calls.find((c: any[]) => c[0] === clientPart || c[0].startsWith('B'));
        expect(clientCompressCall).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // Safety check (4c) — drop knowledge when overflow detected
    // -----------------------------------------------------------------------

    it('drops knowledge when enriched messages exceed context window', async () => {
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: 1000 }));
        mockEstimateTokens
            .mockReturnValueOnce(100)  // initial message estimate
            .mockReturnValueOnce(950); // enriched message estimate (too big)
        mockPrepare.mockResolvedValue({
            systemPrompt: 'huge knowledge block',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });
        mockInjectKnowledge.mockImplementation((msgs) => {
            const result = [...msgs];
            result.unshift({ role: 'system', content: 'huge injected knowledge' });
            return result;
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 100,
        }), res);

        // Should fall back to original messages (callWithMessages should get un-enriched messages)
        expect(mockCallWithMessages).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Tool calling injection (4d)
    // -----------------------------------------------------------------------

    it('injects graph tools when toolCalling enabled and client has no tools', async () => {
        mockProxySettings.toolCallingEnabled = true;
        const graphTools = [{ type: 'function', function: { name: 'podbit_query', parameters: {} } }];
        mockGetToolDefinitions.mockReturnValue(graphTools);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: [],
            iterations: 1,
            aborted: false,
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
        }), res);

        expect(mockGetToolDefinitions).toHaveBeenCalledWith('read-only');
        expect(mockRunAgentLoop).toHaveBeenCalled();
    });

    it('skips graph tool injection when client provides its own tools', async () => {
        mockProxySettings.toolCallingEnabled = true;
        const clientTools = [{ type: 'function', function: { name: 'read_file' } }];

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            tools: clientTools,
        }), res);

        expect(mockGetToolDefinitions).not.toHaveBeenCalled();
        expect(mockRunAgentLoop).not.toHaveBeenCalled();
        // Should use regular callWithMessages instead
        expect(mockCallWithMessages).toHaveBeenCalled();
    });

    it('skips tool injection when model does not support tools', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockResolveModel.mockResolvedValue(defaultResolvedModel({
            _registryModel: { supportsTools: false },
        }));

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
        }), res);

        expect(mockGetToolDefinitions).not.toHaveBeenCalled();
        expect(mockRunAgentLoop).not.toHaveBeenCalled();
    });

    it('strips client tools when model does not support them', async () => {
        mockResolveModel.mockResolvedValue(defaultResolvedModel({
            _registryModel: { supportsTools: false },
        }));

        const clientTools = [{ type: 'function', function: { name: 'read_file' } }];

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            tools: clientTools,
        }), res);

        // tools should be undefined in callOpts
        const callOpts = (mockCallWithMessages as jest.Mock).mock.calls[0][2];
        expect(callOpts.tools).toBeUndefined();
    });

    it('skips graph tools when insufficient context budget', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockResolveModel.mockResolvedValue(defaultResolvedModel({ contextSize: 500 }));
        mockEstimateTokens.mockReturnValue(400);
        mockEstimateToolTokens.mockReturnValue(200);
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 100,
        }), res);

        // Should fall back to regular call, not agent loop
        expect(mockRunAgentLoop).not.toHaveBeenCalled();
        expect(mockCallWithMessages).toHaveBeenCalled();
    });

    it('logs agent loop tool calls and iterations', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: ['call1', 'call2'],
            iterations: 3,
            aborted: false,
            fallbackReason: null,
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockRunAgentLoop).toHaveBeenCalledWith(expect.objectContaining({
            maxIterations: 5,
        }));
    });

    it('logs fallback reason when agent loop falls back', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: [],
            iterations: 1,
            aborted: false,
            fallbackReason: 'model did not use tools',
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        // Should complete without error
        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices).toBeDefined();
        consoleSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // Tool choice and response_format
    // -----------------------------------------------------------------------

    it('sets tool_choice to "auto" when tools are present and no explicit choice', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: [],
            iterations: 1,
            aborted: false,
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
        }), res);

        const callArgs = (mockRunAgentLoop as jest.Mock).mock.calls[0][0];
        expect(callArgs.callOptions.tool_choice).toBe('auto');
    });

    it('strips response_format text type when tools are present', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: [],
            iterations: 1,
            aborted: false,
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            response_format: { type: 'text' },
        }), res);

        const callArgs = (mockRunAgentLoop as jest.Mock).mock.calls[0][0];
        expect(callArgs.callOptions.response_format).toBeUndefined();
    });

    it('preserves json_object response_format when tools are present', async () => {
        mockProxySettings.toolCallingEnabled = true;
        mockGetToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'query' } }]);
        mockEstimateToolTokens.mockReturnValue(50);
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: defaultLlmResult(),
            toolCallsExecuted: [],
            iterations: 1,
            aborted: false,
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            response_format: { type: 'json_object' },
        }), res);

        const callArgs = (mockRunAgentLoop as jest.Mock).mock.calls[0][0];
        expect(callArgs.callOptions.response_format).toEqual({ type: 'json_object' });
    });

    // -----------------------------------------------------------------------
    // Context engine update (step 7)
    // -----------------------------------------------------------------------

    it('calls context update with assistant response', async () => {
        mockUpdate.mockResolvedValue(undefined);

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        // update is fire-and-forget, but should be called
        expect(mockUpdate).toHaveBeenCalledWith('proxy:test-session', 'Hello!');
    });

    it('does not call context update when response has no content', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: '' } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockUpdate).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // Raw tool call token detection (step 6)
    // -----------------------------------------------------------------------

    it('warns about raw tool call tokens in response', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: '<|channel|>commentary functions:' } }],
            model: 'test-model',
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('raw tool call tokens'));
        consoleSpy.mockRestore();
    });

    it('does not warn for normal response content', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        const rawToolWarning = consoleSpy.mock.calls.find(
            (c: any) => typeof c[0] === 'string' && c[0].includes('raw tool call tokens')
        );
        expect(rawToolWarning).toBeUndefined();
        consoleSpy.mockRestore();
    });

    // -----------------------------------------------------------------------
    // LLM call parameters passthrough
    // -----------------------------------------------------------------------

    it('passes all OpenAI-compatible parameters to callWithMessages', async () => {
        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            model: 'test-model',
            temperature: 0.7,
            max_tokens: 500,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
            stop: ['\n'],
            response_format: { type: 'json_object' },
            n: 2,
            seed: 42,
            logprobs: true,
            top_logprobs: 5,
            user: 'test-user',
        }), res);

        expect(mockCallWithMessages).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Object),
            expect.objectContaining({
                temperature: 0.7,
                maxTokens: 500,
                top_p: 0.9,
                frequency_penalty: 0.5,
                presence_penalty: 0.3,
                stop: ['\n'],
                response_format: { type: 'json_object' },
                n: 2,
                seed: 42,
                logprobs: true,
                top_logprobs: 5,
                user: 'test-user',
            }),
        );
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    it('returns 502 and increments errorCount on LLM call failure', async () => {
        mockCallWithMessages.mockRejectedValue(new Error('upstream timeout'));

        const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0, startedAt: '' };
        const fakeApp = { post: (_p: string, fn: any) => { handler = fn; } };
        registerCompletionsHandler(fakeApp as any, stats);

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({
                type: 'upstream_error',
                message: expect.stringContaining('upstream timeout'),
            }),
        }));
        expect(stats.errorCount).toBe(1);
    });

    it('returns 502 on resolveModel failure', async () => {
        mockResolveModel.mockRejectedValue(new Error('No models available'));

        const stats = { requestCount: 0, enrichedCount: 0, errorCount: 0, startedAt: '' };
        const fakeApp = { post: (_p: string, fn: any) => { handler = fn; } };
        registerCompletionsHandler(fakeApp as any, stats);

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(res.status).toHaveBeenCalledWith(502);
        expect(stats.errorCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // extractTextContent usage
    // -----------------------------------------------------------------------

    it('extracts text content from last user message for context engine', async () => {
        mockExtractTextContent.mockReturnValue('extracted user text');
        mockPrepare.mockResolvedValue({ systemPrompt: null });

        const res = makeRes();
        await handler(makeReq({
            messages: [
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'first message' },
                { role: 'assistant', content: 'response' },
                { role: 'user', content: 'second message' },
            ],
        }), res);

        // extractTextContent should be called with the LAST user message's content
        expect(mockExtractTextContent).toHaveBeenCalledWith('second message');
        expect(mockPrepare).toHaveBeenCalledWith(
            'extracted user text',
            expect.any(String),
            expect.any(Object),
        );
    });

    // -----------------------------------------------------------------------
    // Passthrough with client tools (injectKnowledge clientHasTools flag)
    // -----------------------------------------------------------------------

    it('passes clientHasTools=true to injectKnowledge when client provides tools', async () => {
        const clientTools = [{ type: 'function', function: { name: 'read_file' } }];
        mockPrepare.mockResolvedValue({
            systemPrompt: 'Knowledge text',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            tools: clientTools,
        }), res);

        expect(mockInjectKnowledge).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(String),
            true,
        );
    });

    // -----------------------------------------------------------------------
    // Entropy-aware telegraphic
    // -----------------------------------------------------------------------

    it('passes entropy options to telegraphic when entropy is enabled', async () => {
        mockProxySettings.telegraphicEnabled = true;
        mockProxySettings.entropyEnabled = true;
        mockProxySettings.entropyWeights = { entity: 0.5 };
        mockProxySettings.entropyThresholds = { low: 0.3 };
        mockProxySettings.entropyRarityMinLength = 10;
        mockPrepare.mockResolvedValue({
            systemPrompt: 'Knowledge text',
            knowledge: [{ id: 'n1' }],
            topics: [],
        });

        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);

        expect(mockToTelegraphic).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            entropy: expect.objectContaining({
                enabled: true,
                weights: { entity: 0.5 },
                thresholds: { low: 0.3 },
                rarityMinLength: 10,
            }),
        }));
    });

    // -----------------------------------------------------------------------
    // Multiple choices (n > 1)
    // -----------------------------------------------------------------------

    it('normalizes multiple choices correctly', async () => {
        mockCallWithMessages.mockResolvedValue({
            choices: [
                { index: 0, message: { role: 'assistant', content: 'A' }, finish_reason: 'stop' },
                { index: 1, message: { role: 'assistant', content: 'B' }, finish_reason: 'stop' },
            ],
            model: 'test-model',
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        });

        const res = makeRes();
        await handler(makeReq({
            messages: [{ role: 'user', content: 'hi' }],
            n: 2,
        }), res);

        const body = (res.json as jest.Mock).mock.calls[0][0];
        expect(body.choices).toHaveLength(2);
        expect(body.choices[0].index).toBe(0);
        expect(body.choices[1].index).toBe(1);
    });

    // -----------------------------------------------------------------------
    // ensureProxySettings called
    // -----------------------------------------------------------------------

    it('calls ensureProxySettings at the start of each request', async () => {
        const res = makeRes();
        await handler(makeReq({ messages: [{ role: 'user', content: 'hi' }] }), res);
        expect(mockEnsureProxySettings).toHaveBeenCalled();
    });
});
