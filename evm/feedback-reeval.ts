/**
 * EVM Feedback — Re-evaluation of stored and queued results.
 *
 * Two distinct operations:
 *   reevaluateStoredResults  — re-run evaluateResult() against stored stdout,
 *                              update verdicts/weights where they changed.
 *   reevaluateReviewQueue    — phase1: re-apply auto-approve thresholds;
 *                              phase2 (optional): re-run LLM evaluation.
 *
 * Both write to _reevalProgress (imported by reference from feedback-progress.ts)
 * so the progress can be polled externally while a run is in flight.
 */

import { query, logDecision } from '../core.js';
import { config } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import { evaluateResult } from './eval-utils.js';
import { _reevalProgress, _markDirty, resetReevalProgress } from './feedback-progress.js';
import type { EvaluationMode, AssertionPolarity } from './types.js';

// =============================================================================
// REEVALUATE STORED RESULTS
// =============================================================================

/**
 * Re-evaluate all completed verifications using the current evaluator logic.
 *
 * Reads stored stdout (raw sandbox JSON) from lab_executions, re-runs
 * evaluateResult(), and updates verdicts/weights where they changed.
 * Useful after evaluator logic changes to retroactively correct verdicts.
 *
 * @param options - Re-evaluation options:
 *   - dryRun: report changes without applying them (default: false)
 *   - nodeId: optional node UUID to re-evaluate only that node's executions
 * @returns Summary with total, reprocessed, changed, skipped, errors, and change details
 */
export async function reevaluateStoredResults(options: {
    dryRun?: boolean;
    nodeId?: string;
} = {}): Promise<{
    total: number;
    reprocessed: number;
    changed: number;
    skipped: number;
    errors: number;
    changes: Array<{
        executionId: string;
        nodeId: string;
        oldVerified: boolean;
        newVerified: boolean;
        oldClaimSupported: boolean;
        newClaimSupported: boolean;
        oldConfidence: number;
        newConfidence: number;
        oldWeight: number | null;
        newWeight: number | null;
    }>;
}> {
    const dryRun = options.dryRun ?? false;
    const evmConfig = config.labVerify;

    const conditions = [`e.status = 'completed'`, `e.stdout IS NOT NULL`, `e.stdout != ''`];
    const params: any[] = [];

    if (options.nodeId) {
        conditions.push(`e.node_id = $1`);
        params.push(options.nodeId);
    }

    const rows: any[] = await query(`
        SELECT e.*, n.weight as current_weight, n.domain as node_domain
        FROM lab_executions e
        LEFT JOIN nodes n ON n.id = e.node_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.created_at DESC
    `, params) as any[];

    const result = {
        total: rows.length,
        reprocessed: 0,
        changed: 0,
        skipped: 0,
        errors: 0,
        changes: [] as any[],
    };

    for (const row of rows) {
        try {
            let parsedOutput: any;
            try {
                parsedOutput = JSON.parse(row.stdout.trim());
            } catch {
                result.skipped++;
                continue;
            }

            const sandbox = {
                success: true,
                stdout: row.stdout,
                stderr: row.stderr || '',
                exitCode: row.exit_code ?? 0,
                executionTimeMs: row.execution_time_ms ?? 0,
                killed: false,
                parsedOutput,
            };

            const mode: EvaluationMode = row.evaluation_mode || 'boolean';
            const polarity: AssertionPolarity = (row.assertion_polarity as AssertionPolarity) || 'positive';

            const newEval = evaluateResult(sandbox, mode, '', polarity);

            const oldVerified = !!row.verified;
            const oldClaimSupported = !!row.claim_supported;

            result.reprocessed++;

            if (
                newEval.verified !== oldVerified ||
                newEval.claimSupported !== oldClaimSupported ||
                Math.abs((newEval.confidence ?? 0) - (row.confidence ?? 0)) > 0.05
            ) {
                result.changed++;

                const change: any = {
                    executionId: row.id,
                    nodeId: row.node_id,
                    oldVerified,
                    newVerified: newEval.verified,
                    oldClaimSupported,
                    newClaimSupported: newEval.claimSupported,
                    oldConfidence: row.confidence ?? 0,
                    newConfidence: newEval.confidence,
                    oldWeight: null,
                    newWeight: null,
                };

                if (!dryRun) {
                    await query(`
                        UPDATE lab_executions SET
                            verified = $1,
                            claim_supported = $2,
                            confidence = $3,
                            score = $4
                        WHERE id = $5
                    `, [
                        newEval.verified ? 1 : 0,
                        newEval.claimSupported ? 1 : 0,
                        newEval.confidence,
                        newEval.score,
                        row.id,
                    ]);

                    await query(`
                        UPDATE nodes SET
                            verification_score = $1,
                            verification_results = $2,
                            updated_at = datetime('now')
                        WHERE id = $3
                    `, [
                        newEval.score,
                        JSON.stringify({
                            verified: newEval.verified,
                            claimSupported: newEval.claimSupported,
                            confidence: newEval.confidence,
                            mode: newEval.mode,
                            details: newEval.details,
                            executionId: row.id,
                            reevaluatedAt: new Date().toISOString(),
                        }),
                        row.node_id,
                    ]);

                    // Recalculate weight only if claim support verdict flipped
                    if (newEval.claimSupported !== oldClaimSupported && row.weight_before != null) {
                        let weightDelta = 0;
                        if (newEval.claimSupported) {
                            weightDelta = evmConfig.weightBoostOnVerified * newEval.confidence;
                        } else {
                            weightDelta = evmConfig.weightPenaltyOnFailed * newEval.confidence;
                        }

                        const weightCeiling = config.engine.weightCeiling ?? 3.0;
                        const weightFloor = config.feedback?.weightFloor ?? 0.1;
                        const newWeight = Math.max(weightFloor, Math.min(weightCeiling, row.weight_before + weightDelta));

                        change.oldWeight = row.current_weight;
                        change.newWeight = newWeight;

                        await query(`UPDATE nodes SET weight = $1 WHERE id = $2`, [newWeight, row.node_id]);
                        await query(`UPDATE lab_executions SET weight_after = $1 WHERE id = $2`, [newWeight, row.id]);

                        await logDecision(
                            'node', row.node_id, 'weight',
                            String(row.current_weight), String(newWeight),
                            'auto', 'evm:reevaluate',
                            `Re-evaluated: claim ${newEval.claimSupported ? 'now SUPPORTED' : 'now DISPROVED'} ` +
                            `(was ${oldClaimSupported ? 'supported' : 'disproved'}, ` +
                            `confidence: ${(row.confidence ?? 0).toFixed(2)} → ${newEval.confidence.toFixed(2)}, ` +
                            `mode: ${newEval.mode})`
                        );
                    }
                }

                result.changes.push(change);
            }
        } catch {
            result.errors++;
        }
    }

    if (!dryRun && result.changed > 0) {
        emitActivity('system', 'evm_reevaluate',
            `Re-evaluated ${result.reprocessed} verifications: ${result.changed} verdicts changed`,
            { total: result.total, reprocessed: result.reprocessed, changed: result.changed, errors: result.errors }
        );
    }

    return result;
}

