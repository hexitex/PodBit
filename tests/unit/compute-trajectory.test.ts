/**
 * Tests for core/synthesis-engine.ts — computeTrajectoryAndWeight (re-implemented).
 * Trajectory = knowledge when childSpecificity >= avgParentSpecificity * ratio else abstraction;
 * optional fitness scaling when withFitness=true.
 */
import { describe, it, expect } from '@jest/globals';

const CFG = {
    specificityRatio: 0.9,
    knowledgeWeight: 1.0,
    abstractionWeight: 0.1,
    fitnessEnabled: true,
    fitnessWeights: { dissimilarity: 0.4, novelty: 0.35, specificity: 0.25 },
    fitnessRange: { min: 0.3, max: 1.2 },
    similarityCeiling: 0.92,
    resonanceThreshold: 0.35,
};

/** Returns trajectory ('knowledge'|'abstraction'), childWeight, and optional fitnessScore. */
function computeTrajectoryAndWeight(params: { childSpecificity: number; avgParentSpecificity: number; resonance?: number; dupBestSimilarity?: number; withFitness?: boolean }) {
    const {
        childSpecificity, avgParentSpecificity,
        resonance = 0, dupBestSimilarity = 0,
        withFitness = false,
    } = params;

    const trajectory = childSpecificity >= (avgParentSpecificity * CFG.specificityRatio)
        ? 'knowledge' : 'abstraction';
    let childWeight = trajectory === 'knowledge' ? CFG.knowledgeWeight : CFG.abstractionWeight;

    let fitnessScore;
    if (withFitness && CFG.fitnessEnabled) {
        const ceiling = CFG.similarityCeiling;
        const threshold = CFG.resonanceThreshold;
        const fw = CFG.fitnessWeights;
        const fr = CFG.fitnessRange;

        const dissimilarityScore = Math.max(0, Math.min(1, 1 - ((resonance - threshold) / (ceiling - threshold))));
        const noveltyScore = 1 - dupBestSimilarity;
        const specificityEnrichment = Math.min(1, Math.max(0, (childSpecificity / Math.max(avgParentSpecificity, 1))) / 2);
        const composite = (fw.dissimilarity * dissimilarityScore) + (fw.novelty * noveltyScore) + (fw.specificity * specificityEnrichment);
        fitnessScore = fr.min + (composite * (fr.max - fr.min));
        childWeight = childWeight * fitnessScore;
    }

    return { trajectory, childWeight, fitnessScore };
}

describe('computeTrajectoryAndWeight — trajectory determination', () => {
    it('returns knowledge when child specificity >= parent * ratio', () => {
        const { trajectory } = computeTrajectoryAndWeight({ childSpecificity: 9.0, avgParentSpecificity: 10.0 });
        // 9.0 >= 10.0 * 0.9 = 9.0 → exactly at boundary → knowledge
        expect(trajectory).toBe('knowledge');
    });

    it('returns abstraction when child specificity is below parent * ratio', () => {
        const { trajectory } = computeTrajectoryAndWeight({ childSpecificity: 5.0, avgParentSpecificity: 10.0 });
        // 5.0 < 9.0 → abstraction
        expect(trajectory).toBe('abstraction');
    });

    it('returns knowledge when child exceeds parent', () => {
        const { trajectory } = computeTrajectoryAndWeight({ childSpecificity: 12.0, avgParentSpecificity: 10.0 });
        expect(trajectory).toBe('knowledge');
    });

    it('returns abstraction for zero child specificity', () => {
        const { trajectory } = computeTrajectoryAndWeight({ childSpecificity: 0, avgParentSpecificity: 5.0 });
        expect(trajectory).toBe('abstraction');
    });

    it('returns knowledge when both are zero (0 >= 0)', () => {
        const { trajectory } = computeTrajectoryAndWeight({ childSpecificity: 0, avgParentSpecificity: 0 });
        // 0 >= 0 * 0.9 = 0 → true → knowledge
        expect(trajectory).toBe('knowledge');
    });
});

describe('computeTrajectoryAndWeight — base weight assignment', () => {
    it('assigns knowledgeWeight (1.0) for knowledge trajectory', () => {
        const { childWeight } = computeTrajectoryAndWeight({ childSpecificity: 10, avgParentSpecificity: 10 });
        expect(childWeight).toBe(1.0);
    });

    it('assigns abstractionWeight (0.1) for abstraction trajectory', () => {
        const { childWeight } = computeTrajectoryAndWeight({ childSpecificity: 1, avgParentSpecificity: 10 });
        expect(childWeight).toBe(0.1);
    });

    it('does not compute fitnessScore when withFitness is false', () => {
        const { fitnessScore } = computeTrajectoryAndWeight({ childSpecificity: 5, avgParentSpecificity: 5 });
        expect(fitnessScore).toBeUndefined();
    });
});

describe('computeTrajectoryAndWeight — fitness scoring', () => {
    it('computes fitnessScore when withFitness is true', () => {
        const { fitnessScore } = computeTrajectoryAndWeight({
            childSpecificity: 5, avgParentSpecificity: 5,
            resonance: 0.5, dupBestSimilarity: 0.1,
            withFitness: true,
        });
        expect(typeof fitnessScore).toBe('number');
        expect(fitnessScore).toBeGreaterThanOrEqual(CFG.fitnessRange.min);
        expect(fitnessScore).toBeLessThanOrEqual(CFG.fitnessRange.max);
    });

    it('fitness score is within range [0.3, 1.2]', () => {
        for (const resonance of [0.35, 0.5, 0.7, 0.9]) {
            const { fitnessScore } = computeTrajectoryAndWeight({
                childSpecificity: 5, avgParentSpecificity: 5,
                resonance, dupBestSimilarity: 0,
                withFitness: true,
            });
            expect(fitnessScore).toBeGreaterThanOrEqual(0.3);
            expect(fitnessScore).toBeLessThanOrEqual(1.2);
        }
    });

    it('fitness adjusts childWeight (weight = baseWeight * fitness)', () => {
        const { childWeight, fitnessScore } = computeTrajectoryAndWeight({
            childSpecificity: 10, avgParentSpecificity: 10,
            resonance: 0.5, dupBestSimilarity: 0,
            withFitness: true,
        });
        // trajectory = knowledge, base weight = 1.0
        // childWeight should equal fitnessScore (1.0 * fitnessScore)
        expect(childWeight).toBeCloseTo(1.0 * fitnessScore!, 5);
    });

    it('higher novelty (lower dupBestSimilarity) increases fitness', () => {
        const params = { childSpecificity: 5, avgParentSpecificity: 5, resonance: 0.5, withFitness: true };
        const highNovelty = computeTrajectoryAndWeight({ ...params, dupBestSimilarity: 0.0 });
        const lowNovelty  = computeTrajectoryAndWeight({ ...params, dupBestSimilarity: 0.9 });
        expect(highNovelty.fitnessScore!).toBeGreaterThan(lowNovelty.fitnessScore!);
    });

    it('lower resonance (more dissimilar) increases fitness', () => {
        const params = { childSpecificity: 5, avgParentSpecificity: 5, dupBestSimilarity: 0, withFitness: true };
        const lowResonance  = computeTrajectoryAndWeight({ ...params, resonance: 0.35 });
        const highResonance = computeTrajectoryAndWeight({ ...params, resonance: 0.85 });
        expect(lowResonance.fitnessScore!).toBeGreaterThan(highResonance.fitnessScore!);
    });
});
