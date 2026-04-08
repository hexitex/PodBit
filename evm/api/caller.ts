/**
 * API Verification Caller — generic HTTP client for external APIs.
 *
 * Features:
 * - Auth injection (none, API key, bearer token)
 * - Per-API token-bucket rate limiting (separate from model semaphore)
 * - Timeout via AbortController
 * - Response truncation to maxResponseBytes
 * - Error classification
 */

import type { ApiRegistryEntry, ApiQuery } from './types.js';

// =============================================================================
// RATE LIMITER — per-API token bucket
// =============================================================================

interface RateLimiterState {
    tokens: number;
    maxTokens: number;
    refillRateMs: number;   // ms between token refills
    lastRefill: number;
    concurrent: number;
    maxConcurrent: number;
    queue: Array<() => void>;
}

const limiters = new Map<string, RateLimiterState>();

/** Per-API rate limiter state (tokens, concurrency, queue); created on first use. */
function getLimiter(api: ApiRegistryEntry): RateLimiterState {
    let state = limiters.get(api.id);
    if (!state) {
        const refillRateMs = api.maxRpm > 0 ? (60000 / api.maxRpm) : 0;
        state = {
            tokens: api.maxRpm > 0 ? Math.min(api.maxRpm, 5) : Infinity,  // burst up to 5
            maxTokens: api.maxRpm > 0 ? Math.min(api.maxRpm, 5) : Infinity,
            refillRateMs,
            lastRefill: Date.now(),
            concurrent: 0,
            maxConcurrent: api.maxConcurrent || 1,
            queue: [],
        };
        limiters.set(api.id, state);
    }
    return state;
}

/** Refills rate-limit tokens based on elapsed time since last refill. */
function refillTokens(state: RateLimiterState): void {
    if (state.refillRateMs <= 0) return;
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const newTokens = Math.floor(elapsed / state.refillRateMs);
    if (newTokens > 0) {
        state.tokens = Math.min(state.maxTokens, state.tokens + newTokens);
        state.lastRefill = now;
    }
}

/** Waits for a concurrency slot and rate-limit token; returns a release callback. */
async function acquireSlot(api: ApiRegistryEntry): Promise<() => void> {
    const state = getLimiter(api);

    // Wait for concurrency slot
    while (state.concurrent >= state.maxConcurrent) {
        await new Promise<void>(resolve => state.queue.push(resolve));
    }
    state.concurrent++;

    // Wait for rate limit token
    refillTokens(state);
    while (state.tokens <= 0 && state.refillRateMs > 0) {
        const waitMs = state.refillRateMs - (Date.now() - state.lastRefill);
        if (waitMs > 0) await new Promise<void>(r => setTimeout(r, waitMs));
        refillTokens(state);
    }
    if (state.tokens !== Infinity) state.tokens--;

    // Return release function
    return () => {
        state.concurrent--;
        if (state.queue.length > 0) {
            const next = state.queue.shift()!;
            next();
        }
    };
}

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

export type ApiErrorKind = 'timeout' | 'rate_limited' | 'auth_failure' | 'server_error' | 'client_error' | 'network_error';

/**
 * Maps HTTP status and error to a stable error kind for retry/feedback logic.
 *
 * @param status - HTTP status code (may be undefined for network errors)
 * @param error - JavaScript Error object (checked for AbortError/TimeoutError)
 * @returns Classified error kind
 */
export function classifyError(status?: number, error?: Error): ApiErrorKind {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
    if (!status) return 'network_error';
    if (status === 429) return 'rate_limited';
    if (status === 401 || status === 403) return 'auth_failure';
    if (status >= 500) return 'server_error';
    if (status >= 400) return 'client_error';
    return 'network_error';
}

// =============================================================================
// HTTP CALLER
// =============================================================================

export interface ApiCallResult {
    status: number;
    body: string;
    responseTimeMs: number;
    truncated: boolean;
}

/**
 * Make an HTTP call to an external API with auth injection, per-API rate
 * limiting, timeout via AbortController, and response truncation.
 *
 * @param api - API registry entry with connection and auth config
 * @param apiQuery - Formulated HTTP request (method, url, body, headers)
 * @returns ApiCallResult with status, body, timing, and truncation flag
 */
export async function callApi(
    api: ApiRegistryEntry,
    apiQuery: ApiQuery,
): Promise<ApiCallResult> {
    const release = await acquireSlot(api);

    try {
        // Build headers
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            ...(apiQuery.headers ?? {}),
        };

        // Auth injection
        if (api.authType === 'api_key' && api.authKey) {
            const headerName = api.authHeader || 'X-Api-Key';
            headers[headerName] = api.authKey;
        } else if (api.authType === 'bearer' && api.authKey) {
            headers['Authorization'] = `Bearer ${api.authKey}`;
        }

        if (apiQuery.method === 'POST' && apiQuery.body) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        // Timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), api.timeoutMs);

        const startTime = Date.now();

        const response = await fetch(apiQuery.url, {
            method: apiQuery.method,
            headers,
            body: apiQuery.method === 'POST' ? apiQuery.body : undefined,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseTimeMs = Date.now() - startTime;

        // Read response with size limit
        let body: string;
        let truncated = false;

        if (api.maxResponseBytes > 0) {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > api.maxResponseBytes) {
                body = new TextDecoder().decode(buffer.slice(0, api.maxResponseBytes));
                truncated = true;
            } else {
                body = new TextDecoder().decode(buffer);
            }
        } else {
            body = await response.text();
        }

        return {
            status: response.status,
            body,
            responseTimeMs,
            truncated,
        };
    } finally {
        release();
    }
}

/**
 * Clear rate limiter state for an API (e.g., after config change).
 * Next call will re-create the limiter with fresh token bucket state.
 *
 * @param apiId - UUID of the API whose limiter to reset
 */
export function resetRateLimiter(apiId: string): void {
    limiters.delete(apiId);
}
