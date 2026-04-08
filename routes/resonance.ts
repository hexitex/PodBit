/**
 * Resonance graph REST API routes.
 *
 * CRUD and graph operations for knowledge graph nodes, edges, and keywords.
 * Includes node query, lineage, voice, promote, demote, edit, domain change,
 * avatar generation, graph visualization, and keyword aggregation.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/resonance
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { query, queryOne } from '../db.js';


const router = Router();

// =============================================================================
// RESONANCE ENDPOINTS
// =============================================================================

router.get('/resonance/nodes', asyncHandler(async (req, res) => {
    const { handleQuery } = await import('../mcp-server.js');
    const result = await handleQuery(req.query);
    res.json(result);
}));

router.get('/resonance/nodes/:id', asyncHandler(async (req, res) => {
    const { handleGet } = await import('../mcp-server.js');
    const result = await handleGet({ id: req.params.id });
    res.json(result);
}));

router.get('/resonance/nodes/:id/resolved', asyncHandler(async (req, res) => {
    const { resolveContent } = await import('../core/number-variables.js');
    const { queryOne } = await import('../core.js');
    const node = await queryOne('SELECT content FROM nodes WHERE id = $1 AND archived = 0', [req.params.id]);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const resolved = await resolveContent(node.content);
    res.json({ resolved });
}));

router.get('/resonance/nodes/:id/lineage', asyncHandler(async (req, res) => {
    const { handleLineage } = await import('../mcp-server.js');
    const result = await handleLineage({
        id: req.params.id,
        depth: parseInt(req.query.depth as string, 10) || 2,
    });
    res.json(result);
}));

router.post('/resonance/nodes', asyncHandler(async (req, res) => {
    const { handlePropose } = await import('../mcp-server.js');
    const result = await handlePropose(req.body);
    res.json(result);
}));

// Batch avatar generation — must be BEFORE :id wildcard routes
// Generates SVG data URIs locally via @dicebear/core and stores in DB — no external requests
router.post('/resonance/nodes/avatars/batch', asyncHandler(async (req, res) => {
    const { limit = 500 } = req.body;
    const nodes = await query(
        `SELECT id, content, node_type, domain FROM nodes
         WHERE avatar_url IS NULL AND archived = FALSE AND node_type != 'raw' AND domain IS NOT NULL
         LIMIT $1`, [limit]
    );
    const { generateAvatar } = await import('../core/avatar-gen.js');
    let count = 0;
    for (const node of nodes) {
        try {
            await generateAvatar(node.id, node.content, node.node_type, node.domain);
            count++;
        } catch (err: any) {
            console.error(`[avatar-batch] Failed for ${node.id.slice(0, 8)}: ${err.message}`);
        }
    }
    const remaining = await queryOne(
        `SELECT COUNT(*) as count FROM nodes WHERE avatar_url IS NULL AND archived = FALSE AND node_type != 'raw' AND domain IS NOT NULL`
    );
    res.json({ generated: count, remaining: remaining?.count || 0 });
}));

// Batch node name lookup — resolves IDs to human-readable names
router.post('/resonance/nodes/names', asyncHandler(async (req, res) => {
    const ids: string[] = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) return res.json({});
    const limited = ids.slice(0, 200);
    const placeholders = limited.map((_, i) => `$${i + 1}`).join(',');
    const rows = await query(
        `SELECT id, name, SUBSTR(content, 1, 60) as content_preview FROM nodes WHERE id IN (${placeholders})`,
        limited
    );
    const names: Record<string, string> = {};
    for (const r of rows as any[]) {
        const suffix = r.id.replace(/-/g, '').slice(0, 3).toUpperCase();
        if (r.name) {
            names[r.id] = r.name;
        } else {
            const preview = r.content_preview?.split(/[.!?\n]/)[0]?.trim();
            names[r.id] = preview ? `${preview.slice(0, 50)}-${suffix}` : r.id.slice(0, 8);
        }
    }
    res.json(names);
}));

// Manual avatar regeneration for a single node
router.post('/resonance/nodes/:id/avatar', asyncHandler(async (req, res) => {
    const node = await queryOne('SELECT id, content, node_type, domain FROM nodes WHERE id = $1', [req.params.id]);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const { generateAvatar } = await import('../core/avatar-gen.js');
    const avatarUrl = await generateAvatar(node.id, node.content, node.node_type, node.domain);
    res.json({ avatarUrl });
}));

router.post('/resonance/nodes/:id/voice', asyncHandler(async (req, res) => {
    const { handleVoice } = await import('../mcp-server.js');
    const result = await handleVoice({
        nodeId: req.params.id,
        ...req.body,
    });
    res.json(result);
}));

router.post('/resonance/nodes/:id/promote', asyncHandler(async (req, res) => {
    const { handlePromote } = await import('../mcp-server.js');
    const result = await handlePromote({
        nodeId: req.params.id,
        ...req.body,
    });
    res.json(result);
}));

// Demote a "possible" node back to synthesis
router.post('/resonance/nodes/:id/demote', asyncHandler(async (req, res) => {
    const { handleDemote } = await import('../handlers/elevation.js');
    const result = await handleDemote({
        nodeId: req.params.id,
        ...req.body,
    });
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
}));

// Delete/archive/junk a node — delegates to the canonical handler (includes EVM cleanup, integrity logging, dream_cycles fixup)
router.delete('/resonance/nodes/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { mode = 'junk', reason } = req.body || {};

    const { handleRemove } = await import('../handlers/graph.js');
    const result = await handleRemove({ nodeId: id, mode, reason });

    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
}));

// Edit a node's content (with embedding regeneration and audit trail)
router.put('/resonance/nodes/:id/content', async (req, res, next) => {
    try {
        const { content, contributor = 'gui:user', reason } = req.body;
        if (!content) {
            return res.status(400).json({ error: 'content is required' });
        }
        const { editNodeContent } = await import('../core.js');
        const result = await editNodeContent(req.params.id, content, contributor, reason);
        res.json({ success: true, ...result });
    } catch (err: any) {
        if (err.message.includes('not found') || err.message.includes('archived')) {
            return res.status(404).json({ error: err.message });
        }
        next(err);
    }
});

// Toggle brief exclusion for a node
router.put('/resonance/nodes/:id/excluded', async (req, res, next) => {
    try {
        const { excluded, contributor = 'gui:user', reason } = req.body;
        if (excluded === undefined) {
            return res.status(400).json({ error: 'excluded (boolean) is required' });
        }
        const { setExcludedFromBriefs } = await import('../core.js');
        const result = await setExcludedFromBriefs(req.params.id, !!excluded, contributor, reason);
        res.json({ success: true, ...result });
    } catch (err: any) {
        if (err.message.includes('not found') || err.message.includes('archived')) {
            return res.status(404).json({ error: err.message });
        }
        next(err);
    }
});

/**
 * Change a node's domain. Enforces tier hierarchy (human > LLM > system) — returns
 * 403 if a lower-tier decision would override a higher-tier one. Auto-creates a
 * partition for the new domain via ensurePartition and logs the decision audit trail.
 */
