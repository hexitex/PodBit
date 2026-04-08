/**
 * Lab Freeze Mechanism
 *
 * Nodes under active lab experiments are "frozen" — excluded from synthesis
 * pairing, decay, lifecycle sweeps, and barren counting. This prevents the
 * graph from building on unverified (potentially false) claims.
 *
 * @module lab/freeze
 */

import { query, queryOne } from '../db/sqlite-backend.js';

/**
 * Freeze a node. Sets `lab_status='frozen'` and records the experiment ID.
 * Frozen nodes are excluded from all synthesis and lifecycle operations.
 */
export async function freezeNode(nodeId: string, experimentId: string): Promise<void> {
    await query(
        `UPDATE nodes SET lab_status = 'frozen', lab_experiment_id = $1, lab_frozen_at = datetime('now')
         WHERE id = $2 AND (lab_status IS NULL OR lab_status != 'frozen')`,
        [experimentId, nodeId]
    );
}

/**
 * Unfreeze a node. Clears all freeze columns back to NULL.
 * Does NOT clear taint — a node can be unfrozen but still tainted.
 */
export async function unfreezeNode(nodeId: string): Promise<void> {
    await query(
        `UPDATE nodes SET lab_status = NULL, lab_experiment_id = NULL, lab_frozen_at = NULL
         WHERE id = $1 AND lab_status = 'frozen'`,
        [nodeId]
    );
}

/**
 * Check if a node is currently frozen.
 */
export async function isNodeFrozen(nodeId: string): Promise<boolean> {
    const row = await queryOne(
        "SELECT 1 FROM nodes WHERE id = $1 AND lab_status = 'frozen'",
        [nodeId]
    );
    return row !== null;
}

/**
 * Get count of currently frozen nodes.
 */
export async function frozenNodeCount(): Promise<number> {
    const row = await queryOne("SELECT COUNT(*) as cnt FROM nodes WHERE lab_status = 'frozen'") as { cnt: number } | null;
    return row?.cnt ?? 0;
}
