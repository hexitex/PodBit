/**
 * Database management REST API routes.
 *
 * Provides stats, destructive clear operations (nodes by type/domain, patterns,
 * templates, caches, decisions, everything), backup/restore, embedding status,
 * project management (list/save/load/new/delete/interview/manifest), and
 * number variable CRUD with backfill.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/database
 */

import { Router } from 'express';
import { query, queryOne, backupDatabase, restoreDatabase, listBackups } from '../db.js';
import { invalidateKnowledgeCache } from '../handlers/knowledge.js';
import { handleProjects } from '../handlers/projects.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =============================================================================
// DATABASE INFO
// =============================================================================

router.get('/database/info', (_req, res) => {
    res.json({
        backend: 'sqlite',
        label: 'SQLite',
    });
});

// =============================================================================
// DATABASE MANAGEMENT (DANGEROUS)
// =============================================================================

// Get database stats
router.get('/database/stats', asyncHandler(async (_req, res) => {
    const nodeCount = await query(`SELECT COUNT(*) as count FROM nodes`);
    const edgeCount = await query(`SELECT COUNT(*) as count FROM edges`);
    const patternCount = await query(`SELECT COUNT(*) as count FROM abstract_patterns`);
    const templateCount = await query(`SELECT COUNT(*) as count FROM templates`);

    let docJobCount = 0;
    try {
        const sjc = await query(`SELECT COUNT(*) as count FROM scaffold_jobs`);
        docJobCount = parseInt(sjc[0]?.count || 0, 10);
    } catch { /* table may not exist */ }

    let knowledgeCacheCount = 0;
    try {
        const kcc = await query(`SELECT COUNT(*) as count FROM knowledge_cache`);
        knowledgeCacheCount = parseInt(kcc[0]?.count || 0, 10);
    } catch { /* table may not exist */ }

    let decisionCount = 0;
    try {
        const dc = await query(`SELECT COUNT(*) as count FROM decisions`);
        decisionCount = parseInt(dc[0]?.count || 0, 10);
    } catch { /* table may not exist */ }

    const nodesByType = await query(`
        SELECT node_type, COUNT(*) as count
        FROM nodes
        GROUP BY node_type
        ORDER BY count DESC
    `);

    const nodesByDomain = await query(`
        SELECT COALESCE(domain, 'unset') as domain, COUNT(*) as count
        FROM nodes
        GROUP BY domain
        ORDER BY count DESC
    `);

    res.json({
        nodes: parseInt(nodeCount[0]?.count || 0, 10),
        edges: parseInt(edgeCount[0]?.count || 0, 10),
        patterns: parseInt(patternCount[0]?.count || 0, 10),
        templates: parseInt(templateCount[0]?.count || 0, 10),
        docJobs: docJobCount,
        knowledgeCache: knowledgeCacheCount,
        decisions: decisionCount,
        byType: nodesByType.map(r => ({ type: r.node_type, count: parseInt(r.count, 10) })),
        byDomain: nodesByDomain.map(r => ({ domain: r.domain, count: parseInt(r.count, 10) })),
    });
}));

/**
 * Delete all nodes of a given type. Cascades to edges, dream_cycles, voicings,
 * abstract pattern associations, session node usage, and flushes knowledge cache.
 */
