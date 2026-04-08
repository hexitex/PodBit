/**
 * @module core/autotune/combinatorics
 *
 * Parameter combo generation, grid constraint, model grouping,
 * and reader consolidation for auto-tune.
 */

import type { ParamCombo, ParamGrid } from './types.js';
import { TEXT_READER_GROUP } from './scoring.js';

/** Map from ParamCombo key → API property name sent to the endpoint */
const PARAM_TO_API_PROP: Record<string, string> = {
    minP: 'min_p',
    topK: 'top_k',
    repeatPenalty: 'frequency_penalty',
};

/**
 * Collapse grid axes for params the endpoint doesn't support.
 * Unsupported params get fixed to their default/no-op value instead of being searched.
 *
 * @param grid - Full parameter grid with all axes
 * @param unsupportedProps - Set of API property names the endpoint doesn't support
 *                           (e.g., 'min_p', 'top_k', 'frequency_penalty')
 * @returns Constrained grid with unsupported axes collapsed to no-op defaults
 */
export function constrainGrid(grid: ParamGrid, unsupportedProps: Set<string>): ParamGrid {
    if (unsupportedProps.size === 0) return grid;
    const constrained = { ...grid };
    for (const [paramKey, apiProp] of Object.entries(PARAM_TO_API_PROP)) {
        if (unsupportedProps.has(apiProp)) {
            // Fix to the no-op default: minP=0, topK=0, repeatPenalty=1.0
            const noOp = paramKey === 'repeatPenalty' ? 1.0 : 0;
            (constrained as any)[paramKey] = [noOp];
        }
    }
    return constrained;
}

/**
 * Generate parameter combinations from a grid, capped at maxCombos.
 *
 * If the full Cartesian product exceeds maxCombos, uses a deterministic
 * Latin Hypercube Sample (stratified pseudo-random selection) to select
 * a representative subset. Current params are always included first.
 *
 * @param grid - Parameter grid with arrays of values per axis
 * @param maxCombos - Maximum number of combos to return
 * @param currentParams - Current parameter values (always included as first combo)
 * @returns Deduplicated array of parameter combos, current params first
 */
export function generateCombos(grid: ParamGrid, maxCombos: number, currentParams: ParamCombo): ParamCombo[] {
    const paramNames = ['temperature', 'topP', 'minP', 'topK', 'repeatPenalty'] as const;
    const paramValues: number[][] = paramNames.map(name => grid[name]);

    // Generate all possible combos
    const allCombos: ParamCombo[] = [];
    const indices = paramValues.map(() => 0);
    const lengths = paramValues.map(v => v.length);

    while (true) {
        allCombos.push({
            temperature: paramValues[0][indices[0]],
            topP: paramValues[1][indices[1]],
            minP: paramValues[2][indices[2]],
            topK: paramValues[3][indices[3]],
            repeatPenalty: paramValues[4][indices[4]],
        });

        let carry = true;
        for (let i = paramNames.length - 1; i >= 0 && carry; i--) {
            indices[i]++;
            if (indices[i] >= lengths[i]) {
                indices[i] = 0;
            } else {
                carry = false;
            }
        }
        if (carry) break;
    }

    if (allCombos.length <= maxCombos) {
        return dedup(allCombos, currentParams);
    }

    // Latin Hypercube Sample: stratified random selection
    const scored = allCombos.map((combo, i) => ({
        combo,
        score: Math.sin(i * 2654435761) * 10000 - Math.floor(Math.sin(i * 2654435761) * 10000),
    }));
    scored.sort((a, b) => a.score - b.score);

    const selected: ParamCombo[] = [];
    for (let i = 0; i < maxCombos && i < scored.length; i++) {
        const idx = Math.floor(i * scored.length / maxCombos);
        selected.push(scored[idx].combo);
    }

    return dedup(selected, currentParams);
}

/**
 * Generate a narrow refinement grid around a seed combo.
 *
 * Creates +/- perturbations around each seed value (e.g., temperature +/- 0.1,
 * topP +/- 0.05) and generates combos from the resulting grid.
 *
 * @param seed - Seed parameter combo to refine around
 * @param maxCombos - Maximum number of combos to return
 * @param unsupportedProps - Optional set of unsupported API property names to collapse
 * @returns Array of parameter combos in the refinement neighborhood
 */
