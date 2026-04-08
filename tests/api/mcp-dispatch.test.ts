/**
 * API tests for routes/mcp-dispatch.ts
 *
 * Tests: GET /mcp/tools (schema list), POST /mcp/tool (validation, dispatch)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleToolCall = jest.fn<() => Promise<any>>().mockResolvedValue({ result: 'ok' });
const MOCK_TOOLS = [
    { name: 'podbit_query', description: 'Query the graph' },
    { name: 'podbit_stats', description: 'Graph statistics' },
];

jest.unstable_mockModule('../../mcp/dispatch.js', () => ({
    handleToolCall: mockHandleToolCall,
}));

jest.unstable_mockModule('../../mcp/schemas.js', () => ({
    tools: MOCK_TOOLS,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: mcpDispatchRouter } = await import('../../routes/mcp-dispatch.js');

/** Express app with MCP dispatch router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', mcpDispatchRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleToolCall.mockResolvedValue({ result: 'ok' });
});

// =============================================================================
// GET /mcp/tools
// =============================================================================

describe('GET /mcp/tools', () => {
    it('returns the tool schema list', async () => {
        const res = await request(buildApp()).get('/mcp/tools');
        expect(res.status).toBe(200);
        expect(res.body.tools).toEqual(MOCK_TOOLS);
    });

    it('returns array of tools with name field', async () => {
        const res = await request(buildApp()).get('/mcp/tools');
        expect(Array.isArray(res.body.tools)).toBe(true);
        expect(res.body.tools[0].name).toBe('podbit_query');
    });
});

// =============================================================================
// POST /mcp/tool
// =============================================================================

describe('POST /mcp/tool', () => {
    it('returns 400 when name is missing', async () => {
        const res = await request(buildApp()).post('/mcp/tool').send({ params: {} });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('name');
    });

    it('returns 400 when name is not a string', async () => {
        const res = await request(buildApp()).post('/mcp/tool').send({ name: 42, params: {} });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('name');
    });

    it('returns 400 when body is empty', async () => {
        const res = await request(buildApp()).post('/mcp/tool').send({});
        expect(res.status).toBe(400);
    });

    it('dispatches tool call and returns result', async () => {
        mockHandleToolCall.mockResolvedValue({ nodes: [{ id: 'n-1', content: 'test' }] });
        const res = await request(buildApp())
            .post('/mcp/tool')
            .send({ name: 'podbit_query', params: { text: 'AI safety' } });
        expect(res.status).toBe(200);
        expect(res.body.nodes).toHaveLength(1);
        expect(mockHandleToolCall).toHaveBeenCalledWith('podbit_query', { text: 'AI safety' });
    });

    it('passes empty object when params is omitted', async () => {
        const res = await request(buildApp()).post('/mcp/tool').send({ name: 'podbit_stats' });
        expect(res.status).toBe(200);
        expect(mockHandleToolCall).toHaveBeenCalledWith('podbit_stats', {});
    });

    it('returns tool result directly', async () => {
        mockHandleToolCall.mockResolvedValue({ totalNodes: 42, domains: 3 });
        const res = await request(buildApp())
            .post('/mcp/tool')
            .send({ name: 'podbit_stats', params: { days: 7 } });
        expect(res.body.totalNodes).toBe(42);
        expect(res.body.domains).toBe(3);
    });
});