// =============================================================================
// REEVALUATE REVIEW QUEUE
// =============================================================================

/**
 * Re-evaluate review queue items (needs_review / needs_expert).
 *
 * Phase 1 (cheap): Re-apply auto-approve logic with current config thresholds.
 *   Items that now meet the auto-approve criteria are promoted to 'completed'.
 * Phase 2 (if rerunLLM=true): Re-run evaluateWithLLM() on remaining items
 *   that were not auto-approved in phase 1.
 *
 * Progress is tracked via _reevalProgress and flushed to the settings table
 * so it can be polled from the GUI.
 *
 * @param options - Re-evaluation options:
 *   - rerunLLM: run phase 2 LLM re-evaluation on remaining items
 *   - nodeId: optional node UUID to re-evaluate only that node
 * @returns Summary with totals, auto-approved counts, and per-item details
 * @throws Error if a re-evaluation is already running
 */
export async function reevaluateReviewQueue(options: {
    rerunLLM?: boolean;
    nodeId?: string;
} = {}): Promise<{
    total: number;
    autoApproved: number;
    rerunned: number;
    rerunAutoApproved: number;
    unchanged: number;
    errors: number;
    details: Array<{
        nodeId: string;
        phase: 'reapply' | 'rerun';
        oldStatus: string;
        newStatus: string;
        verdict: string;
        confidence: number;
        weightChange: boolean;
    }>;
}> {
    if (_reevalProgress.status === 'running') {
        throw new Error('Re-evaluation already running');
    }

    await resetReevalProgress();
    _reevalProgress.status = 'running';
    _reevalProgress.startedAt = new Date().toISOString();
    _markDirty();

    try {
        return await _reevaluateReviewQueueInner(options);
    } catch (err: any) {
        _reevalProgress.status = 'error';
        _reevalProgress.errorMessage = err.message;
        _reevalProgress.finishedAt = new Date().toISOString();
        _markDirty();
        // Ensure final error state is flushed before rethrowing
        try {
            await query(
                `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
                 ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
                ['evm.reeval_progress', JSON.stringify(_reevalProgress)],
            );
        } catch { /* non-fatal */ }
        throw err;
    }
}

/** Inner implementation: reapply auto-approve then optionally rerun LLM eval on remaining items. */
async function _reevaluateReviewQueueInner(options: {
    rerunLLM?: boolean;
    nodeId?: string;
}): Promise<ReturnType<typeof reevaluateReviewQueue>> {
    const evmCycleConfig = config.autonomousCycles?.evm ?? {} as any;
    const autoThreshold = evmCycleConfig.autoApproveThreshold ?? 0.8;
    const autoVerdicts: string[] = evmCycleConfig.autoApproveVerdicts ?? ['supported', 'unsupported'];

    const conditions = [`n.verification_status IN ('needs_review', 'needs_expert')`, `n.archived = 0`];
    const params: any[] = [];

    if (options.nodeId) {
        conditions.push(`n.id = $1`);
        params.push(options.nodeId);
    }

    const rows: any[] = await query(`
        SELECT n.id, n.weight, n.domain, n.verification_status,
               e.id as exec_id, e.hypothesis, e.confidence, e.test_category,
               e.weight_before, e.weight_after, e.code as reasoning
        FROM nodes n
        LEFT JOIN lab_executions e ON e.node_id = n.id
            AND e.created_at = (SELECT MAX(e2.created_at) FROM lab_executions e2 WHERE e2.node_id = n.id)
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.created_at DESC
    `, params) as any[];

    _reevalProgress.total = rows.length;
    _reevalProgress.phase = 1;
    _markDirty();

    const result = {
        total: rows.length,
        autoApproved: 0,
        rerunned: 0,
        rerunAutoApproved: 0,
        unchanged: 0,
        errors: 0,
        details: [] as any[],
    };

    emitActivity('system', 'evm_reevaluate_reviews',
        `Re-evaluate started: ${rows.length} review items (threshold: ${autoThreshold}, rerunLLM: ${!!options.rerunLLM})`,
        { total: rows.length, autoThreshold, rerunLLM: !!options.rerunLLM });

    // Phase 1: Re-apply auto-approve with current thresholds
    const stillPending: any[] = [];

    for (const row of rows) {
        try {
            // Extract verdict from stored hypothesis (format: "[prefix] verdict — reviewFocus" or "verdict — reviewFocus")
            const rawVerdict = row.hypothesis?.split(' — ')[0]?.trim() || '';
            const storedVerdict = rawVerdict.replace(/^\[[^\]]*\]\s*/, '');
            const confidence = row.confidence ?? 0;

            const canAutoApprove = confidence >= autoThreshold
                && autoVerdicts.includes(storedVerdict)
                && storedVerdict !== 'uncertain';

            if (canAutoApprove) {
                const isSupported = storedVerdict === 'supported';
                const finalWeight = isSupported && row.weight_after != null ? row.weight_after : row.weight;

                await query(`UPDATE nodes SET verification_status = 'completed', weight = $1 WHERE id = $2`,
                    [finalWeight, row.id]);

                if (row.exec_id) {
                    await query(`UPDATE lab_executions SET status = 'completed' WHERE id = $1`, [row.exec_id]);
                }

                if (finalWeight !== row.weight) {
                    await logDecision(
                        'node', row.id, 'weight',
                        String(row.weight), String(finalWeight),
                        'auto', 'evm:reevaluate-reviews',
                        `Review re-evaluated: ${storedVerdict} (confidence: ${confidence.toFixed(2)}) — auto-approved with current thresholds`,
                    );
                }
                await logDecision(
                    'node', row.id, 'verification_status',
                    row.verification_status, 'completed',
                    'auto', 'evm:reevaluate-reviews',
                    `Auto-approved on re-evaluation (verdict: ${storedVerdict}, confidence: ${confidence.toFixed(2)})`,
                );

                result.autoApproved++;
                _reevalProgress.autoApproved = result.autoApproved;
                result.details.push({
                    nodeId: row.id,
                    phase: 'reapply',
                    oldStatus: row.verification_status,
                    newStatus: 'completed',
                    verdict: storedVerdict,
                    confidence,
                    weightChange: finalWeight !== row.weight,
                });
            } else {
                stillPending.push(row);
            }
        } catch {
            result.errors++;
            _reevalProgress.errors = result.errors;
        }
    }

    // Phase 2 (LLM re-evaluation) removed — LLM eval is now handled by lab servers.
    // Remaining review items stay unchanged.
    result.unchanged = stillPending.length;
    _reevalProgress.unchanged = result.unchanged;

    if (result.autoApproved > 0 || result.rerunAutoApproved > 0) {
        emitActivity('system', 'evm_reevaluate_reviews',
            `Re-evaluated ${result.total} review items: ${result.autoApproved} auto-approved (threshold), ${result.rerunAutoApproved} auto-approved (LLM rerun), ${result.unchanged} unchanged`,
            { total: result.total, autoApproved: result.autoApproved, rerunned: result.rerunned, rerunAutoApproved: result.rerunAutoApproved, unchanged: result.unchanged, errors: result.errors }
        );
    }

    _reevalProgress.status = 'done';
    _reevalProgress.finishedAt = new Date().toISOString();
    _markDirty();
    // Final flush
    try {
        await query(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
            ['evm.reeval_progress', JSON.stringify(_reevalProgress)],
        );
    } catch { /* non-fatal */ }

    return result;
}
