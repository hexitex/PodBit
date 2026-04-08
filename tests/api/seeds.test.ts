/**
 * API tests for routes/seeds.ts
 *
 * Tests: POST /seeds, POST /seeds/batch, GET /seeds,
 *        GET /seeds/domains, DELETE /seeds/domain/:domain,
 *        GET /config/languages
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCreateSeed = jest.fn<() => Promise<any>>();
const mockCreateSeeds = jest.fn<() => Promise<any[]>>();
const mockGetSeeds = jest.fn<() => Promise<any[]>>();
const mockGetDomains = jest.fn<() => Promise<any[]>>();
const mockArchiveSeeds = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../seeds.js', () => ({
    createSeed: mockCreateSeed,
    createSeeds: mockCreateSeeds,
    getSeeds: mockGetSeeds,
    getDomains: mockGetDomains,
    archiveSeeds: mockArchiveSeeds,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: seedsRouter } = await import('../../routes/seeds.js');

/** Express app with seeds router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', seedsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSeed.mockResolvedValue({ id: 'uuid-1', content: 'test content' });
    mockCreateSeeds.mockResolvedValue([{ success: true, id: 'uuid-1' }]);
    mockGetSeeds.mockResolvedValue([]);
    mockGetDomains.mockResolvedValue(['domain-a', 'domain-b']);
    mockArchiveSeeds.mockResolvedValue({ archived: 1 });
});

// =============================================================================
// POST /seeds
// =============================================================================

describe('POST /seeds', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(buildApp()).post('/seeds').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content/i);
    });

    it('returns 400 when body is empty', async () => {
        const res = await request(buildApp()).post('/seeds').send({});
        expect(res.status).toBe(400);
    });

    it('creates a seed and returns it', async () => {
        const res = await request(buildApp())
            .post('/seeds')
            .send({ content: 'my seed content' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.seed).toBeDefined();
        expect(mockCreateSeed).toHaveBeenCalledWith('my seed content', { domain: undefined, contributor: undefined });
    });

    it('passes domain and contributor when provided', async () => {
        await request(buildApp())
            .post('/seeds')
            .send({ content: 'test', domain: 'ideas', contributor: 'human' });
        expect(mockCreateSeed).toHaveBeenCalledWith('test', { domain: 'ideas', contributor: 'human' });
    });
});

// =============================================================================
// POST /seeds/batch
// =============================================================================

describe('POST /seeds/batch', () => {
    it('returns 400 when seeds is missing', async () => {
        const res = await request(buildApp()).post('/seeds/batch').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/seeds/i);
    });

    it('returns 400 when seeds is not an array', async () => {
        const res = await request(buildApp())
            .post('/seeds/batch')
            .send({ seeds: 'not-an-array' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/seeds/i);
    });

    it('returns 400 when seeds is a number', async () => {
        const res = await request(buildApp())
            .post('/seeds/batch')
            .send({ seeds: 42 });
        expect(res.status).toBe(400);
    });

    it('creates seeds and returns summary', async () => {
        mockCreateSeeds.mockResolvedValue([
            { success: true, id: 'a' },
            { success: false, error: 'dup' },
        ]);
        const res = await request(buildApp())
            .post('/seeds/batch')
            .send({ seeds: [{ content: 'seed A' }, { content: 'seed B' }] });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.created).toBe(1);
        expect(res.body.failed).toBe(1);
        expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('accepts empty array', async () => {
        mockCreateSeeds.mockResolvedValue([]);
        const res = await request(buildApp())
            .post('/seeds/batch')
            .send({ seeds: [] });
        expect(res.status).toBe(200);
        expect(res.body.created).toBe(0);
    });
});

// =============================================================================
// GET /seeds
// =============================================================================

describe('GET /seeds', () => {
    it('returns seeds array', async () => {
        mockGetSeeds.mockResolvedValue([{ id: 'a', content: 'hello' }]);
        const res = await request(buildApp()).get('/seeds');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('seeds');
        expect(Array.isArray(res.body.seeds)).toBe(true);
    });

    it('passes domain filter when provided', async () => {
        await request(buildApp()).get('/seeds?domain=ideas');
        expect(mockGetSeeds).toHaveBeenCalledWith({ domain: 'ideas', limit: 100 });
    });

    it('uses default limit of 100', async () => {
        await request(buildApp()).get('/seeds');
        expect(mockGetSeeds).toHaveBeenCalledWith({ domain: undefined, limit: 100 });
    });
});

// =============================================================================
// GET /seeds/domains
// =============================================================================

describe('GET /seeds/domains', () => {
    it('returns domains array', async () => {
        const res = await request(buildApp()).get('/seeds/domains');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('domains');
        expect(Array.isArray(res.body.domains)).toBe(true);
    });
});

// =============================================================================
// DELETE /seeds/domain/:domain
// =============================================================================

describe('DELETE /seeds/domain/:domain', () => {
    it('archives seeds for the specified domain', async () => {
        mockArchiveSeeds.mockResolvedValue({ archived: 3 });
        const res = await request(buildApp()).delete('/seeds/domain/ideas');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockArchiveSeeds).toHaveBeenCalledWith('ideas');
    });
});

// =============================================================================
// GET /config/languages
// =============================================================================

describe('GET /config/languages', () => {
    it('returns a languages array with correct shape', async () => {
        const res = await request(buildApp()).get('/config/languages');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('languages');
        expect(Array.isArray(res.body.languages)).toBe(true);
        expect(res.body.languages.length).toBeGreaterThan(0);
    });

    it('each language has value and label fields', async () => {
        const res = await request(buildApp()).get('/config/languages');
        for (const lang of res.body.languages) {
            expect(lang).toHaveProperty('value');
            expect(lang).toHaveProperty('label');
        }
    });

    it('includes javascript and typescript', async () => {
        const res = await request(buildApp()).get('/config/languages');
        const values = res.body.languages.map((l: any) => l.value);
        expect(values).toContain('javascript');
        expect(values).toContain('typescript');
    });

    it('does not require any auth or DB — pure static response', async () => {
        // Call twice to confirm determinism
        const r1 = await request(buildApp()).get('/config/languages');
        const r2 = await request(buildApp()).get('/config/languages');
        expect(r1.body).toEqual(r2.body);
    });
});
