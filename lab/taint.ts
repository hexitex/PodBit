/**
 * Lab Taint Propagation
 *
 * When a node is refuted by a lab experiment, its downstream children are
 * "tainted" — marked as potentially unreliable because their foundation
 * was disproved. Tainted nodes are excluded from synthesis (via the
 * `lab_status IS NULL` filter) until the taint expires or is cleared.
 *
 * BFS walks the edges table (edge_type='parent') to find descendants.
 *
 * @module lab/taint
 */

import { query, queryOne } from '../db/sqlite-backend.js';

/**
 * Propagate taint from a refuted node to its downstream children.
 *
 * BFS walks parent edges (source → target where source is parent).
 * Marks descendants with `lab_status='tainted'`, recording the source.
 * Skips already-frozen and archived nodes.
 *
 * @param refutedNodeId - ID of the node that was refuted
 * @param maxDepth - Maximum BFS depth (default: 5)
 * @returns Number of nodes tainted
 */
export async function propagateTaint(refutedNodeId: string, maxDepth: number = 5): Promise<number> {
    let taintedCount = 0;
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

        const childIds = children.map(c => c.id);

        // Taint the children
        const taintPlaceholders = childIds.map((_, i) => `$${i + 3}`).join(', ');
        const result = await query(
            `UPDATE nodes
             SET lab_status = 'tainted', lab_taint_source_id = $1, lab_tainted_at = $2
             WHERE id IN (${taintPlaceholders})
               AND (lab_status IS NULL)`,
            [refutedNodeId, new Date().toISOString(), ...childIds]
        );

        // Count affected rows (result is array for UPDATE...RETURNING or we check changes)
        // For better-sqlite3 via our query wrapper, UPDATEs return []
        // Count by checking how many are now tainted
        const countResult = await queryOne(
            `SELECT COUNT(*) as cnt FROM nodes
             WHERE lab_status = 'tainted' AND lab_taint_source_id = $1
               AND id IN (${taintPlaceholders})`,
            [refutedNodeId, ...childIds]
        ) as { cnt: number } | null;

        taintedCount += countResult?.cnt ?? 0;
        currentLayer = childIds;
    }

    return taintedCount;
}

/**
 * Clear taint for all nodes tainted by a specific source.
 * Used when a previously-refuted node is re-verified and supported.
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
