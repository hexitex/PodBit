/**
 * Embedding generation — unified through the model registry.
 *
 * Uses the same model assignment infrastructure as LLM calls.
 * The 'embedding' subsystem assignment determines which model, endpoint,
 * and provider to use. No hardcoded endpoints or provider-specific fallbacks.
 *
 * @module models/embedding
 */
import { RC } from '../config/constants.js';
import { getApiKey } from './api-keys.js';
import { ensureAssignmentsLoaded, getAssignedModel } from './assignments.js';
import { acquireModelSlot } from './semaphore.js';
import { logUsage } from './cost.js';
import { resolveProviderEndpoint } from './types.js';

/**
 * Returns the currently configured embedding model name for display.
 */
export function getEmbeddingModelName(): string {
    const assigned = getAssignedModel('embedding');
    return assigned?.modelId || assigned?.name || '(none)';
}

/**
 * Embeds text using the assigned embedding model.
 *
 * Uses the same model registry as all other subsystems — endpoint, auth,
 * provider, concurrency limits all come from the model assignment.
 *
 * @param text - The text to embed
 * @returns Float array embedding vector, or null if no model assigned
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
    await ensureAssignmentsLoaded();

    let assigned = getAssignedModel('embedding');
    if (!assigned) {
        console.warn('[embedding] No embedding model assigned. Assign one via the Models page.');
        return null;
    }

    if (!assigned.endpointUrl) {
        // Fall back to provider default (e.g. LM Studio → http://127.0.0.1:1234/v1)
        const fallback = resolveProviderEndpoint(assigned.provider);
        console.warn(`[embedding] Model "${assigned.name}" (provider: ${assigned.provider}) has no endpoint URL — falling back to ${fallback}`);
        assigned = { ...assigned, endpointUrl: fallback };
    }

    // Truncate to stay within embedding model context limits
    const maxChars = RC.contentLimits.maxEmbeddingChars;
    if (text.length > maxChars) {
        text = text.slice(0, maxChars);
    }

    // Acquire concurrency slot — same semaphore pool as LLM calls
    let release: (() => void) | undefined;
    if (assigned.id) {
        release = await acquireModelSlot(
            assigned.id,
            assigned.maxConcurrency ?? 4,
            assigned.requestPauseMs ?? 0,
        );
    }

    try {
        return await callEmbeddingAPI(assigned, text);
    } catch (err: any) {
        if (err.cause?.code === 'ECONNREFUSED') {
            console.warn(`[embedding] Not running at ${assigned.endpointUrl}`);
        } else {
            console.warn(`[embedding] Call failed: ${err.message}`);
        }
        return null;
    } finally {
        release?.();
    }
}

/**
 * Call the embedding API using the model's provider and endpoint.
 *
 * All providers use the same pattern:
 * - OpenAI/LM Studio/OpenAI-compatible: POST {endpoint}/embeddings
 * - Ollama: POST {endpoint}/api/embeddings (different body format)
 * - Anthropic: Not supported for embeddings (use a different model)
 */
async function callEmbeddingAPI(model: NonNullable<ReturnType<typeof getAssignedModel>>, text: string): Promise<number[] | null> {
    const endpoint = model.endpointUrl!.replace(/\/+$/, '');
    const provider = model.provider;
    const modelId = model.modelId;
    const apiKey = model.apiKey || getApiKey(provider);

    const timeoutMs = (model.requestTimeout ?? 180) * 1000;

    if (provider === 'local') {
        // Ollama uses a different API shape
        return callOllamaEmbedding(endpoint, modelId, text, timeoutMs);
    }

    // Everything else is OpenAI-compatible (openai, lmstudio, and any other provider)
    return callOpenAICompatibleEmbedding(endpoint, modelId, apiKey, text, model);
}

/**
 * OpenAI-compatible embedding call (works for OpenAI, LM Studio, vLLM, Z.AI, etc.)
 */
async function callOpenAICompatibleEmbedding(
    endpoint: string,
    modelId: string,
    apiKey: string | undefined,
    text: string,
    model: any,
): Promise<number[] | null> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // Build URL: if endpoint includes /v1 use {endpoint}/embeddings, otherwise {endpoint}/v1/embeddings
    const url = endpoint.includes('/v1')
        ? `${endpoint}/embeddings`
        : `${endpoint}/v1/embeddings`;

    // Use model's configured timeout (seconds → ms), default 180s for embeddings.
    // Local models (LM Studio) need extra time on cold start to load the model.
    const timeoutMs = (model.requestTimeout ?? 180) * 1000;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: modelId, input: text }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(`Embedding error (${response.status}): ${error.slice(0, 300)}`);
    }

    const data = await response.json() as any;

    // Log usage
    if (data.usage) {
        logUsage({
            subsystem: 'embedding',
            modelId,
            modelName: model.name || modelId,
            provider: model.provider,
            inputTokens: data.usage.prompt_tokens || data.usage.total_tokens || 0,
            outputTokens: 0,
            toolTokens: 0,
            totalTokens: data.usage.total_tokens || 0,
            inputCostPerMtok: model.inputCostPerMtok,
            outputCostPerMtok: model.outputCostPerMtok,
        }).catch(() => {});
    }

    return data.data?.[0]?.embedding || null;
}

/**
 * Ollama embedding call (different API shape)
 */
async function callOllamaEmbedding(endpoint: string, modelId: string, text: string, timeoutMs = 60_000): Promise<number[] | null> {
    const response = await fetch(`${endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, prompt: text }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(`Ollama embedding error (${response.status}): ${error.slice(0, 300)}`);
    }

    const data = await response.json() as any;
    return data.embedding || null;
}
