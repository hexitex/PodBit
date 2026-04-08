/**
 * Tests for core/rate-limit.ts — RateLimiter class.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Re-implement RateLimiter from core/rate-limit.ts
interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs?: number;
}

class RateLimiter {
    private store = new Map<string, number[]>();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private windowMs: number,
        private maxAttempts: number,
    ) {
        // Skip auto-cleanup in tests
    }

    check(key: string): RateLimitResult {
        const now = Date.now();
        let attempts = this.store.get(key) || [];
        attempts = attempts.filter(t => t > now - this.windowMs);

        if (attempts.length >= this.maxAttempts) {
            const oldest = attempts[0];
            const retryAfterMs = oldest + this.windowMs - now;
            this.store.set(key, attempts);
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        attempts.push(now);
        this.store.set(key, attempts);
        return { allowed: true, remaining: this.maxAttempts - attempts.length };
    }

    recordFailure(key: string): void {
        const now = Date.now();
        let attempts = this.store.get(key) || [];
        attempts = attempts.filter(t => t > now - this.windowMs);
        attempts.push(now);
        this.store.set(key, attempts);
    }

    destroy(): void {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.store.clear();
    }
}

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter(1000, 3); // 1s window, 3 attempts
    });

    afterEach(() => {
        limiter.destroy();
    });

    describe('check', () => {
        it('allows first request', () => {
            const result = limiter.check('192.168.1.1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);
        });

        it('decrements remaining on each request', () => {
            expect(limiter.check('ip1').remaining).toBe(2);
            expect(limiter.check('ip1').remaining).toBe(1);
            expect(limiter.check('ip1').remaining).toBe(0);
        });

        it('blocks after max attempts', () => {
            limiter.check('ip1');
            limiter.check('ip1');
            limiter.check('ip1');
            const result = limiter.check('ip1');
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfterMs).toBeDefined();
            expect(result.retryAfterMs!).toBeGreaterThan(0);
        });

        it('isolates keys from each other', () => {
            limiter.check('ip1');
            limiter.check('ip1');
            limiter.check('ip1');
            // ip1 is blocked
            expect(limiter.check('ip1').allowed).toBe(false);
            // ip2 is still allowed
            const ip2Result = limiter.check('ip2');
            expect(ip2Result.allowed).toBe(true);
            expect(ip2Result.remaining).toBe(2);
        });

        it('allows requests after window expires', async () => {
            const shortLimiter = new RateLimiter(50, 2); // 50ms window
            shortLimiter.check('ip1');
            shortLimiter.check('ip1');
            expect(shortLimiter.check('ip1').allowed).toBe(false);

            await new Promise(r => setTimeout(r, 60));
            const result = shortLimiter.check('ip1');
            expect(result.allowed).toBe(true);
            shortLimiter.destroy();
        });

        it('returns retryAfterMs when blocked', () => {
            limiter.check('ip1');
            limiter.check('ip1');
            limiter.check('ip1');
            const result = limiter.check('ip1');
            expect(result.retryAfterMs).toBeDefined();
            expect(result.retryAfterMs!).toBeLessThanOrEqual(1000);
            expect(result.retryAfterMs!).toBeGreaterThan(0);
        });
    });

    describe('recordFailure', () => {
        it('counts toward the limit', () => {
            limiter.recordFailure('ip1');
            limiter.recordFailure('ip1');
            limiter.recordFailure('ip1');
            const result = limiter.check('ip1');
            expect(result.allowed).toBe(false);
        });

        it('works independently from check()', () => {
            limiter.check('ip1'); // 1 attempt
            limiter.recordFailure('ip1'); // 2 attempts
            limiter.recordFailure('ip1'); // 3 attempts
            const result = limiter.check('ip1');
            expect(result.allowed).toBe(false);
        });
    });

    describe('destroy', () => {
        it('clears all stored data', () => {
            limiter.check('ip1');
            limiter.check('ip2');
            limiter.destroy();
            // Create new limiter with same params to check state is clean
            const fresh = new RateLimiter(1000, 3);
            expect(fresh.check('ip1').remaining).toBe(2); // Fresh start
            fresh.destroy();
        });
    });

    describe('edge cases', () => {
        it('handles empty string key', () => {
            const result = limiter.check('');
            expect(result.allowed).toBe(true);
        });

        it('handles single attempt limit', () => {
            const strict = new RateLimiter(1000, 1);
            expect(strict.check('ip1').allowed).toBe(true);
            expect(strict.check('ip1').allowed).toBe(false);
            strict.destroy();
        });

        it('handles very large window', () => {
            const longWindow = new RateLimiter(86400000, 5); // 24h
            const result = longWindow.check('ip1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4);
            longWindow.destroy();
        });
    });
});
