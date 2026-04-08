/**
 * Unit tests for core/embedding-eval.ts ��� instruction-aware embedding evaluation.
 *
 * Tests: cosineSim, checkDrift, checkLexicalBridge, checkNumberRecycling,
 * checkToxicParent, evaluateNode. All external calls (getEmbedding, DB) are mocked.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
    systemQuery: jest.fn().mockResolvedValue([]),
    systemQueryOne: jest.fn().mockResolvedValue(null),
    systemTransactionSync: jest.fn(),
    transactionSync: jest.fn(),
}));

const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[] | null>>();
const mockGetEmbeddingModelName = jest.fn<() => string>().mockReturnValue('test-model');

jest.unstable_mockModule('../../models/embedding.js', () => ({
    getEmbedding: mockGetEmbedding,
    getEmbeddingModelName: mockGetEmbeddingModelName,
}));

const embeddingEvalCfg = {
    enabled: true,
    shadowMode: true,
    endpoint: 'http://127.0.0.1:1234/v1',
    model: 'test-model',
    maxChars: 8192,
    driftFailThreshold: 0.92,
    lexicalBridgeHighThreshold: 0.85,
    lexicalBridgeLowThreshold: 0.30,
    numberRecyclingThreshold: 0.88,
    toxicParentThreshold: 0.80,
    toxicParentMinChildren: 3,
    toxicParentMinDomains: 2,
    boostMultiplier: 1.1,
    instructStructuralClaim: 'Represent the structural claim of this text',
    instructMechanicalProcess: 'Represent the mechanical process described',
    instructQuantitativeClaims: 'Represent the quantitative claims made',
    instructDomainContribution: 'Represent the domain-specific contribution',
};

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        embeddingEval: embeddingEvalCfg,
    },
}));

const {
    cosineSim,
    checkDrift,
    checkLexicalBridge,
    checkNumberRecycling,
    checkToxicParent,
    evaluateNode,
    getInstructionEmbedding,
} = await import('../../core/embedding-eval.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
    mockGetEmbedding.mockResolvedValue(null);
    mockGetEmbeddingModelName.mockReturnValue('test-model');
    // Reset config to defaults
    Object.assign(embeddingEvalCfg, {
        enabled: true,
        shadowMode: true,
        driftFailThreshold: 0.92,
        lexicalBridgeHighThreshold: 0.85,
        lexicalBridgeLowThreshold: 0.30,
        numberRecyclingThreshold: 0.88,
        toxicParentThreshold: 0.80,
        toxicParentMinChildren: 3,
        toxicParentMinDomains: 2,
    });
});

/** Create a fake L2-normalized embedding vector */
function makeVec(values: number[]): number[] {
    let norm = 0;
    for (const v of values) norm += v * v;
    norm = Math.sqrt(norm);
    return norm > 0 ? values.map(v => v / norm) : values;
}

/** Mock getEmbedding to return a single vector for all calls */
function mockEmbeddingReturn(vec: number[]) {
    mockGetEmbedding.mockResolvedValue(vec);
}

