/**
 * API tests for routes/config-tune.ts
 *
 * Tests: POST /config/tune, /generate-patterns, /generate-intent-patterns, /generate-words,
 *        GET /config/sections, GET /config/defaults/:sectionId,
 *        GET/POST/POST /config/snapshots, GET /config/history, GET /config/metrics,
 *        GET/PUT/DELETE /config/dedup-gates
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const MOCK_SECTION_METADATA: Record<string, any> = {
    'test-section': {
        title: 'Test Section',
        description: 'A test config section',
        behavior: 'Controls test behavior',
        parameters: [
            {
                key: 'testParam',
                label: 'Test Param',
                description: 'A test param',
                configPath: ['test', 'param'],
                min: 0,
                max: 1,
                step: 0.1,
                default: 0.5,
            },
        ],
    },
};

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue(
    JSON.stringify({ suggestions: [], summary: 'ok' })
);
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({ config_tune: 'model-1' });
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('mock prompt');
const mockGetSafeConfig = jest.fn<() => any>().mockReturnValue({ test: { param: 0.5 }, tensions: { patterns: [] } });
const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockInvalidateGateOverrideCache = jest.fn<() => void>();
const mockHandleConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: MOCK_SECTION_METADATA,
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockDbQuery,
}));

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    invalidateGateOverrideCache: mockInvalidateGateOverrideCache,
}));

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: configTuneRouter } = await import('../../routes/config-tune.js');

/** Express app with config-tune router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', configTuneRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ suggestions: [], summary: 'ok' }));
    mockGetSubsystemAssignments.mockResolvedValue({ config_tune: 'model-1' });
    mockGetPrompt.mockResolvedValue('mock prompt');
    mockGetSafeConfig.mockReturnValue({ test: { param: 0.5 }, tensions: { patterns: [] }, contextEngine: { intentPatterns: {} } });
    mockDbQuery.mockResolvedValue([]);
    mockHandleConfig.mockResolvedValue({ ok: true });
});

// =============================================================================
// POST /config/tune
// =============================================================================

describe('POST /config/tune', () => {
    it('returns 400 when sectionId is missing', async () => {
        const res = await request(buildApp()).post('/config/tune').send({ request: 'tune me' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('sectionId and request are required');
    });

    it('returns 400 when request is missing', async () => {
        const res = await request(buildApp()).post('/config/tune').send({ sectionId: 'test-section' });
        expect(res.status).toBe(400);
    });

    it('returns 400 for unknown section', async () => {
        const res = await request(buildApp()).post('/config/tune').send({ sectionId: 'nonexistent', request: 'tune' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unknown section');
    });

    it('calls LLM and returns suggestions for valid section', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            suggestions: [{ key: 'testParam', currentValue: 0.5, suggestedValue: 0.7, explanation: 'better' }],
            summary: 'Looks good',
        }));
        const res = await request(buildApp())
            .post('/config/tune')
            .send({ sectionId: 'test-section', request: 'improve quality' });
        expect(res.status).toBe(200);
        expect(res.body.sectionId).toBe('test-section');
        expect(res.body.sectionTitle).toBe('Test Section');
        expect(res.body).toHaveProperty('suggestions');
        expect(res.body).toHaveProperty('summary');
    });

    it('returns 502 when LLM response is unparseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('not json at all');
        const res = await request(buildApp())
            .post('/config/tune')
            .send({ sectionId: 'test-section', request: 'tune' });
        expect(res.status).toBe(502);
    });

    it('clamps suggestion values to param min/max', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            suggestions: [{ key: 'testParam', currentValue: 0.5, suggestedValue: 99.9, explanation: 'way too high' }],
            summary: 'ok',
        }));
        const res = await request(buildApp())
            .post('/config/tune')
            .send({ sectionId: 'test-section', request: 'tune' });
        expect(res.status).toBe(200);
        // suggestedValue should be clamped to max=1
        expect(res.body.suggestions[0].suggestedValue).toBe(1);
    });
});

// =============================================================================
// POST /config/tune/generate-patterns
// =============================================================================

describe('POST /config/tune/generate-patterns', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(buildApp()).post('/config/tune/generate-patterns').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('request is required');
    });

    it('returns pairs and summary', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            pairs: [['innovation', 'tradition'], ['growth', 'stability']],
            summary: 'Good contrast pairs',
        }));
        const res = await request(buildApp())
            .post('/config/tune/generate-patterns')
            .send({ request: 'opposing concepts in philosophy' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pairs');
        expect(res.body).toHaveProperty('summary');
    });

    it('returns 502 on unparseable LLM response', async () => {
        mockCallSubsystemModel.mockResolvedValue('garbage');
        const res = await request(buildApp())
            .post('/config/tune/generate-patterns')
            .send({ request: 'test' });
        expect(res.status).toBe(502);
    });
});

// =============================================================================
// POST /config/tune/generate-intent-patterns
// =============================================================================

describe('POST /config/tune/generate-intent-patterns', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(buildApp()).post('/config/tune/generate-intent-patterns').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('request is required');
    });

    it('returns 400 for invalid intentType', async () => {
        const res = await request(buildApp())
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'test', intentType: 'invalid' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid intentType');
    });

    it('returns patterns for valid request', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            patterns: { retrieval: ['find.*', 'search.*'], action: [], diagnosis: [], exploration: [] },
            summary: 'Intent patterns',
        }));
        const res = await request(buildApp())
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'add search patterns', intentType: 'retrieval' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('patterns');
    });
});

// =============================================================================
// POST /config/tune/generate-words
// =============================================================================

describe('POST /config/tune/generate-words', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(buildApp()).post('/config/tune/generate-words').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('request is required');
    });

    it('returns 400 for invalid listType', async () => {
        const res = await request(buildApp())
            .post('/config/tune/generate-words')
            .send({ request: 'test', listType: 'invalid' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid listType');
    });

    it('returns words for valid request', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ words: ['alpha', 'beta', 'gamma'] }));
        const res = await request(buildApp())
            .post('/config/tune/generate-words')
            .send({ request: 'science terms', listType: 'words' });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.words)).toBe(true);
    });
});

// =============================================================================
// GET /config/sections
// =============================================================================

describe('GET /config/sections', () => {
    it('returns SECTION_METADATA', async () => {
        const res = await request(buildApp()).get('/config/sections');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('test-section');
        expect(res.body['test-section'].title).toBe('Test Section');
    });
});

// =============================================================================
// GET /config/defaults/:sectionId
// =============================================================================

describe('GET /config/defaults/:sectionId', () => {
    it('returns 404 for unknown section', async () => {
        const res = await request(buildApp()).get('/config/defaults/nonexistent');
        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Unknown section');
    });

    it('returns defaults for known section', async () => {
        const res = await request(buildApp()).get('/config/defaults/test-section');
        expect(res.status).toBe(200);
        expect(res.body.sectionId).toBe('test-section');
        expect(Array.isArray(res.body.defaults)).toBe(true);
        expect(res.body.defaults[0].value).toBe(0.5);
    });
});

// =============================================================================
// GET /config/history
// =============================================================================

describe('GET /config/history', () => {
    it('delegates to handleConfig with history action', async () => {
        mockHandleConfig.mockResolvedValue([{ id: 'h-1', changed_at: '2024-01-01' }]);
        const res = await request(buildApp()).get('/config/history?days=14&limit=50');
        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(expect.objectContaining({
            action: 'history',
            days: 14,
            limit: 50,
        }));
    });
});

// =============================================================================
// GET /config/snapshots
// =============================================================================

describe('GET /config/snapshots', () => {
    it('lists snapshots via handleConfig', async () => {
        mockHandleConfig.mockResolvedValue({ snapshots: [] });
        const res = await request(buildApp()).get('/config/snapshots');
        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(expect.objectContaining({
            action: 'snapshot',
            snapshotAction: 'list',
        }));
    });
});

// =============================================================================
// POST /config/snapshots
// =============================================================================

describe('POST /config/snapshots', () => {
    it('saves snapshot via handleConfig', async () => {
        mockHandleConfig.mockResolvedValue({ id: 'snap-1' });
        const res = await request(buildApp())
            .post('/config/snapshots')
            .send({ label: 'pre-experiment' });
        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(expect.objectContaining({
            action: 'snapshot',
            snapshotAction: 'save',
            snapshotLabel: 'pre-experiment',
        }));
    });
});

// =============================================================================
// POST /config/snapshots/:id/restore
// =============================================================================

describe('POST /config/snapshots/:id/restore', () => {
    it('restores snapshot via handleConfig', async () => {
        mockHandleConfig.mockResolvedValue({ restored: true });
        const res = await request(buildApp())
            .post('/config/snapshots/snap-1/restore')
            .send({});
        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(expect.objectContaining({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-1',
        }));
    });
});

// =============================================================================
// GET /config/metrics
// =============================================================================

describe('GET /config/metrics', () => {
    it('returns metrics via handleConfig', async () => {
        mockHandleConfig.mockResolvedValue({ successRate: 0.12, overfitting: false });
        const res = await request(buildApp()).get('/config/metrics?days=30');
        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(expect.objectContaining({
            action: 'metrics',
            days: 30,
        }));
    });
});

// =============================================================================
// GET /config/dedup-gates
// =============================================================================

describe('GET /config/dedup-gates', () => {
    it('returns dedup gate overrides', async () => {
        mockDbQuery.mockResolvedValue([
            { source: 'claude', embedding_threshold: 0.85, word_overlap_threshold: 0.7 },
        ]);
        const res = await request(buildApp()).get('/config/dedup-gates');
        expect(res.status).toBe(200);
        expect(res.body.gates).toHaveLength(1);
        expect(res.body.gates[0].source).toBe('claude');
    });
});

// =============================================================================
// PUT /config/dedup-gates/:source
// =============================================================================

describe('PUT /config/dedup-gates/:source', () => {
    it('upserts gate override and invalidates cache', async () => {
        const res = await request(buildApp())
            .put('/config/dedup-gates/claude')
            .send({ embedding_threshold: 0.9, word_overlap_threshold: 0.8 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.source).toBe('claude');
        expect(mockInvalidateGateOverrideCache).toHaveBeenCalled();
        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dedup_gate_overrides'),
            expect.any(Array)
        );
    });
});

// =============================================================================
// DELETE /config/dedup-gates/:source
// =============================================================================

describe('DELETE /config/dedup-gates/:source', () => {
    it('deletes gate override and invalidates cache', async () => {
        const res = await request(buildApp()).delete('/config/dedup-gates/claude');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.source).toBe('claude');
        expect(mockInvalidateGateOverrideCache).toHaveBeenCalled();
    });
});
