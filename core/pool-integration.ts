/**
 * POOL INTEGRATION
 *
 * Bridges the system-level partition pool (pool.db) with the main server's
 * transient partition system. Called at startup and on project switch to
 * activate pending recruitments, and periodically to check return conditions.
 *
 * Return conditions (checked each interval):
 *   1. Time expired: now > return_due_at
 *   2. Cycle exhaustion: current_barren >= exhaustion_threshold AND current_cycles >= min_cycles
 *   3. Max cycles reached: current_cycles >= max_cycles
 *
 * Partitions that haven't hit min_cycles are protected from return (still learning).
 *
 * Generational return: only children (born during visit) and unpaired/childless
 * original nodes are returned. Spent parents that produced children are excluded.
 */

import { config } from '../config.js';
import { readProjectsMeta } from '../handlers/projects.js';
import { queryOne } from '../db.js';
import { dbDateMs, dbDate } from '../utils/datetime.js';
import {
    getPendingForProject,
    getActiveForProject,
    updateRecruitment,
    syncRecruitmentCycles,
    returnPartitionToPool,
    checkoutPartition,
    computeFitness,
    recordHistory,
    closePoolDb,
} from '../db/pool-db.js';
import {
    importTransient,
    approveTransient,
    departTransient,
} from '../routes/partitions.js';

let returnCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Filter export data for generational return: keep only children (born during
 * the visit) and childless/unpaired original nodes; drop spent parents that
 * produced children during the visit.
 *
 * Also refilters edges, integrity logs, and number variables to match the
 * surviving node set, and recomputes the Merkle root.
 *
 * @param exportData - The full partition export data containing nodes, edges, integrity, and numberVariables
 * @param activatedAt - ISO 8601 timestamp of when the recruitment was activated (nodes created after this are "children")
 * @returns Filtered export data with only surviving nodes and their related records
 */
async function filterGenerationalReturn(exportData: any, activatedAt: string): Promise<any> {
    const nodes = exportData?.nodes || [];
    const edges = exportData?.edges || [];
    if (nodes.length === 0) return exportData;

    const activatedTime = new Date(activatedAt).getTime();

    // Build set of nodes that are parents of other nodes in the export
    const parentNodeIds = new Set<string>();
    for (const edge of edges) {
        if (edge.edge_type === 'parent') {
            parentNodeIds.add(edge.source_id);
        }
    }

    // Filter nodes
    const survivingNodes = nodes.filter((n: any) => {
        const createdAt = dbDateMs(n.created_at);
        // Children: born during the visit
        if (createdAt >= activatedTime) return true;
        // Original nodes that are childless (stillbirths) — keep them
        if (!parentNodeIds.has(n.id)) return true;
        // Spent parents — exclude
        return false;
    });

    const survivingIds = new Set(survivingNodes.map((n: any) => n.id));

    // Filter edges to only those between surviving nodes
    const survivingEdges = edges.filter((e: any) =>
        survivingIds.has(e.source_id) && survivingIds.has(e.target_id)
    );

    // Filter integrity log to only entries for surviving nodes
    const filteredIntegrity = exportData.integrity ? { ...exportData.integrity } : undefined;
    if (filteredIntegrity?.log) {
        filteredIntegrity.log = filteredIntegrity.log.filter((e: any) =>
            survivingIds.has(e.nodeId || e.node_id)
        );
        filteredIntegrity.chainLength = filteredIntegrity.log.length;
        filteredIntegrity.nodesTotal = survivingNodes.length;
    }

    // Recompute Merkle root for surviving nodes
    if (filteredIntegrity) {
        try {
            const { computeMerkleRoot } = await import('./integrity.js');
            const hashes = survivingNodes.map((n: any) => n.content_hash).filter(Boolean);
            filteredIntegrity.merkleRoot = computeMerkleRoot(hashes);
            filteredIntegrity.nodesWithHashes = hashes.length;
        } catch { /* integrity module not available */ }
    }

    // Filter number variables to only those referenced by surviving nodes
    let filteredNumberVariables = exportData.numberVariables;
    if (filteredNumberVariables?.registry?.length > 0 && survivingIds.size < nodes.length) {
        const survivingRefs = (filteredNumberVariables.refs || []).filter((r: any) => survivingIds.has(r.node_id));
        const survivingVarIds = new Set(survivingRefs.map((r: any) => r.var_id));
        filteredNumberVariables = {
            registry: filteredNumberVariables.registry.filter((r: any) => survivingVarIds.has(r.var_id)),
            refs: survivingRefs,
        };
        if (filteredNumberVariables.registry.length === 0) filteredNumberVariables = undefined;
    }

    return {
        ...exportData,
        nodes: survivingNodes,
        edges: survivingEdges,
        nodeCount: survivingNodes.length,
        edgeCount: survivingEdges.length,
        ...(filteredIntegrity ? { integrity: filteredIntegrity } : {}),
        ...(filteredNumberVariables ? { numberVariables: filteredNumberVariables } : {}),
    };
}

