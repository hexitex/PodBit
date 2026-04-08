/**
 * MCP Handler for the API Verification Registry.
 *
 * Action-based dispatch: list, get, create, update, delete, enable, disable,
 * onboard, test, stats, history, prompt_history, refresh_prompts
 */

import {
    listApis, getApi, createApi, updateApi, deleteApi,
    setApiEnabled, getPromptHistory,
} from '../evm/api/registry.js';
import { handleOnboard } from '../evm/api/onboard.js';
import { callApi } from '../evm/api/caller.js';
import { getApiVerificationStats, getNodeApiVerifications } from '../evm/api/audit.js';

/**
 * Dispatch API verification registry actions.
 *
 * Manages external API registrations used by the EVM for empirical verification.
 * Supports CRUD operations, enable/disable toggling, onboarding interviews,
 * test calls, verification statistics, and prompt history.
 *
 * @param params - Object with `action` (required) plus action-specific fields:
 *   `id` for get/update/delete/enable/disable/prompt_history,
 *   `name`/`baseUrl` for create, `nodeId` for history, `url`/`method` for test.
 * @returns Action-specific result, or `{ error }`.
 */
export async function handleApiRegistry(params: Record<string, any>): Promise<any> {
    const { action } = params;

    switch (action) {
        // ===== CRUD =====
        case 'list':
            return { apis: await listApis() };

        case 'get': {
            if (!params.id) return { error: 'id is required' };
            const api = await getApi(params.id);
            if (!api) return { error: `API not found: ${params.id}` };
            return api;
        }

        case 'create': {
            if (!params.name) return { error: 'name is required' };
            if (!params.baseUrl) return { error: 'baseUrl is required' };
            try {
                const api = await createApi({
                    name: params.name,
                    displayName: params.displayName || params.name,
                    description: params.description,
                    baseUrl: params.baseUrl,
                    authType: params.authType,
                    authKey: params.authKey,
                    authHeader: params.authHeader,
                    maxRpm: params.maxRpm,
                    maxConcurrent: params.maxConcurrent,
                    timeoutMs: params.timeoutMs,
                    promptQuery: params.promptQuery,
                    promptInterpret: params.promptInterpret,
                    responseFormat: params.responseFormat,
                    maxResponseBytes: params.maxResponseBytes,
                    capabilities: params.capabilities,
                    domains: params.domains,
                });
                return { created: true, api };
            } catch (err: any) {
                return { error: err.message };
            }
        }

        case 'update': {
            if (!params.id) return { error: 'id is required' };
            const updated = await updateApi(params.id, params);
            if (!updated) return { error: `API not found: ${params.id}` };
            return { updated: true, api: updated };
        }

        case 'delete': {
            if (!params.id) return { error: 'id is required' };
            const deleted = await deleteApi(params.id);
            if (!deleted) return { error: `API not found: ${params.id}` };
            return { deleted: true };
        }

        // ===== ENABLE / DISABLE =====
        case 'enable': {
            if (!params.id) return { error: 'id is required' };
            const ok = await setApiEnabled(params.id, true);
            return ok ? { enabled: true } : { error: `API not found: ${params.id}` };
        }

        case 'disable': {
            if (!params.id) return { error: 'id is required' };
            const ok = await setApiEnabled(params.id, false);
            return ok ? { disabled: true } : { error: `API not found: ${params.id}` };
        }

        // ===== ONBOARDING INTERVIEW =====
        case 'onboard':
            return handleOnboard({
                name: params.name,
                interviewId: params.interviewId,
                response: params.response,
            });

        // ===== TEST CALL =====
        case 'test': {
            if (!params.id && !params.url) return { error: 'id or url is required' };

            let api;
            if (params.id) {
                api = await getApi(params.id);
                if (!api) return { error: `API not found: ${params.id}` };
            }

            const testUrl = params.url || (api ? `${api.baseUrl}` : '');
            if (!testUrl) return { error: 'No URL to test' };

            try {
                const result = await callApi(
                    api || {
                        id: 'test', name: 'test', displayName: 'Test', description: null,
                        enabled: true, baseUrl: testUrl, testUrl: null, authType: 'none' as const,
                        authKey: null, authHeader: null, maxRpm: 5, maxConcurrent: 1,
                        timeoutMs: 15000, mode: 'verify' as const, promptQuery: null,
                        promptInterpret: null, promptExtract: null,
                        promptNotes: null, responseFormat: 'json' as const,
                        maxResponseBytes: 65536, capabilities: null, domains: null,
                        testCases: null, onboardedAt: null, onboardedBy: null,
                        totalCalls: 0, totalErrors: 0, createdAt: '', updatedAt: '',
                    },
                    { method: params.method || 'GET', url: testUrl },
                );
                return {
                    status: result.status,
                    responseTimeMs: result.responseTimeMs,
                    truncated: result.truncated,
                    bodyPreview: result.body.slice(0, 500),
                    bodyLength: result.body.length,
                };
            } catch (err: any) {
                return { error: `Test call failed: ${err.message}` };
            }
        }

        // ===== STATS =====
        case 'stats':
            return getApiVerificationStats(params.days ?? 7);

        // ===== HISTORY =====
        case 'history': {
            if (!params.nodeId) return { error: 'nodeId is required' };
            return { verifications: await getNodeApiVerifications(params.nodeId) };
        }

        // ===== PROMPT HISTORY =====
        case 'prompt_history': {
            if (!params.id) return { error: 'id is required (api id)' };
            return { history: await getPromptHistory(params.id, params.promptField) };
        }

        default:
            return { error: `Unknown action: ${action}. Valid: list, get, create, update, delete, enable, disable, onboard, test, stats, history, prompt_history` };
    }
}
