/**
 * Unit tests for evm/api/caller.ts — classifyError, callApi, resetRateLimiter.
 */
import { jest, describe, it, expect, afterEach } from '@jest/globals';

// No module-level mocks needed — classifyError and resetRateLimiter are pure/side-effectless.
// callApi uses global fetch which we mock per-test.

const { classifyError, callApi, resetRateLimiter } = await import('../../evm/api/caller.js');

// ---------------------------------------------------------------------------
// Helper — build a minimal ApiRegistryEntry
// ---------------------------------------------------------------------------
function makeApi(overrides: Record<string, any> = {}) {
    return {
        id: 'api-1',
        name: 'test-api',
        displayName: 'Test API',
        enabled: true,
        authType: 'none' as const,
        authKey: null,
        authHeader: null,
        maxRpm: 10,
        maxConcurrent: 2,
        timeoutMs: 5000,
        maxResponseBytes: 65536,
        baseUrl: 'https://example.com',
        mode: 'verify' as const,
        ...overrides,
    };
}

function makeQuery(overrides: Record<string, any> = {}) {
    return {
        method: 'GET' as const,
        url: 'https://example.com/api',
        body: null,
        headers: {},
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------
function mockFetch(status: number, body: string, bodyBytes?: number) {
    const bytes = bodyBytes ?? body.length;
    const mockArrayBuffer = jest.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(
        new TextEncoder().encode(body.slice(0, bytes)).buffer as ArrayBuffer
    );
    const mockText = jest.fn<() => Promise<string>>().mockResolvedValue(body);

    (global as any).fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
        status,
        arrayBuffer: mockArrayBuffer,
        text: mockText,
    });
    return { mockArrayBuffer, mockText };
}

afterEach(() => {
    // Clean up fetch mock and rate limiter state
    delete (global as any).fetch;
    resetRateLimiter('api-1');
    resetRateLimiter('api-2');
});

// =============================================================================
// classifyError
// =============================================================================

describe('classifyError', () => {
    it('returns timeout for AbortError', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        expect(classifyError(undefined, err)).toBe('timeout');
    });

    it('returns timeout for TimeoutError', () => {
        const err = new Error('timeout');
        err.name = 'TimeoutError';
        expect(classifyError(undefined, err)).toBe('timeout');
    });

    it('returns network_error when no status and no abort', () => {
        expect(classifyError(undefined, new Error('Connection refused'))).toBe('network_error');
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

    it('returns client_error for 422', () => {
        expect(classifyError(422)).toBe('client_error');
    });

    it('returns network_error when status is undefined and no error', () => {
        expect(classifyError()).toBe('network_error');
    });
});

// =============================================================================
// callApi — basic HTTP call
// =============================================================================

describe('callApi', () => {
    it('makes a GET request to the specified URL', async () => {
        mockFetch(200, '{"ok":true}');
        const api = makeApi({ maxResponseBytes: 0 }); // 0 = no limit, use text()

        await callApi(api, makeQuery());

        expect((global as any).fetch).toHaveBeenCalledWith(
            'https://example.com/api',
            expect.objectContaining({ method: 'GET' })
        );
    });

    it('returns status, body, responseTimeMs, truncated=false for normal response', async () => {
        mockFetch(200, '{"result":"ok"}');
        const api = makeApi({ maxResponseBytes: 0 });

        const result = await callApi(api, makeQuery());

        expect(result.status).toBe(200);
        expect(result.body).toBe('{"result":"ok"}');
        expect(result.truncated).toBe(false);
        expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('injects API key header when authType is api_key', async () => {
        mockFetch(200, '{}');
        const api = makeApi({ authType: 'api_key', authKey: 'mykey', maxResponseBytes: 0 });

        await callApi(api, makeQuery());

        const callArgs = ((global as any).fetch.mock.calls[0] as any[])[1];
        expect(callArgs.headers['X-Api-Key']).toBe('mykey');
    });

    it('uses custom authHeader name when specified', async () => {
        mockFetch(200, '{}');
        const api = makeApi({ authType: 'api_key', authKey: 'tok', authHeader: 'X-Token', maxResponseBytes: 0 });

        await callApi(api, makeQuery());

        const callArgs = ((global as any).fetch.mock.calls[0] as any[])[1];
        expect(callArgs.headers['X-Token']).toBe('tok');
    });

    it('injects Bearer token when authType is bearer', async () => {
        mockFetch(200, '{}');
        const api = makeApi({ authType: 'bearer', authKey: 'secret-token', maxResponseBytes: 0 });

        await callApi(api, makeQuery());

        const callArgs = ((global as any).fetch.mock.calls[0] as any[])[1];
        expect(callArgs.headers['Authorization']).toBe('Bearer secret-token');
    });

    it('truncates response when body exceeds maxResponseBytes', async () => {
        const fullBody = 'x'.repeat(200);
        // arrayBuffer returns only 100 bytes of content
        const buffer = new TextEncoder().encode(fullBody).buffer as ArrayBuffer;
        (global as any).fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
            status: 200,
            arrayBuffer: jest.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(buffer),
        });

        const api = makeApi({ maxResponseBytes: 100 });
        const result = await callApi(api, makeQuery());

        expect(result.truncated).toBe(true);
        expect(result.body.length).toBe(100);
    });

    it('sends body for POST requests', async () => {
        mockFetch(200, '{}');
        const api = makeApi({ maxResponseBytes: 0 });
        const q = makeQuery({ method: 'POST', body: '{"query":"test"}' });

        await callApi(api, q);

        const callArgs = ((global as any).fetch.mock.calls[0] as any[])[1];
        expect(callArgs.method).toBe('POST');
        expect(callArgs.body).toBe('{"query":"test"}');
        expect(callArgs.headers['Content-Type']).toBe('application/json');
    });

    it('propagates errors from fetch (e.g. network failure)', async () => {
        (global as any).fetch = jest.fn<() => Promise<any>>().mockRejectedValue(new Error('Network error'));
        const api = makeApi({ maxResponseBytes: 0 });

        await expect(callApi(api, makeQuery())).rejects.toThrow('Network error');
    });
});

// =============================================================================
// resetRateLimiter
// =============================================================================

describe('resetRateLimiter', () => {
    it('clears limiter so next call starts fresh', async () => {
        mockFetch(200, '{}');
        const api = makeApi({ maxResponseBytes: 0 });

        // First call creates the limiter
        await callApi(api, makeQuery());

        // Reset should not throw and clears the state
        expect(() => resetRateLimiter('api-1')).not.toThrow();

        // Second call after reset should still work
        const result = await callApi(api, makeQuery());
        expect(result.status).toBe(200);
    });
});
