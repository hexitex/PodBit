/**
 * Unit tests for evm/feedback-query.ts —
 * getNodeVerifications, getRecentExecutions, recordAnalysis,
 * getReviewQueue, getEVMStats, dismissNodeVerification, pruneOldExecutions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockEmitActivity = jest.fn<() => void>();
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('exec-uuid-1234');

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    generateUuid: mockGenerateUuid,
}));

const {
    getNodeVerifications,
    getRecentExecutions,
    recordAnalysis,
    getReviewQueue,
    getEVMStats,
    dismissNodeVerification,
    pruneOldExecutions,
} = await import('../../evm/feedback-query.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGenerateUuid.mockReturnValue('exec-uuid-1234');
});

// =============================================================================
// getNodeVerifications
// =============================================================================

describe('getNodeVerifications', () => {
    it('queries lab_executions for the given node', async () => {
        mockQuery.mockResolvedValue([{ id: 'exec-1', status: 'completed' }]);
        const result = await getNodeVerifications('node-abc');

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('lab_executions');
        expect(args[0]).toBe('node-abc');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('exec-1');
    });

    it('returns full columns by default (not slim)', async () => {
        mockQuery.mockResolvedValue([]);
        await getNodeVerifications('node-xyz');
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('*');
    });

    it('returns slim columns when slim=true', async () => {
        mockQuery.mockResolvedValue([]);
        await getNodeVerifications('node-xyz', true);
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(sql).not.toContain('*');
        expect(sql).toContain('id, node_id');
    });
});

// =============================================================================
// getRecentExecutions
// =============================================================================

describe('getRecentExecutions', () => {
    it('returns paginated executions with total', async () => {
        mockQueryOne.mockResolvedValue({ total: '42' });
        mockQuery.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

        const result = await getRecentExecutions({ limit: 10, offset: 0 });

        expect(result.total).toBe(42);
        expect(result.executions).toHaveLength(2);
    });

    it('applies nodeId filter when provided', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ nodeId: 'node-123' });

        const calls = mockQueryOne.mock.calls[0] as any[];
        expect(calls[0]).toContain('e.node_id');
        expect(calls[1]).toContain('node-123');
    });

    it('applies "attention" status filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ status: 'attention' });

        const [sql] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain("IN ('code_error', 'failed', 'skipped')");
    });

    it('applies verified=true filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ verified: true });

        const [sql] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('e.verified = 1');
    });

    it('clamps limit to max 200', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ limit: 999 });

        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        // limit is second-to-last param
        const limit = params[params.length - 2];
        expect(limit).toBe(200);
    });

    it('defaults to 30 days when not specified', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions();

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        expect(params[0]).toBe(30);
    });
});

// =============================================================================
// recordAnalysis
// =============================================================================

describe('recordAnalysis', () => {
    it('inserts an lab_executions row with status=analysis', async () => {
        await recordAnalysis('node-1', {
            claimType: 'empirical',
            findings: {
                summary: 'Test findings',
                isInteresting: true,
                alternativeConfidence: 0.6,
            },
            analysisCode: 'print("hello")',
            sandboxResult: { stdout: 'hello', stderr: '', exitCode: 0, executionTimeMs: 42 },
            recoveryProposal: null,
        } as any);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('INSERT INTO lab_executions');
        expect(args[0]).toBe('exec-uuid-1234'); // id from generateUuid
        expect(args[1]).toBe('node-1');         // node_id
        expect(args[2]).toBe('analysis');        // status
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'evm_analysis_recorded', expect.any(String),
            expect.objectContaining({ nodeId: 'node-1', claimType: 'empirical', isInteresting: true }),
        );
    });

    it('includes recovery proposal as JSON when present', async () => {
        await recordAnalysis('node-2', {
            claimType: 'statistical',
            findings: { summary: null, isInteresting: false },
            recoveryProposal: { content: 'New insight', domain: 'science', parentIds: ['p-1'] },
        } as any);

        const [, args] = mockQuery.mock.calls[0] as any[];
        const recoveryArg = args[16]; // error field holds recovery JSON
        const parsed = JSON.parse(recoveryArg);
        expect(parsed.content).toBe('New insight');
        expect(parsed.domain).toBe('science');
    });

    it('sets recovery to null when not provided', async () => {
        await recordAnalysis('node-3', {
            claimType: 'causal',
            findings: { summary: null, isInteresting: false },
        } as any);

        const [, args] = mockQuery.mock.calls[0] as any[];
        expect(args[16]).toBeNull();
    });
});

// =============================================================================
// getReviewQueue
// =============================================================================

describe('getReviewQueue', () => {
    it('returns queue items with parents and total', async () => {
        mockQueryOne.mockResolvedValueOnce({ total: '2' });
        mockQuery
            .mockResolvedValueOnce([
                { id: 'n1', content: 'node one', verification_status: 'needs_review' },
            ])
            .mockResolvedValueOnce([ // parent batch query
                { child_id: 'n1', id: 'p1', content: 'parent content', domain: 'science', node_type: 'seed' },
            ]);

        const result = await getReviewQueue({ limit: 20, offset: 0 });

        expect(result.total).toBe(2);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].parents).toHaveLength(1);
        expect(result.items[0].parents[0].id).toBe('p1');
    });

    it('returns empty items array with no parents when no rows', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        const result = await getReviewQueue();

        expect(result.total).toBe(0);
        expect(result.items).toHaveLength(0);
    });

    it('defaults to needs_review + needs_expert status filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getReviewQueue();

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        expect(params).toContain('needs_review');
        expect(params).toContain('needs_expert');
    });
});

// =============================================================================
// getEVMStats
// =============================================================================

describe('getEVMStats', () => {
    it('returns parsed stats with correct integer fields', async () => {
        mockQueryOne.mockResolvedValueOnce({
            total: '10',
            verified_count: '6',
            disproved_count: '2',
            code_error_count: '1',
            error_count: '0',
            skipped_count: '0',
            needs_review_count: '1',
            needs_expert_count: '0',
            rejected_resynthesis_count: '0',
            avg_confidence: '0.75',
            avg_execution_time: '1234.5',
        });
        mockQuery.mockResolvedValueOnce([
            { normalized_category: 'statistical', count: '4' },
            { normalized_category: 'empirical', count: '2' },
        ]);
        mockQueryOne.mockResolvedValueOnce({ count: '1' }); // pending review

        const stats = await getEVMStats(7);

        expect(stats.total).toBe(10);
        expect(stats.verified).toBe(6);
        expect(stats.disproved).toBe(2);
        expect(stats.avgConfidence).toBe(0.75);
        expect(stats.avgExecutionTimeMs).toBe(1235);
        expect(stats.categories.statistical).toBe(4);
        expect(stats.pendingReviews).toBe(1);
        expect(stats.days).toBe(7);
    });

    it('returns zeros when no executions found', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const stats = await getEVMStats();

        expect(stats.total).toBe(0);
        expect(stats.avgConfidence).toBeNull();
        expect(stats.categories).toEqual({});
    });
});

// =============================================================================
// dismissNodeVerification
// =============================================================================

describe('dismissNodeVerification', () => {
    it('returns not-found error when node does not exist', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await dismissNodeVerification('ghost-node');

        expect(result.ok).toBe(false);
        expect(result.message).toContain('not found');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('clears verification_status and emits activity on success', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', verification_status: 'needs_review' });

        const result = await dismissNodeVerification('n1');

        expect(result.ok).toBe(true);
        expect(result.message).toContain('needs_review');
        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('verification_status = NULL');
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'evm_dismiss', expect.any(String),
            expect.objectContaining({ nodeId: 'n1', previousStatus: 'needs_review' }),
        );
    });
});

// =============================================================================
// pruneOldExecutions
// =============================================================================

describe('pruneOldExecutions', () => {
    it('returns dry-run counts without deleting', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'orphan-1' }]) // orphans
            .mockResolvedValueOnce([{ id: 'stale-1' }, { id: 'stale-2' }]); // to delete
        mockQueryOne.mockResolvedValue({ c: '100' }); // total kept

        const result = await pruneOldExecutions({ dryRun: true });

        // In dry-run: deleted = orphanCount + staleCount = 3, kept = total - stale = 98
        expect(result.deleted).toBe(3);
        // DELETE should not be called in dry-run (orphans + stale)
        const deleteCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('DELETE')
        );
        expect(deleteCalls).toHaveLength(0);
    });

    it('deletes orphans and stale records when not dry-run', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 'orphan-1' }]) // orphans
            .mockResolvedValueOnce([])                    // DELETE orphans
            .mockResolvedValueOnce([{ id: 'stale-1' }])  // stale
            .mockResolvedValueOnce([]);                   // DELETE stale
        mockQueryOne.mockResolvedValue({ c: '50' });

        const result = await pruneOldExecutions({ dryRun: false });

        const deleteCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('DELETE')
        );
        expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
        expect(result.kept).toBe(50);
    });

    it('returns zero deleted when nothing to prune', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no orphans
            .mockResolvedValueOnce([]); // no stale
        mockQueryOne.mockResolvedValue({ c: '10' });

        const result = await pruneOldExecutions({ dryRun: false });

        expect(result.deleted).toBe(0);
    });

    it('uses olderThanDays filter when provided', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // no orphans
            .mockResolvedValueOnce([]); // no stale
        mockQueryOne.mockResolvedValue({ c: '5' });

        await pruneOldExecutions({ dryRun: false, olderThanDays: 30 });

        // The stale query should include the date filter
        const staleCall = mockQuery.mock.calls[1] as any[];
        expect(String(staleCall[0])).toContain("'-30 days'");
    });

    it('batches orphan deletion for large sets', async () => {
        // Create 150+ orphans to trigger batch processing
        const orphans = Array.from({ length: 150 }, (_, i) => ({ id: `orphan-${i}` }));
        mockQuery
            .mockResolvedValueOnce(orphans)       // orphans query
            .mockResolvedValueOnce([])             // DELETE batch 1 (first 100)
            .mockResolvedValueOnce([])             // DELETE batch 2 (remaining 50)
            .mockResolvedValueOnce([]);            // stale query
        mockQueryOne.mockResolvedValue({ c: '200' });

        const result = await pruneOldExecutions({ dryRun: false });

        // Should have at least 2 delete calls (batches of 100)
        const deleteCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('DELETE')
        );
        expect(deleteCalls.length).toBe(2);
        expect(result.deleted).toBe(150);
    });
});

// =============================================================================
// getRecentExecutions — additional coverage
// =============================================================================

describe('getRecentExecutions — additional filters', () => {
    it('applies verified=false filter (refuted = claim_supported = 0)', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ verified: false });

        const [sql] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('e.claim_supported = 0');
        expect(sql).toContain("e.status = 'completed'");
    });

    it('applies specific status filter (not attention)', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ status: 'completed' });

        const [sql, params] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('e.status =');
        expect(params).toContain('completed');
    });

    it('applies minConfidence filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ minConfidence: 0.5 });

        const [sql, params] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('COALESCE(e.confidence, 0) >=');
        expect(params).toContain(0.5);
    });

    it('applies maxConfidence filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ maxConfidence: 0.9 });

        const [sql, params] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('COALESCE(e.confidence, 0) <=');
        expect(params).toContain(0.9);
    });

    it('applies search filter', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ search: 'quantum' });

        const [sql, params] = mockQueryOne.mock.calls[0] as any[];
        expect(sql).toContain('n.content LIKE');
        expect(params).toContain('%quantum%');
    });

    it('disables dedup when nodeId is specified', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ nodeId: 'node-abc' });

        // The dedup subquery should be replaced with 1=1
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('1=1');
    });

    it('enforces minimum days of 1', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ days: -5 });

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        expect(params[0]).toBe(1);
    });

    it('enforces minimum limit of 1', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getRecentExecutions({ limit: 0 });

        const [, params] = mockQuery.mock.calls[0] as any[];
        const limit = params[params.length - 2];
        expect(limit).toBe(1);
    });
});

// =============================================================================
// getReviewQueue — additional coverage
// =============================================================================

describe('getReviewQueue — single status filter', () => {
    it('uses specific status when provided', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getReviewQueue({ status: 'needs_expert' });

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        expect(params).toEqual(['needs_expert']);
    });

    it('clamps limit to max 100', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getReviewQueue({ limit: 500 });

        const [, params] = mockQuery.mock.calls[0] as any[];
        // limit is second-to-last param after status filters
        expect(params).toContain(100);
    });
});

// =============================================================================
// getEVMStats — additional coverage
// =============================================================================

describe('getEVMStats — edge cases', () => {
    it('enforces minimum days of 1', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await getEVMStats(0);

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        expect(params[0]).toBe(1);
    });

    it('rounds avg execution time', async () => {
        mockQueryOne.mockResolvedValueOnce({
            total: '5',
            verified_count: '3',
            disproved_count: '1',
            code_error_count: '0',
            error_count: '0',
            skipped_count: '0',
            needs_review_count: '0',
            needs_expert_count: '0',
            rejected_resynthesis_count: '0',
            avg_confidence: null,
            avg_execution_time: '1234.789',
        });
        mockQuery.mockResolvedValueOnce([]);
        mockQueryOne.mockResolvedValueOnce({ count: '0' });

        const stats = await getEVMStats(3);

        expect(stats.avgExecutionTimeMs).toBe(1235);
        expect(stats.avgConfidence).toBeNull();
    });
});
