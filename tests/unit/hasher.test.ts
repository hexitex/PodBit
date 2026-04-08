/**
 * Unit tests for kb/hasher.ts — SHA-256 content hashing.
 * hashString (pure) is fully tested; hashFile needs filesystem so not covered here.
 */
import { describe, it, expect } from '@jest/globals';

import { hashString } from '../../kb/hasher.js';

describe('hashString', () => {
  it('produces a 64-char hex string', () => {
    const hash = hashString('hello world');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashString('test')).toBe(hashString('test'));
  });

  it('differs for different content', () => {
    expect(hashString('alpha')).not.toBe(hashString('beta'));
  });

  it('handles empty string', () => {
    const hash = hashString('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // SHA-256 of empty string is well-known
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles unicode content', () => {
    const hash = hashString('こんにちは世界');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is sensitive to whitespace', () => {
    expect(hashString('hello')).not.toBe(hashString('hello '));
    expect(hashString('hello')).not.toBe(hashString(' hello'));
  });
});
