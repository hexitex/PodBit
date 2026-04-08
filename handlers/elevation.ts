/**
 * Elevation handlers - Voice and Promote operations.
 *
 * Extracted from mcp-server.js. These handlers manage node voicing
 * (getting context for Claude to synthesize) and promotion to
 * breakthrough status (with generativity boost for ancestors).
 */

import {
    query, queryOne,
    getAccessibleDomains,
    logDecision,
    canOverride,
} from '../core.js';
import { config as appConfig } from '../config.js';
import { invalidateKnowledgeCache } from './knowledge.js';
import { registerBreakthrough } from './breakthrough-registry.js';

/**
 * Return voicing context for the caller to synthesize and propose.
 *
 * Pairs the source node with a partner node (parent or random high-weight
 * node from accessible domains) and provides a mode-specific instruction.
 * No LLM call is made — the caller generates the synthesis and saves via propose.
 *
 * @param params - Object with `nodeId` (required) and optional `mode`
 *   ('object-following'|'sincere'|'cynic'|'pragmatist'|'child').
 * @returns Source node, partner node, mode instruction, and save instructions.
 */
async function handleVoice(params: Record<string, any>) {
    const { nodeId, mode = 'object-following' } = params;

    // Get the source node
    const sourceNode = await queryOne(`
        SELECT * FROM nodes WHERE id = $1 AND archived = FALSE
    `, [nodeId]);

    if (!sourceNode) {
        return { error: 'Node not found' };
    }

    // For object-following, we need a second node
    // If source has parents, use one of them; otherwise, use a random high-weight node
    let partnerNode;
    const parents = await query(`
        SELECT n.* FROM nodes n
        JOIN edges e ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
        LIMIT 1
    `, [nodeId]);

    if (parents.length > 0) {
        partnerNode = parents[0];
    } else {
        // Get a random high-weight node restricted to accessible domains (partition-aware)
        const accessible = await getAccessibleDomains(sourceNode.domain);
        let randoms;
        if (accessible.length > 0) {
            const placeholders = accessible.map((_, i) => `$${i + 2}`).join(', ');
            randoms = await query(`
                SELECT * FROM nodes
                WHERE archived = FALSE
                  AND id != $1
                  AND domain IN (${placeholders})
                ORDER BY weight DESC
                LIMIT 1
            `, [nodeId, ...accessible]);
        } else {
            // No domain — fallback to any node
            randoms = await query(`
                SELECT * FROM nodes
                WHERE archived = FALSE
                  AND id != $1
                ORDER BY weight DESC
                LIMIT 1
            `, [nodeId]);
        }
        partnerNode = randoms[0];
    }

    if (!partnerNode) {
        return { error: 'No partner node found for voicing' };
    }

    // Define voicing modes
    const modeInstructions = {
        'object-following': 'Follow the object of inquiry wherever it leads. Let the ideas themselves guide you, not predetermined conclusions. What does the combination of these concepts reveal?',
        'sincere': 'Speak from genuine understanding. What do you actually believe about these ideas when you consider them honestly?',
        'cynic': 'Challenge these ideas. What are the weaknesses, blind spots, or unstated assumptions? Where might they fail?',
        'pragmatist': 'Focus on practical implications. How would these ideas actually work in practice? What concrete predictions do they make?',
        'child': 'Approach with fresh eyes and simple questions. Why? What if? Strip away jargon and get to the essence.',
    };

    // Return context for Claude to voice - NO API CALL
    return {
        sourceNode: {
            id: sourceNode.id,
            content: sourceNode.content,
            domain: sourceNode.domain,
        },
        partnerNode: {
            id: partnerNode.id,
            content: partnerNode.content,
            domain: partnerNode.domain,
        },
        mode,
        modeInstruction: modeInstructions[mode as keyof typeof modeInstructions] || modeInstructions['object-following'],
        instruction: `Voice a synthesis of these two nodes using the "${mode}" mode. Generate new insight that emerges from their combination. Then use podbit.propose with nodeType="voiced" and parentIds=[sourceNode.id, partnerNode.id] to save it.`,
    };
}

/**
 * Promote a node to breakthrough status.
 *
 * Validates tier override permissions, computes composite validation score,
 * updates the node with scores and breakthrough type, logs the decision,
 * recomputes content hash, boosts ancestor weights (generativity), and
 * registers the breakthrough in the cross-project registry.
 *
 * @param params - Object with `nodeId`, `reason`, `contributor` (all required),
 *   optional `scores` ({synthesis, novelty, testability, tension_resolution}),
 *   and optional `decidedByTier`.
 * @returns Promoted node details with generativity boost info, or `{ error }`.
 */
