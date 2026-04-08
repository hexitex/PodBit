/**
 * Security routes and middleware.
 *
 * Three-tier auth:
 *   1. Security key (X-Podbit-Key) — legacy session token for localhost API calls
 *   2. JWT access token (Authorization: Bearer) — short-lived, for remote GUI/API access
 *   3. Admin password (X-Admin-Password) — required for security-sensitive operations
 *
 * Auth flows:
 *   Localhost:
 *     GET  /security/handshake → returns security key (localhost-only, no password needed)
 *     All API calls use X-Podbit-Key header
 *
 *   Remote:
 *     POST /auth/login → password → access token + refresh token
 *     POST /auth/refresh → refresh token → new access token + rotated refresh token
 *     POST /auth/logout → revoke refresh token
 *     All API calls use Authorization: Bearer <access-token>
 *
 *   Admin (both modes):
 *     POST /security/admin/setup — set initial admin password
 *     POST /security/admin/verify — verify admin password (returns short-lived token)
 *     POST /security/admin/change — change admin password
 *     POST /security/admin/remove — remove admin password
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import {
    getSecurityKey, validateKey, regenerateKey,
    isAdminPasswordSet, setAdminPassword, verifyAdminPassword, removeAdminPassword,
    signAccessToken, verifyAccessToken, getAccessTokenTTL,
    createRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllRefreshTokens,
    isRemoteMode, isLocalhostAddress,
} from '../core/security.js';
import { authLimiter } from '../core/rate-limit.js';
import { emitActivity } from '../services/event-bus.js';

const router = Router();

// Header names
export const SECURITY_HEADER = 'x-podbit-key';
export const ADMIN_HEADER = 'x-admin-password';
export const ADMIN_TOKEN_HEADER = 'x-admin-token';

const REFRESH_TOKEN_COOKIE = 'podbit_refresh';


// =============================================================================
// HANDSHAKE (localhost-only, legacy flow)
// =============================================================================

/**
 * Handshake endpoint — returns the security key to the GUI.
 * Only responds to requests from localhost (127.0.0.1, ::1, ::ffff:127.0.0.1).
 */
router.get('/security/handshake', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';

    if (!isLocalhost) {
        emitActivity('system', 'security_handshake_denied',
            `Handshake denied from non-localhost IP: ${ip}`, { ip });
        res.status(403).json({ error: 'Handshake only available from localhost' });
        return;
    }

    const key = await getSecurityKey();
    emitActivity('system', 'security_handshake',
        `Security key issued to ${req.headers['user-agent']?.slice(0, 40) || 'unknown'}`,
        { ip });
    res.json({ key });
});

/**
 * Regenerate the security key.
 * Requires the CURRENT valid key (prevents unauthorized regeneration).
 * Also revokes all refresh tokens since they were signed with the old key.
 */
router.post('/security/regenerate', async (req: Request, res: Response) => {
    const candidate = req.headers[SECURITY_HEADER] as string | undefined;
    const valid = await validateKey(candidate);

    if (!valid) {
        res.status(401).json({ error: 'Current security key required to regenerate' });
        return;
    }

    const newKey = await regenerateKey();
    await revokeAllRefreshTokens();
    emitActivity('system', 'security_regenerated',
        'Security key regenerated — all sessions must re-authenticate',
        { ip: req.ip });
    res.json({ key: newKey, message: 'Key regenerated. All sessions invalidated.' });
});


// =============================================================================
// JWT AUTH (login, refresh, logout — for remote access)
// =============================================================================

/**
 * Login with admin password. Returns JWT access token + refresh token.
 * Rate-limited: 5 attempts per 15 minutes per IP.
 */