router.put('/resonance/nodes/:id/domain', asyncHandler(async (req, res) => {
    const { domain, decidedByTier = 'human' } = req.body;
        if (domain === undefined) {
            return res.status(400).json({ error: 'domain is required' });
        }

        // Check tier hierarchy enforcement
        const { canOverride, logDecision, ensurePartition } = await import('../core.js');
        const override = await canOverride('node', req.params.id, 'domain', decidedByTier);
        if (!override.allowed) {
            return res.status(403).json({ error: override.reason, blocked: true });
        }

        // Get old value for audit trail
        const existing = await query(`SELECT domain FROM nodes WHERE id = $1`, [req.params.id]);
        const oldDomain = existing[0]?.domain || null;

        await query(`UPDATE nodes SET domain = $1 WHERE id = $2`, [domain || null, req.params.id]);

        // Auto-partition the new domain
        if (domain) {
            await ensurePartition(domain, decidedByTier);
        }

        // Log the decision
        await logDecision('node', req.params.id, 'domain', oldDomain, domain || null, decidedByTier, 'api', `Domain changed via API`);

        res.json({ success: true, id: req.params.id, domain: domain || null });
}));

router.get('/resonance/stats', asyncHandler(async (req, res) => {
    const { handleStats } = await import('../mcp-server.js');
    const result = await handleStats(req.query);
    res.json(result);
}));

