/**
 * API tests for routes/security.ts
 *
 * Tests: GET /security/handshake, POST /security/regenerate,
 *        POST /auth/login, POST /auth/refresh, POST /auth/logout,
 *        GET /security/admin/status, POST /security/admin/setup,
 *        POST /security/admin/verify, POST /security/admin/change,
 *        POST /security/admin/remove
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key-abc');
const mockValidateKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockRegenerateKey = jest.fn<() => Promise<string>>().mockResolvedValue('new-key-xyz');
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSetAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockRemoveAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSignAccessToken = jest.fn<() => Promise<string>>().mockResolvedValue('access-token');
const mockVerifyAccessToken = jest.fn<() => Promise<any>>().mockResolvedValue({ sub: 'admin' });
const mockGetAccessTokenTTL = jest.fn<() => number>().mockReturnValue(3600);
const mockCreateRefreshToken = jest.fn<() => Promise<any>>().mockResolvedValue({ token: 'refresh-token' });
const mockRotateRefreshToken = jest.fn<() => Promise<any>>().mockResolvedValue({ token: 'new-refresh-token' });
const mockRevokeRefreshToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRevokeAllRefreshTokens = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsRemoteMode = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsLocalhostAddress = jest.fn<() => boolean>().mockReturnValue(true);
const mockAuthLimiter = {
    check: jest.fn<() => { allowed: boolean; retryAfterMs?: number }>().mockReturnValue({ allowed: true }),
    recordFailure: jest.fn<() => void>(),
};
const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
    validateKey: mockValidateKey,
    regenerateKey: mockRegenerateKey,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    setAdminPassword: mockSetAdminPassword,
    verifyAdminPassword: mockVerifyAdminPassword,
    removeAdminPassword: mockRemoveAdminPassword,
    isSensitiveConfigPath: jest.fn<() => boolean>().mockReturnValue(false),
    signAccessToken: mockSignAccessToken,
    verifyAccessToken: mockVerifyAccessToken,
    getAccessTokenTTL: mockGetAccessTokenTTL,
    createRefreshToken: mockCreateRefreshToken,
    rotateRefreshToken: mockRotateRefreshToken,
    revokeRefreshToken: mockRevokeRefreshToken,
    revokeAllRefreshTokens: mockRevokeAllRefreshTokens,
    isRemoteMode: mockIsRemoteMode,
    isLocalhostAddress: mockIsLocalhostAddress,
}));

jest.unstable_mockModule('../../core/rate-limit.js', () => ({
    authLimiter: mockAuthLimiter,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: securityRouter } = await import('../../routes/security.js');

/** Express app with security router; trustProxy enables X-Forwarded-For checks for handshake 403. */
function buildApp(trustProxy = false) {
    const app = express();
    if (trustProxy) app.set('trust proxy', true);
    app.use(express.json());
    app.use('/', securityRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSecurityKey.mockResolvedValue('test-key-abc');
    mockValidateKey.mockResolvedValue(true);
    mockRegenerateKey.mockResolvedValue('new-key-xyz');
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(true);
    mockSignAccessToken.mockResolvedValue('access-token');
    mockVerifyAccessToken.mockResolvedValue({ sub: 'admin' });
    mockGetAccessTokenTTL.mockReturnValue(3600);
    mockCreateRefreshToken.mockResolvedValue({ token: 'refresh-token' });
    mockRotateRefreshToken.mockResolvedValue({ token: 'new-refresh-token' });
    mockIsRemoteMode.mockReturnValue(false);
    mockAuthLimiter.check.mockReturnValue({ allowed: true });
});

// =============================================================================
// GET /security/handshake
// =============================================================================

