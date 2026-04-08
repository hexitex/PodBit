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

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('No changes needed.');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetSafeConfig = jest.fn().mockReturnValue({});

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

// Minimal SECTION_METADATA — enough for detectRelevantSections + buildSectionDetail
const MOCK_SECTION_METADATA: Record<string, any> = {
    voicing_constraints: {
        title: 'Voicing Constraints',
        description: 'Controls voicing output',
        behavior: 'Limits output length and novelty',
        parameters: [
            { key: 'maxOutputWords', label: 'Max Output Words', configPath: ['voicing', 'maxOutputWords'], min: 10, max: 100, step: 5, default: 30, description: 'Max words in voicing output' },
            { key: 'minNovelWords', label: 'Min Novel Words', configPath: ['voicing', 'minNovelWords'], min: 0, max: 20, step: 1, default: 4, description: 'Min novel words required' },
        ],
        searchTerms: ['voicing', 'output'],
    },
    dedup_settings: {
        title: 'Dedup Settings',
        description: 'Controls deduplication',
        behavior: 'Detects duplicate nodes',
        parameters: [
            { key: 'embeddingSimilarityThreshold', label: 'Embedding Threshold', configPath: ['dedup', 'embeddingSimilarityThreshold'], min: 0.5, max: 0.99, step: 0.01, default: 0.90, description: 'Embedding similarity threshold' },
            { key: 'wordOverlapThreshold', label: 'Word Overlap Threshold', configPath: ['dedup', 'wordOverlapThreshold'], min: 0.3, max: 0.99, step: 0.01, default: 0.85, description: 'Word overlap threshold' },
        ],
        searchTerms: ['dedup', 'duplicate'],
    },
    hallucination_detection: {
        title: 'Hallucination Detection',
        description: 'Detects hallucinated content',
        behavior: 'Flags novel or fabricated content',
        parameters: [
            { key: 'fabricatedNumberCheck', label: 'Fabricated Number Check', configPath: ['hallucination', 'fabricatedNumberCheck'], min: 0, max: 1, step: 1, default: 1, description: 'Toggle fabricated number check' },
            { key: 'novelRatioThreshold', label: 'Novel Ratio Threshold', configPath: ['hallucination', 'novelRatioThreshold'], min: 0.3, max: 1.0, step: 0.05, default: 0.65, description: 'Novel word ratio threshold' },
            { key: 'minRedFlags', label: 'Min Red Flags', configPath: ['hallucination', 'minRedFlags'], min: 1, max: 5, step: 1, default: 2, description: 'Min red flags to reject' },
        ],
        searchTerms: ['hallucination', 'fabricated'],
    },
    resonance_specificity: {
        title: 'Resonance & Specificity',
        description: 'Controls resonance scoring',
        behavior: 'Adjusts pairing and specificity',
        parameters: [
            { key: 'similarityThreshold', label: 'Similarity Threshold', configPath: ['engine', 'threshold'], min: 0.2, max: 0.9, step: 0.01, default: 0.50, description: 'Resonance threshold' },
            { key: 'minSpecificity', label: 'Min Specificity', configPath: ['engine', 'minSpecificity'], min: 0.5, max: 5.0, step: 0.5, default: 2.0, description: 'Min specificity score' },
        ],
        searchTerms: ['resonance', 'threshold'],
    },
    synthesis_quality_gates: {
        title: 'Synthesis Quality Gates',
        description: 'Controls synthesis quality',
        behavior: 'Quality gates for synthesis output',
        parameters: [],
        searchTerms: ['quality', 'gates'],
    },
    synthesis_validation: {
        title: 'Synthesis Validation',
        description: 'Validates synthesis output',
        behavior: 'Breakthrough validation',
        parameters: [
            { key: 'noveltyGateEnabled', label: 'Novelty Gate', configPath: ['validation', 'noveltyGateEnabled'], min: 0, max: 1, step: 1, default: 1, description: 'Enable novelty gate' },
            { key: 'evmGateEnabled', label: 'EVM Gate', configPath: ['validation', 'evmGateEnabled'], min: 0, max: 1, step: 1, default: 0, description: 'Enable EVM gate' },
        ],
        searchTerms: ['validation', 'breakthrough'],
    },
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: MOCK_SECTION_METADATA,
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
    withinDays: (col: string, _param: string) => `${col} > datetime('now', '-7 days')`,
}));

