/**
 * Unit tests for handlers/elite.ts — handleElite dispatch and all action delegates.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetElitePoolStats = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0 });
const mockGetManifestCoverage = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetManifestGaps = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetEliteBridgingCandidates = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetEliteNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetTerminalFindings = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockScanExistingVerified = jest.fn<() => Promise<any>>().mockResolvedValue({ scanned: 0, promoted: 0 });
const mockDemoteFromElite = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core/elite-pool.js', () => ({
    getElitePoolStats: mockGetElitePoolStats,
    getManifestCoverage: mockGetManifestCoverage,
    getManifestGaps: mockGetManifestGaps,
    getEliteBridgingCandidates: mockGetEliteBridgingCandidates,
    getEliteNodes: mockGetEliteNodes,
    getTerminalFindings: mockGetTerminalFindings,
    scanExistingVerified: mockScanExistingVerified,
    demoteFromElite: mockDemoteFromElite,
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

const { handleElite } = await import('../../handlers/elite.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockGetElitePoolStats.mockResolvedValue({ count: 0 });
    mockGetManifestCoverage.mockResolvedValue(null);
    mockGetManifestGaps.mockResolvedValue(null);
    mockGetEliteBridgingCandidates.mockResolvedValue([]);
    mockGetEliteNodes.mockResolvedValue([]);
    mockGetTerminalFindings.mockResolvedValue([]);
    mockScanExistingVerified.mockResolvedValue({ scanned: 0, promoted: 0 });
    mockDemoteFromElite.mockResolvedValue({ success: true });
    mockQuery.mockResolvedValue([]);
});

// =============================================================================
// Unknown action
// =============================================================================

describe('unknown action', () => {
    it('returns error for unrecognized action', async () => {
        const result = await handleElite({ action: 'bogus' });
        expect(result.error).toContain('Unknown action');
    });
});

// =============================================================================
// stats
// =============================================================================

describe('action: stats', () => {
    it('calls getElitePoolStats and returns result', async () => {
        mockGetElitePoolStats.mockResolvedValue({ count: 12, avgGeneration: 3.5 });

        const result = await handleElite({ action: 'stats' });

        expect(mockGetElitePoolStats).toHaveBeenCalled();
        expect(result.count).toBe(12);
        expect(result.avgGeneration).toBe(3.5);
    });
});

// =============================================================================
// coverage
// =============================================================================

describe('action: coverage', () => {
    it('returns error when no project manifest found', async () => {
        mockGetManifestCoverage.mockResolvedValue(null);

        const result = await handleElite({ action: 'coverage' });

        expect(result.error).toContain('No project manifest found');
    });

    it('returns coverage when manifest exists', async () => {
        const coverage = { covered: 5, total: 10, percentage: 50 };
        mockGetManifestCoverage.mockResolvedValue(coverage);

        const result = await handleElite({ action: 'coverage' });

        expect(result.covered).toBe(5);
        expect(result.percentage).toBe(50);
    });
});

// =============================================================================
// gaps
// =============================================================================

describe('action: gaps', () => {
    it('returns error when no project manifest found', async () => {
        mockGetManifestGaps.mockResolvedValue(null);

        const result = await handleElite({ action: 'gaps' });

        expect(result.error).toContain('No project manifest found');
    });

    it('returns gaps when manifest exists', async () => {
        const gaps = { gaps: [{ target: 'security', covered: false }] };
        mockGetManifestGaps.mockResolvedValue(gaps);

        const result = await handleElite({ action: 'gaps' });

        expect(result.gaps).toHaveLength(1);
    });
});

// =============================================================================
// candidates
// =============================================================================

describe('action: candidates', () => {
    it('calls getEliteBridgingCandidates with limit and returns result', async () => {
        mockGetEliteBridgingCandidates.mockResolvedValue([
            { nodeA: 'n1', nodeB: 'n2', score: 0.95 },
            { nodeA: 'n3', nodeB: 'n4', score: 0.88 },
        ]);

        const result = await handleElite({ action: 'candidates', limit: 5 });

        expect(mockGetEliteBridgingCandidates).toHaveBeenCalledWith(5);
        expect(result.count).toBe(2);
        expect(result.candidates).toHaveLength(2);
    });

    it('uses default limit of 10 when not specified', async () => {
        await handleElite({ action: 'candidates' });

        expect(mockGetEliteBridgingCandidates).toHaveBeenCalledWith(10);
    });
});

// =============================================================================
// nodes
// =============================================================================

describe('action: nodes', () => {
    it('returns elite nodes with count', async () => {
        mockGetEliteNodes.mockResolvedValue([
            { id: 'n1', content: 'Elite breakthrough', domain: 'science', generation: 4 },
        ]);

        const result = await handleElite({ action: 'nodes' });

        expect(result.count).toBe(1);
        expect(result.nodes[0].id).toBe('n1');
    });

    it('passes filter options to getEliteNodes', async () => {
        await handleElite({ action: 'nodes', domain: 'science', minGeneration: 2, maxGeneration: 5, limit: 10 });

        expect(mockGetEliteNodes).toHaveBeenCalledWith({
            domain: 'science', minGeneration: 2, maxGeneration: 5, limit: 10,
        });
    });

    it('does not include undefined params in options', async () => {
        await handleElite({ action: 'nodes' });

        expect(mockGetEliteNodes).toHaveBeenCalledWith({});
    });
});

// =============================================================================
// terminals
// =============================================================================

describe('action: terminals', () => {
    it('returns terminal findings with count', async () => {
        mockGetTerminalFindings.mockResolvedValue([
            { id: 'n1', content: 'Final finding', generation: 8 },
        ]);

        const result = await handleElite({ action: 'terminals' });

        expect(result.count).toBe(1);
        expect(result.findings).toHaveLength(1);
    });
});

// =============================================================================
// rescan
// =============================================================================

describe('action: rescan', () => {
    it('calls scanExistingVerified with limit and returns result', async () => {
        mockScanExistingVerified.mockResolvedValue({ scanned: 10, promoted: 3 });

        const result = await handleElite({ action: 'rescan', limit: 25 });

        expect(mockScanExistingVerified).toHaveBeenCalledWith(25);
        expect(result.scanned).toBe(10);
        expect(result.promoted).toBe(3);
    });

    it('defaults limit to 50', async () => {
        await handleElite({ action: 'rescan' });

        expect(mockScanExistingVerified).toHaveBeenCalledWith(50);
    });
});

// =============================================================================
// demote
// =============================================================================

describe('action: demote', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleElite({ action: 'demote' });
        expect(result.error).toContain('nodeId is required');
    });

    it('calls demoteFromElite with nodeId, reason, contributor', async () => {
        mockDemoteFromElite.mockResolvedValue({ success: true, nodeId: 'n1' });

        const result = await handleElite({
            action: 'demote', nodeId: 'n1', reason: 'Superseded', contributor: 'human',
        });

        expect(mockDemoteFromElite).toHaveBeenCalledWith('n1', 'Superseded', 'human');
        expect(result.success).toBe(true);
    });

    it('uses default reason and contributor when not provided', async () => {
        await handleElite({ action: 'demote', nodeId: 'n1' });

        expect(mockDemoteFromElite).toHaveBeenCalledWith('n1', 'Demoted via MCP', 'system');
    });
});

// =============================================================================
// reset_bridging
// =============================================================================

describe('action: reset_bridging', () => {
    it('deletes rejected bridging log entries by default', async () => {
        mockQuery
            .mockResolvedValueOnce({ changes: 5 })  // DELETE result
            .mockResolvedValueOnce([{ c: 10 }]);     // remaining count

        const result = await handleElite({ action: 'reset_bridging' });

        const deleteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM elite_bridging_log')
        );
        expect(deleteCall).toBeDefined();
        expect(deleteCall[1]).toContain('rejected');
        expect(result.outcome).toBe('rejected');
        expect(result.remaining).toBe(10);
    });

    it('deletes specified outcome when provided', async () => {
        mockQuery
            .mockResolvedValueOnce({ changes: 2 })
            .mockResolvedValueOnce([{ c: 3 }]);

        const result = await handleElite({ action: 'reset_bridging', outcome: 'timeout' });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('timeout');
        expect(result.outcome).toBe('timeout');
    });
});
