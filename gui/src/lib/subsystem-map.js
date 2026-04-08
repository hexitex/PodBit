/**
 * Subsystem Relationship Map — links Prompts <-> Models <-> Config.
 *
 * Each subsystem connects to specific prompts and config sections.
 * Used by all three pages to render cross-navigation links.
 *
 * IMPORTANT: configSections values MUST match actual sectionId props on
 * <CollapsibleSection> components in AlgorithmParameters.jsx.
 * If a section doesn't exist in the UI, the link will be broken.
 */

export const SUBSYSTEM_MAP = {
  voice: {
    label: 'Voice',
    tier: 'frontier',
    prompts: ['core.insight_synthesis', 'core.breakthrough_validation', 'core.question_generation', 'core.question_answer', 'core.multi_insight_synthesis', 'core.novelty_gate'],
    configSections: ['voicing_constraints', 'synthesis_quality_gates', 'synthesis_validation', 'voicing_cleanup', 'claim_provenance', 'hallucination_detection', 'synthesis_vocabulary', 'telegraphic_word_lists', 'node_validation', 'number_variables', 'minitruth'],
  },
  chat: {
    label: 'Chat',
    tier: 'frontier',
    prompts: ['chat.default_response', 'chat.tool_system', 'chat.compress', 'chat.summarize', 'chat.research_seeds', 'chat.voice_connection', 'project.interview_start', 'project.interview'],
    configSections: ['prompt_injection_detection'],
  },
  research: {
    label: 'Research',
    tier: 'frontier',
    prompts: ['core.research_cycle'],
    configSections: ['cycle_timing'],
  },
  docs: {
    label: 'Docs',
    tier: 'frontier',
    prompts: ['docs.outline_decomposition', 'docs.section_generation', 'docs.section_escalation', 'docs.template_validation'],
    configSections: [],
  },
  tuning_judge: {
    label: 'Tuning Judge',
    tier: 'frontier',
    prompts: ['quality.consultant_review'],
    configSections: ['consultant_review', 'consultant_temperatures', 'consultant_repeat_penalties', 'consultant_top_p', 'consultant_min_p', 'consultant_top_k'],
  },
  breakthrough_check: {
    label: 'Breakthrough Check',
    tier: 'frontier',
    prompts: [],
    configSections: [],
  },
  config_tune: {
    label: 'Config Tune',
    tier: 'medium',
    prompts: ['config.tune', 'config.generate_patterns', 'config.generate_intent_patterns', 'config.generate_words'],
    configSections: [],
  },
  compress: {
    label: 'Compress',
    tier: 'medium',
    prompts: ['knowledge.compress', 'knowledge.compress_task', 'knowledge.summarize', 'knowledge.summarize_task', 'knowledge.digest', 'project.bootstrap_seeds', 'kb.post_ingestion_insights'],
    configSections: ['knowledge_proxy'],
  },
  context: {
    label: 'Context',
    tier: 'small',
    prompts: ['context.history_compression'],
    configSections: ['context_engine', 'context_stop_words'],
  },
  keyword: {
    label: 'Keyword',
    tier: 'small',
    prompts: ['keyword.node_keywords', 'keyword.domain_synonyms', 'domain.classify'],
    configSections: [],
  },
  autorating: {
    label: 'Autorating',
    tier: 'small',
    prompts: ['core.autorating'],
    configSections: ['cycle_timing'],
  },
  elite_mapping: {
    label: 'Elite Mapping',
    tier: 'medium',
    prompts: [],
    configSections: ['elite_pool'],
  },
  spec_extraction: {
    label: 'Spec Extraction',
    tier: 'medium',
    prompts: ['evm.spec_extraction'],
    configSections: ['labVerify', 'lab'],
  },
  spec_review: {
    label: 'Spec Review (Falsifiability)',
    tier: 'medium',
    prompts: ['evm.spec_review'],
    configSections: ['labVerify'],
  },
  lab_routing: {
    label: 'Lab Routing',
    tier: 'medium',
    prompts: ['lab.routing'],
    configSections: ['lab'],
  },
  evm_codegen: {
    label: 'Lab Codegen [deprecated]',
    tier: 'frontier',
    prompts: ['evm.codegen', 'evm.codegen_retry'],
    configSections: ['labVerify'],
  },
  evm_triage: {
    label: 'Lab Triage [fallback for spec_extraction]',
    tier: 'medium',
    prompts: ['evm.triage'],
    configSections: ['labVerify'],
  },
  evm_analysis: {
    label: 'Post-Rejection Analysis',
    tier: 'frontier',
    prompts: ['evm.analysis', 'evm.analyser_numerical_identity', 'evm.analyser_convergence_rate', 'evm.analyser_symbolic_identity', 'evm.analyser_curve_shape', 'evm.analyser_threshold_behaviour', 'evm.analyser_structural_mapping'],
    configSections: ['post_rejection'],
  },
  evm_research: {
    label: 'Web Research [deprecated]',
    tier: 'frontier',
    prompts: ['evm.data_gathering'],
    configSections: ['labVerify'],
  },
  evm_structural: {
    label: 'Structural Eval [deprecated — lab]',
    tier: 'medium',
    prompts: ['evm.structural_eval'],
    configSections: ['labVerify'],
  },
  evm_expert: {
    label: 'Domain Expert [deprecated — lab]',
    tier: 'frontier',
    prompts: ['evm.expert_eval'],
    configSections: ['labVerify'],
  },
  evm_guidance: {
    label: 'Guidance & Decompose',
    tier: 'frontier',
    prompts: ['evm.guidance_suggest', 'evm.guidance_system', 'evm.decompose'],
    configSections: ['labVerify_decompose'],
  },
  api_verification: {
    label: 'API Verification',
    tier: 'medium',
    prompts: ['api.decision', 'api.interpreter_system', 'api.interpret', 'api.onboard_start', 'api.onboard_continue'],
    configSections: ['api_verification'],
  },
  reader_text: {
    label: 'Reader: Text',
    tier: 'medium',
    prompts: ['kb.curate_text'],
    configSections: ['intake_defense'],
  },
  reader_pdf: {
    label: 'Reader: PDF',
    tier: 'medium',
    prompts: ['kb.curate_text'],
    configSections: ['intake_defense'],
  },
  reader_doc: {
    label: 'Reader: Doc',
    tier: 'medium',
    prompts: ['kb.curate_document'],
    configSections: ['intake_defense'],
  },
  reader_image: {
    label: 'Reader: Image',
    tier: 'medium',
    prompts: ['kb.curate_image'],
    configSections: ['intake_defense'],
  },
  reader_sheet: {
    label: 'Reader: Sheet',
    tier: 'medium',
    prompts: ['kb.curate_data'],
    configSections: ['intake_defense'],
  },
  reader_code: {
    label: 'Reader: Code',
    tier: 'medium',
    prompts: ['kb.curate_code'],
    configSections: ['intake_defense'],
  },
  dedup_judge: {
    label: 'Dedup Judge',
    tier: 'small',
    prompts: ['dedup.llm_judge'],
    configSections: ['dedup_settings'],
  },
  synthesis: {
    label: 'Synthesis',
    tier: 'medium',
    prompts: [],
    configSections: ['synthesis_timing', 'synthesis_quality_gates', 'resonance_specificity', 'cluster_selection', 'node_lifecycle', 'weight_dynamics'],
  },
  proxy: {
    label: 'Proxy',
    tier: 'small',
    prompts: [],
    configSections: ['knowledge_proxy'],
  },
  ground_rules: {
    label: 'Ground Rules',
    tier: 'small',
    prompts: ['kb.synthesizability_check'],
    configSections: ['ground_rules'],
  },
  population_control: {
    label: 'Population Control',
    tier: 'medium',
    prompts: ['quality.comprehensive_consultant'],
    configSections: ['population_control', 'consultant_pipeline'],
  },
  embedding: {
    label: 'Embedding',
    tier: 'dedicated',
    prompts: [],
    configSections: [],
  },
};

