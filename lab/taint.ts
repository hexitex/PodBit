/**
 * Lab Taint Propagation
 *
 * When a node is refuted by a lab experiment, its downstream children may be
 * "tainted" — marked as potentially unreliable because their foundation was
 * disproved. Tainted nodes are excluded from the EVM verification queue and
 * synthesis (via the `lab_status IS NULL` filter) until the taint expires or
 * is cleared.
 *
 * Propagation is guarded by three limits to prevent refutation-cascade
 * lockouts:
 *   1. BFS depth (`config.lab.taintMaxDepth`)
 *   2. Embedding cosine similarity to the refuted source
 *      (`config.lab.taintSimilarityThreshold`) — children whose content is
 *      not close to the refuted claim are left untainted, because refuting
 *      one mechanism should not lock out a descendant that tests a different
 *      mechanism.
 *   3. Taint decay (`config.lab.taintDecayDays`) — auto-cleared after N days.
 *
 * Clearing happens automatically when the source is re-verified as supported
 * or inconclusive.
 *
 * @module lab/taint
 */

import { query, queryOne } from '../db/sqlite-backend.js';
import { getNodeEmbedding } from '../vector/embedding-cache.js';
import { cosineSimilarity } from '../core/scoring.js';
import { config as appConfig } from '../config.js';

/**
 * Propagate taint from a refuted node to its downstream children.
 *
 * BFS walks parent edges (source → target where source is parent).
 * Marks descendants with `lab_status='tainted'`, recording the source.
 * Skips already-frozen, archived, and embedding-dissimilar nodes.
 *
 * @param refutedNodeId - ID of the node that was refuted
 * @param maxDepth - Maximum BFS depth (default: 5)
 * @returns Number of nodes tainted
 */
export async function propagateTaint(refutedNodeId: string, maxDepth: number = 5): Promise<number> {
    const simThreshold = appConfig.lab?.taintSimilarityThreshold ?? 0;
    const sourceEmbedding = simThreshold > 0 ? await getNodeEmbedding(refutedNodeId) : null;

    let taintedCount = 0;
    let skippedBySimilarity = 0;
    let currentLayer = [refutedNodeId];

    for (let depth = 0; depth < maxDepth && currentLayer.length > 0; depth++) {
        // Find children of current layer (edge: source_id=parent, target_id=child)
        const placeholders = currentLayer.map((_, i) => `$${i + 1}`).join(', ');
        const children = await query(
            `SELECT DISTINCT e.target_id as id
             FROM edges e
             JOIN nodes n ON n.id = e.target_id
             WHERE e.edge_type = 'parent'
               AND e.source_id IN (${placeholders})
               AND n.archived = FALSE
               AND (n.lab_status IS NULL OR n.lab_status != 'frozen')`,
            currentLayer
        ) as { id: string }[];

        if (children.length === 0) break;

        let childIds = children.map(c => c.id);
        const nextLayer = childIds.slice();

        // Embedding similarity gate — only taint children whose content is
        // semantically close to the refuted source. Children that walk the
        // edge but test unrelated mechanisms are left untainted.
        if (sourceEmbedding && simThreshold > 0) {
            const filtered: string[] = [];
            for (const childId of childIds) {
                const childEmb = await getNodeEmbedding(childId);
                if (!childEmb) { filtered.push(childId); continue; } // no embedding → fall through, apply taint
                const sim = cosineSimilarity(sourceEmbedding, childEmb);
                if (sim >= simThreshold) {
                    filtered.push(childId);
                } else {
                    skippedBySimilarity++;
                }
            }
            childIds = filtered;
        }

        if (childIds.length > 0) {
            // Taint the children
            const taintPlaceholders = childIds.map((_, i) => `$${i + 3}`).join(', ');
            await query(
                `UPDATE nodes
                 SET lab_status = 'tainted', lab_taint_source_id = $1, lab_tainted_at = $2
                 WHERE id IN (${taintPlaceholders})
                   AND (lab_status IS NULL)`,
                [refutedNodeId, new Date().toISOString(), ...childIds]
            );

            // Count affected rows -- better-sqlite3 UPDATEs return [], so count explicitly
            const countPlaceholders = childIds.map((_, i) => `$${i + 2}`).join(', ');
            const countResult = await queryOne(
                `SELECT COUNT(*) as cnt FROM nodes
                 WHERE lab_status = 'tainted' AND lab_taint_source_id = $1
                   AND id IN (${countPlaceholders})`,
                [refutedNodeId, ...childIds]
            ) as { cnt: number } | null;

            taintedCount += countResult?.cnt ?? 0;
        }

        currentLayer = nextLayer;
    }

    if (skippedBySimilarity > 0) {
        try {
            const { emitActivity } = await import('../services/event-bus.js');
            emitActivity('lab', 'taint_similarity_skip',
                `Spared ${skippedBySimilarity} descendant(s) of ${refutedNodeId.slice(0, 8)} — content not similar to refuted claim (threshold ${simThreshold.toFixed(2)})`,
                { sourceNodeId: refutedNodeId, sparedCount: skippedBySimilarity, threshold: simThreshold });
        } catch { /* non-fatal */ }
    }

    return taintedCount;
}

/**
 * Clear taint for all nodes tainted by a specific source.
 * Used when a previously-refuted node is re-verified and supported or
 * re-evaluated as inconclusive (a lab that cannot determine a verdict is
 * not a refutation and must not keep descendants locked out).
 *
 * @param sourceNodeId - The refuted node whose taint to clear
 * @returns Number of nodes un-tainted
 */
export async function clearTaint(sourceNodeId: string): Promise<number> {
    const before = await queryOne(
        "SELECT COUNT(*) as cnt FROM nodes WHERE lab_status = 'tainted' AND lab_taint_source_id = $1",
        [sourceNodeId]
    ) as { cnt: number } | null;

    await query(
        `UPDATE nodes SET lab_status = NULL, lab_taint_source_id = NULL, lab_tainted_at = NULL
         WHERE lab_status = 'tainted' AND lab_taint_source_id = $1`,
        [sourceNodeId]
    );

    return before?.cnt ?? 0;
}

/**
 * Sweep expired taint. Clears taint older than N days.
 * Called periodically from the lifecycle sweep.
 *
 * @param decayDays - Taint expiry in days
 * @returns Number of nodes un-tainted
 */
export async function sweepExpiredTaint(decayDays: number): Promise<number> {
    if (decayDays <= 0) return 0;

    const before = await queryOne(
        `SELECT COUNT(*) as cnt FROM nodes
         WHERE lab_status = 'tainted'
           AND lab_tainted_at < datetime('now', '-' || $1 || ' days')`,
        [decayDays]
    ) as { cnt: number } | null;

    await query(
        `UPDATE nodes SET lab_status = NULL, lab_taint_source_id = NULL, lab_tainted_at = NULL
         WHERE lab_status = 'tainted'
           AND lab_tainted_at < datetime('now', '-' || $1 || ' days')`,
        [decayDays]
    );

    return before?.cnt ?? 0;
}

/**
 * Get count of currently tainted nodes.
 */
export async function taintedNodeCount(): Promise<number> {
    const row = await queryOne("SELECT COUNT(*) as cnt FROM nodes WHERE lab_status = 'tainted'") as { cnt: number } | null;
    return row?.cnt ?? 0;
}
