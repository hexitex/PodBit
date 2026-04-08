/**
 * Governance handlers: stats, pending requests, synthesis discoveries, partitions, and context engine.
 */

import { query, queryOne, checkPartitionHealth } from '../core.js';
import { countFilter, withinDays } from '../db/sql.js';
import { config as appConfig } from '../config.js';
import { getSecurityKey } from '../core/security.js';
import { exportPartition, importPartition, importTransient, approveTransient, departTransient, getVisitHistory } from '../routes/partitions.js';
import {
    prepare as contextPrepare,
    update as contextUpdate,
    getSession,
    listSessions,
    deleteSession,
    getBudgets,
} from '../context-engine.js';

// =============================================================================
// DOMAIN CONCENTRATION HELPER
// =============================================================================

/**
 * Compute domain concentration for recent non-raw nodes.
 *
 * Returns the top 10 domains by node count with their ratios relative to
 * total recent activity, plus configured warning/throttle thresholds.
 *
 * @param days - Lookback window in days.
 * @returns Top domains with counts, ratios, and threshold config.
 */
async function getDomainConcentration(days: number) {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const rows = await query(
        `SELECT domain, COUNT(*) as cnt
         FROM nodes
         WHERE archived = FALSE AND node_type != 'raw' AND domain IS NOT NULL AND domain != '' AND created_at >= $1
         GROUP BY domain
         ORDER BY cnt DESC
         LIMIT 10`,
        [cutoff]
    );
    const total = rows.reduce((sum: number, r: any) => sum + parseInt(r.cnt, 10), 0);
    return {
        topDomains: rows.map((r: any) => ({
            domain: r.domain,
            count: parseInt(r.cnt, 10),
            ratio: total > 0 ? parseInt(r.cnt, 10) / total : 0,
        })),
        totalRecentNodes: total,
        thresholds: {
            warning: appConfig.intakeDefense.concentrationThreshold,
            throttle: appConfig.intakeDefense.throttleThreshold,
        },
    };
}

// =============================================================================
// STATS HANDLER
// =============================================================================

/**
 * Get comprehensive graph and synthesis statistics.
 *
 * Returns node counts by type/trajectory, synthesis cycle metrics,
 * feedback stats, partition health, domain concentration, and lifecycle metabolism.
 *
 * @param params - Object with optional `domain` and `days` (default 7).
 * @returns Multi-section stats object covering nodes, cycles, feedback, and health.
 */
