/**
 * Lab Verification REST API routes.
 *
 * Queue management (bulk enqueue, stats, cancel), verification pipeline
 * (verify, suggest, analyse, decompose), review workflow (approve/reject,
 * bulk review, re-evaluate), history/recent queries, and pruning.
 * Queue endpoints are registered before parameterized /:nodeId routes
 * to prevent Express matching "bulk"/"queue" as a nodeId.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/evm
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =========================================================================
// Queue endpoints (registered BEFORE parameterized routes)
// =========================================================================

router.post('/lab/queue/bulk', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'enqueue',
        nodeIds: req.body.nodeIds,
        priority: req.body.priority,
        guidance: req.body.guidance,
        maxRetries: req.body.maxRetries,
        queuedBy: req.body.queuedBy || 'bulk',
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/queue/stats', asyncHandler(async (_req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({ action: 'queue_stats' }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/queue', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'queue',
        status: req.query.status || undefined,
        nodeId: req.query.nodeId || undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/queue/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'enqueue',
        nodeId: req.params.nodeId,
        priority: req.body.priority,
        guidance: req.body.guidance,
        maxRetries: req.body.maxRetries,
        queuedBy: req.body.queuedBy || 'manual',
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.delete('/lab/queue/node/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'cancel',
        nodeId: req.params.nodeId,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.delete('/lab/queue/:id', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'cancel',
        queueId: parseInt(req.params.id, 10),
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// =========================================================================
// Lab verification pipeline endpoints
// =========================================================================

/**
 * Trigger the lab verification pipeline for a node. Returns 429 if budget is
 * exceeded (retry later). Pipeline failures and code errors return 200 with
 * result status so React Query cache invalidation fires correctly.
 */
router.post('/lab/verify/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'verify',
        nodeId: req.params.nodeId,
        guidance: req.body?.guidance || undefined,
    }) as Record<string, any>;

    // Budget exceeded — return 429 (retry later), not 400 (client error)
    if (result.status === 'skipped' && result.error?.includes('Budget exceeded')) {
        return res.status(429).json(result);
    }
    // Pipeline failures and code errors are recorded results, not client errors — return 200
    // so React Query onSuccess fires and cache is invalidated.
    res.json(result);
}));

