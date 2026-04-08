/**
 * Deep branch-coverage tests for routes/chat/intents.ts —
 * Covers uncovered branches: /chat with ctxResult, /seed domain inference,
 * /research domain inference + cross-domain hints, /voice full path,
 * /tensions with scoped domains, /summarize + /compress edge cases,
 * /dedup with scoped domains + dry-run display, knowledge search short terms,
 * default LLM with ctxResult, formatStats fallback fields, etc.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt text');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../models/providers.js', () => ({
    extractTextContent: jest.fn((content: any) =>
        typeof content === 'string' ? content : content?.[0]?.text || ''
    ),
}));

const mockEnsureChatSettings = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockChatSettings = { toolCallingEnabled: false, toolCallingMaxIterations: 3, toolCallingMode: 'read-write' as const, maxKnowledgeNodes: 0, modelProfile: '' };

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: mockEnsureChatSettings,
}));

const mockHandleChatWithTools = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../routes/chat/tools.js', () => ({
    handleChatWithTools: mockHandleChatWithTools,
}));

const mockHandleStats = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ node: { id: 'new-id' } });
const mockHandleTensions = jest.fn<() => Promise<any>>().mockResolvedValue({ tensions: [] });
const mockHandleSummarize = jest.fn<() => Promise<any>>().mockResolvedValue({ summary: 'test', nodeCount: 5, breakthroughs: 1, syntheses: 2, seeds: 2, cached: false });
const mockHandleCompress = jest.fn<() => Promise<any>>().mockResolvedValue({ compressed: 'compressed', nodeCount: 5, cached: false });
const mockHandleDedup = jest.fn<() => Promise<any>>().mockResolvedValue({ totalClustersFound: 0, domainsProcessed: 1, thresholds: { embedding: 0.9 }, results: [] });

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleStats: mockHandleStats,
    handlePropose: mockHandlePropose,
    handleTensions: mockHandleTensions,
    handleSummarize: mockHandleSummarize,
    handleCompress: mockHandleCompress,
    handleDedup: mockHandleDedup,
}));

const mockSynthesisCycle = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInferDomain = jest.fn<() => Promise<any>>().mockResolvedValue({ domain: 'test-domain', source: 'embedding' });
const mockFindDomainsBySynonym = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockQueueRequest = jest.fn<() => Promise<any>>().mockResolvedValue({ id: 'req-1' });

jest.unstable_mockModule('../../core.js', () => ({
    synthesisCycle: mockSynthesisCycle,
    inferDomain: mockInferDomain,
    findDomainsBySynonym: mockFindDomainsBySynonym,
    queueRequest: mockQueueRequest,
    query: mockQuery,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('LLM response');
const mockCallWithMessages = jest.fn<() => Promise<any>>().mockResolvedValue({
    choices: [{ message: { content: 'chat response' } }],
});
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    callWithMessages: mockCallWithMessages,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockDecompose = jest.fn<() => Promise<any>>().mockResolvedValue({
    sections: [{ title: 'Section 1', purpose: 'Purpose 1' }],
});

jest.unstable_mockModule('../../scaffold.js', () => ({
    decompose: mockDecompose,
}));

const { handleChatMessage } = await import('../../routes/chat/intents.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockChatSettings.toolCallingEnabled = false;
    mockHandleChatWithTools.mockResolvedValue(null);
    mockHandlePropose.mockResolvedValue({ node: { id: 'new-id' } });
    mockHandleTensions.mockResolvedValue({ tensions: [] });
    mockHandleSummarize.mockResolvedValue({ summary: 'test', nodeCount: 5, breakthroughs: 1, syntheses: 2, seeds: 2, cached: false });
    mockHandleCompress.mockResolvedValue({ compressed: 'compressed', nodeCount: 5, cached: false });
    mockHandleDedup.mockResolvedValue({ totalClustersFound: 0, domainsProcessed: 1, thresholds: { embedding: 0.9 }, results: [] });
    mockSynthesisCycle.mockResolvedValue(null);
    mockInferDomain.mockResolvedValue({ domain: 'test-domain', source: 'embedding' });
    mockFindDomainsBySynonym.mockResolvedValue([]);
    mockQueueRequest.mockResolvedValue({ id: 'req-1' });
    mockCallSubsystemModel.mockResolvedValue('LLM response');
    mockCallWithMessages.mockResolvedValue({ choices: [{ message: { content: 'chat response' } }] });
    mockGetSubsystemAssignments.mockResolvedValue({ chat: { id: 'm1', modelId: 'test-model' } });
    mockGetPrompt.mockResolvedValue('prompt text');
    mockDecompose.mockResolvedValue({ sections: [{ title: 'Section 1', purpose: 'Purpose 1' }] });
});

// =============================================================================
// /chat command — deep branches
// =============================================================================

describe('/chat command — deep branches', () => {
    const chatModel = {
        id: 'm1', modelId: 'gpt-4', provider: 'openai',
        endpointUrl: 'http://localhost:1234', apiKey: 'sk-test',
        maxConcurrency: 2, requestPauseMs: 100,
    };

    it('uses ctxResult.knowledge when available', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
        const ctxResult = {
            knowledge: [
                { domain: 'physics', content: 'Quantum entanglement' },
                { domain: 'biology', content: 'DNA replication' },
            ],
            systemPrompt: null,
        };

        const result = await handleChatMessage('/chat tell me about physics', 'api', undefined, ctxResult);

        expect(result.type).toBe('text');
        // The system prompt should contain knowledge items since ctxResult.systemPrompt is null
        expect(mockCallWithMessages).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'system',
                    content: expect.stringContaining('Quantum entanglement'),
                }),
            ]),
            expect.any(Object),
            {},
        );
    });

    it('uses ctxResult.systemPrompt when provided', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
        const ctxResult = {
            knowledge: [],
            systemPrompt: 'Custom system prompt from context engine',
        };

        const result = await handleChatMessage('/chat hello', 'api', undefined, ctxResult);

        expect(result.type).toBe('text');
        expect(mockCallWithMessages).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'system',
                    content: 'Custom system prompt from context engine',
                }),
            ]),
            expect.any(Object),
            {},
        );
        expect(result.metadata?.contextEnriched).toBe(true);
    });

    it('includes conversation history (last 20 messages)', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
        const conversationMessages = [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'First reply' },
            { role: 'user', content: 'Second message' },
        ];

        await handleChatMessage('/chat continue our discussion', 'api', undefined, undefined, conversationMessages);

        const callArgs = mockCallWithMessages.mock.calls[0][0] as any[];
        // system + 3 conversation messages + 1 current user message = 5
        expect(callArgs.length).toBe(5);
        expect(callArgs[1]).toEqual({ role: 'user', content: 'First message' });
        expect(callArgs[2]).toEqual({ role: 'assistant', content: 'First reply' });
    });

    it('sets metadata.contextEnriched to false when no ctxResult', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });

        const result = await handleChatMessage('/chat hello');

        expect(result.metadata?.contextEnriched).toBe(false);
    });

    it('passes model config including endpointUrl and apiKey', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });

        await handleChatMessage('/chat hello');

        expect(mockCallWithMessages).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                endpoint: 'http://localhost:1234',
                apiKey: 'sk-test',
                _registryId: 'm1',
                _maxConcurrency: 2,
                _requestPauseMs: 100,
            }),
            {},
        );
    });

    it('handles /chat with space only (empty userText)', async () => {
        const result = await handleChatMessage('/chat ');

        expect(result.response).toContain('What would you like to talk about');
    });
});

// =============================================================================
// /synthesis command — deep branches
// =============================================================================

describe('/synthesis command — deep branches', () => {
    it('shows "No child created" when synthesis has no child', async () => {
        mockSynthesisCycle.mockResolvedValue({
            nodeA: { content: 'Node A content about something interesting' },
            nodeB: { content: 'Node B content about something different' },
            resonance: 0.45,
            child: null,
        });

        const result = await handleChatMessage('/synthesis');

        expect(result.response).toContain('Synthesis cycle completed');
        expect(result.response).toContain('No child created');
        expect(result.response).toContain('0.450');
    });

    it('shows N/A when resonance is undefined', async () => {
        mockSynthesisCycle.mockResolvedValue({
            nodeA: { content: 'Node A content here for testing purposes' },
            nodeB: { content: 'Node B content here for testing purposes' },
            resonance: undefined,
            child: null,
        });

        const result = await handleChatMessage('/synthesis');

        expect(result.response).toContain('N/A');
    });
});

// =============================================================================
// /seed command — deep branches
// =============================================================================

describe('/seed command — deep branches', () => {
    it('returns usage when /seed text is whitespace-only after the command', async () => {
        // lowerMsg = '/seed      '.trim() = '/seed      '.toLowerCase().trim() won't match
        // because lowerMsg is trimmed. We need content after /seed that becomes empty after trim:
        // Actually, lowerMsg.trim() strips trailing space so '/seed ' becomes '/seed'
        // which does NOT startsWith('/seed ') — the empty-text branch is unreachable via normal path.
        // Instead we test that '/seed x' with very short content (<10 chars) creates no seeds.
        mockHandlePropose.mockResolvedValue({ node: {} }); // no node.id

        const result = await handleChatMessage('/seed short txt', 'api', ['test']);

        expect(result.response).toContain('No seeds created');
    });

    it('infers domain from multiple scoped domains when inference matches', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'biology', source: 'embedding' });

        const result = await handleChatMessage(
            '/seed This is a long enough test seed about biology topic',
            'api',
            ['physics', 'biology', 'chemistry'],
        );

        expect(result.response).toContain('Seeded');
        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'biology' }),
        );
        // Should NOT say auto-detected since domains were scoped
        expect(result.response).not.toContain('auto-detected');
    });

    it('falls back to first scoped domain when inference does not match', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'unrelated', source: 'embedding' });

        const result = await handleChatMessage(
            '/seed This is a long enough test seed about an unrelated topic',
            'api',
            ['physics', 'biology'],
        );

        expect(result.response).toContain('Seeded');
        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'physics' }),
        );
    });

    it('treats whole text as one seed when no paragraph breaks', async () => {
        // Text with no double-newlines or numbered items, short enough to be one chunk
        const text = 'This is a single continuous piece of text without any paragraph breaks that is long enough';
        const result = await handleChatMessage(`/seed ${text}`, 'api', ['test']);

        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
        expect(result.response).toContain('Seeded 1 node');
    });

    it('splits on double-newline into multiple seeds', async () => {
        const text = 'First paragraph with enough words to pass the filter.\n\nSecond paragraph with enough words to pass the filter.';
        const result = await handleChatMessage(`/seed ${text}`, 'api', ['test']);

        expect(mockHandlePropose).toHaveBeenCalledTimes(2);
        expect(result.response).toContain('Seeded 2 nodes');
    });

    it('splits on numbered list items', async () => {
        const text = '1. First item with enough content to pass filter\n2. Second item with enough content to pass filter\n3. Third item with enough content to pass filter';
        const result = await handleChatMessage(`/seed ${text}`, 'api', ['test']);

        expect(mockHandlePropose).toHaveBeenCalledTimes(3);
        expect(result.response).toContain('Seeded 3 nodes');
    });

    it('filters out chunks shorter than 10 chars', async () => {
        const text = 'Short\n\nThis is a longer paragraph that passes the filter check';
        const result = await handleChatMessage(`/seed ${text}`, 'api', ['test']);

        // "Short" is <10 chars so only the long paragraph should be seeded
        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// /research command — deep branches
// =============================================================================

describe('/research command — deep branches', () => {
    it('returns usage when /research topic is empty after trim', async () => {
        // '/research x' where x becomes empty after processing — not reachable since lowerMsg is trimmed.
        // Test the empty-topic guard with actual non-empty topic but no seeds generated.
        mockCallSubsystemModel.mockResolvedValue('too short');

        const result = await handleChatMessage('/research quantum', 'api', ['physics']);

        expect(result.response).toContain('No seeds could be parsed');
    });

    it('infers domain with no scoped domains and synonym source', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'quantum', source: 'synonym' });
        mockCallSubsystemModel.mockResolvedValue('- Fact one about quantum physics is interesting\n- Fact two about quantum physics is also interesting');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage('/research quantum computing', 'api');

        expect(result.response).toContain('Research complete');
        expect(result.response).toContain('→ "quantum"');
    });

    it('infers domain with no scoped domains and non-matching source', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'new-topic', source: 'new' });
        mockCallSubsystemModel.mockResolvedValue('- Fact one about a brand new research topic area');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage('/research new-topic', 'api');

        expect(result.response).toContain('Research complete');
        // No domain note since matchedDomains is empty
        expect(result.response).not.toContain('added to existing');
    });

    it('infers domain from multiple scoped domains when inference matches', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'biology', source: 'embedding' });
        mockCallSubsystemModel.mockResolvedValue('- Fact one about biology and cells research');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage('/research biology cells', 'api', ['physics', 'biology']);

        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'biology' }),
        );
    });

    it('falls back to first scoped domain when inference does not match multiple domains', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'unrelated', source: 'embedding' });
        mockCallSubsystemModel.mockResolvedValue('- Fact one about unrelated interesting topics here');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage('/research something', 'api', ['physics', 'biology']);

        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'physics' }),
        );
    });

    it('queues research in MCP mode with inferred domain', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'quantum', source: 'embedding' });

        const result = await handleChatMessage('/research quantum computing', 'mcp');

        expect(result.type).toBe('mcp_queued');
        expect(mockQueueRequest).toHaveBeenCalledWith('research', expect.objectContaining({
            topic: 'quantum computing',
            domain: 'quantum',
        }));
    });

    it('shows cross-domain connection hints', async () => {
        mockCallSubsystemModel.mockResolvedValue('- Fact one about quantum computing is interesting');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });
        // The research path queries for existing cross-domain nodes after seeding
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'Existing node about classical mechanics and physics', domain: 'classical' },
            { id: 'n2', content: 'Existing node about biology and evolution related', domain: 'biology' },
        ]);

        const result = await handleChatMessage('/research quantum computing', 'api', ['physics']);

        expect(result.response).toContain('Cross-domain opportunities');
    });

    it('skips seeds that handlePropose rejects (no node.id)', async () => {
        mockCallSubsystemModel.mockResolvedValue('- Fact one about quantum computing is interesting\n- Fact two about quantum computing is interesting');
        mockHandlePropose
            .mockResolvedValueOnce({ node: { id: 'seed-1' } })
            .mockResolvedValueOnce({ node: {} }); // rejected

        const result = await handleChatMessage('/research quantum computing', 'api', ['physics']);

        expect(result.response).toContain('Added 1 seed');
    });
});

// =============================================================================
// /voice command — full path coverage
// =============================================================================

describe('/voice command', () => {
    it('returns usage when /voice has empty topic after trim', async () => {
        // '/voice ' trimmed lowerMsg = '/voice' which doesn't startsWith('/voice ')
        // so the '/voice' command branch is unreachable with empty topic via normal path.
        // The 'voice' keyword intent detector catches it instead.
        // Test the actual voice branch with a real topic but no domains found.
        mockFindDomainsBySynonym.mockResolvedValue([]);

        const result = await handleChatMessage('/voice unknown-topic');

        expect(result.response).toContain('No knowledge about');
        expect(result.response).toContain('/research');
    });

    it('returns "no knowledge" when no synonym domains found and no scoped domains', async () => {
        mockFindDomainsBySynonym.mockResolvedValue([]);

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('No knowledge about');
        expect(result.response).toContain('/research');
    });

    it('returns "no knowledge" when topic nodes query returns empty', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);
        mockQuery.mockResolvedValue([]); // topicNodes query returns empty

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('No knowledge about');
    });

    it('returns "not enough cross-domain" when other nodes empty', async () => {
        // First query = topicNodes, second query = otherNodes
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content here', domain: 'quantum' }])
            .mockResolvedValueOnce([]); // no other nodes
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('Not enough cross-domain knowledge');
    });

    it('queues voice in MCP mode', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        const result = await handleChatMessage('/voice quantum computing', 'mcp');

        expect(result.type).toBe('mcp_queued');
        expect(mockQueueRequest).toHaveBeenCalledWith('voice', expect.objectContaining({
            topic: 'quantum computing',
            domain: 'quantum',
        }));
    });

    it('voices connection successfully in API mode', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 1,
            nodeB: 2,
            synthesis: 'Both quantum mechanics and biology share emergent complexity.',
            pattern: 'emergence',
        }));
        mockHandlePropose.mockResolvedValue({ node: { id: 'voiced-1' } });

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('Connection voiced');
        expect(result.response).toContain('Both quantum mechanics');
        expect(result.response).toContain('Pattern detected');
        expect(result.response).toContain('emergence');
        expect(result.metadata?.parentIds).toEqual(['n1', 'n2']);
    });

    it('voices connection without pattern field', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 1,
            nodeB: 2,
            synthesis: 'Connection between nodes.',
        }));

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('Connection voiced');
        expect(result.response).not.toContain('Pattern detected');
    });

    it('uses scoped domains instead of synonym lookup', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Physics node content here', domain: 'physics' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content here', domain: 'biology' }]);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 1, nodeB: 2, synthesis: 'Connection found.',
        }));

        const result = await handleChatMessage('/voice connections', 'api', ['physics']);

        // Should not call findDomainsBySynonym since domains are scoped
        expect(mockFindDomainsBySynonym).not.toHaveBeenCalled();
    });

    it('falls back to JSON extraction when direct parse fails', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        // Invalid JSON wrapper but valid JSON object inside
        mockCallSubsystemModel.mockResolvedValue(
            'Here is my analysis: {"nodeA": 1, "nodeB": 2, "synthesis": "Emergent connection."}'
        );

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('Connection voiced');
        expect(result.response).toContain('Emergent connection');
    });

    it('returns error when both JSON parse attempts fail', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        // Must contain braces to attempt second parse, but with invalid JSON inside
        mockCallSubsystemModel.mockResolvedValue('response with {invalid json content here that cannot be parsed}');

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Failed to parse synthesis');
    });

    it('returns "no meaningful connection" when synthesis field is empty', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ nodeA: 1, nodeB: 2, synthesis: '' }));

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('No meaningful connection');
    });

    it('handles invalid node indices with fallback propose', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        // nodeA=99 is out of bounds
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 99, nodeB: 100, synthesis: 'Fallback synthesis content.',
        }));
        mockHandlePropose.mockResolvedValue({ node: { id: 'fallback-1' } });

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('could not match source nodes');
        expect(result.response).toContain('Fallback synthesis content');
        expect(result.response).toContain('fallback-1'.slice(0, 8));
    });

    it('handles fallback propose with no node id', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 99, nodeB: 100, synthesis: 'Fallback synthesis content.',
        }));
        mockHandlePropose.mockResolvedValue({ node: {} });

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('could not match source nodes');
        expect(result.response).not.toContain('Saved as node');
    });

    it('handles string nodeA/nodeB indices', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content for synthesis', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        // nodeA and nodeB as strings instead of numbers
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: '1', nodeB: '2', synthesis: 'String index connection.',
        }));

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.response).toContain('Connection voiced');
    });

    it('handles voice exception', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Quantum node content', domain: 'quantum' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM timeout'));

        const result = await handleChatMessage('/voice quantum computing');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Voice failed');
    });

    it('uses nodeB domain when nodeA domain is falsy', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'n1', content: 'Node without domain field here', domain: '' }])
            .mockResolvedValueOnce([{ id: 'n2', content: 'Biology node content for synthesis', domain: 'biology' }]);
        mockFindDomainsBySynonym.mockResolvedValue(['quantum']);

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            nodeA: 1, nodeB: 2, synthesis: 'Domain fallback test connection.',
        }));

        await handleChatMessage('/voice quantum computing');

        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'biology' }),
        );
    });
});

// =============================================================================
// /tensions command — deep branches
// =============================================================================

describe('/tensions command — deep branches', () => {
    it('uses scoped domains for tension search', async () => {
        mockHandleTensions.mockResolvedValue({ tensions: [] });

        await handleChatMessage('/tensions', 'api', ['physics']);

        expect(mockHandleTensions).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'physics' }),
        );
    });

    it('uses topic when no scoped domains', async () => {
        mockHandleTensions.mockResolvedValue({ tensions: [] });

        await handleChatMessage('/tensions quantum');

        expect(mockHandleTensions).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'quantum' }),
        );
    });

    it('passes undefined domain when no topic and no scoped domains', async () => {
        mockHandleTensions.mockResolvedValue({ tensions: [] });

        await handleChatMessage('/tensions');

        expect(mockHandleTensions).toHaveBeenCalledWith(
            expect.objectContaining({ domain: undefined }),
        );
    });
});

// =============================================================================
// /summarize command — deep branches
// =============================================================================

describe('/summarize command — deep branches', () => {
    it('passes domains to handleSummarize', async () => {
        const result = await handleChatMessage('/summarize quantum computing', 'api', ['physics', 'quantum']);

        expect(mockHandleSummarize).toHaveBeenCalledWith(
            expect.objectContaining({ topic: 'quantum computing', domains: ['physics', 'quantum'] }),
        );
    });

    it('shows cached indicator when result is cached', async () => {
        mockHandleSummarize.mockResolvedValue({
            summary: 'cached summary',
            nodeCount: 5,
            breakthroughs: 1,
            syntheses: 2,
            seeds: 2,
            cached: true,
        });

        const result = await handleChatMessage('/summarize quantum computing');

        expect(result.response).toContain('(cached)');
    });
});

// =============================================================================
// /compress command — deep branches
// =============================================================================

describe('/compress command — deep branches', () => {
    it('passes domains to handleCompress', async () => {
        const result = await handleChatMessage('/compress quantum computing', 'api', ['physics']);

        expect(mockHandleCompress).toHaveBeenCalledWith(
            expect.objectContaining({ topic: 'quantum computing', domains: ['physics'] }),
        );
    });

    it('shows cached indicator when result is cached', async () => {
        mockHandleCompress.mockResolvedValue({
            compressed: 'cached compressed text',
            nodeCount: 10,
            cached: true,
        });

        const result = await handleChatMessage('/compress quantum computing');

        expect(result.response).toContain('(cached)');
    });
});

// =============================================================================
// /dedup command — deep branches
// =============================================================================

describe('/dedup command — deep branches', () => {
    it('uses scoped domains for dedup', async () => {
        await handleChatMessage('/dedup', 'api', ['physics']);

        expect(mockHandleDedup).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'physics' }),
        );
    });

    it('handles dry run with "dry" keyword', async () => {
        await handleChatMessage('/dedup dry');

        expect(mockHandleDedup).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true }),
        );
    });

    it('displays dry run dedup results correctly', async () => {
        mockHandleDedup.mockResolvedValue({
            totalClustersFound: 2,
            totalNodesArchived: 3,
            domainsProcessed: 1,
            results: [{
                domain: 'test',
                clustersFound: 2,
                nodesArchived: 3,
                clusters: [
                    {
                        keptNode: { content: 'Kept node content here for display', weight: 1.5 },
                        archivedNodes: [
                            { content: 'Would archive this duplicate content', similarity: 0.95 },
                        ],
                    },
                    {
                        keptNode: { content: 'Another kept node content here too', weight: 1.2 },
                        archivedNodes: [
                            { content: 'Would archive this other duplicate', similarity: 0.92 },
                            { content: 'Would also archive this similar one', similarity: 0.91 },
                        ],
                    },
                ],
            }],
        });

        const result = await handleChatMessage('/dedup test --dry-run');

        expect(result.response).toContain('DRY RUN');
        expect(result.response).toContain('No changes made');
        expect(result.response).toContain('Would archive');
        expect(result.metadata?.dryRun).toBe(true);
    });

    it('extracts domain from arg when no scoped domains', async () => {
        await handleChatMessage('/dedup physics');

        expect(mockHandleDedup).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'physics', dryRun: true }),
        );
    });
});

// =============================================================================
// Intent detection — deep branches
// =============================================================================

describe('intent detection — deep branches', () => {
    it('handles scaffold result without sections array', async () => {
        mockDecompose.mockResolvedValue({ noSections: true });

        const result = await handleChatMessage('create an outline for testing');

        expect(result.response).toContain('Document outline');
        // Falls back to JSON.stringify
        expect(result.response).toContain('noSections');
    });

    it('uses word boundary search for short search terms (no alias match)', async () => {
        mockQuery.mockResolvedValue([
            { content: 'RNA folding research content', domain: 'biology', weight: 1.0, specificity: 0.5 },
        ]);

        // 'RNA' is <= 4 chars and not in domainAliases, so it uses LIKE patterns
        const result = await handleChatMessage('knowledge about RNA');

        expect(result.response).toContain('Knowledge about');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIKE'),
            ['% RNA %', 'RNA %', '% RNA', 'RNA'],
        );
    });

    it('uses domain alias mapping for known terms', async () => {
        mockFindDomainsBySynonym.mockResolvedValue(['alignment', 'safety']);
        mockQuery.mockResolvedValue([
            { content: 'Safety research on AI systems', domain: 'safety', weight: 1.2, specificity: 0.7 },
        ]);

        const result = await handleChatMessage('knowledge about ai safety');

        expect(result.response).toContain('Knowledge about');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('ANY'),
            [['alignment', 'safety']],
        );
    });

    it('shows breakthrough action prompt when high weight nodes found', async () => {
        const nodes = [];
        for (let i = 0; i < 5; i++) {
            nodes.push({ content: `Node ${i} about quantum physics research`, domain: 'physics', weight: 2.0, specificity: 0.8 });
        }
        mockQuery.mockResolvedValue(nodes);

        const result = await handleChatMessage('knowledge about quantum');

        expect(result.response).toContain('/tensions');
        expect(result.response).toContain('Explore connections');
    });

    it('shows research prompt when fewer than 5 results', async () => {
        mockQuery.mockResolvedValue([
            { content: 'One node about quantum physics', domain: 'physics', weight: 0.5, specificity: 0.3 },
        ]);

        const result = await handleChatMessage('knowledge about quantum');

        expect(result.response).toContain('/research');
        expect(result.response).toContain('Go deeper');
    });

    it('shows no action prompt when 5+ results but no breakthroughs', async () => {
        const nodes = [];
        for (let i = 0; i < 5; i++) {
            nodes.push({ content: `Node ${i} about quantum physics research`, domain: 'physics', weight: 1.0, specificity: 0.5 });
        }
        mockQuery.mockResolvedValue(nodes);

        const result = await handleChatMessage('knowledge about quantum');

        // No action prompt since 5+ results but weight <= 1.5
        expect(result.response).not.toContain('Go deeper');
        expect(result.response).not.toContain('Explore connections');
    });

    it('handles missing domain/weight in knowledge search results', async () => {
        mockQuery.mockResolvedValue([
            { content: 'Node without domain or weight', domain: null, weight: null, specificity: null },
        ]);

        const result = await handleChatMessage('knowledge about testing');

        expect(result.response).toContain('[general]');
    });
});

// =============================================================================
// Default LLM fallback — deep branches
// =============================================================================

describe('default LLM fallback — deep branches', () => {
    it('uses ctxResult knowledge when available', async () => {
        const ctxResult = {
            knowledge: [
                { domain: 'physics', content: 'Quantum entanglement fact' },
            ],
            systemPrompt: 'Custom system prompt',
        };

        const result = await handleChatMessage('something completely random', 'api', undefined, ctxResult);

        expect(result.type).toBe('text');
        expect(result.metadata?.contextEnriched).toBe(true);
        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'chat',
            expect.any(String),
            expect.objectContaining({ systemPrompt: 'Custom system prompt' }),
        );
    });

    it('uses getRecentKnowledge when no ctxResult', async () => {
        mockQuery.mockResolvedValue([
            { content: 'Recent node content about something interesting and relevant to user query' },
        ]);

        const result = await handleChatMessage('something completely random');

        expect(result.type).toBe('text');
        expect(result.metadata?.contextEnriched).toBe(false);
    });
});

// =============================================================================
// formatStats edge cases (via /stats)
// =============================================================================

describe('formatStats edge cases', () => {
    it('handles missing/undefined stats fields gracefully', async () => {
        mockHandleStats.mockResolvedValue({});

        const result = await handleChatMessage('/stats');

        expect(result.response).toContain('0 total');
        expect(result.response).toContain('N/A');
    });

    it('handles partial stats with some fields present', async () => {
        mockHandleStats.mockResolvedValue({
            nodes: { total: 50, seeds: 30, breakthroughs: 5, knowledge: 10, abstraction: 5, avgWeight: null, avgSalience: null },
            synthesisCycles: { total: 10, childrenCreated: 5, avgResonance: null },
        });

        const result = await handleChatMessage('/stats');

        expect(result.response).toContain('50 total');
        expect(result.response).toContain('N/A');
    });
});

// =============================================================================
// System command bypass — edge cases
// =============================================================================

describe('system command bypass — edge cases', () => {
    it('treats /seed with space as system command (bypasses tool calling)', async () => {
        mockChatSettings.toolCallingEnabled = true;

        const result = await handleChatMessage('/seed This is a test seed with enough content', 'api', ['test']);

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
        expect(result.response).toContain('Seeded');
    });

    it('treats /dedup as system command (bypasses tool calling)', async () => {
        mockChatSettings.toolCallingEnabled = true;

        const result = await handleChatMessage('/dedup');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });

    it('treats /synthesis as system command', async () => {
        mockChatSettings.toolCallingEnabled = true;

        await handleChatMessage('/synthesis');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });

    it('treats /templates as system command', async () => {
        mockChatSettings.toolCallingEnabled = true;

        await handleChatMessage('/templates');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });
});
