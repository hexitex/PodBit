/**
 * @module config-sections/subsystem-params
 *
 * Config section metadata for primary model inference parameters per
 * subsystem. Controls temperature, repeat penalty, top_p, min_p, and
 * top_k for every subsystem's LLM calls.
 *
 * Parameters are generated from SUBSYSTEM_REGISTRY rather than
 * hand-written per subsystem. Dynamic lab:* subsystems are injected
 * at runtime via augmentWithLabSubsystems().
 *
 * Sections: subsystem_temperatures, subsystem_repeat_penalties,
 * subsystem_top_p, subsystem_min_p, subsystem_top_k
 */

import type { SectionMeta, ParameterMeta, SectionTier } from './types.js';

// ── Subsystem display registry ───────────────────────────────────────────────
// Every subsystem that should have inference parameter controls in the GUI.
// 'profile' selects sensible defaults: 'creative' for open-ended generation,
// 'deterministic' for scoring/judging/routing, 'moderate' for extraction.

type ParamProfile = 'creative' | 'moderate' | 'deterministic';

interface SubsystemEntry {
    /** Human-readable label for the GUI. */
    label: string;
    /** Short description prefix used in parameter tooltips. */
    desc: string;
    /** Default inference parameter profile. */
    profile: ParamProfile;
    /** Section tier for progressive disclosure. */
    tier: SectionTier;
}

/**
 * Registry of all subsystems with GUI-visible inference parameters.
 * Embedding is excluded (not an LLM subsystem).
 * Order here determines display order in the GUI.
 */
const SUBSYSTEM_REGISTRY: Record<string, SubsystemEntry> = {
    // ── Core creative subsystems ─────────────────────────────────────────────
    voice:              { label: 'Voice',              desc: 'synthesis voicing',                     profile: 'creative',       tier: 'basic' },
    chat:               { label: 'Chat',               desc: 'GUI Chat and MCP chat responses',       profile: 'creative',       tier: 'basic' },
    synthesis:          { label: 'Synthesis',           desc: 'insight synthesis pairing',              profile: 'creative',       tier: 'basic' },
    research:           { label: 'Research',            desc: 'autonomous domain research',             profile: 'creative',       tier: 'intermediate' },
    docs:               { label: 'Docs',               desc: 'scaffold/docs document generation',      profile: 'creative',       tier: 'intermediate' },
    proxy:              { label: 'Proxy',              desc: 'knowledge proxy enrichment',             profile: 'creative',       tier: 'intermediate' },
    image_gen:          { label: 'Image Gen',          desc: 'image generation prompts',               profile: 'creative',       tier: 'intermediate' },

    // ── Extraction / moderate subsystems ──────────────────────────────────────
    compress:           { label: 'Compress',           desc: 'compress, summarize, and domain digests', profile: 'moderate',      tier: 'intermediate' },
    context:            { label: 'Context',            desc: 'context engine history compression',      profile: 'moderate',      tier: 'intermediate' },
    keyword:            { label: 'Keyword',            desc: 'keyword extraction and domain synonyms',  profile: 'moderate',      tier: 'intermediate' },
    elite_mapping:      { label: 'Elite Mapping',      desc: 'elite pool content synthesis and manifest mapping', profile: 'moderate', tier: 'intermediate' },
    evm_analysis:       { label: 'EVM Analysis',       desc: 'post-rejection investigation analysis',   profile: 'moderate',      tier: 'intermediate' },
    evm_guidance:       { label: 'EVM Guidance',       desc: 'experiment guidance and feedback',         profile: 'moderate',      tier: 'intermediate' },
    config_tune:        { label: 'Config Tune',        desc: 'config tuning suggestions',               profile: 'moderate',      tier: 'advanced' },

    // ── Deterministic / scoring subsystems ────────────────────────────────────
    autorating:         { label: 'Autorating',         desc: 'quality autorating',                      profile: 'deterministic', tier: 'intermediate' },
    spec_extraction:    { label: 'Spec Extraction',    desc: 'experiment spec extraction from claims',   profile: 'deterministic', tier: 'intermediate' },
    spec_review:        { label: 'Spec Review',        desc: 'adversarial falsifiability review',        profile: 'deterministic', tier: 'intermediate' },
    content_spec:       { label: 'Content Spec',       desc: 'post-synthesis structural coherence extraction (mechanism / prediction / falsifiability / novelty)', profile: 'deterministic', tier: 'intermediate' },
    api_verification:   { label: 'API Verification',   desc: 'API verification decisions',               profile: 'deterministic', tier: 'intermediate' },
    breakthrough_check: { label: 'Breakthrough Check', desc: 'breakthrough validation scoring',          profile: 'deterministic', tier: 'intermediate' },
    ground_rules:       { label: 'Ground Rules',       desc: 'ground truth rule extraction',             profile: 'deterministic', tier: 'advanced' },
    population_control: { label: 'Population Control', desc: 'population control decisions',             profile: 'deterministic', tier: 'advanced' },
    lab_routing:        { label: 'Lab Routing',        desc: 'LLM-based lab selection',                  profile: 'deterministic', tier: 'advanced' },
    dedup_judge:        { label: 'Dedup Judge',        desc: 'dedup judgment decisions',                  profile: 'deterministic', tier: 'advanced' },
    tuning_judge:       { label: 'Tuning Judge',       desc: 'tuning quality judgment',                   profile: 'deterministic', tier: 'advanced' },

    // ── KB readers ───────────────────────────────────────────────────────────
    reader_text:        { label: 'Text Reader',        desc: 'text file ingestion',                     profile: 'moderate',      tier: 'intermediate' },
    reader_pdf:         { label: 'PDF Reader',         desc: 'PDF extraction',                           profile: 'moderate',      tier: 'intermediate' },
    reader_doc:         { label: 'Doc Reader',         desc: '.docx/.odt document processing',           profile: 'moderate',      tier: 'intermediate' },
    reader_image:       { label: 'Image Reader',       desc: 'vision model image descriptions',          profile: 'moderate',      tier: 'intermediate' },
    reader_sheet:       { label: 'Sheet Reader',       desc: 'spreadsheet processing',                   profile: 'moderate',      tier: 'intermediate' },
    reader_code:        { label: 'Code Reader',        desc: 'source code analysis',                     profile: 'moderate',      tier: 'intermediate' },
};

