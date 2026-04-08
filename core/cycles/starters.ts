/**
 * @module core/cycles/starters
 *
 * Background cycle launchers for all autonomous cycles.
 *
 * Each starter function checks if its cycle is already running, then
 * delegates to `runCycleLoop` which handles interval timing, error
 * counting, and abort signal propagation. Returns immediately with
 * a success/failure message; the actual loop runs in the background.
 */

import { config as appConfig } from '../../config.js';
import { runCycleLoop, cycleStates } from '../synthesis-engine.js';
import { emitActivity } from '../../services/event-bus.js';
import { runValidationCycleSingle } from './validation.js';
import { runQuestionCycleSingle } from './questions.js';
import { runTensionCycleSingle } from './tensions.js';
import { runResearchCycleSingle } from './research.js';
import { runAutoratingBatch } from './autorating.js';
import { runEvmCycleSingle } from './evm.js';
import { runVoicingCycleSingle } from './voicing.js';
import { runGroundRulesCycleSingle } from './ground-rules.js';
import { runPopulationControlCycleSingle } from './population-control.js';

/**
 * Starts the validation cycle loop (breakthrough scoring).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startValidationCycle(maxCycles: number = Infinity) {
    if (cycleStates.validation.running) {
        return { success: false, message: 'Validation cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.validation;
    const promise = runCycleLoop('validation', runValidationCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[validation] Fatal error:', err));
    return { success: true, message: 'Validation cycle started' };
}

/**
 * Starts the question-answering cycle (answers unanswered question nodes).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startQuestionCycle(maxCycles: number = Infinity) {
    if (cycleStates.questions.running) {
        return { success: false, message: 'Question cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.questions;
    const promise = runCycleLoop('questions', runQuestionCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[questions] Fatal error:', err));
    return { success: true, message: 'Question cycle started' };
}

/**
 * Starts the tension-detection cycle (find contradictions, generate questions).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startTensionCycle(maxCycles: number = Infinity) {
    if (cycleStates.tensions.running) {
        return { success: false, message: 'Tension cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.tensions;
    const promise = runCycleLoop('tensions', runTensionCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[tensions] Fatal error:', err));
    return { success: true, message: 'Tension cycle started' };
}

/**
 * Starts the research cycle (generate new seeds for under-populated domains).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startResearchCycle(maxCycles: number = Infinity) {
    if (cycleStates.research.running) {
        return { success: false, message: 'Research cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.research;
    const promise = runCycleLoop('research', runResearchCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[research] Fatal error:', err));
    return { success: true, message: 'Research cycle started' };
}

/**
 * Starts the autorating cycle with custom batch-drain loop.
 *
 * Unlike other cycles that use `runCycleLoop`, autorating manages its own
 * loop because it processes batches (not single nodes) and should loop
 * immediately when there are more nodes to rate, only sleeping when the
 * backlog is drained.
 *
 * @param maxCycles - Maximum number of rated nodes before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startAutoratingCycle(maxCycles: number = Infinity) {
    if (cycleStates.autorating.running) {
        return { success: false, message: 'Autorating cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.autorating;

    const promise = (async () => {
        cycleStates.autorating.running = true;
        cycleStates.autorating.shouldStop = false;
        cycleStates.autorating.cycleCount = 0;
        cycleStates.autorating.errorCount = 0;
        cycleStates.autorating.startedAt = new Date().toISOString();
        cycleStates.autorating.lastError = null;

        console.error(`[podbit] autorating cycle starting`);
        emitActivity('cycle', 'autorating_start', 'Autorating started', { cycleType: 'autorating', intervalMs: cfg.intervalMs });

        try {
            while (!cycleStates.autorating.shouldStop && cycleStates.autorating.cycleCount < maxCycles) {
                let processed = 0;
                try {
                    processed = await runAutoratingBatch();
                    cycleStates.autorating.lastError = null;
                } catch (err: any) {
                    if (err.name === 'AbortError') {
                        console.warn(`[autorating] batch aborted (project switch)`);
                        break;
                    }
                    cycleStates.autorating.errorCount++;
                    cycleStates.autorating.lastError = err.message || String(err);
                    console.error(`[autorating] batch error (${cycleStates.autorating.errorCount} total): ${err.message}`);
                    emitActivity('cycle', 'autorating_error', `autorating error: ${err.message}`, { cycleType: 'autorating', errorCount: cycleStates.autorating.errorCount });
                }

                cycleStates.autorating.cycleCount += Math.max(1, processed);
                cycleStates.autorating.lastCycleAt = new Date().toISOString();

                // Backlog drained — sleep until new nodes may appear (abortable so stop signal is responsive)
                if (processed === 0) {
                    const { abortableSleep } = await import('../synthesis-engine-state.js');
                    await abortableSleep(cfg.intervalMs, () => cycleStates.autorating.shouldStop);
                }
                // If processed > 0, loop immediately to check for more
            }

            console.error(`[podbit] autorating cycle stopped after ${cycleStates.autorating.cycleCount} ratings (${cycleStates.autorating.errorCount} errors)`);
            emitActivity('cycle', 'autorating_stop', `autorating stopped after ${cycleStates.autorating.cycleCount} ratings`, { cycleType: 'autorating', cycles: cycleStates.autorating.cycleCount, errors: cycleStates.autorating.errorCount });
            return { success: true, cycles: cycleStates.autorating.cycleCount };
        } finally {
            cycleStates.autorating.running = false;
            cycleStates.autorating.shouldStop = false;
        }
    })();

    promise.catch(err => console.error('[autorating] Fatal error:', err));
    return { success: true, message: 'Autorating started' };
}

/**
 * Starts the EVM verification cycle (verify unverified nodes).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startEvmCycle(maxCycles: number = Infinity) {
    if (cycleStates.evm.running) {
        return { success: false, message: 'EVM cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.evm;
    const promise = runCycleLoop('evm', runEvmCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[evm] Fatal error:', err));
    return { success: true, message: 'EVM cycle started' };
}

/**
 * Starts the voicing cycle (persona-driven synthesis of node pairs).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startVoicingCycle(maxCycles: number = Infinity) {
    if (cycleStates.voicing.running) {
        return { success: false, message: 'Voicing cycle already running' };
    }
    const cfg = appConfig.autonomousCycles.voicing;
    const promise = runCycleLoop('voicing', runVoicingCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[voicing] Fatal error:', err));
    return { success: true, message: 'Voicing cycle started' };
}

/**
 * Starts the ground rules classification cycle via runCycleLoop.
 * One node per tick, paced by intervalMs — same pattern as all other cycles.
 *
 * @param maxCycles - Maximum ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startGroundRulesCycle(maxCycles: number = Infinity) {
    if (cycleStates.ground_rules.running) {
        return { success: false, message: 'Ground rules cycle already running' };
    }
    const cfg = appConfig.groundRules;
    const promise = runCycleLoop('ground_rules', runGroundRulesCycleSingle, cfg.intervalMs, maxCycles);
    promise.catch(err => console.error('[ground_rules] Fatal error:', err));
    return { success: true, message: 'Ground rules cycle started' };
}

/**
 * Starts the population control cycle (post-birth quality evaluation).
 * Returns immediately; the loop runs in the background.
 *
 * @param maxCycles - Maximum number of cycle ticks before stopping (default: Infinity)
 * @returns Object with `success` boolean and `message` string
 */
async function startPopulationControlCycle(maxCycles: number = Infinity) {
    if (cycleStates.population_control.running) {
        return { success: false, message: 'Population control cycle already running' };
    }
    const intervalMs = appConfig.populationControl.intervalMs ?? 120000;
    const promise = runCycleLoop('population_control', runPopulationControlCycleSingle, intervalMs, maxCycles);
    promise.catch(err => console.error('[population_control] Fatal error:', err));
    return { success: true, message: 'Population control cycle started' };
}

export {
    startValidationCycle,
    startQuestionCycle,
    startTensionCycle,
    startResearchCycle,
    startAutoratingCycle,
    startEvmCycle,
    startVoicingCycle,
    startGroundRulesCycle,
    startPopulationControlCycle,
};
