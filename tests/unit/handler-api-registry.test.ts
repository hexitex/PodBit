/**
 * Unit tests for handlers/api-registry.ts — handleApiRegistry dispatcher.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockListApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCreateApi = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'api-1', name: 'my-api' });
const mockUpdateApi = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'api-1', name: 'updated' });
const mockDeleteApi = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockSetApiEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetPromptHistory = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockHandleOnboard = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'in_progress', question: 'Q?' });
const mockCallApi = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 200, responseTimeMs: 50, truncated: false, body: '{"ok":true}' });
const mockGetApiVerificationStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetNodeApiVerifications = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../evm/api/registry.js', () => ({
    listApis: mockListApis,
    getApi: mockGetApi,
    createApi: mockCreateApi,
    updateApi: mockUpdateApi,
    deleteApi: mockDeleteApi,
    setApiEnabled: mockSetApiEnabled,
    getPromptHistory: mockGetPromptHistory,
}));

jest.unstable_mockModule('../../evm/api/onboard.js', () => ({
    handleOnboard: mockHandleOnboard,
}));

jest.unstable_mockModule('../../evm/api/caller.js', () => ({
    callApi: mockCallApi,
}));

jest.unstable_mockModule('../../evm/api/audit.js', () => ({
    getApiVerificationStats: mockGetApiVerificationStats,
    getNodeApiVerifications: mockGetNodeApiVerifications,
}));

const { handleApiRegistry } = await import('../../handlers/api-registry.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockListApis.mockResolvedValue([]);
    mockGetApi.mockResolvedValue(null);
    mockCreateApi.mockResolvedValue({ id: 'api-1', name: 'my-api' });
    mockUpdateApi.mockResolvedValue({ id: 'api-1', name: 'updated' });
    mockDeleteApi.mockResolvedValue(true);
    mockSetApiEnabled.mockResolvedValue(true);
    mockGetPromptHistory.mockResolvedValue([]);
    mockHandleOnboard.mockResolvedValue({ status: 'in_progress', question: 'Q?' });
    mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 50, truncated: false, body: '{"ok":true}' });
    mockGetApiVerificationStats.mockResolvedValue({ total: 0 });
    mockGetNodeApiVerifications.mockResolvedValue([]);
});

// =============================================================================
// list
// =============================================================================

describe('action: list', () => {
    it('returns apis array', async () => {
        mockListApis.mockResolvedValue([{ id: 'a1', name: 'api1' }]);

        const result = await handleApiRegistry({ action: 'list' });

        expect(result.apis).toHaveLength(1);
        expect(mockListApis).toHaveBeenCalled();
    });
});

// =============================================================================
// get
// =============================================================================

describe('action: get', () => {
    it('returns error when id is missing', async () => {
        const result = await handleApiRegistry({ action: 'get' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when API not found', async () => {
        mockGetApi.mockResolvedValue(null);

        const result = await handleApiRegistry({ action: 'get', id: 'nonexistent' });

        expect(result.error).toContain('not found');
    });

    it('returns API when found', async () => {
        mockGetApi.mockResolvedValue({ id: 'a1', name: 'weather-api' });

        const result = await handleApiRegistry({ action: 'get', id: 'a1' });

        expect(result.id).toBe('a1');
        expect(result.name).toBe('weather-api');
    });
});

// =============================================================================
// create
// =============================================================================

describe('action: create', () => {
    it('returns error when name is missing', async () => {
        const result = await handleApiRegistry({ action: 'create', baseUrl: 'https://api.example.com' });
        expect(result.error).toContain('name is required');
    });

    it('returns error when baseUrl is missing', async () => {
        const result = await handleApiRegistry({ action: 'create', name: 'my-api' });
        expect(result.error).toContain('baseUrl is required');
    });

    it('creates API and returns created=true', async () => {
        const result = await handleApiRegistry({ action: 'create', name: 'my-api', baseUrl: 'https://api.example.com' });

        expect(result.created).toBe(true);
        expect(result.api.id).toBe('api-1');
        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({
            name: 'my-api',
            baseUrl: 'https://api.example.com',
        }));
    });

    it('uses name as displayName when displayName not provided', async () => {
        await handleApiRegistry({ action: 'create', name: 'my-api', baseUrl: 'https://api.example.com' });

        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({
            displayName: 'my-api',
        }));
    });

    it('returns error when createApi throws', async () => {
        mockCreateApi.mockRejectedValue(new Error('Duplicate name'));

        const result = await handleApiRegistry({ action: 'create', name: 'my-api', baseUrl: 'https://api.example.com' });

        expect(result.error).toBe('Duplicate name');
    });
});

// =============================================================================
// update
// =============================================================================

describe('action: update', () => {
    it('returns error when id is missing', async () => {
        const result = await handleApiRegistry({ action: 'update', name: 'new-name' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when API not found', async () => {
        mockUpdateApi.mockResolvedValue(null);

        const result = await handleApiRegistry({ action: 'update', id: 'nonexistent', name: 'x' });

        expect(result.error).toContain('not found');
    });

    it('returns updated=true with updated API', async () => {
        const result = await handleApiRegistry({ action: 'update', id: 'api-1', name: 'renamed' });

        expect(result.updated).toBe(true);
        expect(result.api).toBeDefined();
    });
});

// =============================================================================
// delete
// =============================================================================

describe('action: delete', () => {
    it('returns error when id is missing', async () => {
        const result = await handleApiRegistry({ action: 'delete' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when API not found', async () => {
        mockDeleteApi.mockResolvedValue(false);

        const result = await handleApiRegistry({ action: 'delete', id: 'nonexistent' });

        expect(result.error).toContain('not found');
    });

    it('returns deleted=true on success', async () => {
        mockDeleteApi.mockResolvedValue(true);

        const result = await handleApiRegistry({ action: 'delete', id: 'api-1' });

        expect(result.deleted).toBe(true);
    });
});

// =============================================================================
// enable / disable
// =============================================================================

describe('action: enable', () => {
    it('returns error when id is missing', async () => {
        const result = await handleApiRegistry({ action: 'enable' });
        expect(result.error).toContain('id is required');
    });

    it('returns enabled=true when successful', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const result = await handleApiRegistry({ action: 'enable', id: 'api-1' });
        expect(result.enabled).toBe(true);
    });

    it('returns error when API not found', async () => {
        mockSetApiEnabled.mockResolvedValue(false);
        const result = await handleApiRegistry({ action: 'enable', id: 'nonexistent' });
        expect(result.error).toContain('not found');
    });
});

describe('action: disable', () => {
    it('returns disabled=true when successful', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const result = await handleApiRegistry({ action: 'disable', id: 'api-1' });
        expect(result.disabled).toBe(true);
    });

    it('calls setApiEnabled with false', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        await handleApiRegistry({ action: 'disable', id: 'api-1' });
        expect(mockSetApiEnabled).toHaveBeenCalledWith('api-1', false);
    });
});

// =============================================================================
// onboard
// =============================================================================

describe('action: onboard', () => {
    it('delegates to handleOnboard with name, interviewId, response', async () => {
        await handleApiRegistry({ action: 'onboard', name: 'my-api', interviewId: 'sess-1', response: 'Yes' });

        expect(mockHandleOnboard).toHaveBeenCalledWith({
            name: 'my-api',
            interviewId: 'sess-1',
            response: 'Yes',
        });
    });

    it('returns the handleOnboard result', async () => {
        mockHandleOnboard.mockResolvedValue({ status: 'complete', api: { id: 'api-new' } });

        const result = await handleApiRegistry({ action: 'onboard', name: 'my-api' });

        expect(result.status).toBe('complete');
    });
});

// =============================================================================
// test
// =============================================================================

describe('action: test', () => {
    it('returns error when neither id nor url provided', async () => {
        const result = await handleApiRegistry({ action: 'test' });
        expect(result.error).toContain('id or url is required');
    });

    it('returns error when API not found for given id', async () => {
        mockGetApi.mockResolvedValue(null);
        const result = await handleApiRegistry({ action: 'test', id: 'nonexistent' });
        expect(result.error).toContain('not found');
    });

    it('calls API and returns response preview', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', baseUrl: 'https://api.example.com', authType: 'none' });
        mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 120, truncated: false, body: '{"result":"ok"}' });

        const result = await handleApiRegistry({ action: 'test', id: 'api-1' });

        expect(result.status).toBe(200);
        expect(result.responseTimeMs).toBe(120);
        expect(result.bodyPreview).toBe('{"result":"ok"}');
    });

    it('tests raw URL without loading API from registry', async () => {
        mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 50, truncated: false, body: 'OK' });

        const result = await handleApiRegistry({ action: 'test', url: 'https://api.example.com/health' });

        expect(result.status).toBe(200);
        expect(mockGetApi).not.toHaveBeenCalled();
    });

    it('returns error when callApi throws', async () => {
        mockGetApi.mockResolvedValue({ id: 'a1', baseUrl: 'https://example.com' });
        mockCallApi.mockRejectedValue(new Error('Connection refused'));

        const result = await handleApiRegistry({ action: 'test', id: 'a1' });

        expect(result.error).toContain('Connection refused');
    });
});

// =============================================================================
// stats
// =============================================================================

describe('action: stats', () => {
    it('returns verification stats for default 7 days', async () => {
        mockGetApiVerificationStats.mockResolvedValue({ total: 42, success: 40 });

        const result = await handleApiRegistry({ action: 'stats' });

        expect(result.total).toBe(42);
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(7);
    });

    it('passes custom days param', async () => {
        await handleApiRegistry({ action: 'stats', days: 30 });
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(30);
    });
});

// =============================================================================
// history
// =============================================================================

describe('action: history', () => {
    it('returns error when nodeId is missing', async () => {
        const result = await handleApiRegistry({ action: 'history' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns verifications for node', async () => {
        mockGetNodeApiVerifications.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);

        const result = await handleApiRegistry({ action: 'history', nodeId: 'n1' });

        expect(result.verifications).toHaveLength(2);
        expect(mockGetNodeApiVerifications).toHaveBeenCalledWith('n1');
    });
});

// =============================================================================
// prompt_history
// =============================================================================

describe('action: prompt_history', () => {
    it('returns error when id is missing', async () => {
        const result = await handleApiRegistry({ action: 'prompt_history' });
        expect(result.error).toContain('id is required');
    });

    it('returns prompt history for API', async () => {
        mockGetPromptHistory.mockResolvedValue([{ version: 1, content: 'Query prompt v1' }]);

        const result = await handleApiRegistry({ action: 'prompt_history', id: 'api-1', promptField: 'prompt_query' });

        expect(result.history).toHaveLength(1);
        expect(mockGetPromptHistory).toHaveBeenCalledWith('api-1', 'prompt_query');
    });
});

// =============================================================================
// unknown action
// =============================================================================

describe('unknown action', () => {
    it('returns error for unknown action', async () => {
        const result = await handleApiRegistry({ action: 'unknown_action' });
        expect(result.error).toContain('Unknown action');
        expect(result.error).toContain('unknown_action');
    });
});
