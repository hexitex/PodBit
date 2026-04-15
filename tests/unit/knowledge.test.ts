/**
 * Unit tests for proxy/knowledge.ts — injectKnowledge.
 *
 * injectKnowledge is pure (message array manipulation).
 * ensureProxySettings is async/DB so not tested here.
 */
import { jest, describe, it, expect } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../../config.js', () => ({
  config: {
    proxy: { knowledgeReserve: 0.15, knowledgeMinReserve: 0.05 },
  },
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  systemQuery: jest.fn(),
  systemQueryOne: jest.fn(),
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
  getAssignedModel: jest.fn(),
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
  getApiKey: jest.fn(),
}));

jest.unstable_mockModule('../../models/cost.js', () => ({
  logUsage: jest.fn(),
  isReasoningModel: jest.fn().mockReturnValue(false),
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
  acquireModelSlot: jest.fn(async () => () => {}),
}));

jest.unstable_mockModule('../../models/health.js', () => ({
  checkModelHealth: jest.fn(),
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
  emitActivity: jest.fn(),
  eventBus: { emit: jest.fn() },
}));

jest.unstable_mockModule('../../models/types.js', () => ({
  resolveProviderEndpoint: jest.fn(),
  getModelProvider: jest.fn(),
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
  isBudgetExceeded: jest.fn(() => false),
}));

jest.unstable_mockModule('../../telegraphic.js', () => ({
  DEFAULT_ENTROPY_OPTIONS: {
    weights: {},
    thresholds: {},
    rarityMinLength: 8,
  },
}));

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
  createCachedLoader: jest.fn(() => ({ get: jest.fn(async () => ({})) })),
}));

const { injectKnowledge } = await import('../../proxy/knowledge.js');

describe('injectKnowledge', () => {
  const knowledge = 'Domain fact: water boils at 100°C.';

  it('prepends knowledge to existing system message', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    const result = injectKnowledge(messages, knowledge);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain(knowledge);
    expect(result[0].content).toContain('You are helpful.');
    // Knowledge comes first (prepended)
    expect(result[0].content.indexOf(knowledge)).toBeLessThan(
      result[0].content.indexOf('You are helpful.')
    );
  });

  it('creates system message if none exists', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = injectKnowledge(messages, knowledge);
    expect(result.length).toBe(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain(knowledge);
  });

  it('does not mutate original messages', () => {
    const messages = [
      { role: 'system', content: 'Original' },
      { role: 'user', content: 'Hi' },
    ];
    const original = JSON.stringify(messages);
    injectKnowledge(messages, knowledge);
    expect(JSON.stringify(messages)).toBe(original);
  });

  it('uses restrictive wrapper by default (no client tools)', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = injectKnowledge(messages, knowledge, false);
    expect(result[0].content).toContain('PRIORITY INSTRUCTION');
    expect(result[0].content).toContain('Do NOT use tools');
  });

  it('uses passive wrapper when client has tools', () => {
    const messages = [{ role: 'user', content: 'Hi' }];
    const result = injectKnowledge(messages, knowledge, true);
    expect(result[0].content).not.toContain('PRIORITY INSTRUCTION');
    expect(result[0].content).toContain('knowledge-context');
    expect(result[0].content).toContain('Use it alongside');
  });

  it('preserves non-system messages unchanged', () => {
    const messages = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
    ];
    const result = injectKnowledge(messages, knowledge);
    expect(result[1]).toEqual({ role: 'user', content: 'question' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'answer' });
  });
});
