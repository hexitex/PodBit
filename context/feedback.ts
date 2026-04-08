/**
 * @module context/feedback
 *
 * Context engine feedback loop, quality metrics, history compression,
 * and cross-session learning.
 *
 * The feedback loop detects which delivered knowledge nodes appear in the LLM's
 * response (via embedding similarity) and boosts their weight, creating a
 * self-improving selection cycle. Quality metrics track knowledge utilization,
 * response grounding, topic coverage, and budget efficiency per turn.
 * Cross-session learning persists topic weights and node usage to the database
 * using exponential moving averages, so new sessions warm-start with frequently
 * discussed topics.
 */
import { query, queryOne } from '../db.js';
import { getEmbedding, callSubsystemModel } from '../models.js';
import { cosineSimilarity } from '../core.js';
import { getPrompt } from '../prompts.js';
import { getConfig, estimateTokens, getDynamicBudgets } from './types.js';

// =============================================================================
// HISTORY COMPRESSION
// =============================================================================

/**
 * Compress conversation history using LLM summarization.
 *
 * Called when history token usage exceeds the compression threshold. Summarizes
 * the older half of uncompressed turns into a condensed summary, which is
 * prepended to subsequent context windows. Uses the 'context' subsystem model.
 *
 * @param session - The session whose history to compress (mutated in place)
 * @param budgetOverride - Optional override for the history token budget
 * @returns Object with `compressed` boolean, `tokens` count, and optionally `summary` or `error`
 */
export async function compressHistory(session: any, budgetOverride?: { history: number }) {
    const cfg = getConfig();
    const historyBudget = budgetOverride?.history ?? getDynamicBudgets(session).history;
    const threshold = historyBudget * cfg.compressionThreshold;

    // Calculate current history token usage
    const uncompressedTurns = session.history.slice(session.compressedUpTo);
    const historyText = uncompressedTurns.map((t: any) => `${t.role}: ${t.content}`).join('\n');
    const currentTokens = estimateTokens(historyText)
        + estimateTokens(session.compressedHistory || '');

    if (currentTokens < threshold) {
        return { compressed: false, tokens: currentTokens };
    }

    // Compress: summarize the older half of uncompressed turns
    const midpoint = Math.floor(uncompressedTurns.length / 2);
    if (midpoint < 2) {
        return { compressed: false, tokens: currentTokens };
    }

    const toCompress = uncompressedTurns.slice(0, midpoint);
    const compressText = toCompress.map((t: any) => `${t.role}: ${t.content}`).join('\n');

    const existingSummary = session.compressedHistory
        ? `Previous summary:\n${session.compressedHistory}\n\n`
        : '';

    const prompt = await getPrompt('context.history_compression', {
        existingSummary,
        compressText,
    });

    try {
        const summary = await callSubsystemModel('context', prompt, {});

        session.compressedHistory = summary;
        session.compressedUpTo += midpoint;

        const newTokens = estimateTokens(summary)
            + estimateTokens(uncompressedTurns.slice(midpoint).map((t: any) => `${t.role}: ${t.content}`).join('\n'));

        return { compressed: true, tokens: newTokens, summary };
    } catch (err: any) {
        console.warn('[context-engine] Compression failed:', err.message);
        return { compressed: false, tokens: currentTokens, error: err.message };
    }
}

// =============================================================================
// FEEDBACK LOOP: KNOWLEDGE USAGE DETECTION
// =============================================================================

/**
 * Detect which delivered knowledge nodes were actually used in the LLM response.
 *
 * Compares the response embedding against each delivered node's embedding. Nodes
 * with similarity above the configured usage threshold get a weight boost (capped
 * at maxBoostPerTurn total and weight ceiling of 3.0). Clears the delivered node
 * list after processing.
 *
 * @param response - The LLM's response text
 * @param session - The session containing lastDeliveredNodeIds (mutated in place)
 * @returns Object with `boosted` array of `{id, similarity}` and `totalBoost` applied
 */
