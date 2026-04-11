/**
 * Model registry CRUD, context size detection, and initialization.
 *
 * Manages the model_registry table in the system DB. Provides CRUD operations,
 * auto-detection of context sizes from Ollama/LM Studio APIs, and first-boot
 * auto-import of models from environment variables.
 * @module models/registry
 */
import { systemQuery as query, systemQueryOne as queryOne, query as projectQuery } from '../db.js';
import type { RegisteredModel } from './types.js';
import { normalizeProvider, resolveProviderEndpoint, generateUuid } from './types.js';
import { getApiKey } from './api-keys.js';
import { loadAssignmentCache } from './assignments.js';

/**
 * Validate that retry config parameters are coherent. The backoff must fit
 * within the retry window, otherwise retries are impossible and the model
 * silently fails after the first rate-limit hit.
 */
/**
 * Validate retry config coherence. Returns a warning message if the backoff
 * exceeds the retry window (retries would be ineffective). This is advisory -
 * the system clamps backoff to the remaining window at runtime, so the config
 * is never fatal. The warning surfaces in the GUI on save.
 */
function validateRetryConfig(cfg: { maxRetries?: number; retryWindowMinutes?: number; rateLimitBackoffMs?: number }): { warning?: string } {
    const maxRetries = cfg.maxRetries ?? 3;
    const windowMs = (cfg.retryWindowMinutes ?? 2) * 60_000;
    const backoffMs = cfg.rateLimitBackoffMs ?? 120_000;

    if (maxRetries > 0 && backoffMs > windowMs) {
        return {
            warning: `rate_limit_backoff_ms (${backoffMs}ms) exceeds retry_window_minutes (${cfg.retryWindowMinutes ?? 2}m = ${windowMs}ms). Backoff will be clamped to the remaining window at runtime, but retries may be less effective than intended.`,
        };
    }
    return {};
}

/**
 * Convert a raw DB row from model_registry into a typed RegisteredModel object.
 * Applies defaults for nullable columns and normalizes provider names.
 * @param r - Raw row from SQLite query
 * @returns Typed RegisteredModel
 */
function rowToRegisteredModel(r: any): RegisteredModel {
    return {
        id: r.id,
        name: r.name,
        provider: normalizeProvider(r.provider),
        modelId: r.model_id,
        tier: r.tier || 'medium',
        endpointUrl: r.endpoint_url || null,
        apiKey: r.api_key || null,
        enabled: !!r.enabled,
        maxTokens: r.max_tokens ?? null,
        contextSize: r.context_size ?? null,
        costPer1k: r.cost_per_1k ?? 0,
        inputCostPerMtok: r.input_cost_per_mtok ?? 0,
        outputCostPerMtok: r.output_cost_per_mtok ?? 0,
        toolCostPerMtok: r.tool_cost_per_mtok ?? 0,
        sortOrder: r.sort_order ?? 0,
        maxRetries: r.max_retries ?? 3,
        retryWindowMinutes: r.retry_window_minutes ?? 2,
        maxConcurrency: r.max_concurrency ?? 1,
        requestPauseMs: r.request_pause_ms ?? 0,
        requestTimeout: r.request_timeout ?? 180,
        rateLimitBackoffMs: r.rate_limit_backoff_ms ?? 120000,
        supportsTools: r.supports_tools === 1 ? true : r.supports_tools === 0 ? false : null,
        noThink: !!r.no_think,
        thinkingLevel: r.no_think ? 'off' : null,
    };
}

/**
 * Returns all model_registry rows as RegisteredModel objects (from system DB).
 * @returns Array of all registered models, ordered by sort_order then name
 */
export async function getRegisteredModels(): Promise<RegisteredModel[]> {
    const rows = await query(
        `SELECT id, name, provider, model_id, tier, endpoint_url, api_key, enabled, max_tokens, context_size, cost_per_1k,
                input_cost_per_mtok, output_cost_per_mtok, tool_cost_per_mtok,
                sort_order, max_retries, retry_window_minutes, max_concurrency, request_pause_ms, request_timeout, rate_limit_backoff_ms, supports_tools, no_think
         FROM model_registry ORDER BY sort_order, name`
    );
    return rows.map(rowToRegisteredModel);
}