export async function handleStats(params: Record<string, any>) {
    const { domain, days = 7 } = params;

    const statsParams = domain ? [days, domain] : [days];

    // Node counts (uses countFilter helper for cross-dialect support)
    const nodeCounts = await queryOne(`
        SELECT
            COUNT(*) as total,
            ${countFilter("node_type = 'seed'")} as seeds,
            ${countFilter("node_type = 'breakthrough'")} as breakthroughs,
            ${countFilter("trajectory = 'knowledge'")} as knowledge,
            ${countFilter("trajectory = 'abstraction'")} as abstraction,
            AVG(weight) as avg_weight,
            AVG(salience) as avg_salience,
            AVG(specificity) as avg_specificity
        FROM nodes
        WHERE archived = FALSE AND node_type != 'raw'
            ${domain ? 'AND domain = $1' : ''}
    `, domain ? [domain] : []);

    // Synthesis cycle stats — LEFT JOIN instead of correlated EXISTS per row
    const cycleStats = await queryOne(`
        SELECT
            COUNT(*) as total_cycles,
            SUM(CASE WHEN dc.created_child = 1 AND n.id IS NOT NULL THEN 1 ELSE 0 END) as children_created,
            SUM(CASE WHEN dc.child_trajectory = 'knowledge' AND n.id IS NOT NULL THEN 1 ELSE 0 END) as knowledge_children,
            SUM(CASE WHEN dc.child_trajectory = 'abstraction' AND n.id IS NOT NULL THEN 1 ELSE 0 END) as abstraction_children,
            AVG(dc.resonance_score) as avg_resonance
        FROM dream_cycles dc
        LEFT JOIN nodes n ON n.id = dc.child_node_id AND n.archived = 0
        WHERE ${withinDays('dc.started_at', '$1')}
            ${domain ? 'AND dc.domain = $2' : ''}
    `, statsParams);

    // Knowledge ratio
    const knowledgeRatio = cycleStats.children_created > 0
        ? cycleStats.knowledge_children / cycleStats.children_created
        : 0;

    // Feedback stats (uses try/catch in case table doesn't exist yet)
    let feedbackStats = {
        total: 0,
        useful: 0,
        notUseful: 0,
        harmful: 0,
        nodesCovered: 0,
        avgWeightChange: 0,
    };

    try {
        const feedbackCounts = await queryOne(`
            SELECT
                COUNT(*) as total,
                ${countFilter('nf.rating = 1')} as useful,
                ${countFilter('nf.rating = 0')} as not_useful,
                ${countFilter('nf.rating = -1')} as harmful,
                COUNT(DISTINCT nf.node_id) as nodes_covered,
                AVG(nf.weight_after - nf.weight_before) as avg_weight_change
            FROM node_feedback nf
            JOIN nodes n ON n.id = nf.node_id
            WHERE ${withinDays('nf.created_at', '$1')}
                ${domain ? 'AND n.domain = $2' : ''}
        `, statsParams);

        feedbackStats = {
            total: parseInt(feedbackCounts.total, 10) || 0,
            useful: parseInt(feedbackCounts.useful, 10) || 0,
            notUseful: parseInt(feedbackCounts.not_useful, 10) || 0,
            harmful: parseInt(feedbackCounts.harmful, 10) || 0,
            nodesCovered: parseInt(feedbackCounts.nodes_covered, 10) || 0,
            avgWeightChange: parseFloat(feedbackCounts.avg_weight_change) || 0,
        };
    } catch {
        // node_feedback table may not exist yet
    }

    // Learned technical terms from keyword extraction
    let learnedTermsStats = { total: 0, byDomain: {} as Record<string, number> };
    try {
        const { getLearnedTermsCount } = await import('../core/specificity.js');
        learnedTermsStats = getLearnedTermsCount();
    } catch { /* non-fatal */ }

    return {
        domain: domain || 'all',
        periodDays: days,
        nodes: {
            total: parseInt(nodeCounts.total, 10),
            seeds: parseInt(nodeCounts.seeds, 10),
            breakthroughs: parseInt(nodeCounts.breakthroughs, 10),
            knowledge: parseInt(nodeCounts.knowledge, 10),
            abstraction: parseInt(nodeCounts.abstraction, 10),
            avgWeight: parseFloat(nodeCounts.avg_weight) || 0,
            avgSalience: parseFloat(nodeCounts.avg_salience) || 0,
            avgSpecificity: parseFloat(nodeCounts.avg_specificity) || 0,
        },
        synthesisCycles: {
            total: parseInt(cycleStats.total_cycles, 10),
            childrenCreated: parseInt(cycleStats.children_created, 10),
            knowledgeChildren: parseInt(cycleStats.knowledge_children, 10),
            abstractionChildren: parseInt(cycleStats.abstraction_children, 10),
            avgResonance: parseFloat(cycleStats.avg_resonance) || 0,
            knowledgeRatio: knowledgeRatio,
        },
        feedback: feedbackStats,
        learnedTerms: learnedTermsStats,
        partitionHealth: await checkPartitionHealth(),
        domainConcentration: await getDomainConcentration(days),
        metabolism: await getLifecycleMetabolism(),
    };
}

/** Fetch lifecycle metabolism data; returns null if the lifecycle module is unavailable. */
async function getLifecycleMetabolism() {
    try {
        const { getMetabolism } = await import('../core/lifecycle.js');
        return await getMetabolism();
    } catch {
        return null; // lifecycle module may not be available yet
    }
}

// =============================================================================
// PENDING / COMPLETE HANDLERS
// =============================================================================

/**
 * Get pending requests queued from the GUI Chat.
 *
 * @returns Object with `count` and `requests` array (id, type, params, queuedAt).
 */
