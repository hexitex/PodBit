/**
 * Unit tests for core/provenance.ts — compact epistemic status tags.
 *
 * Pure string manipulation — no dependencies.
 */
import { describe, it, expect } from '@jest/globals';

import {
  buildProvenanceTag,
  formatNodeWithProvenance,
  PROVENANCE_GUIDE_USER,
  PROVENANCE_GUIDE_SYNTHESIS,
  PROVENANCE_GUIDE_VALIDATION,
  PROVENANCE_GUIDE_EVM,
} from '../../core/provenance.js';

describe('buildProvenanceTag', () => {
  it('defaults to [seed|g0] for empty input', () => {
    expect(buildProvenanceTag({})).toBe('[seed|g0]');
  });

  it('maps voiced to synthesis', () => {
    expect(buildProvenanceTag({ node_type: 'voiced' })).toBe('[synthesis|g0]');
  });

  it('maps synthesis to synthesis', () => {
    expect(buildProvenanceTag({ nodeType: 'synthesis' })).toBe('[synthesis|g0]');
  });

  it('includes generation depth', () => {
    expect(buildProvenanceTag({ node_type: 'seed', generation: 0 })).toBe('[seed|g0]');
    expect(buildProvenanceTag({ node_type: 'voiced', generation: 2 })).toBe('[synthesis|g2]');
  });

  it('marks deep chains with + suffix', () => {
    expect(buildProvenanceTag({ node_type: 'voiced', generation: 3 })).toBe('[synthesis|g3+]');
    expect(buildProvenanceTag({ node_type: 'voiced', generation: 5 })).toBe('[synthesis|g5+]');
  });

  it('skips generation for questions', () => {
    expect(buildProvenanceTag({ node_type: 'question' })).toBe('[question]');
  });

  it('adds kb source hint for KB contributors', () => {
    expect(buildProvenanceTag({ node_type: 'seed', contributor: 'kb:reader_text' })).toBe('[seed|g0|kb]');
  });

  it('adds kb source hint for reader origins', () => {
    expect(buildProvenanceTag({ node_type: 'seed', origin: 'reader_pdf' })).toBe('[seed|g0|kb]');
  });

  it('adds human source hint', () => {
    expect(buildProvenanceTag({ node_type: 'seed', contributor: 'human:alice' })).toBe('[seed|g0|human]');
    expect(buildProvenanceTag({ node_type: 'seed', contributor: 'human' })).toBe('[seed|g0|human]');
    expect(buildProvenanceTag({ node_type: 'seed', origin: 'human' })).toBe('[seed|g0|human]');
  });

  it('adds research source hint', () => {
    expect(buildProvenanceTag({ node_type: 'seed', origin: 'research-cycle' })).toBe('[seed|g0|research]');
  });

  it('adds verification score', () => {
    expect(buildProvenanceTag({
      node_type: 'voiced',
      generation: 1,
      verification_status: 'verified',
      verification_score: 0.92,
    })).toBe('[synthesis|g1|v:92]');
  });

  it('adds vfail for failed verification', () => {
    expect(buildProvenanceTag({
      node_type: 'voiced',
      generation: 1,
      verification_status: 'failed',
    })).toBe('[synthesis|g1|vfail]');
  });

  it('handles camelCase fields', () => {
    expect(buildProvenanceTag({
      nodeType: 'voiced',
      generation: 2,
      verificationStatus: 'verified',
      verificationScore: 0.85,
    })).toBe('[synthesis|g2|v:85]');
  });

  it('maps breakthrough type', () => {
    expect(buildProvenanceTag({ node_type: 'breakthrough', generation: 2 })).toBe('[breakthrough|g2]');
  });

  it('maps elite_verification type', () => {
    expect(buildProvenanceTag({
      node_type: 'elite_verification',
      generation: 3,
      verification_status: 'verified',
      verification_score: 0.98,
    })).toBe('[elite|g3+|v:98]');
  });

  it('maps raw type', () => {
    expect(buildProvenanceTag({ node_type: 'raw' })).toBe('[raw|g0]');
  });
});

describe('formatNodeWithProvenance', () => {
  it('combines tag with content', () => {
    const result = formatNodeWithProvenance({ node_type: 'seed' }, 'Some content here');
    expect(result).toBe('[seed|g0] Some content here');
  });

  it('handles complex tags with content', () => {
    const result = formatNodeWithProvenance(
      { node_type: 'voiced', generation: 1, verification_status: 'verified', verification_score: 0.9 },
      'An important insight'
    );
    expect(result).toBe('[synthesis|g1|v:90] An important insight');
  });
});

describe('provenance guide constants', () => {
  it('exports non-empty guide strings', () => {
    expect(PROVENANCE_GUIDE_USER.length).toBeGreaterThan(100);
    expect(PROVENANCE_GUIDE_SYNTHESIS.length).toBeGreaterThan(50);
    expect(PROVENANCE_GUIDE_VALIDATION.length).toBeGreaterThan(50);
    expect(PROVENANCE_GUIDE_EVM.length).toBeGreaterThan(50);
  });

  it('user guide mentions seed and synthesis', () => {
    expect(PROVENANCE_GUIDE_USER).toContain('seed');
    expect(PROVENANCE_GUIDE_USER).toContain('synthesis');
  });

  it('user guide mentions generation and speculation', () => {
    expect(PROVENANCE_GUIDE_USER).toContain('g3+');
    expect(PROVENANCE_GUIDE_USER).toContain('speculative');
  });
});
