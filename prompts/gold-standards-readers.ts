/**
 * @module prompts/gold-standards-readers
 *
 * Knowledge Base reader gold standard responses for auto-tuning. Covers
 * `kb.*` reader prompts (text, code, document, data curation) at three
 * quality tiers (ideal, good, acceptable).
 */

import type { DefaultGoldStandard } from './gold-standards-core.js';
import { loadGoldStandard } from './loader.js';

const CAT = 'readers';

/**
 * Reader gold standard responses for `kb.*` curation prompts. Each entry is
 * a {@link DefaultGoldStandard} with a prompt ID, quality tier, and reference
 * content for auto-tune scoring.
 */
export const READER_GOLD_STANDARDS: DefaultGoldStandard[] = [
    { promptId: 'kb.curate_text', tier: 1, content: loadGoldStandard(CAT, 'kb.curate_text', 1) },
    { promptId: 'kb.curate_text', tier: 2, content: loadGoldStandard(CAT, 'kb.curate_text', 2) },
    { promptId: 'kb.curate_text', tier: 3, content: loadGoldStandard(CAT, 'kb.curate_text', 3) },
    { promptId: 'kb.curate_code', tier: 1, content: loadGoldStandard(CAT, 'kb.curate_code', 1) },
    { promptId: 'kb.curate_code', tier: 2, content: loadGoldStandard(CAT, 'kb.curate_code', 2) },
    { promptId: 'kb.curate_code', tier: 3, content: loadGoldStandard(CAT, 'kb.curate_code', 3) },
    { promptId: 'kb.curate_document', tier: 1, content: loadGoldStandard(CAT, 'kb.curate_document', 1) },
    { promptId: 'kb.curate_document', tier: 2, content: loadGoldStandard(CAT, 'kb.curate_document', 2) },
    { promptId: 'kb.curate_document', tier: 3, content: loadGoldStandard(CAT, 'kb.curate_document', 3) },
    { promptId: 'kb.curate_data', tier: 1, content: loadGoldStandard(CAT, 'kb.curate_data', 1) },
    { promptId: 'kb.curate_data', tier: 2, content: loadGoldStandard(CAT, 'kb.curate_data', 2) },
    { promptId: 'kb.curate_data', tier: 3, content: loadGoldStandard(CAT, 'kb.curate_data', 3) },
];
