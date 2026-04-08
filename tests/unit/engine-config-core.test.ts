/**
 * Unit tests for core/engine-config.ts — covers all live getters.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mutable backing config — mutate this between tests to exercise getters
// ---------------------------------------------------------------------------
const mockAppConfig: Record<string, any> = {
    engine: {
        threshold: 0.35,
        salienceBoost: 0.1,
        salienceDecay: 0.05,
        salienceCeiling: 1.0,
        salienceFloor: 0.0,
        weightDecay: 0.02,
        parentBoost: 0.15,
        weightCeiling: 1.0,
        cycleDelayMs: 5000,
        decayEveryNCycles: 10,
    },
    specificity: { minScore: 0.3, maxScore: 1.0 },
    nodes: { maxWords: 200 },
    voicing: { maxOutputWords: 50 },
    synthesisEngine: { maxRetries: 3 },
    hallucination: { enabled: true },
    tensions: { limit: 10 },
    validation: { enabled: true },
    embeddingCache: { maxSize: 1000 },
    numberVariables: { enabled: false },
    elitePool: { enabled: false },
    consultantPipeline: { enabled: false },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

const { config, appConfig } = await import('../../core/engine-config.js');

beforeEach(() => {
    jest.clearAllMocks();
    // Reset engine values to defaults
    mockAppConfig.engine.threshold = 0.35;
    mockAppConfig.engine.salienceBoost = 0.1;
    mockAppConfig.engine.salienceDecay = 0.05;
    mockAppConfig.engine.salienceCeiling = 1.0;
    mockAppConfig.engine.salienceFloor = 0.0;
    mockAppConfig.engine.weightDecay = 0.02;
    mockAppConfig.engine.parentBoost = 0.15;
    mockAppConfig.engine.weightCeiling = 1.0;
    mockAppConfig.engine.cycleDelayMs = 5000;
    mockAppConfig.engine.decayEveryNCycles = 10;
});

// =============================================================================
// Exports
// =============================================================================

describe('engine-config exports', () => {
    it('exports config and appConfig', () => {
        expect(config).toBeDefined();
        expect(appConfig).toBeDefined();
    });

    it('appConfig is the same object as the mock', () => {
        expect(appConfig).toBe(mockAppConfig);
    });
});

// =============================================================================
// Scalar getters — engine.*
// =============================================================================

describe('scalar engine getters', () => {
    it('resonanceThreshold reads from appConfig.engine.threshold', () => {
        expect(config.resonanceThreshold).toBe(0.35);
        mockAppConfig.engine.threshold = 0.55;
        expect(config.resonanceThreshold).toBe(0.55);
    });

    it('salienceBoost reads live', () => {
        expect(config.salienceBoost).toBe(0.1);
        mockAppConfig.engine.salienceBoost = 0.2;
        expect(config.salienceBoost).toBe(0.2);
    });

    it('salienceDecay reads live', () => {
        expect(config.salienceDecay).toBe(0.05);
        mockAppConfig.engine.salienceDecay = 0.1;
        expect(config.salienceDecay).toBe(0.1);
    });

    it('salienceCeiling reads live', () => {
        expect(config.salienceCeiling).toBe(1.0);
        mockAppConfig.engine.salienceCeiling = 0.9;
        expect(config.salienceCeiling).toBe(0.9);
    });

    it('salienceFloor reads live', () => {
        expect(config.salienceFloor).toBe(0.0);
        mockAppConfig.engine.salienceFloor = 0.1;
        expect(config.salienceFloor).toBe(0.1);
    });

    it('weightDecay reads live', () => {
        expect(config.weightDecay).toBe(0.02);
        mockAppConfig.engine.weightDecay = 0.03;
        expect(config.weightDecay).toBe(0.03);
    });

    it('parentBoost reads live', () => {
        expect(config.parentBoost).toBe(0.15);
        mockAppConfig.engine.parentBoost = 0.25;
        expect(config.parentBoost).toBe(0.25);
    });

    it('weightCeiling reads live', () => {
        expect(config.weightCeiling).toBe(1.0);
        mockAppConfig.engine.weightCeiling = 0.8;
        expect(config.weightCeiling).toBe(0.8);
    });

    it('cycleDelayMs reads live', () => {
        expect(config.cycleDelayMs).toBe(5000);
        mockAppConfig.engine.cycleDelayMs = 10000;
        expect(config.cycleDelayMs).toBe(10000);
    });

    it('decayEveryNCycles reads live', () => {
        expect(config.decayEveryNCycles).toBe(10);
        mockAppConfig.engine.decayEveryNCycles = 20;
        expect(config.decayEveryNCycles).toBe(20);
    });
});

// =============================================================================
// Object section getters
// =============================================================================

describe('object section getters', () => {
    it('specificity returns appConfig.specificity', () => {
        expect(config.specificity).toBe(mockAppConfig.specificity);
    });

    it('nodes returns appConfig.nodes', () => {
        expect(config.nodes).toBe(mockAppConfig.nodes);
    });

    it('voicing returns appConfig.voicing', () => {
        expect(config.voicing).toBe(mockAppConfig.voicing);
    });

    it('synthesisEngine returns appConfig.synthesisEngine', () => {
        expect(config.synthesisEngine).toBe(mockAppConfig.synthesisEngine);
    });

    it('hallucination returns appConfig.hallucination', () => {
        expect(config.hallucination).toBe(mockAppConfig.hallucination);
    });

    it('tensions returns appConfig.tensions', () => {
        expect(config.tensions).toBe(mockAppConfig.tensions);
    });

    it('validation returns appConfig.validation', () => {
        expect(config.validation).toBe(mockAppConfig.validation);
    });

    it('embeddingCache returns appConfig.embeddingCache', () => {
        expect(config.embeddingCache).toBe(mockAppConfig.embeddingCache);
    });

    it('numberVariables returns appConfig.numberVariables', () => {
        expect(config.numberVariables).toBe(mockAppConfig.numberVariables);
    });

    it('elitePool returns appConfig.elitePool', () => {
        expect(config.elitePool).toBe(mockAppConfig.elitePool);
    });

    it('consultantPipeline returns appConfig.consultantPipeline', () => {
        expect(config.consultantPipeline).toBe(mockAppConfig.consultantPipeline);
    });

    it('object getters reflect replacement of the whole section', () => {
        const newVoicing = { maxOutputWords: 100 };
        mockAppConfig.voicing = newVoicing;
        expect(config.voicing).toBe(newVoicing);
    });
});

