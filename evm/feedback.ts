/**
 * EVM Feedback Loop — writes verification results to the graph.
 *
 * 1. Persists full execution record to lab_executions table
 * 2. Updates node's verification_status/score/results columns
 * 3. Adjusts node weight based on verification outcome
 * 4. Logs weight change via logDecision() for audit trail
 * 5. Invalidates knowledge cache for the affected domain
 *
 * Sub-modules:
 *   feedback-progress.ts — re-evaluation progress tracking
 *   feedback-query.ts    — verification history, review queue, stats, prune
 *   feedback-review.ts   — human approve/reject
 *   feedback-reeval.ts   — reevaluateStoredResults, reevaluateReviewQueue
 */

import { query, queryOne, logDecision } from '../core.js';
import { config } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import { generateUuid } from '../models/types.js';
import type { VerificationResult } from './types.js';
import { RC } from '../config/constants.js';

// Re-export everything from sub-modules so external consumers need no import changes.
export type { ReevalProgress } from './feedback-progress.js';
export { getReevalProgress, resetReevalProgress } from './feedback-progress.js';

export {
    getNodeVerifications,
    getRecentExecutions,
    recordAnalysis,
    getReviewQueue,
    getEVMStats,
    dismissNodeVerification,
    pruneOldExecutions,
} from './feedback-query.js';

export { approveReview, bulkApproveReview } from './feedback-review.js';

export { reevaluateStoredResults, reevaluateReviewQueue } from './feedback-reeval.js';

// =============================================================================
// AUTO-ARCHIVE DISPROVED NODES
// =============================================================================

/**
 * Archive a node that EVM has disproved with sufficient confidence.
 * Exempt: seeds, human contributors, KB-ingested nodes — these represent
 * foundational input that shouldn't be auto-removed by verification.
 *
 * @returns true if the node was archived
 */
