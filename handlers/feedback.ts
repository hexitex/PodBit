/**
 * Feedback handlers - rate, stats, unrated
 *
 * Provides human/agent feedback on nodes with weight adjustments.
 * Weight changes: useful (+0.2), not useful (-0.1), harmful (-0.3)
 * Weight floor: 0.1 (nodes never go below this)
 */

import { query, queryOne, logDecision } from '../core.js';
import { config as appConfig } from '../config.js';
import { invalidateKnowledgeCache } from './knowledge.js';
import type { FeedbackRating, FeedbackSource, NodeFeedback, FeedbackStats, } from '../core/types.js';

/**
 * Get weight adjustments from config.
 * Falls back to defaults if config not available.
 */
function getWeightAdjustments(): Record<FeedbackRating, number> {
    return {
        1: appConfig.feedback?.usefulWeight ?? 0.2,
        0: appConfig.feedback?.notUsefulWeight ?? -0.1,
        [-1]: appConfig.feedback?.harmfulWeight ?? -0.3,
    } as Record<FeedbackRating, number>;
}

/** Minimum weight a node can have after feedback; prevents nodes from being driven to zero. */
function getWeightFloor(): number {
    return appConfig.engine?.weightFloor ?? 0.05;
}

/**
 * Dispatch feedback actions: rate, stats, unrated.
 *
 * @param params - Object with `action` (required) plus action-specific fields.
 * @returns Action-specific result, or `{ error }` for unknown actions.
 */
async function handleFeedback(params: Record<string, any>) {
    const { action } = params;

    switch (action) {
        case 'rate':
            return handleRate(params);
        case 'stats':
            return handleStats(params);
        case 'unrated':
            return handleUnrated(params);
        default:
            return { error: `Unknown action: ${action}. Use 'rate', 'stats', or 'unrated'.` };
    }
}

/**
 * Record feedback on a node and adjust its weight accordingly.
 *
 * Weight adjustments are configurable: useful (+0.2), not useful (-0.1),
 * harmful (halves weight for human/agent, -0.3 for auto). Nodes rated
 * as "possible" breakthroughs by non-auto sources are auto-demoted to synthesis.
 *
 * @param params - Object with `nodeId` (required), `rating` (1|0|-1, required),
 *   optional `source` ('human'|'agent'|'auto'), `contributor`, `note`, `context`.
 * @returns Feedback record with weight change details, or `{ error }`.
 */
async function handleRate(params: Record<string, any>) {
    const { nodeId, rating, source = 'human', contributor, note, context } = params;

    // Validate required params
    if (!nodeId) {
        return { error: 'nodeId is required' };
    }
    if (rating === undefined || rating === null) {
        return { error: 'rating is required (1=useful, 0=not useful, -1=harmful)' };
    }

    // Validate rating value
    const numRating = parseInt(rating, 10);
    if (![1, 0, -1].includes(numRating)) {
        return { error: 'rating must be 1 (useful), 0 (not useful), or -1 (harmful)' };
    }

    // Validate source
    const validSources: FeedbackSource[] = ['human', 'agent', 'auto'];
    if (!validSources.includes(source)) {
        return { error: `source must be one of: ${validSources.join(', ')}` };
    }

    // Get the node
    const node = await queryOne(
        'SELECT id, content, weight, domain, node_type FROM nodes WHERE id = $1 AND archived = FALSE',
        [nodeId]
    );
    if (!node) {
        return { error: `Node ${nodeId} not found or archived` };
    }

    const weightBefore = node.weight;

    // Calculate new weight with floor
    let weightAfter: number;
    if (numRating === -1 && source !== 'auto') {
        // Harmful (human/agent): halve the weight — proportional penalty for high-weight nodes
        weightAfter = Math.max(getWeightFloor(), weightBefore / 2);
    } else {
        const adjustment = getWeightAdjustments()[numRating as FeedbackRating];
        weightAfter = Math.max(getWeightFloor(), weightBefore + adjustment);
    }

    // Serialize context if provided
    const contextJson = context ? JSON.stringify(context) : null;

    // Insert feedback record
    const feedbackResult = await query(`
        INSERT INTO node_feedback (node_id, rating, source, contributor, note, context, weight_before, weight_after)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, created_at
    `, [nodeId, numRating, source, contributor || null, note || null, contextJson, weightBefore, weightAfter]);

    const feedbackId = feedbackResult[0]?.id;
    const createdAt = feedbackResult[0]?.created_at;

    // Update node with latest feedback and new weight
    await query(`
        UPDATE nodes
        SET weight = $1,
            feedback_rating = $2,
            feedback_source = $3,
            feedback_at = $4,
            feedback_note = $5,
            updated_at = datetime('now')
        WHERE id = $6
    `, [weightAfter, numRating, source, createdAt, note || null, nodeId]);

    // Log the decision for audit trail
    await logDecision(
        'node', nodeId, 'weight',
        String(weightBefore), String(weightAfter),
        source, contributor || 'feedback',
        `Feedback: ${numRating === 1 ? 'useful' : numRating === 0 ? 'not useful' : 'harmful'}${note ? ` - ${note}` : ''}`
    );

    const ratingLabel = numRating === 1 ? 'useful' : numRating === 0 ? 'not useful' : 'harmful';

    // Auto-demote "possible" nodes back to synthesis on human/agent feedback.
    // If it were a real breakthrough, the reviewer would call promote() instead of rate().
    // Feedback = reviewed but not promoted = rejoin the active population.
    // Skip demotion for auto-rating (autorating-inline) — it rates every new node,
    // which would immediately demote all possible nodes before anyone can review them.
    let demoted = false;
    if (node.node_type === 'possible' && source !== 'auto') {
        await query(`UPDATE nodes SET node_type = 'synthesis' WHERE id = $1`, [nodeId]);
        await logDecision(
            'node', nodeId, 'node_type',
            'possible', 'synthesis',
            source, contributor || 'feedback',
            `Auto-demoted from "possible" after feedback: ${ratingLabel}`
        );
        if (node.domain) {
            invalidateKnowledgeCache(node.domain);
        }
        demoted = true;
        console.error(`[feedback] Auto-demoted ${nodeId.slice(0, 8)} from "possible" to synthesis after ${ratingLabel} feedback`);
    }

    return {
        success: true,
        feedbackId,
        nodeId,
        rating: numRating,
        ratingLabel,
        source,
        contributor,
        weightBefore,
        weightAfter,
        weightChange: Math.round((weightAfter - weightBefore) * 1000) / 1000,
        createdAt,
        ...(demoted ? { demoted: true, previousType: 'possible', newType: 'synthesis' } : {}),
    };
}

