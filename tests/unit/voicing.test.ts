/**
 * Unit tests for core/voicing.ts — voice() and voiceMulti() functions.
 *
 * These functions call LLMs and run quality gates. All external deps are mocked.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ResonanceNode } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Mutable config — individual tests override specific fields
// ---------------------------------------------------------------------------
const mockConfig = {
    voicing: {
        telegraphicEnabled: false,
        telegraphicAggressiveness: 'medium',
        entropyEnabled: false,
        entropyWeights: {},
        entropyThresholds: {},
        entropyRarityMinLength: 8,
        rejectUnclosedParens: true,
        rejectNoSentenceEnding: false,
        maxOutputWords: 50,
        maxInsightWords: 50,
        minNovelWordLength: 4,
        minNovelWords: 3,
        truncatedWords: 40,
        responseCleanupPatterns: [],
        tierOverrides: {},
    },
    numberVariables: { enabled: false },
};

const mockAppConfig = {
    consultantReview: { enabled: false, thresholds: { voice: 5, synthesis: 5 } },
};

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{"insight":"A new insight."}');
const mockCallConsultantModel = jest.fn<() => Promise<string>>().mockResolvedValue('{"insight":"A new insight."}');
const mockConsultantReview = jest.fn<() => Promise<any>>().mockResolvedValue({ score: 8, reasoning: 'Good' });
const mockGetAssignedModel = jest.fn<() => any>().mockReturnValue({ id: 'model-1', name: 'gpt-4', tier: 'tier2' });
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Synthesize: {contentA} and {contentB}');
const mockDetectHallucination = jest.fn<() => Promise<any>>().mockResolvedValue({ isHallucination: false, reasons: [] });
const mockToTelegraphic = jest.fn<(s: string) => string>().mockImplementation((s) => s);
const mockGetProjectContextBlock = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);
const mockExtractVarIdsFromContent = jest.fn<() => string[]>().mockReturnValue([]);
const mockGetVariablesByIds = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockBuildVariableLegend = jest.fn<() => string>().mockReturnValue('');
const mockBuildProvenanceTag = jest.fn<() => string>().mockReturnValue('manual/human');
const mockEmitActivity = jest.fn<() => void>();

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    callConsultantModel: mockCallConsultantModel,
    consultantReview: mockConsultantReview,
    getAssignedModel: mockGetAssignedModel,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockConfig,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    detectHallucination: mockDetectHallucination,
    cosineSimilarity: jest.fn<() => number>().mockReturnValue(0.5),
}));

jest.unstable_mockModule('../../telegraphic.js', () => ({
    toTelegraphic: mockToTelegraphic,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectContextBlock: mockGetProjectContextBlock,
}));

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    extractVarIdsFromContent: mockExtractVarIdsFromContent,
    getVariablesByIds: mockGetVariablesByIds,
    buildVariableLegend: mockBuildVariableLegend,
    resolveContent: jest.fn<(s: string) => Promise<string>>().mockImplementation(async (s) => s),
    registerNodeVariables: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
    PROVENANCE_GUIDE_SYNTHESIS: 'PROVENANCE: tag each claim.',
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const { voice, voiceMulti } = await import('../../core/voicing.js');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeNode(id: string, content: string, domain = 'science'): ResonanceNode {
    return {
        id,
        content,
        nodeType: 'seed',
        trajectory: 'knowledge',
        domain,
        weight: 1.0,
        salience: 0.5,
        specificity: 1.5,
        origin: 'manual',
        contributor: 'human',
        excluded: false,
        feedbackRating: null,
        metadata: null,
        createdAt: '2024-01-01T00:00:00Z',
        lifecycleState: 'active',
        barrenCycles: 0,
        totalChildren: 0,
        generation: 0,
        bornAt: null,
        activatedAt: null,
        decliningSince: null,
        compostedAt: null,
        avatarUrl: null,
        partitionId: null,
    } as unknown as ResonanceNode;
}

beforeEach(() => {
    jest.resetAllMocks();
    mockCallSubsystemModel.mockResolvedValue('{"insight":"A new synthesized insight."}');
    mockCallConsultantModel.mockResolvedValue('{"insight":"A new synthesized insight."}');
    mockConsultantReview.mockResolvedValue({ score: 8, reasoning: 'Good synthesis' });
    mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'gpt-4', tier: 'tier2' });
    mockGetPrompt.mockResolvedValue('Synthesize A and B.');
    mockDetectHallucination.mockResolvedValue({ isHallucination: false, reasons: [] });
    mockToTelegraphic.mockImplementation((s) => s);
    mockGetProjectContextBlock.mockResolvedValue(null);
    mockExtractVarIdsFromContent.mockReturnValue([]);
    mockGetVariablesByIds.mockResolvedValue([]);
    mockBuildVariableLegend.mockReturnValue('');
    mockBuildProvenanceTag.mockReturnValue('manual/human');
    mockEmitActivity.mockReturnValue(undefined);

    // Reset config to defaults
    mockConfig.voicing.telegraphicEnabled = false;
    mockConfig.voicing.rejectUnclosedParens = true;
    mockConfig.voicing.rejectNoSentenceEnding = false;
    mockConfig.voicing.maxOutputWords = 50;
    mockConfig.voicing.minNovelWords = 3;
    mockConfig.voicing.minNovelWordLength = 4;
    mockConfig.voicing.responseCleanupPatterns = [];
    mockConfig.voicing.tierOverrides = {};
    mockConfig.numberVariables = { enabled: false };
    mockAppConfig.consultantReview = { enabled: false, thresholds: { voice: 5, synthesis: 5 } };
});

// =============================================================================
// voice() — happy path
// =============================================================================

describe('voice() — success path', () => {
    it('returns content from JSON insight field', async () => {
        const nodeA = makeNode('a', 'Alpha is important for outcomes.');
        const nodeB = makeNode('b', 'Beta enables systemic resilience mechanisms.');
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Combined alpha-beta framework drives sustainable outcomes."}');

        const result = await voice(nodeA, nodeB);

        expect(result.content).toBe('Combined alpha-beta framework drives sustainable outcomes.');
        expect(result.rejectionReason).toBeUndefined();
    });

    it('calls callSubsystemModel with voice subsystem by default', async () => {
        const nodeA = makeNode('a', 'First node content is here for reference.');
        const nodeB = makeNode('b', 'Second node content is here for reference.');

        await voice(nodeA, nodeB);

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('voice', expect.any(String), expect.any(Object));
    });

    it('uses callConsultantModel when useConsultant=true', async () => {
        const nodeA = makeNode('a', 'First node content here.');
        const nodeB = makeNode('b', 'Second node content here.');
        mockCallConsultantModel.mockResolvedValue('{"insight":"Consultant synthesis insight."}');

        await voice(nodeA, nodeB, 'object-following', 'voice', true);

        expect(mockCallConsultantModel).toHaveBeenCalled();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('prepends project context when available', async () => {
        mockGetProjectContextBlock.mockResolvedValue('Project: test-project\nDomain: science');
        const nodeA = makeNode('a', 'Alpha enables systemic outcomes.');
        const nodeB = makeNode('b', 'Beta drives resilience frameworks.');

        await voice(nodeA, nodeB);

        const [, promptArg] = mockCallSubsystemModel.mock.calls[0] as any[];
        expect(String(promptArg)).toContain('Project: test-project');
    });

    it('calls getPrompt with correct key', async () => {
        const nodeA = makeNode('a', 'Alpha content.');
        const nodeB = makeNode('b', 'Beta content.');

        await voice(nodeA, nodeB);

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'core.insight_synthesis',
            expect.objectContaining({ contentA: expect.any(String), contentB: expect.any(String) })
        );
    });
});

// =============================================================================
// voice() — JSON parsing fallback
// =============================================================================

describe('voice() — JSON parsing', () => {
    it('falls back to regex match when JSON parse fails', async () => {
        mockCallSubsystemModel.mockResolvedValue('Here is my output: {"insight":"Extracted insight text."}');

        const nodeA = makeNode('a', 'Alpha content here.');
        const nodeB = makeNode('b', 'Beta content here.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBe('Extracted insight text.');
    });

    it('uses raw text cleanup when no JSON found', async () => {
        mockConfig.voicing.responseCleanupPatterns = ['Insight:', 'Result:'];
        mockCallSubsystemModel.mockResolvedValue('Insight: Raw synthesized output here.');

        const nodeA = makeNode('a', 'Alpha text content.');
        const nodeB = makeNode('b', 'Beta text content.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).not.toContain('Insight:');
    });
});

// =============================================================================
// voice() — NO_VALID_SYNTHESIS rejection
// =============================================================================

describe('voice() — NO_VALID_SYNTHESIS', () => {
    it('rejects when output is exactly NO_VALID_SYNTHESIS', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"NO_VALID_SYNTHESIS"}');

        const nodeA = makeNode('a', 'Alpha enables outcomes.');
        const nodeB = makeNode('b', 'Beta drives resilience.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('no_valid_connection');
        expect(mockEmitActivity).toHaveBeenCalledWith('voicing', 'rejected', expect.any(String), expect.any(Object));
    });

    it('rejects when output contains NO_VALID_SYNTHESIS', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"I cannot synthesize: NO_VALID_SYNTHESIS"}');

        const nodeA = makeNode('a', 'Alpha content.');
        const nodeB = makeNode('b', 'Beta content.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('no_valid_connection');
    });
});

// =============================================================================
// voice() — truncation checks
// =============================================================================

describe('voice() — truncation checks', () => {
    it('rejects when unclosed parens detected', async () => {
        mockConfig.voicing.rejectUnclosedParens = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"This has an unclosed parenthesis (here."}');

        const nodeA = makeNode('a', 'Alpha framework content.');
        const nodeB = makeNode('b', 'Beta systemic approach.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_parens');
    });

    it('rejects when ending with comma (trailing)', async () => {
        mockConfig.voicing.rejectUnclosedParens = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"This ends with trailing,"}');

        const nodeA = makeNode('a', 'Alpha framework.');
        const nodeB = makeNode('b', 'Beta approach.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_trailing');
    });

    it('rejects when no sentence-ending punctuation and rejectNoSentenceEnding=true', async () => {
        mockConfig.voicing.rejectNoSentenceEnding = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"This has no ending punctuation at all"}');

        const nodeA = makeNode('a', 'Alpha content.');
        const nodeB = makeNode('b', 'Beta content.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_no_ending');
    });
});

// =============================================================================
// voice() — word count checks
// =============================================================================

describe('voice() — word count', () => {
    it('rejects entirely when output exceeds 2x maxOutputWords', async () => {
        mockConfig.voicing.maxOutputWords = 10;
        // 25 words — over 2x limit of 10
        const longText = 'word '.repeat(25).trim() + '.';
        mockCallSubsystemModel.mockResolvedValue(`{"insight":"${longText}"}`);

        const nodeA = makeNode('a', 'Alpha text.');
        const nodeB = makeNode('b', 'Beta text.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('too_long');
    });

    it('truncates to first sentence when between maxOutputWords and 2x limit', async () => {
        mockConfig.voicing.maxOutputWords = 10;
        // 15 words total with a sentence boundary
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Short sentence here. Then more words here beyond the limit now."}');

        const nodeA = makeNode('a', 'Alpha text.');
        const nodeB = makeNode('b', 'Beta text.');
        const result = await voice(nodeA, nodeB);

        // Should truncate to first sentence
        expect(result.content).toBe('Short sentence here.');
    });
});

// NOTE: derivative check, hallucination check, and consultant review gates
// were removed from voicing.ts in the unified pipeline refactor (March 2025).
// Population control now handles quality evaluation post-birth.

// =============================================================================
// voice() — variable legend
// =============================================================================

describe('voice() — number variables', () => {
    it('builds variable legend when feature enabled and vars found', async () => {
        mockConfig.numberVariables = { enabled: true };
        mockExtractVarIdsFromContent.mockReturnValue(['VAR001', 'VAR002']);
        mockGetVariablesByIds.mockResolvedValue([
            { id: 'VAR001', value: '42', domain: 'science' },
            { id: 'VAR002', value: '0.95', domain: 'science' },
        ]);
        mockBuildVariableLegend.mockReturnValue('VAR001=42, VAR002=0.95');

        const nodeA = makeNode('a', 'Value [[[VAR001]]] is significant.');
        const nodeB = makeNode('b', 'Threshold [[[VAR002]]] matters.');
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Combined thresholds drive significant outcomes."}');

        await voice(nodeA, nodeB);

        expect(mockGetVariablesByIds).toHaveBeenCalledWith(['VAR001', 'VAR002']);
        expect(mockBuildVariableLegend).toHaveBeenCalled();
    });

    it('strips variable placeholders from output', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Result [[[ABC123]]] shows significance."}');

        const nodeA = makeNode('a', 'Alpha content.');
        const nodeB = makeNode('b', 'Beta material.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).not.toContain('[[[ABC123]]]');
        expect(result.content).toContain('Result');
    });
});

// =============================================================================
// voiceMulti() — basic tests
// =============================================================================

describe('voiceMulti() — basic', () => {
    it('returns synthesized content from 3 nodes', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Multi-parent emergent synthesis insight."}');

        const nodes = [
            makeNode('a', 'Alpha node content here.'),
            makeNode('b', 'Beta node content here.'),
            makeNode('c', 'Gamma node content here.'),
        ];
        const result = await voiceMulti(nodes);

        expect(result.content).toBe('Multi-parent emergent synthesis insight.');
        expect(result.rejectionReason).toBeUndefined();
    });

    it('uses synthesis subsystem by default', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Emergent synthesis result here."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        await voiceMulti(nodes);

        expect(mockCallSubsystemModel).toHaveBeenCalledWith('synthesis', expect.any(String), expect.any(Object));
    });

    it('calls getPrompt with multi_insight_synthesis key', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Emergent synthesis result here."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        await voiceMulti(nodes);

        expect(mockGetPrompt).toHaveBeenCalledWith('core.multi_insight_synthesis', expect.any(Object));
    });

    it('rejects NO_VALID_SYNTHESIS from multi-parent', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"NO_VALID_SYNTHESIS"}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('no_valid_connection');
    });

    // NOTE: derivative, hallucination, and consultant tests removed —
    // those gates were deleted from voicing.ts in the unified pipeline refactor.
});