export async function maybeAutoArchiveDisproved(
    nodeId: string,
    claimSupported: boolean,
    confidence: number,
    source: string,
): Promise<boolean> {
    const evmConfig = config.labVerify;
    if (claimSupported) return false;
    if (!evmConfig.autoArchiveOnDisproved) return false;
    if (confidence < evmConfig.autoArchiveConfidence) return false;

    // Fetch node metadata to check exemptions
    const node: any = await queryOne(
        'SELECT id, node_type, contributor, domain FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return false;

    // Exempt seeds, human contributors, KB-ingested nodes
    const isExempt = node.node_type === 'seed'
        || node.node_type === 'raw'
        || node.contributor?.startsWith('human')
        || node.contributor?.startsWith('kb:');
    if (isExempt) return false;

    await query('UPDATE nodes SET archived = 1 WHERE id = $1', [nodeId]);

    await logDecision(
        'node', nodeId, 'archived', 'false', 'true',
        'auto', `evm:auto-archive:${source}`,
        `Auto-archived: EVM disproved with confidence ${confidence.toFixed(2)} (threshold: ${evmConfig.autoArchiveConfidence})`,
    );

    emitActivity('system', 'evm_auto_archive',
        `Auto-archived disproved node ${nodeId.slice(0, 8)} (confidence: ${confidence.toFixed(2)})`,
        { nodeId, confidence, domain: node.domain, source },
    );

    // Invalidate knowledge cache for the domain
    try {
        if (node.domain) {
            const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
            invalidateKnowledgeCache(node.domain);
        }
    } catch { /* non-fatal */ }

    return true;
}

// =============================================================================
// CORE VERIFICATION RECORDING
// =============================================================================

/** Options for recordVerification — controls multi-claim behavior */
export interface RecordVerificationOptions {
    /** Skip weight adjustment (used when multi-claim aggregate handles weight) */
    skipWeightAdjust?: boolean;
    /** Claim index for multi-claim iteration (stored in lab_executions) */
    claimIndex?: number;
    /** Skip node verification column update (aggregate will do it) */
    skipNodeUpdate?: boolean;
    /** Lab job ID for traceability */
    labJobId?: string;
    /** Lab registry ID that ran the experiment */
    labId?: string;
    /** Lab name (denormalized for display — avoids cross-DB join to system.db) */
    labName?: string;
    /** Serialized ExperimentSpec JSON */
    spec?: string;
    /** Defer all graph consequences (weight, taint, archive) — used by lab chaining */
    deferConsequences?: boolean;
    /** Chain: execution ID of parent in the chain */
    chainParentExecutionId?: string;
    /** Chain: type of this chain step */
    chainType?: 'critique' | 'retest';
}

/**
 * Persist a verification result to lab_executions and update the node.
 *
 * 1. Inserts a full execution record to lab_executions
 * 2. Updates node verification_status/score/results (unless skipNodeUpdate)
 * 3. Adjusts node weight based on claimSupported and confidence (unless skipWeightAdjust)
 * 4. Invalidates knowledge cache for the affected domain
 *
 * @param result - The verification result to record
 * @param options - Multi-claim options: skipWeightAdjust, skipNodeUpdate, claimIndex
 */
export async function recordVerification(result: VerificationResult, options?: RecordVerificationOptions): Promise<void> {
    const evmConfig = config.labVerify;

    // 1. Insert execution record
    const execId = generateUuid();
    await query(`
        INSERT INTO lab_executions (
            id, node_id, status, hypothesis, code, evaluation_mode, claim_type, test_category,
            stdout, stderr, exit_code, execution_time_ms,
            verified, claim_supported, assertion_polarity, confidence, score,
            weight_before, weight_after, error, attempt, guidance, claim_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `, [
        execId,
        result.nodeId,
        result.status,
        result.codegen?.hypothesis ?? null,
        result.codegen?.code ?? null,
        result.codegen?.evaluationMode ?? null,
        result.codegen?.claimType ?? null,
        result.testCategory ?? null,
        result.sandbox?.stdout ?? null,
        result.sandbox?.stderr ?? null,
        result.sandbox?.exitCode ?? null,
        result.sandbox?.executionTimeMs ?? null,
        result.evaluation?.verified ? 1 : 0,
        result.evaluation?.claimSupported == null ? null : (result.evaluation.claimSupported ? 1 : 0),
        result.codegen?.assertionPolarity ?? 'positive',
        result.evaluation?.confidence ?? null,
        result.evaluation?.score ?? null,
        result.weightBefore ?? null,
        result.weightAfter ?? null,
        result.error ?? null,
        result.attempts ?? 1,
        result.guidance ?? null,
        options?.claimIndex ?? 0,
    ]);

    // 1b. Store traceability metadata (lab ID, job ID, name, spec, chain) if provided
    if (options?.labJobId || options?.labId || options?.spec || options?.labName || options?.chainParentExecutionId || options?.chainType) {
        try {
            await query(
                `UPDATE lab_executions SET lab_job_id = $1, lab_id = $2, spec = $3, lab_name = $4,
                 chain_parent_id = $5, chain_type = $6, chain_status = $7
                 WHERE id = $8`,
                [options?.labJobId ?? null, options?.labId ?? null, options?.spec ?? null, options?.labName ?? null,
                 options?.chainParentExecutionId ?? null, options?.chainType ?? null,
                 options?.deferConsequences ? 'pending_review' : null,
                 execId],
            );
        } catch (e: any) {
            console.error(`[evm] Traceability metadata update failed for ${execId}: ${e.message}`);
        }
    }

    // 1c. Build and store evidence items alongside the execution record
    try {
        const evidence: Array<{ type: string; label: string; data: string; mimeType?: string }> = [];
        if (result.sandbox?.stdout) evidence.push({ type: 'text', label: 'stdout', data: result.sandbox.stdout });
        if (result.sandbox?.stderr) evidence.push({ type: 'text', label: 'stderr', data: result.sandbox.stderr });
        if (evidence.length > 0) {
            await query(`UPDATE lab_executions SET evidence = $1 WHERE id = $2`, [JSON.stringify(evidence), execId]);
        }
    } catch { /* non-fatal — evidence is supplementary */ }

    // 2. Update node verification columns (skip when multi-claim aggregate will handle it)
    if (result.evaluation && !options?.skipNodeUpdate) {
        // When deferring consequences, set status to 'pending_review' so the node
        // stays visible as "awaiting critique" rather than showing the provisional verdict.
        const effectiveStatus = options?.deferConsequences ? 'pending_review' : result.status;
        await query(`
            UPDATE nodes SET
                verification_status = $1,
                verification_score = $2,
                verification_results = $3,
                updated_at = datetime('now')
            WHERE id = $4
        `, [
            effectiveStatus,
            result.evaluation.score,
            JSON.stringify({
                verified: result.evaluation.verified,
                claimSupported: result.evaluation.claimSupported,
                confidence: result.evaluation.confidence,
                mode: result.evaluation.mode,
                details: result.evaluation.details,
                // Optional structured payload (e.g. critique-lab decision fields)
                ...(result.evaluation.structuredDetails
                    ? { structuredDetails: result.evaluation.structuredDetails }
                    : {}),
                executionId: execId,
                completedAt: result.completedAt,
                ...(options?.deferConsequences ? { deferred: true } : {}),
            }),
            result.nodeId,
        ]);
    }

    // ── When consequences are deferred (lab chaining), skip weight/taint/archive ──
    // The chaining module will apply them after the critique lab confirms or corrects.
    if (options?.deferConsequences) {
        // Still invalidate knowledge cache (the node's verification status changed)
        try {
            const node: any = await queryOne('SELECT domain FROM nodes WHERE id = $1', [result.nodeId]);
            if (node?.domain) {
                const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
                invalidateKnowledgeCache(node.domain);
            }
        } catch { /* non-fatal */ }
        return;
    }

    // 3. Adjust node weight based on whether the ORIGINAL CLAIM is supported.
    // Only adjust on genuine test results (status='completed').
    // code_error, failed, skipped → no weight change.
    // INCONCLUSIVE → no weight change (the lab couldn't determine a verdict).
    // Uses claimSupported (not raw verified) — accounts for assertion polarity.
    const isInconclusive = (result.evaluation as any)?.inconclusive === true || result.evaluation?.claimSupported == null;
    if (!options?.skipWeightAdjust && result.evaluation && result.weightBefore != null && result.status === 'completed' && !isInconclusive) {
        let weightDelta = 0;
        if (result.evaluation.claimSupported) {
            weightDelta = evmConfig.weightBoostOnVerified * result.evaluation.confidence;
        } else {
            weightDelta = evmConfig.weightPenaltyOnFailed * result.evaluation.confidence;
        }

        if (weightDelta !== 0) {
            const weightCeiling = config.engine.weightCeiling ?? 3.0;
            const weightFloor = config.feedback?.weightFloor ?? 0.1;
            const newWeight = Math.max(weightFloor, Math.min(weightCeiling, result.weightBefore + weightDelta));

            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [newWeight, result.nodeId]);
            result.weightAfter = newWeight;
            // Persist weight_after to execution record for audit trail
            await query(`UPDATE lab_executions SET weight_after = $1 WHERE id = $2`, [newWeight, execId]);

            await logDecision(
                'node', result.nodeId, 'weight',
                String(result.weightBefore), String(newWeight),
                'auto', 'evm',
                `EVM claim ${result.evaluation.claimSupported ? 'supported' : 'disproved'} (confidence: ${result.evaluation.confidence.toFixed(2)}, delta: ${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(3)}, mode: ${result.evaluation.mode})`
            );

            emitActivity('system', 'evm_feedback',
                `EVM ${result.evaluation.claimSupported ? 'SUPPORTED' : 'DISPROVED'}: weight ${result.weightBefore.toFixed(3)} → ${newWeight.toFixed(3)}`,
                { nodeId: result.nodeId, claimSupported: result.evaluation.claimSupported, verified: result.evaluation.verified, confidence: result.evaluation.confidence, weightDelta }
            );
        }
    }

    // 4. Auto-archive disproved nodes (if enabled and above confidence threshold)
    // Skip for inconclusive — "I can't tell" is NOT a refutation
    // Skip unless status === 'completed' — failed/code_error/skipped runs are infrastructure
    // failures, not refutations, and must never archive nodes.
    if (!options?.skipWeightAdjust && result.evaluation && result.status === 'completed' && !result.evaluation.claimSupported && !isInconclusive) {
        await maybeAutoArchiveDisproved(result.nodeId, false, result.evaluation.confidence, 'single-claim');
    }

    // 4b. Lab taint propagation — mark downstream children as tainted when claim is refuted
    // Skip for inconclusive — taint should only propagate for genuine refutations
    // Skip unless status === 'completed' — infrastructure failures must not poison children.
    if (result.evaluation && result.status === 'completed' && !result.evaluation.claimSupported && !isInconclusive) {
        try {
            const labConfig = (await import('../config.js')).config;
            if (labConfig.lab?.taintOnRefute) {
                const { propagateTaint } = await import('../lab/taint.js');
                const tainted = await propagateTaint(result.nodeId, labConfig.lab.taintMaxDepth ?? 5);
                if (tainted > 0) {
                    emitActivity('lab', 'taint_propagated',
                        `Tainted ${tainted} downstream node(s) from refuted ${result.nodeId.slice(0, 8)}`,
                        { sourceNodeId: result.nodeId, taintedCount: tainted });
                }
            }
        } catch { /* non-fatal */ }
    }

    // 4c. Clear taint when a previously-refuted node is now supported
    if (result.evaluation?.claimSupported) {
        try {
            const { clearTaint } = await import('../lab/taint.js');
            const cleared = await clearTaint(result.nodeId);
            if (cleared > 0) {
                emitActivity('lab', 'taint_cleared',
                    `Cleared taint from ${cleared} node(s) — ${result.nodeId.slice(0, 8)} now supported`,
                    { sourceNodeId: result.nodeId, clearedCount: cleared });
            }
        } catch { /* non-fatal */ }
    }

    // 5. Invalidate knowledge cache for the node's domain
    try {
        const node: any = await queryOne('SELECT domain FROM nodes WHERE id = $1', [result.nodeId]);
        if (node?.domain) {
            const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
            invalidateKnowledgeCache(node.domain);
        }
    } catch {
        // Non-fatal — cache will refresh naturally
    }
}

