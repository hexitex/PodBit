/**
 * @module prompts/autotune-tests
 *
 * Fixed test prompts for subsystem quality testing. Each prompt contains an
 * embedded test scenario (e.g. a pair of facts for voice synthesis, a code
 * snippet for reader evaluation) and expected-format instructions. Also
 * includes tiered judge instructions (`judge_tier1/2/3`) used to generate
 * gold standard reference responses at different quality levels.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'autotune';

/**
 * Auto-tune test prompts, keyed by prompt ID (e.g. `'autotune.test_voice'`).
 * Each entry is a {@link PromptDefinition} containing a self-contained test
 * scenario with embedded input data and scoring instructions.
 */
export const AUTOTUNE_TEST_PROMPTS: Record<string, PromptDefinition> = {

    'autotune.test_voice': {
        id: 'autotune.test_voice',
        category: 'autotune',
        description: 'Test prompt for voice/synthesis subsystem auto-tuning',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_voice'),
    },

    'autotune.test_compress': {
        id: 'autotune.test_compress',
        category: 'autotune',
        description: 'Test prompt for compress subsystem auto-tuning',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_compress'),
    },

    'autotune.test_chat': {
        id: 'autotune.test_chat',
        category: 'autotune',
        description: 'Test prompt for chat subsystem auto-tuning',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_chat'),
    },

    'autotune.test_keyword': {
        id: 'autotune.test_keyword',
        category: 'autotune',
        description: 'Test prompt for keyword subsystem auto-tuning',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_keyword'),
    },

    'autotune.test_reader': {
        id: 'autotune.test_reader',
        category: 'autotune',
        description: 'Test prompt for text/pdf/doc reader subsystem auto-tuning',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_reader'),
    },

    'autotune.test_image': {
        id: 'autotune.test_image',
        category: 'autotune',
        description: 'Test prompt for reader_image (vision model) auto-tuning. Sent with a real photograph from autotune/auto.jpg.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_image'),
    },

    'autotune.test_sheet': {
        id: 'autotune.test_sheet',
        category: 'autotune',
        description: 'Test prompt for reader_sheet auto-tuning. Uses a markdown table mimicking spreadsheet extraction.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_sheet'),
    },

    'autotune.test_code': {
        id: 'autotune.test_code',
        category: 'autotune',
        description: 'Test prompt for reader_code auto-tuning. Uses a TypeScript code snippet.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_code'),
    },

    'autotune.test_autorating': {
        id: 'autotune.test_autorating',
        category: 'autotune',
        description: 'Composite test for autorating. Two nodes: a NOT USEFUL lone seed (expected 0) and a USEFUL voiced node with parents (expected 1). Tests both inline and cycle scenarios.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_autorating'),
    },

    'autotune.test_dedup': {
        id: 'autotune.test_dedup',
        category: 'autotune',
        description: 'Gold standard test for dedup_judge subsystem — tests ability to distinguish genuine duplicates from topically similar but distinct nodes',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_dedup'),
    },

    'autotune.test_evm_analysis': {
        id: 'autotune.test_evm_analysis',
        category: 'autotune',
        description: 'Gold standard test for evm_analysis subsystem — tests ability to generate post-rejection analysis code that investigates disproved claims',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_evm_analysis'),
    },

    'autotune.test_consultant_review': {
        id: 'autotune.test_consultant_review',
        category: 'autotune',
        description: 'Gold standard test for consultant review quality validation.',
        variables: [],
        content: loadTemplate(CAT, 'autotune.test_consultant_review'),
    },

    'autotune.judge_tier1': {
        id: 'autotune.judge_tier1',
        category: 'autotune',
        description: 'Judge instruction for generating tier 1 (ideal) gold standard response',
        variables: [],
        content: loadTemplate(CAT, 'autotune.judge_tier1'),
    },

    'autotune.judge_tier2': {
        id: 'autotune.judge_tier2',
        category: 'autotune',
        description: 'Judge instruction for generating tier 2 (good) gold standard response',
        variables: [],
        content: loadTemplate(CAT, 'autotune.judge_tier2'),
    },

    'autotune.judge_tier3': {
        id: 'autotune.judge_tier3',
        category: 'autotune',
        description: 'Judge instruction for generating tier 3 (acceptable) gold standard response',
        variables: [],
        content: loadTemplate(CAT, 'autotune.judge_tier3'),
    },
};
