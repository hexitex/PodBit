/**
 * Tests for core/keywords.ts — all exported functions.
 * Mocks DB, prompts, and models to test keyword/synonym generation logic.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>();
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>();
const mockGetSubsystemAssignments = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const {
    generateLLMDomainSynonyms,
    generateNodeKeywords,
    getNodeKeywords,
    backfillDomainSynonyms,
    backfillNodeKeywords,
    isKeywordSubsystemAvailable,
} = await import('../../core/keywords.js');

// ── Helpers ────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.resetAllMocks();
    // Default: keyword subsystem is available
    mockGetSubsystemAssignments.mockResolvedValue({ keyword: { model: 'test-model' } });
    mockGetPrompt.mockResolvedValue('test prompt');
});

// ── isKeywordSubsystemAvailable ────────────────────────────────────────────

describe('isKeywordSubsystemAvailable', () => {
    it('returns true when keyword subsystem is assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ keyword: { model: 'x' } });
        expect(await isKeywordSubsystemAvailable()).toBe(true);
    });

    it('returns false when keyword subsystem is null', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ keyword: null });
        expect(await isKeywordSubsystemAvailable()).toBe(false);
    });

    it('returns false when keyword subsystem is undefined', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});
        expect(await isKeywordSubsystemAvailable()).toBe(false);
    });

    it('returns false when getSubsystemAssignments throws', async () => {
        mockGetSubsystemAssignments.mockRejectedValue(new Error('db down'));
        expect(await isKeywordSubsystemAvailable()).toBe(false);
    });
});

// ── generateLLMDomainSynonyms ──────────────────────────────────────────────

describe('generateLLMDomainSynonyms', () => {
    it('generates and stores synonyms from well-formed JSON', async () => {
        mockQuery
            // existing synonyms query
            .mockResolvedValueOnce([{ synonym: 'existing-one' }])
            // INSERT calls succeed
            .mockResolvedValue([]);

        mockCallSubsystemModel.mockResolvedValue(
            '{"synonyms": ["alpha", "beta", "gamma"]}'
        );

        const result = await generateLLMDomainSynonyms('test-domain');

        expect(result).toEqual(['alpha', 'beta', 'gamma']);
        // Should have called getPrompt with domain and existingSynonyms
        expect(mockGetPrompt).toHaveBeenCalledWith('keyword.domain_synonyms', {
            domain: 'test-domain',
            existingSynonyms: 'existing-one',
        });
        // Should insert each synonym
        expect(mockQuery).toHaveBeenCalledTimes(4); // 1 select + 3 inserts
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO domain_synonyms'),
            ['test-domain', 'alpha']
        );
    });

    it('returns empty array when subsystem is unavailable', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});
        const result = await generateLLMDomainSynonyms('some-domain');
        expect(result).toEqual([]);
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns empty array when LLM returns unparseable response', async () => {
        mockQuery.mockResolvedValueOnce([]); // existing synonyms
        mockCallSubsystemModel.mockResolvedValue('I cannot generate synonyms.');

        const result = await generateLLMDomainSynonyms('bad-domain');
        expect(result).toEqual([]);
    });

    it('filters out too-short and too-long synonyms', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            '{"synonyms": ["a", "ok", "' + 'x'.repeat(55) + '"]}'
        );

        const result = await generateLLMDomainSynonyms('filter-domain');
        // "a" is length 1 (filtered), "ok" is length 2 (kept), long string is >50 (filtered)
        expect(result).toEqual(['ok']);
    });

    it('lowercases and trims synonyms', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            '{"synonyms": ["  Hello World  ", "UPPER"]}'
        );

        const result = await generateLLMDomainSynonyms('case-domain');
        expect(result).toEqual(['hello world', 'upper']);
    });

    it('handles no existing synonyms gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no existing synonyms
            .mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('{"synonyms": ["syn1"]}');

        await generateLLMDomainSynonyms('new-domain');
        expect(mockGetPrompt).toHaveBeenCalledWith('keyword.domain_synonyms', {
            domain: 'new-domain',
            existingSynonyms: '(none)',
        });
    });

    it('silently handles insert failures for individual synonyms', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // existing synonyms
            .mockRejectedValueOnce(new Error('unique constraint')) // first insert fails
            .mockResolvedValueOnce([]); // second insert succeeds
        mockCallSubsystemModel.mockResolvedValue('{"synonyms": ["dup", "new"]}');

        const result = await generateLLMDomainSynonyms('dup-domain');
        // Should still return both since the filter happens before insert
        expect(result).toEqual(['dup', 'new']);
    });

    it('returns empty array when callSubsystemModel throws', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM timeout'));

        const result = await generateLLMDomainSynonyms('err-domain');
        expect(result).toEqual([]);
    });

    it('prevents duplicate concurrent generation for same domain', async () => {
        mockQuery.mockResolvedValue([]);
        // Make the LLM call slow so we can trigger concurrency
        let resolveCall!: (v: string) => void;
        mockCallSubsystemModel.mockReturnValue(
            new Promise<string>(r => { resolveCall = r; })
        );

        const p1 = generateLLMDomainSynonyms('concurrent-domain');
        const p2 = generateLLMDomainSynonyms('concurrent-domain');

        // Second call should return [] immediately (in-flight guard)
        expect(await p2).toEqual([]);

        // Resolve first call
        resolveCall('{"synonyms": ["result"]}');
        const r1 = await p1;
        expect(r1).toEqual(['result']);

        // After completion, a new call should work
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('{"synonyms": ["fresh"]}');
        const r3 = await generateLLMDomainSynonyms('concurrent-domain');
        expect(r3).toEqual(['fresh']);
    });

    it('parses lenient JSON with single-quoted strings', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            `Here are synonyms: {"synonyms": ['alpha', 'beta']}`
        );

        const result = await generateLLMDomainSynonyms('lenient-domain');
        expect(result).toEqual(['alpha', 'beta']);
    });

    it('parses JSON embedded in surrounding text', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            'Sure! Here you go:\n{"synonyms": ["one", "two"]}\nHope that helps!'
        );

        const result = await generateLLMDomainSynonyms('embedded-domain');
        expect(result).toEqual(['one', 'two']);
    });
});

// ── generateNodeKeywords ───────────────────────────────────────────────────

describe('generateNodeKeywords', () => {
    it('generates and stores keywords from well-formed JSON', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            '{"keywords": ["machine learning", "neural networks"]}'
        );

        const result = await generateNodeKeywords('node-1', 'Some content about ML', 'ai');

        expect(result).toEqual(['machine learning', 'neural networks']);
        expect(mockGetPrompt).toHaveBeenCalledWith('keyword.node_keywords', {
            content: 'Some content about ML',
            domain: 'ai',
        });
        expect(mockCallSubsystemModel).toHaveBeenCalledWith('keyword', 'test prompt', {
            temperature: 0.3,
        });
    });

    it('truncates content to 500 chars for the prompt', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('{"keywords": ["kw"]}');
        const longContent = 'A'.repeat(1000);

        await generateNodeKeywords('node-long', longContent, 'dom');

        expect(mockGetPrompt).toHaveBeenCalledWith('keyword.node_keywords', {
            content: 'A'.repeat(500),
            domain: 'dom',
        });
    });

    it('uses "general" when domain is empty/falsy', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('{"keywords": ["kw"]}');

        await generateNodeKeywords('node-no-domain', 'content', '');

        expect(mockGetPrompt).toHaveBeenCalledWith('keyword.node_keywords', {
            content: 'content',
            domain: 'general',
        });
    });

    it('returns empty array when subsystem unavailable', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});
        const result = await generateNodeKeywords('node-2', 'content', 'dom');
        expect(result).toEqual([]);
    });

    it('returns empty array when LLM response has no keywords', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('No keywords found.');

        const result = await generateNodeKeywords('node-3', 'content', 'dom');
        expect(result).toEqual([]);
    });

    it('filters short and long keywords', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            '{"keywords": ["x", "ok", "' + 'z'.repeat(55) + '"]}'
        );

        const result = await generateNodeKeywords('node-filter', 'content', 'dom');
        expect(result).toEqual(['ok']);
    });

    it('lowercases and trims keywords', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            '{"keywords": ["  FOO Bar  "]}'
        );

        const result = await generateNodeKeywords('node-case', 'content', 'dom');
        expect(result).toEqual(['foo bar']);
    });

    it('prevents duplicate concurrent generation for same nodeId', async () => {
        mockQuery.mockResolvedValue([]);
        let resolveCall!: (v: string) => void;
        mockCallSubsystemModel.mockReturnValue(
            new Promise<string>(r => { resolveCall = r; })
        );

        const p1 = generateNodeKeywords('dup-node', 'content', 'dom');
        const p2 = generateNodeKeywords('dup-node', 'content', 'dom');

        expect(await p2).toEqual([]);

        resolveCall('{"keywords": ["result"]}');
        expect(await p1).toEqual(['result']);
    });

    it('returns empty array when callSubsystemModel throws', async () => {
        mockQuery.mockResolvedValue([]);
        mockCallSubsystemModel.mockRejectedValue(new Error('boom'));

        const result = await generateNodeKeywords('node-err', 'content', 'dom');
        expect(result).toEqual([]);
    });

    it('silently handles insert failures', async () => {
        mockQuery
            .mockRejectedValueOnce(new Error('constraint'))
            .mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('{"keywords": ["a1", "b2"]}');

        const result = await generateNodeKeywords('node-ins-err', 'content', 'dom');
        expect(result).toEqual(['a1', 'b2']);
    });
});

// ── getNodeKeywords ────────────────────────────────────────────────────────

describe('getNodeKeywords', () => {
    it('returns keywords from the database', async () => {
        mockQuery.mockResolvedValue([
            { keyword: 'alpha' },
            { keyword: 'beta' },
        ]);

        const result = await getNodeKeywords('node-abc');
        expect(result).toEqual(['alpha', 'beta']);
        expect(mockQuery).toHaveBeenCalledWith(
            'SELECT keyword FROM node_keywords WHERE node_id = $1',
            ['node-abc']
        );
    });

    it('returns empty array when no keywords exist', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getNodeKeywords('node-empty');
        expect(result).toEqual([]);
    });
});

// ── backfillDomainSynonyms ─────────────────────────────────────────────────

describe('backfillDomainSynonyms', () => {
    it('processes domains without LLM synonyms', async () => {
        // First query: list all domains
        mockQuery.mockResolvedValueOnce([
            { domain: 'dom-a' },
            { domain: 'dom-b' },
        ]);
        // dom-a: has LLM synonyms already
        mockQuery.mockResolvedValueOnce([{ '1': 1 }]);
        // dom-b: no LLM synonyms
        mockQuery.mockResolvedValueOnce([]);
        // dom-b: existing synonyms for generateLLMDomainSynonyms
        mockQuery.mockResolvedValueOnce([]);
        // dom-b: insert calls
        mockQuery.mockResolvedValue([]);

        mockCallSubsystemModel.mockResolvedValue('{"synonyms": ["syn1", "syn2"]}');

        const result = await backfillDomainSynonyms();
        expect(result.processed).toBe(1); // only dom-b
        expect(result.generated).toBe(2);
    });

    it('returns zeros when all domains have LLM synonyms', async () => {
        mockQuery
            .mockResolvedValueOnce([{ domain: 'dom-a' }])
            .mockResolvedValueOnce([{ '1': 1 }]); // has LLM

        const result = await backfillDomainSynonyms();
        expect(result).toEqual({ processed: 0, generated: 0 });
    });

    it('returns zeros when no domains exist', async () => {
        mockQuery.mockResolvedValueOnce([]);
        const result = await backfillDomainSynonyms();
        expect(result).toEqual({ processed: 0, generated: 0 });
    });
});

// ── backfillNodeKeywords ───────────────────────────────────────────────────

describe('backfillNodeKeywords', () => {
    it('processes nodes without keywords', async () => {
        // Nodes query
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', content: 'Node one content', domain: 'dom' },
            { id: 'n2', content: 'Node two content', domain: 'dom' },
        ]);
        // Remaining queries: insert calls for keywords
        mockQuery.mockResolvedValue([]);

        mockCallSubsystemModel
            .mockResolvedValueOnce('{"keywords": ["kw1"]}')
            .mockResolvedValueOnce('{"keywords": ["kw2", "kw3"]}');

        const result = await backfillNodeKeywords(10);
        expect(result.processed).toBe(2);
        expect(result.generated).toBe(3);
    });

    it('uses default batch size of 20', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await backfillNodeKeywords();
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT $1'),
            [20]
        );
    });

    it('respects custom batch size', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await backfillNodeKeywords(5);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT $1'),
            [5]
        );
    });

    it('returns zeros when no nodes need keywords', async () => {
        mockQuery.mockResolvedValueOnce([]);
        const result = await backfillNodeKeywords();
        expect(result).toEqual({ processed: 0, generated: 0 });
    });
});

// ── extractStringArray (tested indirectly via generateNodeKeywords) ────────

describe('extractStringArray (via generateNodeKeywords)', () => {
    beforeEach(() => {
        mockQuery.mockResolvedValue([]);
    });

    it('handles JSON with trailing comma', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '{"keywords": ["one", "two",]}'
        );
        // Trailing comma makes strict JSON fail, lenient should catch it
        const result = await generateNodeKeywords('ea-1', 'c', 'd');
        expect(result).toEqual(['one', 'two']);
    });

    it('handles response with markdown code fence', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '```json\n{"keywords": ["fenced"]}\n```'
        );
        const result = await generateNodeKeywords('ea-2', 'c', 'd');
        expect(result).toEqual(['fenced']);
    });

    it('handles mixed quote styles', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            `{"keywords": ['single', "double"]}`
        );
        const result = await generateNodeKeywords('ea-3', 'c', 'd');
        expect(result).toEqual(['single', 'double']);
    });

    it('returns empty for empty array', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"keywords": []}');
        const result = await generateNodeKeywords('ea-4', 'c', 'd');
        expect(result).toEqual([]);
    });

    it('returns empty for completely invalid response', async () => {
        mockCallSubsystemModel.mockResolvedValue('just plain text no json');
        const result = await generateNodeKeywords('ea-5', 'c', 'd');
        expect(result).toEqual([]);
    });

    it('handles extra whitespace in JSON', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '{  "keywords"  :  [  "spaced"  ]  }'
        );
        const result = await generateNodeKeywords('ea-6', 'c', 'd');
        expect(result).toEqual(['spaced']);
    });
});
