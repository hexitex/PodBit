/**
 * API Enrichment Extraction — parses API responses into discrete facts
 * and creates new knowledge nodes in the graph.
 *
 * Pipeline: API response → LLM extraction → handlePropose() per fact
 */

import { callSubsystemModel } from '../../models/assignments.js';
import { getPrompt } from '../../prompts.js';
import { config as appConfig } from '../../config.js';
import { emitActivity } from '../../services/event-bus.js';
import { queryOne, query } from '../../core.js';
import type { ApiRegistryEntry, ApiDecision, EnrichmentFact, EnrichmentResult } from './types.js';

// =============================================================================
// EXTRACTION — parse API response into discrete facts
// =============================================================================

/**
 * Extract discrete facts from an API response using the per-API extraction prompt.
 *
 * @param api - The API that was called
 * @param decision - The decision that triggered this call
 * @param nodeContent - The original node's resolved content (context for extraction)
 * @param apiResponse - Raw API response body
 * @param domain - The source node's domain (enrichment nodes inherit this)
 * @returns Array of extracted facts (not yet created as nodes)
 */
export async function extractEnrichments(
    api: ApiRegistryEntry,
    decision: ApiDecision,
    nodeContent: string,
    apiResponse: string,
    domain: string,
): Promise<EnrichmentFact[]> {
    const systemPrompt = await getPrompt('api.extract_system', {});

    const extractPrompt = await getPrompt('api.extract', {
        nodeContent,
        apiName: api.displayName || api.name,
        apiResponse: apiResponse.slice(0, 8000),
        perApiPrompt: api.promptExtract
            || 'No API-specific extraction guide. Extract standalone factual claims.',
        domain,
        decisionReason: decision.reason,
    });

    const fullPrompt = `${systemPrompt}\n\n${extractPrompt}`;
    const response = await callSubsystemModel('api_verification', fullPrompt, {});

    // Parse JSON array response
    const trimmed = response.trim();
    const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
        : trimmed;

    try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .filter((f: any) => f.content && typeof f.content === 'string' && f.content.trim().length > 10)
            .map((f: any) => ({
                content: String(f.content).trim(),
                confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
                category: String(f.category || 'general'),
                source: String(f.source || ''),
            }));
    } catch {
        return [];
    }
}

// =============================================================================
// NODE CREATION — create graph nodes from extracted facts
// =============================================================================

/**
 * Create graph nodes from extracted enrichment facts.
 *
 * Uses handlePropose() for the full pipeline: dedup, embedding, junk filter,
 * number variable extraction, integrity hashing, edge creation.
 *
 * @param facts - Extracted facts from extractEnrichments()
 * @param sourceNodeId - The node that triggered the API call (becomes parent)
 * @param apiName - API name for contributor tag
 * @param domain - Domain for the new nodes
 * @returns EnrichmentResult with created node IDs
 */
export async function createEnrichmentNodes(
    facts: EnrichmentFact[],
    sourceNodeId: string,
    apiName: string,
    domain: string,
): Promise<EnrichmentResult> {
    const cfg = appConfig.labVerify.apiVerification;
    const maxNodes = cfg.enrichmentMaxNodesPerCall;
    const minConfidence = cfg.enrichmentMinConfidence;
    const initialWeight = cfg.enrichmentInitialWeight;

    const result: EnrichmentResult = {
        facts: [],
        nodeIds: [],
        skipped: 0,
        errors: [],
        mode: 'children',
    };

    // Filter by confidence and cap count
    const qualifying = facts
        .filter(f => f.confidence >= minConfidence)
        .slice(0, maxNodes);

    result.skipped = facts.length - qualifying.length;
    result.facts = qualifying;

    for (const fact of qualifying) {
        try {
            const { handlePropose } = await import('../../handlers/graph.js');
            const propResult = await handlePropose({
                content: fact.content,
                nodeType: 'seed',
                domain,
                parentIds: [sourceNodeId],
                contributor: `api-enrichment:${apiName}`,
                weight: initialWeight,
            });

            if (propResult.success && propResult.node) {
                result.nodeIds.push(propResult.node.id);
            } else if (propResult.rejected) {
                result.skipped++;
                result.errors.push(`Fact rejected: ${propResult.reason || 'unknown'}`);
            }
        } catch (err: any) {
            result.errors.push(`Node creation failed: ${err.message}`);
        }
    }

    if (result.nodeIds.length > 0) {
        emitActivity('api', 'api_enrichment_complete',
            `API enrichment from ${apiName}: ${result.nodeIds.length} nodes created, ${result.skipped} skipped`,
            {
                apiName,
                sourceNodeId,
                nodesCreated: result.nodeIds.length,
                skipped: result.skipped,
                domain,
            },
        );
    }

    return result;
}

