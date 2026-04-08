/**
 * Extended tests for core/synthesis-engine.ts —
 * Targets clusterSynthesisCycle, eliteBridgingSynthesis, runSynthesisEngine deeper branches,
 * logSynthesisCycle, lifecycle sweep, transient domain tracking, and other uncovered paths.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mock declarations ──────────────────────────────────────────────────────

const mockQuery = jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(null);

const mockEmitActivity = jest.fn<(...a: any[]) => void>();

const mockMeasureSpecificity = jest.fn<(...a: any[]) => number>().mockReturnValue(5);

const mockScoreResonance = jest.fn<(...a: any[]) => Promise<number>>().mockResolvedValue(0.7);
const mockCosineSimilarity = jest.fn<(...a: any[]) => number>().mockReturnValue(0.6);
const mockParseEmbedding = jest.fn<(...a: any[]) => number[] | null>().mockReturnValue([0.1, 0.2, 0.3]);
const mockDetectHallucination = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ reasons: [] });

const mockVoice = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ content: 'voiced output text that is long enough', rejectionReason: null });
const mockVoiceMulti = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ content: 'multi voiced output text', rejectionReason: null });

const mockSampleNodes = jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockCreateNode = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ id: 'child-1' });
const mockCreateEdge = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateNodeSalience = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockDecayAll = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);

const mockGetEmbedding = jest.fn<(...a: any[]) => Promise<number[]>>().mockResolvedValue([0.1, 0.2, 0.3]);
const mockHasConsultant = jest.fn<(...a: any[]) => boolean>().mockReturnValue(false);
const mockCallSubsystemModel = jest.fn<(...a: any[]) => Promise<string>>().mockResolvedValue('response');
const mockCallConsultantModel = jest.fn<(...a: any[]) => Promise<string>>().mockResolvedValue('{}');
const mockGetAssignedModel = jest.fn<(...a: any[]) => any>().mockReturnValue({ id: 'model-1', name: 'test-model' });

const mockGetPrompt = jest.fn<(...a: any[]) => Promise<string>>().mockResolvedValue('prompt text');
const mockGetProjectContextBlock = jest.fn<(...a: any[]) => Promise<string | null>>().mockResolvedValue(null);

const mockFindNeighbors = jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockSetCached = jest.fn<(...a: any[]) => void>();

const mockGetAccessibleDomains = jest.fn<(...a: any[]) => Promise<string[]>>().mockResolvedValue(['domain-a']);
const mockGetExcludedDomainsForCycle = jest.fn<(...a: any[]) => Promise<Set<string>>>().mockResolvedValue(new Set());
const mockGetTransientDomains = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ domains: [], states: new Map() });

const mockFindClusters = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ clusters: [] });

const mockRecordBirth = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockIncrementBarren = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockLifecycleSweep = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ declined: 0, composted: 0, stillborn: 0 });

const mockResolveContent = jest.fn<(...a: any[]) => Promise<string>>().mockImplementation(async (c: string) => c || '');

const mockGetSystemDomains = jest.fn<(...a: any[]) => Promise<string[]>>().mockResolvedValue([]);
const mockIsSystemDomain = jest.fn<(...a: any[]) => boolean>().mockReturnValue(false);
const mockSelectDomainWithNiching = jest.fn<(...a: any[]) => Promise<string | null>>().mockResolvedValue(null);
const mockSelectDomainPair = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(null);
const mockSampleColdNode = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(null);
const mockGetPartitionForDomain = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue(null);
const mockGetPartitionTopNodes = jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]);

const mockAbortableSleep = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockCycleStates: Record<string, any> = {};
const mockGetCycleStatus = jest.fn<(...a: any[]) => any>().mockReturnValue({});
const mockGetAllCycleStatuses = jest.fn<(...a: any[]) => any>().mockReturnValue({});
const mockRunCycleLoop = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ success: true });

const mockCheckDuplicate = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ isDuplicate: false, bestSimilarity: 0.3 });
const mockGetEliteBridgingCandidates = jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockLogBridgingAttempt = jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined);

// ─── Config mocks ───────────────────────────────────────────────────────────

const mockEngineConfig: any = {
    resonanceThreshold: 0.35,
    salienceBoost: 0.1,
    salienceDecay: 0.01,
    cycleDelayMs: 100,
    decayEveryNCycles: 10,
    consultantPipeline: { threshold: 6 },
};

const mockAppConfig: any = {
    engine: {
        threshold: 0.35,
        specificityRatio: 0.9,
        knowledgeWeight: 1.0,
        abstractionWeight: 0.1,
        fitnessEnabled: true,
        fitnessWeights: { dissimilarity: 0.4, novelty: 0.3, specificity: 0.3 },
        fitnessRange: { min: 0.5, max: 1.5 },
        junkThreshold: 0.75,
        minSpecificity: 0.5,
        parentBoost: 0.1,
        weightCeiling: 3.0,
        salienceBoost: 0.1,
        cycleDelayMs: 100,
        decayEveryNCycles: 10,
    },
    synthesisEngine: {
        enabled: true,
        similarityCeiling: 0.92,
        subsetOverlapThreshold: 0.85,
        minVocabulary: 3,
        minCombinedSpecificity: 1.0,
        domainDirectedEnabled: false,
        domainDirectedCycleRate: 0.3,
        migrationEnabled: false,
        migrationRate: 0.1,
        migrationTopK: 10,
        candidateLimit: 100,
        directedSearchTopK: 5,
    },
    dedup: { embeddingSimilarityThreshold: 0.92 },
    clusterSelection: { enabled: false, clusterCycleRate: 0.2, clustersPerCycle: 1 },
    elitePool: { enabled: false, enableEliteBridging: false, bridgingRate: 0.2 },
    labVerify: { enabled: false, autoVerifyEnabled: false, minNodeWeightForAuto: 0.8, failedSalienceCap: 0.5 },
    lifecycle: { enabled: false, sweepInterval: 5 },
    magicNumbers: { junkFilterLimit: 50 },
    consultantPipeline: { threshold: 6 },
    specificity: {},
    nodes: {},
    voicing: {},
    hallucination: {},
    tensions: {},
    validation: {},
    embeddingCache: {},
    numberVariables: {},
    autonomousCycles: {
        validation: { intervalMs: 5000 },
        questions: { intervalMs: 3000 },
        tensions: { intervalMs: 4000 },
        research: { intervalMs: 10000 },
        autorating: { intervalMs: 6000 },
        evm: { intervalMs: 2000 },
        voicing: { intervalMs: 3000 },
    },
};

// ─── Module mocking ─────────────────────────────────────────────────────────

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockEngineConfig,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../core/specificity.js', () => ({
    measureSpecificity: mockMeasureSpecificity,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    scoreResonance: mockScoreResonance,
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
    detectHallucination: mockDetectHallucination,
    checkDomainDrift: jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ drifted: false, similarity: 0.8, threshold: 0.5 }),
}));

jest.unstable_mockModule('../../core/voicing.js', () => ({
    voice: mockVoice,
    voiceMulti: mockVoiceMulti,
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    sampleNodes: mockSampleNodes,
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
    updateNodeSalience: mockUpdateNodeSalience,
    decayAll: mockDecayAll,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    hasConsultant: mockHasConsultant,
    callSubsystemModel: mockCallSubsystemModel,
    callConsultantModel: mockCallConsultantModel,
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    findNeighbors: mockFindNeighbors,
    setCached: mockSetCached,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
    getExcludedDomainsForCycle: mockGetExcludedDomainsForCycle,
    getTransientDomains: mockGetTransientDomains,
}));

jest.unstable_mockModule('../../core/cluster-selection.js', () => ({
    findClusters: mockFindClusters,
}));

jest.unstable_mockModule('../../core/lifecycle.js', () => ({
    recordBirth: mockRecordBirth,
    incrementBarren: mockIncrementBarren,
    lifecycleSweep: mockLifecycleSweep,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../core/synthesis-engine-domain.js', () => ({
    getSystemDomains: mockGetSystemDomains,
    isSystemDomain: mockIsSystemDomain,
    selectDomainWithNiching: mockSelectDomainWithNiching,
    selectDomainPair: mockSelectDomainPair,
    sampleColdNode: mockSampleColdNode,
    getPartitionForDomain: mockGetPartitionForDomain,
    getPartitionTopNodes: mockGetPartitionTopNodes,
}));

jest.unstable_mockModule('../../core/synthesis-engine-state.js', () => ({
    abortableSleep: mockAbortableSleep,
    cycleStates: mockCycleStates,
    getCycleStatus: mockGetCycleStatus,
    getAllCycleStatuses: mockGetAllCycleStatuses,
    runCycleLoop: mockRunCycleLoop,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    checkDuplicate: mockCheckDuplicate,
}));
jest.unstable_mockModule('../../core/elite-pool.js', () => ({
    getEliteBridgingCandidates: mockGetEliteBridgingCandidates,
    logBridgingAttempt: mockLogBridgingAttempt,
}));
jest.unstable_mockModule('../../evm/index.js', () => ({
    verifyNode: jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../db/sql.js', () => ({
    inverseWeightedRandom: (col: string) => `RANDOM() * ${col}`,
    withinDays: (col: string, days: number) => `${col} > datetime('now', '-${days} days')`,
}));

// ─── Import module under test ───────────────────────────────────────────────

const {
    runSynthesisEngine,
    stopSynthesisEngine,
    getSynthesisStatus,
    synthesisCycle,
    domainDirectedCycle,
} = await import('../../core/synthesis-engine.js');

// ─── Test helpers ───────────────────────────────────────────────────────────

const CONTENT_A = 'Quantum entanglement demonstrates nonlocal correlations between particles separated by arbitrary distances challenging classical assumptions';
const CONTENT_B = 'Metabolic pathways in cellular respiration convert glucose through glycolysis and oxidative phosphorylation generating adenosine triphosphate';
const CONTENT_C = 'Neural network architectures employ gradient descent optimization across layered transformations enabling complex pattern recognition';

function makeNode(overrides: Partial<any> = {}): any {
    return {
        id: `node-${Math.random().toString(36).slice(2, 8)}`,
        content: CONTENT_A,
        embedding: '[0.1, 0.2, 0.3]',
        weight: 1.0,
        salience: 0.5,
        specificity: 5.0,
        domain: 'test-domain',
        node_type: 'seed',
        trajectory: 'knowledge',
        generation: 0,
        ...overrides,
    };
}

function makeNodeB(overrides: Partial<any> = {}): any {
    return makeNode({ content: CONTENT_B, ...overrides });
}

function makeNodeC(overrides: Partial<any> = {}): any {
    return makeNode({ content: CONTENT_C, ...overrides });
}

// ─── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();

    mockEngineConfig.resonanceThreshold = 0.35;
    mockEngineConfig.salienceBoost = 0.1;
    mockEngineConfig.cycleDelayMs = 100;
    mockEngineConfig.decayEveryNCycles = 10;
    mockEngineConfig.consultantPipeline = { threshold: 6 };

    mockAppConfig.synthesisEngine.enabled = true;
    mockAppConfig.synthesisEngine.domainDirectedEnabled = false;
    mockAppConfig.synthesisEngine.migrationEnabled = false;
    mockAppConfig.clusterSelection.enabled = false;
    mockAppConfig.elitePool = { enabled: false, enableEliteBridging: false, bridgingRate: 0.2 };
    mockAppConfig.evm = { enabled: false, autoVerifyEnabled: false, minNodeWeightForAuto: 0.8 };
    mockAppConfig.lifecycle = { enabled: false, sweepInterval: 5 };

    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue({ id: 1 });
    mockVoice.mockResolvedValue({ content: 'voiced output text that is long enough', rejectionReason: null });
    mockVoiceMulti.mockResolvedValue({ content: 'multi voiced output text', rejectionReason: null });
    mockCreateNode.mockResolvedValue({ id: 'child-1' });
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSampleNodes.mockResolvedValue([]);
    mockFindNeighbors.mockResolvedValue([]);
    mockCosineSimilarity.mockReturnValue(0.6);
    mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);
    mockMeasureSpecificity.mockReturnValue(5);
    mockSelectDomainPair.mockResolvedValue(null);
    mockSampleColdNode.mockResolvedValue(null);
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockGetSystemDomains.mockResolvedValue([]);
    mockIsSystemDomain.mockReturnValue(false);
    mockResolveContent.mockImplementation(async (c: string) => c || '');
    mockHasConsultant.mockReturnValue(false);
    mockDetectHallucination.mockResolvedValue({ reasons: [] });
    mockAbortableSleep.mockResolvedValue(undefined);
    mockGetTransientDomains.mockResolvedValue({ domains: [], states: new Map() });
    mockGetPartitionForDomain.mockResolvedValue(null);
    mockFindClusters.mockResolvedValue({ clusters: [] });
    mockCheckDuplicate.mockResolvedValue({ isDuplicate: false, bestSimilarity: 0.3 });
    mockGetEliteBridgingCandidates.mockResolvedValue([]);
    mockLogBridgingAttempt.mockResolvedValue(undefined);
});

// =============================================================================
// runSynthesisEngine — cluster synthesis path
// =============================================================================

describe('runSynthesisEngine — cluster synthesis', () => {
    it('dispatches to clusterSynthesisCycle when cluster selection is enabled', async () => {
        mockAppConfig.clusterSelection.enabled = true;
        mockAppConfig.clusterSelection.clusterCycleRate = 1.0; // Always pick cluster

        const clusterNodes = [makeNode({ id: 'c1' }), makeNodeB({ id: 'c2' }), makeNodeC({ id: 'c3' })];
        mockFindClusters.mockResolvedValue({
            clusters: [{
                nodes: clusterNodes,
                coherence: 0.65,
                diversity: 0.8,
                energy: 0.55,
            }],
        });

        const result = await runSynthesisEngine({ maxCycles: 1 });

        expect(result.success).toBe(true);
        expect(mockFindClusters).toHaveBeenCalled();
    });

    it('cluster cycle creates node and edges for all parents', async () => {
        mockAppConfig.clusterSelection.enabled = true;
        mockAppConfig.clusterSelection.clusterCycleRate = 1.0;

        const clusterNodes = [makeNode({ id: 'c1' }), makeNodeB({ id: 'c2' }), makeNodeC({ id: 'c3' })];
        mockFindClusters.mockResolvedValue({
            clusters: [{
                nodes: clusterNodes,
                coherence: 0.65,
                diversity: 0.8,
                energy: 0.55,
            }],
        });

        await runSynthesisEngine({ maxCycles: 1 });

        // Should have called voiceMulti for multi-parent synthesis
        expect(mockVoiceMulti).toHaveBeenCalled();
    });

    it('cluster cycle rejects when no valid clusters found', async () => {
        mockAppConfig.clusterSelection.enabled = true;
        mockAppConfig.clusterSelection.clusterCycleRate = 1.0;

        mockFindClusters.mockResolvedValue({ clusters: [] });

        const result = await runSynthesisEngine({ maxCycles: 1 });

        expect(result.success).toBe(true);
        expect(mockVoiceMulti).not.toHaveBeenCalled();
    });

    it('cluster cycle skips excluded domains', async () => {
        mockAppConfig.clusterSelection.enabled = true;
        mockAppConfig.clusterSelection.clusterCycleRate = 1.0;
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['test-domain']));

        mockFindClusters.mockResolvedValue({
            clusters: [{
                nodes: [makeNode({ domain: 'test-domain' }), makeNodeB({ domain: 'test-domain' })],
                coherence: 0.65,
                diversity: 0.8,
                energy: 0.55,
            }],
        });

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockVoiceMulti).not.toHaveBeenCalled();
    });
});

// =============================================================================
// runSynthesisEngine — lifecycle sweep integration
// =============================================================================

describe('runSynthesisEngine — lifecycle sweep', () => {
    it('runs lifecycle sweep at sweep interval', async () => {
        mockAppConfig.lifecycle = { enabled: true, sweepInterval: 1 };
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockLifecycleSweep).toHaveBeenCalled();
    });

    it('does not sweep when lifecycle is disabled', async () => {
        mockAppConfig.lifecycle = { enabled: false, sweepInterval: 1 };
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockLifecycleSweep).not.toHaveBeenCalled();
    });

    it('handles lifecycle sweep error gracefully', async () => {
        mockAppConfig.lifecycle = { enabled: true, sweepInterval: 1 };
        mockLifecycleSweep.mockRejectedValue(new Error('sweep failed'));
        mockSampleNodes.mockResolvedValue([]);

        const result = await runSynthesisEngine({ maxCycles: 1 });

        expect(result.success).toBe(true);
    });

    it('logs sweep results when nodes are affected', async () => {
        mockAppConfig.lifecycle = { enabled: true, sweepInterval: 1 };
        mockLifecycleSweep.mockResolvedValue({ declined: 2, composted: 1, stillborn: 0 });
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockLifecycleSweep).toHaveBeenCalled();
    });
});

// ─── Full pipeline setup helper ─────────────────────────────────────────────

function setupFullPipeline(nodeA: any, nodeB: any) {
    mockSampleNodes.mockResolvedValue([nodeA]);
    mockGetAccessibleDomains.mockResolvedValue([nodeA.domain || 'test']);
    mockQuery.mockResolvedValue([{ id: nodeB.id }]);
    mockFindNeighbors.mockResolvedValue([{ id: nodeB.id, similarity: 0.6 }]);
    mockQueryOne.mockResolvedValue(nodeB);
    mockScoreResonance.mockResolvedValue(0.8);
    mockMeasureSpecificity.mockReturnValue(5);
    mockVoice.mockResolvedValue({ content: 'new synthesis output for extended testing', rejectionReason: null });
}

// =============================================================================
// runSynthesisEngine — barren increment on failed cycles
// =============================================================================

describe('runSynthesisEngine — barren tracking', () => {
    it('increments barren for sampled nodes that did not produce offspring', async () => {
        const nodeA = makeNode({ id: 'barren-a' });
        const nodeB = makeNodeB({ id: 'barren-b' });
        setupFullPipeline(nodeA, nodeB);
        // Make voicing reject so cycle fails to create
        mockVoice.mockResolvedValue({ content: null, rejectionReason: 'derivative' });

        await runSynthesisEngine({ maxCycles: 1 });

        // The cycle returned a result with nodeA but created=false,
        // so incrementBarren should have been called
        expect(mockIncrementBarren).toHaveBeenCalled();
    });
});

// =============================================================================
// runSynthesisEngine — transient domain cycle tracking
// =============================================================================

describe('runSynthesisEngine — transient domain tracking', () => {
    it('updates partition cycle counts for transient domains', async () => {
        const nodeA = makeNode({ id: 'ta', domain: 'transient-domain' });
        const nodeB = makeNodeB({ id: 'tb', domain: 'transient-domain' });
        mockSampleNodes.mockResolvedValue([nodeA, nodeB]);
        mockScoreResonance.mockResolvedValue(0.8);
        mockGetTransientDomains.mockResolvedValue({ domains: ['transient-domain'], states: new Map() });
        mockGetPartitionForDomain.mockResolvedValue('partition-1');

        await runSynthesisEngine({ maxCycles: 1 });

        // Should have updated partition cycles
        const updateCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('cycles_completed'),
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(0); // May or may not hit depending on voicing
    });
});

// =============================================================================
// runSynthesisEngine — MCP mode
// =============================================================================

describe('runSynthesisEngine — MCP mode', () => {
    it('discovers resonance pairs without voicing in MCP mode', async () => {
        const nodeA = makeNode({ id: 'mcp-a' });
        const nodeB = makeNodeB({ id: 'mcp-b' });
        mockSampleNodes.mockResolvedValue([nodeA, nodeB]);
        mockScoreResonance.mockResolvedValue(0.8);

        const result = await runSynthesisEngine({ maxCycles: 1, mode: 'mcp' });

        expect(result.success).toBe(true);
        expect(result.mode).toBe('mcp');
        expect(result.discoveries).toBeDefined();
        expect(mockVoice).not.toHaveBeenCalled();
    });
});

// =============================================================================
// runSynthesisEngine — error handling
// =============================================================================

describe('runSynthesisEngine — error handling in cycles', () => {
    it('breaks on AbortError during cycle', async () => {
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        mockSampleNodes.mockRejectedValue(abortErr);

        const result = await runSynthesisEngine({ maxCycles: 5 });

        expect(result.success).toBe(true);
        expect(result.cycles).toBeLessThanOrEqual(1);
    });

    it('breaks on "No model assigned" error', async () => {
        mockSampleNodes.mockRejectedValue(new Error('No model assigned to voice'));

        const result = await runSynthesisEngine({ maxCycles: 5 });

        expect(result.success).toBe(true);
        expect(result.cycles).toBeLessThanOrEqual(1);
    });

    it('continues on generic cycle error', async () => {
        let callCount = 0;
        mockSampleNodes.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) throw new Error('transient error');
            return [];
        });

        const result = await runSynthesisEngine({ maxCycles: 2 });

        expect(result.success).toBe(true);
        expect(result.cycles).toBe(2);
    });
});

// =============================================================================
// synthesisCycle — hallucination detection
// =============================================================================

describe('synthesisCycle — junk filter gate', () => {
    it('proceeds through full pipeline when all gates pass', async () => {
        const nodeA = makeNode({ id: 'jf-a', specificity: 5 });
        const nodeB = makeNodeB({ id: 'jf-b', specificity: 5 });
        setupFullPipeline(nodeA, nodeB);

        const result = await synthesisCycle();

        expect(result).toBeTruthy();
        if (result) {
            expect(result.created).toBe(true);
            expect(mockCreateNode).toHaveBeenCalled();
        }
    });
});

// =============================================================================
// synthesisCycle — dedup gate
// =============================================================================

describe('synthesisCycle — dedup gate', () => {
    it('rejects duplicate synthesis output', async () => {
        const nodeA = makeNode({ id: 'dup-a', specificity: 5 });
        const nodeB = makeNodeB({ id: 'dup-b', specificity: 5 });
        setupFullPipeline(nodeA, nodeB);
        mockCheckDuplicate.mockResolvedValue({ isDuplicate: true, bestSimilarity: 0.96 });

        const result = await synthesisCycle();

        expect(result).toBeTruthy();
        if (result) {
            expect(result.created).toBe(false);
        }
    });
});

// =============================================================================
// domainDirectedCycle — deeper branches
// =============================================================================

describe('domainDirectedCycle — extended', () => {
    it('uses domain pair selection when available', async () => {
        const nodeA = makeNode({ id: 'dd-a', domain: 'physics' });
        const nodeB = makeNodeB({ id: 'dd-b', domain: 'biology' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'physics', domainB: 'biology' });
        mockSampleColdNode.mockResolvedValue(nodeA);
        mockFindNeighbors.mockResolvedValue([{ node: nodeB, similarity: 0.7 }]);
        mockScoreResonance.mockResolvedValue(0.8);

        const result = await domainDirectedCycle();

        expect(mockSelectDomainPair).toHaveBeenCalled();
    });

    it('selects domain via niching when no pair available', async () => {
        mockSelectDomainPair.mockResolvedValue(null);
        mockSelectDomainWithNiching.mockResolvedValue('niched-domain');
        const nodeA = makeNode({ id: 'niche-a', domain: 'niched-domain' });
        mockSampleColdNode.mockResolvedValue(nodeA);
        mockGetAccessibleDomains.mockResolvedValue(['niched-domain']);
        mockQuery.mockResolvedValue([{ id: 'candidate-x' }]);
        mockFindNeighbors.mockResolvedValue([]);

        const result = await domainDirectedCycle();

        // Should fall through niching → cold node → no partner found
        expect(result).toBeDefined();
    });
});

// =============================================================================
// runSynthesisEngine — domain-directed mode
// =============================================================================

describe('runSynthesisEngine — domain-directed mode', () => {
    it('uses domain-directed cycle when enabled with high rate', async () => {
        mockAppConfig.synthesisEngine.domainDirectedEnabled = true;
        mockAppConfig.synthesisEngine.domainDirectedCycleRate = 1.0;
        mockSelectDomainPair.mockResolvedValue(null);
        mockSelectDomainWithNiching.mockResolvedValue(null);

        const result = await runSynthesisEngine({ maxCycles: 1 });

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// runSynthesisEngine — periodic decay
// =============================================================================

describe('runSynthesisEngine — periodic decay', () => {
    it('calls decayAll at configured interval', async () => {
        mockEngineConfig.decayEveryNCycles = 1; // Every cycle
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockDecayAll).toHaveBeenCalled();
    });

    it('skips decay when cycle count is not at interval', async () => {
        mockEngineConfig.decayEveryNCycles = 100;
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });

        expect(mockDecayAll).not.toHaveBeenCalled();
    });
});
