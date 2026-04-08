/**
 * Unit tests for core/specificity.ts — content concreteness scoring.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../core/engine-config.js', () => ({
  config: {
    specificity: {
      numberWeight: 1.0,
      techTermWeight: 2.0,
      concreteNounWeight: 0.5,
      unitWeight: 1.5,
      maxLearnedTermsPerDomain: 500,
      unitPattern: '\\b(Hz|MHz|GHz|km|cm|mm|kg|mg|mol|eV|nm|dB|kW|MW|Pa|psi|rpm|fps|ms|us|ns)\\b',
      technicalTerms: {
        software: ['algorithm', 'latency', 'throughput', 'cache', 'mutex'],
        biology: ['enzyme', 'mitosis', 'protein', 'genome', 'phenotype'],
      },
    },
  },
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn().mockResolvedValue([]),
}));

const { measureSpecificity, addLearnedTerms, loadLearnedTerms, getLearnedTermsCount } = await import('../../core/specificity.js');

describe('measureSpecificity', () => {
  it('scores zero for vague content', () => {
    const score = measureSpecificity('Things are interesting and complex');
    expect(score).toBe(0);
  });

  it('scores higher for content with numbers', () => {
    const vague = measureSpecificity('The rate is high');
    const specific = measureSpecificity('The rate is 42.5%');
    expect(specific).toBeGreaterThan(vague);
  });

  it('scores higher for content with technical terms', () => {
    const vague = measureSpecificity('The system is fast');
    const specific = measureSpecificity('The algorithm reduces latency');
    expect(specific).toBeGreaterThan(vague);
  });

  it('scores higher for content with units', () => {
    const vague = measureSpecificity('The frequency is high');
    const specific = measureSpecificity('The frequency is 2.4 GHz');
    expect(specific).toBeGreaterThan(vague);
  });

  it('uses domain-specific terms when domain provided', () => {
    // "enzyme" is a biology term, not software
    const bioScore = measureSpecificity('The enzyme reaction rate', 'biology');
    const softScore = measureSpecificity('The enzyme reaction rate', 'software');
    // With biology domain, "enzyme" should be recognized; with software, it should not
    expect(bioScore).toBeGreaterThan(softScore);
  });

  it('uses all domain terms when no domain specified', () => {
    // Without domain filter, "enzyme" and "algorithm" should both be recognized
    const score = measureSpecificity('The enzyme algorithm produces results');
    expect(score).toBeGreaterThan(0);
  });

  it('accumulates multiple signals', () => {
    const single = measureSpecificity('The algorithm works');
    const multi = measureSpecificity('The algorithm processes 100 samples at 5 MHz throughput');
    expect(multi).toBeGreaterThan(single);
  });

  it('detects mid-sentence proper nouns', () => {
    // "Hebbian" appears mid-sentence after lowercase text
    const score = measureSpecificity('the process uses Hebbian learning rules');
    expect(score).toBeGreaterThan(0);
  });

  it('does not count common words as concrete nouns', () => {
    const score = measureSpecificity('things are However interesting and Therefore complex');
    expect(score).toBe(0);
  });
});

describe('addLearnedTerms', () => {
  it('adds terms that boost future specificity scores', () => {
    const before = measureSpecificity('dendritic compartments enable local computation', 'neuroscience');
    addLearnedTerms('neuroscience', ['dendritic', 'compartments']);
    const after = measureSpecificity('dendritic compartments enable local computation', 'neuroscience');
    expect(after).toBeGreaterThan(before);
  });

  it('deduplicates against config terms', () => {
    const countBefore = getLearnedTermsCount();
    addLearnedTerms('software', ['algorithm', 'latency']); // already in config
    const countAfter = getLearnedTermsCount();
    expect(countAfter.byDomain['software'] || 0).toBe(countBefore.byDomain['software'] || 0);
  });

  it('creates new domain entries for unknown domains', () => {
    addLearnedTerms('neuroscience', ['synaptic', 'NMDAR', 'eligibility trace']);
    const counts = getLearnedTermsCount();
    expect(counts.byDomain['neuroscience']).toBeGreaterThanOrEqual(3);
  });

  it('respects maxLearnedTermsPerDomain cap', () => {
    const hugeBatch = Array.from({ length: 600 }, (_, i) => `term_${i}`);
    addLearnedTerms('test-cap-domain', hugeBatch);
    const counts = getLearnedTermsCount();
    expect(counts.byDomain['test-cap-domain']).toBeLessThanOrEqual(500);
  });
});

describe('loadLearnedTerms', () => {
  it('loads terms from DB without throwing', async () => {
    await expect(loadLearnedTerms()).resolves.not.toThrow();
  });
});
