/**
 * Dedup handlers — duplicate detection and auto-archival.
 *
 * Finds clusters of semantically duplicate nodes within domains,
 * keeps the highest-weight node in each cluster, archives the rest.
 * Also exports checkDuplicate() for use as a pre-creation gate in the synthesis engine.
 */

import { RC } from '../config/constants.js';
import { query, logDecision } from '../core.js';
import { config as appConfig } from '../config.js';
import { cosineSimilarity, invalidateKnowledgeCache } from './knowledge.js';
import { emitActivity } from '../services/event-bus.js';
import { createCachedLoader } from '../utils/cached-settings.js';
import { getPrompt } from '../prompts.js';
import { resolveContent } from '../core/number-variables.js';

// =============================================================================
// ATTRACTOR TRACKING — nodes that match too frequently are too generic
// =============================================================================

/** In-memory count of how many times each node has been the dedup match target */
const attractorCounts = new Map<string, number>();

/**
 * Increment attractor count for a node and apply weight decay.
 *
 * Nodes that repeatedly match as dedup targets are "attractors" — too generic
 * to be useful discriminators. Their weight is gradually decayed to reduce
 * their influence.
 *
 * @param nodeId - The node ID that was matched as a dedup target.
 */
function recordAttractorMatch(nodeId: string): void {
    const count = (attractorCounts.get(nodeId) ?? 0) + 1;
    attractorCounts.set(nodeId, count);
    const decay = appConfig.dedup.attractorWeightDecay ?? 0.01;
    if (decay > 0) {
        query(`UPDATE nodes SET weight = MAX(0.1, weight - $1) WHERE id = $2`, [decay, nodeId]).catch(() => {});
    }
}

// =============================================================================
// TYPES
// =============================================================================

interface DedupCluster {
    keptNode: { id: string; content: string; weight: number; domain: string | null };
    archivedNodes: { id: string; content: string; weight: number; similarity: number }[];
    omittedNodes?: number;
}

interface DedupResult {
    domain: string | null;
    totalNodesScanned: number;
    clustersFound: number;
    nodesArchived: number;
    lineageExcludedPairs?: number;
    clusters: DedupCluster[];
    omittedClusters?: number;
    omittedArchivedNodes?: number;
}

interface DuplicateCheckResult {
    isDuplicate: boolean;
    matchedNodeId?: string;
    matchedContent?: string;
    similarity?: number;
    bestSimilarity?: number;
    reason?: string;
    llmJudged?: boolean;
    llmVerdict?: string;
}

/** Resolved thresholds for a single checkDuplicate call (global + per-source overrides) */
interface ResolvedGateConfig {
    embeddingThreshold: number;
    wordOverlapThreshold: number;
    llmJudgeEnabled: boolean;
    llmJudgeDoubtFloor: number;
    llmJudgeHardCeiling: number;
}

// =============================================================================
// WORD OVERLAP UTILITY
// =============================================================================

/**
 * Compute Jaccard-like word overlap between two texts.
 *
 * Filters words shorter than `config.dedup.minWordLength` and computes
 * overlap as intersection / min(sizeA, sizeB).
 *
 * @param contentA - First text to compare.
 * @param contentB - Second text to compare.
 * @returns Overlap ratio between 0 and 1.
 */
function computeWordOverlap(contentA: string, contentB: string): number {
    const minLen = appConfig.dedup.minWordLength;
    const wordsA = new Set(contentA.toLowerCase().split(/\s+/).filter(w => w.length > minLen));
    const wordsB = new Set(contentB.toLowerCase().split(/\s+/).filter(w => w.length > minLen));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
    return overlap / Math.min(wordsA.size, wordsB.size);
}

// =============================================================================
// PER-SOURCE GATE OVERRIDE CACHE
// =============================================================================

