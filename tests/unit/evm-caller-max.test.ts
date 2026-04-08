/**
 * Maximum coverage tests for evm/api/caller.ts
 *
 * Targets remaining uncovered lines:
 * - L56-57: refillTokens when newTokens > 0 (token refill actually increments)
 * - L74-76: acquireSlot rate limit token wait loop (tokens <= 0 with refillRateMs > 0)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { classifyError, callApi, resetRateLimiter } = await import('../../evm/api/caller.js');

const baseApi = {
    id: 'max-test-api',
    name: 'Max Test API',
    baseUrl: 'http://localhost:9999',
    authType: 'none' as const,
    authKey: null,
    authHeader: null,
    maxRpm: 0,
    maxConcurrent: 10,
    timeoutMs: 5000,
    maxResponseBytes: 0,
};

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// refillTokens — newTokens > 0 branch (lines 56-57)
// When enough time has elapsed since lastRefill, tokens should be incremented.
// We trigger this by exhausting burst tokens, then waiting for refill.
// =============================================================================

describe('refillTokens — token refill when time elapses', () => {
    it('refills tokens after enough time has passed since last use', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            // High RPM so refill is fast: maxRpm=6000 → refillRateMs = 10ms, burst=5
            const api = { ...baseApi, id: 'refill-test-api', maxRpm: 6000, maxConcurrent: 10 } as any;
            resetRateLimiter('refill-test-api');

            // Exhaust all 5 burst tokens
            for (let i = 0; i < 5; i++) {
                await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            }

            // Wait 50ms to allow token refill (refillRateMs=10ms → should refill ~5 tokens)
            await new Promise(r => setTimeout(r, 50));

            // This call should succeed — tokens were refilled
            const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            expect(result.status).toBe(200);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// =============================================================================
// acquireSlot — rate limit token wait loop (lines 74-76)
// When tokens are depleted and refillRateMs > 0, the loop waits for a refill.
// =============================================================================

describe('acquireSlot — token depletion wait loop', () => {
    it('waits for token refill when burst tokens are exhausted', async () => {
        const originalFetch = globalThis.fetch;
        let fetchCallCount = 0;
        globalThis.fetch = jest.fn<any>().mockImplementation(async () => {
            fetchCallCount++;
            return {
                status: 200,
                text: () => Promise.resolve(`ok-${fetchCallCount}`),
            };
        }) as any;

        try {
            // maxRpm=300 → refillRateMs = 200ms, burst=5
            // Exhaust burst, then next call must wait for refill
            const api = { ...baseApi, id: 'wait-loop-api', maxRpm: 300, maxConcurrent: 10 } as any;
            resetRateLimiter('wait-loop-api');

            // Exhaust all 5 burst tokens rapidly
            const exhaustPromises = [];
            for (let i = 0; i < 5; i++) {
                exhaustPromises.push(callApi(api, { url: 'http://localhost:9999/test', method: 'GET' }));
            }
            await Promise.all(exhaustPromises);

            // 6th call should trigger the wait loop (tokens <= 0, refillRateMs > 0)
            // It will wait up to ~200ms for a refill token
            const start = Date.now();
            const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
            const elapsed = Date.now() - start;

            expect(result.status).toBe(200);
            // Should have waited at least some time for the token refill
            // (with 200ms refillRate, we expect ~200ms wait, but allow tolerance)
            expect(elapsed).toBeGreaterThanOrEqual(50);
        } finally {
            globalThis.fetch = originalFetch;
        }
    }, 10000);

    it('handles rapid token depletion with very high RPM (short wait)', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            // maxRpm=3000 → refillRateMs = 20ms, burst=5
            const api = { ...baseApi, id: 'rapid-api', maxRpm: 3000, maxConcurrent: 10 } as any;
            resetRateLimiter('rapid-api');

            // Make 7 sequential calls — first 5 use burst, next 2 wait for refill
            for (let i = 0; i < 7; i++) {
                const result = await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });
                expect(result.status).toBe(200);
            }
        } finally {
            globalThis.fetch = originalFetch;
        }
    }, 10000);
});

// =============================================================================
// Additional edge cases for completeness
// =============================================================================

describe('refillTokens — edge cases', () => {
    it('does not overfill past maxTokens', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            text: () => Promise.resolve('ok'),
        }) as any;

        try {
            // maxRpm=600 → refillRateMs = 100ms, burst=5
            const api = { ...baseApi, id: 'overfill-api', maxRpm: 600, maxConcurrent: 10 } as any;
            resetRateLimiter('overfill-api');

            // Use 1 token
            await callApi(api, { url: 'http://localhost:9999/test', method: 'GET' });

            // Wait a long time so many refill cycles pass
            await new Promise(r => setTimeout(r, 200));

            // Make 5 rapid calls — should work (burst refilled, capped at 5)
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(callApi(api, { url: 'http://localhost:9999/test', method: 'GET' }));
            }
            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
        } finally {
            globalThis.fetch = originalFetch;
        }
    }, 10000);
});