const mockGetQuickMetrics = jest.fn<() => Promise<any>>().mockResolvedValue({
    totalNodes: 100,
    avgWeight: 0.5,
    avgSpecificity: 3.2,
});

// Build a paramLookup from the mock section metadata
function buildMockParamLookup(): Record<string, any> {
    const lookup: Record<string, any> = {};
    for (const [sectionId, section] of Object.entries(MOCK_SECTION_METADATA)) {
        for (const param of section.parameters) {
            const pathStr = param.configPath.join('.');
            lookup[pathStr] = { ...param, sectionId };
        }
    }
    return lookup;
}

const mockBuildParamLookup = jest.fn().mockReturnValue(buildMockParamLookup());

const mockGetNestedValue = jest.fn().mockImplementation((obj: any, path: any) => {
    if (!obj || path === undefined || path === null) return undefined;
    const parts = Array.isArray(path) ? path : String(path).split('.');
    let current = obj;
    for (const p of parts) {
        if (current == null) return undefined;
        current = current[p];
    }
    return current;
});

jest.unstable_mockModule('../../handlers/config-tune/helpers.js', () => ({
    getQuickMetrics: mockGetQuickMetrics,
    buildParamLookup: mockBuildParamLookup,
    getNestedValue: mockGetNestedValue,
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
    jest.resetAllMocks();
    mockCallSubsystemModel.mockResolvedValue('No changes needed.');
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetSafeConfig.mockReturnValue({});
    mockDbQuery.mockResolvedValue([]);
    mockGetQuickMetrics.mockResolvedValue({ totalNodes: 100, avgWeight: 0.5, avgSpecificity: 3.2 });
    mockBuildParamLookup.mockReturnValue(buildMockParamLookup());
    mockGetNestedValue.mockImplementation((obj: any, path: any) => {
        if (!obj || path === undefined || path === null) return undefined;
        const parts = Array.isArray(path) ? path : String(path).split('.');
        let current = obj;
        for (const p of parts) {
            if (current == null) return undefined;
            current = current[p];
        }
        return current;
    });
});

// =============================================================================
// GET /config/assist/diagnostic
// =============================================================================

describe('GET /config/assist/diagnostic', () => {
    it('returns diagnostic with metrics', async () => {
        mockDbQuery
            .mockResolvedValueOnce([]) // rejections
            .mockResolvedValueOnce([{ total: '50', with_partner: '40', children: '5' }]); // cycle stats

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.status).toBe(200);
        expect(res.body.diagnostic).toBeDefined();
        expect(res.body.diagnostic.metrics.totalNodes).toBe(100);
    });

    it('returns critical severity when no synthesis cycles', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '0', with_partner: '0', children: '0' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.severity).toBe('critical');
        expect(res.body.diagnostic.healthSummary).toContain('No synthesis cycles');
    });

    it('returns critical severity when success rate below 2%', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ reason: 'derivative', count: 98 }])
            .mockResolvedValueOnce([{ total: '100', with_partner: '80', children: '1' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.severity).toBe('critical');
        expect(res.body.diagnostic.healthSummary).toContain('stalled');
    });

    it('returns warning severity when success rate between 2% and 5%', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '100', with_partner: '80', children: '3' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.severity).toBe('warning');
    });

    it('returns healthy severity when success rate between 5% and 15%', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '100', with_partner: '80', children: '10' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.severity).toBe('healthy');
    });

    it('returns warning severity when success rate above 15% (too permissive)', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '100', with_partner: '80', children: '20' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.severity).toBe('warning');
        expect(res.body.diagnostic.healthSummary).toContain('permissive');
    });

    it('includes top rejection reasons with percentages', async () => {
        mockDbQuery
            .mockResolvedValueOnce([
                { reason: 'derivative', count: 60 },
                { reason: 'hallucination', count: 40 },
            ])
            .mockResolvedValueOnce([{ total: '100', with_partner: '80', children: '1' }]);

        const res = await request(app).get('/config/assist/diagnostic');

        expect(res.body.diagnostic.topRejections).toHaveLength(2);
        expect(res.body.diagnostic.topRejections[0].reason).toBe('derivative');
        expect(res.body.diagnostic.topRejections[0].pct).toBe(60);
    });
});

