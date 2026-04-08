/**
 * Synthesis engine — cycle state management and generic loop runner.
 * Extracted from synthesis-engine.ts: CycleState management, abortable sleep, runCycleLoop.
 */

import { config as appConfig } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import type { CycleType, CycleState } from './types.js';

// =============================================================================
// RESOURCE PAUSE — lab resource lock pauses all autonomous cycles
// =============================================================================

let _resourcePaused = false;

/** Pause all autonomous cycles (called when a lab acquires a resource lock) */
export function pauseAllCycles(): void { _resourcePaused = true; }

/** Resume all autonomous cycles (called when the resource lock is released) */
export function resumeAllCycles(): void { _resourcePaused = false; }

/** Check if cycles are paused due to a resource lock */
export function isCyclesPaused(): boolean { return _resourcePaused; }

// =============================================================================
// ABORTABLE SLEEP
// =============================================================================

/**
 * Abortable sleep — resolves after `ms` milliseconds OR when `shouldStopFn()`
 * returns true, whichever comes first.
 *
 * Internally polls every 100 ms, so stop signals (e.g. GUI "stop cycle" button
 * setting `cycleStates[type].shouldStop = true`) take effect within ~100 ms
 * rather than waiting for the full sleep duration.
 *
 * @param ms - Maximum sleep duration in milliseconds.
 * @param shouldStopFn - Predicate checked every 100 ms; returning `true` terminates the sleep early.
 * @returns A promise that resolves (with `void`) when either the timer expires or the stop condition is met.
 */
export function abortableSleep(ms: number, shouldStopFn: () => boolean): Promise<void> {
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

// =============================================================================
// UNIFIED CYCLE STATE MANAGEMENT
// =============================================================================

/**
 * Create a fresh {@link CycleState} with all counters zeroed and flags cleared.
 *
 * @returns A new `CycleState` object ready for use.
 */
export function makeCycleState(): CycleState {
    return { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null };
}

/**
 * Mutable runtime state map for all autonomous cycle types.
 *
 * This is the single source of truth for whether each cycle is running,
 * should stop, and how many iterations/errors it has accumulated. The GUI
 * reads snapshots via `getCycleStatus`/`getAllCycleStatuses`; cycle runners
 * mutate entries directly. Initialized with all cycles idle.
 */
export const cycleStates: Record<CycleType, CycleState> = {
    synthesis: makeCycleState(),
    validation: makeCycleState(),
    questions: makeCycleState(),
    tensions: makeCycleState(),
    research: makeCycleState(),
    autorating: makeCycleState(),
    evm: makeCycleState(),
    voicing: makeCycleState(),
    ground_rules: makeCycleState(),
    population_control: makeCycleState(),
};

/**
 * Return a snapshot (shallow copy) of the current state for a given cycle type.
 *
 * @param type - The cycle type to query.
 * @returns A copy of the {@link CycleState} for `type`.
 */
export function getCycleStatus(type: CycleType): CycleState {
    return { ...cycleStates[type] };
}

/**
 * Return shallow-copy snapshots of all cycle states, keyed by {@link CycleType}.
 *
 * @returns An object mapping every cycle type to its current {@link CycleState}.
 */
export function getAllCycleStatuses(): Record<CycleType, CycleState> {
    const result: Record<string, CycleState> = {};
    for (const [type, state] of Object.entries(cycleStates)) {
        result[type] = { ...state };
    }
    return result as Record<CycleType, CycleState>;
}

/**
 * Generic cycle runner — used by autonomous-cycles.ts to run validation/question/tension loops.
 *
 * Executes `cycleFn` repeatedly, sleeping for the configured interval between
 * iterations (abortable via the cycle's `shouldStop` flag). Returns when
 * `shouldStop` is set or `maxCycles` is reached.
 *
 * The sleep interval is hot-reloaded from `appConfig.autonomousCycles[type]`
 * each tick so GUI slider changes take effect immediately.
 *
 * @param type - The cycle type (used to look up / update shared state in {@link cycleStates}).
 * @param cycleFn - The async function to execute each iteration.
 * @param intervalMs - Default interval in milliseconds between cycles (overridden by config if available).
 * @param maxCycles - Maximum number of iterations before auto-stopping (default `Infinity`).
 * @returns `{ success: true, cycles }` on normal completion, or `{ success: false, cycles: 0 }` if the cycle was already running.
 */
export async function runCycleLoop(
    type: CycleType,
    cycleFn: () => Promise<void>,
    intervalMs: number,
    maxCycles: number = Infinity,
): Promise<{ success: boolean; cycles: number }> {
    if (cycleStates[type].running) {
        return { success: false, cycles: 0 };
    }

    cycleStates[type].running = true;
    cycleStates[type].shouldStop = false;
    cycleStates[type].cycleCount = 0;
    cycleStates[type].errorCount = 0;
    cycleStates[type].startedAt = new Date().toISOString();
    cycleStates[type].lastError = null;

    console.error(`[podbit] ${type} cycle starting`);
    emitActivity('cycle', `${type}_start`, `${type} cycle started`, { cycleType: type, intervalMs });

    try {
        while (!cycleStates[type].shouldStop && cycleStates[type].cycleCount < maxCycles) {
            // Wait while resource-paused (lab using local resources)
            while (_resourcePaused && !cycleStates[type].shouldStop) {
                await abortableSleep(2000, () => cycleStates[type].shouldStop || !_resourcePaused);
            }
            if (cycleStates[type].shouldStop) break;

            const cycleStart = Date.now();

            try {
                await cycleFn();
                cycleStates[type].lastError = null;
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.warn(`[${type}] cycle aborted (project switch)`);
                    break;
                }
                cycleStates[type].errorCount++;
                cycleStates[type].lastError = err.message || String(err);
                console.error(`[${type}] cycle error (${cycleStates[type].errorCount} total): ${err.message}`);
                emitActivity('cycle', `${type}_error`, `${type} error: ${err.message}`, { cycleType: type, errorCount: cycleStates[type].errorCount });
            }

            // Always increment — cycleCount tracks attempts, errorCount tracks failures
            cycleStates[type].cycleCount++;
            cycleStates[type].lastCycleAt = new Date().toISOString();

            // Hot-reload interval from config — GUI slider changes take effect on next tick
            const cycleConfig = type !== 'synthesis'
                ? (appConfig.autonomousCycles as any)[type]
                : null;
            const currentInterval = cycleConfig?.intervalMs ?? intervalMs;

            // Smart interval: sleep only the remaining time (abortable — wakes on stop signal)
            const elapsed = Date.now() - cycleStart;
            const sleepMs = Math.max(1000, currentInterval - elapsed);
            await abortableSleep(sleepMs, () => cycleStates[type].shouldStop);
        }

        console.error(`[podbit] ${type} cycle stopped after ${cycleStates[type].cycleCount} cycles (${cycleStates[type].errorCount} errors)`);
        emitActivity('cycle', `${type}_stop`, `${type} cycle stopped after ${cycleStates[type].cycleCount} cycles`, { cycleType: type, cycles: cycleStates[type].cycleCount, errors: cycleStates[type].errorCount });
        return { success: true, cycles: cycleStates[type].cycleCount };
    } finally {
        cycleStates[type].running = false;
        cycleStates[type].shouldStop = false;
    }
}