// Aggregated keyword counts for filter UI
router.get('/resonance/keywords', asyncHandler(async (_req, res) => {
    const { query } = await import('../db.js');
    const rows = await query(`
        SELECT nk.keyword, COUNT(*) as count
        FROM node_keywords nk
        JOIN nodes n ON n.id = nk.node_id
        WHERE n.archived = 0 AND n.node_type != 'raw'
        GROUP BY nk.keyword
        ORDER BY count DESC
        LIMIT 100
    `);
    res.json({ keywords: rows });
}));

/**
 * Graph visualization endpoint. Fetches filtered nodes via handleQuery, then
 * bulk-fetches edges and keywords using json_each() (avoids ANY() expansion
 * which creates thousands of bind params for large graphs). Truncates content
 * to 200 chars per node.
 */
router.get('/resonance/graph', asyncHandler(async (req, res) => {
    const { handleQuery } = await import('../mcp-server.js');

        // Use handleQuery for filtering, with a higher default limit for graphs
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 500, 3000);
        const queryParams = {
            ...req.query,
            limit,
        };

        // Get filtered nodes using the same query handler as /nodes
        const result = await handleQuery(queryParams);
        const graphNodes = result.nodes || [];

        // Get edges and keywords using json_each() instead of ANY() expansion
        // ANY() with 1700 IDs creates 3400+ bind params, blocking the event loop
        const nodeIds = graphNodes.map((n: any) => n.id);
        const nodeIdsJson = JSON.stringify(nodeIds);
        let edges: any[] = [];
        if (nodeIds.length > 0) {
            edges = await query(`
                SELECT source_id, target_id, edge_type
                FROM edges
                WHERE source_id IN (SELECT value FROM json_each($1))
                  AND target_id IN (SELECT value FROM json_each($1))
            `, [nodeIdsJson]);
        }

        // Bulk-fetch keywords for all nodes
        const keywordMap: Record<string, string[]> = {};
        if (nodeIds.length > 0) {
            try {
                const kwRows = await query(
                    `SELECT node_id, keyword FROM node_keywords WHERE node_id IN (SELECT value FROM json_each($1))`,
                    [nodeIdsJson]
                );
                for (const row of kwRows) {
                    if (!keywordMap[row.node_id]) keywordMap[row.node_id] = [];
                    keywordMap[row.node_id].push(row.keyword);
                }
            } catch { /* node_keywords table may not exist yet */ }
        }

        // Get total count
        const totalResult = await query(`SELECT COUNT(*) as count FROM nodes WHERE archived = FALSE AND node_type != 'raw'`);

        // Compute child/ancestor counts from edges
        const childCountMap: Record<string, number> = {};
        const ancestorCountMap: Record<string, number> = {};
        for (const e of edges) {
            // parent → child edge: source is parent, target is child
            childCountMap[e.source_id] = (childCountMap[e.source_id] || 0) + 1;
            ancestorCountMap[e.target_id] = (ancestorCountMap[e.target_id] || 0) + 1;
        }

        res.json({
            nodes: graphNodes.map((n: any) => ({
                id: n.id,
                content: n.content?.slice(0, 200) + (n.content?.length > 200 ? '...' : ''),
                type: n.type,
                trajectory: n.trajectory,
                domain: n.domain,
                weight: n.weight,
                salience: n.salience,
                specificity: n.specificity,
                feedback_rating: n.feedback_rating ?? null,
                excluded: !!n.excluded,
                metadata: n.metadata || null,
                keywords: keywordMap[n.id] || [],
                createdAt: n.createdAt || null,
                childCount: childCountMap[n.id] || 0,
                ancestorCount: ancestorCountMap[n.id] || 0,
            })),
            edges: edges.map((e: any) => ({
                source: e.source_id,
                target: e.target_id,
                type: e.edge_type,
            })),
            summary: {
                total: parseInt(totalResult[0]?.count || 0, 10),
                warm: graphNodes.length,
                cold: result.total - graphNodes.length,
            }
        });
}));

export default router;
