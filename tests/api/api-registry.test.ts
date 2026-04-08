/**
 * API tests for routes/api-registry.ts
 *
 * Tests: GET stats/verifications, POST onboard, CRUD, enable/disable/test, prompt-history
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetApiVerificationStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetFilteredApiVerifications = jest.fn<() => Promise<any>>().mockResolvedValue({ items: [], total: 0 });
const mockHandleOnboard = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'ok' });
const mockListApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockCreateApi = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'api-1' });
const mockGetApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockUpdateApi = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'api-1' });
const mockSavePromptVersion = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeleteApi = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockSetApiEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCallApi = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 200, responseTimeMs: 10, body: '{}', truncated: false });
const mockGetPromptHistory = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../evm/api/audit.js', () => ({
    getApiVerificationStats: mockGetApiVerificationStats,
    getFilteredApiVerifications: mockGetFilteredApiVerifications,
}));

jest.unstable_mockModule('../../evm/api/onboard.js', () => ({
    handleOnboard: mockHandleOnboard,
}));

jest.unstable_mockModule('../../evm/api/registry.js', () => ({
    listApis: mockListApis,
    createApi: mockCreateApi,
    getApi: mockGetApi,
    updateApi: mockUpdateApi,
    savePromptVersion: mockSavePromptVersion,
    deleteApi: mockDeleteApi,
    setApiEnabled: mockSetApiEnabled,
    getPromptHistory: mockGetPromptHistory,
}));

jest.unstable_mockModule('../../evm/api/caller.js', () => ({
    callApi: mockCallApi,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: apiRegistryRouter } = await import('../../routes/api-registry.js');

/** Express app with api-registry router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', apiRegistryRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetApiVerificationStats.mockResolvedValue({ total: 0 });
    mockGetFilteredApiVerifications.mockResolvedValue({ items: [], total: 0 });
    mockHandleOnboard.mockResolvedValue({ status: 'ok' });
    mockListApis.mockResolvedValue([]);
    mockGetApi.mockResolvedValue(null);
    mockUpdateApi.mockResolvedValue({ id: 'api-1' });
    mockDeleteApi.mockResolvedValue(true);
    mockSetApiEnabled.mockResolvedValue(true);
    mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 10, body: '{}', truncated: false });
    mockGetPromptHistory.mockResolvedValue([]);
});

// =============================================================================
// GET /api-registry/stats
// =============================================================================

describe('GET /api-registry/stats', () => {
    it('returns verification stats', async () => {
        mockGetApiVerificationStats.mockResolvedValue({ total: 5, supported: 3, refuted: 1, inconclusive: 1 });
        const res = await request(buildApp()).get('/api-registry/stats');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(5);
    });

    it('passes days param', async () => {
        await request(buildApp()).get('/api-registry/stats?days=30');
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(30);
    });

    it('defaults to 7 days', async () => {
        await request(buildApp()).get('/api-registry/stats');
        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(7);
    });
});

// =============================================================================
// GET /api-registry/verifications
// =============================================================================

describe('GET /api-registry/verifications', () => {
    it('returns filtered verifications', async () => {
        mockGetFilteredApiVerifications.mockResolvedValue({ items: [{ id: 'v-1' }], total: 1 });
        const res = await request(buildApp()).get('/api-registry/verifications');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
    });

    it('passes all filter params', async () => {
        await request(buildApp()).get('/api-registry/verifications?apiId=a1&nodeId=n1&impact=high&status=verified&limit=25&offset=10');
        expect(mockGetFilteredApiVerifications).toHaveBeenCalledWith(expect.objectContaining({
            apiId: 'a1',
            nodeId: 'n1',
            impact: 'high',
            status: 'verified',
            limit: 25,
            offset: 10,
        }));
    });
});

// =============================================================================
// POST /api-registry/onboard
// =============================================================================

describe('POST /api-registry/onboard', () => {
    it('returns result on success', async () => {
        mockHandleOnboard.mockResolvedValue({ status: 'ok', apiId: 'api-new' });
        const res = await request(buildApp())
            .post('/api-registry/onboard')
            .send({ name: 'My API', interviewId: 'int-1', response: 'yes' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('returns 400 when status is error', async () => {
        mockHandleOnboard.mockResolvedValue({ status: 'error', message: 'Invalid config' });
        const res = await request(buildApp())
            .post('/api-registry/onboard')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.status).toBe('error');
    });
});

// =============================================================================
// GET /api-registry (list)
// =============================================================================

describe('GET /api-registry', () => {
    it('returns list of APIs', async () => {
        mockListApis.mockResolvedValue([{ id: 'a-1', name: 'Test API' }]);
        const res = await request(buildApp()).get('/api-registry');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].id).toBe('a-1');
    });
});

// =============================================================================
// POST /api-registry (create)
// =============================================================================

describe('POST /api-registry', () => {
    it('creates API and returns 201', async () => {
        mockCreateApi.mockResolvedValue({ id: 'api-new', name: 'New API' });
        const res = await request(buildApp())
            .post('/api-registry')
            .send({ name: 'New API', baseUrl: 'https://api.example.com' });
        expect(res.status).toBe(201);
        expect(res.body.id).toBe('api-new');
    });
});

// =============================================================================
// GET /api-registry/:id
// =============================================================================

describe('GET /api-registry/:id', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);
        const res = await request(buildApp()).get('/api-registry/missing');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('API not found');
    });

    it('returns API when found', async () => {
        mockGetApi.mockResolvedValue({ id: 'a-1', name: 'Test' });
        const res = await request(buildApp()).get('/api-registry/a-1');
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Test');
    });
});

// =============================================================================
// PUT /api-registry/:id
// =============================================================================

describe('PUT /api-registry/:id', () => {
    it('returns 404 when API not found', async () => {
        mockUpdateApi.mockResolvedValue(null);
        const res = await request(buildApp())
            .put('/api-registry/missing')
            .send({ name: 'Updated' });
        expect(res.status).toBe(404);
    });

    it('updates API and returns result', async () => {
        mockUpdateApi.mockResolvedValue({ id: 'a-1', name: 'Updated' });
        const res = await request(buildApp())
            .put('/api-registry/a-1')
            .send({ name: 'Updated' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated');
    });
});

// =============================================================================
// DELETE /api-registry/:id
// =============================================================================

describe('DELETE /api-registry/:id', () => {
    it('returns 404 when not found', async () => {
        mockDeleteApi.mockResolvedValue(false);
        const res = await request(buildApp()).delete('/api-registry/missing');
        expect(res.status).toBe(404);
    });

    it('deletes and returns success', async () => {
        mockDeleteApi.mockResolvedValue(true);
        const res = await request(buildApp()).delete('/api-registry/a-1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// POST /api-registry/:id/enable and /disable
// =============================================================================

describe('POST /api-registry/:id/enable', () => {
    it('returns 404 when not found', async () => {
        mockSetApiEnabled.mockResolvedValue(false);
        const res = await request(buildApp()).post('/api-registry/missing/enable');
        expect(res.status).toBe(404);
    });

    it('enables API', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const res = await request(buildApp()).post('/api-registry/a-1/enable');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('a-1', true);
    });
});

describe('POST /api-registry/:id/disable', () => {
    it('disables API', async () => {
        mockSetApiEnabled.mockResolvedValue(true);
        const res = await request(buildApp()).post('/api-registry/a-1/disable');
        expect(res.status).toBe(200);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('a-1', false);
    });
});

// =============================================================================
// POST /api-registry/:id/test
// =============================================================================

describe('POST /api-registry/:id/test', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);
        const res = await request(buildApp()).post('/api-registry/missing/test');
        expect(res.status).toBe(404);
    });

    it('tests connectivity and returns success for 2xx', async () => {
        mockGetApi.mockResolvedValue({ id: 'a-1', baseUrl: 'https://api.test.com', testUrl: null });
        mockCallApi.mockResolvedValue({ status: 200, responseTimeMs: 15, body: 'OK', truncated: false });
        const res = await request(buildApp()).post('/api-registry/a-1/test');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe(200);
    });

    it('returns success:false for 5xx', async () => {
        mockGetApi.mockResolvedValue({ id: 'a-1', baseUrl: 'https://api.test.com', testUrl: null });
        mockCallApi.mockResolvedValue({ status: 503, responseTimeMs: 100, body: 'error', truncated: false });
        const res = await request(buildApp()).post('/api-registry/a-1/test');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });

    it('handles callApi error gracefully', async () => {
        mockGetApi.mockResolvedValue({ id: 'a-1', baseUrl: 'https://api.test.com', testUrl: null });
        mockCallApi.mockRejectedValue(new Error('ECONNREFUSED'));
        const res = await request(buildApp()).post('/api-registry/a-1/test');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('ECONNREFUSED');
    });
});

// =============================================================================
// GET /api-registry/:id/prompt-history
// =============================================================================

describe('GET /api-registry/:id/prompt-history', () => {
    it('returns prompt history', async () => {
        mockGetPromptHistory.mockResolvedValue([{ id: 'v-1', field: 'prompt_query' }]);
        const res = await request(buildApp()).get('/api-registry/a-1/prompt-history');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].field).toBe('prompt_query');
    });
});
