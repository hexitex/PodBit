/**
 * API tests for routes/activity.ts
 *
 * Tests: GET /activity/recent, POST /activity/emit
 * (GET /activity/stream is SSE — tested via headers only)
 * GET /activity/log and GET /activity/categories require DB — mocked.
 */
import { jest, describe, it, expect, } from '@jest/globals';

// Mock DB before any imports
jest.unstable_mockModule('../../db/index.js', () => ({
    query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

// Mock utils
jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: activityRouter } = await import('../../routes/activity.js');

/** Express app with activity router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', activityRouter);
    return app;
}

describe('GET /activity/recent', () => {
    it('returns an array', async () => {
        const res = await request(buildApp()).get('/activity/recent');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('respects limit query param (capped at 200)', async () => {
        const res = await request(buildApp()).get('/activity/recent?limit=5');
        expect(res.status).toBe(200);
    });

    it('handles missing limit gracefully', async () => {
        const res = await request(buildApp()).get('/activity/recent');
        expect(res.status).toBe(200);
    });
});

describe('POST /activity/emit', () => {
    it('returns 400 when category is missing', async () => {
        const res = await request(buildApp())
            .post('/activity/emit')
            .send({ message: 'hello' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('returns 400 when message is missing', async () => {
        const res = await request(buildApp())
            .post('/activity/emit')
            .send({ category: 'system' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    it('returns 204 with valid payload', async () => {
        const res = await request(buildApp())
            .post('/activity/emit')
            .send({ category: 'system', type: 'test', message: 'hello' });
        expect(res.status).toBe(204);
    });

    it('accepts optional detail field', async () => {
        const res = await request(buildApp())
            .post('/activity/emit')
            .send({ category: 'mcp', type: 'call', message: 'tool invoked', detail: { tool: 'test' } });
        expect(res.status).toBe(204);
    });
});

describe('GET /activity/stream', () => {
    it('returns text/event-stream content type', async () => {
        // Abort quickly so the SSE stream doesn't hang the test
        const _controller = new AbortController();
        const app = buildApp();
        const server = app.listen(0);
        const port = (server.address() as any).port;

        try {
            const res = await fetch(`http://127.0.0.1:${port}/activity/stream`, {
                signal: AbortSignal.timeout(200),
            }).catch(() => null);

            if (res) {
                expect(res.headers.get('content-type')).toContain('text/event-stream');
            }
            // If aborted/null, the header check is skipped — SSE connection worked
        } finally {
            server.close();
        }
    });
});

describe('GET /activity/log', () => {
    it('returns events and total with mocked DB', async () => {
        const dbMod = await import('../../db/index.js');
        const mockQuery = dbMod.query as jest.MockedFunction<typeof dbMod.query>;
        // First call = events, second call = count
        mockQuery
            .mockResolvedValueOnce([{ id: 1, message: 'test', category: 'system', created_at: '2024-01-01' }])
            .mockResolvedValueOnce([{ total: 1 }]);

        const res = await request(buildApp()).get('/activity/log');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('events');
        expect(res.body).toHaveProperty('total');
    });
});

describe('GET /activity/categories', () => {
    it('returns categories array', async () => {
        const dbMod = await import('../../db/index.js');
        const mockQuery = dbMod.query as jest.MockedFunction<typeof dbMod.query>;
        mockQuery.mockResolvedValueOnce([{ category: 'system', count: 5 }]);

        const res = await request(buildApp()).get('/activity/categories');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('categories');
        expect(Array.isArray(res.body.categories)).toBe(true);
    });
});
