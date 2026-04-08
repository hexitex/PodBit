/**
 * Synthesis engine — the core of Podbit's knowledge graph evolution.
 *
 * Implements three synthesis paths that generate new knowledge from existing nodes:
 *
 * 1. **Pairwise synthesis** — samples two nodes (weighted by salience), measures
 *    resonance (cosine similarity), and if above threshold, sends them to the
 *    voice subsystem LLM to produce a child insight. This is the default path.
 *
 * 2. **Cluster synthesis** — groups 3+ semantically related nodes via
 *    `findClusters()`, then calls `voiceMulti()` to synthesize across the
 *    entire cluster. Produces higher-generation insights from broader context.
 *
 * 3. **Domain-directed synthesis** — uses `selectDomainPair()` to intentionally
 *    pair nodes from two different (but bridged) domains, encouraging cross-domain
 *    insights rather than intra-domain refinement.
 *
 * All three paths share the same quality pipeline: structural validation,
 * specificity gate, dedup gate, junk filter, trajectory classification, and
 * fitness scoring. The `runComprehensiveConsultant()` function is exported
 * for use by external population-control cycles.
 */

import { query, queryOne } from '../db.js';
import { config } from './engine-config.js';
import { config as appConfig } from '../config.js';
import { measureSpecificity } from './specificity.js';
import { scoreResonance, cosineSimilarity, parseEmbedding, detectHallucination, checkDomainDrift } from './scoring.js';
import { voice, voiceMulti } from './voicing.js';
import { sampleNodes, createNode, createEdge, updateNodeSalience, decayAll } from './node-ops.js';
import { getEmbedding, hasConsultant, callSubsystemModel, callConsultantModel, getAssignedModel } from '../models.js';
import { getPrompt } from '../prompts.js';
import { getProjectContextBlock } from './project-context.js';
import { findNeighbors, setCached } from '../vector/embedding-cache.js';
import { getAccessibleDomains, getExcludedDomainsForCycle } from './governance.js';
import { findClusters } from './cluster-selection.js';
import type { ResonanceNode, SynthesisCycleLogData, SynthesisEngineOptions, Discovery, CycleType } from './types.js';
import { emitActivity } from '../services/event-bus.js';
import { recordBirth, incrementBarren, lifecycleSweep } from './lifecycle.js';
import { resolveContent } from './number-variables.js';

// Sub-modules (extracted from this file)
import {
    getSystemDomains, isSystemDomain,
    selectDomainWithNiching, selectDomainPair, sampleColdNode,
    getPartitionForDomain, getPartitionTopNodes,
} from './synthesis-engine-domain.js';
import {
    abortableSleep, cycleStates,
    getCycleStatus, getAllCycleStatuses, runCycleLoop,
} from './synthesis-engine-state.js';

/**
 * Get model provenance for the voice subsystem (used to tag synthesis nodes).
 *
 * @returns An object with `modelId` and `modelName` from the currently assigned voice model,
 *          or `null` values if no model is assigned.
 */
function getVoiceModelProvenance(): { modelId: string | null; modelName: string | null } {
    const assigned = getAssignedModel('voice' as any);
    return { modelId: assigned?.id ?? null, modelName: assigned?.name ?? null };
}

// =============================================================================
// TRAJECTORY & WEIGHT COMPUTATION — shared across all synthesis cycle types
// =============================================================================

/**
 * Classify trajectory and compute initial child weight.
 *
 * A child is classified as `'knowledge'` if its specificity is at least
 * `specificityRatio` (default 0.9) of the average parent specificity;
 * otherwise `'abstraction'`. The fitness modifier (dissimilarity, novelty,
 * specificity enrichment) is applied only in heuristic pipeline mode.
 *
 * @param params - Computation inputs.
 * @param params.childSpecificity - Specificity score of the synthesised output.
 * @param params.avgParentSpecificity - Mean specificity of parent nodes.
 * @param params.resonance - Cosine similarity between parents (used for fitness dissimilarity score).
 * @param params.dupBestSimilarity - Best duplicate similarity from dedup check (used for fitness novelty score).
 * @param params.withFitness - Whether to apply the fitness modifier (default `false`).
 * @param params.fitnessLabel - Label for fitness logging (default `'Fitness'`).
 * @returns `{ trajectory, childWeight, fitnessScore? }`.
 */
function computeTrajectoryAndWeight(params: {
    childSpecificity: number;
    avgParentSpecificity: number;
    resonance?: number;
    dupBestSimilarity?: number;
    withFitness?: boolean;
    fitnessLabel?: string;
}): { trajectory: 'knowledge' | 'abstraction'; childWeight: number; fitnessScore?: number } {
    const {
        childSpecificity, avgParentSpecificity,
        resonance = 0, dupBestSimilarity = 0,
        withFitness = false, fitnessLabel = 'Fitness',
    } = params;

    const specificityRatio = appConfig.engine.specificityRatio ?? 0.9;
    const trajectory: 'knowledge' | 'abstraction' = childSpecificity >= (avgParentSpecificity * specificityRatio) ? 'knowledge' : 'abstraction';
    let childWeight = trajectory === 'knowledge'
        ? (appConfig.engine.knowledgeWeight ?? 1.0)
        : (appConfig.engine.abstractionWeight ?? 0.1);

    let fitnessScore: number | undefined;
    if (withFitness && appConfig.engine.fitnessEnabled) {
        const fw = appConfig.engine.fitnessWeights;
        const fr = appConfig.engine.fitnessRange;
        const ceiling = appConfig.synthesisEngine.similarityCeiling ?? 0.92;
        const threshold = config.resonanceThreshold;

        const dissimilarityScore = Math.max(0, Math.min(1,
            1 - ((resonance - threshold) / (ceiling - threshold))
        ));
        const noveltyScore = 1 - dupBestSimilarity;
        const specificityEnrichment = Math.min(1,
            Math.max(0, (childSpecificity / Math.max(avgParentSpecificity, 1))) / 2
        );

        const composite = (fw.dissimilarity * dissimilarityScore)
            + (fw.novelty * noveltyScore)
            + (fw.specificity * specificityEnrichment);

        fitnessScore = fr.min + (composite * (fr.max - fr.min));
        childWeight = childWeight * fitnessScore;
        console.error(`  ${fitnessLabel}: dissim=${dissimilarityScore.toFixed(2)} novel=${noveltyScore.toFixed(2)} spec=${specificityEnrichment.toFixed(2)} → ${fitnessScore.toFixed(3)} (weight: ${childWeight.toFixed(3)})`);
    }

    return { trajectory, childWeight, fitnessScore };
}

// =============================================================================
// COMPREHENSIVE CONSULTANT — single-pass quality judgment for consultant mode
// =============================================================================

/** Result from {@link runComprehensiveConsultant} -- single-pass quality judgment. */
export interface ComprehensiveConsultantResult {
    /** Whether the composite score meets the configured threshold. */
    accept: boolean;
    /** Weighted composite score (0-10). */
    composite: number;
    /** Per-dimension scores: coherence, grounding, novelty, derivation, forcedAnalogy, incrementalValue (each 0-10). */
    scores: Record<string, number>;
    /** Free-text reasoning from the LLM (truncated to 500 chars). */
    reasoning: string;
}

const DEFAULT_CONSULTANT_WEIGHTS = { coherence: 0.20, grounding: 0.15, novelty: 0.20, derivation: 0.15, forcedAnalogy: 0.10, incrementalValue: 0.20 };

/**
 * Build a graph-context section for the consultant prompt by finding the
 * top-N most semantically similar existing nodes in the graph. This lets
 * the consultant judge whether the synthesis adds incremental value beyond
 * what the graph already contains — the single biggest source of junk that
 * downstream gates (redundancy ceiling, dedup) currently catch after the
 * consultant has already approved.
 */
async function buildGraphContext(voicedContent: string, parentIds: string[]): Promise<string> {
    try {
        const topN = appConfig.consultantPipeline?.graphContextTopN ?? 5;
        if (topN <= 0) return '';

        const embedding = await getEmbedding(voicedContent);
        if (!embedding) return '';

        // Fetch active non-raw nodes with embeddings
        const existing = await query(
            `SELECT id, content, domain, embedding_bin, embedding FROM nodes
             WHERE archived = FALSE AND lab_status IS NULL AND node_type NOT IN ('raw', 'question')
             ORDER BY weight DESC
             LIMIT 200`,
        );

        // Score by cosine similarity, exclude the parents themselves
        const parentSet = new Set(parentIds);
        const scored: { content: string; domain: string; similarity: number }[] = [];
        for (const node of existing) {
            if (parentSet.has(node.id)) continue;
            const nodeEmb = node.embedding_bin
                ? parseEmbedding(node.embedding_bin)
                : (node.embedding ? parseEmbedding(node.embedding) : null);
            if (!nodeEmb) continue;
            const sim = cosineSimilarity(embedding, nodeEmb);
            scored.push({ content: node.content, domain: node.domain, similarity: sim });
        }

        scored.sort((a, b) => b.similarity - a.similarity);
        const topResults = scored.slice(0, topN);

        if (topResults.length === 0) return '';

        const lines = topResults.map((n, i) =>
            `${i + 1}. [domain: ${n.domain}, similarity: ${n.similarity.toFixed(3)}] ${n.content.slice(0, 300)}`,
        );
        return `## Existing Similar Nodes in Graph\nThe following nodes already exist in the knowledge graph and are semantically similar to the synthesis output. Use these to judge whether the synthesis adds genuinely NEW knowledge.\n${lines.join('\n')}`;
    } catch (err) {
        // Fail-open — if graph context retrieval fails, consultant proceeds without it
        console.error('  buildGraphContext failed:', (err as Error).message);
        return '';
    }
}

/**
 * Run the comprehensive consultant: a single LLM call that replaces
 * claim provenance, counterfactual independence, and fitness grading.
 *
 * Evaluates coherence (25%), grounding (20%), novelty (15%), specificity (15%),
 * forced-analogy (10%), and incremental value (15%) in one pass.
 * Used by the population control cycle for post-birth quality evaluation.
 *
 * @param voicedContent - The synthesised text to evaluate.
 * @param parentNodes - Array of parent nodes (at least 2); content and domain are sent to the LLM.
 * @param _domain - Optional constraint domain (currently unused in the prompt but reserved).
 * @returns A {@link ComprehensiveConsultantResult} with per-dimension scores, composite, accept/reject, and reasoning.
 */
async function runComprehensiveConsultant(
    voicedContent: string,
    parentNodes: { id?: string; content: string; domain?: string | null }[],
    _domain?: string | null,
): Promise<ComprehensiveConsultantResult> {
    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedOutput = await resolveContent(voicedContent);
    const resolvedA = await resolveContent(parentNodes[0]?.content || '');
    const resolvedB = await resolveContent(parentNodes[1]?.content || '');

    const projectContext = await getProjectContextBlock() || '';

    // Fetch existing similar nodes from the graph so the consultant can judge
    // incremental value — does this synthesis add anything the graph doesn't
    // already know? This prevents the consultant from approving well-formed
    // but redundant syntheses that downstream gates would catch anyway.
    const parentIds = parentNodes.map(n => n.id).filter(Boolean);
    const graphContext = await buildGraphContext(voicedContent, parentIds as string[]);

    const prompt = await getPrompt('quality.comprehensive_consultant', {
        synthesisOutput: resolvedOutput,
        parentA: resolvedA,
        parentB: resolvedB,
        domainA: parentNodes[0]?.domain || 'unknown',
        domainB: parentNodes[1]?.domain || 'unknown',
        projectContext,
        graphContext,
    });

    const raw = await callSubsystemModel('population_control', prompt, {
        jsonSchema: {
            name: 'comprehensive_consultant',
            schema: {
                type: 'object',
                properties: {
                    scores: {
                        type: 'object',
                        properties: {
                            coherence: { type: 'number' },
                            grounding: { type: 'number' },
                            novelty: { type: 'number' },
                            derivation: { type: 'number' },
                            forcedAnalogy: { type: 'number' },
                            incrementalValue: { type: 'number' },
                        },
                        required: ['coherence', 'grounding', 'novelty', 'derivation', 'forcedAnalogy', 'incrementalValue'],
                    },
                    composite: { type: 'number' },
                    accept: { type: 'boolean' },
                    reasoning: { type: 'string' },
                },
                required: ['scores', 'composite', 'accept', 'reasoning'],
            },
        },
    });

    // Sanitize control characters that some models emit inside JSON string values
    const jsonText = (raw.match(/\{[\s\S]*\}/)?.[0] || raw)
        .replace(/[\x00-\x1f\x7f]/g, (ch: string) => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '');
    const parsed = JSON.parse(jsonText);
    const scores: Record<string, number> = {
        coherence: Math.max(0, Math.min(10, Number(parsed.scores?.coherence) || 0)),
        grounding: Math.max(0, Math.min(10, Number(parsed.scores?.grounding) || 0)),
        novelty: Math.max(0, Math.min(10, Number(parsed.scores?.novelty) || 0)),
        derivation: Math.max(0, Math.min(10, Number(parsed.scores?.derivation) || 0)),
        forcedAnalogy: Math.max(0, Math.min(10, Number(parsed.scores?.forcedAnalogy) || 0)),
        incrementalValue: Math.max(0, Math.min(10, Number(parsed.scores?.incrementalValue) || 0)),
    };
    // Recompute composite from dimension scores using configurable weights —
    // LLMs exhibit completion bias and inflate self-reported composites
    // even when individual dimension scores are low.
    const w = appConfig.consultantPipeline?.weights ?? DEFAULT_CONSULTANT_WEIGHTS;
    const composite = Math.max(0, Math.min(10,
        scores.coherence * (w.coherence ?? 0.25) +
        scores.grounding * (w.grounding ?? 0.20) +
        scores.novelty * (w.novelty ?? 0.15) +
        scores.derivation * (w.derivation ?? 0.15) +
        scores.forcedAnalogy * (w.forcedAnalogy ?? 0.10) +
        scores.incrementalValue * (w.incrementalValue ?? 0.15),
    ));
    const threshold = config.consultantPipeline?.threshold ?? 6;

    return {
        accept: composite >= threshold,
        composite,
        scores,
        reasoning: String(parsed.reasoning || '').slice(0, 500),
    };
}

