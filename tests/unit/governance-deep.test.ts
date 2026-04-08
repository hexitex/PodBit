/**
 * Deep unit tests for handlers/governance.ts —
 * Covers uncovered branches: handleStats (with/without domain, feedback error path,
 * knowledgeRatio zero-division, lifecycle error), handlePending, handleComplete,
 * handleSynthesisEngine (all action branches + error responses),
 * securedFetch (content-type logic), and remaining edge cases in handlePartitions
 * and handleContext.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCheckPartitionHealth = jest.fn<() => Promise<any>>().mockResolvedValue({ healthy: true });
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
const mockGetPendingRequests = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockCompleteRequest = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetMetabolism = jest.fn<() => Promise<any>>().mockResolvedValue({ births: 5, deaths: 2 });

// Global fetch mock
const mockFetch = jest.fn<() => Promise<any>>();
(globalThis as any).fetch = mockFetch;

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
    getMetabolism: mockGetMetabolism,
}));

const { handleStats, handlePending, handleComplete, handleSynthesisEngine, handlePartitions, handleContext } =
    await import('../../handlers/governance.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockFetch.mockReset();
});

/* ================================================================== */
/* handleStats                                                         */
/* ================================================================== */

describe('handleStats', () => {
    function setupStatsDefaults(overrides: { domain?: string } = {}) {
        // nodeCounts
        mockQueryOne.mockResolvedValueOnce({
            total: '100', seeds: '60', breakthroughs: '5',
            knowledge: '70', abstraction: '30',
            avg_weight: '1.5', avg_salience: '0.8', avg_specificity: '0.6',
        });
        // cycleStats
        mockQueryOne.mockResolvedValueOnce({
            total_cycles: '20', children_created: '10',
            knowledge_children: '7', abstraction_children: '3',
            avg_resonance: '0.65',
        });
        // feedbackCounts
        mockQueryOne.mockResolvedValueOnce({
            total: '15', useful: '10', not_useful: '3', harmful: '2',
            nodes_covered: '8', avg_weight_change: '0.12',
        });
        // domainConcentration query
        mockQuery.mockResolvedValueOnce([
            { domain: 'science', cnt: '40' },
            { domain: 'math', cnt: '20' },
        ]);
        // checkPartitionHealth
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        // getMetabolism
        mockGetMetabolism.mockResolvedValueOnce({ births: 5, deaths: 2 });
    }

    it('returns full stats without domain filter', async () => {
        setupStatsDefaults();

        const result = await handleStats({ days: 7 });

        expect(result.domain).toBe('all');
        expect(result.periodDays).toBe(7);
        expect(result.nodes.total).toBe(100);
        expect(result.nodes.seeds).toBe(60);
        expect(result.nodes.breakthroughs).toBe(5);
        expect(result.nodes.avgWeight).toBe(1.5);
        expect(result.synthesisCycles.total).toBe(20);
        expect(result.synthesisCycles.childrenCreated).toBe(10);
        expect(result.synthesisCycles.knowledgeRatio).toBe(0.7);
        expect(result.feedback.total).toBe(15);
        expect(result.feedback.useful).toBe(10);
        expect(result.feedback.notUseful).toBe(3);
        expect(result.feedback.harmful).toBe(2);
        expect(result.feedback.nodesCovered).toBe(8);
        expect(result.feedback.avgWeightChange).toBeCloseTo(0.12);
        expect(result.domainConcentration.topDomains).toHaveLength(2);
        expect(result.domainConcentration.totalRecentNodes).toBe(60);
        expect(result.partitionHealth).toEqual({ healthy: true });
        expect(result.metabolism).toEqual({ births: 5, deaths: 2 });
    });

    it('returns stats with domain filter', async () => {
        setupStatsDefaults({ domain: 'science' });

        const result = await handleStats({ domain: 'science', days: 14 });

        expect(result.domain).toBe('science');
        expect(result.periodDays).toBe(14);
        // nodeCounts query should have domain param
        const nodeCountCall = mockQueryOne.mock.calls[0];
        expect((nodeCountCall[1] as any[])).toEqual(['science']);
    });

    it('uses default days=7 when not provided', async () => {
        setupStatsDefaults();

        const result = await handleStats({});

        expect(result.periodDays).toBe(7);
    });

    it('handles zero children_created (knowledgeRatio = 0)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: '10', seeds: '5', breakthroughs: '0',
                knowledge: '5', abstraction: '5',
                avg_weight: null, avg_salience: null, avg_specificity: null,
            })
            .mockResolvedValueOnce({
                total_cycles: '5', children_created: '0',
                knowledge_children: '0', abstraction_children: '0',
                avg_resonance: null,
            })
            .mockResolvedValueOnce({
                total: '0', useful: '0', not_useful: '0', harmful: '0',
                nodes_covered: '0', avg_weight_change: null,
            });
        mockQuery.mockResolvedValueOnce([]);
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        mockGetMetabolism.mockResolvedValueOnce(null);

        const result = await handleStats({});

        expect(result.synthesisCycles.knowledgeRatio).toBe(0);
        expect(result.nodes.avgWeight).toBe(0);
        expect(result.nodes.avgSalience).toBe(0);
        expect(result.synthesisCycles.avgResonance).toBe(0);
        expect(result.feedback.avgWeightChange).toBe(0);
    });

    it('handles feedback table error gracefully', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: '10', seeds: '5', breakthroughs: '0',
                knowledge: '5', abstraction: '5',
                avg_weight: '1.0', avg_salience: '0.5', avg_specificity: '0.3',
            })
            .mockResolvedValueOnce({
                total_cycles: '3', children_created: '2',
                knowledge_children: '1', abstraction_children: '1',
                avg_resonance: '0.5',
            })
            .mockRejectedValueOnce(new Error('no such table: node_feedback'));

        mockQuery.mockResolvedValueOnce([]);
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        mockGetMetabolism.mockResolvedValueOnce(null);

        const result = await handleStats({});

        // Feedback should fall back to defaults
        expect(result.feedback.total).toBe(0);
        expect(result.feedback.useful).toBe(0);
        expect(result.feedback.notUseful).toBe(0);
        expect(result.feedback.harmful).toBe(0);
        expect(result.feedback.nodesCovered).toBe(0);
        expect(result.feedback.avgWeightChange).toBe(0);
    });

    it('handles lifecycle metabolism failure gracefully', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: '1', seeds: '1', breakthroughs: '0',
                knowledge: '1', abstraction: '0',
                avg_weight: '1.0', avg_salience: '0.5', avg_specificity: '0.3',
            })
            .mockResolvedValueOnce({
                total_cycles: '0', children_created: '0',
                knowledge_children: '0', abstraction_children: '0',
                avg_resonance: null,
            })
            .mockResolvedValueOnce({
                total: '0', useful: '0', not_useful: '0', harmful: '0',
                nodes_covered: '0', avg_weight_change: null,
            });
        mockQuery.mockResolvedValueOnce([]);
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        mockGetMetabolism.mockRejectedValueOnce(new Error('lifecycle not ready'));

        const result = await handleStats({});

        // metabolism should be null on failure
        expect(result.metabolism).toBeNull();
    });

    it('getDomainConcentration handles zero total', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: '0', seeds: '0', breakthroughs: '0',
                knowledge: '0', abstraction: '0',
                avg_weight: null, avg_salience: null, avg_specificity: null,
            })
            .mockResolvedValueOnce({
                total_cycles: '0', children_created: '0',
                knowledge_children: '0', abstraction_children: '0',
                avg_resonance: null,
            })
            .mockResolvedValueOnce({
                total: '0', useful: '0', not_useful: '0', harmful: '0',
                nodes_covered: '0', avg_weight_change: null,
            });
        // domainConcentration returns empty
        mockQuery.mockResolvedValueOnce([]);
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        mockGetMetabolism.mockResolvedValueOnce(null);

        const result = await handleStats({});

        expect(result.domainConcentration.totalRecentNodes).toBe(0);
        expect(result.domainConcentration.topDomains).toHaveLength(0);
    });

    it('getDomainConcentration computes ratios correctly', async () => {
        mockQueryOne
            .mockResolvedValueOnce({
                total: '0', seeds: '0', breakthroughs: '0',
                knowledge: '0', abstraction: '0',
                avg_weight: null, avg_salience: null, avg_specificity: null,
            })
            .mockResolvedValueOnce({
                total_cycles: '0', children_created: '0',
                knowledge_children: '0', abstraction_children: '0',
                avg_resonance: null,
            })
            .mockResolvedValueOnce({
                total: '0', useful: '0', not_useful: '0', harmful: '0',
                nodes_covered: '0', avg_weight_change: null,
            });
        mockQuery.mockResolvedValueOnce([
            { domain: 'a', cnt: '75' },
            { domain: 'b', cnt: '25' },
        ]);
        mockCheckPartitionHealth.mockResolvedValueOnce({ healthy: true });
        mockGetMetabolism.mockResolvedValueOnce(null);

        const result = await handleStats({});

        expect(result.domainConcentration.totalRecentNodes).toBe(100);
        expect(result.domainConcentration.topDomains[0].ratio).toBe(0.75);
        expect(result.domainConcentration.topDomains[1].ratio).toBe(0.25);
    });
});

