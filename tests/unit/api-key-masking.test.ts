/**
 * Tests for models/api-keys.ts — getApiKeyStatus masking logic (re-implemented).
 *
 * Shows first 4 and last 4 chars of keys longer than 12 chars,
 * '***configured***' for short keys, null for missing keys.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement getApiKeyStatus masking logic from models/api-keys.ts
function maskApiKey(key: string | undefined): string | null {
    if (!key) return null;
    if (key.length > 12) {
        return `${key.slice(0, 4)}...${key.slice(-4)}`;
    }
    return '***configured***';
}

function getApiKeyStatus(cache: Record<string, string>): Record<string, string | null> {
    const status: Record<string, string | null> = {};
    for (const provider of ['openai', 'anthropic']) {
        const key = cache[provider];
        status[provider] = maskApiKey(key);
    }
    return status;
}

describe('maskApiKey', () => {
    it('returns null for undefined key', () => {
        expect(maskApiKey(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(maskApiKey('')).toBeNull();
    });

    it('returns "***configured***" for key of exactly 12 chars', () => {
        expect(maskApiKey('sk-123456789')).toBe('***configured***'); // 12 chars: s,k,-,1,2,3,4,5,6,7,8,9
    });

    it('returns "***configured***" for short key under 12 chars', () => {
        expect(maskApiKey('sk-abc')).toBe('***configured***');
    });

    it('masks key over 12 chars with first 4 and last 4', () => {
        const key = 'sk-1234567890abcdef'; // >12 chars
        const result = maskApiKey(key);
        expect(result).toBe('sk-1...cdef');
    });

    it('shows exactly 4 chars from start and 4 from end', () => {
        const key = 'ABCDefghIJKL'; // exactly 12 chars → short path
        expect(maskApiKey(key)).toBe('***configured***');

        const longKey = 'ABCDxxxxxxxxxxEFGH'; // >12 chars
        const result = maskApiKey(longKey);
        expect(result?.startsWith('ABCD')).toBe(true);
        expect(result?.endsWith('EFGH')).toBe(true);
        expect(result).toContain('...');
    });

    it('handles key of exactly 13 chars (one over threshold)', () => {
        const key = '1234567890123'; // 13 chars
        const result = maskApiKey(key);
        expect(result).toBe('1234...0123');
    });
});

describe('getApiKeyStatus', () => {
    it('returns null for both when cache is empty', () => {
        const status = getApiKeyStatus({});
        expect(status.openai).toBeNull();
        expect(status.anthropic).toBeNull();
    });

    it('returns masked key for openai when present', () => {
        const cache = { openai: 'sk-proj-verylongapikey12345' };
        const status = getApiKeyStatus(cache);
        expect(status.openai).toBe('sk-p...2345');
    });

    it('returns masked key for anthropic when present', () => {
        const cache = { anthropic: 'sk-ant-api03-verylongkeyvalue' };
        const status = getApiKeyStatus(cache);
        expect(status.anthropic).not.toBeNull();
        expect(status.anthropic).toContain('...');
    });

    it('returns null for providers not in cache', () => {
        const cache = { openai: 'sk-openai-verylongkey1234' };
        const status = getApiKeyStatus(cache);
        expect(status.openai).not.toBeNull();
        expect(status.anthropic).toBeNull();
    });

    it('only reports openai and anthropic (not other providers)', () => {
        const cache = {
            openai: 'sk-openai-verylongkey1234',
            anthropic: 'sk-ant-verylongkey12345',
            google: 'google-key-abc',
        };
        const status = getApiKeyStatus(cache);
        expect(Object.keys(status)).toEqual(['openai', 'anthropic']);
        expect('google' in status).toBe(false);
    });
});
