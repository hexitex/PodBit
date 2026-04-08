/**
 * @module routes/chat/intents
 *
 * Intent-based chat message router.  Dispatches incoming messages to the
 * tool-calling agent loop (when enabled) or to slash-command handlers
 * (`/stats`, `/synthesis`, `/research`, `/voice`, `/seed`,
 * `/compress`, `/summarize`, `/tensions`, `/dedup`, `/templates`).  Unrecognised messages
 * fall through to simple keyword-intent detection and finally to a generic
 * LLM response path.
 */

import { query } from '../../db.js';
import { getPrompt } from '../../prompts.js';
import { extractTextContent } from '../../models/providers.js';
import { chatSettings, ensureChatSettings } from './settings.js';
import { handleChatWithTools } from './tools.js';

/**
 * Routes a chat message through the appropriate handler.
 *
 * Resolution order:
 * 1. Tool-calling agent loop (if enabled and message is not a system command).
 * 2. Slash-command handlers (`/chat`, `/stats`, `/synthesis`, etc.).
 * 3. Keyword-based intent detection (outline, voice, knowledge).
 * 4. Fallback generic LLM response.
 *
 * @param message              - Raw user message text.
 * @param mode                 - Routing mode: `'api'` for direct LLM calls, `'mcp'` to queue for IDE agent.
 * @param domains              - Optional scoped domain list (from conversation scope).
 * @param ctxResult            - Context engine prepare() result, if available.
 * @param conversationMessages - Prior messages in the conversation for multi-turn context.
 * @returns An object with `response` (string), `type` (string), and optional `metadata`.
 */
