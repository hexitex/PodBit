/**
 * API tests for routes/resonance.ts
 *
 * Tests: GET /resonance/nodes/:id/resolved (404 path),
 *        POST /resonance/nodes/:id/avatar (404 path),
 *        POST /resonance/nodes/avatars/batch (returns stats)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockHandleQuery = jest.fn<() => Promise<any>>().mockResolvedValue({ nodes: [], total: 0 });
const mockHandleGet = jest.fn<() => Promise<any>>().mockResolvedValue({ node: null });
const mockHandleLineage = jest.fn<() => Promise<any>>().mockResolvedValue({ lineage: [] });
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'new-id' });
const mockHandleVoice = jest.fn<() => Promise<any>>().mockResolvedValue({ voiced: true });
const mockHandlePromote = jest.fn<() => Promise<any>>().mockResolvedValue({ promoted: true });
const mockHandleStats = jest.fn<() => Promise<any>>().mockResolvedValue({ totalNodes: 100 });
const mockHandleDemote = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockEditNodeContent = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });
const mockSetExcludedFromBriefs = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'n1' });
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCanOverride = jest.fn<() => Promise<any>>().mockResolvedValue({ allowed: true });
const mockEnsurePartition = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockResolveContent = jest.fn<() => Promise<string>>().mockResolvedValue('resolved content');
const mockGenerateAvatar = jest.fn<() => Promise<string>>().mockResolvedValue('data:image/svg+xml;base64,abc');
const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleQuery: mockHandleQuery,
    handleGet: mockHandleGet,
    handleLineage: mockHandleLineage,
    handlePropose: mockHandlePropose,
    handleVoice: mockHandleVoice,
    handlePromote: mockHandlePromote,
    handleStats: mockHandleStats,
}));

jest.unstable_mockModule('../../handlers/elevation.js', () => ({
    handleDemote: mockHandleDemote,
}));

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
    canOverride: mockCanOverride,
    ensurePartition: mockEnsurePartition,
    editNodeContent: mockEditNodeContent,
    setExcludedFromBriefs: mockSetExcludedFromBriefs,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: mockGenerateAvatar,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
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

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: resonanceRouter } = await import('../../routes/resonance.js');

/** Express app with resonance (graph) router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', resonanceRouter);
    return app;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockHandleQuery.mockResolvedValue({ nodes: [], total: 0 });
    mockHandleGet.mockResolvedValue({ node: { id: 'uuid-1' } });
    mockHandleLineage.mockResolvedValue({ lineage: [] });
    mockHandlePropose.mockResolvedValue({ id: 'new-uuid' });
    mockHandleVoice.mockResolvedValue({ voiced: true });
    mockHandlePromote.mockResolvedValue({ promoted: true });
    mockHandleStats.mockResolvedValue({ totalNodes: 100 });
    mockHandleDemote.mockResolvedValue({ success: true });
    mockEditNodeContent.mockResolvedValue({ id: 'n1' });
    mockSetExcludedFromBriefs.mockResolvedValue({ id: 'n1' });
    mockLogDecision.mockResolvedValue(undefined);
    mockCanOverride.mockResolvedValue({ allowed: true });
    mockEnsurePartition.mockResolvedValue(undefined);
    mockResolveContent.mockResolvedValue('resolved content');
    mockGenerateAvatar.mockResolvedValue('data:image/svg+xml;base64,abc');
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockHandleRemove.mockResolvedValue({ success: true, action: 'junk', id: 'n1' });
});

// =============================================================================
// GET /resonance/nodes
// =============================================================================

describe('GET /resonance/nodes', () => {
    it('delegates to handleQuery and returns result', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [{ id: 'a', content: 'test' }] });
        const res = await request(buildApp()).get('/resonance/nodes?domain=ideas');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('nodes');
        expect(mockHandleQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/nodes/:id
// =============================================================================

describe('GET /resonance/nodes/:id', () => {
    it('delegates to handleGet', async () => {
        mockHandleGet.mockResolvedValue({ id: 'uuid-1', content: 'hello' });
        const res = await request(buildApp()).get('/resonance/nodes/uuid-1');
        expect(res.status).toBe(200);
        expect(mockHandleGet).toHaveBeenCalledWith({ id: 'uuid-1' });
    });
});

// =============================================================================
// GET /resonance/nodes/:id/resolved
// =============================================================================

describe('GET /resonance/nodes/:id/resolved', () => {
    it('returns 404 when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).get('/resonance/nodes/nonexistent/resolved');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('returns resolved content when node exists', async () => {
        mockQueryOne.mockResolvedValue({ content: 'raw [[[NXY1]]] content' });
        mockResolveContent.mockResolvedValue('raw 42 content');
        const res = await request(buildApp()).get('/resonance/nodes/uuid-1/resolved');
        expect(res.status).toBe(200);
        expect(res.body.resolved).toBe('raw 42 content');
        expect(mockResolveContent).toHaveBeenCalledWith('raw [[[NXY1]]] content');
    });
});

// =============================================================================
// GET /resonance/nodes/:id/lineage
// =============================================================================

describe('GET /resonance/nodes/:id/lineage', () => {
    it('delegates to handleLineage with default depth', async () => {
        mockHandleLineage.mockResolvedValue({ ancestors: [], descendants: [] });
        const res = await request(buildApp()).get('/resonance/nodes/uuid-1/lineage');
        expect(res.status).toBe(200);
        expect(mockHandleLineage).toHaveBeenCalledWith({ id: 'uuid-1', depth: 2 });
    });

    it('passes custom depth', async () => {
        const _res = await request(buildApp()).get('/resonance/nodes/uuid-1/lineage?depth=4');
        expect(mockHandleLineage).toHaveBeenCalledWith({ id: 'uuid-1', depth: 4 });
    });
});

// =============================================================================
// POST /resonance/nodes
// =============================================================================

describe('POST /resonance/nodes', () => {
    it('delegates to handlePropose', async () => {
        mockHandlePropose.mockResolvedValue({ id: 'new-uuid', success: true });
        const res = await request(buildApp())
            .post('/resonance/nodes')
            .send({ content: 'New node', nodeType: 'seed', contributor: 'human' });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('new-uuid');
        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ content: 'New node' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/avatars/batch
// =============================================================================

describe('POST /resonance/nodes/avatars/batch', () => {
    it('generates avatars for nodes without one', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'idea', node_type: 'seed', domain: 'ideas' },
            { id: 'n2', content: 'concept', node_type: 'voiced', domain: 'ideas' },
        ]);
        mockQueryOne.mockResolvedValue({ count: 3 }); // remaining
        const res = await request(buildApp())
            .post('/resonance/nodes/avatars/batch')
            .send({ limit: 10 });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('generated');
        expect(res.body).toHaveProperty('remaining');
        expect(res.body.generated).toBe(2);
        expect(mockGenerateAvatar).toHaveBeenCalledTimes(2);
    });

    it('returns 0 generated when no nodes need avatars', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue({ count: 0 });
        const res = await request(buildApp())
            .post('/resonance/nodes/avatars/batch')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.generated).toBe(0);
        expect(res.body.remaining).toBe(0);
    });
});

// =============================================================================
// POST /resonance/nodes/:id/avatar
// =============================================================================

describe('POST /resonance/nodes/:id/avatar', () => {
    it('returns 404 when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).post('/resonance/nodes/nonexistent/avatar');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });

    it('generates avatar for existing node', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'idea', node_type: 'seed', domain: 'ideas' });
        mockGenerateAvatar.mockResolvedValue('data:image/svg+xml;base64,xyz');
        const res = await request(buildApp()).post('/resonance/nodes/n1/avatar');
        expect(res.status).toBe(200);
        expect(res.body.avatarUrl).toBe('data:image/svg+xml;base64,xyz');
        expect(mockGenerateAvatar).toHaveBeenCalledWith('n1', 'idea', 'seed', 'ideas');
    });
});

// =============================================================================
// POST /resonance/nodes/:id/voice
// =============================================================================

describe('POST /resonance/nodes/:id/voice', () => {
    it('delegates to handleVoice with nodeId and body params', async () => {
        mockHandleVoice.mockResolvedValue({ voiced: true, content: 'synthesis output' });

        const res = await request(buildApp())
            .post('/resonance/nodes/uuid-1/voice')
            .send({ mode: 'sincere' });

        expect(res.status).toBe(200);
        expect(res.body.voiced).toBe(true);
        expect(mockHandleVoice).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'uuid-1', mode: 'sincere' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/:id/promote
// =============================================================================

describe('POST /resonance/nodes/:id/promote', () => {
    it('delegates to handlePromote with nodeId and body params', async () => {
        mockHandlePromote.mockResolvedValue({ promoted: true, id: 'uuid-1' });

        const res = await request(buildApp())
            .post('/resonance/nodes/uuid-1/promote')
            .send({ reason: 'Significant insight', contributor: 'human' });

        expect(res.status).toBe(200);
        expect(res.body.promoted).toBe(true);
        expect(mockHandlePromote).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'uuid-1', reason: 'Significant insight' })
        );
    });
});

// =============================================================================
// POST /resonance/nodes/:id/demote
// =============================================================================

describe('POST /resonance/nodes/:id/demote', () => {
    it('returns result from handleDemote on success', async () => {
        mockHandleDemote.mockResolvedValue({ success: true, id: 'uuid-1' });

        const res = await request(buildApp())
            .post('/resonance/nodes/uuid-1/demote')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('returns 400 when handleDemote returns an error', async () => {
        mockHandleDemote.mockResolvedValue({ error: 'Node is not a breakthrough', success: false });

        const res = await request(buildApp())
            .post('/resonance/nodes/uuid-1/demote')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('breakthrough');
    });
});

// =============================================================================
// DELETE /resonance/nodes/:id
// =============================================================================

describe('DELETE /resonance/nodes/:id', () => {
    it('returns 404 when node not found', async () => {
        mockHandleRemove.mockResolvedValue({ error: 'Node missing-id not found' });

        const res = await request(buildApp())
            .delete('/resonance/nodes/missing-id')
            .send({ mode: 'junk' });

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('junks (archives + flags) node by default', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'junk', id: 'n1' });

        const res = await request(buildApp())
            .delete('/resonance/nodes/n1')
            .send({ reason: 'low quality' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.action).toBe('junk');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'junk', reason: 'low quality' }),
        );
    });

    it('hard-deletes node when mode=hard', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'hard', id: 'n1' });

        const res = await request(buildApp())
            .delete('/resonance/nodes/n1')
            .send({ mode: 'hard' });

        expect(res.status).toBe(200);
        expect(res.body.action).toBe('hard');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'hard' }),
        );
    });

    it('archives (soft-delete) when mode=archive', async () => {
        mockHandleRemove.mockResolvedValue({ success: true, action: 'archive', id: 'n1' });

        const res = await request(buildApp())
            .delete('/resonance/nodes/n1')
            .send({ mode: 'archive' });

        expect(res.status).toBe(200);
        expect(res.body.action).toBe('archive');
        expect(mockHandleRemove).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', mode: 'archive' }),
        );
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/content
// =============================================================================

describe('PUT /resonance/nodes/:id/content', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(buildApp())
            .put('/resonance/nodes/n1/content')
            .send({ contributor: 'human' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('content');
    });

    it('calls editNodeContent and returns success', async () => {
        mockEditNodeContent.mockResolvedValue({ id: 'n1', content: 'updated content' });

        const res = await request(buildApp())
            .put('/resonance/nodes/n1/content')
            .send({ content: 'updated content', contributor: 'human', reason: 'correction' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockEditNodeContent).toHaveBeenCalledWith('n1', 'updated content', 'human', 'correction');
    });

    it('returns 404 when editNodeContent throws not-found error', async () => {
        mockEditNodeContent.mockRejectedValue(new Error('Node n1 not found'));

        const res = await request(buildApp())
            .put('/resonance/nodes/n1/content')
            .send({ content: 'new content' });

        expect(res.status).toBe(404);
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/excluded
// =============================================================================

describe('PUT /resonance/nodes/:id/excluded', () => {
    it('returns 400 when excluded param is missing', async () => {
        const res = await request(buildApp())
            .put('/resonance/nodes/n1/excluded')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('excluded');
    });

    it('calls setExcludedFromBriefs with correct args', async () => {
        mockSetExcludedFromBriefs.mockResolvedValue({ id: 'n1', excluded: true });

        const res = await request(buildApp())
            .put('/resonance/nodes/n1/excluded')
            .send({ excluded: true, reason: 'off-topic' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetExcludedFromBriefs).toHaveBeenCalledWith('n1', true, 'gui:user', 'off-topic');
    });
});

// =============================================================================
// PUT /resonance/nodes/:id/domain
// =============================================================================

describe('PUT /resonance/nodes/:id/domain', () => {
    it('returns 400 when domain is missing', async () => {
        const res = await request(buildApp())
            .put('/resonance/nodes/n1/domain')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('domain');
    });

    it('returns 403 when canOverride denies the change', async () => {
        mockCanOverride.mockResolvedValue({ allowed: false, reason: 'Higher-tier decision exists' });

        const res = await request(buildApp())
            .put('/resonance/nodes/n1/domain')
            .send({ domain: 'new-domain' });

        expect(res.status).toBe(403);
        expect(res.body.blocked).toBe(true);
    });

    it('changes domain and auto-partitions', async () => {
        mockCanOverride.mockResolvedValue({ allowed: true });
        mockQuery
            .mockResolvedValueOnce([{ domain: 'old-domain' }])  // SELECT old domain
            .mockResolvedValue([]);                               // UPDATE + ensurePartition

        const res = await request(buildApp())
            .put('/resonance/nodes/n1/domain')
            .send({ domain: 'new-domain' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.domain).toBe('new-domain');
        expect(mockEnsurePartition).toHaveBeenCalledWith('new-domain', 'human');
        expect(mockLogDecision).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/stats
// =============================================================================

describe('GET /resonance/stats', () => {
    it('delegates to handleStats and returns result', async () => {
        mockHandleStats.mockResolvedValue({ totalNodes: 250, domains: 8, breakthroughs: 12 });

        const res = await request(buildApp()).get('/resonance/stats?days=7');

        expect(res.status).toBe(200);
        expect(res.body.totalNodes).toBe(250);
        expect(mockHandleStats).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /resonance/keywords
// =============================================================================

describe('GET /resonance/keywords', () => {
    it('returns aggregated keyword list', async () => {
        mockQuery.mockResolvedValueOnce([
            { keyword: 'machine-learning', count: '45' },
            { keyword: 'neural-networks', count: '30' },
        ]);

        const res = await request(buildApp()).get('/resonance/keywords');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.keywords)).toBe(true);
        expect(res.body.keywords).toHaveLength(2);
        expect(res.body.keywords[0].keyword).toBe('machine-learning');
    });

    it('returns empty array when no keywords', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const res = await request(buildApp()).get('/resonance/keywords');

        expect(res.status).toBe(200);
        expect(res.body.keywords).toEqual([]);
    });
});

// =============================================================================
// GET /resonance/graph
// =============================================================================

describe('GET /resonance/graph', () => {
    it('returns graph nodes, edges, and summary', async () => {
        mockHandleQuery.mockResolvedValue({
            nodes: [
                { id: 'n1', content: 'AI safety node content here', type: 'seed', trajectory: 'knowledge', domain: 'ai', weight: 1.5, salience: 1.0, specificity: 2.0, feedback_rating: null, excluded: 0, metadata: null },
            ],
            total: 1,
        });
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'n1', target_id: 'n2', edge_type: 'parent' }])  // edges
            .mockResolvedValueOnce([{ node_id: 'n1', keyword: 'safety' }])                        // keywords
            .mockResolvedValueOnce([{ count: '10' }]);                                             // totalCount

        const res = await request(buildApp()).get('/resonance/graph?domain=ai');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.nodes)).toBe(true);
        expect(Array.isArray(res.body.edges)).toBe(true);
        expect(res.body.summary).toHaveProperty('total');
        expect(res.body.nodes[0].keywords).toContain('safety');
    });

    it('limits result to 3000 nodes maximum', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [], total: 0 });
        mockQuery.mockResolvedValue([]);

        await request(buildApp()).get('/resonance/graph?limit=99999');

        const queryParams = (mockHandleQuery.mock.calls[0] as any[])[0];
        expect(queryParams.limit).toBe(3000);
    });

    it('returns empty edges when no nodes match', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [], total: 0 });
        mockQuery.mockResolvedValueOnce([{ count: '0' }]); // totalCount

        const res = await request(buildApp()).get('/resonance/graph');

        expect(res.status).toBe(200);
        expect(res.body.edges).toEqual([]);
        expect(res.body.summary.warm).toBe(0);
    });
});
