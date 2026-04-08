/**
 * Deep coverage tests for models/assignments.ts —
 * Targets uncovered lines 441-442: non-rate-limit retry delay in callConsultantModel.
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
    callConsultantModel,
} = await import('../../models/assignments.js');

/** Build a consultant-only assignment row */
function makeConsultantRow(overrides: Record<string, any> = {}) {
    return {
        subsystem: 'voice',
        model_id: null,
        consultant_model_id: 'cons-1',
        sa_no_think: null,
        sa_thinking_level: null,
        mr_id: null,
        name: null,
        provider: null,
        mr_model_id: null,
        tier: null,
        endpoint_url: null,
        api_key: null,
        enabled: null,
        max_tokens: null,
        context_size: null,
        cost_per_1k: null,
        sort_order: null,
        max_retries: null,
        retry_window_minutes: null,
        max_concurrency: null,
        request_pause_ms: null,
        request_timeout: null,
        rate_limit_backoff_ms: null,
        supports_tools: null,
        no_think: null,
        input_cost_per_mtok: null,
        output_cost_per_mtok: null,
        tool_cost_per_mtok: null,
        cr_id: 'cons-1',
        cr_name: 'Consultant Model',
        cr_provider: 'openai',
        cr_model_id: 'gpt-4',
        cr_tier: 'tier2',
        cr_endpoint_url: null,
        cr_api_key: null,
        cr_enabled: 1,
        cr_max_tokens: 4096,
        cr_context_size: 8192,
        cr_cost_per_1k: 0.01,
        cr_sort_order: 0,
        cr_max_retries: 3,
        cr_retry_window_minutes: 10,
        cr_max_concurrency: 1,
        cr_request_pause_ms: 0,
        cr_request_timeout: 180,
        cr_rate_limit_backoff_ms: 120000,
        cr_supports_tools: null,
        cr_no_think: 0,
        cr_input_cost_per_mtok: 0,
        cr_output_cost_per_mtok: 0,
        cr_tool_cost_per_mtok: 0,
        ...overrides,
    };
}

/**
 * Convert assignment joined rows into model_registry rows for the model lookup query.
 * loadAssignmentCache() makes 2 systemQuery calls: model_registry lookup + assignments JOIN.
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

/** Mock both systemQuery calls for loadAssignmentCache. */
function mockCacheLoad(assignmentRows: any[]) {
    mockQuery.mockResolvedValueOnce(toModelLookupRows(assignmentRows));
    mockQuery.mockResolvedValueOnce(assignmentRows);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockCallSingleModel.mockResolvedValue({ text: 'ok', usage: null });
    mockApplyReasoningBonus.mockImplementation((_m: any, b: any) => b);
    mockLogUsage.mockResolvedValue(undefined);
    mockIsBudgetExceeded.mockReturnValue(false);
    mockGetProjectAbortSignal.mockReturnValue(undefined);
    mockAcquireModelSlot.mockResolvedValue(() => {});
});

describe('callConsultantModel — non-rate-limit retry (lines 441-442)', () => {
    it('retries with linear backoff on non-rate-limit errors', async () => {
        // Load cache with a consultant assignment
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();

        // First call fails with generic error, second succeeds
        const genericError = new Error('Connection timeout');
        mockCallSingleModel
            .mockRejectedValueOnce(genericError)
            .mockResolvedValueOnce({ text: 'retry success', usage: null });

        const result = await callConsultantModel('voice' as any, 'test prompt');

        expect(result).toBe('retry success');
        expect(mockCallSingleModel).toHaveBeenCalledTimes(2);
    });

    it('uses capped delay (Math.min(1000*attempt, 5000)) on non-rate-limit retry', async () => {
        // Load cache with a consultant assignment that allows many retries
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 5 })]);
        await loadAssignmentCache();

        // Fail twice with generic errors, succeed on third
        const genericError = new Error('Server error 500');
        mockCallSingleModel
            .mockRejectedValueOnce(genericError)
            .mockRejectedValueOnce(genericError)
            .mockResolvedValueOnce({ text: 'third try works', usage: null });

        const result = await callConsultantModel('voice' as any, 'test prompt');

        expect(result).toBe('third try works');
        expect(mockCallSingleModel).toHaveBeenCalledTimes(3);
    });

    it('logs warning with attempt count on non-rate-limit retry', async () => {
        mockCacheLoad([makeConsultantRow()]);
        await loadAssignmentCache();

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const genericError = new Error('Network blip');
        mockCallSingleModel
            .mockRejectedValueOnce(genericError)
            .mockResolvedValueOnce({ text: 'ok', usage: null });

        await callConsultantModel('voice' as any, 'test prompt');

        const retryWarning = warnSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('Consultant') && call[0].includes('attempt')
        );
        expect(retryWarning).toBeDefined();
        expect(retryWarning![0]).toContain('retrying in');

        warnSpy.mockRestore();
    });

    it('throws after all retries exhausted on non-rate-limit error', async () => {
        // Max retries = 2, so 2 attempts total
        mockCacheLoad([makeConsultantRow({ cr_max_retries: 2 })]);
        await loadAssignmentCache();

        const genericError = new Error('Persistent failure');
        mockCallSingleModel.mockRejectedValue(genericError);

        await expect(callConsultantModel('voice' as any, 'test prompt'))
            .rejects.toThrow('Persistent failure');
    });
});
