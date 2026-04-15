/**
 * Tests for core/autotune/execution.ts — getTestImage, runTest, tuneSubsystem.
 *
 * All external dependencies (models, prompts, DB, event-bus, config, state,
 * gold-standards, combinatorics, scoring) are mocked.
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
        subsystemTemperatures: { voice: 0.7 },
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

// Mock scoring module — we control what getSubsystemCategory, SCORERS, etc. return
const mockScorer = jest.fn<any>();
const mockGetSubsystemCategory = jest.fn<any>().mockReturnValue('voice');
const mockGetPromptIdsForCategory = jest.fn<any>().mockReturnValue(['core.insight_synthesis']);
jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    getSubsystemCategory: mockGetSubsystemCategory,
    SCORERS: { voice: mockScorer },
    PROMPT_MAP: { voice: 'autotune.test_voice' },
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

// Mock state — make tuneState writable
const mockTuneState = {
    status: 'running' as const,
    currentSubsystem: null,
    currentCombo: 0,
    totalCombos: 0,
    subsystemsComplete: 0,
    subsystemsTotal: 0,
    results: [],
    startedAt: null,
};
jest.unstable_mockModule('../../core/autotune/state.js', () => ({
    tuneState: mockTuneState,
    cancelFlag: false,
}));

// Mock providers
jest.unstable_mockModule('../../models/providers.js', () => ({
    getUnsupportedParams: jest.fn<any>().mockReturnValue(new Set()),
}));

// Mock fs and path for getTestImage
jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: jest.fn<any>().mockReturnValue(false),
        readFileSync: jest.fn<any>(),
    },
    existsSync: jest.fn<any>().mockReturnValue(false),
    readFileSync: jest.fn<any>().mockReturnValue('{}'),
}));

const { runTest, getTestImage, tuneSubsystem } = await import('../../core/autotune/execution.js');

// ---- Helpers ----

const DEFAULT_COMBO = { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
const MOCK_MODEL = { id: 'test-model', name: 'test-model', modelId: 'test-model', provider: 'openai', maxConcurrency: 1 };

function mockRelease() { /* no-op */ }

// =============================================================================
// getTestImage
// =============================================================================

describe('getTestImage', () => {
    it('returns null when test image file does not exist', async () => {
        const result = await getTestImage();
        expect(result).toBeNull();
    });
});

// =============================================================================
// runTest
// =============================================================================

