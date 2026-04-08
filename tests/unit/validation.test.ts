/**
 * Unit tests for core/validation.ts —
 * validateBreakthrough, markBreakthrough, boostGenerativeAncestors,
 * getSourceNodes, runNoveltyGate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Validation prompt text');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockConfig = {
    nodes: {
        breakthroughWeight: 2.0,
        defaultWeight: 1.0,
    },
};

const mockAppConfig = {
    validation: {
        compositeWeights: {
            synthesis: 0.3,
            novelty: 0.35,
            testability: 0.2,
            tensionResolution: 0.15,
        },
        breakthroughThresholds: {
            minSynthesis: 0.6,
            minNovelty: 0.6,
            minTestability: 0.5,
            minTensionResolution: 0.5,
        },
        generativityBoost: {
            parent: 0.15,
            grandparent: 0.05,
        },
    },
    engine: {
        weightCeiling: 3.0,
    },
};

jest.unstable_mockModule('../../core/engine-config.js', () => ({
    config: mockConfig,
    appConfig: mockAppConfig,
}));

const mockCanOverride = jest.fn<() => Promise<any>>().mockResolvedValue({ allowed: true });
const mockLogDecision = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core/governance.js', () => ({
    canOverride: mockCanOverride,
    logDecision: mockLogDecision,
}));

const mockRegisterBreakthrough = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../handlers/breakthrough-registry.js', () => ({
    registerBreakthrough: mockRegisterBreakthrough,
}));

const mockResolveContent = jest.fn<(s: string) => Promise<string>>().mockImplementation(async s => s);

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
}));

const mockBuildProvenanceTag = jest.fn<() => string>().mockReturnValue('[voiced|knowledge]');

jest.unstable_mockModule('../../core/provenance.js', () => ({
    buildProvenanceTag: mockBuildProvenanceTag,
    PROVENANCE_GUIDE_VALIDATION: 'provenance guide text',
}));

const mockGetAssignedModel = jest.fn<() => any>().mockReturnValue(null);

jest.unstable_mockModule('../../models/assignments.js', () => ({
    getAssignedModel: mockGetAssignedModel,
}));

const { validateBreakthrough, markBreakthrough, boostGenerativeAncestors, getSourceNodes, runNoveltyGate } =
    await import('../../core/validation.js');

// =============================================================================
// Helpers
// =============================================================================

function makeNode(overrides: Record<string, any> = {}): any {
    return {
        id: 'node-123',
        content: 'A synthesis node content',
        domain: 'science',
        node_type: 'voiced',
        weight: 1.0,
        salience: 0.7,
        specificity: 0.6,
        embedding: null,
        ...overrides,
    };
}

function makeValidationJson(overrides: Record<string, any> = {}): string {
    return JSON.stringify({
        synthesis: { score: 0.8, reason: 'Good synthesis' },
        novelty: { score: 0.8, reason: 'Novel' },
        testability: { score: 0.7, reason: 'Testable' },
        tension_resolution: { score: 0.75, reason: 'Resolves tensions' },
        is_breakthrough: true,
        summary: 'A genuine breakthrough',
        ...overrides,
    });
}

beforeEach(() => {
    jest.resetAllMocks();

    // Restore config
    mockAppConfig.validation.compositeWeights = { synthesis: 0.3, novelty: 0.35, testability: 0.2, tensionResolution: 0.15 };
    mockAppConfig.validation.breakthroughThresholds = { minSynthesis: 0.6, minNovelty: 0.6, minTestability: 0.5, minTensionResolution: 0.5 };
    mockAppConfig.validation.generativityBoost = { parent: 0.15, grandparent: 0.05 };
    mockAppConfig.engine.weightCeiling = 3.0;
    mockConfig.nodes.breakthroughWeight = 2.0;
    mockConfig.nodes.defaultWeight = 1.0;

    // Restore mock defaults
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue(makeValidationJson());
    mockGetPrompt.mockResolvedValue('Validation prompt text');
    mockCanOverride.mockResolvedValue({ allowed: true });
    mockLogDecision.mockResolvedValue(undefined);
    mockRegisterBreakthrough.mockResolvedValue(undefined);
    mockResolveContent.mockImplementation(async s => s);
    mockBuildProvenanceTag.mockReturnValue('[voiced|knowledge]');
    mockGetAssignedModel.mockReturnValue(null);
});

// =============================================================================
// validateBreakthrough
// =============================================================================

describe('validateBreakthrough', () => {
    it('returns error when LLM call throws', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('Model unavailable'));

        const result = await validateBreakthrough(makeNode());

        expect(result.error).toBe('Model unavailable');
        expect(result.is_breakthrough).toBe(false);
    });

    it('returns error with raw response when no JSON found', async () => {
        mockCallSubsystemModel.mockResolvedValue('Not a JSON response at all');

        const result = await validateBreakthrough(makeNode());

        expect(result.error).toBe('Failed to parse validation response');
        expect(result.is_breakthrough).toBe(false);
        expect(result.raw).toBe('Not a JSON response at all');
    });

    it('returns parsed scores from LLM JSON', async () => {
        const result = await validateBreakthrough(makeNode());

        expect(result.scores).toEqual({
            synthesis: 0.8,
            novelty: 0.8,
            testability: 0.7,
            tension_resolution: 0.75,
        });
    });

    it('computes composite score correctly using config weights', async () => {
        // composite = 0.8*0.3 + 0.8*0.35 + 0.7*0.2 + 0.75*0.15
        //           = 0.24 + 0.28 + 0.14 + 0.1125 = 0.7725
        // Math.round(0.7725 * 10) / 10 = 0.8
        const result = await validateBreakthrough(makeNode());
        expect(result.composite).toBeCloseTo(0.8, 1);
    });

    it('sets is_breakthrough=true when all thresholds met', async () => {
        // synthesis=0.8 >= 0.6, novelty=0.8 >= 0.6, testability=0.7 >= 0.5
        const result = await validateBreakthrough(makeNode());
        expect(result.is_breakthrough).toBe(true);
    });

    it('sets is_breakthrough=false when novelty is below threshold', async () => {
        mockCallSubsystemModel.mockResolvedValue(makeValidationJson({
            novelty: { score: 0.3, reason: 'Too derivative' },
        }));

        const result = await validateBreakthrough(makeNode());

        expect(result.is_breakthrough).toBe(false);
    });

    it('sets is_breakthrough=false when synthesis is below threshold', async () => {
        mockCallSubsystemModel.mockResolvedValue(makeValidationJson({
            synthesis: { score: 0.2, reason: 'Weak synthesis' },
        }));

        const result = await validateBreakthrough(makeNode());

        expect(result.is_breakthrough).toBe(false);
    });

    it('passes true when tension_resolution meets threshold even if testability fails', async () => {
        mockCallSubsystemModel.mockResolvedValue(makeValidationJson({
            testability: { score: 0.2, reason: 'Not testable' },    // below 0.5
            tension_resolution: { score: 0.8, reason: 'Great' },    // above 0.5
        }));

        const result = await validateBreakthrough(makeNode());

        expect(result.is_breakthrough).toBe(true); // OR condition
    });

    it('calls resolveContent on node content', async () => {
        await validateBreakthrough(makeNode({ content: 'Content with [[[VAR001]]]' }));

        expect(mockResolveContent).toHaveBeenCalledWith('Content with [[[VAR001]]]');
    });

    it('includes resolved source content in prompt when sourceNodes provided', async () => {
        const source = makeNode({ content: 'Source content' });

        await validateBreakthrough(makeNode(), [source]);

        expect(mockResolveContent).toHaveBeenCalledWith('Source content');
    });

    it('adds validated_at timestamp to result', async () => {
        const result = await validateBreakthrough(makeNode());
        expect(result.validated_at).toBeDefined();
    });

    it('calls getPrompt with breakthrough_validation key', async () => {
        await validateBreakthrough(makeNode());

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'core.breakthrough_validation',
            expect.objectContaining({ nodeContent: expect.any(String) }),
        );
    });
});

// =============================================================================
// markBreakthrough
// =============================================================================

describe('markBreakthrough', () => {
    const validationResult: any = {
        is_breakthrough: true,
        composite: 0.8,
        scores: { synthesis: 0.8, novelty: 0.8, testability: 0.7, tension_resolution: 0.75 },
        summary: 'A breakthrough',
    };

    const nonBreakthroughResult: any = {
        is_breakthrough: false,
        composite: 0.4,
        scores: { synthesis: 0.3, novelty: 0.4, testability: 0.4, tension_resolution: 0.3 },
    };

    it('returns blocked when canOverride says not allowed', async () => {
        mockCanOverride.mockResolvedValue({ allowed: false, reason: 'Lower tier cannot override' });

        const result = await markBreakthrough('node-1', validationResult);

        expect((result as any).blocked).toBe(true);
        expect((result as any).reason).toContain('Lower tier');
    });

    it('updates node type to breakthrough when is_breakthrough=true', async () => {
        mockQueryOne.mockResolvedValue(null); // dream_cycles INSERT
        mockQueryOne.mockResolvedValue({ content: 'node content', domain: 'science', trajectory: 'knowledge' });

        await markBreakthrough('node-1', validationResult);

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('node_type') && params && params.includes('breakthrough')
        );
        expect(updateCall).toBeDefined();
    });

    it('updates node type to voiced when is_breakthrough=false', async () => {
        mockQueryOne.mockResolvedValue(null);

        await markBreakthrough('node-1', nonBreakthroughResult);

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('node_type') && params && params.includes('voiced')
        );
        expect(updateCall).toBeDefined();
    });

    it('uses breakthrough weight when is_breakthrough=true', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        await markBreakthrough('node-1', validationResult);

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('node_type') && Array.isArray(params) && params.includes(2.0)
        );
        expect(updateCall).toBeDefined();
    });

    it('logs the validation decision', async () => {
        mockQueryOne.mockResolvedValue(null);

        await markBreakthrough('node-1', validationResult);

        expect(mockLogDecision).toHaveBeenCalledWith(
            'node', 'node-1', 'node_type', null, 'breakthrough',
            expect.any(String), 'validation', expect.any(String),
        );
    });

    it('inserts into dream_cycles table', async () => {
        mockQueryOne.mockResolvedValue(null);

        await markBreakthrough('node-1', validationResult);

        const insertCall = (mockQueryOne.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('dream_cycles')
        );
        expect(insertCall).toBeDefined();
    });

    it('calls registerBreakthrough when is_breakthrough=true', async () => {
        mockQueryOne.mockResolvedValue({ content: 'breakthrough content', domain: 'science', trajectory: 'knowledge' });
        mockQuery.mockResolvedValue([{ content: 'parent content' }]);

        await markBreakthrough('node-1', validationResult);

        expect(mockRegisterBreakthrough).toHaveBeenCalledWith(expect.objectContaining({
            nodeId: 'node-1',
        }));
    });

    it('does not call registerBreakthrough when is_breakthrough=false', async () => {
        mockQueryOne.mockResolvedValue(null);

        await markBreakthrough('node-1', nonBreakthroughResult);

        expect(mockRegisterBreakthrough).not.toHaveBeenCalled();
    });

    it('calls boostGenerativeAncestors when is_breakthrough=true', async () => {
        // Query call order in markBreakthrough:
        //   #1: UPDATE nodes SET node_type
        //   #2: parents SELECT (boostGenerativeAncestors)
        //   #3: UPDATE parent weight
        //   #4: grandparents SELECT
        //   then queryOne for dream_cycles and node SELECT
        //   #5: SELECT parent contents for registerBreakthrough
        mockQuery
            .mockResolvedValueOnce([])   // UPDATE nodes (node_type)
            .mockResolvedValueOnce([{ source_id: 'parent-1', weight: 1.0 }]) // parents
            .mockResolvedValueOnce([])   // UPDATE parent weight
            .mockResolvedValueOnce([])   // grandparents
            .mockResolvedValue([]);      // rest
        mockQueryOne
            .mockResolvedValueOnce(null)  // INSERT dream_cycles
            .mockResolvedValueOnce({ content: 'content', domain: 'science', trajectory: 'knowledge' }) // node
            .mockResolvedValue(null);

        await markBreakthrough('node-1', validationResult);

        const weightUpdate = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('UPDATE nodes SET weight') && Array.isArray(params) && params.includes('parent-1')
        );
        expect(weightUpdate).toBeDefined();
    });

    it('does not boost ancestors when is_breakthrough=false', async () => {
        mockQueryOne.mockResolvedValue(null);

        await markBreakthrough('node-1', nonBreakthroughResult);

        // No parent/grandparent queries should have been made for boosting
        const parentQuery = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('source_id') && String(sql).includes('edges')
        );
        expect(parentQuery).toBeUndefined();
    });

    it('returns summary object with nodeId, is_breakthrough, new_type, new_weight', async () => {
        mockQueryOne.mockResolvedValue(null);
        mockQuery.mockResolvedValue([]);

        const result = await markBreakthrough('node-1', validationResult) as any;

        expect(result.nodeId).toBe('node-1');
        expect(result.is_breakthrough).toBe(true);
        expect(result.new_type).toBe('breakthrough');
        expect(result.new_weight).toBe(2.0);
    });
});

// =============================================================================
// boostGenerativeAncestors
// =============================================================================

describe('boostGenerativeAncestors', () => {
    it('boosts direct parent weight by PARENT_BOOST', async () => {
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'parent-1', weight: 1.0 }]) // parents
            .mockResolvedValueOnce([])   // grandparents
            .mockResolvedValue([]);      // UPDATEs

        await boostGenerativeAncestors('node-x');

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('UPDATE nodes SET weight') && Array.isArray(params) && params.includes('parent-1')
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[1][0]).toBeCloseTo(1.15); // 1.0 + 0.15
    });

    it('boosts grandparent weight by GRANDPARENT_BOOST', async () => {
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'parent-1', weight: 1.0 }]) // parents
            .mockResolvedValueOnce([])  // parent-1 UPDATE (resolved below)
            .mockResolvedValueOnce([{ source_id: 'gp-1', weight: 0.8 }]) // grandparents
            .mockResolvedValue([]);

        // Need correct order: parents, UPDATE parent, grandparents, UPDATE grandparent
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'parent-1', weight: 1.0 }])
            .mockResolvedValueOnce([]) // UPDATE parent
            .mockResolvedValueOnce([{ source_id: 'gp-1', weight: 0.8 }])
            .mockResolvedValue([]); // UPDATE grandparent

        await boostGenerativeAncestors('node-x');

        const gpUpdate = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('UPDATE nodes SET weight') && Array.isArray(params) && params.includes('gp-1')
        );
        expect(gpUpdate).toBeDefined();
        expect(gpUpdate[1][0]).toBeCloseTo(0.85); // 0.8 + 0.05
    });

    it('caps boosted weight at weightCeiling', async () => {
        mockAppConfig.engine.weightCeiling = 2.0;
        mockQuery
            .mockResolvedValueOnce([{ source_id: 'parent-1', weight: 1.9 }]) // near ceiling
            .mockResolvedValueOnce([])
            .mockResolvedValue([]);

        await boostGenerativeAncestors('node-x');

        const updateCall = (mockQuery.mock.calls as any[]).find(([sql, params]) =>
            String(sql).includes('UPDATE nodes SET weight') && Array.isArray(params) && params.includes('parent-1')
        );
        expect(updateCall[1][0]).toBe(2.0); // capped at ceiling, not 1.9 + 0.15 = 2.05
    });

    it('does nothing when no parents found', async () => {
        mockQuery.mockResolvedValueOnce([]); // no parents

        await boostGenerativeAncestors('node-x');

        const updateCalls = (mockQuery.mock.calls as any[]).filter(([sql]) =>
            String(sql).includes('UPDATE nodes SET weight')
        );
        expect(updateCalls).toHaveLength(0);
    });
});

// =============================================================================
// getSourceNodes
// =============================================================================

describe('getSourceNodes', () => {
    it('queries edges with correct types', async () => {
        mockQuery.mockResolvedValue([]);
        await getSourceNodes('node-1');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('parent');
        expect(String(sql)).toContain('tension_source');
        expect(params).toContain('node-1');
    });

    it('returns query results', async () => {
        const rows = [makeNode({ id: 'src-1' }), makeNode({ id: 'src-2' })];
        mockQuery.mockResolvedValue(rows);

        const result = await getSourceNodes('node-1');

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('src-1');
    });
});

// =============================================================================
// runNoveltyGate
// =============================================================================

describe('runNoveltyGate', () => {
    it('returns novel=true, skipped=true when breakthrough_check subsystem is unassigned', async () => {
        mockGetAssignedModel.mockReturnValue(null);

        const result = await runNoveltyGate(makeNode());

        expect(result.novel).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBe('unassigned');
    });

    it('returns novel=true, skipped=true when LLM response has no JSON', async () => {
        mockGetAssignedModel.mockReturnValue({ id: 'model-1' });
        mockCallSubsystemModel.mockResolvedValue('Not JSON at all');

        const result = await runNoveltyGate(makeNode());

        expect(result.novel).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBe('parse_error');
    });

    it('returns novel=true, skipped=true when LLM throws', async () => {
        mockGetAssignedModel.mockReturnValue({ id: 'model-1' });
        mockCallSubsystemModel.mockRejectedValue(new Error('Timeout'));

        const result = await runNoveltyGate(makeNode());

        expect(result.novel).toBe(true);
        expect(result.skipped).toBe(true);
        expect(result.skipReason).toBe('error');
    });

    it('returns parsed novel=false when LLM says not novel', async () => {
        mockGetAssignedModel.mockReturnValue({ id: 'model-1' });
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            novel: false,
            confidence: 0.9,
            reasoning: 'This idea is well-known',
        }));

        const result = await runNoveltyGate(makeNode());

        expect(result.novel).toBe(false);
        expect(result.confidence).toBe(0.9);
        expect(result.reasoning).toBe('This idea is well-known');
    });

    it('returns parsed novel=true when LLM says novel', async () => {
        mockGetAssignedModel.mockReturnValue({ id: 'model-1' });
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            novel: true,
            confidence: 0.85,
            reasoning: 'Genuinely novel insight',
        }));

        const result = await runNoveltyGate(makeNode());

        expect(result.novel).toBe(true);
        expect(result.confidence).toBe(0.85);
        expect(result.skipped).toBeUndefined();
    });

    it('calls getPrompt with novelty_gate key', async () => {
        mockGetAssignedModel.mockReturnValue({ id: 'model-1' });
        mockCallSubsystemModel.mockResolvedValue('{}');

        await runNoveltyGate(makeNode({ domain: 'physics' }));

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'core.novelty_gate',
            expect.objectContaining({ domain: 'physics' }),
        );
    });
});
