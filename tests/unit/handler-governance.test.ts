/**
 * Unit tests for handlers/governance.ts —
 * handleStats, handlePending, handleComplete, handleSynthesisEngine.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCheckPartitionHealth = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockGetPendingRequests = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockCompleteRequest = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCountFilter = jest.fn((expr: string) => `COUNT(CASE WHEN ${expr} THEN 1 END)`);
const mockWithinDays = jest.fn((col: string, param: string) => `${col} >= datetime('now', '-' || ${param} || ' days')`);
const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key-123');
const mockContextPrepare = jest.fn<() => Promise<any>>().mockResolvedValue({ systemPrompt: 'test' });
const mockContextUpdate = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockGetSession = jest.fn<() => any>().mockReturnValue(null);
const mockListSessions = jest.fn<() => any[]>().mockReturnValue([]);
const mockDeleteSession = jest.fn<() => void>();
const mockGetBudgets = jest.fn<() => any>().mockReturnValue({});

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    checkPartitionHealth: mockCheckPartitionHealth,
    getPendingRequests: mockGetPendingRequests,
    completeRequest: mockCompleteRequest,
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
    exportPartition: jest.fn(),
    importPartition: jest.fn(),
    importTransient: jest.fn(),
    approveTransient: jest.fn(),
    departTransient: jest.fn(),
    getVisitHistory: jest.fn(),
}));

jest.unstable_mockModule('../../context-engine.js', () => ({
    prepare: mockContextPrepare,
    update: mockContextUpdate,
    getSession: mockGetSession,
    listSessions: mockListSessions,
    deleteSession: mockDeleteSession,
    getBudgets: mockGetBudgets,
}));

// Mock lifecycle module (used by handleStats dynamically)
jest.unstable_mockModule('../../core/lifecycle.js', () => ({
    getMetabolism: jest.fn<() => Promise<any>>().mockResolvedValue({ births: 0, deaths: 0 }),
}));

const { handleStats, handlePending, handleComplete, handleSynthesisEngine } =
    await import('../../handlers/governance.js');

// Mock global fetch
const mockFetch = jest.fn<() => Promise<any>>();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCheckPartitionHealth.mockResolvedValue([]);
    mockGetPendingRequests.mockResolvedValue([]);
    mockCompleteRequest.mockResolvedValue(true);
    mockCountFilter.mockImplementation((expr: string) => `COUNT(CASE WHEN ${expr} THEN 1 END)`);
    mockWithinDays.mockImplementation((col: string, _param: string) => `${col} >= ...`);
    mockGetSecurityKey.mockResolvedValue('test-key-123');
    mockContextPrepare.mockResolvedValue({ systemPrompt: 'test' });
    mockContextUpdate.mockResolvedValue({});
    mockGetSession.mockReturnValue(null);
    mockListSessions.mockReturnValue([]);
    mockDeleteSession.mockReturnValue(undefined as any);
    mockGetBudgets.mockReturnValue({});
    mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
    });
});

// =============================================================================
// handleStats
// =============================================================================

describe('handleStats', () => {
    const makeNodeCounts = () => ({
        total: '50',
        seeds: '30',
        breakthroughs: '5',
        knowledge: '35',
        abstraction: '15',
        avg_weight: '1.25',
        avg_salience: '0.8',
        avg_specificity: '2.1',
    });
    const makeCycleStats = () => ({
        total_cycles: '20',
        children_created: '10',
        knowledge_children: '7',
        abstraction_children: '3',
        avg_resonance: '0.65',
    });

    it('returns parsed node counts and cycle stats', async () => {
        mockQueryOne
            .mockResolvedValueOnce(makeNodeCounts())
            .mockResolvedValueOnce(makeCycleStats())
            .mockResolvedValueOnce({ // feedback counts
                total: '5', useful: '3', not_useful: '1', harmful: '0',
                nodes_covered: '4', avg_weight_change: '0.05',
            })
            .mockResolvedValueOnce({ // domain concentration
                total: null,
            });

        mockQuery.mockResolvedValue([]); // domain concentration rows

        const result = await handleStats({ days: 7 });

        expect(result.domain).toBe('all');
        expect(result.periodDays).toBe(7);
        expect(result.nodes.total).toBe(50);
        expect(result.nodes.seeds).toBe(30);
        expect(result.nodes.breakthroughs).toBe(5);
        expect(result.nodes.avgWeight).toBe(1.25);
        expect(result.synthesisCycles.total).toBe(20);
        expect(result.synthesisCycles.childrenCreated).toBe(10);
        expect(result.synthesisCycles.knowledgeRatio).toBeCloseTo(0.7);
        expect(result.feedback.total).toBe(5);
    });

    it('returns zeros when no data', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ total: '0', seeds: '0', breakthroughs: '0', knowledge: '0', abstraction: '0', avg_weight: null, avg_salience: null, avg_specificity: null })
            .mockResolvedValueOnce({ total_cycles: '0', children_created: '0', knowledge_children: '0', abstraction_children: '0', avg_resonance: null })
            .mockResolvedValue(null);

        mockQuery.mockResolvedValue([]);

        const result = await handleStats({});

        expect(result.nodes.total).toBe(0);
        expect(result.nodes.avgWeight).toBe(0);
        expect(result.synthesisCycles.knowledgeRatio).toBe(0);
        expect(result.feedback.total).toBe(0);
    });

    it('passes domain filter when specified', async () => {
        mockQueryOne.mockResolvedValue({
            total: '5', seeds: '5', breakthroughs: '0', knowledge: '5', abstraction: '0',
            avg_weight: '1.0', avg_salience: '0.5', avg_specificity: '1.5',
            total_cycles: '2', children_created: '1', knowledge_children: '1', abstraction_children: '0',
            avg_resonance: '0.5',
        });
        mockQuery.mockResolvedValue([]);

        const result = await handleStats({ domain: 'science', days: 7 });

        expect(result.domain).toBe('science');
        // Node count query should include domain filter
        const nodeCountCall = (mockQueryOne.mock.calls as any[])[0];
        expect(nodeCountCall[0]).toContain('domain');
    });

    it('includes partition health', async () => {
        mockQueryOne.mockResolvedValue({
            total: '0', seeds: '0', breakthroughs: '0', knowledge: '0', abstraction: '0',
            avg_weight: null, avg_salience: null, avg_specificity: null,
            total_cycles: '0', children_created: '0', knowledge_children: '0', abstraction_children: '0', avg_resonance: null,
        });
        mockQuery.mockResolvedValue([]);
        mockCheckPartitionHealth.mockResolvedValue([{ partition: 'main', healthy: true }]);

        const result = await handleStats({});

        expect(result.partitionHealth).toEqual([{ partition: 'main', healthy: true }]);
    });
});

// =============================================================================
// handlePending
// =============================================================================

describe('handlePending', () => {
    it('returns count=0 and empty requests when no pending', async () => {
        mockGetPendingRequests.mockResolvedValue([]);

        const result = await handlePending();

        expect(result.count).toBe(0);
        expect(result.requests).toHaveLength(0);
    });

    it('maps pending requests to simplified shape', async () => {
        mockGetPendingRequests.mockResolvedValue([
            { id: 'req-1', type: 'research', params: { topic: 'AI' }, queuedAt: '2024-01-01T00:00:00Z', status: 'pending' },
            { id: 'req-2', type: 'voice', params: { nodeId: 'n-1' }, queuedAt: '2024-01-01T01:00:00Z', status: 'pending' },
        ]);

        const result = await handlePending();

        expect(result.count).toBe(2);
        expect(result.requests[0].id).toBe('req-1');
        expect(result.requests[0].type).toBe('research');
        expect(result.requests[0].params).toEqual({ topic: 'AI' });
        expect(result.requests[0].queuedAt).toBe('2024-01-01T00:00:00Z');
    });
});

// =============================================================================
// handleComplete
// =============================================================================

describe('handleComplete', () => {
    it('returns success=true when request completed', async () => {
        mockCompleteRequest.mockResolvedValue(true);

        const result = await handleComplete({ requestId: 'req-1', result: { nodes: [1, 2] } });

        expect(result.success).toBe(true);
        expect(result.requestId).toBe('req-1');
    });

    it('returns success=false when request not found', async () => {
        mockCompleteRequest.mockResolvedValue(false);

        const result = await handleComplete({ requestId: 'nonexistent', result: null });

        expect(result.success).toBe(false);
        expect(result.requestId).toBe('nonexistent');
    });
});

// =============================================================================
// handleSynthesisEngine
// =============================================================================

describe('handleSynthesisEngine', () => {
    it('returns synthesis status from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ running: true, cycles: 5 }),
        });

        const result = await handleSynthesisEngine({ action: 'status' });

        expect(result.running).toBe(true);
        expect(result.cycles).toBe(5);
        const [url] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/api/synthesis/status');
    });

    it('returns discoveries list', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ discoveries: [{ id: 'd1' }, { id: 'd2' }] }),
        });

        const result = await handleSynthesisEngine({ action: 'discoveries' });

        expect(result.count).toBe(2);
        expect(result.discoveries).toHaveLength(2);
    });

    it('returns error when API not responding', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

        const result = await handleSynthesisEngine({ action: 'status' });

        expect(result.error).toContain('503');
    });

    it('returns error for clear action when node IDs missing', async () => {
        const result = await handleSynthesisEngine({ action: 'clear' });
        expect(result.error).toContain('required');
    });

    it('sends POST for start action', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ started: true }),
        });

        const result = await handleSynthesisEngine({ action: 'start', domain: 'science', maxCycles: 5 });

        const [url, init] = mockFetch.mock.calls[0] as any[];
        expect(url).toContain('/api/synthesis/start');
        expect(init.method).toBe('POST');
        const body = JSON.parse(init.body);
        expect(body.domain).toBe('science');
        expect(body.maxCycles).toBe(5);
        expect(result.started).toBe(true);
    });

    it('includes x-podbit-key security header', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
        mockGetSecurityKey.mockResolvedValue('secure-key-xyz');

        await handleSynthesisEngine({ action: 'status' });

        const [, init] = mockFetch.mock.calls[0] as any[];
        // Headers object — check it contains the security key
        const headers = init.headers;
        // Headers can be a Headers object or plain object
        const keyValue = headers instanceof Headers
            ? headers.get('x-podbit-key')
            : (headers as any)['x-podbit-key'];
        expect(keyValue).toBe('secure-key-xyz');
    });
});
