/**
 * Autonomous Voicing Cycle — persona-driven synthesis.
 *
 * Picks high-weight nodes, pairs them with partners, and calls the LLM
 * with a randomly selected persona mode (sincere, cynic, pragmatist,
 * child, object-following). Produces `voiced` nodes with diverse
 * perspectives, complementing the synthesis cycle's strict logical derivation.
 */

import { query, } from '../../db.js';
import { getAccessibleDomains, getExcludedDomainsForCycle } from '../governance.js';
import { config as appConfig } from '../../config.js';
import { RC } from '../../config/constants.js';
import { voice } from '../voicing.js';
import { createNode, createEdge } from '../node-ops.js';
import { getAssignedModel } from '../../models.js';
import { emitActivity } from '../../services/event-bus.js';
import { cosineSimilarity, parseEmbedding, checkDomainDrift } from '../scoring.js';
import { getEmbedding } from '../../models.js';

/**
 * One tick of the voicing cycle: pick one high-weight node, find a partner,
 * voice with a random persona, and create a child node.
 *
 * The cycle selects a candidate node that hasn't been recently voiced,
 * finds a partner (preferring parents, falling back to high-weight accessible nodes),
 * picks a random persona mode, and calls the voice function. If voicing succeeds
 * and the result passes dedup, a new `voiced` node is created with parent edges.
 *
 * @returns Resolves when the tick completes (whether a node was created or not)
 */
