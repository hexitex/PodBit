/**
 * Elite Verification Pool — Promotion, Backfill & Demotion
 *
 * Core promotion pipeline that transforms EVM-verified synthesis nodes into
 * first-class elite nodes in the knowledge graph. The pipeline runs 15 steps
 * (see {@link promoteToElite}) including threshold validation, LLM content
 * synthesis, three-gate dedup, generation tracking, number variable isolation,
 * provenance chain construction, and manifest target mapping.
 *
 * Also provides backfill scanning for nodes verified before the elite pool
 * was enabled, and demotion to revert elite nodes back to synthesis status.
 */

import { query, queryOne } from '../db.js';
import { config as appConfig } from '../config.js';
import { callSubsystemModel } from '../models.js';
import { createNode, createEdge } from './node-ops.js';
import { emitActivity } from '../services/event-bus.js';
import { getProjectContextBlock } from './project-context.js';
import { extractVarIdsFromContent, getVariablesByIds, registerNodeVariables, resolveContent } from './number-variables.js';
import { computeContentHash, logOperation } from './integrity.js';
import { logDecision } from './governance.js';
import { getPrompt } from '../prompts.js';
import { RC } from '../config/constants.js';
import { checkEliteDedup, getNodeVarIds } from './elite-pool-dedup.js';
import { computeGeneration } from './elite-pool-generation.js';
import { mapToManifest } from './elite-pool-manifest.js';
import type { VerificationResult } from '../evm/types.js';
import type { ElitePromotionResult, ManifestMapping, ProvenanceChain } from './elite-pool-types.js';

// =============================================================================
// ELITE PROMOTION
// =============================================================================

/**
 * Promote a verified node to the elite pool.
 * Called after EVM verification completes with claimSupported=true.
 *
 * Pipeline:
 *   1. Validate EVM result meets elite thresholds
 *   2. Fetch source node
 *   3. Compute generation from source node's parents
 *   4. Check generation ceiling
 *   5. Build elite content via LLM synthesis
 *   6. Run three-gate elite dedup
 *   7. Create new elite_verification node
 *   8. Set generation, create parent edge
 *   9. Recompute content hash with parent hashes
 *  10. Register number variables + record verified variables
 *  11. Build provenance chain
 *  12. Record elite metadata in elite_nodes table
 *  13. Map to project manifest targets
 *  14. Mark source node as elite-considered
 *  15. Emit promotion event
 */
/**
 * @param sourceNodeId - The synthesis node ID that was verified by EVM
 * @param evmResult - The full EVM verification result including codegen, sandbox, and evaluation
 * @returns Promotion result with success/failure status and metadata
 */