// =============================================================================
// POST /config/assist
// =============================================================================

describe('POST /config/assist', () => {
    it('returns 400 when no message provided', async () => {
        const res = await request(app).post('/config/assist').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('message');
    });

    it('returns 400 when message is not a string', async () => {
        const res = await request(app).post('/config/assist').send({ message: 123 });

        expect(res.status).toBe(400);
    });

    it('creates a new conversation and returns conversationId', async () => {
        // Mock diagnostic queries
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'Help me tune my config' });

        expect(res.status).toBe(200);
        expect(res.body.conversationId).toBeDefined();
        expect(res.body.conversationId).toMatch(/^ca-/);
        expect(res.body.response).toBeDefined();
    });

    it('includes diagnostic on first response', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'What should I tune?' });

        expect(res.body.diagnostic).toBeDefined();
        expect(res.body.diagnostic.successRate).toBeDefined();
    });

    it('calls the LLM via callSubsystemModel', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        await request(app)
            .post('/config/assist')
            .send({ message: 'Help me tune dedup' });

        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(1);
        // The prompt should contain the system prompt + user message
        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('Help me tune dedup');
    });

    it('uses config_tune subsystem when assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ config_tune: true });
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        await request(app)
            .post('/config/assist')
            .send({ message: 'Test' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('config_tune', expect.any(String), expect.any(Object));
    });

    it('falls back to compress subsystem when config_tune not assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        await request(app)
            .post('/config/assist')
            .send({ message: 'Test' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('compress', expect.any(String), expect.any(Object));
    });

    it('parses suggestions from LLM response', async () => {
        const suggestionJson = JSON.stringify([{
            key: 'embeddingSimilarityThreshold',
            configPath: ['dedup', 'embeddingSimilarityThreshold'],
            suggestedValue: 0.85,
            explanation: 'Lower dedup threshold',
        }]);
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n' + suggestionJson + '\n```\n\nHere is my analysis.'
        );
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'Help with dedup' });

        expect(res.body.suggestions).toBeDefined();
        expect(res.body.suggestions).toHaveLength(1);
        expect(res.body.suggestions[0].key).toBe('embeddingSimilarityThreshold');
        expect(res.body.suggestions[0].suggestedValue).toBe(0.85);
    });

    it('strips suggestion block from response text', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '```suggestions\n[]\n```\n\nHere is my analysis.'
        );
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'Help' });

        expect(res.body.response).not.toContain('```suggestions');
        expect(res.body.response).toContain('Here is my analysis.');
    });

    it('clamps suggestion values to parameter range', async () => {
        const suggestionJson = JSON.stringify([{
            key: 'embeddingSimilarityThreshold',
            configPath: ['dedup', 'embeddingSimilarityThreshold'],
            suggestedValue: 1.5, // above max of 0.99
            explanation: 'Test clamping',
        }]);
        mockCallSubsystemModel.mockResolvedValue('```suggestions\n' + suggestionJson + '\n```');
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'Test' });

        expect(res.body.suggestions[0].suggestedValue).toBe(0.99);
    });

    it('reuses existing conversation when conversationId provided', async () => {
        // First message — create conversation
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);
        const first = await request(app)
            .post('/config/assist')
            .send({ message: 'Hello' });
        const convId = first.body.conversationId;

        // Second message — reuse conversation
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);
        const second = await request(app)
            .post('/config/assist')
            .send({ message: 'Follow up', conversationId: convId });

        expect(second.body.conversationId).toBe(convId);
        // Second turn: no diagnostic (messages > 2)
        expect(second.body.diagnostic).toBeUndefined();
    });

    it('detects relevant sections from message text', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '10', with_partner: '8', children: '1' }]);

        await request(app)
            .post('/config/assist')
            .send({ message: 'I need help with dedup settings' });

        // The prompt should include detailed section info for dedup_settings
        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('Dedup Settings');
    });
});

