/**
 * Seed management REST API routes.
 *
 * Create individual or batch seeds, query existing seeds by domain,
 * list available domains, archive seeds, and list code generation languages.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/seeds
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// Create a new seed from user input
router.post('/seeds', asyncHandler(async (req, res) => {
    const { createSeed } = await import('../seeds.js');
    const { content, domain, contributor } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }

    const node = await createSeed(content, { domain, contributor });
    res.json({ success: true, seed: node });
}));

// Create multiple seeds at once
router.post('/seeds/batch', asyncHandler(async (req, res) => {
    const { createSeeds } = await import('../seeds.js');
    const { seeds } = req.body;

    if (!seeds || !Array.isArray(seeds)) {
        return res.status(400).json({ error: 'Seeds array is required' });
    }

    const results = await createSeeds(seeds);
    res.json({
        success: true,
        created: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    });
}));

// Get seeds, optionally filtered by domain
router.get('/seeds', asyncHandler(async (req, res) => {
    const { getSeeds } = await import('../seeds.js');
    const { domain, limit } = req.query;
    const seeds = await getSeeds({ domain, limit: parseInt(limit as string, 10) || 100 });
    res.json({ seeds });
}));

// Get available domains
router.get('/seeds/domains', asyncHandler(async (_req, res) => {
    const { getDomains } = await import('../seeds.js');
    const domains = await getDomains();
    res.json({ domains });
}));

// Archive seeds by domain
router.delete('/seeds/domain/:domain', asyncHandler(async (req, res) => {
    const { archiveSeeds } = await import('../seeds.js');
    const result = await archiveSeeds(req.params.domain);
    res.json({ success: true, ...result });
}));

// Get available languages for code generation
router.get('/config/languages', (_req, res) => {
    res.json({
        languages: [
            { value: 'javascript', label: 'JavaScript' },
            { value: 'typescript', label: 'TypeScript' },
            { value: 'python', label: 'Python' },
            { value: 'rust', label: 'Rust' },
            { value: 'go', label: 'Go' },
        ]
    });
});

export default router;