router.post('/auth/login', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '';

    // Rate limiting
    const rateCheck = authLimiter.check(ip);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', Math.ceil((rateCheck.retryAfterMs || 60000) / 1000));
        emitActivity('system', 'auth_rate_limited',
            `Login rate-limited for IP ${ip}`, { ip });
        res.status(429).json({
            error: 'Too many login attempts. Try again later.',
            retryAfterMs: rateCheck.retryAfterMs,
        });
        return;
    }

    // Admin password must be set for login
    const passwordSet = await isAdminPasswordSet();
    if (!passwordSet) {
        res.status(403).json({
            error: 'Admin password not configured. Set one via /api/security/admin/setup first.',
            needsSetup: true,
        });
        return;
    }

    const { password } = req.body;
    if (!password) {
        res.status(400).json({ error: 'Password is required' });
        return;
    }

    const valid = await verifyAdminPassword(password);
    if (!valid) {
        authLimiter.recordFailure(ip);
        emitActivity('system', 'auth_login_failed',
            `Failed login attempt from ${ip}`, { ip });
        res.status(401).json({ error: 'Invalid password' });
        return;
    }

    // Issue tokens
    const accessToken = await signAccessToken();
    const refresh = await createRefreshToken();

    // Set refresh token as httpOnly cookie (browser-safe)
    res.cookie(REFRESH_TOKEN_COOKIE, refresh.token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/auth', // Only sent to auth endpoints
    });

    emitActivity('system', 'auth_login_success',
        `Login from ${ip}`, { ip });

    res.json({
        accessToken,
        refreshToken: refresh.token, // Also in body for non-browser clients
        expiresIn: getAccessTokenTTL(),
    });
});

/**
 * Refresh access token. Rotates the refresh token (one-time use).
 * Accepts refresh token from httpOnly cookie or request body.
 */
router.post('/auth/refresh', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '';

    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
    if (!refreshToken) {
        res.status(401).json({ error: 'Refresh token required' });
        return;
    }

    const newRefresh = await rotateRefreshToken(refreshToken);
    if (!newRefresh) {
        // Clear the cookie if rotation failed
        res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
        emitActivity('system', 'auth_refresh_failed',
            `Refresh token invalid or reused from ${ip}`, { ip });
        res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
        return;
    }

    const accessToken = await signAccessToken();

    // Set new refresh token cookie
    res.cookie(REFRESH_TOKEN_COOKIE, newRefresh.token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
    });

    res.json({
        accessToken,
        refreshToken: newRefresh.token,
        expiresIn: getAccessTokenTTL(),
    });
});

/**
 * Logout — revoke the refresh token.
 */
router.post('/auth/logout', async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }

    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
    emitActivity('system', 'auth_logout',
        `Logout from ${req.ip || 'unknown'}`, { ip: req.ip });
    res.json({ success: true });
});


// =============================================================================
// ADMIN PASSWORD ROUTES
// =============================================================================

// Short-lived admin tokens: token → expiry timestamp
const adminTokens = new Map<string, number>();
const ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Issue a short-lived admin token for GUI authentication.
 * Tokens expire after {@link ADMIN_TOKEN_TTL_MS} (15 minutes).
 * Also performs cleanup of expired tokens from the in-memory store.
 *
 * @returns Hex-encoded 32-byte random token
 */
function issueAdminToken(): string {
    const token = crypto.randomBytes(32).toString('hex');
    adminTokens.set(token, Date.now() + ADMIN_TOKEN_TTL_MS);
    // Cleanup expired tokens
    for (const [t, exp] of adminTokens) {
        if (exp < Date.now()) adminTokens.delete(t);
    }
    return token;
}

/**
 * Validate an admin token against the in-memory store.
 * Deletes expired tokens on access.
 *
 * @param token - The admin token to validate (from X-Admin-Token header)
 * @returns True if the token exists and has not expired
 */
function validateAdminToken(token: string | undefined): boolean {
    if (!token) return false;
    const exp = adminTokens.get(token);
    if (!exp || exp < Date.now()) {
        adminTokens.delete(token!);
        return false;
    }
    return true;
}

export const validateAdminTokenExport = validateAdminToken;

/**
 * Check if admin password is set up.
 */
router.get('/security/admin/status', async (_req: Request, res: Response) => {
    const isSet = await isAdminPasswordSet();
    const remote = isRemoteMode();
    res.json({ isSet, remoteMode: remote });
});

/**
 * Set up the admin password for the first time.
 * Only works if no password is currently set.
 */
