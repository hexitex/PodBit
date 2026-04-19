/**
 * Shared constants and helper functions for Config page components.
 */

export const SYSTEM_PROFILE_AXES = [
  { key: 'selectivity', label: 'Selectivity', max: 1 },
  { key: 'reach', label: 'Reach', max: 1 },
  { key: 'tempo', label: 'Tempo', max: 1 },
  { key: 'turnover', label: 'Turnover', max: 1 },
  { key: 'amplification', label: 'Amplification', max: 1 },
  { key: 'verification', label: 'Verification', max: 1 },
  { key: 'outputDiscipline', label: 'Output Discipline', max: 1 },
];

/** Normalize a value to 0-1 within a known parameter range */
export const norm = (val, min, max) => Math.max(0, Math.min(1, (val - min) / (max - min)));

/** Safely read a nested value from an object using a path array */
export function getNestedValue(obj, path) {
  let current = obj;
  for (const key of path) {
    current = current?.[key];
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Declarative axis → parameter metadata.
 * Each term defines one parameter's contribution to a radar axis.
 *
 * type: 'continuous' = norm(val, min, max) * weight (or inverted)
 *       'boolean'    = (val ? 1 : 0) * weight
 *       'absValue'   = norm(Math.abs(val), min, max) * weight
 */
export const AXIS_PARAM_TERMS = {
  // --- Selectivity: how strict the quality filtering pipeline is ---
  selectivity: [
    { configPath: ['resonance', 'minSpecificity'], min: 0.0, max: 5.0, weight: 0.10, inverted: false, type: 'continuous', defaultValue: 1.0, label: 'Min Specificity', sectionId: 'resonance_specificity', tier: 'basic' },
    { configPath: ['resonance', 'specificityRatio'], min: 0.0, max: 1.0, weight: 0.08, inverted: false, type: 'continuous', defaultValue: 0.3, label: 'Specificity Ratio', sectionId: 'resonance_specificity', tier: 'intermediate' },
    { configPath: ['voicing', 'minNovelWords'], min: 0, max: 15, weight: 0.08, inverted: false, type: 'continuous', defaultValue: 3, label: 'Min Novel Words', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['hallucination', 'minRedFlags'], min: 1, max: 5, weight: 0.08, inverted: true, type: 'continuous', defaultValue: 2, label: 'Min Red Flags', sectionId: 'hallucination_detection', tier: 'intermediate' },
    { configPath: ['hallucination', 'maxVerboseWords'], min: 10, max: 200, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 50, label: 'Max Verbose Words', sectionId: 'hallucination_detection', tier: 'intermediate' },
    { configPath: ['hallucination', 'novelRatioThreshold'], min: 0.1, max: 1.0, weight: 0.06, inverted: false, type: 'continuous', defaultValue: 0.5, label: 'Novel Ratio Threshold', sectionId: 'hallucination_detection', tier: 'intermediate' },
    { configPath: ['dedup', 'embeddingSimilarityThreshold'], min: 0.5, max: 0.99, weight: 0.07, inverted: false, type: 'continuous', defaultValue: 0.82, label: 'Embedding Similarity Threshold', sectionId: 'dedup_settings', tier: 'basic' },
    { configPath: ['dedup', 'wordOverlapThreshold'], min: 0.3, max: 1.0, weight: 0.05, inverted: false, type: 'continuous', defaultValue: 0.70, label: 'Word Overlap Threshold', sectionId: 'dedup_settings', tier: 'intermediate' },
    { configPath: ['resonance', 'synthesisJunkThreshold'], min: 0.5, max: 1.0, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 0.75, label: 'Junk Threshold', sectionId: 'synthesis_quality_gates', tier: 'basic' },
    { configPath: ['synthesisEngine', 'subsetOverlapThreshold'], min: 0.5, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.85, label: 'Subset Overlap Threshold', sectionId: 'synthesis_validation', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'minCombinedSpecificity'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.10, label: 'Min Combined Specificity', sectionId: 'synthesis_validation', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'minVocabulary'], min: 1, max: 10, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 3, label: 'Min Vocabulary', sectionId: 'synthesis_validation', tier: 'intermediate' },
    { configPath: ['dedup', 'llmJudgeEnabled'], min: 0, max: 1, weight: 0.02, inverted: false, type: 'boolean', defaultValue: 1, label: 'LLM Judge Enabled', sectionId: 'dedup_settings', tier: 'intermediate' },
    { configPath: ['consultantReview', 'enabled'], min: 0, max: 1, weight: 0.02, inverted: false, type: 'boolean', defaultValue: 0, label: 'Consultant Review', sectionId: 'consultant_review', tier: 'intermediate' },
    { configPath: ['groundRules', 'enabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 1, label: 'Ground Rules Gate', sectionId: 'ground_rules', tier: 'intermediate' },
    { configPath: ['minitruth', 'enabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Minitruth', sectionId: 'minitruth', tier: 'intermediate' },
    { configPath: ['consultantPipeline', 'threshold'], min: 1, max: 10, weight: 0.05, inverted: false, type: 'continuous', defaultValue: 6, label: 'Consultant Threshold', sectionId: 'consultant_pipeline', tier: 'basic' },
    { configPath: ['populationControl', 'threshold'], min: 1, max: 9, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 5.0, label: 'Population Pass Threshold', sectionId: 'population_control', tier: 'basic' },
    { configPath: ['populationControl', 'archiveThreshold'], min: 0, max: 5, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 2.0, label: 'Population Archive Threshold', sectionId: 'population_control', tier: 'intermediate' },
    { configPath: ['embeddingEval', 'enabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 1, label: 'Embedding Eval', sectionId: 'embedding_eval', tier: 'intermediate' },
    { configPath: ['embeddingEval', 'driftFailThreshold'], min: 0.70, max: 0.99, weight: 0.02, inverted: true, type: 'continuous', defaultValue: 0.80, label: 'Drift Fail Threshold', sectionId: 'embedding_eval', tier: 'advanced' },
  ],

  // --- Reach: how far the synthesis engine explores for node pairs ---
  reach: [
    { configPath: ['resonance', 'threshold'], min: 0.1, max: 0.9, weight: 0.15, inverted: true, type: 'continuous', defaultValue: 0.5, label: 'Resonance Threshold', sectionId: 'resonance_specificity', tier: 'basic' },
    { configPath: ['synthesisEngine', 'similarityCeiling'], min: 0.5, max: 1.0, weight: 0.10, inverted: false, type: 'continuous', defaultValue: 0.85, label: 'Similarity Ceiling', sectionId: 'synthesis_validation', tier: 'basic' },
    { configPath: ['synthesisEngine', 'candidateLimit'], min: 10, max: 500, weight: 0.08, inverted: false, type: 'continuous', defaultValue: 100, label: 'Candidate Limit', sectionId: 'synthesis_validation', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'directedSearchTopK'], min: 1, max: 20, weight: 0.08, inverted: false, type: 'continuous', defaultValue: 5, label: 'Directed Search Top K', sectionId: 'synthesis_validation', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'nichingEnabled'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 1, label: 'Niching Enabled', sectionId: 'ga_features', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'domainDirectedEnabled'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 0, label: 'Domain-Directed Enabled', sectionId: 'domain_directed', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'migrationEnabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 0, label: 'Migration Enabled', sectionId: 'ga_features', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'migrationRate'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Migration Rate', sectionId: 'ga_features', tier: 'advanced' },
    { configPath: ['clusterSelection', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 0, label: 'Cluster Selection', sectionId: 'cluster_selection', tier: 'intermediate' },
    { configPath: ['clusterSelection', 'diversityWeight'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.2, label: 'Diversity Weight', sectionId: 'cluster_selection', tier: 'advanced' },
    { configPath: ['clusterSelection', 'clusterCycleRate'], min: 0.0, max: 1.0, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Cluster Cycle Rate', sectionId: 'cluster_selection', tier: 'advanced' },
    { configPath: ['elitePool', 'enableEliteBridging'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Elite Bridging', sectionId: 'elite_pool', tier: 'intermediate' },
    { configPath: ['elitePool', 'bridgingRate'], min: 0.0, max: 1.0, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 0.15, label: 'Bridging Rate', sectionId: 'elite_pool', tier: 'advanced' },
    { configPath: ['resonance', 'fitnessWeights', 'dissimilarity'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.2, label: 'Fitness: Dissimilarity', sectionId: 'fitness_modifier', tier: 'advanced' },
    { configPath: ['resonance', 'fitnessEnabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 1, label: 'Fitness Modifier Enabled', sectionId: 'fitness_modifier', tier: 'intermediate' },
  ],

  // --- Tempo: how fast the system runs synthesis and autonomous cycles ---
  tempo: [
    { configPath: ['resonance', 'cycleDelayMs'], min: 100, max: 300000, weight: 0.15, inverted: true, type: 'continuous', defaultValue: 30000, label: 'Cycle Delay', sectionId: 'synthesis_timing', tier: 'basic' },
    { configPath: ['resonance', 'decayEveryNCycles'], min: 1, max: 100, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 10, label: 'Decay Every N Cycles', sectionId: 'synthesis_timing', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'research', 'enabled'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 1, label: 'Research Cycle', sectionId: 'cycle_research', tier: 'basic' },
    { configPath: ['autonomousCycles', 'research', 'intervalMs'], min: 5000, max: 300000, weight: 0.05, inverted: true, type: 'continuous', defaultValue: 60000, label: 'Research Interval', sectionId: 'cycle_research', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'questions', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 1, label: 'Questions Cycle', sectionId: 'cycle_questions', tier: 'basic' },
    { configPath: ['autonomousCycles', 'questions', 'intervalMs'], min: 5000, max: 300000, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 60000, label: 'Questions Interval', sectionId: 'cycle_questions', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'tensions', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 1, label: 'Tensions Cycle', sectionId: 'cycle_tensions', tier: 'basic' },
    { configPath: ['autonomousCycles', 'validation', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 1, label: 'Validation Cycle', sectionId: 'cycle_validation', tier: 'basic' },
    { configPath: ['autonomousCycles', 'voicing', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 1, label: 'Voicing Cycle', sectionId: 'cycle_voicing', tier: 'basic' },
    { configPath: ['autonomousCycles', 'autorating', 'enabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Autorating Cycle', sectionId: 'cycle_autorating', tier: 'basic' },
    { configPath: ['autonomousCycles', 'evm', 'enabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 1, label: 'Lab Verification Cycle', sectionId: 'cycle_evm', tier: 'basic' },
    { configPath: ['autonomousCycles', 'evm', 'intervalMs'], min: 5000, max: 300000, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 60000, label: 'Lab Verification Interval', sectionId: 'cycle_evm', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'research', 'maxSeedsPerCycle'], min: 1, max: 20, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 3, label: 'Max Seeds Per Cycle', sectionId: 'cycle_research', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'tensions', 'maxQuestionsPerCycle'], min: 1, max: 10, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 2, label: 'Max Questions Per Cycle', sectionId: 'cycle_tensions', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'validation', 'intervalMs'], min: 5000, max: 300000, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 60000, label: 'Validation Interval', sectionId: 'cycle_validation', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'voicing', 'intervalMs'], min: 10000, max: 300000, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 30000, label: 'Voicing Interval', sectionId: 'cycle_voicing', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'autorating', 'intervalMs'], min: 5000, max: 300000, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 45000, label: 'Autorating Interval', sectionId: 'cycle_autorating', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'tensions', 'intervalMs'], min: 10000, max: 300000, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 45000, label: 'Tensions Interval', sectionId: 'cycle_tensions', tier: 'intermediate' },
    { configPath: ['populationControl', 'intervalMs'], min: 10000, max: 600000, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 120000, label: 'Population Control Interval', sectionId: 'population_control', tier: 'intermediate' },
    { configPath: ['populationControl', 'batchSize'], min: 1, max: 20, weight: 0.02, inverted: false, type: 'continuous', defaultValue: 5, label: 'Population Batch Size', sectionId: 'population_control', tier: 'intermediate' },
  ],

  // --- Turnover: how aggressively old/stale nodes are recycled ---
  turnover: [
    { configPath: ['resonance', 'salienceDecay'], min: 0.9, max: 0.999, weight: 0.12, inverted: true, type: 'continuous', defaultValue: 0.99, label: 'Salience Decay', sectionId: 'temperature_dynamics', tier: 'basic' },
    { configPath: ['resonance', 'weightDecay'], min: 0.9, max: 0.9999, weight: 0.10, inverted: true, type: 'continuous', defaultValue: 0.999, label: 'Weight Decay', sectionId: 'weight_dynamics', tier: 'basic' },
    { configPath: ['synthesisEngine', 'synthesisDecayEnabled'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 1, label: 'Synthesis Decay Enabled', sectionId: 'ga_features', tier: 'intermediate' },
    { configPath: ['synthesisEngine', 'synthesisDecayMultiplier'], min: 0.1, max: 1.0, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 0.5, label: 'Synthesis Decay Multiplier', sectionId: 'ga_features', tier: 'advanced' },
    { configPath: ['synthesisEngine', 'synthesisDecayGraceDays'], min: 1, max: 30, weight: 0.05, inverted: true, type: 'continuous', defaultValue: 3, label: 'Synthesis Decay Grace Days', sectionId: 'ga_features', tier: 'advanced' },
    { configPath: ['lifecycle', 'enabled'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 1, label: 'Lifecycle Enabled', sectionId: 'node_lifecycle', tier: 'intermediate' },
    { configPath: ['lifecycle', 'barrenThreshold'], min: 5, max: 200, weight: 0.07, inverted: true, type: 'continuous', defaultValue: 50, label: 'Barren Threshold', sectionId: 'node_lifecycle', tier: 'intermediate' },
    { configPath: ['lifecycle', 'compostAfter'], min: 10, max: 500, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 100, label: 'Compost After', sectionId: 'node_lifecycle', tier: 'intermediate' },
    { configPath: ['lifecycle', 'nascent', 'maxCycles'], min: 5, max: 100, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 30, label: 'Nascent Max Cycles', sectionId: 'node_lifecycle', tier: 'advanced' },
    { configPath: ['magicNumbers', 'salienceRescueDays'], min: 1, max: 30, weight: 0.05, inverted: false, type: 'continuous', defaultValue: 7, label: 'Salience Rescue Days', sectionId: 'magic_numbers', tier: 'advanced' },
    { configPath: ['resonance', 'salienceFloor'], min: 0.001, max: 0.1, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.01, label: 'Salience Floor', sectionId: 'temperature_dynamics', tier: 'intermediate' },
    { configPath: ['nodes', 'defaultSalience'], min: 0.5, max: 1.5, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 1.0, label: 'Default Salience', sectionId: 'node_defaults', tier: 'basic' },
    { configPath: ['populationControl', 'enabled'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 0, label: 'Population Control', sectionId: 'population_control', tier: 'basic' },
    { configPath: ['populationControl', 'gracePeriodHours'], min: 0.5, max: 48, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 2, label: 'Grace Period (hours)', sectionId: 'population_control', tier: 'intermediate' },
    { configPath: ['populationControl', 'demoteWeight'], min: 0.1, max: 0.9, weight: 0.04, inverted: true, type: 'continuous', defaultValue: 0.5, label: 'Demote Multiplier', sectionId: 'population_control', tier: 'intermediate' },
    { configPath: ['populationControl', 'dedupSweep', 'enabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Dedup Sweep', sectionId: 'dedup_sweep', tier: 'intermediate' },
    { configPath: ['populationControl', 'dedupSweep', 'embeddingThreshold'], min: 0.80, max: 0.98, weight: 0.03, inverted: true, type: 'continuous', defaultValue: 0.90, label: 'Sweep Embedding Threshold', sectionId: 'dedup_sweep', tier: 'advanced' },
    { configPath: ['feedback', 'notUsefulWeight'], min: 0.01, max: 1.0, weight: 0.03, inverted: false, type: 'absValue', defaultValue: -0.1, label: 'Not-Useful Penalty', sectionId: 'feedback_weights', tier: 'intermediate' },
    { configPath: ['feedback', 'harmfulWeight'], min: 0.1, max: 2.0, weight: 0.03, inverted: false, type: 'absValue', defaultValue: -0.3, label: 'Harmful Penalty', sectionId: 'feedback_weights', tier: 'intermediate' },
  ],

  // --- Amplification: how strongly the system boosts high-quality nodes ---
  amplification: [
    { configPath: ['resonance', 'parentBoost'], min: 0.0, max: 0.5, weight: 0.10, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Parent Boost', sectionId: 'weight_dynamics', tier: 'basic' },
    { configPath: ['resonance', 'knowledgeWeight'], min: 1.0, max: 2.0, weight: 0.09, inverted: false, type: 'continuous', defaultValue: 1.2, label: 'Knowledge Weight', sectionId: 'weight_dynamics', tier: 'intermediate' },
    { configPath: ['nodes', 'breakthroughWeight'], min: 1.0, max: 3.0, weight: 0.09, inverted: false, type: 'continuous', defaultValue: 1.5, label: 'Breakthrough Weight', sectionId: 'node_defaults', tier: 'basic' },
    { configPath: ['nodes', 'promoteWeight'], min: 1.0, max: 2.5, weight: 0.07, inverted: false, type: 'continuous', defaultValue: 1.3, label: 'Promote Weight', sectionId: 'node_defaults', tier: 'intermediate' },
    { configPath: ['resonance', 'salienceBoost'], min: 0.01, max: 0.5, weight: 0.08, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Salience Boost', sectionId: 'temperature_dynamics', tier: 'basic' },
    { configPath: ['resonance', 'salienceCeiling'], min: 0.5, max: 2.0, weight: 0.06, inverted: false, type: 'continuous', defaultValue: 1.0, label: 'Salience Ceiling', sectionId: 'temperature_dynamics', tier: 'intermediate' },
    { configPath: ['resonance', 'weightCeiling'], min: 1.0, max: 5.0, weight: 0.06, inverted: false, type: 'continuous', defaultValue: 2.0, label: 'Weight Ceiling', sectionId: 'weight_dynamics', tier: 'intermediate' },
    { configPath: ['labVerify', 'weightBoostOnVerified'], min: 0.0, max: 0.5, weight: 0.07, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Verified Weight Boost', sectionId: 'labVerify', tier: 'intermediate' },
    { configPath: ['labVerify', 'weightPenaltyOnFailed'], min: 0.0, max: 0.5, weight: 0.05, inverted: false, type: 'absValue', defaultValue: -0.05, label: 'Refuted Weight Penalty', sectionId: 'labVerify', tier: 'intermediate' },
    { configPath: ['validation', 'generativityBoost', 'parent'], min: 0.0, max: 0.2, weight: 0.06, inverted: false, type: 'continuous', defaultValue: 0.05, label: 'Generativity Boost: Parent', sectionId: 'node_validation', tier: 'advanced' },
    { configPath: ['validation', 'generativityBoost', 'grandparent'], min: 0.0, max: 0.1, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 0.02, label: 'Generativity Boost: Grandparent', sectionId: 'node_validation', tier: 'advanced' },
    { configPath: ['resonance', 'fitnessWeights', 'novelty'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.3, label: 'Fitness: Novelty', sectionId: 'fitness_modifier', tier: 'advanced' },
    { configPath: ['resonance', 'fitnessWeights', 'specificity'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.3, label: 'Fitness: Specificity', sectionId: 'fitness_modifier', tier: 'advanced' },
    { configPath: ['resonance', 'fitnessRange', 'max'], min: 1.0, max: 2.0, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 1.15, label: 'Fitness Range Max', sectionId: 'fitness_modifier', tier: 'advanced' },
    { configPath: ['contextEngine', 'feedback', 'weightBoost'], min: 0.0, max: 0.5, weight: 0.05, inverted: false, type: 'continuous', defaultValue: 0.05, label: 'Context Feedback Boost', sectionId: 'context_engine', tier: 'intermediate' },
    { configPath: ['contextEngine', 'feedback', 'maxBoostPerTurn'], min: 0.0, max: 0.5, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.1, label: 'Context Max Boost/Turn', sectionId: 'context_engine', tier: 'advanced' },
    { configPath: ['populationControl', 'boostWeight'], min: 1.0, max: 1.5, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 1.1, label: 'Population Boost Multiplier', sectionId: 'population_control', tier: 'intermediate' },
    { configPath: ['feedback', 'usefulWeight'], min: 0.01, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.2, label: 'Useful Feedback Boost', sectionId: 'feedback_weights', tier: 'intermediate' },
  ],

  // --- Verification: how much validation and evidence-checking is active ---
  verification: [
    { configPath: ['labVerify', 'enabled'], min: 0, max: 1, weight: 0.12, inverted: false, type: 'boolean', defaultValue: 0, label: 'Verification Enabled', sectionId: 'labVerify', tier: 'basic' },
    { configPath: ['labVerify', 'postRejection', 'enabled'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 0, label: 'Post-Rejection Enabled', sectionId: 'post_rejection', tier: 'intermediate' },
    { configPath: ['labVerify', 'postRejection', 'proposalEnabled'], min: 0, max: 1, weight: 0.05, inverted: false, type: 'boolean', defaultValue: 0, label: 'Post-Rejection Proposals', sectionId: 'post_rejection', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'evm', 'enabled'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 1, label: 'Lab Verification Cycle Enabled', sectionId: 'cycle_evm', tier: 'basic' },
    { configPath: ['autonomousCycles', 'evm', 'intervalMs'], min: 5000, max: 300000, weight: 0.05, inverted: true, type: 'continuous', defaultValue: 60000, label: 'Lab Verification Interval', sectionId: 'cycle_evm', tier: 'intermediate' },
    { configPath: ['autonomousCycles', 'evm', 'triageEnabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 0, label: 'Lab Triage', sectionId: 'cycle_evm', tier: 'intermediate' },
    { configPath: ['elitePool', 'enabled'], min: 0, max: 1, weight: 0.07, inverted: false, type: 'boolean', defaultValue: 0, label: 'Elite Pool Enabled', sectionId: 'elite_pool', tier: 'basic' },
    { configPath: ['elitePool', 'promotionThreshold'], min: 0.5, max: 1.0, weight: 0.05, inverted: false, type: 'continuous', defaultValue: 0.8, label: 'Promotion Threshold', sectionId: 'elite_pool', tier: 'intermediate' },
    { configPath: ['elitePool', 'logicalApprovalEnabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 0, label: 'Logical Approval', sectionId: 'elite_pool', tier: 'intermediate' },
    { configPath: ['elitePool', 'logicalApprovalThreshold'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.7, label: 'Logical Approval Threshold', sectionId: 'elite_pool', tier: 'intermediate' },
    { configPath: ['elitePool', 'dedup', 'enabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 1, label: 'Elite Dedup', sectionId: 'elite_pool', tier: 'intermediate' },
    { configPath: ['validation', 'evmGateEnabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 0, label: 'Lab Verification Gate', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'noveltyGateEnabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 0, label: 'Novelty Gate', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'breakthroughThresholds', 'minSynthesis'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.6, label: 'Min Synthesis Score', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'breakthroughThresholds', 'minNovelty'], min: 0.0, max: 1.0, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 0.5, label: 'Min Novelty Score', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'breakthroughThresholds', 'minTestability'], min: 0.0, max: 1.0, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 0.4, label: 'Min Testability Score', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'breakthroughThresholds', 'minTensionResolution'], min: 0.0, max: 1.0, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 0.3, label: 'Min Tension Resolution', sectionId: 'node_validation', tier: 'intermediate' },
    { configPath: ['validation', 'compositeWeights', 'synthesis'], min: 0.0, max: 1.0, weight: 0.02, inverted: false, type: 'continuous', defaultValue: 0.35, label: 'Composite: Synthesis', sectionId: 'node_validation', tier: 'advanced' },
    { configPath: ['validation', 'compositeWeights', 'novelty'], min: 0.0, max: 1.0, weight: 0.02, inverted: false, type: 'continuous', defaultValue: 0.25, label: 'Composite: Novelty', sectionId: 'node_validation', tier: 'advanced' },
    { configPath: ['labVerify', 'autoArchiveOnDisproved'], min: 0, max: 1, weight: 0.02, inverted: false, type: 'boolean', defaultValue: 1, label: 'Auto-Archive Refuted', sectionId: 'labVerify', tier: 'intermediate' },
    { configPath: ['labVerify', 'apiVerification', 'enabled'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 0, label: 'API Verification', sectionId: 'api_verification', tier: 'intermediate' },
    { configPath: ['labVerify', 'apiVerification', 'enrichmentEnabled'], min: 0, max: 1, weight: 0.02, inverted: false, type: 'boolean', defaultValue: 0, label: 'API Enrichment', sectionId: 'api_verification', tier: 'advanced' },
    { configPath: ['labVerify', 'decompose', 'maxFacts'], min: 1, max: 20, weight: 0.02, inverted: false, type: 'continuous', defaultValue: 10, label: 'Decompose Max Facts', sectionId: 'labVerify_decompose', tier: 'advanced' },
  ],

  // --- Output Discipline: how tightly the system controls output format/length ---
  outputDiscipline: [
    { configPath: ['voicing', 'maxInsightWords'], min: 5, max: 100, weight: 0.12, inverted: true, type: 'continuous', defaultValue: 25, label: 'Max Insight Words', sectionId: 'voicing_constraints', tier: 'basic' },
    { configPath: ['voicing', 'maxOutputWords'], min: 10, max: 200, weight: 0.12, inverted: true, type: 'continuous', defaultValue: 50, label: 'Max Output Words', sectionId: 'voicing_constraints', tier: 'basic' },
    { configPath: ['voicing', 'truncatedWords'], min: 5, max: 100, weight: 0.06, inverted: true, type: 'continuous', defaultValue: 30, label: 'Truncated Words', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['voicing', 'rejectNoSentenceEnding'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 1, label: 'Reject No Sentence Ending', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['voicing', 'rejectUnclosedParens'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 1, label: 'Reject Unclosed Parens', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['voicing', 'telegraphicEnabled'], min: 0, max: 1, weight: 0.08, inverted: false, type: 'boolean', defaultValue: 0, label: 'Telegraphic Mode', sectionId: 'voicing_constraints', tier: 'basic' },
    { configPath: ['voicing', 'telegraphicAggressiveness'], min: 0.0, max: 1.0, weight: 0.06, inverted: false, type: 'continuous', defaultValue: 0.5, label: 'Telegraphic Aggressiveness', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['voicing', 'entropyEnabled'], min: 0, max: 1, weight: 0.06, inverted: false, type: 'boolean', defaultValue: 0, label: 'Entropy Compression', sectionId: 'voicing_constraints', tier: 'intermediate' },
    { configPath: ['voicing', 'minNovelWordLength'], min: 2, max: 10, weight: 0.04, inverted: false, type: 'continuous', defaultValue: 4, label: 'Min Novel Word Length', sectionId: 'voicing_constraints', tier: 'advanced' },
    { configPath: ['hallucination', 'maxVerboseWords'], min: 10, max: 200, weight: 0.05, inverted: true, type: 'continuous', defaultValue: 50, label: 'Max Verbose Words', sectionId: 'hallucination_detection', tier: 'intermediate' },
    { configPath: ['hallucination', 'fabricatedNumberCheck'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Fabricated Number Check', sectionId: 'hallucination_detection', tier: 'intermediate' },
    { configPath: ['hallucination', 'crossDomainNumberCheck'], min: 0, max: 1, weight: 0.03, inverted: false, type: 'boolean', defaultValue: 1, label: 'Cross-Domain Number Check', sectionId: 'hallucination_detection', tier: 'advanced' },
    { configPath: ['numberVariables', 'enabled'], min: 0, max: 1, weight: 0.04, inverted: false, type: 'boolean', defaultValue: 1, label: 'Number Variables', sectionId: 'number_variables', tier: 'advanced' },
    { configPath: ['hallucination', 'novelWordMinLength'], min: 3, max: 15, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 6, label: 'Novel Word Min Length', sectionId: 'hallucination_detection', tier: 'advanced' },
    { configPath: ['hallucination', 'largeNumberThreshold'], min: 100, max: 100000, weight: 0.03, inverted: false, type: 'continuous', defaultValue: 1000, label: 'Large Number Threshold', sectionId: 'hallucination_detection', tier: 'advanced' },
  ],
};

/**
 * Compute a single axis value from config. Returns 0-1.
 * Normalizes by total weight so axes with different total weights
 * all produce values in the same 0-1 range.
 */
function computeAxisValue(axisKey, c) {
  const terms = AXIS_PARAM_TERMS[axisKey];
  if (!terms) return 0;
  let sum = 0;
  let totalWeight = 0;
  for (const term of terms) {
    totalWeight += term.weight;
    if (term.type === 'boolean') {
      const val = getNestedValue(c, term.configPath) ?? term.defaultValue;
      sum += (val ? 1 : 0) * term.weight;
    } else if (term.type === 'absValue') {
      const val = getNestedValue(c, term.configPath) ?? term.defaultValue;
      const n = norm(Math.abs(val), term.min, term.max);
      sum += (term.inverted ? (1 - n) : n) * term.weight;
    } else {
      // continuous
      const val = getNestedValue(c, term.configPath) ?? term.defaultValue;
      const n = norm(val, term.min, term.max);
      sum += (term.inverted ? (1 - n) : n) * term.weight;
    }
  }
  return totalWeight > 0 ? sum / totalWeight : 0;
}

/**
 * Compute 7 aggregate dimensions from the full config.
 * Each dimension is a weighted combination of related parameters,
 * normalized to 0-1 where higher = more of that quality.
 * Driven by AXIS_PARAM_TERMS metadata.
 */
export function computeSystemProfile(c) {
  const result = {};
  for (const axisKey of Object.keys(AXIS_PARAM_TERMS)) {
    result[axisKey] = computeAxisValue(axisKey, c);
  }
  return result;
}

// Default system profile (computed from stock defaults)
export const DEFAULT_SYSTEM_PROFILE = computeSystemProfile({});

/**
 * Tier drag multipliers — basic params get full headroom, advanced params
 * resist change (they should only move when basic/intermediate are exhausted).
 */
const TIER_DRAG_MULTIPLIERS = { basic: 1.0, intermediate: 0.3, advanced: 0.0 };

/**
 * Reverse-map an axis target value to proportional parameter changes.
 * Returns an array of { configPath, value, currentValue, label, sectionId, weight }.
 *
 * The delta is in normalized 0-1 space (since computeAxisValue divides by totalWeight).
 * We convert back to raw contribution space before distributing across terms.
 */
export function reverseMapAxis(axisKey, targetValue, currentConfig) {
  const terms = AXIS_PARAM_TERMS[axisKey];
  if (!terms) return [];

  const currentAxisValue = computeAxisValue(axisKey, currentConfig);
  const delta = targetValue - currentAxisValue;

  if (Math.abs(delta) < 0.001) return [];

  // Total weight for converting between normalized and raw contribution space
  const totalWeight = terms.reduce((s, t) => s + t.weight, 0);
  // Delta in raw contribution space (before normalization by totalWeight)
  const rawDelta = delta * totalWeight;

  // Only continuous (and absValue) params can be adjusted via drag
  const adjustableTerms = terms.filter(t => t.type === 'continuous' || t.type === 'absValue');

  const termInfo = adjustableTerms.map(term => {
    const rawVal = getNestedValue(currentConfig, term.configPath) ?? term.defaultValue;
    const val = term.type === 'absValue' ? Math.abs(rawVal) : rawVal;
    const currentNorm = norm(val, term.min, term.max);
    const tierMult = TIER_DRAG_MULTIPLIERS[term.tier || 'basic'] ?? 1.0;

    // How much headroom this term has in the direction of the delta,
    // scaled by tier drag so advanced params resist movement
    let headroom;
    if (delta > 0) {
      // Want to increase axis: for normal terms, increase norm → headroom is (1-currentNorm)
      // For inverted terms, increase axis = decrease norm → headroom is currentNorm
      headroom = (term.inverted ? currentNorm : (1 - currentNorm)) * term.weight * tierMult;
    } else {
      // Want to decrease axis: for normal terms, decrease norm → headroom is currentNorm
      // For inverted terms, decrease axis = increase norm → headroom is (1-currentNorm)
      headroom = (term.inverted ? (1 - currentNorm) : currentNorm) * term.weight * tierMult;
    }

    return { term, rawVal, val, currentNorm, headroom };
  });

  const totalHeadroom = termInfo.reduce((sum, t) => sum + t.headroom, 0);
  if (totalHeadroom < 0.001) return [];

  const changes = [];
  for (const { term, rawVal, val, currentNorm, headroom } of termInfo) {
    if (headroom < 0.001) continue;

    // This term's share of the raw delta, based on its headroom proportion
    const normDelta = (headroom / totalHeadroom) * Math.abs(rawDelta);

    let newNorm;
    if (delta > 0) {
      newNorm = term.inverted
        ? currentNorm - normDelta / term.weight
        : currentNorm + normDelta / term.weight;
    } else {
      newNorm = term.inverted
        ? currentNorm + normDelta / term.weight
        : currentNorm - normDelta / term.weight;
    }

    newNorm = Math.max(0, Math.min(1, newNorm));

    // Denormalize: val = norm * (max - min) + min
    let newVal = newNorm * (term.max - term.min) + term.min;

    // For absValue terms (like weightPenaltyOnFailed which is negative), restore sign
    if (term.type === 'absValue' && rawVal < 0) {
      newVal = -newVal;
    }

    // Round to reasonable precision based on param range
    const range = term.max - term.min;
    if (range >= 1000) newVal = Math.round(newVal);
    else if (range >= 10) newVal = Math.round(newVal * 10) / 10;
    else if (range >= 1) newVal = Math.round(newVal * 100) / 100;
    else newVal = Math.round(newVal * 1000) / 1000;

    if (Math.abs(newVal - rawVal) > 0.0001) {
      changes.push({
        configPath: term.configPath,
        value: newVal,
        currentValue: rawVal,
        label: term.label,
        sectionId: term.sectionId,
        weight: term.weight,
      });
    }
  }

  return changes;
}

// ─── Section tiers and presets — derived from API metadata ────────────────────
// Populated by initSectionMetadata() on mount. Replaces the old hardcoded maps.
// Until populated, functions gracefully default (tier→'basic', presets→null).

let _sectionTiers = {};
let _sectionPresets = {};

/** Returns the section tier map (populated by initSectionMetadata). */
export function getSectionTiers() { return _sectionTiers; }
/** Returns the section presets map (populated by initSectionMetadata). */
export function getSectionPresets() { return _sectionPresets; }

/**
 * Build SECTION_TIERS and SECTION_PRESETS from the config-sections API response.
 * Call once on mount: `initSectionMetadata(await configApi.sections())`
 */
export function initSectionMetadata(apiSections) {
  const tiers = {};
  const presets = {};
  for (const [id, section] of Object.entries(apiSections)) {
    tiers[id] = section.tier || 'basic';
    presets[id] = { title: section.title, presets: section.presets || [] };
  }
  _sectionTiers = tiers;
  _sectionPresets = presets;
}

// Backwards-compatible exports — these are getters that read the mutable state.
// Existing code that does `SECTION_TIERS[id]` will work after initSectionMetadata().
export const SECTION_TIERS = new Proxy({}, {
  get: (_, prop) => _sectionTiers[prop],
  ownKeys: () => Object.keys(_sectionTiers),
  getOwnPropertyDescriptor: (_, prop) => _sectionTiers[prop]
    ? { configurable: true, enumerable: true, value: _sectionTiers[prop] }
    : undefined,
});
export const SECTION_PRESETS = new Proxy({}, {
  get: (_, prop) => _sectionPresets[prop],
  ownKeys: () => Object.keys(_sectionPresets),
  getOwnPropertyDescriptor: (_, prop) => _sectionPresets[prop]
    ? { configurable: true, enumerable: true, value: _sectionPresets[prop] }
    : undefined,
});

export const TIER_LEVELS = { basic: 0, intermediate: 1, advanced: 2 };
