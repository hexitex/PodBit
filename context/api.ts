/**
 * @module context/api
 *
 * Context engine core API: prepare(), update(), warmUpSession().
 *
 * `prepare()` is called before each LLM turn to select relevant knowledge,
 * build a system prompt, and manage conversation history within token budgets.
 * `update()` is called after the LLM responds to trigger the feedback loop,
 * extract new topics, and compress history when needed.
 */
import { getPrompt } from '../prompts.js';
import { getConfig, getModelProfiles, estimateTokens, getDynamicBudgets } from './types.js';
import { getSession, getOrCreateSession } from './session.js';
import { extractTopics } from './topics.js';
import { detectIntent, getIntentWeights, selectKnowledge, buildSystemPrompt } from './knowledge.js';
import { compressHistory, detectKnowledgeUsage, computeTurnMetrics, loadSessionInsights, } from './feedback.js';

// =============================================================================
// CORE API: prepare() and update()
// =============================================================================

/**
 * Prepare context for an LLM turn. This is the main entry point called before each LLM call.
 *
 * Performs topic extraction, intent detection, knowledge selection, system prompt building,
 * conversation history assembly, and token budget calculation. On the first turn, it also
 * warm-starts from cross-session insights (persisted topic weights from prior sessions).
 *
 * @param message - The user's current message text
 * @param sessionId - Unique session identifier (created if not found)
 * @param options - Optional overrides
 * @param options.modelProfile - Model size profile key ('micro'|'small'|'medium'|'large'|'xl'), defaults to 'medium'
 * @param options.budget - Override total token budget (otherwise derived from profile)
 * @param options.maxNodes - Override maximum knowledge nodes to return
 * @returns Context package with systemPrompt, knowledge nodes, history, topics, domains,
 *          intent classification, budget status, and cross-session topic data
 */