// =============================================================================
// MINITRUTH — LLM reviewer for the birth pipeline
// =============================================================================

/** Result from {@link runMinitruth} -- accept/rework/reject judgment. */
export interface MinitruthResult {
    /** The verdict: accept the synthesis, rework it with feedback, or reject outright. */
    verdict: 'accept' | 'rework' | 'reject';
    /** Quality score (0-10). */
    score: number;
    /** Actionable feedback for rework (null/undefined for accept/reject). */
    feedback?: string;
    /** Brief explanation of the verdict. */
    reasoning: string;
}

/**
 * Run minitruth: a manifest-armed LLM reviewer that decides whether a voiced
 * synthesis deserves to enter the knowledge graph.
 *
 * Returns accept (proceed to createNode), rework (re-voice with feedback),
 * or reject (discard entirely).
 *
 * @param voicedContent - The synthesised text to evaluate.
 * @param parentNodes - Array of parent nodes; content and domain are sent to the LLM.
 * @param domain - Domain context (used for logging, not sent directly).
 * @param priorAttempt - Previous voiced content if this is a rework attempt.
 * @param priorFeedback - Feedback from the prior attempt.
 * @returns A {@link MinitruthResult}.
 */
async function runMinitruth(
    voicedContent: string,
    parentNodes: { id?: string; content: string; domain?: string | null }[],
    domain?: string | null,
    priorAttempt?: string,
    priorFeedback?: string,
): Promise<MinitruthResult> {
    const resolvedOutput = await resolveContent(voicedContent);
    const resolvedA = await resolveContent(parentNodes[0]?.content || '');
    const resolvedB = await resolveContent(parentNodes[1]?.content || '');

    const projectContext = await getProjectContextBlock() || '';

    // Build rework context block if this is a retry
    let priorAttemptBlock = '';
    let priorFeedbackBlock = '';
    if (priorAttempt) {
        priorAttemptBlock = `## Prior Attempt (rejected for rework)\n${priorAttempt}`;
    }
    if (priorFeedback) {
        priorFeedbackBlock = `## Reviewer Feedback on Prior Attempt\n${priorFeedback}`;
    }

    const prompt = await getPrompt('quality.minitruth', {
        synthesisOutput: resolvedOutput,
        parentA: resolvedA,
        parentB: resolvedB,
        domainA: parentNodes[0]?.domain || 'unknown',
        domainB: parentNodes[1]?.domain || 'unknown',
        projectContext,
        priorAttempt: priorAttemptBlock,
        priorFeedback: priorFeedbackBlock,
    });

    const raw = await callConsultantModel('voice', prompt, {
        jsonSchema: {
            name: 'minitruth',
            schema: {
                type: 'object',
                properties: {
                    verdict: { type: 'string', enum: ['accept', 'rework', 'reject'] },
                    score: { type: 'number' },
                    feedback: { type: ['string', 'null'] },
                    reasoning: { type: 'string' },
                },
                required: ['verdict', 'score', 'reasoning'],
            },
        },
    });

    const jsonText = (raw.match(/\{[\s\S]*\}/)?.[0] || raw)
        .replace(/[\x00-\x1f\x7f]/g, (ch: string) => ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '');
    const parsed = JSON.parse(jsonText);

    const verdict = ['accept', 'rework', 'reject'].includes(parsed.verdict) ? parsed.verdict : 'reject';
    const score = Math.max(0, Math.min(10, Number(parsed.score) || 0));

    return {
        verdict,
        score,
        feedback: parsed.feedback || undefined,
        reasoning: String(parsed.reasoning || '').slice(0, 500),
    };
}

// =============================================================================
// SYNTHESIS PAIR VALIDATION
// =============================================================================

/**
 * Validate that a synthesis pair represents a meaningful connection,
 * not just superficial lexical overlap.
 *
 * Applies four checks:
 * 1. Anti-tautology: reject if one node is a near-subset of the other.
 * 2. Similarity ceiling: reject near-duplicates.
 * 3. Content diversity: both nodes must have minimum vocabulary.
 * 4. Combined specificity: at least one node must have substance.
 *
 * @param nodeA - First candidate node.
 * @param nodeB - Second candidate node.
 * @param resonance - Pre-computed cosine similarity between the two embeddings.
 * @returns `{ valid: true }` or `{ valid: false, reason: string }`.
 */
function validateSynthesisPair(nodeA: ResonanceNode, nodeB: ResonanceNode, resonance: number) {
    const wordsA = new Set(nodeA.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const wordsB = new Set(nodeB.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));

    // 1. Anti-tautology: reject if one is a near-subset of the other
    const overlapThreshold = appConfig.synthesisEngine.subsetOverlapThreshold;
    if (wordsA.size > 0 && wordsB.size > 0) {
        const overlapAB = [...wordsA].filter((w: string) => wordsB.has(w)).length;
        const subsetRatioA = overlapAB / wordsA.size;
        const subsetRatioB = overlapAB / wordsB.size;

        if (subsetRatioA > overlapThreshold || subsetRatioB > overlapThreshold) {
            return { valid: false, reason: `Near-tautology: ${Math.round(Math.max(subsetRatioA, subsetRatioB) * 100)}% word overlap` };
        }
    }

    // 2. Similarity ceiling: extremely high embedding similarity = near-duplicate
    if (resonance > appConfig.synthesisEngine.similarityCeiling) {
        return { valid: false, reason: `Similarity too high (${resonance.toFixed(3)}), likely near-duplicate` };
    }

    // 3. Content diversity: both nodes need minimum vocabulary
    const minVocab = appConfig.synthesisEngine.minVocabulary;
    if (wordsA.size < minVocab || wordsB.size < minVocab) {
        return { valid: false, reason: 'Insufficient vocabulary in one or both nodes' };
    }

    // 4. Average specificity: at least one node should have substance.
    // Uses average (not sum) so the threshold is in the same unit as individual
    // specificity scores — easier to reason about relative to measureSpecificity output.
    const specA = nodeA.specificity || 0;
    const specB = nodeB.specificity || 0;
    const avgSpec = (specA + specB) / 2;
    if (avgSpec < appConfig.synthesisEngine.minCombinedSpecificity) {
        return { valid: false, reason: `Average specificity too low (${avgSpec.toFixed(3)}). Both nodes are too generic.` };
    }

    return { valid: true };
}

// =============================================================================
// SYNTHESIS CYCLE LOGGING
// =============================================================================

/**
 * Write one synthesis cycle record to the `dream_cycles` table for audit and metrics.
 *
 * @param data - Cycle data including parent nodes, resonance score, threshold, outcome,
 *               and optional rejection reason, fitness score, and domain pair.
 * @returns The inserted row (with `id`) from `dream_cycles`.
 */
async function logSynthesisCycle(data: SynthesisCycleLogData & { rejectionReason?: string }) {
    return queryOne(`
        INSERT INTO dream_cycles (
            node_a_id, node_b_id, resonance_score, threshold_used,
            created_child, child_node_id, child_trajectory, parameters,
            rejection_reason, domain, parent_ids, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id
    `, [
        data.nodeA?.id ?? null,
        data.nodeB?.id ?? null,
        data.resonance,
        data.threshold,
        data.createdChild ? 1 : 0,
        data.childId ?? null,
        data.trajectory ?? null,
        JSON.stringify({ ...config, fitnessScore: data.fitnessScore, synthesisMode: data.synthesisMode, domainPair: data.domainPair }),
        data.rejectionReason ?? null,
        data.domain ?? data.nodeA?.domain ?? null,
        data.parentIds ? JSON.stringify(data.parentIds) : null,
    ]);
}

// =============================================================================
// DOMAIN-DIRECTED SYNTHESIS CYCLE
// =============================================================================

/**
 * Domain-directed synthesis cycle: top-down approach that targets underserved domain pairs.
 *
 * 1. Pick the most underserved bridged domain pair via {@link selectDomainPair}.
 * 2. Sample a cold (low-salience) node from each domain.
 * 3. Check resonance falls within the valid band.
 * 4. Run through the quality gate pipeline (voicing, specificity, dedup, junk filter).
 * 5. Create the child synthesis node and parent edges on success.
 *
 * @param constraintDomain - If provided, at least one domain in the selected pair must match.
 * @returns An object with `{ resonance, created, child?, nodeA, nodeB }`, or `null` if no valid pair/nodes found.
 */
