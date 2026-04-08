/**
 * Elite Pool MCP Handler — action-based dispatch.
 *
 * Actions:
 *   stats      — elite pool statistics (node count, generation distribution, coverage)
 *   coverage   — manifest coverage report
 *   gaps       — uncovered manifest targets
 *   candidates — elite bridging candidates (prioritized pairs)
 *   nodes      — query elite nodes with filters
 *   terminals  — terminal findings (nodes at max generation)
 *   rescan     — trigger backfill scan for unprocessed verified nodes
 *   reset_bridging — clear failed bridging attempts so pairs can be retried
 */

/**
 * Dispatch elite-pool MCP actions.
 *
 * @param params - Action parameters. Must include `action` string plus action-specific fields.
 * @returns Action-specific result object, or `{ error }` for unknown actions.
 */
export async function handleElite(params: Record<string, any>) {
    const { action } = params;

    switch (action) {
        case 'stats':
            return handleStats();
        case 'coverage':
            return handleCoverage();
        case 'gaps':
            return handleGaps();
        case 'candidates':
            return handleCandidates(params);
        case 'nodes':
            return handleNodes(params);
        case 'terminals':
            return handleTerminals();
        case 'rescan':
            return handleRescan(params);
        case 'reset_bridging':
            return handleResetBridging(params);
        case 'demote':
            return handleDemoteElite(params);
        default:
            return { error: `Unknown action: ${action}. Valid actions: stats, coverage, gaps, candidates, nodes, terminals, rescan, reset_bridging, demote.` };
    }
}

/** Get elite pool statistics (node count, generation distribution, coverage). */
async function handleStats() {
    const { getElitePoolStats } = await import('../core/elite-pool.js');
    return getElitePoolStats();
}

/** Get manifest coverage report for elite nodes. */
async function handleCoverage() {
    const { getManifestCoverage } = await import('../core/elite-pool.js');
    const coverage = await getManifestCoverage();
    if (!coverage) return { error: 'No project manifest found. Create a manifest first via project interview.' };
    return coverage;
}

/** Get uncovered manifest targets (gaps in elite pool coverage). */
async function handleGaps() {
    const { getManifestGaps } = await import('../core/elite-pool.js');
    const gaps = await getManifestGaps();
    if (!gaps) return { error: 'No project manifest found. Create a manifest first via project interview.' };
    return gaps;
}

/**
 * Get prioritized elite bridging candidate pairs.
 * @param params - Object with optional `limit` (default 10).
 */
async function handleCandidates(params: Record<string, any>) {
    const { getEliteBridgingCandidates } = await import('../core/elite-pool.js');
    const limit = params.limit ?? 10;
    const candidates = await getEliteBridgingCandidates(limit);
    return { count: candidates.length, candidates };
}

/**
 * Query elite nodes with optional domain, generation, and limit filters.
 * @param params - Object with optional `domain`, `minGeneration`, `maxGeneration`, `limit`.
 */
async function handleNodes(params: Record<string, any>) {
    const { getEliteNodes } = await import('../core/elite-pool.js');
    const options: Record<string, any> = {};
    if (params.domain) options.domain = params.domain;
    if (params.minGeneration !== undefined) options.minGeneration = params.minGeneration;
    if (params.maxGeneration !== undefined) options.maxGeneration = params.maxGeneration;
    if (params.limit) options.limit = params.limit;
    const nodes = await getEliteNodes(options);
    return { count: nodes.length, nodes };
}

/** Get terminal findings (elite nodes at maximum generation depth). */
async function handleTerminals() {
    const { getTerminalFindings } = await import('../core/elite-pool.js');
    const findings = await getTerminalFindings();
    return { count: findings.length, findings };
}

/**
 * Trigger backfill scan for unprocessed verified nodes.
 * @param params - Object with optional `limit` (default 50).
 */
async function handleRescan(params: Record<string, any>) {
    const { scanExistingVerified } = await import('../core/elite-pool.js');
    const limit = params.limit ?? 50;
    const result = await scanExistingVerified(limit);
    return result;
}

/**
 * Demote a node from elite verification status.
 * @param params - Object with `nodeId` (required), optional `reason` and `contributor`.
 */
async function handleDemoteElite(params: Record<string, any>) {
    if (!params.nodeId) return { error: 'nodeId is required' };
    const { demoteFromElite } = await import('../core/elite-pool.js');
    return demoteFromElite(params.nodeId, params.reason || 'Demoted via MCP', params.contributor || 'system');
}

/**
 * Clear failed bridging attempts from the log so pairs can be retried.
 * @param params - Object with optional `outcome` (default 'rejected').
 * @returns Count of deleted entries and remaining log size.
 */
async function handleResetBridging(params: Record<string, any>) {
    const { query } = await import('../db.js');
    const outcome = params.outcome || 'rejected'; // only clear rejected by default
    const result = await query(
        `DELETE FROM elite_bridging_log WHERE outcome = $1`,
        [outcome]
    );
    const remaining = await query(`SELECT COUNT(*) as c FROM elite_bridging_log`) as any[];
    return {
        deleted: (result as any)?.changes ?? 'unknown',
        outcome,
        remaining: remaining[0]?.c ?? 0,
        message: `Cleared ${outcome} bridging attempts. Pairs can now be retried.`,
    };
}
