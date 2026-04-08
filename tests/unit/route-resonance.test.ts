/**
 * Unit tests for routes/resonance.ts —
 * Node CRUD, voice, promote, demote, domain change, avatar, graph, stats, keywords.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

// mcp-server.js — dynamic import used inside route handlers
const mockHandleQuery = jest.fn<() => Promise<any>>().mockResolvedValue({ nodes: [], total: 0 });
const mockHandleGet = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });
const mockHandleLineage = jest.fn<() => Promise<any>>().mockResolvedValue({ tree: {} });
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'new-id' });
const mockHandleVoice = jest.fn<() => Promise<any>>().mockResolvedValue({ context: 'voice-ctx' });
const mockHandlePromote = jest.fn<() => Promise<any>>().mockResolvedValue({ promoted: true });
const mockHandleStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 5 });

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleQuery: mockHandleQuery,
    handleGet: mockHandleGet,
    handleLineage: mockHandleLineage,
    handlePropose: mockHandlePropose,
    handleVoice: mockHandleVoice,
    handlePromote: mockHandlePromote,
    handleStats: mockHandleStats,
}));

// core/number-variables.js
const mockResolveContent = jest.fn<(s: string) => Promise<string>>()
    .mockImplementation(s => Promise.resolve(s + ' (resolved)'));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

// core.js — dynamic import inside routes
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCanOverride = jest.fn<() => Promise<any>>().mockResolvedValue({ allowed: true });
const mockEnsurePartition = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEditNodeContent = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });
const mockSetExcludedFromBriefs = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
    canOverride: mockCanOverride,
    ensurePartition: mockEnsurePartition,
    editNodeContent: mockEditNodeContent,
    setExcludedFromBriefs: mockSetExcludedFromBriefs,
}));

// core/avatar-gen.js
const mockGenerateAvatar = jest.fn<() => Promise<string>>()
    .mockResolvedValue('data:image/svg+xml;base64,abc123');

jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: mockGenerateAvatar,
}));

// handlers/elevation.js
const mockHandleDemote = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/elevation.js', () => ({
    handleDemote: mockHandleDemote,
}));

// handlers/graph.js — dynamic import in DELETE route
const mockHandleRemove = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, action: 'junk', id: 'n1' });

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handleRemove: mockHandleRemove,
    handleQuery: mockHandleQuery,
    handleGet: mockHandleGet,
    handleLineage: mockHandleLineage,
    handlePropose: mockHandlePropose,
    parseEmbeddingField: jest.fn(),
    validateProposal: jest.fn(),
    handleEdit: jest.fn(),
}));

const resonanceRouter = (await import('../../routes/resonance.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(resonanceRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockHandleQuery.mockResolvedValue({ nodes: [], total: 0 });
    mockHandleGet.mockResolvedValue({ id: 'n1' });
    mockHandleLineage.mockResolvedValue({ tree: {} });
    mockHandlePropose.mockResolvedValue({ id: 'new-id' });
    mockHandleVoice.mockResolvedValue({ context: 'voice-ctx' });
    mockHandlePromote.mockResolvedValue({ promoted: true });
    mockHandleStats.mockResolvedValue({ total: 5 });
    mockHandleDemote.mockResolvedValue({ ok: true });
    mockHandleRemove.mockResolvedValue({ success: true, action: 'junk', id: 'n1' });
    mockCanOverride.mockResolvedValue({ allowed: true });
    mockResolveContent.mockImplementation(s => Promise.resolve(s + ' (resolved)'));
    mockGenerateAvatar.mockResolvedValue('data:image/svg+xml;base64,abc123');
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
});

// =============================================================================
// GET /resonance/nodes
// =============================================================================

describe('GET /resonance/nodes', () => {
    it('delegates to handleQuery and returns result', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [{ id: 'n1' }], total: 1 });

        const res = await request(app).get('/resonance/nodes?domain=science');

        expect(res.status).toBe(200);
        expect(res.body.nodes).toHaveLength(1);
        expect(mockHandleQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/nodes/:id
// =============================================================================

describe('GET /resonance/nodes/:id', () => {
    it('delegates to handleGet with id', async () => {
        mockHandleGet.mockResolvedValue({ id: 'n1', content: 'test' });

        const res = await request(app).get('/resonance/nodes/n1');

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('n1');
        expect(mockHandleGet).toHaveBeenCalledWith({ id: 'n1' });
    });
});

// =============================================================================
// GET /resonance/nodes/:id/resolved
// =============================================================================

describe('GET /resonance/nodes/:id/resolved', () => {
    it('returns 404 when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/resonance/nodes/nonexistent/resolved');

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('returns resolved content', async () => {
        mockQueryOne.mockResolvedValue({ content: 'raw [[[VAR1]]] content' });
        mockResolveContent.mockResolvedValue('raw 42 content');

        const res = await request(app).get('/resonance/nodes/n1/resolved');

        expect(res.status).toBe(200);
        expect(res.body.resolved).toBe('raw 42 content');
    });
});

// =============================================================================
// GET /resonance/nodes/:id/lineage
// =============================================================================

describe('GET /resonance/nodes/:id/lineage', () => {
    it('delegates to handleLineage with id and depth', async () => {
        mockHandleLineage.mockResolvedValue({ tree: { id: 'n1' } });

        const res = await request(app).get('/resonance/nodes/n1/lineage?depth=3');

        expect(res.status).toBe(200);
        expect(mockHandleLineage).toHaveBeenCalledWith({ id: 'n1', depth: 3 });
    });

    it('uses default depth of 2', async () => {
        await request(app).get('/resonance/nodes/n1/lineage');

        expect(mockHandleLineage).toHaveBeenCalledWith({ id: 'n1', depth: 2 });
    });
});

// =============================================================================
// POST /resonance/nodes
// =============================================================================

describe('POST /resonance/nodes', () => {
    it('delegates to handlePropose', async () => {
        mockHandlePropose.mockResolvedValue({ id: 'new-node' });

        const res = await request(app)
            .post('/resonance/nodes')
            .send({ content: 'New idea', nodeType: 'seed', contributor: 'user' });

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('new-node');
        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'New idea', nodeType: 'seed' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/avatars/batch
// =============================================================================

describe('POST /resonance/nodes/avatars/batch', () => {
    it('returns generated count and remaining', async () => {
        // SELECT nodes without avatars
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'c1', node_type: 'seed', domain: 'science' },
            { id: 'n2', content: 'c2', node_type: 'synthesis', domain: 'math' },
        ]);
        // SELECT COUNT(*) for remaining — uses queryOne
        mockQueryOne.mockResolvedValueOnce({ count: 5 });

        const res = await request(app).post('/resonance/nodes/avatars/batch').send({ limit: 10 });

        expect(res.status).toBe(200);
        expect(res.body.generated).toBe(2);
        expect(res.body.remaining).toBe(5);
        expect(mockGenerateAvatar).toHaveBeenCalledTimes(2);
    });

    it('uses default limit of 500', async () => {
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ count: 0 }]);

        await request(app).post('/resonance/nodes/avatars/batch').send({});

        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(500);
    });

    it('continues on avatar generation failure', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'c1', node_type: 'seed', domain: 'science' },
            ])
            .mockResolvedValueOnce([{ count: 0 }]);
        mockGenerateAvatar.mockRejectedValue(new Error('dicebear failure'));

        const res = await request(app).post('/resonance/nodes/avatars/batch').send({});

        expect(res.status).toBe(200);
        expect(res.body.generated).toBe(0); // failed
    });
});

// =============================================================================
// POST /resonance/nodes/:id/avatar
// =============================================================================

describe('POST /resonance/nodes/:id/avatar', () => {
    it('returns 404 when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).post('/resonance/nodes/nonexistent/avatar');

        expect(res.status).toBe(404);
    });

    it('returns generated avatar URL', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'c', node_type: 'seed', domain: 'sci' });

        const res = await request(app).post('/resonance/nodes/n1/avatar');

        expect(res.status).toBe(200);
        expect(res.body.avatarUrl).toBe('data:image/svg+xml;base64,abc123');
    });
});

// =============================================================================
// POST /resonance/nodes/:id/voice
// =============================================================================

describe('POST /resonance/nodes/:id/voice', () => {
    it('delegates to handleVoice with nodeId and body', async () => {
        mockHandleVoice.mockResolvedValue({ instruction: 'voice this' });

        const res = await request(app)
            .post('/resonance/nodes/n1/voice')
            .send({ mode: 'sincere' });

        expect(res.status).toBe(200);
        expect(mockHandleVoice).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'sincere' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/:id/promote
// =============================================================================

describe('POST /resonance/nodes/:id/promote', () => {
    it('delegates to handlePromote with nodeId', async () => {
        mockHandlePromote.mockResolvedValue({ promoted: true, id: 'n1' });

        const res = await request(app)
            .post('/resonance/nodes/n1/promote')
            .send({ reason: 'great idea', contributor: 'user' });

        expect(res.status).toBe(200);
        expect(res.body.promoted).toBe(true);
        expect(mockHandlePromote).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', reason: 'great idea' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/:id/demote
// =============================================================================

describe('POST /resonance/nodes/:id/demote', () => {
    it('delegates to handleDemote and returns result', async () => {
        mockHandleDemote.mockResolvedValue({ ok: true, id: 'n1' });

        const res = await request(app).post('/resonance/nodes/n1/demote');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('returns 400 when handleDemote returns error', async () => {
        mockHandleDemote.mockResolvedValue({ error: 'Node not found or wrong type' });

        const res = await request(app).post('/resonance/nodes/n1/demote');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('not found');
    });
});

// =============================================================================
// DELETE /resonance/nodes/:id
// =============================================================================

describe('DELETE /resonance/nodes/:id', () => {
    it('returns 404 when node does not exist', async () => {
        mockHandleRemove.mockResolvedValue({ error: 'Node nonexistent not found' });

        const res = await request(app)
            .delete('/resonance/nodes/nonexistent')
            .send({ mode: 'junk' });

        expect(res.status).toBe(404);
    });

    it('junks node and sets junk=1', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'junk', id: 'n1' });

        const res = await request(app)
            .delete('/resonance/nodes/n1')
            .send({ mode: 'junk' });

        expect(res.status).toBe(200);
        expect(res.body.action).toBe('junk');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'junk' }),
        );
    });

    it('archives node with archive mode', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'archive', id: 'n1' });

        const res = await request(app)
            .delete('/resonance/nodes/n1')
            .send({ mode: 'archive' });

        expect(res.status).toBe(200);
        expect(res.body.action).toBe('archive');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'archive' }),
        );
    });

    it('hard-deletes node with hard mode', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'hard', id: 'n1' });

        const res = await request(app)
            .delete('/resonance/nodes/n1')
            .send({ mode: 'hard' });

        expect(res.status).toBe(200);
        expect(res.body.action).toBe('hard');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'hard' }),
        );
    });

    it('passes reason to handleRemove', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'junk', id: 'n1' });

        await request(app).delete('/resonance/nodes/n1').send({ mode: 'junk', reason: 'bad content' });

        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'junk', reason: 'bad content' }),
        );
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/content
// =============================================================================

describe('PUT /resonance/nodes/:id/content', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(app).put('/resonance/nodes/n1/content').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('content is required');
    });

    it('calls editNodeContent and returns success', async () => {
        mockEditNodeContent.mockResolvedValue({ id: 'n1', content: 'updated' });

        const res = await request(app)
            .put('/resonance/nodes/n1/content')
            .send({ content: 'updated text', contributor: 'user', reason: 'fix typo' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockEditNodeContent).toHaveBeenCalledWith('n1', 'updated text', 'user', 'fix typo');
    });

    it('returns 404 when editNodeContent throws not-found error', async () => {
        mockEditNodeContent.mockRejectedValue(new Error('Node not found or archived'));

        const res = await request(app)
            .put('/resonance/nodes/n1/content')
            .send({ content: 'text' });

        expect(res.status).toBe(404);
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/excluded
// =============================================================================

describe('PUT /resonance/nodes/:id/excluded', () => {
    it('returns 400 when excluded is missing', async () => {
        const res = await request(app).put('/resonance/nodes/n1/excluded').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('excluded');
    });

    it('calls setExcludedFromBriefs with boolean', async () => {
        mockSetExcludedFromBriefs.mockResolvedValue({ id: 'n1' });

        const res = await request(app)
            .put('/resonance/nodes/n1/excluded')
            .send({ excluded: true });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetExcludedFromBriefs).toHaveBeenCalledWith('n1', true, 'gui:user', undefined);
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/domain
// =============================================================================

describe('PUT /resonance/nodes/:id/domain', () => {
    it('returns 400 when domain is not provided', async () => {
        const res = await request(app).put('/resonance/nodes/n1/domain').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('domain is required');
    });

    it('returns 403 when tier override is blocked', async () => {
        mockCanOverride.mockResolvedValue({ allowed: false, reason: 'Tier 2 cannot override tier 3' });

        const res = await request(app)
            .put('/resonance/nodes/n1/domain')
            .send({ domain: 'new-domain' });

        expect(res.status).toBe(403);
        expect(res.body.blocked).toBe(true);
    });

    it('updates domain and ensures partition', async () => {
        mockQuery
            .mockResolvedValueOnce([{ domain: 'old-domain' }]) // SELECT existing domain
            .mockResolvedValue([]); // UPDATE

        const res = await request(app)
            .put('/resonance/nodes/n1/domain')
            .send({ domain: 'new-domain' });

        expect(res.status).toBe(200);
        expect(res.body.domain).toBe('new-domain');
        expect(mockEnsurePartition).toHaveBeenCalledWith('new-domain', 'human');
        expect(mockLogDecision).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/stats
// =============================================================================

describe('GET /resonance/stats', () => {
    it('delegates to handleStats', async () => {
        mockHandleStats.mockResolvedValue({ total: 42, domains: 5 });

        const res = await request(app).get('/resonance/stats');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(42);
        expect(mockHandleStats).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/keywords
// =============================================================================

describe('GET /resonance/keywords', () => {
    it('returns keywords grouped by frequency', async () => {
        mockQuery.mockResolvedValue([
            { keyword: 'entropy', count: 5 },
            { keyword: 'synthesis', count: 3 },
        ]);

        const res = await request(app).get('/resonance/keywords');

        expect(res.status).toBe(200);
        expect(res.body.keywords).toHaveLength(2);
        expect(res.body.keywords[0].keyword).toBe('entropy');
    });
});

// =============================================================================
// GET /resonance/graph
// =============================================================================

describe('GET /resonance/graph', () => {
    it('returns nodes and edges', async () => {
        mockHandleQuery.mockResolvedValue({
            nodes: [{ id: 'n1', content: 'node content', type: 'seed', domain: 'sci', weight: 1, total: 1 }],
            total: 1,
        });
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'n1', target_id: 'n2', edge_type: 'parent' }]) // edges
            .mockResolvedValueOnce([{ node_id: 'n1', keyword: 'entropy' }]) // node_keywords
            .mockResolvedValueOnce([{ count: 10 }]); // total count

        const res = await request(app).get('/resonance/graph');

        expect(res.status).toBe(200);
        expect(res.body.nodes).toHaveLength(1);
        expect(res.body.edges).toHaveLength(1);
        expect(res.body.edges[0].source).toBe('n1');
        expect(res.body.summary.total).toBe(10);
    });

    it('truncates long node content to 200 chars', async () => {
        const longContent = 'x'.repeat(300);
        mockHandleQuery.mockResolvedValue({
            nodes: [{ id: 'n1', content: longContent, type: 'seed', domain: 'sci', weight: 1 }],
            total: 1,
        });
        mockQuery
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValueOnce([]) // keywords
            .mockResolvedValueOnce([{ count: 1 }]);

        const res = await request(app).get('/resonance/graph');

        expect(res.body.nodes[0].content.length).toBeLessThanOrEqual(203); // 200 + '...'
        expect(res.body.nodes[0].content).toContain('...');
    });

    it('respects limit query param (max 3000)', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [], total: 0 });
        mockQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ count: 0 }]);

        await request(app).get('/resonance/graph?limit=100');

        expect(mockHandleQuery).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });
});
