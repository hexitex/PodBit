/**
 * Lab Framework — Type Definitions
 *
 * The lab framework generalizes the EVM into a template-based system where
 * all labs are separate servers with a uniform HTTP API. Podbit is purely
 * the client side: submit, poll, judge, apply graph consequences.
 *
 * @module lab/types
 */

// =============================================================================
// LAB TEMPLATE
// =============================================================================

/** Complete template definition — stored in `lab_templates` table as JSON columns */
export interface LabTemplate {
    id: string;
    name: string;
    description: string | null;
    systemTemplate: boolean;
    executionConfig: ExecutionConfig;
    triageConfig: TriageConfig | null;
    pollConfig: PollConfig;
    interpretConfig: InterpretConfig | null;
    outcomeConfig: OutcomeConfig;
    evidenceSchema: EvidenceSchemaEntry[] | null;
    budgetConfig: LabBudget | null;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// EXECUTION — how to talk to the lab server
// =============================================================================

/**
 * ALL labs are separate servers. The lab framework is purely an HTTP client.
 * Quick-verify is a server too — the EVM sandbox runs as its own HTTP service.
 */
export interface ExecutionConfig {
    /** Base URL of the lab server (e.g., "http://localhost:4714") */
    url: string;
    /** Path for job submission (default: "/submit") */
    submitEndpoint?: string;
    /** Path for status checks — {jobId} is substituted (default: "/status/{jobId}") */
    statusEndpoint?: string;
    /** Path for full results — {jobId} is substituted (default: "/result/{jobId}") */
    resultEndpoint?: string;
    /** HTTP method for submit (default: "POST") */
    method?: string;
    /** Custom headers to include on all requests */
    headers?: Record<string, string>;
    /** Authentication type */
    authType?: 'none' | 'api_key' | 'bearer' | 'header';
    /** Settings key for auth credential lookup (reads from settings table) */
    authKey?: string;
    /** Header name for auth injection (default: "Authorization") */
    authHeader?: string;
    /** JSON path to extract job ID from submit response (default: "jobId") */
    responseIdField?: string;
    /** Overall experiment timeout in milliseconds */
    timeoutMs?: number;
}

// =============================================================================
// TRIAGE — how to decide what to test
// =============================================================================

export interface TriageConfig {
    /** Override triage prompt key (for templates with custom triage logic) */
    promptKey?: string;
    /** Routing overrides per triage category */
    routingOverrides?: Record<string, string>;
}

// =============================================================================
// POLLING — how to check on long-running experiments
// =============================================================================

export interface PollConfig {
    /** Polling strategy */
    strategy: 'none' | 'interval' | 'webhook';

    // Interval polling
    /** How often to check status (default: 30000ms) */
    pollIntervalMs?: number;
    /** Give up after N polls (default: unlimited) */
    maxPollAttempts?: number;
    /** JSON path to status field in response (default: "status") */
    statusField?: string;
    /** Status values meaning the experiment is done */
    completionValues?: string[];
    /** Status values meaning the experiment failed (subset of completionValues) */
    failureValues?: string[];

    // Webhook (future)
    /** Callback path the lab server will POST to on completion */
    webhookPath?: string;
}

// =============================================================================
// INTERPRETATION — how to judge results
// =============================================================================

export interface InterpretConfig {
    /** Interpretation mode */
    mode: 'llm' | 'threshold' | 'pattern' | 'passthrough';
    /** LLM judge prompt template key (for 'llm' mode) */
    promptKey?: string;
    /** Which LLM subsystem evaluates (for 'llm' mode) */
    subsystem?: string;
    /** JSON path to metric for threshold mode */
    thresholdField?: string;
    /** Minimum value for threshold mode */
    thresholdMin?: number;
    /** Regex pattern for pattern mode */
    successPattern?: string;
    /** Map response fields to evidence items */
    resultMapping?: Record<string, string>;
}

// =============================================================================
// OUTCOMES — graph consequences of lab results
// =============================================================================

export interface OutcomeConfig {
    /** Freeze node when experiment starts (prevents synthesis during verification) */
    freezeOnStart?: boolean;
    /** Taint downstream children when claim is refuted */
    taintOnRefute?: boolean;
    /** Weight boost on verified/supported claim */
    weightBoostOnVerified?: number;
    /** Weight penalty on failed/refuted claim */
    weightPenaltyOnFailed?: number;
    /** Create findings as a child node */
    createChildNode?: boolean;
    /** Node type for created child (default: 'synthesis') */
    childNodeType?: string;
}

// =============================================================================
// EVIDENCE — typed output from lab experiments
// =============================================================================

/** A single piece of evidence from a lab experiment */
export interface EvidenceItem {
    /** Evidence type */
    type: 'text' | 'json' | 'image' | 'csv' | 'metric' | 'timeseries';
    /** Human-readable label (e.g., "stdout", "loss_curve", "accuracy") */
    label: string;
    /** Content: text, JSON string, or base64 for binary data */
    data: string;
    /** MIME type for binary data (e.g., "image/png") */
    mimeType?: string;
}

/** Schema entry defining expected evidence from a template */
export interface EvidenceSchemaEntry {
    type: string;
    label?: string;
    required: boolean;
    mimeTypes?: string[];
}

// =============================================================================
// BUDGET — cost control for external compute
// =============================================================================

export interface LabBudget {
    /** Estimated cost per second of execution (USD) */
    costPerSecondEstimate?: number;
    /** Hard cap on experiment duration in seconds */
    maxDurationSeconds?: number;
    /** Budget pool name (default: "lab") */
    category?: string;
}

// =============================================================================
// EXPERIMENT SPEC — what Podbit sends to labs
// =============================================================================

/**
 * Experiment Spec — what Podbit sends to a lab.
 *
 * Intentionally simple. Podbit asks a question, the lab answers it.
 * The lab decides HOW to test — codegen, simulation, lookup, whatever.
 * The lab decides HOW to evaluate — numerical comparison, LLM, domain-specific.
 * Podbit only cares about the verdict and the evidence trail.
 */
export interface ExperimentSpec {
    /** Which lab capability handles this (must match a key in the lab's specTypes) */
    specType: string;

