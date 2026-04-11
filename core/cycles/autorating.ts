/**
 * @module core/cycles/autorating
 *
 * Autonomous Autorating Cycle.
 *
 * Rates unrated nodes by calling the autorating LLM subsystem with node
 * content and parent context. Ratings are +1 (useful), 0 (not useful),
 * or -1 (harmful). Processes nodes sequentially with event-loop yields
 * to avoid starving the GUI.
 */

import { query, queryOne, yieldToEventLoop } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { callSubsystemModel } from '../../models.js';
import { getPrompt } from '../../prompts.js';
import { getProjectContextBlock } from '../project-context.js';
import { handleRate } from '../../handlers/feedback.js';
import { emitActivity, nodeLabel } from '../../services/event-bus.js';
import { resolveContent } from '../number-variables.js';
import { buildProvenanceTag } from '../provenance.js';

/**
 * Rate a single node using the autorating LLM subsystem.
 *
 * Gathers parent nodes for grounding context, resolves number-variable
 * placeholders, calls the LLM with the autorating prompt, parses the
 * JSON response, and applies the rating via `handleRate`.
 *
 * @param node - The node to rate (must have `id`, `content`, `node_type`, `domain`)
 * @param projectContext - Project context block to inject into the prompt
 * @returns `true` on success, `false` on parse/validation failure (node skipped)
 */
async function autorateOneNode(node: any, projectContext: string): Promise<boolean> {
    // Gather parent nodes for grounding context
    const parents = await query(`
        SELECT n.content, n.node_type, n.generation, n.contributor, n.origin,
               n.verification_status, n.verification_score
        FROM nodes n
        JOIN edges e ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
          AND n.archived = FALSE AND n.lab_status IS NULL
        LIMIT 5
    `, [node.id]);

    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedNodeContent = await resolveContent(node.content);
    const resolvedParents = await Promise.all(
        parents.map((p: any) => resolveContent(p.content))
    );

    const parentContext = resolvedParents.length > 0
        ? `\nPARENT NODES (what this was synthesized from):\n${resolvedParents.map((content: string, i: number) => `${i + 1}. ${buildProvenanceTag(parents[i])} "${content}"`).join('\n')}`
        : '';

    const prompt = await getPrompt('core.autorating', {
        nodeContent: resolvedNodeContent,
        nodeType: node.node_type,
        nodeDomain: node.domain || 'unknown',
        parentContext,
        projectContext: projectContext ? projectContext + '\n\n' : '',
        provenanceTag: buildProvenanceTag(node),
    });

    const jsonSchema = {
        name: 'autorating',
        schema: {
            type: 'object',
            properties: {
                rating: { type: 'number', enum: [1, 0, -1] },
                reason: { type: 'string' },
            },
            required: ['rating', 'reason'],
            additionalProperties: false,
        },
    };

    const response = await callSubsystemModel('autorating', prompt, { jsonSchema });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error(`[autorating] Failed to parse LLM response for node ${node.id.slice(0, 8)}`);
        return false;
    }

    let result: { rating: number; reason: string };
    try {
        result = JSON.parse(jsonMatch[0]);
    } catch {
        console.error(`[autorating] Invalid JSON for node ${node.id.slice(0, 8)}: ${jsonMatch[0].slice(0, 100)}`);
        return false;
    }

    if (![1, 0, -1].includes(result.rating)) {
        console.error(`[autorating] Invalid rating ${result.rating} for node ${node.id.slice(0, 8)}`);
        return false;
    }

    await handleRate({
        nodeId: node.id,
        rating: result.rating,
        source: 'auto',
        contributor: 'autorating-cycle',
        note: result.reason,
        context: JSON.stringify({ synthesisCycleId: 'autorating' }),
    });

    const ratingLabel = result.rating === 1 ? 'useful' : result.rating === 0 ? 'not useful' : 'harmful';

    // Archive nodes rated as not useful or harmful — no meh nodes in the graph
    if (result.rating <= 0) {
        await query('UPDATE nodes SET archived = TRUE WHERE id = $1', [node.id]);
    }

    console.error(`[autorating] Rated node ${node.id.slice(0, 8)} (${node.node_type}/${node.domain}) as ${ratingLabel}${result.rating <= 0 ? ' → archived' : ''}: ${result.reason}`);
    emitActivity('cycle', 'autorating_rated', `Autorated ${nodeLabel(node.id, node.content)} as ${ratingLabel}`, { nodeId: node.id, nodeType: node.node_type, domain: node.domain, rating: result.rating, ratingLabel, reason: result.reason });

    await queryOne(`
        INSERT INTO dream_cycles (
            node_a_id, resonance_score, threshold_used,
            created_child, parameters, completed_at, domain
        ) VALUES ($1, $2, $3, $4, $5, datetime('now'), $6)
    `, [
        node.id, result.rating, 0, false,
        JSON.stringify({ cycle_type: 'autorating', rating: result.rating, reason: result.reason, nodeType: node.node_type }),
        node.domain,
    ]);

    return true;
}

/**
 * Run one autorating batch of up to `batchSize` unrated nodes.
 *
 * Nodes must have been created at least `gracePeriodMinutes` ago to be eligible
 * (prevents rating nodes that are still mid-synthesis). Processes nodes
 * sequentially with event-loop yields between each to avoid starving the GUI.
 *
 * @returns The number of nodes successfully rated (0 = backlog empty)
 */
async function runAutoratingBatch(): Promise<number> {
    const cfg = appConfig.autonomousCycles.autorating;

    const batchSize = cfg.batchSize ?? 10;
    const candidates = await query(`
        SELECT n.id, n.content, n.node_type, n.domain, n.weight, n.created_at,
               n.generation, n.contributor, n.origin, n.verification_status, n.verification_score
        FROM nodes n
        WHERE n.archived = FALSE
          AND n.lab_status IS NULL
          AND n.feedback_rating IS NULL
          AND n.node_type NOT IN ('raw')
          AND COALESCE(n.synthesizable, 1) != 0
          AND n.created_at < datetime('now', '-' || $1 || ' minutes')
        ORDER BY n.created_at ASC
        LIMIT $2
    `, [cfg.gracePeriodMinutes, batchSize]);

    if (candidates.length === 0) return 0;

    const projectContext = await getProjectContextBlock() || '';

    // Process nodes sequentially to avoid write storms that starve the GUI event loop.
    // LLM calls within autorateOneNode are async I/O — event loop is free during network wait.
    // The DB writes that follow are what we're serializing.
    let succeeded = 0;
    let failed = 0;
    for (const node of candidates) {
        try {
            const result = await autorateOneNode(node, projectContext);
            if (result) succeeded++;
            else failed++;
        } catch {
            failed++;
        }
        // Yield between nodes so Express can serve GUI requests
        await yieldToEventLoop();
    }
    if (candidates.length > 0) {
        console.error(`[autorating] Batch complete: ${succeeded} rated, ${failed} failed out of ${candidates.length}`);
    }

    return succeeded;
}

/** Single autorating batch run for MCP/single-cycle trigger; delegates to runAutoratingBatch. */
async function runAutoratingCycleSingle(): Promise<void> {
    await runAutoratingBatch();
}

export { autorateOneNode, runAutoratingBatch, runAutoratingCycleSingle };
