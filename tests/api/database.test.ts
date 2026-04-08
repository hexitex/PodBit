/**
 * API tests for routes/database.ts
 *
 * Tests: GET /database/info, GET /database/stats, DELETE /database/nodes (various),
 *        GET/POST /database/backups, POST /database/restore, POST /database/projects/*,
 *        GET/POST /database/number-variables
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockBackupDatabase = jest.fn<() => Promise<any>>().mockResolvedValue({ path: '/backups/db.bak' });
const mockRestoreDatabase = jest.fn<() => Promise<any>>().mockResolvedValue({ restored: true });
const mockListBackups = jest.fn<() => any[]>().mockReturnValue([]);
const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHandleProjects = jest.fn<() => Promise<any>>().mockResolvedValue({ projects: [] });

// Dynamic-import mocks (used by embeddings/status, DELETE /all, backfill)
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('nomic-embed-text');
const mockClearAll = jest.fn<() => void>();
const mockRegisterNodeVariables = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ varIds: [], annotatedContent: 'content' });
const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('sha256-abc');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    backupDatabase: mockBackupDatabase,
    restoreDatabase: mockRestoreDatabase,
    listBackups: mockListBackups,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../handlers/projects.js', () => ({
    handleProjects: mockHandleProjects,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbeddingModelName: mockGetEmbeddingModelName,
    embeddingConfig: { dimensions: 768 },
}));

jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    clearAll: mockClearAll,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: { numberVariables: { enabled: true } },
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    registerNodeVariables: mockRegisterNodeVariables,
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: databaseRouter } = await import('../../routes/database.js');

/** Express app with database router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', databaseRouter);
    return app;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([{ count: '0' }]);
    mockQueryOne.mockResolvedValue(null);
    mockListBackups.mockReturnValue([]);
    mockHandleProjects.mockResolvedValue({ projects: [] });
    mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: 'content' });
    mockComputeContentHash.mockReturnValue('sha256-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockBackupDatabase.mockResolvedValue({ path: '/backups/db.bak' });
    mockRestoreDatabase.mockResolvedValue({ restored: true });
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
});

// =============================================================================
// GET /database/info
// =============================================================================

describe('GET /database/info', () => {
    it('returns sqlite backend info', async () => {
        const res = await request(buildApp()).get('/database/info');
        expect(res.status).toBe(200);
        expect(res.body.backend).toBe('sqlite');
        expect(res.body.label).toBe('SQLite');
    });
});

// =============================================================================
// GET /database/stats
// =============================================================================

describe('GET /database/stats', () => {
    it('returns database stats', async () => {
        mockQuery.mockResolvedValue([{ count: '42' }]);
        const res = await request(buildApp()).get('/database/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('nodes');
        expect(res.body).toHaveProperty('edges');
        expect(res.body).toHaveProperty('byType');
        expect(res.body).toHaveProperty('byDomain');
    });
});

// =============================================================================
// DELETE /database/nodes/type/:type
// =============================================================================

describe('DELETE /database/nodes/type/:type', () => {
    it('returns 400 without confirm token', async () => {
        const res = await request(buildApp())
            .delete('/database/nodes/type/seed')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE');
    });

    it('returns 400 for invalid node type', async () => {
        const res = await request(buildApp())
            .delete('/database/nodes/type/invalid')
            .send({ confirm: 'DELETE' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid type');
    });

    it('deletes valid node type with confirm', async () => {
        mockQuery.mockImplementation(async (sql: any) => {
            if (sql.includes('SELECT id')) return [{ id: 'n-1' }, { id: 'n-2' }];
            return [];
        });
        const res = await request(buildApp())
            .delete('/database/nodes/type/seed')
            .send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.type).toBe('seed');
    });
});

// =============================================================================
// DELETE /database/nodes/domain/:domain
// =============================================================================

describe('DELETE /database/nodes/domain/:domain', () => {
    it('returns 400 without confirm token', async () => {
        const res = await request(buildApp())
            .delete('/database/nodes/domain/ideas')
            .send({});
        expect(res.status).toBe(400);
    });

    it('deletes domain nodes with confirm', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp())
            .delete('/database/nodes/domain/ideas')
            .send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.domain).toBe('ideas');
    });
});

// =============================================================================
// DELETE /database/nodes
// =============================================================================

describe('DELETE /database/nodes', () => {
    it('returns 400 without correct confirm token', async () => {
        const res = await request(buildApp())
            .delete('/database/nodes')
            .send({ confirm: 'DELETE' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE_ALL_NODES');
    });

    it('clears all nodes with correct confirm', async () => {
        mockQuery.mockResolvedValue([{ count: '100' }]);
        const res = await request(buildApp())
            .delete('/database/nodes')
            .send({ confirm: 'DELETE_ALL_NODES' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted).toHaveProperty('nodes');
        expect(res.body.deleted).toHaveProperty('edges');
    });
});

// =============================================================================
// DELETE /database/patterns
// =============================================================================

describe('DELETE /database/patterns', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp()).delete('/database/patterns').send({});
        expect(res.status).toBe(400);
    });

    it('deletes patterns with confirm', async () => {
        mockQuery.mockResolvedValue([{ id: 'p-1' }]);
        const res = await request(buildApp()).delete('/database/patterns').send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.patterns).toBe(1);
    });
});

// =============================================================================
// DELETE /database/knowledge-cache
// =============================================================================

describe('DELETE /database/knowledge-cache', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp()).delete('/database/knowledge-cache').send({});
        expect(res.status).toBe(400);
    });

    it('clears cache with confirm', async () => {
        mockQuery.mockResolvedValue([{ cache_key: 'k1' }, { cache_key: 'k2' }]);
        const res = await request(buildApp()).delete('/database/knowledge-cache').send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.knowledgeCache).toBe(2);
    });
});

// =============================================================================
// GET /database/backups
// =============================================================================

describe('GET /database/backups', () => {
    it('returns backup list', async () => {
        mockListBackups.mockReturnValue([
            { name: 'backup1.db', size: 1024, created_at: '2024-01-01' },
        ]);
        const res = await request(buildApp()).get('/database/backups');
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        expect(Array.isArray(res.body.backups)).toBe(true);
    });

    it('returns empty list when no backups', async () => {
        mockListBackups.mockReturnValue([]);
        const res = await request(buildApp()).get('/database/backups');
        expect(res.body.count).toBe(0);
        expect(res.body.totalSize).toBe(0);
    });
});

// =============================================================================
// POST /database/backup
// =============================================================================

describe('POST /database/backup', () => {
    it('creates backup and returns path', async () => {
        mockBackupDatabase.mockResolvedValue({ path: '/backups/mydb.bak', size: 2048 });
        const res = await request(buildApp()).post('/database/backup').send({ label: 'pre-deploy' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.path).toBe('/backups/mydb.bak');
    });
});

// =============================================================================
// POST /database/restore
// =============================================================================

describe('POST /database/restore', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp())
            .post('/database/restore')
            .send({ filename: 'backup.db' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('RESTORE');
    });

    it('returns 400 without filename', async () => {
        const res = await request(buildApp())
            .post('/database/restore')
            .send({ confirm: 'RESTORE' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('filename');
    });

    it('restores with valid params', async () => {
        mockRestoreDatabase.mockResolvedValue({ restored: true });
        const res = await request(buildApp())
            .post('/database/restore')
            .send({ confirm: 'RESTORE', filename: 'backup.db' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /database/projects/save
// =============================================================================

describe('POST /database/projects/save', () => {
    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Name required' });
        const res = await request(buildApp()).post('/database/projects/save').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Name required');
    });

    it('saves project successfully', async () => {
        mockHandleProjects.mockResolvedValue({ success: true, name: 'myproject' });
        const res = await request(buildApp())
            .post('/database/projects/save')
            .send({ name: 'myproject' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /database/projects/load
// =============================================================================

describe('POST /database/projects/load', () => {
    it('returns 400 without confirm token', async () => {
        const res = await request(buildApp())
            .post('/database/projects/load')
            .send({ name: 'myproject' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('LOAD_PROJECT');
    });

    it('loads project with confirm', async () => {
        mockHandleProjects.mockResolvedValue({ success: true });
        const res = await request(buildApp())
            .post('/database/projects/load')
            .send({ confirm: 'LOAD_PROJECT', name: 'myproject' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /database/projects/new
// =============================================================================

describe('POST /database/projects/new', () => {
    it('returns 400 without confirm token', async () => {
        const res = await request(buildApp())
            .post('/database/projects/new')
            .send({ name: 'fresh' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('NEW_PROJECT');
    });

    it('creates project with confirm', async () => {
        mockHandleProjects.mockResolvedValue({ success: true, name: 'fresh' });
        const res = await request(buildApp())
            .post('/database/projects/new')
            .send({ confirm: 'NEW_PROJECT', name: 'fresh' });
        expect(res.status).toBe(201);
    });
});

// =============================================================================
// DELETE /database/projects/:name
// =============================================================================

describe('DELETE /database/projects/:name', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp())
            .delete('/database/projects/myproject')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE_PROJECT');
    });

    it('deletes project with confirm', async () => {
        mockHandleProjects.mockResolvedValue({ success: true });
        const res = await request(buildApp())
            .delete('/database/projects/myproject')
            .send({ confirm: 'DELETE_PROJECT' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// GET /database/number-variables
// =============================================================================

describe('GET /database/number-variables', () => {
    it('returns variables list', async () => {
        mockQuery.mockResolvedValue([
            { var_id: 'ABC1', value: '42', scope_text: 'about 42 items', source_node_id: 'n-1', domain: 'test', created_at: '2024-01-01', source_content: 'test content' },
        ]);
        mockQueryOne.mockResolvedValue({ cnt: '1' });
        const res = await request(buildApp()).get('/database/number-variables');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('variables');
        expect(res.body).toHaveProperty('total');
        expect(res.body.variables[0].varId).toBe('ABC1');
    });
});

// =============================================================================
// POST /database/number-variables/resolve
// =============================================================================

describe('POST /database/number-variables/resolve', () => {
    it('returns empty object for missing varIds', async () => {
        const res = await request(buildApp())
            .post('/database/number-variables/resolve')
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.variables).toEqual({});
    });

    it('returns empty object for empty array', async () => {
        const res = await request(buildApp())
            .post('/database/number-variables/resolve')
            .send({ varIds: [] });
        expect(res.body.variables).toEqual({});
    });

    it('returns resolved variables', async () => {
        mockQuery.mockResolvedValue([
            { var_id: 'ABC1', value: '42', scope_text: 'context', domain: 'test' },
        ]);
        const res = await request(buildApp())
            .post('/database/number-variables/resolve')
            .send({ varIds: ['ABC1'] });
        expect(res.body.variables['ABC1']).toHaveProperty('value', '42');
    });
});

// =============================================================================
// PUT /database/number-variables/:varId
// =============================================================================

describe('PUT /database/number-variables/:varId', () => {
    it('returns 404 when variable not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp())
            .put('/database/number-variables/MISSING1')
            .send({ value: '99' });
        expect(res.status).toBe(404);
    });

    it('returns 400 when no updates provided', async () => {
        mockQueryOne.mockResolvedValue({ var_id: 'ABC1' });
        const res = await request(buildApp())
            .put('/database/number-variables/ABC1')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No updates');
    });

    it('updates variable successfully', async () => {
        mockQueryOne.mockResolvedValue({ var_id: 'ABC1' });
        const res = await request(buildApp())
            .put('/database/number-variables/ABC1')
            .send({ value: '99' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.varId).toBe('ABC1');
    });
});

// =============================================================================
// DELETE /database/number-variables/:varId
// =============================================================================

describe('DELETE /database/number-variables/:varId', () => {
    it('returns 404 when not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).delete('/database/number-variables/MISSING1');
        expect(res.status).toBe(404);
    });

    it('deletes variable', async () => {
        mockQueryOne.mockResolvedValue({ var_id: 'ABC1' });
        const res = await request(buildApp()).delete('/database/number-variables/ABC1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// DELETE /database/templates, /database/doc-jobs, /database/decisions
// =============================================================================

describe('DELETE /database/templates', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp()).delete('/database/templates').send({});
        expect(res.status).toBe(400);
    });

    it('deletes templates with confirm', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 't-1' }, { id: 't-2' }]);
        const res = await request(buildApp()).delete('/database/templates').send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.templates).toBe(2);
    });
});

describe('DELETE /database/doc-jobs', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp()).delete('/database/doc-jobs').send({});
        expect(res.status).toBe(400);
    });

    it('deletes doc jobs with confirm', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 'job-1' }]);
        const res = await request(buildApp()).delete('/database/doc-jobs').send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.deleted.docJobs).toBe(1);
    });
});

describe('DELETE /database/decisions', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(buildApp()).delete('/database/decisions').send({});
        expect(res.status).toBe(400);
    });

    it('deletes decisions with confirm', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 'd-1' }, { id: 'd-2' }, { id: 'd-3' }]);
        const res = await request(buildApp()).delete('/database/decisions').send({ confirm: 'DELETE' });
        expect(res.status).toBe(200);
        expect(res.body.deleted.decisions).toBe(3);
    });
});

// =============================================================================
// DELETE /database/all
// =============================================================================

describe('DELETE /database/all', () => {
    it('returns 400 without DELETE_EVERYTHING confirm', async () => {
        const res = await request(buildApp())
            .delete('/database/all')
            .send({ confirm: 'DELETE' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE_EVERYTHING');
    });

    it('deletes everything and returns counts', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '80' }])  // nodes count
            .mockResolvedValueOnce([{ count: '30' }])  // edges count
            .mockResolvedValueOnce([{ count: '10' }])  // patterns count
            .mockResolvedValueOnce([{ count: '4' }])   // templates count
            .mockResolvedValue([]);                     // all DELETEs

        const res = await request(buildApp())
            .delete('/database/all')
            .send({ confirm: 'DELETE_EVERYTHING' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.nodes).toBe(80);
        expect(res.body.deleted.edges).toBe(30);
        expect(res.body.deleted.patterns).toBe(10);
        expect(res.body.deleted.templates).toBe(4);
    });
});

// =============================================================================
// GET /database/embeddings/status
// =============================================================================

describe('GET /database/embeddings/status', () => {
    it('returns embedding model info and counts', async () => {
        mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
        mockQueryOne
            .mockResolvedValueOnce({ embedding_dims: 768 })  // dimsRow
            .mockResolvedValueOnce({ count: '200' })   // total
            .mockResolvedValueOnce({ count: '180' })   // current model
            .mockResolvedValueOnce({ count: '10' })    // legacy
            .mockResolvedValueOnce({ count: '10' });   // stale
        mockQuery.mockResolvedValueOnce([
            { embedding_model: 'nomic-embed-text', embedding_dims: 768, count: '180' },
            { embedding_model: null, embedding_dims: null, count: '10' },
        ]);

        const res = await request(buildApp()).get('/database/embeddings/status');
        expect(res.status).toBe(200);
        expect(res.body.currentModel).toBe('nomic-embed-text');
        expect(res.body.currentDimensions).toBe(768);
        expect(res.body.totalWithEmbeddings).toBe(200);
        expect(res.body.currentModelCount).toBe(180);
        expect(res.body.needsReEmbed).toBe(20); // legacy(10) + stale(10)
        expect(Array.isArray(res.body.byModel)).toBe(true);
        expect(res.body.byModel[1].model).toBe('(unknown)');
    });
});

// =============================================================================
// GET /database/projects, POST /database/projects/interview,
// GET/PUT /database/projects/manifest, PUT /database/projects/:name
// =============================================================================

describe('GET /database/projects', () => {
    it('delegates to handleProjects list', async () => {
        mockHandleProjects.mockResolvedValueOnce({ projects: [{ name: 'proj-a' }] });

        const res = await request(buildApp()).get('/database/projects');
        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith({ action: 'list' });
        expect(res.body.projects).toHaveLength(1);
    });
});

describe('POST /database/projects/interview', () => {
    it('delegates to handleProjects interview', async () => {
        mockHandleProjects.mockResolvedValueOnce({ step: 1, question: 'What is the project name?' });

        const res = await request(buildApp())
            .post('/database/projects/interview')
            .send({ answer: 'My Project' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'interview' })
        );
    });

    it('returns 400 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValueOnce({ error: 'Invalid answer' });

        const res = await request(buildApp())
            .post('/database/projects/interview')
            .send({ answer: '' });

        expect(res.status).toBe(400);
    });
});

describe('GET /database/projects/manifest', () => {
    it('returns manifest from handleProjects', async () => {
        mockHandleProjects.mockResolvedValueOnce({ manifest: { name: 'test', description: 'a project' } });

        const res = await request(buildApp()).get('/database/projects/manifest');
        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith({ action: 'manifest' });
    });
});

describe('PUT /database/projects/manifest', () => {
    it('updates manifest via handleProjects', async () => {
        mockHandleProjects.mockResolvedValueOnce({ updated: true });

        const res = await request(buildApp())
            .put('/database/projects/manifest')
            .send({ name: 'proj', description: 'Updated description' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'updateManifest' })
        );
    });
});

describe('PUT /database/projects/:name', () => {
    it('returns 404 when handler returns error', async () => {
        mockHandleProjects.mockResolvedValueOnce({ error: 'Project not found' });

        const res = await request(buildApp())
            .put('/database/projects/ghost')
            .send({ description: 'update' });

        expect(res.status).toBe(404);
    });

    it('updates project metadata', async () => {
        mockHandleProjects.mockResolvedValueOnce({ updated: true });

        const res = await request(buildApp())
            .put('/database/projects/myproject')
            .send({ description: 'New description' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'update', name: 'myproject' })
        );
    });
});

// =============================================================================
// POST /database/number-variables/backfill
// =============================================================================

describe('POST /database/number-variables/backfill', () => {
    it('processes nodes and reports annotated count', async () => {
        // SELECT all active nodes → 2 nodes
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'Value is 3.14', domain: 'math', node_type: 'seed', contributor: 'user', created_at: '2024-01-01' },
            { id: 'n2', content: 'No numbers here', domain: 'math', node_type: 'seed', contributor: 'user', created_at: '2024-01-01' },
        ]);
        mockQuery.mockResolvedValue([]); // all UPDATE calls

        // n1 gets 1 variable, n2 gets none
        mockRegisterNodeVariables
            .mockResolvedValueOnce({ varIds: ['MATH001'], annotatedContent: 'Value is [[[MATH001]]]' })
            .mockResolvedValueOnce({ varIds: [], annotatedContent: 'No numbers here' });

        const res = await request(buildApp())
            .post('/database/number-variables/backfill')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.processed).toBe(2);
        expect(res.body.annotated).toBe(1);
        expect(res.body.totalVars).toBe(1);
    });
});
