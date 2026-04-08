/**
 * Unit tests for core/engine-config.ts — live getter config re-export.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mutable config object — getters read from this
// ---------------------------------------------------------------------------
const mockAppConfig = {
    engine: {
        threshold: 0.55,
        salienceBoost: 0.1,
        salienceDecay: 0.05,
        salienceCeiling: 1.0,
        salienceFloor: 0.0,
        weightDecay: 0.01,
        parentBoost: 0.2,
        weightCeiling: 10.0,
        cycleDelayMs: 5000,
        decayEveryNCycles: 10,
    },
    specificity: { minWords: 5 },
    nodes: { maxContentLength: 5000 },
    voicing: { maxOutputWords: 30 },
    synthesisEngine: {},
    hallucination: { enabled: true },
    tensions: { enabled: true },
    validation: { enabled: true },
    embeddingCache: { maxSize: 1000 },
    numberVariables: { enabled: true },
    elitePool: { maxGeneration: 5 },
    consultantPipeline: { enabled: false },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

const { config } = await import('../../core/engine-config.js');

beforeEach(() => {
    // Reset to baseline values
    mockAppConfig.engine.threshold = 0.55;
});

// =============================================================================
// Live getter — resonanceThreshold
// =============================================================================

describe('config live getters', () => {
    it('resonanceThreshold reflects current appConfig value', () => {
        mockAppConfig.engine.threshold = 0.72;
        expect(config.resonanceThreshold).toBe(0.72);
    });

    it('resonanceThreshold updates when appConfig changes', () => {
        mockAppConfig.engine.threshold = 0.35;
        expect(config.resonanceThreshold).toBe(0.35);
        mockAppConfig.engine.threshold = 0.90;
        expect(config.resonanceThreshold).toBe(0.90);
    });

    it('salienceBoost reflects current value', () => {
        mockAppConfig.engine.salienceBoost = 0.25;
        expect(config.salienceBoost).toBe(0.25);
    });

    it('salienceDecay reflects current value', () => {
        mockAppConfig.engine.salienceDecay = 0.08;
        expect(config.salienceDecay).toBe(0.08);
    });

    it('weightDecay reflects current value', () => {
        mockAppConfig.engine.weightDecay = 0.03;
        expect(config.weightDecay).toBe(0.03);
    });

    it('cycleDelayMs reflects current value', () => {
        mockAppConfig.engine.cycleDelayMs = 10000;
        expect(config.cycleDelayMs).toBe(10000);
    });

    it('specificity returns full object', () => {
        expect(config.specificity).toBe(mockAppConfig.specificity);
    });

    it('voicing returns full object', () => {
        expect(config.voicing).toBe(mockAppConfig.voicing);
    });

    it('elitePool returns full object', () => {
        expect(config.elitePool).toBe(mockAppConfig.elitePool);
    });
});

