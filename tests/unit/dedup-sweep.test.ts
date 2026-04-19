/**
 * Unit tests for the automatic dedup sweep in population-control.ts — runDedupSweep().
 *
 * Tests: config gating, domain discovery, star clustering integration,
 * archive behavior, lineage exclusion, and activity emission.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockAreSimilar = jest.fn<(...args: any[]) => { similar: boolean; similarity: number; method: string }>();
const mockBuildClusters = jest.fn<(...args: any[]) => { clusters: number[][]; similarities: Map<string, number>; lineageExcludedPairs: number }>();

const mockDedupCfg = {
    enabled: true,
    maxAgeDays: 7,
    maxNodesPerDomain: 100,
    embeddingThreshold: 0.90,
    wordOverlapThreshold: 0.80,
};

const mockCfg = {
    enabled: true,
    gracePeriodHours: 2,
    batchSize: 5,
    threshold: 4.0,
    archiveThreshold: 2.0,
    boostWeight: 1.1,
    demoteWeight: 0.5,
    dedupSweep: mockDedupCfg,
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        populationControl: mockCfg,
        engine: { weightCeiling: 3.0, weightFloor: 0.05 },
        feedback: { weightFloor: 0.1 },
    },
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    areSimilar: mockAreSimilar,
    buildClusters: mockBuildClusters,
}));

// Mock synthesis-engine to prevent import issues
jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    runComprehensiveConsultant: jest.fn(),
}));

const { runDedupSweep } = await import('../../core/cycles/population-control.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Each test uses a unique domain to avoid watermark cache collisions
// (_lastSweepWatermark is a module-level Map that persists across tests)
let testCounter = 0;
function uniqueDomain(base = 'sci') { return `${base}-${++testCounter}`; }

beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(mockDedupCfg, {
        enabled: true,
        maxAgeDays: 7,
        maxNodesPerDomain: 100,
        embeddingThreshold: 0.90,
        wordOverlapThreshold: 0.80,
    });
    mockBuildClusters.mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runDedupSweep', () => {
    it('returns early when disabled', async () => {
        mockDedupCfg.enabled = false;
        await runDedupSweep();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns early when no domains have recent nodes', async () => {
        mockQuery.mockResolvedValueOnce([]); // domain query
        await runDedupSweep();
        expect(mockBuildClusters).not.toHaveBeenCalled();
    });

    it('skips domains with fewer than 2 candidates', async () => {
        const d = uniqueDomain();
        mockQuery.mockResolvedValueOnce([{ domain: d }]); // domain query
        mockQuery.mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]); // watermark
        mockQuery.mockResolvedValueOnce([{ id: 'n1', content: 'only one', weight: 1, domain: d }]); // candidates
        await runDedupSweep();
        expect(mockBuildClusters).not.toHaveBeenCalled();
    });

    it('calls buildClusters with correct thresholds and excludes lineage', async () => {
        const d = uniqueDomain();
        mockQuery
            .mockResolvedValueOnce([{ domain: d }]) // domain query
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]) // watermark
            .mockResolvedValueOnce([ // candidates (weight ASC from query, sorted to DESC internally)
                { id: 'n1', content: 'content A', weight: 0.5, domain: d, embedding: '[0.1]' },
                { id: 'n2', content: 'content B', weight: 1.0, domain: d, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([]); // edges

        mockBuildClusters.mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 });

        await runDedupSweep();

        expect(mockBuildClusters).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ id: 'n2' }), // weight DESC: n2 first
                expect.objectContaining({ id: 'n1' }),
            ]),
            0.90, // embeddingThreshold
            0.80, // wordOverlapThreshold
            expect.any(Set), // relatedPairs
        );
    });

    it('archives cluster members and keeps center (highest weight)', async () => {
        const d = uniqueDomain();
        const similarities = new Map([['0,1', 0.95]]);
        mockQuery
            .mockResolvedValueOnce([{ domain: d }]) // domains
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]) // watermark
            .mockResolvedValueOnce([
                { id: 'low-weight', content: 'duplicate A', weight: 0.5, domain: d, embedding: '[0.1]' },
                { id: 'high-weight', content: 'duplicate B', weight: 1.5, domain: d, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([]) // edges
            .mockResolvedValue([]); // UPDATE calls

        // After sorting by weight DESC: [high-weight(idx=0), low-weight(idx=1)]
        // Cluster: [0, 1] — center=0 (high-weight), member=1 (low-weight)
        mockBuildClusters.mockReturnValue({
            clusters: [[0, 1]],
            similarities,
            lineageExcludedPairs: 0,
        });

        await runDedupSweep();

        // Only the low-weight member should be archived
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('archived = 1'),
            expect.arrayContaining([expect.any(String)]),
        );

        // Activity emitted for the archived node
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_dedup',
            expect.stringContaining('archived'),
            expect.objectContaining({
                domain: d,
            }),
        );

        // Summary activity emitted
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'population_control_dedup_summary',
            expect.stringContaining('1 nodes archived'),
            expect.objectContaining({ totalArchived: 1 }),
        );
    });

    it('excludes parent-child edges from clustering', async () => {
        const d = uniqueDomain();
        mockQuery
            .mockResolvedValueOnce([{ domain: d }]) // domains
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]) // watermark
            .mockResolvedValueOnce([
                { id: 'parent-1', content: 'A', weight: 2.0, domain: d, embedding: '[0.1]' },
                { id: 'child-1', content: 'B', weight: 0.5, domain: d, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([{ source_id: 'parent-1', target_id: 'child-1' }]); // parent edge

        mockBuildClusters.mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 });

        await runDedupSweep();

        // Verify relatedPairs was passed with the lineage pair (both directions)
        const relatedPairs = mockBuildClusters.mock.calls[0][3] as Set<string>;
        expect(relatedPairs.has('parent-1:child-1')).toBe(true);
        expect(relatedPairs.has('child-1:parent-1')).toBe(true);
    });

    it('processes multiple domains independently', async () => {
        const d1 = uniqueDomain();
        const d2 = uniqueDomain('math');
        mockQuery
            .mockResolvedValueOnce([{ domain: d1 }, { domain: d2 }]) // domains
            // d1 watermark
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }])
            // d1 candidates
            .mockResolvedValueOnce([
                { id: 'n1', content: 'A', weight: 1, domain: d1, embedding: '[0.1]' },
                { id: 'n2', content: 'B', weight: 2, domain: d1, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([]) // d1 edges
            // d2 watermark
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }])
            // d2 candidates
            .mockResolvedValueOnce([
                { id: 'n3', content: 'C', weight: 1, domain: d2, embedding: '[0.3]' },
                { id: 'n4', content: 'D', weight: 2, domain: d2, embedding: '[0.4]' },
            ])
            .mockResolvedValueOnce([]); // d2 edges

        mockBuildClusters.mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 });

        await runDedupSweep();

        // buildClusters called once per domain
        expect(mockBuildClusters).toHaveBeenCalledTimes(2);
    });

    it('does not emit summary when nothing archived', async () => {
        const d = uniqueDomain();
        mockQuery
            .mockResolvedValueOnce([{ domain: d }])
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]) // watermark
            .mockResolvedValueOnce([
                { id: 'n1', content: 'A', weight: 1, domain: d, embedding: '[0.1]' },
                { id: 'n2', content: 'B', weight: 2, domain: d, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([]); // edges

        mockBuildClusters.mockReturnValue({ clusters: [], similarities: new Map(), lineageExcludedPairs: 0 });

        await runDedupSweep();

        expect(mockEmitActivity).not.toHaveBeenCalledWith(
            'cycle', 'population_control_dedup_summary',
            expect.any(String), expect.any(Object),
        );
    });

    it('respects custom config thresholds', async () => {
        const d = uniqueDomain();
        mockDedupCfg.embeddingThreshold = 0.85;
        mockDedupCfg.wordOverlapThreshold = 0.70;

        mockQuery
            .mockResolvedValueOnce([{ domain: d }])
            .mockResolvedValueOnce([{ latest: '2025-01-01T00:00:00Z' }]) // watermark
            .mockResolvedValueOnce([
                { id: 'n1', content: 'A', weight: 1, domain: d, embedding: '[0.1]' },
                { id: 'n2', content: 'B', weight: 2, domain: d, embedding: '[0.2]' },
            ])
            .mockResolvedValueOnce([]); // edges

        await runDedupSweep();

        expect(mockBuildClusters).toHaveBeenCalledWith(
            expect.any(Array),
            0.85,
            0.70,
            expect.any(Set),
        );
    });
});
