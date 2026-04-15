/**
 * Unit tests for evm/feedback.ts —
 * recordVerification, recordMultiClaimAggregate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('exec-uuid-abc');
const mockInvalidateKnowledgeCache = jest.fn<() => void>();

const mockConfig = {
    labVerify: {
        weightBoostOnVerified: 0.1,
        weightPenaltyOnFailed: -0.1,
    },
    engine: { weightCeiling: 3.0 },
    feedback: { weightFloor: 0.1 },
};

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../models/types.js', () => ({
    generateUuid: mockGenerateUuid,
}));

// Mock dynamic import of knowledge.js used for cache invalidation
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

const { recordVerification, recordMultiClaimAggregate } = await import('../../evm/feedback.js');

/** Minimal VerificationResult with required fields */
function makeResult(overrides: Record<string, any> = {}): any {
    return {
        nodeId: 'node-123',
        status: 'completed',
        attempts: 1,
        weightBefore: 1.0,
        weightAfter: null,
        evaluation: {
            verified: true,
            claimSupported: true,
            confidence: 0.9,
            score: 0.9,
            mode: 'boolean',
            details: {},
        },
        codegen: {
            hypothesis: 'The claim is true',
            code: 'assert True',
            evaluationMode: 'boolean',
            claimType: 'empirical',
            assertionPolarity: 'positive',
        },
        sandbox: {
            stdout: '{"success": true}',
            stderr: '',
            exitCode: 0,
            executionTimeMs: 100,
        },
        testCategory: 'structural',
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLogDecision.mockResolvedValue(undefined);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGenerateUuid.mockReturnValue('exec-uuid-abc');
    mockInvalidateKnowledgeCache.mockReturnValue(undefined as any);
});

// =============================================================================
// recordVerification
// =============================================================================

describe('recordVerification', () => {
    it('inserts an execution record with the generated uuid', async () => {
        await recordVerification(makeResult());

        expect(mockQuery).toHaveBeenCalled();
        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO lab_executions')
        );
        expect(insertCall).toBeDefined();
        const args = insertCall[1];
        expect(args[0]).toBe('exec-uuid-abc'); // id
        expect(args[1]).toBe('node-123');        // node_id
        expect(args[2]).toBe('completed');       // status
    });

    it('updates node verification columns after insert', async () => {
        await recordVerification(makeResult());

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('verification_status')
        );
        expect(updateCall).toBeDefined();
        const args = updateCall[1];
        expect(args[0]).toBe('completed');   // verification_status
        expect(args[3]).toBe('node-123');    // node id
    });

    it('adjusts weight upward when claim is supported', async () => {
        const result = makeResult({
            evaluation: {
                verified: true,
                claimSupported: true,
                confidence: 1.0,
                score: 1.0,
                mode: 'boolean',
                details: {},
            },
        });

        await recordVerification(result);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        expect(weightUpdate).toBeDefined();
        const newWeight = weightUpdate[1][0];
        // weightBefore=1.0 + 0.1*1.0 = 1.1
        expect(newWeight).toBeCloseTo(1.1);
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-123', 'weight',
            expect.any(String), expect.any(String),
            'auto', 'evm', expect.stringContaining('supported'),
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system', 'evm_feedback', expect.any(String),
            expect.objectContaining({ claimSupported: true }),
        );
    });

    it('adjusts weight downward when claim is disproved', async () => {
        const result = makeResult({
            evaluation: {
                verified: false,
                claimSupported: false,
                confidence: 1.0,
                score: 0.0,
                mode: 'boolean',
                details: {},
            },
        });

        await recordVerification(result);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        expect(weightUpdate).toBeDefined();
        const newWeight = weightUpdate[1][0];
        // weightBefore=1.0 + (-0.1)*1.0 = 0.9
        expect(newWeight).toBeCloseTo(0.9);
    });

    it('respects weight floor (does not go below 0.1)', async () => {
        const result = makeResult({
            weightBefore: 0.1,
            evaluation: {
                claimSupported: false, confidence: 1.0, score: 0, mode: 'boolean', verified: false, details: {},
            },
        });

        await recordVerification(result);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        if (weightUpdate) {
            expect(weightUpdate[1][0]).toBeGreaterThanOrEqual(0.1);
        }
    });

    it('respects weight ceiling (does not exceed 3.0)', async () => {
        const result = makeResult({
            weightBefore: 2.95,
            evaluation: {
                claimSupported: true, confidence: 1.0, score: 1.0, mode: 'boolean', verified: true, details: {},
            },
        });

        await recordVerification(result);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        if (weightUpdate) {
            expect(weightUpdate[1][0]).toBeLessThanOrEqual(3.0);
        }
    });

    it('skips weight adjustment for non-completed status', async () => {
        const result = makeResult({ status: 'code_error' });

        await recordVerification(result);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        expect(weightUpdate).toBeUndefined();
        expect(mockLogDecision).not.toHaveBeenCalled();
    });

    it('skips weight adjustment when skipWeightAdjust=true', async () => {
        await recordVerification(makeResult(), { skipWeightAdjust: true });

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('UPDATE nodes') && String(sql).includes('weight = $1')
        );
        expect(weightUpdate).toBeUndefined();
    });

    it('skips node update when skipNodeUpdate=true', async () => {
        await recordVerification(makeResult(), { skipNodeUpdate: true });

        const nodeUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('verification_status')
        );
        expect(nodeUpdate).toBeUndefined();
    });

    it('queries node domain for cache invalidation', async () => {
        mockQueryOne.mockResolvedValue({ domain: 'physics' });

        await recordVerification(makeResult());

        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('SELECT domain'),
            ['node-123'],
        );
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('physics');
    });

    it('does not crash when cache invalidation fails', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB down'));

        await expect(recordVerification(makeResult())).resolves.toBeUndefined();
    });
});

