/**
 * API Verification Registry — Type Definitions
 *
 * External APIs verify factual claims (compound existence, molecular properties,
 * citation validity) before the EVM runs Python verification.
 */

// =============================================================================
// VERIFICATION IMPACT — Three outcomes with distinct breeding consequences
// =============================================================================

/**
 * How API verification affects a node's breeding fitness:
 *
 * value_correction      — Claim structure sound, number wrong. Fix placeholder, small penalty.
 * structural_validation — Entities exist, reactions work, citations real. Fitness boost.
 * structural_refutation — Entity fabricated, reaction impossible, citation fake. Heavy weight penalty.
 * inconclusive          — API consulted but couldn't determine outcome. No weight change.
 */
export type VerificationImpact =
    | 'value_correction'
    | 'structural_validation'
    | 'structural_refutation'
    | 'inconclusive';

export const VALID_VERIFICATION_IMPACTS: VerificationImpact[] = [
    'value_correction', 'structural_validation', 'structural_refutation', 'inconclusive',
];

// =============================================================================
// API MODE — verify, enrich, or both
// =============================================================================

/** Per-API operational mode (stored in registry) */
export type ApiMode = 'verify' | 'enrich' | 'both';

/** Per-decision mode (what to do with THIS API's response for THIS node) */
export type DecisionMode = 'verify' | 'enrich' | 'both';

export const VALID_API_MODES: ApiMode[] = ['verify', 'enrich', 'both'];

// =============================================================================
// ENRICHMENT — extracting new knowledge from API responses
// =============================================================================

/** A single discrete fact extracted from an API response */
export interface EnrichmentFact {
    content: string;        // Standalone claim suitable as a graph node
    confidence: number;     // 0-1
    category: string;       // e.g., 'synthesis_route', 'property', 'relationship'
    source: string;         // Citation from API response
}

/** Result of the enrichment extraction + node creation step */
export interface EnrichmentResult {
    facts: EnrichmentFact[];
    nodeIds: string[];      // IDs of created nodes (children mode only)
    skipped: number;        // Facts below threshold or rejected by dedup
    errors: string[];       // Non-fatal errors during node creation
    /** Whether enrichment was applied inline or as children */
    mode: 'inline' | 'children';
    /** Total word count after inline enrichment (inline mode only) */
    inlineWordCount?: number;
}

// =============================================================================
// AUTH & CONNECTION
// =============================================================================

export type AuthType = 'none' | 'api_key' | 'bearer';
export type ResponseFormat = 'json' | 'xml' | 'text';

// =============================================================================
// REGISTRY ENTRY — one row per registered API
// =============================================================================

export interface ApiRegistryEntry {
    id: string;
    name: string;
    displayName: string;
    description: string | null;
    enabled: boolean;
    mode: ApiMode;
    // Connection
    baseUrl: string;
    testUrl: string | null;
    authType: AuthType;
    authKey: string | null;
    authHeader: string | null;
    // Rate limiting
    maxRpm: number;
    maxConcurrent: number;
    timeoutMs: number;
    // Per-API prompts (travel with the config, not in prompts table)
    promptQuery: string | null;
    promptInterpret: string | null;
    promptExtract: string | null;
    promptNotes: string | null;
    // Response handling
    responseFormat: ResponseFormat;
    maxResponseBytes: number;
    // Metadata
    capabilities: string[] | null;
    domains: string[] | null;
    testCases: any[] | null;
    onboardedAt: string | null;
    onboardedBy: string | null;
    totalCalls: number;
    totalErrors: number;
    createdAt: string;
    updatedAt: string;
}

/** DB row shape before JS mapping */
export interface ApiRegistryRow {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    enabled: number;
    mode: string;
    base_url: string;
    test_url: string | null;
    auth_type: string;
    auth_key: string | null;
    auth_header: string | null;
    max_rpm: number;
    max_concurrent: number;
    timeout_ms: number;
    prompt_query: string | null;
    prompt_interpret: string | null;
    prompt_extract: string | null;
    prompt_notes: string | null;
    response_format: string;
    max_response_bytes: number;
    capabilities: string | null;
    domains: string | null;
    test_cases: string | null;
    onboarded_at: string | null;
    onboarded_by: string | null;
    total_calls: number;
    total_errors: number;
    created_at: string;
    updated_at: string;
}

