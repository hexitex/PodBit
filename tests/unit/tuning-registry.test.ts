/**
 * Unit tests for models/tuning-registry.ts —
 * saveToRegistry, restoreFromRegistry, deleteRegistryEntry, incrementTuningChanges.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLoadSavedConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('reg-uuid-1234');
const mockGetApiBaseUrl = jest.fn<() => string>().mockReturnValue('http://localhost:3000');
const mockSecuredFetch = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
const mockBuildParamLookup = jest.fn<() => Record<string, any>>();
const mockGetNestedValue = jest.fn<(obj: any, path: string[]) => any>().mockReturnValue(undefined);
const mockSetNestedValue = jest.fn<() => void>();

// Minimal config object for getNestedValue to read from
const mockConfig = {
    subsystemTemp: { voice: 0.7, synthesis: 0.8 },
    subsystemTopP: { voice: 0.9 },
};

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
    systemQueryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    loadSavedConfig: mockLoadSavedConfig,
    updateConfig: mockUpdateConfig,
    config: mockConfig,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../handlers/config-tune/helpers.js', () => ({
    buildParamLookup: mockBuildParamLookup,
    getNestedValue: mockGetNestedValue,
    setNestedValue: mockSetNestedValue,
    getApiBaseUrl: mockGetApiBaseUrl,
    securedFetch: mockSecuredFetch,
    generateUuid: mockGenerateUuid,
}));

const { saveToRegistry, restoreFromRegistry, deleteRegistryEntry, incrementTuningChanges } =
    await import('../../models/tuning-registry.js');

/** Minimal param lookup with one subsystem param */
function makeParamLookup() {
    return {
        'subsystemTemp.voice': {
            configPath: ['subsystemTemp', 'voice'],
            label: 'Voice Temperature',
            sectionId: 'subsystem_inference',
        },
        'subsystemTopP.voice': {
            configPath: ['subsystemTopP', 'voice'],
            label: 'Voice Top-P',
            sectionId: 'subsystem_inference',
        },
        // Non-subsystem param — should be excluded
        'engine.threshold': {
            configPath: ['engine', 'threshold'],
            label: 'Threshold',
            sectionId: 'engine',
        },
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLoadSavedConfig.mockResolvedValue(undefined);
    mockUpdateConfig.mockResolvedValue(undefined);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGenerateUuid.mockReturnValue('reg-uuid-1234');
    mockGetApiBaseUrl.mockReturnValue('http://localhost:3000');
    mockSecuredFetch.mockResolvedValue({ ok: true });
    mockBuildParamLookup.mockReturnValue(makeParamLookup());
    mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
        let val = obj;
        for (const p of path) val = val?.[p];
        return val;
    });
    mockSetNestedValue.mockReturnValue(undefined as any);
});

// =============================================================================
// saveToRegistry
// =============================================================================

describe('saveToRegistry', () => {
    it('creates new registry entry when model not in registry', async () => {
        mockQueryOne.mockResolvedValue(null); // no existing entry

        const result = await saveToRegistry('model-1', 'GPT-4', 'openai', ['voice']);

        expect(result.saved).toBe(true);
        expect(result.registryId).toBe('reg-uuid-1234');
        expect(result.parameterCount).toBeGreaterThanOrEqual(0);

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO tuning_registry')
        );
        expect(insertCall).toBeDefined();
        expect(insertCall[1][0]).toBe('reg-uuid-1234'); // uses generated uuid
        expect(insertCall[1][1]).toBe('model-1');
    });

    it('reuses existing id when model already in registry', async () => {
        mockQueryOne.mockResolvedValue({ id: 'existing-reg-id', tuning_changes: 3 });

        const result = await saveToRegistry('model-1', 'GPT-4', 'openai', ['voice']);

        expect(result.saved).toBe(true);
        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO tuning_registry')
        );
        expect(insertCall[1][0]).toBe('existing-reg-id');
    });

    it('only saves subsystemTemp/TopP/TopK/MinP params (filters non-subsystem params)', async () => {
        mockQueryOne.mockResolvedValue(null);

        const _result = await saveToRegistry('model-1', 'GPT-4', 'openai', ['voice']);

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]: any[]) =>
            String(sql).includes('INSERT INTO tuning_registry')
        );
        const savedParams = JSON.parse(insertCall[1][4]); // parameters field
        // Should include subsystem params but NOT engine.threshold
        expect('engine.threshold' in savedParams).toBe(false);
    });

    it('returns saved=false when table does not exist', async () => {
        const err = new Error('no such table: tuning_registry');
        mockQueryOne.mockRejectedValue(err);

        const result = await saveToRegistry('model-1', 'GPT-4', 'openai', ['voice']);

        expect(result.saved).toBe(false);
        expect(result.parameterCount).toBe(0);
    });

    it('emits activity after saving', async () => {
        mockQueryOne.mockResolvedValue(null);
        await saveToRegistry('model-2', 'Claude', 'anthropic', ['synthesis']);

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'tuning_registry_save', expect.stringContaining('Claude'),
        );
    });
});

