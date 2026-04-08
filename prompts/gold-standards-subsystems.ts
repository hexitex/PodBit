/**
 * @module prompts/gold-standards-subsystems
 *
 * Subsystem gold standard responses for auto-tuning. Covers compress, chat,
 * keyword, context, dedup, and docs prompt gold standards at three quality
 * tiers (ideal, good, acceptable).
 */

import type { DefaultGoldStandard } from './gold-standards-core.js';
import { loadGoldStandard } from './loader.js';

const CAT = 'subsystems';

/**
 * Subsystem gold standard responses for compress, chat, keyword, context,
 * dedup, and docs prompts. Each entry is a {@link DefaultGoldStandard} with
 * a prompt ID, quality tier, and reference content for auto-tune scoring.
 */
export const SUBSYSTEM_GOLD_STANDARDS: DefaultGoldStandard[] = [
    { promptId: 'knowledge.compress', tier: 1, content: loadGoldStandard(CAT, 'knowledge.compress', 1) },
    { promptId: 'knowledge.compress', tier: 2, content: loadGoldStandard(CAT, 'knowledge.compress', 2) },
    { promptId: 'knowledge.compress', tier: 3, content: loadGoldStandard(CAT, 'knowledge.compress', 3) },
    { promptId: 'knowledge.compress_task', tier: 1, content: loadGoldStandard(CAT, 'knowledge.compress_task', 1) },
    { promptId: 'knowledge.compress_task', tier: 2, content: loadGoldStandard(CAT, 'knowledge.compress_task', 2) },
    { promptId: 'knowledge.compress_task', tier: 3, content: loadGoldStandard(CAT, 'knowledge.compress_task', 3) },
    { promptId: 'knowledge.summarize', tier: 1, content: loadGoldStandard(CAT, 'knowledge.summarize', 1) },
    { promptId: 'knowledge.summarize', tier: 2, content: loadGoldStandard(CAT, 'knowledge.summarize', 2) },
    { promptId: 'knowledge.summarize', tier: 3, content: loadGoldStandard(CAT, 'knowledge.summarize', 3) },
    { promptId: 'knowledge.summarize_task', tier: 1, content: loadGoldStandard(CAT, 'knowledge.summarize_task', 1) },
    { promptId: 'knowledge.summarize_task', tier: 2, content: loadGoldStandard(CAT, 'knowledge.summarize_task', 2) },
    { promptId: 'knowledge.summarize_task', tier: 3, content: loadGoldStandard(CAT, 'knowledge.summarize_task', 3) },
    { promptId: 'context.history_compression', tier: 1, content: loadGoldStandard(CAT, 'context.history_compression', 1) },
    { promptId: 'context.history_compression', tier: 2, content: loadGoldStandard(CAT, 'context.history_compression', 2) },
    { promptId: 'context.history_compression', tier: 3, content: loadGoldStandard(CAT, 'context.history_compression', 3) },
    { promptId: 'chat.default_response', tier: 1, content: loadGoldStandard(CAT, 'chat.default_response', 1) },
    { promptId: 'chat.default_response', tier: 2, content: loadGoldStandard(CAT, 'chat.default_response', 2) },
    { promptId: 'chat.default_response', tier: 3, content: loadGoldStandard(CAT, 'chat.default_response', 3) },
    { promptId: 'chat.research_seeds', tier: 1, content: loadGoldStandard(CAT, 'chat.research_seeds', 1) },
    { promptId: 'chat.research_seeds', tier: 2, content: loadGoldStandard(CAT, 'chat.research_seeds', 2) },
    { promptId: 'chat.research_seeds', tier: 3, content: loadGoldStandard(CAT, 'chat.research_seeds', 3) },
    { promptId: 'chat.summarize', tier: 1, content: loadGoldStandard(CAT, 'chat.summarize', 1) },
    { promptId: 'chat.summarize', tier: 2, content: loadGoldStandard(CAT, 'chat.summarize', 2) },
    { promptId: 'chat.summarize', tier: 3, content: loadGoldStandard(CAT, 'chat.summarize', 3) },
    { promptId: 'chat.compress', tier: 1, content: loadGoldStandard(CAT, 'chat.compress', 1) },
    { promptId: 'chat.compress', tier: 2, content: loadGoldStandard(CAT, 'chat.compress', 2) },
    { promptId: 'chat.compress', tier: 3, content: loadGoldStandard(CAT, 'chat.compress', 3) },
    { promptId: 'chat.voice_connection', tier: 1, content: loadGoldStandard(CAT, 'chat.voice_connection', 1) },
    { promptId: 'chat.voice_connection', tier: 2, content: loadGoldStandard(CAT, 'chat.voice_connection', 2) },
    { promptId: 'chat.voice_connection', tier: 3, content: loadGoldStandard(CAT, 'chat.voice_connection', 3) },
    { promptId: 'keyword.node_keywords', tier: 1, content: loadGoldStandard(CAT, 'keyword.node_keywords', 1) },
    { promptId: 'keyword.node_keywords', tier: 2, content: loadGoldStandard(CAT, 'keyword.node_keywords', 2) },
    { promptId: 'keyword.node_keywords', tier: 3, content: loadGoldStandard(CAT, 'keyword.node_keywords', 3) },
    { promptId: 'keyword.domain_synonyms', tier: 1, content: loadGoldStandard(CAT, 'keyword.domain_synonyms', 1) },
    { promptId: 'keyword.domain_synonyms', tier: 2, content: loadGoldStandard(CAT, 'keyword.domain_synonyms', 2) },
    { promptId: 'keyword.domain_synonyms', tier: 3, content: loadGoldStandard(CAT, 'keyword.domain_synonyms', 3) },
    { promptId: 'dedup.llm_judge', tier: 1, content: loadGoldStandard(CAT, 'dedup.llm_judge', 1) },
    { promptId: 'dedup.llm_judge', tier: 2, content: loadGoldStandard(CAT, 'dedup.llm_judge', 2) },
    { promptId: 'dedup.llm_judge', tier: 3, content: loadGoldStandard(CAT, 'dedup.llm_judge', 3) },
    { promptId: 'docs.outline_decomposition', tier: 1, content: loadGoldStandard(CAT, 'docs.outline_decomposition', 1) },
    { promptId: 'docs.outline_decomposition', tier: 2, content: loadGoldStandard(CAT, 'docs.outline_decomposition', 2) },
    { promptId: 'docs.outline_decomposition', tier: 3, content: loadGoldStandard(CAT, 'docs.outline_decomposition', 3) },
    { promptId: 'docs.section_generation', tier: 1, content: loadGoldStandard(CAT, 'docs.section_generation', 1) },
    { promptId: 'docs.section_generation', tier: 2, content: loadGoldStandard(CAT, 'docs.section_generation', 2) },
    { promptId: 'docs.section_generation', tier: 3, content: loadGoldStandard(CAT, 'docs.section_generation', 3) },
    { promptId: 'docs.section_escalation', tier: 1, content: loadGoldStandard(CAT, 'docs.section_escalation', 1) },
    { promptId: 'docs.section_escalation', tier: 2, content: loadGoldStandard(CAT, 'docs.section_escalation', 2) },
    { promptId: 'docs.section_escalation', tier: 3, content: loadGoldStandard(CAT, 'docs.section_escalation', 3) },
];