/**
 * Process pending recruitments for the currently loaded project.
 * Called at startup and after project switch. For each pending recruitment:
 *   1. Performs exclusive checkout from the pool DB
 *   2. Imports as transient partition (quarantine)
 *   3. Auto-approves with configured bridges
 *   4. Calculates return-due time
 *   5. Records history event
 *
 * @returns The number of recruitments successfully activated
 */
export async function checkAndActivateRecruitments(): Promise<number> {
    const meta = readProjectsMeta();
    const currentProject = meta.currentProject;
    if (!currentProject) return 0;

    const pending = getPendingForProject(currentProject);
    if (pending.length === 0) return 0;

    let activated = 0;
    for (const recruitment of pending) {
        try {
            // Exclusive checkout — skip if already checked out
            const checkedOut = checkoutPartition(recruitment.pool_partition_id);
            if (!checkedOut) {
                console.log(`[pool] Skipping recruitment ${recruitment.id}: partition already checked out`);
                continue;
            }

            // Parse the stored export data
            const exportData = JSON.parse(recruitment.export_data);

            // Snapshot before-stats for delta tracking on return
            const { avgWeight, breakthroughCount } = computeFitness(exportData);
            const nodeCount = (exportData.nodes || []).length;

            // Import as transient partition (goes to quarantine — throws on error)
            const importResult = await importTransient(exportData);
            const transientId = importResult.partitionId;

            // Auto-approve pool imports (trusted content from previous exports)
            const bridgesConfig = recruitment.bridges_config
                ? JSON.parse(recruitment.bridges_config)
                : undefined;
            const approveResult = await approveTransient(transientId, bridgesConfig) as any;
            if (approveResult.error) {
                updateRecruitment(recruitment.id, { status: 'failed', error: approveResult.error });
                continue;
            }

            // Calculate return due time
            const now = new Date();
            const returnDue = new Date(now.getTime() + recruitment.procreation_hours * 3600000);

            updateRecruitment(recruitment.id, {
                status: 'active',
                activated_at: now.toISOString(),
                return_due_at: returnDue.toISOString(),
                transient_id: transientId,
                node_count_at_recruit: nodeCount,
                avg_weight_at_recruit: avgWeight,
                breakthroughs_at_recruit: breakthroughCount,
            });

            // Record history: recruited event
            recordHistory({
                poolPartitionId: recruitment.pool_partition_id,
                recruitmentId: recruitment.id,
                eventType: 'recruited',
                project: currentProject,
                nodeCount,
                breakthroughCount,
                avgWeight,
            });

            activated++;
            console.log(`[pool] Activated recruitment ${recruitment.id} → ${transientId}`);
            console.log(`[pool]   Snapshot: ${nodeCount} nodes, avg_weight=${avgWeight}, breakthroughs=${breakthroughCount}`);
            console.log(`[pool]   Time limit: ${recruitment.procreation_hours}h (due: ${returnDue.toISOString()})`);
            console.log(`[pool]   Cycle limits: min=${recruitment.min_cycles}, max=${recruitment.max_cycles}, exhaustion=${recruitment.exhaustion_threshold}`);
        } catch (err: any) {
            updateRecruitment(recruitment.id, { status: 'failed', error: err.message });
            console.error(`[pool] Failed to activate recruitment ${recruitment.id}: ${err.message}`);
        }
    }

    return activated;
}

/**
 * Sync cycle counts from the project DB's `domain_partitions` into pool.db
 * recruitments, then check return conditions for each active recruitment:
 *   1. Time expired: now >= return_due_at
 *   2. Max cycles reached: cycles >= max_cycles
 *   3. Exhaustion: barren cycles >= threshold (only after min_cycles met)
 *
 * Returned partitions are exported via `departTransient`, filtered through
 * generational return (keeping children + unpaired originals), and written
 * back to the pool DB.
 *
 * @returns The number of recruitments returned to the pool
 */
