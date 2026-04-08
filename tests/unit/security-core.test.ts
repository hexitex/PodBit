/**
 * Tests for core/security.ts — security key management, admin password,
 * JWT access tokens, refresh tokens, and remote mode detection.
 *
 * Uses jest.unstable_mockModule() for ESM mocking of db.js.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mock DB ──────────────────────────────────────────────────────────────────
const mockSystemQuery = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined);
const mockSystemQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

const security = await import('../../core/security.js');

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockSystemQuery.mockReset().mockResolvedValue(undefined);
    mockSystemQueryOne.mockReset().mockResolvedValue(null);
});

// Seed the internal cache so getSecurityKey never hits DB unexpectedly
async function ensureCachedKey(): Promise<string> {
    return security.regenerateKey();
}

// =============================================================================
// getSecurityKey
// =============================================================================

describe('getSecurityKey', () => {
    it('returns a 64-char hex string', async () => {
        const key = await ensureCachedKey();
        expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns cached key without hitting DB on subsequent calls', async () => {
        await ensureCachedKey();
        mockSystemQuery.mockClear();
        mockSystemQueryOne.mockClear();

        const key1 = await security.getSecurityKey();
        const key2 = await security.getSecurityKey();

        expect(key1).toBe(key2);
        expect(mockSystemQueryOne).not.toHaveBeenCalled();
    });
});

// =============================================================================
// regenerateKey
// =============================================================================

describe('regenerateKey', () => {
    it('returns a new key each time', async () => {
        const key1 = await security.regenerateKey();
        const key2 = await security.regenerateKey();
        expect(key1).not.toBe(key2);
        expect(key1.length).toBe(64);
        expect(key2.length).toBe(64);
    });

    it('persists the new key to system.db via INSERT', async () => {
        await security.regenerateKey();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['security.key', expect.any(String)])
        );
    });

    it('handles DB persistence failure gracefully (no throw)', async () => {
        mockSystemQuery.mockRejectedValueOnce(new Error('disk full'));
        const key = await security.regenerateKey();
        expect(typeof key).toBe('string');
        expect(key.length).toBe(64);
    });
});

// =============================================================================
// validateKey
// =============================================================================

describe('validateKey', () => {
    let currentKey: string;

    beforeEach(async () => {
        currentKey = await ensureCachedKey();
    });

    it('returns true for the correct key', async () => {
        expect(await security.validateKey(currentKey)).toBe(true);
    });

    it('returns false for an incorrect key of the same length', async () => {
        const wrong = 'f'.repeat(64);
        // Ensure it differs from the actual key
        if (wrong === currentKey) {
            expect(await security.validateKey('e'.repeat(64))).toBe(false);
        } else {
            expect(await security.validateKey(wrong)).toBe(false);
        }
    });

    it('returns false for null/undefined/empty', async () => {
        expect(await security.validateKey(null)).toBe(false);
        expect(await security.validateKey(undefined)).toBe(false);
        expect(await security.validateKey('')).toBe(false);
    });

    it('returns false when candidate length differs from actual key', async () => {
        expect(await security.validateKey('tooshort')).toBe(false);
    });
});

// =============================================================================
// isSensitiveConfigPath
// =============================================================================

describe('isSensitiveConfigPath', () => {
    it('matches exact EVM sensitive paths', () => {
        expect(security.isSensitiveConfigPath(['evm', 'allowedModules'])).toBe(true);
        expect(security.isSensitiveConfigPath(['evm', 'networkKillSwitch'])).toBe(true);
    });

    it('rejects non-sensitive paths', () => {
        expect(security.isSensitiveConfigPath(['resonance', 'threshold'])).toBe(false);
        expect(security.isSensitiveConfigPath(['proxy', 'port'])).toBe(false);
    });

    it('matches parent path that covers sensitive children', () => {
        expect(security.isSensitiveConfigPath(['evm'])).toBe(true);
    });

    it('matches child of sensitive path', () => {
        expect(security.isSensitiveConfigPath(['evm', 'allowedModules', 'detail'])).toBe(true);
    });

    it('detects secret/password/apiKey/api_key keywords case-insensitively', () => {
        expect(security.isSensitiveConfigPath(['foo', 'ApiKey'])).toBe(true);
        expect(security.isSensitiveConfigPath(['foo', 'SECRET'])).toBe(true);
        expect(security.isSensitiveConfigPath(['foo', 'PASSWORD'])).toBe(true);
        expect(security.isSensitiveConfigPath(['foo', 'api_key'])).toBe(true);
    });

    it('returns false for empty path', () => {
        expect(security.isSensitiveConfigPath([])).toBe(false);
    });
});

// =============================================================================
// Admin Password
// =============================================================================

describe('setAdminPassword', () => {
    it('rejects passwords shorter than 8 characters', async () => {
        await expect(security.setAdminPassword('short')).rejects.toThrow(
            'Admin password must be at least 8 characters'
        );
    });

    it('rejects empty password', async () => {
        await expect(security.setAdminPassword('')).rejects.toThrow(
            'Admin password must be at least 8 characters'
        );
    });

    it('stores hashed password with salt in system.db', async () => {
        await security.setAdminPassword('mysecurepassword');

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['security.admin_password', expect.any(String)])
        );

        const storedJson = mockSystemQuery.mock.calls[0][1][1] as string;
        const parsed = JSON.parse(storedJson);
        expect(parsed).toHaveProperty('hash');
        expect(parsed).toHaveProperty('salt');
        expect(parsed.hash.length).toBeGreaterThan(0);
        expect(parsed.salt.length).toBeGreaterThan(0);
    });
});

describe('verifyAdminPassword', () => {
    it('returns false for null/undefined candidate', async () => {
        expect(await security.verifyAdminPassword(null)).toBe(false);
        expect(await security.verifyAdminPassword(undefined)).toBe(false);
    });

    it('returns false when no password row is stored', async () => {
        mockSystemQueryOne.mockResolvedValueOnce(null);
        expect(await security.verifyAdminPassword('anything')).toBe(false);
    });

    it('returns false when stored value has no hash/salt', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            value: JSON.stringify({ hash: '', salt: '' }),
        });
        expect(await security.verifyAdminPassword('anything')).toBe(false);
    });

    it('returns true for correct password', async () => {
        // Capture the hash+salt during setAdminPassword
        let storedValue = '';
        mockSystemQuery.mockImplementationOnce(async (_sql: any, params: any) => {
            storedValue = params[1];
        });
        await security.setAdminPassword('correctpassword');

        mockSystemQueryOne.mockResolvedValueOnce({ value: storedValue });
        expect(await security.verifyAdminPassword('correctpassword')).toBe(true);
    });

    it('returns false for wrong password', async () => {
        let storedValue = '';
        mockSystemQuery.mockImplementationOnce(async (_sql: any, params: any) => {
            storedValue = params[1];
        });
        await security.setAdminPassword('correctpassword');

        mockSystemQueryOne.mockResolvedValueOnce({ value: storedValue });
        expect(await security.verifyAdminPassword('wrongpassword')).toBe(false);
    });

    it('returns false when DB throws', async () => {
        mockSystemQueryOne.mockRejectedValueOnce(new Error('db locked'));
        expect(await security.verifyAdminPassword('test1234')).toBe(false);
    });
});

describe('isAdminPasswordSet', () => {
    it('returns false when no row exists', async () => {
        mockSystemQueryOne.mockResolvedValueOnce(null);
        expect(await security.isAdminPasswordSet()).toBe(false);
    });

    it('returns true when hash and salt are present', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            value: JSON.stringify({ hash: 'abc123', salt: 'def456' }),
        });
        expect(await security.isAdminPasswordSet()).toBe(true);
    });

    it('returns false when stored value is missing salt', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            value: JSON.stringify({ hash: 'abc123' }),
        });
        expect(await security.isAdminPasswordSet()).toBe(false);
    });

    it('returns false when DB throws', async () => {
        mockSystemQueryOne.mockRejectedValueOnce(new Error('no table'));
        expect(await security.isAdminPasswordSet()).toBe(false);
    });
});

describe('removeAdminPassword', () => {
    it('deletes the admin password setting from DB', async () => {
        await security.removeAdminPassword();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM settings'),
            ['security.admin_password']
        );
    });
});

// =============================================================================
// JWT Access Tokens
// =============================================================================

describe('JWT access tokens', () => {
    beforeEach(async () => {
        await ensureCachedKey();
    });

    it('signAccessToken returns a three-part JWT string', async () => {
        const token = await security.signAccessToken();
        expect(token.split('.').length).toBe(3);
    });

    it('verifyAccessToken returns payload for a valid token', async () => {
        const token = await security.signAccessToken();
        const payload = await security.verifyAccessToken(token);
        expect(payload).not.toBeNull();
        expect(payload!.sub).toBe('admin');
        expect(payload!.type).toBe('access');
        expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('verifyAccessToken returns null for tampered signature', async () => {
        const token = await security.signAccessToken();
        const tampered = token.slice(0, -4) + 'XXXX';
        expect(await security.verifyAccessToken(tampered)).toBeNull();
    });

    it('verifyAccessToken returns null for empty/null input', async () => {
        expect(await security.verifyAccessToken('')).toBeNull();
        expect(await security.verifyAccessToken(null as any)).toBeNull();
    });

    it('verifyAccessToken returns null for malformed token (wrong part count)', async () => {
        expect(await security.verifyAccessToken('only.two')).toBeNull();
        expect(await security.verifyAccessToken('a.b.c.d')).toBeNull();
    });

    it('getAccessTokenTTL returns 900 (15 minutes in seconds)', () => {
        expect(security.getAccessTokenTTL()).toBe(900);
    });
});

// =============================================================================
// Refresh Tokens
// =============================================================================

describe('refresh tokens', () => {
    it('createRefreshToken returns a 64-char hex token and future expiry', async () => {
        const result = await security.createRefreshToken();
        expect(result.token).toMatch(/^[0-9a-f]{64}$/);
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('createRefreshToken stores hash (not raw token) in DB', async () => {
        const result = await security.createRefreshToken();

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO refresh_tokens'),
            expect.any(Array)
        );
        const params = mockSystemQuery.mock.calls[0][1] as any[];
        // params[1] is token_hash — must differ from raw token
        expect(params[1]).not.toBe(result.token);
        expect(params[1]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('validateRefreshToken returns null for empty token', async () => {
        expect(await security.validateRefreshToken('')).toBeNull();
    });

    it('validateRefreshToken returns null when token not found in DB', async () => {
        // Default mock returns null
        expect(await security.validateRefreshToken('unknown')).toBeNull();
    });

    it('validateRefreshToken returns family+id for valid non-revoked token', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'tok-1',
            family: 'fam-1',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            revoked: 0,
        });
        const result = await security.validateRefreshToken('validtoken');
        expect(result).toEqual({ family: 'fam-1', id: 'tok-1' });
    });

    it('validateRefreshToken revokes entire family on reuse of revoked token', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'tok-1',
            family: 'fam-1',
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            revoked: 1,
        });

        const result = await security.validateRefreshToken('reused-token');
        expect(result).toBeNull();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE refresh_tokens SET revoked = 1 WHERE family'),
            ['fam-1']
        );
    });

    it('validateRefreshToken returns null for expired token', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'tok-1',
            family: 'fam-1',
            expires_at: new Date(Date.now() - 10000).toISOString(),
            revoked: 0,
        });
        expect(await security.validateRefreshToken('expired-token')).toBeNull();
    });

    it('revokeAllRefreshTokens updates all non-revoked tokens', async () => {
        await security.revokeAllRefreshTokens();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE refresh_tokens SET revoked = 1 WHERE revoked = 0'),
            []
        );
    });

    it('cleanupExpiredRefreshTokens deletes old tokens', async () => {
        await security.cleanupExpiredRefreshTokens();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM refresh_tokens'),
            []
        );
    });
});

// =============================================================================
// Remote Mode Detection
// =============================================================================

describe('remote mode detection', () => {
    const originalHost = process.env.HOST;

    afterEach(() => {
        if (originalHost === undefined) {
            delete process.env.HOST;
        } else {
            process.env.HOST = originalHost;
        }
    });

    it('isLocalhostAddress returns true for localhost, 127.0.0.1, ::1', () => {
        expect(security.isLocalhostAddress('localhost')).toBe(true);
        expect(security.isLocalhostAddress('127.0.0.1')).toBe(true);
        expect(security.isLocalhostAddress('::1')).toBe(true);
    });

    it('isLocalhostAddress returns false for non-localhost addresses', () => {
        expect(security.isLocalhostAddress('0.0.0.0')).toBe(false);
        expect(security.isLocalhostAddress('192.168.1.1')).toBe(false);
        expect(security.isLocalhostAddress('example.com')).toBe(false);
    });

    it('isRemoteMode returns false when HOST is unset (defaults to localhost)', () => {
        delete process.env.HOST;
        expect(security.isRemoteMode()).toBe(false);
    });

    it('isRemoteMode returns true when HOST is 0.0.0.0', () => {
        process.env.HOST = '0.0.0.0';
        expect(security.isRemoteMode()).toBe(true);
    });

    it('isRemoteMode returns false when HOST is 127.0.0.1', () => {
        process.env.HOST = '127.0.0.1';
        expect(security.isRemoteMode()).toBe(false);
    });
});
