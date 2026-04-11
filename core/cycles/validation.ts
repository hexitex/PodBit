/**
 * @module core/cycles/validation
 *
 * Autonomous Validation Cycle.
 *
 * Picks unvalidated synthesis/voiced nodes and runs breakthrough validation
 * scoring. Nodes meeting the composite threshold pass through optional
 * novelty gate (frontier model skeptical check) and EVM hallucination gate
 * before being promoted to "possible" breakthrough status.
 */

import { query, queryOne } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { validateBreakthrough, runNoveltyGate } from '../validation.js';
import { logDecision, getExcludedDomainsForCycle } from '../governance.js';
import { emitActivity, nodeLabel } from '../../services/event-bus.js';
import type { ResonanceNode } from '../types.js';

/**
 * One tick of the validation cycle: picks one unvalidated voiced/synthesis node,
 * runs breakthrough validation scoring, and optionally applies novelty and EVM gates.
 *
 * Pipeline (for nodes meeting composite threshold):
 * 1. Score via `validateBreakthrough` (synthesis/novelty/testability/tension_resolution)
 * 2. Gate 2: Novelty gate (frontier model skeptical check, fail-open)
 * 3. Gate 3: EVM hallucination check (codegen + sandbox, fail-open)
 * 4. If all gates pass, promote node_type to "possible"
 *
 * Each outcome (promoted, blocked, below-threshold) is logged to `dream_cycles`
 * for audit trail.
 *
 * @returns Resolves when the tick completes
 */
