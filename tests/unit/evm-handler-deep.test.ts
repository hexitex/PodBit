/**
 * Deep coverage tests for handlers/evm.ts — targeting uncovered lines:
 *   Line 162: stdout JSON.parse in handleAnalyse (parsedOutput IIFE catch branch)
 *   Line 407: server-side AbortController timeout setup in handleDecompose
 *   Lines 449-450,452: AbortError catch in handleDecompose
 *   Lines 553,570: continue-on-failure in handleDecomposeApply for facts/questions
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------
const mockVerifyNode = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockVerifyNodeInternal = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockGetNodeVerifications = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetEVMStats = jest.fn<() => Promise<any>>().mockResolvedValue({ total: 0 });
const mockGetRecentExecutions = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0 });
const mockResolveContent = jest.fn<() => Promise<string>>().mockResolvedValue('resolved');
const mockGetReviewQueue = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0 });
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

const { handleLabVerify } = await import('../../handlers/evm.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue([]);
    mockGetNodeVerifications.mockResolvedValue([]);
    mockResolveContent.mockImplementation(async (s: string) => s);
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'new-1' } });
    mockIsBudgetExceeded.mockReturnValue(false);
    mockConfig.labVerify.postRejection.enabled = false;
    mockConfig.labVerify.postRejection.proposalEnabled = false;
});

// =============================================================================
// handleAnalyse — parsedOutput IIFE catch branch (line 162)
// When stdout is present but not valid JSON, the catch returns null
// =============================================================================

describe('handleAnalyse — stdout JSON parse catch', () => {
    it('sets parsedOutput to null when stdout is not valid JSON', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test node', domain: 'test' });
        mockGetNodeVerifications.mockResolvedValue([{
            status: 'completed',
            claim_supported: 0,
            verified: 0,
            hypothesis: 'test hypo',
            code: 'result = True',
            evaluation_mode: 'boolean',
            claim_type: 'numerical_identity',
            stdout: 'not-json-content',  // This triggers the catch on line 162
            stderr: '',
            exit_code: 0,
            execution_time_ms: 100,
            confidence: 0.3,
            score: 0.2,
            created_at: '2025-01-01',
        }]);
        mockAnalyseRejection.mockResolvedValue({
            claimType: 'numerical_identity',
            findings: 'some findings',
            recoveryProposal: null,
        });

        const result = await handleLabVerify({ action: 'analyse', nodeId: 'n1' });

        expect(result.nodeId).toBe('n1');
        expect(result.claimType).toBe('numerical_identity');
        expect(result.findings).toBe('some findings');
    });
});

// =============================================================================
// handleDecompose — AbortError handling (lines 449-450, 452)
// =============================================================================

describe('handleDecompose — AbortError timeout', () => {
    it('returns timeout error when callSubsystemModel throws AbortError (line 449-450)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test node', domain: 'test', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockIsBudgetExceeded.mockReturnValue(false);

        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        mockCallSubsystemModel.mockRejectedValue(abortError);

        const result = await handleLabVerify({ action: 'decompose', nodeId: 'n1' });

        expect(result.error).toContain('timed out');
        expect(result.error).toContain('270s');
    });

    it('re-throws non-AbortError exceptions (line 452)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'test', domain: 'd', weight: 0.5 });
        mockQuery.mockResolvedValue([]);
        mockGetNodeVerifications.mockResolvedValue([]);
        mockIsBudgetExceeded.mockReturnValue(false);

        const genericError = new Error('LLM connection failed');
        mockCallSubsystemModel.mockRejectedValue(genericError);

        await expect(handleLabVerify({ action: 'decompose', nodeId: 'n1' }))
            .rejects.toThrow('LLM connection failed');
    });
});

// =============================================================================
// handleDecomposeApply — continue on individual fact/question failures (lines 553, 570)
// =============================================================================

// =============================================================================
// handleDecomposeApply — skip invalid content entries (line 553)
// =============================================================================

describe('handleDecomposeApply — skip invalid entries', () => {
    it('skips question entries with missing or non-string content (line 553)', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'test', weight: 0.8 });

        // One valid fact to avoid "no nodes created" error
        mockHandlePropose.mockResolvedValue({ success: true, node: { id: 'f1' } });

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [{ content: 'valid fact', category: 'definition' }],
            questions: [
                { content: null, reasoning: 'test' },           // null content
                { content: 123, reasoning: 'test' },            // non-string content
                { content: '', reasoning: 'test' },             // empty string
            ],
        });

        // Only the fact should be created, all questions skipped
        expect(result.createdFacts).toHaveLength(1);
        expect(result.createdQuestions).toHaveLength(0);
        // handlePropose called once (for the fact), not for any questions
        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
    });
});

describe('handleDecomposeApply — individual proposal failures', () => {
    it('continues when a fact proposal throws and still creates others', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'test', weight: 0.8 });
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // First fact throws, second succeeds
        mockHandlePropose
            .mockRejectedValueOnce(new Error('fact creation failed'))
            .mockResolvedValueOnce({ success: true, node: { id: 'f2' } });

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [
                { content: 'fact one that will fail', category: 'definition' },
                { content: 'fact two that succeeds', category: 'observation' },
            ],
            questions: [],
        });

        expect(result.createdFacts).toHaveLength(1);
        expect(result.totalCreated).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[evm:decompose]'),
            // Not checking exact message because it's a string interpolation
        );
        consoleErrorSpy.mockRestore();
    });

    it('continues when a question proposal throws and still creates others', async () => {
        mockQueryOne.mockResolvedValue({ id: 'n1', content: 'original', domain: 'test', weight: 0.8 });
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // First question throws, second succeeds
        mockHandlePropose
            .mockRejectedValueOnce(new Error('question creation failed'))
            .mockResolvedValueOnce({ success: true, node: { id: 'q2' } });

        const result = await handleLabVerify({
            action: 'decompose_apply',
            nodeId: 'n1',
            facts: [],
            questions: [
                { content: 'question one that fails', reasoning: 'test' },
                { content: 'question two that succeeds', reasoning: 'test' },
            ],
        });

        expect(result.createdQuestions).toHaveLength(1);
        expect(result.totalCreated).toBe(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[evm:decompose]'),
        );
        consoleErrorSpy.mockRestore();
    });
});
