/**
 * Cost tracking -- persistent DB-backed usage logging and aggregation.
 *
 * Logs every LLM call's token counts and computed costs to llm_usage_log.
 * Provides summary, time-series, detailed, and CSV export queries.
 * Also detects reasoning models for automatic token bonus application.
 * @module models/cost
 */
import { config as appConfig } from '../config.js';
import { systemQuery as query } from '../db.js';

// =============================================================================
// USAGE LOGGING
// =============================================================================

export interface LogUsageParams {
    subsystem: string;
    modelId: string;
    modelName: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    toolTokens: number;
    totalTokens: number;
    latencyMs?: number;
    finishReason?: string;
    error?: string;
    // Cost rates (per million tokens) — passed from the assigned model
    inputCostPerMtok?: number;
    outputCostPerMtok?: number;
    toolCostPerMtok?: number;
}

/**
 * Log a single LLM call's token usage and cost to the database.
 * Fire-and-forget — callers should `.catch(() => {})` to avoid blocking.
 */
export async function logUsage(params: LogUsageParams): Promise<void> {
    const inputCost = (params.inputTokens / 1_000_000) * (params.inputCostPerMtok || 0);
    const outputCost = (params.outputTokens / 1_000_000) * (params.outputCostPerMtok || 0);
    const toolCost = (params.toolTokens / 1_000_000) * (params.toolCostPerMtok || 0);
    const totalCost = inputCost + outputCost + toolCost;

    await query(
        `INSERT INTO llm_usage_log (subsystem, model_id, model_name, provider, input_tokens, output_tokens, tool_tokens, total_tokens, input_cost, output_cost, tool_cost, total_cost, latency_ms, finish_reason, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
            params.subsystem, params.modelId, params.modelName, params.provider,
            params.inputTokens, params.outputTokens, params.toolTokens, params.totalTokens,
            inputCost, outputCost, toolCost, totalCost,
            params.latencyMs ?? null, params.finishReason ?? null, params.error ?? null,
        ]
    );
}

// =============================================================================
// COST SUMMARY (DB-backed aggregation)
// =============================================================================

export interface CostSummaryOptions {
    days?: number;
    subsystem?: string;
    modelId?: string;
}

/**
 * Returns aggregated cost and token totals plus by-model and by-subsystem breakdown for the period.
 * @param options - Filter options: days (default 30), subsystem, modelId
 * @returns Object with totals, byModel, and bySubsystem arrays
 */
export async function getCostSummary(options: CostSummaryOptions = {}): Promise<any> {
    const { days = 30, subsystem, modelId } = options;

    const conditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const params: any[] = [];
    let idx = 1;

    if (subsystem) {
        conditions.push(`subsystem = $${idx++}`);
        params.push(subsystem);
    }
    if (modelId) {
        conditions.push(`model_id = $${idx++}`);
        params.push(modelId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Overall totals
    const totals = await query(
        `SELECT COUNT(*) as calls,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(tool_tokens), 0) as tool_tokens,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(input_cost), 0) as input_cost,
                COALESCE(SUM(output_cost), 0) as output_cost,
                COALESCE(SUM(tool_cost), 0) as tool_cost,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
         FROM llm_usage_log ${where}`,
        params
    );

    // Breakdown by model
    const byModel = await query(
        `SELECT model_id, model_name, provider,
                COUNT(*) as calls,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(tool_tokens), 0) as tool_tokens,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
         FROM llm_usage_log ${where}
         GROUP BY model_id ORDER BY total_cost DESC`,
        params
    );

    // Breakdown by subsystem
    const bySubsystem = await query(
        `SELECT subsystem,
                COUNT(*) as calls,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(tool_tokens), 0) as tool_tokens,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
         FROM llm_usage_log ${where}
         GROUP BY subsystem ORDER BY total_cost DESC`,
        params
    );

    return {
        period: { days },
        totals: totals[0] || { calls: 0, input_tokens: 0, output_tokens: 0, tool_tokens: 0, total_tokens: 0, input_cost: 0, output_cost: 0, tool_cost: 0, total_cost: 0, avg_latency_ms: 0 },
        byModel,
        bySubsystem,
    };
}

/**
 * Reset cost tracker — deletes all usage log entries.
 */
export async function resetCostTracker(): Promise<void> {
    await query('DELETE FROM llm_usage_log');
}

// =============================================================================
// TIME-SERIES AGGREGATION
// =============================================================================

export type Granularity = 'hour' | 'day' | 'month' | 'year';

export interface TimeSeriesOptions {
    granularity?: Granularity;
    days?: number;
    subsystem?: string;
    modelId?: string;
}

const STRFTIME_FORMATS: Record<Granularity, string> = {
    hour:  '%Y-%m-%d %H:00',
    day:   '%Y-%m-%d',
    month: '%Y-%m',
    year:  '%Y',
};

/**
 * Returns cost/time-series rows grouped by period for charting.
 * @param options - Granularity ('hour'|'day'|'month'|'year'), days, subsystem, modelId
 * @returns Array of time-bucketed rows with calls, tokens, and costs per period
 */
export async function getCostTimeSeries(options: TimeSeriesOptions = {}): Promise<any[]> {
    const { granularity = 'day', days = 30, subsystem, modelId } = options;
    const fmt = STRFTIME_FORMATS[granularity] || STRFTIME_FORMATS.day;

    const conditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const params: any[] = [];
    let idx = 1;

    if (subsystem) { conditions.push(`subsystem = $${idx++}`); params.push(subsystem); }
    if (modelId) { conditions.push(`model_id = $${idx++}`); params.push(modelId); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    return query(
        `SELECT strftime('${fmt}', created_at) as period,
                COUNT(*) as calls,
                COALESCE(SUM(input_tokens), 0) as input_tokens,
                COALESCE(SUM(output_tokens), 0) as output_tokens,
                COALESCE(SUM(tool_tokens), 0) as tool_tokens,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(input_cost), 0) as input_cost,
                COALESCE(SUM(output_cost), 0) as output_cost,
                COALESCE(SUM(tool_cost), 0) as tool_cost,
                COALESCE(SUM(total_cost), 0) as total_cost,
                COALESCE(AVG(latency_ms), 0) as avg_latency_ms
         FROM llm_usage_log ${where}
         GROUP BY strftime('${fmt}', created_at)
         ORDER BY period ASC`,
        params
    );
}

// =============================================================================
// DETAILED LOG (paginated)
// =============================================================================

export interface CostDetailsOptions {
    days?: number;
    subsystem?: string;
    modelId?: string;
    limit?: number;
    offset?: number;
}

/**
 * Returns paginated llm_usage_log rows and total count for the dashboard.
 * @param options - Filter options: days (30), subsystem, modelId, limit (100), offset (0)
 * @returns Object with rows array and total count for pagination
 */
export async function getCostDetails(options: CostDetailsOptions = {}): Promise<{ rows: any[]; total: number }> {
    const { days = 30, subsystem, modelId, limit = 100, offset = 0 } = options;

    const conditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const params: any[] = [];
    let idx = 1;

    if (subsystem) { conditions.push(`subsystem = $${idx++}`); params.push(subsystem); }
    if (modelId) { conditions.push(`model_id = $${idx++}`); params.push(modelId); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query(`SELECT COUNT(*) as total FROM llm_usage_log ${where}`, params);
    const total = countResult[0]?.total || 0;

    const rows = await query(
        `SELECT id, subsystem, model_id, model_name, provider,
                input_tokens, output_tokens, tool_tokens, total_tokens,
                input_cost, output_cost, tool_cost, total_cost,
                latency_ms, finish_reason, error, created_at
         FROM llm_usage_log ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
    );

    return { rows, total };
}

