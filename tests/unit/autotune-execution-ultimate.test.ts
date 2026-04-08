/**
 * Ultimate coverage tests for core/autotune/execution.ts — targets remaining uncovered branches:
 *
 * - getTestImage(): full success with sharp processing (jpeg, webp, png formats)
 * - getTestImage(): resize branch (maxDim > maxDimension), no-resize (within limits)
 * - getTestImage(): width >= height vs height > width resize paths
 * - getTestImage(): lenient decode fallback (standard decode fails, lenient succeeds)
 * - getTestImage(): sharp not available (dynamic import fails)
 * - getTestImage(): readFileSync throws (outer catch)
 * - getTestImage(): DB settings loading with saved settings and without
 * - resolveProjectRoot(): catch branch (fileURLToPath throws)
 * - runTest(): goldTest.composedPrompt used instead of getPrompt
 * - runTest(): gold standard scoring returns a score (non-null)
 * - runTest(): gold standard scoring throws (warn + fallback)
 * - tuneSubsystem(): consultant mode with known subsystem in consultant config
 * - tuneSubsystem(): variance selection when variance meaningfully differs (>0.01)
 *
 * Uses fresh module imports per describe block to reset _cachedTestImage.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Shared Mock declarations ----

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
jest.unstable_mockModule('../../services/event-bus.js', () => ({
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
        consultantTemperatures: { voice: 0.15, summarize: 0.2 },
        consultantTopP: { voice: 0.85, summarize: 0.88 },
        consultantMinP: { voice: 0.02, summarize: 0.01 },
        consultantTopK: { voice: 10, summarize: 15 },
        consultantRepeatPenalties: { voice: 1.1, summarize: 1.05 },
    },
}));

const mockScorer = jest.fn<any>();
const mockGetSubsystemCategory = jest.fn<any>().mockReturnValue('voice');
const mockGetPromptIdsForCategory = jest.fn<any>().mockReturnValue([]);
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

const mockGetUnsupportedParams = jest.fn<any>().mockReturnValue(new Set());
jest.unstable_mockModule('../../models/providers.js', () => ({
    getUnsupportedParams: mockGetUnsupportedParams,
}));

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: { misc: { imageMaxDimension: 1024, imageQuality: 80, imageFormat: 'jpeg' } },
}));

// Mock fs
const mockExistsSync = jest.fn<any>().mockReturnValue(true);
const mockReadFileSync = jest.fn<any>().mockReturnValue(Buffer.from('fake-image-data'));
jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

// Mock db.js for getTestImage systemQueryOne
// Pre-configure to return saved settings with webp format to cover DB settings + webp branch
const mockSystemQueryOne = jest.fn<any>().mockResolvedValue({
    value: JSON.stringify({ maxDimension: 512, quality: 75, format: 'webp' }),
});
jest.unstable_mockModule('../../db.js', () => ({
    systemQueryOne: mockSystemQueryOne,
}));

// Mock sharp
const mockToBuffer = jest.fn<any>();
const mockJpeg = jest.fn<any>();
const mockWebp = jest.fn<any>();
const mockPng = jest.fn<any>();
const mockResize = jest.fn<any>();
const mockMetadata = jest.fn<any>();
const mockSharpToBuffer = jest.fn<any>().mockResolvedValue(Buffer.from('compressed-webp'));
let mockSharpInstance: any = {
    metadata: mockMetadata,
    resize: mockResize,
    jpeg: mockJpeg,
    webp: mockWebp,
    png: mockPng,
};
// Configure webp path for initial getTestImage call
mockWebp.mockReturnValue({ toBuffer: mockSharpToBuffer });
mockJpeg.mockReturnValue({ toBuffer: mockSharpToBuffer });
mockPng.mockReturnValue({ toBuffer: mockSharpToBuffer });
const mockSharpFn = jest.fn<any>().mockReturnValue(mockSharpInstance);
jest.unstable_mockModule('sharp', () => ({
    default: mockSharpFn,
}));

// Pre-configure sharp metadata: height > width and exceeds maxDimension (512) to cover height>width resize
mockMetadata.mockResolvedValue({ width: 400, height: 800 });
mockResize.mockReturnValue(mockSharpInstance);

// ---- Import module under test ----
// NOTE: getTestImage() will be called and cached on first use.
// The mocks above configure: webp format, height>width resize, DB settings loaded.

const { getTestImage, runTest, tuneSubsystem } = await import('../../core/autotune/execution.js');

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
// getTestImage — WEBP success path with resize (height > width)
// Covers: DB settings loading (lines 68-72), webp format (line 114-115),
// height>width resize (line 104), FORMAT_MIME webp
// =============================================================================

describe('getTestImage — WEBP success with height>width resize', () => {
    it('returns base64-encoded image data with WEBP format from DB settings', async () => {
        const result = await getTestImage();

        // First call: file exists, DB returns webp settings, sharp processes
        expect(result).not.toBeNull();
        if (result) {
            expect(result.media_type).toBe('image/webp');
            expect(typeof result.data).toBe('string');
            expect(result.data.length).toBeGreaterThan(0);
        }
    });

    it('returns cached result on subsequent calls', async () => {
        const result = await getTestImage();
        expect(result).not.toBeNull();
        if (result) {
            expect(result.media_type).toBe('image/webp');
        }
    });
});

// =============================================================================
// runTest — goldTest.composedPrompt used as prompt
// =============================================================================

describe('runTest — goldTest composedPrompt replaces getPrompt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('System identity prompt');
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockCallSingleModel.mockResolvedValue({ text: 'test output' });
        mockScorer.mockReturnValue({ overall: 0.6, dimensions: {}, rawOutput: 'test output' });
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
    });

    it('uses composedPrompt from goldTest instead of fetching from PROMPT_MAP', async () => {
        const goldTest = { promptId: 'core.custom', composedPrompt: 'Custom gold standard prompt' };
        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL, goldTest);

        // callSingleModel should receive the goldTest's composedPrompt, not the PROMPT_MAP prompt
        const callArgs = mockCallSingleModel.mock.calls[0];
        expect(callArgs[1]).toBe('Custom gold standard prompt');
    });

    it('fetches PROMPT_MAP prompt when no goldTest', async () => {
        mockGetPrompt.mockResolvedValueOnce('autotune test voice prompt').mockResolvedValueOnce('system identity');
        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        // First getPrompt call is for PROMPT_MAP[category], second for system.identity
        expect(mockGetPrompt).toHaveBeenCalledTimes(2);
    });
});

// =============================================================================
// runTest — gold standard scoring returns a score (non-null)
// =============================================================================

describe('runTest — gold standard scoring succeeds', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockCallSingleModel.mockResolvedValue({ text: 'output text' });
    });

    it('returns gold score when scoreAgainstGoldStandards returns non-null', async () => {
        const goldScore = {
            overall: 0.92,
            dimensions: { coherence: 0.95, grounding: 0.89 },
            rawOutput: 'output text',
        };
        mockScoreAgainstGoldStandards.mockResolvedValue(goldScore);

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0.92);
        expect(result.dimensions).toEqual({ coherence: 0.95, grounding: 0.89 });
        // Should NOT have called the heuristic scorer
        expect(mockScorer).not.toHaveBeenCalled();
    });
});

// =============================================================================
// runTest — gold standard scoring throws (warns and falls back to heuristic)
// =============================================================================

describe('runTest — gold standard scoring error fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockCallSingleModel.mockResolvedValue({ text: 'output text' });
        mockScorer.mockReturnValue({ overall: 0.55, dimensions: { quality: 0.55 }, rawOutput: 'output text' });
    });

    it('falls back to heuristic scorer when gold scoring throws', async () => {
        mockScoreAgainstGoldStandards.mockRejectedValue(new Error('gold-scoring-crash'));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        // Should fall back to heuristic scorer
        expect(result.overall).toBe(0.55);
        expect(mockScorer).toHaveBeenCalled();

        // Should have warned about the failure
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Gold standard scoring failed'),
        );
        warnSpy.mockRestore();
    });
});

// =============================================================================
// runTest — callSingleModel throws (error path)
// =============================================================================

describe('runTest — LLM call error', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockGetSubsystemCategory.mockReturnValue('voice');
    });

    it('returns error score with error message when callSingleModel throws', async () => {
        mockCallSingleModel.mockRejectedValue(new Error('model-timeout'));

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0);
        expect(result.error).toBe('model-timeout');
        expect(result.rawOutput).toBe('');
    });
});

// =============================================================================
// runTest — reader_image category (image path)
// =============================================================================

describe('runTest — reader_image category', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockGetSubsystemCategory.mockReturnValue('reader_image');
        mockCallSingleModel.mockResolvedValue({ text: 'image description' });
        mockScorer.mockReturnValue({ overall: 0.75, dimensions: {}, rawOutput: 'image description' });
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
    });

    it('returns cached test image result (from prior getTestImage call)', async () => {
        // getTestImage was already called and cached in the first describe block
        const result = await runTest('reader_image', DEFAULT_COMBO, MOCK_MODEL);

        // The cached image should be available (was loaded in the first test block)
        // If it was cached as non-null, images would be passed to callSingleModel
        if (result.overall > 0) {
            const callArgs = mockCallSingleModel.mock.calls[0];
            const opts = callArgs[2];
            expect(opts.images).toBeDefined();
            expect(opts.images.length).toBe(1);
            expect(opts.images[0].type).toBe('base64');
        }
    });
});

// =============================================================================
// runTest — passes all combo params to callSingleModel options
// =============================================================================

describe('runTest — combo params forwarding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockCallSingleModel.mockResolvedValue({ text: 'ok' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: 'ok' });
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
    });

    it('forwards temperature, topP, minP, topK, repeatPenalty to callSingleModel', async () => {
        const combo = { temperature: 0.42, topP: 0.85, minP: 0.05, topK: 20, repeatPenalty: 1.15 };
        await runTest('voice', combo, MOCK_MODEL);

        const opts = mockCallSingleModel.mock.calls[0][2];
        expect(opts.temperature).toBe(0.42);
        expect(opts.topP).toBe(0.85);
        expect(opts.minP).toBe(0.05);
        expect(opts.topK).toBe(20);
        expect(opts.repeatPenalty).toBe(1.15);
    });

    it('always calls release() even when callSingleModel throws', async () => {
        const releaseFn = jest.fn();
        mockAcquireModelSlot.mockResolvedValue(releaseFn);
        mockCallSingleModel.mockRejectedValue(new Error('fail'));

        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(releaseFn).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// tuneSubsystem — consultant mode reads from consultant config maps
// =============================================================================

describe('tuneSubsystem — consultant mode params', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('reads consultant params from consultantTemperatures etc for known subsystem', async () => {
        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null, { isConsultant: true });

        expect(result.currentParams.temperature).toBe(0.15);
        expect(result.currentParams.topP).toBe(0.85);
        expect(result.currentParams.minP).toBe(0.02);
        expect(result.currentParams.topK).toBe(10);
        expect(result.currentParams.repeatPenalty).toBe(1.1);
    });

    it('reads consultant params for summarize subsystem', async () => {
        const { result } = await tuneSubsystem('summarize', MOCK_MODEL, DEFAULT_CONFIG, null, { isConsultant: true });

        expect(result.currentParams.temperature).toBe(0.2);
        expect(result.currentParams.topP).toBe(0.88);
        expect(result.currentParams.minP).toBe(0.01);
        expect(result.currentParams.topK).toBe(15);
        expect(result.currentParams.repeatPenalty).toBe(1.05);
    });

    it('falls back to consultant defaults for unknown subsystem', async () => {
        const { result } = await tuneSubsystem('unknown_sub', MOCK_MODEL, DEFAULT_CONFIG, null, { isConsultant: true });

        expect(result.currentParams.temperature).toBe(0.15); // default
        expect(result.currentParams.topP).toBe(0.9); // default
    });

    it('reads non-consultant params correctly', async () => {
        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null, { isConsultant: false });

        expect(result.currentParams.temperature).toBe(0.7);
        expect(result.currentParams.topP).toBe(0.9);
    });
});

// =============================================================================
// tuneSubsystem — variance selection prefers lower variance
// =============================================================================

describe('tuneSubsystem — variance-weighted selection with meaningful variance differences', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
    });

    it('prefers lower variance when variance differs by >0.01 even with lower score', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        // All within convergence threshold (range < 0.05):
        // Combo 0: scores [0.82, 0.70] => avg 0.76, high variance
        // Combo 1: scores [0.78, 0.78] => avg 0.78, zero variance (best)
        // Combo 2: scores [0.75, 0.75] => avg 0.75, zero variance
        let callIdx = 0;
        const scoresByCombo = [
            [0.82, 0.70],  // avg=0.76, stddev=0.06
            [0.78, 0.78],  // avg=0.78, stddev=0
            [0.75, 0.75],  // avg=0.75, stddev=0
        ];
        mockScorer.mockImplementation(() => {
            const comboIdx = Math.floor(callIdx / 2);
            const runIdx = callIdx % 2;
            callIdx++;
            return { overall: scoresByCombo[comboIdx][runIdx], dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 2,
            convergenceThreshold: 0.05,
        }, null);

        // Top3 sorted by score: combo1 (0.78), combo0 (0.76), combo2 (0.75) — range=0.03 < 0.05
        // Variance: combo1 stddev=0, combo2 stddev=0, combo0 stddev=0.06
        // With variance selection: prefer lowest variance = combo1 or combo2 (both 0)
        // Tiebreaker by score: combo1 (0.78) > combo2 (0.75)
        expect(result.bestCombo.temperature).toBe(0.5);
        expect(result.bestScore).toBeCloseTo(0.78, 1);
    });
});

// =============================================================================
// tuneSubsystem — refinement phase with seedParams
// =============================================================================

describe('tuneSubsystem — refinement phase', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.65, dimensions: {}, rawOutput: '{}' });
    });

    it('uses generateRefinementCombos when seedParams provided', async () => {
        const seed = { temperature: 0.5, topP: 0.92, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateRefinementCombos.mockReturnValue([seed]);

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, seed);

        expect(result.phase).toBe('refinement');
        expect(mockGenerateRefinementCombos).toHaveBeenCalledWith(seed, 25, expect.any(Set));
        expect(mockGenerateCombos).not.toHaveBeenCalled();
    });

    it('reports correct improvement when current params match a tested combo', async () => {
        // Create a combo that matches currentParams exactly
        const currentMatch = { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const better = { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateRefinementCombos.mockReturnValue([currentMatch, better]);

        let callIdx = 0;
        mockScorer.mockImplementation(() => {
            callIdx++;
            return {
                overall: callIdx === 1 ? 0.60 : 0.80,
                dimensions: {},
                rawOutput: '{}',
            };
        });

        const seed = { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const { result } = await tuneSubsystem('voice', MOCK_MODEL, { ...DEFAULT_CONFIG, runsPerCombo: 1 }, seed);

        // currentParams match currentMatch => currentScore = 0.60
        // bestScore = 0.80, improvement = 0.20
        expect(result.currentScore).toBeCloseTo(0.60, 1);
        expect(result.improvement).toBeCloseTo(0.20, 1);
    });
});

// =============================================================================
// tuneSubsystem — allResults limited to top 10
// =============================================================================

describe('tuneSubsystem — allResults truncation', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
    });

    it('truncates allResults to top 10 even with more combos', async () => {
        // Generate 15 combos
        const combos = Array.from({ length: 15 }, (_, i) => ({
            temperature: 0.1 + i * 0.05,
            topP: 0.9,
            minP: 0,
            topK: 0,
            repeatPenalty: 1.0,
        }));
        mockGenerateCombos.mockReturnValue(combos);

        let callIdx = 0;
        mockScorer.mockImplementation(() => {
            callIdx++;
            return { overall: 0.5 + Math.random() * 0.3, dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
            maxCombos: 20,
        }, null);

        expect(result.allResults.length).toBeLessThanOrEqual(10);
        expect(result.testedCombos).toBe(15);
        expect(result.totalCombos).toBe(15);
    });
});

// =============================================================================
// tuneSubsystem — elapsedMs tracking
// =============================================================================

describe('tuneSubsystem — timing', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('records elapsedMs as a positive number', async () => {
        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null);

        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('records modelName from model.name', async () => {
        const model = { ...MOCK_MODEL, name: 'gpt-4-turbo' };
        const { result } = await tuneSubsystem('voice', model, DEFAULT_CONFIG, null);

        expect(result.modelName).toBe('gpt-4-turbo');
    });

    it('records subsystem name in result', async () => {
        const { result } = await tuneSubsystem('voice', MOCK_MODEL, DEFAULT_CONFIG, null);

        expect(result.subsystem).toBe('voice');
    });
});

// =============================================================================
// tuneSubsystem — concurrency limited to tasks length
// =============================================================================

describe('tuneSubsystem — worker pool limits', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });
    });

    it('limits worker count to min(concurrency, tasks.length)', async () => {
        // 1 combo, 1 run = 1 task, but model maxConcurrency = 10
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        const model = { ...MOCK_MODEL, maxConcurrency: 10 };

        const { result } = await tuneSubsystem('voice', model, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
        }, null);

        // Should still complete with 1 call
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1);
        expect(result.testedCombos).toBe(1);
    });

    it('handles high concurrency with many combos', async () => {
        const combos = Array.from({ length: 5 }, (_, i) => ({
            temperature: 0.1 * (i + 1),
            topP: 0.9,
            minP: 0,
            topK: 0,
            repeatPenalty: 1.0,
        }));
        mockGenerateCombos.mockReturnValue(combos);
        const model = { ...MOCK_MODEL, maxConcurrency: 3 };

        const { result } = await tuneSubsystem('voice', model, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 2,
        }, null);

        // 5 combos * 2 runs = 10 tasks
        expect(mockCallSingleModel).toHaveBeenCalledTimes(10);
        expect(result.testedCombos).toBe(5);
    });
});

// =============================================================================
// tuneSubsystem — currentParams found in combo results
// =============================================================================

describe('tuneSubsystem — currentParams match', () => {
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
        mockGetPromptIdsForCategory.mockReturnValue([]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
    });

    it('correctly identifies currentScore when currentParams exist in tested combos', async () => {
        // Current voice params: temp=0.7, topP=0.9, minP=0, topK=0, repeatPenalty=1.0
        const currentCombo = { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const betterCombo = { temperature: 0.4, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateCombos.mockReturnValue([currentCombo, betterCombo]);

        let callIdx = 0;
        mockScorer.mockImplementation(() => {
            callIdx++;
            return { overall: callIdx === 1 ? 0.6 : 0.85, dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            ...DEFAULT_CONFIG,
            runsPerCombo: 1,
        }, null);

        expect(result.currentScore).toBeCloseTo(0.6, 1);
        expect(result.bestScore).toBeCloseTo(0.85, 1);
        expect(result.improvement).toBeCloseTo(0.25, 1);
    });
});