export async function prepare(message: string, sessionId: string, options: Record<string, any> = {}) {
    const session = getOrCreateSession(sessionId);

    // 0. Resolve model profile (affects budget, node count, and formatting)
    const profileKey = options.modelProfile || 'medium';
    const profile = getModelProfiles()[profileKey] || getModelProfiles()['medium'];
    const effectiveBudget = options.budget || Math.floor(getConfig().totalBudget * profile.budgetMultiplier);
    const effectiveMaxNodes = options.maxNodes || profile.maxKnowledgeNodes;

    // 1. Extract topics from message
    const topicInfo = await extractTopics(message, session);

    // 1b. Warm-start from cross-session insights (first turn only)
    let crossSessionTopics: any[] = [];
    const csCfg = getConfig().crossSession;
    if (session.turnCount <= 1 && csCfg?.enabled !== false) {
        try {
            const insights = await loadSessionInsights(message, session.domains);
            crossSessionTopics = insights.topics;

            const boostExisting = csCfg?.boostExisting ?? 0.5;
            const dampeningNew = csCfg?.dampeningNew ?? 0.3;

            // Merge cross-session topics into session at dampened weight
            for (const cst of insights.topics.slice(0, 10)) {
                const existing = session.topics.find((t: any) => t.term === cst.term);
                if (existing) {
                    existing.weight = Math.max(existing.weight, cst.weight * boostExisting);
                } else {
                    session.topics.push({
                        term: cst.term,
                        weight: cst.weight * dampeningNew,
                        firstSeen: Date.now(),
                        lastSeen: Date.now(),
                    });
                }
            }
        } catch (err: any) {
            console.warn('[context-engine] Failed to load cross-session insights:', err.message);
        }
    }

    // 2. Detect intent and compute effective relevance weights
    const intentResult = detectIntent(message);
    const effectiveWeights = getIntentWeights(
        intentResult.intent,
        intentResult.confidence,
        getConfig().relevanceWeights
    );

    // 3. Select relevant knowledge (with intent-adjusted weights and model-aware limits)
    const knowledge = await selectKnowledge(message, session, {
        maxNodes: effectiveMaxNodes,
        budget: effectiveBudget,
        weights: effectiveWeights,
        profileKey,
    });

    // 4. Build system prompt from knowledge, prefixed with research identity
    let identityPrefix = '';
    try {
        identityPrefix = await getPrompt('system.identity');
    } catch {
        // Prompt system not ready — proceed without identity
    }

    // 3b. For compressed profiles, try serving cached domain digests
    let _digestSubstituted = false;
    if (profile.preferCompressed && knowledge.length > 0) {
        const domains = [...new Set(knowledge.map((k: any) => k.domain).filter(Boolean))];
        if (domains.length <= 2) {
            try {
                const { generateDomainDigest } = await import('../handlers/knowledge.js');
                const digests: { content: string; domain: string }[] = [];
                for (const d of domains) {
                    const digest = await generateDomainDigest(d);
                    if (digest) digests.push({ content: `[${d}] ${digest}`, domain: d });
                }
                if (digests.length > 0 && estimateTokens(digests.map(d => d.content).join(' ')) < estimateTokens(knowledge.map((k: any) => k.content).join(' '))) {
                    // Digest is more compact — use it instead
                    knowledge.length = 0;
                    knowledge.push(...digests.map((d, i) => ({
                        id: `digest-${i}`,
                        content: d.content,
                        domain: d.domain,
                        nodeType: 'digest',
                        relevance: 1,
                        tokens: estimateTokens(d.content),
                    })));
                    _digestSubstituted = true;
                }
            } catch {
                // Digest generation failed — fall back to normal nodes
            }
        }
    }

    const { prompt: knowledgePrompt, tokens: knowledgeTokens } = buildSystemPrompt(
        knowledge, session, { ...options, preferCompressed: profile.preferCompressed }
    );

    const systemPrompt = knowledgePrompt
        ? `${identityPrefix}\n\n---\n\n${knowledgePrompt}`
        : identityPrefix || null;
    const promptTokens = estimateTokens(systemPrompt || '');

    // 4. Build conversation history (using dynamic budgets based on session depth)
    const budgets = getDynamicBudgets(session);
    const historyForContext = [];
    let historyTokens = 0;

    if (session.compressedHistory) {
        historyForContext.push({
            role: 'system',
            content: `[Previous conversation summary]\n${session.compressedHistory}`,
        });
        historyTokens += estimateTokens(session.compressedHistory);
    }

    // Add uncompressed turns (most recent)
    const recentTurns = session.history.slice(session.compressedUpTo);
    for (const turn of recentTurns) {
        const turnTokens = estimateTokens(turn.content);
        if (historyTokens + turnTokens > budgets.history) break;
        historyForContext.push({ role: turn.role, content: turn.content });
        historyTokens += turnTokens;
    }

    // 5. Add current message to session history
    session.history.push({
        role: 'user',
        content: message,
        timestamp: Date.now(),
    });
    session.turnCount++;

    // 6. Calculate budget status
    const totalUsed = promptTokens + historyTokens;
    const budgetStatus = {
        total: budgets.total,
        used: totalUsed,
        remaining: budgets.total - totalUsed,
        knowledge: { budget: budgets.knowledge, used: promptTokens, nodes: knowledge.length },
        history: { budget: budgets.history, used: historyTokens, turns: historyForContext.length },
        response: { budget: budgets.response },
    };

    // 7. Build the context package
    const context = {
        sessionId: session.id,
        systemPrompt,
        knowledge: knowledge.map(k => ({
            id: k.id,
            content: k.content,
            domain: k.domain,
            nodeType: k.nodeType,
            relevance: k.relevance,
        })),
        history: historyForContext,
        topics: topicInfo.keywords.slice(0, 10).map((t: any) => ({ term: t.term, weight: Math.round(t.weight * 100) / 100 })),
        domains: topicInfo.domains,
        intent: intentResult,
        modelProfile: profileKey,
        budget: budgetStatus,
        turnCount: session.turnCount,
        crossSessionTopics: crossSessionTopics.slice(0, 5).map((t: any) => ({
            term: t.term,
            weight: Math.round(t.weight * 100) / 100,
            domain: t.domain,
        })),
    };

    // Cache for metadata display
    session.lastContext = {
        knowledgeCount: knowledge.length,
        topicCount: topicInfo.keywords.length,
        domainCount: topicInfo.domains.length,
        promptTokens,
        historyTokens,
        preparedAt: Date.now(),
    };

    // Track delivered node IDs for feedback loop and metrics
    session.lastDeliveredNodeIds = knowledge.map(k => k.id);
    session._lastDeliveredCount = knowledge.length;

    return context;
}

