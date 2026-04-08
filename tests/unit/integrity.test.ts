/**
 * Unit tests for core/integrity.ts — Merkle DAG cryptographic provenance.
 *
 * All tested functions are pure (no DB access): computeContentHash,
 * computeLogEntryHash, computeMerkleRoot, verifyMerkleRoot,
 * verifyLogChain, verifyPartitionIntegrity.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

const {
  computeContentHash,
  computeLogEntryHash,
  computeMerkleRoot,
  verifyMerkleRoot,
  verifyLogChain,
  verifyPartitionIntegrity,
} = await import('../../core/integrity.js');

// ---------- computeContentHash ----------

describe('computeContentHash', () => {
  it('produces a 64-char hex string', () => {
    const hash = computeContentHash({
      content: 'test',
      nodeType: 'seed',
      contributor: 'human',
      createdAt: '2024-01-01T00:00:00Z',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const params = { content: 'hello', nodeType: 'seed', contributor: 'bot', createdAt: '2024-01-01' };
    expect(computeContentHash(params)).toBe(computeContentHash(params));
  });

  it('changes when content changes', () => {
    const base = { nodeType: 'seed', contributor: 'human', createdAt: '2024-01-01' };
    const h1 = computeContentHash({ ...base, content: 'alpha' });
    const h2 = computeContentHash({ ...base, content: 'beta' });
    expect(h1).not.toBe(h2);
  });

  it('changes when nodeType changes', () => {
    const base = { content: 'test', contributor: 'human', createdAt: '2024-01-01' };
    const h1 = computeContentHash({ ...base, nodeType: 'seed' });
    const h2 = computeContentHash({ ...base, nodeType: 'voiced' });
    expect(h1).not.toBe(h2);
  });

  it('handles null contributor', () => {
    const hash = computeContentHash({
      content: 'test',
      nodeType: 'seed',
      contributor: null,
      createdAt: '2024-01-01',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sorts parent hashes for deterministic ordering', () => {
    const base = { content: 'test', nodeType: 'voiced', contributor: 'bot', createdAt: '2024-01-01' };
    const h1 = computeContentHash({ ...base, parentHashes: ['aaa', 'bbb', 'ccc'] });
    const h2 = computeContentHash({ ...base, parentHashes: ['ccc', 'aaa', 'bbb'] });
    expect(h1).toBe(h2);
  });

  it('differs with vs without parent hashes', () => {
    const base = { content: 'test', nodeType: 'voiced', contributor: 'bot', createdAt: '2024-01-01' };
    const h1 = computeContentHash({ ...base });
    const h2 = computeContentHash({ ...base, parentHashes: ['abc123'] });
    expect(h1).not.toBe(h2);
  });
});

// ---------- computeLogEntryHash ----------

describe('computeLogEntryHash', () => {
  const baseEntry = {
    nodeId: 'node-1',
    operation: 'create',
    contentHashBefore: null,
    contentHashAfter: 'abc123',
    parentHashes: null,
    contributor: 'human',
    details: null,
    prevLogHash: null,
    partitionId: 'part-1',
    timestamp: '2024-01-01T00:00:00Z',
  };

  it('produces a 64-char hex string', () => {
    expect(computeLogEntryHash(baseEntry)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeLogEntryHash(baseEntry)).toBe(computeLogEntryHash(baseEntry));
  });

  it('changes when operation changes', () => {
    const h1 = computeLogEntryHash(baseEntry);
    const h2 = computeLogEntryHash({ ...baseEntry, operation: 'update' });
    expect(h1).not.toBe(h2);
  });

  it('includes prevLogHash in chain', () => {
    const h1 = computeLogEntryHash(baseEntry);
    const h2 = computeLogEntryHash({ ...baseEntry, prevLogHash: 'prev-hash-value' });
    expect(h1).not.toBe(h2);
  });
});

// ---------- computeMerkleRoot ----------

describe('computeMerkleRoot', () => {
  it('returns hash of empty string for empty set', () => {
    const root = computeMerkleRoot([]);
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the hash for a single element', () => {
    const root = computeMerkleRoot(['abc']);
    expect(root).toBe('abc'); // Single element promoted as-is
  });

  it('is deterministic regardless of input order', () => {
    const r1 = computeMerkleRoot(['hash1', 'hash2', 'hash3']);
    const r2 = computeMerkleRoot(['hash3', 'hash1', 'hash2']);
    expect(r1).toBe(r2);
  });

  it('produces different roots for different hash sets', () => {
    const r1 = computeMerkleRoot(['aaa', 'bbb']);
    const r2 = computeMerkleRoot(['aaa', 'ccc']);
    expect(r1).not.toBe(r2);
  });

  it('handles odd number of hashes (last promoted)', () => {
    const root = computeMerkleRoot(['a', 'b', 'c']);
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles power-of-2 count', () => {
    const root = computeMerkleRoot(['a', 'b', 'c', 'd']);
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------- verifyMerkleRoot ----------

describe('verifyMerkleRoot', () => {
  it('returns valid for matching root', () => {
    const hashes = ['hash1', 'hash2'];
    const expectedRoot = computeMerkleRoot(hashes);
    const nodes = hashes.map(h => ({ content_hash: h }));
    const result = verifyMerkleRoot(nodes, expectedRoot);
    expect(result.valid).toBe(true);
    expect(result.nodesWithHashes).toBe(2);
    expect(result.nodesTotal).toBe(2);
  });

  it('returns invalid for tampered root', () => {
    const nodes = [{ content_hash: 'hash1' }, { content_hash: 'hash2' }];
    const result = verifyMerkleRoot(nodes, 'wrong-root');
    expect(result.valid).toBe(false);
  });

  it('skips nodes without hashes', () => {
    const nodes = [
      { content_hash: 'hash1' },
      { content_hash: null },
      { content_hash: 'hash2' },
    ];
    const expectedRoot = computeMerkleRoot(['hash1', 'hash2']);
    const result = verifyMerkleRoot(nodes, expectedRoot);
    expect(result.valid).toBe(true);
    expect(result.nodesWithHashes).toBe(2);
    expect(result.nodesTotal).toBe(3);
  });
});

// ---------- verifyLogChain ----------

describe('verifyLogChain', () => {
  interface LogEntry {
    nodeId: string; operation: string; contentHashBefore: string | null;
    contentHashAfter: string; parentHashes: string | null; contributor: string | null;
    details: string | null; prevLogHash: string | null; logHash: string;
    partitionId: string | null; timestamp: string;
  }

  function makeChain(count: number): LogEntry[] {
    const entries: LogEntry[] = [];
    for (let i = 0; i < count; i++) {
      const entry: LogEntry = {
        nodeId: `node-${i}`,
        operation: 'create',
        contentHashBefore: null,
        contentHashAfter: `hash-${i}`,
        parentHashes: null,
        contributor: 'bot',
        details: null,
        prevLogHash: i === 0 ? null : entries[i - 1].logHash,
        partitionId: 'part-1',
        timestamp: `2024-01-0${i + 1}T00:00:00Z`,
        logHash: '',
      };
      entry.logHash = computeLogEntryHash(entry);
      entries.push(entry);
    }
    return entries;
  }

  it('validates an empty chain', () => {
    const result = verifyLogChain([]);
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(0);
  });

  it('validates a single-entry chain', () => {
    const chain = makeChain(1);
    const result = verifyLogChain(chain);
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(1);
  });

  it('validates a multi-entry chain', () => {
    const chain = makeChain(5);
    const result = verifyLogChain(chain);
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(5);
  });

  it('detects tampered hash', () => {
    const chain = makeChain(3);
    chain[1].logHash = 'tampered';
    const result = verifyLogChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toContain('Hash mismatch');
  });

  it('detects broken chain link', () => {
    const chain = makeChain(3);
    chain[2].prevLogHash = 'broken-link';
    const result = verifyLogChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain('Chain break');
  });

  it('detects non-null prevLogHash on first entry', () => {
    const chain = makeChain(2);
    chain[0].prevLogHash = 'should-be-null';
    // Need to recompute hash since we changed the entry
    chain[0].logHash = computeLogEntryHash(chain[0]);
    const result = verifyLogChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.reason).toContain('First entry');
  });
});

// ---------- verifyPartitionIntegrity ----------

describe('verifyPartitionIntegrity', () => {
  it('handles empty export data', () => {
    const result = verifyPartitionIntegrity({});
    expect(result.merkleValid).toBe(false);
    expect(result.chainValid).toBe(true);
    expect(result.nodesTotal).toBe(0);
  });

  it('verifies valid merkle root', () => {
    const hashes = ['h1', 'h2', 'h3'];
    const merkleRoot = computeMerkleRoot(hashes);
    const result = verifyPartitionIntegrity({
      nodes: hashes.map(h => ({ content_hash: h })),
      integrity: { merkleRoot },
    });
    expect(result.merkleValid).toBe(true);
    expect(result.nodesWithHashes).toBe(3);
  });

  it('detects tampered merkle root', () => {
    const result = verifyPartitionIntegrity({
      nodes: [{ content_hash: 'h1' }],
      integrity: { merkleRoot: 'wrong' },
    });
    expect(result.merkleValid).toBe(false);
  });
});
