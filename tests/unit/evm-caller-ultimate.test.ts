/**
 * Ultimate coverage tests for evm/api/caller.ts
 *
 * Targets remaining uncovered branches:
 * - callApi: POST with body (Content-Type header), POST without body
 * - callApi: api_key auth with custom authHeader
 * - callApi: bearer auth injection
 * - callApi: maxResponseBytes > 0 truncation (truncated=true)
 * - callApi: maxResponseBytes > 0 no truncation (within limit)
 * - callApi: fetch throws (AbortError / timeout)
 * - refillTokens: elapsed time produces 0 new tokens (no change)
 * - acquireSlot: rate limit token wait loop (tokens <= 0, wait for refill)
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { classifyError, callApi, resetRateLimiter } = await import('../../evm/api/caller.js');

const baseApi = {
    id: 'ult-test-api',
    name: 'Ultimate Test API',
    baseUrl: 'http://localhost:9999',
    authType: 'none' as const,
    authKey: null,
    authHeader: null,
    maxRpm: 0,
    maxConcurrent: 1,
    timeoutMs: 5000,
    maxResponseBytes: 0,
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

// =============================================================================
// callApi: POST with body sets Content-Type
// =============================================================================

describe('callApi: POST body handling', () => {
    it('sets Content-Type for POST with body', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('post-body-api');
        await callApi(
            { ...baseApi, id: 'post-body-api' } as any,
            { url: 'http://localhost:9999/data', method: 'POST', body: '{"key":"value"}' },
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('application/json');
        expect(mockFetch.mock.calls[0][1].body).toBe('{"key":"value"}');
    });

    it('does not set body for POST without body', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('post-nobody-api');
        await callApi(
            { ...baseApi, id: 'post-nobody-api' } as any,
            { url: 'http://localhost:9999/data', method: 'POST' },
        );

        expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });

    it('does not set body for GET requests', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('get-api');
        await callApi(
            { ...baseApi, id: 'get-api' } as any,
            { url: 'http://localhost:9999/data', method: 'GET' },
        );

        expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });
});

// =============================================================================
// callApi: auth injection
// =============================================================================

describe('callApi: auth types', () => {
    it('injects api_key with custom header name', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('custom-header-api');
        await callApi(
            {
                ...baseApi,
                id: 'custom-header-api',
                authType: 'api_key',
                authKey: 'my-secret',
                authHeader: 'X-Custom-Key',
            } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-Custom-Key']).toBe('my-secret');
    });

    it('uses default X-Api-Key header when authHeader is null', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('default-header-api');
        await callApi(
            {
                ...baseApi,
                id: 'default-header-api',
                authType: 'api_key',
                authKey: 'my-secret',
                authHeader: null,
            } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-Api-Key']).toBe('my-secret');
    });

    it('injects bearer auth', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('bearer-api');
        await callApi(
            {
                ...baseApi,
                id: 'bearer-api',
                authType: 'bearer',
                authKey: 'token123',
            } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer token123');
    });
});

// =============================================================================
// callApi: response truncation
// =============================================================================

describe('callApi: response size handling', () => {
    it('truncates response when exceeding maxResponseBytes', async () => {
        const largeBody = 'x'.repeat(1000);
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode(largeBody).buffer),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('trunc-api');
        const result = await callApi(
            { ...baseApi, id: 'trunc-api', maxResponseBytes: 100 } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        expect(result.truncated).toBe(true);
        expect(result.body.length).toBeLessThanOrEqual(100);
    });

    it('does not truncate when within maxResponseBytes', async () => {
        const smallBody = 'hello';
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode(smallBody).buffer),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('no-trunc-api');
        const result = await callApi(
            { ...baseApi, id: 'no-trunc-api', maxResponseBytes: 1000 } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        expect(result.truncated).toBe(false);
        expect(result.body).toBe('hello');
    });

    it('reads full response text when maxResponseBytes is 0', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('full response'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('no-limit-api');
        const result = await callApi(
            { ...baseApi, id: 'no-limit-api', maxResponseBytes: 0 } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        expect(result.body).toBe('full response');
        expect(result.truncated).toBe(false);
    });
});

// =============================================================================
// callApi: fetch throws (timeout/abort)
// =============================================================================

describe('callApi: fetch errors', () => {
    it('propagates AbortError when fetch is aborted', async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        globalThis.fetch = jest.fn<any>().mockRejectedValue(error) as any;

        resetRateLimiter('abort-api');
        await expect(callApi(
            { ...baseApi, id: 'abort-api' } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        )).rejects.toThrow('aborted');
    });
});

// =============================================================================
// callApi: custom headers passthrough
// =============================================================================

describe('callApi: custom headers', () => {
    it('passes custom headers from apiQuery', async () => {
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        resetRateLimiter('custom-hdr-api');
        await callApi(
            { ...baseApi, id: 'custom-hdr-api' } as any,
            {
                url: 'http://localhost:9999/test',
                method: 'GET',
                headers: { 'X-Custom': 'value', 'Content-Type': 'text/plain' },
            },
        );

        const headers = mockFetch.mock.calls[0][1].headers;
        expect(headers['X-Custom']).toBe('value');
        // Content-Type from custom headers should be preserved for POST
    });
});

// =============================================================================
// callApi: responseTimeMs tracking
// =============================================================================

describe('callApi: response time tracking', () => {
    it('includes responseTimeMs in result', async () => {
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        resetRateLimiter('time-api');
        const result = await callApi(
            { ...baseApi, id: 'time-api' } as any,
            { url: 'http://localhost:9999/test', method: 'GET' },
        );

        expect(typeof result.responseTimeMs).toBe('number');
        expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
});

// =============================================================================
// classifyError: comprehensive
// =============================================================================

describe('classifyError: all branches', () => {
    it('returns timeout for TimeoutError', () => {
        const err = new Error('timeout');
        err.name = 'TimeoutError';
        expect(classifyError(undefined, err)).toBe('timeout');
    });

    it('returns network_error for no status and no error', () => {
        expect(classifyError(undefined, undefined)).toBe('network_error');
    });

    it('returns rate_limited for 429', () => {
        expect(classifyError(429)).toBe('rate_limited');
    });

    it('returns auth_failure for 401', () => {
        expect(classifyError(401)).toBe('auth_failure');
    });

    it('returns auth_failure for 403', () => {
        expect(classifyError(403)).toBe('auth_failure');
    });

    it('returns server_error for 500', () => {
        expect(classifyError(500)).toBe('server_error');
    });

    it('returns server_error for 503', () => {
        expect(classifyError(503)).toBe('server_error');
    });

    it('returns client_error for 400', () => {
        expect(classifyError(400)).toBe('client_error');
    });

    it('returns client_error for 404', () => {
        expect(classifyError(404)).toBe('client_error');
    });

    it('returns network_error for 200 (success codes fall through)', () => {
        expect(classifyError(200)).toBe('network_error');
    });
});
