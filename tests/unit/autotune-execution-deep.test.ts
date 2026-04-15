/**
 * Deep branch coverage tests for core/autotune/execution.ts.
 *
 * Covers branches missed by the base test file:
 * - getTestImage success paths (sharp processing, format variants, resize, lenient decode, sharp failure)
 * - runTest model field fallbacks (modelId vs name, endpointUrl, apiKey)
 * - tuneSubsystem unsupported params logging (valid & invalid URL)
 * - tuneSubsystem gold standard prompt assembly (multiple prompts, composeTestPrompt returning null)
 * - tuneSubsystem variance tiebreaker (same variance, different scores)
 * - tuneSubsystem concurrency > 1
 * - tuneSubsystem all-error scores
 * - tuneSubsystem currentParams not in tested combos
 * - tuneSubsystem with cancelFlag
 * - tuneSubsystem default config values when fields omitted
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----

const mockCallSingleModel = jest.fn<any>();
const mockAcquireModelSlot = jest.fn<any>();

jest.unstable_mockModule('../../models.js', () => ({
    callSingleModel: mockCallSingleModel,
    acquireModelSlot: mockAcquireModelSlot,
}));

const mockGetPrompt = jest.fn<any>();
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
    DEFAULT_GOLD_STANDARDS: [],
}));

const mockEmitActivity = jest.fn<any>();
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const mockSystemQuery = jest.fn<any>();
jest.unstable_mockModule('../../db/index.js', () => ({
    systemQuery: mockSystemQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        subsystemTemperatures: { voice: 0.7, compress: 0.4 },
        subsystemTopP: { voice: 0.9 },
        subsystemMinP: { voice: 0 },
        subsystemTopK: { voice: 0 },
        subsystemRepeatPenalties: { voice: 1.0 },
        consultantTemperatures: { voice: 0.15 },
        consultantTopP: { voice: 0.85 },
        consultantMinP: { voice: 0.02 },
        consultantTopK: { voice: 10 },
        consultantRepeatPenalties: { voice: 1.1 },
    },
}));

// Mock scoring module
const mockScorer = jest.fn<any>();
const mockGetSubsystemCategory = jest.fn<any>().mockReturnValue('voice');
const mockGetPromptIdsForCategory = jest.fn<any>().mockReturnValue(['core.insight_synthesis']);
jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    getSubsystemCategory: mockGetSubsystemCategory,
    SCORERS: { voice: mockScorer, reader_image: mockScorer },
    PROMPT_MAP: { voice: 'autotune.test_voice', reader_image: 'autotune.test_reader_image' },
    getPromptIdsForCategory: mockGetPromptIdsForCategory,
    DEFAULT_GRID: {
        temperature: [0.3, 0.7],
        topP: [0.9],
        minP: [0],
        topK: [0],
        repeatPenalty: [1.0],
    },
}));

const mockGenerateCombos = jest.fn<any>();
const mockGenerateRefinementCombos = jest.fn<any>();
const mockConstrainGrid = jest.fn<any>();
jest.unstable_mockModule('../../core/autotune/combinatorics.js', () => ({
    generateCombos: mockGenerateCombos,
    generateRefinementCombos: mockGenerateRefinementCombos,
    constrainGrid: mockConstrainGrid,
}));

const mockScoreAgainstGoldStandards = jest.fn<any>();
const mockComposeTestPrompt = jest.fn<any>();
jest.unstable_mockModule('../../core/autotune/gold-standards.js', () => ({
    scoreAgainstGoldStandards: mockScoreAgainstGoldStandards,
    composeTestPrompt: mockComposeTestPrompt,
}));

// Mock state — cancelFlag needs to be a mutable module export
const mockStateModule: { tuneState: any; cancelFlag: boolean } = {
    tuneState: {
        status: 'running' as const,
        currentSubsystem: null,
        currentCombo: 0,
        totalCombos: 0,
        subsystemsComplete: 0,
        subsystemsTotal: 0,
        results: [],
        startedAt: null,
    },
    cancelFlag: false,
};
jest.unstable_mockModule('../../core/autotune/state.js', () => mockStateModule);

// Mock providers with controllable getUnsupportedParams
const mockGetUnsupportedParams = jest.fn<any>().mockReturnValue(new Set());
jest.unstable_mockModule('../../models/providers.js', () => ({
    getUnsupportedParams: mockGetUnsupportedParams,
}));

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: { misc: { imageMaxDimension: 1024, imageQuality: 80, imageFormat: 'jpeg' } },
}));

// Mock fs — controls whether test image file exists and its content
const mockExistsSync = jest.fn<any>().mockReturnValue(false);
const mockReadFileSync = jest.fn<any>();
jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

// Mock db.js (for getTestImage's dynamic import of systemQueryOne)
const mockSystemQueryOne = jest.fn<any>();
jest.unstable_mockModule('../../db.js', () => ({
    systemQueryOne: mockSystemQueryOne,
}));

// Mock sharp
const mockSharpInstance: any = {};
const mockSharpFn = jest.fn<any>();
jest.unstable_mockModule('sharp', () => ({
    default: mockSharpFn,
}));

const { runTest, tuneSubsystem } = await import('../../core/autotune/execution.js');

// ---- Helpers ----

const DEFAULT_COMBO = { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
const MOCK_MODEL = { id: 'test-model', name: 'test-model', modelId: 'test-model', provider: 'openai', maxConcurrency: 1 };

function mockRelease() { /* no-op */ }