const gateOverridesLoader = createCachedLoader(async () => {
    const cache = new Map<string, Partial<ResolvedGateConfig>>();
    try {
        const rows = await query('SELECT * FROM dedup_gate_overrides', []);
        for (const row of rows) {
            cache.set(row.source, {
                embeddingThreshold: row.embedding_threshold ?? undefined,
                wordOverlapThreshold: row.word_overlap_threshold ?? undefined,
                llmJudgeEnabled: row.llm_judge_enabled != null ? !!row.llm_judge_enabled : undefined,
                llmJudgeDoubtFloor: row.llm_judge_doubt_floor ?? undefined,
                llmJudgeHardCeiling: row.llm_judge_hard_ceiling ?? undefined,
            });
        }
    } catch {
        // Table may not exist yet — will be created by migration
    }
    return cache;
});

/** Resolve gate config: per-source overrides merged over global defaults */
async function resolveGateConfig(source?: string): Promise<ResolvedGateConfig> {
    const global: ResolvedGateConfig = {
        embeddingThreshold: appConfig.dedup.embeddingSimilarityThreshold,
        wordOverlapThreshold: appConfig.dedup.wordOverlapThreshold,
        llmJudgeEnabled: appConfig.dedup.llmJudgeEnabled,
        llmJudgeDoubtFloor: appConfig.dedup.llmJudgeDoubtFloor,
        llmJudgeHardCeiling: appConfig.dedup.llmJudgeHardCeiling,
    };
    if (!source) return global;

    const overrides = await gateOverridesLoader.get();
    const override = overrides.get(source);
    if (!override) return global;

    return {
        embeddingThreshold: override.embeddingThreshold ?? global.embeddingThreshold,
        wordOverlapThreshold: override.wordOverlapThreshold ?? global.wordOverlapThreshold,
        llmJudgeEnabled: override.llmJudgeEnabled ?? global.llmJudgeEnabled,
        llmJudgeDoubtFloor: override.llmJudgeDoubtFloor ?? global.llmJudgeDoubtFloor,
        llmJudgeHardCeiling: override.llmJudgeHardCeiling ?? global.llmJudgeHardCeiling,
    };
}

/** Invalidate the gate override cache (call after CRUD operations) */
export function invalidateGateOverrideCache(): void {
    gateOverridesLoader.invalidate();
}

// =============================================================================
// PAIRWISE SIMILARITY (EMBEDDING + WORD OVERLAP)
// =============================================================================

/** Decides if two nodes are duplicate candidates using embedding cosine and/or word overlap above thresholds. */
function areSimilar(
    nodeA: { content: string; embedding?: string | null },
    nodeB: { content: string; embedding?: string | null },
    embThreshold: number,
    wordThreshold: number,
): { similar: boolean; similarity: number; method: string } {
    // Try embedding similarity first
    if (nodeA.embedding && nodeB.embedding) {
        const embA = typeof nodeA.embedding === 'string' ? JSON.parse(nodeA.embedding) : nodeA.embedding;
        const embB = typeof nodeB.embedding === 'string' ? JSON.parse(nodeB.embedding) : nodeB.embedding;
        const sim = cosineSimilarity(embA, embB);
        if (sim >= embThreshold) {
            return { similar: true, similarity: sim, method: 'embedding' };
        }
    }

    // Fall back to word overlap
    const wordSim = computeWordOverlap(nodeA.content, nodeB.content);
    if (wordSim >= wordThreshold) {
        return { similar: true, similarity: wordSim, method: 'word-overlap' };
    }

    return { similar: false, similarity: 0, method: 'none' };
}

// =============================================================================
// STAR CLUSTERING (CENTER-BASED, NO TRANSITIVE CHAINS)
// =============================================================================
//
// Each cluster is centered on its highest-weight node. Every member must be
// directly similar to the center — no transitive chaining. This prevents the
// catastrophic mega-clusters that single-linkage (Union-Find) creates when
// A~B and B~C chains unrelated nodes into one cluster.

