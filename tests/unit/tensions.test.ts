/**
 * Unit tests for core/tensions.ts — detectTensionSignals.
 *
 * detectTensionSignals is pure text analysis (reads config for patterns).
 * findTensions, generateQuestion, createQuestionNode are async/DB and tested via integration.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
  config: { services: { llm: { endpoint: null } }, proxy: {} },
  appConfig: {},
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
  config: {
    tensions: {
      patterns: [
        ['increase', 'decrease'],
        ['enable', 'prevent'],
        ['simple', 'complex'],
        ['fast', 'slow'],
      ],
      negationBoost: 1,
      minSimilarity: 0.3,
      candidateLimit: 50,
    },
  },
}));

jest.unstable_mockModule('../../models.js', () => ({
  callSubsystemModel: jest.fn(),
  getAssignedModel: jest.fn(),
}));

jest.unstable_mockModule('../../prompts.js', () => ({
  getPrompt: jest.fn(),
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
  getProjectContextBlock: jest.fn(async () => ''),
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
  parseEmbedding: jest.fn(),
  cosineSimilarity: jest.fn(),
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
  getAccessibleDomains: jest.fn(),
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
  createNode: jest.fn(),
  createEdge: jest.fn(),
}));

const { detectTensionSignals } = await import('../../core/tensions.js');

describe('detectTensionSignals', () => {
  it('detects opposing patterns (increase/decrease)', () => {
    const result = detectTensionSignals(
      'This will increase efficiency.',
      'This will decrease efficiency.'
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('increase/decrease');
  });

  it('detects enable/prevent pattern', () => {
    const result = detectTensionSignals(
      'The feature will enable real-time processing.',
      'The feature will prevent real-time processing.'
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('enable/prevent');
  });

  it('detects patterns in reverse order', () => {
    const result = detectTensionSignals(
      'The system is simple to use.',
      'The system is complex to configure.'
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('simple/complex');
  });

  it('detects negation asymmetry', () => {
    const result = detectTensionSignals(
      'The approach is not effective.',
      'The approach is effective.'
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toContain('negation');
  });

  it("detects n't negation", () => {
    const result = detectTensionSignals(
      "This doesn't work well.",
      'This works well.'
    );
    expect(result.signals).toContain('negation');
  });

  it('returns zero score for non-contradictory texts', () => {
    const result = detectTensionSignals(
      'The weather is nice today.',
      'I like programming in TypeScript.'
    );
    expect(result.score).toBe(0);
    expect(result.signals.length).toBe(0);
  });

  it('accumulates multiple tension signals', () => {
    const result = detectTensionSignals(
      'This is fast and simple.',
      'This is slow and complex.'
    );
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  it('is case-insensitive', () => {
    const result = detectTensionSignals(
      'INCREASE the budget.',
      'DECREASE the budget.'
    );
    expect(result.score).toBeGreaterThan(0);
  });
});
