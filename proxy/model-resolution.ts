/**
 * @module proxy/model-resolution
 *
 * Proxy model resolution, token estimation, and session ID derivation.
 *
 * Resolves which upstream model to use via a priority chain: proxy subsystem
 * assignment, client-requested model match, chat subsystem assignment, first
 * enabled model. Also maps context window sizes to model profile tiers and
 * derives stable session IDs from request headers, user fields, or system
 * message hashes.
 */
import crypto from 'crypto';
import express from 'express';
import { RC } from '../config/constants.js';
import {
    extractTextContent,
    getRegisteredModels,
    getSubsystemAssignments,
    type RegisteredModel,
} from '../models.js';

// =============================================================================
// MODEL RESOLUTION
// =============================================================================

/**
 * Determine the model profile tier from a context window size.
 *
 * @param ctxSize - The model's context window in tokens
 * @returns Profile tier name: 'micro' (<=4K), 'small' (<=8K), 'medium' (<=32K),
 *          'large' (<=128K), or 'xl' (>128K)
 */
export function profileFromContextSize(ctxSize: number): 'micro' | 'small' | 'medium' | 'large' | 'xl' {
    if (ctxSize <= 4096) return 'micro';
    if (ctxSize <= 8192) return 'small';
    if (ctxSize <= 32768) return 'medium';
    if (ctxSize <= 131072) return 'large';
    return 'xl';
}

export interface ResolvedModel {
    name: string;
    provider: string;
    model?: string;
    endpoint?: string;
    apiKey?: string;
    noThink?: boolean;
    inputCostPerMtok?: number;
    outputCostPerMtok?: number;
    toolCostPerMtok?: number;
    contextSize?: number | null;
    _registryModel?: RegisteredModel; // full registry entry for detection calls
    _registryId?: string;
    _maxConcurrency?: number;
    _requestPauseMs?: number;
}

export const PROFILE_CONTEXT_WINDOWS: Record<string, number> = {
    micro: 2048, small: 4096, medium: 16000, large: 65000, xl: 128000,
};

/**
 * Estimate token count for an array of chat messages.
 *
 * Uses ~3 chars per token (more conservative than the context engine's ~4 chars)
 * to account for chat template overhead, special tokens, and non-English text.
 * Adds 20 chars per message for role tags and chat template wrapping.
 *
 * @param messages - Array of chat messages with role and content fields
 * @returns Estimated total token count (ceiling)
 */
export function estimateTokens(messages: Array<{ role: string; content: any }>): number {
    // ~3 chars per token accounts for chat template overhead, special tokens, and non-English text
    let chars = 0;
    for (const msg of messages) {
        chars += extractTextContent(msg.content).length + 20; // +20 for role tags, chat template wrapping
    }
    return Math.ceil(chars / 3);
}

/**
 * Resolve which upstream model to use for a proxy request.
 *
 * Priority chain:
 * 1. Proxy subsystem's assigned model (user's explicit configuration)
 * 2. Client-requested model matched against registry (by modelId, name, or registry ID)
 * 3. Chat subsystem's assigned model
 * 4. First enabled model in the registry
 *
 * @param requestedModel - The model ID from the client's request body (optional)
 * @returns Resolved model entry with provider, endpoint, API key, and registry metadata
 * @throws Error if no models are available in the registry
 */
