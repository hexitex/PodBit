/**
 * Unit tests for handlers/graph/propose.ts — handlePropose.
 * Tests injection gate, concentration gate, validation gate, junk filter,
 * supersedes, node creation, parent edges, and potentiallySuperseded detection.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mutable config so individual tests can adjust settings
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
// Default node returned by createNode
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
        content_hash: null,
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
    jest.resetAllMocks();

    // Reset config to defaults
    mockConfig.injection.autoRejectTypes = ['synthesis', 'voiced'];
    mockConfig.intakeDefense.enabled = true;
    mockConfig.intakeDefense.throttleThreshold = 0.7;
    mockConfig.engine.junkThreshold = 0.85;
    mockConfig.nodes.defaultWeight = 1.0;
    mockConfig.nodes.breakthroughWeight = 2.0;
    mockConfig.dedup.supersedesThreshold = 0.95;
    mockConfig.dedup.maxNodesPerDomain = 100;

    // Default behaviour: pass all gates
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
// Project switching guard
// =============================================================================

describe('project switching guard', () => {
    it('rejects non-human proposals when project switch is in progress', async () => {
        mockIsProjectSwitching.mockReturnValue(true);

        const result = await handlePropose({ ...defaultParams, contributor: 'synthesis-engine' });

        expect(result.success).toBe(false);
        expect(result.rejected).toBe(true);
        expect(result.reason).toContain('Project switch');
    });

    it('allows human proposals even when project switch is in progress', async () => {
        mockIsProjectSwitching.mockReturnValue(true);

        const result = await handlePropose({ ...defaultParams, contributor: 'human' });

        // Should proceed past the guard — not rejected due to project switch
        expect(result.rejected).not.toBe(true);
        if (result.reason) expect(result.reason).not.toContain('project switch');
    });

    it('allows human: prefixed contributor during switch', async () => {
        mockIsProjectSwitching.mockReturnValue(true);

        const result = await handlePropose({ ...defaultParams, contributor: 'human:user-123' });

        expect(result.rejected).not.toBe(true);
        if (result.reason) expect(result.reason).not.toContain('project switch');
    });
});

// =============================================================================
// Injection gate
// =============================================================================

describe('injection gate', () => {
    it('rejects synthesis nodeType when injection detected', async () => {
        mockDetectInjection.mockReturnValue({
            isInjection: true, score: 0.9,
            reasons: ['system_prompt_override', 'ignore_instructions'],
        });

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'synthesis',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(false);
        expect(result.rejected).toBe(true);
        expect(result.reason).toContain('Injection markers detected');
        expect(result.scores!.injectionScore).toBe(0.9);
    });

    it('flags but allows seed nodeType when injection detected', async () => {
        mockDetectInjection.mockReturnValue({
            isInjection: true, score: 0.6,
            reasons: ['suspicious_pattern'],
        });
        // seed not in autoRejectTypes — should NOT be auto-rejected

        const result = await handlePropose({ ...defaultParams, nodeType: 'seed' });

        // Should not be rejected due to injection alone
        if (result.reason) expect(result.reason).not.toContain('Injection markers detected');
        expect(result.rejected).not.toBe(true);
    });

    it('includes injectionFlags in success response when injection flagged', async () => {
        mockDetectInjection.mockReturnValue({
            isInjection: true, score: 0.6,
            reasons: ['suspicious_pattern'],
        });

        const result = await handlePropose({ ...defaultParams, nodeType: 'seed' });

        if (result.success) {
            expect(result.injectionFlags).toBeDefined();
            expect(result.injectionFlags!.score).toBe(0.6);
        }
    });
});

// =============================================================================
// Domain concentration gate
// =============================================================================

describe('domain concentration gate', () => {
    it('rejects when domain is throttled', async () => {
        mockCheckDomainConcentration.mockResolvedValue({
            throttled: true, warning: false,
            ratio: 0.85, domainCount: 85, totalCount: 100,
        });

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced', // non-human, non-seed, non-kb
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(false);
        expect(result.reason).toContain('concentration limit');
    });

    it('skips concentration check for human contributor', async () => {
        const _result = await handlePropose({ ...defaultParams, contributor: 'human' });

        expect(mockCheckDomainConcentration).not.toHaveBeenCalled();
    });

    it('skips concentration check for seed nodeType', async () => {
        const _result = await handlePropose({
            ...defaultParams,
            nodeType: 'seed',
            contributor: 'synthesis-engine',
        });

        expect(mockCheckDomainConcentration).not.toHaveBeenCalled();
    });

    it('skips concentration check for kb: contributor', async () => {
        const _result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'kb:folder-1',
        });

        expect(mockCheckDomainConcentration).not.toHaveBeenCalled();
    });

    it('skips concentration check when intakeDefense is disabled', async () => {
        mockConfig.intakeDefense.enabled = false;

        await handlePropose({ ...defaultParams, nodeType: 'voiced', contributor: 'synthesis-engine' });

        expect(mockCheckDomainConcentration).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Validation gate
// =============================================================================

describe('validation gate', () => {
    it('skips validation for seed nodeType', async () => {
        await handlePropose({ ...defaultParams, nodeType: 'seed' });

        expect(mockValidateProposal).not.toHaveBeenCalled();
    });

    it('skips validation for human contributor', async () => {
        await handlePropose({ ...defaultParams, nodeType: 'voiced', contributor: 'human' });

        expect(mockValidateProposal).not.toHaveBeenCalled();
    });

    it('runs validation for non-human, non-seed proposals', async () => {
        mockValidateProposal.mockResolvedValue({ accepted: true });

        await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(mockValidateProposal).toHaveBeenCalledTimes(1);
    });

    it('rejects when validation fails', async () => {
        mockValidateProposal.mockResolvedValue({
            accepted: false,
            reason: 'Too vague to be useful',
            scores: { specificity: 0.2 },
        });

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(false);
        expect(result.rejected).toBe(true);
        expect(result.reason).toBe('Too vague to be useful');
    });
});

// =============================================================================
// Junk filter
// =============================================================================

describe('junk filter', () => {
    it('skips junk filter when no embedding', async () => {
        mockGetEmbedding.mockResolvedValue(null);

        await handlePropose({ ...defaultParams, nodeType: 'voiced', contributor: 'synthesis-engine' });

        // No junk node query should have been made with junk=1
        const junkCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('junk = 1')
        );
        expect(junkCall).toBeUndefined();
    });

    it('skips junk filter for seed nodeType', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);

        await handlePropose({ ...defaultParams, nodeType: 'seed' });

        const junkCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('junk = 1')
        );
        expect(junkCall).toBeUndefined();
    });

    it('rejects when embedding is too similar to junked node', async () => {
        const embedding = [0.8, 0.6, 0.4];
        mockGetEmbedding.mockResolvedValue(embedding);
        // First query = junk node scan
        mockQuery.mockResolvedValueOnce([{ id: 'junk-node-1', embedding: '[0.8,0.6,0.4]' }]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        mockCosineSimilarity.mockReturnValue(0.9); // above junkThreshold of 0.85

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        expect(result.success).toBe(false);
        expect(result.reason).toContain('Too similar to junked node');
    });

    it('allows proposal when junk similarity is below threshold', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockValidateProposal.mockResolvedValue({ accepted: true });
        mockQuery.mockResolvedValueOnce([{ id: 'junk-1', embedding: '[0.1,0.1,0.1]' }]);
        mockCosineSimilarity.mockReturnValue(0.5); // below threshold

        const result = await handlePropose({
            ...defaultParams,
            nodeType: 'voiced',
            contributor: 'synthesis-engine',
        });

        // Should proceed to createNode
        expect(result.success).toBe(true);
    });
});

// =============================================================================
// Supersedes
// =============================================================================

describe('supersedes', () => {
    it('archives superseded nodes before creating new node', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'old-node', content: 'Old content to be superseded', domain: 'science',
        }); // for supersedes lookup
        // no second queryOne calls needed for this test

        const result = await handlePropose({
            ...defaultParams,
            supersedes: ['old-node'],
        });

        const archiveCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('archived = 1')
        );
        expect(archiveCall).toBeDefined();
        expect(result.superseded).toHaveLength(1);
        expect(result.superseded![0].id).toBe('old-node');
    });

    it('skips missing superseded nodes gracefully', async () => {
        mockQueryOne.mockResolvedValue(null); // node not found

        const result = await handlePropose({
            ...defaultParams,
            supersedes: ['ghost-node'],
        });

        // No archive call since node wasn't found
        const archiveCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('archived = 1')
        );
        expect(archiveCall).toBeUndefined();
        expect(result.superseded).toBeUndefined();
    });
});

// =============================================================================
// Node creation
// =============================================================================

describe('node creation', () => {
    it('returns success with node data on happy path', async () => {
        const result = await handlePropose(defaultParams);

        expect(result.success).toBe(true);
        expect(result.node!.id).toBe('new-node-1');
        expect(result.node!.type).toBe('seed');
        expect(result.node!.domain).toBe('science');
    });

    it('rejects when createNode returns null (duplicate detected)', async () => {
        mockCreateNode.mockResolvedValue(null);

        const result = await handlePropose(defaultParams);

        expect(result.success).toBe(false);
        expect(result.rejected).toBe(true);
        expect(result.reason).toContain('Duplicate content');
    });

    it('invalidates knowledge cache for node domain', async () => {
        await handlePropose(defaultParams);

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('science');
    });

    it('calls yieldToEventLoop after createNode', async () => {
        await handlePropose(defaultParams);

        expect(mockYieldToEventLoop).toHaveBeenCalled();
    });

    it('passes breakthrough weight for breakthrough nodeType', async () => {
        mockCreateNode.mockResolvedValue(makeCreatedNode({ node_type: 'breakthrough', weight: 2.0 }));

        await handlePropose({ ...defaultParams, nodeType: 'breakthrough' });

        const createNodeArgs = mockCreateNode.mock.calls[0] as any[];
        expect(createNodeArgs[3].weight).toBe(2.0);
    });

    it('uses requestedWeight when provided', async () => {
        await handlePropose({ ...defaultParams, weight: 1.75 });

        const createNodeArgs = mockCreateNode.mock.calls[0] as any[];
        expect(createNodeArgs[3].weight).toBe(1.75);
    });
});

// =============================================================================
// Parent edges and generation
// =============================================================================

describe('parent edges', () => {
    it('creates edges for each parentId', async () => {
        mockQuery.mockResolvedValueOnce([{ max_gen: 2 }]); // parent generation query

        await handlePropose({ ...defaultParams, parentIds: ['parent-a', 'parent-b'] });

        expect(mockCreateEdge).toHaveBeenCalledTimes(2);
        expect(mockCreateEdge).toHaveBeenCalledWith('parent-a', 'new-node-1', 'parent');
        expect(mockCreateEdge).toHaveBeenCalledWith('parent-b', 'new-node-1', 'parent');
    });

    it('sets child generation = max parent generation + 1', async () => {
        mockQuery.mockResolvedValueOnce([{ max_gen: 3 }]); // parent gens

        await handlePropose({ ...defaultParams, parentIds: ['parent-1'] });

        const genUpdate = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('generation = $1') && Array.isArray(params) && params[0] === 4
        );
        expect(genUpdate).toBeDefined();
    });

    it('does not create edges when parentIds is empty', async () => {
        await handlePropose({ ...defaultParams, parentIds: [] });

        expect(mockCreateEdge).not.toHaveBeenCalled();
    });

    it('does not create edges when parentIds not provided', async () => {
        await handlePropose(defaultParams);

        expect(mockCreateEdge).not.toHaveBeenCalled();
    });
});

// =============================================================================
// Potentially superseded detection
// =============================================================================

describe('potentiallySuperseded detection', () => {
    it('returns potentiallySuperseded when similar nodes found', async () => {
        const embedding = [0.5, 0.5, 0.5];
        mockGetEmbedding.mockResolvedValue(embedding);

        // Junk query first (for voiced+synthesis, but here we use seed so skip),
        // then superseded candidates query (SELECT ... FROM nodes WHERE archived = FALSE AND domain...)
        // For seed + human, no junk query. First mockQuery after createNode is the superseded candidates.
        mockQuery
            .mockResolvedValueOnce([{ // superseded candidate
                id: 'similar-node', content: 'A very similar piece of content', node_type: 'seed',
                weight: 1.2, contributor: 'human', created_at: '2024-01-01T00:00:00Z',
                embedding: '[0.5,0.5,0.5]',
            }]);
        mockCosineSimilarity.mockReturnValue(0.97); // above supersedesThreshold of 0.95

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeDefined();
        expect(result.potentiallySuperseded!.length).toBeGreaterThan(0);
        expect(result.potentiallySuperseded![0].id).toBe('similar-node');
        expect(result.potentiallySuperseded![0].similarity).toBe(0.97);
    });

    it('returns no potentiallySuperseded when no embedding', async () => {
        mockGetEmbedding.mockResolvedValue(null);

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeUndefined();
    });

    it('returns no potentiallySuperseded when similarity is below threshold', async () => {
        mockGetEmbedding.mockResolvedValue([0.5, 0.5, 0.5]);
        mockQuery.mockResolvedValueOnce([{
            id: 'low-sim-node', content: 'Different content', node_type: 'seed',
            weight: 1.0, contributor: 'human', created_at: '2024-01-01T00:00:00Z',
            embedding: '[0.1,0.1,0.1]',
        }]);
        mockCosineSimilarity.mockReturnValue(0.5); // below supersedesThreshold

        const result = await handlePropose(defaultParams);

        expect(result.potentiallySuperseded).toBeUndefined();
    });
});
