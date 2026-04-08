/**
 * Tunable parameter metadata for per-model-tier quality gate overrides.
 *
 * Model tiers (medium = capable, frontier = best-in-class) have different
 * hallucination and output quality characteristics. These sections allow
 * tuning quality gates per tier so strict checks protect against weaker
 * models while frontier models get more freedom. Covers hallucination
 * detection and voicing constraints for both medium and frontier tiers.
 * Sections auto-render in the GUI config page and are addressable via
 * `podbit.config(action: "tune", sectionId: "...")`.
 *
 * @module config-sections/tier-quality-gates
 */

import type { SectionMeta } from './types.js';

export const TIER_QUALITY_GATE_SECTIONS: Record<string, SectionMeta> = {
    medium_hallucination: {
        id: 'medium_hallucination',
        tier: 'advanced',
        title: 'Medium Tier — Hallucination Gates',
        description: 'Quality gate overrides for medium-tier models. These models may hallucinate numbers and need stricter checks.',
        behavior: 'When a medium-tier model is assigned to a subsystem, these values override the global hallucination settings. Leave blank to use the global default.',
        parameters: [
            {
                key: 'medium_fabricatedNumberCheck',
                label: 'Fabricated Number Check',
                description: 'Flag numbers not in parent nodes. On for medium tier — these models are more likely to invent statistics.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['hallucination', 'tierOverrides', 'medium', 'fabricatedNumberCheck'],
                tier: 'advanced',
            },
            {
                key: 'medium_minRedFlags',
                label: 'Min Red Flags',
                description: 'Red flags needed to reject. Lower for medium tier — a single suspicious signal is enough to reject.',
                min: 1, max: 5, step: 1, default: 1,
                configPath: ['hallucination', 'tierOverrides', 'medium', 'minRedFlags'],
                tier: 'advanced',
            },
            {
                key: 'medium_maxVerboseWords',
                label: 'Max Verbose Words',
                description: 'Word count triggering "suspiciously verbose" flag. Lower for medium tier — long output usually means leaked chain-of-thought.',
                min: 20, max: 200, step: 10, default: 40,
                configPath: ['hallucination', 'tierOverrides', 'medium', 'maxVerboseWords'],
                tier: 'advanced',
            },
            {
                key: 'medium_novelRatioThreshold',
                label: 'Novel Ratio Threshold',
                description: 'Max fraction of novel words before flagging. Lower for medium tier — novel vocabulary from weaker models is more likely hallucination.',
                min: 0.3, max: 1.0, step: 0.05, default: 0.6,
                configPath: ['hallucination', 'tierOverrides', 'medium', 'novelRatioThreshold'],
                tier: 'advanced',
            },
            {
                key: 'medium_largeNumberThreshold',
                label: 'Large Number Threshold',
                description: 'Numbers above this are flagged if not in parents. Lower for medium tier.',
                min: 10, max: 10000, step: 10, default: 100,
                configPath: ['hallucination', 'tierOverrides', 'medium', 'largeNumberThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict (default)', intent: 'Strict hallucination detection for medium-tier models' },
            { label: 'Moderate', intent: 'Slightly relaxed detection for capable medium-tier models' },
        ],
    },

    frontier_hallucination: {
        id: 'frontier_hallucination',
        tier: 'advanced',
        title: 'Frontier Tier — Hallucination Gates',
        description: 'Quality gate overrides for frontier-tier models. These models can legitimately derive numbers and produce longer output through reasoning.',
        behavior: 'When a frontier model is assigned to a subsystem, these values override the global hallucination settings. Frontier models deserve more freedom — they derive numbers through reasoning and synthesize creatively.',
        parameters: [
            {
                key: 'frontier_fabricatedNumberCheck',
                label: 'Fabricated Number Check',
                description: 'Flag numbers not in parent nodes. Off for frontier — these models legitimately derive ratios and percentages.',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['hallucination', 'tierOverrides', 'frontier', 'fabricatedNumberCheck'],
                tier: 'advanced',
            },
            {
                key: 'frontier_minRedFlags',
                label: 'Min Red Flags',
                description: 'Red flags needed to reject. Higher for frontier — give these models benefit of the doubt.',
                min: 1, max: 5, step: 1, default: 2,
                configPath: ['hallucination', 'tierOverrides', 'frontier', 'minRedFlags'],
                tier: 'advanced',
            },
            {
                key: 'frontier_maxVerboseWords',
                label: 'Max Verbose Words',
                description: 'Word count triggering "suspiciously verbose" flag. Higher for frontier — these models produce longer, legitimate synthesis.',
                min: 20, max: 500, step: 10, default: 200,
                configPath: ['hallucination', 'tierOverrides', 'frontier', 'maxVerboseWords'],
                tier: 'advanced',
            },
            {
                key: 'frontier_novelRatioThreshold',
                label: 'Novel Ratio Threshold',
                description: 'Max fraction of novel words before flagging. Higher for frontier — creative synthesis from these models is legitimate.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.85,
                configPath: ['hallucination', 'tierOverrides', 'frontier', 'novelRatioThreshold'],
                tier: 'advanced',
            },
            {
                key: 'frontier_largeNumberThreshold',
                label: 'Large Number Threshold',
                description: 'Numbers above this are flagged if not in parents. Higher for frontier — these models use project-context numbers legitimately.',
                min: 10, max: 10000, step: 10, default: 1000,
                configPath: ['hallucination', 'tierOverrides', 'frontier', 'largeNumberThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Permissive (default)', intent: 'Relaxed detection for frontier models that reason well' },
            { label: 'Moderate', intent: 'Slightly stricter for frontier models that still hallucinate sometimes' },
        ],
    },

    medium_voicing: {
        id: 'medium_voicing',
        tier: 'advanced',
        title: 'Medium Tier — Voicing Gates',
        description: 'Voicing quality gate overrides for medium-tier models.',
        behavior: 'When a medium-tier model handles voicing, these values override the global voicing constraints.',
        parameters: [
            {
                key: 'medium_minNovelWords',
                label: 'Min Novel Words',
                description: 'Minimum novel words required. Higher for medium tier — weaker models that just rearrange parent words should be caught.',
                min: 1, max: 10, step: 1, default: 3,
                configPath: ['voicing', 'tierOverrides', 'medium', 'minNovelWords'],
                tier: 'advanced',
            },
        ],
        presets: [],
    },

    frontier_voicing: {
        id: 'frontier_voicing',
        tier: 'advanced',
        title: 'Frontier Tier — Voicing Gates',
        description: 'Voicing quality gate overrides for frontier-tier models.',
        behavior: 'When a frontier model handles voicing, these values override the global voicing constraints. Frontier models produce tight, precise synthesis that may deliberately reuse parent vocabulary.',
        parameters: [
            {
                key: 'frontier_minNovelWords',
                label: 'Min Novel Words',
                description: 'Minimum novel words required. Lower for frontier — these models may produce precise synthesis that deliberately reuses parent vocabulary.',
                min: 1, max: 10, step: 1, default: 2,
                configPath: ['voicing', 'tierOverrides', 'frontier', 'minNovelWords'],
                tier: 'advanced',
            },
        ],
        presets: [],
    },
};
