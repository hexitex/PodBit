/**
 * Unit tests for core/pending.ts — MCP pending-request queue.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockIntervalAgo = jest.fn<() => string>().mockReturnValue("completed_at < NOW() - INTERVAL '1 hour'");
const mockUuid = jest.fn<() => string>().mockReturnValue('test-uuid-1234');

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    intervalAgo: mockIntervalAgo,
}));

jest.unstable_mockModule('uuid', () => ({
    v4: mockUuid,
}));

const { queueRequest, getPendingRequests, completeRequest, cleanupRequests } =
    await import('../../core/pending.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockIntervalAgo.mockReturnValue("completed_at < NOW() - INTERVAL '1 hour'");
    mockUuid.mockReturnValue('test-uuid-1234');
});

// =============================================================================
// queueRequest
// =============================================================================

describe('queueRequest', () => {
    it('inserts a pending request and returns id + params', async () => {
        const result = await queueRequest('research', { topic: 'AI safety' });

        expect(result.id).toBe('test-uuid-1234');
        expect(result.type).toBe('research');
        expect(result.params).toEqual({ topic: 'AI safety' });
        expect(result.status).toBe('pending');

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = (mockQuery.mock.calls[0] as any[]);
        expect(sql).toContain('INSERT INTO pending_requests');
        expect(args[0]).toBe('test-uuid-1234');
        expect(args[1]).toBe('research');
        expect(JSON.parse(args[2])).toEqual({ topic: 'AI safety' });
    });

    it('generates a unique id each call via uuid', async () => {
        mockUuid
            .mockReturnValueOnce('uuid-aaa')
            .mockReturnValueOnce('uuid-bbb');

        const r1 = await queueRequest('voice', {});
        const r2 = await queueRequest('research', {});

        expect(r1.id).toBe('uuid-aaa');
        expect(r2.id).toBe('uuid-bbb');
    });
});

// =============================================================================
// getPendingRequests
// =============================================================================

describe('getPendingRequests', () => {
    it('returns empty array when no pending rows', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getPendingRequests();
        expect(result).toEqual([]);
    });

    it('parses params from JSON string rows', async () => {
        mockQuery.mockResolvedValue([
            {
                id: 'req-1',
                type: 'research',
                params: '{"topic":"alignment"}',
                queued_at: '2024-01-01T00:00:00Z',
                status: 'pending',
            },
            {
                id: 'req-2',
                type: 'voice',
                params: { nodeId: 'n-abc' }, // already object
                queued_at: '2024-01-01T01:00:00Z',
                status: 'pending',
            },
        ]);

        const result = await getPendingRequests();

        expect(result).toHaveLength(2);
        expect(result[0].params).toEqual({ topic: 'alignment' });
        expect(result[0].queuedAt).toBe('2024-01-01T00:00:00Z');
        expect(result[1].params).toEqual({ nodeId: 'n-abc' });
    });

    it('queries for pending status ordered by queued_at', async () => {
        await getPendingRequests();
        const sql = (mockQuery.mock.calls[0] as any[])[0];
        expect(String(sql)).toContain("status = 'pending'");
    });
});

// =============================================================================
// completeRequest
// =============================================================================

describe('completeRequest', () => {
    it('returns true when rowCount > 0', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 } as any);
        const result = await completeRequest('req-1', { summary: 'done' });
        expect(result).toBe(true);
    });

    it('returns false when rowCount is 0 (not found)', async () => {
        mockQuery.mockResolvedValue({ rowCount: 0 } as any);
        const result = await completeRequest('nonexistent-id');
        expect(result).toBe(false);
    });

    it('passes null result when none provided', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 } as any);
        await completeRequest('req-1');

        const args = (mockQuery.mock.calls[0] as any[])[1] as any[];
        expect(args[1]).toBeNull();
    });

    it('serialises result as JSON when provided', async () => {
        mockQuery.mockResolvedValue({ rowCount: 1 } as any);
        await completeRequest('req-1', { nodes: [1, 2] });

        const args = (mockQuery.mock.calls[0] as any[])[1] as any[];
        expect(JSON.parse(args[1])).toEqual({ nodes: [1, 2] });
    });
});

// =============================================================================
// cleanupRequests
// =============================================================================

describe('cleanupRequests', () => {
    it('deletes completed requests older than 1 hour', async () => {
        const result = await cleanupRequests();

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('DELETE FROM pending_requests');
        expect(result).toBe(0); // always returns 0
    });

    it('uses intervalAgo for time filtering', async () => {
        await cleanupRequests();
        expect(mockIntervalAgo).toHaveBeenCalledWith(1, 'hour');
    });
});
