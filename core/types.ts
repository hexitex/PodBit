/**
 * Shared TypeScript types for the core/ synthesis engine and autonomous cycles.
 *
 * These types are consumed across the synthesis pipeline (voicing, scoring,
 * node-ops, autonomous-cycles) and are re-exported from the `core/` barrel.
 * Feedback-related types are also defined here to keep all node-level
 * data structures co-located.
 */

/**
 * A knowledge graph node as stored in the `nodes` table.
 *
 * This is the universal node shape returned by DB queries and passed through
 * the synthesis pipeline, scoring functions, hallucination detection, and
 * feedback system. Not all fields are always present -- optional fields are
 * populated depending on the query (e.g. `embedding` is omitted from
 * lightweight listing queries).
 */
export interface ResonanceNode {
    id: string;
    name?: string | null;
    content: string;
    embedding?: string | number[] | null;
    weight: number;
    salience: number;
    specificity?: number;
    domain?: string | null;
    node_type?: string;
    trajectory?: string | null;
    origin?: string | null;
    contributor?: string | null;
    archived?: boolean;
    created_at?: string;
    updated_at?: string;
    source_id?: string;
    metadata?: string | null;
    generation?: number;
    verification_status?: string | null;
    verification_score?: number | null;
    feedback_rating?: number | null;
}

/**
 * Options bag for {@link createNode} in `node-ops.ts`.
 *
 * Controls domain assignment, initial weight/salience, contributor attribution,
 * model provenance, and pipeline bypass flags. The index signature allows
 * forward-compatible extension without breaking callers.
 */
export interface CreateNodeOptions {
    domain?: string | null;
    trajectory?: string | null;
    weight?: number;
    salience?: number;
    contributor?: string | null;
    decidedByTier?: string;
    skipDedup?: boolean;
    metadata?: Record<string, any> | null;
    modelId?: string | null;
    modelName?: string | null;
    [key: string]: any;
}

/**
 * Structured log entry emitted after each synthesis attempt.
 *
 * Captures parent nodes, resonance score, whether a child was created,
 * and the synthesis mode used (pairwise, cluster, or domain-directed).
 * Consumed by the activity feed and the GUI's synthesis health dashboard.
 */
export interface SynthesisCycleLogData {
    nodeA?: ResonanceNode;
    nodeB?: ResonanceNode;
    resonance: number;
    threshold: number;
    createdChild: boolean;
    childId?: string;
    trajectory?: string;
    domain?: string | null;
    parentIds?: string[];
    fitnessScore?: number;
    synthesisMode?: 'pairwise' | 'cluster' | 'domain_directed';
    domainPair?: { domainA: string; domainB: string };
}

/**
 * Options for starting a synthesis engine run.
 *
 * Passed to the top-level synthesis entry points. `domain` restricts
 * pair selection to a single domain's partition set; `maxCycles` caps
 * iterations; `mode` selects the caller context (API route vs MCP tool).
 */
export interface SynthesisEngineOptions {
    domain?: string | null;
    maxCycles?: number;
    mode?: 'api' | 'mcp';
}

// =============================================================================
// AUTONOMOUS CYCLE TYPES
// =============================================================================

/**
 * Discriminated union of all autonomous cycle identifiers.
 *
 * Each value maps to a dedicated cycle function in `autonomous-cycles.ts`
 * and a shared {@link CycleState} entry in `synthesis-engine-state.ts`.
 * The GUI uses these strings as keys for start/stop controls and status display.
 */
export type CycleType = 'synthesis' | 'validation' | 'questions' | 'tensions' | 'research' | 'autorating' | 'evm' | 'voicing' | 'ground_rules' | 'population_control';

/**
 * Mutable runtime state for a single autonomous cycle.
 *
 * One instance exists per {@link CycleType} in the `cycleStates` map
 * (see `synthesis-engine-state.ts`). `running` and `shouldStop` implement
 * cooperative cancellation: the GUI sets `shouldStop = true` and the
 * cycle loop checks it between iterations via {@link abortableSleep}.
 */
export interface CycleState {
    running: boolean;
    shouldStop: boolean;
    cycleCount: number;
    errorCount: number;
    startedAt: string | null;
    lastCycleAt: string | null;
    lastError: string | null;
}

/**
 * A high-resonance node pair surfaced during synthesis that has not yet been voiced.
 *
 * Discoveries are stored in a pending queue and shown in the GUI for human
 * review. Status transitions: `pending` -> `voiced` (after voicing) or
 * `pending` -> `dismissed` (if the user rejects the pairing).
 */
