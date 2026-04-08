/**
 * Keywords REST routes
 *
 * Endpoints:
 * - POST /api/keywords/backfill-domains - Backfill LLM synonyms for all domains
 * - POST /api/keywords/backfill-nodes   - Backfill keywords for nodes without any
 * - GET  /api/keywords/node/:id         - Get keywords for a specific node
 */

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

/**
 * POST /keywords/backfill-domains
 * Trigger LLM synonym generation for all domains missing LLM synonyms.
 */
router.post('/keywords/backfill-domains', async (_req, res) => {
    try {
        const { backfillDomainSynonyms } = await import('../core/keywords.js');
        const result = await backfillDomainSynonyms();
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /keywords/backfill-nodes?limit=20
 * Generate keywords (and names) for nodes missing keywords or names.
 */
router.post('/keywords/backfill-nodes', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string, 10) || 20;
        const { backfillNodeKeywords } = await import('../core/keywords.js');
        const result = await backfillNodeKeywords(limit);
        res.json({ success: true, ...result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /keywords/node/:id
 * Get keywords for a specific node.
 */
router.get('/keywords/node/:id', async (req, res) => {
    try {
        const rows = await query('SELECT keyword, source, created_at FROM node_keywords WHERE node_id = $1', [req.params.id]);
        res.json({ nodeId: req.params.id, keywords: rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
