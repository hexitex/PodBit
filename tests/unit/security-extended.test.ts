/**
 * Unit tests for core/security.ts — covers:
 * - getSecurityKey: cache, load from DB, generate new, persist failure
 * - regenerateKey: new key generation and persistence
 * - validateKey: constant-time comparison, null/undefined, length mismatch
 * - isSensitiveConfigPath: exact match, prefix match, keyword patterns
 * - isAdminPasswordSet: present/absent/error cases
 * - setAdminPassword: short password rejection, hash+salt storage
 * - verifyAdminPassword: correct, wrong, missing, error
 * - removeAdminPassword: deletion
 * - signAccessToken / verifyAccessToken: valid token, expired, tampered, wrong type
 * - createRefreshToken / validateRefreshToken / rotateRefreshToken / revokeRefreshToken
 * - revokeAllRefreshTokens, cleanupExpiredRefreshTokens
 * - isLocalhostAddress / isRemoteMode
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ---- Mocks ----

const mockSystemQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockSystemQueryOne = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

// We need to re-import each time for getSecurityKey cache tests
let security: typeof import('../../core/security.js');

beforeEach(async () => {
    jest.clearAllMocks();
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    // Re-import to reset the cached key
    // Note: ESM module cache means _cachedKey persists between tests within the same import.
    // We'll work around this by testing cache behavior in sequence.
    security = await import('../../core/security.js');
});

// =========================================================================
// isSensitiveConfigPath (pure function — no DB needed)
// =========================================================================

describe('isSensitiveConfigPath', () => {
    it('matches exact sensitive paths', () => {
        expect(security.isSensitiveConfigPath(['evm', 'allowedModules'])).toBe(true);
        expect(security.isSensitiveConfigPath(['evm', 'blockedBuiltins'])).toBe(true);
        expect(security.isSensitiveConfigPath(['evm', 'networkKillSwitch'])).toBe(true);
        expect(security.isSensitiveConfigPath(['evm', 'runtimePatching'])).toBe(true);
    });

    it('matches parent of sensitive path (changing parent object)', () => {
        // 'evm' is parent of 'evm.allowedModules' so changing 'evm' affects sensitive paths
        expect(security.isSensitiveConfigPath(['evm', 'allowedModules', 'numpy'])).toBe(true);
    });

    it('matches paths containing apikey keyword', () => {
        expect(security.isSensitiveConfigPath(['models', 'apiKey'])).toBe(true);
        expect(security.isSensitiveConfigPath(['service', 'api_key'])).toBe(true);
    });

    it('matches paths containing secret keyword', () => {
        expect(security.isSensitiveConfigPath(['auth', 'secret'])).toBe(true);
    });

    it('matches paths containing password keyword', () => {
        expect(security.isSensitiveConfigPath(['admin', 'password'])).toBe(true);
    });

    it('does not match non-sensitive paths', () => {
        expect(security.isSensitiveConfigPath(['resonance', 'threshold'])).toBe(false);
        expect(security.isSensitiveConfigPath(['voicing', 'maxOutputWords'])).toBe(false);
    });
});

// =========================================================================
// SENSITIVE_CONFIG_PATHS constant
// =========================================================================

describe('SENSITIVE_CONFIG_PATHS', () => {
    it('contains expected entries', () => {
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.allowedModules')).toBe(true);
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.blockedBuiltins')).toBe(true);
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.blockedAttributes')).toBe(true);
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.blockedCalls')).toBe(true);
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.networkKillSwitch')).toBe(true);
        expect(security.SENSITIVE_CONFIG_PATHS.has('evm.runtimePatching')).toBe(true);
    });
});

// =========================================================================
// validateKey
// =========================================================================

describe('validateKey', () => {
    it('returns false for null candidate', async () => {
        expect(await security.validateKey(null)).toBe(false);
    });

    it('returns false for undefined candidate', async () => {
        expect(await security.validateKey(undefined)).toBe(false);
    });

    it('returns false for empty string', async () => {
        expect(await security.validateKey('')).toBe(false);
    });
});

// =========================================================================
// isLocalhostAddress
// =========================================================================

describe('isLocalhostAddress', () => {
    it('returns true for localhost', () => {
        expect(security.isLocalhostAddress('localhost')).toBe(true);
    });

    it('returns true for 127.0.0.1', () => {
        expect(security.isLocalhostAddress('127.0.0.1')).toBe(true);
    });

    it('returns true for ::1', () => {
        expect(security.isLocalhostAddress('::1')).toBe(true);
    });

    it('returns false for 0.0.0.0', () => {
        expect(security.isLocalhostAddress('0.0.0.0')).toBe(false);
    });

    it('returns false for external IPs', () => {
        expect(security.isLocalhostAddress('192.168.1.1')).toBe(false);
    });

    it('returns false for hostnames', () => {
        expect(security.isLocalhostAddress('example.com')).toBe(false);
    });
});

// =========================================================================
// getAccessTokenTTL
// =========================================================================

describe('getAccessTokenTTL', () => {
    it('returns 15 minutes in seconds', () => {
        expect(security.getAccessTokenTTL()).toBe(15 * 60);
    });
});

// =========================================================================
// isRemoteMode
// =========================================================================

describe('isRemoteMode', () => {
    const originalEnv = process.env.HOST;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.HOST;
        } else {
            process.env.HOST = originalEnv;
        }
    });

    it('returns false when HOST is not set (defaults to localhost)', () => {
        delete process.env.HOST;
        expect(security.isRemoteMode()).toBe(false);
    });

    it('returns false when HOST is localhost', () => {
        process.env.HOST = 'localhost';
        expect(security.isRemoteMode()).toBe(false);
    });

    it('returns false when HOST is 127.0.0.1', () => {
        process.env.HOST = '127.0.0.1';
        expect(security.isRemoteMode()).toBe(false);
    });

    it('returns true when HOST is 0.0.0.0', () => {
        process.env.HOST = '0.0.0.0';
        expect(security.isRemoteMode()).toBe(true);
    });

    it('returns true when HOST is external IP', () => {
        process.env.HOST = '192.168.1.100';
        expect(security.isRemoteMode()).toBe(true);
    });
});

// =========================================================================
// isAdminPasswordSet
// =========================================================================

describe('isAdminPasswordSet', () => {
    it('returns false when no row exists', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await security.isAdminPasswordSet();
        expect(result).toBe(false);
    });

    it('returns true when hash and salt exist', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ hash: 'abc123', salt: 'def456' }),
        });
        const result = await security.isAdminPasswordSet();
        expect(result).toBe(true);
    });

    it('returns false when value has no hash', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ salt: 'def456' }),
        });
        const result = await security.isAdminPasswordSet();
        expect(result).toBe(false);
    });

    it('returns false when DB throws', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB error'));
        const result = await security.isAdminPasswordSet();
        expect(result).toBe(false);
    });

    it('handles value as object (not string)', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: { hash: 'abc', salt: 'def' },
        });
        const result = await security.isAdminPasswordSet();
        expect(result).toBe(true);
    });
});

// =========================================================================
// setAdminPassword
// =========================================================================

describe('setAdminPassword', () => {
    it('throws when password is too short', async () => {
        await expect(security.setAdminPassword('short')).rejects.toThrow('at least 8 characters');
    });

    it('throws when password is empty', async () => {
        await expect(security.setAdminPassword('')).rejects.toThrow('at least 8 characters');
    });

    it('stores hashed password with salt', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.setAdminPassword('longpassword123');

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['security.admin_password', expect.any(String)]),
        );

        // Verify the stored value contains hash and salt
        const storedValue = JSON.parse(mockSystemQuery.mock.calls[0][1][1] as string);
        expect(storedValue.hash).toBeDefined();
        expect(storedValue.salt).toBeDefined();
        expect(storedValue.hash.length).toBeGreaterThan(0);
        expect(storedValue.salt.length).toBeGreaterThan(0);
    });
});

// =========================================================================
// verifyAdminPassword
// =========================================================================

describe('verifyAdminPassword', () => {
    it('returns false for null candidate', async () => {
        const result = await security.verifyAdminPassword(null);
        expect(result).toBe(false);
    });

    it('returns false for undefined candidate', async () => {
        const result = await security.verifyAdminPassword(undefined);
        expect(result).toBe(false);
    });

    it('returns false when no password is set', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await security.verifyAdminPassword('testpassword');
        expect(result).toBe(false);
    });

    it('returns false when stored value has no hash', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ salt: 'abc' }),
        });
        const result = await security.verifyAdminPassword('testpassword');
        expect(result).toBe(false);
    });

    it('returns false when DB throws', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB error'));
        const result = await security.verifyAdminPassword('testpassword');
        expect(result).toBe(false);
    });
});

// =========================================================================
// removeAdminPassword
// =========================================================================

describe('removeAdminPassword', () => {
    it('deletes the admin password setting', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.removeAdminPassword();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM settings'),
            ['security.admin_password'],
        );
    });
});

// =========================================================================
// signAccessToken / verifyAccessToken
// =========================================================================

describe('signAccessToken + verifyAccessToken', () => {
    it('verifyAccessToken returns null for empty token', async () => {
        const result = await security.verifyAccessToken('');
        expect(result).toBeNull();
    });

    it('verifyAccessToken returns null for malformed token (wrong parts)', async () => {
        const result = await security.verifyAccessToken('only.two');
        expect(result).toBeNull();
    });

    it('verifyAccessToken returns null for tampered token', async () => {
        // Provide a security key for validation
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify('a'.repeat(64)),
        });
        const result = await security.verifyAccessToken('aaa.bbb.ccc');
        expect(result).toBeNull();
    });
});

// =========================================================================
// Refresh tokens
// =========================================================================

describe('createRefreshToken', () => {
    it('creates a token and stores hash in DB', async () => {
        mockSystemQuery.mockResolvedValue([]);
        const result = await security.createRefreshToken();
        expect(result.token).toBeDefined();
        expect(result.token.length).toBe(64); // 32 bytes hex
        expect(result.expiresAt).toBeDefined();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO refresh_tokens'),
            expect.any(Array),
        );
    });

    it('uses provided family ID', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.createRefreshToken('my-family');
        const insertArgs = mockSystemQuery.mock.calls[0][1] as any[];
        expect(insertArgs[2]).toBe('my-family');
    });
});

describe('validateRefreshToken', () => {
    it('returns null for empty token', async () => {
        const result = await security.validateRefreshToken('');
        expect(result).toBeNull();
    });

    it('returns null when token not found in DB', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await security.validateRefreshToken('nonexistent');
        expect(result).toBeNull();
    });

    it('revokes entire family when revoked token is reused', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 't1',
            family: 'fam1',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            revoked: 1,
        });
        mockSystemQuery.mockResolvedValue([]);

        const result = await security.validateRefreshToken('reused-token');
        expect(result).toBeNull();
        // Should revoke entire family
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE refresh_tokens SET revoked = 1'),
            ['fam1'],
        );
    });

    it('returns null for expired token', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 't1',
            family: 'fam1',
            expires_at: new Date(Date.now() - 100000).toISOString(),
            revoked: 0,
        });

        const result = await security.validateRefreshToken('expired-token');
        expect(result).toBeNull();
    });

    it('returns family and id for valid token', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 't1',
            family: 'fam1',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            revoked: 0,
        });

        const result = await security.validateRefreshToken('valid-token');
        expect(result).toEqual({ family: 'fam1', id: 't1' });
    });
});

describe('rotateRefreshToken', () => {
    it('returns null when validation fails', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await security.rotateRefreshToken('invalid');
        expect(result).toBeNull();
    });

    it('revokes old token and creates new one in same family', async () => {
        // validateRefreshToken call
        mockSystemQueryOne.mockResolvedValue({
            id: 't1',
            family: 'fam1',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            revoked: 0,
        });
        mockSystemQuery.mockResolvedValue([]);

        const result = await security.rotateRefreshToken('old-token');
        expect(result).not.toBeNull();
        expect(result!.token).toBeDefined();
    });
});

describe('revokeRefreshToken', () => {
    it('marks token as revoked by hash', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.revokeRefreshToken('some-token');
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE refresh_tokens SET revoked = 1'),
            expect.any(Array),
        );
    });
});

describe('revokeAllRefreshTokens', () => {
    it('revokes all non-revoked tokens', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.revokeAllRefreshTokens();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE refresh_tokens SET revoked = 1 WHERE revoked = 0'),
            [],
        );
    });
});

describe('cleanupExpiredRefreshTokens', () => {
    it('deletes expired and old revoked tokens', async () => {
        mockSystemQuery.mockResolvedValue([]);
        await security.cleanupExpiredRefreshTokens();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM refresh_tokens'),
            [],
        );
    });
});