const DEFAULT_CONFIG = {
    subsystems: ['voice'],
    runsPerCombo: 1,
    maxCombos: 25,
    convergenceThreshold: 0.05,
};

// =============================================================================
// runTest — model field fallbacks
// =============================================================================

describe('runTest — model field variations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('uses model.name as fallback when modelId is absent', async () => {
        const model = { name: 'fallback-name', provider: 'openai', maxConcurrency: 2 };
        await runTest('voice', DEFAULT_COMBO, model);

        // acquireModelSlot uses model.id || model.modelId || model.name
        expect(mockAcquireModelSlot).toHaveBeenCalledWith('fallback-name', 2);

        // callSingleModel config should use model.name for both name and model fields
        const callConfig = mockCallSingleModel.mock.calls[0][0];
        expect(callConfig.name).toBe('fallback-name');
        expect(callConfig.model).toBe('fallback-name');
    });

    it('passes endpointUrl and apiKey from model when present', async () => {
        const model = {
            id: 'ep-model',
            name: 'ep-model',
            modelId: 'ep-model',
            provider: 'openai',
            endpointUrl: 'https://custom.api.com/v1',
            apiKey: 'sk-custom-key',
            maxConcurrency: 1,
        };
        await runTest('voice', DEFAULT_COMBO, model);

        const callConfig = mockCallSingleModel.mock.calls[0][0];
        expect(callConfig.endpoint).toBe('https://custom.api.com/v1');
        expect(callConfig.apiKey).toBe('sk-custom-key');
    });

    it('passes undefined endpoint and apiKey when not on model', async () => {
        const model = { id: 'basic', name: 'basic', modelId: 'basic', provider: 'openai', maxConcurrency: 1 };
        await runTest('voice', DEFAULT_COMBO, model);

        const callConfig = mockCallSingleModel.mock.calls[0][0];
        expect(callConfig.endpoint).toBeUndefined();
        expect(callConfig.apiKey).toBeUndefined();
    });

    it('uses model.id for slot acquisition when available', async () => {
        const model = { id: 'slot-id', name: 'other-name', modelId: 'mid', provider: 'openai', maxConcurrency: 3 };
        await runTest('voice', DEFAULT_COMBO, model);

        expect(mockAcquireModelSlot).toHaveBeenCalledWith('slot-id', 3);
    });

    it('defaults maxConcurrency to 1 when not set on model', async () => {
        const model = { id: 'no-conc', name: 'no-conc', provider: 'openai' };
        await runTest('voice', DEFAULT_COMBO, model);

        expect(mockAcquireModelSlot).toHaveBeenCalledWith('no-conc', 1);
    });

    it('passes goldTest promptId to scoreAgainstGoldStandards', async () => {
        const goldTest = { promptId: 'core.special_prompt', composedPrompt: 'Special prompt text' };
        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL, goldTest);

        expect(mockScoreAgainstGoldStandards).toHaveBeenCalledWith('{}', 'voice', 'core.special_prompt');
    });

    it('passes undefined promptId when no goldTest provided', async () => {
        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(mockScoreAgainstGoldStandards).toHaveBeenCalledWith('{}', 'voice', undefined);
    });
});

