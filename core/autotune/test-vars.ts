/**
 * @module core/autotune/test-vars
 *
 * Test variable configurations for auto-tune prompt interpolation.
 *
 * Maps each operational prompt to the test data variables that exercise it.
 * Data is loaded at runtime from `autotune.data.*` prompts (editable via GUI).
 * Short literal values (labels, domains) stay inline.
 */

import type { SubsystemCategory, TestVarSpec } from './types.js';

// =============================================================================
// PROMPT → CATEGORY MAP
// =============================================================================

/**
 * Synchronous map: operational prompt ID → auto-tune category.
 * Used by getPromptIdsForCategory() and gold standard generation.
 * All tunable operational prompts must be listed here.
 */
export const PROMPT_CATEGORY_MAP: Record<string, SubsystemCategory> = {
    // Voice / Synthesis
    'core.insight_synthesis': 'voice',
    'core.multi_insight_synthesis': 'voice',
    'core.breakthrough_validation': 'voice',
    'core.novelty_gate': 'voice',
    'core.question_generation': 'voice',
    'core.question_answer': 'voice',
    // Compress / Context
    'knowledge.compress': 'compress',
    'knowledge.compress_task': 'compress',
    'knowledge.summarize': 'compress',
    'knowledge.summarize_task': 'compress',
    'context.history_compression': 'compress',
    // Chat / Docs / Research
    'chat.default_response': 'chat',
    'chat.research_seeds': 'chat',
    'chat.summarize': 'chat',
    'chat.compress': 'chat',
    'chat.voice_connection': 'chat',
    'core.research_cycle': 'chat',
    'docs.outline_decomposition': 'chat',
    'docs.section_generation': 'chat',
    'docs.section_escalation': 'chat',
    // Keyword
    'keyword.node_keywords': 'keyword',
    'keyword.domain_synonyms': 'keyword',
    // KB Readers
    'kb.curate_text': 'reader',
    'kb.curate_code': 'reader_code',
    'kb.curate_document': 'reader',
    'kb.curate_data': 'reader_sheet',
    // Autorating
    'core.autorating': 'autorating',
    // Verification
    'evm.analysis': 'evm_analysis',
    // Dedup
    'dedup.llm_judge': 'dedup_judge',
};

// =============================================================================
// TEST VARIABLE CONFIGURATIONS
// =============================================================================

/**
 * Maps operational prompts to the test data variables that exercise them.
 * Data is loaded at runtime from autotune.data.* prompts (editable via GUI).
 * Short literal values (labels, domains) stay inline.
 */
