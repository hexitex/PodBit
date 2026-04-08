/**
 * @module core/autotune/state
 *
 * Singleton state management for the auto-tune engine.
 * Provides progress tracking, cancellation, and reset functionality.
 */

import { emitActivity } from '../../services/event-bus.js';
import type { AutoTuneProgress } from './types.js';

// =============================================================================
// SINGLETON STATE
// =============================================================================

export let tuneState: AutoTuneProgress = {
    status: 'idle',
    currentSubsystem: null,
    currentCombo: 0,
    totalCombos: 0,
    subsystemsComplete: 0,
    subsystemsTotal: 0,
    results: [],
    startedAt: null,
};

export let cancelFlag = false;

/** Sets the cancel flag so the running autotune job can exit. */
export function setCancelFlag(value: boolean): void {
    cancelFlag = value;
}

/** Replaces the current autotune progress state (used by autotune runner). */
export function setTuneState(newState: AutoTuneProgress): void {
    tuneState = newState;
}

/** Returns a copy of the current autotune progress for UI display. */
export function getAutoTuneProgress(): AutoTuneProgress {
    return { ...tuneState };
}

/** Requests cancellation of the running autotune job and emits activity. */
export function cancelAutoTune(): void {
    cancelFlag = true;
    // Force-reset state if stuck (e.g. server didn't restart cleanly)
    if (tuneState.status === 'running') {
        tuneState.status = 'cancelled';
    }
    emitActivity('config', 'autotune_cancel', 'Auto-tune cancel requested');
}

/** Resets autotune state to idle when not running (e.g. after completion or cancel). */
export function resetAutoTune(): void {
    if (tuneState.status === 'running') return; // Don't reset a running job
    tuneState = {
        status: 'idle',
        currentSubsystem: null,
        currentCombo: 0,
        totalCombos: 0,
        subsystemsComplete: 0,
        subsystemsTotal: 0,
        results: [],
        startedAt: null,
    };
}
