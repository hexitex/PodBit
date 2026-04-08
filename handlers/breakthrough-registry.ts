/**
 * Breakthrough Registry — cross-project persistent record of all breakthroughs.
 *
 * Stores content snapshots so the registry is self-contained regardless
 * of which project is currently active.
 */

import { query, queryOne, systemQuery, systemQueryOne } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

interface BreakthroughEntry {
    nodeId: string;
    content: string;
    domain?: string;
    trajectory?: string;
    scores?: {
        synthesis?: number;
        novelty?: number;
        testability?: number;
        tension_resolution?: number;
        composite?: number;
    };
    validationReason?: string;
    promotedBy?: string;
    promotionSource: 'manual' | 'autonomous';
    parentContents?: string[];
    generativityBoosts?: Array<{ id: string; boost: number; generation: number }>;
}

/**
 * Get the current project name from data/projects.json.
 *
 * @returns Current project name, or 'default' if unavailable.
 */
function getCurrentProject(): string {
    try {
        const projectsPath = path.join(projectRoot, 'data', 'projects.json');
        if (fs.existsSync(projectsPath)) {
            const data = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
            return data.currentProject || 'default';
        }
    } catch {
        // Fall through
    }
    return 'default';
}

/**
 * Get partition info for a domain (if any).
 *
 * @param domain - Domain name to look up.
 * @returns Partition `{ id, name }` or null if no partition contains this domain.
 */
async function getPartitionForDomain(domain: string): Promise<{ id: string; name: string } | null> {
    if (!domain) return null;
    const row = await queryOne(`
        SELECT dp.id, dp.name
        FROM domain_partitions dp
        JOIN partition_domains pd ON pd.partition_id = dp.id
        WHERE pd.domain = $1
        LIMIT 1
    `, [domain]);
    return row ? { id: row.id, name: row.name } : null;
}

/**
 * Collect comprehensive documentation snapshot for a breakthrough.
 *
 * Gathers 10 sections: full node metadata, lineage (parents/grandparents/children),
 * EVM verification attempts, feedback history, governance decisions, integrity log,
 * model snapshot (subsystem assignments at promotion time), number variable references,
 * partition context, and promotion metadata. Each section is independently try/caught.
 *
 * @param nodeId - UUID of the breakthrough node.
 * @param opts - Optional promotion metadata (promotedBy, promotionSource, scores, etc.).
 * @returns Documentation object with per-section data; sections that fail contain `{ error }`.
 */