export const TEST_VAR_CONFIGS: Record<string, Record<string, TestVarSpec>> = {
    // ---- Voice / Synthesis ----
    'core.insight_synthesis': {
        contentA: { source: 'autotune.data.fact_a' },
        contentB: { source: 'autotune.data.fact_b' },
    },
    'core.multi_insight_synthesis': {
        contents: {
            deps: ['autotune.data.fact_a', 'autotune.data.fact_b'],
            fn: (d) => `A: ${d['autotune.data.fact_a']}\n\nB: ${d['autotune.data.fact_b']}`,
        },
    },
    'core.breakthrough_validation': {
        nodeContent: { source: 'autotune.data.breakthrough_claim' },
        sourceContext: { source: 'autotune.data.breakthrough_sources' },
    },
    'core.novelty_gate': {
        nodeContent: { source: 'autotune.data.breakthrough_claim' },
        sourceContext: { source: 'autotune.data.breakthrough_sources' },
        domain: { literal: 'distributed-systems' },
    },
    'core.question_generation': {
        contentA: { source: 'autotune.data.scaling_tension_a' },
        contentB: { source: 'autotune.data.scaling_tension_b' },
        signalHint: { source: 'autotune.data.signal_hint' },
    },
    'core.question_answer': {
        question: { source: 'autotune.data.qa_question' },
        context: { source: 'autotune.data.qa_context' },
    },

    // ---- Compress / Context ----
    'knowledge.compress': {
        topic: { literal: 'knowledge graph synthesis' },
        nodeList: { source: 'autotune.data.synthesis_text' },
    },
    'knowledge.compress_task': {
        topic: { literal: 'knowledge graph synthesis' },
        task: { literal: 'optimize synthesis quality for cross-domain discovery' },
        nodeList: { source: 'autotune.data.synthesis_text' },
    },
    'knowledge.summarize': {
        topic: { literal: 'knowledge graph synthesis' },
        nodeList: { source: 'autotune.data.synthesis_text' },
    },
    'knowledge.summarize_task': {
        topic: { literal: 'knowledge graph synthesis' },
        task: { literal: 'optimize synthesis quality for cross-domain discovery' },
        nodeList: { source: 'autotune.data.synthesis_text' },
    },
    'context.history_compression': {
        existingSummary: { literal: '' },
        compressText: { source: 'autotune.data.conversation' },
    },

    // ---- Chat / Docs / Research ----
    'chat.default_response': {
        context: { source: 'autotune.data.knowledge_context' },
        message: { source: 'autotune.data.chat_message' },
    },
    'chat.research_seeds': {
        topic: { literal: 'knowledge graphs' },
    },
    'chat.summarize': {
        topic: { literal: 'distributed consensus' },
        nodeList: { source: 'autotune.data.node_list' },
    },
    'chat.compress': {
        topic: { literal: 'distributed consensus' },
        nodeList: { source: 'autotune.data.node_list' },
    },
    'chat.voice_connection': {
        topic: { literal: 'distributed consensus' },
        topicNodes: { source: 'autotune.data.voice_topic_nodes' },
        otherNodes: { source: 'autotune.data.voice_other_nodes' },
    },
    'core.research_cycle': {
        domain: { literal: 'machine-learning' },
        existingKnowledge: { source: 'autotune.data.research_knowledge' },
        openQuestions: { source: 'autotune.data.research_questions' },
    },
    'docs.outline_decomposition': {
        taskType: { literal: 'technical_report' },
        request: { literal: 'Write a technical report on how knowledge graph synthesis engines discover novel cross-domain insights.' },
        knowledgeContext: { source: 'autotune.data.docs_knowledge' },
    },
    'docs.section_generation': {
        sectionTitle: { literal: 'Cross-Domain Discovery Mechanisms' },
        purpose: { literal: 'Explain how the synthesis engine discovers connections between different knowledge domains' },
        lengthMin: { literal: '800' },
        lengthMax: { literal: '1500' },
        mustInclude: { literal: 'partition bridges, embedding similarity, abstract patterns' },
        tone: { literal: 'technical but accessible' },
        knowledgeBlock: {
            deps: ['autotune.data.docs_knowledge'],
            fn: (d) => `\nKnowledge sources:\n${d['autotune.data.docs_knowledge']}`,
        },
        precedingBlock: { literal: '' },
        terminologyBlock: { literal: '' },
        failureBlock: { literal: '' },
    },
    'docs.section_escalation': {
        sectionTitle: { literal: 'Cross-Domain Discovery Mechanisms' },
        purpose: { literal: 'Explain how the synthesis engine discovers connections between different knowledge domains' },
        lengthMin: { literal: '800' },
        lengthMax: { literal: '1500' },
        mustInclude: { literal: 'partition bridges, embedding similarity, abstract patterns' },
        tone: { literal: 'technical but accessible' },
        failures: { literal: 'Previous attempt was too short (450 words) and did not reference knowledge sources.' },
        knowledgeBlock: {
            deps: ['autotune.data.docs_knowledge'],
            fn: (d) => `\nKnowledge sources:\n${d['autotune.data.docs_knowledge']}`,
        },
    },

    // ---- Keyword ----
    'keyword.node_keywords': {
        content: { source: 'autotune.data.transfer_text' },
        domain: { literal: 'machine-learning' },
    },
    'keyword.domain_synonyms': {
        domain: { literal: 'machine-learning' },
        existingSynonyms: { literal: 'ml, artificial intelligence, ai, deep learning, neural networks' },
    },

    // ---- KB Readers ----
    'kb.curate_text': {
        content: { source: 'autotune.data.raft_text' },
        label: { literal: 'Distributed Consensus Overview' },
        domain: { literal: 'distributed-systems' },
        filePath: { literal: 'docs/consensus.md' },
    },
    'kb.curate_code': {
        content: { source: 'autotune.data.fib_code' },
        label: { literal: 'Fibonacci utilities' },
        domain: { literal: 'algorithms' },
        language: { literal: 'TypeScript' },
        filePath: { literal: 'src/math/fibonacci.ts' },
    },
    'kb.curate_document': {
        content: { source: 'autotune.data.raft_text' },
        label: { literal: 'Distributed Consensus Overview' },
        domain: { literal: 'distributed-systems' },
        filePath: { literal: 'docs/consensus.pdf' },
    },
    'kb.curate_data': {
        content: { source: 'autotune.data.revenue_table' },
        label: { literal: 'Regional Revenue FY2024' },
        domain: { literal: 'business-analytics' },
        filePath: { literal: 'data/revenue.xlsx' },
    },

    // ---- Autorating ----
    'core.autorating': {
        nodeContent: { source: 'autotune.data.autorating_node' },
        nodeType: { literal: 'voiced' },
        nodeDomain: { literal: 'Podbit Curated' },
        parentContext: { source: 'autotune.data.autorating_parents' },
        projectContext: { literal: '' },
    },

    // ---- Verification ----
    'evm.analysis': {
        nodeContent: { source: 'autotune.data.evm_claim' },
        claimType: { literal: 'numerical_identity' },
        hypothesis: { literal: 'Flexible quorums (R+W>N) should yield lower read latency than strict majority quorums while maintaining write safety.' },
        sandboxOutput: { source: 'autotune.data.evm_sandbox_output' },
        domain: { literal: 'distributed-systems' },
        allowedModules: { literal: 'math, cmath, random, statistics, decimal, fractions, numbers, collections, itertools, functools, operator, heapq, bisect, array, string, textwrap, re, unicodedata, difflib, json, base64, binascii, struct, csv, datetime, calendar, copy, enum, dataclasses, types, uuid, pprint, hashlib, hmac, zlib' },
        analyserGuidance: { literal: 'Focus on the latency vs availability trade-off. Check whether the actual numbers reveal a known relationship between quorum size and latency distribution.' },
        polarity: { literal: '' },
    },
    // ---- Dedup ----
    'dedup.llm_judge': {
        similarity: { literal: '0.92' },
        existingContent: { source: 'autotune.data.dedup_existing' },
        newContent: { source: 'autotune.data.dedup_new' },
    },
};

