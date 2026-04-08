/**
 * Unit tests for handlers/generic-api.ts — podbit.api gateway
 *
 * Tests: tools, schema, call, routes, http actions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockFetch = jest.fn<typeof fetch>();
(globalThis as any).fetch = mockFetch;

// Mock security
jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: jest.fn<() => Promise<string>>().mockResolvedValue('test-key'),
}));

// Mock schemas
const MOCK_TOOLS = [
    { name: 'podbit.query', description: 'Search nodes', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
    { name: 'podbit.get', description: 'Get node by ID', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
];
jest.unstable_mockModule('../../mcp/schemas.js', () => ({ tools: MOCK_TOOLS }));

// Mock dispatch
const mockHandleToolCall = jest.fn<() => Promise<any>>().mockResolvedValue({ nodes: [] });
jest.unstable_mockModule('../../mcp/dispatch.js', () => ({
    handleToolCall: mockHandleToolCall,
}));

// Mock route metadata
jest.unstable_mockModule('../../routes/route-metadata.js', () => ({
    getRouteMetadata: () => [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'GET', path: '/resonance/nodes', description: 'Query nodes' },
    ],
}));

jest.unstable_mockModule('../../config/ports.js', () => ({
    PORTS: { api: 4710, orchestrator: 4711, gui: 4712, partitionServer: 4713, proxy: 11435, mathLab: 4714, nnLab: 4715, critiqueLab: 4716 },
    localUrl: (port: number, path = '') => `http://localhost:${port}${path}`,
}));

const { handleGenericApi } = await import('../../handlers/generic-api.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleToolCall.mockResolvedValue({ nodes: [] });
});

// =============================================================================
// ACTION: tools
// =============================================================================

describe('action: tools', () => {
    it('returns list of tool names and descriptions', async () => {
        const result = await handleGenericApi({ action: 'tools' });
        expect(result.tools).toHaveLength(2);
        expect(result.tools[0].name).toBe('podbit.query');
        expect(result.tools[0].description).toBe('Search nodes');
        expect(result.count).toBe(2);
        expect(result.hint).toBeDefined();
    });

    it('does not include inputSchema in tool list (keep it small)', async () => {
        const result = await handleGenericApi({ action: 'tools' });
        expect(result.tools[0].inputSchema).toBeUndefined();
    });
});

// =============================================================================
// ACTION: schema
// =============================================================================

describe('action: schema', () => {
    it('returns full schema for a known tool', async () => {
        const result = await handleGenericApi({ action: 'schema', tool: 'podbit.get' });
        expect(result.name).toBe('podbit.get');
        expect(result.inputSchema).toBeDefined();
        expect(result.inputSchema.properties.id).toBeDefined();
    });

    it('returns error for unknown tool', async () => {
        const result = await handleGenericApi({ action: 'schema', tool: 'podbit.nonexistent' });
        expect(result.error).toContain('not found');
    });

    it('returns error when tool param is missing', async () => {
        const result = await handleGenericApi({ action: 'schema' });
        expect(result.error).toContain('tool is required');
    });
});

// =============================================================================
// ACTION: call
// =============================================================================

describe('action: call', () => {
    it('dispatches to handleToolCall with correct name and params', async () => {
        mockHandleToolCall.mockResolvedValue({ nodes: [{ id: '1' }] });
        const result = await handleGenericApi({
            action: 'call',
            tool: 'podbit.query',
            params: { text: 'hello' },
        });
        expect(mockHandleToolCall).toHaveBeenCalledWith('podbit.query', { text: 'hello' });
        expect(result.nodes).toHaveLength(1);
    });

    it('returns error when tool is missing', async () => {
        const result = await handleGenericApi({ action: 'call', params: {} });
        expect(result.error).toContain('tool is required');
    });

    it('returns error when params is missing', async () => {
        const result = await handleGenericApi({ action: 'call', tool: 'podbit.query' });
        expect(result.error).toContain('params is required');
    });
});

// =============================================================================
// ACTION: routes
// =============================================================================

describe('action: routes', () => {
    it('returns route metadata array', async () => {
        const result = await handleGenericApi({ action: 'routes' });
        expect(result.routes).toHaveLength(2);
        expect(result.routes[0]).toEqual({ method: 'GET', path: '/health', description: 'Health check' });
        expect(result.hint).toBeDefined();
    });
});

// =============================================================================
// ACTION: http
// =============================================================================

describe('action: http', () => {
    it('makes GET request to the specified path', async () => {
        mockFetch.mockResolvedValue({
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ status: 'ok' }),
        } as any);

        const result = await handleGenericApi({ action: 'http', method: 'GET', path: '/health' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/api/health');
        expect(result.status).toBe('ok');
    });

    it('sends body for POST requests', async () => {
        mockFetch.mockResolvedValue({
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ created: true }),
        } as any);

        await handleGenericApi({
            action: 'http',
            method: 'POST',
            path: '/resonance/nodes',
            body: { content: 'test', nodeType: 'seed' },
        });

        const [, opts] = mockFetch.mock.calls[0] as any[];
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toEqual({ content: 'test', nodeType: 'seed' });
    });

    it('appends query params to URL', async () => {
        mockFetch.mockResolvedValue({
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve({ nodes: [] }),
        } as any);

        await handleGenericApi({
            action: 'http',
            path: '/resonance/nodes',
            query: { domain: 'biology', limit: '5' },
        });

        const [url] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('domain=biology');
        expect(url).toContain('limit=5');
    });

    it('returns error when path is missing', async () => {
        const result = await handleGenericApi({ action: 'http', method: 'GET' });
        expect(result.error).toContain('path is required');
    });

    it('handles fetch failure gracefully', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
        const result = await handleGenericApi({ action: 'http', path: '/health' });
        expect(result.error).toContain('HTTP request failed');
    });

    it('handles non-JSON response', async () => {
        mockFetch.mockResolvedValue({
            status: 200,
            headers: { get: () => 'text/plain' },
            text: () => Promise.resolve('OK'),
        } as any);

        const result = await handleGenericApi({ action: 'http', path: '/health' });
        expect(result.status).toBe(200);
        expect(result.body).toBe('OK');
    });
});

// =============================================================================
// UNKNOWN ACTION
// =============================================================================

describe('unknown action', () => {
    it('returns error with valid actions list', async () => {
        const result = await handleGenericApi({ action: 'invalid' });
        expect(result.error).toContain('Unknown action');
        expect(result.error).toContain('tools');
        expect(result.error).toContain('http');
    });
});