/**
 * Update session state after receiving an LLM response. Called after each LLM turn.
 *
 * Adds the response to session history, extracts new topics from it, runs the
 * feedback loop to detect which delivered knowledge nodes were referenced,
 * computes quality metrics, and triggers history compression if the token budget
 * is exceeded.
 *
 * @param sessionId - The session to update (must exist; returns error if not found)
 * @param response - The LLM's response text
 * @param options - Optional overrides
 * @param options.compress - Set to false to disable automatic history compression (default: true)
 * @returns Object with session state: turnCount, compression status, feedback results,
 *          quality metrics, current topics, and detected domains
 */
export async function update(sessionId: string, response: string, options: Record<string, any> = {}) {
    const session = getSession(sessionId);
    if (!session) {
        return { error: 'Session not found', sessionId };
    }

    // 1. Add response to history
    session.history.push({
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
    });
    session.turnCount++;

    // 2. Extract topics from response (the LLM may introduce new relevant terms)
    await extractTopics(response, session);

    // 3. Feedback loop: detect which delivered nodes were used in the response
    const feedbackResult = await detectKnowledgeUsage(response, session);

    // 3b. Compute quality metrics for this turn
    const turnMetrics = computeTurnMetrics(response, session);

    // 4. Check if compression is needed
    let compressionResult = { compressed: false };
    const shouldCompress = options.compress !== false; // Default: auto-compress

    if (shouldCompress) {
        const historyText = session.history.slice(session.compressedUpTo)
            .map((t: any) => `${t.role}: ${t.content}`).join('\n');
        const historyTokens = estimateTokens(historyText)
            + estimateTokens(session.compressedHistory || '');
        const dynBudgets = getDynamicBudgets(session);
        const historyBudget = dynBudgets.history;

        if (historyTokens > historyBudget * getConfig().compressionThreshold) {
            compressionResult = await compressHistory(session, { history: historyBudget });
        }
    }

    return {
        sessionId: session.id,
        turnCount: session.turnCount,
        compression: compressionResult,
        feedback: feedbackResult,
        metrics: turnMetrics,
        topics: session.topics.slice(0, 10).map((t: any) => t.term),
        domains: session.domains,
    };
}

// =============================================================================
// SESSION WARM-UP (rebuild from persisted messages after restart)
// =============================================================================

/**
 * Rebuild a session's topic and domain state from persisted messages.
 *
 * Used after server restart to restore session context without re-running
 * the full prepare/update cycle. Replays the most recent messages through
 * topic extraction only. No-ops if the session already has turns.
 *
 * @param sessionId - Session identifier to warm up (created if not found)
 * @param messages - Persisted conversation messages to replay
 * @param maxReplay - Maximum number of recent messages to replay (default: 6)
 * @returns The warmed-up session object
 */
export async function warmUpSession(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    maxReplay: number = 6
) {
    const session = getOrCreateSession(sessionId);

    // Already warm — don't replay
    if (session.turnCount > 0) return session;

    const recent = messages.slice(-maxReplay);
    for (const msg of recent) {
        await extractTopics(msg.content, session);
        session.history.push({
            role: msg.role,
            content: msg.content,
            timestamp: Date.now(),
        });
        session.turnCount++;
    }

    return session;
}
