/**
 * Node Lifecycle — state machine, birth recording, and lifecycle sweep.
 *
 * Every node progresses through: nascent → active → declining → composted
 * Fertility (offspring production) is the vital sign, not age or weight.
 *
 * - nascent: newly created, hasn't produced any children yet
 * - active: has at least one child, still fertile
 * - declining: barren too long (no new children in barrenThreshold cycles)
 * - composted: compressed to stub, removed from active graph
 */

import { query, queryOne } from '../db.js';
import { config as appConfig } from '../config.js';
import crypto from 'crypto';
import { emitActivity } from '../services/event-bus.js';
import { getPartitionForDomain } from './governance.js';

// =============================================================================
// TYPES
// =============================================================================

export type LifecycleState = 'nascent' | 'active' | 'declining' | 'composted';

/** Counts of each transition type produced by a single lifecycle sweep pass. */
export interface LifecycleSweepResult {
    /** Nodes transitioned from nascent to active (first child born). */
    activated: number;
    /** Nodes transitioned from active to declining (barren too long). */
    declined: number;
    /** Declining nodes composted (no revival within compost window). */
    composted: number;
    /** Declining nodes revived (produced a child while declining). */
    revived: number;
    /** Nascent nodes composted without ever producing a child. */
    stillborn: number;
}

/** Graph-wide health metrics computed from node lifecycle states and activity. */
export interface NodeMetabolism {
    /** Total non-archived nodes across all lifecycle states. */
    totalNodes: number;
    /** Nodes in nascent state (no children yet). */
    nascentCount: number;
    /** Nodes in active state (fertile, has at least one child). */
    activeCount: number;
    /** Nodes in declining state (barren too long, awaiting revival or composting). */
    decliningCount: number;
    /** Total node stubs created by composting. */
    compostedStubs: number;
    /** Nodes created in the last 24 hours. */
    birthRate: number;
    /** Nodes composted in the last 24 hours. */
    compostRate: number;
    /** Ratio of active nodes to total nodes (0..1). */
    activeRatio: number;
    /** Ratio of nascent nodes to total nodes (0..1). */
    nascentRatio: number;
    /** Average generation depth across active and nascent nodes. */
    avgGeneration: number;
    /** Fraction of active nodes that have produced at least one child (0..1). */
    fertilityRate: number;
}

// =============================================================================
// RECORD BIRTH — called when synthesis creates a child node
// Updates parent fertility counters and triggers state transitions
// =============================================================================

/**
 * Record that a child was born from the given parent nodes.
 * - Increments total_children on each parent
 * - Resets barren_cycles to 0
 * - Transitions nascent to active (first child)
 * - Transitions declining to active (revival)
 *
 * Also sets the child's generation = max(parent generations) + 1.
 *
 * @param childId - UUID of the newly created child node
 * @param parentIds - UUIDs of all parent nodes that contributed to the child
 */
export async function recordBirth(childId: string, parentIds: string[]): Promise<void> {
    if (!appConfig.lifecycle.enabled || parentIds.length === 0) return;

    // Get parent generations to compute child generation
    const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(', ');
    const parents = await query(
        `SELECT id, lifecycle_state, total_children, generation FROM nodes WHERE id IN (${placeholders})`,
        parentIds
    );

    const maxGeneration = Math.max(0, ...parents.map((p: any) => p.generation || 0));

    // Set child generation and born_at
    await query(
        `UPDATE nodes SET generation = $1, born_at = $2 WHERE id = $3`,
        [maxGeneration + 1, new Date().toISOString(), childId]
    );

    // Update each parent
    for (const parent of parents) {
        const newTotal = (parent.total_children || 0) + 1;
        const oldState = parent.lifecycle_state || 'active';

        // Increment children count, reset barren cycles
        await query(
            `UPDATE nodes SET total_children = $1, barren_cycles = 0 WHERE id = $2`,
            [newTotal, parent.id]
        );

        // State transitions based on first birth
        if (oldState === 'nascent' && newTotal === 1) {
            // nascent → active: first child born
            await query(
                `UPDATE nodes SET lifecycle_state = 'active', activated_at = $1 WHERE id = $2`,
                [new Date().toISOString(), parent.id]
            );
            emitActivity('lifecycle', 'activated', `Node activated (first child)`, {
                nodeId: parent.id,
                transition: 'nascent→active',
            });
        } else if (oldState === 'declining') {
            // declining → active: revival — a declining node produced a new child
            await query(
                `UPDATE nodes SET lifecycle_state = 'active', declining_since = NULL WHERE id = $1`,
                [parent.id]
            );
            emitActivity('lifecycle', 'revived', `Node revived (new child while declining)`, {
                nodeId: parent.id,
                transition: 'declining→active',
            });
        }
    }
}

// =============================================================================
// INCREMENT BARREN — called once per cycle for nodes that were sampled
// but did NOT produce offspring (synthesis failed or was rejected)
// =============================================================================

