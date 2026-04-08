/**
 * Unit tests for handlers/knowledge.ts —
 * fetchTopicNodes, invalidateKnowledgeCache, handleSummarize, handleCompress, generateDomainDigest.
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

// --------------- tests ---------------

beforeEach(() => {
    jest.resetAllMocks();
    // Re-apply common defaults after reset
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
// fetchTopicNodes
// ============================================================
describe('fetchTopicNodes', () => {
    it('uses explicit domains via getAccessibleDomains when provided', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom-a', 'dom-b']);
        const nodes = [makeNode({ domain: 'dom-a' })];
        mockQuery.mockResolvedValue(nodes);

        const result = await fetchTopicNodes('topic', null, 25, ['dom-a']);

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('dom-a');
        expect(mockFindDomainsBySynonym).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
    });

    it('deduplicates expanded domains from multiple explicit domains', async () => {
        mockGetAccessibleDomains
            .mockResolvedValueOnce(['dom-a', 'shared'])
            .mockResolvedValueOnce(['dom-b', 'shared']);
        mockQuery.mockResolvedValue([makeNode()]);

        await fetchTopicNodes('topic', null, 25, ['dom-a', 'dom-b']);

        // The SQL should contain placeholders for deduplicated domains
        const sqlCall = mockQuery.mock.calls[0];
        const params = sqlCall[1] as string[];
        // 3 unique domains: dom-a, shared, dom-b
        expect(params).toHaveLength(3);
        expect(new Set(params)).toEqual(new Set(['dom-a', 'shared', 'dom-b']));
    });

    it('infers domains via findDomainsBySynonym when no explicit domains', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['matched-domain']);
        mockQuery.mockResolvedValue([makeNode({ domain: 'matched-domain' })]);

        await fetchTopicNodes('some topic');

        expect(mockFindDomainsBySynonym).toHaveBeenCalledWith('some topic');
        expect(mockGetAccessibleDomains).not.toHaveBeenCalled();
    });

    it('falls back to partition_domains lookup when synonym match is empty', async () => {
        mockFindDomainsBySynonym.mockResolvedValue([]);
        // First call: partition_domains lookup
        mockQuery
            .mockResolvedValueOnce([{ domain: 'part-dom' }])
            // Second call: actual nodes query
            .mockResolvedValueOnce([makeNode({ domain: 'part-dom' })]);

        await fetchTopicNodes('My Topic');

        // Should kebab-case the topic
        expect(mockQuery.mock.calls[0][1]).toEqual(['my-topic']);
    });

    it('uses kebab-cased topic as domain when partition lookup returns nothing', async () => {
        mockFindDomainsBySynonym.mockResolvedValue([]);
        // partition_domains: empty
        mockQuery
            .mockResolvedValueOnce([])
            // nodes query
            .mockResolvedValueOnce([makeNode()]);

        await fetchTopicNodes('Test Topic');

        // The nodes query should use 'test-topic' as domain filter
        const nodesCall = mockQuery.mock.calls[1];
        expect(nodesCall[1]).toEqual(['test-topic']);
    });

    it('performs content fallback search when domain match returns < 10 nodes and no explicit domains', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const fewNodes = Array.from({ length: 5 }, (_, i) =>
            makeNode({ content: `node-${i}` })
        );
        const contentNodes = [makeNode({ content: 'content-match' })];

        mockQuery
            .mockResolvedValueOnce(fewNodes)    // domain query
            .mockResolvedValueOnce(contentNodes); // content fallback

        const result = await fetchTopicNodes('my topic');

        expect(result).toHaveLength(6); // 5 + 1 new from content search
        // Second query is content LIKE search
        expect(mockQuery.mock.calls[1][1]).toEqual(['%my topic%']);
    });

    it('deduplicates content fallback nodes against domain nodes', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const domainNodes = [makeNode({ content: 'shared' })];
        const contentNodes = [makeNode({ content: 'shared' }), makeNode({ content: 'unique' })];

        mockQuery
            .mockResolvedValueOnce(domainNodes)
            .mockResolvedValueOnce(contentNodes);

        const result = await fetchTopicNodes('topic');

        expect(result).toHaveLength(2); // 'shared' (from domain) + 'unique' (from content)
    });

    it('skips content fallback when >= 10 domain nodes', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const tenNodes = Array.from({ length: 10 }, (_, i) =>
            makeNode({ content: `n-${i}` })
        );
        mockQuery.mockResolvedValueOnce(tenNodes);

        await fetchTopicNodes('topic');

        // Only one query — no content fallback
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('skips content fallback when explicit domains are given (even if < 10)', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValueOnce([makeNode()]);

        await fetchTopicNodes('topic', null, 25, ['dom']);

        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('resolves number variables in node content', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode({ content: '[[[X1]]]' })]);
        mockResolveContent.mockResolvedValue('42');

        const result = await fetchTopicNodes('topic');

        expect(mockResolveContent).toHaveBeenCalledWith('[[[X1]]]');
        expect(result[0].content).toBe('42');
    });

    it('returns weight-sorted nodes when no task', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode(), makeNode()]);

        const result = await fetchTopicNodes('topic', null, 1);

        expect(result).toHaveLength(1); // limited to 1
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });

    it('returns empty array when no nodes found and no task', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([]);

        const result = await fetchTopicNodes('topic');

        expect(result).toEqual([]);
    });

    it('performs task-aware reranking with embeddings when task given', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodeA = makeNode({ content: 'a', weight: 2.0, embedding: JSON.stringify([0.9, 0.8, 0.7]) });
        const nodeB = makeNode({ content: 'b', weight: 0.5, embedding: JSON.stringify([0.1, 0.1, 0.1]) });
        mockQuery.mockResolvedValue([nodeA, nodeB]);
        mockCosineSimilarity
            .mockReturnValueOnce(0.3)  // nodeA similarity
            .mockReturnValueOnce(0.95); // nodeB similarity

        const result = await fetchTopicNodes('topic', 'my task', 25);

        expect(mockGetEmbedding).toHaveBeenCalledWith('my task');
        // nodeB has higher task similarity (0.95) so should rank first
        // nodeB: 0.95*0.7 + (0.25)*0.3 = 0.665 + 0.075 = 0.74
        // nodeA: 0.3*0.7 + (1.0)*0.3 = 0.21 + 0.3 = 0.51
        expect(result[0].content).toBe('b');
        expect(result[1].content).toBe('a');
    });

    it('falls back to weight ordering when embedding service unavailable', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode(), makeNode()]);
        mockGetEmbedding.mockResolvedValue(null);

        const result = await fetchTopicNodes('topic', 'task', 2);

        expect(result).toHaveLength(2);
    });

    it('handles embedding as pre-parsed array', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const node = makeNode({ embedding: [0.1, 0.2, 0.3] });
        mockQuery.mockResolvedValue([node]);

        await fetchTopicNodes('topic', 'task');

        // Should call cosineSimilarity directly, not JSON.parse
        expect(mockCosineSimilarity).toHaveBeenCalledWith([0.1, 0.2, 0.3], [0.1, 0.2, 0.3]);
    });

    it('handles node without embedding during task reranking', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const node = makeNode({ content: 'no-emb' });
        mockQuery.mockResolvedValue([node]);

        const result = await fetchTopicNodes('topic', 'task');

        expect(result[0].taskSimilarity).toBe(0);
    });

    it('strips embedding from returned nodes after reranking', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const node = makeNode({ embedding: JSON.stringify([1, 2, 3]) });
        mockQuery.mockResolvedValue([node]);

        const result = await fetchTopicNodes('topic', 'task');

        expect(result[0].embedding).toBeUndefined();
    });

    it('includes embedding column in SELECT when task provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([]);

        await fetchTopicNodes('topic', 'task');

        const sql = mockQuery.mock.calls[0][0] as string;
        expect(sql).toContain('embedding');
    });

    it('excludes embedding column from SELECT when no task', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([]);

        await fetchTopicNodes('topic', null);

        const sql = mockQuery.mock.calls[0][0] as string;
        // The main select should not include 'embedding' when no task
        // But it does include provenance cols
        expect(sql).not.toContain('embedding');
    });
});

// ============================================================
// invalidateKnowledgeCache
// ============================================================
describe('invalidateKnowledgeCache', () => {
    it('returns immediately for null domain', async () => {
        await invalidateKnowledgeCache(null);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('marks matching cache entries as stale', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'mytopic', domains: '["dom-a","dom-b"]' },
                { cache_type: 'summarize', topic: 'other', domains: '["dom-c"]' },
            ])
            // UPDATE call
            .mockResolvedValueOnce([])
            // regenerateCacheEntry internals — fetchTopicNodes domain lookup
            .mockResolvedValue([]);

        // Provide dom-a as the changed domain
        await invalidateKnowledgeCache('dom-a');

        // Should have called UPDATE for the first entry (matches dom-a) but not the second
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE knowledge_cache')
        );
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0][1]).toEqual(['compress', 'mytopic']);
    });

    it('skips entries with malformed JSON domains', async () => {
        mockQuery.mockResolvedValueOnce([
            { cache_type: 'compress', topic: 't', domains: 'not-json' },
        ]);

        // Should not throw
        await invalidateKnowledgeCache('dom');
        // No UPDATE calls since JSON parse failed
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE')
        );
        expect(updateCalls).toHaveLength(0);
    });

    it('handles cache table not existing', async () => {
        mockQuery.mockRejectedValueOnce(new Error('no such table'));

        await expect(invalidateKnowledgeCache('dom')).resolves.toBeUndefined();
    });

    it('triggers background warming for stale entries', async () => {
        // Return one stale-able entry
        mockQuery
            .mockResolvedValueOnce([
                { cache_type: 'compress', topic: 'warm-me', domains: '["d1"]' },
            ])
            // UPDATE
            .mockResolvedValueOnce([]);

        // For background warming (regenerateCacheEntry):
        // findDomainsBySynonym
        mockFindDomainsBySynonym.mockResolvedValue(['d1']);
        // fetchTopicNodes query
        mockQuery.mockResolvedValueOnce([makeNode({ domain: 'd1' })]);
        // cache INSERT
        mockQuery.mockResolvedValue([]);

        await invalidateKnowledgeCache('d1');

        // Wait a tick for fire-and-forget to start
        await new Promise(r => setTimeout(r, 50));

        // callSubsystemModel should have been called for regeneration
        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });
});

// ============================================================
// handleSummarize
// ============================================================
describe('handleSummarize', () => {
    it('returns error when topic is missing', async () => {
        const result = await handleSummarize({});
        expect(result).toEqual({ error: 'topic is required' });
    });

    it('returns cached result on cache hit (non-stale)', async () => {
        const cachedResult = { topic: 'x', summary: 'cached summary', nodeCount: 5 };
        mockQueryOne.mockResolvedValue({
            result: JSON.stringify(cachedResult),
            node_count: 5,
            created_at: '2025-01-01',
            stale: 0,
            changes_since_cached: 0,
        });

        const result = await handleSummarize({ topic: 'x' });

        expect(result).toEqual({ ...cachedResult, cached: true, cachedAt: '2025-01-01' });
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns stale cached result with staleness metadata', async () => {
        const cachedResult = { topic: 'x', summary: 'stale summary' };
        mockQueryOne.mockResolvedValue({
            result: JSON.stringify(cachedResult),
            node_count: 3,
            created_at: '2025-01-01',
            stale: 1,
            changes_since_cached: 4,
        });

        const result = await handleSummarize({ topic: 'x' });

        expect(result.stale).toBe(true);
        expect(result.changesSinceCached).toBe(4);
        expect(result.cached).toBe(true);
    });

    it('skips cache when task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x', task: 'do something' });

        // Should not call queryOne for cache
        expect(mockQueryOne).not.toHaveBeenCalled();
        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });

    it('skips cache when explicit domains are provided', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x', domains: ['dom'] });

        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('returns error when no nodes found', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        // domain query returns empty, content fallback returns empty
        mockQuery.mockResolvedValue([]);

        const result = await handleSummarize({ topic: 'empty' });

        expect(result.error).toContain('No knowledge found');
    });

    it('uses summarize_task prompt when task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x', task: 'my task' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.summarize_task',
            expect.objectContaining({ topic: 'x', task: 'my task' })
        );
    });

    it('uses summarize prompt when no task', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.summarize',
            expect.objectContaining({ topic: 'x' })
        );
    });

    it('returns LLM error on callSubsystemModel failure', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockRejectedValue(new Error('model down'));

        const result = await handleSummarize({ topic: 'x' });

        expect(result.error).toContain('Compress model failed for summarize');
        expect(result.error).toContain('model down');
    });

    it('returns structured result with correct node type counts', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = [
            makeNode({ node_type: 'breakthrough', weight: 1.5 }),
            makeNode({ node_type: 'synthesis', weight: 0.5 }),
            makeNode({ node_type: 'voiced', weight: 0.5 }),
            makeNode({ node_type: 'seed', weight: 0.5 }),
            makeNode({ node_type: 'seed', weight: 1.4 }), // also counts as breakthrough (weight > 1.3)
        ];
        mockQuery.mockResolvedValue(nodes);

        const result = await handleSummarize({ topic: 'x' });

        expect(result.nodeCount).toBe(5);
        expect(result.breakthroughs).toBe(2); // breakthrough + weight > 1.3
        expect(result.syntheses).toBe(2);     // synthesis + voiced
        expect(result.seeds).toBe(2);
    });

    it('includes task and targetProfile in result when provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleSummarize({ topic: 'x', task: 't', targetProfile: 'small' });

        expect(result.task).toBe('t');
        expect(result.targetProfile).toBe('small');
    });

    it('writes to cache when no task and summary is non-empty', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode({ domain: 'dom' })]);
        mockCallSubsystemModel.mockResolvedValue('summary text');

        await handleSummarize({ topic: 'x' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO knowledge_cache')
        );
        expect(insertCalls).toHaveLength(1);
        expect(insertCalls[0][1]).toEqual(
            expect.arrayContaining(['summarize', 'x'])
        );
    });

    it('does not write to cache when task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleSummarize({ topic: 'x', task: 't' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO knowledge_cache')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('handles cache write failure gracefully', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'dom' }));
        // domain query (>= 10 nodes so no content fallback)
        mockQuery.mockResolvedValueOnce(nodes);
        // cache write fails
        mockQuery.mockRejectedValueOnce(new Error('db error'));

        const result = await handleSummarize({ topic: 'x' });

        // Should still return the result
        expect(result.summary).toBe('LLM output');
    });

    it('handles cache lookup failure gracefully', async () => {
        mockQueryOne.mockRejectedValue(new Error('no such table'));
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleSummarize({ topic: 'x' });

        // Should fall through to LLM call
        expect(result.summary).toBe('LLM output');
    });
});

// ============================================================
// handleCompress
// ============================================================
describe('handleCompress', () => {
    it('returns error when topic is missing', async () => {
        const result = await handleCompress({});
        expect(result).toEqual({ error: 'topic is required' });
    });

    it('returns cached result on cache hit (non-stale)', async () => {
        const cachedResult = { topic: 'x', compressed: 'cached compress', nodeCount: 3 };
        mockQueryOne.mockResolvedValue({
            result: JSON.stringify(cachedResult),
            node_count: 3,
            created_at: '2025-02-01',
            stale: 0,
            changes_since_cached: 0,
        });

        const result = await handleCompress({ topic: 'x' });

        expect(result).toEqual({ ...cachedResult, cached: true, cachedAt: '2025-02-01' });
    });

    it('returns stale cached result with metadata', async () => {
        const cachedResult = { topic: 'x', compressed: 'old' };
        mockQueryOne.mockResolvedValue({
            result: JSON.stringify(cachedResult),
            stale: 1,
            changes_since_cached: 2,
            created_at: '2025-01-01',
        });

        const result = await handleCompress({ topic: 'x' });

        expect(result.stale).toBe(true);
        expect(result.changesSinceCached).toBe(2);
    });

    it('skips cache when task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x', task: 'do it' });

        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('skips cache when explicit domains are provided', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x', domains: ['dom'] });

        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('returns error when no nodes found', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([]);

        const result = await handleCompress({ topic: 'empty' });

        expect(result.error).toContain('No knowledge found');
    });

    it('uses compress_task prompt when task given', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x', task: 'focus' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.compress_task',
            expect.objectContaining({ topic: 'x', task: 'focus' })
        );
    });

    it('uses compress prompt when no task', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x' });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'knowledge.compress',
            expect.objectContaining({ topic: 'x' })
        );
    });

    it('returns LLM error on callSubsystemModel failure', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockRejectedValue(new Error('timeout'));

        const result = await handleCompress({ topic: 'x' });

        expect(result.error).toContain('Compress model failed');
        expect(result.error).toContain('timeout');
    });

    it('returns result with compressed field', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockResolvedValue('dense output');

        const result = await handleCompress({ topic: 'x' });

        expect(result.compressed).toBe('dense output');
        expect(result.nodeCount).toBe(1);
    });

    it('includes task and targetProfile in result when provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleCompress({ topic: 'x', task: 't', targetProfile: 'large' });

        expect(result.task).toBe('t');
        expect(result.targetProfile).toBe('large');
    });

    it('writes to cache when no task and compressed is non-empty', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode({ domain: 'd' })]);

        await handleCompress({ topic: 'x' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO knowledge_cache')
        );
        expect(insertCalls).toHaveLength(1);
        expect(insertCalls[0][1]).toEqual(
            expect.arrayContaining(['compress', 'x'])
        );
    });

    it('does not write to cache when task is provided', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        await handleCompress({ topic: 'x', task: 't' });

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO knowledge_cache')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('handles cache write failure gracefully', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        const nodes = Array.from({ length: 10 }, () => makeNode({ domain: 'd' }));
        // domain query (>= 10 nodes so no content fallback)
        mockQuery.mockResolvedValueOnce(nodes);
        // cache write fails
        mockQuery.mockRejectedValueOnce(new Error('write fail'));

        const result = await handleCompress({ topic: 'x' });

        expect(result.compressed).toBe('LLM output');
    });

    it('handles cache lookup failure gracefully', async () => {
        mockQueryOne.mockRejectedValue(new Error('no table'));
        mockFindDomainsBySynonym.mockResolvedValue(['dom']);
        mockQuery.mockResolvedValue([makeNode()]);

        const result = await handleCompress({ topic: 'x' });

        expect(result.compressed).toBe('LLM output');
    });
});

// ============================================================
// generateDomainDigest
// ============================================================
describe('generateDomainDigest', () => {
    it('returns cached digest on cache hit', async () => {
        mockQueryOne.mockResolvedValue({
            result: JSON.stringify({ digest: 'cached digest' }),
        });

        const result = await generateDomainDigest('my-domain');

        expect(result).toBe('cached digest');
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns null when no nodes exist for domain', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await generateDomainDigest('empty-domain');

        expect(result).toBeNull();
    });

    it('calls LLM and returns digest when cache miss and nodes exist', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([makeNode()])  // nodes query
            .mockResolvedValueOnce([]);            // cache write
        mockCallSubsystemModel.mockResolvedValue('fresh digest');

        const result = await generateDomainDigest('dom');

        expect(result).toBe('fresh digest');
        expect(mockGetPrompt).toHaveBeenCalledWith('knowledge.digest', expect.objectContaining({
            domain: 'dom',
        }));
    });

    it('writes digest to cache after generation', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([makeNode()])
            .mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue('digest text');

        await generateDomainDigest('dom');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE INTO knowledge_cache')
        );
        expect(insertCalls).toHaveLength(1);
        expect(insertCalls[0][1]).toEqual(
            expect.arrayContaining(['digest', 'dom'])
        );
    });

    it('returns null when LLM call fails', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockRejectedValue(new Error('fail'));

        const result = await generateDomainDigest('dom');

        expect(result).toBeNull();
    });

    it('does not write to cache when digest is null/empty from LLM', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockResolvedValue(null as any);

        await generateDomainDigest('dom');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT OR REPLACE')
        );
        expect(insertCalls).toHaveLength(0);
    });

    it('handles cache lookup failure gracefully', async () => {
        mockQueryOne.mockRejectedValue(new Error('no table'));
        mockQuery.mockResolvedValue([makeNode()]);
        mockCallSubsystemModel.mockResolvedValue('digest');

        const result = await generateDomainDigest('dom');

        expect(result).toBe('digest');
    });

    it('handles cache write failure gracefully', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery
            .mockResolvedValueOnce([makeNode()])
            .mockRejectedValueOnce(new Error('db error'));
        mockCallSubsystemModel.mockResolvedValue('digest');

        const result = await generateDomainDigest('dom');

        expect(result).toBe('digest');
    });

    it('passes provenance guide to prompt', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([makeNode()]);

        await generateDomainDigest('dom');

        expect(mockGetPrompt).toHaveBeenCalledWith('knowledge.digest', expect.objectContaining({
            provenanceGuide: 'PROVENANCE_GUIDE',
        }));
    });
});
