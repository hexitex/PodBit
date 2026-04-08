/**
 * Elite Verification Pool — Elite-to-Elite Bridging
 *
 * Identifies pairs of elite nodes suitable for cross-synthesis (bridging)
 * and logs bridging attempts for retry limiting. Bridging creates higher-generation
 * elite nodes by synthesizing two existing elite nodes from different domains.
 *
 * Priority strategies:
 *   - `cross_domain`: Favors pairs spanning different domains (especially manifest bridges)
 *   - `lowest_generation`: Favors pairs closest to empirical ground truth
 *   - `highest_confidence`: Uses generation as a proxy (lower gen = higher confidence)
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import { getProjectManifest } from './project-context.js';
import { RC } from '../config/constants.js';
import type { EliteBridgingCandidate, EliteBridgingAttempt } from './elite-pool-types.js';

// =============================================================================
// ELITE-TO-ELITE BRIDGING
// =============================================================================

/**
 * Find elite nodes that are candidates for bridging (cross-synthesis).
 * Prioritizes pairs that:
 *   a. Span different manifest bridges (cross-domain)
 *   b. Have the lowest generation numbers (closest to empirical ground)
 *   c. Have not been previously bridged together
 *
 * Pairs whose resulting elite promotion would hit the generation ceiling
 * are excluded. The O(n^2) pairing is bounded by the pool size (elite nodes
 * below maxGeneration).
 *
 * @param limit - Maximum number of candidate pairs to return (default: 10)
 * @returns Candidate pairs sorted by descending priority score
 */
export async function getEliteBridgingCandidates(limit: number = RC.queryLimits.eliteBridgingCandidates): Promise<EliteBridgingCandidate[]> {
    const cfg = appConfig.elitePool;
    if (!cfg.enableEliteBridging) return [];

    const maxGen = cfg.maxGeneration;

    // Get all elite nodes below max generation (they can still be synthesis parents)
    const eliteNodes = await query(`
        SELECT n.id, n.content, n.domain, n.generation, n.embedding, n.embedding_bin
        FROM nodes n
        JOIN elite_nodes en ON en.node_id = n.id
        WHERE n.node_type = 'elite_verification'
          AND n.generation < $1
          AND n.archived = 0
        ORDER BY n.generation ASC, n.weight DESC
    `, [maxGen]) as any[];

    if (eliteNodes.length < 2) return [];

    const manifest = await getProjectManifest();
    const manifestBridges = manifest?.bridges || [];

    // Build attempt-count map to avoid re-running failed pairs
    const previousAttempts = await query(`
        SELECT parent_a_id, parent_b_id, COUNT(*) as attempts
        FROM elite_bridging_log
        GROUP BY parent_a_id, parent_b_id
    `) as any[];
    const attemptMap = new Map<string, number>();
    for (const row of previousAttempts) {
        attemptMap.set([row.parent_a_id, row.parent_b_id].sort().join('|'), row.attempts);
    }

    const candidates: EliteBridgingCandidate[] = [];

    for (let i = 0; i < eliteNodes.length; i++) {
        for (let j = i + 1; j < eliteNodes.length; j++) {
            const a = eliteNodes[i];
            const b = eliteNodes[j];

            // Bridge result generation = max(a.gen, b.gen) + 1 (synthesis)
            // Elite promotion would be max(a.gen, b.gen) + 2 — skip if that hits ceiling
            if (Math.max(a.generation, b.generation) + 1 >= maxGen) continue;

            const pairKey = [a.id, b.id].sort().join('|');
            const prevAttempts = attemptMap.get(pairKey) || 0;
            if (prevAttempts >= cfg.maxBridgingAttemptsPerPair) continue;

            const crossDomain = a.domain !== b.domain;
            const spansManifestBridge = crossDomain && manifestBridges.some(
                (bridge: string[]) =>
                    bridge.includes(a.domain) && bridge.includes(b.domain),
            );

            let priority = 0;
            if (cfg.bridgingPriority === 'cross_domain') {
                priority = crossDomain ? 100 : 0;
                priority += spansManifestBridge ? RC.misc.eliteBridgePriorityBonus : 0;
                priority -= (a.generation + b.generation);
                priority -= prevAttempts * 10;
            } else if (cfg.bridgingPriority === 'lowest_generation') {
                priority = -(a.generation + b.generation);
                priority += crossDomain ? 10 : 0;
                priority -= prevAttempts * 10;
            } else { // highest_confidence — use generation as proxy
                priority = -(a.generation + b.generation);
                priority -= prevAttempts * 10;
            }

            candidates.push({
                nodeA: { id: a.id, content: a.content, domain: a.domain, generation: a.generation },
                nodeB: { id: b.id, content: b.content, domain: b.domain, generation: b.generation },
                bridgePriority: priority,
                spansManifestBridge,
                previousAttempts: prevAttempts,
            });
        }
    }

    candidates.sort((a, b) => b.bridgePriority - a.bridgePriority);
    return candidates.slice(0, limit);
}

/**
 * Record a bridging attempt in the `elite_bridging_log` table and emit
 * an activity event. Used for both successful and failed bridging attempts.
 *
 * @param attempt - The bridging attempt details to log
 */
export async function logBridgingAttempt(attempt: EliteBridgingAttempt): Promise<void> {
    await query(`
        INSERT INTO elite_bridging_log (parent_a_id, parent_b_id, synthesis_node_id, outcome)
        VALUES ($1, $2, $3, $4)
    `, [attempt.parentAId, attempt.parentBId, attempt.synthesisNodeId || null, attempt.outcome]);

    emitActivity('elite', 'elite_bridging_attempted',
        `Bridge ${attempt.outcome}: ${attempt.parentAId.slice(0, 8)} + ${attempt.parentBId.slice(0, 8)}`,
        {
            parentAId: attempt.parentAId,
            parentBId: attempt.parentBId,
            outcome: attempt.outcome,
            synthesisNodeId: attempt.synthesisNodeId,
        },
    );
}
