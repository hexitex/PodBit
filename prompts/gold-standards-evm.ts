/**
 * @module prompts/gold-standards-evm
 *
 * EVM gold standard responses for auto-tuning.
 * Only covers active prompts: evm.analysis.
 */

import type { DefaultGoldStandard } from './gold-standards-core.js';
import { loadGoldStandard } from './loader.js';

const CAT = 'evm';

export const EVM_GOLD_STANDARDS: DefaultGoldStandard[] = [
    { promptId: 'evm.analysis', tier: 1, content: loadGoldStandard(CAT, 'evm.analysis', 1) },
    { promptId: 'evm.analysis', tier: 2, content: loadGoldStandard(CAT, 'evm.analysis', 2) },
    { promptId: 'evm.analysis', tier: 3, content: loadGoldStandard(CAT, 'evm.analysis', 3) },
];
