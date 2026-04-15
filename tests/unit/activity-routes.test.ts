/**
 * Unit tests for routes/activity.ts — SSE stream, REST endpoints,
 * and embedding-eval calibration routes.
 *
 * Tests route handler logic with mocked DB and event bus.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockEmitActivityLocal = jest.fn<(...args: any[]) => void>();
const mockOnActivity = jest.fn<(...args: any[]) => () => void>();
const mockGetRecentActivity = jest.fn<(...args: any[]) => any[]>();

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivityLocal: mockEmitActivityLocal,
    onActivity: mockOnActivity,
    getRecentActivity: mockGetRecentActivity,
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: {
        timeouts: { sseHeartbeatMs: 30000 },
    },
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const { default: router } = await import('../../routes/activity.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
});

/** Extract a route handler from the Express router by method + path */
function getHandler(method: string, path: string): any {
    const layer = (router as any).stack.find((l: any) =>
        l.route?.path === path && l.route?.methods[method],
    );
    if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route found`);
    // Get the last handler (after any middleware)
    const handlers = layer.route.stack;
    return handlers[handlers.length - 1].handle;
}

function mockReq(overrides: Record<string, any> = {}): any {
    return {
        query: {},
        params: {},
        body: {},
        on: jest.fn(),
        ...overrides,
    };
}

function mockRes(): any {
    const res: any = {};
    res.writeHead = jest.fn();
    res.write = jest.fn();
    res.json = jest.fn();
    res.status = jest.fn(() => res);
    res.end = jest.fn();
    return res;
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------
describe('GET /activity/stream', () => {
    it('sets correct SSE headers', () => {
        const handler = getHandler('get', '/activity/stream');
        const req = mockReq();
        const res = mockRes();
        mockGetRecentActivity.mockReturnValue([]);
        mockOnActivity.mockReturnValue(() => {});

        handler(req, res);

        expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
        }));
    });

    it('sends buffered recent events on connect', () => {
        const handler = getHandler('get', '/activity/stream');
        const req = mockReq();
        const res = mockRes();
        const events = [{ id: 1, message: 'test' }];
        mockGetRecentActivity.mockReturnValue(events);
        mockOnActivity.mockReturnValue(() => {});

        handler(req, res);

        expect(res.write).toHaveBeenCalledWith(
            expect.stringContaining('event: init'),
        );
    });

    it('subscribes to live events', () => {
        const handler = getHandler('get', '/activity/stream');
        const req = mockReq();
        const res = mockRes();
        mockGetRecentActivity.mockReturnValue([]);
        mockOnActivity.mockReturnValue(() => {});

        handler(req, res);

        expect(mockOnActivity).toHaveBeenCalled();
    });

    it('cleans up on disconnect', () => {
        const handler = getHandler('get', '/activity/stream');
        const req = mockReq();
        const res = mockRes();
        mockGetRecentActivity.mockReturnValue([]);
        const unsubscribe = jest.fn();
        mockOnActivity.mockReturnValue(unsubscribe);

        handler(req, res);

        // Simulate disconnect
        const closeHandler = req.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1];
        expect(closeHandler).toBeDefined();
        closeHandler();
        expect(unsubscribe).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// REST recent
// ---------------------------------------------------------------------------
describe('GET /activity/recent', () => {
    it('returns recent events with default limit', () => {
        const handler = getHandler('get', '/activity/recent');
        const req = mockReq();
        const res = mockRes();
        const events = [{ message: 'test' }];
        mockGetRecentActivity.mockReturnValue(events);

        handler(req, res);

        expect(mockGetRecentActivity).toHaveBeenCalledWith(100);
        expect(res.json).toHaveBeenCalledWith(events);
    });

    it('respects limit query parameter', () => {
        const handler = getHandler('get', '/activity/recent');
        const req = mockReq({ query: { limit: '50' } });
        const res = mockRes();
        mockGetRecentActivity.mockReturnValue([]);

        handler(req, res);

        expect(mockGetRecentActivity).toHaveBeenCalledWith(50);
    });

    it('caps limit at 200', () => {
        const handler = getHandler('get', '/activity/recent');
        const req = mockReq({ query: { limit: '999' } });
        const res = mockRes();
        mockGetRecentActivity.mockReturnValue([]);

        handler(req, res);

        expect(mockGetRecentActivity).toHaveBeenCalledWith(200);
    });
});

// ---------------------------------------------------------------------------
// Cross-process emit
// ---------------------------------------------------------------------------
describe('POST /activity/emit', () => {
    it('emits event with valid payload', () => {
        const handler = getHandler('post', '/activity/emit');
        const req = mockReq({
            body: { category: 'cycle', type: 'test', message: 'hello', detail: { foo: 1 } },
        });
        const res = mockRes();

        handler(req, res);

        expect(mockEmitActivityLocal).toHaveBeenCalledWith('cycle', 'test', 'hello', { foo: 1 });
        expect(res.status).toHaveBeenCalledWith(204);
    });

    it('returns 400 when category or message missing', () => {
        const handler = getHandler('post', '/activity/emit');
        const req = mockReq({ body: { type: 'test' } });
        const res = mockRes();

        handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('defaults type to "event" when not provided', () => {
        const handler = getHandler('post', '/activity/emit');
        const req = mockReq({
            body: { category: 'system', message: 'test msg' },
        });
        const res = mockRes();

        handler(req, res);

        expect(mockEmitActivityLocal).toHaveBeenCalledWith('system', 'event', 'test msg', undefined);
    });
});

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
describe('GET /activity/log', () => {
    it('queries with default parameters', async () => {
        const handler = getHandler('get', '/activity/log');
        const req = mockReq();
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([]) // events
            .mockResolvedValueOnce([{ total: 0 }]); // count

        await handler(req, res);

        expect(mockQuery).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            events: expect.any(Array),
            total: 0,
        }));
    });

    it('filters by category when provided', async () => {
        const handler = getHandler('get', '/activity/log');
        const req = mockReq({ query: { category: 'cycle' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await handler(req, res);

        const firstCall = mockQuery.mock.calls[0];
        expect(firstCall[0]).toContain('category = $1');
        expect(firstCall[1]).toContain('cycle');
    });

    it('filters by search text', async () => {
        const handler = getHandler('get', '/activity/log');
        const req = mockReq({ query: { search: 'embedding' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await handler(req, res);

        const firstCall = mockQuery.mock.calls[0];
        expect(firstCall[0]).toContain('message LIKE');
        expect(firstCall[1]).toContain('%embedding%');
    });

    it('parses JSON detail strings in results', async () => {
        const handler = getHandler('get', '/activity/log');
        const req = mockReq();
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([{ detail: '{"nodeId":"abc"}' }])
            .mockResolvedValueOnce([{ total: 1 }]);

        await handler(req, res);

        const result = res.json.mock.calls[0][0];
        expect(result.events[0].detail).toEqual({ nodeId: 'abc' });
    });

    it('caps days at 3', async () => {
        const handler = getHandler('get', '/activity/log');
        const req = mockReq({ query: { days: '30' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

        await handler(req, res);

        const firstCall = mockQuery.mock.calls[0][0];
        expect(firstCall).toContain('-3 days');
    });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
describe('GET /activity/categories', () => {
    it('returns category counts', async () => {
        const handler = getHandler('get', '/activity/categories');
        const req = mockReq();
        const res = mockRes();

        mockQuery.mockResolvedValueOnce([
            { category: 'cycle', count: 10 },
            { category: 'system', count: 5 },
        ]);

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({
            categories: expect.arrayContaining([
                expect.objectContaining({ category: 'cycle' }),
            ]),
        });
    });
});

// ---------------------------------------------------------------------------
// Embedding eval stats
// ---------------------------------------------------------------------------
describe('GET /embedding-eval/stats', () => {
    it('returns mode stats, percentiles, recent, and buckets', async () => {
        const handler = getHandler('get', '/embedding-eval/stats');
        const req = mockReq();
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([{ mode: 8, mode_name: 'drift', result: 'PASS', count: 5, min_score: 0.1, max_score: 0.9, avg_score: 0.5 }])
            .mockResolvedValueOnce([{ mode: 8, mode_name: 'drift', total: 5, avg_score: 0.5 }])
            .mockResolvedValueOnce([{ node_id: 'n1', mode: 8, mode_name: 'drift', result: 'PASS', score: 0.5 }])
            .mockResolvedValueOnce([{ mode: 8, mode_name: 'drift', bucket: 5, count: 3 }]);

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            modeStats: expect.any(Array),
            percentiles: expect.any(Array),
            recent: expect.any(Array),
            buckets: expect.any(Array),
        }));
    });

    it('filters by mode when provided', async () => {
        const handler = getHandler('get', '/embedding-eval/stats');
        const req = mockReq({ query: { mode: '8' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        await handler(req, res);

        const firstCall = mockQuery.mock.calls[0];
        expect(firstCall[0]).toContain('mode = $1');
        expect(firstCall[1]).toContain(8);
    });
});

// ---------------------------------------------------------------------------
// Embedding eval node detail
// ---------------------------------------------------------------------------
describe('GET /embedding-eval/node/:nodeId', () => {
    it('returns eval results and population control outcome', async () => {
        const handler = getHandler('get', '/embedding-eval/node/:nodeId');
        const req = mockReq({ params: { nodeId: 'test-node-123' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([{ mode: 8, result: 'PASS', score: 0.5 }]) // eval results
            .mockResolvedValueOnce([{ message: 'boost', detail: '{"action":"boost"}' }]); // pc outcome

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 'test-node-123',
            evalResults: expect.any(Array),
        }));
    });

    it('returns null population control when no outcome found', async () => {
        const handler = getHandler('get', '/embedding-eval/node/:nodeId');
        const req = mockReq({ params: { nodeId: 'test-node-123' } });
        const res = mockRes();

        mockQuery
            .mockResolvedValueOnce([]) // no eval results
            .mockResolvedValueOnce([]); // no pc outcome

        await handler(req, res);

        const result = res.json.mock.calls[0][0];
        expect(result.populationControl).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Calibration report
// ---------------------------------------------------------------------------
describe('GET /embedding-eval/report', () => {
    it('returns empty message when no eval results exist', async () => {
        const handler = getHandler('get', '/embedding-eval/report');
        const req = mockReq();
        const res = mockRes();

        mockQuery.mockResolvedValueOnce([]); // allChecks

        await handler(req, res);

        const result = res.json.mock.calls[0][0];
        expect(result.summary).toEqual([]);
        expect(result.nodes).toEqual([]);
    });

    it('builds per-node comparisons with agreement classification', async () => {
        const handler = getHandler('get', '/embedding-eval/report');
        const req = mockReq();
        const res = mockRes();

        // allChecks
        mockQuery.mockResolvedValueOnce([
            { node_id: 'n1', mode: 8, mode_name: 'drift', result: 'FAIL', score: 0.95, compared_to: 'test', shadow_mode: 1 },
        ]);
        // node info
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content_preview: 'test...', domain: 'sci', weight: 1.0, archived: 1, cull_evaluated_at: '2025-01-01' },
        ]);
        // pc events
        mockQuery.mockResolvedValueOnce([
            { type: 'population_control_archive', detail: JSON.stringify({ nodeId: 'n1', action: 'archive', compositeScore: 1.5 }) },
        ]);

        await handler(req, res);

        const result = res.json.mock.calls[0][0];
        expect(result.totalNodes).toBe(1);
        expect(result.nodes[0].agreement).toBe('true_positive'); // FAIL + ARCHIVE = true positive
        expect(result.summary.length).toBeGreaterThan(0);
    });

    it('classifies false_positive when embedding fails but consultant boosts', async () => {
        const handler = getHandler('get', '/embedding-eval/report');
        const req = mockReq();
        const res = mockRes();

        mockQuery.mockResolvedValueOnce([
            { node_id: 'n2', mode: 8, mode_name: 'drift', result: 'FAIL', score: 0.95, compared_to: 'test', shadow_mode: 1 },
        ]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n2', content_preview: 'good...', domain: 'sci', weight: 1.5, archived: 0, cull_evaluated_at: '2025-01-01' },
        ]);
        mockQuery.mockResolvedValueOnce([
            { type: 'population_control_boost', detail: JSON.stringify({ nodeId: 'n2', action: 'boost', compositeScore: 6.0 }) },
        ]);

        await handler(req, res);

        const result = res.json.mock.calls[0][0];
        expect(result.nodes[0].agreement).toBe('false_positive');
    });
});
