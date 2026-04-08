/**
 * API Verification Audit Trail — records API calls during EVM verification.
 *
 * Raw API responses are stored here for audit only.
 * They are NEVER fed into the synthesis engine as parent material.
 */

import { query, queryOne, systemQuery } from '../../core.js';
import { generateUuid } from '../../models/types.js';
import type { ApiVerificationResult, ApiVerificationRow, } from './types.js';

// =============================================================================
// RECORD
// =============================================================================

/**
 * Inserts one api_verifications row for audit trail.
 * Records the full decision, request, response, interpretation, corrections,
 * and enrichment details for later review.
 *
 * @param nodeId - UUID of the verified node
 * @param result - Full API verification result with all pipeline stage data
 * @param executionId - Optional EVM execution UUID to link (default: null)
 * @returns UUID of the newly created audit row
 */
export async function recordApiVerification(
    nodeId: string,
    result: ApiVerificationResult,
    executionId: string | null = null,
): Promise<string> {
    const id = generateUuid();

    await query(`
        INSERT INTO api_verifications (
            id, node_id, api_id, execution_id,
            decision_reason, decision_confidence, decision_mode,
            request_method, request_url, request_body,
            response_status, response_body, response_time_ms,
            verification_impact, interpreted_values, corrections_applied,
            enrichment_node_ids, enrichment_count,
            evidence_summary, confidence,
            status, error
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18,
            $19, $20,
            $21, $22
        )
    `, [
        id, nodeId, result.apiId, executionId,
        result.decision.reason, result.decision.confidence, result.decision.mode ?? null,
        result.query?.method ?? 'GET', result.query?.url ?? null, result.query?.body ?? null,
        result.responseStatus ?? null, result.rawResponse ?? null, result.responseTimeMs ?? null,
        result.interpretation?.impact ?? null,
        result.interpretation?.corrections ? JSON.stringify(result.interpretation.corrections) : null,
        result.correctionsApplied,
        result.enrichment ? JSON.stringify(result.enrichment.nodeIds) : null,
        result.enrichment?.nodeIds.length ?? 0,
        result.interpretation?.evidenceSummary ?? null,
        result.interpretation?.confidence ?? null,
        result.status, result.error ?? null,
    ]);

    return id;
}

// =============================================================================
// QUERY
// =============================================================================

/**
 * Returns all API verification rows for a node, ordered by most recent first.
 *
 * @param nodeId - UUID of the node
 * @returns Array of ApiVerificationRow records
 */
export async function getNodeApiVerifications(nodeId: string): Promise<ApiVerificationRow[]> {
    return query(
        'SELECT * FROM api_verifications WHERE node_id = $1 ORDER BY created_at DESC',
        [nodeId],
    ) as Promise<ApiVerificationRow[]>;
}

/**
 * Returns paginated api_verifications with optional filters.
 * Resolves API names from the system DB and number variable placeholders
 * in node content previews.
 *
 * @param filters - Optional apiId, nodeId, impact, status, limit, offset
 * @returns Paginated rows with resolved API names and total count
 */
export async function getFilteredApiVerifications(filters: {
    apiId?: string;
    nodeId?: string;
    impact?: string;
    status?: string;
    limit?: number;
    offset?: number;
}): Promise<{ rows: any[]; total: number }> {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (filters.apiId) {
        where.push(`v.api_id = $${idx++}`);
        params.push(filters.apiId);
    }
    if (filters.nodeId) {
        where.push(`v.node_id = $${idx++}`);
        params.push(filters.nodeId);
    }
    if (filters.impact) {
        where.push(`v.verification_impact = $${idx++}`);
        params.push(filters.impact);
    }
    if (filters.status) {
        where.push(`v.status = $${idx++}`);
        params.push(filters.status);
    }

    const whereClause = where.join(' AND ');
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const countRow = await queryOne(
        `SELECT COUNT(*) as total FROM api_verifications v WHERE ${whereClause}`,
        params,
    );

    const rows = await query(`
        SELECT
            v.*,
            SUBSTR(n.content, 1, 120) as node_content_preview
        FROM api_verifications v
        LEFT JOIN nodes n ON n.id = v.node_id
        WHERE ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, limit, offset]);

    // Resolve API names from system DB (api_registry lives there now).
    // Must use $N placeholders — systemQuery routes through translate() which
    // reorders params by $N index. Raw ? placeholders lose all params.
    const apiIds = [...new Set((rows as any[]).map(r => r.api_id).filter(Boolean))];
    const apiNameMap = new Map<string, { name: string; display_name: string }>();
    if (apiIds.length > 0) {
        const placeholders = apiIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const apis = await systemQuery(
            `SELECT id, name, display_name FROM api_registry WHERE id IN (${placeholders})`,
            apiIds,
        );
        for (const a of apis as any[]) {
            apiNameMap.set(a.id, { name: a.name, display_name: a.display_name });
        }
    }
    // Resolve variable placeholders in node content previews so the GUI
    // shows actual values instead of [[[WLMK672]]] references.
    const { resolveContent } = await import('../../core/number-variables.js');
    for (const row of rows as any[]) {
        const api = apiNameMap.get(row.api_id);
        row.api_name = api?.name ?? null;
        row.api_display_name = api?.display_name ?? null;
        if (row.node_content_preview) {
            try {
                row.node_content_preview = await resolveContent(row.node_content_preview);
            } catch { /* non-fatal — show raw content */ }
        }
    }

    return {
        rows,
        total: countRow?.total ?? 0,
    };
}

/**
 * Returns aggregate API verification stats for the last N days.
 * Includes totals, by-api breakdown, correction/validation/refutation counts,
 * and average response time.
 *
 * @param days - Number of days to look back (default: 7)
 * @returns Aggregate stats object with per-API breakdown
 */
export async function getApiVerificationStats(days: number = 7): Promise<{
    total: number;
    success: number;
    errors: number;
    corrections: number;
    validations: number;
    refutations: number;
    enrichments: number;
    avgResponseTimeMs: number;
    byApi: Array<{ apiId: string; total: number; success: number; errors: number }>;
}> {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const totals = await queryOne(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status IN ('api_error', 'timeout') THEN 1 ELSE 0 END) as errors,
            SUM(corrections_applied) as corrections,
            SUM(CASE WHEN verification_impact = 'structural_validation' THEN 1 ELSE 0 END) as validations,
            SUM(CASE WHEN verification_impact = 'structural_refutation' THEN 1 ELSE 0 END) as refutations,
            SUM(COALESCE(enrichment_count, 0)) as enrichments,
            AVG(response_time_ms) as avg_response_time_ms
        FROM api_verifications
        WHERE created_at >= $1
    `, [since]);

    const byApi = await query(`
        SELECT
            api_id as apiId,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status IN ('api_error', 'timeout') THEN 1 ELSE 0 END) as errors
        FROM api_verifications
        WHERE created_at >= $1
        GROUP BY api_id
    `, [since]);

    return {
        total: totals?.total ?? 0,
        success: totals?.success ?? 0,
        errors: totals?.errors ?? 0,
        corrections: totals?.corrections ?? 0,
        validations: totals?.validations ?? 0,
        refutations: totals?.refutations ?? 0,
        enrichments: totals?.enrichments ?? 0,
        avgResponseTimeMs: Math.round(totals?.avg_response_time_ms ?? 0),
        byApi,
    };
}
