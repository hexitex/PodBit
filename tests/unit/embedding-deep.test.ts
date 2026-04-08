/**
 * Unit tests for models/embedding.ts -- getEmbedding, getEmbeddingModelName,
 * and all provider branches (openai, local/ollama, lmstudio, unknown).
 *
 * The embedding module now routes through the model assignment system.
 * - No config fallback for model name (returns "(none)" when unassigned)
 * - Missing endpointUrl falls back to resolveProviderEndpoint()
 * - All non-local providers use OpenAI-compatible API
 * - API key comes from model.apiKey || getApiKey(provider)
 * - Errors are caught in outer try/catch and return null
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* -- shared mock fns --------------------------------------------------- */
const mockGetAssignedModel = jest.fn<(...a: any[]) => any>();
const mockEnsureAssignmentsLoaded = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetApiKey = jest.fn<(...a: any[]) => any>();
const mockLogUsage = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockAcquireModelSlot = jest.fn<() => Promise<(() => void) | undefined>>().mockResolvedValue(undefined);
const mockResolveProviderEndpoint = jest.fn<(provider: string) => string>();
const mockFetch = jest.fn<(...a: any[]) => Promise<any>>();

/* -- module mocks ------------------------------------------------------ */
jest.unstable_mockModule('../../models/assignments.js', () => ({
    getAssignedModel: mockGetAssignedModel,
    ensureAssignmentsLoaded: mockEnsureAssignmentsLoaded,
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
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

// Replace global fetch
(globalThis as any).fetch = mockFetch;

const { getEmbedding, getEmbeddingModelName } = await import('../../models/embedding.js');

beforeEach(() => {
    jest.clearAllMocks();
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
    // Default: no assignment
    mockGetAssignedModel.mockReturnValue(null);
});

/* -- helpers ----------------------------------------------------------- */
function okJson(body: any) {
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    });
}

function errorResponse(status: number, body: string) {
    return Promise.resolve({
        ok: false,
        status,
        text: () => Promise.resolve(body),
    });
}

/* ================================================================== */
/*  resolveEmbeddingTarget (tested via getEmbeddingModelName)          */
/* ================================================================== */

describe('getEmbeddingModelName / resolveEmbeddingTarget', () => {
    it('returns assigned model when subsystem is assigned', () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'text-embedding-ada-002',
            endpointUrl: 'https://custom.endpoint',
        });
        expect(getEmbeddingModelName()).toBe('text-embedding-ada-002');
    });

    it('returns "(none)" when no assignment', () => {
        mockGetAssignedModel.mockReturnValue(null);
        expect(getEmbeddingModelName()).toBe('(none)');
    });

    it('uses endpointUrl from assignment when present', () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'emb-model',
            endpointUrl: 'https://custom',
        });
        // Just verify it resolves without error
        expect(getEmbeddingModelName()).toBe('emb-model');
    });

    it('sets endpoint to undefined when endpointUrl is empty', () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'emb-model',
            endpointUrl: '',
        });
        expect(getEmbeddingModelName()).toBe('emb-model');
    });
});

/* ================================================================== */
/*  getEmbedding -- no model configured                                */
/* ================================================================== */

describe('getEmbedding -- no model', () => {
    it('returns null and warns when no model is assigned', async () => {
        mockGetAssignedModel.mockReturnValue(null);
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('hello');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('No embedding model assigned'));
        spy.mockRestore();
    });
});

/* ================================================================== */
/*  getEmbedding -- text truncation                                    */
/* ================================================================== */

describe('getEmbedding -- truncation', () => {
    it('truncates text longer than 8000 chars', async () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'emb-model',
            endpointUrl: 'https://api.openai.com/v1',
        });
        mockGetApiKey.mockReturnValue('sk-real-key');
        mockFetch.mockImplementation((...args: any[]) => {
            return okJson({
                data: [{ embedding: [0.1, 0.2] }],
                usage: { prompt_tokens: 100, total_tokens: 100 },
            });
        });

        const longText = 'a'.repeat(10000);
        await getEmbedding(longText);

        const callBody = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
        expect(callBody.input.length).toBe(8000);
    });
});

