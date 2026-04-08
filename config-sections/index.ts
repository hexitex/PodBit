/**
 * @module config-sections
 *
 * Aggregates all config section metadata from category-specific modules and
 * merges GUI enrichments (category assignment, help text, search terms).
 * The resulting `SECTION_METADATA` record drives the entire config UI:
 * rendering, search, save, and preset application are all automatic based
 * on the metadata defined here.
 *
 * To add a new config section, create it in the appropriate category module,
 * add GUI enrichment in `gui-metadata.ts`, and it auto-appears in the UI.
 */

import type { SectionMeta } from './types.js';
export type { ParameterMeta, PresetDef, SectionTier, SectionMeta, ControlType, CategoryId } from './types.js';

import { SYNTHESIS_SECTIONS } from './synthesis.js';
import { SUBSYSTEM_PARAM_SECTIONS } from './subsystem-params.js';
import { CONSULTANT_PARAM_SECTIONS } from './consultant-params.js';
import { CYCLE_SECTIONS } from './cycles.js';
import { ADVANCED_SECTIONS } from './advanced.js';
import { FEATURE_SECTIONS } from './features.js';
import { TIER_QUALITY_GATE_SECTIONS } from './tier-quality-gates.js';
import { CONSULTANT_PIPELINE_SECTIONS } from './consultant-pipeline.js';
import { POPULATION_CONTROL_SECTIONS } from './population-control.js';
import { MINITRUTH_SECTIONS } from './minitruth.js';
import { EMBEDDING_EVAL_SECTIONS } from './embedding-eval.js';
import { LAB_SECTIONS } from './lab.js';
import { GUI_ENRICHMENTS } from './gui-metadata.js';

/** Raw section metadata before GUI enrichment is applied. */
const RAW_SECTIONS: Record<string, SectionMeta> = {
    ...SYNTHESIS_SECTIONS,
    ...SUBSYSTEM_PARAM_SECTIONS,
    ...CONSULTANT_PARAM_SECTIONS,
    ...CYCLE_SECTIONS,
    ...ADVANCED_SECTIONS,
    ...FEATURE_SECTIONS,
    ...TIER_QUALITY_GATE_SECTIONS,
    ...CONSULTANT_PIPELINE_SECTIONS,
    ...POPULATION_CONTROL_SECTIONS,
    ...MINITRUTH_SECTIONS,
    ...EMBEDDING_EVAL_SECTIONS,
    ...LAB_SECTIONS,
};

/**
 * Final section metadata with GUI enrichments merged in.
 * Sections without explicit enrichment default to category 'lifecycle'
 * so they still appear in the UI.
 */
export const SECTION_METADATA: Record<string, SectionMeta> = {};
for (const [id, section] of Object.entries(RAW_SECTIONS)) {
    const enrichment = GUI_ENRICHMENTS[id];
    SECTION_METADATA[id] = {
        ...section,
        category: enrichment?.category ?? 'lifecycle',
        helpText: enrichment?.helpText ?? undefined,
        searchTerms: enrichment?.searchTerms ?? undefined,
    };
}
