/**
 * Deep branch-coverage tests for routes/chat/index.ts
 * Covers uncovered branches:
 * - chatSettings.maxKnowledgeNodes > 0 prepareOpts
 * - chatSettings.modelProfile prepareOpts
 * - contextPrepare throw (warn & continue)
 * - contextUpdate fire-and-forget with sessionId
 * - contextUpdate catch branch
 * - Empty response with toolCalls fallback message
 * - Auto-title slash command stripping
 * - scope_domains parsing
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockContextPrepare = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockContextUpdate = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetContextSession = jest.fn<() => any>().mockReturnValue(null);
const mockWarmUpSession = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../context-engine.js', () => ({
    prepare: mockContextPrepare,
    update: mockContextUpdate,
    getSession: mockGetContextSession,
    warmUpSession: mockWarmUpSession,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockChatSettings = {
    toolCallingEnabled: false,
    maxKnowledgeNodes: 0,
    modelProfile: '',
};

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../routes/chat/crud.js', () => ({
    registerCrudRoutes: (_router: any) => { /* no-op */ },
}));

const mockHandleChatMessage = jest.fn<() => Promise<any>>().mockResolvedValue({
    response: 'assistant reply',
    type: 'text',
    metadata: {},
});

jest.unstable_mockModule('../../routes/chat/intents.js', () => ({
    handleChatMessage: mockHandleChatMessage,
}));

const chatRouter = (await import('../../routes/chat/index.js')).default;

const app = express();
app.use(express.json());
app.use(chatRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

const mockConv = {
    id: 'conv-1',
    title: 'New Chat',
    session_id: 'sess-1',
    messages: JSON.stringify([]),
    scope_domains: null,
    action_mode: 'research',
};

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockContextPrepare.mockResolvedValue(null);
    mockContextUpdate.mockResolvedValue(undefined);
    mockGetContextSession.mockReturnValue(null);
    mockWarmUpSession.mockResolvedValue(undefined);
    mockHandleChatMessage.mockResolvedValue({
        response: 'assistant reply',
        type: 'text',
        metadata: {},
    });
    Object.assign(mockChatSettings, { toolCallingEnabled: false, maxKnowledgeNodes: 0, modelProfile: '' });
});

// =============================================================================
// chatSettings prepareOpts branches
// =============================================================================

describe('POST /chat/conversations/:id/messages — prepareOpts from chatSettings', () => {
    it('passes maxNodes when maxKnowledgeNodes > 0', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        Object.assign(mockChatSettings, { maxKnowledgeNodes: 10 });
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1' });
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        expect(mockContextPrepare).toHaveBeenCalledWith(
            'test',
            'sess-1',
            expect.objectContaining({ maxNodes: 10 })
        );
    });

    it('passes modelProfile when set', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        Object.assign(mockChatSettings, { modelProfile: 'small' });
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1' });
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        expect(mockContextPrepare).toHaveBeenCalledWith(
            'test',
            'sess-1',
            expect.objectContaining({ modelProfile: 'small' })
        );
    });

    it('passes both maxNodes and modelProfile when both set', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        Object.assign(mockChatSettings, { maxKnowledgeNodes: 5, modelProfile: 'large' });
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1' });
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        expect(mockContextPrepare).toHaveBeenCalledWith(
            'test',
            'sess-1',
            expect.objectContaining({ maxNodes: 5, modelProfile: 'large' })
        );
    });

    it('passes empty prepareOpts when both are falsy', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        Object.assign(mockChatSettings, { maxKnowledgeNodes: 0, modelProfile: '' });
        mockContextPrepare.mockResolvedValue(null);
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        // Should be called with empty object (no maxNodes, no modelProfile)
        const opts = mockContextPrepare.mock.calls[0][2];
        expect(opts).not.toHaveProperty('maxNodes');
        expect(opts).not.toHaveProperty('modelProfile');
    });
});

// =============================================================================
// contextPrepare failure (catch branch)
// =============================================================================

describe('POST /chat/conversations/:id/messages — contextPrepare failure', () => {
    it('continues without context when contextPrepare throws', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockRejectedValue(new Error('context engine down'));
        mockHandleChatMessage.mockResolvedValue({ response: 'still works', type: 'text', metadata: {} });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        expect(res.status).toBe(200);
        expect(res.body.response).toBe('still works');
        expect(res.body.context).toBeNull();
    });
});

// =============================================================================
// contextUpdate fire-and-forget
// =============================================================================

