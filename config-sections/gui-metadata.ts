/**
 * GUI metadata enrichment for config sections.
 * Adds category (which CategoryGroup the section belongs to) and helpText
 * (displayed in HelpBadge) to each section. This file is the single source
 * of truth for GUI presentation — adding a new section here automatically
 * makes it appear in the correct category in the config UI.
 */
import type { CategoryId } from './types.js';

interface GuiEnrichment {
    category: CategoryId;
    helpText?: string;
    searchTerms?: string[];
}

export const GUI_ENRICHMENTS: Record<string, GuiEnrichment> = {

    // ═══ Synthesis Band — which pairs get synthesised ═══════════════════════
    resonance_specificity: {
        category: 'synthesisBand',
        helpText: 'Similarity measures semantic closeness between node pairs. Only pairs exceeding the threshold spawn children. Specificity measures concrete detail (numbers, technical terms, units) and determines if a child is "knowledge" or "abstraction".',
    },
    synthesis_validation: {
        category: 'synthesisBand',
        helpText: 'Before voicing, the synthesis engine validates that paired nodes represent a meaningful, non-trivial connection. These parameters control what qualifies as a valid pair.',
    },
    cluster_selection: {
        category: 'synthesisBand',
        helpText: 'When enabled, a fraction of synthesis cycles use simulated annealing to find optimal clusters of 3+ nodes instead of sequential pairwise sampling. The energy function balances coherence, diversity, node quality, and target size.',
        searchTerms: ['cluster', 'annealing', 'coherence', 'diversity', 'cooling'],
    },
    domain_directed: {
        category: 'synthesisBand',
        searchTerms: ['domain directed', 'synthesis mode'],
    },

    // ═══ Quality Gates — post-voicing filters (pipeline order) ══════════════
    synthesis_quality_gates: {
        category: 'qualityGates',
        helpText: 'These gates reject synthesis engine output that is too similar to previously junked nodes or too vague. They run after the dedup check and before node creation.',
    },
    dedup_settings: {
        category: 'qualityGates',
        helpText: 'The dedup gate checks if synthesis output duplicates existing nodes before creating them. When an LLM judge is assigned, borderline cases in the doubt zone are sent for novelty assessment.',
    },
    hallucination_detection: {
        category: 'qualityGates',
        helpText: 'After synthesis, output is checked against multiple heuristics. If enough red flags are triggered, the output is rejected. Lower min red flags = stricter detection. Per-tier overrides below take precedence when a model of that tier is assigned.',
    },
    medium_hallucination: {
        category: 'qualityGates',
        helpText: 'Override hallucination gate thresholds when a medium-tier model is producing synthesis. Medium models may hallucinate more and benefit from stricter checks.',
        searchTerms: ['tier', 'medium', 'per-model', 'quality gates'],
    },
    frontier_hallucination: {
        category: 'qualityGates',
        helpText: 'Override hallucination gate thresholds when a frontier-tier model is producing synthesis. Frontier models deserve more freedom — they derive numbers through reasoning.',
        searchTerms: ['tier', 'frontier', 'powerful', 'per-model', 'quality gates'],
    },
    medium_voicing: {
        category: 'qualityGates',
        helpText: 'Override voicing quality gates when a medium-tier model is producing synthesis.',
        searchTerms: ['tier', 'medium', 'voicing', 'per-model'],
    },
    frontier_voicing: {
        category: 'qualityGates',
        helpText: 'Override voicing quality gates when a frontier-tier model is producing synthesis.',
        searchTerms: ['tier', 'frontier', 'voicing', 'per-model'],
    },
    node_validation: {
        category: 'qualityGates',
        helpText: 'When content is proposed, it is checked against these patterns. If the ratio of generic/filler matches exceeds the threshold in short content, it is flagged as too generic.',
    },
    ground_rules: {
        category: 'qualityGates',
        helpText: 'The ground rules gate is the first check in the synthesis pipeline. It classifies whether nodes contain synthesizable knowledge (mechanisms, principles, causal claims) versus inert content (paper summaries, methodology descriptions, bare results). Non-synthesizable nodes are excluded from partner selection, preventing wasted synthesis cycles.',
        searchTerms: ['ground rules', 'synthesizable', 'classify', 'first gate', 'seed quality', 'ground zero'],
    },
    minitruth: {
        category: 'qualityGates',
        helpText: 'The minitruth reviewer in the birth pipeline. Evaluates every synthesis before node creation: accept (enter graph), rework (re-voice with feedback), or reject (discard). This is the primary quality gate — mechanical checks handle dedup/junk, minitruth judges meaning.',
        searchTerms: ['minitruth', 'validation', 'birth', 'accept', 'rework', 'reject', 'judge', 'reviewer'],
    },
    consultant_pipeline: {
        category: 'cullPipeline',
        helpText: 'Controls the scoring dimensions and threshold used by the comprehensive consultant LLM — the single evaluation that the population control cycle uses to judge synthesis quality post-birth.',
        searchTerms: ['consultant pipeline', 'threshold', 'compression level', 'quality score', 'scoring dimensions'],
    },
    consultant_review: {
        category: 'qualityGates',
        helpText: 'When a subsystem\'s primary model produces low-confidence output, the consultant model reviews and scores it. No consultant assigned = no review. All decisions are logged to the node audit trail.',
        searchTerms: ['consultant', 'review', 'escalation', 'second opinion', 'low confidence'],
    },

    // ═══ Output Shape — what synthesised text looks like ════════════════════
    voicing_constraints: {
        category: 'outputShape',
        helpText: 'Controls how long synthesis output can be and how much novelty is required. Higher novelty requirements prevent the synthesis engine from restating its inputs.',
    },
    number_variables: {
        category: 'outputShape',
        helpText: 'When enabled, all numbers in node content are extracted into a registry and replaced with variable references scoped to their source domain. This prevents the synthesis engine from treating domain-specific numbers as universal constants.',
        searchTerms: ['number variables', 'variable', 'scoped', 'context window', 'installation prefix'],
    },

    // ═══ Node Evolution — how nodes gain/lose importance ════════════════════
    node_defaults: {
        category: 'nodeEvolution',
        helpText: 'Every new node starts with these weight and salience values. Lower defaults mean nodes must prove their value through successful synthesis before competing with established nodes.',
        searchTerms: ['default weight', 'default salience', 'breakthrough', 'promote', 'warm', 'starting weight'],
    },
    feedback_weights: {
        category: 'nodeEvolution',
        helpText: 'Controls how much user and autorater feedback adjusts node weight. Stronger negative weights cause junk to decay faster. The asymmetry between useful and not-useful feedback determines whether low-quality nodes accumulate.',
        searchTerms: ['feedback', 'useful', 'harmful', 'penalty', 'autorater', 'weight floor'],
    },
    temperature_dynamics: {
        category: 'nodeEvolution',
        helpText: 'Salience determines selection probability. High-salience nodes are more likely to be sampled. Salience increases when nodes participate and decays over time, creating a natural attention mechanism.',
    },
    weight_dynamics: {
        category: 'nodeEvolution',
        helpText: 'Weight represents accumulated value. Knowledge-trajectory children boost their parents\' weights, creating a selection pressure toward productive nodes.',
    },
    node_lifecycle: {
        category: 'nodeEvolution',
        helpText: 'Nodes progress through lifecycle states based on fertility (producing children via synthesis). Nascent nodes that produce a child become active. Active nodes that go barren too long decline. Declining nodes get composted (archived to lightweight stubs).',
        searchTerms: ['lifecycle', 'barren', 'compost', 'nascent', 'declining', 'fertility', 'stillborn', 'sweep'],
    },
    fitness_modifier: {
        category: 'nodeEvolution',
        searchTerms: ['fitness', 'dissimilarity', 'novelty'],
    },
    ga_features: {
        category: 'nodeEvolution',
        searchTerms: ['genetic', 'tournament', 'selection'],
    },
    magic_numbers: {
        category: 'nodeEvolution',
        helpText: 'These values were originally buried as literal constants in the synthesis engine, question-answering cycle, research cycle, and node operations. They interact across subsystems and were chosen empirically — change with care.',
        searchTerms: ['magic numbers', 'junk filter', 'domain inference', 'salience rescue', 'question candidate', 'weight penalty', 'grace period'],
    },
    synthesis_timing: {
        category: 'nodeEvolution',
        helpText: 'The synthesis engine runs cycles continuously, sampling node pairs, checking similarity, and creating children. These parameters control the timing and periodic maintenance tasks.',
    },

    // ═══ Autonomous Cycles — what runs in the background ════════════════════
    cycle_timing: {
        category: 'autonomousCycles',
        helpText: 'Each autonomous cycle runs independently on its own timer. Intervals control how long to sleep between ticks. Lower = faster throughput but more LLM calls. Changes take effect on the next tick without restarting cycles.',
    },
    cycle_validation: {
        category: 'autonomousCycles',
        searchTerms: ['breakthrough', 'scanner'],
    },
    cycle_questions: {
        category: 'autonomousCycles',
        searchTerms: ['question', 'answering'],
    },
    cycle_tensions: {
        category: 'autonomousCycles',
        searchTerms: ['tension', 'contradiction'],
    },
    cycle_research: {
        category: 'autonomousCycles',
        searchTerms: ['research', 'seeding'],
    },
    cycle_autorating: {
        category: 'autonomousCycles',
        searchTerms: ['autorating', 'rating'],
    },
    cycle_evm: {
        category: 'autonomousCycles',
        searchTerms: ['lab', 'verification cycle'],
    },
    cycle_voicing: {
        category: 'autonomousCycles',
        searchTerms: ['voicing cycle'],
    },
    lab: {
        category: 'verificationElite',
        helpText: 'The lab framework controls how nodes behave during experiments. Freeze prevents synthesis, decay, and lifecycle transitions for nodes under active verification. Taint propagation marks downstream children when a parent claim is refuted. Lab chaining auto-forwards results to a critique lab for methodology review — the critique can confirm, correct, or request a retest before consequences are applied.',
        searchTerms: ['lab', 'freeze', 'taint', 'propagation', 'experiment', 'frozen', 'tainted', 'math-lab', 'verification', 'routing', 'registry', 'multi-lab', 'health check', 'timeout', 'chaining', 'critique', 'methodology', 'review', 'defer', 'retest'],
    },
    embedding_eval: {
        category: 'cullPipeline',
        helpText: 'Instruction-aware embedding pre-screening for population control. Embeds nodes under task-specific instructions (structural claim, mechanical process, etc.) and computes cosine similarity to detect failure modes before the LLM consultant runs. Start in shadow mode to calibrate thresholds.',
        searchTerms: ['embedding eval', 'instruction aware', 'drift', 'lexical bridge', 'number recycling', 'toxic parent', 'qwen', 'shadow mode', 'pre-screen'],
    },
    population_control: {
        category: 'cullPipeline',
        helpText: 'Post-birth quality cycle. Instead of blocking synthesis inline, quality gates evaluate nodes AFTER creation and demote or archive weak ones. This separates permissive birth from strict culling — creative cross-domain connections can form freely, then the cull cycle trims weak output on a configurable schedule.',
        searchTerms: ['population control', 'cull', 'culling', 'post-birth', 'quality sweep', 'demote', 'archive', 'grace period'],
    },
    dedup_sweep: {
        category: 'cullPipeline',
        helpText: 'Automatic embedding-only dedup that runs every population control tick. Finds clusters of semantically duplicate nodes using cosine similarity + word overlap (no LLM cost), keeps the highest-weight node in each cluster, and archives the rest. Targets newest, lowest-weight nodes first.',
        searchTerms: ['dedup', 'duplicate', 'deduplication', 'sweep', 'auto dedup', 'embedding dedup', 'cosine similarity', 'word overlap', 'star clustering'],
    },

    // ═══ Verification & Elite — computational proof and promotion ═══════════
    labVerify: {
        category: 'verificationElite',
        helpText: 'Controls how the graph responds to lab experiment results. Claims are submitted to external lab servers for testing. Supported claims get weight boosts, refuted claims get penalties and can be auto-archived. The spec_extraction subsystem extracts testable experiment specs from claims.',
        searchTerms: ['verification', 'lab', 'weight boost', 'auto verify', 'archive', 'refuted', 'supported', 'labVerify'],
    },
    post_rejection: {
        category: 'verificationElite',
        helpText: 'After a lab disproves a node\'s claim, the post-rejection pipeline re-examines the result at high precision. If the analysis discovers an alternative pattern or corrected relationship, it can automatically propose a recovery node back into the graph.',
        searchTerms: ['post-rejection', 'analysis', 'recovery', 'mpmath', 'sympy'],
    },
    spec_review: {
        category: 'verificationElite',
        helpText: 'Adversarial review of extracted experiment specs. A second LLM checks whether the setup parameters are cherry-picked to guarantee the claimed result. Catches tautological specs that pass structural checks but have rigged parameterization (e.g. extreme curvature ratios that force one optimizer to always win).',
        searchTerms: ['falsifiability', 'tautology', 'cherry-pick', 'adversarial', 'rigged', 'spec review'],
    },
    evm_decompose: {
        category: 'verificationElite',
        helpText: 'When a claim is too complex for the codegen LLM to verify monolithically, decompose it into atomic facts and expert research questions. Each piece becomes a separate node linked as a child of the original.',
        searchTerms: ['decompose', 'decomposition', 'fact', 'claim type'],
    },
    api_verification: {
        category: 'verificationElite',
        helpText: 'API data is gathered pre-codegen, driven by triage. Triage sees available APIs and decides which to call. Data is injected into codegen context alongside web research. Enrichment extracts additional knowledge facts from API responses.',
        searchTerms: ['API verification', 'api', 'enrichment', 'PubChem', 'UniProt', 'CrossRef', 'triage', 'pre-codegen'],
    },
    elite_pool: {
        category: 'verificationElite',
        helpText: 'The elite pool promotes high-confidence lab-verified nodes into a curated collection that tracks progress against the project manifest. Promoted findings participate in higher-generation synthesis (elite-to-elite bridging).',
        searchTerms: ['elite', 'pool', 'promotion', 'generation', 'bridging', 'manifest', 'elite dedup', 'elite weight'],
    },

    // ═══ Knowledge Delivery — how knowledge reaches LLMs ════════════════════
    knowledge_proxy: {
        category: 'knowledgeDelivery',
        helpText: 'The knowledge proxy enriches LLM requests with graph knowledge. These settings control what fraction of the context window is allocated to knowledge injection.',
        searchTerms: ['proxy', 'knowledge reserve'],
    },
    context_engine: {
        category: 'knowledgeDelivery',
        helpText: 'The context engine selects relevant knowledge nodes and manages token budgets across knowledge, history, system prompt, and response reserves. It adapts over multiple turns and learns across sessions.',
        searchTerms: ['context engine', 'budget', 'knowledge nodes', 'relevance', 'session history', 'compression threshold', 'feedback'],
    },
    intake_defense: {
        category: 'knowledgeDelivery',
        helpText: 'Monitors the ratio of recent proposals from each domain. When a single domain dominates, it warns or throttles new proposals. Human-sourced seeds bypass this check.',
        searchTerms: ['intake', 'concentration', 'throttle', 'flooding'],
    },
    knowledge_base: {
        category: 'knowledgeDelivery',
        searchTerms: ['knowledge base', 'kb', 'ingestion'],
    },

    // ═══ Model Parameters — LLM inference settings per subsystem ════════════
    subsystem_temperatures: {
        category: 'modelParameters',
        helpText: 'Each subsystem uses a default temperature when calling its assigned model. Lower values (0.1-0.3) produce deterministic output, higher values (0.5-0.9) produce creative output.',
        searchTerms: ['temperature', 'voice', 'chat', 'compress', 'research', 'context', 'docs', 'keyword', 'image reader'],
    },
    subsystem_repeat_penalties: {
        category: 'modelParameters',
        helpText: 'Some models produce stuttered/duplicated text. A repeat penalty discourages the model from repeating tokens. 1.0 = no penalty, 1.3-1.5 = moderate, 2.0 = aggressive.',
        searchTerms: ['repeat', 'penalty', 'stutter', 'frequency'],
    },
    subsystem_top_p: {
        category: 'modelParameters',
        helpText: 'Top-p limits the model to tokens whose cumulative probability reaches the threshold. Lower values (0.5-0.7) restrict to high-confidence tokens. Higher values (0.9-1.0) allow more diversity.',
        searchTerms: ['top_p', 'nucleus', 'top p'],
    },
    subsystem_min_p: {
        category: 'modelParameters',
        helpText: 'Min-p removes tokens whose probability is less than min_p times the top token\'s probability. Higher values (0.1-0.3) = more focused. 0 = disabled.',
        searchTerms: ['min_p', 'minimum probability', 'min p'],
    },
    subsystem_top_k: {
        category: 'modelParameters',
        helpText: 'Top-k restricts the model to only the K most likely next tokens. Lower values (10-20) = more focused. Higher values (40-100) = more diverse. 0 = disabled.',
        searchTerms: ['top_k', 'top k'],
    },
    consultant_temperatures: {
        category: 'modelParameters',
        helpText: 'Consultant models review primary model output for quality gating. They typically need low temperature for deterministic, consistent scoring. Default 0.15.',
        searchTerms: ['consultant temperature', 'consultant temp'],
    },
    consultant_repeat_penalties: {
        category: 'modelParameters',
        helpText: 'Repeat penalty for consultant models. Usually not needed since consultant reviews are short structured outputs.',
        searchTerms: ['consultant repeat', 'consultant penalty'],
    },
    consultant_top_p: {
        category: 'modelParameters',
        helpText: 'Top-p (nucleus) sampling for consultant models. Lower values restrict to high-confidence tokens for more deterministic review scoring.',
        searchTerms: ['consultant top_p', 'consultant nucleus'],
    },
    consultant_min_p: {
        category: 'modelParameters',
        helpText: 'Min-p filtering for consultant models. Removes tokens below a minimum probability relative to the top token.',
        searchTerms: ['consultant min_p', 'consultant minimum'],
    },
    consultant_top_k: {
        category: 'modelParameters',
        helpText: 'Top-k sampling for consultant models. Restricts to the K most likely tokens. Set to 0 to disable.',
        searchTerms: ['consultant top_k'],
    },

    // ═══ Word Lists & Patterns — content-level configuration ════════════════
    telegraphic_word_lists: {
        category: 'wordListsPatterns',
        helpText: 'These lists control which words get removed or replaced during telegraphic compression. Phrase mappings are applied first (multi-word), then single-word mappings, then removal lists by aggressiveness level. Preserved words are never removed.',
        searchTerms: ['telegraphic', 'word list', 'phrase', 'substitution', 'remove', 'preserve'],
    },
    synthesis_vocabulary: {
        category: 'wordListsPatterns',
        helpText: 'These analytical/connective words are natural tools of synthesis and should not count as "novel" when checking for hallucination. Without this list, the detector penalizes the very vocabulary synthesis needs.',
    },
    context_stop_words: {
        category: 'wordListsPatterns',
        helpText: 'The context engine extracts keywords from messages to find relevant knowledge nodes. These common words are filtered out to improve match quality.',
        searchTerms: ['context stop', 'stop words'],
    },
    voicing_cleanup: {
        category: 'wordListsPatterns',
        helpText: 'LLMs sometimes prefix their synthesis with preamble like "The new insight is:" or "Combining these:". These patterns remove such prefixes from voiced output.',
        searchTerms: ['voicing cleanup', 'cleanup pattern'],
    },
    prompt_injection_detection: {
        category: 'wordListsPatterns',
        helpText: 'Scans all proposed content for prompt injection patterns (instruction overrides, role hijacking, template markers). Auto-generated content is hard-rejected. Seeds and human contributions are flagged but allowed through.',
        searchTerms: ['injection', 'score threshold'],
    },
    transient_partitions: {
        category: 'wordListsPatterns',
        helpText: 'Transient partitions are knowledge collections imported from external Podbit instances. They arrive in quarantine, undergo injection scanning, get approved and bridged for synthesis, then depart when exhausted.',
        searchTerms: ['transient', 'visitor', 'quarantine', 'import', 'depart', 'sandbox'],
    },
};
