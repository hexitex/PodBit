/**
 * Comprehensive unit tests for models/assignments.ts —
 * Covers callSubsystemModel, callConsultantModel, consultantReview,
 * setConsultantAssignment, rate-limit helpers, retry logic, budget checks,
 * abort handling, and edge cases in cache loading.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockEmitActivity = jest.fn<() => void>();
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt');
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCallSingleModel = jest.fn<() => Promise<any>>().mockResolvedValue({ text: 'ok', usage: null });
const mockApplyReasoningBonus = jest.fn<(modelId: any, base: any) => any>().mockImplementation((_m: any, b: any) => b);
const mockLogUsage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsBudgetExceeded = jest.fn<() => boolean>().mockReturnValue(false);
const mockGetProjectAbortSignal = jest.fn<() => AbortSignal | undefined>().mockReturnValue(undefined);
const mockAcquireModelSlot = jest.fn<() => Promise<() => void>>().mockResolvedValue(() => {});

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
    query: mockQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: {},
        consultantReview: { enabled: false },
        tokenLimits: { reasoningExtraTokens: 4096 },
        subsystemTemperatures: {},
        subsystemRepeatPenalties: {},
        subsystemTopP: {},
        subsystemMinP: {},
        subsystemTopK: {},
        consultantTemperatures: {},
        consultantRepeatPenalties: {},
        consultantTopP: {},
        consultantMinP: {},
        consultantTopK: {},
    },
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../models/providers.js', () => ({
    callSingleModel: mockCallSingleModel,
}));

jest.unstable_mockModule('../../models/cost.js', () => ({
    applyReasoningBonus: mockApplyReasoningBonus,
    logUsage: mockLogUsage,
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

jest.unstable_mockModule('../../handlers/projects.js', () => ({
    getProjectAbortSignal: mockGetProjectAbortSignal,
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
    acquireModelSlot: mockAcquireModelSlot,
    reportRateLimit: jest.fn(),
}));

const {
    loadAssignmentCache,
    getAssignedModel,
    ensureAssignmentsLoaded,
    getSubsystemAssignments,
    setSubsystemAssignment,
    setSubsystemNoThink,
    setSubsystemThinking,
    hasConsultant,
    getConsultantModel,
    getConsultantAssignments,
    setConsultantAssignment,
    getNoThinkOverrides,
    getThinkingLevelOverrides,
    callSubsystemModel,
    callConsultantModel,
    consultantReview,
} = await import('../../models/assignments.js');

/** Helper: build a minimal DB row for a subsystem assignment */
function makeAssignmentRow(overrides: Record<string, any> = {}) {
    return {
        subsystem: 'voice',
        model_id: 'model-1',
        consultant_model_id: null,
        sa_no_think: null,
        sa_thinking_level: null,
        mr_id: 'model-1',
        name: 'Test Model',
        provider: 'openai',
        mr_model_id: 'gpt-4',
        tier: 'tier2',
        endpoint_url: null,
        api_key: null,
        enabled: 1,
        max_tokens: 4096,
        context_size: 128000,
        cost_per_1k: 0.01,
        sort_order: 0,
        max_retries: 3,
        retry_window_minutes: 2,
        max_concurrency: 1,
        request_pause_ms: 0,
        request_timeout: 180,
        rate_limit_backoff_ms: 120000,
        supports_tools: null,
        no_think: 0,
        input_cost_per_mtok: 5,
        output_cost_per_mtok: 15,
        tool_cost_per_mtok: 0,
        cr_id: null,
        cr_name: null,
        cr_provider: null,
        cr_model_id: null,
        cr_tier: null,
        cr_endpoint_url: null,
        cr_api_key: null,
        cr_enabled: null,
        cr_max_tokens: null,
        cr_context_size: null,
        cr_cost_per_1k: null,
        cr_sort_order: null,
        cr_max_retries: null,
        cr_retry_window_minutes: null,
        cr_max_concurrency: null,
        cr_request_pause_ms: null,
        cr_request_timeout: null,
        cr_rate_limit_backoff_ms: null,
        cr_supports_tools: null,
        cr_no_think: null,
        cr_input_cost_per_mtok: null,
        cr_output_cost_per_mtok: null,
        cr_tool_cost_per_mtok: null,
        ...overrides,
    };
}