export async function resolveModel(requestedModel?: string): Promise<ResolvedModel> {
    // Priority 1: Use the proxy subsystem's assigned model (user's explicit configuration)
    try {
        const assignments = await getSubsystemAssignments();
        const proxyModel = assignments.proxy;
        if (proxyModel) {
            console.log(`[proxy] Using proxy subsystem model: ${proxyModel.name}${requestedModel ? ` (client requested: ${requestedModel})` : ''}`);
            return registeredToModelEntry(proxyModel);
        }
    } catch (err: any) {
        console.warn(`[proxy] Subsystem assignment lookup failed: ${err.message}`);
    }

    // Priority 2: Try matching client's requested model against registry
    if (requestedModel && requestedModel !== 'default') {
        try {
            const models = await getRegisteredModels();
            // Match by modelId (exact)
            const byModelId = models.find(m => m.enabled && m.modelId === requestedModel);
            if (byModelId) return registeredToModelEntry(byModelId);

            // Match by name (case-insensitive)
            const byName = models.find(m => m.enabled && m.name.toLowerCase() === requestedModel.toLowerCase());
            if (byName) return registeredToModelEntry(byName);

            // Match by registry ID
            const byId = models.find(m => m.enabled && m.id === requestedModel);
            if (byId) return registeredToModelEntry(byId);

            // No match by name or ID — fall through to subsystem assignment
        } catch (err: any) {
            console.warn(`[proxy] Registry lookup failed: ${err.message}`);
        }
    }

    // Priority 3: Fall back to chat subsystem assignment
    try {
        const assignments = await getSubsystemAssignments();
        const chatModel = assignments.chat;
        if (chatModel) {
            return registeredToModelEntry(chatModel);
        }
    } catch (err: any) {
        console.warn(`[proxy] Chat assignment lookup failed: ${err.message}`);
    }

    // Last resort: first enabled model from registry
    try {
        const models = await getRegisteredModels();
        const first = models.find(m => m.enabled);
        if (first) return registeredToModelEntry(first);
    } catch { /* fall through */ }

    throw new Error('No models available. Configure models in the model registry first.');
}

/**
 * Convert a RegisteredModel from the model registry to the ResolvedModel shape
 * used internally by the proxy for LLM calls.
 *
 * @param m - The registered model entry from the database
 * @returns ResolvedModel with provider, endpoint, cost info, and registry metadata
 */
export function registeredToModelEntry(m: RegisteredModel): ResolvedModel {
    return {
        name: m.modelId,
        provider: m.provider,
        model: m.modelId,
        endpoint: m.endpointUrl || undefined,
        apiKey: m.apiKey || undefined,
        noThink: m.noThink || false,
        inputCostPerMtok: m.inputCostPerMtok,
        outputCostPerMtok: m.outputCostPerMtok,
        toolCostPerMtok: m.toolCostPerMtok,
        contextSize: m.contextSize,
        _registryModel: m,
        _registryId: m.id,
        _maxConcurrency: m.maxConcurrency ?? 1,
        _requestPauseMs: m.requestPauseMs ?? 0,
    };
}

// =============================================================================
// SESSION RESOLUTION
// =============================================================================

/**
 * Derive a stable session ID for context engine tracking.
 *
 * Priority chain:
 * 1. Explicit `X-Session-Id` request header
 * 2. `user` field from the request body
 * 3. SHA-256 hash of the first system message (gives continuity for same-context conversations)
 * 4. Random UUID (no session continuity)
 *
 * All IDs are prefixed with `proxy:` for namespace isolation.
 *
 * @param req - Express request (checked for X-Session-Id header)
 * @param messages - Chat message array (checked for system message hash)
 * @param user - Optional user identifier from the request body
 * @returns A prefixed session ID string
 */
export function resolveSessionId(req: express.Request, messages: any[], user?: string): string {
    // Priority 1: Explicit header
    const headerSession = req.headers['x-session-id'];
    if (headerSession && typeof headerSession === 'string') {
        return `proxy:${headerSession}`;
    }

    // Priority 2: User field
    if (user && typeof user === 'string') {
        return `proxy:user:${user}`;
    }

    // Priority 3: Hash of first system message (gives session continuity for same-context conversations)
    const systemMsg = messages.find((m: any) => m.role === 'system');
    if (systemMsg?.content) {
        const hash = crypto.createHash('sha256').update(systemMsg.content).digest('hex').slice(0, RC.misc.hashTruncationLength);
        return `proxy:sys:${hash}`;
    }

    // Priority 4: Random UUID
    return `proxy:${crypto.randomUUID()}`;
}
