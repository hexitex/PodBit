/**
 * Experiment Spec Extractor — the ONE auditable bias surface.
 *
 * Extracts an experiment specification from a knowledge claim.
 * This is the only place where narrative content is interpreted.
 * Everything downstream operates on structured experiment descriptions.
 *
 * Claims that cannot be reduced to experiments are honestly
 * tagged as 'not_reducible' — no fake verification.
 *
 * @module evm/spec-extractor
 */

import { callSubsystemModel } from '../models/assignments.js';
import { getPrompt } from '../prompts.js';
import type { ExperimentSpec } from '../lab/types.js';

export interface ExtractionResult {
    /** Whether an experiment spec could be extracted */
    reducible: boolean;
    /** The experiment spec (only when reducible) */
    spec?: ExperimentSpec;
    /** Why extraction failed (only when not reducible) */
    reason?: string;
    /** Claim classification regardless of reducibility */
    claimType: string;
}

const EXTRACTION_SCHEMA = {
    name: 'spec_extraction',
    schema: {
        type: 'object',
        properties: {
            reducible: { type: 'boolean' },
            reason: { type: 'string' },
            claimType: { type: 'string' },
            specType: { type: 'string' },
            hypothesis: { type: 'string' },
            setup: { type: 'object' },
        },
        required: ['reducible', 'claimType'],
    },
};

/**
 * Extract an experiment specification from a claim.
 *
 * The LLM sees the claim HERE and ONLY here. Downstream stages
 * (lab execution, Podbit evaluation) never see the narrative.
 */
