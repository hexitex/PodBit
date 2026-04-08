/**
 * Unit tests for routes/mcp-dispatch.ts —
 * GET /mcp/tools and POST /mcp/tool dispatch.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleToolCall = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ result: 'tool output' });

jest.unstable_mockModule('../../mcp/dispatch.js', () => ({
    handleToolCall: mockHandleToolCall,
}));

jest.unstable_mockModule('../../mcp/schemas.js', () => ({
    tools: [
        { name: 'graph_query', description: 'Query nodes', inputSchema: {} },
        { name: 'graph_get', description: 'Get node by id', inputSchema: {} },
    ],
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mcpRouter = (await import('../../routes/mcp-dispatch.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(mcpRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockHandleToolCall.mockResolvedValue({ result: 'tool output' });
});

// =============================================================================
// GET /mcp/tools
// =============================================================================

describe('GET /mcp/tools', () => {
    it('returns list of available tool schemas', async () => {
        const res = await request(app).get('/mcp/tools');

        expect(res.status).toBe(200);
        expect(res.body.tools).toHaveLength(2);
        expect(res.body.tools[0].name).toBe('graph_query');
        expect(res.body.tools[1].name).toBe('graph_get');
    });
});

// =============================================================================
// POST /mcp/tool
// =============================================================================

describe('POST /mcp/tool', () => {
    it('returns 400 when name is missing', async () => {
        const res = await request(app).post('/mcp/tool').send({ params: {} });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing or invalid "name"');
    });

    it('returns 400 when name is not a string', async () => {
        const res = await request(app).post('/mcp/tool').send({ name: 42, params: {} });

        expect(res.status).toBe(400);
    });

    it('dispatches tool call with name and params', async () => {
        mockHandleToolCall.mockResolvedValue({ nodes: [{ id: 'n1' }] });

        const res = await request(app).post('/mcp/tool').send({
            name: 'graph_query',
            params: { text: 'science', limit: 10 },
        });

        expect(res.status).toBe(200);
        expect(res.body.nodes).toHaveLength(1);
        expect(mockHandleToolCall).toHaveBeenCalledWith('graph_query', { text: 'science', limit: 10 });
    });

    it('passes empty object when params is missing', async () => {
        await request(app).post('/mcp/tool').send({ name: 'graph_query' });

        expect(mockHandleToolCall).toHaveBeenCalledWith('graph_query', {});
    });

    it('returns tool result directly', async () => {
        mockHandleToolCall.mockResolvedValue({ ok: true, count: 42 });

        const res = await request(app).post('/mcp/tool').send({ name: 'podbit_stats', params: {} });

        expect(res.body.ok).toBe(true);
        expect(res.body.count).toBe(42);
    });
});
