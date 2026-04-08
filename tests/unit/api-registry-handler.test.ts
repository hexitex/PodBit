/**
 * Unit tests for handlers/api-registry.ts — handleApiRegistry dispatch and all action delegates.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockListApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCreateApi = jest.fn<() => Promise<any>>();
const mockUpdateApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockDeleteApi = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSetApiEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockGetPromptHistory = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockHandleOnboard = jest.fn<() => Promise<any>>().mockResolvedValue({ step: 'name' });
const mockCallApi = jest.fn<() => Promise<any>>();
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
    mockCreateApi.mockResolvedValue({ id: 'api-1', name: 'Test API' });
    mockUpdateApi.mockResolvedValue(null);
    mockDeleteApi.mockResolvedValue(false);
    mockSetApiEnabled.mockResolvedValue(false);
    mockGetPromptHistory.mockResolvedValue([]);
    mockHandleOnboard.mockResolvedValue({ step: 'name' });
    mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 50, truncated: false, body: '{"ok":true}' });
    mockGetApiVerificationStats.mockResolvedValue({ total: 0 });
    mockGetNodeApiVerifications.mockResolvedValue([]);
});

// =============================================================================
// unknown action
// =============================================================================

describe('unknown action', () => {
    it('returns error for unrecognized action', async () => {
        const result = await handleApiRegistry({ action: 'bogus' });
        expect(result.error).toContain('Unknown action');
        expect(result.error).toContain('bogus');
    });
});

// =============================================================================
// list
// =============================================================================

describe('action: list', () => {
    it('returns apis array', async () => {
        mockListApis.mockResolvedValue([{ id: 'api-1' }, { id: 'api-2' }]);
        const result = await handleApiRegistry({ action: 'list' });
        expect(result.apis).toHaveLength(2);
        expect(result.apis[0].id).toBe('api-1');
    });

    it('returns empty apis array when none exist', async () => {
        const result = await handleApiRegistry({ action: 'list' });
        expect(result.apis).toHaveLength(0);
    });
});

// =============================================================================
// get
// =============================================================================

describe('action: get', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'get' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when api not found', async () => {
        mockGetApi.mockResolvedValue(null);
        const result = await handleApiRegistry({ action: 'get', id: 'missing-id' });
        expect(result.error).toContain('API not found');
        expect(result.error).toContain('missing-id');
    });

    it('returns api when found', async () => {
        const api = { id: 'api-1', name: 'My API', baseUrl: 'https://example.com' };
        mockGetApi.mockResolvedValue(api);
        const result = await handleApiRegistry({ action: 'get', id: 'api-1' });
        expect(result.id).toBe('api-1');
        expect(result.name).toBe('My API');
        expect(mockGetApi).toHaveBeenCalledWith('api-1');
    });
});

// =============================================================================
// create
// =============================================================================

describe('action: create', () => {
    it('returns error when name missing', async () => {
        const result = await handleApiRegistry({ action: 'create', baseUrl: 'https://example.com' });
        expect(result.error).toContain('name is required');
    });

    it('returns error when baseUrl missing', async () => {
        const result = await handleApiRegistry({ action: 'create', name: 'Test API' });
        expect(result.error).toContain('baseUrl is required');
    });

    it('creates api and returns created object', async () => {
        const created = { id: 'new-id', name: 'New API', baseUrl: 'https://example.com' };
        mockCreateApi.mockResolvedValue(created);

        const result = await handleApiRegistry({
            action: 'create',
            name: 'New API',
            baseUrl: 'https://example.com',
            description: 'A test API',
            authType: 'bearer',
        });

        expect(result.created).toBe(true);
        expect(result.api.id).toBe('new-id');
        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({
            name: 'New API',
            baseUrl: 'https://example.com',
            description: 'A test API',
            authType: 'bearer',
        }));
    });

    it('uses name as displayName when displayName not provided', async () => {
        mockCreateApi.mockResolvedValue({ id: 'x' });
        await handleApiRegistry({ action: 'create', name: 'My API', baseUrl: 'https://example.com' });
        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'My API' }));
    });

    it('returns error when createApi throws', async () => {
        mockCreateApi.mockRejectedValue(new Error('Duplicate name'));
        const result = await handleApiRegistry({ action: 'create', name: 'Test', baseUrl: 'https://example.com' });
        expect(result.error).toContain('Duplicate name');
    });
});

// =============================================================================
// update
// =============================================================================

describe('action: update', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'update' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when api not found', async () => {
        mockUpdateApi.mockResolvedValue(null);
        const result = await handleApiRegistry({ action: 'update', id: 'missing' });
        expect(result.error).toContain('API not found');
        expect(result.error).toContain('missing');
    });

    it('updates api and returns updated object', async () => {
        const updated = { id: 'api-1', name: 'Updated API' };
        mockUpdateApi.mockResolvedValue(updated);
        const result = await handleApiRegistry({ action: 'update', id: 'api-1', name: 'Updated API' });
        expect(result.updated).toBe(true);
        expect(result.api.name).toBe('Updated API');
        expect(mockUpdateApi).toHaveBeenCalledWith('api-1', expect.objectContaining({ id: 'api-1' }));
    });
});

// =============================================================================
// delete
// =============================================================================

describe('action: delete', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'delete' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when api not found', async () => {
        mockDeleteApi.mockResolvedValue(false);
        const result = await handleApiRegistry({ action: 'delete', id: 'missing' });
        expect(result.error).toContain('API not found');
        expect(result.error).toContain('missing');
    });

    it('deletes api and returns deleted: true', async () => {
        mockDeleteApi.mockResolvedValue(true);
        const result = await handleApiRegistry({ action: 'delete', id: 'api-1' });
        expect(result.deleted).toBe(true);
        expect(mockDeleteApi).toHaveBeenCalledWith('api-1');
    });
});

// =============================================================================
// enable
// =============================================================================

describe('action: enable', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'enable' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when api not found', async () => {
        mockSetApiEnabled.mockResolvedValue(false);
        const result = await handleApiRegistry({ action: 'enable', id: 'missing' });
        expect(result.error).toContain('API not found');
    });

    it('enables api and returns enabled: true', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const result = await handleApiRegistry({ action: 'enable', id: 'api-1' });
        expect(result.enabled).toBe(true);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('api-1', true);
    });
});

// =============================================================================
// disable
// =============================================================================

describe('action: disable', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'disable' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when api not found', async () => {
        mockSetApiEnabled.mockResolvedValue(false);
        const result = await handleApiRegistry({ action: 'disable', id: 'missing' });
        expect(result.error).toContain('API not found');
    });

    it('disables api and returns disabled: true', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const result = await handleApiRegistry({ action: 'disable', id: 'api-1' });
        expect(result.disabled).toBe(true);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('api-1', false);
    });
});

// =============================================================================
// onboard
// =============================================================================

describe('action: onboard', () => {
    it('delegates to handleOnboard with name, interviewId, response', async () => {
        const onboardResult = { step: 'baseUrl', prompt: 'What is the base URL?' };
        mockHandleOnboard.mockResolvedValue(onboardResult);

        const result = await handleApiRegistry({
            action: 'onboard',
            name: 'My API',
            interviewId: 'iv-1',
            response: 'API Name',
        });

        expect(result).toEqual(onboardResult);
        expect(mockHandleOnboard).toHaveBeenCalledWith({
            name: 'My API',
            interviewId: 'iv-1',
            response: 'API Name',
        });
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

    it('returns error when id provided but api not found', async () => {
        mockGetApi.mockResolvedValue(null);
        const result = await handleApiRegistry({ action: 'test', id: 'missing' });
        expect(result.error).toContain('API not found');
    });

    it('calls api by url and returns status + preview', async () => {
        mockCallApi.mockResolvedValue({
            status: 200,
            responseTimeMs: 123,
            truncated: false,
            body: '{"result":"ok"}',
        });

        const result = await handleApiRegistry({ action: 'test', url: 'https://example.com/api' });

        expect(result.status).toBe(200);
        expect(result.responseTimeMs).toBe(123);
        expect(result.truncated).toBe(false);
        expect(result.bodyLength).toBe(15);
        expect(result.bodyPreview).toBe('{"result":"ok"}');
    });

    it('uses api baseUrl when id provided', async () => {
        const api = { id: 'api-1', name: 'Test', baseUrl: 'https://api.example.com', enabled: true };
        mockGetApi.mockResolvedValue(api);
        mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 10, truncated: false, body: '{}' });

        await handleApiRegistry({ action: 'test', id: 'api-1' });

        expect(mockCallApi).toHaveBeenCalledWith(
            api,
            expect.objectContaining({ url: 'https://api.example.com' })
        );
    });

    it('returns error when callApi throws', async () => {
        mockCallApi.mockRejectedValue(new Error('Connection refused'));
        const result = await handleApiRegistry({ action: 'test', url: 'https://bad.example.com' });
        expect(result.error).toContain('Test call failed');
        expect(result.error).toContain('Connection refused');
    });

    it('truncates bodyPreview to 500 chars', async () => {
        const longBody = 'x'.repeat(1000);
        mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 10, truncated: true, body: longBody });
        const result = await handleApiRegistry({ action: 'test', url: 'https://example.com' });
        expect(result.bodyPreview.length).toBe(500);
        expect(result.bodyLength).toBe(1000);
    });
});

// =============================================================================
// stats
// =============================================================================

describe('action: stats', () => {
    it('calls getApiVerificationStats with default days=7', async () => {
        mockGetApiVerificationStats.mockResolvedValue({ total: 42, byApi: [] });
        const result = await handleApiRegistry({ action: 'stats' });
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(7);
        expect(result.total).toBe(42);
    });

    it('uses provided days parameter', async () => {
        await handleApiRegistry({ action: 'stats', days: 30 });
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(30);
    });
});

// =============================================================================
// history
// =============================================================================

describe('action: history', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleApiRegistry({ action: 'history' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns verifications for node', async () => {
        mockGetNodeApiVerifications.mockResolvedValue([
            { id: 'v1', nodeId: 'n1', status: 'pass' },
            { id: 'v2', nodeId: 'n1', status: 'fail' },
        ]);
        const result = await handleApiRegistry({ action: 'history', nodeId: 'n1' });
        expect(result.verifications).toHaveLength(2);
        expect(mockGetNodeApiVerifications).toHaveBeenCalledWith('n1');
    });
});

// =============================================================================
// prompt_history
// =============================================================================

describe('action: prompt_history', () => {
    it('returns error when id missing', async () => {
        const result = await handleApiRegistry({ action: 'prompt_history' });
        expect(result.error).toContain('id is required');
    });

    it('returns prompt history for api', async () => {
        mockGetPromptHistory.mockResolvedValue([
            { id: 'ph-1', apiId: 'api-1', field: 'promptQuery', value: 'query...' },
        ]);
        const result = await handleApiRegistry({ action: 'prompt_history', id: 'api-1', promptField: 'promptQuery' });
        expect(result.history).toHaveLength(1);
        expect(mockGetPromptHistory).toHaveBeenCalledWith('api-1', 'promptQuery');
    });

    it('passes undefined promptField when not specified', async () => {
        await handleApiRegistry({ action: 'prompt_history', id: 'api-1' });
        expect(mockGetPromptHistory).toHaveBeenCalledWith('api-1', undefined);
    });
});