/**
 * Get aggregated feedback statistics: totals by rating/source, recent entries, coverage.
 *
 * @param params - Object with optional `domain`, `days` (default 30), `limit` (default 10).
 * @returns FeedbackStats with breakdowns by rating, source, recent entries, and avg weight change.
 */
async function handleStats(params: Record<string, any>) {
    const { domain, days = 30, limit = 10 } = params;

    // Build WHERE clause
    let whereClause = '1=1';
    const sqlParams: any[] = [];
    let paramIndex = 1;

    if (domain) {
        whereClause += ` AND n.domain = $${paramIndex++}`;
        sqlParams.push(domain);
    }

    // Total feedback count
    const totalResult = await queryOne(`
        SELECT COUNT(*) as total
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${whereClause}
    `, sqlParams);
    const totalFeedback = parseInt(totalResult?.total || 0, 10);

    // By rating
    const byRatingResult = await query(`
        SELECT nf.rating, COUNT(*) as count
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${whereClause}
        GROUP BY nf.rating
    `, sqlParams);

    const byRating = {
        useful: 0,
        notUseful: 0,
        harmful: 0,
    };
    for (const row of byRatingResult) {
        if (row.rating === 1) byRating.useful = parseInt(row.count, 10);
        else if (row.rating === 0) byRating.notUseful = parseInt(row.count, 10);
        else if (row.rating === -1) byRating.harmful = parseInt(row.count, 10);
    }

    // By source
    const bySourceResult = await query(`
        SELECT nf.source, COUNT(*) as count
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${whereClause}
        GROUP BY nf.source
    `, sqlParams);

    const bySource = {
        human: 0,
        agent: 0,
        auto: 0,
    };
    for (const row of bySourceResult) {
        if (row.source === 'human') bySource.human = parseInt(row.count, 10);
        else if (row.source === 'agent') bySource.agent = parseInt(row.count, 10);
        else if (row.source === 'auto') bySource.auto = parseInt(row.count, 10);
    }

    // Recent feedback
    const recentParams = [...sqlParams];
    let recentWhere = whereClause;
    if (days) {
        recentWhere += ` AND nf.created_at >= datetime('now', '-${parseInt(days, 10)} days')`;
    }
    recentParams.push(parseInt(limit, 10));

    const recentResult = await query(`
        SELECT nf.id, nf.node_id, nf.rating, nf.source, nf.contributor, nf.note,
               nf.weight_before, nf.weight_after, nf.created_at,
               n.content, n.domain, n.node_type
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${recentWhere}
        ORDER BY nf.created_at DESC
        LIMIT $${recentParams.length}
    `, recentParams);

    const recentFeedback = recentResult.map(r => ({
        id: r.id,
        nodeId: r.node_id,
        rating: r.rating,
        ratingLabel: r.rating === 1 ? 'useful' : r.rating === 0 ? 'not useful' : 'harmful',
        source: r.source,
        contributor: r.contributor,
        note: r.note,
        weightBefore: r.weight_before,
        weightAfter: r.weight_after,
        weightChange: r.weight_after - r.weight_before,
        createdAt: r.created_at,
        node: {
            content: r.content?.slice(0, 100),
            domain: r.domain,
            type: r.node_type,
        },
    }));

    // Nodes covered (distinct nodes with feedback)
    const coveredResult = await queryOne(`
        SELECT COUNT(DISTINCT nf.node_id) as covered
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${whereClause}
    `, sqlParams);
    const nodesCovered = parseInt(coveredResult?.covered || 0, 10);

    // Average weight change
    const avgChangeResult = await queryOne(`
        SELECT AVG(nf.weight_after - nf.weight_before) as avg_change
        FROM node_feedback nf
        JOIN nodes n ON n.id = nf.node_id
        WHERE ${whereClause} AND nf.weight_before IS NOT NULL AND nf.weight_after IS NOT NULL
    `, sqlParams);
    const avgWeightChange = avgChangeResult?.avg_change ? Math.round(avgChangeResult.avg_change * 1000) / 1000 : 0;

    return {
        totalFeedback,
        byRating,
        bySource,
        recentFeedback,
        nodesCovered,
        avgWeightChange,
        domain: domain || 'all',
        days,
    } as FeedbackStats;
}

