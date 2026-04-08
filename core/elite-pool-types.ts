/**
 * Elite Verification Pool — Type Definitions
 *
 * The elite pool is a curated collection of high-confidence verified knowledge nodes.
 * These are NEW NODES created from EVM verification outputs — the verified finding
 * becomes a first-class node in the graph. The original synthesis node remains as a
 * parent; the elite node is its child.
 *
 * Generation tracking:
 *   Gen 0: Seed nodes
 *   Gen 1: Synthesis (structural claims from voicing/bridging)
 *   Gen 2: Verification node (EVM output promoted to elite)
 *   Gen 3: Elite-to-elite synthesis (bridging two Gen 2 nodes)
 *   Gen 4: Verification of elite synthesis (EVM output of Gen 3)
 *   ...and so on up to maxGeneration (configurable, default 4)
 */

import { RC } from '../config/constants.js';


// =============================================================================
// ELITE PROMOTION
// =============================================================================

/**
 * Result of attempting to promote a verified node into the elite pool.
 * On success, contains the new elite node ID and metadata.
 * On failure, contains the reason for rejection.
 */
export interface ElitePromotionResult {
    /** Whether the promotion succeeded. */
    success: boolean;
    /** The newly created elite node ID (present only on success). */
    eliteNodeId?: string;
    /** The original synthesis node that was verified. */
    sourceNodeId: string;
    /** The computed generation of the elite node (0-based). */
    generation: number;
    /** The knowledge domain of the elite node. */
    domain: string;
    /** EVM verification confidence score (0-1). */
    confidence?: number;
    /** Reason for rejection (present only on failure). */
    reason?: string;
    /** Dedup gate result if the node was rejected as a duplicate. */
    dedupResult?: EliteDedupResult;
    /** Manifest target mappings if the node was successfully mapped. */
    manifestMapping?: ManifestMapping;
    /** Number variables verified by this elite node's EVM execution. */
    verifiedVariables?: { varIds: string[]; count: number };
}

/**
 * Persistent record stored in the `elite_nodes` table for each promoted elite node.
 */
export interface EliteNodeRecord {
    /** FK to `nodes.id` — the newly created elite verification node. */
    nodeId: string;
    /** FK to `lab_executions.id` — the verification run that justified promotion. */
    sourceVerificationId: string;
    /** ISO 8601 timestamp of when the node was promoted. */
    promotedAt: string;
    /** EVM verification confidence score (0-1). */
    confidence: number;
    /** Classification of the verification approach used. */
    verificationType: 'mathematical' | 'logical' | 'empirical';
    /** Full provenance chain linking this node back to its ancestry. */
    provenanceChain: ProvenanceChain;
}

/**
 * Immutable provenance record linking an elite node back through the
 * verification and synthesis chain to its seed ancestors.
 */
export interface ProvenanceChain {
    /** The synthesis node whose claim was verified by EVM. */
    sourceNodeId: string;
    /** Grandparent node IDs (parents of the source synthesis node). */
    parentNodeIds: string[];
    /** The EVM-generated verification code that was executed. */
    verificationCode?: string;
    /** Truncated stdout from the verification sandbox execution. */
    verificationOutput?: string;
    /** EVM confidence score (0-1). */
    confidence: number;
    /** Classification of verification type (e.g. 'mathematical', 'logical'). */
    verificationType: string;
    /** Generation number of the elite node in the knowledge lineage. */
    generation: number;
}

// =============================================================================
// THREE-GATE DEDUPLICATION
// =============================================================================

/** The three sequential deduplication gates checked during elite promotion. */
export type EliteDedupGate = 'variable_overlap' | 'parent_lineage' | 'semantic_similarity';

/**
 * Result from the three-gate elite deduplication check.
 * If `isDuplicate` is true, the candidate was rejected at the indicated gate.
 */
export interface EliteDedupResult {
    /** Whether the candidate content was identified as a duplicate. */
    isDuplicate: boolean;
    /** The existing elite node ID that matched (present when duplicate). */
    matchedNodeId?: string;
    /** Which dedup gate triggered the match. */
    matchType?: EliteDedupGate;
    /** Similarity score (present for semantic_similarity gate). */
    score?: number;
    /** Human-readable description of the match. */
    details?: string;
}

// =============================================================================
// GENERATION TRACKING
// =============================================================================

/**
 * Computed generation metadata for a node based on its parent lineage.
 */
export interface GenerationInfo {
    /** The computed generation number (max(parent generations) + 1). */
    generation: number;
    /** The configured maximum generation ceiling. */
    maxGeneration: number;
    /** True if `generation` exceeds `maxGeneration`. */
    atCeiling: boolean;
    /** The generation numbers of each parent node. */
    parentGenerations: number[];
}

// =============================================================================
// MANIFEST MAPPING
// =============================================================================

/**
 * A single target from the project manifest that an elite node may address.
 */
export interface ManifestTarget {
    /** The category of manifest target. */
    type: 'goal' | 'question' | 'bridge';
    /** The text of the goal, question, or bridge pair. */
    text: string;
}

/**
 * Records which manifest targets an elite node is relevant to,
 * along with LLM-scored relevance for each target.
 */
export interface ManifestMapping {
    /** The elite node that was mapped. */
    eliteNodeId: string;
    /** Manifest targets that scored above the minimum relevance threshold. */
    targets: Array<{
        type: 'goal' | 'question' | 'bridge';
        text: string;
        /** LLM-scored relevance (0.0-1.0). */
        relevanceScore: number;
    }>;
    /** ISO 8601 timestamp of when the mapping was created. */
    mappedAt: string;
}