export async function extractExperimentSpec(
    nodeId: string,
    resolvedClaim: string,
    resolvedParents: string[],
    domain: string,
    hints?: { guidance?: string; precisionHint?: number; priorRejections?: string; priorLabErrors?: string },
): Promise<ExtractionResult> {
    const parentContext = resolvedParents.length > 0
        ? `SOURCE CONTEXT:\n${resolvedParents.map((p, i) => `Source ${i + 1}: ${p}`).join('\n')}\n`
        : '';
    const guidance = hints?.guidance ? `GUIDANCE: ${hints.guidance}\n` : '';
    const precisionNote = hints?.precisionHint
        ? `\nPRECISION: Use at least ${hints.precisionHint} decimal places for numerical computations.`
        : '';
    const priorRejectionsNote = hints?.priorRejections
        ? `\nPRIOR REJECTIONS — This claim was previously assessed as NOT REDUCIBLE for these reasons:\n${hints.priorRejections}\nThese rejections were correct. Do NOT override them by constructing a simplified proxy model. If the fundamental limitation still applies, return reducible: false again.\n`
        : '';
    const priorLabErrorsNote = hints?.priorLabErrors
        ? `\nPRIOR LAB ERRORS — Previous specs for this claim were extracted but the lab could not run them. Common causes: requested helper functions that don't exist in the lab's library; used setup parameters the lab couldn't translate to code; asked for grid sizes / dimensions that exceed the lab's performance limits; produced setup keys the codegen LLM mis-spelled and then referenced. Recent failures:\n${hints.priorLabErrors}\nProduce a DIFFERENT spec this time — keep the same testable mechanism but change the parameterization, the setup keys, or the observable so the codegen LLM has a fresh surface to work with. Prefer simpler, smaller setups (smaller grids, fewer sweep points, more standard variable names). Do NOT just resubmit the same shape of spec.\n`
        : '';

    // Build authoritative spec type registry from structured data (capabilities + DB).
    // Context prompts are supplementary descriptions only — never the source for specType names.
    let availableSpecTypes: string[] = [];
    let labDescriptionBlock = '';
    try {
        const { listLabs } = await import('../lab/registry.js');
        const labs = await listLabs({ enabled: true });

        // 1. Build the authoritative specType table from structured data
        const specTypeTable: string[] = [];
        const labDescriptions: string[] = [];

        for (const lab of labs) {
            const caps = lab.capabilities;
            const capsSpecTypes = caps?.specTypes && !Array.isArray(caps.specTypes)
                ? caps.specTypes as Record<string, string>
                : null;

            // Collect spec type names from DB column (synced from capabilities by health checker)
            for (const t of (lab.specTypes || [])) {
                if (!availableSpecTypes.includes(t)) {
                    availableSpecTypes.push(t);
                    const desc = capsSpecTypes?.[t] || '';
                    specTypeTable.push(`- "${t}" (${lab.name})${desc ? ': ' + desc : ''}`);
                }
            }

            // Supplementary lab description (context prompt or generated summary)
            if (lab.contextPrompt) {
                labDescriptions.push(`### ${lab.name}\n${lab.contextPrompt}`);
            } else if (caps?.description) {
                labDescriptions.push(`### ${lab.name}\n${caps.description}`);
            }
        }

        if (specTypeTable.length > 0) {
            labDescriptionBlock = '\n\nAVAILABLE SPEC TYPES (you MUST use one of these exact strings as specType):\n' +
                specTypeTable.join('\n') +
                (labDescriptions.length > 0
                    ? '\n\nLAB DETAILS:\n' + labDescriptions.join('\n\n')
                    : '') +
                '\n\nIf the claim cannot be tested by ANY spec type above, set reducible to false with claimType "no_lab".';
        }
    } catch { /* fallback to no constraint */ }

    const prompt = await getPrompt('evm.spec_extraction', {
        domain,
        claim: resolvedClaim,
        parentContext,
        guidance,
        labContext: labDescriptionBlock.trim(),
        precisionNote: (precisionNote + priorRejectionsNote + priorLabErrorsNote).trim(),
    });

    const raw = await callSubsystemModel('spec_extraction', prompt, {
        jsonSchema: EXTRACTION_SCHEMA,
        temperature: 0.1,
    });

    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
        }
        if (!parsed) {
            return { reducible: false, reason: 'Failed to parse extraction response', claimType: 'not_testable' };
        }
    }

    if (!parsed.reducible) {
        return {
            reducible: false,
            reason: parsed.reason || 'Claim not reducible to experiment',
            claimType: parsed.claimType || 'not_testable',
        };
    }

    // Validate specType against available labs
    const specType = parsed.specType;
    if (!specType) {
        return {
            reducible: false,
            reason: 'Spec extraction returned no specType — LLM did not select a lab experiment type',
            claimType: parsed.claimType || 'not_testable',
        };
    }
    if (availableSpecTypes.length > 0 && !availableSpecTypes.includes(specType)) {
        return {
            reducible: false,
            reason: `Claim is testable but spec type "${specType}" has no registered lab (available: ${availableSpecTypes.join(', ')})`,
            claimType: parsed.claimType || 'no_lab',
        };
    }

    // ─── Empty setup guard ──────────────────────────────────────────
    // The extraction LLM sometimes returns reducible:true with an empty
    // setup object. Catch this early instead of wasting an LLM call on
    // falsifiability review (which will reject it anyway).
    if (!parsed.setup || Object.keys(parsed.setup).length === 0) {
        return {
            reducible: false,
            reason: 'Extraction returned reducible:true but setup was empty — LLM failed to generate experiment parameters',
            claimType: parsed.claimType || 'extraction_failure',
        };
    }

    // ─── Structural check (warning only) ────────────────────────────
    // Log if the spec contains embedded code, but don't reject — the lab
    // codegen can handle it, and rejecting here blocks too many valid specs.
    const tautologyReason = detectEmbeddedCode(parsed.setup);
    if (tautologyReason) {
        console.warn(`[spec-extractor] Structural warning for ${nodeId.slice(0, 8)}: ${tautologyReason}`);
    }

    // ─── Falsifiability review (adversarial LLM check) ─────────────
    // A second LLM reviews whether the setup parameters are cherry-picked
    // to guarantee the claimed result. Catches specs that are technically
    // declarative but adversarially parameterized.
    const falsifiabilityReason = await reviewFalsifiability(
        parsed.hypothesis || resolvedClaim.slice(0, 200),
        parsed.setup,
        specType,
    );
    if (falsifiabilityReason) {
        return {
            reducible: false,
            reason: `Spec rejected (falsifiability review): ${falsifiabilityReason}`,
            claimType: parsed.claimType || 'tautological',
        };
    }

    const spec: ExperimentSpec = {
        specType,
        hypothesis: parsed.hypothesis || resolvedClaim.slice(0, 200),
        setup: parsed.setup || {},
        nodeId,
        claimType: parsed.claimType || 'unknown',
        hints: hints?.precisionHint ? { precision: hints.precisionHint } : undefined,
    };

    return {
        reducible: true,
        spec,
        claimType: parsed.claimType,
    };
}

// =============================================================================
// STRUCTURAL TAUTOLOGY DETECTION
// =============================================================================

/**
 * Detect if a spec setup contains embedded code that models the claimed
 * behavior rather than providing declarative experiment parameters.
 *
 * Legitimate specs describe WHAT to test (parameters, ranges, measurements).
 * Tautological specs define HOW to compute the answer — usually via a
 * Python function that encodes the hypothesis as arithmetic.
 *
 * @returns A reason string if the spec is suspicious, or null if clean.
 */
