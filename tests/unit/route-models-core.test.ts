/**
 * Unit tests for routes/models.ts — proxy settings, chat settings,
 * image settings, API keys, conversational logging, cost export/timeseries/details,
 * detect-context, available models.
 *
 * Companion to route-models.test.ts which covers health, registry CRUD, and assignments.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetApiKeyStatus = jest.fn<() => any>().mockReturnValue({});
const mockSetApiKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

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

const mockIsConversationalLogging = jest.fn<() => boolean>().mockReturnValue(false);
const mockSetConversationalLogging = jest.fn<() => void>();

jest.unstable_mockModule('../../models.js', () => ({
    getApiKeyStatus: mockGetApiKeyStatus,
    setApiKeys: mockSetApiKeys,
    healthCheck: jest.fn<() => Promise<any>>().mockResolvedValue({ status: 'ok' }),
    getCostSummary: jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 }),
    getCostTimeSeries: jest.fn<() => Promise<any>>().mockResolvedValue([]),
    getCostDetails: jest.fn<() => Promise<any>>().mockResolvedValue({ rows: [] }),
    getCostExportRows: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    resetCostTracker: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getRegisteredModels: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    registerModel: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'new-model' }),
    updateRegisteredModel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    deleteRegisteredModel: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    checkModelHealth: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    detectContextSize: jest.fn<() => Promise<number | null>>().mockResolvedValue(null),
    getSubsystemAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    getNoThinkOverrides: jest.fn<() => any>().mockReturnValue({}),
    getThinkingLevelOverrides: jest.fn<() => any>().mockReturnValue({}),
    getConsultantAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    setSubsystemAssignment: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setSubsystemNoThink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setSubsystemThinking: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setConsultantAssignment: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getEmbeddingModelName: jest.fn<() => string>().mockReturnValue('nomic-embed-text'),
    embeddingConfig: { dimensions: 768 },
    VALID_SUBSYSTEMS: ['voice', 'chat', 'synthesis', 'research'],
    isConversationalLogging: mockIsConversationalLogging,
    setConversationalLogging: mockSetConversationalLogging,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {},
    resetSubsystemParams: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getAssignedModel: jest.fn().mockReturnValue(null),
    getSubsystemAssignments: jest.fn().mockResolvedValue({}),
    ensureAssignmentsLoaded: jest.fn().mockResolvedValue(undefined),
    setSubsystemAssignment: jest.fn().mockResolvedValue(undefined),
    setSubsystemNoThink: jest.fn().mockResolvedValue(undefined),
    getNoThinkOverrides: jest.fn().mockReturnValue({}),
    getThinkingLevelOverrides: jest.fn().mockReturnValue({}),
    setSubsystemThinking: jest.fn().mockResolvedValue(undefined),
    setConsultantAssignment: jest.fn().mockResolvedValue(undefined),
    getConsultantAssignments: jest.fn().mockResolvedValue({}),
    callSubsystemModel: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restoreFromRegistry: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

const modelsRouter = (await import('../../routes/models.js')).default;
const mockedModels = await import('../../models.js');

// Build test app
const app = express();
app.use(express.json());
app.use(modelsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockGetApiKeyStatus.mockReturnValue({});
    mockSetApiKeys.mockResolvedValue(undefined);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockIsConversationalLogging.mockReturnValue(false);
    (mockedModels.getCostTimeSeries as any).mockResolvedValue([]);
    (mockedModels.getCostDetails as any).mockResolvedValue({ rows: [] });
    (mockedModels.getCostExportRows as any).mockResolvedValue([]);
    (mockedModels.getRegisteredModels as any).mockResolvedValue([]);
    (mockedModels.detectContextSize as any).mockResolvedValue(null);
    (mockedModels.getEmbeddingModelName as any).mockReturnValue('nomic-embed-text');
});

// =============================================================================
// GET /models/cost/timeseries
// =============================================================================

describe('GET /models/cost/timeseries', () => {
    it('returns timeseries data', async () => {
        (mockedModels.getCostTimeSeries as any).mockResolvedValue([{ date: '2025-01-01', cost: 0.5 }]);

        const res = await request(app).get('/models/cost/timeseries');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('passes granularity and filter params', async () => {
        await request(app).get('/models/cost/timeseries?granularity=hour&days=3&subsystem=voice&model=gpt-4');

        expect(mockedModels.getCostTimeSeries).toHaveBeenCalledWith({
            granularity: 'hour',
            days: 3,
            subsystem: 'voice',
            modelId: 'gpt-4',
        });
    });

    it('defaults granularity to day', async () => {
        await request(app).get('/models/cost/timeseries');

        expect(mockedModels.getCostTimeSeries).toHaveBeenCalledWith(
            expect.objectContaining({ granularity: 'day' })
        );
    });
});

// =============================================================================
// GET /models/cost/details
// =============================================================================

describe('GET /models/cost/details', () => {
    it('returns cost details', async () => {
        (mockedModels.getCostDetails as any).mockResolvedValue({ rows: [{ id: 1 }] });

        const res = await request(app).get('/models/cost/details');

        expect(res.status).toBe(200);
        expect(res.body.rows).toHaveLength(1);
    });

    it('passes limit and offset params', async () => {
        await request(app).get('/models/cost/details?limit=50&offset=10&days=7');

        expect(mockedModels.getCostDetails).toHaveBeenCalledWith({
            days: 7,
            subsystem: undefined,
            modelId: undefined,
            limit: 50,
            offset: 10,
        });
    });
});

// =============================================================================
// GET /models/cost/export
// =============================================================================

describe('GET /models/cost/export', () => {
    it('returns CSV with correct headers', async () => {
        (mockedModels.getCostExportRows as any).mockResolvedValue([
            { id: 1, subsystem: 'voice', model_id: 'gpt-4', model_name: 'GPT-4', provider: 'openai',
              input_tokens: 100, output_tokens: 50, tool_tokens: 0, total_tokens: 150,
              input_cost: 0.001, output_cost: 0.002, tool_cost: 0, total_cost: 0.003,
              latency_ms: 500, finish_reason: 'stop', created_at: '2025-01-01' },
        ]);

        const res = await request(app).get('/models/cost/export');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.text).toContain('id,subsystem,model_id');
        expect(res.text).toContain('voice');
    });

    it('escapes CSV values with commas', async () => {
        (mockedModels.getCostExportRows as any).mockResolvedValue([
            { id: 1, subsystem: 'voice', model_id: 'model,with,commas', model_name: 'Test', provider: 'openai',
              input_tokens: 0, output_tokens: 0, tool_tokens: 0, total_tokens: 0,
              input_cost: 0, output_cost: 0, tool_cost: 0, total_cost: 0,
              latency_ms: 0, finish_reason: 'stop', created_at: '' },
        ]);

        const res = await request(app).get('/models/cost/export');

        expect(res.text).toContain('"model,with,commas"');
    });

    it('handles null values in export', async () => {
        (mockedModels.getCostExportRows as any).mockResolvedValue([
            { id: 1, subsystem: null, model_id: null, model_name: null, provider: null,
              input_tokens: null, output_tokens: null, tool_tokens: null, total_tokens: null,
              input_cost: null, output_cost: null, tool_cost: null, total_cost: null,
              latency_ms: null, finish_reason: null, created_at: null },
        ]);

        const res = await request(app).get('/models/cost/export');

        expect(res.status).toBe(200);
    });
});

// =============================================================================
// POST /models/registry/:id/detect-context
// =============================================================================

describe('POST /models/registry/:id/detect-context', () => {
    it('returns 404 when model not found', async () => {
        (mockedModels.getRegisteredModels as any).mockResolvedValue([]);

        const res = await request(app).post('/models/registry/nonexistent/detect-context');

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Model not found');
    });

    it('returns detected context size', async () => {
        (mockedModels.getRegisteredModels as any).mockResolvedValue([
            { id: 'm1', name: 'GPT-4' },
        ]);
        (mockedModels.detectContextSize as any).mockResolvedValue(128000);

        const res = await request(app).post('/models/registry/m1/detect-context');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.contextSize).toBe(128000);
    });

    it('returns ok=false when detection fails', async () => {
        (mockedModels.getRegisteredModels as any).mockResolvedValue([
            { id: 'm1', name: 'Local' },
        ]);
        (mockedModels.detectContextSize as any).mockResolvedValue(null);

        const res = await request(app).post('/models/registry/m1/detect-context');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(false);
        expect(res.body.contextSize).toBeNull();
    });
});

// =============================================================================
// GET /models/config
// =============================================================================

describe('GET /models/config', () => {
    it('returns embedding config', async () => {
        const res = await request(app).get('/models/config');

        expect(res.status).toBe(200);
        expect(res.body.embedding.model).toBe('nomic-embed-text');
        expect(res.body.embedding.endpoint).toBeNull();
        expect(res.body.embedding.provider).toBeNull();
    });
});

// =============================================================================
// GET /models/proxy-settings
// =============================================================================

describe('GET /models/proxy-settings', () => {
    it('returns defaults when no saved settings', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/models/proxy-settings');

        expect(res.status).toBe(200);
        expect(res.body.knowledgeReserve).toBe(0.15);
        expect(res.body.knowledgeMinReserve).toBe(0.05);
        expect(res.body.telegraphicEnabled).toBe(false);
    });

    it('merges saved settings with defaults', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ knowledgeReserve: 0.25, telegraphicEnabled: true }),
        });

        const res = await request(app).get('/models/proxy-settings');

        expect(res.status).toBe(200);
        expect(res.body.knowledgeReserve).toBe(0.25);
        expect(res.body.telegraphicEnabled).toBe(true);
        // Defaults still present for unset values
        expect(res.body.knowledgeMinReserve).toBe(0.05);
    });
});

// =============================================================================
// PUT /models/proxy-settings
// =============================================================================

describe('PUT /models/proxy-settings', () => {
    it('validates knowledgeReserve range', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.9 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('knowledgeReserve');
    });

    it('validates knowledgeMinReserve range', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ knowledgeMinReserve: 0.5 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('knowledgeMinReserve');
    });

    it('validates telegraphicAggressiveness values', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ telegraphicAggressiveness: 'extreme' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('telegraphicAggressiveness');
    });

    it('validates defaultModelProfile values', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ defaultModelProfile: 'giant' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('defaultModelProfile');
    });

    it('validates toolCallingMode values', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingMode: 'full-access' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('toolCallingMode');
    });

    it('validates toolCallingMaxIterations range', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingMaxIterations: 20 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('toolCallingMaxIterations');
    });

    it('validates toolCallingStrategy values', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ toolCallingStrategy: 'unknown' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('toolCallingStrategy');
    });

    it('validates maxKnowledgeNodes range', async () => {
        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ maxKnowledgeNodes: 200 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maxKnowledgeNodes');
    });

    it('saves valid settings and returns merged result', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ knowledgeReserve: 0.2, telegraphicEnabled: true });

        expect(res.status).toBe(200);
        expect(res.body.knowledgeReserve).toBe(0.2);
        expect(res.body.telegraphicEnabled).toBe(true);
        expect(mockSystemQuery).toHaveBeenCalled();
    });

    it('merges with existing saved settings', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ knowledgeReserve: 0.1 }),
        });
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/proxy-settings')
            .send({ telegraphicEnabled: true });

        expect(res.status).toBe(200);
        // Existing setting preserved
        expect(res.body.knowledgeReserve).toBe(0.1);
        expect(res.body.telegraphicEnabled).toBe(true);
    });
});

// =============================================================================
// GET /models/chat-settings
// =============================================================================

describe('GET /models/chat-settings', () => {
    it('returns defaults when no saved settings', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/models/chat-settings');

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(false);
        expect(res.body.toolCallingMaxIterations).toBe(3);
        expect(res.body.toolCallingMode).toBe('read-write');
    });

    it('merges saved settings with defaults', async () => {
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({ toolCallingEnabled: true }),
        });

        const res = await request(app).get('/models/chat-settings');

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(true);
        expect(res.body.toolCallingMaxIterations).toBe(3);
    });
});

// =============================================================================
// PUT /models/chat-settings
// =============================================================================

describe('PUT /models/chat-settings', () => {
    it('validates toolCallingMaxIterations range', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingMaxIterations: 20 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('toolCallingMaxIterations');
    });

    it('validates toolCallingMode values', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingMode: 'admin' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('toolCallingMode');
    });

    it('validates maxKnowledgeNodes range', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ maxKnowledgeNodes: 200 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maxKnowledgeNodes');
    });

    it('validates modelProfile values', async () => {
        const res = await request(app)
            .put('/models/chat-settings')
            .send({ modelProfile: 'giant' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('modelProfile');
    });

    it('accepts empty string for modelProfile (auto)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/chat-settings')
            .send({ modelProfile: '' });

        expect(res.status).toBe(200);
    });

    it('saves valid settings and returns merged result', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/chat-settings')
            .send({ toolCallingEnabled: true, toolCallingMaxIterations: 5 });

        expect(res.status).toBe(200);
        expect(res.body.toolCallingEnabled).toBe(true);
        expect(res.body.toolCallingMaxIterations).toBe(5);
    });
});

// =============================================================================
// GET /models/image-settings
// =============================================================================

describe('GET /models/image-settings', () => {
    it('returns defaults when no saved settings', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/models/image-settings');

        expect(res.status).toBe(200);
        expect(res.body.maxDimension).toBe(1024);
        expect(res.body.quality).toBe(80);
        expect(res.body.format).toBe('jpeg');
    });

    it('merges saved settings with defaults', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ maxDimension: 2048 }),
        });

        const res = await request(app).get('/models/image-settings');

        expect(res.status).toBe(200);
        expect(res.body.maxDimension).toBe(2048);
        expect(res.body.quality).toBe(80);
    });
});

// =============================================================================
// PUT /models/image-settings
// =============================================================================

describe('PUT /models/image-settings', () => {
    it('validates maxDimension range', async () => {
        const res = await request(app)
            .put('/models/image-settings')
            .send({ maxDimension: 100 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maxDimension');
    });

    it('validates quality range', async () => {
        const res = await request(app)
            .put('/models/image-settings')
            .send({ quality: 5 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('quality');
    });

    it('validates format values', async () => {
        const res = await request(app)
            .put('/models/image-settings')
            .send({ format: 'gif' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('format');
    });

    it('saves valid settings and returns merged result', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/image-settings')
            .send({ maxDimension: 2048, format: 'webp' });

        expect(res.status).toBe(200);
        expect(res.body.maxDimension).toBe(2048);
        expect(res.body.format).toBe('webp');
        expect(res.body.quality).toBe(80); // default preserved
    });
});

// =============================================================================
// GET /models/api-keys
// =============================================================================

describe('GET /models/api-keys', () => {
    it('returns API key status', async () => {
        mockGetApiKeyStatus.mockReturnValue({ openai: true, anthropic: false });

        const res = await request(app).get('/models/api-keys');

        expect(res.status).toBe(200);
        expect(res.body.openai).toBe(true);
        expect(res.body.anthropic).toBe(false);
    });
});

// =============================================================================
// PUT /models/api-keys
// =============================================================================

describe('PUT /models/api-keys', () => {
    it('handles non-object body gracefully', async () => {
        const res = await request(app)
            .put('/models/api-keys')
            .send('invalid');

        // Express parses string as JSON body — may succeed or return 400
        expect([200, 400]).toContain(res.status);
    });

    it('sets API keys and returns success', async () => {
        mockGetApiKeyStatus.mockReturnValue({ openai: true });

        const res = await request(app)
            .put('/models/api-keys')
            .send({ openai: 'sk-test-key' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSetApiKeys).toHaveBeenCalledWith({ openai: 'sk-test-key' });
    });
});

// =============================================================================
// GET /models/conv-logging
// =============================================================================

describe('GET /models/conv-logging', () => {
    it('returns current logging state', async () => {
        mockIsConversationalLogging.mockReturnValue(true);

        const res = await request(app).get('/models/conv-logging');

        expect(res.status).toBe(200);
        expect(res.body.enabled).toBe(true);
    });
});

// =============================================================================
// PUT /models/conv-logging
// =============================================================================

describe('PUT /models/conv-logging', () => {
    it('enables conversational logging', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/conv-logging')
            .send({ enabled: true });

        expect(res.status).toBe(200);
        expect(res.body.enabled).toBe(true);
        expect(mockSetConversationalLogging).toHaveBeenCalledWith(true);
        expect(mockSystemQuery).toHaveBeenCalled();
    });

    it('disables conversational logging', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app)
            .put('/models/conv-logging')
            .send({ enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.enabled).toBe(false);
        expect(mockSetConversationalLogging).toHaveBeenCalledWith(false);
    });
});