export async function promoteToElite(
    sourceNodeId: string,
    evmResult: VerificationResult,
): Promise<ElitePromotionResult> {
    const cfg = appConfig.elitePool;
    if (!cfg.enabled) {
        return { success: false, sourceNodeId, generation: 0, domain: '', reason: 'Elite pool is disabled' };
    }

    // 1. Validate EVM result meets thresholds
    const confidence = evmResult.evaluation?.confidence ?? 0;
    const score = evmResult.evaluation?.score ?? 0;

    if (confidence < cfg.promotionThreshold) {
        return {
            success: false, sourceNodeId, generation: 0, domain: '',
            reason: `Confidence ${confidence.toFixed(3)} below threshold ${cfg.promotionThreshold}`,
        };
    }

    if (cfg.logicalApprovalEnabled) {
        const scaledScore = score * 10;
        if (scaledScore < cfg.logicalApprovalThreshold) {
            return {
                success: false, sourceNodeId, generation: 0, domain: '',
                reason: `Logical approval score ${scaledScore.toFixed(1)} below threshold ${cfg.logicalApprovalThreshold}`,
            };
        }
    }

    if (!evmResult.evaluation?.claimSupported && !evmResult.evaluation?.verified) {
        return { success: false, sourceNodeId, generation: 0, domain: '', reason: 'EVM result does not support the claim' };
    }

    // 2. Fetch source node
    const sourceNode = await queryOne(
        'SELECT id, content, domain, node_type, generation, weight FROM nodes WHERE id = $1 AND archived = 0',
        [sourceNodeId],
    ) as any;
    if (!sourceNode) {
        return { success: false, sourceNodeId, generation: 0, domain: '', reason: 'Source node not found or archived' };
    }
    const domain = sourceNode.domain || 'unknown';

    // 3. Compute generation
    const genInfo = await computeGeneration([sourceNodeId]);

    // 4. Check generation ceiling
    if (genInfo.atCeiling) {
        emitActivity('elite', 'generation_ceiling_reached',
            `Generation ceiling (${genInfo.maxGeneration}) reached for ${sourceNodeId.slice(0, 8)}`,
            { sourceNodeId, computedGeneration: genInfo.generation, maxGeneration: genInfo.maxGeneration },
        );
        return {
            success: false, sourceNodeId, generation: genInfo.generation, domain,
            reason: `Generation ${genInfo.generation} exceeds ceiling ${genInfo.maxGeneration}`,
        };
    }

    // 5. Build elite content from verification output (LLM-driven)
    const eliteContent = await buildEliteContent(evmResult, sourceNode.content, domain);
    if (!eliteContent) {
        return {
            success: false, sourceNodeId, generation: genInfo.generation, domain,
            reason: 'LLM content synthesis unavailable — promotion deferred (node will be retried)',
        };
    }

    // 6. Run three-gate elite dedup
    const candidateVarIds = extractVarIdsFromContent(eliteContent);
    if (cfg.dedup.enabled) {
        const dedupResult = await checkEliteDedup(eliteContent, candidateVarIds, [sourceNodeId]);
        if (dedupResult.isDuplicate) {
            emitActivity('elite', 'elite_duplicate_rejected',
                `Elite dedup: rejected at gate ${dedupResult.matchType}`,
                { sourceNodeId, gate: dedupResult.matchType, matchedEliteId: dedupResult.matchedNodeId, score: dedupResult.score },
            );
            return {
                success: false, sourceNodeId, generation: genInfo.generation, domain,
                reason: `Duplicate detected at gate: ${dedupResult.matchType}`,
                dedupResult,
            };
        }
    }

    // 7. Create the new elite_verification node
    const eliteNode = await createNode(eliteContent, 'elite_verification', 'elite-pool', {
        domain,
        contributor: 'elite-pool',
        weight: cfg.eliteWeight,
        skipDedup: true, // elite-specific dedup already ran
    });
    if (!eliteNode) {
        return { success: false, sourceNodeId, generation: genInfo.generation, domain, reason: 'Node creation failed (general dedup)' };
    }

    // 8. Set generation + create parent edge
    await query('UPDATE nodes SET generation = $1 WHERE id = $2', [genInfo.generation, eliteNode.id]);
    await createEdge(sourceNodeId, eliteNode.id, 'parent', 1.0);

    // 9. Recompute content hash with parent hashes (non-fatal)
    try {
        const parentRow = await queryOne(
            'SELECT content_hash FROM nodes WHERE id = $1 AND content_hash IS NOT NULL',
            [sourceNodeId],
        );
        if (parentRow?.content_hash) {
            const newHash = computeContentHash({
                content: eliteContent,
                nodeType: 'elite_verification',
                contributor: 'elite-pool',
                createdAt: eliteNode.created_at || new Date().toISOString(),
                parentHashes: [parentRow.content_hash],
            });
            await query('UPDATE nodes SET content_hash = $1 WHERE id = $2', [newHash, eliteNode.id]);
            logOperation({
                nodeId: eliteNode.id,
                operation: 'parents_linked',
                contentHashBefore: eliteNode.content_hash || null,
                contentHashAfter: newHash,
                parentHashes: [parentRow.content_hash],
                contributor: 'elite-pool',
                domain,
                details: { parentCount: 1, elitePromotion: true },
            }).catch(() => {});
        }
    } catch { /* integrity ops are non-fatal */ }

    // 10. Register number variables + record verified variables (non-fatal)
    let verifiedVariables = { varIds: [] as string[], count: 0 };
    if (appConfig.numberVariables?.enabled && domain) {
        try {
            const result = await registerNodeVariables(eliteNode.id, eliteContent, domain);
            if (result.varIds.length > 0) {
                await query('UPDATE nodes SET content = $1 WHERE id = $2', [result.annotatedContent, eliteNode.id]);
            }
            const sourceVarIds = await getNodeVarIds(sourceNodeId);
            if (sourceVarIds.length > 0) {
                const sourceVars = await getVariablesByIds(sourceVarIds);
                for (const v of sourceVars) {
                    await query(`
                        INSERT INTO elite_verified_variables (var_id, elite_node_id, verification_confidence, verified_value)
                        VALUES ($1, $2, $3, $4)
                    `, [v.varId, eliteNode.id, confidence, v.value]);
                }
                verifiedVariables = { varIds: sourceVarIds, count: sourceVarIds.length };
            }
        } catch (err: any) {
            console.error(`[elite-pool] Variable registration failed for ${eliteNode.id}: ${err.message}`);
        }
    }

    // 11. Build provenance chain
    const parentEdges = await query(
        `SELECT source_id FROM edges WHERE target_id = $1 AND edge_type = 'parent'`,
        [sourceNodeId],
    ) as any[];
    const provenance: ProvenanceChain = {
        sourceNodeId,
        parentNodeIds: parentEdges.map((e: any) => e.source_id),
        verificationCode: evmResult.codegen?.code,
        verificationOutput: evmResult.sandbox?.stdout?.slice(0, RC.contentLimits.eliteOutputTruncationChars),
        confidence,
        verificationType: evmResult.codegen?.claimType || 'mathematical',
        generation: genInfo.generation,
    };

    // 12. Record elite metadata
    const verificationType = categorizeVerificationType(evmResult);
    const verificationId = await getLatestVerificationId(sourceNodeId);
    await query(`
        INSERT INTO elite_nodes (node_id, source_verification_id, confidence, verification_type, provenance_chain)
        VALUES ($1, $2, $3, $4, $5)
    `, [eliteNode.id, verificationId, confidence, verificationType, JSON.stringify(provenance)]);

    await logDecision(
        'node', eliteNode.id, 'elite_promoted', null, 'true',
        'system', 'elite-pool',
        `Promoted to elite pool: gen ${genInfo.generation}, confidence ${confidence.toFixed(3)}`,
    );

    // 13. Map to manifest targets (non-fatal)
    let manifestMapping: ManifestMapping | null = null;
    if (cfg.manifestMapping.enabled) {
        try {
            manifestMapping = await mapToManifest(eliteNode.id, eliteContent, domain);
            if (manifestMapping && manifestMapping.targets.length > 0) {
                emitActivity('elite', 'manifest_progress',
                    `Manifest: ${manifestMapping.targets.length} target(s) covered`,
                    {
                        eliteNodeId: eliteNode.id,
                        targets: manifestMapping.targets.map(t => ({ type: t.type, score: t.relevanceScore })),
                    },
                );
            }
        } catch (err: any) {
            console.error(`[elite-pool] Manifest mapping failed for ${eliteNode.id}: ${err.message}`);
        }
    }

    // 14. Mark source node as elite-considered
    await query('UPDATE nodes SET elite_considered = 1 WHERE id = $1', [sourceNodeId]);

    // 15. Emit promotion event
    emitActivity('elite', 'elite_promoted',
        `Elite promoted: gen${genInfo.generation} in ${domain} (conf:${confidence.toFixed(2)})`,
        {
            eliteNodeId: eliteNode.id,
            sourceNodeId,
            generation: genInfo.generation,
            domain,
            confidence,
            verificationType,
            verifiedVarCount: verifiedVariables.count,
            manifestTargets: manifestMapping?.targets.length || 0,
        },
    );

    return {
        success: true,
        eliteNodeId: eliteNode.id,
        sourceNodeId,
        generation: genInfo.generation,
        domain,
        confidence,
        manifestMapping: manifestMapping || undefined,
        verifiedVariables,
    };
}

