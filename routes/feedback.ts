/**
 * Feedback REST routes
 *
 * Endpoints:
 * - POST /api/nodes/:id/feedback - Record feedback on a node
 * - GET /api/nodes/:id/feedback - Get feedback history for a node
 * - GET /api/feedback/stats - Get aggregated feedback statistics
 * - GET /api/feedback/unrated - Get nodes without feedback
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =============================================================================
// NODE FEEDBACK ENDPOINTS
// =============================================================================

/**
 * POST /nodes/:id/feedback - Record feedback on a node
 *
 * Body:
 *   rating: 1 (useful), 0 (not useful), -1 (harmful)
 *   source: 'human' | 'agent' | 'auto' (default: 'human')
 *   contributor: string (optional)
 *   note: string (optional)
 *   context: object (optional)
 */
router.post('/nodes/:id/feedback', asyncHandler(async (req, res) => {
    const { handleFeedback } = await import('../mcp-server.js');
    const result = await handleFeedback({
        action: 'rate',
        nodeId: req.params.id,
        ...req.body,
    }) as Record<string, any>;

    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
}));

/**
 * GET /nodes/:id/feedback - Get feedback history for a specific node
 */
router.get('/nodes/:id/feedback', asyncHandler(async (req, res) => {
    const { getNodeFeedback } = await import('../handlers/feedback.js');
    const feedback = await getNodeFeedback(req.params.id);
    res.json({
        nodeId: req.params.id,
        count: feedback.length,
        feedback,
    });
}));

// =============================================================================
// FEEDBACK AGGREGATION ENDPOINTS
// =============================================================================

/**
 * GET /feedback/stats - Get aggregated feedback statistics
 *
 * Query params:
 *   domain: filter by domain (optional)
 *   days: time window for recent feedback (default: 30)
 *   limit: max recent feedback items (default: 10)
 */
router.get('/feedback/stats', asyncHandler(async (req, res) => {
    const { handleFeedback } = await import('../mcp-server.js');
    const result = await handleFeedback({
        action: 'stats',
        domain: req.query.domain,
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    }) as Record<string, any>;

    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
}));

/**
 * GET /feedback/unrated - Get nodes without feedback
 *
 * Query params:
 *   domain: filter by domain (optional)
 *   nodeType: filter by node type (optional)
 *   limit: max results (default: 20)
 *   minWeight: minimum weight threshold (optional)
 *   maxWeight: maximum weight threshold (optional)
 *   orderBy: 'weight' | 'recent' | 'oldest' | 'salience' (default: 'weight')
 */
router.get('/feedback/unrated', asyncHandler(async (req, res) => {
    const { handleFeedback } = await import('../mcp-server.js');
    const result = await handleFeedback({
        action: 'unrated',
        domain: req.query.domain,
        nodeType: req.query.nodeType,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        minWeight: req.query.minWeight ? parseFloat(req.query.minWeight as string) : undefined,
        maxWeight: req.query.maxWeight ? parseFloat(req.query.maxWeight as string) : undefined,
        orderBy: req.query.orderBy,
    }) as Record<string, any>;

    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
}));

export default router;
