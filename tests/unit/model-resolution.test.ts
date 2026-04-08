/**
 * Unit tests for proxy/model-resolution.ts — pure helper functions.
 *
 * Tests profileFromContextSize, estimateTokens, resolveSessionId,
 * registeredToModelEntry. resolveModel is async with DB dependencies
 * and tested via integration tests.
 */
import { jest, describe, it, expect } from '@jest/globals';

// Mock the barrel import that model-resolution.ts uses
jest.unstable_mockModule('../../models.js', () => ({
  extractTextContent: jest.fn((content: any) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ');
    return String(content ?? '');
  }),
  getRegisteredModels: jest.fn(async () => []),
  getSubsystemAssignments: jest.fn(async () => ({})),
}));

const { profileFromContextSize, estimateTokens, resolveSessionId, registeredToModelEntry } =
  await import('../../proxy/model-resolution.js');

// ---------- profileFromContextSize ----------

describe('profileFromContextSize', () => {
  it('returns micro for <= 4096', () => {
    expect(profileFromContextSize(2048)).toBe('micro');
    expect(profileFromContextSize(4096)).toBe('micro');
  });

  it('returns small for <= 8192', () => {
    expect(profileFromContextSize(4097)).toBe('small');
    expect(profileFromContextSize(8192)).toBe('small');
  });

  it('returns medium for <= 32768', () => {
    expect(profileFromContextSize(8193)).toBe('medium');
    expect(profileFromContextSize(32768)).toBe('medium');
  });

  it('returns large for <= 131072', () => {
    expect(profileFromContextSize(32769)).toBe('large');
    expect(profileFromContextSize(131072)).toBe('large');
  });

  it('returns xl for > 131072', () => {
    expect(profileFromContextSize(131073)).toBe('xl');
    expect(profileFromContextSize(200000)).toBe('xl');
  });
});

// ---------- estimateTokens ----------

describe('estimateTokens', () => {
  it('estimates tokens from message content length', () => {
    const messages = [{ role: 'user', content: 'Hello world' }];
    const tokens = estimateTokens(messages);
    // "Hello world" = 11 chars + 20 overhead = 31 → ceil(31/3) = 11
    expect(tokens).toBe(11);
  });

  it('sums across multiple messages', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi!' },
    ];
    const tokens = estimateTokens(messages);
    // (16+20) + (3+20) = 59 → ceil(59/3) = 20
    expect(tokens).toBe(20);
  });

  it('returns 0 for empty messages', () => {
    const tokens = estimateTokens([]);
    expect(tokens).toBe(0);
  });

  it('handles messages with array content', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'test' }] }];
    const tokens = estimateTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });
});

// ---------- resolveSessionId ----------

describe('resolveSessionId', () => {
  function mockReq(headers: Record<string, string> = {}): any {
    return { headers };
  }

  it('uses X-Session-Id header when present', () => {
    const id = resolveSessionId(mockReq({ 'x-session-id': 'my-session' }), []);
    expect(id).toBe('proxy:my-session');
  });

  it('uses user field when no header', () => {
    const id = resolveSessionId(mockReq(), [], 'alice');
    expect(id).toBe('proxy:user:alice');
  });

  it('uses system message hash when no header or user', () => {
    const id = resolveSessionId(mockReq(), [{ role: 'system', content: 'You are helpful.' }]);
    expect(id).toMatch(/^proxy:sys:[a-f0-9]{12}$/);
  });

  it('is deterministic for same system message', () => {
    const msgs = [{ role: 'system', content: 'Same content' }];
    const id1 = resolveSessionId(mockReq(), msgs);
    const id2 = resolveSessionId(mockReq(), msgs);
    expect(id1).toBe(id2);
  });

  it('falls back to random UUID when nothing available', () => {
    const id = resolveSessionId(mockReq(), [{ role: 'user', content: 'hi' }]);
    expect(id).toMatch(/^proxy:[0-9a-f-]+$/);
  });

  it('prioritizes header over user', () => {
    const id = resolveSessionId(mockReq({ 'x-session-id': 'header-id' }), [], 'bob');
    expect(id).toBe('proxy:header-id');
  });
});

// ---------- registeredToModelEntry ----------

describe('registeredToModelEntry', () => {
  it('maps RegisteredModel to ResolvedModel shape', () => {
    const model: any = {
      id: 'reg-1',
      name: 'Test Model',
      modelId: 'test-model-v1',
      provider: 'openai',
      endpointUrl: 'http://localhost:1234',
      apiKey: 'sk-test',
      noThink: true,
      inputCostPerMtok: 3.0,
      outputCostPerMtok: 15.0,
      toolCostPerMtok: null,
      contextSize: 128000,
      maxConcurrency: 4,
      requestPauseMs: 100,
    };
    const resolved = registeredToModelEntry(model);
    expect(resolved.name).toBe('test-model-v1');
    expect(resolved.provider).toBe('openai');
    expect(resolved.endpoint).toBe('http://localhost:1234');
    expect(resolved.apiKey).toBe('sk-test');
    expect(resolved.noThink).toBe(true);
    expect(resolved.contextSize).toBe(128000);
    expect(resolved._registryId).toBe('reg-1');
    expect(resolved._maxConcurrency).toBe(4);
    expect(resolved._requestPauseMs).toBe(100);
  });

  it('handles null endpoint and apiKey', () => {
    const model: any = {
      id: 'reg-2',
      modelId: 'local-model',
      provider: 'ollama',
      endpointUrl: null,
      apiKey: null,
      name: 'Local',
    };
    const resolved = registeredToModelEntry(model);
    expect(resolved.endpoint).toBeUndefined();
    expect(resolved.apiKey).toBeUndefined();
  });

  it('defaults maxConcurrency to 1 and requestPauseMs to 0', () => {
    const model: any = {
      id: 'reg-3',
      modelId: 'm',
      provider: 'openai',
      name: 'M',
    };
    const resolved = registeredToModelEntry(model);
    expect(resolved._maxConcurrency).toBe(1);
    expect(resolved._requestPauseMs).toBe(0);
  });
});
