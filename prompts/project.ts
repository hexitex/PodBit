/**
 * @module prompts/project
 *
 * Project management prompt definitions. Used during project creation for
 * interview-based discovery (multi-turn conversation to extract purpose,
 * domains, goals, relationships, and pipeline mode) and bootstrap seed
 * generation (foundational knowledge statements per domain).
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'project';

/**
 * Project prompts, keyed by prompt ID (e.g. `'project.interview_start'`).
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose and behavior.
 */
export const PROJECT_PROMPTS: Record<string, PromptDefinition> = {
    'project.bootstrap_seeds': {
        id: 'project.bootstrap_seeds',
        category: 'project',
        description: 'Generate foundational seed knowledge statements for each domain when bootstrapping a new project',
        variables: ['purpose', 'domainList', 'goalsText', 'seedsPerDomain'],
        content: loadTemplate(CAT, 'project.bootstrap_seeds'),
    },

    'project.interview': {
        id: 'project.interview',
        category: 'project',
        description: 'Conducts a multi-turn interview to discover a new project\'s purpose, domains, goals, and structure',
        variables: ['history', 'response'],
        content: loadTemplate(CAT, 'project.interview'),
    },

    'project.interview_start': {
        id: 'project.interview_start',
        category: 'project',
        description: 'Opening question for the project interview — no history yet',
        variables: ['projectName'],
        content: loadTemplate(CAT, 'project.interview_start'),
    },
};
