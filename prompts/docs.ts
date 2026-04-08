/**
 * @module prompts/docs
 *
 * Research brief / document generation prompt definitions. Covers the full
 * scaffold pipeline: template validation, outline decomposition, iterative
 * section research (multi-round graph queries), section content generation,
 * and escalated generation after primary-tier failure.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'docs';

/**
 * Docs prompts, keyed by prompt ID (e.g. `'docs.outline_decomposition'`).
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose and behavior.
 */
export const DOCS_PROMPTS: Record<string, PromptDefinition> = {

    'docs.template_validation': {
        id: 'docs.template_validation',
        category: 'docs',
        description: 'Validate whether a template fits a user request',
        variables: ['request', 'taskType', 'templateName', 'templateSections'],
        content: loadTemplate(CAT, 'docs.template_validation'),
    },

    'docs.outline_decomposition': {
        id: 'docs.outline_decomposition',
        category: 'docs',
        description: 'Decompose a request into a structured document outline',
        variables: ['taskType', 'request', 'knowledgeContext'],
        content: loadTemplate(CAT, 'docs.outline_decomposition'),
    },

    'docs.section_research': {
        id: 'docs.section_research',
        category: 'docs',
        description: 'Research phase: LLM proposes knowledge graph queries for a section',
        variables: ['sectionTitle', 'purpose', 'mustInclude', 'currentKnowledge', 'round', 'maxRounds'],
        content: loadTemplate(CAT, 'docs.section_research'),
    },

    'docs.section_generation': {
        id: 'docs.section_generation',
        category: 'docs',
        description: 'Generate content for a single document section',
        variables: ['sectionTitle', 'purpose', 'lengthMin', 'lengthMax', 'mustInclude', 'tone', 'knowledgeBlock', 'precedingBlock', 'terminologyBlock', 'failureBlock'],
        content: loadTemplate(CAT, 'docs.section_generation'),
    },

    'docs.section_escalation': {
        id: 'docs.section_escalation',
        category: 'docs',
        description: 'Escalated section generation after primary tier failure',
        variables: ['sectionTitle', 'purpose', 'lengthMin', 'lengthMax', 'mustInclude', 'tone', 'failures', 'knowledgeBlock'],
        content: loadTemplate(CAT, 'docs.section_escalation'),
    },

};
