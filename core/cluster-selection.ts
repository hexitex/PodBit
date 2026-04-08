/**
 * Quantum-inspired cluster selection for synthesis.
 *
 * Uses simulated annealing to find optimal multi-node clusters
 * from the graph's embedding space. Replaces the pairwise sampling
 * stages (1-4) of the synthesis pipeline when cluster mode is enabled.
 *
 * Energy function considers:
 *   - Coherence: pairwise similarity within the cluster (lower energy = more coherent)
 *   - Diversity: penalty for same-domain nodes (encourages cross-domain synthesis)
 *   - Size: penalty for deviation from target cluster size
 *   - Weight: bonus for high-weight (proven) nodes
 *
 * The annealing process explores the combinatorial space of possible
 * node groupings, accepting worse solutions probabilistically at high
 * temperature (exploration) and converging at low temperature (exploitation).
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { cosineSimilarity, } from './scoring.js';
import { batchLoad } from '../vector/embedding-cache.js';
import { getAccessibleDomains } from './governance.js';
import type { ResonanceNode } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

/** A single cluster found by the annealing process. */
export interface ClusterCandidate {
    /** Node UUIDs in this cluster. */
    nodeIds: string[];
    /** Full node objects corresponding to {@link nodeIds}. */
    nodes: ResonanceNode[];
    /** Composite energy score (lower is better). */
    energy: number;
    /** Average pairwise cosine similarity within the cluster. */
    coherence: number;
    /** Ratio of unique domains to cluster size (0 = homogeneous, 1 = fully diverse). */
    diversity: number;
}

/** Result envelope returned by {@link findClusters}. */
export interface ClusterSelectionResult {
    /** Best clusters found, in order of discovery. */
    clusters: ClusterCandidate[];
    /** Total annealing iterations configured (not actual steps if early-terminated). */
    iterations: number;
    /** Temperature after the final iteration. */
    finalTemperature: number;
    /** Number of valid candidate nodes available for clustering. */
    candidatePoolSize: number;
}

// =============================================================================
// ENERGY FUNCTION
// =============================================================================

/**
 * Compute composite energy for a cluster of nodes.
 * Lower energy = better cluster.
 *
 * Energy components:
 * 1. **Coherence** — deviation of average pairwise similarity from the productive band midpoint.
 * 2. **Diversity** — penalty for same-domain nodes (encourages cross-domain synthesis).
 * 3. **Weight bonus** — reward for high-weight (proven) nodes.
 * 4. **Size penalty** — deviation from the configured target cluster size.
 *
 * @param nodeIds - UUIDs of nodes in the cluster.
 * @param nodes - Full node objects (must correspond 1:1 with `nodeIds`).
 * @param embeddings - Pre-loaded embedding vectors keyed by node ID.
 * @param cfg - Cluster selection config section with weights and thresholds.
 * @returns Composite energy, raw coherence (avg similarity), and diversity ratio.
 */
function computeClusterEnergy(
    nodeIds: string[],
    nodes: ResonanceNode[],
    embeddings: Map<string, number[]>,
    cfg: typeof appConfig.clusterSelection,
): { energy: number; coherence: number; diversity: number } {
    const n = nodeIds.length;

    // 1. Coherence: average pairwise similarity (negative = lower energy for higher sim)
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < n; i++) {
        const embI = embeddings.get(nodeIds[i]);
        if (!embI) continue;
        for (let j = i + 1; j < n; j++) {
            const embJ = embeddings.get(nodeIds[j]);
            if (!embJ) continue;
            const sim = cosineSimilarity(embI, embJ);
            totalSim += sim;
            pairCount++;
        }
    }
    const avgSim = pairCount > 0 ? totalSim / pairCount : 0;

    // We want similarity in the productive band (not too low, not too high)
    // Optimal is around 0.5-0.7 — penalize both extremes
    const optimalSim = (cfg.minSimilarity + cfg.maxSimilarity) / 2;
    const simBandwidth = (cfg.maxSimilarity - cfg.minSimilarity) / 2;
    const simDeviation = simBandwidth > 0 ? Math.abs(avgSim - optimalSim) / simBandwidth : 0;
    const coherenceEnergy = simDeviation; // 0 = perfect center of band, 1 = at edge

    // 2. Diversity: ratio of unique domains (0 = all same domain, 1 = all different)
    const domains = new Set(nodes.map(n => n.domain).filter(Boolean));
    const domainDiversity = domains.size / Math.max(n, 1);
    const diversityEnergy = 1 - domainDiversity; // 0 = maximally diverse

    // 3. Weight bonus: average node weight (higher = better, so negate)
    const avgWeight = nodes.reduce((sum, n) => sum + (n.weight || 1), 0) / n;
    const weightBonus = -Math.min(avgWeight / 2, 1); // Cap at -1

    // 4. Size: penalty for deviation from target
    const sizeDeviation = Math.abs(n - cfg.targetSize) / cfg.targetSize;

    // Composite energy
    const energy =
        cfg.coherenceWeight * coherenceEnergy +
        cfg.diversityWeight * diversityEnergy +
        cfg.weightBonusScale * weightBonus +
        cfg.sizePenalty * sizeDeviation;

    return { energy, coherence: avgSim, diversity: domainDiversity };
}

