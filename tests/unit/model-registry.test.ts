/**
 * Unit tests for models/registry.ts — CRUD operations for model_registry.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLoadAssignmentCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetApiKey = jest.fn<(provider: string) => string | null>().mockReturnValue(null);
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('generated-uuid');
const mockNormalizeProvider = jest.fn<(p: string) => string>().mockImplementation(p => p);
const mockResolveProviderEndpoint = jest.fn<() => string | null>().mockReturnValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
    systemQueryOne: mockQueryOne,
    query: mockQuery,
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    loadAssignmentCache: mockLoadAssignmentCache,
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    getApiKey: mockGetApiKey,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    normalizeProvider: mockNormalizeProvider,
    resolveProviderEndpoint: mockResolveProviderEndpoint,
    generateUuid: mockGenerateUuid,
    VALID_SUBSYSTEMS: ['chat', 'voice', 'synthesis'],
    getModelProvider: jest.fn<() => string>().mockReturnValue('openai'),
}));

const { getRegisteredModels, registerModel, updateRegisteredModel, deleteRegisteredModel } =
    await import('../../models/registry.js');

// Sample DB row matching the SELECT columns
const SAMPLE_ROW = {
    id: 'model-1',
    name: 'GPT-4',
    provider: 'openai',
    model_id: 'gpt-4',
    tier: 'large',
    endpoint_url: null,
    api_key: null,
    enabled: 1,
    max_tokens: 4096,
    context_size: 128000,
    cost_per_1k: 0.03,
    input_cost_per_mtok: 30,
    output_cost_per_mtok: 60,
    tool_cost_per_mtok: 0,
    sort_order: 10,
    max_retries: 3,
    retry_window_minutes: 2,
    max_concurrency: 1,
    request_pause_ms: 0,
    request_timeout: 180,
    rate_limit_backoff_ms: 120000,
    supports_tools: 1,
    no_think: 0,
};

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLoadAssignmentCache.mockResolvedValue(undefined);
    mockGetApiKey.mockReturnValue(null);
    mockGenerateUuid.mockReturnValue('generated-uuid');
    mockNormalizeProvider.mockImplementation(p => p);
});

// =============================================================================
// getRegisteredModels
// =============================================================================

describe('getRegisteredModels', () => {
    it('returns empty array when no models registered', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getRegisteredModels();
        expect(result).toEqual([]);
    });

    it('maps DB rows to RegisteredModel objects', async () => {
        mockQuery.mockResolvedValue([SAMPLE_ROW]);

        const result = await getRegisteredModels();

        expect(result).toHaveLength(1);
        const model = result[0];
        expect(model.id).toBe('model-1');
        expect(model.name).toBe('GPT-4');
        expect(model.modelId).toBe('gpt-4');
        expect(model.tier).toBe('large');
        expect(model.enabled).toBe(true);
        expect(model.maxTokens).toBe(4096);
        expect(model.contextSize).toBe(128000);
        expect(model.supportsTools).toBe(true);
        expect(model.noThink).toBe(false);
    });

    it('converts enabled=0 to false and supports_tools=0 to false', async () => {
        mockQuery.mockResolvedValue([{ ...SAMPLE_ROW, enabled: 0, supports_tools: 0 }]);

        const result = await getRegisteredModels();
        expect(result[0].enabled).toBe(false);
        expect(result[0].supportsTools).toBe(false);
    });

    it('treats supports_tools=null as null (not boolean)', async () => {
        mockQuery.mockResolvedValue([{ ...SAMPLE_ROW, supports_tools: null }]);
        const result = await getRegisteredModels();
        expect(result[0].supportsTools).toBeNull();
    });

    it('defaults missing optional fields', async () => {
        const minimal = {
            id: 'm1', name: 'Local', provider: 'ollama', model_id: 'llama3',
            tier: null, endpoint_url: null, api_key: null, enabled: 1,
            max_tokens: null, context_size: null, cost_per_1k: null,
            input_cost_per_mtok: null, output_cost_per_mtok: null, tool_cost_per_mtok: null,
            sort_order: null, max_retries: null, retry_window_minutes: null,
            max_concurrency: null, request_pause_ms: null, request_timeout: null,
            rate_limit_backoff_ms: null, supports_tools: null, no_think: 0,
        };
        mockQuery.mockResolvedValue([minimal]);

        const result = await getRegisteredModels();
        const m = result[0];
        expect(m.tier).toBe('medium');   // default
        expect(m.maxTokens).toBeNull();
        expect(m.costPer1k).toBe(0);
        expect(m.sortOrder).toBe(0);
        expect(m.maxRetries).toBe(3);
        expect(m.maxConcurrency).toBe(1);
    });
});

// =============================================================================
// registerModel
// =============================================================================

describe('registerModel', () => {
    it('inserts model with generated uuid and returns model with id', async () => {
        mockGenerateUuid.mockReturnValue('new-uuid-abc');
        mockQuery.mockResolvedValue([]); // INSERT + syncRegistry (loadAssignmentCache)

        const model = {
            name: 'New Model', provider: 'openai', modelId: 'gpt-4o',
            tier: 'large' as const, endpointUrl: null, apiKey: null, enabled: true,
            maxTokens: 2048, contextSize: 128000, costPer1k: 0.01,
            inputCostPerMtok: 10, outputCostPerMtok: 20, toolCostPerMtok: 0,
            sortOrder: 5, maxRetries: 3, retryWindowMinutes: 2, maxConcurrency: 1,
            requestPauseMs: 0, requestTimeout: 180, rateLimitBackoffMs: 120000,
            supportsTools: null, noThink: false, thinkingLevel: null,
        };

        const result = await registerModel(model);

        expect(result.id).toBe('new-uuid-abc');
        expect(result.name).toBe('New Model');

        // INSERT should have been called
        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO model_registry')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1][0]).toBe('new-uuid-abc'); // first param is id
    });

    it('syncs registry after insert', async () => {
        mockQuery.mockResolvedValue([]);

        await registerModel({
            name: 'M', provider: 'openai', modelId: 'm', tier: 'medium',
            endpointUrl: null, apiKey: null, enabled: true, maxTokens: null,
            contextSize: null, costPer1k: 0, inputCostPerMtok: 0,
            outputCostPerMtok: 0, toolCostPerMtok: 0, sortOrder: 0,
            maxRetries: 3, retryWindowMinutes: 2, maxConcurrency: 1,
            requestPauseMs: 0, requestTimeout: 180, rateLimitBackoffMs: 120000,
            supportsTools: null, noThink: false, thinkingLevel: null,
        });

        // syncRegistryToConfig → loadAssignmentCache via query SELECT subsystem_assignments
        expect(mockQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// updateRegisteredModel
// =============================================================================

describe('updateRegisteredModel', () => {
    it('does nothing when no updates provided', async () => {
        await updateRegisteredModel('model-1', {});
        // No UPDATE query should have been made (early return)
        const updateCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry')
        );
        expect(updateCalls).toHaveLength(0);
    });

    it('builds SET clause for provided fields', async () => {
        mockQuery.mockResolvedValue([]);

        await updateRegisteredModel('model-1', { name: 'Updated Name', enabled: false });

        const updateCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry SET')
        );
        expect(updateCalls).toHaveLength(1);
        const [sql, params] = updateCalls[0];
        expect(String(sql)).toContain('name =');
        expect(String(sql)).toContain('enabled =');
        expect(params).toContain('Updated Name');
        expect(params).toContain(0); // enabled=false → 0
    });

    it('converts supportsTools boolean to 1/0', async () => {
        mockQuery.mockResolvedValue([]);

        await updateRegisteredModel('m1', { supportsTools: true });

        const [, params] = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry')
        );
        expect(params).toContain(1);
    });

    it('passes null for supportsTools=null', async () => {
        mockQuery.mockResolvedValue([]);

        await updateRegisteredModel('m1', { supportsTools: null });

        const [, params] = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE model_registry')
        );
        expect(params).toContain(null);
    });

    it('appends id as last parameter', async () => {
        mockQuery.mockResolvedValue([]);

        await updateRegisteredModel('target-id', { name: 'New' });

        const [_sql, params] = (mockQuery.mock.calls as any[]).find(([s]: any[]) =>
            String(s).includes('UPDATE model_registry')
        );
        expect(params[params.length - 1]).toBe('target-id');
    });
});

// =============================================================================
// deleteRegisteredModel
// =============================================================================

describe('deleteRegisteredModel', () => {
    it('clears subsystem assignments then deletes model', async () => {
        mockQuery.mockResolvedValue([]);

        await deleteRegisteredModel('model-1');

        const calls = mockQuery.mock.calls as any[];
        const clearAssignments = calls.find(([sql]: any[]) =>
            String(sql).includes('subsystem_assignments') && String(sql).includes('model_id = NULL')
        );
        const deleteModel = calls.find(([sql]: any[]) =>
            String(sql).includes('DELETE FROM model_registry')
        );

        expect(clearAssignments).toBeDefined();
        expect(deleteModel).toBeDefined();
        // Clear assignments must come before delete
        expect(calls.indexOf(clearAssignments)).toBeLessThan(calls.indexOf(deleteModel));
    });

    it('passes model id to both queries', async () => {
        mockQuery.mockResolvedValue([]);
        await deleteRegisteredModel('del-me');

        const calls = mockQuery.mock.calls as any[];
        for (const [, params] of calls) {
            if (Array.isArray(params)) {
                expect(params).toContain('del-me');
            }
        }
    });
});
