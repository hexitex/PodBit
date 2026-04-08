/**
 * Tests for evm/api/onboard.ts — API name validation and stale interview cleanup (re-implemented).
 */
import { describe, it, expect, } from '@jest/globals';

/** Valid API name: non-empty string, /^[a-zA-Z0-9_-]+$/. */
function validateApiName(name: unknown): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return {
            valid: false,
            error: 'name is required. Use alphanumeric, hyphens, underscores only.',
        };
    }
    return { valid: true };
}

const INTERVIEW_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** In-memory interview store with TTL-based cleanup. */
function createInterviewStore(ttlMs: number = INTERVIEW_TTL_MS) {
    const sessions = new Map<string, { createdAt: number; step: number }>();

    function cleanupStale(): void {
        const now = Date.now();
        for (const [id, state] of sessions) {
            if (now - state.createdAt > ttlMs) {
                sessions.delete(id);
            }
        }
    }

    return {
        add(id: string, createdAt: number = Date.now()) {
            sessions.set(id, { createdAt, step: 0 });
        },
        cleanup: cleanupStale,
        has(id: string) { return sessions.has(id); },
        size() { return sessions.size; },
    };
}

describe('validateApiName', () => {
    describe('valid names', () => {
        it('accepts lowercase alphanumeric', () => {
            expect(validateApiName('pubchem').valid).toBe(true);
        });

        it('accepts uppercase alphanumeric', () => {
            expect(validateApiName('PubChem').valid).toBe(true);
        });

        it('accepts mixed case', () => {
            expect(validateApiName('CrossRef').valid).toBe(true);
        });

        it('accepts numbers', () => {
            expect(validateApiName('api123').valid).toBe(true);
        });

        it('accepts hyphens', () => {
            expect(validateApiName('my-api').valid).toBe(true);
        });

        it('accepts underscores', () => {
            expect(validateApiName('my_api').valid).toBe(true);
        });

        it('accepts combined: letters, numbers, hyphens, underscores', () => {
            expect(validateApiName('PubChem_v2-API').valid).toBe(true);
        });

        it('accepts single character', () => {
            expect(validateApiName('a').valid).toBe(true);
        });
    });

    describe('invalid names', () => {
        it('rejects empty string', () => {
            expect(validateApiName('').valid).toBe(false);
        });

        it('rejects null', () => {
            expect(validateApiName(null).valid).toBe(false);
        });

        it('rejects undefined', () => {
            expect(validateApiName(undefined).valid).toBe(false);
        });

        it('rejects non-string (number)', () => {
            expect(validateApiName(123).valid).toBe(false);
        });

        it('rejects spaces', () => {
            expect(validateApiName('my api').valid).toBe(false);
        });

        it('rejects dots', () => {
            expect(validateApiName('my.api').valid).toBe(false);
        });

        it('rejects slashes', () => {
            expect(validateApiName('my/api').valid).toBe(false);
        });

        it('rejects at-signs', () => {
            expect(validateApiName('my@api').valid).toBe(false);
        });

        it('rejects hash symbols', () => {
            expect(validateApiName('api#1').valid).toBe(false);
        });

        it('returns the error message for invalid names', () => {
            const result = validateApiName('invalid name!');
            expect(result.error).toContain('name is required');
            expect(result.error).toContain('alphanumeric');
        });
    });
});

describe('cleanupStaleInterviews', () => {
    it('does not remove fresh sessions', () => {
        const store = createInterviewStore(30000);
        store.add('session-1'); // just created
        store.cleanup();
        expect(store.has('session-1')).toBe(true);
    });

    it('removes sessions older than TTL', () => {
        const store = createInterviewStore(30000); // 30 second TTL
        const old = Date.now() - 60000; // 60 seconds ago
        store.add('old-session', old);
        store.cleanup();
        expect(store.has('old-session')).toBe(false);
    });

    it('removes only expired sessions, keeps fresh ones', () => {
        const store = createInterviewStore(30000);
        const old = Date.now() - 60000;
        store.add('old-session', old);
        store.add('fresh-session');
        store.cleanup();
        expect(store.has('old-session')).toBe(false);
        expect(store.has('fresh-session')).toBe(true);
    });

    it('handles empty store without errors', () => {
        const store = createInterviewStore();
        expect(() => store.cleanup()).not.toThrow();
        expect(store.size()).toBe(0);
    });

    it('removes multiple expired sessions', () => {
        const store = createInterviewStore(30000);
        const old = Date.now() - 60000;
        store.add('s1', old);
        store.add('s2', old);
        store.add('s3', old);
        store.add('fresh');
        store.cleanup();
        expect(store.size()).toBe(1);
        expect(store.has('fresh')).toBe(true);
    });

    it('is idempotent — running cleanup twice does not over-delete', () => {
        const store = createInterviewStore(30000);
        store.add('fresh');
        store.cleanup();
        store.cleanup();
        expect(store.has('fresh')).toBe(true);
    });
});
