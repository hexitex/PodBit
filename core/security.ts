/**
 * Podbit Security System
 *
 * Two-tier authentication:
 *
 * 1. **Security Key** (auto-generated, session token)
 *    - Generated on first startup, stored in system.db
 *    - Authenticates internal API calls (MCP → HTTP, GUI → HTTP)
 *    - Prevents EVM sandbox from reaching API
 *    - GUI obtains via localhost-only handshake endpoint
 *
 * 2. **Admin Password** (user-set, privilege escalation)
 *    - Required for security-sensitive config changes (EVM sandbox settings, API keys, etc.)
 *    - Hashed with scrypt + random salt, stored in system.db
 *    - GUI prompts for it when changing guarded settings
 *    - Not set by default — must be set up before sensitive operations are guarded
 *
 * The sandbox process CANNOT obtain either credential:
 *   - Not in its env (sandbox.ts controls env explicitly)
 *   - No file access (blocked at 4 layers)
 *   - No DB access (no sqlite3 module)
 *   - No network access to handshake endpoint (socket kill switch)
 */

import crypto from 'crypto';
import { promisify } from 'util';
import { systemQuery, systemQueryOne } from '../db.js';
import { dbDateMs } from '../utils/datetime.js';

const scryptAsync = promisify(crypto.scrypt);

const SETTINGS_KEY = 'security.key';
const KEY_LENGTH = 32; // 32 bytes = 64 hex chars

let _cachedKey: string | null = null;

/**
 * Get or generate the security key.
 * First call loads from system.db or generates a new 32-byte random key and persists it.
 * Subsequent calls return the in-memory cached value.
 *
 * @returns Hex-encoded 64-character security key
 */
export async function getSecurityKey(): Promise<string> {
    if (_cachedKey) return _cachedKey;

    // Try to load from system.db
    try {
        const row: any = await systemQueryOne(
            'SELECT value FROM settings WHERE key = $1',
            [SETTINGS_KEY]
        );
        if (row?.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            if (typeof parsed === 'string' && parsed.length >= 32) {
                _cachedKey = parsed;
                return _cachedKey;
            }
        }
    } catch {
        // settings table might not exist yet — will be created by migration
    }

    // Generate new key
    _cachedKey = crypto.randomBytes(KEY_LENGTH).toString('hex');

    // Persist to system.db
    try {
        await systemQuery(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
            [SETTINGS_KEY, JSON.stringify(_cachedKey)]
        );
    } catch (e: any) {
        console.error('[security] Failed to persist security key:', e.message);
    }

    return _cachedKey;
}

/**
 * Generate a new security key, replacing the existing one.
 * All existing sessions (GUI, MCP) will need to re-authenticate.
 *
 * @returns The newly generated hex-encoded 64-character security key
 */
export async function regenerateKey(): Promise<string> {
    _cachedKey = crypto.randomBytes(KEY_LENGTH).toString('hex');

    try {
        await systemQuery(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
            [SETTINGS_KEY, JSON.stringify(_cachedKey)]
        );
    } catch (e: any) {
        console.error('[security] Failed to persist regenerated key:', e.message);
    }

    return _cachedKey;
}

/**
 * Validate a key against the stored security key.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param candidate - Key string to validate, or null/undefined
 * @returns True if the candidate matches the stored security key
 */
export async function validateKey(candidate: string | undefined | null): Promise<boolean> {
    if (!candidate) return false;
    const actual = await getSecurityKey();
    if (candidate.length !== actual.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(actual));
}

/**
 * Config paths that are security-sensitive.
 * Changes to these paths require the security key and are logged as security events.
 */
export const SENSITIVE_CONFIG_PATHS = new Set([
    'evm.allowedModules',
    'evm.blockedBuiltins',
    'evm.blockedAttributes',
    'evm.blockedCalls',
    'evm.networkKillSwitch',
    'evm.runtimePatching',
]);

/**
 * Check if a config path is security-sensitive.
 * Matches exact paths, prefix patterns (e.g., 'evm.allowed' matches 'evm.allowedModules'),
 * and any path containing apiKey, api_key, secret, or password (case-insensitive).
 *
 * @param configPath - Array of path segments (e.g. ['evm', 'allowedModules'])
 * @returns True if changes to this path require admin authentication
 */
export function isSensitiveConfigPath(configPath: string[]): boolean {
    const dotPath = configPath.join('.');
    // Exact match
    if (SENSITIVE_CONFIG_PATHS.has(dotPath)) return true;
    // Check if any sensitive path starts with the given path (changing a parent object)
    for (const sensitive of SENSITIVE_CONFIG_PATHS) {
        if (sensitive.startsWith(dotPath + '.') || dotPath.startsWith(sensitive + '.')) return true;
    }
    // Any path containing apiKey, api_key, secret, password
    const lower = dotPath.toLowerCase();
    if (lower.includes('apikey') || lower.includes('api_key') ||
        lower.includes('secret') || lower.includes('password')) return true;
    return false;
}


