/**
 * EVM Feedback — Human review queue management.
 *
 * Approve or reject individual nodes in needs_review / needs_expert status.
 * Weight handling differs by test category:
 *   - LLM-evaluated claims (structural/domain_expert): weight_after was proposed
 *     but NOT applied — approval applies it, rejection discards it.
 *   - Sandbox-tested claims: weight was already adjusted — rejection reverts it.
 */

import { query, queryOne, logDecision } from '../core.js';
import { emitActivity } from '../services/event-bus.js';

/**
 * Approve or reject a node that's in review (needs_review or needs_expert).
 *
 * For approved LLM-evaluated claims, applies the proposed weight_after.
 * For rejected sandbox-tested claims, reverts weight to weight_before.
 * For rejected LLM-evaluated claims, discards proposed weight (no revert needed).
 *
 * @param nodeId - UUID of the node to approve/reject
 * @param approved - True to approve, false to reject
 * @param reviewer - Reviewer identifier for audit trail (default: 'human')
 * @returns Result with ok flag and descriptive message
 */
export async function approveReview(
    nodeId: string,
    approved: boolean,
    reviewer: string = 'human',
): Promise<{ ok: boolean; message: string }> {
    const node: any = await queryOne(
        'SELECT id, weight, verification_status, domain FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );

    if (!node) return { ok: false, message: 'Node not found or archived' };
    if (!['needs_review', 'needs_expert'].includes(node.verification_status)) {
        return { ok: false, message: `Node is not in review (status: ${node.verification_status})` };
    }

    const lastExec: any = await queryOne(
        `SELECT weight_before, weight_after, test_category FROM lab_executions WHERE node_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [nodeId],
    );

    // LLM-evaluated claims have weight_after proposed but NOT applied.
    const isLLMEval = lastExec?.test_category === 'structural' || lastExec?.test_category === 'domain_expert';

    if (approved) {
        if (isLLMEval && lastExec?.weight_after != null && lastExec.weight_after !== node.weight) {
            await query(`UPDATE nodes SET weight = $1, verification_status = 'completed' WHERE id = $2`,
                [lastExec.weight_after, nodeId]);

            await logDecision(
                'node', nodeId, 'weight',
                String(node.weight), String(lastExec.weight_after),
                'human', reviewer,
                `Human review: approved — LLM-proposed weight applied`,
            );
        } else {
            await query(`UPDATE nodes SET verification_status = 'completed' WHERE id = $1`, [nodeId]);
        }

        await logDecision(
            'node', nodeId, 'verification_status',
            node.verification_status, 'completed',
            'human', reviewer,
            `Human review: approved`,
        );
    } else {
        if (isLLMEval) {
            await query(`UPDATE nodes SET verification_status = 'completed' WHERE id = $1`, [nodeId]);
        } else if (lastExec?.weight_before != null && lastExec.weight_before !== node.weight) {
            await query(`UPDATE nodes SET weight = $1, verification_status = 'completed' WHERE id = $2`,
                [lastExec.weight_before, nodeId]);

            await logDecision(
                'node', nodeId, 'weight',
                String(node.weight), String(lastExec.weight_before),
                'human', reviewer,
                `Human review: rejected — weight reverted`,
            );
        } else {
            await query(`UPDATE nodes SET verification_status = 'completed' WHERE id = $1`, [nodeId]);
        }

        await logDecision(
            'node', nodeId, 'verification_status',
            node.verification_status, 'completed',
            'human', reviewer,
            `Human review: rejected`,
        );
    }

    emitActivity('system', 'evm_review',
        `Review ${approved ? 'APPROVED' : 'REJECTED'}: ${nodeId.slice(0, 8)} by ${reviewer}`,
        { nodeId, approved, reviewer, previousStatus: node.verification_status },
    );

    return { ok: true, message: approved ? 'Approved' : 'Rejected — weight reverted' };
}

/**
 * Bulk approve or reject multiple review-queue nodes.
 * Processes sequentially; collects errors without aborting.
 *
 * @param nodeIds - Array of node UUIDs to approve/reject
 * @param approved - True to approve all, false to reject all
 * @param reviewer - Reviewer identifier for audit trail (default: 'human')
 * @returns Summary with processed, succeeded, failed counts and error messages
 */
export async function bulkApproveReview(
    nodeIds: string[],
    approved: boolean,
    reviewer: string = 'human',
): Promise<{ processed: number; succeeded: number; failed: number; errors: string[] }> {
    const result = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] };
    for (const nodeId of nodeIds) {
        result.processed++;
        try {
            const res = await approveReview(nodeId, approved, reviewer);
            if (res.ok) {
                result.succeeded++;
            } else {
                result.failed++;
                result.errors.push(`${nodeId.slice(0, 8)}: ${res.message}`);
            }
        } catch (e: any) {
            result.failed++;
            result.errors.push(`${nodeId.slice(0, 8)}: ${e.message}`);
        }
    }
    return result;
}
