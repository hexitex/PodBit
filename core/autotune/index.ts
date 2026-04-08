/**
 * @module core/autotune
 *
 * Auto-Tune Engine — automated hyperparameter optimization for LLM subsystems.
 *
 * Searches over a grid of sampling parameters (temperature, topP, minP, topK,
 * repeatPenalty) to find the best settings for each subsystem's assigned model.
 * Supports cross-subsystem seeding (readers share params), consultant tuning,
 * variance-weighted selection when top combos converge, and gold-standard
 * reference scoring.
 */

import { getSubsystemAssignments, getConsultantAssignments } from '../../models.js';
import { config as appConfig } from '../../config.js';
import { emitActivity } from '../../services/event-bus.js';
import type { Subsystem } from '../../models.js';
import type { AutoTuneConfig, ParamCombo } from './types.js';
import { READER_SUBSYSTEMS } from './scoring.js';
import { groupByModel, consolidateReaders } from './combinatorics.js';
import { tuneSubsystem } from './execution.js';
import { tuneState, cancelFlag, setCancelFlag, setTuneState } from './state.js';

// Re-export everything from sub-modules
export * from './types.js';
export * from './scoring.js';
export * from './gold-standards.js';
export * from './combinatorics.js';
export * from './execution.js';
export * from './state.js';

// =============================================================================
// MAIN ENGINE
// =============================================================================

/**
 * Start the auto-tune process for one or more subsystems.
 *
 * Resolves subsystem assignments, consolidates text readers (tune one, inherit
 * to others), groups by model for cross-subsystem seeding, then tunes each
 * subsystem. Readers within the same model group use seeded refinement;
 * non-readers always get full independent search. Consultant subsystems
 * (prefixed with `c:`) are tuned independently after primary subsystems.
 *
 * @param config - Auto-tune configuration specifying subsystems, runsPerCombo,
 *                 maxCombos, and convergenceThreshold
 * @throws Error if auto-tune is already running
 */
