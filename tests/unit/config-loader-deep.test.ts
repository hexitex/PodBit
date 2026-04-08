/**
 * Deep coverage tests for config/loader.ts — targets uncovered branches:
 * - persistConfigOverrides error path
 * - getSafeConfig catch/non-function paths
 * - loadSavedConfig: null intermediate path, lte constraint violation
 * - validateConfigRelationships: lte violation with clampTarget=a
 * - getConfigValue/setConfigValue: null/non-object intermediate paths
 * - updateConfig: non-object primitive assignment
 * - loadSavedConfig: v1 migration with no stale paths present
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockSystemQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: jest.fn().mockResolvedValue([]),
    queryOne: jest.fn().mockResolvedValue(null),
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

const mockEmitActivity = jest.fn();

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

const mockConfig: Record<string, any> = {};

function resetMockConfig() {
    for (const key of Object.keys(mockConfig)) {
        delete mockConfig[key];
    }
    Object.assign(mockConfig, {
        engine: {
            threshold: 0.55,
            salienceBoost: 0.1,
            salienceDecay: 0.05,
            salienceCeiling: 1.0,
            salienceFloor: 0.0,
            weightDecay: 0.01,
            parentBoost: 0.2,
            weightCeiling: 10.0,
            cycleDelayMs: 5000,
            decayEveryNCycles: 10,
            junkThreshold: 0.85,
            minSpecificity: 0.3,
            synthesisDecayEnabled: 1,
            synthesisDecayMultiplier: 0.95,
            synthesisDecayGraceDays: 7,
            specificityRatio: 0.5,
            knowledgeWeight: 1.0,
            abstractionWeight: 1.0,
        },
        voicing: {
            maxOutputWords: 30,
            maxInsightWords: 25,
            truncatedWords: 20,
            minNovelWords: 5,
        },
        hallucination: {
            enabled: 1,
            maxVerboseWords: 50,
            minOutputWordsForNoveltyCheck: 10,
        },
        dedup: {
            embeddingSimilarityThreshold: 0.9,
            wordOverlapThreshold: 0.85,
            llmJudgeHardCeiling: 0.95,
            llmJudgeDoubtFloor: 0.92,
        },
        nodes: {
            defaultWeight: 1.0,
            breakthroughWeight: 5.0,
        },
        subsystemTemperatures: { voice: 0.7, chat: 0.7 },
        subsystemRepeatPenalties: { voice: 1.0, chat: 1.0 },
        subsystemTopP: {},
        subsystemMinP: {},
        subsystemTopK: {},
        consultantTemperatures: {},
        consultantRepeatPenalties: {},
        consultantTopP: {},
        consultantMinP: {},
        consultantTopK: {},
        autonomousCycles: {
            validation: { intervalMs: 60000 },
            questions: { intervalMs: 60000 },
            tensions: { intervalMs: 60000 },
            research: { intervalMs: 60000 },
        },
        // NON_TUNABLE keys
        database: { path: 'data/test.db' },
        api: { openai: undefined, anthropic: undefined },
        services: {},
        server: { port: 3000 },
        resonance: null,
    });
}

jest.unstable_mockModule('../../config/defaults.js', () => ({
    config: mockConfig,
    DEFAULT_TEMPERATURES: { voice: 0.7, chat: 0.7 },
    DEFAULT_REPEAT_PENALTIES: { voice: 1.0, chat: 1.0 },
}));

const mockGetApiKeyStatus = jest.fn().mockReturnValue({ openai: 'set', anthropic: null });

jest.unstable_mockModule('../../models.js', () => ({
    getApiKeyStatus: mockGetApiKeyStatus,
}));

const {
    loadSavedConfig,
    updateConfig,
    resetSubsystemParams,
    getSafeConfig,
} = await import('../../config/loader.js');

beforeEach(() => {
    jest.clearAllMocks();
    resetMockConfig();
});

// =============================================================================
// persistConfigOverrides error path
// =============================================================================

describe('persistConfigOverrides error handling', () => {
    it('catches DB error during persist and does not throw', async () => {
        // persistConfigOverrides is called internally by updateConfig.
        // Make the DB INSERT fail to hit the catch block.
        mockSystemQuery.mockRejectedValueOnce(new Error('disk full'));
        // updateConfig calls persistConfigOverrides which should catch
        await expect(updateConfig({ engine: { threshold: 0.5 } } as any)).resolves.toBeDefined();
    });
});

// =============================================================================
// getSafeConfig edge cases
// =============================================================================

describe('getSafeConfig — edge branches', () => {
    it('handles getApiKeyStatus returning falsy openai/anthropic', () => {
        mockGetApiKeyStatus.mockReturnValueOnce({ openai: '', anthropic: '' });
        const safe = getSafeConfig();
        // Empty strings are falsy, so || undefined should produce undefined
        expect(safe.api).toBeDefined();
    });
});

// =============================================================================
// loadSavedConfig — null intermediate path in override application
// =============================================================================

describe('loadSavedConfig — path navigation edge cases', () => {
    it('skips override when intermediate path segment is null', async () => {
        // Add a section where intermediate is null
        (mockConfig as any).broken = null;
        const overrides = {
            'broken.nested.key': 42,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();
        // Should not throw — just skip the broken path
        expect((mockConfig as any).broken).toBeNull();
    });

    it('skips override when intermediate path segment is undefined', async () => {
        const overrides = {
            'nonExistent.deep.path.key': 42,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();
        // Should not throw
        expect((mockConfig as any).nonExistent).toBeUndefined();
    });
});

// =============================================================================
// loadSavedConfig — v1 migration runs but no stale paths present
// =============================================================================

describe('loadSavedConfig — v1 migration without stale intervals', () => {
    it('writes migration marker even when no stale intervals exist in overrides', async () => {
        const overrides = {
            'engine.threshold': 0.42,
            // No autonomousCycles.*.intervalMs or engine.cycleDelayMs keys
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce(null); // migration not done

        await loadSavedConfig();

        // Migration marker should still be written
        const markerCalls = mockSystemQuery.mock.calls.filter(
            (call: any) => call[1] && call[1][0] === '_migration_v1_intervals'
        );
        expect(markerCalls.length).toBe(1);
        expect(mockConfig.engine.threshold).toBe(0.42);
    });
});

// =============================================================================
// validateConfigRelationships — lte violation (clampTarget=a)
// =============================================================================

describe('cross-validation — lte constraint violation', () => {
    it('auto-corrects minOutputWordsForNoveltyCheck when > maxOutputWords (lte, clampTarget=a)', async () => {
        // The constraint: minOutputWordsForNoveltyCheck <= maxOutputWords
        // clampTarget=a means minOutputWordsForNoveltyCheck gets clamped to maxOutputWords
        mockConfig.hallucination.minOutputWordsForNoveltyCheck = 100;
        mockConfig.voicing.maxOutputWords = 30;

        const warnings = await updateConfig({} as any);

        expect(mockConfig.hallucination.minOutputWordsForNoveltyCheck).toBe(30);
        const lteWarning = warnings.find((w: any) =>
            w.param === 'hallucination.minOutputWordsForNoveltyCheck'
        );
        expect(lteWarning).toBeDefined();
        expect(lteWarning!.oldValue).toBe(100);
        expect(lteWarning!.newValue).toBe(30);
    });
});

// =============================================================================
// validateConfigRelationships — cascading violations
// =============================================================================

describe('cross-validation — cascading auto-corrections', () => {
    it('handles multiple simultaneous constraint violations', async () => {
        // Violate several constraints at once
        mockConfig.hallucination.maxVerboseWords = 5;    // must be >= maxOutputWords (30)
        mockConfig.voicing.maxOutputWords = 30;
        mockConfig.voicing.maxInsightWords = 50;          // must be <= maxOutputWords (30)
        mockConfig.voicing.truncatedWords = 40;            // must be <= maxOutputWords
        mockConfig.voicing.minNovelWords = 30;             // must be < maxOutputWords

        const warnings = await updateConfig({} as any);

        expect(warnings.length).toBeGreaterThanOrEqual(2);
    });
});

// =============================================================================
// updateConfig — primitive (non-object) value assignment
// =============================================================================

describe('updateConfig — non-object value handling', () => {
    it('directly assigns array values instead of deep-merging', async () => {
        (mockConfig as any).testList = ['a', 'b'];
        await updateConfig({ testList: ['c', 'd'] } as any);
        // Arrays should be replaced, not merged
        expect((mockConfig as any).testList).toEqual(['c', 'd']);
    });
});

// =============================================================================
// deepMerge edge case: source has array, target has object
// =============================================================================

describe('deepMerge edge cases via updateConfig', () => {
    it('replaces target object value when source provides an array', async () => {
        // deepMerge should replace (not recurse) when source value is an array
        (mockConfig as any).custom = { items: { nested: true } };
        await updateConfig({ custom: { items: [1, 2, 3] } } as any);
        expect((mockConfig as any).custom.items).toEqual([1, 2, 3]);
    });

    it('replaces target array when source provides an array', async () => {
        (mockConfig as any).custom = { items: [1, 2] };
        await updateConfig({ custom: { items: [3, 4, 5] } } as any);
        expect((mockConfig as any).custom.items).toEqual([3, 4, 5]);
    });

    it('replaces nested value with primitive', async () => {
        (mockConfig as any).custom = { nested: { deep: 42 } };
        await updateConfig({ custom: { nested: 'flat' } } as any);
        expect((mockConfig as any).custom.nested).toBe('flat');
    });
});

// =============================================================================
// loadSavedConfig — target[parts[i]] === null breaks path traversal
// =============================================================================

describe('loadSavedConfig — null in path traversal', () => {
    it('stops path traversal when intermediate config key is null', async () => {
        // Create a config section where a nested key is null
        (mockConfig as any).partial = { level1: null };
        const overrides = {
            'partial.level1.level2': 'should not apply',
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        // level1 should remain null — traversal stopped
        expect((mockConfig as any).partial.level1).toBeNull();
    });
});

// =============================================================================
// Cross-validation — dedup constraints
// =============================================================================

describe('cross-validation — dedup constraint violations', () => {
    it('auto-corrects llmJudgeDoubtFloor when > llmJudgeHardCeiling (gte, clampTarget=b)', async () => {
        mockConfig.dedup.llmJudgeHardCeiling = 0.8;
        mockConfig.dedup.llmJudgeDoubtFloor = 0.95;

        const warnings = await updateConfig({} as any);

        expect(mockConfig.dedup.llmJudgeDoubtFloor).toBeLessThanOrEqual(
            mockConfig.dedup.llmJudgeHardCeiling
        );
        const dedupWarning = warnings.find((w: any) =>
            w.param === 'dedup.llmJudgeDoubtFloor'
        );
        expect(dedupWarning).toBeDefined();
    });

    it('auto-corrects embeddingSimilarityThreshold when > llmJudgeDoubtFloor (gte, clampTarget=b)', async () => {
        mockConfig.dedup.llmJudgeDoubtFloor = 0.7;
        mockConfig.dedup.embeddingSimilarityThreshold = 0.95;

        const warnings = await updateConfig({} as any);

        expect(mockConfig.dedup.embeddingSimilarityThreshold).toBeLessThanOrEqual(
            mockConfig.dedup.llmJudgeDoubtFloor
        );
    });
});

// =============================================================================
// loadSavedConfig — loadSavedConfig triggers re-persist on validation warnings
// =============================================================================

describe('loadSavedConfig — re-persist on validation warnings', () => {
    it('re-persists when validation auto-corrects after loading overrides', async () => {
        const overrides = {
            'hallucination.minOutputWordsForNoveltyCheck': 999,
            'voicing.maxOutputWords': 30,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        // Should have called persist twice: once for validation warnings
        // The persist calls go through systemQuery (INSERT INTO settings)
        const persistCalls = mockSystemQuery.mock.calls.filter(
            (call: any) => call[1] && call[1][0] === 'config_overrides'
        );
        expect(persistCalls.length).toBeGreaterThanOrEqual(1);
    });
});

// =============================================================================
// loadSavedConfig — dynamic key sections with consultant prefix
// =============================================================================

describe('loadSavedConfig — consultant dynamic key sections', () => {
    it('applies dynamic keys to consultantTemperatures', async () => {
        const overrides = {
            'consultantTemperatures.voice': 0.25,
            'consultantRepeatPenalties.voice': 1.1,
            'consultantTopP.voice': 0.8,
            'consultantMinP.chat': 0.03,
            'consultantTopK.chat': 30,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.consultantTemperatures.voice).toBe(0.25);
        expect(mockConfig.consultantRepeatPenalties.voice).toBe(1.1);
        expect(mockConfig.consultantTopP.voice).toBe(0.8);
        expect(mockConfig.consultantMinP.chat).toBe(0.03);
        expect(mockConfig.consultantTopK.chat).toBe(30);
    });
});

// =============================================================================
// Cross-validation — nodes weight constraints
// =============================================================================

describe('cross-validation — node weight constraints', () => {
    it('auto-corrects breakthroughWeight when < defaultWeight', async () => {
        mockConfig.nodes.breakthroughWeight = 0.5;
        mockConfig.nodes.defaultWeight = 2.0;

        const warnings = await updateConfig({} as any);

        // breakthroughWeight >= defaultWeight, clampTarget=b means defaultWeight is clamped
        expect(mockConfig.nodes.defaultWeight).toBeLessThanOrEqual(
            mockConfig.nodes.breakthroughWeight
        );
    });

    it('auto-corrects defaultWeight when > breakthroughWeight > weightCeiling', async () => {
        mockConfig.engine.weightCeiling = 3.0;
        mockConfig.nodes.breakthroughWeight = 5.0;

        const warnings = await updateConfig({} as any);

        // weightCeiling >= breakthroughWeight, clampTarget=b
        expect(mockConfig.nodes.breakthroughWeight).toBeLessThanOrEqual(
            mockConfig.engine.weightCeiling
        );
    });
});

// =============================================================================
// getConfigValue / setConfigValue edge cases (via constraint validation)
// =============================================================================

describe('cross-validation — undefined config paths', () => {
    it('skips constraint when paramA path resolves to non-number', async () => {
        // Make a path resolve to a string instead of a number
        // This hits getConfigValue returning undefined for non-number final values
        (mockConfig as any).engine.salienceCeiling = 'not-a-number';
        // The salienceCeiling >= salienceFloor constraint should be skipped
        const warnings = await updateConfig({} as any);
        // No warning for the salienceCeiling/salienceFloor constraint
        const ceilingWarning = warnings.find((w: any) =>
            w.param === 'engine.salienceCeiling' || w.param === 'engine.salienceFloor'
        );
        expect(ceilingWarning).toBeUndefined();
    });

    it('skips constraint when config section does not exist', async () => {
        // Remove the entire dedup section — constraints referencing dedup.* should skip
        delete (mockConfig as any).dedup;
        const warnings = await updateConfig({} as any);
        // Dedup constraints should be skipped (no error thrown)
        const dedupWarnings = warnings.filter((w: any) =>
            w.param?.startsWith('dedup.')
        );
        expect(dedupWarnings.length).toBe(0);
    });
});

// =============================================================================
// deepMerge — target has array, source has array (both arrays replaced)
// =============================================================================

describe('deepMerge — source is non-object for object target', () => {
    it('replaces object target with primitive source value', async () => {
        (mockConfig as any).custom = { nested: { a: 1, b: 2 } };
        await updateConfig({ custom: { nested: 99 } } as any);
        expect((mockConfig as any).custom.nested).toBe(99);
    });

    it('replaces object target with null source value', async () => {
        (mockConfig as any).custom = { nested: { a: 1 } };
        await updateConfig({ custom: { nested: null } } as any);
        expect((mockConfig as any).custom.nested).toBeNull();
    });
});

// =============================================================================
// loadSavedConfig — override with flat key (no dots)
// =============================================================================

describe('loadSavedConfig — single-segment paths', () => {
    it('applies override for flat config key that exists', async () => {
        (mockConfig as any).topLevelNum = 42;
        const overrides = {
            'topLevelNum': 99,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();
        expect((mockConfig as any).topLevelNum).toBe(99);
    });
});

// =============================================================================
// setConfigValue — null intermediate (via constraint with deleted section)
// =============================================================================

describe('setConfigValue — unreachable intermediate', () => {
    it('handles setConfigValue no-op when intermediate is null during auto-correction', async () => {
        // Remove voicing entirely, then violate a constraint referencing voicing.maxOutputWords
        // This hits the setConfigValue guard where obj == null
        (mockConfig as any).voicing = null;

        // Constraints referencing voicing.* should skip since getConfigValue returns undefined
        const warnings = await updateConfig({} as any);
        // No voicing warnings since path is null
        const voicingWarnings = warnings.filter((w: any) =>
            w.param?.startsWith('voicing.')
        );
        expect(voicingWarnings.length).toBe(0);
    });
});

// =============================================================================
// persistConfigOverrides — flatten with null/falsy section
// =============================================================================

describe('persistConfigOverrides — skips falsy config sections', () => {
    it('skips null config sections during flatten', async () => {
        // Set a tunable section to null — flatten should skip it
        (mockConfig as any).synthesisEngine = null;
        await expect(updateConfig({ engine: { threshold: 0.5 } } as any)).resolves.toBeDefined();
        // Should not throw — null sections are skipped by the `if (!NON_TUNABLE.has(key) && (config as any)[key])` check
    });
});

// =============================================================================
// deepMerge — recursive branch (both source and target are nested objects)
// =============================================================================

describe('deepMerge — recursive nested object merge', () => {
    it('recursively merges nested objects without replacing sibling keys', async () => {
        // autonomousCycles has nested objects (validation: { intervalMs: ... })
        // Updating only one nested key should preserve others
        const origQuestions = mockConfig.autonomousCycles.questions.intervalMs;
        await updateConfig({
            autonomousCycles: {
                validation: { intervalMs: 99999 },
            },
        } as any);
        // validation.intervalMs should update
        expect(mockConfig.autonomousCycles.validation.intervalMs).toBe(99999);
        // questions.intervalMs should be preserved (deepMerge recurse, not replace)
        expect(mockConfig.autonomousCycles.questions.intervalMs).toBe(origQuestions);
    });

    it('recursively merges deeply nested objects', async () => {
        (mockConfig as any).deep = {
            level1: {
                level2: {
                    a: 1,
                    b: 2,
                },
                other: 'preserved',
            },
        };
        await updateConfig({
            deep: {
                level1: {
                    level2: {
                        a: 99,
                    },
                },
            },
        } as any);
        expect((mockConfig as any).deep.level1.level2.a).toBe(99);
        expect((mockConfig as any).deep.level1.level2.b).toBe(2);
        expect((mockConfig as any).deep.level1.other).toBe('preserved');
    });
});

// =============================================================================
// deepMerge — target is array, source is object (no recurse, replace)
// =============================================================================

describe('deepMerge — target array not recursed into', () => {
    it('does not recurse when target value is an array', async () => {
        (mockConfig as any).custom = { items: [1, 2, 3], name: 'test' };
        await updateConfig({
            custom: { items: { 0: 'a' }, name: 'updated' },
        } as any);
        // items should be replaced (not recursed into), because target is array
        expect((mockConfig as any).custom.items).toEqual({ 0: 'a' });
        expect((mockConfig as any).custom.name).toBe('updated');
    });
});