async function handlePromote(params: Record<string, any>) {
    const { nodeId, reason, contributor, scores, decidedByTier } = params;

    const tier = decidedByTier || 'system';

    // Check tier hierarchy: can this tier promote this node?
    const override = await canOverride('node', nodeId, 'node_type', tier);
    if (!override.allowed) {
        return { error: override.reason, blocked: true };
    }

    // Calculate composite score if scores provided
    let composite = null;
    if (scores) {
        composite = (
            (scores.synthesis || 0) * 0.3 +
            (scores.novelty || 0) * 0.35 +
            (scores.testability || 0) * 0.2 +
            (scores.tension_resolution || 0) * 0.15
        );
        composite = Math.round(composite * 10) / 10;
    }

    // Update the node with validation scores
    const node = await queryOne(`
        UPDATE nodes
        SET node_type = 'breakthrough',
            weight = GREATEST(weight, $2),
            salience = GREATEST(salience, $3),
            validation_synthesis = $4,
            validation_novelty = $5,
            validation_testability = $6,
            validation_tension_resolution = $7,
            validation_composite = $8,
            validation_reason = $9,
            validated_at = NOW(),
            validated_by = $10
        WHERE id = $1 AND archived = FALSE
        RETURNING *
    `, [
        nodeId,
        appConfig.nodes.promoteWeight,
        appConfig.nodes.defaultSalience,
        scores?.synthesis ?? null,
        scores?.novelty ?? null,
        scores?.testability ?? null,
        scores?.tension_resolution ?? null,
        composite,
        reason,
        contributor,
    ]);

    if (!node) {
        return { error: 'Node not found' };
    }

    console.error(`Node ${nodeId} promoted to breakthrough by ${contributor} (${tier}): ${reason}`);

    // Log the promotion decision
    await logDecision('node', nodeId, 'node_type', null, 'breakthrough', tier, contributor, reason);

    // Update content hash (node_type changed from synthesis → breakthrough)
    try {
        const { computeContentHash, logOperation: logIntegrity } = await import('../core/integrity.js');
        const oldHash = node.content_hash || null;
        // Fetch parent hashes
        const parentRows = await query(
            `SELECT n.content_hash FROM edges e JOIN nodes n ON n.id = e.source_id
             WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.content_hash IS NOT NULL`,
            [nodeId]
        );
        const parentHashes = parentRows.map((r: any) => r.content_hash).filter(Boolean);
        const newHash = computeContentHash({
            content: node.content,
            nodeType: 'breakthrough',
            contributor: node.contributor || null,
            createdAt: node.created_at,
            parentHashes,
        });
        await queryOne('UPDATE nodes SET content_hash = $1 WHERE id = $2', [newHash, nodeId]);

        logIntegrity({
            nodeId,
            operation: 'promoted',
            contentHashBefore: oldHash,
            contentHashAfter: newHash,
            parentHashes,
            contributor,
            domain: node.domain,
            details: { reason, composite, scores },
        }).catch((err: any) => {
            console.error(`[integrity] Failed to log promotion for ${nodeId}: ${err.message}`);
        });
    } catch (err: any) {
        console.error(`[integrity] Failed to update hash on promote for ${nodeId}: ${err.message}`);
    }

    // === Generativity boost ===
    // Walk the lineage: boost parent nodes that contributed to this breakthrough
    const boostedParents = await boostGenerativeAncestors(nodeId, contributor);

    // Invalidate cached compress/summarize for this node's domain
    invalidateKnowledgeCache(node.domain);

    // Register in shared breakthrough registry (non-fatal)
    try {
        // Fetch parent contents for the snapshot
        const parentNodes = await query(`
            SELECT n.content FROM nodes n
            JOIN edges e ON n.id = e.source_id
            WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
              AND n.archived = FALSE
        `, [nodeId]);

        await registerBreakthrough({
            nodeId,
            content: node.content,
            domain: node.domain,
            trajectory: node.trajectory,
            scores: scores ? {
                synthesis: scores.synthesis,
                novelty: scores.novelty,
                testability: scores.testability,
                tension_resolution: scores.tension_resolution,
                composite: composite ?? undefined,
            } : undefined,
            validationReason: reason,
            promotedBy: contributor,
            promotionSource: 'manual',
            parentContents: parentNodes.map((p: any) => p.content),
            generativityBoosts: boostedParents,
        });
    } catch (err: any) {
        console.error(`[breakthrough-registry] Failed to register manual breakthrough: ${err.message}`);
    }

    return {
        success: true,
        node: {
            id: node.id,
            content: node.content,
            type: node.node_type,
            weight: node.weight,
            decidedByTier: tier,
            scores: scores ? {
                synthesis: scores.synthesis,
                novelty: scores.novelty,
                testability: scores.testability,
                tension_resolution: scores.tension_resolution,
                composite,
            } : null,
        },
        promotedBy: contributor,
        reason,
        generativity: boostedParents.length > 0 ? {
            boostedAncestors: boostedParents.length,
            ancestors: boostedParents,
        } : null,
    };
}

