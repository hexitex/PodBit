/**
 * @module core/validation
 *
 * Breakthrough validation and generativity boosting.
 *
 * Validates whether voiced/synthesized nodes represent genuine breakthroughs
 * by scoring them along multiple dimensions (synthesis quality, novelty,
 * testability, tension resolution). Includes a novelty gate using a frontier
 * model for skeptical verification, and a generativity feedback mechanism
 * that boosts ancestor weights when a descendant achieves breakthrough status.
 */

import { query, queryOne } from '../db.js';
import { callSubsystemModel } from '../models.js';
import { getPrompt } from '../prompts.js';
import { config, appConfig } from './engine-config.js';
import { canOverride, logDecision } from './governance.js';
import { registerBreakthrough } from '../handlers/breakthrough-registry.js';
import { resolveContent } from './number-variables.js';
import { buildProvenanceTag, PROVENANCE_GUIDE_VALIDATION } from './provenance.js';
import type { ResonanceNode, ValidationResult } from './types.js';

/**
 * Validate whether a node represents a genuine breakthrough.
 *
 * Uses the `voice` subsystem (capable LLM) to score the node along four
 * dimensions: synthesis quality, novelty, testability, and tension resolution.
 * Computes a weighted composite score and applies configurable breakthrough
 * thresholds to determine if the node qualifies.
 *
 * Number variable placeholders are resolved before sending content to the LLM.
 *
 * @param node - The candidate node to validate for breakthrough status
 * @param sourceNodes - Parent/source nodes used to build provenance context for the LLM
 * @returns Validation result containing per-dimension scores, composite score,
 *          breakthrough determination, and summary reasoning. On error, returns
 *          `{ error, is_breakthrough: false }`.
 */
async function validateBreakthrough(node: ResonanceNode, sourceNodes: ResonanceNode[] = []): Promise<ValidationResult> {
    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedNodeContent = await resolveContent(node.content);
    const resolvedSources = await Promise.all(
        sourceNodes.map(s => resolveContent(s.content))
    );

    // Build context from source nodes with provenance tags
    const sourceContext = resolvedSources.length > 0
        ? `\nSOURCE MATERIAL:\n${resolvedSources.map((content: string, i: number) => `${i + 1}. ${buildProvenanceTag(sourceNodes[i])} ${content}`).join('\n')}`
        : '';

    const prompt = await getPrompt('core.breakthrough_validation', {
        nodeContent: resolvedNodeContent,
        sourceContext,
        provenanceGuide: PROVENANCE_GUIDE_VALIDATION,
    });

    // Provider-agnostic structured output hint
    const validationJsonSchema = {
        name: "breakthrough_validation",
        schema: {
            type: "object",
            properties: {
                synthesis: {
                    type: "object",
                    properties: {
                        score: { type: "number" },
                        reason: { type: "string" }
                    },
                    required: ["score", "reason"],
                    additionalProperties: false
                },
                novelty: {
                    type: "object",
                    properties: {
                        score: { type: "number" },
                        reason: { type: "string" }
                    },
                    required: ["score", "reason"],
                    additionalProperties: false
                },
                testability: {
                    type: "object",
                    properties: {
                        score: { type: "number" },
                        reason: { type: "string" }
                    },
                    required: ["score", "reason"],
                    additionalProperties: false
                },
                tension_resolution: {
                    type: "object",
                    properties: {
                        score: { type: "number" },
                        reason: { type: "string" }
                    },
                    required: ["score", "reason"],
                    additionalProperties: false
                },
                is_breakthrough: { type: "boolean" },
                summary: { type: "string" }
            },
            required: ["synthesis", "novelty", "testability", "tension_resolution", "is_breakthrough", "summary"],
            additionalProperties: false
        }
    };

    try {
        const response = await callSubsystemModel('voice', prompt, { jsonSchema: validationJsonSchema });

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return {
                error: 'Failed to parse validation response',
                raw: response,
                is_breakthrough: false
            };
        }

        const result = JSON.parse(jsonMatch[0]);

        // Calculate composite score
        const scores = {
            synthesis: result.synthesis?.score ?? 0,
            novelty: result.novelty?.score ?? 0,
            testability: result.testability?.score ?? 0,
            tension_resolution: result.tension_resolution?.score ?? 0,
        };

        // Weighted composite (novelty and synthesis matter most)
        const cw = appConfig.validation.compositeWeights;
        const composite = (
            scores.synthesis * cw.synthesis +
            scores.novelty * cw.novelty +
            scores.testability * cw.testability +
            scores.tension_resolution * cw.tensionResolution
        );

        // Determine if it's a genuine breakthrough
        const bt = appConfig.validation.breakthroughThresholds;
        const isBreakthrough =
            scores.synthesis >= bt.minSynthesis &&
            scores.novelty >= bt.minNovelty &&
            (scores.testability >= bt.minTestability || scores.tension_resolution >= bt.minTensionResolution);

        return {
            ...result,
            scores,
            composite: Math.round(composite * 10) / 10,
            is_breakthrough: isBreakthrough,
            validated_at: new Date().toISOString(),
        };

    } catch (err: any) {
        return {
            error: err.message,
            is_breakthrough: false,
        };
    }
}