export async function startAutoTune(config: AutoTuneConfig): Promise<void> {
    if (tuneState.status === 'running') {
        throw new Error('Auto-tune already running');
    }

    setCancelFlag(false);

    const assignments = await getSubsystemAssignments();
    const consultantAssignments = await getConsultantAssignments();

    // Separate consultant keys (c:voice) from primary keys
    const consultantKeys: string[] = [];
    let subsystems: string[] = [];

    for (const key of (config.subsystems || [])) {
        if (key.startsWith('c:')) {
            const sub = key.slice(2);
            if (consultantAssignments[sub as Subsystem]) consultantKeys.push(sub);
        } else {
            subsystems.push(key);
        }
    }

    // If no subsystems specified, use all with assigned models (except embedding)
    if (subsystems.length === 0 && consultantKeys.length === 0) {
        subsystems = Object.entries(assignments)
            .filter(([k, v]) => v && k !== 'embedding')
            .map(([k]) => k);
    }

    // Filter to only subsystems with assigned models
    subsystems = subsystems.filter(s => assignments[s as Subsystem]);

    // Consolidate text readers: only tune one representative
    const { toTune, inherited } = consolidateReaders(subsystems);

    // Group by assigned model for cross-subsystem seeding
    const modelGroups = groupByModel(toTune, assignments);

    // Count total subsystems (tuned + inherited + consultants)
    const totalToTune = toTune.length;
    const totalInherited = inherited.size;
    const totalConsultants = consultantKeys.length;

    setTuneState({
        status: 'running',
        currentSubsystem: null,
        currentCombo: 0,
        totalCombos: 0,
        subsystemsComplete: 0,
        subsystemsTotal: totalToTune + totalInherited + totalConsultants,
        results: [],
        startedAt: new Date().toISOString(),
    });

    emitActivity('config', 'autotune_start',
        `Auto-tuning ${totalToTune} subsystem(s)` +
        (totalInherited > 0 ? ` + ${totalInherited} inherited` : '') +
        (totalConsultants > 0 ? ` + ${totalConsultants} consultant(s)` : ''),
        { subsystems: toTune, inherited: [...inherited.keys()], consultants: consultantKeys, runsPerCombo: config.runsPerCombo, maxCombos: config.maxCombos },
    );

    try {
        // Process each model group — seeded refinement ONLY within reader subsystems.
        // Non-reader subsystems always get full independent search because they have
        // fundamentally different intents (voice=creative, compress=deterministic, etc.).
        for (const [_modelId, groupSubsystems] of modelGroups) {
            if (cancelFlag) break;

            // Separate readers from non-readers within this model group
            const readers = groupSubsystems.filter(s => READER_SUBSYSTEMS.has(s));
            const nonReaders = groupSubsystems.filter(s => !READER_SUBSYSTEMS.has(s));

            // Readers: first gets full search, rest get seeded refinement
            let readerSeed: ParamCombo | null = null;
            let readerSeedFrom: string | null = null;
            for (const subsystem of readers) {
                if (cancelFlag) break;
                const model = assignments[subsystem as Subsystem];
                if (!model) continue;

                tuneState.currentSubsystem = subsystem;
                const phase = readerSeed ? 'refinement' : 'full';
                emitActivity('config', 'autotune_subsystem',
                    `Tuning ${subsystem} (${model.name}) [${phase}]` +
                    (readerSeedFrom ? ` — seeded from ${readerSeedFrom}` : ''),
                    { subsystem, model: model.name, phase, seedFrom: readerSeedFrom },
                );

                const { result, bestCombo } = await tuneSubsystem(subsystem, model, config, readerSeed);
                if (readerSeedFrom) result.seedFrom = readerSeedFrom;

                tuneState.results.push(result);
                tuneState.subsystemsComplete++;

                emitActivity('config', 'autotune_subsystem_done',
                    `${subsystem}: best ${(result.bestScore * 100).toFixed(1)}% (was ${(result.currentScore * 100).toFixed(1)}%) [${phase}]`,
                    { subsystem, bestScore: result.bestScore, currentScore: result.currentScore, improvement: result.improvement, phase },
                );

                readerSeed = bestCombo;
                if (!readerSeedFrom) readerSeedFrom = subsystem;
            }

            // Non-readers: always full independent search — different intents need different params
            for (const subsystem of nonReaders) {
                if (cancelFlag) break;
                const model = assignments[subsystem as Subsystem];
                if (!model) continue;

                tuneState.currentSubsystem = subsystem;
                emitActivity('config', 'autotune_subsystem',
                    `Tuning ${subsystem} (${model.name}) [full]`,
                    { subsystem, model: model.name, phase: 'full' },
                );

                const { result } = await tuneSubsystem(subsystem, model, config, null);

                tuneState.results.push(result);
                tuneState.subsystemsComplete++;

                emitActivity('config', 'autotune_subsystem_done',
                    `${subsystem}: best ${(result.bestScore * 100).toFixed(1)}% (was ${(result.currentScore * 100).toFixed(1)}%) [full]`,
                    { subsystem, bestScore: result.bestScore, currentScore: result.currentScore, improvement: result.improvement, phase: 'full' },
                );
            }
        }

        // Add inherited results for consolidated text readers
        for (const [inheritingSub, leaderSub] of inherited) {
            const leaderResult = tuneState.results.find(r => r.subsystem === leaderSub);
            if (leaderResult) {
                const currentParams: ParamCombo = {
                    temperature: (appConfig as any).subsystemTemperatures?.[inheritingSub] ?? 0.7,
                    topP: (appConfig as any).subsystemTopP?.[inheritingSub] ?? 0.9,
                    minP: (appConfig as any).subsystemMinP?.[inheritingSub] ?? 0,
                    topK: (appConfig as any).subsystemTopK?.[inheritingSub] ?? 0,
                    repeatPenalty: (appConfig as any).subsystemRepeatPenalties?.[inheritingSub] ?? 1.0,
                };
                const currentScore = 0; // not tested independently
                tuneState.results.push({
                    subsystem: inheritingSub,
                    modelName: leaderResult.modelName,
                    bestCombo: leaderResult.bestCombo,
                    bestScore: leaderResult.bestScore,
                    allResults: [],
                    currentParams,
                    currentScore,
                    improvement: 0,
                    testedCombos: 0,
                    totalCombos: 0,
                    elapsedMs: 0,
                    phase: 'inherited',
                    seedFrom: leaderSub,
                });
                tuneState.subsystemsComplete++;

                emitActivity('config', 'autotune_subsystem_done',
                    `${inheritingSub}: inherited from ${leaderSub} (${(leaderResult.bestScore * 100).toFixed(1)}%)`,
                    { subsystem: inheritingSub, phase: 'inherited', seedFrom: leaderSub },
                );
            }
        }

        // =====================================================================
        // CONSULTANT TUNING — independent full search per consultant subsystem
        // Consultants are quality-gating models with different requirements.
        // No seeded refinement — each consultant tunes independently.
        // =====================================================================
        if (consultantKeys.length > 0 && !cancelFlag) {
            emitActivity('config', 'autotune_start',
                `Tuning ${consultantKeys.length} consultant subsystem(s)`,
                { subsystems: consultantKeys.map(k => `c:${k}`), consultant: true },
            );

            for (const subsystem of consultantKeys) {
                if (cancelFlag) break;
                const model = consultantAssignments[subsystem as Subsystem];
                if (!model) continue;

                const displayName = `c:${subsystem}`;
                tuneState.currentSubsystem = displayName;
                emitActivity('config', 'autotune_subsystem',
                    `Tuning consultant ${subsystem} (${model.name}) [full]`,
                    { subsystem: displayName, model: model.name, phase: 'full', consultant: true },
                );

                const { result } = await tuneSubsystem(subsystem, model, config, null, { isConsultant: true });
                // Tag result with c: prefix so apply endpoint knows to write to consultant params
                result.subsystem = displayName;

                tuneState.results.push(result);
                tuneState.subsystemsComplete++;

                emitActivity('config', 'autotune_subsystem_done',
                    `consultant ${subsystem}: best ${(result.bestScore * 100).toFixed(1)}% (was ${(result.currentScore * 100).toFixed(1)}%) [full]`,
                    { subsystem: displayName, bestScore: result.bestScore, currentScore: result.currentScore, improvement: result.improvement, phase: 'full', consultant: true },
                );
            }
        }

        tuneState.status = cancelFlag ? 'cancelled' : 'complete';
        emitActivity('config', 'autotune_complete',
            `Auto-tune ${tuneState.status}: ${tuneState.results.length} subsystem(s)`,
        );
    } catch (err: any) {
        tuneState.status = 'error';
        tuneState.error = err.message;
        emitActivity('config', 'autotune_error', `Auto-tune failed: ${err.message}`);
    }
}
