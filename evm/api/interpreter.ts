/**
 * API Result Interpreter — reads API responses and classifies verification impact.
 *
 * Three outcomes:
 * - value_correction: number is wrong, fix placeholder
 * - structural_validation: entities/citations confirmed real
 * - structural_refutation: fabricated entity, impossible reaction, fake citation
 */

import { callSubsystemModel } from '../../models/assignments.js';
import { getPrompt } from '../../prompts.js';
import type { ApiRegistryEntry, ApiDecision, ApiInterpretation, VarContext, VerificationImpact } from './types.js';

const VALID_IMPACTS: VerificationImpact[] = ['value_correction', 'structural_validation', 'structural_refutation', 'inconclusive'];

/**
 * Interpret an API response against the original claim.
 * Uses the per-API interpretation prompt to classify the result as one of
 * four impacts: value_correction, structural_validation, structural_refutation,
 * or inconclusive. Extracts value corrections for the number registry.
 *
 * @param api - API registry entry with optional promptInterpret
 * @param decision - Decision that triggered this API call (for relevant var filtering)
 * @param nodeContent - Resolved node content (the claim being verified)
 * @param apiResponse - Raw API response body (truncated to 8000 chars for prompt budget)
 * @param varContext - Number variable context for correction identification
 * @returns ApiInterpretation with impact, corrections, evidence summary, and confidence
 */
export async function interpretResult(
    api: ApiRegistryEntry,
    decision: ApiDecision,
    nodeContent: string,
    apiResponse: string,
    varContext: VarContext[],
): Promise<ApiInterpretation> {
    // Build variable context description
    const varDesc = varContext
        .filter(v => decision.relevantVarIds.length === 0 || decision.relevantVarIds.includes(v.varId))
        .map(v => `${v.varId} = ${v.value} (context: "${v.scopeText}")`)
        .join('\n') || 'No specific number variables.';

    // System prompt sets the three-outcome framework
    const systemPrompt = await getPrompt('api.interpreter_system', {});

    // Main interpretation prompt — includes per-API interpretation guide
    const interpretPrompt = await getPrompt('api.interpret', {
        nodeContent,
        apiName: api.displayName || api.name,
        apiResponse: apiResponse.slice(0, 8000),  // truncate for prompt budget
        variableContext: varDesc,
        perApiPrompt: api.promptInterpret || 'No API-specific interpretation guide available. Use your best judgment based on the response format.',
    });

    const fullPrompt = `${systemPrompt}\n\n${interpretPrompt}`;

    const response = await callSubsystemModel('api_verification', fullPrompt, {});

    // Parse JSON response
    const trimmed = response.trim();
    const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
        : trimmed;

    try {
        const parsed = JSON.parse(jsonStr);

        // Validate impact — default to inconclusive when the API can't determine outcome.
        // Previously defaulted to structural_validation which gave unearned weight boosts.
        const impact: VerificationImpact = VALID_IMPACTS.includes(parsed.impact)
            ? parsed.impact
            : 'inconclusive';

        // Validate corrections
        const corrections = Array.isArray(parsed.corrections)
            ? parsed.corrections.map((c: any) => ({
                varId: String(c.varId || ''),
                oldValue: String(c.oldValue || ''),
                newValue: String(c.newValue || ''),
                confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
                source: String(c.source || ''),
            }))
            : [];

        return {
            impact,
            corrections,
            evidenceSummary: String(parsed.evidenceSummary || ''),
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        };
    } catch {
        // LLM returned non-parseable response — genuinely inconclusive
        return {
            impact: 'inconclusive',
            corrections: [],
            evidenceSummary: 'Failed to parse interpreter response.',
            confidence: 0,
        };
    }
}