async function runValidationCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.validation;

    // Find ONE highest-weight unvalidated candidate per cycle.
    // This ensures validation uses exactly one LLM call per tick,
    // same as questions/tensions, preventing it from starving other cycles.
    const allCandidates = await query(`
        SELECT n.id, n.content, n.weight, n.domain, n.node_type, n.specificity, n.embedding
        FROM nodes n
        WHERE n.archived = FALSE
          AND n.lab_status IS NULL
          AND n.weight >= $1
          AND n.node_type IN ('synthesis', 'voiced')
          AND n.validated_at IS NULL
        ORDER BY n.weight DESC
        LIMIT 5
    `, [cfg.minWeightThreshold]);

    // Filter out domains excluded from the validation cycle, then take top 1
    const excludedDomains = await getExcludedDomainsForCycle('validation');
    const candidates = excludedDomains.size > 0
        ? allCandidates.filter((n: any) => !n.domain || !excludedDomains.has(n.domain)).slice(0, 1)
        : allCandidates.slice(0, 1);

    if (candidates.length === 0) return;

    const candidate = candidates[0] as ResonanceNode;

    // Get source/parent nodes for context
    const parents = await query(`
        SELECT n.id, n.content, n.weight, n.domain, n.node_type, n.specificity
        FROM edges e JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.archived = FALSE AND n.lab_status IS NULL
    `, [candidate.id]);

    const result = await validateBreakthrough(candidate, parents as ResonanceNode[]);

    if (result.error) {
        console.error(`[validation] Error validating ${candidate.id.slice(0, 8)}: ${result.error}`);
        emitActivity('cycle', 'validation_error', `Validation error: ${nodeLabel(candidate.id, candidate.content)} — ${result.error}`);
        return;
    }

    const composite = result.composite ?? 0;
    console.error(`[validation] ${candidate.id.slice(0, 8)}: composite=${composite.toFixed(1)} (threshold: ${cfg.minCompositeForPromotion})`);
    emitActivity('cycle', 'validation_scored', `Validated ${nodeLabel(candidate.id, candidate.content)}: composite=${composite.toFixed(1)} (threshold: ${cfg.minCompositeForPromotion})`, { nodeId: candidate.id, composite, threshold: cfg.minCompositeForPromotion, domain: candidate.domain, promoted: composite >= cfg.minCompositeForPromotion });

    if (composite >= cfg.minCompositeForPromotion) {
        // ── Gate 2: Novelty gate (frontier model skeptical check) ──
        const valConfig = appConfig.validation;
        let noveltyGateResult: any = null;

        if (valConfig.noveltyGateEnabled) {
            try {
                noveltyGateResult = await runNoveltyGate(candidate, parents as ResonanceNode[]);

                if (noveltyGateResult.skipped) {
                    console.error(`[validation] Novelty gate skipped for ${candidate.id.slice(0, 8)}: ${noveltyGateResult.skipReason}`);
                } else if (!noveltyGateResult.novel) {
                    // Blocked by novelty gate — not genuinely novel
                    console.error(`[validation] → ${candidate.id.slice(0, 8)} BLOCKED by novelty gate (confidence: ${noveltyGateResult.confidence?.toFixed(2)}): ${noveltyGateResult.reasoning}`);
                    emitActivity('cycle', 'validation_blocked', `Blocked by novelty gate: ${nodeLabel(candidate.id, candidate.content)} — ${noveltyGateResult.reasoning}`, { nodeId: candidate.id, composite, gate: 'novelty', confidence: noveltyGateResult.confidence, domain: candidate.domain });

                    // Log to dream_cycles and return — do not promote
                    await queryOne(`
                        INSERT INTO dream_cycles (
                            node_a_id, resonance_score, threshold_used,
                            created_child, parameters, domain, completed_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
                    `, [
                        candidate.id, composite, cfg.minCompositeForPromotion, 0,
                        JSON.stringify({
                            validation_type: 'autonomous_validation',
                            blocked_by: 'novelty_gate',
                            noveltyGate: noveltyGateResult,
                            ...result,
                        }),
                        candidate.domain,
                    ]);
                    return;
                } else {
                    console.error(`[validation] Novelty gate PASSED for ${candidate.id.slice(0, 8)} (confidence: ${noveltyGateResult.confidence?.toFixed(2)})`);
                }
            } catch (err: any) {
                console.error(`[validation] Novelty gate error (fail-open): ${err.message}`);
                noveltyGateResult = { novel: true, skipped: true, skipReason: 'error', reasoning: err.message };
            }
        }

        // ── Gate 3: EVM hallucination check ──
        let evmGateResult: any = null;

        if (valConfig.evmGateEnabled && appConfig.labVerify.enabled) {
            try {
                const { getAssignedModel } = await import('../../models/assignments.js');
                const evmAssigned = getAssignedModel('evm_codegen' as any);

                if (!evmAssigned) {
                    console.error(`[validation] EVM gate skipped for ${candidate.id.slice(0, 8)}: evm_codegen unassigned`);
                    evmGateResult = { skipped: true, skipReason: 'unassigned' };
                } else {
                    const { verifyNode } = await import('../../evm/index.js');
                    evmGateResult = await verifyNode(candidate.id);

                    if (evmGateResult.status === 'completed' && evmGateResult.evaluation?.claimSupported === false) {
                        // Explicitly refuted — block promotion
                        console.error(`[validation] → ${candidate.id.slice(0, 8)} BLOCKED by EVM gate (claimSupported=false, score=${evmGateResult.evaluation.score})`);
                        emitActivity('cycle', 'validation_blocked', `Blocked by EVM: ${nodeLabel(candidate.id, candidate.content)} — claims refuted`, { nodeId: candidate.id, composite, gate: 'evm', evmStatus: evmGateResult.status, domain: candidate.domain });

                        await queryOne(`
                            INSERT INTO dream_cycles (
                                node_a_id, resonance_score, threshold_used,
                                created_child, parameters, domain, completed_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
                        `, [
                            candidate.id, composite, cfg.minCompositeForPromotion, 0,
                            JSON.stringify({
                                validation_type: 'autonomous_validation',
                                blocked_by: 'evm_gate',
                                noveltyGate: noveltyGateResult,
                                evmGate: { status: evmGateResult.status, claimSupported: false, verified: evmGateResult.evaluation?.verified, score: evmGateResult.evaluation?.score },
                                ...result,
                            }),
                            candidate.domain,
                        ]);
                        return;
                    }

                    // Any other status (completed+supported, code_error, skipped, failed) → allow through
                    console.error(`[validation] EVM gate result for ${candidate.id.slice(0, 8)}: status=${evmGateResult.status}, claimSupported=${evmGateResult.evaluation?.claimSupported ?? 'n/a'}`);
                }
            } catch (err: any) {
                console.error(`[validation] EVM gate error (fail-open): ${err.message}`);
                evmGateResult = { skipped: true, skipReason: 'error', error: err.message };
            }
        }

        // ── All gates passed — mark as "possible" breakthrough ──
        await query(`UPDATE nodes SET node_type = 'possible' WHERE id = $1`, [candidate.id]);
        await logDecision(
            'node', candidate.id, 'node_type',
            candidate.node_type || 'synthesis', 'possible',
            'system', 'validation-cycle',
            `Auto-validated as possible breakthrough: composite=${composite.toFixed(1)}, scores=${JSON.stringify(result.scores)}`
        );
        console.error(`[validation] → ${candidate.id.slice(0, 8)} marked as "possible" (composite: ${composite.toFixed(1)})`);
        emitActivity('cycle', 'validation_promoted', `Promoted to "possible": ${nodeLabel(candidate.id, candidate.content)} (composite: ${composite.toFixed(1)})`, { nodeId: candidate.id, composite, scores: result.scores, domain: candidate.domain });

        // Audit trail for successful promotion (with gate results)
        await queryOne(`
            INSERT INTO dream_cycles (
                node_a_id, resonance_score, threshold_used,
                created_child, parameters, domain, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
        `, [
            candidate.id, composite, cfg.minCompositeForPromotion, 1,
            JSON.stringify({
                validation_type: 'autonomous_validation',
                ...(noveltyGateResult ? { noveltyGate: noveltyGateResult } : {}),
                ...(evmGateResult ? { evmGate: { status: evmGateResult.status ?? evmGateResult.skipReason, claimSupported: evmGateResult.evaluation?.claimSupported, verified: evmGateResult.evaluation?.verified } } : {}),
                ...result,
            }),
            candidate.domain,
        ]);
        return;
    }

    // Log validation in dream_cycles for audit trail
    // (blocked/promoted cases with gates log inside the composite block above and return early;
    //  this log covers the below-threshold case only)
    if (composite < cfg.minCompositeForPromotion) {
        await queryOne(`
            INSERT INTO dream_cycles (
                node_a_id, resonance_score, threshold_used,
                created_child, parameters, domain, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
        `, [
            candidate.id,
            composite,
            cfg.minCompositeForPromotion,
            0,
            JSON.stringify({
                validation_type: 'autonomous_validation',
                ...result,
            }),
            candidate.domain,
        ]);
    }
}

export { runValidationCycleSingle };
