/**
 * Unit tests for checkDomainDrift in core/scoring.ts.
 *
 * Tests the new domain drift detection that uses instruct embeddings
 * to compare voiced/synthesized content against domain seed centroids.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: jest.fn(async (c: string) => c),
}));

const embeddingEvalCfg = {
    enabled: false,
    instructDomainContribution: 'Represent domain contribution',
};

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        hallucination: {
            fabricatedNumberCheck: true,
            largeNumberThreshold: 1000,
            maxVerboseWords: 200,
            minRedFlags: 2,
            novelRatioThreshold: 0.7,
            novelWordMinLength: 3,
            minOutputWordsForNoveltyCheck: 10,
            numberPattern: '\\b\\d+\\.?\\d*\\b',
            roundNumberPattern: '^(0|[1-9]0*)$',
            futureYearPattern: 'by\\s+(20[3-9]\\d)',
            multiplierPattern: '\\b\\d+x\\b',
            financialClaimPattern: '\\$\\d+',
            financialTerms: 'revenue|profit',
            crossDomainNumberCheck: false,
            crossDomainTrivialPattern: '^[0-9]$',
            synthesisVocabulary: [],
            tierOverrides: {},
        },
        injection: {
            instructionOverridePatterns: [],
            roleOverridePatterns: [],
            promptStructurePatterns: [],
            templateInjectionPatterns: [],
            structureBreakingPatterns: [],
            systemPromptPatterns: [],
            scoreThreshold: 3,
        },
        intakeDefense: {
            windowHours: 24,
            concentrationThreshold: 0.6,
            throttleThreshold: 0.8,
            minProposalsForCheck: 5,
        },
        autonomousCycles: {
            research: { relevanceThreshold: 0.5 },
        },
        embeddingEval: embeddingEvalCfg,
    },
}));

const { checkDomainDrift } = await import('../../core/scoring.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
    embeddingEvalCfg.enabled = false;
});

/** Create a unit vector */
function makeVec(values: number[]): number[] {
    let norm = 0;
    for (const v of values) norm += v * v;
    norm = Math.sqrt(norm);
    return norm > 0 ? values.map(v => v / norm) : values;
}

/** Convert number[] to Buffer (Float32Array) for DB mock */
function vecToBuffer(vec: number[]): Buffer {
    const f32 = new Float32Array(vec);
    return Buffer.from(f32.buffer);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('checkDomainDrift', () => {
    it('returns drifted=false when no target domain', async () => {
        const result = await checkDomainDrift('some content', null);
        expect(result.drifted).toBe(false);
        expect(result.similarity).toBe(0);
    });

    it('returns drifted=false when fewer than 3 seed vectors exist', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: vecToBuffer(makeVec([1, 0, 0])), embedding: null },
            { id: 'n2', embedding_bin: vecToBuffer(makeVec([0, 1, 0])), embedding: null },
        ]); // only 2 seeds

        const result = await checkDomainDrift('content', 'my-domain');
        expect(result.drifted).toBe(false);
    });

    it('returns drifted=false when no embeddings available', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: null, embedding: null },
            { id: 'n2', embedding_bin: null, embedding: null },
            { id: 'n3', embedding_bin: null, embedding: null },
        ]); // 3 seeds but no embeddings

        const result = await checkDomainDrift('content', 'my-domain');
        expect(result.drifted).toBe(false);
    });

    it('uses fallback embedding when instruct eval is disabled', async () => {
        // 3+ seed vectors all pointing roughly in [1,0,0]
        const seedVec1 = makeVec([1, 0, 0]);
        const seedVec2 = makeVec([0.9, 0.1, 0]);
        const seedVec3 = makeVec([0.95, 0.05, 0]);

        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: vecToBuffer(seedVec1), embedding: null },
            { id: 'n2', embedding_bin: vecToBuffer(seedVec2), embedding: null },
            { id: 'n3', embedding_bin: vecToBuffer(seedVec3), embedding: null },
        ]);

        // Content embedding in same direction → high similarity → not drifted
        const contentVec = makeVec([1, 0, 0]);
        const result = await checkDomainDrift('content', 'my-domain', contentVec);

        expect(result.drifted).toBe(false);
        expect(result.similarity).toBeGreaterThan(0.5);
    });

    it('detects drift when content embedding diverges from seed centroid', async () => {
        // Seeds all point in [1,0,0] direction
        const seedVec = makeVec([1, 0, 0]);

        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n2', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n3', embedding_bin: vecToBuffer(seedVec), embedding: null },
        ]);

        // Content embedding is orthogonal → low similarity → drifted
        const contentVec = makeVec([0, 0, 1]);
        const result = await checkDomainDrift('drifted content', 'my-domain', contentVec);

        expect(result.drifted).toBe(true);
        expect(result.similarity).toBeCloseTo(0.0, 1);
    });

    it('returns drifted=false when fallback embedding is null and instruct is disabled', async () => {
        const seedVec = makeVec([1, 0, 0]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n2', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n3', embedding_bin: vecToBuffer(seedVec), embedding: null },
        ]);

        // No existing embedding, instruct disabled
        const result = await checkDomainDrift('content', 'my-domain', null);
        expect(result.drifted).toBe(false);
        expect(result.similarity).toBe(0);
    });

    it('handles DB errors gracefully', async () => {
        mockQuery.mockRejectedValueOnce(new Error('DB error'));

        const result = await checkDomainDrift('content', 'my-domain', makeVec([1, 0, 0]));
        expect(result.drifted).toBe(false); // fail-open
    });

    it('parses JSON string embeddings from nodes table', async () => {
        const seedVec = makeVec([1, 0, 0]);
        const jsonEmb = JSON.stringify(seedVec);

        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: null, embedding: jsonEmb },
            { id: 'n2', embedding_bin: null, embedding: jsonEmb },
            { id: 'n3', embedding_bin: null, embedding: jsonEmb },
        ]);

        const contentVec = makeVec([1, 0, 0]);
        const result = await checkDomainDrift('content', 'my-domain', contentVec);

        expect(result.drifted).toBe(false);
        expect(result.similarity).toBeGreaterThan(0.9);
    });

    it('uses correct threshold from config', async () => {
        const seedVec = makeVec([1, 0, 0]);
        mockQuery.mockResolvedValueOnce([
            { id: 'n1', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n2', embedding_bin: vecToBuffer(seedVec), embedding: null },
            { id: 'n3', embedding_bin: vecToBuffer(seedVec), embedding: null },
        ]);

        // Content at 45 degrees → sim ~0.707
        const contentVec = makeVec([1, 1, 0]);
        const result = await checkDomainDrift('content', 'my-domain', contentVec);

        expect(result.threshold).toBe(0.5);
        expect(result.similarity).toBeGreaterThan(0.5); // ~0.707, above 0.5
        expect(result.drifted).toBe(false);
    });
});
