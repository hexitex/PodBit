/**
 * @module prompts/kb
 *
 * Knowledge Base ingestion prompts. Each reader plugin (text, code, document,
 * data, image) has a curation prompt that summarizes source content into
 * graph-ready knowledge nodes. Also includes a post-ingestion insights prompt
 * for generating high-level conceptual seeds after bulk ingestion.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'kb';

/**
 * KB prompts, keyed by prompt ID (e.g. `'kb.curate_text'`). Each entry is a
 * {@link PromptDefinition} whose `description` field serves as the canonical
 * documentation for that prompt's purpose and behavior.
 */
export const KB_PROMPTS: Record<string, PromptDefinition> = {
    'kb.curate_text': {
        id: 'kb.curate_text',
        category: 'kb',
        description: 'Extract synthesizable knowledge claims from text for the graph',
        variables: ['content', 'label', 'domain', 'filePath'],
        content: loadTemplate(CAT, 'kb.curate_text'),
    },

    'kb.curate_code': {
        id: 'kb.curate_code',
        category: 'kb',
        description: 'Curate a source code chunk into knowledge for the graph',
        variables: ['content', 'label', 'domain', 'language', 'filePath'],
        content: loadTemplate(CAT, 'kb.curate_code'),
    },

    'kb.curate_document': {
        id: 'kb.curate_document',
        category: 'kb',
        description: 'Extract synthesizable knowledge claims from a document for the graph',
        variables: ['content', 'label', 'domain', 'filePath'],
        content: loadTemplate(CAT, 'kb.curate_document'),
    },

    'kb.curate_data': {
        id: 'kb.curate_data',
        category: 'kb',
        description: 'Curate a spreadsheet/data chunk into knowledge for the graph',
        variables: ['content', 'label', 'domain', 'filePath'],
        content: loadTemplate(CAT, 'kb.curate_data'),
    },

    'kb.curate_image': {
        id: 'kb.curate_image',
        category: 'kb',
        description: 'Describe an image for ingestion into the knowledge graph',
        variables: ['domain', 'fileName'],
        content: loadTemplate(CAT, 'kb.curate_image'),
    },

    'kb.synthesizability_check': {
        id: 'kb.synthesizability_check',
        category: 'kb',
        description: 'Classify whether a knowledge node contains synthesizable content',
        variables: ['content'],
        content: loadTemplate(CAT, 'kb.synthesizability_check'),
    },

    'kb.post_ingestion_insights': {
        id: 'kb.post_ingestion_insights',
        category: 'kb',
        description: 'Generate high-level conceptual insights from freshly ingested knowledge base material',
        variables: ['nodeCount', 'domain', 'maxSummaries', 'sampleContent'],
        content: loadTemplate(CAT, 'kb.post_ingestion_insights'),
    },

    'kb.decompose_claims': {
        id: 'kb.decompose_claims',
        category: 'kb',
        description: 'Stage 1: Decompose a document section into atomic classified claims for graph ingestion',
        variables: ['content', 'label', 'domain', 'filePath'],
        content: loadTemplate(CAT, 'kb.decompose_claims'),
    },

    'kb.filter_claims': {
        id: 'kb.filter_claims',
        category: 'kb',
        description: 'Stage 2: Filter and format decomposed claims for graph ingestion with weight assignment',
        variables: ['paperTitle', 'paperAuthors', 'paperYear', 'filePath', 'domain', 'existingNodesBlock', 'claims'],
        content: loadTemplate(CAT, 'kb.filter_claims'),
    },
};
