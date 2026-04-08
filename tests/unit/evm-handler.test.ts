/**
 * Unit tests for handlers/evm.ts — handleLabVerify dispatch and simple action delegates.
 * Complex actions (analyse, suggest, decompose) are excluded due to LLM dependencies.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockVerifyNode = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockVerifyNodeInternal = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, direct: true });
const mockGetNodeVerifications = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetEVMStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetRecentExecutions = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0, executions: [] });
const mockResolveContent = jest.fn<() => Promise<string>>().mockResolvedValue('resolved content');
const mockGetReviewQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0, items: [] });
const mockApproveReview = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockReevaluateStoredResults = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 0 });
const mockReevaluateReviewQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ processed: 0 });
const mockPruneOldExecutions = jest.fn<() => Promise<any>>().mockResolvedValue({ deleted: 0 });
const mockDismissNodeVerification = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockEnqueue = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, existing: false });
const mockGetQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ entries: [] });
const mockGetQueueStats = jest.fn<() => Promise<any>>().mockResolvedValue({ pending: 0 });
const mockCancelEntry = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockCancelByNode = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockProcessNextEntry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../evm/index.js', () => ({
    verifyNode: mockVerifyNode,
    verifyNodeInternal: mockVerifyNodeInternal,
    getNodeVerifications: mockGetNodeVerifications,
    getEVMStats: mockGetEVMStats,
    getRecentExecutions: mockGetRecentExecutions,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../evm/feedback.js', () => ({
    getReviewQueue: mockGetReviewQueue,
    approveReview: mockApproveReview,
    reevaluateStoredResults: mockReevaluateStoredResults,
    reevaluateReviewQueue: mockReevaluateReviewQueue,
    pruneOldExecutions: mockPruneOldExecutions,
    dismissNodeVerification: mockDismissNodeVerification,
    recordAnalysis: jest.fn(),
}));

jest.unstable_mockModule('../../evm/queue.js', () => ({
    enqueue: mockEnqueue,
    getQueue: mockGetQueue,
    getQueueStats: mockGetQueueStats,
    cancelEntry: mockCancelEntry,
    cancelByNode: mockCancelByNode,
}));

jest.unstable_mockModule('../../evm/queue-worker.js', () => ({
    processNextEntry: mockProcessNextEntry,
}));

const { handleLabVerify } = await import('../../handlers/evm.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockVerifyNode.mockResolvedValue({ success: true });
    mockVerifyNodeInternal.mockResolvedValue({ success: true, direct: true });
    mockGetNodeVerifications.mockResolvedValue([]);
    mockGetEVMStats.mockResolvedValue({ total: 0 });
    mockGetRecentExecutions.mockResolvedValue({ count: 0, executions: [] });
    mockResolveContent.mockResolvedValue('resolved content');
    mockGetReviewQueue.mockResolvedValue({ count: 0, items: [] });
    mockApproveReview.mockResolvedValue({ success: true });
    mockReevaluateStoredResults.mockResolvedValue({ processed: 0 });
    mockReevaluateReviewQueue.mockResolvedValue({ processed: 0 });
    mockPruneOldExecutions.mockResolvedValue({ deleted: 0 });
    mockDismissNodeVerification.mockResolvedValue({ success: true });
    mockEnqueue.mockResolvedValue({ success: true, existing: false });
    mockGetQueue.mockResolvedValue({ entries: [] });
    mockGetQueueStats.mockResolvedValue({ pending: 0 });
    mockCancelEntry.mockResolvedValue({ success: true });
    mockCancelByNode.mockResolvedValue({ success: true });
    mockProcessNextEntry.mockResolvedValue(undefined);
});

// =============================================================================
// Dispatch / unknown action
// =============================================================================

describe('handleLabVerify dispatch', () => {
    it('returns error for unknown action', async () => {
        const result = await handleLabVerify({ action: 'invalid-action' });
        expect(result.error).toContain('Unknown action');
        expect(result.error).toContain('invalid-action');
    });
});

// =============================================================================
// verify
// =============================================================================

describe('action: verify', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'verify' });
        expect(result.error).toContain('nodeId is required');
    });

    // Every MCP-driven verify call carries `allowCritique: true` — that's what gates the
    // node_critique fallback in verifyNodeInternal so autonomous cycles can't launder LLM
    // agreement into weight changes, while human-invoked verifications (this handler) opt in.
    it('calls verifyNode by default', async () => {
        mockVerifyNode.mockResolvedValue({ success: true, nodeId: 'n1' });

        const result = await handleLabVerify({ action: 'verify', nodeId: 'n1' });

        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true });
        expect(result.success).toBe(true);
    });

    it('calls verifyNodeInternal when direct=true', async () => {
        mockVerifyNodeInternal.mockResolvedValue({ success: true, direct: true });

        await handleLabVerify({ action: 'verify', nodeId: 'n1', direct: true });

        expect(mockVerifyNodeInternal).toHaveBeenCalled();
        expect(mockVerifyNode).not.toHaveBeenCalled();
    });

    it('passes guidance and maxClaims as hints', async () => {
        await handleLabVerify({ action: 'verify', nodeId: 'n1', guidance: 'Focus on numbers', maxClaims: 3 });

        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true, guidance: 'Focus on numbers', maxClaims: 3 });
    });

    it('always passes the allowCritique hint even when no other hints supplied', async () => {
        await handleLabVerify({ action: 'verify', nodeId: 'n1' });

        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true });
    });
});

// =============================================================================
// history
// =============================================================================

describe('action: history', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'history' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns nodeId, count, and executions', async () => {
        mockGetNodeVerifications.mockResolvedValue([
            { id: 'exec-1', status: 'completed' },
            { id: 'exec-2', status: 'completed' },
        ]);

        const result = await handleLabVerify({ action: 'history', nodeId: 'n1' });

        expect(result.nodeId).toBe('n1');
        expect(result.count).toBe(2);
        expect(result.executions).toHaveLength(2);
    });

    it('passes slim param to getNodeVerifications', async () => {
        await handleLabVerify({ action: 'history', nodeId: 'n1', slim: true });

        expect(mockGetNodeVerifications).toHaveBeenCalledWith('n1', true);
    });
});

// =============================================================================
// recent
// =============================================================================

describe('action: recent', () => {
    it('returns result from getRecentExecutions', async () => {
        mockGetRecentExecutions.mockResolvedValue({ count: 5, executions: [{ id: 'e1' }] });

        const result = await handleLabVerify({ action: 'recent', days: 7, limit: 10, status: 'completed' });

        expect(result.count).toBe(5);
        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ days: 7, limit: 10, status: 'completed' })
        );
    });

    it('parses string params to numbers', async () => {
        await handleLabVerify({ action: 'recent', days: '14', limit: '25', offset: '5' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ days: 14, limit: 25, offset: 5 })
        );
    });

    it('converts string verified flag to boolean', async () => {
        await handleLabVerify({ action: 'recent', verified: 'true' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ verified: true })
        );
    });
});

// =============================================================================
// stats
// =============================================================================

describe('action: stats', () => {
    it('calls getEVMStats with default days=7', async () => {
        mockGetEVMStats.mockResolvedValue({ total: 42 });

        const result = await handleLabVerify({ action: 'stats' });

        expect(mockGetEVMStats).toHaveBeenCalledWith(7);
        expect(result.total).toBe(42);
    });

    it('passes days param to getEVMStats', async () => {
        await handleLabVerify({ action: 'stats', days: 30 });

        expect(mockGetEVMStats).toHaveBeenCalledWith(30);
    });
});

// =============================================================================
// reviews
// =============================================================================

describe('action: reviews', () => {
    it('calls getReviewQueue and returns result', async () => {
        mockGetReviewQueue.mockResolvedValue({ count: 3, items: [{ id: 'r1' }] });

        const result = await handleLabVerify({ action: 'reviews', status: 'needs_review', limit: 10 });

        expect(mockGetReviewQueue).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'needs_review', limit: 10 })
        );
        expect(result.count).toBe(3);
    });
});

// =============================================================================
// review
// =============================================================================

describe('action: review', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'review', approved: true });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when approved is missing', async () => {
        const result = await handleLabVerify({ action: 'review', nodeId: 'n1' });
        expect(result.error).toContain('approved');
    });

    it('calls approveReview with correct args', async () => {
        await handleLabVerify({ action: 'review', nodeId: 'n1', approved: true, reviewer: 'expert-1' });

        expect(mockApproveReview).toHaveBeenCalledWith('n1', true, 'expert-1');
    });

    it('defaults reviewer to "human" when not provided', async () => {
        await handleLabVerify({ action: 'review', nodeId: 'n1', approved: false });

        expect(mockApproveReview).toHaveBeenCalledWith('n1', false, 'human');
    });
});

// =============================================================================
// prune
// =============================================================================

describe('action: prune', () => {
    it('calls pruneOldExecutions with dryRun and olderThanDays', async () => {
        mockPruneOldExecutions.mockResolvedValue({ deleted: 5 });

        const result = await handleLabVerify({ action: 'prune', dryRun: true, olderThanDays: 90 });

        expect(mockPruneOldExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true, olderThanDays: 90 })
        );
        expect(result.deleted).toBe(5);
    });

    it('converts string "true" dryRun to boolean', async () => {
        await handleLabVerify({ action: 'prune', dryRun: 'true' });

        expect(mockPruneOldExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true })
        );
    });
});

// =============================================================================
// reevaluate / reevaluate_reviews
// =============================================================================

describe('action: reevaluate', () => {
    it('calls reevaluateStoredResults with params', async () => {
        await handleLabVerify({ action: 'reevaluate', dryRun: true, nodeId: 'n1' });

        expect(mockReevaluateStoredResults).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true, nodeId: 'n1' })
        );
    });
});

describe('action: reevaluate_reviews', () => {
    it('calls reevaluateReviewQueue with params', async () => {
        await handleLabVerify({ action: 'reevaluate_reviews', rerunLLM: true, nodeId: 'n2' });

        expect(mockReevaluateReviewQueue).toHaveBeenCalledWith(
            expect.objectContaining({ rerunLLM: true, nodeId: 'n2' })
        );
    });
});

// =============================================================================
// dismiss
// =============================================================================

describe('action: dismiss', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'dismiss' });
        expect(result.error).toContain('nodeId is required');
    });

    it('calls dismissNodeVerification with nodeId', async () => {
        mockDismissNodeVerification.mockResolvedValue({ success: true, nodeId: 'n1' });

        const result = await handleLabVerify({ action: 'dismiss', nodeId: 'n1' });

        expect(mockDismissNodeVerification).toHaveBeenCalledWith('n1');
        expect(result.success).toBe(true);
    });
});

// =============================================================================
// enqueue
// =============================================================================

describe('action: enqueue', () => {
    it('returns error when neither nodeId nor nodeIds provided', async () => {
        const result = await handleLabVerify({ action: 'enqueue' });
        expect(result.error).toContain('nodeId');
    });

    it('enqueues single node', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: false });

        const result = await handleLabVerify({ action: 'enqueue', nodeId: 'n1', priority: 5, guidance: 'Hint' });

        expect(mockEnqueue).toHaveBeenCalledWith('n1', expect.objectContaining({
            priority: 5, guidance: 'Hint', queuedBy: 'manual',
        }));
        expect(result.success).toBe(true);
    });

    it('triggers processNextEntry after successful new enqueue', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: false });

        await handleLabVerify({ action: 'enqueue', nodeId: 'n1' });

        expect(mockProcessNextEntry).toHaveBeenCalled();
    });

    it('does NOT trigger processNextEntry for existing queue entry', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: true });

        await handleLabVerify({ action: 'enqueue', nodeId: 'n1' });

        expect(mockProcessNextEntry).not.toHaveBeenCalled();
    });

    it('handles bulk enqueue via nodeIds array', async () => {
        mockEnqueue
            .mockResolvedValueOnce({ success: true, existing: false })
            .mockResolvedValueOnce({ success: false, existing: false })
            .mockResolvedValueOnce({ success: true, existing: true });

        const result = await handleLabVerify({
            action: 'enqueue',
            nodeIds: ['n1', 'n2', 'n3'],
            priority: 2,
        });

        expect(result.total).toBe(3);
        expect(result.enqueued).toBe(2); // all successes (including existing)
        expect(result.existing).toBe(1);
        expect(mockEnqueue).toHaveBeenCalledTimes(3);
    });
});

// =============================================================================
// queue
// =============================================================================

describe('action: queue', () => {
    it('calls getQueue with filters', async () => {
        mockGetQueue.mockResolvedValue({ entries: [{ id: 1 }] });

        const result = await handleLabVerify({ action: 'queue', status: 'pending', nodeId: 'n1', limit: 10 });

        expect(mockGetQueue).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'pending', nodeId: 'n1', limit: 10 })
        );
        expect(result.entries).toHaveLength(1);
    });
});

// =============================================================================
// cancel
// =============================================================================

describe('action: cancel', () => {
    it('returns error when neither queueId nor nodeId provided', async () => {
        const result = await handleLabVerify({ action: 'cancel' });
        expect(result.error).toContain('queueId or nodeId is required');
    });

    it('calls cancelEntry with numeric queueId', async () => {
        await handleLabVerify({ action: 'cancel', queueId: 42 });

        expect(mockCancelEntry).toHaveBeenCalledWith(42);
    });

    it('parses string queueId to int', async () => {
        await handleLabVerify({ action: 'cancel', queueId: '7' });

        expect(mockCancelEntry).toHaveBeenCalledWith(7);
    });

    it('calls cancelByNode when nodeId provided', async () => {
        await handleLabVerify({ action: 'cancel', nodeId: 'n1' });

        expect(mockCancelByNode).toHaveBeenCalledWith('n1');
    });

    it('prefers queueId over nodeId when both provided', async () => {
        await handleLabVerify({ action: 'cancel', queueId: 5, nodeId: 'n1' });

        expect(mockCancelEntry).toHaveBeenCalledWith(5);
        expect(mockCancelByNode).not.toHaveBeenCalled();
    });
});

// =============================================================================
// queue_stats
// =============================================================================

describe('action: queue_stats', () => {
    it('calls getQueueStats and returns result', async () => {
        mockGetQueueStats.mockResolvedValue({ pending: 3, processing: 1, failed: 0 });

        const result = await handleLabVerify({ action: 'queue_stats' });

        expect(mockGetQueueStats).toHaveBeenCalled();
        expect(result.pending).toBe(3);
    });
});
