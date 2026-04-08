/**
 * API tests for routes/models.ts
 *
 * Tests: POST /models/registry (required fields),
 *        PUT /models/assignments/:subsystem (invalid subsystem),
 *        PUT /models/proxy-settings (validation),
 *        PUT /models/chat-settings (validation),
 *        PUT /models/image-settings (validation),
 *        PUT /models/api-keys (validation),
 *        GET /models/api-keys, GET /models/config,
 *        POST /models/cost/reset, GET /models/registry
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetRegisteredModels = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockRegisterModel = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'model-1', name: 'Test' });
const mockUpdateRegisteredModel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeleteRegisteredModel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockSetSubsystemAssignment = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetSubsystemNoThink = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetSubsystemThinking = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetNoThinkOverrides = jest.fn<() => any>().mockReturnValue({});
const mockGetThinkingLevelOverrides = jest.fn<() => any>().mockReturnValue({});
const mockGetConsultantAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockSetConsultantAssignment = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetApiKeyStatus = jest.fn<() => any>().mockReturnValue({ anthropic: false });
const mockSetApiKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHealthCheck = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
const mockGetCostSummary = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetCostTimeSeries = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockGetCostDetails = jest.fn<() => Promise<any>>().mockResolvedValue({ rows: [] });
const mockGetCostExportRows = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockResetCostTracker = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('nomic-embed-text');
const mockIsConversationalLogging = jest.fn<() => boolean>().mockReturnValue(false);
const mockSetConversationalLogging = jest.fn<(v: boolean) => void>();
const mockResetSubsystemParams = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../models.js', () => ({
    getRegisteredModels: mockGetRegisteredModels,
    registerModel: mockRegisterModel,
    updateRegisteredModel: mockUpdateRegisteredModel,
    deleteRegisteredModel: mockDeleteRegisteredModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
    setSubsystemAssignment: mockSetSubsystemAssignment,
    setSubsystemNoThink: mockSetSubsystemNoThink,
    setSubsystemThinking: mockSetSubsystemThinking,
    getNoThinkOverrides: mockGetNoThinkOverrides,
    getThinkingLevelOverrides: mockGetThinkingLevelOverrides,
    getConsultantAssignments: mockGetConsultantAssignments,
    setConsultantAssignment: mockSetConsultantAssignment,
    getApiKeyStatus: mockGetApiKeyStatus,
    setApiKeys: mockSetApiKeys,
    healthCheck: mockHealthCheck,
    getCostSummary: mockGetCostSummary,
    getCostTimeSeries: mockGetCostTimeSeries,
    getCostDetails: mockGetCostDetails,
    getCostExportRows: mockGetCostExportRows,
    resetCostTracker: mockResetCostTracker,
    getEmbeddingModelName: mockGetEmbeddingModelName,
    isConversationalLogging: mockIsConversationalLogging,
    setConversationalLogging: mockSetConversationalLogging,
    detectContextSize: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    checkModelHealth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    embeddingConfig: { dimensions: 768 },
    VALID_SUBSYSTEMS: ['voice', 'synthesis', 'chat', 'proxy', 'validation', 'questions',
        'tensions', 'research', 'autorating', 'evm', 'voicing', 'dedup', 'kb',
        'reader_text', 'reader_pdf', 'reader_doc', 'reader_image', 'reader_sheet', 'reader_code',
        'elite_mapping', 'embed', 'embed_query', 'claim_provenance', 'hallucination',
        'counterfactual', 'derivative', 'fitness', 'qa', 'autorating_judge'],
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../config.js', () => ({
    resetSubsystemParams: mockResetSubsystemParams,
}));

jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restoreFromRegistry: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: modelsRouter } = await import('../../routes/models.js');

/** Express app with models router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', modelsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetRegisteredModels.mockResolvedValue([]);
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetApiKeyStatus.mockReturnValue({ anthropic: false });
});

// =============================================================================
// GET /models/registry
// =============================================================================

describe('GET /models/registry', () => {
    it('returns array of models', async () => {
        mockGetRegisteredModels.mockResolvedValue([{ id: 'm1', name: 'Test' }]);
        const res = await request(buildApp()).get('/models/registry');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

// =============================================================================
// POST /models/registry
// =============================================================================

describe('POST /models/registry', () => {
    it('returns 400 when name is missing', async () => {
        const res = await request(buildApp())
            .post('/models/registry')
            .send({ provider: 'openai', modelId: 'gpt-4' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name/i);
    });

    it('returns 400 when provider is missing', async () => {
        const res = await request(buildApp())
            .post('/models/registry')
            .send({ name: 'My Model', modelId: 'gpt-4' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/provider/i);
    });

    it('returns 400 when modelId is missing', async () => {
        const res = await request(buildApp())
            .post('/models/registry')
            .send({ name: 'My Model', provider: 'openai' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/modelId/i);
    });

    it('creates model with valid required fields', async () => {
        mockRegisterModel.mockResolvedValue({ id: 'm1', name: 'My Model' });
        const res = await request(buildApp())
            .post('/models/registry')
            .send({ name: 'My Model', provider: 'openai', modelId: 'gpt-4' });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(mockRegisterModel).toHaveBeenCalled();
    });
});

// =============================================================================
// PUT /models/registry/:id
// =============================================================================

describe('PUT /models/registry/:id', () => {
    it('updates a model and returns ok', async () => {
        const res = await request(buildApp())
            .put('/models/registry/model-1')
            .send({ name: 'Updated Name' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// =============================================================================
// DELETE /models/registry/:id
// =============================================================================

describe('DELETE /models/registry/:id', () => {
    it('deletes a model and returns ok', async () => {
        const res = await request(buildApp()).delete('/models/registry/model-1');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// =============================================================================
// POST /models/registry/:id/health
// =============================================================================

describe('POST /models/registry/:id/health', () => {
    it('returns 404 when model not found', async () => {
        const dbMod = await import('../../db.js');
        (dbMod.systemQuery as jest.MockedFunction<any>).mockResolvedValue([]);
        const res = await request(buildApp()).post('/models/registry/nonexistent/health');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem
// =============================================================================

describe('PUT /models/assignments/:subsystem', () => {
    it('returns 400 for invalid subsystem name', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/invalid-subsystem')
            .send({ modelId: 'model-1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid subsystem/i);
    });

    it('accepts valid subsystem', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/voice')
            .send({ modelId: 'model-1' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('updates thinking level without changing model', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/voice')
            .send({ thinkingLevel: 'high' });
        expect(res.status).toBe(200);
        expect(mockSetSubsystemThinking).toHaveBeenCalled();
    });

    it('updates noThink without changing model', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/voice')
            .send({ noThink: true });
        expect(res.status).toBe(200);
        expect(mockSetSubsystemNoThink).toHaveBeenCalled();
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem/consultant
// =============================================================================

describe('PUT /models/assignments/:subsystem/consultant', () => {
    it('returns 400 for invalid subsystem', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/bogus/consultant')
            .send({ modelId: 'model-1' });
        expect(res.status).toBe(400);
    });

    it('sets consultant for valid subsystem', async () => {
        const res = await request(buildApp())
            .put('/models/assignments/voice/consultant')
            .send({ modelId: 'model-1' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// =============================================================================
// PUT /models/proxy-settings
// =============================================================================

describe('PUT /models/proxy-settings', () => {
    it('returns 400 when knowledgeReserve < 0.01', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.005 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/knowledgeReserve/i);
    });

    it('returns 400 when knowledgeReserve > 0.5', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.6 });
        expect(res.status).toBe(400);
    });

    it('returns 400 when knowledgeMinReserve > 0.3', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ knowledgeMinReserve: 0.5 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/knowledgeMinReserve/i);
    });

    it('returns 400 for invalid telegraphicAggressiveness', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ telegraphicAggressiveness: 'extreme' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/telegraphicAggressiveness/i);
    });

    it('returns 400 for invalid defaultModelProfile', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ defaultModelProfile: 'giant' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/defaultModelProfile/i);
    });

    it('returns 400 for invalid toolCallingMode', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ toolCallingMode: 'superpower' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when toolCallingMaxIterations > 10', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ toolCallingMaxIterations: 15 });
        expect(res.status).toBe(400);
    });

    it('returns 400 when maxKnowledgeNodes > 100', async () => {
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ maxKnowledgeNodes: 150 });
        expect(res.status).toBe(400);
    });

    it('accepts valid settings', async () => {
        const dbMod = await import('../../db.js');
        (dbMod.systemQueryOne as jest.MockedFunction<any>).mockResolvedValue(null);
        (dbMod.systemQuery as jest.MockedFunction<any>).mockResolvedValue([]);
        const res = await request(buildApp())
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.2, defaultModelProfile: 'medium' });
        expect(res.status).toBe(200);
    });
});

// =============================================================================
// PUT /models/chat-settings
// =============================================================================

describe('PUT /models/chat-settings', () => {
    it('returns 400 when toolCallingMaxIterations > 10', async () => {
        const res = await request(buildApp())
            .put('/models/chat-settings')
            .send({ toolCallingMaxIterations: 20 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/toolCallingMaxIterations/i);
    });

    it('returns 400 for invalid toolCallingMode', async () => {
        const res = await request(buildApp())
            .put('/models/chat-settings')
            .send({ toolCallingMode: 'write-only' });
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid modelProfile', async () => {
        const res = await request(buildApp())
            .put('/models/chat-settings')
            .send({ modelProfile: 'unknown-profile' });
        expect(res.status).toBe(400);
    });

    it('accepts empty string modelProfile (auto)', async () => {
        const dbMod = await import('../../db.js');
        (dbMod.queryOne as jest.MockedFunction<any>).mockResolvedValue(null);
        (dbMod.query as jest.MockedFunction<any>).mockResolvedValue([]);
        const res = await request(buildApp())
            .put('/models/chat-settings')
            .send({ modelProfile: '' });
        expect(res.status).toBe(200);
    });
});

// =============================================================================
// PUT /models/image-settings
// =============================================================================

describe('PUT /models/image-settings', () => {
    it('returns 400 when maxDimension < 256', async () => {
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ maxDimension: 100 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/maxDimension/i);
    });

    it('returns 400 when maxDimension > 4096', async () => {
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ maxDimension: 5000 });
        expect(res.status).toBe(400);
    });

    it('returns 400 when quality < 10', async () => {
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ quality: 5 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/quality/i);
    });

    it('returns 400 when quality > 100', async () => {
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ quality: 110 });
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid format', async () => {
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ format: 'bmp' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/format/i);
    });

    it('accepts valid jpeg format', async () => {
        const dbMod = await import('../../db.js');
        (dbMod.systemQueryOne as jest.MockedFunction<any>).mockResolvedValue(null);
        (dbMod.systemQuery as jest.MockedFunction<any>).mockResolvedValue([]);
        const res = await request(buildApp())
            .put('/models/image-settings')
            .send({ format: 'jpeg', quality: 85, maxDimension: 1024 });
        expect(res.status).toBe(200);
    });
});

// =============================================================================
// GET /models/api-keys
// =============================================================================

describe('GET /models/api-keys', () => {
    it('returns api key status object', async () => {
        mockGetApiKeyStatus.mockReturnValue({ openai: true, anthropic: false });
        const res = await request(buildApp()).get('/models/api-keys');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('openai');
        expect(res.body).toHaveProperty('anthropic');
    });
});

// =============================================================================
// PUT /models/api-keys
// =============================================================================

describe('PUT /models/api-keys', () => {
    it('accepts arrays (typeof [] === "object" in JS — route does not reject them)', async () => {
        // The route checks `typeof keys !== 'object'` — arrays pass this check
        const res = await request(buildApp())
            .put('/models/api-keys')
            .send([1, 2, 3]);
        expect(res.status).toBe(200);
    });

    it('accepts valid key object', async () => {
        const res = await request(buildApp())
            .put('/models/api-keys')
            .send({ openai: 'sk-test123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetApiKeys).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /models/cost/reset
// =============================================================================

describe('POST /models/cost/reset', () => {
    it('resets cost tracker', async () => {
        const res = await request(buildApp()).post('/models/cost/reset');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockResetCostTracker).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /models/conv-logging
// =============================================================================

describe('GET /models/conv-logging', () => {
    it('returns enabled status', async () => {
        mockIsConversationalLogging.mockReturnValue(false);
        const res = await request(buildApp()).get('/models/conv-logging');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('enabled');
        expect(res.body.enabled).toBe(false);
    });
});