export async function handleChatMessage(message: string, mode: string = 'api', domains?: string[], ctxResult?: any, conversationMessages?: Array<{ role: string; content: string }>) {
    const lowerMsg = message.toLowerCase().trim();

    // ─── Tool calling: route bare-text messages through the agent loop ───
    // All slash commands bypass the agent loop and use their dedicated handlers.
    // Only bare text (no slash prefix) goes through the agent loop.
    const SYSTEM_COMMANDS = ['/stats', '/synthesis', '/dedup', '/templates', '/seed ', '/research ', '/voice ', '/compress ', '/summarize ', '/tensions'];
    const isSystemCommand = SYSTEM_COMMANDS.some(cmd => lowerMsg === cmd || lowerMsg.startsWith(cmd));

    if (!isSystemCommand) {
        await ensureChatSettings();
        if (chatSettings.toolCallingEnabled) {
            const toolResult = await handleChatWithTools(message, ctxResult, conversationMessages);
            if (toolResult) return toolResult;
            // If handleChatWithTools returns null, fall through to legacy routing
        }
    }

    // ─── Chat mode — direct conversational path (no command routing) ───
    if (lowerMsg.startsWith('/chat ') || lowerMsg === '/chat') {
        const userText = message.slice(5).trim();
        if (!userText) {
            return { response: 'What would you like to talk about?', type: 'text' };
        }

        const { callWithMessages, getSubsystemAssignments } = await import('../../models.js');
        const assignments = await getSubsystemAssignments();
        const chatModel = assignments.chat;

        if (!chatModel) {
            return { response: 'No model assigned to the "chat" subsystem. Assign one in the Models page.', type: 'error' };
        }

        // Build knowledge context from context engine or recent nodes
        const knowledgeContext = ctxResult?.knowledge?.length > 0
            ? ctxResult.knowledge.map((k: any) => `- [${k.domain}] ${k.content}`).join('\n')
            : await getRecentKnowledge();

        const systemPrompt = ctxResult?.systemPrompt
            || `You are a knowledgeable assistant. Use the following knowledge to inform your responses:\n\n${knowledgeContext}`;

        // Build multi-turn messages array
        const chatMessages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
        ];

        // Include conversation history (last 20 messages)
        if (conversationMessages) {
            for (const m of conversationMessages.slice(-20)) {
                chatMessages.push({ role: m.role, content: m.content });
            }
        }

        chatMessages.push({ role: 'user', content: userText });

        const model = {
            name: chatModel.modelId,
            provider: chatModel.provider,
            model: chatModel.modelId,
            endpoint: chatModel.endpointUrl || undefined,
            apiKey: chatModel.apiKey || undefined,
            _registryId: chatModel.id,
            _maxConcurrency: chatModel.maxConcurrency ?? 1,
            _requestPauseMs: chatModel.requestPauseMs ?? 0,
        };

        const result = await callWithMessages(chatMessages, model, {});
        const responseText = extractTextContent(result.choices[0]?.message?.content);

        return {
            response: responseText,
            type: 'text',
            metadata: { system: 'llm', contextEnriched: !!ctxResult, mode: 'chat' },
        };
    }

    // Quick commands
    if (lowerMsg === '/stats') {
        const { handleStats } = await import('../../mcp-server.js');
        const stats = await handleStats({});
        return {
            response: formatStats(stats),
            type: 'text',
            metadata: { system: 'resonance' }
        };
    }

    if (lowerMsg === '/synthesis') {
        const { synthesisCycle } = await import('../../core.js');
        const result = await synthesisCycle() as any;
        return {
            response: result ? `Synthesis cycle completed!\n\nSampled: "${result.nodeA?.content?.slice(0, 50)}..." and "${result.nodeB?.content?.slice(0, 50)}..."\nResonance: ${result.resonance?.toFixed(3) || 'N/A'}${result.child ? `\n\nCreated child node (${result.child.trajectory}): "${result.child.content?.slice(0, 100)}..."` : '\nNo child created (below threshold)'}` : 'Synthesis cycle ran but no nodes were sampled.',
            type: 'text',
            metadata: { system: 'synthesis' }
        };
    }

    if (lowerMsg === '/templates') {
        const templates = await query('SELECT task_type, name FROM templates');
        if (templates.length === 0) {
            return { response: 'No templates available yet.', type: 'text' };
        }
        const list = templates.map(t => `- **${t.task_type}**: ${t.name}`).join('\n');
        return {
            response: `Available document templates:\n\n${list}`,
            type: 'text',
            metadata: { system: 'docs' }
        };
    }

    // Seed command — user pastes research text to add directly as seed(s)
    if (lowerMsg.startsWith('/seed ')) {
        const rawText = message.slice(6).trim();
        if (!rawText) {
            return { response: 'Usage: `/seed <text>` — Paste research text to add as seed(s) to the knowledge graph.', type: 'text' };
        }

        // Determine target domain from scope or infer automatically
        let targetDomain: string;
        let domainInferred = false;
        if (domains && domains.length === 1) {
            targetDomain = domains[0];
        } else {
            // Multiple scoped domains or no scope — infer best match from content
            const { inferDomain } = await import('../../core.js');
            const inference = await inferDomain(rawText);
            // If inference matches one of the scoped domains, use it; otherwise use inference result
            if (domains && domains.length > 1 && domains.includes(inference.domain)) {
                targetDomain = inference.domain;
            } else if (domains && domains.length > 1) {
                // Inference didn't match any scoped domain — fall back to first scoped domain
                targetDomain = domains[0];
            } else {
                targetDomain = inference.domain;
                domainInferred = true;
            }
        }

        try {
            const { handlePropose } = await import('../../mcp-server.js');

            // Split on double-newline or numbered list items for multi-fact input
            const chunks = rawText
                .split(/\n\n+|\n(?=\d+\.\s)/)
                .map(c => c.replace(/^\d+\.\s*/, '').trim())
                .filter(c => c.length > 10);

            // If no clear paragraph breaks, treat the whole text as one seed
            const seedTexts = chunks.length > 0 ? chunks : [rawText];

            const addedSeeds = [];
            for (const text of seedTexts) {
                // Append source attribution
                const content = `${text} (human-you)`;
                const result = await handlePropose({
                    content,
                    nodeType: 'seed',
                    domain: targetDomain,
                    contributor: 'human:you',
                }) as any;
                if (result.node?.id) {
                    addedSeeds.push({ id: result.node.id, content: text.slice(0, 80) });
                }
            }

            if (addedSeeds.length === 0) {
                return { response: 'No seeds created. Text may have been too short or flagged.', type: 'text' };
            }

            return {
                response: `**Seeded ${addedSeeds.length} node${addedSeeds.length !== 1 ? 's' : ''}** into "${targetDomain}"${domainInferred ? ' (auto-detected)' : ''}:\n\n${addedSeeds.map(s => `- ${s.content}...`).join('\n')}\n\n*Source: human-you*\n\n---\nThe synthesis engine will discover connections automatically. Or try \`/voice ${targetDomain}\` to voice connections now.`,
                type: 'text',
                metadata: { system: 'seed', seedCount: addedSeeds.length, seedIds: addedSeeds.map(s => s.id), domain: targetDomain }
            };
        } catch (err: any) {
            return { response: `Seed failed: ${err.message}`, type: 'error' };
        }
    }

    // Research command - generate new seeds about a topic
    if (lowerMsg.startsWith('/research ')) {
        const topic = message.slice(10).trim();
        if (!topic) {
            return { response: 'Usage: `/research <topic>` — Generate foundational seeds about a topic and add them to the graph.', type: 'text' };
        }

        // Pre-flight: ensure chat subsystem is assigned
        const { getSubsystemAssignments } = await import('../../models.js');
        const assignments = await getSubsystemAssignments();
        if (!assignments.chat) {
            return {
                response: 'No model assigned to the **chat** subsystem. Assign one in the Models page before using `/research`.',
                type: 'error'
            };
        }

        // Use explicit domain from scope, or infer automatically
        let targetDomain: string;
        let domainIsNew = false;
        if (domains && domains.length === 1) {
            targetDomain = domains[0];
        } else {
            const { inferDomain } = await import('../../core.js');
            const inference = await inferDomain(topic);
            if (domains && domains.length > 1 && domains.includes(inference.domain)) {
                targetDomain = inference.domain;
            } else if (domains && domains.length > 1) {
                targetDomain = domains[0];
            } else {
                targetDomain = inference.domain;
                domainIsNew = inference.source === 'new';
            }
        }

        // MCP mode: Queue request for LLM IDE agent to process via MCP tools
        if (mode === 'mcp') {
            const { queueRequest } = await import('../../core.js');
            const request = await queueRequest('research', { topic, domain: targetDomain });
            return {
                response: `**Research queued!** Topic: "${topic}" → domain: "${targetDomain}"${domainIsNew ? ' (new)' : ''}\n\nRequest ID: \`${request.id}\`\n\nLLM IDE agent will process this via MCP.`,
                type: 'mcp_queued',
                metadata: { system: 'mcp', requestId: request.id, action: 'research', topic }
            };
        }

        // API mode: Call model directly
        try {
            const { callSubsystemModel } = await import('../../models.js');
            const { handlePropose } = await import('../../mcp-server.js');

            const seedPrompt = await getPrompt('chat.research_seeds', { topic });
            const seedResponse = await callSubsystemModel('chat', seedPrompt, {});

            // Parse line-by-line facts — handle bullets, numbered lists, and bare lines
            const seeds = seedResponse
                .split('\n')
                .map(line => line
                    .replace(/^\s*(?:\d+[\.\)]\s*|[-*\u2022]\s*|>\s*)/, '')  // strip bullets, numbers, blockquotes
                    .replace(/^\*\*.*?\*\*[:\s]*/, '')                        // strip bold prefixes like **Fact:**
                    .trim()
                )
                .filter(line => line.length > 10 && line.length < 500 && !/^#+\s/.test(line) && !/^---/.test(line));

            if (seeds.length === 0) {
                return { response: `No seeds could be parsed from the model response. The model returned:\n\n> ${seedResponse.slice(0, 300)}...\n\nTry a more specific topic.`, type: 'text' };
            }

            // Add seeds to the graph
            const addedSeeds = [];
            const rejected = [];
            for (const content of seeds) {
                const result = await handlePropose({
                    content,
                    nodeType: 'seed',
                    domain: targetDomain,
                    contributor: 'chat:research'
                }) as any;
                if (result.node?.id) {
                    addedSeeds.push({ id: result.node.id, content: content.slice(0, 100) });
                } else if (result.rejected) {
                    rejected.push(result.reason || 'unknown');
                }
            }

            if (addedSeeds.length === 0) {
                const rejNote = rejected.length > 0
                    ? `All ${rejected.length} generated seed(s) were rejected by quality gates.`
                    : 'No seeds were created.';
                return { response: rejNote, type: 'text' };
            }

            const domainNote = domainIsNew
                ? ` (new domain: "${targetDomain}")`
                : ` → "${targetDomain}"`;

            let rejectedNote = '';
            if (rejected.length > 0) {
                rejectedNote = `\n\n*${rejected.length} seed(s) rejected by quality gates.*`;
            }

            // Find potential connections with existing knowledge (exclude target domain)
            const existingNodes = await query(
                `SELECT id, content, domain FROM nodes
                 WHERE archived = FALSE AND node_type IN ('seed', 'breakthrough', 'voiced')
                 AND domain != $1
                 ORDER BY weight DESC LIMIT 10`,
                [targetDomain]
            );

            let connectionHint = '';
            if (existingNodes.length > 0) {
                connectionHint = `\n\n**Cross-domain opportunities:**\n${existingNodes.slice(0, 3).map(n => `- [${n.domain}] ${n.content.slice(0, 60)}...`).join('\n')}\n\nType \`/voice ${topic}\` to synthesize connections.`;
            }

            return {
                response: `**Research complete!** Added ${addedSeeds.length} seeds about "${topic}"${domainNote}:\n\n${addedSeeds.map(s => `- ${s.content}...`).join('\n')}${rejectedNote}${connectionHint}`,
                type: 'text',
                metadata: { system: 'research', topic, seedCount: addedSeeds.length, rejectedCount: rejected.length, seedIds: addedSeeds.map(s => s.id), domain: targetDomain, domainIsNew }
            };
        } catch (err: any) {
            return { response: `Research failed: ${err.message}`, type: 'error' };
        }
    }

    // Voice command - find and voice connections for a topic
    if (lowerMsg.startsWith('/voice ')) {
        const topic = message.slice(7).trim();
        if (!topic) {
            return { response: 'Usage: `/voice <topic>` - I will find and voice connections between this topic and others.', type: 'text' };
        }

        // Use explicit domains from scope, or find via synonyms
        let matchedDomains: string[];
        if (domains && domains.length > 0) {
            matchedDomains = domains;
        } else {
            const { findDomainsBySynonym } = await import('../../core.js');
            matchedDomains = await findDomainsBySynonym(topic);

            if (matchedDomains.length === 0) {
                return {
                    response: `No knowledge about "${topic}" found. Run \`/research ${topic}\` first.`,
                    type: 'text'
                };
            }
        }

        // Get nodes from matched domains
        const topicNodes = await query(
            `SELECT id, content, domain FROM nodes
             WHERE archived = FALSE AND domain = ANY($1)
             ORDER BY weight DESC LIMIT 5`,
            [matchedDomains]
        );

        if (topicNodes.length === 0) {
            return {
                response: `No knowledge about "${topic}" found. Run \`/research ${topic}\` first.`,
                type: 'text'
            };
        }

        // Get nodes from other domains (exclude matched domains)
        const otherNodes = await query(
            `SELECT id, content, domain FROM nodes
             WHERE archived = FALSE AND domain != ALL($1) AND node_type IN ('seed', 'breakthrough')
             ORDER BY weight DESC LIMIT 10`,
            [matchedDomains]
        );

        if (otherNodes.length === 0) {
            return { response: 'Not enough cross-domain knowledge to voice connections.', type: 'text' };
        }

        // MCP mode: Queue request for LLM IDE agent to process via MCP tools
        if (mode === 'mcp') {
            const { queueRequest } = await import('../../core.js');
            const request = await queueRequest('voice', {
                topic,
                domain: matchedDomains[0],
                topicNodeIds: topicNodes.map(n => n.id),
                otherNodeIds: otherNodes.map(n => n.id)
            });
            return {
                response: `**Voice queued!** Topic: "${topic}"\n\nRequest ID: \`${request.id}\`\n\nLLM IDE agent will find and voice connections via MCP.`,
                type: 'mcp_queued',
                metadata: { system: 'mcp', requestId: request.id, action: 'voice', topic }
            };
        }

        // API mode: Call LM Studio directly
        try {
            const { callSubsystemModel } = await import('../../models.js');
            const { handlePropose } = await import('../../mcp-server.js');

            // Use numeric indices — far more reliable for local models than UUID prefixes
            const allNodes = [...topicNodes, ...otherNodes];
            const pairPrompt = await getPrompt('chat.voice_connection', {
                topic,
                topicNodes: topicNodes.map((n, i) => `[${i + 1}] ${n.content}`).join('\n'),
                otherNodes: otherNodes.map((n, i) => `[${topicNodes.length + i + 1}] [${n.domain}] ${n.content}`).join('\n'),
            });

            // Provider-agnostic structured output hint
            const voiceJsonSchema = {
                name: "voice_synthesis",
                schema: {
                    type: "object",
                    properties: {
                        nodeA: { type: "integer", description: "Number of the first node (from the list above)" },
                        nodeB: { type: "integer", description: "Number of the second node (from the list above)" },
                        synthesis: { type: "string", description: "2-3 sentence insight connecting the two nodes" },
                        pattern: { type: "string", description: "Optional abstract pattern name" }
                    },
                    required: ["nodeA", "nodeB", "synthesis"],
                    additionalProperties: false
                }
            };

            const pairResponse = await callSubsystemModel('chat', pairPrompt, { jsonSchema: voiceJsonSchema });
            let synthesis: any;
            try {
                synthesis = JSON.parse(pairResponse);
            } catch {
                // Fallback: try to extract JSON object
                try {
                    synthesis = JSON.parse(pairResponse.match(/\{[\s\S]*\}/)?.[0] || '{}');
                } catch {
                    return { response: `Failed to parse synthesis. Raw:\n${pairResponse}`, type: 'error' };
                }
            }

            if (!synthesis.synthesis) {
                return { response: 'No meaningful connection found. Try a different topic.', type: 'text' };
            }

            // Resolve numeric indices to actual nodes (1-based → 0-based)
            const idxA = (typeof synthesis.nodeA === 'number' ? synthesis.nodeA : parseInt(synthesis.nodeA, 10)) - 1;
            const idxB = (typeof synthesis.nodeB === 'number' ? synthesis.nodeB : parseInt(synthesis.nodeB, 10)) - 1;
            const nodeA = allNodes[idxA];
            const nodeB = allNodes[idxB];

            if (!nodeA || !nodeB) {
                // Fallback: save the synthesis even if we can't match nodes
                const { handlePropose: fallbackPropose } = await import('../../mcp-server.js');
                const fallbackDomain = topicNodes[0]?.domain || 'unassigned';
                const fallbackResult = await fallbackPropose({
                    content: synthesis.synthesis,
                    nodeType: 'voiced',
                    domain: fallbackDomain,
                    contributor: 'chat:voice'
                }) as any;
                return {
                    response: `**Connection voiced** (could not match source nodes):\n\n${synthesis.synthesis}${fallbackResult.node?.id ? `\n\n*Saved as node ${fallbackResult.node.id.slice(0, 8)}*` : ''}`,
                    type: 'text',
                    metadata: { system: 'voice', voicedId: fallbackResult.node?.id }
                };
            }

            // Determine domain — inherit from first parent (provenance tracked via edges)
            const voicedDomain = nodeA.domain || nodeB.domain || 'unassigned';

            // Save the voiced node
            const result = await handlePropose({
                content: synthesis.synthesis,
                nodeType: 'voiced',
                domain: voicedDomain,
                parentIds: [nodeA.id, nodeB.id],
                contributor: 'chat:voice'
            }) as any;

            return {
                response: `**Connection voiced!**\n\n**From:** [${nodeA.domain}] ${nodeA.content.slice(0, 60)}...\n**To:** [${nodeB.domain}] ${nodeB.content.slice(0, 60)}...\n\n**Synthesis:** ${synthesis.synthesis}${synthesis.pattern ? `\n\n**Pattern detected:** ${synthesis.pattern}` : ''}`,
                type: 'text',
                metadata: { system: 'voice', voicedId: result.node?.id, parentIds: [nodeA.id, nodeB.id] }
            };
        } catch (err: any) {
            return { response: `Voice failed: ${err.message}`, type: 'error' };
        }
    }

    // Tensions command - find tensions in a domain
    if (lowerMsg.startsWith('/tensions')) {
        const topic = message.slice(9).trim();
        try {
            const { handleTensions } = await import('../../mcp-server.js');
            const tensionDomain = (domains && domains.length > 0) ? domains[0] : (topic || undefined);
            const result = await handleTensions({ domain: tensionDomain, limit: 5 });

            if (!result.tensions || result.tensions.length === 0) {
                return { response: 'No tensions found. Add more diverse knowledge first.', type: 'text' };
            }

            const list = result.tensions.map(t =>
                `**Tension (similarity: ${t.similarity.toFixed(2)})**\n` +
                `- [${t.nodeA.domain}] ${t.nodeA.content.slice(0, 80)}...\n` +
                `- [${t.nodeB.domain}] ${t.nodeB.content.slice(0, 80)}...`
            ).join('\n\n');

            return {
                response: `**Tensions found:**\n\n${list}\n\n---\nThese are areas where contradictory ideas exist. Type \`/voice <topic>\` to explore and synthesize.`,
                type: 'text',
                metadata: { system: 'tensions', count: result.tensions.length }
            };
        } catch (err: any) {
            return { response: `Tensions search failed: ${err.message}`, type: 'error' };
        }
    }

    // Summarize command - "Tell me the important things about X"
    if (lowerMsg.startsWith('/summarize ')) {
        const topic = message.slice(11).trim();
        if (!topic) {
            return { response: 'Usage: `/summarize <topic>` - Get a summary of the most important knowledge about a topic.', type: 'text' };
        }

        try {
            const { handleSummarize } = await import('../../mcp-server.js');
            const result = await handleSummarize({ topic, domains }) as any;

            if (result.error) {
                return {
                    response: `${result.error}\n\nType \`/research ${topic}\` to add foundational knowledge first.`,
                    type: 'text',
                    metadata: { system: 'resonance' }
                };
            }

            return {
                response: `# "${topic}" — Knowledge Summary\n\n*Based on ${result.nodeCount} nodes (${result.breakthroughs} breakthroughs, ${result.syntheses} syntheses, ${result.seeds} seeds)${result.cached ? ' (cached)' : ''}*\n\n${result.summary}\n\n---\n**Go deeper:** \`/tensions ${topic}\` | \`/research ${topic}\` | \`/compress ${topic}\``,
                type: 'text',
                metadata: { system: 'summarize', topic, nodeCount: result.nodeCount, breakthroughs: result.breakthroughs }
            };
        } catch (err: any) {
            return { response: `Summarize failed: ${err.message}`, type: 'error' };
        }
    }

    // Compress command - "Construct a compressed/meta prompt for X"
    if (lowerMsg.startsWith('/compress ')) {
        const topic = message.slice(10).trim();
        if (!topic) {
            return { response: 'Usage: `/compress <topic>` - Generate a compressed meta-prompt that captures essential knowledge about a topic.', type: 'text' };
        }

        try {
            const { handleCompress } = await import('../../mcp-server.js');
            const result = await handleCompress({ topic, domains }) as any;

            if (result.error) {
                return {
                    response: `${result.error}\n\nType \`/research ${topic}\` to add foundational knowledge first.`,
                    type: 'text',
                    metadata: { system: 'resonance' }
                };
            }

            return {
                response: `# Compressed Prompt: "${topic}"\n\n*Distilled from ${result.nodeCount} knowledge nodes${result.cached ? ' (cached)' : ''}*\n\n---\n\n${result.compressed}\n\n---\n*Copy the above as a system prompt for any LLM to give it expert knowledge on this topic.*`,
                type: 'text',
                metadata: { system: 'compress', topic, nodeCount: result.nodeCount }
            };
        } catch (err: any) {
            return { response: `Compress failed: ${err.message}`, type: 'error' };
        }
    }

    // Dedup command — find and archive duplicate nodes (dry-run by default, --apply to execute)
    if (lowerMsg.startsWith('/dedup')) {
        const arg = message.slice(6).trim();
        const hasApply = arg.toLowerCase().includes('--apply');
        const isDryRun = !hasApply;
        const dedupDomain = arg.replace(/--apply|--dry-run|dry/gi, '').trim() || undefined;

        try {
            const { handleDedup } = await import('../../mcp-server.js');
            const result = await handleDedup({
                domain: (domains && domains.length > 0) ? domains[0] : dedupDomain,
                dryRun: isDryRun,
            }) as any;

            if (result.totalClustersFound === 0) {
                return {
                    response: `**No duplicates found.**\n\nScanned ${result.domainsProcessed} domain(s). All nodes are unique (threshold: ${result.thresholds.embedding} cosine similarity).`,
                    type: 'text',
                    metadata: { system: 'dedup' }
                };
            }

            const clusterList = result.results
                .filter((r: any) => r.clustersFound > 0)
                .map((r: any) => {
                    const domainHeader = `**[${r.domain}]** — ${r.clustersFound} cluster(s), ${r.nodesArchived} archived`;
                    const clusterDetails = r.clusters.map((c: any, i: number) => {
                        const kept = `  Kept: "${c.keptNode.content.slice(0, 80)}..." (weight: ${c.keptNode.weight.toFixed(2)})`;
                        const archived = c.archivedNodes.map((a: any) =>
                            `  ${isDryRun ? 'Would archive' : 'Archived'}: "${a.content.slice(0, 80)}..." (sim: ${a.similarity.toFixed(3)})`
                        ).join('\n');
                        return `  Cluster ${i + 1}:\n${kept}\n${archived}`;
                    }).join('\n\n');
                    return `${domainHeader}\n${clusterDetails}`;
                }).join('\n\n---\n\n');

            const applyHint = isDryRun && result.totalClustersFound > 0
                ? `\n\n---\n*This is a dry run. To apply, run \`/dedup${dedupDomain ? ' ' + dedupDomain : ''} --apply\`*`
                : '';
            return {
                response: `**Dedup ${isDryRun ? 'Report (DRY RUN)' : 'Complete'}**\n\n${isDryRun ? '_No changes made._\n\n' : ''}Domains: ${result.domainsProcessed} | Clusters: ${result.totalClustersFound} | ${isDryRun ? 'Would archive' : 'Archived'}: ${result.totalNodesArchived} nodes\n\n${clusterList}${applyHint}`,
                type: 'text',
                metadata: { system: 'dedup', clusters: result.totalClustersFound, archived: result.totalNodesArchived, dryRun: isDryRun }
            };
        } catch (err: any) {
            return { response: `Dedup failed: ${err.message}`, type: 'error' };
        }
    }

    // Intent detection
    if (lowerMsg.includes('outline') || lowerMsg.includes('document') || lowerMsg.includes('research brief')) {
        // Scaffold request
        try {
            const { decompose } = await import('../../scaffold.js');
            const result = await decompose(message, 'general', {});
            return {
                response: `Document outline:\n\n${result.sections?.map((s: any, i: number) => `${i + 1}. **${s.title}**\n   ${s.purpose}`).join('\n\n') || JSON.stringify(result, null, 2)}`,
                type: 'text',
                metadata: { system: 'docs' }
            };
        } catch (err: any) {
            return { response: `Scaffold failed: ${err.message}`, type: 'error' };
        }
    }

    if (lowerMsg.includes('voice') || lowerMsg.includes('connection') || lowerMsg.includes('relate')) {
        // Voice is now done via MCP - Claude does the synthesis
        return {
            response: `**Voicing is now done via MCP tools.**\n\nUse the MCP workflow:\n1. \`resonance.voice\` - get context for voicing\n2. Claude synthesizes the content\n3. \`resonance.propose\` with nodeType="voiced" to save\n\nThis ensures Claude (the conversation LLM) does all synthesis work directly.`,
            type: 'text',
            metadata: { system: 'resonance', deprecated: true }
        };
    }

    if (lowerMsg.includes('knowledge') || lowerMsg.includes('what do we know') || lowerMsg.includes('search')) {
        // Knowledge query
        const searchTerm = message.replace(/what do we know about|knowledge about|search for/gi, '').trim();

        // Try synonym-based domain lookup first, then fall back to content search
        let nodes;
        const { findDomainsBySynonym } = await import('../../core.js');
        const matchedDomains = await findDomainsBySynonym(searchTerm);

        if (matchedDomains.length > 0) {
            nodes = await query(
                `SELECT content, domain, weight, specificity FROM nodes
                 WHERE domain = ANY($1) AND archived = FALSE
                 ORDER BY weight DESC, created_at DESC LIMIT 10`,
                [matchedDomains]
            );
        } else {
            // Use word boundary search for short terms to avoid substring matches
            if (searchTerm.length <= 4) {
                nodes = await query(
                    `SELECT content, domain, weight, specificity FROM nodes
                     WHERE (content LIKE $1 OR content LIKE $2 OR content LIKE $3 OR content LIKE $4)
                       AND archived = FALSE
                     ORDER BY weight DESC LIMIT 5`,
                    [`% ${searchTerm} %`, `${searchTerm} %`, `% ${searchTerm}`, searchTerm]
                );
            } else {
                nodes = await query(
                    `SELECT content, domain, weight, specificity FROM nodes
                     WHERE content ILIKE $1 AND archived = FALSE
                     ORDER BY weight DESC LIMIT 5`,
                    [`%${searchTerm}%`]
                );
            }
        }

        if (nodes.length === 0) {
            return {
                response: `No knowledge found about "${searchTerm}".\n\n**Would you like me to research this topic?**\nType \`/research ${searchTerm}\` to add foundational knowledge and find connections.`,
                type: 'text',
                metadata: { system: 'resonance', action: 'offer_research', topic: searchTerm }
            };
        }
        const list = nodes.map(n => `- [${n.domain || 'general'}] ${n.content} (weight: ${n.weight?.toFixed(2)})`).join('\n\n');
        const hasBreakthroughs = nodes.some(n => n.weight > 1.5);
        const actionPrompt = nodes.length < 5
            ? `\n\n---\n**Go deeper?** Type \`/research ${searchTerm}\` to add more knowledge and find connections.`
            : hasBreakthroughs
                ? `\n\n---\n**Explore connections?** Type \`/tensions ${searchTerm}\` to find tensions worth exploring.`
                : '';
        return {
            response: `**Knowledge about "${searchTerm}":**\n\n${list}${actionPrompt}`,
            type: 'text',
            metadata: { system: 'resonance', nodeCount: nodes.length, topic: searchTerm }
        };
    }

    // Default: use LLM to respond (with context engine knowledge when available)
    try {
        // Non-tool-calling path (tool calling is handled earlier in handleChatMessage via handleChatWithTools)
        const { callSubsystemModel } = await import('../../models.js');

        // Use context engine knowledge if available, otherwise fall back to recent nodes
        const knowledgeContext = ctxResult?.knowledge?.length > 0
            ? ctxResult.knowledge.map((k: any) => `- [${k.domain}] ${k.content}`).join('\n')
            : await getRecentKnowledge();

        const prompt = await getPrompt('chat.default_response', {
            context: knowledgeContext,
            message,
        });

        const response = await callSubsystemModel('chat', prompt, {
            systemPrompt: ctxResult?.systemPrompt || undefined,
        });
        return {
            response: response,
            type: 'text',
            metadata: { system: 'llm', contextEnriched: !!ctxResult }
        };
    } catch (_err) {
        return {
            response: `I can help you with:\n\n- **/research <topic>** - Generate foundational seeds about a topic\n- **/seed <text>** - Paste your own text as seed nodes\n- **/voice <topic>** - Find and voice cross-domain connections\n- **/summarize <topic>** - Get a summary of important knowledge\n- **/compress <topic>** - Generate a compressed meta-prompt\n- **/tensions [topic]** - Find contradictions worth exploring\n- **/stats** - View knowledge graph statistics\n- **/synthesis** - Run a synthesis cycle\n- **/dedup [domain] [--apply]** - Find duplicate nodes (dry-run by default)\n- **/templates** - List research brief templates\n\nOr just ask naturally — I'll detect your intent.`,
            type: 'text'
        };
    }
}