/* ================================================================== */
/* handlePending                                                       */
/* ================================================================== */

describe('handlePending', () => {
    it('returns empty when no pending requests', async () => {
        mockGetPendingRequests.mockResolvedValueOnce([]);

        const result = await handlePending();

        expect(result.count).toBe(0);
        expect(result.requests).toEqual([]);
    });

    it('returns formatted pending requests', async () => {
        mockGetPendingRequests.mockResolvedValueOnce([
            { id: 'r1', type: 'seed', params: { content: 'test' }, queuedAt: '2024-01-01' },
            { id: 'r2', type: 'query', params: { text: 'search' }, queuedAt: '2024-01-02' },
        ]);

        const result = await handlePending();

        expect(result.count).toBe(2);
        expect(result.requests[0].id).toBe('r1');
        expect(result.requests[0].type).toBe('seed');
        expect(result.requests[0].params).toEqual({ content: 'test' });
        expect(result.requests[1].queuedAt).toBe('2024-01-02');
    });
});

/* ================================================================== */
/* handleComplete                                                      */
/* ================================================================== */

describe('handleComplete', () => {
    it('completes a request and returns success', async () => {
        mockCompleteRequest.mockResolvedValueOnce(true);

        const result = await handleComplete({ requestId: 'r1', result: 'done' });

        expect(result.success).toBe(true);
        expect(result.requestId).toBe('r1');
        expect(mockCompleteRequest).toHaveBeenCalledWith('r1', 'done');
    });

    it('returns false when completion fails', async () => {
        mockCompleteRequest.mockResolvedValueOnce(false);

        const result = await handleComplete({ requestId: 'missing' });

        expect(result.success).toBe(false);
        expect(result.requestId).toBe('missing');
    });
});