describe('GET /security/handshake', () => {
    it('returns security key when request is from localhost', async () => {
        // supertest connects via loopback — req.ip will be ::ffff:127.0.0.1 or ::1
        const res = await request(buildApp()).get('/security/handshake');
        expect(res.status).toBe(200);
        expect(res.body.key).toBe('test-key-abc');
        expect(mockGetSecurityKey).toHaveBeenCalled();
    });

    it('returns 403 when request is not from localhost', async () => {
        // trust proxy=true lets X-Forwarded-For override req.ip
        const res = await request(buildApp(true))
            .get('/security/handshake')
            .set('X-Forwarded-For', '203.0.113.42');
        expect(res.status).toBe(403);
        expect(res.body.error).toContain('localhost');
    });
});

// =============================================================================
// POST /security/regenerate
// =============================================================================

describe('POST /security/regenerate', () => {
    it('returns 401 when key is missing', async () => {
        mockValidateKey.mockResolvedValue(false);
        const res = await request(buildApp()).post('/security/regenerate');
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('security key');
    });

    it('returns 401 when key is invalid', async () => {
        mockValidateKey.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/regenerate')
            .set('x-podbit-key', 'wrong-key');
        expect(res.status).toBe(401);
    });

    it('returns new key when valid key provided', async () => {
        mockValidateKey.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/regenerate')
            .set('x-podbit-key', 'test-key-abc');
        expect(res.status).toBe(200);
        expect(res.body.key).toBe('new-key-xyz');
        expect(mockRevokeAllRefreshTokens).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /auth/login
// =============================================================================

describe('POST /auth/login', () => {
    it('returns 429 when rate limited', async () => {
        mockAuthLimiter.check.mockReturnValue({ allowed: false, retryAfterMs: 60000 });
        const res = await request(buildApp()).post('/auth/login').send({ password: 'secret' });
        expect(res.status).toBe(429);
        expect(res.body.retryAfterMs).toBe(60000);
    });

    it('returns 403 when admin password not configured', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        const res = await request(buildApp()).post('/auth/login').send({ password: 'secret' });
        expect(res.status).toBe(403);
        expect(res.body.needsSetup).toBe(true);
    });

    it('returns 400 when password is missing', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        const res = await request(buildApp()).post('/auth/login').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Password');
    });

    it('returns 401 when password is wrong', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(false);
        const res = await request(buildApp()).post('/auth/login').send({ password: 'wrong' });
        expect(res.status).toBe(401);
        expect(mockAuthLimiter.recordFailure).toHaveBeenCalled();
    });

    it('returns tokens when credentials are valid', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(true);
        const res = await request(buildApp()).post('/auth/login').send({ password: 'correct' });
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe('access-token');
        expect(res.body.refreshToken).toBe('refresh-token');
        expect(res.body.expiresIn).toBe(3600);
    });
});

// =============================================================================
// POST /auth/refresh
// =============================================================================

describe('POST /auth/refresh', () => {
    it('returns 401 when refresh token is missing', async () => {
        const res = await request(buildApp()).post('/auth/refresh').send({});
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Refresh token');
    });

    it('returns 401 when refresh token is invalid', async () => {
        mockRotateRefreshToken.mockResolvedValue(null);
        const res = await request(buildApp())
            .post('/auth/refresh')
            .send({ refreshToken: 'stale-token' });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('expired');
    });

    it('returns new tokens when refresh token is valid', async () => {
        mockRotateRefreshToken.mockResolvedValue({ token: 'rotated-token' });
        const res = await request(buildApp())
            .post('/auth/refresh')
            .send({ refreshToken: 'valid-refresh' });
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBe('access-token');
        expect(res.body.refreshToken).toBe('rotated-token');
    });
});

// =============================================================================
// POST /auth/logout
// =============================================================================

