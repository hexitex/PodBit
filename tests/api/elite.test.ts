/**
 * API tests for routes/elite.ts
 *
 * Tests: GET /elite/stats, GET /elite/coverage (error → 404),
 *        GET /elite/gaps, GET /elite/candidates, GET /elite/nodes,
 *        GET /elite/terminals, POST /elite/rescan
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleElite = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../handlers/elite.js', () => ({
    handleElite: mockHandleElite,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: eliteRouter } = await import('../../routes/elite.js');

/** Express app with elite router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', eliteRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleElite.mockResolvedValue({ success: true });
});

describe('GET /elite/stats', () => {
    it('returns elite pool statistics', async () => {
        mockHandleElite.mockResolvedValue({ totalElite: 10, domains: 3 });
        const res = await request(buildApp()).get('/elite/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalElite');
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'stats' });
    });
});

describe('GET /elite/coverage', () => {
    it('returns coverage report on success', async () => {
        mockHandleElite.mockResolvedValue({ coverage: 0.75, targets: 8, covered: 6 });
        const res = await request(buildApp()).get('/elite/coverage');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('coverage');
    });

    it('returns 404 when handler returns error', async () => {
        mockHandleElite.mockResolvedValue({ error: 'No manifest loaded' });
        const res = await request(buildApp()).get('/elite/coverage');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No manifest loaded');
    });
});

describe('GET /elite/gaps', () => {
    it('returns uncovered manifest targets', async () => {
        mockHandleElite.mockResolvedValue({ gaps: ['target-a', 'target-b'] });
        const res = await request(buildApp()).get('/elite/gaps');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('gaps');
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'gaps' });
    });

    it('returns 404 when handler returns error', async () => {
        mockHandleElite.mockResolvedValue({ error: 'No manifest' });
        const res = await request(buildApp()).get('/elite/gaps');
        expect(res.status).toBe(404);
    });
});

describe('GET /elite/candidates', () => {
    it('returns bridging candidates', async () => {
        mockHandleElite.mockResolvedValue({ candidates: [] });
        const res = await request(buildApp()).get('/elite/candidates');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'candidates', limit: 10 });
    });

    it('passes custom limit', async () => {
        mockHandleElite.mockResolvedValue({ candidates: [] });
        await request(buildApp()).get('/elite/candidates?limit=25');
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'candidates', limit: 25 });
    });
});

describe('GET /elite/nodes', () => {
    it('returns elite nodes', async () => {
        mockHandleElite.mockResolvedValue([{ id: 'e1', content: 'breakthrough' }]);
        const res = await request(buildApp()).get('/elite/nodes');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'nodes' });
    });

    it('passes domain filter', async () => {
        mockHandleElite.mockResolvedValue([]);
        await request(buildApp()).get('/elite/nodes?domain=ideas');
        expect(mockHandleElite).toHaveBeenCalledWith(expect.objectContaining({ domain: 'ideas' }));
    });

    it('passes minGeneration and maxGeneration as integers', async () => {
        mockHandleElite.mockResolvedValue([]);
        await request(buildApp()).get('/elite/nodes?minGeneration=2&maxGeneration=5');
        expect(mockHandleElite).toHaveBeenCalledWith(expect.objectContaining({
            minGeneration: 2,
            maxGeneration: 5,
        }));
    });
});

describe('GET /elite/terminals', () => {
    it('returns terminal findings', async () => {
        mockHandleElite.mockResolvedValue({ terminals: [] });
        const res = await request(buildApp()).get('/elite/terminals');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'terminals' });
    });
});

describe('POST /elite/rescan', () => {
    it('triggers backfill scan with default limit', async () => {
        mockHandleElite.mockResolvedValue({ scanned: 12, promoted: 3 });
        const res = await request(buildApp()).post('/elite/rescan').send({});
        expect(res.status).toBe(200);
        expect(res.body.scanned).toBe(12);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'rescan', limit: 50 });
    });

    it('passes custom limit from body', async () => {
        mockHandleElite.mockResolvedValue({ scanned: 5 });
        await request(buildApp()).post('/elite/rescan').send({ limit: 100 });
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'rescan', limit: 100 });
    });
});