// =============================================================================
// DECISION ENGINE
// =============================================================================

/** Output from the decision engine — which APIs (if any) to call for a node */
export interface ApiDecision {
    apiId: string;
    apiName: string;
    reason: string;
    confidence: number;
    relevantVarIds: string[];
    mode: DecisionMode;
}

// =============================================================================
// QUERY FORMULATION
// =============================================================================

/** HTTP request to make against an external API */
export interface ApiQuery {
    method: 'GET' | 'POST';
    url: string;
    body?: string;
    headers?: Record<string, string>;
}

// =============================================================================
// RESULT INTERPRETATION
// =============================================================================

/** Single value correction identified by the interpreter */
export interface ApiCorrection {
    varId: string;
    oldValue: string;
    newValue: string;
    confidence: number;
    source: string;  // citation from API response
}

/** Full interpretation of an API response */
export interface ApiInterpretation {
    impact: VerificationImpact;
    corrections: ApiCorrection[];
    evidenceSummary: string;
    confidence: number;
}

// =============================================================================
// FULL API VERIFICATION RESULT
// =============================================================================

export type ApiVerificationStatus = 'success' | 'api_error' | 'timeout' | 'skipped' | 'no_correction';

/** Result of one API call during verification */
export interface ApiVerificationResult {
    apiId: string;
    apiName: string;
    status: ApiVerificationStatus;
    decision: ApiDecision;
    query?: ApiQuery;
    rawResponse?: string;
    responseStatus?: number;
    responseTimeMs?: number;
    interpretation?: ApiInterpretation;
    correctionsApplied: number;
    enrichment?: EnrichmentResult;
    error?: string;
}

/** Aggregate result from the full API verification pipeline */
export interface ApiPipelineResult {
    results: ApiVerificationResult[];
    totalCorrections: number;
    totalEnrichments: number;
    enrichmentNodeIds: string[];
    overallImpact: VerificationImpact | null;  // worst-case across all APIs
    resolvedContent: string;  // content with all corrections applied
}

// =============================================================================
// VARIABLE CONTEXT — passed to decision engine and interpreter
// =============================================================================

export interface VarContext {
    varId: string;
    value: string;
    scopeText: string;
    domain: string;
}

// =============================================================================
// CONFIG
// =============================================================================

export interface ApiVerificationConfig {
    enabled: boolean;
    maxApisPerNode: number;
    // Enrichment mode
    enrichmentEnabled: boolean;
    enrichmentMaxNodesPerCall: number;
    enrichmentMinConfidence: number;
    enrichmentInitialWeight: number;
    enrichmentMode: 'inline' | 'children';
    enrichmentMaxContentWords: number;
}

// =============================================================================
// PROMPT HISTORY
// =============================================================================

export interface ApiPromptHistoryEntry {
    id: number;
    apiId: string;
    promptField: string;
    content: string;
    version: number;
    reason: string | null;
    contributor: string | null;
    createdAt: string;
}

// =============================================================================
// API VERIFICATION LOG (DB row)
// =============================================================================

export interface ApiVerificationRow {
    id: string;
    node_id: string;
    api_id: string;
    execution_id: string | null;
    decision_reason: string | null;
    decision_confidence: number | null;
    decision_mode: string | null;
    request_method: string;
    request_url: string | null;
    request_body: string | null;
    response_status: number | null;
    response_body: string | null;
    response_time_ms: number | null;
    verification_impact: VerificationImpact | null;
    interpreted_values: string | null;
    corrections_applied: number;
    enrichment_node_ids: string | null;
    enrichment_count: number;
    evidence_summary: string | null;
    confidence: number | null;
    status: string;
    error: string | null;
    created_at: string;
}

// =============================================================================
// ONBOARDING INTERVIEW
// =============================================================================

export interface OnboardInterviewState {
    interviewId: string;
    name: string;
    turns: Array<{ role: 'assistant' | 'user'; content: string }>;
    createdAt: number;
}