/**
 * Record aggregate results for multi-claim verification.
 * Updates node verification columns and weight once based on combined outcome.
 * Called after all per-claim results have been recorded individually.
 *
 * @param nodeId - UUID of the verified node
 * @param aggregate - Aggregated verification result from aggregateClaimResults()
 */
export async function recordMultiClaimAggregate(
    nodeId: string,
    aggregate: VerificationResult,
): Promise<void> {
    const evmConfig = config.labVerify;

    if (aggregate.evaluation) {
        await query(`
            UPDATE nodes SET
                verification_status = $1,
                verification_score = $2,
                verification_results = $3,
                updated_at = datetime('now')
            WHERE id = $4
        `, [
            aggregate.status,
            aggregate.evaluation.score,
            JSON.stringify({
                multiClaim: true,
                claimsTotal: aggregate.claimsTotal,
                claimsVerified: aggregate.claimsVerified,
                claimSupported: aggregate.evaluation.claimSupported,
                confidence: aggregate.evaluation.confidence,
                details: aggregate.evaluation.details,
                ...(aggregate.evaluation.structuredDetails
                    ? { structuredDetails: aggregate.evaluation.structuredDetails }
                    : {}),
                completedAt: aggregate.completedAt,
            }),
            nodeId,
        ]);
    }

    if (aggregate.evaluation && aggregate.weightBefore != null && aggregate.status === 'completed') {
        let weightDelta = 0;
        if (aggregate.evaluation.claimSupported) {
            weightDelta = evmConfig.weightBoostOnVerified * aggregate.evaluation.confidence;
        } else {
            weightDelta = evmConfig.weightPenaltyOnFailed * aggregate.evaluation.confidence;
        }

        if (weightDelta !== 0) {
            const weightCeiling = config.engine.weightCeiling ?? 3.0;
            const weightFloor = config.feedback?.weightFloor ?? 0.1;
            const newWeight = Math.max(weightFloor, Math.min(weightCeiling, aggregate.weightBefore + weightDelta));

            await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [newWeight, nodeId]);
            aggregate.weightAfter = newWeight;

            await logDecision(
                'node', nodeId, 'weight',
                String(aggregate.weightBefore), String(newWeight),
                'auto', 'evm:multi-claim',
                `EVM multi-claim ${aggregate.evaluation.claimSupported ? 'supported' : 'disproved'} (${aggregate.claimsVerified}/${aggregate.claimsTotal} claims, confidence: ${aggregate.evaluation.confidence.toFixed(2)}, delta: ${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(3)})`
            );

            emitActivity('system', 'evm_feedback',
                `EVM multi-claim ${aggregate.evaluation.claimSupported ? 'SUPPORTED' : 'DISPROVED'}: weight ${aggregate.weightBefore.toFixed(3)} → ${newWeight.toFixed(3)} (${aggregate.claimsVerified} claims)`,
                { nodeId, claimSupported: aggregate.evaluation.claimSupported, confidence: aggregate.evaluation.confidence, weightDelta, claimsTotal: aggregate.claimsTotal, claimsVerified: aggregate.claimsVerified }
            );
        }
    }

    // Auto-archive disproved nodes (multi-claim)
    // Only on genuine completion — infrastructure failures must not archive nodes.
    if (aggregate.evaluation && aggregate.status === 'completed' && !aggregate.evaluation.claimSupported) {
        await maybeAutoArchiveDisproved(nodeId, false, aggregate.evaluation.confidence, 'multi-claim');
    }

    // Lab taint propagation for multi-claim refutations
    // Only on genuine completion — infrastructure failures must not poison downstream children.
    if (aggregate.evaluation && aggregate.status === 'completed' && !aggregate.evaluation.claimSupported) {
        try {
            const labConfig = (await import('../config.js')).config;
            if (labConfig.lab?.taintOnRefute) {
                const { propagateTaint } = await import('../lab/taint.js');
                const tainted = await propagateTaint(nodeId, labConfig.lab.taintMaxDepth ?? 5);
                if (tainted > 0) {
                    emitActivity('lab', 'taint_propagated',
                        `Tainted ${tainted} downstream node(s) from refuted ${nodeId.slice(0, 8)}`,
                        { sourceNodeId: nodeId, taintedCount: tainted });
                }
            }
        } catch { /* non-fatal */ }
    }

    // Clear taint when multi-claim re-verification supports
    if (aggregate.evaluation?.claimSupported) {
        try {
            const { clearTaint } = await import('../lab/taint.js');
            const cleared = await clearTaint(nodeId);
            if (cleared > 0) {
                emitActivity('lab', 'taint_cleared',
                    `Cleared taint from ${cleared} node(s) — ${nodeId.slice(0, 8)} now supported`,
                    { sourceNodeId: nodeId, clearedCount: cleared });
            }
        } catch { /* non-fatal */ }
    }

    // Invalidate knowledge cache
    try {
        const node: any = await queryOne('SELECT domain FROM nodes WHERE id = $1', [nodeId]);
        if (node?.domain) {
            const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
            invalidateKnowledgeCache(node.domain);
        }
    } catch {
        // Non-fatal
    }
}
