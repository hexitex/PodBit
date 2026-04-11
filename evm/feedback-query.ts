/**
 * EVM Feedback — Query and read-only operations.
 *
 * All functions that read verification history, queue items, stats,
 * and maintenance operations that don't touch core weight/review flow.
 */

import { query, queryOne } from '../core.js';
import { emitActivity } from '../services/event-bus.js';
import { generateUuid } from '../models/types.js';
import type { EVMExecution, AnalysisResult } from './types.js';
import { RC } from '../config/constants.js';

// =============================================================================
// VERIFICATION HISTORY
// =============================================================================

/**
 * Get verification history for a node, ordered by most recent first.
 *
 * @param nodeId - UUID of the node
 * @param slim - If true, excludes heavy TEXT columns (code, stdout, stderr, guidance) for faster response
 * @returns Array of EVMExecution records for this node
 */
export async function getNodeVerifications(nodeId: string, slim = false): Promise<EVMExecution[]> {
    const columns = slim
        ? `id, node_id, status, hypothesis, evaluation_mode, claim_type, test_category,
           exit_code, execution_time_ms, verified, claim_supported, assertion_polarity,
           confidence, score, weight_before, weight_after, error, attempt, created_at, completed_at`
        : '*';
    return query(`
        SELECT ${columns} FROM lab_executions
        WHERE node_id = $1
        ORDER BY created_at DESC
    `, [nodeId]) as Promise<EVMExecution[]>;
}

/**
 * Get recent executions across all nodes, with node content joined.
 * Supports filtering by days, status, verified flag, confidence range, and free-text search.
 * Deduplicates to latest execution per node (unless filtering by specific nodeId).
 * Excludes orphaned/archived nodes and nodes currently re-queued.
 *
 * @param options - Filter and pagination options
 * @returns Paginated executions array and total count
 */
