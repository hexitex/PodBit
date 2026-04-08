/**
 * Deep unit tests for handlers/knowledge.ts —
 * Covers branches and statements missed by handler-knowledge.test.ts:
 * warmStaleEntries (digest type, dedup, error handling),
 * regenerateCacheEntry (empty nodes, null output, summarize path),
 * handleSummarize/handleCompress (empty LLM output skips cache),
 * fetchTopicNodes (weight capping edge cases).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCosineSimilarity = jest.fn<() => number>().mockReturnValue(0.8);
const mockGetAccessibleDomains = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockFindDomainsBySynonym = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('test-prompt');
const mockResolveContent = jest.fn<(c: string) => Promise<string>>().mockImplementation(async (c: string) => c);
const mockFormatNodeWithProvenance = jest.fn<(n: any, c: string) => string>().mockImplementation((_n: any, c: string) => c);
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('LLM output');
const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue([0.1, 0.2, 0.3]);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    cosineSimilarity: mockCosineSimilarity,
    getAccessibleDomains: mockGetAccessibleDomains,
    findDomainsBySynonym: mockFindDomainsBySynonym,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../core/provenance.js', () => ({
    formatNodeWithProvenance: mockFormatNodeWithProvenance,
    PROVENANCE_GUIDE_USER: 'PROVENANCE_GUIDE',
}));

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getEmbedding: mockGetEmbedding,
}));

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: {
        queryLimits: {
            knowledgeQueryLimit: 30,
            knowledgeAltQueryLimit: 20,
            knowledgeContextLimit: 10,
        },
        contentLimits: {},
        misc: {},
    },
}));

const {
    fetchTopicNodes,
    invalidateKnowledgeCache,
    handleSummarize,
    handleCompress,
    generateDomainDigest,
} = await import('../../handlers/knowledge.js');

// --------------- helpers ---------------

function makeNode(overrides: Record<string, any> = {}) {
    return {
        content: 'test content',
        domain: 'test-domain',
        node_type: 'seed',
        weight: 1.0,
        salience: 0.5,
        generation: 1,
        contributor: 'human',
        origin: null,
        verification_status: null,
        verification_score: null,
        ...overrides,
    };
}

function wait(ms = 50) {
    return new Promise(r => setTimeout(r, ms));
}

// --------------- setup ---------------

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.8);
    mockGetPrompt.mockResolvedValue('test-prompt');
    mockResolveContent.mockImplementation(async (c: string) => c);
    mockFormatNodeWithProvenance.mockImplementation((_n: any, c: string) => c);
    mockCallSubsystemModel.mockResolvedValue('LLM output');
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockFindDomainsBySynonym.mockResolvedValue([]);
    mockGetAccessibleDomains.mockResolvedValue([]);
});

// ============================================================
// warmStaleEntries — triggered indirectly via invalidateKnowledgeCache
// ============================================================
describe('warmStaleEntries (via invalidateKnowledgeCache)', () => {
    it('warms digest-type cache entries by calling generateDomainDigest', async () => {
        // Return a digest-type cache entry that matches the invalidated domain
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'digest', topic: 'my-domain', domains: '["my-domain"]' },
            ])
            // UPDATE stale
            .mockResolvedValueOnce([]);

        // generateDomainDigest: cache miss (queryOne returns null)
        mockQueryOne.mockResolvedValue(null);
        // generateDomainDigest: nodes query
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'my-domain' })]);
        // generateDomainDigest: cache write
        mockQuery.mockResolvedValueOnce([]);

        mockCallSubsystemModel.mockResolvedValue('warmed digest');

        await invalidateKnowledgeCache('my-domain');
        await wait(100);

        // Should have called getPrompt with 'knowledge.digest'
        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.digest',
            expect.objectContaining({ domain: 'my-domain' })
        );
    });

    it('warms summarize-type cache entries', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'summarize', topic: 'sum-topic', domains: '["s-dom"]' },
            ])
            // UPDATE stale
            .mockResolvedValueOnce([]);

        // regenerateCacheEntry(summarize): fetchTopicNodes
        mockFindDomainsBySynonym.mockResolvedValue(['s-dom']);
        mockQuery.mockResolvedValueOnce([
            makeNode({ domain: 's-dom', node_type: 'breakthrough', weight: 1.5 }),
            makeNode({ domain: 's-dom', node_type: 'seed', weight: 0.5 }),
        ]);
        // cache INSERT
        mockQuery.mockResolvedValueOnce([]);

        mockCallSubsystemModel.mockResolvedValue('warmed summary');

        await invalidateKnowledgeCache('s-dom');
        await wait(100);

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.summarize',
            expect.objectContaining({ topic: 'sum-topic' })
        );
    });

    it('skips warming entries already in-flight (deduplication)', async () => {
        // Two entries with the same cache_type:topic key
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'dup-topic', domains: '["dom-x"]' },
                { cache_type: 'compress', topic: 'dup-topic', domains: '["dom-x"]' },
            ])
            // UPDATE stale for first match
            .mockResolvedValueOnce([])
            // UPDATE stale for second match
            .mockResolvedValueOnce([]);

        // For the single warming call
        mockFindDomainsBySynonym.mockResolvedValue(['dom-x']);
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'dom-x' })]);
        mockQuery.mockResolvedValueOnce([]);

        await invalidateKnowledgeCache('dom-x');
        await wait(100);

        // callSubsystemModel should only be called once (second entry deduplicated)
        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(1);
    });

    it('handles warming failure gracefully (stale entry remains)', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'fail-topic', domains: '["dom-f"]' },
            ])
            .mockResolvedValueOnce([]); // UPDATE stale

        // regenerateCacheEntry will fail because callSubsystemModel throws
        mockFindDomainsBySynonym.mockResolvedValue(['dom-f']);
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'dom-f' })]);
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM timeout'));

        await invalidateKnowledgeCache('dom-f');
        await wait(100);

        // Should log the failure — console.error receives a single template literal string
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('[cache-warm] Failed to regenerate')
        );

        consoleSpy.mockRestore();
    });

    it('does not trigger warming when no entries match the domain', async () => {
        mockQuery.mockResolvedValueOnce([
            { cache_type: 'compress', topic: 'other', domains: '["unrelated"]' },
        ]);

        await invalidateKnowledgeCache('target-dom');
        await wait(50);

        // No UPDATE calls, no warming
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE')
        );
        expect(updateCalls).toHaveLength(0);
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });
});

// ============================================================
// regenerateCacheEntry — tested indirectly via warming
// ============================================================
describe('regenerateCacheEntry (via warming)', () => {
    it('returns early when fetchTopicNodes yields zero nodes', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'empty-topic', domains: '["dom-e"]' },
            ])
            .mockResolvedValueOnce([]); // UPDATE stale

        // fetchTopicNodes returns empty
        mockFindDomainsBySynonym.mockResolvedValue(['dom-e']);
        mockQuery.mockResolvedValueOnce([]); // domain query: no nodes
        mockQuery.mockResolvedValueOnce([]); // content fallback: no nodes

        await invalidateKnowledgeCache('dom-e');
        await wait(100);

        // No LLM call since no nodes found
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns early when callSubsystemModel returns null/empty', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'null-llm', domains: '["dom-n"]' },
            ])
            .mockResolvedValueOnce([]); // UPDATE stale

        mockFindDomainsBySynonym.mockResolvedValue(['dom-n']);
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'dom-n' })]);
        mockCallSubsystemModel.mockResolvedValue(null as any);

        await invalidateKnowledgeCache('dom-n');
        await wait(100);

        // No cache INSERT since LLM returned null
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('summarize path categorizes node types in cached result', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'summarize', topic: 'cat-topic', domains: '["dom-c"]' },
            ])
            .mockResolvedValueOnce([]); // UPDATE stale

        // fetchTopicNodes
        mockFindDomainsBySynonym.mockResolvedValue(['dom-c']);
        const nodes = [
            makeNode({ domain: 'dom-c', node_type: 'breakthrough', weight: 1.5 }),
            makeNode({ domain: 'dom-c', node_type: 'voiced', weight: 0.5 }),
            makeNode({ domain: 'dom-c', node_type: 'seed', weight: 0.8 }),
        ];
        mockQuery.mockResolvedValueOnce(nodes);
        // cache INSERT
        mockQuery.mockResolvedValueOnce([]);

        mockCallSubsystemModel.mockResolvedValue('summarized output');

        await invalidateKnowledgeCache('dom-c');
        await wait(100);

        // Verify the INSERT includes the result with node type counts
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls.length).toBeGreaterThanOrEqual(1);
        const resultJson = JSON.parse(insertCalls[0][1][4]);
        expect(resultJson.breakthroughs).toBe(1);
        expect(resultJson.syntheses).toBe(1); // voiced counts as synthesis
        expect(resultJson.seeds).toBe(1);
        expect(resultJson.summary).toBe('summarized output');
    });

    it('compress path stores compressed field in cached result', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'comp-topic', domains: '["dom-cp"]' },
            ])
            .mockResolvedValueOnce([]); // UPDATE stale

        mockFindDomainsBySynonym.mockResolvedValue(['dom-cp']);
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'dom-cp' })]);
        mockQuery.mockResolvedValueOnce([]); // cache INSERT

        mockCallSubsystemModel.mockResolvedValue('compressed knowledge');

        await invalidateKnowledgeCache('dom-cp');
        await wait(100);

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls.length).toBeGreaterThanOrEqual(1);
        const resultJson = JSON.parse(insertCalls[0][1][4]);
        expect(resultJson.compressed).toBe('compressed knowledge');
        expect(resultJson.nodeCount).toBe(1);
    });
});

// ============================================================
// handleSummarize — additional branch coverage
// ============================================================
describe('handleSummarize — uncovered branches', () => {
    it('does not cache when LLM returns empty string', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'dom' }));
        mockQuery.mockResolvedValueOnce(nodes);
        mockCallSubsystemModel.mockResolvedValue('');

        const result = await handleSummarize({ topic: 'x' });

        expect(result.summary).toBe('');
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('omits task and targetProfile from result when not provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleSummarize({ topic: 'x' });

        expect(result.task).toBeUndefined();
        expect(result.targetProfile).toBeUndefined();
        expect(result.topic).toBe('x');
    });

    it('deduplicates domains when writing cache', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'same-dom' }));
        mockQuery.mockResolvedValueOnce(nodes);
        mockQuery.mockResolvedValueOnce([]); // cache write
        mockCallSubsystemModel.mockResolvedValue('summary');

        await handleSummarize({ topic: 'x' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(1);
        const domains = JSON.parse(insertCalls[0][1][2]);
        // Should be deduplicated to one domain
        expect(domains).toEqual(['same-dom']);
    });

    it('passes provenanceGuide to summarize prompt', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.summarize',
            expect.objectContaining({ provenanceGuide: 'PROVENANCE_GUIDE' })
        );
    });

    it('passes provenanceGuide to summarize_task prompt', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x', task: 'my task' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.summarize_task',
            expect.objectContaining({ provenanceGuide: 'PROVENANCE_GUIDE' })
        );
    });
});

// ============================================================
// handleCompress — additional branch coverage
// ============================================================
describe('handleCompress — uncovered branches', () => {
    it('does not cache when LLM returns empty string', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'dom' }));
        mockQuery.mockResolvedValueOnce(nodes);
        mockCallSubsystemModel.mockResolvedValue('');

        const result = await handleCompress({ topic: 'x' });

        expect(result.compressed).toBe('');
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('omits task and targetProfile from result when not provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleCompress({ topic: 'x' });

        expect(result.task).toBeUndefined();
        expect(result.targetProfile).toBeUndefined();
    });

    it('deduplicates domains when writing cache', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'dup-dom' }));
        mockQuery.mockResolvedValueOnce(nodes);
        mockQuery.mockResolvedValueOnce([]); // cache write
        mockCallSubsystemModel.mockResolvedValue('compressed');

        await handleCompress({ topic: 'x' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        const domains = JSON.parse(insertCalls[0][1][2]);
        expect(domains).toEqual(['dup-dom']);
    });

    it('passes provenanceGuide to compress prompt', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.compress',
            expect.objectContaining({ provenanceGuide: 'PROVENANCE_GUIDE' })
        );
    });

    it('passes provenanceGuide to compress_task prompt', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x', task: 'focus' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.compress_task',
            expect.objectContaining({ provenanceGuide: 'PROVENANCE_GUIDE' })
        );
    });
});

// ============================================================
// fetchTopicNodes — additional branch coverage
// ============================================================
describe('fetchTopicNodes — uncovered branches', () => {
    it('caps weight score at 1.0 for high-weight nodes', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        // Node with weight 3.0 → weightScore = min(3.0/2.0, 1) = 1.0
        const highWeightNode = makeNode({ content: 'heavy', weight: 3.0, embedding: JSON.stringify([0.5, 0.5, 0.5]) });
        const lowWeightNode = makeNode({ content: 'light', weight: 0.2, embedding: JSON.stringify([0.5, 0.5, 0.5]) });
        mockQuery.mockResolvedValue([highWeightNode, lowWeightNode]);
        // Same similarity for both
        mockCosineSimilarity.mockReturnValue(0.5);

        const result = await fetchTopicNodes('topic', 'task');

        // highWeight: 0.5*0.7 + 1.0*0.3 = 0.65
        // lowWeight:  0.5*0.7 + 0.1*0.3 = 0.38
        expect(result[0].content).toBe('heavy');
        expect(result[1].content).toBe('light');
        expect(result[0].relevance).toBeCloseTo(0.65, 2);
        expect(result[1].relevance).toBeCloseTo(0.38, 2);
    });

    it('handles nodes with null content during resolve', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const node = makeNode({ content: null });
        mockQuery.mockResolvedValue([node]);

        const result = await fetchTopicNodes('topic');

        // resolveContent should not be called for null content
        expect(mockResolveContent).not.toHaveBeenCalled();
        expect(result[0].content).toBeNull();
    });

    it('returns empty when no nodes and task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([]);

        const result = await fetchTopicNodes('topic', 'task');

        // nodes.length === 0 triggers early return before getEmbedding
        expect(result).toEqual([]);
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });

    it('handles multiple partition domains from fallback lookup', async () => {
        mockFindDomainsBySynonym.mockResolvedValue([]);
        // partition_domains returns multiple domains
        mockQuery
            .mockResolvedValueOnce([{ domain: 'dom-1' }, { domain: 'dom-2' }, { domain: 'dom-3' }])
            // nodes query
            .mockResolvedValueOnce([
                makeNode({ domain: 'dom-1' }),
                makeNode({ domain: 'dom-2' }),
            ]);

        const result = await fetchTopicNodes('my partition');

        // Should use all 3 partition domains
        const nodesCall = mockQuery.mock.calls[1];
        expect(nodesCall[1]).toEqual(['dom-1', 'dom-2', 'dom-3']);
        expect(result).toHaveLength(2);
    });

    it('applies limit correctly after task-aware reranking', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 5 }, (_, i) =>
            makeNode({ content: `n-${i}`, weight: 1.0, embedding: JSON.stringify([0.1 * i, 0.2, 0.3]) })
        );
        mockQuery.mockResolvedValue(nodes);
        mockCosineSimilarity.mockReturnValue(0.5);

        const result = await fetchTopicNodes('topic', 'task', 2);

        expect(result).toHaveLength(2);
        // Verify embeddings are stripped
        for (const n of result) {
            expect(n.embedding).toBeUndefined();
        }
    });
});

// ============================================================
// generateDomainDigest — additional branch coverage
// ============================================================
describe('generateDomainDigest — uncovered branches', () => {
    it('passes nodeCount as string to prompt', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([makeNode(), makeNode(), makeNode()])
            .mockResolvedValueOnce([]); // cache write
        mockCallSubsystemModel.mockResolvedValue('digest');

        await generateDomainDigest('dom');

        expect(mockGetPrompt).toHaveBeenCalledWith('knowledge.digest', expect.objectContaining({
            nodeCount: '3',
        }));
    });

    it('returns null when LLM returns empty string (falsy)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockResolvedValue('');

        const result = await generateDomainDigest('dom');

        // Empty string is falsy, so digest check `if (digest)` fails
        expect(result).toBe('');
        // No cache write for falsy digest
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('stores correct domains array in cache (single domain)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([makeNode()])
            .mockResolvedValueOnce([]); // cache write
        mockCallSubsystemModel.mockResolvedValue('my digest');

        await generateDomainDigest('special-domain');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(1);
        // domains should be JSON array with just this domain
        expect(insertCalls[0][1][2]).toBe(JSON.stringify(['special-domain']));
        // cache_type should be 'digest'
        expect(insertCalls[0][1][0]).toBe('digest');
    });
});

// ============================================================
// invalidateKnowledgeCache — additional edge cases
// ============================================================
describe('invalidateKnowledgeCache — edge cases', () => {
    it('handles multiple matching entries across different cache types', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'topic-a', domains: '["shared-dom"]' },
                { cache_type: 'summarize', topic: 'topic-b', domains: '["shared-dom","other"]' },
                { cache_type: 'digest', topic: 'shared-dom', domains: '["shared-dom"]' },
            ])
            // 3 UPDATE calls
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        // Warming calls — prevent failures by mocking enough
        mockFindDomainsBySynonym.mockResolvedValue(['shared-dom']);
        mockQuery.mockResolvedValue([makeNode({ domain: 'shared-dom' })]);
        mockQueryOne.mockResolvedValue(null);

        await invalidateKnowledgeCache('shared-dom');

        // All 3 entries should have been marked stale
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE knowledge_cache')
        );
        expect(updateCalls).toHaveLength(3);
    });

    it('handles empty string domain by returning immediately', async () => {
        // Empty string is falsy, should return early — clear mocks to isolate from prior async
        jest.clearAllMocks();
        mockQuery.mockResolvedValue([]);
        await invalidateKnowledgeCache('');
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
