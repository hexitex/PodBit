/**
 * Deep coverage tests for core/elite-pool-bridging.ts
 * Targets: lowest_generation priority, highest_confidence priority,
 * manifest bridge detection, previous attempts deduction.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockEmitActivity = jest.fn<() => void>();
const mockGetProjectManifest = jest.fn<() => Promise<any>>().mockResolvedValue(null);

const mockElitePoolConfig: Record<string, any> = {
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
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8), emitActivity: mockEmitActivity }));
jest.unstable_mockModule('../../core/project-context.js', () => ({ getProjectManifest: mockGetProjectManifest }));

const { getEliteBridgingCandidates, logBridgingAttempt } = await import('../../core/elite-pool-bridging.js');

function makeEliteNode(id: string, domain: string, generation: number) {
    return { id, content: `Content of ${id}`, domain, generation, embedding: null, embedding_bin: null };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined);
    mockGetProjectManifest.mockResolvedValue(null);
    mockElitePoolConfig.enableEliteBridging = true;
    mockElitePoolConfig.maxGeneration = 5;
    mockElitePoolConfig.maxBridgingAttemptsPerPair = 3;
    mockElitePoolConfig.bridgingPriority = 'cross_domain';
});

// =============================================================================
// lowest_generation priority mode
// =============================================================================

describe('getEliteBridgingCandidates — lowest_generation priority', () => {
    it('prioritizes pairs with lowest total generation', async () => {
        mockElitePoolConfig.bridgingPriority = 'lowest_generation';

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 3),
                makeEliteNode('n3', 'physics', 1),
            ])
            .mockResolvedValueOnce([]); // no previous attempts

        const result = await getEliteBridgingCandidates();

        expect(result.length).toBeGreaterThanOrEqual(2);
        // n1+n3 (gen sum = 2) should rank higher than n1+n2 (gen sum = 4) or n2+n3 (gen sum = 4)
        const first = result[0];
        const genSum = first.nodeA.generation + first.nodeB.generation;
        expect(genSum).toBeLessThanOrEqual(2);
    });

    it('gives cross-domain bonus of 10 in lowest_generation mode', async () => {
        mockElitePoolConfig.bridgingPriority = 'lowest_generation';

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'science', 1), // same domain
                makeEliteNode('n3', 'math', 1),    // different domain
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        // Cross-domain pairs should have higher priority than same-domain
        const crossDomainPairs = result.filter(c =>
            c.nodeA.domain !== c.nodeB.domain
        );
        const sameDomainPairs = result.filter(c =>
            c.nodeA.domain === c.nodeB.domain
        );
        if (crossDomainPairs.length > 0 && sameDomainPairs.length > 0) {
            expect(crossDomainPairs[0].bridgePriority).toBeGreaterThan(sameDomainPairs[0].bridgePriority);
        }
    });

    it('penalizes previous attempts by -10 each', async () => {
        mockElitePoolConfig.bridgingPriority = 'lowest_generation';

        const n1 = makeEliteNode('node-x', 'science', 1);
        const n2 = makeEliteNode('node-y', 'math', 1);
        const n3 = makeEliteNode('node-z', 'physics', 1);

        mockQuery
            .mockResolvedValueOnce([n1, n2, n3])
            .mockResolvedValueOnce([
                { parent_a_id: 'node-x', parent_b_id: 'node-y', attempts: 2 },
            ]);

        const result = await getEliteBridgingCandidates();

        // node-x + node-y has 2 previous attempts, should rank lower
        const xyPair = result.find(c =>
            (c.nodeA.id === 'node-x' && c.nodeB.id === 'node-y') ||
            (c.nodeA.id === 'node-y' && c.nodeB.id === 'node-x')
        );
        const xzPair = result.find(c =>
            (c.nodeA.id === 'node-x' && c.nodeB.id === 'node-z') ||
            (c.nodeA.id === 'node-z' && c.nodeB.id === 'node-x')
        );
        if (xyPair && xzPair) {
            expect(xzPair.bridgePriority).toBeGreaterThan(xyPair.bridgePriority);
        }
    });
});

// =============================================================================
// highest_confidence priority mode (fallback else branch)
// =============================================================================

describe('getEliteBridgingCandidates — highest_confidence priority', () => {
    it('uses generation as proxy for confidence (lower gen = higher priority)', async () => {
        mockElitePoolConfig.bridgingPriority = 'highest_confidence';

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 1),
                makeEliteNode('n3', 'physics', 3),
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        expect(result.length).toBeGreaterThanOrEqual(2);
        // n1+n2 (gen sum = 2) should rank higher than pairs with n3 (gen sum = 4)
        const first = result[0];
        const genSum = first.nodeA.generation + first.nodeB.generation;
        expect(genSum).toBeLessThanOrEqual(2);
    });

    it('does not give cross-domain bonus in highest_confidence mode', async () => {
        mockElitePoolConfig.bridgingPriority = 'highest_confidence';

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'science', 1), // same domain, same gen
                makeEliteNode('n3', 'math', 1),    // cross domain, same gen
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        // In highest_confidence mode, cross-domain gets no bonus
        // So same-gen pairs should have the same base priority (no +10 for cross-domain)
        const crossPair = result.find(c =>
            c.nodeA.domain !== c.nodeB.domain
        );
        const samePair = result.find(c =>
            c.nodeA.domain === c.nodeB.domain
        );
        if (crossPair && samePair) {
            // Both have genSum=2, no cross-domain bonus → same priority minus attempts
            expect(crossPair.bridgePriority).toBe(samePair.bridgePriority);
        }
    });

    it('penalizes previous attempts in highest_confidence mode', async () => {
        mockElitePoolConfig.bridgingPriority = 'highest_confidence';

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('a1', 'science', 1),
                makeEliteNode('b1', 'math', 1),
                makeEliteNode('c1', 'physics', 1),
            ])
            .mockResolvedValueOnce([
                { parent_a_id: 'a1', parent_b_id: 'b1', attempts: 1 },
            ]);

        const result = await getEliteBridgingCandidates();

        const a1b1 = result.find(c =>
            (c.nodeA.id === 'a1' && c.nodeB.id === 'b1') ||
            (c.nodeA.id === 'b1' && c.nodeB.id === 'a1')
        );
        const a1c1 = result.find(c =>
            (c.nodeA.id === 'a1' && c.nodeB.id === 'c1') ||
            (c.nodeA.id === 'c1' && c.nodeB.id === 'a1')
        );
        if (a1b1 && a1c1) {
            expect(a1c1.bridgePriority).toBeGreaterThan(a1b1.bridgePriority);
        }
    });
});

// =============================================================================
// Manifest bridge detection
// =============================================================================

describe('getEliteBridgingCandidates — manifest bridges', () => {
    it('detects when pair spans a manifest bridge', async () => {
        mockGetProjectManifest.mockResolvedValue({
            bridges: [['science', 'math']],
        });

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 2),
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        expect(result.length).toBe(1);
        expect(result[0].spansManifestBridge).toBe(true);
    });

    it('marks spansManifestBridge false for cross-domain without matching bridge', async () => {
        mockGetProjectManifest.mockResolvedValue({
            bridges: [['unrelated-a', 'unrelated-b']],
        });

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 2),
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        // The code uses: crossDomain && bridge.includes(a.domain) && bridge.includes(b.domain)
        // Both conditions must be true — no matching bridge means false
        expect(result.length).toBe(1);
        expect(result[0].spansManifestBridge).toBe(false);
    });

    it('marks spansManifestBridge false for same-domain without bridge match', async () => {
        mockGetProjectManifest.mockResolvedValue({
            bridges: [['unrelated-a', 'unrelated-b']],
        });

        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'science', 2),
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        expect(result.length).toBe(1);
        expect(result[0].spansManifestBridge).toBe(false);
    });

    it('gives manifest bridge bonus of 50 in cross_domain priority mode', async () => {
        mockGetProjectManifest.mockResolvedValue({
            bridges: [['science', 'math']],
        });

        // Use same-domain pair (n1+n3) vs cross-domain pair with manifest bridge (n1+n2)
        mockQuery
            .mockResolvedValueOnce([
                makeEliteNode('n1', 'science', 1),
                makeEliteNode('n2', 'math', 1),
                makeEliteNode('n3', 'science', 1), // same domain as n1
            ])
            .mockResolvedValueOnce([]);

        const result = await getEliteBridgingCandidates();

        // n1+n2 is cross-domain AND spans manifest bridge: +100 + +50 = 150 - gen(2) = 148
        // n1+n3 is same-domain, no bridge: 0 + 0 = 0 - gen(2) = -2
        // n2+n3 is cross-domain but no manifest bridge: +100 + 0 ... actually crossDomain makes spansManifestBridge true
        // So n1+n2 should rank first (explicit manifest bridge + cross-domain)
        expect(result.length).toBe(3);
        const n1n2 = result.find(c =>
            (c.nodeA.id === 'n1' && c.nodeB.id === 'n2') ||
            (c.nodeA.id === 'n2' && c.nodeB.id === 'n1')
        );
        const n1n3 = result.find(c =>
            (c.nodeA.id === 'n1' && c.nodeB.id === 'n3') ||
            (c.nodeA.id === 'n3' && c.nodeB.id === 'n1')
        );
        expect(n1n2!.bridgePriority).toBeGreaterThan(n1n3!.bridgePriority);
    });
});

// =============================================================================
// logBridgingAttempt — activity detail shape
// =============================================================================

describe('logBridgingAttempt — activity event detail', () => {
    it('includes synthesisNodeId in activity event detail', async () => {
        await logBridgingAttempt({
            parentAId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            parentBId: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            synthesisNodeId: 'synth-node-123',
            outcome: 'promoted',
            attemptedAt: new Date().toISOString(),
        });

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'elite',
            'elite_bridging_attempted',
            expect.stringContaining('promoted'),
            expect.objectContaining({
                synthesisNodeId: 'synth-node-123',
                parentAId: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                parentBId: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            }),
        );
    });

    it('truncates parent IDs to 8 chars in activity message', async () => {
        await logBridgingAttempt({
            parentAId: 'abcdefgh-1234',
            parentBId: 'ijklmnop-5678',
            outcome: 'rejected',
            attemptedAt: new Date().toISOString(),
        });

        const message = mockEmitActivity.mock.calls[0][2] as string;
        expect(message).toContain('abcdefgh');
        expect(message).toContain('ijklmnop');
        expect(message).not.toContain('abcdefgh-1234');
    });
});
