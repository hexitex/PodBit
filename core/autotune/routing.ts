/**
 * @module core/autotune/routing
 *
 * Subsystem-to-category routing and prompt mapping for auto-tune.
 * Each subsystem maps to a scoring category that determines which
 * test prompt and quality scorer are used during parameter optimization.
 */

import type { SubsystemCategory } from './types.js';

// =============================================================================
// SUBSYSTEM → CATEGORY ROUTING
// =============================================================================

/**
 * Maps a subsystem name to its auto-tune scoring category.
 * The category determines which test prompt and quality scorer are used.
 *
 * Unknown subsystems default to the `'reader'` category.
 *
 * @param subsystem - Subsystem name (e.g., 'voice', 'compress', 'evm_codegen')
 * @returns The scoring category for the subsystem
 */
export function getSubsystemCategory(subsystem: string): SubsystemCategory {
    if (subsystem === 'voice' || subsystem === 'synthesis') return 'voice';
    if (subsystem === 'compress' || subsystem === 'context') return 'compress';
    if (subsystem === 'chat' || subsystem === 'docs' || subsystem === 'research' || subsystem === 'proxy') return 'chat';
    if (subsystem === 'keyword') return 'keyword';
    if (subsystem === 'autorating') return 'autorating';
    if (subsystem === 'reader_image') return 'reader_image';
    if (subsystem === 'reader_sheet') return 'reader_sheet';
    if (subsystem === 'reader_code') return 'reader_code';
    if (subsystem === 'spec_extraction') return 'spec_extraction';
    if (subsystem === 'dedup_judge') return 'dedup_judge';
    if (subsystem === 'evm_analysis') return 'evm_analysis';
    // JSON-output subsystems that share the chat scoring profile
    if (subsystem === 'config_tune' || subsystem === 'tuning_judge' || subsystem === 'breakthrough_check') return 'chat';
    return 'reader';
}

/** Maps each category to its test prompt ID in the prompts system. */
export const PROMPT_MAP: Record<SubsystemCategory, string> = {
    voice: 'autotune.test_voice',
    compress: 'autotune.test_compress',
    chat: 'autotune.test_chat',
    keyword: 'autotune.test_keyword',
    autorating: 'autotune.test_autorating',
    reader: 'autotune.test_reader',
    reader_image: 'autotune.test_image',
    reader_sheet: 'autotune.test_sheet',
    reader_code: 'autotune.test_code',
    spec_extraction: 'autotune.test_chat',
    dedup_judge: 'autotune.test_dedup',
    evm_analysis: 'autotune.test_evm_analysis',
};

// No hardcoded maxTokens — reasoning models (GLM-4.7, R1, DeepSeek) exhaust
// low token budgets on chain-of-thought, producing empty output. Let the model's
// configured assignment handle limits. See MEMORY.md: "NEVER lower these again."
