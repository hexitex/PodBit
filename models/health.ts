/**
 * Model health checking and ensemble calling.
 *
 * Provides connectivity checks for assigned models, parallel ensemble calling,
 * and a cached health check endpoint that tests all assigned models + embedding.
 * @module models/health
 */
import type { ModelEntry } from './types.js';
import { resolveProviderEndpoint } from './types.js';
import { getApiKey } from './api-keys.js';
import { callSingleModel } from './providers.js';
import { getSubsystemAssignments } from './assignments.js';

/**
 * Pings the model's API to verify connectivity (no LLM call made).
 * Uses GET /v1/models for Anthropic, or GET /models for OpenAI-compatible providers.
 * @param model - Model entry with provider and endpoint info
 * @throws {Error} If the API returns a non-2xx status
 */
export async function checkModelHealth(model: ModelEntry): Promise<void> {
    const endpoint = model.endpoint || resolveProviderEndpoint(model.provider);

    if (model.provider === 'anthropic') {
        // Anthropic: GET /v1/models to check connectivity
        const key = model.apiKey || '';
        const res = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
            },
        });
        if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
        return;
    }

    // OpenAI-compatible / LM Studio / local: GET /v1/models
    const base = endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
    const url = `${base}/models`;
    const headers: Record<string, string> = {};
    const key = model.apiKey || getApiKey(model.provider);
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${model.provider} models endpoint returned ${res.status}`);
}

/**
 * Calls multiple models in parallel with the same prompt using Promise.allSettled.
 * @param prompt - The prompt to send to all models
 * @param options - Object with models array to call
 * @returns Array of per-model results with model name, success flag, response text, and error message
 */
export async function callEnsemble(prompt: string, options: { models?: ModelEntry[] } = {}): Promise<any[]> {
    const { models = [] } = options;

    const results = await Promise.allSettled(
        models.map(model => callSingleModel(model, prompt, {
            temperature: 0.7,
        }))
    );

    return models.map((model, idx) => ({
        model: model.name,
        success: results[idx].status === 'fulfilled',
        response: results[idx].status === 'fulfilled' ? (results[idx] as PromiseFulfilledResult<any>).value.text : null,
        error: results[idx].status === 'rejected' ? (results[idx] as PromiseRejectedResult).reason.message : null,
    }));
}

// =============================================================================
// HEALTH CHECK (cached — runs at most once per 10 minutes)
// =============================================================================

let healthCache: { result: Record<string, string>; ts: number } | null = null;
const HEALTH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Returns health status for all assigned models and the embedding subsystem.
 * Results are cached for 10 minutes unless force=true. Models assigned to multiple
 * subsystems are only pinged once (deduplicated by model ID).
 * @param force - If true, bypasses the 10-minute cache
 * @returns Record mapping "subsystem (modelName)" -> 'ok' | 'error: message'
 */
export async function healthCheck(force = false): Promise<Record<string, string>> {
    if (!force && healthCache && (Date.now() - healthCache.ts) < HEALTH_CACHE_TTL) {
        return { ...healthCache.result, _cached: 'true' };
    }

    const results: Record<string, string> = {};

    // Only check models that are actually assigned to a subsystem
    const assignments = await getSubsystemAssignments();
    const checkedModels = new Map<string, string>(); // modelId → status

    for (const [subsystem, model] of Object.entries(assignments)) {
        if (!model || subsystem === 'embedding') continue;
        const key = `${subsystem} (${model.name})`;

        const cached = checkedModels.get(model.id);
        if (cached !== undefined) {
            results[key] = cached;
            continue;
        }

        try {
            await checkModelHealth(
                { name: model.modelId, provider: model.provider, model: model.modelId, endpoint: model.endpointUrl || undefined, apiKey: model.apiKey || undefined }
            );
            checkedModels.set(model.id, 'ok');
            results[key] = 'ok';
        } catch (err: any) {
            const status = `error: ${err.message}`;
            checkedModels.set(model.id, status);
            results[key] = status;
        }
    }

    // Check embedding — use the same lightweight ping as other subsystems,
    // not a full embedding call (which can timeout if the model needs to load)
    const embModel = assignments.embedding;
    if (embModel) {
        const key = `embedding (${embModel.name})`;
        const cached = checkedModels.get(embModel.id);
        if (cached !== undefined) {
            results[key] = cached;
        } else {
            try {
                await checkModelHealth(
                    { name: embModel.modelId, provider: embModel.provider, model: embModel.modelId, endpoint: embModel.endpointUrl || undefined, apiKey: embModel.apiKey || undefined }
                );
                checkedModels.set(embModel.id, 'ok');
                results[key] = 'ok';
            } catch (err: any) {
                const status = `error: ${err.message}`;
                checkedModels.set(embModel.id, status);
                results[key] = status;
            }
        }
    } else {
        results['embedding'] = 'not assigned';
    }

    healthCache = { result: results, ts: Date.now() };
    return results;
}