/* ================================================================== */
/* handleSynthesisEngine                                               */
/* ================================================================== */

describe('handleSynthesisEngine', () => {
    function mockFetchOk(data: any) {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => data,
        });
    }

    function mockFetchFail(status = 500) {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status,
            json: async () => ({}),
        });
    }

    // -- status --
    describe('action: status', () => {
        it('returns synthesis status', async () => {
            mockFetchOk({ running: true, cyclesCompleted: 10 });

            const result = await handleSynthesisEngine({ action: 'status' });

            expect(result.running).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://127.0.0.1:3000/api/synthesis/status',
                expect.objectContaining({ headers: expect.any(Headers) }),
            );
        });

        it('returns error on non-ok response', async () => {
            mockFetchFail(503);

            const result = await handleSynthesisEngine({ action: 'status' });

            expect(result.error).toContain('503');
        });
    });

    // -- discoveries --
    describe('action: discoveries', () => {
        it('returns discoveries with count', async () => {
            mockFetchOk({ discoveries: [{ id: 'd1' }, { id: 'd2' }] });

            const result = await handleSynthesisEngine({ action: 'discoveries' });

            expect(result.count).toBe(2);
            expect(result.discoveries).toHaveLength(2);
        });

        it('handles missing discoveries array', async () => {
            mockFetchOk({});

            const result = await handleSynthesisEngine({ action: 'discoveries' });

            expect(result.count).toBe(0);
            expect(result.discoveries).toEqual([]);
        });

        it('returns error on failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'discoveries' });

            expect(result.error).toContain('500');
        });
    });

    // -- clear --
    describe('action: clear', () => {
        it('returns error when nodeAId or nodeBId missing', async () => {
            const r1 = await handleSynthesisEngine({ action: 'clear', nodeAId: 'a' });
            expect(r1.error).toContain('nodeAId and nodeBId are required');

            const r2 = await handleSynthesisEngine({ action: 'clear', nodeBId: 'b' });
            expect(r2.error).toContain('nodeAId and nodeBId are required');
        });

        it('clears discovery pair', async () => {
            mockFetchOk({ cleared: true });

            const result = await handleSynthesisEngine({ action: 'clear', nodeAId: 'a', nodeBId: 'b' });

            expect(result.cleared).toBe(true);
            // Verify POST with body
            const fetchCall = mockFetch.mock.calls[0];
            const init = fetchCall[1] as any;
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body)).toEqual({ nodeAId: 'a', nodeBId: 'b' });
        });

        it('returns error on failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'clear', nodeAId: 'a', nodeBId: 'b' });

            expect(result.error).toContain('500');
        });
    });

    // -- start --
    describe('action: start', () => {
        it('starts synthesis with optional params', async () => {
            mockFetchOk({ started: true });

            const result = await handleSynthesisEngine({
                action: 'start', mode: 'full', domain: 'science', maxCycles: 10,
            });

            expect(result.started).toBe(true);
            const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
            expect(body.mode).toBe('full');
            expect(body.domain).toBe('science');
            expect(body.maxCycles).toBe(10);
        });

        it('starts synthesis with empty body when no params', async () => {
            mockFetchOk({ started: true });

            await handleSynthesisEngine({ action: 'start' });

            const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
            expect(body).toEqual({});
        });

        it('returns error on failure', async () => {
            mockFetchFail(502);

            const result = await handleSynthesisEngine({ action: 'start' });

            expect(result.error).toContain('502');
        });
    });

    // -- stop --
    describe('action: stop', () => {
        it('stops synthesis', async () => {
            mockFetchOk({ stopped: true });

            const result = await handleSynthesisEngine({ action: 'stop' });

            expect(result.stopped).toBe(true);
            const init = mockFetch.mock.calls[0][1] as any;
            expect(init.method).toBe('POST');
        });

        it('returns error on failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'stop' });

            expect(result.error).toContain('500');
        });
    });

    // -- history --
    describe('action: history', () => {
        it('returns history with default limit', async () => {
            mockFetchOk({ history: [{ id: 'h1' }] });

            const result = await handleSynthesisEngine({ action: 'history' });

            expect(result.history).toHaveLength(1);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toContain('limit=20');
        });

        it('uses custom limit', async () => {
            mockFetchOk({ history: [] });

            await handleSynthesisEngine({ action: 'history', limit: 50 });

            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toContain('limit=50');
        });

        it('returns error on failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'history' });

            expect(result.error).toContain('500');
        });
    });

    // -- cycle_start --
    describe('action: cycle_start', () => {
        it('returns error for missing cycleType', async () => {
            const result = await handleSynthesisEngine({ action: 'cycle_start' });
            expect(result.error).toContain('cycleType is required');
        });

        it('returns error for invalid cycleType', async () => {
            const result = await handleSynthesisEngine({ action: 'cycle_start', cycleType: 'invalid' });
            expect(result.error).toContain('cycleType is required');
            expect(result.error).toContain('synthesis');
        });

        it('starts a valid cycle', async () => {
            mockFetchOk({ started: true, cycle: 'voicing' });

            const result = await handleSynthesisEngine({ action: 'cycle_start', cycleType: 'voicing' });

            expect(result.started).toBe(true);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toContain('/api/cycles/voicing/start');
        });

        it('accepts all valid cycle types', async () => {
            const validTypes = ['synthesis', 'validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing'];
            for (const cycleType of validTypes) {
                mockFetchOk({ started: true });
                const result = await handleSynthesisEngine({ action: 'cycle_start', cycleType });
                expect(result.started).toBe(true);
            }
        });

        it('returns error on API failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'cycle_start', cycleType: 'synthesis' });

            expect(result.error).toContain('500');
        });
    });

    // -- cycle_stop --
    describe('action: cycle_stop', () => {
        it('returns error for missing cycleType', async () => {
            const result = await handleSynthesisEngine({ action: 'cycle_stop' });
            expect(result.error).toContain('cycleType is required');
        });

        it('returns error for invalid cycleType', async () => {
            const result = await handleSynthesisEngine({ action: 'cycle_stop', cycleType: 'bogus' });
            expect(result.error).toContain('cycleType is required');
        });

        it('stops a valid cycle', async () => {
            mockFetchOk({ stopped: true });

            const result = await handleSynthesisEngine({ action: 'cycle_stop', cycleType: 'tensions' });

            expect(result.stopped).toBe(true);
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toContain('/api/cycles/tensions/stop');
            const init = mockFetch.mock.calls[0][1] as any;
            expect(init.method).toBe('POST');
        });

        it('returns error on API failure', async () => {
            mockFetchFail(503);

            const result = await handleSynthesisEngine({ action: 'cycle_stop', cycleType: 'research' });

            expect(result.error).toContain('503');
        });
    });

    // -- cycle_status --
    describe('action: cycle_status', () => {
        it('returns cycle status', async () => {
            mockFetchOk({ cycles: { synthesis: { running: true } } });

            const result = await handleSynthesisEngine({ action: 'cycle_status' });

            expect(result.cycles).toBeDefined();
            const url = mockFetch.mock.calls[0][0] as string;
            expect(url).toContain('/api/cycles/status');
        });

        it('returns error on failure', async () => {
            mockFetchFail(500);

            const result = await handleSynthesisEngine({ action: 'cycle_status' });

            expect(result.error).toContain('500');
        });
    });

    // -- default --
    describe('action: unknown', () => {
        it('returns error for unknown action', async () => {
            const result = await handleSynthesisEngine({ action: 'frobnicate' });
            expect(result.error).toContain('Unknown action: frobnicate');
        });
    });

    // -- securedFetch behavior --
    describe('securedFetch — header logic', () => {
        it('sets x-podbit-key header', async () => {
            mockGetSecurityKey.mockResolvedValueOnce('my-secret');
            mockFetchOk({ ok: true });

            await handleSynthesisEngine({ action: 'status' });

            const init = mockFetch.mock.calls[0][1] as any;
            const headers = init.headers as Headers;
            expect(headers.get('x-podbit-key')).toBe('my-secret');
        });

        it('sets content-type for POST without explicit content-type (stop action)', async () => {
            mockFetchOk({ stopped: true });

            await handleSynthesisEngine({ action: 'stop' });

            const init = mockFetch.mock.calls[0][1] as any;
            const headers = init.headers as Headers;
            expect(headers.get('content-type')).toBe('application/json');
        });

        it('preserves explicit content-type header (clear action)', async () => {
            mockFetchOk({ cleared: true });

            await handleSynthesisEngine({ action: 'clear', nodeAId: 'a', nodeBId: 'b' });

            const init = mockFetch.mock.calls[0][1] as any;
            const headers = init.headers as Headers;
            expect(headers.get('content-type')).toBe('application/json');
        });
    });
});

