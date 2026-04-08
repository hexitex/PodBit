/**
 * @module prompts/chat
 *
 * Chat interface prompt definitions. Includes the tool-calling system prompt
 * (knowledge assistant persona with graph tools), research seed generation,
 * connection voicing, summarization, compression, and default response prompts
 * used by the GUI Chat and MCP chat interactions.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'chat';

/**
 * Chat prompts, keyed by prompt ID (e.g. `'chat.default_response'`). Each
 * entry is a {@link PromptDefinition} whose `description` field serves as the
 * canonical documentation for that prompt's purpose and behavior.
 */
export const CHAT_PROMPTS: Record<string, PromptDefinition> = {
    'chat.tool_system': {
        id: 'chat.tool_system',
        category: 'chat',
        description: 'System prompt for the chat tool-calling mode — defines the knowledge assistant persona and available tools',
        variables: ['projectContext', 'knowledgeBlock', 'domainInfo', 'provenanceGuide'],
        content: loadTemplate(CAT, 'chat.tool_system'),
    },

    'chat.research_seeds': {
        id: 'chat.research_seeds',
        category: 'chat',
        description: 'Generate foundational seed facts about a topic',
        variables: ['topic'],
        content: loadTemplate(CAT, 'chat.research_seeds'),
    },

    'chat.propose_seeds': {
        id: 'chat.propose_seeds',
        category: 'chat',
        description: 'Generate rich, proposable seed knowledge about a topic',
        variables: ['topic'],
        content: loadTemplate(CAT, 'chat.propose_seeds'),
    },

    'chat.voice_connection': {
        id: 'chat.voice_connection',
        category: 'chat',
        description: 'Find the most interesting connection between node sets',
        variables: ['topic', 'topicNodes', 'otherNodes'],
        content: loadTemplate(CAT, 'chat.voice_connection'),
    },

    'chat.summarize': {
        id: 'chat.summarize',
        category: 'chat',
        description: 'Summarize important knowledge about a topic (chat command)',
        variables: ['topic', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'chat.summarize'),
    },

    'chat.compress': {
        id: 'chat.compress',
        category: 'chat',
        description: 'Generate a compressed meta-prompt from knowledge (chat command)',
        variables: ['topic', 'nodeList', 'provenanceGuide'],
        content: loadTemplate(CAT, 'chat.compress'),
    },

    'chat.default_response': {
        id: 'chat.default_response',
        category: 'chat',
        description: 'Default chat response using LLM with recent knowledge context',
        variables: ['context', 'message', 'provenanceGuide'],
        content: loadTemplate(CAT, 'chat.default_response'),
    },
};
