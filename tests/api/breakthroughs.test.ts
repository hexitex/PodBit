/**
 * API tests for routes/breakthrough-registry.ts
 *
 * Tests: GET /breakthroughs, GET /breakthroughs/stats,
 *        GET /breakthroughs/:id/documentation,
 *        POST /breakthroughs/:id/rebuild-documentation,
 *        PATCH /breakthroughs/:id/scores
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQueryRegistry = jest.fn<() => Promise<any>>().mockResolvedValue({ items: [], total: 0 });
const mockRegistryStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0, recent: 0 });
const mockGetDocumentation = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockRebuildDocumentation = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockUpdateBreakthroughScores = jest.fn<() => Promise<any>>().mockResolvedValue({ updated: true });

jest.unstable_mockModule('../../handlers/breakthrough-registry.js', () => ({
    queryRegistry: mockQueryRegistry,
    registryStats: mockRegistryStats,
    getDocumentation: mockGetDocumentation,
    rebuildDocumentation: mockRebuildDocumentation,
    updateBreakthroughScores: mockUpdateBreakthroughScores,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: breakthroughsRouter } = await import('../../routes/breakthrough-registry.js');

/** Express app with breakthroughs router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', breakthroughsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQueryRegistry.mockResolvedValue({ items: [], total: 0 });
    mockRegistryStats.mockResolvedValue({ total: 0, recent: 0 });
    mockGetDocumentation.mockResolvedValue(null);
});

describe('GET /breakthroughs', () => {
    it('returns list of breakthroughs', async () => {
        mockQueryRegistry.mockResolvedValue({ items: [{ id: 'bt-1', content: 'insight' }], total: 1 });
        const res = await request(buildApp()).get('/breakthroughs');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('total');
    });

    it('passes filters to queryRegistry', async () => {
        await request(buildApp()).get('/breakthroughs?domain=ideas&limit=10');
        expect(mockQueryRegistry).toHaveBeenCalledWith(expect.objectContaining({
            domain: 'ideas',
            limit: 10,
        }));
    });

    it('passes promotionSource filter', async () => {
        await request(buildApp()).get('/breakthroughs?promotionSource=autonomous');
        expect(mockQueryRegistry).toHaveBeenCalledWith(expect.objectContaining({
            promotionSource: 'autonomous',
        }));
    });
});

describe('GET /breakthroughs/stats', () => {
    it('returns aggregate statistics', async () => {
        mockRegistryStats.mockResolvedValue({ total: 5, recent: 2, domains: 3 });
        const res = await request(buildApp()).get('/breakthroughs/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total');
    });

    it('passes project and days params', async () => {
        await request(buildApp()).get('/breakthroughs/stats?project=myproject&days=30');
        expect(mockRegistryStats).toHaveBeenCalledWith(expect.objectContaining({
            project: 'myproject',
            days: 30,
        }));
    });
});

describe('GET /breakthroughs/:id/documentation', () => {
    it('returns documentation:null when not found', async () => {
        mockGetDocumentation.mockResolvedValue(null);
        const res = await request(buildApp()).get('/breakthroughs/bt-1/documentation');
        expect(res.status).toBe(200);
        expect(res.body.documentation).toBeNull();
    });

    it('returns documentation when found', async () => {
        mockGetDocumentation.mockResolvedValue({ content: '# Breakthrough\n\nKey finding.' });
        const res = await request(buildApp()).get('/breakthroughs/bt-1/documentation');
        expect(res.status).toBe(200);
        expect(res.body.documentation).toHaveProperty('content');
    });
});

describe('POST /breakthroughs/:id/rebuild-documentation', () => {
    it('rebuilds documentation and returns result', async () => {
        mockRebuildDocumentation.mockResolvedValue({ success: true, rebuilt: true });
        const res = await request(buildApp())
            .post('/breakthroughs/bt-1/rebuild-documentation');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRebuildDocumentation).toHaveBeenCalledWith('bt-1');
    });
});

describe('PATCH /breakthroughs/:id/scores', () => {
    it('updates validation scores', async () => {
        mockUpdateBreakthroughScores.mockResolvedValue({ updated: true });
        const res = await request(buildApp())
            .patch('/breakthroughs/bt-1/scores')
            .send({ synthesis: 0.8, novelty: 0.7 });
        expect(res.status).toBe(200);
        expect(res.body.updated).toBe(true);
        expect(mockUpdateBreakthroughScores).toHaveBeenCalledWith('bt-1',
            expect.objectContaining({ synthesis: 0.8, novelty: 0.7 })
        );
    });
});
