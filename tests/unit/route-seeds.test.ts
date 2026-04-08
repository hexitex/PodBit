/**
 * Unit tests for routes/seeds.ts —
 * POST /seeds, POST /seeds/batch, GET /seeds, GET /seeds/domains,
 * DELETE /seeds/domain/:domain, GET /config/languages.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockCreateSeed = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });
const mockCreateSeeds = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetSeeds = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetDomains = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockArchiveSeeds = jest.fn<() => Promise<any>>().mockResolvedValue({ archived: 0 });

jest.unstable_mockModule('../../seeds.js', () => ({
    createSeed: mockCreateSeed,
    createSeeds: mockCreateSeeds,
    getSeeds: mockGetSeeds,
    getDomains: mockGetDomains,
    archiveSeeds: mockArchiveSeeds,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const seedsRouter = (await import('../../routes/seeds.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(seedsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockCreateSeed.mockResolvedValue({ id: 'n1' });
    mockCreateSeeds.mockResolvedValue([]);
    mockGetSeeds.mockResolvedValue([]);
    mockGetDomains.mockResolvedValue([]);
    mockArchiveSeeds.mockResolvedValue({ archived: 0 });
});

// =============================================================================
// POST /seeds
// =============================================================================

describe('POST /seeds', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(app).post('/seeds').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Content is required');
    });

    it('creates seed and returns node', async () => {
        mockCreateSeed.mockResolvedValue({ id: 'n1', content: 'test', node_type: 'seed' });

        const res = await request(app).post('/seeds').send({
            content: 'test content',
            domain: 'science',
            contributor: 'user',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.seed.id).toBe('n1');
        expect(mockCreateSeed).toHaveBeenCalledWith('test content', {
            domain: 'science',
            contributor: 'user',
        });
    });
});

// =============================================================================
// POST /seeds/batch
// =============================================================================

describe('POST /seeds/batch', () => {
    it('returns 400 when seeds is missing', async () => {
        const res = await request(app).post('/seeds/batch').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Seeds array is required');
    });

    it('returns 400 when seeds is not an array', async () => {
        const res = await request(app).post('/seeds/batch').send({ seeds: 'invalid' });

        expect(res.status).toBe(400);
    });

    it('creates batch of seeds and returns counts', async () => {
        mockCreateSeeds.mockResolvedValue([
            { success: true, id: 'n1' },
            { success: true, id: 'n2' },
            { success: false, error: 'duplicate' },
        ]);

        const res = await request(app).post('/seeds/batch').send({
            seeds: [
                { content: 'seed 1', domain: 'science' },
                { content: 'seed 2', domain: 'math' },
                { content: 'seed 3', domain: 'science' },
            ],
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.created).toBe(2);
        expect(res.body.failed).toBe(1);
    });
});

// =============================================================================
// GET /seeds
// =============================================================================

describe('GET /seeds', () => {
    it('returns seeds list', async () => {
        mockGetSeeds.mockResolvedValue([
            { id: 'n1', content: 'seed content', domain: 'science' },
        ]);

        const res = await request(app).get('/seeds');

        expect(res.status).toBe(200);
        expect(res.body.seeds).toHaveLength(1);
        expect(res.body.seeds[0].id).toBe('n1');
    });

    it('passes domain and limit params', async () => {
        mockGetSeeds.mockResolvedValue([]);

        await request(app).get('/seeds?domain=science&limit=20');

        expect(mockGetSeeds).toHaveBeenCalledWith({ domain: 'science', limit: 20 });
    });

    it('uses default limit of 100', async () => {
        mockGetSeeds.mockResolvedValue([]);

        await request(app).get('/seeds');

        expect(mockGetSeeds).toHaveBeenCalledWith({ domain: undefined, limit: 100 });
    });
});

// =============================================================================
// GET /seeds/domains
// =============================================================================

describe('GET /seeds/domains', () => {
    it('returns list of domains', async () => {
        mockGetDomains.mockResolvedValue(['science', 'math', 'physics']);

        const res = await request(app).get('/seeds/domains');

        expect(res.status).toBe(200);
        expect(res.body.domains).toEqual(['science', 'math', 'physics']);
    });
});

// =============================================================================
// DELETE /seeds/domain/:domain
// =============================================================================

describe('DELETE /seeds/domain/:domain', () => {
    it('archives seeds for domain', async () => {
        mockArchiveSeeds.mockResolvedValue({ archived: 5 });

        const res = await request(app).delete('/seeds/domain/science');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.archived).toBe(5);
        expect(mockArchiveSeeds).toHaveBeenCalledWith('science');
    });
});

// =============================================================================
// GET /config/languages
// =============================================================================

describe('GET /config/languages', () => {
    it('returns list of supported languages', async () => {
        const res = await request(app).get('/config/languages');

        expect(res.status).toBe(200);
        expect(res.body.languages).toBeDefined();
        expect(res.body.languages.some((l: any) => l.value === 'python')).toBe(true);
        expect(res.body.languages.some((l: any) => l.value === 'typescript')).toBe(true);
    });
});
