/**
 * Extended tests for core/tool-calling.ts — covers executeToolCall dispatch for
 * all handler mappings, agent loop context budget checks, mid-loop API failure
 * recovery, empty forced response synthesis, and multiple tool calls per iteration.
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

const mockHandleQuery = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ nodes: [] });
const mockHandleGet = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ id: 'test' });
const mockHandleLineage = jest.fn<(args: any) => Promise<any>>().mockResolvedValue({ parents: [] });
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
// executeToolCall — all handler dispatches
// =============================================================================

describe('executeToolCall — handler dispatch coverage', () => {
    it('dispatches graph_lineage to handleLineage', async () => {
        const result = await executeToolCall('graph_lineage', { id: 'n1', depth: 2 });
        expect(result.success).toBe(true);
        expect(mockHandleLineage).toHaveBeenCalledWith({ id: 'n1', depth: 2 });
    });

    it('dispatches graph_summarize to handleSummarize', async () => {
        const result = await executeToolCall('graph_summarize', { topic: 'AI' });
        expect(result.success).toBe(true);
        expect(mockHandleSummarize).toHaveBeenCalledWith({ topic: 'AI' });
    });

    it('dispatches graph_compress to handleCompress', async () => {
        const result = await executeToolCall('graph_compress', { topic: 'ML', task: 'review' });
        expect(result.success).toBe(true);
        expect(mockHandleCompress).toHaveBeenCalledWith({ topic: 'ML', task: 'review' });
    });

    it('dispatches graph_tensions to handleTensions', async () => {
        const result = await executeToolCall('graph_tensions', { domain: 'test', limit: 5 });
        expect(result.success).toBe(true);
        expect(mockHandleTensions).toHaveBeenCalledWith({ domain: 'test', limit: 5 });
    });

    it('dispatches graph_voice to handleVoice', async () => {
        const result = await executeToolCall('graph_voice', { nodeId: 'n1' });
        expect(result.success).toBe(true);
        expect(mockHandleVoice).toHaveBeenCalledWith({ nodeId: 'n1' });
    });

    it('dispatches graph_validate to handleValidate', async () => {
        const result = await executeToolCall('graph_validate', { nodeId: 'n1' });
        expect(result.success).toBe(true);
        expect(mockHandleValidate).toHaveBeenCalledWith({ nodeId: 'n1' });
    });

    it('dispatches graph_stats to handleStats', async () => {
        const result = await executeToolCall('graph_stats', { days: 7 });
        expect(result.success).toBe(true);
        expect(mockHandleStats).toHaveBeenCalledWith({ days: 7 });
    });

    it('dispatches graph_patterns to handleAbstractPatterns', async () => {
        const result = await executeToolCall('graph_patterns', { action: 'search', query: 'test' });
        expect(result.success).toBe(true);
        expect(mockHandleAbstractPatterns).toHaveBeenCalledWith({ action: 'search', query: 'test' });
    });

    it('dispatches graph_promote to handlePromote', async () => {
        const result = await executeToolCall('graph_promote', { nodeId: 'n1', reason: 'good', contributor: 'llm' });
        expect(result.success).toBe(true);
        expect(mockHandlePromote).toHaveBeenCalled();
    });

    it('dispatches graph_dedup to handleDedup', async () => {
        const result = await executeToolCall('graph_dedup', { domain: 'test', dryRun: true });
        expect(result.success).toBe(true);
        expect(mockHandleDedup).toHaveBeenCalledWith({ domain: 'test', dryRun: true });
    });

    it('dispatches graph_remove to handleRemove', async () => {
        const result = await executeToolCall('graph_remove', { nodeId: 'n1', mode: 'archive' });
        expect(result.success).toBe(true);
        expect(mockHandleRemove).toHaveBeenCalledWith({ nodeId: 'n1', mode: 'archive' });
    });

    it('dispatches graph_feedback to handleFeedback', async () => {
        const result = await executeToolCall('graph_feedback', { action: 'rate', nodeId: 'n1', rating: 1 });
        expect(result.success).toBe(true);
        expect(mockHandleFeedback).toHaveBeenCalledWith({ action: 'rate', nodeId: 'n1', rating: 1 });
    });
});

// =============================================================================
// runAgentLoop — context budget, mid-loop failure, empty response synthesis
// =============================================================================

describe('runAgentLoop — context budget', () => {
    const baseOptions = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: { name: 'test-model', provider: 'openai' },
        callOptions: {},
        tools: getToolDefinitions(),
    };

    it('aborts when approaching context limit', async () => {
        // First call: model wants a tool
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
            // Forced text response (no tools param)
            .mockResolvedValue({
                choices: [{ message: { content: 'Budget exceeded answer', tool_calls: null } }],
            });

        // Set a very small contextWindow so tool tokens + messages exceed 85%
        const result = await runAgentLoop({ ...baseOptions, contextWindow: 100 });

        // Should have stopped after 1 iteration due to context budget
        expect(result.iterations).toBeLessThanOrEqual(1);
    });

    it('handles mid-loop API failure with fallback text response', async () => {
        mockCallWithMessages
            // First call: tool call
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
            // Second call: API error
            .mockRejectedValueOnce(new Error('API timeout'))
            // Fallback text call (no tools)
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Fallback summary', tool_calls: null } }],
            });

        const result = await runAgentLoop(baseOptions);

        expect(result.aborted).toBe(true);
        expect(result.fallbackReason).toBe('mid_loop_api_failure');
        expect(result.toolCallsExecuted).toHaveLength(1);
    });

    it('throws when mid-loop failure AND fallback both fail', async () => {
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
            .mockRejectedValueOnce(new Error('API timeout'))
            .mockRejectedValueOnce(new Error('Fallback also failed'));

        await expect(runAgentLoop(baseOptions)).rejects.toThrow('API timeout');
    });

    it('executes multiple tool calls in a single iteration', async () => {
        mockCallWithMessages
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [
                            { id: 'tc1', function: { name: 'graph_query', arguments: '{"text":"a"}' } },
                            { id: 'tc2', function: { name: 'graph_stats', arguments: '{}' } },
                        ],
                    },
                }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: 'Both done', tool_calls: null } }],
            });

        const result = await runAgentLoop(baseOptions);

        expect(result.toolCallsExecuted).toHaveLength(2);
        expect(result.toolCallsExecuted[0].toolName).toBe('graph_query');
        expect(result.toolCallsExecuted[1].toolName).toBe('graph_stats');
        expect(result.iterations).toBe(1);
    });

    it('synthesizes fallback from tool results when forced text is empty', async () => {
        mockExtractTextContent.mockReturnValue(null);

        let callCount = 0;
        mockCallWithMessages.mockImplementation(async (_msgs: any, _model: any, opts: any) => {
            callCount++;
            if (callCount === 1) {
                // First: tool call
                return {
                    choices: [{
                        message: {
                            content: 'Intermediate text',
                            tool_calls: [{
                                id: 'tc1',
                                function: { name: 'graph_stats', arguments: '{}' },
                            }],
                        },
                    }],
                };
            }
            if (callCount === 2) {
                // Second: another tool call to hit maxIterations
                return {
                    choices: [{
                        message: {
                            content: null,
                            tool_calls: [{
                                id: 'tc2',
                                function: { name: 'graph_query', arguments: '{"text":"x"}' },
                            }],
                        },
                    }],
                };
            }
            // Forced text response (empty content)
            return {
                choices: [{ message: { content: null, tool_calls: null } }],
            };
        });

        const result = await runAgentLoop({ ...baseOptions, maxIterations: 2 });

        // Should have synthesized fallback with tool results
        const content = result.finalResponse.choices[0]?.message?.content;
        expect(content).toContain('graph_stats');
    });

    it('rethrows non-tool-related errors on first call', async () => {
        mockCallWithMessages.mockRejectedValueOnce(new Error('network unreachable'));

        await expect(runAgentLoop(baseOptions)).rejects.toThrow('network unreachable');
    });

    it('handles empty choices array', async () => {
        mockCallWithMessages.mockResolvedValueOnce({ choices: [] });

        const result = await runAgentLoop(baseOptions);

        expect(result.iterations).toBe(0);
        expect(result.toolCallsExecuted).toHaveLength(0);
    });
});

// =============================================================================
// getToolDefinitions — tool name lists
// =============================================================================

describe('getToolDefinitions — tool names', () => {
    it('read-only includes all read tools', () => {
        const tools = getToolDefinitions('read-only');
        const names = tools.map(t => t.function.name);
        expect(names).toContain('graph_query');
        expect(names).toContain('graph_get');
        expect(names).toContain('graph_summarize');
        expect(names).toContain('graph_compress');
        expect(names).toContain('graph_tensions');
        expect(names).toContain('graph_lineage');
        expect(names).toContain('graph_voice');
        expect(names).toContain('graph_validate');
        expect(names).toContain('graph_stats');
        expect(names).toContain('graph_patterns');
    });

    it('read-only excludes write tools', () => {
        const tools = getToolDefinitions('read-only');
        const names = tools.map(t => t.function.name);
        expect(names).not.toContain('graph_propose');
        expect(names).not.toContain('graph_promote');
        expect(names).not.toContain('graph_dedup');
        expect(names).not.toContain('graph_remove');
        expect(names).not.toContain('graph_feedback');
    });

    it('read-write includes all write tools', () => {
        const tools = getToolDefinitions('read-write');
        const names = tools.map(t => t.function.name);
        expect(names).toContain('graph_propose');
        expect(names).toContain('graph_promote');
        expect(names).toContain('graph_dedup');
        expect(names).toContain('graph_remove');
        expect(names).toContain('graph_feedback');
    });

    it('defaults to read-only when no mode specified', () => {
        const defaultTools = getToolDefinitions();
        const readOnly = getToolDefinitions('read-only');
        expect(defaultTools.length).toBe(readOnly.length);
    });

    it('returns new array instances (not shared)', () => {
        const a = getToolDefinitions('read-only');
        const b = getToolDefinitions('read-only');
        expect(a).not.toBe(b);
    });
});
