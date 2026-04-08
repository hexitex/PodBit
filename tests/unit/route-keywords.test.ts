/**
 * Unit tests for routes/keywords.ts —
 * POST /keywords/backfill-domains, POST /keywords/backfill-nodes, GET /keywords/node/:id
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockBackfillDomainSynonyms = jest.fn<() => Promise<any>>().mockResolvedValue({ domains: 3, added: 12 });
const mockBackfillNodeKeywords = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 20, added: 45 });

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../core/keywords.js', () => ({
    backfillDomainSynonyms: mockBackfillDomainSynonyms,
    backfillNodeKeywords: mockBackfillNodeKeywords,
}));

const keywordsRouter = (await import('../../routes/keywords.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(keywordsRouter);

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockBackfillDomainSynonyms.mockResolvedValue({ domains: 3, added: 12 });
    mockBackfillNodeKeywords.mockResolvedValue({ processed: 20, added: 45 });
});

// =============================================================================
// POST /keywords/backfill-domains
// =============================================================================

describe('POST /keywords/backfill-domains', () => {
    it('returns success with backfill result', async () => {
        const res = await request(app).post('/keywords/backfill-domains');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.domains).toBe(3);
        expect(res.body.added).toBe(12);
    });

    it('calls backfillDomainSynonyms', async () => {
        await request(app).post('/keywords/backfill-domains');

        expect(mockBackfillDomainSynonyms).toHaveBeenCalled();
    });

    it('returns 500 when backfillDomainSynonyms throws', async () => {
        mockBackfillDomainSynonyms.mockRejectedValue(new Error('LLM unavailable'));

        const res = await request(app).post('/keywords/backfill-domains');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('LLM unavailable');
    });
});

// =============================================================================
// POST /keywords/backfill-nodes
// =============================================================================

describe('POST /keywords/backfill-nodes', () => {
    it('returns success with backfill result', async () => {
        const res = await request(app).post('/keywords/backfill-nodes');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.processed).toBe(20);
        expect(res.body.added).toBe(45);
    });

    it('passes default limit of 20 to backfillNodeKeywords', async () => {
        await request(app).post('/keywords/backfill-nodes');

        expect(mockBackfillNodeKeywords).toHaveBeenCalledWith(20);
    });

    it('passes custom limit from query param', async () => {
        await request(app).post('/keywords/backfill-nodes?limit=50');

        expect(mockBackfillNodeKeywords).toHaveBeenCalledWith(50);
    });

    it('returns 500 when backfillNodeKeywords throws', async () => {
        mockBackfillNodeKeywords.mockRejectedValue(new Error('DB error'));

        const res = await request(app).post('/keywords/backfill-nodes');

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
            { keyword: 'photosynthesis', source: 'llm', created_at: '2024-01-01' },
            { keyword: 'chlorophyll', source: 'llm', created_at: '2024-01-01' },
        ]);

        const res = await request(app).get('/keywords/node/node-123');

        expect(res.status).toBe(200);
        expect(res.body.nodeId).toBe('node-123');
        expect(res.body.keywords).toHaveLength(2);
        expect(res.body.keywords[0].keyword).toBe('photosynthesis');
    });

    it('queries node_keywords with correct node ID', async () => {
        await request(app).get('/keywords/node/my-node-id');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('my-node-id');
    });

    it('returns empty keywords array when no keywords found', async () => {
        mockQuery.mockResolvedValue([]);

        const res = await request(app).get('/keywords/node/node-456');

        expect(res.body.keywords).toEqual([]);
    });

    it('returns 500 when query throws', async () => {
        mockQuery.mockRejectedValue(new Error('DB failure'));

        const res = await request(app).get('/keywords/node/node-1');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB failure');
    });
});