async function domainDirectedCycle(constraintDomain: string | null = null): Promise<any> {
    const pair = await selectDomainPair(constraintDomain);
    if (!pair) {
        console.error('[podbit] Domain-directed: no valid domain pairs found');
        return null;
    }

    // Check if either domain is excluded from synthesis
    const synthExcluded = await getExcludedDomainsForCycle('synthesis');
    if (synthExcluded.has(pair.domainA) || synthExcluded.has(pair.domainB)) return null;

    console.error(`[podbit] Domain-directed: ${pair.domainA} <-> ${pair.domainB}`);

    const nodeA = await sampleColdNode(pair.domainA);
    const nodeB = await sampleColdNode(pair.domainB);

    if (!nodeA || !nodeB) {
        console.error(`[podbit] Domain-directed: insufficient cold nodes in pair`);
        return null;
    }

    // Compute similarity
    const embA = parseEmbedding(nodeA.embedding);
    const embB = parseEmbedding(nodeB.embedding);
    if (!embA || !embB) return null;

    const resonance = cosineSimilarity(embA, embB);

    console.error(`[podbit] Domain-directed: ${(await resolveContent(nodeA.content)).slice(0, 40)}... <-> ${(await resolveContent(nodeB.content)).slice(0, 40)}... = ${resonance.toFixed(3)}`);

    if (resonance < config.resonanceThreshold) {
        emitActivity('synthesis', 'similarity_check', `Domain-directed: ${resonance.toFixed(3)} below threshold ${config.resonanceThreshold.toFixed(2)}`, { gate: 'resonance', similarity: resonance, threshold: config.resonanceThreshold, passed: false });
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'no_valid_partner',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, nodeA, nodeB };
    }

    if (resonance > (appConfig.synthesisEngine.similarityCeiling ?? 0.92)) {
        emitActivity('synthesis', 'similarity_check', `Domain-directed: ${resonance.toFixed(3)} above ceiling ${(appConfig.synthesisEngine.similarityCeiling ?? 0.92).toFixed(2)} — too similar`, { gate: 'ceiling', similarity: resonance, threshold: appConfig.synthesisEngine.similarityCeiling ?? 0.92, passed: false });
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'too_similar',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, nodeA, nodeB };
    }

    emitActivity('synthesis', 'similarity_check', `Domain-directed: resonance ${resonance.toFixed(3)}`, { gate: 'resonance', similarity: resonance, threshold: config.resonanceThreshold, passed: true, ceiling: appConfig.synthesisEngine.similarityCeiling });

    // Update salience (they participated)
    await updateNodeSalience(nodeA.id, config.salienceBoost);
    await updateNodeSalience(nodeB.id, config.salienceBoost);
    await query(`UPDATE nodes SET last_resonated = datetime('now') WHERE id IN ($1, $2)`, [nodeA.id, nodeB.id]);

    // Structural validation
    const structuralCheck = validateSynthesisPair(nodeA, nodeB, resonance);
    if (!structuralCheck.valid) {
        console.error(`  Domain-directed pair rejected: ${structuralCheck.reason}`);
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: structuralCheck.reason!.includes('tautology') ? 'tautology'
                : structuralCheck.reason!.includes('vocabulary') ? 'low_vocabulary'
                : 'low_specificity',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, rejected: true, reason: structuralCheck.reason, nodeA, nodeB };
    }
    emitActivity('synthesis', 'structural_passed', `Structural validation passed (sim ${resonance.toFixed(3)}, spec ${(nodeA.specificity || 0).toFixed(1)}+${(nodeB.specificity || 0).toFixed(1)})`, { gate: 'structural', similarity: resonance, passed: true, nodeA: nodeA.id, nodeB: nodeB.id });

    // Voice the connection (with consultant escalation on rejection)
    let voiceResult = await voice(nodeA, nodeB, 'object-following', 'synthesis');
    if (!voiceResult.content && hasConsultant('synthesis')) {
        emitActivity('synthesis', 'consultant_escalation', 'Voicing rejected — escalating to consultant model', { subsystem: 'synthesis', mode: 'domain_directed', nodeA: nodeA.id, nodeB: nodeB.id, domainA: nodeA.domain, domainB: nodeB.domain, ...getVoiceModelProvenance() });
        voiceResult = await voice(nodeA, nodeB, 'object-following', 'synthesis', true);
    }
    if (!voiceResult.content) {
        emitActivity('synthesis', 'voicing_rejected', `Voicing rejected output${voiceResult.rejectionReason ? `: ${voiceResult.rejectionReason}` : ''}`, { gate: 'voicing', passed: false, rejectionReason: voiceResult.rejectionReason, nodeA: nodeA.id, nodeB: nodeB.id, ...getVoiceModelProvenance() });
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: voiceResult.rejectionReason ? `voicing_${voiceResult.rejectionReason}` : 'voicing_rejected',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, rejected: true, nodeA, nodeB };
    }
    let voicedContent = voiceResult.content;
    let voicedName = voiceResult.name || null;
    emitActivity('synthesis', 'voicing_passed', `Voicing produced ${voicedContent.split(/\s+/).length} words`, { gate: 'voicing', passed: true, wordCount: voicedContent.split(/\s+/).length, nodeA: nodeA.id, nodeB: nodeB.id, ...getVoiceModelProvenance() });

    // ── CHEAP GATES (run before expensive LLM gates to save calls) ──

    // Specificity gate — pure text analysis, zero cost
    // Target domain from parents, not from constraint — constraint controls pair selection, not placement
    const sysDomains = await getSystemDomains();
    let targetDomain: string | null;
    if (nodeA.domain && nodeB.domain && nodeA.domain === nodeB.domain) {
        targetDomain = nodeA.domain;
    } else {
        targetDomain = (nodeA.weight ?? 0) >= (nodeB.weight ?? 0)
            ? (nodeA.domain || nodeB.domain || null)
            : (nodeB.domain || nodeA.domain || null);
    }
    if (isSystemDomain(targetDomain, sysDomains)) {
        const fallback = [nodeA.domain, nodeB.domain].find(d => d && !isSystemDomain(d, sysDomains));
        if (fallback) targetDomain = fallback;
    }

    const childSpecificity = measureSpecificity(voicedContent, targetDomain);
    const minSynthesisSpecificity = appConfig.engine.minSpecificity ?? 0.05;
    if (childSpecificity < minSynthesisSpecificity) {
        console.error(`  Domain-directed output rejected: specificity too low (${childSpecificity.toFixed(3)})`);
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'output_too_vague',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, rejected: true, nodeA, nodeB };
    }
    emitActivity('synthesis', 'specificity_passed', `Specificity: ${childSpecificity.toFixed(3)} >= ${minSynthesisSpecificity} — passed`, { gate: 'specificity', specificity: childSpecificity, threshold: minSynthesisSpecificity });

    // Embedding + cheap math gates
    const voicedEmbedding = await getEmbedding(voicedContent);

    const { checkDuplicate } = await import('../handlers/dedup.js');
    const dupCheck = await checkDuplicate(voicedContent, voicedEmbedding, targetDomain, 'domain-directed');
    if (dupCheck.isDuplicate) {
        console.error(`  Domain-directed output rejected (duplicate): ${dupCheck.reason}`);
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'duplicate',
            synthesisMode: 'domain_directed',
            domainPair: pair,
        });
        return { resonance, created: false, rejected: true, nodeA, nodeB };
    }
    emitActivity('synthesis', 'dedup_passed', `Dedup: best similarity ${dupCheck.bestSimilarity?.toFixed(3) ?? 'N/A'} — passed`, { gate: 'dedup', bestSimilarity: dupCheck.bestSimilarity });

    // Junk filter gate
    const junkThreshold = appConfig.engine.junkThreshold ?? 0.75;
    if (voicedEmbedding) {
        const junkNodes = await query(
            `SELECT id, embedding_bin, embedding FROM nodes WHERE junk = 1 ORDER BY created_at DESC LIMIT ${Math.floor(appConfig.magicNumbers.junkFilterLimit)}`
        );
        for (const junk of junkNodes as any[]) {
            const junkEmb = junk.embedding_bin
                ? parseEmbedding(junk.embedding_bin)
                : parseEmbedding(junk.embedding);
            if (!junkEmb) continue;
            const sim = cosineSimilarity(voicedEmbedding, junkEmb);
            if (sim >= junkThreshold) {
                console.error(`  Domain-directed output rejected (junk match, sim=${sim.toFixed(3)})`);
                await logSynthesisCycle({
                    nodeA, nodeB, resonance,
                    threshold: config.resonanceThreshold,
                    createdChild: false,
                    rejectionReason: 'junk_match',
                    synthesisMode: 'domain_directed',
                    domainPair: pair,
                });
                return { resonance, created: false, rejected: true, nodeA, nodeB };
            }
        }
        emitActivity('synthesis', 'junk_filter_passed', `Junk filter: cleared ${junkNodes.length} junk nodes (threshold ${junkThreshold})`, { gate: 'junk', passed: true, junkNodesChecked: junkNodes.length, threshold: junkThreshold });
    }

    // Classify trajectory and compute weight (domain-directed does not apply fitness modifier)
    const avgParentSpecificity = ((nodeA.specificity || 0) + (nodeB.specificity || 0)) / 2;
    const { trajectory, childWeight } = computeTrajectoryAndWeight({ childSpecificity, avgParentSpecificity });

    // ── CITIZEN VALIDATION — impartial LLM judge ──
    if (appConfig.minitruth?.enabled) {
        const maxRework = appConfig.minitruth.maxReworkAttempts ?? 1;
        let attempt = 0;
        let lastFeedback: string | undefined;
        const originalContent = voicedContent;
        while (attempt <= maxRework) {
            try {
                const cvResult = await runMinitruth(voicedContent, [nodeA, nodeB], targetDomain,
                    attempt > 0 ? originalContent : undefined,
                    attempt > 0 ? lastFeedback : undefined);
                emitActivity('synthesis', `minitruth_${cvResult.verdict}`, `Minitruth: ${cvResult.verdict} (score ${cvResult.score.toFixed(1)}) — ${cvResult.reasoning.slice(0, 120)}`, { gate: 'minitruth', verdict: cvResult.verdict, score: cvResult.score, attempt, nodeA: nodeA.id, nodeB: nodeB.id, synthesisMode: 'domain_directed' });

                if (cvResult.verdict === 'accept') break;

                if (cvResult.verdict === 'rework' && attempt < maxRework && cvResult.feedback) {
                    lastFeedback = cvResult.feedback;
                    attempt++;
                    const reworkResult = await voice(nodeA, nodeB, 'object-following', 'synthesis', false, { priorAttempt: voicedContent, feedback: cvResult.feedback });
                    if (!reworkResult.content) {
                        emitActivity('synthesis', 'minitruth_rework_failed', 'Rework voicing failed — rejecting', { gate: 'minitruth', attempt, nodeA: nodeA.id, nodeB: nodeB.id });
                        await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'minitruth_rework_voicing_failed', synthesisMode: 'domain_directed', domainPair: pair });
                        return { resonance, created: false, rejected: true, nodeA, nodeB };
                    }
                    voicedContent = reworkResult.content;
                    if (reworkResult.name) voicedName = reworkResult.name;
                    continue;
                }

                // reject or exhausted rework attempts
                await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: `minitruth_${cvResult.verdict}`, synthesisMode: 'domain_directed', domainPair: pair });
                return { resonance, created: false, rejected: true, nodeA, nodeB };
            } catch (err: any) {
                // Fail-open: minitruth error allows the node through
                console.error(`  Minitruth error (domain-directed): ${err.message}`);
                emitActivity('synthesis', 'minitruth_error', `Minitruth error (fail-open): ${err.message}`, { gate: 'minitruth', error: err.message, nodeA: nodeA.id, nodeB: nodeB.id });
                break;
            }
        }
    }

    // Domain drift gate — SKIP for domain-directed synthesis (parents are always
    // from different domains; the whole point is cross-domain bridging)
    const isDDCrossDomain = nodeA.domain && nodeB.domain && nodeA.domain !== nodeB.domain;
    if (!isDDCrossDomain) {
        const ddCheck1 = await checkDomainDrift(voicedContent, targetDomain, voicedEmbedding);
        if (ddCheck1.drifted) {
            console.error(`  Domain-directed output rejected (domain drift, sim=${ddCheck1.similarity.toFixed(3)} < ${ddCheck1.threshold})`);
            emitActivity('synthesis', 'domain_drift_rejected', `Domain drift: similarity ${ddCheck1.similarity.toFixed(3)} < ${ddCheck1.threshold} to "${targetDomain}" seed centroid`, { nodeA: nodeA.id, nodeB: nodeB.id, domain: targetDomain, similarity: ddCheck1.similarity, threshold: ddCheck1.threshold, synthesisMode: 'domain_directed', ...getVoiceModelProvenance() });
            await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'domain_drift', synthesisMode: 'domain_directed', domainPair: pair });
            return { resonance, created: false, rejected: true, nodeA, nodeB };
        }
    }

    // Create node (skipDedup: synthesis engine already runs checkDuplicate before voicing)
    const child = await createNode(voicedContent, 'synthesis', 'domain-directed', {
        domain: targetDomain,
        contributor: 'synthesis-engine',
        embedding: voicedEmbedding,
        trajectory,
        weight: childWeight,
        skipDedup: true,
        name: voicedName,
        ...getVoiceModelProvenance(),
    });

    if (voicedEmbedding) setCached(child.id, voicedEmbedding);

    // Create parent edges
    await createEdge(nodeA.id, child.id, 'parent', resonance);
    await createEdge(nodeB.id, child.id, 'parent', resonance);

    // Set generation = max(parent generations) + 1
    {
        const maxPGen = Math.max(nodeA.generation ?? 0, nodeB.generation ?? 0);
        await query('UPDATE nodes SET generation = $1 WHERE id = $2', [maxPGen + 1, child.id]);
    }

    console.error(`  → domain-directed synthesis [${trajectory}] ${pair.domainA}×${pair.domainB} (specificity: ${childSpecificity.toFixed(3)})`);
    const modelProv = getVoiceModelProvenance();
    emitActivity('synthesis', 'child_created', `Created ${trajectory} node: "${voicedContent.slice(0, 80)}..."`, { childId: child.id, trajectory, specificity: childSpecificity, weight: childWeight, domain: targetDomain, modelId: modelProv.modelId, modelName: modelProv.modelName, synthesisMode: 'domain_directed' });

    // Record birth for lifecycle tracking
    await recordBirth(child.id, [nodeA.id, nodeB.id]);

    // Post-voicing API verification (fire-and-forget, independent of EVM)
    if (appConfig.labVerify?.apiVerification?.enabled) {
        import('../evm/api/orchestrator.js').then(({ runApiVerification }) =>
            runApiVerification(child.id, child.content, child.domain).catch(() => {})
        ).catch(() => {});
    }

    // Boost parents (capped at weightCeiling)
    if (trajectory === 'knowledge') {
        const boost = appConfig.engine.parentBoost ?? 0.1;
        const ceiling = appConfig.engine.weightCeiling ?? 3.0;
        await query(`UPDATE nodes SET weight = MIN($1, weight + $2) WHERE id IN ($3, $4)`, [ceiling, boost, nodeA.id, nodeB.id]);
    }

    // Log cycle
    await logSynthesisCycle({
        nodeA, nodeB, resonance,
        threshold: config.resonanceThreshold,
        createdChild: true,
        childId: child.id,
        trajectory,
        parentIds: [nodeA.id, nodeB.id],
        synthesisMode: 'domain_directed',
        domainPair: pair,
    });

    return { resonance, created: true, child, nodeA, nodeB };
}

// =============================================================================
// SYNTHESIS CYCLE
// =============================================================================

/**
 * Standard pairwise synthesis cycle: bottom-up directed search for resonating pairs.
 *
 * 1. Optional niching override to target underrepresented domains.
 * 2. Optional elite bridging (pre-selected elite-to-elite pair).
 * 3. Sample one node by salience, find its best partner via embedding cache.
 * 4. Optional multi-parent recombination (3-4 parents from neighbour pool).
 * 5. Voice the connection, run quality gates, create child node on success.
 *
 * @param domain - Optional domain constraint; when `null`, sampling spans all accessible domains.
 * @returns An object with `{ resonance, created, child?, nodeA, nodeB }`, or `null` if insufficient nodes.
 */
