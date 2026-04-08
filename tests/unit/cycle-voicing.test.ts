/**
 * Unit tests for core/cycles/voicing.ts — runVoicingCycleSingle().
 *
 * Tests: budget gate, candidate selection, partner selection (parents vs random),
 * domain exclusion, persona mode selection, voice rejection, dedup, child creation.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockGetAccessibleDomains = jest.fn<(...args: any[]) => Promise<string[]>>();
const mockGetExcludedDomainsForCycle = jest.fn<(...args: any[]) => Promise<Set<string>>>();
const mockVoice = jest.fn<(...args: any[]) => Promise<any>>();
const mockCreateNode = jest.fn<(...args: any[]) => Promise<any>>();
const mockCreateEdge = jest.fn<(...args: any[]) => Promise<void>>();
const mockGetAssignedModel = jest.fn<(...args: any[]) => any>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockIsBudgetExceeded = jest.fn<() => boolean>();
const mockCosineSimilarity = jest.fn<(...args: any[]) => number>();
const mockCheckDomainDrift = jest.fn<(...args: any[]) => Promise<any>>();

const mockCfg = {
    minWeightThreshold: 0.5,
    modes: ['sincere', 'cynic'],
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: { voicing: mockCfg },
        synthesisEngine: { similarityCeiling: 0.92 },
    },
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    checkDomainDrift: mockCheckDomainDrift,
}));

jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
    getExcludedDomainsForCycle: mockGetExcludedDomainsForCycle,
}));

jest.unstable_mockModule('../../core/voicing.js', () => ({
    voice: mockVoice,
}));

jest.unstable_mockModule('../../core/node-ops.js', () => ({
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../models/budget.js', () => ({
    isBudgetExceeded: mockIsBudgetExceeded,
}));

const { runVoicingCycleSingle } = await import('../../core/cycles/voicing.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCandidate(id = 'c1', domain = 'sci') {
    return { id, content: 'Candidate content', weight: 1.0, domain, node_type: 'seed', embedding_bin: new Float32Array([1, 0, 0]) };
}

function makePartner(id = 'p1', domain = 'sci') {
    return { id, content: 'Partner content', weight: 0.8, domain, node_type: 'voiced', embedding_bin: new Float32Array([0, 1, 0]) };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockIsBudgetExceeded.mockReturnValue(false);
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'gpt-4' });
    mockCosineSimilarity.mockReturnValue(0.5); // default: not too similar
    mockCheckDomainDrift.mockResolvedValue({ drifted: false, similarity: 0.8, threshold: 0.5 });
    mockCfg.modes = ['sincere', 'cynic'];
    mockCfg.minWeightThreshold = 0.5;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runVoicingCycleSingle', () => {
    it('returns early when budget is exceeded', async () => {
        mockIsBudgetExceeded.mockReturnValue(true);
        await runVoicingCycleSingle();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns early when no candidates found', async () => {
        mockQuery.mockResolvedValueOnce([]); // voicingCandidates
        await runVoicingCycleSingle();
        expect(mockVoice).not.toHaveBeenCalled();
    });

    it('filters out excluded domains from candidates', async () => {
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['blocked']));
        mockQuery.mockResolvedValueOnce([makeCandidate('c1', 'blocked')]); // only candidate is excluded
        await runVoicingCycleSingle();
        expect(mockVoice).not.toHaveBeenCalled();
    });

    it('emits voicing_skip when no partner found', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate()])  // candidates
            .mockResolvedValueOnce([])                  // parents
            .mockResolvedValueOnce([])                  // random fallback (no domain accessible)
        ;
        mockGetAccessibleDomains.mockResolvedValue([]);

        await runVoicingCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'voicing_skip', expect.any(String), expect.objectContaining({ nodeId: 'c1' })
        );
    });

    it('rejects redundant pairing when parents are too similar', async () => {
        const candidate = makeCandidate('c1', 'sci');
        const partner = makePartner('p1', 'sci');
        mockQuery
            .mockResolvedValueOnce([candidate])  // candidates
            .mockResolvedValueOnce([partner])     // parents
        ;
        mockCosineSimilarity.mockReturnValue(0.95); // above 0.92 ceiling

        await runVoicingCycleSingle();

        expect(mockVoice).not.toHaveBeenCalled();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'voicing_rejected', expect.stringContaining('redundant pairing'),
            expect.objectContaining({ rejectionReason: 'redundant_pairing', similarity: 0.95 })
        );
    });

    it('allows pairing when similarity is below ceiling', async () => {
        const candidate = makeCandidate('c1', 'sci');
        const partner = makePartner('p1', 'sci');
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([partner])
        ;
        mockCosineSimilarity.mockReturnValue(0.7); // below ceiling
        mockVoice.mockResolvedValue({ content: 'A good insight' });
        mockCreateNode.mockResolvedValue({ id: 'child-1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        expect(mockVoice).toHaveBeenCalled();
    });

    it('picks a parent as partner when parents exist', async () => {
        const candidate = makeCandidate();
        const parent = makePartner('par1');
        mockQuery
            .mockResolvedValueOnce([candidate])  // candidates
            .mockResolvedValueOnce([parent])     // parents
        ;
        mockVoice.mockResolvedValue({ content: 'Voiced insight' });
        mockCreateNode.mockResolvedValue({ id: 'child1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        expect(mockVoice).toHaveBeenCalledWith(
            candidate, parent, expect.any(String), 'voice'
        );
    });

    it('uses accessible domains for random partner when no parents', async () => {
        const candidate = makeCandidate('c1', 'sci');
        const randomPartner = makePartner('rnd1', 'sci');
        mockQuery
            .mockResolvedValueOnce([candidate])      // candidates
            .mockResolvedValueOnce([])                // no parents
            .mockResolvedValueOnce([randomPartner])   // random from accessible domains
        ;
        mockGetAccessibleDomains.mockResolvedValue(['sci', 'math']);
        mockVoice.mockResolvedValue({ content: 'New insight' });
        mockCreateNode.mockResolvedValue({ id: 'child1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('sci');
        expect(mockVoice).toHaveBeenCalled();
    });

    it('falls back to global random partner when accessible domains is empty', async () => {
        const candidate = makeCandidate('c1', 'sci');
        const randomPartner = makePartner('rnd1');
        mockQuery
            .mockResolvedValueOnce([candidate])      // candidates
            .mockResolvedValueOnce([])                // no parents
            .mockResolvedValueOnce([randomPartner])   // global random fallback
        ;
        mockGetAccessibleDomains.mockResolvedValue([]);
        mockVoice.mockResolvedValue({ content: 'Insight' });
        mockCreateNode.mockResolvedValue({ id: 'child1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        expect(mockGetAccessibleDomains).toHaveBeenCalledWith('sci');
        expect(mockVoice).toHaveBeenCalled();
    });

    it('emits voicing_rejected when voice returns no content', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makePartner()])
        ;
        mockVoice.mockResolvedValue({ content: null, rejectionReason: 'derivative' });

        await runVoicingCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'voicing_rejected', expect.stringContaining('derivative'), expect.objectContaining({ mode: expect.any(String) })
        );
        expect(mockCreateNode).not.toHaveBeenCalled();
    });

    it('emits voicing_dedup when createNode returns null', async () => {
        mockQuery
            .mockResolvedValueOnce([makeCandidate()])
            .mockResolvedValueOnce([makePartner()])
        ;
        mockVoice.mockResolvedValue({ content: 'Some voiced content' });
        mockCreateNode.mockResolvedValue(null);

        await runVoicingCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'voicing_dedup', expect.any(String), expect.objectContaining({ mode: expect.any(String) })
        );
    });

    it('creates child node with parent edges on success', async () => {
        const candidate = makeCandidate('c1', 'sci');
        const parent = makePartner('par1', 'math');
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([parent])
        ;
        mockVoice.mockResolvedValue({ content: 'A voiced insight about science' });
        mockCreateNode.mockResolvedValue({ id: 'child-1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        // createNode called with correct params
        expect(mockCreateNode).toHaveBeenCalledWith(
            'A voiced insight about science', 'voiced', 'voicing-cycle',
            expect.objectContaining({ domain: 'sci', contributor: 'voicing-cycle' })
        );

        // Sets voice_mode on child
        expect(mockQuery).toHaveBeenCalledWith(
            'UPDATE nodes SET voice_mode = $1 WHERE id = $2',
            [expect.any(String), 'child-1']
        );

        // Parent edges created
        expect(mockCreateEdge).toHaveBeenCalledWith('c1', 'child-1', 'parent');
        expect(mockCreateEdge).toHaveBeenCalledWith('par1', 'child-1', 'parent');

        // Activity emitted
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'voicing_created', expect.any(String),
            expect.objectContaining({ nodeId: 'child-1', parentA: 'c1', parentB: 'par1' })
        );
    });

    it('uses default modes when cfg.modes is empty', async () => {
        mockCfg.modes = [];
        const candidate = makeCandidate();
        const partner = makePartner();
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([partner])
        ;
        mockVoice.mockResolvedValue({ content: 'Insight' });
        mockCreateNode.mockResolvedValue({ id: 'child-1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        // voice was called with one of the default modes
        const modeArg = (mockVoice.mock.calls[0] as any[])[2];
        expect(['object-following', 'sincere', 'cynic', 'pragmatist', 'child']).toContain(modeArg);
    });

    it('uses partner domain as fallback when candidate has no domain', async () => {
        const candidate = makeCandidate('c1', null as any);
        const partner = makePartner('p1', 'biology');
        mockQuery
            .mockResolvedValueOnce([candidate])
            .mockResolvedValueOnce([partner])
        ;
        mockVoice.mockResolvedValue({ content: 'Bio insight' });
        mockCreateNode.mockResolvedValue({ id: 'child-1' });
        mockCreateEdge.mockResolvedValue(undefined);

        await runVoicingCycleSingle();

        expect(mockCreateNode).toHaveBeenCalledWith(
            expect.any(String), 'voiced', 'voicing-cycle',
            expect.objectContaining({ domain: 'biology' })
        );
    });
});
