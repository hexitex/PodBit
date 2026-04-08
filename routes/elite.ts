/**
 * Elite Pool REST API Routes
 *
 * GET  /api/elite/stats       — Pool statistics
 * GET  /api/elite/coverage    — Manifest coverage report
 * GET  /api/elite/gaps        — Uncovered manifest targets
 * GET  /api/elite/candidates  — Elite bridging candidates
 * GET  /api/elite/nodes       — Query elite nodes
 * GET  /api/elite/terminals   — Terminal findings
 * POST /api/elite/rescan      — Trigger backfill scan
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/elite/stats', asyncHandler(async (_req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const result = await handleElite({ action: 'stats' });
    res.json(result);
}));

router.get('/elite/coverage', asyncHandler(async (_req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const result = await handleElite({ action: 'coverage' });
    if ((result as any).error) return res.status(404).json(result);
    res.json(result);
}));

router.get('/elite/gaps', asyncHandler(async (_req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const result = await handleElite({ action: 'gaps' });
    if ((result as any).error) return res.status(404).json(result);
    res.json(result);
}));

router.get('/elite/candidates', asyncHandler(async (req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const limit = parseInt(req.query.limit, 10) || 10;
    const result = await handleElite({ action: 'candidates', limit });
    res.json(result);
}));

router.get('/elite/nodes', asyncHandler(async (req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const params: Record<string, any> = { action: 'nodes' };
    if (req.query.domain) params.domain = req.query.domain;
    if (req.query.minGeneration) params.minGeneration = parseInt(req.query.minGeneration, 10);
    if (req.query.maxGeneration) params.maxGeneration = parseInt(req.query.maxGeneration, 10);
    if (req.query.limit) params.limit = parseInt(req.query.limit, 10);
    const result = await handleElite(params);
    res.json(result);
}));

router.get('/elite/terminals', asyncHandler(async (_req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const result = await handleElite({ action: 'terminals' });
    res.json(result);
}));

router.post('/elite/rescan', asyncHandler(async (req: any, res: any) => {
    const { handleElite } = await import('../handlers/elite.js');
    const limit = req.body?.limit ?? 50;
    const result = await handleElite({ action: 'rescan', limit });
    res.json(result);
}));

export default router;
