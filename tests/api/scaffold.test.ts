/**
 * API tests for routes/scaffold.ts
 *
 * Tests: POST /docs/decompose, /docs/generate, /docs/resume/:jobId,
 *        GET /docs/jobs, GET/DELETE /docs/jobs/:jobId, GET /docs/templates
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockDecompose = jest.fn<() => Promise<any>>().mockResolvedValue({ sections: [] });
const mockScaffold = jest.fn<() => Promise<any>>().mockResolvedValue({ jobId: 'j-1', status: 'complete' });
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../scaffold.js', () => ({
    decompose: mockDecompose,
    scaffold: mockScaffold,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: scaffoldRouter } = await import('../../routes/scaffold.js');

/** Express app with scaffold/docs router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', scaffoldRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDecompose.mockResolvedValue({ sections: [] });
    mockScaffold.mockResolvedValue({ jobId: 'j-1', status: 'complete' });
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /docs/decompose
// =============================================================================

describe('POST /docs/decompose', () => {
    it('calls decompose and returns result', async () => {
        mockDecompose.mockResolvedValue({ sections: [{ title: 'Intro', purpose: 'Overview' }] });
        const res = await request(buildApp())
            .post('/docs/decompose')
            .send({ request: 'Write a report on AI', taskType: 'general' });
        expect(res.status).toBe(200);
        expect(res.body.sections).toHaveLength(1);
        expect(mockDecompose).toHaveBeenCalledWith('Write a report on AI', 'general', undefined);
    });

    it('passes options to decompose', async () => {
        await request(buildApp())
            .post('/docs/decompose')
            .send({ request: 'test', taskType: 'research', options: { depth: 3 } });
        expect(mockDecompose).toHaveBeenCalledWith('test', 'research', { depth: 3 });
    });
});

// =============================================================================
// POST /docs/generate
// =============================================================================

describe('POST /docs/generate', () => {
    it('calls scaffold and returns result', async () => {
        mockScaffold.mockResolvedValue({ jobId: 'j-42', status: 'queued', sections: [] });
        const res = await request(buildApp())
            .post('/docs/generate')
            .send({ request: 'Write report', taskType: 'report' });
        expect(res.status).toBe(200);
        expect(res.body.jobId).toBe('j-42');
        expect(mockScaffold).toHaveBeenCalledWith('Write report', 'report', undefined);
    });
});

// =============================================================================
// POST /docs/resume/:jobId
// =============================================================================

describe('POST /docs/resume/:jobId', () => {
    it('returns 404 when job not found', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).post('/docs/resume/missing-job');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Job not found');
    });

    it('resumes existing job', async () => {
        mockQuery.mockResolvedValue([{
            id: 'j-1',
            request: 'Write report',
            task_type: 'report',
        }]);
        mockScaffold.mockResolvedValue({ jobId: 'j-1', status: 'resumed' });
        const res = await request(buildApp())
            .post('/docs/resume/j-1')
            .send({ options: { extra: true } });
        expect(res.status).toBe(200);
        expect(mockScaffold).toHaveBeenCalledWith(
            'Write report',
            'report',
            expect.objectContaining({ resumeJobId: 'j-1' })
        );
    });
});

// =============================================================================
// GET /docs/jobs
// =============================================================================

describe('GET /docs/jobs', () => {
    it('returns all jobs', async () => {
        mockQuery.mockResolvedValue([
            { id: 'j-1', request: 'test', task_type: 'general', status: 'complete' },
            { id: 'j-2', request: 'test2', task_type: 'report', status: 'running' },
        ]);
        const res = await request(buildApp()).get('/docs/jobs');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    it('filters by status when provided', async () => {
        mockQuery.mockResolvedValue([{ id: 'j-1', status: 'complete' }]);
        await request(buildApp()).get('/docs/jobs?status=complete');
        const sql = (mockQuery.mock.calls[0] as any[])[0] as string;
        expect(sql).toContain('WHERE status');
        expect((mockQuery.mock.calls[0] as any[])[1]).toEqual(['complete']);
    });

    it('returns all jobs without status filter', async () => {
        mockQuery.mockResolvedValue([]);
        await request(buildApp()).get('/docs/jobs');
        expect((mockQuery.mock.calls[0] as any[])[1]).toEqual([]);
    });
});

// =============================================================================
// GET /docs/jobs/:jobId
// =============================================================================

describe('GET /docs/jobs/:jobId', () => {
    it('returns 404 when job not found', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/docs/jobs/missing');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Job not found');
    });

    it('returns job with parsed outline and sections', async () => {
        mockQuery.mockResolvedValue([{
            id: 'j-1',
            request: 'test',
            task_type: 'general',
            status: 'complete',
            outline: '{"sections":[]}',
            sections: '[{"title":"Intro"}]',
        }]);
        const res = await request(buildApp()).get('/docs/jobs/j-1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('j-1');
        expect(typeof res.body.outline).toBe('object');
        expect(Array.isArray(res.body.sections)).toBe(true);
    });

    it('returns already-parsed objects as-is', async () => {
        mockQuery.mockResolvedValue([{
            id: 'j-1',
            outline: { sections: [] },
            sections: [{ title: 'Intro' }],
        }]);
        const res = await request(buildApp()).get('/docs/jobs/j-1');
        expect(res.status).toBe(200);
        expect(typeof res.body.outline).toBe('object');
    });
});

// =============================================================================
// DELETE /docs/jobs/:jobId
// =============================================================================

describe('DELETE /docs/jobs/:jobId', () => {
    it('returns 404 when job not found', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).delete('/docs/jobs/missing');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Job not found');
    });

    it('deletes job and returns success', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'j-1' }]) // SELECT check
            .mockResolvedValueOnce([]);               // DELETE
        const res = await request(buildApp()).delete('/docs/jobs/j-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBe('j-1');
    });
});

// =============================================================================
// GET /docs/templates
// =============================================================================

describe('GET /docs/templates', () => {
    it('returns templates list', async () => {
        mockQuery.mockResolvedValue([
            { id: 't-1', task_type: 'report', name: 'Research Report' },
            { id: 't-2', task_type: 'brief', name: 'Executive Brief' },
        ]);
        const res = await request(buildApp()).get('/docs/templates');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].name).toBe('Research Report');
    });

    it('returns empty array when no templates', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/docs/templates');
        expect(res.body).toEqual([]);
    });
});
