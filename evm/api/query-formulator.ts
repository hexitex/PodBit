/**
 * API Query Formulator — turns a claim + API config into a concrete HTTP request.
 *
 * Uses the per-API `promptQuery` stored in the registry to build URLs/bodies.
 */

import { callSubsystemModel } from '../../models/assignments.js';
import type { ApiRegistryEntry, ApiDecision, ApiQuery, VarContext } from './types.js';

/**
 * Formulate an HTTP request for a specific API based on the decision context.
 * Uses the per-API `promptQuery` template combined with claim content and
 * relevant variable context to generate a concrete URL/method/body.
 *
 * @param api - API registry entry with required promptQuery template
 * @param decision - Decision that selected this API (provides reason and relevant var IDs)
 * @param nodeContent - Resolved node content (the claim being verified)
 * @param varContext - Number variable context for the node
 * @returns ApiQuery with method, url, optional body and headers
 * @throws Error if the API has no promptQuery configured
 */
export async function formulateQuery(
    api: ApiRegistryEntry,
    decision: ApiDecision,
    nodeContent: string,
    varContext: VarContext[],
): Promise<ApiQuery> {
    if (!api.promptQuery) {
        // No per-API query prompt — attempt to build a basic search URL
        throw new Error(`API "${api.name}" has no query formulation prompt. Run onboarding or set promptQuery manually.`);
    }

    // Build the prompt: per-API query template + claim context
    const varDesc = varContext
        .filter(v => decision.relevantVarIds.length === 0 || decision.relevantVarIds.includes(v.varId))
        .map(v => `${v.varId} = ${v.value} (context: "${v.scopeText}")`)
        .join('\n');

    const { getPrompt } = await import('../../prompts.js');
    const prompt = await getPrompt('api.query_formulation', {
        apiPromptQuery: api.promptQuery,
        nodeContent,
        varDesc: varDesc || 'No specific values identified.',
        decisionReason: decision.reason,
        baseUrl: api.baseUrl,
    });

    const response = await callSubsystemModel('api_verification', prompt, {});

    // Parse JSON response
    const trimmed = response.trim();
    const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
        : trimmed;

    const parsed = JSON.parse(jsonStr);

    return {
        method: parsed.method === 'POST' ? 'POST' : 'GET',
        url: parsed.url,
        body: parsed.body ?? undefined,
        headers: parsed.headers ?? undefined,
    };
}