async function synthesisCycle(domain: string | null = null) {
    // 0. NICHING: If enabled, override domain with an underrepresented one
    if (!domain) {
        const nichedDomain = await selectDomainWithNiching();
        if (nichedDomain) {
            domain = nichedDomain;
        }
    }

    // 0b. ELITE BRIDGING: with configured probability, attempt elite-to-elite synthesis
    if (appConfig.elitePool?.enabled && appConfig.elitePool?.enableEliteBridging
        && Math.random() < (appConfig.elitePool.bridgingRate ?? 0.2)) {
        try {
            const { getEliteBridgingCandidates } = await import('./elite-pool.js');
            const bridgeCandidates = await getEliteBridgingCandidates(1);
            if (bridgeCandidates.length > 0) {
                const pair = bridgeCandidates[0];
                const fullA = await queryOne('SELECT * FROM nodes WHERE id = $1', [pair.nodeA.id]);
                const fullB = await queryOne('SELECT * FROM nodes WHERE id = $1', [pair.nodeB.id]);
                if (fullA && fullB) {
                    console.error(`[podbit] Elite bridging: ${(await resolveContent(fullA.content)).slice(0, 40)}... <-> ${(await resolveContent(fullB.content)).slice(0, 40)}... (gen ${pair.nodeA.generation}+${pair.nodeB.generation}, manifest=${pair.spansManifestBridge})`);
                    emitActivity('elite', 'elite_bridging_attempted',
                        `Attempting bridge: "${(await resolveContent(fullA.content)).slice(0, 35)}..." + "${(await resolveContent(fullB.content)).slice(0, 35)}..."`,
                        { nodeA: fullA.id, nodeB: fullB.id, generation: `${pair.nodeA.generation}+${pair.nodeB.generation}`, spansManifestBridge: pair.spansManifestBridge });
                    // Jump directly to voicing — elite pairs bypass regular partner search
                    return await eliteBridgingSynthesis(fullA, fullB, domain);
                }
            }
        } catch (err: any) {
            console.error(`[podbit] Elite bridging failed, falling back to regular synthesis: ${err.message}`);
        }
    }

    // 1. DIRECTED SEARCH: Sample ONE node by salience, then find its best partner
    const seeds = await sampleNodes(1, domain);
    if (seeds.length < 1) {
        console.error('Not enough nodes for synthesis cycle');
        return null;
    }
    const nodeA = seeds[0];

    // Check if this node's domain is excluded from the synthesis cycle
    const synthExcluded = await getExcludedDomainsForCycle('synthesis');
    if (nodeA.domain && synthExcluded.has(nodeA.domain)) return null;

    // GA MIGRATION: with probability migrationRate, seek partner from foreign partition
    let useMigration = false;
    let candidates: any[] = [];

    if (appConfig.synthesisEngine.migrationEnabled && Math.random() < appConfig.synthesisEngine.migrationRate) {
        const homePartition = nodeA.domain ? await getPartitionForDomain(nodeA.domain) : null;
        if (homePartition) {
            const migrants = await getPartitionTopNodes(homePartition, appConfig.synthesisEngine.migrationTopK);
            if (migrants.length > 0) {
                candidates = migrants;
                useMigration = true;
                console.error(`[podbit] Synthesis: migration cycle — ${migrants.length} candidates from foreign partitions`);
            }
        }
    }

    if (!useMigration) {
        // Normal path: partition-aware accessible domains
        const accessibleDomains = nodeA.domain
            ? await getAccessibleDomains(nodeA.domain)
            : null;

        const totalLimit = Math.floor(appConfig.synthesisEngine.candidateLimit);

        if (accessibleDomains && accessibleDomains.length > 1) {
            // Fair sampling: distribute candidate slots across domains so one large
            // domain doesn't consume the entire pool and starve cross-domain mixing.
            const perDomainLimit = Math.max(10, Math.ceil(totalLimit / accessibleDomains.length));
            const domainCandidates = await Promise.all(
                accessibleDomains.map(d => query(`
                    SELECT id FROM nodes
                    WHERE archived = 0 AND id != $1
                      AND domain = $2
                      AND embedding IS NOT NULL
                      AND node_type NOT IN ('question', 'raw', 'elite_verification')
                      AND COALESCE(synthesizable, 1) != 0
                    ORDER BY weight DESC
                    LIMIT $3
                `, [nodeA.id, d, perDomainLimit]))
            );
            // Merge and deduplicate
            const seen = new Set<string>();
            for (const rows of domainCandidates) {
                for (const row of rows) {
                    if (!seen.has(row.id)) {
                        seen.add(row.id);
                        candidates.push(row);
                    }
                }
            }
            // Trim to total limit if needed
            if (candidates.length > totalLimit) {
                candidates = candidates.slice(0, totalLimit);
            }
        } else if (accessibleDomains && accessibleDomains.length === 1) {
            candidates = await query(`
                SELECT id FROM nodes
                WHERE archived = 0 AND id != $1
                  AND domain = $2
                  AND embedding IS NOT NULL
                  AND node_type NOT IN ('question', 'raw', 'elite_verification')
                  AND COALESCE(synthesizable, 1) != 0
                ORDER BY weight DESC
                LIMIT $3
            `, [nodeA.id, accessibleDomains[0], totalLimit]);
        } else {
            candidates = await query(`
                SELECT id FROM nodes
                WHERE archived = 0 AND id != $1
                  AND embedding IS NOT NULL
                  AND node_type NOT IN ('question', 'raw', 'elite_verification')
                  AND COALESCE(synthesizable, 1) != 0
                ORDER BY weight DESC
                LIMIT ${totalLimit}
            `, [nodeA.id]);
        }
    }

    if (candidates.length < 1) {
        console.error('Not enough candidates for directed search');
        return null;
    }

    // Find best partner using embedding cache
    const neighbors = await findNeighbors(
        nodeA.id,
        candidates.map((c: any) => c.id),
        appConfig.synthesisEngine.directedSearchTopK,
        config.resonanceThreshold,
        appConfig.synthesisEngine.similarityCeiling,
    );

    if (neighbors.length === 0) {
        // No valid partner found — log and return
        emitActivity('synthesis', 'similarity_check', `No valid partner in band [${config.resonanceThreshold.toFixed(2)}–${(appConfig.synthesisEngine.similarityCeiling ?? 0.92).toFixed(2)}] from ${candidates.length} candidates`, { gate: 'partner_search', similarity: 0, threshold: config.resonanceThreshold, passed: false });
        await logSynthesisCycle({
            nodeA, nodeB: undefined, resonance: 0,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'no_valid_partner',
        });
        return { resonance: 0, created: false, nodeA };
    }

    // Pick the best partner (highest similarity in the valid band)
    const bestPartner = neighbors[0];
    const nodeB = await queryOne('SELECT * FROM nodes WHERE id = $1', [bestPartner.id]);
    if (!nodeB) return null;

    const resonance = bestPartner.similarity;

    console.error(`[podbit] Synthesis: ${(await resolveContent(nodeA.content)).slice(0, 40)}... <-> ${(await resolveContent(nodeB.content)).slice(0, 40)}... = ${resonance.toFixed(3)}`);
    emitActivity('synthesis', 'similarity_check', `Resonance: ${resonance.toFixed(3)} — "${(await resolveContent(nodeA.content)).slice(0, 35)}..." + "${(await resolveContent(nodeB.content)).slice(0, 35)}..."`, { gate: 'resonance', similarity: resonance, threshold: config.resonanceThreshold, passed: true, ceiling: appConfig.synthesisEngine.similarityCeiling, nodeA: nodeA.id, nodeB: nodeB.id });

    // 2. Update salience (they participated) and mark last_resonated
    await updateNodeSalience(nodeA.id, config.salienceBoost);
    await updateNodeSalience(nodeB.id, config.salienceBoost);
    await query(`UPDATE nodes SET last_resonated = datetime('now') WHERE id IN ($1, $2)`, [nodeA.id, nodeB.id]);

    // 3. Structural validation -- reject superficial connections
    const structuralCheck = validateSynthesisPair(nodeA, nodeB, resonance);
    if (!structuralCheck.valid) {
        console.error(`  Synthesis pair rejected: ${structuralCheck.reason}`);
        const isSimilarityRejection = structuralCheck.reason!.includes('too high') || structuralCheck.reason!.includes('tautology');
        emitActivity('synthesis', isSimilarityRejection ? 'similarity_check' : 'rejected',
            isSimilarityRejection ? `Structural: ${structuralCheck.reason}` : `Pair rejected: ${structuralCheck.reason}`,
            isSimilarityRejection ? { gate: 'structural', similarity: resonance, threshold: appConfig.synthesisEngine.similarityCeiling, passed: false } : undefined
        );
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: structuralCheck.reason!.includes('tautology') ? 'tautology'
                : structuralCheck.reason!.includes('too high') ? 'too_similar'
                : structuralCheck.reason!.includes('vocabulary') ? 'low_vocabulary'
                : 'low_specificity',
        });
        return { resonance, created: false, rejected: true, reason: structuralCheck.reason, nodeA, nodeB };
    }
    emitActivity('synthesis', 'structural_passed', `Structural validation passed (sim ${resonance.toFixed(3)}, spec ${(nodeA.specificity || 0).toFixed(1)}+${(nodeB.specificity || 0).toFixed(1)})`, { gate: 'structural', similarity: resonance, passed: true, nodeA: nodeA.id, nodeB: nodeB.id });

    // 4. Voice the connection (pairwise), with consultant escalation
    const parentNodes: ResonanceNode[] = [nodeA, nodeB];
    let voiceResult = parentNodes.length > 2
        ? await voiceMulti(parentNodes, 'object-following', 'synthesis')
        : await voice(nodeA, nodeB, 'object-following', 'synthesis');
    if (!voiceResult.content && hasConsultant('synthesis')) {
        emitActivity('synthesis', 'consultant_escalation', 'Voicing rejected — escalating to consultant model', { subsystem: 'synthesis', parentCount: parentNodes.length, nodeA: nodeA.id, nodeB: nodeB.id, domainA: nodeA.domain, domainB: nodeB.domain, ...getVoiceModelProvenance() });
        voiceResult = parentNodes.length > 2
            ? await voiceMulti(parentNodes, 'object-following', 'synthesis', true)
            : await voice(nodeA, nodeB, 'object-following', 'synthesis', true);
    }

    // Check if voice rejected the output
    if (voiceResult.content) {
        emitActivity('synthesis', 'voicing_passed', `Voicing produced ${voiceResult.content.split(/\s+/).length} words`, { gate: 'voicing', passed: true, wordCount: voiceResult.content.split(/\s+/).length, nodeA: nodeA.id, nodeB: nodeB.id, ...getVoiceModelProvenance() });
    }
    if (!voiceResult.content) {
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: voiceResult.rejectionReason ? `voicing_${voiceResult.rejectionReason}` : 'voicing_rejected',
            parentIds: parentNodes.map(n => n.id),
        });
        return { resonance, created: false, rejected: true, nodeA, nodeB };
    }
    let voicedContent = voiceResult.content;
    let voicedName = voiceResult.name || null;

    // ── CHEAP GATES (run before expensive LLM gates to save calls) ──

    // 5a. Determine target domain — inherit from parents, NOT from sampling/niching domain.
    // Niching controls which nodes to sample; placement is determined by parent domains.
    // Cross-partition provenance is tracked via edges, not domain names.
    const domainA = nodeA.domain;
    const domainB = nodeB.domain;
    const sysDomains = await getSystemDomains();
    let targetDomain: string | null;
    if (domainA && domainB && domainA === domainB) {
        // Both parents in same domain — child goes there regardless of niching
        targetDomain = domainA;
    } else {
        // Cross-domain: prefer higher-weighted parent's domain
        targetDomain = (nodeA.weight ?? 0) >= (nodeB.weight ?? 0)
            ? (domainA || domainB || null)
            : (domainB || domainA || null);
    }
    if (isSystemDomain(targetDomain, sysDomains)) {
        const fallback = [domainA, domainB].find(d => d && !isSystemDomain(d, sysDomains));
        if (fallback) targetDomain = fallback;
    }

    // 5b. Specificity gate — pure text analysis, zero cost
    const childSpecificity = measureSpecificity(voicedContent, targetDomain);
    const minSynthesisSpecificity = appConfig.engine.minSpecificity ?? 0.05;
    emitActivity('synthesis', 'similarity_check', `Specificity: ${childSpecificity.toFixed(3)} (min ${minSynthesisSpecificity})${childSpecificity < minSynthesisSpecificity ? ' — TOO LOW' : ' — passed'}`, { gate: 'specificity', similarity: childSpecificity, threshold: minSynthesisSpecificity, passed: childSpecificity >= minSynthesisSpecificity, raw: childSpecificity });
    if (childSpecificity < minSynthesisSpecificity) {
        console.error(`  Synthesis output rejected: specificity too low (${childSpecificity.toFixed(3)} < ${minSynthesisSpecificity})`);
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'output_too_vague',
        });
        return { resonance, created: false, rejected: true, reason: `Specificity too low (${childSpecificity.toFixed(3)})`, nodeA, nodeB };
    }

    // 6. Embedding + cheap math gates — reject before expensive LLM judgment gates
    const voicedEmbedding = await getEmbedding(voicedContent);

    // 6a. Dedup gate — reject if voiced content duplicates an existing node
    const { checkDuplicate } = await import('../handlers/dedup.js');
    const dupCheck = await checkDuplicate(voicedContent, voicedEmbedding, targetDomain, 'synthesis');
    if (dupCheck.bestSimilarity) {
        emitActivity('synthesis', 'similarity_check', `Dedup: best sim ${dupCheck.bestSimilarity.toFixed(3)}${dupCheck.isDuplicate ? ' — DUPLICATE' : ' — passed'}`, { gate: 'dedup', similarity: dupCheck.bestSimilarity, threshold: appConfig.dedup.embeddingSimilarityThreshold, passed: !dupCheck.isDuplicate, matchedNode: dupCheck.matchedNodeId });
    }
    if (dupCheck.isDuplicate) {
        console.error(`  Synthesis output rejected (duplicate of ${dupCheck.matchedNodeId?.slice(0, 8)}): ${dupCheck.reason}`);
        await logSynthesisCycle({
            nodeA, nodeB, resonance,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'duplicate',
        });
        return { resonance, created: false, rejected: true, reason: `Duplicate: ${dupCheck.reason}`, nodeA, nodeB };
    }

    // 6c. Junk filter gate — reject if voiced content is too similar to junked nodes
    const junkThreshold = appConfig.engine.junkThreshold ?? 0.75;
    if (voicedEmbedding) {
        const junkNodes = await query(
            `SELECT id, embedding_bin, embedding FROM nodes WHERE junk = 1 ORDER BY created_at DESC LIMIT ${Math.floor(appConfig.magicNumbers.junkFilterLimit)}`
        );
        for (const junk of junkNodes) {
            const junkEmb = junk.embedding_bin
                ? parseEmbedding(junk.embedding_bin)
                : parseEmbedding(junk.embedding);
            if (!junkEmb) continue;
            const sim = cosineSimilarity(voicedEmbedding, junkEmb);
            if (sim >= junkThreshold) {
                emitActivity('synthesis', 'similarity_check', `Junk filter: sim ${sim.toFixed(3)} ≥ ${junkThreshold} — REJECTED`, { gate: 'junk', similarity: sim, threshold: junkThreshold, passed: false, junkNode: junk.id });
                console.error(`  Synthesis output rejected (similar to junk ${junk.id.slice(0, 8)}, sim=${sim.toFixed(3)})`);
                await logSynthesisCycle({
                    nodeA, nodeB, resonance,
                    threshold: config.resonanceThreshold,
                    createdChild: false,
                    rejectionReason: 'junk_match',
                });
                return { resonance, created: false, rejected: true, reason: `Similar to junk node (sim=${sim.toFixed(3)})`, nodeA, nodeB };
            }
        }
        emitActivity('synthesis', 'junk_filter_passed', `Junk filter: cleared ${junkNodes.length} junk nodes (threshold ${junkThreshold})`, { gate: 'junk', passed: true, junkNodesChecked: junkNodes.length, threshold: junkThreshold });
    }

    // 7. Classify trajectory and compute weight (with fitness modifier)
    const avgParentSpecificity = parentNodes.reduce((sum, n) => sum + (n.specificity || 0), 0) / parentNodes.length;
    const { trajectory, childWeight, fitnessScore } = computeTrajectoryAndWeight({
        childSpecificity,
        avgParentSpecificity,
        resonance,
        dupBestSimilarity: dupCheck.bestSimilarity ?? 0,
        withFitness: true,
        fitnessLabel: 'Fitness',
    });

    // ── CITIZEN VALIDATION — impartial LLM judge ──
    if (appConfig.minitruth?.enabled) {
        const maxRework = appConfig.minitruth.maxReworkAttempts ?? 1;
        let attempt = 0;
        let lastFeedback: string | undefined;
        const originalContent = voicedContent;
        while (attempt <= maxRework) {
            try {
                const cvResult = await runMinitruth(voicedContent, parentNodes, targetDomain,
                    attempt > 0 ? originalContent : undefined,
                    attempt > 0 ? lastFeedback : undefined);
                emitActivity('synthesis', `minitruth_${cvResult.verdict}`, `Minitruth: ${cvResult.verdict} (score ${cvResult.score.toFixed(1)}) — ${cvResult.reasoning.slice(0, 120)}`, { gate: 'minitruth', verdict: cvResult.verdict, score: cvResult.score, attempt, nodeA: nodeA.id, nodeB: nodeB.id });

                if (cvResult.verdict === 'accept') break;

                if (cvResult.verdict === 'rework' && attempt < maxRework && cvResult.feedback) {
                    lastFeedback = cvResult.feedback;
                    attempt++;
                    const reworkResult = parentNodes.length > 2
                        ? await voiceMulti(parentNodes, 'object-following', 'synthesis', false, { priorAttempt: voicedContent, feedback: cvResult.feedback })
                        : await voice(nodeA, nodeB, 'object-following', 'synthesis', false, { priorAttempt: voicedContent, feedback: cvResult.feedback });
                    if (!reworkResult.content) {
                        emitActivity('synthesis', 'minitruth_rework_failed', 'Rework voicing failed — rejecting', { gate: 'minitruth', attempt, nodeA: nodeA.id, nodeB: nodeB.id });
                        await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'minitruth_rework_voicing_failed', parentIds: parentNodes.map(n => n.id) });
                        return { resonance, created: false, rejected: true, nodeA, nodeB };
                    }
                    voicedContent = reworkResult.content;
                    if (reworkResult.name) voicedName = reworkResult.name;
                    continue;
                }

                // reject or exhausted rework attempts
                await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: `minitruth_${cvResult.verdict}`, parentIds: parentNodes.map(n => n.id) });
                return { resonance, created: false, rejected: true, nodeA, nodeB };
            } catch (err: any) {
                console.error(`  Minitruth error (synthesis): ${err.message}`);
                emitActivity('synthesis', 'minitruth_error', `Minitruth error (fail-open): ${err.message}`, { gate: 'minitruth', error: err.message, nodeA: nodeA.id, nodeB: nodeB.id });
                break;
            }
        }
    }

    // Domain drift gate — skip when parents span domains (cross-domain synthesis
    // is SUPPOSED to bridge vocabularies; checking against one domain's centroid
    // would reject the most valuable cross-domain insights)
    const isCrossDomain = domainA && domainB && domainA !== domainB;
    if (!isCrossDomain) {
        const ddCheck2 = await checkDomainDrift(voicedContent, targetDomain, voicedEmbedding);
        if (ddCheck2.drifted) {
            console.error(`  Synthesis output rejected (domain drift, sim=${ddCheck2.similarity.toFixed(3)} < ${ddCheck2.threshold})`);
            emitActivity('synthesis', 'domain_drift_rejected', `Domain drift: similarity ${ddCheck2.similarity.toFixed(3)} < ${ddCheck2.threshold} to "${targetDomain}" seed centroid`, { nodeA: nodeA.id, nodeB: nodeB.id, domain: targetDomain, similarity: ddCheck2.similarity, threshold: ddCheck2.threshold, ...getVoiceModelProvenance() });
            await logSynthesisCycle({ nodeA, nodeB, resonance, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'domain_drift', parentIds: parentNodes.map(n => n.id) });
            return { resonance, created: false, rejected: true, reason: `Domain drift (sim=${ddCheck2.similarity.toFixed(3)})`, nodeA, nodeB };
        }
    }

    // 10. Create synthesis node with trajectory-appropriate weight
    // skipDedup: synthesis engine already runs checkDuplicate before voicing
    const child = await createNode(voicedContent, 'synthesis', 'synthesis', {
        domain: targetDomain,
        contributor: 'synthesis-engine',
        embedding: voicedEmbedding,
        trajectory,
        weight: childWeight,
        skipDedup: true,
        name: voicedName,
        ...getVoiceModelProvenance(),
    });

    // Cache the new node's embedding
    if (voicedEmbedding) {
        setCached(child.id, voicedEmbedding);
    }

    // 10. Create parent edges (all parents, not just pair)
    for (const parent of parentNodes) {
        await createEdge(parent.id, child.id, 'parent', resonance);
    }

    // Set generation = max(parent generations) + 1
    const maxParentGen = Math.max(...parentNodes.map((n: any) => n.generation ?? 0));
    const childGen = maxParentGen + 1;
    await query('UPDATE nodes SET generation = $1 WHERE id = $2', [childGen, child.id]);

    const parentLabel = parentNodes.length > 2 ? ` [${parentNodes.length}-parent]` : '';
    const fitnessLabel = fitnessScore !== undefined ? `, fitness: ${fitnessScore.toFixed(3)}` : '';
    console.error(`  → synthesis${parentLabel} [${trajectory}] (specificity: ${childSpecificity.toFixed(3)}, weight: ${childWeight.toFixed(3)}${fitnessLabel})`);
    const modelProv = getVoiceModelProvenance();
    emitActivity('synthesis', 'child_created', `Created ${trajectory} node${parentLabel}: "${voicedContent.slice(0, 80)}..."`, { childId: child.id, trajectory, specificity: childSpecificity, weight: childWeight, fitness: fitnessScore, domain: targetDomain, modelId: modelProv.modelId, modelName: modelProv.modelName });

    // 10b. Record birth for lifecycle tracking
    await recordBirth(child.id, parentNodes.map(n => n.id));

    // 10c. Post-voicing API verification (fire-and-forget, independent of EVM)


    // 10d. EVM verification (async, non-blocking)
    // Fire-and-forget: don't delay synthesis cycle for verification
    if (appConfig.labVerify?.enabled && appConfig.labVerify?.autoVerifyEnabled) {
        if (childWeight >= (appConfig.labVerify.minNodeWeightForAuto ?? 0.8)) {
            import('../evm/index.js').then(({ verifyNode }) => {
                verifyNode(child.id).catch(err => {
                    console.error(`[evm] Auto-verification failed for ${child.id.slice(0, 8)}: ${err.message}`);
                });
            }).catch(() => {});
        }
    }

    // 11. Boost parent weights for knowledge-trajectory children (capped at weightCeiling)
    if (trajectory === 'knowledge') {
        const boost = appConfig.engine.parentBoost ?? 0.1;
        const ceiling = appConfig.engine.weightCeiling ?? 3.0;
        for (const parent of parentNodes) {
            const newWeight = Math.min(ceiling, parent.weight + boost);
            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [newWeight, parent.id]);
        }
    }

    // 12. Log the cycle
    await logSynthesisCycle({
        nodeA, nodeB, resonance,
        threshold: config.resonanceThreshold,
        createdChild: true,
        childId: child.id,
        trajectory,
        parentIds: parentNodes.map(n => n.id),
        fitnessScore,
    });

    return {
        resonance,
        created: true,
        child,
        nodeA,
        nodeB,
    };
}