// =============================================================================
// ADMIN PASSWORD SYSTEM
// =============================================================================

const ADMIN_PASSWORD_KEY = 'security.admin_password';
const SALT_LENGTH = 16;
const KEY_DERIVATION_LENGTH = 64;

/**
 * Check whether an admin password has been set in system.db.
 *
 * @returns True if a valid hash+salt entry exists for the admin password
 */
export async function isAdminPasswordSet(): Promise<boolean> {
    try {
        const row: any = await systemQueryOne(
            'SELECT value FROM settings WHERE key = $1',
            [ADMIN_PASSWORD_KEY]
        );
        if (row?.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            return !!(parsed?.hash && parsed?.salt);
        }
    } catch { /* settings table not ready */ }
    return false;
}

/**
 * Set the admin password. Hashes with scrypt + random salt.
 * If a password already exists, the caller must have validated the old password first.
 *
 * @param password - Plaintext password (minimum 8 characters)
 * @throws Error if password is shorter than 8 characters
 */
export async function setAdminPassword(password: string): Promise<void> {
    if (!password || password.length < 8) {
        throw new Error('Admin password must be at least 8 characters');
    }

    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    const derived = await scryptAsync(password, salt, KEY_DERIVATION_LENGTH) as Buffer;
    const hash = derived.toString('hex');

    await systemQuery(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [ADMIN_PASSWORD_KEY, JSON.stringify({ hash, salt })]
    );
}

/**
 * Verify a password against the stored admin password.
 * Uses scrypt key derivation and constant-time comparison.
 *
 * @param candidate - Plaintext password to verify, or null/undefined
 * @returns True if the candidate matches the stored password hash; false if no password is set or mismatch
 */
export async function verifyAdminPassword(candidate: string | undefined | null): Promise<boolean> {
    if (!candidate) return false;

    try {
        const row: any = await systemQueryOne(
            'SELECT value FROM settings WHERE key = $1',
            [ADMIN_PASSWORD_KEY]
        );
        if (!row?.value) return false;

        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        if (!parsed?.hash || !parsed?.salt) return false;

        const derived = await scryptAsync(candidate, parsed.salt, KEY_DERIVATION_LENGTH) as Buffer;
        const candidateHash = derived.toString('hex');

        // Constant-time comparison
        if (candidateHash.length !== parsed.hash.length) return false;
        return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(parsed.hash));
    } catch {
        return false;
    }
}

/**
 * Remove the admin password (requires current password verification first).
 */
export async function removeAdminPassword(): Promise<void> {
    await systemQuery(
        'DELETE FROM settings WHERE key = $1',
        [ADMIN_PASSWORD_KEY]
    );
}


// =============================================================================
// JWT ACCESS TOKENS (HMAC-SHA256, zero dependencies)
// =============================================================================

const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * Encode a buffer as a base64url string (URL-safe, no padding).
 *
 * @param buf - Buffer to encode
 * @returns Base64url-encoded string
 */
function base64url(buf: Buffer): string {
    return buf.toString('base64url');
}

/**
 * Decode a base64url string back to a Buffer.
 *
 * @param str - Base64url-encoded string
 * @returns Decoded buffer
 */
function base64urlDecode(str: string): Buffer {
    return Buffer.from(str, 'base64url');
}

export interface AccessTokenPayload {
    sub: string; // 'admin'
    type: 'access';
    iat: number;
    exp: number;
}

/**
 * Sign a JWT access token using HMAC-SHA256 with the security key.
 * Zero external dependencies -- uses Node crypto only.
 * Token is valid for ACCESS_TOKEN_TTL_SEC (15 minutes).
 *
 * @returns Signed JWT string in the format header.payload.signature
 */
export async function signAccessToken(): Promise<string> {
    const secret = await getSecurityKey();
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
        sub: 'admin',
        type: 'access',
        iat: now,
        exp: now + ACCESS_TOKEN_TTL_SEC,
    };

    const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
    const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
    const sigInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.createHmac('sha256', secret).update(sigInput).digest();

    return `${sigInput}.${base64url(sig)}`;
}

/**
 * Verify and decode a JWT access token.
 * Uses constant-time comparison to prevent timing attacks.
 * Checks signature validity, token type, and expiration.
 *
 * @param token - JWT string to verify
 * @returns Decoded payload if valid and not expired, null otherwise
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const secret = await getSecurityKey();
    const sigInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(sigInput).digest();
    const actualSig = base64urlDecode(parts[2]);

    if (expectedSig.length !== actualSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    try {
        const payload = JSON.parse(base64urlDecode(parts[1]).toString()) as AccessTokenPayload;
        if (payload.type !== 'access') return null;
        if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

/** Returns the access token TTL in seconds (for client-side scheduling). */
export function getAccessTokenTTL(): number {
    return ACCESS_TOKEN_TTL_SEC;
}


