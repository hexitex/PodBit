/**
 * Unit tests for core/cycles/validation.ts — runValidationCycleSingle().
 *
 * Tests: candidate selection, domain exclusion, breakthrough validation,
 * novelty gate, EVM gate, promotion to "possible", audit trail logging.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockValidateBreakthrough = jest.fn<(...args: any[]) => Promise<any>>();
const mockRunNoveltyGate = jest.fn<(...args: any[]) => Promise<any>>();
const mockLogDecision = jest.fn<(...args: any[]) => Promise<void>>();
const mockGetExcludedDomainsForCycle = jest.fn<(...args: any[]) => Promise<Set<string>>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockGetAssignedModel = jest.fn<(...args: any[]) => any>();
const mockVerifyNode = jest.fn<(...args: any[]) => Promise<any>>();

const mockCfg = {
    minWeightThreshold: 0.5,
    minCompositeForPromotion: 7.0,
};

const mockValConfig = {
    noveltyGateEnabled: false,
    evmGateEnabled: false,
};

const mockEvmConfig = {
    enabled: false,
};

const mockLabVerify = {
    enabled: false,
    specReview: { enabled: true, minConfidence: 0.7 },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: { validation: mockCfg },
        validation: mockValConfig,
        evm: mockEvmConfig,
        labVerify: mockLabVerify,
    },
}));

jest.unstable_mockModule('../../core/validation.js', () => ({
    validateBreakthrough: mockValidateBreakthrough,
    runNoveltyGate: mockRunNoveltyGate,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
    getExcludedDomainsForCycle: mockGetExcludedDomainsForCycle,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../evm/index.js', () => ({
    verifyNode: mockVerifyNode,
}));

const { runValidationCycleSingle } = await import('../../core/cycles/validation.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCandidate(id = 'n1', domain = 'sci') {
    return {
        id, content: 'Some synthesis', weight: 1.0, domain,
        node_type: 'synthesis', specificity: 1.5, embedding: null,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockCfg.minWeightThreshold = 0.5;
    mockCfg.minCompositeForPromotion = 7.0;
    mockValConfig.noveltyGateEnabled = false;
    mockValConfig.evmGateEnabled = false;
    mockEvmConfig.enabled = false;
    mockLabVerify.enabled = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runValidationCycleSingle', () => {
    it('returns early when no candidates found', async () => {
        mockQuery.mockResolvedValueOnce([]); // candidates
        await runValidationCycleSingle();
        expect(mockValidateBreakthrough).not.toHaveBeenCalled();
    });

    it('filters out excluded domains from candidates', async () => {
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['blocked']));
        mockQuery.mockResolvedValueOnce([makeCandidate('n1', 'blocked')]);
        await runValidationCycleSingle();
        expect(mockValidateBreakthrough).not.toHaveBeenCalled();
    });

    it('returns early on validation error', async () => {
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])  // candidates
            .mockResolvedValueOnce([])           // parents
        ;
        mockValidateBreakthrough.mockResolvedValue({ error: 'LLM failed' });

        await runValidationCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'validation_error', expect.stringContaining('LLM failed')
        );
        expect(mockQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET node_type'), expect.anything()
        );
    });

    it('emits validation_scored and logs audit trail when below threshold', async () => {
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 3.0, scores: { s: 3, n: 3, t: 3, tr: 3 } });

        await runValidationCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'validation_scored', expect.any(String),
            expect.objectContaining({ nodeId: 'n1', composite: 3.0, promoted: false })
        );
        // Audit trail
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dream_cycles'),
            expect.arrayContaining(['n1'])
        );
    });

    it('promotes to "possible" when composite meets threshold (no gates)', async () => {
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([{ id: 'parent1', content: 'Parent', weight: 1 }])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 8.5, scores: { s: 9, n: 8, t: 8, tr: 9 } });

        await runValidationCycleSingle();

        // node_type updated to 'possible'
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"),
            ['n1']
        );
        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'node_type',
            'synthesis', 'possible',
            'system', 'validation-cycle',
            expect.stringContaining('composite=8.5')
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'validation_promoted', expect.any(String),
            expect.objectContaining({ nodeId: 'n1', composite: 8.5 })
        );
    });

    it('blocks promotion when novelty gate says not novel', async () => {
        mockValConfig.noveltyGateEnabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockRunNoveltyGate.mockResolvedValue({ novel: false, confidence: 0.9, reasoning: 'Well-known fact' });

        await runValidationCycleSingle();

        // Not promoted
        expect(mockQuery).not.toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), expect.anything()
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'validation_blocked', expect.stringContaining('novelty gate'),
            expect.objectContaining({ gate: 'novelty' })
        );
        // Audit trail logged
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dream_cycles'),
            expect.arrayContaining(['n1'])
        );
    });

    it('allows promotion when novelty gate passes', async () => {
        mockValConfig.noveltyGateEnabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockRunNoveltyGate.mockResolvedValue({ novel: true, confidence: 0.8 });

        await runValidationCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
    });

    it('novelty gate error fails open (allows promotion)', async () => {
        mockValConfig.noveltyGateEnabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockRunNoveltyGate.mockRejectedValue(new Error('LLM timeout'));

        await runValidationCycleSingle();

        // Should still promote (fail-open)
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
    });

    it('novelty gate skipped result allows promotion', async () => {
        mockValConfig.noveltyGateEnabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockRunNoveltyGate.mockResolvedValue({ skipped: true, skipReason: 'no model', novel: true });

        await runValidationCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
    });

    it('blocks promotion when EVM gate refutes claims', async () => {
        mockValConfig.evmGateEnabled = true;
        mockEvmConfig.enabled = true;
        mockLabVerify.enabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockGetAssignedModel.mockReturnValue({ id: 'm1' });
        mockVerifyNode.mockResolvedValue({
            status: 'completed',
            evaluation: { claimSupported: false, verified: false, score: 0.2 },
        });

        await runValidationCycleSingle();

        expect(mockQuery).not.toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), expect.anything()
        );
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'validation_blocked', expect.stringContaining('EVM'),
            expect.objectContaining({ gate: 'evm' })
        );
    });

    it('allows promotion when EVM gate supports claims', async () => {
        mockValConfig.evmGateEnabled = true;
        mockEvmConfig.enabled = true;
        mockLabVerify.enabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockGetAssignedModel.mockReturnValue({ id: 'm1' });
        mockVerifyNode.mockResolvedValue({
            status: 'completed',
            evaluation: { claimSupported: true, verified: true, score: 0.9 },
        });

        await runValidationCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
    });

    it('EVM gate skipped when evm_codegen unassigned', async () => {
        mockValConfig.evmGateEnabled = true;
        mockEvmConfig.enabled = true;
        mockLabVerify.enabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockGetAssignedModel.mockReturnValue(null); // unassigned

        await runValidationCycleSingle();

        // Should still promote (skip, not block)
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
        expect(mockVerifyNode).not.toHaveBeenCalled();
    });

    it('EVM gate error fails open', async () => {
        mockValConfig.evmGateEnabled = true;
        mockEvmConfig.enabled = true;
        mockLabVerify.enabled = true;
        const candidate = makeCandidate();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([])
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 9.0, scores: {} });
        mockGetAssignedModel.mockReturnValue({ id: 'm1' });
        mockVerifyNode.mockRejectedValue(new Error('sandbox crash'));

        await runValidationCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE nodes SET node_type = 'possible'"), ['n1']
        );
    });

    it('passes parents to validateBreakthrough', async () => {
        const candidate = makeCandidate();
        const parents = [
            { id: 'p1', content: 'Parent 1', weight: 1.0, domain: 'sci', node_type: 'seed', specificity: 1.0 },
            { id: 'p2', content: 'Parent 2', weight: 0.8, domain: 'sci', node_type: 'seed', specificity: 1.2 },
        ];
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce(parents)
        ;
        mockValidateBreakthrough.mockResolvedValue({ composite: 5.0, scores: {} });

        await runValidationCycleSingle();

        expect(mockValidateBreakthrough).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'n1' }),
            parents
        );
    });
});
