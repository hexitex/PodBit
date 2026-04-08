/**
 * Unit tests for routes/chat/tools.ts — handleChatWithTools agent loop.
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

const mockExtractTextContent = jest.fn<(c: any) => string>()
    .mockImplementation(c => typeof c === 'string' ? c : '');

jest.unstable_mockModule('../../models/providers.js', () => ({
    extractTextContent: mockExtractTextContent,
}));

const mockChatSettings = {
    toolCallingMode: 'full',
    toolCallingMaxIterations: 5,
};

jest.unstable_mockModule('../../routes/chat/settings.js', () => ({
    chatSettings: mockChatSettings,
    ensureChatSettings: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// Dynamic imports mocked via unstable_mockModule
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetToolDefinitions = jest.fn<() => any[]>().mockReturnValue([]);
const mockRunAgentLoop = jest.fn<() => Promise<any>>().mockResolvedValue({
    finalResponse: { choices: [{ message: { content: 'agent response' } }] },
    toolCallsExecuted: [],
    iterations: 1,
    aborted: false,
    fallbackReason: null,
});

jest.unstable_mockModule('../../core/tool-calling.js', () => ({
    getToolDefinitions: mockGetToolDefinitions,
    runAgentLoop: mockRunAgentLoop,
}));

const mockGetProjectContextBlock = jest.fn<() => Promise<string>>().mockResolvedValue('project context');

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

const { handleChatWithTools } = await import('../../routes/chat/tools.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetPrompt.mockResolvedValue('system prompt text');
    mockExtractTextContent.mockImplementation(c => typeof c === 'string' ? c : '');
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetToolDefinitions.mockReturnValue([]);
    mockRunAgentLoop.mockResolvedValue({
        finalResponse: { choices: [{ message: { content: 'agent response' } }] },
        toolCallsExecuted: [],
        iterations: 1,
        aborted: false,
        fallbackReason: null,
    });
    mockGetProjectContextBlock.mockResolvedValue('project context');
    // Restore chatSettings defaults
    Object.assign(mockChatSettings, { toolCallingMode: 'full', toolCallingMaxIterations: 5 });
});

// =============================================================================
// Returns null when chat model unavailable
// =============================================================================

describe('handleChatWithTools — early returns', () => {
    it('returns null when no chat model assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({}); // no chat key

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
        expect(mockRunAgentLoop).not.toHaveBeenCalled();
    });

    it('returns null when chat model has supportsTools=false', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            chat: { id: 'm1', name: 'Model', modelId: 'gpt4', provider: 'openai', supportsTools: false },
        });

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
    });

    it('returns null on unexpected error', async () => {
        mockGetSubsystemAssignments.mockRejectedValue(new Error('DB failure'));

        const result = await handleChatWithTools('hello');

        expect(result).toBeNull();
    });
});

// =============================================================================
// Successful agent loop
// =============================================================================

describe('handleChatWithTools — successful loop', () => {
    const mockChatModel = {
        id: 'm1', name: 'Claude', modelId: 'claude-sonnet-4-6',
        provider: 'anthropic', supportsTools: null,
        endpointUrl: null, apiKey: null, noThink: false,
        contextSize: 100000, maxConcurrency: 1, requestPauseMs: 0,
    };

    beforeEach(() => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: mockChatModel });
    });

    it('returns response with type and metadata', async () => {
        mockExtractTextContent.mockReturnValue('final answer');

        const result = await handleChatWithTools('what is science?');

        expect(result).not.toBeNull();
        expect(result!.response).toBe('final answer');
        expect(result!.type).toBe('text');
        expect(result!.metadata.system).toBe('llm');
    });

    it('strips slash command prefix before sending to agent', async () => {
        await handleChatWithTools('/research quantum physics');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        const userMessage = callArgs.messages.at(-1).content;
        expect(userMessage).toBe('Research quantum physics');
    });

    it('does not modify regular messages without slash prefix', async () => {
        await handleChatWithTools('what is science?');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        const userMessage = callArgs.messages.at(-1).content;
        expect(userMessage).toBe('what is science?');
    });

    it('passes conversation history limited to last 20 messages', async () => {
        const history = Array.from({ length: 25 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `message ${i}`,
        }));

        await handleChatWithTools('follow up', undefined, history);

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        // system + last 20 history + user = 22
        expect(callArgs.messages.length).toBe(22);
    });

    it('includes domain info in system prompt context', async () => {
        mockQuery.mockResolvedValue([
            { domain: 'science', cnt: '100' },
            { domain: 'math', cnt: '50' },
        ]);

        await handleChatWithTools('query');

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'chat.tool_system',
            expect.objectContaining({
                domainInfo: expect.stringContaining('science'),
            })
        );
    });

    it('sets contextEnriched=true when ctxResult is provided', async () => {
        const result = await handleChatWithTools('question', { systemPrompt: 'ctx' });

        expect(result!.metadata.contextEnriched).toBe(true);
    });

    it('sets contextEnriched=false without ctxResult', async () => {
        const result = await handleChatWithTools('question');

        expect(result!.metadata.contextEnriched).toBe(false);
    });

    it('includes toolCalls summary when tools were executed', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'answer' } }] },
            toolCallsExecuted: [
                { toolName: 'graph_query', args: { text: 'science' }, durationMs: 50, result: { nodes: [] } },
            ],
            iterations: 2,
            aborted: false,
            fallbackReason: null,
        });
        mockExtractTextContent.mockReturnValue('answer');

        const result = await handleChatWithTools('search');

        expect(result!.metadata.toolCalls).toHaveLength(1);
        expect(result!.metadata.toolCalls[0].name).toBe('graph_query');
    });

    it('passes maxIterations from chatSettings to runAgentLoop', async () => {
        Object.assign(mockChatSettings, { toolCallingMaxIterations: 10 });

        await handleChatWithTools('question');

        const callArgs = mockRunAgentLoop.mock.calls[0][0] as any;
        expect(callArgs.maxIterations).toBe(10);
    });

    it('extracts tool context from graph_query results', async () => {
        mockRunAgentLoop.mockResolvedValue({
            finalResponse: { choices: [{ message: { content: 'answer' } }] },
            toolCallsExecuted: [
                {
                    toolName: 'graph_query',
                    args: {},
                    durationMs: 100,
                    result: {
                        nodes: [
                            { domain: 'science', content: 'Node content about photosynthesis' },
                        ],
                    },
                },
            ],
            iterations: 1,
            aborted: false,
            fallbackReason: null,
        });
        mockExtractTextContent.mockReturnValue('answer');

        const result = await handleChatWithTools('search');

        expect(result!.metadata.toolContext).toContain('photosynthesis');
    });
});
