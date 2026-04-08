/**
 * Unit tests for handlers/evm.ts — complex actions (analyse, suggest, decompose, decompose_apply)
 * and additional edge cases for simpler actions not covered by evm-handler.test.ts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — top-level static imports
// ---------------------------------------------------------------------------
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
const mockRecordAnalysis = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEnqueue = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, existing: false });
const mockGetQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ entries: [] });
const mockGetQueueStats = jest.fn<() => Promise<any>>().mockResolvedValue({ pending: 0 });
const mockCancelEntry = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockCancelByNode = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockProcessNextEntry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Dynamic import mocks
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockAnalyseRejection = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('test prompt');
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');
const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, node: { id: 'new-1' } });
const mockEmitActivity = jest.fn();
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIsBudgetExceeded = jest.fn<() => boolean>().mockReturnValue(false);

const mockConfig = {
    labVerify: {
        postRejection: { enabled: false, proposalEnabled: false },
        decompose: { maxFacts: 10, maxQuestions: 5, factInitialWeight: 0.5, questionInitialWeight: 0.3, weightDowngrade: -0.2 },
    },
    feedback: { weightFloor: 0.1 },
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
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
    recordAnalysis: mockRecordAnalysis,
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

// Dynamic import mocks
jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    query: mockQuery,
}));

jest.unstable_mockModule('../../evm/analysis.js', () => ({
    analyseRejection: mockAnalyseRejection,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../models/index.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handlePropose: mockHandlePropose,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    logDecision: mockLogDecision,
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
const { handleLabVerify } = await import('../../handlers/evm.js');

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.resetAllMocks();
    // Restore defaults after resetAllMocks
    mockVerifyNode.mockResolvedValue({ success: true });
    mockVerifyNodeInternal.mockResolvedValue({ success: true, direct: true });
    mockGetNodeVerifications.mockResolvedValue([]);
    mockGetEVMStats.mockResolvedValue({ total: 0 });
    mockGetRecentExecutions.mockResolvedValue({ count: 0, executions: [] });
    mockResolveContent.mockImplementation(async (c: any) => c || 'resolved');
    mockGetReviewQueue.mockResolvedValue({ count: 0, items: [] });
    mockApproveReview.mockResolvedValue({ success: true });
    mockReevaluateStoredResults.mockResolvedValue({ processed: 0 });
    mockReevaluateReviewQueue.mockResolvedValue({ processed: 0 });
    mockPruneOldExecutions.mockResolvedValue({ deleted: 0 });
    mockDismissNodeVerification.mockResolvedValue({ success: true });
    mockRecordAnalysis.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue({ success: true, existing: false });
    mockGetQueue.mockResolvedValue({ entries: [] });
    mockGetQueueStats.mockResolvedValue({ pending: 0 });
    mockCancelEntry.mockResolvedValue({ success: true });
    mockCancelByNode.mockResolvedValue({ success: true });
    mockProcessNextEntry.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockAnalyseRejection.mockResolvedValue(null);
    mockGetPrompt.mockResolvedValue('test prompt');
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'new-1' } });
    mockIsBudgetExceeded.mockReturnValue(false);

    // Reset config to defaults
    mockConfig.labVerify.postRejection.enabled = false;
    mockConfig.labVerify.postRejection.proposalEnabled = false;
    mockConfig.labVerify.decompose.maxFacts = 10;
    mockConfig.labVerify.decompose.maxQuestions = 5;
    mockConfig.labVerify.decompose.factInitialWeight = 0.5;
    mockConfig.labVerify.decompose.questionInitialWeight = 0.3;
    mockConfig.labVerify.decompose.weightDowngrade = -0.2;
    (mockConfig as any).feedback = { weightFloor: 0.1 };
});

// =============================================================================
// analyse
// =============================================================================

describe('action: analyse', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'analyse' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.error).toContain('Node not found or archived');
    });

    it('returns error when no rejected verification exists', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', verified: 1, claim_supported: 1 },
        ]);

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.error).toContain('No rejected verification found');
    });

    it('returns skip message for qualitative claims', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', verified: 0, claim_supported: 0, claim_type: 'qualitative' },
        ]);

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.message).toContain('qualitative');
        expect(result.claimType).toBe('qualitative');
    });

    it('returns skip message for qualitative claims when claim_type is missing (defaults)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', verified: 0, claim_supported: 0, claim_type: null },
        ]);

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        // claim_type defaults to 'qualitative' via `|| 'qualitative'`
        expect(result.message).toContain('qualitative');
    });

    it('finds rejected via claim_supported=0 (polarity-aware)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 1, verified: 1 }, // passing
            { status: 'completed', claim_supported: 0, verified: 0, claim_type: 'quantitative', hypothesis: 'h1', code: 'code1' },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: ['finding 1'],
            recoveryProposal: null,
        });

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.claimType).toBe('quantitative');
        expect(result.findings).toEqual(['finding 1']);
    });

    it('finds rejected via verified=0 for pre-polarity records (claim_supported is null)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: null, verified: 0, claim_type: 'quantitative', hypothesis: 'h1' },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: ['old finding'],
            recoveryProposal: null,
        });

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.claimType).toBe('quantitative');
    });

    it('returns skip message when analyseRejection returns null', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockResolvedValue(null);

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.message).toContain('no analyser registered');
    });

    it('returns error when analyseRejection throws', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockRejectedValue(new Error('LLM down'));

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(result.error).toBe('LLM down');
    });

    it('records analysis via recordAnalysis', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        const analysisResult = {
            claimType: 'quantitative',
            findings: ['result'],
            recoveryProposal: null,
        };
        mockAnalyseRejection.mockResolvedValue(analysisResult);

        await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(mockRecordAnalysis).toHaveBeenCalledWith('n1', analysisResult);
    });

    it('proposes recovery node when recoveryProposal exists and proposalEnabled', async () => {
        mockConfig.labVerify.postRejection.proposalEnabled = true;
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: ['fixed'],
            recoveryProposal: {
                content: 'corrected claim',
                domain: 'math',
                parentIds: ['n1'],
            },
        });

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: 'corrected claim',
            nodeType: 'synthesis',
            domain: 'math',
            contributor: 'evm:analysis',
        }));
        expect(result.recoveryProposed).toBe(true);
    });

    it('does not propose recovery when proposalEnabled is false', async () => {
        mockConfig.labVerify.postRejection.proposalEnabled = false;
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: ['fixed'],
            recoveryProposal: { content: 'corrected', domain: 'math', parentIds: ['n1'] },
        });

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(mockHandlePropose).not.toHaveBeenCalled();
        // recoveryProposed reflects whether the proposal object exists, not whether it was acted on
        expect(result.recoveryProposed).toBe(true);
    });

    it('restores postRejection.enabled after completion (finally block)', async () => {
        mockConfig.labVerify.postRejection.enabled = false;
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: [],
            recoveryProposal: null,
        });

        await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(mockConfig.labVerify.postRejection.enabled).toBe(false);
    });

    it('restores postRejection.enabled even if analyseRejection throws', async () => {
        mockConfig.labVerify.postRejection.enabled = false;
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', claim_supported: 0, claim_type: 'quantitative' },
        ]);
        mockAnalyseRejection.mockRejectedValue(new Error('boom'));

        await handleLabVerify({ action: 'analyse', nodeId: 'n1' });
        expect(mockConfig.labVerify.postRejection.enabled).toBe(false);
    });

    it('builds mockResult with correct fields from last rejected execution', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test content', domain: 'physics' });
        mockGetNodeVerifications.mockResolvedValue([
            {
                status: 'completed',
                claim_supported: 0,
                claim_type: 'quantitative',
                hypothesis: 'speed of light is 3e8 m/s',
                code: 'console.log(3e8)',
                evaluation_mode: 'numeric',
                stdout: '300000000',
                stderr: '',
                exit_code: 0,
                execution_time_ms: 42,
                confidence: 0.9,
                score: 85,
                created_at: '2024-01-01T00:00:00Z',
            },
        ]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'quantitative',
            findings: ['speed check failed'],
            recoveryProposal: null,
        });

        await handleLabVerify({ action: 'analyse', nodeId: 'n1' });

        // Verify analyseRejection was called with a well-formed result
        expect(mockAnalyseRejection).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeId: 'n1',
                status: 'completed',
                codegen: expect.objectContaining({
                    hypothesis: 'speed of light is 3e8 m/s',
                    code: 'console.log(3e8)',
                    evaluationMode: 'numeric',
                    claimType: 'quantitative',
                }),
                sandbox: expect.objectContaining({
                    success: true,
                    stdout: '300000000',
                    exitCode: 0,
                }),
                evaluation: expect.objectContaining({
                    verified: false,
                    confidence: 0.9,
                    score: 85,
                }),
            }),
            'test content',
            'physics',
            { forceEnabled: true },
        );
    });
});

// =============================================================================
// suggest
// =============================================================================

describe('action: suggest', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'suggest' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.error).toContain('Node not found or archived');
    });

    it('returns error when no verification history exists', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([]);

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.error).toContain('No verification history found');
    });

    it('calls callSubsystemModel with evm_guidance subsystem', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test content', domain: 'math' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', hypothesis: 'h1', code: 'c1', error: 'err1', stdout: 'out', stderr: 'serr', test_category: 'unit', evaluation_mode: 'boolean', claim_type: 'quantitative' },
        ]);
        mockResolveContent.mockResolvedValue('resolved test content');
        mockGetPrompt.mockResolvedValue('suggest prompt');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'bad test',
            suggestion: 'fix it',
            confidence: 0.8,
            category: 'test-design',
        }));

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'evm_guidance',
            'suggest prompt',
            expect.objectContaining({ jsonSchema: expect.any(Object) }),
        );
        expect(result.nodeId).toBe('n1');
        expect(result.diagnosis).toBe('bad test');
        expect(result.suggestion).toBe('fix it');
        expect(result.confidence).toBe(0.8);
        expect(result.category).toBe('test-design');
    });

    it('includes system prompt when available', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockGetPrompt
            .mockResolvedValueOnce('user prompt')      // evm.guidance_suggest
            .mockResolvedValueOnce('system prompt');    // evm.guidance_system
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 0.5, category: 'c',
        }));

        await handleLabVerify({ action: 'suggest', nodeId: 'n1' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'evm_guidance',
            'user prompt',
            expect.objectContaining({ systemPrompt: 'system prompt' }),
        );
    });

    it('handles missing system prompt gracefully', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockGetPrompt
            .mockResolvedValueOnce('user prompt')
            .mockRejectedValueOnce(new Error('prompt not found'));  // system prompt fails
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 0.5, category: 'c',
        }));

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });

        // Should succeed without system prompt
        expect(result.diagnosis).toBe('d');
        // systemPrompt key should not be in the options
        const callArgs = mockCallSubsystemModel.mock.calls[0];
        expect(callArgs[2]).not.toHaveProperty('systemPrompt');
    });

    it('clamps confidence to [0, 1]', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 5.0, category: 'c',
        }));

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.confidence).toBe(1);
    });

    it('clamps negative confidence to 0', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: -0.5, category: 'c',
        }));

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.confidence).toBe(0);
    });

    it('defaults confidence to 0.5 when non-numeric', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 'not-a-number', category: 'c',
        }));

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.confidence).toBe(0.5);
    });

    it('extracts JSON from raw response when direct parse fails', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockCallSubsystemModel.mockResolvedValue(
            'Here is the analysis:\n```json\n{"diagnosis":"extracted","suggestion":"s","confidence":0.7,"category":"c"}\n```'
        );

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.diagnosis).toBe('extracted');
    });

    it('returns error when JSON cannot be extracted from response', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([{ status: 'completed' }]);
        mockCallSubsystemModel.mockResolvedValue('no json here at all');

        const result = await handleLabVerify({ action: 'suggest', nodeId: 'n1' });
        expect(result.error).toContain('Failed to parse');
    });

    it('truncates long stdout/stderr to 2000 chars in prompt', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        const longOutput = 'x'.repeat(5000);
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', stdout: longOutput, stderr: longOutput },
        ]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 0.5, category: 'c',
        }));

        await handleLabVerify({ action: 'suggest', nodeId: 'n1' });

        // getPrompt is called with truncated stdout/stderr
        expect(mockGetPrompt).toHaveBeenCalledWith('evm.guidance_suggest', expect.objectContaining({
            stdout: expect.any(String),
            stderr: expect.any(String),
        }));
        const promptArgs = mockGetPrompt.mock.calls[0][1] as any;
        expect(promptArgs.stdout.length).toBeLessThanOrEqual(2000);
        expect(promptArgs.stderr.length).toBeLessThanOrEqual(2000);
    });

    it('uses "(none)" for missing execution fields', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd' });
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed' }, // all fields undefined
        ]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            diagnosis: 'd', suggestion: 's', confidence: 0.5, category: 'c',
        }));

        await handleLabVerify({ action: 'suggest', nodeId: 'n1' });

        const promptArgs = mockGetPrompt.mock.calls[0][1] as any;
        expect(promptArgs.hypothesis).toBe('(none)');
        expect(promptArgs.code).toBe('(none)');
        expect(promptArgs.error).toBe('(none)');
        expect(promptArgs.stdout).toBe('(none)');
        expect(promptArgs.stderr).toBe('(none)');
    });
});

// =============================================================================
// decompose
// =============================================================================

describe('action: decompose', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'decompose' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when budget exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);
        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.error).toContain('Budget exceeded');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.error).toContain('Node not found or archived');
    });

    it('returns decomposed facts and questions on success', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'complex claim', domain: 'biology', weight: 0.8 });
        mockQuery.mockResolvedValue([{ content: 'parent content' }]); // parents
        mockGetNodeVerifications.mockResolvedValue([
            { status: 'completed', hypothesis: 'h1', claim_type: 'quantitative' },
        ]);
        mockResolveContent.mockImplementation(async (c: any) => c);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [
                { content: 'Fact 1', category: 'definition', confidence: 0.9 },
                { content: 'Fact 2', category: 'quantitative', confidence: 0.7 },
            ],
            questions: [
                { content: 'Question 1', reasoning: 'need to verify' },
            ],
            summary: 'Decomposed into atomic claims',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });

        expect(result.nodeId).toBe('n1');
        expect(result.facts).toHaveLength(2);
        expect(result.facts[0].content).toBe('Fact 1');
        expect(result.facts[0].category).toBe('definition');
        expect(result.questions).toHaveLength(1);
        expect(result.summary).toBe('Decomposed into atomic claims');
    });

    it('replaces invalid categories with "observation"', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [{ content: 'fact', category: 'invalid-cat', confidence: 0.5 }],
            questions: [],
            summary: 'done',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.facts[0].category).toBe('observation');
    });

    it('clamps fact confidence to [0, 1]', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [
                { content: 'high', category: 'definition', confidence: 5.0 },
                { content: 'low', category: 'definition', confidence: -1.0 },
            ],
            questions: [],
            summary: 's',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.facts[0].confidence).toBe(1);
        expect(result.facts[1].confidence).toBe(0);
    });

    it('filters out empty content facts', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [
                { content: '', category: 'definition', confidence: 0.5 },
                { content: 'valid', category: 'definition', confidence: 0.5 },
            ],
            questions: [
                { content: '', reasoning: 'r' },
                { content: 'valid q', reasoning: 'r' },
            ],
            summary: 's',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.facts).toHaveLength(1);
        expect(result.questions).toHaveLength(1);
    });

    it('truncates facts and questions to config maxFacts/maxQuestions', async () => {
        mockConfig.labVerify.decompose.maxFacts = 2;
        mockConfig.labVerify.decompose.maxQuestions = 1;
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);

        const manyFacts = Array.from({ length: 10 }, (_, i) => ({
            content: `Fact ${i}`, category: 'definition', confidence: 0.5,
        }));
        const manyQuestions = Array.from({ length: 10 }, (_, i) => ({
            content: `Q ${i}`, reasoning: 'r',
        }));
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: manyFacts,
            questions: manyQuestions,
            summary: 's',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.facts.length).toBeLessThanOrEqual(2);
        expect(result.questions.length).toBeLessThanOrEqual(1);
    });

    it('extracts JSON from non-JSON wrapper in LLM response', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(
            'Here is the result: {"facts":[],"questions":[],"summary":"extracted"}'
        );

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.summary).toBe('extracted');
    });

    it('returns error when JSON cannot be extracted from LLM response', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue('no json anywhere');

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.error).toContain('Failed to parse');
    });

    it('resolves parent content through resolveContent', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'node [[[V1]]]', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([
            { content: 'parent [[[V2]]]' },
            { content: 'parent [[[V3]]]' },
        ]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockResolveContent.mockImplementation(async (c: any) => c.replace(/\[\[\[.*?\]\]\]/, '42'));
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [], questions: [], summary: 's',
        }));

        await handleLabVerify({ action: 'decompose', nodeId: 'n1' });

        // resolveContent should have been called for the node + each parent
        expect(mockResolveContent).toHaveBeenCalledTimes(3);
    });

    it('uses "(no parent nodes)" when no parents exist', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [], questions: [], summary: 's',
        }));

        await handleLabVerify({ action: 'decompose', nodeId: 'n1' });

        expect(mockGetPrompt).toHaveBeenCalledWith('evm.decompose', expect.objectContaining({
            parentContents: '(no parent nodes)',
        }));
    });

    it('uses "(no verification history)" when no history exists', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [], questions: [], summary: 's',
        }));

        await handleLabVerify({ action: 'decompose', nodeId: 'n1' });

        expect(mockGetPrompt).toHaveBeenCalledWith('evm.decompose', expect.objectContaining({
            verificationHistory: '(no verification history)',
        }));
    });

    it('handles non-array facts/questions in LLM response gracefully', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: 'not an array',
            questions: null,
            summary: 's',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.facts).toEqual([]);
        expect(result.questions).toEqual([]);
    });

    it('defaults domain to "general" when node has no domain', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: null, weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            facts: [], questions: [], summary: 's',
        }));

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });
        expect(result.domain).toBe('general');
    });
});

// =============================================================================
// decompose_apply
// =============================================================================

describe('action: decompose_apply', () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleLabVerify({ action: 'decompose_apply' });
        expect(result.error).toContain('nodeId is required');
    });

    it('returns error when neither facts nor questions provided', async () => {
        const result = await handleLabVerify({ action: 'decompose_apply', nodeId: 'n1' });
        expect(result.error).toContain('At least one of facts[] or questions[]');
    });

    it('returns error when node not found', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await handleLabVerify({ action: 'decompose_apply', nodeId: 'n1', facts: [{ content: 'f' }] });
        expect(result.error).toContain('Node not found or archived');
    });

    it('creates fact nodes via handlePropose', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'fact-1' } });
        mockQuery.mockResolvedValue([]); // UPDATE query

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [
                { content: 'Fact A', category: 'definition' },
                { content: 'Fact B', category: 'quantitative' },
            ],
        });

        expect(mockHandlePropose).toHaveBeenCalledTimes(2);
        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Fact A',
            nodeType: 'seed',
            domain: 'bio',
            parentIds: ['n1'],
            contributor: 'evm:decompose',
            weight: 0.5,
        }));
        expect(result.createdFacts).toHaveLength(2);
        expect(result.totalCreated).toBe(2);
    });

    it('creates question nodes via handlePropose', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'q-1' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            questions: [{ content: 'Why?' }],
        });

        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Why?',
            nodeType: 'question',
            weight: 0.3,
        }));
        expect(result.createdQuestions).toHaveLength(1);
    });

    it('skips facts with empty or non-string content', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f-1' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [
                { content: '' },        // empty
                { content: 123 },        // not string
                { category: 'def' },     // missing content
                { content: 'valid' },
            ],
        });

        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
        expect(result.createdFacts).toHaveLength(1);
    });

    it('continues on individual handlePropose failures', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.8 });
        mockHandlePropose
            .mockRejectedValueOnce(new Error('duplicate'))
            .mockResolvedValueOnce({ success: true, node: { id: 'f-2' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [
                { content: 'Fact A' },
                { content: 'Fact B' },
            ],
        });

        expect(result.createdFacts).toHaveLength(1);
        expect(result.totalCreated).toBe(1);
    });

    it('returns error when all proposals are rejected', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: false, node: null });

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'rejected fact' }],
        });

        expect(result.error).toContain('No nodes were created');
    });

    it('downgrades original node weight respecting weightFloor', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'bio', weight: 0.15 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f-1' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'fact' }],
        });

        // weight = max(0.1, 0.15 + (-0.2)) = max(0.1, -0.05) = 0.1
        expect(result.originalWeightAfter).toBe(0.1);
        // Verify the UPDATE was called with the floored weight
        expect(mockQuery).toHaveBeenCalledWith(
            'UPDATE nodes SET weight = $1 WHERE id = $2',
            [0.1, 'n1'],
        );
    });

    it('emits activity event after successful decomposition', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test content here', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f-1' } });
        mockQuery.mockResolvedValue([]);

        await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'fact' }],
            questions: [{ content: 'question' }],
        });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'system',
            'evm_decompose',
            expect.stringContaining('test content here'),
            expect.objectContaining({
                nodeId: 'n1',
                factsCreated: 1,
                questionsCreated: 1,
            }),
        );
    });

    it('logs governance decision for weight change', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f-1' } });
        mockQuery.mockResolvedValue([]);

        await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'fact' }],
        });

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'n1', 'weight',
            expect.any(String), expect.any(String),
            'system', 'evm:decompose',
            expect.stringContaining('1 facts'),
        );
    });

    it('handles logDecision failure gracefully (non-fatal)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f-1' } });
        mockQuery.mockResolvedValue([]);
        mockLogDecision.mockRejectedValue(new Error('governance db error'));

        // Should not throw
        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'fact' }],
        });

        expect(result.totalCreated).toBe(1);
    });

    it('handles facts as non-array gracefully', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'bio', weight: 0.8 });
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'q-1' } });
        mockQuery.mockResolvedValue([]);

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: 'not-an-array',
            questions: [{ content: 'q' }],
        });

        // facts treated as empty array, questions should still create
        expect(result.createdFacts).toHaveLength(0);
        expect(result.createdQuestions).toHaveLength(1);
    });
});

// =============================================================================
// Additional edge cases for verify
// =============================================================================

describe('action: verify (edge cases)', () => {
    // The handler always seeds hints with `allowCritique: true` for human-invoked verifies —
    // this opts the call into the node_critique fallback that autonomous cycles are blocked from.
    it('parses string maxClaims to number', async () => {
        await handleLabVerify({ action: 'verify', nodeId: 'n1', maxClaims: '5' });

        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true, maxClaims: 5 });
    });

    it('sets maxClaims to undefined when NaN but still passes hints object', async () => {
        await handleLabVerify({ action: 'verify', nodeId: 'n1', maxClaims: 'abc' });

        // parseInt('abc') returns NaN, || undefined yields undefined
        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true, maxClaims: undefined });
    });

    it('passes guidance as string even when input is number', async () => {
        await handleLabVerify({ action: 'verify', nodeId: 'n1', guidance: 42 });

        expect(mockVerifyNode).toHaveBeenCalledWith('n1', undefined, { allowCritique: true, guidance: '42' });
    });
});

// =============================================================================
// Additional edge cases for recent
// =============================================================================

describe('action: recent (edge cases)', () => {
    it('converts verified=false string to boolean false', async () => {
        await handleLabVerify({ action: 'recent', verified: 'false' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ verified: false }),
        );
    });

    it('leaves verified undefined when not a boolean value', async () => {
        await handleLabVerify({ action: 'recent', verified: 'maybe' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ verified: undefined }),
        );
    });

    it('passes minConfidence and maxConfidence as floats', async () => {
        await handleLabVerify({ action: 'recent', minConfidence: '0.5', maxConfidence: '0.9' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ minConfidence: 0.5, maxConfidence: 0.9 }),
        );
    });

    it('passes numeric minConfidence directly', async () => {
        await handleLabVerify({ action: 'recent', minConfidence: 0.3 });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ minConfidence: 0.3 }),
        );
    });

    it('passes search and nodeId filters', async () => {
        await handleLabVerify({ action: 'recent', search: 'quantum', nodeId: 'n1' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ search: 'quantum', nodeId: 'n1' }),
        );
    });

    it('omits undefined params when not provided', async () => {
        await handleLabVerify({ action: 'recent' });

        expect(mockGetRecentExecutions).toHaveBeenCalledWith(
            expect.objectContaining({
                days: undefined,
                limit: undefined,
                offset: undefined,
                status: undefined,
                verified: undefined,
                search: undefined,
                nodeId: undefined,
            }),
        );
    });
});

// =============================================================================
// Additional edge cases for stats
// =============================================================================

describe('action: stats (edge cases)', () => {
    it('parses string days to number', async () => {
        await handleLabVerify({ action: 'stats', days: '30' });
        expect(mockGetEVMStats).toHaveBeenCalledWith(30);
    });

    it('defaults to 7 when days is NaN string', async () => {
        await handleLabVerify({ action: 'stats', days: 'abc' });
        expect(mockGetEVMStats).toHaveBeenCalledWith(7);
    });
});

// =============================================================================
// Additional edge cases for reviews
// =============================================================================

describe('action: reviews (edge cases)', () => {
    it('parses string limit and offset to numbers', async () => {
        await handleLabVerify({ action: 'reviews', limit: '15', offset: '3' });

        expect(mockGetReviewQueue).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 15, offset: 3 }),
        );
    });
});

// =============================================================================
// Additional edge cases for reevaluate
// =============================================================================

describe('action: reevaluate (edge cases)', () => {
    it('converts string "true" dryRun to boolean', async () => {
        await handleLabVerify({ action: 'reevaluate', dryRun: 'true' });

        expect(mockReevaluateStoredResults).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: true }),
        );
    });

    it('omits nodeId when not provided', async () => {
        await handleLabVerify({ action: 'reevaluate' });

        expect(mockReevaluateStoredResults).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: false, nodeId: undefined }),
        );
    });
});

// =============================================================================
// Additional edge cases for reevaluate_reviews
// =============================================================================

describe('action: reevaluate_reviews (edge cases)', () => {
    it('converts string "true" rerunLLM to boolean', async () => {
        await handleLabVerify({ action: 'reevaluate_reviews', rerunLLM: 'true' });

        expect(mockReevaluateReviewQueue).toHaveBeenCalledWith(
            expect.objectContaining({ rerunLLM: true }),
        );
    });
});

// =============================================================================
// Additional edge cases for prune
// =============================================================================

describe('action: prune (edge cases)', () => {
    it('parses string olderThanDays to number', async () => {
        await handleLabVerify({ action: 'prune', olderThanDays: '60' });

        expect(mockPruneOldExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ olderThanDays: 60 }),
        );
    });

    it('omits olderThanDays when not provided', async () => {
        await handleLabVerify({ action: 'prune' });

        expect(mockPruneOldExecutions).toHaveBeenCalledWith(
            expect.objectContaining({ dryRun: false, olderThanDays: undefined }),
        );
    });
});

// =============================================================================
// Additional edge cases for enqueue
// =============================================================================

describe('action: enqueue (edge cases)', () => {
    it('uses "bulk" as queuedBy for bulk enqueue', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: false });

        await handleLabVerify({ action: 'enqueue', nodeIds: ['n1'] });

        expect(mockEnqueue).toHaveBeenCalledWith('n1', expect.objectContaining({
            queuedBy: 'bulk',
        }));
    });

    it('passes custom queuedBy for single enqueue', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: false });

        await handleLabVerify({ action: 'enqueue', nodeId: 'n1', queuedBy: 'gui' });

        expect(mockEnqueue).toHaveBeenCalledWith('n1', expect.objectContaining({
            queuedBy: 'gui',
        }));
    });

    it('does not trigger processNextEntry when enqueue fails', async () => {
        mockEnqueue.mockResolvedValue({ success: false });

        await handleLabVerify({ action: 'enqueue', nodeId: 'n1' });

        expect(mockProcessNextEntry).not.toHaveBeenCalled();
    });

    it('nodeIds takes priority over nodeId', async () => {
        mockEnqueue.mockResolvedValue({ success: true, existing: false });

        const result = await handleLabVerify({
            action: 'enqueue',
            nodeId: 'single',
            nodeIds: ['bulk1', 'bulk2'],
        });

        expect(result.total).toBe(2);
        expect(mockEnqueue).toHaveBeenCalledTimes(2);
        // nodeId='single' should not have been used
        expect(mockEnqueue).not.toHaveBeenCalledWith('single', expect.anything());
    });
});

// =============================================================================
// queue (edge cases)
// =============================================================================

describe('action: queue (edge cases)', () => {
    it('parses string limit and offset', async () => {
        await handleLabVerify({ action: 'queue', limit: '20', offset: '5' });

        expect(mockGetQueue).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 20, offset: 5 }),
        );
    });
});
