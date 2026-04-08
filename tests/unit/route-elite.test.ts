/**
 * Unit tests for routes/elite.ts —
 * Elite Pool REST API routes: stats, coverage, gaps, candidates, nodes, terminals, rescan.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHandleElite = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../handlers/elite.js', () => ({
    handleElite: mockHandleElite,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const eliteRouter = (await import('../../routes/elite.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(eliteRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleElite.mockResolvedValue({ success: true });
});

// =============================================================================
// GET /elite/stats
// =============================================================================

describe('GET /elite/stats', () => {
    it('returns stats from handler', async () => {
        mockHandleElite.mockResolvedValue({ totalNodes: 42 });
        const res = await request(app).get('/elite/stats');
        expect(res.status).toBe(200);
        expect(res.body.totalNodes).toBe(42);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'stats' });
    });
});

// =============================================================================
// GET /elite/coverage
// =============================================================================

describe('GET /elite/coverage', () => {
    it('returns coverage report', async () => {
        mockHandleElite.mockResolvedValue({ coverage: 0.8 });
        const res = await request(app).get('/elite/coverage');
        expect(res.status).toBe(200);
        expect(res.body.coverage).toBe(0.8);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'coverage' });
    });

    it('returns 404 when result has error', async () => {
        mockHandleElite.mockResolvedValue({ error: 'No manifest configured' });
        const res = await request(app).get('/elite/coverage');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No manifest configured');
    });
});

// =============================================================================
// GET /elite/gaps
// =============================================================================

describe('GET /elite/gaps', () => {
    it('returns uncovered manifest targets', async () => {
        mockHandleElite.mockResolvedValue({ gaps: ['area-1'] });
        const res = await request(app).get('/elite/gaps');
        expect(res.status).toBe(200);
        expect(res.body.gaps).toEqual(['area-1']);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'gaps' });
    });

    it('returns 404 when result has error', async () => {
        mockHandleElite.mockResolvedValue({ error: 'No manifest' });
        const res = await request(app).get('/elite/gaps');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No manifest');
    });
});

// =============================================================================
// GET /elite/candidates
// =============================================================================

describe('GET /elite/candidates', () => {
    it('returns candidates with default limit', async () => {
        mockHandleElite.mockResolvedValue({ candidates: [] });
        const res = await request(app).get('/elite/candidates');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'candidates', limit: 10 });
    });

    it('passes custom limit from query', async () => {
        mockHandleElite.mockResolvedValue({ candidates: [] });
        const res = await request(app).get('/elite/candidates?limit=25');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'candidates', limit: 25 });
    });
});

// =============================================================================
// GET /elite/nodes
// =============================================================================

describe('GET /elite/nodes', () => {
    it('returns nodes with no filters', async () => {
        mockHandleElite.mockResolvedValue({ nodes: [] });
        const res = await request(app).get('/elite/nodes');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'nodes' });
    });

    it('passes domain filter', async () => {
        mockHandleElite.mockResolvedValue({ nodes: [] });
        const res = await request(app).get('/elite/nodes?domain=physics');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'nodes', domain: 'physics' })
        );
    });

    it('passes minGeneration and maxGeneration as integers', async () => {
        mockHandleElite.mockResolvedValue({ nodes: [] });
        const res = await request(app).get('/elite/nodes?minGeneration=2&maxGeneration=5');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'nodes', minGeneration: 2, maxGeneration: 5 })
        );
    });

    it('passes limit as integer', async () => {
        mockHandleElite.mockResolvedValue({ nodes: [] });
        const res = await request(app).get('/elite/nodes?limit=50');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'nodes', limit: 50 })
        );
    });
});

// =============================================================================
// GET /elite/terminals
// =============================================================================

describe('GET /elite/terminals', () => {
    it('returns terminal findings', async () => {
        mockHandleElite.mockResolvedValue({ terminals: [] });
        const res = await request(app).get('/elite/terminals');
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'terminals' });
    });
});

// =============================================================================
// POST /elite/rescan
// =============================================================================

describe('POST /elite/rescan', () => {
    it('triggers rescan with default limit', async () => {
        mockHandleElite.mockResolvedValue({ scanned: 50 });
        const res = await request(app).post('/elite/rescan').send({});
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'rescan', limit: 50 });
    });

    it('passes custom limit from body', async () => {
        mockHandleElite.mockResolvedValue({ scanned: 20 });
        const res = await request(app).post('/elite/rescan').send({ limit: 20 });
        expect(res.status).toBe(200);
        expect(mockHandleElite).toHaveBeenCalledWith({ action: 'rescan', limit: 20 });
    });

    it('handles handler errors via error middleware', async () => {
        mockHandleElite.mockRejectedValue(new Error('scan failed'));
        const res = await request(app).post('/elite/rescan').send({});
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('scan failed');
    });
});
