/**
 * Unit tests for config/loader.ts — loadSavedConfig, updateConfig,
 * resetSubsystemParams, getSafeConfig, persistConfigOverrides,
 * and validateConfigRelationships.
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

// Mock the config object with a minimal but realistic shape
const mockConfig: Record<string, any> = {};

function resetMockConfig() {
    // Clear all keys
    for (const key of Object.keys(mockConfig)) {
        delete mockConfig[key];
    }
    // Re-populate with test defaults
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
        // NON_TUNABLE keys (should be skipped)
        database: { path: 'data/test.db' },
        api: { openai: undefined, anthropic: undefined },
        services: {},
        server: { port: 3000 },
        resonance: null, // alias
    });
}

jest.unstable_mockModule('../../config/defaults.js', () => ({
    config: mockConfig,
    DEFAULT_TEMPERATURES: { voice: 0.7, chat: 0.7 },
    DEFAULT_REPEAT_PENALTIES: { voice: 1.0, chat: 1.0 },
}));

// getSafeConfig uses require('../models.js') — mock it globally
const mockGetApiKeyStatus = jest.fn().mockReturnValue({ openai: 'set', anthropic: null });

// Use a module-level mock for models require fallback
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
// getSafeConfig
// =============================================================================

describe('getSafeConfig', () => {
    it('returns config with resonance alias pointing to engine', () => {
        const safe = getSafeConfig();
        expect(safe.resonance).toBe(mockConfig.engine);
    });

    it('spreads all config keys into the result', () => {
        const safe = getSafeConfig();
        expect(safe.engine).toBeDefined();
        expect(safe.voicing).toBeDefined();
    });

    it('includes api key status from models module', () => {
        const safe = getSafeConfig();
        // api is overwritten with status from getApiKeyStatus
        expect(safe.api).toBeDefined();
    });
});

// =============================================================================
// loadSavedConfig — no saved overrides
// =============================================================================

describe('loadSavedConfig — no saved overrides', () => {
    it('returns without modifying config when no row exists', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const originalThreshold = mockConfig.engine.threshold;
        await loadSavedConfig();
        expect(mockConfig.engine.threshold).toBe(originalThreshold);
    });

    it('queries settings table for config_overrides', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        await loadSavedConfig();
        expect(mockSystemQueryOne).toHaveBeenCalledWith(
            'SELECT value FROM settings WHERE key = $1',
            ['config_overrides']
        );
    });
});

// =============================================================================
// loadSavedConfig — applies overrides
// =============================================================================

describe('loadSavedConfig — applies overrides', () => {
    it('applies saved dotted-path overrides to config', async () => {
        const overrides = {
            'engine.threshold': 0.42,
            'voicing.maxOutputWords': 50,
        };
        // First call returns the overrides row, subsequent calls for migration check
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' }); // migration v1 already done

        await loadSavedConfig();

        expect(mockConfig.engine.threshold).toBe(0.42);
        expect(mockConfig.voicing.maxOutputWords).toBe(50);
    });

    it('handles pre-parsed object values (not just strings)', async () => {
        const overrides = { 'engine.threshold': 0.33 };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: overrides }) // already an object
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.engine.threshold).toBe(0.33);
    });

    it('skips override when path target does not exist in config', async () => {
        const overrides = {
            'nonExistentSection.someKey': 999,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();
        // Should not throw, just skip
        expect(mockConfig.nonExistentSection).toBeUndefined();
    });

    it('coerces boolean true to 1 when target type is number', async () => {
        const overrides = {
            'hallucination.enabled': true, // target is number (1)
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.hallucination.enabled).toBe(1);
    });

    it('coerces boolean false to 0 when target type is number', async () => {
        const overrides = {
            'hallucination.enabled': false,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.hallucination.enabled).toBe(0);
    });

    it('does not overwrite array with non-array value', async () => {
        // Set up an array in config
        (mockConfig as any).testSection = { items: [1, 2, 3] };
        const overrides = {
            'testSection.items': 'not-an-array',
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        // Array should be preserved, non-array skipped
        expect(mockConfig.testSection.items).toEqual([1, 2, 3]);
    });

    it('allows dynamic keys in subsystem param maps', async () => {
        const overrides = {
            'subsystemTopP.voice': 0.9,
            'subsystemMinP.chat': 0.05,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.subsystemTopP.voice).toBe(0.9);
        expect(mockConfig.subsystemMinP.chat).toBe(0.05);
    });
});

// =============================================================================
// loadSavedConfig — path migrations
// =============================================================================

describe('loadSavedConfig — path migrations', () => {
    it('migrates resonance.threshold to engine.threshold', async () => {
        const overrides = {
            'resonance.threshold': 0.77,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        expect(mockConfig.engine.threshold).toBe(0.77);
    });

    it('does not overwrite new path if it already exists', async () => {
        const overrides = {
            'resonance.threshold': 0.77,
            'engine.threshold': 0.42, // new path already set
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        // The new path wins — migration skipped when new path exists
        expect(mockConfig.engine.threshold).toBe(0.42);
    });

    it('re-persists config after migration', async () => {
        const overrides = {
            'resonance.temperatureBoost': 0.2,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' });

        await loadSavedConfig();

        // persistConfigOverrides should have been called (via systemQuery INSERT)
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['config_overrides', expect.any(String)])
        );
    });
});

// =============================================================================
// loadSavedConfig — v1 migration (stale interval cleanup)
// =============================================================================

describe('loadSavedConfig — v1 interval migration', () => {
    it('clears stale interval overrides when migration not yet done', async () => {
        const overrides = {
            'autonomousCycles.validation.intervalMs': 999,
            'engine.cycleDelayMs': 111,
            'engine.threshold': 0.42,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce(null); // migration not done yet

        await loadSavedConfig();

        // The stale interval overrides should be removed; threshold should apply
        expect(mockConfig.engine.threshold).toBe(0.42);
        // Migration marker should be written
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['_migration_v1_intervals', 'done'])
        );
    });

    it('skips v1 migration when already done', async () => {
        const overrides = {
            'engine.threshold': 0.42,
        };
        mockSystemQueryOne
            .mockResolvedValueOnce({ value: JSON.stringify(overrides) })
            .mockResolvedValueOnce({ value: 'done' }); // migration already done

        await loadSavedConfig();

        // Should NOT write migration marker again
        const migrationCalls = mockSystemQuery.mock.calls.filter(
            (call: any) => call[1] && call[1][0] === '_migration_v1_intervals'
        );
        expect(migrationCalls.length).toBe(0);
    });
});

// =============================================================================
// loadSavedConfig — error handling
// =============================================================================

describe('loadSavedConfig — error handling', () => {
    it('does not throw on DB error (non-critical)', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB connection failed'));
        await expect(loadSavedConfig()).resolves.toBeUndefined();
    });

    it('does not throw on corrupt JSON in settings', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({ value: '{invalid json' });
        await expect(loadSavedConfig()).resolves.toBeUndefined();
    });
});

// =============================================================================
// updateConfig
// =============================================================================

describe('updateConfig', () => {
    it('merges engine updates via deepMerge', async () => {
        const warnings = await updateConfig({ engine: { threshold: 0.85 } } as any);
        expect(mockConfig.engine.threshold).toBe(0.85);
        // Other engine keys preserved
        expect(mockConfig.engine.salienceBoost).toBe(0.1);
        expect(Array.isArray(warnings)).toBe(true);
    });

    it('skips NON_TUNABLE keys', async () => {
        const originalDbPath = mockConfig.database.path;
        await updateConfig({ database: { path: 'hacked.db' } } as any);
        expect(mockConfig.database.path).toBe(originalDbPath);
    });

    it('skips null and undefined values', async () => {
        const originalThreshold = mockConfig.engine.threshold;
        await updateConfig({ engine: null } as any);
        expect(mockConfig.engine.threshold).toBe(originalThreshold);
    });

    it('skips keys not present in config', async () => {
        await updateConfig({ totallyNewSection: { x: 1 } } as any);
        expect((mockConfig as any).totallyNewSection).toBeUndefined();
    });

    it('handles resonance alias by merging into engine', async () => {
        await updateConfig({ resonance: { threshold: 0.88 } } as any);
        expect(mockConfig.engine.threshold).toBe(0.88);
    });

    it('persists config overrides to DB after update', async () => {
        await updateConfig({ engine: { threshold: 0.5 } } as any);
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['config_overrides'])
        );
    });

    it('returns config warnings from cross-validation', async () => {
        // Set up a violation: maxOutputWords < maxInsightWords
        mockConfig.voicing.maxOutputWords = 10;
        mockConfig.voicing.maxInsightWords = 20;
        const warnings = await updateConfig({ voicing: { maxOutputWords: 10 } } as any);
        // Should auto-correct and return a warning
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings[0].param).toBeDefined();
        expect(warnings[0].reason).toBeDefined();
    });
});

// =============================================================================
// resetSubsystemParams
// =============================================================================

describe('resetSubsystemParams', () => {
    it('resets temperature to default for known subsystem', async () => {
        mockConfig.subsystemTemperatures.voice = 0.99;
        await resetSubsystemParams('voice');
        expect(mockConfig.subsystemTemperatures.voice).toBe(0.7);
    });

    it('resets temperature to 0.7 for unknown subsystem', async () => {
        mockConfig.subsystemTemperatures.unknown_sub = 0.99;
        await resetSubsystemParams('unknown_sub');
        expect(mockConfig.subsystemTemperatures.unknown_sub).toBe(0.7);
    });

    it('resets repeat penalty to default', async () => {
        mockConfig.subsystemRepeatPenalties.voice = 1.5;
        await resetSubsystemParams('voice');
        expect(mockConfig.subsystemRepeatPenalties.voice).toBe(1.0);
    });

    it('deletes topP, minP, topK entries', async () => {
        mockConfig.subsystemTopP.voice = 0.9;
        mockConfig.subsystemMinP.voice = 0.05;
        mockConfig.subsystemTopK.voice = 40;
        await resetSubsystemParams('voice');
        expect(mockConfig.subsystemTopP.voice).toBeUndefined();
        expect(mockConfig.subsystemMinP.voice).toBeUndefined();
        expect(mockConfig.subsystemTopK.voice).toBeUndefined();
    });

    it('resets consultant temperatures to 0.15', async () => {
        mockConfig.consultantTemperatures.voice = 0.99;
        await resetSubsystemParams('voice');
        expect(mockConfig.consultantTemperatures.voice).toBe(0.15);
    });

    it('deletes consultant topP, minP, topK, repeatPenalties', async () => {
        mockConfig.consultantRepeatPenalties.voice = 1.3;
        mockConfig.consultantTopP.voice = 0.8;
        mockConfig.consultantMinP.voice = 0.1;
        mockConfig.consultantTopK.voice = 50;
        await resetSubsystemParams('voice');
        expect(mockConfig.consultantRepeatPenalties.voice).toBeUndefined();
        expect(mockConfig.consultantTopP.voice).toBeUndefined();
        expect(mockConfig.consultantMinP.voice).toBeUndefined();
        expect(mockConfig.consultantTopK.voice).toBeUndefined();
    });

    it('persists to DB after reset', async () => {
        await resetSubsystemParams('voice');
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining(['config_overrides'])
        );
    });
});

// =============================================================================
// Cross-parameter validation (via updateConfig triggering validateConfigRelationships)
// =============================================================================

describe('cross-parameter validation', () => {
    it('auto-corrects maxVerboseWords when less than maxOutputWords', async () => {
        mockConfig.hallucination.maxVerboseWords = 10;
        mockConfig.voicing.maxOutputWords = 30;
        // Trigger validation via updateConfig
        await updateConfig({} as any);
        // maxVerboseWords should be clamped up to maxOutputWords (gte, clampTarget=a)
        expect(mockConfig.hallucination.maxVerboseWords).toBeGreaterThanOrEqual(
            mockConfig.voicing.maxOutputWords
        );
    });

    it('auto-corrects salienceFloor when greater than salienceCeiling', async () => {
        mockConfig.engine.salienceCeiling = 0.5;
        mockConfig.engine.salienceFloor = 0.8;
        await updateConfig({} as any);
        // salienceFloor should be clamped down to salienceCeiling (clampTarget=b)
        expect(mockConfig.engine.salienceFloor).toBeLessThanOrEqual(
            mockConfig.engine.salienceCeiling
        );
    });

    it('auto-corrects minNovelWords when >= maxOutputWords (gt relation)', async () => {
        mockConfig.voicing.maxOutputWords = 10;
        mockConfig.voicing.minNovelWords = 10; // equal violates gt
        await updateConfig({} as any);
        // minNovelWords should be clamped to maxOutputWords - 1
        expect(mockConfig.voicing.minNovelWords).toBeLessThan(
            mockConfig.voicing.maxOutputWords
        );
    });

    it('emits activity events for auto-corrections', async () => {
        mockConfig.hallucination.maxVerboseWords = 5;
        mockConfig.voicing.maxOutputWords = 30;
        await updateConfig({} as any);
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config',
            'cross_validation',
            expect.stringContaining('Auto-corrected'),
            expect.objectContaining({ param: expect.any(String) })
        );
    });

    it('returns empty warnings when all constraints satisfied', async () => {
        // Defaults are valid, so no warnings
        const warnings = await updateConfig({} as any);
        expect(warnings).toEqual([]);
    });
});
