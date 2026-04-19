/**
 * @module core/cycles/population-control
 *
 * Post-birth quality evaluation cycle. Picks recently-synthesized nodes
 * that have passed their grace period and evaluates them.
 *
 * Two evaluation modes:
 * - Embedding eval LIVE (shadow OFF): embedding checks replace the LLM
 *   consultant entirely. FAIL→archive, REVIEW→demote, PASS→boost.
 *   Zero LLM cost per evaluation.
 * - Embedding eval SHADOW or DISABLED: LLM consultant runs a single
 *   comprehensive call. In shadow mode, embedding checks also run and
 *   log results for calibration comparison.
 *
 * Dedup sweep: after individual node evaluation, runs an embedding-only
 * dedup pass per domain. Uses star clustering (same algorithm as manual
 * dedup) to find duplicate clusters among low-weight, recently-created
 * nodes. Keeps the highest-weight center, archives the rest. No LLM
 * needed — pure cosine similarity + word overlap.
 *
 * This separates "birth" (permissive, mechanical checks only) from
 * "culling" (strict, evaluated), allowing creative cross-domain
 * synthesis to happen while maintaining graph quality over time.
 */

import { query } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { emitActivity } from '../../services/event-bus.js';
import type { ResonanceNode } from '../types.js';
import type { EmbeddingEvalResult } from '../embedding-eval.js';

/**
 * One tick of the population control cycle.
 *
 * 1. Query nodes past grace period that haven't been evaluated
 * 2. For each, recover parents from edges table
 * 3. Run a single comprehensive LLM evaluation
 * 4. Apply outcome: boost / demote / archive
 */
async function runPopulationControlCycleSingle(): Promise<void> {
    const cfg = appConfig.populationControl;
    if (!cfg?.enabled) return;

    const graceHours = cfg.gracePeriodHours ?? 2;
    const batchSize = cfg.batchSize ?? 5;

    const candidates = await query(`
        SELECT id, content, weight, domain, node_type, specificity,
               embedding, embedding_bin, salience
        FROM nodes
        WHERE cull_evaluated_at IS NULL
          AND node_type IN ('voiced', 'synthesis')
          AND archived = 0
          AND lab_status IS NULL
          AND created_at < datetime('now', '-${Math.floor(graceHours * 60)} minutes')
        ORDER BY created_at ASC
        LIMIT $1
    `, [batchSize]) as ResonanceNode[];

    if (candidates.length > 0) {
        for (const node of candidates) {
            try {
                await evaluateNode(node, cfg);
            } catch (err: any) {
                console.error(`[population_control] Error evaluating ${node.id?.slice(0, 8)}: ${err.message}`);
                emitActivity('cycle', 'population_control_error', `Error evaluating ${node.id?.slice(0, 8)}: ${err.message}`, {
                    nodeId: node.id, error: err.message,
                });
            }
        }
    }

    // Phase 2: embedding-only dedup sweep (runs every tick, zero LLM cost)
    try {
        await runDedupSweep();
    } catch (err: any) {
        console.error(`[population_control] Dedup sweep error: ${err.message}`);
    }
}

/**
 * Evaluate a single node via embedding pre-screen + LLM consultant and apply outcome.
 *
 * When the embedding evaluation layer is enabled:
 * 1. Run instruction-aware embedding checks (modes 1, 4, 8)
 * 2. If any check FAILs and NOT in shadow mode → archive immediately (skip LLM)
 * 3. If checks PASS or are in shadow mode → run the LLM consultant as before
 * 4. Log all embedding results regardless of shadow mode
 */