describe('runTest', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt content');
        mockScoreAgainstGoldStandards.mockResolvedValue(null); // No gold standards, fall through
        // Re-apply defaults cleared by resetAllMocks
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
    });

    it('calls callSingleModel with correct parameters and scores result', async () => {
        const llmOutput = JSON.stringify({ insight: 'A meaningful cross-domain insight about synthesis.' });
        mockCallSingleModel.mockResolvedValue({ text: llmOutput });
        mockScorer.mockReturnValue({ overall: 0.85, dimensions: { test: 1 }, rawOutput: llmOutput });

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(mockAcquireModelSlot).toHaveBeenCalledWith('test-model', 1);
        expect(mockCallSingleModel).toHaveBeenCalledTimes(1);
        expect(mockCallSingleModel.mock.calls[0][1]).toBe('Test prompt content');
        expect(mockCallSingleModel.mock.calls[0][2]).toMatchObject({
            temperature: 0.7,
            topP: 0.9,
        });
        expect(result.overall).toBe(0.85);
    });

    it('returns error score when callSingleModel throws', async () => {
        mockCallSingleModel.mockRejectedValue(new Error('API timeout'));

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0);
        expect(result.error).toBe('API timeout');
        expect(result.rawOutput).toBe('');
    });

    it('uses gold standard score when available', async () => {
        const goldScore = { overall: 0.92, dimensions: { goldTier1: 0.95 }, rawOutput: 'output' };
        mockCallSingleModel.mockResolvedValue({ text: 'output' });
        mockScoreAgainstGoldStandards.mockResolvedValue(goldScore);

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0.92);
        // Heuristic scorer should NOT be called when gold standard succeeds
        expect(mockScorer).not.toHaveBeenCalled();
    });

    it('falls back to heuristic when gold standard scoring throws', async () => {
        mockCallSingleModel.mockResolvedValue({ text: 'output' });
        mockScoreAgainstGoldStandards.mockRejectedValue(new Error('Embedding failed'));
        mockScorer.mockReturnValue({ overall: 0.6, dimensions: {}, rawOutput: 'output' });

        const result = await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0.6);
        expect(mockScorer).toHaveBeenCalled();
    });

    it('uses gold test composed prompt when provided', async () => {
        mockCallSingleModel.mockResolvedValue({ text: 'output' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: 'output' });

        const goldTest = { promptId: 'core.insight_synthesis', composedPrompt: 'Custom gold test prompt' };
        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL, goldTest);

        // The composed prompt from goldTest should be used instead of getPrompt result
        expect(mockCallSingleModel.mock.calls[0][1]).toBe('Custom gold test prompt');
    });

    it('always releases the model slot even on error', async () => {
        const releaseFn = jest.fn();
        mockAcquireModelSlot.mockResolvedValue(releaseFn);
        mockCallSingleModel.mockRejectedValue(new Error('fail'));

        await runTest('voice', DEFAULT_COMBO, MOCK_MODEL);

        expect(releaseFn).toHaveBeenCalledTimes(1);
    });

    it('returns error score for reader_image when test image is missing', async () => {
        mockGetSubsystemCategory.mockReturnValue('reader_image');
        mockAcquireModelSlot.mockResolvedValue(mockRelease);

        const result = await runTest('reader_image', DEFAULT_COMBO, MOCK_MODEL);

        expect(result.overall).toBe(0);
        expect(result.error).toContain('Test image not found');
    });

    it('passes combo parameters to callSingleModel options', async () => {
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0, dimensions: {}, rawOutput: '{}' });

        const combo = { temperature: 0.3, topP: 0.85, minP: 0.05, topK: 20, repeatPenalty: 1.2 };
        await runTest('voice', combo, MOCK_MODEL);

        const callOpts = mockCallSingleModel.mock.calls[0][2];
        expect(callOpts.temperature).toBe(0.3);
        expect(callOpts.topP).toBe(0.85);
        expect(callOpts.minP).toBe(0.05);
        expect(callOpts.topK).toBe(20);
        expect(callOpts.repeatPenalty).toBe(1.2);
    });
});

// =============================================================================
// tuneSubsystem
// =============================================================================

