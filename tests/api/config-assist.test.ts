/**
 * API tests for routes/config-assist.ts
 *
 * Tests: POST /config/assist (validation, conversation continuity),
 *        GET /config/assist/diagnostic,
 *        POST /config/assist/interview (validation + deterministic suggestions)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const MOCK_SECTION_METADATA: Record<string, any> = {
    'voicing_constraints': {
        title: 'Voicing Constraints',
        description: 'Controls voicing output',
        behavior: 'Controls voice output gates',
        parameters: [
            {
                key: 'minNovelWords',
                label: 'Min Novel Words',
                description: 'Min novel words in output',
                configPath: ['voicing', 'minNovelWords'],
                min: 0,
                max: 20,
                step: 1,
                default: 4,
            },
        ],
    },
};

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('Assistant response text.');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({ config_tune: 'model-1' });
const mockGetSafeConfig = jest.fn<() => any>().mockReturnValue({
    voicing: { minNovelWords: 4 },
    hallucination: { fabricatedNumberCheck: 0, novelRatioThreshold: 0.75, minRedFlags: 2 },
    engine: { minSpecificity: 2.0, threshold: 0.50, synthesisIntervalMs: 2000 },
    dedup: { embeddingSimilarityThreshold: 0.82, wordOverlapThreshold: 0.70 },
    evm: { enabled: 0 },
    validation: { noveltyGateEnabled: 1, evmGateEnabled: 0 },
    autonomousCycles: {
        evm: { enabled: 0 },
        autorating: { enabled: 1, inlineEnabled: 1, intervalMs: 45000 },
        validation: { intervalMs: 60000 },
        questions: { enabled: 1, intervalMs: 45000 },
        tensions: { enabled: 1, intervalMs: 45000 },
        research: { enabled: 0, intervalMs: 45000 },
    },
});
const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetQuickMetrics = jest.fn<() => Promise<any>>().mockResolvedValue({ totalNodes: 100, avgWeight: 1.2, avgSpecificity: 2.1 });
const mockBuildParamLookup = jest.fn<() => Record<string, any>>().mockReturnValue({});
const mockGetNestedValue = jest.fn<(obj: any, path: string[]) => any>().mockImplementation((obj, path) => {
    let val = obj;
    for (const p of path) val = val?.[p];
    return val;
});
const mockWithinDays = jest.fn<() => string>().mockReturnValue('started_at > datetime("now", "-7 days")');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: MOCK_SECTION_METADATA,
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockDbQuery,
    queryOne: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
    systemQuery: jest.fn().mockResolvedValue([]),
    systemQueryOne: jest.fn().mockResolvedValue(null),
    transactionSync: jest.fn((fn: any) => fn({ run: jest.fn(), all: jest.fn(() => []) })),
    systemTransactionSync: jest.fn((fn: any) => fn({ run: jest.fn(), all: jest.fn(() => []) })),
    healthCheck: jest.fn().mockResolvedValue(true),
    dialect: 'sqlite',
    isSystemSetting: jest.fn(() => false),
    yieldToEventLoop: jest.fn().mockResolvedValue(undefined),
    backupDatabase: jest.fn().mockResolvedValue(null),
    restoreDatabase: jest.fn().mockResolvedValue(null),
    listBackups: jest.fn(() => []),
    switchProject: jest.fn().mockResolvedValue(undefined),
    saveProjectCopy: jest.fn().mockResolvedValue(undefined),
    createEmptyProject: jest.fn().mockResolvedValue(undefined),
    getProjectDir: jest.fn(() => '/tmp'),
    getDbDiagnostics: jest.fn(() => ({})),
    resetDbDiagnostics: jest.fn(),
    pool: null,
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: mockWithinDays,
}));

jest.unstable_mockModule('../../handlers/config-tune/helpers.js', () => ({
    getQuickMetrics: mockGetQuickMetrics,
    buildParamLookup: mockBuildParamLookup,
    getNestedValue: mockGetNestedValue,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: configAssistRouter } = await import('../../routes/config-assist.js');

/** Express app with config-assist router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', configAssistRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCallSubsystemModel.mockResolvedValue('I suggest reducing the threshold.');
    mockGetSubsystemAssignments.mockResolvedValue({ config_tune: 'model-1' });
    mockGetQuickMetrics.mockResolvedValue({ totalNodes: 100, avgWeight: 1.2, avgSpecificity: 2.1 });
    mockBuildParamLookup.mockReturnValue({});
    mockDbQuery.mockResolvedValue([]);
});

// =============================================================================
// POST /config/assist
// =============================================================================

describe('POST /config/assist', () => {
    it('returns 400 when message is missing', async () => {
        const res = await request(buildApp()).post('/config/assist').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('message is required');
    });

    it('returns 400 when message is not a string', async () => {
        const res = await request(buildApp()).post('/config/assist').send({ message: 123 });
        expect(res.status).toBe(400);
    });

    it('returns conversationId and response', async () => {
        const res = await request(buildApp())
            .post('/config/assist')
            .send({ message: 'Help me tune synthesis' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('conversationId');
        expect(res.body).toHaveProperty('response');
        expect(typeof res.body.conversationId).toBe('string');
    });

    it('includes diagnostic on first response', async () => {
        const res = await request(buildApp())
            .post('/config/assist')
            .send({ message: 'Diagnose my system' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('diagnostic');
    });

    it('continues existing conversation', async () => {
        // First turn
        const first = await request(buildApp())
            .post('/config/assist')
            .send({ message: 'Start conversation' });
        const convId = first.body.conversationId;

        // Second turn with same ID
        const second = await request(buildApp())
            .post('/config/assist')
            .send({ message: 'Continue here', conversationId: convId });
        expect(second.status).toBe(200);
        expect(second.body.conversationId).toBe(convId);
    });

    it('extracts suggestions block from LLM response', async () => {
        const suggestions = [{ key: 'minNovelWords', configPath: ['voicing', 'minNovelWords'], suggestedValue: 5, explanation: 'test' }];
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + JSON.stringify(suggestions) + '\n```\nThis is the explanation.'
        );
        // Need paramLookup to have the key for suggestions to be extracted
        mockBuildParamLookup.mockReturnValue({
            'voicing.minNovelWords': { label: 'Min Novel Words', min: 0, max: 20, step: 1, default: 4, sectionId: 'voicing_constraints' },
        });

        const res = await request(buildApp())
            .post('/config/assist')
            .send({ message: 'How should I tune voicing?' });
        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeDefined();
        expect(res.body.suggestions.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// GET /config/assist/diagnostic
// =============================================================================

describe('GET /config/assist/diagnostic', () => {
    it('returns diagnostic with severity and healthSummary', async () => {
        const res = await request(buildApp()).get('/config/assist/diagnostic');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('diagnostic');
        expect(res.body.diagnostic).toHaveProperty('severity');
        expect(res.body.diagnostic).toHaveProperty('healthSummary');
        expect(res.body.diagnostic).toHaveProperty('successRate');
    });

    it('returns critical severity when no synthesis cycles', async () => {
        // mockDbQuery returns empty for synthesis stats
        const res = await request(buildApp()).get('/config/assist/diagnostic');
        // successRate=0 → critical
        expect(res.body.diagnostic.severity).toBe('critical');
    });
});

// =============================================================================
// POST /config/assist/interview
// =============================================================================

describe('POST /config/assist/interview', () => {
    it('returns 400 when answers is missing', async () => {
        const res = await request(buildApp()).post('/config/assist/interview').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('answers object is required');
    });

    it('returns 400 for invalid domain', async () => {
        const res = await request(buildApp())
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
        expect(res.body.error).toContain('Invalid domain');
    });

    it('returns 400 for invalid material', async () => {
        const res = await request(buildApp())
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'hard_science',
                    material: 'bad_material',
                    stance: 'balanced',
                    verification: 'moderate',
                    maturity: 'growing',
                    budget: 'moderate',
                },
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid material');
    });

    it('returns 400 for invalid stance', async () => {
        const res = await request(buildApp())
            .post('/config/assist/interview')
            .send({
                answers: { domain: 'hard_science', material: 'quantitative', stance: 'bad', verification: 'moderate', maturity: 'growing', budget: 'moderate' },
            });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid stance');
    });

    it('returns suggestions and profile for valid answers', async () => {
        const res = await request(buildApp())
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
        expect(res.body).toHaveProperty('suggestions');
        expect(res.body).toHaveProperty('profile');
        expect(res.body.profile).toHaveProperty('label');
        expect(res.body.profile).toHaveProperty('description');
        expect(Array.isArray(res.body.suggestions)).toBe(true);
    });

    it('sets profile label based on domain and stance', async () => {
        const res = await request(buildApp())
            .post('/config/assist/interview')
            .send({
                answers: {
                    domain: 'humanities',
                    material: 'qualitative',
                    stance: 'exploratory',
                    verification: 'low',
                    maturity: 'fresh',
                    budget: 'minimal',
                },
            });
        expect(res.status).toBe(200);
        expect(res.body.profile.label).toContain('Exploratory');
        expect(res.body.profile.label).toContain('Humanities');
    });
});
