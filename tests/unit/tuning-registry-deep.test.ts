/**
 * Deep coverage tests for models/tuning-registry.ts —
 * Targets uncovered lines: 59 (re-throw non-table error), 150-153 (API sync failure),
 * 175 (audit trail write failure).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLoadSavedConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockEmitActivity = jest.fn<() => void>();
const mockGenerateUuid = jest.fn<() => string>().mockReturnValue('reg-uuid-deep');
const mockGetApiBaseUrl = jest.fn<() => string>().mockReturnValue('http://localhost:3000');
const mockSecuredFetch = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });
const mockBuildParamLookup = jest.fn<() => Record<string, any>>();
const mockGetNestedValue = jest.fn<(obj: any, path: string[]) => any>().mockReturnValue(undefined);
const mockSetNestedValue = jest.fn<() => void>();

const mockConfig = {
    subsystemTemp: { voice: 0.7 },
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

const { saveToRegistry, restoreFromRegistry } =
    await import('../../models/tuning-registry.js');

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
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockLoadSavedConfig.mockResolvedValue(undefined);
    mockUpdateConfig.mockResolvedValue(undefined);
    mockEmitActivity.mockReturnValue(undefined as any);
    mockGenerateUuid.mockReturnValue('reg-uuid-deep');
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
// Line 59: re-throw non-"no such table" errors from queryOne
// =============================================================================

describe('saveToRegistry — re-throws non-table errors (line 59)', () => {
    it('re-throws errors that are not "no such table"', async () => {
        const dbError = new Error('SQLITE_BUSY: database is locked');
        mockQueryOne.mockRejectedValue(dbError);

        await expect(saveToRegistry('model-1', 'GPT-4', 'openai', ['voice']))
            .rejects.toThrow('SQLITE_BUSY: database is locked');
    });
});

// =============================================================================
// Lines 150-153: API server sync failure (non-ok response) during restore
// =============================================================================

describe('restoreFromRegistry — API sync failure (lines 150-153)', () => {
    it('logs warning when API server returns non-ok response', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-api-fail',
            model_name: 'GPT-4',
            parameters: JSON.stringify({ 'subsystemTemp.voice': 0.3 }),
            subsystems: JSON.stringify(['voice']),
        });
        // Current value differs from saved to trigger restore
        mockGetNestedValue.mockReturnValue(0.7);
        // API returns non-ok
        mockSecuredFetch.mockResolvedValue({ ok: false });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await restoreFromRegistry('model-1');

        expect(result).not.toBeNull();
        expect(result!.restored).toBe(true);
        expect(result!.changesApplied).toBe(1);

        // Verify warning was logged about API sync failure
        const syncWarning = warnSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('API server sync failed')
        );
        expect(syncWarning).toBeDefined();

        warnSpy.mockRestore();
    });

    it('logs warning when API server is unreachable (fetch throws)', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-api-throw',
            model_name: 'Claude',
            parameters: JSON.stringify({ 'subsystemTemp.voice': 0.2 }),
            subsystems: JSON.stringify(['voice']),
        });
        mockGetNestedValue.mockReturnValue(0.7);
        // securedFetch throws (network error)
        mockSecuredFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await restoreFromRegistry('model-1');

        expect(result!.restored).toBe(true);

        const unreachableWarning = warnSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('API server unreachable')
        );
        expect(unreachableWarning).toBeDefined();

        warnSpy.mockRestore();
    });
});

// =============================================================================
// Line 175: audit trail write failure
// =============================================================================

describe('restoreFromRegistry — audit trail write failure (line 175)', () => {
    it('logs error when config_history insert fails but does not throw', async () => {
        mockQueryOne.mockResolvedValue({
            id: 'reg-audit-fail',
            model_name: 'GPT-4',
            parameters: JSON.stringify({ 'subsystemTemp.voice': 0.4 }),
            subsystems: JSON.stringify(['voice']),
        });
        mockGetNestedValue.mockReturnValue(0.7);
        mockSecuredFetch.mockResolvedValue({ ok: true });

        // First query call is the config_history INSERT — make it fail
        let insertCallCount = 0;
        mockQuery.mockImplementation(async (sql: any) => {
            if (typeof sql === 'string' && sql.includes('INSERT INTO config_history')) {
                insertCallCount++;
                throw new Error('SQLITE_CONSTRAINT: NOT NULL violation');
            }
            return [];
        });

        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const result = await restoreFromRegistry('model-1');

        // Should still succeed despite audit trail failure
        expect(result).not.toBeNull();
        expect(result!.restored).toBe(true);

        // Verify error was logged about audit trail failure
        const auditError = errorSpy.mock.calls.find(
            (call: any[]) => typeof call[0] === 'string' && call[0].includes('Audit trail write failed')
        );
        expect(auditError).toBeDefined();
        expect(insertCallCount).toBeGreaterThan(0);

        errorSpy.mockRestore();
    });
});
