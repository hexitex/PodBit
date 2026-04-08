/**
 * Unit tests for routes/scaffold.ts —
 * Decompose, generate, resume, jobs CRUD, and templates endpoints.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockDecompose = jest.fn<() => Promise<any>>().mockResolvedValue({ outline: ['section1'] });
const mockScaffold = jest.fn<() => Promise<any>>().mockResolvedValue({ document: 'generated doc' });

jest.unstable_mockModule('../../scaffold.js', () => ({
    decompose: mockDecompose,
    scaffold: mockScaffold,
}));

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

// =============================================================================
// Import under test (after mocks)
// =============================================================================

const { default: scaffoldRouter } = await import('../../routes/scaffold.js');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', scaffoldRouter);
    return app;
}

// =============================================================================
// Tests
// =============================================================================

describe('routes/scaffold', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // POST /docs/decompose
    // =========================================================================
    describe('POST /docs/decompose', () => {
        it('calls decompose with request body and returns result', async () => {
            const app = buildApp();
            const res = await request(app)
                .post('/docs/decompose')
                .send({ request: 'build a guide', taskType: 'tutorial', options: { depth: 2 } });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ outline: ['section1'] });
            expect(mockDecompose).toHaveBeenCalledWith('build a guide', 'tutorial', { depth: 2 });
        });
    });

    // =========================================================================
    // POST /docs/generate
    // =========================================================================
    describe('POST /docs/generate', () => {
        it('calls scaffold with request body and returns result', async () => {
            const app = buildApp();
            const res = await request(app)
                .post('/docs/generate')
                .send({ request: 'write a doc', taskType: 'report', options: {} });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ document: 'generated doc' });
            expect(mockScaffold).toHaveBeenCalledWith('write a doc', 'report', {});
        });
    });

    // =========================================================================
    // POST /docs/resume/:jobId
    // =========================================================================
    describe('POST /docs/resume/:jobId', () => {
        it('returns 404 when job not found', async () => {
            mockQuery.mockResolvedValueOnce([]);
            const app = buildApp();
            const res = await request(app)
                .post('/docs/resume/job-123')
                .send({});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Job not found' });
        });

        it('resumes an existing job', async () => {
            mockQuery.mockResolvedValueOnce([
                { id: 'job-123', request: 'old request', task_type: 'guide' },
            ]);
            const app = buildApp();
            const res = await request(app)
                .post('/docs/resume/job-123')
                .send({ options: { extra: true } });

            expect(res.status).toBe(200);
            expect(mockScaffold).toHaveBeenCalledWith(
                'old request',
                'guide',
                { extra: true, resumeJobId: 'job-123' },
            );
        });

        it('passes empty options when body has no options', async () => {
            mockQuery.mockResolvedValueOnce([
                { id: 'job-456', request: 'req', task_type: 'doc' },
            ]);
            const app = buildApp();
            const res = await request(app)
                .post('/docs/resume/job-456')
                .send({});

            expect(res.status).toBe(200);
            expect(mockScaffold).toHaveBeenCalledWith('req', 'doc', { resumeJobId: 'job-456' });
        });
    });

    // =========================================================================
    // GET /docs/jobs
    // =========================================================================
    describe('GET /docs/jobs', () => {
        it('returns all jobs when no status filter', async () => {
            const jobs = [{ id: 'j1', status: 'done' }];
            mockQuery.mockResolvedValueOnce(jobs);
            const app = buildApp();
            const res = await request(app).get('/docs/jobs');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(jobs);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY updated_at DESC'),
                [],
            );
        });

        it('filters by status when query param provided', async () => {
            mockQuery.mockResolvedValueOnce([]);
            const app = buildApp();
            const res = await request(app).get('/docs/jobs?status=pending');

            expect(res.status).toBe(200);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE status = $1'),
                ['pending'],
            );
        });
    });

    // =========================================================================
    // GET /docs/jobs/:jobId
    // =========================================================================
    describe('GET /docs/jobs/:jobId', () => {
        it('returns 404 when job not found', async () => {
            mockQuery.mockResolvedValueOnce([]);
            const app = buildApp();
            const res = await request(app).get('/docs/jobs/missing-id');

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Job not found' });
        });

        it('returns job with parsed JSON fields', async () => {
            mockQuery.mockResolvedValueOnce([{
                id: 'j1',
                outline: JSON.stringify({ sections: [1, 2] }),
                sections: JSON.stringify(['a', 'b']),
            }]);
            const app = buildApp();
            const res = await request(app).get('/docs/jobs/j1');

            expect(res.status).toBe(200);
            expect(res.body.outline).toEqual({ sections: [1, 2] });
            expect(res.body.sections).toEqual(['a', 'b']);
        });

        it('handles already-parsed outline and sections', async () => {
            mockQuery.mockResolvedValueOnce([{
                id: 'j2',
                outline: { already: 'parsed' },
                sections: ['already', 'parsed'],
            }]);
            const app = buildApp();
            const res = await request(app).get('/docs/jobs/j2');

            expect(res.status).toBe(200);
            expect(res.body.outline).toEqual({ already: 'parsed' });
            expect(res.body.sections).toEqual(['already', 'parsed']);
        });
    });

    // =========================================================================
    // DELETE /docs/jobs/:jobId
    // =========================================================================
    describe('DELETE /docs/jobs/:jobId', () => {
        it('returns 404 when job not found', async () => {
            mockQuery.mockResolvedValueOnce([]);
            const app = buildApp();
            const res = await request(app).delete('/docs/jobs/missing');

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Job not found' });
        });

        it('deletes job and returns success', async () => {
            mockQuery
                .mockResolvedValueOnce([{ id: 'j1' }])   // SELECT check
                .mockResolvedValueOnce(undefined as any); // DELETE
            const app = buildApp();
            const res = await request(app).delete('/docs/jobs/j1');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, id: 'j1' });
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM scaffold_jobs'),
                ['j1'],
            );
        });
    });

    // =========================================================================
    // GET /docs/templates
    // =========================================================================
    describe('GET /docs/templates', () => {
        it('returns template list', async () => {
            const templates = [{ id: 't1', task_type: 'guide', name: 'Quick Guide' }];
            mockQuery.mockResolvedValueOnce(templates);
            const app = buildApp();
            const res = await request(app).get('/docs/templates');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(templates);
        });
    });
});