/**
 * Convert assignment joined rows into model_registry rows for the model lookup query.
 * loadAssignmentCache() now makes 2 systemQuery calls:
 *   1. model_registry lookup (flat id/name/provider rows)
 *   2. subsystem_assignments JOIN (joined rows)
 * This helper extracts unique models from assignment rows for call #1.
 */
function toModelLookupRows(assignmentRows: any[]): any[] {
    const seen = new Set<string>();
    const models: any[] = [];
    for (const row of assignmentRows) {
        if (row.mr_id && !seen.has(row.mr_id)) {
            seen.add(row.mr_id);
            models.push({
                id: row.mr_id, name: row.name, provider: row.provider,
                model_id: row.mr_model_id, tier: row.tier, endpoint_url: row.endpoint_url,
                api_key: row.api_key, enabled: row.enabled ?? 1,
                max_tokens: row.max_tokens, context_size: row.context_size,
                cost_per_1k: row.cost_per_1k, sort_order: row.sort_order,
                max_retries: row.max_retries, retry_window_minutes: row.retry_window_minutes,
                max_concurrency: row.max_concurrency, request_pause_ms: row.request_pause_ms,
                request_timeout: row.request_timeout, rate_limit_backoff_ms: row.rate_limit_backoff_ms,
                supports_tools: row.supports_tools, no_think: row.no_think,
                input_cost_per_mtok: row.input_cost_per_mtok,
                output_cost_per_mtok: row.output_cost_per_mtok,
                tool_cost_per_mtok: row.tool_cost_per_mtok,
            });
        }
        if (row.cr_id && !seen.has(row.cr_id)) {
            seen.add(row.cr_id);
            models.push({
                id: row.cr_id, name: row.cr_name, provider: row.cr_provider,
                model_id: row.cr_model_id, tier: row.cr_tier, endpoint_url: row.cr_endpoint_url,
                api_key: row.cr_api_key, enabled: row.cr_enabled ?? 1,
                max_tokens: row.cr_max_tokens, context_size: row.cr_context_size,
                cost_per_1k: row.cr_cost_per_1k, sort_order: row.cr_sort_order,
                max_retries: row.cr_max_retries, retry_window_minutes: row.cr_retry_window_minutes,
                max_concurrency: row.cr_max_concurrency, request_pause_ms: row.cr_request_pause_ms,
                request_timeout: row.cr_request_timeout, rate_limit_backoff_ms: row.cr_rate_limit_backoff_ms,
                supports_tools: row.cr_supports_tools, no_think: row.cr_no_think,
                input_cost_per_mtok: row.cr_input_cost_per_mtok,
                output_cost_per_mtok: row.cr_output_cost_per_mtok,
                tool_cost_per_mtok: row.cr_tool_cost_per_mtok,
            });
        }
    }
    return models;
}

/** Mock both systemQuery calls for loadAssignmentCache: model lookup + assignment rows. */
function mockCacheLoad(assignmentRows: any[]) {
    mockQuery.mockResolvedValueOnce(toModelLookupRows(assignmentRows)); // call 1: model_registry
    mockQuery.mockResolvedValueOnce(assignmentRows);                    // call 2: subsystem_assignments
}

function makeConsultantRow(overrides: Record<string, any> = {}) {
    return makeAssignmentRow({
        cr_id: 'consultant-1',
        cr_name: 'Consultant Model',
        cr_provider: 'anthropic',
        cr_model_id: 'claude-3',
        cr_tier: 'tier2',
        cr_enabled: 1,
        cr_max_tokens: 8192,
        cr_context_size: 64000,
        cr_cost_per_1k: 0.02,
        cr_sort_order: 0,
        cr_max_retries: 2,
        cr_retry_window_minutes: 1,
        cr_max_concurrency: 1,
        cr_request_pause_ms: 0,
        cr_request_timeout: 120,
        cr_rate_limit_backoff_ms: 60000,
        cr_supports_tools: 1,
        cr_no_think: 0,
        cr_input_cost_per_mtok: 3,
        cr_output_cost_per_mtok: 15,
        cr_tool_cost_per_mtok: 0,
        ...overrides,
    });
}

