/**
 * In-memory sliding-window rate limiter.
 *
 * Used to protect authentication endpoints against brute-force attacks.
 * No external dependencies — stores attempt timestamps in a Map keyed by IP.
 */

import { RC } from '../config/constants.js';

/** Result of a rate limit check. */
export interface RateLimitResult {
    /** Whether the request is allowed under the current window. */
    allowed: boolean;
    /** Number of remaining attempts in the current window. */
    remaining: number;
    /** Milliseconds until the earliest attempt expires (only set when blocked). */
    retryAfterMs?: number;
}

/**
 * In-memory sliding-window rate limiter.
 * Tracks attempt timestamps per key (typically IP address) and enforces
 * a maximum number of attempts within a configurable time window.
 * Runs periodic cleanup every 5 minutes to evict stale entries.
 */
export class RateLimiter {
    private store = new Map<string, number[]>();
    private cleanupTimer: ReturnType<typeof setInterval>;

    /**
     * @param windowMs - Sliding window duration in milliseconds
     * @param maxAttempts - Maximum allowed attempts within the window
     */
    constructor(
        private windowMs: number,
        private maxAttempts: number,
    ) {
        // Periodic cleanup every 5 minutes
        this.cleanupTimer = setInterval(() => this.cleanup(), RC.intervals.rateLimiterCleanupMs);
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }

    /**
     * Check whether a request from `key` is allowed and record the attempt.
     * Prunes expired timestamps, then checks against maxAttempts.
     *
     * @param key - Identifier for the requester (typically IP address)
     * @returns Rate limit result with allowed status and remaining attempts
     */
    check(key: string): RateLimitResult {
        const now = Date.now();
        let attempts = this.store.get(key) || [];

        // Remove expired attempts
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

    /**
     * Record a failed attempt (e.g. wrong password).
     * Adds an attempt timestamp even if check() was already called for this request.
     * Use this to double-count failed authentication attempts for stricter limiting.
     *
     * @param key - Identifier for the requester (typically IP address)
     */
    recordFailure(key: string): void {
        const now = Date.now();
        let attempts = this.store.get(key) || [];
        attempts = attempts.filter(t => t > now - this.windowMs);
        attempts.push(now);
        this.store.set(key, attempts);
    }

    /** Remove expired entries from the store. */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, attempts] of this.store) {
            const valid = attempts.filter(t => t > now - this.windowMs);
            if (valid.length === 0) {
                this.store.delete(key);
            } else {
                this.store.set(key, valid);
            }
        }
    }

    /** Stop the periodic cleanup timer and clear all stored data. */
    destroy(): void {
        clearInterval(this.cleanupTimer);
        this.store.clear();
    }
}

// Singleton for auth endpoints: 5 attempts per 15-minute window
export const authLimiter = new RateLimiter(15 * 60 * 1000, 5);
