/**
 * @module prompts/misc
 *
 * Miscellaneous prompt definitions: history compression, dedup LLM judge,
 * domain classification, keyword/synonym extraction, and quality consultant
 * review prompts (both per-gate and comprehensive single-pass).
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'misc';

/**
 * Miscellaneous prompts, keyed by prompt ID (e.g. `'dedup.llm_judge'`). Each
 * entry is a {@link PromptDefinition} whose `description` field serves as the
 * canonical documentation for that prompt's purpose and behavior.
 */
export const MISC_PROMPTS: Record<string, PromptDefinition> = {
    'context.history_compression': {
        id: 'context.history_compression',
        category: 'context',
        description: 'Compress conversation history into a concise summary',
        variables: ['existingSummary', 'compressText'],
        content: loadTemplate(CAT, 'context.history_compression'),
    },

    'dedup.llm_judge': {
        id: 'dedup.llm_judge',
        category: 'dedup',
        description: 'LLM judge for deduplication — determines if two semantically similar nodes are genuinely redundant or if the newer one adds novel information',
        variables: ['similarity', 'existingContent', 'newContent'],
        content: loadTemplate(CAT, 'dedup.llm_judge'),
    },

    'domain.classify': {
        id: 'domain.classify',
        category: 'domain',
        description: 'Classify text into an existing domain or suggest a short new domain name',
        variables: ['text', 'existingDomains'],
        content: loadTemplate(CAT, 'domain.classify'),
    },

    'keyword.domain_synonyms': {
        id: 'keyword.domain_synonyms',
        category: 'keyword',
        description: 'Generate semantic synonyms for a knowledge domain',
        variables: ['domain', 'existingSynonyms'],
        content: loadTemplate(CAT, 'keyword.domain_synonyms'),
    },

    'keyword.node_keywords': {
        id: 'keyword.node_keywords',
        category: 'keyword',
        description: 'Extract searchable keywords from a knowledge node',
        variables: ['content', 'domain'],
        content: loadTemplate(CAT, 'keyword.node_keywords'),
    },

    'quality.consultant_review': {
        id: 'quality.consultant_review',
        category: 'quality',
        description: 'Consultant model reviews the primary model output. Returns a score (0-10), accept/reject, reasoning, and optionally a revised output.',
        variables: ['nodeContent', 'primaryOutput', 'domain', 'parentContext', 'subsystemTask'],
        content: loadTemplate(CAT, 'quality.consultant_review'),
    },

    'quality.comprehensive_consultant': {
        id: 'quality.comprehensive_consultant',
        category: 'quality',
        description: 'Single-pass comprehensive quality judgment for consultant pipeline mode. Replaces claim provenance, hallucination detection, counterfactual independence, derivative check, and fitness grading in one LLM call.',
        variables: ['synthesisOutput', 'parentA', 'parentB', 'domainA', 'domainB', 'projectContext', 'graphContext'],
        content: loadTemplate(CAT, 'quality.comprehensive_consultant'),
    },

    'quality.minitruth': {
        id: 'quality.minitruth',
        category: 'quality',
        description: 'Minitruth reviewer for the birth pipeline. Armed with the project manifest, evaluates whether a newly voiced synthesis deserves to enter the knowledge graph. Returns accept/rework/reject.',
        variables: ['synthesisOutput', 'parentA', 'parentB', 'domainA', 'domainB', 'projectContext', 'priorAttempt', 'priorFeedback'],
        content: loadTemplate(CAT, 'quality.minitruth'),
    },
};