/**
 * Super-groups — top-level pipeline stage grouping used across Config, Models, and Prompts pages.
 * Each group contains the config categories, subsystem keys, and prompt categories that belong to it.
 */
export const SUPER_GROUPS = [
  {
    id: 'birthing',
    title: 'Birthing',
    description: 'Creating new nodes — pair selection, voicing, and pre-birth quality gates',
    configCategories: ['synthesisBand', 'outputShape', 'qualityGates'],
    subsystems: ['voice', 'synthesis', 'dedup_judge', 'ground_rules', 'keyword', 'elite_mapping', 'breakthrough_check'],
    promptCategories: ['core', 'dedup', 'quality', 'keyword', 'domain'],
  },
  {
    id: 'populationControl',
    title: 'Population Control',
    description: 'Managing existing nodes — post-birth culling, weight/salience dynamics, and lifecycle',
    configCategories: ['cullPipeline', 'nodeEvolution'],
    subsystems: ['autorating', 'population_control'],
    promptCategories: [],
  },
  {
    id: 'enrichment',
    title: 'Enrichment',
    description: 'Adding value — autonomous cycles, verification, elite promotion, and knowledge delivery',
    configCategories: ['autonomousCycles', 'verificationElite', 'knowledgeDelivery'],
    subsystems: [
      'research', 'spec_extraction', 'spec_review', 'evm_codegen', 'evm_triage', 'evm_analysis', 'evm_research',
      'evm_structural', 'evm_expert', 'evm_guidance', 'api_verification', 'lab_routing',
      'compress', 'context', 'proxy',
      'reader_text', 'reader_pdf', 'reader_doc', 'reader_image', 'reader_sheet', 'reader_code',
    ],
    promptCategories: ['evm', 'knowledge', 'context', 'kb', 'project'],
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    description: 'Cross-cutting settings — model parameters, word lists, chat, and docs',
    configCategories: ['modelParameters', 'wordListsPatterns'],
    subsystems: ['chat', 'docs', 'config_tune', 'tuning_judge', 'embedding'],
    promptCategories: ['system', 'chat', 'docs', 'autotune', 'config'],
  },
  {
    id: 'labs',
    title: 'Labs',
    description: 'Lab server LLM assignments — primary model for codegen, consultant for evaluation',
    configCategories: [],
    subsystems: [],  // populated dynamically from lab:* subsystems in the DB
    promptCategories: [],
    dynamic: true,   // flag for Models page to inject dynamic lab subsystems here
  },
];

