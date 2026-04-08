/**
 * Unit tests for models/registry.ts — context size detection and auto-import.
 * Complements model-registry.test.ts which covers basic CRUD.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLoadAssignmentCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetApiKey = jest.fn<(provider: string) => string | undefined>().mockReturnValue(undefined);
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('gen-uuid');
const mockNormalizeProvider = jest.fn<(p: string) => string>().mockImplementation(p => p);
const mockResolveProviderEndpoint = jest.fn<(p: string) => string>().mockReturnValue('http://localhost:11434/v1');

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
    systemQueryOne: mockQueryOne,
    query: mockQuery,
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    loadAssignmentCache: mockLoadAssignmentCache,
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    normalizeProvider: mockNormalizeProvider,
    resolveProviderEndpoint: mockResolveProviderEndpoint,
    generateUuid: mockGenerateUuid,
    VALID_SUBSYSTEMS: ['chat', 'voice', 'synthesis'],
    getModelProvider: jest.fn<() => string>().mockReturnValue('openai'),
}));

const {
    getRegisteredModels,
    registerModel,
    updateRegisteredModel,
    deleteRegisteredModel,
    detectContextSize,
    autoImportToRegistry,
} = await import('../../models/registry.js');

// Spy on global fetch for context size detection tests
const originalFetch = globalThis.fetch;

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLoadAssignmentCache.mockResolvedValue(undefined);
    mockGetApiKey.mockReturnValue(undefined);
    mockGenerateUuid.mockReturnValue('gen-uuid');
    mockNormalizeProvider.mockImplementation(p => p);
    mockResolveProviderEndpoint.mockReturnValue('http://localhost:11434/v1');
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// =============================================================================
// rowToRegisteredModel edge cases
// =============================================================================

describe('rowToRegisteredModel (via getRegisteredModels)', () => {
    it('maps no_think=1 to noThink=true and thinkingLevel=off', async () => {
        mockQuery.mockResolvedValue([{
            id: 'm1', name: 'M', provider: 'openai', model_id: 'x',
            tier: 'medium', endpoint_url: null, api_key: null, enabled: 1,
            max_tokens: null, context_size: null, cost_per_1k: null,
            input_cost_per_mtok: null, output_cost_per_mtok: null, tool_cost_per_mtok: null,
            sort_order: null, max_retries: null, retry_window_minutes: null,
            max_concurrency: null, request_pause_ms: null, request_timeout: null,
            rate_limit_backoff_ms: null, supports_tools: null, no_think: 1,
        }]);
        const result = await getRegisteredModels();
        expect(result[0].noThink).toBe(true);
        expect(result[0].thinkingLevel).toBe('off');
    });

    it('maps no_think=0 to noThink=false and thinkingLevel=null', async () => {
        mockQuery.mockResolvedValue([{
            id: 'm1', name: 'M', provider: 'openai', model_id: 'x',
            tier: 'medium', endpoint_url: null, api_key: null, enabled: 1,
            max_tokens: null, context_size: null, cost_per_1k: null,
            input_cost_per_mtok: null, output_cost_per_mtok: null, tool_cost_per_mtok: null,
            sort_order: null, max_retries: null, retry_window_minutes: null,
            max_concurrency: null, request_pause_ms: null, request_timeout: null,
            rate_limit_backoff_ms: null, supports_tools: null, no_think: 0,
        }]);
        const result = await getRegisteredModels();
        expect(result[0].noThink).toBe(false);
        expect(result[0].thinkingLevel).toBeNull();
    });

    it('defaults retryWindowMinutes and requestTimeout', async () => {
        mockQuery.mockResolvedValue([{
            id: 'm1', name: 'M', provider: 'local', model_id: 'x',
            tier: null, endpoint_url: null, api_key: null, enabled: 0,
            max_tokens: null, context_size: null, cost_per_1k: null,
            input_cost_per_mtok: null, output_cost_per_mtok: null, tool_cost_per_mtok: null,
            sort_order: null, max_retries: null, retry_window_minutes: null,
            max_concurrency: null, request_pause_ms: null, request_timeout: null,
            rate_limit_backoff_ms: null, supports_tools: null, no_think: 0,
        }]);
        const result = await getRegisteredModels();
        expect(result[0].retryWindowMinutes).toBe(2);
        expect(result[0].requestTimeout).toBe(180);
        expect(result[0].requestPauseMs).toBe(0);
        expect(result[0].rateLimitBackoffMs).toBe(120000);
    });

    it('maps multiple rows correctly', async () => {
        mockQuery.mockResolvedValue([
            { id: 'a', name: 'A', provider: 'openai', model_id: 'a1', tier: 'small', endpoint_url: null, api_key: null, enabled: 1, max_tokens: 100, context_size: 8000, cost_per_1k: 0, input_cost_per_mtok: 0, output_cost_per_mtok: 0, tool_cost_per_mtok: 0, sort_order: 0, max_retries: 1, retry_window_minutes: 1, max_concurrency: 2, request_pause_ms: 100, request_timeout: 60, rate_limit_backoff_ms: 5000, supports_tools: 1, no_think: 0 },
            { id: 'b', name: 'B', provider: 'local', model_id: 'b1', tier: 'large', endpoint_url: 'http://x', api_key: 'key', enabled: 0, max_tokens: 200, context_size: 16000, cost_per_1k: 1, input_cost_per_mtok: 5, output_cost_per_mtok: 10, tool_cost_per_mtok: 2, sort_order: 5, max_retries: 5, retry_window_minutes: 5, max_concurrency: 4, request_pause_ms: 50, request_timeout: 300, rate_limit_backoff_ms: 60000, supports_tools: 0, no_think: 1 },
        ]);
        const result = await getRegisteredModels();
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('a');
        expect(result[1].id).toBe('b');
        expect(result[1].enabled).toBe(false);
        expect(result[1].endpointUrl).toBe('http://x');
        expect(result[1].apiKey).toBe('key');
    });
});

// =============================================================================
// registerModel — defaults and edge cases
// =============================================================================

describe('registerModel edge cases', () => {
    it('defaults maxRetries, retryWindowMinutes, maxConcurrency, etc. via ?? fallback', async () => {
        const model = {
            name: 'Min', provider: 'local', modelId: 'llama',
            tier: undefined as any, endpointUrl: null, apiKey: null, enabled: false,
            maxTokens: null, contextSize: null, costPer1k: 0,
            inputCostPerMtok: undefined as any, outputCostPerMtok: undefined as any,
            toolCostPerMtok: undefined as any, sortOrder: 0,
            maxRetries: undefined as any, retryWindowMinutes: undefined as any,
            maxConcurrency: undefined as any, requestPauseMs: undefined as any,
            requestTimeout: undefined as any, rateLimitBackoffMs: undefined as any,
            supportsTools: null, noThink: false, thinkingLevel: null,
        };

        await registerModel(model);

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCall).toBeDefined();
        const params = insertCall[1];
        // enabled=false → 0
        expect(params[7]).toBe(0);
        // inputCostPerMtok defaults to 0
        expect(params[11]).toBe(0);
        expect(params[12]).toBe(0);
        expect(params[13]).toBe(0);
        // maxRetries defaults to 3
        expect(params[15]).toBe(3);
        // retryWindowMinutes defaults to 2
        expect(params[16]).toBe(2);
        // maxConcurrency defaults to 1
        expect(params[17]).toBe(1);
        // requestPauseMs defaults to 0
        expect(params[18]).toBe(0);
        // requestTimeout defaults to 180
        expect(params[19]).toBe(180);
        // rateLimitBackoffMs defaults to 120000
        expect(params[20]).toBe(120000);
    });

    it('passes noThink=true as 1', async () => {
        const model = {
            name: 'M', provider: 'openai', modelId: 'o1', tier: 'large' as const,
            endpointUrl: null, apiKey: null, enabled: true, maxTokens: null,
            contextSize: null, costPer1k: 0, inputCostPerMtok: 0,
            outputCostPerMtok: 0, toolCostPerMtok: 0, sortOrder: 0,
            maxRetries: 3, retryWindowMinutes: 2, maxConcurrency: 1,
            requestPauseMs: 0, requestTimeout: 180, rateLimitBackoffMs: 120000,
            supportsTools: null, noThink: true, thinkingLevel: null,
        };
        await registerModel(model);
        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        // noThink is last param (index 21)
        expect(insertCall[1][21]).toBe(1);
    });
});

// =============================================================================
// updateRegisteredModel — additional field coverage
// =============================================================================

describe('updateRegisteredModel additional fields', () => {
    it('handles cost field updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', {
            costPer1k: 0.05,
            inputCostPerMtok: 15,
            outputCostPerMtok: 30,
            toolCostPerMtok: 5,
        });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        const sql = String(updateCall[0]);
        expect(sql).toContain('cost_per_1k');
        expect(sql).toContain('input_cost_per_mtok');
        expect(sql).toContain('output_cost_per_mtok');
        expect(sql).toContain('tool_cost_per_mtok');
    });

    it('handles retry and concurrency updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', {
            maxRetries: 5,
            retryWindowMinutes: 10,
            maxConcurrency: 4,
            requestPauseMs: 200,
            requestTimeout: 300,
            rateLimitBackoffMs: 60000,
        });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        const sql = String(updateCall[0]);
        expect(sql).toContain('max_retries');
        expect(sql).toContain('retry_window_minutes');
        expect(sql).toContain('max_concurrency');
        expect(sql).toContain('request_pause_ms');
        expect(sql).toContain('request_timeout');
        expect(sql).toContain('rate_limit_backoff_ms');
    });

    it('handles noThink update true → 1', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { noThink: true });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain(1);
    });

    it('handles provider and modelId updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { provider: 'anthropic', modelId: 'claude-3' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('anthropic');
        expect(updateCall[1]).toContain('claude-3');
    });

    it('handles tier and endpointUrl updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { tier: 'small', endpointUrl: 'http://custom:8080' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('small');
        expect(updateCall[1]).toContain('http://custom:8080');
    });

    it('handles apiKey and maxTokens updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { apiKey: 'sk-secret', maxTokens: 8192 });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('sk-secret');
        expect(updateCall[1]).toContain(8192);
    });

    it('handles contextSize and sortOrder updates', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { contextSize: 32000, sortOrder: 99 });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain(32000);
        expect(updateCall[1]).toContain(99);
    });

    it('always appends updated_at to SET clause', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { name: 'X' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(String(updateCall[0])).toContain("updated_at = datetime('now')");
    });

    it('converts supportsTools=false to 0', async () => {
        mockQuery.mockResolvedValue([]);
        await updateRegisteredModel('m1', { supportsTools: false });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall[1][0]).toBe(0);
    });
});

// =============================================================================
// detectContextSize
// =============================================================================

describe('detectContextSize', () => {
    const baseModel = {
        id: 'm1', name: 'Test', provider: 'openai', modelId: 'gpt-4',
        tier: 'medium', endpointUrl: null, apiKey: null, enabled: true,
        maxTokens: null, contextSize: null, costPer1k: 0,
        inputCostPerMtok: 0, outputCostPerMtok: 0, toolCostPerMtok: 0,
        sortOrder: 0, maxRetries: 3, retryWindowMinutes: 2, maxConcurrency: 1,
        requestPauseMs: 0, requestTimeout: 180, rateLimitBackoffMs: 120000,
        supportsTools: null, noThink: false, thinkingLevel: null,
    };

    it('returns null for unsupported providers (openai, anthropic)', async () => {
        const result = await detectContextSize(baseModel as any);
        expect(result).toBeNull();
    });

    it('returns null for anthropic provider', async () => {
        const result = await detectContextSize({ ...baseModel, provider: 'anthropic' } as any);
        expect(result).toBeNull();
    });

    it('detects context size from Ollama /api/show endpoint', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                model_info: { 'llama.context_length': 8192 },
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
        } as any);

        expect(result).toBe(8192);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/show'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('detects context size from Ollama parameters string', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                model_info: {},
                parameters: 'num_ctx 4096\nnum_predict 2048',
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
        } as any);

        expect(result).toBe(4096);
    });

    it('returns null when Ollama API returns non-ok response', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: false,
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
        } as any);

        expect(result).toBeNull();
    });

    it('returns null when Ollama model_info has no context_length key', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                model_info: { 'llama.embedding_length': 4096 },
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
        } as any);

        expect(result).toBeNull();
    });

    it('detects context size from LM Studio /api/v0/models endpoint', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'other-model', max_context_length: 4096 },
                    { id: 'target-model', max_context_length: 32768 },
                ],
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'lmstudio', modelId: 'target-model',
        } as any);

        expect(result).toBe(32768);
    });

    it('returns null when LM Studio model not found in list', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ id: 'other-model', max_context_length: 4096 }],
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'lmstudio', modelId: 'missing-model',
        } as any);

        expect(result).toBeNull();
    });

    it('returns null when LM Studio returns non-ok', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: false,
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'lmstudio', modelId: 'x',
        } as any);

        expect(result).toBeNull();
    });

    it('returns null when LM Studio model has no max_context_length', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ id: 'target', max_context_length: 'not-a-number' }],
            }),
        } as any);
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'lmstudio', modelId: 'target',
        } as any);

        expect(result).toBeNull();
    });

    it('returns null on fetch error and does not throw', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'));
        globalThis.fetch = mockFetch;

        const result = await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
        } as any);

        expect(result).toBeNull();
    });

    it('persists detected size to registry on success', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                model_info: { 'qwen2.context_length': 16384 },
            }),
        } as any);
        globalThis.fetch = mockFetch;

        await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'qwen2',
        } as any);

        // Should have called updateRegisteredModel which calls query with UPDATE
        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCall).toBeDefined();
    });

    it('uses custom endpointUrl when provided', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({
                model_info: { 'llama.context_length': 4096 },
            }),
        } as any);
        globalThis.fetch = mockFetch;

        await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'llama3',
            endpointUrl: 'http://custom:11434/v1',
        } as any);

        expect(mockFetch).toHaveBeenCalledWith(
            'http://custom:11434/api/show',
            expect.anything(),
        );
    });

    it('strips trailing /v1 from endpoint for Ollama', async () => {
        const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            json: async () => ({ model_info: { 'x.context_length': 2048 } }),
        } as any);
        globalThis.fetch = mockFetch;

        await detectContextSize({
            ...baseModel, provider: 'local', modelId: 'x',
            endpointUrl: 'http://host:11434/v1/',
        } as any);

        expect(mockFetch).toHaveBeenCalledWith(
            'http://host:11434/api/show',
            expect.anything(),
        );
    });
});

// =============================================================================
// autoImportToRegistry
// =============================================================================

describe('autoImportToRegistry', () => {
    const origEnv = process.env;

    beforeEach(() => {
        process.env = { ...origEnv };
        delete process.env.SMALL_MODEL_ONE;
        delete process.env.SMALL_MODEL_TWO;
        delete process.env.SMALL_MODEL_THREE;
        delete process.env.TIER2_MODEL_ONE;
        delete process.env.TIER2_MODEL_TWO;
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it('syncs and returns early when registry already has models', async () => {
        mockQueryOne.mockResolvedValue({ count: 5 });

        await autoImportToRegistry();

        // Should NOT have inserted any models
        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCalls).toHaveLength(0);
        // Should still sync (loadAssignmentCache called via syncRegistryToConfig)
        expect(mockLoadAssignmentCache).toHaveBeenCalled();
    });

    it('imports env var models when registry is empty', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        process.env.SMALL_MODEL_ONE = 'llama3';
        process.env.TIER2_MODEL_ONE = 'gpt-4o';

        await autoImportToRegistry();

        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCalls).toHaveLength(2);
    });

    it('uses openai provider when openai API key is available', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        mockGetApiKey.mockReturnValue('sk-test-key');
        process.env.SMALL_MODEL_ONE = 'gpt-4o-mini';

        await autoImportToRegistry();

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        // provider param is index 2 (id=0, name=1, provider=2)
        expect(insertCall[1][2]).toBe('openai');
    });

    it('uses lmstudio provider when no openai API key', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        mockGetApiKey.mockReturnValue(undefined);
        process.env.SMALL_MODEL_ONE = 'local-model';

        await autoImportToRegistry();

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCall[1][2]).toBe('lmstudio');
    });

    it('skips empty/whitespace env vars', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        process.env.SMALL_MODEL_ONE = '  ';
        process.env.SMALL_MODEL_TWO = '';
        process.env.TIER2_MODEL_ONE = 'valid-model';

        await autoImportToRegistry();

        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCalls).toHaveLength(1);
    });

    it('does not throw on DB errors', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB locked'));

        await expect(autoImportToRegistry()).resolves.not.toThrow();
    });

    it('assigns correct sort_order to each imported model', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        process.env.SMALL_MODEL_ONE = 'model-a';
        process.env.SMALL_MODEL_TWO = 'model-b';
        process.env.SMALL_MODEL_THREE = 'model-c';

        await autoImportToRegistry();

        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCalls).toHaveLength(3);
        // sort_order is param index 4
        expect(insertCalls[0][1][4]).toBe(0);
        expect(insertCalls[1][1][4]).toBe(1);
        expect(insertCalls[2][1][4]).toBe(2);
    });

    it('trims model name whitespace', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });
        process.env.SMALL_MODEL_ONE = '  padded-model  ';

        await autoImportToRegistry();

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        // name is param index 1
        expect(insertCall[1][1]).toBe('padded-model');
    });

    it('does nothing when no env vars set and registry is empty', async () => {
        mockQueryOne.mockResolvedValue({ count: 0 });

        await autoImportToRegistry();

        const insertCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCalls).toHaveLength(0);
        // Should still sync
        expect(mockLoadAssignmentCache).toHaveBeenCalled();
    });
});

// =============================================================================
// deleteRegisteredModel — syncs registry
// =============================================================================

describe('deleteRegisteredModel sync', () => {
    it('calls syncRegistryToConfig after deletion', async () => {
        mockQuery.mockResolvedValue([]);
        await deleteRegisteredModel('m1');

        // syncRegistryToConfig calls loadAssignmentCache
        expect(mockLoadAssignmentCache).toHaveBeenCalled();
    });
});