// =============================================================================
// INLINE ENRICHMENT — append facts to the source node's content
// =============================================================================

/**
 * Append API-verified facts inline to the source node's content.
 * Preserves synthesis context by keeping enrichment in the same node
 * rather than creating context-orphan children.
 *
 * Falls back to createEnrichmentNodes() if the combined content would
 * exceed enrichmentMaxContentWords.
 *
 * @param facts - Extracted facts from extractEnrichments()
 * @param sourceNodeId - The node to enrich
 * @param apiName - API name for attribution tags
 * @param domain - Node's domain
 * @returns EnrichmentResult with mode='inline' or 'children' on fallback
 */
export async function appendEnrichmentToNode(
    facts: EnrichmentFact[],
    sourceNodeId: string,
    apiName: string,
    domain: string,
): Promise<EnrichmentResult> {
    const cfg = appConfig.labVerify.apiVerification;
    const maxWords = cfg.enrichmentMaxContentWords;
    const minConfidence = cfg.enrichmentMinConfidence;

    const result: EnrichmentResult = {
        facts: [],
        nodeIds: [],
        skipped: 0,
        errors: [],
        mode: 'inline',
    };

    // Filter by confidence
    const qualifying = facts.filter(f => f.confidence >= minConfidence);
    result.skipped = facts.length - qualifying.length;
    result.facts = qualifying;

    if (qualifying.length === 0) return result;

    // Fetch current node content
    const node: any = await queryOne(
        'SELECT id, content, domain FROM nodes WHERE id = $1 AND archived = 0',
        [sourceNodeId],
    );
    if (!node) {
        result.errors.push('Source node not found or archived');
        return result;
    }

    // Build enrichment block with parseable attribution tags
    const enrichmentLines = qualifying.map(f =>
        `[API-verified via ${apiName}]: ${f.content}`
    );
    const enrichmentBlock = '\n\n' + enrichmentLines.join('\n');
    const combinedContent = node.content + enrichmentBlock;

    // Word count check — fallback to children mode if too long
    const wordCount = combinedContent.trim().split(/\s+/).length;
    if (wordCount > maxWords) {
        emitActivity('api', 'api_enrichment_fallback',
            `Inline enrichment for ${sourceNodeId.slice(0, 8)} would exceed ${maxWords} words (${wordCount}) — falling back to children mode`,
            { sourceNodeId, wordCount, maxWords, apiName },
        );
        return createEnrichmentNodes(qualifying, sourceNodeId, apiName, domain);
    }

    // Edit the node in-place (bypasses word validation since enrichment can exceed 200 words)
    try {
        const { editNodeContent } = await import('../../core.js');
        await editNodeContent(
            sourceNodeId,
            combinedContent,
            `api-enrichment:${apiName}`,
            `Inline enrichment: ${qualifying.length} facts from ${apiName}`,
            { skipWordValidation: true },
        );
    } catch (err: any) {
        result.errors.push(`Inline edit failed: ${err.message}`);
        // Fallback to children mode
        return createEnrichmentNodes(qualifying, sourceNodeId, apiName, domain);
    }

    // Re-extract number variables on the enriched content.
    // editNodeContent does NOT re-extract variables — enrichment introduces
    // new raw numbers from API responses that need domain-scoped variable refs.
    try {
        if (appConfig.numberVariables?.enabled) {
            const { registerNodeVariables } = await import('../../core/number-variables.js');

            // Clear old variable refs for this node
            await query('DELETE FROM node_number_refs WHERE node_id = $1', [sourceNodeId]);

            // Re-register variables on the combined content
            const varResult = await registerNodeVariables(
                sourceNodeId, combinedContent, domain,
            );
            if (varResult.varIds.length > 0) {
                // Store the annotated content (with [[[VAR]]] refs)
                await query(
                    'UPDATE nodes SET content = $1 WHERE id = $2',
                    [varResult.annotatedContent, sourceNodeId],
                );
            }
        }
    } catch (err: any) {
        // Non-fatal — numbers just won't be variable-extracted
        result.errors.push(`Variable re-extraction warning: ${err.message}`);
    }

    result.inlineWordCount = wordCount;

    emitActivity('api', 'api_enrichment_inline',
        `Inline enrichment to ${sourceNodeId.slice(0, 8)} from ${apiName}: ${qualifying.length} facts appended (${wordCount} words)`,
        {
            apiName,
            sourceNodeId,
            factsAppended: qualifying.length,
            skipped: result.skipped,
            domain,
            wordCount,
        },
    );

    return result;
}