router.post('/lab/suggest/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'suggest',
        nodeId: req.params.nodeId,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/analyse/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'analyse',
        nodeId: req.params.nodeId,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/history/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const slim = req.query.full !== 'true'; // Default slim for GUI; ?full=true for complete data
    const result = await handleLabVerify({
        action: 'history',
        nodeId: req.params.nodeId,
        slim,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/recent', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'recent',
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        status: req.query.status || undefined,
        verified: req.query.verified,
        minConfidence: req.query.minConfidence != null ? parseFloat(req.query.minConfidence as string) : undefined,
        maxConfidence: req.query.maxConfidence != null ? parseFloat(req.query.maxConfidence as string) : undefined,
        search: req.query.search || undefined,
        nodeId: req.query.nodeId || undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/reviews', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'reviews',
        status: req.query.status || undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

/**
 * Bulk approve/reject reviews. Registered before /:nodeId to prevent Express
 * from matching "bulk" as a nodeId parameter.
 */
router.post('/lab/review/bulk', asyncHandler(async (req: any, res: any) => {
    const { nodeIds, approved, reviewer } = req.body;
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
        return res.status(400).json({ error: 'nodeIds array required' });
    }
    if (typeof approved !== 'boolean') {
        return res.status(400).json({ error: 'approved (boolean) required' });
    }
    const { bulkApproveReview } = await import('../evm/feedback.js');
    const result = await bulkApproveReview(nodeIds, approved, reviewer || 'human');
    res.json(result);
}));

router.post('/lab/review/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'review',
        nodeId: req.params.nodeId,
        approved: req.body.approved,
        reviewer: req.body.reviewer,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/dismiss/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'dismiss',
        nodeId: req.params.nodeId,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

/** Fire-and-forget re-evaluation of all reviews. Returns 409 if already running. */
router.post('/lab/reevaluate-reviews', asyncHandler(async (req: any, res: any) => {
    const { getReevalProgress } = await import('../evm/feedback.js');
    const progress = await getReevalProgress();
    if (progress.status === 'running') {
        return res.status(409).json({ error: 'Re-evaluation already running', progress });
    }

    const rerunLLM = req.query.rerunLLM === 'true' || req.body?.rerunLLM === true;
    const nodeId = req.body?.nodeId || req.query.nodeId || undefined;

    // Fire-and-forget: return immediately, process in background
    const { handleLabVerify } = await import('../handlers/evm.js');
    handleLabVerify({
        action: 'reevaluate_reviews',
        rerunLLM,
        nodeId,
    }).catch((err: any) => {
        console.error('[evm] reevaluate-reviews background error:', err.message);
    });

    res.json({ started: true, rerunLLM, nodeId: nodeId || null });
}));

router.get('/lab/reevaluate-reviews/progress', asyncHandler(async (_req: any, res: any) => {
    const { getReevalProgress } = await import('../evm/feedback.js');
    res.json(await getReevalProgress());
}));

router.post('/lab/reevaluate-reviews/reset', asyncHandler(async (_req: any, res: any) => {
    const { resetReevalProgress, getReevalProgress } = await import('../evm/feedback.js');
    const progress = await getReevalProgress();
    if (progress.status === 'running') {
        return res.status(409).json({ error: 'Cannot reset while running' });
    }
    await resetReevalProgress();
    res.json({ ok: true });
}));

router.post('/lab/reevaluate', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'reevaluate',
        dryRun: req.query.dryRun === 'true' || req.body?.dryRun === true,
        nodeId: req.body?.nodeId || req.query.nodeId || undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/prune', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'prune',
        dryRun: req.query.dryRun === 'true' || req.body?.dryRun === true,
        olderThanDays: req.body?.olderThanDays ?? req.query.olderThanDays ?? undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/recover', asyncHandler(async (req: any, res: any) => {
    const { recoverOrphanedLabResults, backfillMissingEvidence } = await import('../evm/queue-worker.js');

    // First backfill evidence on existing records that have lab_job_id but empty evidence
    const backfill = await backfillMissingEvidence();

    // Then recover fully orphaned results
    const result = await recoverOrphanedLabResults();

    res.json({ ...result, backfilled: backfill.patched });
}));

router.get('/lab/stats', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'stats',
        days: req.query.days ? parseInt(req.query.days as string, 10) : undefined,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/lab/parents/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { query } = await import('../core.js');
    const parents = await query(`
        SELECT n.id, n.content, n.domain, n.node_type, n.created_at
        FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
        ORDER BY e.created_at
    `, [req.params.nodeId]);
    res.json({ parents });
}));

router.post('/lab/decompose/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'decompose',
        nodeId: req.params.nodeId,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/lab/decompose/:nodeId/apply', asyncHandler(async (req: any, res: any) => {
    const { handleLabVerify } = await import('../handlers/evm.js');
    const result = await handleLabVerify({
        action: 'decompose_apply',
        nodeId: req.params.nodeId,
        facts: req.body.facts,
        questions: req.body.questions,
    }) as Record<string, any>;

    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// =========================================================================
// Evidence & artifact serving
// =========================================================================

router.get('/lab/evidence/:evidenceId/artifacts', asyncHandler(async (req: any, res: any) => {
    const { extractArtifactsToTemp, listTempArtifacts } = await import('../lab/evidence.js');

    try {
        const tempDir = await extractArtifactsToTemp(req.params.evidenceId);
        const artifacts = listTempArtifacts(tempDir);
        res.json({ evidenceId: req.params.evidenceId, artifacts });
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
}));

router.get('/lab/evidence/:evidenceId/artifacts/:filename(*)', asyncHandler(async (req: any, res: any) => {
    const { extractArtifactsToTemp } = await import('../lab/evidence.js');
    const path = await import('path');

    try {
        const tempDir = await extractArtifactsToTemp(req.params.evidenceId);
        const requestedPath = req.params.filename;
        const normalized = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(tempDir, normalized);

        // Ensure within temp dir
        if (!filePath.startsWith(path.resolve(tempDir))) {
            res.status(403).json({ error: 'Path traversal denied' });
            return;
        }

        const { existsSync } = await import('fs');
        if (!existsSync(filePath)) {
            res.status(404).json({ error: 'Artifact not found' });
            return;
        }

        res.sendFile(path.resolve(filePath));
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
}));

export default router;