beforeEach(async () => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGetPrompt.mockResolvedValue('prompt');
    mockLogDecision.mockResolvedValue(undefined);
    mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });
    mockApplyReasoningBonus.mockImplementation((_m: any, b: any) => b);
    mockLogUsage.mockResolvedValue(undefined);
    mockIsBudgetExceeded.mockReturnValue(false);
    mockGetProjectAbortSignal.mockReturnValue(undefined);
    mockAcquireModelSlot.mockResolvedValue(() => {});

    // Reset cache state by loading with empty DB
    await loadAssignmentCache();
    mockQuery.mockClear();
    mockEmitActivity.mockClear();
});

// =============================================================================
// callSubsystemModel
// =============================================================================

describe('callSubsystemModel', () => {
    it('throws when budget is exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);
        await expect(callSubsystemModel('voice', 'test')).rejects.toThrow('Budget exceeded');
    });

    it('throws when no model assigned', async () => {
        await expect(callSubsystemModel('voice', 'test')).rejects.toThrow('No model assigned');
    });

    it('calls the assigned model and returns text', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'result text', usage: null });

        const result = await callSubsystemModel('voice', 'test prompt');
        expect(result).toBe('result text');
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1);
    });

    it('uses maxTokens from options when provided', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test', { maxTokens: 1024 });

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBe(1024);
    });

    it('derives maxTokens from contextSize when maxTokens not set on model', async () => {
        mockCacheLoad([makeAssignmentRow({ max_tokens: null, context_size: 32000 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        // 32000 * 0.25 = 8000, capped at 16384 → 8000
        expect(callArgs.maxTokens).toBe(8000);
    });

    it('leaves maxTokens undefined when neither maxTokens nor contextSize available', async () => {
        mockCacheLoad([makeAssignmentRow({ max_tokens: null, context_size: null })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBeUndefined();
    });

    it('caps derived maxTokens at 16384', async () => {
        // Large context: 200000 * 0.25 = 50000, should be capped to 16384
        mockCacheLoad([makeAssignmentRow({ max_tokens: null, context_size: 200000 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBe(16384);
    });

    it('applies reasoning bonus when noThink is false', async () => {
        mockCacheLoad([makeAssignmentRow({ no_think: 0, sa_no_think: null })]);
        await loadAssignmentCache();
        mockApplyReasoningBonus.mockReturnValue(12288);
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        expect(mockApplyReasoningBonus).toHaveBeenCalledWith('gpt-4', 4096);
        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBe(12288);
    });

    it('skips reasoning bonus when noThink is true', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_no_think: 1 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        expect(mockApplyReasoningBonus).not.toHaveBeenCalled();
    });

    it('passes semaphore info to callSingleModel', async () => {
        mockCacheLoad([makeAssignmentRow({ max_concurrency: 3, request_pause_ms: 500 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const modelArg = (mockCallSingleModel.mock.calls[0] as any[])[0];
        expect(modelArg._registryId).toBe('model-1');
        expect(modelArg._maxConcurrency).toBe(3);
        expect(modelArg._requestPauseMs).toBe(500);
    });

    it('propagates errors from callSingleModel', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 1 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockRejectedValue(new Error('API error'));

        await expect(callSubsystemModel('voice', 'test')).rejects.toThrow('API error');
    });

    it('logs usage when result has usage data', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: 'ok',
            usage: { prompt_tokens: 100, completion_tokens: 50, tool_tokens: 0, total_tokens: 150 },
            finishReason: 'stop',
        });

        await callSubsystemModel('voice', 'test');

        expect(mockLogUsage).toHaveBeenCalledTimes(1);
        const usageArgs = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArgs.subsystem).toBe('voice');
        expect(usageArgs.inputTokens).toBe(100);
        expect(usageArgs.outputTokens).toBe(50);
    });

    it('emits call_start and call_complete events', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('call_start');
        expect(events).toContain('call_complete');
    });

    it('retries on non-rate-limit errors with backoff', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 3 })]);
        await loadAssignmentCache();

        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount < 3) throw new Error('Temporary error');
            return { text: 'ok', usage: null };
        });

        const result = await callSubsystemModel('voice', 'test');
        expect(result).toBe('ok');
        expect(callCount).toBe(3);
    });

    it('emits call_failed after all retries exhausted', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 1 })]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();
        mockCallSingleModel.mockRejectedValue(new Error('Permanent error'));

        await expect(callSubsystemModel('voice', 'test')).rejects.toThrow('Permanent error');

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('call_failed');
    });

    it('throws AbortError immediately without retrying', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 3 })]);
        await loadAssignmentCache();

        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        mockCallSingleModel.mockRejectedValue(abortErr);

        await expect(callSubsystemModel('voice', 'test')).rejects.toThrow('Aborted');
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1);
    });

    it('handles rate-limit errors with parsed wait time', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 2 })]);
        await loadAssignmentCache();

        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('429 rate limit, try again in 1s');
            return { text: 'ok', usage: null };
        });

        const result = await callSubsystemModel('voice', 'test');
        expect(result).toBe('ok');
        expect(callCount).toBe(2);

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('call_rate_limited');
    });

    it('uses default backoff when rate-limit has no parseable time', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 2, rate_limit_backoff_ms: 10 })]);
        await loadAssignmentCache();

        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('429 too many requests');
            return { text: 'ok', usage: null };
        });

        const result = await callSubsystemModel('voice', 'test');
        expect(result).toBe('ok');
    });

    it('passes endpoint and apiKey from model registry', async () => {
        mockCacheLoad([makeAssignmentRow({
            endpoint_url: 'https://custom.api/v1',
            api_key: 'sk-test-123',
        })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const modelArg = (mockCallSingleModel.mock.calls[0] as any[])[0];
        expect(modelArg.endpoint).toBe('https://custom.api/v1');
        expect(modelArg.apiKey).toBe('sk-test-123');
    });

    it('passes signal from options or falls back to project signal', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        const controller = new AbortController();
        await callSubsystemModel('voice', 'test', { signal: controller.signal });

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.signal).toBe(controller.signal);
    });

    it('uses project abort signal when no signal in options', async () => {
        const controller = new AbortController();
        mockGetProjectAbortSignal.mockReturnValue(controller.signal);
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.signal).toBe(controller.signal);
    });

    it('emits call_retry on retryable non-rate-limit errors', async () => {
        mockCacheLoad([makeAssignmentRow({ max_retries: 2 })]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();

        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('Connection reset');
            return { text: 'ok', usage: null };
        });

        await callSubsystemModel('voice', 'test');

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('call_retry');
    });
});