/**
 * Full manifest coverage report showing which targets have elite coverage
 * and which remain as gaps.
 */
export interface ManifestCoverage {
    /** Coverage details for each project goal. */
    goals: ManifestTargetCoverage[];
    /** Coverage details for each key question. */
    questions: ManifestTargetCoverage[];
    /** Coverage details for each cross-domain bridge. */
    bridges: ManifestTargetCoverage[];
    /** Goal texts with no elite node coverage. */
    uncoveredGoals: string[];
    /** Question texts with no elite node coverage. */
    uncoveredQuestions: string[];
    /** Bridge texts with no elite node coverage. */
    uncoveredBridges: string[];
    /** Fraction of all targets covered (0.0-1.0). */
    overallCoverage: number;
}

/**
 * Coverage detail for a single manifest target, showing which elite nodes
 * address it and the highest relevance score achieved.
 */
export interface ManifestTargetCoverage {
    /** The manifest target text. */
    text: string;
    /** Elite node IDs that cover this target (ordered by relevance descending). */
    coveredBy: string[];
    /** The highest relevance score among covering nodes (0 if uncovered). */
    bestScore: number;
}

/**
 * Summary of manifest targets that have no elite node coverage,
 * signaling to the synthesis engine which areas need more work.
 */
export interface ManifestGaps {
    /** Goal texts with no elite coverage. */
    uncoveredGoals: string[];
    /** Question texts with no elite coverage. */
    uncoveredQuestions: string[];
    /** Bridge texts with no elite coverage. */
    uncoveredBridges: string[];
    /** Total number of uncovered targets across all categories. */
    totalGaps: number;
    /** Total number of manifest targets across all categories. */
    totalTargets: number;
}

// =============================================================================
// ELITE-TO-ELITE BRIDGING
// =============================================================================

/**
 * A pair of elite nodes identified as candidates for cross-synthesis (bridging).
 * Pairs are scored and ranked by priority to guide the synthesis engine.
 */
export interface EliteBridgingCandidate {
    /** First elite node in the candidate pair. */
    nodeA: { id: string; content: string; domain: string; generation: number };
    /** Second elite node in the candidate pair. */
    nodeB: { id: string; content: string; domain: string; generation: number };
    /** Computed priority score (higher = more desirable pair). */
    bridgePriority: number;
    /** True if the pair spans a manifest-defined cross-domain bridge. */
    spansManifestBridge: boolean;
    /** Number of previous bridging attempts for this pair. */
    previousAttempts: number;
}

/** Possible outcomes of an elite-to-elite bridging attempt. */
export type BridgingOutcome = 'promoted' | 'rejected' | 'duplicate' | 'pending';

/**
 * Record of a single elite-to-elite bridging attempt, stored in the
 * `elite_bridging_log` table for tracking and retry limiting.
 */
export interface EliteBridgingAttempt {
    /** ID of the first parent elite node. */
    parentAId: string;
    /** ID of the second parent elite node. */
    parentBId: string;
    /** The resulting synthesis node ID (present if synthesis was attempted). */
    synthesisNodeId?: string;
    /** Outcome of the bridging attempt. */
    outcome: BridgingOutcome;
    /** ISO 8601 timestamp of the attempt. */
    attemptedAt: string;
}

// =============================================================================
// TERMINAL FINDINGS
// =============================================================================

/**
 * An elite node at the maximum generation ceiling — a terminal finding
 * that cannot produce further synthesis children and is ready for
 * empirical validation outside the system.
 */
export interface TerminalFinding {
    /** The elite node ID. */
    nodeId: string;
    /** The synthesized elite content. */
    content: string;
    /** The knowledge domain. */
    domain: string;
    /** Generation number (should equal maxGeneration). */
    generation: number;
    /** EVM verification confidence (0-1). */
    confidence: number;
    /** Manifest targets this finding addresses. */
    manifestTargets: ManifestTarget[];
    /** ISO 8601 timestamp of when the node was promoted to elite. */
    promotedAt: string;
}

// =============================================================================
// ELITE POOL STATS
// =============================================================================

/**
 * Aggregate statistics for the elite verification pool.
 */
export interface ElitePoolStats {
    /** Total number of active (non-archived) elite nodes. */
    totalEliteNodes: number;
    /** Count of elite nodes per generation number. */
    generationDistribution: Record<number, number>;
    /** Count of elite nodes per knowledge domain. */
    domainDistribution: Record<string, number>;
    /** Manifest coverage report (null if no manifest is configured). */
    manifestCoverage: ManifestCoverage | null;
    /** Aggregate counts of elite-to-elite bridging attempt outcomes. */
    bridgingAttempts: { total: number; promoted: number; rejected: number; duplicate: number };
    /** Number of nodes promoted in the last 7 days. */
    recentPromotions: number;
    /** Number of nodes at or above maxGeneration (terminal findings). */
    terminalFindings: number;
}

// =============================================================================
// QUERY OPTIONS
// =============================================================================

/**
 * Filtering options for querying elite nodes.
 */
export interface EliteQueryOptions {
    /** Filter to a specific knowledge domain. */
    domain?: string;
    /** Minimum generation number (inclusive). */
    minGeneration?: number;
    /** Maximum generation number (inclusive). */
    maxGeneration?: number;
    /** Filter to nodes mapped to a specific manifest target type. */
    manifestTargetType?: 'goal' | 'question' | 'bridge';
    /** Maximum number of results to return (default: RC.queryLimits.eliteQueryDefaultLimit). */
    limit?: number;
    /** Number of results to skip for pagination (default: 0). */
    offset?: number;
}
