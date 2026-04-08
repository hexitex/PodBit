/**
 * @module config-sections/population-control
 *
 * Config section metadata for the Population Control cycle — a post-birth
 * quality evaluation system that runs as an autonomous cycle. A single
 * comprehensive LLM call evaluates each node against its parents, scoring
 * coherence, grounding, novelty, specificity, and incremental value.
 * Nodes that pass are boosted; nodes that fail are demoted or archived.
 */

import type { SectionMeta } from './types.js';

/** Population control cycle config section definition. */
export const POPULATION_CONTROL_SECTIONS: Record<string, SectionMeta> = {

    population_control: {
        id: 'population_control',
        tier: 'basic',
        title: 'Population Control',
        description: 'Post-birth quality cycle — evaluates recently synthesized nodes via a single LLM call and demotes or archives weak ones',
        behavior: `The population control cycle runs in the background, picking up nodes that have passed their grace period since creation. For each node, it recovers parent nodes and evaluates quality.

Two evaluation modes (controlled by the Embedding Evaluation Layer section):

Embedding eval LIVE (shadow mode OFF): Embedding eval replaces the LLM consultant entirely. Instruction-aware cosine similarity checks decide the outcome — no LLM call, zero cost per node. Binary outcome:
• FAIL (any check) → archive
• PASS (all checks) → boost (weight × Embedding Eval Boost Multiplier)

Embedding eval SHADOW (shadow mode ON) or DISABLED: The LLM consultant runs a single comprehensive call scoring coherence, grounding, novelty, specificity, and incremental value. Three outcomes based on composite score:
• Score >= Pass Threshold → boost (weight × Boost Multiplier)
• Score >= Archive Threshold → demote (weight × Demote Multiplier)
• Score < Archive Threshold → archive
When shadow mode is on, embedding checks also run and log results alongside for calibration comparison — but only the LLM consultant's verdict takes effect.

Cross-parameter constraint (auto-enforced): Pass Threshold must be > Archive Threshold.`,
        parameters: [
            {
                key: 'pcEnabled',
                label: 'Enabled',
                description: 'Enable the population control cycle. When disabled, no post-birth quality evaluation occurs — synthesis output lives or dies by birth-time checks only.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['populationControl', 'enabled'],
            },
            {
                key: 'pcIntervalMs',
                label: 'Cycle Interval (ms)',
                description: 'Milliseconds between population control ticks. At 120000 (default, 2 minutes), with batchSize=5, the system evaluates up to 5 nodes every 2 minutes — 150 nodes/hour. At 60000 (1 min), throughput doubles to 300/hour but LLM costs double. At 600000 (10 min), throughput drops to 30/hour — suitable for small graphs or limited LLM budgets. Each tick costs batchSize LLM calls (when not using embedding eval).',
                min: 10000, max: 600000, step: 10000, default: 120000,
                configPath: ['populationControl', 'intervalMs'],
            },
            {
                key: 'pcGracePeriodHours',
                label: 'Grace Period (hours)',
                description: 'Hours after creation before a node is eligible for quality evaluation. At 2 hours (default), nodes get time to participate in a few synthesis cycles before being judged — a node created at noon faces culling starting at 2pm. At 0.5 (30 min), nodes are evaluated almost immediately — useful when you want fast feedback but the node may not have had time to produce children. At 48, nodes are protected for 2 days — very lenient, suitable if your synthesis cycles are slow.',
                min: 0.5, max: 48, step: 0.5, default: 2,
                configPath: ['populationControl', 'gracePeriodHours'],
            },
            {
                key: 'pcBatchSize',
                label: 'Batch Size',
                description: 'Maximum nodes to evaluate per tick. At 5 (default), each tick evaluates up to 5 nodes — each costing one LLM call when using the consultant (zero cost with embedding eval live). At 1, nodes are evaluated one at a time — minimal load but slow throughput. At 20, 20 LLM calls fire per tick — fast throughput but significant cost. For embedding eval live mode, higher batch sizes are essentially free.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['populationControl', 'batchSize'],
            },
            {
                key: 'pcThreshold',
                label: 'Pass Threshold → Boost',
                description: 'LLM consultant composite score (1-10) at or above which a node is boosted. The consultant scores 6 dimensions (coherence, grounding, novelty, specificity, forced analogy, incremental value) weighted by the Quality Scoring Dimensions section. At 5.0 (default), roughly 50-60% of synthesis passes — the consultant is moderately selective. At 7.0, only ~20-30% passes — very strict, only the best synthesis survives. At 3.0, ~80% passes — minimal culling, mostly catches garbage. Score between this and Archive Threshold = demote (weight reduced). Only used when Embedding Eval is disabled or in shadow mode. CONSTRAINT: Must be > Archive Threshold.',
                min: 1, max: 9, step: 0.5, default: 5.0,
                configPath: ['populationControl', 'threshold'],
            },
            {
                key: 'pcArchiveThreshold',
                label: 'Archive Threshold',
                description: 'LLM consultant score below which nodes are archived (removed from active graph entirely). At 2.0 (default) with Pass Threshold 5.0, the three zones are: archive (<2), demote (2-5), boost (>=5). At 3.0, the demote zone shrinks to [3, 5] and more content is archived. At 1.0, only the worst-scoring content is removed — almost everything survives as at least a demotion. The archive threshold should match how much junk your synthesis produces: high junk rate → raise this. CONSTRAINT: Must be < Pass Threshold.',
                min: 0, max: 5, step: 0.5, default: 2.0,
                configPath: ['populationControl', 'archiveThreshold'],
            },
            {
                key: 'pcDemoteWeight',
                label: 'Demote Weight Multiplier',
                description: 'Weight multiplier when LLM consultant scores between Archive and Pass thresholds (demote zone). At 0.5 (default), a node with weight 1.0 drops to 0.5 — halved, significantly reducing its sampling probability. At 0.3, weight drops to 0.3 — harsh, the node is effectively sidelined. At 0.8, weight drops to 0.8 — gentle tap on the wrist, node stays competitive. Demoted nodes can recover through parent boosts if they produce good children in future synthesis. Only used when Embedding Eval is disabled or in shadow mode.',
                min: 0.1, max: 0.9, step: 0.05, default: 0.5,
                configPath: ['populationControl', 'demoteWeight'],
            },
            {
                key: 'pcBoostWeight',
                label: 'Boost Weight Multiplier',
                description: 'Weight multiplier when LLM consultant scores at or above Pass Threshold. At 1.1 (default), a passing node with weight 1.0 becomes 1.1 — modest reward. At 1.3, weight jumps to 1.3 — strong reward, passing nodes quickly climb toward the weight ceiling. At 1.0, passing has no weight effect — population control only punishes, never rewards. Weight is clamped to the engine weight ceiling (default 3.0). Only used when Embedding Eval is disabled or in shadow mode.',
                min: 1.0, max: 1.5, step: 0.05, default: 1.1,
                configPath: ['populationControl', 'boostWeight'],
            },
        ],
        presets: [
            { label: 'Strict Culling', intent: 'Raise the pass threshold to 6 and archive threshold to 3 for aggressive quality control. Set demote weight to 0.3 and boost weight to 1.2.' },
            { label: 'Permissive', intent: 'Lower the pass threshold to 3 and archive threshold to 1 for minimal culling. Set demote weight to 0.7 and boost weight to 1.05.' },
            { label: 'Default', intent: 'Reset all population control parameters to their defaults: threshold 4, archive threshold 2, grace period 2 hours, batch size 5.' },
        ],
    },

    dedup_sweep: {
        id: 'dedup_sweep',
        tier: 'basic',
        title: 'Automatic Dedup Sweep',
        description: 'Embedding-only duplicate detection that runs every population control tick — finds and archives redundant nodes without any LLM cost',
        behavior: `Each population control tick, after individual node evaluation, the dedup sweep scans each domain for clusters of semantically duplicate nodes. It uses the same star clustering algorithm as manual dedup: cosine similarity + word overlap to find pairs, then greedy center-based clustering where the highest-weight node becomes the cluster center and all members are archived.

The sweep targets the newest, lowest-weight nodes first — these are the most likely to be redundant synthesis outputs that slipped through the birth gate. Parent-child and tension-source edges are excluded from clustering (lineage is not duplication).

Key design: no LLM is involved. This is pure vector math — cosine similarity between embeddings plus word overlap as a fallback. The thresholds are intentionally stricter than the birth gate (0.90 vs 0.87 for embeddings) to avoid false positives in the automated sweep.

The sweep runs even when the main population control cycle is disabled — as long as dedupSweep.enabled is true and population control is running, it will clean duplicates each tick.`,
        parameters: [
            {
                key: 'dsEnabled',
                label: 'Enabled',
                description: 'Enable the automatic dedup sweep. When enabled, every population control tick runs an embedding-only duplicate scan across all active domains. Zero LLM cost.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['populationControl', 'dedupSweep', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'dsMaxAgeDays',
                label: 'Max Node Age (days)',
                description: 'Only consider nodes created within the last N days. At 7 (default), the sweep scans the most recent week of synthesis output — enough to catch batch-produced duplicates without scanning the entire graph. At 1, only today\'s output is scanned — fast but misses duplicates from yesterday. At 30, scans the last month — thorough but the O(n²) comparison gets expensive with hundreds of nodes per domain.',
                min: 1, max: 30, step: 1, default: 7,
                configPath: ['populationControl', 'dedupSweep', 'maxAgeDays'],
                tier: 'intermediate',
            },
            {
                key: 'dsMaxNodesPerDomain',
                label: 'Max Nodes Per Domain',
                description: 'Maximum nodes to compare per domain per sweep. Star clustering is O(n²), so this caps the computational cost. At 100 (default), each domain compares up to 4,950 pairs — takes milliseconds with pre-computed embeddings. At 50, 1,225 pairs — faster but may miss duplicates if the domain produces a lot of output. At 200, 19,900 pairs — thorough but could be slow on very active domains.',
                min: 20, max: 500, step: 10, default: 100,
                configPath: ['populationControl', 'dedupSweep', 'maxNodesPerDomain'],
                tier: 'intermediate',
            },
            {
                key: 'dsEmbeddingThreshold',
                label: 'Embedding Similarity Threshold',
                description: 'Cosine similarity threshold above which two nodes are considered duplicates. At 0.90 (default), only very similar content is flagged — stricter than the birth gate (0.87) to minimize false positives in automated archival. At 0.85, more aggressive — catches paraphrases but may incorrectly cluster nodes that discuss the same topic from different angles. At 0.95, extremely conservative — only near-identical content is caught. If the sweep archives things that shouldn\'t be archived, raise this. If duplicates persist, lower it.',
                min: 0.80, max: 0.98, step: 0.01, default: 0.90,
                configPath: ['populationControl', 'dedupSweep', 'embeddingThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'dsWordOverlapThreshold',
                label: 'Word Overlap Threshold',
                description: 'Jaccard-like word overlap threshold — intersection / min(sizeA, sizeB). Acts as a fallback when embeddings aren\'t available or as a second signal. At 0.80 (default), nodes sharing 80% of their significant words (3+ chars) are flagged. At 0.70, more aggressive. At 0.90, very conservative — only near-verbatim copies are caught by word overlap alone.',
                min: 0.60, max: 0.95, step: 0.05, default: 0.80,
                configPath: ['populationControl', 'dedupSweep', 'wordOverlapThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Aggressive', intent: 'Lower embedding threshold to 0.87, word overlap to 0.70, scan 30 days of output with up to 200 nodes per domain' },
            { label: 'Conservative', intent: 'Raise embedding threshold to 0.94, word overlap to 0.85, scan only 3 days with 50 nodes per domain' },
            { label: 'Default', intent: 'Reset dedup sweep to defaults: embedding 0.90, word overlap 0.80, 7 days, 100 nodes per domain' },
        ],
    },
};