    /** The testable hypothesis — what should be true if the claim is correct */
    hypothesis: string;

    /**
     * Everything the lab needs to run the experiment.
     * Structure is lab-defined — each lab's specType description says what to put here.
     * Podbit doesn't interpret this; it's pass-through to the lab.
     */
    setup: Record<string, any>;

    /** Source node ID — for audit trail */
    nodeId: string;

    /** Claim classification (informational — lab can use or ignore) */
    claimType?: string;

    /** Optional hints from the spec extractor to the lab */
    hints?: Record<string, any>;
}

// =============================================================================
// LAB SERVER CONTRACT — uniform API for all lab servers
// =============================================================================

/**
 * Request body for POST /submit.
 *
 * Podbit sends an experiment specification. The lab never sees the
 * original claim narrative. It receives experiment descriptions and
 * returns measured data.
 */
export interface LabSubmitRequest {
    /** The experiment specification to execute */
    spec: ExperimentSpec;
}

/** Response from POST /submit */
export interface LabSubmitResponse {
    /** Server-assigned job identifier */
    jobId: string;
    /** Whether the lab accepted the task */
    accepted?: boolean;
    /** Position in the lab's queue (0 = active) */
    queuePosition?: number;
    /** Estimated time to completion in milliseconds */
    estimatedCompletionMs?: number;
    /** Lab requests exclusive local resources — Podbit should pause LLM cycles while this job runs */
    resourceLock?: boolean;
}

/** Response from GET /status/{jobId} */
export interface LabStatusResponse {
    /** Current job status */
    status: 'queued' | 'running' | 'completed' | 'failed';
    /** Optional progress indicator (0.0 - 1.0) */
    progress?: number;
    /** Optional status message */
    message?: string;
    /** Position in the lab's queue (0 = active) */
    queuePosition?: number;
    /** Estimated time to completion in milliseconds */
    estimatedCompletionMs?: number;
    /** When the job started running */
    startedAt?: string;
    /** Artifacts available so far (partial list during execution) */
    artifacts?: Artifact[];
    /** Lab's current resource state — "active" means lab is using resources, "idle" means done */
    resourceState?: 'active' | 'idle';
}

/**
 * Response from GET /result/{jobId}.
 *
 * The lab returns a VERDICT. The lab runs the experiment, evaluates its own
 * results (with its own LLM if needed), and returns a complete verdict with
 * evidence and artifacts. Podbit applies graph consequences.
 */
export interface LabResultResponse {
    /** The lab's verdict on the experiment */
    verdict: 'supported' | 'refuted' | 'inconclusive' | 'not_testable' | 'error';
    /** Confidence in the verdict (0.0 - 1.0) */
    confidence: number;
    /** What was tested (the lab's hypothesis formulation) */
    hypothesis?: string;
    /** How the lab classified the claim */
    testCategory?: string;
    /** Human-readable prose explanation of the verdict — short, render-as-text */
    details?: string;
    /**
     * Optional structured payload accompanying the verdict.
     *
     * Use this for rich data the GUI should render as fields, lists, or tables —
     * not as a stringified blob. Critique-lab puts its action / corrected verdict /
     * issues / guidance / rewritten claim here. Math-lab can put computed
     * measurements here. Anything that's "more than prose" goes here, NOT inside
     * `details` as escaped JSON. Renderers should treat unknown keys gracefully.
     */
    structuredDetails?: Record<string, unknown>;
    /** Files produced by the experiment — fetched separately via GET /artifacts */
    artifacts: Artifact[];
    /** Execution time in milliseconds */
    executionTimeMs?: number;
    /** Error message (when verdict is 'error') */
    error?: string;
}

/**
 * A file artifact produced by a lab experiment.
 * Fetched from the lab server via GET {url} (relative to lab base URL).
 */
export interface Artifact {
    /** Human-readable label (e.g., "loss_plot", "confusion_matrix", "model_weights") */
    label: string;
    /** MIME type (e.g., "image/png", "text/csv", "application/octet-stream") */
    type: string;
    /** URL path relative to lab server base (e.g., "/artifacts/{jobId}/loss_plot.png") */
    url: string;
    /** File size in bytes (for budget/download decisions) */
    sizeBytes?: number;
}

// =============================================================================
// LAB REGISTRY — server registration (system DB)
// =============================================================================

/**
 * Lab Self-Description — the standard schema every lab MUST return from GET /capabilities.
 *
 * This is the contract between any lab and Podbit. Podbit uses this to:
 * 1. Route experiments to the right lab (spec extractor reads specTypes + descriptions)
 * 2. Avoid sending unsupported work (cannotDo, constraints)
 * 3. Monitor health (queueLimit, features)
 * 4. Display in the GUI (name, description, specTypes)
 *
 * Every lab fills in the same structure. Podbit never guesses.
 */
export interface LabCapabilities {
    /** Lab name (e.g., "Math Lab", "Simulation Lab") */
    name: string;
    /** Semantic version */
    version: string;
    /** One-paragraph description of what this lab IS and HOW it works (execution environment, approach) */
    description: string;