describe('tuneSubsystem', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTuneState.currentCombo = 0;
        mockTuneState.totalCombos = 0;

        mockAcquireModelSlot.mockResolvedValue(mockRelease);
        mockGetPrompt.mockResolvedValue('Test prompt');
        mockScoreAgainstGoldStandards.mockResolvedValue(null);
        mockSystemQuery.mockResolvedValue([{ cnt: 0 }]);
        mockConstrainGrid.mockImplementation((grid: any) => grid);
        // Re-apply defaults cleared by resetAllMocks
        mockGetSubsystemCategory.mockReturnValue('voice');
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
    });

    it('runs full phase when no seedParams provided', async () => {
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.6, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        expect(result.phase).toBe('full');
        expect(result.subsystem).toBe('voice');
        expect(result.modelName).toBe('test-model');
        expect(result.testedCombos).toBe(2);
        expect(mockGenerateCombos).toHaveBeenCalled();
        expect(mockGenerateRefinementCombos).not.toHaveBeenCalled();
    });

    it('runs refinement phase when seedParams provided', async () => {
        const seed = { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const combos = [seed];
        mockGenerateRefinementCombos.mockReturnValue(combos);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.7, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, seed);

        expect(result.phase).toBe('refinement');
        expect(mockGenerateRefinementCombos).toHaveBeenCalledWith(seed, 25, expect.any(Set));
    });

    it('calculates improvement as bestScore - currentScore', async () => {
        const currentCombo = { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const betterCombo = { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 };
        mockGenerateCombos.mockReturnValue([currentCombo, betterCombo]);

        let callCount = 0;
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockImplementation(() => {
            callCount++;
            // First combo (currentCombo) gets 0.5, second (betterCombo) gets 0.8
            return { overall: callCount <= 1 ? 0.5 : 0.8, dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        expect(result.bestScore).toBe(0.8);
        expect(result.currentScore).toBe(0.5);
        expect(result.improvement).toBeCloseTo(0.3, 5);
    });

    it('uses consultant params when isConsultant is true', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null, { isConsultant: true });

        // currentParams should reflect consultant values
        expect(result.currentParams.temperature).toBe(0.15);
        expect(result.currentParams.topP).toBe(0.85);
    });

    it('emits activity for each combo result', async () => {
        const combos = [DEFAULT_COMBO];
        mockGenerateCombos.mockReturnValue(combos);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.6, dimensions: {}, rawOutput: '{}' });

        await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_combo',
            expect.stringContaining('voice'),
            expect.objectContaining({ subsystem: 'voice', combo: 1 }),
        );
    });

    it('returns allResults capped at top 10', async () => {
        const combos = Array.from({ length: 15 }, (_, i) => ({
            temperature: 0.1 * (i + 1), topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0,
        }));
        mockGenerateCombos.mockReturnValue(combos);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        expect(result.allResults.length).toBeLessThanOrEqual(10);
    });

    it('handles error scores by filtering them from average', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);

        // First call fails, second succeeds (runsPerCombo=2)
        let callNum = 0;
        mockCallSingleModel.mockImplementation(async () => {
            callNum++;
            if (callNum === 1) throw new Error('Transient failure');
            return { text: '{}' };
        });
        mockScorer.mockReturnValue({ overall: 0.8, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 2,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        // Only the successful run should contribute to average
        expect(result.bestScore).toBe(0.8);
    });

    it('includes gold standard prompts when DB has entries', async () => {
        mockSystemQuery.mockResolvedValue([{ cnt: 2 }]);
        mockComposeTestPrompt.mockResolvedValue('Composed gold prompt');
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.7, dimensions: {}, rawOutput: '{}' });

        await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        // With gold standards, runTest is called with goldTest parameter
        expect(mockCallSingleModel).toHaveBeenCalled();
    });

    it('records elapsed time', async () => {
        mockGenerateCombos.mockReturnValue([DEFAULT_COMBO]);
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockReturnValue({ overall: 0.5, dimensions: {}, rawOutput: '{}' });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 1,
            maxCombos: 25,
            convergenceThreshold: 0.05,
        }, null);

        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('selects lowest-variance combo when top scores converge', async () => {
        // Three combos with nearly identical scores but different variance
        const combos = [
            { temperature: 0.3, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.5, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        ];
        mockGenerateCombos.mockReturnValue(combos);

        let callIdx = 0;
        // Runs per combo = 3, so 9 calls total
        // Combo 0: scores [0.80, 0.80, 0.80] — avg 0.80, stddev 0
        // Combo 1: scores [0.81, 0.60, 0.99] — avg 0.80, stddev ~0.16
        // Combo 2: scores [0.79, 0.79, 0.79] — avg 0.79, stddev 0
        const scoresByCombo = [
            [0.80, 0.80, 0.80],
            [0.81, 0.60, 0.99],
            [0.79, 0.79, 0.79],
        ];
        mockCallSingleModel.mockResolvedValue({ text: '{}' });
        mockScorer.mockImplementation(() => {
            const comboIdx = Math.floor(callIdx / 3);
            const runIdx = callIdx % 3;
            callIdx++;
            return { overall: scoresByCombo[comboIdx][runIdx], dimensions: {}, rawOutput: '{}' };
        });

        const { result } = await tuneSubsystem('voice', MOCK_MODEL, {
            subsystems: ['voice'],
            runsPerCombo: 3,
            maxCombos: 25,
            convergenceThreshold: 0.05, // range of top 3 averages < 0.05 triggers variance selection
        }, null);

        // Combo 0 has lowest variance with good score — should be selected
        expect(result.bestCombo.temperature).toBe(0.3);
    });
});
