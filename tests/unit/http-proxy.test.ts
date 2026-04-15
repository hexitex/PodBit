/**
 * Unit tests for mcp/http-proxy.ts
 *
 * Tests: proxyToolCall behavior — proxy when MCP_STDIO_SERVER=1,
 * skip when not, fallback on fetch failure, project switch post-hook.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Save original env
const origEnv = { ...process.env };

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
(globalThis as any).fetch = mockFetch;

// Mock security
jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: jest.fn<() => Promise<string>>().mockResolvedValue('test-key'),
}));

// Mock DB switching (for project post-hook)
const mockSwitchProject = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetProjectDir = jest.fn<() => string>().mockReturnValue('/data/projects');
jest.unstable_mockModule('../../db.js', () => ({
    switchProject: mockSwitchProject,
    getProjectDir: mockGetProjectDir,
}));

const mockClearAllCaches = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../handlers/projects/services.js', () => ({
    clearAllCaches: mockClearAllCaches,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: jest.fn().mockReturnValue({ currentProject: 'test-project' }),
}));

jest.unstable_mockModule('../../config/ports.js', () => ({
    PORTS: { api: 4710, orchestrator: 4711, gui: 4712, partitionServer: 4713, proxy: 11435, mathLab: 4714, nnLab: 4715, critiqueLab: 4716 },
    localUrl: (port: number, path = '') => `http://localhost:${port}${path}`,
}));

const { proxyToolCall } = await import('../../mcp/http-proxy.js');

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...origEnv };
});

afterEach(() => {
    process.env = { ...origEnv };
});

describe('proxyToolCall', () => {
    it('returns null when not MCP_STDIO_SERVER', async () => {
        delete process.env.MCP_STDIO_SERVER;
        const result = await proxyToolCall('podbit.query', { text: 'test' });
        expect(result).toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('proxies to HTTP server when MCP_STDIO_SERVER=1', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({ nodes: [{ id: '1' }] }),
        } as any);

        const result = await proxyToolCall('podbit.query', { text: 'hello' });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/api/mcp/tool');
        expect(JSON.parse(opts.body)).toEqual({ name: 'podbit.query', params: { text: 'hello' } });
        expect(opts.headers['x-podbit-key']).toBe('test-key');
        expect(result).toEqual({ nodes: [{ id: '1' }] });
    });

    it('returns null on fetch failure (server unreachable)', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await proxyToolCall('podbit.query', { text: 'test' });
        expect(result).toBeNull();
    });

    it('switches MCP DB after successful project load', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({ success: true, name: 'test-project' }),
        } as any);

        await proxyToolCall('podbit_projects', { action: 'load', name: 'test-project' });

        expect(mockSwitchProject).toHaveBeenCalled();
        expect(mockClearAllCaches).toHaveBeenCalled();
    });

    it('switches MCP DB after successful project new', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({ success: true, name: 'new-proj' }),
        } as any);

        await proxyToolCall('podbit_projects', { action: 'new', name: 'new-proj' });

        expect(mockSwitchProject).toHaveBeenCalled();
    });

    it('does not switch DB for non-project tools', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({ nodes: [] }),
        } as any);

        await proxyToolCall('podbit.query', { text: 'test' });

        expect(mockSwitchProject).not.toHaveBeenCalled();
    });

    it('does not switch DB when project action is read-only (list)', async () => {
        process.env.MCP_STDIO_SERVER = '1';
        mockFetch.mockResolvedValue({
            json: () => Promise.resolve({ projects: {} }),
        } as any);

        await proxyToolCall('podbit_projects', { action: 'list' });

        expect(mockSwitchProject).not.toHaveBeenCalled();
    });
});
