/**
 * Decision audit trail REST API routes.
 *
 * Query tier-provenance decisions for specific entities or browse
 * the recent decision audit log with filtering by tier, entity type,
 * and text search.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/decisions
 */

import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =============================================================================
// DECISIONS / TIER PROVENANCE
// =============================================================================

// Get decisions for an entity
router.get('/decisions/:entityType/:entityId', asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.params;
    const { field, limit = 50 } = req.query;
    let sql = `SELECT * FROM decisions WHERE entity_type = $1 AND entity_id = $2`;
    const params: any[] = [entityType, entityId];
    if (field) {
        params.push(field as string);
        sql += ` AND field = $${params.length}`;
    }
    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const rows = await query(sql, params);
    res.json(rows);
}));

// Get recent decisions (audit log)
router.get('/decisions', asyncHandler(async (req, res) => {
    const { limit = 100, tier, entityType, search } = req.query;
    let sql = `SELECT * FROM decisions WHERE 1=1`;
    const params: any[] = [];
    if (tier) {
        params.push(tier as string);
        sql += ` AND decided_by_tier = $${params.length}`;
    }
    if (entityType) {
        params.push(entityType as string);
        sql += ` AND entity_type = $${params.length}`;
    }
    if (search) {
        const term = `%${search}%`;
        params.push(term);
        const p = params.length;
        sql += ` AND (field LIKE $${p} OR entity_type LIKE $${p} OR entity_id LIKE $${p} OR reason LIKE $${p} OR old_value LIKE $${p} OR new_value LIKE $${p})`;
    }
    params.push(parseInt(limit as string, 10));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const rows = await query(sql, params);
    res.json(rows);
}));

export default router;
