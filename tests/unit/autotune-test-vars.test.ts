/**
 * Tests for core/autotune/test-vars.ts — PROMPT_CATEGORY_MAP, TEST_VAR_CONFIGS,
 * loadTestVars, getPromptIdsForCategory.
 *
 * loadTestVars dynamically imports prompts.js, so we mock it.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----

const mockGetPrompt = jest.fn<any>();
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const {
    PROMPT_CATEGORY_MAP,
    TEST_VAR_CONFIGS,
    loadTestVars,
    getPromptIdsForCategory,
} = await import('../../core/autotune/test-vars.js');

// =============================================================================
// PROMPT_CATEGORY_MAP
// =============================================================================

describe('PROMPT_CATEGORY_MAP', () => {
    it('maps voice/synthesis prompts to voice category', () => {
        expect(PROMPT_CATEGORY_MAP['core.insight_synthesis']).toBe('voice');
        expect(PROMPT_CATEGORY_MAP['core.multi_insight_synthesis']).toBe('voice');
        expect(PROMPT_CATEGORY_MAP['core.breakthrough_validation']).toBe('voice');
        expect(PROMPT_CATEGORY_MAP['core.novelty_gate']).toBe('voice');
        expect(PROMPT_CATEGORY_MAP['core.question_generation']).toBe('voice');
        expect(PROMPT_CATEGORY_MAP['core.question_answer']).toBe('voice');
    });

    it('maps compress/context prompts to compress category', () => {
        expect(PROMPT_CATEGORY_MAP['knowledge.compress']).toBe('compress');
        expect(PROMPT_CATEGORY_MAP['knowledge.compress_task']).toBe('compress');
        expect(PROMPT_CATEGORY_MAP['knowledge.summarize']).toBe('compress');
        expect(PROMPT_CATEGORY_MAP['knowledge.summarize_task']).toBe('compress');
        expect(PROMPT_CATEGORY_MAP['context.history_compression']).toBe('compress');
    });

    it('maps chat/docs/research prompts to chat category', () => {
        expect(PROMPT_CATEGORY_MAP['chat.default_response']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['chat.research_seeds']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['chat.summarize']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['chat.compress']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['chat.voice_connection']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['core.research_cycle']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['docs.outline_decomposition']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['docs.section_generation']).toBe('chat');
        expect(PROMPT_CATEGORY_MAP['docs.section_escalation']).toBe('chat');
    });

    it('maps keyword prompts to keyword category', () => {
        expect(PROMPT_CATEGORY_MAP['keyword.node_keywords']).toBe('keyword');
        expect(PROMPT_CATEGORY_MAP['keyword.domain_synonyms']).toBe('keyword');
    });

    it('maps KB reader prompts to their categories', () => {
        expect(PROMPT_CATEGORY_MAP['kb.curate_text']).toBe('reader');
        expect(PROMPT_CATEGORY_MAP['kb.curate_code']).toBe('reader_code');
        expect(PROMPT_CATEGORY_MAP['kb.curate_document']).toBe('reader');
        expect(PROMPT_CATEGORY_MAP['kb.curate_data']).toBe('reader_sheet');
    });

    it('maps autorating prompt to autorating category', () => {
        expect(PROMPT_CATEGORY_MAP['core.autorating']).toBe('autorating');
    });

    it('maps EVM prompts to their categories', () => {
        expect(PROMPT_CATEGORY_MAP['evm.analysis']).toBe('evm_analysis');
    });

    it('maps dedup prompt to dedup_judge category', () => {
        expect(PROMPT_CATEGORY_MAP['dedup.llm_judge']).toBe('dedup_judge');
    });

    it('does not contain undefined or null values', () => {
        for (const [key, value] of Object.entries(PROMPT_CATEGORY_MAP)) {
            expect(value).toBeDefined();
            expect(typeof value).toBe('string');
        }
    });
});

// =============================================================================
// TEST_VAR_CONFIGS
// =============================================================================

describe('TEST_VAR_CONFIGS', () => {
    it('has configs for all prompts in PROMPT_CATEGORY_MAP', () => {
        for (const promptId of Object.keys(PROMPT_CATEGORY_MAP)) {
            expect(TEST_VAR_CONFIGS[promptId]).toBeDefined();
        }
    });

    it('core.insight_synthesis has contentA and contentB source specs', () => {
        const config = TEST_VAR_CONFIGS['core.insight_synthesis'];
        expect(config.contentA).toEqual({ source: 'autotune.data.fact_a' });
        expect(config.contentB).toEqual({ source: 'autotune.data.fact_b' });
    });

    it('core.multi_insight_synthesis has a composed fn spec', () => {
        const config = TEST_VAR_CONFIGS['core.multi_insight_synthesis'];
        expect(config.contents).toHaveProperty('deps');
        expect(config.contents).toHaveProperty('fn');
        const spec = config.contents as { deps: string[]; fn: (d: Record<string, string>) => string };
        expect(spec.deps).toContain('autotune.data.fact_a');
        expect(spec.deps).toContain('autotune.data.fact_b');
    });

    it('fn specs produce expected output', () => {
        const config = TEST_VAR_CONFIGS['core.multi_insight_synthesis'];
        const spec = config.contents as { deps: string[]; fn: (d: Record<string, string>) => string };
        const result = spec.fn({ 'autotune.data.fact_a': 'Fact A text', 'autotune.data.fact_b': 'Fact B text' });
        expect(result).toContain('Fact A text');
        expect(result).toContain('Fact B text');
    });

    it('literal specs pass values through unchanged', () => {
        const config = TEST_VAR_CONFIGS['knowledge.compress'];
        expect(config.topic).toEqual({ literal: 'knowledge graph synthesis' });
    });

    // evm.triage test removed — evm_triage subsystem deprecated

    it('docs.section_generation knowledgeBlock fn wraps knowledge', () => {
        const config = TEST_VAR_CONFIGS['docs.section_generation'];
        const spec = config.knowledgeBlock as { deps: string[]; fn: (d: Record<string, string>) => string };
        const result = spec.fn({ 'autotune.data.docs_knowledge': 'Some knowledge' });
        expect(result).toContain('Knowledge sources:');
        expect(result).toContain('Some knowledge');
    });

    // evm.structural_eval test removed — evm_structural subsystem deprecated
});

// =============================================================================
// getPromptIdsForCategory
// =============================================================================

describe('getPromptIdsForCategory', () => {
    it('returns all voice prompt IDs for voice category', () => {
        const ids = getPromptIdsForCategory('voice');
        expect(ids).toContain('core.insight_synthesis');
        expect(ids).toContain('core.multi_insight_synthesis');
        expect(ids).toContain('core.breakthrough_validation');
        expect(ids).toContain('core.novelty_gate');
        expect(ids).toContain('core.question_generation');
        expect(ids).toContain('core.question_answer');
    });

    it('returns compress prompt IDs for compress category', () => {
        const ids = getPromptIdsForCategory('compress');
        expect(ids).toContain('knowledge.compress');
        expect(ids).toContain('knowledge.compress_task');
        expect(ids).toContain('context.history_compression');
    });

    it('returns chat prompt IDs including docs and research', () => {
        const ids = getPromptIdsForCategory('chat');
        expect(ids).toContain('chat.default_response');
        expect(ids).toContain('core.research_cycle');
        expect(ids).toContain('docs.outline_decomposition');
    });

    it('returns empty array for non-existent category', () => {
        const ids = getPromptIdsForCategory('nonexistent' as any);
        expect(ids).toEqual([]);
    });

    it('returns single-item arrays for categories with one prompt', () => {
        const ids = getPromptIdsForCategory('autorating');
        expect(ids).toEqual(['core.autorating']);
    });

    it('returns reader_code prompts', () => {
        const ids = getPromptIdsForCategory('reader_code');
        expect(ids).toContain('kb.curate_code');
    });

    it('returns dedup_judge prompts', () => {
        const ids = getPromptIdsForCategory('dedup_judge');
        expect(ids).toContain('dedup.llm_judge');
    });
});

// =============================================================================
// loadTestVars
// =============================================================================

describe('loadTestVars', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns null for unknown prompt IDs', async () => {
        const result = await loadTestVars('nonexistent.prompt');
        expect(result).toBeNull();
    });

    it('loads source specs from getPrompt', async () => {
        mockGetPrompt.mockResolvedValue('Loaded prompt content');

        const result = await loadTestVars('core.insight_synthesis');

        expect(result).not.toBeNull();
        expect(result!.contentA).toBe('Loaded prompt content');
        expect(result!.contentB).toBe('Loaded prompt content');
        expect(mockGetPrompt).toHaveBeenCalledWith('autotune.data.fact_a');
        expect(mockGetPrompt).toHaveBeenCalledWith('autotune.data.fact_b');
    });

    it('passes literal values through unchanged', async () => {
        mockGetPrompt.mockResolvedValue('any content');

        const result = await loadTestVars('knowledge.compress');

        expect(result).not.toBeNull();
        expect(result!.topic).toBe('knowledge graph synthesis');
    });

    it('resolves fn specs using loaded dependencies', async () => {
        mockGetPrompt.mockImplementation(async (id: string) => {
            if (id === 'autotune.data.fact_a') return 'Fact Alpha';
            if (id === 'autotune.data.fact_b') return 'Fact Beta';
            return '';
        });

        const result = await loadTestVars('core.multi_insight_synthesis');

        expect(result).not.toBeNull();
        expect(result!.contents).toContain('Fact Alpha');
        expect(result!.contents).toContain('Fact Beta');
    });

    it('deduplicates data ID loads across specs', async () => {
        // core.insight_synthesis uses fact_a and fact_b — each loaded once
        mockGetPrompt.mockResolvedValue('content');

        await loadTestVars('core.insight_synthesis');

        const factACalls = mockGetPrompt.mock.calls.filter(
            (c: any) => c[0] === 'autotune.data.fact_a',
        );
        expect(factACalls.length).toBe(1);
    });

    it('handles prompts with mixed spec types', async () => {
        mockGetPrompt.mockImplementation(async (id: string) => {
            if (id === 'autotune.data.breakthrough_claim') return 'Claim text';
            if (id === 'autotune.data.breakthrough_sources') return 'Source text';
            return '';
        });

        const result = await loadTestVars('core.novelty_gate');

        expect(result).not.toBeNull();
        expect(result!.nodeContent).toBe('Claim text');
        expect(result!.sourceContext).toBe('Source text');
        expect(result!.domain).toBe('distributed-systems'); // literal
    });

    it('loads keyword prompt variables', async () => {
        mockGetPrompt.mockResolvedValue('Transfer learning content');

        const result = await loadTestVars('keyword.node_keywords');

        expect(result).not.toBeNull();
        expect(result!.content).toBe('Transfer learning content');
        expect(result!.domain).toBe('machine-learning');
    });

    // evm.codegen test removed — evm_codegen subsystem deprecated

    it('loads dedup variables', async () => {
        mockGetPrompt.mockImplementation(async (id: string) => {
            if (id === 'autotune.data.dedup_existing') return 'Existing node';
            if (id === 'autotune.data.dedup_new') return 'New node';
            return '';
        });

        const result = await loadTestVars('dedup.llm_judge');

        expect(result).not.toBeNull();
        expect(result!.similarity).toBe('0.92');
        expect(result!.existingContent).toBe('Existing node');
        expect(result!.newContent).toBe('New node');
    });
});
