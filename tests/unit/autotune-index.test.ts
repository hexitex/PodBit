/**
 * Unit tests for core/autotune/index.ts — startAutoTune engine.
 *
 * NOTE: `tuneState` and `cancelFlag` are `export let` in state.ts.
 * ts-jest does not preserve ESM live bindings, so we cannot read/write
 * them from the test side. We test through mock interactions instead.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetSubsystemAssignments = jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({
    voice: { name: 'model-a', id: 1 },
    compress: { name: 'model-b', id: 2 },
    embedding: { name: 'model-c', id: 3 },
});
const mockGetConsultantAssignments = jest.fn<() => Promise<Record<string, any>>>().mockResolvedValue({});
const mockEmitActivity = jest.fn();

const mockTuneSubsystem = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
    result: {
        subsystem: 'voice',
        modelName: 'model-a',
        bestCombo: { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
        bestScore: 0.85,
        currentScore: 0.70,
        improvement: 0.15,
        testedCombos: 5,
        totalCombos: 10,
        elapsedMs: 1000,
        allResults: [],
        currentParams: {},
    },
    bestCombo: { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
});

const mockConsolidateReaders = jest.fn<(subs: string[]) => any>().mockImplementation((subs: string[]) => ({
    toTune: subs,
    inherited: new Map(),
}));
const mockGroupByModel = jest.fn<(subs: string[], assignments: any) => Map<string, string[]>>().mockImplementation(
    (subs: string[]) => {
        const map = new Map<string, string[]>();
        map.set('model-a', subs);
        return map;
    }
);

const mockSetCancelFlag = jest.fn();
const mockSetTuneState = jest.fn();

jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
    getConsultantAssignments: mockGetConsultantAssignments,
}));
jest.unstable_mockModule('../../config.js', () => ({
    config: {},
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));
jest.unstable_mockModule('../../core/autotune/types.js', () => ({}));
jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    READER_SUBSYSTEMS: new Set(['reader_text', 'reader_code', 'reader_pdf', 'reader_doc', 'reader_image', 'reader_sheet']),
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
    // ts-jest copies `let` exports at import time — use an object with mutable status
    // so the imported code can read the live value
    tuneState: { status: 'idle', results: [], subsystemsComplete: 0, subsystemsTotal: 0 },
    cancelFlag: false,
    setCancelFlag: mockSetCancelFlag,
    setTuneState: mockSetTuneState,
}));

const { startAutoTune } = await import('../../core/autotune/index.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubsystemAssignments.mockResolvedValue({
        voice: { name: 'model-a', id: 1 },
        compress: { name: 'model-b', id: 2 },
        embedding: { name: 'model-c', id: 3 },
    });
    mockGetConsultantAssignments.mockResolvedValue({});
    mockTuneSubsystem.mockResolvedValue({
        result: {
            subsystem: 'voice',
            modelName: 'model-a',
            bestCombo: { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
            bestScore: 0.85,
            currentScore: 0.70,
            improvement: 0.15,
            testedCombos: 5,
            totalCombos: 10,
            elapsedMs: 1000,
            allResults: [],
            currentParams: {},
        },
        bestCombo: { temperature: 0.7, topP: 0.9, minP: 0, topK: 0, repeatPenalty: 1.0 },
    });
});

describe('startAutoTune', () => {
    it('resets cancel flag at start', async () => {
        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockSetCancelFlag).toHaveBeenCalledWith(false);
    });

    it('calls setTuneState with running status', async () => {
        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockSetTuneState).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'running' }),
        );
    });

    it('auto-selects all assigned subsystems except embedding when none specified', async () => {
        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockConsolidateReaders).toHaveBeenCalledWith(
            expect.arrayContaining(['voice', 'compress']),
        );
        const callArgs = mockConsolidateReaders.mock.calls[0][0];
        expect(callArgs).not.toContain('embedding');
    });

    it('filters to only assigned subsystems', async () => {
        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['voice', 'nonexistent'],
        });

        expect(mockConsolidateReaders).toHaveBeenCalledWith(['voice']);
    });

    it('tunes each subsystem via tuneSubsystem', async () => {
        mockConsolidateReaders.mockReturnValue({ toTune: ['voice'], inherited: new Map() });
        mockGroupByModel.mockReturnValue(new Map([['model-a', ['voice']]]));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockTuneSubsystem).toHaveBeenCalledWith(
            'voice',
            expect.objectContaining({ name: 'model-a' }),
            expect.objectContaining({ runsPerCombo: 1 }),
            null, // no seed for non-reader
        );
    });

    it('emits autotune_start and autotune_complete events', async () => {
        mockConsolidateReaders.mockReturnValue({ toTune: ['voice'], inherited: new Map() });
        mockGroupByModel.mockReturnValue(new Map([['model-a', ['voice']]]));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_start',
            expect.any(String),
            expect.any(Object),
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_complete',
            expect.any(String),
        );
    });

    it('emits autotune_error on tuneSubsystem failure', async () => {
        mockConsolidateReaders.mockReturnValue({ toTune: ['voice'], inherited: new Map() });
        mockGroupByModel.mockReturnValue(new Map([['model-a', ['voice']]]));
        mockTuneSubsystem.mockRejectedValue(new Error('LLM down'));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_error',
            expect.stringContaining('LLM down'),
        );
    });

    it('handles consultant subsystems with c: prefix', async () => {
        mockGetConsultantAssignments.mockResolvedValue({
            voice: { name: 'consultant-model', id: 5 },
        });

        await startAutoTune({
            runsPerCombo: 1,
            maxCombos: 3,
            subsystems: ['c:voice'],
        });

        expect(mockTuneSubsystem).toHaveBeenCalledWith(
            'voice',
            expect.objectContaining({ name: 'consultant-model' }),
            expect.any(Object),
            null,
            { isConsultant: true },
        );
    });

    it('emits per-subsystem activity events', async () => {
        mockConsolidateReaders.mockReturnValue({ toTune: ['voice'], inherited: new Map() });
        mockGroupByModel.mockReturnValue(new Map([['model-a', ['voice']]]));

        await startAutoTune({ runsPerCombo: 1, maxCombos: 3 });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_subsystem',
            expect.stringContaining('voice'),
            expect.any(Object),
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'autotune_subsystem_done',
            expect.stringContaining('voice'),
            expect.any(Object),
        );
    });
});