/**
 * Increment barren_cycles for nodes that were sampled but produced nothing.
 * Called from the synthesis engine after a cycle that didn't create a child.
 * Only affects active and nascent nodes that are not archived.
 *
 * @param nodeIds - UUIDs of nodes that were sampled but did not produce offspring
 */
export async function incrementBarren(nodeIds: string[]): Promise<void> {
    if (!appConfig.lifecycle.enabled || nodeIds.length === 0) return;

    const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(', ');
    await query(
        `UPDATE nodes SET barren_cycles = barren_cycles + 1
         WHERE id IN (${placeholders})
           AND lifecycle_state IN ('active', 'nascent')
           AND archived = FALSE
           AND lab_status IS NULL`,
        nodeIds
    );
}

// =============================================================================
// LIFECYCLE SWEEP — run periodically to transition states
// =============================================================================

/**
 * Sweep all nodes and apply lifecycle state transitions:
 *
 * 1. active → declining: barren_cycles >= barrenThreshold
 * 2. declining → composted: barren_cycles >= compostAfter (and not a breakthrough if preserveBreakthroughs)
 * 3. nascent → composted: barren_cycles >= nascent.maxCycles (stillbirth)
 *
 * Returns counts of each transition type.
 */
export async function lifecycleSweep(): Promise<LifecycleSweepResult> {
    const result: LifecycleSweepResult = {
        activated: 0,
        declined: 0,
        composted: 0,
        revived: 0,
        stillborn: 0,
    };

    if (!appConfig.lifecycle.enabled) return result;

    const lc = appConfig.lifecycle;
    const now = new Date().toISOString();

    // 1. active → declining: barren too long
    // Elite nodes are exempt — they are verified knowledge that should never be composted
    const decliningCandidates = await query(
        `SELECT id FROM nodes
         WHERE lifecycle_state = 'active'
           AND barren_cycles >= $1
           AND archived = FALSE
           AND lab_status IS NULL
           AND node_type != 'elite_verification'`,
        [lc.barrenThreshold]
    );

    for (const node of decliningCandidates) {
        await query(
            `UPDATE nodes SET lifecycle_state = 'declining', declining_since = $1 WHERE id = $2`,
            [now, node.id]
        );
        result.declined++;
    }

    if (result.declined > 0) {
        emitActivity('lifecycle', 'sweep_declined', `${result.declined} node(s) entered declining state`, {
            count: result.declined,
        });
    }

    // 2. declining → composted: no revival within compost window
    const compostBreakthroughGuard = lc.composting.preserveBreakthroughs
        ? `AND node_type != 'breakthrough'` : '';

    const compostCandidates = await query(
        `SELECT id, content, domain, weight, generation, total_children, created_at
         FROM nodes
         WHERE lifecycle_state = 'declining'
           AND barren_cycles >= $1
           AND archived = FALSE
           AND lab_status IS NULL
           AND node_type != 'elite_verification'
           ${compostBreakthroughGuard}`,
        [lc.compostAfter]
    );

    for (const node of compostCandidates) {
        await compostNode(node, 'barren', now);
        result.composted++;
    }

    // 3. nascent → composted: stillbirth — never produced children
    const stillbirthCandidates = await query(
        `SELECT id, content, domain, weight, generation, total_children, created_at
         FROM nodes
         WHERE lifecycle_state = 'nascent'
           AND barren_cycles >= $1
           AND total_children = 0
           AND archived = FALSE
           AND lab_status IS NULL
           AND node_type != 'elite_verification'`,
        [lc.nascent.maxCycles]
    );

    for (const node of stillbirthCandidates) {
        await compostNode(node, 'stillbirth', now);
        result.stillborn++;
    }

    if (result.composted + result.stillborn > 0) {
        emitActivity('lifecycle', 'sweep_composted',
            `Composted ${result.composted} declining + ${result.stillborn} stillborn node(s)`, {
                composted: result.composted,
                stillborn: result.stillborn,
            });
    }

    // Taint decay — clear expired taint
    try {
        const labConfig = (await import('../config.js')).config;
        const decayDays = labConfig.lab?.taintDecayDays ?? 30;
        if (decayDays > 0) {
            const { sweepExpiredTaint } = await import('../lab/taint.js');
            const cleared = await sweepExpiredTaint(decayDays);
            if (cleared > 0) {
                emitActivity('lifecycle', 'taint_decay',
                    `Cleared ${cleared} expired taint(s) (>${decayDays} days)`, { cleared, decayDays });
            }
        }
    } catch { /* non-fatal */ }

    return result;
}

// =============================================================================
// COMPOST NODE — compress to stub and archive
// =============================================================================

/**
 * Compress a node to a stub record and archive it.
 * Creates a summary in the `node_stubs` table preserving lineage metadata
 * (content hash, surviving children, parent IDs), then marks the original
 * node as composted and archived.
 *
 * @param node - Row object with id, content, domain, weight, generation, total_children, created_at
 * @param cause - Why the node is being composted: barren (declining too long), stillbirth (never produced children), or manual
 * @param timestamp - ISO timestamp to record as the composting time
 */
