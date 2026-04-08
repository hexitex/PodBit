/**
 * Unit tests for proxy/model-resolution.ts
 *
 * Covers: profileFromContextSize, estimateTokens, resolveModel (4-priority chain),
 * registeredToModelEntry, resolveSessionId (4-priority derivation), PROFILE_CONTEXT_WINDOWS.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock: models.js
// ---------------------------------------------------------------------------
const mockExtractTextContent = jest.fn<(c: any) => string>().mockImplementation(
    (c: any) => (typeof c === 'string' ? c : '')
);
const mockGetRegisteredModels = jest.fn<() => Promise<any[]>>();
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../models.js', () => ({
    extractTextContent: mockExtractTextContent,
    getRegisteredModels: mockGetRegisteredModels,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

// Import after mocking
const {
    profileFromContextSize,
    estimateTokens,
    resolveModel,
    registeredToModelEntry,
    resolveSessionId,
    PROFILE_CONTEXT_WINDOWS,
} = await import('../../proxy/model-resolution.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(overrides: Record<string, any> = {}) {
    return {
        id: 'reg-1',
        name: 'Test Model',
        provider: 'openai',
        modelId: 'gpt-4',
        tier: 'tier2',
        endpointUrl: null,
        apiKey: null,
        enabled: true,
        maxTokens: 4096,
        contextSize: 128000,
        costPer1k: 0,
        inputCostPerMtok: 30,
        outputCostPerMtok: 60,
        toolCostPerMtok: 0,
        sortOrder: 0,
        maxRetries: 3,
        retryWindowMinutes: 5,
        maxConcurrency: 4,
        requestPauseMs: 100,
        requestTimeout: 30000,
        rateLimitBackoffMs: 120000,
        supportsTools: true,
        noThink: false,
        thinkingLevel: null,
        ...overrides,
    };
}

function makeReq(headers: Record<string, string> = {}): any {
    return { headers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('proxy/model-resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =====================================================================
    // PROFILE_CONTEXT_WINDOWS
    // =====================================================================

    describe('PROFILE_CONTEXT_WINDOWS', () => {
        it('has all five profiles', () => {
            expect(PROFILE_CONTEXT_WINDOWS).toEqual({
                micro: 2048,
                small: 4096,
                medium: 16000,
                large: 65000,
                xl: 128000,
            });
        });
    });

    // =====================================================================
    // profileFromContextSize
    // =====================================================================

    describe('profileFromContextSize', () => {
        it('returns micro for <= 4096', () => {
            expect(profileFromContextSize(0)).toBe('micro');
            expect(profileFromContextSize(1024)).toBe('micro');
            expect(profileFromContextSize(4096)).toBe('micro');
        });

        it('returns small for 4097..8192', () => {
            expect(profileFromContextSize(4097)).toBe('small');
            expect(profileFromContextSize(8192)).toBe('small');
        });

        it('returns medium for 8193..32768', () => {
            expect(profileFromContextSize(8193)).toBe('medium');
            expect(profileFromContextSize(32768)).toBe('medium');
        });

        it('returns large for 32769..131072', () => {
            expect(profileFromContextSize(32769)).toBe('large');
            expect(profileFromContextSize(131072)).toBe('large');
        });

        it('returns xl for > 131072', () => {
            expect(profileFromContextSize(131073)).toBe('xl');
            expect(profileFromContextSize(1_000_000)).toBe('xl');
        });
    });

    // =====================================================================
    // estimateTokens
    // =====================================================================

    describe('estimateTokens', () => {
        it('returns 0 tokens for empty array', () => {
            expect(estimateTokens([])).toBe(0);
        });

        it('estimates tokens from string content via extractTextContent', () => {
            mockExtractTextContent.mockReturnValue('hello world'); // 11 chars
            const result = estimateTokens([{ role: 'user', content: 'hello world' }]);
            // (11 + 20) / 3 = 10.333... => ceil => 11
            expect(result).toBe(11);
            expect(mockExtractTextContent).toHaveBeenCalledWith('hello world');
        });

        it('sums across multiple messages', () => {
            mockExtractTextContent
                .mockReturnValueOnce('abc')   // 3 chars
                .mockReturnValueOnce('defgh'); // 5 chars
            const result = estimateTokens([
                { role: 'system', content: 'abc' },
                { role: 'user', content: 'defgh' },
            ]);
            // (3+20 + 5+20) / 3 = 48/3 = 16
            expect(result).toBe(16);
        });

        it('handles non-string content via mock', () => {
            mockExtractTextContent.mockReturnValue('');
            const result = estimateTokens([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
            // (0 + 20) / 3 = 6.67 => 7
            expect(result).toBe(7);
        });
    });

    // =====================================================================
    // registeredToModelEntry
    // =====================================================================

    describe('registeredToModelEntry', () => {
        it('maps all fields correctly', () => {
            const model = makeModel({
                modelId: 'claude-3',
                provider: 'anthropic',
                endpointUrl: 'https://api.example.com',
                apiKey: 'sk-123',
                noThink: true,
                inputCostPerMtok: 15,
                outputCostPerMtok: 75,
                toolCostPerMtok: 5,
                contextSize: 200000,
                maxConcurrency: 8,
                requestPauseMs: 50,
            });

            const result = registeredToModelEntry(model);

            expect(result).toEqual({
                name: 'claude-3',
                provider: 'anthropic',
                model: 'claude-3',
                endpoint: 'https://api.example.com',
                apiKey: 'sk-123',
                noThink: true,
                inputCostPerMtok: 15,
                outputCostPerMtok: 75,
                toolCostPerMtok: 5,
                contextSize: 200000,
                _registryModel: model,
                _registryId: model.id,
                _maxConcurrency: 8,
                _requestPauseMs: 50,
            });
        });

        it('converts empty endpointUrl and apiKey to undefined', () => {
            const model = makeModel({ endpointUrl: '', apiKey: '' });
            const result = registeredToModelEntry(model);
            expect(result.endpoint).toBeUndefined();
            expect(result.apiKey).toBeUndefined();
        });

        it('converts null endpointUrl and apiKey to undefined', () => {
            const model = makeModel({ endpointUrl: null, apiKey: null });
            const result = registeredToModelEntry(model);
            expect(result.endpoint).toBeUndefined();
            expect(result.apiKey).toBeUndefined();
        });

        it('defaults noThink to false when falsy', () => {
            const model = makeModel({ noThink: undefined });
            const result = registeredToModelEntry(model);
            expect(result.noThink).toBe(false);
        });

        it('defaults maxConcurrency to 1 when null', () => {
            const model = makeModel({ maxConcurrency: null });
            const result = registeredToModelEntry(model);
            expect(result._maxConcurrency).toBe(1);
        });

        it('defaults requestPauseMs to 0 when null', () => {
            const model = makeModel({ requestPauseMs: null });
            const result = registeredToModelEntry(model);
            expect(result._requestPauseMs).toBe(0);
        });
    });

    // =====================================================================
    // resolveModel
    // =====================================================================

    describe('resolveModel', () => {
        const proxyModel = makeModel({ modelId: 'proxy-model', name: 'Proxy Model' });
        const chatModel = makeModel({ modelId: 'chat-model', name: 'Chat Model' });

        it('Priority 1: uses proxy subsystem assignment', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: proxyModel });

            const result = await resolveModel('anything');
            expect(result.name).toBe('proxy-model');
            // Should not call getRegisteredModels when proxy assignment exists
            expect(mockGetRegisteredModels).not.toHaveBeenCalled();
        });

        it('Priority 1: uses proxy assignment even without requestedModel', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: proxyModel });

            const result = await resolveModel();
            expect(result.name).toBe('proxy-model');
        });

        it('Priority 2: matches by modelId (exact)', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: null });
            const matchModel = makeModel({ modelId: 'gpt-4-turbo', name: 'GPT-4 Turbo' });
            mockGetRegisteredModels.mockResolvedValue([matchModel]);

            const result = await resolveModel('gpt-4-turbo');
            expect(result.name).toBe('gpt-4-turbo');
        });

        it('Priority 2: matches by name (case-insensitive)', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: null });
            const matchModel = makeModel({ modelId: 'gpt-4', name: 'GPT Four' });
            mockGetRegisteredModels.mockResolvedValue([matchModel]);

            const result = await resolveModel('gpt four');
            expect(result.name).toBe('gpt-4');
        });

        it('Priority 2: matches by registry id', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: null });
            const matchModel = makeModel({ id: 'uuid-abc', modelId: 'model-x', name: 'Model X' });
            mockGetRegisteredModels.mockResolvedValue([matchModel]);

            const result = await resolveModel('uuid-abc');
            expect(result.name).toBe('model-x');
        });

        it('Priority 2: skips disabled models', async () => {
            mockGetSubsystemAssignments.mockResolvedValue({ proxy: null, chat: chatModel });
            const disabledModel = makeModel({ modelId: 'gpt-4', enabled: false });
            mockGetRegisteredModels.mockResolvedValue([disabledModel]);

            const result = await resolveModel('gpt-4');
            // No match in registry (disabled) -> falls through to chat assignment
            expect(result.name).toBe('chat-model');
        });

        it('Priority 2: skips when requestedModel is "default"', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })   // P1
                .mockResolvedValueOnce({ chat: chatModel }); // P3
            mockGetRegisteredModels.mockResolvedValue([makeModel()]);

            const result = await resolveModel('default');
            // Should not try to match 'default' against registry
            expect(result.name).toBe('chat-model');
        });

        it('Priority 2: skips when requestedModel is undefined', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })
                .mockResolvedValueOnce({ chat: chatModel });

            const result = await resolveModel(undefined);
            expect(result.name).toBe('chat-model');
        });

        it('Priority 3: falls back to chat subsystem assignment', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })    // P1
                .mockResolvedValueOnce({ chat: chatModel }); // P3
            mockGetRegisteredModels.mockResolvedValue([]);   // P2: no match

            const result = await resolveModel('nonexistent');
            expect(result.name).toBe('chat-model');
        });

        it('Priority 4: first enabled model from registry', async () => {
            const firstEnabled = makeModel({ modelId: 'fallback-model', name: 'Fallback' });
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })
                .mockResolvedValueOnce({ chat: null });
            mockGetRegisteredModels
                .mockResolvedValueOnce([])           // P2: no match
                .mockResolvedValueOnce([firstEnabled]); // P4: first enabled

            const result = await resolveModel('nonexistent');
            expect(result.name).toBe('fallback-model');
        });

        it('throws when no models available at all', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })
                .mockResolvedValueOnce({ chat: null });
            mockGetRegisteredModels
                .mockResolvedValueOnce([])  // P2
                .mockResolvedValueOnce([]); // P4

            await expect(resolveModel('anything')).rejects.toThrow(
                'No models available. Configure models in the model registry first.'
            );
        });

        it('handles error in P1 gracefully and continues', async () => {
            mockGetSubsystemAssignments
                .mockRejectedValueOnce(new Error('DB down'))  // P1 fails
                .mockResolvedValueOnce({ chat: chatModel });   // P3
            mockGetRegisteredModels.mockResolvedValue([]);      // P2 no match

            const result = await resolveModel('test');
            expect(result.name).toBe('chat-model');
        });

        it('handles error in P2 gracefully and continues', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })        // P1 no proxy
                .mockResolvedValueOnce({ chat: chatModel });   // P3
            mockGetRegisteredModels.mockRejectedValueOnce(new Error('DB read fail'));

            const result = await resolveModel('test-model');
            expect(result.name).toBe('chat-model');
        });

        it('handles error in P3 gracefully and continues to P4', async () => {
            const fallback = makeModel({ modelId: 'last-resort' });
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })            // P1
                .mockRejectedValueOnce(new Error('P3 error'));     // P3 fails
            mockGetRegisteredModels
                .mockResolvedValueOnce([])           // P2 no match
                .mockResolvedValueOnce([fallback]);  // P4

            const result = await resolveModel('nope');
            expect(result.name).toBe('last-resort');
        });

        it('handles error in P4 gracefully and throws final error', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })
                .mockResolvedValueOnce({ chat: null });
            mockGetRegisteredModels
                .mockResolvedValueOnce([])                          // P2
                .mockRejectedValueOnce(new Error('P4 DB crash'));   // P4 fails

            await expect(resolveModel('x')).rejects.toThrow(
                'No models available'
            );
        });

        it('resolveModel with no argument and no proxy uses chat', async () => {
            mockGetSubsystemAssignments
                .mockResolvedValueOnce({ proxy: null })
                .mockResolvedValueOnce({ chat: chatModel });

            const result = await resolveModel();
            expect(result.name).toBe('chat-model');
        });
    });

    // =====================================================================
    // resolveSessionId
    // =====================================================================

    describe('resolveSessionId', () => {
        it('Priority 1: uses X-Session-Id header', () => {
            const req = makeReq({ 'x-session-id': 'my-session-42' });
            const result = resolveSessionId(req, [], undefined);
            expect(result).toBe('proxy:my-session-42');
        });

        it('Priority 1: ignores non-string header (array)', () => {
            // express can return string[] for duplicate headers
            const req = { headers: { 'x-session-id': ['a', 'b'] } } as any;
            const result = resolveSessionId(req, [], 'fallback-user');
            // Should NOT match Priority 1 since typeof is not string
            expect(result).toBe('proxy:user:fallback-user');
        });

        it('Priority 2: uses user field', () => {
            const req = makeReq({});
            const result = resolveSessionId(req, [], 'alice');
            expect(result).toBe('proxy:user:alice');
        });

        it('Priority 2: ignores empty user string', () => {
            const req = makeReq({});
            const messages = [{ role: 'system', content: 'You are helpful.' }];
            const result = resolveSessionId(req, messages, '');
            // Empty string is falsy -> skip to P3
            expect(result).toMatch(/^proxy:sys:/);
        });

        it('Priority 3: hashes system message content', () => {
            const req = makeReq({});
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello' },
            ];
            const result = resolveSessionId(req, messages, undefined);
            expect(result).toMatch(/^proxy:sys:[0-9a-f]{12}$/);
        });

        it('Priority 3: produces consistent hash for same content', () => {
            const req = makeReq({});
            const messages = [{ role: 'system', content: 'Same system prompt' }];
            const r1 = resolveSessionId(req, messages, undefined);
            const r2 = resolveSessionId(req, messages, undefined);
            expect(r1).toBe(r2);
        });

        it('Priority 3: produces different hash for different content', () => {
            const req = makeReq({});
            const r1 = resolveSessionId(req, [{ role: 'system', content: 'prompt A' }], undefined);
            const r2 = resolveSessionId(req, [{ role: 'system', content: 'prompt B' }], undefined);
            expect(r1).not.toBe(r2);
        });

        it('Priority 3: skips system message with no content', () => {
            const req = makeReq({});
            const messages = [{ role: 'system', content: '' }];
            const result = resolveSessionId(req, messages, undefined);
            // Empty content is falsy -> skip to P4 (random UUID)
            expect(result).toMatch(/^proxy:[0-9a-f-]+$/);
        });

        it('Priority 4: random UUID when no other source', () => {
            const req = makeReq({});
            const result = resolveSessionId(req, [{ role: 'user', content: 'hi' }], undefined);
            // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
            expect(result).toMatch(/^proxy:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        });

        it('Priority 4: each call produces a different UUID', () => {
            const req = makeReq({});
            const msgs = [{ role: 'user', content: 'hi' }];
            const r1 = resolveSessionId(req, msgs, undefined);
            const r2 = resolveSessionId(req, msgs, undefined);
            expect(r1).not.toBe(r2);
        });
    });
});