/**
 * Fetches the 5 most recently created non-archived nodes as a
 * newline-separated bullet list (each truncated to 100 chars).
 * Used as fallback knowledge context when the context engine is unavailable.
 *
 * @returns A string of bullet-pointed node content snippets.
 */
async function getRecentKnowledge() {
    const nodes = await query(
        `SELECT content FROM nodes WHERE archived = FALSE ORDER BY created_at DESC LIMIT 5`
    );
    return nodes.map(n => `- ${n.content.slice(0, 100)}`).join('\n');
}

/**
 * Formats graph statistics into a Markdown string for display in chat.
 *
 * @param stats - Stats object returned by `handleStats()` from mcp-server.
 * @returns Markdown-formatted stats string.
 */
function formatStats(stats: any) {
    return `**Knowledge Graph Stats**

**Nodes:** ${stats.nodes?.total || 0} total
- Seeds: ${stats.nodes?.seeds || 0}
- Breakthroughs: ${stats.nodes?.breakthroughs || 0}
- Knowledge children: ${stats.nodes?.knowledge || 0}
- Abstraction children: ${stats.nodes?.abstraction || 0}

**Synthesis Engine:**
- Total cycles: ${stats.synthesisCycles?.total || 0}
- Children created: ${stats.synthesisCycles?.childrenCreated || 0}
- Avg resonance: ${stats.synthesisCycles?.avgResonance?.toFixed(3) || 'N/A'}

**Health:**
- Avg weight: ${stats.nodes?.avgWeight?.toFixed(2) || 'N/A'}
- Avg salience: ${stats.nodes?.avgSalience?.toFixed(2) || 'N/A'}
- Avg specificity: ${stats.nodes?.avgSpecificity?.toFixed(2) || 'N/A'}

**Learned Terms:** ${stats.learnedTerms?.total || 0} total${stats.learnedTerms?.total > 0 ? '\n' + Object.entries(stats.learnedTerms?.byDomain || {}).map(([d, n]: [string, any]) => `- ${d}: ${n}`).join('\n') : ''}`;
}
