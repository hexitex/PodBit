/**
 * Unit tests for scaffold/generate.ts — generateSection()
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Generated prompt text');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockBuildProvenanceTag = jest.fn().mockReturnValue('[seed:test]');

jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
}));

const mockVerifySection = jest.fn().mockReturnValue({ valid: true, failures: [], wordCount: 50 });

jest.unstable_mockModule('../../scaffold/verify.js', () => ({
    verifySection: mockVerifySection,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('Generated section content.');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const mockFetchTopicNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    fetchTopicNodes: mockFetchTopicNodes,
}));

const { generateSection, KnowledgeAccumulator } = await import('../../scaffold/generate.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockGetPrompt.mockResolvedValue('Generated prompt text');
    mockBuildProvenanceTag.mockReturnValue('[seed:test]');
    mockVerifySection.mockReturnValue({ valid: true, failures: [], wordCount: 50 });
    mockCallSubsystemModel.mockResolvedValue('Generated section content.');
    mockFetchTopicNodes.mockResolvedValue([]);
});

// =============================================================================
// Tests
// =============================================================================

describe('generateSection', () => {
    const baseOutline = {
        sections: [
            {
                id: 'intro',
                title: 'Introduction',
                purpose: 'Introduce the topic',
                length: { min: 100, max: 500 },
                must_include: ['overview'],
                must_avoid: ['jargon'],
                tone: 'accessible',
            },
            {
                id: 'methods',
                title: 'Methods',
                purpose: 'Describe methodology',
            },
        ],
    };

    it('throws when section is not found', async () => {
        await expect(generateSection(baseOutline, 'nonexistent'))
            .rejects.toThrow('Section not found: nonexistent');
    });

    it('generates content for a valid section', async () => {
        const result = await generateSection(baseOutline, 'intro');

        expect(result.sectionId).toBe('intro');
        expect(result.content).toBe('Generated section content.');
        expect(result.verification.valid).toBe(true);
        expect(result.attempts).toBe(1);
    });

    it('calls getPrompt with section parameters', async () => {
        await generateSection(baseOutline, 'intro');

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                sectionTitle: 'Introduction',
                purpose: 'Introduce the topic',
                lengthMin: '100',
                lengthMax: '500',
                mustInclude: 'overview',
                tone: 'accessible',
            })
        );
    });

    it('calls LLM via docs subsystem', async () => {
        await generateSection(baseOutline, 'intro');

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('docs', 'Generated prompt text');
    });

    it('retries on verification failure up to maxAttempts', async () => {
        mockVerifySection
            .mockReturnValueOnce({ valid: false, failures: [{ type: 'too_short', message: 'Content too short' }], wordCount: 10 })
            .mockReturnValueOnce({ valid: false, failures: [{ type: 'too_short', message: 'Still short' }], wordCount: 20 })
            .mockReturnValueOnce({ valid: true, failures: [], wordCount: 50 });

        const result = await generateSection(baseOutline, 'intro');

        expect(result.attempts).toBe(3);
        expect(result.verification.valid).toBe(true);
        // +1 for the research phase LLM call
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(4);
    });

    it('returns failed result after maxAttempts exhausted', async () => {
        mockVerifySection.mockReturnValue({ valid: false, failures: [{ type: 'bad', message: 'Bad content' }], wordCount: 5 });

        const result = await generateSection(baseOutline, 'intro');

        expect(result.attempts).toBe(3);
        expect(result.verification.valid).toBe(false);
    });

    it('respects custom maxAttempts option', async () => {
        mockVerifySection.mockReturnValue({ valid: false, failures: [{ type: 'bad', message: 'Bad' }], wordCount: 5 });

        const result = await generateSection(baseOutline, 'intro', { maxAttempts: 5 });

        expect(result.attempts).toBe(5);
        // +1 for the research phase LLM call
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(6);
    });

    it('returns failed result on model call error', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('API timeout'));

        const result = await generateSection(baseOutline, 'intro');

        expect(result.failed).toBe(true);
        expect(result.content).toBeNull();
        expect(result.verification.failures[0].type).toBe('model_failure');
        expect(result.verification.failures[0].message).toBe('API timeout');
        expect(result.attempts).toBe(1);
    });

    it('includes knowledge nodes in prompt when provided', async () => {
        const knowledgeNodes = [
            { content: 'Node A content', domain: 'physics' },
            { content: 'Node B content', domain: 'math' },
        ];

        await generateSection(baseOutline, 'intro', { knowledgeNodes });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                knowledgeBlock: expect.stringContaining('[K1]'),
            })
        );
        expect(mockBuildProvenanceTag).toHaveBeenCalledTimes(2);
    });

    it('includes preceding sections context', async () => {
        await generateSection(baseOutline, 'methods', {
            precedingSections: { intro: 'Previously written introduction content here' },
        });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                precedingBlock: expect.stringContaining('[intro]'),
            })
        );
    });

    it('includes terminology in prompt', async () => {
        await generateSection(baseOutline, 'intro', {
            terminology: { 'resonance': 'semantic similarity between nodes' },
        });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                terminologyBlock: expect.stringContaining('resonance'),
            })
        );
    });

    it('uses default length when section has none', async () => {
        // 'methods' section has no length property
        await generateSection(baseOutline, 'methods');

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                lengthMin: '600',
                lengthMax: '1500',
            })
        );
    });

    it('passes previous failures to retry attempts', async () => {
        mockVerifySection
            .mockReturnValueOnce({ valid: false, failures: [{ type: 'too_short', message: 'Too short' }], wordCount: 10 })
            .mockReturnValueOnce({ valid: true, failures: [], wordCount: 50 });

        await generateSection(baseOutline, 'intro');

        // Research phase uses getPrompt once, then generation uses it per attempt
        // calls[0] = research prompt, calls[1] = attempt 1, calls[2] = attempt 2
        expect(mockGetPrompt).toHaveBeenCalledTimes(3);
        const retryCall = mockGetPrompt.mock.calls[2];
        const vars = retryCall[1] as any;
        expect(vars.failureBlock).toContain('too_short');
    });

    it('uses shared accumulator when provided', async () => {
        const acc = new KnowledgeAccumulator();
        acc.add([{ content: 'Pre-seeded node', domain: 'test' }]);

        await generateSection(baseOutline, 'intro', { accumulator: acc });

        // The accumulator should have been used — knowledge block should contain the pre-seeded node
        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                knowledgeBlock: expect.stringContaining('[K1]'),
            })
        );
    });

    it('research phase fetches nodes when LLM returns queries', async () => {
        // First callSubsystemModel call is research phase — returns queries
        mockCallSubsystemModel
            .mockResolvedValueOnce('{"queries": ["topic A", "topic B"]}')
            .mockResolvedValueOnce('{"done": true}')  // second research round ends
            .mockResolvedValueOnce('Generated content.');  // generation
        mockFetchTopicNodes.mockResolvedValue([
            { content: 'Found node about topic A', domain: 'science' },
        ]);

        const result = await generateSection(baseOutline, 'intro');

        expect(mockFetchTopicNodes).toHaveBeenCalled();
        expect(result.sectionId).toBe('intro');
    });

    it('research phase stops when no new nodes found', async () => {
        mockCallSubsystemModel
            .mockResolvedValueOnce('{"queries": ["something"]}')
            .mockResolvedValueOnce('Generated content.');
        mockFetchTopicNodes.mockResolvedValue([]); // no nodes found

        await generateSection(baseOutline, 'intro');

        // Should only call LLM for 1 research round + 1 generation
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(2);
    });

    it('research phase stops when LLM response is not valid JSON', async () => {
        mockCallSubsystemModel
            .mockResolvedValueOnce('not valid json at all')
            .mockResolvedValueOnce('Generated content.');

        await generateSection(baseOutline, 'intro');

        // Should stop research and proceed to generation
        expect(mockFetchTopicNodes).not.toHaveBeenCalled();
    });

    it('research phase stops when LLM call throws', async () => {
        mockCallSubsystemModel
            .mockRejectedValueOnce(new Error('Research LLM down'))
            .mockResolvedValueOnce('Generated content.');

        const result = await generateSection(baseOutline, 'intro');

        expect(result.content).toBe('Generated content.');
    });

    it('research handles fetchTopicNodes failure gracefully', async () => {
        mockCallSubsystemModel
            .mockResolvedValueOnce('{"queries": ["failing query"]}')
            .mockResolvedValueOnce('Generated content.');
        mockFetchTopicNodes.mockRejectedValue(new Error('Query failed'));

        const result = await generateSection(baseOutline, 'intro');

        // Should still produce content despite query failure
        expect(result.content).toBe('Generated content.');
    });

    it('caps research queries to 5 per round', async () => {
        const manyQueries = Array.from({ length: 10 }, (_, i) => `query-${i}`);
        mockCallSubsystemModel
            .mockResolvedValueOnce(JSON.stringify({ queries: manyQueries }))
            .mockResolvedValueOnce('{"done": true}')
            .mockResolvedValueOnce('Generated content.');
        mockFetchTopicNodes.mockResolvedValue([{ content: 'result', domain: 'test' }]);

        await generateSection(baseOutline, 'intro');

        // fetchTopicNodes should be called at most 5 times per round
        expect(mockFetchTopicNodes.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('generates with empty knowledge block when no nodes found', async () => {
        // Research returns done immediately, no nodes
        mockCallSubsystemModel
            .mockResolvedValueOnce('{"done": true}')
            .mockResolvedValueOnce('Generated content.');

        await generateSection(baseOutline, 'intro');

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'docs.section_generation',
            expect.objectContaining({
                knowledgeBlock: expect.stringContaining('NO KNOWLEDGE SOURCES PROVIDED'),
            })
        );
    });
});

// =============================================================================
// KnowledgeAccumulator
// =============================================================================

describe('KnowledgeAccumulator', () => {
    it('adds and retrieves nodes', () => {
        const acc = new KnowledgeAccumulator();
        const nodes = [{ content: 'Node A' }, { content: 'Node B' }];
        const fresh = acc.add(nodes);

        expect(fresh).toHaveLength(2);
        expect(acc.all()).toHaveLength(2);
        expect(acc.size).toBe(2);
    });

    it('deduplicates by content', () => {
        const acc = new KnowledgeAccumulator();
        acc.add([{ content: 'Same content' }]);
        const fresh = acc.add([{ content: 'Same content' }, { content: 'Different' }]);

        expect(fresh).toHaveLength(1);
        expect(fresh[0].content).toBe('Different');
        expect(acc.size).toBe(2);
    });

    it('formats nodes with K-labels and provenance tags', () => {
        const acc = new KnowledgeAccumulator();
        acc.add([{ content: 'First node' }, { content: 'Second node' }]);

        const formatted = acc.format();

        expect(formatted).toContain('[K1]');
        expect(formatted).toContain('[K2]');
        expect(formatted).toContain('First node');
        expect(formatted).toContain('Second node');
        expect(mockBuildProvenanceTag).toHaveBeenCalledTimes(2);
    });

    it('returns empty array and zero size when empty', () => {
        const acc = new KnowledgeAccumulator();
        expect(acc.all()).toHaveLength(0);
        expect(acc.size).toBe(0);
        expect(acc.format()).toBe('');
    });
});
