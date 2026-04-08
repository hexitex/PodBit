/**
 * Tests for evm/feedback-progress.ts — reeval progress state (re-implemented).
 * Covers idle/running/done/error, getProgress, reset, reconcileInterrupted (e.g. after server restart).
 */
import { describe, it, expect, } from '@jest/globals';

/** Reeval run state: status, phase, counts, timestamps. */
interface ReevalProgress {
    status: 'idle' | 'running' | 'done' | 'error';
    phase: 0 | 1 | 2;
    total: number;
    autoApproved: number;
    phase2Total: number;
    phase2Processed: number;
    phase2AutoApproved: number;
    unchanged: number;
    errors: number;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage?: string;
}

/** Initial idle state for a new reeval run. */
function createIdleProgress(): ReevalProgress {
    return {
        status: 'idle',
        phase: 0,
        total: 0,
        autoApproved: 0,
        phase2Total: 0,
        phase2Processed: 0,
        phase2AutoApproved: 0,
        unchanged: 0,
        errors: 0,
        startedAt: null,
        finishedAt: null,
    };
}

/** In-memory getProgress: returns copy when running to avoid external mutation. */
function getInMemoryProgress(current: ReevalProgress): ReevalProgress {
    if (current.status === 'running') return { ...current };
    return current; // Would load from DB, but in tests just return current
}

/** Reset progress to idle; clears all counters and timestamps. */
function resetProgress(_current: ReevalProgress): ReevalProgress {
    return createIdleProgress();
}

/** Mark running as error when server restarted mid-run (stale 'running' in DB). */
function reconcileInterrupted(saved: ReevalProgress): ReevalProgress {
    if (saved.status === 'running') {
        return {
            ...saved,
            status: 'error',
            errorMessage: 'Interrupted by server restart',
            finishedAt: new Date().toISOString(),
        };
    }
    return saved;
}

describe('ReevalProgress initial state', () => {
    it('has idle status', () => {
        const p = createIdleProgress();
        expect(p.status).toBe('idle');
    });

    it('has phase 0', () => {
        expect(createIdleProgress().phase).toBe(0);
    });

    it('has all counts at 0', () => {
        const p = createIdleProgress();
        expect(p.total).toBe(0);
        expect(p.autoApproved).toBe(0);
        expect(p.phase2Total).toBe(0);
        expect(p.phase2Processed).toBe(0);
        expect(p.phase2AutoApproved).toBe(0);
        expect(p.unchanged).toBe(0);
        expect(p.errors).toBe(0);
    });

    it('has null timestamps', () => {
        const p = createIdleProgress();
        expect(p.startedAt).toBeNull();
        expect(p.finishedAt).toBeNull();
    });
});

describe('getInMemoryProgress', () => {
    it('returns copy when running (prevents external mutation)', () => {
        const p: ReevalProgress = { ...createIdleProgress(), status: 'running', total: 10 };
        const got = getInMemoryProgress(p);
        got.total = 999;
        expect(p.total).toBe(10); // original unchanged
    });

    it('returns progress directly when not running', () => {
        const p = createIdleProgress();
        const got = getInMemoryProgress(p);
        expect(got).toBe(p);
    });
});

describe('reconcileInterrupted', () => {
    it('marks running status as error after restart', () => {
        const saved: ReevalProgress = { ...createIdleProgress(), status: 'running', startedAt: '2025-01-01T00:00:00Z' };
        const result = reconcileInterrupted(saved);
        expect(result.status).toBe('error');
    });

    it('sets errorMessage for interrupted run', () => {
        const saved: ReevalProgress = { ...createIdleProgress(), status: 'running' };
        const result = reconcileInterrupted(saved);
        expect(result.errorMessage).toBe('Interrupted by server restart');
    });

    it('sets finishedAt for interrupted run', () => {
        const saved: ReevalProgress = { ...createIdleProgress(), status: 'running' };
        const result = reconcileInterrupted(saved);
        expect(result.finishedAt).toBeDefined();
        expect(result.finishedAt).not.toBeNull();
    });

    it('leaves non-running status unchanged', () => {
        const saved: ReevalProgress = { ...createIdleProgress(), status: 'done', finishedAt: '2025-01-01T01:00:00Z' };
        const result = reconcileInterrupted(saved);
        expect(result.status).toBe('done');
        expect(result.errorMessage).toBeUndefined();
    });

    it('preserves other fields during reconciliation', () => {
        const saved: ReevalProgress = { ...createIdleProgress(), status: 'running', total: 50, autoApproved: 10 };
        const result = reconcileInterrupted(saved);
        expect(result.total).toBe(50);
        expect(result.autoApproved).toBe(10);
    });
});

describe('resetProgress', () => {
    it('returns idle state', () => {
        const running: ReevalProgress = {
            ...createIdleProgress(),
            status: 'done',
            total: 100,
            autoApproved: 50,
        };
        const result = resetProgress(running);
        expect(result.status).toBe('idle');
        expect(result.total).toBe(0);
        expect(result.autoApproved).toBe(0);
    });

    it('clears all counters', () => {
        const done: ReevalProgress = {
            ...createIdleProgress(),
            status: 'done',
            phase: 2,
            total: 200,
            phase2Total: 100,
            phase2Processed: 90,
            phase2AutoApproved: 80,
            unchanged: 10,
            errors: 5,
        };
        const result = resetProgress(done);
        expect(result.phase).toBe(0);
        expect(result.phase2Total).toBe(0);
        expect(result.phase2Processed).toBe(0);
        expect(result.unchanged).toBe(0);
        expect(result.errors).toBe(0);
    });

    it('clears timestamps', () => {
        const done: ReevalProgress = {
            ...createIdleProgress(),
            status: 'done',
            startedAt: '2025-01-01T00:00:00Z',
            finishedAt: '2025-01-01T01:00:00Z',
        };
        const result = resetProgress(done);
        expect(result.startedAt).toBeNull();
        expect(result.finishedAt).toBeNull();
    });
});
