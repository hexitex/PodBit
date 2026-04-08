/**
 * Integration flow: Chat conversation lifecycle.
 *
 * Creates a conversation via POST, reads it back with GET, updates the title
 * with PUT, soft-deletes it with DELETE, then confirms GET returns 404.
 * The conversation ID returned by POST flows into every subsequent request.
 *
 * Mocks: db.js (query, queryOne), uuid (deterministic IDs), async-handler
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

// Deterministic UUID so we can predict the conversation ID
let uuidCounter = 0;
const mockUuid = jest.fn<() => string>().mockImplementation(() => `test-uuid-${++uuidCounter}`);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('uuid', () => ({
    v4: mockUuid,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { registerCrudRoutes } = await import('../../routes/chat/crud.js');

/** Express app with chat CRUD router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerCrudRoutes(router);
    app.use('/', router);
    return app;
}

beforeEach(() => {
    jest.resetAllMocks();
    uuidCounter = 0;
    mockUuid.mockImplementation(() => `test-uuid-${++uuidCounter}`);
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// Full conversation lifecycle
// =============================================================================

describe('Chat conversation lifecycle flow', () => {
    it('creates → reads → updates → deletes → confirms 404', async () => {
        const app = buildApp();

        // ── Step 1: Create a conversation ────────────────────────────────────
        // query call: INSERT INTO chat_conversations
        mockQuery.mockResolvedValueOnce([]);

        const createRes = await request(app)
            .post('/chat/conversations')
            .send({ title: 'AI Research Session', actionMode: 'research' });

        expect(createRes.status).toBe(200);
        expect(createRes.body.id).toBeDefined();
        expect(createRes.body.title).toBe('AI Research Session');
        expect(createRes.body.actionMode).toBe('research');
        expect(createRes.body.messages).toEqual([]);

        const convId = createRes.body.id; // flows into subsequent requests

        // ── Step 2: Read the conversation back ────────────────────────────────
        mockQueryOne.mockResolvedValueOnce({
            id: convId,
            title: 'AI Research Session',
            session_id: 'sess-abc',
            messages: '[]',
            scope_partition: null,
            scope_domains: null,
            action_mode: 'research',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
        });

        const getRes = await request(app).get(`/chat/conversations/${convId}`);

        expect(getRes.status).toBe(200);
        expect(getRes.body.id).toBe(convId);
        expect(getRes.body.title).toBe('AI Research Session');
        expect(Array.isArray(getRes.body.messages)).toBe(true);
        expect(getRes.body.sessionId).toBe('sess-abc');

        // ── Step 3: Update the title ──────────────────────────────────────────
        mockQuery.mockResolvedValueOnce([]); // UPDATE

        const updateRes = await request(app)
            .put(`/chat/conversations/${convId}`)
            .send({ title: 'AI Research — Renamed' });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.ok).toBe(true);

        // ── Step 4: Soft-delete the conversation ──────────────────────────────
        mockQuery.mockResolvedValueOnce([]); // UPDATE archived=1

        const deleteRes = await request(app).delete(`/chat/conversations/${convId}`);

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.ok).toBe(true);

        // ── Step 5: Confirm archived conversation returns 404 ─────────────────
        mockQueryOne.mockResolvedValueOnce(null); // WHERE archived = 0 → not found

        const getAfterDelete = await request(app).get(`/chat/conversations/${convId}`);

        expect(getAfterDelete.status).toBe(404);
        expect(getAfterDelete.body.error).toContain('not found');
    });

    it('scope_domains JSON round-trips through create → list', async () => {
        const app = buildApp();

        // Create with scope_domains
        mockQuery.mockResolvedValueOnce([]);

        const createRes = await request(app)
            .post('/chat/conversations')
            .send({ title: 'Scoped Chat', scopeDomains: ['ai', 'safety'] });

        expect(createRes.status).toBe(200);
        expect(createRes.body.scopeDomains).toEqual(['ai', 'safety']);

        const convId = createRes.body.id;

        // List — confirm scope_domains is parsed back from JSON
        mockQuery.mockResolvedValueOnce([{
            id: convId,
            title: 'Scoped Chat',
            session_id: 'sess-2',
            messages: '[]',
            scope_partition: null,
            scope_domains: '["ai","safety"]',
            action_mode: 'research',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
        }]);

        const listRes = await request(app).get('/chat/conversations');

        expect(listRes.status).toBe(200);
        const conv = listRes.body.conversations.find((c: any) => c.id === convId);
        expect(conv).toBeDefined();
        expect(conv.scopeDomains).toEqual(['ai', 'safety']);
    });
});
