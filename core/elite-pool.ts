/**
 * Elite Verification Pool — Main Module
 *
 * The elite pool is a curated collection of high-confidence verified knowledge nodes.
 * These are NEW NODES created from EVM verification outputs — the verification result
 * itself becomes a first-class node in the graph. The original synthesis node remains
 * as a parent; the elite node is its child.
 *
 * The elite pool is the FINAL RESTING PLACE for manifest targets — it is where the
 * system's discoveries accumulate. It grows continuously and is never pruned.
 *
 * Key constraints:
 * - Elite nodes are immutable once promoted — the pool only grows
 * - Number variable isolation is maintained at ALL generations
 * - Dedup runs ONLY against the elite pool (not the general graph)
 * - Generation is set once at creation and never changed
 * - Elite-to-elite bridging requires BOTH parents to be elite
 * - Nodes at maxGeneration cannot be synthesis parents (terminal findings)
 *
 * Sub-modules:
 *   elite-pool-promotion    — promoteToElite, scanExistingVerified, demoteFromElite
 *   elite-pool-dedup        — checkEliteDedup (3-gate: variable overlap, parent lineage, semantic)
 *   elite-pool-generation   — computeGeneration, backfillGenerations
 *   elite-pool-manifest     — mapToManifest, getManifestCoverage, getManifestGaps, getTerminalFindings
 *   elite-pool-bridging     — getEliteBridgingCandidates, logBridgingAttempt
 *   elite-pool-queries      — getEliteNodes, getElitePoolStats
 */

export { promoteToElite, scanExistingVerified, demoteFromElite } from './elite-pool-promotion.js';
export { checkEliteDedup } from './elite-pool-dedup.js';
export { computeGeneration, backfillGenerations } from './elite-pool-generation.js';
export { mapToManifest, getManifestCoverage, getManifestGaps, getTerminalFindings } from './elite-pool-manifest.js';
export { getEliteBridgingCandidates, logBridgingAttempt } from './elite-pool-bridging.js';
export { getEliteNodes, getElitePoolStats } from './elite-pool-queries.js';
