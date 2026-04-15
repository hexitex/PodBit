/**
 * Unit tests for core/cycles/research.ts — runResearchCycleSingle().
 *
 * Tests: domain selection, domain exclusion, manifest guard, exhaustion cooldown,
 * relevance gate (embedding), seed parsing, citation rejection, consultant review,
 * handlePropose calls, and audit trail.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[]>>();
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>();
const mockConsultantReview = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetAssignedModel = jest.fn<(...args: any[]) => any>();
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>();
const mockGetProjectContextBlock = jest.fn<(...args: any[]) => Promise<string | null>>();
const mockGetProjectManifest = jest.fn<(...args: any[]) => Promise<any>>();
const mockCosineSimilarity = jest.fn<(...args: any[]) => number>();
const mockParseEmbedding = jest.fn<(...args: any[]) => number[] | null>();
const mockToTelegraphic = jest.fn<(s: string, o?: any) => string>();
const mockEmitActivity = jest.fn<(...args: any[]) => void>();
const mockResolveContent = jest.fn<(s: string) => Promise<string>>();
const mockBuildProvenanceTag = jest.fn<(...args: any[]) => string>();
const mockGetExcludedDomainsForCycle = jest.fn<(...args: any[]) => Promise<Set<string>>>();
const mockHandlePropose = jest.fn<(...args: any[]) => Promise<any>>();

const mockCfg = {
    minDomainNodes: 5,
    maxDomainNodes: 1000,
    domainSelectionLimit: 10,
    knowledgeContextLimit: 20,
    openQuestionsLimit: 5,
    seedMinLength: 10,
    seedMaxLength: 500,
    maxSeedsPerCycle: 5,
    relevanceThreshold: 0.3,
    exhaustionStreak: 3,
    exhaustionCooldownMs: 3600000,
};

const mockAppConfig = {
    autonomousCycles: { research: mockCfg },
    consultantReview: { enabled: false, thresholds: { research: 4 } },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
    callSubsystemModel: mockCallSubsystemModel,
    consultantReview: mockConsultantReview,
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
    getProjectManifest: mockGetProjectManifest,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    cosineSimilarity: mockCosineSimilarity,
    parseEmbedding: mockParseEmbedding,
}));

jest.unstable_mockModule('../../telegraphic.js', () => ({
    toTelegraphic: mockToTelegraphic,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
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

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handlePropose: mockHandlePropose,
}));

const { runResearchCycleSingle } = await import('../../core/cycles/research.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setupBasicDomain(domain = 'test-domain', cnt = 10) {
    // 1. allDomains query
    mockQuery.mockResolvedValueOnce([{ domain, cnt }]);
}

function setupFullHappyPath(domain = 'test-domain') {
    setupBasicDomain(domain);
    // Exhaustion check — no recent cycles
    mockQuery.mockResolvedValueOnce([]);
    // Existing knowledge
    mockQuery.mockResolvedValueOnce([{ content: 'Existing fact about the domain.', node_type: 'seed', generation: 0 }]);
    // Open questions
    mockQuery.mockResolvedValueOnce([]);
    // Domain centroid embeddings
    mockQuery.mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]);
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetExcludedDomainsForCycle.mockResolvedValue(new Set());
    mockResolveContent.mockImplementation(async (s: string) => s);
    mockBuildProvenanceTag.mockReturnValue('[seed/human]');
    mockToTelegraphic.mockImplementation((s: string) => s);
    mockGetProjectContextBlock.mockResolvedValue(null);
    mockGetProjectManifest.mockResolvedValue({ purpose: 'Test project' });
    mockGetPrompt.mockResolvedValue('Research prompt');
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockCosineSimilarity.mockReturnValue(0.8);
    mockParseEmbedding.mockImplementation((e: any) => {
        if (!e) return null;
        try { return JSON.parse(e); } catch { return null; }
    });
    mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'gpt-4' });
    mockHandlePropose.mockResolvedValue({ success: true });
    mockAppConfig.consultantReview = { enabled: false, thresholds: { research: 4 } };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runResearchCycleSingle', () => {
    it('returns early when no eligible domains found', async () => {
        mockQuery.mockResolvedValueOnce([]); // allDomains
        await runResearchCycleSingle();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('filters out excluded domains', async () => {
        mockGetExcludedDomainsForCycle.mockResolvedValue(new Set(['blocked']));
        mockQuery.mockResolvedValueOnce([{ domain: 'blocked', cnt: 10 }]);
        await runResearchCycleSingle();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('skips domain with low relevance to project purpose', async () => {
        setupBasicDomain('off-topic');
        // Domain centroid check for manifest relevance
        mockQuery.mockResolvedValueOnce([{ embedding: '[0.9,0.9,0.9]' }]);
        mockCosineSimilarity.mockReturnValue(0.05); // below 0.1 threshold

        await runResearchCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_domain_skip', expect.stringContaining('off-topic'),
            expect.objectContaining({ domain: 'off-topic' })
        );
    });

    it('proceeds when manifest relevance check fails (error handling)', async () => {
        setupBasicDomain('domain1');
        // Throw on getEmbedding for purpose
        mockGetEmbedding.mockRejectedValueOnce(new Error('Embedding API down'));
        // Exhaustion check
        mockQuery.mockResolvedValueOnce([]);
        // Existing knowledge
        mockQuery.mockResolvedValueOnce([{ content: 'Knowledge' }]);
        // Open questions
        mockQuery.mockResolvedValueOnce([]);
        // Domain centroid
        mockQuery.mockResolvedValueOnce([]);

        mockCallSubsystemModel.mockResolvedValue('- A valid seed with more than ten characters.');
        mockQueryOne.mockResolvedValue(undefined); // audit trail insert

        await runResearchCycleSingle();

        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });

    it('skips exhausted domains (consecutive zero-seed cycles)', async () => {
        setupBasicDomain('exhausted');
        // Manifest relevance check — domain centroid embeddings
        mockQuery.mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]);
        // Exhaustion check — 3 consecutive zero-seed cycles
        mockQuery.mockResolvedValueOnce([
            { created_child: 0 },
            { created_child: 0 },
            { created_child: 0 },
        ]);

        await runResearchCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_domain_exhausted', expect.any(String),
            expect.objectContaining({ domain: 'exhausted' })
        );
    });

    it('returns early when all domains are exhausted', async () => {
        setupBasicDomain('domain1');
        // Manifest relevance check — domain centroid embeddings
        mockQuery.mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]);
        // Exhaustion check — 3 consecutive zero-seed cycles
        mockQuery.mockResolvedValueOnce([
            { created_child: 0 }, { created_child: 0 }, { created_child: 0 },
        ]);

        await runResearchCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_all_exhausted', expect.any(String), expect.anything()
        );
    });

    it('returns early when no project manifest exists', async () => {
        setupBasicDomain('domain1');
        mockQuery.mockResolvedValueOnce([]); // exhaustion
        mockQuery.mockResolvedValueOnce([]); // existing
        mockQuery.mockResolvedValueOnce([]); // questions
        mockGetProjectManifest.mockResolvedValue(null);

        await runResearchCycleSingle();

        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns early when getPrompt fails', async () => {
        setupFullHappyPath();
        mockGetPrompt.mockRejectedValue(new Error('Prompt not found'));

        await runResearchCycleSingle();

        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns early when LLM call fails', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockRejectedValue(new Error('API error'));

        await runResearchCycleSingle();

        expect(mockHandlePropose).not.toHaveBeenCalled();
    });

    it('propagates AbortError from LLM call', async () => {
        setupFullHappyPath();
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        mockCallSubsystemModel.mockRejectedValue(abortErr);

        await expect(runResearchCycleSingle()).rejects.toThrow('Aborted');
    });

    it('returns early when no valid seeds parsed from response', async () => {
        setupFullHappyPath();
        // Response lines are all too short
        mockCallSubsystemModel.mockResolvedValue('hi\nno\nok');

        await runResearchCycleSingle();

        expect(mockHandlePropose).not.toHaveBeenCalled();
    });

    it('parses seeds from LLM response and calls handlePropose', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- Seed one with enough content to be valid for the domain.\n' +
            '- Seed two also valid and contains substantive knowledge content.\n' +
            '- Short'
        );
        mockQueryOne.mockResolvedValue(undefined); // audit trail

        await runResearchCycleSingle();

        expect(mockHandlePropose).toHaveBeenCalledTimes(2);
        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Seed one with enough content to be valid for the domain.',
            nodeType: 'seed',
            domain: 'test-domain',
            contributor: 'research-cycle',
        }));
    });

    it('rejects seeds below relevance threshold', async () => {
        // Manually set up instead of setupFullHappyPath for precise mock control
        setupBasicDomain('test-domain');
        // Manifest relevance check — domain centroid
        mockQuery.mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]);
        // Exhaustion check
        mockQuery.mockResolvedValueOnce([]);
        // Existing knowledge
        mockQuery.mockResolvedValueOnce([{ content: 'Existing fact.' }]);
        // Open questions
        mockQuery.mockResolvedValueOnce([]);
        // Domain centroid embeddings for seed relevance gate
        mockQuery.mockResolvedValueOnce([{ embedding: '[0.1,0.2,0.3]' }]);

        mockCallSubsystemModel.mockResolvedValue(
            '- A valid seed with enough content for the research domain.'
        );
        // cosineSimilarity: first call for manifest relevance (pass), second for seed relevance (fail)
        mockCosineSimilarity
            .mockReturnValueOnce(0.8)   // manifest relevance check — pass
            .mockReturnValueOnce(0.1);  // seed vs domain centroid — below threshold
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockHandlePropose).not.toHaveBeenCalled();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_relevance', expect.any(String),
            expect.objectContaining({ rejected: 1 })
        );
    });

    it('rejects citation-only seeds', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- Smith, J. & Brown, K. (2020) "A Study of Neural Networks" Proceedings 97, 369-379\n' +
            '- A valid seed with substantive claims about the domain topic.'
        );
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        // Only the valid seed should be proposed
        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('substantive'),
        }));
    });

    it('consultant review rejects low-quality seeds', async () => {
        mockAppConfig.consultantReview = { enabled: true, thresholds: { research: 4 } } as any;
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- A valid seed with enough content for the research domain.'
        );
        mockConsultantReview.mockResolvedValue({ score: 2, reasoning: 'Low quality' });
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockHandlePropose).not.toHaveBeenCalled();
    });

    it('consultant review allows high-quality seeds', async () => {
        mockAppConfig.consultantReview = { enabled: true, thresholds: { research: 4 } } as any;
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- A valid seed with enough content for the research domain.'
        );
        mockConsultantReview.mockResolvedValue({ score: 8, reasoning: 'Good quality' });
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
    });

    it('logs audit trail in dream_cycles', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- A valid seed with enough content for the research domain.'
        );
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dream_cycles'),
            expect.arrayContaining([
                expect.anything(), // resonance_score
                expect.anything(), // threshold
                expect.anything(), // created_child
                expect.stringContaining('research'), // parameters JSON
                'test-domain',
            ])
        );
    });

    it('emits research_complete with counts', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- Valid seed one for the research cycle domain topic.\n' +
            '- Valid seed two for the research cycle domain topic.'
        );
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_complete', expect.stringContaining('2'),
            expect.objectContaining({ added: 2, domain: 'test-domain' })
        );
    });

    it('emits research_complete with 0 when all seeds rejected', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- A valid seed with enough content for the research domain.'
        );
        mockHandlePropose.mockRejectedValue(new Error('Propose failed'));
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'cycle', 'research_complete', expect.stringContaining('0'),
            expect.objectContaining({ added: 0 })
        );
    });

    it('respects maxSeedsPerCycle limit', async () => {
        mockCfg.maxSeedsPerCycle = 1;
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '- Valid seed one for research cycle domain topic area.\n' +
            '- Valid seed two for research cycle domain topic area.'
        );
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockHandlePropose).toHaveBeenCalledTimes(1);
        mockCfg.maxSeedsPerCycle = 5; // restore
    });

    it('skips manifest relevance check when no purpose', async () => {
        mockGetProjectManifest
            .mockResolvedValueOnce({ purpose: undefined }) // early manifest (no purpose)
            .mockResolvedValueOnce({ name: 'test' });      // later manifest check
        setupBasicDomain('domain1');
        mockQuery.mockResolvedValueOnce([]); // exhaustion
        mockQuery.mockResolvedValueOnce([{ content: 'Knowledge' }]); // existing
        mockQuery.mockResolvedValueOnce([]); // questions
        mockQuery.mockResolvedValueOnce([]); // centroid embeddings
        mockCallSubsystemModel.mockResolvedValue('- Valid seed with enough content for the domain.');
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        // Should proceed without domain skip
        expect(mockCallSubsystemModel).toHaveBeenCalled();
    });

    it('strips bullet markers from seed lines', async () => {
        setupFullHappyPath();
        mockCallSubsystemModel.mockResolvedValue(
            '* Bullet seed content with enough length for the domain topic.\n' +
            '\u2022 Unicode bullet content with enough length for the domain.'
        );
        mockQueryOne.mockResolvedValue(undefined);

        await runResearchCycleSingle();

        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            content: 'Bullet seed content with enough length for the domain topic.',
        }));
    });
});