export async function getRecentExecutions(options: {
    days?: number;
    limit?: number;
    offset?: number;
    status?: string;
    verified?: boolean | null;
    minConfidence?: number | null;
    maxConfidence?: number | null;
    search?: string | null;
    nodeId?: string | null;
} = {}): Promise<{ executions: any[], total: number }> {
    const days = Math.max(1, Math.floor(options.days ?? 30));
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);

    const conditions = [`e.created_at >= datetime('now', '-' || $1 || ' days')`];
    const params: any[] = [days];
    let paramIdx = 2;

    if (options.nodeId) {
        conditions.push(`e.node_id = $${paramIdx}`);
        params.push(options.nodeId);
        paramIdx++;
    }
    if (options.status === 'attention') {
        conditions.push(`e.status IN ('code_error', 'failed', 'skipped')`);
    } else if (options.status === 'inconclusive') {
        conditions.push(`e.claim_supported IS NULL AND e.verified = 0 AND e.status = 'completed'`);
    } else if (options.status) {
        conditions.push(`e.status = $${paramIdx}`);
        params.push(options.status);
        paramIdx++;
    }
    if (options.verified === true) {
        conditions.push(`e.verified = 1`);
    } else if (options.verified === false) {
        // Refuted: claim_supported explicitly 0 (not NULL which is inconclusive)
        conditions.push(`e.claim_supported = 0 AND e.status = 'completed'`);
    }
    if (options.minConfidence != null) {
        conditions.push(`COALESCE(e.confidence, 0) >= $${paramIdx}`);
        params.push(options.minConfidence);
        paramIdx++;
    }
    if (options.maxConfidence != null) {
        conditions.push(`COALESCE(e.confidence, 0) <= $${paramIdx}`);
        params.push(options.maxConfidence);
        paramIdx++;
    }
    if (options.search) {
        const term = `%${options.search}%`;
        conditions.push(`(n.content LIKE $${paramIdx} OR e.hypothesis LIKE $${paramIdx} OR n.domain LIKE $${paramIdx} OR n.id LIKE $${paramIdx})`);
        params.push(term);
        paramIdx++;
    }

    const where = conditions.join(' AND ');

    // Deduplicate: only keep the latest execution per node (skip when filtering by specific node).
    const dedup = options.nodeId ? '1=1' : `e.created_at = (
        SELECT MAX(e2.created_at) FROM lab_executions e2
        WHERE e2.node_id = e.node_id
    )`;

    // Exclude orphans (archived/deleted) and nodes currently re-queued
    const alive = `n.id IS NOT NULL AND n.archived = 0 AND COALESCE(n.verification_status, '') != 'in_queue'`;

    const countRow: any = await queryOne(
        `SELECT COUNT(*) as total FROM lab_executions e
         JOIN nodes n ON n.id = e.node_id
         WHERE ${where} AND ${dedup} AND ${alive}`, params
    );

    const rows = await query(`
        SELECT e.*,
            n.content as node_content,
            n.domain as node_domain
        FROM lab_executions e
        JOIN nodes n ON n.id = e.node_id
        WHERE ${where} AND ${dedup} AND ${alive}
        ORDER BY e.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, limit, offset]);

    return {
        executions: rows as any[],
        total: parseInt(countRow?.total || '0', 10),
    };
}

// =============================================================================
// ANALYSIS RECORDING
// =============================================================================

/**
 * Record a post-rejection analysis result as an lab_executions row.
 * Uses status='analysis' and attempt=0 to distinguish from normal verification runs.
 *
 * @param nodeId - UUID of the node that was analyzed after rejection
 * @param analysis - Analysis result containing findings, optional sandbox output,
 *   claim type, and optional recovery proposal (serialized to JSON in the error column)
 */
export async function recordAnalysis(nodeId: string, analysis: AnalysisResult): Promise<void> {
    const execId = generateUuid();
    await query(`
        INSERT INTO lab_executions (
            id, node_id, status, hypothesis, code, evaluation_mode, claim_type,
            stdout, stderr, exit_code, execution_time_ms,
            verified, confidence, score,
            weight_before, weight_after, error, attempt
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `, [
        execId,
        nodeId,
        'analysis',
        analysis.findings.summary ?? null,
        analysis.analysisCode ?? null,
        null,
        analysis.claimType,
        analysis.sandboxResult?.stdout ?? null,
        analysis.sandboxResult?.stderr ?? null,
        analysis.sandboxResult?.exitCode ?? null,
        analysis.sandboxResult?.executionTimeMs ?? null,
        analysis.findings.isInteresting ? 1 : 0,
        analysis.findings.alternativeConfidence ?? null,
        null,
        null,
        null,
        analysis.recoveryProposal ? JSON.stringify({
            content: analysis.recoveryProposal.content,
            domain: analysis.recoveryProposal.domain,
            parentIds: analysis.recoveryProposal.parentIds,
        }) : null,
        0,
    ]);

    emitActivity('system', 'evm_analysis_recorded',
        `Analysis recorded for ${nodeId.slice(0, 8)}: interesting=${analysis.findings.isInteresting}`,
        { nodeId, claimType: analysis.claimType, isInteresting: analysis.findings.isInteresting },
    );
}

// =============================================================================
// REVIEW QUEUE READ
// =============================================================================

/**
 * Get nodes awaiting human review (verification_status = 'needs_review' or 'needs_expert').
 * Joins each node with its latest EVM execution and batch-fetches parent node content
 * for all results in a single query (avoiding N+1) so the review UI has full context.
 *
 * @param options.status - Filter to a single status value, or omit for both review statuses
 * @param options.limit - Max items to return (default 20, max 100)
 * @param options.offset - Pagination offset (default 0)
 * @returns `{ items, total }` where items include node fields, execution fields, and a `parents` array
 */
export async function getReviewQueue(options: {
    status?: string;
    limit?: number;
    offset?: number;
} = {}): Promise<{ items: any[], total: number }> {
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = Math.max(0, options.offset ?? 0);

    const statusFilter = options.status
        ? [options.status]
        : ['needs_review', 'needs_expert'];

    const placeholders = statusFilter.map((_, i) => `$${i + 1}`).join(', ');

    const countRow: any = await queryOne(
        `SELECT COUNT(*) as total FROM nodes WHERE verification_status IN (${placeholders}) AND archived = 0`,
        statusFilter,
    );

    const rows: any[] = await query(`
        SELECT n.id, n.content, n.weight, n.domain,
            n.node_type, n.verification_status, n.verification_score,
            e.hypothesis, e.test_category, e.confidence, e.score,
            e.code, e.weight_before, e.weight_after, e.error,
            e.created_at as verified_at
        FROM nodes n
        LEFT JOIN lab_executions e ON e.node_id = n.id
            AND e.created_at = (SELECT MAX(e2.created_at) FROM lab_executions e2 WHERE e2.node_id = n.id)
        WHERE n.verification_status IN (${placeholders}) AND n.archived = 0
        ORDER BY e.created_at DESC
        LIMIT $${statusFilter.length + 1} OFFSET $${statusFilter.length + 2}
    `, [...statusFilter, limit, offset]) as any[];

    // Batch-fetch parent content for all review items in one query
    if (rows.length > 0) {
        const nodeIds = rows.map((r: any) => r.id);
        const parentRows: any[] = await query(`
            SELECT e.target_id as child_id, n.id, n.content, n.domain, n.node_type
            FROM edges e
            JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id IN (SELECT value FROM json_each($1))
              AND e.edge_type = 'parent'
            ORDER BY e.created_at
        `, [JSON.stringify(nodeIds)]) as any[];

        const parentMap = new Map<string, any[]>();
        for (const p of parentRows) {
            const list = parentMap.get(p.child_id) || [];
            list.push({ id: p.id, content: p.content, domain: p.domain, node_type: p.node_type });
            parentMap.set(p.child_id, list);
        }
        for (const row of rows) {
            row.parents = parentMap.get(row.id) || [];
        }
    } else {
        for (const row of rows) row.parents = [];
    }

    return {
        items: rows,
        total: parseInt(countRow?.total || '0', 10),
    };
}

// =============================================================================
// STATS & MAINTENANCE
// =============================================================================

/**
 * Get aggregate EVM statistics for the last N days.
 * Includes counts by status, average confidence, average execution time,
 * category breakdown, and pending review count.
 *
 * @param days - Number of days to look back (default: 7, minimum: 1)
 * @returns Aggregate statistics object
 */
export async function getEVMStats(days: number = 7) {
    const d = Math.max(1, Math.floor(days));
    const stats: any = await queryOne(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN claim_supported = 1 AND status = 'completed' THEN 1
                 WHEN claim_supported IS NULL AND verified = 1 THEN 1
                 ELSE 0 END) as verified_count,
            SUM(CASE WHEN claim_supported = 0 AND status = 'completed' THEN 1
                 ELSE 0 END) as disproved_count,
            SUM(CASE WHEN claim_supported IS NULL AND verified = 0 AND status = 'completed' THEN 1
                 ELSE 0 END) as inconclusive_count,
            SUM(CASE WHEN status = 'code_error' THEN 1 ELSE 0 END) as code_error_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_count,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
            SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) as needs_review_count,
            SUM(CASE WHEN status = 'needs_expert' THEN 1 ELSE 0 END) as needs_expert_count,
            SUM(CASE WHEN status = 'rejected_resynthesis' THEN 1 ELSE 0 END) as rejected_resynthesis_count,
            AVG(CASE WHEN verified IS NOT NULL THEN confidence ELSE NULL END) as avg_confidence,
            AVG(CASE WHEN status = 'completed' THEN execution_time_ms ELSE NULL END) as avg_execution_time
        FROM lab_executions
        WHERE created_at >= datetime('now', '-' || $1 || ' days')
    `, [d]);

    // Normalize legacy + duplicate test_category values and exclude error states
    const categories: any[] = await query(`
        SELECT
            CASE test_category
                WHEN 'numerical' THEN 'numerical_identity'
                WHEN 'structural' THEN 'structural_property'
                WHEN 'not_testable' THEN 'qualitative'
                WHEN 'training_dynamics' THEN 'training_performance'
                ELSE test_category
            END as normalized_category,
            COUNT(*) as count
        FROM lab_executions
        WHERE created_at >= datetime('now', '-' || $1 || ' days')
          AND test_category IS NOT NULL
          AND test_category NOT IN ('no_lab', 'tautological')
        GROUP BY normalized_category
    `, [d]) as any[];

    const categoryMap: Record<string, number> = {};
    for (const row of categories) {
        categoryMap[row.normalized_category] = parseInt(row.count, 10);
    }

    const pendingReview: any = await queryOne(`
        SELECT COUNT(*) as count FROM nodes
        WHERE verification_status IN ('needs_review', 'needs_expert') AND archived = 0
    `);

    return {
        total: parseInt(stats?.total || '0', 10),
        verified: parseInt(stats?.verified_count || '0', 10),
        disproved: parseInt(stats?.disproved_count || '0', 10),
        inconclusive: parseInt(stats?.inconclusive_count || '0', 10),
        codeErrors: parseInt(stats?.code_error_count || '0', 10),
        errors: parseInt(stats?.error_count || '0', 10),
        skipped: parseInt(stats?.skipped_count || '0', 10),
        needsReview: parseInt(stats?.needs_review_count || '0', 10),
        needsExpert: parseInt(stats?.needs_expert_count || '0', 10),
        rejectedResynthesis: parseInt(stats?.rejected_resynthesis_count || '0', 10),
        failed: parseInt(stats?.disproved_count || '0', 10),
        avgConfidence: stats?.avg_confidence ? Math.round(stats.avg_confidence * 100) / 100 : null,
        avgExecutionTimeMs: stats?.avg_execution_time ? Math.round(stats.avg_execution_time) : null,
        categories: categoryMap,
        pendingReviews: parseInt(pendingReview?.count || '0', 10),
        days: d,
    };
}

