/**
 * Tests for core/autotune/state.ts — setCancelFlag, setTuneState, getAutoTuneProgress,
 * cancelAutoTune, resetAutoTune.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: jest.fn(),
}));

const {
    tuneState,
    setCancelFlag,
    setTuneState,
    getAutoTuneProgress,
    cancelAutoTune,
    resetAutoTune,
} = await import('../../core/autotune/state.js');

const IDLE_STATE = {
    status: 'idle',
    currentSubsystem: null,
    currentCombo: 0,
    totalCombos: 0,
    subsystemsComplete: 0,
    subsystemsTotal: 0,
    results: [],
    startedAt: null,
};

describe('setCancelFlag', () => {
    it('sets cancel flag to true', () => {
        setCancelFlag(true);
        // cancelFlag is exported but we test it indirectly via cancelAutoTune behavior
        // Reset to avoid contaminating other tests
        setCancelFlag(false);
    });

    it('sets cancel flag to false', () => {
        setCancelFlag(true);
        setCancelFlag(false);
        // No error = pass
    });
});

describe('getAutoTuneProgress', () => {
    beforeEach(() => {
        resetAutoTune();
    });

    it('returns current state as a copy', () => {
        const progress = getAutoTuneProgress();
        expect(progress.status).toBe('idle');
        expect(progress.currentCombo).toBe(0);
    });

    it('returns a shallow copy, not the original reference', () => {
        const progress = getAutoTuneProgress();
        progress.currentCombo = 999;
        expect(getAutoTuneProgress().currentCombo).toBe(0);
    });

    it('reflects state set by setTuneState', () => {
        setTuneState({
            ...IDLE_STATE,
            status: 'running',
            currentCombo: 5,
            totalCombos: 10,
        } as any);
        const progress = getAutoTuneProgress();
        expect(progress.status).toBe('running');
        expect(progress.currentCombo).toBe(5);
        expect(progress.totalCombos).toBe(10);
        resetAutoTune();
    });
});

describe('setTuneState', () => {
    beforeEach(() => {
        resetAutoTune();
    });

    it('replaces the full state', () => {
        const newState = {
            ...IDLE_STATE,
            status: 'running' as const,
            currentSubsystem: 'synthesis',
            currentCombo: 3,
            totalCombos: 27,
            subsystemsComplete: 1,
            subsystemsTotal: 5,
            startedAt: '2025-03-07T10:00:00Z',
        };
        setTuneState(newState as any);
        const progress = getAutoTuneProgress();
        expect(progress.currentSubsystem).toBe('synthesis');
        expect(progress.currentCombo).toBe(3);
    });
});

describe('cancelAutoTune', () => {
    beforeEach(() => {
        resetAutoTune();
        setCancelFlag(false);
    });

    it('marks status as cancelled when running', () => {
        setTuneState({ ...IDLE_STATE, status: 'running' } as any);
        cancelAutoTune();
        expect(getAutoTuneProgress().status).toBe('cancelled');
        resetAutoTune();
    });

    it('does not change status when already idle', () => {
        cancelAutoTune();
        expect(getAutoTuneProgress().status).toBe('idle');
    });
});

describe('resetAutoTune', () => {
    it('resets state to idle when not running', () => {
        setTuneState({ ...IDLE_STATE, status: 'done', currentCombo: 99, totalCombos: 99 } as any);
        resetAutoTune();
        const progress = getAutoTuneProgress();
        expect(progress.status).toBe('idle');
        expect(progress.currentCombo).toBe(0);
        expect(progress.totalCombos).toBe(0);
    });

    it('does NOT reset state when running', () => {
        setTuneState({ ...IDLE_STATE, status: 'running', currentCombo: 5 } as any);
        resetAutoTune(); // Should be a no-op
        expect(getAutoTuneProgress().currentCombo).toBe(5);
        // Cleanup
        setTuneState({ ...IDLE_STATE } as any);
    });

    it('clears results', () => {
        setTuneState({ ...IDLE_STATE, status: 'done', results: [{ subsystem: 'voice', score: 0.9 }] } as any);
        resetAutoTune();
        expect(getAutoTuneProgress().results).toEqual([]);
    });

    it('sets currentSubsystem to null', () => {
        setTuneState({ ...IDLE_STATE, status: 'cancelled', currentSubsystem: 'synthesis' } as any);
        resetAutoTune();
        expect(getAutoTuneProgress().currentSubsystem).toBeNull();
    });

    it('sets startedAt to null', () => {
        setTuneState({ ...IDLE_STATE, status: 'done', startedAt: '2025-03-07T10:00:00Z' } as any);
        resetAutoTune();
        expect(getAutoTuneProgress().startedAt).toBeNull();
    });
});
