/**
 * @module config-sections/consultant-params
 *
 * Config section metadata for consultant model inference parameters.
 * These control temperature, repeat penalty, top_p, min_p, and top_k
 * for consultant (secondary reviewer) model calls, independent from
 * the primary subsystem model parameters.
 *
 * Sections: consultant_temperatures, consultant_repeat_penalties,
 * consultant_top_p, consultant_min_p, consultant_top_k
 */

import type { SectionMeta } from './types.js';

/** Consultant model inference parameter section definitions. */
export const CONSULTANT_PARAM_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // 15a. Consultant Temperatures (per-subsystem)
    // -------------------------------------------------------------------------
    consultant_temperatures: {
        id: 'consultant_temperatures',
        tier: 'advanced',
        title: 'Consultant Temperatures',
        description: 'Controls LLM temperature for consultant model calls. Separate from primary model params.',
        behavior: 'Consultant models review primary model output for quality gating. They typically need low temperature for deterministic, consistent scoring. Each subsystem with consultant support has its own temperature. Default 0.15 for reliable review scoring.',
        parameters: [
            { key: 'cVoiceTemp', label: 'Voice Consultant', description: 'Temperature for voice synthesis consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'voice'], tier: 'advanced' },
            { key: 'cSynthesisTemp', label: 'Synthesis Consultant', description: 'Temperature for synthesis consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'synthesis'], tier: 'advanced' },
            { key: 'cDedupTemp', label: 'Dedup Judge Consultant', description: 'Temperature for dedup judgment consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'dedup_judge'], tier: 'advanced' },
            { key: 'cResearchTemp', label: 'Research Consultant', description: 'Temperature for research seed consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'research'], tier: 'advanced' },
            { key: 'cSpecExtractionTemp', label: 'Spec Extraction Consultant', description: 'Temperature for experiment spec extraction consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.1, configPath: ['consultantTemperatures', 'spec_extraction'], tier: 'advanced' },
            { key: 'cConfigTuneTemp', label: 'Config Tune Consultant', description: 'Temperature for config tune consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'config_tune'], tier: 'advanced' },
            { key: 'cTuningJudgeTemp', label: 'Tuning Judge Consultant', description: 'Temperature for tuning judge consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.15, configPath: ['consultantTemperatures', 'tuning_judge'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Deterministic', intent: 'Set all consultant temperatures to 0.1 for maximum scoring consistency' },
            { label: 'Default', intent: 'Set all consultant temperatures to 0.15 (standard review temperature)' },
            { label: 'Moderate', intent: 'Set all consultant temperatures to 0.3 for slightly more varied review output' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15b. Consultant Repeat Penalties (per-subsystem)
    // -------------------------------------------------------------------------
    consultant_repeat_penalties: {
        id: 'consultant_repeat_penalties',
        tier: 'advanced',
        title: 'Consultant Repeat Penalties',
        description: 'Controls repetition suppression for consultant model calls.',
        behavior: 'Repeat penalty for consultant models. Usually not needed since consultant reviews are short structured outputs. Increase if consultant output contains repeated phrases.',
        parameters: [
            { key: 'cVoiceRepeat', label: 'Voice Consultant', description: 'Repeat penalty for voice consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'voice'], tier: 'advanced' },
            { key: 'cSynthesisRepeat', label: 'Synthesis Consultant', description: 'Repeat penalty for synthesis consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'synthesis'], tier: 'advanced' },
            { key: 'cDedupRepeat', label: 'Dedup Judge Consultant', description: 'Repeat penalty for dedup consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'dedup_judge'], tier: 'advanced' },
            { key: 'cResearchRepeat', label: 'Research Consultant', description: 'Repeat penalty for research consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'research'], tier: 'advanced' },
            { key: 'cSpecExtractionRepeat', label: 'Spec Extraction Consultant', description: 'Repeat penalty for spec extraction consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'spec_extraction'], tier: 'advanced' },
            { key: 'cConfigTuneRepeat', label: 'Config Tune Consultant', description: 'Repeat penalty for config tune consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'config_tune'], tier: 'advanced' },
            { key: 'cTuningJudgeRepeat', label: 'Tuning Judge Consultant', description: 'Repeat penalty for tuning judge consultant.', min: 1.0, max: 2.0, step: 0.1, default: 1.0, configPath: ['consultantRepeatPenalties', 'tuning_judge'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Off', intent: 'Disable all consultant repeat penalties (set to 1.0)' },
            { label: 'Moderate', intent: 'Set all consultant repeat penalties to 1.3' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15c. Consultant Top P (per-subsystem nucleus sampling)
    // -------------------------------------------------------------------------
    consultant_top_p: {
        id: 'consultant_top_p',
        tier: 'advanced',
        title: 'Consultant Top P',
        description: 'Controls nucleus sampling threshold for consultant model calls.',
        behavior: 'Top-p (nucleus) sampling for consultant models. Lower values restrict to high-confidence tokens for more deterministic review scoring. Higher values allow more diversity. Default 0.9. Independent from primary model top_p.',
        parameters: [
            { key: 'cVoiceTopP', label: 'Voice Consultant', description: 'Top-p for voice consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'voice'], tier: 'advanced' },
            { key: 'cSynthesisTopP', label: 'Synthesis Consultant', description: 'Top-p for synthesis consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'synthesis'], tier: 'advanced' },
            { key: 'cDedupTopP', label: 'Dedup Judge Consultant', description: 'Top-p for dedup judgment consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'dedup_judge'], tier: 'advanced' },
            { key: 'cResearchTopP', label: 'Research Consultant', description: 'Top-p for research consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'research'], tier: 'advanced' },
            { key: 'cSpecExtractionTopP', label: 'Spec Extraction Consultant', description: 'Top-p for spec extraction consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'spec_extraction'], tier: 'advanced' },
            { key: 'cConfigTuneTopP', label: 'Config Tune Consultant', description: 'Top-p for config tune consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'config_tune'], tier: 'advanced' },
            { key: 'cTuningJudgeTopP', label: 'Tuning Judge Consultant', description: 'Top-p for tuning judge consultant review.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['consultantTopP', 'tuning_judge'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Focused', intent: 'Set all consultant top_p values to 0.7 for focused, high-confidence review output' },
            { label: 'Default', intent: 'Reset all consultant top_p values to 0.9 (standard nucleus sampling)' },
            { label: 'Wide', intent: 'Set all consultant top_p values to 1.0 for full token diversity' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15d. Consultant Min P (per-subsystem minimum probability filtering)
    // -------------------------------------------------------------------------
    consultant_min_p: {
        id: 'consultant_min_p',
        tier: 'advanced',
        title: 'Consultant Min P',
        description: 'Minimum probability filtering for consultant model calls.',
        behavior: 'Min-p filtering for consultant models. Removes tokens whose probability is less than min_p times the top token probability. Higher values produce more focused review output. Set to 0 to disable. Independent from primary model min_p. Supported by LM Studio and Ollama.',
        parameters: [
            { key: 'cVoiceMinP', label: 'Voice Consultant', description: 'Min-p filter for voice consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'voice'], tier: 'advanced' },
            { key: 'cSynthesisMinP', label: 'Synthesis Consultant', description: 'Min-p filter for synthesis consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'synthesis'], tier: 'advanced' },
            { key: 'cDedupMinP', label: 'Dedup Judge Consultant', description: 'Min-p filter for dedup consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'dedup_judge'], tier: 'advanced' },
            { key: 'cResearchMinP', label: 'Research Consultant', description: 'Min-p filter for research consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'research'], tier: 'advanced' },
            { key: 'cSpecExtractionMinP', label: 'Spec Extraction Consultant', description: 'Min-p filter for spec extraction consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'spec_extraction'], tier: 'advanced' },
            { key: 'cConfigTuneMinP', label: 'Config Tune Consultant', description: 'Min-p filter for config tune consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'config_tune'], tier: 'advanced' },
            { key: 'cTuningJudgeMinP', label: 'Tuning Judge Consultant', description: 'Min-p filter for tuning judge consultant review.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['consultantMinP', 'tuning_judge'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Off', intent: 'Disable consultant min_p filtering (set all to 0)' },
            { label: 'Gentle', intent: 'Set all consultant min_p values to 0.05 for gentle filtering' },
            { label: 'Strict', intent: 'Set all consultant min_p values to 0.15 for strict filtering' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15e. Consultant Top K (per-subsystem top-k sampling)
    // -------------------------------------------------------------------------
    consultant_top_k: {
        id: 'consultant_top_k',
        tier: 'advanced',
        title: 'Consultant Top K',
        description: 'Top-k sampling limit for consultant model calls.',
        behavior: 'Top-k sampling for consultant models. Restricts to the K most likely tokens before sampling. Lower values produce more focused review output. Set to 0 to disable. Independent from primary model top_k. Supported by LM Studio and Ollama; most cloud APIs ignore this parameter.',
        parameters: [
            { key: 'cVoiceTopK', label: 'Voice Consultant', description: 'Top-k for voice consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'voice'], tier: 'advanced' },
            { key: 'cSynthesisTopK', label: 'Synthesis Consultant', description: 'Top-k for synthesis consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'synthesis'], tier: 'advanced' },
            { key: 'cDedupTopK', label: 'Dedup Judge Consultant', description: 'Top-k for dedup consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'dedup_judge'], tier: 'advanced' },
            { key: 'cResearchTopK', label: 'Research Consultant', description: 'Top-k for research consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'research'], tier: 'advanced' },
            { key: 'cSpecExtractionTopK', label: 'Spec Extraction Consultant', description: 'Top-k for spec extraction consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'spec_extraction'], tier: 'advanced' },
            { key: 'cConfigTuneTopK', label: 'Config Tune Consultant', description: 'Top-k for config tune consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'config_tune'], tier: 'advanced' },
            { key: 'cTuningJudgeTopK', label: 'Tuning Judge Consultant', description: 'Top-k for tuning judge consultant review. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['consultantTopK', 'tuning_judge'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Off', intent: 'Disable consultant top-k filtering (set all to 0)' },
            { label: 'Default', intent: 'Set all consultant top_k values to 40 (standard sampling)' },
            { label: 'Focused', intent: 'Set all consultant top_k values to 15 for highly focused review output' },
        ],
    },
};
