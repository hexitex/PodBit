/**
 * Tests for routes/partitions/exchange.ts — exportPartition, importPartition,
 * registerExchangeRoutes.
 *
 * Focuses on uncovered branches: empty domains export, number variables,
 * integrity verification, elite metadata, overwrite path, validation errors.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = jest.fn<(...args: any[]) => any>();
const mockQueryOne = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: jest.fn(),
    systemQueryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
    VERSION: '1.0.0-test',
    config: {},
}));

const mockInvalidateKnowledgeCache = jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

let exportPartition: typeof import('../../routes/partitions/exchange.js').exportPartition;
let importPartition: typeof import('../../routes/partitions/exchange.js').importPartition;

beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../../routes/partitions/exchange.js');
    exportPartition = mod.exportPartition;
    importPartition = mod.importPartition;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/partitions/exchange', () => {
    describe('exportPartition', () => {
        it('returns null when partition not found', async () => {
            mockQueryOne.mockResolvedValue(null);
            const result = await exportPartition('nope', 'rob');
            expect(result).toBeNull();
        });

        it('returns empty export for partition with no domains', async () => {
            mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P1', description: 'test' });
            mockQuery.mockResolvedValueOnce([]); // domains query
            const result = await exportPartition('p1', 'rob');
            expect(result).not.toBeNull();
            expect(result!.nodeCount).toBe(0);
            expect(result!.edgeCount).toBe(0);
            expect(result!.nodes).toEqual([]);
            expect(result!.partition.domains).toEqual([]);
            expect(result!.owner).toBe('rob');
        });

        it('exports partition with nodes and edges', async () => {
            mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P1', description: 'desc' });
            // domains
            mockQuery.mockResolvedValueOnce([{ domain: 'dom1' }]);
            // bridges
            mockQuery.mockResolvedValueOnce([{ partition_a: 'p1', partition_b: 'p2' }]);
            // nodes
            const fakeNodes = [
                { id: 'n1', content: 'hello', content_hash: 'abc123', node_type: 'seed' },
                { id: 'n2', content: 'world', content_hash: null, node_type: 'voiced' },
            ];
            mockQuery.mockResolvedValueOnce(fakeNodes);
            // edges
            mockQuery.mockResolvedValueOnce([{ source_id: 'n1', target_id: 'n2', edge_type: 'synthesis', strength: 1.0 }]);
            // number variable refs
            mockQuery.mockResolvedValueOnce([]); // no refs
            // elite nodes
            mockQuery.mockResolvedValueOnce([]); // no elite

            const result = await exportPartition('p1', 'rob');
            expect(result).not.toBeNull();
            expect(result!.nodeCount).toBe(2);
            expect(result!.edgeCount).toBe(1);
            expect(result!.bridges).toEqual([{ targetPartition: 'p2' }]);
        });

        it('handles bridge direction correctly', async () => {
            mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P1', description: null });
            mockQuery.mockResolvedValueOnce([{ domain: 'd1' }]); // domains
            // bridge where p1 is partition_b
            mockQuery.mockResolvedValueOnce([{ partition_a: 'other', partition_b: 'p1' }]);
            mockQuery.mockResolvedValueOnce([]); // nodes
            // no edges query because nodeIds.length === 0

            const result = await exportPartition('p1', 'owner');
            expect(result!.bridges).toEqual([{ targetPartition: 'other' }]);
        });

        it('includes number variables when refs exist', async () => {
            mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P1', description: null });
            mockQuery.mockResolvedValueOnce([{ domain: 'd1' }]); // domains
            mockQuery.mockResolvedValueOnce([]); // bridges
            mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'x', content_hash: 'h1', node_type: 'seed' }]); // nodes
            mockQuery.mockResolvedValueOnce([]); // edges
            // number variable refs
            mockQuery.mockResolvedValueOnce([{ node_id: 'n1', var_id: 'ABCD1' }]);
            // number registry
            mockQuery.mockResolvedValueOnce([{ var_id: 'ABCD1', value: '42', scope_text: 'ctx', source_node_id: 'n1', domain: 'd1', created_at: '2024-01-01' }]);
            // elite nodes
            mockQuery.mockResolvedValueOnce([]);

            const result = await exportPartition('p1', 'owner');
            expect(result!.numberVariables).toBeTruthy();
            expect(result!.numberVariables.registry.length).toBe(1);
            expect(result!.numberVariables.refs.length).toBe(1);
        });

        it('skips number variables gracefully on table error', async () => {
            mockQueryOne.mockResolvedValue({ id: 'p1', name: 'P1', description: null });
            mockQuery.mockResolvedValueOnce([{ domain: 'd1' }]); // domains
            mockQuery.mockResolvedValueOnce([]); // bridges
            mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'x', content_hash: null, node_type: 'seed' }]); // nodes
            mockQuery.mockResolvedValueOnce([]); // edges
            // number variable refs throws
            mockQuery.mockRejectedValueOnce(new Error('no such table'));
            // elite nodes
            mockQuery.mockResolvedValueOnce([]);

            const result = await exportPartition('p1', 'owner');
            // Should not have numberVariables key
            expect(result!.numberVariables).toBeUndefined();
        });
    });

    describe('importPartition', () => {
        it('throws VALIDATION error for missing fields', async () => {
            await expect(importPartition({})).rejects.toThrow('VALIDATION:');
            await expect(importPartition({ podbitExport: '1.0', owner: 'x' })).rejects.toThrow('VALIDATION:');
            await expect(importPartition({ podbitExport: '1.0', owner: 'x', partition: {} })).rejects.toThrow('VALIDATION:');
        });

        it('imports minimal partition with no nodes/edges', async () => {
            mockQueryOne.mockResolvedValue(null); // no collision
            mockQuery.mockResolvedValue([]); // all insert queries

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'test-p', name: 'Test', description: 'desc', domains: ['d1'] },
                nodes: [],
                edges: [],
                bridges: [],
            };

            const result = await importPartition(data);
            expect(result.success).toBe(true);
            expect(result.imported.partitionId).toBe('rob/test-p');
            expect(result.imported.nodes).toBe(0);
            expect(result.imported.edges).toBe(0);
            expect(result.imported.domains).toBe(1);
            expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d1');
        });

        it('throws CONFLICT when partition exists without overwrite', async () => {
            mockQueryOne.mockResolvedValue({ id: 'rob/test-p' }); // collision

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'test-p', name: 'Test', domains: ['d1'] },
            };

            await expect(importPartition(data, false)).rejects.toThrow('CONFLICT:');
        });

        it('overwrites existing partition when overwrite=true', async () => {
            // First queryOne: collision check — found
            mockQueryOne.mockResolvedValueOnce({ id: 'rob/test-p' });
            // Query for existing domains
            mockQuery.mockResolvedValueOnce([{ domain: 'old-d' }]);
            // All subsequent queries succeed (deletes, inserts)
            mockQuery.mockResolvedValue([]);
            // No more queryOne calls after collision
            mockQueryOne.mockResolvedValue(null);

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'test-p', name: 'Test', domains: ['new-d'] },
                nodes: [],
                edges: [],
                bridges: [],
            };

            const result = await importPartition(data, true);
            expect(result.success).toBe(true);
            expect(result.imported.partitionId).toBe('rob/test-p');
        });

        it('imports nodes and counts skipped on error', async () => {
            mockQueryOne.mockResolvedValue(null); // no collision
            mockQuery
                .mockResolvedValueOnce([]) // create partition
                .mockResolvedValueOnce([]) // add domain
                .mockResolvedValueOnce([]) // node 1 insert ok
                .mockRejectedValueOnce(new Error('UUID collision')) // node 2 fails
                .mockResolvedValue([]); // remaining queries

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [
                    { id: 'n1', content: 'a', node_type: 'seed', domain: 'd' },
                    { id: 'n2', content: 'b', node_type: 'seed', domain: 'd' },
                ],
                edges: [],
                bridges: [],
            };

            const result = await importPartition(data);
            expect(result.imported.nodes).toBe(1);
            expect(result.skipped.nodes).toBe(1);
        });

        it('imports edges and counts skipped on error', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [],
                edges: [
                    { source_id: 'n1', target_id: 'n2', edge_type: 'synthesis' },
                ],
                bridges: [],
            };

            const result = await importPartition(data);
            expect(result.imported.edges).toBe(1);
        });

        it('creates bridges only when target partition exists', async () => {
            mockQueryOne
                .mockResolvedValueOnce(null) // collision check
                .mockResolvedValueOnce({ id: 'rob/other-p' }) // bridge target exists
                .mockResolvedValueOnce(null); // second bridge target does not exist
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [],
                edges: [],
                bridges: [
                    { targetPartition: 'other-p' },
                    { targetPartition: 'missing-p' },
                ],
            };

            const result = await importPartition(data);
            expect(result.imported.bridges).toBe(1);
            expect(result.skipped.bridges).toContain('rob/missing-p');
        });

        it('imports number variables', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [],
                edges: [],
                bridges: [],
                numberVariables: {
                    registry: [
                        { var_id: 'X1', value: '10', scope_text: 'ctx', source_node_id: 'n1', domain: 'd', created_at: '2024-01-01' },
                    ],
                    refs: [
                        { node_id: 'n1', var_id: 'X1' },
                    ],
                },
            };

            const result = await importPartition(data);
            expect(result.imported.numberVariables).toBe(1);
        });

        it('imports integrity log entries', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.1',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [],
                edges: [],
                bridges: [],
                integrity: {
                    merkleRoot: null,
                    log: [
                        { nodeId: 'n1', operation: 'create', contentHashAfter: 'abc', logHash: 'lh1', timestamp: '2024-01-01' },
                    ],
                },
            };

            const result = await importPartition(data);
            expect(result.success).toBe(true);
        });

        it('imports elite metadata', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.1',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d'] },
                nodes: [],
                edges: [],
                bridges: [],
                eliteMetadata: {
                    eliteNodes: [
                        { node_id: 'n1', source_verification_id: 'v1', promoted_at: '2024-01-01', confidence: 0.9, verification_type: 'evm', provenance_chain: '{}' },
                    ],
                    manifestMappings: [
                        { id: 'm1', node_id: 'n1', manifest_target_type: 'feature', manifest_target_text: 'x', relevance_score: 0.8, mapped_at: '2024-01-01' },
                    ],
                    verifiedVariables: [
                        { id: 'vv1', var_id: 'X1', elite_node_id: 'n1', verification_confidence: 0.95, verified_value: '42', verified_at: '2024-01-01' },
                    ],
                    bridgingLog: [
                        { id: 'bl1', parent_a_id: 'n1', parent_b_id: 'n2', synthesis_node_id: 'n3', outcome: 'success', attempted_at: '2024-01-01' },
                    ],
                },
            };

            const result = await importPartition(data);
            expect(result.imported.eliteNodes).toBe(1);
        });

        it('invalidates knowledge cache for all imported domains', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockQuery.mockResolvedValue([]);

            const data = {
                podbitExport: '1.0',
                owner: 'rob',
                partition: { id: 'p', name: 'P', domains: ['d1', 'd2', 'd3'] },
                nodes: [],
                edges: [],
                bridges: [],
            };

            await importPartition(data);
            expect(mockInvalidateKnowledgeCache).toHaveBeenCalledTimes(3);
            expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d1');
            expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d2');
            expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('d3');
        });
    });
});
