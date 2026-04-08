/**
 * Unit tests for routes/config-tune.ts —
 * POST /config/tune, GET /config/sections, GET /config/defaults/:sectionId,
 * POST /config/tune/generate-patterns, POST /config/tune/generate-intent-patterns,
 * POST /config/tune/generate-words, GET /config/history, GET /config/snapshots,
 * POST /config/snapshots, POST /config/snapshots/:id/restore, GET /config/metrics,
 * GET/PUT/DELETE /config/dedup-gates
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('built prompt');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockGetSafeConfig = jest.fn().mockReturnValue({
    tensions: { patterns: [['stability', 'innovation']] },
    contextEngine: { intentPatterns: { retrieval: ['find.*'] } },
});

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

const mockSectionMetadata: Record<string, any> = {
    test_section: {
        title: 'Test Section',
        description: 'A test section',
        behavior: 'Testing behavior',
        parameters: [
            {
                key: 'testParam',
                label: 'Test Parameter',
                description: 'A test parameter',
                configPath: ['test', 'param'],
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.5,
            },
            {
                key: 'anotherParam',
                label: 'Another Parameter',
                description: 'Another test parameter',
                configPath: ['test', 'another'],
                min: 0,
                max: 100,
                step: 1,
                default: 50,
            },
        ],
    },
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: mockSectionMetadata,
}));

jest.unstable_mockModule('../../config/defaults.js', () => ({
    config: { test: { param: 0.5, another: 50 } },
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockDbQuery,
}));

const mockInvalidateGateOverrideCache = jest.fn();

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    invalidateGateOverrideCache: mockInvalidateGateOverrideCache,
}));

const mockHandleConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

const configTuneRouter = (await import('../../routes/config-tune.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(configTuneRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockDbQuery.mockResolvedValue([]);
    mockHandleConfig.mockResolvedValue({ ok: true });
    mockGetSafeConfig.mockReturnValue({
        tensions: { patterns: [['stability', 'innovation']] },
        contextEngine: { intentPatterns: { retrieval: ['find.*'] } },
    });
});

// =============================================================================
// POST /config/tune
// =============================================================================

describe('POST /config/tune', () => {
    it('returns 400 when sectionId missing', async () => {
        const res = await request(app)
            .post('/config/tune')
            .send({ request: 'tune this' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when request missing', async () => {
        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section' });

        expect(res.status).toBe(400);
    });

    it('returns 400 for unknown section', async () => {
        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'nonexistent', request: 'tune' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unknown section');
    });

    it('returns suggestions from LLM for valid section', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'testParam', currentValue: 0.5, suggestedValue: 0.7, explanation: 'Better value' },
            ],
            summary: 'Test summary',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune for quality' });

        expect(res.status).toBe(200);
        expect(res.body.sectionId).toBe('test_section');
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.summary).toBe('Test summary');
    });

    it('clamps suggested values to parameter range', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'testParam', currentValue: 0.5, suggestedValue: 1.5, explanation: 'Over max' },
            ],
            summary: 'Clamped',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].suggestedValue).toBeLessThanOrEqual(1);
    });

    it('filters out unknown keys', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'unknownKey', currentValue: 0, suggestedValue: 1, explanation: 'Bad key' },
                { key: 'testParam', currentValue: 0.5, suggestedValue: 0.8, explanation: 'Good key' },
            ],
            summary: 'Filtered',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions.length).toBe(1);
        expect(res.body.suggestions[0].key).toBe('testParam');
    });

    it('returns 502 when LLM response is not parseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('not valid json at all');

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(502);
    });

    it('extracts JSON from response text with surrounding prose', async () => {
        const jsonPart = JSON.stringify({ suggestions: [], summary: 'Extracted' });
        mockCallSubsystemModel.mockResolvedValue('Here is my analysis: ' + jsonPart + ' end.');

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('Extracted');
    });

    it('resolves fuzzy key matches via label', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'Test Parameter', currentValue: 0.5, suggestedValue: 0.6, explanation: 'Via label' },
            ],
            summary: 'Fuzzy',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].key).toBe('testParam');
    });
});

// =============================================================================
// POST /config/tune/generate-patterns
// =============================================================================

describe('POST /config/tune/generate-patterns', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns generated tension pairs', async () => {
        const llmResponse = JSON.stringify({
            pairs: [['order', 'chaos'], ['local', 'global']],
            summary: 'New tensions',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate science tensions' });

        expect(res.status).toBe(200);
        expect(res.body.pairs).toBeDefined();
        expect(res.body.existingCount).toBe(1);
    });

    it('deduplicates against existing pairs', async () => {
        const llmResponse = JSON.stringify({
            pairs: [['stability', 'innovation'], ['new', 'old']],
            summary: 'Deduped',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate tensions' });

        expect(res.status).toBe(200);
        // 'stability'/'innovation' should be filtered as existing
        const pairStrs = res.body.pairs.map((p: string[]) => p.join('|'));
        expect(pairStrs).not.toContain('stability|innovation');
    });
});

// =============================================================================
// POST /config/tune/generate-intent-patterns
// =============================================================================

describe('POST /config/tune/generate-intent-patterns', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid intentType', async () => {
        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate', intentType: 'invalid' });

        expect(res.status).toBe(400);
    });

    it('returns validated intent patterns', async () => {
        const llmResponse = JSON.stringify({
            patterns: {
                retrieval: ['search.*term'],
                action: ['do.*thing'],
            },
            summary: 'New patterns',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate retrieval patterns' });

        expect(res.status).toBe(200);
        expect(res.body.patterns).toBeDefined();
        expect(res.body.existingCounts).toBeDefined();
    });
});

// =============================================================================
// POST /config/tune/generate-words
// =============================================================================

describe('POST /config/tune/generate-words', () => {
    it('returns 400 when request is missing', async () => {
        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid listType', async () => {
        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'invalid' });

        expect(res.status).toBe(400);
    });

    it('returns generated words for valid request', async () => {
        const llmResponse = JSON.stringify({
            words: ['alpha', 'beta', 'gamma'],
            summary: 'New words',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate science words', listType: 'words' });

        expect(res.status).toBe(200);
        expect(res.body.words).toBeDefined();
    });

    it('deduplicates words against existing', async () => {
        const llmResponse = JSON.stringify({
            words: ['existing', 'newword'],
            summary: 'Deduped',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'words', existing: ['existing'] });

        expect(res.status).toBe(200);
        if (res.body.words) {
            expect(res.body.words).not.toContain('existing');
        }
    });

    it('handles mappings listType', async () => {
        const llmResponse = JSON.stringify({
            mappings: { hello: 'world', test: 'value' },
            summary: 'Mappings',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate mappings', listType: 'mappings', existing: { hello: 'world' } });

        expect(res.status).toBe(200);
        expect(res.body.mappings).toBeDefined();
    });
});

// =============================================================================
// GET /config/sections
// =============================================================================

// =============================================================================
// POST /config/critical-analysis
// =============================================================================

describe('POST /config/critical-analysis', () => {
    it('returns parsed analysis from LLM', async () => {
        const llmResponse = JSON.stringify({
            overallHealth: 'warning',
            estimatedWastePercent: 25,
            issues: [
                {
                    severity: 'warning',
                    title: 'High similarity ceiling',
                    detail: 'Allows near-duplicate synthesis',
                    estimatedImpact: '~15% wasted cycles',
                    currentSettings: { similarityCeiling: 0.95 },
                    recommendedSettings: { similarityCeiling: 0.85 },
                },
                {
                    severity: 'critical',
                    title: 'Low dedup threshold',
                    detail: 'Duplicates slip through',
                    estimatedImpact: '~10% duplicate nodes',
                },
            ],
            summary: 'Config needs tuning',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.overallHealth).toBe('warning');
        expect(res.body.estimatedWastePercent).toBe(25);
        expect(res.body.issues).toHaveLength(2);
        expect(res.body.summary).toBe('Config needs tuning');
    });

    it('sorts issues by severity (critical first)', async () => {
        const llmResponse = JSON.stringify({
            overallHealth: 'critical',
            estimatedWastePercent: 40,
            issues: [
                { severity: 'info', title: 'Minor note', detail: 'Low priority', estimatedImpact: 'minimal' },
                { severity: 'critical', title: 'Major issue', detail: 'High priority', estimatedImpact: 'severe' },
                { severity: 'warning', title: 'Medium concern', detail: 'Mid priority', estimatedImpact: 'moderate' },
            ],
            summary: 'Multiple issues',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.issues[0].severity).toBe('critical');
        expect(res.body.issues[1].severity).toBe('warning');
        expect(res.body.issues[2].severity).toBe('info');
    });

    it('returns 502 when LLM response is not parseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('completely unparseable garbage');

        const res = await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(res.status).toBe(502);
        expect(res.body.error).toContain('parse');
    });

    it('extracts JSON from response with surrounding prose', async () => {
        const json = JSON.stringify({
            overallHealth: 'good',
            estimatedWastePercent: 5,
            issues: [],
            summary: 'All good',
        });
        mockCallSubsystemModel.mockResolvedValue('Here is my analysis: ' + json + ' end of analysis.');

        const res = await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.overallHealth).toBe('good');
        expect(res.body.summary).toBe('All good');
    });

    it('returns good health when no issues found', async () => {
        const llmResponse = JSON.stringify({
            overallHealth: 'good',
            estimatedWastePercent: 2,
            issues: [],
            summary: 'Config is well tuned',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.overallHealth).toBe('good');
        expect(res.body.issues).toHaveLength(0);
    });

    it('calls getPrompt with config.critical_analysis', async () => {
        const llmResponse = JSON.stringify({
            overallHealth: 'good',
            estimatedWastePercent: 0,
            issues: [],
            summary: 'Fine',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/critical-analysis')
            .send({});

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.critical_analysis',
            expect.objectContaining({
                configJson: expect.any(String),
                statsJson: expect.any(String),
                sectionsSummary: expect.any(String),
            })
        );
    });
});

// =============================================================================
// GET /config/sections
// =============================================================================

describe('GET /config/sections', () => {
    it('returns section metadata', async () => {
        const res = await request(app).get('/config/sections');

        expect(res.status).toBe(200);
        expect(res.body.test_section).toBeDefined();
        expect(res.body.test_section.title).toBe('Test Section');
    });
});

// =============================================================================
// GET /config/defaults/:sectionId
// =============================================================================

describe('GET /config/defaults/:sectionId', () => {
    it('returns 404 for unknown section', async () => {
        const res = await request(app).get('/config/defaults/nonexistent');

        expect(res.status).toBe(404);
    });

    it('returns defaults for a known section', async () => {
        const res = await request(app).get('/config/defaults/test_section');

        expect(res.status).toBe(200);
        expect(res.body.sectionId).toBe('test_section');
        expect(res.body.defaults).toBeDefined();
        expect(res.body.defaults.length).toBe(2);
    });
});

// =============================================================================
// GET /config/history
// =============================================================================

describe('GET /config/history', () => {
    it('delegates to handleConfig with history action', async () => {
        mockHandleConfig.mockResolvedValue({ changes: [] });

        const res = await request(app).get('/config/history?days=14&limit=10');

        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'history', days: 14, limit: 10 })
        );
    });
});

// =============================================================================
// GET /config/snapshots
// =============================================================================

describe('GET /config/snapshots', () => {
    it('delegates to handleConfig with snapshot list action', async () => {
        mockHandleConfig.mockResolvedValue({ snapshots: [] });

        const res = await request(app).get('/config/snapshots');

        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'snapshot', snapshotAction: 'list' })
        );
    });
});

// =============================================================================
// POST /config/snapshots
// =============================================================================

describe('POST /config/snapshots', () => {
    it('delegates to handleConfig with snapshot save action', async () => {
        mockHandleConfig.mockResolvedValue({ snapshotId: 'snap-123' });

        const res = await request(app)
            .post('/config/snapshots')
            .send({ label: 'test snapshot' });

        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'snapshot', snapshotAction: 'save', snapshotLabel: 'test snapshot' })
        );
    });
});

// =============================================================================
// POST /config/snapshots/:id/restore
// =============================================================================

describe('POST /config/snapshots/:id/restore', () => {
    it('delegates to handleConfig with snapshot restore action', async () => {
        mockHandleConfig.mockResolvedValue({ restored: true });

        const res = await request(app)
            .post('/config/snapshots/snap-123/restore')
            .send({});

        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'snapshot', snapshotAction: 'restore', snapshotId: 'snap-123' })
        );
    });
});

// =============================================================================
// GET /config/metrics
// =============================================================================

describe('GET /config/metrics', () => {
    it('delegates to handleConfig with metrics action', async () => {
        mockHandleConfig.mockResolvedValue({ metrics: {} });

        const res = await request(app).get('/config/metrics?days=30');

        expect(res.status).toBe(200);
        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'metrics', days: 30 })
        );
    });
});

// =============================================================================
// DEDUP GATE OVERRIDES
// =============================================================================

describe('GET /config/dedup-gates', () => {
    it('returns dedup gate overrides', async () => {
        mockDbQuery.mockResolvedValue([{ source: 'test', embedding_threshold: 0.9 }]);

        const res = await request(app).get('/config/dedup-gates');

        expect(res.status).toBe(200);
        expect(res.body.gates).toBeDefined();
    });
});

describe('PUT /config/dedup-gates/:source', () => {
    it('upserts a gate override', async () => {
        const res = await request(app)
            .put('/config/dedup-gates/my-source')
            .send({ embedding_threshold: 0.95 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.source).toBe('my-source');
        expect(mockInvalidateGateOverrideCache).toHaveBeenCalled();
    });
});

describe('DELETE /config/dedup-gates/:source', () => {
    it('deletes a gate override', async () => {
        const res = await request(app).delete('/config/dedup-gates/my-source');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockInvalidateGateOverrideCache).toHaveBeenCalled();
    });
});
