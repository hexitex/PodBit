/**
 * Provenance tagging — compact epistemic status tags for node display.
 *
 * Computes a bracket tag from existing DB columns (node_type, generation,
 * contributor, origin, verification_status, verification_score) and formats
 * nodes for LLM consumption. No new DB columns needed.
 *
 * Tag format:  [primary_type | generation | source_hint? | verification?]
 *
 * Examples:
 *   [seed|g0|kb]         — KB-ingested seed
 *   [seed|g0|human]      — Human-entered seed
 *   [synthesis|g1]       — First-gen synthesis
 *   [synthesis|g3+]      — Deep chain (gen >= 3)
 *   [synthesis|g1|v:92]  — EVM-verified, 92% confidence
 *   [breakthrough|g2]    — Promoted breakthrough
 *   [question]           — Research question
 *   [elite|g3|v:98]      — Elite-verified node
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input for provenance tag computation. Accepts both snake_case (raw DB rows)
 * and camelCase (processed objects) field names.
 */
export interface ProvenanceInput {
    node_type?: string | null;
    nodeType?: string | null;
    generation?: number | null;
    contributor?: string | null;
    origin?: string | null;
    verification_status?: string | null;
    verificationStatus?: string | null;
    verification_score?: number | null;
    verificationScore?: number | null;
    feedback_rating?: number | null;
    feedbackRating?: number | null;
}

// =============================================================================
// TAG BUILDER
// =============================================================================

/** Map DB node_type values to display names */
const TYPE_DISPLAY: Record<string, string> = {
    'seed': 'seed',
    'voiced': 'synthesis',
    'synthesis': 'synthesis',
    'breakthrough': 'breakthrough',
    'question': 'question',
    'elite_verification': 'elite',
    'raw': 'raw',
};

/** Generation threshold for "deep chain" warning */
const DEEP_CHAIN_THRESHOLD = 3;

/**
 * Build a compact provenance tag from node metadata.
 *
 * @param node  Object with node metadata fields (all optional, defensive)
 * @returns     Tag string like "[synthesis|g1|v:92]"
 */
export function buildProvenanceTag(node: ProvenanceInput): string {
    const parts: string[] = [];

    // Segment 1: Primary type
    const nodeType = node.node_type || node.nodeType || 'seed';
    parts.push(TYPE_DISPLAY[nodeType] || nodeType);

    // Segment 2: Generation depth (skip for questions — always g0, type is sufficient)
    if (nodeType !== 'question') {
        const gen = node.generation ?? 0;
        parts.push(gen >= DEEP_CHAIN_THRESHOLD ? `g${gen}+` : `g${gen}`);
    }

    // Segment 3: Source hint (only when it adds information beyond default)
    const contributor = node.contributor || '';
    const origin = node.origin || '';
    if (contributor.startsWith('kb:') || origin.startsWith('reader_')) {
        parts.push('kb');
    } else if (contributor.startsWith('human:') || contributor === 'human' || origin === 'human') {
        parts.push('human');
    } else if (origin === 'research-cycle' || contributor === 'research-cycle') {
        parts.push('research');
    }
    // Autonomous synthesis (synthesis-engine, elite-bridging, etc.) — no source hint needed

    // Segment 4: Verification status (only when conclusive)
    const vStatus = node.verification_status || node.verificationStatus;
    const vScore = node.verification_score ?? node.verificationScore;
    if (vStatus === 'verified' && vScore != null) {
        parts.push(`v:${Math.round(vScore * 100)}`);
    } else if (vStatus === 'failed') {
        parts.push('vfail');
    }

    return `[${parts.join('|')}]`;
}

/**
 * Format a node for LLM consumption with provenance tag.
 * Replaces the old `[node_type|w:X.XX] content` format.
 *
 * @param node     Node object with metadata fields
 * @param content  Pre-resolved content (number variables already resolved)
 * @returns        Tagged string like "[synthesis|g1] Some insight here."
 */
export function formatNodeWithProvenance(node: ProvenanceInput, content: string): string {
    return `${buildProvenanceTag(node)} ${content}`;
}

// =============================================================================
// PROVENANCE GUIDE CONSTANTS
// =============================================================================

/**
 * Provenance guide for user-facing prompts (compress, summarize, docs, chat).
 * Injected once per prompt via {{provenanceGuide}}, not per node.
 */
export const PROVENANCE_GUIDE_USER = `PROVENANCE TAGS: Each node below is prefixed with a provenance tag indicating its epistemic status.
- [seed|g0|kb] or [seed|g0|human] = Primary source material (ingested or human-authored). Treat as factual grounding.
- [synthesis|gN] = LLM-synthesized from parent nodes. Higher generation = longer inference chain = more speculative. Present g1 as inferred, g3+ as speculative.
- [breakthrough|gN] = Validated significant insight. Higher confidence than regular synthesis.
- [synthesis|gN|v:NN] or [elite|gN|v:NN] = Computationally verified with NN% confidence.
- [synthesis|gN|vfail] = Failed computational verification. Present as hypothesis only.
- [question] = Open research question, not a claim.
- [seed|g0|research] = LLM-generated factual seed (not human-verified). Moderate confidence.
When summarizing or compressing, distinguish established knowledge (g0 seeds) from inferred conclusions (gN synthesis). Do not present unreviewed synthesis as established fact.`;

/**
 * Short provenance guide for synthesis/voicing prompts.
 */
export const PROVENANCE_GUIDE_SYNTHESIS = `NOTE ON INPUTS: Provenance tags show epistemic status. [seed|g0] = primary source. [synthesis|gN] = prior LLM synthesis — weigh with proportional confidence. Inputs tagged g3+ are deep inference chains and may have drifted from source material.`;

/**
 * Provenance guide for autorating/validation prompts.
 */
export const PROVENANCE_GUIDE_VALIDATION = `PROVENANCE CONTEXT: Tags show epistemic status. Apply extra scrutiny to nodes with generation >= 3 (deep synthesis chains). KB-ingested seeds ([seed|g0|kb]) are external source material. Research seeds ([seed|g0|research]) are LLM-generated. Verified nodes (v:NN) have computational backing at stated confidence. Factor provenance depth into your assessment.`;

/**
 * Provenance guide for EVM codegen/evaluation.
 */
export const PROVENANCE_GUIDE_EVM = `PROVENANCE: Tags show epistemic status. [seed|g0] = source material. [synthesis|gN] = derived claim (higher N = more speculative). [v:NN] = previously verified at NN% confidence. Consider provenance depth when assessing plausibility.`;
