/**
 * EVM — Type Definitions
 *
 * Active types: VerificationResult, VerifyHints, AnalysisResult, AnalysisFindings,
 * DecompositionResult, GuidanceSuggestion, TestCategory, normalizeTestCategory.
 *
 * @legacy types (historical lab_executions data): CodegenResult, SandboxResult,
 * EvaluationResult, ClaimResult, EVMExecution. New runs use ExperimentSpec +
 * LabResultResponse from lab/types.ts. These are kept for backward compatibility
 * with DB rows and UI display of historical verification data.
 */

// =============================================================================
// STATUS & MODE ENUMS
// =============================================================================

/** Triage classification — routes claims to different verification strategies */
export type TestCategory =
    | 'numerical'        // Compute both sides to high precision — fully autonomous
    | 'structural'       // Simulation/algorithm test — human reviews test design
    | 'domain_expert'    // Abstract theory — flag for human review, don't auto-test
    | 'not_testable';    // Hedging, open questions — reject back to synthesis

export const VALID_TEST_CATEGORIES: TestCategory[] = [
    'numerical', 'structural', 'domain_expert', 'not_testable',
];

const CATEGORY_ALIASES: Record<string, TestCategory> = {
    'numerical': 'numerical',
    'structural': 'structural',
    'domain_expert': 'domain_expert',
    'domainexpert': 'domain_expert',
    'domain expert': 'domain_expert',
    'not_testable': 'not_testable',
    'nottestable': 'not_testable',
    'not testable': 'not_testable',
    'not-testable': 'not_testable',
    'untestable': 'not_testable',
};

/** Normalize LLM-returned testCategory to a valid enum value. */
export function normalizeTestCategory(raw: any): TestCategory {
    if (typeof raw !== 'string') return 'not_testable';
    const normalized = raw.trim().toLowerCase().replace(/-/g, '_');
    return CATEGORY_ALIASES[normalized] ?? CATEGORY_ALIASES[normalized.replace(/_/g, '')] ?? 'not_testable';
}

export type VerificationStatus =
    | 'pending'
    | 'generating'
    | 'executing'
    | 'evaluating'
    | 'completed'
    | 'code_error'
    | 'failed'
    | 'skipped'
    | 'analysis'                // Post-rejection analysis execution record
    | 'needs_review'            // Structural: executed but weight held for human approval
    | 'needs_expert'            // Domain expert: flagged for human expertise
    | 'rejected_resynthesis'    // Not testable: flagged for re-synthesis
    | 'pending_review';         // Lab chaining: awaiting critique lab review

export type EvaluationMode =
    | 'numerical'
    | 'boolean'
    | 'convergence'
    | 'pattern';

export const VALID_EVALUATION_MODES: EvaluationMode[] = [
    'numerical', 'boolean', 'convergence', 'pattern',
];

/** Claim type is open-ended — labs define their own experiment categories */
export type ClaimType = string;

/** Well-known claim types (not exhaustive — labs can introduce new ones) */
export const KNOWN_CLAIM_TYPES: string[] = [
    'numerical_identity', 'convergence_rate', 'symbolic_identity',
    'curve_shape', 'threshold_behaviour', 'structural_mapping',
    'training_performance', 'model_behavior',
    'qualitative', 'exhausted',
];

/**
 * Assertion polarity — how the codegen framed the test relative to the original claim.
 *
 * "positive": result=True means the claim IS supported (default, most common)
 * "negative": result=True means the claim is CONTRADICTED (test framed as the opposite)
 *
 * Example: Claim says "A ≠ B". Codegen tests "whether A = B".
 *   - result=True (A = B) → claim is WRONG → polarity "negative"
 *   - result=False (A ≠ B) → claim is CORRECT → polarity "negative"
 *
 * claimSupported = (verified && polarity === 'positive') || (!verified && polarity === 'negative')
 */
export type AssertionPolarity = 'positive' | 'negative';

// =============================================================================
// PIPELINE STAGE RESULTS
// =============================================================================

/** Output from the LLM code generation stage */
export type TestabilityLevel = 'level_1' | 'level_2' | 'level_3' | 'level_4';

export interface CodegenResult {
    code: string;
    hypothesis: string;
    testabilityLevel?: TestabilityLevel;
    expectedBehavior: string;
    evaluationMode: EvaluationMode;
    claimType: ClaimType;
    assertionPolarity: AssertionPolarity;
    raw: string;
}