// =============================================================================
// BACKFILL — SCAN EXISTING VERIFIED NODES
// =============================================================================

/**
 * Scan existing EVM-verified nodes and promote qualifying ones to the elite pool.
 * Catches nodes verified before the elite pool was enabled.
 * Only considers nodes whose best verification meets threshold and that
 * don't already have an elite child.
 *
 * Nodes where the LLM content synthesis is unavailable are left as unconsidered
 * so they will be retried on the next scan. Genuinely rejected nodes are marked
 * as `elite_considered = 1` to prevent repeated processing.
 *
 * @param limit - Maximum number of candidates to process per scan (default: 100)
 * @returns Counts of promoted, skipped, and errored nodes
 */
export async function scanExistingVerified(limit: number = RC.queryLimits.eliteScanBatchSize): Promise<{ promoted: number; skipped: number; errors: number }> {
    const cfg = appConfig.elitePool;
    if (!cfg.enabled) return { promoted: 0, skipped: 0, errors: 0 };

    const candidates = await query(`
        SELECT e.node_id, e.id AS exec_id, e.confidence, e.score,
               e.hypothesis, e.code, e.stdout, e.claim_type, e.test_category,
               e.evaluation_mode
        FROM lab_executions e
        JOIN nodes n ON n.id = e.node_id AND n.archived = 0
        WHERE e.verified = 1
          AND e.confidence >= $1
          AND e.status = 'completed'
          AND COALESCE(n.elite_considered, 0) = 0
        GROUP BY e.node_id
        HAVING e.confidence = MAX(e.confidence)
        ORDER BY e.confidence DESC
        LIMIT $2
    `, [cfg.promotionThreshold, limit]) as any[];

    let promoted = 0, skipped = 0, errors = 0;

    for (const row of candidates) {
        try {
            const evmResult: VerificationResult = {
                nodeId: row.node_id,
                status: 'completed',
                testCategory: row.test_category || undefined,
                codegen: {
                    hypothesis: row.hypothesis || '',
                    code: row.code || '',
                    claimType: row.claim_type || 'unknown',
                    expectedBehavior: '',
                    evaluationMode: row.evaluation_mode || 'llm',
                    assertionPolarity: 'positive',
                    raw: '',
                },
                sandbox: {
                    success: true,
                    stdout: row.stdout || '',
                    stderr: '',
                    exitCode: 0,
                    executionTimeMs: 0,
                    killed: false,
                },
                evaluation: {
                    verified: true,
                    claimSupported: true,
                    confidence: row.confidence,
                    score: row.score ?? row.confidence,
                    mode: row.evaluation_mode || 'llm',
                    details: '',
                    rawOutput: null,
                },
                startedAt: new Date().toISOString(),
            };

            const result = await promoteToElite(row.node_id, evmResult);
            if (result.success) {
                promoted++;
                await query('UPDATE nodes SET elite_considered = 1 WHERE id = $1', [row.node_id]);
            } else if (result.reason?.includes('deferred')) {
                // LLM unavailable — leave unconsidered so it gets retried
                skipped++;
            } else {
                // Genuine rejection — mark as considered so we don't retry
                skipped++;
                await query('UPDATE nodes SET elite_considered = 1 WHERE id = $1', [row.node_id]);
            }
        } catch (err: any) {
            console.error(`[elite-pool] Scan error for ${row.node_id}: ${err.message}`);
            errors++;
            try { await query('UPDATE nodes SET elite_considered = 1 WHERE id = $1', [row.node_id]); } catch { /* ignore */ }
        }
    }

    if (promoted > 0) {
        emitActivity('elite', 'elite_backfill',
            `Backfill scan: promoted ${promoted}, skipped ${skipped}, errors ${errors}`,
            { promoted, skipped, errors, candidatesFound: candidates.length },
        );
    }

    return { promoted, skipped, errors };
}

