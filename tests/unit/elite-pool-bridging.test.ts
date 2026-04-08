/**
 * Unit tests for core/elite-pool-bridging.ts — getEliteBridgingCandidates, logBridgingAttempt.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockEmitActivity = jest.fn<() => void>();
const mockGetProjectManifest = jest.fn<() => Promise<any>>().mockResolvedValue(null);

const mockElitePoolConfig = {
    enableEliteBridging: true,
    maxGeneration: 5,
    maxBridgingAttemptsPerPair: 3,
    bridgingPriority: 'cross_domain',
};

const mockAppConfig = {
    elitePool: mockElitePoolConfig,
};

jest.unstable_mockModule('../../db.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ emitActivity: mockEmitActivity }));
jest.unstable_mockModule('../../core/project-context.js', () => ({ getProjectManifest: mockGetProjectManifest }));

const { getEliteBridgingCandidates, logBridgingAttempt } = await import('../../core/elite-pool-bridging.js');

function makeEliteNode(id: string, domain: string, generation: number) {
    return { id, content: `Content of ${id}`, domain, generation, embedding: null, embedding_bin: null };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined);
    mockGetProjectManifest.mockResolvedValue(null);
    mockElitePoolConfig.enableEliteBridging = true;
    mockElitePoolConfig.maxGeneration = 5;
    mockElitePoolConfig.maxBridgingAttemptsPerPair = 3;
    mockElitePoolConfig.bridgingPriority = 'cross_domain';
});

// =============================================================================
// getEliteBridgingCandidates — early exit
// =============================================================================

describe('getEliteBridgingCandidates — early exit', () => {
    it('returns empty when elite bridging is disabled', async () => {
        mockElitePoolConfig.enableEliteBridging = false;
        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(0);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns empty when fewer than 2 elite nodes', async () => {
        mockQuery.mockResolvedValueOnce([makeEliteNode('n1', 'science', 1)]);
        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(0);
    });

    it('returns empty when no elite nodes at all', async () => {
        mockQuery.mockResolvedValueOnce([]);
        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(0);
    });
});

// =============================================================================
// getEliteBridgingCandidates — generation ceiling skip
// =============================================================================

describe('getEliteBridgingCandidates — generation ceiling', () => {
    it('skips pairs where synthesis generation would reach maxGeneration', async () => {
        // maxGeneration = 5, gen 4+4 → max(4,4)+1=5 >= 5 → skip
        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 4),
                makeEliteNode('n2', 'math', 4),
            ])
            .mockResolvedValueOnce([]); // no previous attempts

        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(0);
    });

    it('includes pairs where synthesis generation is below maxGeneration', async () => {
        // gen 2+3 → max(2,3)+1=4 < 5 → include
        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 2),
                makeEliteNode('n2', 'math', 3),
            ])
            .mockResolvedValueOnce([]); // no previous attempts

        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(1);
    });
});

// =============================================================================
// getEliteBridgingCandidates — attempt limit skip
// =============================================================================

describe('getEliteBridgingCandidates — attempt limit', () => {
    it('skips pairs that have reached maxBridgingAttemptsPerPair', async () => {
        const n1 = makeEliteNode('node-aaa', 'science', 1);
        const n2 = makeEliteNode('node-bbb', 'math', 2);
        mockQuery
            .mockResolvedValueOnce([n1, n2])
            .mockResolvedValueOnce([
                { parent_a_id: 'node-aaa', parent_b_id: 'node-bbb', attempts: 3 },
            ]); // already at limit

        const result = await getEliteBridgingCandidates();
        expect(result).toHaveLength(0);
    });
});

// =============================================================================
// getEliteBridgingCandidates — cross-domain priority
// =============================================================================

describe('getEliteBridgingCandidates — cross-domain priority', () => {
    it('returns candidates sorted by priority (cross_domain first)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'science', 2),   // same domain — lower priority
                makeEliteNode('n3', 'math', 1),       // different domain — higher priority
            ])
            .mockResolvedValueOnce([]); // no attempts

        const result = await getEliteBridgingCandidates();
        // n1+n3 (cross-domain) should rank higher than n1+n2 (same-domain)
        expect(result.length).toBeGreaterThanOrEqual(1);
        const firstPair = result[0];
        // The first pair should involve cross-domain nodes
        expect(firstPair.nodeA.domain !== firstPair.nodeB.domain || firstPair.bridgePriority >= 100).toBe(true);
    });
});

// =============================================================================
// getEliteBridgingCandidates — limit
// =============================================================================

describe('getEliteBridgingCandidates — limit', () => {
    it('respects the limit parameter', async () => {
        // 4 nodes → 6 possible pairs (below ceiling)
        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 1),
                makeEliteNode('n3', 'physics', 1),
                makeEliteNode('n4', 'biology', 1),
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates(2);
        expect(result).toHaveLength(2);
    });
});

// =============================================================================
// logBridgingAttempt
// =============================================================================

describe('logBridgingAttempt', () => {
    it('inserts into elite_bridging_log', async () => {
        await logBridgingAttempt({
            parentAId: 'node-a',
            parentBId: 'node-b',
            synthesisNodeId: 'node-c',
            outcome: 'promoted',
        });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('elite_bridging_log');
        expect(params).toContain('node-a');
        expect(params).toContain('node-b');
        expect(params).toContain('node-c');
        expect(params).toContain('promoted');
    });

    it('uses null for synthesisNodeId when not provided', async () => {
        await logBridgingAttempt({
            parentAId: 'node-a',
            parentBId: 'node-b',
            synthesisNodeId: undefined,
            outcome: 'rejected',
        });

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(null);
    });

    it('emits elite activity event', async () => {
        await logBridgingAttempt({
            parentAId: 'node-aaaaaaaa',
            parentBId: 'node-bbbbbbbb',
            outcome: 'duplicate',
        });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite',
            'elite_bridging_attempted',
            expect.any(String),
            expect.objectContaining({ outcome: 'duplicate' })
        );
    });
});
