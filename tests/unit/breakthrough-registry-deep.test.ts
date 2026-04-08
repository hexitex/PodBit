/**
 * Deep unit tests for handlers/breakthrough-registry.ts —
 * Covers uncovered branches: getCurrentProject edge cases,
 * collectBreakthroughDocumentation sections (lineage dedup, partition context,
 * error branches, model snapshot), registerBreakthrough documentation failure,
 * queryRegistry combined filters + ASC direction, registryStats null guards,
 * updateBreakthroughScores default scores, rebuildDocumentation error path.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

// Mock fs — default returns valid project JSON, individual tests override
const mockExistsSync = jest.fn<() => boolean>().mockReturnValue(true);
const mockReadFileSync = jest.fn<() => string>().mockReturnValue(
    JSON.stringify({ currentProject: 'test-project' })
);

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

// Mock dynamic imports used in collectBreakthroughDocumentation
const mockGetNodeVerifications = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../../evm/feedback.js', () => ({
    getNodeVerifications: mockGetNodeVerifications,
}));

const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockGetConsultantAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
jest.unstable_mockModule('../../models/assignments.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
    getConsultantAssignments: mockGetConsultantAssignments,
}));

const {
    registerBreakthrough, queryRegistry, registryStats,
    updateBreakthroughScores, getDocumentation, rebuildDocumentation,
} = await import('../../handlers/breakthrough-registry.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ currentProject: 'test-project' }));
    mockGetNodeVerifications.mockResolvedValue([]);
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockGetConsultantAssignments.mockResolvedValue({});
});

// =============================================================================
// getCurrentProject — edge cases (tested via registerBreakthrough)
// =============================================================================

describe('getCurrentProject edge cases via registerBreakthrough', () => {
    const minimalEntry = {
        nodeId: 'n1',
        content: 'test content',
        promotionSource: 'manual' as const,
    };

    it('returns "default" when projects.json does not exist', async () => {
        mockExistsSync.mockReturnValue(false);
        // existing check — no entry found
        mockSystemQueryOne.mockResolvedValueOnce(null);
        // INSERT RETURNING id
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-1' });

        const result = await registerBreakthrough(minimalEntry);
        expect(result.id).toBe('reg-1');

        // The existing check should have used 'default' as project name
        const [, params] = mockSystemQueryOne.mock.calls[0] as any[];
        expect(params[1]).toBe('default');
    });

    it('returns "default" when currentProject is falsy in JSON', async () => {
        mockReadFileSync.mockReturnValue(JSON.stringify({ currentProject: '' }));
        mockSystemQueryOne.mockResolvedValueOnce(null);
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-2' });

        await registerBreakthrough(minimalEntry);

        const [, params] = mockSystemQueryOne.mock.calls[0] as any[];
        expect(params[1]).toBe('default');
    });

    it('returns "default" when readFileSync throws', async () => {
        mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
        mockSystemQueryOne.mockResolvedValueOnce(null);
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-3' });

        await registerBreakthrough(minimalEntry);

        const [, params] = mockSystemQueryOne.mock.calls[0] as any[];
        expect(params[1]).toBe('default');
    });
});

// =============================================================================
// registerBreakthrough — documentation collection failure (catch branch)
// =============================================================================

describe('registerBreakthrough documentation failure', () => {
    it('succeeds even when documentation storage throws', async () => {
        const entry = {
            nodeId: 'n-fail',
            content: 'breakthrough content',
            domain: 'science',
            promotionSource: 'autonomous' as const,
            parentContents: ['parent A', 'parent B'],
        };

        // getPartitionForDomain('science') → queryOne → null
        mockQueryOne.mockResolvedValueOnce(null);
        // existing check → not found
        mockSystemQueryOne.mockResolvedValueOnce(null);
        // INSERT RETURNING id
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-doc-fail' });

        // collectBreakthroughDocumentation runs fine (sections individually catch)
        // but the systemQuery UPDATE for documentation storage throws
        mockSystemQuery.mockRejectedValue(new Error('Documentation storage failed'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await registerBreakthrough(entry);

        expect(result.id).toBe('reg-doc-fail');
        expect(result.deduplicated).toBe(false);
        // The error should have been logged as non-fatal
        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Documentation collection failed')
        );

        consoleSpy.mockRestore();
    });

    it('passes parentContents as JSON string in INSERT', async () => {
        const entry = {
            nodeId: 'n-pc',
            content: 'content',
            promotionSource: 'manual' as const,
            parentContents: ['pc-1', 'pc-2'],
        };

        mockQueryOne.mockResolvedValue(null);
        mockSystemQueryOne.mockResolvedValueOnce(null);
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-pc' });

        await registerBreakthrough(entry);

        // The INSERT call is the second systemQueryOne call
        const [, params] = mockSystemQueryOne.mock.calls[1] as any[];
        expect(params).toContain(JSON.stringify(['pc-1', 'pc-2']));
    });

    it('passes null parentContents when not provided', async () => {
        const entry = {
            nodeId: 'n-no-pc',
            content: 'content',
            promotionSource: 'manual' as const,
        };

        mockQueryOne.mockResolvedValue(null);
        mockSystemQueryOne.mockResolvedValueOnce(null);
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-no-pc' });

        await registerBreakthrough(entry);

        const [, params] = mockSystemQueryOne.mock.calls[1] as any[];
        // Last param should be null (parentContents)
        expect(params[params.length - 1]).toBeNull();
    });
});

// =============================================================================
// registerBreakthrough — UPDATE path with scores and generativityBoosts
// =============================================================================

describe('registerBreakthrough update path', () => {
    it('passes scores fields and validationReason to UPDATE', async () => {
        const entry = {
            nodeId: 'n-upd',
            content: 'updated content',
            domain: 'physics',
            trajectory: 'abstraction',
            promotionSource: 'autonomous' as const,
            promotedBy: 'cycle',
            scores: { synthesis: 8, novelty: 7, testability: 6, tension_resolution: 5, composite: 6.8 },
            validationReason: 'High novelty',
            parentContents: ['parent-1'],
            generativityBoosts: [{ id: 'child-1', boost: 0.1, generation: 2 }],
        };

        // 1. getPartitionForDomain('physics') → queryOne → returns partition
        mockQueryOne.mockResolvedValueOnce({ id: 'part-phys', name: 'Physics' });
        // 2. systemQueryOne: existing check → found
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'existing-reg' });
        // 3. systemQuery: UPDATE (non-returning)
        mockSystemQuery.mockResolvedValueOnce([]);
        // 4. collectBreakthroughDocumentation runs — default mockResolvedValue(null) / [] handles it
        // The documentation UPDATE also needs systemQuery
        mockSystemQuery.mockResolvedValue([]);

        const result = await registerBreakthrough(entry);

        expect(result.id).toBe('existing-reg');
        expect(result.deduplicated).toBe(true);

        // The first systemQuery call is the UPDATE — check its params
        const updateCall = mockSystemQuery.mock.calls[0] as any[];
        expect(updateCall[1]).toContain(8);  // synthesis
        expect(updateCall[1]).toContain(7);  // novelty
        expect(updateCall[1]).toContain('High novelty'); // validationReason
    });

    it('handles entry with no scores gracefully', async () => {
        const entry = {
            nodeId: 'n-no-scores',
            content: 'content',
            promotionSource: 'manual' as const,
            // no domain, no scores
        };

        // No domain → getPartitionForDomain returns null (skipped, domain is undefined)
        // 1. systemQueryOne: existing check → found
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'existing-2' });
        // 2. systemQuery: UPDATE
        mockSystemQuery.mockResolvedValue([]);

        const result = await registerBreakthrough(entry);

        expect(result.id).toBe('existing-2');
        // scores fields should be null in the UPDATE params
        const updateCall = mockSystemQuery.mock.calls[0] as any[];
        const params = updateCall[1];
        // synthesis, novelty, testability, tension_resolution should be null
        expect(params[5]).toBeNull(); // synthesis ?? null
        expect(params[6]).toBeNull(); // novelty ?? null
    });
});

// =============================================================================
// collectBreakthroughDocumentation — lineage with grandparent dedup
// =============================================================================

describe('collectBreakthroughDocumentation via rebuildDocumentation', () => {
    // We test collectBreakthroughDocumentation indirectly through rebuildDocumentation

    it('deduplicates grandparents across multiple parents', async () => {
        // Breakthrough record
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-1', node_id: 'n1', promoted_by: 'user',
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Node query (section 1)
        mockQueryOne.mockResolvedValueOnce({
            id: 'n1', content: 'breakthrough', node_type: 'breakthrough',
            domain: 'science', weight: 1, salience: 0.5, specificity: 0.6,
            origin: 'synthesis', contributor: 'auto', lifecycle_state: 'active',
            generation: 3, total_children: 0, content_hash: 'hash1',
            created_at: '2025-01-01', updated_at: '2025-01-01', metadata: null,
            trajectory: 'knowledge',
        });

        // Parents query (section 2 - first query)
        const parentA = { id: 'pA', content: 'parent A', node_type: 'seed', domain: 'science', weight: 1, contributor: 'user', edge_type: 'parent', strength: 1 };
        const parentB = { id: 'pB', content: 'parent B', node_type: 'seed', domain: 'physics', weight: 1, contributor: 'user', edge_type: 'parent', strength: 1 };
        mockQuery.mockResolvedValueOnce([parentA, parentB]);

        // Grandparent queries — shared grandparent gp1 appears for both parents
        const gp1 = { id: 'gp1', content: 'grandparent shared', node_type: 'seed', domain: 'science' };
        const gp2 = { id: 'gp2', content: 'grandparent unique', node_type: 'seed', domain: 'physics' };
        mockQuery.mockResolvedValueOnce([gp1]); // grandparents of parentA
        mockQuery.mockResolvedValueOnce([gp1, gp2]); // grandparents of parentB — gp1 should be deduped

        // Children query
        mockQuery.mockResolvedValueOnce([]);

        // EVM verification — node query for status
        mockQueryOne.mockResolvedValueOnce({ verification_status: 'verified', verification_score: 0.95 });

        // Feedback
        mockQuery.mockResolvedValueOnce([]);
        // Decisions
        mockQuery.mockResolvedValueOnce([]);
        // Integrity
        mockQuery.mockResolvedValueOnce([]);

        // Number refs
        mockQuery.mockResolvedValueOnce([]);

        // Partition context — node domain already in doc.node, skip fallback queryOne
        // getPartitionForDomain returns a partition
        mockQueryOne.mockResolvedValueOnce({ id: 'part-sci', name: 'Science' });
        // partition_domains
        mockQuery.mockResolvedValueOnce([{ domain: 'science' }, { domain: 'physics' }]);
        // partition_bridges
        mockQuery.mockResolvedValueOnce([{ bridged_to: 'part-other' }]);
        // partition description
        mockQueryOne.mockResolvedValueOnce({ description: 'The science partition' });

        // UPDATE documentation
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-1');
        expect(result.success).toBe(true);

        // Verify the documentation was stored
        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE breakthrough_registry') && String(sql).includes('documentation')
        );
        expect(updateCall).toBeDefined();

        // Parse the stored documentation to check grandparent dedup
        const storedDoc = JSON.parse(updateCall[1][0]);
        // gp1 should appear only once despite being returned for both parents
        const gpIds = storedDoc.lineage.grandparents.map((g: any) => g.id);
        const uniqueGpIds = [...new Set(gpIds)];
        expect(gpIds.length).toBe(uniqueGpIds.length); // no duplicates
        expect(gpIds).toContain('gp1');
        expect(gpIds).toContain('gp2');
    });

    it('captures verification data with attempts', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-2', node_id: 'n2', promoted_by: null,
            promotion_source: 'autonomous', validation_reason: null,
            validation_synthesis: 7, validation_novelty: 8,
            validation_testability: 6, validation_tension_resolution: 5,
            validation_composite: 6.8,
        });

        // Node
        mockQueryOne.mockResolvedValueOnce({
            id: 'n2', content: 'content', node_type: 'breakthrough',
            domain: null, weight: 1, salience: 0.5,
        });

        // Parents, grandparents — empty
        mockQuery.mockResolvedValueOnce([]); // parents
        mockQuery.mockResolvedValueOnce([]); // children

        // EVM verification — getNodeVerifications returns attempts
        mockGetNodeVerifications.mockResolvedValueOnce([
            { id: 'v1', status: 'pass', score: 0.9 },
        ]);
        // Node verification_status query
        mockQueryOne.mockResolvedValueOnce({ verification_status: 'pass', verification_score: 0.9 });

        // Remaining sections return empty
        mockQuery.mockResolvedValue([]); // feedback, decisions, integrity, number refs

        // Model snapshot
        mockGetSubsystemAssignments.mockResolvedValueOnce({
            voice: { id: 'm1', name: 'GPT-4', provider: 'openai', modelId: 'gpt-4', endpointUrl: null, maxTokens: 4096, contextSize: 128000, noThink: false, thinkingLevel: null },
        });
        mockGetConsultantAssignments.mockResolvedValueOnce({
            voice: { id: 'm2', name: 'Claude' },
        });

        // Partition — no domain so null
        // UPDATE documentation
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-2');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        const doc = JSON.parse(updateCall[1][0]);
        expect(doc.verification.status).toBe('pass');
        expect(doc.verification.score).toBe(0.9);
        expect(doc.verification.attempts).toHaveLength(1);
    });

    it('handles section errors independently without failing overall', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-err', node_id: 'n-err', promoted_by: null,
            promotion_source: 'autonomous', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Node query throws
        mockQueryOne.mockRejectedValueOnce(new Error('Node lookup failed'));

        // Parents query throws
        mockQuery.mockRejectedValueOnce(new Error('Lineage query failed'));

        // EVM feedback import throws
        mockGetNodeVerifications.mockRejectedValueOnce(new Error('EVM unavailable'));
        // Node verification query
        mockQueryOne.mockRejectedValueOnce(new Error('still broken'));

        // Feedback throws
        mockQuery.mockRejectedValueOnce(new Error('Feedback query failed'));

        // Decisions throws
        mockQuery.mockRejectedValueOnce(new Error('Decisions failed'));

        // Integrity throws
        mockQuery.mockRejectedValueOnce(new Error('Integrity failed'));

        // Model snapshot throws
        mockGetSubsystemAssignments.mockRejectedValueOnce(new Error('Models unavailable'));

        // Number refs throws
        mockQuery.mockRejectedValueOnce(new Error('Number refs failed'));

        // Partition context — no node domain available (doc.node has error), fallback queryOne also fails
        mockQueryOne.mockRejectedValueOnce(new Error('Partition lookup failed'));

        // UPDATE documentation
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-err');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        const doc = JSON.parse(updateCall[1][0]);
        // Each section should have captured its error
        expect(doc.node.error).toBeDefined();
        expect(doc.lineage.error).toBeDefined();
    });

    it('sets partition to null when node has no domain', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-no-domain', node_id: 'n-nd', promoted_by: null,
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Node with no domain
        mockQueryOne.mockResolvedValueOnce({
            id: 'n-nd', content: 'no domain node', node_type: 'breakthrough',
            domain: null, weight: 1,
        });

        // Parents
        mockQuery.mockResolvedValueOnce([]);
        // Children
        mockQuery.mockResolvedValueOnce([]);

        // EVM
        mockQueryOne.mockResolvedValueOnce(null);
        // Feedback, decisions, integrity, number refs
        mockQuery.mockResolvedValue([]);

        // Partition context — nodeDomain is null, fallback query also returns null domain
        mockQueryOne.mockResolvedValueOnce({ domain: null });

        // UPDATE documentation
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-no-domain');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        const doc = JSON.parse(updateCall[1][0]);
        expect(doc.partition).toBeNull();
    });

    it('sets partition to null when getPartitionForDomain returns null', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-np', node_id: 'n-np', promoted_by: null,
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Node with domain but no partition
        mockQueryOne.mockResolvedValueOnce({
            id: 'n-np', content: 'content', node_type: 'breakthrough',
            domain: 'orphan-domain', weight: 1,
        });

        // Parents, children
        mockQuery.mockResolvedValueOnce([]);
        mockQuery.mockResolvedValueOnce([]);

        // EVM
        mockQueryOne.mockResolvedValueOnce(null);

        // Feedback, decisions, integrity, number refs
        mockQuery.mockResolvedValue([]);

        // getPartitionForDomain → no partition found
        mockQueryOne.mockResolvedValueOnce(null);

        // UPDATE
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-np');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        const doc = JSON.parse(updateCall[1][0]);
        expect(doc.partition).toBeNull();
    });

    it('falls back to querying domain from DB when doc.node is missing', async () => {
        // rebuildDocumentation: systemQueryOne to get breakthrough record
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-fb', node_id: 'n-fb', promoted_by: null,
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Use SQL-matching implementation for queryOne to avoid ordering issues
        mockQueryOne.mockImplementation((sql: string) => {
            const s = String(sql);
            if (s.includes('SELECT * FROM nodes')) return Promise.resolve(null); // S1: node not found
            if (s.includes('verification_status')) return Promise.resolve(null); // S3: verification
            if (s.includes('SELECT domain FROM nodes')) return Promise.resolve({ domain: 'fallback-domain' }); // S9: fallback
            if (s.includes('domain_partitions')) {
                if (s.includes('description')) return Promise.resolve({ description: 'Desc' }); // S9: description
                return Promise.resolve({ id: 'part-fb', name: 'Fallback' }); // S9: getPartitionForDomain
            }
            return Promise.resolve(null);
        });

        // Use SQL-matching implementation for query
        mockQuery.mockImplementation((sql: string) => {
            const s = String(sql);
            if (s.includes('partition_domains')) return Promise.resolve([{ domain: 'fallback-domain' }]);
            if (s.includes('partition_bridges')) return Promise.resolve([]);
            return Promise.resolve([]);
        });

        // systemQuery: UPDATE documentation
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-fb');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        expect(updateCall).toBeDefined();
        const doc = JSON.parse(updateCall[1][0]);
        expect(doc.partition.id).toBe('part-fb');
        expect(doc.partition.name).toBe('Fallback');
    });
});

// =============================================================================
// rebuildDocumentation — error path in collectBreakthroughDocumentation
// =============================================================================

describe('rebuildDocumentation error path', () => {
    it('returns error when collectBreakthroughDocumentation throws fatally', async () => {
        // Breakthrough found
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-fatal', node_id: 'n-fatal', promoted_by: null,
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Make the UPDATE for documentation storage fail
        // All the section queries succeed/return empty, but the final systemQuery UPDATE throws
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);
        mockSystemQuery.mockRejectedValue(new Error('System DB write failed'));

        const result = await rebuildDocumentation('bt-fatal');

        expect(result.success).toBe(false);
        expect(result.error).toContain('System DB write failed');
    });
});

// =============================================================================
// queryRegistry — combined filters and ASC direction
// =============================================================================

describe('queryRegistry additional branches', () => {
    it('combines all three filters (project + domain + promotionSource)', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({
            project: 'proj-1',
            domain: 'science',
            promotionSource: 'manual',
        });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('project_name');
        expect(String(sql)).toContain('domain');
        expect(String(sql)).toContain('promotion_source');
        expect(params).toContain('proj-1');
        expect(params).toContain('science');
        expect(params).toContain('manual');
    });

    it('uses ASC direction when specified', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ direction: 'ASC' });

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('ASC');
    });

    it('accepts whitelisted orderBy columns', async () => {
        const allowed = ['promoted_at', 'validation_composite', 'domain', 'project_name', 'created_at'];

        for (const col of allowed) {
            jest.clearAllMocks();
            mockSystemQuery.mockResolvedValue([]);
            mockSystemQueryOne.mockResolvedValue({ total: 0 });

            await queryRegistry({ orderBy: col });

            const [sql] = mockSystemQuery.mock.calls[0] as any[];
            expect(String(sql)).toContain(col);
        }
    });

    it('uses custom limit and offset', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 100 });

        const result = await queryRegistry({ limit: 10, offset: 20 });

        expect(result.limit).toBe(10);
        expect(result.offset).toBe(20);
        const [, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(params).toContain(10);
        expect(params).toContain(20);
    });
});

// =============================================================================
// registryStats — null guards and edge cases
// =============================================================================

describe('registryStats additional branches', () => {
    it('returns 0 when totalRow is null', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce(null) // totalRow
            .mockResolvedValueOnce(null) // recentRow
            .mockResolvedValueOnce(null); // avgRow
        mockSystemQuery.mockResolvedValue([]);

        const result = await registryStats({});

        expect(result.total).toBe(0);
        expect(result.recent).toBe(0);
        expect(result.avgComposite).toBeNull();
    });

    it('uses default days=30 when not specified', async () => {
        mockSystemQueryOne.mockResolvedValue({ total: 0, recent: 0, avg_composite: null });
        mockSystemQuery.mockResolvedValue([]);

        const result = await registryStats({});

        expect(result.recentDays).toBe(30);
    });

    it('handles byProject with null avg_composite', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 1 })
            .mockResolvedValueOnce({ recent: 1 })
            .mockResolvedValueOnce({ avg_composite: null });
        mockSystemQuery
            .mockResolvedValueOnce([{ project_name: 'proj-1', count: 1, avg_composite: null }])
            .mockResolvedValueOnce([{ domain: 'science', count: 1, avg_composite: null }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await registryStats({});

        expect(result.byProject[0].avgComposite).toBeNull();
        expect(result.byDomain[0].avgComposite).toBeNull();
    });

    it('uses custom days value', async () => {
        mockSystemQueryOne.mockResolvedValue({ total: 0, recent: 0, avg_composite: null });
        mockSystemQuery.mockResolvedValue([]);

        const result = await registryStats({ days: 7 });

        expect(result.recentDays).toBe(7);
        // The days param should appear in the query params for recent count
        const recentCall = mockSystemQueryOne.mock.calls[1] as any[];
        expect(recentCall[1]).toContain(7);
    });

    it('builds bySource as object from promotion_source rows', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 10 })
            .mockResolvedValueOnce({ recent: 3 })
            .mockResolvedValueOnce({ avg_composite: 7.0 });
        mockSystemQuery
            .mockResolvedValueOnce([]) // byProject
            .mockResolvedValueOnce([]) // byDomain
            .mockResolvedValueOnce([
                { promotion_source: 'manual', count: 4 },
                { promotion_source: 'autonomous', count: 6 },
            ])
            .mockResolvedValueOnce([]); // timeline

        const result = await registryStats({});

        expect(result.bySource).toEqual({ manual: 4, autonomous: 6 });
    });
});

// =============================================================================
// updateBreakthroughScores — default destructured values
// =============================================================================

describe('updateBreakthroughScores edge cases', () => {
    it('uses 0 for missing score fields via destructuring defaults', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'n-def' });

        // Pass object with no explicit values — destructuring defaults to 0
        const result = await updateBreakthroughScores('bt-def', {} as any);

        expect(result.success).toBe(true);
        // composite = (0*0.3 + 0*0.35 + 0*0.2 + 0*0.15) = 0
        expect(result.composite).toBe(0);
    });

    it('computes composite with partial scores', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'n-partial' });

        const result = await updateBreakthroughScores('bt-partial', {
            synthesis: 10,
            novelty: 0,
            testability: 0,
            tension_resolution: 0,
        });

        expect(result.success).toBe(true);
        // composite = (10*0.3 + 0*0.35 + 0*0.2 + 0*0.15) = 3.0
        expect(result.composite).toBe(3);
    });
});

// =============================================================================
// Model snapshot in collectBreakthroughDocumentation
// =============================================================================

describe('collectBreakthroughDocumentation model snapshot', () => {
    it('captures model assignments with consultant info', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-model', node_id: 'n-model', promoted_by: null,
            promotion_source: 'manual', validation_reason: null,
            validation_synthesis: null, validation_novelty: null,
            validation_testability: null, validation_tension_resolution: null,
            validation_composite: null,
        });

        // Node
        mockQueryOne.mockResolvedValueOnce({ id: 'n-model', content: 'content', domain: null });

        // Parents, children
        mockQuery.mockResolvedValueOnce([]);
        mockQuery.mockResolvedValueOnce([]);

        // EVM
        mockQueryOne.mockResolvedValueOnce(null);

        // Feedback, decisions, integrity, number refs
        mockQuery.mockResolvedValue([]);

        // Model snapshot
        mockGetSubsystemAssignments.mockResolvedValueOnce({
            voice: {
                id: 'model-1', name: 'GPT-4o', provider: 'openai',
                modelId: 'gpt-4o', endpointUrl: 'https://api.openai.com',
                maxTokens: 4096, contextSize: 128000,
                noThink: false, thinkingLevel: 'medium',
            },
            synthesis: null,
        });
        mockGetConsultantAssignments.mockResolvedValueOnce({
            voice: { id: 'con-1', name: 'Claude-3' },
            synthesis: null,
        });

        // Partition — no domain
        mockQueryOne.mockResolvedValueOnce({ domain: null });

        // UPDATE
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-model');
        expect(result.success).toBe(true);

        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('documentation')
        );
        const doc = JSON.parse(updateCall[1][0]);
        expect(doc.modelSnapshot.assignments.voice.modelName).toBe('GPT-4o');
        expect(doc.modelSnapshot.assignments.voice.consultantModelName).toBe('Claude-3');
        expect(doc.modelSnapshot.assignments.synthesis).toBeNull();
    });
});

// =============================================================================
// getPartitionForDomain — empty domain string
// =============================================================================

describe('getPartitionForDomain via registerBreakthrough', () => {
    it('skips partition lookup when domain is empty string', async () => {
        const entry = {
            nodeId: 'n-empty-domain',
            content: 'content',
            domain: '',
            promotionSource: 'manual' as const,
        };

        // existing check
        mockSystemQueryOne.mockResolvedValueOnce(null);
        // INSERT
        mockSystemQueryOne.mockResolvedValueOnce({ id: 'reg-ed' });
        mockQuery.mockResolvedValue([]);
        mockQueryOne.mockResolvedValue(null);

        const result = await registerBreakthrough(entry);
        expect(result.id).toBe('reg-ed');

        // The INSERT params should have null for partition_id and partition_name
        const [, params] = mockSystemQueryOne.mock.calls[1] as any[];
        expect(params[2]).toBeNull(); // partition_id
        expect(params[3]).toBeNull(); // partition_name
    });
});
