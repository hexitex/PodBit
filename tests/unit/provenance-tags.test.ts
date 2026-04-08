/**
 * Tests for core/provenance.ts — buildProvenanceTag, formatNodeWithProvenance.
 * These are pure exported functions with no dependencies.
 */
import { describe, it, expect } from '@jest/globals';

// core/provenance.ts has no module-level side effects — import directly
const { buildProvenanceTag, formatNodeWithProvenance } = await import('../../core/provenance.js');

describe('buildProvenanceTag', () => {
    it('builds basic seed tag at generation 0', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0 });
        expect(tag).toBe('[seed|g0]');
    });

    it('builds synthesis tag', () => {
        const tag = buildProvenanceTag({ node_type: 'voiced', generation: 1 });
        expect(tag).toBe('[synthesis|g1]');
    });

    it('builds breakthrough tag', () => {
        const tag = buildProvenanceTag({ node_type: 'breakthrough', generation: 2 });
        expect(tag).toBe('[breakthrough|g2]');
    });

    it('uses g+ suffix for deep chains (generation >= 3)', () => {
        const tag = buildProvenanceTag({ node_type: 'synthesis', generation: 3 });
        expect(tag).toBe('[synthesis|g3+]');
    });

    it('deep chain still uses g+ at gen 4', () => {
        const tag = buildProvenanceTag({ node_type: 'synthesis', generation: 4 });
        expect(tag).toBe('[synthesis|g4+]');
    });

    it('omits generation for question type', () => {
        const tag = buildProvenanceTag({ node_type: 'question' });
        expect(tag).toBe('[question]');
    });

    it('adds kb hint for kb: contributor', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, contributor: 'kb:pdf-reader' });
        expect(tag).toBe('[seed|g0|kb]');
    });

    it('adds kb hint for reader_ origin', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, origin: 'reader_text' });
        expect(tag).toBe('[seed|g0|kb]');
    });

    it('adds human hint for human: contributor', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, contributor: 'human:alice' });
        expect(tag).toBe('[seed|g0|human]');
    });

    it('adds human hint for contributor === "human"', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, contributor: 'human' });
        expect(tag).toBe('[seed|g0|human]');
    });

    it('adds human hint for origin === "human"', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, origin: 'human' });
        expect(tag).toBe('[seed|g0|human]');
    });

    it('adds research hint for research-cycle contributor', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, contributor: 'research-cycle' });
        expect(tag).toBe('[seed|g0|research]');
    });

    it('adds research hint for research-cycle origin', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: 0, origin: 'research-cycle' });
        expect(tag).toBe('[seed|g0|research]');
    });

    it('adds verification status when verified', () => {
        const tag = buildProvenanceTag({
            node_type: 'synthesis',
            generation: 1,
            verification_status: 'verified',
            verification_score: 0.92,
        });
        expect(tag).toBe('[synthesis|g1|v:92]');
    });

    it('rounds verification score', () => {
        const tag = buildProvenanceTag({
            node_type: 'synthesis',
            generation: 1,
            verification_status: 'verified',
            verification_score: 0.9876,
        });
        expect(tag).toBe('[synthesis|g1|v:99]');
    });

    it('adds vfail for failed verification', () => {
        const tag = buildProvenanceTag({
            node_type: 'synthesis',
            generation: 1,
            verification_status: 'failed',
        });
        expect(tag).toBe('[synthesis|g1|vfail]');
    });

    it('skips verification when status is pending', () => {
        const tag = buildProvenanceTag({
            node_type: 'synthesis',
            generation: 1,
            verification_status: 'pending',
        });
        expect(tag).toBe('[synthesis|g1]');
    });

    it('handles camelCase field names', () => {
        const tag = buildProvenanceTag({
            nodeType: 'synthesis',
            generation: 1,
            verificationStatus: 'verified',
            verificationScore: 0.85,
        });
        expect(tag).toBe('[synthesis|g1|v:85]');
    });

    it('defaults to seed when node_type is null', () => {
        const tag = buildProvenanceTag({ node_type: null, generation: 0 });
        expect(tag).toBe('[seed|g0]');
    });

    it('defaults generation to 0 when null', () => {
        const tag = buildProvenanceTag({ node_type: 'seed', generation: null });
        expect(tag).toBe('[seed|g0]');
    });

    it('handles empty object defensively', () => {
        const tag = buildProvenanceTag({});
        expect(tag).toBe('[seed|g0]');
    });

    it('handles elite_verification type', () => {
        const tag = buildProvenanceTag({ node_type: 'elite_verification', generation: 2 });
        expect(tag).toBe('[elite|g2]');
    });

    it('includes all segments: source hint + verification', () => {
        const tag = buildProvenanceTag({
            node_type: 'synthesis',
            generation: 1,
            contributor: 'kb:scanner',
            verification_status: 'verified',
            verification_score: 0.75,
        });
        expect(tag).toBe('[synthesis|g1|kb|v:75]');
    });
});

describe('formatNodeWithProvenance', () => {
    it('prepends provenance tag to content', () => {
        const result = formatNodeWithProvenance(
            { node_type: 'seed', generation: 0 },
            'Some important knowledge.',
        );
        expect(result).toBe('[seed|g0] Some important knowledge.');
    });

    it('includes full tag with verification', () => {
        const result = formatNodeWithProvenance(
            { node_type: 'synthesis', generation: 1, verification_status: 'verified', verification_score: 0.88 },
            'A verified insight.',
        );
        expect(result).toBe('[synthesis|g1|v:88] A verified insight.');
    });

    it('handles empty content', () => {
        const result = formatNodeWithProvenance({ node_type: 'seed', generation: 0 }, '');
        expect(result).toBe('[seed|g0] ');
    });
});
