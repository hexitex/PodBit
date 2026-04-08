/**
 * API tests for routes/keywords.ts
 *
 * Tests: POST /keywords/backfill-domains, POST /keywords/backfill-nodes,
 *        GET /keywords/node/:id
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockBackfillDomainSynonyms = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 3 });
const mockBackfillNodeKeywords = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 10, updated: 8 });
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core/keywords.js', () => ({
    backfillDomainSynonyms: mockBackfillDomainSynonyms,
    backfillNodeKeywords: mockBackfillNodeKeywords,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: keywordsRouter } = await import('../../routes/keywords.js');

/** Express app with keywords router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', keywordsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockBackfillDomainSynonyms.mockResolvedValue({ processed: 3 });
    mockBackfillNodeKeywords.mockResolvedValue({ processed: 10, updated: 8 });
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /keywords/backfill-domains
// =============================================================================

describe('POST /keywords/backfill-domains', () => {
    it('returns success and processed count', async () => {
        mockBackfillDomainSynonyms.mockResolvedValue({ processed: 5, skipped: 1 });
        const res = await request(buildApp()).post('/keywords/backfill-domains');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.processed).toBe(5);
        expect(res.body.skipped).toBe(1);
    });

    it('calls backfillDomainSynonyms', async () => {
        await request(buildApp()).post('/keywords/backfill-domains');
        expect(mockBackfillDomainSynonyms).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
        mockBackfillDomainSynonyms.mockRejectedValue(new Error('LLM unavailable'));
        const res = await request(buildApp()).post('/keywords/backfill-domains');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('LLM unavailable');
    });
});

// =============================================================================
// POST /keywords/backfill-nodes
// =============================================================================

describe('POST /keywords/backfill-nodes', () => {
    it('returns success and counts', async () => {
        mockBackfillNodeKeywords.mockResolvedValue({ processed: 20, updated: 18 });
        const res = await request(buildApp()).post('/keywords/backfill-nodes');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.processed).toBe(20);
        expect(res.body.updated).toBe(18);
    });

    it('passes limit query param', async () => {
        await request(buildApp()).post('/keywords/backfill-nodes?limit=50');
        expect(mockBackfillNodeKeywords).toHaveBeenCalledWith(50);
    });

    it('defaults to limit 20', async () => {
        await request(buildApp()).post('/keywords/backfill-nodes');
        expect(mockBackfillNodeKeywords).toHaveBeenCalledWith(20);
    });

    it('returns 500 on error', async () => {
        mockBackfillNodeKeywords.mockRejectedValue(new Error('DB error'));
        const res = await request(buildApp()).post('/keywords/backfill-nodes');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB error');
    });
});

// =============================================================================
// GET /keywords/node/:id
// =============================================================================

describe('GET /keywords/node/:id', () => {
    it('returns keywords for a node', async () => {
        mockQuery.mockResolvedValue([
            { keyword: 'machine learning', source: 'llm', created_at: '2024-01-01' },
            { keyword: 'neural network', source: 'tfidf', created_at: '2024-01-01' },
        ]);
        const res = await request(buildApp()).get('/keywords/node/node-1');
        expect(res.status).toBe(200);
        expect(res.body.nodeId).toBe('node-1');
        expect(Array.isArray(res.body.keywords)).toBe(true);
        expect(res.body.keywords).toHaveLength(2);
        expect(res.body.keywords[0].keyword).toBe('machine learning');
    });

    it('queries with the correct node id', async () => {
        await request(buildApp()).get('/keywords/node/node-42');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('node_keywords'),
            ['node-42']
        );
    });

    it('returns empty keywords when node has none', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/keywords/node/node-1');
        expect(res.body.keywords).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('DB failure'));
        const res = await request(buildApp()).get('/keywords/node/node-1');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB failure');
    });
});
