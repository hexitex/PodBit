/**
 * Model types, subsystem definitions, and shared utilities.
 *
 * Defines the core type system for the model pool: model entries, call options,
 * subsystem assignments, provider routing, and shared helpers like UUID generation.
 * @module models/types
 */

/** Granular thinking/reasoning control levels supported by various providers. */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/**
 * Lightweight model descriptor used for individual LLM calls.
 * Populated from RegisteredModel + subsystem overrides before calling a provider.
 */
export interface ModelEntry {
    /** Display name for the model. */
    name: string;
    /** Provider routing key (e.g. 'openai', 'anthropic', 'local', 'lmstudio'). */
    provider: string;
    /** Provider-specific model identifier (e.g. 'gpt-4o', 'claude-3-5-sonnet'). */
    model?: string;
    /** Custom API endpoint URL. Falls back to provider default if omitted. */
    endpoint?: string;
    /** Per-model API key. Falls back to provider-level key if omitted. */
    apiKey?: string;
    /** When true, disables chain-of-thought and strips think blocks from output. */
    noThink?: boolean;
    /** Granular thinking level: 'off' | 'low' | 'medium' | 'high'. Takes precedence over noThink for level-aware providers. */
    thinkingLevel?: string;
    /** Input cost per million tokens — populated from registry when available. */
    inputCostPerMtok?: number;
    /** Output cost per million tokens — populated from registry when available. */
    outputCostPerMtok?: number;
    /** Tool/reasoning token cost per million tokens — populated from registry when available. */
    toolCostPerMtok?: number;
    /** Registry model ID — when set, callWithMessages acquires a semaphore slot. @internal */
    _registryId?: string;
    /** Max concurrent requests for this model. @internal */
    _maxConcurrency?: number;
    /** Minimum pause (ms) between consecutive requests. @internal */
    _requestPauseMs?: number;
}

/** Named JSON schema for structured output (response_format). */
export interface JsonSchema {
    /** Schema name identifier. */
    name: string;
    /** JSON Schema object defining the expected structure. */
    schema: Record<string, any>;
}

/** Base64-encoded image for multimodal LLM calls (vision models). */
export interface ImageInput {
    /** Encoding type — currently only 'base64' is supported. */
    type: 'base64';
    /** MIME type (e.g. 'image/png', 'image/jpeg'). */
    media_type: string;
    /** Base64-encoded image data. */
    data: string;
}

/**
 * Options for single-prompt LLM calls via callSingleModel / callSubsystemModel.
 * Sampling parameters are resolved in priority order: caller override > per-subsystem config > model default.
 */
export interface CallOptions {
    /** Maximum output tokens. Resolved from caller > registry > undefined (provider decides). */
    maxTokens?: number;
    /** Sampling temperature. */
    temperature?: number;
    /** Repeat/frequency penalty (mapped to frequency_penalty for OpenAI-compatible). */
    repeatPenalty?: number;
    /** Nucleus sampling threshold. */
    topP?: number;
    /** Minimum probability threshold (not supported by all providers). */
    minP?: number;
    /** Top-K sampling (not supported by all providers). */
    topK?: number;
    /** JSON schema for structured output. Provider-specific formatting applied automatically. */
    jsonSchema?: JsonSchema;
    /** Legacy response_format passthrough (prefer jsonSchema). */
    responseFormat?: any;
    /** System prompt prepended to the conversation. */
    systemPrompt?: string;
    /** Base64-encoded images for multimodal/vision calls. */
    images?: ImageInput[];
    /** Abort signal — when aborted, inflight fetch() calls are cancelled immediately.
     *  Used by project switching to kill all inflight LLM requests. */
    signal?: AbortSignal;
    /** Per-request fetch timeout in seconds. Comes from model_registry.request_timeout. */
    requestTimeout?: number;
    /** When true, forces low temperature (0.15) for deterministic consultant review scoring. */
    isReview?: boolean;
}

/**
 * Options for multi-message LLM calls via callWithMessages (proxy path).
 * Mirrors OpenAI chat completions API parameters.
 */