// =============================================================================
// callConsultantModel
// =============================================================================

describe('callConsultantModel', () => {
    it('throws when budget is exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);
        await expect(callConsultantModel('voice', 'test')).rejects.toThrow('Budget exceeded');
    });

    it('throws when no consultant model assigned', async () => {
        await expect(callConsultantModel('voice', 'test')).rejects.toThrow('No consultant model assigned');
    });

    it('calls the consultant model and returns text', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'consultant result', usage: null });

        const result = await callConsultantModel('voice', 'test prompt');
        expect(result).toBe('consultant result');
    });

    it('emits consultant_start and consultant_complete events', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callConsultantModel('voice', 'test');

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('consultant_start');
        expect(events).toContain('consultant_complete');
    });

    it('logs usage for consultant calls with :consultant suffix', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: 'ok',
            usage: { prompt_tokens: 200, completion_tokens: 100, tool_tokens: 0, total_tokens: 300 },
            finishReason: 'stop',
        });

        await callConsultantModel('voice', 'test');

        expect(mockLogUsage).toHaveBeenCalledTimes(1);
        const usageArgs = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArgs.subsystem).toBe('voice:consultant');
    });

    it('uses :review suffix when isReview option set', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: 'ok',
            usage: { prompt_tokens: 50, completion_tokens: 20, tool_tokens: 0, total_tokens: 70 },
        });

        await callConsultantModel('voice', 'test', { isReview: true });

        const usageArgs = (mockLogUsage.mock.calls[0] as any[])[0];
        expect(usageArgs.subsystem).toBe('voice:review');
    });

    it('retries on errors and emits consultant_failed when exhausted', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 1 })]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();
        mockCallSingleModel.mockRejectedValue(new Error('API down'));

        await expect(callConsultantModel('voice', 'test')).rejects.toThrow('API down');

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('consultant_failed');
    });

    it('throws AbortError immediately without retrying', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 3 })]);
        await loadAssignmentCache();

        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        mockCallSingleModel.mockRejectedValue(abortErr);

        await expect(callConsultantModel('voice', 'test')).rejects.toThrow('Aborted');
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1);
    });

    it('handles rate-limit errors with parsed "Xm Ys" pattern', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 2 })]);
        await loadAssignmentCache();

        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('Rate limit exceeded. Please try again in 0m1s.');
            return { text: 'ok', usage: null };
        });

        const result = await callConsultantModel('voice', 'test');
        expect(result).toBe('ok');
    });

    it('passes semaphore info to callSingleModel', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_concurrency: 2, cr_request_pause_ms: 300 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callConsultantModel('voice', 'test');

        const modelArg = (mockCallSingleModel.mock.calls[0] as any[])[0];
        expect(modelArg._registryId).toBeDefined();
        expect(modelArg._maxConcurrency).toBe(2);
        expect(modelArg._requestPauseMs).toBe(300);
    });

    it('derives maxTokens from consultant contextSize', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_tokens: null, cr_context_size: 40000 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callConsultantModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        // 40000 * 0.25 = 10000, capped at 16384 → 10000
        expect(callArgs.maxTokens).toBe(10000);
    });

    it('leaves maxTokens undefined when consultant has no maxTokens or contextSize', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_tokens: null, cr_context_size: null })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callConsultantModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBeUndefined();
    });

    it('uses default temperature 0.15 for consultant calls', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callConsultantModel('voice', 'test');

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.temperature).toBe(0.15);
    });
});

