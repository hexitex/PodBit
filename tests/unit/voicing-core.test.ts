/**
 * Additional unit tests for core/voicing.ts — targets previously uncovered code paths.
 *
 * Covers: telegraphic compression, stray colon stripping, truncation fallback (no sentence),
 * tier overrides for minNovelWords, variable legend preamble injection, voiceMulti truncation,
 * voiceMulti consultant revisedOutput too short, voiceMulti telegraphic enabled.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ResonanceNode } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Mutable config
// ---------------------------------------------------------------------------
const mockConfig: Record<string, any> = {
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
        truncatedWords: 5,
        responseCleanupPatterns: [],
        tierOverrides: {},
    },
    numberVariables: { enabled: false },
};

const mockAppConfig: Record<string, any> = {
    consultantReview: { enabled: false, thresholds: { voice: 5, synthesis: 5 } },
};

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{"insight":"A synthesized insight."}');
const mockCallConsultantModel = jest.fn<() => Promise<string>>().mockResolvedValue('{"insight":"A synthesized insight."}');
const mockConsultantReview = jest.fn<() => Promise<any>>().mockResolvedValue({ score: 8, reasoning: 'Good' });
const mockGetAssignedModel = jest.fn<() => any>().mockReturnValue({ id: 'model-1', name: 'gpt-4', tier: 'tier2' });
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Synthesize: {contentA} and {contentB}');
const mockDetectHallucination = jest.fn<() => Promise<any>>().mockResolvedValue({ isHallucination: false, reasons: [] });
const mockToTelegraphic = jest.fn<(s: string) => string>().mockImplementation((s) => `tele:${s}`);
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

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
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

function resetConfig() {
    mockConfig.voicing = {
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
        minNovelWords: 2,
        truncatedWords: 5,
        responseCleanupPatterns: [],
        tierOverrides: {},
    };
    mockConfig.numberVariables = { enabled: false };
    mockAppConfig.consultantReview = { enabled: false, thresholds: { voice: 5, synthesis: 5 } };
}

beforeEach(() => {
    jest.resetAllMocks();
    resetConfig();
    mockCallSubsystemModel.mockResolvedValue('{"insight":"A novel synthesized insight emerges."}');
    mockCallConsultantModel.mockResolvedValue('{"insight":"A novel synthesized insight emerges."}');
    mockConsultantReview.mockResolvedValue({ score: 8, reasoning: 'Good synthesis' });
    mockGetAssignedModel.mockReturnValue({ id: 'model-1', name: 'gpt-4', tier: 'tier2' });
    mockGetPrompt.mockResolvedValue('Synthesize A and B.');
    mockDetectHallucination.mockResolvedValue({ isHallucination: false, reasons: [] });
    mockToTelegraphic.mockImplementation((s) => `tele:${s}`);
    mockGetProjectContextBlock.mockResolvedValue(null);
    mockExtractVarIdsFromContent.mockReturnValue([]);
    mockGetVariablesByIds.mockResolvedValue([]);
    mockBuildVariableLegend.mockReturnValue('');
    mockBuildProvenanceTag.mockReturnValue('manual/human');
    mockEmitActivity.mockReturnValue(undefined);
});

// =============================================================================
// voice() — telegraphic compression
// =============================================================================

describe('voice() — telegraphic compression', () => {
    it('calls toTelegraphic on both node contents when enabled', async () => {
        mockConfig.voicing.telegraphicEnabled = true;
        mockConfig.voicing.telegraphicAggressiveness = 'light';

        const nodeA = makeNode('a', 'Alpha drives sustainable outcomes.');
        const nodeB = makeNode('b', 'Beta enables resilience mechanisms.');

        await voice(nodeA, nodeB);

        expect(mockToTelegraphic).toHaveBeenCalledTimes(2);
        expect(mockToTelegraphic).toHaveBeenCalledWith('Alpha drives sustainable outcomes.', expect.objectContaining({ aggressiveness: 'light' }));
    });

    it('maps numeric aggressiveness (1=light, 2=medium, 3=aggressive)', async () => {
        mockConfig.voicing.telegraphicEnabled = true;
        mockConfig.voicing.telegraphicAggressiveness = 1;

        const nodeA = makeNode('a', 'Content alpha here.');
        const nodeB = makeNode('b', 'Content beta here.');
        await voice(nodeA, nodeB);

        expect(mockToTelegraphic).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ aggressiveness: 'light' }));
    });

    it('defaults to medium for unknown numeric aggressiveness', async () => {
        mockConfig.voicing.telegraphicEnabled = true;
        mockConfig.voicing.telegraphicAggressiveness = 99;

        const nodeA = makeNode('a', 'Content alpha.');
        const nodeB = makeNode('b', 'Content beta.');
        await voice(nodeA, nodeB);

        expect(mockToTelegraphic).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ aggressiveness: 'medium' }));
    });

    it('passes entropy options when entropyEnabled is true', async () => {
        mockConfig.voicing.telegraphicEnabled = true;
        mockConfig.voicing.entropyEnabled = true;
        mockConfig.voicing.entropyRarityMinLength = 10;

        const nodeA = makeNode('a', 'Alpha framework content.');
        const nodeB = makeNode('b', 'Beta resilience content.');
        await voice(nodeA, nodeB);

        expect(mockToTelegraphic).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
            entropy: expect.objectContaining({ enabled: true, rarityMinLength: 10 }),
        }));
    });
});

// =============================================================================
// voice() — stray colon stripping
// =============================================================================

describe('voice() — stray colon stripping', () => {
    it('strips leading colon from output', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":": Quantum entanglement drives emergent phenomena strongly."}');

        const nodeA = makeNode('a', 'Simple content baseline.');
        const nodeB = makeNode('b', 'Basic material reference.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).not.toMatch(/^:/);
        expect(result.content).toContain('Quantum');
    });
});

// =============================================================================
// voice() — truncation to word slice fallback
// =============================================================================

describe('voice() — word slice truncation fallback', () => {
    it('truncates to truncatedWords when no sentence boundary found', async () => {
        mockConfig.voicing.maxOutputWords = 5;
        mockConfig.voicing.truncatedWords = 3;
        // 8 words with NO sentence-ending punctuation at all — no period/!/? mid-text
        // The regex `^[^.!?]+[.!?]` won't match, triggering the word-slice fallback
        mockCallSubsystemModel.mockResolvedValue('{"insight":"alpha beta gamma delta epsilon zeta eta theta"}');
        // Disable sentence ending check to let it through to truncation
        mockConfig.voicing.rejectNoSentenceEnding = false;
        mockConfig.voicing.rejectUnclosedParens = false;

        const nodeA = makeNode('a', 'Unrelated content xyz.');
        const nodeB = makeNode('b', 'Other material abc.');
        const result = await voice(nodeA, nodeB);

        // Should be truncated to truncatedWords (3) + "..."
        expect(result.content).toContain('...');
    });
});

// =============================================================================
// voice() — tier overrides for minNovelWords
// =============================================================================

// NOTE: tier override derivative tests removed — derivative check gate
// was deleted from voicing.ts in the unified pipeline refactor.

// =============================================================================
// voice() — variable legend preamble injection
// =============================================================================

describe('voice() — preamble injection', () => {
    it('injects var legend into preamble when prompt does not include it', async () => {
        mockConfig.numberVariables = { enabled: true };
        mockExtractVarIdsFromContent.mockReturnValue(['V1']);
        mockGetVariablesByIds.mockResolvedValue([{ id: 'V1', value: '42', domain: 'sci' }]);
        mockBuildVariableLegend.mockReturnValue('LEGEND: V1=42');
        // Prompt that does NOT contain the legend text
        mockGetPrompt.mockResolvedValue('Synthesize these nodes.');

        const nodeA = makeNode('a', 'Value [[[V1]]] matters.');
        const nodeB = makeNode('b', 'Other content here.');
        await voice(nodeA, nodeB);

        const [, prompt] = mockCallSubsystemModel.mock.calls[0] as any[];
        expect(String(prompt)).toContain('LEGEND: V1=42');
    });

    it('does not duplicate legend if prompt already includes it', async () => {
        mockConfig.numberVariables = { enabled: true };
        mockExtractVarIdsFromContent.mockReturnValue(['V1']);
        mockGetVariablesByIds.mockResolvedValue([{ id: 'V1', value: '42', domain: 'sci' }]);
        mockBuildVariableLegend.mockReturnValue('LEGEND: V1=42');
        // Prompt that already includes the legend
        mockGetPrompt.mockResolvedValue('LEGEND: V1=42\nSynthesize these nodes.');

        const nodeA = makeNode('a', 'Value here.');
        const nodeB = makeNode('b', 'Other content.');
        await voice(nodeA, nodeB);

        const [, prompt] = mockCallSubsystemModel.mock.calls[0] as any[];
        const legendCount = (String(prompt).match(/LEGEND: V1=42/g) || []).length;
        expect(legendCount).toBe(1);
    });

    it('injects PROVENANCE guide when prompt does not contain PROVENANCE', async () => {
        // Prompt with no mention of PROVENANCE
        mockGetPrompt.mockResolvedValue('Just synthesize these nodes.');

        const nodeA = makeNode('a', 'Content alpha here.');
        const nodeB = makeNode('b', 'Content beta here.');
        await voice(nodeA, nodeB);

        const [, prompt] = mockCallSubsystemModel.mock.calls[0] as any[];
        expect(String(prompt)).toContain('PROVENANCE: tag each claim.');
    });
});

// =============================================================================
// voice() — getAssignedModel returns null
// =============================================================================

describe('voice() — null assigned model', () => {
    it('handles null assigned model gracefully', async () => {
        mockGetAssignedModel.mockReturnValue(null);
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Emergent quantum synthesis insight emerges."}');

        const nodeA = makeNode('a', 'Simple content.');
        const nodeB = makeNode('b', 'Basic material.');
        const result = await voice(nodeA, nodeB);

        expect(result.content).not.toBeNull();
    });
});

// =============================================================================
// voice() — consultant review error is non-fatal
// =============================================================================

describe('voice() — consultant review error handling', () => {
    it('continues when consultant review throws', async () => {
        mockAppConfig.consultantReview = { enabled: true, thresholds: { voice: 5, synthesis: 5 } };
        mockConsultantReview.mockRejectedValue(new Error('consultant timeout'));
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Quantum entanglement drives emergent phenomena strongly."}');

        const nodeA = makeNode('a', 'Simple alpha.');
        const nodeB = makeNode('b', 'Simple beta.');
        const result = await voice(nodeA, nodeB);

        // Should not reject — consultant errors are non-fatal
        expect(result.content).not.toBeNull();
        expect(result.rejectionReason).toBeUndefined();
    });
});

// =============================================================================
// voiceMulti() — telegraphic enabled
// =============================================================================

describe('voiceMulti() — telegraphic compression', () => {
    it('applies telegraphic to all parent nodes when enabled', async () => {
        mockConfig.voicing.telegraphicEnabled = true;
        mockConfig.voicing.telegraphicAggressiveness = 3;

        const nodes = [
            makeNode('a', 'Alpha content.'),
            makeNode('b', 'Beta content.'),
            makeNode('c', 'Gamma content.'),
        ];
        await voiceMulti(nodes);

        expect(mockToTelegraphic).toHaveBeenCalledTimes(3);
        expect(mockToTelegraphic).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ aggressiveness: 'aggressive' }));
    });
});

// =============================================================================
// voiceMulti() — truncation checks
// =============================================================================

describe('voiceMulti() — truncation checks', () => {
    it('rejects unclosed parens in multi-parent output', async () => {
        mockConfig.voicing.rejectUnclosedParens = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Unclosed paren (here."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_parens');
    });

    it('rejects trailing comma in multi-parent output', async () => {
        mockConfig.voicing.rejectUnclosedParens = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Trailing comma,"}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_trailing');
    });

    it('rejects no sentence ending in multi-parent when config enabled', async () => {
        mockConfig.voicing.rejectNoSentenceEnding = true;
        mockCallSubsystemModel.mockResolvedValue('{"insight":"No ending punctuation here"}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('truncated_no_ending');
    });

    it('rejects grossly over-limit multi-parent output (>2x)', async () => {
        mockConfig.voicing.maxOutputWords = 5;
        const longText = 'word '.repeat(15).trim() + '.';
        mockCallSubsystemModel.mockResolvedValue(`{"insight":"${longText}"}`);

        const nodes = [makeNode('a', 'Unrelated alpha.'), makeNode('b', 'Unrelated beta.'), makeNode('c', 'Unrelated gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBeNull();
        expect(result.rejectionReason).toBe('too_long');
    });

    it('truncates to first sentence in multi-parent when between max and 2x', async () => {
        mockConfig.voicing.maxOutputWords = 5;
        // 8 words with sentence boundary, under 2x (10)
        mockCallSubsystemModel.mockResolvedValue('{"insight":"First sentence here. More words beyond limit."}');

        const nodes = [makeNode('a', 'Unrelated xyz.'), makeNode('b', 'Unrelated abc.'), makeNode('c', 'Unrelated def.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBe('First sentence here.');
    });

    it('falls back to word slice in multi-parent when no sentence boundary', async () => {
        mockConfig.voicing.maxOutputWords = 5;
        mockConfig.voicing.truncatedWords = 3;
        mockConfig.voicing.rejectNoSentenceEnding = false;
        mockConfig.voicing.rejectUnclosedParens = false;
        // 8 words, NO sentence-ending punctuation — triggers word-slice fallback
        mockCallSubsystemModel.mockResolvedValue('{"insight":"alpha beta gamma delta epsilon zeta eta theta"}');

        const nodes = [makeNode('a', 'Unrelated xyz.'), makeNode('b', 'Unrelated abc.'), makeNode('c', 'Unrelated def.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toContain('...');
    });
});

// =============================================================================
// voiceMulti() — stray colon stripping
// =============================================================================

describe('voiceMulti() — stray colon', () => {
    it('strips leading colon from multi-parent output', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":": Emergent synthesis quantum insight manifests."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).not.toMatch(/^:/);
    });
});

// =============================================================================
// voiceMulti() — variable refs stripped from output
// =============================================================================

describe('voiceMulti() — variable ref stripping', () => {
    it('strips echoed variable placeholders from multi-parent output', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"insight":"Result [[[ABC123]]] shows quantum significance."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).not.toContain('[[[ABC123]]]');
    });
});

// =============================================================================
// voiceMulti() — number variables legend
// =============================================================================

describe('voiceMulti() — number variables', () => {
    it('builds variable legend for multi-parent synthesis', async () => {
        mockConfig.numberVariables = { enabled: true };
        mockExtractVarIdsFromContent.mockReturnValue(['MV1']);
        mockGetVariablesByIds.mockResolvedValue([{ id: 'MV1', value: '99', domain: 'physics' }]);
        mockBuildVariableLegend.mockReturnValue('LEGEND: MV1=99');
        mockGetPrompt.mockResolvedValue('Multi synthesize.');

        const nodes = [makeNode('a', '[[[MV1]]] alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        await voiceMulti(nodes);

        expect(mockBuildVariableLegend).toHaveBeenCalled();
        const [, prompt] = mockCallSubsystemModel.mock.calls[0] as any[];
        expect(String(prompt)).toContain('LEGEND: MV1=99');
    });
});

// NOTE: consultant review tests removed — consultant review gate
// was deleted from voicing.ts in the unified pipeline refactor.

// =============================================================================
// voiceMulti() — JSON parsing fallback
// =============================================================================

describe('voiceMulti() — JSON parsing fallback', () => {
    it('falls back to regex match when JSON parse fails', async () => {
        mockCallSubsystemModel.mockResolvedValue('Blah blah {"insight":"Extracted multi insight text."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).toBe('Extracted multi insight text.');
    });

    it('uses raw text cleanup when no JSON found in multi-parent', async () => {
        mockConfig.voicing.responseCleanupPatterns = ['Result:'];
        mockCallSubsystemModel.mockResolvedValue('Result: Raw multi parent emergent synthesis output here.');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        const result = await voiceMulti(nodes);

        expect(result.content).not.toContain('Result:');
    });
});

// =============================================================================
// voiceMulti() — uses callConsultantModel when useConsultant=true
// =============================================================================

describe('voiceMulti() — consultant model caller', () => {
    it('calls callConsultantModel when useConsultant=true', async () => {
        mockCallConsultantModel.mockResolvedValue('{"insight":"Consultant multi synthesis insight."}');

        const nodes = [makeNode('a', 'Alpha.'), makeNode('b', 'Beta.'), makeNode('c', 'Gamma.')];
        await voiceMulti(nodes, 'object-following', 'synthesis', true);

        expect(mockCallConsultantModel).toHaveBeenCalled();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });
});
