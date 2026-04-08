/**
 * Tests for core/autotune/routing.ts — getSubsystemCategory, PROMPT_MAP.
 *
 * Pure functions with no external dependencies — no mocks needed.
 */
import { describe, it, expect } from '@jest/globals';

const { getSubsystemCategory, PROMPT_MAP } = await import('../../core/autotune/routing.js');

// =============================================================================
// getSubsystemCategory
// =============================================================================

describe('getSubsystemCategory', () => {
    it('maps voice/synthesis subsystems to voice category', () => {
        expect(getSubsystemCategory('voice')).toBe('voice');
        expect(getSubsystemCategory('synthesis')).toBe('voice');
    });

    it('maps compress/context subsystems to compress category', () => {
        expect(getSubsystemCategory('compress')).toBe('compress');
        expect(getSubsystemCategory('context')).toBe('compress');
    });

    it('maps chat/docs/research/proxy subsystems to chat category', () => {
        expect(getSubsystemCategory('chat')).toBe('chat');
        expect(getSubsystemCategory('docs')).toBe('chat');
        expect(getSubsystemCategory('research')).toBe('chat');
        expect(getSubsystemCategory('proxy')).toBe('chat');
    });

    it('maps keyword subsystem to keyword category', () => {
        expect(getSubsystemCategory('keyword')).toBe('keyword');
    });

    it('maps autorating subsystem to autorating category', () => {
        expect(getSubsystemCategory('autorating')).toBe('autorating');
    });

    it('maps reader_image subsystem to reader_image category', () => {
        expect(getSubsystemCategory('reader_image')).toBe('reader_image');
    });

    it('maps reader_sheet subsystem to reader_sheet category', () => {
        expect(getSubsystemCategory('reader_sheet')).toBe('reader_sheet');
    });

    it('maps reader_code subsystem to reader_code category', () => {
        expect(getSubsystemCategory('reader_code')).toBe('reader_code');
    });

    it('maps evm_analysis to its own category', () => {
        expect(getSubsystemCategory('evm_analysis')).toBe('evm_analysis');
    });

    it('maps spec_extraction to its own category', () => {
        expect(getSubsystemCategory('spec_extraction')).toBe('spec_extraction');
    });

    it('maps dedup_judge subsystem to dedup_judge category', () => {
        expect(getSubsystemCategory('dedup_judge')).toBe('dedup_judge');
    });

    it('maps JSON-output subsystems (config_tune, tuning_judge, breakthrough_check) to chat', () => {
        expect(getSubsystemCategory('config_tune')).toBe('chat');
        expect(getSubsystemCategory('tuning_judge')).toBe('chat');
        expect(getSubsystemCategory('breakthrough_check')).toBe('chat');
    });

    it('returns reader as default for unknown subsystems', () => {
        expect(getSubsystemCategory('unknown_subsystem')).toBe('reader');
        expect(getSubsystemCategory('')).toBe('reader');
        expect(getSubsystemCategory('reader_text')).toBe('reader');
    });
});

// =============================================================================
// PROMPT_MAP
// =============================================================================

describe('PROMPT_MAP', () => {
    it('maps every category to a prompt ID string', () => {
        const categories = [
            'voice', 'compress', 'chat', 'keyword', 'autorating',
            'reader', 'reader_image', 'reader_sheet', 'reader_code',
            'dedup_judge', 'evm_analysis', 'spec_extraction',
        ] as const;

        for (const cat of categories) {
            expect(typeof PROMPT_MAP[cat]).toBe('string');
            expect(PROMPT_MAP[cat].length).toBeGreaterThan(0);
        }
    });

    it('uses autotune.test_ prefix for all prompt IDs', () => {
        for (const [, promptId] of Object.entries(PROMPT_MAP)) {
            expect(promptId).toMatch(/^autotune\.test_/);
        }
    });

    it('maps voice category to autotune.test_voice', () => {
        expect(PROMPT_MAP.voice).toBe('autotune.test_voice');
    });

    it('maps reader_image to autotune.test_image', () => {
        expect(PROMPT_MAP.reader_image).toBe('autotune.test_image');
    });

    it('maps spec_extraction to its prompt', () => {
        expect(typeof PROMPT_MAP.spec_extraction).toBe('string');
    });
});
