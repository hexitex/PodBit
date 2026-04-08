/**
 * Lab Registry REST API routes.
 *
 * CRUD + health check + capabilities for registered lab servers.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/lab-registry
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// Stats (before parameterized routes)
router.get('/lab-registry/stats', asyncHandler(async (_req: any, res: any) => {
    const { listLabs } = await import('../lab/registry.js');
    const labs = await listLabs();
    const online = labs.filter(l => l.healthStatus === 'ok').length;
    const offline = labs.filter(l => l.healthStatus === 'offline').length;
    const degraded = labs.filter(l => l.healthStatus === 'degraded').length;
    const totalQueueDepth = labs.reduce((sum, l) => sum + l.queueDepth, 0);
    res.json({ total: labs.length, online, offline, degraded, totalQueueDepth, enabled: labs.filter(l => l.enabled).length });
}));

// List
router.get('/lab-registry', asyncHandler(async (req: any, res: any) => {
    const { listLabs } = await import('../lab/registry.js');
    const filters: any = {};
    if (req.query.enabled !== undefined) filters.enabled = req.query.enabled === 'true';
    if (req.query.healthStatus) filters.healthStatus = req.query.healthStatus;
    const labs = await listLabs(filters);
    res.json({ labs });
}));

// Get
router.get('/lab-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { getLab } = await import('../lab/registry.js');
    const lab = await getLab(req.params.id);
    if (!lab) { res.status(404).json({ error: 'Lab not found' }); return; }
    res.json(lab);
}));

// Register
router.post('/lab-registry', asyncHandler(async (req: any, res: any) => {
    const { createLab } = await import('../lab/registry.js');
    if (!req.body.name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    // URL is required UNLESS portKey is set, in which case URL is overlaid from PORTS at read time
    // and the stored column is just a hint. We accept an empty string in that case.
    if (!req.body.portKey && !req.body.url) {
        res.status(400).json({ error: 'url is required when portKey is not set' });
        return;
    }
    if (req.body.portKey && !req.body.url) {
        req.body.url = ''; // hint placeholder; resolveLabUrl ignores this when portKey is set
    }
    const lab = await createLab(req.body);
    res.status(201).json(lab);
}));

// Update
router.put('/lab-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { updateLab, getLab } = await import('../lab/registry.js');
    const existing = await getLab(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Lab not found' }); return; }
    await updateLab(req.params.id, req.body);
    const updated = await getLab(req.params.id);
    res.json(updated);
}));

// Delete
router.delete('/lab-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { deleteLab } = await import('../lab/registry.js');
    const deleted = await deleteLab(req.params.id);
    if (!deleted) { res.status(404).json({ error: 'Lab not found' }); return; }
    res.json({ message: 'Deleted' });
}));

// Enable
router.post('/lab-registry/:id/enable', asyncHandler(async (req: any, res: any) => {
    const { enableLab } = await import('../lab/registry.js');
    await enableLab(req.params.id);
    res.json({ message: 'Enabled' });
}));

// Disable
router.post('/lab-registry/:id/disable', asyncHandler(async (req: any, res: any) => {
    const { disableLab } = await import('../lab/registry.js');
    await disableLab(req.params.id);
    res.json({ message: 'Disabled' });
}));

// Health check
router.post('/lab-registry/:id/health', asyncHandler(async (req: any, res: any) => {
    const { checkSingleLab } = await import('../lab/health.js');
    try {
        const result = await checkSingleLab(req.params.id);
        res.json(result);
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
}));

// Capabilities
router.get('/lab-registry/:id/capabilities', asyncHandler(async (req: any, res: any) => {
    const { getLab } = await import('../lab/registry.js');
    const { fetchCapabilities, buildAuthHeadersFromRegistry } = await import('../lab/client.js');

    const lab = await getLab(req.params.id);
    if (!lab) { res.status(404).json({ error: 'Lab not found' }); return; }

    try {
        const authHeaders = buildAuthHeadersFromRegistry(lab);
        const capabilities = await fetchCapabilities(lab.url, authHeaders);
        res.json(capabilities);
    } catch (err: any) {
        res.status(502).json({ error: `Failed to fetch capabilities: ${err.message}` });
    }
}));

// Context prompt (editable lab description for spec extractor)
router.get('/lab-registry/:id/context-prompt', asyncHandler(async (req: any, res: any) => {
    const { getLab } = await import('../lab/registry.js');
    const lab = await getLab(req.params.id);
    if (!lab) { res.status(404).json({ error: 'Lab not found' }); return; }
    res.json({ contextPrompt: lab.contextPrompt || '' });
}));

router.put('/lab-registry/:id/context-prompt', asyncHandler(async (req: any, res: any) => {
    const { updateLab, getLab } = await import('../lab/registry.js');
    const existing = await getLab(req.params.id);
    if (!existing) { res.status(404).json({ error: 'Lab not found' }); return; }
    // Mark as user-edited so health checker stops overwriting
    const { systemQuery } = await import('../db/sqlite-backend.js');
    await systemQuery('UPDATE lab_registry SET context_prompt = $1, context_prompt_edited = 1 WHERE id = $2',
        [req.body.contextPrompt ?? null, req.params.id]);
    res.json({ ok: true });
}));

export default router;
