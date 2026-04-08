/**
 * Unit tests for core/cycles/questions.ts — runQuestionCycleSingle().
 *
 * Tests: question selection, domain exclusion, context node gathering,
 * embedding similarity, LLM call, answer creation, edge linking, dedup,
 * weight penalization, and error handling.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[]>>();
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>();
const mockGetAssignedModel = jest.fn<(...args: any[]) => any>();
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>();
const mockGetProjectContextBlock = jest.fn<(...args: any[]) => Promise<string | null>>();
const mockCosineSimilarity = jest.fn<(...args: any[]) => number>();
const mockParseEmbedding = jest.fn<(...args: any[]) => number[] | null>();
const mockCreateNode = jest.fn<(...args: any[]) => Promise<any>>();
const mockCreateEdge = jest.fn<(...args: any[]) => Promise<void>>();
const mockRecordBirth = jest.fn<(...args: any[]) => Promise<void>>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockResolveContent = jest.fn<(s: string) => Promise<string>>();
const mockBuildProvenanceTag = jest.fn<(...args: any[]) => string>();
const mockGetExcludedDomainsForCycle = jest.fn<(...args: any[]) => Promise<Set<string>>>();

const mockCfg = {
    batchSize: 5,
    candidatePoolSize: 50,
    contextMinSimilarity: 0.3,
    contextTopN: 3,
    weightFloor: 0.1,
    weightPenalty: 0.2,
};

const mockEngineConfig = {
    nodes: { defaultWeight: 1.0 },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: { questions: mockCfg },
    },
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockEngineConfig,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    callSubsystemModel: mockCallSubsystemModel,
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
}));

jest.unstable_mockModule('../../core/lifecycle.js', () => ({
    recordBirth: mockRecordBirth,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getExcludedDomainsForCycle: mockGetExcludedDomainsForCycle,
}));

const { runQuestionCycleSingle } = await import('../../core/cycles/questions.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeQuestion(id = 'q1', domain = 'sci', embedding: any = '[0.1,0.2]') {
    return {
        id, content: 'What is the mechanism?', weight: 1.0, domain,
        node_type: 'question', specificity: 1.0, embedding,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockResolveContent.mockImplementation(async (s: string) => s);
    mockBuildProvenanceTag.mockReturnValue('[seed/human]');
    mockGetProjectContextBlock.mockResolvedValue(null);
    mockGetPrompt.mockResolvedValue('Answer this question');
    mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'gpt-4' });
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockParseEmbedding.mockImplementation((e: any) => e ? JSON.parse(e) : null);
    mockCosineSimilarity.mockReturnValue(0.5);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runQuestionCycleSingle', () => {
    it('returns early when no unanswered questions found', async () => {
        mockQuery.mockResolvedValueOnce([]); // questions
        await runQuestionCycleSingle();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('filters out questions in excluded domains', async () => {
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['blocked']));
        mockQuery.mockResolvedValueOnce([makeQuestion('q1', 'blocked')]);
        await runQuestionCycleSingle();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('deprioritizes question when no context nodes found', async () => {
        const question = makeQuestion('q1', 'sci', null);
        mockQuery
            .mockResolvedValueOnce([question])  // questions
            .mockResolvedValueOnce([])          // tension sources (parents)
        ;

        await runQuestionCycleSingle();

        // Weight penalty applied
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET weight'),
            ['q1']
        );
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('gathers context from tension sources and embedding-similar nodes', async () => {
        const question = makeQuestion('q1', 'sci', '[0.1,0.2]');
        const tensionSource = { id: 'ts1', content: 'Source content', weight: 1.0, domain: 'sci', node_type: 'seed', embedding: '[0.1,0.3]' };
        const candidateNode = { id: 'cn1', content: 'Candidate', weight: 0.8, domain: 'sci', node_type: 'voiced', embedding: '[0.2,0.3]' };

        mockQuery
            .mockResolvedValueOnce([question])       // questions
            .mockResolvedValueOnce([tensionSource])   // tension sources
            .mockResolvedValueOnce([candidateNode])   // embedding candidates
        ;
        mockCosineSimilarity.mockReturnValue(0.6); // above contextMinSimilarity
        mockCallSubsystemModel.mockResolvedValue('{"answer":"The mechanism involves X."}');
        mockCreateNode.mockResolvedValue({ id: 'ans1' });
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('voice', expect.any(String), expect.anything());
        expect(mockCreateNode).toHaveBeenCalled();
    });

    it('skips candidates below contextMinSimilarity', async () => {
        const question = makeQuestion('q1', 'sci', '[0.1,0.2]');
        const tensionSource = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed', embedding: '[0.1,0.3]' };
        const lowSimCandidate = { id: 'cn1', content: 'Low sim', weight: 0.8, domain: 'sci', node_type: 'voiced', embedding: '[0.9,0.9]' };

        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([tensionSource])
            .mockResolvedValueOnce([lowSimCandidate])
        ;
        mockCosineSimilarity.mockReturnValue(0.1); // below 0.3
        mockCallSubsystemModel.mockResolvedValue('{"answer":"Answer text here for you."}');
        mockCreateNode.mockResolvedValue({ id: 'ans1' });
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        // LLM still called with tension source as context
        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });

    it('deprioritizes question on LLM call failure', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockCallSubsystemModel.mockRejectedValue(new Error('API timeout'));

        await runQuestionCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET weight'),
            ['q1']
        );
    });

    it('propagates AbortError from LLM call', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        mockCallSubsystemModel.mockRejectedValue(abortErr);

        await expect(runQuestionCycleSingle()).rejects.toThrow('Aborted');
    });

    it('deprioritizes question when answer is too short', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockCallSubsystemModel.mockResolvedValue('{"answer":"Short"}');

        await runQuestionCycleSingle();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET weight'),
            ['q1']
        );
        expect(mockCreateNode).not.toHaveBeenCalled();
    });

    it('handles non-JSON LLM response as raw text', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source content here', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockCallSubsystemModel.mockResolvedValue('The mechanism involves enzyme catalysis in the reaction pathway.');
        mockCreateNode.mockResolvedValue({ id: 'ans1' });
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        expect(mockCreateNode).toHaveBeenCalledWith(
            'The mechanism involves enzyme catalysis in the reaction pathway.',
            'voiced', 'question-cycle',
            expect.anything()
        );
    });

    it('skips dedup-rejected answers (createNode returns null)', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockCallSubsystemModel.mockResolvedValue('{"answer":"The answer is about the molecular mechanism."}');
        mockCreateNode.mockResolvedValue(null); // dedup rejection

        await runQuestionCycleSingle();

        expect(mockCreateEdge).not.toHaveBeenCalled();
    });

    it('creates edges and records birth on successful answer', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockCallSubsystemModel.mockResolvedValue('{"answer":"The mechanism involves specific protein folding patterns."}');
        mockCreateNode.mockResolvedValue({ id: 'ans1' });
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        // Parent edge from question to answer
        expect(mockCreateEdge).toHaveBeenCalledWith('q1', 'ans1', 'parent', 1.0);
        // Parent edge from context source to answer
        expect(mockCreateEdge).toHaveBeenCalledWith('ts1', 'ans1', 'parent', 0.5);
        // Birth record
        expect(mockRecordBirth).toHaveBeenCalledWith('ans1', ['q1', 'ts1']);
        // Metadata update
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE nodes SET metadata'),
            expect.arrayContaining([expect.stringContaining('"answered":true'), 'q1'])
        );
        // Activity
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'question_answered', expect.any(String),
            expect.objectContaining({ questionId: 'q1', answerId: 'ans1' })
        );
    });

    it('prepends project context to prompt when available', async () => {
        const question = makeQuestion('q1', 'sci', null);
        const source = { id: 'ts1', content: 'Source', weight: 1.0, domain: 'sci', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([question])
            .mockResolvedValueOnce([source])
        ;
        mockGetProjectContextBlock.mockResolvedValue('PROJECT: Knowledge graph tool');
        mockCallSubsystemModel.mockResolvedValue('{"answer":"The answer with project context is about the tool."}');
        mockCreateNode.mockResolvedValue({ id: 'ans1' });
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        const promptArg = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(promptArg).toContain('PROJECT: Knowledge graph tool');
    });

    it('processes multiple questions in a single batch', async () => {
        const q1 = makeQuestion('q1', 'sci', null);
        const q2 = makeQuestion('q2', 'math', null);
        const src1 = { id: 'ts1', content: 'Source 1', weight: 1.0, domain: 'sci', node_type: 'seed' };
        const src2 = { id: 'ts2', content: 'Source 2', weight: 1.0, domain: 'math', node_type: 'seed' };
        mockQuery
            .mockResolvedValueOnce([q1, q2])   // questions batch
            .mockResolvedValueOnce([src1])      // q1 tension sources
            // q1 has no embedding so no candidate query
            .mockResolvedValueOnce(undefined as any) // q1 metadata update (UPDATE returns undefined)
            .mockResolvedValueOnce([src2])      // q2 tension sources
            // q2 has no embedding so no candidate query
            .mockResolvedValueOnce(undefined as any) // q2 metadata update
        ;
        mockCallSubsystemModel
            .mockResolvedValueOnce('{"answer":"Answer one about the scientific mechanism in detail."}')
            .mockResolvedValueOnce('{"answer":"Answer two about the mathematical model and its properties."}')
        ;
        mockCreateNode
            .mockResolvedValueOnce({ id: 'a1' })
            .mockResolvedValueOnce({ id: 'a2' })
        ;
        mockCreateEdge.mockResolvedValue(undefined);
        mockRecordBirth.mockResolvedValue(undefined);

        await runQuestionCycleSingle();

        expect(mockCallSubsystemModel).toHaveBeenCalledTimes(2);
        expect(mockCreateNode).toHaveBeenCalledTimes(2);
    });
});
