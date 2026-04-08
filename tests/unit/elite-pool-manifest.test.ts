/**
 * Unit tests for core/elite-pool-manifest.ts —
 * mapToManifest, getManifestCoverage, getManifestGaps, getTerminalFindings.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetProjectManifest = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('[]');

const mockAppConfig = {
    elitePool: {
        maxGeneration: 5,
        manifestMapping: { minRelevanceScore: 0.5 },
    },
};

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    systemQuery: jest.fn().mockResolvedValue([]),
    systemQueryOne: jest.fn().mockResolvedValue(null),
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Map this content to targets');
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../core/project-context.js', () => ({
    getProjectManifest: mockGetProjectManifest,
}));
jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const { mapToManifest, getManifestCoverage, getManifestGaps, getTerminalFindings } =
    await import('../../core/elite-pool-manifest.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetProjectManifest.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue('[0.8]');
    mockAppConfig.elitePool.maxGeneration = 5;
    mockAppConfig.elitePool.manifestMapping.minRelevanceScore = 0.5;
});

// =============================================================================
// mapToManifest
// =============================================================================

describe('mapToManifest', () => {
    it('returns null when no manifest', async () => {
        mockGetProjectManifest.mockResolvedValue(null);
        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('returns null when manifest has no targets', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: [], keyQuestions: [], bridges: [] });
        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
    });

    it('returns null when LLM returns empty response', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Goal A'] });
        mockCallSubsystemModel.mockResolvedValue('');
        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
    });

    it('returns null when LLM response has no JSON array', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Goal A'] });
        mockCallSubsystemModel.mockResolvedValue('no array here');
        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
    });

    it('returns null when scores array length mismatches target count', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Goal A', 'Goal B'] });
        mockCallSubsystemModel.mockResolvedValue('[0.8]'); // only 1 score for 2 goals
        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
    });

    it('returns mapping with targets above minRelevanceScore', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A', 'Goal B'],
            keyQuestions: [],
            bridges: [],
        });
        mockCallSubsystemModel.mockResolvedValue('[0.9, 0.2]'); // Goal A: 0.9, Goal B: 0.2

        const result = await mapToManifest('elite-1', 'content', 'science');

        expect(result).not.toBeNull();
        expect(result!.eliteNodeId).toBe('elite-1');
        expect(result!.targets).toHaveLength(1); // only Goal A passes 0.5 threshold
        expect(result!.targets[0].text).toBe('Goal A');
        expect(result!.targets[0].relevanceScore).toBe(0.9);
        expect(result!.targets[0].type).toBe('goal');
    });

    it('persists matching targets to DB', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Research goal'], keyQuestions: [], bridges: [] });
        mockCallSubsystemModel.mockResolvedValue('[0.85]');

        await mapToManifest('elite-1', 'content', 'science');

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT INTO elite_manifest_mappings')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1]).toContain('elite-1');
        expect(insertCall[1]).toContain('goal');
        expect(insertCall[1]).toContain('Research goal');
    });

    it('handles questions and bridges in target list', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A'],
            keyQuestions: ['Question B?'],
            bridges: [['Domain X', 'Domain Y']],
        });
        mockCallSubsystemModel.mockResolvedValue('[0.9, 0.8, 0.7]');

        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result!.targets).toHaveLength(3);
        const types = result!.targets.map(t => t.type);
        expect(types).toContain('goal');
        expect(types).toContain('question');
        expect(types).toContain('bridge');
    });

    it('clamps scores to [0, 1]', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Goal A'] });
        mockCallSubsystemModel.mockResolvedValue('[1.5]'); // above 1

        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result!.targets[0].relevanceScore).toBe(1);
    });

    it('returns null when LLM call throws', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: ['Goal A'] });
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM unavailable'));

        const result = await mapToManifest('elite-1', 'content', 'science');
        expect(result).toBeNull();
    });
});

// =============================================================================
// getManifestCoverage
// =============================================================================

describe('getManifestCoverage', () => {
    it('returns null when no manifest', async () => {
        mockGetProjectManifest.mockResolvedValue(null);
        const result = await getManifestCoverage();
        expect(result).toBeNull();
    });

    it('returns coverage with overallCoverage=0 when no targets at all', async () => {
        mockGetProjectManifest.mockResolvedValue({ goals: [], keyQuestions: [], bridges: [] });
        const result = await getManifestCoverage();
        expect(result).not.toBeNull();
        expect(result!.overallCoverage).toBe(0);
    });

    it('computes coverage for goals', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A', 'Goal B'],
            keyQuestions: [],
            bridges: [],
        });
        // Goal A has 1 covering node, Goal B has none
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'elite-1', relevance_score: 0.9 }]) // Goal A
            .mockResolvedValueOnce([]); // Goal B

        const result = await getManifestCoverage();

        expect(result!.goals).toHaveLength(2);
        expect(result!.goals[0].coveredBy).toContain('elite-1');
        expect(result!.goals[1].coveredBy).toHaveLength(0);
        expect(result!.uncoveredGoals).toContain('Goal B');
        expect(result!.uncoveredGoals).not.toContain('Goal A');
    });

    it('computes overallCoverage correctly', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A', 'Goal B'],
            keyQuestions: ['Q1'],
            bridges: [],
        });
        mockQuery
            .mockResolvedValueOnce([{ node_id: 'n1', relevance_score: 0.9 }]) // Goal A covered
            .mockResolvedValueOnce([]) // Goal B uncovered
            .mockResolvedValueOnce([]); // Q1 uncovered

        const result = await getManifestCoverage();
        // 1 of 3 targets covered
        expect(result!.overallCoverage).toBeCloseTo(1 / 3);
    });
});

// =============================================================================
// getManifestGaps
// =============================================================================

describe('getManifestGaps', () => {
    it('returns null when no manifest (getManifestCoverage returns null)', async () => {
        mockGetProjectManifest.mockResolvedValue(null);
        const result = await getManifestGaps();
        expect(result).toBeNull();
    });

    it('returns gaps when some targets are uncovered', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A'],
            keyQuestions: ['Q1'],
            bridges: [['D1', 'D2']],
        });
        mockQuery
            .mockResolvedValueOnce([]) // Goal A uncovered
            .mockResolvedValueOnce([]) // Q1 uncovered
            .mockResolvedValueOnce([]); // bridge uncovered

        const result = await getManifestGaps();

        expect(result).not.toBeNull();
        expect(result!.uncoveredGoals).toContain('Goal A');
        expect(result!.uncoveredQuestions).toContain('Q1');
        expect(result!.totalGaps).toBe(3);
        expect(result!.totalTargets).toBe(3);
    });

    it('returns zero gaps when all targets are covered', async () => {
        mockGetProjectManifest.mockResolvedValue({
            goals: ['Goal A'],
            keyQuestions: [],
            bridges: [],
        });
        mockQuery.mockResolvedValueOnce([{ node_id: 'n1', relevance_score: 0.9 }]);

        const result = await getManifestGaps();
        expect(result!.totalGaps).toBe(0);
    });
});

// =============================================================================
// getTerminalFindings
// =============================================================================

describe('getTerminalFindings', () => {
    it('returns empty array when no terminal nodes', async () => {
        mockQuery.mockResolvedValueOnce([]); // no elite nodes at max gen
        const result = await getTerminalFindings();
        expect(result).toHaveLength(0);
    });

    it('returns terminal findings with manifest targets', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'elite-1', content: 'Finding A', domain: 'science', generation: 5, confidence: 0.95, promoted_at: '2024-01-01' },
            ])
            .mockResolvedValueOnce([
                { manifest_target_type: 'goal', manifest_target_text: 'Research goal' },
            ]);

        const result = await getTerminalFindings();

        expect(result).toHaveLength(1);
        expect(result[0].nodeId).toBe('elite-1');
        expect(result[0].confidence).toBe(0.95);
        expect(result[0].manifestTargets).toHaveLength(1);
        expect(result[0].manifestTargets[0].type).toBe('goal');
    });

    it('uses maxGeneration from config in query', async () => {
        mockAppConfig.elitePool.maxGeneration = 7;
        mockQuery.mockResolvedValueOnce([]);

        await getTerminalFindings();

        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(7);
    });

    it('handles nodes with no manifest targets', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 'elite-1', content: 'Finding', domain: 'science', generation: 5, confidence: 0.9, promoted_at: '2024-01-01' },
            ])
            .mockResolvedValueOnce([]); // no manifest mappings

        const result = await getTerminalFindings();
        expect(result[0].manifestTargets).toHaveLength(0);
    });
});
