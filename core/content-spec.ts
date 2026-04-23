/**
 * Content spec extraction — post-generation structural coherence gate.
 *
 * After a synthesis or research-cycle produces prose, an LLM extracts a
 * four-field structured spec (mechanism / prediction / falsifiability /
 * novelty). Degenerate outputs (empty fields, hollow placeholders) can be
 * rejected at birth. Valid specs persist on the node as metadata and mark
 * the node "pre-specced" so the lab-stage falsifiability review can be
 * skipped for it.
 *
 * Gated entirely by `config.contentSpec.enabled`. Birthing and research
 * integrations also check their own sub-toggles.
 *
 * @module core/content-spec
 */

import { callSubsystemModel } from '../models.js';
import { getPrompt } from '../prompts.js';
import { config as appConfig } from '../config.js';

/**
 * Extracted content spec. Empty strings indicate degenerate fields — the
 * LLM could not fill them from the prose without inventing content.
 */
export interface ContentSpec {
    mechanism: string;
    prediction: string;
    falsifiability: string;
    novelty: string;
    /** True when the spec meets `config.contentSpec.minValidFields` non-empty
     *  fields and none are obviously degenerate placeholders. */
    valid: boolean;
    /** Which fields came back empty — useful for debug / activity logs. */
    emptyFields: string[];
    /** Extraction timestamp (ISO 8601). */
    extractedAt: string;
    /** "synthesis" or "research" — which prompt was used. */
    source: 'synthesis' | 'research';
}

/**
 * Parse a raw LLM JSON response into a ContentSpec. Returns null if the
 * payload is malformed beyond repair.
 */
function parseContentSpecResponse(raw: string): Pick<ContentSpec, 'mechanism' | 'prediction' | 'falsifiability' | 'novelty'> | null {
    if (!raw) return null;
    // Strip markdown fences if the LLM ignored the "no fences" instruction
    let text = raw.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    // Find first { … matching }
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }
    if (end < 0) return null;
    try {
        const obj = JSON.parse(text.slice(start, end + 1));
        return {
            mechanism: typeof obj.mechanism === 'string' ? obj.mechanism.trim() : '',
            prediction: typeof obj.prediction === 'string' ? obj.prediction.trim() : '',
            falsifiability: typeof obj.falsifiability === 'string' ? obj.falsifiability.trim() : '',
            novelty: typeof obj.novelty === 'string' ? obj.novelty.trim() : '',
        };
    } catch {
        return null;
    }
}

/**
 * Detect obviously-degenerate filler that shouldn't count as a real field.
 * Kept conservative — the prompt is already instructed to emit empty strings
 * for vague cases. This is a second-line defence against fluent stalling.
 */
function isDegenerateField(value: string): boolean {
    if (!value) return true;
    const v = value.trim().toLowerCase();
    if (v.length < 8) return true;
    if (/^(n\/?a|none|empty|unknown|tbd|pending)$/.test(v)) return true;
    if (/^(further|additional|future) research/.test(v)) return true;
    if (/^(it|this|they) (would|could|might|may)/.test(v) && v.length < 40) return true;
    return false;
}

function countValid(fields: Pick<ContentSpec, 'mechanism' | 'prediction' | 'falsifiability' | 'novelty'>): { valid: number; empty: string[] } {
    const empty: string[] = [];
    for (const key of ['mechanism', 'prediction', 'falsifiability', 'novelty'] as const) {
        if (isDegenerateField(fields[key])) empty.push(key);
    }
    return { valid: 4 - empty.length, empty };
}

/**
 * Extract a content spec from a synthesis birth output.
 *
 * @param content - The synthesized prose (already voiced, final text)
 * @param parents - Parent node contents used to build the synthesis (for
 *                  novelty / counterfactual-style checks inside the prompt)
 * @param opts    - Optional signal for abortion
 * @returns A ContentSpec, or null when the feature is disabled or the LLM
 *          call fails. Null means "no verdict" — callers should not treat
 *          null as a rejection.
 */
