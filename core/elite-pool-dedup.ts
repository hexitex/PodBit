/**
 * Elite Verification Pool — Three-Gate Deduplication
 *
 * Prevents duplicate elite nodes from entering the pool using three
 * sequential gates checked in order of computational cost:
 *
 *   1. Variable Overlap — exact set comparison of number variable IDs
 *   2. Parent Lineage — shared parent synthesis node check
 *   3. Semantic Similarity — embedding cosine similarity threshold
 *
 * Short-circuits on the first gate that detects a duplicate.
 */

import { query } from '../db.js';
import { getEmbedding } from '../models.js';
import { cosineSimilarity, parseEmbedding } from './scoring.js';
import { config as appConfig } from '../config.js';
import type { EliteDedupResult } from './elite-pool-types.js';

// =============================================================================
// THREE-GATE ELITE DEDUPLICATION
// =============================================================================

/**
 * Check if content would duplicate an existing elite node.
 * Three gates checked in order (short-circuit on first match):
 *
 *   Gate 1 — Variable Overlap (fast, exact):
 *     Compare the set of number variable IDs referenced by the candidate
 *     against each existing elite node. Identical variable sets in the same
 *     domain indicates a duplicate quantitative claim.
 *
 *   Gate 2 — Parent Lineage (fast, exact):
 *     If the candidate shares the same parent synthesis node as an existing
 *     elite node, it is almost certainly a duplicate or trivial variant.
 *
 *   Gate 3 — Semantic Similarity (slower, approximate):
 *     Embed the candidate and compare cosine similarity against all existing
 *     elite node embeddings. Above threshold = duplicate.
 */
/**
 * @param candidateContent - The content text of the candidate elite node
 * @param candidateVarIds - Number variable IDs referenced in the candidate content
 * @param candidateParentIds - Parent node IDs of the candidate (typically the source synthesis node)
 * @returns Dedup result indicating whether the candidate is a duplicate and which gate matched
 */
export async function checkEliteDedup(
    candidateContent: string,
    candidateVarIds: string[],
    candidateParentIds: string[],
): Promise<EliteDedupResult> {
    const cfg = appConfig.elitePool.dedup;

    if (cfg.checkVariableOverlap && candidateVarIds.length > 0) {
        const result = await checkVariableOverlapGate(candidateVarIds);
        if (result.isDuplicate) return result;
    }

    if (cfg.checkParentLineage && candidateParentIds.length > 0) {
        const result = await checkParentLineageGate(candidateParentIds);
        if (result.isDuplicate) return result;
    }

    const embedding = await getEmbedding(candidateContent);
    if (embedding) {
        const result = await checkSemanticSimilarityGate(embedding, cfg.semanticThreshold);
        if (result.isDuplicate) return result;
    }

    return { isDuplicate: false };
}

/**
 * Gate 1: Check if candidate shares an identical set of number variable IDs
 * with any existing elite node. Identical variable sets in the same graph
 * indicate a duplicate quantitative claim.
 *
 * @param candidateVarIds - Number variable IDs from the candidate content
 * @returns Dedup result; `isDuplicate: true` if an exact variable set match is found
 */
async function checkVariableOverlapGate(candidateVarIds: string[]): Promise<EliteDedupResult> {
    const eliteNodes = await query(`
        SELECT en.node_id, n.domain
        FROM elite_nodes en
        JOIN nodes n ON n.id = en.node_id
        WHERE n.archived = 0
    `) as any[];

    const candidateSet = new Set(candidateVarIds);
    for (const elite of eliteNodes) {
        const eliteVarIds = await getNodeVarIds(elite.node_id);
        if (eliteVarIds.length === 0) continue;
        const eliteSet = new Set(eliteVarIds);
        if (candidateSet.size === eliteSet.size && [...candidateSet].every(id => eliteSet.has(id))) {
            return {
                isDuplicate: true,
                matchedNodeId: elite.node_id,
                matchType: 'variable_overlap',
                details: `Identical variable set: ${candidateVarIds.join(', ')}`,
            };
        }
    }
    return { isDuplicate: false };
}

/**
 * Gate 2: Check if the candidate shares a parent synthesis node with any
 * existing elite node. Two elite nodes derived from the same synthesis parent
 * are almost certainly duplicates or trivial variants.
 *
 * @param candidateParentIds - Parent node IDs of the candidate
 * @returns Dedup result; `isDuplicate: true` if a shared parent is found
 */
async function checkParentLineageGate(candidateParentIds: string[]): Promise<EliteDedupResult> {
    if (candidateParentIds.length === 0) return { isDuplicate: false };

    const placeholders = candidateParentIds.map((_, i) => `$${i + 1}`).join(', ');
    const matches = await query(`
        SELECT en.node_id, e.source_id as shared_parent
        FROM elite_nodes en
        JOIN edges e ON e.target_id = en.node_id AND e.edge_type = 'parent'
        JOIN nodes n ON n.id = en.node_id AND n.archived = 0
        WHERE e.source_id IN (${placeholders})
    `, candidateParentIds) as any[];

    if (matches.length > 0) {
        return {
            isDuplicate: true,
            matchedNodeId: matches[0].node_id,
            matchType: 'parent_lineage',
            details: `Shares parent ${matches[0].shared_parent.slice(0, 8)} with existing elite node`,
        };
    }
    return { isDuplicate: false };
}

/**
 * Gate 3: Check embedding cosine similarity of the candidate against all
 * existing elite node embeddings. The most computationally expensive gate,
 * run last as a fallback.
 *
 * @param embedding - The candidate content's embedding vector
 * @param threshold - Cosine similarity threshold (0-1) above which a match is declared
 * @returns Dedup result; `isDuplicate: true` if similarity >= threshold
 */
async function checkSemanticSimilarityGate(embedding: number[], threshold: number): Promise<EliteDedupResult> {
    const eliteNodes = await query(`
        SELECT n.id, n.embedding, n.embedding_bin
        FROM nodes n
        JOIN elite_nodes en ON en.node_id = n.id
        WHERE n.archived = 0 AND (n.embedding IS NOT NULL OR n.embedding_bin IS NOT NULL)
    `) as any[];

    for (const elite of eliteNodes) {
        const eliteEmb = parseEmbedding(elite.embedding_bin || elite.embedding);
        if (!eliteEmb) continue;
        const sim = cosineSimilarity(embedding, eliteEmb);
        if (sim >= threshold) {
            return {
                isDuplicate: true,
                matchedNodeId: elite.id,
                matchType: 'semantic_similarity',
                score: sim,
                details: `Embedding similarity ${sim.toFixed(3)} >= threshold ${threshold}`,
            };
        }
    }
    return { isDuplicate: false };
}

// =============================================================================
// SHARED HELPER
// =============================================================================

/**
 * Get all number variable IDs referenced by a node from the `node_number_refs`
 * junction table. Used by dedup gate 1 and the promotion pipeline.
 *
 * @param nodeId - The node ID to look up variable references for
 * @returns Array of variable IDs (e.g. `['SBKR1', 'SBKR42']`)
 */
export async function getNodeVarIds(nodeId: string): Promise<string[]> {
    const rows = await query(
        'SELECT var_id FROM node_number_refs WHERE node_id = $1',
        [nodeId],
    ) as any[];
    return rows.map((r: any) => r.var_id);
}
