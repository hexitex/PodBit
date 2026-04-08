/**
 * Elite Verification Pool — Generation Tracking
 *
 * Manages the generation number assigned to each node in the knowledge graph.
 * Generation tracks how many synthesis/verification steps separate a node from
 * its seed ancestors:
 *
 *   Gen 0: Seed nodes (human input)
 *   Gen 1: First-level synthesis
 *   Gen 2: EVM verification of Gen 1 (elite promotion)
 *   Gen N: max(parent generations) + 1
 *
 * The generation ceiling (`maxGeneration` config) prevents unbounded synthesis
 * depth. Nodes at the ceiling are "terminal findings".
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import type { GenerationInfo } from './elite-pool-types.js';

// =============================================================================
// GENERATION TRACKING
// =============================================================================

/**
 * Compute the generation number for a new node based on its parents.
 * Generation = max(parent generations) + 1.
 * For nodes with no parents, generation = 0.
 *
 * @param parentIds - IDs of the parent nodes; empty array yields generation 0
 * @returns Generation metadata including whether the ceiling has been reached
 */
export async function computeGeneration(parentIds: string[]): Promise<GenerationInfo> {
    const maxGen = appConfig.elitePool.maxGeneration;

    if (parentIds.length === 0) {
        return { generation: 0, maxGeneration: maxGen, atCeiling: false, parentGenerations: [] };
    }

    const placeholders = parentIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query(
        `SELECT generation FROM nodes WHERE id IN (${placeholders})`,
        parentIds,
    ) as any[];

    const parentGens = rows.map((r: any) => r.generation ?? 0);
    const generation = Math.max(...parentGens) + 1;

    return {
        generation,
        maxGeneration: maxGen,
        atCeiling: generation >= maxGen,
        parentGenerations: parentGens,
    };
}

/**
 * Backfill generation numbers for existing nodes based on parent-chain depth.
 * Uses BFS from root nodes (no parents). Roots get generation=0.
 * Each child gets max(parent generations) + 1.
 *
 * Also called from db/migrations.ts as a one-time migration, but exported here
 * so it can be triggered manually via MCP if needed.
 *
 * Safety: BFS is bounded to 100 waves to prevent infinite loops from
 * cyclic edges.
 *
 * @returns The number of non-root nodes whose generation was updated
 */
export async function backfillGenerations(): Promise<number> {
    const allNodes = await query(`
        SELECT n.id,
               GROUP_CONCAT(e.source_id) as parent_ids
        FROM nodes n
        LEFT JOIN edges e ON e.target_id = n.id AND e.edge_type = 'parent'
        WHERE n.archived = FALSE
        GROUP BY n.id
    `) as any[];

    const parentMap = new Map<string, string[]>();
    const childMap = new Map<string, string[]>();
    const roots: string[] = [];

    for (const row of allNodes) {
        const parents: string[] = row.parent_ids ? row.parent_ids.split(',') : [];
        parentMap.set(row.id, parents);
        if (parents.length === 0) roots.push(row.id);
        for (const p of parents) {
            const children = childMap.get(p) || [];
            children.push(row.id);
            childMap.set(p, children);
        }
    }

    const generationMap = new Map<string, number>();
    for (const r of roots) generationMap.set(r, 0);

    // Seed roots
    for (const r of roots) {
        await query('UPDATE nodes SET generation = 0 WHERE id = $1', [r]);
    }

    let wave = [...roots];
    let updated = 0;
    let safetyCounter = 0;

    while (wave.length > 0 && safetyCounter < 100) {
        const nextWave: string[] = [];
        for (const nodeId of wave) {
            for (const child of childMap.get(nodeId) || []) {
                if (generationMap.has(child)) continue;
                const parents = parentMap.get(child) || [];
                if (!parents.every(p => generationMap.has(p))) continue;
                const maxParentGen = Math.max(...parents.map(p => generationMap.get(p) || 0));
                const childGen = maxParentGen + 1;
                generationMap.set(child, childGen);
                await query('UPDATE nodes SET generation = $1 WHERE id = $2', [childGen, child]);
                updated++;
                nextWave.push(child);
            }
        }
        wave = nextWave;
        safetyCounter++;
    }

    return updated;
}