describe('POST /chat/conversations/:id/messages — contextUpdate', () => {
    it('calls contextUpdate when ctxResult has sessionId and response exists', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1', knowledge: [], topics: [] });
        mockHandleChatMessage.mockResolvedValue({ response: 'hello', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        // Give fire-and-forget a tick to execute
        await new Promise(r => setTimeout(r, 50));

        expect(mockContextUpdate).toHaveBeenCalledWith('sess-1', 'hello');
    });

    it('does not call contextUpdate when ctxResult is null', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockResolvedValue(null);
        mockHandleChatMessage.mockResolvedValue({ response: 'hello', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        await new Promise(r => setTimeout(r, 50));
        expect(mockContextUpdate).not.toHaveBeenCalled();
    });

    it('does not call contextUpdate when response is empty', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1' });
        mockHandleChatMessage.mockResolvedValue({ response: '', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        await new Promise(r => setTimeout(r, 50));
        expect(mockContextUpdate).not.toHaveBeenCalled();
    });

    it('handles contextUpdate rejection gracefully (fire-and-forget catch)', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockResolvedValue({ sessionId: 'sess-1' });
        mockContextUpdate.mockRejectedValue(new Error('update failed'));
        mockHandleChatMessage.mockResolvedValue({ response: 'hello', type: 'text', metadata: {} });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        // Should not affect the response
        expect(res.status).toBe(200);
        await new Promise(r => setTimeout(r, 50));
    });
});

// =============================================================================
// Empty response with toolCalls fallback
// =============================================================================

describe('POST /chat/conversations/:id/messages — empty response handling', () => {
    it('generates fallback message when response is empty but toolCalls exist', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockHandleChatMessage.mockResolvedValue({
            response: '',
            type: 'tool',
            metadata: {
                toolCalls: [
                    { name: 'graph_query', args: {}, durationMs: 50 },
                    { name: 'compress', args: {}, durationMs: 100 },
                ],
            },
        });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'search something' });

        expect(res.status).toBe(200);
        expect(res.body.response).toContain('2 tool calls');
    });

    it('does not generate fallback when response is empty and no toolCalls', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockHandleChatMessage.mockResolvedValue({
            response: '',
            type: 'text',
            metadata: {},
        });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'hello' });

        expect(res.status).toBe(200);
        // response should still be empty (or undefined)
        expect(res.body.response || '').toBe('');
    });

    it('persists toolCalls on assistant message when present', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockHandleChatMessage.mockResolvedValue({
            response: 'Found results',
            type: 'tool',
            metadata: {
                toolCalls: [{ name: 'query', args: {}, durationMs: 10 }],
            },
        });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'search' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        const persistedMessages = JSON.parse(updateCall[1][0]);
        const assistantMsg = persistedMessages.find((m: any) => m.role === 'assistant');
        expect(assistantMsg.toolCalls).toHaveLength(1);
    });
});

// =============================================================================
// Auto-title slash command stripping
// =============================================================================

describe('POST /chat/conversations/:id/messages — auto-title', () => {
    it('strips slash command prefix from auto-title', async () => {
        mockQueryOne.mockResolvedValue({ ...mockConv, messages: '[]', title: 'New Chat' });
        mockHandleChatMessage.mockResolvedValue({ response: 'Answer.', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: '/search what is quantum computing' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        const newTitle = updateCall[1][1];
        expect(newTitle).not.toContain('/search');
        expect(newTitle).toContain('quantum computing');
    });

    it('falls back to full message slice when slash command strip leaves empty', async () => {
        mockQueryOne.mockResolvedValue({ ...mockConv, messages: '[]', title: 'New Chat' });
        mockHandleChatMessage.mockResolvedValue({ response: 'Answer.', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: '/help' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        const newTitle = updateCall[1][1];
        // When stripped result is empty, it falls back to message.slice(0, 60)
        expect(newTitle).toBe('/help');
    });

    it('does not change title when conversation already has messages', async () => {
        const existingMsgs = [
            { role: 'user', content: 'first msg' },
            { role: 'assistant', content: 'first reply' },
        ];
        mockQueryOne.mockResolvedValue({
            ...mockConv,
            messages: JSON.stringify(existingMsgs),
            title: 'Existing Title',
        });
        mockGetContextSession.mockReturnValue({ sessionId: 'sess-1' }); // warm session
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'second message' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        const title = updateCall[1][1];
        expect(title).toBe('Existing Title');
    });
});

// =============================================================================
// scope_domains parsing
// =============================================================================

describe('POST /chat/conversations/:id/messages — scope_domains', () => {
    it('parses scope_domains JSON and passes to handleChatMessage', async () => {
        mockQueryOne.mockResolvedValue({
            ...mockConv,
            scope_domains: JSON.stringify(['physics', 'math']),
        });
        mockHandleChatMessage.mockResolvedValue({ response: 'ok', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });

        // 4th arg is ctxResult (null since contextPrepare defaults to null),
        // 5th arg is the messages array
        expect(mockHandleChatMessage).toHaveBeenCalledWith(
            'test', 'api',
            ['physics', 'math'],
            null,
            expect.any(Array)
        );
    });
});