/**
 * Boost ancestor weights when a descendant is promoted to breakthrough.
 *
 * Walks the parent lineage up to 2 generations and applies weight boosts
 * (capped at `engine.weightCeiling`), rewarding source material that leads
 * to productive outcomes.
 *
 * Boost schedule:
 * - Direct parents: +0.15 weight
 * - Grandparents:   +0.05 weight
 *
 * Avoids double-boosting if a grandparent is also a direct parent.
 * Logs a decision for each boosted node.
 *
 * @param nodeId - The breakthrough node whose ancestors should be boosted.
 * @param contributor - Who triggered the promotion (for audit trail).
 * @returns Array of boosted ancestor records with id, boost amount, and generation.
 */
async function boostGenerativeAncestors(nodeId: string, contributor: string) {
    const boosted: { id: string; boost: number; generation: number }[] = [];
    const PARENT_BOOST = 0.15;
    const GRANDPARENT_BOOST = 0.05;

    // Get direct parents
    const parents = await query(`
        SELECT DISTINCT e.source_id, n.content, n.weight
        FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
          AND n.archived = FALSE
    `, [nodeId]);

    const ceiling = appConfig.engine?.weightCeiling ?? 3.0;

    for (const parent of parents) {
        // Boost parent weight (capped)
        const cappedWeight = Math.min(ceiling, parent.weight + PARENT_BOOST);
        await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [cappedWeight, parent.source_id]);
        await logDecision('node', parent.source_id, 'weight', String(parent.weight), String(cappedWeight), 'system', contributor, `Generativity boost: child ${nodeId.slice(0, 8)} promoted to breakthrough`);
        boosted.push({ id: parent.source_id, boost: PARENT_BOOST, generation: 1 });

        // Get grandparents
        const grandparents = await query(`
            SELECT DISTINCT e.source_id, n.content, n.weight
            FROM edges e
            JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
              AND n.archived = FALSE
        `, [parent.source_id]);

        for (const gp of grandparents) {
            // Avoid double-boosting if grandparent is also a direct parent
            if (boosted.some(b => b.id === gp.source_id)) continue;
            const cappedGpWeight = Math.min(ceiling, gp.weight + GRANDPARENT_BOOST);
            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [cappedGpWeight, gp.source_id]);
            await logDecision('node', gp.source_id, 'weight', String(gp.weight), String(cappedGpWeight), 'system', contributor, `Generativity boost (grandparent): descendant ${nodeId.slice(0, 8)} promoted to breakthrough`);
            boosted.push({ id: gp.source_id, boost: GRANDPARENT_BOOST, generation: 2 });
        }
    }

    if (boosted.length > 0) {
        console.error(`[generativity] Boosted ${boosted.length} ancestors of breakthrough ${nodeId.slice(0, 8)}`);
    }

    return boosted;
}

/**
 * Demote a "possible" node back to synthesis.
 * Used when a breakthrough candidate doesn't qualify after human/MCP review.
 */
async function handleDemote(params: Record<string, any>) {
    const { nodeId, reason = 'Demoted via review', contributor = 'system' } = params;

    const node = await queryOne(`SELECT id, node_type, weight, domain FROM nodes WHERE id = $1`, [nodeId]);
    if (!node) {
        return { error: `Node ${nodeId} not found` };
    }

    if (node.node_type === 'synthesis') {
        // Already demoted (e.g. by auto-demote in feedback handler) — return success idempotently
        return { nodeId, previousType: 'synthesis', newType: 'synthesis', reason, alreadyDemoted: true };
    }

    if (node.node_type === 'elite_verification') {
        const { demoteFromElite } = await import('../core/elite-pool.js');
        return demoteFromElite(nodeId, reason, contributor);
    }

    if (node.node_type !== 'possible') {
        return { error: `Node ${nodeId} is not a "possible" breakthrough or elite node (type: ${node.node_type})` };
    }

    // Demote back to synthesis
    await query(`UPDATE nodes SET node_type = 'synthesis' WHERE id = $1`, [nodeId]);

    await logDecision('node', nodeId, 'node_type', 'possible', 'synthesis', contributor, 'demotion', reason);

    // Invalidate cache for the domain
    if (node.domain) {
        await invalidateKnowledgeCache(node.domain);
    }

    console.error(`[elevation] Demoted ${nodeId.slice(0, 8)} from "possible" to synthesis: ${reason}`);

    return {
        nodeId,
        previousType: 'possible',
        newType: 'synthesis',
        reason,
    };
}

export { handleVoice, handlePromote, handleDemote };