/* ================================================================== */
/* handlePartitions — additional edge cases                            */
/* ================================================================== */

describe('handlePartitions — additional edge cases', () => {
    it('list handles invalid allowed_cycles JSON', async () => {
        mockQuery
            .mockResolvedValueOnce([
                {
                    id: 'p1', name: 'Bad JSON', description: null,
                    created_at: '2024-01-01', system: 0, transient: 0,
                    state: null, source_project: null, imported_at: null,
                    allowed_cycles: '{invalid json',
                },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0].allowed_cycles).toBeNull();
    });

    it('list handles transient partition without explicit state (defaults to active)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                {
                    id: 't1', name: 'Transient No State', description: null,
                    created_at: '2024-01-01', system: 0, transient: 1,
                    state: null, source_project: null, imported_at: null,
                    allowed_cycles: null,
                },
            ])
            .mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'list' });

        expect(result.partitions[0].transient).toBe(true);
        expect(result.partitions[0].state).toBe('active');
    });

    it('get handles system=1 partition', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'sys', name: 'System', description: null,
            created_at: '2024-01-01', system: 1, allowed_cycles: '["synthesis"]',
        });
        mockQuery.mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'get', id: 'sys' });

        expect(result.system).toBe(true);
        expect(result.allowed_cycles).toEqual(['synthesis']);
    });

    it('get handles invalid allowed_cycles JSON', async () => {
        mockQueryOne.mockResolvedValueOnce({
            id: 'p1', name: 'Bad', description: null,
            created_at: '2024-01-01', system: 0, allowed_cycles: 'broken{',
        });
        mockQuery.mockResolvedValueOnce([]);

        const result = await handlePartitions({ action: 'get', id: 'p1' });

        expect(result.allowed_cycles).toBeNull();
    });

    it('update with system flag', async () => {
        const result = await handlePartitions({
            action: 'update', id: 'p1', system: true,
        });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('system'),
            [1, 'p1'],
        );
    });

    it('update with allowed_cycles=null clears cycles and clears cache', async () => {
        const result = await handlePartitions({
            action: 'update', id: 'p1', allowed_cycles: null,
        });

        expect(result.success).toBe(true);
        expect(mockClearCycleExclusionCache).toHaveBeenCalled();
        // Param should be null for DB
        const callArgs = mockQuery.mock.calls[0][1] as any[];
        expect(callArgs[0]).toBeNull();
    });

    it('create without description defaults to null', async () => {
        await handlePartitions({ action: 'create', id: 'no-desc', name: 'No Desc' });

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO domain_partitions'),
            ['no-desc', 'No Desc', null, 0],
        );
    });

    it('createBridge checks partB system flag', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })  // partA not system
            .mockResolvedValueOnce({ system: 1 }); // partB is system

        const result = await handlePartitions({
            action: 'createBridge', id: 'a-part', targetPartitionId: 'sys-part',
        });

        expect(result.error).toContain('system partition');
    });

    it('createBridge succeeds with both non-system partitions', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ system: 0 })
            .mockResolvedValueOnce({ system: 0 });

        const result = await handlePartitions({
            action: 'createBridge', id: 'alpha', targetPartitionId: 'beta',
        });

        expect(result.success).toBe(true);
        expect(result.bridge.partition_a).toBe('alpha');
        expect(result.bridge.partition_b).toBe('beta');
    });

    it('importTransient returns error on exception', async () => {
        mockImportTransient.mockRejectedValueOnce(new Error('Invalid format'));

        const result = await handlePartitions({
            action: 'importTransient', data: { bad: true },
        });

        expect(result.error).toBe('Invalid format');
    });
});

