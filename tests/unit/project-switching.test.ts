/**
 * Tests for handlers/projects/meta.ts — project switching state management.
 * State re-implemented: isProjectSwitching, setProjectSwitching, getProjectAbortSignal, resetAbortController.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

/** In-memory project switch flag + AbortController for cancelling in-flight requests during switch. */
function createProjectSwitchingState() {
    let _projectSwitching = false;
    let _switchAbortController = new AbortController();

    return {
        isProjectSwitching(): boolean {
            return _projectSwitching;
        },
        setProjectSwitching(value: boolean): void {
            _projectSwitching = value;
        },
        getProjectAbortSignal(): AbortSignal {
            return _switchAbortController.signal;
        },
        getAbortController(): AbortController {
            return _switchAbortController;
        },
        resetAbortController(): void {
            _switchAbortController = new AbortController();
        },
    };
}

describe('isProjectSwitching', () => {
    let state: ReturnType<typeof createProjectSwitchingState>;

    beforeEach(() => {
        state = createProjectSwitchingState();
    });

    it('returns false initially', () => {
        expect(state.isProjectSwitching()).toBe(false);
    });

    it('returns true after setProjectSwitching(true)', () => {
        state.setProjectSwitching(true);
        expect(state.isProjectSwitching()).toBe(true);
    });

    it('returns false after setProjectSwitching(false)', () => {
        state.setProjectSwitching(true);
        state.setProjectSwitching(false);
        expect(state.isProjectSwitching()).toBe(false);
    });
});

describe('setProjectSwitching', () => {
    let state: ReturnType<typeof createProjectSwitchingState>;

    beforeEach(() => {
        state = createProjectSwitchingState();
    });

    it('sets the flag to true', () => {
        state.setProjectSwitching(true);
        expect(state.isProjectSwitching()).toBe(true);
    });

    it('sets the flag to false', () => {
        state.setProjectSwitching(true);
        state.setProjectSwitching(false);
        expect(state.isProjectSwitching()).toBe(false);
    });

    it('is idempotent for same value', () => {
        state.setProjectSwitching(true);
        state.setProjectSwitching(true);
        expect(state.isProjectSwitching()).toBe(true);
    });
});

describe('getProjectAbortSignal', () => {
    let state: ReturnType<typeof createProjectSwitchingState>;

    beforeEach(() => {
        state = createProjectSwitchingState();
    });

    it('returns an AbortSignal', () => {
        const signal = state.getProjectAbortSignal();
        expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('signal is not aborted initially', () => {
        expect(state.getProjectAbortSignal().aborted).toBe(false);
    });

    it('aborting the controller aborts the signal', () => {
        const controller = state.getAbortController();
        controller.abort();
        expect(state.getProjectAbortSignal().aborted).toBe(true);
    });

    it('returns the same signal before reset', () => {
        const s1 = state.getProjectAbortSignal();
        const s2 = state.getProjectAbortSignal();
        expect(s1).toBe(s2);
    });
});

describe('resetAbortController', () => {
    let state: ReturnType<typeof createProjectSwitchingState>;

    beforeEach(() => {
        state = createProjectSwitchingState();
    });

    it('creates a new AbortController after reset', () => {
        const before = state.getAbortController();
        state.resetAbortController();
        const after = state.getAbortController();
        expect(after).not.toBe(before);
    });

    it('new controller signal is not aborted', () => {
        // Abort original controller
        state.getAbortController().abort();
        expect(state.getProjectAbortSignal().aborted).toBe(true);

        // Reset should give a fresh, non-aborted signal
        state.resetAbortController();
        expect(state.getProjectAbortSignal().aborted).toBe(false);
    });

    it('old aborted signal remains aborted after reset', () => {
        const oldSignal = state.getProjectAbortSignal();
        state.getAbortController().abort();
        state.resetAbortController();
        // Old signal is still aborted
        expect(oldSignal.aborted).toBe(true);
        // New signal is fresh
        expect(state.getProjectAbortSignal().aborted).toBe(false);
    });
});

describe('project switch workflow', () => {
    it('models a complete switch: start → abort → reset → done', () => {
        const state = createProjectSwitchingState();

        // 1. Start switch
        state.setProjectSwitching(true);
        expect(state.isProjectSwitching()).toBe(true);

        // 2. Abort inflight requests
        state.getAbortController().abort();
        expect(state.getProjectAbortSignal().aborted).toBe(true);

        // 3. Reset controller for new requests
        state.resetAbortController();
        expect(state.getProjectAbortSignal().aborted).toBe(false);

        // 4. Done
        state.setProjectSwitching(false);
        expect(state.isProjectSwitching()).toBe(false);
    });
});
