/**
 * Unit tests for core/tool-calling.ts — estimateToolTokens and getToolDefinitions.
 * Token estimate from JSON length; tool defs structure and read-only vs read-write mode.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../services/event-bus.js', () => ({
  emitActivity: jest.fn(),
  eventBus: { emit: jest.fn() },
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  systemQuery: jest.fn(),
  systemQueryOne: jest.fn(),
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
  isReasoningModel: jest.fn().mockReturnValue(false),
}));

jest.unstable_mockModule('../../models/semaphore.js', () => ({
  acquireModelSlot: jest.fn(async () => () => {}),
  reportRateLimit: jest.fn(),
}));

jest.unstable_mockModule('../../models/health.js', () => ({
  checkModelHealth: jest.fn(),
}));

const { estimateToolTokens, getToolDefinitions } = await import('../../core/tool-calling.js');

describe('estimateToolTokens', () => {
  it('returns small value for empty tools array', () => {
    // JSON.stringify([]) = "[]" = 2 chars → ceil(2/3) = 1
    expect(estimateToolTokens([])).toBe(1);
  });

  it('estimates based on JSON length / 3', () => {
    const tools = [{
      type: 'function' as const,
      function: {
        name: 'test_tool',
        description: 'A test tool',
        parameters: { type: 'object' as const, properties: {} },
      },
    }];
    const jsonLen = JSON.stringify(tools).length;
    expect(estimateToolTokens(tools)).toBe(Math.ceil(jsonLen / 3));
  });

  it('scales with number of tools', () => {
    const oneTool = [{
      type: 'function' as const,
      function: { name: 'a', description: 'tool a', parameters: { type: 'object' as const, properties: {} } },
    }];
    const twoTools = [
      ...oneTool,
      { type: 'function' as const, function: { name: 'b', description: 'tool b', parameters: { type: 'object' as const, properties: {} } } },
    ];
    expect(estimateToolTokens(twoTools)).toBeGreaterThan(estimateToolTokens(oneTool));
  });
});

describe('getToolDefinitions', () => {
  it('returns an array of tool definitions', () => {
    const tools = getToolDefinitions('read-only');
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('each tool has required structure', () => {
    const tools = getToolDefinitions('read-only');
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it('read-write mode includes more tools', () => {
    const ro = getToolDefinitions('read-only');
    const rw = getToolDefinitions('read-write');
    expect(rw.length).toBeGreaterThanOrEqual(ro.length);
  });
});