async function evaluateNode(node: ResonanceNode, cfg: typeof appConfig.populationControl): Promise<void> {
    // Recover parent nodes from edges table
    const parents = await query(`
        SELECT n.id, n.content, n.weight, n.domain, n.node_type,
               n.specificity, n.embedding, n.embedding_bin
        FROM edges e JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.archived = 0 AND n.lab_status IS NULL
    `, [node.id]) as ResonanceNode[];

    if (parents.length === 0) {
        // No parents found — mark as evaluated (skip, don't punish orphans)
        await query(`UPDATE nodes SET cull_evaluated_at = datetime('now') WHERE id = $1`, [node.id]);
        return;
    }

    const nodeLabel = node.id?.slice(0, 8) ?? 'unknown';
    const currentWeight = (node as any).weight ?? 1.0;

    // ── Tier 1: Embedding pre-screen ───────────────────────────────────
    let embeddingResult: EmbeddingEvalResult | null = null;
    const eeCfg = appConfig.embeddingEval;

    if (eeCfg?.enabled) {
        try {
            const { evaluateNode: evalEmbed } = await import('../embedding-eval.js');
            embeddingResult = await evalEmbed(
                node.id!,
                node.content || '',
                node.domain || null,
                parents.map((p: any) => ({ id: p.id, content: p.content })),
            );

            // Log embedding results
            const checkSummary = embeddingResult.checks
                .map(c => `${c.modeName}:${c.result}(${c.score.toFixed(3)})`)
                .join(' ');
            console.error(`[population_control] ${nodeLabel} embedding: ${checkSummary}`);

            emitActivity('cycle', 'embedding_eval', `Embedding eval ${nodeLabel}: ${checkSummary}`, {
                nodeId: node.id,
                domain: node.domain,
                checks: embeddingResult.checks,
                anyFail: embeddingResult.anyFail,
                shadowMode: eeCfg.shadowMode,
            });

            // Live mode: embedding eval IS the decision maker (replaces LLM consultant)
            if (!eeCfg.shadowMode) {
                let action: 'boost' | 'archive';
                let newWeight = currentWeight;
                let reasoning: string;

                if (embeddingResult.anyFail) {
                    const failChecks = embeddingResult.checks.filter(c => c.result === 'FAIL');
                    const failModes = failChecks.map(c => c.modeName).join(', ');
                    action = 'archive';
                    reasoning = `Embedding eval failed: ${failModes}`;
                } else {
                    action = 'boost';
                    newWeight = currentWeight * (cfg.boostWeight ?? 1.1);
                    reasoning = 'Embedding eval: all checks passed';
                }

                // Clamp weight
                const weightCeiling = appConfig.engine?.weightCeiling ?? 3.0;
                const weightFloor = appConfig.engine?.weightFloor ?? 0.05;
                newWeight = Math.max(weightFloor, Math.min(weightCeiling, newWeight));

                if (action === 'archive') {
                    await query(`UPDATE nodes SET archived = 1, cull_evaluated_at = datetime('now') WHERE id = $1`, [node.id]);
                } else {
                    await query(`UPDATE nodes SET cull_evaluated_at = datetime('now'), weight = $1 WHERE id = $2`, [newWeight, node.id]);
                }

                console.error(`[population_control] ${nodeLabel}: ${action.toUpperCase()} by embedding eval — ${reasoning}`);
                emitActivity('cycle', `population_control_${action}`, `Population control: ${action} ${nodeLabel} (embedding)`, {
                    nodeId: node.id,
                    domain: node.domain,
                    compositeScore: null,
                    accept: action !== 'archive',
                    reasoning,
                    action,
                    previousWeight: currentWeight,
                    newWeight,
                    embeddingEval: {
                        anyFail: embeddingResult.anyFail,
                        checks: embeddingResult.checks,
                    },
                });
                return; // Done — no LLM consultant needed
            }
            // Shadow mode: embedding logged above, fall through to LLM consultant
        } catch (err: any) {
            // Fail-open: embedding errors don't block the consultant
            console.error(`[population_control] Embedding eval error for ${nodeLabel}: ${err.message}`);
        }
    }

    // ── Tier 2: LLM consultant ─────────────────────────────────────────
    let compositeScore = 5.0;
    let reasoning = '';
    let accept = true;

    try {
        const { runComprehensiveConsultant } = await import('../synthesis-engine.js');
        const result = await runComprehensiveConsultant(node.content || '', parents as any, node.domain);
        compositeScore = result.composite;
        reasoning = result.reasoning || '';
        accept = result.accept;
    } catch (err: any) {
        console.error(`[population_control] Consultant error for ${nodeLabel}: ${err.message}`);
        // On error, mark evaluated but don't punish — default mid-range score
    }

    // ── Apply outcome ──────────────────────────────────────────────────
    const threshold = cfg.threshold ?? 4.0;
    const archiveThreshold = cfg.archiveThreshold ?? 2.0;

    let action: 'boost' | 'demote' | 'archive';
    let newWeight: number;

    if (compositeScore >= threshold) {
        action = 'boost';
        newWeight = currentWeight * (cfg.boostWeight ?? 1.1);
    } else if (compositeScore >= archiveThreshold) {
        action = 'demote';
        newWeight = currentWeight * (cfg.demoteWeight ?? 0.5);
    } else {
        action = 'archive';
        newWeight = currentWeight;
    }

    // Clamp weight
    const weightCeiling = appConfig.engine?.weightCeiling ?? 3.0;
    const weightFloor = appConfig.engine?.weightFloor ?? 0.05;
    newWeight = Math.max(weightFloor, Math.min(weightCeiling, newWeight));

    if (action === 'archive') {
        await query(`UPDATE nodes SET archived = 1, cull_evaluated_at = datetime('now'), weight = $1 WHERE id = $2`, [newWeight, node.id]);
    } else {
        await query(`UPDATE nodes SET cull_evaluated_at = datetime('now'), weight = $1 WHERE id = $2`, [newWeight, node.id]);
    }

    console.error(`[population_control] ${nodeLabel}: score=${compositeScore.toFixed(1)} action=${action} weight=${currentWeight.toFixed(2)}→${newWeight.toFixed(2)} accept=${accept}`);

    emitActivity('cycle', `population_control_${action}`, `Population control: ${action} ${nodeLabel} (score: ${compositeScore.toFixed(1)})`, {
        nodeId: node.id,
        domain: node.domain,
        compositeScore,
        accept,
        reasoning: reasoning.slice(0, 300),
        action,
        previousWeight: currentWeight,
        newWeight,
        embeddingEval: embeddingResult ? {
            anyFail: embeddingResult.anyFail,
            checks: embeddingResult.checks,
        } : undefined,
    });
}

