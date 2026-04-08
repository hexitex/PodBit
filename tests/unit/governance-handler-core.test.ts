/**
 * Unit tests for handlers/governance.ts —
 * handlePartitions and handleContext (partition CRUD, bridge management,
 * domain operations, context engine dispatch, and error cases).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCheckPartitionHealth = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockCountFilter = jest.fn((expr: string) => `COUNT(CASE WHEN ${expr} THEN 1 END)`);
const mockWithinDays = jest.fn((col: string, param: string) => `${col} >= datetime('now', '-' || ${param} || ' days')`);
const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key');
const mockExportPartition = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockImportPartition = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockImportTransient = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockApproveTransient = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockDepartTransient = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockGetVisitHistory = jest.fn<() => Promise<any>>().mockResolvedValue({ visits: [] });
const mockRenameDomain = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockClearCycleExclusionCache = jest.fn();
const mockContextPrepare = jest.fn<() => Promise<any>>().mockResolvedValue({ systemPrompt: 'test' });
const mockContextUpdate = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockGetSession = jest.fn<() => any>().mockReturnValue(null);
const mockListSessions = jest.fn<() => any[]>().mockReturnValue([]);
const mockDeleteSession = jest.fn<() => boolean>().mockReturnValue(true);
const mockGetBudgets = jest.fn<() => any>().mockReturnValue({});

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    checkPartitionHealth: mockCheckPartitionHealth,
    getPendingRequests: jest.fn().mockResolvedValue([]),
    completeRequest: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    countFilter: mockCountFilter,
    withinDays: mockWithinDays,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        server: { host: '127.0.0.1', port: 3000 },
        intakeDefense: { concentrationThreshold: 0.5, throttleThreshold: 0.7 },
    },
}));

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
}));

jest.unstable_mockModule('../../routes/partitions.js', () => ({
    exportPartition: mockExportPartition,
    importPartition: mockImportPartition,
    importTransient: mockImportTransient,
    approveTransient: mockApproveTransient,
    departTransient: mockDepartTransient,
    getVisitHistory: mockGetVisitHistory,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    renameDomain: mockRenameDomain,
    clearCycleExclusionCache: mockClearCycleExclusionCache,
}));

jest.unstable_mockModule('../../context-engine.js', () => ({
    prepare: mockContextPrepare,
    update: mockContextUpdate,
    getSession: mockGetSession,
    listSessions: mockListSessions,
    deleteSession: mockDeleteSession,
    getBudgets: mockGetBudgets,
}));

jest.unstable_mockModule('../../core/lifecycle.js', () => ({
    getMetabolism: jest.fn().mockResolvedValue({ births: 0, deaths: 0 }),
}));

const { handlePartitions, handleContext } =
    await import('../../handlers/governance.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// handlePartitions — list
// =============================================================================

describe('handlePartitions — list', () => {
    it('returns empty partitions list', async () => {
        mockQuery.mockResolvedValueOnce([]); // partitions query
        const result = await handlePartitions({ action: 'list' });
        expect(result.partitions).toEqual([]);
    });

    it('returns partitions with their domains', async () => {
        mockQuery
            .mockResolvedValueOnce([ // partitions
                { id: 'p1', name: 'Main', description: 'Primary', created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, imported_at: null, allowed_cycles: null },
            ])
            .mockResolvedValueOnce([ // domains for p1
                { domain: 'science' },
                { domain: 'math' },
            ]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions).toHaveLength(1);
        expect(result.partitions[0].id).toBe('p1');
        expect(result.partitions[0].name).toBe('Main');
        expect(result.partitions[0].domains).toEqual(['science', 'math']);
        expect(result.partitions[0].system).toBe(false);
        expect(result.partitions[0].transient).toBe(false);
    });

    it('parses system flag correctly', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'sys', name: 'System', description: null, created_at: '2024-01-01', system: 1, transient: 0, state: null, source_project: null, imported_at: null, allowed_cycles: null },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0].system).toBe(true);
    });

    it('parses allowed_cycles JSON', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', name: 'Limited', description: null, created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, imported_at: null, allowed_cycles: '["synthesis","validation"]' },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0].allowed_cycles).toEqual(['synthesis', 'validation']);
    });

    it('handles transient partitions with state', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 't1', name: 'Visitor', description: null, created_at: '2024-01-01', system: 0, transient: 1, state: 'active', source_project: 'other-project', imported_at: '2024-06-01', allowed_cycles: null },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0].transient).toBe(true);
        expect(result.partitions[0].state).toBe('active');
        expect(result.partitions[0].source_project).toBe('other-project');
    });

    it('strips transient-only fields from non-transient partitions', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'p1', name: 'Normal', description: null, created_at: '2024-01-01', system: 0, transient: 0, state: null, source_project: null, imported_at: null, allowed_cycles: null },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0]).not.toHaveProperty('state');
        expect(result.partitions[0]).not.toHaveProperty('source_project');
        expect(result.partitions[0]).not.toHaveProperty('imported_at');
    });
});

// =============================================================================
// handlePartitions — get
// =============================================================================

describe('handlePartitions — get', () => {
    it('returns error when id is missing', async () => {
        const result = await handlePartitions({ action: 'get' });
        expect(result.error).toContain('id is required');
    });

    it('returns error when partition not found', async () => {
        mockQueryOne.mockResolvedValueOnce(null);
        const result = await handlePartitions({ action: 'get', id: 'nonexistent' });
        expect(result.error).toBe('Partition not found');
    });

    it('returns partition with domains', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'p1', name: 'Main', description: 'Test', created_at: '2024-01-01', system: 0, allowed_cycles: null,
        });
        mockQuery.mockResolvedValueOnce([
            { domain: 'alpha', added_at: '2024-01-01' },
            { domain: 'beta', added_at: '2024-01-02' },
        ]);

        const result = await handlePartitions({ action: 'get', id: 'p1' });

        expect(result.id).toBe('p1');
        expect(result.name).toBe('Main');
        expect(result.system).toBe(false);
        expect(result.domains).toEqual(['alpha', 'beta']);
    });
});

// =============================================================================
// handlePartitions — create
// =============================================================================

describe('handlePartitions — create', () => {
    it('returns error when id or name missing', async () => {
        const r1 = await handlePartitions({ action: 'create', name: 'Test' });
        expect(r1.error).toContain('id and name are required');

        const r2 = await handlePartitions({ action: 'create', id: 'test' });
        expect(r2.error).toContain('id and name are required');
    });

    it('creates partition without domains', async () => {
        const result = await handlePartitions({
            action: 'create', id: 'new-p', name: 'New Partition', description: 'A test',
        });

        expect(result.success).toBe(true);
        expect(result.id).toBe('new-p');
        expect(result.name).toBe('New Partition');
        expect(result.domains).toEqual([]);
        // Should have called INSERT for partition
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO domain_partitions'),
            ['new-p', 'New Partition', 'A test', 0],
        );
    });

    it('creates partition with domains', async () => {
        const result = await handlePartitions({
            action: 'create', id: 'dp', name: 'Domain P', domains: ['d1', 'd2'],
        });

        expect(result.success).toBe(true);
        expect(result.domains).toEqual(['d1', 'd2']);
        // 1 partition insert + 2 domain inserts = 3 query calls
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('creates system partition when system flag is true', async () => {
        const result = await handlePartitions({
            action: 'create', id: 'sys', name: 'System', system: true,
        });

        expect(result.system).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO domain_partitions'),
            ['sys', 'System', null, 1],
        );
    });
});

// =============================================================================
// handlePartitions — update
// =============================================================================

describe('handlePartitions — update', () => {
    it('returns error when id is missing', async () => {
        const result = await handlePartitions({ action: 'update' });
        expect(result.error).toContain('id is required');
    });

    it('updates name and description', async () => {
        const result = await handlePartitions({
            action: 'update', id: 'p1', name: 'Updated', description: 'New desc',
        });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE domain_partitions SET'),
            ['Updated', 'New desc', 'p1'],
        );
    });

    it('clears cycle exclusion cache when allowed_cycles is updated', async () => {
        await handlePartitions({
            action: 'update', id: 'p1', allowed_cycles: ['synthesis'],
        });

        expect(mockClearCycleExclusionCache).toHaveBeenCalled();
    });

    it('does not update when no fields provided', async () => {
        const result = await handlePartitions({ action: 'update', id: 'p1' });

        expect(result.success).toBe(true);
        // No UPDATE query should have been called (only the success return)
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

// =============================================================================
// handlePartitions — delete
// =============================================================================

describe('handlePartitions — delete', () => {
    it('returns error when id is missing', async () => {
        const result = await handlePartitions({ action: 'delete' });
        expect(result.error).toContain('id is required');
    });

    it('deletes partition and its domains', async () => {
        const result = await handlePartitions({ action: 'delete', id: 'p1' });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM partition_domains'),
            ['p1'],
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM domain_partitions'),
            ['p1'],
        );
    });
});

// =============================================================================
// handlePartitions — addDomain / removeDomain
// =============================================================================

describe('handlePartitions — addDomain & removeDomain', () => {
    it('addDomain returns error when id or domain missing', async () => {
        const r1 = await handlePartitions({ action: 'addDomain', id: 'p1' });
        expect(r1.error).toContain('id and domain are required');

        const r2 = await handlePartitions({ action: 'addDomain', domain: 'test' });
        expect(r2.error).toContain('id and domain are required');
    });

    it('addDomain inserts domain into partition', async () => {
        const result = await handlePartitions({ action: 'addDomain', id: 'p1', domain: 'new-domain' });

        expect(result.success).toBe(true);
        expect(result.partition).toBe('p1');
        expect(result.domain).toBe('new-domain');
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO partition_domains'),
            ['p1', 'new-domain'],
        );
    });

    it('removeDomain returns error when id or domain missing', async () => {
        const result = await handlePartitions({ action: 'removeDomain', id: 'p1' });
        expect(result.error).toContain('id and domain are required');
    });

    it('removeDomain deletes domain from partition', async () => {
        const result = await handlePartitions({ action: 'removeDomain', id: 'p1', domain: 'old-domain' });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM partition_domains'),
            ['p1', 'old-domain'],
        );
    });
});

// =============================================================================
// handlePartitions — bridge management
// =============================================================================

describe('handlePartitions — bridges', () => {
    it('listBridges returns bridges with names', async () => {
        mockQuery.mockResolvedValueOnce([
            { partition_a: 'p1', partition_b: 'p2', created_at: '2024-01-01', name_a: 'Part1', name_b: 'Part2' },
        ]);

        const result = await handlePartitions({ action: 'listBridges' });

        expect(result.bridges).toHaveLength(1);
        expect(result.bridges[0].partition_a).toBe('p1');
        expect(result.bridges[0].name_a).toBe('Part1');
    });

    it('createBridge returns error when ids missing', async () => {
        const result = await handlePartitions({ action: 'createBridge', id: 'p1' });
        expect(result.error).toContain('id and targetPartitionId are required');
    });

    it('createBridge returns error for self-bridge', async () => {
        const result = await handlePartitions({ action: 'createBridge', id: 'p1', targetPartitionId: 'p1' });
        expect(result.error).toContain('Cannot bridge a partition to itself');
    });

    it('createBridge returns error for system partition', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 1 }) // partA is system
            .mockResolvedValueOnce({ system: 0 });

        const result = await handlePartitions({ action: 'createBridge', id: 'sys', targetPartitionId: 'p2' });

        expect(result.error).toContain('system partition');
    });

    it('createBridge orders ids consistently (smaller first)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });

        const result = await handlePartitions({ action: 'createBridge', id: 'z-part', targetPartitionId: 'a-part' });

        expect(result.success).toBe(true);
        expect(result.bridge.partition_a).toBe('a-part');
        expect(result.bridge.partition_b).toBe('z-part');
    });

    it('deleteBridge orders ids consistently', async () => {
        const result = await handlePartitions({ action: 'deleteBridge', id: 'z-part', targetPartitionId: 'a-part' });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM partition_bridges'),
            ['a-part', 'z-part'],
        );
    });

    it('deleteBridge returns error when ids missing', async () => {
        const result = await handlePartitions({ action: 'deleteBridge', id: 'p1' });
        expect(result.error).toContain('id and targetPartitionId are required');
    });
});

// =============================================================================
// handlePartitions — renameDomain
// =============================================================================

describe('handlePartitions — renameDomain', () => {
    it('returns error when oldDomain or newDomain missing', async () => {
        const r1 = await handlePartitions({ action: 'renameDomain', oldDomain: 'old' });
        expect(r1.error).toContain('oldDomain and newDomain are required');

        const r2 = await handlePartitions({ action: 'renameDomain', newDomain: 'new' });
        expect(r2.error).toContain('oldDomain and newDomain are required');
    });

    it('delegates to governance renameDomain', async () => {
        mockRenameDomain.mockResolvedValueOnce({ success: true, renamed: 5 });

        const result = await handlePartitions({
            action: 'renameDomain', oldDomain: 'old-name', newDomain: 'new-name', contributor: 'alice',
        });

        expect(mockRenameDomain).toHaveBeenCalledWith('old-name', 'new-name', 'alice');
        expect(result.success).toBe(true);
    });

    it('defaults contributor to claude', async () => {
        mockRenameDomain.mockResolvedValueOnce({ success: true });

        await handlePartitions({
            action: 'renameDomain', oldDomain: 'a', newDomain: 'b',
        });

        expect(mockRenameDomain).toHaveBeenCalledWith('a', 'b', 'claude');
    });
});

// =============================================================================
// handlePartitions — export / import
// =============================================================================

describe('handlePartitions — export & import', () => {
    it('export returns error when id missing', async () => {
        const result = await handlePartitions({ action: 'export', owner: 'rob' });
        expect(result.error).toContain('id is required');
    });

    it('export returns error when owner missing', async () => {
        const result = await handlePartitions({ action: 'export', id: 'p1' });
        expect(result.error).toContain('owner is required');
    });

    it('export returns error when partition not found', async () => {
        mockExportPartition.mockResolvedValueOnce(null);
        const result = await handlePartitions({ action: 'export', id: 'missing', owner: 'rob' });
        expect(result.error).toContain('Partition not found');
    });

    it('export returns export data on success', async () => {
        const exportData = { partition: { id: 'p1' }, nodes: [], edges: [] };
        mockExportPartition.mockResolvedValueOnce(exportData);

        const result = await handlePartitions({ action: 'export', id: 'p1', owner: 'rob' });

        expect(result).toEqual(exportData);
        expect(mockExportPartition).toHaveBeenCalledWith('p1', 'rob');
    });

    it('import returns error when data missing', async () => {
        const result = await handlePartitions({ action: 'import' });
        expect(result.error).toContain('data is required');
    });

    it('import delegates to importPartition', async () => {
        const data = { partition: { id: 'p1' } };
        mockImportPartition.mockResolvedValueOnce({ success: true, imported: 10 });

        const result = await handlePartitions({ action: 'import', data, overwrite: true });

        expect(mockImportPartition).toHaveBeenCalledWith(data, true);
        expect(result.success).toBe(true);
    });

    it('import returns error on failure', async () => {
        mockImportPartition.mockRejectedValueOnce(new Error('Collision detected'));

        const result = await handlePartitions({ action: 'import', data: {} });

        expect(result.error).toBe('Collision detected');
    });
});

// =============================================================================
// handlePartitions — transient operations
// =============================================================================

describe('handlePartitions — transient', () => {
    it('importTransient returns error when data missing', async () => {
        const result = await handlePartitions({ action: 'importTransient' });
        expect(result.error).toContain('data is required');
    });

    it('importTransient delegates correctly', async () => {
        const data = { partition: { id: 't1' } };
        mockImportTransient.mockResolvedValueOnce({ success: true });

        const result = await handlePartitions({ action: 'importTransient', data });

        expect(mockImportTransient).toHaveBeenCalledWith(data);
        expect(result.success).toBe(true);
    });

    it('approveTransient returns error when id missing', async () => {
        const result = await handlePartitions({ action: 'approveTransient' });
        expect(result.error).toContain('id is required');
    });

    it('approveTransient delegates with bridgeTo', async () => {
        mockApproveTransient.mockResolvedValueOnce({ success: true });

        await handlePartitions({ action: 'approveTransient', id: 't1', bridgeTo: 'main' });

        expect(mockApproveTransient).toHaveBeenCalledWith('t1', 'main');
    });

    it('departTransient returns error when id missing', async () => {
        const result = await handlePartitions({ action: 'departTransient' });
        expect(result.error).toContain('id is required');
    });

    it('departTransient delegates with reason', async () => {
        mockDepartTransient.mockResolvedValueOnce({ success: true });

        await handlePartitions({ action: 'departTransient', id: 't1', reason: 'no longer needed' });

        expect(mockDepartTransient).toHaveBeenCalledWith('t1', 'no longer needed');
    });

    it('visitHistory returns error when id missing', async () => {
        const result = await handlePartitions({ action: 'visitHistory' });
        expect(result.error).toContain('id is required');
    });

    it('visitHistory delegates correctly', async () => {
        mockGetVisitHistory.mockResolvedValueOnce({ visits: [{ at: '2024-01-01' }] });

        const result = await handlePartitions({ action: 'visitHistory', id: 't1' });

        expect(mockGetVisitHistory).toHaveBeenCalledWith('t1');
        expect(result.visits).toHaveLength(1);
    });
});

// =============================================================================
// handlePartitions — unknown action
// =============================================================================

describe('handlePartitions — unknown action', () => {
    it('returns error for unknown action', async () => {
        const result = await handlePartitions({ action: 'frobnicate' });
        expect(result.error).toContain('Unknown action: frobnicate');
    });
});

// =============================================================================
// handleContext — prepare
// =============================================================================

describe('handleContext — prepare', () => {
    it('returns error when message missing', async () => {
        const result = await handleContext({ action: 'prepare' });
        expect(result.error).toContain('message is required');
    });

    it('calls contextPrepare with options', async () => {
        mockContextPrepare.mockResolvedValueOnce({ systemPrompt: 'enriched', nodes: [] });

        const result = await handleContext({
            action: 'prepare',
            message: 'Tell me about synthesis',
            sessionId: 'sess-1',
            maxNodes: 5,
            modelProfile: 'small',
        });

        expect(mockContextPrepare).toHaveBeenCalledWith('Tell me about synthesis', 'sess-1', {
            maxNodes: 5,
            budget: undefined,
            modelProfile: 'small',
        });
        expect(result.systemPrompt).toBe('enriched');
    });
});

// =============================================================================
// handleContext — update
// =============================================================================

describe('handleContext — update', () => {
    it('returns error when sessionId missing', async () => {
        const result = await handleContext({ action: 'update', message: 'response' });
        expect(result.error).toContain('sessionId is required');
    });

    it('returns error when message missing', async () => {
        const result = await handleContext({ action: 'update', sessionId: 'sess-1' });
        expect(result.error).toContain('message');
    });

    it('calls contextUpdate with sessionId and message', async () => {
        mockContextUpdate.mockResolvedValueOnce({ feedback: { boosted: [] } });

        const result = await handleContext({
            action: 'update', sessionId: 'sess-1', message: 'LLM response text',
        });

        expect(mockContextUpdate).toHaveBeenCalledWith('sess-1', 'LLM response text');
        expect(result.feedback).toBeDefined();
    });
});

// =============================================================================
// handleContext — session
// =============================================================================

describe('handleContext — session', () => {
    it('returns error when sessionId missing', async () => {
        const result = await handleContext({ action: 'session' });
        expect(result.error).toContain('sessionId is required');
    });

    it('returns error when session not found', async () => {
        mockGetSession.mockReturnValueOnce(null);
        const result = await handleContext({ action: 'session', sessionId: 'gone' });
        expect(result.error).toContain('Session not found');
    });

    it('returns session summary', async () => {
        mockGetSession.mockReturnValueOnce({
            id: 's1',
            createdAt: '2024-01-01',
            lastActiveAt: '2024-01-02',
            turnCount: 3,
            topics: ['ai', 'synthesis', 'graphs'],
            domains: ['science'],
            history: [{ role: 'user', content: 'hi' }],
            compressedUpTo: 0,
            compressedHistory: null,
            lastContext: { nodes: 2 },
            lastFeedback: { boosted: ['n1'] },
        });

        const result = await handleContext({ action: 'session', sessionId: 's1' });

        expect(result.id).toBe('s1');
        expect(result.turnCount).toBe(3);
        expect(result.topics).toEqual(['ai', 'synthesis', 'graphs']);
        expect(result.historyLength).toBe(1);
        expect(result.hasCompressedHistory).toBe(false);
    });
});

// =============================================================================
// handleContext — sessions, delete, budgets
// =============================================================================

describe('handleContext — sessions, delete, budgets', () => {
    it('sessions returns session list', async () => {
        mockListSessions.mockReturnValueOnce([{ id: 's1' }, { id: 's2' }]);
        const result = await handleContext({ action: 'sessions' });
        expect(result.sessions).toHaveLength(2);
    });

    it('delete returns error when sessionId missing', async () => {
        const result = await handleContext({ action: 'delete' });
        expect(result.error).toContain('sessionId is required');
    });

    it('delete calls deleteSession', async () => {
        mockDeleteSession.mockReturnValueOnce(true);
        const result = await handleContext({ action: 'delete', sessionId: 's1' });
        expect(result.success).toBe(true);
        expect(result.sessionId).toBe('s1');
    });

    it('budgets returns budget config', async () => {
        mockGetBudgets.mockReturnValueOnce({ small: 2000, medium: 4000 });
        const result = await handleContext({ action: 'budgets' });
        expect(result.small).toBe(2000);
    });
});

// =============================================================================
// handleContext — metrics
// =============================================================================

describe('handleContext — metrics', () => {
    it('returns error when sessionId missing', async () => {
        const result = await handleContext({ action: 'metrics' });
        expect(result.error).toContain('sessionId is required');
    });

    it('returns error when session not found', async () => {
        mockGetSession.mockReturnValueOnce(null);
        const result = await handleContext({ action: 'metrics', sessionId: 'gone' });
        expect(result.error).toContain('Session not found');
    });

    it('computes averaged metrics from session data', async () => {
        mockGetSession.mockReturnValueOnce({
            id: 's1',
            turnCount: 2,
            metrics: {
                qualityScores: [0.8, 0.9],
                knowledgeUtilization: [0.6, 0.7],
                responseGrounding: [0.5, 0.8],
                topicCoverage: [0.9, 1.0],
                budgetEfficiency: [0.7, 0.8],
            },
            lastFeedback: { boosted: ['n1', 'n2'] },
        });

        const result = await handleContext({ action: 'metrics', sessionId: 's1' });

        expect(result.sessionId).toBe('s1');
        expect(result.turnCount).toBe(2);
        expect(result.avgQualityScore).toBe(0.85);
        expect(result.avgKnowledgeUtilization).toBe(0.65);
        expect(result.feedbackBoosts).toBe(2);
        expect(result.perTurn).toHaveLength(2);
        expect(result.perTurn[0].turn).toBe(1);
        expect(result.perTurn[0].quality).toBe(0.8);
    });

    it('returns null averages when no metrics', async () => {
        mockGetSession.mockReturnValueOnce({
            id: 's1',
            turnCount: 0,
            metrics: {
                qualityScores: [],
                knowledgeUtilization: [],
                responseGrounding: [],
                topicCoverage: [],
                budgetEfficiency: [],
            },
            lastFeedback: null,
        });

        const result = await handleContext({ action: 'metrics', sessionId: 's1' });

        expect(result.avgQualityScore).toBeNull();
        expect(result.feedbackBoosts).toBe(0);
    });
});

// =============================================================================
// handleContext — insights
// =============================================================================

describe('handleContext — insights', () => {
    it('returns insights from session_insights table', async () => {
        mockQuery.mockResolvedValueOnce([
            { topic: 'synthesis', weight: 1.5, usage_count: 10, domain: 'science', last_seen: '2024-01-01' },
            { topic: 'graphs', weight: 1.2, usage_count: 8, domain: 'math', last_seen: '2024-01-02' },
        ]);

        const result = await handleContext({ action: 'insights' });

        expect(result.count).toBe(2);
        expect(result.insights[0].topic).toBe('synthesis');
        expect(result.insights[0].usageCount).toBe(10);
        expect(result.insights[1].domain).toBe('math');
    });
});

// =============================================================================
// handleContext — unknown action
// =============================================================================

describe('handleContext — unknown action', () => {
    it('returns error for unknown action', async () => {
        const result = await handleContext({ action: 'invalid' });
        expect(result.error).toContain('Unknown action: invalid');
    });
});