    /**
     * What experiment types this lab handles.
     * Object format: { typeName: "description of what the lab tests for this type and what to put in setup" }
     * String array format (legacy): just type names, no descriptions.
     */
    specTypes: Record<string, string> | string[];

    /** Max concurrent jobs before the lab starts rejecting */
    queueLimit: number;
    /** Minimum seconds the lab keeps artifacts before cleanup */
    artifactTtlSeconds: number;
    /** High-level feature flags */
    features: string[];
}

/**
 * Identifier for a port slot in `config/port-defaults.json` (and `PORTS` in `config/ports.ts`).
 * When a `LabRegistryEntry` declares a `portKey`, its effective URL is computed at read time
 * from `localUrl(PORTS[portKey])` and the stored `url` column becomes a hint only. This is
 * how built-in / co-located labs stay config-driven instead of accumulating stale URLs in
 * the DB after a port change. Remote (user-added) labs leave portKey null and rely on the
 * stored URL.
 */
export type LabPortKey = 'mathLab' | 'nnLab' | 'critiqueLab';

/** A registered lab server entry (from lab_registry table in system DB) */
export interface LabRegistryEntry {
    id: string;
    name: string;
    description: string | null;
    /**
     * Effective URL the lab is reachable at. If `portKey` is set, this is computed from
     * the config (`localUrl(PORTS[portKey])`) on every read and the stored DB column is
     * ignored. If `portKey` is null, this is the user-stored URL from the DB column.
     */
    url: string;
    /**
     * Optional binding to a config-driven port slot. When non-null, `url` is overlaid from
     * `PORTS[portKey]` at read time and a port change in `.env` propagates without any DB edits.
     * Built-in labs (math-lab, nn-lab, critique-lab) MUST set this. Remote labs leave it null.
     */
    portKey: LabPortKey | null;
    authType: 'none' | 'bearer' | 'api_key' | 'header';
    authCredential: string | null;
    authHeader: string | null;
    capabilities: LabCapabilities;
    specTypes: string[];
    queueLimit: number | null;
    artifactTtlSeconds: number | null;
    version: string | null;
    healthStatus: 'ok' | 'degraded' | 'offline' | 'unknown';
    healthCheckedAt: string | null;
    healthMessage: string | null;
    queueDepth: number;
    enabled: boolean;
    priority: number;
    tags: string[];
    templateId: string | null;
    /** Editable prompt describing this lab for the spec extractor. Auto-synced from capabilities unless user-edited. */
    contextPrompt: string | null;
    /** True if user has manually edited the context prompt — stops auto-sync from capabilities */
    contextPromptEdited: boolean;
    /** URL to the lab's queue management UI (e.g., /ui endpoint). Shown in GUI as "Open Lab" link. */
    uiUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// NODE LAB STATUS
// =============================================================================

/** Values for the `lab_status` column on nodes */
export type LabStatus = 'frozen' | 'tainted';

// =============================================================================
// DATABASE ROW SHAPE
// =============================================================================

/** Row shape for the lab_templates table */
export interface LabTemplateRow {
    id: string;
    name: string;
    description: string | null;
    system_template: number;
    execution_config: string | null;
    triage_config: string | null;
    poll_config: string | null;
    interpret_config: string | null;
    outcome_config: string | null;
    evidence_schema: string | null;
    budget_config: string | null;
    created_at: string;
    updated_at: string;
}