export interface Discovery {
    nodeA: { id: string; content: string; domain?: string | null };
    nodeB: { id: string; content: string; domain?: string | null };
    resonance: number;
    discoveredAt: string;
    status: 'pending' | 'voiced' | 'dismissed';
}

export interface ValidationDimension {
    score: number;
    reason: string;
}

export interface ValidationResult {
    synthesis?: ValidationDimension;
    novelty?: ValidationDimension;
    testability?: ValidationDimension;
    tension_resolution?: ValidationDimension;
    is_breakthrough: boolean;
    summary?: string;
    scores?: {
        synthesis: number;
        novelty: number;
        testability: number;
        tension_resolution: number;
    };
    composite?: number;
    validated_at?: string;
    error?: string;
    raw?: string;
}

/**
 * A detected tension (contradiction) between two knowledge nodes.
 *
 * Found by the tensions cycle: nodes with high embedding similarity but
 * opposing claims. `signals` lists the heuristic reasons the pair was
 * flagged (e.g. negation words, antonym detection). `combinedScore`
 * merges embedding similarity with tension signal strength for ranking.
 */
export interface TensionResult {
    nodeA: { id: string; content: string; domain?: string | null };
    nodeB: { id: string; content: string; domain?: string | null };
    similarity: number;
    tensionScore: number;
    signals: string[];
    combinedScore: number;
}

/**
 * Result of a governance override check (e.g. domain lock, rate limit).
 *
 * Returned by governance guard functions to indicate whether an operation
 * (node creation, promotion, archival) is permitted. When `allowed` is
 * false, `reason` explains the policy violation. `lastDecision` carries
 * the most recent decision-log row for context if one exists.
 */
export interface OverrideResult {
    allowed: boolean;
    reason: string;
    lastDecision?: any;
}

// =============================================================================
// FEEDBACK TYPES
// =============================================================================

/**
 * Feedback rating values:
 *  1 = useful (promotes weight)
 *  0 = not useful (neutral/slight demote)
 * -1 = harmful/wrong (demotes weight)
 */
export type FeedbackRating = 1 | 0 | -1;

/**
 * Feedback source indicates who/what provided the feedback.
 */
export type FeedbackSource = 'human' | 'agent' | 'auto';

/**
 * A single feedback record on a node.
 */
export interface NodeFeedback {
    id: string;
    node_id: string;
    rating: FeedbackRating;
    source: FeedbackSource;
    contributor?: string | null;
    note?: string | null;
    context?: string | null;       // JSON: { sessionId?, parentIds?, ... }
    weight_before?: number | null;
    weight_after?: number | null;
    created_at: string;
}

/**
 * Context object passed when recording feedback.
 * Stored as JSON in the `context` column.
 */
export interface FeedbackContext {
    sessionId?: string;
    parentIds?: string[];
    voicingMode?: string;
    synthesisCycleId?: string;
    [key: string]: any;
}

/**
 * Summary of a feedback item for display in recent feedback lists.
 * Uses camelCase to match JavaScript conventions in API responses.
 */
export interface FeedbackSummary {
    id: string;
    nodeId: string;
    rating: FeedbackRating;
    ratingLabel: string;
    source: FeedbackSource;
    contributor?: string | null;
    note?: string | null;
    weightBefore: number;
    weightAfter: number;
    weightChange: number;
    createdAt: string;
    node: {
        content: string;
        domain: string;
        type: string;
    };
}

/**
 * Aggregated feedback statistics.
 */
export interface FeedbackStats {
    totalFeedback: number;
    byRating: {
        useful: number;
        notUseful: number;
        harmful: number;
    };
    bySource: {
        human: number;
        agent: number;
        auto: number;
    };
    recentFeedback: FeedbackSummary[];
    nodesCovered: number;
    avgWeightChange: number;
    domain: string;
    days: number;
}

/**
 * Interface for auto-rater implementations.
 * Auto-raters evaluate nodes programmatically and return feedback.
 */
export interface AutoRater {
    /** Unique identifier for the rater */
    id: string;
    /** Human-readable description */
    description: string;
    /**
     * Evaluate a node and return a rating with optional note.
     * Returns null if the rater cannot evaluate this node.
     */
    evaluate(node: ResonanceNode, context?: FeedbackContext): Promise<{
        rating: FeedbackRating;
        note?: string;
    } | null>;
}
