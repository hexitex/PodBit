/**
 * Unit tests for models/providers.ts — exported helper functions.
 *
 * Tests extractTextContent and getUnsupportedParams.
 * Internal helpers (stripThinkBlocks, applyThinkingLevel, etc.) are not
 * exported and tested indirectly through integration tests.
 */
import { jest, describe, it, expect } from '@jest/globals';

// Mock all heavy dependencies
jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
  config: {
    services: { llm: { endpoint: null } },
    proxy: {},
  },
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
  getAssignedModel: jest.fn(),
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
  getApiKey: jest.fn(),
}));

jest.unstable_mockModule('../../models/cost.js', () => ({
  logUsage: jest.fn(),
  applyReasoningBonus: jest.fn((_, t: number) => t),
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
  acquireModelSlot: jest.fn(async () => () => {}),
  reportRateLimit: jest.fn(),
}));

jest.unstable_mockModule('../../models/health.js', () => ({
  checkModelHealth: jest.fn(),
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
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

const { extractTextContent, getUnsupportedParams } = await import('../../models/providers.js');

// ---------- extractTextContent ----------

describe('extractTextContent', () => {
  it('returns empty string for null/undefined', () => {
    expect(extractTextContent(null)).toBe('');
    expect(extractTextContent(undefined)).toBe('');
    expect(extractTextContent('')).toBe('');
  });

  it('returns string content as-is', () => {
    expect(extractTextContent('hello world')).toBe('hello world');
  });

  it('extracts text from OpenAI content array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextContent(content)).toBe('Hello World');
  });

  it('filters non-text parts from content array', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'image_url', image_url: { url: 'data:...' } },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextContent(content)).toBe('Hello World');
  });

  it('handles empty array', () => {
    expect(extractTextContent([])).toBe('');
  });

  it('stringifies other types', () => {
    expect(extractTextContent(42)).toBe('42');
    expect(extractTextContent(true)).toBe('true');
  });

  it('handles array with no text parts', () => {
    const content = [{ type: 'image_url', image_url: {} }];
    expect(extractTextContent(content)).toBe('');
  });
});

// ---------- getUnsupportedParams ----------

describe('getUnsupportedParams', () => {
  it('returns empty set for unknown endpoints', () => {
    const result = getUnsupportedParams('http://localhost:1234/v1');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('returns empty set for invalid URLs', () => {
    const result = getUnsupportedParams('not-a-url');
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