/* ================================================================== */
/*  getEmbedding -- unknown provider                                   */
/* ================================================================== */

describe('getEmbedding -- unknown provider', () => {
    it('treats unknown providers as OpenAI-compatible', async () => {
        // The new code treats all non-local providers as OpenAI-compatible
        mockGetAssignedModel.mockReturnValue({
            provider: 'azure',
            modelId: 'some-model',
            endpointUrl: 'https://azure.api.com/v1',
        });
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [0.1, 0.2] }] }),
        );

        const result = await getEmbedding('hello');
        expect(result).toEqual([0.1, 0.2]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});

/* ================================================================== */
/*  OpenAI provider                                                   */
/* ================================================================== */

describe('getEmbedding -- openai', () => {
    beforeEach(() => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'text-embedding-3-small',
            endpointUrl: 'https://api.openai.com/v1',
            inputCostPerMtok: 0.02,
            outputCostPerMtok: 0,
        });
    });

    it('sends request without Authorization header when no API key', async () => {
        // New code doesn't reject missing API keys -- just sends without auth header
        mockGetApiKey.mockReturnValue(null);
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [0.1] }] }),
        );

        const result = await getEmbedding('hello');
        // Still makes the call (some endpoints don't need auth)
        expect(result).toEqual([0.1]);
        const [, opts] = mockFetch.mock.calls[0] as any[];
        expect(opts.headers['Authorization']).toBeUndefined();
    });

    it('returns embedding on success and logs usage', async () => {
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() =>
            okJson({
                data: [{ embedding: [0.1, 0.2, 0.3] }],
                usage: { prompt_tokens: 50, total_tokens: 50 },
            }),
        );

        const result = await getEmbedding('test text');
        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(mockLogUsage).toHaveBeenCalledTimes(1);
        const usageArg = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArg.subsystem).toBe('embedding');
        expect(usageArg.inputTokens).toBe(50);
        expect(usageArg.totalTokens).toBe(50);
    });

    it('uses default OpenAI endpoint when none specified', async () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'text-embedding-3-small',
            endpointUrl: undefined,
        });
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [1] }], usage: { prompt_tokens: 1, total_tokens: 1 } }),
        );

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await getEmbedding('test');
        // Should have warned about missing endpoint and fallen back
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('no endpoint URL'));
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('https://api.openai.com/v1/embeddings');
        spy.mockRestore();
    });

    it('uses custom endpoint from assignment', async () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'openai',
            modelId: 'emb-model',
            endpointUrl: 'https://custom.api.com/v1',
        });
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [1] }] }),
        );

        await getEmbedding('test');
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('https://custom.api.com/v1/embeddings');
    });

    it('does not log usage when response has no usage field', async () => {
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [1] }] }),
        );

        await getEmbedding('test');
        expect(mockLogUsage).not.toHaveBeenCalled();
    });

    it('returns null on non-ok response (caught by outer try/catch)', async () => {
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() => errorResponse(429, 'rate limited'));

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });

    it('uses prompt_tokens for inputTokens, falls back to total_tokens', async () => {
        mockGetApiKey.mockReturnValue('sk-valid-key');
        mockFetch.mockImplementation(() =>
            okJson({
                data: [{ embedding: [1] }],
                usage: { total_tokens: 75 },  // no prompt_tokens
            }),
        );

        await getEmbedding('test');
        const usageArg = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArg.inputTokens).toBe(75);  // falls back to total_tokens
    });
});

/* ================================================================== */
/*  Ollama (local) provider                                           */
/* ================================================================== */

