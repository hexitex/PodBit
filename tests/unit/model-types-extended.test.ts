/**
 * Tests for models/types.ts — pure utility functions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const {
    normalizeProvider,
    getModelProvider,
    resolveProviderEndpoint,
    generateUuid,
    VALID_SUBSYSTEMS,
} = await import('../../models/types.js');

describe('models/types', () => {
    describe('normalizeProvider', () => {
        it('maps ollama to local', () => {
            expect(normalizeProvider('ollama')).toBe('local');
        });

        it('returns unknown providers as-is', () => {
            expect(normalizeProvider('openai')).toBe('openai');
            expect(normalizeProvider('anthropic')).toBe('anthropic');
            expect(normalizeProvider('lmstudio')).toBe('lmstudio');
        });

        it('returns local as-is', () => {
            expect(normalizeProvider('local')).toBe('local');
        });
    });

    describe('getModelProvider', () => {
        it('returns unknown for empty string', () => {
            expect(getModelProvider('')).toBe('unknown');
        });

        it('extracts provider from slash-separated model ID', () => {
            expect(getModelProvider('moonshotai/kimi2.5')).toBe('moonshotai');
            expect(getModelProvider('meta-llama/llama3')).toBe('meta-llama');
        });

        it('returns model ID as-is when no slash', () => {
            expect(getModelProvider('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
            expect(getModelProvider('gpt-4')).toBe('gpt-4');
        });

        it('handles slash at position 0', () => {
            // Slash at idx 0 means no provider prefix
            expect(getModelProvider('/model')).toBe('/model');
        });
    });

    describe('resolveProviderEndpoint', () => {
        it('returns anthropic endpoint', () => {
            expect(resolveProviderEndpoint('anthropic')).toBe('https://api.anthropic.com/v1');
        });

        it('returns local endpoint (default)', () => {
            const result = resolveProviderEndpoint('local');
            expect(result).toContain('11434');
        });

        it('returns openai endpoint (default)', () => {
            const result = resolveProviderEndpoint('openai');
            expect(typeof result).toBe('string');
        });

        it('returns default for unknown provider', () => {
            const result = resolveProviderEndpoint('unknown-provider');
            expect(typeof result).toBe('string');
        });
    });

    describe('generateUuid', () => {
        it('returns a string matching UUID v4 format', () => {
            const uuid = generateUuid();
            expect(uuid).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        });

        it('generates unique values', () => {
            const uuids = new Set(Array.from({ length: 100 }, () => generateUuid()));
            expect(uuids.size).toBe(100);
        });
    });

    describe('VALID_SUBSYSTEMS', () => {
        it('contains expected subsystems', () => {
            expect(VALID_SUBSYSTEMS).toContain('synthesis');
            expect(VALID_SUBSYSTEMS).toContain('voice');
            expect(VALID_SUBSYSTEMS).toContain('embedding');
            expect(VALID_SUBSYSTEMS).toContain('proxy');
            expect(VALID_SUBSYSTEMS).toContain('evm_analysis');
            expect(VALID_SUBSYSTEMS).toContain('elite_mapping');
        });

        it('is a non-empty array', () => {
            expect(VALID_SUBSYSTEMS.length).toBeGreaterThan(10);
        });
    });
});