/**
 * Group nodes into duplicate clusters using star (center-based) clustering.
 *
 * Every cluster is centered on its highest-weight node (nodes arrive pre-sorted
 * by weight DESC from the query). Each member must be directly similar to the
 * center -- there are no transitive chains. This prevents catastrophic
 * mega-clusters that single-linkage (Union-Find) creates when A~B and B~C
 * chains unrelated nodes into one cluster.
 *
 * Parent-child and tension-source edge pairs are excluded from clustering
 * via the `relatedPairs` set, since lineage relationships are not duplicates.
 *
 * @param nodes - Active nodes in the domain, sorted by weight DESC.
 * @param embThreshold - Minimum embedding cosine similarity to consider a pair as duplicates.
 * @param wordThreshold - Minimum word overlap ratio to consider a pair as duplicates.
 * @param relatedPairs - Set of "id:id" strings for parent-child/tension pairs to exclude.
 * @returns Clusters (arrays of node indices), pairwise similarity map, and count of excluded lineage pairs.
 */
function buildClusters(
    nodes: { id: string; content: string; weight: number; domain: string | null; embedding?: string | null }[],
    embThreshold: number,
    wordThreshold: number,
    relatedPairs?: Set<string>,
): { clusters: number[][]; similarities: Map<string, number>; lineageExcludedPairs: number } {
    const similarities = new Map<string, number>();
    const adjacency = new Map<number, Set<number>>();
    let lineageExcludedPairs = 0;

    // Initialize adjacency lists
    for (let i = 0; i < nodes.length; i++) adjacency.set(i, new Set());

    // O(n^2) pairwise comparison — build adjacency list
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            // Skip parent-child pairs — lineage relationships are not duplicates
            if (relatedPairs?.has(`${nodes[i].id}:${nodes[j].id}`)) {
                lineageExcludedPairs++;
                continue;
            }

            const result = areSimilar(nodes[i], nodes[j], embThreshold, wordThreshold);
            if (result.similar) {
                adjacency.get(i)!.add(j);
                adjacency.get(j)!.add(i);
                similarities.set(`${i},${j}`, result.similarity);
            }
        }
    }

    // Greedy star assignment: nodes are already weight-DESC from the query.
    // Each unassigned node becomes a center; its unassigned neighbors join it.
    const assigned = new Set<number>();
    const clusters: number[][] = [];

    for (let i = 0; i < nodes.length; i++) {
        if (assigned.has(i)) continue;

        const neighbors = adjacency.get(i)!;
        const cluster = [i];
        assigned.add(i);

        for (const j of neighbors) {
            if (!assigned.has(j)) {
                cluster.push(j);
                assigned.add(j);
            }
        }

        // Only keep clusters with 2+ members (actual duplicates)
        if (cluster.length > 1) clusters.push(cluster);
    }

    return { clusters, similarities, lineageExcludedPairs };
}

// =============================================================================
// MAIN HANDLER: handleDedup
// =============================================================================

/**
 * Run deduplication across one or all domains.
 *
 * Finds clusters of semantically duplicate nodes using star clustering
 * (embedding cosine + word overlap), keeps the highest-weight node in each
 * cluster, and archives the rest. Excludes parent-child pairs from clustering.
 *
 * @param params - Object with optional `domain` (null for all domains), `dryRun` (default false),
 *   `embeddingThreshold`, and `wordOverlapThreshold`.
 * @returns Summary with domains processed, clusters found, nodes archived, and detailed cluster reports.
 */
