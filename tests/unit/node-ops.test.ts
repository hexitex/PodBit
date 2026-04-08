/**
 * Unit tests for core/node-ops.ts — covers:
 * - toDomainSlug: kebab-case conversion, length cap, special chars
 * - sampleNodes: domain and no-domain paths, partition-aware
 * - createNode: dedup gate, number variable extraction, content hash
 * - createEdge: upsert behavior
 * - updateNodeSalience / updateNodeWeight: cap behavior
 * - decayAll: salience/weight decay paths
 * - findDomainsBySynonym: synonym, exact, partial, word match
 * - editNodeContent: validation, embedding regen, hash update
 * - setExcludedFromBriefs: toggle behavior
 * - inferDomain: synonym, embedding, LLM, fallback tiers
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockWeightedRandom = jest.fn<(expr: string) => string>();
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<any>>();
const mockMeasureSpecificity = jest.fn<(...args: any[]) => number>();
const mockL2Normalize = jest.fn<(...args: any[]) => any>();
const mockEmbeddingToBuffer = jest.fn<(...args: any[]) => any>();
const mockCosineSimilarity = jest.fn<(...args: any[]) => number>();
const mockParseEmbedding = jest.fn<(...args: any[]) => any>();
const mockGetAccessibleDomains = jest.fn<(...args: any[]) => Promise<string[]>>();
const mockEnsurePartition = jest.fn<(...args: any[]) => Promise<void>>();
const mockLogDecision = jest.fn<(...args: any[]) => Promise<void>>();
const mockEmitActivity = jest.fn();
const mockComputeContentHash = jest.fn<(...args: any[]) => string>();
const mockLogOperation = jest.fn<(...args: any[]) => Promise<void>>();
const mockCheckDuplicate = jest.fn<(...args: any[]) => Promise<any>>();

const mockAppConfig: any = {
    dedup: { embeddingSimilarityThreshold: 0.9 },
    numberVariables: { enabled: false },
    autonomousCycles: { autorating: { enabled: false, inlineEnabled: false } },
    magicNumbers: { salienceRescueDays: 7, domainInferenceThreshold: 0.7 },
    engine: { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95 },
    labVerify: { failedSalienceCap: 0.5 },
};

const mockEngineConfig: any = {
    salienceFloor: 0.1,
    salienceCeiling: 1.0,
    salienceDecay: 0.99,
    weightDecay: 0.995,
    weightCeiling: 3.0,
    nodes: { defaultWeight: 1.0, defaultSalience: 0.5 },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    weightedRandom: mockWeightedRandom,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    getEmbeddingModelName: jest.fn(() => 'test-model'),
    callSubsystemModel: jest.fn(async () => '{}'),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
    appConfig: mockAppConfig,
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockEngineConfig,
}));

jest.unstable_mockModule('../../core/specificity.js', () => ({
    measureSpecificity: mockMeasureSpecificity,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    l2Normalize: mockL2Normalize,
    embeddingToBuffer: mockEmbeddingToBuffer,
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
    ensurePartition: mockEnsurePartition,
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    checkDuplicate: mockCheckDuplicate,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    registerNodeVariables: jest.fn(async () => ({ varIds: [], annotatedContent: '' })),
    resolveContent: jest.fn(async (s: string) => s),
}));

jest.unstable_mockModule('../../core/keywords.js', () => ({
    generateNodeKeywords: jest.fn(async () => {}),
    generateLLMDomainSynonyms: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: jest.fn(() => '[test]'),
}));

jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleRate: jest.fn(async () => {}),
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: jest.fn(async () => ''),
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: jest.fn(),
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: jest.fn(async () => 'prompt'),
}));

const {
    sampleNodes,
    createNode,
    createEdge,
    findDomainsBySynonym,
    updateNodeSalience,
    updateNodeWeight,
    decayAll,
    editNodeContent,
    setExcludedFromBriefs,
    inferDomain,
    toDomainSlug,
} = await import('../../core/node-ops.js');

// ---- Setup ----

beforeEach(() => {
    jest.clearAllMocks();
    mockWeightedRandom.mockReturnValue('ORDER BY RANDOM()');
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockMeasureSpecificity.mockReturnValue(5.0);
    mockL2Normalize.mockImplementation((v: any) => v);
    mockEmbeddingToBuffer.mockReturnValue(Buffer.from([1, 2, 3]));
    mockGetAccessibleDomains.mockResolvedValue(['test-domain']);
    mockComputeContentHash.mockReturnValue('hash123');
    mockLogOperation.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockEnsurePartition.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockAppConfig.numberVariables = { enabled: false };
    mockAppConfig.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
    mockAppConfig.engine = { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95 };
});

// =========================================================================
// toDomainSlug
// =========================================================================

describe('toDomainSlug', () => {
    it('converts to lowercase kebab-case', () => {
        expect(toDomainSlug('Hello World')).toBe('hello-world');
    });

    it('removes special characters', () => {
        expect(toDomainSlug('design@v2!test')).toBe('designv2test');
    });

    it('collapses multiple spaces/hyphens', () => {
        expect(toDomainSlug('a   b   c')).toBe('a-b-c');
        expect(toDomainSlug('a---b---c')).toBe('a-b-c');
    });

    it('truncates to 30 characters', () => {
        const long = 'this is a very long domain name that exceeds the limit';
        expect(toDomainSlug(long).length).toBeLessThanOrEqual(30);
    });

    it('trims whitespace', () => {
        expect(toDomainSlug('  hello  ')).toBe('hello');
    });

    it('removes trailing hyphens', () => {
        expect(toDomainSlug('test-')).toBe('test');
    });

    it('handles empty string', () => {
        expect(toDomainSlug('')).toBe('');
    });

    it('preserves numbers', () => {
        expect(toDomainSlug('version 2 design')).toBe('version-2-design');
    });

    it('handles already-valid slugs', () => {
        expect(toDomainSlug('my-domain')).toBe('my-domain');
    });
});

// =========================================================================
// sampleNodes
// =========================================================================

describe('sampleNodes', () => {
    it('samples with single accessible domain', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['physics']);
        mockQuery.mockResolvedValue([{ id: 'n1', content: 'test' }]);

        const result = await sampleNodes(2, 'physics');
        expect(result).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalled();
    });

    it('samples with multiple accessible domains (builds IN clause)', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['physics', 'math']);
        mockQuery.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);

        const result = await sampleNodes(2, 'physics');
        expect(result).toHaveLength(2);
        // Query should include both domains as params
        const lastCall = mockQuery.mock.calls[0];
        expect(lastCall[1]).toContain('physics');
        expect(lastCall[1]).toContain('math');
    });

    it('samples without domain — picks random domain then single accessible', async () => {
        mockQueryOne.mockResolvedValue({ domain: 'bio' });
        mockGetAccessibleDomains.mockResolvedValue(['bio']);
        mockQuery.mockResolvedValue([{ id: 'n1' }]);

        const result = await sampleNodes(2);
        expect(result).toHaveLength(1);
    });

    it('samples without domain — no domains at all (fallback query)', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([{ id: 'n1' }]);

        const result = await sampleNodes(2);
        expect(result).toHaveLength(1);
        // Should not call getAccessibleDomains when no random domain found
        expect(mockGetAccessibleDomains).not.toHaveBeenCalled();
    });

    it('samples without domain — multiple accessible domains from random pick', async () => {
        mockQueryOne.mockResolvedValue({ domain: 'bio' });
        mockGetAccessibleDomains.mockResolvedValue(['bio', 'chem']);
        mockQuery.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);

        const result = await sampleNodes(2);
        expect(result).toHaveLength(2);
    });

    it('uses default n=2 when not specified', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['physics']);
        mockQuery.mockResolvedValue([]);

        const result = await sampleNodes();
        // Should return an array (possibly empty if no nodes found)
        expect(Array.isArray(result)).toBe(true);
    });
});

// =========================================================================
// createNode
// =========================================================================

describe('createNode', () => {
    it('creates a node with embedding and returns result', async () => {
        const fakeNode = {
            id: 'node-1',
            content: 'Test content for the node',
            created_at: new Date().toISOString(),
        };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        const result = await createNode('Test content for the node', 'seed', 'human', { domain: 'physics' });
        expect(result).not.toBeNull();
        expect(result?.id).toBe('node-1');
        expect(mockGetEmbedding).toHaveBeenCalledWith('Test content for the node');
    });

    it('uses provided embedding when given', async () => {
        const fakeNode = { id: 'node-2', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);
        const customEmb = [0.5, 0.6, 0.7];

        await createNode('test', 'seed', 'human', { embedding: customEmb, domain: 'math' });
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });

    it('returns null when dedup gate rejects', async () => {
        mockCheckDuplicate.mockResolvedValueOnce({
            isDuplicate: true,
            similarity: 0.95,
            matchedNodeId: 'existing-1',
            reason: 'too similar',
        });

        const result = await createNode('duplicate content', 'seed', 'human', { domain: 'physics' });
        expect(result).toBeNull();
    });

    it('skips dedup when skipDedup is true', async () => {
        const fakeNode = { id: 'node-3', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        await createNode('test', 'seed', 'human', { domain: 'math', skipDedup: true });
        expect(mockCheckDuplicate).not.toHaveBeenCalled();
    });

    it('skips dedup when no domain is provided', async () => {
        const fakeNode = { id: 'node-4', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        await createNode('test', 'seed', 'human', {});
        expect(mockCheckDuplicate).not.toHaveBeenCalled();
    });

    it('proceeds when dedup check throws an error', async () => {
        mockCheckDuplicate.mockRejectedValueOnce(new Error('dedup DB error'));
        const fakeNode = { id: 'node-5', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        const result = await createNode('test', 'seed', 'human', { domain: 'physics' });
        expect(result).not.toBeNull();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'warning',
            expect.stringContaining('Dedup check failed'),
            expect.any(Object),
        );
    });

    it('calls ensurePartition for domain', async () => {
        const fakeNode = { id: 'node-6', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        await createNode('test', 'seed', 'human', { domain: 'new-domain' });
        expect(mockEnsurePartition).toHaveBeenCalledWith('new-domain', 'system');
    });

    it('computes content hash and logs creation', async () => {
        const fakeNode = { id: 'node-7', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockQuery.mockResolvedValue([]);

        await createNode('test', 'seed', 'human', { domain: 'physics' });
        expect(mockComputeContentHash).toHaveBeenCalled();
        expect(mockLogDecision).toHaveBeenCalled();
    });
});

// =========================================================================
// createEdge
// =========================================================================

describe('createEdge', () => {
    it('creates an edge with default strength', async () => {
        mockQueryOne.mockResolvedValue({ source_id: 'a', target_id: 'b', edge_type: 'parent', strength: 1.0 });
        const result = await createEdge('a', 'b', 'parent');
        expect(result).toBeDefined();
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.any(String),
            ['a', 'b', 'parent', 1.0],
        );
    });

    it('creates an edge with custom strength', async () => {
        mockQueryOne.mockResolvedValue({ source_id: 'a', target_id: 'b', edge_type: 'parent', strength: 0.5 });
        await createEdge('a', 'b', 'parent', 0.5);
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.any(String),
            ['a', 'b', 'parent', 0.5],
        );
    });
});

// =========================================================================
// updateNodeSalience / updateNodeWeight
// =========================================================================

describe('updateNodeSalience', () => {
    it('calls query with delta and ceiling', async () => {
        await updateNodeSalience('n1', 0.1);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['n1', 0.1, mockEngineConfig.salienceCeiling],
        );
    });
});

describe('updateNodeWeight', () => {
    it('calls query with delta and weight ceiling', async () => {
        await updateNodeWeight('n1', 0.5);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['n1', 0.5, mockEngineConfig.weightCeiling],
        );
    });

    it('uses default ceiling of 3.0 when not configured', async () => {
        const origCeiling = mockEngineConfig.weightCeiling;
        mockEngineConfig.weightCeiling = undefined;
        await updateNodeWeight('n1', 0.5);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['n1', 0.5, 3.0],
        );
        mockEngineConfig.weightCeiling = origCeiling;
    });
});

// =========================================================================
// decayAll
// =========================================================================

describe('decayAll', () => {
    it('runs salience decay, rescue, and weight decay (3 queries)', async () => {
        mockQuery.mockResolvedValue([]);
        await decayAll();
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('runs extra synthesis decay when enabled (4 queries)', async () => {
        mockAppConfig.engine.synthesisDecayEnabled = true;
        mockQuery.mockResolvedValue([]);
        await decayAll();
        expect(mockQuery).toHaveBeenCalledTimes(4);
        mockAppConfig.engine.synthesisDecayEnabled = false;
    });
});

// =========================================================================
// findDomainsBySynonym
// =========================================================================

describe('findDomainsBySynonym', () => {
    it('returns exact domain match', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'physics' }]);
        const result = await findDomainsBySynonym('physics');
        expect(result).toEqual(['physics']);
    });

    it('returns synonym match when no exact match', async () => {
        mockQuery
            .mockResolvedValueOnce([])  // no exact match
            .mockResolvedValueOnce([{ domain: 'organ-printing' }]);  // synonym match
        const result = await findDomainsBySynonym('bioprint');
        expect(result).toEqual(['organ-printing']);
    });

    it('returns partial match when no synonym match', async () => {
        mockQuery
            .mockResolvedValueOnce([])  // no exact match
            .mockResolvedValueOnce([])  // no synonym match
            .mockResolvedValueOnce([{ domain: 'quantum-physics' }]);  // partial match
        const result = await findDomainsBySynonym('quantum');
        expect(result).toEqual(['quantum-physics']);
    });

    it('tries individual words as fallback for multi-word search', async () => {
        mockQuery
            .mockResolvedValueOnce([])  // no exact match
            .mockResolvedValueOnce([])  // no synonym match
            .mockResolvedValueOnce([])  // no partial match
            .mockResolvedValueOnce([{ domain: 'cell-biology' }]);  // word match
        const result = await findDomainsBySynonym('cell tissue');
        expect(result).toEqual(['cell-biology']);
    });

    it('returns empty when nothing matches (short search term)', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await findDomainsBySynonym('xy');
        expect(result).toEqual([]);
    });

    it('converts spaces to hyphens for searching', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'organ-printing' }]);
        const result = await findDomainsBySynonym('organ printing');
        expect(result).toEqual(['organ-printing']);
    });
});

// =========================================================================
// editNodeContent
// =========================================================================

describe('editNodeContent', () => {
    it('throws when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        await expect(editNodeContent('nonexistent', 'new content here five words minimum', 'human'))
            .rejects.toThrow('not found');
    });

    it('throws when node is archived', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', archived: true, content: 'old', domain: 'test', node_type: 'seed' });
        await expect(editNodeContent('n1', 'new content here five words minimum', 'human'))
            .rejects.toThrow('archived');
    });

    it('throws when content too short (< 5 words)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', archived: false, content: 'old', domain: 'test', node_type: 'seed' });
        await expect(editNodeContent('n1', 'too short', 'human'))
            .rejects.toThrow('too short');
    });

    it('throws when content too long (> 200 words)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', archived: false, content: 'old', domain: 'test', node_type: 'seed' });
        const longContent = Array(201).fill('word').join(' ');
        await expect(editNodeContent('n1', longContent, 'human'))
            .rejects.toThrow('too long');
    });

    it('skips word validation with skipWordValidation option', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', archived: false, content: 'old', domain: 'test', node_type: 'seed' })
            .mockResolvedValueOnce({ content_hash: 'oldhash' })
            .mockResolvedValueOnce({ contributor: 'human', created_at: '2024-01-01' });
        mockQuery.mockResolvedValue([]);

        const result = await editNodeContent('n1', 'hi', 'human', undefined, { skipWordValidation: true });
        expect(result.id).toBe('n1');
    });

    it('edits valid content successfully', async () => {
        const validContent = 'This is valid new content with enough words';
        mockQueryOne
            .mockResolvedValueOnce({ id: 'n1', archived: false, content: 'old content', domain: 'test', node_type: 'seed' })
            .mockResolvedValueOnce({ content_hash: 'oldhash' })
            .mockResolvedValueOnce({ contributor: 'human', created_at: '2024-01-01' });
        mockQuery.mockResolvedValue([]);

        const result = await editNodeContent('n1', validContent, 'human', 'Fixing content');
        expect(result.id).toBe('n1');
        expect(result.content).toBe(validContent);
        expect(mockLogDecision).toHaveBeenCalled();
    });
});

// =========================================================================
// setExcludedFromBriefs
// =========================================================================

describe('setExcludedFromBriefs', () => {
    it('throws when node not found or archived', async () => {
        mockQueryOne.mockResolvedValue(null);
        await expect(setExcludedFromBriefs('nonexistent', true, 'human'))
            .rejects.toThrow('not found');
    });

    it('sets excluded to true', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: false });
        mockQuery.mockResolvedValue([]);
        const result = await setExcludedFromBriefs('n1', true, 'human', 'Too noisy');
        expect(result.excluded).toBe(true);
        expect(result.domain).toBe('test');
    });

    it('sets excluded to false', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: true });
        mockQuery.mockResolvedValue([]);
        const result = await setExcludedFromBriefs('n1', false, 'human');
        expect(result.excluded).toBe(false);
    });
});

// =========================================================================
// inferDomain
// =========================================================================

describe('inferDomain', () => {
    it('returns synonym match as first tier', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'physics' }]);
        const result = await inferDomain('physics experiment with particles');
        expect(result.domain).toBe('physics');
        expect(result.source).toBe('synonym');
    });

    it('falls back to embedding similarity when synonym fails', async () => {
        // findDomainsBySynonym returns empty for all attempts, then embedding query returns
        // domain reps. The query was rewritten to use ROW_NUMBER() OVER (PARTITION BY domain
        // ORDER BY weight DESC) to take the top-5-per-domain, so the matcher checks for
        // "embedding_bin" + "ROW_NUMBER" rather than the old "MAX(weight)".
        mockQuery.mockImplementation(async (...args: any[]) => {
            const sql = args[0] as string;
            if (sql.includes('embedding_bin') && sql.includes('ROW_NUMBER')) {
                return [{ domain: 'math', embedding_bin: Buffer.from([1, 2, 3]) }];
            }
            return [];
        });
        mockCosineSimilarity.mockReturnValue(0.9);
        mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);

        const result = await inferDomain('xyzzy abcde fghij');
        expect(result.domain).toBe('math');
        expect(result.source).toBe('embedding');
    });

    it('falls back to slug when all tiers fail', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(null);
        const result = await inferDomain('something totally new and unique');
        expect(result.source).toBe('new');
        expect(result.domain).toBeTruthy();
    });

    it('uses short text directly for search key', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'bio' }]);
        const result = await inferDomain('short text');
        expect(result.domain).toBe('bio');
    });
});
