/**
 * API Verification Pipeline Orchestrator
 *
 * Main entry point called from the EVM pipeline. Runs BEFORE Python execution.
 *
 * Pipeline: Decision → Query → Call → Interpret → Correct → [EVM continues]
 */

import { config as appConfig } from '../../config.js';
import { emitActivity } from '../../services/event-bus.js';
import { resolveContent, getNodeVariables } from '../../core/number-variables.js';
import { getEnabledApis, getApi, recordApiCall } from './registry.js';
import { decideApis } from './decision.js';
import { formulateQuery } from './query-formulator.js';
import { callApi, classifyError } from './caller.js';
import { interpretResult } from './interpreter.js';
import { applyCorrections, applyVerificationImpact } from './corrections.js';
import { recordApiVerification } from './audit.js';
import type {
    ApiPipelineResult,
    ApiVerificationResult,
    ApiDecision,
    VarContext,
    VerificationImpact,
} from './types.js';

// =============================================================================
// IMPACT PRIORITY — worst-case wins
// =============================================================================

const IMPACT_PRIORITY: Record<VerificationImpact, number> = {
    structural_refutation: 3,
    value_correction: 2,
    structural_validation: 1,
    inconclusive: 0,
};

/**
 * Returns the higher-priority impact. Priority order:
 * structural_refutation (3) > value_correction (2) > structural_validation (1) > inconclusive (0).
 *
 * @param a - Current worst impact (null on first call)
 * @param b - New impact to compare
 * @returns The higher-priority impact
 */