async function handleDedup(params: Record<string, any>): Promise<any> {
    const {
        domain = null,
        dryRun = false,
        embeddingThreshold = appConfig.dedup.embeddingSimilarityThreshold,
        wordOverlapThreshold = appConfig.dedup.wordOverlapThreshold,
    } = params;

    const results: DedupResult[] = [];
    let totalArchived = 0;

    // Determine which domains to process
    let domains: (string | null)[];
    if (domain) {
        domains = [domain];
    } else {
        const domainRows = await query(
            `SELECT DISTINCT domain FROM nodes WHERE archived = FALSE AND domain IS NOT NULL`
        );
        domains = domainRows.map((r: any) => r.domain);
    }

    for (const d of domains) {
        // Fetch all active nodes in this domain (with embeddings)
        const nodes = await query(
            `SELECT id, content, weight, domain, embedding
             FROM nodes
             WHERE archived = FALSE AND node_type != 'raw' AND domain = $1
             ORDER BY weight DESC
             LIMIT $2`,
            [d, appConfig.dedup.maxNodesPerDomain]
        );

        if (nodes.length < 2) continue;

        // Fetch direct parent/tension edges between nodes in this domain
        // to prevent clustering parent-child pairs as duplicates
        const edgeRows = await query(
            `SELECT source_id, target_id FROM edges
             WHERE edge_type IN ('parent', 'tension_source')
               AND source_id IN (SELECT id FROM nodes WHERE archived = FALSE AND node_type != 'raw' AND domain = $1)
               AND target_id IN (SELECT id FROM nodes WHERE archived = FALSE AND node_type != 'raw' AND domain = $1)`,
            [d]
        );
        const relatedPairs = new Set<string>();
        for (const edge of edgeRows) {
            relatedPairs.add(`${edge.source_id}:${edge.target_id}`);
            relatedPairs.add(`${edge.target_id}:${edge.source_id}`);
        }

        const { clusters, similarities, lineageExcludedPairs } = buildClusters(
            nodes, embeddingThreshold, wordOverlapThreshold, relatedPairs
        );

        if (clusters.length === 0) continue;

        const domainResult: DedupResult = {
            domain: d,
            totalNodesScanned: nodes.length,
            clustersFound: clusters.length,
            nodesArchived: 0,
            lineageExcludedPairs,
            clusters: [],
        };

        for (const clusterIndices of clusters) {
            // Sort by weight DESC — highest weight is kept
            const clusterNodes = clusterIndices
                .map(i => nodes[i])
                .sort((a: any, b: any) => b.weight - a.weight);

            const kept = clusterNodes[0];
            const toArchive = clusterNodes.slice(1);

            const clusterReport: DedupCluster = {
                keptNode: { id: kept.id, content: kept.content.slice(0, 120), weight: kept.weight, domain: kept.domain },
                archivedNodes: [],
            };

            for (const node of toArchive) {
                const result = areSimilar(kept, node, embeddingThreshold, wordOverlapThreshold);

                clusterReport.archivedNodes.push({
                    id: node.id,
                    content: node.content.slice(0, 80),
                    weight: node.weight,
                    similarity: result.similarity,
                });

                if (!dryRun) {
                    await query(`UPDATE nodes SET archived = 1 WHERE id = $1`, [node.id]);
                    await logDecision(
                        'node', node.id, 'archived', 'false', 'true',
                        'system', 'dedup',
                        `dedup: similar to ${kept.id} (kept, weight: ${kept.weight.toFixed(2)})`
                    );
                }
            }

            domainResult.nodesArchived += toArchive.length;

            // Cap archived nodes in the report to prevent oversized MCP responses
            const MAX_ARCHIVED_PER_CLUSTER = 5;
            if (clusterReport.archivedNodes.length > MAX_ARCHIVED_PER_CLUSTER) {
                const omitted = clusterReport.archivedNodes.length - MAX_ARCHIVED_PER_CLUSTER;
                clusterReport.archivedNodes = clusterReport.archivedNodes.slice(0, MAX_ARCHIVED_PER_CLUSTER);
                clusterReport.omittedNodes = omitted;
            }

            domainResult.clusters.push(clusterReport);
        }

        totalArchived += domainResult.nodesArchived;

        if (!dryRun && domainResult.nodesArchived > 0) {
            invalidateKnowledgeCache(d);
        }

        // Cap detailed cluster reports to prevent oversized responses
        const MAX_CLUSTERS_PER_DOMAIN = 5;
        if (domainResult.clusters.length > MAX_CLUSTERS_PER_DOMAIN) {
            const omitted = domainResult.clusters.length - MAX_CLUSTERS_PER_DOMAIN;
            const omittedArchived = domainResult.clusters
                .slice(MAX_CLUSTERS_PER_DOMAIN)
                .reduce((sum, c) => sum + c.archivedNodes.length, 0);
            domainResult.clusters = domainResult.clusters.slice(0, MAX_CLUSTERS_PER_DOMAIN);
            domainResult.omittedClusters = omitted;
            domainResult.omittedArchivedNodes = omittedArchived;
        }

        results.push(domainResult);
    }

    // Timeline marker for journal (non-dry-run only)
    if (!dryRun && totalArchived > 0) {
        try {
            const { createTimelineMarker } = await import('../core/journal.js');
            await createTimelineMarker('dedup_run', `Dedup: archived ${totalArchived} nodes across ${domains.length} domains`, {
                domainsProcessed: domains.length,
                totalArchived,
                domain: domain || 'all',
            }, 'dedup');
        } catch { /* journal may not be ready yet */ }
    }

    return {
        dryRun,
        domainsProcessed: domains.length,
        totalClustersFound: results.reduce((sum, r) => sum + r.clustersFound, 0),
        totalNodesArchived: totalArchived,
        thresholds: {
            embedding: embeddingThreshold,
            wordOverlap: wordOverlapThreshold,
        },
        results,
    };
}

