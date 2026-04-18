/**
 * @module prompts/evm
 *
 * Verification prompt definitions. Active prompts:
 * - evm.analysis — post-rejection LLM investigation
 * - evm.decompose — split claims into testable facts
 * - evm.guidance_suggest, evm.guidance_system — failure diagnosis
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'evm';

/**
 * EVM prompts, keyed by prompt ID (e.g. `'evm.codegen'`). Each entry is a
 * {@link PromptDefinition} whose `description` field serves as the canonical
 * documentation for that prompt's purpose and behavior.
 */
export const EVM_PROMPTS: Record<string, PromptDefinition> = {
    'evm.spec_extraction': {
        id: 'evm.spec_extraction',
        category: 'evm',
        description: 'Extract an experiment specification from a knowledge claim — the one auditable bias surface in the verification pipeline. Used for math/physics labs (default).',
        variables: ['domain', 'claim', 'parentContext', 'guidance', 'labContext', 'precisionNote'],
        content: loadTemplate(CAT, 'evm.spec_extraction'),
    },

    'evm.spec_extraction.nn': {
        id: 'evm.spec_extraction.nn',
        category: 'evm',
        description: 'Extract an NN-lab experiment spec — tuned for neural network training, architecture, and optimization claims',
        variables: ['domain', 'claim', 'parentContext', 'guidance', 'labContext', 'precisionNote'],
        content: loadTemplate(CAT, 'evm.spec_extraction.nn'),
    },

    'evm.spec_extraction.critique': {
        id: 'evm.spec_extraction.critique',
        category: 'evm',
        description: 'Extract a critique-lab spec — for qualitative claims that need LLM-based quality review rather than computation',
        variables: ['domain', 'claim', 'parentContext', 'guidance', 'labContext', 'precisionNote'],
        content: loadTemplate(CAT, 'evm.spec_extraction.critique'),
    },

    'evm.analysis': {
        id: 'evm.analysis',
        category: 'evm',
        description: 'Generate Python analysis code to investigate a disproved claim and discover what was actually produced',
        variables: ['nodeContent', 'claimType', 'hypothesis', 'sandboxOutput', 'domain', 'allowedModules', 'analyserGuidance', 'polarity'],
        content: loadTemplate(CAT, 'evm.analysis'),
    },

    'evm.guidance_suggest': {
        id: 'evm.guidance_suggest',
        category: 'evm',
        description: 'Diagnose a failed verification and suggest guidance for retry',
        variables: ['nodeContent', 'domain', 'hypothesis', 'code', 'error', 'stdout', 'stderr', 'status', 'testCategory', 'evaluationMode', 'claimType'],
        content: loadTemplate(CAT, 'evm.guidance_suggest'),
    },

    'evm.guidance_system': {
        id: 'evm.guidance_system',
        category: 'evm',
        description: 'System prompt for the EVM Guidance subsystem — expert verification diagnostician',
        variables: [],
        content: loadTemplate(CAT, 'evm.guidance_system'),
    },

    'evm.decompose': {
        id: 'evm.decompose',
        category: 'evm',
        description: 'Decompose a knowledge claim into known facts and unknown research questions',
        variables: ['nodeContent', 'domain', 'parentContents', 'verificationHistory'],
        content: loadTemplate(CAT, 'evm.decompose'),
    },

    'evm.spec_review': {
        id: 'evm.spec_review',
        category: 'evm',
        description: 'Adversarial falsifiability review — detects specs with cherry-picked parameters that guarantee a predetermined outcome',
        variables: ['hypothesis', 'setup', 'specType'],
        content: loadTemplate(CAT, 'evm.spec_review'),
    },
};
