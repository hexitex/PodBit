/**
 * Graph propose handler — creates new nodes with full validation pipeline.
 *
 * Gate sequence: project-switch guard -> injection detection -> domain concentration ->
 * semantic validation -> embedding + junk filter -> supersedes handling -> createNode ->
 * edge linking -> generation computation -> content hash -> supersede detection.
 * @module handlers/graph/propose
 */

import { RC } from '../../config/constants.js';
import {
    query, queryOne,
    createNode, createEdge,
    logDecision,
    detectInjection,
    checkDomainConcentration,
} from '../../core.js';
import { config as appConfig } from '../../config.js';
import { yieldToEventLoop } from '../../db.js';
import { invalidateKnowledgeCache, cosineSimilarity } from '../knowledge.js';
import { getEmbedding } from '../../models.js';
import { validateProposal } from './validate.js';

/**
 * Creates a new knowledge graph node after running the full validation pipeline.
 *
 * Runs injection detection, domain concentration checks, semantic validation,
 * embedding-based junk filtering, and dedup before persisting. Also handles
 * explicit supersedes, parent edge linking, generation computation, content
 * hashing, and detection of potentially superseded existing nodes.
 *
 * @param params - Proposal parameters including content, nodeType, domain, parentIds,
 *   contributor, decidedByTier, supersedes, and optional weight.
 * @returns Object with `success: true` and node details, or `success: false`
 *   with rejection reason, scores, and suggestion.
 */
