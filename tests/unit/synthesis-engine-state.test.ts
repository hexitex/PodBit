/**
 * Unit tests for core/synthesis-engine-state.ts —
 * abortableSleep, makeCycleState, getCycleStatus, getAllCycleStatuses, runCycleLoop.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockEmitActivity = jest.fn<() => void>();

const mockAppConfig = {
    autonomousCycles: {
        validation: { intervalMs: 5000 },
        questions: { intervalMs: 3000 },
        tensions: { intervalMs: 4000 },
        research: { intervalMs: 10000 },
        autorating: { intervalMs: 6000 },
        evm: { intervalMs: 2000 },
        voicing: { intervalMs: 3000 },
    },
};

jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ emitActivity: mockEmitActivity }));

const {
    abortableSleep,
    makeCycleState,
    getCycleStatus,
    getAllCycleStatuses,
    runCycleLoop,
    cycleStates,
} = await import('../../core/synthesis-engine-state.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockEmitActivity.mockReturnValue(undefined);
    // Reset all cycle states to prevent contamination between tests
    for (const type of Object.keys(cycleStates) as any[]) {
        cycleStates[type].running = false;
        cycleStates[type].shouldStop = false;
        cycleStates[type].cycleCount = 0;
        cycleStates[type].errorCount = 0;
        cycleStates[type].startedAt = null;
        cycleStates[type].lastCycleAt = null;
        cycleStates[type].lastError = null;
    }
});

// =============================================================================
// abortableSleep
// =============================================================================

describe('abortableSleep', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('resolves after the specified duration', async () => {
        const sleepPromise = abortableSleep(500, () => false);
        jest.advanceTimersByTime(600);
        await sleepPromise;
        // Just reaching here means it resolved
    });

    it('resolves early when shouldStopFn returns true', async () => {
        let stopNow = false;
        const sleepPromise = abortableSleep(10000, () => stopNow);

        // Advance slightly then flip stop flag
        jest.advanceTimersByTime(100);
        stopNow = true;
        jest.advanceTimersByTime(100);

        await sleepPromise;
        // Resolved well before 10000ms
    });

    it('resolves immediately when shouldStopFn returns true from the start', async () => {
        const sleepPromise = abortableSleep(5000, () => true);
        jest.advanceTimersByTime(100); // one poll interval
        await sleepPromise;
    });

    it('resolves with a very short ms (1ms) after polling', async () => {
        const sleepPromise = abortableSleep(1, () => false);
        jest.advanceTimersByTime(200);
        await sleepPromise;
    });
});

// =============================================================================
// makeCycleState
// =============================================================================

describe('makeCycleState', () => {
    it('returns default state with running=false', () => {
        const state = makeCycleState();
        expect(state.running).toBe(false);
        expect(state.shouldStop).toBe(false);
        expect(state.cycleCount).toBe(0);
        expect(state.errorCount).toBe(0);
        expect(state.startedAt).toBeNull();
        expect(state.lastCycleAt).toBeNull();
        expect(state.lastError).toBeNull();
    });

    it('returns a new object each call', () => {
        const a = makeCycleState();
        const b = makeCycleState();
        expect(a).not.toBe(b);
    });
});

// =============================================================================
// getCycleStatus
// =============================================================================

describe('getCycleStatus', () => {
    it('returns a copy of the cycle state for a given type', () => {
        cycleStates.synthesis.cycleCount = 5;
        const status = getCycleStatus('synthesis');
        expect(status.cycleCount).toBe(5);
    });

    it('returns a shallow copy — mutations do not affect original', () => {
        cycleStates.validation.running = false;
        const status = getCycleStatus('validation');
        status.running = true; // mutate the copy
        expect(cycleStates.validation.running).toBe(false); // original unchanged
    });
});

// =============================================================================
// getAllCycleStatuses
// =============================================================================

describe('getAllCycleStatuses', () => {
    it('returns all 8 cycle types', () => {
        const all = getAllCycleStatuses();
        const types = Object.keys(all);
        expect(types).toContain('synthesis');
        expect(types).toContain('validation');
        expect(types).toContain('questions');
        expect(types).toContain('tensions');
        expect(types).toContain('research');
        expect(types).toContain('autorating');
        expect(types).toContain('evm');
        expect(types).toContain('voicing');
    });

    it('returns copies — mutations do not affect originals', () => {
        const all = getAllCycleStatuses();
        all.synthesis.running = true;
        expect(cycleStates.synthesis.running).toBe(false);
    });
});

// =============================================================================
// runCycleLoop
// =============================================================================

describe('runCycleLoop', () => {
    it('returns success=false when cycle is already running', async () => {
        cycleStates.validation.running = true;
        const result = await runCycleLoop('validation', async () => {}, 1000, 1);
        expect(result.success).toBe(false);
        expect(result.cycles).toBe(0);
    });

    it('runs cycleFn once and stops via maxCycles=1', async () => {
        const cycleFn = jest.fn<() => Promise<void>>().mockImplementation(async () => {
            // Set shouldStop so abortableSleep exits on the first poll (~100ms)
            cycleStates.validation.shouldStop = true;
        });

        const result = await runCycleLoop('validation', cycleFn, 500, 1);

        expect(result.success).toBe(true);
        expect(cycleFn).toHaveBeenCalledTimes(1);
        expect(result.cycles).toBe(1);
    }, 2000);

    it('sets running=false after completion', async () => {
        const cycleFn = jest.fn<() => Promise<void>>().mockImplementation(async () => {
            cycleStates.questions.shouldStop = true;
        });

        await runCycleLoop('questions', cycleFn, 500, 1);

        expect(cycleStates.questions.running).toBe(false);
    }, 2000);

    it('counts errors from cycleFn exceptions', async () => {
        // Use a short interval so abortableSleep exits quickly
        mockAppConfig.autonomousCycles.tensions = { intervalMs: 150 };
        let callCount = 0;
        const cycleFn = jest.fn<() => Promise<void>>().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('test error');
            // Stop after 2nd call
            cycleStates.tensions.shouldStop = true;
        });

        const result = await runCycleLoop('tensions', cycleFn, 150, 2);

        expect(result.success).toBe(true);
        expect(cycleStates.tensions.errorCount).toBe(1);
    }, 3000);

    it('emits start and stop activity events', async () => {
        const cycleFn = jest.fn<() => Promise<void>>().mockImplementation(async () => {
            cycleStates.research.shouldStop = true;
        });

        await runCycleLoop('research', cycleFn, 500, 1);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_start', expect.stringContaining('research'), expect.any(Object)
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_stop', expect.stringContaining('research'), expect.any(Object)
        );
    }, 2000);
});
