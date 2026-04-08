/**
 * Breakthrough Registry REST routes
 *
 * Endpoints:
 * - GET /api/breakthroughs                        - List breakthroughs with filters
 * - GET /api/breakthroughs/stats                   - Aggregate statistics
 * - GET /api/breakthroughs/:id/documentation       - Fetch documentation snapshot
 * - POST /api/breakthroughs/:id/rebuild-documentation - Rebuild documentation
 * - PATCH /api/breakthroughs/:id/scores            - Update validation scores
 */

import { Router } from 'express';
import { queryRegistry, registryStats } from '../handlers/breakthrough-registry.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * GET /breakthroughs - List breakthroughs with filters
 *
 * Query params:
 *   project: filter by project name
 *   domain: filter by domain
 *   promotionSource: 'manual' | 'autonomous'
 *   limit: max results (default: 50)
 *   offset: pagination offset (default: 0)
 *   orderBy: 'promoted_at' | 'validation_composite' | 'domain' | 'project_name'
 *   direction: 'ASC' | 'DESC'
 */
router.get('/breakthroughs', asyncHandler(async (req, res) => {
    const result = await queryRegistry({
        project: req.query.project as string,
        domain: req.query.domain as string,
        promotionSource: req.query.promotionSource as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        orderBy: req.query.orderBy as string,
        direction: req.query.direction as string,
    });
    res.json(result);
}));

/**
 * GET /breakthroughs/stats - Aggregate statistics
 *
 * Query params:
 *   project: filter by project (optional)
 *   days: time window for "recent" count (default: 30)
 */
router.get('/breakthroughs/stats', asyncHandler(async (req, res) => {
    const result = await registryStats({
        project: req.query.project as string,
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
    });
    res.json(result);
}));

/**
 * GET /breakthroughs/:id/documentation - Fetch stored documentation snapshot
 */
router.get('/breakthroughs/:id/documentation', asyncHandler(async (req, res) => {
    const { getDocumentation } = await import('../handlers/breakthrough-registry.js');
    const doc = await getDocumentation(req.params.id);
    if (doc === null) {
        res.json({ documentation: null });
    } else {
        res.json({ documentation: doc });
    }
}));

/**
 * POST /breakthroughs/:id/rebuild-documentation - Rebuild from current DB state
 */
router.post('/breakthroughs/:id/rebuild-documentation', asyncHandler(async (req, res) => {
    const { rebuildDocumentation } = await import('../handlers/breakthrough-registry.js');
    const result = await rebuildDocumentation(req.params.id);
    res.json(result);
}));

/**
 * PATCH /breakthroughs/:id/scores - Update validation scores
 *
 * Body: { synthesis, novelty, testability, tension_resolution }
 */
router.patch('/breakthroughs/:id/scores', asyncHandler(async (req, res) => {
    const { updateBreakthroughScores } = await import('../handlers/breakthrough-registry.js');
    const result = await updateBreakthroughScores(req.params.id, req.body);
    res.json(result);
}));

export default router;