async function handlePropose(params: Record<string, any>) {
    const { content, nodeType, domain, parentIds, contributor, decidedByTier, supersedes, weight: requestedWeight } = params;

    // === Project switching guard ===
    // Reject autonomous proposals while a project switch is in progress.
    // This prevents inflight LLM calls (that escaped the AbortController) from
    // writing nodes into the wrong project's database.
    const { isProjectSwitching } = await import('../projects.js');
    if (isProjectSwitching() && contributor !== 'human' && !contributor?.startsWith('human:')) {
        console.warn(`[graph] Proposal REJECTED (project switch in progress, contributor: ${contributor})`);
        return {
            success: false,
            rejected: true,
            reason: 'Project switch in progress — proposal rejected to prevent cross-project contamination',
        };
    }

    // === Injection detection gate (runs on ALL proposals, including seeds/human) ===
    const injectionResult = detectInjection(content);
    if (injectionResult.isInjection) {
        const autoReject = appConfig.injection.autoRejectTypes.includes(nodeType);
        if (autoReject) {
            console.warn(`[graph] Proposal REJECTED (injection detected in ${nodeType}): ${injectionResult.reasons.join(', ')}`);
            return {
                success: false,
                rejected: true,
                reason: `Injection markers detected: ${injectionResult.reasons.join('; ')}`,
                scores: { injectionScore: injectionResult.score, injectionReasons: injectionResult.reasons },
            };
        } else {
            console.warn(`[graph] Proposal FLAGGED (injection markers in ${nodeType} from ${contributor}): ${injectionResult.reasons.join(', ')}`);
        }
    }

    // === Domain concentration gate (intake defense) ===
    // Skip for human contributors, KB ingestion, seeds, and direct claude seeding.
    // The throttle protects against runaway autonomous cycles flooding one domain,
    // NOT against legitimate seeding or KB ingestion.
    const isHumanContributor = contributor?.startsWith('human');
    const isKbContributor = contributor?.startsWith('kb:');
    const isApiEnrichment = contributor?.startsWith('api-enrichment:');
    const isSeedType = nodeType === 'seed';
    const skipConcentration = isHumanContributor || isKbContributor || isApiEnrichment || isSeedType;
    if (domain && appConfig.intakeDefense.enabled && !skipConcentration) {
        const concentration = await checkDomainConcentration(domain, appConfig.intakeDefense);
        if (concentration.throttled) {
            console.warn(`[graph] Proposal REJECTED (domain concentration: ${(concentration.ratio * 100).toFixed(0)}% ${domain}, ${concentration.domainCount}/${concentration.totalCount} recent nodes)`);
            return {
                success: false,
                rejected: true,
                reason: `Domain "${domain}" exceeds concentration limit (${(concentration.ratio * 100).toFixed(0)}% of recent proposals, threshold ${(appConfig.intakeDefense.throttleThreshold * 100).toFixed(0)}%)`,
            };
        }
        if (concentration.warning) {
            console.warn(`[graph] Domain concentration warning: ${(concentration.ratio * 100).toFixed(0)}% ${domain} (${concentration.domainCount}/${concentration.totalCount} recent nodes)`);
        }
    }

    // === Semantic validation gate ===
    // Skip for human contributors (trust the human) and seeds (foundational input)
    const isHuman = contributor?.startsWith('human');
    const skipValidation = isHuman || nodeType === 'seed';

    if (!skipValidation) {
        const validation = await validateProposal(content, domain, nodeType);
        if (!validation.accepted) {
            return {
                success: false,
                rejected: true,
                reason: validation.reason,
                scores: validation.scores,
                suggestion: validation.suggestion,
            };
        }
    }

    // Compute embedding early — used for similarity detection and passed to createNode
    const embedding = await getEmbedding(content);

    // === Embedding-based junk filter ===
    // Skip for seeds and human contributors — junk filter protects against bad synthesis
    // output being regenerated, NOT against new foundational input. Seeds are the raw
    // material the system needs; blocking them based on previous bad synthesis poisons
    // the graph's ability to recover.
    const skipJunkFilter = nodeType === 'seed' || isHumanContributor || isKbContributor || isApiEnrichment;
    if (embedding && !skipJunkFilter) {
        const junkThreshold = appConfig.engine?.junkThreshold ?? 0.85;
        const junkLimit = appConfig.magicNumbers?.junkFilterLimit || RC.queryLimits.junkFilterPoolSize;
        // Only check junk from the last N days — old junk shouldn't block new content forever
        const junkCutoff = new Date(Date.now() - RC.misc.junkAgeCutoffDays * 24 * 3600_000).toISOString();
        const junkNodes = await query(`
            SELECT id, embedding FROM nodes
            WHERE junk = 1 AND created_at >= $3
            ORDER BY CASE WHEN domain = $1 THEN 0 ELSE 1 END, created_at DESC
            LIMIT $2
        `, [domain || '', junkLimit, junkCutoff]);

        for (const junk of junkNodes as any[]) {
            if (!junk.embedding) continue;
            try {
                const junkEmb = typeof junk.embedding === 'string'
                    ? JSON.parse(junk.embedding) : junk.embedding;
                const sim = cosineSimilarity(embedding, junkEmb);
                if (sim >= junkThreshold) {
                    return {
                        success: false,
                        rejected: true,
                        reason: `Too similar to junked node ${junk.id.slice(0, 8)} (embedding sim=${sim.toFixed(3)} ≥ ${junkThreshold})`,
                    };
                }
            } catch { /* bad embedding */ }
        }
    }

    // Handle explicit supersedes — archive specified nodes
    const supersededNodes: { id: string; content: string }[] = [];
    if (supersedes && Array.isArray(supersedes) && supersedes.length > 0) {
        for (const nodeId of supersedes) {
            const existing = await queryOne(
                'SELECT id, content, domain FROM nodes WHERE id = $1 AND archived = FALSE',
                [nodeId]
            );
            if (existing) {
                await query('UPDATE nodes SET archived = 1 WHERE id = $1', [nodeId]);
                await logDecision(
                    'node', nodeId, 'archived', 'false', 'true',
                    contributor || 'system', 'superseded',
                    `Superseded by new proposal from ${contributor || 'unknown'}`
                );
                supersededNodes.push({ id: existing.id, content: existing.content.slice(0, 100) });
                invalidateKnowledgeCache(existing.domain);
            }
        }
    }

    // Create the node with tier provenance and pre-computed embedding
    const node = await createNode(content, nodeType, contributor.split(':')[0], {
        domain,
        contributor,
        decidedByTier: decidedByTier || (isHuman ? 'human' : 'system'),
        weight: requestedWeight || (nodeType === 'breakthrough' ? appConfig.nodes.breakthroughWeight : appConfig.nodes.defaultWeight),
        embedding,
    });

    // Dedup gate may return null — reject gracefully
    if (!node) {
        return {
            success: false,
            rejected: true,
            reason: 'Duplicate content detected (embedding similarity to existing node)',
        };
    }

    // Yield to event loop — createNode did 8-11 DB writes; let HTTP handlers run
    await yieldToEventLoop();

    // Number variable extraction now happens inside createNode() — all code paths get it.
    // Yield before edge linking — let HTTP handlers run
    await yieldToEventLoop();

    // Create parent edges if provided
    if (parentIds && parentIds.length > 0) {
        for (const parentId of parentIds) {
            await createEdge(parentId, node.id, 'parent');
        }

        // Set generation = max(parent generations) + 1
        try {
            const parentGenRows = await query(
                `SELECT COALESCE(MAX(generation), 0) as max_gen FROM nodes WHERE id IN (${parentIds.map((_: any, i: number) => `$${i + 1}`).join(',')})`,
                parentIds
            );
            const maxParentGen = (parentGenRows as any[])[0]?.max_gen ?? 0;
            const childGen = maxParentGen + 1;
            await query('UPDATE nodes SET generation = $1 WHERE id = $2', [childGen, node.id]);
            (node as any).generation = childGen;
        } catch (e: any) {
            console.error(`[graph] Generation computation failed for ${node.id}: ${e.message}`);
        }

        // Recompute content hash WITH parent hashes for provenance linking
        try {
            const { computeContentHash, logOperation } = await import('../../core/integrity.js');
            const parentRows = await query(
                `SELECT content_hash FROM nodes WHERE id IN (${parentIds.map((_: any, i: number) => `$${i + 1}`).join(',')}) AND content_hash IS NOT NULL`,
                parentIds
            );
            const parentHashes = parentRows.map((r: any) => r.content_hash).filter(Boolean);
            if (parentHashes.length > 0) {
                const oldHash = node.content_hash || null;
                const newHash = computeContentHash({
                    content: node.content,
                    nodeType: node.node_type,
                    contributor: node.contributor || null,
                    createdAt: node.created_at,
                    parentHashes,
                });
                await query('UPDATE nodes SET content_hash = $1 WHERE id = $2', [newHash, node.id]);

                logOperation({
                    nodeId: node.id,
                    operation: 'parents_linked',
                    contentHashBefore: oldHash,
                    contentHashAfter: newHash,
                    parentHashes,
                    contributor: node.contributor || contributor,
                    domain: node.domain,
                    details: { parentCount: parentIds.length },
                }).catch((err: any) => {
                    console.error(`[integrity] Failed to log parent linking for ${node.id}: ${err.message}`);
                });
            }
        } catch (err: any) {
            console.error(`[integrity] Failed to recompute hash with parents for ${node.id}: ${err.message}`);
        }
    }

    // Invalidate cached compress/summarize for this domain
    invalidateKnowledgeCache(node.domain);

    // Yield after edge linking + hash recompute — let HTTP handlers run before scanning
    await yieldToEventLoop();

    // Detect potentially superseded nodes (same domain, high embedding similarity)
    const potentiallySuperseded: { id: string; content: string; type: string; weight: number; similarity: number; contributor: string | null; createdAt: string }[] = [];
    if (domain && embedding) {
        const threshold = appConfig.dedup.supersedesThreshold;
        const candidates = await query(
            `SELECT id, content, node_type, weight, contributor, created_at, embedding FROM nodes
             WHERE archived = FALSE AND domain = $1 AND id != $2
             ORDER BY weight DESC
             LIMIT $3`,
            [domain, node.id, appConfig.dedup.maxNodesPerDomain]
        );

        for (const candidate of candidates) {
            if (candidate.embedding) {
                const candidateEmb = typeof candidate.embedding === 'string'
                    ? JSON.parse(candidate.embedding) : candidate.embedding;
                const sim = cosineSimilarity(embedding, candidateEmb);
                if (sim >= threshold) {
                    potentiallySuperseded.push({
                        id: candidate.id,
                        content: candidate.content,
                        type: candidate.node_type,
                        weight: candidate.weight,
                        similarity: Math.round(sim * 1000) / 1000,
                        contributor: candidate.contributor,
                        createdAt: candidate.created_at,
                    });
                }
            }
        }

        potentiallySuperseded.sort((a, b) => b.similarity - a.similarity);

        // Truncate content and limit count to prevent MCP response bloat
        const MAX_SUPERSEDED = 15;
        const CONTENT_PREVIEW_LEN = RC.contentLimits.contentPreviewLength;
        if (potentiallySuperseded.length > MAX_SUPERSEDED) {
            potentiallySuperseded.length = MAX_SUPERSEDED;
        }
        for (const ps of potentiallySuperseded) {
            if (ps.content.length > CONTENT_PREVIEW_LEN) {
                ps.content = ps.content.slice(0, CONTENT_PREVIEW_LEN);
            }
        }
    }

    return {
        success: true,
        node: {
            id: node.id,
            content: node.content,
            type: node.node_type,
            domain: node.domain,
            specificity: node.specificity,
            weight: node.weight,
        },
        superseded: supersededNodes.length > 0 ? supersededNodes : undefined,
        potentiallySuperseded: potentiallySuperseded.length > 0 ? potentiallySuperseded : undefined,
        injectionFlags: injectionResult.isInjection
            ? { score: injectionResult.score, reasons: injectionResult.reasons }
            : undefined,
    };
}

export { handlePropose };