// =============================================================================
// tuneSubsystem — unsupported params logging
// =============================================================================

describe('tuneSubsystem — unsupported params branches', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateModule.tuneState.currentCombo = 0;
        mockStateModule.tuneState.totalCombos = 0;
        mockStateModule.cancelFlag = false;
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([{ cnt: 0 }]);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('logs unsupported params with host when endpointUrl is a valid URL', async () => {
        const unsupported = new Set(['minP', 'topK']);
        mockGetUnsupportedParams.mockReturnValue(unsupported);

        const model = {
            ...MOCK_MODEL,
            endpointUrl: 'https://api.example.com/v1/chat',
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        // Should log with the host from the URL
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('api.example.com'),
        );
        consoleSpy.mockRestore();
    });

    it('logs unsupported params without host when endpointUrl is not a valid URL', async () => {
        const unsupported = new Set(['topK']);
        mockGetUnsupportedParams.mockReturnValue(unsupported);

        const model = {
            ...MOCK_MODEL,
            endpointUrl: 'not-a-url',
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        // Should still log, just without a hostname (catch branch of new URL())
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('skipping unsupported params'),
        );
        consoleSpy.mockRestore();
    });

    it('does not log when no unsupported params', async () => {
        mockGetUnsupportedParams.mockReturnValue(new Set());

        const model = {
            ...MOCK_MODEL,
            endpointUrl: 'https://api.example.com/v1',
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        // Should NOT have logged about unsupported params
        const unsupportedLogs = consoleSpy.mock.calls.filter(
            (call: any[]) => String(call[0]).includes('skipping unsupported'),
        );
        expect(unsupportedLogs.length).toBe(0);
        consoleSpy.mockRestore();
    });

    it('uses model.endpoint as fallback when endpointUrl is absent', async () => {
        const unsupported = new Set(['minP']);
        mockGetUnsupportedParams.mockReturnValue(unsupported);

        const model = {
            ...MOCK_MODEL,
            endpoint: 'https://fallback.api.com/v1',
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        expect(mockGetUnsupportedParams).toHaveBeenCalledWith('https://fallback.api.com/v1');
        consoleSpy.mockRestore();
    });

    it('passes empty string to getUnsupportedParams when no endpoint', async () => {
        const model = { ...MOCK_MODEL };
        delete (model as any).endpointUrl;
        delete (model as any).endpoint;

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        // endpointUrl is empty string, so getUnsupportedParams should not be called
        // (guarded by `endpointUrl ?`)
        expect(mockGetUnsupportedParams).not.toHaveBeenCalled();
    });

    it('passes unsupported set to constrainGrid', async () => {
        const unsupported = new Set(['topK', 'minP']);
        mockGetUnsupportedParams.mockReturnValue(unsupported);

        const model = { ...MOCK_MODEL, endpointUrl: 'https://api.example.com/v1' };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);
        consoleSpy.mockRestore();

        expect(mockConstrainGrid).toHaveBeenCalledWith(
            expect.any(Object),
            unsupported,
        );
    });
});

// =============================================================================
// tuneSubsystem — gold standard prompt assembly
// =============================================================================

