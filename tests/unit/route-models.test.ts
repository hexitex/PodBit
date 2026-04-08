/**
 * Unit tests for routes/models.ts —
 * health, cost, registry CRUD, subsystem assignments.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

// Static imports from models.js
const mockGetApiKeyStatus = jest.fn<() => any>().mockReturnValue({});
const mockSetApiKeys = jest.fn<() => void>();

jest.unstable_mockModule('../../models.js', () => ({
    getApiKeyStatus: mockGetApiKeyStatus,
    setApiKeys: mockSetApiKeys,
    // Dynamic-import functions (also needed to avoid "not a function" errors)
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
    getProjectOverrides: jest.fn<() => any>().mockReturnValue({}),
    embeddingConfig: { dimensions: 768 },
    VALID_SUBSYSTEMS: ['voice', 'chat', 'synthesis', 'research'],
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

// db.js — for models/registry/:id/health
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
    query: mockSystemQuery,
}));

// config.js — for resetSubsystemParams
const mockResetSubsystemParams = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../config.js', () => ({
    resetSubsystemParams: mockResetSubsystemParams,
}));

// tuning-registry.js
jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restoreFromRegistry: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

const modelsRouter = (await import('../../routes/models.js')).default;
// Get the mocked models module to access its mocked functions
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
    (mockedModels.healthCheck as any).mockResolvedValue({ status: 'ok' });
    (mockedModels.getCostSummary as any).mockResolvedValue({ total: 0 });
    (mockedModels.getCostTimeSeries as any).mockResolvedValue([]);
    (mockedModels.getCostDetails as any).mockResolvedValue({ rows: [] });
    (mockedModels.getCostExportRows as any).mockResolvedValue([]);
    (mockedModels.resetCostTracker as any).mockResolvedValue(undefined);
    (mockedModels.getRegisteredModels as any).mockResolvedValue([]);
    (mockedModels.registerModel as any).mockResolvedValue({ id: 'new-model' });
    (mockedModels.updateRegisteredModel as any).mockResolvedValue(undefined);
    (mockedModels.deleteRegisteredModel as any).mockResolvedValue(undefined);
    (mockedModels.checkModelHealth as any).mockResolvedValue(undefined);
    (mockedModels.detectContextSize as any).mockResolvedValue(null);
    (mockedModels.getSubsystemAssignments as any).mockResolvedValue({});
    (mockedModels.getNoThinkOverrides as any).mockReturnValue({});
    (mockedModels.getThinkingLevelOverrides as any).mockReturnValue({});
    (mockedModels.getConsultantAssignments as any).mockResolvedValue({});
    (mockedModels.setSubsystemAssignment as any).mockResolvedValue(undefined);
    (mockedModels.setSubsystemNoThink as any).mockResolvedValue(undefined);
    (mockedModels.setSubsystemThinking as any).mockResolvedValue(undefined);
    (mockedModels.setConsultantAssignment as any).mockResolvedValue(undefined);
    (mockedModels.getEmbeddingModelName as any).mockReturnValue('nomic-embed-text');
    mockSystemQuery.mockResolvedValue([]);
    mockResetSubsystemParams.mockResolvedValue(undefined);
});

// =============================================================================
// GET /models/health
// =============================================================================

describe('GET /models/health', () => {
    it('returns health status', async () => {
        (mockedModels.healthCheck as any).mockResolvedValue({ status: 'ok', models: 3 });

        const res = await request(app).get('/models/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('passes force=true when requested', async () => {
        await request(app).get('/models/health?force=true');

        expect(mockedModels.healthCheck).toHaveBeenCalledWith(true);
    });

    it('passes force=false by default', async () => {
        await request(app).get('/models/health');

        expect(mockedModels.healthCheck).toHaveBeenCalledWith(false);
    });
});

// =============================================================================
// GET /models/cost
// =============================================================================

describe('GET /models/cost', () => {
    it('returns cost summary', async () => {
        (mockedModels.getCostSummary as any).mockResolvedValue({ total: 1.23 });

        const res = await request(app).get('/models/cost');

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1.23);
    });

    it('passes days, subsystem, modelId params', async () => {
        await request(app).get('/models/cost?days=7&subsystem=voice&model=gpt-4');

        expect(mockedModels.getCostSummary).toHaveBeenCalledWith({
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
        expect(mockedModels.resetCostTracker).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /models/registry
// =============================================================================

describe('GET /models/registry', () => {
    it('returns registered models', async () => {
        (mockedModels.getRegisteredModels as any).mockResolvedValue([
            { id: 'm1', name: 'GPT-4', provider: 'openai' },
        ]);

        const res = await request(app).get('/models/registry');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].name).toBe('GPT-4');
    });
});

// =============================================================================
// POST /models/registry
// =============================================================================

describe('POST /models/registry', () => {
    it('returns 400 when required fields missing', async () => {
        const res = await request(app).post('/models/registry').send({ name: 'Test' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('required');
    });

    it('creates model and returns 201', async () => {
        (mockedModels.registerModel as any).mockResolvedValue({ id: 'new-m', name: 'Claude' });

        const res = await request(app).post('/models/registry').send({
            name: 'Claude',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
        });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Claude');
    });

    it('passes all optional fields to registerModel', async () => {
        (mockedModels.registerModel as any).mockResolvedValue({ id: 'x' });

        await request(app).post('/models/registry').send({
            name: 'M', provider: 'openai', modelId: 'gpt-4',
            tier: 'large', maxTokens: 4096, contextSize: 128000,
            inputCostPerMtok: 3.0, outputCostPerMtok: 15.0,
        });

        expect(mockedModels.registerModel).toHaveBeenCalledWith(
            expect.objectContaining({
                tier: 'large',
                maxTokens: 4096,
                contextSize: 128000,
            })
        );
    });
});

// =============================================================================
// PUT /models/registry/:id
// =============================================================================

describe('PUT /models/registry/:id', () => {
    it('updates model and returns ok', async () => {
        const res = await request(app).put('/models/registry/m1').send({ enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockedModels.updateRegisteredModel).toHaveBeenCalledWith('m1', { enabled: false });
    });
});

// =============================================================================
// DELETE /models/registry/:id
// =============================================================================

describe('DELETE /models/registry/:id', () => {
    it('deletes model and returns ok', async () => {
        const res = await request(app).delete('/models/registry/m1');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockedModels.deleteRegisteredModel).toHaveBeenCalledWith('m1');
    });
});

// =============================================================================
// POST /models/registry/:id/health
// =============================================================================

describe('POST /models/registry/:id/health', () => {
    it('returns 404 when model not in DB', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const res = await request(app).post('/models/registry/nonexistent/health');

        expect(res.status).toBe(404);
    });

    it('returns ok when health check passes', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'm1', name: 'Claude', model_id: 'claude', provider: 'anthropic',
            endpoint_url: null, api_key: null,
        }]);
        (mockedModels.checkModelHealth as any).mockResolvedValue(undefined);

        const res = await request(app).post('/models/registry/m1/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('returns error status when health check throws', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'm1', name: 'Claude', model_id: 'claude', provider: 'anthropic',
            endpoint_url: null, api_key: null,
        }]);
        (mockedModels.checkModelHealth as any).mockRejectedValue(new Error('Connection refused'));

        const res = await request(app).post('/models/registry/m1/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toContain('Connection refused');
    });
});

// =============================================================================
// GET /models/assignments
// =============================================================================

describe('GET /models/assignments', () => {
    it('returns assignments, overrides, and consultants', async () => {
        (mockedModels.getSubsystemAssignments as any).mockResolvedValue({ voice: { id: 'm1' } });
        (mockedModels.getNoThinkOverrides as any).mockReturnValue({ voice: true });
        (mockedModels.getConsultantAssignments as any).mockResolvedValue({ voice: { id: 'm2' } });

        const res = await request(app).get('/models/assignments');

        expect(res.status).toBe(200);
        expect(res.body.assignments.voice.id).toBe('m1');
        expect(res.body.noThinkOverrides.voice).toBe(true);
        expect(res.body.consultants.voice.id).toBe('m2');
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem
// =============================================================================

describe('PUT /models/assignments/:subsystem', () => {
    it('returns 400 for invalid subsystem', async () => {
        const res = await request(app).put('/models/assignments/invalid-subsystem').send({ modelId: 'm1' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid subsystem');
    });

    it('sets subsystem assignment', async () => {
        (mockedModels.getSubsystemAssignments as any).mockResolvedValue({});

        const res = await request(app).put('/models/assignments/voice').send({ modelId: 'm1' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockedModels.setSubsystemAssignment).toHaveBeenCalledWith('voice', 'm1', undefined);
    });

    it('sets thinking level without modelId change', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ thinkingLevel: 'high' });

        expect(res.status).toBe(200);
        expect(mockedModels.setSubsystemThinking).toHaveBeenCalledWith('voice', 'high');
    });

    it('sets noThink without modelId change', async () => {
        const res = await request(app)
            .put('/models/assignments/voice')
            .send({ noThink: true });

        expect(res.status).toBe(200);
        expect(mockedModels.setSubsystemNoThink).toHaveBeenCalledWith('voice', true);
    });
});

// =============================================================================
// PUT /models/assignments/:subsystem/consultant
// =============================================================================

describe('PUT /models/assignments/:subsystem/consultant', () => {
    it('returns 400 for invalid subsystem', async () => {
        const res = await request(app)
            .put('/models/assignments/invalid/consultant')
            .send({ modelId: 'm1' });

        expect(res.status).toBe(400);
    });

    it('sets consultant assignment', async () => {
        const res = await request(app)
            .put('/models/assignments/voice/consultant')
            .send({ modelId: 'm2' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockedModels.setConsultantAssignment).toHaveBeenCalledWith('voice', 'm2');
    });

    it('clears consultant when modelId is null', async () => {
        await request(app)
            .put('/models/assignments/voice/consultant')
            .send({ modelId: null });

        expect(mockedModels.setConsultantAssignment).toHaveBeenCalledWith('voice', null);
    });
});