/**
 * Mark a node as a validated breakthrough (or not) in the database.
 *
 * Updates the node's type and weight, logs the governance decision, triggers
 * generativity boosts for ancestors on promotion, records the validation in
 * `dream_cycles` for audit, and registers the breakthrough in the shared
 * breakthrough registry.
 *
 * Respects the tier hierarchy — the update is blocked if the calling tier
 * lacks permission to override the node's current type.
 *
 * @param nodeId - UUID of the node to mark
 * @param validationResult - Result from {@link validateBreakthrough} containing scores and determination
 * @param decidedByTier - The governance tier making the decision (defaults to `'system'`)
 * @returns Object with `nodeId`, `is_breakthrough`, `new_type`, and `new_weight`,
 *          or `{ nodeId, blocked: true, reason }` if the tier lacks override permission
 */
async function markBreakthrough(nodeId: string, validationResult: ValidationResult, decidedByTier: string | null = null) {
    const tier = decidedByTier || 'system';

    // Check tier hierarchy: can this tier override the node's current type?
    const override = await canOverride('node', nodeId, 'node_type', tier);
    if (!override.allowed) {
        console.warn(`[tier] Blocked: ${tier} cannot override node_type on ${nodeId}: ${override.reason}`);
        return { nodeId, blocked: true, reason: override.reason };
    }

    // Update node type to 'breakthrough' if validated, store validation in notes
    const newType = validationResult.is_breakthrough ? 'breakthrough' : 'voiced';
    const newWeight = validationResult.is_breakthrough
        ? config.nodes.breakthroughWeight
        : config.nodes.defaultWeight;

    await query(`
        UPDATE nodes
        SET node_type = $2,
            weight = GREATEST(weight, $3)
        WHERE id = $1
    `, [nodeId, newType, newWeight]);

    // Log the promotion decision
    await logDecision('node', nodeId, 'node_type', null, newType, tier, 'validation', `Breakthrough validation: composite=${validationResult.composite}, is_breakthrough=${validationResult.is_breakthrough}`);

    // Generativity boost: reward ancestors if this became a breakthrough
    if (validationResult.is_breakthrough) {
        await boostGenerativeAncestors(nodeId);
    }

    // Log the validation in dream_cycles for audit trail
    await queryOne(`
        INSERT INTO dream_cycles (
            node_a_id, resonance_score, threshold_used,
            created_child, child_node_id, parameters, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [
        nodeId,
        validationResult.composite || 0,
        6.0, // Threshold for breakthrough
        validationResult.is_breakthrough,
        validationResult.is_breakthrough ? nodeId : null,
        JSON.stringify({
            validation_type: 'breakthrough',
            ...validationResult
        }),
    ]);

    // Register in shared breakthrough registry if validated (non-fatal)
    if (validationResult.is_breakthrough) {
        try {
            const node = await queryOne(`SELECT content, domain, trajectory FROM nodes WHERE id = $1`, [nodeId]);
            const parentNodes = await query(`
                SELECT n.content FROM nodes n
                JOIN edges e ON n.id = e.source_id
                WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source')
                  AND n.archived = FALSE
            `, [nodeId]);

            await registerBreakthrough({
                nodeId,
                content: node?.content || '',
                domain: node?.domain,
                trajectory: node?.trajectory,
                scores: validationResult.scores ? {
                    synthesis: validationResult.scores.synthesis,
                    novelty: validationResult.scores.novelty,
                    testability: validationResult.scores.testability,
                    tension_resolution: validationResult.scores.tension_resolution,
                    composite: validationResult.composite,
                } : undefined,
                validationReason: validationResult.summary || `Autonomous validation: composite=${validationResult.composite}`,
                promotedBy: 'synthesis-engine',
                promotionSource: 'autonomous',
                parentContents: parentNodes.map((p: any) => p.content),
            });
        } catch (err: any) {
            console.error(`[breakthrough-registry] Failed to register autonomous breakthrough: ${err.message}`);
        }
    }

    return {
        nodeId,
        is_breakthrough: validationResult.is_breakthrough,
        new_type: newType,
        new_weight: newWeight,
    };
}

/**
 * Generativity boost: when a node becomes a breakthrough,
 * boost its ancestor weights as a feedback signal.
 *
 * Walks two levels of the `parent`/`tension_source` edge graph. Each ancestor
 * receives a weight increase capped by `engine.weightCeiling`. Already-boosted
 * ancestors (tracked via a `Set`) are skipped to avoid double-boosting when
 * the DAG converges.
 *
 * Boost magnitudes are read from `validation.generativityBoost.parent` and
 * `validation.generativityBoost.grandparent` in config.
 *
 * @param nodeId - UUID of the newly promoted breakthrough node
 */
async function boostGenerativeAncestors(nodeId: string) {
    const PARENT_BOOST = appConfig.validation.generativityBoost.parent;
    const GRANDPARENT_BOOST = appConfig.validation.generativityBoost.grandparent;
    const boosted = new Set();

    // Get direct parents
    const parents = await query(`
        SELECT DISTINCT e.source_id, n.weight
        FROM edges e JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source') AND n.archived = FALSE
    `, [nodeId]);

    const ceiling = appConfig.engine.weightCeiling ?? 3.0;

    for (const parent of parents) {
        const cappedWeight = Math.min(ceiling, parent.weight + PARENT_BOOST);
        await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [cappedWeight, parent.source_id]);
        await logDecision('node', parent.source_id, 'weight', String(parent.weight), String(cappedWeight), 'system', 'synthesis-engine', `Generativity boost: child ${nodeId.slice(0, 8)} became breakthrough`);
        boosted.add(parent.source_id);

        // Grandparents
        const grandparents = await query(`
            SELECT DISTINCT e.source_id, n.weight
            FROM edges e JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id = $1 AND e.edge_type IN ('parent', 'tension_source') AND n.archived = FALSE
        `, [parent.source_id]);

        for (const gp of grandparents) {
            if (boosted.has(gp.source_id)) continue;
            const cappedGpWeight = Math.min(ceiling, gp.weight + GRANDPARENT_BOOST);
            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [cappedGpWeight, gp.source_id]);
            await logDecision('node', gp.source_id, 'weight', String(gp.weight), String(cappedGpWeight), 'system', 'synthesis-engine', `Generativity boost (grandparent): descendant ${nodeId.slice(0, 8)} became breakthrough`);
            boosted.add(gp.source_id);
        }
    }

    if (boosted.size > 0) {
        console.error(`[generativity] Boosted ${boosted.size} ancestors of breakthrough ${nodeId.slice(0, 8)}`);
    }
}

/**
 * Get parent/source nodes for a given node.
 *
 * Retrieves all non-archived nodes linked to `nodeId` via `parent` or
 * `tension_source` edges (where the linked node is the edge source).
 *
 * @param nodeId - UUID of the node whose parents to retrieve
 * @returns Array of full node rows from the `nodes` table
 */
async function getSourceNodes(nodeId: string) {
    return query(`
        SELECT n.*
        FROM nodes n
        JOIN edges e ON e.source_id = n.id
        WHERE e.target_id = $1
          AND e.edge_type IN ('parent', 'tension_source')
          AND n.archived = FALSE
    `, [nodeId]);
}

// =============================================================================
// NOVELTY GATE — Frontier model skeptical check
// =============================================================================

interface NoveltyGateResult {
    novel: boolean;
    confidence: number;
    reasoning: string;
    skipped?: boolean;
    skipReason?: string;
}

/**
 * Run the novelty gate on a candidate node.
 *
 * Uses the `breakthrough_check` subsystem (frontier model) to skeptically
 * evaluate whether a node's claims are genuinely novel rather than restating
 * well-known ideas. Fail-open design: if the subsystem is unassigned, LLM
 * response cannot be parsed, or the call errors, the gate passes with
 * `{ novel: true, skipped: true }` so synthesis is not blocked.
 *
 * @param node - The candidate node to check for novelty
 * @param sourceNodes - Parent/source nodes providing provenance context
 * @returns Novelty verdict with `novel` flag, `confidence` (0-1), `reasoning`,
 *          and optional `skipped`/`skipReason` when the gate could not run
 */
async function runNoveltyGate(
    node: ResonanceNode,
    sourceNodes: ResonanceNode[] = []
): Promise<NoveltyGateResult> {
    // Dynamically import to check assignment without circular deps
    const { getAssignedModel } = await import('../models/assignments.js');
    const assigned = getAssignedModel('breakthrough_check' as any);
    if (!assigned) {
        console.warn('[validation] breakthrough_check subsystem unassigned — skipping novelty gate');
        return { novel: true, confidence: 0, reasoning: 'Gate skipped: no model assigned', skipped: true, skipReason: 'unassigned' };
    }

    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedGateContent = await resolveContent(node.content);
    const resolvedGateSources = await Promise.all(
        sourceNodes.map(s => resolveContent(s.content))
    );

    const sourceContext = resolvedGateSources.length > 0
        ? `\nSOURCE MATERIAL:\n${resolvedGateSources.map((content: string, i: number) => `${i + 1}. ${buildProvenanceTag(sourceNodes[i])} ${content}`).join('\n')}`
        : '';

    const prompt = await getPrompt('core.novelty_gate', {
        nodeContent: resolvedGateContent,
        sourceContext,
        domain: node.domain || 'general',
        provenanceGuide: PROVENANCE_GUIDE_VALIDATION,
    });

    const jsonSchema = {
        name: 'novelty_gate',
        schema: {
            type: 'object',
            properties: {
                novel: { type: 'boolean' },
                confidence: { type: 'number' },
                reasoning: { type: 'string' },
            },
            required: ['novel', 'confidence', 'reasoning'],
            additionalProperties: false,
        },
    };

    try {
        const response = await callSubsystemModel('breakthrough_check' as any, prompt, { jsonSchema });

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[validation] Novelty gate: failed to parse JSON, fail-open');
            return { novel: true, confidence: 0, reasoning: 'Parse failure (fail-open)', skipped: true, skipReason: 'parse_error' };
        }

        const result = JSON.parse(jsonMatch[0]);
        return {
            novel: !!result.novel,
            confidence: result.confidence ?? 0,
            reasoning: result.reasoning || '',
        };
    } catch (err: any) {
        console.warn(`[validation] Novelty gate error (fail-open): ${err.message}`);
        return { novel: true, confidence: 0, reasoning: `Error (fail-open): ${err.message}`, skipped: true, skipReason: 'error' };
    }
}

export { validateBreakthrough, markBreakthrough, boostGenerativeAncestors, getSourceNodes, runNoveltyGate };
export type { NoveltyGateResult };
