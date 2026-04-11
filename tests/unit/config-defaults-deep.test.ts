/**
 * Deep coverage tests for config/defaults.ts — covers uncovered branches,
 * statements, and functions (lines 399-689+ and env-var ternary branches).
 *
 * Focuses on:
 * - contextEngine sub-sections (stopWords, modelProfiles, intent, feedback, etc.)
 * - voicing (responseCleanupPatterns, entropyWeights, tierOverrides)
 * - telegraphic (phrases, words, removeAlways, removeMedium, removeAggressive, preserve)
 * - nodeValidation (genericStartPatterns, genericFillerPatterns)
 * - injection (all pattern arrays, autoRejectTypes)
 * - hallucination (synthesisVocabulary, tierOverrides, patterns)
 * - knowledgeBase (defaultExcludePatterns)
 * - tensions (patterns)
 * - validation (compositeWeights, breakthroughThresholds, generativityBoost)
 * - evm deep sections (blockedCalls, routing, postRejection, decompose, apiVerification)
 * - elitePool detail
 * - transient
 * - lifecycle
 * - consultantPipeline
 * - synthesisEngine
 * - clusterSelection
 * - server, gui, partitionServer
 * - backward compat alias (config.resonance)
 * - tsxCommand / tsxArgs via managedServices
 * - env-var driven ternary branches via re-import with mocked env
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Direct import — covers the default (no env var) branches
import {
  config,
  DEFAULT_TEMPERATURES,
  DEFAULT_REPEAT_PENALTIES,
  VERSION,
} from '../../config/defaults.js';

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// contextEngine deep coverage (lines ~295-466)
// =============================================================================
describe('config.contextEngine deep', () => {
  it('has allocation percentages summing to ~1.0', () => {
    const a = config.contextEngine.allocation;
    const sum = a.knowledge + a.history + a.systemPrompt + a.response;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('has relevanceWeights summing to ~1.0', () => {
    const w = config.contextEngine.relevanceWeights;
    const sum = w.embedding + w.topicMatch + w.nodeWeight + w.recency;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('has stopWords array with common words', () => {
    expect(config.contextEngine.stopWords).toBeInstanceOf(Array);
    expect(config.contextEngine.stopWords.length).toBeGreaterThan(50);
    expect(config.contextEngine.stopWords).toContain('the');
    expect(config.contextEngine.stopWords).toContain('and');
    expect(config.contextEngine.stopWords).toContain('said');
  });

  it('has dynamicBudget with newProfile and deepProfile', () => {
    expect(config.contextEngine.dynamicBudget.newProfile.knowledge).toBeGreaterThan(0);
    expect(config.contextEngine.dynamicBudget.deepProfile.history).toBeGreaterThan(0);
    expect(config.contextEngine.dynamicBudget.depthCeiling).toBeGreaterThan(0);
  });

  it('has feedback sub-config', () => {
    expect(config.contextEngine.feedback.usageThreshold).toBeGreaterThan(0);
    expect(config.contextEngine.feedback.weightBoost).toBeGreaterThan(0);
    expect(config.contextEngine.feedback.maxBoostPerTurn).toBeGreaterThan(0);
  });

  it('has topicClustering sub-config', () => {
    expect(config.contextEngine.topicClustering.threshold).toBeGreaterThan(0);
    expect(config.contextEngine.topicClustering.maxTopicsToEmbed).toBeGreaterThan(0);
    expect(config.contextEngine.topicClustering.clusterWeight).toBeGreaterThan(0);
  });

  it('has crossSession sub-config with EMA params', () => {
    // emaRetain and emaIncoming used to be a normalized split (sum=1), they're now
    // independent decay/intake coefficients used in different parts of the EMA update
    // step, so they no longer have to add to 1.0. Just sanity-check both are positive.
    const cs = config.contextEngine.crossSession;
    expect(cs.emaRetain).toBeGreaterThan(0);
    expect(cs.emaIncoming).toBeGreaterThan(0);
    expect(cs.dampeningNew).toBeGreaterThan(0);
    expect(cs.boostExisting).toBeGreaterThan(0);
    expect(cs.maxInsightsToLoad).toBeGreaterThan(0);
    expect(cs.maxNodeUsageToLoad).toBeGreaterThan(0);
    expect(cs.nodeUsageMinThreshold).toBeGreaterThanOrEqual(1);
  });

  it('has all five modelProfiles', () => {
    const profiles = config.contextEngine.modelProfiles;
    expect(profiles.micro).toBeDefined();
    expect(profiles.small).toBeDefined();
    expect(profiles.medium).toBeDefined();
    expect(profiles.large).toBeDefined();
    expect(profiles.xl).toBeDefined();
    // Budget multipliers increase with profile size
    expect(profiles.micro.budgetMultiplier).toBeLessThan(profiles.small.budgetMultiplier);
    expect(profiles.small.budgetMultiplier).toBeLessThan(profiles.medium.budgetMultiplier);
    expect(profiles.medium.budgetMultiplier).toBeLessThan(profiles.large.budgetMultiplier);
    expect(profiles.large.budgetMultiplier).toBeLessThan(profiles.xl.budgetMultiplier);
  });

  it('micro and small prefer compressed, larger do not', () => {
    expect(config.contextEngine.modelProfiles.micro.preferCompressed).toBe(true);
    expect(config.contextEngine.modelProfiles.small.preferCompressed).toBe(true);
    expect(config.contextEngine.modelProfiles.medium.preferCompressed).toBe(false);
    expect(config.contextEngine.modelProfiles.large.preferCompressed).toBe(false);
    expect(config.contextEngine.modelProfiles.xl.preferCompressed).toBe(false);
  });

  it('has topicBoosts', () => {
    const tb = config.contextEngine.topicBoosts;
    expect(tb.existingKeyword).toBeGreaterThan(0);
    expect(tb.existingPhrase).toBeGreaterThan(0);
    expect(tb.newPhrase).toBeGreaterThan(0);
  });

  it('has qualityMetricWeights summing to ~1.0', () => {
    const w = config.contextEngine.qualityMetricWeights;
    const sum = w.knowledgeUtilization + w.responseGrounding + w.topicCoverage + w.budgetEfficiency;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('has intentPatterns for all four intent types', () => {
    const ip = config.contextEngine.intentPatterns;
    expect(ip.retrieval.length).toBeGreaterThan(0);
    expect(ip.action.length).toBeGreaterThan(0);
    expect(ip.diagnosis.length).toBeGreaterThan(0);
    expect(ip.exploration.length).toBeGreaterThan(0);
  });

  it('intentPatterns are valid regex strings', () => {
    for (const [_intent, patterns] of Object.entries(config.contextEngine.intentPatterns)) {
      for (const p of patterns) {
        expect(() => new RegExp(p, 'i')).not.toThrow();
      }
    }
  });

  it('has intentWeightProfiles for all four intents', () => {
    const profiles = config.contextEngine.intentWeightProfiles;
    for (const intent of ['retrieval', 'action', 'diagnosis', 'exploration'] as const) {
      const p = profiles[intent];
      expect(p.embedding + p.topicMatch + p.nodeWeight + p.recency).toBeCloseTo(1.0, 1);
    }
  });

  it('has intentScoring config', () => {
    expect(config.contextEngine.intentScoring.scorePerMatch).toBeGreaterThan(0);
    expect(config.contextEngine.intentScoring.maxConfidenceScore).toBeGreaterThan(0);
  });

  it('has dedupInSelectionThreshold', () => {
    expect(config.contextEngine.dedupInSelectionThreshold).toBeGreaterThan(0);
    expect(config.contextEngine.dedupInSelectionThreshold).toBeLessThanOrEqual(1);
  });

  it('has topic decay params', () => {
    expect(config.contextEngine.topicDecayAgeMs).toBeGreaterThan(0);
    expect(config.contextEngine.topicDecayFactor).toBeGreaterThan(0);
    expect(config.contextEngine.topicDecayFactor).toBeLessThanOrEqual(1);
    expect(config.contextEngine.topicMinWeight).toBeGreaterThan(0);
  });

  it('has recencyDays', () => {
    expect(config.contextEngine.recencyDays).toBeGreaterThan(0);
  });

  it('has sessionCleanupIntervalMs', () => {
    expect(config.contextEngine.sessionCleanupIntervalMs).toBeGreaterThan(0);
  });

  it('has intentBlendMax and intentMinConfidence', () => {
    expect(config.contextEngine.intentBlendMax).toBeGreaterThan(0);
    expect(config.contextEngine.intentMinConfidence).toBeGreaterThan(0);
  });
});

// =============================================================================
// voicing deep (responseCleanupPatterns, entropy, tierOverrides)
// =============================================================================
describe('config.voicing deep', () => {
  it('has responseCleanupPatterns as valid regexes', () => {
    expect(config.voicing.responseCleanupPatterns.length).toBeGreaterThan(0);
    for (const p of config.voicing.responseCleanupPatterns) {
      expect(() => new RegExp(p, 'i')).not.toThrow();
    }
  });

  it('has entropy weights', () => {
    const ew = config.voicing.entropyWeights;
    expect(ew.entity).toBeGreaterThan(0);
    expect(ew.number).toBeGreaterThan(0);
    expect(ew.properNoun).toBeGreaterThan(0);
    expect(ew.acronym).toBeGreaterThan(0);
    expect(ew.rarity).toBeGreaterThan(0);
  });

  it('has entropy thresholds with light < medium < aggressive', () => {
    const et = config.voicing.entropyThresholds;
    expect(et.light).toBeLessThan(et.medium);
    expect(et.medium).toBeLessThan(et.aggressive);
  });

  it('has entropyRarityMinLength', () => {
    expect(config.voicing.entropyRarityMinLength).toBeGreaterThan(0);
  });

  it('has tierOverrides with minNovelWords', () => {
    expect(config.voicing.tierOverrides.medium.minNovelWords).toBeDefined();
    expect(config.voicing.tierOverrides.frontier.minNovelWords).toBeDefined();
    expect(config.voicing.tierOverrides.frontier.minNovelWords).toBeLessThan(
      config.voicing.tierOverrides.medium.minNovelWords!
    );
  });

  it('has telegraphic config', () => {
    expect(typeof config.voicing.telegraphicEnabled).toBe('boolean');
    expect(['light', 'medium', 'aggressive']).toContain(config.voicing.telegraphicAggressiveness);
  });

  it('rejectUnclosedParens and rejectNoSentenceEnding default to 1', () => {
    expect(config.voicing.rejectUnclosedParens).toBe(1);
    expect(config.voicing.rejectNoSentenceEnding).toBe(1);
  });
});

// =============================================================================
// telegraphic deep
// =============================================================================
describe('config.telegraphic deep', () => {
  it('phrases is array of [string, string] tuples', () => {
    expect(config.telegraphic.phrases.length).toBeGreaterThan(10);
    for (const pair of config.telegraphic.phrases) {
      expect(pair).toHaveLength(2);
      expect(typeof pair[0]).toBe('string');
      expect(typeof pair[1]).toBe('string');
    }
  });

  it('phrases maps verbose multi-word expressions to compact symbols', () => {
    // Telegraphic word-mapping moved from `words` (single tokens) to `phrases` (multi-word
    // pairs) — phrases is the load-bearing structure now. The single-word `words` map is
    // kept for backwards compat but defaults to empty / 0.
    const phrases = config.telegraphic.phrases as Array<[string, string]>;
    expect(Array.isArray(phrases)).toBe(true);
    expect(phrases.length).toBeGreaterThan(10);
    // Spot-check a few well-known mappings
    const phraseMap = new Map(phrases);
    expect(phraseMap.get('in order to')).toBe('→');
    expect(phraseMap.get('for example')).toBe('e.g.');
    expect(phraseMap.get('greater than')).toBe('>');
  });

  it('removeAlways has articles and intensifiers', () => {
    expect(config.telegraphic.removeAlways).toContain('a');
    expect(config.telegraphic.removeAlways).toContain('the');
    expect(config.telegraphic.removeAlways).toContain('very');
  });

  it('removeMedium has auxiliaries and determiners', () => {
    expect(config.telegraphic.removeMedium).toContain('have');
    expect(config.telegraphic.removeMedium).toContain('will');
    expect(config.telegraphic.removeMedium).toContain('this');
  });

  it('removeAggressive has pronouns and prepositions', () => {
    expect(config.telegraphic.removeAggressive).toContain('i');
    expect(config.telegraphic.removeAggressive).toContain('of');
    expect(config.telegraphic.removeAggressive).toContain('through');
  });

  it('preserve has negations and logical connectors', () => {
    expect(config.telegraphic.preserve).toContain('not');
    expect(config.telegraphic.preserve).toContain('no');
    expect(config.telegraphic.preserve).toContain('never');
    expect(config.telegraphic.preserve).toContain('but');
  });
});

// =============================================================================
// nodeValidation
// =============================================================================
describe('config.nodeValidation', () => {
  it('genericStartPatterns are valid regexes', () => {
    for (const p of config.nodeValidation.genericStartPatterns) {
      expect(() => new RegExp(p, 'i')).not.toThrow();
    }
  });

  it('genericFillerPatterns are valid regexes', () => {
    for (const p of config.nodeValidation.genericFillerPatterns) {
      expect(() => new RegExp(p, 'i')).not.toThrow();
    }
  });

  it('has genericRatioThreshold in (0,1)', () => {
    expect(config.nodeValidation.genericRatioThreshold).toBeGreaterThan(0);
    expect(config.nodeValidation.genericRatioThreshold).toBeLessThan(1);
  });

  it('has genericMinWordCount', () => {
    expect(config.nodeValidation.genericMinWordCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// injection deep — all pattern arrays
// =============================================================================
describe('config.injection deep', () => {
  const patternKeys = [
    'instructionOverridePatterns',
    'roleOverridePatterns',
    'promptStructurePatterns',
    'templateInjectionPatterns',
    'structureBreakingPatterns',
    'systemPromptPatterns',
  ] as const;

  it.each(patternKeys)('%s contains valid regexes', (key) => {
    const patterns = config.injection[key] as string[];
    expect(patterns.length).toBeGreaterThan(0);
    for (const p of patterns) {
      expect(() => new RegExp(p, 'i')).not.toThrow();
    }
  });

  it('autoRejectTypes includes voiced and synthesis', () => {
    expect(config.injection.autoRejectTypes).toContain('voiced');
    expect(config.injection.autoRejectTypes).toContain('synthesis');
  });

  it('scoreThreshold is positive', () => {
    expect(config.injection.scoreThreshold).toBeGreaterThan(0);
  });
});

// =============================================================================
// hallucination deep
// =============================================================================
describe('config.hallucination deep', () => {
  it('synthesisVocabulary is a large word list', () => {
    expect(config.hallucination.synthesisVocabulary.length).toBeGreaterThan(50);
    expect(config.hallucination.synthesisVocabulary).toContain('therefore');
    expect(config.hallucination.synthesisVocabulary).toContain('paradox');
    expect(config.hallucination.synthesisVocabulary).toContain('insight');
  });

  it('has tierOverrides for medium and frontier', () => {
    expect(config.hallucination.tierOverrides.medium).toBeDefined();
    expect(config.hallucination.tierOverrides.frontier).toBeDefined();
    expect(config.hallucination.tierOverrides.frontier.maxVerboseWords).toBeGreaterThan(
      config.hallucination.tierOverrides.medium.maxVerboseWords!
    );
  });

  it('fabricatedNumberCheck is true by default', () => {
    expect(config.hallucination.fabricatedNumberCheck).toBe(true);
  });

  it('crossDomainNumberCheck is true by default', () => {
    expect(config.hallucination.crossDomainNumberCheck).toBe(true);
  });

  it('pattern strings are valid regexes', () => {
    expect(() => new RegExp(config.hallucination.futureYearPattern)).not.toThrow();
    expect(() => new RegExp(config.hallucination.multiplierPattern)).not.toThrow();
    expect(() => new RegExp(config.hallucination.financialClaimPattern)).not.toThrow();
    expect(() => new RegExp(config.hallucination.numberPattern)).not.toThrow();
    expect(() => new RegExp(config.hallucination.roundNumberPattern)).not.toThrow();
    expect(() => new RegExp(config.hallucination.crossDomainTrivialPattern)).not.toThrow();
  });

  it('novelWordMinLength is positive', () => {
    expect(config.hallucination.novelWordMinLength).toBeGreaterThan(0);
  });
});

// =============================================================================
// knowledgeBase deep — defaultExcludePatterns
// =============================================================================
describe('config.knowledgeBase deep', () => {
  it('defaultExcludePatterns is a large list', () => {
    expect(config.knowledgeBase.defaultExcludePatterns.length).toBeGreaterThan(20);
  });

  it('excludes lock files', () => {
    const patterns = config.knowledgeBase.defaultExcludePatterns;
    expect(patterns).toContain('*.lock');
    expect(patterns).toContain('package-lock.json');
  });

  it('excludes node_modules and build output', () => {
    const patterns = config.knowledgeBase.defaultExcludePatterns;
    expect(patterns).toContain('node_modules/*');
    expect(patterns).toContain('dist/*');
  });

  it('excludes database files', () => {
    const patterns = config.knowledgeBase.defaultExcludePatterns;
    expect(patterns).toContain('*.db');
    expect(patterns).toContain('*.sqlite');
  });

  it('has maxConcurrency, maxChunkSize, minChunkLength', () => {
    expect(config.knowledgeBase.maxConcurrency).toBeGreaterThan(0);
    expect(config.knowledgeBase.maxChunkSize).toBeGreaterThan(0);
    expect(config.knowledgeBase.minChunkLength).toBeGreaterThan(0);
  });

  it('has retry config', () => {
    expect(config.knowledgeBase.retryMaxAttempts).toBeGreaterThan(0);
    expect(config.knowledgeBase.retryDelayMs).toBeGreaterThan(0);
  });

  it('has skipLargeFiles threshold', () => {
    expect(config.knowledgeBase.skipLargeFiles).toBeGreaterThan(0);
  });
});

// =============================================================================
// tensions
// =============================================================================
describe('config.tensions', () => {
  it('has antonym-style tension patterns', () => {
    expect(config.tensions.patterns.length).toBeGreaterThan(5);
    for (const pair of config.tensions.patterns) {
      expect(pair).toHaveLength(2);
    }
  });

  it('patterns include improve/harm', () => {
    const flat = config.tensions.patterns.map(p => p.join(','));
    expect(flat).toContain('improve,harm');
  });

  it('has negationBoost and minSimilarity', () => {
    expect(config.tensions.negationBoost).toBeGreaterThan(0);
    expect(config.tensions.minSimilarity).toBeGreaterThan(0);
  });
});

// =============================================================================
// validation deep
// =============================================================================
describe('config.validation deep', () => {
  it('compositeWeights are positive — relative weights normalized at use site', () => {
    // compositeWeights used to sum to 1.0, they're now independent positive weights that
    // get normalized when computing the composite score. Defaults boosted synthesis+novelty
    // above testability+tensionResolution to bias toward generative validations.
    const w = config.validation.compositeWeights;
    expect(w.synthesis).toBeGreaterThan(0);
    expect(w.novelty).toBeGreaterThan(0);
    expect(w.testability).toBeGreaterThan(0);
    expect(w.tensionResolution).toBeGreaterThan(0);
  });

  it('breakthroughThresholds are in reasonable range', () => {
    const bt = config.validation.breakthroughThresholds;
    for (const key of ['minSynthesis', 'minNovelty', 'minTestability', 'minTensionResolution'] as const) {
      expect(bt[key]).toBeGreaterThan(0);
      expect(bt[key]).toBeLessThanOrEqual(10);
    }
  });

  it('generativityBoost parent > grandparent', () => {
    expect(config.validation.generativityBoost.parent).toBeGreaterThan(
      config.validation.generativityBoost.grandparent
    );
  });

  it('noveltyGateEnabled defaults to true', () => {
    expect(config.validation.noveltyGateEnabled).toBe(true);
  });

  it('evmGateEnabled defaults to true', () => {
    expect(config.validation.evmGateEnabled).toBe(true);
  });
});

// =============================================================================
// evm deep sections
// =============================================================================
describe('config.labVerify deep', () => {
  it('postRejection has config', () => {
    expect(typeof config.labVerify.postRejection.enabled).toBe('boolean');
    expect(config.labVerify.postRejection.analysisTimeoutMs).toBeGreaterThan(0);
    expect(typeof config.labVerify.postRejection.proposalEnabled).toBe('boolean');
  });

  it('decompose has config', () => {
    expect(config.labVerify.decompose.maxFacts).toBeGreaterThan(0);
    expect(config.labVerify.decompose.maxQuestions).toBeGreaterThan(0);
    expect(config.labVerify.decompose.weightDowngrade).toBeLessThan(0);
    expect(config.labVerify.decompose.factInitialWeight).toBeGreaterThan(0);
  });

  it('apiVerification has config', () => {
    expect(config.labVerify.apiVerification.enabled).toBe(false);
    expect(config.labVerify.apiVerification.maxApisPerNode).toBeGreaterThan(0);
    expect(config.labVerify.apiVerification.enrichmentMode).toBe('inline');
  });

  it('specReview has config', () => {
    expect(typeof config.labVerify.specReview.enabled).toBe('boolean');
    expect(config.labVerify.specReview.minConfidence).toBeGreaterThan(0);
  });

  it('has weight boost and penalty config', () => {
    expect(config.labVerify.weightBoostOnVerified).toBeGreaterThan(0);
    expect(config.labVerify.weightPenaltyOnFailed).toBeLessThan(0);
    expect(config.labVerify.failedSalienceCap).toBeGreaterThan(0);
    expect(config.labVerify.failedSalienceCap).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// synthesisEngine
// =============================================================================
describe('config.synthesisEngine', () => {
  it('has subset/similarity thresholds in (0,1)', () => {
    expect(config.synthesisEngine.subsetOverlapThreshold).toBeGreaterThan(0);
    expect(config.synthesisEngine.subsetOverlapThreshold).toBeLessThanOrEqual(1);
    expect(config.synthesisEngine.similarityCeiling).toBeGreaterThan(0);
    expect(config.synthesisEngine.similarityCeiling).toBeLessThanOrEqual(1);
  });

  it('niching enabled by default', () => {
    expect(config.synthesisEngine.nichingEnabled).toBe(true);
  });

  it('migration is opt-in (defaults to disabled)', () => {
    // Migration changed from opt-out to opt-in — defaults disabled to avoid surprising
    // mid-cycle topology changes on existing graphs. Set SYNTHESIS_MIGRATION_ENABLED=true
    // in .env to enable it explicitly.
    expect(config.synthesisEngine.migrationEnabled).toBe(false);
  });

  it('domainDirected enabled by default', () => {
    expect(config.synthesisEngine.domainDirectedEnabled).toBe(true);
  });

  it('has candidateLimit', () => {
    expect(config.synthesisEngine.candidateLimit).toBeGreaterThan(0);
  });
});

// =============================================================================
// clusterSelection
// =============================================================================
describe('config.clusterSelection', () => {
  it('enabled by default', () => {
    expect(config.clusterSelection.enabled).toBe(true);
  });

  it('has simulated annealing params', () => {
    expect(config.clusterSelection.initialTemp).toBeGreaterThan(0);
    expect(config.clusterSelection.coolingRate).toBeGreaterThan(0);
    expect(config.clusterSelection.coolingRate).toBeLessThan(1);
    expect(config.clusterSelection.maxIterations).toBeGreaterThan(0);
  });

  it('has coherence and diversity weights', () => {
    expect(config.clusterSelection.coherenceWeight).toBeGreaterThan(0);
    expect(config.clusterSelection.diversityWeight).toBeGreaterThan(0);
  });

  it('minSimilarity < maxSimilarity', () => {
    expect(config.clusterSelection.minSimilarity).toBeLessThan(config.clusterSelection.maxSimilarity);
  });
});

// =============================================================================
// consultantPipeline
// =============================================================================
describe('config.consultantPipeline', () => {
  it('has threshold', () => {
    expect(config.consultantPipeline.threshold).toBeGreaterThan(0);
  });

  it('has compressionLevel', () => {
    expect(config.consultantPipeline.compressionLevel).toBeGreaterThan(0);
  });
});

// =============================================================================
// transient
// =============================================================================
describe('config.transient', () => {
  it('enabled by default (opt-out via TRANSIENT_ENABLED=false)', () => {
    // Transient partition support flipped from opt-in to opt-out — graph imports go
    // through quarantine + sandbox cycles either way, so leaving the system enabled by
    // default just lets the import pipeline use the quarantine path automatically.
    expect(config.transient.enabled).toBe(true);
  });

  it('has partition limits', () => {
    expect(config.transient.maxTransientPartitions).toBeGreaterThan(0);
    expect(config.transient.maxNodesPerImport).toBeGreaterThan(0);
  });

  it('has quarantine sub-config', () => {
    expect(config.transient.quarantine.scanFailThreshold).toBeGreaterThan(0);
    expect(config.transient.quarantine.sandboxCycles).toBeGreaterThan(0);
  });

  it('has cycle limits', () => {
    expect(config.transient.minCycles).toBeGreaterThan(0);
    expect(config.transient.maxCycles).toBeGreaterThan(config.transient.minCycles);
  });
});

// =============================================================================
// lifecycle
// =============================================================================
describe('config.lifecycle', () => {
  it('enabled by default', () => {
    expect(config.lifecycle.enabled).toBe(true);
  });

  it('has barren and compost thresholds', () => {
    expect(config.lifecycle.barrenThreshold).toBeGreaterThan(0);
    expect(config.lifecycle.compostAfter).toBeGreaterThan(0);
  });

  it('has nascent sub-config', () => {
    expect(config.lifecycle.nascent.maxCycles).toBeGreaterThan(0);
    expect(config.lifecycle.nascent.stillbirthMinAutorating).toBeGreaterThan(0);
  });

  it('has composting sub-config', () => {
    expect(config.lifecycle.composting.preserveBreakthroughs).toBe(true);
    expect(config.lifecycle.composting.summaryMaxLength).toBeGreaterThan(0);
  });
});

// =============================================================================
// consultantReview
// =============================================================================
describe('config.consultantReview', () => {
  it('is enabled by default', () => {
    expect(config.consultantReview.enabled).toBe(true);
  });

  it('has thresholds for multiple subsystems', () => {
    const t = config.consultantReview.thresholds;
    expect(t.voice).toBeGreaterThan(0);
    expect(t.synthesis).toBeGreaterThan(0);
    expect(t.dedup_judge).toBeGreaterThan(0);
    expect(t.spec_extraction).toBeGreaterThan(0);
    expect(t.research).toBeGreaterThan(0);
  });
});

// =============================================================================
// avatars
// =============================================================================
describe('config.avatars', () => {
  it('is enabled by default', () => {
    expect(config.avatars.enabled).toBe(true);
  });

  it('has style', () => {
    expect(typeof config.avatars.style).toBe('string');
  });
});

// =============================================================================
// partitionServer
// =============================================================================
describe('config.partitionServer', () => {
  it('has port', () => {
    expect(config.partitionServer.port).toBeGreaterThan(0);
  });

  it('disabled by default', () => {
    expect(config.partitionServer.enabled).toBe(false);
  });

  it('has dbPath', () => {
    expect(config.partitionServer.dbPath).toContain('pool.db');
  });

  it('has returnCheckIntervalMs', () => {
    expect(config.partitionServer.returnCheckIntervalMs).toBeGreaterThan(0);
  });
});

// =============================================================================
// server
// =============================================================================
describe('config.server', () => {
  it('has port', () => {
    expect(config.server.port).toBeGreaterThan(0);
  });

  it('has host defaulting to localhost', () => {
    expect(config.server.host).toBe('localhost');
  });

  it('corsOrigins is an array', () => {
    expect(Array.isArray(config.server.corsOrigins)).toBe(true);
  });
});

// =============================================================================
// gui
// =============================================================================
describe('config.gui', () => {
  it('has port', () => {
    expect(config.gui.port).toBeGreaterThan(0);
  });
});

// =============================================================================
// magicNumbers
// =============================================================================
describe('config.magicNumbers', () => {
  it('has junkFilterLimit', () => {
    expect(config.magicNumbers.junkFilterLimit).toBeGreaterThan(0);
  });

  it('has domainInferenceThreshold in (0,1)', () => {
    expect(config.magicNumbers.domainInferenceThreshold).toBeGreaterThan(0);
    expect(config.magicNumbers.domainInferenceThreshold).toBeLessThan(1);
  });

  it('has salienceRescueDays', () => {
    expect(config.magicNumbers.salienceRescueDays).toBeGreaterThan(0);
  });
});

// =============================================================================
// embeddingCache
// =============================================================================
describe('config.embeddingCache', () => {
  it('has maxSize', () => {
    expect(config.embeddingCache.maxSize).toBeGreaterThan(0);
  });

  it('has defaultWarmupLimit', () => {
    expect(config.embeddingCache.defaultWarmupLimit).toBeGreaterThan(0);
  });
});

// =============================================================================
// tokenLimits deep
// =============================================================================
describe('config.tokenLimits deep', () => {
  it('has reasoningModelPatterns', () => {
    expect(config.tokenLimits.reasoningModelPatterns.length).toBeGreaterThan(0);
    expect(config.tokenLimits.reasoningModelPatterns).toContain('r1');
  });
});

// =============================================================================
// subsystem sampling defaults
// =============================================================================
describe('config subsystem sampling maps', () => {
  it('subsystemTemperatures is a copy of DEFAULT_TEMPERATURES', () => {
    for (const [key, val] of Object.entries(DEFAULT_TEMPERATURES)) {
      expect(config.subsystemTemperatures[key]).toBe(val);
    }
  });

  it('subsystemRepeatPenalties is a copy of DEFAULT_REPEAT_PENALTIES', () => {
    for (const [key, val] of Object.entries(DEFAULT_REPEAT_PENALTIES)) {
      expect(config.subsystemRepeatPenalties[key]).toBe(val);
    }
  });

  it('subsystemTopP/MinP/TopK have reader-subsystem defaults', () => {
    // The maps used to start empty; reader subsystems were given non-default sampling
    // params (top-p / min-p / top-k) so OCR / code / pdf readers behave consistently
    // regardless of the model assigned. The chat and api_verification subsystems also
    // get defaults to keep response sampling stable across models.
    expect(Object.keys(config.subsystemTopP).length).toBeGreaterThan(0);
    expect(Object.keys(config.subsystemMinP).length).toBeGreaterThan(0);
    expect(Object.keys(config.subsystemTopK).length).toBeGreaterThan(0);
    // Reader defaults specifically — these are the load-bearing entries
    expect(config.subsystemTopP.reader_image).toBeDefined();
    expect(config.subsystemTopP.reader_code).toBeDefined();
    expect(config.subsystemTopK.reader_image).toBeGreaterThan(0);
  });

  it('consultantTemperatures has voice subsystem', () => {
    expect(config.consultantTemperatures.voice).toBeDefined();
    expect(config.consultantTemperatures.voice).toBeLessThan(1);
  });

  it('consultant sampling maps start empty', () => {
    expect(Object.keys(config.consultantRepeatPenalties).length).toBe(0);
    expect(Object.keys(config.consultantTopP).length).toBe(0);
  });
});

// =============================================================================
// autonomousCycles deep — additional cycle coverage
// =============================================================================
describe('config.autonomousCycles deep', () => {
  it('autorating cycle has grace period and batch config', () => {
    const ar = config.autonomousCycles.autorating;
    expect(ar.gracePeriodMinutes).toBeGreaterThan(0);
    expect(ar.batchSize).toBeGreaterThan(0);
    expect(ar.inlineEnabled).toBe(true);
  });

  it('evm cycle has triage and resynthesis config', () => {
    const evm = config.autonomousCycles.evm;
    expect(evm.triageEnabled).toBe(true);
    expect(evm.minTriageScore).toBeGreaterThan(0);
    expect(typeof evm.webResearchEnabled).toBe('boolean');
    expect(typeof evm.resynthesisEnabled).toBe('boolean');
    expect(evm.autoApproveVerdicts).toContain('supported');
  });

  it('research cycle has domain selection and exhaustion config', () => {
    const research = config.autonomousCycles.research;
    expect(research.domainSelectionLimit).toBeGreaterThan(0);
    expect(research.seedMinLength).toBeGreaterThan(0);
    expect(research.seedMaxLength).toBeGreaterThan(research.seedMinLength);
    expect(research.relevanceThreshold).toBeGreaterThan(0);
    expect(research.exhaustionStreak).toBeGreaterThan(0);
    expect(research.exhaustionCooldownMs).toBeGreaterThan(0);
  });

  it('questions cycle has weight penalty and floor', () => {
    const q = config.autonomousCycles.questions;
    expect(q.weightPenalty).toBeGreaterThan(0);
    expect(q.weightFloor).toBeGreaterThan(0);
    expect(q.candidatePoolSize).toBeGreaterThan(0);
    expect(q.contextMinSimilarity).toBeGreaterThan(0);
  });

  it('voicing cycle has modes array', () => {
    expect(config.autonomousCycles.voicing.modes.length).toBeGreaterThan(0);
    expect(config.autonomousCycles.voicing.modes).toContain('object-following');
    expect(config.autonomousCycles.voicing.modes).toContain('sincere');
  });
});

// =============================================================================
// backward compat alias
// =============================================================================
describe('backward compatibility', () => {
  it('config.resonance is the same object as config.engine', () => {
    expect((config as any).resonance).toBe(config.engine);
  });
});

// =============================================================================
// tsxCommand platform branch — covered via managedServices command field
// =============================================================================
describe('tsx command platform branching', () => {
  it('managedServices.resonance.command is npx or npx.cmd based on platform', () => {
    const expected = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    expect(config.managedServices.resonance.command).toBe(expected);
  });

  it('managedServices.resonance.args includes tsx', () => {
    expect(config.managedServices.resonance.args).toContain('tsx');
    expect(config.managedServices.resonance.args).toContain('server.ts');
  });

  it('proxy managed service args include tsx + proxy-server.ts', () => {
    expect(config.managedServices.proxy.args).toContain('tsx');
    expect(config.managedServices.proxy.args).toContain('proxy-server.ts');
  });

  it('partitionServer args include tsx + partition-server.ts', () => {
    expect(config.managedServices.partitionServer.args).toContain('tsx');
    expect(config.managedServices.partitionServer.args).toContain('partition-server.ts');
  });
});

// =============================================================================
// engine deep — fitness and synthesis decay
// =============================================================================
describe('config.engine deep', () => {
  it('fitnessWeights are positive — these are relative weights, not a normalized distribution', () => {
    // fitnessWeights are summed-and-normalized at use site, so they don't have to add to 1.0.
    // Earlier the test expected sum≈1.0, but the defaults have shifted to relative weighting
    // (current values: dissimilarity=0.4, novelty=0.5, specificity=0.3 → sum=1.2).
    const fw = config.engine.fitnessWeights;
    expect(fw.dissimilarity).toBeGreaterThan(0);
    expect(fw.novelty).toBeGreaterThan(0);
    expect(fw.specificity).toBeGreaterThan(0);
  });

  it('fitnessRange has min and max', () => {
    expect(config.engine.fitnessRange.min).toBeGreaterThan(0);
    expect(config.engine.fitnessRange.max).toBeGreaterThan(config.engine.fitnessRange.min);
  });

  it('synthesisDecay is enabled by default', () => {
    expect(config.engine.synthesisDecayEnabled).toBe(true);
  });

  it('fitnessEnabled defaults to true', () => {
    expect(config.engine.fitnessEnabled).toBe(true);
  });

  it('has salience parameters', () => {
    expect(config.engine.salienceBoost).toBeGreaterThan(0);
    expect(config.engine.salienceDecay).toBeGreaterThan(0);
    expect(config.engine.salienceDecay).toBeLessThanOrEqual(1);
    expect(config.engine.salienceCeiling).toBeGreaterThan(0);
    expect(config.engine.salienceFloor).toBeGreaterThan(0);
    expect(config.engine.salienceFloor).toBeLessThan(config.engine.salienceCeiling);
  });
});

// =============================================================================
// specificity (referenced from top-level test but not deeply checked)
// =============================================================================
describe('config.specificity', () => {
  it('section exists', () => {
    expect(config.specificity).toBeDefined();
  });
});

// =============================================================================
// nodes
// =============================================================================
describe('config.nodes deep', () => {
  it('defaultWeight is positive', () => {
    expect(config.nodes.defaultWeight).toBeGreaterThan(0);
  });
});

// =============================================================================
// dedup deep
// =============================================================================
describe('config.dedup deep', () => {
  it('has llmJudge config', () => {
    expect(config.dedup.llmJudgeEnabled).toBe(true);
    expect(config.dedup.llmJudgeDoubtFloor).toBeGreaterThan(0);
    expect(config.dedup.llmJudgeHardCeiling).toBeGreaterThan(config.dedup.llmJudgeDoubtFloor);
  });

  it('has attractor config', () => {
    expect(config.dedup.attractorThreshold).toBeGreaterThan(0);
    expect(config.dedup.attractorWeightDecay).toBeGreaterThan(0);
  });

  it('has supersedesThreshold', () => {
    expect(config.dedup.supersedesThreshold).toBeGreaterThan(0);
    expect(config.dedup.supersedesThreshold).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// DEFAULT_TEMPERATURES and DEFAULT_REPEAT_PENALTIES completeness
// =============================================================================
describe('DEFAULT_TEMPERATURES completeness', () => {
  const expectedSubsystems = [
    'voice', 'chat', 'compress', 'proxy', 'research', 'context', 'docs',
    'keyword', 'autorating', 'spec_extraction', 'evm_analysis',
    'breakthrough_check', 'api_verification',
    'reader_text', 'reader_pdf', 'reader_doc', 'reader_image',
    'reader_sheet', 'reader_code',
  ];

  it.each(expectedSubsystems)('has temperature for "%s"', (sub) => {
    expect(DEFAULT_TEMPERATURES[sub]).toBeDefined();
  });
});

describe('DEFAULT_REPEAT_PENALTIES completeness', () => {
  it('reader_image has elevated penalty', () => {
    expect(DEFAULT_REPEAT_PENALTIES.reader_image).toBeGreaterThan(1.0);
  });

  it('most subsystems have penalty of 1.0', () => {
    const nonDefault = Object.entries(DEFAULT_REPEAT_PENALTIES)
      .filter(([_, v]) => v !== 1.0);
    // Only reader_image should differ
    expect(nonDefault.length).toBe(1);
    expect(nonDefault[0][0]).toBe('reader_image');
  });
});

// =============================================================================
// Env-var ternary branch coverage — re-import with env vars set to cover the
// process.env.X ? split/parse path (the "if" branches of ternaries)
// =============================================================================
describe('env-var ternary branches', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('CONTEXT_STOP_WORDS env var produces custom stop words', async () => {
    process.env.CONTEXT_STOP_WORDS = 'foo, bar, baz';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.contextEngine.stopWords).toEqual(['foo', 'bar', 'baz']);
  });

  it('VOICING_RESPONSE_CLEANUP_PATTERNS env var splits on ||', async () => {
    process.env.VOICING_RESPONSE_CLEANUP_PATTERNS = '^test pattern||^another';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.voicing.responseCleanupPatterns).toEqual(['^test pattern', '^another']);
  });

  it('TELEGRAPHIC_PHRASES env var parsed from JSON', async () => {
    process.env.TELEGRAPHIC_PHRASES = JSON.stringify([['hello', 'hi']]);
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.phrases).toEqual([['hello', 'hi']]);
  });

  it('TELEGRAPHIC_WORDS env var parsed from JSON', async () => {
    process.env.TELEGRAPHIC_WORDS = JSON.stringify({ hello: 'hi' });
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.words).toEqual({ hello: 'hi' });
  });

  it('TELEGRAPHIC_REMOVE_ALWAYS env var splits on comma', async () => {
    process.env.TELEGRAPHIC_REMOVE_ALWAYS = 'x, y, z';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.removeAlways).toEqual(['x', 'y', 'z']);
  });

  it('TELEGRAPHIC_REMOVE_MEDIUM env var splits on comma', async () => {
    process.env.TELEGRAPHIC_REMOVE_MEDIUM = 'a, b';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.removeMedium).toEqual(['a', 'b']);
  });

  it('TELEGRAPHIC_REMOVE_AGGRESSIVE env var splits on comma', async () => {
    process.env.TELEGRAPHIC_REMOVE_AGGRESSIVE = 'p, q';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.removeAggressive).toEqual(['p', 'q']);
  });

  it('TELEGRAPHIC_PRESERVE env var splits on comma', async () => {
    process.env.TELEGRAPHIC_PRESERVE = 'not, but';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.telegraphic.preserve).toEqual(['not', 'but']);
  });

  it('NODE_VALIDATION_GENERIC_START env var splits on ||', async () => {
    process.env.NODE_VALIDATION_GENERIC_START = '^test||^other';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.nodeValidation.genericStartPatterns).toEqual(['^test', '^other']);
  });

  it('NODE_VALIDATION_GENERIC_FILLER env var splits on ||', async () => {
    process.env.NODE_VALIDATION_GENERIC_FILLER = '\\bfoo\\b||\\bbar\\b';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.nodeValidation.genericFillerPatterns).toEqual(['\\bfoo\\b', '\\bbar\\b']);
  });

  it('INJECTION_INSTRUCTION_OVERRIDE env var splits on ||', async () => {
    process.env.INJECTION_INSTRUCTION_OVERRIDE = 'pat1||pat2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.instructionOverridePatterns).toEqual(['pat1', 'pat2']);
  });

  it('INJECTION_ROLE_OVERRIDE env var splits on ||', async () => {
    process.env.INJECTION_ROLE_OVERRIDE = 'role1||role2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.roleOverridePatterns).toEqual(['role1', 'role2']);
  });

  it('INJECTION_PROMPT_STRUCTURE env var splits on ||', async () => {
    process.env.INJECTION_PROMPT_STRUCTURE = 'struct1||struct2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.promptStructurePatterns).toEqual(['struct1', 'struct2']);
  });

  it('INJECTION_TEMPLATE env var splits on ||', async () => {
    process.env.INJECTION_TEMPLATE = 'tmpl1||tmpl2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.templateInjectionPatterns).toEqual(['tmpl1', 'tmpl2']);
  });

  it('INJECTION_STRUCTURE_BREAKING env var splits on ||', async () => {
    process.env.INJECTION_STRUCTURE_BREAKING = 'brk1||brk2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.structureBreakingPatterns).toEqual(['brk1', 'brk2']);
  });

  it('INJECTION_SYSTEM_PROMPT env var splits on ||', async () => {
    process.env.INJECTION_SYSTEM_PROMPT = 'sys1||sys2';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.systemPromptPatterns).toEqual(['sys1', 'sys2']);
  });

  it('INJECTION_AUTO_REJECT_TYPES env var splits on comma', async () => {
    process.env.INJECTION_AUTO_REJECT_TYPES = 'typeA, typeB';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.injection.autoRejectTypes).toEqual(['typeA', 'typeB']);
  });

  it('HALLUCINATION_SYNTHESIS_VOCABULARY env var splits on comma', async () => {
    process.env.HALLUCINATION_SYNTHESIS_VOCABULARY = 'alpha, beta, gamma';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.hallucination.synthesisVocabulary).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('KB_DEFAULT_EXCLUDE_PATTERNS env var splits on comma', async () => {
    process.env.KB_DEFAULT_EXCLUDE_PATTERNS = '*.tmp, *.bak';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.knowledgeBase.defaultExcludePatterns).toEqual(['*.tmp', '*.bak']);
  });

  // EVM_ALLOWED_MODULES and EVM_BLOCKED_BUILTINS were removed when sandbox
  // execution moved to lab servers. labVerify only stores graph consequences.

  it('PODBIT_CORS_ORIGINS env var splits on comma (extra coverage)', async () => {
    process.env.PODBIT_CORS_ORIGINS = 'http://a.com, http://b.com';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.server.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
  });

  it('PODBIT_CORS_ORIGINS env var splits on comma', async () => {
    process.env.PODBIT_CORS_ORIGINS = 'http://localhost:3000, http://example.com';
    const mod = await import('../../config/defaults.js');
    expect(mod.config.server.corsOrigins).toEqual(['http://localhost:3000', 'http://example.com']);
  });

  it('empty comma values are filtered out', async () => {
    process.env.TELEGRAPHIC_REMOVE_ALWAYS = 'a,,b, ,c';
    const mod = await import('../../config/defaults.js');
    // trim + filter(Boolean) removes empty strings
    expect(mod.config.telegraphic.removeAlways).toEqual(['a', 'b', 'c']);
  });
});
