/**
 * Instruction-aware embedding evaluation layer.
 *
 * Provides embedding operations with task-specific instruction prefixes
 * routed through the standard embedding subsystem (models/embedding.ts).
 * Each instruction steers what the embedding captures (structural claim,
 * mechanical process, quantitative claims, domain contribution).
 *
 * Qwen3-Embedding instruction format:
 *   Query:   "Instruct: {instruction}\nQuery:{text}"
 *   Document: raw text (no instruction prefix)
 *
 * Embeddings are cached in the `embedding_eval_cache` table keyed by
 * (node_id, instruction_hash) to avoid recomputation.
 *
 * @module core/embedding-eval
 */

import { createHash } from 'crypto';
import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { getEmbedding, getEmbeddingModelName } from '../models/embedding.js';

// =============================================================================
// TYPES
// =============================================================================

/** Result from a single failure mode check. */
export interface EmbeddingCheckResult {
    mode: number;
    modeName: string;
    result: 'PASS' | 'FAIL';
    score: number;
    comparedTo: string;
    instructionUsed: string;
}

/** Aggregate results from all embedding checks on a node. */
export interface EmbeddingEvalResult {
    checks: EmbeddingCheckResult[];
    /** True if any check returned FAIL. */
    anyFail: boolean;
}

// =============================================================================
// EMBEDDING SERVICE
// =============================================================================

/**
 * Hash a string to a short hex digest for cache keys.
 */
function hashStr(s: string): string {
    return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

/**
 * Format text with Qwen3-Embedding instruction prefix.
 * Queries get instruction; documents are raw.
 */
function formatQuery(text: string, instruction: string): string {
    return `Instruct: ${instruction}\nQuery:${text}`;
}

/**
 * Get an embedding via the standard embedding subsystem, with optional instruction prefix.
 *
 * Routes through models/embedding.ts — same endpoint, auth, timeout, concurrency,
 * and usage logging as all other embedding calls. No shortcut HTTP calls.
 *
 * @param text - The text to embed
 * @param instruction - If provided, text is formatted with Qwen3 instruction prefix.
 *                      If null/undefined, text is embedded raw (document mode).
 * @returns L2-normalized float array, or null on failure
 */
async function callEmbeddingEndpoint(text: string, instruction?: string | null): Promise<number[] | null> {
    const cfg = appConfig.embeddingEval;

    // Pre-truncate to embedding-eval's own limit before adding instruction prefix
    const maxChars = cfg.maxChars || 8192;
    if (text.length > maxChars) {
        text = text.slice(0, maxChars);
    }

    // Format: instruction prefix for queries, raw for documents
    const input = instruction ? formatQuery(text, instruction) : text;

    // Route through the standard embedding subsystem
    try {
        const vec = await getEmbedding(input);
        if (!vec) return null;

        // L2-normalize for cosine similarity (= dot product on normalized vectors)
        let norm = 0;
        for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm);
        if (norm > 0) {
            for (let i = 0; i < vec.length; i++) vec[i] /= norm;
        }

        return vec;
    } catch (err: any) {
        console.warn(`[embedding-eval] Embedding call failed: ${err.message}`);
        return null;
    }
}

/**
 * Get an instruction-aware embedding for a node, using cache when available.
 *
 * @param nodeId - The node ID (for cache key)
 * @param content - The text content to embed
 * @param instruction - The instruction prefix (null for document mode)
 * @returns Float array, or null on failure
 */