export function generateRefinementCombos(seed: ParamCombo, maxCombos: number, unsupportedProps?: Set<string>): ParamCombo[] {
    let grid: ParamGrid = {
        temperature: uniqueSorted([
            clamp(round2(seed.temperature - 0.1), 0, 1.5),
            seed.temperature,
            clamp(round2(seed.temperature + 0.1), 0, 1.5),
        ]),
        topP: uniqueSorted([
            clamp(round2(seed.topP - 0.05), 0, 1),
            seed.topP,
            clamp(round2(seed.topP + 0.05), 0, 1),
        ]),
        minP: uniqueSorted([
            clamp(round2(seed.minP - 0.02), 0, 0.5),
            seed.minP,
            clamp(round2(seed.minP + 0.02), 0, 0.5),
        ]),
        topK: uniqueSorted([
            clamp(Math.round(seed.topK - 10), 0, 100),
            seed.topK,
            clamp(Math.round(seed.topK + 10), 0, 100),
        ]),
        repeatPenalty: uniqueSorted([
            clamp(round2(seed.repeatPenalty - 0.1), 1.0, 2.0),
            seed.repeatPenalty,
            clamp(round2(seed.repeatPenalty + 0.1), 1.0, 2.0),
        ]),
    };
    if (unsupportedProps?.size) grid = constrainGrid(grid, unsupportedProps);
    return generateCombos(grid, maxCombos, seed);
}

/**
 * Clamp a value to the range [min, max].
 *
 * @param v - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/**
 * Round a number to 2 decimal places.
 *
 * @param v - Value to round
 * @returns Value rounded to 2 decimal places
 */
export function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

/**
 * Deduplicate and sort a number array in ascending order.
 *
 * @param arr - Input array of numbers
 * @returns Sorted array with duplicates removed
 */
export function uniqueSorted(arr: number[]): number[] {
    return [...new Set(arr)].sort((a, b) => a - b);
}

/**
 * Ensure currentParams is the first element and deduplicate the combo list.
 *
 * @param combos - Array of parameter combos to deduplicate
 * @param currentParams - Current params to place first
 * @returns Deduplicated array with currentParams first
 */
export function dedup(combos: ParamCombo[], currentParams: ParamCombo): ParamCombo[] {
    const key = (c: ParamCombo) => `${c.temperature}-${c.topP}-${c.minP}-${c.topK}-${c.repeatPenalty}`;
    const seen = new Set<string>();
    const result: ParamCombo[] = [currentParams];
    seen.add(key(currentParams));

    for (const combo of combos) {
        const k = key(combo);
        if (!seen.has(k)) {
            seen.add(k);
            result.push(combo);
        }
    }

    return result;
}

// =============================================================================
// MODEL GROUPING & READER CONSOLIDATION
// =============================================================================

/**
 * Group subsystems by their assigned model ID.
 *
 * Used for cross-subsystem seeding: subsystems sharing the same model
 * can reuse tuned parameters from the first as a seed for refinement.
 *
 * @param subsystems - Array of subsystem names to group
 * @param assignments - Subsystem assignment map (subsystem -> model object)
 * @returns Map from model ID to array of subsystem names sharing that model
 */
export function groupByModel(subsystems: string[], assignments: Record<string, any>): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const sub of subsystems) {
        const model = assignments[sub];
        if (!model) continue;
        const modelId = String(model.id || model.name);
        if (!groups.has(modelId)) groups.set(modelId, []);
        groups.get(modelId)!.push(sub);
    }
    return groups;
}

/**
 * Consolidate text readers: reader_text/pdf/doc process extracted text identically,
 * so we only tune one representative and inherit results to the others.
 * reader_sheet, reader_code, reader_image diverge enough to need independent tuning.
 *
 * @param subsystems - Array of subsystem names to consolidate
 * @returns Object with `toTune` (subsystems to actually tune) and `inherited`
 *          (map from inheriting subsystem -> leader subsystem)
 */
export function consolidateReaders(subsystems: string[]): { toTune: string[], inherited: Map<string, string> } {
    const toTune = [...subsystems];
    const inherited = new Map<string, string>();

    const selectedTextReaders = TEXT_READER_GROUP.filter(r => subsystems.includes(r));
    if (selectedTextReaders.length > 1) {
        const leader = selectedTextReaders[0]; // reader_text is the representative
        for (let i = 1; i < selectedTextReaders.length; i++) {
            const idx = toTune.indexOf(selectedTextReaders[i]);
            if (idx !== -1) toTune.splice(idx, 1);
            inherited.set(selectedTextReaders[i], leader);
        }
    }

    return { toTune, inherited };
}
