/**
 * @module config/types
 *
 * Master configuration type definition for the Podbit/Resonance system.
 * All runtime-configurable parameters are declared here. The actual defaults
 * live in {@link ./defaults.ts} and runtime mutations go through {@link ./loader.ts}.
 */

/**
 * Complete configuration object for the Resonance system.
 *
 * Sections fall into two categories:
 * - **Infrastructure** (NON_TUNABLE): `database`, `api`, `services`, `server`, `gui`,
 *   `orchestrator`, `managedServices`, `externalServices`, `partitionServer`, `avatars`,
 *   `feedback`, `tokenLimits` — not persisted by the config override system.
 * - **Tunable**: everything else — persisted to the `settings` table and editable
 *   via the GUI or `podbit.config(action: "apply")`.
 */
export interface PodbitConfig {
  /** SQLite database file path. */
  database: { path: string };
  /** API keys for OpenAI and Anthropic (read from env or DB). */
  api: { openai: string | undefined; anthropic: string | undefined };
  /** External service connection settings (embeddings server, LLM endpoint). */
  services: {
    embeddings: { endpoint: string | null; model: string; timeout: number };
    llm: { endpoint: string | null; models: string[]; timeout: number };
  };
  /** Orchestrator process manager settings. */
  orchestrator: {
    port: number;
    heartbeatIntervalMs: number;
    autoRestartEnabled: boolean;
    startupGracePeriodMs: number;
  };
  /** OpenAI-compatible proxy that enriches requests with knowledge graph context. */
  proxy: {
    port: number;
    enabled: boolean;
    modelProfile: 'small' | 'medium' | 'large' | 'xl';
    knowledgeReserve: number;
    knowledgeMinReserve: number;
  };
  /** Services spawned and managed by the orchestrator (e.g., proxy, MCP). */
  managedServices: Record<string, any>;
  /** External service health-check endpoints. */
  externalServices: Record<string, any>;
  /** Core synthesis engine parameters — salience, weight decay, fitness scoring. */
  engine: {
    threshold: number;
    salienceBoost: number;
    salienceDecay: number;
    salienceCeiling: number;
    salienceFloor: number;
    specificityRatio: number;
    knowledgeWeight: number;
    abstractionWeight: number;
    weightDecay: number;
    parentBoost: number;
    weightCeiling: number;
    cycleDelayMs: number;
    decayEveryNCycles: number;
    junkThreshold: number;
    minSpecificity: number;
    synthesisDecayEnabled: boolean;
    synthesisDecayMultiplier: number;
    synthesisDecayGraceDays: number;
    fitnessEnabled: boolean;
    fitnessWeights: { dissimilarity: number; novelty: number; specificity: number };
    fitnessRange: { min: number; max: number };
  };
  /** @deprecated — alias for engine, assigned after object creation */
  resonance?: PodbitConfig['engine'];
  /** Node weight/salience defaults and promotion thresholds. */
  nodes: {
    defaultWeight: number;
    defaultSalience: number;
    breakthroughWeight: number;
    promoteWeight: number;
    warmThreshold: number;
    warmWeightThreshold: number;
  };
  feedback: {
    usefulWeight: number;
    notUsefulWeight: number;
    harmfulWeight: number;
    weightFloor: number;
  };
  /** Specificity scoring weights — how much numbers, tech terms, etc. contribute to a node's specificity score. */
  specificity: {
    numberWeight: number;
    techTermWeight: number;
    concreteNounWeight: number;
    unitWeight: number;
    unitPattern: string;
    maxLearnedTermsPerDomain: number;
    technicalTerms: Record<string, string[]>;
  };
  /** Document generation retry limits. */
  docs: { maxAttempts: number };
  /** Voice subsystem config (currently empty — reserved for future use). */
  voice: Record<string, never>;
  /** Deduplication thresholds for embedding similarity, word overlap, and LLM judge. */
  dedup: {
    embeddingSimilarityThreshold: number;
    wordOverlapThreshold: number;
    maxNodesPerDomain: number;
    supersedesThreshold: number;
    minWordLength: number;
    llmJudgeEnabled: boolean;
    llmJudgeDoubtFloor: number;
    llmJudgeHardCeiling: number;
    attractorThreshold: number;
    attractorWeightDecay: number;
  };
  /** Context engine — per-turn knowledge delivery for smaller LLMs, with topic tracking, feedback loops, and cross-session learning. */
  contextEngine: {
    totalBudget: number;
    allocation: { knowledge: number; history: number; systemPrompt: number; response: number };
    maxKnowledgeNodes: number;
    minRelevanceScore: number;
    relevanceWeights: { embedding: number; topicMatch: number; nodeWeight: number; recency: number };
    sessionTTLMs: number;
    maxSessionHistory: number;
    compressionTier: string;
    compressionThreshold: number;
    dynamicBudget: {
      enabled: boolean;
      depthCeiling: number;
      newProfile: { knowledge: number; history: number; systemPrompt: number; response: number };
      deepProfile: { knowledge: number; history: number; systemPrompt: number; response: number };
    };
    feedback: {
      enabled: boolean;
      usageThreshold: number;
      weightBoost: number;
      maxBoostPerTurn: number;
    };
    topicClustering: {
      enabled: boolean;
      threshold: number;
      maxTopicsToEmbed: number;
      clusterWeight: number;
    };
    crossSession: {
      enabled: boolean;
      topicWeightThreshold: number;
      maxTopicsToPersist: number;
      emaRetain: number;
      emaIncoming: number;
      dampeningNew: number;
      boostExisting: number;
      maxInsightsToLoad: number;
      maxNodeUsageToLoad: number;
      nodeUsageMinThreshold: number;
    };
    modelProfiles: Record<string, {
      label: string;
      contextWindow: number;
      budgetMultiplier: number;
      preferCompressed: boolean;
      maxKnowledgeNodes: number;
      historyTurns: number;
    }>;
    sessionCleanupIntervalMs: number;
    stopWords: string[];
    dedupInSelectionThreshold: number;
    topicDecayAgeMs: number;
    topicDecayFactor: number;
    topicMinWeight: number;
    recencyDays: number;
    topicBoosts: {
      existingKeyword: number;
      existingPhrase: number;
      newPhrase: number;
    };
    qualityMetricWeights: {
      knowledgeUtilization: number;
      responseGrounding: number;
      topicCoverage: number;
      budgetEfficiency: number;
    };
    intentBlendMax: number;
    intentMinConfidence: number;
    intentPatterns: {
      retrieval: string[];
      action: string[];
      diagnosis: string[];
      exploration: string[];
    };
    intentWeightProfiles: {
      retrieval: { embedding: number; topicMatch: number; nodeWeight: number; recency: number };
      action: { embedding: number; topicMatch: number; nodeWeight: number; recency: number };
      diagnosis: { embedding: number; topicMatch: number; nodeWeight: number; recency: number };
      exploration: { embedding: number; topicMatch: number; nodeWeight: number; recency: number };
    };
    intentScoring: {
      scorePerMatch: number;
      maxConfidenceScore: number;
    };
  };
  /** Voicing output constraints — word limits, novelty requirements, telegraphic compression, entropy-aware filtering. */
  voicing: {
    maxInsightWords: number;
    maxOutputWords: number;
    truncatedWords: number;
    minNovelWords: number;
    minNovelWordLength: number;
    rejectUnclosedParens: number;
    rejectNoSentenceEnding: number;
    telegraphicEnabled: boolean;
    telegraphicAggressiveness: 'light' | 'medium' | 'aggressive';
    // Entropy-aware compression
    entropyEnabled: boolean;
    entropyWeights: {
      entity: number;
      number: number;
      properNoun: number;
      acronym: number;
      rarity: number;
    };
    entropyThresholds: {
      light: number;
      medium: number;
      aggressive: number;
    };
    entropyRarityMinLength: number;
    responseCleanupPatterns: string[];
    tierOverrides: Record<string, {
      minNovelWords?: number;
    }>;
  };
  /** Telegraphic compression rules — phrase substitutions, word removals by aggressiveness level. */
  telegraphic: {
    phrases: [string, string][];
    words: Record<string, string>;
    removeAlways: string[];
    removeMedium: string[];
    removeAggressive: string[];
    preserve: string[];
  };
  /** Node content validation — detects generic/filler language in proposed nodes. */
  nodeValidation: {
    genericStartPatterns: string[];
    genericFillerPatterns: string[];
    genericRatioThreshold: number;
    genericMinWordCount: number;
  };
  /** Prompt injection detection — patterns for identifying adversarial input in node proposals. */
  injection: {
    instructionOverridePatterns: string[];
    roleOverridePatterns: string[];
    promptStructurePatterns: string[];
    templateInjectionPatterns: string[];
    structureBreakingPatterns: string[];
    systemPromptPatterns: string[];
    scoreThreshold: number;
    autoRejectTypes: string[];
  };
  /** Intake defense — prevents domain concentration from runaway autonomous cycles. */
  intakeDefense: {
    enabled: boolean;
    windowHours: number;
    concentrationThreshold: number;
    throttleThreshold: number;
    minProposalsForCheck: number;
  };
  /** Synthesis engine — candidate selection, niching, migration, domain-directed search. */
  synthesisEngine: {
    enabled: boolean;
    subsetOverlapThreshold: number;
    similarityCeiling: number;
    minVocabulary: number;
    minCombinedSpecificity: number;
    candidateLimit: number;
    directedSearchTopK: number;
    nichingEnabled: boolean;
    nichingLookbackCycles: number;
    nichingMinShare: number;
    migrationEnabled: boolean;
    migrationRate: number;
    migrationTopK: number;
    domainDirectedEnabled: boolean;
    domainDirectedCycleRate: number;
    domainDirectedLookbackDays: number;
  };
  /** Consultant pipeline mode — single LLM call replaces multiple heuristic quality gates. */
  consultantPipeline: {
    threshold: number;
    compressionLevel: number;
    weights: {
      coherence: number;
      grounding: number;
      novelty: number;
      derivation: number;
      forcedAnalogy: number;
      incrementalValue: number;
    };
    graphContextTopN: number;
  };
  /** Cluster-based parent selection — simulated annealing for coherent multi-parent groups. */
  clusterSelection: {
    enabled: boolean;
    targetSize: number;
    candidatePoolSize: number;
    initialTemp: number;
    coolingRate: number;
    maxIterations: number;
    coherenceWeight: number;
    diversityWeight: number;
    weightBonusScale: number;
    sizePenalty: number;
    minSimilarity: number;
    maxSimilarity: number;
    clustersPerCycle: number;
    clusterCycleRate: number;
  };
  /** Hallucination detection — novelty ratio, fabricated numbers, verbose output, cross-domain number checks. */
  hallucination: {
    novelRatioThreshold: number;
    minOutputWordsForNoveltyCheck: number;
    maxVerboseWords: number;
    minRedFlags: number;
    largeNumberThreshold: number;
    futureYearPattern: string;
    multiplierPattern: string;
    financialClaimPattern: string;
    financialTerms: string;
    numberPattern: string;
    roundNumberPattern: string;
    novelWordMinLength: number;
    synthesisVocabulary: string[];
    fabricatedNumberCheck: boolean;
    crossDomainNumberCheck: boolean;
    crossDomainTrivialPattern: string;
    tierOverrides: Record<string, {
      fabricatedNumberCheck?: boolean;
      largeNumberThreshold?: number;
      maxVerboseWords?: number;
      minRedFlags?: number;
      novelRatioThreshold?: number;
    }>;
  };
  /** Ground rules gate — LLM-based pre-synthesis check that filters non-synthesizable nodes. */
  groundRules: {
    enabled: boolean;
    /** How many unclassified nodes to process per background batch. */
    batchSize: number;
    /** Interval between background classification batches (ms). 0 = disabled. */
    intervalMs: number;
  };
  /** Tension detection — finds contradictions between node pairs using negation patterns and similarity. */
  tensions: {
    patterns: [string, string][];
    negationBoost: number;
    minSimilarity: number;
    candidateLimit: number;
  };
  /** Breakthrough validation — composite scoring (synthesis, novelty, testability, tension resolution) and promotion thresholds. */
  validation: {
    compositeWeights: {
      synthesis: number;
      novelty: number;
      testability: number;
      tensionResolution: number;
    };
    breakthroughThresholds: {
      minSynthesis: number;
      minNovelty: number;
      minTestability: number;
      minTensionResolution: number;
    };
    generativityBoost: {
      parent: number;
      grandparent: number;
    };
    noveltyGateEnabled: boolean;
    evmGateEnabled: boolean;
  };
  /** In-memory embedding cache — LRU cache for vector similarity lookups. */
  embeddingCache: {
    maxSize: number;
    defaultWarmupLimit: number;
  };
  /** Token limits -- reasoning model detection for logging. Max tokens come from the model registry only. */
  tokenLimits: {
    reasoningModelPatterns: string[];
  };
  /** Per-subsystem temperature overrides (heuristic pipeline). */
  subsystemTemperatures: Record<string, number>;
  /** Per-subsystem repeat penalty overrides (heuristic pipeline). */
  subsystemRepeatPenalties: Record<string, number>;
  /** Per-subsystem top-p sampling overrides (heuristic pipeline). */
  subsystemTopP: Record<string, number>;
  /** Per-subsystem min-p sampling overrides (heuristic pipeline). */
  subsystemMinP: Record<string, number>;
  /** Per-subsystem top-k sampling overrides (heuristic pipeline). */
  subsystemTopK: Record<string, number>;
  /** Per-subsystem temperature overrides (consultant pipeline). */
  consultantTemperatures: Record<string, number>;
  /** Per-subsystem repeat penalty overrides (consultant pipeline). */
  consultantRepeatPenalties: Record<string, number>;
  /** Per-subsystem top-p sampling overrides (consultant pipeline). */
  consultantTopP: Record<string, number>;
  /** Per-subsystem min-p sampling overrides (consultant pipeline). */
  consultantMinP: Record<string, number>;
  /** Per-subsystem top-k sampling overrides (consultant pipeline). */
  consultantTopK: Record<string, number>;
  /** Autonomous cycle configuration — intervals, thresholds, and per-cycle settings for validation, questions, tensions, research, autorating, EVM, and voicing. */
  autonomousCycles: {
    validation: {
      enabled: boolean;
      intervalMs: number;
      minWeightThreshold: number;
      minCompositeForPromotion: number;
    };
    questions: {
      enabled: boolean;
      intervalMs: number;
      batchSize: number;
      candidatePoolSize: number;
      contextMinSimilarity: number;
      contextTopN: number;
      weightPenalty: number;
      weightFloor: number;
    };
    tensions: {
      enabled: boolean;
      intervalMs: number;
      maxQuestionsPerCycle: number;
      maxPendingQuestions: number;
    };
    research: {
      enabled: boolean;
      intervalMs: number;
      maxSeedsPerCycle: number;
      minDomainNodes: number;
      maxDomainNodes: number;
      domainSelectionLimit: number;
      knowledgeContextLimit: number;
      openQuestionsLimit: number;
      seedMinLength: number;
      seedMaxLength: number;
      relevanceThreshold: number;
      /** Min cosine similarity of domain centroid to project purpose. Only catches blatant cross-project contamination. */
      domainRelevanceThreshold: number;
      exhaustionStreak: number;
      exhaustionCooldownMs: number;
    };
    autorating: {
      enabled: boolean;
      intervalMs: number;
      gracePeriodMinutes: number;
      inlineEnabled: boolean;
      batchSize: number;
    };
    evm: {
      enabled: boolean;
      intervalMs: number;
      minWeightThreshold: number;
      maxRetriesPerNode: number;
      retryBackoffMs: number;
      triageEnabled: boolean;
      minTriageScore: number;
      webResearchEnabled: boolean;
      resynthesisEnabled: boolean;
      autoApproveThreshold: number;
      autoApproveVerdicts: string[];
    };
    voicing: {
      enabled: boolean;
      intervalMs: number;
      minWeightThreshold: number;
      modes: string[];
    };
  };
  /** Named magic numbers — thresholds that don't fit neatly into other sections. */
  magicNumbers: {
    junkFilterLimit: number;
    domainInferenceThreshold: number;
    salienceRescueDays: number;
  };
  /** Knowledge Base folder ingestion — concurrency, chunking, watcher, retry settings. */
  knowledgeBase: {
    enabled: boolean;
    maxConcurrency: number;
    maxChunkSize: number;
    watcherPollInterval: number;
    awaitWriteFinish: number;
    autoStartWatchers: boolean;
    skipLargeFiles: number;
    minChunkLength: number;
    defaultExcludePatterns: string[];
    /** Max tokens for KB curation/decomposition LLM calls. 0 = use model registry default. */
    curationMaxTokens: number;
    /** Max claims from Stage 1 passed to Stage 2 filter. Prevents LLM overload on dense papers. */
    maxClaimsPerFile: number;
    /** Max nodes created per file by the decomposition pipeline (hard cap). */
    maxNodesPerFile: number;
    retryMaxAttempts: number;
    retryDelayMs: number;
    networkFolderRetryIntervalMs: number;
    postIngestionSummary: boolean;
  };
  /**
   * Verification — graph consequences of lab experiment results.
   *
   * Execution (sandbox, codegen, triage) is handled by lab servers.
   * This section controls how Podbit responds to lab verdicts:
   * weight changes, auto-archiving, salience caps, post-rejection analysis,
   * claim decomposition, and API reconnaissance.
   */
  labVerify: {
    enabled: boolean;
    /** Weight boost multiplied by confidence when lab supports a claim */
    weightBoostOnVerified: number;
    /** Weight penalty multiplied by confidence when lab refutes a claim */
    weightPenaltyOnFailed: number;
    weightPenaltyOnError: number;
    /** Auto-archive nodes that lab disproves with sufficient confidence */
    autoArchiveOnDisproved: boolean;
    /** Minimum confidence to auto-archive a disproved node (0–1) */
    autoArchiveConfidence: number;
    /** Cap effective salience when a node has failed verification */
    failedSalienceCap: number;
    /** Auto-submit new synthesis nodes to the lab */
    autoVerifyEnabled: boolean;
    /** Minimum node weight for auto-submission */
    minNodeWeightForAuto: number;
    /** Default precision hint passed to lab via experiment spec */
    numericalPrecision: number;
    /** Post-rejection analysis — LLM investigates why a claim was refuted */
    postRejection: {
      enabled: boolean;
      analysisTimeoutMs: number;
      proposalEnabled: boolean;
      maxAnalysisCodeLength: number;
    };
    /** Claim decomposition — break a node into testable facts + open questions */
    decompose: {
      maxFacts: number;
      maxQuestions: number;
      weightDowngrade: number;
      factInitialWeight: number;
      questionInitialWeight: number;
    };
    /** Spec review — adversarial falsifiability check on extracted specs */
    specReview: {
      /** Enable the falsifiability review LLM call (requires spec_review subsystem assignment) */
      enabled: boolean;
      /** Minimum confidence from the reviewer to reject a spec as rigged (0–1) */
      minConfidence: number;
    };
    /** Auto-retest - re-enqueue nodes when lab suggests a stronger test */
    autoRetest: {
      /** Enable auto-retest on low-confidence verdicts with suggestions */
      enabled: boolean;
      /** Max number of retests per node (prevents infinite loops) */
      maxRetests: number;
      /** Re-enqueue when confidence is below this threshold (0-1) */
      confidenceThreshold: number;
    };
    /** API reconnaissance — pre/post-lab fact checking and enrichment */
    apiVerification: {
      enabled: boolean;
      maxApisPerNode: number;
      enrichmentEnabled: boolean;
      enrichmentMaxNodesPerCall: number;
      enrichmentMinConfidence: number;
      enrichmentInitialWeight: number;
      enrichmentMode: 'inline' | 'children';
      enrichmentMaxContentWords: number;
      correctionPenalty: number;
      validationBoost: number;
      refutationPenalty: number;
      minCorrectionConfidence: number;
    };
  };
  /** Transient partition system — temporary imports with quarantine, cycle limits, and auto-cleanup. */
  transient: {
    enabled: boolean;
    maxTransientPartitions: number;
    maxNodesPerImport: number;
    maxTransientNodeRatio: number;
    minCycles: number;
    maxCycles: number;
    exhaustionThreshold: number;
    quarantine: {
      autoApproveKnownSigners: boolean;
      scanFailThreshold: number;
      sandboxCycles: number;
      sandboxFailThreshold: number;
    };
  };
  /** Node lifecycle management — barren detection, composting, nascent stillbirth thresholds. */
  lifecycle: {
    enabled: boolean;
    barrenThreshold: number;
    compostAfter: number;
    nascent: {
      maxCycles: number;
      stillbirthMinAutorating: number;
    };
    composting: {
      preserveBreakthroughs: boolean;
      summaryMaxLength: number;
    };
    sweepInterval: number;
  };
  /** Population control cycle — post-birth quality evaluation via single LLM call that demotes or archives weak nodes. */
  populationControl: {
    enabled: boolean;
    intervalMs: number;
    gracePeriodHours: number;
    batchSize: number;
    threshold: number;
    archiveThreshold: number;
    demoteWeight: number;
    boostWeight: number;
    /** Embedding-only dedup sweep — runs each tick to find and archive duplicate nodes without LLM cost. */
    dedupSweep: {
      enabled: boolean;
      /** Max age in days of nodes to consider for dedup sweep */
      maxAgeDays: number;
      /** Max nodes to compare per domain per sweep */
      maxNodesPerDomain: number;
      /** Cosine similarity threshold for duplicate detection */
      embeddingThreshold: number;
      /** Word overlap threshold for duplicate detection */
      wordOverlapThreshold: number;
    };
  };
  /** Minitruth — LLM reviewer in the birth pipeline (accept/rework/reject). */
  minitruth: {
    enabled: boolean;
    maxReworkAttempts: number;
  };
  /** Embedding evaluation layer — instruction-aware embedding checks for population control pre-screening. */
  embeddingEval: {
    enabled: boolean;
    /** Shadow mode: run checks and log results but don't gate decisions. Must be true before going live. */
    shadowMode: boolean;
    /** Max characters to embed per text (truncation limit). */
    maxChars: number;
    /** Mode 8: Parent-child drift detection — cosine similarity threshold for FAIL. */
    driftFailThreshold: number;
    /** Mode 1: Lexical bridge — max similarity to one parent indicating structural capture. */
    lexicalBridgeHighThreshold: number;
    /** Mode 1: Lexical bridge — min similarity to the other parent; below this = lexical bridge. */
    lexicalBridgeLowThreshold: number;
    /** Mode 4: Number recycling — cross-domain quantitative claim similarity threshold. */
    numberRecyclingThreshold: number;
    /** Mode 7: Toxic parent — mean child similarity threshold for flagging. */
    toxicParentThreshold: number;
    /** Mode 7: Toxic parent — minimum children across domains to trigger check. */
    toxicParentMinChildren: number;
    /** Mode 7: Toxic parent — minimum distinct domains among children. */
    toxicParentMinDomains: number;
    /** Weight multiplier when all embedding checks PASS. */
    boostMultiplier: number;
    /** Instruction prefix for structural claim representation (mode 8). */
    instructStructuralClaim: string;
    /** Instruction prefix for mechanical process representation (mode 1). */
    instructMechanicalProcess: string;
    /** Instruction prefix for quantitative claim representation (mode 4). */
    instructQuantitativeClaims: string;
    /** Instruction prefix for domain contribution representation (mode 7). */
    instructDomainContribution: string;
  };
  /** DiceBear avatar generation settings. */
  avatars: {
    enabled: boolean;
    style: string;
  };
  /** Number variable isolation — replaces numeric values with domain-scoped placeholders to prevent cross-domain contamination. */
  numberVariables: {
    enabled: boolean;
    contextWindowSize: number;
    maxVarsPerNode: number;
  };
  /** Consultant review — confidence thresholds per subsystem for triggering human review of LLM outputs. */
  consultantReview: {
    enabled: boolean;
    thresholds: {
      spec_extraction: number;
      voice: number;
      synthesis: number;
      dedup_judge: number;
      research: number;
      config_tune: number;
      tuning_judge: number;
    };
  };
  /** Elite pool — highest-confidence nodes promoted for cross-domain bridging, dedup, and manifest mapping. */
  elitePool: {
    enabled: boolean;
    promotionThreshold: number;
    maxGeneration: number;
    enableEliteBridging: boolean;
    bridgingPriority: 'cross_domain' | 'highest_confidence' | 'lowest_generation';
    maxBridgingAttemptsPerPair: number;
    logicalApprovalEnabled: boolean;
    logicalApprovalThreshold: number;
    dedup: {
      enabled: boolean;
      semanticThreshold: number;
      checkVariableOverlap: boolean;
      checkParentLineage: boolean;
    };
    manifestMapping: {
      enabled: boolean;
      minRelevanceScore: number;
    };
    eliteWeight: number;
    bridgingRate: number;
  };
  /** Partition server — remote node pool for distributed synthesis across instances. */
  partitionServer: {
    port: number;
    enabled: boolean;
    dbPath: string;
    returnCheckIntervalMs: number;
    minPoolNodes: number;
    staleGraceHours: number;
    staleCheckIntervalMs: number;
  };
  /** HTTP API server settings. */
  server: { port: number; host: string; corsOrigins: string[] };
  /** GUI dev server port. */
  gui: { port: number };
  /** Lab framework — freeze, taint, routing, and experiment orchestration. */
  lab: {
    /** Master toggle: freeze nodes when experiments start (prevents synthesis during verification) */
    freezeOnExperiment: boolean;
    /** Master toggle: taint downstream children when a claim is refuted */
    taintOnRefute: boolean;
    /** BFS depth limit for taint propagation */
    taintMaxDepth: number;
    /** Auto-clear taint after N days */
    taintDecayDays: number;
    /** Port for the math-lab server */
    mathLabPort: number;
    /** Interval for health-checking registered labs (ms) */
    healthCheckIntervalMs: number;
    /** Enable LLM-based lab routing when multiple labs match a spec type */
    routingEnabled: boolean;
    /** Default lab ID to use when routing is disabled or no routing decision is needed */
    defaultLabId: string | null;
    /** Timeout for freeze — unfreeze nodes after this many ms if lab doesn't respond */
    freezeTimeoutMs: number;
    /** Max concurrent verification jobs the queue worker will submit in parallel */
    maxConcurrentVerifications: number;
    /** Lab chaining — auto-forward results to a critique lab for methodology review */
    chaining: {
      /** Master toggle for lab chaining */
      enabled: boolean;
      /** Max chain depth (original=0, critique=1, retest=2, final_critique=3) */
      maxChainDepth: number;
      /** Which verdicts trigger a critique chain (e.g., ['supported', 'refuted']) */
      critiqueOnVerdicts: string[];
      /** Defer weight/taint/archive consequences until critique confirms or corrects */
      deferConsequences: boolean;
    };
  };
}
