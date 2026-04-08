/**
 * Research brief scaffolding REST API routes.
 *
 * Endpoints for decomposing requests into outlines, generating full
 * research briefs, resuming incomplete jobs, listing/viewing/deleting
 * scaffold jobs, and listing available templates.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/scaffold
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/docs/decompose', asyncHandler(async (req, res) => {
    const { decompose } = await import('../scaffold.js');
    const result = await decompose(
        req.body.request,
        req.body.taskType,
        req.body.options
    );
    res.json(result);
}));

router.post('/docs/generate', asyncHandler(async (req, res) => {
    const { scaffold } = await import('../scaffold.js');
    const result = await scaffold(
        req.body.request,
        req.body.taskType,
        req.body.options
    );
    res.json(result);
}));

router.post('/docs/resume/:jobId', asyncHandler(async (req, res) => {
    const { scaffold } = await import('../scaffold.js');
    const { query: dbQuery } = await import('../db.js');
    const job = await dbQuery('SELECT * FROM scaffold_jobs WHERE id = $1', [req.params.jobId]);
    if (!job || job.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
    }
    const existing = job[0];
    const result = await scaffold(
        existing.request,
        existing.task_type,
        { ...(req.body?.options || {}), resumeJobId: req.params.jobId }
    );
    res.json(result);
}));

router.get('/docs/jobs', asyncHandler(async (req, res) => {
    const { query: dbQuery } = await import('../db.js');
    const status = req.query.status as string | undefined;
    const sql = status
        ? 'SELECT id, request, task_type, status, error, created_at, updated_at FROM scaffold_jobs WHERE status = $1 ORDER BY updated_at DESC LIMIT 50'
        : 'SELECT id, request, task_type, status, error, created_at, updated_at FROM scaffold_jobs ORDER BY updated_at DESC LIMIT 50';
    const result = await dbQuery(sql, status ? [status] : []);
    res.json(result);
}));

router.get('/docs/jobs/:jobId', asyncHandler(async (req, res) => {
    const { query: dbQuery } = await import('../db.js');
    const rows = await dbQuery('SELECT * FROM scaffold_jobs WHERE id = $1', [req.params.jobId]);
    if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
    }
    const job = rows[0];
    job.outline = typeof job.outline === 'string' ? JSON.parse(job.outline) : job.outline;
    job.sections = typeof job.sections === 'string' ? JSON.parse(job.sections) : job.sections;
    res.json(job);
}));

router.delete('/docs/jobs/:jobId', asyncHandler(async (req, res) => {
    const { query: dbQuery } = await import('../db.js');
    const rows = await dbQuery('SELECT id FROM scaffold_jobs WHERE id = $1', [req.params.jobId]);
    if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
    }
    await dbQuery('DELETE FROM scaffold_jobs WHERE id = $1', [req.params.jobId]);
    res.json({ success: true, id: req.params.jobId });
}));

router.get('/docs/templates', asyncHandler(async (_req, res) => {
    const { query } = await import('../db.js');
    const result = await query(`
        SELECT id, task_type, name
        FROM templates
    `);
    res.json(result);
}));

export default router;