// =============================================================================
// consultantReview
// =============================================================================

describe('consultantReview', () => {
    it('returns null when no consultant assigned', async () => {
        const result = await consultantReview('voice', 'output', {});
        expect(result).toBeNull();
    });

    it('returns null when budget is exceeded', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockIsBudgetExceeded.mockReturnValue(true);

        const result = await consultantReview('voice', 'output', {});
        expect(result).toBeNull();
    });

    it('calls consultant model and returns parsed review', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 8, accept: true, reasoning: 'Good quality output' }),
            usage: { prompt_tokens: 100, completion_tokens: 50, tool_tokens: 0, total_tokens: 150 },
        });

        const result = await consultantReview('voice', 'primary output', {
            claim: 'test claim',
            domain: 'test-domain',
        });

        expect(result).not.toBeNull();
        expect(result!.accept).toBe(true);
        expect(result!.score).toBe(8);
        expect(result!.reasoning).toBe('Good quality output');
    });

    it('clamps score to 0-10 range', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 15, accept: true, reasoning: 'Over' }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.score).toBe(10);
    });

    it('clamps negative score to 0', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: -5, accept: false, reasoning: 'Bad' }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.score).toBe(0);
    });

    it('includes revisedOutput when present and non-empty', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 6, accept: false, reasoning: 'Needs fix', revisedOutput: 'Better version' }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.revisedOutput).toBe('Better version');
    });

    it('omits revisedOutput when empty string', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 7, accept: true, reasoning: 'Ok', revisedOutput: '  ' }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.revisedOutput).toBeUndefined();
    });

    it('logs decision when nodeId provided', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 9, accept: true, reasoning: 'Excellent' }),
            usage: null,
        });

        await consultantReview('voice', 'output', { nodeId: 'node-123' });

        expect(mockLogDecision).toHaveBeenCalledTimes(1);
        const args = mockLogDecision.mock.calls[0] as any[];
        expect(args[0]).toBe('node');
        expect(args[1]).toBe('node-123');
        expect(args[2]).toBe('consultant_accept');
    });

    it('logs consultant_reject decision for rejected reviews', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 2, accept: false, reasoning: 'Low quality' }),
            usage: null,
        });

        await consultantReview('voice', 'output', { nodeId: 'node-456' });

        const args = mockLogDecision.mock.calls[0] as any[];
        expect(args[2]).toBe('consultant_reject');
    });

    it('returns null on non-abort errors (review failure is non-fatal)', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 1 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockRejectedValue(new Error('Connection failed'));

        const result = await consultantReview('voice', 'output', {});
        expect(result).toBeNull();
    });

    it('rethrows AbortError', async () => {
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 1 })]);
        await loadAssignmentCache();
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        mockCallSingleModel.mockRejectedValue(abortErr);

        await expect(consultantReview('voice', 'output', {})).rejects.toThrow('Aborted');
    });

    it('emits consultant_review activity event', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockEmitActivity.mockClear();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 7, accept: true, reasoning: 'Good' }),
            usage: null,
        });

        await consultantReview('voice', 'output', {});

        const events = mockEmitActivity.mock.calls.map((c: any) => c[1]);
        expect(events).toContain('consultant_review');
    });

    it('handles JSON embedded in surrounding text', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: 'Here is my review: {"score": 5, "accept": true, "reasoning": "decent"} end',
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.score).toBe(5);
        expect(result!.accept).toBe(true);
    });

    it('truncates reasoning to 500 characters', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        const longReasoning = 'x'.repeat(600);
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 5, accept: true, reasoning: longReasoning }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.reasoning.length).toBe(500);
    });

    it('defaults score to 0 for non-numeric score', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({
            text: JSON.stringify({ score: 'invalid', accept: true, reasoning: 'ok' }),
            usage: null,
        });

        const result = await consultantReview('voice', 'output', {});
        expect(result!.score).toBe(0);
    });
});

