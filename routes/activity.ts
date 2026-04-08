/**
 * PODBIT v0.5 - ACTIVITY STREAM
 *
 * SSE endpoint for live server activity feed.
 * GET /activity/stream     — Server-Sent Events (live)
 * GET /activity/recent     — REST fallback (buffered events)
 * GET /activity/log        — Persistent activity log (database-backed)
 * GET /activity/categories — Distinct categories with counts
 */

import { Router } from 'express';
import { RC } from '../config/constants.js';
import { emitActivityLocal, onActivity, getRecentActivity } from '../services/event-bus.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/**
 * SSE stream — keeps connection open and pushes events as they happen.
 */
router.get('/activity/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    // Send buffered recent events as initial batch
    const recent = getRecentActivity();
    if (recent.length > 0) {
        res.write(`event: init\ndata: ${JSON.stringify(recent)}\n\n`);
    }

    // Subscribe to live events
    const unsubscribe = onActivity((event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, RC.timeouts.sseHeartbeatMs);

    // Cleanup on disconnect
    req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
    });
});

/**
 * REST fallback — returns buffered recent events.
 */
router.get('/activity/recent', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 200);
    res.json(getRecentActivity(limit));
});

/**
 * Cross-process event ingestion — allows the MCP stdio process
 * (which has its own event bus instance) to forward events to the
 * HTTP server's event bus so they appear in the GUI activity feed.
 */
router.post('/activity/emit', (req, res) => {
    const { category, type, message, detail } = req.body;
    if (!category || !message) {
        return res.status(400).json({ error: 'category and message required' });
    }
    emitActivityLocal(category, type || 'event', message, detail);
    res.status(204).end();
});

/**
 * Persistent activity log — query historical events from the database.
 * Supports filtering by category, type, text search, and time range.
 */
router.get('/activity/log', asyncHandler(async (req: any, res: any) => {
    const { query } = await import('../db/index.js');
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const category = req.query.category || undefined;
    const type = req.query.type || undefined;
    const search = req.query.search || undefined;
    const days = Math.min(parseFloat(req.query.days as string) || 2, 3);

    const conditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const params: any[] = [];
    let paramIdx = 1;

    if (category) {
        conditions.push(`category = $${paramIdx++}`);
        params.push(category);
    }
    if (type) {
        conditions.push(`type = $${paramIdx++}`);
        params.push(type);
    }
    if (search) {
        conditions.push(`(message LIKE $${paramIdx++} OR detail LIKE $${paramIdx++})`);
        params.push(`%${search}%`, `%${search}%`);
    }

    const where = conditions.join(' AND ');

    const events = await query(
        `SELECT * FROM activity_log WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
    );

    // Count query uses same conditions but without limit/offset params
    let countParamIdx = 1;
    const countConditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const countParams: any[] = [];
    if (category) { countConditions.push(`category = $${countParamIdx++}`); countParams.push(category); }
    if (type) { countConditions.push(`type = $${countParamIdx++}`); countParams.push(type); }
    if (search) { countConditions.push(`(message LIKE $${countParamIdx++} OR detail LIKE $${countParamIdx++})`); countParams.push(`%${search}%`, `%${search}%`); }
    const countWhere = countConditions.join(' AND ');

    const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM activity_log WHERE ${countWhere}`,
        countParams
    );

    // Parse detail JSON for each event
    for (const e of events) {
        if (e.detail && typeof e.detail === 'string') {
            try { e.detail = JSON.parse(e.detail); } catch { /* leave as string */ }
        }
    }

    res.json({ events, total });
}));

/**
 * Distinct categories with event counts — for filter chips in the GUI.
 */
router.get('/activity/categories', asyncHandler(async (req: any, res: any) => {
    const { query } = await import('../db/index.js');
    const days = Math.min(parseFloat(req.query.days as string) || 2, 3);

    const categories = await query(
        `SELECT category, COUNT(*) as count
         FROM activity_log
         WHERE created_at >= datetime('now', '-${days} days')
         GROUP BY category
         ORDER BY count DESC`,
        []
    );

    res.json({ categories });
}));