export async function detectKnowledgeUsage(response: string, session: any) {
    const cfg = getConfig();
    const feedbackCfg = cfg.feedback;
    if (!feedbackCfg?.enabled) return { boosted: [] };

    const deliveredIds = session.lastDeliveredNodeIds || [];
    if (deliveredIds.length === 0) return { boosted: [] };

    const responseEmbedding = await getEmbedding(response);
    if (!responseEmbedding) return { boosted: [] };

    const boosted: { id: string; similarity: number }[] = [];
    let totalBoost = 0;

    if (deliveredIds.length > 0) {
        const placeholders = deliveredIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const nodes = await query(
            `SELECT id, embedding FROM nodes WHERE id IN (${placeholders})`,
            deliveredIds
        );

        for (const node of nodes) {
            if (!node.embedding) continue;
            if (totalBoost >= feedbackCfg.maxBoostPerTurn) break;

            const emb = typeof node.embedding === 'string'
                ? JSON.parse(node.embedding) : node.embedding;
            const sim = cosineSimilarity(responseEmbedding, emb);

            if (sim >= feedbackCfg.usageThreshold) {
                const boost = Math.min(feedbackCfg.weightBoost, feedbackCfg.maxBoostPerTurn - totalBoost);
                await query(
                    `UPDATE nodes SET weight = MIN($3, weight + $2) WHERE id = $1`,
                    [node.id, boost, 3.0]
                );
                boosted.push({ id: node.id, similarity: Math.round(sim * 1000) / 1000 });
                totalBoost += boost;
            }
        }
    }

    session.lastFeedback = { boosted, totalBoost, checkedAt: Date.now() };
    session.lastDeliveredNodeIds = [];

    return { boosted, totalBoost };
}

// =============================================================================
// CONTEXT QUALITY METRICS
// =============================================================================

/**
 * Compute quality metrics for a single conversation turn.
 *
 * Calculates five metrics:
 * 1. **knowledgeUtilization** - fraction of delivered nodes that were used
 * 2. **responseGrounding** - average embedding similarity of used nodes
 * 3. **topicCoverage** - fraction of session topics mentioned in the response
 * 4. **budgetEfficiency** - fraction of total token budget consumed
 * 5. **qualityScore** - weighted composite of the above four metrics
 *
 * Results are appended to the session's per-turn metrics arrays.
 *
 * @param response - The LLM's response text
 * @param session - The session with feedback data and metrics arrays (mutated in place)
 * @returns Record of metric name to value (all rounded to 3 decimal places)
 */
export function computeTurnMetrics(response: string, session: any): Record<string, number> {
    const metrics: Record<string, number> = {};
    const feedback = session.lastFeedback;

    // 1. Knowledge utilization: fraction of delivered nodes that were used
    const deliveredCount = feedback?.boosted !== undefined
        ? (session._lastDeliveredCount || 0)
        : 0;
    const usedCount = feedback?.boosted?.length || 0;
    metrics.knowledgeUtilization = deliveredCount > 0 ? usedCount / deliveredCount : 0;

    // 2. Response grounding: average similarity of response to used nodes
    if (feedback?.boosted?.length > 0) {
        const avgSim = feedback.boosted.reduce((sum: number, b: any) => sum + b.similarity, 0) / feedback.boosted.length;
        metrics.responseGrounding = avgSim;
    } else {
        metrics.responseGrounding = 0;
    }

    // 3. Topic coverage: fraction of session topics addressed in the response
    const responseLower = response.toLowerCase();
    const topicTerms = session.topics.slice(0, 10);
    const coveredTopics = topicTerms.filter((t: any) => responseLower.includes(t.term));
    metrics.topicCoverage = topicTerms.length > 0 ? coveredTopics.length / topicTerms.length : 0;

    // 4. Budget efficiency: fraction of token budget actually used
    if (session.lastContext) {
        const total = getConfig().totalBudget;
        const used = (session.lastContext.promptTokens || 0) + (session.lastContext.historyTokens || 0);
        metrics.budgetEfficiency = total > 0 ? Math.min(used / total, 1) : 0;
    } else {
        metrics.budgetEfficiency = 0;
    }

    // 5. Composite quality score
    const qmw = getConfig().qualityMetricWeights;
    metrics.qualityScore =
        metrics.knowledgeUtilization * qmw.knowledgeUtilization +
        metrics.responseGrounding * qmw.responseGrounding +
        metrics.topicCoverage * qmw.topicCoverage +
        metrics.budgetEfficiency * qmw.budgetEfficiency;

    // Round all values
    for (const key of Object.keys(metrics)) {
        metrics[key] = Math.round(metrics[key] * 1000) / 1000;
    }

    // Store in session metrics arrays
    session.metrics.knowledgeUtilization.push(metrics.knowledgeUtilization);
    session.metrics.responseGrounding.push(metrics.responseGrounding);
    session.metrics.topicCoverage.push(metrics.topicCoverage);
    session.metrics.budgetEfficiency.push(metrics.budgetEfficiency);
    session.metrics.qualityScores.push(metrics.qualityScore);

    return metrics;
}

// =============================================================================
// CROSS-SESSION LEARNING
// =============================================================================

/**
 * Persist session insights to the database for cross-session learning.
 *
 * Called before a session is deleted (TTL expiry). Saves top topics to
 * `session_insights` using exponential moving average (EMA) to merge weights
 * with existing records. Also persists node usage data from the feedback loop
 * to `session_node_usage`, tracking how often and how similarly each node was
 * used across sessions.
 *
 * @param session - The session to persist (topics, domains, feedback data)
 */
