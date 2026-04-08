/**
 * @module core/autotune/scoring
 *
 * Parameter grid defaults, subsystem grouping constants, and re-exports
 * for scoring-related modules (routing, scorers, test-vars).
 */

import type { ParamGrid } from './types.js';

// =============================================================================
// PARAMETER GRID DEFAULTS
// =============================================================================

/** Default parameter grid for full auto-tune search. Each axis is searched independently. */
export const DEFAULT_GRID: ParamGrid = {
    temperature: [0.1, 0.3, 0.5, 0.7, 0.9],
    topP: [0.8, 0.9, 1.0],
    minP: [0, 0.05, 0.10],
    topK: [0, 20, 40],
    repeatPenalty: [1.0, 1.1, 1.3],
};

/** Text readers process extracted text identically — share parameters. */
export const TEXT_READER_GROUP = ['reader_text', 'reader_pdf', 'reader_doc'];

/** All reader subsystems — seeded refinement is only valid within this group. */
export const READER_SUBSYSTEMS = new Set(['reader_text', 'reader_pdf', 'reader_doc', 'reader_image', 'reader_sheet', 'reader_code']);

// =============================================================================
// RE-EXPORTS — all consumers import from this file unchanged
// =============================================================================

export { getSubsystemCategory, PROMPT_MAP } from './routing.js';
export { detectStutter, SCORERS } from './scorers.js';
export { PROMPT_CATEGORY_MAP, TEST_VAR_CONFIGS, loadTestVars, getPromptIdsForCategory } from './test-vars.js';