// =============================================================================
// setConsultantAssignment
// =============================================================================

describe('setConsultantAssignment', () => {
    it('throws for invalid subsystem', async () => {
        await expect(setConsultantAssignment('invalid' as any, 'model-1')).rejects.toThrow('Invalid subsystem');
    });

    it('inserts consultant_model_id in DB', async () => {
        mockQuery.mockResolvedValue([]);
        await setConsultantAssignment('voice', 'consultant-model-id');

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('consultant_model_id')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1][0]).toBe('voice');
        expect(insertCall[1][1]).toBe('consultant-model-id');
    });

    it('allows null to clear consultant assignment', async () => {
        mockQuery.mockResolvedValue([]);
        await setConsultantAssignment('voice', null);

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('consultant_model_id')
        );
        expect(insertCall[1][1]).toBeNull();
    });

    it('reloads assignment cache after update', async () => {
        mockQuery.mockResolvedValue([]);
        await setConsultantAssignment('voice', 'model-1');

        // loadAssignmentCache is called after the insert, which queries both
        // system and project DBs — verify a SELECT on subsystem_assignments exists
        const selectCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('subsystem_assignments') && String(sql).includes('SELECT')
        );
        expect(selectCall).toBeDefined();
    });
});

// =============================================================================
// loadAssignmentCache — edge cases
// =============================================================================

