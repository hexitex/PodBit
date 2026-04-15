/**
 * Integration flow: JWT auth token chain.
 *
 * Exercises the full remote-auth lifecycle across four sequential requests:
 *   1. POST /security/admin/setup   — set the admin password
 *   2. POST /auth/login             — authenticate, capture accessToken + refreshToken
 *   3. POST /auth/refresh           — exchange refreshToken for a new token pair
 *   4. POST /auth/logout            — revoke the rotated refreshToken
 *
 * The refreshToken returned by /auth/login flows into /auth/refresh.
 * The rotated refreshToken returned by /auth/refresh flows into /auth/logout.
 *
 * Mocks: core/security.js (all auth functions), core/rate-limit.js (authLimiter),
 *        services/event-bus.js (emitActivity)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Security function mocks ───────────────────────────────────────────────────

const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('sk-test');
const mockValidateKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockRegenerateKey = jest.fn<() => Promise<string>>().mockResolvedValue('sk-new');
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSetAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockRemoveAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsSensitiveConfigPath = jest.fn<() => boolean>().mockReturnValue(false);
const mockSignAccessToken = jest.fn<() => Promise<string>>().mockResolvedValue('access-token-stub');
const mockVerifyAccessToken = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetAccessTokenTTL = jest.fn<() => number>().mockReturnValue(900);
const mockCreateRefreshToken = jest.fn<() => Promise<any>>().mockResolvedValue({ token: 'refresh-stub', expiresAt: Date.now() + 3_600_000 });
const mockRotateRefreshToken = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockRevokeRefreshToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRevokeAllRefreshTokens = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsRemoteMode = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsLocalhostAddress = jest.fn<() => boolean>().mockReturnValue(true);

const mockAuthLimiterCheck = jest.fn<() => { allowed: boolean; retryAfterMs?: number }>()
    .mockReturnValue({ allowed: true });
const mockAuthLimiterRecordFailure = jest.fn<() => void>();

const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
    validateKey: mockValidateKey,
    regenerateKey: mockRegenerateKey,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    setAdminPassword: mockSetAdminPassword,
    verifyAdminPassword: mockVerifyAdminPassword,
    removeAdminPassword: mockRemoveAdminPassword,
    isSensitiveConfigPath: mockIsSensitiveConfigPath,
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
    authLimiter: {
        check: mockAuthLimiterCheck,
        recordFailure: mockAuthLimiterRecordFailure,
    },
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: securityRouter } = await import('../../routes/security.js');

/** Express app with security router + cookie-parser stub. */
function buildApp() {
    const app = express();
    app.use(express.json());
    // Minimal cookie middleware: parse cookies from header
    app.use((req: any, _res: any, next: any) => {
        req.cookies = {};
        const cookieHeader = req.headers.cookie || '';
        for (const part of cookieHeader.split(';')) {
            const [k, v] = part.trim().split('=');
            if (k && v) req.cookies[k.trim()] = decodeURIComponent(v.trim());
        }
        next();
    });
    app.use('/', securityRouter);
    return app;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockAuthLimiterCheck.mockReturnValue({ allowed: true });
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(false);
    mockGetAccessTokenTTL.mockReturnValue(900);
    mockEmitActivity.mockReturnValue(undefined as any);
});

// =============================================================================
// Full auth lifecycle
// =============================================================================

describe('Auth token chain flow', () => {
    it('setup → login → refresh → logout', async () => {
        const app = buildApp();

        // ── Step 1: Set up admin password ─────────────────────────────────────
        mockIsAdminPasswordSet.mockResolvedValueOnce(false); // no existing password

        const setupRes = await request(app)
            .post('/security/admin/setup')
            .send({ password: 'secure-password-123' });

        expect(setupRes.status).toBe(200);
        expect(mockSetAdminPassword).toHaveBeenCalledWith('secure-password-123');

        // ── Step 2: Login — capture tokens ───────────────────────────────────
        mockIsAdminPasswordSet.mockResolvedValueOnce(true);  // password now set
        mockVerifyAdminPassword.mockResolvedValueOnce(true); // correct password
        mockSignAccessToken.mockResolvedValueOnce('access-token-1');
        mockCreateRefreshToken.mockResolvedValueOnce({
            token: 'refresh-token-1',
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ password: 'secure-password-123' });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.accessToken).toBe('access-token-1');
        expect(loginRes.body.refreshToken).toBe('refresh-token-1'); // also in body for non-browser clients
        expect(loginRes.body.expiresIn).toBe(900);

        const refreshToken1 = loginRes.body.refreshToken; // flows into Step 3

        // ── Step 3: Refresh — exchange refreshToken for a new pair ────────────
        mockRotateRefreshToken.mockResolvedValueOnce({
            token: 'refresh-token-2',
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        mockSignAccessToken.mockResolvedValueOnce('access-token-2');

        const refreshRes = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: refreshToken1 }); // pass captured token in body

        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.accessToken).toBe('access-token-2');
        expect(refreshRes.body.refreshToken).toBe('refresh-token-2');
        expect(mockRotateRefreshToken).toHaveBeenCalledWith('refresh-token-1');

        const refreshToken2 = refreshRes.body.refreshToken; // flows into Step 4

        // ── Step 4: Logout — revoke the rotated refresh token ─────────────────
        const logoutRes = await request(app)
            .post('/auth/logout')
            .send({ refreshToken: refreshToken2 });

        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body.success).toBe(true);
        expect(mockRevokeRefreshToken).toHaveBeenCalledWith('refresh-token-2');
    });

    it('refresh with invalid token returns 401 and does not issue new tokens', async () => {
        const app = buildApp();

        // rotateRefreshToken returns null → token invalid / already used
        mockRotateRefreshToken.mockResolvedValueOnce(null);

        const res = await request(app)
            .post('/auth/refresh')
            .send({ refreshToken: 'stale-refresh-token' });

        expect(res.status).toBe(401);
        expect(mockSignAccessToken).not.toHaveBeenCalled();
    });

    it('login after successful setup can use the issued accessToken field', async () => {
        const app = buildApp();

        mockIsAdminPasswordSet.mockResolvedValueOnce(true);
        mockVerifyAdminPassword.mockResolvedValueOnce(true);
        mockSignAccessToken.mockResolvedValueOnce('at-for-api-client');
        mockCreateRefreshToken.mockResolvedValueOnce({ token: 'rt-1', expiresAt: Date.now() + 1000 });

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ password: 'any-password' });

        expect(loginRes.status).toBe(200);

        // The accessToken from login body is the value a non-browser client uses directly
        const accessToken = loginRes.body.accessToken;
        expect(typeof accessToken).toBe('string');
        expect(accessToken.length).toBeGreaterThan(0);
    });
});