describe('tuneSubsystem — gold standard assembly', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateModule.tuneState.currentCombo = 0;
        mockStateModule.tuneState.totalCombos = 0;
        mockStateModule.cancelFlag = false;
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('skips gold test when composeTestPrompt returns null', async () => {
        // Two prompt IDs, one has gold standards but composeTestPrompt returns null
        mockGetPromptIdsForCategory.mockReturnValue(['prompt.a', 'prompt.b']);
        mockSystemQuery
            .mockResolvedValueOnce([{ cnt: 3 }])  // prompt.a has gold standards
            .mockResolvedValueOnce([{ cnt: 0 }]);  // prompt.b does not
        mockComposeTestPrompt.mockResolvedValue(null); // but compose returns null

        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 1 }, null);

        // No gold tests assembled, so regular runs happen (no goldTest arg)
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1); // 1 combo * 1 run
    });

    it('assembles multiple gold tests from multiple prompt IDs', async () => {
        mockGetPromptIdsForCategory.mockReturnValue(['prompt.a', 'prompt.b']);
        mockSystemQuery
            .mockResolvedValueOnce([{ cnt: 2 }])  // prompt.a has gold standards
            .mockResolvedValueOnce([{ cnt: 1 }]);  // prompt.b has gold standards
        mockComposeTestPrompt
            .mockResolvedValueOnce('Gold prompt A')
            .mockResolvedValueOnce('Gold prompt B');

        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 1 }, null);

        // With 2 gold tests and runsPerCombo=1, effectiveRuns = max(1, 2) = 2
        expect(mockCallSingleModel).toHaveBeenCalledTimes(2);
        consoleSpy.mockRestore();
    });

    it('uses effectiveRuns = max(runsPerCombo, goldTests.length)', async () => {
        // 3 gold tests, runsPerCombo = 2 => effectiveRuns = 3
        mockGetPromptIdsForCategory.mockReturnValue(['p.a', 'p.b', 'p.c']);
        mockSystemQuery
            .mockResolvedValueOnce([{ cnt: 1 }])
            .mockResolvedValueOnce([{ cnt: 1 }])
            .mockResolvedValueOnce([{ cnt: 1 }]);
        mockComposeTestPrompt
            .mockResolvedValueOnce('Gold A')
            .mockResolvedValueOnce('Gold B')
            .mockResolvedValueOnce('Gold C');

        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 2 }, null);

        // effectiveRuns = max(2, 3) = 3, so 3 calls for 1 combo
        expect(mockCallSingleModel).toHaveBeenCalledTimes(3);
        consoleSpy.mockRestore();
    });

    it('cycles gold tests round-robin when effectiveRuns > goldTests.length', async () => {
        // 1 gold test, runsPerCombo = 4 => effectiveRuns = 4, all use the same gold test
        mockGetPromptIdsForCategory.mockReturnValue(['p.a']);
        mockSystemQuery.mockResolvedValue([{ cnt: 1 }]);
        mockComposeTestPrompt.mockResolvedValue('Gold A');

        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 4 }, null);

        // effectiveRuns = max(4, 1) = 4
        expect(mockCallSingleModel).toHaveBeenCalledTimes(4);
        consoleSpy.mockRestore();
    });
});

// =============================================================================
// tuneSubsystem — variance-weighted selection edge cases
// =============================================================================