describe('loadAssignmentCache edge cases', () => {
    it('handles multiple subsystem rows', async () => {
        mockCacheLoad([
            makeAssignmentRow({ subsystem: 'voice', mr_id: 'm1', name: 'Voice Model', mr_model_id: 'voice-model' }),
            makeAssignmentRow({ subsystem: 'synthesis', mr_id: 'm2', name: 'Synth Model', mr_model_id: 'synth-model' }),
            makeAssignmentRow({ subsystem: 'chat', mr_id: 'm3', name: 'Chat Model', mr_model_id: 'chat-model' }),
        ]);
        await loadAssignmentCache();

        expect(getAssignedModel('voice')!.name).toBe('Voice Model');
        expect(getAssignedModel('synthesis')!.name).toBe('Synth Model');
        expect(getAssignedModel('chat')!.name).toBe('Chat Model');
        expect(getAssignedModel('research')).toBeNull();
    });

    it('handles row with mr_id but no name (disabled/missing model)', async () => {
        mockCacheLoad([makeAssignmentRow({ mr_id: null, name: null })]);
        await loadAssignmentCache();
        expect(getAssignedModel('voice')).toBeNull();
    });

    it('falls back no_think from model when no subsystem override', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_no_think: null, no_think: 1 })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        expect(model.noThink).toBe(true);
        expect(model.thinkingLevel).toBe('off');
    });

    it('sa_no_think=false overrides model no_think=true', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_no_think: 0, no_think: 1 })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        // sa_no_think=false → effectiveThinkingLevel=null → noThink=false
        expect(model.noThink).toBe(false);
        expect(model.thinkingLevel).toBeNull();
    });

    it('consultant cache uses model own no_think', async () => {
        mockCacheLoad([makeConsultantRow({ cr_no_think: 1 })]);
        await loadAssignmentCache();

        const consultant = getConsultantModel('voice')!;
        expect(consultant.noThink).toBe(true);
        expect(consultant.thinkingLevel).toBe('off');
    });

    it('consultant with cr_no_think=0 has noThink=false', async () => {
        mockCacheLoad([makeConsultantRow({ cr_no_think: 0 })]);
        await loadAssignmentCache();

        const consultant = getConsultantModel('voice')!;
        expect(consultant.noThink).toBe(false);
        expect(consultant.thinkingLevel).toBeNull();
    });

    it('normalizes provider aliases (e.g., ollama → local)', async () => {
        mockCacheLoad([makeAssignmentRow({ provider: 'ollama' })]);
        await loadAssignmentCache();
        expect(getAssignedModel('voice')!.provider).toBe('local');
    });

    it('defaults tier to medium when null', async () => {
        mockCacheLoad([makeAssignmentRow({ tier: null })]);
        await loadAssignmentCache();
        expect(getAssignedModel('voice')!.tier).toBe('medium');
    });

    it('defaults consultant tier to tier1 when null', async () => {
        mockCacheLoad([makeConsultantRow({ cr_tier: null })]);
        await loadAssignmentCache();
        expect(getConsultantModel('voice')!.tier).toBe('tier1');
    });

    it('defaults cost fields to 0 when null', async () => {
        mockCacheLoad([makeAssignmentRow({
            cost_per_1k: null,
            input_cost_per_mtok: null,
            output_cost_per_mtok: null,
            tool_cost_per_mtok: null,
        })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        expect(model.costPer1k).toBe(0);
        expect(model.inputCostPerMtok).toBe(0);
        expect(model.outputCostPerMtok).toBe(0);
        expect(model.toolCostPerMtok).toBe(0);
    });

    it('defaults retry and concurrency fields', async () => {
        mockCacheLoad([makeAssignmentRow({
            max_retries: null,
            retry_window_minutes: null,
            max_concurrency: null,
            request_pause_ms: null,
            request_timeout: null,
            rate_limit_backoff_ms: null,
        })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        expect(model.maxRetries).toBe(3);
        expect(model.retryWindowMinutes).toBe(2);
        expect(model.maxConcurrency).toBe(1);
        expect(model.requestPauseMs).toBe(0);
        expect(model.requestTimeout).toBe(180);
        expect(model.rateLimitBackoffMs).toBe(120000);
    });

    it('maps supports_tools for consultant: 1→true, 0→false, null→null', async () => {
        // Test true case
        mockCacheLoad([makeConsultantRow({ cr_supports_tools: 1 })]);
        await loadAssignmentCache();
        expect(getConsultantModel('voice')!.supportsTools).toBe(true);

        // Test false case
        mockCacheLoad([makeConsultantRow({ cr_supports_tools: 0 })]);
        await loadAssignmentCache();
        expect(getConsultantModel('voice')!.supportsTools).toBe(false);

        // Test null case
        mockCacheLoad([makeConsultantRow({ cr_supports_tools: null })]);
        await loadAssignmentCache();
        expect(getConsultantModel('voice')!.supportsTools).toBeNull();
    });
});

// =============================================================================
// ensureAssignmentsLoaded
// =============================================================================

describe('ensureAssignmentsLoaded (detailed)', () => {
    it('does not re-query when already loaded', async () => {
        // Cache was loaded in beforeEach
        mockQuery.mockClear();
        await ensureAssignmentsLoaded();
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// =============================================================================
// getSubsystemAssignments / getConsultantAssignments — detailed
// =============================================================================

describe('getSubsystemAssignments (detailed)', () => {
    it('has entries for all VALID_SUBSYSTEMS', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();
        const assignments = await getSubsystemAssignments();

        // Check a sampling of known subsystems
        expect('voice' in assignments).toBe(true);
        expect('synthesis' in assignments).toBe(true);
        expect('chat' in assignments).toBe(true);
        expect('embedding' in assignments).toBe(true);
        expect('evm_analysis' in assignments).toBe(true);
    });
});

describe('getConsultantAssignments (detailed)', () => {
    it('returns populated consultant for assigned subsystem', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();

        const assignments = await getConsultantAssignments();
        expect(assignments.voice).not.toBeNull();
        expect(assignments.voice!.name).toBe('Consultant Model');
        expect(assignments.synthesis).toBeNull();
    });
});

// =============================================================================
// setSubsystemAssignment — noThink conversion edge cases
// =============================================================================

describe('setSubsystemAssignment noThink conversion', () => {
    it('converts noThink=false to 0', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemAssignment('voice', 'model-1', false, { baseline: true });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO subsystem_assignments')
        );
        expect(insertCall[1][2]).toBe(0);
    });

    it('converts noThink=undefined to null', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemAssignment('voice', 'model-1', undefined, { baseline: true });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO subsystem_assignments')
        );
        expect(insertCall[1][2]).toBeNull();
    });
});

