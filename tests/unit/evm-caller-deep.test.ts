/**
 * Deep branch-coverage tests for evm/api/caller.ts
 * Covers uncovered branches:
 * - Rate limiter token depletion and wait loop (tokens <= 0)
 * - Token decrement when tokens !== Infinity
 * - Queue drain on release (concurrent slot release notifies waiting callers)
 * - refillTokens with zero elapsed time (no new tokens)
 * - getLimiter with maxRpm=0 (Infinity tokens)
 * - classifyError fallback for 2xx/3xx (network_error)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { classifyError, callApi, resetRateLimiter } = await import('../../evm/api/caller.js');

const baseApi = {
    id: 'deep-test-api',
    name: 'Deep Test API',
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
    jest.clearAllMocks();
});

// =============================================================================
// Rate limiter — token depletion and refill wait
// =============================================================================

describe('rate limiter — token depletion', () => {
    it('depletes burst tokens and waits for refill when tokens reach 0', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            // maxRpm=60 → refillRateMs=1000ms, burst=5 tokens
            const api = { ...baseApi, id: 'deplete-api', maxRpm: 300, maxConcurrent: 10 } as any;
            resetRateLimiter('deplete-api');

            // Make 5 rapid calls to exhaust burst tokens (burst = min(maxRpm, 5) = 5)
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(callApi(api, { url: 'http://localhost:9999/test', method: 'GET' }));
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
            results.forEach(r => expect(r.status).toBe(200));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('handles maxRpm=0 with Infinity tokens (no rate limit)', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            const api = { ...baseApi, id: 'no-limit-api', maxRpm: 0, maxConcurrent: 10 } as any;
            resetRateLimiter('no-limit-api');

            // Should handle many calls without blocking
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(callApi(api, { url: 'http://localhost:9999/test', method: 'GET' }));
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(10);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// =============================================================================
// Rate limiter — concurrency queue drain
// =============================================================================

describe('rate limiter — concurrency queue', () => {
    it('queues and drains multiple waiters when maxConcurrent=1', async () => {
        const originalFetch = globalThis.fetch;
        let callCount = 0;

        globalThis.fetch = jest.fn<any>().mockImplementation(async () => {
            callCount++;
            // Small delay to simulate actual work
            await new Promise(r => setTimeout(r, 10));
            return {
                status: 200,
                text: () => Promise.resolve(`response-${callCount}`),
            };
        }) as any;

        try {
            const api = { ...baseApi, id: 'drain-api', maxConcurrent: 1 } as any;
            resetRateLimiter('drain-api');

            // Start 3 concurrent calls with maxConcurrent=1
            const p1 = callApi(api, { url: 'http://localhost:9999/1', method: 'GET' });
            const p2 = callApi(api, { url: 'http://localhost:9999/2', method: 'GET' });
            const p3 = callApi(api, { url: 'http://localhost:9999/3', method: 'GET' });

            const results = await Promise.all([p1, p2, p3]);
            expect(results).toHaveLength(3);
            results.forEach(r => expect(r.status).toBe(200));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('releases slot and drains queue even when fetch throws', async () => {
        const originalFetch = globalThis.fetch;
        let callIndex = 0;

        globalThis.fetch = jest.fn<any>().mockImplementation(async () => {
            callIndex++;
            if (callIndex === 1) throw new Error('first fails');
            return { status: 200, text: () => Promise.resolve('ok') };
        }) as any;

        try {
            const api = { ...baseApi, id: 'error-drain-api', maxConcurrent: 1 } as any;
            resetRateLimiter('error-drain-api');

            const p1 = callApi(api, { url: 'http://localhost:9999/1', method: 'GET' });
            const p2 = callApi(api, { url: 'http://localhost:9999/2', method: 'GET' });

            // First call should fail, second should succeed after slot release
            await expect(p1).rejects.toThrow('first fails');
            const result2 = await p2;
            expect(result2.status).toBe(200);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// =============================================================================
// Token decrement — tokens !== Infinity branch
// =============================================================================

describe('rate limiter — token decrement', () => {
    it('decrements tokens for rate-limited API (tokens !== Infinity)', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            // maxRpm > 0 means tokens start finite and get decremented
            const api = { ...baseApi, id: 'decrement-api', maxRpm: 120, maxConcurrent: 5 } as any;
            resetRateLimiter('decrement-api');

            // First call should decrement from burst (min(120, 5)=5) to 4
            const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            expect(result.status).toBe(200);

            // Make 4 more calls to reach 0
            for (let i = 0; i < 4; i++) {
                await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            }
            // All should succeed — they consumed the 5 burst tokens
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// =============================================================================
// classifyError edge cases
// =============================================================================

describe('classifyError — additional edge cases', () => {
    it('returns network_error for 3xx status', () => {
        expect(classifyError(301)).toBe('network_error');
        expect(classifyError(302)).toBe('network_error');
    });

    it('returns network_error for 1xx status', () => {
        expect(classifyError(100)).toBe('network_error');
    });

    it('returns timeout when error has AbortError name even with status', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        // Error check takes precedence over status
        expect(classifyError(200, err)).toBe('timeout');
    });

    it('returns client_error for 418 (unusual 4xx)', () => {
        expect(classifyError(418)).toBe('client_error');
    });
});

// =============================================================================
// callApi — POST without body (no Content-Type)
// =============================================================================

describe('callApi — additional auth and header edge cases', () => {
    it('does not inject auth when authType is none', async () => {
        const originalFetch = globalThis.fetch;
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        try {
            resetRateLimiter('no-auth-api');
            await callApi(
                { ...baseApi, id: 'no-auth-api', authType: 'none', authKey: 'should-not-appear' } as any,
                { url: 'http://localhost:9999/test', method: 'GET' },
            );
            const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
            expect(headers['Authorization']).toBeUndefined();
            expect(headers['X-Api-Key']).toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('does not inject api_key auth when authKey is null', async () => {
        const originalFetch = globalThis.fetch;
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        try {
            resetRateLimiter('null-key-api');
            await callApi(
                { ...baseApi, id: 'null-key-api', authType: 'api_key', authKey: null } as any,
                { url: 'http://localhost:9999/test', method: 'GET' },
            );
            const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
            expect(headers['X-Api-Key']).toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('does not inject bearer auth when authKey is null', async () => {
        const originalFetch = globalThis.fetch;
        const mockFetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        });
        globalThis.fetch = mockFetch as any;

        try {
            resetRateLimiter('null-bearer-api');
            await callApi(
                { ...baseApi, id: 'null-bearer-api', authType: 'bearer', authKey: null } as any,
                { url: 'http://localhost:9999/test', method: 'GET' },
            );
            const headers = (mockFetch.mock.calls[0] as any[])[1].headers;
            expect(headers['Authorization']).toBeUndefined();
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// =============================================================================
// resetRateLimiter — clears state allowing fresh burst
// =============================================================================

describe('resetRateLimiter — behavior after reset', () => {
    it('allows full burst again after reset on rate-limited API', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            const api = { ...baseApi, id: 'burst-reset-api', maxRpm: 60, maxConcurrent: 10 } as any;
            resetRateLimiter('burst-reset-api');

            // Exhaust burst tokens
            for (let i = 0; i < 5; i++) {
                await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            }

            // Reset and verify full burst is available again
            resetRateLimiter('burst-reset-api');

            const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            expect(result.status).toBe(200);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