// ── Profile defaults ─────────────────────────────────────────────────────────

const PROFILE_DEFAULTS: Record<ParamProfile, { temp: number; repeat: number; topP: number; minP: number; topK: number }> = {
    creative:       { temp: 0.7, repeat: 1.0, topP: 0.9, minP: 0.05, topK: 40 },
    moderate:       { temp: 0.3, repeat: 1.0, topP: 0.9, minP: 0.05, topK: 40 },
    deterministic:  { temp: 0.15, repeat: 1.0, topP: 0.9, minP: 0.0,  topK: 0 },
};

// Per-subsystem overrides where the profile default isn't quite right.
// Only list subsystems that deviate from their profile.
const TEMP_OVERRIDES: Record<string, number> = {
    spec_extraction: 0.1, breakthrough_check: 0.2, ground_rules: 0.1,
    api_verification: 0.2, reader_image: 0.4,
};
const REPEAT_OVERRIDES: Record<string, number> = {
    reader_image: 1.2,
};
const TOP_P_OVERRIDES: Record<string, number> = {
    reader_code: 0.75, compress: 0.8, context: 1,
    reader_pdf: 1, reader_doc: 1, reader_text: 1, reader_sheet: 1,
};
const MIN_P_OVERRIDES: Record<string, number> = {
    reader_code: 0.08, compress: 0, keyword: 0, context: 0,
    autorating: 0, reader_pdf: 0, reader_doc: 0, reader_text: 0, reader_sheet: 0,
};
const TOP_K_OVERRIDES: Record<string, number> = {
    reader_code: 20, compress: 0, keyword: 0, context: 0,
    autorating: 0, reader_pdf: 0, reader_doc: 0, reader_text: 0, reader_sheet: 0,
};

// ── Camel-case key helpers ───────────────────────────────────────────────────

