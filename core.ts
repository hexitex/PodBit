/**
 * PODBIT v0.5 - CORE ENGINE
 *
 * Barrel re-export — all implementations live in core/ sub-modules.
 * All consumers continue importing from this file unchanged.
 */

// Re-export database access from db.js
export { pool, query, queryOne, systemQuery, systemQueryOne } from './db.js';

// Re-export embedding helper from models.js
export { getEmbedding } from './models.js';

// Engine configuration
export { config } from './core/engine-config.js';

// Specificity measurement
export { measureSpecificity, addLearnedTerms, loadLearnedTerms, getLearnedTermsCount } from './core/specificity.js';

// Podbit scoring & embedding utilities
export {
    scoreResonance,
    cosineSimilarity,
    dotProduct,
    parseEmbedding,
    l2Normalize,
    embeddingToBuffer,
    bufferToEmbedding,
    detectInjection,
    checkDomainConcentration,
} from './core/scoring.js';

// Voicing
export { voice } from './core/voicing.js';

// Node operations
export {
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
} from './core/node-ops.js';

// Synthesis engine
export {
    synthesisCycle,
    domainDirectedCycle,
    runSynthesisEngine,
    stopSynthesisEngine,
    getSynthesisStatus,
    discoverResonance,
    getDiscoveries,
    clearDiscovery,
    cycleStates,
    getCycleStatus,
    getAllCycleStatuses,
    stopCycle,
    runCycleLoop,
} from './core/synthesis-engine.js';

// Autonomous cycles
export {
    startValidationCycle,
    startQuestionCycle,
    startTensionCycle,
    startResearchCycle,
    startAutoratingCycle,
    startEvmCycle,
    startVoicingCycle,
    startGroundRulesCycle,
    startPopulationControlCycle,
} from './core/autonomous-cycles.js';

// Pending requests queue (MCP mode)
export {
    queueRequest,
    getPendingRequests,
    completeRequest,
    cleanupRequests,
} from './core/pending.js';

// Tension detection
export {
    findTensions,
    detectTensionSignals,
    generateQuestion,
    createQuestionNode,
} from './core/tensions.js';

// Breakthrough validation
export {
    validateBreakthrough,
    markBreakthrough,
    getSourceNodes,
} from './core/validation.js';

// Abstract pattern indexing
export {
    createOrGetPattern,
    linkNodeToPattern,
    getNodePatterns,
    findPatternSiblings,
    searchPatterns,
    getPatternStats,
} from './core/abstract-patterns.js';

// Partition enforcement + auto-partition
export {
    getAccessibleDomains,
    ensurePartition,
    checkPartitionHealth,
    renameDomain,
} from './core/governance.js';

// Tier provenance
export {
    logDecision,
    canOverride,
} from './core/governance.js';

// Keyword extraction
export {
    generateNodeKeywords,
    getNodeKeywords,
    backfillDomainSynonyms,
    backfillNodeKeywords,
} from './core/keywords.js';

// =============================================================================
// CLI
// =============================================================================

if (process.argv[1]?.endsWith('core.js')) {
    const { runSynthesisEngine: run } = await import('./core/synthesis-engine.js');
    const domain = process.argv[2] || null;
    const maxCycles = parseInt(process.argv[3], 10) || Infinity;

    run({ domain, maxCycles })
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
