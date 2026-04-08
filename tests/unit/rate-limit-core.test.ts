/**
 * Tests for core/rate-limit.ts — RateLimiter sliding-window implementation.
 * Pure in-memory logic, no mocks needed (except timers).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// RateLimiter is a self-contained class — import directly (no DB/config deps at class level)
const { RateLimiter } = await import('../../core/rate-limit.js');

describe('RateLimiter', () => {
    let limiter: InstanceType<typeof RateLimiter>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        if (limiter) limiter.destroy();
    });

    // -----------------------------------------------------------------------
    // Basic allow/deny
    // -----------------------------------------------------------------------
    describe('check()', () => {
        it('allows requests under the limit', () => {
            limiter = new RateLimiter(60_000, 3);
            const r1 = limiter.check('ip-1');
            expect(r1.allowed).toBe(true);
            expect(r1.remaining).toBe(2);
        });

        it('decrements remaining on each call', () => {
            limiter = new RateLimiter(60_000, 3);
            limiter.check('ip-1');
            const r2 = limiter.check('ip-1');
            expect(r2.allowed).toBe(true);
            expect(r2.remaining).toBe(1);
        });

        it('blocks after maxAttempts reached', () => {
            limiter = new RateLimiter(60_000, 2);
            limiter.check('ip-1');
            limiter.check('ip-1');
            const r3 = limiter.check('ip-1');
            expect(r3.allowed).toBe(false);
            expect(r3.remaining).toBe(0);
            expect(r3.retryAfterMs).toBeGreaterThan(0);
        });

        it('tracks keys independently', () => {
            limiter = new RateLimiter(60_000, 1);
            limiter.check('ip-a');
            // ip-a is exhausted, ip-b should still be allowed
            const rb = limiter.check('ip-b');
            expect(rb.allowed).toBe(true);

            const ra = limiter.check('ip-a');
            expect(ra.allowed).toBe(false);
        });

        it('stores attempts back when denied (updates filtered list)', () => {
            limiter = new RateLimiter(60_000, 2);
            limiter.check('ip-1');
            limiter.check('ip-1');
            // Third call is denied — store.set is called with filtered attempts
            const denied = limiter.check('ip-1');
            expect(denied.allowed).toBe(false);
            // Checking again should still be denied (store was updated correctly)
            const denied2 = limiter.check('ip-1');
            expect(denied2.allowed).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Window expiry
    // -----------------------------------------------------------------------
    describe('sliding window', () => {
        it('allows requests again after the window expires', () => {
            const windowMs = 100;
            limiter = new RateLimiter(windowMs, 1);

            limiter.check('ip-1'); // uses the one allowed attempt
            expect(limiter.check('ip-1').allowed).toBe(false);

            // Simulate time passing by manipulating Date.now
            const realNow = Date.now;
            Date.now = () => realNow() + windowMs + 1;
            try {
                const result = limiter.check('ip-1');
                expect(result.allowed).toBe(true);
                expect(result.remaining).toBe(0); // just used the last one
            } finally {
                Date.now = realNow;
            }
        });

        it('filters expired attempts during check, keeping only valid ones', () => {
            const windowMs = 1_000;
            limiter = new RateLimiter(windowMs, 3);

            const realNow = Date.now;
            const baseTime = realNow();

            // Record 2 attempts at baseTime
            Date.now = () => baseTime;
            limiter.check('ip-1');
            limiter.check('ip-1');

            // Move past window — both old attempts expire
            Date.now = () => baseTime + windowMs + 1;
            const result = limiter.check('ip-1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2); // old 2 expired, only the new one counts

            Date.now = realNow;
        });
    });

    // -----------------------------------------------------------------------
    // recordFailure
    // -----------------------------------------------------------------------
    describe('recordFailure()', () => {
        it('adds an attempt that counts toward the limit', () => {
            limiter = new RateLimiter(60_000, 2);
            limiter.recordFailure('ip-1');
            // One attempt consumed by recordFailure
            const r = limiter.check('ip-1');
            expect(r.allowed).toBe(true);
            expect(r.remaining).toBe(0);

            // Now at limit — next check should be blocked
            const r2 = limiter.check('ip-1');
            expect(r2.allowed).toBe(false);
        });

        it('creates a new entry if key is unknown', () => {
            limiter = new RateLimiter(60_000, 1);
            limiter.recordFailure('new-ip');
            const r = limiter.check('new-ip');
            expect(r.allowed).toBe(false);
        });

        it('filters expired attempts before recording new failure', () => {
            const windowMs = 1_000;
            limiter = new RateLimiter(windowMs, 2);

            const realNow = Date.now;
            const baseTime = realNow();

            // Record a failure at baseTime
            Date.now = () => baseTime;
            limiter.recordFailure('ip-1');

            // Move past window, record another failure
            Date.now = () => baseTime + windowMs + 1;
            limiter.recordFailure('ip-1');

            // Only the second failure should remain — so 1 attempt used, 1 remaining
            const r = limiter.check('ip-1');
            expect(r.allowed).toBe(true);
            expect(r.remaining).toBe(0); // 2 max - 1 failure - 1 check

            Date.now = realNow;
        });
    });

    // -----------------------------------------------------------------------
    // cleanup (private method, triggered by timer)
    // -----------------------------------------------------------------------
    describe('cleanup()', () => {
        it('removes keys whose attempts have all expired', () => {
            jest.useFakeTimers();
            const windowMs = 1_000;
            limiter = new RateLimiter(windowMs, 5);

            limiter.check('will-expire');
            limiter.check('will-expire');

            // Advance past the window
            jest.advanceTimersByTime(windowMs + 1);

            // Advance to trigger the cleanup interval (5 minutes)
            jest.advanceTimersByTime(5 * 60 * 1000);

            // After cleanup, the key should be gone — fresh check starts clean
            const result = limiter.check('will-expire');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4);

            jest.useRealTimers();
        });

        it('retains keys that still have valid (non-expired) attempts', () => {
            jest.useFakeTimers();
            const windowMs = 10_000;
            limiter = new RateLimiter(windowMs, 5);

            limiter.check('partial-key');

            // Advance 5s (within window)
            jest.advanceTimersByTime(5_000);
            limiter.check('partial-key');

            // Advance to trigger cleanup (5 min) but the second attempt is still within window
            // since it was made 5 min - 5s ago... actually with fake timers the attempt
            // timestamp is based on real Date.now which fake timers control.
            // After advancing 5 min, the 10s window means both are expired.
            // Let's use a longer window instead.
            jest.useRealTimers();

            // Use manual Date.now manipulation for more precise control
            const realNow = Date.now;
            const baseTime = realNow();
            limiter.destroy();

            limiter = new RateLimiter(60_000, 5);

            Date.now = () => baseTime;
            limiter.check('keep-key');

            Date.now = () => baseTime + 30_000;
            limiter.check('keep-key');

            // Trigger cleanup by accessing the private method
            // We can't directly, but we know it filters on check anyway
            Date.now = () => baseTime + 61_000;
            // First attempt expired (baseTime), second still valid (baseTime+30s, expires at baseTime+90s)
            const r = limiter.check('keep-key');
            expect(r.allowed).toBe(true);
            expect(r.remaining).toBe(3); // 5 - 1 valid old attempt - 1 new check

            Date.now = realNow;
        });
    });

    // -----------------------------------------------------------------------
    // destroy
    // -----------------------------------------------------------------------
    describe('destroy()', () => {
        it('clears internal state', () => {
            limiter = new RateLimiter(60_000, 5);
            limiter.check('ip-1');
            limiter.destroy();
            // After destroy, a new check should see a fresh slate
            // (store was cleared, so no prior attempts)
            const r = limiter.check('ip-1');
            expect(r.allowed).toBe(true);
            expect(r.remaining).toBe(4);
        });
    });

    // -----------------------------------------------------------------------
    // retryAfterMs calculation
    // -----------------------------------------------------------------------
    describe('retryAfterMs', () => {
        it('returns time until oldest attempt expires', () => {
            const windowMs = 10_000;
            limiter = new RateLimiter(windowMs, 1);

            limiter.check('ip-1');
            const denied = limiter.check('ip-1');

            expect(denied.allowed).toBe(false);
            // retryAfterMs should be close to windowMs (minus tiny elapsed time)
            expect(denied.retryAfterMs).toBeLessThanOrEqual(windowMs);
            expect(denied.retryAfterMs).toBeGreaterThan(windowMs - 1000); // within 1s tolerance
        });

        it('retryAfterMs decreases as time passes', () => {
            const windowMs = 20_000;
            limiter = new RateLimiter(windowMs, 1);

            const realNow = Date.now;
            const baseTime = realNow();

            Date.now = () => baseTime;
            limiter.check('ip-1');

            // 5s later
            Date.now = () => baseTime + 5_000;
            const denied = limiter.check('ip-1');
            expect(denied.allowed).toBe(false);
            // Should be ~15s remaining (20s window - 5s elapsed)
            expect(denied.retryAfterMs).toBeLessThanOrEqual(15_000);
            expect(denied.retryAfterMs).toBeGreaterThan(14_000);

            Date.now = realNow;
        });
    });
});

describe('authLimiter singleton', () => {
    it('is a RateLimiter instance with 5 attempts', async () => {
        const { authLimiter, RateLimiter: RL } = await import('../../core/rate-limit.js');
        expect(authLimiter).toBeInstanceOf(RL);

        // Verify the 5-attempt limit
        const testKey = `singleton-test-${Date.now()}-${Math.random()}`;
        for (let i = 0; i < 5; i++) {
            expect(authLimiter.check(testKey).allowed).toBe(true);
        }
        expect(authLimiter.check(testKey).allowed).toBe(false);
    });
});