async function collectBreakthroughDocumentation(
    nodeId: string,
    opts?: {
        promotedBy?: string;
        promotionSource?: string;
        validationReason?: string;
        scores?: { synthesis?: number; novelty?: number; testability?: number; tension_resolution?: number; composite?: number };
        generativityBoosts?: Array<{ id: string; boost: number; generation: number }>;
    },
): Promise<Record<string, any>> {
    const doc: Record<string, any> = {
        version: 1,
        snapshotAt: new Date().toISOString(),
    };

    // 1. Full node metadata
    try {
        const node: any = await queryOne('SELECT * FROM nodes WHERE id = $1', [nodeId]);
        if (node) {
            doc.node = {
                id: node.id, content: node.content, nodeType: node.node_type,
                trajectory: node.trajectory, domain: node.domain,
                weight: node.weight, salience: node.salience,
                specificity: node.specificity, origin: node.origin,
                contributor: node.contributor, lifecycleState: node.lifecycle_state,
                generation: node.generation, totalChildren: node.total_children,
                contentHash: node.content_hash, createdAt: node.created_at,
                updatedAt: node.updated_at, metadata: node.metadata,
            };
        }
    } catch (e: any) { doc.node = { error: e.message }; }

    // 2. Lineage — parents, grandparents, children
    try {
        const parents: any[] = await query(`
            SELECT n.id, n.content, n.node_type, n.domain, n.weight, n.contributor,
                   e.edge_type, e.strength
            FROM edges e
            JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
        `, [nodeId]) as any[];

        const grandparents: any[] = [];
        for (const p of parents) {
            const gps: any[] = await query(`
                SELECT n.id, n.content, n.node_type, n.domain
                FROM edges e JOIN nodes n ON n.id = e.source_id
                WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
            `, [p.id]) as any[];
            for (const gp of gps) {
                if (!grandparents.some(g => g.id === gp.id)) {
                    grandparents.push({ ...gp, parentId: p.id });
                }
            }
        }

        const children: any[] = await query(`
            SELECT n.id, n.content, n.node_type, n.domain
            FROM edges e JOIN nodes n ON n.id = e.target_id
            WHERE e.source_id = $1 AND e.edge_type = 'parent'
        `, [nodeId]) as any[];

        doc.lineage = { parents, grandparents, children };
    } catch (e: any) { doc.lineage = { error: e.message }; }

    // 3. EVM Verification — all attempts with full code and output
    try {
        const { getNodeVerifications } = await import('../evm/feedback.js');
        const attempts = await getNodeVerifications(nodeId);
        const nodeRow: any = await queryOne(
            'SELECT verification_status, verification_score FROM nodes WHERE id = $1', [nodeId]
        );
        doc.verification = {
            status: nodeRow?.verification_status || null,
            score: nodeRow?.verification_score || null,
            attempts,
        };
    } catch (e: any) { doc.verification = { error: e.message }; }

    // 4. Feedback history
    try {
        const feedback: any[] = await query(
            'SELECT * FROM node_feedback WHERE node_id = $1 ORDER BY created_at DESC',
            [nodeId]
        ) as any[];
        doc.feedback = feedback;
    } catch (e: any) { doc.feedback = { error: e.message }; }

    // 5. Governance decisions
    try {
        const decisions: any[] = await query(
            "SELECT * FROM decisions WHERE entity_type = 'node' AND entity_id = $1 ORDER BY created_at DESC",
            [nodeId]
        ) as any[];
        doc.decisions = decisions;
    } catch (e: any) { doc.decisions = { error: e.message }; }

    // 6. Integrity log
    try {
        const integrity: any[] = await query(
            'SELECT operation, content_hash_before, content_hash_after, parent_hashes, contributor, log_hash, timestamp FROM integrity_log WHERE node_id = $1 ORDER BY timestamp DESC',
            [nodeId]
        ) as any[];
        doc.integrity = integrity;
    } catch (e: any) { doc.integrity = { error: e.message }; }

    // 7. Model snapshot — which models were on which subsystems at promotion time
    try {
        const { getSubsystemAssignments, getConsultantAssignments } = await import('../models/assignments.js');
        const assignments = await getSubsystemAssignments();
        const consultants = await getConsultantAssignments();

        const snapshot: Record<string, any> = {};
        for (const [sub, model] of Object.entries(assignments)) {
            const consultant = (consultants as any)[sub];
            snapshot[sub] = model ? {
                subsystem: sub,
                modelId: model.id, modelName: model.name,
                provider: model.provider, modelIdentifier: model.modelId,
                endpointUrl: model.endpointUrl, maxTokens: model.maxTokens,
                contextSize: model.contextSize, noThink: model.noThink,
                thinkingLevel: model.thinkingLevel,
                consultantModelId: consultant?.id || null,
                consultantModelName: consultant?.name || null,
            } : null;
        }
        doc.modelSnapshot = { assignments: snapshot };
    } catch (e: any) { doc.modelSnapshot = { error: e.message }; }

    // 8. Number variable references
    try {
        const refs: any[] = await query(`
            SELECT nr.var_id, nr.value, nr.scope_text, nr.domain
            FROM node_number_refs nnr
            JOIN number_registry nr ON nr.var_id = nnr.var_id
            WHERE nnr.node_id = $1
        `, [nodeId]) as any[];
        doc.numberRefs = refs;
    } catch (e: any) { doc.numberRefs = { error: e.message }; }

    // 9. Partition context
    try {
        const nodeDomain = doc.node?.domain || (await queryOne('SELECT domain FROM nodes WHERE id = $1', [nodeId]))?.domain;
        if (nodeDomain) {
            const partition = await getPartitionForDomain(nodeDomain);
            if (partition) {
                const domains: any[] = await query(
                    'SELECT domain FROM partition_domains WHERE partition_id = $1', [partition.id]
                ) as any[];
                const bridges: any[] = await query(`
                    SELECT CASE WHEN partition_a = $1 THEN partition_b ELSE partition_a END as bridged_to
                    FROM partition_bridges WHERE partition_a = $1 OR partition_b = $1
                `, [partition.id]) as any[];
                const partRow: any = await queryOne(
                    'SELECT description FROM domain_partitions WHERE id = $1', [partition.id]
                );
                doc.partition = {
                    id: partition.id, name: partition.name,
                    description: partRow?.description || null,
                    domains: domains.map((d: any) => d.domain),
                    bridges: bridges.map((b: any) => b.bridged_to),
                };
            } else {
                doc.partition = null;
            }
        } else {
            doc.partition = null;
        }
    } catch (e: any) { doc.partition = { error: e.message }; }

    // 10. Promotion metadata
    doc.promotion = {
        promotedBy: opts?.promotedBy || null,
        promotionSource: opts?.promotionSource || null,
        validationReason: opts?.validationReason || null,
        scores: opts?.scores || null,
        generativityBoosts: opts?.generativityBoosts || [],
    };

    return doc;
}