// =============================================================================
// SYNTHESIS ENGINE GATE: checkDuplicate
// =============================================================================

/**
 * Check if content would be a duplicate of any existing node in the domain.
 * Used by the synthesis engine before creating synthesis nodes.
 *
 * @param source - Origin of the content (e.g. 'synthesis', 'kb-ingestion').
 *                 Used to look up per-source gate overrides.
 */
async function checkDuplicate(
    content: string,
    embedding: number[] | null,
    domain: string | null,
    source?: string,
): Promise<DuplicateCheckResult> {
    if (!domain) return { isDuplicate: false, bestSimilarity: 0 };

    const gate = await resolveGateConfig(source);

    // Check if dedup_judge subsystem is assigned (lazy, cached by models.ts)
    let hasJudge = false;
    if (gate.llmJudgeEnabled) {
        try {
            const { getSubsystemAssignments } = await import('../models.js');
            const assignments = await getSubsystemAssignments();
            hasJudge = !!assignments.dedup_judge;
        } catch {
            // models not loaded yet — no judge available
        }
    }

    const existing = await query(
        `SELECT id, content, embedding FROM nodes
         WHERE archived = FALSE AND node_type != 'raw' AND domain = $1
         ORDER BY weight DESC
         LIMIT $2`,
        [domain, appConfig.dedup.maxNodesPerDomain]
    );

    let bestSimilarity = 0;
    let bestMatch: { node: any; sim: number; wordSim?: number } | null = null;
    let llmJudgeCalls = 0;
    const maxLlmJudgeCalls = 3; // Cap LLM judge calls per check — if 3 nodes say NOVEL, the content is likely novel
    const attractorThreshold = appConfig.dedup.attractorThreshold ?? RC.misc.attractorThreshold;
    let skippedAttractors = 0;

    for (const node of existing) {
        // Skip attractor nodes — too generic, they match everything
        if (attractorThreshold > 0 && (attractorCounts.get(node.id) ?? 0) >= attractorThreshold) {
            skippedAttractors++;
            continue;
        }
        // Embedding comparison
        if (embedding && node.embedding) {
            const existingEmb = typeof node.embedding === 'string'
                ? JSON.parse(node.embedding) : node.embedding;
            const sim = cosineSimilarity(embedding, existingEmb);
            if (sim > bestSimilarity) {
                bestSimilarity = sim;
                bestMatch = { node, sim };
            }

            // Hard ceiling — always reject (obvious near-copy, no need to scan further)
            if (sim >= gate.llmJudgeHardCeiling) {
                recordAttractorMatch(node.id);
                return {
                    isDuplicate: true,
                    matchedNodeId: node.id,
                    matchedContent: node.content.slice(0, 100),
                    similarity: sim,
                    bestSimilarity: sim,
                    reason: `Embedding similarity ${sim.toFixed(3)} >= hard ceiling ${gate.llmJudgeHardCeiling}`,
                };
            }

            // Doubt zone — consult LLM judge if available (capped to avoid O(N) LLM calls)
            if (sim >= gate.llmJudgeDoubtFloor && hasJudge) {
                if (llmJudgeCalls >= maxLlmJudgeCalls) {
                    // Cap reached — prior judges all said NOVEL, skip remaining doubt-zone nodes
                    continue;
                }
                llmJudgeCalls++;
                const verdict = await askLlmJudge(node.content, content, sim, source);
                if (verdict.isDuplicate) {
                    recordAttractorMatch(node.id);
                    return {
                        isDuplicate: true,
                        matchedNodeId: node.id,
                        matchedContent: node.content.slice(0, 100),
                        similarity: sim,
                        bestSimilarity: sim,
                        reason: `LLM judge: DUPLICATE (sim ${sim.toFixed(3)})`,
                        llmJudged: true,
                        llmVerdict: verdict.reason,
                    };
                }
                // LLM said NOVEL — continue checking other nodes
                continue;
            }

            // Track embedding matches (don't early-return — find the true best match first)
        }

        // Word overlap — track best rather than early-return
        const wordSim = computeWordOverlap(content, node.content);
        if (wordSim >= gate.wordOverlapThreshold && (!bestMatch || wordSim > (bestMatch.wordSim ?? 0))) {
            if (!bestMatch || wordSim > bestMatch.sim) {
                bestMatch = { node, sim: bestSimilarity, wordSim };
            }
        }
    }

    // Log attractor exclusions
    if (skippedAttractors > 0) {
        emitActivity('synthesis', 'dedup_attractors_skipped',
            `Dedup: skipped ${skippedAttractors} attractor node${skippedAttractors > 1 ? 's' : ''} (threshold ${attractorThreshold})`,
            { gate: 'dedup', skippedAttractors, threshold: attractorThreshold });
    }

    // After scanning all nodes, check if the best match exceeds thresholds
    if (bestMatch) {
        // Check word overlap match
        if (bestMatch.wordSim && bestMatch.wordSim >= gate.wordOverlapThreshold) {
            recordAttractorMatch(bestMatch.node.id);
            return {
                isDuplicate: true,
                matchedNodeId: bestMatch.node.id,
                matchedContent: bestMatch.node.content.slice(0, 100),
                similarity: bestMatch.wordSim,
                bestSimilarity,
                reason: `Word overlap ${(bestMatch.wordSim * 100).toFixed(0)}% >= ${(gate.wordOverlapThreshold * 100).toFixed(0)}%`,
            };
        }

        // Check embedding threshold against true best match
        if (bestSimilarity >= gate.embeddingThreshold) {
            recordAttractorMatch(bestMatch.node.id);
            return {
                isDuplicate: true,
                matchedNodeId: bestMatch.node.id,
                matchedContent: bestMatch.node.content.slice(0, 100),
                similarity: bestSimilarity,
                bestSimilarity,
                reason: `Embedding similarity ${bestSimilarity.toFixed(3)} >= ${gate.embeddingThreshold}`,
            };
        }
    }

    return { isDuplicate: false, bestSimilarity };
}