// =============================================================================
// DEMOTION
// =============================================================================

/**
 * Demote an elite node back to synthesis status.
 * Cleans up all elite-specific DB records (`elite_nodes`, `elite_manifest_mappings`,
 * `elite_verified_variables`, `elite_bridging_log`) and reverts `node_type` to
 * 'synthesis'. Also invalidates the knowledge cache for the affected domain.
 *
 * @param nodeId - The elite node ID to demote
 * @param reason - Human-readable reason for demotion (default: 'Demoted via review')
 * @param contributor - Who initiated the demotion (default: 'system')
 * @returns Object with demotion details, or `{ error: string }` on failure
 */
export async function demoteFromElite(
    nodeId: string,
    reason: string = 'Demoted via review',
    contributor: string = 'system',
): Promise<Record<string, any>> {
    const node = await queryOne(
        `SELECT id, node_type, weight, domain FROM nodes WHERE id = $1 AND archived = FALSE`,
        [nodeId],
    );
    if (!node) return { error: `Node ${nodeId} not found` };
    if ((node as any).node_type !== 'elite_verification') {
        return { error: `Node ${nodeId} is not an elite node (type: ${(node as any).node_type})` };
    }

    const domain = (node as any).domain;

    await query(`DELETE FROM elite_nodes WHERE node_id = $1`, [nodeId]);
    await query(`DELETE FROM elite_manifest_mappings WHERE node_id = $1`, [nodeId]);
    await query(`DELETE FROM elite_verified_variables WHERE elite_node_id = $1`, [nodeId]);
    await query(
        `DELETE FROM elite_bridging_log WHERE parent_a_id = $1 OR parent_b_id = $1 OR synthesis_node_id = $1`,
        [nodeId],
    );

    await query(`UPDATE nodes SET node_type = 'synthesis', weight = 1.0 WHERE id = $1`, [nodeId]);
    await logDecision('node', nodeId, 'node_type', 'elite_verification', 'synthesis', contributor, 'demotion', reason);

    if (domain) {
        const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
        await invalidateKnowledgeCache(domain);
    }

    emitActivity('elite', 'elite_demotion',
        `Demoted elite node ${nodeId.slice(0, 8)} to synthesis: ${reason}`,
        { nodeId, reason, contributor },
    );

    console.error(`[elite-pool] Demoted ${nodeId.slice(0, 8)} from elite to synthesis: ${reason}`);

    return { nodeId, previousType: 'elite_verification', newType: 'synthesis', reason };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build rich elite content via LLM synthesis of the full verification data.
 * Uses the `elite_mapping` subsystem and `elite.content_synthesis` prompt to
 * generate a polished description of the verified finding.
 *
 * Returns null if the LLM call fails or returns a response shorter than 50
 * characters — in that case, promotion will be deferred until the subsystem
 * has a model assigned.
 *
 * @param evmResult - The full EVM verification result
 * @param sourceContent - The original synthesis node's content (resolved from number variables)
 * @param domain - The knowledge domain for context (default: 'unknown')
 * @returns The synthesized elite content string, or null if unavailable
 */
async function buildEliteContent(evmResult: VerificationResult, sourceContent: string, domain: string = 'unknown'): Promise<string | null> {
    const hypothesis = evmResult.codegen?.hypothesis || '';
    const code = evmResult.codegen?.code || '';
    const stdout = evmResult.sandbox?.stdout || '';
    const confidence = evmResult.evaluation?.confidence ?? 0;
    const claimType = evmResult.codegen?.claimType || evmResult.testCategory || 'unknown';

    const resolvedSourceContent = await resolveContent(sourceContent);

    try {
        const projectContext = await getProjectContextBlock();
        const basePrompt = await getPrompt('elite.content_synthesis', {
            sourceContent: resolvedSourceContent,
            hypothesis,
            verificationCode: code.slice(0, RC.contentLimits.eliteCodeTruncationChars),
            computationalOutput: stdout.slice(0, RC.contentLimits.eliteOutputTruncationChars),
            confidence: confidence.toFixed(3),
            claimType,
            domain,
        });

        const prompt = projectContext ? `${projectContext}\n\n${basePrompt}` : basePrompt;
        const response = await callSubsystemModel('elite_mapping', prompt);

        if (response && response.trim().length > 50) return response.trim();
        console.error('[elite-pool] LLM content synthesis returned empty/short response');
        return null;
    } catch (err: any) {
        console.error(`[elite-pool] LLM content synthesis failed (promotion deferred): ${err.message}`);
        return null;
    }
}

/**
 * Categorize the verification type from EVM result fields.
 * Priority: test category > code heuristic (sympy/math/mpmath) > default 'logical'.
 *
 * @param evmResult - The EVM verification result to categorize
 * @returns The verification type classification
 */
function categorizeVerificationType(evmResult: VerificationResult): 'mathematical' | 'logical' | 'empirical' {
    if (evmResult.testCategory === 'numerical') return 'mathematical';
    if (evmResult.testCategory === 'structural') return 'logical';
    if (evmResult.testCategory === 'domain_expert') return 'empirical';
    const code = evmResult.codegen?.code || '';
    if (code.includes('sympy') || code.includes('math.') || code.includes('mpmath')) return 'mathematical';
    return 'logical';
}

/**
 * Get the latest EVM execution ID for a node from the `lab_executions` table.
 *
 * @param nodeId - The node ID to look up the latest verification for
 * @returns The execution ID, or null if no verifications exist
 */
async function getLatestVerificationId(nodeId: string): Promise<string | null> {
    const row = await queryOne(`
        SELECT id FROM lab_executions
        WHERE node_id = $1
        ORDER BY created_at DESC
        LIMIT 1
    `, [nodeId]) as any;
    return row?.id || null;
}