// =============================================================================
// REFRESH TOKENS (stored hashed in system.db, rotation with family tracking)
// =============================================================================

/**
 * Refresh tokens are random 32-byte hex strings. Only the SHA-256 hash is
 * stored in the database — if the DB is compromised, raw tokens aren't leaked.
 *
 * Family tracking: each refresh token belongs to a "family". When a token is
 * rotated, the new token inherits the family. If a revoked token is reused,
 * the ENTIRE family is revoked (theft detection per RFC 6749 §10.4).
 */

/**
 * Hash a raw token with SHA-256 for secure storage.
 * Only the hash is persisted; the raw token is never stored.
 *
 * @param token - Raw token string to hash
 * @returns Hex-encoded SHA-256 hash
 */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export interface RefreshTokenResult {
    token: string;
    expiresAt: string; // ISO date
}

/**
 * Create a new refresh token and persist its hash to system.db.
 * Returns the raw token (to send to client) and expiry.
 *
 * @param family - Optional family ID for token rotation tracking; auto-generated if omitted
 * @returns Object with the raw token string and ISO expiry date
 */
export async function createRefreshToken(family?: string): Promise<RefreshTokenResult> {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = hashToken(raw);
    const id = crypto.randomUUID();
    const familyId = family || crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

    await systemQuery(
        `INSERT INTO refresh_tokens (id, token_hash, family, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [id, hash, familyId, expiresAt]
    );

    return { token: raw, expiresAt };
}

/**
 * Validate a refresh token. Returns the family ID if valid, null otherwise.
 * Does NOT consume the token -- call rotateRefreshToken() after validation.
 * If a revoked token is reused, the entire token family is revoked (theft detection).
 *
 * @param token - Raw refresh token string
 * @returns Family and ID if valid; null if invalid, expired, or revoked
 */
export async function validateRefreshToken(token: string): Promise<{ family: string; id: string } | null> {
    if (!token) return null;
    const hash = hashToken(token);

    const row: any = await systemQueryOne(
        `SELECT id, family, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1`,
        [hash]
    );

    if (!row) return null;

    // If this token was revoked, it's a reuse attempt — revoke entire family (theft detection)
    if (row.revoked) {
        await systemQuery(
            `UPDATE refresh_tokens SET revoked = 1 WHERE family = $1`,
            [row.family]
        );
        return null;
    }

    // Check expiry
    if (dbDateMs(row.expires_at) < Date.now()) {
        return null;
    }

    return { family: row.family, id: row.id };
}

/**
 * Rotate a refresh token: revoke the old one and issue a new one in the same family.
 *
 * @param oldToken - Raw refresh token to rotate
 * @returns New token and expiry if rotation succeeded, null if old token was invalid
 */
export async function rotateRefreshToken(oldToken: string): Promise<RefreshTokenResult | null> {
    const validation = await validateRefreshToken(oldToken);
    if (!validation) return null;

    // Revoke the old token
    await systemQuery(
        `UPDATE refresh_tokens SET revoked = 1 WHERE id = $1`,
        [validation.id]
    );

    // Issue a new token in the same family
    return createRefreshToken(validation.family);
}

/**
 * Revoke a specific refresh token by its raw value.
 *
 * @param token - Raw refresh token string to revoke
 */
export async function revokeRefreshToken(token: string): Promise<void> {
    const hash = hashToken(token);
    await systemQuery(
        `UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = $1`,
        [hash]
    );
}

/**
 * Revoke ALL refresh tokens (e.g. on password change or security key regeneration).
 */
export async function revokeAllRefreshTokens(): Promise<void> {
    await systemQuery(`UPDATE refresh_tokens SET revoked = 1 WHERE revoked = 0`, []);
}

/**
 * Delete expired and revoked refresh tokens older than 30 days.
 * Called periodically to prevent table bloat.
 */
export async function cleanupExpiredRefreshTokens(): Promise<void> {
    await systemQuery(
        `DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR (revoked = 1 AND created_at < datetime('now', '-30 days'))`,
        []
    );
}


// =============================================================================
// REMOTE MODE DETECTION
// =============================================================================

const LOCALHOST_ADDRESSES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Check if a host string represents a localhost-only binding.
 * Returns false for 0.0.0.0, specific IPs, hostnames, etc.
 *
 * @param host - Host/bind address string to check
 * @returns True if the host is localhost, 127.0.0.1, or ::1
 */
export function isLocalhostAddress(host: string): boolean {
    return LOCALHOST_ADDRESSES.has(host);
}

/**
 * Check if the server is running in remote mode (non-localhost binding).
 * When true, password auth is mandatory and the handshake endpoint is restricted.
 */
export function isRemoteMode(): boolean {
    const host = process.env.HOST || 'localhost';
    return !isLocalhostAddress(host);
}