// =============================================================================
// DEDUP SWEEP — embedding-only duplicate detection per domain
// =============================================================================

/**
 * Tracks the most recent node creation time seen per domain to skip re-scanning
 * domains that haven't changed since the last sweep.
 */
const _lastSweepWatermark = new Map<string, string>();

/**
 * Run an embedding-only dedup sweep across domains with recent activity.
 *
 * Only re-scans a domain when new nodes have been created since the last sweep.
 * Pre-parses embedding JSON once per node (not per-pair) to avoid O(n²)
 * JSON.parse overhead that blocks the event loop.
 *
 * Targets the newest, lowest-weight nodes first — these are the most likely
 * to be redundant synthesis outputs that slipped through the birth gate.
 * Uses the same star clustering algorithm as manual dedup (center = highest
 * weight, members must be directly similar to center, no transitive chains).
 *
 * Zero LLM cost — pure cosine similarity + word overlap.
 */
async function runDedupSweep(): Promise<void> {
    const cfg = appConfig.populationControl;
    const dedupCfg = cfg.dedupSweep;
    if (!dedupCfg?.enabled) return;

    const maxAge = dedupCfg.maxAgeDays ?? 7;
    const maxNodes = dedupCfg.maxNodesPerDomain ?? 100;
    const embThreshold = dedupCfg.embeddingThreshold ?? 0.90;
    const wordThreshold = dedupCfg.wordOverlapThreshold ?? 0.80;

    // Find domains with recent unswept synthesis/voiced nodes
    const domains = await query(`
        SELECT DISTINCT domain FROM nodes
        WHERE archived = 0
          AND lab_status IS NULL
          AND node_type IN ('voiced', 'synthesis')
          AND created_at > datetime('now', '-${Math.floor(maxAge)} days')
          AND domain IS NOT NULL
    `, []) as { domain: string }[];

    if (domains.length === 0) return;

    const { buildClusters } = await import('../../handlers/dedup.js');

    let totalArchived = 0;

    for (const { domain } of domains) {
        // Change detection: skip domains with no new nodes since last sweep
        const latestRow = await query(`
            SELECT MAX(created_at) as latest FROM nodes
            WHERE archived = 0 AND lab_status IS NULL AND node_type IN ('voiced', 'synthesis')
              AND domain = $1
              AND created_at > datetime('now', '-${Math.floor(maxAge)} days')
        `, [domain]) as { latest: string | null }[];
        const latest = latestRow[0]?.latest;
        if (!latest) continue;

        const lastWatermark = _lastSweepWatermark.get(domain);
        if (lastWatermark && latest <= lastWatermark) continue; // no new nodes

        // Fetch candidate nodes: newest and lowest-weight first
        // This prioritizes archiving cheap, recent nodes over established ones
        const candidates = await query(`
            SELECT id, content, weight, domain, embedding
            FROM nodes
            WHERE archived = 0
              AND lab_status IS NULL
              AND node_type IN ('voiced', 'synthesis')
              AND domain = $1
              AND created_at > datetime('now', '-${Math.floor(maxAge)} days')
            ORDER BY weight ASC, created_at DESC
            LIMIT $2
        `, [domain, maxNodes]) as { id: string; content: string; weight: number; domain: string; embedding?: string | null }[];

        if (candidates.length < 2) {
            _lastSweepWatermark.set(domain, latest);
            continue;
        }

        // Pre-parse embeddings ONCE — avoids O(n²) JSON.parse in areSimilar()
        // which was blocking the event loop for seconds per domain
        for (const c of candidates) {
            if (c.embedding && typeof c.embedding === 'string') {
                try {
                    (c as any).embedding = JSON.parse(c.embedding);
                } catch {
                    c.embedding = null;
                }
            }
        }

        // Build related-pairs set to exclude parent-child from clustering
        const edges = await query(`
            SELECT source_id, target_id FROM edges
            WHERE edge_type IN ('parent', 'tension_source')
              AND (source_id IN (${candidates.map((_, i) => `$${i + 1}`).join(',')})
                OR target_id IN (${candidates.map((_, i) => `$${i + 1}`).join(',')}))
        `, candidates.map(c => c.id)) as { source_id: string; target_id: string }[];

        const relatedPairs = new Set<string>();
        for (const e of edges) {
            relatedPairs.add(`${e.source_id}:${e.target_id}`);
            relatedPairs.add(`${e.target_id}:${e.source_id}`);
        }

        // Sort by weight DESC for star clustering (highest weight becomes center = kept)
        candidates.sort((a, b) => b.weight - a.weight);

        const { clusters, similarities } = buildClusters(candidates, embThreshold, wordThreshold, relatedPairs);

        // Update watermark regardless of whether clusters were found
        _lastSweepWatermark.set(domain, latest);

        if (clusters.length === 0) continue;

        // Archive non-center members in each cluster
        for (const cluster of clusters) {
            const center = candidates[cluster[0]];
            const members = cluster.slice(1);

            for (const idx of members) {
                const node = candidates[idx];
                const simKey = cluster[0] < idx ? `${cluster[0]},${idx}` : `${idx},${cluster[0]}`;
                const similarity = similarities.get(simKey) ?? 0;

                await query(`UPDATE nodes SET archived = 1 WHERE id = $1`, [node.id]);
                totalArchived++;

                emitActivity('cycle', 'population_control_dedup',
                    `Dedup sweep: archived ${node.id.slice(0, 8)} (sim=${similarity.toFixed(3)} to ${center.id.slice(0, 8)})`,
                    {
                        archivedNodeId: node.id,
                        keptNodeId: center.id,
                        domain,
                        similarity,
                        archivedWeight: node.weight,
                        keptWeight: center.weight,
                    },
                );
            }
        }

        if (clusters.length > 0) {
            const clusterMembers = clusters.reduce((sum, c) => sum + c.length - 1, 0);
            console.error(`[population_control] Dedup sweep ${domain}: ${clusters.length} clusters, ${clusterMembers} archived`);
        }
    }

    if (totalArchived > 0) {
        emitActivity('cycle', 'population_control_dedup_summary',
            `Dedup sweep complete: ${totalArchived} nodes archived across ${domains.length} domains`,
            { totalArchived, domainsScanned: domains.length },
        );
    }
}

export { runPopulationControlCycleSingle, runDedupSweep };
