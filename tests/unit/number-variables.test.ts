/**
 * Unit tests for core/number-variables.ts — pure helpers (no DB).
 * extractNumbers, extractScopeContext, extractVarIdsFromContent, buildVariableLegend, stripVariableNotation.
 */
import { jest, describe, it, expect } from '@jest/globals';

// Mock DB and config before importing the module
jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
  config: {
    numberVariables: {
      enabled: true,
      maxVarsPerNode: 50,
      contextWindowSize: 5,
    },
  },
}));

const {
  extractNumbers,
  extractScopeContext,
  extractVarIdsFromContent,
  buildVariableLegend,
  stripVariableNotation,
} = await import('../../core/number-variables.js');

type NumberVariable = import('../../core/number-variables.js').NumberVariable;

/** Find all numbers in content; skip those inside [[[VAR]]]; respect maxVarsPerNode. */
describe('extractNumbers', () => {
  it('extracts integers from content', () => {
    const result = extractNumbers('The value is 42 and also 100');
    expect(result).toHaveLength(2);
    expect(result[0].rawValue).toBe('42');
    expect(result[1].rawValue).toBe('100');
  });

  it('extracts decimal numbers', () => {
    const result = extractNumbers('Rate is 3.14 percent');
    expect(result).toHaveLength(1);
    expect(result[0].rawValue).toBe('3.14');
  });

  it('records correct offsets', () => {
    const content = 'abc 99 def';
    const result = extractNumbers(content);
    expect(result).toHaveLength(1);
    expect(result[0].offset).toBe(4);
    expect(result[0].length).toBe(2);
  });

  it('returns empty array for content with no numbers', () => {
    expect(extractNumbers('no numbers here')).toHaveLength(0);
  });

  it('skips numbers inside existing variable refs', () => {
    const content = 'Before [[[ABCD42]]] after 7';
    const result = extractNumbers(content);
    // Should only find "7", not "42" inside the ref
    expect(result.every(r => r.rawValue !== '42')).toBe(true);
    expect(result.some(r => r.rawValue === '7')).toBe(true);
  });

  it('respects maxVarsPerNode config limit', () => {
    const content = Array.from({ length: 60 }, (_, i) => `num${i + 100}`).join(' ');
    const result = extractNumbers(content);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('handles multiple variable refs interspersed with numbers', () => {
    const content = '10 then [[[XYZQ1]]] then 20 then [[[XYZQ2]]] then 30';
    const result = extractNumbers(content);
    const values = result.map(r => r.rawValue);
    expect(values).toContain('10');
    expect(values).toContain('20');
    expect(values).toContain('30');
    expect(values).not.toContain('1');
    expect(values).not.toContain('2');
  });
});

/** ±N words around offset for variable context. */
describe('extractScopeContext', () => {
  it('extracts surrounding words as context', () => {
    const content = 'The quick brown fox jumps 42 times over the lazy dog today';
    const offset = content.indexOf('42');
    const result = extractScopeContext(content, offset, 2);
    expect(result).toContain('jumps');
    expect(result).toContain('times');
  });

  it('handles number at start of content', () => {
    const content = '42 is the answer to everything';
    const result = extractScopeContext(content, 0, 2);
    expect(result).toContain('is');
    expect(result).toContain('the');
  });

  it('handles number at end of content', () => {
    const content = 'The answer is 42';
    const offset = content.indexOf('42');
    const result = extractScopeContext(content, offset, 2);
    expect(result).toContain('answer');
  });

  it('strips variable refs from context', () => {
    const content = 'The [[[ABCD1]]] value is 42 in the domain';
    const offset = content.indexOf('42');
    const result = extractScopeContext(content, offset, 5);
    expect(result).not.toContain('[[[');
    expect(result).not.toContain(']]]');
  });
});

// ---------- extractVarIdsFromContent ----------

describe('extractVarIdsFromContent', () => {
  it('extracts variable IDs from content', () => {
    const content = 'Value [[[ABCD1]]] and [[[EFGH23]]] here';
    const ids = extractVarIdsFromContent(content);
    expect(ids).toContain('ABCD1');
    expect(ids).toContain('EFGH23');
  });

  it('deduplicates repeated IDs', () => {
    const content = '[[[ABCD1]]] repeated [[[ABCD1]]]';
    const ids = extractVarIdsFromContent(content);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('ABCD1');
  });

  it('returns empty array for content with no variable refs', () => {
    expect(extractVarIdsFromContent('no variables here')).toHaveLength(0);
  });

  it('handles adjacent variable refs', () => {
    const content = '[[[AA1]]][[[BB2]]]';
    const ids = extractVarIdsFromContent(content);
    expect(ids).toHaveLength(2);
  });
});

// ---------- buildVariableLegend ----------

describe('buildVariableLegend', () => {
  it('returns empty string for empty array', () => {
    expect(buildVariableLegend([])).toBe('');
  });

  it('groups variables by domain', () => {
    const vars: NumberVariable[] = [
      { varId: 'ABCD1', value: '3.14', scopeText: 'pi constant', sourceNodeId: 'n1', domain: 'math' },
      { varId: 'ABCD2', value: '2.71', scopeText: 'euler number', sourceNodeId: 'n2', domain: 'math' },
      { varId: 'ABCD3', value: '9.8', scopeText: 'gravity', sourceNodeId: 'n3', domain: 'physics' },
    ];
    const legend = buildVariableLegend(vars);
    expect(legend).toContain('NUMBER VARIABLES');
    expect(legend).toContain('[[[ABCD1]]] = 3.14');
    expect(legend).toContain('[[[ABCD3]]] = 9.8');
    expect(legend).toContain('math:');
    expect(legend).toContain('physics:');
  });

  it('includes scope text in output', () => {
    const vars: NumberVariable[] = [
      { varId: 'XX1', value: '42', scopeText: 'the answer', sourceNodeId: 'n1', domain: 'philosophy' },
    ];
    const legend = buildVariableLegend(vars);
    expect(legend).toContain('the answer');
  });
});

// ---------- stripVariableNotation ----------

describe('stripVariableNotation', () => {
  it('replaces variable refs with values from map', () => {
    const content = 'The rate is [[[ABCD1]]] percent';
    const varMap = new Map([['ABCD1', '5.5']]);
    expect(stripVariableNotation(content, varMap)).toBe('The rate is 5.5 percent');
  });

  it('leaves unknown refs intact', () => {
    const content = 'Value [[[UNKNOWN1]]] here';
    const varMap = new Map<string, string>();
    expect(stripVariableNotation(content, varMap)).toBe(content);
  });

  it('replaces multiple refs in same content', () => {
    const content = '[[[A1]]] plus [[[B2]]] equals [[[C3]]]';
    const varMap = new Map([['A1', '10'], ['B2', '20'], ['C3', '30']]);
    expect(stripVariableNotation(content, varMap)).toBe('10 plus 20 equals 30');
  });

  it('handles mixed known and unknown refs', () => {
    const content = '[[[KNOWN1]]] and [[[MISSING1]]]';
    const varMap = new Map([['KNOWN1', '42']]);
    expect(stripVariableNotation(content, varMap)).toBe('42 and [[[MISSING1]]]');
  });
});
