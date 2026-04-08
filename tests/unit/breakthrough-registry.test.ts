/**
 * Unit tests for handlers/breakthrough-registry.ts —
 * queryRegistry, registryStats, updateBreakthroughScores, getDocumentation.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

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

// Mock fs so getCurrentProject() returns a predictable value
jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: jest.fn<() => boolean>().mockReturnValue(true),
        readFileSync: jest.fn<() => string>().mockReturnValue(JSON.stringify({ currentProject: 'test-project' })),
    },
    existsSync: jest.fn<() => boolean>().mockReturnValue(true),
    readFileSync: jest.fn<() => string>().mockReturnValue(JSON.stringify({ currentProject: 'test-project' })),
}));

// Mock dynamic imports used inside collectBreakthroughDocumentation
jest.unstable_mockModule('../../evm/feedback.js', () => ({
    getNodeVerifications: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getSubsystemAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    getConsultantAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    ensureAssignmentsLoaded: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const {
    queryRegistry, registryStats, updateBreakthroughScores, getDocumentation, rebuildDocumentation,
} = await import('../../handlers/breakthrough-registry.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
});

// =============================================================================
// queryRegistry
// =============================================================================

describe('queryRegistry', () => {
    it('returns breakthroughs with total and pagination', async () => {
        mockSystemQuery.mockResolvedValue([
            { id: 'bt-1', content: 'First breakthrough', domain: 'science', project_name: 'test-project', parent_contents: null },
            { id: 'bt-2', content: 'Second breakthrough', domain: 'tech', project_name: 'test-project', parent_contents: null },
        ]);
        mockSystemQueryOne.mockResolvedValue({ total: 42 });

        const result = await queryRegistry({ limit: 2, offset: 0 });

        expect(result.total).toBe(42);
        expect(result.limit).toBe(2);
        expect(result.offset).toBe(0);
        expect(result.breakthroughs).toHaveLength(2);
        expect(result.breakthroughs[0].id).toBe('bt-1');
    });

    it('parses parent_contents JSON when present', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'bt-1', content: 'Breakthrough', domain: 'science', project_name: 'test',
            parent_contents: '["Parent A","Parent B"]',
        }]);
        mockSystemQueryOne.mockResolvedValue({ total: 1 });

        const result = await queryRegistry({});

        expect(result.breakthroughs[0].parent_contents).toEqual(['Parent A', 'Parent B']);
    });

    it('sets parent_contents to null when field is null', async () => {
        mockSystemQuery.mockResolvedValue([{
            id: 'bt-1', content: 'Content', domain: 'science', project_name: 'test', parent_contents: null,
        }]);
        mockSystemQueryOne.mockResolvedValue({ total: 1 });

        const result = await queryRegistry({});

        expect(result.breakthroughs[0].parent_contents).toBeNull();
    });

    it('applies project filter when specified', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ project: 'my-project' });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(params).toContain('my-project');
        expect(String(sql)).toContain('project_name');
    });

    it('applies domain filter when specified', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ domain: 'biology' });

        const [sql, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(params).toContain('biology');
        expect(String(sql)).toContain('domain');
    });

    it('applies promotionSource filter when specified', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ promotionSource: 'autonomous' });

        const [, params] = mockSystemQuery.mock.calls[0] as any[];
        expect(params).toContain('autonomous');
    });

    it('uses safe orderBy — rejects arbitrary columns', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ orderBy: 'DROP TABLE--' });

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        // Should fall back to promoted_at
        expect(String(sql)).toContain('promoted_at');
        expect(String(sql)).not.toContain('DROP');
    });

    it('uses safe direction — defaults unknown to DESC', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ total: 0 });

        await queryRegistry({ direction: 'INJECT' });

        const [sql] = mockSystemQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('DESC');
        expect(String(sql)).not.toContain('INJECT');
    });

    it('returns 0 total when countRow is null', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await queryRegistry({});

        expect(result.total).toBe(0);
    });
});

// =============================================================================
// registryStats
// =============================================================================

describe('registryStats', () => {
    it('returns zero stats when registry is empty', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 0 })   // totalRow
            .mockResolvedValueOnce({ recent: 0 })   // recentRow
            .mockResolvedValueOnce({ avg_composite: null }); // avgRow
        mockSystemQuery
            .mockResolvedValueOnce([])  // byProject
            .mockResolvedValueOnce([])  // byDomain
            .mockResolvedValueOnce([])  // bySource
            .mockResolvedValueOnce([]); // timeline

        const result = await registryStats({});

        expect(result.total).toBe(0);
        expect(result.recent).toBe(0);
        expect(result.avgComposite).toBeNull();
        expect(result.byProject).toHaveLength(0);
        expect(result.byDomain).toHaveLength(0);
        expect(result.bySource).toEqual({});
        expect(result.timeline).toHaveLength(0);
    });

    it('returns populated stats with rounded avgComposite', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ total: 25 })
            .mockResolvedValueOnce({ recent: 5 })
            .mockResolvedValueOnce({ avg_composite: 0.7833 });
        mockSystemQuery
            .mockResolvedValueOnce([{ project_name: 'proj-1', count: 20, avg_composite: 0.78 }])
            .mockResolvedValueOnce([{ domain: 'science', count: 15, avg_composite: 0.80 }])
            .mockResolvedValueOnce([
                { promotion_source: 'manual', count: 10 },
                { promotion_source: 'autonomous', count: 15 },
            ])
            .mockResolvedValueOnce([{ date: '2024-01-01', count: 3 }]);

        const result = await registryStats({ days: 30 });

        expect(result.total).toBe(25);
        expect(result.recent).toBe(5);
        expect(result.recentDays).toBe(30);
        expect(result.avgComposite).toBe(0.8); // Math.round(0.7833 * 10) / 10
        expect(result.byProject[0].project).toBe('proj-1');
        expect(result.byDomain[0].domain).toBe('science');
        expect(result.bySource).toEqual({ manual: 10, autonomous: 15 });
        expect(result.timeline).toHaveLength(1);
    });

    it('applies project filter when specified', async () => {
        mockSystemQueryOne
            .mockResolvedValue({ total: 0, recent: 0, avg_composite: null });
        mockSystemQuery.mockResolvedValue([]);

        await registryStats({ project: 'specific-project' });

        // All systemQuery/systemQueryOne calls should contain 'specific-project' in params
        const firstCall = mockSystemQueryOne.mock.calls[0] as any[];
        expect(firstCall[1]).toContain('specific-project');
    });
});

// =============================================================================
// updateBreakthroughScores
// =============================================================================

describe('updateBreakthroughScores', () => {
    it('computes composite score and updates both registries', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'node-1' });

        const result = await updateBreakthroughScores('bt-1', {
            synthesis: 0.8,
            novelty: 0.9,
            testability: 0.7,
            tension_resolution: 0.85,
        });

        expect(result.success).toBe(true);
        // composite = (0.8*0.3 + 0.9*0.35 + 0.7*0.2 + 0.85*0.15) = 0.24+0.315+0.14+0.1275 = 0.8225 → round to 0.8
        expect(result.composite).toBeCloseTo(0.8, 0);
    });

    it('updates nodes table with computed scores', async () => {
        mockSystemQueryOne.mockResolvedValue({ node_id: 'node-abc' });

        await updateBreakthroughScores('bt-1', {
            synthesis: 0.7, novelty: 0.8, testability: 0.6, tension_resolution: 0.75,
        });

        const nodesUpdate = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE nodes')
        );
        expect(nodesUpdate).toBeDefined();
        expect(nodesUpdate[1]).toContain('node-abc');
    });

    it('returns error when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await updateBreakthroughScores('nonexistent', {
            synthesis: 0.5, novelty: 0.5, testability: 0.5, tension_resolution: 0.5,
        });

        expect(result.error).toContain('not found');
    });
});

// =============================================================================
// getDocumentation
// =============================================================================

describe('getDocumentation', () => {
    it('returns null when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await getDocumentation('bt-missing');

        expect(result).toBeNull();
    });

    it('returns null when documentation field is null', async () => {
        mockSystemQueryOne.mockResolvedValue({ documentation: null });

        const result = await getDocumentation('bt-1');

        expect(result).toBeNull();
    });

    it('parses and returns documentation JSON', async () => {
        const doc = { version: 1, node: { id: 'n1', content: 'Breakthrough content' } };
        mockSystemQueryOne.mockResolvedValue({ documentation: JSON.stringify(doc) });

        const result = await getDocumentation('bt-1');

        expect(result).toEqual(doc);
    });

    it('returns null when documentation is invalid JSON', async () => {
        mockSystemQueryOne.mockResolvedValue({ documentation: 'not-valid-json{' });

        const result = await getDocumentation('bt-1');

        expect(result).toBeNull();
    });
});

// =============================================================================
// rebuildDocumentation
// =============================================================================

describe('rebuildDocumentation', () => {
    it('returns error when breakthrough not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);

        const result = await rebuildDocumentation('bt-missing');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('succeeds when breakthrough found and documentation stored', async () => {
        // First systemQueryOne: breakthrough record
        mockSystemQueryOne.mockResolvedValueOnce({
            id: 'bt-1', node_id: 'node-1',
            promoted_by: 'human', promotion_source: 'manual',
            validation_reason: 'Strong insight', validation_synthesis: 0.9,
            validation_novelty: 0.85, validation_testability: 0.8,
            validation_tension_resolution: 0.88, validation_composite: 0.87,
        });
        // All subsequent DB calls (from collectBreakthroughDocumentation) return null/empty
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);
        mockSystemQuery.mockResolvedValue([]);

        const result = await rebuildDocumentation('bt-1');

        expect(result.success).toBe(true);
        // systemQuery should have been called to update the documentation
        const updateCall = (mockSystemQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE breakthrough_registry') && String(sql).includes('documentation')
        );
        expect(updateCall).toBeDefined();
    });
});