async function compostNode(
    node: any,
    cause: 'barren' | 'stillbirth' | 'manual',
    timestamp: string
): Promise<void> {
    const summary = node.content.slice(0, appConfig.lifecycle.composting.summaryMaxLength);
    const contentHash = crypto.createHash('sha256').update(node.content).digest('hex');

    // Find partition for this node's domain
    const partitionId = await getPartitionForDomain(node.domain) || 'unknown';

    // Find surviving children (nodes that reference this as parent)
    const children = await query(
        `SELECT target_id FROM edges WHERE source_id = $1 AND edge_type = 'parent'`,
        [node.id]
    );
    const survivingChildren = children.map((c: any) => c.target_id);

    // Find parent IDs for lineage preservation
    const parents = await query(
        `SELECT source_id FROM edges WHERE target_id = $1 AND edge_type = 'parent'`,
        [node.id]
    );
    const parentIds = parents.map((p: any) => p.source_id);

    // Create stub in unified node_stubs table
    await query(
        `INSERT INTO node_stubs (node_id, domain, partition_id, content_hash, summary, weight_at_stub, generation, born_at, stubbed_at, total_children, surviving_children, parent_ids, cause)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (node_id) DO NOTHING`,
        [
            node.id,
            node.domain,
            partitionId,
            contentHash,
            summary,
            node.weight,
            node.generation || 0,
            node.created_at || node.born_at,
            timestamp,
            node.total_children || 0,
            survivingChildren.length > 0 ? JSON.stringify(survivingChildren) : null,
            parentIds.length > 0 ? JSON.stringify(parentIds) : null,
            cause,
        ]
    );

    // Archive the node (don't hard-delete — stubs reference it)
    await query(
        `UPDATE nodes SET lifecycle_state = 'composted', composted_at = $1, archived = TRUE WHERE id = $2`,
        [timestamp, node.id]
    );

    emitActivity('lifecycle', 'composted', `Node composted (${cause})`, {
        nodeId: node.id,
        domain: node.domain,
        cause,
        totalChildren: node.total_children || 0,
        generation: node.generation || 0,
        weight: node.weight,
    });
}

// =============================================================================
// METABOLISM — graph health metrics
// =============================================================================

/**
 * Compute graph metabolism metrics for health monitoring.
 * Queries node lifecycle state counts, recent birth/compost rates,
 * and fertility ratios across the entire non-archived graph.
 *
 * @returns Aggregate health metrics including state counts, ratios, and rates
 */
export async function getMetabolism(): Promise<NodeMetabolism> {
    const counts = await queryOne(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN lifecycle_state = 'nascent' THEN 1 ELSE 0 END) as nascent,
            SUM(CASE WHEN lifecycle_state = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN lifecycle_state = 'declining' THEN 1 ELSE 0 END) as declining,
            AVG(CASE WHEN lifecycle_state IN ('active', 'nascent') THEN generation ELSE NULL END) as avg_generation,
            SUM(CASE WHEN lifecycle_state = 'active' AND total_children > 0 THEN 1 ELSE 0 END) as fertile_active,
            SUM(CASE WHEN lifecycle_state = 'active' THEN 1 ELSE 0 END) as total_active
         FROM nodes
         WHERE archived = FALSE`
    );

    const stubs = await queryOne(
        `SELECT COUNT(*) as count FROM node_stubs WHERE cause IN ('barren', 'stillbirth', 'manual')`
    );

    // Recent births (nodes created in the last 24 hours)
    const recentBirths = await queryOne(
        `SELECT COUNT(*) as count FROM nodes
         WHERE created_at > datetime('now', '-1 day')
           AND archived = FALSE`
    );

    // Recent composts (stubs from last 24 hours)
    const recentComposts = await queryOne(
        `SELECT COUNT(*) as count FROM node_stubs
         WHERE stubbed_at > datetime('now', '-1 day')
           AND cause IN ('barren', 'stillbirth', 'manual')`
    );

    const total = counts?.total || 0;
    const activeCount = counts?.active || 0;
    const totalActive = counts?.total_active || 0;
    const fertileActive = counts?.fertile_active || 0;

    return {
        totalNodes: total,
        nascentCount: counts?.nascent || 0,
        activeCount,
        decliningCount: counts?.declining || 0,
        compostedStubs: stubs?.count || 0,
        birthRate: recentBirths?.count || 0,
        compostRate: recentComposts?.count || 0,
        activeRatio: total > 0 ? activeCount / total : 0,
        nascentRatio: total > 0 ? (counts?.nascent || 0) / total : 0,
        avgGeneration: counts?.avg_generation || 0,
        fertilityRate: totalActive > 0 ? fertileActive / totalActive : 0,
    };
}
