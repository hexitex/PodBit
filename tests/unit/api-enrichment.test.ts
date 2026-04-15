/**
 * Unit tests for evm/api/enrichment.ts —
 * extractEnrichments, createEnrichmentNodes, appendEnrichmentToNode.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('[]');
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt');
const mockEmitActivity = jest.fn<() => void>();
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ success: false });
const mockEditNodeContent = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRegisterNodeVariables = jest.fn<() => Promise<any>>().mockResolvedValue({ varIds: [], annotatedContent: '' });

const mockApiVerificationConfig = {
    enrichmentMaxNodesPerCall: 5,
    enrichmentMinConfidence: 0.5,
    enrichmentInitialWeight: 1.2,
    enrichmentMaxContentWords: 500,
};

const mockAppConfig = {
    labVerify: { apiVerification: mockApiVerificationConfig },
    numberVariables: { enabled: false },
};

jest.unstable_mockModule('../../models/assignments.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));
jest.unstable_mockModule('../../prompts.js', () => ({ getPrompt: mockGetPrompt }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8), emitActivity: mockEmitActivity }));
jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    query: mockQuery,
    editNodeContent: mockEditNodeContent,
}));
jest.unstable_mockModule('../../handlers/graph.js', () => ({ handlePropose: mockHandlePropose }));
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    registerNodeVariables: mockRegisterNodeVariables,
}));

const { extractEnrichments, createEnrichmentNodes, appendEnrichmentToNode } = await import('../../evm/api/enrichment.js');

function makeApi(overrides: any = {}) {
    return {
        id: 'api-1',
        name: 'my-api',
        displayName: 'My API',
        promptExtract: 'Extract facts about X.',
        ...overrides,
    };
}

function makeDecision(overrides: any = {}) {
    return {
        apiId: 'api-1',
        apiName: 'my-api',
        reason: 'Relevant to claim',
        confidence: 0.8,
        ...overrides,
    };
}

function makeFact(overrides: any = {}) {
    return {
        content: 'The value is 42.',
        confidence: 0.85,
        category: 'numerical',
        source: 'api',
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockCallSubsystemModel.mockResolvedValue('[]');
    mockGetPrompt.mockResolvedValue('prompt');
    mockEmitActivity.mockReturnValue(undefined);
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockHandlePropose.mockResolvedValue({ success: false });
    mockEditNodeContent.mockResolvedValue(undefined);
    mockRegisterNodeVariables.mockResolvedValue({ varIds: [], annotatedContent: '' });
    mockApiVerificationConfig.enrichmentMaxNodesPerCall = 5;
    mockApiVerificationConfig.enrichmentMinConfidence = 0.5;
    mockApiVerificationConfig.enrichmentInitialWeight = 1.2;
    mockApiVerificationConfig.enrichmentMaxContentWords = 500;
    mockAppConfig.numberVariables.enabled = false;
});

// =============================================================================
// extractEnrichments
// =============================================================================

describe('extractEnrichments', () => {
    it('returns empty array when LLM returns empty JSON array', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        const result = await extractEnrichments(makeApi(), makeDecision(), 'node content', 'response', 'science');
        expect(result).toHaveLength(0);
    });

    it('returns parsed facts from JSON array', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify([
            { content: 'First fact is long enough.', confidence: 0.9, category: 'numerical', source: 'api' },
            { content: 'Second fact is long enough.', confidence: 0.7, category: 'general', source: '' },
        ]));

        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('First fact is long enough.');
        expect(result[0].confidence).toBe(0.9);
        expect(result[1].category).toBe('general');
    });

    it('filters out facts with content shorter than 10 chars', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify([
            { content: 'Short', confidence: 0.9, category: 'general', source: '' },
            { content: 'This is a long enough fact.', confidence: 0.9, category: 'general', source: '' },
        ]));

        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('This is a long enough fact.');
    });

    it('clamps confidence to [0, 1]', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify([
            { content: 'Fact with too high confidence.', confidence: 1.5, category: 'general', source: '' },
            { content: 'Fact with negative confidence.', confidence: -0.1, category: 'general', source: '' },
        ]));

        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result[0].confidence).toBe(1);
        expect(result[1].confidence).toBe(0);
    });

    it('defaults confidence to 0.5 when missing', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify([
            { content: 'Fact without confidence field.', category: 'general', source: '' },
        ]));

        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result[0].confidence).toBe(0.5);
    });

    it('handles markdown-fenced JSON', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '```json\n[{"content":"A factual claim here.","confidence":0.8,"category":"general","source":"api"}]\n```'
        );

        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result).toHaveLength(1);
    });

    it('returns empty array when JSON is not an array', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ facts: [] }));
        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result).toHaveLength(0);
    });

    it('returns empty array when JSON parse fails', async () => {
        mockCallSubsystemModel.mockResolvedValue('not valid json');
        const result = await extractEnrichments(makeApi(), makeDecision(), 'content', 'response', 'science');
        expect(result).toHaveLength(0);
    });

    it('uses perApiPrompt fallback when api.promptExtract is missing', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        await extractEnrichments(makeApi({ promptExtract: undefined }), makeDecision(), 'content', 'resp', 'science');

        const extractCall = (mockGetPrompt.mock.calls as any[]).find(([key]) => key === 'api.extract');
        expect(extractCall).toBeDefined();
        expect(extractCall[1].perApiPrompt).toContain('No API-specific');
    });

    it('truncates apiResponse to 8000 chars', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        const longResponse = 'x'.repeat(10000);
        await extractEnrichments(makeApi(), makeDecision(), 'content', longResponse, 'science');

        const extractCall = (mockGetPrompt.mock.calls as any[]).find(([key]) => key === 'api.extract');
        expect(extractCall[1].apiResponse.length).toBe(8000);
    });
});

// =============================================================================
// createEnrichmentNodes
// =============================================================================

describe('createEnrichmentNodes', () => {
    it('returns empty result when no facts provided', async () => {
        const result = await createEnrichmentNodes([], 'source-node', 'my-api', 'science');
        expect(result.nodeIds).toHaveLength(0);
        expect(result.skipped).toBe(0);
        expect(result.mode).toBe('children');
    });

    it('filters facts below minConfidence', async () => {
        const facts = [
            makeFact({ confidence: 0.3 }), // below 0.5
            makeFact({ confidence: 0.8 }), // above 0.5
        ];
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'new-node' } });

        const result = await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');
        expect(result.skipped).toBe(1);
        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
    });

    it('caps number of facts at enrichmentMaxNodesPerCall', async () => {
        mockApiVerificationConfig.enrichmentMaxNodesPerCall = 2;
        const facts = [makeFact(), makeFact(), makeFact()];
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'n' } });

        const result = await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');
        expect(mockHandlePropose).toHaveBeenCalledTimes(2);
        expect(result.skipped).toBe(1);
    });

    it('collects created node IDs', async () => {
        const facts = [makeFact(), makeFact()];
        mockHandlePropose
            .mockResolvedValueOnce({ success: true, node: { id: 'node-a' } })
            .mockResolvedValueOnce({ success: true, node: { id: 'node-b' } });

        const result = await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');
        expect(result.nodeIds).toEqual(['node-a', 'node-b']);
    });

    it('counts rejected nodes as skipped', async () => {
        const facts = [makeFact()];
        mockHandlePropose.mockResolvedValue({ success: false, rejected: true, reason: 'duplicate' });

        const result = await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');
        expect(result.nodeIds).toHaveLength(0);
        expect(result.skipped).toBe(1);
        expect(result.errors[0]).toContain('Fact rejected');
    });

    it('records error when handlePropose throws', async () => {
        const facts = [makeFact()];
        mockHandlePropose.mockRejectedValue(new Error('DB error'));

        const result = await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');
        expect(result.errors[0]).toContain('Node creation failed');
    });

    it('emits activity when nodes are created', async () => {
        const facts = [makeFact()];
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'node-x' } });

        await createEnrichmentNodes(facts, 'source-node', 'my-api', 'science');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'api', 'api_enrichment_complete',
            expect.stringContaining('my-api'),
            expect.objectContaining({ nodesCreated: 1 }),
        );
    });
});

// =============================================================================
// appendEnrichmentToNode
// =============================================================================

describe('appendEnrichmentToNode', () => {
    it('returns immediately when no facts pass confidence filter', async () => {
        const facts = [makeFact({ confidence: 0.1 })]; // below 0.5

        const result = await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');
        expect(result.mode).toBe('inline');
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('returns error when source node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const facts = [makeFact()];

        const result = await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');
        expect(result.errors[0]).toContain('Source node not found');
    });

    it('appends enrichment to node content', async () => {
        mockQueryOne.mockResolvedValue({ id: 'source-id', content: 'Original content.', domain: 'science' });
        const facts = [makeFact({ content: 'Extra fact here.' })];

        const result = await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');

        expect(mockEditNodeContent).toHaveBeenCalledWith(
            'source-id',
            expect.stringContaining('[API-verified via my-api]: Extra fact here.'),
            expect.any(String),
            expect.any(String),
            expect.any(Object),
        );
        expect(result.mode).toBe('inline');
    });

    it('falls back to children mode when combined content exceeds maxWords', async () => {
        mockApiVerificationConfig.enrichmentMaxContentWords = 3; // very small limit
        mockQueryOne.mockResolvedValue({ id: 'source-id', content: 'Original content here.', domain: 'science' });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'new-child' } });

        const facts = [makeFact({ content: 'Extra fact appended here making it too long.' })];

        const result = await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');
        expect(result.mode).toBe('children');
        expect(mockEditNodeContent).not.toHaveBeenCalled();
    });

    it('falls back to children mode when editNodeContent throws', async () => {
        mockQueryOne.mockResolvedValue({ id: 'source-id', content: 'Content.', domain: 'science' });
        mockEditNodeContent.mockRejectedValue(new Error('Edit failed'));
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'fallback-node' } });

        const facts = [makeFact()];

        const result = await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');
        expect(result.mode).toBe('children');
    });

    it('re-extracts number variables when enabled', async () => {
        mockAppConfig.numberVariables.enabled = true;
        mockQueryOne.mockResolvedValue({ id: 'source-id', content: 'Original.', domain: 'science' });
        mockRegisterNodeVariables.mockResolvedValue({ varIds: ['VAR001'], annotatedContent: 'Annotated [[[VAR001]]]' });
        const facts = [makeFact()];

        await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');

        expect(mockRegisterNodeVariables).toHaveBeenCalled();
        // Should update content with annotated version
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET content'),
            expect.arrayContaining(['Annotated [[[VAR001]]]', 'source-id']),
        );
    });

    it('emits inline enrichment activity event', async () => {
        mockQueryOne.mockResolvedValue({ id: 'source-id', content: 'Content.', domain: 'science' });
        const facts = [makeFact()];

        await appendEnrichmentToNode(facts, 'source-id', 'my-api', 'science');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'api', 'api_enrichment_inline',
            expect.stringContaining('my-api'),
            expect.objectContaining({ factsAppended: 1 }),
        );
    });
});
