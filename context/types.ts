/**
 * @module context/types
 *
 * Context engine types, configuration accessors, model profiles, and token
 * estimation utilities. Provides the shared infrastructure used by all other
 * context engine modules.
 */
import { config as appConfig } from '../config.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Get the context engine configuration block from the application config.
 *
 * @returns The `contextEngine` section of the app config, containing budgets,
 *          model profiles, stop words, intent patterns, relevance weights, etc.
 */
export function getConfig() {
    return appConfig.contextEngine;
}

// =============================================================================
// MODEL PROFILES
// =============================================================================

export interface ModelProfile {
    label: string;
    contextWindow: number;
    budgetMultiplier: number;
    preferCompressed: boolean;
    maxKnowledgeNodes: number;
    historyTurns: number;
}

/**
 * Get the model profiles from the context engine config.
 *
 * Each profile defines context window size, budget multiplier, node limits,
 * and formatting preferences for different model tiers (micro through xl).
 *
 * @returns Record mapping profile key to ModelProfile definition
 */
export function getModelProfiles(): Record<string, ModelProfile> {
    return getConfig().modelProfiles as Record<string, ModelProfile>;
}

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimate token count from text using a rough heuristic (~4 chars per token for English).
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (ceiling), or 0 if text is falsy
 */
export function estimateTokens(text: string) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Get static token budgets for each context section.
 *
 * Multiplies the total budget by each allocation percentage from config.
 * Used by the MCP `budgets` action and as fallback when dynamic budgets are disabled.
 *
 * @returns Object with `total`, `knowledge`, `history`, `systemPrompt`, and `response` token budgets
 */
export function getBudgets() {
    const cfg = getConfig();
    const total = cfg.totalBudget;
    return {
        total,
        knowledge: Math.floor(total * cfg.allocation.knowledge),
        history: Math.floor(total * cfg.allocation.history),
        systemPrompt: Math.floor(total * cfg.allocation.systemPrompt),
        response: Math.floor(total * cfg.allocation.response),
    };
}

/**
 * Get dynamic token budgets that adjust based on conversation depth.
 *
 * Linearly interpolates between a "new conversation" profile (more knowledge,
 * less history) and a "deep conversation" profile (less knowledge, more history)
 * based on the session's turn count relative to the depth ceiling. Falls back
 * to static budgets when dynamic budgeting is disabled or no session is provided.
 *
 * @param session - The session to compute budgets for (uses turnCount and model profile)
 * @returns Object with `total`, `knowledge`, `history`, `systemPrompt`, and `response` token budgets
 */
export function getDynamicBudgets(session: any | null = null) {
    const cfg = getConfig();
    const dynCfg = cfg.dynamicBudget;
    if (!dynCfg?.enabled || !session) return { ...getBudgets(), total: cfg.totalBudget };

    const depth = session.turnCount || 0;
    const maxDepth = dynCfg.depthCeiling;
    const t = Math.min(depth / maxDepth, 1);

    const profile: Record<string, number> = {};
    for (const key of Object.keys(dynCfg.newProfile)) {
        const k = key as keyof typeof dynCfg.newProfile;
        profile[key] = dynCfg.newProfile[k] * (1 - t) + dynCfg.deepProfile[k] * t;
    }

    const profiles = getModelProfiles();
    const modelProfile = session._modelProfile
        ? profiles[session._modelProfile] || profiles['medium']
        : profiles['medium'];
    const total = Math.floor(cfg.totalBudget * modelProfile.budgetMultiplier);

    return {
        total,
        knowledge: Math.floor(total * (profile.knowledge || cfg.allocation.knowledge)),
        history: Math.floor(total * (profile.history || cfg.allocation.history)),
        systemPrompt: Math.floor(total * (profile.systemPrompt || cfg.allocation.systemPrompt)),
        response: Math.floor(total * (profile.response || cfg.allocation.response)),
    };
}

export type QueryIntent = 'retrieval' | 'action' | 'diagnosis' | 'exploration';