export async function checkAndReturnExpiredRecruitments(): Promise<number> {
    const meta = readProjectsMeta();
    const currentProject = meta.currentProject;
    if (!currentProject) return 0;

    const active = getActiveForProject(currentProject);
    if (active.length === 0) return 0;

    const now = new Date();
    let returned = 0;

    for (const recruitment of active) {
        try {
            // --- Sync cycle counts from project DB ---
            const partitionRow = await queryOne(
                `SELECT cycles_completed, barren_cycles FROM domain_partitions WHERE id = $1`,
                [recruitment.transient_id]
            );
            const cycles = partitionRow?.cycles_completed ?? 0;
            const barren = partitionRow?.barren_cycles ?? 0;
            syncRecruitmentCycles(recruitment.id, cycles, barren);

            // --- Check return conditions ---
            let returnReason: string | null = null;

            // Condition 1: Time expired
            if (recruitment.return_due_at) {
                const due = dbDate(recruitment.return_due_at);
                if (due && now >= due) {
                    returnReason = `Time expired (${recruitment.procreation_hours}h)`;
                }
            }

            // Condition 2: Max cycles reached
            if (!returnReason && recruitment.max_cycles > 0 && cycles >= recruitment.max_cycles) {
                returnReason = `Max cycles reached (${cycles}/${recruitment.max_cycles})`;
            }

            // Condition 3: Exhaustion (barren cycles exceeded threshold, but only after min_cycles)
            if (!returnReason && cycles >= (recruitment.min_cycles || 0)) {
                if (barren >= (recruitment.exhaustion_threshold || 10)) {
                    returnReason = `Exhausted (${barren} barren cycles after ${cycles} total)`;
                }
            }

            if (!returnReason) continue;

            // --- Return partition to pool ---
            console.log(`[pool] Returning recruitment ${recruitment.id}: ${returnReason}`);
            updateRecruitment(recruitment.id, { status: 'returning' });

            const departResult = await departTransient(
                recruitment.transient_id,
                `Pool return: ${returnReason}`
            ) as any;

            if (departResult.error) {
                updateRecruitment(recruitment.id, { status: 'failed', error: departResult.error });
                continue;
            }

            if (departResult.exportData) {
                // Apply generational filter: only children + unpaired nodes return
                const filteredExport = await filterGenerationalReturn(
                    departResult.exportData,
                    recruitment.activated_at
                );
                const originalCount = (departResult.exportData.nodes || []).length;
                const filteredCount = filteredExport.nodes.length;

                console.log(`[pool] Generational filter: ${originalCount} → ${filteredCount} nodes (shed ${originalCount - filteredCount} spent parents)`);

                returnPartitionToPool(recruitment.id, filteredExport);
            } else {
                updateRecruitment(recruitment.id, { status: 'returned', returned_at: now.toISOString() });
            }

            returned++;
            console.log(`[pool] Returned: ${returnReason} | cycles=${cycles} barren=${barren}`);
        } catch (err: any) {
            updateRecruitment(recruitment.id, { status: 'failed', error: err.message });
            console.error(`[pool] Failed to return recruitment ${recruitment.id}: ${err.message}`);
        }
    }

    return returned;
}

/**
 * Start the periodic return check interval. Runs
 * {@link checkAndReturnExpiredRecruitments} at the interval configured in
 * `config.partitionServer.returnCheckIntervalMs`. No-ops if already running.
 */
export function startPoolReturnCheck(): void {
    if (returnCheckInterval) return;
    const intervalMs = config.partitionServer.returnCheckIntervalMs;

    returnCheckInterval = setInterval(async () => {
        try {
            const returned = await checkAndReturnExpiredRecruitments();
            if (returned > 0) {
                console.log(`[pool] Auto-returned ${returned} expired recruitment(s)`);
            }
        } catch { /* non-fatal */ }
    }, intervalMs);
}

/**
 * Stop the periodic return check interval. Safe to call even if not running.
 */
export function stopPoolReturnCheck(): void {
    if (returnCheckInterval) {
        clearInterval(returnCheckInterval);
        returnCheckInterval = null;
    }
}

/**
 * Full cleanup: stop the periodic return check interval and close the pool DB
 * connection. Called during server shutdown.
 */
export function shutdownPoolIntegration(): void {
    stopPoolReturnCheck();
    closePoolDb();
}
