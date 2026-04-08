/**
 * @module prompts/elite
 *
 * Elite pool prompt definitions. Used for synthesizing insights from
 * EVM-verified (computationally validated) nodes and for bridging synthesis
 * between elite-tier knowledge. These produce richer, longer output than
 * standard voicing since the source material is high-confidence.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'elite';

/**
 * Elite pool prompts, keyed by prompt ID (e.g. `'elite.content_synthesis'`).
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose and behavior.
 */
export const ELITE_PROMPTS: Record<string, PromptDefinition> = {
    'elite.manifest_mapping': {
        id: 'elite.manifest_mapping',
        category: 'elite',
        description: 'Score relevance of a verified finding against project manifest targets (goals, questions, bridges)',
        variables: ['domain', 'content', 'targets'],
        content: loadTemplate(CAT, 'elite.manifest_mapping'),
    },

    'elite.bridging_synthesis': {
        id: 'elite.bridging_synthesis',
        category: 'elite',
        description: 'Synthesize a new insight from two elite (verified) nodes — richer output than regular voicing',
        variables: ['contentA', 'contentB', 'domainA', 'domainB'],
        content: loadTemplate(CAT, 'elite.bridging_synthesis'),
    },

    'elite.content_synthesis': {
        id: 'elite.content_synthesis',
        category: 'elite',
        description: 'Synthesize rich elite node content from EVM verification data, source claim, and computational output',
        variables: ['sourceContent', 'hypothesis', 'verificationCode', 'computationalOutput', 'confidence', 'claimType', 'domain'],
        content: loadTemplate(CAT, 'elite.content_synthesis'),
    },
};
