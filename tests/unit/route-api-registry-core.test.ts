/**
 * Unit tests for routes/api-registry.ts —
 * CRUD for API registry, stats, verifications, enable/disable, test, prompt-history
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockListApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockCreateApi = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'new-api-1' });
const mockGetApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockUpdateApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockDeleteApi = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSetApiEnabled = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockSavePromptVersion = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetPromptHistory = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../evm/api/registry.js', () => ({
    listApis: mockListApis,
    createApi: mockCreateApi,
    getApi: mockGetApi,
    updateApi: mockUpdateApi,
    deleteApi: mockDeleteApi,
    setApiEnabled: mockSetApiEnabled,
    savePromptVersion: mockSavePromptVersion,
    getPromptHistory: mockGetPromptHistory,
}));

const mockGetApiVerificationStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetFilteredApiVerifications = jest.fn<() => Promise<any>>().mockResolvedValue({ rows: [] });

jest.unstable_mockModule('../../evm/api/audit.js', () => ({
    getApiVerificationStats: mockGetApiVerificationStats,
    getFilteredApiVerifications: mockGetFilteredApiVerifications,
}));

const mockHandleOnboard = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'ok' });

jest.unstable_mockModule('../../evm/api/onboard.js', () => ({
    handleOnboard: mockHandleOnboard,
}));

const mockCallApi = jest.fn<() => Promise<any>>().mockResolvedValue({
    status: 200,
    body: 'OK',
    responseTimeMs: 50,
    truncated: false,
});

jest.unstable_mockModule('../../evm/api/caller.js', () => ({
    callApi: mockCallApi,
}));

const mockFormulateQuery = jest.fn<() => Promise<any>>().mockResolvedValue({
    method: 'GET',
    url: 'http://test.com',
    headers: {},
});

jest.unstable_mockModule('../../evm/api/query-formulator.js', () => ({
    formulateQuery: mockFormulateQuery,
}));

const mockInterpretResult = jest.fn<() => Promise<any>>().mockResolvedValue({
    impact: 'supports',
    confidence: 0.8,
    evidenceSummary: 'Supports the claim',
    corrections: [],
});

jest.unstable_mockModule('../../evm/api/interpreter.js', () => ({
    interpretResult: mockInterpretResult,
}));

const mockExtractEnrichments = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../evm/api/enrichment.js', () => ({
    extractEnrichments: mockExtractEnrichments,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const apiRegistryRouter = (await import('../../routes/api-registry.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(apiRegistryRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockGetApi.mockResolvedValue(null);
    mockUpdateApi.mockResolvedValue(null);
    mockDeleteApi.mockResolvedValue(false);
    mockSetApiEnabled.mockResolvedValue(false);
});

// =============================================================================
// GET /api-registry/stats
// =============================================================================

describe('GET /api-registry/stats', () => {
    it('returns verification stats', async () => {
        mockGetApiVerificationStats.mockResolvedValue({ total: 42, passed: 30 });

        const res = await request(app).get('/api-registry/stats');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(42);
    });

    it('passes days query parameter', async () => {
        await request(app).get('/api-registry/stats?days=30');

        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(30);
    });

    it('defaults to 7 days when no query param', async () => {
        await request(app).get('/api-registry/stats');

        expect(mockGetApiVerificationStats).toHaveBeenCalledWith(7);
    });
});

// =============================================================================
// GET /api-registry/verifications
// =============================================================================

describe('GET /api-registry/verifications', () => {
    it('returns filtered verifications', async () => {
        mockGetFilteredApiVerifications.mockResolvedValue({ rows: [{ id: 'v1' }] });

        const res = await request(app).get('/api-registry/verifications');

        expect(res.status).toBe(200);
        expect(res.body.rows).toBeDefined();
    });

    it('passes query filters', async () => {
        await request(app).get('/api-registry/verifications?apiId=a1&status=pass&limit=10&offset=5');

        expect(mockGetFilteredApiVerifications).toHaveBeenCalledWith(
            expect.objectContaining({
                apiId: 'a1',
                status: 'pass',
                limit: 10,
                offset: 5,
            })
        );
    });
});

// =============================================================================
// POST /api-registry/onboard
// =============================================================================

describe('POST /api-registry/onboard', () => {
    it('returns onboard result', async () => {
        mockHandleOnboard.mockResolvedValue({ status: 'complete', apiId: 'new' });

        const res = await request(app)
            .post('/api-registry/onboard')
            .send({ name: 'Test API', response: 'yes' });

        expect(res.status).toBe(200);
    });

    it('returns 400 when handler returns error status', async () => {
        mockHandleOnboard.mockResolvedValue({ status: 'error', error: 'Invalid' });

        const res = await request(app)
            .post('/api-registry/onboard')
            .send({ name: 'Bad API' });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// CRUD
// =============================================================================

describe('GET /api-registry', () => {
    it('returns list of APIs', async () => {
        mockListApis.mockResolvedValue([{ id: 'api-1', name: 'Test' }]);

        const res = await request(app).get('/api-registry');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });
});

describe('POST /api-registry', () => {
    it('creates a new API and returns 201', async () => {
        mockCreateApi.mockResolvedValue({ id: 'new-api', name: 'New API' });

        const res = await request(app)
            .post('/api-registry')
            .send({ name: 'New API', baseUrl: 'http://example.com' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('new-api');
    });
});

describe('GET /api-registry/:id', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);

        const res = await request(app).get('/api-registry/nonexistent');

        expect(res.status).toBe(404);
    });

    it('returns API when found', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', name: 'Found API' });

        const res = await request(app).get('/api-registry/api-1');

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Found API');
    });
});

describe('PUT /api-registry/:id', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);
        mockUpdateApi.mockResolvedValue(null);

        const res = await request(app)
            .put('/api-registry/nonexistent')
            .send({ name: 'Updated' });

        expect(res.status).toBe(404);
    });

    it('updates API and returns updated data', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', name: 'Old', promptQuery: 'old' });
        mockUpdateApi.mockResolvedValue({ id: 'api-1', name: 'Updated' });

        const res = await request(app)
            .put('/api-registry/api-1')
            .send({ name: 'Updated' });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Updated');
    });

    it('saves prompt version when promptQuery changes', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', promptQuery: 'old query' });
        mockUpdateApi.mockResolvedValue({ id: 'api-1', promptQuery: 'new query' });

        await request(app)
            .put('/api-registry/api-1')
            .send({ promptQuery: 'new query' });

        expect(mockSavePromptVersion).toHaveBeenCalledWith(
            'api-1', 'prompt_query', 'new query', 'Updated via GUI', 'gui:user'
        );
    });

    it('does not save prompt version when prompt unchanged', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', promptQuery: 'same query' });
        mockUpdateApi.mockResolvedValue({ id: 'api-1', promptQuery: 'same query' });

        await request(app)
            .put('/api-registry/api-1')
            .send({ promptQuery: 'same query' });

        expect(mockSavePromptVersion).not.toHaveBeenCalled();
    });
});

describe('DELETE /api-registry/:id', () => {
    it('returns 404 when API not found', async () => {
        mockDeleteApi.mockResolvedValue(false);

        const res = await request(app).delete('/api-registry/nonexistent');

        expect(res.status).toBe(404);
    });

    it('deletes API and returns success', async () => {
        mockDeleteApi.mockResolvedValue(true);

        const res = await request(app).delete('/api-registry/api-1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

// =============================================================================
// Actions
// =============================================================================

describe('POST /api-registry/:id/enable', () => {
    it('returns 404 when API not found', async () => {
        mockSetApiEnabled.mockResolvedValue(false);

        const res = await request(app).post('/api-registry/nonexistent/enable');

        expect(res.status).toBe(404);
    });

    it('enables API and returns success', async () => {
        mockSetApiEnabled.mockResolvedValue(true);

        const res = await request(app).post('/api-registry/api-1/enable');

        expect(res.status).toBe(200);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('api-1', true);
    });
});

describe('POST /api-registry/:id/disable', () => {
    it('disables API', async () => {
        mockSetApiEnabled.mockResolvedValue(true);

        const res = await request(app).post('/api-registry/api-1/disable');

        expect(res.status).toBe(200);
        expect(mockSetApiEnabled).toHaveBeenCalledWith('api-1', false);
    });
});

describe('POST /api-registry/:id/test', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);

        const res = await request(app).post('/api-registry/nonexistent/test');

        expect(res.status).toBe(404);
    });

    it('tests API connectivity and returns result', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', baseUrl: 'http://example.com' });
        mockCallApi.mockResolvedValue({
            status: 200,
            body: 'OK response',
            responseTimeMs: 100,
            truncated: false,
        });

        const res = await request(app).post('/api-registry/api-1/test');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe(200);
    });

    it('uses testUrl when available', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', baseUrl: 'http://base.com', testUrl: 'http://test.com/health' });
        mockCallApi.mockResolvedValue({
            status: 200,
            body: 'OK',
            responseTimeMs: 50,
            truncated: false,
        });

        const res = await request(app).post('/api-registry/api-1/test');

        expect(res.status).toBe(200);
        expect(res.body.testUrl).toBe('http://test.com/health');
    });

    it('reports failure for server errors', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', baseUrl: 'http://example.com' });
        mockCallApi.mockResolvedValue({
            status: 500,
            body: 'Server Error',
            responseTimeMs: 200,
            truncated: false,
        });

        const res = await request(app).post('/api-registry/api-1/test');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });

    it('handles callApi exceptions', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', baseUrl: 'http://example.com' });
        mockCallApi.mockRejectedValue(new Error('Network error'));

        const res = await request(app).post('/api-registry/api-1/test');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('Network error');
    });
});

describe('POST /api-registry/:id/test-claim', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);

        const res = await request(app)
            .post('/api-registry/nonexistent/test-claim')
            .send({ claim: 'test claim' });

        expect(res.status).toBe(404);
    });

    it('returns 400 when no claim provided', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', name: 'Test' });

        const res = await request(app)
            .post('/api-registry/api-1/test-claim')
            .send({});

        expect(res.status).toBe(400);
    });

    it('runs full claim test pipeline', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', name: 'Test API' });
        mockCallApi.mockResolvedValue({
            status: 200,
            body: '{"result": "data"}',
            responseTimeMs: 50,
            truncated: false,
        });

        const res = await request(app)
            .post('/api-registry/api-1/test-claim')
            .send({ claim: 'The sky is blue' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.impact).toBe('supports');
    });

    it('returns failure when API returns non-2xx', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', name: 'Test API' });
        mockCallApi.mockResolvedValue({
            status: 404,
            body: 'Not Found',
            responseTimeMs: 50,
            truncated: false,
        });

        const res = await request(app)
            .post('/api-registry/api-1/test-claim')
            .send({ claim: 'test' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /api-registry/:id/test-enrichment', () => {
    it('returns 404 when API not found', async () => {
        mockGetApi.mockResolvedValue(null);

        const res = await request(app)
            .post('/api-registry/nonexistent/test-enrichment')
            .send({ claim: 'test' });

        expect(res.status).toBe(404);
    });

    it('returns 400 when API is verify-only', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', mode: 'verify' });

        const res = await request(app)
            .post('/api-registry/api-1/test-enrichment')
            .send({ claim: 'test' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when no claim provided', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', mode: 'enrich' });

        const res = await request(app)
            .post('/api-registry/api-1/test-enrichment')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns enrichment results', async () => {
        mockGetApi.mockResolvedValue({ id: 'api-1', mode: 'enrich', name: 'Test' });
        mockCallApi.mockResolvedValue({
            status: 200,
            body: '{"data": "value"}',
            responseTimeMs: 50,
            truncated: false,
        });
        mockExtractEnrichments.mockResolvedValue([{ fact: 'Enriched data' }]);

        const res = await request(app)
            .post('/api-registry/api-1/test-enrichment')
            .send({ claim: 'test claim', domain: 'science' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.factCount).toBe(1);
    });
});

describe('GET /api-registry/:id/prompt-history', () => {
    it('returns prompt history', async () => {
        mockGetPromptHistory.mockResolvedValue([{ version: 1, content: 'old prompt' }]);

        const res = await request(app).get('/api-registry/api-1/prompt-history');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('passes field filter', async () => {
        await request(app).get('/api-registry/api-1/prompt-history?field=prompt_query');

        expect(mockGetPromptHistory).toHaveBeenCalledWith('api-1', 'prompt_query');
    });
});
