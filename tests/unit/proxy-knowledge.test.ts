/**
 * Unit tests for proxy/knowledge.ts
 *
 * Tests proxySettings initialization, ensureProxySettings DB loading,
 * and injectKnowledge message manipulation.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQueryOne = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn(),
    queryOne: jest.fn(),
    systemQuery: jest.fn(),
    systemQueryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        proxy: {
            knowledgeReserve: 0.15,
            knowledgeMinReserve: 0.05,
        },
    },
}));

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
    createCachedLoader: jest.fn((loadFn: () => Promise<any>) => ({
        get: loadFn,
        invalidate: jest.fn(),
    })),
}));

jest.unstable_mockModule('../../telegraphic.js', () => ({
    DEFAULT_ENTROPY_OPTIONS: {
        weights: { entity: 0.4, number: 0.35, properNoun: 0.3, acronym: 0.25, rarity: 0.15 },
        thresholds: { light: 0.2, medium: 0.35, aggressive: 0.5 },
        rarityMinLength: 8,
    },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { proxySettings, ensureProxySettings, injectKnowledge } = await import('../../proxy/knowledge.js');

describe('proxy/knowledge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // proxySettings defaults
    // -----------------------------------------------------------------------
    describe('proxySettings defaults', () => {
        it('should have default knowledgeReserve from config', () => {
            expect(proxySettings.knowledgeReserve).toBe(0.15);
        });

        it('should have default knowledgeMinReserve from config', () => {
            expect(proxySettings.knowledgeMinReserve).toBe(0.05);
        });

        it('should have telegraphic disabled by default', () => {
            expect(proxySettings.telegraphicEnabled).toBe(false);
        });

        it('should have default model profile as medium', () => {
            expect(proxySettings.defaultModelProfile).toBe('medium');
        });

        it('should have tool calling disabled by default', () => {
            expect(proxySettings.toolCallingEnabled).toBe(false);
            expect(proxySettings.toolCallingMode).toBe('read-only');
            expect(proxySettings.toolCallingMaxIterations).toBe(5);
            expect(proxySettings.toolCallingStrategy).toBe('complement');
        });
    });

    // -----------------------------------------------------------------------
    // ensureProxySettings
    // -----------------------------------------------------------------------
    describe('ensureProxySettings', () => {
        // Note: these tests run in order within the module. The mock createCachedLoader
        // passes through to the real loadFn each time, and loadFn spreads the current
        // module-level proxySettings. Because ensureProxySettings mutates the module
        // variable, state accumulates across tests.

        it('should keep defaults when no DB row exists', async () => {
            mockQueryOne.mockResolvedValue(undefined);

            await ensureProxySettings();

            const mod = await import('../../proxy/knowledge.js');
            // No saved row → loadFn returns { ...proxySettings } (the defaults)
            expect(mod.proxySettings.knowledgeReserve).toBe(0.15);
            expect(mod.proxySettings.knowledgeMinReserve).toBe(0.05);
        });

        it('should keep defaults when DB query throws', async () => {
            mockQueryOne.mockRejectedValue(new Error('DB unavailable'));

            await ensureProxySettings();

            const mod = await import('../../proxy/knowledge.js');
            expect(mod.proxySettings.knowledgeMinReserve).toBeDefined();
            expect(typeof mod.proxySettings.knowledgeReserve).toBe('number');
        });

        it('should load settings from DB when row exists', async () => {
            mockQueryOne.mockResolvedValue({
                value: JSON.stringify({ knowledgeReserve: 0.25, telegraphicEnabled: true }),
            });

            await ensureProxySettings();

            const mod = await import('../../proxy/knowledge.js');
            expect(mod.proxySettings.knowledgeReserve).toBe(0.25);
            expect(mod.proxySettings.telegraphicEnabled).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // injectKnowledge
    // -----------------------------------------------------------------------
    describe('injectKnowledge', () => {
        const knowledgePrompt = 'Domain fact: X is Y.';

        it('should prepend knowledge to existing system message', () => {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello' },
            ];

            const result = injectKnowledge(messages, knowledgePrompt);

            expect(result).toHaveLength(2);
            expect(result[0].role).toBe('system');
            // Knowledge prepended before original system content
            expect(result[0].content).toContain(knowledgePrompt);
            expect(result[0].content).toContain('You are a helpful assistant.');
            // Knowledge appears before original content
            expect(result[0].content.indexOf(knowledgePrompt)).toBeLessThan(
                result[0].content.indexOf('You are a helpful assistant.')
            );
        });

        it('should add new system message when none exists', () => {
            const messages = [
                { role: 'user', content: 'Hello' },
            ];

            const result = injectKnowledge(messages, knowledgePrompt);

            expect(result).toHaveLength(2);
            expect(result[0].role).toBe('system');
            expect(result[0].content).toContain(knowledgePrompt);
            expect(result[1].role).toBe('user');
        });

        it('should use restrictive wrapper when clientHasTools is false (default)', () => {
            const messages = [{ role: 'user', content: 'Hi' }];

            const result = injectKnowledge(messages, knowledgePrompt);

            expect(result[0].content).toContain('PRIORITY INSTRUCTION');
            expect(result[0].content).toContain('Do NOT use tools');
        });

        it('should use passive wrapper when clientHasTools is true', () => {
            const messages = [{ role: 'user', content: 'Hi' }];

            const result = injectKnowledge(messages, knowledgePrompt, true);

            expect(result[0].content).toContain('knowledge-context');
            expect(result[0].content).toContain('Use it alongside your other capabilities');
            expect(result[0].content).not.toContain('PRIORITY INSTRUCTION');
            expect(result[0].content).not.toContain('Do NOT use tools');
        });

        it('should not mutate the original messages array', () => {
            const messages = [
                { role: 'system', content: 'Original' },
                { role: 'user', content: 'Hello' },
            ];
            const originalLength = messages.length;

            const result = injectKnowledge(messages, knowledgePrompt);

            expect(messages).toHaveLength(originalLength);
            expect(messages[0].content).toBe('Original');
            expect(result).not.toBe(messages);
        });

        it('should wrap knowledge in knowledge-context tags', () => {
            const messages = [{ role: 'user', content: 'Q' }];

            const result = injectKnowledge(messages, knowledgePrompt);

            expect(result[0].content).toContain('<knowledge-context>');
            expect(result[0].content).toContain('</knowledge-context>');
        });

        it('should handle empty messages array', () => {
            const result = injectKnowledge([], knowledgePrompt);

            expect(result).toHaveLength(1);
            expect(result[0].role).toBe('system');
            expect(result[0].content).toContain(knowledgePrompt);
        });
    });
});