/** Mock getEmbedding to fail (return null) */
function mockEmbeddingFailure() {
    mockGetEmbedding.mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// cosineSim
// ---------------------------------------------------------------------------
describe('cosineSim', () => {
    it('returns 1.0 for identical unit vectors', () => {
        const v = makeVec([1, 0, 0]);
        expect(cosineSim(v, v)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
        const a = makeVec([1, 0, 0]);
        const b = makeVec([0, 1, 0]);
        expect(cosineSim(a, b)).toBeCloseTo(0.0, 5);
    });

    it('returns ~-1 for opposite vectors', () => {
        const a = makeVec([1, 0]);
        const b = makeVec([-1, 0]);
        expect(cosineSim(a, b)).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for mismatched dimensions', () => {
        expect(cosineSim([1, 0], [1, 0, 0])).toBe(0);
    });

    it('computes correct similarity for arbitrary vectors', () => {
        const a = makeVec([1, 2, 3]);
        const b = makeVec([4, 5, 6]);
        // dot product of normalized vectors should be cos(angle)
        const sim = cosineSim(a, b);
        expect(sim).toBeGreaterThan(0.9); // these are nearly aligned
        expect(sim).toBeLessThanOrEqual(1.0);
    });
});

// ---------------------------------------------------------------------------
// checkDrift (Mode 8)
// ---------------------------------------------------------------------------
describe('checkDrift', () => {
    it('returns PASS when embedding call fails', async () => {
        mockEmbeddingFailure();
        // DB cache miss
        mockQuery.mockResolvedValue([]);

        const result = await checkDrift('node-1', 'test content', [
            { id: 'p1', content: 'parent content' },
        ]);

        expect(result.mode).toBe(8);
        expect(result.modeName).toBe('self_reinforcing_drift');
        expect(result.result).toBe('PASS');
        expect(result.score).toBe(-1);
    });

    it('returns PASS when similarity is below threshold', async () => {
        // Child vector: [1, 0, 0] (normalized)
        const childVec = makeVec([1, 0, 0]);
        // Parent vector: [0, 1, 0] (orthogonal → sim ≈ 0)
        const parentVec = makeVec([0, 1, 0]);

        // DB cache misses
        mockQuery.mockResolvedValue([]);
        // getEmbedding returns different vectors for sequential calls
        mockGetEmbedding
            .mockResolvedValueOnce(childVec)
            .mockResolvedValueOnce(parentVec);

        const result = await checkDrift('node-1', 'child content', [
            { id: 'p1', content: 'parent content' },
        ]);

        expect(result.result).toBe('PASS');
        expect(result.score).toBeCloseTo(0.0, 1);
    });

    it('returns FAIL when child is too similar to parent', async () => {
        const vec = makeVec([1, 0.1, 0]); // nearly identical vectors

        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(vec);

        embeddingEvalCfg.driftFailThreshold = 0.9;

        const result = await checkDrift('node-1', 'paraphrased content', [
            { id: 'p1', content: 'original content' },
        ]);

        expect(result.result).toBe('FAIL');
        expect(result.score).toBeGreaterThanOrEqual(0.9);
    });

    it('compares against multiple parents and uses max similarity', async () => {
        const childVec = makeVec([1, 0, 0]);
        const parent1Vec = makeVec([0, 1, 0]); // orthogonal
        const parent2Vec = makeVec([0.99, 0.1, 0]); // very close

        mockQuery.mockResolvedValue([]);
        mockGetEmbedding
            .mockResolvedValueOnce(childVec)
            .mockResolvedValueOnce(parent1Vec)
            .mockResolvedValueOnce(parent2Vec);

        embeddingEvalCfg.driftFailThreshold = 0.9;

        const result = await checkDrift('node-1', 'content', [
            { id: 'p1', content: 'parent 1' },
            { id: 'p2', content: 'parent 2' },
        ]);

        // Should use max similarity (to p2, which is very close)
        expect(result.score).toBeGreaterThan(0.5);
        expect(result.comparedTo).toContain('p2');
    });
});

// ---------------------------------------------------------------------------
// checkLexicalBridge (Mode 1)
// ---------------------------------------------------------------------------
describe('checkLexicalBridge', () => {
    it('returns PASS with skip message when fewer than 2 parents', async () => {
        const result = await checkLexicalBridge('node-1', 'content', [
            { id: 'p1', content: 'only parent' },
        ]);

        expect(result.mode).toBe(1);
        expect(result.modeName).toBe('lexical_bridge');
        expect(result.result).toBe('PASS');
        expect(result.comparedTo).toContain('skipped');
    });

    it('returns PASS when child integrates both parents', async () => {
        // All vectors are somewhat similar but not identical
        const childVec = makeVec([1, 1, 0]);
        const parent1Vec = makeVec([1, 0, 0]);
        const parent2Vec = makeVec([0, 1, 0]);

        mockQuery.mockResolvedValue([]);
        mockGetEmbedding
            .mockResolvedValueOnce(childVec)
            .mockResolvedValueOnce(parent1Vec)
            .mockResolvedValueOnce(parent2Vec);

        const result = await checkLexicalBridge('node-1', 'balanced synthesis', [
            { id: 'p1', content: 'parent 1' },
            { id: 'p2', content: 'parent 2' },
        ]);

        expect(result.result).toBe('PASS');
    });

    it('returns FAIL when child only captures one parent', async () => {
        const childVec = makeVec([1, 0, 0]);
        const parent1Vec = makeVec([1, 0.05, 0]); // very close to child
        const parent2Vec = makeVec([0, 0, 1]);     // orthogonal to child

        mockQuery.mockResolvedValue([]);
        mockGetEmbedding
            .mockResolvedValueOnce(childVec)
            .mockResolvedValueOnce(parent1Vec)
            .mockResolvedValueOnce(parent2Vec);

        embeddingEvalCfg.lexicalBridgeHighThreshold = 0.85;
        embeddingEvalCfg.lexicalBridgeLowThreshold = 0.30;

        const result = await checkLexicalBridge('node-1', 'one-sided synthesis', [
            { id: 'p1', content: 'parent 1' },
            { id: 'p2', content: 'parent 2' },
        ]);

        expect(result.result).toBe('FAIL');
    });

    it('returns PASS on embedding failure', async () => {
        mockQuery.mockResolvedValue([]);
        mockEmbeddingFailure();

        const result = await checkLexicalBridge('node-1', 'content', [
            { id: 'p1', content: 'parent 1' },
            { id: 'p2', content: 'parent 2' },
        ]);

        expect(result.result).toBe('PASS');
        expect(result.score).toBe(-1);
    });
});

// ---------------------------------------------------------------------------
// checkNumberRecycling (Mode 4)
// ---------------------------------------------------------------------------
describe('checkNumberRecycling', () => {
    it('returns PASS when content has no numbers', async () => {
        const result = await checkNumberRecycling('node-1', 'no numbers here', 'domain-a');

        expect(result.mode).toBe(4);
        expect(result.modeName).toBe('number_recycling');
        expect(result.result).toBe('PASS');
        expect(result.score).toBe(0);
        expect(result.comparedTo).toContain('no numbers');
    });

    it('returns PASS on embedding failure', async () => {
        mockQuery.mockResolvedValue([]);
        mockEmbeddingFailure();

        const result = await checkNumberRecycling('node-1', 'contains 42.5%', 'domain-a');

        expect(result.result).toBe('PASS');
        expect(result.score).toBe(-1);
    });

    it('returns PASS when no cross-domain matches exceed threshold', async () => {
        const nodeVec = makeVec([1, 0, 0]);
        const otherVec = makeVec([0, 1, 0]); // orthogonal

        // Re-mock query to handle the sequential calls properly
        mockQuery.mockImplementation(async (...args: any[]) => {
            const sql = args[0] as string;
            if (sql.includes('embedding_eval_cache')) return [];
            if (sql.includes('INSERT OR REPLACE')) return [];
            if (sql.includes('FROM nodes')) {
                return [{ id: 'other-1', content: 'different 99.9%', domain: 'domain-b' }];
            }
            return [];
        });

        // getEmbedding returns different vectors for sequential calls
        mockGetEmbedding
            .mockResolvedValueOnce(nodeVec)
            .mockResolvedValueOnce(otherVec);

        const result = await checkNumberRecycling('node-1', 'contains 42.5%', 'domain-a');

        expect(result.result).toBe('PASS');
    });
});

// ---------------------------------------------------------------------------
// checkToxicParent (Mode 7)
// ---------------------------------------------------------------------------
describe('checkToxicParent', () => {
    it('returns null when parent has fewer children than minimum', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 'c1', content: 'child 1', domain: 'dom-a' },
        ]); // only 1 child, min is 3

        const result = await checkToxicParent('parent-1', 'parent content');
        expect(result).toBeNull();
    });

    it('returns null when children span fewer domains than minimum', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 'c1', content: 'child 1', domain: 'dom-a' },
            { id: 'c2', content: 'child 2', domain: 'dom-a' },
            { id: 'c3', content: 'child 3', domain: 'dom-a' },
        ]); // 3 children but only 1 domain, min is 2

        const result = await checkToxicParent('parent-1', 'parent content');
        expect(result).toBeNull();
    });

    it('returns PASS when mean similarity is below threshold', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 'c1', content: 'child 1', domain: 'dom-a' },
            { id: 'c2', content: 'child 2', domain: 'dom-b' },
            { id: 'c3', content: 'child 3', domain: 'dom-c' },
        ]);

        // Parent and children have low similarity
        const parentVec = makeVec([1, 0, 0]);
        const childVecs = [
            makeVec([0, 1, 0]),
            makeVec([0, 0, 1]),
            makeVec([0, 1, 1]),
        ];

        mockQuery.mockResolvedValue([]); // cache misses
        mockGetEmbedding
            .mockResolvedValueOnce(parentVec)
            .mockResolvedValueOnce(childVecs[0])
            .mockResolvedValueOnce(childVecs[1])
            .mockResolvedValueOnce(childVecs[2]);

        const result = await checkToxicParent('parent-1', 'parent content');
        expect(result).not.toBeNull();
        expect(result!.result).toBe('PASS');
        expect(result!.mode).toBe(7);
    });
});