/** Output from the Python sandbox execution stage */
export interface SandboxResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
    killed: boolean;
    parsedOutput?: any;
}

/** Output from the result evaluation stage */
export interface EvaluationResult {
    verified: boolean;          // Raw test outcome (did the hypothesis pass?)
    claimSupported: boolean;    // Adjusted for polarity (does the test support the original claim?)
    confidence: number;         // 0.0 - 1.0
    score: number;              // Weighted verification score 0.0 - 1.0
    mode: EvaluationMode;
    details: string;
    rawOutput: any;
    /**
     * Structured payload accompanying `details` — mirrors LabResultResponse.structuredDetails.
     * The lab framework copies this through so the GUI can render rich critique data
     * (action / corrected verdict / issues / guidance / rewritten claim) as fields
     * instead of escaped JSON inside `details`.
     */
    structuredDetails?: Record<string, unknown>;
    /** Signal for routing policy — set when result needs special handling */
    routingSignal?: 'preflight_halt' | 'malformed_output';
    /** Lab returned 'inconclusive' — neither supported nor refuted; suppresses weight changes and taint */
    inconclusive?: boolean;
}

// =============================================================================
// POST-REJECTION ANALYSIS
// =============================================================================

/** Result from a post-rejection analyser */
export interface AnalysisResult {
    claimType: ClaimType;
    analysisCode: string;
    sandboxResult?: SandboxResult;
    findings: AnalysisFindings;
    recoveryProposal?: {
        content: string;
        domain: string;
        parentIds: string[];
    };
}

/** Structured findings from post-rejection analysis */
export interface AnalysisFindings {
    actualValue?: string;
    expectedValue?: string;
    deviation?: string;
    alternativePattern?: string;
    alternativeConfidence?: number;
    isInteresting: boolean;
    summary: string;
}

// =============================================================================
// MULTI-CLAIM ITERATION
// =============================================================================

/** Per-claim result when multi-claim iteration is active */
export type ClaimStatus = 'supported' | 'disproved' | 'skipped' | 'code_error' | 'exhausted';

export interface ClaimResult {
    claimIndex: number;
    hypothesis: string;
    claimType: ClaimType;
    codegen?: CodegenResult;
    sandbox?: SandboxResult;
    evaluation?: EvaluationResult;
    status: ClaimStatus;
    attempts: number;
    error?: string;
}

// =============================================================================
// FULL PIPELINE RESULT
// =============================================================================

/** Complete verification result for a node */
export interface VerificationResult {
    nodeId: string;
    status: VerificationStatus;
    testCategory?: TestCategory;
    codegen?: CodegenResult;
    sandbox?: SandboxResult;
    evaluation?: EvaluationResult;
    analysis?: AnalysisResult;
    weightBefore?: number;
    weightAfter?: number;
    error?: string;
    attempts?: number;
    startedAt: string;
    completedAt?: string;
    /** Human/LLM guidance used for this verification attempt */
    guidance?: string;
    /** Per-claim results when multi-claim iteration is active */
    claimResults?: ClaimResult[];
    /** Total claims tested (including exhaustion signal) */
    claimsTotal?: number;
    /** Claims that completed with a genuine result (supported or disproved) */
    claimsVerified?: number;
}

