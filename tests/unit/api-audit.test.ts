/**
 * Unit tests for evm/api/audit.ts —
 * recordApiVerification, getNodeApiVerifications, getFilteredApiVerifications, getApiVerificationStats.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('test-uuid-1234');
const mockResolveContent = jest.fn<(s: string) => Promise<string>>().mockImplementation(async (s) => s);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    generateUuid: mockGenerateUuid,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

const {
    recordApiVerification,
    getNodeApiVerifications,
    getFilteredApiVerifications,
    getApiVerificationStats,
} = await import('../../evm/api/audit.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockGenerateUuid.mockReturnValue('test-uuid-1234');
    mockResolveContent.mockImplementation(async (s) => s);
});

// =============================================================================
// recordApiVerification
// =============================================================================

describe('recordApiVerification', () => {
    it('inserts audit row and returns generated uuid', async () => {
        const result: any = {
            apiId: 'api-1',
            status: 'success',
            decision: { reason: 'Verified', confidence: 0.9, mode: 'auto' },
            query: { method: 'GET', url: 'https://api.example.com/data', body: null },
            responseStatus: 200,
            rawResponse: '{"data":true}',
            responseTimeMs: 120,
            interpretation: {
                impact: 'structural_validation',
                corrections: [],
                evidenceSummary: 'Data matches',
                confidence: 0.9,
            },
            correctionsApplied: 0,
            enrichment: null,
            error: null,
        };

        const id = await recordApiVerification('node-1', result, 'exec-abc');

        expect(id).toBe('test-uuid-1234');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('INSERT INTO api_verifications');
        expect(params).toContain('test-uuid-1234');
        expect(params).toContain('node-1');
        expect(params).toContain('api-1');
        expect(params).toContain('exec-abc');
    });

    it('handles null enrichment and query gracefully', async () => {
        const result: any = {
            apiId: 'api-1',
            status: 'api_error',
            decision: { reason: 'Failed', confidence: 0 },
            query: null,
            responseStatus: null,
            rawResponse: null,
            responseTimeMs: null,
            interpretation: null,
            correctionsApplied: 0,
            enrichment: null,
            error: 'Connection timeout',
        };

        const id = await recordApiVerification('node-1', result, null);
        expect(id).toBe('test-uuid-1234');

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('Connection timeout');
        expect(params).toContain('api_error');
    });
});

// =============================================================================
// getNodeApiVerifications
// =============================================================================

describe('getNodeApiVerifications', () => {
    it('returns all verifications for a node in desc order', async () => {
        const rows = [
            { id: 'v1', node_id: 'n1', status: 'success' },
            { id: 'v2', node_id: 'n1', status: 'api_error' },
        ];
        mockQuery.mockResolvedValue(rows);

        const result = await getNodeApiVerifications('n1');

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('v1');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('api_verifications');
        expect(params).toContain('n1');
        expect(String(sql)).toContain('ORDER BY created_at DESC');
    });
});

// =============================================================================
// getFilteredApiVerifications
// =============================================================================

describe('getFilteredApiVerifications', () => {
    it('returns rows and total with no filters', async () => {
        mockQueryOne.mockResolvedValue({ total: 42 });
        mockQuery.mockResolvedValue([{ id: 'v1', api_id: null, node_content_preview: 'Content here' }]);

        const result = await getFilteredApiVerifications({});

        expect(result.total).toBe(42);
        expect(result.rows).toHaveLength(1);
    });

    it('applies apiId filter', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await getFilteredApiVerifications({ apiId: 'api-xyz' });

        const [, countParams] = mockQueryOne.mock.calls[0] as any[];
        expect(countParams).toContain('api-xyz');
    });

    it('applies nodeId filter', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await getFilteredApiVerifications({ nodeId: 'node-abc' });

        const [, countParams] = mockQueryOne.mock.calls[0] as any[];
        expect(countParams).toContain('node-abc');
    });

    it('applies impact and status filters', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await getFilteredApiVerifications({ impact: 'structural_validation', status: 'success' });

        const [, countParams] = mockQueryOne.mock.calls[0] as any[];
        expect(countParams).toContain('structural_validation');
        expect(countParams).toContain('success');
    });

    it('resolves API names from system DB', async () => {
        mockQueryOne.mockResolvedValue({ total: 1 });
        mockQuery.mockResolvedValue([{ id: 'v1', api_id: 'api-1', node_content_preview: null }]);
        mockSystemQuery.mockResolvedValue([
            { id: 'api-1', name: 'my-api', display_name: 'My API' },
        ]);

        const result = await getFilteredApiVerifications({});

        expect(result.rows[0].api_name).toBe('my-api');
        expect(result.rows[0].api_display_name).toBe('My API');
    });

    it('resolves variable placeholders in node_content_preview', async () => {
        mockQueryOne.mockResolvedValue({ total: 1 });
        mockQuery.mockResolvedValue([{ id: 'v1', api_id: null, node_content_preview: 'Value [[[VAR001]]] is important.' }]);
        mockResolveContent.mockImplementation(async (s) => s.replace('[[[VAR001]]]', '42'));

        const result = await getFilteredApiVerifications({});

        expect(result.rows[0].node_content_preview).toBe('Value 42 is important.');
    });

    it('sets api_name to null when api_id not in system DB', async () => {
        mockQueryOne.mockResolvedValue({ total: 1 });
        mockQuery.mockResolvedValue([{ id: 'v1', api_id: 'unknown-api', node_content_preview: null }]);
        mockSystemQuery.mockResolvedValue([]); // API not found

        const result = await getFilteredApiVerifications({});

        expect(result.rows[0].api_name).toBeNull();
        expect(result.rows[0].api_display_name).toBeNull();
    });

    it('uses default limit=50 and offset=0', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        await getFilteredApiVerifications({});

        const [, listParams] = mockQuery.mock.calls[0] as any[];
        expect(listParams).toContain(50);
        expect(listParams).toContain(0);
    });
});

// =============================================================================
// getApiVerificationStats
// =============================================================================

describe('getApiVerificationStats', () => {
    it('returns zero stats when no records', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await getApiVerificationStats(7);

        expect(result.total).toBe(0);
        expect(result.success).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.corrections).toBe(0);
        expect(result.validations).toBe(0);
        expect(result.refutations).toBe(0);
        expect(result.enrichments).toBe(0);
        expect(result.avgResponseTimeMs).toBe(0);
        expect(result.byApi).toHaveLength(0);
    });

    it('returns aggregated stats from query results', async () => {
        mockQueryOne.mockResolvedValue({
            total: '25',
            success: '20',
            errors: '5',
            corrections: '3',
            validations: '15',
            refutations: '2',
            enrichments: '7',
            avg_response_time_ms: '250.5',
        });
        mockQuery.mockResolvedValue([
            { apiId: 'api-1', total: '15', success: '12', errors: '3' },
            { apiId: 'api-2', total: '10', success: '8', errors: '2' },
        ]);

        const result = await getApiVerificationStats(30);

        expect(result.total).toBe('25');
        expect(result.success).toBe('20');
        expect(result.errors).toBe('5');
        expect(result.corrections).toBe('3');
        expect(result.validations).toBe('15');
        expect(result.refutations).toBe('2');
        expect(result.enrichments).toBe('7');
        expect(result.avgResponseTimeMs).toBe(251); // Math.round(250.5)
        expect(result.byApi).toHaveLength(2);
    });

    it('passes correct days-ago timestamp to query', async () => {
        mockQueryOne.mockResolvedValue({ total: 0 });
        mockQuery.mockResolvedValue([]);

        const before = Date.now();
        await getApiVerificationStats(7);
        const after = Date.now();

        const [, params] = mockQueryOne.mock.calls[0] as any[];
        const since = new Date(params[0]);

        // Should be roughly 7 days ago
        expect(since.getTime()).toBeGreaterThan(before - 7 * 86400000 - 1000);
        expect(since.getTime()).toBeLessThan(after - 7 * 86400000 + 1000);
    });
});
