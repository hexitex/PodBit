/**
 * Lab Routing — LLM-based lab selection for experiment specs.
 *
 * When multiple labs support a given spec type, an LLM picks the best
 * one based on capabilities, queue depth, health status, and priority.
 * When only one lab matches, it's returned directly (no LLM call).
 *
 * @module lab/routing
 */

import { getLabsForSpecType, getLabWithLowestQueue } from './registry.js';
import type { ExperimentSpec, LabRegistryEntry } from './types.js';

/**
 * Route an experiment spec to the best available lab.
 *
 * @throws If no labs support the spec type
 */
export async function routeSpec(spec: ExperimentSpec): Promise<LabRegistryEntry> {
    const candidates = await getLabsForSpecType(spec.specType);

    if (candidates.length === 0) {
        throw new Error(`No lab available for specType "${spec.specType}". Register a lab that supports this type.`);
    }

    // Single candidate — no routing decision needed
    if (candidates.length === 1) {
        return candidates[0];
    }

    // Multiple candidates — try LLM routing
    try {
        const { config } = await import('../config.js');
        if (!(config.lab as any)?.routingEnabled) {
            // Routing disabled — fallback to priority + queue depth
            return (await getLabWithLowestQueue(spec.specType))!;
        }

        return await llmRoute(spec, candidates);
    } catch (err: any) {
        // LLM routing failed — fallback to mechanical selection
        console.error(`[lab-routing] LLM routing failed, using fallback: ${err.message}`);
        return (await getLabWithLowestQueue(spec.specType)) ?? candidates[0];
    }
}

/**
 * Use an LLM to pick the best lab from multiple candidates.
 */
async function llmRoute(spec: ExperimentSpec, candidates: LabRegistryEntry[]): Promise<LabRegistryEntry> {
    const { callSubsystemModel } = await import('../models/index.js');
    const { getPrompt } = await import('../prompts/api.js');

    const promptTemplate = await getPrompt('lab.routing');

    // Build lab list description
    const labList = candidates.map(lab =>
        `- **${lab.name}** (id: ${lab.id})\n` +
        `  URL: ${lab.url}\n` +
        `  Health: ${lab.healthStatus}\n` +
        `  Queue depth: ${lab.queueDepth}${lab.queueLimit ? `/${lab.queueLimit}` : ''}\n` +
        `  Priority: ${lab.priority}\n` +
        `  Spec types: ${lab.specTypes.join(', ')}\n` +
        `  Features: ${lab.capabilities?.features?.join(', ') || 'unknown'}`
    ).join('\n\n');

    // Build setup summary (first 200 chars of JSON)
    const setupSummary = JSON.stringify(spec.setup).slice(0, 200);

    // Fill template variables
    const prompt = promptTemplate
        .replace('{{specType}}', spec.specType)
        .replace('{{measurementCount}}', String(Object.keys(spec.setup).length))
        .replace('{{hypothesis}}', spec.hypothesis || 'N/A')
        .replace('{{setupSummary}}', setupSummary)
        .replace('{{labList}}', labList);

    const response = await callSubsystemModel('lab_routing', prompt, {
        responseFormat: { type: 'json_object' },
    });

    // Parse response
    let parsed: { labId: string; reasoning?: string };
    try {
        const text = typeof response === 'string' ? response : (response as any)?.content || '';
        parsed = JSON.parse(text);
    } catch {
        // Try extracting JSON from response
        const text = typeof response === 'string' ? response : (response as any)?.content || '';
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON in LLM routing response');
        parsed = JSON.parse(match[0]);
    }

    if (!parsed.labId) throw new Error('LLM routing response missing labId');

    // Validate the chosen lab is in our candidate list
    const chosen = candidates.find(c => c.id === parsed.labId);
    if (!chosen) {
        console.error(`[lab-routing] LLM chose invalid lab "${parsed.labId}", falling back`);
        return candidates[0];
    }

    return chosen;
}
