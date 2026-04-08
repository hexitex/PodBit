/**
 * @module config-sections/subsystem-params
 *
 * Config section metadata for primary model inference parameters per
 * subsystem. Controls temperature, repeat penalty, top_p, min_p, and
 * top_k for each subsystem's LLM calls (voice, chat, compress, proxy,
 * research, context, docs, keyword, autorating, api_verification, and
 * all KB reader subsystems).
 *
 * Sections: subsystem_temperatures, subsystem_repeat_penalties,
 * subsystem_top_p, subsystem_min_p, subsystem_top_k
 */

import type { SectionMeta } from './types.js';

/** Primary model inference parameter section definitions. */
export const SUBSYSTEM_PARAM_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // 10. Subsystem Temperatures (6 params)
    // -------------------------------------------------------------------------
    subsystem_temperatures: {
        id: 'subsystem_temperatures',
        tier: 'basic',
        title: 'Subsystem Temperatures',
        description: 'Controls LLM creativity/determinism per subsystem',
        behavior: `Each subsystem uses a default temperature when calling its assigned model. Lower temperatures (0.1-0.3) produce more deterministic, focused output — ideal for compression and context tasks. Higher temperatures (0.5-0.9) produce more creative, varied output — ideal for synthesis voicing and chat. Individual callers can still override these defaults when needed. Temperature is only sent to the model when set here or by the caller — if neither specifies, the model uses its own default.`,
        parameters: [
            {
                key: 'voiceTemp',
                label: 'Voice Temperature',
                description: 'Temperature for synthesis voicing. Slide right → more creative, varied, surprising connections. Slide left → more predictable, consistent, focused output.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.7,
                configPath: ['subsystemTemperatures', 'voice'],
                tier: 'basic',
            },
            {
                key: 'chatTemp',
                label: 'Chat Temperature',
                description: 'Temperature for GUI Chat and MCP chat responses. Slide right → more creative, varied replies. Slide left → more deterministic, consistent answers.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.7,
                configPath: ['subsystemTemperatures', 'chat'],
                tier: 'basic',
            },
            {
                key: 'compressTemp',
                label: 'Compress Temperature',
                description: 'Temperature for compress, summarize, and domain digests. Slide right → more varied summaries. Slide left → more faithful, reproducible compression of source material.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'compress'],
                tier: 'intermediate',
            },
            {
                key: 'proxyTemp',
                label: 'Proxy Temperature',
                description: 'Temperature for the knowledge proxy enrichment. Slide right → more creative knowledge integration. Slide left → more faithful, deterministic enrichment.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.7,
                configPath: ['subsystemTemperatures', 'proxy'],
                tier: 'intermediate',
            },
            {
                key: 'researchTemp',
                label: 'Research Temperature',
                description: 'Temperature for autonomous domain research. Slide right → more creative, diverse seed generation. Slide left → more conservative, focused research output.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.7,
                configPath: ['subsystemTemperatures', 'research'],
                tier: 'intermediate',
            },
            {
                key: 'contextTemp',
                label: 'Context Temperature',
                description: 'Temperature for context engine history compression and formatting. Slide right → more varied compression. Slide left → more faithful, reproducible context summaries.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'context'],
                tier: 'intermediate',
            },
            {
                key: 'docsTemp',
                label: 'Docs Temperature',
                description: 'Temperature for scaffold/docs document generation. Slide right → more creative document output. Slide left → more structured, deterministic documents.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.7,
                configPath: ['subsystemTemperatures', 'docs'],
                tier: 'intermediate',
            },
            {
                key: 'keywordTemp',
                label: 'Keyword Temperature',
                description: 'Temperature for keyword extraction and domain synonym generation. Slide right → more creative synonyms. Slide left → more precise, conservative keyword matching.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'keyword'],
                tier: 'intermediate',
            },
            {
                key: 'autoratingTemp',
                label: 'Autorating Temperature',
                description: 'Temperature for quality autorating. Slide right → more varied judgments (risk of inconsistency). Slide left → more deterministic, consistent ratings.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'autorating'],
                tier: 'intermediate',
            },
            {
                key: 'apiVerificationTemp',
                label: 'API Verification Temperature',
                description: 'Temperature for API verification decisions and interpretation. Slide right → more creative query formulation. Slide left → more precise, deterministic API interactions.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.2,
                configPath: ['subsystemTemperatures', 'api_verification'],
                tier: 'intermediate',
            },
            {
                key: 'readerTextTemp',
                label: 'Text Reader Temperature',
                description: 'Temperature for text file ingestion. Slide right → more interpretive summarization. Slide left → more faithful extraction of source text.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_text'],
                tier: 'intermediate',
            },
            {
                key: 'readerPdfTemp',
                label: 'PDF Reader Temperature',
                description: 'Temperature for PDF extraction. Slide right → more interpretive. Slide left → more faithful to source PDF content.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_pdf'],
                tier: 'intermediate',
            },
            {
                key: 'readerDocTemp',
                label: 'Doc Reader Temperature',
                description: 'Temperature for .docx/.odt document processing. Slide right → more interpretive. Slide left → more faithful extraction.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_doc'],
                tier: 'intermediate',
            },
            {
                key: 'readerImageTemp',
                label: 'Image Reader Temperature',
                description: 'Temperature for vision model image descriptions. Slide right → more creative/descriptive but risk of hallucinated details. Slide left → more factual, sticks to what is clearly visible.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_image'],
                tier: 'intermediate',
            },
            {
                key: 'readerSheetTemp',
                label: 'Sheet Reader Temperature',
                description: 'Temperature for spreadsheet processing. Slide right → more interpretive summaries. Slide left → more precise, data-faithful extraction.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_sheet'],
                tier: 'intermediate',
            },
            {
                key: 'readerCodeTemp',
                label: 'Code Reader Temperature',
                description: 'Temperature for source code analysis. Slide right → more interpretive code summaries. Slide left → more precise, literal code extraction.',
                min: 0.0, max: 1.0, step: 0.1, default: 0.3,
                configPath: ['subsystemTemperatures', 'reader_code'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Creative', intent: 'Set all subsystem temperatures high (0.9) for maximum creativity and variation in output' },
            { label: 'Balanced', intent: 'Reset to balanced defaults: creative subsystems at 0.7, deterministic at 0.3' },
            { label: 'Deterministic', intent: 'Set all subsystem temperatures low (0.3) for maximum consistency and reproducibility' },
        ],
    },

    // -------------------------------------------------------------------------
    // 11. Repeat Penalties (per-subsystem)
    // -------------------------------------------------------------------------
    subsystem_repeat_penalties: {
        id: 'subsystem_repeat_penalties',
        tier: 'basic',
        title: 'Repeat Penalties',
        description: 'Controls repetition suppression per subsystem. Higher values penalize repeated tokens more aggressively. Useful for vision models that stutter.',
        behavior: 'Some models (especially local vision models) produce duplicated/stuttered text. A repeat penalty discourages the model from repeating tokens it has already generated. Sent as frequency_penalty to OpenAI-compatible APIs and repeat_penalty to Ollama. Values range from 1.0 (no penalty) to 2.0 (aggressive suppression).',
        parameters: [
            {
                key: 'readerTextRepeat',
                label: 'Text Reader Repeat Penalty',
                description: 'Repeat penalty for text file ingestion. Increase if text reader output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'reader_text'],
                tier: 'intermediate',
            },
            {
                key: 'readerPdfRepeat',
                label: 'PDF Reader Repeat Penalty',
                description: 'Repeat penalty for PDF extraction. Increase if PDF reader output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'reader_pdf'],
                tier: 'intermediate',
            },
            {
                key: 'readerDocRepeat',
                label: 'Doc Reader Repeat Penalty',
                description: 'Repeat penalty for document processing. Increase if doc reader output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'reader_doc'],
                tier: 'intermediate',
            },
            {
                key: 'readerImageRepeat',
                label: 'Image Reader Repeat Penalty',
                description: 'Repeat penalty for vision model image descriptions. 1.0 = no penalty, 1.3-1.5 = moderate, 2.0 = aggressive. Fixes word stuttering in image descriptions.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.3,
                configPath: ['subsystemRepeatPenalties', 'reader_image'],
                tier: 'intermediate',
            },
            {
                key: 'readerSheetRepeat',
                label: 'Sheet Reader Repeat Penalty',
                description: 'Repeat penalty for spreadsheet processing. Increase if sheet reader output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'reader_sheet'],
                tier: 'intermediate',
            },
            {
                key: 'readerCodeRepeat',
                label: 'Code Reader Repeat Penalty',
                description: 'Repeat penalty for source code processing. Increase if code reader output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'reader_code'],
                tier: 'intermediate',
            },
            {
                key: 'voiceRepeat',
                label: 'Voice Repeat Penalty',
                description: 'Repeat penalty for synthesis voicing. Usually not needed — increase if voicing output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'voice'],
                tier: 'intermediate',
            },
            {
                key: 'proxyRepeat',
                label: 'Proxy Repeat Penalty',
                description: 'Repeat penalty for knowledge proxy. Increase if proxy enrichment output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'proxy'],
                tier: 'intermediate',
            },
            {
                key: 'chatRepeat',
                label: 'Chat Repeat Penalty',
                description: 'Repeat penalty for chat responses. Usually not needed — increase if chat output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'chat'],
                tier: 'intermediate',
            },
            {
                key: 'compressRepeat',
                label: 'Compress Repeat Penalty',
                description: 'Repeat penalty for compression & summarization. Increase if summaries contain repeated phrases.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'compress'],
                tier: 'intermediate',
            },
            {
                key: 'researchRepeat',
                label: 'Research Repeat Penalty',
                description: 'Repeat penalty for research seed generation. Increase if research output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'research'],
                tier: 'intermediate',
            },
            {
                key: 'contextRepeat',
                label: 'Context Repeat Penalty',
                description: 'Repeat penalty for context engine operations. Increase if context output contains repetition.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'context'],
                tier: 'intermediate',
            },
            {
                key: 'docsRepeat',
                label: 'Docs Repeat Penalty',
                description: 'Repeat penalty for document generation. Increase if generated docs have repeated sections.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'docs'],
                tier: 'intermediate',
            },
            {
                key: 'keywordRepeat',
                label: 'Keyword Repeat Penalty',
                description: 'Repeat penalty for keyword extraction & domain synonyms. Increase if keyword output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'keyword'],
                tier: 'intermediate',
            },
            {
                key: 'autoratingRepeat',
                label: 'Autorating Repeat Penalty',
                description: 'Repeat penalty for quality autorating. Increase if autorating reasons contain repeated phrases.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'autorating'],
                tier: 'intermediate',
            },
            {
                key: 'apiVerificationRepeat',
                label: 'API Verification Repeat Penalty',
                description: 'Repeat penalty for API verification. Increase if API decision/interpretation output stutters.',
                min: 1.0, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['subsystemRepeatPenalties', 'api_verification'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Off', intent: 'Disable all repeat penalties (set to 1.0). Use when models generate clean output.' },
            { label: 'Image Fix', intent: 'Set image reader penalty to 1.3 for anti-stutter. Leave others at 1.0.' },
            { label: 'Aggressive', intent: 'Set all repeat penalties to 1.5 for maximum repetition suppression.' },
        ],
    },

    // -------------------------------------------------------------------------
    // 12. Top P (per-subsystem nucleus sampling)
    // -------------------------------------------------------------------------
    subsystem_top_p: {
        id: 'subsystem_top_p',
        tier: 'advanced',
        title: 'Top P (Nucleus Sampling)',
        description: 'Controls nucleus sampling threshold per subsystem. Only tokens within the top cumulative probability P are considered.',
        behavior: 'Top-p (nucleus) sampling limits the model to tokens whose cumulative probability mass reaches the threshold. Lower values (0.5-0.7) restrict the model to high-confidence tokens — more focused output. Higher values (0.9-1.0) allow more diverse token choices. Empty values use the model default. Works alongside temperature: temperature controls randomness within the allowed set, top_p controls the size of the allowed set.',
        parameters: [
            { key: 'voiceTopP', label: 'Voice Top P', description: 'Nucleus sampling for synthesis voicing. Slide right → wider token pool, more diverse output. Slide left → restricts to high-confidence tokens, more focused.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'voice'], tier: 'advanced' },
            { key: 'chatTopP', label: 'Chat Top P', description: 'Nucleus sampling for chat. Slide right → more diverse replies. Slide left → more focused, predictable.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'chat'], tier: 'advanced' },
            { key: 'compressTopP', label: 'Compress Top P', description: 'Nucleus sampling for compression. Slide right → more varied phrasing. Slide left → more deterministic summaries.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'compress'], tier: 'advanced' },
            { key: 'proxyTopP', label: 'Proxy Top P', description: 'Nucleus sampling for knowledge proxy. Slide right → more diverse. Slide left → more focused.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'proxy'], tier: 'advanced' },
            { key: 'researchTopP', label: 'Research Top P', description: 'Nucleus sampling for research. Slide right → more diverse seeds. Slide left → more focused research.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'research'], tier: 'advanced' },
            { key: 'contextTopP', label: 'Context Top P', description: 'Nucleus sampling for context engine. Slide right → more varied. Slide left → more deterministic.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'context'], tier: 'advanced' },
            { key: 'docsTopP', label: 'Docs Top P', description: 'Nucleus sampling for document generation. Slide right → more creative. Slide left → more structured.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'docs'], tier: 'advanced' },
            { key: 'keywordTopP', label: 'Keyword Top P', description: 'Nucleus sampling for keyword extraction. Slide right → more varied keywords. Slide left → more conservative.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'keyword'], tier: 'advanced' },
            { key: 'autoratingTopP', label: 'Autorating Top P', description: 'Nucleus sampling for quality autorating. Slide right → more diverse judgments. Slide left → more focused, consistent.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'autorating'], tier: 'advanced' },
            { key: 'apiVerificationTopP', label: 'API Verification Top P', description: 'Nucleus sampling for API verification. Slide right → more diverse. Slide left → more focused, precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'api_verification'], tier: 'advanced' },
            { key: 'readerTextTopP', label: 'Text Reader Top P', description: 'Nucleus sampling for text ingestion. Slide right → more varied. Slide left → more precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_text'], tier: 'advanced' },
            { key: 'readerPdfTopP', label: 'PDF Reader Top P', description: 'Nucleus sampling for PDF extraction. Slide right → more varied. Slide left → more precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_pdf'], tier: 'advanced' },
            { key: 'readerDocTopP', label: 'Doc Reader Top P', description: 'Nucleus sampling for doc processing. Slide right → more varied. Slide left → more precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_doc'], tier: 'advanced' },
            { key: 'readerImageTopP', label: 'Image Reader Top P', description: 'Nucleus sampling for vision descriptions. Slide right → more creative. Slide left → more factual.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_image'], tier: 'advanced' },
            { key: 'readerSheetTopP', label: 'Sheet Reader Top P', description: 'Nucleus sampling for spreadsheets. Slide right → more varied. Slide left → more precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_sheet'], tier: 'advanced' },
            { key: 'readerCodeTopP', label: 'Code Reader Top P', description: 'Nucleus sampling for code analysis. Slide right → more varied. Slide left → more precise.', min: 0.0, max: 1.0, step: 0.05, default: 0.9, configPath: ['subsystemTopP', 'reader_code'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Focused', intent: 'Set all top_p values to 0.7 for focused, high-confidence output' },
            { label: 'Default', intent: 'Reset all top_p values to 0.9 (standard nucleus sampling)' },
            { label: 'Wide', intent: 'Set all top_p values to 1.0 to allow full token diversity' },
        ],
    },

    // -------------------------------------------------------------------------
    // 13. Min P (per-subsystem minimum probability filtering)
    // -------------------------------------------------------------------------
    subsystem_min_p: {
        id: 'subsystem_min_p',
        tier: 'advanced',
        title: 'Min P (Minimum Probability)',
        description: 'Filters out tokens below a minimum probability relative to the top token. Effective alternative to top_k for quality control.',
        behavior: 'Min-p filtering removes tokens whose probability is less than min_p times the probability of the most likely token. For example, min_p=0.1 means any token less than 10% as likely as the top token is excluded. Higher values (0.1-0.3) produce more focused output. Lower values (0.01-0.05) allow more diversity. Set to 0 to disable. Supported by LM Studio and Ollama; ignored by cloud APIs that don\'t support it.',
        parameters: [
            { key: 'voiceMinP', label: 'Voice Min P', description: 'Min probability filter for voicing. Slide right → cuts more low-probability tokens, more focused. Slide left (or 0) → allows rare tokens through.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'voice'], tier: 'advanced' },
            { key: 'chatMinP', label: 'Chat Min P', description: 'Min probability filter for chat. Slide right → more focused replies. Slide left → more diverse word choices.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'chat'], tier: 'advanced' },
            { key: 'compressMinP', label: 'Compress Min P', description: 'Min probability filter for compression. Slide right → more predictable. Slide left → more varied phrasing.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'compress'], tier: 'advanced' },
            { key: 'proxyMinP', label: 'Proxy Min P', description: 'Min probability filter for proxy. Slide right → more focused. Slide left → more diverse.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'proxy'], tier: 'advanced' },
            { key: 'researchMinP', label: 'Research Min P', description: 'Min probability filter for research. Slide right → more focused seeds. Slide left → more creative.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'research'], tier: 'advanced' },
            { key: 'contextMinP', label: 'Context Min P', description: 'Min probability filter for context engine. Slide right → more deterministic. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'context'], tier: 'advanced' },
            { key: 'docsMinP', label: 'Docs Min P', description: 'Min probability filter for docs. Slide right → more focused. Slide left → more creative.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'docs'], tier: 'advanced' },
            { key: 'keywordMinP', label: 'Keyword Min P', description: 'Min probability filter for keywords. Slide right → more conservative. Slide left → more varied synonyms.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'keyword'], tier: 'advanced' },
            { key: 'autoratingMinP', label: 'Autorating Min P', description: 'Min probability filter for autorating. Slide right → more focused judgments. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'autorating'], tier: 'advanced' },
            { key: 'apiVerificationMinP', label: 'API Verification Min P', description: 'Min probability filter for API verification. Slide right → more focused. Slide left → more diverse.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'api_verification'], tier: 'advanced' },
            { key: 'readerTextMinP', label: 'Text Reader Min P', description: 'Min probability filter for text ingestion. Slide right → more precise. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_text'], tier: 'advanced' },
            { key: 'readerPdfMinP', label: 'PDF Reader Min P', description: 'Min probability filter for PDF. Slide right → more precise. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_pdf'], tier: 'advanced' },
            { key: 'readerDocMinP', label: 'Doc Reader Min P', description: 'Min probability filter for doc processing. Slide right → more precise. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_doc'], tier: 'advanced' },
            { key: 'readerImageMinP', label: 'Image Reader Min P', description: 'Min probability filter for vision. Slide right → more factual. Slide left → more creative descriptions.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_image'], tier: 'advanced' },
            { key: 'readerSheetMinP', label: 'Sheet Reader Min P', description: 'Min probability filter for spreadsheets. Slide right → more precise. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_sheet'], tier: 'advanced' },
            { key: 'readerCodeMinP', label: 'Code Reader Min P', description: 'Min probability filter for code. Slide right → more precise. Slide left → more varied.', min: 0.0, max: 0.5, step: 0.01, default: 0.05, configPath: ['subsystemMinP', 'reader_code'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Off', intent: 'Disable min_p filtering (set all to 0)' },
            { label: 'Gentle', intent: 'Set all min_p values to 0.05 for gentle low-probability filtering' },
            { label: 'Strict', intent: 'Set all min_p values to 0.15 for strict probability filtering' },
        ],
    },

    // -------------------------------------------------------------------------
    // 14. Top K (per-subsystem top-k sampling)
    // -------------------------------------------------------------------------
    subsystem_top_k: {
        id: 'subsystem_top_k',
        tier: 'advanced',
        title: 'Top K Sampling',
        description: 'Limits token selection to the K most likely tokens. Hard cutoff alternative to nucleus sampling.',
        behavior: 'Top-k sampling restricts the model to only the K most likely next tokens before sampling. Lower values (10-20) produce more focused, predictable output. Higher values (40-100) allow more diversity. Set to 0 to disable (no top-k filtering). Supported by LM Studio and Ollama. Most cloud APIs (OpenAI, Anthropic) do not support top_k — the parameter will be sent but may be ignored.',
        parameters: [
            { key: 'voiceTopK', label: 'Voice Top K', description: 'Top-k token limit for voicing. Slide right → more token choices, more diverse. Slide left → fewer choices, more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'voice'], tier: 'advanced' },
            { key: 'chatTopK', label: 'Chat Top K', description: 'Top-k for chat. Slide right → more diverse. Slide left → more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'chat'], tier: 'advanced' },
            { key: 'compressTopK', label: 'Compress Top K', description: 'Top-k for compression. Slide right → more varied. Slide left → more deterministic. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'compress'], tier: 'advanced' },
            { key: 'proxyTopK', label: 'Proxy Top K', description: 'Top-k for proxy. Slide right → more diverse. Slide left → more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'proxy'], tier: 'advanced' },
            { key: 'researchTopK', label: 'Research Top K', description: 'Top-k for research. Slide right → more varied seeds. Slide left → more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'research'], tier: 'advanced' },
            { key: 'contextTopK', label: 'Context Top K', description: 'Top-k for context engine. Slide right → more varied. Slide left → more deterministic. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'context'], tier: 'advanced' },
            { key: 'docsTopK', label: 'Docs Top K', description: 'Top-k for docs. Slide right → more creative. Slide left → more structured. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'docs'], tier: 'advanced' },
            { key: 'keywordTopK', label: 'Keyword Top K', description: 'Top-k for keywords. Slide right → more varied. Slide left → more conservative. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'keyword'], tier: 'advanced' },
            { key: 'autoratingTopK', label: 'Autorating Top K', description: 'Top-k for autorating. Slide right → more varied. Slide left → more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'autorating'], tier: 'advanced' },
            { key: 'apiVerificationTopK', label: 'API Verification Top K', description: 'Top-k for API verification. Slide right → more varied. Slide left → more focused. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'api_verification'], tier: 'advanced' },
            { key: 'readerTextTopK', label: 'Text Reader Top K', description: 'Top-k for text ingestion. Slide right → more varied. Slide left → more precise. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_text'], tier: 'advanced' },
            { key: 'readerPdfTopK', label: 'PDF Reader Top K', description: 'Top-k for PDF. Slide right → more varied. Slide left → more precise. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_pdf'], tier: 'advanced' },
            { key: 'readerDocTopK', label: 'Doc Reader Top K', description: 'Top-k for doc processing. Slide right → more varied. Slide left → more precise. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_doc'], tier: 'advanced' },
            { key: 'readerImageTopK', label: 'Image Reader Top K', description: 'Top-k for vision. Slide right → more creative. Slide left → more factual. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_image'], tier: 'advanced' },
            { key: 'readerSheetTopK', label: 'Sheet Reader Top K', description: 'Top-k for spreadsheets. Slide right → more varied. Slide left → more precise. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_sheet'], tier: 'advanced' },
            { key: 'readerCodeTopK', label: 'Code Reader Top K', description: 'Top-k for code. Slide right → more varied. Slide left → more precise. 0 = disabled.', min: 0, max: 100, step: 5, default: 40, configPath: ['subsystemTopK', 'reader_code'], tier: 'advanced' },
        ],
        presets: [
            { label: 'Off', intent: 'Disable top-k filtering (set all to 0)' },
            { label: 'Default', intent: 'Set all top_k values to 40 (standard top-k sampling)' },
            { label: 'Focused', intent: 'Set all top_k values to 15 for highly focused output' },
        ],
    },
};
