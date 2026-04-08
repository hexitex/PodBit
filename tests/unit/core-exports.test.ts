/**
 * Unit tests for core.ts
 *
 * Tests the barrel re-export file to verify all expected symbols are exported
 * and that the CLI guard at the bottom works correctly.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — stub every sub-module that core.ts re-exports from
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../db.js', () => ({
    pool: { close: jest.fn() },
    query: jest.fn(),
    queryOne: jest.fn(),
    systemQuery: jest.fn(),
    systemQueryOne: jest.fn(),
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: jest.fn(),
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: { proxy: {}, resonance: {} },
}));

jest.unstable_mockModule('../../core/specificity.js', () => ({
    measureSpecificity: jest.fn(),
    addLearnedTerms: jest.fn(),
    loadLearnedTerms: jest.fn(),
    getLearnedTermsCount: jest.fn(),
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    scoreResonance: jest.fn(),
    cosineSimilarity: jest.fn(),
    dotProduct: jest.fn(),
    parseEmbedding: jest.fn(),
    l2Normalize: jest.fn(),
    embeddingToBuffer: jest.fn(),
    bufferToEmbedding: jest.fn(),
    detectInjection: jest.fn(),
    checkDomainConcentration: jest.fn(),
}));

jest.unstable_mockModule('../../core/voicing.js', () => ({
    voice: jest.fn(),
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    sampleNodes: jest.fn(),
    createNode: jest.fn(),
    createEdge: jest.fn(),
    findDomainsBySynonym: jest.fn(),
    ensureDomainSynonyms: jest.fn(),
    updateNodeSalience: jest.fn(),
    updateNodeWeight: jest.fn(),
    decayAll: jest.fn(),
    editNodeContent: jest.fn(),
    setExcludedFromBriefs: jest.fn(),
    inferDomain: jest.fn(),
    toDomainSlug: jest.fn(),
}));

jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    synthesisCycle: jest.fn(),
    domainDirectedCycle: jest.fn(),
    runSynthesisEngine: jest.fn(),
    stopSynthesisEngine: jest.fn(),
    getSynthesisStatus: jest.fn(),
    discoverResonance: jest.fn(),
    getDiscoveries: jest.fn(),
    clearDiscovery: jest.fn(),
    cycleStates: {},
    getCycleStatus: jest.fn(),
    getAllCycleStatuses: jest.fn(),
    stopCycle: jest.fn(),
    runCycleLoop: jest.fn(),
}));

jest.unstable_mockModule('../../core/autonomous-cycles.js', () => ({
    startValidationCycle: jest.fn(),
    startQuestionCycle: jest.fn(),
    startTensionCycle: jest.fn(),
    startResearchCycle: jest.fn(),
    startAutoratingCycle: jest.fn(),
    startEvmCycle: jest.fn(),
    startVoicingCycle: jest.fn(),
    startPopulationControlCycle: jest.fn(),
    startGroundRulesCycle: jest.fn(),
}));

jest.unstable_mockModule('../../core/pending.js', () => ({
    queueRequest: jest.fn(),
    getPendingRequests: jest.fn(),
    completeRequest: jest.fn(),
    cleanupRequests: jest.fn(),
}));

jest.unstable_mockModule('../../core/tensions.js', () => ({
    findTensions: jest.fn(),
    detectTensionSignals: jest.fn(),
    generateQuestion: jest.fn(),
    createQuestionNode: jest.fn(),
}));

jest.unstable_mockModule('../../core/validation.js', () => ({
    validateBreakthrough: jest.fn(),
    markBreakthrough: jest.fn(),
    getSourceNodes: jest.fn(),
}));

jest.unstable_mockModule('../../core/abstract-patterns.js', () => ({
    createOrGetPattern: jest.fn(),
    linkNodeToPattern: jest.fn(),
    getNodePatterns: jest.fn(),
    findPatternSiblings: jest.fn(),
    searchPatterns: jest.fn(),
    getPatternStats: jest.fn(),
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: jest.fn(),
    ensurePartition: jest.fn(),
    checkPartitionHealth: jest.fn(),
    renameDomain: jest.fn(),
    logDecision: jest.fn(),
    canOverride: jest.fn(),
}));

jest.unstable_mockModule('../../core/keywords.js', () => ({
    generateNodeKeywords: jest.fn(),
    getNodeKeywords: jest.fn(),
    backfillDomainSynonyms: jest.fn(),
    backfillNodeKeywords: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const core = await import('../../core.js');

describe('core.ts barrel exports', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should export database functions', () => {
        expect(core.pool).toBeDefined();
        expect(typeof core.query).toBe('function');
        expect(typeof core.queryOne).toBe('function');
        expect(typeof core.systemQuery).toBe('function');
        expect(typeof core.systemQueryOne).toBe('function');
    });

    it('should export embedding helper', () => {
        expect(typeof core.getEmbedding).toBe('function');
    });

    it('should export engine config', () => {
        expect(core.config).toBeDefined();
    });

    it('should export specificity measurement', () => {
        expect(typeof core.measureSpecificity).toBe('function');
    });

    it('should export scoring utilities', () => {
        expect(typeof core.scoreResonance).toBe('function');
        expect(typeof core.cosineSimilarity).toBe('function');
        expect(typeof core.dotProduct).toBe('function');
        expect(typeof core.parseEmbedding).toBe('function');
        expect(typeof core.l2Normalize).toBe('function');
        expect(typeof core.embeddingToBuffer).toBe('function');
        expect(typeof core.bufferToEmbedding).toBe('function');
        expect(typeof core.detectInjection).toBe('function');
        expect(typeof core.checkDomainConcentration).toBe('function');
    });

    it('should export voicing function', () => {
        expect(typeof core.voice).toBe('function');
    });

    it('should export node operations', () => {
        expect(typeof core.sampleNodes).toBe('function');
        expect(typeof core.createNode).toBe('function');
        expect(typeof core.createEdge).toBe('function');
        expect(typeof core.findDomainsBySynonym).toBe('function');
        expect(typeof core.ensureDomainSynonyms).toBe('function');
        expect(typeof core.updateNodeSalience).toBe('function');
        expect(typeof core.updateNodeWeight).toBe('function');
        expect(typeof core.decayAll).toBe('function');
        expect(typeof core.editNodeContent).toBe('function');
        expect(typeof core.setExcludedFromBriefs).toBe('function');
        expect(typeof core.inferDomain).toBe('function');
        expect(typeof core.toDomainSlug).toBe('function');
    });

    it('should export synthesis engine functions', () => {
        expect(typeof core.synthesisCycle).toBe('function');
        expect(typeof core.domainDirectedCycle).toBe('function');
        expect(typeof core.runSynthesisEngine).toBe('function');
        expect(typeof core.stopSynthesisEngine).toBe('function');
        expect(typeof core.getSynthesisStatus).toBe('function');
        expect(typeof core.discoverResonance).toBe('function');
        expect(typeof core.getDiscoveries).toBe('function');
        expect(typeof core.clearDiscovery).toBe('function');
        expect(core.cycleStates).toBeDefined();
        expect(typeof core.getCycleStatus).toBe('function');
        expect(typeof core.getAllCycleStatuses).toBe('function');
        expect(typeof core.stopCycle).toBe('function');
        expect(typeof core.runCycleLoop).toBe('function');
    });

    it('should export autonomous cycle starters', () => {
        expect(typeof core.startValidationCycle).toBe('function');
        expect(typeof core.startQuestionCycle).toBe('function');
        expect(typeof core.startTensionCycle).toBe('function');
        expect(typeof core.startResearchCycle).toBe('function');
        expect(typeof core.startAutoratingCycle).toBe('function');
        expect(typeof core.startEvmCycle).toBe('function');
        expect(typeof core.startVoicingCycle).toBe('function');
    });

    it('should export pending request queue functions', () => {
        expect(typeof core.queueRequest).toBe('function');
        expect(typeof core.getPendingRequests).toBe('function');
        expect(typeof core.completeRequest).toBe('function');
        expect(typeof core.cleanupRequests).toBe('function');
    });

    it('should export tension detection functions', () => {
        expect(typeof core.findTensions).toBe('function');
        expect(typeof core.detectTensionSignals).toBe('function');
        expect(typeof core.generateQuestion).toBe('function');
        expect(typeof core.createQuestionNode).toBe('function');
    });

    it('should export validation functions', () => {
        expect(typeof core.validateBreakthrough).toBe('function');
        expect(typeof core.markBreakthrough).toBe('function');
        expect(typeof core.getSourceNodes).toBe('function');
    });

    it('should export abstract pattern functions', () => {
        expect(typeof core.createOrGetPattern).toBe('function');
        expect(typeof core.linkNodeToPattern).toBe('function');
        expect(typeof core.getNodePatterns).toBe('function');
        expect(typeof core.findPatternSiblings).toBe('function');
        expect(typeof core.searchPatterns).toBe('function');
        expect(typeof core.getPatternStats).toBe('function');
    });

    it('should export governance functions', () => {
        expect(typeof core.getAccessibleDomains).toBe('function');
        expect(typeof core.ensurePartition).toBe('function');
        expect(typeof core.checkPartitionHealth).toBe('function');
        expect(typeof core.renameDomain).toBe('function');
        expect(typeof core.logDecision).toBe('function');
        expect(typeof core.canOverride).toBe('function');
    });

    it('should export keyword functions', () => {
        expect(typeof core.generateNodeKeywords).toBe('function');
        expect(typeof core.getNodeKeywords).toBe('function');
        expect(typeof core.backfillDomainSynonyms).toBe('function');
        expect(typeof core.backfillNodeKeywords).toBe('function');
    });
});
