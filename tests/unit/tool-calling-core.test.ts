/**
 * Unit tests for core/tool-calling.ts — getToolDefinitions, estimateToolTokens,
 * executeToolCall, runAgentLoop.
 *
 * Mocks: models.js, services/event-bus.js, all handler modules
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallWithMessages = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
    choices: [{ message: { content: 'Test response', tool_calls: null } }],
});
const mockUpdateRegisteredModel = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn();
const mockExtractTextContent = jest.fn<(c: any) => string | null>().mockImplementation((c: any) => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p: any) => p.text || '').join('');
    return null;
});

// Mock handlers — all return simple results
const mockHandleQuery = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ nodes: [] });
const mockHandleGet = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ id: 'test', content: 'test' });
const mockHandleLineage = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ parents: [], children: [] });
const mockHandleSummarize = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ summary: 'test' });
const mockHandleCompress = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ compressed: 'test' });
const mockHandleTensions = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ tensions: [] });
const mockHandleVoice = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ context: 'test' });
const mockHandleValidate = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ valid: true });
const mockHandleStats = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ nodes: 100 });
const mockHandleAbstractPatterns = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ patterns: [] });
const mockHandlePropose = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ id: 'new-1' });
const mockHandlePromote = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ promoted: true });
const mockHandleDedup = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ clusters: [] });
const mockHandleRemove = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ removed: true });
const mockHandleFeedback = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ rated: true });

jest.unstable_mockModule('../../models.js', () => ({
    callWithMessages: mockCallWithMessages,
    updateRegisteredModel: mockUpdateRegisteredModel,
}));
jest.unstable_mockModule('../../models/providers.js', () => ({
    extractTextContent: mockExtractTextContent,
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));
jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handleQuery: mockHandleQuery,
    handleGet: mockHandleGet,
    handleLineage: mockHandleLineage,
    handlePropose: mockHandlePropose,
    handleRemove: mockHandleRemove,
}));
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    handleSummarize: mockHandleSummarize,
    handleCompress: mockHandleCompress,
}));
jest.unstable_mockModule('../../handlers/discovery.js', () => ({
    handleTensions: mockHandleTensions,
    handleValidate: mockHandleValidate,
}));
jest.unstable_mockModule('../../handlers/elevation.js', () => ({
    handleVoice: mockHandleVoice,
    handlePromote: mockHandlePromote,
}));
jest.unstable_mockModule('../../handlers/governance.js', () => ({
    handleStats: mockHandleStats,
}));
jest.unstable_mockModule('../../handlers/abstract-patterns.js', () => ({
    handleAbstractPatterns: mockHandleAbstractPatterns,
}));
jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    handleDedup: mockHandleDedup,
}));
jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleFeedback: mockHandleFeedback,
}));

const { getToolDefinitions, estimateToolTokens, executeToolCall, runAgentLoop } = await import('../../core/tool-calling.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockCallWithMessages.mockResolvedValue({
        choices: [{ message: { content: 'Test response', tool_calls: null } }],
    });
});

// =============================================================================
// getToolDefinitions
// =============================================================================

describe('getToolDefinitions', () => {
    it('returns read-only tools by default', () => {
        const tools = getToolDefinitions();

        expect(tools.length).toBeGreaterThan(0);
        const names = tools.map(t => t.function.name);
        expect(names).toContain('graph_query');
        expect(names).toContain('graph_get');
        expect(names).toContain('graph_summarize');
        expect(names).not.toContain('graph_propose');
    });

    it('returns all tools in read-write mode', () => {
        const tools = getToolDefinitions('read-write');

        const names = tools.map(t => t.function.name);
        expect(names).toContain('graph_query');
        expect(names).toContain('graph_propose');
        expect(names).toContain('graph_promote');
        expect(names).toContain('graph_dedup');
        expect(names).toContain('graph_remove');
        expect(names).toContain('graph_feedback');
    });

    it('read-write has more tools than read-only', () => {
        const readOnly = getToolDefinitions('read-only');
        const readWrite = getToolDefinitions('read-write');

        expect(readWrite.length).toBeGreaterThan(readOnly.length);
    });

    it('all tools have correct structure', () => {
        const tools = getToolDefinitions('read-write');

        for (const tool of tools) {
            expect(tool.type).toBe('function');
            expect(tool.function.name).toBeTruthy();
            expect(tool.function.description).toBeTruthy();
            expect(tool.function.parameters.type).toBe('object');
        }
    });
});

// =============================================================================
// estimateToolTokens
// =============================================================================

describe('estimateToolTokens', () => {
    it('returns a positive number for non-empty tools', () => {
        const tools = getToolDefinitions();
        const tokens = estimateToolTokens(tools);

        expect(tokens).toBeGreaterThan(0);
    });

    it('returns 1 for empty array', () => {
        const tokens = estimateToolTokens([]);

        expect(tokens).toBe(1); // Math.ceil('[]'.length / 3) = 1
    });

    it('scales with number of tools', () => {
        const readOnly = estimateToolTokens(getToolDefinitions('read-only'));
        const readWrite = estimateToolTokens(getToolDefinitions('read-write'));

        expect(readWrite).toBeGreaterThan(readOnly);
    });
});

// =============================================================================
// executeToolCall
// =============================================================================

describe('executeToolCall', () => {
    it('returns error for unknown tool', async () => {
        const result = await executeToolCall('unknown_tool', {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown tool');
    });

    it('dispatches graph_query to handleQuery', async () => {
        mockHandleQuery.mockResolvedValue({ nodes: [{ id: 'n1' }] });

        const result = await executeToolCall('graph_query', { text: 'test', domain: 'test' });

        expect(result.success).toBe(true);
        expect(mockHandleQuery).toHaveBeenCalledWith({ text: 'test', domain: 'test' });
    });

    it('dispatches graph_get to handleGet', async () => {
        const result = await executeToolCall('graph_get', { id: 'node-123' });

        expect(result.success).toBe(true);
        expect(mockHandleGet).toHaveBeenCalledWith({ id: 'node-123' });
    });

    it('dispatches graph_propose to handlePropose', async () => {
        const result = await executeToolCall('graph_propose', { content: 'test', nodeType: 'seed', contributor: 'llm' });

        expect(result.success).toBe(true);
        expect(mockHandlePropose).toHaveBeenCalled();
    });

    it('truncates large results', async () => {
        const largeResult = { data: 'x'.repeat(5000) };
        mockHandleQuery.mockResolvedValue(largeResult);

        const result = await executeToolCall('graph_query', { text: 'test' });

        expect(result.success).toBe(true);
        expect(result.result._truncated).toBe(true);
    });

    it('catches handler errors gracefully', async () => {
        mockHandleQuery.mockRejectedValue(new Error('DB connection failed'));

        const result = await executeToolCall('graph_query', { text: 'test' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('DB connection failed');
    });
});

// =============================================================================
// runAgentLoop
// =============================================================================

describe('runAgentLoop', () => {
    const baseOptions = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: { name: 'test-model', provider: 'openai' },
        callOptions: {},
        tools: getToolDefinitions(),
    };

    it('returns immediately when model produces text response', async () => {
        const result = await runAgentLoop(baseOptions);

        expect(result.iterations).toBe(0);
        expect(result.toolCallsExecuted).toHaveLength(0);
        expect(result.aborted).toBe(false);
        expect(result.finalResponse.choices[0].message.content).toBe('Test response');
    });

    it('executes tool calls and feeds results back', async () => {
        // First call: model wants to call a tool
        mockCallWithMessages
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: 'tc1',
                            function: { name: 'graph_query', arguments: '{"text": "test"}' },
                        }],
                    },
                }],
            })
            // Second call: model produces text response
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Found results', tool_calls: null } }],
            });

        const result = await runAgentLoop(baseOptions);

        expect(result.toolCallsExecuted).toHaveLength(1);
        expect(result.toolCallsExecuted[0].toolName).toBe('graph_query');
        expect(result.iterations).toBe(1);
    });

    it('respects maxIterations', async () => {
        // Model keeps calling tools forever
        mockCallWithMessages.mockResolvedValue({
            choices: [{
                message: {
                    content: null,
                    tool_calls: [{
                        id: 'tc1',
                        function: { name: 'graph_query', arguments: '{"text": "test"}' },
                    }],
                },
            }],
        });

        // On the forced text call (no tools), return text
        const originalMock = mockCallWithMessages.getMockImplementation();
        let callCount = 0;
        mockCallWithMessages.mockImplementation(async (msgs: any, model: any, opts: any) => {
            callCount++;
            if (!opts?.tools) {
                // Forced text response
                return { choices: [{ message: { content: 'Forced answer', tool_calls: null } }] };
            }
            return {
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: `tc${callCount}`,
                            function: { name: 'graph_stats', arguments: '{}' },
                        }],
                    },
                }],
            };
        });

        const result = await runAgentLoop({ ...baseOptions, maxIterations: 2 });

        expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('falls back when model does not support tools', async () => {
        mockCallWithMessages
            .mockRejectedValueOnce(new Error('400: tools not supported'))
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Fallback response', tool_calls: null } }],
            });

        const result = await runAgentLoop(baseOptions);

        expect(result.fallbackReason).toBe('model_unsupported');
        expect(result.toolCallsExecuted).toHaveLength(0);
    });

    it('calls onToolCall callback', async () => {
        const onToolCall = jest.fn();
        mockCallWithMessages
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: 'tc1',
                            function: { name: 'graph_stats', arguments: '{}' },
                        }],
                    },
                }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Done', tool_calls: null } }],
            });

        await runAgentLoop({ ...baseOptions, onToolCall });

        expect(onToolCall).toHaveBeenCalledWith(
            'graph_stats',
            {},
            expect.anything(),
            expect.any(Number),
        );
    });

    it('emits activity for each tool execution', async () => {
        mockCallWithMessages
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: 'tc1',
                            function: { name: 'graph_get', arguments: '{"id": "abc"}' },
                        }],
                    },
                }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Got it', tool_calls: null } }],
            });

        await runAgentLoop(baseOptions);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'llm', 'tool_exec',
            expect.stringContaining('graph_get'),
            expect.objectContaining({ tool: 'graph_get', success: true }),
        );
    });

    it('handles malformed tool call arguments', async () => {
        mockCallWithMessages
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: 'tc1',
                            function: { name: 'graph_query', arguments: 'not valid json' },
                        }],
                    },
                }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Done', tool_calls: null } }],
            });

        const result = await runAgentLoop(baseOptions);

        // Should not throw — gracefully handles bad JSON
        expect(result.toolCallsExecuted).toHaveLength(1);
        expect(result.toolCallsExecuted[0].args).toEqual({});
    });
});
