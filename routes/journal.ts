/**
 * REST routes for graph journaling — timeline, pins, rollback.
 *
 * Mounted at /api/journal/* via routes/api.ts.
 *
 * @module routes/journal
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/journal/timeline — list timeline markers
 * Query params: limit, offset, since, until, eventType
 */
router.get('/journal/timeline', async (req: any, res: any) => {
    try {
        const { getTimeline } = await import('../core/journal.js');
        const result = await getTimeline({
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined,
            since: req.query.since as string,
            until: req.query.until as string,
            eventType: req.query.eventType as string,
        });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/journal/marker — create a manual timeline marker
 * Body: { label, eventType?, detail?, contributor? }
 */
router.post('/journal/marker', async (req: any, res: any) => {
    try {
        const { createTimelineMarker } = await import('../core/journal.js');
        const { label, eventType, detail, contributor } = req.body;
        if (!label) {
            return res.status(400).json({ error: 'label is required' });
        }
        const id = await createTimelineMarker(eventType || 'manual', label, detail, contributor);
        res.status(201).json({ id, message: 'Marker created' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/journal/entries — query raw journal entries
 * Query params: tableName, since, until, operation, limit, offset
 */
router.get('/journal/entries', async (req: any, res: any) => {
    try {
        const { getJournalEntries } = await import('../core/journal.js');
        const result = await getJournalEntries({
            tableName: req.query.tableName as string,
            since: req.query.since as string,
            until: req.query.until as string,
            operation: req.query.operation as string,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined,
        });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/journal/pin — pin nodes for rollback preservation
 * Body: { nodeIds: string[], pinGroup?: string }
 */
router.post('/journal/pin', async (req: any, res: any) => {
    try {
        const { pinNodes } = await import('../core/journal.js');
        const crypto = await import('crypto');
        const { nodeIds, pinGroup: providedGroup } = req.body;
        if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
            return res.status(400).json({ error: 'nodeIds array is required' });
        }
        const pinGroup = providedGroup || crypto.randomUUID();
        const result = await pinNodes(nodeIds, pinGroup);
        res.json({ ...result, pinGroup });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/journal/pins/:group — list pins in a group
 */
router.get('/journal/pins/:group', async (req: any, res: any) => {
    try {
        const { listPins } = await import('../core/journal.js');
        const pins = await listPins(req.params.group);
        res.json({ pins, count: pins.length });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/journal/pins/:group — remove a pin group
 */
router.delete('/journal/pins/:group', async (req: any, res: any) => {
    try {
        const { removePins } = await import('../core/journal.js');
        await removePins(req.params.group);
        res.json({ message: 'Pin group removed' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/journal/preview — preview rollback effects
 * Body: { targetTimestamp: string }
 */
router.post('/journal/preview', async (req: any, res: any) => {
    try {
        const { previewRollback } = await import('../core/journal.js');
        const { targetTimestamp } = req.body;
        if (!targetTimestamp) {
            return res.status(400).json({ error: 'targetTimestamp is required' });
        }
        const preview = await previewRollback(targetTimestamp);
        res.json(preview);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/journal/rollback — execute rollback to timestamp
 * Body: { targetTimestamp: string, pinGroup?: string, confirm: boolean }
 */
router.post('/journal/rollback', async (req: any, res: any) => {
    try {
        const { executeRollback } = await import('../core/journal.js');
        const { targetTimestamp, pinGroup, confirm } = req.body;
        if (!targetTimestamp) {
            return res.status(400).json({ error: 'targetTimestamp is required' });
        }
        if (!confirm) {
            return res.status(400).json({ error: 'Set confirm: true to execute rollback' });
        }
        const result = await executeRollback(targetTimestamp, pinGroup);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/journal/prune — prune old journal entries
 * Query param: olderThan (ISO 8601 timestamp)
 */
router.delete('/journal/prune', async (req: any, res: any) => {
    try {
        const { pruneJournal } = await import('../core/journal.js');
        const olderThan = req.query.olderThan as string;
        if (!olderThan) {
            return res.status(400).json({ error: 'olderThan query parameter is required' });
        }
        const result = await pruneJournal(olderThan);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/journal/stats — journal statistics
 */
router.get('/journal/stats', async (req: any, res: any) => {
    try {
        const { getJournalStats } = await import('../core/journal.js');
        const stats = await getJournalStats();
        res.json(stats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