// =============================================================================
// ELITE BRIDGING SYNTHESIS
// =============================================================================

/**
 * Run a synthesis cycle using two pre-selected elite nodes as parents.
 *
 * Uses a dedicated `elite.bridging_synthesis` prompt (richer output than the
 * 28-word voicing cap). Applies a reduced gate set: only dangerous-hallucination
 * detection (fabricated numbers/financial claims) and optional consultant pipeline.
 * Skips standard voicing, novelty, and structural gates since elite parents are
 * already verified knowledge.
 *
 * @param nodeA - First elite parent node (full row from `nodes` table).
 * @param nodeB - Second elite parent node.
 * @param domain - Optional domain constraint for target domain selection.
 * @returns An object with `{ resonance: 0, created, child?, nodeA, nodeB }`.
 */
async function eliteBridgingSynthesis(nodeA: any, nodeB: any, domain: string | null) {
    const parentNodes = [nodeA, nodeB];

    // Elite bridging uses a dedicated synthesis prompt — NOT voice() which caps at 28 words.
    // Elite nodes are rich 150-300 word verified paragraphs that need richer synthesis output.
    // All failures emit activity events so the GUI activity feed shows what's happening.
    let voicedContent: string | null = null;
    let voicedName: string | null = null;
    let eliteRejectReason = '';
    try {
        const projectContext = await getProjectContextBlock();
        // Resolve number variable placeholders so the LLM sees actual values
        const resolvedA = await resolveContent(nodeA.content);
        const resolvedB = await resolveContent(nodeB.content);
        const basePrompt = await getPrompt('elite.bridging_synthesis', {
            contentA: resolvedA,
            contentB: resolvedB,
            domainA: nodeA.domain || 'unknown',
            domainB: nodeB.domain || 'unknown',
        });
        const prompt = projectContext ? `${projectContext}\n\n${basePrompt}` : basePrompt;
        emitActivity('elite', 'elite_bridging_attempted', `Calling LLM for ${nodeA.id.slice(0,8)}+${nodeB.id.slice(0,8)} (${nodeA.domain}×${nodeB.domain})`, { parentA: nodeA.id, parentB: nodeB.id });
        const response = await callSubsystemModel('elite_mapping', prompt);

        if (response && response.trim().length > 30) {
            voicedContent = response.trim();
            emitActivity('elite', 'elite_bridging_attempted', `LLM returned ${voicedContent.length}ch / ${voicedContent.split(/\s+/).length}w: "${voicedContent.slice(0, 100)}..."`, { parentA: nodeA.id, parentB: nodeB.id });
        } else {
            eliteRejectReason = `elite_llm_too_short (${response ? response.trim().length : 0} chars)`;
        }
    } catch (err: any) {
        eliteRejectReason = `elite_llm_error: ${err.message.slice(0, 100)}`;
    }

    // Only check for genuinely dangerous hallucinations (fabricated numbers, financial claims)
    // NOT verbosity (maxVerboseWords=35) or novelty ratio — those were calibrated for 28-word voicing
    if (voicedContent) {
        const eliteVoiceModel = getAssignedModel('elite_mapping' as any) || getAssignedModel('voice' as any);
        const hallucination = await detectHallucination(voicedContent, [nodeA, nodeB], eliteVoiceModel?.tier);
        const dangerousReasons = hallucination.reasons.filter(r =>
            r.startsWith('fabricated numbers') ||
            r.startsWith('fabricated multiplier') ||
            r.startsWith('ungrounded financial') ||
            r.startsWith('fabricated future') ||
            r.startsWith('number scope violation')
        );
        if (dangerousReasons.length > 0) {
            eliteRejectReason = `elite_hallucination: ${dangerousReasons.join(', ')}`;
            voicedContent = null;
        }
    }

    if (!voicedContent) {
        emitActivity('elite', 'elite_bridging_attempted', `Elite bridge REJECTED: ${eliteRejectReason}`, { parentA: nodeA.id, parentB: nodeB.id, domainA: nodeA.domain, domainB: nodeB.domain, reason: eliteRejectReason, ...getVoiceModelProvenance() });
        const { logBridgingAttempt } = await import('./elite-pool.js');
        await logBridgingAttempt({ parentAId: nodeA.id, parentBId: nodeB.id, outcome: 'rejected', attemptedAt: new Date().toISOString() });
        await logSynthesisCycle({
            nodeA, nodeB, resonance: 0,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: eliteRejectReason || 'elite_unknown',
            parentIds: [nodeA.id, nodeB.id],
        });
        return { resonance: 0, created: false, rejected: true, reason: eliteRejectReason, nodeA, nodeB };
    }

    // Gates SKIPPED for elite bridging — elite parents are already verified knowledge.
    // TODO: Add dedicated elite gating settings later. For now, just log what would have triggered.
    // Target domain — inherit from parents, NOT from sampling/niching domain
    const sysDomains = await getSystemDomains();
    let targetDomain: string | null;
    if (nodeA.domain && nodeB.domain && nodeA.domain === nodeB.domain) {
        targetDomain = nodeA.domain;
    } else {
        targetDomain = (nodeA.weight ?? 0) >= (nodeB.weight ?? 0)
            ? (nodeA.domain || nodeB.domain || null)
            : (nodeB.domain || nodeA.domain || null);
    }
    if (isSystemDomain(targetDomain, sysDomains)) {
        const fallback = [nodeA.domain, nodeB.domain].find((d: string) => d && !isSystemDomain(d, sysDomains));
        if (fallback) targetDomain = fallback;
    }

    // Embedding (needed for node creation)
    const voicedEmbedding = await getEmbedding(voicedContent);

    // Specificity + trajectory (log-only, no rejection)
    const childSpecificity = measureSpecificity(voicedContent, targetDomain);
    const avgParentSpecificity = parentNodes.reduce((sum: number, n: any) => sum + (n.specificity || 0), 0) / parentNodes.length;
    const { trajectory, childWeight } = computeTrajectoryAndWeight({ childSpecificity, avgParentSpecificity });

    // Domain drift gate — SKIP for elite bridging (always cross-domain by design)
    const isEliteCrossDomain = nodeA.domain && nodeB.domain && nodeA.domain !== nodeB.domain;
    if (!isEliteCrossDomain) {
        const ddCheck3 = await checkDomainDrift(voicedContent, targetDomain, voicedEmbedding);
        if (ddCheck3.drifted) {
            console.error(`  Elite bridge rejected (domain drift, sim=${ddCheck3.similarity.toFixed(3)} < ${ddCheck3.threshold})`);
            emitActivity('elite', 'domain_drift_rejected', `Domain drift: similarity ${ddCheck3.similarity.toFixed(3)} < ${ddCheck3.threshold} to "${targetDomain}" seed centroid`, { parentA: nodeA.id, parentB: nodeB.id, domain: targetDomain, similarity: ddCheck3.similarity, threshold: ddCheck3.threshold, ...getVoiceModelProvenance() });
            const { logBridgingAttempt } = await import('./elite-pool.js');
            await logBridgingAttempt({ parentAId: nodeA.id, parentBId: nodeB.id, outcome: 'rejected', attemptedAt: new Date().toISOString() });
            await logSynthesisCycle({ nodeA, nodeB, resonance: 0, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'domain_drift', parentIds: [nodeA.id, nodeB.id] });
            return { resonance: 0, created: false, rejected: true, reason: `Domain drift (sim=${ddCheck3.similarity.toFixed(3)})`, nodeA, nodeB };
        }
    }

    // Create synthesis node
    const child = await createNode(voicedContent, 'synthesis', 'synthesis', {
        domain: targetDomain,
        contributor: 'elite-bridging',
        embedding: voicedEmbedding,
        trajectory,
        weight: childWeight,
        skipDedup: true,
        name: voicedName,
        ...getVoiceModelProvenance(),
    });

    if (voicedEmbedding) {
        setCached(child.id, voicedEmbedding);
    }

    // Create parent edges
    for (const parent of parentNodes) {
        await createEdge(parent.id, child.id, 'parent', 0);
    }

    // Set generation = max(parent generations) + 1
    const maxParentGen = Math.max(...parentNodes.map((n: any) => n.generation ?? 0));
    const childGen = maxParentGen + 1;
    await query('UPDATE nodes SET generation = $1 WHERE id = $2', [childGen, child.id]);

    console.error(`  → elite bridge gen=${childGen} [${trajectory}] (specificity: ${childSpecificity.toFixed(3)}, weight: ${childWeight.toFixed(3)}): "${voicedContent.slice(0, 80)}..."`);
    const eliteModelProv = getVoiceModelProvenance();
    emitActivity('elite', 'child_created', `Elite bridge created ${trajectory} node: "${voicedContent.slice(0, 80)}..."`, { childId: child.id, trajectory, specificity: childSpecificity, weight: childWeight, domain: targetDomain, parentA: nodeA.id, parentB: nodeB.id, modelId: eliteModelProv.modelId, modelName: eliteModelProv.modelName });

    await recordBirth(child.id, [nodeA.id, nodeB.id]);

    // Post-voicing API verification (fire-and-forget, independent of EVM)
    if (appConfig.labVerify?.apiVerification?.enabled) {
        import('../evm/api/orchestrator.js').then(({ runApiVerification }) =>
            runApiVerification(child.id, child.content, child.domain).catch(() => {})
        ).catch(() => {});
    }

    // Auto-verify the bridge result (fire-and-forget)
    if (appConfig.labVerify?.enabled && appConfig.labVerify?.autoVerifyEnabled) {
        import('../evm/index.js').then(({ verifyNode }) => {
            verifyNode(child.id).catch(err => {
                console.error(`[evm] Auto-verification failed for elite bridge ${child.id.slice(0, 8)}: ${err.message}`);
            });
        }).catch(() => {});
    }

    // Log successful bridging attempt
    const { logBridgingAttempt } = await import('./elite-pool.js');
    await logBridgingAttempt({ parentAId: nodeA.id, parentBId: nodeB.id, synthesisNodeId: child.id, outcome: 'promoted', attemptedAt: new Date().toISOString() });

    // Update salience for parents
    await updateNodeSalience(nodeA.id, config.salienceBoost);
    await updateNodeSalience(nodeB.id, config.salienceBoost);
    await query(`UPDATE nodes SET last_resonated = datetime('now') WHERE id IN ($1, $2)`, [nodeA.id, nodeB.id]);

    await logSynthesisCycle({
        nodeA, nodeB, resonance: 0,
        threshold: config.resonanceThreshold,
        createdChild: true,
        childId: child.id,
        trajectory,
        parentIds: [nodeA.id, nodeB.id],
    });

    return {
        resonance: 0,
        created: true,
        child,
        nodeA,
        nodeB,
    };
}

