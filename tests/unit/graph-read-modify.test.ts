/**
 * Unit tests for handlers/graph/read.ts (handleGet, handleLineage)
 * and handlers/graph/modify.ts (handleRemove, handleEdit).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEditNodeContent = jest.fn<() => Promise<any>>().mockResolvedValue({ updated: true });
const mockSetExcludedFromBriefs = jest.fn<() => Promise<any>>().mockResolvedValue({ excluded: true });
const mockInvalidateKnowledgeCache = jest.fn<() => void>();
const mockGetLineageQuery = jest.fn<() => string>().mockReturnValue('SELECT * FROM lineage');
const mockLogOperation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
    editNodeContent: mockEditNodeContent,
    setExcludedFromBriefs: mockSetExcludedFromBriefs,
    detectInjection: jest.fn(() => ({ isInjection: false, score: 0, reasons: [] })),
    checkDomainConcentration: jest.fn(),
    createNode: jest.fn(),
    createEdge: jest.fn(),
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    getLineageQuery: mockGetLineageQuery,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
    cosineSimilarity: jest.fn(),
}));

jest.unstable_mockModule('../../core/integrity.js', () => ({
    logOperation: mockLogOperation,
    computeContentHash: jest.fn<() => string>().mockReturnValue('hash-abc123'),
}));

const { handleGet, handleLineage } = await import('../../handlers/graph/read.js');
const { handleRemove, handleEdit } = await import('../../handlers/graph/modify.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNodeRow(overrides: Record<string, any> = {}): Record<string, any> {
    return {
        id: 'node-1',
        content: 'Test node content',
        node_type: 'seed',
        trajectory: 'knowledge',
        domain: 'science',
        weight: 1.0,
        salience: 0.5,
        specificity: 1.5,
        origin: 'manual',
        contributor: 'human',
        excluded: 0,
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        archived: 0,
        validation_synthesis: null,
        validation_novelty: null,
        validation_testability: null,
        validation_tension_resolution: null,
        validation_composite: null,
        validation_reason: null,
        validated_at: null,
        validated_by: null,
        feedback_rating: null,
        feedback_source: null,
        feedback_at: null,
        feedback_note: null,
        verification_status: null,
        verification_score: null,
        lifecycle_state: 'active',
        born_at: null,
        activated_at: null,
        declining_since: null,
        composted_at: null,
        barren_cycles: 0,
        total_children: 0,
        generation: 0,
        avatar_url: null,
        content_hash: null,
        partition_id: null,
        partition_name: null,
        parent_count: '2',
        child_count: '3',
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLogDecision.mockResolvedValue(undefined);
    mockEditNodeContent.mockResolvedValue({ updated: true });
    mockSetExcludedFromBriefs.mockResolvedValue({ excluded: true });
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);
    mockGetLineageQuery.mockReturnValue('SELECT * FROM lineage');
    mockLogOperation.mockResolvedValue(undefined);
});

// =============================================================================
// handleGet
// =============================================================================

describe('handleGet', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleGet({ id: 'nonexistent' });

        expect(result.error).toBe('Node not found');
    });

    it('returns full node shape with parsed parent/child counts', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        // decisions, keywords, synonyms all empty
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.id).toBe('node-1');
        expect(result.content).toBe('Test node content');
        expect(result.type).toBe('seed');
        expect(result.domain).toBe('science');
        expect(result.parentCount).toBe(2);
        expect(result.childCount).toBe(3);
        expect(result.excluded).toBe(false);
        expect(result.archived).toBe(false);
    });

    it('parses metadata JSON string', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({ metadata: '{"source":"web","url":"http://ex.com"}' }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.metadata).toEqual({ source: 'web', url: 'http://ex.com' });
    });

    it('returns null metadata when field is null', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({ metadata: null }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.metadata).toBeNull();
    });

    it('includes validation block when validation_composite is set', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({
            validation_composite: 0.82,
            validation_synthesis: 0.9,
            validation_novelty: 0.7,
            validation_testability: 0.8,
            validation_tension_resolution: 0.85,
            validation_reason: 'Strong insight',
            validated_at: '2024-02-01T00:00:00Z',
            validated_by: 'claude',
        }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.validation).not.toBeNull();
        expect(result.validation!.composite).toBe(0.82);
        expect(result.validation!.reason).toBe('Strong insight');
    });

    it('returns null validation when validation_composite is not set', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({ validation_composite: null }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.validation).toBeNull();
    });

    it('includes provenance from decisions', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        // First query call = decisions, second = keywords, third = synonyms
        mockQuery
            .mockResolvedValueOnce([
                {
                    field: 'junk', old_value: 'false', new_value: 'true',
                    decided_by_tier: 'human', contributor: 'user-1',
                    reason: 'Off topic', created_at: '2024-01-02T00:00:00Z',
                },
            ])
            .mockResolvedValueOnce([]) // keywords
            .mockResolvedValueOnce([]); // synonyms

        const result = await handleGet({ id: 'node-1' });

        expect(result.provenance).toHaveLength(1);
        expect(result.provenance![0].field).toBe('junk');
        expect(result.provenance![0].reason).toBe('Off topic');
    });

    it('returns null provenance when no decisions', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.provenance).toBeNull();
    });

    it('includes keywords when present', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        mockQuery
            .mockResolvedValueOnce([])  // decisions
            .mockResolvedValueOnce([{ keyword: 'AI' }, { keyword: 'machine learning' }])
            .mockResolvedValueOnce([]); // synonyms

        const result = await handleGet({ id: 'node-1' });

        expect(result.keywords).toEqual(['AI', 'machine learning']);
    });

    it('returns null keywords when no keywords exist', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.keywords).toBeNull();
    });

    it('includes domain synonyms when present', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow());
        mockQuery
            .mockResolvedValueOnce([])  // decisions
            .mockResolvedValueOnce([])  // keywords
            .mockResolvedValueOnce([{ synonym: 'natural science' }, { synonym: 'physics' }]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.domainSynonyms).toEqual(['natural science', 'physics']);
    });

    it('includes partition when partition_id is set', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({
            partition_id: 'part-1',
            partition_name: 'Science Partition',
        }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.partition).toEqual({ id: 'part-1', name: 'Science Partition' });
    });

    it('returns null partition when partition_id is null', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({ partition_id: null }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.partition).toBeNull();
    });

    it('returns lifecycle block with defaults', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({
            lifecycle_state: 'declining',
            barren_cycles: 5,
            total_children: 2,
            generation: 3,
        }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.lifecycle.state).toBe('declining');
        expect(result.lifecycle.barrenCycles).toBe(5);
        expect(result.lifecycle.totalChildren).toBe(2);
        expect(result.lifecycle.generation).toBe(3);
    });

    it('skips domain synonyms query when node has no domain', async () => {
        mockQueryOne.mockResolvedValue(makeNodeRow({ domain: null }));
        mockQuery.mockResolvedValue([]);

        const result = await handleGet({ id: 'node-1' });

        expect(result.domainSynonyms).toBeNull();
        // Only decisions + keywords queries should have been called (not synonyms)
        const queryCallSqls = (mockQuery.mock.calls as any[]).map(([sql]) => String(sql));
        expect(queryCallSqls.some(s => s.includes('domain_synonyms'))).toBe(false);
    });
});

// =============================================================================
// handleLineage
// =============================================================================

describe('handleLineage', () => {
    const lineageRows = [
        { node_id: 'parent-1', content: 'Parent content', node_type: 'seed', domain: 'science', weight: 1.2, created_at: '2024-01-01T00:00:00Z', distance: 1, connected_from: 'node-1', relation: 'ancestor' },
        { node_id: 'grandparent-1', content: 'Grandparent', node_type: 'seed', domain: 'science', weight: 0.8, created_at: '2023-01-01T00:00:00Z', distance: 2, connected_from: 'parent-1', relation: 'ancestor' },
        { node_id: 'child-1', content: 'Child content', node_type: 'synthesis', domain: 'science', weight: 0.9, created_at: '2024-06-01T00:00:00Z', distance: 1, connected_from: 'node-1', relation: 'descendant' },
    ];

    it('returns ancestors, descendants, parents, and children', async () => {
        mockQuery.mockResolvedValue(lineageRows);
        mockQueryOne.mockResolvedValue({
            id: 'node-1', content: 'Trigger', node_type: 'seed', domain: 'science',
            weight: 1.0, created_at: '2024-01-01T00:00:00Z', archived: 0,
        });

        const result = await handleLineage({ id: 'node-1', depth: 2 });

        expect(result.nodeId).toBe('node-1');
        expect(result.ancestors).toHaveLength(2);
        expect(result.descendants).toHaveLength(1);
        expect(result.parents).toHaveLength(1); // distance=1 ancestors
        expect(result.children).toHaveLength(1); // distance=1 descendants
        expect(result.parents[0].id).toBe('parent-1');
        expect(result.children[0].id).toBe('child-1');
    });

    it('returns full triggerNode shape', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue({
            id: 'node-1', content: 'My node', node_type: 'breakthrough', domain: 'tech',
            weight: 1.5, created_at: '2024-03-01T00:00:00Z', archived: 0,
        });

        const result = await handleLineage({ id: 'node-1' });

        expect(result.triggerNode).not.toBeNull();
        expect(result.triggerNode!.id).toBe('node-1');
        expect(result.triggerNode!.type).toBe('breakthrough');
        expect(result.triggerNode!.weight).toBe(1.5);
    });

    it('returns null triggerNode when not found', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        const result = await handleLineage({ id: 'missing-node' });

        expect(result.triggerNode).toBeNull();
    });

    it('clamps depth to minimum of 1', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        await handleLineage({ id: 'node-1', depth: -5 });

        const params = (mockQuery.mock.calls[0] as any[])[1];
        expect(params[1]).toBe(1); // clamped to 1
    });

    it('clamps depth to maximum of 10', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        await handleLineage({ id: 'node-1', depth: 99 });

        const params = (mockQuery.mock.calls[0] as any[])[1];
        expect(params[1]).toBe(10); // clamped to 10
    });

    it('passes nodeId as first lineage query param', async () => {
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        await handleLineage({ id: 'node-abc', depth: 3 });

        const params = (mockQuery.mock.calls[0] as any[])[1];
        expect(params[0]).toBe('node-abc');
    });

    it('maps lineage rows to clean node shape', async () => {
        mockQuery.mockResolvedValue([lineageRows[0]]); // one ancestor
        mockQueryOne.mockResolvedValue(null);

        const result = await handleLineage({ id: 'node-1' });

        expect(result.ancestors[0]).toEqual({
            id: 'parent-1',
            content: 'Parent content',
            type: 'seed',
            domain: 'science',
            weight: 1.2,
            createdAt: '2024-01-01T00:00:00Z',
            distance: 1,
            name: null,
            connectedFrom: 'node-1',
        });
    });
});

// =============================================================================
// handleRemove
// =============================================================================

describe('handleRemove', () => {
    const makeNodeExistRow = (overrides: Record<string, any> = {}) => ({
        id: 'node-1',
        content: 'Some content here to slice',
        domain: 'science',
        node_type: 'seed',
        weight: 1.0,
        archived: 0,
        junk: 0,
        ...overrides,
    });

    it('returns error when nodeId is not provided', async () => {
        const result = await handleRemove({});
        expect(result.error).toBe('nodeId is required');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleRemove({ nodeId: 'ghost-node' });

        expect(result.error).toContain('not found');
    });

    it('returns error when node is already archived (mode != hard)', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow({ archived: 1 }));

        const result = await handleRemove({ nodeId: 'node-1', mode: 'archive' });

        expect(result.error).toContain('already archived');
    });

    it('allows hard mode on already archived node', async () => {
        mockQueryOne
            .mockResolvedValueOnce(makeNodeExistRow({ archived: 1 })) // node exists check
            .mockResolvedValueOnce(null); // content_hash query (no hash)

        const result = await handleRemove({ nodeId: 'node-1', mode: 'hard' });

        expect(result.success).toBe(true);
        expect(result.action).toBe('hard');
    });

    it('junk mode: sets archived=1 and junk=1', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        await handleRemove({ nodeId: 'node-1', mode: 'junk' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('junk = 1')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[0]).toContain('archived = 1');
    });

    it('junk mode: calls logDecision with junk field', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        await handleRemove({ nodeId: 'node-1', mode: 'junk', reason: 'Off topic' });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'junk', 'false', 'true', 'human', 'mcp',
            expect.stringContaining('Off topic')
        );
    });

    it('archive mode: sets archived=1 only, does not set junk', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        await handleRemove({ nodeId: 'node-1', mode: 'archive' });

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('archived = 1') && !String(sql).includes('junk')
        );
        expect(updateCall).toBeDefined();
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'archived', 'false', 'true', 'human', 'mcp',
            expect.any(String)
        );
    });

    it('hard mode: deletes edges, decisions, evm_executions, and node', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        await handleRemove({ nodeId: 'node-1', mode: 'hard' });

        const sqls = (mockQuery.mock.calls as any[]).map(([sql]) => String(sql));
        expect(sqls.some(s => s.includes('DELETE FROM edges'))).toBe(true);
        expect(sqls.some(s => s.includes('DELETE FROM decisions'))).toBe(true);
        expect(sqls.some(s => s.includes('DELETE FROM nodes'))).toBe(true);
    });

    it('invalidates knowledge cache for node domain', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow({ domain: 'tech' }));

        await handleRemove({ nodeId: 'node-1', mode: 'archive' });

        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('tech');
    });

    it('returns success shape with node preview', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        const result = await handleRemove({ nodeId: 'node-1', mode: 'junk' });

        expect(result.success).toBe(true);
        expect(result.id).toBe('node-1');
        expect(result.action).toBe('junk');
        expect(result.node.domain).toBe('science');
        expect(result.hint).toContain('junk');
    });

    it('returns no hint for archive mode', async () => {
        mockQueryOne.mockResolvedValue(makeNodeExistRow());

        const result = await handleRemove({ nodeId: 'node-1', mode: 'archive' });

        expect(result.hint).toBeUndefined();
    });
});

// =============================================================================
// handleEdit
// =============================================================================

describe('handleEdit', () => {
    it('returns error when nodeId is not provided', async () => {
        const result = await handleEdit({ contributor: 'human', content: 'new text' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when contributor is not provided', async () => {
        const result = await handleEdit({ nodeId: 'node-1', content: 'new text' });
        expect(result.error).toContain('contributor is required');
    });

    it('returns error when neither content nor excluded is provided', async () => {
        const result = await handleEdit({ nodeId: 'node-1', contributor: 'human' });
        expect(result.error).toContain('At least one of');
    });

    it('updates content when provided', async () => {
        mockEditNodeContent.mockResolvedValue({ nodeId: 'node-1', updated: true });

        const result = await handleEdit({
            nodeId: 'node-1',
            contributor: 'human',
            content: 'Updated content',
            reason: 'Correction',
        });

        expect(mockEditNodeContent).toHaveBeenCalledWith('node-1', 'Updated content', 'human', 'Correction');
        expect(result.success).toBe(true);
        expect(result.content).toEqual({ nodeId: 'node-1', updated: true });
    });

    it('updates excluded flag when provided', async () => {
        mockSetExcludedFromBriefs.mockResolvedValue({ nodeId: 'node-1', excluded: false });

        const result = await handleEdit({
            nodeId: 'node-1',
            contributor: 'human',
            excluded: false,
        });

        expect(mockSetExcludedFromBriefs).toHaveBeenCalledWith('node-1', false, 'human', undefined);
        expect(result.success).toBe(true);
        expect(result.excluded).toEqual({ nodeId: 'node-1', excluded: false });
    });

    it('updates both content and excluded when both provided', async () => {
        const result = await handleEdit({
            nodeId: 'node-1',
            contributor: 'human',
            content: 'New content',
            excluded: true,
        });

        expect(mockEditNodeContent).toHaveBeenCalledTimes(1);
        expect(mockSetExcludedFromBriefs).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('returns error when editNodeContent throws', async () => {
        mockEditNodeContent.mockRejectedValue(new Error('DB write failed'));

        const result = await handleEdit({
            nodeId: 'node-1',
            contributor: 'human',
            content: 'New content',
        });

        expect(result.error).toContain('Content edit failed');
        expect(result.error).toContain('DB write failed');
    });

    it('returns error when setExcludedFromBriefs throws', async () => {
        mockSetExcludedFromBriefs.mockRejectedValue(new Error('Toggle failed'));

        const result = await handleEdit({
            nodeId: 'node-1',
            contributor: 'human',
            excluded: true,
        });

        expect(result.error).toContain('Exclusion toggle failed');
        expect(result.error).toContain('Toggle failed');
    });
});
