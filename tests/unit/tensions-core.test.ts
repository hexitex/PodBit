/**
 * Unit tests for core/tensions.ts — tension detection, question generation, and question node creation.
 *
 * Mocks: db.js, models.js, prompts.js, project-context.js, engine-config.js,
 * scoring.js, governance.js, node-ops.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('{}');
const mockGetAssignedModel = jest.fn<(...args: any[]) => any>().mockReturnValue({ id: 'm1', name: 'TestModel' });
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('prompt text');
const mockGetProjectContextBlock = jest.fn<() => Promise<string>>().mockResolvedValue('');
const mockCosineSimilarity = jest.fn<(a: number[], b: number[]) => number>().mockReturnValue(0.8);
const mockParseEmbedding = jest.fn<(e: any) => number[] | null>().mockReturnValue([0.1, 0.2]);
const mockGetAccessibleDomains = jest.fn<(d: string) => Promise<string[]>>().mockResolvedValue([]);
const mockCreateNode = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 'q1', content: 'question?' });
const mockCreateEdge = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);

const tensionPatterns: [string, string][] = [
    ['increase', 'decrease'],
    ['always', 'never'],
    ['more', 'less'],
];

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
    config: {
        tensions: {
            patterns: tensionPatterns,
            negationBoost: 2,
            minSimilarity: 0.4,
            candidateLimit: 100,
        },
    },
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
jest.unstable_mockModule('../../core/types.js', () => ({}));

const { detectTensionSignals, findTensions, generateQuestion, createQuestionNode } =
    await import('../../core/tensions.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockGetAssignedModel.mockReturnValue({ id: 'm1', name: 'TestModel' });
    mockGetPrompt.mockResolvedValue('prompt text');
    mockGetProjectContextBlock.mockResolvedValue('');
    mockCosineSimilarity.mockReturnValue(0.8);
    mockParseEmbedding.mockReturnValue([0.1, 0.2]);
    mockGetAccessibleDomains.mockResolvedValue([]);
    mockCreateNode.mockResolvedValue({ id: 'q1', content: 'question?' });
    mockCreateEdge.mockResolvedValue(undefined);
});

// =============================================================================
// detectTensionSignals
// =============================================================================

describe('detectTensionSignals', () => {
    it('detects matching tension pattern (increase/decrease)', () => {
        const result = detectTensionSignals('temperature increase observed', 'sharp decrease in values');
        expect(result.score).toBeGreaterThan(0);
        expect(result.signals).toContain('increase/decrease');
    });

    it('detects always/never pattern', () => {
        const result = detectTensionSignals('this always happens', 'this never occurs');
        expect(result.score).toBeGreaterThan(0);
        expect(result.signals).toContain('always/never');
    });

    it('detects negation asymmetry', () => {
        const result = detectTensionSignals('the process is reversible', "the process isn't efficient");
        expect(result.signals).toContain('negation');
    });

    it('detects negation with "not"', () => {
        const result = detectTensionSignals('the system works well', 'the system does not scale');
        expect(result.signals).toContain('negation');
    });

    it('returns score 0 when no tension signals', () => {
        const result = detectTensionSignals('the sky is blue', 'water is wet');
        expect(result.score).toBe(0);
        expect(result.signals).toEqual([]);
    });

    it('accumulates multiple tension signals', () => {
        const result = detectTensionSignals(
            'always increase more',
            'never decrease less'
        );
        // Should detect increase/decrease, always/never, more/less
        expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('is case-insensitive', () => {
        const result = detectTensionSignals('ALWAYS Increase', 'never Decrease');
        expect(result.score).toBeGreaterThan(0);
    });
});

// =============================================================================
// findTensions
// =============================================================================

describe('findTensions', () => {
    const makeNode = (id: string, content: string, domain: string) => ({
        id, content, embedding: '[0.1,0.2]', domain, weight: 1.0,
    });

    it('returns empty array when no nodes found', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await findTensions();
        expect(result).toEqual([]);
    });

    it('finds tensions between contradicting nodes', async () => {
        const nodes = [
            makeNode('a', 'temperature always increases', 'physics'),
            makeNode('b', 'temperature never decreases', 'physics'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockCosineSimilarity.mockReturnValue(0.8); // high similarity
        mockParseEmbedding.mockReturnValue([0.1, 0.2, 0.3]);

        const result = await findTensions();

        expect(result.length).toBe(1);
        expect(result[0].nodeA.id).toBe('a');
        expect(result[0].nodeB.id).toBe('b');
        expect(result[0].similarity).toBe(0.8);
        expect(result[0].tensionScore).toBeGreaterThan(0);
    });

    it('skips pairs below minSimilarity', async () => {
        const nodes = [
            makeNode('a', 'always increase', 'dom'),
            makeNode('b', 'never decrease', 'dom'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockCosineSimilarity.mockReturnValue(0.1); // below 0.4 threshold
        mockParseEmbedding.mockReturnValue([0.1, 0.2]);

        const result = await findTensions();

        expect(result).toEqual([]);
    });

    it('respects limit parameter', async () => {
        const nodes = [
            makeNode('a', 'always more increase', 'dom'),
            makeNode('b', 'never less decrease', 'dom'),
            makeNode('c', 'always more increase again', 'dom'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockCosineSimilarity.mockReturnValue(0.8);
        mockParseEmbedding.mockReturnValue([0.1, 0.2]);

        const result = await findTensions(1);

        expect(result.length).toBeLessThanOrEqual(1);
    });

    it('uses getAccessibleDomains when domain is specified', async () => {
        mockGetAccessibleDomains.mockResolvedValue(['dom1', 'dom2']);
        mockQuery.mockResolvedValue([]);

        await findTensions(10, 'dom1');

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('dom1');
    });

    it('sorts results by combinedScore descending', async () => {
        const nodes = [
            makeNode('a', 'always increase more', 'dom'),
            makeNode('b', 'never decrease less', 'dom'),
            makeNode('c', 'always increase', 'dom'),
        ];
        mockQuery.mockResolvedValue(nodes);
        mockCosineSimilarity.mockReturnValue(0.8);
        mockParseEmbedding.mockReturnValue([0.1, 0.2]);

        const result = await findTensions();

        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].combinedScore).toBeGreaterThanOrEqual(result[i].combinedScore);
        }
    });
});

// =============================================================================
// generateQuestion
// =============================================================================

describe('generateQuestion', () => {
    const nodeA = { id: 'a', content: 'A content', domain: 'd' } as any;
    const nodeB = { id: 'b', content: 'B content', domain: 'd' } as any;

    it('calls voice subsystem and returns parsed question', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'What is the relationship?' }));

        const q = await generateQuestion(nodeA, nodeB);

        expect(q).toBe('What is the relationship?');
        expect(mockCallSubsystemModel).toHaveBeenCalledWith('voice', expect.any(String), expect.any(Object));
    });

    it('appends ? if missing', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'What is the relationship' }));

        const q = await generateQuestion(nodeA, nodeB);

        expect(q.endsWith('?')).toBe(true);
    });

    it('falls back to cleaning raw text on JSON parse failure', async () => {
        mockCallSubsystemModel.mockResolvedValue('What about this');

        const q = await generateQuestion(nodeA, nodeB);

        expect(q).toBe('What about this?');
    });

    it('strips common prefixes from raw text', async () => {
        mockCallSubsystemModel.mockResolvedValue('Question: Why does it diverge');

        const q = await generateQuestion(nodeA, nodeB);

        expect(q).toBe('Why does it diverge?');
    });

    it('includes tension signals in prompt when provided', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Why?' }));

        await generateQuestion(nodeA, nodeB, ['increase/decrease', 'negation']);

        expect(mockGetPrompt).toHaveBeenCalledWith('core.question_generation', expect.objectContaining({
            signalHint: expect.stringContaining('increase/decrease'),
        }));
    });

    it('prepends project context when available', async () => {
        mockGetProjectContextBlock.mockResolvedValue('Project: TestProject');
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({ question: 'Why?' }));

        await generateQuestion(nodeA, nodeB);

        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt.startsWith('Project: TestProject')).toBe(true);
    });
});

// =============================================================================
// createQuestionNode
// =============================================================================

describe('createQuestionNode', () => {
    const nodeA = { id: 'a', content: 'A', domain: 'domA' } as any;
    const nodeB = { id: 'b', content: 'B', domain: 'domB' } as any;

    it('creates a question node with correct parameters', async () => {
        const result = await createQuestionNode(nodeA, nodeB, 'What is X?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'What is X?',
            'question',
            'tension',
            expect.objectContaining({
                domain: 'domA',
                contributor: 'system',
                weight: 1.2,
                modelId: 'm1',
                modelName: 'TestModel',
            }),
        );
        expect(result).toBeTruthy();
    });

    it('creates edges linking question to both parent nodes', async () => {
        await createQuestionNode(nodeA, nodeB, 'What is X?');

        expect(mockCreateEdge).toHaveBeenCalledTimes(2);
        expect(mockCreateEdge).toHaveBeenCalledWith('a', 'q1', 'tension_source', 1.0);
        expect(mockCreateEdge).toHaveBeenCalledWith('b', 'q1', 'tension_source', 1.0);
    });

    it('returns null when dedup rejects the node', async () => {
        mockCreateNode.mockResolvedValue(null);

        const result = await createQuestionNode(nodeA, nodeB, 'What is X?');

        expect(result).toBeNull();
        expect(mockCreateEdge).not.toHaveBeenCalled();
    });

    it('uses nodeB domain when nodeA has no domain', async () => {
        const nodomA = { id: 'a', content: 'A', domain: null } as any;

        await createQuestionNode(nodomA, nodeB, 'What?');

        expect(mockCreateNode).toHaveBeenCalledWith(
            'What?', 'question', 'tension',
            expect.objectContaining({ domain: 'domB' }),
        );
    });

    it('passes custom options through', async () => {
        await createQuestionNode(nodeA, nodeB, 'Q?', { contributor: 'user' });

        expect(mockCreateNode).toHaveBeenCalledWith(
            'Q?', 'question', 'tension',
            expect.objectContaining({ contributor: 'user' }),
        );
    });
});