export async function persistSessionInsights(session: any) {
    const csCfg = getConfig().crossSession;
    if (csCfg && csCfg.enabled === false) return;

    const now = new Date().toISOString();
    const maxTopics = csCfg?.maxTopicsToPersist ?? 30;
    const weightThreshold = csCfg?.topicWeightThreshold ?? 0.5;

    // Persist top topics (only those with meaningful weight)
    for (const topic of session.topics.slice(0, maxTopics)) {
        if (topic.weight < weightThreshold) continue;

        const existing = await queryOne(
            `SELECT id, weight, usage_count FROM session_insights WHERE topic = $1`,
            [topic.term]
        );

        // Find cluster terms for this topic
        let clusterTerms: string[] = [];
        if (session.conceptClusters) {
            for (const cluster of session.conceptClusters) {
                if (cluster.terms.includes(topic.term)) {
                    clusterTerms = cluster.terms.filter((t: string) => t !== topic.term);
                    break;
                }
            }
        }

        if (existing) {
            const retain = csCfg?.emaRetain ?? 0.7;
            const incoming = csCfg?.emaIncoming ?? 0.3;
            const newWeight = existing.weight * retain + topic.weight * incoming;
            await query(
                `UPDATE session_insights SET weight = $1, usage_count = usage_count + 1, last_seen = $2, cluster_terms = $3 WHERE id = $4`,
                [newWeight, now, JSON.stringify(clusterTerms), existing.id]
            );
        } else {
            await query(
                `INSERT INTO session_insights (session_id, topic, weight, domain, last_seen, first_seen, cluster_terms)
                 VALUES ($1, $2, $3, $4, $5, $5, $6)`,
                [session.id, topic.term, topic.weight, session.domains[0] || null, now, JSON.stringify(clusterTerms)]
            );
        }
    }

    // Persist node usage data from feedback loop
    if (session.lastFeedback?.boosted) {
        for (const boost of session.lastFeedback.boosted) {
            const existing = await queryOne(
                `SELECT id, times_used, avg_similarity FROM session_node_usage WHERE node_id = $1`,
                [boost.id]
            );
            if (existing) {
                const newAvg = (existing.avg_similarity * existing.times_used + boost.similarity) / (existing.times_used + 1);
                await query(
                    `UPDATE session_node_usage SET times_used = times_used + 1, avg_similarity = $1, last_used = $2 WHERE id = $3`,
                    [newAvg, now, existing.id]
                );
            } else {
                await query(
                    `INSERT INTO session_node_usage (session_id, node_id, times_delivered, times_used, avg_similarity, last_used)
                     VALUES ($1, $2, $3, 1, $4, $5)`,
                    [session.id, boost.id, session._lastDeliveredCount || 0, boost.similarity, now]
                );
            }
        }
    }
}

/**
 * Load cross-session insights to warm-start a new session.
 *
 * Retrieves persisted topics (ranked by weight * usage_count) and frequently
 * used nodes from the database. Topic weights are amplified by log2(usage_count + 1)
 * to favor consistently discussed topics over one-off mentions.
 *
 * @param _message - The current user message (reserved for future relevance filtering)
 * @param _domains - Active domains (reserved for future domain-scoped filtering)
 * @returns Object with `topics` array (term, weight, domain, clusterTerms) and
 *          `frequentNodeIds` array of node UUIDs used across sessions
 */
export async function loadSessionInsights(_message: string, _domains: string[] = []) {
    const csCfg = getConfig().crossSession;
    const maxInsights = csCfg?.maxInsightsToLoad ?? 20;
    const maxNodeUsage = csCfg?.maxNodeUsageToLoad ?? 10;
    const nodeUsageMin = csCfg?.nodeUsageMinThreshold ?? 2;

    const insights = await query(
        `SELECT topic, weight, usage_count, domain, cluster_terms, last_seen
         FROM session_insights
         ORDER BY weight * usage_count DESC
         LIMIT $1`,
        [maxInsights]
    );

    const frequentNodes = await query(
        `SELECT node_id, times_used, avg_similarity
         FROM session_node_usage
         WHERE times_used >= $1
         ORDER BY times_used DESC, avg_similarity DESC
         LIMIT $2`,
        [nodeUsageMin, maxNodeUsage]
    );

    return {
        topics: insights.map((i: any) => ({
            term: i.topic,
            weight: i.weight * Math.log2((i.usage_count || 1) + 1),
            domain: i.domain,
            clusterTerms: i.cluster_terms ? JSON.parse(i.cluster_terms) : [],
            crossSession: true,
        })),
        frequentNodeIds: frequentNodes.map((n: any) => n.node_id),
    };
}
