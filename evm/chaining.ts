/**
 * Lab Chaining — auto-forward experiment results to a critique lab for methodology review.
 *
 * Flow:
 *   1. Lab A runs experiment → verdict (consequences deferred)
 *   2. Build experiment_review spec → enqueue to critique lab
 *   3. Critique lab reviews methodology → confirm / correct / retest
 *   4. Apply final consequences based on critique decision
 *
 * Chain types:
 *   - 'critique': Reviewing a prior lab result (sent to critique lab)
 *   - 'retest':   Re-running with corrective guidance (sent back to original lab)
 *
 * @module evm/chaining
 */

import { query, queryOne, logDecision } from '../core.js';
import { config } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import { resolveContent } from '../core/number-variables.js';
import type { ExperimentSpec, LabResultResponse } from '../lab/types.js';
import type { VerificationResult } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/** Structured response from the critique lab's experiment_review */
export interface CritiqueDecision {
    /** What the critique lab recommends */
    action: 'confirm' | 'correct' | 'retest';
    /** If action=correct, what the verdict should be */
    correctedVerdict?: 'supported' | 'refuted' | 'inconclusive';
    /** If action=correct, the corrected confidence */
    correctedConfidence?: number;
    /** Methodology score (0-1) */
    methodologyScore?: number;
    /** Specific methodological issues found */
    issues?: string[];
    /** If action=retest, guidance for the next experiment */
    guidance?: string;
    /** Full narrative critique */
    critique?: string;
    /** If action=correct, a rewritten version of the claim that strips unsupported parts */
    rewrittenClaim?: string;
}

// =============================================================================
// SHOULD CHAIN?
// =============================================================================

/**
 * Check if a completed experiment should trigger a critique chain.
 *
 * Conditions:
 * - Chaining is enabled in config
 * - The verdict is in the configured `critiqueOnVerdicts` list
 * - Chain depth hasn't exceeded max
 * - The job isn't already a critique chain step
 */
export function shouldChain(
    verdict: string,
    chainDepth: number,
    chainType?: string | null,
    specType?: string,
): boolean {
    const chainConfig = config.lab?.chaining;
    if (!chainConfig?.enabled) return false;
    if (chainDepth >= chainConfig.maxChainDepth) return false;
    // Don't chain critique results (they trigger handleCritiqueResult instead)
    if (chainType === 'critique') return false;
    // Don't chain non-computational lab results — node_critique and experiment_review
    // are LLM quality reviews, not experiments that need methodology critique
    if (specType === 'node_critique' || specType === 'experiment_review') return false;
    return chainConfig.critiqueOnVerdicts.includes(verdict);
}

// =============================================================================
// BUILD EXPERIMENT REVIEW SPEC
// =============================================================================

/**
 * Build an experiment_review spec that gives the critique lab full context
 * to evaluate whether the experiment actually tests the node's claim.
 */
