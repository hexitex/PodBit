/**
 * Context engine REST API routes.
 *
 * Manages per-turn knowledge delivery sessions for smaller LLMs.
 * Provides prepare/update cycle, session CRUD, token budgets, quality
 * metrics, cross-session insights, and aggregate statistics.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/context
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

/** Rank and select relevant knowledge nodes for a message, building a system prompt for a smaller LLM. */
router.post('/context/prepare', asyncHandler(async (req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({
        action: 'prepare',
        ...req.body,
    });
    res.json(result);
}));

/** Feed an LLM response back into the session. Triggers the feedback loop (boosts referenced nodes). */
router.post('/context/update', asyncHandler(async (req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({
        action: 'update',
        ...req.body,
    });
    res.json(result);
}));

/** Get session state: accumulated topics, domains, turn count, last context. */
router.get('/context/session/:id', asyncHandler(async (req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({
        action: 'session',
        sessionId: req.params.id,
    });
    res.json(result);
}));

// GET /context/sessions — List all sessions
router.get('/context/sessions', asyncHandler(async (_req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({ action: 'sessions' });
    res.json(result);
}));

// DELETE /context/session/:id — Delete a session
router.delete('/context/session/:id', asyncHandler(async (req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({
        action: 'delete',
        sessionId: req.params.id,
    });
    res.json(result);
}));

// GET /context/budgets — Get token budget configuration
router.get('/context/budgets', asyncHandler(async (_req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({ action: 'budgets' });
    res.json(result);
}));

/** Per-turn quality metrics: knowledge utilization, response grounding, topic coverage, efficiency. */
router.get('/context/metrics/:id', asyncHandler(async (req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const result = await handleContext({
        action: 'metrics',
        sessionId: req.params.id,
    });
    res.json(result);
}));

/** Cross-session learning data: persisted topic weights and node usage frequency. */
router.get('/context/insights', asyncHandler(async (_req, res) => {
    const { query: dbQuery } = await import('../db.js');
    const insights = await dbQuery(
        `SELECT topic, weight, usage_count, domain, cluster_terms, last_seen, first_seen
         FROM session_insights
         ORDER BY weight * usage_count DESC
         LIMIT 50`
    );
    const nodeUsage = await dbQuery(
        `SELECT node_id, times_delivered, times_used, avg_similarity, last_used
         FROM session_node_usage
         ORDER BY times_used DESC
         LIMIT 20`
    );
    res.json({
        insights: insights.map((i: any) => ({
            ...i,
            cluster_terms: i.cluster_terms ? JSON.parse(i.cluster_terms) : [],
        })),
        nodeUsage,
        totalInsights: insights.length,
        totalNodeUsage: nodeUsage.length,
    });
}));

// DELETE /context/insights — Clear all cross-session insights
router.delete('/context/insights', asyncHandler(async (_req, res) => {
    const { query: dbQuery } = await import('../db.js');
    await dbQuery('DELETE FROM session_insights');
    await dbQuery('DELETE FROM session_node_usage');
    res.json({ success: true, message: 'All cross-session insights cleared' });
}));

/** Aggregate stats: active session count, total turns, top topics, persisted insight counts. */
router.get('/context/aggregate', asyncHandler(async (_req, res) => {
    const { handleContext } = await import('../mcp-server.js');
    const { queryOne: dbQueryOne } = await import('../db.js');

    // In-memory session stats
    const sessionsResult = await handleContext({ action: 'sessions' }) as { sessions?: any[] };
    const sessions = sessionsResult.sessions || [];

    // DB-persisted insights stats
    const insightStats = await dbQueryOne(
        `SELECT COUNT(*) as total, COUNT(DISTINCT domain) as domains, AVG(usage_count) as avgUsage
         FROM session_insights`
    );

    res.json({
        activeSessions: sessions.length,
        totalTurns: sessions.reduce((sum: number, s: any) => sum + s.turnCount, 0),
        topTopics: sessions
            .flatMap((s: any) => s.topics || [])
            .reduce((acc: any, t: string) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {}),
        persistedInsights: parseInt(insightStats?.total || 0, 10),
        insightDomains: parseInt(insightStats?.domains || 0, 10),
        avgUsageCount: parseFloat(insightStats?.avgUsage || 0),
    });
}));

export default router;
