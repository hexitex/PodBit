/**
 * Elite Verification Pool — Query & Statistics
 *
 * Provides read-only access to the elite pool: filtered node listing with
 * pagination and aggregate statistics including generation/domain distributions,
 * bridging attempt counts, recent promotion activity, and manifest coverage.
 */

import { query, queryOne } from '../db.js';
import { config as appConfig } from '../config.js';
import { getManifestCoverage } from './elite-pool-manifest.js';
import type { ElitePoolStats, EliteQueryOptions, ManifestCoverage } from './elite-pool-types.js';

// =============================================================================
// ELITE POOL QUERIES
// =============================================================================

/**
 * Get elite nodes with optional filtering by domain, generation range,
 * and manifest target type. Results are paginated and sorted by confidence
 * descending, then generation ascending.
 *
 * @param options - Filtering and pagination options
 * @returns Array of elite node records with joined metadata from `elite_nodes`
 */
export async function getEliteNodes(options: EliteQueryOptions = {}): Promise<any[]> {
    const { domain, minGeneration, maxGeneration, manifestTargetType, limit = 50, offset = 0 } = options;

    let sql = `
        SELECT n.id, n.content, n.domain, n.generation, n.weight, n.salience, n.created_at,
               en.confidence, en.verification_type, en.promoted_at, en.provenance_chain
        FROM nodes n
        JOIN elite_nodes en ON en.node_id = n.id
        WHERE n.node_type = 'elite_verification' AND n.archived = 0
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (domain) { sql += ` AND n.domain = $${paramIdx++}`; params.push(domain); }
    if (minGeneration !== undefined) { sql += ` AND n.generation >= $${paramIdx++}`; params.push(minGeneration); }
    if (maxGeneration !== undefined) { sql += ` AND n.generation <= $${paramIdx++}`; params.push(maxGeneration); }
    if (manifestTargetType) {
        sql += ` AND EXISTS (
            SELECT 1 FROM elite_manifest_mappings emm
            WHERE emm.node_id = n.id AND emm.manifest_target_type = $${paramIdx++}
        )`;
        params.push(manifestTargetType);
    }

    sql += ` ORDER BY en.confidence DESC, n.generation ASC`;
    sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    return query(sql, params) as any;
}

/**
 * Get aggregate elite pool statistics including total counts, generation
 * and domain distributions, bridging attempt outcomes, recent promotions
 * (last 7 days), terminal findings count, and manifest coverage.
 *
 * Manifest coverage retrieval is non-fatal — if it fails, `manifestCoverage`
 * is returned as null.
 *
 * @returns Complete elite pool statistics object
 */
export async function getElitePoolStats(): Promise<ElitePoolStats> {
    const totalRow = await queryOne(`
        SELECT COUNT(*) as count FROM nodes
        WHERE node_type = 'elite_verification' AND archived = 0
    `) as any;

    const genRows = await query(`
        SELECT generation, COUNT(*) as count FROM nodes
        WHERE node_type = 'elite_verification' AND archived = 0
        GROUP BY generation ORDER BY generation
    `) as any[];
    const generationDistribution: Record<number, number> = {};
    for (const row of genRows) generationDistribution[row.generation] = row.count;

    const domainRows = await query(`
        SELECT domain, COUNT(*) as count FROM nodes
        WHERE node_type = 'elite_verification' AND archived = 0
        GROUP BY domain ORDER BY count DESC
    `) as any[];
    const domainDistribution: Record<string, number> = {};
    for (const row of domainRows) domainDistribution[row.domain || 'unknown'] = row.count;

    const bridgingRow = await queryOne(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN outcome = 'promoted' THEN 1 ELSE 0 END) as promoted,
            SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
            SUM(CASE WHEN outcome = 'duplicate' THEN 1 ELSE 0 END) as duplicate
        FROM elite_bridging_log
    `) as any;

    const recentRow = await queryOne(`
        SELECT COUNT(*) as count FROM elite_nodes
        WHERE promoted_at >= datetime('now', '-7 days')
    `) as any;

    const maxGen = appConfig.elitePool.maxGeneration;
    const terminalRow = await queryOne(`
        SELECT COUNT(*) as count FROM nodes
        WHERE node_type = 'elite_verification' AND generation >= $1 AND archived = 0
    `, [maxGen]) as any;

    let manifestCoverage: ManifestCoverage | null = null;
    try { manifestCoverage = await getManifestCoverage(); } catch { /* non-fatal */ }

    return {
        totalEliteNodes: totalRow?.count || 0,
        generationDistribution,
        domainDistribution,
        manifestCoverage,
        bridgingAttempts: {
            total: bridgingRow?.total || 0,
            promoted: bridgingRow?.promoted || 0,
            rejected: bridgingRow?.rejected || 0,
            duplicate: bridgingRow?.duplicate || 0,
        },
        recentPromotions: recentRow?.count || 0,
        terminalFindings: terminalRow?.count || 0,
    };
}
