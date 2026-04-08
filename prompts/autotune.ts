/**
 * @module prompts/autotune
 *
 * Aggregates all auto-tuning prompt definitions from sub-modules: fixed test
 * prompts (`autotune-tests`), deprecated input data (`autotune-inputs`), and
 * editable test data fixtures (`autotune-data`). Re-exported as a single
 * merged record for registration in the prompt system.
 */

import type { PromptDefinition } from './types.js';
import { AUTOTUNE_TEST_PROMPTS } from './autotune-tests.js';
import { AUTOTUNE_INPUT_PROMPTS } from './autotune-inputs.js';
import { AUTOTUNE_DATA_PROMPTS } from './autotune-data.js';

/**
 * Combined auto-tuning prompts, keyed by prompt ID. Merges test prompts,
 * legacy input prompts, and editable data fixtures into a single record.
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose.
 */
export const AUTOTUNE_PROMPTS: Record<string, PromptDefinition> = {
    ...AUTOTUNE_TEST_PROMPTS,
    ...AUTOTUNE_INPUT_PROMPTS,
    ...AUTOTUNE_DATA_PROMPTS,
};