// =============================================================================
// SIMULATED ANNEALING
// =============================================================================

/**
 * Find optimal node clusters using simulated annealing.
 *
 * Loads a candidate pool from the graph (filtered by domain accessibility
 * if a domain is specified), batch-loads embeddings, and runs one annealing
 * pass per requested cluster. Successive clusters are drawn from disjoint
 * node sets to avoid overlap.
 *
 * @param domain - Optional domain constraint. When provided, only nodes from
 *                 accessible domains (same partition or bridged) are considered.
 * @param count - Number of clusters to find (default `1`). Each cluster uses
 *                disjoint nodes from the candidate pool.
 * @returns A {@link ClusterSelectionResult} with the best clusters found,
 *          iteration count, final temperature, and candidate pool size.
 */
export async function findClusters(
    domain: string | null = null,
    count: number = 1,
): Promise<ClusterSelectionResult> {
    const cfg = appConfig.clusterSelection;

    // 1. Load candidate pool
    let candidates: any[];
    if (domain) {
        const accessible = await getAccessibleDomains(domain);
        const placeholders = accessible.map((_, i) => `$${i + 1}`).join(', ');
        candidates = await query(`
            SELECT id, content, weight, salience, specificity, domain
            FROM nodes
            WHERE archived = 0
              AND embedding IS NOT NULL
              AND node_type NOT IN ('question', 'raw', 'elite_verification')
              AND COALESCE(synthesizable, 1) != 0
              AND domain IN (${placeholders})
            ORDER BY weight DESC
            LIMIT $${accessible.length + 1}
        `, [...accessible, cfg.candidatePoolSize]);
    } else {
        candidates = await query(`
            SELECT id, content, weight, salience, specificity, domain
            FROM nodes
            WHERE archived = 0
              AND embedding IS NOT NULL
              AND node_type NOT IN ('question', 'raw', 'elite_verification')
              AND COALESCE(synthesizable, 1) != 0
            ORDER BY weight DESC
            LIMIT $1
        `, [cfg.candidatePoolSize]);
    }

    if (candidates.length < cfg.targetSize) {
        return { clusters: [], iterations: 0, finalTemperature: 0, candidatePoolSize: candidates.length };
    }

    // 2. Batch-load embeddings
    const embeddings = await batchLoad(candidates.map(c => c.id));

    // Filter to only nodes with valid embeddings
    const validCandidates = candidates.filter(c => embeddings.has(c.id));
    if (validCandidates.length < cfg.targetSize) {
        return { clusters: [], iterations: 0, finalTemperature: 0, candidatePoolSize: validCandidates.length };
    }

    // 3. Run annealing for each requested cluster
    const clusters: ClusterCandidate[] = [];
    const usedNodeIds = new Set<string>();

    for (let c = 0; c < count; c++) {
        const available = validCandidates.filter(n => !usedNodeIds.has(n.id));
        if (available.length < cfg.targetSize) break;

        const result = anneal(available, embeddings, cfg);
        if (result) {
            clusters.push(result);
            // Mark nodes as used so next cluster picks different nodes
            for (const id of result.nodeIds) usedNodeIds.add(id);
        }
    }

    return {
        clusters,
        iterations: cfg.maxIterations,
        finalTemperature: cfg.initialTemp * cfg.coolingRate ** cfg.maxIterations,
        candidatePoolSize: validCandidates.length,
    };
}