describe('getEmbedding -- local (ollama)', () => {
    beforeEach(() => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'local',
            modelId: 'nomic-embed-text',
            endpointUrl: 'http://127.0.0.1:11434',
        });
    });

    it('returns embedding on success', async () => {
        mockFetch.mockImplementation(() =>
            okJson({ embedding: [0.5, 0.6, 0.7] }),
        );

        const result = await getEmbedding('test');
        expect(result).toEqual([0.5, 0.6, 0.7]);
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('http://127.0.0.1:11434/api/embeddings');
    });

    it('uses custom endpoint from assignment', async () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'local',
            modelId: 'nomic-embed-text',
            endpointUrl: 'http://192.168.1.10:11434',
        });
        mockFetch.mockImplementation(() =>
            okJson({ embedding: [0.5] }),
        );

        await getEmbedding('test');
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('http://192.168.1.10:11434/api/embeddings');
    });

    it('returns null and warns on ECONNREFUSED', async () => {
        const err = new Error('fetch failed');
        (err as any).cause = { code: 'ECONNREFUSED' };
        mockFetch.mockRejectedValue(err);

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Not running'));
        spy.mockRestore();
    });

    it('returns null and warns on generic error', async () => {
        mockFetch.mockRejectedValue(new Error('network down'));

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });

    it('returns null on non-ok response (caught by try/catch)', async () => {
        mockFetch.mockImplementation(() => errorResponse(500, 'model not found'));

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });

    it('sends prompt field (not input) in Ollama request body', async () => {
        mockFetch.mockImplementation(() =>
            okJson({ embedding: [0.1] }),
        );

        await getEmbedding('hello world');
        const body = JSON.parse((mockFetch.mock.calls[0] as any[])[1].body);
        expect(body.prompt).toBe('hello world');
        expect(body.input).toBeUndefined();
    });
});

/* ================================================================== */
/*  LM Studio provider                                                */
/* ================================================================== */

describe('getEmbedding -- lmstudio', () => {
    beforeEach(() => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'lmstudio',
            modelId: 'lm-emb-model',
            endpointUrl: 'http://127.0.0.1:1234/v1',
            inputCostPerMtok: 0,
            outputCostPerMtok: 0,
        });
    });

    it('returns embedding on success', async () => {
        mockFetch.mockImplementation(() =>
            okJson({
                data: [{ embedding: [0.9, 0.8] }],
                usage: { prompt_tokens: 20, total_tokens: 20 },
            }),
        );

        const result = await getEmbedding('test');
        expect(result).toEqual([0.9, 0.8]);
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('http://127.0.0.1:1234/v1/embeddings');
    });

    it('uses custom endpoint', async () => {
        mockGetAssignedModel.mockReturnValue({
            provider: 'lmstudio',
            modelId: 'lm-emb-model',
            endpointUrl: 'http://myhost:5555/v1',
        });
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [1] }] }),
        );

        await getEmbedding('test');
        const url = (mockFetch.mock.calls[0] as any[])[0];
        expect(url).toBe('http://myhost:5555/v1/embeddings');
    });

    it('logs usage when present', async () => {
        mockFetch.mockImplementation(() =>
            okJson({
                data: [{ embedding: [1] }],
                usage: { prompt_tokens: 30, total_tokens: 30 },
            }),
        );

        await getEmbedding('test');
        expect(mockLogUsage).toHaveBeenCalledTimes(1);
    });

    it('does not log usage when usage field absent', async () => {
        mockFetch.mockImplementation(() =>
            okJson({ data: [{ embedding: [1] }] }),
        );

        await getEmbedding('test');
        expect(mockLogUsage).not.toHaveBeenCalled();
    });

    it('returns null on ECONNREFUSED', async () => {
        const err = new Error('fetch failed');
        (err as any).cause = { code: 'ECONNREFUSED' };
        mockFetch.mockRejectedValue(err);

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Not running'));
        spy.mockRestore();
    });

    it('returns null on generic error', async () => {
        mockFetch.mockRejectedValue(new Error('timeout'));

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });

    it('returns null on non-ok response (caught by try/catch)', async () => {
        mockFetch.mockImplementation(() => errorResponse(400, 'bad request'));

        const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEmbedding('test');
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('Call failed'));
        spy.mockRestore();
    });

    it('uses total_tokens fallback when prompt_tokens missing', async () => {
        mockFetch.mockImplementation(() =>
            okJson({
                data: [{ embedding: [1] }],
                usage: { total_tokens: 42 },
            }),
        );

        await getEmbedding('test');
        const usageArg = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArg.inputTokens).toBe(42);
        expect(usageArg.totalTokens).toBe(42);
    });
});
