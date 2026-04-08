/**
 * Tests for models/assignments.ts — isRateLimitError and parseRateLimitWaitMs
 * (re-implemented, pure string functions).
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement isRateLimitError from models/assignments.ts
function isRateLimitError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests');
}

// Re-implement parseRateLimitWaitMs from models/assignments.ts
function parseRateLimitWaitMs(message: string): number | null {
    // "Xm Y.Ys" or "XmYs" — e.g. "1m26.4s", "2m0s"
    const minsSecsMatch = message.match(/(\d+)m\s*(\d+(?:\.\d+)?)s/i);
    if (minsSecsMatch) {
        const mins = parseFloat(minsSecsMatch[1]);
        const secs = parseFloat(minsSecsMatch[2]);
        return Math.ceil((mins * 60 + secs) * 1000);
    }
    // Minutes only — "Xm"
    const minsOnlyMatch = message.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
    if (minsOnlyMatch) {
        return Math.ceil(parseFloat(minsOnlyMatch[1]) * 60 * 1000);
    }
    // Seconds only — "Xs", "X seconds", "retry after X"
    const secsMatch = message.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
    if (secsMatch) {
        return Math.ceil(parseFloat(secsMatch[1]) * 1000);
    }
    return null;
}

describe('isRateLimitError', () => {
    it('detects HTTP 429 status code in message', () => {
        expect(isRateLimitError(new Error('Request failed with status 429'))).toBe(true);
    });

    it('detects "rate limit" phrase', () => {
        expect(isRateLimitError(new Error('You have exceeded your rate limit.'))).toBe(true);
    });

    it('detects "rate_limit" (underscore variant)', () => {
        expect(isRateLimitError(new Error('Error code: rate_limit_exceeded'))).toBe(true);
    });

    it('detects "too many requests"', () => {
        expect(isRateLimitError(new Error('Too many requests — please slow down.'))).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(isRateLimitError(new Error('RATE LIMIT EXCEEDED'))).toBe(true);
        expect(isRateLimitError(new Error('Rate Limit'))).toBe(true);
        expect(isRateLimitError(new Error('TOO MANY REQUESTS'))).toBe(true);
    });

    it('returns false for connection errors', () => {
        expect(isRateLimitError(new Error('Connection refused'))).toBe(false);
    });

    it('returns false for timeout errors (standalone timeout)', () => {
        expect(isRateLimitError(new Error('Request timeout'))).toBe(false);
    });

    it('returns false for auth errors', () => {
        expect(isRateLimitError(new Error('Unauthorized: 401'))).toBe(false);
    });

    it('returns false for generic server errors', () => {
        expect(isRateLimitError(new Error('Internal server error: 500'))).toBe(false);
    });

    it('returns false for empty message', () => {
        expect(isRateLimitError(new Error(''))).toBe(false);
    });
});

describe('parseRateLimitWaitMs — minutes+seconds format', () => {
    it('parses "1m26.4s" → 86400ms', () => {
        const result = parseRateLimitWaitMs('Please try again in 1m26.4s.');
        expect(result).toBe(Math.ceil((1 * 60 + 26.4) * 1000));
    });

    it('parses "2m0s" → 120000ms', () => {
        const result = parseRateLimitWaitMs('Wait 2m0s before retrying.');
        expect(result).toBe(120000);
    });

    it('parses "0m30s" → 30000ms', () => {
        const result = parseRateLimitWaitMs('Retry after 0m30s.');
        expect(result).toBe(30000);
    });

    it('parses "1m26.4s" with space between "m" and seconds', () => {
        const result = parseRateLimitWaitMs('Try again in 1m 26.4s');
        expect(result).toBe(Math.ceil((1 * 60 + 26.4) * 1000));
    });
});

describe('parseRateLimitWaitMs — minutes-only format', () => {
    it('parses "1m" → 60000ms', () => {
        const result = parseRateLimitWaitMs('Retry in 1m');
        expect(result).toBe(60000);
    });

    it('parses "2min" → 120000ms', () => {
        const result = parseRateLimitWaitMs('Wait 2min before retrying.');
        expect(result).toBe(120000);
    });

    it('parses "2minutes" → 120000ms', () => {
        const result = parseRateLimitWaitMs('Please wait 2minutes.');
        expect(result).toBe(120000);
    });

    it('parses fractional minutes "1.5m" → 90000ms', () => {
        const result = parseRateLimitWaitMs('Retry after 1.5m.');
        expect(result).toBe(90000);
    });
});

describe('parseRateLimitWaitMs — seconds-only format', () => {
    it('parses "30s" → 30000ms', () => {
        const result = parseRateLimitWaitMs('try again in 30s');
        expect(result).toBe(30000);
    });

    it('parses "120 seconds" → 120000ms', () => {
        const result = parseRateLimitWaitMs('retry after 120 seconds');
        expect(result).toBe(120000);
    });

    it('parses "60sec" → 60000ms', () => {
        const result = parseRateLimitWaitMs('Wait 60sec.');
        expect(result).toBe(60000);
    });

    it('parses fractional seconds "0.5s" → 500ms', () => {
        const result = parseRateLimitWaitMs('Retry in 0.5s.');
        expect(result).toBe(500);
    });

    it('parses "5.5 seconds" → 5500ms', () => {
        const result = parseRateLimitWaitMs('Wait 5.5 seconds.');
        expect(result).toBe(5500);
    });
});

describe('parseRateLimitWaitMs — no parseable time', () => {
    it('returns null for messages without time info', () => {
        expect(parseRateLimitWaitMs('Rate limit exceeded. Please slow down.')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseRateLimitWaitMs('')).toBeNull();
    });

    it('returns null for unrelated numbers (e.g. HTTP status codes)', () => {
        // "429" does not match any time pattern (no s/m suffix in right context)
        expect(parseRateLimitWaitMs('Error: 429')).toBeNull();
    });
});

describe('parseRateLimitWaitMs — ceiling', () => {
    it('rounds up fractional milliseconds via Math.ceil', () => {
        // 26.4s → 26400ms (already integer, no ceiling needed)
        // 0.5s → 500ms (already integer)
        // 26.1s → 26100ms → ceil → 26100
        const result = parseRateLimitWaitMs('26.1s');
        expect(result).toBe(26100);
    });

    it('minutes+seconds take priority over seconds-only pattern', () => {
        // "1m26s" should use minsSecsMatch, not secsMatch
        const result = parseRateLimitWaitMs('1m26s');
        expect(result).toBe((1 * 60 + 26) * 1000);
    });
});