// =============================================================================
// setSubsystemNoThink — edge cases
// =============================================================================

describe('setSubsystemNoThink edge cases', () => {
    it('converts noThink=false to 0', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemNoThink('voice', false);

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE subsystem_assignments SET no_think')
        );
        expect(updateCall[1][0]).toBe(0);
    });
});

// =============================================================================
// setSubsystemThinking — valid levels
// =============================================================================

describe('setSubsystemThinking valid levels', () => {
    for (const level of ['off', 'low', 'medium', 'high']) {
        it(`accepts valid level: ${level}`, async () => {
            mockQuery.mockResolvedValue([]);
            await expect(setSubsystemThinking('voice', level)).resolves.not.toThrow();
        });
    }
});

// =============================================================================
// callSubsystemModel — rate limit error patterns
// =============================================================================

describe('callSubsystemModel rate-limit patterns', () => {
    async function setupAndCallWithRateLimit(errorMsg: string): Promise<string> {
        mockCacheLoad([makeAssignmentRow({ max_retries: 2, rate_limit_backoff_ms: 10 })]);
        await loadAssignmentCache();
        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error(errorMsg);
            return { text: 'ok', usage: null };
        });

        // Use fake timers so parsed wait times don't cause real delays
        jest.useFakeTimers();
        const promise = callSubsystemModel('voice', 'test');
        // Advance past any setTimeout delay
        await jest.advanceTimersByTimeAsync(300000);
        const result = await promise;
        jest.useRealTimers();
        return result;
    }

    it('detects "429" in error message', async () => {
        const result = await setupAndCallWithRateLimit('Error: 429 Too Many Requests');
        expect(result).toBe('ok');
    });

    it('detects "rate limit" in error message', async () => {
        const result = await setupAndCallWithRateLimit('Rate limit exceeded');
        expect(result).toBe('ok');
    });

    it('detects "rate_limit" in error message', async () => {
        const result = await setupAndCallWithRateLimit('rate_limit_exceeded');
        expect(result).toBe('ok');
    });

    it('detects "too many requests" in error message', async () => {
        const result = await setupAndCallWithRateLimit('too many requests, please wait');
        expect(result).toBe('ok');
    });

    it('parses "Xm Ys" wait time pattern', async () => {
        const result = await setupAndCallWithRateLimit('429: try again in 1m26.4s');
        expect(result).toBe('ok');
    });

    it('parses seconds-only pattern', async () => {
        const result = await setupAndCallWithRateLimit('429 rate limit, retry after 30 seconds');
        expect(result).toBe('ok');
    });

    it('parses minutes-only pattern', async () => {
        // "2 minutes" = 120000ms, needs retry window > 120s to avoid exhaustion
        mockCacheLoad([makeAssignmentRow({ max_retries: 2, rate_limit_backoff_ms: 10, retry_window_minutes: 5 })]);
        await loadAssignmentCache();
        let callCount = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('429 wait 2 minutes');
            return { text: 'ok', usage: null };
        });
        jest.useFakeTimers();
        const promise = callSubsystemModel('voice', 'test');
        await jest.advanceTimersByTimeAsync(300000);
        const result = await promise;
        jest.useRealTimers();
        expect(result).toBe('ok');
    });

    it('parses "Xs" shorthand', async () => {
        const result = await setupAndCallWithRateLimit('429 try again in 5s');
        expect(result).toBe('ok');
    });
});

// =============================================================================
// callSubsystemModel — maxTokens from options takes precedence
// =============================================================================

describe('callSubsystemModel maxTokens precedence', () => {
    it('options.maxTokens overrides model registry maxTokens', async () => {
        mockCacheLoad([makeAssignmentRow({ max_tokens: 4096 })]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });

        await callSubsystemModel('voice', 'test', { maxTokens: 2048 });

        const callArgs = (mockCallSingleModel.mock.calls[0] as any[])[2];
        expect(callArgs.maxTokens).toBe(2048);
    });
});

// =============================================================================
// callSubsystemModel — handles no usage in result
// =============================================================================

describe('callSubsystemModel usage handling', () => {
    it('does not log usage when result has no usage data', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();
        mockCallSingleModel.mockResolvedValue({ text: 'ok' });

        await callSubsystemModel('voice', 'test');
        expect(mockLogUsage).not.toHaveBeenCalled();
    });
});
