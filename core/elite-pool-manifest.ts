/**
 * Elite Verification Pool — Manifest Mapping
 *
 * Maps elite nodes to project manifest targets (goals, key questions, cross-domain
 * bridges) using the `elite_mapping` LLM subsystem. Provides coverage reports
 * and gap analysis to guide the synthesis engine toward under-addressed targets.
 *
 * Manifest data is sourced from the project context system (`project-context.ts`)
 * and persisted per-mapping in the `elite_manifest_mappings` table.
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { getProjectManifest } from './project-context.js';
import type {
    ManifestMapping,
    ManifestCoverage,
    ManifestGaps,
    ManifestTargetCoverage,
    TerminalFinding,
} from './elite-pool-types.js';

// =============================================================================
// MANIFEST MAPPING
// =============================================================================

/**
 * Map an elite node to project manifest targets (goals, questions, bridges).
 * Uses the `elite_mapping` LLM subsystem to score relevance of the elite
 * content against each manifest target. Scores below `minRelevanceScore`
 * are filtered out. Results are persisted to `elite_manifest_mappings`.
 *
 * @param eliteNodeId - The elite node ID being mapped
 * @param content - The elite node's content text
 * @param domain - The knowledge domain of the elite node
 * @returns Mapping with scored targets, or null if no manifest / LLM failure
 */
export async function mapToManifest(
    eliteNodeId: string,
    content: string,
    domain: string,
): Promise<ManifestMapping | null> {
    const manifest = await getProjectManifest();
    if (!manifest) return null;

    const minRelevance = appConfig.elitePool.manifestMapping.minRelevanceScore;

    // Build flat target list across all manifest dimensions
    const allTargets: Array<{ type: 'goal' | 'question' | 'bridge'; text: string }> = [];
    for (const goal of manifest.goals || []) allTargets.push({ type: 'goal', text: goal });
    for (const q of manifest.keyQuestions || []) allTargets.push({ type: 'question', text: q });
    for (const bridge of manifest.bridges || []) allTargets.push({ type: 'bridge', text: bridge.join(' ↔ ') });

    if (allTargets.length === 0) return null;

    try {
        const { callSubsystemModel } = await import('../models.js');
        const { getPrompt } = await import('../prompts.js');
        const prompt = await getPrompt('elite.manifest_mapping', {
            domain,
            content,
            targets: allTargets.map((t, i) => `${i + 1}. [${t.type.toUpperCase()}] ${t.text}`).join('\n'),
        });

        const response = await callSubsystemModel('elite_mapping', prompt);
        if (!response) return null;

        const arrayMatch = response.match(/\[[\d.,\s]+\]/);
        if (!arrayMatch) return null;

        const scores: number[] = JSON.parse(arrayMatch[0]);
        if (!Array.isArray(scores) || scores.length !== allTargets.length) return null;

        const targets: ManifestMapping['targets'] = [];
        for (let i = 0; i < allTargets.length; i++) {
            const score = Math.max(0, Math.min(1, scores[i] || 0));
            if (score >= minRelevance) {
                targets.push({ type: allTargets[i].type, text: allTargets[i].text, relevanceScore: score });
            }
        }

        const mapping: ManifestMapping = { eliteNodeId, targets, mappedAt: new Date().toISOString() };

        // Persist to DB
        for (const target of targets) {
            await query(`
                INSERT INTO elite_manifest_mappings (node_id, manifest_target_type, manifest_target_text, relevance_score)
                VALUES ($1, $2, $3, $4)
            `, [eliteNodeId, target.type, target.text, target.relevanceScore]);
        }

        return mapping;
    } catch (err: any) {
        console.error(`[elite-pool] Manifest mapping LLM call failed: ${err.message}`);
        return null;
    }
}

// =============================================================================
// MANIFEST COVERAGE
// =============================================================================

/**
 * Get current manifest coverage — which goals/questions/bridges are covered
 * by elite nodes and which remain as gaps.
 *
 * Queries the `elite_manifest_mappings` table for each manifest target and
 * assembles a full coverage report with per-target detail and an overall
 * coverage fraction.
 *
 * @returns Full coverage report, or null if no project manifest is configured
 */