/* ================================================================== */
/* handleContext — additional edge cases                                */
/* ================================================================== */

describe('handleContext — additional edge cases', () => {
    it('prepare without sessionId passes undefined', async () => {
        mockContextPrepare.mockResolvedValueOnce({ systemPrompt: 'auto' });

        const result = await handleContext({
            action: 'prepare', message: 'hello',
        });

        expect(mockContextPrepare).toHaveBeenCalledWith('hello', undefined, {
            maxNodes: undefined,
            budget: undefined,
            modelProfile: undefined,
        });
        expect(result.systemPrompt).toBe('auto');
    });

    it('prepare passes budget param', async () => {
        mockContextPrepare.mockResolvedValueOnce({ systemPrompt: 'budgeted' });

        await handleContext({
            action: 'prepare', message: 'test', sessionId: 's1', budget: 4000,
        });

        expect(mockContextPrepare).toHaveBeenCalledWith('test', 's1', {
            maxNodes: undefined,
            budget: 4000,
            modelProfile: undefined,
        });
    });

    it('session with compressedHistory returns hasCompressedHistory=true', async () => {
        mockGetSession.mockReturnValueOnce({
            id: 's1',
            createdAt: '2024-01-01',
            lastActiveAt: '2024-01-02',
            turnCount: 5,
            topics: Array.from({ length: 25 }, (_, i) => `topic-${i}`),
            domains: ['d1'],
            history: [],
            compressedUpTo: 3,
            compressedHistory: 'compressed summary here',
            lastContext: null,
            lastFeedback: null,
        });

        const result = await handleContext({ action: 'session', sessionId: 's1' });

        expect(result.hasCompressedHistory).toBe(true);
        // Topics should be sliced to 20
        expect(result.topics).toHaveLength(20);
        expect(result.compressedUpTo).toBe(3);
    });

    it('metrics with lastFeedback=null returns feedbackBoosts=0', async () => {
        mockGetSession.mockReturnValueOnce({
            id: 's1',
            turnCount: 1,
            metrics: {
                qualityScores: [0.5],
                knowledgeUtilization: [0.3],
                responseGrounding: [0.4],
                topicCoverage: [0.6],
                budgetEfficiency: [0.7],
            },
            lastFeedback: null,
        });

        const result = await handleContext({ action: 'metrics', sessionId: 's1' });

        expect(result.feedbackBoosts).toBe(0);
        expect(result.perTurn).toHaveLength(1);
        expect(result.avgBudgetEfficiency).toBe(0.7);
    });

    it('delete returns false when session does not exist', async () => {
        mockDeleteSession.mockReturnValueOnce(false);

        const result = await handleContext({ action: 'delete', sessionId: 'gone' });

        expect(result.success).toBe(false);
        expect(result.sessionId).toBe('gone');
    });
});
