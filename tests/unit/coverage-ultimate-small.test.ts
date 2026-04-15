/**
 * Coverage-ultimate-small — targets ~100 uncovered statements across 19 files.
 *
 * All jest.unstable_mockModule calls are at file top level to avoid Jest ESM
 * module caching conflicts. Each mock path is registered exactly ONCE.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Shared mock functions — declared at file scope, controlled per-test
// =============================================================================
const mockQuery = jest.fn<any>().mockResolvedValue([]);
const mockQueryOne = jest.fn<any>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<any>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<any>().mockResolvedValue(null);
const mockEmitActivity = jest.fn();
const mockGetPrompt = jest.fn<any>().mockResolvedValue('prompt');
const mockGetEmbedding = jest.fn<any>().mockResolvedValue(null);
const mockCallSubsystemModel = jest.fn<any>();
const mockLogDecision = jest.fn<any>().mockResolvedValue(undefined);
const mockDetectInjection = jest.fn().mockReturnValue({ isInjection: false, score: 0, reasons: [] });
const mockBackupDatabase = jest.fn<any>().mockResolvedValue(undefined);
const mockSwitchProject = jest.fn<any>().mockResolvedValue(undefined);
const mockSaveProjectCopy = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateEmptyProject = jest.fn<any>().mockResolvedValue(undefined);
const mockGetProjectDir = jest.fn().mockReturnValue('/tmp/test-projects');
const mockReadProjectsMeta = jest.fn();
const mockWriteProjectsMeta = jest.fn();
const mockSetProjectSwitching = jest.fn();
const mockResetAbortController = jest.fn();
const mockIsBudgetExceeded = jest.fn().mockReturnValue(false);
const mockWithinDays = jest.fn(() => '1=1');
const mockCosineSimilarity = jest.fn().mockReturnValue(0.9);
const mockFindDomainsBySynonym = jest.fn<any>().mockResolvedValue([]);
const mockResolveContent = jest.fn<any>().mockImplementation(async (c: string) => c);
const mockInvalidateKnowledgeCache = jest.fn();
const mockGetPatternSiblingsQuery = jest.fn().mockReturnValue('SELECT 1');

// =============================================================================
// Register all mocks ONCE at file scope (before any imports)
// =============================================================================
jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
    backupDatabase: mockBackupDatabase,
    switchProject: mockSwitchProject,
    saveProjectCopy: mockSaveProjectCopy,
    createEmptyProject: mockCreateEmptyProject,
    getProjectDir: mockGetProjectDir,
    close: jest.fn<any>().mockResolvedValue(undefined),
    pool: { query: mockQuery },
}));

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
    logDecision: mockLogDecision,
    getAccessibleDomains: jest.fn<any>().mockResolvedValue([]),
    canOverride: jest.fn<any>().mockResolvedValue({ allowed: false, reason: 'blocked' }),
    detectInjection: mockDetectInjection,
    cosineSimilarity: mockCosineSimilarity,
    findDomainsBySynonym: mockFindDomainsBySynonym,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        telegraphic: {
            phrases: [['for example', 'e.g.']], words: { because: '∵', therefore: '∴', with: 'w/' },
            removeAlways: ['the', 'a', 'an'], removeMedium: ['is', 'are', 'was'],
            removeAggressive: ['very', 'really'], preserve: ['not', 'no'],
        },
        dedup: {
            embeddingSimilarityThreshold: 0.9, wordOverlapThreshold: 0.85,
            maxNodesPerDomain: 100, minWordLength: 3, attractorWeightDecay: 0.01,
            attractorThreshold: 30, llmJudgeEnabled: false, llmJudgeDoubtFloor: 0.7,
            llmJudgeHardCeiling: 0.95,
        },
        consultantReview: { enabled: false },
        nodes: { promoteWeight: 2.0, defaultSalience: 0.5 },
        engine: { weightCeiling: 3.0 },
        subsystemTemperatures: {}, subsystemRepeatPenalties: {},
        subsystemTopP: {}, subsystemMinP: {}, subsystemTopK: {},
        consultantTemperatures: {}, consultantRepeatPenalties: {},
        consultantTopP: {}, consultantMinP: {}, consultantTopK: {},
        tokenLimits: { reasoningModelPatterns: [] },
        evm: { allowedModules: ['math', 'numpy'] },
        numberVariables: { enabled: false },
        knowledgeBase: { maxChunkSize: 4000, minChunkLength: 50, postIngestionSummary: true, curationMaxTokens: 2000 },
        resonance: {},
    },
    loadSavedConfig: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
    DEFAULT_GOLD_STANDARDS: [],
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    getSubsystemAssignments: jest.fn<any>().mockResolvedValue({}),
    getConsultantAssignments: jest.fn<any>().mockResolvedValue({}),
    loadSavedModels: jest.fn<any>().mockResolvedValue(undefined),
    callSingleModel: jest.fn<any>().mockResolvedValue({ text: '', usage: {} }),
    acquireModelSlot: jest.fn<any>().mockResolvedValue(() => {}),
}));

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
    close: jest.fn<any>().mockResolvedValue(undefined),
    pool: { query: mockQuery },
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: mockWithinDays,
    getPatternSiblingsQuery: mockGetPatternSiblingsQuery,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    cosineSimilarity: jest.fn(),
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
    createCachedLoader: () => ({ get: async () => new Map(), invalidate: jest.fn() }),
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
    extractVarIdsFromContent: jest.fn().mockReturnValue([]),
    getVariablesByIds: jest.fn<any>().mockResolvedValue([]),
    buildVariableLegend: jest.fn().mockReturnValue(''),
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    hasConsultant: jest.fn().mockReturnValue(false),
    callConsultantModel: jest.fn<any>(),
    loadAssignmentCache: jest.fn<any>().mockResolvedValue(undefined),
    getAssignedModel: jest.fn().mockReturnValue(null),
    setSubsystemThinking: jest.fn<any>(),
    getNoThinkOverrides: jest.fn().mockReturnValue({}),
    getThinkingLevelOverrides: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    VALID_SUBSYSTEMS: ['voice', 'compress', 'embedding'],
    normalizeProvider: jest.fn((p: string) => p),
    getModelProvider: jest.fn(() => 'openai'),
}));

jest.unstable_mockModule('../../models/providers.js', () => ({ callSingleModel: jest.fn() }));

jest.unstable_mockModule('../../models/cost.js', () => ({
    isReasoningModel: jest.fn().mockReturnValue(false),
    logUsage: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

jest.unstable_mockModule('../../handlers/projects.js', () => ({
    getProjectAbortSignal: jest.fn().mockReturnValue(undefined),
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
    acquireModelSlot: jest.fn<any>().mockResolvedValue(() => {}),
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../handlers/breakthrough-registry.js', () => ({
    registerBreakthrough: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
    writeProjectsMeta: mockWriteProjectsMeta,
    setProjectSwitching: mockSetProjectSwitching,
    resetAbortController: mockResetAbortController,
    getAbortController: jest.fn().mockReturnValue({ abort: jest.fn() }),
}));

jest.unstable_mockModule('../../handlers/projects/services.js', () => ({
    stopAllBackgroundServices: jest.fn<any>().mockResolvedValue(undefined),
    clearAllCaches: jest.fn<any>().mockResolvedValue(undefined),
    restartBackgroundServices: jest.fn<any>().mockResolvedValue(0),
}));

jest.unstable_mockModule('../../handlers/projects/bootstrap.js', () => ({
    bootstrapProject: jest.fn<any>().mockResolvedValue({ partitions: 0, bridges: 0, seeded: 0 }),
}));

jest.unstable_mockModule('../../db/sqlite-backend.js', () => ({
    applyEncryptionKey: jest.fn(),
}));

jest.unstable_mockModule('../../evm/types.js', () => ({
    VALID_EVALUATION_MODES: ['boolean', 'numerical', 'categorical'],
    VALID_CLAIM_TYPES: ['numerical_identity', 'qualitative', 'exhausted', 'causal'],
}));

jest.unstable_mockModule('../../kb/readers/registry.js', () => ({
    getReaderForExtension: jest.fn(),
}));

jest.unstable_mockModule('../../kb/pipeline/queue.js', () => ({
    queue: [], stopRequested: false,
    completedCount: 0, setCompletedCount: jest.fn(),
    failedCount: 0, setFailedCount: jest.fn(),
    skippedCount: 0, setSkippedCount: jest.fn(),
}));

jest.unstable_mockModule('../../handlers/config-tune/types.js', () => ({
    BEHAVIORAL_WEIGHTS: { synthesisSuccessRate: 0.5, avgResonance: 0.3, avgSpecificity: 0.2 },
    BEHAVIORAL_NORMALIZATION: { synthesisSuccessRate: 0.1, avgResonance: 0.1, avgSpecificity: 0.1 },
    CONVERGENCE_RATIO: 3.0, MIN_IMPACT: 0.001, ENVIRONMENT_CHANGE_THRESHOLD: 0.3,
}));

jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({ READER_SUBSYSTEMS: new Set() }));

jest.unstable_mockModule('../../core/autotune/combinatorics.js', () => ({
    groupByModel: jest.fn().mockReturnValue(new Map()),
    consolidateReaders: jest.fn().mockReturnValue({ toTune: [], inherited: new Map() }),
}));

jest.unstable_mockModule('../../core/autotune/execution.js', () => ({ tuneSubsystem: jest.fn() }));

jest.unstable_mockModule('../../core/autotune/gold-standards.js', () => ({
    scoreAgainstGoldStandards: jest.fn<any>().mockResolvedValue({ score: 1.0, results: [] }),
    composeTestPrompt: jest.fn().mockReturnValue('test prompt'),
}));

const tuneStateObj = { status: 'idle' as string, results: [] as any[], subsystemsComplete: 0, currentSubsystem: null, currentCombo: 0, totalCombos: 0, subsystemsTotal: 0, startedAt: '' };

jest.unstable_mockModule('../../core/autotune/state.js', () => ({
    tuneState: tuneStateObj,
    cancelFlag: false, setCancelFlag: jest.fn(),
    setTuneState: jest.fn((u: any) => Object.assign(tuneStateObj, u)),
}));

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: jest.fn().mockReturnValue({
        stopWords: ['the', 'is', 'a', 'and', 'or', 'for'],
        topicBoosts: { existingKeyword: 1.5, existingPhrase: 2.0, newPhrase: 1.5 },
        topicDecayAgeMs: 60000, topicDecayFactor: 0.8, topicMinWeight: 0.1,
        topicClustering: { enabled: false },
    }),
}));


// =============================================================================
// 3. telegraphic.ts — entropy mode and edge cases
// =============================================================================
describe('telegraphic.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers null input, entropy mode, structured content, and stats', async () => {
        const { toTelegraphic, getCompressionStats } = await import('../../telegraphic.js');

        // Null / non-string inputs
        expect(toTelegraphic(null as any)).toBe('');
        expect(toTelegraphic(undefined as any)).toBe('');
        expect(toTelegraphic('')).toBe('');
        expect(toTelegraphic(123 as any)).toBe('');

        // Entropy-enabled mode
        const result = toTelegraphic('The system is operating very well for example', {
            entropy: { enabled: true }, aggressiveness: 'aggressive',
        });
        expect(typeof result).toBe('string');

        // Structured content preservation
        const result2 = toTelegraphic('The code is `myFunction()` at https://example.com');
        expect(result2).toContain('`myFunction()`');
        expect(result2).toContain('https://example.com');

        // Compression stats
        const stats = getCompressionStats('hello world foo bar', 'hello foo');
        expect(stats.originalWords).toBe(4);
        expect(stats.compressedWords).toBe(2);
        expect(stats.wordReduction).toContain('%');
    });
});


// =============================================================================
// 4. config/loader.ts
// =============================================================================
describe('config/loader.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('updateConfig, loadSavedConfig, getSafeConfig', async () => {
        const { updateConfig, loadSavedConfig, getSafeConfig } = await import('../../config/loader.js');

        // updateConfig skips non-tunable
        const warnings = await updateConfig({ api: { key: 'test' } as any });
        expect(Array.isArray(warnings)).toBe(true);

        // loadSavedConfig handles missing row
        mockSystemQueryOne.mockResolvedValueOnce(null);
        await loadSavedConfig();

        // loadSavedConfig handles DB error
        mockSystemQueryOne.mockRejectedValueOnce(new Error('DB down'));
        await loadSavedConfig();

        // getSafeConfig
        const safe = getSafeConfig();
        expect(safe).toBeDefined();
        expect(safe.resonance).toBeDefined();
    });
});


// =============================================================================
// 5. core/security.ts
// =============================================================================
describe('core/security.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers regenerateKey, isSensitiveConfigPath, isLocalhostAddress, verifyAccessToken, setAdminPassword, verifyAdminPassword, cleanupExpiredRefreshTokens', async () => {
        const mod = await import('../../core/security.js');

        // regenerateKey with DB failure
        mockSystemQuery.mockRejectedValueOnce(new Error('DB fail'));
        const key = await mod.regenerateKey();
        expect(key.length).toBe(64);

        // isSensitiveConfigPath
        expect(mod.isSensitiveConfigPath(['some', 'apikey', 'field'])).toBe(true);
        expect(mod.isSensitiveConfigPath(['normal', 'field'])).toBe(false);
        expect(mod.isSensitiveConfigPath(['evm', 'allowedModules'])).toBe(true);

        // isLocalhostAddress
        expect(mod.isLocalhostAddress('127.0.0.1')).toBe(true);
        expect(mod.isLocalhostAddress('::1')).toBe(true);
        expect(mod.isLocalhostAddress('0.0.0.0')).toBe(false);

        // verifyAccessToken
        expect(await mod.verifyAccessToken('')).toBeNull();
        expect(await mod.verifyAccessToken('a.b')).toBeNull();
        expect(await mod.verifyAccessToken('x.y.z')).toBeNull();

        // setAdminPassword rejects short
        await expect(mod.setAdminPassword('short')).rejects.toThrow('at least 8');

        // verifyAdminPassword when none stored
        mockSystemQueryOne.mockResolvedValueOnce(null);
        expect(await mod.verifyAdminPassword('test1234')).toBe(false);

        // cleanupExpiredRefreshTokens
        mockSystemQuery.mockResolvedValueOnce(undefined);
        await mod.cleanupExpiredRefreshTokens();
        expect(mockSystemQuery).toHaveBeenCalled();
    });
});


// =============================================================================
// 6. handlers/dedup.ts
// =============================================================================
describe('handlers/dedup.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('checkDuplicate returns false for null domain; invalidateGateOverrideCache works', async () => {
        const { checkDuplicate, invalidateGateOverrideCache } = await import('../../handlers/dedup.js');
        const result = await checkDuplicate('test', null, null);
        expect(result.isDuplicate).toBe(false);
        invalidateGateOverrideCache(); // Should not throw
    });
});


// =============================================================================
// 7. handlers/elevation.ts
// =============================================================================
describe('handlers/elevation.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('handleDemote edge cases and handleVoice/handlePromote errors', async () => {
        const { handleDemote, handleVoice, handlePromote } = await import('../../handlers/elevation.js');

        // node not found
        mockQueryOne.mockResolvedValueOnce(null);
        expect((await handleDemote({ nodeId: 'x' })).error).toContain('not found');

        // already synthesis (idempotent)
        mockQueryOne.mockResolvedValueOnce({ id: 'n1', node_type: 'synthesis', weight: 1, domain: 'test' });
        expect((await handleDemote({ nodeId: 'n1' })).alreadyDemoted).toBe(true);

        // non-possible node
        mockQueryOne.mockResolvedValueOnce({ id: 'n1', node_type: 'seed', weight: 1, domain: 'test' });
        expect((await handleDemote({ nodeId: 'n1' })).error).toContain('not a "possible"');

        // handleVoice — source not found
        mockQueryOne.mockResolvedValueOnce(null);
        expect((await handleVoice({ nodeId: 'x' })).error).toBe('Node not found');

        // handlePromote — tier blocked
        expect((await handlePromote({ nodeId: 'n1', reason: 'test', contributor: 'test' })).blocked).toBe(true);
    });
});


// =============================================================================
// 11. routes/api-registry.ts
// =============================================================================
describe('routes/api-registry.ts', () => {
    it('exports a router with routes', async () => {
        const mod = await import('../../routes/api-registry.js');
        expect(mod.default).toBeDefined();
        expect(mod.default.stack?.length).toBeGreaterThan(0);
    });
});


// =============================================================================
// 12. core/autotune/index.ts — idle run
// =============================================================================
describe('core/autotune/index.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('completes with no assigned models', async () => {
        tuneStateObj.status = 'idle';
        const { startAutoTune } = await import('../../core/autotune/index.js');
        await startAutoTune({ runsPerCombo: 1, maxCombos: 5 });
    });

    it('throws when already running', async () => {
        tuneStateObj.status = 'running';
        const { startAutoTune } = await import('../../core/autotune/index.js');
        await expect(startAutoTune({ runsPerCombo: 1, maxCombos: 5 })).rejects.toThrow('already running');
        tuneStateObj.status = 'idle';
    });
});


// =============================================================================
// 13. db/sqlite-backend-diag.ts
// =============================================================================
describe('db/sqlite-backend-diag.ts', () => {
    it('covers all APIs', async () => {
        const mod = await import('../../db/sqlite-backend-diag.js');
        mod.resetDbDiagnostics();

        expect(mod.isReadQuery('SELECT * FROM nodes')).toBe(true);
        expect(mod.isReadQuery('WITH cte AS (SELECT 1)')).toBe(true);
        expect(mod.isReadQuery('INSERT INTO nodes')).toBe(false);
        expect(mod.round2(1.234567)).toBe(1.23);
        expect(typeof mod.extractCaller()).toBe('string');

        mod.checkContention(false, 'Test');
        mod.checkContention(true, 'Test', 'SELECT 1');
        mod.recordBusyRetry();

        const h1 = mod.beginOp('SELECT 1', false);
        expect(mod.endOp(h1, 'SELECT 1', 0)).toBe(false);

        const h2 = mod.beginOp('INSERT', true);
        expect(mod.endOp(h2, 'INSERT', 0, 'TRANSACTION')).toBe(true);

        const h3 = mod.beginOp('[sys] SELECT', false);
        mod.endOp(h3, '[sys] SELECT', 0, '[sys] ');

        const diag = mod.getDbDiagnostics(42);
        expect(diag.stats.stmtCacheSize).toBe(42);
    });
});


// Section 14 (evm/codegen.ts) removed — codegen moved to lab servers


// =============================================================================
// 15. handlers/config-tune/analysis.ts
// =============================================================================
describe('handlers/config-tune/analysis.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('detectOverfitting with insufficient data', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ total: '5', created: '1' })
            .mockResolvedValueOnce({ total: '3', created: '1' });

        const { detectOverfitting } = await import('../../handlers/config-tune/analysis.js');
        const result = await detectOverfitting(7);
        expect(result.recommendation).toContain('Insufficient data');
    });

    it('computeBehavioralEntropy with single-change paths', async () => {
        mockSystemQuery.mockResolvedValueOnce([
            { config_path: 'engine.threshold', new_value: '0.5', metrics_before: '{}', created_at: new Date().toISOString() },
        ]);
        const { computeBehavioralEntropy } = await import('../../handlers/config-tune/analysis.js');
        const result = await computeBehavioralEntropy(['engine.threshold'], 7);
        expect(result.genuineOscillation).toContain('engine.threshold');
    });

    it('detectEnvironmentChanges handles missing tables', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('no table'));
        mockQueryOne.mockRejectedValue(new Error('no table'));

        const { detectEnvironmentChanges } = await import('../../handlers/config-tune/analysis.js');
        const result = await detectEnvironmentChanges(7);
        expect(result.environmentChanged).toBe(false);
    });
});


// =============================================================================
// 16. handlers/projects/crud.ts
// =============================================================================
describe('handlers/projects/crud.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers handleUpdate, handleEnsure, handleDelete, handleSave, handleCurrent edge cases', async () => {
        const mod = await import('../../handlers/projects/crud.js');

        // handleUpdate not found
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'default', projects: {} });
        expect((await mod.handleUpdate({ name: 'nonexistent' })).error).toContain('not found');

        // handleEnsure
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'myproject', projects: { myproject: {} } });
        const ensureResult = await mod.handleEnsure({});
        expect(ensureResult.switched).toBe(false);
        expect(ensureResult.project).toBe('myproject');

        // handleDelete active
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'active', projects: { active: {} } });
        expect((await mod.handleDelete({ name: 'active' })).error).toContain('currently active');

        // handleSave invalid name
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'default', projects: {} });
        expect((await mod.handleSave({ name: 'bad name!' })).error).toContain('Invalid project name');

        // handleCurrent null
        mockReadProjectsMeta.mockReturnValue({ currentProject: null, projects: {} });
        expect((await mod.handleCurrent()).currentProject).toBeNull();
    });
});


// =============================================================================
// 17. kb/pipeline/file-processing.ts
// =============================================================================
describe('kb/pipeline/file-processing.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers cleanCurationOutput, isLowValueCuration, archiveFileNodes, maybeFinishFolderProcessing', async () => {
        const mod = await import('../../kb/pipeline/file-processing.js');

        // cleanCurationOutput
        expect(mod.cleanCurationOutput('## Title\n**Bold** and *italic*')).not.toContain('**');
        const jsonResult = mod.cleanCurationOutput('{"summary": "This is a longer description of the content right here"}');
        expect(jsonResult).toContain('longer description');
        expect(mod.cleanCurationOutput('```json\ncode\n```\n- bullet')).not.toContain('```');

        // isLowValueCuration
        expect(mod.isLowValueCuration("I'm sorry, I can't process this")).toBe(true);
        expect(mod.isLowValueCuration("does not define any functions")).toBe(true);
        expect(mod.isLowValueCuration("only contains import statements")).toBe(true);
        expect(mod.isLowValueCuration("Detailed analysis with many patterns and functions")).toBe(false);

        // archiveFileNodes — empty
        mockQuery.mockResolvedValueOnce([]); // chunkNodes
        mockQuery.mockResolvedValueOnce([]); // fileRow
        expect(await mod.archiveFileNodes('file-1')).toBe(0);

        // maybeFinishFolderProcessing — still pending
        mockQuery.mockResolvedValueOnce([{ cnt: '5' }]);
        await mod.maybeFinishFolderProcessing('folder-1');
    });
});


// =============================================================================
// 18. core/abstract-patterns.ts
// =============================================================================
describe('core/abstract-patterns.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers createOrGetPattern (null embedding), searchPatterns, getPatternStats, findPatternSiblings', async () => {
        const mod = await import('../../core/abstract-patterns.js');

        // createOrGetPattern with null embedding
        mockQueryOne.mockResolvedValueOnce(null); // no existing
        mockQueryOne.mockResolvedValueOnce({ id: 'p1', name: 'test-pattern' }); // INSERT
        const result = await mod.createOrGetPattern('Test Pattern', 'A pattern', 'tester');
        expect(result.id).toBe('p1');

        // searchPatterns
        mockQuery.mockResolvedValueOnce([{ id: 'p1', name: 'test' }]);
        const sr = await mod.searchPatterns('test', 5);
        expect(sr).toHaveLength(1);

        // getPatternStats
        mockQuery.mockResolvedValueOnce([]);
        await mod.getPatternStats();

        // findPatternSiblings
        mockQuery.mockResolvedValueOnce([]);
        await mod.findPatternSiblings('node-1', true, 10);
    });
});


// =============================================================================
// 19. context/topics.ts
// =============================================================================
describe('context/topics.ts', () => {
    beforeEach(() => jest.clearAllMocks());

    it('covers extractKeywords, extractTopics with decay', async () => {
        const { extractKeywords, extractTopics } = await import('../../context/topics.js');

        // Empty input
        expect(extractKeywords('')).toEqual([]);
        expect(extractKeywords(null as any)).toEqual([]);

        // Frequency sorting
        const kw = extractKeywords('neural network model neural architecture neural');
        expect(kw[0].word).toBe('neural');
        expect(kw[0].count).toBe(3);

        // Topic accumulation
        const session = { topics: [] as any[], domains: [] as string[] };
        await extractTopics('machine learning model', session);
        expect(session.topics.length).toBeGreaterThan(0);

        // Decay old topics
        session.topics.push({ term: 'oldtopic', weight: 1.0, firstSeen: 0, lastSeen: 0 });
        await extractTopics('different content here today', session);
        const old = session.topics.find((t: any) => t.term === 'oldtopic');
        if (old) expect(old.weight).toBeLessThan(1.0);
    });
});


// semaphore.ts is tested separately in semaphore.test.ts
// Cannot test real semaphore behavior here because it's mocked at file level for assignments.ts
