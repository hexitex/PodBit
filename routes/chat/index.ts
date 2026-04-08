/**
 * @module routes/chat/index
 *
 * Chat router — mounts legacy chat endpoint, conversation CRUD, and the
 * context-engine-integrated send-message endpoint.  Messages flow through
 * the context engine for knowledge enrichment, then through intent routing
 * (tool-calling agent loop or slash-command handlers), and finally persist
 * in the conversation history with auto-titling.
 */

import { Router } from 'express';
import { query, queryOne } from '../../db.js';
import {
    prepare as contextPrepare,
    update as contextUpdate,
    getSession as getContextSession,
    warmUpSession,
} from '../../context-engine.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ensureChatSettings, chatSettings } from './settings.js';
import { registerCrudRoutes } from './crud.js';
import { handleChatMessage } from './intents.js';

const router = Router();

// =============================================================================
// LEGACY ENDPOINT (backward compat)
// =============================================================================

router.post('/chat', asyncHandler(async (req, res) => {
    const { message, mode = 'api', domains } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    const response = await handleChatMessage(message, mode, domains);
    res.json(response);
}));

// =============================================================================
// CONVERSATION CRUD
// =============================================================================

registerCrudRoutes(router);

// =============================================================================
// SEND MESSAGE (context-engine integrated)
// =============================================================================

/**
 * Send a message to a conversation. Pipeline: (1) load conversation from DB,
 * (2) warm up context engine session if cold (e.g., after server restart),
 * (3) context.prepare() to rank/select relevant knowledge nodes, (4) route
 * through intent handlers (tool-calling agent loop or slash-commands),
 * (5) context.update() fire-and-forget to trigger feedback loop, (6) persist
 * user + assistant messages (with hidden tool-findings context for multi-turn
 * continuity), auto-title from first message.
 */
router.post('/chat/conversations/:id/messages', asyncHandler(async (req, res) => {
    const { message, mode = 'api' } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    // 1. Load conversation from DB
    const conv = await queryOne(
        `SELECT * FROM chat_conversations WHERE id = $1 AND archived = 0`,
        [req.params.id]
    );
    if (!conv) {
        return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages: Array<{ role: string; content: string }> = JSON.parse(conv.messages || '[]');
    const sessionId = conv.session_id;
    const domains = conv.scope_domains ? JSON.parse(conv.scope_domains) : undefined;

    // 2. Warm up the context engine session if it's cold (e.g., after server restart)
    const existingSession = getContextSession(sessionId);
    if (!existingSession && messages.length > 0) {
        await warmUpSession(sessionId, messages);
    }

    // 3. Call context.prepare() to get relevant knowledge
    await ensureChatSettings();
    let ctxResult: any = null;
    try {
        const prepareOpts: Record<string, any> = {};
        if (chatSettings.maxKnowledgeNodes > 0) prepareOpts.maxNodes = chatSettings.maxKnowledgeNodes;
        if (chatSettings.modelProfile) prepareOpts.modelProfile = chatSettings.modelProfile;
        ctxResult = await contextPrepare(message, sessionId, prepareOpts);
    } catch (err: any) {
        console.warn('[chat] context.prepare() failed (continuing without):', err.message);
    }

    // 4. Route to existing command handlers OR context-enriched LLM path
    const response = await handleChatMessage(message, mode, domains, ctxResult, messages);

    // 5. Update context engine with the response (fire-and-forget — never blocks HTTP response)
    if (ctxResult?.sessionId && response.response) {
        contextUpdate(ctxResult.sessionId, response.response).catch((err: any) => {
            console.warn('[chat] context.update() failed:', err.message);
        });
    }

    // 6. Persist messages and auto-title
    if (!response.response) {
        console.warn(`[chat] Empty response from handler — type=${response.type}, metadata=${JSON.stringify((response as any).metadata)?.slice(0, 200)}`);
        // Last resort: if response is empty but tool calls were made, say so
        if ((response as any).metadata?.toolCalls?.length > 0) {
            response.response = `*I searched the graph using ${(response as any).metadata.toolCalls.length} tool calls but couldn't generate a summary. Please try asking again or rephrase your question.*`;
        }
    }
    messages.push({ role: 'user', content: message });

    // Build persisted content: visible response + hidden tool context for multi-turn continuity
    let persistedContent = response.response || '';
    const toolContext = (response as any).metadata?.toolContext;
    if (toolContext) {
        // Append tool findings as a hidden context block. On subsequent turns,
        // the model sees this in conversation history and knows what tools found.
        persistedContent += `\n\n<tool-findings>\n${toolContext}\n</tool-findings>`;
    }

    const assistantMsg: any = { role: 'assistant', content: persistedContent };
    if ((response as any).metadata?.toolCalls?.length > 0) {
        assistantMsg.toolCalls = (response as any).metadata.toolCalls;
    }
    messages.push(assistantMsg);

    // Auto-title from first user message
    let title = conv.title;
    if (title === 'New Chat' && messages.length <= 2) {
        title = message.replace(/^\/\w+\s*/, '').trim().slice(0, 60) || message.slice(0, 60);
    }

    await query(
        `UPDATE chat_conversations SET messages = $1, title = $2, updated_at = datetime('now') WHERE id = $3`,
        [JSON.stringify(messages), title, req.params.id]
    );

    // 7. Return response with context metadata
    res.json({
        ...response,
        conversationId: conv.id,
        title,
        context: ctxResult ? {
            sessionId: ctxResult.sessionId,
            knowledge: ctxResult.knowledge,
            topics: ctxResult.topics,
            domains: ctxResult.domains,
            intent: ctxResult.intent,
            turnCount: ctxResult.turnCount,
            budget: ctxResult.budget,
        } : null,
    });
}));

export default router;