/**
 * Register a breakthrough in the shared cross-project registry.
 *
 * Deduplicates by (node_id, project_name) pair — updates existing entries
 * on conflict rather than creating duplicates. After insert/update, collects
 * a comprehensive documentation snapshot (non-fatal).
 *
 * @param entry - Breakthrough data including nodeId, content, scores, and promotion metadata.
 * @returns `{ id, deduplicated }` where deduplicated indicates an existing entry was updated.
 */
async function registerBreakthrough(entry: BreakthroughEntry): Promise<{ id: string; deduplicated: boolean }> {
    const projectName = getCurrentProject();
    const partition = entry.domain ? await getPartitionForDomain(entry.domain) : null;

    // Check for existing entry (dedup)
    const existing = await systemQueryOne(
        `SELECT id FROM breakthrough_registry WHERE node_id = $1 AND project_name = $2`,
        [entry.nodeId, projectName]
    );

    let registryId: string;
    let deduplicated = false;

    if (existing) {
        // Update existing entry with latest data
        await systemQuery(`
            UPDATE breakthrough_registry
            SET content = $1,
                domain = $2,
                partition_id = $3,
                partition_name = $4,
                trajectory = $5,
                validation_synthesis = $6,
                validation_novelty = $7,
                validation_testability = $8,
                validation_tension_resolution = $9,
                validation_composite = $10,
                validation_reason = $11,
                promoted_by = $12,
                promotion_source = $13,
                parent_contents = $14,
                promoted_at = datetime('now')
            WHERE id = $15
        `, [
            entry.content,
            entry.domain || null,
            partition?.id || null,
            partition?.name || null,
            entry.trajectory || null,
            entry.scores?.synthesis ?? null,
            entry.scores?.novelty ?? null,
            entry.scores?.testability ?? null,
            entry.scores?.tension_resolution ?? null,
            entry.scores?.composite ?? null,
            entry.validationReason || null,
            entry.promotedBy || null,
            entry.promotionSource,
            entry.parentContents ? JSON.stringify(entry.parentContents) : null,
            existing.id,
        ]);
        registryId = existing.id;
        deduplicated = true;
    } else {
        // Insert new entry
        const row = await systemQueryOne(`
            INSERT INTO breakthrough_registry (
                node_id, content, domain, partition_id, partition_name,
                trajectory, validation_synthesis, validation_novelty,
                validation_testability, validation_tension_resolution,
                validation_composite, validation_reason, project_name,
                promoted_by, promotion_source, parent_contents
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id
        `, [
            entry.nodeId,
            entry.content,
            entry.domain || null,
            partition?.id || null,
            partition?.name || null,
            entry.trajectory || null,
            entry.scores?.synthesis ?? null,
            entry.scores?.novelty ?? null,
            entry.scores?.testability ?? null,
            entry.scores?.tension_resolution ?? null,
            entry.scores?.composite ?? null,
            entry.validationReason || null,
            projectName,
            entry.promotedBy || null,
            entry.promotionSource,
            entry.parentContents ? JSON.stringify(entry.parentContents) : null,
        ]);
        registryId = row.id;
    }

    // Collect and store comprehensive documentation snapshot (non-fatal)
    try {
        const documentation = await collectBreakthroughDocumentation(entry.nodeId, {
            promotedBy: entry.promotedBy,
            promotionSource: entry.promotionSource,
            validationReason: entry.validationReason,
            scores: entry.scores,
            generativityBoosts: entry.generativityBoosts,
        });
        await systemQuery(
            'UPDATE breakthrough_registry SET documentation = $1 WHERE id = $2',
            [JSON.stringify(documentation), registryId]
        );
    } catch (err: any) {
        console.error(`[breakthrough-registry] Documentation collection failed (non-fatal): ${err.message}`);
    }

    return { id: registryId, deduplicated };
}