/**
 * Get nodes that haven't received any feedback, with optional filters.
 *
 * @param params - Object with optional `domain`, `nodeType`, `limit` (default 20),
 *   `minWeight`, `maxWeight`, `orderBy` ('weight'|'recent'|'oldest'|'salience').
 * @returns Paginated list of unrated nodes with filter metadata.
 */
async function handleUnrated(params: Record<string, any>) {
    const { domain, nodeType, limit = 20, minWeight, maxWeight, orderBy = 'weight' } = params;

    // Build WHERE clause
    let whereClause = 'WHERE n.archived = FALSE AND n.feedback_rating IS NULL';
    const sqlParams: any[] = [];
    let paramIndex = 1;

    if (domain) {
        whereClause += ` AND n.domain = $${paramIndex++}`;
        sqlParams.push(domain);
    }
    if (nodeType) {
        whereClause += ` AND n.node_type = $${paramIndex++}`;
        sqlParams.push(nodeType);
    }
    if (minWeight !== undefined) {
        whereClause += ` AND n.weight >= $${paramIndex++}`;
        sqlParams.push(parseFloat(minWeight));
    }
    if (maxWeight !== undefined) {
        whereClause += ` AND n.weight <= $${paramIndex++}`;
        sqlParams.push(parseFloat(maxWeight));
    }

    // Order mapping
    const orderMap: Record<string, string> = {
        weight: 'n.weight DESC',
        recent: 'n.created_at DESC',
        oldest: 'n.created_at ASC',
        salience: 'n.salience DESC',
    };
    const orderClause = orderMap[orderBy] || 'n.weight DESC';

    // Total count
    const countResult = await queryOne(`
        SELECT COUNT(*) as total FROM nodes n ${whereClause}
    `, sqlParams);
    const total = parseInt(countResult?.total || 0, 10);

    // Get unrated nodes
    sqlParams.push(parseInt(limit, 10));
    const nodes = await query(`
        SELECT n.id, n.content, n.node_type, n.domain, n.weight, n.salience,
               n.specificity, n.contributor, n.created_at
        FROM nodes n
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${paramIndex}
    `, sqlParams);

    return {
        total,
        count: nodes.length,
        limit: parseInt(limit, 10),
        nodes: nodes.map(n => ({
            id: n.id,
            content: n.content,
            type: n.node_type,
            domain: n.domain,
            weight: n.weight,
            salience: n.salience,
            specificity: n.specificity,
            contributor: n.contributor,
            createdAt: n.created_at,
        })),
        filters: {
            domain: domain || null,
            nodeType: nodeType || null,
            minWeight: minWeight || null,
            maxWeight: maxWeight || null,
            orderBy,
        },
    };
}

/**
 * Get the full feedback history for a specific node, ordered newest-first.
 *
 * @param nodeId - UUID of the node to retrieve feedback for.
 * @returns Array of NodeFeedback records with parsed context JSON.
 */
async function getNodeFeedback(nodeId: string): Promise<NodeFeedback[]> {
    const feedback = await query(`
        SELECT id, node_id, rating, source, contributor, note, context,
               weight_before, weight_after, created_at
        FROM node_feedback
        WHERE node_id = $1
        ORDER BY created_at DESC
    `, [nodeId]);

    return feedback.map(f => ({
        id: f.id,
        node_id: f.node_id,
        rating: f.rating as FeedbackRating,
        source: f.source as FeedbackSource,
        contributor: f.contributor,
        note: f.note,
        context: f.context ? JSON.parse(f.context) : null,
        weight_before: f.weight_before,
        weight_after: f.weight_after,
        created_at: f.created_at,
    }));
}

export {
    handleFeedback,
    handleRate,
    handleStats,
    handleUnrated,
    getNodeFeedback,
    getWeightAdjustments,
    getWeightFloor,
};
