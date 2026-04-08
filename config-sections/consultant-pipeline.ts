/**
 * @module config-sections/consultant-pipeline
 *
 * Config section metadata for the consultant pipeline scoring dimensions.
 * These settings control how `runComprehensiveConsultant()` evaluates
 * synthesis quality — used by the population control cycle for post-birth
 * quality evaluation.
 */

import type { SectionMeta } from './types.js';

/** Consultant pipeline config section definitions. */
export const CONSULTANT_PIPELINE_SECTIONS: Record<string, SectionMeta> = {
    consultant_pipeline: {
        id: 'consultant_pipeline',
        tier: 'basic',
        title: 'Quality Scoring Dimensions',
        description: 'Controls how the comprehensive LLM consultant scores synthesis quality — used by population control for post-birth evaluation',
        behavior: `The comprehensive consultant scores synthesis on 6 dimensions in a single LLM call. The composite score is a weighted sum of these dimensions — you control both the pass/fail threshold and the weight of each dimension. The graph context setting controls how many existing similar nodes are shown to the consultant for judging incremental value. This scoring is used by the population control cycle to boost, demote, or archive nodes.`,
        parameters: [
            {
                key: 'cpThreshold',
                label: 'Quality Threshold',
                description: 'Minimum composite score (0-10) for a synthesis to pass population control. The composite is a weighted sum of the 6 dimensions below — each scored 0-10 by the LLM, then multiplied by its weight. At 6 (default), roughly 40-50% of synthesis passes — moderate quality bar. At 8, only ~15-20% passes — very strict, only well-grounded novel connections survive. At 4, ~70-80% passes — minimal culling. If your graph accumulates junk, raise this. If almost nothing survives population control, lower it.',
                min: 1, max: 10, step: 1, default: 6,
                configPath: ['consultantPipeline', 'threshold'],
                tier: 'basic',
            },
            {
                key: 'cpCompressionLevel',
                label: 'Compression Level',
                description: 'How aggressively to compress parent content for voicing. 1 = light (minimal removal), 2 = medium (standard telegraphic), 3 = aggressive (heavy stripping). Lower compression preserves more context for the consultant to judge.',
                min: 1, max: 3, step: 1, default: 2,
                configPath: ['consultantPipeline', 'compressionLevel'],
                tier: 'advanced',
            },
            {
                key: 'cpGraphContextTopN',
                label: 'Graph Context Nodes',
                description: 'How many existing similar nodes to show the consultant when judging incremental value. At 5 (default), the 5 most similar existing nodes are included in the prompt — the consultant can see whether this synthesis adds something the graph doesn\'t already know. At 0, the consultant judges in isolation (no redundancy detection, only quality). At 10-15, better redundancy detection but significantly larger prompts — higher token cost per evaluation and risk of exceeding context windows on smaller models.',
                min: 0, max: 15, step: 1, default: 5,
                configPath: ['consultantPipeline', 'graphContextTopN'],
                tier: 'advanced',
            },
            {
                key: 'cpWeightCoherence',
                label: 'Weight: Coherence',
                description: 'How much "does this logically follow from both parents?" matters. Catches forced analogies where two unrelated things are bridged by a vague label. This is the strongest signal for rejecting nonsense connections.',
                min: 0, max: 1, step: 0.05, default: 0.20,
                configPath: ['consultantPipeline', 'weights', 'coherence'],
                tier: 'intermediate',
            },
            {
                key: 'cpWeightGrounding',
                label: 'Weight: Grounding',
                description: 'How much "is every claim traceable to the parent nodes?" matters. Catches hallucinated numbers, invented terminology, and claims from neither parent. High values reject creative extrapolation.',
                min: 0, max: 1, step: 0.05, default: 0.15,
                configPath: ['consultantPipeline', 'weights', 'grounding'],
                tier: 'intermediate',
            },
            {
                key: 'cpWeightNovelty',
                label: 'Weight: Novelty',
                description: 'How much "does this add insight beyond restating the parents?" matters. Catches pure restatements and summaries. Note: this is novelty relative to parents, not the graph — incremental value handles graph-level novelty.',
                min: 0, max: 1, step: 0.05, default: 0.20,
                configPath: ['consultantPipeline', 'weights', 'novelty'],
                tier: 'intermediate',
            },
            {
                key: 'cpWeightDerivation',
                label: 'Weight: Derivation',
                description: 'How much "are the specific claims derived from reasoning, not just inherited from parents?" matters. Catches decorative specificity — nodes that stack precise numbers borrowed from parents without any derivation chain connecting them to the novel claim. Higher values reject synthesis that LOOKS specific but whose numbers do no argumentative work.',
                min: 0, max: 1, step: 0.05, default: 0.15,
                configPath: ['consultantPipeline', 'weights', 'derivation'],
                tier: 'intermediate',
            },
            {
                key: 'cpWeightForcedAnalogy',
                label: 'Weight: Forced Analogy',
                description: 'How much "is the cross-domain bridge genuine or just pattern-matching?" matters. Specifically targets "both exhibit X" claims without a concrete shared mechanism. Overlaps with coherence but focused on domain-bridging language.',
                min: 0, max: 1, step: 0.05, default: 0.10,
                configPath: ['consultantPipeline', 'weights', 'forcedAnalogy'],
                tier: 'advanced',
            },
            {
                key: 'cpWeightIncrementalValue',
                label: 'Weight: Incremental Value',
                description: 'How much "does this add something the graph doesn\'t already know?" matters. Uses the graph context nodes to detect redundancy BEFORE the synthesis enters the graph. Set to 0 to disable this dimension entirely. This is the key lever for reducing redundant synthesis.',
                min: 0, max: 1, step: 0.05, default: 0.20,
                configPath: ['consultantPipeline', 'weights', 'incrementalValue'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict', intent: 'High threshold (8), heavy incremental value weight — only genuinely novel insights pass' },
            { label: 'Balanced', intent: 'Medium threshold (6) with default dimension weights' },
            { label: 'Permissive', intent: 'Lower threshold (4), reduced incremental value weight — lets more through for downstream gates to filter' },
            { label: 'Quality Only', intent: 'Disable incremental value (weight 0), raise coherence/grounding — judge synthesis quality without graph context' },
        ],
    },
};
