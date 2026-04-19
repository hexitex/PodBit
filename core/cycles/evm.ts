/**
 * @module core/cycles/evm
 *
 * Autonomous Lab Verification Cycle.
 *
 * Picks unverified nodes and submits them to the lab pipeline:
 * spec extraction → lab execution → data evaluation → graph consequences.
 *
 * All triage, codegen, and evaluation happens inside verifyNodeInternal()
 * or in the external lab server. The cycle just selects candidates and
 * records audit trails.
 */

import { query, queryOne } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { emitActivity, nodeLabel } from '../../services/event-bus.js';
import { getExcludedDomainsForCycle } from '../governance.js';

/**
 * One tick of the verification cycle: picks one unverified node
 * and runs it through the lab pipeline.
 */
async function runEvmCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.evm;
    const evmCfg = appConfig.labVerify;

    // Both master switch and cycle switch must be on
    if (!evmCfg.enabled) return;

    // Budget gate
    const { isBudgetExceeded } = await import('../../models/budget.js');
    if (isBudgetExceeded()) return;

    const retryBackoffSeconds = Math.floor(cfg.retryBackoffMs / 1000);

    // Find unverified candidates.
    //
    // Seeds are excluded entirely -- they are user-contributed input, not novel
    // claims the system generated. The autonomous cycle should focus on verifying
    // the system's own output (synthesis, voiced, breakthrough). Seeds can still
    // be manually sent to the lab via the GUI "Send to Lab" button.
    //
    // Candidates must have parents (incoming edges where the node is the target),
    // meaning they are products of the synthesis pipeline. This ensures only
    // derived knowledge is autonomously verified, not raw input.
    const evmCandidates = await query(`
        SELECT n.id, n.content, n.weight, n.domain, n.node_type
        FROM nodes n
        LEFT JOIN (
            SELECT ee2.node_id, COUNT(*) as attempt_count
            FROM lab_executions ee2
            WHERE ee2.status IN ('completed', 'failed', 'skipped')
              AND (ee2.error IS NULL OR ee2.error NOT LIKE '%Budget exceeded%')
            GROUP BY ee2.node_id
            HAVING attempt_count >= $2
        ) retried ON retried.node_id = n.id
        LEFT JOIN lab_executions ee3 ON ee3.node_id = n.id
            AND ee3.created_at > datetime('now', '-' || $3 || ' seconds')
        WHERE n.archived = FALSE
          AND n.lab_status IS NULL
          AND n.weight >= $1
          AND n.node_type NOT IN ('raw', 'question', 'seed')
          AND EXISTS (SELECT 1 FROM edges e WHERE e.target_id = n.id)
          AND (n.verification_status IS NULL OR n.verification_status IN ('failed', 'skipped'))
          AND retried.node_id IS NULL
          AND ee3.node_id IS NULL
        ORDER BY n.weight DESC
        LIMIT 5
    `, [cfg.minWeightThreshold, cfg.maxRetriesPerNode, retryBackoffSeconds]);

    // Filter out domains excluded from the verification cycle
    const excludedDomains = await getExcludedDomainsForCycle('evm');
    const filtered = excludedDomains.size > 0
        ? evmCandidates.filter((n: any) => !n.domain || !excludedDomains.has(n.domain))
        : evmCandidates;
    const candidate = filtered[0] ?? null;

    if (!candidate) return;

    emitActivity('cycle', 'evm_candidate',
        `Lab verification: ${nodeLabel((candidate as any).id, (candidate as any).content)} (weight: ${(candidate as any).weight.toFixed(3)})`,
        { nodeId: (candidate as any).id, weight: (candidate as any).weight, domain: (candidate as any).domain });

    // Submit to the lab pipeline — spec extraction, lab execution, evaluation, and
    // graph consequences all happen inside verifyNodeInternal()
    const { verifyNodeInternal } = await import('../../evm/index.js');
    const result = await verifyNodeInternal((candidate as any).id);

    const claimSupported = result.evaluation?.claimSupported ?? false;
    const confidence = result.evaluation?.confidence ?? 0;
    const score = result.evaluation?.score ?? 0;

    // Audit trail in dream_cycles
    await queryOne(`
        INSERT INTO dream_cycles (
            node_a_id, resonance_score, threshold_used,
            created_child, parameters, domain, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
    `, [
        (candidate as any).id,
        score,
        cfg.minWeightThreshold,
        claimSupported ? 1 : 0,
        JSON.stringify({
            cycle_type: 'evm',
            status: result.status,
            claimSupported,
            confidence,
            testCategory: result.testCategory,
            error: result.error,
        }),
        (candidate as any).domain,
    ]);

    if (result.status === 'completed') {
        emitActivity('cycle', 'evm_verified',
            `Lab ${claimSupported ? 'SUPPORTED' : 'REFUTED'}: ${nodeLabel((candidate as any).id, (candidate as any).content)} (confidence: ${confidence.toFixed(2)})`,
            { nodeId: (candidate as any).id, claimSupported, confidence, domain: (candidate as any).domain });
    } else if (result.status === 'skipped') {
        emitActivity('cycle', 'evm_skipped',
            `Not reducible: ${nodeLabel((candidate as any).id, (candidate as any).content)} — ${(result.error || '').slice(0, 80)}`,
            { nodeId: (candidate as any).id, reason: result.error, domain: (candidate as any).domain });
    } else if (result.status === 'failed') {
        emitActivity('cycle', 'evm_failed',
            `Lab failed: ${nodeLabel((candidate as any).id, (candidate as any).content)} — ${(result.error || '').slice(0, 80)}`,
            { nodeId: (candidate as any).id, error: result.error, domain: (candidate as any).domain });
    }
}

export { runEvmCycleSingle };