export async function buildExperimentReviewSpec(
    nodeId: string,
    originalSpec: ExperimentSpec,
    labResult: LabResultResponse,
    labJobId: string,
    labName: string,
): Promise<ExperimentSpec> {
    // Fetch node content and parents
    const node: any = await queryOne(
        `SELECT id, content, weight, domain, node_type, contributor, created_at
         FROM nodes WHERE id = $1`,
        [nodeId],
    );

    const parents: any[] = await query(`
        SELECT n.id, n.content, n.node_type, n.weight, n.domain FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
        ORDER BY e.created_at
    `, [nodeId]) as any[];

    const resolvedClaim = node ? await resolveContent(node.content) : '';
    const resolvedParents = await Promise.all(
        parents.map((p: any) => resolveContent(p.content)),
    );

    // Fetch experiment code and stdout from evidence/artifacts
    let experimentCode = '';
    let experimentStdout = '';
    try {
        const latestExec: any = await queryOne(
            `SELECT code, stdout FROM lab_executions
             WHERE node_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [nodeId],
        );
        experimentCode = latestExec?.code || '';
        experimentStdout = latestExec?.stdout || '';
    } catch { /* non-fatal */ }

    return {
        specType: 'experiment_review',
        hypothesis: `Review the methodology and verdict of a lab experiment on this claim: ${resolvedClaim}`,
        setup: {
            // The original claim being tested
            claim: resolvedClaim,
            claimDomain: node?.domain,
            claimType: node?.node_type,
            claimContributor: node?.contributor,
            // Parent nodes (source material)
            parents: resolvedParents.map((content: string, i: number) => ({
                id: parents[i]?.id?.slice(0, 8),
                type: parents[i]?.node_type,
                weight: parents[i]?.weight,
                domain: parents[i]?.domain,
                content,
            })),
            // The original experiment
            originalSpec: {
                specType: originalSpec.specType,
                hypothesis: originalSpec.hypothesis,
                setup: originalSpec.setup,
                claimType: originalSpec.claimType,
            },
            // Lab results
            labVerdict: labResult.verdict,
            labConfidence: labResult.confidence,
            labDetails: labResult.details,
            labName,
            labJobId,
            // Experiment artifacts (code and output)
            experimentCode,
            experimentStdout,
        },
        nodeId,
        claimType: 'experiment_review',
    };
}

// =============================================================================
// ENQUEUE CRITIQUE
// =============================================================================

/**
 * Enqueue a critique review for a completed experiment.
 * Returns the queue entry ID, or null if enqueue failed.
 */
export async function enqueueCritique(
    nodeId: string,
    reviewSpec: ExperimentSpec,
    parentQueueId: number,
    chainDepth: number,
): Promise<number | null> {
    const { enqueue } = await import('./queue.js');

    const result = await enqueue(nodeId, {
        priority: 1, // Slightly elevated — critiques should run promptly
        queuedBy: 'autonomous',
        chainParentId: parentQueueId,
        chainDepth: chainDepth + 1,
        chainType: 'critique',
        chainSpec: JSON.stringify(reviewSpec),
    });

    if (result.success && result.entry) {
        emitActivity('lab', 'chain_critique_enqueued',
            `${nodeId.slice(0, 8)}: critique review enqueued (chain depth ${chainDepth + 1})`,
            { nodeId, queueId: result.entry.id, chainDepth: chainDepth + 1, parentQueueId });
        return result.entry.id;
    }
    return null;
}

// =============================================================================
// HANDLE CRITIQUE RESULT
// =============================================================================

/**
 * Process the critique lab's verdict on an experiment.
 *
 * Parses the structured decision from the critique result's details,
 * then applies the appropriate action:
 *   - confirm: apply original consequences
 *   - correct: apply corrected consequences
 *   - retest:  re-enqueue to original lab with guidance
 */
export async function handleCritiqueResult(
    nodeId: string,
    critiqueResult: LabResultResponse,
    parentExecutionId: string,
    queueEntryId: number,
    chainDepth: number,
): Promise<void> {
    const decision = parseCritiqueDecision(critiqueResult);

    emitActivity('lab', 'chain_critique_result',
        `${nodeId.slice(0, 8)}: critique says "${decision.action}" (methodology: ${decision.methodologyScore?.toFixed(2) ?? '?'})`,
        { nodeId, action: decision.action, methodologyScore: decision.methodologyScore,
          issues: decision.issues, chainDepth });

    // Fetch the original (parent) execution to get its verdict/confidence
    const parentExec: any = await queryOne(
        `SELECT id, claim_supported, confidence, spec, lab_id, lab_name, node_id
         FROM lab_executions WHERE id = $1`,
        [parentExecutionId],
    );

    if (!parentExec) {
        console.error(`[chaining] Parent execution ${parentExecutionId} not found -- clearing stuck pending_review`);
        // Don't leave the node stuck in pending_review forever
        await query(
            `UPDATE nodes SET verification_status = NULL, updated_at = datetime('now')
             WHERE id = $1 AND verification_status = 'pending_review'`,
            [nodeId],
        );
        emitActivity('lab', 'chain_orphaned',
            `${nodeId.slice(0, 8)}: parent execution ${parentExecutionId} not found -- cleared pending_review`,
            { nodeId, parentExecutionId });
        return;
    }

    switch (decision.action) {
        case 'confirm':
            await applyDeferredConsequences(
                parentExecutionId,
                nodeId,
                !!parentExec.claim_supported,
                parentExec.confidence ?? 0,
            );
            // Mark parent execution as confirmed
            await query(
                `UPDATE lab_executions SET chain_status = 'confirmed' WHERE id = $1`,
                [parentExecutionId],
            );
            emitActivity('lab', 'chain_confirmed',
                `${nodeId.slice(0, 8)}: critique confirmed original verdict`,
                { nodeId, parentExecutionId });
            break;

        case 'correct': {
            if (!decision.correctedVerdict || !['supported', 'refuted', 'inconclusive'].includes(decision.correctedVerdict)) {
                // Malformed correction -- treat as inconclusive rather than silently defaulting to refuted
                emitActivity('lab', 'chain_correction_malformed',
                    `${nodeId.slice(0, 8)}: critique returned action='correct' without valid correctedVerdict (got "${decision.correctedVerdict}") -- treating as inconclusive`,
                    { nodeId, parentExecutionId, rawVerdict: decision.correctedVerdict });
                decision.correctedVerdict = 'inconclusive';
            }
            const correctedSupported = decision.correctedVerdict === 'supported';
            const correctedConfidence = decision.correctedConfidence ?? 0.5;
            // Apply consequences with the corrected verdict
            await applyDeferredConsequences(
                parentExecutionId,
                nodeId,
                correctedSupported,
                correctedConfidence,
            );
            // Update parent execution with corrected verdict
            await query(
                `UPDATE lab_executions SET chain_status = 'corrected',
                 claim_supported = $1, confidence = $2
                 WHERE id = $3`,
                [correctedSupported ? 1 : 0, correctedConfidence, parentExecutionId],
            );
            // Update node verification results with correction
            await query(`
                UPDATE nodes SET
                    verification_status = 'completed',
                    verification_score = $1,
                    verification_results = json_set(
                        COALESCE(verification_results, '{}'),
                        '$.claimSupported', json($2),
                        '$.confidence', $1,
                        '$.correctedBy', 'critique-lab',
                        '$.correctionIssues', json($3)
                    ),
                    updated_at = datetime('now')
                WHERE id = $4
            `, [
                correctedConfidence,
                JSON.stringify(correctedSupported),
                JSON.stringify(decision.issues || []),
                nodeId,
            ]);

            // If the critique lab provided a rewritten claim, archive the original
            // and propose a corrected child node that inherits the same parents.
            if (decision.rewrittenClaim) {
                await proposeRewrittenClaim(
                    nodeId,
                    decision.rewrittenClaim,
                    decision.issues || [],
                    decision.critique,
                );
            }

            emitActivity('lab', 'chain_corrected',
                `${nodeId.slice(0, 8)}: critique corrected verdict to "${decision.correctedVerdict}" (was ${parentExec.claim_supported ? 'supported' : 'refuted'})${decision.rewrittenClaim ? ' — claim rewritten' : ''}`,
                { nodeId, parentExecutionId, correctedVerdict: decision.correctedVerdict,
                  correctedConfidence, issues: decision.issues, rewritten: !!decision.rewrittenClaim });
            break;
        }

        case 'retest': {
            const chainConfig = config.lab?.chaining;
            if (chainDepth + 1 >= (chainConfig?.maxChainDepth ?? 3)) {
                // Max depth reached — auto-confirm the original verdict
                emitActivity('lab', 'chain_max_depth',
                    `${nodeId.slice(0, 8)}: max chain depth reached — auto-confirming original verdict`,
                    { nodeId, chainDepth });
                await applyDeferredConsequences(
                    parentExecutionId, nodeId,
                    !!parentExec.claim_supported, parentExec.confidence ?? 0,
                );
                await query(
                    `UPDATE lab_executions SET chain_status = 'confirmed' WHERE id = $1`,
                    [parentExecutionId],
                );
                return;
            }

            // Mark parent as superseded
            await query(
                `UPDATE lab_executions SET chain_status = 'superseded' WHERE id = $1`,
                [parentExecutionId],
            );

            // Re-enqueue to the original lab with critique guidance
            const { enqueue } = await import('./queue.js');
            await enqueue(nodeId, {
                priority: 1,
                guidance: decision.guidance || decision.critique,
                queuedBy: 'autonomous',
                chainParentId: queueEntryId,
                chainDepth: chainDepth + 1,
                chainType: 'retest',
            });

            emitActivity('lab', 'chain_retest_enqueued',
                `${nodeId.slice(0, 8)}: critique requested retest (chain depth ${chainDepth + 1})`,
                { nodeId, chainDepth: chainDepth + 1, guidance: decision.guidance?.slice(0, 200) });
            break;
        }
    }
}

// =============================================================================
// APPLY DEFERRED CONSEQUENCES
// =============================================================================

/**
 * Apply the graph consequences (weight, taint, archive, cache invalidation)
 * that were deferred while waiting for critique review.
 */
export async function applyDeferredConsequences(
    executionId: string,
    nodeId: string,
    claimSupported: boolean,
    confidence: number,
): Promise<void> {
    const evmConfig = config.labVerify;

    // Fetch current node weight
    const node: any = await queryOne(
        'SELECT weight, domain FROM nodes WHERE id = $1',
        [nodeId],
    );
    if (!node) return;

    const weightBefore = node.weight;

    // Weight adjustment
    let weightDelta = 0;
    if (claimSupported) {
        weightDelta = evmConfig.weightBoostOnVerified * confidence;
    } else {
        weightDelta = evmConfig.weightPenaltyOnFailed * confidence;
    }

    if (weightDelta !== 0) {
        const weightCeiling = config.engine.weightCeiling ?? 3.0;
        const weightFloor = config.feedback?.weightFloor ?? 0.1;
        const newWeight = Math.max(weightFloor, Math.min(weightCeiling, weightBefore + weightDelta));

        await query(`UPDATE nodes SET weight = $1, verification_status = 'completed', updated_at = datetime('now') WHERE id = $2`,
            [newWeight, nodeId]);

        // Update execution record with final weight
        await query(
            `UPDATE lab_executions SET weight_after = $1 WHERE id = $2`,
            [newWeight, executionId],
        );

        await logDecision(
            'node', nodeId, 'weight',
            String(weightBefore), String(newWeight),
            'auto', 'evm:chain',
            `Chain-deferred: claim ${claimSupported ? 'supported' : 'disproved'} (confidence: ${confidence.toFixed(2)}, delta: ${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(3)})`,
        );

        emitActivity('system', 'evm_feedback',
            `EVM chain ${claimSupported ? 'SUPPORTED' : 'DISPROVED'}: weight ${weightBefore.toFixed(3)} → ${newWeight.toFixed(3)}`,
            { nodeId, claimSupported, confidence, weightDelta, deferred: true });
    } else {
        // Even if no weight change, update verification status
        await query(
            `UPDATE nodes SET verification_status = 'completed', updated_at = datetime('now') WHERE id = $1`,
            [nodeId],
        );
    }

    // Auto-archive disproved nodes
    if (!claimSupported) {
        const { maybeAutoArchiveDisproved } = await import('./feedback.js');
        await maybeAutoArchiveDisproved(nodeId, false, confidence, 'chain');
    }

    // Taint propagation
    if (!claimSupported) {
        try {
            if (config.lab?.taintOnRefute) {
                const { propagateTaint } = await import('../lab/taint.js');
                const tainted = await propagateTaint(nodeId, config.lab.taintMaxDepth ?? 5);
                if (tainted > 0) {
                    emitActivity('lab', 'taint_propagated',
                        `Tainted ${tainted} downstream node(s) from chain-refuted ${nodeId.slice(0, 8)}`,
                        { sourceNodeId: nodeId, taintedCount: tainted, deferred: true });
                }
            }
        } catch { /* non-fatal */ }
    }

    // Clear taint when supported
    if (claimSupported) {
        try {
            const { clearTaint } = await import('../lab/taint.js');
            const cleared = await clearTaint(nodeId);
            if (cleared > 0) {
                emitActivity('lab', 'taint_cleared',
                    `Cleared taint from ${cleared} node(s) — ${nodeId.slice(0, 8)} chain-supported`,
                    { sourceNodeId: nodeId, clearedCount: cleared, deferred: true });
            }
        } catch { /* non-fatal */ }
    }

    // Invalidate knowledge cache
    try {
        if (node.domain) {
            const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
            invalidateKnowledgeCache(node.domain);
        }
    } catch { /* non-fatal */ }
}

// =============================================================================
// PROPOSE REWRITTEN CLAIM
// =============================================================================

/**
 * Archive the original node and propose a corrected version that inherits
 * the same parents. The new node uses `supersedes` to create a clean audit
 * trail linking the correction to the original.
 *
 * The original node is archived (not deleted) so its verification history,
 * children, and provenance remain visible in the graph.
 */
async function proposeRewrittenClaim(
    originalNodeId: string,
    rewrittenContent: string,
    issues: string[],
    critique?: string,
): Promise<void> {
    // Fetch original node metadata
    const original: any = await queryOne(
        `SELECT id, content, domain, node_type, weight, contributor FROM nodes WHERE id = $1`,
        [originalNodeId],
    );
    if (!original) return;

    // Fetch original's parent IDs (the corrected node inherits the same sources)
    const parentEdges: any[] = await query(
        `SELECT source_id FROM edges WHERE target_id = $1 AND edge_type = 'parent'`,
        [originalNodeId],
    ) as any[];
    const parentIds = parentEdges.map((e: any) => e.source_id);

    // Propose the corrected node via the standard pipeline
    // (runs embedding, dedup, junk filter, etc.)
    try {
        const { handlePropose } = await import('../handlers/graph/propose.js');
        const result = await handlePropose({
            content: rewrittenContent,
            nodeType: original.node_type || 'voiced',
            domain: original.domain,
            parentIds,
            contributor: 'critique-lab:rewrite',
            supersedes: [originalNodeId],
            weight: original.weight,
        });

        if (result.success) {
            await logDecision(
                'node', originalNodeId, 'content', 'original', 'rewritten',
                'auto', 'critique-lab:rewrite',
                `Critique lab rewrote claim. Issues: ${issues.join('; ').slice(0, 300)}`,
            );
            const newNodeId = (result as any).id;
            emitActivity('lab', 'chain_claim_rewritten',
                `${originalNodeId.slice(0, 8)}: claim rewritten → ${newNodeId?.slice(0, 8)} (${issues.length} issue(s) corrected)`,
                { originalNodeId, newNodeId, issues, domain: original.domain });
        } else {
            // Proposal was rejected by validation pipeline (dedup, junk filter, etc.)
            // This is OK — the corrected verdict still applies to the original node.
            emitActivity('lab', 'chain_rewrite_rejected',
                `${originalNodeId.slice(0, 8)}: rewrite proposal rejected — ${result.reason?.slice(0, 100)}`,
                { originalNodeId, reason: result.reason });
        }
    } catch (e: any) {
        console.error(`[chaining] Failed to propose rewritten claim: ${e.message}`);
        emitActivity('lab', 'chain_rewrite_error',
            `${originalNodeId.slice(0, 8)}: rewrite failed — ${e.message}`,
            { originalNodeId, error: e.message });
    }
}

// =============================================================================
// PARSE CRITIQUE DECISION
// =============================================================================

/**
 * Extract a structured CritiqueDecision from the critique lab's response.
 *
 * Preferred path: the lab populates `structuredDetails` with a CritiqueDecision-shaped
 * object — this is the contract critique-lab now follows. We still accept the legacy
 * "JSON-as-string in `details`" shape because old rows in the wild and any
 * not-yet-updated lab will keep emitting it for a while.
 */
function parseCritiqueDecision(result: LabResultResponse): CritiqueDecision {
    // 1. Preferred — structured object straight from the lab
    const structured = result.structuredDetails as Partial<CritiqueDecision> | undefined;
    if (structured && typeof structured === 'object' && structured.action) {
        return structured as CritiqueDecision;
    }

    // 2. Legacy — `details` may be a JSON-encoded CritiqueDecision string
    if (result.details) {
        try {
            const parsed = JSON.parse(result.details);
            if (parsed.action) return parsed as CritiqueDecision;
        } catch {
            // Details might be a narrative string with embedded JSON
            const jsonMatch = result.details.match(/\{[\s\S]*?"action"\s*:\s*"[^"]+[\s\S]*?\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.action) return parsed as CritiqueDecision;
                } catch { /* fall through to verdict-based mapping */ }
            }
        }
    }

    // Fall back to verdict-based mapping
    switch (result.verdict) {
        case 'supported':
            return {
                action: 'confirm',
                methodologyScore: result.confidence,
                critique: result.details || 'Methodology confirmed',
            };
        case 'refuted':
            return {
                action: 'correct',
                correctedVerdict: 'inconclusive',
                correctedConfidence: Math.max(0.1, (result.confidence || 0.5) * 0.5),
                methodologyScore: 1 - (result.confidence || 0.5),
                issues: result.details ? [result.details] : ['Methodology flawed'],
                critique: result.details || 'Methodology rejected',
            };
        case 'inconclusive':
            return {
                action: 'retest',
                methodologyScore: 0.5,
                guidance: result.details || 'Retest with improved methodology',
                critique: result.details || 'Inconclusive — retest needed',
            };
        default:
            // not_testable, error — just confirm the original
            return {
                action: 'confirm',
                critique: result.details || `Critique returned ${result.verdict}`,
            };
    }
}
