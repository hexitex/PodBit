/**
 * Unit tests for services/smb.ts — SMB connection management.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockExec = jest.fn<any>();
jest.unstable_mockModule('child_process', () => ({
    exec: mockExec,
}));

const mockPlatform = jest.fn<() => string>().mockReturnValue('win32');
jest.unstable_mockModule('os', () => ({
    default: { platform: mockPlatform },
    platform: mockPlatform,
}));

const mockReaddirSync = jest.fn<() => string[]>().mockReturnValue(['file1.txt', 'file2.pdf']);
jest.unstable_mockModule('fs', () => ({
    default: { readdirSync: mockReaddirSync },
    readdirSync: mockReaddirSync,
}));

const {
    connectShare,
    disconnectShare,
    listConnections,
    testConnection,
    disconnectAll,
} = await import('../../services/smb.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.mockReturnValue('win32');
    mockReaddirSync.mockReturnValue(['file1.txt', 'file2.pdf']);
    // Clear internal connections map by disconnecting all
    // (we can't access the map directly)
});

// Helper to make exec succeed
function execSucceeds(stdout = 'The command completed successfully.') {
    mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(null, stdout, '');
    });
}

// Helper to make exec fail
function execFails(message = 'System error 53') {
    mockExec.mockImplementation((_cmd: string, _opts: any, cb: Function) => {
        cb(new Error(message), '', message);
    });
}

// =============================================================================
// connectShare
// =============================================================================

describe('connectShare', () => {
    it('connects via net use on Windows', async () => {
        execSucceeds();

        const conn = await connectShare({
            host: '192.168.1.50',
            share: 'Documents',
            username: 'admin',
            password: 'secret',
        });

        expect(conn.host).toBe('192.168.1.50');
        expect(conn.share).toBe('Documents');
        expect(conn.uncPath).toBe('\\\\192.168.1.50\\Documents');
        expect(conn.username).toBe('admin');
        expect(conn.connectedAt).toBeTruthy();

        // Verify exec was called with powershell
        expect(mockExec).toHaveBeenCalled();
        const cmd = mockExec.mock.calls[0][0];
        expect(cmd).toContain('powershell');
        expect(cmd).toContain('net use');
    });

    it('includes domain in USER arg when provided', async () => {
        execSucceeds();

        await connectShare({
            host: 'server',
            share: 'data',
            username: 'user1',
            password: 'pass',
            domain: 'CORP',
        });

        const cmd = mockExec.mock.calls[0][0];
        expect(cmd).toContain('CORP');
    });

    it('throws on non-Windows platforms', async () => {
        mockPlatform.mockReturnValue('linux');

        await expect(connectShare({
            host: 'server',
            share: 'data',
            username: 'user',
            password: 'pass',
        })).rejects.toThrow(/Windows only/);
    });

    it('throws when net use fails', async () => {
        execFails('System error 53 has occurred.\nThe network path was not found.');

        await expect(connectShare({
            host: 'badhost',
            share: 'nope',
            username: 'user',
            password: 'pass',
        })).rejects.toThrow();
    });

    it('escapes single quotes in password', async () => {
        execSucceeds();

        await connectShare({
            host: 'server',
            share: 'data',
            username: 'user',
            password: "it's a p'ass",
        });

        // Find the connect call (contains 'net use' with the password, not /DELETE)
        const connectCall = mockExec.mock.calls.find((c: any) => c[0].includes("net use") && !c[0].includes('/DELETE'));
        expect(connectCall).toBeTruthy();
        // PowerShell single-quote escaping doubles them
        expect(connectCall![0]).toContain("it''s a p''ass");
    });

    it('tracks connection in listConnections', async () => {
        execSucceeds();

        await connectShare({
            host: 'mynas',
            share: 'share1',
            username: 'user',
            password: 'pass',
        });

        const conns = listConnections();
        expect(conns.length).toBeGreaterThanOrEqual(1);
        const found = conns.find(c => c.host === 'mynas' && c.share === 'share1');
        expect(found).toBeTruthy();
        expect(found!.uncPath).toBe('\\\\mynas\\share1');
    });

    it('disconnects existing before reconnecting', async () => {
        execSucceeds();

        // Connect twice to same share
        await connectShare({ host: 'srv', share: 's1', username: 'u', password: 'p' });
        await connectShare({ host: 'srv', share: 's1', username: 'u', password: 'newpass' });

        // exec should have been called 3 times: connect, disconnect, reconnect
        expect(mockExec.mock.calls.length).toBe(3);
    });
});

// =============================================================================
// disconnectShare
// =============================================================================

describe('disconnectShare', () => {
    it('runs net use /DELETE', async () => {
        execSucceeds();

        // First connect
        await connectShare({ host: 'srv', share: 'data', username: 'u', password: 'p' });
        mockExec.mockClear();

        execSucceeds();
        await disconnectShare('srv', 'data');

        const cmd = mockExec.mock.calls[0][0];
        expect(cmd).toContain('/DELETE');
        expect(cmd).toContain('\\\\srv\\data');
    });

    it('removes from listConnections', async () => {
        execSucceeds();
        await connectShare({ host: 'srv2', share: 'docs', username: 'u', password: 'p' });

        const before = listConnections().find(c => c.host === 'srv2');
        expect(before).toBeTruthy();

        await disconnectShare('srv2', 'docs');

        const after = listConnections().find(c => c.host === 'srv2');
        expect(after).toBeUndefined();
    });

    it('does not throw if share was not connected', async () => {
        execSucceeds();
        await expect(disconnectShare('unknown', 'share')).resolves.toBeUndefined();
    });
});

// =============================================================================
// testConnection
// =============================================================================

describe('testConnection', () => {
    it('returns success with file count when share is accessible', async () => {
        execSucceeds();
        mockReaddirSync.mockReturnValue(['a.txt', 'b.pdf', 'c.md']);

        const result = await testConnection({
            host: 'fileserver',
            share: 'research',
            username: 'admin',
            password: 'secret',
        });

        expect(result.success).toBe(true);
        expect(result.fileCount).toBe(3);
    });

    it('returns error when connection fails', async () => {
        execFails('Access denied');

        const result = await testConnection({
            host: 'badserver',
            share: 'locked',
            username: 'nobody',
            password: 'wrong',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Access denied');
    });
});

// =============================================================================
// disconnectAll
// =============================================================================

describe('disconnectAll', () => {
    it('disconnects all managed shares', async () => {
        execSucceeds();
        await connectShare({ host: 'a', share: 's1', username: 'u', password: 'p' });
        await connectShare({ host: 'b', share: 's2', username: 'u', password: 'p' });

        const before = listConnections().length;
        expect(before).toBeGreaterThanOrEqual(2);

        mockExec.mockClear();
        execSucceeds();
        await disconnectAll();

        // Should have called exec for each disconnection
        expect(mockExec.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});
