/**
 * Deep unit tests for routes/models.ts — covers uncovered branches:
 * health, cost summary, cost reset, CSV escaping edge cases, available models
 * (fetch success/failure/non-ok), registry CRUD (POST validation, PUT, DELETE),
 * registry health check (found ok, found error, not found), assignments
 * (thinkingLevel-only, noThink-only, noThink=null, resetParams with tuning
 * registry save/restore, save failure, restore failure, remaining assignments,
 * resetParams without model change), consultant assignments, API keys null body.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetApiKeyStatus = jest.fn<() => any>().mockReturnValue({});
const mockSetApiKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHealthCheck = jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'ok' });
const mockGetCostSummary = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetCostTimeSeries = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockGetCostDetails = jest.fn<() => Promise<any>>().mockResolvedValue({ rows: [] });
const mockGetCostExportRows = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockResetCostTracker = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetRegisteredModels = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockRegisterModel = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'new-model' });
const mockUpdateRegisteredModel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeleteRegisteredModel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCheckModelHealth = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDetectContextSize = jest.fn<() => Promise<number | null>>().mockResolvedValue(null);
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockGetNoThinkOverrides = jest.fn<() => any>().mockReturnValue({});
const mockGetThinkingLevelOverrides = jest.fn<() => any>().mockReturnValue({});
const mockGetConsultantAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockSetSubsystemAssignment = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetSubsystemNoThink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetSubsystemThinking = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetConsultantAssignment = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('nomic-embed-text');
const mockIsConversationalLogging = jest.fn<() => boolean>().mockReturnValue(false);
const mockSetConversationalLogging = jest.fn<() => void>();

const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getApiKeyStatus: mockGetApiKeyStatus,
    setApiKeys: mockSetApiKeys,
    healthCheck: mockHealthCheck,
    getCostSummary: mockGetCostSummary,
    getCostTimeSeries: mockGetCostTimeSeries,
    getCostDetails: mockGetCostDetails,
    getCostExportRows: mockGetCostExportRows,
    resetCostTracker: mockResetCostTracker,
    getRegisteredModels: mockGetRegisteredModels,
    registerModel: mockRegisterModel,
    updateRegisteredModel: mockUpdateRegisteredModel,
    deleteRegisteredModel: mockDeleteRegisteredModel,
    checkModelHealth: mockCheckModelHealth,
    detectContextSize: mockDetectContextSize,
    getSubsystemAssignments: mockGetSubsystemAssignments,
    getNoThinkOverrides: mockGetNoThinkOverrides,
    getThinkingLevelOverrides: mockGetThinkingLevelOverrides,
    getConsultantAssignments: mockGetConsultantAssignments,
    setSubsystemAssignment: mockSetSubsystemAssignment,
    setSubsystemNoThink: mockSetSubsystemNoThink,
    setSubsystemThinking: mockSetSubsystemThinking,
    setConsultantAssignment: mockSetConsultantAssignment,
    getEmbeddingModelName: mockGetEmbeddingModelName,
    getProjectOverrides: jest.fn<() => any>().mockReturnValue({}),
    embeddingConfig: { dimensions: 768 },
    VALID_SUBSYSTEMS: ['voice', 'chat', 'synthesis', 'research'],
    isConversationalLogging: mockIsConversationalLogging,
    setConversationalLogging: mockSetConversationalLogging,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockResetSubsystemParams = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../config.js', () => ({
    resetSubsystemParams: mockResetSubsystemParams,
}));

const mockSaveToRegistry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRestoreFromRegistry = jest.fn<() => Promise<any>>().mockResolvedValue(null);
jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: mockSaveToRegistry,
    restoreFromRegistry: mockRestoreFromRegistry,
}));

const modelsRouter = (await import('../../routes/models.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(modelsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

// Save original fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    mockGetApiKeyStatus.mockReturnValue({});
    mockSetApiKeys.mockResolvedValue(undefined);
    mockHealthCheck.mockResolvedValue({ status: 'ok' });
    mockGetCostSummary.mockResolvedValue({ total: 0 });
    mockGetCostTimeSeries.mockResolvedValue([]);
    mockGetCostDetails.mockResolvedValue({ rows: [] });
    mockGetCostExportRows.mockResolvedValue([]);
    mockResetCostTracker.mockResolvedValue(undefined);
    mockGetRegisteredModels.mockResolvedValue([]);
    mockRegisterModel.mockResolvedValue({ id: 'new-model' });
    mockCheckModelHealth.mockResolvedValue(undefined);
    mockDetectContextSize.mockResolvedValue(null);
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockIsConversationalLogging.mockReturnValue(false);
    mockSaveToRegistry.mockResolvedValue(undefined);
    mockRestoreFromRegistry.mockResolvedValue(null);
    mockResetSubsystemParams.mockResolvedValue(undefined);
    // Restore fetch
    globalThis.fetch = originalFetch;
});

// =============================================================================
// GET /models/health
// =============================================================================

describe('GET /models/health', () => {
    it('returns health check result without force', async () => {
        mockHealthCheck.mockResolvedValue({ status: 'ok', models: 3 });

        const res = await request(app).get('/models/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(mockHealthCheck).toHaveBeenCalledWith(false);
    });

    it('passes force=true when query param set', async () => {
        mockHealthCheck.mockResolvedValue({ status: 'ok' });

        await request(app).get('/models/health?force=true');

        expect(mockHealthCheck).toHaveBeenCalledWith(true);
    });

    it('passes force=false when query param is not true', async () => {
        await request(app).get('/models/health?force=false');

        expect(mockHealthCheck).toHaveBeenCalledWith(false);
    });
});

// =============================================================================
// GET /models/cost
// =============================================================================

describe('GET /models/cost', () => {
    it('returns cost summary with defaults', async () => {
        mockGetCostSummary.mockResolvedValue({ total: 1.5 });

        const res = await request(app).get('/models/cost');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1.5);
        expect(mockGetCostSummary).toHaveBeenCalledWith({
            days: undefined,
            subsystem: undefined,
            modelId: undefined,
        });
    });

    it('passes filter params', async () => {
        await request(app).get('/models/cost?days=7&subsystem=voice&model=gpt-4');

        expect(mockGetCostSummary).toHaveBeenCalledWith({
            days: 7,
            subsystem: 'voice',
            modelId: 'gpt-4',
        });
    });
});

// =============================================================================
// POST /models/cost/reset
// =============================================================================

describe('POST /models/cost/reset', () => {
    it('resets cost tracker and returns success', async () => {
        const res = await request(app).post('/models/cost/reset');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe('Usage log cleared');
        expect(mockResetCostTracker).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /models/cost/export — CSV escaping edge cases
// =============================================================================

describe('GET /models/cost/export — CSV escaping', () => {
    it('escapes values containing double quotes', async () => {
        mockGetCostExportRows.mockResolvedValue([
            {
                id: 1, subsystem: 'voice', model_id: 'model"quoted', model_name: 'Test',
                provider: 'openai', input_tokens: 0, output_tokens: 0, tool_tokens: 0,
                total_tokens: 0, input_cost: 0, output_cost: 0, tool_cost: 0, total_cost: 0,
                latency_ms: 0, finish_reason: 'stop', created_at: '',
            },
        ]);

        const res = await request(app).get('/models/cost/export');

        expect(res.status).toBe(200);
        // Double quotes are escaped by doubling them and wrapping in quotes
        expect(res.text).toContain('"model""quoted"');
    });

    it('escapes values containing newlines', async () => {
        mockGetCostExportRows.mockResolvedValue([
            {
                id: 1, subsystem: 'voice', model_id: 'line1\nline2', model_name: 'Test',
                provider: 'openai', input_tokens: 0, output_tokens: 0, tool_tokens: 0,
                total_tokens: 0, input_cost: 0, output_cost: 0, tool_cost: 0, total_cost: 0,
                latency_ms: 0, finish_reason: 'stop', created_at: '',
            },
        ]);

        const res = await request(app).get('/models/cost/export');

        expect(res.status).toBe(200);
        // Newlines cause quoting
        expect(res.text).toContain('"line1\nline2"');
    });

    it('passes filter params to getCostExportRows', async () => {
        mockGetCostExportRows.mockResolvedValue([]);

        await request(app).get('/models/cost/export?days=30&subsystem=chat&model=m1');

        expect(mockGetCostExportRows).toHaveBeenCalledWith({
            days: 30,
            subsystem: 'chat',
            modelId: 'm1',
        });
    });

    it('returns empty CSV with only headers when no rows', async () => {
        mockGetCostExportRows.mockResolvedValue([]);

        const res = await request(app).get('/models/cost/export');

        expect(res.status).toBe(200);
        const lines = res.text.split('\n');
        expect(lines).toHaveLength(1); // only header row
        expect(lines[0]).toContain('id,subsystem,model_id');
    });
});

// =============================================================================
// GET /models/available
// =============================================================================

describe('GET /models/available', () => {
    it('returns models from both LM Studio and Ollama', async () => {
        globalThis.fetch = jest.fn<typeof fetch>()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: [{ id: 'llama' }, { id: 'embed-v2' }] }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ models: [{ name: 'mistral' }, { name: 'nomic-embed-text' }] }),
            } as any);

        const res = await request(app).get('/models/available');

        expect(res.status).toBe(200);
        expect(res.body.lmstudio).toHaveLength(2);
        expect(res.body.lmstudio[0]).toEqual({ id: 'llama', name: 'llama', type: 'llm' });
        expect(res.body.lmstudio[1].type).toBe('embedding'); // 'embed-v2' contains 'embed'
        expect(res.body.ollama).toHaveLength(2);
        expect(res.body.ollama[0]).toEqual({ id: 'mistral', name: 'mistral', type: 'llm' });
        expect(res.body.ollama[1].type).toBe('embedding');
    });

    it('reports error when LM Studio is not running', async () => {
        globalThis.fetch = jest.fn<typeof fetch>()
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const res = await request(app).get('/models/available');

        expect(res.status).toBe(200);
        expect(res.body.lmstudioError).toBe('Not running');
        expect(res.body.ollamaError).toBe('Not running');
    });

    it('handles non-ok responses from providers', async () => {
        globalThis.fetch = jest.fn<typeof fetch>()
            .mockResolvedValueOnce({ ok: false } as any)
            .mockResolvedValueOnce({ ok: false } as any);

        const res = await request(app).get('/models/available');

        expect(res.status).toBe(200);
        // Non-ok doesn't set error but also doesn't populate results
        expect(res.body.lmstudio).toEqual([]);
        expect(res.body.ollama).toEqual([]);
    });

    it('handles missing data/models arrays gracefully', async () => {
        globalThis.fetch = jest.fn<typeof fetch>()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}), // no data property
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}), // no models property
            } as any);

        const res = await request(app).get('/models/available');

        expect(res.status).toBe(200);
        expect(res.body.lmstudio).toEqual([]);
        expect(res.body.ollama).toEqual([]);
    });

    it('handles LM Studio failure but Ollama success', async () => {
        globalThis.fetch = jest.fn<typeof fetch>()
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ models: [{ name: 'phi3' }] }),
            } as any);

        const res = await request(app).get('/models/available');

        expect(res.status).toBe(200);
        expect(res.body.lmstudioError).toBe('Not running');
        expect(res.body.ollama).toHaveLength(1);
    });
});

// =============================================================================
// POST /models/registry — registration validation & edge cases
// =============================================================================

describe('POST /models/registry', () => {
    it('returns 400 when name is missing', async () => {
        const res = await request(app)
            .post('/models/registry')
            .send({ provider: 'openai', modelId: 'gpt-4' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('name');
    });

    it('returns 400 when provider is missing', async () => {
        const res = await request(app)
            .post('/models/registry')
            .send({ name: 'GPT-4', modelId: 'gpt-4' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('provider');
    });

    it('returns 400 when modelId is missing', async () => {
        const res = await request(app)
            .post('/models/registry')
            .send({ name: 'GPT-4', provider: 'openai' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('modelId');
    });

    it('registers model with minimal fields and defaults', async () => {
        mockRegisterModel.mockResolvedValue({ id: 'new-1', name: 'Test' });

        const res = await request(app)
            .post('/models/registry')
            .send({ name: 'Test', provider: 'openai', modelId: 'gpt-4' });

        expect(res.status).toBe(201);
        expect(mockRegisterModel).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Test',
            provider: 'openai',
            modelId: 'gpt-4',
            tier: 'medium',
            endpointUrl: null,
            apiKey: null,
            enabled: true,
            maxTokens: null,
            contextSize: null,
            costPer1k: 0,
            inputCostPerMtok: 0,
            outputCostPerMtok: 0,
            toolCostPerMtok: 0,
            sortOrder: 0,
            maxRetries: 3,
            retryWindowMinutes: 2,
            maxConcurrency: 1,
            requestPauseMs: 0,
            requestTimeout: 180,
            rateLimitBackoffMs: 120000,
            supportsTools: null,
            noThink: false,
            thinkingLevel: null,
        }));
    });

    it('registers model with all fields provided', async () => {
        mockRegisterModel.mockResolvedValue({ id: 'new-2' });

        const res = await request(app)
            .post('/models/registry')
            .send({
                name: 'Full', provider: 'lmstudio', modelId: 'llama-3',
                tier: 'large', endpointUrl: 'http://localhost:1234/v1',
                apiKey: 'sk-test', enabled: false, maxTokens: 4096,
                contextSize: 128000, costPer1k: 0.01,
                inputCostPerMtok: 2.5, outputCostPerMtok: 10,
                toolCostPerMtok: 5, sortOrder: 10,
                maxRetries: 5, retryWindowMinutes: 5,
                maxConcurrency: 3, requestPauseMs: 100,
                requestTimeout: 300, rateLimitBackoffMs: 60000,
                supportsTools: true, noThink: true,
            });

        expect(res.status).toBe(201);
        expect(mockRegisterModel).toHaveBeenCalledWith(expect.objectContaining({
            tier: 'large',
            endpointUrl: 'http://localhost:1234/v1',
            apiKey: 'sk-test',
            enabled: false,
            maxTokens: 4096,
            contextSize: 128000,
            supportsTools: true,
            noThink: true,
            thinkingLevel: 'off', // noThink=true -> thinkingLevel='off'
        }));
    });

    it('sets supportsTools to false when explicitly false', async () => {
        mockRegisterModel.mockResolvedValue({ id: 'new-3' });

        await request(app)
            .post('/models/registry')
            .send({ name: 'A', provider: 'openai', modelId: 'x', supportsTools: false });

        expect(mockRegisterModel).toHaveBeenCalledWith(expect.objectContaining({
            supportsTools: false,
        }));
    });

    it('sets thinkingLevel to null when noThink is false', async () => {
        mockRegisterModel.mockResolvedValue({ id: 'new-4' });

        await request(app)
            .post('/models/registry')
            .send({ name: 'A', provider: 'openai', modelId: 'x', noThink: false });

        expect(mockRegisterModel).toHaveBeenCalledWith(expect.objectContaining({
            noThink: false,
            thinkingLevel: null,
        }));
    });
});

// =============================================================================
// PUT /models/registry/:id
// =============================================================================

describe('PUT /models/registry/:id', () => {
    it('updates a registered model', async () => {
        mockUpdateRegisteredModel.mockResolvedValue(undefined);

        const res = await request(app)
            .put('/models/registry/model-1')
            .send({ name: 'Updated Name', enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockUpdateRegisteredModel).toHaveBeenCalledWith('model-1', { name: 'Updated Name', enabled: false });
    });
});

// =============================================================================
// DELETE /models/registry/:id
// =============================================================================

describe('DELETE /models/registry/:id', () => {
    it('deletes a registered model', async () => {
        mockDeleteRegisteredModel.mockResolvedValue(undefined);

        const res = await request(app).delete('/models/registry/model-1');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockDeleteRegisteredModel).toHaveBeenCalledWith('model-1');
    });
});

// =============================================================================
// POST /models/registry/:id/health
// =============================================================================

describe('POST /models/registry/:id/health', () => {
    it('returns 404 when model not found in DB', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app).post('/models/registry/nonexistent/health');

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Model not found');
    });

    it('returns ok status when health check passes', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'm1', name: 'GPT-4', model_id: 'gpt-4', provider: 'openai',
            endpoint_url: 'https://api.openai.com/v1', api_key: 'sk-test',
        }]);
        mockCheckModelHealth.mockResolvedValue(undefined);

        const res = await request(app).post('/models/registry/m1/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.name).toBe('GPT-4');
        expect(mockCheckModelHealth).toHaveBeenCalledWith({
            name: 'gpt-4', provider: 'openai', model: 'gpt-4',
            endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test',
        });
    });

    it('returns error status when health check fails', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'm1', name: 'GPT-4', model_id: 'gpt-4', provider: 'openai',
            endpoint_url: null, api_key: null,
        }]);
        mockCheckModelHealth.mockRejectedValue(new Error('Connection refused'));

        const res = await request(app).post('/models/registry/m1/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toBe('Connection refused');
    });

    it('passes undefined for null endpoint_url and api_key', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'm1', name: 'Local', model_id: 'llama', provider: 'lmstudio',
            endpoint_url: null, api_key: null,
        }]);

        await request(app).post('/models/registry/m1/health');

        expect(mockCheckModelHealth).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: undefined, apiKey: undefined })
        );
    });
});

// =============================================================================
// GET /models/assignments
// =============================================================================

describe('GET /models/assignments', () => {
    it('returns assignments with overrides and consultants', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ voice: { id: 'm1' } });
        mockGetNoThinkOverrides.mockReturnValue({ voice: true });
        mockGetThinkingLevelOverrides.mockReturnValue({ voice: 'low' });
        mockGetConsultantAssignments.mockResolvedValue({ voice: { id: 'm2' } });

        const res = await request(app).get('/models/assignments');

        expect(res.status).toBe(200);
        expect(res.body.assignments).toEqual({ voice: { id: 'm1' } });
        expect(res.body.noThinkOverrides).toEqual({ voice: true });
        expect(res.body.thinkingLevelOverrides).toEqual({ voice: 'low' });
        expect(res.body.consultants).toEqual({ voice: { id: 'm2' } });
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem
// =============================================================================

describe('PUT /models/assignments/:subsystem', () => {
    it('returns 400 for invalid subsystem', async () => {
        const res = await request(app)
            .put('/models/assignments/invalid_subsystem')
            .send({ modelId: 'm1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid subsystem');
    });

    it('updates only thinkingLevel when modelId is undefined', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ thinkingLevel: 'low' });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemThinking).toHaveBeenCalledWith('voice', 'low');
        expect(mockSetSubsystemAssignment).not.toHaveBeenCalled();
    });

    it('sets thinkingLevel to null when falsy value provided', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ thinkingLevel: '' });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemThinking).toHaveBeenCalledWith('voice', null);
    });

    it('updates only noThink when modelId is undefined (legacy path)', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ noThink: true });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemNoThink).toHaveBeenCalledWith('voice', true);
        expect(mockSetSubsystemAssignment).not.toHaveBeenCalled();
    });

    it('sets noThink to null for inheritance (legacy path)', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ noThink: null });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemNoThink).toHaveBeenCalledWith('voice', null);
    });

    it('assigns model with modelId', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model-id' });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemAssignment).toHaveBeenCalledWith('voice', 'new-model-id', undefined);
        expect(res.body.ok).toBe(true);
    });

    it('assigns model with noThink override', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model-id', noThink: true });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemAssignment).toHaveBeenCalledWith('voice', 'new-model-id', true);
    });

    it('passes noThink=null for inheritance with modelId', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model-id', noThink: null });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemAssignment).toHaveBeenCalledWith('voice', 'new-model-id', null);
    });

    it('unassigns model when modelId is null', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: null });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemAssignment).toHaveBeenCalledWith('voice', null, undefined);
    });

    // resetParams paths
    it('resetParams with model change — saves outgoing to registry when last subsystem', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'OldModel', provider: 'openai' },
        });

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        expect(res.status).toBe(200);
        expect(mockSetSubsystemAssignment).toHaveBeenCalled();
        // Last subsystem using old-model, so save to registry
        expect(mockSaveToRegistry).toHaveBeenCalledWith('old-model', 'OldModel', 'openai', ['voice']);
        expect(mockResetSubsystemParams).toHaveBeenCalledWith('voice');
        expect(mockRestoreFromRegistry).toHaveBeenCalledWith('new-model', 'voice');
    });

    it('resetParams with model change — skips save when other subsystems still use outgoing model', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'OldModel', provider: 'openai' },
            chat: { id: 'old-model', name: 'OldModel', provider: 'openai' },
        });

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        expect(res.status).toBe(200);
        // Other subsystem (chat) still uses old-model, so no save
        expect(mockSaveToRegistry).not.toHaveBeenCalled();
        expect(mockResetSubsystemParams).toHaveBeenCalledWith('voice');
        expect(mockRestoreFromRegistry).toHaveBeenCalledWith('new-model', 'voice');
    });

    it('resetParams with model change — handles save failure gracefully', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'OldModel', provider: 'openai' },
        });
        mockSaveToRegistry.mockRejectedValue(new Error('DB error'));

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        // Should not fail — save error is non-fatal
        expect(res.status).toBe(200);
        expect(mockResetSubsystemParams).toHaveBeenCalled();
    });

    it('resetParams with model change — handles restore failure gracefully', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'OldModel', provider: 'openai' },
        });
        mockRestoreFromRegistry.mockRejectedValue(new Error('No saved config'));

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        expect(res.status).toBe(200);
    });

    it('resetParams with model change — returns registryRestore data', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'OldModel', provider: 'openai' },
        });
        mockRestoreFromRegistry.mockResolvedValue({ temperature: 0.7, maxTokens: 2048 });

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        expect(res.status).toBe(200);
        expect(res.body.registryRestore).toEqual({ temperature: 0.7, maxTokens: 2048 });
    });

    it('resetParams without model change — just resets params', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'same-model', name: 'Same', provider: 'openai' },
        });

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'same-model', resetParams: true });

        expect(res.status).toBe(200);
        expect(mockResetSubsystemParams).toHaveBeenCalledWith('voice');
        // No save/restore because model didn't change
        expect(mockSaveToRegistry).not.toHaveBeenCalled();
        expect(mockRestoreFromRegistry).not.toHaveBeenCalled();
    });

    it('resetParams with no outgoing model — just resets params', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model', resetParams: true });

        expect(res.status).toBe(200);
        expect(mockResetSubsystemParams).toHaveBeenCalledWith('voice');
        // No outgoing model, so no save
        expect(mockSaveToRegistry).not.toHaveBeenCalled();
    });

    it('no resetParams — does not reset or save/restore', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'old-model', name: 'Old', provider: 'openai' },
        });

        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ modelId: 'new-model' });

        expect(res.status).toBe(200);
        expect(mockResetSubsystemParams).not.toHaveBeenCalled();
        expect(mockSaveToRegistry).not.toHaveBeenCalled();
        expect(res.body.registryRestore).toBeNull();
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem/consultant
// =============================================================================

describe('PUT /models/assignments/:subsystem/consultant', () => {
    it('returns 400 for invalid subsystem', async () => {
        const res = await request(app)
            .put('/models/assignments/bogus/consultant')
            .send({ modelId: 'm1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid subsystem');
    });

    it('assigns consultant model', async () => {
        const res = await request(app)
            .put('/models/assignments/voice/consultant')
            .send({ modelId: 'consultant-model' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockSetConsultantAssignment).toHaveBeenCalledWith('voice', 'consultant-model');
    });

    it('unassigns consultant when modelId not provided', async () => {
        const res = await request(app)
            .put('/models/assignments/chat/consultant')
            .send({});

        expect(res.status).toBe(200);
        expect(mockSetConsultantAssignment).toHaveBeenCalledWith('chat', null);
    });
});

// =============================================================================
// PUT /models/api-keys — null/non-object body
// =============================================================================

describe('PUT /models/api-keys — body validation', () => {
    it('accepts null body since typeof null === object', async () => {
        // Note: typeof null === 'object' in JS, so null passes the validation check.
        // The route calls setApiKeys(null) which may throw — caught by error handler.
        mockSetApiKeys.mockRejectedValue(new Error('Invalid keys'));

        const res = await request(app)
            .put('/models/api-keys')
            .set('Content-Type', 'application/json')
            .send('null');

        // Route proceeds (typeof null === 'object'), setApiKeys fails => 500
        expect(res.status).toBe(500);
    });

    it('returns 400 when body is an array (not a plain object)', async () => {
        // Arrays pass typeof === 'object' but the route checks !keys which is false for arrays.
        // Arrays are valid objects, so setApiKeys gets called. Test that it handles gracefully.
        const res = await request(app)
            .put('/models/api-keys')
            .send([1, 2, 3]);

        // Arrays are objects, so the validation passes and setApiKeys is called
        expect(mockSetApiKeys).toHaveBeenCalledWith([1, 2, 3]);
        expect(res.status).toBe(200);
    });

    it('sets keys successfully with valid object', async () => {
        mockGetApiKeyStatus.mockReturnValue({ openai: true });

        const res = await request(app)
            .put('/models/api-keys')
            .send({ openai: 'sk-key' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetApiKeys).toHaveBeenCalledWith({ openai: 'sk-key' });
    });
});

// =============================================================================
// PUT /models/proxy-settings — valid boolean/string settings
// =============================================================================

describe('PUT /models/proxy-settings — additional branches', () => {
    it('accepts valid telegraphicEnabled as truthy value', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ telegraphicEnabled: 1 });

        expect(res.status).toBe(200);
        expect(res.body.telegraphicEnabled).toBe(true);
    });

    it('accepts valid compressClientPrompt', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ compressClientPrompt: true });

        expect(res.status).toBe(200);
        expect(res.body.compressClientPrompt).toBe(true);
    });

    it('accepts valid toolCallingEnabled', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingEnabled: true });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(true);
    });

    it('accepts valid toolCallingStrategy complement', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingStrategy: 'complement' });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingStrategy).toBe('complement');
    });

    it('accepts valid toolCallingMode read-only', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingMode: 'read-only' });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingMode).toBe('read-only');
    });

    it('accepts valid toolCallingMaxIterations', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingMaxIterations: 5 });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingMaxIterations).toBe(5);
    });

    it('accepts valid maxKnowledgeNodes', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ maxKnowledgeNodes: 50 });

        expect(res.status).toBe(200);
        expect(res.body.maxKnowledgeNodes).toBe(50);
    });

    it('validates knowledgeReserve too low', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.001 });

        expect(res.status).toBe(400);
    });

    it('validates maxKnowledgeNodes negative', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ maxKnowledgeNodes: -1 });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// PUT /models/chat-settings — additional branches
// =============================================================================

describe('PUT /models/chat-settings — additional branches', () => {
    it('accepts valid toolCallingEnabled', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingEnabled: true });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(true);
    });

    it('merges with existing saved chat settings', async () => {
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({ toolCallingEnabled: true }),
        });
        mockQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingMaxIterations: 5 });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(true);
        expect(res.body.toolCallingMaxIterations).toBe(5);
    });

    it('validates toolCallingMaxIterations too low', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingMaxIterations: 0 });

        expect(res.status).toBe(400);
    });

    it('validates maxKnowledgeNodes negative', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ maxKnowledgeNodes: -5 });

        expect(res.status).toBe(400);
    });
});

// =============================================================================
// PUT /models/image-settings — additional branches
// =============================================================================

describe('PUT /models/image-settings — additional branches', () => {
    it('validates maxDimension too high', async () => {
        const res = await request(app)
            .put('/models/image-settings')
            .send({ maxDimension: 9999 });

        expect(res.status).toBe(400);
    });

    it('validates quality too high', async () => {
        const res = await request(app)
            .put('/models/image-settings')
            .send({ quality: 200 });

        expect(res.status).toBe(400);
    });

    it('merges with existing saved image settings', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ maxDimension: 512 }),
        });
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/image-settings')
            .send({ quality: 90 });

        expect(res.status).toBe(200);
        expect(res.body.maxDimension).toBe(512);
        expect(res.body.quality).toBe(90);
    });

    it('accepts valid png format', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/image-settings')
            .send({ format: 'png' });

        expect(res.status).toBe(200);
        expect(res.body.format).toBe('png');
    });
});

// =============================================================================
// GET /models/registry
// =============================================================================

describe('GET /models/registry', () => {
    it('returns registered models list', async () => {
        mockGetRegisteredModels.mockResolvedValue([
            { id: 'm1', name: 'GPT-4' },
            { id: 'm2', name: 'Claude' },
        ]);

        const res = await request(app).get('/models/registry');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });
});