export async function handlePending() {
    const { getPendingRequests } = await import('../core.js');
    const pending = await getPendingRequests();
    return {
        count: pending.length,
        requests: pending.map(r => ({
            id: r.id,
            type: r.type,
            params: r.params,
            queuedAt: r.queuedAt,
        })),
    };
}

/**
 * Mark a pending request as completed.
 *
 * @param params - Object with `requestId` (required) and optional `result`.
 * @returns `{ success, requestId }`.
 */
export async function handleComplete(params: Record<string, any>) {
    const { requestId, result } = params;
    const { completeRequest } = await import('../core.js');
    const success = await completeRequest(requestId, result);
    return { success, requestId };
}

// =============================================================================
// SYNTHESIS ENGINE HANDLER — bridges MCP to API server's synthesis engine
// =============================================================================

/** Build the API server base URL from config. */
function getApiBaseUrl() {
    return `http://${appConfig.server.host}:${appConfig.server.port}`;
}

/** Perform a fetch with the internal security key header attached. */
async function securedFetch(url: string, init?: RequestInit): Promise<Response> {
    const key = await getSecurityKey();
    const headers = new Headers(init?.headers);
    headers.set('x-podbit-key', key);
    if (!headers.has('content-type') && init?.method && init.method !== 'GET') {
        headers.set('content-type', 'application/json');
    }
    return fetch(url, { ...init, headers });
}

/**
 * Bridge MCP calls to the API server's synthesis engine and autonomous cycle endpoints.
 *
 * Actions: status, discoveries, clear, start, stop, history, cycle_start, cycle_stop, cycle_status.
 *
 * @param params - Object with `action` (required) plus action-specific fields
 *   (`nodeAId`/`nodeBId` for clear, `mode`/`domain`/`maxCycles` for start,
 *   `cycleType` for cycle_start/cycle_stop, `limit` for history).
 * @returns Proxied API server response, or `{ error }`.
 */
