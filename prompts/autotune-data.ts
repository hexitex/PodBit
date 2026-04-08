/**
 * @module prompts/autotune-data
 *
 * Editable test data fixtures for auto-tune parameter testing. This is the
 * single source of truth for test data used by the auto-tune scoring system.
 * Loaded at runtime via `getPrompt()` and editable through the GUI Test Data
 * tab. Supersedes the deprecated `autotune-inputs.ts` module.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'autotune';

/**
 * Auto-tune data fixtures, keyed by prompt ID (e.g. `'autotune.data.fact_a'`).
 * Each entry is a {@link PromptDefinition} containing test input content for
 * a specific subsystem test. Editable via the GUI; changes are persisted to
 * the database and override these defaults.
 */
export const AUTOTUNE_DATA_PROMPTS: Record<string, PromptDefinition> = {

    'autotune.data.fact_a': {
        id: 'autotune.data.fact_a',
        category: 'testdata',
        description: 'RAG hallucination reduction fact — used in voice/synthesis tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.fact_a'),
    },

    'autotune.data.fact_b': {
        id: 'autotune.data.fact_b',
        category: 'testdata',
        description: 'Knowledge graph multi-hop reasoning fact — used in voice/synthesis tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.fact_b'),
    },

    'autotune.data.synthesis_text': {
        id: 'autotune.data.synthesis_text',
        category: 'testdata',
        description: 'Synthesis engine description — used in compress/summarize tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.synthesis_text'),
    },

    'autotune.data.raft_text': {
        id: 'autotune.data.raft_text',
        category: 'testdata',
        description: 'Distributed consensus (Raft/Paxos) description — used in reader/document tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.raft_text'),
    },

    'autotune.data.transfer_text': {
        id: 'autotune.data.transfer_text',
        category: 'testdata',
        description: 'Transfer learning / LoRA description — used in keyword tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.transfer_text'),
    },

    'autotune.data.revenue_table': {
        id: 'autotune.data.revenue_table',
        category: 'testdata',
        description: 'Regional revenue markdown table — used in sheet reader tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.revenue_table'),
    },

    'autotune.data.fib_code': {
        id: 'autotune.data.fib_code',
        category: 'testdata',
        description: 'Fibonacci TypeScript code — used in code reader tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.fib_code'),
    },

    'autotune.data.node_list': {
        id: 'autotune.data.node_list',
        category: 'testdata',
        description: 'Scored node list (distributed consensus) — used in chat summarize/compress tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.node_list'),
    },

    'autotune.data.knowledge_context': {
        id: 'autotune.data.knowledge_context',
        category: 'testdata',
        description: 'Knowledge context bullet points — used in chat default_response tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.knowledge_context'),
    },

    'autotune.data.docs_knowledge': {
        id: 'autotune.data.docs_knowledge',
        category: 'testdata',
        description: 'Docs knowledge blocks K1-K5 — used in docs outline/section generation tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.docs_knowledge'),
    },

    'autotune.data.conversation': {
        id: 'autotune.data.conversation',
        category: 'testdata',
        description: 'Multi-turn conversation about knowledge graph — used in context history compression tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.conversation'),
    },

    'autotune.data.breakthrough_claim': {
        id: 'autotune.data.breakthrough_claim',
        category: 'testdata',
        description: 'Partition bridges insight claim — used in breakthrough validation tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.breakthrough_claim'),
    },

    'autotune.data.breakthrough_sources': {
        id: 'autotune.data.breakthrough_sources',
        category: 'testdata',
        description: 'Source context for breakthrough validation — partition bridges + node decay',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.breakthrough_sources'),
    },

    'autotune.data.scaling_tension_a': {
        id: 'autotune.data.scaling_tension_a',
        category: 'testdata',
        description: 'Scaling laws claim (predictable improvement) — used in question generation tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.scaling_tension_a'),
    },

    'autotune.data.scaling_tension_b': {
        id: 'autotune.data.scaling_tension_b',
        category: 'testdata',
        description: 'Diminishing returns claim (tension with scaling laws) — used in question generation tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.scaling_tension_b'),
    },

    'autotune.data.signal_hint': {
        id: 'autotune.data.signal_hint',
        category: 'testdata',
        description: 'Signal hint for question generation — tension detection metadata',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.signal_hint'),
    },

    'autotune.data.qa_question': {
        id: 'autotune.data.qa_question',
        category: 'testdata',
        description: 'Research question about few-shot vs fine-tuning — used in question answer tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.qa_question'),
    },

    'autotune.data.qa_context': {
        id: 'autotune.data.qa_context',
        category: 'testdata',
        description: 'Context for question answering — transfer learning and scaling facts',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.qa_context'),
    },

    'autotune.data.chat_message': {
        id: 'autotune.data.chat_message',
        category: 'testdata',
        description: 'Chat test message — synthesis quality troubleshooting question',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.chat_message'),
    },

    'autotune.data.voice_topic_nodes': {
        id: 'autotune.data.voice_topic_nodes',
        category: 'testdata',
        description: 'Topic nodes for voice connection test — Raft and Paxos summaries',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.voice_topic_nodes'),
    },

    'autotune.data.voice_other_nodes': {
        id: 'autotune.data.voice_other_nodes',
        category: 'testdata',
        description: 'Other-domain nodes for voice connection test — BFT and knowledge graphs',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.voice_other_nodes'),
    },

    'autotune.data.research_knowledge': {
        id: 'autotune.data.research_knowledge',
        category: 'testdata',
        description: 'Existing ML domain knowledge — used in research cycle tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.research_knowledge'),
    },

    'autotune.data.research_questions': {
        id: 'autotune.data.research_questions',
        category: 'testdata',
        description: 'Open research questions — used in research cycle tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.research_questions'),
    },

    'autotune.data.autorating_node': {
        id: 'autotune.data.autorating_node',
        category: 'testdata',
        description: 'Junk filter self-poisoning insight — used in autorating tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.autorating_node'),
    },

    'autotune.data.autorating_parents': {
        id: 'autotune.data.autorating_parents',
        category: 'testdata',
        description: 'Parent node context for autorating test — junk filter and KB ingestion',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.autorating_parents'),
    },

    'autotune.data.evm_claim': {
        id: 'autotune.data.evm_claim',
        category: 'testdata',
        description: 'Hybrid Raft/Paxos protocol claim — used in EVM codegen tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.evm_claim'),
    },

    'autotune.data.evm_parent_a': {
        id: 'autotune.data.evm_parent_a',
        category: 'testdata',
        description: 'Raft consensus parent fact — used in EVM codegen tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.evm_parent_a'),
    },

    'autotune.data.evm_parent_b': {
        id: 'autotune.data.evm_parent_b',
        category: 'testdata',
        description: 'Paxos flexible quorum parent fact — used in EVM codegen tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.evm_parent_b'),
    },

    'autotune.data.dedup_existing': {
        id: 'autotune.data.dedup_existing',
        category: 'testdata',
        description: 'Existing node content for dedup judge testing — describes Raft leader election',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.dedup_existing'),
    },

    'autotune.data.dedup_new': {
        id: 'autotune.data.dedup_new',
        category: 'testdata',
        description: 'New candidate node for dedup judge testing — similar topic but adds pre-vote mechanism',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.dedup_new'),
    },

    'autotune.data.evm_sandbox_output': {
        id: 'autotune.data.evm_sandbox_output',
        category: 'testdata',
        description: 'Example sandbox output from a disproved EVM verification — used in evm.analysis tests',
        variables: [],
        content: loadTemplate(CAT, 'autotune.data.evm_sandbox_output'),
    },

};
