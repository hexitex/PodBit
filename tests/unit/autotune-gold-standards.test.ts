/**
 * Tests for core/autotune/gold-standards.ts — composeTestPrompt, generateGoldStandards,
 * getGoldStandards, deleteGoldStandards, updateGoldStandard, listGoldStandardPrompts,
 * scoreAgainstGoldStandards.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----

const mockCallSubsystemModel = jest.fn<any>();
const mockGetEmbedding = jest.fn<any>();

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getEmbedding: mockGetEmbedding,
}));

const mockGetPrompt = jest.fn<any>();
const mockDefaultGoldStandards: any[] = [];
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
    DEFAULT_GOLD_STANDARDS: mockDefaultGoldStandards,
}));

const mockSystemQuery = jest.fn<any>();
jest.unstable_mockModule('../../db/index.js', () => ({
    systemQuery: mockSystemQuery,
}));

const mockEnsureAssignmentsLoaded = jest.fn<any>();
const mockGetAssignedModel = jest.fn<any>();
jest.unstable_mockModule('../../models/assignments.js', () => ({
    ensureAssignmentsLoaded: mockEnsureAssignmentsLoaded,
    getAssignedModel: mockGetAssignedModel,
}));

const mockCosineSimilarity = jest.fn<any>();
const mockParseEmbedding = jest.fn<any>();
const mockEmbeddingToBuffer = jest.fn<any>();
jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
    embeddingToBuffer: mockEmbeddingToBuffer,
}));

const mockLoadTestVars = jest.fn<any>();
const mockGetPromptIdsForCategory = jest.fn<any>();
jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    PROMPT_CATEGORY_MAP: { 'core.insight_synthesis': 'voice', 'knowledge.compress': 'compress' },
    TEST_VAR_CONFIGS: {},
    loadTestVars: mockLoadTestVars,
    getPromptIdsForCategory: mockGetPromptIdsForCategory,
}));

const {
    composeTestPrompt,
    generateGoldStandards,
    getGoldStandards,
    deleteGoldStandards,
    updateGoldStandard,
    listGoldStandardPrompts,
    scoreAgainstGoldStandards,
} = await import('../../core/autotune/gold-standards.js');

// =============================================================================
// composeTestPrompt
// =============================================================================

describe('composeTestPrompt', () => {
    beforeEach(() => jest.resetAllMocks());

    it('returns interpolated prompt when test vars exist', async () => {
        mockLoadTestVars.mockResolvedValue({ contentA: 'Fact A', contentB: 'Fact B' });
        mockGetPrompt.mockResolvedValue('Synthesize: {{contentA}} and {{contentB}}');

        const result = await composeTestPrompt('core.insight_synthesis');

        expect(mockLoadTestVars).toHaveBeenCalledWith('core.insight_synthesis');
        expect(mockGetPrompt).toHaveBeenCalledWith('core.insight_synthesis', { contentA: 'Fact A', contentB: 'Fact B' });
        expect(result).toBe('Synthesize: {{contentA}} and {{contentB}}');
    });

    it('returns null when no test vars configured for prompt', async () => {
        mockLoadTestVars.mockResolvedValue(null);

        const result = await composeTestPrompt('unknown.prompt');

        expect(result).toBeNull();
        expect(mockGetPrompt).not.toHaveBeenCalled();
    });
});

// =============================================================================
// generateGoldStandards
// =============================================================================

describe('generateGoldStandards', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockEnsureAssignmentsLoaded.mockResolvedValue(undefined);
    });

    it('returns error when promptId not in PROMPT_CATEGORY_MAP', async () => {
        const result = await generateGoldStandards('unknown.prompt');

        expect(result.generated).toBe(0);
        expect(result.error).toContain('not configured for gold standard generation');
    });

    it('returns error when no tuning_judge model assigned', async () => {
        mockGetAssignedModel.mockReturnValue(null);

        const result = await generateGoldStandards('core.insight_synthesis');

        expect(result.generated).toBe(0);
        expect(result.error).toContain('No model assigned');
    });

    it('returns error when composeTestPrompt fails', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue(null);

        const result = await generateGoldStandards('core.insight_synthesis');

        expect(result.generated).toBe(0);
        expect(result.error).toContain('Failed to compose test prompt');
    });

    it('generates 3 tiers and upserts to DB', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue({ contentA: 'A', contentB: 'B' });
        mockGetPrompt.mockResolvedValue('Composed prompt');
        mockCallSubsystemModel.mockResolvedValue('Gold standard response.');
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('emb'));
        mockSystemQuery.mockResolvedValue([]);

        const result = await generateGoldStandards('core.insight_synthesis');

        expect(result.generated).toBe(3);
        // 3 queries for locked check + 3 upserts + 3 judge prompt calls
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(3);
        expect(mockSystemQuery).toHaveBeenCalled();
    });

    it('skips locked tiers', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue({ contentA: 'A', contentB: 'B' });
        mockGetPrompt.mockResolvedValue('Composed prompt');
        mockCallSubsystemModel.mockResolvedValue('Gold standard response.');
        mockGetEmbedding.mockResolvedValue([0.1, 0.2]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('emb'));
        // First query returns locked tiers 1 and 2
        mockSystemQuery
            .mockResolvedValueOnce([{ tier: 1 }, { tier: 2 }]) // locked query
            .mockResolvedValue([]); // upsert

        const result = await generateGoldStandards('core.insight_synthesis');

        // Only tier 3 generated (tiers 1 and 2 locked)
        expect(result.generated).toBe(1);
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(1);
    });

    it('skips tiers with empty LLM response', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue({ contentA: 'A', contentB: 'B' });
        mockGetPrompt.mockResolvedValue('Composed prompt');
        mockCallSubsystemModel
            .mockResolvedValueOnce('Good response.')
            .mockResolvedValueOnce('')      // empty
            .mockResolvedValueOnce('Also good.');
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('emb'));
        mockSystemQuery.mockResolvedValue([]);

        const result = await generateGoldStandards('core.insight_synthesis');

        expect(result.generated).toBe(2); // tier 2 skipped
    });

    it('continues when embedding generation fails', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue({ contentA: 'A', contentB: 'B' });
        mockGetPrompt.mockResolvedValue('Composed prompt');
        mockCallSubsystemModel.mockResolvedValue('Response.');
        mockGetEmbedding.mockRejectedValue(new Error('Embedding model offline'));
        mockSystemQuery.mockResolvedValue([]);

        const result = await generateGoldStandards('core.insight_synthesis');

        // Should still generate all 3 tiers despite embedding failures
        expect(result.generated).toBe(3);
    });

    it('handles LLM call errors gracefully per tier', async () => {
        mockGetAssignedModel.mockReturnValue({ name: 'judge-model' });
        mockLoadTestVars.mockResolvedValue({ contentA: 'A', contentB: 'B' });
        mockGetPrompt.mockResolvedValue('Composed prompt');
        mockCallSubsystemModel
            .mockResolvedValueOnce('Good response.')
            .mockRejectedValueOnce(new Error('Rate limited'))
            .mockResolvedValueOnce('Another good response.');
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('emb'));
        mockSystemQuery.mockResolvedValue([]);

        const result = await generateGoldStandards('core.insight_synthesis');

        expect(result.generated).toBe(2); // tier 2 failed
    });
});

// =============================================================================
// getGoldStandards
// =============================================================================

describe('getGoldStandards', () => {
    beforeEach(() => jest.resetAllMocks());

    it('queries DB and returns rows', async () => {
        const rows = [
            { id: '1', prompt_id: 'core.insight_synthesis', tier: 1, content: 'Tier 1', locked: 0 },
            { id: '2', prompt_id: 'core.insight_synthesis', tier: 2, content: 'Tier 2', locked: 0 },
        ];
        mockSystemQuery.mockResolvedValue(rows);

        const result = await getGoldStandards('core.insight_synthesis');

        expect(result).toEqual(rows);
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('prompt_gold_standards'),
            ['core.insight_synthesis'],
        );
    });

    it('returns empty array when no gold standards exist', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const result = await getGoldStandards('nonexistent');

        expect(result).toEqual([]);
    });
});

// =============================================================================
// deleteGoldStandards
// =============================================================================

describe('deleteGoldStandards', () => {
    beforeEach(() => jest.resetAllMocks());

    it('deletes all gold standards for a prompt', async () => {
        mockSystemQuery.mockResolvedValue([]);

        await deleteGoldStandards('core.insight_synthesis');

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE'),
            ['core.insight_synthesis'],
        );
    });
});

// =============================================================================
// updateGoldStandard
// =============================================================================

describe('updateGoldStandard', () => {
    beforeEach(() => jest.resetAllMocks());

    it('updates content, regenerates embedding, and auto-locks', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.6]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('new-emb'));
        mockSystemQuery.mockResolvedValue([]);

        await updateGoldStandard('gs-123', { content: 'Updated content.' });

        expect(mockGetEmbedding).toHaveBeenCalledWith('Updated content.');
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('locked = 1'),
            ['Updated content.', expect.any(Buffer), 'gs-123'],
        );
    });

    it('handles embedding failure gracefully', async () => {
        mockGetEmbedding.mockRejectedValue(new Error('offline'));
        mockSystemQuery.mockResolvedValue([]);

        await updateGoldStandard('gs-123', { content: 'Updated.' });

        // Should still update with null embedding
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE'),
            ['Updated.', null, 'gs-123'],
        );
    });

    it('toggles lock without content edit', async () => {
        mockSystemQuery.mockResolvedValue([]);

        await updateGoldStandard('gs-123', { locked: true });

        expect(mockGetEmbedding).not.toHaveBeenCalled();
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('locked = $1'),
            [1, 'gs-123'],
        );
    });

    it('unlocks a gold standard', async () => {
        mockSystemQuery.mockResolvedValue([]);

        await updateGoldStandard('gs-123', { locked: false });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('locked = $1'),
            [0, 'gs-123'],
        );
    });

    it('content edit takes precedence over lock toggle', async () => {
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockEmbeddingToBuffer.mockReturnValue(Buffer.from('e'));
        mockSystemQuery.mockResolvedValue([]);

        // Both content and locked provided — content path should run, lock path should not
        await updateGoldStandard('gs-123', { content: 'New.', locked: false });

        // Should run the content update path (which auto-locks to 1)
        expect(mockSystemQuery).toHaveBeenCalledTimes(1);
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('locked = 1'),
            expect.anything(),
        );
    });
});

// =============================================================================
// listGoldStandardPrompts
// =============================================================================

describe('listGoldStandardPrompts', () => {
    beforeEach(() => jest.resetAllMocks());

    it('returns grouped prompt list', async () => {
        const rows = [
            { prompt_id: 'core.insight_synthesis', count: 3, generated_at: '2025-01-01' },
            { prompt_id: 'knowledge.compress', count: 2, generated_at: '2025-01-02' },
        ];
        mockSystemQuery.mockResolvedValue(rows);

        const result = await listGoldStandardPrompts();

        expect(result).toEqual(rows);
        expect(mockSystemQuery).toHaveBeenCalledWith(expect.stringContaining('GROUP BY'));
    });
});

// =============================================================================
// scoreAgainstGoldStandards
// =============================================================================

describe('scoreAgainstGoldStandards', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        // Clear default gold standards array
        mockDefaultGoldStandards.length = 0;
    });

    it('returns null when no gold standards in DB and no defaults', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);

        const result = await scoreAgainstGoldStandards('test output', 'voice');

        expect(result).toBeNull();
    });

    it('scores against DB gold standards using embedding similarity', async () => {
        mockSystemQuery.mockResolvedValue([
            { tier: 1, content: 'Gold tier 1', embedding: Buffer.from('emb1') },
            { tier: 2, content: 'Gold tier 2', embedding: Buffer.from('emb2') },
        ]);
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
        mockParseEmbedding.mockReturnValueOnce([0.4, 0.5, 0.6]).mockReturnValueOnce([0.7, 0.8, 0.9]);
        mockCosineSimilarity
            .mockReturnValueOnce(0.85)  // tier 1
            .mockReturnValueOnce(0.90); // tier 2

        const result = await scoreAgainstGoldStandards('model output', 'voice', 'core.insight_synthesis');

        expect(result).not.toBeNull();
        expect(result!.dimensions.goldTier1).toBe(0.85);
        expect(result!.dimensions.goldTier2).toBe(0.90);
        // tier 1 weighted = 0.85 * 1.0 = 0.85, tier 2 weighted = 0.90 * 0.85 = 0.765
        expect(result!.overall).toBe(0.85); // max of weighted scores
        expect(result!.dimensions.goldSource).toBe(1); // DB source
    });

    it('applies tier weights correctly', async () => {
        mockSystemQuery.mockResolvedValue([
            { tier: 1, content: 'Gold tier 1', embedding: Buffer.from('e') },
            { tier: 3, content: 'Gold tier 3', embedding: Buffer.from('e') },
        ]);
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockParseEmbedding.mockReturnValue([0.1]);
        mockCosineSimilarity.mockReturnValue(0.80);

        const result = await scoreAgainstGoldStandards('output', 'voice', 'test');

        // tier 1: 0.80 * 1.0 = 0.80
        // tier 3: 0.80 * 0.65 = 0.52
        expect(result!.dimensions.goldTier1Weighted).toBeCloseTo(0.80, 5);
        expect(result!.dimensions.goldTier3Weighted).toBeCloseTo(0.52, 5);
        expect(result!.overall).toBeCloseTo(0.80, 5); // best weighted
    });

    it('returns null when output embedding fails', async () => {
        mockSystemQuery.mockResolvedValue([
            { tier: 1, content: 'Gold', embedding: Buffer.from('e') },
        ]);
        mockGetEmbedding.mockResolvedValue(null);

        const result = await scoreAgainstGoldStandards('output', 'voice', 'test');

        expect(result).toBeNull();
    });

    it('skips tiers with unparseable embedding', async () => {
        mockSystemQuery.mockResolvedValue([
            { tier: 1, content: 'Gold', embedding: Buffer.from('bad') },
            { tier: 2, content: 'Gold 2', embedding: Buffer.from('good') },
        ]);
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockParseEmbedding
            .mockReturnValueOnce(null)      // tier 1 fails
            .mockReturnValueOnce([0.2]);    // tier 2 ok
        mockCosineSimilarity.mockReturnValue(0.75);

        const result = await scoreAgainstGoldStandards('output', 'voice', 'test');

        expect(result).not.toBeNull();
        expect(result!.dimensions.goldTier1).toBeUndefined();
        expect(result!.dimensions.goldTier2).toBe(0.75);
    });

    it('falls back to category lookup when no goldPromptId', async () => {
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis', 'core.multi_insight_synthesis']);
        // First prompt has no gold standards, second does
        mockSystemQuery
            .mockResolvedValueOnce([])  // core.insight_synthesis — empty
            .mockResolvedValueOnce([{ tier: 1, content: 'Gold', embedding: Buffer.from('e') }]);
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockParseEmbedding.mockReturnValue([0.2]);
        mockCosineSimilarity.mockReturnValue(0.70);

        const result = await scoreAgainstGoldStandards('output', 'voice');

        expect(result).not.toBeNull();
        expect(result!.overall).toBeCloseTo(0.70, 5);
    });

    it('uses hardcoded defaults when no DB rows exist', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockDefaultGoldStandards.push({
            promptId: 'core.insight_synthesis',
            tier: 1,
            content: 'Default gold standard content.',
        });
        mockGetEmbedding
            .mockResolvedValueOnce([0.1, 0.2])  // output embedding
            .mockResolvedValueOnce([0.3, 0.4]); // default gold embedding
        mockCosineSimilarity.mockReturnValue(0.60);

        const result = await scoreAgainstGoldStandards('output', 'voice');

        expect(result).not.toBeNull();
        expect(result!.dimensions.goldSource).toBe(0); // hardcoded defaults
        expect(result!.dimensions.goldTier1).toBe(0.60);
    });

    it('returns null when default gold standards exist but output embedding fails', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockDefaultGoldStandards.push({
            promptId: 'core.insight_synthesis',
            tier: 1,
            content: 'Default.',
        });
        mockGetEmbedding.mockResolvedValue(null); // output embedding fails

        const result = await scoreAgainstGoldStandards('output', 'voice');

        expect(result).toBeNull();
    });

    it('skips default gold standards with failed embedding', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockGetPromptIdsForCategory.mockReturnValue(['core.insight_synthesis']);
        mockDefaultGoldStandards.push(
            { promptId: 'core.insight_synthesis', tier: 1, content: 'Default 1.' },
            { promptId: 'core.insight_synthesis', tier: 2, content: 'Default 2.' },
        );
        mockGetEmbedding
            .mockResolvedValueOnce([0.1])   // output embedding
            .mockResolvedValueOnce(null)     // tier 1 embedding fails
            .mockResolvedValueOnce([0.3]);  // tier 2 embedding ok
        mockCosineSimilarity.mockReturnValue(0.55);

        const result = await scoreAgainstGoldStandards('output', 'voice');

        expect(result).not.toBeNull();
        // Only tier 2 should be scored
        expect(result!.dimensions.goldTier1).toBeUndefined();
        expect(result!.dimensions.goldTier2).toBe(0.55);
    });

    it('preserves rawOutput in the returned score', async () => {
        mockSystemQuery.mockResolvedValue([
            { tier: 1, content: 'Gold', embedding: Buffer.from('e') },
        ]);
        mockGetEmbedding.mockResolvedValue([0.1]);
        mockParseEmbedding.mockReturnValue([0.2]);
        mockCosineSimilarity.mockReturnValue(0.80);

        const result = await scoreAgainstGoldStandards('my output text', 'voice', 'test');

        expect(result!.rawOutput).toBe('my output text');
    });

    it('uses goldPromptId to query specific prompt standards', async () => {
        mockSystemQuery.mockResolvedValue([]);

        await scoreAgainstGoldStandards('output', 'voice', 'specific.prompt.id');

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('prompt_id = $1'),
            ['specific.prompt.id'],
        );
    });
});