export async function extractContentSpecFromSynthesis(
    content: string,
    parents: string[],
    opts?: { signal?: AbortSignal },
): Promise<ContentSpec | null> {
    if (!appConfig.contentSpec?.enabled) return null;

    try {
        const parentBlock = parents.length > 0
            ? parents.map((p, i) => `Parent ${i + 1}: ${p}`).join('\n\n')
            : '(no parent context available)';
        const prompt = await getPrompt('core.content_spec_synthesis', {
            content: content.slice(0, 4000),
            parents: parentBlock.slice(0, 4000),
        });
        const raw = await callSubsystemModel('content_spec', prompt, { signal: opts?.signal });
        const parsed = parseContentSpecResponse(raw);
        if (!parsed) return null;

        const { valid, empty } = countValid(parsed);
        const minValid = appConfig.contentSpec?.minValidFields ?? 3;
        return {
            ...parsed,
            valid: valid >= minValid,
            emptyFields: empty,
            extractedAt: new Date().toISOString(),
            source: 'synthesis',
        };
    } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        console.warn(`[content-spec] Extraction failed (synthesis): ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Extract a content spec from a research-cycle fact.
 *
 * @param content - The generated fact text
 * @param domain  - The project-specific domain label (passed into the prompt)
 * @param opts    - Optional signal for abortion
 */
export async function extractContentSpecFromResearch(
    content: string,
    domain: string,
    opts?: { signal?: AbortSignal },
): Promise<ContentSpec | null> {
    if (!appConfig.contentSpec?.enabled) return null;

    try {
        const prompt = await getPrompt('core.content_spec_research', {
            content: content.slice(0, 4000),
            domain: domain || 'unknown',
        });
        const raw = await callSubsystemModel('content_spec', prompt, { signal: opts?.signal });
        const parsed = parseContentSpecResponse(raw);
        if (!parsed) return null;

        const { valid, empty } = countValid(parsed);
        const minValid = appConfig.contentSpec?.minValidFields ?? 3;
        return {
            ...parsed,
            valid: valid >= minValid,
            emptyFields: empty,
            extractedAt: new Date().toISOString(),
            source: 'research',
        };
    } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        console.warn(`[content-spec] Extraction failed (research): ${err?.message ?? err}`);
        return null;
    }
}

/**
 * Synthesis-birth gate. Extracts a content spec from voiced prose and
 * decides whether to reject the birth or attach the spec as metadata.
 *
 * Returns an object you can plug into the `createNode` options:
 *   { rejected: true, reason }  — abort the birth
 *   { rejected: false, metadataMerge } — spread metadataMerge into options
 *
 * Respects config.contentSpec.enabled and config.contentSpec.birthEnabled.
 * When the feature is off, returns `{ rejected: false, metadataMerge: {} }`
 * so call sites stay side-effect-free.
 */
export async function gateSynthesisBirth(
    voicedContent: string,
    parentContents: string[],
    opts?: { signal?: AbortSignal },
): Promise<{ rejected: boolean; reason?: string; metadataMerge: Record<string, any>; spec: ContentSpec | null }> {
    if (!appConfig.contentSpec?.enabled || !appConfig.contentSpec?.birthEnabled) {
        return { rejected: false, metadataMerge: {}, spec: null };
    }
    const spec = await extractContentSpecFromSynthesis(voicedContent, parentContents, opts);
    if (!spec) return { rejected: false, metadataMerge: {}, spec: null };

    if (!spec.valid) {
        return {
            rejected: true,
            reason: `content_spec degenerate (missing: ${spec.emptyFields.join(', ')})`,
            metadataMerge: {},
            spec,
        };
    }
    return {
        rejected: false,
        metadataMerge: { metadata: { contentSpec: spec } },
        spec,
    };
}

/**
 * Research-seed gate. Mirror of gateSynthesisBirth for research-cycle facts.
 * Respects config.contentSpec.enabled and config.contentSpec.researchEnabled.
 */
export async function gateResearchSeed(
    factContent: string,
    domain: string,
    opts?: { signal?: AbortSignal },
): Promise<{ rejected: boolean; reason?: string; metadataMerge: Record<string, any>; spec: ContentSpec | null }> {
    if (!appConfig.contentSpec?.enabled || !appConfig.contentSpec?.researchEnabled) {
        return { rejected: false, metadataMerge: {}, spec: null };
    }
    const spec = await extractContentSpecFromResearch(factContent, domain, opts);
    if (!spec) return { rejected: false, metadataMerge: {}, spec: null };

    if (!spec.valid) {
        return {
            rejected: true,
            reason: `content_spec degenerate (missing: ${spec.emptyFields.join(', ')})`,
            metadataMerge: {},
            spec,
        };
    }
    return {
        rejected: false,
        metadataMerge: { metadata: { contentSpec: spec } },
        spec,
    };
}

/**
 * Read a stored content spec from a node's metadata JSON. Used by the lab
 * stage to detect pre-specced nodes.
 *
 * @param metadata - The node's metadata column (raw JSON string or parsed object or null)
 * @returns The stored ContentSpec, or null if missing/malformed.
 */
export function readContentSpecFromMetadata(metadata: any): ContentSpec | null {
    if (!metadata) return null;
    let obj: any = metadata;
    if (typeof metadata === 'string') {
        try { obj = JSON.parse(metadata); } catch { return null; }
    }
    const cs = obj?.contentSpec;
    if (!cs || typeof cs !== 'object') return null;
    if (typeof cs.mechanism !== 'string') return null;
    return {
        mechanism: cs.mechanism ?? '',
        prediction: cs.prediction ?? '',
        falsifiability: cs.falsifiability ?? '',
        novelty: cs.novelty ?? '',
        valid: !!cs.valid,
        emptyFields: Array.isArray(cs.emptyFields) ? cs.emptyFields : [],
        extractedAt: cs.extractedAt ?? '',
        source: cs.source === 'research' ? 'research' : 'synthesis',
    };
}
