/**
 * @module prompts/gold-standards
 *
 * Aggregates all hardcoded gold standard responses from sub-modules (core,
 * subsystems, readers, EVM). These tiered reference responses (ideal, good,
 * acceptable) serve as the fallback scoring baseline for auto-tune when no
 * DB-generated gold standards exist.
 */

export type { DefaultGoldStandard } from './gold-standards-core.js';
import { CORE_GOLD_STANDARDS } from './gold-standards-core.js';
import { SUBSYSTEM_GOLD_STANDARDS } from './gold-standards-subsystems.js';
import { READER_GOLD_STANDARDS } from './gold-standards-readers.js';
import { EVM_GOLD_STANDARDS } from './gold-standards-evm.js';

/**
 * All hardcoded gold standard responses, merged from core, subsystem, reader,
 * and EVM modules. Each entry is a {@link DefaultGoldStandard} with a prompt
 * ID, quality tier (1=ideal, 2=good, 3=acceptable), and reference content.
 */
export const DEFAULT_GOLD_STANDARDS = [
    ...CORE_GOLD_STANDARDS,
    ...SUBSYSTEM_GOLD_STANDARDS,
    ...READER_GOLD_STANDARDS,
    ...EVM_GOLD_STANDARDS,
];