router.delete('/database/nodes/type/:type', asyncHandler(async (req, res) => {
    const { type } = req.params;
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    const validTypes = ['seed', 'proto', 'voiced', 'breakthrough', 'raw'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Get node IDs to delete
    const nodeIds = await query(`SELECT id FROM nodes WHERE node_type = $1`, [type]);
    const ids = nodeIds.map(n => n.id);

    if (ids.length > 0) {
        // Delete edges involving these nodes
        await query(`DELETE FROM edges WHERE source_id = ANY($1) OR target_id = ANY($1)`, [ids]);
        // Clean up referencing records for removed nodes
        try { await query(`DELETE FROM dream_cycles WHERE node_a_id = ANY($1) OR node_b_id = ANY($1) OR child_node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM voicings WHERE proto_node_id = ANY($1) OR voiced_node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM node_abstract_patterns WHERE node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM session_node_usage WHERE node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        // Delete the nodes
        await query(`DELETE FROM nodes WHERE node_type = $1`, [type]);
        // Clear all knowledge cache (any domain may be affected)
        try { await query(`DELETE FROM knowledge_cache`); } catch { /* may not exist */ }
    }

    res.json({
        success: true,
        deleted: { nodes: ids.length, type },
        message: `Deleted ${ids.length} ${type} nodes and associated stats`,
    });
}));

// Clear nodes by domain
router.delete('/database/nodes/domain/:domain', asyncHandler(async (req, res) => {
    const { domain } = req.params;
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    // Handle 'unset' domain specially
    const domainCondition = domain === 'unset' ? 'domain IS NULL' : 'domain = $1';
    const params = domain === 'unset' ? [] : [domain];

    // Get node IDs to delete
    const nodeIds = await query(`SELECT id FROM nodes WHERE ${domainCondition}`, params);
    const ids = nodeIds.map(n => n.id);

    if (ids.length > 0) {
        // Delete edges involving these nodes
        await query(`DELETE FROM edges WHERE source_id = ANY($1) OR target_id = ANY($1)`, [ids]);
        // Clean up referencing records for removed nodes
        try { await query(`DELETE FROM dream_cycles WHERE node_a_id = ANY($1) OR node_b_id = ANY($1) OR child_node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM voicings WHERE proto_node_id = ANY($1) OR voiced_node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM node_abstract_patterns WHERE node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        try { await query(`DELETE FROM session_node_usage WHERE node_id = ANY($1)`, [ids]); } catch { /* may not exist */ }
        // Delete the nodes
        await query(`DELETE FROM nodes WHERE ${domainCondition}`, params);
        // Invalidate knowledge cache for this domain (marks stale + triggers background warming)
        await invalidateKnowledgeCache(domain);
    }

    res.json({
        success: true,
        deleted: { nodes: ids.length, domain },
        message: `Deleted ${ids.length} nodes from domain "${domain}" and associated stats`,
    });
}));

// Clear all nodes (keeps patterns, templates, partitions, and config)
router.delete('/database/nodes', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE_ALL_NODES') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE_ALL_NODES" } to proceed' });
    }

    const beforeNodes = await query(`SELECT COUNT(*) as count FROM nodes`);
    const beforeEdges = await query(`SELECT COUNT(*) as count FROM edges`);

    // Core data
    await query(`DELETE FROM edges`);
    await query(`DELETE FROM nodes`);

    // Orphaned references and stats
    try { await query(`DELETE FROM dream_cycles`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM voicings`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM decisions`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM knowledge_cache`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM session_insights`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM session_node_usage`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM node_abstract_patterns`); } catch { /* may not exist */ }

    // Clear in-memory caches
    try {
        const { clearAll } = await import('../vector/embedding-cache.js');
        clearAll();
    } catch { /* cache module may not be loaded */ }

    res.json({
        success: true,
        deleted: {
            nodes: parseInt(beforeNodes[0]?.count || 0, 10),
            edges: parseInt(beforeEdges[0]?.count || 0, 10),
        },
        message: 'All nodes, edges, synthesis cycles, voicings, decisions, caches, and session data cleared',
    });
}));

// Clear all patterns (abstract patterns + node associations)
router.delete('/database/patterns', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    await query(`DELETE FROM node_abstract_patterns`);
    const result = await query(`DELETE FROM abstract_patterns RETURNING id`);

    res.json({
        success: true,
        deleted: { patterns: result.length },
        message: `Deleted ${result.length} patterns`,
    });
}));

// Clear all templates
router.delete('/database/templates', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    const result = await query(`DELETE FROM templates RETURNING id`);

    res.json({
        success: true,
        deleted: { templates: result.length },
        message: `Deleted ${result.length} templates`,
    });
}));

