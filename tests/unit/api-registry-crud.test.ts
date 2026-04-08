/**
 * Unit tests for evm/api/registry.ts —
 * listApis, getApi, getApiByName, getEnabledApis, createApi, updateApi,
 * deleteApi, setApiEnabled, recordApiCall, savePromptVersion, getPromptHistory.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('new-uuid-5678');

jest.unstable_mockModule('../../core.js', () => ({
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    generateUuid: mockGenerateUuid,
}));

const {
    listApis,
    getApi,
    getApiByName,
    getEnabledApis,
    createApi,
    updateApi,
    deleteApi,
    setApiEnabled,
    recordApiCall,
    savePromptVersion,
    getPromptHistory,
} = await import('../../evm/api/registry.js');

// ---------------------------------------------------------------------------
// Helper — build a minimal raw DB row
// ---------------------------------------------------------------------------
function makeRow(overrides: Record<string, any> = {}): Record<string, any> {
    return {
        id: 'api-1',
        name: 'test-api',
        display_name: 'Test API',
        description: 'A test API',
        enabled: 1,
        mode: 'verify',
        base_url: 'https://example.com',
        test_url: null,
        auth_type: 'none',
        auth_key: null,
        auth_header: null,
        max_rpm: 5,
        max_concurrent: 1,
        timeout_ms: 30000,
        prompt_query: null,
        prompt_interpret: null,
        prompt_extract: null,
        prompt_notes: null,
        response_format: 'json',
        max_response_bytes: 65536,
        capabilities: null,
        domains: null,
        test_cases: null,
        onboarded_at: null,
        onboarded_by: null,
        total_calls: 0,
        total_errors: 0,
        created_at: '2024-01-01 00:00:00',
        updated_at: '2024-01-01 00:00:00',
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    mockGenerateUuid.mockReturnValue('new-uuid-5678');
});

// =============================================================================
// listApis
// =============================================================================

describe('listApis', () => {
    it('returns empty array when no APIs exist', async () => {
        const result = await listApis();
        expect(result).toHaveLength(0);
    });

    it('maps rows to camelCase entries', async () => {
        mockSystemQuery.mockResolvedValue([
            makeRow({ id: 'api-1', name: 'api-one', enabled: 1 }),
            makeRow({ id: 'api-2', name: 'api-two', enabled: 0 }),
        ]);

        const result = await listApis();
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('api-1');
        expect(result[0].enabled).toBe(true);   // 1 → true
        expect(result[1].enabled).toBe(false);  // 0 → false
        expect(result[0].baseUrl).toBe('https://example.com'); // snake_case → camelCase
    });

    it('parses JSON fields when present', async () => {
        mockSystemQuery.mockResolvedValue([
            makeRow({
                capabilities: '["fact-check","lookup"]',
                domains: '["science","tech"]',
            }),
        ]);

        const result = await listApis();
        expect(result[0].capabilities).toEqual(['fact-check', 'lookup']);
        expect(result[0].domains).toEqual(['science', 'tech']);
    });

    it('defaults mode to verify when null in DB', async () => {
        mockSystemQuery.mockResolvedValue([makeRow({ mode: null })]);
        const result = await listApis();
        expect(result[0].mode).toBe('verify');
    });
});

// =============================================================================
// getApi
// =============================================================================

describe('getApi', () => {
    it('returns null when not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await getApi('missing-id');
        expect(result).toBeNull();
    });

    it('returns mapped entry when found', async () => {
        mockSystemQueryOne.mockResolvedValue(makeRow({ id: 'api-1' }));
        const result = await getApi('api-1');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('api-1');
        expect(result!.enabled).toBe(true);
        expect(mockSystemQueryOne).toHaveBeenCalledWith(expect.any(String), ['api-1']);
    });
});

// =============================================================================
// getApiByName
// =============================================================================

describe('getApiByName', () => {
    it('returns null when not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await getApiByName('unknown');
        expect(result).toBeNull();
    });

    it('returns entry by name', async () => {
        mockSystemQueryOne.mockResolvedValue(makeRow({ name: 'my-api' }));
        const result = await getApiByName('my-api');
        expect(result!.name).toBe('my-api');
    });
});

// =============================================================================
// getEnabledApis
// =============================================================================

describe('getEnabledApis', () => {
    it('returns only enabled entries', async () => {
        mockSystemQuery.mockResolvedValue([makeRow({ enabled: 1 })]);
        const result = await getEnabledApis();
        expect(result).toHaveLength(1);
        expect(result[0].enabled).toBe(true);

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('enabled = 1');
    });
});

// =============================================================================
// createApi
// =============================================================================

describe('createApi', () => {
    it('inserts new API and returns created entry', async () => {
        const createdRow = makeRow({ id: 'new-uuid-5678', name: 'new-api' });
        mockSystemQuery.mockResolvedValue([]); // INSERT
        // getApi call after insert (via systemQueryOne)
        mockSystemQueryOne.mockResolvedValue(createdRow);

        const result = await createApi({
            name: 'new-api',
            displayName: 'New API',
            baseUrl: 'https://new.example.com',
        });

        expect(result.id).toBe('new-uuid-5678');
        expect(result.name).toBe('new-api');

        // INSERT query should have been called with the new uuid
        const insertCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO api_registry')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('new-uuid-5678');
        expect(insertCall[1]).toContain('new-api');
    });

    it('uses defaults when optional fields not provided', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue(makeRow());

        await createApi({ name: 'test', displayName: 'Test', baseUrl: 'https://example.com' });

        const insertCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO api_registry')
        );
        const params = insertCall[1];
        expect(params).toContain('none');   // default authType
        expect(params).toContain(5);        // default maxRpm
        expect(params).toContain(1);        // default maxConcurrent
        expect(params).toContain(30000);    // default timeoutMs
        expect(params).toContain(65536);    // default maxResponseBytes
        expect(params).toContain('json');   // default responseFormat
        expect(params).toContain('verify'); // default mode
    });
});

// =============================================================================
// updateApi
// =============================================================================

describe('updateApi', () => {
    it('returns null when API not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null); // getApi returns null
        const result = await updateApi('missing', { name: 'new-name' });
        expect(result).toBeNull();
    });

    it('returns existing entry unchanged when no updates provided', async () => {
        const existing = makeRow({ id: 'api-1' });
        mockSystemQueryOne.mockResolvedValue(existing);

        const result = await updateApi('api-1', {});

        // No UPDATE query should have been issued
        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE api_registry')
        );
        expect(updateCall).toBeUndefined();
        expect(result).not.toBeNull();
    });

    it('updates specified fields and returns updated entry', async () => {
        const row = makeRow({ id: 'api-1' });
        mockSystemQueryOne
            .mockResolvedValueOnce(row)   // initial getApi
            .mockResolvedValueOnce(row);  // getApi after update

        await updateApi('api-1', { name: 'updated-name', enabled: false });

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE api_registry')
        );
        expect(updateCall).toBeDefined();
        const params = updateCall[1];
        expect(params).toContain('updated-name');
        expect(params).toContain(0); // false → 0
    });

    it('serializes capabilities array to JSON', async () => {
        const row = makeRow({ id: 'api-1' });
        mockSystemQueryOne.mockResolvedValue(row);

        await updateApi('api-1', { capabilities: ['fact-check', 'lookup'] });

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE api_registry')
        );
        const params = updateCall[1];
        expect(params).toContain(JSON.stringify(['fact-check', 'lookup']));
    });
});

// =============================================================================
// deleteApi
// =============================================================================

describe('deleteApi', () => {
    it('returns false when API not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await deleteApi('missing');
        expect(result).toBe(false);
    });

    it('deletes API and prompt history; returns true', async () => {
        mockSystemQueryOne.mockResolvedValue(makeRow({ id: 'api-1' }));
        mockSystemQuery.mockResolvedValue([]);

        const result = await deleteApi('api-1');
        expect(result).toBe(true);

        // Should have deleted prompt history first
        const deleteHistory = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('api_prompt_history')
        );
        expect(deleteHistory).toBeDefined();

        // Should have deleted the API
        const deleteApiCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM api_registry')
        );
        expect(deleteApiCall).toBeDefined();
        expect(deleteApiCall[1]).toContain('api-1');
    });
});

// =============================================================================
// setApiEnabled
// =============================================================================

describe('setApiEnabled', () => {
    it('returns false when API not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await setApiEnabled('missing', true);
        expect(result).toBe(false);
    });

    it('returns true when API found and enabled field updated', async () => {
        const row = makeRow({ id: 'api-1' });
        mockSystemQueryOne.mockResolvedValue(row);

        const result = await setApiEnabled('api-1', false);
        expect(result).toBe(true);
    });
});

// =============================================================================
// recordApiCall
// =============================================================================

describe('recordApiCall', () => {
    it('increments total_calls only on success', async () => {
        await recordApiCall('api-1', true);

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('total_calls = total_calls + 1');
        expect(String(sql)).not.toContain('total_errors');
        expect(params).toContain('api-1');
    });

    it('increments total_calls and total_errors on failure', async () => {
        await recordApiCall('api-1', false);

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('total_calls = total_calls + 1');
        expect(String(sql)).toContain('total_errors = total_errors + 1');
        expect(params).toContain('api-1');
    });
});

// =============================================================================
// savePromptVersion
// =============================================================================

describe('savePromptVersion', () => {
    it('inserts prompt version with incremented version number', async () => {
        mockSystemQueryOne.mockResolvedValue({ max_ver: 3 });

        await savePromptVersion('api-1', 'promptQuery', 'new content', 'Improved prompt', 'human');

        const insertCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO api_prompt_history')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('api-1');
        expect(insertCall[1]).toContain('promptQuery');
        expect(insertCall[1]).toContain('new content');
        expect(insertCall[1]).toContain(4); // max_ver 3 + 1
        expect(insertCall[1]).toContain('Improved prompt');
        expect(insertCall[1]).toContain('human');
    });

    it('starts at version 1 when no history exists', async () => {
        mockSystemQueryOne.mockResolvedValue({ max_ver: null });

        await savePromptVersion('api-1', 'promptQuery', 'first version', 'Initial', 'system');

        const insertCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO api_prompt_history')
        );
        expect(insertCall[1]).toContain(1); // 0 + 1 = 1
    });
});

// =============================================================================
// getPromptHistory
// =============================================================================

describe('getPromptHistory', () => {
    it('returns all prompt history for an API when no field filter', async () => {
        mockSystemQuery.mockResolvedValue([
            { id: 'ph-1', api_id: 'api-1', prompt_field: 'promptQuery' },
            { id: 'ph-2', api_id: 'api-1', prompt_field: 'promptInterpret' },
        ]);

        const result = await getPromptHistory('api-1');

        expect(result).toHaveLength(2);
        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).not.toContain('prompt_field =');
        expect(params).toContain('api-1');
    });

    it('filters by promptField when provided', async () => {
        mockSystemQuery.mockResolvedValue([
            { id: 'ph-1', api_id: 'api-1', prompt_field: 'promptQuery' },
        ]);

        await getPromptHistory('api-1', 'promptQuery');

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('prompt_field');
        expect(params).toContain('promptQuery');
    });
});
