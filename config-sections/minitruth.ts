/**
 * @module config-sections/minitruth
 *
 * Config section metadata for Minitruth — the LLM reviewer in the birth
 * pipeline that decides whether voiced synthesis should enter the graph
 * (accept), be re-voiced with feedback (rework), or discarded (reject).
 */

import type { SectionMeta } from './types.js';

/** Minitruth config section definition. */
export const MINITRUTH_SECTIONS: Record<string, SectionMeta> = {

    minitruth: {
        id: 'minitruth',
        tier: 'basic',
        title: 'Minitruth',
        description: 'LLM reviewer in the birth pipeline — evaluates each synthesis before it enters the graph',
        behavior: 'After mechanical checks (dedup, specificity, junk filter) pass, a manifest-armed LLM reviewer evaluates the synthesis on three criteria: does the connection make sense, does it say something beyond restating parents, and does it belong in the project context. Returns accept (enters graph), rework (re-voice with specific feedback, up to maxReworkAttempts), or reject (discard). Errors fail open — if the call fails, the node proceeds.',
        parameters: [
            {
                key: 'mtEnabled',
                label: 'Enabled',
                description: 'Enable minitruth in the birth pipeline. When disabled, all voiced synthesis that passes mechanical checks enters the graph without LLM judgment.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['minitruth', 'enabled'],
            },
            {
                key: 'mtMaxReworkAttempts',
                label: 'Max Rework Attempts',
                description: 'Maximum number of rework iterations when minitruth returns "rework". Each rework re-voices the synthesis with feedback injected into the prompt. Set to 0 to disable rework entirely (accept or reject only).',
                min: 0, max: 3, step: 1, default: 1,
                configPath: ['minitruth', 'maxReworkAttempts'],
            },
        ],
        presets: [
            { label: 'Strict', intent: 'Enable minitruth with 2 rework attempts for maximum quality control.' },
            { label: 'Permissive', intent: 'Disable minitruth to allow all mechanically-valid synthesis through.' },
            { label: 'Default', intent: 'Enable minitruth with 1 rework attempt.' },
        ],
    },
};
