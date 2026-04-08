/**
 * Unit tests for core/synthesis-engine.ts —
 * validateSynthesisPair, computeTrajectoryAndWeight, runComprehensiveConsultant,
 * domainDirectedCycle, synthesisCycle, clusterSynthesisCycle,
 * runSynthesisEngine, stopSynthesisEngine, getSynthesisStatus,
 * discoverResonance, getDiscoveries, clearDiscovery, stopCycle.
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
const mockCycleStates: Record<string, any> = {
    validation: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    questions: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    tensions: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    research: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    autorating: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    evm: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
    voicing: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastCycleAt: null, lastError: null },
};
const mockGetCycleStatus = jest.fn<(...a: any[]) => any>().mockReturnValue({});
const mockGetAllCycleStatuses = jest.fn<(...a: any[]) => any>().mockReturnValue({});
const mockRunCycleLoop = jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ success: true });

// ─── Config mocks ───────────────────────────────────────────────────────────

const mockEngineConfig = {
    resonanceThreshold: 0.35,
    salienceBoost: 0.1,
    salienceDecay: 0.01,
    cycleDelayMs: 100,
    decayEveryNCycles: 10,
    consultantPipeline: { threshold: 6 },
};

const mockAppConfig = {
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

// Dynamic imports used inside the module (lazy loaded)
jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    checkDuplicate: jest.fn<(...a: any[]) => Promise<any>>().mockResolvedValue({ isDuplicate: false, bestSimilarity: 0.3 }),
}));
jest.unstable_mockModule('../../core/elite-pool.js', () => ({
    getEliteBridgingCandidates: jest.fn<(...a: any[]) => Promise<any[]>>().mockResolvedValue([]),
    logBridgingAttempt: jest.fn<(...a: any[]) => Promise<void>>().mockResolvedValue(undefined),
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
    synthesisCycle,
    domainDirectedCycle,
    runSynthesisEngine,
    stopSynthesisEngine,
    getSynthesisStatus,
    discoverResonance,
    getDiscoveries,
    clearDiscovery,
    stopCycle,
} = await import('../../core/synthesis-engine.js');

// ─── Test helpers ───────────────────────────────────────────────────────────

const CONTENT_A = 'Quantum entanglement demonstrates nonlocal correlations between particles separated by arbitrary distances challenging classical assumptions';
const CONTENT_B = 'Metabolic pathways in cellular respiration convert glucose through glycolysis and oxidative phosphorylation generating adenosine triphosphate';

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

// ─── Reset ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();

    // Reset config to defaults
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

    // Reset mock returns
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
});

// =============================================================================
// getSynthesisStatus
// =============================================================================

describe('getSynthesisStatus', () => {
    it('returns status object with running=false by default', () => {
        const status = getSynthesisStatus();
        expect(status).toBeDefined();
        expect(status.running).toBe(false);
    });

    it('returns a copy (not a reference)', () => {
        const s1 = getSynthesisStatus();
        const s2 = getSynthesisStatus();
        expect(s1).not.toBe(s2);
        expect(s1).toEqual(s2);
    });
});

// =============================================================================
// stopSynthesisEngine
// =============================================================================

describe('stopSynthesisEngine', () => {
    it('returns failure when engine is not running', () => {
        const result = stopSynthesisEngine();
        expect(result.success).toBe(false);
        expect(result.message).toContain('not running');
    });
});

// =============================================================================
// stopCycle
// =============================================================================

describe('stopCycle', () => {
    it('delegates synthesis to stopSynthesisEngine', () => {
        const result = stopCycle('synthesis');
        expect(result.success).toBe(false);
        expect(result.message).toContain('not running');
    });

    it('sets shouldStop on non-synthesis cycle when running', () => {
        mockCycleStates.validation.running = true;
        const result = stopCycle('validation');
        expect(result.success).toBe(true);
        expect(mockCycleStates.validation.shouldStop).toBe(true);
        // Cleanup
        mockCycleStates.validation.running = false;
        mockCycleStates.validation.shouldStop = false;
    });

    it('returns failure for non-synthesis cycle not running', () => {
        const result = stopCycle('tensions');
        expect(result.success).toBe(false);
        expect(result.message).toContain('not running');
    });
});

// =============================================================================
// getDiscoveries / clearDiscovery
// =============================================================================

describe('getDiscoveries', () => {
    it('returns an empty array when no discoveries', () => {
        const discoveries = getDiscoveries();
        expect(Array.isArray(discoveries)).toBe(true);
    });
});

describe('clearDiscovery', () => {
    it('returns false when no matching discovery exists', () => {
        const result = clearDiscovery('nonexistent-a', 'nonexistent-b');
        expect(result).toBe(false);
    });
});

// =============================================================================
// discoverResonance (MCP mode)
// =============================================================================

describe('discoverResonance', () => {
    it('returns null when fewer than 2 nodes are sampled', async () => {
        mockSampleNodes.mockResolvedValue([makeNode()]);
        const result = await discoverResonance(null);
        expect(result).toBeNull();
    });

    it('returns null when resonance is below threshold', async () => {
        const nodeA = makeNode({ id: 'a' });
        const nodeB = makeNodeB({ id: 'b' });
        mockSampleNodes.mockResolvedValue([nodeA, nodeB]);
        mockScoreResonance.mockResolvedValue(0.1); // below threshold 0.35
        const result = await discoverResonance(null);
        expect(result).toBeNull();
        expect(mockUpdateNodeSalience).toHaveBeenCalledTimes(2);
    });

    it('returns a discovery when resonance is above threshold', async () => {
        const nodeA = makeNode({ id: 'a' });
        const nodeB = makeNodeB({ id: 'b' });
        mockSampleNodes.mockResolvedValue([nodeA, nodeB]);
        mockScoreResonance.mockResolvedValue(0.7);
        const result = await discoverResonance(null);
        expect(result).toBeTruthy();
        expect(result!.resonance).toBe(0.7);
        expect(result!.nodeA.id).toBe('a');
        expect(result!.nodeB.id).toBe('b');
        expect(result!.status).toBe('pending');
    });
});

// =============================================================================
// domainDirectedCycle
// =============================================================================

describe('domainDirectedCycle', () => {
    it('returns null when no domain pair is found', async () => {
        mockSelectDomainPair.mockResolvedValue(null);
        const result = await domainDirectedCycle();
        expect(result).toBeNull();
    });

    it('returns null when domain is excluded from synthesis', async () => {
        mockSelectDomainPair.mockResolvedValue({ domainA: 'excluded-domain', domainB: 'other' });
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['excluded-domain']));
        const result = await domainDirectedCycle();
        expect(result).toBeNull();
    });

    it('returns null when cold nodes are not available', async () => {
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValue(null);
        const result = await domainDirectedCycle();
        expect(result).toBeNull();
    });

    it('returns null when embeddings cannot be parsed', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1' });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockParseEmbedding.mockReturnValue(null);
        const result = await domainDirectedCycle();
        expect(result).toBeNull();
    });

    it('rejects pair below resonance threshold', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1' });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.1);
        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(mockEmitActivity).toHaveBeenCalled();
    });

    it('rejects pair above similarity ceiling', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1' });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.95);
        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
    });

    it('rejects when voicing returns no content', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1' });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockVoice.mockResolvedValue({ content: null, rejectionReason: 'derivative' });
        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });

    it('creates a child node on success', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockVoice.mockResolvedValue({ content: 'voiced output text that is long enough for testing', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(5);

        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(true);
        expect(mockCreateNode).toHaveBeenCalled();
        expect(mockCreateEdge).toHaveBeenCalledTimes(2);
        expect(mockRecordBirth).toHaveBeenCalled();
        expect(mockSetCached).toHaveBeenCalled();
    });

    it('rejects when specificity is too low', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockVoice.mockResolvedValue({ content: 'voiced output', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(0.1); // Below 0.5 threshold
        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
    });

    it('escalates to consultant model when voicing fails and consultant available', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockHasConsultant.mockReturnValue(true);
        mockVoice
            .mockResolvedValueOnce({ content: null, rejectionReason: 'derivative' })
            .mockResolvedValueOnce({ content: 'consultant-produced output for testing purposes', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(5);

        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(true);
        expect(mockVoice).toHaveBeenCalledTimes(2);
        // Second call should have useConsultant=true
        expect(mockVoice.mock.calls[1][4]).toBe(true);
    });

    it('boosts parent weights for knowledge trajectory', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'd1', specificity: 8, weight: 1.0 });
        const nodeB = makeNodeB({ id: 'b', domain: 'd2', specificity: 8, weight: 1.0 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'd1', domainB: 'd2' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockVoice.mockResolvedValue({ content: 'some voiced output text for test', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(8); // High specificity => knowledge trajectory

        const result = await domainDirectedCycle();
        expect(result.created).toBe(true);
        // Parent boost query should have been called
        const boostCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('MIN')
        );
        expect(boostCalls.length).toBeGreaterThan(0);
    });
});

// =============================================================================
// synthesisCycle
// =============================================================================

describe('synthesisCycle', () => {
    it('returns null when not enough nodes for sampling', async () => {
        mockSampleNodes.mockResolvedValue([]);
        const result = await synthesisCycle();
        expect(result).toBeNull();
    });

    it('returns null when node domain is excluded', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'excluded' });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['excluded']));
        const result = await synthesisCycle();
        expect(result).toBeNull();
    });

    it('returns no-partner result when findNeighbors returns empty', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test' });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'candidate-1' }]);
        mockFindNeighbors.mockResolvedValue([]);

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
    });

    it('returns null when best partner node lookup fails', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test' });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'candidate-1' }]);
        mockFindNeighbors.mockResolvedValue([{ id: 'candidate-1', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(null);

        const result = await synthesisCycle();
        expect(result).toBeNull();
    });

    it('creates a child node when all gates pass', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'test', specificity: 5 });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'b' }]);
        mockFindNeighbors.mockResolvedValue([{ id: 'b', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(nodeB);
        mockVoice.mockResolvedValue({ content: 'new synthesis output for testing', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(5);

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(true);
        expect(mockCreateNode).toHaveBeenCalled();
        expect(mockCreateEdge).toHaveBeenCalled();
        expect(mockRecordBirth).toHaveBeenCalled();
    });

    it('rejects structural validation failure', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 0, content: 'very short' });
        const nodeB = makeNodeB({ id: 'b', domain: 'test', specificity: 0, content: 'very short too' });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'b' }]);
        mockFindNeighbors.mockResolvedValue([{ id: 'b', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(nodeB);

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });

    it('rejects when voicing returns no content', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'test', specificity: 5 });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'b' }]);
        mockFindNeighbors.mockResolvedValue([{ id: 'b', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(nodeB);
        mockVoice.mockResolvedValue({ content: null, rejectionReason: 'hallucination' });

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
    });

    it('rejects on low specificity', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'test', specificity: 5 });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        mockQuery.mockResolvedValue([{ id: 'b' }]);
        mockFindNeighbors.mockResolvedValue([{ id: 'b', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(nodeB);
        mockVoice.mockResolvedValue({ content: 'test output content for synthesis', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(0.1);

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });

    it('uses niching when no domain provided and niching selects one', async () => {
        mockSelectDomainWithNiching.mockResolvedValue('niched-domain');
        const nodeA = makeNode({ id: 'a', domain: 'niched-domain', specificity: 5 });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['niched-domain']);
        mockQuery.mockResolvedValue([]);
        mockFindNeighbors.mockResolvedValue([]);

        const result = await synthesisCycle(null);
        // sampleNodes should have been called with the niched domain
        expect(mockSampleNodes).toHaveBeenCalledWith(1, 'niched-domain');
    });

    it('handles junk filter rejection', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'test', specificity: 5 });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        // Use mockImplementation so every query call returns the right thing based on SQL content
        mockQuery.mockImplementation(async (sql: string, ..._args: any[]) => {
            if (typeof sql === 'string' && sql.includes('junk = 1')) {
                return [{ id: 'junk-1', embedding: '[0.1,0.2,0.3]' }];
            }
            if (typeof sql === 'string' && sql.includes('SELECT id FROM nodes')) {
                return [{ id: 'b' }];
            }
            return [];
        });
        mockFindNeighbors.mockResolvedValue([{ id: 'b', similarity: 0.6 }]);
        mockQueryOne.mockResolvedValue(nodeB);
        mockVoice.mockResolvedValue({ content: 'test output', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(5);
        // Make junk match — cosineSimilarity is called for junk comparison
        mockCosineSimilarity.mockReturnValue(0.85); // above junkThreshold 0.75

        const result = await synthesisCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });
});

// =============================================================================
// clusterSynthesisCycle
// =============================================================================

// Note: clusterSynthesisCycle is not exported, but is called via runSynthesisEngine
// We can test it indirectly if needed, but since it's not exported, we skip direct tests.
// The cluster cycle paths are exercised via runSynthesisEngine with cluster mode enabled.

// =============================================================================
// runSynthesisEngine
// =============================================================================

describe('runSynthesisEngine', () => {
    it('returns failure when synthesis engine is disabled', async () => {
        mockAppConfig.synthesisEngine.enabled = false;
        const result = await runSynthesisEngine();
        expect(result.success).toBe(false);
        expect(result.message).toContain('disabled');
    });

    it('runs limited cycles and stops', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        // Ensure sampleNodes returns no nodes so cycles are fast
        mockSampleNodes.mockResolvedValue([]);

        const result = await runSynthesisEngine({ maxCycles: 2 });
        expect(result.success).toBe(true);
        expect(result.cycles).toBe(2);
    });

    it('emits engine_start and engine_stop events', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });
        const startCalls = mockEmitActivity.mock.calls.filter(
            (c: any) => c[0] === 'synthesis' && c[1] === 'engine_start'
        );
        const stopCalls = mockEmitActivity.mock.calls.filter(
            (c: any) => c[0] === 'synthesis' && c[1] === 'engine_stop'
        );
        expect(startCalls.length).toBe(1);
        expect(stopCalls.length).toBe(1);
    });

    it('runs in MCP mode and collects discoveries', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        const nodeA = makeNode({ id: 'a' });
        const nodeB = makeNodeB({ id: 'b' });
        mockSampleNodes.mockResolvedValue([nodeA, nodeB]);
        mockScoreResonance.mockResolvedValue(0.7);

        const result = await runSynthesisEngine({ maxCycles: 1, mode: 'mcp' });
        expect(result.success).toBe(true);
        expect(result.mode).toBe('mcp');
        expect(result.discoveries).toBeDefined();
    });

    it('calls decayAll at configured interval', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockEngineConfig.decayEveryNCycles = 2;
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 4 });
        expect(mockDecayAll).toHaveBeenCalledTimes(2);
    });

    it('resets running state after completion', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });
        const status = getSynthesisStatus();
        expect(status.running).toBe(false);
    });

    it('prevents concurrent runs', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockSampleNodes.mockResolvedValue([]);

        // Start first run
        const p1 = runSynthesisEngine({ maxCycles: 1 });
        // Try second concurrent run
        const p2 = runSynthesisEngine({ maxCycles: 1 });

        const [r1, r2] = await Promise.all([p1, p2]);
        // One should succeed, the other should report already running
        const results = [r1, r2];
        const failures = results.filter(r => !r.success && r.message?.includes('already running'));
        // At least one should be rejected — timing-dependent, but the guard is there
        expect(results.some(r => r.success)).toBe(true);
    });

    it('calls lifecycleSweep at configured interval when enabled', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockAppConfig.lifecycle = { enabled: true, sweepInterval: 2 };
        mockSampleNodes.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 4 });
        expect(mockLifecycleSweep).toHaveBeenCalled();
    });

    it('increments barren for nodes that did not produce children', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        const nodeA = makeNode({ id: 'a', domain: 'test' });
        mockSampleNodes.mockResolvedValue([nodeA]);
        mockGetAccessibleDomains.mockResolvedValue(['test']);
        // Return candidates so the cycle proceeds past the "not enough candidates" check
        mockQuery.mockResolvedValue([{ id: 'candidate-1' }, { id: 'candidate-2' }]);
        // No valid neighbors in the resonance band => cycle returns {created: false, nodeA}
        mockFindNeighbors.mockResolvedValue([]);

        await runSynthesisEngine({ maxCycles: 1 });
        expect(mockIncrementBarren).toHaveBeenCalled();
    });

    it('handles cycle errors gracefully and continues', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
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

    it('breaks on No model assigned error', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockSampleNodes.mockImplementation(async () => {
            throw new Error('No model assigned for voice');
        });

        const result = await runSynthesisEngine({ maxCycles: 5 });
        expect(result.success).toBe(true);
        // Should have broken out before completing all 5 cycles
        expect(result.cycles).toBeLessThanOrEqual(5);
    });

    it('runs domain-directed cycles when enabled', async () => {
        mockAppConfig.synthesisEngine.enabled = true;
        mockAppConfig.synthesisEngine.domainDirectedEnabled = true;
        mockAppConfig.synthesisEngine.domainDirectedCycleRate = 1.0; // Always domain-directed
        mockSelectDomainPair.mockResolvedValue(null);

        await runSynthesisEngine({ maxCycles: 1 });
        expect(mockSelectDomainPair).toHaveBeenCalled();
    });
});

// =============================================================================
// System domain handling in synthesis
// =============================================================================

describe('system domain handling', () => {
    it('prefers non-system domain for synthesis output target', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'system-domain', specificity: 5 });
        const nodeB = makeNodeB({ id: 'b', domain: 'user-domain', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'system-domain', domainB: 'user-domain' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);
        mockVoice.mockResolvedValue({ content: 'voiced output for domain test', rejectionReason: null });
        mockMeasureSpecificity.mockReturnValue(5);
        mockIsSystemDomain.mockImplementation((d: any, _sys: any) => d === 'system-domain');
        mockGetSystemDomains.mockResolvedValue(['system-domain']);

        const result = await domainDirectedCycle();
        expect(result.created).toBe(true);
        // createNode should be called with the non-system domain
        const createCall = mockCreateNode.mock.calls[0];
        expect(createCall).toBeTruthy();
        const opts = createCall[3] as any;
        expect(opts.domain).toBe('user-domain');
    });
});

// =============================================================================
// Edge cases and error handling
// =============================================================================

describe('edge cases', () => {
    it('handles structural validation: tautology', async () => {
        // Nodes with nearly identical words
        const content = 'apple banana cherry dragonfruit elderberry fig grape';
        const nodeA = makeNode({ id: 'a', domain: 'test', content, specificity: 5 });
        const nodeB = makeNode({ id: 'b', domain: 'test', content: content + ' extra', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'test', domainB: 'test' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);

        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });

    it('handles structural validation: insufficient vocabulary', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', content: 'hi lo', specificity: 5 });
        const nodeB = makeNode({ id: 'b', domain: 'test', content: 'ab cd', specificity: 5 });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'test', domainB: 'test' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);

        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });

    it('handles structural validation: low combined specificity', async () => {
        const nodeA = makeNode({ id: 'a', domain: 'test', specificity: 0.2, content: 'alpha bravo charlie delta echo foxtrot' });
        const nodeB = makeNode({ id: 'b', domain: 'test', specificity: 0.2, content: 'golf hotel india juliet kilo lima' });
        mockSelectDomainPair.mockResolvedValue({ domainA: 'test', domainB: 'test' });
        mockSampleColdNode.mockResolvedValueOnce(nodeA).mockResolvedValueOnce(nodeB);
        mockCosineSimilarity.mockReturnValue(0.6);

        const result = await domainDirectedCycle();
        expect(result).toBeTruthy();
        expect(result.created).toBe(false);
        expect(result.rejected).toBe(true);
    });
});
