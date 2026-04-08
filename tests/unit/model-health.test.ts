/**
 * Unit tests for models/health.ts —
 * checkModelHealth, callEnsemble, healthCheck.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetApiKey = jest.fn<() => string | undefined>().mockReturnValue(undefined);
const mockCallSingleModel = jest.fn<() => Promise<any>>().mockResolvedValue({ text: 'response' });
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue([0.1, 0.2]);

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

jest.unstable_mockModule('../../models/providers.js', () => ({
    callSingleModel: mockCallSingleModel,
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
    getAssignedModel: jest.fn(),
}));

jest.unstable_mockModule('../../models/embedding.js', () => ({
    getEmbedding: mockGetEmbedding,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    resolveProviderEndpoint: jest.fn((provider: string) => `https://${provider}.api.com/v1/chat/completions`),
}));

const { checkModelHealth, callEnsemble, healthCheck } = await import('../../models/health.js');

// Mock global fetch
const mockFetch = jest.fn<() => Promise<any>>();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
    jest.resetAllMocks();
    mockGetApiKey.mockReturnValue(undefined);
    mockCallSingleModel.mockResolvedValue({ text: 'response' });
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetEmbedding.mockResolvedValue([0.1, 0.2]);
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ models: [] }) });
});

// =============================================================================
// checkModelHealth
// =============================================================================

describe('checkModelHealth', () => {
    it('calls Anthropic health endpoint for anthropic provider', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true });

        await checkModelHealth({
            name: 'claude-3',
            provider: 'anthropic',
            model: 'claude-3',
            apiKey: 'ant-test-key',
        } as any);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('anthropic.com/v1/models');
        expect(opts.headers['x-api-key']).toBe('ant-test-key');
    });

    it('throws when Anthropic returns non-ok status', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

        await expect(checkModelHealth({
            name: 'claude-3',
            provider: 'anthropic',
            model: 'claude-3',
            apiKey: 'bad-key',
        } as any)).rejects.toThrow('401');
    });

    it('calls /v1/models for OpenAI-compatible providers', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true });
        mockGetApiKey.mockReturnValue('sk-test');

        await checkModelHealth({
            name: 'gpt-4',
            provider: 'openai',
            model: 'gpt-4',
            endpoint: 'http://localhost:1234/v1/chat/completions',
        } as any);

        const [url] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/v1/models');
        expect(url).not.toContain('chat/completions');
    });

    it('includes Authorization header when API key available', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true });
        mockGetApiKey.mockReturnValue('sk-apikey');

        await checkModelHealth({
            name: 'local-model',
            provider: 'local',
            model: 'local-model',
            endpoint: 'http://localhost:11434/v1/chat/completions',
        } as any);

        const [, opts] = mockFetch.mock.calls[0] as any[];
        expect(opts.headers['Authorization']).toBe('Bearer sk-apikey');
    });

    it('throws when non-Anthropic endpoint returns non-ok', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

        await expect(checkModelHealth({
            name: 'model',
            provider: 'openai',
            model: 'model',
            endpoint: 'http://localhost:1234/v1/chat/completions',
        } as any)).rejects.toThrow('503');
    });
});

// =============================================================================
// callEnsemble
// =============================================================================

describe('callEnsemble', () => {
    it('returns empty array when no models provided', async () => {
        const result = await callEnsemble('test prompt');
        expect(result).toEqual([]);
    });

    it('calls each model and returns per-model results', async () => {
        mockCallSingleModel
            .mockResolvedValueOnce({ text: 'Response from model A' })
            .mockResolvedValueOnce({ text: 'Response from model B' });

        const models = [
            { name: 'Model A', id: 'a', modelId: 'model-a', provider: 'openai' },
            { name: 'Model B', id: 'b', modelId: 'model-b', provider: 'openai' },
        ] as any[];

        const result = await callEnsemble('test prompt', { models });

        expect(result).toHaveLength(2);
        expect(result[0].model).toBe('Model A');
        expect(result[0].success).toBe(true);
        expect(result[0].response).toBe('Response from model A');
        expect(result[1].model).toBe('Model B');
        expect(result[1].success).toBe(true);
    });

    it('reports failure for models that throw', async () => {
        mockCallSingleModel
            .mockResolvedValueOnce({ text: 'ok' })
            .mockRejectedValueOnce(new Error('connection refused'));

        const models = [
            { name: 'Good Model', id: 'g', modelId: 'gm', provider: 'openai' },
            { name: 'Bad Model', id: 'b', modelId: 'bm', provider: 'openai' },
        ] as any[];

        const result = await callEnsemble('prompt', { models });

        expect(result[0].success).toBe(true);
        expect(result[1].success).toBe(false);
        expect(result[1].error).toBe('connection refused');
        expect(result[1].response).toBeNull();
    });
});

// =============================================================================
// healthCheck
// =============================================================================

describe('healthCheck', () => {
    it('returns "not assigned" when no subsystems assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const result = await healthCheck(true); // force=true to bypass cache

        expect(result.embedding).toBe('not assigned');
        // No model subsystems — only embedding key
        const keys = Object.keys(result).filter(k => k !== '_cached');
        expect(keys).toEqual(['embedding']);
    });

    it('includes subsystem status for assigned models', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: {
                id: 'model-1',
                name: 'Test Model',
                modelId: 'test-model',
                provider: 'openai',
                endpointUrl: 'http://localhost:1234/v1/chat/completions',
                apiKey: null,
            },
        });
        mockFetch.mockResolvedValue({ ok: true });

        const result = await healthCheck(true);

        const voiceKey = Object.keys(result).find(k => k.startsWith('voice'));
        expect(voiceKey).toBeDefined();
        expect(result[voiceKey!]).toBe('ok');
    });

    it('records error status for failing models', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: {
                id: 'model-1',
                name: 'Failing Model',
                modelId: 'fail-model',
                provider: 'openai',
                endpointUrl: 'http://localhost:1234/v1/chat/completions',
                apiKey: null,
            },
        });
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await healthCheck(true);

        const voiceKey = Object.keys(result).find(k => k.startsWith('voice'));
        expect(result[voiceKey!]).toContain('error:');
        expect(result[voiceKey!]).toContain('ECONNREFUSED');
    });

    it('checks embedding via checkModelHealth when assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            embedding: {
                id: 'emb-model',
                name: 'Embedding Model',
                modelId: 'nomic',
                provider: 'local',
                endpointUrl: 'http://127.0.0.1:11434/v1/chat/completions',
                apiKey: null,
            },
        });
        mockFetch.mockResolvedValue({ ok: true });

        const result = await healthCheck(true);

        // Embedding is checked via checkModelHealth, key format is "embedding (name)"
        const embKey = Object.keys(result).find(k => k.startsWith('embedding'));
        expect(embKey).toBeDefined();
        expect(result[embKey!]).toBe('ok');
    });

    it('records embedding error when checkModelHealth fails', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            embedding: {
                id: 'emb-model',
                name: 'Bad Embedding',
                modelId: 'nomic',
                provider: 'local',
                endpointUrl: 'http://127.0.0.1:11434/v1/chat/completions',
                apiKey: null,
            },
        });
        mockFetch.mockRejectedValue(new Error('connection refused'));

        const result = await healthCheck(true);

        const embKey = Object.keys(result).find(k => k.startsWith('embedding'));
        expect(embKey).toBeDefined();
        expect(result[embKey!]).toContain('error:');
    });

    it('skips embedding subsystem in main loop (checked separately)', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            embedding: {
                id: 'emb-model',
                name: 'Embedding Model',
                modelId: 'nomic',
                provider: 'local',
                endpointUrl: 'http://127.0.0.1:11434/v1/chat/completions',
                apiKey: null,
            },
        });
        mockFetch.mockResolvedValue({ ok: true });

        const result = await healthCheck(true);

        // Embedding should appear as "embedding (Embedding Model)" not as a bare "embedding" key
        const keys = Object.keys(result).filter(k => k !== '_cached');
        // Should have exactly one key: the embedding check result
        expect(keys).toHaveLength(1);
        expect(keys[0]).toContain('embedding');
        expect(keys[0]).toContain('Embedding Model');
    });
});