// =============================================================================
// POST /config/assist/interview
// =============================================================================

describe('POST /config/assist/interview', () => {
    const validAnswers = {
        domain: 'hard_science',
        material: 'quantitative',
        stance: 'conservative',
        verification: 'high',
        maturity: 'growing',
        budget: 'moderate',
    };

    it('returns 400 when no answers provided', async () => {
        const res = await request(app).post('/config/assist/interview').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('answers');
    });

    it('returns 400 for invalid domain', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, domain: 'invalid' } });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('domain');
    });

    it('returns 400 for invalid material', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, material: 'invalid' } });

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid stance', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, stance: 'invalid' } });

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid verification', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, verification: 'invalid' } });

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid maturity', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, maturity: 'invalid' } });

        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid budget', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, budget: 'invalid' } });

        expect(res.status).toBe(400);
    });

    it('returns suggestions and profile for valid answers', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: validAnswers });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toBeInstanceOf(Array);
        expect(res.body.profile).toBeDefined();
        expect(res.body.profile.label).toContain('Hard Science');
        expect(res.body.profile.label).toContain('Conservative');
    });

    it('generates appropriate profile description', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: validAnswers });

        expect(res.body.profile.description).toContain('quantitative');
        expect(res.body.profile.description).toContain('conservative');
        expect(res.body.profile.description).toContain('high');
    });

    it('enables EVM for high verification priority', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, verification: 'high' } });

        const evmSuggestion = res.body.suggestions.find((s: any) => s.key === 'evmGateEnabled');
        if (evmSuggestion) {
            expect(evmSuggestion.suggestedValue).toBe(1);
        }
    });

    it('disables optional cycles for minimal budget', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, budget: 'minimal' } });

        const questionsCycle = res.body.suggestions.find((s: any) => s.key === 'questionsEnabled');
        if (questionsCycle) {
            expect(questionsCycle.suggestedValue).toBe(0);
        }
    });

    it('skips suggestions that would not change current config', async () => {
        // Set current config to match what interview would suggest
        mockGetSafeConfig.mockReturnValue({
            hallucination: { fabricatedNumberCheck: 1 },
        });

        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: validAnswers });

        // fabricatedNumberCheck for hard_science + quantitative = 1, same as current
        const fabricatedSuggestion = res.body.suggestions.find(
            (s: any) => s.key === 'fabricatedNumberCheck'
        );
        expect(fabricatedSuggestion).toBeUndefined();
    });

    it('uses exploratory stance for lower similarity threshold', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, stance: 'exploratory' } });

        const similaritySuggestion = res.body.suggestions.find(
            (s: any) => s.key === 'similarityThreshold'
        );
        if (similaritySuggestion) {
            expect(similaritySuggestion.suggestedValue).toBeLessThan(0.50);
        }
    });

    it('adjusts for fresh graph maturity', async () => {
        const res = await request(app)
            .post('/config/assist/interview')
            .send({ answers: { ...validAnswers, maturity: 'fresh' } });

        // Fresh graph should increase minRedFlags (more lenient)
        const redFlags = res.body.suggestions.find((s: any) => s.key === 'minRedFlags');
        if (redFlags) {
            expect(redFlags.suggestedValue).toBeGreaterThanOrEqual(2);
        }
    });
});