/** Lookup: subsystem key -> super-group id */
export const SUBSYSTEM_TO_GROUP = {};
for (const group of SUPER_GROUPS) {
  for (const sub of group.subsystems) {
    SUBSYSTEM_TO_GROUP[sub] = group.id;
  }
}

/** Lookup: config category id -> super-group id */
export const CONFIG_CATEGORY_TO_GROUP = {};
for (const group of SUPER_GROUPS) {
  for (const cat of group.configCategories) {
    CONFIG_CATEGORY_TO_GROUP[cat] = group.id;
  }
}

/** Lookup: prompt category -> super-group id */
export const PROMPT_CATEGORY_TO_GROUP = {};
for (const group of SUPER_GROUPS) {
  for (const cat of group.promptCategories) {
    PROMPT_CATEGORY_TO_GROUP[cat] = group.id;
  }
}

/**
 * Reverse lookups — built from SUBSYSTEM_MAP.
 */

// prompt_id -> subsystem names that use it
export const PROMPT_TO_SUBSYSTEMS = {};
for (const [sub, info] of Object.entries(SUBSYSTEM_MAP)) {
  for (const pid of info.prompts) {
    if (!PROMPT_TO_SUBSYSTEMS[pid]) PROMPT_TO_SUBSYSTEMS[pid] = [];
    PROMPT_TO_SUBSYSTEMS[pid].push(sub);
  }
}

// config section_id -> subsystem names that relate to it
export const CONFIG_TO_SUBSYSTEMS = {};
for (const [sub, info] of Object.entries(SUBSYSTEM_MAP)) {
  for (const sid of info.configSections) {
    if (!CONFIG_TO_SUBSYSTEMS[sid]) CONFIG_TO_SUBSYSTEMS[sid] = [];
    CONFIG_TO_SUBSYSTEMS[sid].push(sub);
  }
}