describe('POST /auth/logout', () => {
    it('returns success and revokes token', async () => {
        const res = await request(buildApp())
            .post('/auth/logout')
            .send({ refreshToken: 'my-refresh' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRevokeRefreshToken).toHaveBeenCalledWith('my-refresh');
    });

    it('returns success even without a refresh token', async () => {
        const res = await request(buildApp()).post('/auth/logout').send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    });
});

// =============================================================================
// GET /security/admin/status
// =============================================================================

describe('GET /security/admin/status', () => {
    it('returns isSet and remoteMode', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockIsRemoteMode.mockReturnValue(false);
        const res = await request(buildApp()).get('/security/admin/status');
        expect(res.status).toBe(200);
        expect(res.body.isSet).toBe(true);
        expect(res.body.remoteMode).toBe(false);
    });

    it('returns isSet:false when no password configured', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        const res = await request(buildApp()).get('/security/admin/status');
        expect(res.body.isSet).toBe(false);
    });
});

// =============================================================================
// POST /security/admin/setup
// =============================================================================

describe('POST /security/admin/setup', () => {
    it('returns 429 when rate limited', async () => {
        mockAuthLimiter.check.mockReturnValue({ allowed: false, retryAfterMs: 30000 });
        const res = await request(buildApp())
            .post('/security/admin/setup')
            .send({ password: 'newpassword' });
        expect(res.status).toBe(429);
    });

    it('returns 409 when password already set', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/admin/setup')
            .send({ password: 'newpassword' });
        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already set');
    });

    it('returns 400 when password is missing', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        const res = await request(buildApp()).post('/security/admin/setup').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('password');
    });

    it('returns 400 when password is too short', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/admin/setup')
            .send({ password: 'short' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('8 characters');
    });

    it('returns success with admin token', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/admin/setup')
            .send({ password: 'validpassword' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.token).toBe('string');
        expect(mockSetAdminPassword).toHaveBeenCalledWith('validpassword');
    });
});

// =============================================================================
// POST /security/admin/verify
// =============================================================================

describe('POST /security/admin/verify', () => {
    it('returns 429 when rate limited', async () => {
        mockAuthLimiter.check.mockReturnValue({ allowed: false, retryAfterMs: 60000 });
        const res = await request(buildApp())
            .post('/security/admin/verify')
            .send({ password: 'secret' });
        expect(res.status).toBe(429);
    });

    it('returns 401 when password is wrong', async () => {
        mockVerifyAdminPassword.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/admin/verify')
            .send({ password: 'wrong' });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('Invalid');
        expect(mockAuthLimiter.recordFailure).toHaveBeenCalled();
    });

    it('returns admin token when password is correct', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/admin/verify')
            .send({ password: 'correct' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.expiresInMs).toBeGreaterThan(0);
    });
});

// =============================================================================
// POST /security/admin/change
// =============================================================================

describe('POST /security/admin/change', () => {
    it('returns 401 when current password is wrong', async () => {
        mockVerifyAdminPassword.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/admin/change')
            .send({ currentPassword: 'wrong', newPassword: 'newpassword123' });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('incorrect');
    });

    it('returns 400 when new password is too short', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/admin/change')
            .send({ currentPassword: 'correct', newPassword: 'short' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('8 characters');
    });

    it('returns success and revokes all sessions', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/admin/change')
            .send({ currentPassword: 'correct', newPassword: 'newpassword123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetAdminPassword).toHaveBeenCalledWith('newpassword123');
        expect(mockRevokeAllRefreshTokens).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /security/admin/remove
// =============================================================================

describe('POST /security/admin/remove', () => {
    it('returns 401 when password is wrong', async () => {
        mockVerifyAdminPassword.mockResolvedValue(false);
        const res = await request(buildApp())
            .post('/security/admin/remove')
            .send({ password: 'wrong' });
        expect(res.status).toBe(401);
        expect(res.body.error).toContain('incorrect');
    });

    it('removes password and revokes sessions', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        const res = await request(buildApp())
            .post('/security/admin/remove')
            .send({ password: 'correct' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRemoveAdminPassword).toHaveBeenCalled();
        expect(mockRevokeAllRefreshTokens).toHaveBeenCalled();
    });
});
