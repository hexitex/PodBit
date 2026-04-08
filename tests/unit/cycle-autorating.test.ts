/**
 * Unit tests for core/cycles/autorating.ts — autorating cycle logic.
 *
 * Mocks: db.js, config.js, models.js, prompts.js, project-context.js,
 * handlers/feedback.js, services/event-bus.js, number-variables.js, provenance.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockYield = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('{}');
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('rate this node');
const mockGetProjectContextBlock = jest.fn<() => Promise<string>>().mockResolvedValue('');
const mockHandleRate = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({});
const mockEmitActivity = jest.fn();
const mockResolveContent = jest.fn<(c: string) => Promise<string>>().mockImplementation(async (c) => c);
const mockBuildProvenanceTag = jest.fn<(n: any) => string>().mockReturnValue('[seed/manual]');

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    yieldToEventLoop: mockYield,
}));
jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: {
            autorating: { batchSize: 5, gracePeriodMinutes: 30, intervalMs: 60000 },
        },
    },
}));
jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));
jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));
jest.unstable_mockModule('../../handlers/feedback.js', () => ({
    handleRate: mockHandleRate,
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));
jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
}));

const { autorateOneNode, runAutoratingBatch } = await import('../../core/cycles/autorating.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockYield.mockResolvedValue(undefined);
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockGetPrompt.mockResolvedValue('rate this node');
    mockGetProjectContextBlock.mockResolvedValue('');
    mockHandleRate.mockResolvedValue({});
    mockResolveContent.mockImplementation(async (c) => c);
    mockBuildProvenanceTag.mockReturnValue('[seed/manual]');
});

describe('autorateOneNode', () => {
    const node = {
        id: 'node-123',
        content: 'Test content',
        node_type: 'seed',
        domain: 'test-domain',
        weight: 1.0,
    };

    it('rates a node successfully with rating=1', async () => {
        mockQuery.mockResolvedValueOnce([]); // no parent nodes
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'Good insight' }));

        const result = await autorateOneNode(node, '');

        expect(result).toBe(true);
        expect(mockHandleRate).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 'node-123',
            rating: 1,
            source: 'auto',
            contributor: 'autorating-cycle',
        }));
    });

    it('rates a node with rating=0 (not useful)', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 0, reason: 'Too vague' }));

        const result = await autorateOneNode(node, '');

        expect(result).toBe(true);
        expect(mockHandleRate).toHaveBeenCalledWith(expect.objectContaining({ rating: 0 }));
    });

    it('rates a node with rating=-1 (harmful)', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: -1, reason: 'Factually wrong' }));

        const result = await autorateOneNode(node, '');

        expect(result).toBe(true);
        expect(mockHandleRate).toHaveBeenCalledWith(expect.objectContaining({ rating: -1 }));
    });

    it('returns false when LLM response is not JSON', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue('I cannot rate this node');

        const result = await autorateOneNode(node, '');

        expect(result).toBe(false);
        expect(mockHandleRate).not.toHaveBeenCalled();
    });

    it('returns false for invalid rating value', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 5, reason: 'Great' }));

        const result = await autorateOneNode(node, '');

        expect(result).toBe(false);
    });

    it('includes parent context when parents exist', async () => {
        const parents = [
            { content: 'Parent A', node_type: 'seed', generation: 0, contributor: 'user', origin: 'manual', verification_status: null, verification_score: null },
        ];
        mockQuery.mockResolvedValueOnce(parents);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'ok' }));

        await autorateOneNode(node, '');

        expect(mockGetPrompt).toHaveBeenCalledWith('core.autorating', expect.objectContaining({
            parentContext: expect.stringContaining('PARENT NODES'),
        }));
    });

    it('resolves number variables in content', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockResolveContent.mockResolvedValue('Resolved content value');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'ok' }));

        await autorateOneNode(node, '');

        expect(mockResolveContent).toHaveBeenCalledWith('Test content');
        expect(mockGetPrompt).toHaveBeenCalledWith('core.autorating', expect.objectContaining({
            nodeContent: 'Resolved content value',
        }));
    });

    it('logs dream_cycles entry after rating', async () => {
        mockQuery.mockResolvedValueOnce([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'Good' }));

        await autorateOneNode(node, '');

        // queryOne is called for the INSERT
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dream_cycles'),
            expect.arrayContaining(['node-123']),
        );
    });
});

describe('runAutoratingBatch', () => {
    it('returns 0 when no candidates', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await runAutoratingBatch();

        expect(result).toBe(0);
    });

    it('processes candidates and returns success count', async () => {
        const candidates = [
            { id: 'n1', content: 'c1', node_type: 'seed', domain: 'd', weight: 1 },
            { id: 'n2', content: 'c2', node_type: 'seed', domain: 'd', weight: 1 },
        ];
        // First query = candidates, subsequent = parent lookups (empty)
        mockQuery
            .mockResolvedValueOnce(candidates)
            .mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'ok' }));

        const result = await runAutoratingBatch();

        expect(result).toBe(2);
    });

    it('yields between nodes', async () => {
        const candidates = [
            { id: 'n1', content: 'c1', node_type: 'seed', domain: 'd', weight: 1 },
            { id: 'n2', content: 'c2', node_type: 'seed', domain: 'd', weight: 1 },
        ];
        mockQuery
            .mockResolvedValueOnce(candidates)
            .mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ rating: 1, reason: 'ok' }));

        await runAutoratingBatch();

        expect(mockYield).toHaveBeenCalledTimes(2);
    });

    it('counts failed ratings separately', async () => {
        const candidates = [
            { id: 'n1', content: 'c1', node_type: 'seed', domain: 'd', weight: 1 },
            { id: 'n2', content: 'c2', node_type: 'seed', domain: 'd', weight: 1 },
        ];
        mockQuery
            .mockResolvedValueOnce(candidates)
            .mockResolvedValue([]);
        mockCallSubsystemModel
            .mockResolvedValueOnce(JSON.stringify({ rating: 1, reason: 'ok' }))
            .mockResolvedValueOnce('unparseable');

        const result = await runAutoratingBatch();

        expect(result).toBe(1); // only 1 succeeded
    });
});