export async function handleSynthesisEngine(params: Record<string, any>) {
    const { action, nodeAId, nodeBId, mode, domain, maxCycles } = params;
    const base = getApiBaseUrl();

    switch (action) {
        case 'status': {
            const res = await securedFetch(`${base}/api/synthesis/status`);
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'discoveries': {
            const res = await securedFetch(`${base}/api/synthesis/discoveries`);
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            const data = await res.json();
            return {
                count: data.discoveries?.length || 0,
                discoveries: data.discoveries || [],
            };
        }

        case 'clear': {
            if (!nodeAId || !nodeBId) return { error: 'nodeAId and nodeBId are required' };
            const res = await securedFetch(`${base}/api/synthesis/discoveries/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeAId, nodeBId }),
            });
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'start': {
            const body: Record<string, any> = {};
            if (mode) body.mode = mode;
            if (domain) body.domain = domain;
            if (maxCycles) body.maxCycles = maxCycles;
            const res = await securedFetch(`${base}/api/synthesis/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'stop': {
            const res = await securedFetch(`${base}/api/synthesis/stop`, { method: 'POST' });
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'history': {
            const limit = params.limit || 20;
            const res = await securedFetch(`${base}/api/synthesis/history?limit=${limit}`);
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        // =====================================================================
        // AUTONOMOUS CYCLE MANAGEMENT — start/stop/status for individual cycles
        // =====================================================================

        case 'cycle_start': {
            const cycleType = params.cycleType;
            const validTypes = ['synthesis', 'validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing', 'ground_rules'];
            if (!cycleType || !validTypes.includes(cycleType)) {
                return { error: `cycleType is required. Valid types: ${validTypes.join(', ')}` };
            }
            const res = await securedFetch(`${base}/api/cycles/${cycleType}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'cycle_stop': {
            const cycleType = params.cycleType;
            const validTypes = ['synthesis', 'validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing', 'ground_rules'];
            if (!cycleType || !validTypes.includes(cycleType)) {
                return { error: `cycleType is required. Valid types: ${validTypes.join(', ')}` };
            }
            const res = await securedFetch(`${base}/api/cycles/${cycleType}/stop`, { method: 'POST' });
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        case 'cycle_status': {
            const res = await securedFetch(`${base}/api/cycles/status`);
            if (!res.ok) return { error: `API server not responding (${res.status})` };
            return await res.json();
        }

        default:
            return { error: `Unknown action: ${action}. Use status, discoveries, clear, start, stop, history, cycle_start, cycle_stop, or cycle_status.` };
    }
}

// =============================================================================
// PARTITION HANDLER
// =============================================================================

/**
 * Manage domain partitions, domains, bridges, and transient imports.
 *
 * Actions: list, get, create, update, delete, addDomain, removeDomain,
 * renameDomain, listBridges, createBridge, deleteBridge, export, import,
 * importTransient, approveTransient, departTransient, visitHistory.
 *
 * @param params - Object with `action` (required) plus action-specific fields.
 * @returns Action-specific result, or `{ error }`.
 */
export async function handlePartitions(params: Record<string, any>) {
    const { action, id, name, description, domains, domain, targetPartitionId, system, allowed_cycles } = params;

    switch (action) {
        case 'list': {
            const partitions = await query(`
                SELECT dp.id, dp.name, dp.description, dp.created_at,
                       COALESCE(dp.system, 0) as system,
                       COALESCE(dp.transient, 0) as transient,
                       dp.state, dp.source_project, dp.imported_at,
                       dp.allowed_cycles
                FROM domain_partitions dp
                ORDER BY dp.name
            `);
            // Get domains for each partition
            for (const p of partitions) {
                const doms = await query(`
                    SELECT domain FROM partition_domains WHERE partition_id = $1
                `, [p.id]);
                p.domains = doms.map(d => d.domain);
                p.system = p.system === 1;
                try { p.allowed_cycles = p.allowed_cycles ? JSON.parse(p.allowed_cycles) : null; } catch { p.allowed_cycles = null; }
                const isTransient = p.transient === 1;
                p.transient = isTransient;
                if (isTransient) {
                    p.state = p.state || 'active';
                } else {
                    delete p.state;
                    delete p.source_project;
                    delete p.imported_at;
                }
            }
            return { partitions };
        }

        case 'get': {
            if (!id) return { error: 'id is required' };
            const partition = await queryOne(`
                SELECT id, name, description, created_at,
                       COALESCE(system, 0) as system,
                       allowed_cycles
                FROM domain_partitions WHERE id = $1
            `, [id]);
            if (!partition) return { error: 'Partition not found' };
            partition.system = partition.system === 1;
            try { partition.allowed_cycles = partition.allowed_cycles ? JSON.parse(partition.allowed_cycles) : null; } catch { partition.allowed_cycles = null; }
            const doms = await query(`
                SELECT domain, added_at FROM partition_domains WHERE partition_id = $1
            `, [id]);
            return { ...partition, domains: doms.map(d => d.domain) };
        }

        case 'create': {
            if (!id || !name) return { error: 'id and name are required' };
            const isSystem = system ? 1 : 0;
            await query(`
                INSERT INTO domain_partitions (id, name, description, system) VALUES ($1, $2, $3, $4)
            `, [id, name, description || null, isSystem]);
            if (domains && Array.isArray(domains)) {
                for (const d of domains) {
                    await query(`
                        INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
                    `, [id, d]);
                }
            }
            return { success: true, id, name, system: !!isSystem, domains: domains || [] };
        }

        case 'update': {
            if (!id) return { error: 'id is required' };
            const updates = [];
            const updateParams = [];
            let idx = 1;
            if (name !== undefined) { updates.push(`name = $${idx++}`); updateParams.push(name); }
            if (description !== undefined) { updates.push(`description = $${idx++}`); updateParams.push(description); }
            if (system !== undefined) { updates.push(`system = $${idx++}`); updateParams.push(system ? 1 : 0); }
            if (allowed_cycles !== undefined) {
                updates.push(`allowed_cycles = $${idx++}`);
                updateParams.push(allowed_cycles === null ? null : JSON.stringify(allowed_cycles));
            }
            if (updates.length > 0) {
                updateParams.push(id);
                await query(`UPDATE domain_partitions SET ${updates.join(', ')} WHERE id = $${idx}`, updateParams);
                if (allowed_cycles !== undefined) {
                    const { clearCycleExclusionCache } = await import('../core/governance.js');
                    clearCycleExclusionCache();
                }
            }
            return { success: true };
        }

        case 'delete': {
            if (!id) return { error: 'id is required' };
            await query(`DELETE FROM partition_domains WHERE partition_id = $1`, [id]);
            await query(`DELETE FROM domain_partitions WHERE id = $1`, [id]);
            return { success: true };
        }

        case 'addDomain': {
            if (!id || !domain) return { error: 'id and domain are required' };
            await query(`
                INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
            `, [id, domain]);
            return { success: true, partition: id, domain };
        }

        case 'removeDomain': {
            if (!id || !domain) return { error: 'id and domain are required' };
            await query(`
                DELETE FROM partition_domains WHERE partition_id = $1 AND domain = $2
            `, [id, domain]);
            return { success: true };
        }

        case 'listBridges': {
            const bridges = await query(`
                SELECT pb.partition_a, pb.partition_b, pb.created_at,
                       pa.name AS name_a, pb2.name AS name_b
                FROM partition_bridges pb
                JOIN domain_partitions pa ON pa.id = pb.partition_a
                JOIN domain_partitions pb2 ON pb2.id = pb.partition_b
                ORDER BY pb.created_at DESC
            `);
            return { bridges };
        }

        case 'createBridge': {
            if (!id || !targetPartitionId) return { error: 'id and targetPartitionId are required' };
            if (id === targetPartitionId) return { error: 'Cannot bridge a partition to itself' };
            // Guard: system partitions are structurally un-bridgeable
            const partA = await queryOne('SELECT system FROM domain_partitions WHERE id = $1', [id]);
            const partB = await queryOne('SELECT system FROM domain_partitions WHERE id = $1', [targetPartitionId]);
            if (partA?.system === 1 || partB?.system === 1) {
                return { error: 'Cannot bridge to or from a system partition. System partitions synthesize internally only.' };
            }
            // Ensure consistent ordering (smaller id first) to prevent duplicates
            const [a, b] = id < targetPartitionId ? [id, targetPartitionId] : [targetPartitionId, id];
            await query(`
                INSERT INTO partition_bridges (partition_a, partition_b)
                VALUES ($1, $2) ON CONFLICT DO NOTHING
            `, [a, b]);
            return { success: true, bridge: { partition_a: a, partition_b: b } };
        }

        case 'deleteBridge': {
            if (!id || !targetPartitionId) return { error: 'id and targetPartitionId are required' };
            const [a, b] = id < targetPartitionId ? [id, targetPartitionId] : [targetPartitionId, id];
            await query(`
                DELETE FROM partition_bridges WHERE partition_a = $1 AND partition_b = $2
            `, [a, b]);
            return { success: true };
        }

        case 'export': {
            const owner = params.owner;
            if (!id) return { error: 'id is required' };
            if (!owner) return { error: 'owner is required (e.g., "rob", "acme-corp")' };
            const exportData = await exportPartition(id, owner);
            if (!exportData) return { error: `Partition not found: ${id}` };
            return exportData;
        }

        case 'import': {
            const data = params.data;
            if (!data) return { error: 'data is required (the export JSON from a previous export)' };
            try {
                return await importPartition(data, params.overwrite === true);
            } catch (err: any) {
                return { error: err.message };
            }
        }

        case 'renameDomain': {
            const { oldDomain, newDomain } = params;
            if (!oldDomain || !newDomain) return { error: 'oldDomain and newDomain are required' };
            const { renameDomain } = await import('../core/governance.js');
            return await renameDomain(oldDomain, newDomain, params.contributor || 'claude');
        }

        case 'importTransient': {
            const data = params.data;
            if (!data) return { error: 'data is required (the export JSON from a previous export)' };
            try {
                return await importTransient(data);
            } catch (err: any) {
                return { error: err.message };
            }
        }

        case 'approveTransient': {
            if (!id) return { error: 'id is required' };
            return await approveTransient(id, params.bridgeTo);
        }

        case 'departTransient': {
            if (!id) return { error: 'id is required' };
            return await departTransient(id, params.reason);
        }

        case 'visitHistory': {
            if (!id) return { error: 'id is required' };
            return await getVisitHistory(id);
        }

        default:
            return { error: `Unknown action: ${action}. Use list, get, create, update, delete, addDomain, removeDomain, renameDomain, listBridges, createBridge, deleteBridge, export, import, importTransient, approveTransient, departTransient, or visitHistory.` };
    }
}

// =============================================================================
// CONTEXT ENGINE HANDLER
// =============================================================================

/**
 * Context engine handler for per-turn knowledge delivery to smaller LLMs.
 *
 * Actions: prepare (deliver ranked knowledge), update (feedback loop),
 * session/sessions (inspect), delete, budgets, metrics, insights.
 *
 * @param params - Object with `action` (required), `sessionId`, `message`,
 *   `maxNodes`, `budget`, `modelProfile` as needed per action.
 * @returns Action-specific result, or `{ error }`.
 */
export async function handleContext(params: Record<string, any>) {
    const { action, message, sessionId, maxNodes, budget, modelProfile } = params;

    switch (action) {
        case 'prepare': {
            if (!message) return { error: 'message is required for prepare' };
            const context = await contextPrepare(message, sessionId || undefined, {
                maxNodes,
                budget,
                modelProfile,
            });
            return context;
        }

        case 'update': {
            if (!sessionId) return { error: 'sessionId is required for update' };
            if (!message) return { error: 'message (the LLM response) is required for update' };
            const result = await contextUpdate(sessionId, message);
            return result;
        }

        case 'session': {
            if (!sessionId) return { error: 'sessionId is required for session' };
            const session = getSession(sessionId);
            if (!session) return { error: `Session not found: ${sessionId}` };
            return {
                id: session.id,
                createdAt: session.createdAt,
                lastActiveAt: session.lastActiveAt,
                turnCount: session.turnCount,
                topics: session.topics.slice(0, 20),
                domains: session.domains,
                historyLength: session.history.length,
                compressedUpTo: session.compressedUpTo,
                hasCompressedHistory: !!session.compressedHistory,
                lastContext: session.lastContext,
                lastFeedback: session.lastFeedback,
            };
        }

        case 'sessions': {
            return { sessions: listSessions() };
        }

        case 'delete': {
            if (!sessionId) return { error: 'sessionId is required for delete' };
            const deleted = deleteSession(sessionId);
            return { success: deleted, sessionId };
        }

        case 'budgets': {
            return getBudgets();
        }

        case 'metrics': {
            if (!sessionId) return { error: 'sessionId is required for metrics' };
            const session = getSession(sessionId);
            if (!session) return { error: `Session not found: ${sessionId}` };

            const m = session.metrics;
            const avg = (arr: number[]) => arr.length > 0
                ? Math.round((arr.reduce((a: number, b: number) => a + b, 0) / arr.length) * 1000) / 1000
                : null;

            return {
                sessionId: session.id,
                turnCount: session.turnCount,
                avgQualityScore: avg(m.qualityScores),
                avgKnowledgeUtilization: avg(m.knowledgeUtilization),
                avgResponseGrounding: avg(m.responseGrounding),
                avgTopicCoverage: avg(m.topicCoverage),
                avgBudgetEfficiency: avg(m.budgetEfficiency),
                feedbackBoosts: session.lastFeedback?.boosted?.length || 0,
                perTurn: m.qualityScores.map((q: number, i: number) => ({
                    turn: i + 1,
                    quality: q,
                    utilization: m.knowledgeUtilization[i],
                    grounding: m.responseGrounding[i],
                    coverage: m.topicCoverage[i],
                })),
            };
        }

        case 'insights': {
            const insights = await query(
                `SELECT topic, weight, usage_count, domain, last_seen
                 FROM session_insights
                 ORDER BY weight * usage_count DESC
                 LIMIT 20`
            );
            return {
                insights: insights.map((i: any) => ({
                    topic: i.topic,
                    weight: i.weight,
                    usageCount: i.usage_count,
                    domain: i.domain,
                    lastSeen: i.last_seen,
                })),
                count: insights.length,
            };
        }

        default:
            return { error: `Unknown action: ${action}. Use prepare, update, session, sessions, delete, budgets, metrics, or insights.` };
    }
}
