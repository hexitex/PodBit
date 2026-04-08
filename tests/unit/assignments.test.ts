/**
 * Unit tests for models/assignments.ts —
 * loadAssignmentCache, getAssignedModel, ensureAssignmentsLoaded,
 * getSubsystemAssignments, setSubsystemAssignment, setSubsystemNoThink,
 * setSubsystemThinking, hasConsultant, getConsultantModel,
 * getNoThinkOverrides, getThinkingLevelOverrides.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockEmitActivity = jest.fn<() => void>();
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt');
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCallSingleModel = jest.fn<() => Promise<any>>().mockResolvedValue({ text: '' });
const mockApplyReasoningBonus = jest.fn((t: any) => t);
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
    getNoThinkOverrides,
    getThinkingLevelOverrides,
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
 *   1. model_registry lookup (flat rows with id, name, provider, ...)
 *   2. subsystem_assignments JOIN (joined rows with mr_id, sa_no_think, ...)
 * This helper extracts unique models from assignment rows for call #1.
 */
function toModelLookupRows(assignmentRows: any[]): any[] {
    const seen = new Set<string>();
    const models: any[] = [];
    for (const row of assignmentRows) {
        // Primary model
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
        // Consultant model
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

beforeEach(async () => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGetPrompt.mockResolvedValue('prompt');
    mockLogDecision.mockResolvedValue(undefined);
    mockCallSingleModel.mockResolvedValue({ text: '' });
    mockApplyReasoningBonus.mockImplementation((t: any) => t);
    mockLogUsage.mockResolvedValue(undefined);
    mockIsBudgetExceeded.mockReturnValue(false);
    mockGetProjectAbortSignal.mockReturnValue(undefined);
    mockAcquireModelSlot.mockResolvedValue(() => {});

    // Reset cache state by loading with empty DB
    await loadAssignmentCache();

    // Clear call history from beforeEach so tests start clean
    mockQuery.mockClear();
});

// =============================================================================
// loadAssignmentCache
// =============================================================================

describe('loadAssignmentCache', () => {
    it('clears cache to null when no assignments in DB', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();
        expect(getAssignedModel('voice')).toBeNull();
    });

    it('populates cache from DB rows', async () => {
        mockCacheLoad([makeAssignmentRow()]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice');
        expect(model).not.toBeNull();
        expect(model!.name).toBe('Test Model');
        expect(model!.provider).toBe('openai');
        expect(model!.modelId).toBe('gpt-4');
        expect(model!.tier).toBe('tier2');
        expect(model!.maxTokens).toBe(4096);
    });

    it('maps enabled field: 1→true', async () => {
        mockCacheLoad([makeAssignmentRow({ enabled: 1 })]);
        await loadAssignmentCache();
        expect(getAssignedModel('voice')!.enabled).toBe(true);
    });

    it('maps supports_tools: 1→true, 0→false, null→null', async () => {
        mockCacheLoad([
            makeAssignmentRow({ subsystem: 'voice', supports_tools: 1 }),
            makeAssignmentRow({ subsystem: 'research', mr_id: 'm2', name: 'M2', supports_tools: 0 }),
            makeAssignmentRow({ subsystem: 'synthesis', mr_id: 'm3', name: 'M3', supports_tools: null }),
        ]);
        await loadAssignmentCache();

        expect(getAssignedModel('voice')!.supportsTools).toBe(true);
        expect(getAssignedModel('research')!.supportsTools).toBe(false);
        expect(getAssignedModel('synthesis')!.supportsTools).toBeNull();
    });

    it('applies sa_no_think override: true→noThink=true, thinkingLevel="off"', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_no_think: 1, no_think: 0 })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        expect(model.noThink).toBe(true);
        expect(model.thinkingLevel).toBe('off');
    });

    it('applies sa_thinking_level override over no_think', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_thinking_level: 'high', sa_no_think: 1 })]);
        await loadAssignmentCache();

        const model = getAssignedModel('voice')!;
        expect(model.thinkingLevel).toBe('high');
        expect(model.noThink).toBe(false); // 'high' ≠ 'off'
    });

    it('populates consultant cache when cr_id present', async () => {
        mockCacheLoad([makeAssignmentRow({
            cr_id: 'consultant-1',
            cr_name: 'Consultant Model',
            cr_provider: 'anthropic',
            cr_model_id: 'claude-3',
            cr_tier: 'tier2',
            cr_enabled: 1,
            cr_max_tokens: 8192,
            cr_max_retries: 2,
            cr_retry_window_minutes: 1,
            cr_max_concurrency: 1,
            cr_request_pause_ms: 0,
            cr_request_timeout: 120,
            cr_rate_limit_backoff_ms: 60000,
            cr_no_think: 0,
        })]);
        await loadAssignmentCache();

        expect(hasConsultant('voice')).toBe(true);
        const consultant = getConsultantModel('voice');
        expect(consultant!.name).toBe('Consultant Model');
        expect(consultant!.provider).toBe('anthropic');
    });
});