/** Convert snake_case subsystem ID to camelCase for use as parameter key prefix. */
function toCamelCase(s: string): string {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// ── Parameter generators ─────────────────────────────────────────────────────

function makeTemperatureParam(sub: string, entry: SubsystemEntry): ParameterMeta {
    const def = TEMP_OVERRIDES[sub] ?? PROFILE_DEFAULTS[entry.profile].temp;
    return {
        key: `${toCamelCase(sub)}Temp`,
        label: `${entry.label} Temperature`,
        description: `Temperature for ${entry.desc}. Slide right = more creative/varied. Slide left = more deterministic/focused.`,
        min: 0.0, max: 1.0, step: 0.1, default: def,
        configPath: ['subsystemTemperatures', sub],
        tier: entry.tier,
    };
}

function makeRepeatParam(sub: string, entry: SubsystemEntry): ParameterMeta {
    const def = REPEAT_OVERRIDES[sub] ?? PROFILE_DEFAULTS[entry.profile].repeat;
    return {
        key: `${toCamelCase(sub)}Repeat`,
        label: `${entry.label} Repeat Penalty`,
        description: `Repeat penalty for ${entry.desc}. Increase if output stutters or contains repeated phrases.`,
        min: 1.0, max: 2.0, step: 0.1, default: def,
        configPath: ['subsystemRepeatPenalties', sub],
        tier: entry.tier,
    };
}

function makeTopPParam(sub: string, entry: SubsystemEntry): ParameterMeta {
    const def = TOP_P_OVERRIDES[sub] ?? PROFILE_DEFAULTS[entry.profile].topP;
    return {
        key: `${toCamelCase(sub)}TopP`,
        label: `${entry.label} Top P`,
        description: `Nucleus sampling for ${entry.desc}. Slide right = wider token pool. Slide left = restricts to high-confidence tokens.`,
        min: 0.0, max: 1.0, step: 0.05, default: def,
        configPath: ['subsystemTopP', sub],
        tier: 'advanced',
    };
}

function makeMinPParam(sub: string, entry: SubsystemEntry): ParameterMeta {
    const def = MIN_P_OVERRIDES[sub] ?? PROFILE_DEFAULTS[entry.profile].minP;
    return {
        key: `${toCamelCase(sub)}MinP`,
        label: `${entry.label} Min P`,
        description: `Min probability filter for ${entry.desc}. Slide right = cuts low-probability tokens. 0 = disabled.`,
        min: 0.0, max: 0.5, step: 0.01, default: def,
        configPath: ['subsystemMinP', sub],
        tier: 'advanced',
    };
}

function makeTopKParam(sub: string, entry: SubsystemEntry): ParameterMeta {
    const def = TOP_K_OVERRIDES[sub] ?? PROFILE_DEFAULTS[entry.profile].topK;
    return {
        key: `${toCamelCase(sub)}TopK`,
        label: `${entry.label} Top K`,
        description: `Top-k token limit for ${entry.desc}. Slide right = more token choices. 0 = disabled.`,
        min: 0, max: 100, step: 5, default: def,
        configPath: ['subsystemTopK', sub],
        tier: 'advanced',
    };
}

// ── Build sections from registry ─────────────────────────────────────────────

const entries = Object.entries(SUBSYSTEM_REGISTRY);

/** Primary model inference parameter section definitions. */
export const SUBSYSTEM_PARAM_SECTIONS: Record<string, SectionMeta> = {

    subsystem_temperatures: {
        id: 'subsystem_temperatures',
        tier: 'basic',
        title: 'Subsystem Temperatures',
        description: 'Controls LLM creativity/determinism per subsystem',
        behavior: `Each subsystem uses a default temperature when calling its assigned model. Lower temperatures (0.1-0.3) produce more deterministic, focused output - ideal for compression and scoring tasks. Higher temperatures (0.5-0.9) produce more creative, varied output - ideal for synthesis voicing and chat. Individual callers can still override these defaults when needed. Temperature is only sent to the model when set here or by the caller - if neither specifies, the model uses its own default.`,
        parameters: entries.map(([sub, e]) => makeTemperatureParam(sub, e)),
        presets: [
            { label: 'Creative', intent: 'Set all subsystem temperatures high (0.9) for maximum creativity and variation in output' },
            { label: 'Balanced', intent: 'Reset to balanced defaults: creative subsystems at 0.7, deterministic at 0.15, moderate at 0.3' },
            { label: 'Deterministic', intent: 'Set all subsystem temperatures low (0.15) for maximum consistency and reproducibility' },
        ],
    },

    subsystem_repeat_penalties: {
        id: 'subsystem_repeat_penalties',
        tier: 'basic',
        title: 'Repeat Penalties',
        description: 'Controls repetition suppression per subsystem. Higher values penalize repeated tokens more aggressively. Useful for vision models that stutter.',
        behavior: 'Some models (especially local vision models) produce duplicated/stuttered text. A repeat penalty discourages the model from repeating tokens it has already generated. Sent as frequency_penalty to OpenAI-compatible APIs and repeat_penalty to Ollama. Values range from 1.0 (no penalty) to 2.0 (aggressive suppression).',
        parameters: entries.map(([sub, e]) => makeRepeatParam(sub, e)),
        presets: [
            { label: 'Off', intent: 'Disable all repeat penalties (set to 1.0). Use when models generate clean output.' },
            { label: 'Image Fix', intent: 'Set image reader penalty to 1.3 for anti-stutter. Leave others at 1.0.' },
            { label: 'Aggressive', intent: 'Set all repeat penalties to 1.5 for maximum repetition suppression.' },
        ],
    },

    subsystem_top_p: {
        id: 'subsystem_top_p',
        tier: 'advanced',
        title: 'Top P (Nucleus Sampling)',
        description: 'Controls nucleus sampling threshold per subsystem. Only tokens within the top cumulative probability P are considered.',
        behavior: 'Top-p (nucleus) sampling limits the model to tokens whose cumulative probability mass reaches the threshold. Lower values (0.5-0.7) restrict the model to high-confidence tokens - more focused output. Higher values (0.9-1.0) allow more diverse token choices. Empty values use the model default. Works alongside temperature: temperature controls randomness within the allowed set, top_p controls the size of the allowed set.',
        parameters: entries.map(([sub, e]) => makeTopPParam(sub, e)),
        presets: [
            { label: 'Focused', intent: 'Set all top_p values to 0.7 for focused, high-confidence output' },
            { label: 'Default', intent: 'Reset all top_p values to 0.9 (standard nucleus sampling)' },
            { label: 'Wide', intent: 'Set all top_p values to 1.0 to allow full token diversity' },
        ],
    },

    subsystem_min_p: {
        id: 'subsystem_min_p',
        tier: 'advanced',
        title: 'Min P (Minimum Probability)',
        description: 'Filters out tokens below a minimum probability relative to the top token. Effective alternative to top_k for quality control.',
        behavior: 'Min-p filtering removes tokens whose probability is less than min_p times the probability of the most likely token. For example, min_p=0.1 means any token less than 10% as likely as the top token is excluded. Higher values (0.1-0.3) produce more focused output. Lower values (0.01-0.05) allow more diversity. Set to 0 to disable. Supported by LM Studio and Ollama; ignored by cloud APIs that don\'t support it.',
        parameters: entries.map(([sub, e]) => makeMinPParam(sub, e)),
        presets: [
            { label: 'Off', intent: 'Disable min_p filtering (set all to 0)' },
            { label: 'Gentle', intent: 'Set all min_p values to 0.05 for gentle low-probability filtering' },
            { label: 'Strict', intent: 'Set all min_p values to 0.15 for strict probability filtering' },
        ],
    },

    subsystem_top_k: {
        id: 'subsystem_top_k',
        tier: 'advanced',
        title: 'Top K Sampling',
        description: 'Limits token selection to the K most likely tokens. Hard cutoff alternative to nucleus sampling.',
        behavior: 'Top-k sampling restricts the model to only the K most likely next tokens before sampling. Lower values (10-20) produce more focused, predictable output. Higher values (40-100) allow more diversity. Set to 0 to disable (no top-k filtering). Supported by LM Studio and Ollama. Most cloud APIs (OpenAI, Anthropic) do not support top_k - the parameter will be sent but may be ignored.',
        parameters: entries.map(([sub, e]) => makeTopKParam(sub, e)),
        presets: [
            { label: 'Off', intent: 'Disable top-k filtering (set all to 0)' },
            { label: 'Default', intent: 'Set all top_k values to 40 (standard top-k sampling)' },
            { label: 'Focused', intent: 'Set all top_k values to 15 for highly focused output' },
        ],
    },
};

// ── Dynamic lab subsystem injection ──────────────────────────────────────────

/** Info about a lab subsystem, used for generating GUI parameter entries. */
export interface LabSubsystemInfo {
    /** Subsystem key, e.g. "lab:math-lab" */
    subsystem: string;
    /** Human-readable display name from the lab registry, e.g. "Math Lab" */
    displayName: string;
}

/**
 * Create a SubsystemEntry for a dynamic lab:* subsystem.
 * Labs default to 'moderate' profile (structured codegen/eval output).
 */
function labEntry(displayName: string): SubsystemEntry {
    return {
        label: displayName,
        desc: `${displayName} lab`,
        profile: 'moderate',
        tier: 'intermediate',
    };
}

/**
 * Augment SUBSYSTEM_PARAM_SECTIONS with dynamic lab:* subsystems.
 * Called by the /config/sections endpoint after discovering lab subsystems
 * from the assignment cache and looking up their display names from the
 * lab registry.
 *
 * Returns a new record (does not mutate SUBSYSTEM_PARAM_SECTIONS).
 */
export function augmentWithLabSubsystems(
    baseSections: Record<string, SectionMeta>,
    labs: LabSubsystemInfo[],
): Record<string, SectionMeta> {
    if (labs.length === 0) return baseSections;

    const result: Record<string, SectionMeta> = {};
    for (const [id, section] of Object.entries(baseSections)) {
        // Only augment the 5 subsystem param sections
        if (!id.startsWith('subsystem_')) {
            result[id] = section;
            continue;
        }

        const extraParams: ParameterMeta[] = [];
        for (const lab of labs) {
            const entry = labEntry(lab.displayName);
            switch (id) {
                case 'subsystem_temperatures':    extraParams.push(makeTemperatureParam(lab.subsystem, entry)); break;
                case 'subsystem_repeat_penalties': extraParams.push(makeRepeatParam(lab.subsystem, entry)); break;
                case 'subsystem_top_p':           extraParams.push(makeTopPParam(lab.subsystem, entry)); break;
                case 'subsystem_min_p':           extraParams.push(makeMinPParam(lab.subsystem, entry)); break;
                case 'subsystem_top_k':           extraParams.push(makeTopKParam(lab.subsystem, entry)); break;
            }
        }

        result[id] = {
            ...section,
            parameters: [...section.parameters, ...extraParams],
        };
    }

    return result;
}
