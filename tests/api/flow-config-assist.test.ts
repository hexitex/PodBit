/**
 * Integration flow: Config assistant conversation continuity.
 *
 * POST /config/assist  (turn 1, no conversationId)
 *   → creates a new conversation, returns conversationId + diagnostic
 *
 * POST /config/assist  (turn 2, with conversationId from turn 1)
 *   → resumes the same in-memory conversation; diagnostic is NOT included
 *     in turn-2 response (only included when conversation.messages.length <= 2)
 *
 * The conversationId from turn 1 flows into turn 2, testing that the in-memory
 * conversation Map persists between requests on the same module instance.
 *
 * Mocks: models.js (callSubsystemModel, getSubsystemAssignments),
 *        config.js (getSafeConfig), config-sections.js (SECTION_METADATA),
 *        db/index.js (query), db/sql.js (withinDays),
 *        handlers/config-tune/helpers.js (getQuickMetrics, buildParamLookup, getNestedValue),
 *        async-handler
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Minimal SECTION_METADATA (enough to exercise index + detail builders) ─────
const MOCK_SECTION_METADATA: Record<string, any> = {
    voicing_constraints: {
        title: 'Voicing Constraints',
        description: 'Controls voicing output quality gates.',
        behavior: 'Rejects synthesis output that fails novelty and word limits.',
        parameters: [
            {
                key: 'minNovelWords',
                label: 'Min Novel Words',
                description: 'Minimum novel words required in synthesis output.',
                configPath: ['voicing', 'minNovelWords'],
                min: 0, max: 20, step: 1, default: 4,
            },
        ],
    },
};

const mockCallSubsystemModel = jest.fn<() => Promise<string>>()
    .mockResolvedValue('Here is my analysis of your synthesis issues.');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ config_tune: 'model-1' });

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
const mockGetQuickMetrics = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ totalNodes: 150, avgWeight: 1.3, avgSpecificity: 2.2 });
const mockBuildParamLookup = jest.fn<() => Record<string, any>>().mockReturnValue({
    'voicing.minNovelWords': {
        key: 'minNovelWords',
        label: 'Min Novel Words',
        configPath: ['voicing', 'minNovelWords'],
        min: 0, max: 20, step: 1, default: 4, sectionId: 'voicing_constraints',
    },
});
const mockGetNestedValue = jest.fn<(obj: any, path: string[]) => any>()
    .mockImplementation((obj, path) => {
        let val = obj;
        for (const p of path) val = val?.[p];
        return val;
    });
const mockWithinDays = jest.fn<() => string>()
    .mockReturnValue("started_at > datetime('now', '-7 days')");

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
    jest.resetAllMocks();
    mockCallSubsystemModel.mockResolvedValue('Here is my analysis of your synthesis issues.');
    mockGetSubsystemAssignments.mockResolvedValue({ config_tune: 'model-1' });
    mockGetSafeConfig.mockReturnValue({
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
    mockDbQuery.mockResolvedValue([]);
    mockGetQuickMetrics.mockResolvedValue({ totalNodes: 150, avgWeight: 1.3, avgSpecificity: 2.2 });
    mockBuildParamLookup.mockReturnValue({
        'voicing.minNovelWords': {
            key: 'minNovelWords', label: 'Min Novel Words',
            configPath: ['voicing', 'minNovelWords'],
            min: 0, max: 20, step: 1, default: 4, sectionId: 'voicing_constraints',
        },
    });
    mockGetNestedValue.mockImplementation((obj, path) => {
        let val = obj;
        for (const p of path) val = val?.[p];
        return val;
    });
    mockWithinDays.mockReturnValue("started_at > datetime('now', '-7 days')");
});

// =============================================================================
// Conversation continuity flow
// =============================================================================

describe('Config assist conversation continuity flow', () => {
    it('turn 1 issues a conversationId + diagnostic; turn 2 reuses it without diagnostic', async () => {
        const app = buildApp();

        // ── Turn 1: no conversationId — creates a new conversation ────────────
        const turn1Res = await request(app)
            .post('/config/assist')
            .send({ message: 'My synthesis success rate seems very low, can you help?' });

        expect(turn1Res.status).toBe(200);
        expect(turn1Res.body.conversationId).toBeDefined();
        expect(typeof turn1Res.body.conversationId).toBe('string');
        expect(turn1Res.body.response).toBeDefined();

        // First response includes the diagnostic (conversation.messages.length === 2 after push)
        expect(turn1Res.body.diagnostic).toBeDefined();
        expect(turn1Res.body.diagnostic).toHaveProperty('severity');

        const conversationId = turn1Res.body.conversationId; // flows into Turn 2

        // LLM was called once for Turn 1
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(1);

        // ── Turn 2: send the conversationId back — resumes existing conversation ──
        mockCallSubsystemModel.mockResolvedValueOnce('The voicing constraints look like the bottleneck here.');

        const turn2Res = await request(app)
            .post('/config/assist')
            .send({
                message: 'Can you focus specifically on the voicing constraints section?',
                conversationId,
            });

        expect(turn2Res.status).toBe(200);

        // Same conversationId returned — it's the SAME conversation
        expect(turn2Res.body.conversationId).toBe(conversationId);
        expect(turn2Res.body.response).toBeDefined();

        // Turn 2 does NOT include diagnostic (conversation.messages.length === 4 > 2)
        expect(turn2Res.body.diagnostic).toBeUndefined();

        // LLM was called again for Turn 2
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(2);
    });

    it('unknown conversationId starts a fresh conversation with a new ID', async () => {
        const app = buildApp();

        const res = await request(app)
            .post('/config/assist')
            .send({
                message: 'How do I tune the dedup settings?',
                conversationId: 'nonexistent-conv-id',
            });

        expect(res.status).toBe(200);
        // A new ID is generated — different from the (unknown) one we sent
        expect(res.body.conversationId).not.toBe('nonexistent-conv-id');
        // Still gets a diagnostic (new conversation → messages.length ≤ 2)
        expect(res.body.diagnostic).toBeDefined();
    });

    it('suggestions are extracted from ```suggestions``` block in LLM response', async () => {
        const app = buildApp();

        // LLM response with a properly formatted suggestions block
        mockCallSubsystemModel.mockResolvedValueOnce(
            '```suggestions\n' +
            '[{"key":"minNovelWords","configPath":["voicing","minNovelWords"],"suggestedValue":6,"explanation":"Increase to reduce derivative outputs"}]\n' +
            '```\n\n' +
            'Raising minNovelWords will force the synthesis engine to produce more novel content.',
        );

        const res = await request(app)
            .post('/config/assist')
            .send({ message: 'How do I get more novel synthesis output?' });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.suggestions)).toBe(true);
        expect(res.body.suggestions).toHaveLength(1);
        expect(res.body.suggestions[0].key).toBe('minNovelWords');
        expect(res.body.suggestions[0].suggestedValue).toBe(6);

        // The ```suggestions``` block is stripped from the visible response
        expect(res.body.response).not.toContain('```suggestions');
    });

    it('400 when message is missing', async () => {
        const res = await request(buildApp())
            .post('/config/assist')
            .send({ conversationId: 'whatever' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('message');
    });
});