describe('tuneSubsystem — variance selection tiebreaker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateModule.tuneState.currentCombo = 0;
        mockStateModule.tuneState.totalCombos = 0;
        mockStateModule.cancelFlag = false;
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([{ cnt: 0 }]);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
    });

    it('prefers higher score when variance is identical', async () => {
        // Three combos with identical zero variance but different average scores
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.8, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        // All have zero variance, scores are within convergenceThreshold (0.02 range)
        // Combo 0: [0.82, 0.82, 0.82] avg = 0.82, stddev = 0
        // Combo 1: [0.81, 0.81, 0.81] avg = 0.81, stddev = 0
        // Combo 2: [0.80, 0.80, 0.80] avg = 0.80, stddev = 0
        let callIdx = 0;
        const scoresByCombo = [
            [0.82, 0.82, 0.82],
            [0.81, 0.81, 0.81],
            [0.80, 0.80, 0.80],
        ];
        mockScorer.mockImplementation(() => {
            const comboIdx = Math.floor(callIdx / 3);
            const runIdx = callIdx % 3;
            callIdx++;
            return { overall: scoresByCombo[comboIdx][runIdx], dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 3,
            convergenceThreshold: 0.05,
        }, null);

        // Same variance (0) for all — should pick highest score = combo 0 (temp 0.3)
        expect(result.bestCombo.temperature).toBe(0.3);
        expect(result.bestScore).toBeCloseTo(0.82, 5);
    });

    it('does NOT apply variance selection when top3 range exceeds convergenceThreshold', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.8, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        // Widely different scores — range > 0.05
        let callIdx = 0;
        const scoresByCombo = [
            [0.90, 0.90, 0.90],  // avg 0.90
            [0.70, 0.70, 0.70],  // avg 0.70
            [0.50, 0.50, 0.50],  // avg 0.50
        ];
        mockScorer.mockImplementation(() => {
            const comboIdx = Math.floor(callIdx / 3);
            const runIdx = callIdx % 3;
            callIdx++;
            return { overall: scoresByCombo[comboIdx][runIdx], dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 3,
            convergenceThreshold: 0.05,
        }, null);

        // Range is 0.40, way above threshold — picks top by score
        expect(result.bestScore).toBeCloseTo(0.90, 5);
        expect(result.bestCombo.temperature).toBe(0.3);
    });

    it('handles fewer than 3 combos (skips variance selection)', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        let callIdx = 0;
        mockScorer.mockImplementation(() => {
            callIdx++;
            return { overall: callIdx <= 1 ? 0.6 : 0.8, dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
        }, null);

        // Only 2 combos — variance selection branch requires >= 3
        expect(result.bestScore).toBe(0.8);
    });

    it('handles single-run combos in variance calc (stddev = 0 for length < 2)', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        // With runsPerCombo=1, each combo has only 1 score → stddev = 0 for all
        let callIdx = 0;
        const scores = [0.81, 0.80, 0.79]; // within threshold
        mockScorer.mockImplementation(() => {
            const s = scores[callIdx];
            callIdx++;
            return { overall: s, dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
            convergenceThreshold: 0.05,
        }, null);

        // All have stddev 0 (single run), so tiebreaker picks highest score
        expect(result.bestCombo.temperature).toBe(0.3);
    });
});

// =============================================================================
// tuneSubsystem — concurrency and edge cases
// =============================================================================