// =============================================================================
// LLM JUDGE
// =============================================================================

/**
 * Ask the LLM judge whether two nodes are semantically duplicate.
 *
 * Called in the "doubt zone" where embedding similarity is between
 * `llmJudgeDoubtFloor` and `llmJudgeHardCeiling`. Resolves number
 * variable placeholders before sending to the LLM. If consultant review
 * is enabled and the similarity is near the dedup threshold, requests
 * a second opinion that can flip the verdict.
 *
 * Fails open on LLM errors (returns isDuplicate=false).
 *
 * @param existingContent - Content of the existing node.
 * @param newContent - Content of the candidate new node.
 * @param similarity - Embedding cosine similarity between the two.
 * @param source - Origin of the new content (for activity logging).
 * @returns Verdict with `isDuplicate` flag and `reason` string.
 */
async function askLlmJudge(
    existingContent: string,
    newContent: string,
    similarity: number,
    source?: string,
): Promise<{ isDuplicate: boolean; reason: string }> {
    try {
        const { callSubsystemModel, consultantReview: consultantReviewFn } = await import('../models.js');

        // Resolve number variable placeholders so the LLM sees actual values
        const resolvedExisting = await resolveContent(existingContent);
        const resolvedNew = await resolveContent(newContent);

        const prompt = await getPrompt('dedup.llm_judge', {
            similarity: similarity.toFixed(3),
            existingContent: resolvedExisting.slice(0, 500),
            newContent: resolvedNew.slice(0, 500),
        });

        const response = await callSubsystemModel('dedup_judge', prompt, {
            temperature: 0.1,
        });

        const firstLine = response.trim().split('\n')[0].toUpperCase();
        let isDuplicate = firstLine.includes('DUPLICATE');
        let reason = response.trim().split('\n').slice(0, 2).join(' ').slice(0, 200);

        // Consultant second opinion in the doubt zone
        const dedupThreshold = appConfig.consultantReview?.thresholds?.dedup_judge ?? 0.75;
        if (appConfig.consultantReview?.enabled && Math.abs(similarity - dedupThreshold) <= 0.075) {
            try {
                const review = await consultantReviewFn('dedup_judge',
                    `Primary judge verdict: ${isDuplicate ? 'DUPLICATE' : 'NOVEL'}\nReason: ${reason}\nSimilarity: ${similarity.toFixed(3)}`,
                    {
                        claim: `Node A: ${resolvedExisting.slice(0, 300)}\nNode B: ${resolvedNew.slice(0, 300)}`,
                        subsystemTask: 'Second opinion: is Node B truly a duplicate of Node A, or does it add novel information?',
                    },
                );
                if (review && !review.accept) {
                    // Consultant disagrees with the primary judge — flip the verdict
                    isDuplicate = !isDuplicate;
                    reason = `[consultant override] ${review.reasoning.slice(0, 150)}`;
                }
            } catch { /* consultant review is non-fatal */ }
        }

        emitActivity('synthesis', 'dedup_judge',
            `LLM judge: ${isDuplicate ? 'DUPLICATE' : 'NOVEL'} (${similarity.toFixed(3)}) — "${newContent.slice(0, 60)}"`, {
            similarity,
            threshold: appConfig.dedup.llmJudgeHardCeiling,
            passed: !isDuplicate,
            gate: 'llm_judge',
            verdict: isDuplicate ? 'DUPLICATE' : 'NOVEL',
            reason,
            source: source || 'unknown',
        });

        return { isDuplicate, reason };
    } catch (err: any) {
        // Fail-open — if LLM call fails, allow the node through
        emitActivity('synthesis', 'dedup_judge',
            `LLM judge error (fail-open): ${err.message?.slice(0, 80)}`, {
            similarity,
            threshold: appConfig.dedup.llmJudgeHardCeiling,
            passed: true,
            gate: 'llm_judge',
            verdict: 'ERROR',
            source: source || 'unknown',
        });
        return { isDuplicate: false, reason: `LLM error (fail-open): ${err.message}` };
    }
}

export { handleDedup, checkDuplicate, areSimilar, buildClusters, computeWordOverlap };
