/**
 * Graph modify handlers — node removal (archive/junk/hard-delete) and content editing.
 * @module handlers/graph/modify
 */

import {
    query, queryOne,
    logDecision,
    editNodeContent,
    setExcludedFromBriefs,
} from '../../core.js';
import { invalidateKnowledgeCache } from '../knowledge.js';

/**
 * Remove a node from the graph via archive, junk, or hard-delete.
 *
 * - `archive`: Soft-delete (sets archived=1). Reversible.
 * - `junk`: Archive + flag as bad content for negative embedding filtering.
 * - `hard`: Permanent deletion of node, edges, decisions, and EVM executions.
 *
 * Also cleans up dream_cycles referencing the node, logs integrity operations,
 * and invalidates the knowledge cache for the affected domain.
 *
 * @param params - Object with `nodeId`, optional `mode` ('junk'|'archive'|'hard'), and optional `reason`.
 * @returns Success response with node summary, or `{ error }`.
 */
async function handleRemove(params: Record<string, any>) {
    const { nodeId, mode = 'junk', reason } = params;

    if (!nodeId) {
        return { error: 'nodeId is required' };
    }

    // Verify node exists
    const node = await queryOne('SELECT id, content, domain, node_type, weight, archived, junk FROM nodes WHERE id = $1', [nodeId]);
    if (!node) {
        return { error: `Node ${nodeId} not found` };
    }

    if (node.archived && mode !== 'hard') {
        return { error: `Node ${nodeId} is already archived/junked` };
    }

    const auditReason = reason || `Node ${mode === 'junk' ? 'junked' : mode === 'archive' ? 'archived' : 'deleted'} via MCP`;

    if (mode === 'hard') {
        // Permanent deletion: edges, decisions, EVM executions, then node
        await query(`DELETE FROM edges WHERE source_id = $1 OR target_id = $1`, [nodeId]);
        await query(`DELETE FROM decisions WHERE entity_type = 'node' AND entity_id = $1`, [nodeId]);
        try { await query(`DELETE FROM lab_executions WHERE node_id = $1`, [nodeId]); } catch { /* table may not exist */ }
        await query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
    } else if (mode === 'junk') {
        // Junk: archive + flag as bad content for negative filtering
        await query(`UPDATE nodes SET archived = 1, junk = 1 WHERE id = $1`, [nodeId]);
        await logDecision('node', nodeId, 'junk', 'false', 'true', 'human', 'mcp', auditReason);
    } else {
        // Archive: soft-delete only
        await query(`UPDATE nodes SET archived = 1 WHERE id = $1`, [nodeId]);
        await logDecision('node', nodeId, 'archived', 'false', 'true', 'human', 'mcp', auditReason);
    }

    // Clean up EVM execution records — archived/deleted nodes shouldn't linger in verification lists
    if (mode !== 'hard') {
        try { await query(`DELETE FROM lab_executions WHERE node_id = $1`, [nodeId]); } catch { /* table may not exist */ }
    }

    // Log integrity operation for non-hard deletes (chain-of-custody)
    if (mode !== 'hard') {
        try {
            const { logOperation } = await import('../../core/integrity.js');
            const hashRow = await queryOne('SELECT content_hash FROM nodes WHERE id = $1', [nodeId]);
            const contentHash = hashRow?.content_hash;
            if (contentHash) {
                logOperation({
                    nodeId,
                    operation: mode === 'junk' ? 'junked' : 'archived',
                    contentHashBefore: contentHash,
                    contentHashAfter: contentHash, // hash doesn't change, just recording the event
                    contributor: 'mcp',
                    domain: node.domain,
                    details: { reason: auditReason, mode },
                }).catch((err: any) => {
                    console.error(`[integrity] Failed to log ${mode} for ${nodeId}: ${err.message}`);
                });
            }
        } catch { /* integrity module not available */ }
    }

    // Fix synthesis cycles: mark cycles that created this node as no longer having a live child
    try {
        await query(
            `UPDATE dream_cycles SET created_child = 0, rejection_reason = 'child_removed'
             WHERE child_node_id = $1 AND created_child = 1`,
            [nodeId]
        );
    } catch { /* dream_cycles table may not exist */ }

    // Invalidate cached compress/summarize for this node's domain
    invalidateKnowledgeCache(node.domain);

    return {
        success: true,
        id: nodeId,
        action: mode,
        node: {
            content: node.content?.slice(0, 100),
            type: node.node_type,
            domain: node.domain,
            weight: node.weight,
        },
        hint: mode === 'junk'
            ? 'Node archived and flagged as junk. Future proposals with similar content will be rejected.'
            : undefined,
    };
}

/**
 * Edit a node's content and/or brief-exclusion status.
 *
 * Content edits recompute embeddings, keywords, and content hashes.
 * Exclusion toggles control whether the node appears in compress/summarize output.
 *
 * @param params - Object with `nodeId`, `contributor` (required), and at least one of
 *   `content` (new text) or `excluded` (boolean). Optional `reason` for audit trail.
 * @returns Success response with edit details, or `{ error }`.
 */
async function handleEdit(params: Record<string, any>) {
    const { nodeId, content, excluded, contributor, reason } = params;

    if (!nodeId) return { error: 'nodeId is required' };
    if (!contributor) return { error: 'contributor is required' };
    if (content === undefined && excluded === undefined) {
        return { error: 'At least one of content or excluded must be provided' };
    }

    const results: Record<string, any> = { nodeId };

    if (content !== undefined) {
        try {
            const editResult = await editNodeContent(nodeId, content, contributor, reason);
            results.content = editResult;
        } catch (err: any) {
            return { error: `Content edit failed: ${err.message}` };
        }
    }

    if (excluded !== undefined) {
        try {
            const excludeResult = await setExcludedFromBriefs(nodeId, !!excluded, contributor, reason);
            results.excluded = excludeResult;
        } catch (err: any) {
            return { error: `Exclusion toggle failed: ${err.message}` };
        }
    }

    return { success: true, ...results };
}

export { handleRemove, handleEdit };