async function runVoicingCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.voicing;

    // Budget gate
    try {
        const { isBudgetExceeded } = await import('../../models/budget.js');
        if (isBudgetExceeded()) return;
    } catch { /* budget module not loaded */ }

    // Select high-weight nodes that haven't been recently voiced as a parent
    const voicingCandidates = await query(`
        SELECT n.id, n.content, n.weight, n.domain, n.node_type, n.embedding_bin
        FROM nodes n
        WHERE n.archived = FALSE
          AND n.lab_status IS NULL
          AND n.weight >= $1
          AND n.node_type NOT IN ('raw', 'question', 'elite_verification')
          AND n.id NOT IN (
              SELECT e.source_id FROM edges e
              JOIN nodes child ON child.id = e.target_id
              WHERE e.edge_type = 'parent'
                AND child.node_type = 'voiced'
                AND child.contributor = 'voicing-cycle'
                AND child.created_at > datetime('now', '-1 hour')
          )
        ORDER BY n.weight DESC
        LIMIT ${RC.queryLimits.voicingCandidates}
    `, [cfg.minWeightThreshold]);

    // Filter out domains excluded from the voicing cycle, take top 1
    const excludedDomains = await getExcludedDomainsForCycle('voicing');
    const filtered = excludedDomains.size > 0
        ? voicingCandidates.filter((n: any) => !n.domain || !excludedDomains.has(n.domain))
        : voicingCandidates;
    const candidate = filtered[0] ?? null;

    if (!candidate) return;

    // Find a partner node — prefer parents, fall back to high-weight accessible node
    let partner: any = null;

    const parents = await query(`
        SELECT n.* FROM nodes n
        JOIN edges e ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
          AND n.archived = FALSE AND n.lab_status IS NULL
        LIMIT ${RC.queryLimits.voicingCandidates}
    `, [(candidate as any).id]);

    if (parents.length > 0) {
        // Pick a random parent
        partner = parents[Math.floor(Math.random() * parents.length)];
    } else {
        // Random high-weight node from accessible domains
        const accessible = (candidate as any).domain
            ? await getAccessibleDomains((candidate as any).domain)
            : null;

        if (accessible && accessible.length > 0) {
            const placeholders = accessible.map((_: string, i: number) => `$${i + 2}`).join(', ');
            const randoms = await query(`
                SELECT * FROM nodes
                WHERE archived = FALSE
                  AND lab_status IS NULL
                  AND id != $1
                  AND domain IN (${placeholders})
                  AND node_type NOT IN ('raw', 'question', 'elite_verification')
                ORDER BY weight DESC
                LIMIT ${RC.queryLimits.voicingCandidates}
            `, [(candidate as any).id, ...accessible]);
            if (randoms.length > 0) {
                partner = randoms[Math.floor(Math.random() * randoms.length)];
            }
        } else {
            const randoms = await query(`
                SELECT * FROM nodes
                WHERE archived = FALSE
                  AND lab_status IS NULL
                  AND id != $1
                  AND node_type NOT IN ('raw', 'question', 'elite_verification')
                ORDER BY weight DESC
                LIMIT ${RC.queryLimits.voicingCandidates}
            `, [(candidate as any).id]);
            if (randoms.length > 0) {
                partner = randoms[Math.floor(Math.random() * randoms.length)];
            }
        }
    }

    if (!partner) {
        emitActivity('cycle', 'voicing_skip', 'No partner found for voicing', { nodeId: (candidate as any).id });
        return;
    }

    // Parent-pair similarity screen — reject if parents are near-duplicates (paraphrase)
    const candEmb = (candidate as any).embedding_bin ?? (candidate as any).embedding;
    const partEmb = partner.embedding_bin ?? partner.embedding;
    const pairSim = (candEmb && partEmb) ? cosineSimilarity(candEmb, partEmb) : 0;
    const pairCeiling = appConfig.synthesisEngine?.similarityCeiling ?? 0.92;
    if (pairSim > pairCeiling) {
        emitActivity('cycle', 'voicing_rejected', `Parent pair too similar (${pairSim.toFixed(3)} > ${pairCeiling}) — redundant pairing`, {
            nodeA: (candidate as any).id,
            nodeB: partner.id,
            similarity: pairSim,
            threshold: pairCeiling,
            rejectionReason: 'redundant_pairing',
        });
        return;
    }

    // Pick a random persona mode
    const modes = cfg.modes && cfg.modes.length > 0
        ? cfg.modes
        : ['object-following', 'sincere', 'cynic', 'pragmatist', 'child'];
    const mode = modes[Math.floor(Math.random() * modes.length)];

    // Get model info before voicing (so rejections can also report it)
    const voiceModel = getAssignedModel('voice' as any);

    // Call the voice function — handles all quality gates
    const voiceResult = await voice(candidate as any, partner as any, mode, 'voice');

    if (!voiceResult.content) {
        emitActivity('cycle', 'voicing_rejected', `Voicing rejected (${mode})${voiceResult.rejectionReason ? ': ' + voiceResult.rejectionReason : ''}`, {
            nodeA: (candidate as any).id,
            nodeB: partner.id,
            mode,
            rejectionReason: voiceResult.rejectionReason ?? null,
            ...(voiceResult.rejectionDetail ?? {}),
            modelId: voiceModel?.id ?? null,
            modelName: voiceModel?.name ?? null,
        });
        return;
    }

    // Determine target domain
    const targetDomain = (candidate as any).domain || partner.domain || null;

    // Domain relevance gate: uses instruct embeddings to compare voiced output
    // against domain seed centroid. Prevents vocabulary convergence.
    const driftCheck = await checkDomainDrift(voiceResult.content, targetDomain);
    if (driftCheck.drifted) {
        emitActivity('cycle', 'voicing_rejected', `Voiced content rejected — domain drift (similarity ${driftCheck.similarity.toFixed(3)} < ${driftCheck.threshold} to "${targetDomain}" seed centroid)`, {
            nodeA: (candidate as any).id,
            nodeB: partner.id,
            mode,
            rejectionReason: 'domain_drift',
            similarity: driftCheck.similarity,
            threshold: driftCheck.threshold,
            domain: targetDomain,
            modelId: voiceModel?.id ?? null,
            modelName: voiceModel?.name ?? null,
        });
        console.error(`[voicing] Rejected domain drift (${driftCheck.similarity.toFixed(3)} < ${driftCheck.threshold}) for "${targetDomain}": "${voiceResult.content.slice(0, 80)}..."`);
        return;
    }

    const child = await createNode(voiceResult.content, 'voiced', 'voicing-cycle', {
        domain: targetDomain,
        contributor: 'voicing-cycle',
        modelId: voiceModel?.id ?? null,
        modelName: voiceModel?.name ?? null,
    });

    if (!child) {
        emitActivity('cycle', 'voicing_dedup', `Voiced content rejected (duplicate)`, { mode });
        return;
    }

    // Set voice_mode on the new node
    await query('UPDATE nodes SET voice_mode = $1 WHERE id = $2', [mode, child.id]);

    // Create parent edges
    await createEdge((candidate as any).id, child.id, 'parent');
    await createEdge(partner.id, child.id, 'parent');

    emitActivity('cycle', 'voicing_created', `Voiced (${mode}): "${voiceResult.content!.slice(0, 60)}..."`, {
        nodeId: child.id,
        parentA: (candidate as any).id,
        parentB: partner.id,
        mode,
        domain: targetDomain,
        modelId: voiceModel?.id ?? null,
        modelName: voiceModel?.name ?? null,
    });

    console.error(`[voicing] Created voiced node ${child.id.slice(0, 8)} (${mode}) from ${(candidate as any).id.slice(0, 8)} + ${partner.id.slice(0, 8)}`);
}

export { runVoicingCycleSingle };
