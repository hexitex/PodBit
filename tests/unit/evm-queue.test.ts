/**
 * Unit tests for evm/queue.ts — all queue operations.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const {
    enqueue,
    nextPending,
    completeEntry,
    releaseEntry,
    requeueFailed,
    cancelEntry,
    cancelByNode,
    getQueue,
    getQueueStats,
    recoverStuck,
    clearNodeQueueStatus,
} = await import('../../evm/queue.js');

function makeEntry(overrides: Record<string, any> = {}) {
    return {
        id: 1,
        node_id: 'node-1',
        status: 'pending',
        priority: 0,
        retry_count: 0,
        max_retries: 3,
        guidance: null,
        queued_by: 'manual',
        error: null,
        execution_id: null,
        queued_at: '2024-01-01T00:00:00Z',
        started_at: null,
        completed_at: null,
        next_eligible_at: null,
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// enqueue
// =============================================================================

describe('enqueue', () => {
    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null); // node not found
        const result = await enqueue('missing-node');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found or archived');
    });

    it('returns existing=true when duplicate pending entry exists', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'node-1', verification_status: null }) // node exists
            .mockResolvedValueOnce({ id: 99, status: 'pending' });              // existing queue entry

        const result = await enqueue('node-1');
        expect(result.success).toBe(true);
        expect(result.existing).toBe(true);
    });

    it('inserts queue entry and marks node in_queue on success', async () => {
        const newEntry = makeEntry({ id: 5 });
        mockQueryOne
            .mockResolvedValueOnce({ id: 'node-1' }) // node exists
            .mockResolvedValueOnce(null);             // no existing queue entry
        mockQuery
            .mockResolvedValueOnce([newEntry])        // INSERT RETURNING
            .mockResolvedValueOnce([]);               // UPDATE nodes

        const result = await enqueue('node-1', { priority: 2, guidance: 'Focus on math', queuedBy: 'autonomous' });

        expect(result.success).toBe(true);
        expect(result.entry).toEqual(newEntry);

        // First query should be INSERT with correct params
        const insertCall = (mockQuery.mock.calls as any[])[0];
        expect(String(insertCall[0])).toContain('INSERT INTO lab_queue');
        expect(insertCall[1]).toContain('node-1');
        expect(insertCall[1]).toContain(2);         // priority
        expect(insertCall[1]).toContain('Focus on math');
        expect(insertCall[1]).toContain('autonomous');

        // Second query should update node verification_status
        const updateCall = (mockQuery.mock.calls as any[])[1];
        expect(String(updateCall[0])).toContain('verification_status');
        expect(updateCall[1]).toContain('node-1');
    });

    it('uses defaults when options not provided', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ id: 'node-1' })
            .mockResolvedValueOnce(null);
        mockQuery
            .mockResolvedValueOnce([makeEntry()])
            .mockResolvedValueOnce([]);

        await enqueue('node-1');

        const insertCall = (mockQuery.mock.calls as any[])[0];
        // Default priority=0, maxRetries=3, queuedBy=manual
        expect(insertCall[1]).toContain(0);     // priority
        expect(insertCall[1]).toContain(3);     // maxRetries
        expect(insertCall[1]).toContain('manual');
    });
});

// =============================================================================
// nextPending
// =============================================================================

describe('nextPending', () => {
    it('returns null when no pending entries', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await nextPending();
        expect(result).toBeNull();
    });

    it('claims pending entry by setting status to processing', async () => {
        const pendingEntry = makeEntry({ id: 7, status: 'pending' });
        mockQueryOne.mockResolvedValue(pendingEntry);
        mockQuery.mockResolvedValue([]);

        const result = await nextPending();

        expect(result).not.toBeNull();
        expect(result!.status).toBe('processing');
        expect(result!.id).toBe(7);

        // Verify UPDATE was called
        const updateCall = (mockQuery.mock.calls as any[])[0];
        expect(String(updateCall[0])).toContain("status = 'processing'");
        expect(updateCall[1]).toContain(7);
    });
});

// =============================================================================
// completeEntry
// =============================================================================

describe('completeEntry', () => {
    it('marks entry as completed when no error', async () => {
        await completeEntry(5, 'exec-abc', undefined);

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('completed');
        expect(params).toContain('exec-abc');
        expect(params).toContain(5);
        expect(params).not.toContain('failed');
    });

    it('marks entry as failed when error provided', async () => {
        await completeEntry(5, null, 'Execution timeout');

        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('failed');
        expect(params).toContain('Execution timeout');
    });
});

// =============================================================================
// releaseEntry
// =============================================================================

describe('releaseEntry', () => {
    it('resets entry back to pending with cleared started_at', async () => {
        await releaseEntry(3);

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain("status = 'pending'");
        expect(params).toContain(3);
    });
});

// =============================================================================
// requeueFailed
// =============================================================================

describe('requeueFailed', () => {
    it('returns requeued=false when entry not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await requeueFailed(99);
        expect(result.requeued).toBe(false);
    });

    it('returns requeued=false and clears node status when max retries reached', async () => {
        const exhausted = makeEntry({ id: 10, node_id: 'node-x', retry_count: 3, max_retries: 3 });
        mockQueryOne
            .mockResolvedValueOnce(exhausted) // the failed entry
            .mockResolvedValueOnce(null);     // clearNodeQueueStatus check — no remaining

        const result = await requeueFailed(10);
        expect(result.requeued).toBe(false);

        // clearNodeQueueStatus should have been called
        const nodeUpdateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('verification_status = NULL')
        );
        expect(nodeUpdateCall).toBeDefined();
    });

    it('inserts new pending entry with incremented retry count', async () => {
        const failedEntry = makeEntry({ id: 5, node_id: 'node-y', retry_count: 1, max_retries: 3, priority: 2, guidance: 'hint' });
        const newEntry = makeEntry({ id: 6, retry_count: 2, queued_by: 'retry' });
        mockQueryOne.mockResolvedValue(failedEntry);
        mockQuery.mockResolvedValue([newEntry]);

        const result = await requeueFailed(5);

        expect(result.requeued).toBe(true);
        expect(result.entry).toEqual(newEntry);

        const insertCall = (mockQuery.mock.calls as any[])[0];
        expect(String(insertCall[0])).toContain('INSERT INTO lab_queue');
        expect(String(insertCall[0])).toContain("'retry'"); // hardcoded in SQL
        expect(insertCall[1]).toContain(2);     // newRetryCount
    });
});

// =============================================================================
// cancelEntry
// =============================================================================

describe('cancelEntry', () => {
    it('returns error when entry not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await cancelEntry(99);
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    it('returns error when entry is not pending', async () => {
        mockQueryOne.mockResolvedValue(makeEntry({ status: 'processing' }));
        const result = await cancelEntry(1);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot cancel');
    });

    it('cancels pending entry and clears node queue status', async () => {
        const pendingEntry = makeEntry({ id: 3, node_id: 'node-z', status: 'pending' });
        mockQueryOne
            .mockResolvedValueOnce(pendingEntry) // cancelEntry fetch
            .mockResolvedValueOnce(null);        // clearNodeQueueStatus — no remaining

        const result = await cancelEntry(3);
        expect(result.success).toBe(true);

        const cancelCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("status = 'cancelled'")
        );
        expect(cancelCall).toBeDefined();
        expect(cancelCall[1]).toContain(3);
    });
});

// =============================================================================
// cancelByNode
// =============================================================================

describe('cancelByNode', () => {
    it('cancels all pending entries for a node and returns count', async () => {
        // UPDATE RETURNING gives back 2 cancelled rows
        mockQuery.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
        mockQueryOne.mockResolvedValue(null); // clearNodeQueueStatus
        mockQuery.mockResolvedValue([]); // UPDATE nodes

        const result = await cancelByNode('node-abc');
        expect(result.cancelled).toBe(2);
    });

    it('returns 0 when no pending entries for node', async () => {
        mockQuery.mockResolvedValue([]); // no rows affected
        const result = await cancelByNode('node-none');
        expect(result.cancelled).toBe(0);
    });
});

// =============================================================================
// getQueue
// =============================================================================

describe('getQueue', () => {
    it('returns entries and total', async () => {
        const entries = [makeEntry({ id: 1 }), makeEntry({ id: 2 })];
        mockQueryOne.mockResolvedValue({ total: '42' });
        mockQuery.mockResolvedValue(entries);

        const result = await getQueue();
        expect(result.total).toBe(42);
        expect(result.entries).toHaveLength(2);
    });

    it('applies status filter to SQL', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getQueue({ status: 'pending' });

        const [countSql, countParams] = mockQueryOne.mock.calls[0] as any[];
        expect(String(countSql)).toContain('status');
        expect(countParams).toContain('pending');
    });

    it('applies nodeId filter to SQL', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getQueue({ nodeId: 'node-xyz' });

        const [, countParams] = mockQueryOne.mock.calls[0] as any[];
        expect(countParams).toContain('node-xyz');
    });

    it('uses default limit=50 and offset=0', async () => {
        mockQueryOne.mockResolvedValue({ total: '0' });
        mockQuery.mockResolvedValue([]);

        await getQueue();

        const listParams = mockQuery.mock.calls[0][1] as any[];
        expect(listParams).toContain(50);
        expect(listParams).toContain(0);
    });
});

// =============================================================================
// getQueueStats
// =============================================================================

describe('getQueueStats', () => {
    it('returns zero stats when queue is empty', async () => {
        mockQuery.mockResolvedValue([]);
        const stats = await getQueueStats();
        expect(stats.pending).toBe(0);
        expect(stats.processing).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.failed).toBe(0);
        expect(stats.cancelled).toBe(0);
        expect(stats.total).toBe(0);
    });

    it('aggregates stats from GROUP BY rows', async () => {
        mockQuery.mockResolvedValue([
            { status: 'pending', count: '3' },
            { status: 'processing', count: '1' },
            { status: 'completed', count: '20' },
            { status: 'failed', count: '2' },
        ]);

        const stats = await getQueueStats();
        expect(stats.pending).toBe(3);
        expect(stats.processing).toBe(1);
        expect(stats.completed).toBe(20);
        expect(stats.failed).toBe(2);
        expect(stats.cancelled).toBe(0);
        expect(stats.total).toBe(26);
    });
});

// =============================================================================
// recoverStuck
// =============================================================================

describe('recoverStuck', () => {
    it('resets processing entries to pending and returns count', async () => {
        mockQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]); // 2 stuck entries recovered

        const count = await recoverStuck();
        expect(count).toBe(2);

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain("status = 'pending'");
        expect(String(sql)).toContain("status = 'processing'");
    });

    it('returns 0 when no stuck entries', async () => {
        mockQuery.mockResolvedValue([]);
        const count = await recoverStuck();
        expect(count).toBe(0);
    });
});

// =============================================================================
// clearNodeQueueStatus
// =============================================================================

describe('clearNodeQueueStatus', () => {
    it('clears verification_status when no remaining active entries', async () => {
        mockQueryOne.mockResolvedValue(null); // no remaining active entries

        await clearNodeQueueStatus('node-1');

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('verification_status = NULL')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('node-1');
    });

    it('does not clear verification_status when active entries remain', async () => {
        mockQueryOne.mockResolvedValue({ id: 5 }); // remaining active entry

        await clearNodeQueueStatus('node-1');

        // Should not have called UPDATE nodes
        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('verification_status = NULL')
        );
        expect(updateCall).toBeUndefined();
    });
});
