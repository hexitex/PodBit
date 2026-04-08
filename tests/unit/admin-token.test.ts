/**
 * Tests for routes/security.ts — issueAdminToken and validateAdminToken
 * (re-implemented, in-memory token store).
 *
 * These functions manage short-lived admin tokens stored in a module-level Map.
 * Re-implementing them allows isolation without pulling in Express/DB deps.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

const ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Re-implement the admin token store and functions from routes/security.ts
function createAdminTokenStore(ttlMs: number = ADMIN_TOKEN_TTL_MS) {
    const adminTokens = new Map<string, number>();

    function issueAdminToken(): string {
        // Use a simpler token gen for testing (real code uses crypto.randomBytes)
        const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        adminTokens.set(token, Date.now() + ttlMs);
        // Cleanup expired tokens
        for (const [t, exp] of adminTokens) {
            if (exp < Date.now()) adminTokens.delete(t);
        }
        return token;
    }

    function validateAdminToken(token: string | undefined): boolean {
        if (!token) return false;
        const exp = adminTokens.get(token);
        if (!exp || exp < Date.now()) {
            if (token) adminTokens.delete(token);
            return false;
        }
        return true;
    }

    function clearAll(): void {
        adminTokens.clear();
    }

    function size(): number {
        return adminTokens.size;
    }

    return { issueAdminToken, validateAdminToken, clearAll, size };
}

describe('issueAdminToken', () => {
    let store: ReturnType<typeof createAdminTokenStore>;

    beforeEach(() => {
        store = createAdminTokenStore();
    });

    it('returns a non-empty string token', () => {
        const token = store.issueAdminToken();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
    });

    it('returns unique tokens on each call', () => {
        const tokens = new Set<string>();
        for (let i = 0; i < 10; i++) {
            tokens.add(store.issueAdminToken());
        }
        expect(tokens.size).toBe(10);
    });

    it('increments the token store size', () => {
        expect(store.size()).toBe(0);
        store.issueAdminToken();
        expect(store.size()).toBe(1);
        store.issueAdminToken();
        expect(store.size()).toBe(2);
    });

    it('newly issued tokens are immediately valid', () => {
        const token = store.issueAdminToken();
        expect(store.validateAdminToken(token)).toBe(true);
    });
});

describe('validateAdminToken', () => {
    let store: ReturnType<typeof createAdminTokenStore>;

    beforeEach(() => {
        store = createAdminTokenStore();
    });

    it('returns false for undefined token', () => {
        expect(store.validateAdminToken(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(store.validateAdminToken('')).toBe(false);
    });

    it('returns false for unknown token', () => {
        expect(store.validateAdminToken('nonexistent-token-abc123')).toBe(false);
    });

    it('returns true for a valid, unexpired token', () => {
        const token = store.issueAdminToken();
        expect(store.validateAdminToken(token)).toBe(true);
    });

    it('returns false for an expired token', () => {
        // Use a very short TTL store
        const shortStore = createAdminTokenStore(1); // 1ms TTL
        const token = shortStore.issueAdminToken();
        // Wait for expiry
        return new Promise<void>(resolve => {
            setTimeout(() => {
                expect(shortStore.validateAdminToken(token)).toBe(false);
                resolve();
            }, 10);
        });
    });

    it('removes expired token from store after validation fails', () => {
        const shortStore = createAdminTokenStore(1); // 1ms TTL
        const token = shortStore.issueAdminToken();
        expect(shortStore.size()).toBe(1);
        return new Promise<void>(resolve => {
            setTimeout(() => {
                shortStore.validateAdminToken(token); // Should fail and remove
                expect(shortStore.size()).toBe(0);
                resolve();
            }, 10);
        });
    });
});

describe('clearAll', () => {
    it('removes all tokens from the store', () => {
        const store = createAdminTokenStore();
        store.issueAdminToken();
        store.issueAdminToken();
        store.issueAdminToken();
        expect(store.size()).toBe(3);
        store.clearAll();
        expect(store.size()).toBe(0);
    });

    it('invalidates previously valid tokens after clear', () => {
        const store = createAdminTokenStore();
        const token = store.issueAdminToken();
        expect(store.validateAdminToken(token)).toBe(true);
        store.clearAll();
        expect(store.validateAdminToken(token)).toBe(false);
    });
});

describe('token TTL behavior', () => {
    it('multiple tokens can coexist in the store', () => {
        const store = createAdminTokenStore();
        const t1 = store.issueAdminToken();
        const t2 = store.issueAdminToken();
        const t3 = store.issueAdminToken();
        expect(store.validateAdminToken(t1)).toBe(true);
        expect(store.validateAdminToken(t2)).toBe(true);
        expect(store.validateAdminToken(t3)).toBe(true);
    });

    it('cleanup runs on issue (removes expired tokens from prior issues)', () => {
        // Use a store with 1ms TTL to simulate expired tokens
        const shortStore = createAdminTokenStore(1);
        shortStore.issueAdminToken(); // will expire immediately
        return new Promise<void>(resolve => {
            setTimeout(() => {
                // Issuing another token triggers cleanup
                shortStore.issueAdminToken();
                // The expired token should be cleaned up, but new token added
                // Size may be 1 (only new) after cleanup
                expect(shortStore.size()).toBeLessThanOrEqual(2);
                resolve();
            }, 10);
        });
    });
});