// Clear all doc generation jobs
router.delete('/database/doc-jobs', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    const result = await query(`DELETE FROM scaffold_jobs RETURNING id`);

    res.json({
        success: true,
        deleted: { docJobs: result.length },
        message: `Deleted ${result.length} doc jobs`,
    });
}));

// Clear knowledge cache
router.delete('/database/knowledge-cache', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    const result = await query(`DELETE FROM knowledge_cache RETURNING cache_key`);

    res.json({
        success: true,
        deleted: { knowledgeCache: result.length },
        message: `Deleted ${result.length} cached entries`,
    });
}));

// Clear all decisions
router.delete('/database/decisions', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE" } to proceed' });
    }

    const result = await query(`DELETE FROM decisions RETURNING id`);

    res.json({
        success: true,
        deleted: { decisions: result.length },
        message: `Deleted ${result.length} decision records`,
    });
}));

/**
 * Nuclear option: delete all nodes, edges, patterns, templates, doc jobs, caches,
 * decisions, dream cycles, voicings, and session data. Preserves partitions,
 * domain config, model registry, and system settings. Clears in-memory embedding cache.
 */
router.delete('/database/all', asyncHandler(async (req, res) => {
    const { confirm } = req.body;

    if (confirm !== 'DELETE_EVERYTHING') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE_EVERYTHING" } to proceed' });
    }

    const nodes = await query(`SELECT COUNT(*) as count FROM nodes`);
    const edges = await query(`SELECT COUNT(*) as count FROM edges`);
    const patterns = await query(`SELECT COUNT(*) as count FROM abstract_patterns`);
    const templates = await query(`SELECT COUNT(*) as count FROM templates`);

    await query(`DELETE FROM edges`);
    await query(`DELETE FROM node_abstract_patterns`);
    await query(`DELETE FROM abstract_patterns`);
    await query(`DELETE FROM nodes`);
    await query(`DELETE FROM templates`);
    try { await query(`DELETE FROM scaffold_jobs`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM knowledge_cache`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM decisions`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM dream_cycles`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM voicings`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM session_insights`); } catch { /* may not exist */ }
    try { await query(`DELETE FROM session_node_usage`); } catch { /* may not exist */ }

    // Clear in-memory caches
    try {
        const { clearAll } = await import('../vector/embedding-cache.js');
        clearAll();
    } catch { /* cache module may not be loaded */ }

    res.json({
        success: true,
        deleted: {
            nodes: parseInt(nodes[0]?.count || 0, 10),
            edges: parseInt(edges[0]?.count || 0, 10),
            patterns: parseInt(patterns[0]?.count || 0, 10),
            templates: parseInt(templates[0]?.count || 0, 10),
        },
        message: 'Everything deleted. All stats, caches, and session data cleared. Fresh start.',
    });
}));

// =============================================================================
// DATABASE BACKUP & RESTORE
// =============================================================================

// List backups
router.get('/database/backups', asyncHandler(async (_req, res) => {
    const backups = listBackups();
    res.json({
        backups,
        count: backups.length,
        totalSize: backups.reduce((sum, b) => sum + b.size, 0),
    });
}));

// Create backup
router.post('/database/backup', asyncHandler(async (req, res) => {
    const { label } = req.body || {};
    const result = await backupDatabase(label);
    res.json({
        success: true,
        ...result,
        message: `Backup created: ${result.path}`,
    });
}));

// Restore from backup
router.post('/database/restore', asyncHandler(async (req, res) => {
    const { filename, confirm } = req.body || {};

    if (confirm !== 'RESTORE') {
        return res.status(400).json({ error: 'Send { confirm: "RESTORE", filename: "..." } to proceed' });
    }
    if (!filename) {
        return res.status(400).json({ error: 'filename is required' });
    }

    const result = await restoreDatabase(filename);
    res.json({
        success: true,
        ...result,
        message: `Database restored from ${filename}. Restart the server for full effect.`,
    });
}));

// =============================================================================
// EMBEDDING STATUS
// =============================================================================

router.get('/database/embeddings/status', asyncHandler(async (_req, res) => {
    const { getEmbeddingModelName } = await import('../models.js');
    const currentModel = getEmbeddingModelName();

    // Read actual dimensions from the DB — not from a hardcoded config default
    const dimsRow = await queryOne(
        `SELECT embedding_dims FROM nodes WHERE embedding IS NOT NULL AND archived = 0 AND embedding_dims IS NOT NULL ORDER BY updated_at DESC LIMIT 1`
    );
    const currentDims = dimsRow?.embedding_dims ?? null;

    // Count total nodes with embeddings
    const total = await queryOne(
        `SELECT COUNT(*) as count FROM nodes WHERE embedding IS NOT NULL AND archived = 0`
    );

    // Count nodes with current model
    const current = await queryOne(
        `SELECT COUNT(*) as count FROM nodes WHERE embedding_model = $1 AND archived = 0`,
        [currentModel]
    );

    // Count nodes without provenance (legacy)
    const legacy = await queryOne(
        `SELECT COUNT(*) as count FROM nodes WHERE embedding IS NOT NULL AND embedding_model IS NULL AND archived = 0`
    );

    // Count nodes with mismatched model
    const stale = await queryOne(
        `SELECT COUNT(*) as count FROM nodes
         WHERE embedding_model IS NOT NULL AND embedding_model != $1 AND archived = 0`,
        [currentModel]
    );

    // Breakdown by model
    const byModel = await query(
        `SELECT embedding_model, embedding_dims, COUNT(*) as count
         FROM nodes
         WHERE embedding IS NOT NULL AND archived = 0
         GROUP BY embedding_model, embedding_dims
         ORDER BY count DESC`
    );

    res.json({
        currentModel,
        currentDimensions: currentDims,
        totalWithEmbeddings: parseInt(total?.count || 0, 10),
        currentModelCount: parseInt(current?.count || 0, 10),
        legacyCount: parseInt(legacy?.count || 0, 10),
        staleCount: parseInt(stale?.count || 0, 10),
        needsReEmbed: parseInt(legacy?.count || 0, 10) + parseInt(stale?.count || 0, 10),
        byModel: byModel.map((r: any) => ({
            model: r.embedding_model || '(unknown)',
            dimensions: r.embedding_dims,
            count: parseInt(r.count, 10),
        })),
    });
}));

// =============================================================================
// PROJECT MANAGEMENT
// =============================================================================

// List all projects
router.get('/database/projects', asyncHandler(async (_req, res) => {
    res.json(await handleProjects({ action: 'list' }));
}));

// Save current database as a named project
router.post('/database/projects/save', asyncHandler(async (req, res) => {
    const result = await handleProjects({ action: 'save', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// Load (switch to) a saved project
router.post('/database/projects/load', asyncHandler(async (req, res) => {
    const { confirm } = req.body || {};
    if (confirm !== 'LOAD_PROJECT') {
        return res.status(400).json({ error: 'Send { confirm: "LOAD_PROJECT", name: "..." } to proceed' });
    }
    const result = await handleProjects({ action: 'load', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// Lightweight DB reload — used by MCP stdio to tell the HTTP server to re-read
// projects.json and switch its DB connection. MCP already did save/backup/bootstrap;
// this just syncs the HTTP server's in-memory state.
router.post('/database/projects/reload', asyncHandler(async (req, res) => {
    const { switchProject, getProjectDir } = await import('../db.js');
    const { readProjectsMeta } = await import('../handlers/projects/meta.js');
    const { clearAllCaches } = await import('../handlers/projects/services.js');
    const path = await import('path');

    const meta = readProjectsMeta();
    const name = meta.currentProject;
    if (!name) return res.status(400).json({ error: 'No current project in projects.json' });

    const dbPath = path.join(getProjectDir(), `${name}.db`);
    await switchProject(dbPath);
    await clearAllCaches();
    console.error(`[projects/reload] HTTP server DB switched to "${name}"`);
    res.json({ success: true, name, message: `HTTP server reloaded project "${name}"` });
}));

// Create a new empty project
router.post('/database/projects/new', asyncHandler(async (req, res) => {
    const { confirm } = req.body || {};
    if (confirm !== 'NEW_PROJECT') {
        return res.status(400).json({ error: 'Send { confirm: "NEW_PROJECT" } to proceed' });
    }
    const result = await handleProjects({ action: 'new', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
}));

// Start or continue a project interview
router.post('/database/projects/interview', asyncHandler(async (req, res) => {
    const result = await handleProjects({ action: 'interview', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// Get project manifest (must be before :name wildcard)
router.get('/database/projects/manifest', asyncHandler(async (_req, res) => {
    res.json(await handleProjects({ action: 'manifest' }));
}));

// Update project manifest (must be before :name wildcard)
router.put('/database/projects/manifest', asyncHandler(async (req, res) => {
    const result = await handleProjects({ action: 'updateManifest', manifest: req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// Delete a saved project
router.delete('/database/projects/:name', asyncHandler(async (req, res) => {
    const { confirm } = req.body || {};
    if (confirm !== 'DELETE_PROJECT') {
        return res.status(400).json({ error: 'Send { confirm: "DELETE_PROJECT" }' });
    }
    const result = await handleProjects({ action: 'delete', name: req.params.name }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// Update project metadata (description, paths)
router.put('/database/projects/:name', asyncHandler(async (req, res) => {
    const result = await handleProjects({ action: 'update', name: req.params.name, ...req.body }) as any;
    if (result.error) return res.status(404).json(result);
    res.json(result);
}));

// =============================================================================
// NUMBER VARIABLES
// =============================================================================

/**
 * Scan all active nodes for raw numbers, extract them into the number_registry,
 * and replace inline numbers with [[[PREFIX+nnn]]] placeholders. Recomputes
 * content hashes and logs integrity operations. Idempotent (skips already-annotated).
 */
router.post('/database/number-variables/backfill', asyncHandler(async (_req, res) => {
    const { registerNodeVariables } = await import('../core/number-variables.js');
    const { config } = await import('../config.js');

    if (!config.numberVariables?.enabled) {
        return res.status(400).json({ error: 'Number variables feature is not enabled' });
    }

    // Get all active nodes (registerNodeVariables handles skipping already-annotated numbers)
    const nodes = await query(
        `SELECT id, content, domain, node_type, contributor, created_at FROM nodes
         WHERE (archived = 0 OR archived IS NULL)
         AND (junk = 0 OR junk IS NULL)
         AND domain IS NOT NULL
         ORDER BY created_at ASC`
    );

    let processed = 0;
    let annotated = 0;
    let totalVars = 0;

    for (const node of nodes as any[]) {
        processed++;
        try {
            const result = await registerNodeVariables(node.id, node.content, node.domain);
            if (result.varIds.length > 0) {
                await query('UPDATE nodes SET content = $1 WHERE id = $2', [result.annotatedContent, node.id]);

                // Recompute content hash
                try {
                    const { computeContentHash, logOperation } = await import('../core/integrity.js');
                    const newHash = computeContentHash({
                        content: result.annotatedContent,
                        nodeType: node.node_type || 'seed',
                        contributor: node.contributor || null,
                        createdAt: node.created_at,
                        parentHashes: [],
                    });
                    await query('UPDATE nodes SET content_hash = $1 WHERE id = $2', [newHash, node.id]);

                    logOperation({
                        nodeId: node.id,
                        operation: 'edited',
                        contentHashBefore: null,
                        contentHashAfter: newHash,
                        contributor: 'system',
                        domain: node.domain,
                        details: { reason: 'number_variable_backfill', varCount: result.varIds.length },
                    }).catch(() => {});
                } catch { /* integrity module may not be available */ }

                annotated++;
                totalVars += result.varIds.length;
            }
        } catch (err: any) {
            console.error(`[backfill] Failed on node ${node.id}: ${err.message}`);
        }
    }

    res.json({
        success: true,
        message: `Backfill complete: ${processed} nodes scanned, ${annotated} annotated, ${totalVars} variables created`,
        processed,
        annotated,
        totalVars,
    });
}));

// List all variables (with optional domain filter)
router.get('/database/number-variables', asyncHandler(async (req, res) => {
    const domain = req.query.domain as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (domain) {
        conditions.push(`r.domain = $${paramIdx++}`);
        params.push(domain);
    }
    if (search) {
        conditions.push(`(r.var_id LIKE $${paramIdx} OR r.scope_text LIKE $${paramIdx} OR r.value LIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
        `SELECT r.var_id, r.value, r.scope_text, r.source_node_id, r.domain, r.created_at,
                n.content AS source_content
         FROM number_registry r
         LEFT JOIN nodes n ON n.id = r.source_node_id
         ${whereClause}
         ORDER BY r.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
    );

    const countRow = await queryOne(
        `SELECT COUNT(*) as cnt FROM number_registry r ${whereClause}`,
        params
    );

    res.json({
        variables: (rows as any[]).map(r => ({
            varId: r.var_id,
            value: r.value,
            scopeText: r.scope_text,
            sourceNodeId: r.source_node_id,
            domain: r.domain,
            createdAt: r.created_at,
            sourceContent: r.source_content?.slice(0, 200),
        })),
        total: parseInt(countRow?.cnt, 10) || 0,
    });
}));

// Resolve variable IDs from content (for GUI hover/tooltip)
router.post('/database/number-variables/resolve', asyncHandler(async (req, res) => {
    const { varIds } = req.body;
    if (!varIds || !Array.isArray(varIds) || varIds.length === 0) {
        return res.json({ variables: {} });
    }

    // Limit to prevent abuse
    const ids = varIds.slice(0, 50);
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const rows = await query(
        `SELECT var_id, value, scope_text, domain FROM number_registry WHERE var_id IN (${placeholders})`,
        ids
    );

    const variables: Record<string, { value: string; scopeText: string; domain: string }> = {};
    for (const r of rows as any[]) {
        variables[r.var_id] = { value: r.value, scopeText: r.scope_text, domain: r.domain };
    }
    res.json({ variables });
}));

// Edit a variable's value or scope
router.put('/database/number-variables/:varId', asyncHandler(async (req, res) => {
    const { varId } = req.params;
    const { value, scopeText } = req.body;

    const existing = await queryOne('SELECT var_id FROM number_registry WHERE var_id = $1', [varId]);
    if (!existing) {
        return res.status(404).json({ error: 'Variable not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (value !== undefined) {
        updates.push(`value = $${idx++}`);
        params.push(String(value));
    }
    if (scopeText !== undefined) {
        updates.push(`scope_text = $${idx++}`);
        params.push(scopeText);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(varId);
    await query(`UPDATE number_registry SET ${updates.join(', ')} WHERE var_id = $${idx}`, params);

    res.json({ success: true, varId });
}));

// Delete a variable (removes from registry and refs, but does NOT change node content)
router.delete('/database/number-variables/:varId', asyncHandler(async (req, res) => {
    const { varId } = req.params;

    const existing = await queryOne('SELECT var_id FROM number_registry WHERE var_id = $1', [varId]);
    if (!existing) {
        return res.status(404).json({ error: 'Variable not found' });
    }

    await query('DELETE FROM node_number_refs WHERE var_id = $1', [varId]);
    await query('DELETE FROM number_registry WHERE var_id = $1', [varId]);

    res.json({ success: true, varId });
}));

export default router;