/**
 * Single annealing run to find one optimal cluster.
 *
 * Starts with a random subset of `targetSize` nodes, then iteratively
 * swaps one node in/out per step, accepting worse solutions probabilistically
 * via the Metropolis criterion. Tracks the best-ever solution across all
 * iterations and validates it falls within the productive similarity band.
 *
 * @param candidates - Pool of eligible nodes to draw from.
 * @param embeddings - Pre-loaded embedding vectors keyed by node ID.
 * @param cfg - Cluster selection config section.
 * @returns The best cluster found, or `null` if the best coherence falls
 *          outside the configured similarity band.
 */
function anneal(
    candidates: ResonanceNode[],
    embeddings: Map<string, number[]>,
    cfg: typeof appConfig.clusterSelection,
): ClusterCandidate | null {
    const n = candidates.length;
    const targetSize = cfg.targetSize;

    // Initialize: random cluster of target size
    let currentIndices = randomSample(n, targetSize);
    let currentNodes = currentIndices.map(i => candidates[i]);
    let currentIds = currentNodes.map(n => n.id);
    let { energy: currentEnergy, coherence: currentCoherence, diversity: currentDiversity } =
        computeClusterEnergy(currentIds, currentNodes, embeddings, cfg);

    let bestIndices = [...currentIndices];
    let bestEnergy = currentEnergy;
    let bestCoherence = currentCoherence;
    let bestDiversity = currentDiversity;

    let temperature = cfg.initialTemp;

    for (let iter = 0; iter < cfg.maxIterations; iter++) {
        // Generate neighbor: swap one node in cluster with one outside
        const newIndices = [...currentIndices];
        const swapOut = Math.floor(Math.random() * targetSize);
        const outsideIndices = Array.from({ length: n }, (_, i) => i)
            .filter(i => !currentIndices.includes(i));
        if (outsideIndices.length === 0) break;
        const swapIn = outsideIndices[Math.floor(Math.random() * outsideIndices.length)];
        newIndices[swapOut] = swapIn;

        const newNodes = newIndices.map(i => candidates[i]);
        const newIds = newNodes.map(n => n.id);
        const { energy: newEnergy, coherence: newCoherence, diversity: newDiversity } =
            computeClusterEnergy(newIds, newNodes, embeddings, cfg);

        // Accept or reject (Metropolis criterion)
        const delta = newEnergy - currentEnergy;
        if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
            currentIndices = newIndices;
            currentNodes = newNodes;
            currentIds = newIds;
            currentEnergy = newEnergy;
            currentCoherence = newCoherence;
            currentDiversity = newDiversity;
        }

        // Track best
        if (currentEnergy < bestEnergy) {
            bestIndices = [...currentIndices];
            bestEnergy = currentEnergy;
            bestCoherence = currentCoherence;
            bestDiversity = currentDiversity;
        }

        // Cool
        temperature *= cfg.coolingRate;
    }

    // Validate: ensure the best cluster has similarity in the productive band
    if (bestCoherence < cfg.minSimilarity || bestCoherence > cfg.maxSimilarity) {
        return null;
    }

    const bestNodes = bestIndices.map(i => candidates[i]);
    return {
        nodeIds: bestNodes.map(n => n.id),
        nodes: bestNodes,
        energy: bestEnergy,
        coherence: bestCoherence,
        diversity: bestDiversity,
    };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Random sample of `k` unique indices from the range `[0, n)`.
 * Uses a partial Fisher-Yates shuffle for O(k) performance.
 *
 * @param n - Size of the index space.
 * @param k - Number of indices to sample (must be ≤ `n`).
 * @returns Array of `k` distinct random indices.
 */
function randomSample(n: number, k: number): number[] {
    const indices = Array.from({ length: n }, (_, i) => i);
    // Fisher-Yates partial shuffle
    for (let i = 0; i < k; i++) {
        const j = i + Math.floor(Math.random() * (n - i));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, k);
}
