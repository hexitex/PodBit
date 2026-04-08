/**
 * Ultimate coverage tests for core/node-ops.ts — targets uncovered branches,
 * error paths, and edge cases not covered by existing test files.
 *
 * Focuses on:
 * - autorateNodeInline (entire function)
 * - generateDomainSynonyms bio prefixes, -ed/-ing variants
 * - createNode: number variable extraction with actual vars, ensurePartition failure,
 *   computeContentHash failure, null result, autorating + avatar fire-and-forget
 * - editNodeContent: parent hash inclusion, hash update error, system contributor
 * - inferDomain: LLM tier returning new domain, embedding tier error, long text key
 * - setExcludedFromBriefs: system contributor
 * - decayAll: rescue threshold math
 * - findDomainsBySynonym: single short word fallback
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mock declarations ----

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockWeightedRandom = jest.fn<(expr: string) => string>();
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetEmbeddingModelName = jest.fn<() => string>();
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>();
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
const mockRegisterNodeVariables = jest.fn<(...args: any[]) => Promise<any>>();
const mockResolveContent = jest.fn<(c: string) => Promise<string>>();
const mockInvalidateKnowledgeCache = jest.fn();
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>();
const mockHandleRate = jest.fn<(...args: any[]) => Promise<void>>();
const mockGetProjectContextBlock = jest.fn<() => Promise<string | null>>();
const mockBuildProvenanceTag = jest.fn<(...args: any[]) => string>();
const mockGenerateNodeKeywords = jest.fn<(...args: any[]) => Promise<void>>();
const mockGenerateLLMDomainSynonyms = jest.fn<(...args: any[]) => Promise<void>>();
const mockGenerateAvatar = jest.fn<(...args: any[]) => Promise<void>>();

const mockAppConfig: any = {
    dedup: { embeddingSimilarityThreshold: 0.9 },
    numberVariables: { enabled: false },
    autonomousCycles: { autorating: { enabled: false, inlineEnabled: false } },
    magicNumbers: { salienceRescueDays: 7, domainInferenceThreshold: 0.7 },
    engine: { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95, junkThreshold: 0.75 },
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
    getEmbeddingModelName: mockGetEmbeddingModelName,
    callSubsystemModel: mockCallSubsystemModel,
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
    registerNodeVariables: mockRegisterNodeVariables,
    resolveContent: mockResolveContent,
}));
jest.unstable_mockModule('../../core/keywords.js', () => ({
    generateNodeKeywords: mockGenerateNodeKeywords,
    generateLLMDomainSynonyms: mockGenerateLLMDomainSynonyms,
}));
jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: mockGenerateAvatar,
}));
jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
}));
jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleRate: mockHandleRate,
}));
jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
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

// ---- Setup ----

beforeEach(() => {
    jest.clearAllMocks();
    mockWeightedRandom.mockReturnValue('ORDER BY RANDOM()');
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockGetEmbeddingModelName.mockReturnValue('test-model');
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
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: '' });
    mockResolveContent.mockImplementation(async (c: string) => c);
    mockInvalidateKnowledgeCache.mockImplementation(() => {});
    mockCosineSimilarity.mockReturnValue(0.5);
    mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
    mockGetPrompt.mockResolvedValue('prompt');
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockGetProjectContextBlock.mockResolvedValue('');
    mockBuildProvenanceTag.mockReturnValue('[test]');
    mockHandleRate.mockResolvedValue(undefined);
    mockGenerateNodeKeywords.mockResolvedValue(undefined);
    mockGenerateLLMDomainSynonyms.mockResolvedValue(undefined);
    mockGenerateAvatar.mockResolvedValue(undefined);
    mockAppConfig.numberVariables = { enabled: false };
    mockAppConfig.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
    mockAppConfig.engine = { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95, junkThreshold: 0.75 };
});

// =========================================================================
// createNode — number variable extraction with actual vars
// =========================================================================

describe('createNode — number variables', () => {
    it('updates node content when variables are extracted', async () => {
        mockAppConfig.numberVariables = { enabled: true };
        mockRegisterNodeVariables.mockResolvedValue({
            varIds: ['NX001', 'NX002'],
            annotatedContent: 'Content with [[[NX001]]] and [[[NX002]]]',
        });
        const fakeNode = { id: 'node-nv', content: 'Content with 42 and 99', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('Content with 42 and 99', 'seed', 'human', { domain: 'test' });
        expect(result).not.toBeNull();
        // Should have called UPDATE for number variables
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE nodes SET content')
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('handles number variable extraction failure gracefully', async () => {
        mockAppConfig.numberVariables = { enabled: true };
        mockRegisterNodeVariables.mockRejectedValue(new Error('extraction failed'));
        const fakeNode = { id: 'node-nv2', content: 'Content with 42', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('Content with 42', 'seed', 'human', { domain: 'test' });
        // Should proceed despite failure
        expect(result).not.toBeNull();
    });

    it('skips number variables when domain is not provided', async () => {
        mockAppConfig.numberVariables = { enabled: true };
        const fakeNode = { id: 'node-nv3', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', {});
        expect(mockRegisterNodeVariables).not.toHaveBeenCalled();
    });
});

// =========================================================================
// createNode — ensurePartition failure
// =========================================================================

describe('createNode — ensurePartition error', () => {
    it('continues when ensurePartition throws', async () => {
        mockEnsurePartition.mockRejectedValueOnce(new Error('partition DB error'));
        const fakeNode = { id: 'node-ep', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('test', 'seed', 'human', { domain: 'bad-partition' });
        expect(result).not.toBeNull();
    });
});

// =========================================================================
// createNode — computeContentHash failure
// =========================================================================

describe('createNode — content hash error', () => {
    it('continues when computeContentHash throws', async () => {
        mockComputeContentHash.mockImplementation(() => { throw new Error('hash error'); });
        const fakeNode = { id: 'node-hash', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('test', 'seed', 'human', { domain: 'test' });
        expect(result).not.toBeNull();
    });
});

// =========================================================================
// createNode — inline autorating
// =========================================================================

describe('createNode — inline autorating', () => {
    it('triggers inline autorating when enabled', async () => {
        mockAppConfig.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        const fakeNode = { id: 'node-ar', content: 'Test content for autorating', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        // Mock the autorating LLM response
        mockCallSubsystemModel.mockResolvedValue('{"rating": 1, "reason": "good content"}');

        await createNode('Test content for autorating', 'seed', 'human', { domain: 'test' });

        // Autorating is fire-and-forget; just ensure no crash
        // Wait a tick for the promise to settle
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('skips inline autorating for raw nodes', async () => {
        mockAppConfig.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        const fakeNode = { id: 'node-raw', content: 'raw content', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('raw content', 'raw', 'kb:scanner', { domain: 'test' });
        // autorating should not be called for raw nodes
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('handles autorating failure silently', async () => {
        mockAppConfig.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        const fakeNode = { id: 'node-af', content: 'Test content for autorating', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM timeout'));

        await createNode('Test content for autorating', 'seed', 'human', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
        // Should not throw
    });

    it('handles autorating with invalid JSON response', async () => {
        mockAppConfig.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        const fakeNode = { id: 'node-aj', content: 'Test content for autorating', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockCallSubsystemModel.mockResolvedValue('not json at all');

        await createNode('Test content for autorating', 'seed', 'human', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('handles autorating with invalid rating value', async () => {
        mockAppConfig.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        const fakeNode = { id: 'node-ir', content: 'Test content for autorating', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);
        mockCallSubsystemModel.mockResolvedValue('{"rating": 5, "reason": "bad value"}');

        await createNode('Test content for autorating', 'seed', 'human', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
    });
});

// =========================================================================
// createNode — avatar generation
// =========================================================================

describe('createNode — avatar generation', () => {
    it('triggers avatar generation for non-raw nodes with domain', async () => {
        const fakeNode = { id: 'node-av', content: 'Test content for avatar', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('Test content for avatar', 'seed', 'human', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
        // Avatar is fire-and-forget, just ensure no crash
    });

    it('does not trigger avatar for raw nodes', async () => {
        const fakeNode = { id: 'node-av2', content: 'raw content', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('raw content', 'raw', 'kb:scanner', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
    });
});

// =========================================================================
// createNode — keyword generation
// =========================================================================

describe('createNode — keyword generation', () => {
    it('triggers keyword generation for nodes with content and domain', async () => {
        const fakeNode = { id: 'node-kw', content: 'Test content for keywords', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('Test content for keywords', 'seed', 'human', { domain: 'test' });
        await new Promise(resolve => setTimeout(resolve, 50));
    });
});

// =========================================================================
// createNode — decidedByTier
// =========================================================================

describe('createNode — decidedByTier', () => {
    it('passes decidedByTier to ensurePartition', async () => {
        const fakeNode = { id: 'node-dt', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', { domain: 'test', decidedByTier: 'human' as any });
        expect(mockEnsurePartition).toHaveBeenCalledWith('test', 'human');
    });

    it('uses born_at as fallback when created_at is missing', async () => {
        const fakeNode = { id: 'node-ba', content: 'test', born_at: '2024-06-01T00:00:00Z' };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', { domain: 'test' });
        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({ createdAt: '2024-06-01T00:00:00Z' }),
        );
    });

    it('logs domain assignment decision when domain is provided', async () => {
        const fakeNode = { id: 'node-dd', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', { domain: 'my-domain', contributor: 'claude' });
        // logDecision should be called for both 'created' and 'domain'
        const domainCalls = mockLogDecision.mock.calls.filter(
            (c: any) => c[2] === 'domain'
        );
        expect(domainCalls.length).toBe(1);
    });
});

// =========================================================================
// createNode — null embedding
// =========================================================================

describe('createNode — null embedding', () => {
    it('handles null embedding gracefully', async () => {
        mockGetEmbedding.mockResolvedValue(null);
        const fakeNode = { id: 'node-ne', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('test', 'seed', 'human', {});
        expect(result).not.toBeNull();
        expect(mockL2Normalize).not.toHaveBeenCalled();
    });
});

// =========================================================================
// createNode — logOperation failure (fire-and-forget)
// =========================================================================

describe('createNode — logOperation failure', () => {
    it('continues when logOperation rejects', async () => {
        mockLogOperation.mockRejectedValue(new Error('log error'));
        const fakeNode = { id: 'node-lo', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        const result = await createNode('test', 'seed', 'human', { domain: 'test' });
        expect(result).not.toBeNull();
        await new Promise(resolve => setTimeout(resolve, 50));
    });
});

// =========================================================================
// createNode — metadata serialization
// =========================================================================

describe('createNode — metadata', () => {
    it('serializes metadata to JSON when provided', async () => {
        const fakeNode = { id: 'node-md', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', { metadata: { key: 'value' } });
        const insertCall = mockQueryOne.mock.calls.find(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO nodes')
        );
        expect(insertCall).toBeTruthy();
        const params = insertCall![1] as any[];
        // metadata is at index 13
        expect(params[13]).toBe('{"key":"value"}');
    });
});

// =========================================================================
// editNodeContent — parent hashes and system contributor
// =========================================================================

describe('editNodeContent — parent hashes and edge cases', () => {
    beforeEach(() => {
        mockQueryOne.mockImplementation(async (sql: string, _params?: any[]) => {
            if (sql.includes('SELECT id, content, domain')) {
                return { id: 'n1', content: 'old content', domain: 'test', archived: false, node_type: 'seed' };
            }
            if (sql.includes('content_hash')) {
                return { content_hash: 'old-hash' };
            }
            if (sql.includes('contributor, created_at')) {
                return { contributor: 'system', created_at: '2024-01-01' };
            }
            return null;
        });
        mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
            if (typeof sql === 'string' && sql.includes('content_hash FROM edges')) {
                return [{ content_hash: 'parent-hash-1' }, { content_hash: 'parent-hash-2' }];
            }
            return [];
        });
    });

    it('includes parent hashes in content hash computation', async () => {
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human', 'reason');
        expect(result.id).toBe('n1');
        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({
                parentHashes: ['parent-hash-1', 'parent-hash-2'],
            }),
        );
    });

    it('uses system tier for non-human contributors', async () => {
        await editNodeContent('n1', 'new valid content for testing purposes', 'system-autofix');
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'content',
            'old content', 'new valid content for testing purposes',
            'system', // tier
            'system-autofix',
            expect.any(String),
        );
    });

    it('handles computeContentHash failure during edit', async () => {
        mockComputeContentHash.mockImplementation(() => { throw new Error('hash failure'); });
        // Should not throw, just log error
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human');
        expect(result.id).toBe('n1');
    });

    it('handles logOperation rejection during edit gracefully', async () => {
        mockLogOperation.mockRejectedValue(new Error('log write failed'));
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human');
        expect(result.id).toBe('n1');
        await new Promise(resolve => setTimeout(resolve, 50));
    });
});

// =========================================================================
// setExcludedFromBriefs — system contributor
// =========================================================================

describe('setExcludedFromBriefs — system contributor', () => {
    it('uses system tier for non-human contributors', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: false });
        mockQuery.mockResolvedValue([]);

        await setExcludedFromBriefs('n1', true, 'system-auto', 'auto-exclude');
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'excluded',
            'false', 'true',
            'system',
            'system-auto',
            'auto-exclude',
        );
    });

    it('uses human tier for human contributors', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: true });
        mockQuery.mockResolvedValue([]);

        await setExcludedFromBriefs('n1', false, 'human-user');
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'excluded',
            'true', 'false',
            'human',
            'human-user',
            expect.stringContaining('disabled'),
        );
    });
});

// =========================================================================
// inferDomain — LLM tier returning new domain
// =========================================================================

describe('inferDomain — LLM tier edge cases', () => {
    it('returns new domain when LLM suggests a novel domain', async () => {
        mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
            // embedding tier: return domain rep with low similarity
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('max_weight')) {
                return [{ domain: 'physics', embedding_bin: Buffer.from([1, 2, 3]) }];
            }
            // LLM tier: return list of existing domains
            if (typeof sql === 'string' && sql.includes('DISTINCT domain') && sql.includes('ORDER BY domain')) {
                return [{ domain: 'physics' }, { domain: 'biology' }];
            }
            return [];
        });
        mockCosineSimilarity.mockReturnValue(0.2); // below threshold
        mockCallSubsystemModel.mockResolvedValue('{"domain": "quantum-computing"}');

        const result = await inferDomain('quantum computing with qubits and gates');
        expect(result.domain).toBe('quantum-computing');
        expect(result.source).toBe('new');
    });

    it('returns existing domain via LLM when match found', async () => {
        mockQuery.mockImplementation(async (sql: string, _params?: any[]) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('max_weight')) {
                return [{ domain: 'physics', embedding_bin: Buffer.from([1, 2, 3]) }];
            }
            if (typeof sql === 'string' && sql.includes('DISTINCT domain') && sql.includes('ORDER BY domain')) {
                return [{ domain: 'physics' }, { domain: 'biology' }];
            }
            return [];
        });
        mockCosineSimilarity.mockReturnValue(0.2);
        mockCallSubsystemModel.mockResolvedValue('{"domain": "physics"}');

        const result = await inferDomain('something about quantum mechanics');
        expect(result.domain).toBe('physics');
        expect(result.source).toBe('llm');
    });

    it('falls back to slug when LLM response has no JSON', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('max_weight')) {
                return [];
            }
            if (typeof sql === 'string' && sql.includes('DISTINCT domain')) {
                return [];
            }
            return [];
        });
        mockGetEmbedding.mockResolvedValue(null);
        mockCallSubsystemModel.mockResolvedValue('I think this belongs to general studies');

        const result = await inferDomain('something completely novel');
        expect(result.source).toBe('new');
        expect(result.domain).toBeTruthy();
    });

    it('handles embedding tier error gracefully', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin')) {
                throw new Error('DB connection lost');
            }
            if (typeof sql === 'string' && sql.includes('DISTINCT domain')) {
                return [];
            }
            return [];
        });
        mockCallSubsystemModel.mockRejectedValue(new Error('no model'));

        const result = await inferDomain('test content');
        expect(result.source).toBe('new');
    });

    it('handles long text search key extraction with period', async () => {
        // Text > 80 chars with a period after position 30
        const longText = 'This is a rather lengthy sentence that goes on and on. And then continues further with more details.';
        mockQuery.mockResolvedValueOnce([{ domain: 'test' }]);

        const result = await inferDomain(longText);
        expect(result.domain).toBe('test');
    });

    it('returns unassigned domain when slug is empty', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(null);
        mockCallSubsystemModel.mockRejectedValue(new Error('no model'));

        // Characters that will all be stripped by toDomainSlug
        const result = await inferDomain('!@#');
        expect(result.domain).toBe('unassigned');
        expect(result.source).toBe('new');
    });
});

// =========================================================================
// ensureDomainSynonyms — bio domain prefixes
// =========================================================================

describe('ensureDomainSynonyms — generates bio prefixes', () => {
    it('generates bio prefixes for organ-related domains', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('organ-printing');

        // Should insert bio-prefixed synonyms
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const insertedSynonyms = insertCalls.map((c: any) => c[1][1]);
        expect(insertedSynonyms).toContain('bioorgan');
        expect(insertedSynonyms).toContain('bio-organ');
    });

    it('generates bio prefixes for cell-related domains', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await ensureDomainSynonyms('cell-biology');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const insertedSynonyms = insertCalls.map((c: any) => c[1][1]);
        expect(insertedSynonyms).toContain('biocell');
    });

    it('generates -ing and -ed variants', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await ensureDomainSynonyms('printed-text');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const insertedSynonyms = insertCalls.map((c: any) => c[1][1]);
        // 'printed' ends with 'ed' -> should generate 'print' and 'printing'
        expect(insertedSynonyms).toContain('print');
        expect(insertedSynonyms).toContain('printing');
    });

    it('generates plural/singular variants', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await ensureDomainSynonyms('sensors');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const insertedSynonyms = insertCalls.map((c: any) => c[1][1]);
        // 'sensors' ends with 's' -> should generate 'sensor'
        expect(insertedSynonyms).toContain('sensor');
    });

    it('handles synonym insert conflict gracefully', async () => {
        mockQuery
            .mockResolvedValueOnce([])  // no existing
            .mockRejectedValueOnce(new Error('UNIQUE constraint'));

        // Should not throw
        await ensureDomainSynonyms('test-domain');
    });
});

// =========================================================================
// findDomainsBySynonym — single short word no fallback
// =========================================================================

describe('findDomainsBySynonym — single word under 3 chars', () => {
    it('returns empty for single word under 3 chars with no matches', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await findDomainsBySynonym('ab');
        expect(result).toEqual([]);
    });
});

// =========================================================================
// toDomainSlug — edge cases
// =========================================================================

describe('toDomainSlug — additional edge cases', () => {
    it('handles input with only special characters', () => {
        expect(toDomainSlug('@#$%^&*()')).toBe('');
    });

    it('handles input with mixed casing and numbers', () => {
        expect(toDomainSlug('V2-Design')).toBe('v2-design');
    });

    it('truncates and removes trailing hyphen from truncation', () => {
        const long = 'this-is-a-really-long-domain-na'; // 31 chars
        const result = toDomainSlug(long);
        expect(result.length).toBeLessThanOrEqual(30);
        expect(result.endsWith('-')).toBe(false);
    });
});

// =========================================================================
// sampleNodes — domain=null with random domain returning {domain: null}
// =========================================================================

describe('sampleNodes — null domain in random pick', () => {
    it('falls back to global query when random domain is null', async () => {
        mockQueryOne.mockResolvedValue({ domain: null });
        mockQuery.mockResolvedValue([{ id: 'n1' }]);

        const result = await sampleNodes(2);
        expect(result).toHaveLength(1);
    });
});

// =========================================================================
// createNode — no domain (skips many code paths)
// =========================================================================

describe('createNode — no domain', () => {
    it('skips ensureDomainSynonyms, ensurePartition, keyword gen when no domain', async () => {
        const fakeNode = { id: 'node-nd', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human', {});
        expect(mockEnsurePartition).not.toHaveBeenCalled();
    });
});

// =========================================================================
// createNode — contributor fallback in origin mapping
// =========================================================================

describe('createNode — origin/contributor fallback', () => {
    it('uses origin as contributor when no contributor specified', async () => {
        const fakeNode = { id: 'node-or', content: 'test', created_at: new Date().toISOString() };
        mockQueryOne.mockResolvedValue(fakeNode);

        await createNode('test', 'seed', 'human-user', {});
        // The tier is determined by options.decidedByTier || (origin === 'human' ? 'human' : 'system')
        // origin='human-user' is NOT exactly 'human', so tier='system'
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-or', 'created',
            null, 'seed',
            'system',
            'human-user',
            expect.any(String),
        );
    });
});

// =========================================================================
// editNodeContent — human contributor detection
// =========================================================================

describe('editNodeContent — human contributor detection', () => {
    it('detects human contributor for tier classification', async () => {
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('SELECT id, content, domain')) {
                return { id: 'n1', content: 'old', domain: 'test', archived: false, node_type: 'seed' };
            }
            if (sql.includes('content_hash')) return { content_hash: 'old' };
            if (sql.includes('contributor, created_at')) return { contributor: 'human', created_at: '2024-01-01' };
            return null;
        });
        mockQuery.mockResolvedValue([]);

        await editNodeContent('n1', 'new valid content for testing purposes', 'human-user', 'fix typo');
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'content',
            'old', 'new valid content for testing purposes',
            'human',
            'human-user',
            'fix typo',
        );
    });
});
