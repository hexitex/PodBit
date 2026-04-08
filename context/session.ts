/**
 * @module context/session
 *
 * Context engine in-memory session management.
 *
 * Sessions track per-conversation state: accumulated topics and domains,
 * raw conversation history, compressed history summaries, feedback loop data,
 * and quality metrics. Sessions are stored in a Map and cleaned up on a
 * configurable TTL interval, with insights persisted to the database before
 * deletion for cross-session learning.
 */
// @ts-expect-error
import { v4 as uuid } from 'uuid';
import { getConfig } from './types.js';
import { persistSessionInsights } from './feedback.js';

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * In-memory session store.
 * Sessions track conversation state, accumulated topics, and compressed history.
 */
const sessions = new Map();

/**
 * Clear all in-memory sessions. Called during project switch to prevent
 * stale node references from the previous knowledge base.
 */
export function clearAllSessions(): void {
    sessions.clear();
    console.error('[context] All sessions cleared (project switch)');
}

/**
 * Create a new in-memory session with empty topics, history, and metrics arrays.
 *
 * @param sessionId - Explicit session ID, or null to generate a UUID
 * @returns The newly created session object (also stored in the sessions Map)
 */
export function createSession(sessionId: string | null = null) {
    const id = sessionId || uuid();
    const session = {
        id,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        turnCount: 0,

        // Accumulated topics and domains from conversation
        topics: [],        // [{ term, weight, firstSeen, lastSeen }]
        domains: [],       // Detected domains from topics

        // Conversation history (raw turns)
        history: [],       // [{ role, content, timestamp }]

        // Compressed history (replaces old turns when budget exceeded)
        compressedHistory: null,  // string summary of older turns
        compressedUpTo: 0,        // how many turns are compressed

        // Context metadata from last prepare()
        lastContext: null,

        // Feedback loop: track which nodes were delivered for usage detection
        lastDeliveredNodeIds: [] as string[],
        lastFeedback: null as any,

        // Quality metrics per turn
        metrics: {
            knowledgeUtilization: [] as number[],
            responseGrounding: [] as number[],
            topicCoverage: [] as number[],
            budgetEfficiency: [] as number[],
            qualityScores: [] as number[],
        },
    };
    sessions.set(id, session);
    return session;
}

/**
 * Retrieve an existing session by ID, updating its last-active timestamp.
 *
 * @param sessionId - The session identifier to look up
 * @returns The session object, or null if not found
 */
export function getSession(sessionId: string) {
    const session = sessions.get(sessionId);
    if (session) {
        session.lastActiveAt = Date.now();
    }
    return session || null;
}

/**
 * Retrieve an existing session or create a new one with the given ID.
 *
 * @param sessionId - The session identifier
 * @returns The existing or newly created session object
 */
export function getOrCreateSession(sessionId: string) {
    return getSession(sessionId) || createSession(sessionId);
}

/**
 * List all active sessions with summary metadata.
 *
 * @returns Array of session summaries with id, createdAt, lastActiveAt,
 *          turnCount, top 5 topic terms, and detected domains
 */
export function listSessions() {
    return [...sessions.values()].map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        turnCount: s.turnCount,
        topics: s.topics.slice(0, 5).map((t: any) => t.term),
        domains: s.domains,
    }));
}

/**
 * Remove a session from the in-memory store.
 *
 * @param sessionId - The session identifier to delete
 * @returns True if the session existed and was deleted, false otherwise
 */
export function deleteSession(sessionId: string) {
    return sessions.delete(sessionId);
}

/**
 * Remove sessions that have been inactive longer than the configured TTL.
 *
 * Before deletion, each expired session's insights are persisted to the
 * database for cross-session learning (fire-and-forget, errors logged).
 *
 * @returns The number of sessions cleaned up
 */
export function cleanupSessions() {
    const ttl = getConfig().sessionTTLMs;
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of sessions) {
        if (now - session.lastActiveAt > ttl) {
            // Persist insights before deletion (cross-session learning)
            persistSessionInsights(session).catch(err => {
                console.warn('[context-engine] Failed to persist session insights:', err.message);
            });
            sessions.delete(id);
            cleaned++;
        }
    }
    return cleaned;
}

// Run cleanup at configured interval
setInterval(cleanupSessions, getConfig().sessionCleanupIntervalMs);
