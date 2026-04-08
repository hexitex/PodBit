/**
 * API Decision Engine — decides which external APIs (if any) to call for a node.
 *
 * Given resolved content, available APIs, and variable context,
 * determines whether any API call would add value.
 */

import { callSubsystemModel } from '../../models/assignments.js';
import { getPrompt } from '../../prompts.js';
import type { ApiRegistryEntry, ApiDecision, DecisionMode, VarContext } from './types.js';

/**
 * Decide which APIs (if any) to call for a given claim.
 * Builds a prompt with API descriptions and variable context, calls the
 * api_verification subsystem, validates the response, and reconciles
 * each decision's mode against the API's configured mode.
 *
 * @param nodeContent - Resolved node content to evaluate
 * @param domain - Node's domain for context
 * @param enabledApis - List of enabled API registry entries
 * @param varContext - Number variable context for the node
 * @returns Array of validated ApiDecision objects (empty = no APIs relevant)
 */
export async function decideApis(
    nodeContent: string,
    domain: string,
    enabledApis: ApiRegistryEntry[],
    varContext: VarContext[],
): Promise<ApiDecision[]> {
    if (enabledApis.length === 0) return [];

    // Build API descriptions for the prompt
    const apiDescriptions = enabledApis.map(api => {
        const caps = api.capabilities ? api.capabilities.join(', ') : 'general';
        const doms = api.domains ? api.domains.join(', ') : 'any';
        const mode = api.mode || 'verify';
        return `- id: "${api.id}", name: "${api.name}" (${api.displayName})\n  Capabilities: ${caps}\n  Applicable domains: ${doms}\n  Mode: ${mode}\n  Description: ${api.description || 'No description'}`;
    }).join('\n');

    // Build variable context description
    const varDesc = varContext.length > 0
        ? varContext.map(v => `- ${v.varId} = ${v.value} (domain: ${v.domain}, context: "${v.scopeText}")`).join('\n')
        : 'No number variables in this claim.';

    const prompt = await getPrompt('api.decision', {
        nodeContent,
        domain,
        availableApis: apiDescriptions,
        variableContext: varDesc,
    });

    const response = await callSubsystemModel('api_verification', prompt, {});

    // Parse JSON array response
    try {
        const trimmed = response.trim();
        // Handle markdown-fenced JSON
        const jsonStr = trimmed.startsWith('```')
            ? trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
            : trimmed;

        const decisions: ApiDecision[] = JSON.parse(jsonStr);
        if (!Array.isArray(decisions)) return [];

        // Build a lookup of each API's configured mode
        const apiModeMap = new Map(enabledApis.map(a => [a.id, a.mode || 'verify']));

        // Validate and filter
        return decisions
            .filter(d => d.apiId && d.apiName && d.confidence > 0)
            .map(d => {
                // Validate recommended mode against API's configured mode
                const apiMode = apiModeMap.get(d.apiId) || 'verify';
                let mode: DecisionMode = (['verify', 'enrich', 'both'].includes(d.mode) ? d.mode : 'verify') as DecisionMode;
                // Can't enrich with a verify-only API, and vice versa
                if (mode === 'enrich' && apiMode === 'verify') mode = 'verify';
                if (mode === 'verify' && apiMode === 'enrich') mode = 'enrich';
                if (mode === 'both' && apiMode === 'verify') mode = 'verify';
                if (mode === 'both' && apiMode === 'enrich') mode = 'enrich';

                return {
                    apiId: d.apiId,
                    apiName: d.apiName,
                    reason: d.reason || '',
                    confidence: Math.max(0, Math.min(1, d.confidence)),
                    relevantVarIds: Array.isArray(d.relevantVarIds) ? d.relevantVarIds : [],
                    mode,
                };
            });
    } catch {
        // LLM returned non-parseable response — no APIs selected
        return [];
    }
}