// =============================================================================
// getAssignedModel / ensureAssignmentsLoaded / getSubsystemAssignments
// =============================================================================

describe('getAssignedModel', () => {
    it('returns null for unassigned subsystem', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();
        expect(getAssignedModel('synthesis')).toBeNull();
    });

    it('returns the registered model for an assigned subsystem', async () => {
        mockCacheLoad([makeAssignmentRow({ subsystem: 'synthesis', mr_id: 'syn-1', name: 'SynModel' })]);
        await loadAssignmentCache();
        expect(getAssignedModel('synthesis')!.name).toBe('SynModel');
    });
});

describe('ensureAssignmentsLoaded', () => {
    it('loads cache when not yet loaded', async () => {
        // The cache was loaded in beforeEach; calling ensureAssignmentsLoaded
        // when already loaded should not re-query
        const callCountBefore = mockQuery.mock.calls.length;
        await ensureAssignmentsLoaded();
        expect(mockQuery.mock.calls.length).toBe(callCountBefore); // no extra query
    });
});

describe('getSubsystemAssignments', () => {
    it('returns all subsystems with null for unassigned', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();
        const assignments = await getSubsystemAssignments();

        expect(typeof assignments).toBe('object');
        expect(assignments.voice).toBeNull();
        expect(assignments.synthesis).toBeNull();
    });

    it('returns populated model for assigned subsystem', async () => {
        mockCacheLoad([makeAssignmentRow({ subsystem: 'voice' })]);
        await loadAssignmentCache();

        const assignments = await getSubsystemAssignments();
        expect(assignments.voice).not.toBeNull();
        expect(assignments.voice!.name).toBe('Test Model');
    });
});

// =============================================================================
// setSubsystemAssignment
// =============================================================================

describe('setSubsystemAssignment', () => {
    it('throws for invalid subsystem', async () => {
        await expect(setSubsystemAssignment('invalid-sub' as any, 'model-1')).rejects.toThrow('Invalid subsystem');
    });

    it('inserts/updates the assignment in project DB', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemAssignment('voice', 'model-123');

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('project_assignments')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1][0]).toBe('voice');
        expect(insertCall[1][1]).toBe('model-123');
    });

    it('stores null when clearing assignment', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemAssignment('voice', null);

        const [, params] = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('project_assignments')
        );
        expect(params[1]).toBeNull();
    });

    it('converts noThink boolean to DB integer in baseline mode', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemAssignment('voice', 'model-1', true, { baseline: true });

        const [, params] = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('subsystem_assignments')
        );
        expect(params[2]).toBe(1); // true → 1
    });
});

// =============================================================================
// setSubsystemNoThink / setSubsystemThinking
// =============================================================================

