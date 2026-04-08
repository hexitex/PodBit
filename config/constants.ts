/**
 * @module config/constants
 *
 * Typed loader for podbit.config.json — the single source of truth for
 * operational constants (timeouts, limits, thresholds, DB pragmas, etc.).
 *
 * Reads the JSON once at import time and exports a frozen, typed object.
 * All values are accessible via `import { RC } from './config/constants.js'`.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types — mirrors the JSON structure
// ---------------------------------------------------------------------------

export interface DbPragmas {
    busyTimeoutMs: number;
    cacheSizeKb: number;
    mmapSizeBytes: number;
}

export interface PodbitConstants {
    timeouts: {
        evmVerificationMs: number;
        healthCheckMs: number;
        startupGraceMs: number;
        restartCooldownMs: number;
        sseHeartbeatMs: number;
        epipeExitDelayMs: number;
        watcherRestartBackoffMs: number;
        queuePollingMs: number;
        serviceTimeoutMs: number;
    };
    retries: {
        backoffBaseMs: number;
        backoffCapMs: number;
        evmBackoffBaseMs: number;
        evmBackoffCapMs: number;
        rateLimitBackoffMs: number;
    };
    intervals: {
        rateLimiterCleanupMs: number;
        budgetMonitorMs: number;
        costsCacheTtlMs: number;
    };
    contentLimits: {
        maxEmbeddingChars: number;
        summaryMinSearchOffset: number;
        summaryMaxSearchOffset: number;
        embeddingTruncationChars: number;
        specificityTruncationChars: number;
        keywordContentChars: number;
        knowThyselfTruncationChars: number;
        kbDefaultChunkSize: number;
        kbCurationTokens: number;
        sandboxOutputPreviewChars: number;
        eliteOutputTruncationChars: number;
        eliteCodeTruncationChars: number;
        toolResultCharLimit: number;
        expressBodySizeLimit: string;
        contentPreviewLength: number;
        maxNodeWords: number;
        stderrPreviewChars: number;
    };
    queryLimits: {
        voicingCandidates: number;
        researchContextLimit: number;
        knowledgeQueryLimit: number;
        knowledgeAltQueryLimit: number;
        knowledgeContextLimit: number;
        maxKeywordsToExtract: number;
        eliteScanBatchSize: number;
        eliteBridgingCandidates: number;
        eliteQueryDefaultLimit: number;
        patternSearchLimit: number;
        patternSiblingLimit: number;
        junkFilterPoolSize: number;
        triageParentLimit: number;
    };
    evm: {
        confidence: {
            runtimeError: number;
            vacuousPassThreshold: number;
            vacuousPassScore: number;
            fallbackThreshold: number;
            structuredMinConfidence: number;
            malformedOutputThreshold: number;
            booleanTrueConfidence: number;
            booleanFalseConfidence: number;
            booleanTrueScore: number;
            booleanFalseScore: number;
            unparseableConfidence: number;
            numericalFailConfidence: number;
            convergenceFailConfidence: number;
            convergenceThresholdRatio: number;
            convergenceNotConvergingConfidence: number;
            patternMatchConfidence: number;
            patternNoMatchConfidence: number;
            patternMatchScore: number;
            patternNoMatchScore: number;
            patternFallbackConfidence: number;
            defaultTriageConfidence: number;
            triageDisabledConfidence: number;
            minTriageScore: number;
        };
    };
    database: {
        systemDb: DbPragmas;
        projectDb: DbPragmas;
        readDb: DbPragmas;
        stmtCacheMax: number;
    };
    scoring: {
        goldStandardTierWeights: { tier1: number; tier2: number; tier3: number };
        goldStandardFallbackWeight: number;
        behavioralWeights: { synthesisSuccessRate: number; avgResonance: number; avgSpecificity: number };
        behavioralNormalization: { synthesisSuccessRate: number; avgResonance: number; avgSpecificity: number };
        convergenceRatio: number;
        minImpact: number;
        environmentChangeThreshold: number;
    };
    validation: {
        knowledgeReserveDefault: number;
        knowledgeMinReserveDefault: number;
        knowledgeReserveMin: number;
        knowledgeReserveMax: number;
        knowledgeMinReserveMin: number;
        knowledgeMinReserveMax: number;
        numericalTolerance: number;
    };
    misc: {
        imageMaxDimension: number;
        imageQuality: number;
        imageFormat: string;
        keywordTemperature: number;
        junkAgeCutoffDays: number;
        hashTruncationLength: number;
        domainSlugWords: number;
        logRateLimitWindowMs: number;
        logRateLimitMaxRepeats: number;
        nodeReselectionCooldownMinutes: number;
        eliteBridgePriorityBonus: number;
        attractorThreshold: number;
    };
}

// ---------------------------------------------------------------------------
// Loader — read once, freeze, export
// ---------------------------------------------------------------------------

const _constDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(_constDir, '..', 'podbit.config.json');

function load(): PodbitConstants {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Strip $schema key — not part of the runtime config
    delete parsed.$schema;
    return parsed as PodbitConstants;
}

/**
 * **RC** — Resonance Constants.
 *
 * Frozen singleton loaded from `podbit.config.json` at import time.
 * Usage: `import { RC } from './config/constants.js';`
 *
 * @example
 * RC.timeouts.evmVerificationMs   // 270000
 * RC.database.projectDb.cacheSizeKb // 64000
 * RC.evm.confidence.booleanTrueConfidence // 0.8
 */
export const RC: PodbitConstants = Object.freeze(load());
