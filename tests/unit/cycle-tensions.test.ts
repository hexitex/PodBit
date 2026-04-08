/**
 * Unit tests for core/cycles/tensions.ts — runTensionCycleSingle().
 *
 * Tests the tension cycle orchestration: pending question cap, domain exclusion,
 * duplicate pair check, question generation, and audit trail.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockFindTensions = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockGenerateQuestion = jest.fn<(...args: any[]) => Promise<string>>();
const mockCreateQuestionNode = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetExcludedDomainsForCycle = jest.fn<(...args: any[]) => Promise<Set<string>>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();

const mockCfg = {
    maxPendingQuestions: 10,
    maxQuestionsPerCycle: 3,
};

jest.unstable_mockModule('../../db.js', () => ({
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: { tensions: mockCfg },
    },
}));

jest.unstable_mockModule('../../core/tensions.js', () => ({
    findTensions: mockFindTensions,
    generateQuestion: mockGenerateQuestion,
    createQuestionNode: mockCreateQuestionNode,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getExcludedDomainsForCycle: mockGetExcludedDomainsForCycle,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const { runTensionCycleSingle } = await import('../../core/cycles/tensions.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTension(idA: string, idB: string, domainA = 'sci', domainB = 'sci') {
    return {
        nodeA: { id: idA, domain: domainA },
        nodeB: { id: idB, domain: domainB },
        signals: { similarity: 0.9 },
    };
}

function makeNode(id: string) {
    return { id, content: `Content of ${id}`, domain: 'sci', weight: 1.0 };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockCfg.maxPendingQuestions = 10;
    mockCfg.maxQuestionsPerCycle = 3;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runTensionCycleSingle', () => {
    it('returns early when pending questions exceed the cap', async () => {
        mockQueryOne.mockResolvedValueOnce({ cnt: 15 }); // pending count
        await runTensionCycleSingle();
        expect(mockFindTensions).not.toHaveBeenCalled();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'tensions_backlogged', expect.any(String), expect.objectContaining({ pending: 15 })
        );
    });

    it('returns early when findTensions returns empty', async () => {
        mockQueryOne.mockResolvedValueOnce({ cnt: 0 });
        mockFindTensions.mockResolvedValue([]);
        await runTensionCycleSingle();
        expect(mockGenerateQuestion).not.toHaveBeenCalled();
    });

    it('filters out tensions in excluded domains', async () => {
        mockQueryOne.mockResolvedValueOnce({ cnt: 0 });
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['blocked']));
        mockFindTensions.mockResolvedValue([
            makeTension('a1', 'b1', 'blocked', 'sci'),
            makeTension('a2', 'b2', 'sci', 'blocked'),
        ]);
        await runTensionCycleSingle();
        // All tensions filtered out — no questions generated
        expect(mockGenerateQuestion).not.toHaveBeenCalled();
    });

    it('skips tension pair if a question already exists for the pair', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })           // pending count
            .mockResolvedValueOnce({ id: 'existing-q' }) // existing question check
        ;
        mockFindTensions.mockResolvedValue([makeTension('a1', 'b1')]);
        await runTensionCycleSingle();
        expect(mockGenerateQuestion).not.toHaveBeenCalled();
    });

    it('skips when queryOne returns null for nodeA or nodeB', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })   // pending count
            .mockResolvedValueOnce(null)          // no existing question
            .mockResolvedValueOnce(null)          // nodeA not found
            .mockResolvedValueOnce(null)          // nodeB not found
        ;
        mockFindTensions.mockResolvedValue([makeTension('a1', 'b1')]);
        await runTensionCycleSingle();
        expect(mockGenerateQuestion).not.toHaveBeenCalled();
    });

    it('creates a question node on success', async () => {
        const nodeA = makeNode('a1');
        const nodeB = makeNode('b1');
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })   // pending count
            .mockResolvedValueOnce(null)          // no existing question
            .mockResolvedValueOnce(nodeA)         // load nodeA
            .mockResolvedValueOnce(nodeB)         // load nodeB
        ;
        mockFindTensions.mockResolvedValue([makeTension('a1', 'b1')]);
        mockGenerateQuestion.mockResolvedValue('What is the relationship between X and Y?');
        mockCreateQuestionNode.mockResolvedValue({ id: 'q1' });

        await runTensionCycleSingle();

        expect(mockGenerateQuestion).toHaveBeenCalledWith(nodeA, nodeB, expect.anything());
        expect(mockCreateQuestionNode).toHaveBeenCalledWith(nodeA, nodeB, 'What is the relationship between X and Y?', { contributor: 'tension-cycle' });
        expect(mockEmitActivity).toHaveBeenCalledWith('cycle', 'tension_question', expect.any(String), expect.objectContaining({ questionId: 'q1' }));
        expect(mockEmitActivity).toHaveBeenCalledWith('cycle', 'tensions_complete', expect.any(String), { count: 1 });
    });

    it('skips if createQuestionNode returns null (dedup)', async () => {
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(makeNode('a1'))
            .mockResolvedValueOnce(makeNode('b1'))
        ;
        mockFindTensions.mockResolvedValue([makeTension('a1', 'b1')]);
        mockGenerateQuestion.mockResolvedValue('Question?');
        mockCreateQuestionNode.mockResolvedValue(null);

        await runTensionCycleSingle();

        // No tension_question activity since dedup rejected it
        const calls = mockEmitActivity.mock.calls.map(c => c[1]);
        expect(calls).not.toContain('tension_question');
    });

    it('respects maxQuestionsPerCycle', async () => {
        mockCfg.maxQuestionsPerCycle = 1;
        const tensions = [makeTension('a1', 'b1'), makeTension('a2', 'b2')];
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })
            // First tension
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(makeNode('a1'))
            .mockResolvedValueOnce(makeNode('b1'))
        ;
        mockFindTensions.mockResolvedValue(tensions);
        mockGenerateQuestion.mockResolvedValue('Q?');
        mockCreateQuestionNode.mockResolvedValue({ id: 'q1' });

        await runTensionCycleSingle();

        expect(mockGenerateQuestion).toHaveBeenCalledTimes(1);
    });

    it('stops creating questions when pending+created reaches maxPending', async () => {
        mockCfg.maxPendingQuestions = 1;
        mockCfg.maxQuestionsPerCycle = 5;
        mockQueryOne
            .mockResolvedValueOnce({ cnt: 0 })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(makeNode('a1'))
            .mockResolvedValueOnce(makeNode('b1'))
        ;
        mockFindTensions.mockResolvedValue([makeTension('a1', 'b1'), makeTension('a2', 'b2')]);
        mockGenerateQuestion.mockResolvedValue('Q?');
        mockCreateQuestionNode.mockResolvedValue({ id: 'q1' });

        await runTensionCycleSingle();

        // Only 1 question created because pending(0) + created(1) >= maxPending(1)
        expect(mockGenerateQuestion).toHaveBeenCalledTimes(1);
    });
});