/**
 * Dismiss verification errors for a node — clears it from the "Needs Attention" view.
 * Resets the node's verification_status to NULL without deleting execution history.
 *
 * @param nodeId - UUID of the node to dismiss
 * @returns Result with ok flag and descriptive message
 */
export async function dismissNodeVerification(nodeId: string): Promise<{ ok: boolean; message: string }> {
    const node: any = await queryOne(
        'SELECT id, verification_status FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return { ok: false, message: 'Node not found or archived' };

    await query(
        `UPDATE nodes SET verification_status = NULL, updated_at = datetime('now') WHERE id = $1`,
        [nodeId],
    );

    emitActivity('system', 'evm_dismiss',
        `Verification dismissed for ${nodeId.slice(0, 8)} (was: ${node.verification_status})`,
        { nodeId, previousStatus: node.verification_status },
    );

    return { ok: true, message: `Dismissed (was: ${node.verification_status || 'none'})` };
}

/**
 * Prune superseded execution records — for each node, keep only the latest
 * execution and delete older failed/skipped/error records.
 * Completed+verified records are always kept. Also removes orphaned
 * executions whose nodes no longer exist or are archived.
 *
 * @param options - Prune options:
 *   - dryRun: report changes without applying them (default: false)
 *   - olderThanDays: only prune records older than this many days (default: 0 = all)
 * @returns Count of deleted and kept execution records
 */
export async function pruneOldExecutions(options: {
    dryRun?: boolean;
    olderThanDays?: number;
} = {}): Promise<{ deleted: number; kept: number }> {
    const olderThan = options.olderThanDays ?? 0;

    // 1. Delete orphans: executions whose nodes no longer exist or are archived
    const orphans: any[] = await query(`
        SELECT e.id FROM lab_executions e
        LEFT JOIN nodes n ON n.id = e.node_id
        WHERE n.id IS NULL OR n.archived = 1
    `) as any[];

    let orphanCount = 0;
    if (!options.dryRun && orphans.length > 0) {
        const orphanIds = orphans.map((r: any) => r.id);
        const batchSize = 100;
        for (let i = 0; i < orphanIds.length; i += batchSize) {
            const batch = orphanIds.slice(i, i + batchSize);
            const placeholders = batch.map((_: string, j: number) => `$${j + 1}`).join(', ');
            await query(`DELETE FROM lab_executions WHERE id IN (${placeholders})`, batch);
        }
        orphanCount = orphanIds.length;
    } else {
        orphanCount = orphans.length;
    }

    // 2. Find stale executions to prune (non-orphan)
    const toDelete: any[] = await query(`
        SELECT e.id, e.node_id, e.status, e.created_at FROM lab_executions e
        JOIN nodes n ON n.id = e.node_id AND n.archived = 0
        WHERE e.id NOT IN (
            SELECT id FROM (
                SELECT id, node_id, ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY created_at DESC) as rn
                FROM lab_executions
            ) sub WHERE sub.rn = 1
        )
        AND e.id NOT IN (
            SELECT id FROM lab_executions WHERE status = 'completed' AND claim_supported = 1
        )
        AND e.status IN ('failed', 'skipped', 'code_error', 'analysis')
        ${olderThan > 0 ? `AND e.created_at < datetime('now', '-${olderThan} days')` : ''}
        ORDER BY e.created_at
    `) as any[];

    const totalToPrune = orphanCount + toDelete.length;

    if (options.dryRun || toDelete.length === 0) {
        const totalRow: any = await queryOne('SELECT COUNT(*) as c FROM lab_executions');
        return { deleted: totalToPrune, kept: parseInt(totalRow?.c || '0', 10) - toDelete.length };
    }

    const ids = toDelete.map((r: any) => r.id);
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const placeholders = batch.map((_: string, j: number) => `$${j + 1}`).join(', ');
        await query(`DELETE FROM lab_executions WHERE id IN (${placeholders})`, batch);
    }

    const totalRow: any = await queryOne('SELECT COUNT(*) as c FROM lab_executions');
    return { deleted: totalToPrune, kept: parseInt(totalRow?.c || '0', 10) };
}