// ---------------------------------------------------------------------------
// evaluateNode (aggregate)
// ---------------------------------------------------------------------------
describe('evaluateNode', () => {
    it('runs drift and number recycling checks for single-parent node', async () => {
        // Mock all embedding calls to return orthogonal vectors (all PASS)
        const vec2 = makeVec([0, 1, 0]);

        mockQuery.mockResolvedValue([]); // cache misses
        mockGetEmbedding.mockResolvedValue(vec2);

        const result = await evaluateNode('node-1', 'no numbers here', 'domain-a', [
            { id: 'p1', content: 'parent content' },
        ]);

        expect(result.checks.length).toBeGreaterThanOrEqual(2); // drift + number recycling
        expect(result.checks.some(c => c.modeName === 'self_reinforcing_drift')).toBe(true);
        expect(result.checks.some(c => c.modeName === 'number_recycling')).toBe(true);
        // No lexical bridge — only 1 parent
        expect(result.checks.some(c => c.modeName === 'lexical_bridge')).toBe(false);
    });

    it('includes lexical bridge check when 2+ parents provided', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(makeVec([1, 0, 0]));

        const result = await evaluateNode('node-1', 'no numbers here', 'domain-a', [
            { id: 'p1', content: 'parent 1' },
            { id: 'p2', content: 'parent 2' },
        ]);

        expect(result.checks.some(c => c.modeName === 'lexical_bridge')).toBe(true);
    });

    it('sets anyFail when at least one check fails', async () => {
        // Make drift check fail by returning identical vectors
        const sameVec = makeVec([1, 0, 0]);

        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(sameVec);

        embeddingEvalCfg.driftFailThreshold = 0.9;

        const result = await evaluateNode('node-1', 'no numbers here', 'domain-a', [
            { id: 'p1', content: 'parent content' },
        ]);

        expect(result.anyFail).toBe(true);
        expect(result.checks.some(c => c.result === 'FAIL')).toBe(true);
    });

    it('stores results in database for each check', async () => {
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValue(makeVec([1, 0, 0]));

        await evaluateNode('node-1', 'no numbers here', 'domain-a', [
            { id: 'p1', content: 'parent content' },
        ]);

        // Should have INSERT INTO embedding_eval_results calls
        const insertCalls = mockQuery.mock.calls.filter(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('embedding_eval_results'),
        );
        expect(insertCalls.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// getInstructionEmbedding — cache behavior
// ---------------------------------------------------------------------------
describe('getInstructionEmbedding', () => {
    it('returns cached embedding when available', async () => {
        const vec = makeVec([1, 2, 3]);
        const f32 = new Float32Array(vec);
        const buf = Buffer.from(f32.buffer);

        mockQuery.mockResolvedValueOnce([{ embedding_bin: buf }]);

        const result = await getInstructionEmbedding('node-1', 'content', 'instruction');
        expect(result).not.toBeNull();
        expect(result!.length).toBe(3);
        // Should not call getEmbedding if cache hit
        expect(mockGetEmbedding).not.toHaveBeenCalled();
    });

    it('falls back to getEmbedding when cache is empty', async () => {
        const vec = makeVec([1, 0, 0]);
        mockQuery.mockResolvedValue([]); // cache miss + store
        mockGetEmbedding.mockResolvedValueOnce(vec);

        const result = await getInstructionEmbedding('node-2', 'content', 'instruction');
        expect(result).not.toBeNull();
        expect(mockGetEmbedding).toHaveBeenCalled();
    });

    it('returns null when getEmbedding fails', async () => {
        mockQuery.mockResolvedValue([]);
        mockEmbeddingFailure();

        const result = await getInstructionEmbedding('node-3', 'content', 'instruction');
        expect(result).toBeNull();
    });

    it('embeds raw text (no instruction prefix) when instruction is null', async () => {
        const vec = makeVec([1, 0, 0]);
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValueOnce(vec);

        await getInstructionEmbedding('node-4', 'document content', null);

        // getEmbedding should receive the raw text (no Instruct: prefix)
        const embeddingCall = mockGetEmbedding.mock.calls[0];
        const input = embeddingCall[0] as string;
        expect(input).toBe('document content');
        expect(input).not.toContain('Instruct:');
    });

    it('adds instruction prefix in query mode', async () => {
        const vec = makeVec([1, 0, 0]);
        mockQuery.mockResolvedValue([]);
        mockGetEmbedding.mockResolvedValueOnce(vec);

        await getInstructionEmbedding('node-5', 'query content', 'Find similar');

        const embeddingCall = mockGetEmbedding.mock.calls[0];
        const input = embeddingCall[0] as string;
        expect(input).toContain('Instruct: Find similar');
        expect(input).toContain('Query:');
    });
});
