/**
 * Unit tests for routes/chat/index.ts —
 * POST /chat (legacy), POST /chat/conversations/:id/messages.
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
    modelProfile: null,
};

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// crud.js — registers CRUD routes
jest.unstable_mockModule('../../routes/chat/crud.js', () => ({
    registerCrudRoutes: (_router: any) => { /* no-op */ },
}));

// intents.js — handleChatMessage
const mockHandleChatMessage = jest.fn<() => Promise<any>>().mockResolvedValue({
    response: 'assistant reply',
    type: 'text',
    metadata: {},
});

jest.unstable_mockModule('../../routes/chat/intents.js', () => ({
    handleChatMessage: mockHandleChatMessage,
}));

const chatRouter = (await import('../../routes/chat/index.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(chatRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
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
    Object.assign(mockChatSettings, { toolCallingEnabled: false, maxKnowledgeNodes: 0, modelProfile: null });
});

// =============================================================================
// POST /chat (legacy)
// =============================================================================

describe('POST /chat (legacy)', () => {
    it('returns 400 when message is missing', async () => {
        const res = await request(app).post('/chat').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Message required');
    });

    it('routes message to handleChatMessage and returns response', async () => {
        mockHandleChatMessage.mockResolvedValue({
            response: 'Hello back!',
            type: 'text',
        });

        const res = await request(app).post('/chat').send({
            message: 'hello',
            mode: 'api',
        });

        expect(res.status).toBe(200);
        expect(res.body.response).toBe('Hello back!');
        expect(mockHandleChatMessage).toHaveBeenCalledWith('hello', 'api', undefined);
    });

    it('passes domains to handleChatMessage', async () => {
        await request(app).post('/chat').send({
            message: 'research topic',
            mode: 'api',
            domains: ['science', 'math'],
        });

        expect(mockHandleChatMessage).toHaveBeenCalledWith('research topic', 'api', ['science', 'math']);
    });

    it('defaults mode to api', async () => {
        await request(app).post('/chat').send({ message: 'hello' });

        expect(mockHandleChatMessage).toHaveBeenCalledWith('hello', 'api', undefined);
    });
});

// =============================================================================
// POST /chat/conversations/:id/messages
// =============================================================================

describe('POST /chat/conversations/:id/messages', () => {
    const mockConv = {
        id: 'conv-1',
        title: 'New Chat',
        session_id: 'sess-1',
        messages: JSON.stringify([]),
        scope_domains: null,
        action_mode: 'research',
    };

    it('returns 400 when message is missing', async () => {
        mockQueryOne.mockResolvedValue(mockConv);

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Message required');
    });

    it('returns 404 when conversation not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app)
            .post('/chat/conversations/nonexistent/messages')
            .send({ message: 'hello' });

        expect(res.status).toBe(404);
    });

    it('routes message through handleChatMessage and persists result', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockHandleChatMessage.mockResolvedValue({
            response: 'The answer is 42.',
            type: 'text',
            metadata: {},
        });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'what is the answer?' });

        expect(res.status).toBe(200);
        expect(res.body.response).toBe('The answer is 42.');
        expect(res.body.conversationId).toBe('conv-1');

        // Messages should be persisted to DB
        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        expect(updateCall).toBeDefined();
    });

    it('auto-titles from first message', async () => {
        mockQueryOne.mockResolvedValue({ ...mockConv, messages: '[]', title: 'New Chat' });
        mockHandleChatMessage.mockResolvedValue({ response: 'Answer.', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'what is photosynthesis and how does it work?' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        // Title should be trimmed version of message
        const newTitle = updateCall[1][1];
        expect(newTitle.length).toBeLessThanOrEqual(60);
    });

    it('warm-starts context session when messages exist and session is cold', async () => {
        const existingMessages = [
            { role: 'user', content: 'prior message' },
            { role: 'assistant', content: 'prior response' },
        ];
        mockQueryOne.mockResolvedValue({
            ...mockConv,
            messages: JSON.stringify(existingMessages),
        });
        mockGetContextSession.mockReturnValue(null); // cold session
        mockHandleChatMessage.mockResolvedValue({ response: 'OK', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'follow up' });

        // warmUpSession called with sessionId and the prior messages
        // (array is mutated after the call, so we check sessionId only)
        expect(mockWarmUpSession).toHaveBeenCalledTimes(1);
        expect(mockWarmUpSession.mock.calls[0][0]).toBe('sess-1');
    });

    it('does not warm-start when session is already active', async () => {
        mockQueryOne.mockResolvedValue({
            ...mockConv,
            messages: JSON.stringify([{ role: 'user', content: 'hi' }]),
        });
        mockGetContextSession.mockReturnValue({ sessionId: 'sess-1' }); // warm
        mockHandleChatMessage.mockResolvedValue({ response: 'OK', type: 'text', metadata: {} });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'follow up' });

        expect(mockWarmUpSession).not.toHaveBeenCalled();
    });

    it('includes context metadata in response when ctxResult available', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockContextPrepare.mockResolvedValue({
            sessionId: 'sess-1',
            knowledge: [{ id: 'k1', content: 'knowledge' }],
            topics: ['science'],
            domains: ['science'],
            intent: 'retrieval',
            turnCount: 1,
            budget: { total: 1000, used: 200 },
        });
        mockHandleChatMessage.mockResolvedValue({ response: 'Enriched answer', type: 'text', metadata: {} });

        const res = await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'tell me about science' });

        expect(res.status).toBe(200);
        expect(res.body.context).not.toBeNull();
        expect(res.body.context.sessionId).toBe('sess-1');
    });

    it('appends tool findings to persisted message content', async () => {
        mockQueryOne.mockResolvedValue(mockConv);
        mockHandleChatMessage.mockResolvedValue({
            response: 'Based on search results...',
            type: 'text',
            metadata: {
                toolCalls: [{ name: 'graph_query', args: {}, durationMs: 50 }],
                toolContext: 'Key finding: photosynthesis converts light to glucose',
            },
        });

        await request(app)
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'search science' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE chat_conversations')
        );
        const persistedMessages = JSON.parse(updateCall[1][0]);
        const assistantMsg = persistedMessages.find((m: any) => m.role === 'assistant');
        expect(assistantMsg.content).toContain('tool-findings');
        expect(assistantMsg.content).toContain('photosynthesis');
    });
});
