/**
 * Deep-coverage tests for handlers/graph/propose.ts — targets uncovered branches.
 * Covers: concentration warning, junk filter edge cases, content hash recomputation
 * with parents, generation error handling, potentiallySuperseded truncation,
 * api-enrichment skip paths, and supersedes contributor fallbacks.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mutable config
// ---------------------------------------------------------------------------
const mockConfig = {
    injection: { autoRejectTypes: ['synthesis', 'voiced'] },
    intakeDefense: { enabled: true, concentrationThreshold: 0.5, throttleThreshold: 0.7 },
    engine: { junkThreshold: 0.85 },
    magicNumbers: { junkFilterLimit: 200 },
    nodes: { defaultWeight: 1.0, breakthroughWeight: 2.0 },
    dedup: { supersedesThreshold: 0.95, maxNodesPerDomain: 100 },
};

const mockIsProjectSwitching = jest.fn<() => boolean>().mockReturnValue(false);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCreateNode = jest.fn<() => Promise<any>>();
const mockCreateEdge = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDetectInjection = jest.fn(() => ({ isInjection: false, score: 0, reasons: [] }));
const mockCheckDomainConcentration = jest.fn<() => Promise<any>>();
const mockYieldToEventLoop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue(null);
const mockInvalidateKnowledgeCache = jest.fn<() => void>();
const mockCosineSimilarity = jest.fn<() => number>().mockReturnValue(0);
const mockValidateProposal = jest.fn<() => Promise<any>>();
const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('hash-xyz');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
    logDecision: mockLogDecision,
    detectInjection: mockDetectInjection,
    checkDomainConcentration: mockCheckDomainConcentration,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../db.js', () => ({
    yieldToEventLoop: mockYieldToEventLoop,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
    cosineSimilarity: mockCosineSimilarity,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
}));

jest.unstable_mockModule('../../handlers/graph/validate.js', () => ({
    validateProposal: mockValidateProposal,
}));

jest.unstable_mockModule('../../handlers/projects.js', () => ({
    isProjectSwitching: mockIsProjectSwitching,
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

const { handlePropose } = await import('../../handlers/graph/propose.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCreatedNode(overrides: Record<string, any> = {}): Record<string, any> {
    return {
        id: 'new-node-1',
        content: 'Created node content',
        node_type: 'seed',
        domain: 'science',
        specificity: 1.5,
        weight: 1.0,
        contributor: 'human',
        created_at: '2024-01-01T00:00:00Z',
        generation: 0,
        content_hash: 'existing-hash',
        ...overrides,
    };
}

const defaultParams = {
    content: 'This is a valid seed node',
    nodeType: 'seed',
    domain: 'science',
    contributor: 'human',
};

beforeEach(() => {
    jest.clearAllMocks();

    // Reset config
    mockConfig.injection.autoRejectTypes = ['synthesis', 'voiced'];
    mockConfig.intakeDefense.enabled = true;
    mockConfig.intakeDefense.throttleThreshold = 0.7;
    mockConfig.engine.junkThreshold = 0.85;
    (mockConfig as any).magicNumbers.junkFilterLimit = 200;
    mockConfig.nodes.defaultWeight = 1.0;
    mockConfig.nodes.breakthroughWeight = 2.0;
    mockConfig.dedup.supersedesThreshold = 0.95;
    mockConfig.dedup.maxNodesPerDomain = 100;

    // Default: pass all gates
    mockIsProjectSwitching.mockReturnValue(false);
    mockDetectInjection.mockReturnValue({ isInjection: false, score: 0, reasons: [] });
    mockCheckDomainConcentration.mockResolvedValue({ throttled: false, warning: false, ratio: 0.1, domainCount: 2, totalCount: 20 });
    mockValidateProposal.mockResolvedValue({ accepted: true });
    mockGetEmbedding.mockResolvedValue(null);
    mockCreateNode.mockResolvedValue(makeCreatedNode());
    mockCreateEdge.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockYieldToEventLoop.mockResolvedValue(undefined);
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);
    mockCosineSimilarity.mockReturnValue(0);
    mockComputeContentHash.mockReturnValue('hash-xyz');
    mockLogOperation.mockResolvedValue(undefined);
});

// =============================================================================
// Domain concentration warning (line 68-70)
// =============================================================================

describe('domain concentration warning', () => {
    it('logs warning when concentration.warning is true but not throttled', async () => {
        mockCheckDomainConcentration.mockResolvedValue({
            throttled: false,
            warning: true,
            ratio: 0.55,
            domainCount: 55,
            totalCount: 100,
        });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        // Should NOT be rejected
        expect(result.success).toBe(true);
        // Should have logged a warning
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Domain concentration warning')
        );

        warnSpy.mockRestore();
    });
});

// =============================================================================
// Junk filter edge cases
// =============================================================================

describe('junk filter edge cases', () => {
    it('skips junk nodes without embedding (continue path)', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        // Return a junk node with no embedding
        mockQuery.mockResolvedValueOnce([
            { id: 'junk-no-emb', embedding: null },
        ]);

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        // Should proceed past junk filter (no embedding to compare)
        expect(result.success).toBe(true);
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });

    it('handles junk embedding that is already a parsed array (non-string)', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        // embedding is already an array, not a string
        mockQuery.mockResolvedValueOnce([
            { id: 'junk-arr', embedding: [0.4, 0.4, 0.4] },
        ]);
        mockCosineSimilarity.mockReturnValue(0.5); // below threshold

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(true);
        // cosineSimilarity should have been called with the raw array, not JSON.parsed
        expect(mockCosineSimilarity).toHaveBeenCalledWith(
            [0.5, 0.5, 0.5],
            [0.4, 0.4, 0.4],
        );
    });

    it('catches bad junk embedding JSON gracefully', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        // embedding is a string but invalid JSON
        mockQuery.mockResolvedValueOnce([
            { id: 'junk-bad', embedding: 'not-valid-json' },
        ]);

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        // Should proceed past the bad junk node (caught exception)
        expect(result.success).toBe(true);
    });

    it('skips junk filter for api-enrichment contributor', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'api-enrichment:test',
        });

        // No junk query should have been made
        const junkCall = (mockQuery.mock.calls as any[]).find(([sql]: [string]) =>
            String(sql).includes('junk = 1')
        );
        expect(junkCall).toBeUndefined();
        expect(result.success).toBe(true);
    });

    it('uses fallback junkThreshold when engine config is undefined', async () => {
        (mockConfig as any).engine = undefined;
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        // Junk node query
        mockQuery.mockResolvedValueOnce([
            { id: 'junk-1', embedding: '[0.5,0.5,0.5]' },
        ]);
        mockCosineSimilarity.mockReturnValue(0.86); // above 0.85 fallback

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(false);
        expect(result.reason).toContain('Too similar to junked node');

        // Restore
        (mockConfig as any).engine = { junkThreshold: 0.85 };
    });

    it('uses fallback junkFilterLimit when magicNumbers is falsy', async () => {
        (mockConfig as any).magicNumbers = undefined;
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        mockQuery.mockResolvedValueOnce([]); // no junk nodes

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(true);

        // Restore
        (mockConfig as any).magicNumbers = { junkFilterLimit: 200 };
    });

    it('falls back to empty string when domain is undefined for junk query', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        mockQuery.mockResolvedValueOnce([]); // no junk nodes

        const result = await handlePropose({
            ...defaultParams,
            domain: undefined,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        // Junk query should use '' as domain fallback
        const junkCall = (mockQuery.mock.calls as any[]).find(([sql]: [string]) =>
            String(sql).includes('junk = 1')
        );
        if (junkCall) {
            expect(junkCall[1][0]).toBe('');
        }
    });
});

// =============================================================================
// Supersedes contributor fallbacks (lines 141-142)
// =============================================================================

describe('supersedes with explicit contributor', () => {
    it('passes contributor to logDecision when archiving superseded nodes', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'old-node', content: 'Old content that is long enough to slice', domain: 'science',
        });

        await handlePropose({
            ...defaultParams,
            contributor: 'synthesis-engine',
            nodeType: 'seed',
            supersedes: ['old-node'],
        });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'old-node', 'archived', 'false', 'true',
            'synthesis-engine', 'superseded',
            expect.stringContaining('synthesis-engine'),
        );
    });

    it('invalidates knowledge cache for superseded node domain', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'old-node', content: 'Old content', domain: 'physics',
        });

        await handlePropose({
            ...defaultParams,
            supersedes: ['old-node'],
        });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('physics');
    });

    it('truncates superseded content to 100 chars', async () => {
        const longContent = 'X'.repeat(200);
        mockQueryOne.mockResolvedValueOnce({
            id: 'old-node', content: longContent, domain: 'science',
        });

        const result = await handlePropose({
            ...defaultParams,
            supersedes: ['old-node'],
        });

        expect(result.superseded![0].content.length).toBe(100);
    });
});

// =============================================================================
// Parent edges: generation error + content hash recomputation
// =============================================================================

describe('parent edges: generation computation error', () => {
    it('catches and logs generation computation error', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        // First call: createEdge succeeds
        // Then generation query throws
        mockQuery
            .mockRejectedValueOnce(new Error('DB generation query fail'));

        await handlePropose({
            ...defaultParams,
            parentIds: ['parent-1'],
        });

        expect(errSpy).toHaveBeenCalledWith(
            expect.stringContaining('Generation computation failed')
        );
        errSpy.mockRestore();
    });
});

describe('parent edges: content hash recomputation', () => {
    it('recomputes content hash when parents have hashes', async () => {
        mockCreateNode.mockResolvedValue(makeCreatedNode({ content_hash: 'old-hash' }));

        // Query calls in order:
        // 1. generation query → returns max_gen
        // 2. generation UPDATE → returns []
        // 3. parent content_hash query → returns parent hashes
        // 4. hash UPDATE → returns []
        let callCount = 0;
        mockQuery.mockImplementation(async (sql: any, _params?: any) => {
            callCount++;
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) {
                return [{ max_gen: 1 }];
            }
            if (sqlStr.includes('generation = $1')) {
                return [];
            }
            if (sqlStr.includes('content_hash FROM nodes')) {
                return [{ content_hash: 'parent-hash-1' }];
            }
            if (sqlStr.includes('content_hash = $1')) {
                return [];
            }
            // potentiallySuperseded candidates
            if (sqlStr.includes('archived = FALSE AND domain')) {
                return [];
            }
            return [];
        });

        const result = await handlePropose({
            ...defaultParams,
            parentIds: ['parent-1'],
        });

        expect(result.success).toBe(true);
        expect(mockComputeContentHash).toHaveBeenCalledWith(
            expect.objectContaining({
                parentHashes: ['parent-hash-1'],
            })
        );
        expect(mockLogOperation).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'parents_linked',
                contentHashBefore: 'old-hash',
                contentHashAfter: 'hash-xyz',
            })
        );
    });

    it('uses null fallback when node has no content_hash', async () => {
        mockCreateNode.mockResolvedValue(makeCreatedNode({ content_hash: null }));

        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return [{ content_hash: 'ph1' }];
            if (sqlStr.includes('content_hash = $1')) return [];
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        expect(mockComputeContentHash).toHaveBeenCalled();
        expect(mockLogOperation).toHaveBeenCalledWith(
            expect.objectContaining({ contentHashBefore: null })
        );
    });

    it('skips hash recomputation when parents have no content_hash', async () => {
        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return []; // no parent hashes
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        expect(mockComputeContentHash).not.toHaveBeenCalled();
        expect(mockLogOperation).not.toHaveBeenCalled();
    });

    it('catches content hash recomputation error', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) throw new Error('Hash query fail');
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        const result = await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        expect(result.success).toBe(true);
        expect(errSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to recompute hash with parents')
        );
        errSpy.mockRestore();
    });

    it('catches logOperation error without failing the proposal', async () => {
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockLogOperation.mockRejectedValue(new Error('Log write fail'));

        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return [{ content_hash: 'ph' }];
            if (sqlStr.includes('content_hash = $1')) return [];
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        const result = await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        expect(result.success).toBe(true);
        // The catch fires async, give it a tick
        await new Promise(r => setTimeout(r, 10));
        expect(errSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to log parent linking')
        );
        errSpy.mockRestore();
    });

    it('uses node.contributor fallback in logOperation when contributor is set', async () => {
        mockCreateNode.mockResolvedValue(makeCreatedNode({ contributor: 'voice-engine' }));

        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return [{ content_hash: 'ph' }];
            if (sqlStr.includes('content_hash = $1')) return [];
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        expect(mockLogOperation).toHaveBeenCalledWith(
            expect.objectContaining({ contributor: 'voice-engine' })
        );
    });

    it('falls back to params contributor in logOperation when node.contributor is null', async () => {
        mockCreateNode.mockResolvedValue(makeCreatedNode({ contributor: null }));

        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: 0 }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return [{ content_hash: 'ph' }];
            if (sqlStr.includes('content_hash = $1')) return [];
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        await handlePropose({ ...defaultParams, contributor: 'human', parentIds: ['p1'] });

        expect(mockLogOperation).toHaveBeenCalledWith(
            expect.objectContaining({ contributor: 'human' })
        );
    });
});

describe('parent edges: generation null fallback', () => {
    it('defaults to generation 0 when max_gen is null', async () => {
        mockQuery.mockImplementation(async (sql: any) => {
            const sqlStr = String(sql);
            if (sqlStr.includes('MAX(generation)')) return [{ max_gen: null }];
            if (sqlStr.includes('generation = $1')) return [];
            if (sqlStr.includes('content_hash FROM nodes')) return [];
            if (sqlStr.includes('archived = FALSE AND domain')) return [];
            return [];
        });

        await handlePropose({ ...defaultParams, parentIds: ['p1'] });

        // generation UPDATE should set generation = 1 (0 + 1)
        const genCall = (mockQuery.mock.calls as any[]).find(([sql, params]: [string, any[]]) =>
            String(sql).includes('generation = $1') && params?.[0] === 1
        );
        expect(genCall).toBeDefined();
    });
});

// =============================================================================
// PotentiallySuperseded: truncation and content preview
// =============================================================================

describe('potentiallySuperseded truncation', () => {
    it('truncates to 15 items max and 200 char content preview', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.97);

        // Build 20 candidates
        const candidates = Array.from({ length: 20 }, (_, i) => ({
            id: `cand-${i}`,
            content: 'A'.repeat(300), // > 200 chars
            node_type: 'seed',
            weight: 1.0,
            contributor: 'human',
            created_at: '2024-01-01T00:00:00Z',
            embedding: '[0.5,0.5,0.5]',
        }));

        mockQuery.mockResolvedValueOnce(candidates);

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeDefined();
        expect(result.potentiallySuperseded!.length).toBe(15); // capped at 15
        // Content should be truncated to 200 chars
        for (const ps of result.potentiallySuperseded!) {
            expect(ps.content.length).toBeLessThanOrEqual(200);
        }
    });

    it('sorts potentiallySuperseded by similarity descending', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        const candidates = [
            { id: 'low', content: 'low sim', node_type: 'seed', weight: 1, contributor: 'h', created_at: '2024-01-01', embedding: '[0.5,0.5,0.5]' },
            { id: 'high', content: 'high sim', node_type: 'seed', weight: 1, contributor: 'h', created_at: '2024-01-01', embedding: '[0.5,0.5,0.5]' },
        ];
        mockQuery.mockResolvedValueOnce(candidates);

        let callIdx = 0;
        mockCosineSimilarity.mockImplementation(() => {
            callIdx++;
            return callIdx === 1 ? 0.96 : 0.99;
        });

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded![0].similarity).toBe(0.99);
        expect(result.potentiallySuperseded![1].similarity).toBe(0.96);
    });

    it('handles candidate with non-string embedding (already parsed)', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.97);

        mockQuery.mockResolvedValueOnce([{
            id: 'cand-arr',
            content: 'Content',
            node_type: 'seed',
            weight: 1.0,
            contributor: 'human',
            created_at: '2024-01-01',
            embedding: [0.4, 0.4, 0.4], // already an array
        }]);

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeDefined();
        expect(mockCosineSimilarity).toHaveBeenCalledWith(
            [0.5, 0.5, 0.5],
            [0.4, 0.4, 0.4],
        );
    });

    it('skips candidates without embedding', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        mockQuery.mockResolvedValueOnce([{
            id: 'no-emb',
            content: 'No embedding',
            node_type: 'seed',
            weight: 1.0,
            contributor: 'human',
            created_at: '2024-01-01',
            embedding: null,
        }]);

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeUndefined();
        expect(mockCosineSimilarity).not.toHaveBeenCalled();
    });
});

// =============================================================================
// decidedByTier handling
// =============================================================================

describe('decidedByTier parameter', () => {
    it('uses provided decidedByTier value', async () => {
        await handlePropose({
            ...defaultParams,
            decidedByTier: 'tier2',
            contributor: 'synthesis-engine',
            nodeType: 'seed',
        });

        const createArgs = mockCreateNode.mock.calls[0] as any[];
        expect(createArgs[3].decidedByTier).toBe('tier2');
    });

    it('defaults to human for human contributor when decidedByTier not set', async () => {
        await handlePropose({ ...defaultParams, contributor: 'human' });

        const createArgs = mockCreateNode.mock.calls[0] as any[];
        expect(createArgs[3].decidedByTier).toBe('human');
    });

    it('defaults to system for non-human contributor when decidedByTier not set', async () => {
        await handlePropose({
            ...defaultParams,
            contributor: 'synthesis-engine',
            nodeType: 'seed',
        });

        const createArgs = mockCreateNode.mock.calls[0] as any[];
        expect(createArgs[3].decidedByTier).toBe('system');
    });
});

// =============================================================================
// api-enrichment concentration skip
// =============================================================================

describe('api-enrichment contributor skips', () => {
    it('skips concentration check for api-enrichment: contributor', async () => {
        await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'api-enrichment:test',
        });

        expect(mockCheckDomainConcentration).not.toHaveBeenCalled();
    });
});

// =============================================================================
// No domain — skip potentiallySuperseded
// =============================================================================

describe('potentiallySuperseded with no domain', () => {
    it('skips potentiallySuperseded detection when domain is undefined', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        const result = await handlePropose({
            ...defaultParams,
            domain: undefined,
        });

        expect(result.potentiallySuperseded).toBeUndefined();
    });
});
