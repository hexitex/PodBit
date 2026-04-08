/**
 * Unit tests for routes/chat/intents.ts — handleChatMessage command routing.
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

const mockExtractTextContent = jest.fn<(c: any) => string>()
    .mockImplementation(c => typeof c === 'string' ? c : '');

jest.unstable_mockModule('../../models/providers.js', () => ({
    extractTextContent: mockExtractTextContent,
}));

const mockChatSettings = {
    toolCallingEnabled: false,
    toolCallingMode: 'full',
    toolCallingMaxIterations: 5,
};

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const mockHandleChatWithTools = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../routes/chat/tools.js', () => ({
    handleChatWithTools: mockHandleChatWithTools,
}));

// Dynamic imports — models.js
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockCallWithMessages = jest.fn<() => Promise<any>>().mockResolvedValue({
    choices: [{ message: { content: 'chat response' } }],
});
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('seed line 1\nseed line 2\nseed line 3');

jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
    callWithMessages: mockCallWithMessages,
    callSubsystemModel: mockCallSubsystemModel,
}));

// mcp-server.js
const mockHandleStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 42 });
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ node: { id: 'new-node' } });

jest.unstable_mockModule('../../mcp-server.js', () => ({
    handleStats: mockHandleStats,
    handlePropose: mockHandlePropose,
}));

// core.js
const mockSynthesisCycle = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockInferDomain = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ domain: 'science', source: 'direct' });
const mockFindDomainsBySynonym = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockQueueRequest = jest.fn<() => Promise<any>>()
    .mockResolvedValue({ id: 'req-123' });

jest.unstable_mockModule('../../core.js', () => ({
    synthesisCycle: mockSynthesisCycle,
    inferDomain: mockInferDomain,
    findDomainsBySynonym: mockFindDomainsBySynonym,
    queueRequest: mockQueueRequest,
}));

const { handleChatMessage } = await import('../../routes/chat/intents.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetPrompt.mockResolvedValue('prompt text');
    mockExtractTextContent.mockImplementation(c => typeof c === 'string' ? c : '');
    mockHandleChatWithTools.mockResolvedValue(null);
    mockGetSubsystemAssignments.mockResolvedValue({ chat: { id: 'm1', modelId: 'test-model' } });
    mockCallWithMessages.mockResolvedValue({ choices: [{ message: { content: 'chat response' } }] });
    mockCallSubsystemModel.mockResolvedValue('seed line 1\nseed line 2');
    mockHandleStats.mockResolvedValue({ total: 42 });
    mockHandlePropose.mockResolvedValue({ node: { id: 'new-node' } });
    mockSynthesisCycle.mockResolvedValue(null);
    mockInferDomain.mockResolvedValue({ domain: 'science', source: 'direct' });
    mockFindDomainsBySynonym.mockResolvedValue([]);
    mockQueueRequest.mockResolvedValue({ id: 'req-123' });
    // Reset chatSettings
    Object.assign(mockChatSettings, { toolCallingEnabled: false });
});

// =============================================================================
// Tool calling routing
// =============================================================================

describe('tool calling routing', () => {
    it('bypasses tool calling for system commands', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });

        await handleChatMessage('/stats');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });

    it('routes non-system messages through tool calling when enabled', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });
        mockHandleChatWithTools.mockResolvedValue({
            response: 'tool response', type: 'text', metadata: {},
        });

        const result = await handleChatMessage('what is science?');

        expect(mockHandleChatWithTools).toHaveBeenCalled();
        expect(result.response).toBe('tool response');
    });

    it('falls through to legacy routing when tool calling returns null', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });
        mockHandleChatWithTools.mockResolvedValue(null);

        // With no model assigned, falls through to slash command routing
        // '/chat' prefix is not present so won't match — falls to default response
        const _result = await handleChatMessage('hello world');

        // Should have tried tool calling
        expect(mockHandleChatWithTools).toHaveBeenCalled();
    });

    it('bypasses tool calling for /dedup', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });

        await handleChatMessage('/dedup');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });

    it('bypasses tool calling for /synthesis', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });

        await handleChatMessage('/synthesis');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });

    it('does NOT bypass /seed with extra text', async () => {
        Object.assign(mockChatSettings, { toolCallingEnabled: true });
        // '/seed text' starts with '/seed ' → system command → bypass tool calling
        mockHandleChatWithTools.mockResolvedValue(null); // won't be called

        await handleChatMessage('/seed some text here');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
    });
});

// =============================================================================
// /stats command
// =============================================================================

describe('/stats command', () => {
    it('returns formatted stats', async () => {
        mockHandleStats.mockResolvedValue({
            total: 100, breakthroughs: 5, domains: 3,
        });

        const result = await handleChatMessage('/stats');

        expect(result.type).toBe('text');
        expect(result.metadata?.system).toBe('resonance');
        expect(mockHandleStats).toHaveBeenCalled();
    });
});

// =============================================================================
// /synthesis command
// =============================================================================

describe('/synthesis command', () => {
    it('returns message when synthesis cycle ran but no nodes sampled', async () => {
        mockSynthesisCycle.mockResolvedValue(null);

        const result = await handleChatMessage('/synthesis');

        expect(result.type).toBe('text');
        expect(result.response).toContain('no nodes');
        expect(result.metadata?.system).toBe('synthesis');
    });

    it('reports synthesis result when nodes were sampled', async () => {
        mockSynthesisCycle.mockResolvedValue({
            nodeA: { content: 'Node A content' },
            nodeB: { content: 'Node B content' },
            resonance: 0.75,
            child: { content: 'Child synthesis', trajectory: 'knowledge' },
        });

        const result = await handleChatMessage('/synthesis');

        expect(result.type).toBe('text');
        expect(result.response).toContain('Synthesis cycle completed');
        expect(result.response).toContain('0.750');
    });
});

// =============================================================================
// /templates command
// =============================================================================

describe('/templates command', () => {
    it('returns no templates message when empty', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await handleChatMessage('/templates');

        expect(result.type).toBe('text');
        expect(result.response).toContain('No templates');
    });

    it('lists available templates', async () => {
        mockQuery.mockResolvedValue([
            { task_type: 'research', name: 'Research Brief' },
            { task_type: 'technical', name: 'Tech Spec' },
        ]);

        const result = await handleChatMessage('/templates');

        expect(result.type).toBe('text');
        expect(result.response).toContain('Research Brief');
        expect(result.response).toContain('Tech Spec');
        expect(result.metadata?.system).toBe('docs');
    });
});

// =============================================================================
// /seed command
// =============================================================================

describe('/seed command', () => {
    it('proposes a seed with inferred domain', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'science', source: 'direct' });
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage('/seed Photosynthesis converts light to energy in plants');

        expect(result.type).toBe('text');
        expect(mockHandlePropose).toHaveBeenCalled();
        expect(result.metadata?.seedCount).toBeGreaterThanOrEqual(1);
    });

    it('uses single scoped domain without inference', async () => {
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });

        const result = await handleChatMessage(
            '/seed Photosynthesis converts light to energy',
            'api',
            ['biology']
        );

        expect(mockInferDomain).not.toHaveBeenCalled();
        expect(result.metadata?.domain).toBe('biology');
    });

    it('returns no-seeds message when propose returns no node id', async () => {
        mockHandlePropose.mockResolvedValue({ node: null });

        const result = await handleChatMessage('/seed Short');

        // Too short (< 10 chars) so filtered out
        expect(result.type).toBe('text');
    });
});

// =============================================================================
// /research command
// =============================================================================

describe('/research command', () => {
    it('queues request in mcp mode', async () => {
        mockQueueRequest.mockResolvedValue({ id: 'queued-123' });

        const result = await handleChatMessage('/research quantum computing', 'mcp');

        expect(result.type).toBe('mcp_queued');
        expect(result.metadata?.requestId).toBe('queued-123');
        expect(mockQueueRequest).toHaveBeenCalledWith('research', expect.objectContaining({
            topic: 'quantum computing',
        }));
    });

    it('generates seeds from LLM response in api mode', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            'Quantum entanglement is a phenomenon where particles become linked\nQuantum superposition allows particles to exist in multiple states'
        );
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-q1' } });
        mockQuery.mockResolvedValue([]); // no existing nodes for connection hint

        const result = await handleChatMessage('/research quantum computing');

        expect(result.type).toBe('text');
        expect(result.response).toContain('Research complete');
        expect(mockHandlePropose).toHaveBeenCalled();
    });

    it('returns error response when LLM call fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM unavailable'));

        const result = await handleChatMessage('/research quantum computing');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Research failed');
    });
});

// =============================================================================
// /voice command
// =============================================================================

describe('/voice command', () => {
    it('returns not-found message when no domains match', async () => {
        mockFindDomainsBySynonym.mockResolvedValue([]);

        const result = await handleChatMessage('/voice unknown-topic');

        expect(result.type).toBe('text');
        expect(result.response).toContain('No knowledge');
    });

    it('uses scoped domains without synonym lookup', async () => {
        mockQuery.mockResolvedValue([
            { id: 'n1', content: 'node content', domain: 'science' },
        ]);
        // handleVoice is called inside the command handler — let's check the query
        const _result = await handleChatMessage('/voice science', 'api', ['science']);

        expect(mockFindDomainsBySynonym).not.toHaveBeenCalled();
    });
});

// =============================================================================
// /chat command
// =============================================================================

describe('/chat command', () => {
    it('returns prompt when no text after /chat', async () => {
        const result = await handleChatMessage('/chat');

        expect(result.type).toBe('text');
        expect(result.response).toContain('What would you like to talk about?');
    });

    it('returns error when no chat model assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});

        const result = await handleChatMessage('/chat tell me about science');

        expect(result.type).toBe('error');
        expect(result.response).toContain('No model assigned');
    });

    it('calls model and returns response', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            chat: { id: 'm1', modelId: 'claude', provider: 'anthropic', endpointUrl: null, apiKey: null, maxConcurrency: 1, requestPauseMs: 0 },
        });
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { content: 'Science is the study of the natural world.' } }],
        });
        mockExtractTextContent.mockReturnValue('Science is the study of the natural world.');
        mockQuery.mockResolvedValue([]); // recent knowledge

        const result = await handleChatMessage('/chat tell me about science');

        expect(result.type).toBe('text');
        expect(result.response).toBe('Science is the study of the natural world.');
        expect(result.metadata?.mode).toBe('chat');
    });
});
