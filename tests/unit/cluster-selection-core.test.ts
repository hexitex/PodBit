/**
 * Unit tests for core/cluster-selection.ts — simulated annealing cluster selection.
 *
 * Mocks: db.js (query), config.js, scoring.js (cosineSimilarity),
 * vector/embedding-cache.js (batchLoad), governance.js (getAccessibleDomains).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockBatchLoad = jest.fn<(...args: any[]) => Promise<Map<string, number[]>>>().mockResolvedValue(new Map());
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0.5);
const mockGetAccessibleDomains = jest.fn<(d: string) => Promise<string[]>>().mockResolvedValue([]);

const defaultClusterConfig = {
    targetSize: 3,
    candidatePoolSize: 50,
    maxIterations: 100,
    initialTemp: 1.0,
    coolingRate: 0.95,
    coherenceWeight: 1.0,
    diversityWeight: 0.5,
    weightBonusScale: 0.3,
    sizePenalty: 0.2,
    minSimilarity: 0.3,
    maxSimilarity: 0.8,
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
}));
jest.unstable_mockModule('../../config.js', () => ({
    config: { clusterSelection: { ...defaultClusterConfig } },
}));
jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
}));
jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    batchLoad: mockBatchLoad,
}));
jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
}));
jest.unstable_mockModule('../../core/types.js', () => ({}));

const { findClusters } = await import('../../core/cluster-selection.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockBatchLoad.mockResolvedValue(new Map());
    mockCosineSimilarity.mockReturnValue(0.5);
    mockGetAccessibleDomains.mockResolvedValue([]);
});

function makeNodes(count: number, domain = 'test') {
    return Array.from({ length: count }, (_, i) => ({
        id: `node-${i}`,
        content: `content ${i}`,
        weight: 1 + i * 0.1,
        salience: 0.5,
        specificity: 0.5,
        domain,
    }));
}

function makeEmbeddings(ids: string[]) {
    const map = new Map<string, number[]>();
    for (const id of ids) {
        map.set(id, [Math.random(), Math.random(), Math.random()]);
    }
    return map;
}

describe('findClusters', () => {
    it('returns empty clusters when candidate pool is too small', async () => {
        const nodes = makeNodes(2); // less than targetSize=3
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));

        const result = await findClusters();

        expect(result.clusters).toEqual([]);
        expect(result.candidatePoolSize).toBe(2);
    });

    it('returns empty clusters when no embeddings available', async () => {
        const nodes = makeNodes(5);
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(new Map()); // no embeddings

        const result = await findClusters();

        expect(result.clusters).toEqual([]);
        expect(result.candidatePoolSize).toBe(0);
    });

    it('returns a cluster when enough candidates with embeddings exist', async () => {
        const nodes = makeNodes(10);
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));
        // Return similarity in the productive band
        mockCosineSimilarity.mockReturnValue(0.55);

        const result = await findClusters();

        expect(result.clusters.length).toBe(1);
        expect(result.clusters[0].nodeIds.length).toBe(3); // targetSize
        expect(result.iterations).toBe(100); // maxIterations
        expect(typeof result.finalTemperature).toBe('number');
    });

    it('uses getAccessibleDomains when domain is specified', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['domA', 'domB']);
        const nodes = makeNodes(10);
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));
        mockCosineSimilarity.mockReturnValue(0.55);

        await findClusters('domA');

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('domA');
        // Query should include domain placeholders
        const queryCall = mockQuery.mock.calls[0];
        expect(queryCall[0]).toContain('IN');
        expect(queryCall[1]).toContain('domA');
        expect(queryCall[1]).toContain('domB');
    });

    it('can find multiple clusters', async () => {
        const nodes = makeNodes(20, 'test');
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));
        mockCosineSimilarity.mockReturnValue(0.55);

        const result = await findClusters(null, 3);

        // Should find up to 3 clusters (uses different nodes each time)
        expect(result.clusters.length).toBeGreaterThanOrEqual(1);
        expect(result.clusters.length).toBeLessThanOrEqual(3);
    });

    it('does not reuse nodes across clusters', async () => {
        const nodes = makeNodes(20);
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));
        mockCosineSimilarity.mockReturnValue(0.55);

        const result = await findClusters(null, 2);

        if (result.clusters.length === 2) {
            const ids1 = new Set(result.clusters[0].nodeIds);
            const ids2 = new Set(result.clusters[1].nodeIds);
            // No overlap
            for (const id of ids2) {
                expect(ids1.has(id)).toBe(false);
            }
        }
    });

    it('returns null cluster when coherence outside productive band', async () => {
        const nodes = makeNodes(10);
        mockQuery.mockResolvedValue(nodes);
        mockBatchLoad.mockResolvedValue(makeEmbeddings(nodes.map(n => n.id)));
        // Similarity way below minSimilarity
        mockCosineSimilarity.mockReturnValue(0.1);

        const result = await findClusters();

        // Annealing may not find a valid cluster when all similarities are out of band
        expect(result.clusters.length).toBe(0);
    });

    it('reports candidatePoolSize correctly', async () => {
        const nodes = makeNodes(15);
        mockQuery.mockResolvedValue(nodes);
        // Only 10 of 15 have embeddings
        const partialEmb = makeEmbeddings(nodes.slice(0, 10).map(n => n.id));
        mockBatchLoad.mockResolvedValue(partialEmb);
        mockCosineSimilarity.mockReturnValue(0.55);

        const result = await findClusters();

        expect(result.candidatePoolSize).toBe(10);
    });
});
