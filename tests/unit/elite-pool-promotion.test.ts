/**
 * Unit tests for core/elite-pool-promotion.ts —
 * promoteToElite, scanExistingVerified, demoteFromElite.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockAppConfig = {
    elitePool: {
        enabled: true,
        promotionThreshold: 0.7,
        logicalApprovalEnabled: false,
        logicalApprovalThreshold: 7.0,
        eliteWeight: 2.0,
        dedup: { enabled: false },
        manifestMapping: { enabled: false },
        maxGeneration: 3,
    },
    numberVariables: { enabled: false },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>()
    .mockResolvedValue('This is the synthesized elite content that is long enough to pass the minimum length check.');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const mockCreateNode = jest.fn<() => Promise<any>>().mockResolvedValue({
    id: 'elite-node-abc',
    created_at: '2024-01-01T00:00:00Z',
    content_hash: null,
});
const mockCreateEdge = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
}));

const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const mockGetProjectContextBlock = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

const mockResolveContent = jest.fn<(s: string) => Promise<string>>().mockImplementation(async s => s);
const mockExtractVarIdsFromContent = jest.fn<(s: string) => string[]>().mockReturnValue([]);
const mockGetVariablesByIds = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockRegisterNodeVariables = jest.fn<() => Promise<any>>().mockResolvedValue({ varIds: [], annotatedContent: '' });

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
    extractVarIdsFromContent: mockExtractVarIdsFromContent,
    getVariablesByIds: mockGetVariablesByIds,
    registerNodeVariables: mockRegisterNodeVariables,
}));

const mockComputeContentHash = jest.fn<() => string>().mockReturnValue('hash-abc');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core/integrity.js', () => ({
    computeContentHash: mockComputeContentHash,
    logOperation: mockLogOperation,
}));

const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Elite synthesis prompt');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockCheckEliteDedup = jest.fn<() => Promise<any>>().mockResolvedValue({ isDuplicate: false });
const mockGetNodeVarIds = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core/elite-pool-dedup.js', () => ({
    checkEliteDedup: mockCheckEliteDedup,
    getNodeVarIds: mockGetNodeVarIds,
}));

const mockComputeGeneration = jest.fn<() => Promise<any>>().mockResolvedValue({
    generation: 1,
    atCeiling: false,
    maxGeneration: 3,
});

jest.unstable_mockModule('../../core/elite-pool-generation.js', () => ({
    computeGeneration: mockComputeGeneration,
}));

const mockMapToManifest = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core/elite-pool-manifest.js', () => ({
    mapToManifest: mockMapToManifest,
}));

const mockInvalidateKnowledgeCache = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const { promoteToElite, scanExistingVerified, demoteFromElite } =
    await import('../../core/elite-pool-promotion.js');

// =============================================================================
// Helpers
// =============================================================================

function makeEvmResult(overrides: Record<string, any> = {}): any {
    return {
        nodeId: 'node-1',
        status: 'completed',
        codegen: {
            hypothesis: 'Test hypothesis',
            code: 'print("hello")',
            claimType: 'mathematical',
            expectedBehavior: '',
            evaluationMode: 'llm',
            assertionPolarity: 'positive',
            raw: '',
        },
        sandbox: {
            success: true,
            stdout: 'hello',
            stderr: '',
            exitCode: 0,
            executionTimeMs: 100,
            killed: false,
        },
        evaluation: {
            verified: true,
            claimSupported: true,
            confidence: 0.9,
            score: 0.8,
            mode: 'llm',
            details: '',
            rawOutput: null,
        },
        startedAt: new Date().toISOString(),
        ...overrides,
    };
}

function makeSourceNode(overrides: Record<string, any> = {}): any {
    return { id: 'node-1', content: 'Source content', domain: 'science', node_type: 'synthesis', generation: 0, weight: 1.0, ...overrides };
}

beforeEach(() => {
    jest.resetAllMocks();

    // Reset config
    mockAppConfig.elitePool.enabled = true;
    mockAppConfig.elitePool.promotionThreshold = 0.7;
    mockAppConfig.elitePool.logicalApprovalEnabled = false;
    mockAppConfig.elitePool.logicalApprovalThreshold = 7.0;
    mockAppConfig.elitePool.dedup.enabled = false;
    mockAppConfig.elitePool.manifestMapping.enabled = false;
    mockAppConfig.numberVariables.enabled = false;

    // Restore defaults
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue('This is synthesized elite content that is long enough to pass the minimum length check.');
    mockCreateNode.mockResolvedValue({ id: 'elite-node-abc', created_at: '2024-01-01T00:00:00Z', content_hash: null });
    mockCreateEdge.mockResolvedValue(undefined);
    mockGetProjectContextBlock.mockResolvedValue(null);
    mockResolveContent.mockImplementation(async s => s);
    mockExtractVarIdsFromContent.mockReturnValue([]);
    mockGetVariablesByIds.mockResolvedValue([]);
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: '' });
    mockComputeContentHash.mockReturnValue('hash-abc');
    mockLogOperation.mockResolvedValue(undefined);
    mockLogDecision.mockResolvedValue(undefined);
    mockGetPrompt.mockResolvedValue('Elite synthesis prompt');
    mockCheckEliteDedup.mockResolvedValue({ isDuplicate: false });
    mockGetNodeVarIds.mockResolvedValue([]);
    mockComputeGeneration.mockResolvedValue({ generation: 1, atCeiling: false, maxGeneration: 3 });
    mockMapToManifest.mockResolvedValue(null);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);
});

// =============================================================================
// promoteToElite — guard conditions
// =============================================================================

describe('promoteToElite — disabled/threshold guards', () => {
    it('returns failure when elite pool is disabled', async () => {
        mockAppConfig.elitePool.enabled = false;
        const result = await promoteToElite('node-1', makeEvmResult());
        expect(result.success).toBe(false);
        expect(result.reason).toContain('disabled');
    });

    it('returns failure when confidence is below threshold', async () => {
        const evmResult = makeEvmResult({ evaluation: { ...makeEvmResult().evaluation, confidence: 0.5, claimSupported: true, verified: true } });
        const result = await promoteToElite('node-1', evmResult);
        expect(result.success).toBe(false);
        expect(result.reason).toContain('below threshold');
    });

    it('returns failure when logical approval score is below threshold', async () => {
        mockAppConfig.elitePool.logicalApprovalEnabled = true;
        mockAppConfig.elitePool.logicalApprovalThreshold = 9.0;
        // score=0.8 → scaledScore=8.0 < 9.0
        const evmResult = makeEvmResult({ evaluation: { ...makeEvmResult().evaluation, confidence: 0.9, score: 0.8, claimSupported: true, verified: true } });
        const result = await promoteToElite('node-1', evmResult);
        expect(result.success).toBe(false);
        expect(result.reason).toContain('Logical approval score');
    });

    it('returns failure when claim is not supported and not verified', async () => {
        const evmResult = makeEvmResult({ evaluation: { ...makeEvmResult().evaluation, claimSupported: false, verified: false } });
        const result = await promoteToElite('node-1', evmResult);
        expect(result.success).toBe(false);
        expect(result.reason).toContain('does not support the claim');
    });

    it('accepts when only verified=true (claimSupported=false)', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode()); // source node found
        const evmResult = makeEvmResult({ evaluation: { ...makeEvmResult().evaluation, claimSupported: false, verified: true } });
        // Will proceed — generation ceiling and dedup not an issue here
        // Result depends on createNode etc.
        const result = await promoteToElite('node-1', evmResult);
        // It won't fail on the claim check — may fail later but not on this guard
        expect(result.reason ?? '').not.toContain('does not support the claim');
    });
});

describe('promoteToElite — source node lookup', () => {
    it('returns failure when source node is not found', async () => {
        mockQueryOne.mockResolvedValue(null); // node not found
        const result = await promoteToElite('missing-node', makeEvmResult());
        expect(result.success).toBe(false);
        expect(result.reason).toContain('not found or archived');
    });

    it('uses domain from source node', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'physics' }));
        mockQueryOne.mockResolvedValue(null); // parent hash lookup

        const result = await promoteToElite('node-1', makeEvmResult());
        expect(result.domain).toBe('physics');
    });

    it('defaults domain to "unknown" when source node has no domain', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: null }));
        mockQueryOne.mockResolvedValue(null);

        const result = await promoteToElite('node-1', makeEvmResult());
        // Domain may be 'unknown' in the result
        expect(result.domain).toBe('unknown');
    });
});

describe('promoteToElite — generation ceiling', () => {
    it('returns failure and emits event when generation ceiling is reached', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockComputeGeneration.mockResolvedValue({ generation: 5, atCeiling: true, maxGeneration: 3 });

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(false);
        expect(result.reason).toContain('exceeds ceiling');
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite', 'generation_ceiling_reached', expect.any(String), expect.any(Object),
        );
    });
});

describe('promoteToElite — LLM content synthesis', () => {
    it('returns deferred failure when LLM returns null (empty response)', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockCallSubsystemModel.mockResolvedValue(''); // too short → null

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(false);
        expect(result.reason).toContain('deferred');
    });

    it('returns deferred failure when LLM throws', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockCallSubsystemModel.mockRejectedValue(new Error('Model unavailable'));

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(false);
        expect(result.reason).toContain('deferred');
    });

    it('calls callSubsystemModel with elite_mapping subsystem', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'elite_mapping',
            expect.any(String),
        );
    });

    it('prepends project context to prompt when available', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);
        mockGetProjectContextBlock.mockResolvedValue('Project: MyProject');

        await promoteToElite('node-1', makeEvmResult());

        const [, prompt] = mockCallSubsystemModel.mock.calls[0] as any[];
        expect(String(prompt)).toContain('Project: MyProject');
    });
});

describe('promoteToElite — dedup gate', () => {
    it('returns duplicate rejection when dedup finds a match', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockAppConfig.elitePool.dedup.enabled = true;
        mockCheckEliteDedup.mockResolvedValue({
            isDuplicate: true,
            matchType: 'semantic',
            matchedNodeId: 'elite-existing',
            score: 0.95,
        });

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(false);
        expect(result.reason).toContain('Duplicate detected');
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite', 'elite_duplicate_rejected', expect.any(String), expect.any(Object),
        );
    });

    it('skips dedup when dedup is disabled', async () => {
        mockAppConfig.elitePool.dedup.enabled = false;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockCheckEliteDedup).not.toHaveBeenCalled();
    });
});

describe('promoteToElite — successful promotion', () => {
    it('returns success with elite node ID', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(true);
        expect(result.eliteNodeId).toBe('elite-node-abc');
        expect(result.sourceNodeId).toBe('node-1');
    });

    it('creates the elite_verification node via createNode', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'science' }));
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockCreateNode).toHaveBeenCalledWith(
            expect.any(String),
            'elite_verification',
            'elite-pool',
            expect.objectContaining({ domain: 'science', skipDedup: true }),
        );
    });

    it('creates parent edge from source to elite node', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockCreateEdge).toHaveBeenCalledWith('node-1', 'elite-node-abc', 'parent', 1.0);
    });

    it('inserts into elite_nodes table', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO elite_nodes')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('elite-node-abc');
    });

    it('marks source node as elite_considered', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('elite_considered') && String(sql).includes('= 1')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('node-1');
    });

    it('emits elite_promoted activity event', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite', 'elite_promoted', expect.any(String), expect.any(Object),
        );
    });

    it('recomputes content hash with parent hash when parent has one', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());    // source node
        mockQueryOne.mockResolvedValueOnce({ content_hash: 'parent-hash' }); // parent hash
        mockQueryOne.mockResolvedValue(null); // verification ID

        await promoteToElite('node-1', makeEvmResult());

        expect(mockComputeContentHash).toHaveBeenCalledWith(expect.objectContaining({
            parentHashes: ['parent-hash'],
        }));
    });

    it('returns generation from computeGeneration', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockComputeGeneration.mockResolvedValue({ generation: 2, atCeiling: false, maxGeneration: 3 });
        mockQueryOne.mockResolvedValue(null);

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.generation).toBe(2);
    });

    it('calls mapToManifest when manifest mapping is enabled', async () => {
        mockAppConfig.elitePool.manifestMapping.enabled = true;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'science' }));
        mockQueryOne.mockResolvedValue(null);
        mockMapToManifest.mockResolvedValue({ targets: [{ type: 'goal', relevanceScore: 0.8 }] });

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(mockMapToManifest).toHaveBeenCalled();
        expect(result.manifestMapping).toBeDefined();
    });

    it('does not call mapToManifest when manifest mapping is disabled', async () => {
        mockAppConfig.elitePool.manifestMapping.enabled = false;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);

        await promoteToElite('node-1', makeEvmResult());

        expect(mockMapToManifest).not.toHaveBeenCalled();
    });

    it('returns failure when createNode returns null (general dedup)', async () => {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockCreateNode.mockResolvedValue(null);

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(false);
        expect(result.reason).toContain('Node creation failed');
    });

    it('registers number variables when enabled and node has varIds', async () => {
        mockAppConfig.numberVariables.enabled = true;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'science' }));
        mockQueryOne.mockResolvedValue(null);
        mockRegisterNodeVariables.mockResolvedValue({ varIds: ['v1'], annotatedContent: 'annotated content' });
        mockGetNodeVarIds.mockResolvedValue(['src-v1', 'src-v2']);
        mockGetVariablesByIds.mockResolvedValue([
            { varId: 'src-v1', value: '42' },
            { varId: 'src-v2', value: '3.14' },
        ]);

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(true);
        expect(result.verifiedVariables?.count).toBe(2);
        expect(mockRegisterNodeVariables).toHaveBeenCalled();
        // Should update node content with annotated version
        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes SET content') && !String(sql).includes('generation')
            && !String(sql).includes('elite_considered')
        );
        expect(updateCall).toBeDefined();
    });

    it('handles variable registration failure gracefully', async () => {
        mockAppConfig.numberVariables.enabled = true;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'science' }));
        mockQueryOne.mockResolvedValue(null);
        mockRegisterNodeVariables.mockRejectedValue(new Error('Registration failed'));

        const result = await promoteToElite('node-1', makeEvmResult());

        // Should still succeed despite variable registration failure
        expect(result.success).toBe(true);
    });

    it('emits manifest_progress when manifest mapping returns targets', async () => {
        mockAppConfig.elitePool.manifestMapping.enabled = true;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode({ domain: 'science' }));
        mockQueryOne.mockResolvedValue(null);
        mockMapToManifest.mockResolvedValue({
            targets: [
                { type: 'goal', relevanceScore: 0.85 },
                { type: 'milestone', relevanceScore: 0.72 },
            ],
        });

        const result = await promoteToElite('node-1', makeEvmResult());

        expect(result.success).toBe(true);
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite', 'manifest_progress', expect.any(String),
            expect.objectContaining({ eliteNodeId: 'elite-node-abc' }),
        );
    });

    it('handles manifest mapping failure gracefully', async () => {
        mockAppConfig.elitePool.manifestMapping.enabled = true;
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);
        mockMapToManifest.mockRejectedValue(new Error('Manifest error'));

        const result = await promoteToElite('node-1', makeEvmResult());

        // Should still succeed despite manifest mapping failure
        expect(result.success).toBe(true);
        expect(result.manifestMapping).toBeUndefined();
    });
});

describe('promoteToElite — categorizeVerificationType', () => {
    async function getVerificationType(evmOverrides: any) {
        mockQueryOne.mockResolvedValueOnce(makeSourceNode());
        mockQueryOne.mockResolvedValue(null);
        await promoteToElite('node-1', makeEvmResult(evmOverrides));

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO elite_nodes')
        );
        return insertCall?.[1]?.[3]; // 4th param is verification_type
    }

    it('classifies testCategory=numerical as mathematical', async () => {
        const vt = await getVerificationType({ testCategory: 'numerical' });
        expect(vt).toBe('mathematical');
    });

    it('classifies testCategory=structural as logical', async () => {
        const vt = await getVerificationType({ testCategory: 'structural' });
        expect(vt).toBe('logical');
    });

    it('classifies testCategory=domain_expert as empirical', async () => {
        const vt = await getVerificationType({ testCategory: 'domain_expert' });
        expect(vt).toBe('empirical');
    });

    it('classifies sympy in code as mathematical', async () => {
        const vt = await getVerificationType({
            testCategory: undefined,
            codegen: { ...makeEvmResult().codegen, code: 'import sympy; x = sympy.Symbol("x")' },
        });
        expect(vt).toBe('mathematical');
    });

    it('defaults to logical', async () => {
        const vt = await getVerificationType({ testCategory: undefined });
        expect(vt).toBe('logical');
    });
});

// =============================================================================
// scanExistingVerified
// =============================================================================

describe('scanExistingVerified', () => {
    it('returns zeros when elite pool is disabled', async () => {
        mockAppConfig.elitePool.enabled = false;
        const result = await scanExistingVerified();
        expect(result).toEqual({ promoted: 0, skipped: 0, errors: 0 });
    });

    it('returns zeros when no candidates found', async () => {
        mockQuery.mockResolvedValue([]); // no candidate rows
        const result = await scanExistingVerified();
        expect(result).toEqual({ promoted: 0, skipped: 0, errors: 0 });
    });

    it('counts promoted when promoteToElite succeeds', async () => {
        const candidateRow = {
            node_id: 'node-x', id: 'exec-1', confidence: 0.9, score: 0.8,
            hypothesis: 'Test', code: 'print()', stdout: 'ok',
            claim_type: 'mathematical', test_category: 'numerical', evaluation_mode: 'llm',
        };
        mockQuery.mockResolvedValueOnce([candidateRow]); // candidates query

        // promoteToElite internals: source node lookup succeeds
        mockQueryOne.mockResolvedValueOnce({ id: 'node-x', content: 'content', domain: 'science', node_type: 'synthesis', weight: 1.0 });
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]); // all DB writes

        const result = await scanExistingVerified(10);
        expect(result.promoted).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.errors).toBe(0);
    });

    it('counts skipped when promoteToElite returns non-success reason', async () => {
        const candidateRow = {
            node_id: 'node-y', id: 'exec-2', confidence: 0.9, score: 0.8,
            hypothesis: '', code: '', stdout: '',
            claim_type: null, test_category: null, evaluation_mode: null,
        };
        mockQuery.mockResolvedValueOnce([candidateRow]);

        // promoteToElite: source node not found → skipped
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await scanExistingVerified(10);
        expect(result.skipped).toBe(1);
        expect(result.promoted).toBe(0);
    });

    it('counts errors when promoteToElite throws', async () => {
        const candidateRow = {
            node_id: 'node-z', id: 'exec-3', confidence: 0.9, score: 0.8,
            hypothesis: '', code: '', stdout: '',
            claim_type: null, test_category: null, evaluation_mode: null,
        };
        mockQuery.mockResolvedValueOnce([candidateRow]);
        mockQueryOne.mockRejectedValueOnce(new Error('DB explosion'));
        mockQuery.mockResolvedValue([]); // UPDATE elite_considered

        const result = await scanExistingVerified(10);
        expect(result.errors).toBe(1);
    });

    it('passes limit to candidates query', async () => {
        mockQuery.mockResolvedValue([]);
        await scanExistingVerified(25);

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(25);
    });
});

// =============================================================================
// demoteFromElite
// =============================================================================

describe('demoteFromElite', () => {
    it('returns error when node is not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await demoteFromElite('node-missing');
        expect((result as any).error).toContain('not found');
    });

    it('returns error when node is not an elite_verification node', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'synthesis', weight: 1.0, domain: 'science' });
        const result = await demoteFromElite('n1');
        expect((result as any).error).toContain('not an elite node');
    });

    it('deletes from elite_nodes table', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        await demoteFromElite('n1');

        const deleteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM elite_nodes')
        );
        expect(deleteCall).toBeDefined();
        expect(deleteCall[1]).toContain('n1');
    });

    it('deletes from elite_manifest_mappings table', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        await demoteFromElite('n1');

        const deleteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM elite_manifest_mappings')
        );
        expect(deleteCall).toBeDefined();
    });

    it('deletes from elite_verified_variables table', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        await demoteFromElite('n1');

        const deleteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM elite_verified_variables')
        );
        expect(deleteCall).toBeDefined();
    });

    it('reverts node_type to synthesis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        await demoteFromElite('n1');

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("node_type = 'synthesis'")
        );
        expect(updateCall).toBeDefined();
    });

    it('emits elite_demotion activity event', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        await demoteFromElite('n1', 'Testing demotion', 'user');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite', 'elite_demotion', expect.any(String), expect.objectContaining({
                nodeId: 'n1',
                reason: 'Testing demotion',
                contributor: 'user',
            }),
        );
    });

    it('invalidates knowledge cache for the node domain', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'physics' });

        await demoteFromElite('n1');

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('physics');
    });

    it('does not call invalidateKnowledgeCache when domain is null', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: null });

        await demoteFromElite('n1');

        expect(mockInvalidateKnowledgeCache).not.toHaveBeenCalled();
    });

    it('returns demotion summary object', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', node_type: 'elite_verification', weight: 2.0, domain: 'science' });

        const result = await demoteFromElite('n1', 'Review demoted', 'curator') as any;

        expect(result.nodeId).toBe('n1');
        expect(result.previousType).toBe('elite_verification');
        expect(result.newType).toBe('synthesis');
        expect(result.reason).toBe('Review demoted');
    });
});