export async function getManifestCoverage(): Promise<ManifestCoverage | null> {
    const manifest = await getProjectManifest();
    if (!manifest) return null;

    async function getCoverage(targetType: string, targetText: string): Promise<ManifestTargetCoverage> {
        const rows = await query(`
            SELECT emm.node_id, emm.relevance_score
            FROM elite_manifest_mappings emm
            JOIN nodes n ON n.id = emm.node_id AND n.archived = 0
            WHERE emm.manifest_target_type = $1 AND emm.manifest_target_text = $2
            ORDER BY emm.relevance_score DESC
        `, [targetType, targetText]) as any[];
        return {
            text: targetText,
            coveredBy: rows.map((r: any) => r.node_id),
            bestScore: rows.length > 0 ? rows[0].relevance_score : 0,
        };
    }

    const goalsCoverage: ManifestTargetCoverage[] = [];
    const questionsCoverage: ManifestTargetCoverage[] = [];
    const bridgesCoverage: ManifestTargetCoverage[] = [];
    const uncoveredGoals: string[] = [];
    const uncoveredQuestions: string[] = [];
    const uncoveredBridges: string[] = [];

    for (const goal of manifest.goals || []) {
        const cov = await getCoverage('goal', goal);
        goalsCoverage.push(cov);
        if (cov.coveredBy.length === 0) uncoveredGoals.push(goal);
    }
    for (const q of manifest.keyQuestions || []) {
        const cov = await getCoverage('question', q);
        questionsCoverage.push(cov);
        if (cov.coveredBy.length === 0) uncoveredQuestions.push(q);
    }
    for (const bridge of manifest.bridges || []) {
        const text = bridge.join(' ↔ ');
        const cov = await getCoverage('bridge', text);
        bridgesCoverage.push(cov);
        if (cov.coveredBy.length === 0) uncoveredBridges.push(text);
    }

    const totalTargets = goalsCoverage.length + questionsCoverage.length + bridgesCoverage.length;
    const coveredTargets = totalTargets - uncoveredGoals.length - uncoveredQuestions.length - uncoveredBridges.length;

    return {
        goals: goalsCoverage,
        questions: questionsCoverage,
        bridges: bridgesCoverage,
        uncoveredGoals,
        uncoveredQuestions,
        uncoveredBridges,
        overallCoverage: totalTargets > 0 ? coveredTargets / totalTargets : 0,
    };
}

/**
 * Get manifest gaps — targets with no elite coverage.
 * Signals to the synthesis engine which areas need more work.
 *
 * This is a convenience wrapper around {@link getManifestCoverage} that
 * extracts only the uncovered targets and gap counts.
 *
 * @returns Gap summary, or null if no project manifest is configured
 */
export async function getManifestGaps(): Promise<ManifestGaps | null> {
    const coverage = await getManifestCoverage();
    if (!coverage) return null;

    const totalTargets = coverage.goals.length + coverage.questions.length + coverage.bridges.length;
    return {
        uncoveredGoals: coverage.uncoveredGoals,
        uncoveredQuestions: coverage.uncoveredQuestions,
        uncoveredBridges: coverage.uncoveredBridges,
        totalGaps: coverage.uncoveredGoals.length + coverage.uncoveredQuestions.length + coverage.uncoveredBridges.length,
        totalTargets,
    };
}

/**
 * Get terminal findings — elite nodes at or above the configured maximum
 * generation. These nodes cannot produce further synthesis children and
 * represent the system's highest-confidence, most-refined discoveries.
 *
 * @returns Array of terminal findings sorted by confidence descending
 */
export async function getTerminalFindings(): Promise<TerminalFinding[]> {
    const maxGen = appConfig.elitePool.maxGeneration;

    const rows = await query(`
        SELECT n.id, n.content, n.domain, n.generation, en.confidence, en.promoted_at
        FROM nodes n
        JOIN elite_nodes en ON en.node_id = n.id
        WHERE n.node_type = 'elite_verification'
          AND n.generation >= $1
          AND n.archived = 0
        ORDER BY en.confidence DESC
    `, [maxGen]) as any[];

    const findings: TerminalFinding[] = [];
    for (const row of rows) {
        const mappings = await query(`
            SELECT manifest_target_type, manifest_target_text
            FROM elite_manifest_mappings
            WHERE node_id = $1
        `, [row.id]) as any[];

        findings.push({
            nodeId: row.id,
            content: row.content,
            domain: row.domain,
            generation: row.generation,
            confidence: row.confidence,
            manifestTargets: mappings.map((m: any) => ({ type: m.manifest_target_type, text: m.manifest_target_text })),
            promotedAt: row.promoted_at,
        });
    }

    return findings;
}