// =============================================================================
// EMBEDDING EVAL CALIBRATION — shadow mode result analysis
// =============================================================================

/**
 * Per-mode calibration stats from embedding_eval_results.
 * Shows pass/fail/review counts, score distributions (min/max/avg/p25/p50/p75),
 * and recent individual results for threshold tuning.
 */
router.get('/embedding-eval/stats', asyncHandler(async (req: any, res: any) => {
    const { query: dbQuery } = await import('../db/index.js');
    const days = Math.min(parseFloat(req.query.days as string) || 7, 30);
    const mode = req.query.mode ? parseInt(req.query.mode as string, 10) : undefined;

    // Per-mode aggregates
    const modeConditions = [`created_at >= datetime('now', '-${days} days')`];
    const modeParams: any[] = [];
    let idx = 1;
    if (mode !== undefined) {
        modeConditions.push(`mode = $${idx++}`);
        modeParams.push(mode);
    }
    const modeWhere = modeConditions.join(' AND ');

    const modeStats = await dbQuery(
        `SELECT mode, mode_name,
                result,
                COUNT(*) as count,
                ROUND(MIN(score), 4) as min_score,
                ROUND(MAX(score), 4) as max_score,
                ROUND(AVG(score), 4) as avg_score
         FROM embedding_eval_results
         WHERE ${modeWhere}
         GROUP BY mode, mode_name, result
         ORDER BY mode, result`,
        modeParams
    );

    // Score percentiles per mode (approximate via ordered scores)
    const percentiles = await dbQuery(
        `SELECT mode, mode_name,
                COUNT(*) as total,
                ROUND(AVG(score), 4) as avg_score
         FROM embedding_eval_results
         WHERE ${modeWhere}
         GROUP BY mode, mode_name
         ORDER BY mode`,
        modeParams
    );

    // Recent individual results (for inspection)
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const recentConditions = [`created_at >= datetime('now', '-${days} days')`];
    const recentParams: any[] = [];
    let rIdx = 1;
    if (mode !== undefined) {
        recentConditions.push(`mode = $${rIdx++}`);
        recentParams.push(mode);
    }
    const recentWhere = recentConditions.join(' AND ');

    const recent = await dbQuery(
        `SELECT node_id, mode, mode_name, result, score, compared_to,
                shadow_mode, created_at
         FROM embedding_eval_results
         WHERE ${recentWhere}
         ORDER BY created_at DESC
         LIMIT $${rIdx++}`,
        [...recentParams, limit]
    );

    // Score distribution buckets per mode (0.0-0.1, 0.1-0.2, ..., 0.9-1.0)
    const buckets = await dbQuery(
        `SELECT mode, mode_name,
                CAST(score * 10 AS INTEGER) as bucket,
                COUNT(*) as count
         FROM embedding_eval_results
         WHERE ${modeWhere}
         GROUP BY mode, mode_name, bucket
         ORDER BY mode, bucket`,
        modeParams
    );

    res.json({ modeStats, percentiles, recent, buckets, days });
}));

/**
 * Compare a specific node's embedding eval results against its LLM consultant score.
 */
