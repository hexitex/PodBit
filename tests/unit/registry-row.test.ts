/**
 * Tests for models/registry.ts — rowToRegisteredModel (re-implemented).
 * Maps DB row (snake_case) to RegisteredModel (camelCase); provider alias ollama→local.
 */
import { describe, it, expect } from '@jest/globals';

const PROVIDER_ALIASES: Record<string, string> = { 'ollama': 'local' };
function normalizeProvider(p: string): string { return PROVIDER_ALIASES[p] || p; }

/** Convert registry table row to RegisteredModel; defaults for tier, retries, booleans. */
function rowToRegisteredModel(r: any) {
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

const baseRow = {
    id: 'row-id-1',
    name: 'GPT-4',
    provider: 'openai',
    model_id: 'gpt-4-turbo',
    tier: 'high',
    endpoint_url: 'https://api.openai.com/v1',
    api_key: 'sk-test',
    enabled: 1,
    max_tokens: 4096,
    context_size: 128000,
    cost_per_1k: 0.01,
    input_cost_per_mtok: 10,
    output_cost_per_mtok: 30,
    tool_cost_per_mtok: 10,
    sort_order: 1,
    max_retries: 5,
    retry_window_minutes: 3,
    max_concurrency: 4,
    request_pause_ms: 200,
    request_timeout: 120,
    rate_limit_backoff_ms: 60000,
    supports_tools: 1,
    no_think: 0,
};

describe('rowToRegisteredModel', () => {
    it('maps id and name', () => {
        const m = rowToRegisteredModel(baseRow);
        expect(m.id).toBe('row-id-1');
        expect(m.name).toBe('GPT-4');
    });

    it('normalizes provider aliases (ollama → local)', () => {
        const m = rowToRegisteredModel({ ...baseRow, provider: 'ollama' });
        expect(m.provider).toBe('local');
    });

    it('passes through known providers unchanged', () => {
        expect(rowToRegisteredModel({ ...baseRow, provider: 'openai' }).provider).toBe('openai');
        expect(rowToRegisteredModel({ ...baseRow, provider: 'anthropic' }).provider).toBe('anthropic');
    });

    it('maps model_id to modelId', () => {
        expect(rowToRegisteredModel(baseRow).modelId).toBe('gpt-4-turbo');
    });

    it('maps tier, defaults to medium', () => {
        expect(rowToRegisteredModel(baseRow).tier).toBe('high');
        expect(rowToRegisteredModel({ ...baseRow, tier: null }).tier).toBe('medium');
        expect(rowToRegisteredModel({ ...baseRow, tier: undefined }).tier).toBe('medium');
    });

    it('maps endpoint_url, null when empty', () => {
        expect(rowToRegisteredModel(baseRow).endpointUrl).toBe('https://api.openai.com/v1');
        expect(rowToRegisteredModel({ ...baseRow, endpoint_url: '' }).endpointUrl).toBeNull();
        expect(rowToRegisteredModel({ ...baseRow, endpoint_url: null }).endpointUrl).toBeNull();
    });

    it('maps api_key, null when empty', () => {
        expect(rowToRegisteredModel(baseRow).apiKey).toBe('sk-test');
        expect(rowToRegisteredModel({ ...baseRow, api_key: '' }).apiKey).toBeNull();
    });

    it('converts enabled integer to boolean', () => {
        expect(rowToRegisteredModel({ ...baseRow, enabled: 1 }).enabled).toBe(true);
        expect(rowToRegisteredModel({ ...baseRow, enabled: 0 }).enabled).toBe(false);
    });

    it('maps max_tokens, null when absent', () => {
        expect(rowToRegisteredModel(baseRow).maxTokens).toBe(4096);
        expect(rowToRegisteredModel({ ...baseRow, max_tokens: null }).maxTokens).toBeNull();
        expect(rowToRegisteredModel({ ...baseRow, max_tokens: undefined }).maxTokens).toBeNull();
    });

    it('maps context_size, null when absent', () => {
        expect(rowToRegisteredModel(baseRow).contextSize).toBe(128000);
        expect(rowToRegisteredModel({ ...baseRow, context_size: null }).contextSize).toBeNull();
    });

    it('maps cost fields, defaults to 0', () => {
        expect(rowToRegisteredModel(baseRow).costPer1k).toBe(0.01);
        expect(rowToRegisteredModel(baseRow).inputCostPerMtok).toBe(10);
        expect(rowToRegisteredModel(baseRow).outputCostPerMtok).toBe(30);
        expect(rowToRegisteredModel(baseRow).toolCostPerMtok).toBe(10);
        const m = rowToRegisteredModel({ ...baseRow, cost_per_1k: null, input_cost_per_mtok: null });
        expect(m.costPer1k).toBe(0);
        expect(m.inputCostPerMtok).toBe(0);
    });

    it('maps sort_order, defaults to 0', () => {
        expect(rowToRegisteredModel(baseRow).sortOrder).toBe(1);
        expect(rowToRegisteredModel({ ...baseRow, sort_order: null }).sortOrder).toBe(0);
    });

    it('maps retry settings with defaults', () => {
        expect(rowToRegisteredModel(baseRow).maxRetries).toBe(5);
        expect(rowToRegisteredModel(baseRow).retryWindowMinutes).toBe(3);
        expect(rowToRegisteredModel({ ...baseRow, max_retries: null }).maxRetries).toBe(3);
        expect(rowToRegisteredModel({ ...baseRow, retry_window_minutes: null }).retryWindowMinutes).toBe(2);
    });

    it('maps concurrency and timeout settings with defaults', () => {
        expect(rowToRegisteredModel(baseRow).maxConcurrency).toBe(4);
        expect(rowToRegisteredModel(baseRow).requestPauseMs).toBe(200);
        expect(rowToRegisteredModel(baseRow).requestTimeout).toBe(120);
        expect(rowToRegisteredModel(baseRow).rateLimitBackoffMs).toBe(60000);
        expect(rowToRegisteredModel({ ...baseRow, max_concurrency: null }).maxConcurrency).toBe(1);
        expect(rowToRegisteredModel({ ...baseRow, request_pause_ms: null }).requestPauseMs).toBe(0);
        expect(rowToRegisteredModel({ ...baseRow, request_timeout: null }).requestTimeout).toBe(180);
        expect(rowToRegisteredModel({ ...baseRow, rate_limit_backoff_ms: null }).rateLimitBackoffMs).toBe(120000);
    });

    it('maps supports_tools: 1 → true, 0 → false, null → null', () => {
        expect(rowToRegisteredModel({ ...baseRow, supports_tools: 1 }).supportsTools).toBe(true);
        expect(rowToRegisteredModel({ ...baseRow, supports_tools: 0 }).supportsTools).toBe(false);
        expect(rowToRegisteredModel({ ...baseRow, supports_tools: null }).supportsTools).toBeNull();
    });

    it('maps no_think to noThink boolean', () => {
        expect(rowToRegisteredModel({ ...baseRow, no_think: 0 }).noThink).toBe(false);
        expect(rowToRegisteredModel({ ...baseRow, no_think: 1 }).noThink).toBe(true);
    });

    it('sets thinkingLevel to null when no_think is 0', () => {
        expect(rowToRegisteredModel({ ...baseRow, no_think: 0 }).thinkingLevel).toBeNull();
    });

    it('sets thinkingLevel to "off" when no_think is 1', () => {
        expect(rowToRegisteredModel({ ...baseRow, no_think: 1 }).thinkingLevel).toBe('off');
    });
});