function worstImpact(a: VerificationImpact | null, b: VerificationImpact): VerificationImpact {
    if (!a) return b;
    return IMPACT_PRIORITY[a] >= IMPACT_PRIORITY[b] ? a : b;
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

/**
 * Run the full API verification pipeline for a node.
 *
 * Five stages executed sequentially:
 * 1. **Decision** — LLM selects which enabled APIs to call and in what mode (verify/enrich/both)
 * 2. **Query formulation** — LLM constructs the API request (URL, params) from node content
 * 3. **API call** — HTTP fetch with rate-limit handling and error classification
 * 4. **Interpretation** — LLM compares API response against node claims, producing an impact verdict
 * 5. **Correction/Enrichment** — value corrections update the number_registry; enrichment
 *    creates child seed nodes or appends inline facts; verification impact adjusts node weight
 *
 * Side effects: writes to `number_registry` (value corrections), `nodes` (enrichment nodes,
 * weight/breedable changes via {@link applyVerificationImpact}), `api_verifications` (audit trail).
 *
 * @param nodeId - The node being verified
 * @param rawContent - Node content with placeholders (e.g., [[[SBKR42]]])
 * @param domain - Node's domain
 * @returns Pipeline result with corrections applied and resolved content
 */
export async function runApiVerification(
    nodeId: string,
    rawContent: string,
    domain: string,
): Promise<ApiPipelineResult> {
    const cfg = appConfig.labVerify.apiVerification;

    // 1. Get enabled APIs
    const enabledApis = await getEnabledApis();
    if (enabledApis.length === 0) {
        return {
            results: [],
            totalCorrections: 0,
            totalEnrichments: 0,
            enrichmentNodeIds: [],
            overallImpact: null,
            resolvedContent: await resolveContent(rawContent),
        };
    }

    // 2. Resolve content for LLM consumption (placeholders → values)
    const resolvedForLlm = await resolveContent(rawContent);

    // 3. Get variable context for this node
    const nodeVars = await getNodeVariables(nodeId);
    const varContext: VarContext[] = nodeVars.map((v: any) => ({
        varId: v.var_id,
        value: v.value,
        scopeText: v.scope_text,
        domain: v.domain,
    }));

    // 4. Decision engine: which APIs to call?
    let decisions: ApiDecision[];
    try {
        decisions = await decideApis(resolvedForLlm, domain, enabledApis, varContext);
    } catch (err: any) {
        emitActivity('api', 'api_decision_error',
            `Decision engine failed for ${nodeId.slice(0, 8)}: ${err.message}`,
            { nodeId, error: err.message });
        return {
            results: [],
            totalCorrections: 0,
            totalEnrichments: 0,
            enrichmentNodeIds: [],
            overallImpact: null,
            resolvedContent: resolvedForLlm,
        };
    }

    if (decisions.length === 0) {
        return {
            results: [],
            totalCorrections: 0,
            totalEnrichments: 0,
            enrichmentNodeIds: [],
            overallImpact: null,
            resolvedContent: resolvedForLlm,
        };
    }

    // 5. Cap the number of API calls
    const cappedDecisions = decisions.slice(0, cfg.maxApisPerNode);

    // 6. Execute each API call sequentially (respects rate limits)
    const results: ApiVerificationResult[] = [];
    let totalCorrections = 0;
    let overallImpact: VerificationImpact | null = null;

    for (const decision of cappedDecisions) {
        const api = await getApi(decision.apiId);
        if (!api || !api.enabled) {
            results.push({
                apiId: decision.apiId,
                apiName: decision.apiName,
                status: 'skipped',
                decision,
                correctionsApplied: 0,
                error: 'API not found or disabled',
            });
            continue;
        }

        const result: ApiVerificationResult = {
            apiId: api.id,
            apiName: api.name,
            status: 'success',
            decision,
            correctionsApplied: 0,
        };

        try {
            // 6a. Formulate query
            const apiQuery = await formulateQuery(api, decision, resolvedForLlm, varContext);
            result.query = apiQuery;

            emitActivity('api', 'api_call_start',
                `Querying ${api.displayName || api.name} for ${nodeId.slice(0, 8)} (${decision.mode || 'verify'}: ${decision.reason.slice(0, 80)})`,
                { nodeId, apiId: api.id, apiName: api.name, mode: decision.mode, url: apiQuery.url });

            // 6b. Call API
            const callResult = await callApi(api, apiQuery);
            result.rawResponse = callResult.body;
            result.responseStatus = callResult.status;
            result.responseTimeMs = callResult.responseTimeMs;

            await recordApiCall(api.id, callResult.status >= 200 && callResult.status < 300);

            if (callResult.status < 200 || callResult.status >= 300) {
                const errKind = classifyError(callResult.status);
                result.status = errKind === 'timeout' ? 'timeout' : 'api_error';
                result.error = `HTTP ${callResult.status}: ${errKind}`;

                emitActivity('api', 'api_call_error',
                    `${api.displayName || api.name} failed for ${nodeId.slice(0, 8)}: HTTP ${callResult.status} (${errKind})`,
                    { nodeId, apiId: api.id, apiName: api.name, httpStatus: callResult.status, error: errKind, responseTimeMs: callResult.responseTimeMs });

                await recordApiVerification(nodeId, result);
                results.push(result);
                continue;
            }

            // 6c. Interpret result (for 'verify' or 'both' mode)
            const decisionMode = decision.mode || 'verify';
            if (decisionMode === 'verify' || decisionMode === 'both') {
                const interpretation = await interpretResult(
                    api, decision, resolvedForLlm, callResult.body, varContext,
                );
                result.interpretation = interpretation;

                // Emit interpretation result so users can see what the API found
                const impactLabel = interpretation.impact === 'structural_refutation' ? 'REFUTED'
                    : interpretation.impact === 'value_correction' ? 'CORRECTED'
                    : 'VALIDATED';
                emitActivity('api', 'api_interpretation',
                    `${api.displayName || api.name} → ${impactLabel} (${(interpretation.confidence * 100).toFixed(0)}%): ${interpretation.evidenceSummary.slice(0, 120)}`,
                    { nodeId, apiId: api.id, apiName: api.name, impact: interpretation.impact, confidence: interpretation.confidence, evidence: interpretation.evidenceSummary, corrections: interpretation.corrections.length });

                // 6d. Apply corrections (for value_correction)
                if (interpretation.impact === 'value_correction' && interpretation.corrections.length > 0) {
                    const corrResult = await applyCorrections(
                        nodeId,
                        interpretation.corrections,
                        cfg.minCorrectionConfidence,
                    );
                    result.correctionsApplied = corrResult.applied;
                    totalCorrections += corrResult.applied;

                    if (corrResult.applied > 0) {
                        emitActivity('api', 'api_corrections_applied',
                            `${corrResult.applied} value correction(s) applied from ${api.displayName || api.name} for ${nodeId.slice(0, 8)}`,
                            { nodeId, apiId: api.id, apiName: api.name, applied: corrResult.applied, total: interpretation.corrections.length });
                    }
                }

                // Track worst-case impact
                overallImpact = worstImpact(overallImpact, interpretation.impact);
            }

            // 6e. Enrichment extraction (for 'enrich' or 'both' mode)
            if ((decisionMode === 'enrich' || decisionMode === 'both') && cfg.enrichmentEnabled) {
                try {
                    const { extractEnrichments, createEnrichmentNodes, appendEnrichmentToNode } =
                        await import('./enrichment.js');

                    const facts = await extractEnrichments(
                        api, decision, resolvedForLlm,
                        callResult.body, domain,
                    );

                    if (facts.length > 0) {
                        // Route enrichment based on config mode:
                        // 'inline' appends facts to source node (preserves synthesis context)
                        // 'children' creates child seed nodes (legacy behavior)
                        if (cfg.enrichmentMode === 'inline') {
                            result.enrichment = await appendEnrichmentToNode(
                                facts, nodeId, api.name, domain,
                            );
                        } else {
                            result.enrichment = await createEnrichmentNodes(
                                facts, nodeId, api.name, domain,
                            );
                        }
                    }
                } catch (err: any) {
                    emitActivity('api', 'api_enrichment_error',
                        `Enrichment extraction failed for ${api.name}: ${err.message}`,
                        { nodeId, apiId: api.id, error: err.message },
                    );
                }
            }

        } catch (err: any) {
            const errKind = classifyError(undefined, err);
            result.status = errKind === 'timeout' ? 'timeout' : 'api_error';
            result.error = err.message;
            await recordApiCall(api.id, false);

            emitActivity('api', 'api_call_error',
                `${api.displayName || api.name} error for ${nodeId.slice(0, 8)}: ${(err.message || '').slice(0, 120)}`,
                { nodeId, apiId: api.id, apiName: api.name, error: err.message, errorKind: errKind });
        }

        // Record audit trail
        await recordApiVerification(nodeId, result);
        results.push(result);
    }

    // 7. Apply fitness/breedable impact (once, based on worst-case outcome)
    if (overallImpact) {
        await applyVerificationImpact(nodeId, overallImpact, totalCorrections);
    }

    // 8. Re-resolve content with any corrections applied
    const finalContent = await resolveContent(rawContent);

    // Collect enrichment totals
    let totalEnrichments = 0;
    const enrichmentNodeIds: string[] = [];
    let _inlineEnrichments = 0;
    for (const r of results) {
        if (r.enrichment) {
            if (r.enrichment.mode === 'inline') {
                _inlineEnrichments += r.enrichment.facts.length;
                totalEnrichments += r.enrichment.facts.length;
            } else {
                totalEnrichments += r.enrichment.nodeIds.length;
                enrichmentNodeIds.push(...r.enrichment.nodeIds);
            }
        }
    }

    emitActivity('api', 'api_verification_complete',
        `API verification for ${nodeId.slice(0, 8)}: ${overallImpact || 'no_impact'}, ${totalCorrections} corrections, ${totalEnrichments} enrichments`,
        { nodeId, impact: overallImpact, corrections: totalCorrections, enrichments: totalEnrichments, apis: results.length });

    return {
        results,
        totalCorrections,
        totalEnrichments,
        enrichmentNodeIds,
        overallImpact,
        resolvedContent: finalContent,
    };
}
