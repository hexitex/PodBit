/**
 * Unit tests for routes/partitions/crud.ts —
 * bridge CRUD, partition list/get/create/update/delete, domain add/remove.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockClearCycleExclusionCache = jest.fn<() => void>();
const mockRenameDomain = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    clearCycleExclusionCache: mockClearCycleExclusionCache,
    renameDomain: mockRenameDomain,
}));

const { registerCrudRoutes } = await import('../../routes/partitions/crud.js');

// Build test app
const app = express();
app.use(express.json());
const router = express.Router();
registerCrudRoutes(router);
app.use(router);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockRenameDomain.mockResolvedValue({ success: true });
});

// =============================================================================
// GET /partitions/bridges
// =============================================================================

describe('GET /partitions/bridges', () => {
    it('returns all bridges', async () => {
        mockQuery.mockResolvedValue([
            { partition_a: 'p1', partition_b: 'p2', name_a: 'Part 1', name_b: 'Part 2' },
        ]);

        const res = await request(app).get('/partitions/bridges');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].partition_a).toBe('p1');
    });
});

// =============================================================================
// POST /partitions/bridges
// =============================================================================

describe('POST /partitions/bridges', () => {
    it('returns 400 when partitionA is missing', async () => {
        const res = await request(app).post('/partitions/bridges').send({ partitionB: 'p2' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('partitionA and partitionB are required');
    });

    it('returns 400 when partitionB is missing', async () => {
        const res = await request(app).post('/partitions/bridges').send({ partitionA: 'p1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('partitionA and partitionB are required');
    });

    it('returns 400 when bridging partition to itself', async () => {
        const res = await request(app).post('/partitions/bridges').send({ partitionA: 'p1', partitionB: 'p1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot bridge a partition to itself');
    });

    it('returns 400 when partitionA is a system partition', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 1 }) // pA = system
            .mockResolvedValueOnce({ system: 0 }); // pB = normal

        const res = await request(app).post('/partitions/bridges').send({ partitionA: 'sys', partitionB: 'p2' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('system partition');
    });

    it('returns 400 when partitionB is a system partition', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 }) // pA = normal
            .mockResolvedValueOnce({ system: 1 }); // pB = system

        const res = await request(app).post('/partitions/bridges').send({ partitionA: 'p1', partitionB: 'sys' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('system partition');
    });

    it('creates bridge with lexicographically sorted partition IDs', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });

        const res = await request(app).post('/partitions/bridges').send({ partitionA: 'z-part', partitionB: 'a-part' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.bridge.partition_a).toBe('a-part');
        expect(res.body.bridge.partition_b).toBe('z-part');
    });

    it('inserts bridge into partition_bridges table', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });

        await request(app).post('/partitions/bridges').send({ partitionA: 'p1', partitionB: 'p2' });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO partition_bridges')
        );
        expect(insertCall).toBeDefined();
    });
});

// =============================================================================
// DELETE /partitions/bridges
// =============================================================================

describe('DELETE /partitions/bridges', () => {
    it('returns 400 when partitionA is missing', async () => {
        const res = await request(app).delete('/partitions/bridges').send({ partitionB: 'p2' });
        expect(res.status).toBe(400);
    });

    it('deletes bridge with sorted partition IDs', async () => {
        await request(app).delete('/partitions/bridges').send({ partitionA: 'z-part', partitionB: 'a-part' });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('a-part');
        expect(params).toContain('z-part');
    });

    it('returns success on delete', async () => {
        const res = await request(app).delete('/partitions/bridges').send({ partitionA: 'p1', partitionB: 'p2' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// GET /partitions
// =============================================================================

describe('GET /partitions', () => {
    it('returns empty array when no partitions', async () => {
        mockQuery.mockResolvedValue([]);

        const res = await request(app).get('/partitions');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('converts system flag from 1 to true', async () => {
        mockQuery.mockResolvedValue([
            { id: 'know-thyself', name: 'KT', description: null, created_at: '2024-01-01', system: 1, transient: 0, state: null, source_project: null, source_owner: null, imported_at: null, cycles_completed: 0, barren_cycles: 0, allowed_cycles: null, domains: 'tuning' },
        ]);

        const res = await request(app).get('/partitions');

        expect(res.body[0].system).toBe(true);
    });

    it('splits domains comma-separated string into array', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'P1', description: null, created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, source_owner: null, imported_at: null, cycles_completed: 0, barren_cycles: 0, allowed_cycles: null, domains: 'science,math' },
        ]);

        const res = await request(app).get('/partitions');

        expect(res.body[0].domains).toEqual(['science', 'math']);
    });

    it('returns empty domains array when domains is null', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'P1', description: null, created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, source_owner: null, imported_at: null, cycles_completed: 0, barren_cycles: 0, allowed_cycles: null, domains: null },
        ]);

        const res = await request(app).get('/partitions');

        expect(res.body[0].domains).toEqual([]);
    });

    it('parses allowed_cycles JSON when present', async () => {
        mockQuery.mockResolvedValue([
            { id: 'p1', name: 'P1', description: null, created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, source_owner: null, imported_at: null, cycles_completed: 0, barren_cycles: 0, allowed_cycles: '["voicing","research"]', domains: null },
        ]);

        const res = await request(app).get('/partitions');

        expect(res.body[0].allowed_cycles).toEqual(['voicing', 'research']);
    });
});

// =============================================================================
// GET /partitions/:id
// =============================================================================

describe('GET /partitions/:id', () => {
    it('returns 404 when partition not found', async () => {
        mockQuery.mockResolvedValue([]);

        const res = await request(app).get('/partitions/nonexistent');

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('returns partition with domains', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'p1', name: 'P1', description: null, created_at: '2024-01-01', system: 0, allowed_cycles: null }])
            .mockResolvedValueOnce([{ domain: 'science', added_at: '2024-01-01' }, { domain: 'math', added_at: '2024-01-01' }]);

        const res = await request(app).get('/partitions/p1');

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('p1');
        expect(res.body.domains).toEqual(['science', 'math']);
    });

    it('converts system flag to boolean', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'sys', name: 'System', description: null, created_at: '2024-01-01', system: 1, allowed_cycles: null }])
            .mockResolvedValueOnce([]);

        const res = await request(app).get('/partitions/sys');

        expect(res.body.system).toBe(true);
    });
});

// =============================================================================
// POST /partitions
// =============================================================================

describe('POST /partitions', () => {
    it('returns 400 when id is missing', async () => {
        const res = await request(app).post('/partitions').send({ name: 'My Partition' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('id and name are required');
    });

    it('returns 400 when name is missing', async () => {
        const res = await request(app).post('/partitions').send({ id: 'my-part' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('id and name are required');
    });

    it('inserts partition into domain_partitions', async () => {
        await request(app).post('/partitions').send({ id: 'p1', name: 'Partition 1' });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO domain_partitions') && Array.isArray(params) && params.includes('p1')
        );
        expect(insertCall).toBeDefined();
    });

    it('inserts each domain into partition_domains', async () => {
        await request(app).post('/partitions').send({ id: 'p1', name: 'P1', domains: ['science', 'math'] });

        const domainInserts = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('INSERT INTO partition_domains')
        );
        expect(domainInserts).toHaveLength(2);
    });

    it('returns success with id, name, and domains', async () => {
        const res = await request(app).post('/partitions').send({ id: 'p1', name: 'P1', domains: ['science'] });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBe('p1');
        expect(res.body.name).toBe('P1');
        expect(res.body.domains).toEqual(['science']);
    });

    it('creates partition with system=true when system flag set', async () => {
        await request(app).post('/partitions').send({ id: 'sys', name: 'System', system: true });

        const [, params] = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO domain_partitions')
        );
        expect(params).toContain(1); // system = 1
    });
});

// =============================================================================
// PUT /partitions/:id
// =============================================================================

describe('PUT /partitions/:id', () => {
    it('returns success with no updates', async () => {
        const res = await request(app).put('/partitions/p1').send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('updates name when provided', async () => {
        await request(app).put('/partitions/p1').send({ name: 'New Name' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE domain_partitions') && String(sql).includes('name')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('New Name');
    });

    it('updates system flag when provided', async () => {
        await request(app).put('/partitions/p1').send({ system: true });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE domain_partitions') && String(sql).includes('system')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain(1); // system = 1
    });

    it('calls clearCycleExclusionCache when allowed_cycles is updated', async () => {
        await request(app).put('/partitions/p1').send({ allowed_cycles: ['voicing'] });

        expect(mockClearCycleExclusionCache).toHaveBeenCalled();
    });

    it('does not call clearCycleExclusionCache when allowed_cycles is not updated', async () => {
        await request(app).put('/partitions/p1').send({ name: 'New Name' });

        expect(mockClearCycleExclusionCache).not.toHaveBeenCalled();
    });

    it('stores allowed_cycles as JSON string', async () => {
        await request(app).put('/partitions/p1').send({ allowed_cycles: ['voicing', 'research'] });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('allowed_cycles')
        );
        expect(updateCall[1]).toContain(JSON.stringify(['voicing', 'research']));
    });

    it('stores null for allowed_cycles when null provided', async () => {
        await request(app).put('/partitions/p1').send({ allowed_cycles: null });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('allowed_cycles')
        );
        expect(updateCall[1]).toContain(null);
    });
});

// =============================================================================
// PUT /partitions/domains/:domain/rename
// =============================================================================

describe('PUT /partitions/domains/:domain/rename', () => {
    it('returns 400 when newDomain is missing', async () => {
        const res = await request(app).put('/partitions/domains/science/rename').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('newDomain is required');
    });

    it('calls renameDomain with decoded old domain and trimmed new domain', async () => {
        await request(app).put('/partitions/domains/old-science/rename').send({ newDomain: '  new-science  ' });

        expect(mockRenameDomain).toHaveBeenCalledWith('old-science', 'new-science', 'human:gui');
    });

    it('returns 400 when renameDomain fails', async () => {
        mockRenameDomain.mockResolvedValue({ success: false, error: 'Domain in use' });

        const res = await request(app).put('/partitions/domains/science/rename').send({ newDomain: 'biology' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Domain in use');
    });

    it('returns result on success', async () => {
        mockRenameDomain.mockResolvedValue({ success: true, renamed: 5 });

        const res = await request(app).put('/partitions/domains/science/rename').send({ newDomain: 'biology' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// DELETE /partitions/:id
// =============================================================================

describe('DELETE /partitions/:id', () => {
    it('deletes partition domains and partition', async () => {
        await request(app).delete('/partitions/p1');

        const domainDelete = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM partition_domains')
        );
        const partitionDelete = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM domain_partitions')
        );

        expect(domainDelete).toBeDefined();
        expect(partitionDelete).toBeDefined();
    });

    it('returns success', async () => {
        const res = await request(app).delete('/partitions/p1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /partitions/:id/domains
// =============================================================================

describe('POST /partitions/:id/domains', () => {
    it('returns 400 when domain is missing', async () => {
        const res = await request(app).post('/partitions/p1/domains').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('domain is required');
    });

    it('inserts domain into partition_domains', async () => {
        await request(app).post('/partitions/p1/domains').send({ domain: 'science' });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('INSERT INTO partition_domains') &&
            Array.isArray(params) && params.includes('p1') && params.includes('science')
        );
        expect(insertCall).toBeDefined();
    });

    it('returns success with partition and domain', async () => {
        const res = await request(app).post('/partitions/p1/domains').send({ domain: 'science' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.partition).toBe('p1');
        expect(res.body.domain).toBe('science');
    });
});

// =============================================================================
// DELETE /partitions/:id/domains/:domain
// =============================================================================

describe('DELETE /partitions/:id/domains/:domain', () => {
    it('deletes domain from partition', async () => {
        await request(app).delete('/partitions/p1/domains/science');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('p1');
        expect(params).toContain('science');
    });

    it('returns success', async () => {
        const res = await request(app).delete('/partitions/p1/domains/science');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
