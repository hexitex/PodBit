/**
 * SMB Connection Manager
 *
 * Manages SMB/CIFS share connections via `net use` on Windows.
 * Once connected, UNC paths (\\host\share) work with standard fs operations,
 * so the KB scanner needs no changes.
 */

import { exec } from 'child_process';
import os from 'os';

export interface SmbConnection {
    id: string;          // "host/share" normalized key
    host: string;
    share: string;
    domain?: string;
    username: string;
    uncPath: string;     // \\host\share
    connectedAt: string; // ISO timestamp
}

/** Active connections tracked in memory (keyed by normalized "host/share"). */
const connections = new Map<string, SmbConnection>();

/**
 * Build a normalized connection key from host and share name.
 * @param host - SMB server hostname or IP
 * @param share - Share name on the server
 * @returns Lowercase "host/share" string used as the map key
 */
function connectionId(host: string, share: string): string {
    return `${host.toLowerCase()}/${share.toLowerCase()}`;
}

/**
 * Build a Windows UNC path from host and share components.
 * @param host - SMB server hostname or IP
 * @param share - Share name on the server
 * @returns UNC path string (e.g. \\\\server\\share)
 */
function buildUncPath(host: string, share: string): string {
    return `\\\\${host}\\${share}`;
}

/**
 * Execute a shell command and return stdout as a promise.
 * Rejects with the stderr/stdout/error message on failure.
 * @param cmd - Shell command string to execute
 * @returns Trimmed stdout output
 */
function execPromise(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
            if (err) {
                const msg = stderr?.trim() || stdout?.trim() || err.message;
                reject(new Error(msg));
            } else {
                resolve(stdout?.trim() || '');
            }
        });
    });
}

/**
 * Connect to an SMB share using Windows `net use` via PowerShell.
 * If a connection already exists for this host/share, it is disconnected first
 * to refresh credentials. On non-Windows platforms, throws immediately.
 *
 * @param opts - Connection parameters
 * @param opts.host - SMB server hostname or IP
 * @param opts.share - Share name on the server
 * @param opts.username - Authentication username
 * @param opts.password - Authentication password
 * @param opts.domain - Optional Windows domain for authentication
 * @returns The established {@link SmbConnection} object
 * @throws {Error} If not running on Windows, or if `net use` fails
 */
export async function connectShare(opts: {
    host: string;
    share: string;
    username: string;
    password: string;
    domain?: string;
}): Promise<SmbConnection> {
    if (os.platform() !== 'win32') {
        throw new Error('SMB connections are currently supported on Windows only. On Linux/macOS, mount the share via the OS and use the mount path.');
    }

    const { host, share, username, password, domain } = opts;
    const id = connectionId(host, share);
    const uncPath = buildUncPath(host, share);

    // Disconnect first if already connected (refresh credentials)
    if (connections.has(id)) {
        try { await disconnectShare(host, share); } catch { /* ignore */ }
    }

    // Build net use command
    // net use \\host\share password /USER:domain\username
    const userArg = domain ? `${domain}\\${username}` : username;

    // Use PowerShell to avoid password escaping issues in cmd
    const ps = [
        `$ErrorActionPreference = 'Stop'`,
        `net use '${uncPath.replace(/'/g, "''")}' '${password.replace(/'/g, "''")}' /USER:'${userArg.replace(/'/g, "''")}' /PERSISTENT:NO 2>&1`,
    ].join('; ');

    await execPromise(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);

    const conn: SmbConnection = {
        id,
        host,
        share,
        domain,
        username,
        uncPath,
        connectedAt: new Date().toISOString(),
    };
    connections.set(id, conn);
    return conn;
}

/**
 * Disconnect an SMB share and remove it from the in-memory connection map.
 * On Windows, runs `net use /DELETE`. Silently succeeds if already disconnected.
 *
 * @param host - SMB server hostname or IP
 * @param share - Share name on the server
 */
export async function disconnectShare(host: string, share: string): Promise<void> {
    const id = connectionId(host, share);
    const uncPath = buildUncPath(host, share);

    if (os.platform() === 'win32') {
        try {
            await execPromise(`net use "${uncPath}" /DELETE /Y`);
        } catch {
            // May already be disconnected — that's fine
        }
    }

    connections.delete(id);
}

/**
 * List all currently tracked SMB connections.
 * @returns Array of active {@link SmbConnection} objects
 */
export function listConnections(): SmbConnection[] {
    return Array.from(connections.values());
}

/**
 * Test an SMB connection by connecting and verifying that the share is readable.
 * On success, the connection remains active for subsequent use.
 *
 * @param opts - Connection parameters (same as {@link connectShare})
 * @param opts.host - SMB server hostname or IP
 * @param opts.share - Share name on the server
 * @param opts.username - Authentication username
 * @param opts.password - Authentication password
 * @param opts.domain - Optional Windows domain for authentication
 * @returns Object with `success` flag, optional `error` message, and `fileCount` on success
 */
export async function testConnection(opts: {
    host: string;
    share: string;
    username: string;
    password: string;
    domain?: string;
}): Promise<{ success: boolean; error?: string; fileCount?: number }> {
    try {
        const conn = await connectShare(opts);

        // Verify we can actually list files
        const fs = await import('fs');
        const entries = fs.readdirSync(conn.uncPath);

        return { success: true, fileCount: entries.length };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Disconnect all managed shares. Called on server shutdown.
 */
export async function disconnectAll(): Promise<void> {
    const promises = Array.from(connections.values()).map(c =>
        disconnectShare(c.host, c.share).catch(() => {})
    );
    await Promise.all(promises);
}
