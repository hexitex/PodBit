/**
 * Unit tests for core/node-ops.ts — sampleNodes, createNode, createEdge,
 * findDomainsBySynonym, ensureDomainSynonyms, updateNodeSalience,
 * updateNodeWeight, decayAll, editNodeContent, setExcludedFromBriefs,
 * inferDomain, toDomainSlug.
 *
 * Mocks: db.js, db/sql.js, models.js, config.js, engine-config.js,
 * scoring.js, governance.js, integrity.js, specificity.js, services/event-bus.js,
 * handlers/dedup.js, handlers/knowledge.js, handlers/feedback.js,
 * number-variables.js, keywords.js, avatar-gen.js, project-context.js,
 * prompts.js, provenance.js, core/types.js
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[] | null>>().mockResolvedValue([0.1, 0.2, 0.3]);
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('test-model');
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('{}');
const mockMeasureSpecificity = jest.fn<(...args: any[]) => number>().mockReturnValue(0.5);
const mockL2Normalize = jest.fn<(v: number[]) => number[]>().mockImplementation(v => v);
const mockEmbeddingToBuffer = jest.fn<(v: number[]) => Buffer>().mockReturnValue(Buffer.from('test'));
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0.5);
const mockParseEmbedding = jest.fn<(buf: any) => number[] | null>().mockReturnValue([0.1, 0.2, 0.3]);
const mockGetAccessibleDomains = jest.fn<(d: string) => Promise<string[]>>().mockResolvedValue(['test-domain']);
const mockEnsurePartition = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockLogDecision = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn();
const mockComputeContentHash = jest.fn<(...args: any[]) => string>().mockReturnValue('hash-abc');
const mockLogOperation = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockWeightedRandom = jest.fn<(col: string) => string>().mockReturnValue('RANDOM()');
const mockCheckDuplicate = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ isDuplicate: false });
const mockRegisterNodeVariables = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ varIds: [], annotatedContent: '' });
const mockInvalidateKnowledgeCache = jest.fn();
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('prompt');
const mockHandleRate = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockResolveContent = jest.fn<(c: string) => Promise<string>>().mockImplementation(async (c) => c);
const mockGetProjectContextBlock = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);
const mockBuildProvenanceTag = jest.fn<(...args: any[]) => string>().mockReturnValue('');

const defaultNodeConfig = {
    defaultWeight: 1.0,
    defaultSalience: 0.8,
};

const engineConfig = {
    salienceFloor: 0.1,
    salienceCeiling: 1.0,
    salienceDecay: 0.99,
    weightDecay: 0.995,
    weightCeiling: 3.0,
    nodes: defaultNodeConfig,
};

const appConfigMock = {
    dedup: { embeddingSimilarityThreshold: 0.9 },
    numberVariables: { enabled: false },
    magicNumbers: { domainInferenceThreshold: 0.7, salienceRescueDays: 7 },
    autonomousCycles: { autorating: { enabled: false, inlineEnabled: false } },
    engine: { synthesisDecayEnabled: false, synthesisDecayGraceDays: 7, synthesisDecayMultiplier: 0.9 },
    labVerify: { failedSalienceCap: 0.5 },
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
    getEmbeddingModelName: mockGetEmbeddingModelName,
    callSubsystemModel: mockCallSubsystemModel,
}));
jest.unstable_mockModule('../../config.js', () => ({
    config: appConfigMock,
}));
jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: engineConfig,
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
jest.unstable_mockModule('../../core/types.js', () => ({}));
jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    checkDuplicate: mockCheckDuplicate,
}));
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    registerNodeVariables: mockRegisterNodeVariables,
    resolveContent: mockResolveContent,
}));
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));
jest.unstable_mockModule('../../core/keywords.js', () => ({
    generateNodeKeywords: jest.fn().mockResolvedValue(undefined),
    generateLLMDomainSynonyms: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));
jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleRate: mockHandleRate,
}));
jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));
jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
}));

const {
    sampleNodes,
    createNode,
    createEdge,
    findDomainsBySynonym,
    ensureDomainSynonyms,
    updateNodeSalience,
    updateNodeWeight,
    decayAll,
    editNodeContent,
    setExcludedFromBriefs,
    inferDomain,
    toDomainSlug,
} = await import('../../core/node-ops.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockGetEmbeddingModelName.mockReturnValue('test-model');
    mockMeasureSpecificity.mockReturnValue(0.5);
    mockL2Normalize.mockImplementation(v => v);
    mockEmbeddingToBuffer.mockReturnValue(Buffer.from('test'));
    mockGetAccessibleDomains.mockResolvedValue(['test-domain']);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockComputeContentHash.mockReturnValue('hash-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: '' });
    mockInvalidateKnowledgeCache.mockImplementation(() => {});
    mockCosineSimilarity.mockReturnValue(0.5);
    mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
});

// =============================================================================
// toDomainSlug (pure function)
// =============================================================================

describe('toDomainSlug', () => {
    it('converts spaces to hyphens', () => {
        expect(toDomainSlug('hello world')).toBe('hello-world');
    });

    it('lowercases input', () => {
        expect(toDomainSlug('Hello World')).toBe('hello-world');
    });

    it('removes special characters', () => {
        expect(toDomainSlug('hello! @world#')).toBe('hello-world');
    });

    it('collapses multiple hyphens', () => {
        expect(toDomainSlug('hello---world')).toBe('hello-world');
    });

    it('trims whitespace', () => {
        expect(toDomainSlug('  hello  ')).toBe('hello');
    });

    it('truncates to 30 characters', () => {
        const long = 'a-very-long-domain-name-that-exceeds-thirty-characters';
        expect(toDomainSlug(long).length).toBeLessThanOrEqual(30);
    });

    it('removes trailing hyphen', () => {
        // After truncation, might end with hyphen
        expect(toDomainSlug('test-')).toBe('test');
    });

    it('handles empty string', () => {
        expect(toDomainSlug('')).toBe('');
    });
});

// =============================================================================
// sampleNodes
// =============================================================================

describe('sampleNodes', () => {
    it('queries with domain when specified', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['test-domain']);
        mockQuery.mockResolvedValue([{ id: 'n1', content: 'test' }]);

        const result = await sampleNodes(2, 'test-domain');

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('test-domain');
        expect(result).toHaveLength(1);
    });

    it('uses multi-domain IN clause for multiple accessible domains', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom-a', 'dom-b', 'dom-c']);
        mockQuery.mockResolvedValue([]);

        await sampleNodes(2, 'dom-a');

        const queryCall = mockQuery.mock.calls[0];
        expect(queryCall[0]).toContain('IN');
        expect(queryCall[1]).toContain('dom-a');
        expect(queryCall[1]).toContain('dom-b');
        expect(queryCall[1]).toContain('dom-c');
    });

    it('picks random domain when none specified', async () => {
        mockQueryOne.mockResolvedValue({ domain: 'random-domain' });
        mockGetAccessibleDomains.mockResolvedValue(['random-domain']);
        mockQuery.mockResolvedValue([]);

        await sampleNodes(2);

        expect(mockQueryOne).toHaveBeenCalled();
        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('random-domain');
    });

    it('samples everything when no domains exist', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await sampleNodes(2);

        // Should have queried without domain = or domain IN filter
        const lastQuery = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
        expect(lastQuery[0]).not.toContain('domain =');
        expect(lastQuery[0]).not.toContain('domain IN');
    });

    it('defaults to n=2', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await sampleNodes();

        const lastQuery = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
        expect(lastQuery[1]).toContain(2);
    });
});

// =============================================================================
// createNode
// =============================================================================

describe('createNode', () => {
    const nodeResult = {
        id: 'node-123',
        content: 'Test content',
        created_at: '2024-01-01T00:00:00Z',
        born_at: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
        mockQueryOne.mockResolvedValue({ ...nodeResult });
    });

    it('creates a node with embedding and specificity', async () => {
        const result = await createNode('Test content', 'seed', 'human');

        expect(mockGetEmbedding).toHaveBeenCalledWith('Test content');
        expect(mockMeasureSpecificity).toHaveBeenCalledWith('Test content', undefined);
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO nodes'),
            expect.any(Array),
        );
        expect(result).toBeTruthy();
    });

    it('uses provided embedding instead of generating', async () => {
        const emb = [0.5, 0.6, 0.7];
        await createNode('Test', 'seed', 'human', { embedding: emb });

        expect(mockGetEmbedding).not.toHaveBeenCalled();
        expect(mockL2Normalize).toHaveBeenCalledWith(emb);
    });

    it('runs dedup gate when domain is provided', async () => {
        await createNode('Test content here', 'seed', 'human', { domain: 'test' });

        expect(mockCheckDuplicate).toHaveBeenCalledWith(
            'Test content here',
            expect.any(Array),
            'test',
            'human',
        );
    });

    it('returns null when dedup gate rejects', async () => {
        mockCheckDuplicate.mockResolvedValue({
            isDuplicate: true,
            matchedNodeId: 'existing-123',
            reason: 'too similar',
            similarity: 0.95,
        });

        const result = await createNode('Duplicate content', 'seed', 'human', { domain: 'test' });

        expect(result).toBeNull();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'synthesis', 'similarity_check',
            expect.stringContaining('Duplicate rejected'),
            expect.objectContaining({ gate: 'dedup', passed: false }),
        );
    });

    it('skips dedup when skipDedup is true', async () => {
        await createNode('Test', 'seed', 'human', { domain: 'test', skipDedup: true });

        expect(mockCheckDuplicate).not.toHaveBeenCalled();
    });

    it('ensures domain synonyms and partition', async () => {
        await createNode('Test', 'seed', 'human', { domain: 'my-domain' });

        // ensureDomainSynonyms is called internally (not mocked at module level, but
        // it calls mockQuery internally). ensurePartition is mocked.
        expect(mockEnsurePartition).toHaveBeenCalledWith('my-domain', 'system');
    });

    it('computes and stores content hash', async () => {
        await createNode('Test content', 'seed', 'human');

        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'Test content',
                nodeType: 'seed',
            }),
        );
        // Should update nodes with hash
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('content_hash'),
            expect.arrayContaining(['hash-abc', 'node-123']),
        );
    });

    it('emits node_created activity', async () => {
        await createNode('Test', 'seed', 'human', { domain: 'my-domain' });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'synthesis', 'node_created',
            expect.stringContaining('seed'),
            expect.objectContaining({ nodeId: 'node-123', nodeType: 'seed', domain: 'my-domain' }),
        );
    });

    it('logs creation decision', async () => {
        await createNode('Test', 'seed', 'human', { domain: 'd', contributor: 'claude' });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-123', 'created',
            null, 'seed',
            expect.any(String),
            'claude',
            expect.stringContaining('Node created'),
        );
    });

    it('extracts number variables when enabled', async () => {
        appConfigMock.numberVariables.enabled = true;
        mockRegisterNodeVariables.mockResolvedValue({
            varIds: ['NX001'],
            annotatedContent: 'Content with [[[NX001]]]',
        });

        await createNode('Content with 42', 'seed', 'human', { domain: 'test' });

        expect(mockRegisterNodeVariables).toHaveBeenCalledWith('node-123', 'Test content', 'test');
        appConfigMock.numberVariables.enabled = false;
    });

    it('skips number variables for raw nodes', async () => {
        appConfigMock.numberVariables.enabled = true;

        await createNode('Content with 42', 'raw', 'kb:scanner', { domain: 'test' });

        expect(mockRegisterNodeVariables).not.toHaveBeenCalled();
        appConfigMock.numberVariables.enabled = false;
    });

    it('uses default weight and salience from config', async () => {
        await createNode('Test', 'seed', 'human');

        const insertCall = mockQueryOne.mock.calls.find(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO nodes')
        );
        expect(insertCall).toBeTruthy();
        const params = insertCall![1] as any[];
        // weight is at index 8, salience at index 9
        expect(params[8]).toBe(1.0); // defaultWeight
        expect(params[9]).toBe(0.8); // defaultSalience
    });

    it('passes modelId and modelName when provided', async () => {
        await createNode('Test', 'voiced', 'synthesis', {
            modelId: 'model-42',
            modelName: 'claude-3',
        });

        const insertCall = mockQueryOne.mock.calls.find(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO nodes')
        );
        const params = insertCall![1] as any[];
        // modelId and modelName are followed by name (3rd from end, 2nd from end)
        expect(params[params.length - 3]).toBe('model-42');
        expect(params[params.length - 2]).toBe('claude-3');
    });
});

// =============================================================================
// createEdge
// =============================================================================

describe('createEdge', () => {
    it('inserts edge with upsert on conflict', async () => {
        mockQueryOne.mockResolvedValue({ source_id: 'a', target_id: 'b', edge_type: 'parent', strength: 1.0 });

        const result = await createEdge('a', 'b', 'parent');

        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO edges'),
            ['a', 'b', 'parent', 1.0],
        );
        expect(result).toBeTruthy();
    });

    it('uses custom strength', async () => {
        mockQueryOne.mockResolvedValue({ strength: 0.5 });

        await createEdge('a', 'b', 'parent', 0.5);

        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.any(String),
            ['a', 'b', 'parent', 0.5],
        );
    });

    it('defaults strength to 1.0', async () => {
        mockQueryOne.mockResolvedValue({});

        await createEdge('x', 'y', 'child');

        const params = mockQueryOne.mock.calls[0][1];
        expect(params[3]).toBe(1.0);
    });
});

// =============================================================================
// findDomainsBySynonym
// =============================================================================

describe('findDomainsBySynonym', () => {
    it('finds exact domain match first', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'quantum-physics' }]);

        const result = await findDomainsBySynonym('quantum physics');

        expect(result).toEqual(['quantum-physics']);
    });

    it('converts spaces to hyphens for matching', async () => {
        mockQuery.mockResolvedValueOnce([{ domain: 'hello-world' }]);

        const result = await findDomainsBySynonym('hello world');

        expect(result).toEqual(['hello-world']);
        const queryCall = mockQuery.mock.calls[0];
        expect(queryCall[1]).toContain('hello-world');
    });

    it('falls back to synonym lookup', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no exact match
            .mockResolvedValueOnce([{ domain: 'biology' }]); // synonym match

        const result = await findDomainsBySynonym('bio');

        expect(result).toEqual(['biology']);
    });

    it('falls back to partial domain match', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no exact
            .mockResolvedValueOnce([]) // no synonym
            .mockResolvedValueOnce([{ domain: 'quantum-physics' }]); // partial

        const result = await findDomainsBySynonym('quantum');

        expect(result).toEqual(['quantum-physics']);
    });

    it('tries individual words as last resort', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no exact
            .mockResolvedValueOnce([]) // no synonym
            .mockResolvedValueOnce([]) // no partial
            .mockResolvedValueOnce([{ domain: 'neural-networks' }]); // word match

        const result = await findDomainsBySynonym('deep neural stuff');

        expect(result).toEqual(['neural-networks']);
    });

    it('returns empty when nothing matches', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await findDomainsBySynonym('xyzzy');

        expect(result).toEqual([]);
    });
});

// =============================================================================
// ensureDomainSynonyms
// =============================================================================

describe('ensureDomainSynonyms', () => {
    it('skips if synonyms already exist', async () => {
        mockQuery.mockResolvedValueOnce([{ 1: 1 }]); // existing synonyms

        await ensureDomainSynonyms('test-domain');

        // Should only have the check query, no inserts
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('generates and stores synonyms when missing', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('organ-printing');

        // Should have inserted synonyms (check query + multiple inserts)
        expect(mockQuery.mock.calls.length).toBeGreaterThan(1);
        // Verify INSERT calls include domain synonyms
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        expect(insertCalls.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// updateNodeSalience
// =============================================================================

describe('updateNodeSalience', () => {
    it('updates salience capped at ceiling', async () => {
        await updateNodeSalience('node-1', 0.2);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['node-1', 0.2, engineConfig.salienceCeiling],
        );
    });
});

// =============================================================================
// updateNodeWeight
// =============================================================================

describe('updateNodeWeight', () => {
    it('updates weight capped at ceiling', async () => {
        await updateNodeWeight('node-1', 0.5);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['node-1', 0.5, 3.0],
        );
    });
});

// =============================================================================
// decayAll
// =============================================================================

describe('decayAll', () => {
    it('decays salience, rescues stale, and decays weights', async () => {
        await decayAll();

        // Should have 3 queries minimum: salience decay, rescue, weight decay
        expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(3);

        // First call: salience decay
        expect(mockQuery.mock.calls[0][0]).toContain('salience * $1');
        expect(mockQuery.mock.calls[0][1]).toContain(engineConfig.salienceDecay);

        // Second call: rescue
        expect(mockQuery.mock.calls[1][0]).toContain('salience = $1');

        // Third call: weight decay
        expect(mockQuery.mock.calls[2][0]).toContain('weight * $1');
        expect(mockQuery.mock.calls[2][1]).toContain(engineConfig.weightDecay);
    });

    it('runs synthesis decay when enabled', async () => {
        appConfigMock.engine.synthesisDecayEnabled = true;

        await decayAll();

        // Should have 4 queries (3 standard + 1 synthesis decay)
        expect(mockQuery.mock.calls.length).toBe(4);
        const lastQuery = mockQuery.mock.calls[3];
        expect(lastQuery[0]).toContain("node_type IN ('synthesis', 'voiced')");

        appConfigMock.engine.synthesisDecayEnabled = false;
    });

    it('skips synthesis decay when disabled', async () => {
        appConfigMock.engine.synthesisDecayEnabled = false;

        await decayAll();

        expect(mockQuery.mock.calls.length).toBe(3);
    });
});

// =============================================================================
// editNodeContent
// =============================================================================

describe('editNodeContent', () => {
    beforeEach(() => {
        mockQueryOne.mockImplementation(async (sql: string, _params?: any[]) => {
            if (sql.includes('SELECT id, content, domain')) {
                return { id: 'node-1', content: 'old content', domain: 'test', archived: false, node_type: 'seed' };
            }
            if (sql.includes('content_hash')) {
                return { content_hash: 'old-hash' };
            }
            if (sql.includes('contributor, created_at')) {
                return { contributor: 'human', created_at: '2024-01-01' };
            }
            return null;
        });
        mockQuery.mockResolvedValue([]);
    });

    it('throws for non-existent node', async () => {
        mockQueryOne.mockResolvedValue(null);

        await expect(editNodeContent('bad-id', 'new content here test words', 'human'))
            .rejects.toThrow('not found');
    });

    it('throws for archived node', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', archived: true });

        await expect(editNodeContent('n1', 'new content here test words', 'human'))
            .rejects.toThrow('archived');
    });

    it('validates minimum word count', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'old', domain: 'test', archived: false });

        await expect(editNodeContent('n1', 'too short', 'human'))
            .rejects.toThrow('too short');
    });

    it('validates maximum word count', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'old', domain: 'test', archived: false });
        const longContent = Array.from({ length: 201 }, (_, i) => `word${i}`).join(' ');

        await expect(editNodeContent('n1', longContent, 'human'))
            .rejects.toThrow('too long');
    });

    it('bypasses word validation with skipWordValidation', async () => {
        await editNodeContent('n1', 'hi', 'human', undefined, { skipWordValidation: true });

        expect(mockLogDecision).toHaveBeenCalled();
    });

    it('regenerates embedding on edit', async () => {
        await editNodeContent('n1', 'new valid content for testing purposes', 'human');

        expect(mockGetEmbedding).toHaveBeenCalledWith('new valid content for testing purposes');
    });

    it('invalidates knowledge cache', async () => {
        await editNodeContent('n1', 'new valid content for testing purposes', 'human');

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('test');
    });

    it('returns updated node info', async () => {
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human');

        expect(result.id).toBe('n1');
        expect(result.content).toBe('new valid content for testing purposes');
        expect(result.domain).toBe('test');
    });
});

// =============================================================================
// setExcludedFromBriefs
// =============================================================================

describe('setExcludedFromBriefs', () => {
    it('throws for non-existent node', async () => {
        mockQueryOne.mockResolvedValue(null);

        await expect(setExcludedFromBriefs('bad-id', true, 'human'))
            .rejects.toThrow('not found');
    });

    it('sets excluded flag and logs decision', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: false });

        const result = await setExcludedFromBriefs('n1', true, 'human', 'not relevant');

        expect(result.excluded).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET excluded'),
            [1, 'n1'],
        );
        expect(mockLogDecision).toHaveBeenCalled();
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('test');
    });

    it('can disable exclusion', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: true });

        const result = await setExcludedFromBriefs('n1', false, 'human');

        expect(result.excluded).toBe(false);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET excluded'),
            [0, 'n1'],
        );
    });
});

// =============================================================================
// inferDomain
// =============================================================================

describe('inferDomain', () => {
    it('returns synonym match (tier 1) when found', async () => {
        // findDomainsBySynonym does exact match first
        mockQuery.mockResolvedValueOnce([{ domain: 'quantum-physics' }]);

        const result = await inferDomain('quantum physics is interesting');

        expect(result.domain).toBe('quantum-physics');
        expect(result.source).toBe('synonym');
    });

    it('falls back to embedding (tier 2) when no synonym match', async () => {
        // All synonym lookups return empty
        mockQuery.mockResolvedValue([]);
        // But embedding similarity is high
        mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

        // Override for domain reps query to return a domain with embedding
        const originalQuery = mockQuery.getMockImplementation();
        mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('ROW_NUMBER')) {
                return [{ domain: 'physics', embedding_bin: Buffer.from('test') }];
            }
            return [];
        });
        mockCosineSimilarity.mockReturnValue(0.85); // above threshold
        appConfigMock.magicNumbers.domainInferenceThreshold = 0.7;

        const result = await inferDomain('advanced quantum mechanics and entanglement');

        expect(result.domain).toBe('physics');
        expect(result.source).toBe('embedding');

        mockQuery.mockImplementation(originalQuery!);
    });

    it('falls back to LLM (tier 3) when embedding similarity is low', async () => {
        mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('ROW_NUMBER')) {
                return [{ domain: 'physics', embedding_bin: Buffer.from('test') }];
            }
            if (typeof sql === 'string' && sql.includes('DISTINCT domain') && sql.includes('ORDER BY domain')) {
                return [{ domain: 'physics' }, { domain: 'biology' }];
            }
            return [];
        });
        mockCosineSimilarity.mockReturnValue(0.2); // below threshold
        mockCallSubsystemModel.mockResolvedValue('{"domain": "biology"}');

        const result = await inferDomain('DNA replication in cells');

        expect(result.domain).toBe('biology');
        expect(result.source).toBe('llm');
    });

    it('returns fallback slug when all tiers fail', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(null);
        mockCallSubsystemModel.mockRejectedValue(new Error('no model'));

        const result = await inferDomain('some random text');

        expect(result.source).toBe('new');
        expect(result.domain.length).toBeGreaterThan(0);
    });
});
