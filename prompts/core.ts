/**
 * @module prompts/core
 *
 * Core prompt definitions for the synthesis pipeline: insight synthesis (2-parent
 * and multi-parent), breakthrough validation, novelty gating, counterfactual
 * independence checks, autorating, question generation/answering, and research
 * cycle seeding. These prompts are the primary LLM instructions used by the
 * synthesis engine and autonomous cycles.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'core';

/**
 * Core prompts, keyed by prompt ID (e.g. `'core.insight_synthesis'`). Each
 * entry is a {@link PromptDefinition} whose `description` field serves as the
 * canonical documentation for that prompt's purpose and behavior.
 */
export const CORE_PROMPTS: Record<string, PromptDefinition> = {

    'system.identity': {
        id: 'system.identity',
        category: 'system',
        description: 'Core identity prompt for all Podbit LLM services',
        variables: [],
        content: loadTemplate(CAT, 'system.identity'),
    },

    'core.insight_synthesis': {
        id: 'core.insight_synthesis',
        category: 'core',
        description: 'Synthesize a new insight from two knowledge nodes',
        variables: ['contentA', 'contentB', 'numberVariableLegend', 'provenanceGuide'],
        content: loadTemplate(CAT, 'core.insight_synthesis'),
    },

    'core.multi_insight_synthesis': {
        id: 'core.multi_insight_synthesis',
        category: 'core',
        description: 'Synthesize a new insight from multiple knowledge nodes (3-4 parents)',
        variables: ['contents', 'numberVariableLegend', 'provenanceGuide'],
        content: loadTemplate(CAT, 'core.multi_insight_synthesis'),
    },

    'core.content_spec_synthesis': {
        id: 'core.content_spec_synthesis',
        category: 'core',
        description: 'Extract a structured content spec from a synthesis birth output (mechanism / prediction / falsifiability / novelty)',
        variables: ['content', 'parents'],
        content: loadTemplate(CAT, 'core.content_spec_synthesis'),
    },

    'core.content_spec_research': {
        id: 'core.content_spec_research',
        category: 'core',
        description: 'Extract a structured content spec from a research-cycle fact (mechanism / prediction / falsifiability / novelty)',
        variables: ['content', 'domain'],
        content: loadTemplate(CAT, 'core.content_spec_research'),
    },

    'core.breakthrough_validation': {
        id: 'core.breakthrough_validation',
        category: 'core',
        description: 'Evaluate whether a claim is a genuine breakthrough',
        variables: ['nodeContent', 'sourceContext', 'provenanceGuide'],
        content: loadTemplate(CAT, 'core.breakthrough_validation'),
    },

    'core.novelty_gate': {
        id: 'core.novelty_gate',
        category: 'core',
        description: 'Skeptical novelty check — is this textbook material or genuinely novel?',
        variables: ['nodeContent', 'sourceContext', 'domain', 'provenanceGuide'],
        content: loadTemplate(CAT, 'core.novelty_gate'),
    },

    'core.counterfactual_two_domain': {
        id: 'core.counterfactual_two_domain',
        category: 'core',
        description: 'Counterfactual independence check for 2-domain synthesis — is each domain load-bearing?',
        variables: ['domainA', 'parentSummariesA', 'domainB', 'parentSummariesB', 'synthesisContent'],
        content: loadTemplate(CAT, 'core.counterfactual_two_domain'),
    },

    'core.counterfactual_multi_domain': {
        id: 'core.counterfactual_multi_domain',
        category: 'core',
        description: 'Counterfactual independence check for 3+ domain synthesis — per-domain load-bearing verdicts',
        variables: ['domainCount', 'domainList', 'synthesisContent'],
        content: loadTemplate(CAT, 'core.counterfactual_multi_domain'),
    },

    'core.voicing_screen': {
        id: 'core.voicing_screen',
        category: 'core',
        description: 'Pre-voicing connection screen — 6 structured questions to test mechanistic connection between two fragments',
        variables: ['parentA', 'parentB'],
        content: loadTemplate(CAT, 'core.voicing_screen'),
    },

    'core.synthesis_screen': {
        id: 'core.synthesis_screen',
        category: 'core',
        description: 'Pre-synthesis connection screen — 8 structured questions to test mechanistic chains, invented precision, and unnecessary parents',
        variables: ['fragments', 'fragmentCount'],
        content: loadTemplate(CAT, 'core.synthesis_screen'),
    },

    'core.autorating': {
        id: 'core.autorating',
        category: 'core',
        description: 'Rate a knowledge node for quality — useful, not useful, or harmful',
        variables: ['nodeContent', 'nodeType', 'nodeDomain', 'parentContext', 'projectContext', 'provenanceTag'],
        content: loadTemplate(CAT, 'core.autorating'),
    },

    'core.question_generation': {
        id: 'core.question_generation',
        category: 'core',
        description: 'Generate a research question from two nodes in tension',
        variables: ['contentA', 'contentB', 'signalHint'],
        content: loadTemplate(CAT, 'core.question_generation'),
    },

    'core.question_answer': {
        id: 'core.question_answer',
        category: 'core',
        description: 'Answer a research question using relevant knowledge context',
        variables: ['question', 'context'],
        content: loadTemplate(CAT, 'core.question_answer'),
    },

    'core.research_cycle': {
        id: 'core.research_cycle',
        category: 'core',
        description: 'Generate new factual seeds for a domain based on existing knowledge and gaps',
        variables: ['domain', 'existingKnowledge', 'openQuestions'],
        content: loadTemplate(CAT, 'core.research_cycle'),
    },
};
