/**
 * Tests for evm/api/caller.ts — classifyError, callApi, resetRateLimiter.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { classifyError, callApi, resetRateLimiter } = await import('../../evm/api/caller.js');

describe('evm/api/caller', () => {
    describe('classifyError', () => {
        it('returns timeout for AbortError', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            expect(classifyError(undefined, err)).toBe('timeout');
        });

        it('returns timeout for TimeoutError', () => {
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            expect(classifyError(undefined, err)).toBe('timeout');
        });

        it('returns network_error when no status', () => {
            expect(classifyError(undefined)).toBe('network_error');
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

        it('returns server_error for 500+', () => {
            expect(classifyError(500)).toBe('server_error');
            expect(classifyError(502)).toBe('server_error');
            expect(classifyError(503)).toBe('server_error');
        });

        it('returns client_error for 400-499', () => {
            expect(classifyError(400)).toBe('client_error');
            expect(classifyError(404)).toBe('client_error');
            expect(classifyError(422)).toBe('client_error');
        });

        it('returns network_error for unexpected status', () => {
            expect(classifyError(200)).toBe('network_error');
        });
    });

    describe('callApi', () => {
        const baseApi = {
            id: 'test-api',
            name: 'Test API',
            baseUrl: 'http://localhost:9999',
            authType: 'none' as const,
            authKey: null,
            authHeader: null,
            maxRpm: 0,
            maxConcurrent: 1,
            timeoutMs: 5000,
            maxResponseBytes: 0,
        };

        beforeEach(() => {
            resetRateLimiter('test-api');
        });

        it('makes a GET request and returns result', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('{"data":"ok"}'),
                arrayBuffer: () => Promise.resolve(new TextEncoder().encode('{"data":"ok"}').buffer),
            }) as any;

            try {
                const result = await callApi(baseApi as any, {
                    url: 'http://localhost:9999/test',
                    method: 'GET',
                });
                expect(result.status).toBe(200);
                expect(result.body).toBe('{"data":"ok"}');
                expect(result.truncated).toBe(false);
                expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('injects API key auth header', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callApi(
                    { ...baseApi, authType: 'api_key', authKey: 'secret-key', authHeader: 'X-Custom-Key' } as any,
                    { url: 'http://localhost:9999/test', method: 'GET' },
                );
                const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
                expect(headers['X-Custom-Key']).toBe('secret-key');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('injects bearer auth', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callApi(
                    { ...baseApi, authType: 'bearer', authKey: 'my-token' } as any,
                    { url: 'http://localhost:9999/test', method: 'GET' },
                );
                const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
                expect(headers['Authorization']).toBe('Bearer my-token');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('sends POST body with content-type', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('result'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callApi(baseApi as any, {
                    url: 'http://localhost:9999/test',
                    method: 'POST',
                    body: '{"query":"test"}',
                });
                const opts = (mockFetch.mock.calls[0] as any[])[1];
                expect(opts.body).toBe('{"query":"test"}');
                expect(opts.headers['Content-Type']).toBe('application/json');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('truncates response when maxResponseBytes is set', async () => {
            const originalFetch = globalThis.fetch;
            const longBody = 'x'.repeat(1000);
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                arrayBuffer: () => Promise.resolve(new TextEncoder().encode(longBody).buffer),
            }) as any;

            try {
                resetRateLimiter('trunc-api');
                const result = await callApi(
                    { ...baseApi, id: 'trunc-api', maxResponseBytes: 100 } as any,
                    { url: 'http://localhost:9999/test', method: 'GET' },
                );
                expect(result.truncated).toBe(true);
                expect(result.body.length).toBe(100);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('uses default X-Api-Key header when authHeader is not set', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                resetRateLimiter('default-header-api');
                await callApi(
                    { ...baseApi, id: 'default-header-api', authType: 'api_key', authKey: 'key123', authHeader: null } as any,
                    { url: 'http://localhost:9999/test', method: 'GET' },
                );
                const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
                expect(headers['X-Api-Key']).toBe('key123');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('does not truncate when response fits within maxResponseBytes', async () => {
            const originalFetch = globalThis.fetch;
            const shortBody = 'short';
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                arrayBuffer: () => Promise.resolve(new TextEncoder().encode(shortBody).buffer),
            }) as any;

            try {
                resetRateLimiter('notrunc-api');
                const result = await callApi(
                    { ...baseApi, id: 'notrunc-api', maxResponseBytes: 1000 } as any,
                    { url: 'http://localhost:9999/test', method: 'GET' },
                );
                expect(result.truncated).toBe(false);
                expect(result.body).toBe('short');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('does not include body for GET requests even if body provided', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                await callApi(baseApi as any, {
                    url: 'http://localhost:9999/test',
                    method: 'GET',
                    body: '{"should":"not appear"}',
                });
                const opts = (mockFetch.mock.calls[0] as any[])[1];
                expect(opts.body).toBeUndefined();
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('does not set Content-Type for POST without body', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                resetRateLimiter('no-body-api');
                await callApi(
                    { ...baseApi, id: 'no-body-api' } as any,
                    { url: 'http://localhost:9999/test', method: 'POST' },
                );
                const opts = (mockFetch.mock.calls[0] as any[])[1];
                // Content-Type should not be set when body is undefined/null
                expect(opts.headers['Content-Type']).toBeUndefined();
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('merges custom headers from query', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                resetRateLimiter('custom-header-api');
                await callApi(
                    { ...baseApi, id: 'custom-header-api' } as any,
                    { url: 'http://localhost:9999/test', method: 'GET', headers: { 'X-Custom': 'value' } },
                );
                const opts = (mockFetch.mock.calls[0] as any[])[1];
                expect(opts.headers['X-Custom']).toBe('value');
                expect(opts.headers['Accept']).toBe('application/json');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('preserves custom Content-Type for POST', async () => {
            const originalFetch = globalThis.fetch;
            const mockFetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            });
            globalThis.fetch = mockFetch as any;

            try {
                resetRateLimiter('custom-ct-api');
                await callApi(
                    { ...baseApi, id: 'custom-ct-api' } as any,
                    { url: 'http://localhost:9999/test', method: 'POST', body: '<xml/>', headers: { 'Content-Type': 'application/xml' } },
                );
                const opts = (mockFetch.mock.calls[0] as any[])[1];
                expect(opts.headers['Content-Type']).toBe('application/xml');
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('handles rate-limited API with maxRpm > 0', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            }) as any;

            try {
                resetRateLimiter('rate-api');
                const api = { ...baseApi, id: 'rate-api', maxRpm: 60, maxConcurrent: 5 } as any;

                // First call should succeed — burst tokens available
                const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                expect(result.status).toBe(200);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('releases concurrency slot after call completes', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            }) as any;

            try {
                resetRateLimiter('conc-api');
                const api = { ...baseApi, id: 'conc-api', maxConcurrent: 1 } as any;

                // First call
                await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                // Second call should also work (slot released)
                const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                expect(result.status).toBe(200);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('releases concurrency slot even when fetch throws', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockRejectedValue(new Error('Network failure')) as any;

            try {
                resetRateLimiter('fail-api');
                const api = { ...baseApi, id: 'fail-api', maxConcurrent: 1 } as any;

                // First call throws
                await expect(callApi(api, { url: 'http://localhost:9999/test', method: 'GET' })).rejects.toThrow('Network failure');

                // Second call should still work (slot released in finally)
                globalThis.fetch = jest.fn<any>().mockResolvedValue({
                    status: 200,
                    text: () => Promise.resolve('recovered'),
                }) as any;
                const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                expect(result.status).toBe(200);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });

        it('queues concurrent calls exceeding maxConcurrent', async () => {
            const originalFetch = globalThis.fetch;
            let resolveFirst: (() => void) | null = null;
            const firstCallPromise = new Promise<void>(r => { resolveFirst = r; });

            globalThis.fetch = jest.fn<any>().mockImplementation(() => {
                return firstCallPromise.then(() => ({
                    status: 200,
                    text: () => Promise.resolve('ok'),
                }));
            }) as any;

            try {
                resetRateLimiter('queue-api');
                const api = { ...baseApi, id: 'queue-api', maxConcurrent: 1 } as any;

                // Start two calls — first blocks, second should queue
                const call1 = callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                const call2 = callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });

                // Resolve the first call
                resolveFirst!();

                // Both should complete
                const [result1, result2] = await Promise.all([call1, call2]);
                expect(result1.status).toBe(200);
                expect(result2.status).toBe(200);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });

    describe('resetRateLimiter', () => {
        it('clears limiter state for an API ID', () => {
            resetRateLimiter('nonexistent-api');
            resetRateLimiter('test-api');
        });

        it('allows fresh token bucket after reset', async () => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = jest.fn<any>().mockResolvedValue({
                status: 200,
                text: () => Promise.resolve('ok'),
            }) as any;

            try {
                const api = {
                    id: 'reset-rate-api',
                    name: 'Reset Test',
                    baseUrl: 'http://localhost:9999',
                    authType: 'none' as const,
                    authKey: null,
                    authHeader: null,
                    maxRpm: 60,
                    maxConcurrent: 5,
                    timeoutMs: 5000,
                    maxResponseBytes: 0,
                } as any;
                resetRateLimiter('reset-rate-api');

                await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });

                resetRateLimiter('reset-rate-api');
                const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                expect(result.status).toBe(200);
            } finally {
                globalThis.fetch = originalFetch;
            }
        });
    });
});