export async function getInstructionEmbedding(
    nodeId: string,
    content: string,
    instruction?: string | null,
): Promise<number[] | null> {
    const contentHash = hashStr(content);
    const instructionHash = instruction ? hashStr(instruction) : 'raw';

    // Check cache
    const cached = await query(
        `SELECT embedding_bin FROM embedding_eval_cache
         WHERE node_id = $1 AND instruction_hash = $2 AND content_hash = $3`,
        [nodeId, instructionHash, contentHash],
    ) as any[];

    if (cached.length > 0 && cached[0].embedding_bin) {
        const buf = cached[0].embedding_bin;
        const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        return Array.from(f32);
    }

    // Generate embedding
    const vec = await callEmbeddingEndpoint(content, instruction);
    if (!vec) return null;

    // Store in cache
    const f32 = new Float32Array(vec);
    const buf = Buffer.from(f32.buffer);
    const modelName = getEmbeddingModelName();

    try {
        await query(
            `INSERT OR REPLACE INTO embedding_eval_cache
             (node_id, content_hash, instruction_hash, embedding_bin, embedding_dims, model)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [nodeId, contentHash, instructionHash, buf, vec.length, modelName],
        );
    } catch (err: any) {
        console.error(`[embedding-eval] Cache write failed: ${err.message}`);
    }

    return vec;
}

/**
 * Cosine similarity between two L2-normalized vectors (= dot product).
 */
export function cosineSim(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
}

// =============================================================================
// FAILURE MODE CHECKS
// =============================================================================

/**
 * Store an embedding check result in the database.
 */
async function storeResult(nodeId: string, result: EmbeddingCheckResult, shadowMode: boolean): Promise<void> {
    try {
        await query(
            `INSERT INTO embedding_eval_results
             (node_id, mode, mode_name, result, score, compared_to, instruction_used, shadow_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [nodeId, result.mode, result.modeName, result.result, result.score,
             result.comparedTo, result.instructionUsed, shadowMode ? 1 : 0],
        );
    } catch (err: any) {
        console.error(`[embedding-eval] Result store failed: ${err.message}`);
    }
}

/**
 * Mode 8: Self-Reinforcing Drift Detection.
 *
 * Checks if a child node is just paraphrasing its parents by comparing
 * structural claim embeddings. High similarity = no novel contribution.
 *
 * @param nodeId - The child node ID
 * @param nodeContent - The child node content
 * @param parents - Array of parent nodes with id and content
 * @returns Check result
 */
export async function checkDrift(
    nodeId: string,
    nodeContent: string,
    parents: { id: string; content: string }[],
): Promise<EmbeddingCheckResult> {
    const cfg = appConfig.embeddingEval;
    const instruction = cfg.instructStructuralClaim;

    // Embed child with instruction (query mode)
    const childVec = await getInstructionEmbedding(nodeId, nodeContent, instruction);
    if (!childVec) {
        return { mode: 8, modeName: 'self_reinforcing_drift', result: 'PASS', score: -1, comparedTo: 'ERROR: embed failed', instructionUsed: instruction };
    }

    let maxSim = 0;
    let maxParentId = '';

    for (const parent of parents) {
        // Embed parents as documents (raw, no instruction)
        const parentVec = await getInstructionEmbedding(parent.id, parent.content, null);
        if (!parentVec) continue;

        const sim = cosineSim(childVec, parentVec);
        if (sim > maxSim) {
            maxSim = sim;
            maxParentId = parent.id;
        }
    }

    const result: 'PASS' | 'FAIL' = maxSim >= cfg.driftFailThreshold ? 'FAIL' : 'PASS';

    return {
        mode: 8,
        modeName: 'self_reinforcing_drift',
        result,
        score: maxSim,
        comparedTo: `parent:${maxParentId.slice(0, 8)}`,
        instructionUsed: instruction,
    };
}

/**
 * Mode 1: Lexical Bridge Detection.
 *
 * Checks if a child node only integrates one parent's structure by
 * comparing mechanical process embeddings. A genuine synthesis should
 * have meaningful similarity to BOTH parents.
 *
 * @param nodeId - The child node ID
 * @param nodeContent - The child node content
 * @param parents - Array of parent nodes (expects exactly 2)
 * @returns Check result
 */
export async function checkLexicalBridge(
    nodeId: string,
    nodeContent: string,
    parents: { id: string; content: string }[],
): Promise<EmbeddingCheckResult> {
    const cfg = appConfig.embeddingEval;
    const instruction = cfg.instructMechanicalProcess;

    if (parents.length < 2) {
        return { mode: 1, modeName: 'lexical_bridge', result: 'PASS', score: 0, comparedTo: 'skipped: < 2 parents', instructionUsed: instruction };
    }

    // Embed child with instruction
    const childVec = await getInstructionEmbedding(nodeId, nodeContent, instruction);
    if (!childVec) {
        return { mode: 1, modeName: 'lexical_bridge', result: 'PASS', score: -1, comparedTo: 'ERROR: child embed failed', instructionUsed: instruction };
    }

    // Embed both parents as documents
    const parentVecs: (number[] | null)[] = [];
    for (const parent of parents.slice(0, 2)) {
        parentVecs.push(await getInstructionEmbedding(parent.id, parent.content, null));
    }

    if (!parentVecs[0] || !parentVecs[1]) {
        return { mode: 1, modeName: 'lexical_bridge', result: 'PASS', score: -1, comparedTo: 'ERROR: parent embed failed', instructionUsed: instruction };
    }

    const simA = cosineSim(childVec, parentVecs[0]!);
    const simB = cosineSim(childVec, parentVecs[1]!);
    const maxSim = Math.max(simA, simB);
    const minSim = Math.min(simA, simB);

    const result: 'PASS' | 'FAIL' =
        (maxSim > cfg.lexicalBridgeHighThreshold && minSim < cfg.lexicalBridgeLowThreshold) ? 'FAIL' : 'PASS';

    const closerParent = simA > simB ? parents[0] : parents[1];

    return {
        mode: 1,
        modeName: 'lexical_bridge',
        result,
        score: maxSim,
        comparedTo: `parent:${closerParent.id.slice(0, 8)} (${maxSim.toFixed(3)}/${minSim.toFixed(3)})`,
        instructionUsed: instruction,
    };
}

/**
 * Mode 4: Number Recycling Detection.
 *
 * Checks if a node's quantitative claims are suspiciously similar to
 * nodes in different domains — indicating number recycling across
 * unrelated contexts.
 *
 * @param nodeId - The node to check
 * @param nodeContent - Node content
 * @param nodeDomain - Node's domain
 * @returns Check result
 */
export async function checkNumberRecycling(
    nodeId: string,
    nodeContent: string,
    nodeDomain: string | null,
): Promise<EmbeddingCheckResult> {
    const cfg = appConfig.embeddingEval;
    const instruction = cfg.instructQuantitativeClaims;

    // Quick check: does the content even have numbers?
    if (!/\d+\.?\d*/.test(nodeContent)) {
        return { mode: 4, modeName: 'number_recycling', result: 'PASS', score: 0, comparedTo: 'no numbers in content', instructionUsed: instruction };
    }

    // Embed the node with quantitative claims instruction
    const nodeVec = await getInstructionEmbedding(nodeId, nodeContent, instruction);
    if (!nodeVec) {
        return { mode: 4, modeName: 'number_recycling', result: 'PASS', score: -1, comparedTo: 'ERROR: embed failed', instructionUsed: instruction };
    }

    // Compare against recent nodes from DIFFERENT domains
    const recentNodes = await query(`
        SELECT id, content, domain FROM nodes
        WHERE archived = 0
          AND id != $1
          AND domain IS NOT NULL
          AND domain != $2
          AND node_type NOT IN ('raw', 'question')
          AND content GLOB '*[0-9]*'
        ORDER BY created_at DESC
        LIMIT 50
    `, [nodeId, nodeDomain || '']) as any[];

    let maxSim = 0;
    let maxMatchId = '';

    for (const other of recentNodes) {
        const otherVec = await getInstructionEmbedding(other.id, other.content, instruction);
        if (!otherVec) continue;

        const sim = cosineSim(nodeVec, otherVec);
        if (sim > maxSim) {
            maxSim = sim;
            maxMatchId = other.id;
        }
    }

    const result: 'PASS' | 'FAIL' = maxSim >= cfg.numberRecyclingThreshold ? 'FAIL' : 'PASS';

    return {
        mode: 4,
        modeName: 'number_recycling',
        result,
        score: maxSim,
        comparedTo: maxMatchId ? `cross-domain:${maxMatchId.slice(0, 8)}` : 'none',
        instructionUsed: instruction,
    };
}

/**
 * Mode 7: Toxic Parent Detection.
 *
 * Checks if a parent node is contaminating multiple children across
 * different domains with the same pattern. Runs on the parent, not the child.
 *
 * @param parentId - The parent node ID
 * @param parentContent - The parent node content
 * @returns Check result, or null if the parent doesn't meet the threshold for checking
 */
export async function checkToxicParent(
    parentId: string,
    parentContent: string,
): Promise<EmbeddingCheckResult | null> {
    const cfg = appConfig.embeddingEval;
    const instruction = cfg.instructDomainContribution;

    // Find all children of this parent
    const children = await query(`
        SELECT n.id, n.content, n.domain FROM nodes n
        JOIN edges e ON n.id = e.target_id
        WHERE e.source_id = $1 AND e.edge_type = 'parent'
          AND n.archived = 0
    `, [parentId]) as any[];

    // Check minimums
    if (children.length < cfg.toxicParentMinChildren) return null;

    const domains = new Set(children.map((c: any) => c.domain).filter(Boolean));
    if (domains.size < cfg.toxicParentMinDomains) return null;

    // Embed parent as document
    const parentVec = await getInstructionEmbedding(parentId, parentContent, null);
    if (!parentVec) return null;

    // Embed each child with instruction and compute mean similarity
    let totalSim = 0;
    let count = 0;

    for (const child of children) {
        const childVec = await getInstructionEmbedding(child.id, child.content, instruction);
        if (!childVec) continue;

        totalSim += cosineSim(parentVec, childVec);
        count++;
    }

    if (count === 0) return null;

    const meanSim = totalSim / count;
    const result: 'PASS' | 'FAIL' = meanSim >= cfg.toxicParentThreshold ? 'FAIL' : 'PASS';

    return {
        mode: 7,
        modeName: 'toxic_parent',
        result,
        score: meanSim,
        comparedTo: `${count} children across ${domains.size} domains`,
        instructionUsed: instruction,
    };
}

// =============================================================================
// AGGREGATE EVALUATION
// =============================================================================

/**
 * Run all applicable embedding checks on a node.
 *
 * Runs modes 8 (drift), 1 (lexical bridge), and 4 (number recycling).
 * Mode 7 (toxic parent) runs separately on a schedule, not per-node.
 *
 * Results are stored in the database regardless of shadow mode.
 *
 * @param nodeId - The node to evaluate
 * @param nodeContent - Node content
 * @param nodeDomain - Node's domain
 * @param parents - Parent nodes with id and content
 * @returns Aggregate evaluation result
 */
export async function evaluateNode(
    nodeId: string,
    nodeContent: string,
    nodeDomain: string | null,
    parents: { id: string; content: string }[],
): Promise<EmbeddingEvalResult> {
    const cfg = appConfig.embeddingEval;
    const shadowMode = cfg.shadowMode;

    const checks: EmbeddingCheckResult[] = [];

    // Mode 8: Drift check (child vs parents)
    const driftResult = await checkDrift(nodeId, nodeContent, parents);
    checks.push(driftResult);
    await storeResult(nodeId, driftResult, shadowMode);

    // Mode 1: Lexical bridge check (needs 2 parents)
    if (parents.length >= 2) {
        const bridgeResult = await checkLexicalBridge(nodeId, nodeContent, parents);
        checks.push(bridgeResult);
        await storeResult(nodeId, bridgeResult, shadowMode);
    }

    // Mode 4: Number recycling (cross-domain)
    const recyclingResult = await checkNumberRecycling(nodeId, nodeContent, nodeDomain);
    checks.push(recyclingResult);
    await storeResult(nodeId, recyclingResult, shadowMode);

    const anyFail = checks.some(c => c.result === 'FAIL');

    return { checks, anyFail };
}
