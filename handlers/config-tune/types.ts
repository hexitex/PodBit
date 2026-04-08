/**
 * Config tuning — types, constants, and shared module state.
 */
import { RC } from '../../config/constants.js';

// =============================================================================
// BEHAVIORAL ENTROPY — Types & Constants
// =============================================================================

export interface BehavioralAnalysis {
    configPath: string;
    classification: 'oscillation' | 'convergence' | 'insufficient_data';
    valueProfiles: Array<{
        value: string;
        occurrences: number;
        avgImpact: number;
        rawDeltas: {
            synthesisSuccessRate: number | null;
            avgResonance: number | null;
            avgSpecificity: number | null;
        };
    }>;
    impactRatio: number;
    bestValue: string;
    entropyScore: number;
}

export interface BehavioralEntropyResult {
    genuineOscillation: string[];
    convergingParameters: Array<{
        configPath: string;
        bestValue: string;
        impactRatio: number;
        recommendation: string;
    }>;
    analyses: BehavioralAnalysis[];
}

export const BEHAVIORAL_WEIGHTS = {
    synthesisSuccessRate: RC.scoring.behavioralWeights.synthesisSuccessRate,
    avgResonance: RC.scoring.behavioralWeights.avgResonance,
    avgSpecificity: RC.scoring.behavioralWeights.avgSpecificity,
};

export const BEHAVIORAL_NORMALIZATION = {
    synthesisSuccessRate: RC.scoring.behavioralNormalization.synthesisSuccessRate,
    avgResonance: RC.scoring.behavioralNormalization.avgResonance,
    avgSpecificity: RC.scoring.behavioralNormalization.avgSpecificity,
};

export const CONVERGENCE_RATIO = RC.scoring.convergenceRatio;
export const MIN_IMPACT = RC.scoring.minImpact;

// Environment change detection — used to distinguish adaptive tuning from oscillation
export const ENVIRONMENT_CHANGE_THRESHOLD = RC.scoring.environmentChangeThreshold; // Score above this → environment changed enough to mitigate oscillation

export interface EnvironmentChangeResult {
    environmentChanged: boolean;
    changeScore: number;  // 0-1, weighted composite of all signals
    signals: string[];    // Human-readable descriptions of what changed
    modelChanges: number;
    graphGrowthPct: number;   // percentage growth in active nodes
    kbIngestions: number;
    snapshotRestores: number;
    newDomains: number;
}

export interface TuningSeedOptions {
    content: string;
    nodeType?: 'seed' | 'synthesis' | 'question';
    salience?: number;
    contributor?: string;
    parentIds?: string[];
}

// =============================================================================
// SHARED MUTABLE STATE
// =============================================================================

export const state = {
    knowThyselfInitialized: false,
    lastOverfittingHash: null as string | null,
    pendingMetricsFollow: null as { seedId: string; timestamp: number } | null,
};