// =============================================================================
// RUNTIME VARIABLE LOADING
// =============================================================================

/**
 * Resolve test variables for a prompt by loading data from the prompts system.
 *
 * Variable specs:
 * - `source` specs load content from `autotune.data.*` prompts
 * - `literal` specs pass through unchanged
 * - `fn` (compose) specs combine multiple loaded sources with a template function
 *
 * @param promptId - Operational prompt ID to load test variables for
 * @returns Map of variable name to resolved string value, or `null` if promptId
 *          has no TEST_VAR_CONFIGS entry
 */
export async function loadTestVars(promptId: string): Promise<Record<string, string> | null> {
    const { getPrompt } = await import('../../prompts.js');
    const config = TEST_VAR_CONFIGS[promptId];
    if (!config) return null;

    // Collect all autotune.data.* IDs needed across all specs
    const dataIds = new Set<string>();
    for (const spec of Object.values(config)) {
        if ('source' in spec) dataIds.add(spec.source);
        if ('deps' in spec) spec.deps.forEach(d => dataIds.add(d));
    }

    // Load all at once (getPrompt has in-memory cache)
    const loaded: Record<string, string> = {};
    for (const id of dataIds) loaded[id] = await getPrompt(id);

    // Resolve each variable from its spec
    const result: Record<string, string> = {};
    for (const [varName, spec] of Object.entries(config)) {
        if ('source' in spec) result[varName] = loaded[spec.source];
        else if ('literal' in spec) result[varName] = spec.literal;
        else if ('fn' in spec) result[varName] = spec.fn(loaded);
    }

    return result;
}

/**
 * Reverse lookup: category to all operational prompt IDs that map to it.
 *
 * Used by `runTest()` and `scoreAgainstGoldStandards()` to find gold standards
 * for a given subsystem category.
 *
 * @param category - Subsystem scoring category
 * @returns Array of prompt IDs that belong to this category
 */
export function getPromptIdsForCategory(category: SubsystemCategory): string[] {
    return Object.entries(PROMPT_CATEGORY_MAP)
        .filter(([, cat]) => cat === category)
        .map(([k]) => k);
}
