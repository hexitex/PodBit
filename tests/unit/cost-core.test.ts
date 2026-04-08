/**
 * Unit tests for models/cost.ts — usage logging, cost summaries, time series,
 * details, export, and reset.
 * Complements cost.test.ts which covers applyReasoningBonus.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        tokenLimits: {
            reasoningModelPatterns: ['o1'],
            reasoningExtraTokens: 16000,
        },
    },
}));

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
}));

const { logUsage, getCostSummary, resetCostTracker, getCostTimeSeries, getCostDetails, getCostExportRows } =
    await import('../../models/cost.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// logUsage
// =============================================================================

describe('logUsage', () => {
    it('inserts a usage record with calculated costs', async () => {
        await logUsage({
            subsystem: 'voice',
            modelId: 'model-1',
            modelName: 'GPT-4',
            provider: 'openai',
            inputTokens: 1000,
            outputTokens: 500,
            toolTokens: 200,
            totalTokens: 1700,
            inputCostPerMtok: 30,
            outputCostPerMtok: 60,
            toolCostPerMtok: 10,
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('INSERT INTO llm_usage_log');

        // Check params
        expect(params[0]).toBe('voice');        // subsystem
        expect(params[1]).toBe('model-1');      // model_id
        expect(params[2]).toBe('GPT-4');        // model_name
        expect(params[3]).toBe('openai');       // provider
        expect(params[4]).toBe(1000);           // input_tokens
        expect(params[5]).toBe(500);            // output_tokens
        expect(params[6]).toBe(200);            // tool_tokens
        expect(params[7]).toBe(1700);           // total_tokens

        // Costs: input=1000/1M*30=0.03, output=500/1M*60=0.03, tool=200/1M*10=0.002
        const inputCost = params[8] as number;
        const outputCost = params[9] as number;
        const toolCost = params[10] as number;
        const totalCost = params[11] as number;

        expect(inputCost).toBeCloseTo(0.03, 6);
        expect(outputCost).toBeCloseTo(0.03, 6);
        expect(toolCost).toBeCloseTo(0.002, 6);
        expect(totalCost).toBeCloseTo(0.062, 6);
    });

    it('defaults cost rates to 0 when not provided', async () => {
        await logUsage({
            subsystem: 'chat',
            modelId: 'm1',
            modelName: 'Local',
            provider: 'local',
            inputTokens: 5000,
            outputTokens: 1000,
            toolTokens: 0,
            totalTokens: 6000,
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        // All costs should be 0
        expect(params[8]).toBe(0);  // input_cost
        expect(params[9]).toBe(0);  // output_cost
        expect(params[10]).toBe(0); // tool_cost
        expect(params[11]).toBe(0); // total_cost
    });

    it('passes latencyMs, finishReason, and error when provided', async () => {
        await logUsage({
            subsystem: 'synthesis',
            modelId: 'm1',
            modelName: 'M',
            provider: 'openai',
            inputTokens: 100,
            outputTokens: 50,
            toolTokens: 0,
            totalTokens: 150,
            latencyMs: 1234,
            finishReason: 'stop',
            error: 'none',
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params[12]).toBe(1234);   // latency_ms
        expect(params[13]).toBe('stop'); // finish_reason
        expect(params[14]).toBe('none'); // error
    });

    it('passes null for optional fields when not provided', async () => {
        await logUsage({
            subsystem: 'voice',
            modelId: 'm1',
            modelName: 'M',
            provider: 'openai',
            inputTokens: 0,
            outputTokens: 0,
            toolTokens: 0,
            totalTokens: 0,
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params[12]).toBeNull(); // latency_ms
        expect(params[13]).toBeNull(); // finish_reason
        expect(params[14]).toBeNull(); // error
    });

    it('handles zero tokens correctly', async () => {
        await logUsage({
            subsystem: 'chat',
            modelId: 'm1',
            modelName: 'M',
            provider: 'openai',
            inputTokens: 0,
            outputTokens: 0,
            toolTokens: 0,
            totalTokens: 0,
            inputCostPerMtok: 30,
            outputCostPerMtok: 60,
            toolCostPerMtok: 10,
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params[8]).toBe(0);   // input_cost
        expect(params[9]).toBe(0);   // output_cost
        expect(params[10]).toBe(0);  // tool_cost
        expect(params[11]).toBe(0);  // total_cost
    });
});

// =============================================================================
// getCostSummary
// =============================================================================

describe('getCostSummary', () => {
    it('returns default structure with totals, byModel, and bySubsystem', async () => {
        const totalsRow = {
            calls: 10, input_tokens: 5000, output_tokens: 2000, tool_tokens: 100,
            total_tokens: 7100, input_cost: 0.15, output_cost: 0.12, tool_cost: 0.001,
            total_cost: 0.271, avg_latency_ms: 800,
        };
        const modelRow = {
            model_id: 'm1', model_name: 'GPT-4', provider: 'openai',
            calls: 10, input_tokens: 5000, output_tokens: 2000, tool_tokens: 100,
            total_tokens: 7100, total_cost: 0.271, avg_latency_ms: 800,
        };
        const subsystemRow = {
            subsystem: 'voice', calls: 5, input_tokens: 2500, output_tokens: 1000,
            tool_tokens: 50, total_tokens: 3550, total_cost: 0.13, avg_latency_ms: 750,
        };

        mockQuery
            .mockResolvedValueOnce([totalsRow])    // totals query
            .mockResolvedValueOnce([modelRow])      // byModel query
            .mockResolvedValueOnce([subsystemRow]); // bySubsystem query

        const result = await getCostSummary({ days: 7 });

        expect(result.period).toEqual({ days: 7 });
        expect(result.totals).toEqual(totalsRow);
        expect(result.byModel).toEqual([modelRow]);
        expect(result.bySubsystem).toEqual([subsystemRow]);
    });

    it('defaults to 30 days when no options provided', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostSummary();

        // First call is the totals query — should contain '-30 days'
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('-30 days');
    });

    it('filters by subsystem when provided', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostSummary({ subsystem: 'voice' });

        // All three queries should include subsystem filter
        for (const call of mockQuery.mock.calls) {
            const [sql, params] = call as any[];
            expect(String(sql)).toContain('subsystem = $1');
            expect(params).toContain('voice');
        }
    });

    it('filters by modelId when provided', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostSummary({ modelId: 'model-1' });

        for (const call of mockQuery.mock.calls) {
            const [sql, params] = call as any[];
            expect(String(sql)).toContain('model_id = $1');
            expect(params).toContain('model-1');
        }
    });

    it('filters by both subsystem and modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostSummary({ subsystem: 'chat', modelId: 'model-x' });

        for (const call of mockQuery.mock.calls) {
            const [sql, params] = call as any[];
            expect(String(sql)).toContain('subsystem = $1');
            expect(String(sql)).toContain('model_id = $2');
            expect(params[0]).toBe('chat');
            expect(params[1]).toBe('model-x');
        }
    });

    it('returns fallback totals when query returns empty', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await getCostSummary();

        expect(result.totals).toEqual({
            calls: 0, input_tokens: 0, output_tokens: 0, tool_tokens: 0,
            total_tokens: 0, input_cost: 0, output_cost: 0, tool_cost: 0,
            total_cost: 0, avg_latency_ms: 0,
        });
    });

    it('makes exactly 3 queries (totals, byModel, bySubsystem)', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostSummary();

        expect(mockQuery).toHaveBeenCalledTimes(3);
    });
});

// =============================================================================
// resetCostTracker
// =============================================================================

describe('resetCostTracker', () => {
    it('deletes all rows from llm_usage_log', async () => {
        await resetCostTracker();

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toBe('DELETE FROM llm_usage_log');
    });
});

// =============================================================================
// getCostTimeSeries
// =============================================================================

describe('getCostTimeSeries', () => {
    it('defaults to daily granularity and 30 days', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries();

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('%Y-%m-%d');
        expect(String(sql)).toContain('-30 days');
    });

    it('uses hourly strftime format', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ granularity: 'hour' });

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('%Y-%m-%d %H:00');
    });

    it('uses monthly strftime format', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ granularity: 'month' });

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('%Y-%m');
        // Should NOT contain day format
        expect(String(sql)).not.toContain('%Y-%m-%d');
    });

    it('uses yearly strftime format', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ granularity: 'year' });

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain("'%Y'");
    });

    it('respects custom days parameter', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ days: 7 });

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('-7 days');
    });

    it('filters by subsystem', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ subsystem: 'voice' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('subsystem = $1');
        expect(params).toContain('voice');
    });

    it('filters by modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ modelId: 'model-1' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('model_id = $1');
        expect(params).toContain('model-1');
    });

    it('filters by both subsystem and modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries({ subsystem: 'chat', modelId: 'model-1' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('subsystem = $1');
        expect(String(sql)).toContain('model_id = $2');
        expect(params[0]).toBe('chat');
        expect(params[1]).toBe('model-1');
    });

    it('returns the query result directly', async () => {
        const rows = [
            { period: '2024-01-01', calls: 5, total_cost: 0.1 },
            { period: '2024-01-02', calls: 3, total_cost: 0.05 },
        ];
        mockQuery.mockResolvedValue(rows);

        const result = await getCostTimeSeries();

        expect(result).toEqual(rows);
    });

    it('orders by period ASC', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostTimeSeries();

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('ORDER BY period ASC');
    });
});

// =============================================================================
// getCostDetails
// =============================================================================

describe('getCostDetails', () => {
    it('returns rows and total count', async () => {
        mockQuery
            .mockResolvedValueOnce([{ total: 42 }])   // count query
            .mockResolvedValueOnce([{ id: 1 }]);       // data query

        const result = await getCostDetails();

        expect(result.total).toBe(42);
        expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('defaults to 30 days, limit 100, offset 0', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails();

        // First query is COUNT
        const [countSql] = mockQuery.mock.calls[0] as any[];
        expect(String(countSql)).toContain('-30 days');

        // Second query has LIMIT and OFFSET
        const [dataSql, dataParams] = mockQuery.mock.calls[1] as any[];
        expect(String(dataSql)).toContain('LIMIT');
        expect(String(dataSql)).toContain('OFFSET');
        // limit=100, offset=0 should be the last two params
        const len = dataParams.length;
        expect(dataParams[len - 2]).toBe(100);
        expect(dataParams[len - 1]).toBe(0);
    });

    it('uses custom limit and offset', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails({ limit: 25, offset: 50 });

        const [, dataParams] = mockQuery.mock.calls[1] as any[];
        const len = dataParams.length;
        expect(dataParams[len - 2]).toBe(25);
        expect(dataParams[len - 1]).toBe(50);
    });

    it('filters by subsystem', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails({ subsystem: 'voice' });

        for (const call of mockQuery.mock.calls) {
            const [sql] = call as any[];
            expect(String(sql)).toContain('subsystem = $1');
        }
    });

    it('filters by modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails({ modelId: 'model-x' });

        for (const call of mockQuery.mock.calls) {
            const [sql] = call as any[];
            expect(String(sql)).toContain('model_id = $1');
        }
    });

    it('returns total=0 when count query returns empty', async () => {
        mockQuery
            .mockResolvedValueOnce([])    // empty count
            .mockResolvedValueOnce([]);   // empty data

        const result = await getCostDetails();

        expect(result.total).toBe(0);
        expect(result.rows).toEqual([]);
    });

    it('orders by created_at DESC', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails();

        const [dataSql] = mockQuery.mock.calls[1] as any[];
        expect(String(dataSql)).toContain('ORDER BY created_at DESC');
    });

    it('makes exactly 2 queries (count + data)', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostDetails();

        expect(mockQuery).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// getCostExportRows
// =============================================================================

describe('getCostExportRows', () => {
    it('returns all rows without pagination', async () => {
        const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
        mockQuery.mockResolvedValue(rows);

        const result = await getCostExportRows();

        expect(result).toEqual(rows);
        // Only one query (no count query)
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('defaults to 30 days', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows();

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('-30 days');
    });

    it('filters by subsystem', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows({ subsystem: 'synthesis' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('subsystem = $1');
        expect(params).toContain('synthesis');
    });

    it('filters by modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows({ modelId: 'model-z' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('model_id = $1');
        expect(params).toContain('model-z');
    });

    it('filters by both subsystem and modelId', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows({ subsystem: 'chat', modelId: 'model-1' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('subsystem = $1');
        expect(String(sql)).toContain('model_id = $2');
        expect(params[0]).toBe('chat');
        expect(params[1]).toBe('model-1');
    });

    it('respects custom days', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows({ days: 90 });

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('-90 days');
    });

    it('orders by created_at DESC', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows();

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('ORDER BY created_at DESC');
    });

    it('does not include LIMIT or OFFSET', async () => {
        mockQuery.mockResolvedValue([]);

        await getCostExportRows();

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).not.toContain('LIMIT');
        expect(String(sql)).not.toContain('OFFSET');
    });
});
