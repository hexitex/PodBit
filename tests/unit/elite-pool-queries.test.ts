/**
 * Unit tests for core/elite-pool-queries.ts — getEliteNodes, getElitePoolStats.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetManifestCoverage = jest.fn<() => Promise<any>>().mockResolvedValue(null);

const mockAppConfig = {
    elitePool: { maxGeneration: 5 },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../core/elite-pool-manifest.js', () => ({
    getManifestCoverage: mockGetManifestCoverage,
}));

const { getEliteNodes, getElitePoolStats } = await import('../../core/elite-pool-queries.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockGetManifestCoverage.mockResolvedValue(null);
    mockAppConfig.elitePool.maxGeneration = 5;
});

// =============================================================================
// getEliteNodes
// =============================================================================

describe('getEliteNodes', () => {
    it('returns empty array when no elite nodes', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getEliteNodes();
        expect(result).toHaveLength(0);
    });

    it('returns elite nodes from query', async () => {
        const rows = [
            { id: 'elite-1', content: 'Finding A', domain: 'science', generation: 2 },
            { id: 'elite-2', content: 'Finding B', domain: 'math', generation: 3 },
        ];
        mockQuery.mockResolvedValue(rows);

        const result = await getEliteNodes();
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('elite-1');
    });

    it('applies domain filter to SQL', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes({ domain: 'biology' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('domain');
        expect(params).toContain('biology');
    });

    it('applies minGeneration filter to SQL', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes({ minGeneration: 2 });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('generation >=');
        expect(params).toContain(2);
    });

    it('applies maxGeneration filter to SQL', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes({ maxGeneration: 4 });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('generation <=');
        expect(params).toContain(4);
    });

    it('applies manifestTargetType filter with EXISTS subquery', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes({ manifestTargetType: 'hypothesis' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('elite_manifest_mappings');
        expect(params).toContain('hypothesis');
    });

    it('uses default limit=50 and offset=0', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes();

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(50);
        expect(params).toContain(0);
    });

    it('uses provided limit and offset', async () => {
        mockQuery.mockResolvedValue([]);
        await getEliteNodes({ limit: 10, offset: 20 });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(10);
        expect(params).toContain(20);
    });
});

// =============================================================================
// getElitePoolStats
// =============================================================================

describe('getElitePoolStats', () => {
    it('returns zero stats when no elite nodes', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const stats = await getElitePoolStats();

        expect(stats.totalEliteNodes).toBe(0);
        expect(stats.generationDistribution).toEqual({});
        expect(stats.domainDistribution).toEqual({});
        expect(stats.bridgingAttempts.total).toBe(0);
        expect(stats.recentPromotions).toBe(0);
        expect(stats.terminalFindings).toBe(0);
    });

    it('returns populated stats from query results', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ count: 15 })  // total elite nodes
            .mockResolvedValueOnce({ total: 20, promoted: 12, rejected: 5, duplicate: 3 })  // bridging log
            .mockResolvedValueOnce({ count: 3 })   // recent promotions
            .mockResolvedValueOnce({ count: 2 });  // terminal findings

        mockQuery
            .mockResolvedValueOnce([  // generation distribution
                { generation: 1, count: 8 },
                { generation: 2, count: 5 },
                { generation: 3, count: 2 },
            ])
            .mockResolvedValueOnce([  // domain distribution
                { domain: 'science', count: 10 },
                { domain: 'math', count: 5 },
            ]);

        const stats = await getElitePoolStats();

        expect(stats.totalEliteNodes).toBe(15);
        expect(stats.generationDistribution[1]).toBe(8);
        expect(stats.generationDistribution[2]).toBe(5);
        expect(stats.domainDistribution['science']).toBe(10);
        expect(stats.bridgingAttempts.total).toBe(20);
        expect(stats.bridgingAttempts.promoted).toBe(12);
        expect(stats.bridgingAttempts.rejected).toBe(5);
        expect(stats.bridgingAttempts.duplicate).toBe(3);
        expect(stats.recentPromotions).toBe(3);
        expect(stats.terminalFindings).toBe(2);
    });

    it('uses maxGeneration from config for terminal findings query', async () => {
        mockAppConfig.elitePool.maxGeneration = 7;
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await getElitePoolStats();

        // The terminal findings query should use maxGeneration=7
        const terminalCall = (mockQueryOne.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('generation >=')
        );
        expect(terminalCall).toBeDefined();
        expect(terminalCall[1]).toContain(7);
    });

    it('includes manifestCoverage when available', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);
        const coverage = { totalTargets: 5, covered: 3, uncovered: 2 };
        mockGetManifestCoverage.mockResolvedValue(coverage);

        const stats = await getElitePoolStats();

        expect(stats.manifestCoverage).toEqual(coverage);
    });

    it('sets manifestCoverage to null when getManifestCoverage throws', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);
        mockGetManifestCoverage.mockRejectedValue(new Error('Not available'));

        const stats = await getElitePoolStats();

        expect(stats.manifestCoverage).toBeNull();
    });

    it('uses "unknown" domain when domain is null', async () => {
        mockQueryOne.mockResolvedValue({ count: 5 });
        mockQuery
            .mockResolvedValueOnce([])  // generation
            .mockResolvedValueOnce([{ domain: null, count: 5 }]);  // domain

        const stats = await getElitePoolStats();

        expect(stats.domainDistribution['unknown']).toBe(5);
    });
});