/**
 * Inserts a new model into model_registry and syncs the assignment cache.
 * Generates a UUID for the new model's primary key.
 * @param model - Model fields (id is auto-generated)
 * @returns The created RegisteredModel with its assigned id
 */
export async function registerModel(model: Omit<RegisteredModel, 'id'>): Promise<RegisteredModel> {
    const id = generateUuid();
    await query(
        `INSERT INTO model_registry (id, name, provider, model_id, tier, endpoint_url, api_key, enabled, max_tokens, context_size, cost_per_1k, input_cost_per_mtok, output_cost_per_mtok, tool_cost_per_mtok, sort_order, max_retries, retry_window_minutes, max_concurrency, request_pause_ms, request_timeout, rate_limit_backoff_ms, no_think)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [id, model.name, model.provider, model.modelId, model.tier || 'medium',
         model.endpointUrl, model.apiKey, model.enabled ? 1 : 0, model.maxTokens,
         model.contextSize, model.costPer1k, model.inputCostPerMtok ?? 0, model.outputCostPerMtok ?? 0, model.toolCostPerMtok ?? 0,
         model.sortOrder, model.maxRetries ?? 3, model.retryWindowMinutes ?? 2, model.maxConcurrency ?? 1, model.requestPauseMs ?? 0, model.requestTimeout ?? 180, model.rateLimitBackoffMs ?? 120000, model.noThink ? 1 : 0]
    );
    await syncRegistryToConfig();
    return { id, ...model };
}

/**
 * Updates model_registry fields for a specific model and syncs the assignment cache.
 * Only updates columns for which a value is provided in `updates`. No-op if updates is empty.
 * @param id - Model registry UUID
 * @param updates - Partial RegisteredModel fields to update
 */
export async function updateRegisteredModel(id: string, updates: Partial<RegisteredModel>): Promise<void> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(updates.name); }
    if (updates.provider !== undefined) { setClauses.push(`provider = $${idx++}`); params.push(updates.provider); }
    if (updates.modelId !== undefined) { setClauses.push(`model_id = $${idx++}`); params.push(updates.modelId); }
    if (updates.tier !== undefined) { setClauses.push(`tier = $${idx++}`); params.push(updates.tier); }
    if (updates.endpointUrl !== undefined) { setClauses.push(`endpoint_url = $${idx++}`); params.push(updates.endpointUrl); }
    if (updates.apiKey !== undefined) { setClauses.push(`api_key = $${idx++}`); params.push(updates.apiKey); }
    if (updates.enabled !== undefined) { setClauses.push(`enabled = $${idx++}`); params.push(updates.enabled ? 1 : 0); }
    if (updates.maxTokens !== undefined) { setClauses.push(`max_tokens = $${idx++}`); params.push(updates.maxTokens); }
    if (updates.contextSize !== undefined) { setClauses.push(`context_size = $${idx++}`); params.push(updates.contextSize); }
    if (updates.costPer1k !== undefined) { setClauses.push(`cost_per_1k = $${idx++}`); params.push(updates.costPer1k); }
    if (updates.inputCostPerMtok !== undefined) { setClauses.push(`input_cost_per_mtok = $${idx++}`); params.push(updates.inputCostPerMtok); }
    if (updates.outputCostPerMtok !== undefined) { setClauses.push(`output_cost_per_mtok = $${idx++}`); params.push(updates.outputCostPerMtok); }
    if (updates.toolCostPerMtok !== undefined) { setClauses.push(`tool_cost_per_mtok = $${idx++}`); params.push(updates.toolCostPerMtok); }
    if (updates.sortOrder !== undefined) { setClauses.push(`sort_order = $${idx++}`); params.push(updates.sortOrder); }
    if (updates.maxRetries !== undefined) { setClauses.push(`max_retries = $${idx++}`); params.push(updates.maxRetries); }
    if (updates.retryWindowMinutes !== undefined) { setClauses.push(`retry_window_minutes = $${idx++}`); params.push(updates.retryWindowMinutes); }
    if (updates.maxConcurrency !== undefined) { setClauses.push(`max_concurrency = $${idx++}`); params.push(updates.maxConcurrency); }
    if (updates.requestPauseMs !== undefined) { setClauses.push(`request_pause_ms = $${idx++}`); params.push(updates.requestPauseMs); }
    if (updates.requestTimeout !== undefined) { setClauses.push(`request_timeout = $${idx++}`); params.push(updates.requestTimeout); }
    if (updates.rateLimitBackoffMs !== undefined) { setClauses.push(`rate_limit_backoff_ms = $${idx++}`); params.push(updates.rateLimitBackoffMs); }
    if (updates.supportsTools !== undefined) { setClauses.push(`supports_tools = $${idx++}`); params.push(updates.supportsTools === null ? null : updates.supportsTools ? 1 : 0); }
    if (updates.noThink !== undefined) { setClauses.push(`no_think = $${idx++}`); params.push(updates.noThink ? 1 : 0); }

    if (setClauses.length === 0) return;

    setClauses.push(`updated_at = datetime('now')`);
    params.push(id);

    await query(`UPDATE model_registry SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);
    await syncRegistryToConfig();
}

