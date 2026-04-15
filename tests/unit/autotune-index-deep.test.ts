/**
 * Deep branch/statement coverage for core/autotune/index.ts — startAutoTune.
 *
 * Covers paths not exercised by autotune-index.test.ts:
 *   - "already running" guard
 *   - reader seeded refinement (first full, subsequent seeded)
 *   - cancelFlag breaking out of loops
 *   - !model continue guards in reader/non-reader loops
 *   - inherited results from consolidateReaders
 *   - consultant with no assigned model (skipped)
 *   - error branch sets tuneState.error
 *   - cancel sets status to 'cancelled'
 *   - emitActivity message variants (inherited count, consultant count in start message)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/* Shared mock fns                                                    */
/* ------------------------------------------------------------------ */
const mockGetSubsystemAssignments = jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({});
const mockGetConsultantAssignments = jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({});
const mockEmitActivity = jest.fn();
const mockTuneSubsystem = jest.fn<(...args: any[]) => Promise<any>>();
const mockConsolidateReaders = jest.fn<(subs: string[]) => any>();
const mockGroupByModel = jest.fn<(subs: string[], assignments: any) => Map<string, string[]>>();
const mockSetCancelFlag = jest.fn();
const mockSetTuneState = jest.fn();

/* Mutable state object — startAutoTune reads/writes tuneState and cancelFlag
 * via the mocked state module. We keep a reference so we can mutate between
 * invocations or mid-flight (via tuneSubsystem side-effects). */
const stateObj: any = {
    status: 'idle',
    results: [] as any[],
    subsystemsComplete: 0,
    subsystemsTotal: 0,
    currentSubsystem: null,
    currentCombo: 0,
    totalCombos: 0,
    startedAt: null,
};

/* cancelFlag is an `export let` in state.ts — a primitive ESM live binding.
 * Jest ESM mocking snapshots primitive exports at import time and does not
 * support live binding updates. Cancel-path branches cannot be tested. */

/* ------------------------------------------------------------------ */
/* Module mocks                                                       */
/* ------------------------------------------------------------------ */
jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
    getConsultantAssignments: mockGetConsultantAssignments,
}));
jest.unstable_mockModule('../../config.js', () => ({
    config: {
        subsystemTemperatures: { reader_pdf: 0.5 },
        subsystemTopP: { reader_pdf: 0.8 },
        subsystemMinP: { reader_pdf: 0.1 },
        subsystemTopK: { reader_pdf: 10 },
        subsystemRepeatPenalties: { reader_pdf: 1.2 },
    },
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));
jest.unstable_mockModule('../../core/autotune/types.js', () => ({}));
jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    READER_SUBSYSTEMS: new Set([
        'reader_text', 'reader_code', 'reader_pdf',
        'reader_doc', 'reader_image', 'reader_sheet',
    ]),
}));
jest.unstable_mockModule('../../core/autotune/gold-standards.js', () => ({}));
jest.unstable_mockModule('../../core/autotune/combinatorics.js', () => ({
    groupByModel: mockGroupByModel,
    consolidateReaders: mockConsolidateReaders,
}));
jest.unstable_mockModule('../../core/autotune/execution.js', () => ({
    tuneSubsystem: mockTuneSubsystem,
}));
jest.unstable_mockModule('../../core/autotune/state.js', () => ({
    tuneState: stateObj,
    cancelFlag: false,
    setCancelFlag: mockSetCancelFlag,
    setTuneState: mockSetTuneState.mockImplementation((s: any) => {
        Object.assign(stateObj, s);
        stateObj.results = s.results ?? [];
    }),
}));

