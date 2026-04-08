/**
 * @module prompts/knowledge
 *
 * Knowledge extraction and compression prompts. Used by the compress/summarize
 * MCP tools to generate structured summaries, dense meta-prompts, and domain
 * digests from graph nodes. Task-aware variants rerank by relevance to a
 * specific task before compression.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'knowledge';

/**
 * Knowledge prompts, keyed by prompt ID (e.g. `'knowledge.compress'`). Each
 * entry is a {@link PromptDefinition} whose `description` field serves as the
 * canonical documentation for that prompt's purpose and behavior.
 */
export const KNOWLEDGE_PROMPTS: Record<string, PromptDefinition> = {
    'knowledge.summarize': {
        id: 'knowledge.summarize',
        category: 'knowledge',
        description: 'Summarize knowledge nodes about a topic',
        variables: ['topic', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'knowledge.summarize'),
    },

    'knowledge.summarize_task': {
        id: 'knowledge.summarize_task',
        category: 'knowledge',
        description: 'Summarize knowledge nodes focused on a specific task',
        variables: ['topic', 'task', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'knowledge.summarize_task'),
    },

    'knowledge.digest': {
        id: 'knowledge.digest',
        category: 'knowledge',
        description: 'Compress top knowledge nodes for a domain into a single dense digest paragraph',
        variables: ['nodeCount', 'domain', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'knowledge.digest'),
    },

    'knowledge.compress': {
        id: 'knowledge.compress',
        category: 'knowledge',
        description: 'Compress knowledge nodes into a dense meta-prompt',
        variables: ['topic', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'knowledge.compress'),
    },

    'knowledge.compress_task': {
        id: 'knowledge.compress_task',
        category: 'knowledge',
        description: 'Compress knowledge nodes into a meta-prompt focused on a task',
        variables: ['topic', 'task', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'knowledge.compress_task'),
    },
};
