/**
 * Unit tests for evm/api/corrections.ts —
 * applyCorrections and applyVerificationImpact.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();

const mockConfig = {
    labVerify: {
        apiVerification: {
            correctionPenalty: -0.1,
            validationBoost: 0.2,
            refutationPenalty: -0.5,
        },
    },
    feedback: { weightFloor: 0.1 },
    engine: { weightCeiling: 3.0, weightFloor: 0.05 },
};

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const { applyCorrections, applyVerificationImpact } = await import('../../evm/api/corrections.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLogDecision.mockResolvedValue(undefined);
    mockEmitActivity.mockReturnValue(undefined);
});

// =============================================================================
// applyCorrections
// =============================================================================

describe('applyCorrections', () => {
    it('skips corrections with no varId', async () => {
        const result = await applyCorrections('node-1', [
            { varId: '', oldValue: '5', newValue: '10', confidence: 0.9, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.details[0].reason).toContain('No variable ID');
    });

    it('skips corrections below minConfidence', async () => {
        const result = await applyCorrections('node-1', [
            { varId: 'VAR001', oldValue: '5', newValue: '10', confidence: 0.5, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.details[0].reason).toContain('Confidence 0.5 below threshold 0.8');
    });

    it('skips corrections when variable not in registry', async () => {
        mockQueryOne.mockResolvedValue(null); // variable not found

        const result = await applyCorrections('node-1', [
            { varId: 'VAR999', oldValue: '5', newValue: '10', confidence: 0.9, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.details[0].reason).toContain('not found in registry');
    });

    it('skips when value already matches', async () => {
        mockQueryOne.mockResolvedValue({ var_id: 'VAR001', value: '10', source_node_id: 'n1', domain: 'science' });

        const result = await applyCorrections('node-1', [
            { varId: 'VAR001', oldValue: '10', newValue: '10', confidence: 0.9, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.details[0].reason).toContain('already matches');
    });

    it('applies correction and logs decision', async () => {
        mockQueryOne.mockResolvedValue({ var_id: 'VAR001', value: '5', source_node_id: 'n1', domain: 'science' });

        const result = await applyCorrections('node-1', [
            { varId: 'VAR001', oldValue: '5', newValue: '10', confidence: 0.9, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(1);
        expect(result.skipped).toBe(0);
        expect(result.details[0].applied).toBe(true);
        expect(result.details[0].oldValue).toBe('5');
        expect(result.details[0].newValue).toBe('10');

        // UPDATE query called
        const updateCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('UPDATE number_registry')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1]).toContain('10');
        expect(updateCall[1]).toContain('VAR001');

        // logDecision called with variable/value info
        expect(mockLogDecision).toHaveBeenCalledWith(
            'variable', 'VAR001', 'value', '5', '10',
            'auto', 'evm:api', expect.stringContaining('API correction')
        );
    });

    it('handles multiple corrections with mixed outcomes', async () => {
        // First: applies, Second: confidence too low, Third: not found
        mockQueryOne
            .mockResolvedValueOnce({ var_id: 'VAR001', value: '5', source_node_id: 'n1', domain: 'sci' })
            .mockResolvedValueOnce(null); // VAR003 not found

        const result = await applyCorrections('node-1', [
            { varId: 'VAR001', oldValue: '5', newValue: '10', confidence: 0.9, source: 'api' } as any,
            { varId: 'VAR002', oldValue: '3', newValue: '6', confidence: 0.3, source: 'api' } as any,
            { varId: 'VAR003', oldValue: '1', newValue: '2', confidence: 0.9, source: 'api' } as any,
        ], 0.8);

        expect(result.applied).toBe(1);
        expect(result.skipped).toBe(2);
    });
});

// =============================================================================
// applyVerificationImpact
// =============================================================================

describe('applyVerificationImpact', () => {
    it('throws when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);

        await expect(
            applyVerificationImpact('missing-node', 'structural_validation', 0)
        ).rejects.toThrow('not found');
    });

    it('applies validation boost for structural_validation', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.0, breedable: 1 });

        const result = await applyVerificationImpact('node-1', 'structural_validation', 0);

        expect(result.weightBefore).toBe(1.0);
        expect(result.weightAfter).toBeCloseTo(1.2); // 1.0 + 0.2 boost
        expect(result.breedable).toBe(true);

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('UPDATE nodes');
        expect(params).toContain('structural_validation');
    });

    it('applies correction penalty for value_correction', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.0, breedable: 1 });

        const result = await applyVerificationImpact('node-1', 'value_correction', 2);

        // penalty = -0.1 * 2 corrections = -0.2
        expect(result.weightAfter).toBeCloseTo(0.8);
    });

    it('applies refutation penalty for structural_refutation without killing breedability', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.0, breedable: 1 });

        const result = await applyVerificationImpact('node-1', 'structural_refutation', 0);

        expect(result.weightAfter).toBeCloseTo(0.5); // 1.0 + (-0.5) = 0.5
        expect(result.breedable).toBe(true); // stays breedable per design

        // emitActivity should be called for refutation
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'api', 'api_refutation', expect.any(String), expect.any(Object)
        );
    });

    it('does not change weight for inconclusive impact', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.5, breedable: 1 });

        const result = await applyVerificationImpact('node-1', 'inconclusive', 0);

        expect(result.weightAfter).toBe(1.5); // no change
    });

    it('enforces weight floor', async () => {
        mockQueryOne.mockResolvedValue({ weight: 0.15, breedable: 1 });

        // Refutation penalty would bring it to 0.15 + (-0.5) = -0.35 → floor at 0.1
        const result = await applyVerificationImpact('node-1', 'structural_refutation', 0);

        expect(result.weightAfter).toBe(0.1); // clamped to floor
    });

    it('enforces weight ceiling', async () => {
        mockQueryOne.mockResolvedValue({ weight: 2.9, breedable: 1 });

        // Validation boost would bring it to 2.9 + 0.2 = 3.1 → ceiling at 3.0
        const result = await applyVerificationImpact('node-1', 'structural_validation', 0);

        expect(result.weightAfter).toBe(3.0); // clamped to ceiling
    });

    it('logs decision for all impact types', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.0, breedable: 1 });

        await applyVerificationImpact('node-1', 'structural_validation', 0);

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'weight',
            '1', expect.any(String),
            'auto', 'evm:api',
            expect.stringContaining('API verification')
        );
    });

    it('does not emit activity for non-refutation impacts', async () => {
        mockQueryOne.mockResolvedValue({ weight: 1.0, breedable: 1 });

        await applyVerificationImpact('node-1', 'structural_validation', 0);
        await applyVerificationImpact('node-1', 'value_correction', 1);
        await applyVerificationImpact('node-1', 'inconclusive', 0);

        expect(mockEmitActivity).not.toHaveBeenCalled();
    });
});