// =============================================================================
// CSV EXPORT
// =============================================================================

/**
 * Returns raw llm_usage_log rows for CSV export (no pagination).
 * @param options - Filter options: days (30), subsystem, modelId
 * @returns Array of usage log rows ordered by created_at DESC
 */
export async function getCostExportRows(options: { days?: number; subsystem?: string; modelId?: string } = {}): Promise<any[]> {
    const { days = 30, subsystem, modelId } = options;

    const conditions: string[] = [`created_at >= datetime('now', '-${days} days')`];
    const params: any[] = [];
    let idx = 1;

    if (subsystem) { conditions.push(`subsystem = $${idx++}`); params.push(subsystem); }
    if (modelId) { conditions.push(`model_id = $${idx++}`); params.push(modelId); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    return query(
        `SELECT id, subsystem, model_id, model_name, provider,
                input_tokens, output_tokens, tool_tokens, total_tokens,
                input_cost, output_cost, tool_cost, total_cost,
                latency_ms, finish_reason, created_at
         FROM llm_usage_log ${where}
         ORDER BY created_at DESC`,
        params
    );
}

// =============================================================================
// REASONING MODEL DETECTION
// =============================================================================

/**
 * Check whether a model ID matches known reasoning model patterns.
 * Used for logging only -- max_tokens come from the model registry, not from Podbit guessing.
 */
export function isReasoningModel(modelId: string): boolean {
    const id = (modelId || '').toLowerCase();
    return appConfig.tokenLimits.reasoningModelPatterns.some(
        pat => id.includes(pat.toLowerCase())
    );
}
