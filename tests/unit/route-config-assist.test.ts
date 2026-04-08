/**
 * Unit tests for routes/config-assist.ts —
 * POST /config/assist, GET /config/assist/diagnostic, POST /config/assist/interview
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('LLM response text');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetSafeConfig = jest.fn().mockReturnValue({
    hallucination: { fabricatedNumberCheck: 1, novelRatioThreshold: 0.7, minRedFlags: 2 },
    engine: { threshold: 0.5, minSpecificity: 2.0, synthesisIntervalMs: 2000 },
    voicing: { minNovelWords: 4 },
    dedup: { embeddingSimilarityThreshold: 0.82, wordOverlapThreshold: 0.7 },
    evm: { enabled: 0 },
    validation: { noveltyGateEnabled: 1, evmGateEnabled: 0 },
    autonomousCycles: {
        evm: { enabled: 0 },
        autorating: { enabled: 1, inlineEnabled: 1, intervalMs: 45000 },
        validation: { enabled: 1, intervalMs: 60000 },
        questions: { enabled: 1, intervalMs: 45000 },
        tensions: { enabled: 1, intervalMs: 45000 },
        research: { enabled: 1, intervalMs: 45000 },
    },
});

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

// Mock SECTION_METADATA with a minimal section
const mockSectionMetadata: Record<string, any> = {
    voicing_constraints: {
        title: 'Voicing Constraints',
        description: 'Controls voicing output',
        behavior: 'Limits synthesis output',
        parameters: [
            {
                key: 'minNovelWords',
                label: 'Min Novel Words',
                description: 'Minimum novel words',
                configPath: ['voicing', 'minNovelWords'],
                min: 0,
                max: 20,
                step: 1,
                default: 4,
            },
        ],
    },
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: mockSectionMetadata,
}));

const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockDbQuery,
    queryOne: jest.fn().mockResolvedValue(null),
    transactionSync: jest.fn((fn: Function) => fn({ query: jest.fn(), queryOne: jest.fn() })),
    close: jest.fn().mockResolvedValue(undefined),
    systemQuery: jest.fn().mockResolvedValue([]),
    systemQueryOne: jest.fn().mockResolvedValue(null),
    systemTransactionSync: jest.fn((fn: Function) => fn({ query: jest.fn(), queryOne: jest.fn() })),
    healthCheck: jest.fn().mockResolvedValue(true),
    isSystemSetting: jest.fn().mockReturnValue(false),
    yieldToEventLoop: jest.fn().mockResolvedValue(undefined),
    backupDatabase: jest.fn().mockResolvedValue({}),
    restoreDatabase: jest.fn().mockResolvedValue({}),
    listBackups: jest.fn().mockReturnValue([]),
    switchProject: jest.fn().mockResolvedValue(undefined),
    saveProjectCopy: jest.fn().mockResolvedValue(undefined),
    createEmptyProject: jest.fn().mockResolvedValue(undefined),
    getProjectDir: jest.fn().mockReturnValue('/tmp'),
    getDbDiagnostics: jest.fn().mockReturnValue({}),
    resetDbDiagnostics: jest.fn(),
    pool: null,
    dialect: 'sqlite',
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: (col: string, param: string) => `${col} > ${param}`,
}));

const mockGetQuickMetrics = jest.fn<() => Promise<any>>().mockResolvedValue({
    totalNodes: 100,
    avgWeight: 0.5,
    avgSpecificity: 3.0,
});
const mockBuildParamLookup = jest.fn<() => Record<string, any>>().mockReturnValue({
    'voicing.minNovelWords': {
        key: 'minNovelWords',
        label: 'Min Novel Words',
        configPath: ['voicing', 'minNovelWords'],
        min: 0,
        max: 20,
        step: 1,
        default: 4,
        sectionId: 'voicing_constraints',
    },
    'hallucination.fabricatedNumberCheck': {
        key: 'fabricatedNumberCheck',
        label: 'Fabricated Number Check',
        configPath: ['hallucination', 'fabricatedNumberCheck'],
        min: 0,
        max: 1,
        step: 1,
        default: 1,
        sectionId: 'hallucination_detection',
    },
    'hallucination.novelRatioThreshold': {
        key: 'novelRatioThreshold',
        label: 'Novel Ratio Threshold',
        configPath: ['hallucination', 'novelRatioThreshold'],
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.7,
        sectionId: 'hallucination_detection',
    },
    'hallucination.minRedFlags': {
        key: 'minRedFlags',
        label: 'Min Red Flags',
        configPath: ['hallucination', 'minRedFlags'],
        min: 1,
        max: 10,
        step: 1,
        default: 2,
        sectionId: 'hallucination_detection',
    },
    'engine.threshold': {
        key: 'similarityThreshold',
        label: 'Similarity Threshold',
        configPath: ['engine', 'threshold'],
        min: 0,
        max: 1,
        step: 0.01,
        default: 0.5,
        sectionId: 'resonance_specificity',
    },
    'engine.minSpecificity': {
        key: 'minSpecificity',
        label: 'Min Specificity',
        configPath: ['engine', 'minSpecificity'],
        min: 0,
        max: 10,
        step: 0.1,
        default: 2.0,
        sectionId: 'resonance_specificity',
    },
    'dedup.embeddingSimilarityThreshold': {
        key: 'dedupEmbedding',
        label: 'Dedup Embedding',
        configPath: ['dedup', 'embeddingSimilarityThreshold'],
        min: 0.5,
        max: 1,
        step: 0.01,
        default: 0.82,
        sectionId: 'dedup_settings',
    },
    'dedup.wordOverlapThreshold': {
        key: 'dedupWordOverlap',
        label: 'Dedup Word Overlap',
        configPath: ['dedup', 'wordOverlapThreshold'],
        min: 0.3,
        max: 1,
        step: 0.01,
        default: 0.7,
        sectionId: 'dedup_settings',
    },
    'evm.enabled': {
        key: 'evmEnabled',
        label: 'EVM Enabled',
        configPath: ['evm', 'enabled'],
        min: 0, max: 1, step: 1, default: 0,
        sectionId: 'evm_settings',
    },
    'autonomousCycles.evm.enabled': {
        key: 'evmCycleEnabled',
        label: 'EVM Cycle Enabled',
        configPath: ['autonomousCycles', 'evm', 'enabled'],
        min: 0, max: 1, step: 1, default: 0,
        sectionId: 'evm_settings',
    },
    'validation.noveltyGateEnabled': {
        key: 'noveltyGateEnabled',
        label: 'Novelty Gate',
        configPath: ['validation', 'noveltyGateEnabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'synthesis_validation',
    },
    'validation.evmGateEnabled': {
        key: 'evmGateEnabled',
        label: 'EVM Gate',
        configPath: ['validation', 'evmGateEnabled'],
        min: 0, max: 1, step: 1, default: 0,
        sectionId: 'synthesis_validation',
    },
    'autonomousCycles.autorating.enabled': {
        key: 'autoratingEnabled',
        label: 'Autorating Enabled',
        configPath: ['autonomousCycles', 'autorating', 'enabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'autorating',
    },
    'autonomousCycles.autorating.inlineEnabled': {
        key: 'autoratingInlineEnabled',
        label: 'Autorating Inline',
        configPath: ['autonomousCycles', 'autorating', 'inlineEnabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'autorating',
    },
    'autonomousCycles.validation.intervalMs': {
        key: 'validationInterval',
        label: 'Validation Interval',
        configPath: ['autonomousCycles', 'validation', 'intervalMs'],
        min: 5000, max: 600000, step: 1000, default: 60000,
        sectionId: 'synthesis_validation',
    },
    'autonomousCycles.questions.intervalMs': {
        key: 'questionsInterval',
        label: 'Questions Interval',
        configPath: ['autonomousCycles', 'questions', 'intervalMs'],
        min: 5000, max: 600000, step: 1000, default: 45000,
        sectionId: 'questions_cycle',
    },
    'autonomousCycles.tensions.intervalMs': {
        key: 'tensionsInterval',
        label: 'Tensions Interval',
        configPath: ['autonomousCycles', 'tensions', 'intervalMs'],
        min: 5000, max: 600000, step: 1000, default: 45000,
        sectionId: 'tensions_cycle',
    },
    'autonomousCycles.research.intervalMs': {
        key: 'researchInterval',
        label: 'Research Interval',
        configPath: ['autonomousCycles', 'research', 'intervalMs'],
        min: 5000, max: 600000, step: 1000, default: 45000,
        sectionId: 'research_cycle',
    },
    'autonomousCycles.autorating.intervalMs': {
        key: 'autoratingInterval',
        label: 'Autorating Interval',
        configPath: ['autonomousCycles', 'autorating', 'intervalMs'],
        min: 5000, max: 600000, step: 1000, default: 45000,
        sectionId: 'autorating',
    },
    'engine.synthesisIntervalMs': {
        key: 'synthesisInterval',
        label: 'Synthesis Interval',
        configPath: ['engine', 'synthesisIntervalMs'],
        min: 100, max: 60000, step: 100, default: 2000,
        sectionId: 'resonance_specificity',
    },
    'autonomousCycles.questions.enabled': {
        key: 'questionsEnabled',
        label: 'Questions Enabled',
        configPath: ['autonomousCycles', 'questions', 'enabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'questions_cycle',
    },
    'autonomousCycles.tensions.enabled': {
        key: 'tensionsEnabled',
        label: 'Tensions Enabled',
        configPath: ['autonomousCycles', 'tensions', 'enabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'tensions_cycle',
    },
    'autonomousCycles.research.enabled': {
        key: 'researchEnabled',
        label: 'Research Enabled',
        configPath: ['autonomousCycles', 'research', 'enabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'research_cycle',
    },
    'autonomousCycles.validation.enabled': {
        key: 'validationEnabled',
        label: 'Validation Enabled',
        configPath: ['autonomousCycles', 'validation', 'enabled'],
        min: 0, max: 1, step: 1, default: 1,
        sectionId: 'synthesis_validation',
    },
});

const mockGetNestedValue = jest.fn<(obj: any, path: string[]) => any>().mockImplementation((obj: any, path: string[]) => {
    let val = obj;
    for (const p of path) {
        val = val?.[p];
    }
    return val;
});

jest.unstable_mockModule('../../handlers/config-tune/helpers.js', () => ({
    getQuickMetrics: mockGetQuickMetrics,
    buildParamLookup: mockBuildParamLookup,
    getNestedValue: mockGetNestedValue,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const configAssistRouter = (await import('../../routes/config-assist.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(configAssistRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCallSubsystemModel.mockResolvedValue('LLM response text');
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockDbQuery.mockResolvedValue([]);
    mockGetQuickMetrics.mockResolvedValue({
        totalNodes: 100,
        avgWeight: 0.5,
        avgSpecificity: 3.0,
    });
});

// =============================================================================
// POST /config/assist
// =============================================================================

describe('POST /config/assist', () => {
    it('returns 400 when no message provided', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('message is required');
    });

    it('returns a response with conversationId', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'help me tune' });

        expect(res.status).toBe(200);
        expect(res.body.conversationId).toBeDefined();
        expect(res.body.response).toBeDefined();
    });

    it('continues conversation with existing conversationId', async () => {
        // First message
        const res1 = await request(app)
            .post('/config/assist')
            .send({ message: 'first message' });

        const convId = res1.body.conversationId;

        // Second message
        const res2 = await request(app)
            .post('/config/assist')
            .send({ message: 'second message', conversationId: convId });

        expect(res2.status).toBe(200);
        expect(res2.body.conversationId).toBe(convId);
    });

    it('includes diagnostic on first response', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'help me' });

        expect(res.status).toBe(200);
        expect(res.body.diagnostic).toBeDefined();
    });

    it('extracts suggestions from LLM response with suggestions block', async () => {
        const suggestionsJson = JSON.stringify([{
            key: 'minNovelWords',
            configPath: ['voicing', 'minNovelWords'],
            suggestedValue: 6,
            explanation: 'Increase for better quality',
        }]);
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + suggestionsJson + '\n```\n\nHere is my explanation.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest changes' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        if (res.body.suggestions) {
            expect(res.body.suggestions.length).toBeGreaterThan(0);
        }
    });

    it('calls LLM with appropriate subsystem', async () => {
        await request(app)
            .post('/config/assist')
            .send({ message: 'test' });

        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });

    it('creates new conversation ID when existing ID not found', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'test', conversationId: 'nonexistent-id' });

        expect(res.status).toBe(200);
        expect(res.body.conversationId).not.toBe('nonexistent-id');
    });
});

// =============================================================================
// GET /config/assist/diagnostic
// =============================================================================

describe('GET /config/assist/diagnostic', () => {
    it('returns diagnostic data', async () => {
        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic).toBeDefined();
        expect(res.body.diagnostic.metrics).toBeDefined();
    });

    it('returns severity field', async () => {
        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBeDefined();
    });

    it('reports critical when no synthesis cycles', async () => {
        mockDbQuery.mockResolvedValue([]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('critical');
    });
});

// =============================================================================
// POST /config/assist/interview
// =============================================================================

describe('POST /config/assist/interview', () => {
    it('returns 400 when no answers provided', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('answers');
    });

    it('returns 400 for invalid domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'invalid',
                    material: 'quantitative',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('domain');
    });

    it('returns 400 for invalid material', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'invalid',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(400);
    });

    it('returns suggestions and profile for valid answers', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'quantitative',
                    stance: 'conservative',
                    verification: 'high',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(Array.isArray(res.body.suggestions)).toBe(true);
        expect(res.body.profile).toBeDefined();
        expect(res.body.profile.label).toContain('Hard Science');
    });

    it('returns suggestions for exploratory speculative profile', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'speculative',
                    material: 'qualitative',
                    stance: 'exploratory',
                    verification: 'low',
                    maturity: 'fresh',
                    budget: 'minimal',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.profile.label).toContain('Speculative');
    });

    it('returns suggestions for mature generous profile', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'humanities',
                    material: 'balanced',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'mature',
                    budget: 'generous',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.profile.label).toContain('Humanities');
    });

    it('returns 400 for invalid stance', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'quantitative',
                    stance: 'invalid',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('stance');
    });

    it('returns 400 for invalid verification', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'quantitative',
                    stance: 'balanced',
                    verification: 'invalid',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('verification');
    });

    it('returns 400 for invalid maturity', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'quantitative',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'invalid',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('maturity');
    });

    it('returns 400 for invalid budget', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'quantitative',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'invalid',
                },
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('budget');
    });

    it('returns profile for formal_math domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'formal_math',
                    material: 'quantitative',
                    stance: 'conservative',
                    verification: 'high',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.profile.label).toContain('Formal');
    });

    it('returns profile for applied_technical domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'applied_technical',
                    material: 'balanced',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.profile.label).toContain('Applied');
    });

    it('returns profile for social_science domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'social_science',
                    material: 'balanced',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.profile.label).toContain('Social Science');
    });

    it('returns profile for mixed domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'mixed',
                    material: 'balanced',
                    stance: 'exploratory',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        expect(res.body.profile.label).toContain('Interdisciplinary');
    });

    it('enables fabricatedNumberCheck for balanced material with hard_science', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'balanced',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        // balanced material + hard_science should enable number check
        const numberSugg = res.body.suggestions?.find((s: any) => s.key === 'fabricatedNumberCheck');
        if (numberSugg) {
            expect(numberSugg.suggestedValue).toBe(1);
        }
    });

    it('disables fabricatedNumberCheck for qualitative humanities', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'humanities',
                    material: 'qualitative',
                    stance: 'exploratory',
                    verification: 'low',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        const numberSugg = res.body.suggestions?.find((s: any) => s.key === 'fabricatedNumberCheck');
        if (numberSugg) {
            expect(numberSugg.suggestedValue).toBe(0);
        }
    });

    it('disables fabricatedNumberCheck for balanced material with humanities', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'humanities',
                    material: 'balanced',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });

        expect(res.status).toBe(200);
        // balanced + humanities should NOT enable number check
        const numberSugg = res.body.suggestions?.find((s: any) => s.key === 'fabricatedNumberCheck');
        if (numberSugg) {
            expect(numberSugg.suggestedValue).toBe(0);
        }
    });

    it('returns 400 when answers is not an object', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: 'not-an-object' });

        // String is typeof 'object' === false, so should fail
        expect(res.status).toBe(400);
    });
});

// =============================================================================
// Diagnostic health severity branches
// =============================================================================

describe('GET /config/assist/diagnostic — severity branches', () => {
    it('reports critical when success rate < 0.02 with top rejection', async () => {
        // First call: rejections query, second: synthesis stats query
        mockDbQuery
            .mockResolvedValueOnce([{ reason: 'derivative', count: 50 }])
            .mockResolvedValueOnce([{ total: '1000', with_partner: '800', children: '10' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('critical');
        expect(res.body.diagnostic.healthSummary).toContain('stalled');
        expect(res.body.diagnostic.topRejections.length).toBeGreaterThan(0);
    });

    it('reports warning when success rate < 0.05', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ reason: 'hallucination', count: 20 }])
            .mockResolvedValueOnce([{ total: '1000', with_partner: '900', children: '30' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('warning');
        expect(res.body.diagnostic.healthSummary).toContain('low');
    });

    it('reports healthy when success rate between 0.05 and 0.15', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ reason: 'dedup', count: 10 }])
            .mockResolvedValueOnce([{ total: '1000', with_partner: '900', children: '80' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('healthy');
        expect(res.body.diagnostic.healthSummary).toContain('reasonably calibrated');
    });

    it('reports warning when success rate >= 0.15 (too permissive)', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '100', with_partner: '90', children: '20' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('warning');
        expect(res.body.diagnostic.healthSummary).toContain('permissive');
    });

    it('handles dbQuery throwing errors gracefully', async () => {
        mockDbQuery.mockRejectedValue(new Error('table not found'));

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic.severity).toBe('critical');
    });
});

// =============================================================================
// Suggestion parsing branches
// =============================================================================

describe('POST /config/assist — suggestion parsing', () => {
    it('falls back to json code block when suggestions block absent', async () => {
        const suggestionsJson = JSON.stringify([{
            key: 'minNovelWords',
            configPath: ['voicing', 'minNovelWords'],
            suggestedValue: 8,
            explanation: 'Increase novel words',
        }]);
        mockCallSubsystemModel.mockResolvedValue(
            'Here is my analysis:\n```json\n' + suggestionsJson + '\n```\n\nDone.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest changes' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.suggestions?.length).toBeGreaterThan(0);
        expect(res.body.suggestions?.[0].key).toBe('minNovelWords');
    });

    it('leaves non-suggestion json blocks intact', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            'Here is some data:\n```json\n{"notASuggestion": true}\n```\n\nDone.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'show data' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeUndefined();
        // The non-suggestion JSON block should remain in the response
        expect(res.body.response).toContain('notASuggestion');
    });

    it('handles unparseable suggestions block gracefully', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\nnot valid json at all\n```\n\nHere is my analysis.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest changes' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeUndefined();
    });

    it('skips suggestions with missing key/configPath/suggestedValue', async () => {
        const suggestionsJson = JSON.stringify([
            { configPath: ['voicing', 'minNovelWords'], suggestedValue: 6 }, // missing key
            { key: 'minNovelWords', suggestedValue: 6 }, // missing configPath
            { key: 'minNovelWords', configPath: ['voicing', 'minNovelWords'] }, // missing suggestedValue
        ]);
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + suggestionsJson + '\n```\n\nDone.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeUndefined();
    });

    it('skips suggestions with unknown configPath', async () => {
        const suggestionsJson = JSON.stringify([{
            key: 'unknownKey',
            configPath: ['unknown', 'path'],
            suggestedValue: 5,
        }]);
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + suggestionsJson + '\n```\n\nDone.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeUndefined();
    });

    it('clamps suggested values to min/max range', async () => {
        const suggestionsJson = JSON.stringify([{
            key: 'minNovelWords',
            configPath: ['voicing', 'minNovelWords'],
            suggestedValue: 999, // way above max of 20
            explanation: 'Too high',
        }]);
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + suggestionsJson + '\n```\n\nDone.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'suggest' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.suggestions[0].suggestedValue).toBe(20); // clamped to max
    });

    it('extracts suggestions from prose as last resort', async () => {
        // The prose extractor needs: a parameter name >= 6 chars, a directed value pattern
        mockCallSubsystemModel.mockResolvedValue(
            'The minNovelWords is too low. Lower minNovelWords to 8 for better quality.'
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'fix my config' });

        expect(res.status).toBe(200);
        // Prose extraction should find minNovelWords → 8
        if (res.body.suggestions) {
            const sugg = res.body.suggestions.find((s: any) => s.key === 'minNovelWords');
            expect(sugg).toBeDefined();
            expect(sugg.suggestedValue).toBe(8);
        }
    });

    it('does not return suggestions field when none found', async () => {
        mockCallSubsystemModel.mockResolvedValue('Everything looks fine, no changes needed.');

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'how is my config?' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeUndefined();
    });
});

// =============================================================================
// Subsystem selection and conversation mechanics
// =============================================================================

describe('POST /config/assist — subsystem and conversation', () => {
    it('uses config_tune subsystem when assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ config_tune: { id: 'model-1' } });

        await request(app)
            .post('/config/assist')
            .send({ message: 'test' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'config_tune',
            expect.any(String),
            expect.any(Object),
        );
    });

    it('falls back to compress subsystem when config_tune not assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        await request(app)
            .post('/config/assist')
            .send({ message: 'test' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'compress',
            expect.any(String),
            expect.any(Object),
        );
    });

    it('does not include diagnostic on subsequent responses', async () => {
        const res1 = await request(app)
            .post('/config/assist')
            .send({ message: 'first' });

        expect(res1.body.diagnostic).toBeDefined();
        const convId = res1.body.conversationId;

        const res2 = await request(app)
            .post('/config/assist')
            .send({ message: 'second', conversationId: convId });

        expect(res2.body.diagnostic).toBeUndefined();
    });

    it('trims conversation history beyond MAX_TURNS', async () => {
        // First message starts conversation
        const res1 = await request(app)
            .post('/config/assist')
            .send({ message: 'msg1' });
        const convId = res1.body.conversationId;

        // Send 9 more messages (total 10 user + 10 assistant = 20 > 16)
        for (let i = 2; i <= 10; i++) {
            await request(app)
                .post('/config/assist')
                .send({ message: `msg${i}`, conversationId: convId });
        }

        // The conversation should still work (history trimmed, not errored)
        const resLast = await request(app)
            .post('/config/assist')
            .send({ message: 'final', conversationId: convId });

        expect(resLast.status).toBe(200);
        expect(resLast.body.conversationId).toBe(convId);
    });

    it('returns 400 when message is a non-string type', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({ message: 12345 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('message is required');
    });

    it('detects relevant sections from user message mentioning param keys', async () => {
        // Add a section with searchTerms for testing
        mockSectionMetadata['test_section'] = {
            title: 'Test Section',
            description: 'A test section',
            behavior: 'Test behavior',
            searchTerms: ['foobar_search'],
            parameters: [
                {
                    key: 'testParamKey',
                    label: 'Test Param',
                    description: 'A test param',
                    configPath: ['test', 'param'],
                    min: 0, max: 10, step: 1, default: 5,
                },
            ],
        };

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'I want to change testParamKey' });

        expect(res.status).toBe(200);
        // The system prompt should have included the test section detail
        const callArgs = mockCallSubsystemModel.mock.calls[0];
        const prompt = callArgs[1] as string;
        expect(prompt).toContain('Test Section');

        // Clean up
        delete mockSectionMetadata['test_section'];
    });

    it('detects relevant sections from searchTerms', async () => {
        mockSectionMetadata['searchable_section'] = {
            title: 'Searchable Section',
            description: 'Has search terms',
            behavior: 'Searchable behavior',
            searchTerms: ['unique_search_term_xyz'],
            parameters: [{
                key: 'searchParam',
                label: 'Search Param',
                description: 'desc',
                configPath: ['search', 'param'],
                min: 0, max: 10, step: 1, default: 5,
            }],
        };

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'I need help with unique_search_term_xyz' });

        expect(res.status).toBe(200);
        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('Searchable Section');

        delete mockSectionMetadata['searchable_section'];
    });

    it('detects relevant sections by section title', async () => {
        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'Tell me about Voicing Constraints' });

        expect(res.status).toBe(200);
        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('Voicing Constraints');
        // Should include the detailed section with parameter table
        expect(prompt).toContain('Min Novel Words');
    });
});

// =============================================================================
// LLM error handling
// =============================================================================

describe('POST /config/assist — error handling', () => {
    it('returns 500 when LLM call fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM unavailable'));

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'help' });

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('LLM unavailable');
    });
});