export interface CallWithMessagesOptions {
    maxTokens?: number;
    temperature?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    response_format?: any;
    tools?: any[];
    tool_choice?: string | { type: string; function?: { name: string } };
    n?: number;
    seed?: number;
    logprobs?: boolean;
    top_logprobs?: number;
    user?: string;
    signal?: AbortSignal;
    requestTimeout?: number;
}

/** OpenAI-compatible chat completion response shape. */
export interface CallWithMessagesResult {
    choices: Array<{
        index: number;
        message: { role: string; content: string | null; tool_calls?: any[] };
        finish_reason: string;
        logprobs?: any;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
    system_fingerprint?: string;
}

/** Normalized token usage counts from any provider. */
export interface LlmUsage {
    prompt_tokens: number;
    completion_tokens: number;
    /** Reasoning/tool tokens (e.g. chain-of-thought tokens from o1). */
    tool_tokens: number;
    total_tokens: number;
}

/** Result from a single LLM call (provider-normalized). */
export interface LlmCallResult {
    /** The model's text response (think blocks stripped if noThink). */
    text: string;
    /** Token usage counts, if the provider returned them. */
    usage?: LlmUsage;
    /** Provider finish reason (e.g. 'stop', 'length', 'end_turn'). */
    finishReason?: string;
}

/**
 * Full model record from the model_registry table (system DB).
 * Includes all configuration, cost rates, concurrency limits, and thinking controls.
 */
export interface RegisteredModel {
    /** Primary key (UUID). */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Normalized provider key ('openai' | 'anthropic' | 'local' | 'lmstudio'). */
    provider: string;
    /** Provider-specific model identifier sent in API requests. */
    modelId: string;
    /** Model tier classification (e.g. 'small', 'medium', 'large'). */
    tier: string;
    /** Custom API endpoint URL, or null to use provider default. */
    endpointUrl: string | null;
    /** Per-model API key, or null to use provider-level key. */
    apiKey: string | null;
    /** Whether this model is available for assignment. */
    enabled: boolean;
    /** Max output tokens override, or null to derive from contextSize. */
    maxTokens: number | null;
    /** Model context window size in tokens, or null if unknown. */
    contextSize: number | null;
    /** Legacy cost per 1K tokens (deprecated — use per-Mtok fields). */
    costPer1k: number;
    /** Input token cost per million tokens. */
    inputCostPerMtok: number;
    /** Output token cost per million tokens. */
    outputCostPerMtok: number;
    /** Tool/reasoning token cost per million tokens. */
    toolCostPerMtok: number;
    /** Display ordering in the GUI. */
    sortOrder: number;
    /** Max retry attempts on transient errors (default 3). */
    maxRetries: number;
    /** Total retry window in minutes (default 2). Retries stop if window exceeded. */
    retryWindowMinutes: number;
    /** Max concurrent in-flight requests to this model (default 1). */
    maxConcurrency: number;
    /** Minimum pause (ms) between consecutive request dispatches (default 0). */
    requestPauseMs: number;
    /** Per-request fetch timeout in seconds (default 180). */
    requestTimeout: number;
    /** Default backoff duration (ms) when a rate-limit error has no explicit retry-after time. Default 120000 (2 min). */
    rateLimitBackoffMs: number;
    /** Whether the model supports tool/function calling. null = unknown. */
    supportsTools: boolean | null;
    /** Whether chain-of-thought is disabled for this model. */
    noThink: boolean;
    /** Granular thinking level resolved from subsystem override -> model default. null = no constraint. */
    thinkingLevel: string | null;
}

/** All valid subsystem identifiers. Each subsystem can have an independent model assignment. */
export type Subsystem = 'synthesis' | 'chat' | 'context' | 'docs' | 'compress' | 'voice' | 'proxy' | 'embedding' | 'research' | 'keyword'
    | 'reader_text' | 'reader_pdf' | 'reader_doc' | 'reader_image' | 'reader_sheet' | 'reader_code'
    | 'dedup_judge' | 'config_tune' | 'tuning_judge' | 'autorating'
    | 'evm_analysis' | 'evm_guidance'
    | 'spec_extraction' | 'spec_review'
    | 'api_verification'
    | 'image_gen'
    | 'breakthrough_check'
    | 'elite_mapping'
    | 'ground_rules'
    | 'population_control'
    | 'lab_routing'
    | `lab:${string}`;

/**
 * Canonical list of valid subsystem identifiers used for validation in assignment
 * routes and model management. Must stay in sync with the {@link Subsystem} union type.
 * Dynamic lab subsystems (`lab:*`) are validated by prefix, not membership.
 */
export const VALID_SUBSYSTEMS: Subsystem[] = [
    'synthesis', 'chat', 'context', 'docs', 'compress', 'voice', 'proxy', 'embedding', 'research', 'keyword',
    'reader_text', 'reader_pdf', 'reader_doc', 'reader_image', 'reader_sheet', 'reader_code',
    'dedup_judge', 'config_tune', 'tuning_judge', 'autorating',
    'evm_analysis', 'evm_guidance',
    'spec_extraction', 'spec_review',
    'api_verification',
    'image_gen',
    'breakthrough_check',
    'elite_mapping',
    'ground_rules',
    'population_control',
    'lab_routing',
];

/** Check if a subsystem identifier is valid (static list OR dynamic lab:* pattern) */
export function isValidSubsystem(sub: string): sub is Subsystem {
    return VALID_SUBSYSTEMS.includes(sub as Subsystem) || sub.startsWith('lab:');
}

// Normalize provider aliases so all models use the same internal routing
const PROVIDER_ALIASES: Record<string, string> = {
    'ollama': 'local',
};

/**
 * Maps provider aliases to canonical names for consistent routing.
 * Currently maps 'ollama' to 'local'. Unknown providers pass through unchanged.
 * @param provider - Raw provider string from user input or DB
 * @returns Normalized provider key
 */
export function normalizeProvider(provider: string): string {
    return PROVIDER_ALIASES[provider] || provider;
}

/**
 * Extract display provider from a model ID string.
 * If the ID contains a slash, returns the prefix (organization name).
 * Otherwise returns the ID as-is.
 * @param modelId - Model identifier, optionally prefixed with org (e.g. "moonshotai/kimi2.5")
 * @returns The organization prefix or the full modelId if no slash present
 * @example getModelProvider("moonshotai/kimi2.5") // "moonshotai"
 * @example getModelProvider("claude-3-5-sonnet")  // "claude-3-5-sonnet"
 */
export function getModelProvider(modelId: string): string {
    if (!modelId) return 'unknown';
    const slashIdx = modelId.indexOf('/');
    if (slashIdx > 0) return modelId.substring(0, slashIdx);
    return modelId;
}

/**
 * Resolve the default API endpoint URL for a provider.
 * Used when a model has no explicit endpoint_url in the registry.
 * Falls back to environment variables, then hardcoded defaults.
 * @param provider - Normalized provider key
 * @returns The endpoint URL string (never undefined)
 */
export function resolveProviderEndpoint(provider: string): string {
    switch (provider) {
        case 'local':
            return process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434/v1';
        case 'anthropic':
            return 'https://api.anthropic.com/v1';
        case 'openai':
            return process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1';
        default:
            // LM Studio / generic OpenAI-compatible
            return process.env.LLM_ENDPOINT
                || process.env.LMSTUDIO_ENDPOINT
                || 'http://127.0.0.1:1234/v1';
    }
}

/**
 * Generates a v4-style UUID string using Math.random() (no crypto dependency).
 * Not cryptographically secure — suitable for database primary keys, not tokens.
 * @returns A UUID string in the format "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
 */
export function generateUuid(): string {
    const hex = (n: number): string => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const a = hex(4);
    const b = hex(2);
    const c = '4' + hex(2).substring(1);
    const d = ((parseInt(hex(1), 16) & 0x3) | 0x8).toString(16) + hex(2).substring(1);
    const e = hex(6);
    return `${a}-${b}-${c}-${d}-${e}`;
}
