/**
 * Deep coverage tests for services/event-bus.ts
 *
 * Covers branches NOT exercised by event-bus.test.ts:
 * - Buffer overflow (>100 events triggers shift)
 * - MCP cross-process forwarding (isMcpProcess=true path)
 * - getForwardKey caching and error handling
 * - forwardToHttpServer fetch call and error suppression
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Non-MCP tests (default env, no MCP_STDIO_SERVER) ────────────────────────

describe('event-bus buffer overflow', () => {
    let emitActivity: typeof import('../../services/event-bus.js').emitActivity;
    let emitActivityLocal: typeof import('../../services/event-bus.js').emitActivityLocal;
    let getRecentActivity: typeof import('../../services/event-bus.js').getRecentActivity;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('buffer caps at 100 events via emitActivity', async () => {
        // Fresh import to get a clean buffer
        const mod = await import('../../services/event-bus.js');
        emitActivity = mod.emitActivity;
        getRecentActivity = mod.getRecentActivity;

        // The existing tests already emitted some events into this module's buffer.
        // We need to fill past 100 total to trigger shift().
        // Get current count and emit enough to exceed BUFFER_SIZE=100.
        const currentCount = getRecentActivity().length;
        const toEmit = 101 - currentCount + 5; // emit enough to guarantee overflow

        for (let i = 0; i < toEmit; i++) {
            emitActivity('system', 'overflow.test', `overflow-${i}`);
        }

        const recent = getRecentActivity();
        expect(recent.length).toBeLessThanOrEqual(100);
    });

    it('buffer caps at 100 events via emitActivityLocal', async () => {
        const mod = await import('../../services/event-bus.js');
        emitActivityLocal = mod.emitActivityLocal;
        getRecentActivity = mod.getRecentActivity;

        const currentCount = getRecentActivity().length;
        const toEmit = Math.max(101 - currentCount + 5, 10);

        for (let i = 0; i < toEmit; i++) {
            emitActivityLocal('system', 'overflow.local', `local-overflow-${i}`);
        }

        const recent = getRecentActivity();
        expect(recent.length).toBeLessThanOrEqual(100);
        // The most recent event should be the last one emitted
        expect(recent[recent.length - 1].message).toContain('local-overflow-');
    });
});

// ── MCP forwarding tests (MCP_STDIO_SERVER=1) ──────────────────────────────

describe('event-bus MCP forwarding', () => {
    const originalEnv = { ...process.env };
    let mockFetch: jest.Mock;
    let mockGetSecurityKey: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset modules so event-bus re-evaluates env
        jest.resetModules();
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('forwards to HTTP server when MCP_STDIO_SERVER=1', async () => {
        // Set up env before importing
        process.env.MCP_STDIO_SERVER = '1';
        process.env.HOST = '127.0.0.1';
        process.env.API_PORT = '9999';

        mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key-123');

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: mockGetSecurityKey,
        }));

        // Mock global fetch
        mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivity } = await import('../../services/event-bus.js');

        emitActivity('synthesis', 'test.forward', 'forwarded message', { foo: 'bar' });

        // Wait for async forwarding
        await new Promise(r => setTimeout(r, 100));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://127.0.0.1:9999/api/activity/emit');
        expect(opts.method).toBe('POST');
        expect(opts.headers).toEqual(
            expect.objectContaining({
                'Content-Type': 'application/json',
                'x-podbit-key': 'test-key-123',
            }),
        );
        const body = JSON.parse(opts.body as string);
        expect(body.category).toBe('synthesis');
        expect(body.type).toBe('test.forward');
        expect(body.message).toBe('forwarded message');
        expect(body.detail).toEqual({ foo: 'bar' });
    });

    it('uses default host/port when env vars are not set', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        delete process.env.HOST;
        delete process.env.API_PORT;

        mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('key');

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: mockGetSecurityKey,
        }));

        mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivity } = await import('../../services/event-bus.js');
        emitActivity('mcp', 'test.defaults', 'default host/port');

        await new Promise(r => setTimeout(r, 100));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        // Default API port is now 4710 (canonical 4710-4716 block, see config/port-defaults.json).
        expect(url).toBe('http://localhost:4710/api/activity/emit');
    });

    it('caches the security key on subsequent calls', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        process.env.HOST = 'localhost';
        process.env.API_PORT = '3000';

        mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('cached-key');

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: mockGetSecurityKey,
        }));

        mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivity } = await import('../../services/event-bus.js');

        emitActivity('system', 'cache.1', 'first');
        await new Promise(r => setTimeout(r, 100));

        emitActivity('system', 'cache.2', 'second');
        await new Promise(r => setTimeout(r, 100));

        // getSecurityKey should only be called once due to caching
        expect(mockGetSecurityKey).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('handles getSecurityKey failure gracefully (uses empty string)', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        process.env.HOST = 'localhost';
        process.env.API_PORT = '3000';

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: jest.fn<() => Promise<string>>().mockRejectedValue(
                new Error('security module unavailable'),
            ),
        }));

        mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivity } = await import('../../services/event-bus.js');
        emitActivity('system', 'key.fail', 'key failure test');

        await new Promise(r => setTimeout(r, 100));

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect((opts.headers as Record<string, string>)['x-podbit-key']).toBe('');
    });

    it('silently ignores fetch failure (HTTP server down)', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        process.env.HOST = 'localhost';
        process.env.API_PORT = '3000';

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: jest.fn<() => Promise<string>>().mockResolvedValue('key'),
        }));

        mockFetch = jest.fn<() => Promise<Response>>().mockRejectedValue(
            new Error('ECONNREFUSED'),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivity } = await import('../../services/event-bus.js');

        // Should not throw
        expect(() => {
            emitActivity('system', 'fetch.fail', 'fetch failure test');
        }).not.toThrow();

        await new Promise(r => setTimeout(r, 100));

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('emitActivityLocal does NOT forward even when MCP_STDIO_SERVER=1', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        process.env.HOST = 'localhost';
        process.env.API_PORT = '3000';

        jest.unstable_mockModule('../../core/security.js', () => ({
            getSecurityKey: jest.fn<() => Promise<string>>().mockResolvedValue('key'),
        }));

        mockFetch = jest.fn<() => Promise<Response>>().mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
        globalThis.fetch = mockFetch as any;

        const { emitActivityLocal } = await import('../../services/event-bus.js');
        emitActivityLocal('kb', 'local.only', 'should not forward');

        await new Promise(r => setTimeout(r, 100));

        expect(mockFetch).not.toHaveBeenCalled();
    });
});
