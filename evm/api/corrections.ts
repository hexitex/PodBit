/**
 * API Verification Corrections — updates placeholder database and node breeding flags.
 *
 * Three outcomes:
 * - value_correction: UPDATE number_registry.value, small fitness penalty
 * - structural_validation: fitness boost, breeds with confidence
 * - structural_refutation: breedable = 0, severe fitness penalty
 */

import { query, queryOne } from '../../core.js';
import { logDecision } from '../../core/governance.js';
import { config as appConfig } from '../../config.js';
import { emitActivity } from '../../services/event-bus.js';
import type { ApiCorrection, VerificationImpact } from './types.js';

// =============================================================================
// APPLY CORRECTIONS — update number_registry for value_correction
// =============================================================================

export interface CorrectionResult {
    applied: number;
    skipped: number;
    details: Array<{
        varId: string;
        oldValue: string;
        newValue: string;
        applied: boolean;
        reason: string;
    }>;
}

/**
 * Applies value corrections to the number_registry and logs decisions.
 * Skips corrections that are low-confidence, missing var IDs, not found
 * in the registry, or already matching the new value.
 *
 * @param _nodeId - Node ID (unused; corrections are keyed by varId)
 * @param corrections - Array of corrections from API interpretation
 * @param minConfidence - Minimum confidence threshold to apply a correction
 * @returns CorrectionResult with applied/skipped counts and per-correction details
 */
export async function applyCorrections(
    _nodeId: string,
    corrections: ApiCorrection[],
    minConfidence: number,
): Promise<CorrectionResult> {
    const result: CorrectionResult = { applied: 0, skipped: 0, details: [] };

    for (const correction of corrections) {
        if (!correction.varId) {
            result.skipped++;
            result.details.push({
                varId: '',
                oldValue: correction.oldValue,
                newValue: correction.newValue,
                applied: false,
                reason: 'No variable ID specified',
            });
            continue;
        }

        if (correction.confidence < minConfidence) {
            result.skipped++;
            result.details.push({
                varId: correction.varId,
                oldValue: correction.oldValue,
                newValue: correction.newValue,
                applied: false,
                reason: `Confidence ${correction.confidence} below threshold ${minConfidence}`,
            });
            continue;
        }

        // Look up the variable in the registry
        const existing = await queryOne(
            'SELECT var_id, value, source_node_id, domain FROM number_registry WHERE var_id = $1',
            [correction.varId],
        );

        if (!existing) {
            result.skipped++;
            result.details.push({
                varId: correction.varId,
                oldValue: correction.oldValue,
                newValue: correction.newValue,
                applied: false,
                reason: `Variable ${correction.varId} not found in registry`,
            });
            continue;
        }

        // Only update if the value actually changed
        if (existing.value === correction.newValue) {
            result.skipped++;
            result.details.push({
                varId: correction.varId,
                oldValue: existing.value,
                newValue: correction.newValue,
                applied: false,
                reason: 'Value already matches',
            });
            continue;
        }

        // UPDATE the placeholder database
        await query(
            'UPDATE number_registry SET value = $1 WHERE var_id = $2',
            [correction.newValue, correction.varId],
        );

        // Audit trail
        await logDecision(
            'variable', correction.varId, 'value',
            existing.value, correction.newValue,
            'auto', 'evm:api',
            `API correction (confidence: ${correction.confidence}, source: ${correction.source})`,
        );

        result.applied++;
        result.details.push({
            varId: correction.varId,
            oldValue: existing.value,
            newValue: correction.newValue,
            applied: true,
            reason: `Updated from ${existing.value} to ${correction.newValue}`,
        });
    }

    return result;
}

// =============================================================================
// APPLY IMPACT — fitness adjustments + breedable flag
// =============================================================================

/**
 * Updates node weight and verification_impact based on the API verification outcome.
 *
 * - value_correction: small penalty per correction applied
 * - structural_validation: weight boost
 * - structural_refutation: heavy weight penalty (but node remains breedable)
 * - inconclusive: no weight change
 *
 * @param nodeId - UUID of the node to update
 * @param impact - Verification impact classification
 * @param correctionsApplied - Number of value corrections applied (scales penalty)
 * @returns Weight before/after and breedable flag (always true)
 * @throws Error if node not found
 */
export async function applyVerificationImpact(
    nodeId: string,
    impact: VerificationImpact,
    correctionsApplied: number,
): Promise<{ weightBefore: number; weightAfter: number; breedable: boolean }> {
    const evmCfg = appConfig.labVerify.apiVerification;
    const feedbackCfg = appConfig.feedback;
    const weightFloor = feedbackCfg?.weightFloor ?? 0.1;
    const weightCeiling = appConfig.engine?.weightCeiling ?? 3.0;

    // Get current weight
    const node = await queryOne('SELECT weight, breedable FROM nodes WHERE id = $1', [nodeId]);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const weightBefore = node.weight;
    let weightDelta = 0;
    const breedable = true;

    switch (impact) {
        case 'value_correction':
            weightDelta = evmCfg.correctionPenalty * correctionsApplied;
            break;

        case 'structural_validation':
            weightDelta = evmCfg.validationBoost;
            break;

        case 'structural_refutation':
            // Refutation applies a heavy weight penalty but does NOT kill breedability.
            // This is a discovery engine — a refuted factual claim in a synthesis node
            // doesn't invalidate the entire insight. The weight penalty reduces its
            // selection priority, but the node can still participate in synthesis
            // where its non-refuted aspects may combine with other knowledge.
            weightDelta = evmCfg.refutationPenalty;
            // breedable stays true — let the weight system handle selection pressure
            break;

        case 'inconclusive':
            // API was consulted but couldn't determine outcome — no weight change.
            weightDelta = 0;
            break;
    }

    const weightAfter = Math.max(weightFloor, Math.min(weightCeiling, weightBefore + weightDelta));

    // Apply to node — weight penalty only, breedable stays unchanged.
    // The weight system provides selection pressure; breedable is reserved
    // for truly broken nodes (e.g., corrupted content), not factual disputes.
    await query(
        `UPDATE nodes SET
            weight = $1,
            verification_impact = $2,
            updated_at = datetime('now')
        WHERE id = $3`,
        [weightAfter, impact, nodeId],
    );

    // Audit trail
    const impactLabel = impact === 'structural_refutation' ? 'refuted (weight penalty only)'
        : impact === 'value_correction' ? `value corrected (${correctionsApplied} fixes)`
        : 'structurally validated';
    await logDecision(
        'node', nodeId, 'weight',
        String(weightBefore), String(weightAfter),
        'auto', 'evm:api',
        `API verification: ${impactLabel}`,
    );

    if (impact === 'structural_refutation') {
        emitActivity('api', 'api_refutation',
            `Node ${nodeId.slice(0, 8)} refuted by API — weight ${weightBefore.toFixed(3)} → ${weightAfter.toFixed(3)} (still breedable)`,
            { nodeId, impact, weightBefore, weightAfter },
        );
    }

    return { weightBefore, weightAfter, breedable };
}