describe('setSubsystemNoThink', () => {
    it('throws for invalid subsystem', async () => {
        await expect(setSubsystemNoThink('bad' as any, true)).rejects.toThrow('Invalid subsystem');
    });

    it('updates no_think=1 in DB for true', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemNoThink('synthesis', true);

        const [_sql, params] = (mockQuery.mock.calls as any[]).find(([s]: any[]) =>
            String(s).includes('no_think')
        );
        expect(params[0]).toBe(1);
        expect(params[1]).toBe('synthesis');
    });

    it('updates no_think=NULL in DB for null (inherit)', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemNoThink('synthesis', null);

        const [, params] = (mockQuery.mock.calls as any[]).find(([s]: any[]) =>
            String(s).includes('no_think')
        );
        expect(params[0]).toBeNull();
    });
});

describe('setSubsystemThinking', () => {
    it('throws for invalid subsystem', async () => {
        await expect(setSubsystemThinking('bad' as any, 'high')).rejects.toThrow('Invalid subsystem');
    });

    it('throws for invalid thinking level', async () => {
        await expect(setSubsystemThinking('voice', 'ultra')).rejects.toThrow('Invalid thinking level');
    });

    it('updates thinking_level in DB for valid level', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemThinking('voice', 'medium');

        const [_sql, params] = (mockQuery.mock.calls as any[]).find(([s]: any[]) =>
            String(s).includes('thinking_level')
        );
        expect(params[0]).toBe('medium');
        expect(params[1]).toBe('voice');
    });

    it('allows null to clear thinking level', async () => {
        mockQuery.mockResolvedValue([]);
        await setSubsystemThinking('voice', null);

        const [, params] = (mockQuery.mock.calls as any[]).find(([s]: any[]) =>
            String(s).includes('thinking_level')
        );
        expect(params[0]).toBeNull();
    });
});

// =============================================================================
// getNoThinkOverrides / getThinkingLevelOverrides
// =============================================================================

describe('getNoThinkOverrides', () => {
    it('returns null for subsystems without override', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();

        const overrides = getNoThinkOverrides();
        expect(overrides.voice).toBeNull();
        expect(overrides.synthesis).toBeNull();
    });

    it('returns true when sa_no_think=1', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_no_think: 1 })]);
        await loadAssignmentCache();

        expect(getNoThinkOverrides().voice).toBe(true);
    });
});

describe('getThinkingLevelOverrides', () => {
    it('returns null for subsystems without override', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();

        const overrides = getThinkingLevelOverrides();
        expect(overrides.voice).toBeNull();
    });

    it('returns the level when sa_thinking_level is set', async () => {
        mockCacheLoad([makeAssignmentRow({ sa_thinking_level: 'low' })]);
        await loadAssignmentCache();

        expect(getThinkingLevelOverrides().voice).toBe('low');
    });
});

// =============================================================================
// hasConsultant / getConsultantModel / getConsultantAssignments
// =============================================================================

describe('hasConsultant', () => {
    it('returns false when no consultant assigned', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();
        expect(hasConsultant('voice')).toBe(false);
    });

    it('returns true when consultant is assigned', async () => {
        mockCacheLoad([makeAssignmentRow({
            cr_id: 'c1', cr_name: 'Consultant', cr_provider: 'anthropic',
            cr_model_id: 'claude', cr_tier: 'tier2', cr_enabled: 1,
            cr_max_retries: 2, cr_retry_window_minutes: 1,
            cr_max_concurrency: 1, cr_request_pause_ms: 0,
            cr_request_timeout: 120, cr_rate_limit_backoff_ms: 60000,
            cr_no_think: 0,
        })]);
        await loadAssignmentCache();
        expect(hasConsultant('voice')).toBe(true);
    });
});

describe('getConsultantAssignments', () => {
    it('returns all-null when no consultants configured', async () => {
        mockQuery.mockResolvedValue([]);
        await loadAssignmentCache();

        const assignments = await getConsultantAssignments();
        expect(assignments.voice).toBeNull();
        expect(assignments.synthesis).toBeNull();
    });
});
