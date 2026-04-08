/**
 * Unit tests for models/types.ts —
 * normalizeProvider, getModelProvider, resolveProviderEndpoint, generateUuid,
 * VALID_SUBSYSTEMS constant.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const {
    normalizeProvider,
    getModelProvider,
    resolveProviderEndpoint,
    generateUuid,
    VALID_SUBSYSTEMS,
} = await import('../../models/types.js');

// =============================================================================
// Tests
// =============================================================================

describe('models/types', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // normalizeProvider
    // =========================================================================
    describe('normalizeProvider', () => {
        it('maps "ollama" to "local"', () => {
            expect(normalizeProvider('ollama')).toBe('local');
        });

        it('returns unknown providers as-is', () => {
            expect(normalizeProvider('openai')).toBe('openai');
            expect(normalizeProvider('anthropic')).toBe('anthropic');
            expect(normalizeProvider('custom')).toBe('custom');
        });

        it('passes through local unchanged', () => {
            expect(normalizeProvider('local')).toBe('local');
        });

        it('handles empty string', () => {
            expect(normalizeProvider('')).toBe('');
        });

        it('is case-sensitive (no alias for "Ollama")', () => {
            expect(normalizeProvider('Ollama')).toBe('Ollama');
        });
    });

    // =========================================================================
    // getModelProvider
    // =========================================================================
    describe('getModelProvider', () => {
        it('extracts provider from slash-separated model ID', () => {
            expect(getModelProvider('moonshotai/kimi2.5')).toBe('moonshotai');
            expect(getModelProvider('openai/gpt-4o')).toBe('openai');
        });

        it('returns full string when no slash', () => {
            expect(getModelProvider('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
        });

        it('returns "unknown" for empty/falsy input', () => {
            expect(getModelProvider('')).toBe('unknown');
            expect(getModelProvider(null as any)).toBe('unknown');
        });

        it('handles leading slash correctly (slashIdx 0 is not > 0)', () => {
            expect(getModelProvider('/model')).toBe('/model');
        });

        it('returns first segment of multi-slash path', () => {
            expect(getModelProvider('openai/gpt-4/turbo')).toBe('openai');
        });

        it('handles model with dots', () => {
            expect(getModelProvider('meta-llama/Llama-3.1-8B-Instruct')).toBe('meta-llama');
        });
    });

    // =========================================================================
    // resolveProviderEndpoint
    // =========================================================================
    describe('resolveProviderEndpoint', () => {
        const savedEnv: Record<string, string | undefined> = {};
        const envKeys = ['OLLAMA_ENDPOINT', 'OPENAI_ENDPOINT', 'LLM_ENDPOINT', 'LMSTUDIO_ENDPOINT'];

        beforeEach(() => {
            for (const key of envKeys) {
                savedEnv[key] = process.env[key];
                delete process.env[key];
            }
        });

        afterEach(() => {
            for (const key of envKeys) {
                if (savedEnv[key] === undefined) delete process.env[key];
                else process.env[key] = savedEnv[key];
            }
        });

        it('returns default local endpoint for "local" provider', () => {
            expect(resolveProviderEndpoint('local')).toBe('http://127.0.0.1:11434/v1');
        });

        it('uses OLLAMA_ENDPOINT env var for local provider', () => {
            process.env.OLLAMA_ENDPOINT = 'http://custom:9999/v1';
            expect(resolveProviderEndpoint('local')).toBe('http://custom:9999/v1');
        });

        it('returns Anthropic endpoint for "anthropic" provider', () => {
            expect(resolveProviderEndpoint('anthropic')).toBe('https://api.anthropic.com/v1');
        });

        it('returns default OpenAI endpoint for "openai" provider', () => {
            expect(resolveProviderEndpoint('openai')).toBe('https://api.openai.com/v1');
        });

        it('uses OPENAI_ENDPOINT env var for openai provider', () => {
            process.env.OPENAI_ENDPOINT = 'http://openai-proxy/v1';
            expect(resolveProviderEndpoint('openai')).toBe('http://openai-proxy/v1');
        });

        it('returns default LM Studio endpoint for unknown providers', () => {
            expect(resolveProviderEndpoint('something-else')).toBe('http://127.0.0.1:1234/v1');
        });

        it('uses LLM_ENDPOINT for unknown providers', () => {
            process.env.LLM_ENDPOINT = 'http://llm-custom/v1';
            expect(resolveProviderEndpoint('whatever')).toBe('http://llm-custom/v1');
        });

        it('falls back to LMSTUDIO_ENDPOINT when LLM_ENDPOINT not set', () => {
            process.env.LMSTUDIO_ENDPOINT = 'http://lm-studio/v1';
            expect(resolveProviderEndpoint('whatever')).toBe('http://lm-studio/v1');
        });
    });

    // =========================================================================
    // generateUuid
    // =========================================================================
    describe('generateUuid', () => {
        it('returns a string in UUID v4 format', () => {
            const uuid = generateUuid();
            expect(uuid).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        });

        it('generates unique values', () => {
            const uuids = new Set(Array.from({ length: 50 }, () => generateUuid()));
            expect(uuids.size).toBe(50);
        });

        it('always has version 4 marker', () => {
            for (let i = 0; i < 20; i++) {
                const uuid = generateUuid();
                expect(uuid[14]).toBe('4');
            }
        });

        it('has correct variant bits (8, 9, a, or b)', () => {
            for (let i = 0; i < 20; i++) {
                const uuid = generateUuid();
                expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
            }
        });

        it('has correct length (36 chars)', () => {
            expect(generateUuid()).toHaveLength(36);
        });

        it('has hyphens at correct positions', () => {
            const uuid = generateUuid();
            expect(uuid[8]).toBe('-');
            expect(uuid[13]).toBe('-');
            expect(uuid[18]).toBe('-');
            expect(uuid[23]).toBe('-');
        });
    });

    // =========================================================================
    // VALID_SUBSYSTEMS
    // =========================================================================
    describe('VALID_SUBSYSTEMS', () => {
        it('contains expected core subsystems', () => {
            expect(VALID_SUBSYSTEMS).toContain('synthesis');
            expect(VALID_SUBSYSTEMS).toContain('chat');
            expect(VALID_SUBSYSTEMS).toContain('voice');
            expect(VALID_SUBSYSTEMS).toContain('embedding');
            expect(VALID_SUBSYSTEMS).toContain('proxy');
        });

        it('contains EVM subsystems', () => {
            expect(VALID_SUBSYSTEMS).toContain('evm_analysis');
            expect(VALID_SUBSYSTEMS).toContain('evm_guidance');
            expect(VALID_SUBSYSTEMS).toContain('spec_extraction');
        });

        it('contains reader subsystems', () => {
            expect(VALID_SUBSYSTEMS).toContain('reader_text');
            expect(VALID_SUBSYSTEMS).toContain('reader_pdf');
            expect(VALID_SUBSYSTEMS).toContain('reader_image');
        });

        it('has no duplicates', () => {
            const unique = new Set(VALID_SUBSYSTEMS);
            expect(unique.size).toBe(VALID_SUBSYSTEMS.length);
        });

        it('contains dedup and tuning subsystems', () => {
            expect(VALID_SUBSYSTEMS).toContain('dedup_judge');
            expect(VALID_SUBSYSTEMS).toContain('config_tune');
            expect(VALID_SUBSYSTEMS).toContain('tuning_judge');
            expect(VALID_SUBSYSTEMS).toContain('autorating');
        });

        it('contains elite_mapping and breakthrough_check', () => {
            expect(VALID_SUBSYSTEMS).toContain('elite_mapping');
            expect(VALID_SUBSYSTEMS).toContain('breakthrough_check');
        });
    });
});
