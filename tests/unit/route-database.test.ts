/**
 * Unit tests for routes/database.ts —
 * stats, node deletion by type/domain, all-nodes wipe, patterns/templates,
 * backup/restore, project management.
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

// dynamic imports
jest.unstable_mockModule('../../models.js', () => ({
    getEmbeddingModelName: () => 'nomic-embed-text',
    embeddingConfig: { dimensions: 768 },
}));

jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    clearAll: jest.fn<() => void>(),
}));

const databaseRouter = (await import('../../routes/database.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(databaseRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

// Helper to set up count queries in order
function _mockQueryCounts(...counts: number[]) {
    let mock = mockQuery;
    for (const c of counts) {
        mock = mock.mockResolvedValueOnce([{ count: String(c) }]) as any;
    }
    return mock;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockBackupDatabase.mockResolvedValue({ path: '/data/backup.db' });
    mockRestoreDatabase.mockResolvedValue({ restored: true });
    mockListBackups.mockReturnValue([]);
    mockHandleProjects.mockResolvedValue({ ok: true });
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
});

// =============================================================================
// GET /database/info
// =============================================================================

describe('GET /database/info', () => {
    it('returns sqlite backend info', async () => {
        const res = await request(app).get('/database/info');

        expect(res.status).toBe(200);
        expect(res.body.backend).toBe('sqlite');
    });
});

// =============================================================================
// GET /database/stats
// =============================================================================

describe('GET /database/stats', () => {
    it('returns node and edge counts', async () => {
        // node, edge, pattern, template counts then optional counts
        mockQuery
            .mockResolvedValueOnce([{ count: '42' }])  // nodes
            .mockResolvedValueOnce([{ count: '18' }])  // edges
            .mockResolvedValueOnce([{ count: '5' }])   // patterns
            .mockResolvedValueOnce([{ count: '2' }])   // templates
            .mockResolvedValueOnce([{ count: '0' }])   // scaffold_jobs
            .mockResolvedValueOnce([{ count: '10' }])  // knowledge_cache
            .mockResolvedValueOnce([{ count: '7' }])   // decisions
            .mockResolvedValueOnce([{ node_type: 'seed', count: '20' }, { node_type: 'synthesis', count: '22' }]) // byType
            .mockResolvedValueOnce([{ domain: 'science', count: '30' }]); // byDomain

        const res = await request(app).get('/database/stats');

        expect(res.status).toBe(200);
        expect(res.body.nodes).toBe(42);
        expect(res.body.edges).toBe(18);
        expect(res.body.patterns).toBe(5);
        expect(res.body.byType).toHaveLength(2);
        expect(res.body.byDomain[0].domain).toBe('science');
    });
});

// =============================================================================
// DELETE /database/nodes/type/:type
// =============================================================================

describe('DELETE /database/nodes/type/:type', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app)
            .delete('/database/nodes/type/seed')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE');
    });

    it('returns 400 for invalid type', async () => {
        const res = await request(app)
            .delete('/database/nodes/type/unknown')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid type');
    });

    it('deletes nodes of given type and returns count', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }]) // SELECT ids
            .mockResolvedValue([]); // all subsequent DELETE calls

        const res = await request(app)
            .delete('/database/nodes/type/seed')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.nodes).toBe(2);
        expect(res.body.deleted.type).toBe('seed');
    });

    it('succeeds with 0 deletions when no nodes found', async () => {
        mockQuery.mockResolvedValueOnce([]); // no ids

        const res = await request(app)
            .delete('/database/nodes/type/voiced')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.nodes).toBe(0);
    });
});

// =============================================================================
// DELETE /database/nodes/domain/:domain
// =============================================================================

describe('DELETE /database/nodes/domain/:domain', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app)
            .delete('/database/nodes/domain/science')
            .send({});

        expect(res.status).toBe(400);
    });

    it('deletes nodes for domain and invalidates cache', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1' }]) // SELECT ids
            .mockResolvedValue([]);

        const res = await request(app)
            .delete('/database/nodes/domain/science')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.domain).toBe('science');
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
    });

    it('handles unset domain with IS NULL query', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1' }]) // SELECT ids
            .mockResolvedValue([]);

        const res = await request(app)
            .delete('/database/nodes/domain/unset')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        // SELECT uses domain IS NULL (no params)
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('IS NULL');
        expect(params).toEqual([]);
    });
});

// =============================================================================
// DELETE /database/nodes (all nodes)
// =============================================================================

describe('DELETE /database/nodes', () => {
    it('requires DELETE_ALL_NODES confirmation', async () => {
        const res = await request(app)
            .delete('/database/nodes')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE_ALL_NODES');
    });

    it('deletes all nodes and edges and returns counts', async () => {
        // beforeNodes, beforeEdges counts
        mockQuery
            .mockResolvedValueOnce([{ count: '100' }]) // node count
            .mockResolvedValueOnce([{ count: '50' }])  // edge count
            .mockResolvedValue([]); // DELETE calls

        const res = await request(app)
            .delete('/database/nodes')
            .send({ confirm: 'DELETE_ALL_NODES' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.nodes).toBe(100);
        expect(res.body.deleted.edges).toBe(50);
    });
});

// =============================================================================
// DELETE /database/patterns
// =============================================================================

describe('DELETE /database/patterns', () => {
    it('returns 400 without confirm', async () => {
        const res = await request(app).delete('/database/patterns').send({});
        expect(res.status).toBe(400);
    });

    it('deletes patterns and returns count', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // DELETE node_abstract_patterns
            .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]); // DELETE abstract_patterns RETURNING

        const res = await request(app).delete('/database/patterns').send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.patterns).toBe(2);
    });
});

// =============================================================================
// DELETE /database/knowledge-cache
// =============================================================================

describe('DELETE /database/knowledge-cache', () => {
    it('clears cache entries', async () => {
        mockQuery.mockResolvedValueOnce([{ cache_key: 'k1' }, { cache_key: 'k2' }]);

        const res = await request(app)
            .delete('/database/knowledge-cache')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.knowledgeCache).toBe(2);
    });
});

// =============================================================================
// DELETE /database/all
// =============================================================================

describe('DELETE /database/all', () => {
    it('requires DELETE_EVERYTHING confirmation', async () => {
        const res = await request(app)
            .delete('/database/all')
            .send({ confirm: 'DELETE' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('DELETE_EVERYTHING');
    });

    it('deletes everything and returns counts', async () => {
        mockQuery
            .mockResolvedValueOnce([{ count: '50' }]) // nodes count
            .mockResolvedValueOnce([{ count: '30' }]) // edges count
            .mockResolvedValueOnce([{ count: '10' }]) // patterns count
            .mockResolvedValueOnce([{ count: '5' }])  // templates count
            .mockResolvedValue([]); // all DELETE calls

        const res = await request(app)
            .delete('/database/all')
            .send({ confirm: 'DELETE_EVERYTHING' });

        expect(res.status).toBe(200);
        expect(res.body.deleted.nodes).toBe(50);
        expect(res.body.deleted.patterns).toBe(10);
    });
});

// =============================================================================
// GET /database/backups
// =============================================================================

describe('GET /database/backups', () => {
    it('returns list of backups', async () => {
        mockListBackups.mockReturnValue([
            { filename: 'backup1.db', size: 1024, created: '2024-01-01' },
        ]);

        const res = await request(app).get('/database/backups');

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(1);
        expect(res.body.totalSize).toBe(1024);
        expect(res.body.backups[0].filename).toBe('backup1.db');
    });
});

// =============================================================================
// POST /database/backup
// =============================================================================

describe('POST /database/backup', () => {
    it('creates backup and returns path', async () => {
        mockBackupDatabase.mockResolvedValue({ path: '/data/backup-2024.db' });

        const res = await request(app).post('/database/backup').send({ label: 'before-update' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('/data/backup-2024.db');
        expect(mockBackupDatabase).toHaveBeenCalledWith('before-update');
    });
});

// =============================================================================
// POST /database/restore
// =============================================================================

describe('POST /database/restore', () => {
    it('returns 400 without RESTORE confirmation', async () => {
        const res = await request(app).post('/database/restore').send({ filename: 'x.db' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('RESTORE');
    });

    it('returns 400 when filename is missing', async () => {
        const res = await request(app).post('/database/restore').send({ confirm: 'RESTORE' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('filename');
    });

    it('restores database from filename', async () => {
        mockRestoreDatabase.mockResolvedValue({ restored: true });

        const res = await request(app).post('/database/restore').send({
            confirm: 'RESTORE',
            filename: 'backup-2024.db',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('backup-2024.db');
        expect(mockRestoreDatabase).toHaveBeenCalledWith('backup-2024.db');
    });
});

// =============================================================================
// GET /database/projects
// =============================================================================

describe('GET /database/projects', () => {
    it('delegates to handleProjects list', async () => {
        mockHandleProjects.mockResolvedValue([{ name: 'project1' }]);

        const res = await request(app).get('/database/projects');

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith({ action: 'list' });
    });
});

// =============================================================================
// POST /database/projects/save
// =============================================================================

describe('POST /database/projects/save', () => {
    it('saves project', async () => {
        mockHandleProjects.mockResolvedValue({ name: 'my-project', saved: true });

        const res = await request(app)
            .post('/database/projects/save')
            .send({ name: 'my-project' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'save', name: 'my-project' })
        );
    });

    it('returns 400 on error', async () => {
        mockHandleProjects.mockResolvedValue({ error: 'Project exists' });

        const res = await request(app)
            .post('/database/projects/save')
            .send({ name: 'existing' });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// POST /database/projects/load
// =============================================================================

describe('POST /database/projects/load', () => {
    it('requires LOAD_PROJECT confirmation', async () => {
        const res = await request(app).post('/database/projects/load').send({ name: 'p1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('LOAD_PROJECT');
    });

    it('loads project with confirmation', async () => {
        mockHandleProjects.mockResolvedValue({ loaded: 'my-project' });

        const res = await request(app)
            .post('/database/projects/load')
            .send({ confirm: 'LOAD_PROJECT', name: 'my-project' });

        expect(res.status).toBe(200);
    });
});

// =============================================================================
// DELETE /database/projects/:name
// =============================================================================

describe('DELETE /database/projects/:name', () => {
    it('requires DELETE_PROJECT confirmation', async () => {
        const res = await request(app).delete('/database/projects/old-project').send({});

        expect(res.status).toBe(400);
    });

    it('deletes project with confirmation', async () => {
        mockHandleProjects.mockResolvedValue({ deleted: 'old-project' });

        const res = await request(app)
            .delete('/database/projects/old-project')
            .send({ confirm: 'DELETE_PROJECT' });

        expect(res.status).toBe(200);
        expect(mockHandleProjects).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'delete', name: 'old-project' })
        );
    });
});
