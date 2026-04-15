/**
 * Unit tests for evm/feedback-review.ts — approveReview and bulkApproveReview.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const { approveReview, bulkApproveReview } = await import('../../evm/feedback-review.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLogDecision.mockResolvedValue(undefined);
    mockEmitActivity.mockReturnValue(undefined as any);
});

// Node in needs_review status
const reviewNode = (overrides: any = {}) => ({
    id: 'n-abc123',
    weight: 1.2,
    verification_status: 'needs_review',
    domain: 'science',
    ...overrides,
});

// =============================================================================
// approveReview
// =============================================================================

describe('approveReview', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await approveReview('missing-id', true);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('not found');
    });

    it('returns error when node not in review status', async () => {
        mockQueryOne.mockResolvedValue({ ...reviewNode(), verification_status: 'completed' });
        const result = await approveReview('n-abc123', true);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('not in review');
    });

    it('accepts nodes in needs_expert status', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ ...reviewNode(), verification_status: 'needs_expert' })
            .mockResolvedValueOnce(null); // no evm_executions
        const result = await approveReview('n-abc123', true);
        expect(result.ok).toBe(true);
    });

    // ── Approval paths ────────────────────────────────────────────────────────

    it('approves LLM-eval node and applies proposed weight', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode())  // node
            .mockResolvedValueOnce({              // last execution
                weight_before: 1.0,
                weight_after: 1.5,
                test_category: 'structural',
            });

        const result = await approveReview('n-abc123', true, 'alice');
        expect(result.ok).toBe(true);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('weight = $1')
        );
        expect(weightUpdate).toBeDefined();
        expect(weightUpdate[1][0]).toBe(1.5);
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n-abc123', 'weight', '1.2', '1.5', 'human', 'alice',
            expect.stringContaining('approved')
        );
    });

    it('approves without weight change when proposed weight matches current', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode({ weight: 1.5 }))
            .mockResolvedValueOnce({ weight_before: 1.0, weight_after: 1.5, test_category: 'structural' });

        const result = await approveReview('n-abc123', true);
        expect(result.ok).toBe(true);

        const updateCalls = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes SET')
        );
        // Should set verification_status without weight update
        const statusOnly = updateCalls.find(([sql]: any[]) =>
            String(sql).includes('verification_status') && !String(sql).includes('weight =')
        );
        expect(statusOnly).toBeDefined();
    });

    it('approves sandbox-tested node without weight change', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode())
            .mockResolvedValueOnce({ weight_before: 1.0, weight_after: 1.5, test_category: 'sandbox' });

        const result = await approveReview('n-abc123', true);
        expect(result.ok).toBe(true);
        // No weight update for sandbox
        const weightUpdates = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('weight = $1')
        );
        expect(weightUpdates).toHaveLength(0);
    });

    // ── Rejection paths ───────────────────────────────────────────────────────

    it('rejects LLM-eval node without reverting weight', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode())
            .mockResolvedValueOnce({ weight_before: 0.9, weight_after: 1.5, test_category: 'domain_expert' });

        const result = await approveReview('n-abc123', false);
        expect(result.ok).toBe(true);
        // LLM-eval rejection: no weight revert
        const weightUpdates = (mockQuery.mock.calls as any[]).filter(([sql]: any[]) =>
            String(sql).includes('weight = $1')
        );
        expect(weightUpdates).toHaveLength(0);
    });

    it('rejects sandbox node and reverts weight to weight_before', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode({ weight: 1.5 }))
            .mockResolvedValueOnce({ weight_before: 1.0, weight_after: 1.5, test_category: 'sandbox' });

        const result = await approveReview('n-abc123', false);
        expect(result.ok).toBe(true);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('weight = $1')
        );
        expect(weightUpdate[1][0]).toBe(1.0); // reverted to weight_before
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n-abc123', 'weight', '1.5', '1', 'human', 'human',
            expect.stringContaining('reverted')
        );
    });

    it('emits evm_review activity event', async () => {
        mockQueryOne
            .mockResolvedValueOnce(reviewNode())
            .mockResolvedValueOnce(null);

        await approveReview('n-abc123', true, 'bob');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'evm_review',
            expect.stringContaining('APPROVED'),
            expect.objectContaining({ approved: true, reviewer: 'bob' })
        );
    });
});

// =============================================================================
// bulkApproveReview
// =============================================================================

describe('bulkApproveReview', () => {
    it('processes all nodes and returns counts', async () => {
        // Two nodes in review, one not found
        mockQueryOne
            .mockResolvedValueOnce(reviewNode({ id: 'n1' }))
            .mockResolvedValueOnce(null)  // no execution for n1
            .mockResolvedValueOnce(reviewNode({ id: 'n2' }))
            .mockResolvedValueOnce(null)  // no execution for n2
            .mockResolvedValueOnce(null); // n3 not found

        const result = await bulkApproveReview(['n1', 'n2', 'n3'], true, 'admin');

        expect(result.processed).toBe(3);
        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('not found');
    });

    it('returns empty result for empty nodeIds array', async () => {
        const result = await bulkApproveReview([], true);
        expect(result.processed).toBe(0);
        expect(result.succeeded).toBe(0);
        expect(result.failed).toBe(0);
    });

    it('counts exceptions as failures', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB crash'));

        const result = await bulkApproveReview(['n1'], false, 'human');
        expect(result.processed).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.errors[0]).toContain('DB crash');
    });
});