router.post('/security/admin/setup', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '';

    // Rate-limit setup attempts too
    const rateCheck = authLimiter.check(ip);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', Math.ceil((rateCheck.retryAfterMs || 60000) / 1000));
        res.status(429).json({ error: 'Too many attempts. Try again later.' });
        return;
    }

    const alreadySet = await isAdminPasswordSet();
    if (alreadySet) {
        res.status(409).json({ error: 'Admin password already set. Use /security/admin/change to update it.' });
        return;
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string') {
        res.status(400).json({ error: 'password is required' });
        return;
    }
    if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }

    try {
        await setAdminPassword(password);
        const token = issueAdminToken();
        emitActivity('system', 'admin_password_set',
            'Admin password configured for the first time', { ip });

        // In remote mode, also issue JWT tokens so user is immediately authenticated
        if (isRemoteMode()) {
            const accessToken = await signAccessToken();
            const refresh = await createRefreshToken();
            res.cookie(REFRESH_TOKEN_COOKIE, refresh.token, {
                httpOnly: true,
                secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/api/auth',
            });
            res.json({
                success: true,
                token,
                expiresInMs: ADMIN_TOKEN_TTL_MS,
                accessToken,
                refreshToken: refresh.token,
                expiresIn: getAccessTokenTTL(),
            });
            return;
        }

        res.json({ success: true, token, expiresInMs: ADMIN_TOKEN_TTL_MS });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Verify the admin password. Returns a short-lived admin token
 * that can be used for subsequent sensitive operations without re-prompting.
 */
router.post('/security/admin/verify', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || '';

    // Rate-limit verify attempts
    const rateCheck = authLimiter.check(ip);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', Math.ceil((rateCheck.retryAfterMs || 60000) / 1000));
        res.status(429).json({ error: 'Too many attempts. Try again later.' });
        return;
    }

    const { password } = req.body;
    const valid = await verifyAdminPassword(password);

    if (!valid) {
        authLimiter.recordFailure(ip);
        emitActivity('system', 'admin_auth_failed',
            'Failed admin password verification attempt', { ip });
        res.status(401).json({ error: 'Invalid admin password' });
        return;
    }

    const token = issueAdminToken();
    emitActivity('system', 'admin_auth_success',
        'Admin password verified — session token issued', { ip });
    res.json({ success: true, token, expiresInMs: ADMIN_TOKEN_TTL_MS });
});

/**
 * Change the admin password. Requires the current password.
 * Revokes all refresh tokens (forces re-login).
 */