function detectEmbeddedCode(setup: any): string | null {
    if (!setup || typeof setup !== 'object') return null;

    const json = JSON.stringify(setup);

    // Check for Python/JS function definitions in any setup field.
    // Matches: "def func_name(", "function func_name(", "lambda "
    // These indicate the extractor wrote experiment code instead of
    // describing parameters for the lab's codegen to implement.
    if (/\bdef\s+\w+\s*\(/.test(json)) {
        return 'Setup contains a Python function definition (def ...). ' +
            'The spec should describe experiment parameters, not implement the computation. ' +
            'The lab codegen writes the code — the spec extractor must not.';
    }

    if (/\bfunction\s+\w+\s*\(/.test(json)) {
        return 'Setup contains a JavaScript function definition. ' +
            'Specs must be declarative parameter descriptions, not executable code.';
    }

    // Check for inline computation blocks: multi-line code with assignments,
    // loops, or return statements embedded in string values.
    // A single-line formula like "x^2 + 1" is fine; a multi-statement block is not.
    const codeBlockPattern = /(?:import\s+\w|for\s+\w+\s+in\s|while\s*\(|return\s+\w)/;
    const fieldValues = extractStringValues(setup);
    for (const val of fieldValues) {
        // Only flag multi-line strings with code patterns (not brief formulas)
        if (val.includes('\n') && codeBlockPattern.test(val)) {
            return 'Setup contains multi-line executable code. ' +
                'Specs should provide parameters and formulas, not full implementations.';
        }
    }

    return null;
}

/** Recursively extract all string values from a nested object. */
function extractStringValues(obj: any): string[] {
    const values: string[] = [];
    if (typeof obj === 'string') {
        values.push(obj);
    } else if (Array.isArray(obj)) {
        for (const item of obj) values.push(...extractStringValues(item));
    } else if (obj && typeof obj === 'object') {
        for (const val of Object.values(obj)) values.push(...extractStringValues(val));
    }
    return values;
}

// =============================================================================
// FALSIFIABILITY REVIEW (adversarial LLM check)
// =============================================================================

const REVIEW_SCHEMA = {
    name: 'spec_review',
    schema: {
        type: 'object',
        properties: {
            falsifiable: { type: 'boolean' },
            confidence: { type: 'number' },
            reasoning: { type: 'string' },
            red_flags: { type: 'array', items: { type: 'string' } },
        },
        required: ['falsifiable', 'confidence', 'reasoning'],
    },
};

/**
 * Adversarial falsifiability review. A second LLM judges whether a spec's
 * setup parameters are cherry-picked to guarantee the claimed result.
 *
 * Skipped (returns null) when:
 *  - Config toggle is off (`labVerify.specReview.enabled`)
 *  - No model is assigned to the `spec_review` subsystem
 *  - The review LLM call fails (non-fatal — we don't block on infra issues)
 *
 * @returns A reason string if the spec is rigged, or null if it passes (or review is skipped).
 */
async function reviewFalsifiability(
    hypothesis: string,
    setup: any,
    specType: string,
): Promise<string | null> {
    // Check config toggle
    try {
        const { config } = await import('../config.js');
        if (!config.labVerify?.specReview?.enabled) return null;
    } catch { return null; }

    // Check subsystem assignment — skip gracefully if unassigned
    try {
        const { getAssignedModel } = await import('../models/assignments.js');
        const assigned = getAssignedModel('spec_review');
        if (!assigned) return null;
    } catch { return null; }

    try {
        const { getPrompt } = await import('../prompts.js');
        const prompt = await getPrompt('evm.spec_review', {
            hypothesis,
            setup: JSON.stringify(setup, null, 2),
            specType,
        });

        const raw = await callSubsystemModel('spec_review', prompt, {
            jsonSchema: REVIEW_SCHEMA,
            temperature: 0.2,
        });

        let result: any;
        try {
            result = JSON.parse(raw);
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                try { result = JSON.parse(match[0]); } catch { return null; }
            }
            if (!result) return null;
        }

        // If the reviewer says it's falsifiable, pass through
        if (result.falsifiable) return null;

        // Check confidence against threshold
        const { config } = await import('../config.js');
        const minConfidence = config.labVerify?.specReview?.minConfidence ?? 0.95;
        const confidence = result.confidence ?? 0;

        if (confidence < minConfidence) return null; // Not confident enough to reject

        const flags = result.red_flags?.length
            ? ` Red flags: ${result.red_flags.join('; ')}`
            : '';
        return `${result.reasoning}${flags} (confidence: ${confidence.toFixed(2)})`;
    } catch {
        // Non-fatal — don't block verification on review infra failure
        return null;
    }
}
