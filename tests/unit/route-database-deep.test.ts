/**
 * Deep branch-coverage tests for routes/database.ts
 * Covers: templates, doc-jobs, decisions, embeddings/status, project CRUD,
 * number-variable endpoints, catch blocks in stats, domain delete with 0 nodes.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockBackupDatabase = jest.fn<() => Promise<any>>().mockResolvedValue({ path: '/data/backup.db' });
const mockRestoreDatabase = jest.fn<() => Promise<any>>().mockResolvedValue({ restored: true });
const mockListBackups = jest.fn<() => any[]>().mockReturnValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    backupDatabase: mockBackupDatabase,
    restoreDatabase: mockRestoreDatabase,
    listBackups: mockListBackups,
}));

const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const mockHandleProjects = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
jest.unstable_mockModule('../../handlers/projects.js', () => ({
    handleProjects: mockHandleProjects,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbeddingModelName: () => 'nomic-embed-text',
    embeddingConfig: { dimensions: 768 },
}));

const mockClearAll = jest.fn<() => void>();
jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    clearAll: mockClearAll,
}));

const mockRegisterNodeVariables = jest.fn<() => Promise<any>>().mockResolvedValue({ varIds: [], annotatedContent: '' });
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    registerNodeVariables: mockRegisterNodeVariables,
}));

const mockConfig = { numberVariables: { enabled: true } };
jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('hash123');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

const databaseRouter = (await import('../../routes/database.js')).default;

const app = express();
app.use(express.json());
app.use(databaseRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockHandleProjects.mockResolvedValue({ ok: true });
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
    mockConfig.numberVariables = { enabled: true } as any;
});

// =============================================================================
// DELETE /database/templates
// =============================================================================

describe('DELETE /database/templates', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app).delete('/database/templates').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE');
    });

    it('deletes templates and returns count', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);

        const res = await request(app).delete('/database/templates').send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.templates).toBe(3);
    });
});

// =============================================================================
// DELETE /database/doc-jobs
// =============================================================================

describe('DELETE /database/doc-jobs', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app).delete('/database/doc-jobs').send({});
        expect(res.status).toBe(400);
    });

    it('deletes doc jobs and returns count', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 'j1' }]);

        const res = await request(app).delete('/database/doc-jobs').send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.docJobs).toBe(1);
    });
});

// =============================================================================
// DELETE /database/decisions
// =============================================================================

describe('DELETE /database/decisions', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app).delete('/database/decisions').send({});
        expect(res.status).toBe(400);
    });

    it('deletes decisions and returns count', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }]);

        const res = await request(app).delete('/database/decisions').send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.decisions).toBe(2);
    });
});

// =============================================================================
// GET /database/stats — catch blocks for optional tables
// =============================================================================

describe('GET /database/stats — optional table failures', () => {
    it('handles scaffold_jobs table not existing', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '10' }])  // nodes
            .mockResolvedValueOnce([{ count: '5' }])   // edges
            .mockResolvedValueOnce([{ count: '2' }])   // patterns
            .mockResolvedValueOnce([{ count: '1' }])   // templates
            .mockRejectedValueOnce(new Error('no such table: scaffold_jobs'))  // scaffold_jobs fails
            .mockResolvedValueOnce([{ count: '3' }])   // knowledge_cache
            .mockResolvedValueOnce([{ count: '4' }])   // decisions
            .mockResolvedValueOnce([])  // byType
            .mockResolvedValueOnce([]); // byDomain

        const res = await request(app).get('/database/stats');

        expect(res.status).toBe(200);
        expect(res.body.docJobs).toBe(0);
        expect(res.body.knowledgeCache).toBe(3);
    });

    it('handles knowledge_cache table not existing', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '10' }])
            .mockResolvedValueOnce([{ count: '5' }])
            .mockResolvedValueOnce([{ count: '2' }])
            .mockResolvedValueOnce([{ count: '1' }])
            .mockResolvedValueOnce([{ count: '0' }])  // scaffold_jobs
            .mockRejectedValueOnce(new Error('no such table: knowledge_cache'))
            .mockResolvedValueOnce([{ count: '4' }])   // decisions
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/database/stats');

        expect(res.status).toBe(200);
        expect(res.body.knowledgeCache).toBe(0);
    });

    it('handles decisions table not existing', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '10' }])
            .mockResolvedValueOnce([{ count: '5' }])
            .mockResolvedValueOnce([{ count: '2' }])
            .mockResolvedValueOnce([{ count: '1' }])
            .mockResolvedValueOnce([{ count: '0' }])
            .mockResolvedValueOnce([{ count: '3' }])
            .mockRejectedValueOnce(new Error('no such table: decisions'))
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/database/stats');

        expect(res.status).toBe(200);
        expect(res.body.decisions).toBe(0);
    });
});

// =============================================================================
// DELETE /database/nodes/domain/:domain — 0 nodes found
// =============================================================================

describe('DELETE /database/nodes/domain/:domain — empty domain', () => {
    it('succeeds with 0 nodes and skips delete queries', async () => {
        mockQuery.mockResolvedValueOnce([]); // no nodes found

        const res = await request(app)
            .delete('/database/nodes/domain/empty-domain')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.nodes).toBe(0);
        // invalidateKnowledgeCache should NOT be called when ids.length === 0
        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });
});

// =============================================================================
// GET /database/embeddings/status
// =============================================================================

describe('GET /database/embeddings/status', () => {
    it('returns embedding status with model breakdown', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ embedding_dims: 768 })  // dims query
            .mockResolvedValueOnce({ count: '100' })  // total
            .mockResolvedValueOnce({ count: '80' })   // current model
            .mockResolvedValueOnce({ count: '10' })   // legacy
            .mockResolvedValueOnce({ count: '5' });   // stale

        mockQuery.mockResolvedValueOnce([
            { embedding_model: 'nomic-embed-text', embedding_dims: 768, count: '80' },
            { embedding_model: null, embedding_dims: null, count: '10' },
        ]);

        const res = await request(app).get('/database/embeddings/status');

        expect(res.status).toBe(200);
        expect(res.body.currentModel).toBe('nomic-embed-text');
        expect(res.body.currentDimensions).toBe(768);
        expect(res.body.totalWithEmbeddings).toBe(100);
        expect(res.body.currentModelCount).toBe(80);
        expect(res.body.legacyCount).toBe(10);
        expect(res.body.staleCount).toBe(5);
        expect(res.body.needsReEmbed).toBe(15);
        expect(res.body.byModel).toHaveLength(2);
        expect(res.body.byModel[1].model).toBe('(unknown)');
    });
});

// =============================================================================
// POST /database/projects/new
// =============================================================================

describe('POST /database/projects/new', () => {
    it('returns 400 without NEW_PROJECT confirm', async () => {
        const res = await request(app)
            .post('/database/projects/new')
            .send({ name: 'proj' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('NEW_PROJECT');
    });

    it('creates new project with confirmation', async () => {
        mockHandleProjects.mockResolvedValue({ name: 'new-proj', created: true });

        const res = await request(app)
            .post('/database/projects/new')
            .send({ confirm: 'NEW_PROJECT', name: 'new-proj' });

        expect(res.status).toBe(201);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'new', name: 'new-proj' })
        );
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Name required' });

        const res = await request(app)
            .post('/database/projects/new')
            .send({ confirm: 'NEW_PROJECT' });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /database/projects/interview
// =============================================================================

describe('POST /database/projects/interview', () => {
    it('delegates to handleProjects interview', async () => {
        mockHandleProjects.mockResolvedValue({ question: 'What is your project about?' });

        const res = await request(app)
            .post('/database/projects/interview')
            .send({ answer: 'It is about testing' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'interview', answer: 'It is about testing' })
        );
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Interview session expired' });

        const res = await request(app)
            .post('/database/projects/interview')
            .send({});

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// GET /database/projects/manifest
// =============================================================================

describe('GET /database/projects/manifest', () => {
    it('returns project manifest', async () => {
        mockHandleProjects.mockResolvedValue({ name: 'MyProject', description: 'Test' });

        const res = await request(app).get('/database/projects/manifest');

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith({ action: 'manifest' });
    });
});

// =============================================================================
// PUT /database/projects/manifest
// =============================================================================

describe('PUT /database/projects/manifest', () => {
    it('updates manifest', async () => {
        mockHandleProjects.mockResolvedValue({ success: true });

        const res = await request(app)
            .put('/database/projects/manifest')
            .send({ name: 'Updated', description: 'New desc' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'updateManifest', manifest: { name: 'Updated', description: 'New desc' } })
        );
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Invalid manifest' });

        const res = await request(app)
            .put('/database/projects/manifest')
            .send({ bad: true });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// PUT /database/projects/:name
// =============================================================================

describe('PUT /database/projects/:name', () => {
    it('updates project metadata', async () => {
        mockHandleProjects.mockResolvedValue({ success: true, name: 'my-proj' });

        const res = await request(app)
            .put('/database/projects/my-proj')
            .send({ description: 'Updated description' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'update', name: 'my-proj', description: 'Updated description' })
        );
    });

    it('returns 404 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Project not found' });

        const res = await request(app)
            .put('/database/projects/nonexistent')
            .send({ description: 'x' });

        expect(res.status).toBe(404);
    });
});

// =============================================================================
// POST /database/projects/load — error path
// =============================================================================

describe('POST /database/projects/load — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Project not found' });

        const res = await request(app)
            .post('/database/projects/load')
            .send({ confirm: 'LOAD_PROJECT', name: 'missing' });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// DELETE /database/projects/:name — error path
// =============================================================================

describe('DELETE /database/projects/:name — error', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Cannot delete active project' });

        const res = await request(app)
            .delete('/database/projects/active-proj')
            .send({ confirm: 'DELETE_PROJECT' });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /database/number-variables/backfill
// =============================================================================

describe('POST /database/number-variables/backfill', () => {
    it('returns 400 when number variables disabled', async () => {
        mockConfig.numberVariables = { enabled: false } as any;

        const res = await request(app).post('/database/number-variables/backfill');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('not enabled');
    });

    it('backfills nodes with variable extraction', async () => {
        mockConfig.numberVariables = { enabled: true } as any;
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'Value is 42', domain: 'test', node_type: 'seed', contributor: 'human', created_at: '2025-01-01' },
        ]);
        mockRegisterNodeVariables.mockResolvedValue({
            varIds: ['VAR1'],
            annotatedContent: 'Value is [[[VAR1]]]',
        });
        mockQuery.mockResolvedValue([]); // UPDATE calls

        const res = await request(app).post('/database/number-variables/backfill');

        expect(res.status).toBe(200);
        expect(res.body.processed).toBe(1);
        expect(res.body.annotated).toBe(1);
        expect(res.body.totalVars).toBe(1);
    });

    it('skips nodes that produce 0 variables', async () => {
        mockConfig.numberVariables = { enabled: true } as any;
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'No numbers here', domain: 'test', node_type: 'seed', contributor: 'human', created_at: '2025-01-01' },
        ]);
        mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: 'No numbers here' });

        const res = await request(app).post('/database/number-variables/backfill');

        expect(res.status).toBe(200);
        expect(res.body.processed).toBe(1);
        expect(res.body.annotated).toBe(0);
        expect(res.body.totalVars).toBe(0);
    });

    it('continues on per-node errors', async () => {
        mockConfig.numberVariables = { enabled: true } as any;
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'test', domain: 'test', node_type: 'seed', contributor: 'human', created_at: '2025-01-01' },
            { id: 'n2', content: 'test2', domain: 'test', node_type: 'seed', contributor: 'human', created_at: '2025-01-02' },
        ]);
        mockRegisterNodeVariables
            .mockRejectedValueOnce(new Error('extraction failed'))
            .mockResolvedValueOnce({ varIds: ['V1'], annotatedContent: 'annotated' });
        mockQuery.mockResolvedValue([]);

        const res = await request(app).post('/database/number-variables/backfill');

        expect(res.status).toBe(200);
        expect(res.body.processed).toBe(2);
        expect(res.body.annotated).toBe(1);
    });
});

// =============================================================================
// GET /database/number-variables
// =============================================================================

describe('GET /database/number-variables', () => {
    it('returns variables with default pagination', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'V1', value: '42', scope_text: 'context', source_node_id: 'n1', domain: 'test', created_at: '2025-01-01', source_content: 'Content with 42 in it' },
        ]);
        mockQueryOne.mockResolvedValueOnce({ cnt: '1' });

        const res = await request(app).get('/database/number-variables');

        expect(res.status).toBe(200);
        expect(res.body.variables).toHaveLength(1);
        expect(res.body.variables[0].varId).toBe('V1');
        expect(res.body.total).toBe(1);
    });

    it('filters by domain', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValueOnce({ cnt: '0' });

        const res = await request(app).get('/database/number-variables?domain=physics');

        expect(res.status).toBe(200);
        // Check that domain filter was included in the query
        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('r.domain = $1');
        expect((queryCall[1] as any[])[0]).toBe('physics');
    });

    it('filters by search term', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValueOnce({ cnt: '0' });

        const res = await request(app).get('/database/number-variables?search=temperature');

        expect(res.status).toBe(200);
        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('LIKE');
        expect((queryCall[1] as any[])[0]).toBe('%temperature%');
    });

    it('applies both domain and search filters', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValueOnce({ cnt: '0' });

        await request(app).get('/database/number-variables?domain=physics&search=energy');

        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('r.domain = $1');
        expect(String(queryCall[0])).toContain('LIKE');
    });

    it('truncates source content to 200 chars', async () => {
        const longContent = 'A'.repeat(300);
        mockQuery.mockResolvedValueOnce([
            { var_id: 'V1', value: '1', scope_text: '', source_node_id: 'n1', domain: 'test', created_at: '2025-01-01', source_content: longContent },
        ]);
        mockQueryOne.mockResolvedValueOnce({ cnt: '1' });

        const res = await request(app).get('/database/number-variables');

        expect(res.body.variables[0].sourceContent.length).toBe(200);
    });
});

// =============================================================================
// POST /database/number-variables/resolve
// =============================================================================

describe('POST /database/number-variables/resolve', () => {
    it('returns empty object for missing varIds', async () => {
        const res = await request(app)
            .post('/database/number-variables/resolve')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.variables).toEqual({});
    });

    it('returns empty object for empty array', async () => {
        const res = await request(app)
            .post('/database/number-variables/resolve')
            .send({ varIds: [] });

        expect(res.status).toBe(200);
        expect(res.body.variables).toEqual({});
    });

    it('resolves variable IDs', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'V1', value: '42', scope_text: 'around 42', domain: 'test' },
        ]);

        const res = await request(app)
            .post('/database/number-variables/resolve')
            .send({ varIds: ['V1', 'V2'] });

        expect(res.status).toBe(200);
        expect(res.body.variables.V1.value).toBe('42');
    });

    it('limits to 50 variable IDs', async () => {
        const manyIds = Array.from({ length: 60 }, (_, i) => `V${i}`);
        mockQuery.mockResolvedValueOnce([]);

        await request(app)
            .post('/database/number-variables/resolve')
            .send({ varIds: manyIds });

        // The query should use 50 placeholders max
        const queryCall = mockQuery.mock.calls[0];
        const placeholders = String(queryCall[0]).match(/\$\d+/g);
        expect(placeholders).toHaveLength(50);
    });
});

// =============================================================================
// PUT /database/number-variables/:varId
// =============================================================================

describe('PUT /database/number-variables/:varId', () => {
    it('returns 404 when variable not found', async () => {
        mockQueryOne.mockResolvedValueOnce(null);

        const res = await request(app)
            .put('/database/number-variables/NONEXISTENT')
            .send({ value: '99' });

        expect(res.status).toBe(404);
    });

    it('returns 400 when no updates provided', async () => {
        mockQueryOne.mockResolvedValueOnce({ var_id: 'V1' });

        const res = await request(app)
            .put('/database/number-variables/V1')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No updates');
    });

    it('updates value only', async () => {
        mockQueryOne.mockResolvedValueOnce({ var_id: 'V1' });
        mockQuery.mockResolvedValueOnce([]);

        const res = await request(app)
            .put('/database/number-variables/V1')
            .send({ value: '99' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('value = $1');
    });

    it('updates scopeText only', async () => {
        mockQueryOne.mockResolvedValueOnce({ var_id: 'V1' });
        mockQuery.mockResolvedValueOnce([]);

        const res = await request(app)
            .put('/database/number-variables/V1')
            .send({ scopeText: 'new scope' });

        expect(res.status).toBe(200);
        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('scope_text = $1');
    });

    it('updates both value and scopeText', async () => {
        mockQueryOne.mockResolvedValueOnce({ var_id: 'V1' });
        mockQuery.mockResolvedValueOnce([]);

        const res = await request(app)
            .put('/database/number-variables/V1')
            .send({ value: '100', scopeText: 'updated scope' });

        expect(res.status).toBe(200);
        const queryCall = mockQuery.mock.calls[0];
        expect(String(queryCall[0])).toContain('value = $1');
        expect(String(queryCall[0])).toContain('scope_text = $2');
    });
});

// =============================================================================
// DELETE /database/number-variables/:varId
// =============================================================================

describe('DELETE /database/number-variables/:varId', () => {
    it('returns 404 when variable not found', async () => {
        mockQueryOne.mockResolvedValueOnce(null);

        const res = await request(app).delete('/database/number-variables/NONEXISTENT');

        expect(res.status).toBe(404);
    });

    it('deletes variable and refs', async () => {
        mockQueryOne.mockResolvedValueOnce({ var_id: 'V1' });
        mockQuery.mockResolvedValue([]);

        const res = await request(app).delete('/database/number-variables/V1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.varId).toBe('V1');
        // Should delete from both node_number_refs and number_registry
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// POST /database/backup — no label
// =============================================================================

describe('POST /database/backup — no body', () => {
    it('creates backup without label', async () => {
        mockBackupDatabase.mockResolvedValue({ path: '/data/backup.db' });

        const res = await request(app).post('/database/backup');

        expect(res.status).toBe(200);
        expect(mockBackupDatabase).toHaveBeenCalledWith(undefined);
    });
});

// =============================================================================
// DELETE /database/knowledge-cache — no confirm
// =============================================================================

describe('DELETE /database/knowledge-cache — no confirm', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app).delete('/database/knowledge-cache').send({});
        expect(res.status).toBe(400);
    });
});
