/**
 * Deep unit tests for routes/chat/tools.ts —
 * Covers: no chat model, supportsTools=false, slash command parsing,
 * tool context building, empty response, domain query failure,
 * project context failure, full happy path with tool calls.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('system prompt text');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../models/providers.js', () => ({
    extractTextContent: jest.fn((content: any) =>
        typeof content === 'string' ? content : Array.isArray(content) ? (content[0]?.text || '') : ''
    ),
}));

const mockChatSettings = {
    toolCallingEnabled: true,
    toolCallingMaxIterations: 5,
    toolCallingMode: 'read-write' as const,
    maxKnowledgeNodes: 0,
    modelProfile: '',
};

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({ chat: null });

jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetToolDefinitions = jest.fn<() => any[]>().mockReturnValue([{ type: 'function', function: { name: 'test_tool' } }]);
const mockRunAgentLoop = jest.fn<() => Promise<any>>().mockResolvedValue({
    finalResponse: { choices: [{ message: { content: 'Agent response' } }] },
    toolCallsExecuted: [],
    iterations: 1,
    aborted: false,
    fallbackReason: null,
});

jest.unstable_mockModule('../../core/tool-calling.js', () => ({
    getToolDefinitions: mockGetToolDefinitions,
    runAgentLoop: mockRunAgentLoop,
}));

const mockGetProjectContextBlock = jest.fn<() => Promise<string | null>>().mockResolvedValue('Project: TestProject');

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

const { handleChatWithTools } = await import('../../routes/chat/tools.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSubsystemAssignments.mockResolvedValue({ chat: null });
    mockQuery.mockResolvedValue([]);
    mockGetPrompt.mockResolvedValue('system prompt text');
    mockRunAgentLoop.mockResolvedValue({
        finalResponse: { choices: [{ message: { content: 'Agent response' } }] },
        toolCallsExecuted: [],
        iterations: 1,
        aborted: false,
        fallbackReason: null,
    });
    mockGetProjectContextBlock.mockResolvedValue('Project: TestProject');
});

// =============================================================================
// No chat model assigned
// =============================================================================

describe('handleChatWithTools — no model', () => {
    it('returns null when no chat model is assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: null });

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
    });
});

// =============================================================================
// Model does not support tools
// =============================================================================

describe('handleChatWithTools — supportsTools=false', () => {
    it('returns null when chat model has supportsTools=false', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            chat: {
                id: 1, name: 'test-model', modelId: 'test-id',
                provider: 'openai', supportsTools: false,
            },
        });

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
    });
});

// =============================================================================
// Happy path — basic message
// =============================================================================

describe('handleChatWithTools — happy path', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        endpointUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        noThink: false,
        maxConcurrency: 2,
        requestPauseMs: 100,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('returns response from agent loop', async () => {
        const result = await handleChatWithTools('What is synthesis?');

        expect(result).not.toBeNull();
        expect(result!.response).toBe('Agent response');
        expect(result!.type).toBe('text');
        expect(result!.metadata.system).toBe('llm');
    });

    it('passes conversation messages limited to last 20', async () => {
        const messages = Array.from({ length: 25 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `message ${i}`,
        }));

        await handleChatWithTools('latest message', undefined, messages);

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        // system + last 20 conversation messages + the user message
        expect(callArgs.messages.length).toBe(22);
        expect(callArgs.messages[0].role).toBe('system');
        // First conversation message should be message 5 (skipping 0-4)
        expect(callArgs.messages[1].content).toBe('message 5');
    });

    it('passes model entry with correct fields', async () => {
        await handleChatWithTools('test');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        expect(callArgs.model).toEqual(expect.objectContaining({
            name: 'gpt-4',
            provider: 'openai',
            model: 'gpt-4',
            endpoint: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            noThink: false,
            _registryId: 1,
            _maxConcurrency: 2,
            _requestPauseMs: 100,
        }));
        expect(callArgs.contextWindow).toBe(8192);
        expect(callArgs.maxIterations).toBe(5); // from chatSettings
    });

    it('includes context enrichment metadata when ctxResult provided', async () => {
        const result = await handleChatWithTools('test', { systemPrompt: 'enriched context' });

        expect(result!.metadata.contextEnriched).toBe(true);
    });

    it('sets contextEnriched false when no ctxResult', async () => {
        const result = await handleChatWithTools('test');

        expect(result!.metadata.contextEnriched).toBe(false);
    });
});

// =============================================================================
// Slash command parsing
// =============================================================================

describe('handleChatWithTools — slash commands', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('strips slash prefix and capitalizes action', async () => {
        await handleChatWithTools('/research quantum computing');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        const userMsg = callArgs.messages[callArgs.messages.length - 1];
        expect(userMsg.content).toBe('Research quantum computing');
    });

    it('does not modify non-slash messages', async () => {
        await handleChatWithTools('Tell me about synthesis');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        const userMsg = callArgs.messages[callArgs.messages.length - 1];
        expect(userMsg.content).toBe('Tell me about synthesis');
    });
});

// =============================================================================
// Domain info query
// =============================================================================

describe('handleChatWithTools — domain info', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('includes domain info in system prompt when domains exist', async () => {
        mockQuery.mockResolvedValue([
            { domain: 'physics', cnt: 42 },
            { domain: 'biology', cnt: 15 },
        ]);

        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            domainInfo: expect.stringContaining('physics (42 nodes)'),
        }));
    });

    it('uses fallback message when domain query fails', async () => {
        mockQuery.mockRejectedValue(new Error('DB error'));

        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            domainInfo: 'No domains found — the graph may be empty.',
        }));
    });
});

// =============================================================================
// Project context
// =============================================================================

describe('handleChatWithTools — project context', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('includes project context in system prompt', async () => {
        mockGetProjectContextBlock.mockResolvedValue('Project: Resonance v2');

        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            projectContext: '\nProject: Resonance v2',
        }));
    });

    it('uses empty string when project context is null', async () => {
        mockGetProjectContextBlock.mockResolvedValue(null);

        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            projectContext: '',
        }));
    });

    it('uses empty string when project context throws', async () => {
        mockGetProjectContextBlock.mockRejectedValue(new Error('no manifest'));

        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            projectContext: '',
        }));
    });
});

// =============================================================================
// Tool context building from tool call results
// =============================================================================

describe('handleChatWithTools — tool context extraction', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('extracts context from graph_query tool results', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Here is what I found' } }] },
            toolCallsExecuted: [{
                toolName: 'graph_query',
                args: { text: 'synthesis' },
                durationMs: 50,
                result: {
                    nodes: [
                        { domain: 'core', content: 'Synthesis creates insights from node pairs' },
                        { domain: 'core', content: 'Resonance threshold controls minimum similarity' },
                    ],
                },
            }],
            iterations: 2,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('What is synthesis?');

        expect(result!.metadata.toolCalls).toHaveLength(1);
        expect(result!.metadata.toolCalls![0].name).toBe('graph_query');
        expect(result!.metadata.toolContext).toContain('Synthesis creates insights');
    });

    it('extracts context from graph_get tool results', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Found node' } }] },
            toolCallsExecuted: [{
                toolName: 'graph_get',
                args: { id: 'node-1' },
                durationMs: 30,
                result: { domain: 'physics', content: 'Quantum entanglement allows instant correlation' },
            }],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('get node');

        expect(result!.metadata.toolContext).toContain('Quantum entanglement');
    });

    it('extracts context from graph_summarize tool results', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Summary' } }] },
            toolCallsExecuted: [{
                toolName: 'graph_summarize',
                args: { topic: 'synthesis' },
                durationMs: 100,
                result: { summary: 'Synthesis is the core mechanism for knowledge creation' },
            }],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('summarize');

        expect(result!.metadata.toolContext).toContain('Synthesis is the core mechanism');
    });

    it('extracts context from graph_compress tool results', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Compressed' } }] },
            toolCallsExecuted: [{
                toolName: 'graph_compress',
                args: { topic: 'all' },
                durationMs: 200,
                result: { compressed: 'Dense knowledge summary with key facts' },
            }],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('compress');

        expect(result!.metadata.toolContext).toContain('Dense knowledge summary');
    });

    it('falls back to truncated JSON for unknown tools', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Done' } }] },
            toolCallsExecuted: [{
                toolName: 'custom_tool',
                args: {},
                durationMs: 10,
                result: { data: 'some result' },
            }],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('run custom');

        expect(result!.metadata.toolContext).toBeTruthy();
    });

    it('skips graph_stats results from context', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Stats shown' } }] },
            toolCallsExecuted: [{
                toolName: 'graph_stats',
                args: {},
                durationMs: 5,
                result: { nodes: 100 },
            }],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('show stats');

        expect(result!.metadata.toolContext).toBeUndefined();
    });

    it('sets toolContext undefined when no tool calls executed', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'Just a response' } }] },
            toolCallsExecuted: [],
            iterations: 0,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('hello');

        expect(result!.metadata.toolContext).toBeUndefined();
        expect(result!.metadata.toolCalls).toBeUndefined();
    });
});

// =============================================================================
// Empty response handling
// =============================================================================

describe('handleChatWithTools — empty response', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('returns empty string when rawContent is null', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: null } }] },
            toolCallsExecuted: [],
            iterations: 0,
            aborted: false,
            fallbackReason: null,
        });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await handleChatWithTools('hello');

        expect(result!.response).toBe('');
        warnSpy.mockRestore();
    });
});

// =============================================================================
// Error handling — returns null on failure
// =============================================================================

describe('handleChatWithTools — error handling', () => {
    it('returns null when getSubsystemAssignments throws', async () => {
        mockGetSubsystemAssignments.mockRejectedValue(new Error('DB connection failed'));

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
    });

    it('returns null when runAgentLoop throws', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            chat: {
                id: 1, name: 'gpt-4', modelId: 'gpt-4',
                provider: 'openai', supportsTools: true,
                contextSize: 8192,
            },
        });
        mockRunAgentLoop.mockRejectedValue(new Error('API timeout'));

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
        errorSpy.mockRestore();
    });
});

// =============================================================================
// Knowledge block from ctxResult
// =============================================================================

describe('handleChatWithTools — knowledge block', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('uses ctxResult.systemPrompt as knowledge block', async () => {
        await handleChatWithTools('test', { systemPrompt: 'Knowledge about synthesis' });

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            knowledgeBlock: 'Knowledge about synthesis',
        }));
    });

    it('uses fallback message when no ctxResult', async () => {
        await handleChatWithTools('test');

        expect(mockGetPrompt).toHaveBeenCalledWith('chat.tool_system', expect.objectContaining({
            knowledgeBlock: 'No pre-loaded knowledge for this turn. Use your tools to find relevant information.',
        }));
    });
});

// =============================================================================
// Fallback reason and agent iterations in metadata
// =============================================================================

describe('handleChatWithTools — metadata fields', () => {
    const chatModel = {
        id: 1, name: 'gpt-4', modelId: 'gpt-4',
        provider: 'openai', supportsTools: true,
        contextSize: 8192,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: chatModel });
    });

    it('includes fallbackReason when present', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'fallback response' } }] },
            toolCallsExecuted: [],
            iterations: 0,
            aborted: true,
            fallbackReason: 'max_iterations_reached',
        });

        const result = await handleChatWithTools('test');

        expect(result!.metadata.fallbackReason).toBe('max_iterations_reached');
    });

    it('omits agentIterations when 0', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'response' } }] },
            toolCallsExecuted: [],
            iterations: 0,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('test');

        expect(result!.metadata.agentIterations).toBeUndefined();
    });

    it('includes agentIterations when > 0', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'response' } }] },
            toolCallsExecuted: [],
            iterations: 3,
            aborted: false,
            fallbackReason: null,
        });

        const result = await handleChatWithTools('test');

        expect(result!.metadata.agentIterations).toBe(3);
    });
});
