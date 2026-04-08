/**
 * Unit tests for models/embedding.ts ---
 * getEmbeddingModelName, getEmbedding (openai / local / lmstudio / unknown).
 *
 * The embedding module now routes through the model assignment system.
 * - No config fallback for model name (returns "(none)" when unassigned)
 * - Missing endpointUrl falls back to resolveProviderEndpoint()
 * - All non-local providers use OpenAI-compatible API
 * - API key comes from model.apiKey || getApiKey(provider)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Simulate subsystem assignment cache
let mockAssignedModel: any = null;

const mockGetApiKey = jest.fn<() => string | undefined>().mockReturnValue(undefined);
const mockGetAssignedModel = jest.fn(() => mockAssignedModel);
const mockEnsureAssignmentsLoaded = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLogUsage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockAcquireModelSlot = jest.fn<() => Promise<(() => void) | undefined>>().mockResolvedValue(undefined);
const mockResolveProviderEndpoint = jest.fn<(provider: string) => string>().mockImplementation(
    (provider: string) => {
        switch (provider) {
            case 'openai': return 'https://api.openai.com/v1';
            case 'local': return 'http://127.0.0.1:11434';
            case 'lmstudio': return 'http://127.0.0.1:1234/v1';
            default: return 'http://127.0.0.1:11434';
        }
    }
);

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getAssignedModel: mockGetAssignedModel,
    ensureAssignmentsLoaded: mockEnsureAssignmentsLoaded,
}));

jest.unstable_mockModule('../../models/cost.js', () => ({
    logUsage: mockLogUsage,
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
    acquireModelSlot: mockAcquireModelSlot,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    resolveProviderEndpoint: mockResolveProviderEndpoint,
}));

const { getEmbeddingModelName, getEmbedding } = await import('../../models/embedding.js');

// Mock global fetch
const mockFetch = jest.fn<() => Promise<any>>();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
    jest.resetAllMocks();
    mockAssignedModel = null;
    // Restore the closure-based implementation after resetAllMocks clears it
    mockGetAssignedModel.mockImplementation(() => mockAssignedModel);
    mockGetApiKey.mockReturnValue(undefined);
    mockEnsureAssignmentsLoaded.mockResolvedValue(undefined);
    mockLogUsage.mockResolvedValue(undefined);
    mockAcquireModelSlot.mockResolvedValue(undefined);
    mockResolveProviderEndpoint.mockImplementation((provider: string) => {
        switch (provider) {
            case 'openai': return 'https://api.openai.com/v1';
            case 'local': return 'http://127.0.0.1:11434';
            case 'lmstudio': return 'http://127.0.0.1:1234/v1';
            default: return 'http://127.0.0.1:11434';
        }
    });
    mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: null }),
        text: async () => 'error text',
    });
});

// =============================================================================
// getEmbeddingModelName
// =============================================================================

describe('getEmbeddingModelName', () => {
    it('returns assigned model name when subsystem is assigned', () => {
        mockAssignedModel = { provider: 'openai', modelId: 'nomic-embed-text', endpointUrl: null };
        expect(getEmbeddingModelName()).toBe('nomic-embed-text');
    });

    it('returns "(none)" when no assignment', () => {
        mockAssignedModel = null;
        expect(getEmbeddingModelName()).toBe('(none)');
    });

    it('falls back to name when modelId is empty', () => {
        mockAssignedModel = { provider: 'openai', modelId: '', name: 'My Model', endpointUrl: null };
        expect(getEmbeddingModelName()).toBe('My Model');
    });
});

// =============================================================================
// getEmbedding — routing
// =============================================================================

describe('getEmbedding routing', () => {
    it('returns null when no model assigned', async () => {
        mockAssignedModel = null;

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('No embedding model assigned'));
        spy.mockRestore();
    });

    it('calls OpenAI embeddings API when provider=openai', async () => {
        mockAssignedModel = { provider: 'openai', modelId: 'text-embedding-3-small', endpointUrl: 'https://api.openai.com/v1' };
        mockGetApiKey.mockReturnValue('sk-test-key');
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.5, 0.6] }] }),
        });

        const result = await getEmbedding('hello world');

        expect(result).toEqual([0.5, 0.6]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/embeddings');
        const body = JSON.parse(opts.body);
        expect(body.model).toBe('text-embedding-3-small');
        expect(body.input).toBe('hello world');
    });

    it('calls Ollama when provider=local', async () => {
        mockAssignedModel = { provider: 'local', modelId: 'nomic-embed', endpointUrl: 'http://127.0.0.1:11434' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
        });

        const result = await getEmbedding('hello');

        expect(result).toEqual([0.1, 0.2, 0.3]);
        const [url, opts] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/api/embeddings');
        const body = JSON.parse(opts.body);
        expect(body.prompt).toBe('hello');
    });

    it('returns null on Ollama connection error', async () => {
        mockAssignedModel = { provider: 'local', modelId: 'nomic-embed', endpointUrl: 'http://127.0.0.1:11434' };
        const err: any = new Error('ECONNREFUSED');
        err.cause = { code: 'ECONNREFUSED' };
        mockFetch.mockRejectedValueOnce(err);

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        spy.mockRestore();
    });

    it('calls LM Studio when provider=lmstudio (OpenAI-compatible)', async () => {
        mockAssignedModel = { provider: 'lmstudio', modelId: 'nomic-lmstudio', endpointUrl: 'http://127.0.0.1:1234/v1' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.7, 0.8] }] }),
        });

        const result = await getEmbedding('text');

        expect(result).toEqual([0.7, 0.8]);
        const [url] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/embeddings');
    });

    it('treats unknown providers as OpenAI-compatible', async () => {
        // Unknown providers now use callOpenAICompatibleEmbedding (not rejected)
        mockAssignedModel = { provider: 'custom-unknown', modelId: 'some-model', endpointUrl: 'http://custom:8080/v1' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
        });

        const result = await getEmbedding('test');
        expect(result).toEqual([0.1, 0.2]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('truncates text longer than 8000 chars before embedding', async () => {
        mockAssignedModel = { provider: 'openai', modelId: 'text-embedding-3-small', endpointUrl: 'https://api.openai.com/v1' };
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.1] }] }),
        });

        const longText = 'a'.repeat(9000);
        await getEmbedding(longText);

        const [, opts] = mockFetch.mock.calls[0] as any[];
        const body = JSON.parse(opts.body);
        expect(body.input.length).toBe(8000);
    });

    it('falls back to provider default endpoint when endpointUrl missing', async () => {
        mockAssignedModel = { provider: 'openai', modelId: 'text-embedding-3-small', endpointUrl: null };
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [{ embedding: [0.1] }] }),
        });

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await getEmbedding('test');
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('no endpoint URL'));
        spy.mockRestore();
    });

    it('returns null on non-ok API response', async () => {
        mockAssignedModel = { provider: 'openai', modelId: 'text-embedding-3-small', endpointUrl: 'https://api.openai.com/v1' };
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            text: async () => 'rate limit exceeded',
        });

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        // The outer catch returns null instead of throwing
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });
});