/** Hints passed from triage to verifyNode */
export interface VerifyHints {
    testCategory?: TestCategory;
    precisionHint?: number;
    claimTypeHint?: ClaimType;
    /** Human or LLM guidance for how to approach this verification */
    guidance?: string;
    /** Maximum number of claims to iterate through (overrides config) */
    maxClaims?: number;
    /** Pre-built spec — skip extraction and submit directly (used by chain jobs) */
    chainSpec?: import('../lab/types.js').ExperimentSpec;
    /** Execution ID of the parent in the chain */
    chainParentExecutionId?: string;
    /** Current chain depth (0 = original, 1 = first critique, 2 = retest, ...) */
    chainDepth?: number;
    /** Chain type: 'critique' = reviewing prior result, 'retest' = rerunning with guidance */
    chainType?: 'critique' | 'retest';
    /** Original lab ID (for retests — route back to the same lab) */
    chainOriginalLabId?: string;
    /** Original lab name (for traceability) */
    chainOriginalLabName?: string;
    /** Original verdict being reviewed (for critique context) */
    chainOriginalVerdict?: string;
    /** Original confidence being reviewed */
    chainOriginalConfidence?: number;
    /** Queue entry ID processing this hint (set by worker, used for chain parent tracking) */
    queueEntryId?: number;
    /** Resume polling an existing lab job instead of submitting a new one */
    resumeJobId?: string;
    /** Template/lab ID for the resumed job (avoids re-routing) */
    resumeTemplateId?: string;
    /** Callback: persist the lab jobId (and optionally templateId) to the queue entry immediately after submission */
    onJobId?: (jobId: string, templateId?: string) => void;
    /**
     * Allow the spec extractor to fall back to `node_critique` (LLM-on-LLM critique).
     * Defaults to false so autonomous cycles cannot launder LLM agreement into weight gain.
     * Set true ONLY for human-invoked verifications (manual UI, explicit MCP request, etc.)
     * where critique-lab review is the desired outcome rather than a fallback.
     */
    allowCritique?: boolean;
    /** Wall-clock budget (ms) for the entire verification including lab polling.
     *  Comes from config.lab.freezeTimeoutMs via the queue worker. The poll loop
     *  in submitSpec derives its maxPollAttempts from this so it never exceeds the
     *  freeze timeout. */
    pollBudgetMs?: number;
    /** Pipeline-wide abort signal. The queue worker's watchdog fires this when the
     *  entire entry (spec extraction + lab + eval) exceeds the wall-clock limit.
     *  Propagated to spec extraction LLM calls and lab polling. */
    signal?: AbortSignal;
    /** AbortController for the pipeline - the queue worker creates it,
     *  the watchdog fires it if the entry exceeds the wall-clock deadline. */
    labAbort?: AbortController;
    /** Freeze timeout in ms - used to start the lab abort timer. */
    freezeTimeoutMs?: number;
}

/** LLM diagnosis of a failed verification — used by the "suggest" action */
export interface GuidanceSuggestion {
    diagnosis: string;
    suggestion: string;
    confidence: number;
    category: string;
}

// =============================================================================
// CLAIM DECOMPOSITION
// =============================================================================

/** Category tag for decomposed known facts */
export type FactCategory = 'definition' | 'quantitative' | 'relationship' | 'mechanism' | 'constraint' | 'observation';

export const VALID_FACT_CATEGORIES: FactCategory[] = [
    'definition', 'quantitative', 'relationship', 'mechanism', 'constraint', 'observation',
];

/** A single known fact extracted from a decomposed claim */
export interface DecomposedFact {
    content: string;
    category: FactCategory;
    confidence: number;       // 0-1
}

/** A single unknown/research question extracted from a decomposed claim */
export interface DecomposedQuestion {
    content: string;
    reasoning: string;        // why this is unknown
}

/** LLM decomposition output — preview before user approval */
export interface DecompositionResult {
    nodeId: string;
    nodeContent: string;
    domain: string;
    facts: DecomposedFact[];
    questions: DecomposedQuestion[];
    summary: string;
}

/** Result of applying a reviewed decomposition */
export interface DecompositionApplyResult {
    originalNodeId: string;
    originalWeightBefore: number;
    originalWeightAfter: number;
    createdFacts: Array<{ id: string; content: string; category: string }>;
    createdQuestions: Array<{ id: string; content: string }>;
    totalCreated: number;
}

// =============================================================================
// DATABASE ROW SHAPE
// =============================================================================

/** Row shape for the lab_executions table */
export interface EVMExecution {
    id: string;
    node_id: string;
    status: VerificationStatus;
    hypothesis: string | null;
    code: string | null;
    evaluation_mode: EvaluationMode | null;
    claim_type: ClaimType | null;
    test_category: string | null;
    stdout: string | null;
    stderr: string | null;
    exit_code: number | null;
    execution_time_ms: number | null;
    verified: number | null;            // 0 or 1 — raw test outcome (did hypothesis pass?)
    claim_supported: number | null;     // 0 or 1 — polarity-adjusted (does test support the claim?)
    assertion_polarity: string | null;  // 'positive' or 'negative'
    confidence: number | null;
    score: number | null;
    weight_before: number | null;
    weight_after: number | null;
    error: string | null;
    attempt: number;
    created_at: string;
    completed_at: string | null;
}