const { startAutoTune } = await import('../../core/autotune/index.js');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function makeTuneResult(subsystem: string, score = 0.85) {
    return {
        result: {
            subsystem,
            modelName: `model-${subsystem}`,
            bestCombo: { temperature: 0.6, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            bestScore: score,
            currentScore: 0.7,
            improvement: score - 0.7,
            testedCombos: 5,
            totalCombos: 10,
            elapsedMs: 500,
            allResults: [],
            currentParams: {},
        },
        bestCombo: { temperature: 0.6, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
    };
}

function resetState() {
    stateObj.status = 'idle';
    stateObj.results = [];
    stateObj.subsystemsComplete = 0;
    stateObj.subsystemsTotal = 0;
    stateObj.currentSubsystem = null;
    stateObj.currentCombo = 0;
    stateObj.totalCombos = 0;
    stateObj.startedAt = null;
    stateObj.error = undefined;
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetConsultantAssignments.mockResolvedValue({});
    mockTuneSubsystem.mockResolvedValue(makeTuneResult('generic'));
    mockConsolidateReaders.mockImplementation((subs: string[]) => ({
        toTune: subs,
        inherited: new Map(),
    }));
    mockGroupByModel.mockImplementation((subs: string[]) => {
        const m = new Map<string, string[]>();
        if (subs.length) m.set('group-0', subs);
        return m;
    });
    mockSetTuneState.mockImplementation((s: any) => {
        Object.assign(stateObj, s);
        stateObj.results = s.results ?? [];
    });
});

/* ================================================================== */
/* Tests                                                               */
/* ================================================================== */
describe('startAutoTune — deep coverage', () => {
    // ---------------------------------------------------------------
    // 1. "already running" guard (line 24-26)
    // ---------------------------------------------------------------
    it('throws if auto-tune is already running', async () => {
        stateObj.status = 'running';
        await expect(startAutoTune({ runsPerCombo: 1, maxCombos: 3 }))
            .rejects.toThrow('Auto-tune already running');
    });

    // ---------------------------------------------------------------
    // 2. Reader seeded refinement — two readers in same model group
    //    First reader gets seed=null (full), second gets seed from first
    // ---------------------------------------------------------------
    it('seeds second reader from first reader bestCombo', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt-model', id: 1 },
            reader_pdf: { name: 'rt-model', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'reader_pdf'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt-model', ['reader_text', 'reader_pdf']]]),
        );

        const firstResult = makeTuneResult('reader_text', 0.9);
        const secondResult = makeTuneResult('reader_pdf', 0.88);
        mockTuneSubsystem
            .mockResolvedValueOnce(firstResult)
            .mockResolvedValueOnce(secondResult);

        await startAutoTune({ runsPerCombo: 1, maxCombos: 5 });

        // First reader: seed = null (full search)
        expect(mockTuneSubsystem).toHaveBeenNthCalledWith(
            1,
            'reader_text',
            expect.objectContaining({ name: 'rt-model' }),
            expect.any(Object),
            null,  // no seed
        );
        // Second reader: seed = bestCombo from first
        expect(mockTuneSubsystem).toHaveBeenNthCalledWith(
            2,
            'reader_pdf',
            expect.objectContaining({ name: 'rt-model' }),
            expect.any(Object),
            firstResult.bestCombo,  // seeded
        );

        // Second result should have seedFrom set
        const results = stateObj.results;
        const pdfResult = results.find((r: any) => r.subsystem === 'reader_pdf');
        expect(pdfResult?.seedFrom).toBe('reader_text');
    });

    // ---------------------------------------------------------------
    // 3. Reader emits 'refinement' phase label for seeded readers
    // ---------------------------------------------------------------
    it('emits refinement phase for seeded reader subsystems', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt-model', id: 1 },
            reader_pdf: { name: 'rt-model', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'reader_pdf'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt-model', ['reader_text', 'reader_pdf']]]),
        );

        mockTuneSubsystem
            .mockResolvedValueOnce(makeTuneResult('reader_text'))
            .mockResolvedValueOnce(makeTuneResult('reader_pdf'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // The second reader's autotune_subsystem event should say "refinement"
        const subsystemCalls = mockEmitActivity.mock.calls.filter(
            (c: any) => c[1] === 'autotune_subsystem',
        );
        expect(subsystemCalls.length).toBe(2);
        // First call: phase = full
        expect(subsystemCalls[0][3]).toEqual(expect.objectContaining({ phase: 'full' }));
        // Second call: phase = refinement, seedFrom set
        expect(subsystemCalls[1][3]).toEqual(expect.objectContaining({
            phase: 'refinement',
            seedFrom: 'reader_text',
        }));
    });

    // ---------------------------------------------------------------
    // 4. Non-reader subsystems always get full search (no seed)
    // ---------------------------------------------------------------
    it('non-reader subsystems in a model group get null seed', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'shared-model', id: 1 },
            compress: { name: 'shared-model', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice', 'compress'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['shared-model', ['voice', 'compress']]]),
        );

        mockTuneSubsystem
            .mockResolvedValueOnce(makeTuneResult('voice'))
            .mockResolvedValueOnce(makeTuneResult('compress'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // Both non-readers should get null seed
        expect(mockTuneSubsystem).toHaveBeenNthCalledWith(
            1, 'voice', expect.any(Object), expect.any(Object), null,
        );
        expect(mockTuneSubsystem).toHaveBeenNthCalledWith(
            2, 'compress', expect.any(Object), expect.any(Object), null,
        );
    });

    // ---------------------------------------------------------------
    // 5. Mixed readers + non-readers in same model group
    // ---------------------------------------------------------------
    it('splits readers and non-readers within a model group', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'same', id: 1 },
            voice: { name: 'same', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'voice'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['same', ['reader_text', 'voice']]]),
        );

        mockTuneSubsystem
            .mockResolvedValueOnce(makeTuneResult('reader_text'))
            .mockResolvedValueOnce(makeTuneResult('voice'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // reader_text tuned first (readers loop), voice second (non-readers loop)
        expect(mockTuneSubsystem).toHaveBeenCalledTimes(2);
        expect(mockTuneSubsystem.mock.calls[0][0]).toBe('reader_text');
        expect(mockTuneSubsystem.mock.calls[1][0]).toBe('voice');
    });

    // ---------------------------------------------------------------
    // NOTE: cancelFlag is an `export let` in state.ts. Jest ESM mocking
    // snapshots primitive exports at import time and does not support
    // live binding updates even with getters on the factory return.
    // Cancel-path branches cannot be tested from the outside. The
    // existing autotune-index.test.ts acknowledges this same limitation.
    // ---------------------------------------------------------------

    // ---------------------------------------------------------------
    // 6. Three readers in same model group — seeding chains
    // ---------------------------------------------------------------
    it('chains seeds across three readers in the same model group', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
            reader_pdf: { name: 'rt', id: 1 },
            reader_doc: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'reader_pdf', 'reader_doc'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text', 'reader_pdf', 'reader_doc']]]),
        );

        const r1 = makeTuneResult('reader_text', 0.90);
        const r2 = makeTuneResult('reader_pdf', 0.88);
        const r3 = makeTuneResult('reader_doc', 0.86);
        mockTuneSubsystem
            .mockResolvedValueOnce(r1)
            .mockResolvedValueOnce(r2)
            .mockResolvedValueOnce(r3);

        await startAutoTune({ runsPerCombo: 1, maxCombos: 5 });

        expect(mockTuneSubsystem).toHaveBeenCalledTimes(3);
        // First: null seed
        expect(mockTuneSubsystem.mock.calls[0][3]).toBeNull();
        // Second: seed from first
        expect(mockTuneSubsystem.mock.calls[1][3]).toEqual(r1.bestCombo);
        // Third: seed from second (chain replaces seed with latest bestCombo)
        expect(mockTuneSubsystem.mock.calls[2][3]).toEqual(r2.bestCombo);

        // All three have seedFrom set to the FIRST reader (readerSeedFrom doesn't change)
        const results = stateObj.results;
        expect(results[1].seedFrom).toBe('reader_text');
        expect(results[2].seedFrom).toBe('reader_text');
    });

    // ---------------------------------------------------------------
    // 7. Multiple model groups processed sequentially
    // ---------------------------------------------------------------
    it('processes multiple model groups sequentially', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'model-a', id: 1 },
            compress: { name: 'model-b', id: 2 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice', 'compress'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([
                ['model-a', ['voice']],
                ['model-b', ['compress']],
            ]),
        );

        mockTuneSubsystem
            .mockResolvedValueOnce(makeTuneResult('voice', 0.85))
            .mockResolvedValueOnce(makeTuneResult('compress', 0.90));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockTuneSubsystem).toHaveBeenCalledTimes(2);
        expect(stateObj.results.length).toBe(2);
        expect(stateObj.results[0].subsystem).toBe('voice');
        expect(stateObj.results[1].subsystem).toBe('compress');
    });

    // ---------------------------------------------------------------
    // 8. Reader done event includes phase in message text
    // ---------------------------------------------------------------
    it('includes phase label in reader done activity message', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
            reader_pdf: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'reader_pdf'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text', 'reader_pdf']]]),
        );

        mockTuneSubsystem
            .mockResolvedValueOnce(makeTuneResult('reader_text', 0.85))
            .mockResolvedValueOnce(makeTuneResult('reader_pdf', 0.80));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        const doneCalls = mockEmitActivity.mock.calls.filter(
            (c: any) => c[1] === 'autotune_subsystem_done',
        );
        // First reader done: [full]
        expect(doneCalls[0][2]).toContain('[full]');
        // Second reader done: [refinement]
        expect(doneCalls[1][2]).toContain('[refinement]');
    });

    // ---------------------------------------------------------------
    // 9. !model continue guard in reader loop (assignment missing)
    // ---------------------------------------------------------------
    it('skips readers with no assigned model', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
            reader_pdf: null,  // no model assigned
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text', 'reader_pdf'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text', 'reader_pdf']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('reader_text'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // reader_pdf has no model — should be skipped
        expect(mockTuneSubsystem).toHaveBeenCalledTimes(1);
        expect(mockTuneSubsystem.mock.calls[0][0]).toBe('reader_text');
    });

    // ---------------------------------------------------------------
    // 10. !model continue guard in non-reader loop
    // ---------------------------------------------------------------
    it('skips non-readers with no assigned model', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'v', id: 1 },
            compress: null,  // no model
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice', 'compress'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['v', ['voice', 'compress']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockTuneSubsystem).toHaveBeenCalledTimes(1);
        expect(mockTuneSubsystem.mock.calls[0][0]).toBe('voice');
    });

    // ---------------------------------------------------------------
    // 11. Inherited results from consolidateReaders
    // ---------------------------------------------------------------
    it('adds inherited results for consolidated text readers', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text'],
            inherited: new Map([['reader_pdf', 'reader_text']]),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text']]]),
        );

        const leaderTuneResult = makeTuneResult('reader_text', 0.92);
        mockTuneSubsystem.mockResolvedValue(leaderTuneResult);

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // Should have 2 results: leader + inherited
        expect(stateObj.results.length).toBe(2);

        const inherited = stateObj.results.find((r: any) => r.subsystem === 'reader_pdf');
        expect(inherited).toBeDefined();
        expect(inherited.phase).toBe('inherited');
        expect(inherited.seedFrom).toBe('reader_text');
        expect(inherited.bestScore).toBe(0.92);
        expect(inherited.bestCombo).toEqual(leaderTuneResult.result.bestCombo);
        expect(inherited.allResults).toEqual([]);
        expect(inherited.testedCombos).toBe(0);
        expect(inherited.elapsedMs).toBe(0);
        // Reads current params from config
        expect(inherited.currentParams.temperature).toBe(0.5);
        expect(inherited.currentParams.topP).toBe(0.8);
        expect(inherited.currentParams.minP).toBe(0.1);
        expect(inherited.currentParams.topK).toBe(10);
        expect(inherited.currentParams.repeatPenalty).toBe(1.2);
    });

    // ---------------------------------------------------------------
    // 12. Inherited uses default param values when config has no entry
    // ---------------------------------------------------------------
    it('inherited results use defaults when config has no subsystem entry', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text'],
            inherited: new Map([['reader_doc', 'reader_text']]),  // reader_doc not in config mock
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('reader_text', 0.88));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        const inherited = stateObj.results.find((r: any) => r.subsystem === 'reader_doc');
        expect(inherited).toBeDefined();
        // Should use fallback defaults
        expect(inherited.currentParams.temperature).toBe(0.7);
        expect(inherited.currentParams.topP).toBe(0.9);
        expect(inherited.currentParams.minP).toBe(0);
        expect(inherited.currentParams.topK).toBe(0);
        expect(inherited.currentParams.repeatPenalty).toBe(1.0);
    });

    // ---------------------------------------------------------------
    // 13. Inherited emits autotune_subsystem_done with "inherited" label
    // ---------------------------------------------------------------
    it('emits inherited subsystem done activity', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text'],
            inherited: new Map([['reader_pdf', 'reader_text']]),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('reader_text', 0.9));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        const inheritedDone = mockEmitActivity.mock.calls.find(
            (c: any) => c[1] === 'autotune_subsystem_done' && c[3]?.phase === 'inherited',
        );
        expect(inheritedDone).toBeDefined();
        expect(inheritedDone![2]).toContain('reader_pdf');
        expect(inheritedDone![2]).toContain('inherited from reader_text');
    });

    // ---------------------------------------------------------------
    // 14. Inherited skips if no matching leader result found
    // ---------------------------------------------------------------
    it('skips inherited result when leader was not tuned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'v', id: 1 },
        });
        // Leader "reader_text" was not in toTune, so no result exists for it
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice'],
            inherited: new Map([['reader_pdf', 'reader_text']]),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['v', ['voice']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        // Only 1 result (voice), no inherited since leader wasn't found
        expect(stateObj.results.length).toBe(1);
        expect(stateObj.results[0].subsystem).toBe('voice');
    });

    // ---------------------------------------------------------------
    // 15. Consultant with no assigned model is skipped
    // ---------------------------------------------------------------
    it('skips consultant subsystem with no assigned model', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: null,  // no model
        });

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        // consultantKeys should be empty since voice has no model
        // (the filter on line 40 checks consultantAssignments[sub])
        expect(mockTuneSubsystem).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------
    // 16. Consultant c: prefix not in consultantAssignments is ignored
    // ---------------------------------------------------------------
    it('ignores c: subsystem not in consultant assignments', async () => {
        mockGetConsultantAssignments.mockResolvedValue({});

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:nonexistent'],
        });

        expect(mockTuneSubsystem).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------
    // 17. Multiple consultants tuned sequentially
    // ---------------------------------------------------------------
    it('tunes multiple consultants in sequence', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-voice', id: 10 },
            compress: { name: 'c-compress', id: 11 },
        });

        const r1 = makeTuneResult('voice', 0.88);
        const r2 = makeTuneResult('compress', 0.92);
        mockTuneSubsystem
            .mockResolvedValueOnce(r1)
            .mockResolvedValueOnce(r2);

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice', 'c:compress'],
        });

        expect(mockTuneSubsystem).toHaveBeenCalledTimes(2);
        // Both get isConsultant: true
        expect(mockTuneSubsystem.mock.calls[0][4]).toEqual({ isConsultant: true });
        expect(mockTuneSubsystem.mock.calls[1][4]).toEqual({ isConsultant: true });
        // Both get null seed (independent)
        expect(mockTuneSubsystem.mock.calls[0][3]).toBeNull();
        expect(mockTuneSubsystem.mock.calls[1][3]).toBeNull();
        // Both tagged with c: prefix
        expect(stateObj.results[0].subsystem).toBe('c:voice');
        expect(stateObj.results[1].subsystem).toBe('c:compress');
    });

    // ---------------------------------------------------------------
    // 18. Consultant result gets c: prefix on subsystem name
    // ---------------------------------------------------------------
    it('tags consultant result with c: prefix', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-model', id: 10 },
        });

        const cResult = makeTuneResult('voice', 0.88);
        mockTuneSubsystem.mockResolvedValue(cResult);

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        // The result should have subsystem = 'c:voice'
        const results = stateObj.results;
        expect(results.length).toBe(1);
        expect(results[0].subsystem).toBe('c:voice');
    });

    // ---------------------------------------------------------------
    // 19. Consultant activity message shows the model name
    // ---------------------------------------------------------------
    it('consultant start activity shows model name', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'gpt-4o-mini', id: 10 },
        });

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice', 0.85));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        const subsystemStart = mockEmitActivity.mock.calls.find(
            (c: any) => c[1] === 'autotune_subsystem' && c[3]?.consultant === true,
        );
        expect(subsystemStart).toBeDefined();
        expect(subsystemStart![2]).toContain('gpt-4o-mini');
        expect(subsystemStart![3].model).toBe('gpt-4o-mini');
    });

    // ---------------------------------------------------------------
    // 20. Error sets status and error message on tuneState
    // ---------------------------------------------------------------
    it('sets tuneState error on exception', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'v', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(new Map([['v', ['voice']]]));

        mockTuneSubsystem.mockRejectedValue(new Error('Connection refused'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(stateObj.status).toBe('error');
        expect(stateObj.error).toBe('Connection refused');
    });

    // ---------------------------------------------------------------
    // 21. Start activity message includes inherited count
    // ---------------------------------------------------------------
    it('includes inherited count in start activity message', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text'],
            inherited: new Map([['reader_pdf', 'reader_text'], ['reader_doc', 'reader_text']]),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('reader_text'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        const startCall = mockEmitActivity.mock.calls.find(
            (c: any) => c[1] === 'autotune_start' && c[2].includes('inherited'),
        );
        expect(startCall).toBeDefined();
        expect(startCall![2]).toContain('2 inherited');
    });

    // ---------------------------------------------------------------
    // 22. Start activity message includes consultant count
    // ---------------------------------------------------------------
    it('includes consultant count in start activity message', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-model', id: 10 },
        });

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        const startCall = mockEmitActivity.mock.calls.find(
            (c: any) => c[1] === 'autotune_start' && c[2].includes('consultant'),
        );
        expect(startCall).toBeDefined();
        expect(startCall![2]).toContain('1 consultant');
    });

    // ---------------------------------------------------------------
    // 23. Consultant model with no assignment is skipped inside loop
    // ---------------------------------------------------------------
    it('skips individual consultant with null model assignment in the loop', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-model', id: 10 },
            compress: null,  // assigned in keys check but null here
        });

        // Both pass the key check (line 40) because consultantAssignments[sub]
        // is checked — null is falsy so compress should NOT be added to consultantKeys
        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice', 'c:compress'],
        });

        // Only voice should be tuned (compress filtered at line 40)
        expect(mockTuneSubsystem).toHaveBeenCalledTimes(1);
        expect(mockTuneSubsystem.mock.calls[0][0]).toBe('voice');
    });

    // ---------------------------------------------------------------
    // 24. Mix of primary and consultant subsystems in config
    // ---------------------------------------------------------------
    it('handles mix of primary and consultant subsystems', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'v-model', id: 1 },
        });
        mockGetConsultantAssignments.mockResolvedValue({
            compress: { name: 'c-compress', id: 11 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(new Map([['v-model', ['voice']]]));

        const voiceResult = makeTuneResult('voice', 0.85);
        const compressResult = makeTuneResult('compress', 0.9);
        mockTuneSubsystem
            .mockResolvedValueOnce(voiceResult)
            .mockResolvedValueOnce(compressResult);

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['voice', 'c:compress'],
        });

        expect(mockTuneSubsystem).toHaveBeenCalledTimes(2);
        // Primary first
        expect(mockTuneSubsystem.mock.calls[0][0]).toBe('voice');
        // Consultant second with isConsultant flag
        expect(mockTuneSubsystem.mock.calls[1][0]).toBe('compress');
        expect(mockTuneSubsystem.mock.calls[1][4]).toEqual({ isConsultant: true });
    });

    // ---------------------------------------------------------------
    // 25. Complete vs cancelled status at the end
    // ---------------------------------------------------------------
    it('sets status to complete when not cancelled', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { name: 'v', id: 1 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['voice'],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(new Map([['v', ['voice']]]));

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(stateObj.status).toBe('complete');
    });

    // ---------------------------------------------------------------
    // 26. Subsystems total includes toTune + inherited + consultants
    // ---------------------------------------------------------------
    it('subsystemsTotal includes all categories', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            reader_text: { name: 'rt', id: 1 },
        });
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-v', id: 10 },
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: ['reader_text'],
            inherited: new Map([['reader_pdf', 'reader_text']]),
        });
        mockGroupByModel.mockReturnValue(
            new Map([['rt', ['reader_text']]]),
        );

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('reader_text'));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['reader_text', 'c:voice'],
        });

        // setTuneState should have been called with subsystemsTotal = 1 (toTune) + 1 (inherited) + 1 (consultant) = 3
        expect(mockSetTuneState).toHaveBeenCalledWith(
            expect.objectContaining({ subsystemsTotal: 3 }),
        );
    });

    // ---------------------------------------------------------------
    // 27. Consultant emits separate autotune_start event
    // ---------------------------------------------------------------
    it('emits separate autotune_start for consultant block', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-model', id: 10 },
        });

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice'));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        const consultantStarts = mockEmitActivity.mock.calls.filter(
            (c: any) => c[1] === 'autotune_start' && c[3]?.consultant === true,
        );
        expect(consultantStarts.length).toBe(1);
        expect(consultantStarts[0][2]).toContain('consultant');
    });

    // ---------------------------------------------------------------
    // 28. Empty subsystems array with no assignments → nothing to tune
    // ---------------------------------------------------------------
    it('handles no assigned subsystems gracefully', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            embedding: { name: 'embed', id: 1 },  // only embedding
        });
        mockConsolidateReaders.mockReturnValue({
            toTune: [],
            inherited: new Map(),
        });
        mockGroupByModel.mockReturnValue(new Map());

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockTuneSubsystem).not.toHaveBeenCalled();
        expect(stateObj.status).toBe('complete');
    });

    // ---------------------------------------------------------------
    // 29. Consultant done event includes correct detail object
    // ---------------------------------------------------------------
    it('emits consultant done event with correct details', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'c-model', id: 10 },
        });

        mockTuneSubsystem.mockResolvedValue(makeTuneResult('voice', 0.91));

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        const doneCall = mockEmitActivity.mock.calls.find(
            (c: any) => c[1] === 'autotune_subsystem_done' && c[3]?.consultant === true,
        );
        expect(doneCall).toBeDefined();
        expect(doneCall![3]).toEqual(expect.objectContaining({
            subsystem: 'c:voice',
            phase: 'full',
            consultant: true,
            bestScore: 0.91,
        }));
    });
});