// =============================================================================
// CLUSTER-BASED SYNTHESIS CYCLE
// =============================================================================

/**
 * Run a synthesis cycle using cluster selection instead of pairwise sampling.
 *
 * Uses simulated annealing ({@link findClusters}) to find optimal multi-node
 * clusters, then voices the best cluster via the multi-parent pipeline.
 * Applies the quality gate pipeline (structural, voicing, specificity, dedup, junk).
 *
 * Structural validation uses a majority rule: the cluster is rejected only if
 * more than half of all pairwise combinations fail.
 *
 * @param domain - Optional domain constraint for cluster search.
 * @returns An object with `{ resonance, created, child?, clusterMode: true }`, or `null` if excluded.
 */
async function clusterSynthesisCycle(domain: string | null = null) {
    const clusterResult = await findClusters(domain, appConfig.clusterSelection.clustersPerCycle);

    if (clusterResult.clusters.length === 0) {
        console.error('[podbit] Cluster selection: no valid clusters found');
        await logSynthesisCycle({
            nodeA: undefined, nodeB: undefined, resonance: 0,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'no_valid_partner',
        });
        return { resonance: 0, created: false };
    }

    const cluster = clusterResult.clusters[0];
    const parentNodes = cluster.nodes;

    // Filter out clusters containing nodes from synthesis-excluded domains
    const synthExcluded = await getExcludedDomainsForCycle('synthesis');
    if (synthExcluded.size > 0 && parentNodes.some((n: any) => n.domain && synthExcluded.has(n.domain))) {
        return null;
    }

    console.error(`[podbit] Cluster synthesis: ${parentNodes.length} nodes, coherence=${cluster.coherence.toFixed(3)}, diversity=${cluster.diversity.toFixed(2)}, energy=${cluster.energy.toFixed(3)}`);
    emitActivity('synthesis', 'similarity_check', `Cluster: ${parentNodes.length} nodes, coherence ${cluster.coherence.toFixed(3)}`, { gate: 'cluster', similarity: cluster.coherence, threshold: config.resonanceThreshold, passed: true, nodes: parentNodes.length, diversity: cluster.diversity });
    for (const n of parentNodes) {
        console.error(`  → ${n.domain || 'unset'}: ${(await resolveContent(n.content)).slice(0, 60)}...`);
    }

    // Update salience for all participating nodes
    for (const node of parentNodes) {
        await updateNodeSalience(node.id, config.salienceBoost);
        await query(`UPDATE nodes SET last_resonated = datetime('now') WHERE id = $1`, [node.id]);
    }

    // Structural validation: majority of pairs must pass (not all — clusters are
    // inherently more diverse, so one weak pair shouldn't kill the whole cluster).
    // Skip similarity ceiling check since the annealing energy function already
    // constrains cluster coherence to the [minSimilarity, maxSimilarity] band.
    let pairsFailed = 0;
    let totalPairs = 0;
    let lastFailReason: string | undefined;
    for (let i = 0; i < parentNodes.length; i++) {
        for (let j = i + 1; j < parentNodes.length; j++) {
            totalPairs++;
            const check = validateSynthesisPair(parentNodes[i], parentNodes[j], 0); // 0 = skip similarity ceiling
            if (!check.valid) {
                pairsFailed++;
                lastFailReason = check.reason!;
                console.error(`  Cluster pair ${i}-${j} failed: ${check.reason}`);
            }
        }
    }
    if (pairsFailed > totalPairs / 2) {
        console.error(`  Cluster rejected: ${pairsFailed}/${totalPairs} pairs failed`);
        await logSynthesisCycle({
            nodeA: parentNodes[0], nodeB: parentNodes[1],
            resonance: cluster.coherence,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: lastFailReason!.includes('tautology') ? 'tautology' : 'low_specificity',
            parentIds: parentNodes.map(n => n.id),
        });
        return { resonance: cluster.coherence, created: false, rejected: true, reason: `${pairsFailed}/${totalPairs} pairs failed: ${lastFailReason}` };
    }
    emitActivity('synthesis', 'structural_passed', `Cluster structural: ${totalPairs - pairsFailed}/${totalPairs} pairs passed`, { gate: 'structural', passed: true, totalPairs, pairsFailed, parentCount: parentNodes.length });

    // Voice the cluster via multi-parent pipeline, with consultant escalation
    let clusterVoiceResult = await voiceMulti(parentNodes, 'object-following', 'synthesis');
    if (!clusterVoiceResult.content && hasConsultant('synthesis')) {
        emitActivity('synthesis', 'consultant_escalation', 'Cluster voicing rejected — escalating to consultant model', { subsystem: 'synthesis', parentCount: parentNodes.length, domains: [...new Set(parentNodes.map((n: any) => n.domain).filter(Boolean))], ...getVoiceModelProvenance() });
        clusterVoiceResult = await voiceMulti(parentNodes, 'object-following', 'synthesis', true);
    }
    if (!clusterVoiceResult.content) {
        emitActivity('synthesis', 'voicing_rejected', `Cluster voicing rejected${clusterVoiceResult.rejectionReason ? `: ${clusterVoiceResult.rejectionReason}` : ''}`, { gate: 'voicing', passed: false, rejectionReason: clusterVoiceResult.rejectionReason, parentCount: parentNodes.length, ...getVoiceModelProvenance() });
        await logSynthesisCycle({
            nodeA: parentNodes[0], nodeB: parentNodes[1],
            resonance: cluster.coherence,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: clusterVoiceResult.rejectionReason ? `voicing_${clusterVoiceResult.rejectionReason}` : 'voicing_rejected',
            parentIds: parentNodes.map(n => n.id),
        });
        return { resonance: cluster.coherence, created: false, rejected: true };
    }
    let voicedContent = clusterVoiceResult.content;
    let voicedName = clusterVoiceResult.name || null;
    emitActivity('synthesis', 'voicing_passed', `Cluster voicing produced ${voicedContent.split(/\s+/).length} words`, { gate: 'voicing', passed: true, wordCount: voicedContent.split(/\s+/).length, parentCount: parentNodes.length, ...getVoiceModelProvenance() });

    // ── CHEAP GATES (run before expensive LLM gates to save calls) ──

    // Determine target domain — majority domain among parents, NOT from sampling/niching domain.
    // Cross-partition provenance tracked via edges, not compound domain names.
    const sysDomains = await getSystemDomains();
    const clusterDomains = [...new Set(parentNodes.map(n => n.domain).filter((d): d is string => !!d))];
    const nonSystemDomains = clusterDomains.filter(d => !isSystemDomain(d, sysDomains));
    // Pick the most common domain among parents
    const domainCounts = new Map<string, number>();
    for (const n of parentNodes) {
        if (n.domain) domainCounts.set(n.domain, (domainCounts.get(n.domain) || 0) + 1);
    }
    const majorityDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const targetDomain = (majorityDomain && !isSystemDomain(majorityDomain, sysDomains))
        ? majorityDomain
        : nonSystemDomains[0] || clusterDomains[0] || null;

    // Specificity gate — pure text analysis, zero cost
    const childSpecificity = measureSpecificity(voicedContent, targetDomain);
    const minSynthesisSpecificity = appConfig.engine.minSpecificity ?? 0.05;
    if (childSpecificity < minSynthesisSpecificity) {
        console.error(`  Cluster synthesis rejected: specificity too low (${childSpecificity.toFixed(3)} < ${minSynthesisSpecificity})`);
        await logSynthesisCycle({
            nodeA: parentNodes[0], nodeB: parentNodes[1],
            resonance: cluster.coherence,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'output_too_vague',
            parentIds: parentNodes.map(n => n.id),
        });
        return { resonance: cluster.coherence, created: false, rejected: true, reason: `Specificity too low (${childSpecificity.toFixed(3)})` };
    }
    emitActivity('synthesis', 'specificity_passed', `Specificity: ${childSpecificity.toFixed(3)} >= ${minSynthesisSpecificity} — passed`, { gate: 'specificity', specificity: childSpecificity, threshold: minSynthesisSpecificity });

    // Embedding + cheap math gates
    const voicedEmbedding = await getEmbedding(voicedContent);

    // Dedup gate
    const { checkDuplicate } = await import('../handlers/dedup.js');
    const dupCheck = await checkDuplicate(voicedContent, voicedEmbedding, targetDomain, 'cluster-synthesis');
    if (dupCheck.isDuplicate) {
        console.error(`  Cluster synthesis rejected (duplicate of ${dupCheck.matchedNodeId?.slice(0, 8)})`);
        await logSynthesisCycle({
            nodeA: parentNodes[0], nodeB: parentNodes[1],
            resonance: cluster.coherence,
            threshold: config.resonanceThreshold,
            createdChild: false,
            rejectionReason: 'duplicate',
            parentIds: parentNodes.map(n => n.id),
        });
        return { resonance: cluster.coherence, created: false, rejected: true, reason: `Duplicate: ${dupCheck.reason}` };
    }
    emitActivity('synthesis', 'dedup_passed', `Dedup: best similarity ${dupCheck.bestSimilarity?.toFixed(3) ?? 'N/A'} — passed`, { gate: 'dedup', bestSimilarity: dupCheck.bestSimilarity });

    // Junk filter gate
    const junkThreshold = appConfig.engine.junkThreshold ?? 0.75;
    if (voicedEmbedding) {
        const junkNodes = await query(
            `SELECT id, embedding_bin, embedding FROM nodes WHERE junk = 1 ORDER BY created_at DESC LIMIT ${Math.floor(appConfig.magicNumbers.junkFilterLimit)}`
        );
        for (const junk of junkNodes) {
            const junkEmb = junk.embedding_bin
                ? parseEmbedding(junk.embedding_bin)
                : parseEmbedding(junk.embedding);
            if (!junkEmb) continue;
            const sim = cosineSimilarity(voicedEmbedding, junkEmb);
            if (sim >= junkThreshold) {
                console.error(`  Cluster synthesis rejected (similar to junk ${junk.id.slice(0, 8)}, sim=${sim.toFixed(3)})`);
                await logSynthesisCycle({
                    nodeA: parentNodes[0], nodeB: parentNodes[1],
                    resonance: cluster.coherence,
                    threshold: config.resonanceThreshold,
                    createdChild: false,
                    rejectionReason: 'junk_match',
                    parentIds: parentNodes.map(n => n.id),
                });
                return { resonance: cluster.coherence, created: false, rejected: true, reason: `Similar to junk (sim=${sim.toFixed(3)})` };
            }
        }
        emitActivity('synthesis', 'junk_filter_passed', `Junk filter: cleared ${junkNodes.length} junk nodes (threshold ${junkThreshold})`, { gate: 'junk', passed: true, junkNodesChecked: junkNodes.length, threshold: junkThreshold });
    }

    // Classify trajectory and compute weight (with fitness modifier)
    const avgParentSpecificity = parentNodes.reduce((sum, n) => sum + (n.specificity || 0), 0) / parentNodes.length;
    const { trajectory, childWeight, fitnessScore } = computeTrajectoryAndWeight({
        childSpecificity,
        avgParentSpecificity,
        resonance: cluster.coherence,
        dupBestSimilarity: dupCheck.bestSimilarity ?? 0,
        withFitness: true,
        fitnessLabel: 'Cluster fitness',
    });

    // ── CITIZEN VALIDATION — impartial LLM judge ──
    if (appConfig.minitruth?.enabled) {
        const maxRework = appConfig.minitruth.maxReworkAttempts ?? 1;
        let attempt = 0;
        let lastFeedback: string | undefined;
        const originalContent = voicedContent;
        while (attempt <= maxRework) {
            try {
                const cvResult = await runMinitruth(voicedContent, parentNodes, targetDomain,
                    attempt > 0 ? originalContent : undefined,
                    attempt > 0 ? lastFeedback : undefined);
                emitActivity('synthesis', `minitruth_${cvResult.verdict}`, `Minitruth: ${cvResult.verdict} (score ${cvResult.score.toFixed(1)}) — ${cvResult.reasoning.slice(0, 120)}`, { gate: 'minitruth', verdict: cvResult.verdict, score: cvResult.score, attempt, parentCount: parentNodes.length });

                if (cvResult.verdict === 'accept') break;

                if (cvResult.verdict === 'rework' && attempt < maxRework && cvResult.feedback) {
                    lastFeedback = cvResult.feedback;
                    attempt++;
                    const reworkResult = await voiceMulti(parentNodes, 'object-following', 'synthesis', false, { priorAttempt: voicedContent, feedback: cvResult.feedback });
                    if (!reworkResult.content) {
                        emitActivity('synthesis', 'minitruth_rework_failed', 'Cluster rework voicing failed — rejecting', { gate: 'minitruth', attempt, parentCount: parentNodes.length });
                        await logSynthesisCycle({ nodeA: parentNodes[0], nodeB: parentNodes[1], resonance: cluster.coherence, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'minitruth_rework_voicing_failed', parentIds: parentNodes.map(n => n.id) });
                        return { resonance: cluster.coherence, created: false, rejected: true };
                    }
                    voicedContent = reworkResult.content;
                    if (reworkResult.name) voicedName = reworkResult.name;
                    continue;
                }

                // reject or exhausted rework attempts
                await logSynthesisCycle({ nodeA: parentNodes[0], nodeB: parentNodes[1], resonance: cluster.coherence, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: `minitruth_${cvResult.verdict}`, parentIds: parentNodes.map(n => n.id) });
                return { resonance: cluster.coherence, created: false, rejected: true };
            } catch (err: any) {
                console.error(`  Minitruth error (cluster): ${err.message}`);
                emitActivity('synthesis', 'minitruth_error', `Minitruth error (fail-open): ${err.message}`, { gate: 'minitruth', error: err.message, parentCount: parentNodes.length });
                break;
            }
        }
    }

    // Domain drift gate — skip when parents span multiple domains
    const clusterHasMultipleDomains = new Set(parentNodes.map(n => n.domain).filter(Boolean)).size > 1;
    if (!clusterHasMultipleDomains) {
        const ddCheck4 = await checkDomainDrift(voicedContent, targetDomain, voicedEmbedding);
        if (ddCheck4.drifted) {
            console.error(`  Cluster synthesis rejected (domain drift, sim=${ddCheck4.similarity.toFixed(3)} < ${ddCheck4.threshold})`);
            emitActivity('synthesis', 'domain_drift_rejected', `Domain drift: similarity ${ddCheck4.similarity.toFixed(3)} < ${ddCheck4.threshold} to "${targetDomain}" seed centroid`, { parentCount: parentNodes.length, domain: targetDomain, similarity: ddCheck4.similarity, threshold: ddCheck4.threshold, ...getVoiceModelProvenance() });
            await logSynthesisCycle({ nodeA: parentNodes[0], nodeB: parentNodes[1], resonance: cluster.coherence, threshold: config.resonanceThreshold, createdChild: false, rejectionReason: 'domain_drift', parentIds: parentNodes.map(n => n.id) });
            return { resonance: cluster.coherence, created: false, rejected: true, reason: `Domain drift (sim=${ddCheck4.similarity.toFixed(3)})` };
        }
    }

    // Create synthesis node (skipDedup: synthesis engine already runs checkDuplicate before voicing)
    const child = await createNode(voicedContent, 'synthesis', 'synthesis', {
        domain: targetDomain,
        contributor: 'synthesis-engine',
        embedding: voicedEmbedding,
        trajectory,
        weight: childWeight,
        skipDedup: true,
        name: voicedName,
        ...getVoiceModelProvenance(),
    });

    if (voicedEmbedding) setCached(child.id, voicedEmbedding);

    // Create parent edges
    for (const parent of parentNodes) {
        await createEdge(parent.id, child.id, 'parent', cluster.coherence);
    }

    // Set generation = max(parent generations) + 1
    {
        const maxPGen = Math.max(...parentNodes.map((n: any) => n.generation ?? 0));
        await query('UPDATE nodes SET generation = $1 WHERE id = $2', [maxPGen + 1, child.id]);
    }

    const fitnessLabel = fitnessScore !== undefined ? `, fitness: ${fitnessScore.toFixed(3)}` : '';
    console.error(`  → cluster synthesis [${trajectory}] [${parentNodes.length}-parent] (specificity: ${childSpecificity.toFixed(3)}, weight: ${childWeight.toFixed(3)}${fitnessLabel})`);
    const clusterModelProv = getVoiceModelProvenance();
    emitActivity('synthesis', 'child_created', `Created ${trajectory} node [${parentNodes.length}-parent]: "${voicedContent.slice(0, 80)}..."`, { childId: child.id, trajectory, specificity: childSpecificity, weight: childWeight, fitness: fitnessScore, domain: targetDomain, modelId: clusterModelProv.modelId, modelName: clusterModelProv.modelName, parentCount: parentNodes.length });

    // Record birth for lifecycle tracking
    await recordBirth(child.id, parentNodes.map(n => n.id));

    // Post-voicing API verification (fire-and-forget, independent of EVM)
    if (appConfig.labVerify?.apiVerification?.enabled) {
        import('../evm/api/orchestrator.js').then(({ runApiVerification }) =>
            runApiVerification(child.id, child.content, child.domain).catch(() => {})
        ).catch(() => {});
    }

    // Boost parents for knowledge trajectory
    if (trajectory === 'knowledge') {
        const boost = appConfig.engine.parentBoost ?? 0.1;
        const ceiling = appConfig.engine.weightCeiling ?? 3.0;
        for (const parent of parentNodes) {
            const newWeight = Math.min(ceiling, parent.weight + boost);
            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [newWeight, parent.id]);
        }
    }

    // Log the cycle
    await logSynthesisCycle({
        nodeA: parentNodes[0], nodeB: parentNodes[1],
        resonance: cluster.coherence,
        threshold: config.resonanceThreshold,
        createdChild: true,
        childId: child.id,
        trajectory,
        parentIds: parentNodes.map(n => n.id),
        fitnessScore,
    });

    return {
        resonance: cluster.coherence,
        created: true,
        child,
        nodeA: parentNodes[0],
        nodeB: parentNodes[1],
        clusterMode: true,
    };
}