/**
 * Clears subsystem assignments referencing the model (both system baseline and project overrides),
 * then deletes it from model_registry. Syncs the assignment cache after deletion.
 * @param id - Model registry UUID to delete
 */
export async function deleteRegisteredModel(id: string): Promise<void> {
    // Clear from system baseline
    await query(`UPDATE subsystem_assignments SET model_id = NULL, updated_at = datetime('now') WHERE model_id = $1`, [id]);
    // Clear from project overrides (table may not exist in older DBs)
    try {
        await projectQuery(`UPDATE project_assignments SET model_id = NULL, updated_at = datetime('now') WHERE model_id = $1`, [id]);
        await projectQuery(`UPDATE project_assignments SET consultant_model_id = NULL, updated_at = datetime('now') WHERE consultant_model_id = $1`, [id]);
    } catch { /* project_assignments may not exist yet */ }
    await query(`DELETE FROM model_registry WHERE id = $1`, [id]);
    await syncRegistryToConfig();
}

// =============================================================================
// CONTEXT SIZE AUTO-DETECTION
// =============================================================================

/**
 * Detects context size from provider API (Ollama/LM Studio) and persists to registry.
 * Only supported for 'local' (Ollama) and 'lmstudio' providers. OpenAI/Anthropic return null.
 * @param model - The registered model to detect context size for
 * @returns The detected context size in tokens, or null if detection failed/unsupported
 */
export async function detectContextSize(model: RegisteredModel): Promise<number | null> {
    const provider = model.provider;
    const endpoint = model.endpointUrl || resolveProviderEndpoint(provider);

    // Only attempt detection for providers whose APIs expose context size
    let detectFn: ((modelId: string, endpoint: string) => Promise<number | null>) | null = null;
    if (provider === 'local') detectFn = detectOllamaContextSize;
    else if (provider === 'lmstudio') detectFn = detectLMStudioContextSize;
    // openai, anthropic don't expose context size in their model listing APIs
    if (!detectFn) return null;

    try {
        const detected = await detectFn(model.modelId, endpoint);

        if (detected && detected > 0) {
            // Persist to registry so we don't detect again
            await updateRegisteredModel(model.id, { contextSize: detected });
            console.log(`[models] Auto-detected context size for ${model.name}: ${detected}`);
            return detected;
        }
    } catch (err: any) {
        console.warn(`[models] Context size detection failed for ${model.name}: ${err.message}`);
    }
    return null;
}

/**
 * Detect context size from LM Studio native /api/v0/models endpoint.
 * Looks for `max_context_length` on the matching model entry.
 * @param modelId - The model ID to look up
 * @param endpoint - The LM Studio base endpoint URL
 * @returns Context size in tokens, or null if not found
 */
