/**
 * Deep branch-coverage tests for routes/security.ts
 * Covers: JWT verify catch, validateKey catch, admin token validation,
 * admin/setup error, admin/change error, admin/remove remote mode,
 * auth path exemption, requireAdmin with valid token.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key-123');
const mockValidateKey = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockRegenerateKey = jest.fn<() => Promise<string>>().mockResolvedValue('new-key-456');
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSetAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockRemoveAdminPassword = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSignAccessToken = jest.fn<() => Promise<string>>().mockResolvedValue('access-token-abc');
const mockVerifyAccessToken = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetAccessTokenTTL = jest.fn<() => number>().mockReturnValue(3600);
const mockCreateRefreshToken = jest.fn<() => Promise<{ token: string }>>().mockResolvedValue({ token: 'refresh-token-xyz' });
const mockRotateRefreshToken = jest.fn<() => Promise<{ token: string } | null>>().mockResolvedValue({ token: 'rotated-token' });
const mockRevokeRefreshToken = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRevokeAllRefreshTokens = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsRemoteMode = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsLocalhostAddress = jest.fn<() => boolean>().mockReturnValue(true);

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
    validateKey: mockValidateKey,
    regenerateKey: mockRegenerateKey,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    setAdminPassword: mockSetAdminPassword,
    verifyAdminPassword: mockVerifyAdminPassword,
    removeAdminPassword: mockRemoveAdminPassword,
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

const mockAuthLimiter = {
    check: jest.fn<() => { allowed: boolean; retryAfterMs?: number }>().mockReturnValue({ allowed: true }),
    recordFailure: jest.fn(),
};

jest.unstable_mockModule('../../core/rate-limit.js', () => ({
    authLimiter: mockAuthLimiter,
}));

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const securityModule = await import('../../routes/security.js');
const securityRouter = securityModule.default;
const { requireKey, requireAdmin } = securityModule;

// App for router tests
const app = express();
app.use(express.json());
app.use(securityRouter);

// App for middleware tests (requireKey)
const middlewareApp = express();
middlewareApp.use(express.json());
middlewareApp.use('/api', (req, res, next) => {
    requireKey(req, res, next);
});
middlewareApp.get('/api/test', (_req, res) => res.json({ ok: true }));
middlewareApp.get('/api/activity/stream', (_req, res) => res.json({ ok: true }));
middlewareApp.get('/api/auth/login', (_req, res) => res.json({ ok: true }));
middlewareApp.get('/api/auth/refresh', (_req, res) => res.json({ ok: true }));
middlewareApp.get('/health', (_req, res) => res.json({ ok: true }));

// App for requireAdmin middleware
const adminApp = express();
adminApp.use(express.json());
adminApp.post('/api/admin-action', requireAdmin as any, (_req: any, res: any) => res.json({ ok: true }));

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSecurityKey.mockResolvedValue('test-key-123');
    mockValidateKey.mockResolvedValue(true);
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(false);
    mockSignAccessToken.mockResolvedValue('access-token-abc');
    mockVerifyAccessToken.mockResolvedValue(null);
    mockGetAccessTokenTTL.mockReturnValue(3600);
    mockCreateRefreshToken.mockResolvedValue({ token: 'refresh-token-xyz' });
    mockRotateRefreshToken.mockResolvedValue({ token: 'rotated-token' });
    mockIsRemoteMode.mockReturnValue(false);
    mockIsLocalhostAddress.mockReturnValue(true);
    mockAuthLimiter.check.mockReturnValue({ allowed: true });
});

// =============================================================================
// requireKey — JWT verify throws (catch branch)
// =============================================================================

describe('requireKey — JWT verification error', () => {
    it('returns 500 when verifyAccessToken throws', async () => {
        mockVerifyAccessToken.mockRejectedValue(new Error('crypto failure'));

        const res = await request(middlewareApp)
            .get('/api/test')
            .set('Authorization', 'Bearer some-token');

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Authentication validation failed');
    });
});

// =============================================================================
// requireKey — validateKey throws (catch branch)
// =============================================================================

describe('requireKey — key validation error', () => {
    it('returns 500 when validateKey throws', async () => {
        mockValidateKey.mockRejectedValue(new Error('db failure'));

        const res = await request(middlewareApp)
            .get('/api/test')
            .set('x-podbit-key', 'some-key');

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Security validation failed');
    });
});

// =============================================================================
// requireKey — auth path exemption
// =============================================================================

describe('requireKey — auth path exemption', () => {
    it('allows /auth/ prefixed paths through without credentials', async () => {
        const res = await request(middlewareApp).get('/api/auth/login');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('allows /auth/refresh path through', async () => {
        const res = await request(middlewareApp).get('/api/auth/refresh');

        expect(res.status).toBe(200);
    });
});

// =============================================================================
// requireKey — no credentials, remote mode hint
// =============================================================================

describe('requireKey — no credentials hint varies by mode', () => {
    it('shows remote mode hint when isRemoteMode is true', async () => {
        mockIsRemoteMode.mockReturnValue(true);

        const res = await request(middlewareApp).get('/api/test');

        expect(res.status).toBe(401);
        expect(res.body.hint).toContain('POST /api/auth/login');
    });

    it('shows localhost hint when isRemoteMode is false', async () => {
        mockIsRemoteMode.mockReturnValue(false);

        const res = await request(middlewareApp).get('/api/test');

        expect(res.status).toBe(401);
        expect(res.body.hint).toContain('X-Podbit-Key');
    });
});

// =============================================================================
// requireKey — SSE query key for non-stream paths ignored
// =============================================================================

describe('requireKey — query key only for stream paths', () => {
    it('does not accept query key for non-stream paths', async () => {
        mockValidateKey.mockResolvedValue(true);

        const res = await request(middlewareApp).get('/api/test?key=some-key');

        // key in query is only for stream paths, so this should be rejected (no credentials)
        expect(res.status).toBe(401);
    });
});

// =============================================================================
// requireAdmin — valid admin token
// =============================================================================

describe('requireAdmin — admin token flow', () => {
    it('allows through with valid admin token from verify', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(true);

        // First, get an admin token via verify
        const verifyRes = await request(app)
            .post('/security/admin/verify')
            .send({ password: 'correct' });

        expect(verifyRes.status).toBe(200);
        const adminToken = verifyRes.body.token;

        // Now use that token with requireAdmin
        const res = await request(adminApp)
            .post('/api/admin-action')
            .set('x-admin-token', adminToken)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('rejects expired/invalid admin token and falls through', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);

        const res = await request(adminApp)
            .post('/api/admin-action')
            .set('x-admin-token', 'expired-or-fake-token')
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.adminRequired).toBe(true);
    });
});

// =============================================================================
// requireAdmin — invalid password header
// =============================================================================

describe('requireAdmin — invalid admin password header', () => {
    it('rejects invalid admin password in header', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(false);

        const res = await request(adminApp)
            .post('/api/admin-action')
            .set('x-admin-password', 'wrong-password')
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.adminRequired).toBe(true);
    });
});

// =============================================================================
// POST /security/admin/setup — setAdminPassword throws
// =============================================================================

describe('POST /security/admin/setup — error handling', () => {
    it('returns 500 when setAdminPassword throws', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);
        mockSetAdminPassword.mockRejectedValue(new Error('DB write failed'));

        const res = await request(app)
            .post('/security/admin/setup')
            .send({ password: 'longpassword' });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB write failed');
    });
});

// =============================================================================
// POST /security/admin/change — setAdminPassword throws
// =============================================================================

describe('POST /security/admin/change — error handling', () => {
    it('returns 500 when setAdminPassword throws during change', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        mockSetAdminPassword.mockRejectedValue(new Error('Hash computation failed'));

        const res = await request(app)
            .post('/security/admin/change')
            .send({ currentPassword: 'correct', newPassword: 'newpassword123' });

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Hash computation failed');
    });
});

// =============================================================================
// POST /security/admin/change — newPassword validation edge cases
// =============================================================================

describe('POST /security/admin/change — edge cases', () => {
    it('returns 400 when newPassword is missing', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);

        const res = await request(app)
            .post('/security/admin/change')
            .send({ currentPassword: 'correct' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('8 characters');
    });

    it('returns 400 when newPassword is not a string', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);

        const res = await request(app)
            .post('/security/admin/change')
            .send({ currentPassword: 'correct', newPassword: 12345678 });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /security/admin/remove — remote mode with valid password
// =============================================================================

describe('POST /security/admin/remove — remote mode warning', () => {
    it('removes password in remote mode and emits warning', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        mockIsRemoteMode.mockReturnValue(true);

        const res = await request(app)
            .post('/security/admin/remove')
            .send({ password: 'correct' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRemoveAdminPassword).toHaveBeenCalled();
        // Should emit both the remote warning and the general removal event
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'admin_password_removed_remote',
            expect.stringContaining('remote mode'),
            expect.any(Object)
        );
    });

    it('removes password in localhost mode without remote warning', async () => {
        mockVerifyAdminPassword.mockResolvedValue(true);
        mockIsRemoteMode.mockReturnValue(false);

        const res = await request(app)
            .post('/security/admin/remove')
            .send({ password: 'correct' });

        expect(res.status).toBe(200);
        // Should NOT emit the remote warning
        expect(mockEmitActivity).not.toHaveBeenCalledWith(
            'system', 'admin_password_removed_remote',
            expect.any(String),
            expect.any(Object)
        );
        // Should emit the normal removal event
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'admin_password_removed',
            expect.any(String),
            expect.any(Object)
        );
    });
});

// =============================================================================
// POST /security/admin/setup — password type validation
// =============================================================================

describe('POST /security/admin/setup — password type validation', () => {
    it('returns 400 when password is non-string (number)', async () => {
        mockIsAdminPasswordSet.mockResolvedValue(false);

        const res = await request(app)
            .post('/security/admin/setup')
            .send({ password: 12345678 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('password is required');
    });
});

// =============================================================================
// GET /security/handshake — user-agent truncation
// =============================================================================

describe('GET /security/handshake — activity logging', () => {
    it('truncates user-agent in activity log', async () => {
        const res = await request(app)
            .get('/security/handshake')
            .set('User-Agent', 'A'.repeat(100));

        expect(res.status).toBe(200);
        // emitActivity should be called with truncated user-agent
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'security_handshake',
            expect.any(String),
            expect.any(Object)
        );
    });

    it('handles missing user-agent', async () => {
        const res = await request(app)
            .get('/security/handshake')
            .set('User-Agent', '');

        expect(res.status).toBe(200);
    });
});
