/**
 * @module routes/chat/crud
 *
 * Chat conversation CRUD routes — list, get, create, update (title/scope/archive),
 * and soft-delete.  Each conversation has a unique context-engine session ID and
 * optional scope (partition, domains, action mode).
 */

import { Router } from 'express';
// @ts-expect-error
import { v4 as uuid } from 'uuid';
import { query, queryOne } from '../../db.js';
import { asyncHandler } from '../../utils/async-handler.js';

/**
 * Registers chat conversation CRUD routes on the given Express router.
 *
 * Routes:
 * - `GET  /chat/conversations`       — list non-archived conversations
 * - `POST /chat/conversations`       — create a new conversation
 * - `GET  /chat/conversations/:id`   — get a single conversation with messages
 * - `PUT  /chat/conversations/:id`   — update title, scope, or archive flag
 * - `DELETE /chat/conversations/:id` — soft-delete (set archived = 1)
 *
 * @param router - The Express router to mount routes on.
 */
export function registerCrudRoutes(router: Router): void {
    // List non-archived conversations, ordered by updated_at DESC
    router.get('/chat/conversations', asyncHandler(async (_req, res) => {
        const rows = await query(
            `SELECT id, title, session_id, messages, scope_partition, scope_domains, action_mode, created_at, updated_at
             FROM chat_conversations
             WHERE archived = 0
             ORDER BY updated_at DESC`
        );
        const conversations = rows.map((r: any) => {
            let messageCount = 0;
            try {
                messageCount = JSON.parse(r.messages || '[]').length;
            } catch { /* ignore */ }
            return {
                id: r.id,
                title: r.title,
                sessionId: r.session_id,
                scopePartition: r.scope_partition,
                scopeDomains: r.scope_domains ? JSON.parse(r.scope_domains) : [],
                actionMode: r.action_mode,
                messageCount,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            };
        });
        res.json({ conversations });
    }));

    // Create a new conversation
    router.post('/chat/conversations', asyncHandler(async (req, res) => {
        const id = uuid();
        const sessionId = uuid();
        const { title, scopePartition, scopeDomains, actionMode } = req.body || {};

        await query(
            `INSERT INTO chat_conversations (id, title, session_id, scope_partition, scope_domains, action_mode)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                id,
                title || 'New Chat',
                sessionId,
                scopePartition || null,
                scopeDomains ? JSON.stringify(scopeDomains) : null,
                actionMode || 'research',
            ]
        );

        res.json({
            id,
            title: title || 'New Chat',
            sessionId,
            scopePartition: scopePartition || null,
            scopeDomains: scopeDomains || [],
            actionMode: actionMode || 'research',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }));

    // Get a single conversation with messages
    router.get('/chat/conversations/:id', asyncHandler(async (req, res) => {
        const row = await queryOne(
            `SELECT * FROM chat_conversations WHERE id = $1 AND archived = 0`,
            [req.params.id]
        );
        if (!row) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        res.json({
            id: row.id,
            title: row.title,
            sessionId: row.session_id,
            messages: JSON.parse(row.messages || '[]'),
            scopePartition: row.scope_partition,
            scopeDomains: row.scope_domains ? JSON.parse(row.scope_domains) : [],
            actionMode: row.action_mode,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }));

    // Update conversation (title, scope, archived)
    router.put('/chat/conversations/:id', asyncHandler(async (req, res) => {
        const { title, scopePartition, scopeDomains, actionMode, archived } = req.body;
        const updates: string[] = [];
        const params: any[] = [];
        let idx = 1;

        if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
        if (scopePartition !== undefined) { updates.push(`scope_partition = $${idx++}`); params.push(scopePartition || null); }
        if (scopeDomains !== undefined) { updates.push(`scope_domains = $${idx++}`); params.push(JSON.stringify(scopeDomains)); }
        if (actionMode !== undefined) { updates.push(`action_mode = $${idx++}`); params.push(actionMode); }
        if (archived !== undefined) { updates.push(`archived = $${idx++}`); params.push(archived ? 1 : 0); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = datetime('now')`);
        params.push(req.params.id);

        await query(
            `UPDATE chat_conversations SET ${updates.join(', ')} WHERE id = $${idx}`,
            params
        );

        res.json({ ok: true });
    }));

    // Soft-delete conversation
    router.delete('/chat/conversations/:id', asyncHandler(async (req, res) => {
        await query(
            `UPDATE chat_conversations SET archived = 1, updated_at = datetime('now') WHERE id = $1`,
            [req.params.id]
        );
        res.json({ ok: true });
    }));
}
