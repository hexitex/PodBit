/**
 * @module prompts/defaults
 *
 * Aggregates all hardcoded prompt definitions from category-specific modules
 * into a single `DEFAULT_PROMPTS` record. This serves as the fallback layer
 * when no database override exists for a given prompt ID.
 */

import type { PromptDefinition } from './types.js';
import { CORE_PROMPTS } from './core.js';
import { EVM_PROMPTS } from './evm.js';
import { AUTOTUNE_PROMPTS } from './autotune.js';
import { CHAT_PROMPTS } from './chat.js';
import { KNOWLEDGE_PROMPTS } from './knowledge.js';
import { CONFIG_TUNE_PROMPTS } from './config-tune.js';
import { DOCS_PROMPTS } from './docs.js';
import { KB_PROMPTS } from './kb.js';
import { ELITE_PROMPTS } from './elite.js';
import { PROJECT_PROMPTS } from './project.js';
import { MISC_PROMPTS } from './misc.js';
import { API_VERIFICATION_PROMPTS } from './api-verification.js';
import { LAB_PROMPTS } from './lab.js';

/**
 * All hardcoded prompt definitions, keyed by prompt ID.
 * Merged from all category-specific prompt modules.
 * Used as the fallback when no database override is found.
 */
export const DEFAULT_PROMPTS: Record<string, PromptDefinition> = {
    ...CORE_PROMPTS,
    ...EVM_PROMPTS,
    ...AUTOTUNE_PROMPTS,
    ...CHAT_PROMPTS,
    ...KNOWLEDGE_PROMPTS,
    ...CONFIG_TUNE_PROMPTS,
    ...DOCS_PROMPTS,
    ...KB_PROMPTS,
    ...ELITE_PROMPTS,
    ...PROJECT_PROMPTS,
    ...MISC_PROMPTS,
    ...API_VERIFICATION_PROMPTS,
    ...LAB_PROMPTS,
};
