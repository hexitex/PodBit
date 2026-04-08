/**
 * @module prompts/lab
 *
 * Lab framework prompt definitions:
 * - lab.routing — LLM-based lab selection for experiment specs
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'lab';

export const LAB_PROMPTS: Record<string, PromptDefinition> = {
    'lab.routing': {
        id: 'lab.routing',
        category: 'lab',
        description: 'Select the best lab server to run an experiment spec based on capabilities, queue depth, health, and priority',
        variables: ['specType', 'measurementCount', 'hypothesis', 'setupSummary', 'labList'],
        content: loadTemplate(CAT, 'lab.routing'),
    },
};
