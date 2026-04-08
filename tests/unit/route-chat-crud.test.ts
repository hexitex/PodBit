/**
 * Unit tests for routes/chat/crud.ts —
 * GET /chat/conversations, POST, GET /:id, PUT /:id, DELETE /:id
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

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.unstable_mockModule('uuid', () => ({
    v4: () => 'test-uuid-1234',
}));

const { registerCrudRoutes } = await import('../../routes/chat/crud.js');

// Build test app
const app = express();
app.use(express.json());
const router = express.Router();
registerCrudRoutes(router);
app.use(router);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// GET /chat/conversations
// =============================================================================

describe('GET /chat/conversations', () => {
    it('returns empty array when no conversations exist', async () => {
        mockQuery.mockResolvedValue([]);

        const res = await request(app).get('/chat/conversations');

        expect(res.status).toBe(200);
        expect(res.body.conversations).toEqual([]);
    });

    it('maps DB rows to conversation objects', async () => {
        mockQuery.mockResolvedValue([
            {
                id: 'c1',
                title: 'My Chat',
                session_id: 'sess1',
                messages: JSON.stringify([{ role: 'user' }, { role: 'assistant' }]),
                scope_partition: 'p1',
                scope_domains: JSON.stringify(['d1', 'd2']),
                action_mode: 'research',
                created_at: '2024-01-01',
                updated_at: '2024-01-02',
            },
        ]);

        const res = await request(app).get('/chat/conversations');

        expect(res.status).toBe(200);
        expect(res.body.conversations).toHaveLength(1);
        const c = res.body.conversations[0];
        expect(c.id).toBe('c1');
        expect(c.title).toBe('My Chat');
        expect(c.sessionId).toBe('sess1');
        expect(c.messageCount).toBe(2);
        expect(c.scopePartition).toBe('p1');
        expect(c.scopeDomains).toEqual(['d1', 'd2']);
        expect(c.actionMode).toBe('research');
    });

    it('handles null scope_domains gracefully', async () => {
        mockQuery.mockResolvedValue([{
            id: 'c1', title: 'T', session_id: 's', messages: '[]',
            scope_partition: null, scope_domains: null, action_mode: 'research',
            created_at: '2024-01-01', updated_at: '2024-01-01',
        }]);

        const res = await request(app).get('/chat/conversations');

        expect(res.body.conversations[0].scopeDomains).toEqual([]);
    });

    it('handles invalid messages JSON gracefully (messageCount = 0)', async () => {
        mockQuery.mockResolvedValue([{
            id: 'c1', title: 'T', session_id: 's', messages: 'INVALID',
            scope_partition: null, scope_domains: null, action_mode: 'research',
            created_at: '2024-01-01', updated_at: '2024-01-01',
        }]);

        const res = await request(app).get('/chat/conversations');

        expect(res.body.conversations[0].messageCount).toBe(0);
    });
});

// =============================================================================
// POST /chat/conversations
// =============================================================================

describe('POST /chat/conversations', () => {
    it('creates a conversation with defaults', async () => {
        const res = await request(app).post('/chat/conversations').send({});

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('New Chat');
        expect(res.body.actionMode).toBe('research');
        expect(res.body.messages).toEqual([]);
        expect(res.body.scopeDomains).toEqual([]);
    });

    it('creates conversation with provided fields', async () => {
        const res = await request(app).post('/chat/conversations').send({
            title: 'My Session',
            scopePartition: 'partition1',
            scopeDomains: ['domain1', 'domain2'],
            actionMode: 'chat',
        });

        expect(res.status).toBe(200);
        expect(res.body.title).toBe('My Session');
        expect(res.body.scopePartition).toBe('partition1');
        expect(res.body.scopeDomains).toEqual(['domain1', 'domain2']);
        expect(res.body.actionMode).toBe('chat');
    });

    it('inserts row into DB', async () => {
        await request(app).post('/chat/conversations').send({ title: 'Test' });

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO chat_conversations'),
            expect.arrayContaining(['Test'])
        );
    });

    it('returns id and sessionId in response', async () => {
        const res = await request(app).post('/chat/conversations').send({});

        expect(res.body.id).toBeTruthy();
        expect(res.body.sessionId).toBeTruthy();
    });
});

// =============================================================================
// GET /chat/conversations/:id
// =============================================================================

describe('GET /chat/conversations/:id', () => {
    it('returns 404 when conversation not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const res = await request(app).get('/chat/conversations/nonexistent');

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('returns conversation with parsed messages', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'c1',
            title: 'Test',
            session_id: 'sess1',
            messages: JSON.stringify([{ role: 'user', content: 'hi' }]),
            scope_partition: null,
            scope_domains: null,
            action_mode: 'research',
            created_at: '2024-01-01',
            updated_at: '2024-01-02',
        });

        const res = await request(app).get('/chat/conversations/c1');

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('c1');
        expect(res.body.messages).toHaveLength(1);
        expect(res.body.messages[0].role).toBe('user');
    });

    it('parses scope_domains from JSON', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'c1', title: 'T', session_id: 's',
            messages: '[]', scope_partition: 'p1',
            scope_domains: JSON.stringify(['a', 'b']),
            action_mode: 'research', created_at: '2024-01-01', updated_at: '2024-01-01',
        });

        const res = await request(app).get('/chat/conversations/c1');

        expect(res.body.scopeDomains).toEqual(['a', 'b']);
    });
});

// =============================================================================
// PUT /chat/conversations/:id
// =============================================================================

describe('PUT /chat/conversations/:id', () => {
    it('returns 400 when no fields provided', async () => {
        const res = await request(app).put('/chat/conversations/c1').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('No fields');
    });

    it('updates title', async () => {
        const res = await request(app).put('/chat/conversations/c1').send({ title: 'New Title' });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('title');
        expect(params).toContain('New Title');
    });

    it('updates archived field', async () => {
        await request(app).put('/chat/conversations/c1').send({ archived: true });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(1); // archived = 1
    });

    it('stringifies scopeDomains when updating', async () => {
        await request(app).put('/chat/conversations/c1').send({
            scopeDomains: ['d1', 'd2'],
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(JSON.stringify(['d1', 'd2']));
    });

    it('can update multiple fields at once', async () => {
        await request(app).put('/chat/conversations/c1').send({
            title: 'New',
            actionMode: 'chat',
        });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('title');
        expect(String(sql)).toContain('action_mode');
        expect(params).toContain('New');
        expect(params).toContain('chat');
    });
});

// =============================================================================
// DELETE /chat/conversations/:id
// =============================================================================

describe('DELETE /chat/conversations/:id', () => {
    it('soft-deletes by setting archived = 1', async () => {
        const res = await request(app).delete('/chat/conversations/c1');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('archived = 1');
        expect(params).toContain('c1');
    });
});