/**
 * Query the breakthrough registry with filters, sorting, and pagination.
 *
 * @param params - Filter/sort options: `project`, `domain`, `promotionSource`,
 *   `limit` (default 50), `offset` (default 0), `orderBy` (default 'promoted_at'),
 *   `direction` ('ASC'|'DESC', default 'DESC').
 * @returns `{ breakthroughs, total, limit, offset }` with parsed parent_contents.
 */
async function queryRegistry(params: {
    project?: string;
    domain?: string;
    promotionSource?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    direction?: string;
}) {
    const {
        project, domain, promotionSource,
        limit = 50, offset = 0,
        orderBy = 'promoted_at', direction = 'DESC'
    } = params;

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (project) {
        conditions.push(`project_name = $${idx++}`);
        values.push(project);
    }
    if (domain) {
        conditions.push(`domain = $${idx++}`);
        values.push(domain);
    }
    if (promotionSource) {
        conditions.push(`promotion_source = $${idx++}`);
        values.push(promotionSource);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Whitelist orderBy to prevent SQL injection
    const allowedColumns = ['promoted_at', 'validation_composite', 'domain', 'project_name', 'created_at'];
    const safeOrder = allowedColumns.includes(orderBy) ? orderBy : 'promoted_at';
    const safeDir = direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const rows = await systemQuery(
        `SELECT * FROM breakthrough_registry ${where} ORDER BY ${safeOrder} ${safeDir} LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset]
    );

    const countRow = await systemQueryOne(
        `SELECT COUNT(*) as total FROM breakthrough_registry ${where}`,
        values
    );

    return {
        breakthroughs: rows.map(r => ({
            ...r,
            parent_contents: r.parent_contents ? JSON.parse(r.parent_contents) : null,
        })),
        total: countRow?.total || 0,
        limit,
        offset,
    };
}

/**
 * Aggregate statistics from the breakthrough registry.
 *
 * @param params - Optional `project` filter and `days` lookback (default 30).
 * @returns Totals, averages, breakdowns by project/domain/source, and daily timeline.
 */
async function registryStats(params: { project?: string; days?: number }) {
    const { project, days = 30 } = params;

    const projectFilter = project ? `AND project_name = $1` : '';
    const filterValues = project ? [project] : [];

    // Total count
    const totalRow = await systemQueryOne(
        `SELECT COUNT(*) as total FROM breakthrough_registry WHERE 1=1 ${projectFilter}`,
        filterValues
    );

    // Recent count (within N days)
    const recentRow = await systemQueryOne(
        `SELECT COUNT(*) as recent FROM breakthrough_registry WHERE promoted_at >= datetime('now', '-' || $${filterValues.length + 1} || ' days') ${projectFilter}`,
        [...filterValues, days]
    );

    // Average composite score
    const avgRow = await systemQueryOne(
        `SELECT AVG(validation_composite) as avg_composite FROM breakthrough_registry WHERE validation_composite IS NOT NULL ${projectFilter}`,
        filterValues
    );

    // By project
    const byProject = await systemQuery(
        `SELECT project_name, COUNT(*) as count, AVG(validation_composite) as avg_composite
         FROM breakthrough_registry WHERE 1=1 ${projectFilter}
         GROUP BY project_name ORDER BY count DESC`,
        filterValues
    );

    // By domain
    const byDomain = await systemQuery(
        `SELECT domain, COUNT(*) as count, AVG(validation_composite) as avg_composite
         FROM breakthrough_registry WHERE domain IS NOT NULL ${projectFilter}
         GROUP BY domain ORDER BY count DESC`,
        filterValues
    );

    // By promotion source
    const bySource = await systemQuery(
        `SELECT promotion_source, COUNT(*) as count
         FROM breakthrough_registry WHERE 1=1 ${projectFilter}
         GROUP BY promotion_source`,
        filterValues
    );

    // Timeline (daily counts, last N days)
    const timeline = await systemQuery(
        `SELECT DATE(promoted_at) as date, COUNT(*) as count
         FROM breakthrough_registry
         WHERE promoted_at >= datetime('now', '-' || $${filterValues.length + 1} || ' days') ${projectFilter}
         GROUP BY DATE(promoted_at)
         ORDER BY date ASC`,
        [...filterValues, days]
    );

    return {
        total: totalRow?.total || 0,
        recent: recentRow?.recent || 0,
        recentDays: days,
        avgComposite: avgRow?.avg_composite ? Math.round(avgRow.avg_composite * 10) / 10 : null,
        byProject: byProject.map(r => ({
            project: r.project_name,
            count: r.count,
            avgComposite: r.avg_composite ? Math.round(r.avg_composite * 10) / 10 : null,
        })),
        byDomain: byDomain.map(r => ({
            domain: r.domain,
            count: r.count,
            avgComposite: r.avg_composite ? Math.round(r.avg_composite * 10) / 10 : null,
        })),
        bySource: bySource.reduce((acc: Record<string, number>, r: any) => {
            acc[r.promotion_source] = r.count;
            return acc;
        }, {}),
        timeline,
    };
}

/**
 * Update validation scores on an existing breakthrough.
 *
 * Recomputes the composite score and updates both the breakthrough_registry
 * (system DB) and the nodes table (project DB).
 *
 * @param registryId - UUID of the breakthrough_registry entry.
 * @param scores - Individual scores: synthesis, novelty, testability, tension_resolution.
 * @returns `{ success, composite }` or `{ error }` if not found.
 */
async function updateBreakthroughScores(registryId: string, scores: {
    synthesis: number;
    novelty: number;
    testability: number;
    tension_resolution: number;
}) {
    const { synthesis = 0, novelty = 0, testability = 0, tension_resolution = 0 } = scores;
    const composite = Math.round(
        (synthesis * 0.3 + novelty * 0.35 + testability * 0.2 + tension_resolution * 0.15) * 10
    ) / 10;

    // Update breakthrough_registry
    const bt = await systemQueryOne(
        `UPDATE breakthrough_registry
         SET validation_synthesis = $1,
             validation_novelty = $2,
             validation_testability = $3,
             validation_tension_resolution = $4,
             validation_composite = $5
         WHERE id = $6
         RETURNING node_id`,
        [synthesis, novelty, testability, tension_resolution, composite, registryId]
    );

    if (!bt) {
        return { error: 'Breakthrough not found' };
    }

    // Also update the nodes table
    await query(
        `UPDATE nodes
         SET validation_synthesis = $1,
             validation_novelty = $2,
             validation_testability = $3,
             validation_tension_resolution = $4,
             validation_composite = $5
         WHERE id = $6`,
        [synthesis, novelty, testability, tension_resolution, composite, bt.node_id]
    );

    return { success: true, composite };
}

/**
 * Get stored documentation snapshot for a breakthrough registry entry.
 *
 * @param registryId - UUID of the breakthrough_registry entry.
 * @returns Parsed documentation object, or null if not found or not yet collected.
 */
async function getDocumentation(registryId: string): Promise<Record<string, any> | null> {
    const row: any = await systemQueryOne(
        'SELECT documentation FROM breakthrough_registry WHERE id = $1',
        [registryId]
    );
    if (!row) return null;
    if (!row.documentation) return null;
    try {
        return JSON.parse(row.documentation);
    } catch {
        return null;
    }
}

/**
 * Rebuild documentation for an existing breakthrough from current DB state.
 *
 * Re-collects all 10 documentation sections from current data. Handles
 * deleted nodes gracefully -- gathers what it can.
 *
 * @param registryId - UUID of the breakthrough_registry entry.
 * @returns `{ success }` or `{ success: false, error }`.
 */
async function rebuildDocumentation(registryId: string): Promise<{ success: boolean; error?: string }> {
    const bt: any = await systemQueryOne(
        'SELECT id, node_id, promoted_by, promotion_source, validation_reason, validation_synthesis, validation_novelty, validation_testability, validation_tension_resolution, validation_composite FROM breakthrough_registry WHERE id = $1',
        [registryId]
    );
    if (!bt) return { success: false, error: 'Breakthrough not found' };

    try {
        const documentation = await collectBreakthroughDocumentation(bt.node_id, {
            promotedBy: bt.promoted_by,
            promotionSource: bt.promotion_source,
            validationReason: bt.validation_reason,
            scores: {
                synthesis: bt.validation_synthesis,
                novelty: bt.validation_novelty,
                testability: bt.validation_testability,
                tension_resolution: bt.validation_tension_resolution,
                composite: bt.validation_composite,
            },
        });
        await systemQuery(
            'UPDATE breakthrough_registry SET documentation = $1 WHERE id = $2',
            [JSON.stringify(documentation), registryId]
        );
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export {
    registerBreakthrough, queryRegistry, registryStats,
    updateBreakthroughScores, getDocumentation, rebuildDocumentation,
};