// =============================================================================
// MAIN LOOP
// =============================================================================

// Synthesis engine state — shared for external control
const synthesisState: {
    running: boolean;
    shouldStop: boolean;
    cycleCount: number;
    domain: string | null;
    startedAt: string | null;
    mode: string | null;
    discoveries: Discovery[];
} = {
    running: false,
    shouldStop: false,
    cycleCount: 0,
    domain: null,
    startedAt: null,
    mode: null,
    discoveries: [],
};

/**
 * Return a snapshot of the current synthesis engine state.
 *
 * @returns A shallow copy of the synthesis state including `running`, `cycleCount`,
 *          `domain`, `mode`, and any MCP-mode `discoveries`.
 */
function getSynthesisStatus() {
    return { ...synthesisState };
}

/**
 * Send a stop signal to the running synthesis engine.
 *
 * The engine will finish its current cycle and then exit the main loop.
 *
 * @returns `{ success: true }` if the signal was sent, `{ success: false }` if the engine was not running.
 */
function stopSynthesisEngine() {
    if (synthesisState.running) {
        synthesisState.shouldStop = true;
        return { success: true, message: 'Stop signal sent' };
    }
    return { success: false, message: 'Synthesis engine not running' };
}

/**
 * Main synthesis engine entry point.
 *
 * Runs a loop that alternates between domain-directed, cluster, and standard
 * pairwise synthesis cycles based on configured probabilities. Supports two modes:
 * - `'api'` (default): calls LLMs directly and creates nodes autonomously.
 * - `'mcp'`: discovers resonating pairs without voicing, queues them for LLM IDE agent.
 *
 * Also handles periodic decay, lifecycle sweeps, and transient partition tracking.
 *
 * @param options - Engine options.
 * @param options.domain - Constrain synthesis to a specific domain (default: all).
 * @param options.maxCycles - Stop after this many iterations (default: `Infinity`).
 * @param options.mode - Operating mode: `'api'` or `'mcp'` (default: `'api'`).
 * @returns `{ success, cycles, mode, discoveries? }` on completion.
 */