async function detectLMStudioContextSize(modelId: string, endpoint: string): Promise<number | null> {
    const baseUrl = endpoint.replace(/\/v\d+\/?$/, '').replace(/\/+$/, '');
    const modelsUrl = `${baseUrl}/api/v0/models`;

    const response = await fetch(modelsUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const data: any = await response.json();
    const models = data.data || [];
    const match = models.find((m: any) => m.id === modelId);
    if (!match) return null;

    // LM Studio v0 API exposes max_context_length per model
    return typeof match.max_context_length === 'number' ? match.max_context_length : null;
}

/**
 * Detect context size from Ollama /api/show endpoint.
 * Checks model_info for architecture-prefixed context_length keys (e.g. "llama.context_length"),
 * then falls back to parsing num_ctx from the parameters string.
 * @param modelId - The Ollama model name
 * @param endpoint - The Ollama base endpoint URL
 * @returns Context size in tokens, or null if not found
 */
async function detectOllamaContextSize(modelId: string, endpoint: string): Promise<number | null> {
    // Ollama endpoint may be /v1 (OpenAI compat) or the raw base — normalize to raw base
    const baseUrl = endpoint.replace(/\/v\d+\/?$/, '').replace(/\/+$/, '');
    const showUrl = `${baseUrl}/api/show`;

    const response = await fetch(showUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId }),
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data: any = await response.json();

    // model_info contains architecture-prefixed keys like "llama.context_length", "qwen2.context_length"
    if (data.model_info) {
        for (const [key, value] of Object.entries(data.model_info)) {
            if (key.endsWith('.context_length') && typeof value === 'number') {
                return value;
            }
        }
    }

    // parameters string may contain "num_ctx NNNN"
    if (typeof data.parameters === 'string') {
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) return parseInt(match[1], 10);
    }

    return null;
}

// =============================================================================
// REGISTRY SYNC
// =============================================================================

/**
 * Sync the model registry — refresh the assignment cache.
 * Called after every registry mutation.
 */
async function syncRegistryToConfig(): Promise<void> {
    try {
        await loadAssignmentCache();
        const models = await getRegisteredModels();
        const enabled = models.filter(m => m.enabled).length;
        console.error(`[models] Registry synced: ${enabled} enabled model(s)`);
    } catch (err: any) {
        console.error(`[models] Failed to sync registry:`, err.message);
    }
}

/**
 * Auto-import env-var models into registry on first boot (if registry is empty).
 * Reads SMALL_MODEL_ONE/TWO/THREE and TIER2_MODEL_ONE/TWO from environment.
 * If registry already has models, just syncs and returns.
 */
export async function autoImportToRegistry(): Promise<void> {
    try {
        const countRow = await queryOne('SELECT COUNT(*) as count FROM model_registry');
        if (countRow && countRow.count > 0) {
            // Registry already has models — sync and return
            await syncRegistryToConfig();
            return;
        }

        // Import models from env vars
        const envModels = [
            process.env.SMALL_MODEL_ONE,
            process.env.SMALL_MODEL_TWO,
            process.env.SMALL_MODEL_THREE,
            process.env.TIER2_MODEL_ONE,
            process.env.TIER2_MODEL_TWO,
        ].filter((m): m is string => !!(m?.trim()));

        const defaultProvider = getApiKey('openai') ? 'openai' : 'lmstudio';

        for (let i = 0; i < envModels.length; i++) {
            const name = envModels[i].trim();
            const id = generateUuid();
            await query(
                `INSERT INTO model_registry (id, name, provider, model_id, sort_order)
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, name, defaultProvider, name, i]
            );
        }

        if (envModels.length > 0) {
            console.error(`[models] Auto-imported ${envModels.length} model(s) into registry`);
        }

        await syncRegistryToConfig();
    } catch (err: any) {
        console.error(`[models] Auto-import failed (non-critical):`, err.message);
    }
}
