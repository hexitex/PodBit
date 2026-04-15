/**
 * Unit tests for mcp/dispatch.ts — handleToolCall with proxy behavior
 *
 * Tests: proxy-first when MCP_STDIO, direct when HTTP server,
 * fallback on proxy failure, unknown tool handling, activity events.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const origEnv = { ...process.env };

// Mock the proxy
const mockProxyToolCall = jest.fn<() => Promise<any>>();
jest.unstable_mockModule('../../mcp/http-proxy.js', () => ({
    proxyToolCall: mockProxyToolCall,
}));

// Mock activity emission
const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

// Mock all handler imports with minimal stubs
const mockHandler = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handleQuery: mockHandler, handleGet: mockHandler, handleLineage: mockHandler,
    handlePropose: mockHandler, handleRemove: mockHandler, handleEdit: mockHandler,
}));
jest.unstable_mockModule('../../handlers/elevation.js', () => ({
    handleVoice: mockHandler, handlePromote: mockHandler,
}));
jest.unstable_mockModule('../../handlers/discovery.js', () => ({
    handleTensions: mockHandler, handleQuestion: mockHandler, handleValidate: mockHandler,
}));
jest.unstable_mockModule('../../handlers/abstract-patterns.js', () => ({ handleAbstractPatterns: mockHandler }));
jest.unstable_mockModule('../../handlers/dedup.js', () => ({ handleDedup: mockHandler }));
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    handleSummarize: mockHandler, handleCompress: mockHandler,
}));
jest.unstable_mockModule('../../handlers/scaffold-handlers.js', () => ({
    handleScaffoldTemplates: mockHandler, handleScaffoldDecompose: mockHandler, handleScaffoldGenerate: mockHandler,
}));
jest.unstable_mockModule('../../handlers/governance.js', () => ({
    handleStats: mockHandler, handlePending: mockHandler, handleComplete: mockHandler,
    handleSynthesisEngine: mockHandler, handlePartitions: mockHandler, handleContext: mockHandler,
}));
jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({ handleConfig: mockHandler }));
jest.unstable_mockModule('../../handlers/feedback.js', () => ({ handleFeedback: mockHandler }));
jest.unstable_mockModule('../../handlers/evm.js', () => ({ handleLabVerify: mockHandler }));
jest.unstable_mockModule('../../handlers/elite.js', () => ({ handleElite: mockHandler }));
jest.unstable_mockModule('../../handlers/knowledge-base.js', () => ({ handleKnowledgeBase: mockHandler }));
jest.unstable_mockModule('../../handlers/projects.js', () => ({ handleProjects: mockHandler }));
jest.unstable_mockModule('../../handlers/api-registry.js', () => ({ handleApiRegistry: mockHandler }));
jest.unstable_mockModule('../../handlers/lab.js', () => ({ handleLab: mockHandler }));
jest.unstable_mockModule('../../handlers/journal.js', () => ({ handleJournal: mockHandler }));
jest.unstable_mockModule('../../handlers/generic-api.js', () => ({ handleGenericApi: mockHandler }));

const { handleToolCall } = await import('../../mcp/dispatch.js');

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...origEnv };
    mockHandler.mockResolvedValue({ ok: true });
    mockProxyToolCall.mockResolvedValue(null); // default: proxy returns null (not MCP stdio)
});

afterEach(() => {
    process.env = { ...origEnv };
});

describe('handleToolCall', () => {
    it('returns error for unknown tool', async () => {
        const result = await handleToolCall('podbit.nonexistent', {});
        expect(result.error).toContain('Unknown tool');
    });

    it('calls handler directly when proxy returns null', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        const result = await handleToolCall('podbit_query', { text: 'test' });
        expect(result).toEqual({ ok: true });
        expect(mockHandler).toHaveBeenCalledWith({ text: 'test' });
    });

    it('returns proxy result when proxy succeeds', async () => {
        mockProxyToolCall.mockResolvedValue({ proxied: true, nodes: [] });
        const result = await handleToolCall('podbit_query', { text: 'test' });
        expect(result).toEqual({ proxied: true, nodes: [] });
        expect(mockHandler).not.toHaveBeenCalled();
    });

    it('emits activity event only for direct calls (not proxied)', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        await handleToolCall('podbit_stats', { days: 7 });
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', expect.any(String));
    });

    it('does not emit activity event when proxied (server emits it)', async () => {
        mockProxyToolCall.mockResolvedValue({ proxied: true });
        await handleToolCall('podbit_stats', { days: 7 });
        expect(mockEmitActivity).not.toHaveBeenCalled();
    });

    it('catches handler errors and returns error object', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        mockHandler.mockRejectedValue(new Error('DB connection lost'));
        const result = await handleToolCall('podbit_query', {});
        expect(result.error).toBe('DB connection lost');
    });

    it('includes action in activity event message', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        await handleToolCall('podbit_config', { action: 'get' });
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', expect.stringContaining('.get'));
    });

    it('dispatches podbit_api to generic handler', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        await handleToolCall('podbit_api', { action: 'tools' });
        expect(mockHandler).toHaveBeenCalledWith({ action: 'tools' });
    });

    it('dispatches docs tools correctly', async () => {
        mockProxyToolCall.mockResolvedValue(null);
        await handleToolCall('docs_templates', {});
        expect(mockHandler).toHaveBeenCalled();
    });
});
