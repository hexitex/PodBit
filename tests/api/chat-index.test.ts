/**
 * API tests for routes/chat/index.ts
 *
 * Tests: POST /chat (legacy), POST /chat/conversations/:id/messages
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockHandleChatMessage = jest.fn<() => Promise<any>>().mockResolvedValue({
    response: 'Hello!',
    type: 'text',
});
const mockContextPrepare = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockContextUpdate = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetContextSession = jest.fn<() => any>().mockReturnValue(null);
const mockWarmUpSession = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEnsureChatSettings = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../context-engine.js', () => ({
    prepare: mockContextPrepare,
    update: mockContextUpdate,
    getSession: mockGetContextSession,
    warmUpSession: mockWarmUpSession,
}));

jest.unstable_mockModule('../../routes/chat/intents.js', () => ({
    handleChatMessage: mockHandleChatMessage,
}));

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    ensureChatSettings: mockEnsureChatSettings,
    chatSettings: {
        toolCallingEnabled: false,
        toolCallingMaxIterations: 3,
        toolCallingMode: 'read-write',
        maxKnowledgeNodes: 0,
        modelProfile: '',
    },
}));

jest.unstable_mockModule('../../routes/chat/crud.js', () => ({
    registerCrudRoutes: jest.fn<() => void>(),
}));

jest.unstable_mockModule('uuid', () => ({
    v4: () => 'test-uuid',
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: chatRouter } = await import('../../routes/chat/index.js');

/** Express app with JSON body parser and chat router mounted at /. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', chatRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockHandleChatMessage.mockResolvedValue({ response: 'Hello!', type: 'text' });
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockContextPrepare.mockResolvedValue(null);
    mockGetContextSession.mockReturnValue(null);
});

// =============================================================================
// POST /chat (legacy endpoint)
// =============================================================================

describe('POST /chat', () => {
    it('returns 400 when message is missing', async () => {
        const res = await request(buildApp()).post('/chat').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Message required');
    });

    it('returns response from handleChatMessage', async () => {
        mockHandleChatMessage.mockResolvedValue({ response: 'Got it!', type: 'text' });
        const res = await request(buildApp())
            .post('/chat')
            .send({ message: 'Hello' });
        expect(res.status).toBe(200);
        expect(res.body.response).toBe('Got it!');
        expect(res.body.type).toBe('text');
    });

    it('passes message, mode, and domains to handleChatMessage', async () => {
        await request(buildApp())
            .post('/chat')
            .send({ message: '/research AI', mode: 'mcp', domains: ['ai', 'safety'] });
        expect(mockHandleChatMessage).toHaveBeenCalledWith(
            '/research AI',
            'mcp',
            ['ai', 'safety'],
        );
    });

    it('defaults mode to api', async () => {
        await request(buildApp()).post('/chat').send({ message: 'hello' });
        expect(mockHandleChatMessage).toHaveBeenCalledWith('hello', 'api', undefined);
    });
});

// =============================================================================
// POST /chat/conversations/:id/messages
// =============================================================================

describe('POST /chat/conversations/:id/messages', () => {
    it('returns 400 when message is missing', async () => {
        const res = await request(buildApp())
            .post('/chat/conversations/conv-1/messages')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Message required');
    });

    it('returns 404 when conversation not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp())
            .post('/chat/conversations/missing-conv/messages')
            .send({ message: 'Hello' });
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Conversation not found');
    });

    it('returns response when conversation exists', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'conv-1',
            title: 'New Chat',
            session_id: 'sess-1',
            messages: '[]',
            scope_domains: null,
        });
        mockHandleChatMessage.mockResolvedValue({ response: 'AI response', type: 'text', metadata: {} });
        const res = await request(buildApp())
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'Hello' });
        expect(res.status).toBe(200);
        expect(res.body.response).toBe('AI response');
        expect(res.body.conversationId).toBe('conv-1');
    });

    it('auto-titles from first message', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'conv-1',
            title: 'New Chat',
            session_id: 'sess-1',
            messages: '[]',
            scope_domains: null,
        });
        mockHandleChatMessage.mockResolvedValue({ response: 'Hi', type: 'text', metadata: {} });
        const res = await request(buildApp())
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'Tell me about AI safety' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Tell me about AI safety');
    });

    it('parses scope_domains when present', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'conv-1',
            title: 'Chat',
            session_id: 'sess-1',
            messages: '[]',
            scope_domains: '["ai","safety"]',
        });
        mockHandleChatMessage.mockResolvedValue({ response: 'OK', type: 'text', metadata: {} });
        await request(buildApp())
            .post('/chat/conversations/conv-1/messages')
            .send({ message: 'test' });
        // handleChatMessage should be called with the parsed domains
        expect(mockHandleChatMessage).toHaveBeenCalledWith(
            'test',
            'api',
            ['ai', 'safety'],
            null,
            expect.any(Array),
        );
    });
});
