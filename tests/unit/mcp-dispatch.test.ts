/**
 * Unit tests for mcp/dispatch.ts — handleToolCall dispatch logic.
 *
 * Covers: successful dispatch to handler, unknown tool error, activity emission
 * with action/text/domain hints, handler error catch, re-exports.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Mock all handler modules ------------------------------------------------

const mockHandleQuery = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ rows: [] });
const mockHandleGet = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ node: null });
const mockHandleLineage = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ tree: [] });
const mockHandlePropose = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ id: '1' });
const mockHandleRemove = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });
const mockHandleEdit = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handleQuery: mockHandleQuery,
    handleGet: mockHandleGet,
    handleLineage: mockHandleLineage,
    handlePropose: mockHandlePropose,
    handleRemove: mockHandleRemove,
    handleEdit: mockHandleEdit,
}));

const mockHandleVoice = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ context: {} });
const mockHandlePromote = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/elevation.js', () => ({
    handleVoice: mockHandleVoice,
    handlePromote: mockHandlePromote,
}));

const mockHandleTensions = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ pairs: [] });
const mockHandleQuestion = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ context: {} });
const mockHandleValidate = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ context: {} });

jest.unstable_mockModule('../../handlers/discovery.js', () => ({
    handleTensions: mockHandleTensions,
    handleQuestion: mockHandleQuestion,
    handleValidate: mockHandleValidate,
}));

const mockHandleAbstractPatterns = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ patterns: [] });

jest.unstable_mockModule('../../handlers/abstract-patterns.js', () => ({
    handleAbstractPatterns: mockHandleAbstractPatterns,
}));

const mockHandleDedup = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ clusters: [] });

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    handleDedup: mockHandleDedup,
}));

const mockHandleSummarize = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ summary: '' });
const mockHandleCompress = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ compressed: '' });

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    handleSummarize: mockHandleSummarize,
    handleCompress: mockHandleCompress,
}));

const mockHandleScaffoldTemplates = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ templates: [] });
const mockHandleScaffoldDecompose = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ outline: {} });
const mockHandleScaffoldGenerate = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ doc: '' });

jest.unstable_mockModule('../../handlers/scaffold-handlers.js', () => ({
    handleScaffoldTemplates: mockHandleScaffoldTemplates,
    handleScaffoldDecompose: mockHandleScaffoldDecompose,
    handleScaffoldGenerate: mockHandleScaffoldGenerate,
}));

const mockHandleStats = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ stats: {} });
const mockHandlePending = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ requests: [] });
const mockHandleComplete = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });
const mockHandleSynthesisEngine = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ status: 'ok' });
const mockHandlePartitions = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ partitions: [] });
const mockHandleContext = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ context: {} });

jest.unstable_mockModule('../../handlers/governance.js', () => ({
    handleStats: mockHandleStats,
    handlePending: mockHandlePending,
    handleComplete: mockHandleComplete,
    handleSynthesisEngine: mockHandleSynthesisEngine,
    handlePartitions: mockHandlePartitions,
    handleContext: mockHandleContext,
}));

const mockHandleConfig = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ config: {} });

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

const mockHandleFeedback = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleFeedback: mockHandleFeedback,
}));

const mockHandleEVM = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ result: {} });

jest.unstable_mockModule('../../handlers/evm.js', () => ({
    handleLabVerify: mockHandleEVM,
}));

const mockHandleElite = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ pool: [] });

jest.unstable_mockModule('../../handlers/elite.js', () => ({
    handleElite: mockHandleElite,
}));

const mockHandleKnowledgeBase = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ folders: [] });

jest.unstable_mockModule('../../handlers/knowledge-base.js', () => ({
    handleKnowledgeBase: mockHandleKnowledgeBase,
}));

const mockHandleProjects = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ projects: [] });

jest.unstable_mockModule('../../handlers/projects.js', () => ({
    handleProjects: mockHandleProjects,
}));

const mockHandleApiRegistry = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ apis: [] });

jest.unstable_mockModule('../../handlers/api-registry.js', () => ({
    handleApiRegistry: mockHandleApiRegistry,
}));

// podbit.api now routes through the generic gateway (handleGenericApi) — the API
// registry is reachable via podbit.apiRegistry. Both handlers are dispatched, so both
// need mocks here.
const mockHandleGenericApi = jest.fn<(p: any) => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/generic-api.js', () => ({
    handleGenericApi: mockHandleGenericApi,
}));

const mockEmitActivity = jest.fn<(...args: any[]) => void>();

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

// --- Import module under test (after all mocks) -----------------------------

const { handleToolCall } = await import('../../mcp/dispatch.js');

// --- Tests -------------------------------------------------------------------

describe('mcp/dispatch — handleToolCall', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns error for unknown tool name', async () => {
        const result = await handleToolCall('podbit.nonexistent', {});
        expect(result).toEqual({ error: 'Unknown tool: podbit.nonexistent' });
    });

    it('does not emit activity for unknown tool', async () => {
        await handleToolCall('unknown.tool', {});
        expect(mockEmitActivity).not.toHaveBeenCalled();
    });

    it('dispatches podbit.query to handleQuery', async () => {
        const params = { text: 'hello', domain: 'test-domain' };
        mockHandleQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });

        const result = await handleToolCall('podbit.query', params);

        expect(mockHandleQuery).toHaveBeenCalledWith(params);
        expect(result).toEqual({ rows: [{ id: '1' }] });
    });

    it('dispatches podbit.get to handleGet', async () => {
        const params = { id: 'abc-123' };
        await handleToolCall('podbit.get', params);
        expect(mockHandleGet).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.propose to handlePropose', async () => {
        const params = { content: 'test', nodeType: 'seed', contributor: 'test' };
        await handleToolCall('podbit.propose', params);
        expect(mockHandlePropose).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.voice to handleVoice', async () => {
        await handleToolCall('podbit.voice', { nodeId: 'x' });
        expect(mockHandleVoice).toHaveBeenCalledWith({ nodeId: 'x' });
    });

    it('dispatches podbit.config to handleConfig', async () => {
        const params = { action: 'get' };
        await handleToolCall('podbit.config', params);
        expect(mockHandleConfig).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.kb to handleKnowledgeBase', async () => {
        const params = { action: 'folders' };
        await handleToolCall('podbit.kb', params);
        expect(mockHandleKnowledgeBase).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.projects to handleProjects', async () => {
        const params = { action: 'list' };
        await handleToolCall('podbit.projects', params);
        expect(mockHandleProjects).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.api to handleGenericApi (the unified gateway)', async () => {
        const params = { action: 'list' };
        await handleToolCall('podbit.api', params);
        expect(mockHandleGenericApi).toHaveBeenCalledWith(params);
    });

    it('dispatches podbit.apiRegistry to handleApiRegistry', async () => {
        const params = { action: 'list' };
        await handleToolCall('podbit.apiRegistry', params);
        expect(mockHandleApiRegistry).toHaveBeenCalledWith(params);
    });

    it('dispatches docs.templates to handleScaffoldTemplates', async () => {
        await handleToolCall('docs.templates', {});
        expect(mockHandleScaffoldTemplates).toHaveBeenCalledWith({});
    });

    it('dispatches docs.decompose to handleScaffoldDecompose', async () => {
        const params = { request: 'test', taskType: 'analysis' };
        await handleToolCall('docs.decompose', params);
        expect(mockHandleScaffoldDecompose).toHaveBeenCalledWith(params);
    });

    it('dispatches docs.generate to handleScaffoldGenerate', async () => {
        const params = { request: 'test', taskType: 'analysis' };
        await handleToolCall('docs.generate', params);
        expect(mockHandleScaffoldGenerate).toHaveBeenCalledWith(params);
    });

    // --- Activity emission ---------------------------------------------------

    it('emits activity with shortName (strips podbit. prefix)', async () => {
        await handleToolCall('podbit.stats', {});
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', 'stats');
    });

    it('emits activity with shortName (strips docs. prefix)', async () => {
        await handleToolCall('docs.templates', {});
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', 'templates');
    });

    it('emits activity with action suffix', async () => {
        await handleToolCall('podbit.synthesis', { action: 'start' });
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', 'synthesis.start');
    });

    it('emits activity with text hint (truncated to 60 chars)', async () => {
        const longText = 'a'.repeat(100);
        await handleToolCall('podbit.query', { text: longText });
        const expected = `query \u2014 "${'a'.repeat(60)}"`;
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', expected);
    });

    it('emits activity with domain hint', async () => {
        await handleToolCall('podbit.query', { domain: 'my-domain' });
        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', 'query [my-domain]');
    });

    it('emits activity with all hints combined', async () => {
        await handleToolCall('podbit.query', {
            action: 'search',
            text: 'find nodes',
            domain: 'design',
        });
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'mcp',
            'tool_call',
            'query.search \u2014 "find nodes" [design]'
        );
    });

    // --- Error handling ------------------------------------------------------

    it('catches handler errors and returns error object', async () => {
        mockHandleQuery.mockRejectedValueOnce(new Error('DB connection failed'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await handleToolCall('podbit.query', { text: 'test' });

        expect(result).toEqual({ error: 'DB connection failed' });
        expect(consoleSpy).toHaveBeenCalledWith(
            'Tool error (podbit.query):',
            expect.any(Error)
        );
        consoleSpy.mockRestore();
    });

    it('emits activity even when handler throws', async () => {
        mockHandleGet.mockRejectedValueOnce(new Error('fail'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await handleToolCall('podbit.get', { id: '123' });

        expect(mockEmitActivity).toHaveBeenCalledWith('mcp', 'tool_call', 'get');
        jest.spyOn(console, 'error').mockRestore();
    });

    // --- All tool mappings exist ---------------------------------------------

    it('has handlers for all expected tool names', async () => {
        const expectedTools = [
            'podbit.query', 'podbit.get', 'podbit.lineage', 'podbit.propose',
            'podbit.remove', 'podbit.edit', 'podbit.dedup', 'podbit.voice',
            'podbit.promote', 'podbit.stats', 'podbit.tensions', 'podbit.question',
            'podbit.validate', 'podbit.patterns', 'podbit.pending', 'podbit.complete',
            'podbit.synthesis', 'podbit.summarize', 'podbit.compress', 'podbit.partitions',
            'podbit.context', 'podbit.config', 'podbit.feedback', 'podbit.labVerify',
            'podbit.elite', 'podbit.kb', 'podbit.projects', 'podbit.api',
            'docs.templates', 'docs.decompose', 'docs.generate',
        ];

        for (const toolName of expectedTools) {
            const result = await handleToolCall(toolName, {});
            expect(result).not.toEqual({ error: `Unknown tool: ${toolName}` });
        }
    });

    // --- Re-exports ----------------------------------------------------------

    it('re-exports all expected handler functions', async () => {
        const mod = await import('../../mcp/dispatch.js');
        const expectedExports = [
            'handleToolCall',
            'handleQuery', 'handleGet', 'handleLineage', 'handlePropose',
            'handleVoice', 'handlePromote', 'handleStats', 'handleTensions',
            'handleQuestion', 'handleValidate', 'handleAbstractPatterns',
            'handlePending', 'handleComplete', 'handleSynthesisEngine',
            'handleSummarize', 'handleCompress', 'handleRemove', 'handleEdit',
            'handleDedup', 'handlePartitions', 'handleContext', 'handleConfig',
            'handleFeedback',
            'handleScaffoldTemplates', 'handleScaffoldDecompose', 'handleScaffoldGenerate',
        ];

        for (const name of expectedExports) {
            expect(typeof (mod as any)[name]).toBe('function');
        }
    });
});
