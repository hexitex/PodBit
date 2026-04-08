/**
 * @module prompts/autotune-inputs
 *
 * Deprecated test input data for auto-tune gold standard generation.
 * Superseded by `autotune-data.ts` which provides editable fixtures via the
 * GUI Test Data tab. Retained for backwards compatibility with existing
 * gold standard entries that reference `autotune.input_*` prompt IDs.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'autotune';

/**
 * Legacy auto-tune input prompts, keyed by prompt ID (e.g.
 * `'autotune.input_voice'`). Each entry is a {@link PromptDefinition}
 * containing raw test input data. New test data should use
 * `autotune.data.*` entries in `autotune-data.ts` instead.
 *
 * @deprecated Use {@link AUTOTUNE_DATA_PROMPTS} from `autotune-data.ts`.
 */
export const AUTOTUNE_INPUT_PROMPTS: Record<string, PromptDefinition> = {

    'autotune.input_voice': {
        id: 'autotune.input_voice',
        category: 'autotune',
        description: 'Test input data for voice/synthesis gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_voice'),
    },

    'autotune.input_compress': {
        id: 'autotune.input_compress',
        category: 'autotune',
        description: 'Test input data for compress gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_compress'),
    },

    'autotune.input_reader': {
        id: 'autotune.input_reader',
        category: 'autotune',
        description: 'Test input data for text reader gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_reader'),
    },

    'autotune.input_keyword': {
        id: 'autotune.input_keyword',
        category: 'autotune',
        description: 'Test input data for keyword gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_keyword'),
    },

    'autotune.input_sheet': {
        id: 'autotune.input_sheet',
        category: 'autotune',
        description: 'Test input data for sheet reader gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_sheet'),
    },

    'autotune.input_code': {
        id: 'autotune.input_code',
        category: 'autotune',
        description: 'Test input data for code reader gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_code'),
    },

    'autotune.input_chat': {
        id: 'autotune.input_chat',
        category: 'autotune',
        description: 'Test input data for chat default_response gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_chat'),
    },

    'autotune.input_chat_topic': {
        id: 'autotune.input_chat_topic',
        category: 'autotune',
        description: 'Test input data for chat research_seeds gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_chat_topic'),
    },

    'autotune.input_chat_nodes': {
        id: 'autotune.input_chat_nodes',
        category: 'autotune',
        description: 'Test input data for chat summarize/compress/voice_connection gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_chat_nodes'),
    },

    'autotune.input_context': {
        id: 'autotune.input_context',
        category: 'autotune',
        description: 'Test input data for context history_compression gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_context'),
    },

    'autotune.input_docs': {
        id: 'autotune.input_docs',
        category: 'autotune',
        description: 'Test input data for docs outline/section gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_docs'),
    },

    'autotune.input_research': {
        id: 'autotune.input_research',
        category: 'autotune',
        description: 'Test input data for core research_cycle gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_research'),
    },

    'autotune.input_validation': {
        id: 'autotune.input_validation',
        category: 'autotune',
        description: 'Test input data for core breakthrough_validation gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_validation'),
    },

    'autotune.input_question_gen': {
        id: 'autotune.input_question_gen',
        category: 'autotune',
        description: 'Test input data for core question_generation gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_question_gen'),
    },

    'autotune.input_question_answer': {
        id: 'autotune.input_question_answer',
        category: 'autotune',
        description: 'Test input data for core question_answer gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_question_answer'),
    },

    'autotune.input_domain_synonyms': {
        id: 'autotune.input_domain_synonyms',
        category: 'autotune',
        description: 'Test input data for keyword domain_synonyms gold standard generation',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_domain_synonyms'),
    },

    'autotune.input_autorating': {
        id: 'autotune.input_autorating',
        category: 'autotune',
        description: 'Test input data for autorating gold standard generation. Two nodes: a NOT USEFUL lone seed and a USEFUL voiced node with parents.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.input_autorating'),
    },

};
