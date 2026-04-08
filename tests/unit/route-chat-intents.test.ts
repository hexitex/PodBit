/**
 * Unit tests for routes/chat/intents.ts —
 * handleChatMessage command routing, /stats, /synthesis, /templates,
 * /seed, /research, /tensions, /summarize, /compress, /dedup, /chat,
 * intent detection, and default LLM fallback.
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

// MCP server handlers
const mockHandleStats = jest.fn<() => Promise<any>>().mockResolvedValue({
    nodes: { total: 10, seeds: 5, breakthroughs: 2, knowledge: 2, abstraction: 1, avgWeight: 1.0, avgSalience: 0.5 },
    synthesisCycles: { total: 5, childrenCreated: 3, avgResonance: 0.6 },
});
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ node: { id: 'new-id' } });
const mockHandleTensions = jest.fn<() => Promise<any>>().mockResolvedValue({ tensions: [] });
const mockHandleSummarize = jest.fn<() => Promise<any>>().mockResolvedValue({ summary: 'test summary', nodeCount: 5, breakthroughs: 1, syntheses: 2, seeds: 2, cached: false });
const mockHandleCompress = jest.fn<() => Promise<any>>().mockResolvedValue({ compressed: 'compressed text', nodeCount: 5, cached: false });
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
    mockEnsureChatSettings.mockResolvedValue(undefined);
    mockHandleChatWithTools.mockResolvedValue(null);
    mockChatSettings.toolCallingEnabled = false;
    mockHandleStats.mockResolvedValue({
        nodes: { total: 10, seeds: 5, breakthroughs: 2, knowledge: 2, abstraction: 1, avgWeight: 1.0, avgSalience: 0.5 },
        synthesisCycles: { total: 5, childrenCreated: 3, avgResonance: 0.6 },
    });
    mockHandlePropose.mockResolvedValue({ node: { id: 'new-id' } });
    mockHandleTensions.mockResolvedValue({ tensions: [] });
    mockHandleSummarize.mockResolvedValue({ summary: 'test summary', nodeCount: 5, breakthroughs: 1, syntheses: 2, seeds: 2, cached: false });
    mockHandleCompress.mockResolvedValue({ compressed: 'compressed text', nodeCount: 5, cached: false });
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
// /stats command
// =============================================================================

describe('/stats command', () => {
    it('returns formatted stats', async () => {
        const result = await handleChatMessage('/stats');

        expect(result.type).toBe('text');
        expect(result.response).toContain('Knowledge Graph Stats');
        expect(result.response).toContain('10');
        expect(mockHandleStats).toHaveBeenCalledWith({});
    });
});

// =============================================================================
// /synthesis command
// =============================================================================

describe('/synthesis command', () => {
    it('reports when no nodes sampled', async () => {
        mockSynthesisCycle.mockResolvedValue(null);

        const result = await handleChatMessage('/synthesis');

        expect(result.type).toBe('text');
        expect(result.response).toContain('no nodes were sampled');
    });

    it('reports synthesis result with child', async () => {
        mockSynthesisCycle.mockResolvedValue({
            nodeA: { content: 'Node A content here' },
            nodeB: { content: 'Node B content here' },
            resonance: 0.75,
            child: { content: 'Child insight', trajectory: 'knowledge' },
        });

        const result = await handleChatMessage('/synthesis');

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

        expect(result.response).toContain('No templates available');
    });

    it('lists available templates', async () => {
        mockQuery.mockResolvedValue([
            { task_type: 'research', name: 'Research Brief' },
            { task_type: 'analysis', name: 'Analysis Report' },
        ]);

        const result = await handleChatMessage('/templates');

        expect(result.response).toContain('Research Brief');
        expect(result.response).toContain('Analysis Report');
    });
});

// =============================================================================
// /seed command
// =============================================================================

describe('/seed command', () => {
    it('seeds text into specified domain', async () => {
        const result = await handleChatMessage('/seed This is a test seed with enough content', 'api', ['biology']);

        expect(result.response).toContain('Seeded');
        expect(mockHandlePropose).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeType: 'seed',
                domain: 'biology',
                contributor: 'human:you',
            })
        );
    });

    it('infers domain when none specified', async () => {
        mockInferDomain.mockResolvedValue({ domain: 'inferred-domain', source: 'embedding' });

        const result = await handleChatMessage('/seed This is a test seed with enough content');

        expect(result.response).toContain('auto-detected');
    });

    it('handles seed failure', async () => {
        mockHandlePropose.mockRejectedValue(new Error('DB write failed'));

        const result = await handleChatMessage('/seed This is a test seed with enough content', 'api', ['test']);

        expect(result.type).toBe('error');
        expect(result.response).toContain('Seed failed');
    });

    it('reports when no seeds created', async () => {
        mockHandlePropose.mockResolvedValue({ node: {} });

        const result = await handleChatMessage('/seed This is a test seed with enough content', 'api', ['test']);

        expect(result.response).toContain('No seeds created');
    });
});

// =============================================================================
// /research command
// =============================================================================

describe('/research command', () => {
    it('queues research in MCP mode', async () => {
        const result = await handleChatMessage('/research quantum computing', 'mcp', ['physics']);

        expect(result.type).toBe('mcp_queued');
        expect(mockQueueRequest).toHaveBeenCalledWith('research', expect.objectContaining({ topic: 'quantum computing' }));
    });

    it('generates seeds in API mode', async () => {
        mockCallSubsystemModel.mockResolvedValue('- Fact one about quantum computing\n- Fact two about quantum computing');
        mockHandlePropose.mockResolvedValue({ node: { id: 'seed-1' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleChatMessage('/research quantum computing', 'api', ['physics']);

        expect(result.response).toContain('Research complete');
        expect(mockCallSubsystemModel).toHaveBeenCalledWith('chat', expect.any(String), expect.any(Object));
    });

    it('reports when no seeds generated', async () => {
        mockCallSubsystemModel.mockResolvedValue('short');

        const result = await handleChatMessage('/research quantum computing', 'api', ['physics']);

        expect(result.response).toContain('No seeds could be parsed');
    });

    it('handles research failure', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM offline'));

        const result = await handleChatMessage('/research quantum computing', 'api', ['physics']);

        expect(result.type).toBe('error');
        expect(result.response).toContain('Research failed');
    });
});

// =============================================================================
// /tensions command
// =============================================================================

describe('/tensions command', () => {
    it('reports no tensions found', async () => {
        mockHandleTensions.mockResolvedValue({ tensions: [] });

        const result = await handleChatMessage('/tensions');

        expect(result.response).toContain('No tensions found');
    });

    it('lists found tensions', async () => {
        mockHandleTensions.mockResolvedValue({
            tensions: [{
                similarity: 0.85,
                nodeA: { domain: 'physics', content: 'Statement A about quantum mechanics and particles' },
                nodeB: { domain: 'physics', content: 'Statement B contradicting quantum mechanics view' },
            }],
        });

        const result = await handleChatMessage('/tensions physics');

        expect(result.response).toContain('Tensions found');
        expect(result.response).toContain('0.85');
    });

    it('handles tensions failure', async () => {
        mockHandleTensions.mockRejectedValue(new Error('DB error'));

        const result = await handleChatMessage('/tensions');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Tensions search failed');
    });
});

// =============================================================================
// /summarize command
// =============================================================================

describe('/summarize command', () => {
    it('returns summary', async () => {
        const result = await handleChatMessage('/summarize quantum computing');

        expect(result.response).toContain('Knowledge Summary');
        expect(result.response).toContain('test summary');
    });

    it('handles summarize error result', async () => {
        mockHandleSummarize.mockResolvedValue({ error: 'Not enough knowledge' });

        const result = await handleChatMessage('/summarize unknown topic');

        expect(result.response).toContain('Not enough knowledge');
    });

    it('handles summarize exception', async () => {
        mockHandleSummarize.mockRejectedValue(new Error('LLM error'));

        const result = await handleChatMessage('/summarize quantum computing');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Summarize failed');
    });
});

// =============================================================================
// /compress command
// =============================================================================

describe('/compress command', () => {
    it('returns compressed prompt', async () => {
        const result = await handleChatMessage('/compress quantum computing');

        expect(result.response).toContain('Compressed Prompt');
        expect(result.response).toContain('compressed text');
    });

    it('handles compress error result', async () => {
        mockHandleCompress.mockResolvedValue({ error: 'Not enough nodes' });

        const result = await handleChatMessage('/compress unknown');

        expect(result.response).toContain('Not enough nodes');
    });

    it('handles compress exception', async () => {
        mockHandleCompress.mockRejectedValue(new Error('Compression failed'));

        const result = await handleChatMessage('/compress quantum computing');

        expect(result.type).toBe('error');
    });
});

// =============================================================================
// /dedup command
// =============================================================================

describe('/dedup command', () => {
    it('reports no duplicates found', async () => {
        const result = await handleChatMessage('/dedup');

        expect(result.response).toContain('No duplicates found');
    });

    it('reports dedup results with clusters', async () => {
        mockHandleDedup.mockResolvedValue({
            totalClustersFound: 1,
            totalNodesArchived: 1,
            domainsProcessed: 1,
            results: [{
                domain: 'test',
                clustersFound: 1,
                nodesArchived: 1,
                clusters: [{
                    keptNode: { content: 'Kept node content here', weight: 1.5 },
                    archivedNodes: [{ content: 'Archived duplicate content', similarity: 0.95 }],
                }],
            }],
        });

        const result = await handleChatMessage('/dedup test');

        expect(result.response).toContain('Dedup');
        expect(result.response).toContain('Archived');
    });

    it('handles dry run flag', async () => {
        await handleChatMessage('/dedup test --dry-run');

        expect(mockHandleDedup).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true })
        );
    });

    it('handles dedup failure', async () => {
        mockHandleDedup.mockRejectedValue(new Error('Dedup error'));

        const result = await handleChatMessage('/dedup');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Dedup failed');
    });
});

// =============================================================================
// /chat command
// =============================================================================

describe('/chat command', () => {
    it('prompts when no text given', async () => {
        const result = await handleChatMessage('/chat');

        expect(result.response).toContain('What would you like to talk about');
    });

    it('returns error when no chat model assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ chat: null });

        const result = await handleChatMessage('/chat hello');

        expect(result.type).toBe('error');
        expect(result.response).toContain('No model assigned');
    });

    it('calls LLM and returns response', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            chat: { id: 'm1', modelId: 'gpt-4', provider: 'openai', endpointUrl: null, apiKey: null },
        });
        mockCallWithMessages.mockResolvedValue({
            choices: [{ message: { content: 'Hello there!' } }],
        });

        const result = await handleChatMessage('/chat hello');

        expect(result.type).toBe('text');
        expect(result.response).toBe('Hello there!');
    });
});

// =============================================================================
// Tool calling bypass
// =============================================================================

describe('tool calling', () => {
    it('routes to tool calling when enabled and not system command', async () => {
        mockChatSettings.toolCallingEnabled = true;
        mockHandleChatWithTools.mockResolvedValue({
            response: 'tool response',
            type: 'text',
            metadata: {},
        });

        const result = await handleChatMessage('tell me about physics');

        expect(result.response).toBe('tool response');
        expect(mockHandleChatWithTools).toHaveBeenCalled();
    });

    it('falls through when tool calling returns null', async () => {
        mockChatSettings.toolCallingEnabled = true;
        mockHandleChatWithTools.mockResolvedValue(null);
        mockCallSubsystemModel.mockResolvedValue('fallback LLM response');

        const result = await handleChatMessage('tell me something random');

        expect(result.response).toBe('fallback LLM response');
    });

    it('bypasses tool calling for system commands', async () => {
        mockChatSettings.toolCallingEnabled = true;

        const result = await handleChatMessage('/stats');

        expect(mockHandleChatWithTools).not.toHaveBeenCalled();
        expect(result.response).toContain('Knowledge Graph Stats');
    });
});

// =============================================================================
// Intent detection (voice/connection/relate keywords)
// =============================================================================

describe('intent detection — voice/connection', () => {
    it('returns MCP guidance for voice-related queries', async () => {
        const result = await handleChatMessage('voice connections between topics');

        expect(result.response).toContain('MCP');
    });
});

// =============================================================================
// Intent detection — knowledge/search
// =============================================================================

describe('intent detection — knowledge search', () => {
    it('searches for knowledge by term', async () => {
        mockQuery.mockResolvedValue([
            { content: 'Something about AI alignment', domain: 'alignment', weight: 1.2, specificity: 0.8 },
        ]);

        const result = await handleChatMessage('what do we know about alignment');

        expect(result.response).toContain('Knowledge about');
        expect(result.response).toContain('alignment');
    });

    it('suggests research when nothing found', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await handleChatMessage('search for quantum biology');

        expect(result.response).toContain('No knowledge found');
        expect(result.response).toContain('/research');
    });
});

// =============================================================================
// Intent detection — document outline
// =============================================================================

describe('intent detection — outline/document', () => {
    it('triggers scaffold for outline requests', async () => {
        const result = await handleChatMessage('create an outline for my research');

        expect(result.response).toContain('Document outline');
        expect(mockDecompose).toHaveBeenCalled();
    });

    it('handles scaffold failure', async () => {
        mockDecompose.mockRejectedValue(new Error('Scaffold error'));

        const result = await handleChatMessage('outline a document about testing');

        expect(result.type).toBe('error');
        expect(result.response).toContain('Scaffold failed');
    });
});

// =============================================================================
// Default LLM fallback
// =============================================================================

describe('default LLM fallback', () => {
    it('falls back to help text when LLM fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('No model'));

        const result = await handleChatMessage('something completely random');

        expect(result.response).toContain('/stats');
        expect(result.response).toContain('/synthesis');
    });
});
