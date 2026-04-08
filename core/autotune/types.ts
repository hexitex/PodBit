/**
 * @module core/autotune/types
 *
 * Type definitions for the auto-tune engine.
 */

/** LLM sampling parameter combination being tested. */
export interface ParamCombo {
    temperature: number;
    topP: number;
    minP: number;
    topK: number;
    repeatPenalty: number;
}

/** Quality score returned by a heuristic scorer or gold standard comparison. */
export interface QualityScore {
    overall: number;           // 0-1 composite
    dimensions: Record<string, number>;
    rawOutput: string;
    error?: string;
}

/** Aggregated result for a single parameter combo across multiple test runs. */
export interface ComboResult {
    combo: ParamCombo;
    scores: QualityScore[];
    avgScore: number;
}

/**
 * Summary result for tuning a single subsystem's LLM sampling parameters.
 *
 * Contains the winning parameter combination, its score, the full results
 * matrix for all tested combos, and metadata about the search (elapsed time,
 * phase, whether the result was inherited from a sibling subsystem). Stored
 * in `AutoTuneProgress.results` and persisted to the `tuning_registry` table.
 */
export interface SubsystemTuneResult {
    subsystem: string;
    modelName: string;
    bestCombo: ParamCombo;
    bestScore: number;
    allResults: ComboResult[];
    currentParams: ParamCombo;
    currentScore: number;
    improvement: number;
    testedCombos: number;
    totalCombos: number;
    elapsedMs: number;
    phase: 'full' | 'refinement' | 'inherited';
    seedFrom?: string;          // subsystem that seeded this result
}

/**
 * Configuration for an auto-tune run, controlling scope and search budget.
 *
 * `subsystems` lists which subsystem names to tune (e.g. `['voice', 'chat']`).
 * `runsPerCombo` sets how many times each parameter combination is tested
 * (averaged for stability). `maxCombos` caps the total combinations explored
 * per subsystem. `convergenceThreshold` allows early stopping when the score
 * improvement between successive combos drops below this value.
 */
export interface AutoTuneConfig {
    subsystems: string[];
    runsPerCombo: number;
    maxCombos: number;
    convergenceThreshold: number;
}

/** Live progress state for the running auto-tune job (exposed to UI). */
export interface AutoTuneProgress {
    status: 'idle' | 'running' | 'cancelled' | 'complete' | 'error';
    currentSubsystem: string | null;
    currentCombo: number;
    totalCombos: number;
    subsystemsComplete: number;
    subsystemsTotal: number;
    results: SubsystemTuneResult[];
    startedAt: string | null;
    error?: string;
}

/** Parameter grid defining the search space for each axis. */
export interface ParamGrid {
    temperature: number[];
    topP: number[];
    minP: number[];
    topK: number[];
    repeatPenalty: number[];
}

/** DB record for a gold standard reference response. */
export interface GoldStandard {
    id: string;
    prompt_id: string;
    tier: number;
    content: string;
    test_input: string;
    embedding: Buffer | null;
    model_used: string | null;
    locked: number;
    generated_at: string;
}

/** A gold standard prompt + ID pair used during auto-tune test runs. */
export interface GoldStandardTest {
    promptId: string;
    composedPrompt: string;
}

/** Scoring category — determines which test prompt and quality scorer are used. */
export type SubsystemCategory = 'voice' | 'compress' | 'chat' | 'keyword' | 'reader' | 'reader_image' | 'reader_sheet' | 'reader_code' | 'autorating' | 'spec_extraction' | 'dedup_judge' | 'evm_analysis';

/**
 * Test variable specification for prompt interpolation.
 * - `source`: loads content from an `autotune.data.*` prompt
 * - `literal`: inline string value
 * - `deps` + `fn`: compose from multiple loaded sources via template function
 */
export type TestVarSpec =
    | { source: string }
    | { literal: string }
    | { deps: string[]; fn: (loaded: Record<string, string>) => string };
