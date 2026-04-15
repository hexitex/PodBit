/**
 * Maximum coverage tests for core/node-ops.ts
 *
 * Targets uncovered branches:
 * - createNode: number variable extraction with varIds > 0, extraction failure,
 *   ensurePartition failure, content hash failure, logOperation rejection,
 *   autorating enabled + inline enabled, autorating failure (non "No model assigned"),
 *   autorating with valid response, avatar generation for non-raw domain nodes,
 *   keywords generation fire-and-forget, decidedByTier passed, born_at fallback
 * - generateDomainSynonyms: -ing, -ed endings, bio prefix, full domain join
 * - editNodeContent: parent hashes, system contributor tier, hash update failure
 * - setExcludedFromBriefs: system contributor, excluded=true initial state
 * - inferDomain: embedding tier with null embedding, LLM tier new domain,
 *   LLM tier with non-matching JSON, search key extraction (long text with period)
 * - autorateNodeInline: all paths (success, parse failure, invalid rating, no JSON match)
 * - decayAll: rescue query params
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[] | null>>().mockResolvedValue([0.1, 0.2, 0.3]);
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('test-model');
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('{}');
const mockMeasureSpecificity = jest.fn<(...args: any[]) => number>().mockReturnValue(5.0);
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
const mockGenerateNodeKeywords = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockGenerateLLMDomainSynonyms = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockGenerateAvatar = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);

const engineConfig: any = {
    salienceFloor: 0.1,
    salienceCeiling: 1.0,
    salienceDecay: 0.99,
    weightDecay: 0.995,
    weightCeiling: 3.0,
    nodes: { defaultWeight: 1.0, defaultSalience: 0.8 },
};

const appConfigMock: any = {
    dedup: { embeddingSimilarityThreshold: 0.9 },
    numberVariables: { enabled: false },
    magicNumbers: { domainInferenceThreshold: 0.7, salienceRescueDays: 7 },
    autonomousCycles: { autorating: { enabled: false, inlineEnabled: false } },
    engine: { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95 },
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
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
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
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));
jest.unstable_mockModule('../../core/keywords.js', () => ({
    generateNodeKeywords: mockGenerateNodeKeywords,
    generateLLMDomainSynonyms: mockGenerateLLMDomainSynonyms,
}));
jest.unstable_mockModule('../../core/avatar-gen.js', () => ({
    generateAvatar: mockGenerateAvatar,
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

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: {
        misc: {
            nodeReselectionCooldownMinutes: 10,
            domainSlugWords: 3,
            keywordTemperature: 0.3,
        },
        contentLimits: {
            summaryMinSearchOffset: 30,
            summaryMaxSearchOffset: 80,
            embeddingTruncationChars: 500,
            specificityTruncationChars: 200,
            keywordContentChars: 500,
            maxNodeWords: 200,
        },
        queryLimits: {
            voicingCandidates: 5,
            maxKeywordsToExtract: 30,
        },
        database: {},
        timeouts: {},
    },
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
    mockWeightedRandom.mockReturnValue('RANDOM()');
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockMeasureSpecificity.mockReturnValue(5.0);
    mockL2Normalize.mockImplementation(v => v);
    mockEmbeddingToBuffer.mockReturnValue(Buffer.from('test'));
    mockGetAccessibleDomains.mockResolvedValue(['test-domain']);
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false });
    mockComputeContentHash.mockReturnValue('hash-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockEnsurePartition.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCosineSimilarity.mockReturnValue(0.5);
    mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: '' });
    appConfigMock.numberVariables = { enabled: false };
    appConfigMock.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
    appConfigMock.engine = { synthesisDecayEnabled: false, synthesisDecayGraceDays: 14, synthesisDecayMultiplier: 0.95 };
});

// =============================================================================
// createNode — number variable extraction with varIds
// =============================================================================

describe('createNode — number variable branches', () => {
    const baseNode = {
        id: 'node-1',
        content: 'Content with 42 and 3.14',
        created_at: '2024-01-01T00:00:00Z',
        born_at: '2024-01-01T00:00:00Z',
    };

    it('updates content when registerNodeVariables returns varIds', async () => {
        appConfigMock.numberVariables = { enabled: true };
        mockQueryOne.mockResolvedValue({ ...baseNode });
        mockRegisterNodeVariables.mockResolvedValue({
            varIds: ['NX001', 'NX002'],
            annotatedContent: 'Content with [[[NX001]]] and [[[NX002]]]',
        });

        const result = await createNode('Content with 42 and 3.14', 'seed', 'human', { domain: 'physics' });

        expect(result).not.toBeNull();
        expect(mockRegisterNodeVariables).toHaveBeenCalled();
        // Should have called UPDATE for the annotated content
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('UPDATE nodes SET content')
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
        appConfigMock.numberVariables = { enabled: false };
    });

    it('handles registerNodeVariables failure gracefully', async () => {
        appConfigMock.numberVariables = { enabled: true };
        mockQueryOne.mockResolvedValue({ ...baseNode });
        mockRegisterNodeVariables.mockRejectedValue(new Error('variable extraction failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await createNode('Content with 42', 'seed', 'human', { domain: 'test' });
        consoleSpy.mockRestore();

        expect(result).not.toBeNull();
        appConfigMock.numberVariables = { enabled: false };
    });

    it('skips number variables when no domain', async () => {
        appConfigMock.numberVariables = { enabled: true };
        mockQueryOne.mockResolvedValue({ ...baseNode });

        await createNode('Content with 42', 'seed', 'human', {});

        expect(mockRegisterNodeVariables).not.toHaveBeenCalled();
        appConfigMock.numberVariables = { enabled: false };
    });
});

// =============================================================================
// createNode — ensurePartition failure
// =============================================================================

describe('createNode — partition and hash edge cases', () => {
    const baseNode = {
        id: 'node-1',
        content: 'Test content',
        created_at: '2024-01-01T00:00:00Z',
    };

    it('handles ensurePartition failure gracefully', async () => {
        mockQueryOne.mockResolvedValue({ ...baseNode });
        mockEnsurePartition.mockRejectedValue(new Error('partition creation failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await createNode('Test content', 'seed', 'human', { domain: 'new-domain' });
        consoleSpy.mockRestore();

        expect(result).not.toBeNull();
    });

    it('handles computeContentHash failure gracefully', async () => {
        mockQueryOne.mockResolvedValue({ ...baseNode });
        mockComputeContentHash.mockImplementation(() => { throw new Error('hash error'); });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await createNode('Test content', 'seed', 'human', { domain: 'test' });
        consoleSpy.mockRestore();

        expect(result).not.toBeNull();
        mockComputeContentHash.mockReturnValue('hash-abc');
    });

    it('handles logOperation rejection gracefully', async () => {
        mockQueryOne.mockResolvedValue({ ...baseNode });
        mockLogOperation.mockRejectedValue(new Error('log failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await createNode('Test content', 'seed', 'human', { domain: 'test' });
        // Wait for fire-and-forget to settle
        await new Promise(r => setTimeout(r, 50));
        consoleSpy.mockRestore();

        expect(result).not.toBeNull();
    });

    it('uses decidedByTier when provided', async () => {
        mockQueryOne.mockResolvedValue({ ...baseNode });

        await createNode('Test content', 'seed', 'human', { domain: 'test', decidedByTier: 'human' });

        expect(mockEnsurePartition).toHaveBeenCalledWith('test', 'human');
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'created',
            null, 'seed',
            'human',
            expect.any(String),
            expect.any(String),
        );
    });

    it('uses born_at as fallback when created_at is missing', async () => {
        mockQueryOne.mockResolvedValue({ id: 'node-2', content: 'test', born_at: '2024-06-01T00:00:00Z' });

        await createNode('Test content', 'seed', 'human', { domain: 'test' });

        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({
                createdAt: '2024-06-01T00:00:00Z',
            }),
        );
    });
});

// =============================================================================
// createNode — autorating inline
// =============================================================================

describe('createNode — inline autorating', () => {
    const baseNode = {
        id: 'node-1',
        content: 'Test content for autorating',
        created_at: '2024-01-01T00:00:00Z',
    };

    it('fires inline autorating when enabled for non-raw nodes', async () => {
        appConfigMock.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        mockQueryOne.mockResolvedValue({ ...baseNode });

        // Mock the callSubsystemModel to return a valid autorating response
        mockCallSubsystemModel.mockResolvedValue('{"rating": 1, "reason": "good content"}');

        await createNode('Test content for autorating', 'seed', 'human', { domain: 'test' });

        // Wait for fire-and-forget
        await new Promise(r => setTimeout(r, 100));

        // The autorating should have been attempted (via autorateNodeInline)
        expect(mockCallSubsystemModel).toHaveBeenCalled();
        appConfigMock.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
    });

    it('skips autorating for raw node type', async () => {
        appConfigMock.autonomousCycles = { autorating: { enabled: true, inlineEnabled: true } };
        mockQueryOne.mockResolvedValue({ ...baseNode });

        await createNode('Test raw content', 'raw', 'kb:scanner', { domain: 'test' });
        await new Promise(r => setTimeout(r, 50));

        // callSubsystemModel should NOT be called for autorating on raw nodes
        const autoratingCalls = mockCallSubsystemModel.mock.calls.filter(
            (c: any[]) => c[0] === 'autorating'
        );
        expect(autoratingCalls.length).toBe(0);
        appConfigMock.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
    });

    it('skips autorating when not enabled', async () => {
        appConfigMock.autonomousCycles = { autorating: { enabled: false, inlineEnabled: false } };
        mockQueryOne.mockResolvedValue({ ...baseNode });

        await createNode('Test content', 'seed', 'human', { domain: 'test' });
        await new Promise(r => setTimeout(r, 50));

        const autoratingCalls = mockCallSubsystemModel.mock.calls.filter(
            (c: any[]) => c[0] === 'autorating'
        );
        expect(autoratingCalls.length).toBe(0);
    });
});

// =============================================================================
// createNode — avatar generation
// =============================================================================

describe('createNode — avatar generation', () => {
    it('fires avatar generation for non-raw domain nodes', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'node-1',
            content: 'Test content',
            created_at: '2024-01-01T00:00:00Z',
        });

        await createNode('Test content', 'seed', 'human', { domain: 'test' });
        await new Promise(r => setTimeout(r, 50));

        expect(mockGenerateAvatar).toHaveBeenCalled();
    });

    it('skips avatar generation for raw nodes', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'node-1',
            content: 'Test content',
            created_at: '2024-01-01T00:00:00Z',
        });

        await createNode('Test content', 'raw', 'kb:scanner', { domain: 'test' });
        await new Promise(r => setTimeout(r, 50));

        expect(mockGenerateAvatar).not.toHaveBeenCalled();
    });

    it('skips avatar when no domain', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'node-1',
            content: 'Test content',
            created_at: '2024-01-01T00:00:00Z',
        });

        await createNode('Test content', 'seed', 'human', {});
        await new Promise(r => setTimeout(r, 50));

        expect(mockGenerateAvatar).not.toHaveBeenCalled();
    });
});

// =============================================================================
// createNode — keywords generation
// =============================================================================

describe('createNode — keywords generation', () => {
    it('fires keyword generation for nodes with domain', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'node-1',
            content: 'Test content',
            created_at: '2024-01-01T00:00:00Z',
        });

        await createNode('Test content', 'seed', 'human', { domain: 'test' });
        await new Promise(r => setTimeout(r, 50));

        expect(mockGenerateNodeKeywords).toHaveBeenCalled();
    });
});

// =============================================================================
// editNodeContent — additional branches
// =============================================================================

describe('editNodeContent — system contributor and parent hashes', () => {
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
        mockQuery.mockResolvedValue([]);
    });

    it('uses system tier for non-human contributor', async () => {
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'system-bot');

        // logDecision should use 'system' tier
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'content',
            'old content', 'new valid content for testing purposes',
            'system',
            'system-bot',
            expect.any(String),
        );
    });

    it('uses human tier for human-prefixed contributor', async () => {
        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human:admin');

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'content',
            'old content', 'new valid content for testing purposes',
            'human',
            'human:admin',
            expect.any(String),
        );
    });

    it('includes parent hashes in content hash computation', async () => {
        // editNodeContent calls query for: 1) UPDATE nodes SET content, 2) SELECT parent hashes, 3) UPDATE content_hash
        mockQuery.mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('content_hash FROM edges')) {
                return [{ content_hash: 'parent-hash-1' }, { content_hash: 'parent-hash-2' }];
            }
            return [];
        });

        await editNodeContent('n1', 'new valid content for testing purposes', 'human');

        // computeContentHash should be called with parentHashes
        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({
                parentHashes: ['parent-hash-1', 'parent-hash-2'],
            }),
        );
    });

    it('handles hash update failure gracefully', async () => {
        mockComputeContentHash.mockImplementation(() => { throw new Error('hash computation failed'); });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await editNodeContent('n1', 'new valid content for testing purposes', 'human');
        consoleSpy.mockRestore();

        expect(result.id).toBe('n1');
        mockComputeContentHash.mockReturnValue('hash-abc');
    });

    it('provides custom reason to logDecision', async () => {
        await editNodeContent('n1', 'new valid content for testing purposes', 'human', 'Correcting factual error');

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'content',
            expect.any(String), expect.any(String),
            'human', 'human',
            'Correcting factual error',
        );
    });
});

// =============================================================================
// setExcludedFromBriefs — contributor tier
// =============================================================================

describe('setExcludedFromBriefs — contributor tiers', () => {
    it('uses system tier for non-human contributor', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: false });

        await setExcludedFromBriefs('n1', true, 'system-auto');

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'excluded',
            'false', 'true',
            'system',
            'system-auto',
            expect.stringContaining('enabled'),
        );
    });

    it('uses human tier for human-prefixed contributor', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', domain: 'test', excluded: true });

        await setExcludedFromBriefs('n1', false, 'human:user');

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'excluded',
            'true', 'false',
            'human',
            'human:user',
            expect.stringContaining('disabled'),
        );
    });
});

// =============================================================================
// inferDomain — additional branches
// =============================================================================

describe('inferDomain — additional coverage', () => {
    it('extracts search key at first period after position 30 for long text', async () => {
        const longText = 'x'.repeat(40) + '. Rest of the text goes here.';
        mockQuery.mockResolvedValueOnce([{ domain: 'test-domain' }]);

        const result = await inferDomain(longText);
        expect(result.source).toBe('synonym');
    });

    it('extracts search key at 80 chars when no period after position 30', async () => {
        const longText = 'a word '.repeat(20); // no period, > 80 chars
        mockQuery.mockResolvedValueOnce([{ domain: 'test-domain' }]);

        const result = await inferDomain(longText);
        expect(result.source).toBe('synonym');
    });

    it('handles embedding tier when getEmbedding returns null', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(null);

        const result = await inferDomain('completely unknown text xyzzy');
        expect(result.source).toBe('new');
    });

    it('returns new domain from LLM classification when domain is not in existing list', async () => {
        mockQuery.mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('embedding_bin') && sql.includes('max_weight')) {
                return [];
            }
            if (typeof sql === 'string' && sql.includes('DISTINCT domain') && sql.includes('ORDER BY domain')) {
                return [{ domain: 'physics' }];
            }
            return [];
        });
        mockCallSubsystemModel.mockResolvedValue('{"domain": "chemistry"}');

        const result = await inferDomain('molecular bonding in organic compounds');
        expect(result.domain).toBe('chemistry');
        expect(result.source).toBe('new'); // not in existing domains
    });

    it('handles LLM returning non-JSON response', async () => {
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
        mockCallSubsystemModel.mockResolvedValue('not valid json at all');

        const result = await inferDomain('something random');
        expect(result.source).toBe('new');
    });

    it('falls back to unassigned when slug is empty', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(null);
        mockCallSubsystemModel.mockRejectedValue(new Error('no model'));

        // Use special chars that get stripped to empty
        const result = await inferDomain('!@#');
        expect(result.domain).toBe('unassigned');
    });
});

// =============================================================================
// generateDomainSynonyms — via ensureDomainSynonyms
// =============================================================================

describe('ensureDomainSynonyms — synonym generation', () => {
    it('generates -ing and -ed variants from base word', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('print');

        // Should have inserted synonyms including printing, printed
        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('printing');
    });

    it('generates base word from -ing ending', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('printing');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('print');
        expect(synonymValues).toContain('printed');
    });

    it('generates base word from -ed ending', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('printed');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('print');
        expect(synonymValues).toContain('printing');
    });

    it('generates bio- prefix for organ-related domains', async () => {
        mockQuery.mockResolvedValueOnce([]); // no existing synonyms

        await ensureDomainSynonyms('organ-printing');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('bioorgan');
        expect(synonymValues).toContain('bio-organ');
    });

    it('generates plural variants', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await ensureDomainSynonyms('cell');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('cells');
        // bio- prefix since domain includes 'cell'
        expect(synonymValues).toContain('biocell');
    });

    it('generates singular from plural', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await ensureDomainSynonyms('organs');

        const insertCalls = mockQuery.mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO domain_synonyms')
        );
        const synonymValues = insertCalls.map((c: any[]) => c[1][1]);
        expect(synonymValues).toContain('organ');
    });
});

// =============================================================================
// decayAll — synthesis decay parameters
// =============================================================================

describe('decayAll — parameter validation', () => {
    it('passes salienceRescueDays to rescue query', async () => {
        appConfigMock.magicNumbers.salienceRescueDays = 14;
        await decayAll();

        const rescueQuery = mockQuery.mock.calls[1]; // second call is rescue
        expect(rescueQuery[1]).toContain(14);
    });

    it('passes correct multiplier to synthesis decay', async () => {
        appConfigMock.engine.synthesisDecayEnabled = true;
        appConfigMock.engine.synthesisDecayMultiplier = 0.85;
        appConfigMock.engine.synthesisDecayGraceDays = 7;

        await decayAll();

        const synthDecayQuery = mockQuery.mock.calls[3]; // fourth call is synthesis decay
        expect(synthDecayQuery[1]).toContain(0.85);
        expect(synthDecayQuery[1]).toContain(7);

        appConfigMock.engine.synthesisDecayEnabled = false;
    });
});

// =============================================================================
// updateNodeWeight — default ceiling
// =============================================================================

describe('updateNodeWeight — ceiling edge cases', () => {
    it('uses configured ceiling value', async () => {
        engineConfig.weightCeiling = 5.0;
        await updateNodeWeight('n1', 0.5);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['n1', 0.5, 5.0],
        );
        engineConfig.weightCeiling = 3.0;
    });

    it('defaults to 3.0 when weightCeiling is null', async () => {
        const orig = engineConfig.weightCeiling;
        engineConfig.weightCeiling = null;
        await updateNodeWeight('n1', 0.5);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes'),
            ['n1', 0.5, 3.0],
        );
        engineConfig.weightCeiling = orig;
    });
});

// =============================================================================
// sampleNodes — additional query variations
// =============================================================================

describe('sampleNodes — randomDomain with multiple accessible domains', () => {
    it('uses IN clause when no domain given and random domain has multiple accessible', async () => {
        mockQueryOne.mockResolvedValue({ domain: 'bio' });
        mockGetAccessibleDomains.mockResolvedValue(['bio', 'chem', 'physics']);
        mockQuery.mockResolvedValue([]);

        await sampleNodes(3);

        const lastQuery = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
        expect(lastQuery[0]).toContain('IN');
    });
});

// =============================================================================
// toDomainSlug — edge cases
// =============================================================================

describe('toDomainSlug — additional edge cases', () => {
    it('handles only special characters resulting in empty', () => {
        expect(toDomainSlug('!@#$%')).toBe('');
    });

    it('handles unicode characters', () => {
        expect(toDomainSlug('café')).toBe('caf');
    });

    it('handles string that truncates to end with hyphen', () => {
        const input = 'a'.repeat(29) + '-b';
        const result = toDomainSlug(input);
        expect(result.length).toBeLessThanOrEqual(30);
        expect(result).not.toMatch(/-$/);
    });
});