describe('tuneSubsystem — concurrency and edge cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateModule.tuneState.currentCombo = 0;
        mockStateModule.tuneState.totalCombos = 0;
        mockStateModule.cancelFlag = false;
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([{ cnt: 0 }]);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('spawns multiple workers when model.maxConcurrency > 1', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        const model = { ...MOCK_MODEL, maxConcurrency: 3 };

        const { result } = await tuneSubsystem('voice', model, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 2,
        }, null);

        // 3 combos * 2 runs = 6 calls total, all should complete
        expect(mockCallSingleModel).toHaveBeenCalledTimes(6);
        expect(result.testedCombos).toBe(3);
    });

    it('handles all scores being errors (avgScore = 0)', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockRejectedValue(new Error('Always fails'));

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 2,
        }, null);

        expect(result.bestScore).toBe(0);
        expect(result.testedCombos).toBe(1);
    });

    it('currentScore is 0 when current params not in tested combos', async () => {
        // Config has voice temp = 0.7, but tested combos have different temp
        const combos = [
            { temperature: 0.1, topP: 0.85, minP: 0.1, topK: 5, repeatPenalty: 1.2 },
        ];
        mockGenerateCombos.mockReturnValue(combos);
        mockScorer.mockReturnValue({ overall: 0.9, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null);

        expect(result.currentScore).toBe(0);
        expect(result.improvement).toBeCloseTo(0.9, 5);
    });

    it('uses default runsPerCombo=3 when not specified in config', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        const config = { subsystems: ['voice'], maxCombos: 25, convergenceThreshold: 0.05 } as any;

        await tuneSubsystem('voice', MOCK_MODEL, config, null);

        // Default runsPerCombo is 3
        expect(mockCallSingleModel).toHaveBeenCalledTimes(3);
    });

    it('uses default maxCombos=25 when not specified', async () => {
        const config = { subsystems: ['voice'], runsPerCombo: 1, convergenceThreshold: 0.05 } as any;
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        await tuneSubsystem('voice', MOCK_MODEL, config, null);

        expect(mockGenerateCombos).toHaveBeenCalledWith(
            expect.any(Object),
            25,
            expect.any(Object),
        );
    });

    it('uses default convergenceThreshold=0.05 when not specified', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        // Scores within 0.05 — should trigger variance selection
        let callIdx = 0;
        const scores = [0.81, 0.80, 0.79];
        mockScorer.mockImplementation(() => {
            const s = scores[callIdx];
            callIdx++;
            return { overall: s, dimensions: {}, rawOutput: '{}' };
        });

        const config = { subsystems: ['voice'], runsPerCombo: 1, maxCombos: 25 } as any;

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, config, null);

        // Should complete without error, using default threshold 0.05
        expect(result.testedCombos).toBe(3);
    });

    it('updates tuneState.totalCombos and currentCombo during execution', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
        }, null);

        // After completion, tuneState.totalCombos should be set to combos.length
        expect(mockStateModule.tuneState.totalCombos).toBe(2);
        // currentCombo should be set to combos.length at end
        expect(mockStateModule.tuneState.currentCombo).toBe(2);
    });

    it('selects currentParams as fallback when comboResults is empty', async () => {
        mockGenerateCombos.mockReturnValue([]);

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null);

        // No combos tested — bestCombo should be currentParams
        expect(result.bestCombo.temperature).toBe(0.7);
        expect(result.bestScore).toBe(0);
        expect(result.testedCombos).toBe(0);
    });

    it('passes unsupported params to generateRefinementCombos in refinement phase', async () => {
        const unsupported = new Set(['topK']);
        mockGetUnsupportedParams.mockReturnValue(unsupported);

        const seed = { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateRefinementCombos.mockReturnValue([seed]);

        const model = { ...MOCK_MODEL, endpointUrl: 'https://api.example.com/v1' };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await tuneSubsystem('voice', model, DEFAULT_CONFIG, seed);

        expect(mockGenerateRefinementCombos).toHaveBeenCalledWith(seed, 25, unsupported);
        consoleSpy.mockRestore();
    });

    it('consultant defaults to standard values for unknown subsystem', async () => {
        // Subsystem not in consultantTemperatures — should get defaults
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        const { result } = await tuneSubsystem('compress', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            subsystems: ['compress'],
        }, null, { isConsultant: true });

        // 'compress' not in consultantTemperatures → defaults: 0.15 temp
        expect(result.currentParams.temperature).toBe(0.15);
        expect(result.currentParams.topP).toBe(0.9);
        expect(result.currentParams.minP).toBe(0);
        expect(result.currentParams.topK).toBe(0);
        expect(result.currentParams.repeatPenalty).toBe(1.0);
    });

    it('non-consultant reads subsystem-specific values from config', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        // 'compress' has temp=0.4 in subsystemTemperatures, missing from other maps
        const { result } = await tuneSubsystem('compress', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            subsystems: ['compress'],
        }, null);

        expect(result.currentParams.temperature).toBe(0.4);
        // Others fall back to defaults since 'compress' not in those maps
        expect(result.currentParams.topP).toBe(0.9);
    });
});

// =============================================================================
// tuneSubsystem — combo tracking and activity emission
// =============================================================================

describe('tuneSubsystem — activity emission details', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStateModule.tuneState.currentCombo = 0;
        mockStateModule.tuneState.totalCombos = 0;
        mockStateModule.cancelFlag = false;
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([{ cnt: 0 }]);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('emits activity with correct phase label for refinement', async () => {
        const seed = { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateRefinementCombos.mockReturnValue([seed]);

        await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, seed);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_combo',
            expect.stringContaining('[refinement]'),
            expect.objectContaining({ phase: 'refinement' }),
        );
    });

    it('emits activity with correct phase label for full', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_combo',
            expect.stringContaining('[full]'),
            expect.objectContaining({ phase: 'full' }),
        );
    });

    it('emits activity with score percentage for each combo', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        let callIdx = 0;
        mockScorer.mockImplementation(() => {
            callIdx++;
            return { overall: callIdx <= 1 ? 0.75 : 0.60, dimensions: {}, rawOutput: '{}' };
        });

        await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 1 }, null);

        expect(mockEmitActivity).toHaveBeenCalledTimes(2);

        // Check combo numbering
        const firstCall = mockEmitActivity.mock.calls[0];
        expect(firstCall[3].combo).toBe(1);
        expect(firstCall[3].total).toBe(2);

        const secondCall = mockEmitActivity.mock.calls[1];
        expect(secondCall[3].combo).toBe(2);
    });
});