async function runSynthesisEngine(options: SynthesisEngineOptions = {}) {
    const {
        domain = null,
        maxCycles = Infinity,
        mode = 'api', // 'api' = calls LLMs directly, 'mcp' = queues discoveries for LLM IDE agent
    } = options;

    if (!appConfig.synthesisEngine.enabled) {
        return { success: false, message: 'Synthesis engine is disabled. Set SYNTHESIS_ENGINE_ENABLED=true or update config to enable.' };
    }

    if (synthesisState.running) {
        return { success: false, message: 'Synthesis engine already running' };
    }

    synthesisState.running = true;
    synthesisState.shouldStop = false;
    synthesisState.cycleCount = 0;
    synthesisState.domain = domain;
    synthesisState.startedAt = new Date().toISOString();
    synthesisState.mode = mode;
    synthesisState.discoveries = []; // For MCP mode - queued discoveries

    console.error(`Synthesis engine starting (mode: ${mode}, domain: ${domain || 'all'})`);
    emitActivity('synthesis', 'engine_start', `Synthesis engine started (mode: ${mode}, domain: ${domain || 'all'})`);

    try {
        while (!synthesisState.shouldStop && synthesisState.cycleCount < maxCycles) {
            synthesisState.cycleCount++;

            let cycleResult: any = null;
            try {
                if (mode === 'api') {
                    // Decide: domain-directed, cluster, or standard pairwise
                    const useDomainDirected = appConfig.synthesisEngine.domainDirectedEnabled
                        && Math.random() < appConfig.synthesisEngine.domainDirectedCycleRate;

                    const useCluster = !useDomainDirected
                        && appConfig.clusterSelection.enabled
                        && Math.random() < appConfig.clusterSelection.clusterCycleRate;

                    if (useDomainDirected) {
                        cycleResult = await domainDirectedCycle(domain);
                        if (cycleResult?.created) {
                            console.error(`Cycle ${synthesisState.cycleCount}: Created domain-directed synthesis node`);
                        }
                    } else if (useCluster) {
                        cycleResult = await clusterSynthesisCycle(domain);
                        if (cycleResult?.created) {
                            console.error(`Cycle ${synthesisState.cycleCount}: Created cluster synthesis node`);
                        }
                    } else {
                        cycleResult = await synthesisCycle(domain);
                        if (cycleResult?.created) {
                            console.error(`Cycle ${synthesisState.cycleCount}: Created synthesis node`);
                        }
                    }

                    // Lifecycle: increment barren cycles for sampled nodes that didn't produce offspring
                    if (cycleResult && !cycleResult.created) {
                        const sampledIds: string[] = [];
                        if (cycleResult.nodeA?.id) sampledIds.push(cycleResult.nodeA.id);
                        if (cycleResult.nodeB?.id) sampledIds.push(cycleResult.nodeB.id);
                        if (sampledIds.length > 0) {
                            await incrementBarren(sampledIds);
                        }
                    }
                } else {
                    // MCP mode: Find resonating pairs, queue for LLM IDE agent
                    const discovery = await discoverResonance(domain);
                    if (discovery) {
                        synthesisState.discoveries.push(discovery);
                        console.error(`[podbit] Cycle ${synthesisState.cycleCount}: Found match (${discovery.resonance.toFixed(3)})`);
                    }
                }
            } catch (cycleErr: any) {
                if (cycleErr.name === 'AbortError') {
                    console.warn(`[synthesis] Cycle ${synthesisState.cycleCount} aborted (project switch)`);
                    break;
                }
                if (cycleErr.message?.includes('No model assigned')) {
                    console.error(`[synthesis] Stopped: ${cycleErr.message}`);
                    break;
                }
                console.error(`[synthesis] Cycle ${synthesisState.cycleCount} error: ${cycleErr.message}`);
            }

            // Periodic decay
            if (synthesisState.cycleCount % config.decayEveryNCycles === 0) {
                await decayAll();
            }

            // Periodic lifecycle sweep
            const sweepInterval = appConfig.lifecycle?.sweepInterval ?? 5;
            if (appConfig.lifecycle?.enabled && synthesisState.cycleCount % sweepInterval === 0) {
                try {
                    const sweepResult = await lifecycleSweep();
                    if (sweepResult.declined + sweepResult.composted + sweepResult.stillborn > 0) {
                        console.error(`[lifecycle] Sweep: ${sweepResult.declined} declined, ${sweepResult.composted} composted, ${sweepResult.stillborn} stillborn`);
                    }
                } catch (sweepErr: any) {
                    console.error(`[lifecycle] Sweep error: ${sweepErr.message}`);
                }
            }

            // Increment cycles_completed on transient partitions whose domains were sampled
            if (cycleResult?.nodeA?.domain || cycleResult?.nodeB?.domain) {
                try {
                    const sampledDomains = new Set<string>();
                    if (cycleResult.nodeA?.domain) sampledDomains.add(cycleResult.nodeA.domain);
                    if (cycleResult.nodeB?.domain) sampledDomains.add(cycleResult.nodeB.domain);

                    const { domains: transientDomains } = await import('./governance.js').then(m => m.getTransientDomains());
                    const transientSampled = [...sampledDomains].filter(d => transientDomains.includes(d));
                    if (transientSampled.length > 0) {
                        // Find all active transient partitions owning these domains
                        const partitionIds = new Set<string>();
                        for (const d of transientSampled) {
                            const p = await getPartitionForDomain(d);
                            if (p) partitionIds.add(p);
                        }
                        for (const pid of partitionIds) {
                            if (cycleResult.created) {
                                await query(`UPDATE domain_partitions SET cycles_completed = cycles_completed + 1, barren_cycles = 0 WHERE id = $1`, [pid]);
                            } else {
                                await query(`UPDATE domain_partitions SET cycles_completed = cycles_completed + 1, barren_cycles = barren_cycles + 1 WHERE id = $1`, [pid]);
                            }
                        }
                    }
                } catch { /* non-fatal cycle tracking */ }
            }

            // Delay between cycles (abortable — wakes on stop signal)
            await abortableSleep(config.cycleDelayMs, () => synthesisState.shouldStop);
        }

        console.error(`Synthesis engine stopped after ${synthesisState.cycleCount} cycles`);
        emitActivity('synthesis', 'engine_stop', `Synthesis engine stopped after ${synthesisState.cycleCount} cycles`, { cycles: synthesisState.cycleCount });
        return {
            success: true,
            cycles: synthesisState.cycleCount,
            mode,
            discoveries: mode === 'mcp' ? synthesisState.discoveries : undefined,
        };
    } finally {
        synthesisState.running = false;
        synthesisState.shouldStop = false;
    }
}

/**
 * MCP mode discovery -- finds resonating pairs without voicing.
 *
 * Samples two nodes, computes their resonance score, and returns the pair
 * as a {@link Discovery} if they exceed the resonance threshold. The caller
 * (LLM IDE agent) is responsible for voicing the pair via MCP tools.
 *
 * @param domain - Optional domain constraint for node sampling.
 * @returns A {@link Discovery} object with the pair and resonance score, or `null` if no match.
 */
async function discoverResonance(domain: string | null = null): Promise<Discovery | null> {
    const nodes = await sampleNodes(2, domain);

    if (nodes.length < 2) {
        return null;
    }

    const [nodeA, nodeB] = nodes;
    const resonance = await scoreResonance(nodeA, nodeB);

    // Update salience (they participated)
    await updateNodeSalience(nodeA.id, config.salienceBoost);
    await updateNodeSalience(nodeB.id, config.salienceBoost);

    if (resonance < config.resonanceThreshold) {
        return null;
    }

    // Return discovery context for LLM IDE agent
    return {
        nodeA: { id: nodeA.id, content: nodeA.content, domain: nodeA.domain },
        nodeB: { id: nodeB.id, content: nodeB.content, domain: nodeB.domain },
        resonance,
        discoveredAt: new Date().toISOString(),
        status: 'pending', // pending | voiced | dismissed
    };
}

/**
 * Get all pending discoveries queued during MCP mode.
 *
 * @returns An array of {@link Discovery} objects awaiting processing by the LLM IDE agent.
 */
function getDiscoveries() {
    return synthesisState.discoveries || [];
}

/**
 * Remove a discovery from the pending queue after the LLM IDE agent has processed it.
 *
 * @param nodeAId - ID of the first node in the discovery pair.
 * @param nodeBId - ID of the second node in the discovery pair.
 * @returns `true` if a discovery was removed, `false` otherwise.
 */
function clearDiscovery(nodeAId: string, nodeBId: string) {
    if (!synthesisState.discoveries) return false;
    const before = synthesisState.discoveries.length;
    synthesisState.discoveries = synthesisState.discoveries.filter(
        d => !(d.nodeA.id === nodeAId && d.nodeB.id === nodeBId)
    );
    return synthesisState.discoveries.length < before;
}

// =============================================================================
// STOP CYCLE — synthesis-aware, delegates to state module for all other types
// =============================================================================

/**
 * Stop a running cycle by type.
 *
 * For `'synthesis'`, delegates to {@link stopSynthesisEngine} (which has its own
 * state management). For all other types, sets the `shouldStop` flag on the
 * shared {@link cycleStates} record.
 *
 * @param type - The cycle type to stop.
 * @returns `{ success: true }` if the stop signal was sent, `{ success: false }` if the cycle was not running.
 */
function stopCycle(type: CycleType): { success: boolean; message: string } {
    if (type === 'synthesis') return stopSynthesisEngine();
    if (cycleStates[type].running) {
        cycleStates[type].shouldStop = true;
        return { success: true, message: `Stop signal sent to ${type} cycle` };
    }
    return { success: false, message: `${type} cycle not running` };
}

export {
    synthesisCycle,
    domainDirectedCycle,
    runSynthesisEngine,
    stopSynthesisEngine,
    getSynthesisStatus,
    discoverResonance,
    getDiscoveries,
    clearDiscovery,
    cycleStates,
    getCycleStatus,
    getAllCycleStatuses,
    stopCycle,
    runCycleLoop,
    runComprehensiveConsultant,
};
