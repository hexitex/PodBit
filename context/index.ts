/**
 * @module context
 *
 * PODBIT v0.5 - CONTEXT ENGINE
 *
 * Per-turn, session-aware knowledge delivery designed to enrich smaller/local LLMs.
 * Accumulates topics across turns, detects intent, selects relevant graph knowledge,
 * and manages token budgets. Includes a feedback loop that boosts nodes the LLM
 * actually references, and cross-session learning that persists topic weights.
 *
 * Re-exports — all existing imports from '../context-engine.js' continue to work.
 */

// Core API
export { prepare, update, warmUpSession } from './api.js';

// Session management
export { createSession, getSession, getOrCreateSession, listSessions, deleteSession, cleanupSessions, clearAllSessions } from './session.js';

// Knowledge selection and prompt building
export { extractKeywords, extractTopics } from './topics.js';
export { selectKnowledge, buildSystemPrompt } from './knowledge.js';

// Feedback and metrics
export { compressHistory, persistSessionInsights, loadSessionInsights } from './feedback.js';

// Utilities
export { estimateTokens, getBudgets, getDynamicBudgets } from './types.js';