// =============================================================================
// restoreFromRegistry
// =============================================================================

describe('restoreFromRegistry', () => {
    it('returns null when no entry for model', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await restoreFromRegistry('unknown-model');
        expect(result).toBeNull();
    });

    it('returns restored=false when saved params match current values', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-1',
            model_name: 'GPT-4',
            parameters: JSON.stringify({ 'subsystemTemp.voice': 0.7 }),
            subsystems: JSON.stringify(['voice']),
        });
        // getNestedValue returns 0.7 = same as saved → no change
        mockGetNestedValue.mockReturnValue(0.7);

        const result = await restoreFromRegistry('model-1');

        expect(result).not.toBeNull();
        expect(result!.restored).toBe(false);
        expect(result!.changesApplied).toBe(0);
        expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('applies config changes when saved params differ from current', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-2',
            model_name: 'GPT-4',
            parameters: JSON.stringify({ 'subsystemTemp.voice': 0.5 }),
            subsystems: JSON.stringify(['voice']),
        });
        // Current value is 0.7 — different from saved 0.5
        mockGetNestedValue.mockReturnValue(0.7);

        const result = await restoreFromRegistry('model-1');

        expect(result!.restored).toBe(true);
        expect(result!.changesApplied).toBe(1);
        expect(mockLoadSavedConfig).toHaveBeenCalledTimes(1);
        expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    });

    it('filters params by subsystem when subsystem is specified', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-3',
            model_name: 'GPT-4',
            parameters: JSON.stringify({
                'subsystemTemp.voice': 0.5,      // voice subsystem
                'subsystemTemp.synthesis': 0.3,  // synthesis subsystem — should be skipped
            }),
            subsystems: JSON.stringify(['voice', 'synthesis']),
        });
        mockGetNestedValue.mockReturnValue(0.7); // different from saved

        // Only restore for 'voice' subsystem
        const result = await restoreFromRegistry('model-1', 'voice');

        expect(result!.changesApplied).toBe(1); // only voice param applied
    });

    it('emits activity after restoring', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-4',
            model_name: 'MyModel',
            parameters: JSON.stringify({}),
            subsystems: JSON.stringify([]),
        });

        await restoreFromRegistry('model-1');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'config', 'tuning_registry_restore', expect.stringContaining('MyModel'),
        );
    });
});

// =============================================================================
// deleteRegistryEntry / incrementTuningChanges
// =============================================================================

describe('deleteRegistryEntry', () => {
    it('deletes by registry id and returns true', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await deleteRegistryEntry('reg-to-delete');

        expect(result).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('DELETE FROM tuning_registry');
        expect(params[0]).toBe('reg-to-delete');
    });
});

describe('incrementTuningChanges', () => {
    it('increments tuning_changes for the model', async () => {
        mockQuery.mockResolvedValue([]);

        await incrementTuningChanges('model-123');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(sql).toContain('tuning_changes = tuning_changes + 1');
        expect(params[0]).toBe('model-123');
    });
});
