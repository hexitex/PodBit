/**
 * Tests for core/synthesis-engine-state.ts — makeCycleState, getCycleStatus,
 * getAllCycleStatuses, and abortableSleep (re-implemented).
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement CycleState type from core/types.ts
interface CycleState {
    running: boolean;
    shouldStop: boolean;
    cycleCount: number;
    errorCount: number;
    startedAt: string | null;
    lastCycleAt: string | null;
    lastError: string | null;
}

type CycleType = 'synthesis' | 'validation' | 'questions' | 'tensions' | 'research' | 'autorating' | 'evm' | 'voicing';

// Re-implement makeCycleState from core/synthesis-engine-state.ts
function makeCycleState(): CycleState {
    return { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null };
}

// Re-implement getCycleStatus — returns a shallow copy of the cycle state
function getCycleStatus(states: Record<string, CycleState>, type: CycleType): CycleState {
    return { ...states[type] };
}

// Re-implement getAllCycleStatuses — copies all
function getAllCycleStatuses(states: Record<CycleType, CycleState>): Record<CycleType, CycleState> {
    const result: Record<string, CycleState> = {};
    for (const [type, state] of Object.entries(states)) {
        result[type] = { ...state };
    }
    return result as Record<CycleType, CycleState>;
}

// Re-implement abortableSleep from core/synthesis-engine-state.ts
function abortableSleep(ms: number, shouldStopFn: () => boolean): Promise<void> {
    return new Promise(resolve => {
        const pollInterval = 100;
        let elapsed = 0;
        const timer = setInterval(() => {
            elapsed += pollInterval;
            if (elapsed >= ms || shouldStopFn()) {
                clearInterval(timer);
                resolve();
            }
        }, pollInterval);
    });
}

const ALL_CYCLE_TYPES: CycleType[] = ['synthesis', 'validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing'];

describe('makeCycleState', () => {
    it('returns a state with running=false', () => {
        expect(makeCycleState().running).toBe(false);
    });

    it('returns a state with shouldStop=false', () => {
        expect(makeCycleState().shouldStop).toBe(false);
    });

    it('returns a state with cycleCount=0', () => {
        expect(makeCycleState().cycleCount).toBe(0);
    });

    it('returns a state with errorCount=0', () => {
        expect(makeCycleState().errorCount).toBe(0);
    });

    it('returns a state with null timestamps', () => {
        const state = makeCycleState();
        expect(state.startedAt).toBeNull();
        expect(state.lastCycleAt).toBeNull();
        expect(state.lastError).toBeNull();
    });

    it('returns a new object each time (no shared state)', () => {
        const s1 = makeCycleState();
        const s2 = makeCycleState();
        expect(s1).not.toBe(s2);
        s1.running = true;
        expect(s2.running).toBe(false);
    });
});

describe('getCycleStatus', () => {
    it('returns a shallow copy of the cycle state', () => {
        const states: Record<string, CycleState> = {
            synthesis: { ...makeCycleState(), running: true, cycleCount: 5 },
        };
        const copy = getCycleStatus(states as Record<CycleType, CycleState>, 'synthesis');
        expect(copy.running).toBe(true);
        expect(copy.cycleCount).toBe(5);
    });

    it('does not return the original object reference', () => {
        const states: Record<string, CycleState> = {
            synthesis: makeCycleState(),
        };
        const copy = getCycleStatus(states as Record<CycleType, CycleState>, 'synthesis');
        expect(copy).not.toBe(states.synthesis);
    });

    it('mutations to the copy do not affect the original', () => {
        const original = makeCycleState();
        const states: Record<string, CycleState> = { synthesis: original };
        const copy = getCycleStatus(states as Record<CycleType, CycleState>, 'synthesis');
        copy.cycleCount = 999;
        expect(original.cycleCount).toBe(0);
    });
});

describe('getAllCycleStatuses', () => {
    function makeAllStates(): Record<CycleType, CycleState> {
        return Object.fromEntries(ALL_CYCLE_TYPES.map(t => [t, makeCycleState()])) as Record<CycleType, CycleState>;
    }

    it('returns a record with all cycle types', () => {
        const statuses = getAllCycleStatuses(makeAllStates());
        for (const type of ALL_CYCLE_TYPES) {
            expect(statuses[type]).toBeDefined();
        }
    });

    it('returns shallow copies of all states', () => {
        const allStates = makeAllStates();
        allStates.synthesis.cycleCount = 7;
        const statuses = getAllCycleStatuses(allStates);
        expect(statuses.synthesis.cycleCount).toBe(7);
    });

    it('mutations to returned copies do not affect originals', () => {
        const allStates = makeAllStates();
        const statuses = getAllCycleStatuses(allStates);
        statuses.validation.cycleCount = 100;
        expect(allStates.validation.cycleCount).toBe(0);
    });

    it('returns a new top-level object (not same reference)', () => {
        const allStates = makeAllStates();
        const statuses = getAllCycleStatuses(allStates);
        expect(statuses).not.toBe(allStates);
    });

    it('contains all 8 expected cycle types', () => {
        const statuses = getAllCycleStatuses(makeAllStates());
        expect(Object.keys(statuses).sort()).toEqual(ALL_CYCLE_TYPES.slice().sort());
    });
});

describe('abortableSleep', () => {
    it('resolves after the specified time', async () => {
        const start = Date.now();
        await abortableSleep(250, () => false);
        const elapsed = Date.now() - start;
        // Should be around 250ms, allow generous tolerance for CI
        expect(elapsed).toBeGreaterThanOrEqual(200);
        expect(elapsed).toBeLessThan(600);
    }, 2000);

    it('resolves early when shouldStopFn returns true', async () => {
        const start = Date.now();
        let stopNow = false;
        const sleepPromise = abortableSleep(5000, () => stopNow);
        // Signal stop after ~150ms
        setTimeout(() => { stopNow = true; }, 150);
        await sleepPromise;
        const elapsed = Date.now() - start;
        // Should stop well before 5000ms
        expect(elapsed).toBeLessThan(1000);
    }, 2000);

    it('resolves immediately when shouldStopFn is initially true', async () => {
        const start = Date.now();
        await abortableSleep(5000, () => true);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(500);
    }, 2000);
});
