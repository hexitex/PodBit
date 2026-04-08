/**
 * @module config-sections/embedding-eval
 *
 * Config section metadata for the embedding evaluation layer — instruction-aware
 * embedding checks that replace the LLM consultant in population control.
 * Uses Qwen3-Embedding-8B to detect failure modes (drift, lexical bridge,
 * number recycling, toxic parent) via cosine similarity under task-specific
 * instructions.
 */

import type { SectionMeta } from './types.js';

/** Embedding evaluation config section definitions. */
export const EMBEDDING_EVAL_SECTIONS: Record<string, SectionMeta> = {

    embedding_eval: {
        id: 'embedding_eval',
        tier: 'basic',
        title: 'Embedding Evaluation Layer',
        description: 'Instruction-aware embedding checks that replace the LLM consultant in population control — detects drift, lexical bridges, number recycling, and toxic parents via cosine similarity',
        behavior: `When live (shadow mode OFF), embedding eval replaces the LLM consultant entirely — zero LLM cost per evaluation. Each node is checked against its parents using instruction-aware embeddings. Binary outcome:

FAIL (any check score exceeds its threshold) → ARCHIVE the node
PASS (all check scores below thresholds) → BOOST the node (weight × Boost Multiplier)

Errors (embedding service down, model not responding) fail-open — the node passes.

HOW SCORES WORK: Each check computes cosine similarity (0.0–1.0) between instruction-aware embeddings. Higher scores mean the two texts are more similar for that specific check. Typical scores cluster between 0.65–0.85. Setting a threshold above the score range for your graph means that check will NEVER fire. Use the Embedding Eval calibration page to see your actual score distributions before choosing thresholds.

SHADOW MODE (ON): Both embedding checks AND the LLM consultant run. Embedding results are logged for calibration comparison but only the consultant's verdict takes effect. Use the Embedding Eval calibration page to compare decisions side-by-side before going live.

CROSS-PARAMETER CONSTRAINTS (auto-enforced on save):
• Lexical Bridge High > Lexical Bridge Low — high is the dominant-parent bar, low is the neglected-parent bar
• Toxic Parent Min Children >= Min Domains — can't span N domains with fewer than N children`,
        parameters: [
            // ── Controls ──────────────────────────────────────────────────
            {
                key: 'eeEnabled',
                label: 'Enabled',
                description: 'Enable the embedding evaluation layer. When disabled, population control uses only the LLM consultant (costs one LLM call per node).',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['embeddingEval', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'eeShadowMode',
                label: 'Shadow Mode',
                description: 'ON = embedding checks log results only, LLM consultant makes the actual decision (use for calibration). OFF = embedding checks decide directly: FAIL→archive, PASS→boost — no LLM call at all. Start with ON and check the Embedding Eval calibration page to see how scores distribute before switching to OFF.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['embeddingEval', 'shadowMode'],
                tier: 'basic',
            },
            // ── Outcome ──────────────────────────────────────────────────
            {
                key: 'eeBoostMultiplier',
                label: 'PASS → Boost Multiplier',
                description: 'Weight multiplier applied when all embedding checks PASS. Multiplied against the node\'s current weight — e.g., 1.1 means a node with weight 1.0 becomes 1.1 after passing. Weight is clamped to the engine weight ceiling. Set to 1.0 if you only want embedding eval to archive bad nodes without rewarding good ones. FAIL always archives — no multiplier needed.',
                min: 1.0, max: 1.5, step: 0.05, default: 1.1,
                configPath: ['embeddingEval', 'boostMultiplier'],
                tier: 'basic',
            },
            // ── Mode 8: Self-Reinforcing Drift → Archive ──────────────
            {
                key: 'eeDriftFail',
                label: 'Drift → Archive',
                description: 'Mode 8 — compares child to parent using structural claim embeddings. If cosine similarity exceeds this threshold, the child is just paraphrasing the parent → ARCHIVE. Typical drift scores range 0.65–0.85. At 0.80 (default), nodes scoring above 0.80 are archived as paraphrases — this catches the top ~15% of similar pairs. Setting above 0.88 means almost nothing will be caught. Setting below 0.75 will aggressively archive nodes that share legitimate structural patterns with their parents.',
                min: 0.70, max: 0.99, step: 0.01, default: 0.80,
                configPath: ['embeddingEval', 'driftFailThreshold'],
                tier: 'intermediate',
            },
            // ── Mode 1: Lexical Bridge → Archive ──────────────────────
            {
                key: 'eeLexicalHigh',
                label: 'Lexical Bridge: High (dominant parent) → Archive',
                description: 'Mode 1 — detects one-sided synthesis where the child copies one parent and ignores the other. This threshold is the similarity to the DOMINANT (closer) parent. If the child is above this AND below the Low threshold for the other parent → lexical bridge → ARCHIVE. Typical scores to the dominant parent range 0.70–0.85. At 0.78 (default), nodes that are >0.78 similar to one parent while <Low to the other are flagged. Setting above 0.85 means this check rarely fires. Setting below 0.75 catches subtler one-sided synthesis. CONSTRAINT: Must be > Low threshold.',
                min: 0.70, max: 0.99, step: 0.01, default: 0.78,
                configPath: ['embeddingEval', 'lexicalBridgeHighThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'eeLexicalLow',
                label: 'Lexical Bridge: Low (neglected parent)',
                description: 'Mode 1 — the similarity to the NEGLECTED (farther) parent. The lexical bridge only fires when this score is BELOW this threshold AND the dominant parent score is ABOVE the High threshold. This measures how much the child ignores one parent. At 0.40 (default), the neglected parent must be very dissimilar for the bridge to trigger. Raising to 0.55 catches cases where the neglected parent is moderately represented but still underweighted. Lowering to 0.25 only flags extreme one-parent copies. CONSTRAINT: Must be < High threshold.',
                min: 0.10, max: 0.60, step: 0.01, default: 0.40,
                configPath: ['embeddingEval', 'lexicalBridgeLowThreshold'],
                tier: 'intermediate',
            },
            // ── Mode 4: Number Recycling → Archive ────────────────────
            {
                key: 'eeNumberRecycling',
                label: 'Number Recycling → Archive',
                description: 'Mode 4 — compares quantitative claim embeddings between a node and nodes in OTHER domains. If numbers from one domain appear suspiciously similar in an unrelated domain above this threshold → recycling → ARCHIVE. Only runs on nodes containing numbers. Score distributions vary widely — nodes with genuinely unique numbers score 0.20–0.50, while recycled numbers score 0.80+. At 0.82 (default), only high-similarity cross-domain number matches are caught. Setting above 0.90 effectively disables this check for most graphs. Setting below 0.78 may false-positive on domains that legitimately share numeric patterns (e.g., percentages, common constants).',
                min: 0.70, max: 0.99, step: 0.01, default: 0.82,
                configPath: ['embeddingEval', 'numberRecyclingThreshold'],
                tier: 'intermediate',
            },
            // ── Mode 7: Toxic Parent → Archive ───────────────────────
            {
                key: 'eeToxicParent',
                label: 'Toxic Parent → Archive',
                description: 'Mode 7 — detects a parent node that stamps the same pattern onto multiple children across different domains. Computes the MEAN similarity of the parent to all its children. If above this threshold → toxic → ARCHIVE the parent (not the children). This catches template-like parents that produce homogeneous offspring. At 0.80 (default), a parent must be highly similar to ALL its cross-domain children on average. Setting below 0.75 catches parents with moderate but consistent influence. Setting above 0.85 only catches extreme contamination. Only runs when Min Children and Min Domains are met.',
                min: 0.60, max: 0.95, step: 0.01, default: 0.80,
                configPath: ['embeddingEval', 'toxicParentThreshold'],
                tier: 'advanced',
            },
            {
                key: 'eeToxicMinChildren',
                label: 'Toxic Parent: Min Children',
                description: 'Minimum children a parent must have before the toxic parent check runs. A parent with only 2 children is unlikely to show a contamination pattern — it needs enough children to establish a statistical signal. At 3 (default), parents with 3+ children across enough domains are checked. Raise to 5+ to only check prolific parents, reducing false positives but missing early contamination. CONSTRAINT: Must be >= Min Domains.',
                min: 2, max: 10, step: 1, default: 3,
                configPath: ['embeddingEval', 'toxicParentMinChildren'],
                tier: 'advanced',
            },
            {
                key: 'eeToxicMinDomains',
                label: 'Toxic Parent: Min Domains',
                description: 'Minimum distinct domains among a parent\'s children before the toxic parent check triggers. A parent whose children are all in the SAME domain is expected to be similar — that is not cross-domain contamination. At 3 (default), the parent\'s children must span at least 3 different domains for the check to run. Lowering to 2 catches contamination across just 2 domains. Raising above 3 requires wider contamination evidence. CONSTRAINT: Must be <= Min Children.',
                min: 2, max: 5, step: 1, default: 3,
                configPath: ['embeddingEval', 'toxicParentMinDomains'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Shadow Only', intent: 'Enable with shadow mode on — log results but don\'t gate. Start here to see score distributions on the Embedding Eval calibration page before choosing thresholds.' },
            { label: 'Conservative', intent: 'Enable live (shadow off) with high fail thresholds (drift 0.88, recycling 0.88, bridge high 0.85/low 0.35) — only archive the most obvious failures. Boost multiplier 1.05. Use this if you\'d rather miss some junk than accidentally archive good nodes.' },
            { label: 'Aggressive', intent: 'Enable live (shadow off) with lower thresholds (drift 0.78, recycling 0.80, bridge high 0.76/low 0.50) — archive more aggressively, catching subtler paraphrases and one-sided synthesis. Boost multiplier 1.15. Use this if your graph has a lot of low-quality synthesis output.' },
            { label: 'Disabled', intent: 'Disable the embedding evaluation layer entirely — all nodes evaluated by the LLM consultant (one LLM call per node).' },
        ],
    },
};