router.get('/embedding-eval/node/:nodeId', asyncHandler(async (req: any, res: any) => {
    const { query: dbQuery } = await import('../db/index.js');
    const nodeId = req.params.nodeId;

    const evalResults = await dbQuery(
        `SELECT mode, mode_name, result, score, compared_to, instruction_used,
                shadow_mode, created_at
         FROM embedding_eval_results
         WHERE node_id = $1
         ORDER BY mode`,
        [nodeId]
    );

    // Get the node's population control outcome from activity log
    const pcOutcome = await dbQuery(
        `SELECT message, detail, created_at
         FROM activity_log
         WHERE category = 'cycle'
           AND type LIKE 'population_control_%'
           AND detail LIKE $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [`%${nodeId}%`]
    );

    for (const e of pcOutcome) {
        if (e.detail && typeof e.detail === 'string') {
            try { e.detail = JSON.parse(e.detail); } catch { /* leave as string */ }
        }
    }

    res.json({ nodeId, evalResults, populationControl: pcOutcome[0] || null });
}));

/**
 * Side-by-side calibration report: embedding eval vs LLM consultant outcomes.
 *
 * For each node that has both embedding eval results AND a consultant outcome,
 * shows what the embedding layer predicted vs what the consultant decided.
 * This is the core calibration tool for tuning embedding thresholds.
 *
 * Returns:
 * - summary: per-mode agreement/disagreement rates
 * - nodes: individual node comparisons with full detail
 * - thresholdAnalysis: for each mode, what threshold would achieve N% agreement
 */
router.get('/embedding-eval/report', asyncHandler(async (req: any, res: any) => {
    const { query: dbQuery } = await import('../db/index.js');
    const days = Math.min(parseFloat(req.query.days as string) || 7, 30);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 500);

    // Bulk fetch: all eval results in the time range (single query)
    const allChecks = await dbQuery(
        `SELECT node_id, mode, mode_name, result, score, compared_to, shadow_mode
         FROM embedding_eval_results
         WHERE created_at >= datetime('now', '-${days} days')
         ORDER BY node_id, mode`,
        []
    );

    if (allChecks.length === 0) {
        return res.json({
            message: 'No embedding eval results yet. Enable the embedding evaluation layer and wait for population control cycles to run.',
            summary: [], nodes: [], thresholdAnalysis: [],
        });
    }

    // Group checks by node_id
    const checksByNode = new Map<string, any[]>();
    for (const check of allChecks) {
        let arr = checksByNode.get(check.node_id);
        if (!arr) { arr = []; checksByNode.set(check.node_id, arr); }
        arr.push(check);
    }

    // Limit the number of nodes to process (most recent first by eval time)
    const nodeIds = [...checksByNode.keys()].slice(0, limit);

    // Bulk fetch: node info for all eval'd nodes (single query, batched)
    const nodeInfoMap = new Map<string, any>();
    const BATCH = 200;
    for (let i = 0; i < nodeIds.length; i += BATCH) {
        const batch = nodeIds.slice(i, i + BATCH);
        const placeholders = batch.map((_, j) => `$${j + 1}`).join(',');
        const rows = await dbQuery(
            `SELECT id, SUBSTR(content, 1, 120) as content_preview, domain,
                    weight, archived, cull_evaluated_at
             FROM nodes WHERE id IN (${placeholders})`,
            batch
        );
        for (const r of rows) nodeInfoMap.set(r.id, r);
    }

    // Bulk fetch: population control outcomes from activity_log (single query)
    // Use type filter + JSON extract instead of N separate LIKE queries
    const pcEvents = await dbQuery(
        `SELECT type, detail FROM activity_log
         WHERE category = 'cycle'
           AND type IN ('population_control_boost', 'population_control_demote', 'population_control_archive')
           AND created_at >= datetime('now', '-${days} days')
         ORDER BY created_at DESC`,
        []
    );

    // Build nodeId → consultant outcome lookup from the bulk fetch
    const consultantMap = new Map<string, any>();
    for (const evt of pcEvents) {
        let detail: any;
        try {
            detail = typeof evt.detail === 'string' ? JSON.parse(evt.detail) : evt.detail;
        } catch { continue; }
        const nodeId = detail?.nodeId;
        if (!nodeId || consultantMap.has(nodeId)) continue; // keep first (most recent due to ORDER BY)
        consultantMap.set(nodeId, {
            action: detail?.action || evt.type?.replace('population_control_', ''),
            compositeScore: detail?.compositeScore,
            accept: detail?.accept,
            reasoning: detail?.reasoning,
            embeddingFail: detail?.embeddingFail || false,
        });
    }

    // Build per-node comparisons
    const nodeComparisons: any[] = [];

    for (const nodeId of nodeIds) {
        const checks = checksByNode.get(nodeId) || [];
        const info = nodeInfoMap.get(nodeId);
        const consultantOutcome = consultantMap.get(nodeId) || null;

        const embeddingVerdict = checks.some((c: any) => c.result === 'FAIL') ? 'FAIL'
            : checks.some((c: any) => c.result === 'REVIEW') ? 'REVIEW' : 'PASS';

        const consultantVerdict = consultantOutcome
            ? (consultantOutcome.action === 'archive' ? 'ARCHIVE' : consultantOutcome.action === 'boost' ? 'BOOST' : 'DEMOTE')
            : 'UNKNOWN';

        let agreement = 'unknown';
        if (consultantOutcome) {
            if (embeddingVerdict === 'FAIL' && consultantVerdict === 'ARCHIVE') agreement = 'true_positive';
            else if (embeddingVerdict === 'PASS' && consultantVerdict !== 'ARCHIVE') agreement = 'true_negative';
            else if (embeddingVerdict === 'FAIL' && consultantVerdict !== 'ARCHIVE') agreement = 'false_positive';
            else if (embeddingVerdict === 'PASS' && consultantVerdict === 'ARCHIVE') agreement = 'false_negative';
            else if (embeddingVerdict === 'REVIEW') agreement = 'review';
        }

        nodeComparisons.push({
            nodeId,
            contentPreview: info?.content_preview || '',
            domain: info?.domain || '',
            archived: info?.archived || 0,
            embeddingChecks: checks,
            embeddingVerdict,
            consultantOutcome,
            consultantVerdict,
            agreement,
        });
    }

    // Build per-mode summary
    const modeSummary: Record<string, any> = {};
    for (const node of nodeComparisons) {
        for (const check of node.embeddingChecks) {
            const key = `mode_${check.mode}_${check.mode_name}`;
            if (!modeSummary[key]) {
                modeSummary[key] = {
                    mode: check.mode, modeName: check.mode_name,
                    total: 0, pass: 0, fail: 0, review: 0,
                    scores: [],
                    truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0,
                };
            }
            const m = modeSummary[key];
            m.total++;
            m.scores.push(check.score);
            if (check.result === 'PASS') m.pass++;
            else if (check.result === 'FAIL') m.fail++;
            else m.review++;

            if (node.consultantOutcome) {
                const consultantBad = node.consultantVerdict === 'ARCHIVE';
                if (check.result === 'FAIL' && consultantBad) m.truePositive++;
                else if (check.result !== 'FAIL' && !consultantBad) m.trueNegative++;
                else if (check.result === 'FAIL' && !consultantBad) m.falsePositive++;
                else if (check.result !== 'FAIL' && consultantBad) m.falseNegative++;
            }
        }
    }

    const summary = Object.values(modeSummary).map((m: any) => {
        m.scores.sort((a: number, b: number) => a - b);
        const len = m.scores.length;
        return {
            mode: m.mode,
            modeName: m.modeName,
            total: m.total,
            pass: m.pass, fail: m.fail, review: m.review,
            scoreMin: m.scores[0],
            scoreMax: m.scores[len - 1],
            scoreAvg: +(m.scores.reduce((a: number, b: number) => a + b, 0) / len).toFixed(4),
            scoreP25: m.scores[Math.floor(len * 0.25)],
            scoreMedian: m.scores[Math.floor(len * 0.5)],
            scoreP75: m.scores[Math.floor(len * 0.75)],
            truePositive: m.truePositive,
            trueNegative: m.trueNegative,
            falsePositive: m.falsePositive,
            falseNegative: m.falseNegative,
            precision: m.truePositive + m.falsePositive > 0
                ? +(m.truePositive / (m.truePositive + m.falsePositive)).toFixed(3) : null,
            recall: m.truePositive + m.falseNegative > 0
                ? +(m.truePositive / (m.truePositive + m.falseNegative)).toFixed(3) : null,
        };
    });

    res.json({
        days,
        totalNodes: nodeComparisons.length,
        summary,
        nodes: nodeComparisons,
    });
}));

export default router;