router.post('/security/admin/change', async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    const valid = await verifyAdminPassword(currentPassword);
    if (!valid) {
        res.status(401).json({ error: 'Current admin password is incorrect' });
        return;
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
    }

    try {
        await setAdminPassword(newPassword);
        // Invalidate all existing sessions
        adminTokens.clear();
        await revokeAllRefreshTokens();
        const token = issueAdminToken();
        emitActivity('system', 'admin_password_changed',
            'Admin password changed — all sessions revoked', { ip: req.ip });
        res.json({ success: true, token, expiresInMs: ADMIN_TOKEN_TTL_MS });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Remove the admin password. Requires the current password.
 * In remote mode, this is dangerous — warn but allow.
 */
router.post('/security/admin/remove', async (req: Request, res: Response) => {
    const { password, force } = req.body;

    // Force-remove: localhost-only, no password required (recovery path)
    if (force) {
        if (!isLocalhostAddress(req.ip || req.socket.remoteAddress || '')) {
            res.status(403).json({ error: 'Force-remove is only available from localhost' });
            return;
        }
        await removeAdminPassword();
        adminTokens.clear();
        await revokeAllRefreshTokens();
        res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
        emitActivity('system', 'admin_password_force_removed',
            'Admin password force-removed from localhost (recovery)', { ip: req.ip });
        res.json({ success: true });
        return;
    }

    const valid = await verifyAdminPassword(password);
    if (!valid) {
        res.status(401).json({ error: 'Admin password is incorrect' });
        return;
    }

    if (isRemoteMode()) {
        emitActivity('system', 'admin_password_removed_remote',
            'WARNING: Admin password removed while in remote mode — server is unprotected', { ip: req.ip });
    }

    await removeAdminPassword();
    adminTokens.clear();
    await revokeAllRefreshTokens();
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
    emitActivity('system', 'admin_password_removed',
        'Admin password removed — sensitive operations unguarded', { ip: req.ip });
    res.json({ success: true });
});


// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Express middleware that validates authentication.
 *
 * Accepts either:
 *   1. Authorization: Bearer <jwt-access-token> — JWT flow (remote)
 *   2. X-Podbit-Key header — legacy security key flow (localhost)
 *   3. ?key= query param — SSE streams only (EventSource can't send headers)
 *
 * Exempt: OPTIONS (CORS preflight), /health (monitoring).
 * Auth endpoints (/auth/login, /auth/refresh, /auth/logout) are exempt.
 * The handshake and admin/setup are exempt because they're mounted BEFORE this middleware.
 */
export function requireKey(req: Request, res: Response, next: NextFunction): void {
    // CORS preflight and health checks are exempt
    if (req.method === 'OPTIONS' || req.path === '/health') {
        next();
        return;
    }

    // Auth endpoints are exempt (they handle their own auth)
    if (req.path.startsWith('/auth/')) {
        next();
        return;
    }

    // Lab LLM proxy is exempt — local labs call this without auth
    if (req.path === '/llm/call' && req.method === 'POST') {
        next();
        return;
    }

    // Try JWT Bearer token first
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        verifyAccessToken(token).then(payload => {
            if (payload) {
                next();
            } else {
                // Token invalid or expired — return 401 so client can try refresh
                res.status(401).json({
                    error: 'Access token expired or invalid',
                    code: 'TOKEN_EXPIRED',
                    hint: 'Use POST /api/auth/refresh to obtain a new access token.',
                });
            }
        }).catch(() => {
            res.status(500).json({ error: 'Authentication validation failed' });
        });
        return;
    }

    // Try legacy security key (X-Podbit-Key header)
    const headerKey = req.headers[SECURITY_HEADER] as string | undefined;

    // EventSource cannot send custom headers; allow key in query for SSE stream only
    const isStreamPath = req.path === '/api/activity/stream' || req.path === '/activity/stream';
    const queryKey = (isStreamPath && (req.query?.key as string | undefined)) || undefined;

    const candidate = headerKey || queryKey;

    if (candidate) {
        validateKey(candidate).then(valid => {
            if (valid) {
                next();
            } else {
                emitActivity('system', 'security_rejected',
                    `Unauthorized ${req.method} ${req.path} — invalid security key`,
                    { method: req.method, path: req.path, ip: req.ip });
                res.status(401).json({
                    error: 'Invalid security key',
                    hint: 'Include X-Podbit-Key header or Authorization: Bearer <token>.',
                });
            }
        }).catch(() => {
            res.status(500).json({ error: 'Security validation failed' });
        });
        return;
    }

    // No credentials provided
    emitActivity('system', 'security_rejected',
        `Unauthorized ${req.method} ${req.path} — no credentials provided`,
        { method: req.method, path: req.path, ip: req.ip });
    res.status(401).json({
        error: 'Authentication required',
        hint: isRemoteMode()
            ? 'Use POST /api/auth/login to obtain an access token, or include Authorization: Bearer <token>.'
            : 'Include X-Podbit-Key header. GUI obtains it via /api/security/handshake.',
    });
}

/**
 * Middleware that requires admin authentication for security-sensitive operations.
 * Checks for either:
 *   1. X-Admin-Token header with a valid short-lived token (from /security/admin/verify)
 *   2. X-Admin-Password header with the correct password (direct verification)
 *
 * If no admin password is set, the operation is allowed (unguarded).
 * This middleware should be applied to specific routes, not globally.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    // If no admin password is set, allow the operation (unguarded)
    const passwordSet = await isAdminPasswordSet();
    if (!passwordSet) {
        next();
        return;
    }

    // Check for admin token first (faster, no hashing)
    const token = req.headers[ADMIN_TOKEN_HEADER] as string | undefined;
    if (token && validateAdminToken(token)) {
        next();
        return;
    }

    // Check for direct password
    const password = req.headers[ADMIN_HEADER] as string | undefined;
    if (password) {
        const valid = await verifyAdminPassword(password);
        if (valid) {
            next();
            return;
        }
    }

    emitActivity('system', 'admin_required',
        `Admin auth required for ${req.method} ${req.path}`,
        { method: req.method, path: req.path, ip: req.ip });

    res.status(403).json({
        error: 'Admin authentication required',
        adminRequired: true,
        hint: 'This operation requires admin privileges. Provide X-Admin-Token or X-Admin-Password header.',
    });
}

export default router;
