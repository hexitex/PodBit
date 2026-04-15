/**
 * Unit tests for core/tensions.ts — detectTensionSignals, findTensions,
 * generateQuestion, createQuestionNode.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------- mocks ----------

const mockQuery = jest.fn<any>();
const mockCallSubsystemModel = jest.fn<any>();
const mockGetAssignedModel = jest.fn<any>();
const mockGetPrompt = jest.fn<any>();
const mockGetProjectContextBlock = jest.fn<any>();
const mockParseEmbedding = jest.fn<any>();
const mockCosineSimilarity = jest.fn<any>();
const mockGetAccessibleDomains = jest.fn<any>();
const mockCreateNode = jest.fn<any>();
const mockCreateEdge = jest.fn<any>();

const mockConfig = {
    tensions: {
        patterns: [
            ['improve', 'harm'],
            ['increase', 'decrease'],
            ['enable', 'prevent'],
            ['safe', 'dangerous'],
            ['can', 'cannot'],
        ],
        negationBoost: 0.5,
        minSimilarity: 0.3,
        candidateLimit: 200,
    },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    parseEmbedding: mockParseEmbedding,
    cosineSimilarity: mockCosineSimilarity,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
}));

// Import after mocks
const { detectTensionSignals, findTensions, generateQuestion, createQuestionNode } =
    await import('../../core/tensions.js');

// ---------- setup ----------

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------- detectTensionSignals ----------

describe('detectTensionSignals', () => {
    it('detects pattern match when A has positive and B has negative', () => {
        const result = detectTensionSignals('this will improve results', 'this will harm results');
        expect(result.score).toBeGreaterThanOrEqual(1);
        expect(result.signals).toContain('improve/harm');
    });

    it('detects pattern match in reverse (A=negative, B=positive)', () => {
        const result = detectTensionSignals('this will harm outcomes', 'this will improve outcomes');
        expect(result.score).toBeGreaterThanOrEqual(1);
        expect(result.signals).toContain('improve/harm');
    });

    it('detects multiple pattern matches', () => {
        const result = detectTensionSignals(
            'will improve and increase safety',
            'will harm and decrease safety'
        );
        expect(result.score).toBeGreaterThanOrEqual(2);
        expect(result.signals).toContain('improve/harm');
        expect(result.signals).toContain('increase/decrease');
    });

    it('returns zero score when no patterns match', () => {
        const result = detectTensionSignals('hello world', 'goodbye world');
        expect(result.score).toBe(0);
        expect(result.signals).toEqual([]);
    });

    it('detects negation when only one side has "not "', () => {
        const result = detectTensionSignals('this is not possible', 'this is possible');
        expect(result.signals).toContain('negation');
        expect(result.score).toBe(mockConfig.tensions.negationBoost);
    });

    it('detects negation with contraction ("n\'t ")', () => {
        const result = detectTensionSignals("this doesn't work", 'this works well');
        expect(result.signals).toContain('negation');
    });

    it('does not flag negation when both sides have negation', () => {
        const result = detectTensionSignals('this is not good', 'that is not bad');
        expect(result.signals).not.toContain('negation');
    });

    it('is case-insensitive', () => {
        const result = detectTensionSignals('IMPROVE everything', 'HARM everything');
        expect(result.signals).toContain('improve/harm');
    });

    it('combines pattern and negation scores', () => {
        const result = detectTensionSignals(
            'this can improve things',
            "this cannot harm things but it's not clear"
        );
        // "can/cannot" + "improve/harm" patterns + negation from "not"
        expect(result.score).toBeGreaterThan(1);
    });
});

// ---------- findTensions ----------

describe('findTensions', () => {
    const makeNode = (id: string, content: string, domain: string) => ({
        id, content, domain, weight: 1.0, embedding: '[0.1, 0.2]',
    });

    it('returns tensions for high-similarity pairs with tension signals', async () => {
        const nodes = [
            makeNode('a', 'this will improve outcomes', 'dom1'),
            makeNode('b', 'this will harm outcomes', 'dom1'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.8);

        const results = await findTensions(10);
        expect(results.length).toBe(1);
        expect(results[0].nodeA.id).toBe('a');
        expect(results[0].nodeB.id).toBe('b');
        expect(results[0].similarity).toBe(0.8);
        expect(results[0].tensionScore).toBeGreaterThan(0);
        expect(results[0].signals).toContain('improve/harm');
    });

    it('skips pairs below minSimilarity', async () => {
        const nodes = [
            makeNode('a', 'this will improve outcomes', 'dom1'),
            makeNode('b', 'this will harm outcomes', 'dom1'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.1); // below 0.3 threshold

        const results = await findTensions(10);
        expect(results.length).toBe(0);
    });

    it('skips pairs with no tension signals', async () => {
        const nodes = [
            makeNode('a', 'hello world', 'dom1'),
            makeNode('b', 'hello earth', 'dom1'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.9);

        const results = await findTensions(10);
        expect(results.length).toBe(0);
    });

    it('enforces partition isolation for cross-domain pairs', async () => {
        const nodes = [
            makeNode('a', 'improve outcomes', 'dom1'),
            makeNode('b', 'harm outcomes', 'dom2'),
        ];
        mockQuery.mockResolvedValue(nodes);
        // dom1 cannot access dom2
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.9);

        const results = await findTensions(10);
        expect(results.length).toBe(0);
    });

    it('allows cross-domain pairs when partitions are bridged', async () => {
        const nodes = [
            makeNode('a', 'improve outcomes', 'dom1'),
            makeNode('b', 'harm outcomes', 'dom2'),
        ];
        mockQuery.mockResolvedValue(nodes);
        // dom1 can access dom2 via bridge
        mockGetAccessibleDomains.mockResolvedValue(['dom1', 'dom2']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.9);

        const results = await findTensions(10);
        expect(results.length).toBe(1);
    });

    it('uses domain filter when provided', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetAccessibleDomains.mockResolvedValue(['filtered-dom']);

        await findTensions(10, 'filtered-dom');

        // Should have called getAccessibleDomains with the domain
        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('filtered-dom');
        // Query should include domain filter params
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('AND domain IN'),
            ['filtered-dom']
        );
    });

    it('respects limit parameter', async () => {
        // Create many tension pairs
        const nodes = [];
        for (let i = 0; i < 10; i++) {
            nodes.push(makeNode(`a${i}`, 'improve outcomes', 'dom1'));
            nodes.push(makeNode(`b${i}`, 'harm outcomes', 'dom1'));
        }
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        mockCosineSimilarity.mockReturnValue(0.9);

        const results = await findTensions(3);
        expect(results.length).toBeLessThanOrEqual(3);
    });

    it('sorts by combined score descending', async () => {
        const nodes = [
            makeNode('a', 'improve outcomes', 'dom1'),
            makeNode('b', 'harm outcomes', 'dom1'),
            makeNode('c', 'increase and improve things', 'dom1'),
            makeNode('d', 'decrease and harm things', 'dom1'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue([0.5, 0.5]);
        // Give different similarities to create different combined scores
        mockCosineSimilarity
            .mockReturnValueOnce(0.5) // a-b
            .mockReturnValueOnce(0.5) // a-c
            .mockReturnValueOnce(0.5) // a-d
            .mockReturnValueOnce(0.5) // b-c
            .mockReturnValueOnce(0.5) // b-d
            .mockReturnValueOnce(0.9); // c-d (highest)

        const results = await findTensions(10);
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].combinedScore).toBeGreaterThanOrEqual(results[i].combinedScore);
        }
    });

    it('handles nodes with null embeddings gracefully', async () => {
        const nodes = [
            { id: 'a', content: 'improve things', domain: 'dom1', weight: 1, embedding: null },
            { id: 'b', content: 'harm things', domain: 'dom1', weight: 1, embedding: null },
        ];
        mockQuery.mockResolvedValue(nodes);
        mockGetAccessibleDomains.mockResolvedValue(['dom1']);
        mockParseEmbedding.mockReturnValue(null);
        mockCosineSimilarity.mockReturnValue(0);

        const results = await findTensions(10);
        // similarity = 0 which is below minSimilarity (0.3), so no results
        expect(results.length).toBe(0);
    });

    it('returns empty array when no nodes exist', async () => {
        mockQuery.mockResolvedValue([]);
        const results = await findTensions(10);
        expect(results).toEqual([]);
    });
});

// ---------- generateQuestion ----------

describe('generateQuestion', () => {
    const nodeA = { id: 'a', content: 'A content', domain: 'dom1' };
    const nodeB = { id: 'b', content: 'B content', domain: 'dom1' };

    it('returns parsed question from valid JSON response', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Why does this conflict?' }));

        const result = await generateQuestion(nodeA as any, nodeB as any);
        expect(result).toBe('Why does this conflict?');
    });

    it('appends ? if response does not end with one', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Why does this conflict' }));

        const result = await generateQuestion(nodeA as any, nodeB as any);
        expect(result).toBe('Why does this conflict?');
    });

    it('cleans up non-JSON response text', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        mockCallSubsystemModel.mockResolvedValue('Question: What is the issue?');

        const result = await generateQuestion(nodeA as any, nodeB as any);
        expect(result).toBe('What is the issue?');
    });

    it('strips leading prefix patterns from raw text', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        mockCallSubsystemModel.mockResolvedValue("Here's a good question?");

        const result = await generateQuestion(nodeA as any, nodeB as any);
        expect(result).toBe('a good question?');
    });

    it('strips surrounding quotes from raw text', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        // Use single quotes so JSON.parse fails and the raw-text fallback runs
        mockCallSubsystemModel.mockResolvedValue("'What is the conflict?'");

        const result = await generateQuestion(nodeA as any, nodeB as any);
        expect(result).toBe('What is the conflict?');
    });

    it('includes tension signals in prompt', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('prompt text');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Question?' }));

        await generateQuestion(nodeA as any, nodeB as any, ['improve/harm', 'negation']);

        expect(mockGetPrompt).toHaveBeenCalledWith('core.question_generation', expect.objectContaining({
            signalHint: expect.stringContaining('improve/harm'),
        }));
    });

    it('prepends project context when available', async () => {
        mockGetProjectContextBlock.mockResolvedValue('## Project Context\nThis is a project.');
        mockGetPrompt.mockResolvedValue('base prompt');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Q?' }));

        await generateQuestion(nodeA as any, nodeB as any);

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'voice',
            expect.stringContaining('## Project Context'),
            expect.any(Object)
        );
    });

    it('does not prepend context when block is empty', async () => {
        mockGetProjectContextBlock.mockResolvedValue('');
        mockGetPrompt.mockResolvedValue('base prompt');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Q?' }));

        await generateQuestion(nodeA as any, nodeB as any);

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'voice',
            'base prompt',
            expect.any(Object)
        );
    });
});

// ---------- createQuestionNode ----------

describe('createQuestionNode', () => {
    const nodeA = { id: 'a', content: 'A', domain: 'dom1' };
    const nodeB = { id: 'b', content: 'B', domain: 'dom2' };

    it('creates a question node and links to both parents', async () => {
        const createdNode = { id: 'q1' };
        mockCreateNode.mockResolvedValue(createdNode);
        mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'test-model' });

        const result = await createQuestionNode(nodeA as any, nodeB as any, 'Why the conflict?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Why the conflict?',
            'question',
            'tension',
            expect.objectContaining({
                domain: 'dom1',
                contributor: 'system',
                weight: 1.2,
                modelId: 'model-1',
                modelName: 'test-model',
            })
        );
        expect(mockCreateEdge).toHaveBeenCalledWith('a', 'q1', 'tension_source', 1.0);
        expect(mockCreateEdge).toHaveBeenCalledWith('b', 'q1', 'tension_source', 1.0);
        expect(result).toBe(createdNode);
    });

    it('returns null when dedup gate rejects the node', async () => {
        mockCreateNode.mockResolvedValue(null);
        mockGetAssignedModel.mockReturnValue(null);

        const result = await createQuestionNode(nodeA as any, nodeB as any, 'Duplicate question?');

        expect(result).toBeNull();
        expect(mockCreateEdge).not.toHaveBeenCalled();
    });

    it('falls back to nodeB domain when nodeA has no domain', async () => {
        const nodeANoDomain = { id: 'a', content: 'A', domain: null };
        mockCreateNode.mockResolvedValue({ id: 'q2' });
        mockGetAssignedModel.mockReturnValue(null);

        await createQuestionNode(nodeANoDomain as any, nodeB as any, 'Q?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Q?',
            'question',
            'tension',
            expect.objectContaining({ domain: 'dom2' })
        );
    });

    it('uses "unknown" domain when both nodes lack domains', async () => {
        const nA = { id: 'a', content: 'A', domain: null };
        const nB = { id: 'b', content: 'B', domain: null };
        mockCreateNode.mockResolvedValue({ id: 'q3' });
        mockGetAssignedModel.mockReturnValue(null);

        await createQuestionNode(nA as any, nB as any, 'Q?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Q?',
            'question',
            'tension',
            expect.objectContaining({ domain: 'unknown' })
        );
    });

    it('passes custom options through to createNode', async () => {
        mockCreateNode.mockResolvedValue({ id: 'q4' });
        mockGetAssignedModel.mockReturnValue(null);

        await createQuestionNode(nodeA as any, nodeB as any, 'Q?', { contributor: 'alice' });

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Q?',
            'question',
            'tension',
            expect.objectContaining({ contributor: 'alice' })
        );
    });

    it('handles null model assignment gracefully', async () => {
        mockCreateNode.mockResolvedValue({ id: 'q5' });
        mockGetAssignedModel.mockReturnValue(null);

        await createQuestionNode(nodeA as any, nodeB as any, 'Q?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Q?',
            'question',
            'tension',
            expect.objectContaining({
                modelId: null,
                modelName: null,
            })
        );
    });
});
