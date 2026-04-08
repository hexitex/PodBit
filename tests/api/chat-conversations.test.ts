/**
 * API tests for routes/chat/crud.ts
 *
 * Tests: GET /chat/conversations, POST /chat/conversations,
 *        GET /chat/conversations/:id (404), PUT /chat/conversations/:id,
 *        DELETE /chat/conversations/:id
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('uuid', () => ({
    v4: () => 'test-uuid',
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { registerCrudRoutes } = await import('../../routes/chat/crud.js');

/** Express app with chat CRUD router mounted at /. */
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerCrudRoutes(router);
    app.use('/', router);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// GET /chat/conversations
// =============================================================================

describe('GET /chat/conversations', () => {
    it('returns conversations array', async () => {
        mockQuery.mockResolvedValue([]);
        const res = await request(buildApp()).get('/chat/conversations');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('conversations');
        expect(Array.isArray(res.body.conversations)).toBe(true);
    });

    it('maps DB rows to conversation objects', async () => {
        mockQuery.mockResolvedValue([{
            id: 'conv-1',
            title: 'Test',
            session_id: 'sess-1',
            scope_partition: null,
            scope_domains: null,
            action_mode: 'research',
            messages: '["msg1","msg2"]',
            created_at: '2024-01-01',
            updated_at: '2024-01-02',
        }]);
        const res = await request(buildApp()).get('/chat/conversations');
        expect(res.body.conversations).toHaveLength(1);
        expect(res.body.conversations[0].id).toBe('conv-1');
        expect(res.body.conversations[0].messageCount).toBe(2);
        expect(res.body.conversations[0].scopeDomains).toEqual([]);
    });

    it('parses scope_domains JSON', async () => {
        mockQuery.mockResolvedValue([{
            id: 'c-1',
            title: 'T',
            session_id: 's-1',
            scope_partition: 'p-1',
            scope_domains: '["domain-a","domain-b"]',
            action_mode: 'research',
            messages: '[]',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
        }]);
        const res = await request(buildApp()).get('/chat/conversations');
        expect(res.body.conversations[0].scopeDomains).toEqual(['domain-a', 'domain-b']);
    });
});

// =============================================================================
// POST /chat/conversations
// =============================================================================

describe('POST /chat/conversations', () => {
    it('creates conversation and returns id', async () => {
        const res = await request(buildApp())
            .post('/chat/conversations')
            .send({ title: 'My Chat' });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('test-uuid');
        expect(res.body.sessionId).toBe('test-uuid');
        expect(res.body.title).toBe('My Chat');
    });

    it('defaults title to New Chat when not provided', async () => {
        const res = await request(buildApp())
            .post('/chat/conversations')
            .send({});
        expect(res.body.title).toBe('New Chat');
    });

    it('defaults actionMode to research', async () => {
        const res = await request(buildApp())
            .post('/chat/conversations')
            .send({});
        expect(res.body.actionMode).toBe('research');
    });

    it('passes scopePartition and scopeDomains', async () => {
        const res = await request(buildApp())
            .post('/chat/conversations')
            .send({ scopePartition: 'p-1', scopeDomains: ['d1'], actionMode: 'chat' });
        expect(res.body.scopePartition).toBe('p-1');
        expect(res.body.scopeDomains).toEqual(['d1']);
        expect(res.body.actionMode).toBe('chat');
    });
});

// =============================================================================
// GET /chat/conversations/:id
// =============================================================================

describe('GET /chat/conversations/:id', () => {
    it('returns 404 when conversation not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const res = await request(buildApp()).get('/chat/conversations/missing-id');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Conversation not found');
    });

    it('returns conversation when found', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'conv-1',
            title: 'Test',
            session_id: 'sess-1',
            messages: '[{"role":"user","content":"hi"}]',
            scope_partition: null,
            scope_domains: null,
            action_mode: 'research',
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
        });
        const res = await request(buildApp()).get('/chat/conversations/conv-1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('conv-1');
        expect(res.body.messages).toHaveLength(1);
        expect(res.body.messages[0].role).toBe('user');
    });
});

// =============================================================================
// PUT /chat/conversations/:id
// =============================================================================

describe('PUT /chat/conversations/:id', () => {
    it('returns 400 when no fields provided', async () => {
        const res = await request(buildApp())
            .put('/chat/conversations/conv-1')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('No fields to update');
    });

    it('updates title and returns ok', async () => {
        const res = await request(buildApp())
            .put('/chat/conversations/conv-1')
            .send({ title: 'New Title' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockQuery).toHaveBeenCalled();
    });

    it('can archive a conversation', async () => {
        const res = await request(buildApp())
            .put('/chat/conversations/conv-1')
            .send({ archived: true });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

// =============================================================================
// DELETE /chat/conversations/:id
// =============================================================================

describe('DELETE /chat/conversations/:id', () => {
    it('soft-deletes and returns ok', async () => {
        const res = await request(buildApp()).delete('/chat/conversations/conv-1');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('archived = 1'),
            ['conv-1']
        );
    });
});
