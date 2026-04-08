/**
 * @module prompts/config-tune
 *
 * Configuration tuning prompt definitions. Used by the self-tuning system to
 * suggest parameter changes, generate tension word pairs for contradiction
 * detection, generate intent regex patterns for the context engine, and
 * generate word lists/mappings for text processing.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'config-tune';

/**
 * Config-tune prompts, keyed by prompt ID (e.g. `'config.suggest_tune'`).
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose and behavior.
 */
export const CONFIG_TUNE_PROMPTS: Record<string, PromptDefinition> = {
    'config.assist_system': {
        id: 'config.assist_system',
        category: 'config',
        description: 'System prompt for the Config Assistant — guides diagnosis, explanation, and suggestion format',
        variables: ['successRate', 'children', 'totalCycles', 'withPartner', 'severity', 'healthSummary', 'rejectionLines', 'totalNodes', 'avgWeight', 'avgSpecificity', 'sectionIndex', 'detailedSections'],
        content: loadTemplate(CAT, 'config.assist_system'),
    },

    'config.tune': {
        id: 'config.tune',
        category: 'config',
        description: 'Suggest config parameter changes based on user intent',
        variables: ['sectionTitle', 'sectionDescription', 'sectionBehavior', 'parametersJson', 'currentValuesJson', 'userRequest'],
        content: loadTemplate(CAT, 'config.tune'),
    },

    'config.critical_analysis': {
        id: 'config.critical_analysis',
        category: 'config',
        description: 'Analyze all config settings for quality issues, waste, and misconfigurations before running cycles',
        variables: ['configJson', 'statsJson', 'sectionsSummary'],
        content: loadTemplate(CAT, 'config.critical_analysis'),
    },

    'config.generate_patterns': {
        id: 'config.generate_patterns',
        category: 'config',
        description: 'Generate tension word pairs for contradiction detection',
        variables: ['existingPairs', 'userRequest', 'count'],
        content: loadTemplate(CAT, 'config.generate_patterns'),
    },

    'config.generate_intent_patterns': {
        id: 'config.generate_intent_patterns',
        category: 'config',
        description: 'Generate regex patterns for intent detection in the context engine',
        variables: ['existingPatterns', 'intentType', 'userRequest', 'count'],
        content: loadTemplate(CAT, 'config.generate_intent_patterns'),
    },

    'config.generate_words': {
        id: 'config.generate_words',
        category: 'config',
        description: 'Generate words or word mappings for configurable text processing lists',
        variables: ['listType', 'listDescription', 'existingWords', 'userRequest', 'count'],
        content: loadTemplate(CAT, 'config.generate_words'),
    },
};