// =============================================================================
// recordMultiClaimAggregate
// =============================================================================

describe('recordMultiClaimAggregate', () => {
    it('updates node verification columns with multi-claim data', async () => {
        const aggregate: any = {
            nodeId: 'node-multi',
            status: 'completed',
            claimsTotal: 3,
            claimsVerified: 2,
            weightBefore: 1.0,
            weightAfter: null,
            evaluation: {
                verified: true,
                claimSupported: true,
                confidence: 0.8,
                score: 0.8,
                mode: 'boolean',
                details: {},
            },
            completedAt: '2024-01-01T00:00:00Z',
        };

        await recordMultiClaimAggregate('node-multi', aggregate);

        const nodeUpdate = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('verification_status')
        );
        expect(nodeUpdate).toBeDefined();
        const results = JSON.parse(nodeUpdate[1][2]);
        expect(results.multiClaim).toBe(true);
        expect(results.claimsTotal).toBe(3);
        expect(results.claimsVerified).toBe(2);
    });

    it('adjusts weight for multi-claim aggregate result', async () => {
        const aggregate: any = {
            nodeId: 'node-multi-2',
            status: 'completed',
            claimsTotal: 2,
            claimsVerified: 2,
            weightBefore: 1.5,
            weightAfter: null,
            evaluation: {
                claimSupported: true,
                confidence: 0.9,
                score: 0.9,
                mode: 'boolean',
                verified: true,
                details: {},
            },
        };

        await recordMultiClaimAggregate('node-multi-2', aggregate);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql, params]: any[]) =>
            String(sql).includes('weight = $1') && Array.isArray(params) && params.includes('node-multi-2')
        );
        expect(weightUpdate).toBeDefined();
        // 1.5 + 0.1 * 0.9 = 1.59
        expect(weightUpdate[1][0]).toBeCloseTo(1.59, 2);
    });

    it('skips weight update when evaluation is null', async () => {
        const aggregate: any = {
            nodeId: 'node-null-eval',
            status: 'failed',
            evaluation: null,
        };

        await recordMultiClaimAggregate('node-null-eval', aggregate);

        // No queries at all
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
