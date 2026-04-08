/**
 * Deep-branch unit tests for handlers/config-tune/handler.ts
 *
 * Covers branches and statements not reached by config-tune-handler.test.ts:
 * - getCurrentProjectName catch fallback
 * - autoSaveSnapshot error path
 * - sections with sectionId when API fetch fails
 * - apply: audit trail write failure, subsystem registry path,
 *   insignificant change filtering, all-rejected (no persist)
 * - snapshot save: API non-ok
 * - snapshot restore: API sync failures, audit trail catch,
 *   zero restored params (no seed)
 * - metrics: overfitting hash persist failure, null contextStats fields
 * - history: combined sectionId + configPath filters
 * - reflect: custom contributor in instructions
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockSystemQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

const mockConfig: Record<string, any> = {
    server: { host: 'localhost', port: 3000 },
    resonance: { threshold: 0.5 },
    voicing: { maxOutputWords: 30 },
    subsystemTemp: { voice: 0.7 },
};
const mockUpdateConfig = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockLoadSavedConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../config.js', () => ({
    config: mockConfig,
    updateConfig: mockUpdateConfig,
    loadSavedConfig: mockLoadSavedConfig,
}));

const mockSectionMetadata: Record<string, any> = {
    'resonance-threshold': {
        id: 'resonance-threshold',
        tier: 1,
        title: 'Resonance Threshold',
        description: 'Controls the minimum resonance score',
        behavior: 'Higher values = stricter filtering',
        parameters: [
            {
                key: 'resonanceThreshold',
                label: 'Resonance Threshold',
                description: 'Minimum resonance score for synthesis',
                configPath: ['resonance', 'threshold'],
                default: 0.35,
                min: 0.1,
                max: 0.9,
                step: 0.05,
            },
        ],
        presets: [{ name: 'default', values: { resonanceThreshold: 0.35 } }],
    },
    'output-limits': {
        id: 'output-limits',
        tier: 2,
        title: 'Output Limits',
        description: 'Controls output sizing',
        behavior: 'Sets word limits',
        parameters: [
            {
                key: 'maxOutputWords',
                label: 'Max Output Words',
                description: 'Maximum words in output',
                configPath: ['voicing', 'maxOutputWords'],
                default: 30,
                min: 10,
                max: 200,
                step: 5,
            },
        ],
        presets: [],
    },
    'subsystem-temps': {
        id: 'subsystem-temps',
        tier: 2,
        title: 'Subsystem Temperatures',
        description: 'Per-subsystem temperature overrides',
        behavior: 'Controls inference temperature',
        parameters: [
            {
                key: 'subsystemTemp.voice',
                label: 'Voice Temperature',
                description: 'Temperature for voice subsystem',
                configPath: ['subsystemTemp', 'voice'],
                default: 0.7,
                min: 0.0,
                max: 2.0,
                step: 0.1,
            },
        ],
        presets: [],
    },
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: mockSectionMetadata,
}));

// --- helpers mock ---
const mockGetApiBaseUrl = jest.fn().mockReturnValue('http://localhost:3000');
const mockSecuredFetch = jest.fn<(...args: any[]) => Promise<any>>();
const mockGenerateUuid = jest.fn().mockReturnValue('deep-uuid-001');
const mockBuildParamLookup = jest.fn().mockReturnValue({
    'resonance.threshold': {
        key: 'resonanceThreshold',
        label: 'Resonance Threshold',
        description: 'Minimum resonance score',
        configPath: ['resonance', 'threshold'],
        default: 0.35,
        min: 0.1,
        max: 0.9,
        step: 0.05,
        sectionId: 'resonance-threshold',
    },
    'voicing.maxOutputWords': {
        key: 'maxOutputWords',
        label: 'Max Output Words',
        description: 'Maximum words in output',
        configPath: ['voicing', 'maxOutputWords'],
        default: 30,
        min: 10,
        max: 200,
        step: 5,
        sectionId: 'output-limits',
    },
    'subsystemTemp.voice': {
        key: 'subsystemTemp.voice',
        label: 'Voice Temperature',
        description: 'Temperature for voice subsystem',
        configPath: ['subsystemTemp', 'voice'],
        default: 0.7,
        min: 0.0,
        max: 2.0,
        step: 0.1,
        sectionId: 'subsystem-temps',
    },
});
const mockGetNestedValue = jest.fn((obj: any, path: string[]) => {
    let current = obj;
    for (const key of path) {
        if (current == null) return undefined;
        current = current[key];
    }
    return current;
});
const mockSetNestedValue = jest.fn();
const mockGetQuickMetrics = jest.fn<() => Promise<any>>().mockResolvedValue({
    synthesisSuccessRate: 0.15,
    avgResonance: 0.50,
    totalNodes: 120,
    avgSpecificity: 3.8,
    capturedAt: '2026-03-01T00:00:00Z',
});

jest.unstable_mockModule('../../handlers/config-tune/helpers.js', () => ({
    getApiBaseUrl: mockGetApiBaseUrl,
    securedFetch: mockSecuredFetch,
    generateUuid: mockGenerateUuid,
    buildParamLookup: mockBuildParamLookup,
    getNestedValue: mockGetNestedValue,
    setNestedValue: mockSetNestedValue,
    getQuickMetrics: mockGetQuickMetrics,
}));

// --- know-thyself mock ---
const mockSeedTuningKnowledge = jest.fn<() => Promise<string | null>>().mockResolvedValue(null);
const mockFormatConfigChangeSeed = jest.fn().mockReturnValue('change seed');
const mockFormatOverfittingSeed = jest.fn().mockReturnValue('overfitting seed');
const mockFormatSnapshotSeed = jest.fn().mockReturnValue('snapshot seed');
const mockComputeOverfittingHash = jest.fn().mockReturnValue('hash-deep');

jest.unstable_mockModule('../../handlers/config-tune/know-thyself.js', () => ({
    seedTuningKnowledge: mockSeedTuningKnowledge,
    formatConfigChangeSeed: mockFormatConfigChangeSeed,
    formatOverfittingSeed: mockFormatOverfittingSeed,
    formatSnapshotSeed: mockFormatSnapshotSeed,
    computeOverfittingHash: mockComputeOverfittingHash,
}));

// --- analysis mock ---
const mockDetectOverfitting = jest.fn<() => Promise<any>>().mockResolvedValue({
    qualityPlateau: false,
    diversityCollapse: false,
    metricOscillation: false,
    convergingParameters: [],
    recentSuccessRate: 0.15,
    recommendation: 'No issues',
});

jest.unstable_mockModule('../../handlers/config-tune/analysis.js', () => ({
    detectOverfitting: mockDetectOverfitting,
}));

// --- types mock (state) ---
const mockState = {
    knowThyselfInitialized: false,
    lastOverfittingHash: null as string | null,
    pendingMetricsFollow: null as { seedId: string; timestamp: number } | null,
};

jest.unstable_mockModule('../../handlers/config-tune/types.js', () => ({
    state: mockState,
}));

// --- projects/meta mock ---
const mockReadProjectsMeta = jest.fn().mockReturnValue({ currentProject: 'deep-project' });

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
}));

// --- security mock ---
const mockIsSensitiveConfigPath = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

jest.unstable_mockModule('../../core/security.js', () => ({
    isSensitiveConfigPath: mockIsSensitiveConfigPath,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    verifyAdminPassword: mockVerifyAdminPassword,
}));

// --- db/sql mock ---
jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: (col: string, param: string) => `${col} >= ${param}`,
}));

// --- models mock (dynamic import in apply) ---
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});
const mockSaveToRegistry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockIncrementTuningChanges = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: mockSaveToRegistry,
    incrementTuningChanges: mockIncrementTuningChanges,
}));

// =============================================================================
// Import under test
// =============================================================================

const { handleConfig } = await import('../../handlers/config-tune/handler.js');

// =============================================================================
// Helpers
// =============================================================================

function makeFetchResponse(body: any, ok = true, status = 200) {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
    jest.clearAllMocks();

    mockGetApiBaseUrl.mockReturnValue('http://localhost:3000');
    mockGenerateUuid.mockReturnValue('deep-uuid-001');
    mockBuildParamLookup.mockReturnValue({
        'resonance.threshold': {
            key: 'resonanceThreshold',
            label: 'Resonance Threshold',
            description: 'Minimum resonance score',
            configPath: ['resonance', 'threshold'],
            default: 0.35,
            min: 0.1,
            max: 0.9,
            step: 0.05,
            sectionId: 'resonance-threshold',
        },
        'voicing.maxOutputWords': {
            key: 'maxOutputWords',
            label: 'Max Output Words',
            description: 'Maximum words in output',
            configPath: ['voicing', 'maxOutputWords'],
            default: 30,
            min: 10,
            max: 200,
            step: 5,
            sectionId: 'output-limits',
        },
        'subsystemTemp.voice': {
            key: 'subsystemTemp.voice',
            label: 'Voice Temperature',
            description: 'Temperature for voice subsystem',
            configPath: ['subsystemTemp', 'voice'],
            default: 0.7,
            min: 0.0,
            max: 2.0,
            step: 0.1,
            sectionId: 'subsystem-temps',
        },
    });
    mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
        let current = obj;
        for (const key of path) {
            if (current == null) return undefined;
            current = current[key];
        }
        return current;
    });
    mockGetQuickMetrics.mockResolvedValue({
        synthesisSuccessRate: 0.15,
        avgResonance: 0.50,
        totalNodes: 120,
        avgSpecificity: 3.8,
        capturedAt: '2026-03-01T00:00:00Z',
    });
    mockDetectOverfitting.mockResolvedValue({
        qualityPlateau: false,
        diversityCollapse: false,
        metricOscillation: false,
        convergingParameters: [],
        recentSuccessRate: 0.15,
        recommendation: 'No issues',
    });
    mockSeedTuningKnowledge.mockResolvedValue(null);
    mockReadProjectsMeta.mockReturnValue({ currentProject: 'deep-project' });
    mockIsSensitiveConfigPath.mockReturnValue(false);
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(false);
    mockUpdateConfig.mockResolvedValue([]);
    mockLoadSavedConfig.mockResolvedValue(undefined);
    mockComputeOverfittingHash.mockReturnValue('hash-deep');
    mockFormatConfigChangeSeed.mockReturnValue('change seed');
    mockFormatOverfittingSeed.mockReturnValue('overfitting seed');
    mockFormatSnapshotSeed.mockReturnValue('snapshot seed');
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockSaveToRegistry.mockResolvedValue(undefined);
    mockIncrementTuningChanges.mockResolvedValue(undefined);

    mockState.knowThyselfInitialized = false;
    mockState.lastOverfittingHash = null;
    mockState.pendingMetricsFollow = null;
});

// =============================================================================
// getCurrentProjectName — catch fallback
// =============================================================================

describe('getCurrentProjectName fallback', () => {
    it('falls back to "default" when readProjectsMeta throws', async () => {
        mockReadProjectsMeta.mockImplementation(() => { throw new Error('file not found'); });
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({ resonance: { threshold: 0.5 } }));

        // The project name surfaces in snapshot save (project_name param)
        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'save',
            snapshotLabel: 'fallback-test',
        });

        expect(result.success).toBe(true);
        // The prune query uses projectName — verify it was called with 'default'
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM config_snapshots'),
            ['default'],
        );
    });

    it('falls back to "default" when currentProject is empty string', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: '' });
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({ resonance: { threshold: 0.5 } }));

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'save',
            snapshotLabel: 'empty-test',
        });

        expect(result.success).toBe(true);
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM config_snapshots'),
            ['default'],
        );
    });
});

// =============================================================================
// sections — sectionId when API fetch fails (currentConfig = null)
// =============================================================================

describe('handleConfig — sections edge cases', () => {
    it('returns section with null currentValue when API fails and sectionId given', async () => {
        mockSecuredFetch.mockRejectedValue(new Error('API down'));

        const result = await handleConfig({ action: 'sections', sectionId: 'resonance-threshold' });

        expect(result.section).toBeDefined();
        expect(result.section.parameters[0].currentValue).toBeNull();
    });

    it('returns section with null currentValue when API returns non-ok and sectionId given', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}, false, 500));

        const result = await handleConfig({ action: 'sections', sectionId: 'resonance-threshold' });

        expect(result.section).toBeDefined();
        expect(result.section.parameters[0].currentValue).toBeNull();
    });
});

// =============================================================================
// apply — deep branches
// =============================================================================

describe('handleConfig — apply deep branches', () => {
    beforeEach(() => {
        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            if (opts?.method === 'PUT') return makeFetchResponse({ success: true });
            return makeFetchResponse({ resonance: { threshold: 0.5 }, voicing: { maxOutputWords: 30 }, subsystemTemp: { voice: 0.7 } });
        });
    });

    it('does not persist or write audit trail when all changes are rejected', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [
                { configPath: ['unknown', 'param'], value: 99 },
            ],
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(0);
        expect(result.rejectedCount).toBe(1);
        expect(mockLoadSavedConfig).not.toHaveBeenCalled();
        expect(mockUpdateConfig).not.toHaveBeenCalled();
        // No audit trail INSERT
        expect(mockSystemQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.anything(),
        );
    });

    it('survives audit trail write failure (non-fatal)', async () => {
        // Make systemQuery reject for the audit INSERT but succeed for autoSaveSnapshot
        let auditCallCount = 0;
        mockSystemQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('INSERT INTO config_history')) {
                auditCallCount++;
                throw new Error('disk full');
            }
            return [];
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            reason: 'test',
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
        expect(auditCallCount).toBe(1);
    });

    it('triggers tuning registry save when subsystem temp param changes', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'model-1', name: 'TestModel', provider: 'openai' },
            synthesis: { id: 'model-1', name: 'TestModel', provider: 'openai' },
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['subsystemTemp', 'voice'], value: 0.8 }],
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
        expect(mockSaveToRegistry).toHaveBeenCalledWith(
            'model-1', 'TestModel', 'openai', expect.arrayContaining(['voice', 'synthesis']),
        );
        expect(mockIncrementTuningChanges).toHaveBeenCalledWith('model-1');
    });

    it('handles tuning registry error gracefully (non-fatal)', async () => {
        mockGetSubsystemAssignments.mockRejectedValue(new Error('registry crash'));

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['subsystemTemp', 'voice'], value: 0.8 }],
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
    });

    it('skips tuning registry when no subsystem params changed', async () => {
        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(mockSaveToRegistry).not.toHaveBeenCalled();
        expect(mockIncrementTuningChanges).not.toHaveBeenCalled();
    });

    it('does not seed when change magnitude is below 1% of range', async () => {
        // Resonance: range = 0.9 - 0.1 = 0.8, 1% = 0.008
        // Change from 0.5 to 0.5 (rounded to step 0.05) = 0 magnitude
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.4;
            return undefined;
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
        // The change is 0.4 -> 0.4 (same value), so magnitude is 0 — below 1%
        expect(mockFormatConfigChangeSeed).not.toHaveBeenCalled();
        expect(result.tuningSeedId).toBeUndefined();
    });

    it('uses default contributor "claude" when not provided', async () => {
        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        // Audit trail should use 'claude' contributor → changed_by = 'system'
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining(['system', 'claude']),
        );
    });

    it('skips null assignments in tuning registry loop', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({
            voice: { id: 'model-1', name: 'TestModel', provider: 'openai' },
            synthesis: null, // null assignment — should be skipped
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['subsystemTemp', 'voice'], value: 0.8 }],
        });

        expect(result.success).toBe(true);
        // Only one model should have been saved (model-1 with voice only, not synthesis)
        expect(mockSaveToRegistry).toHaveBeenCalledTimes(1);
        expect(mockSaveToRegistry).toHaveBeenCalledWith(
            'model-1', 'TestModel', 'openai', ['voice'],
        );
    });
});

// =============================================================================
// snapshot save — API non-ok
// =============================================================================

describe('handleConfig — snapshot save API non-ok', () => {
    it('returns error when API returns non-ok during save', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}, false, 503));

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'save',
            snapshotLabel: 'fail-save',
        });

        expect(result.error).toMatch(/API server not responding/);
    });
});

// =============================================================================
// snapshot restore — sync failures and edge cases
// =============================================================================

describe('handleConfig — snapshot restore deep branches', () => {
    beforeEach(() => {
        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            if (opts?.method === 'PUT') return makeFetchResponse({ success: true });
            return makeFetchResponse({ resonance: { threshold: 0.5 }, voicing: { maxOutputWords: 30 } });
        });
    });

    it('succeeds when API sync PUT returns non-ok during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r1',
            label: 'sync-fail',
            parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
        });
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.5;
            return undefined;
        });
        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            if (opts?.method === 'PUT') return makeFetchResponse({}, false, 500);
            return makeFetchResponse({ resonance: { threshold: 0.5 } });
        });

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r1',
        });

        expect(result.success).toBe(true);
        expect(result.restoredCount).toBe(1);
        expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('succeeds when API sync PUT throws during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r2',
            label: 'sync-throw',
            parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
        });
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.5;
            return undefined;
        });
        let fetchCallCount = 0;
        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            fetchCallCount++;
            if (opts?.method === 'PUT') throw new Error('network failure');
            return makeFetchResponse({ resonance: { threshold: 0.5 } });
        });

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r2',
        });

        expect(result.success).toBe(true);
        expect(result.restoredCount).toBe(1);
    });

    it('survives audit trail write failure during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r3',
            label: 'audit-fail',
            parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
        });
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.5;
            return undefined;
        });
        mockSystemQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('INSERT INTO config_history')) {
                throw new Error('audit write failed');
            }
            return [];
        });

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r3',
        });

        expect(result.success).toBe(true);
        expect(result.restoredCount).toBe(1);
    });

    it('does not seed when no parameters were actually restored', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r4',
            label: 'no-diff',
            parameters: JSON.stringify({ 'resonance.threshold': 0.5 }),
        });
        // Current value matches saved — no restore needed
        mockGetNestedValue.mockReturnValue(0.5);

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r4',
        });

        expect(result.success).toBe(true);
        expect(result.restoredCount).toBe(0);
        expect(mockSeedTuningKnowledge).not.toHaveBeenCalled();
        expect(mockUpdateConfig).not.toHaveBeenCalled();
    });

    it('skips saved params with unknown paths during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r5',
            label: 'unknown-paths',
            parameters: JSON.stringify({
                'resonance.threshold': 0.35,
                'deleted.section.param': 42,
            }),
        });
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.5;
            return undefined;
        });

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r5',
        });

        expect(result.success).toBe(true);
        // Only known param was restored
        expect(result.restoredCount).toBe(1);
        expect(result.restored[0].configPath).toEqual(['resonance', 'threshold']);
    });

    it('returns error when API fetch for current config fails during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r6',
            label: 'api-down',
            parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
        });
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}, false, 503));

        const result = await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r6',
        });

        expect(result.error).toMatch(/API server not responding/);
    });

    it('uses custom contributor for audit trail during restore', async () => {
        mockSystemQueryOne.mockResolvedValue({
            id: 'snap-r7',
            label: 'human-restore',
            parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
        });
        mockGetNestedValue.mockImplementation((_obj: any, path: string[]) => {
            if (path.join('.') === 'resonance.threshold') return 0.5;
            return undefined;
        });

        await handleConfig({
            action: 'snapshot',
            snapshotAction: 'restore',
            snapshotId: 'snap-r7',
            contributor: 'human-gui',
        });

        // changed_by should be 'human' since contributor starts with 'human'
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining(['human', 'human-gui']),
        );
    });
});

// =============================================================================
// metrics — deep branches
// =============================================================================

describe('handleConfig — metrics deep branches', () => {
    beforeEach(() => {
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('dream_cycles')) {
                return { total_cycles: '10', children_created: '2', avg_resonance: '0.400' };
            }
            if (sql.includes('session_insights')) {
                return { session_count: '0', avg_topic_weight: null, total_topic_usage: '0' };
            }
            if (sql.includes('avg_weight')) {
                return { total: '50', avg_weight: '0.5', avg_salience: '0.4', avg_specificity: '3.0' };
            }
            if (sql.includes('breakthrough')) {
                return { count: '1' };
            }
            return null;
        });
        mockQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '5' });
    });

    it('handles null avg_topic_weight in contextStats', async () => {
        const result = await handleConfig({ action: 'metrics' });
        expect(result.contextEngine.avgTopicWeight).toBeNull();
        expect(result.contextEngine.sessionCount).toBe(0);
        expect(result.contextEngine.totalTopicUsage).toBe(0);
    });

    it('survives overfitting hash persist failure (non-critical)', async () => {
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: true,
            diversityCollapse: false,
            metricOscillation: false,
            convergingParameters: [],
        });
        // Make the settings INSERT fail
        mockSystemQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('INSERT INTO settings')) {
                throw new Error('settings table locked');
            }
            return [];
        });

        const result = await handleConfig({ action: 'metrics' });

        // Should still complete and seed
        expect(result.overfitting).toBeDefined();
        expect(mockSeedTuningKnowledge).toHaveBeenCalled();
        expect(mockState.lastOverfittingHash).toBe('hash-deep');
    });

    it('seeds overfitting when convergingParameters is non-empty', async () => {
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            convergingParameters: [{ path: 'resonance.threshold', values: [0.4, 0.41, 0.42] }],
        });

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).toHaveBeenCalled();
    });

    it('seeds overfitting when diversityCollapse is true', async () => {
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: false,
            diversityCollapse: true,
            metricOscillation: false,
            convergingParameters: [],
        });

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).toHaveBeenCalled();
    });

    it('seeds overfitting when metricOscillation is true', async () => {
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: true,
            convergingParameters: [],
        });

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).toHaveBeenCalled();
    });

    it('computes rejection percentage correctly', async () => {
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('dream_cycles')) {
                return { total_cycles: '100', children_created: '20', avg_resonance: '0.500' };
            }
            if (sql.includes('session_insights')) {
                return { session_count: '1', avg_topic_weight: '0.8', total_topic_usage: '5' };
            }
            if (sql.includes('avg_weight')) {
                return { total: '50', avg_weight: '0.5', avg_salience: '0.5', avg_specificity: '3.0' };
            }
            if (sql.includes('breakthrough')) {
                return { count: '0' };
            }
            return null;
        });
        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('rejection_reason')) {
                return [
                    { rejection_reason: 'low_resonance', count: '40' },
                    { rejection_reason: 'derivative', count: '40' },
                ];
            }
            return [];
        });

        const result = await handleConfig({ action: 'metrics' });

        // totalRejected = 100 - 20 = 80
        // low_resonance: 40/80 = 50.0%
        expect(result.synthesisEngine.rejectionBreakdown[0].pct).toBe(50.0);
        expect(result.synthesisEngine.rejectionBreakdown[1].pct).toBe(50.0);
    });

    it('returns null queryOne values as 0', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await handleConfig({ action: 'metrics' });

        expect(result.synthesisEngine.totalCycles).toBe(0);
        expect(result.synthesisEngine.successRate).toBe(0);
        expect(result.graphHealth.totalNodes).toBe(0);
        expect(result.graphHealth.recentBreakthroughs).toBe(0);
    });
});

// =============================================================================
// history — combined filters
// =============================================================================

describe('handleConfig — history combined filters', () => {
    it('applies both sectionId and configPath filters together', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({
            action: 'history',
            sectionId: 'resonance-threshold',
            configPath: ['resonance', 'threshold'],
            limit: 5,
        });

        // The SQL should have project_name, section_id, and config_path conditions
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringMatching(/project_name.*section_id.*config_path/s),
            expect.arrayContaining(['deep-project', 'resonance-threshold', 'resonance.threshold', 5]),
        );
    });

    it('uses custom project from params.project', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({
            action: 'history',
            project: 'custom-proj',
        });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('project_name'),
            expect.arrayContaining(['custom-proj']),
        );
    });
});

// =============================================================================
// reflect — edge cases
// =============================================================================

describe('handleConfig — reflect edge cases', () => {
    it('includes custom contributor in instructions', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'resonance.threshold',
                old_value: '"0.5"',
                new_value: '"0.4"',
                reason: 'testing',
                contributor: 'human-gui',
                created_at: '2026-03-01',
            },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect', contributor: 'human-gui' });

        expect(result.success).toBe(true);
        expect(result.instructions).toContain('human-gui');
    });

    it('includes custom days in instructions and uses it for queries', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'x',
                old_value: '"1"',
                new_value: '"2"',
                reason: null,
                contributor: 'claude',
                created_at: '2026-03-01',
            },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect', days: 30 });

        expect(result.context.periodDays).toBe(30);
        expect(result.instructions).toContain('30 days');
        expect(mockDetectOverfitting).toHaveBeenCalledWith(30);
    });

    it('builds parentIdsList from tuning nodes for instructions', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'x',
                old_value: '"1"',
                new_value: '"2"',
                reason: null,
                contributor: 'claude',
                created_at: '2026-03-01',
            },
        ]);
        mockQuery.mockResolvedValue([
            { id: 'node-aaa', content: 'insight A', node_type: 'seed', weight: 1, created_at: '2026-03-01' },
            { id: 'node-bbb', content: 'insight B', node_type: 'synthesis', weight: 1, created_at: '2026-03-01' },
        ]);

        const result = await handleConfig({ action: 'reflect' });

        expect(result.instructions).toContain('"node-aaa"');
        expect(result.instructions).toContain('"node-bbb"');
        expect(result.context.recentTuningNodes).toHaveLength(2);
    });

    it('handles null old_value in change summary', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'new.param',
                old_value: null,
                new_value: '"42"',
                reason: 'first time',
                contributor: 'claude',
                created_at: '2026-03-01',
            },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect' });

        expect(result.success).toBe(true);
        expect(result.context.changes[0].from).toBeNull();
        expect(result.context.changes[0].to).toBe('42');
    });
});

// =============================================================================
// autoSaveSnapshot — error path (tested indirectly via apply)
// =============================================================================

describe('autoSaveSnapshot error handling', () => {
    it('apply succeeds even when autoSaveSnapshot throws internally', async () => {
        // Make buildParamLookup throw inside autoSaveSnapshot context
        // autoSaveSnapshot calls buildParamLookup — make it throw on the first call
        // Actually, autoSaveSnapshot has its own try/catch.
        // We can trigger it by making getQuickMetrics throw (called inside autoSaveSnapshot)
        let metricsCallCount = 0;
        mockGetQuickMetrics.mockImplementation(async () => {
            metricsCallCount++;
            if (metricsCallCount === 1) {
                // First call is from autoSaveSnapshot
                throw new Error('metrics unavailable');
            }
            // Second call is from apply's own metricsBefore
            return { synthesisSuccessRate: 0.1, avgResonance: 0.4, totalNodes: 50, avgSpecificity: 3.0 };
        });

        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            if (opts?.method === 'PUT') return makeFetchResponse({ success: true });
            return makeFetchResponse({ resonance: { threshold: 0.5 } });
        });

        // autoSaveSnapshot is called first (uses getQuickMetrics first call → throws)
        // then metricsBefore uses getQuickMetrics second call → succeeds
        // BUT wait — metricsBefore is captured BEFORE autoSaveSnapshot is called.
        // Let me re-read the source... Actually metricsBefore is captured at line 227
        // and autoSaveSnapshot at line 298 — metricsBefore comes first.
        // So let me reverse: first call succeeds, autoSaveSnapshot's internal call fails.
        metricsCallCount = 0;
        mockGetQuickMetrics.mockImplementation(async () => {
            metricsCallCount++;
            if (metricsCallCount === 2) {
                // Second call is from autoSaveSnapshot's getQuickMetrics
                throw new Error('metrics unavailable');
            }
            return { synthesisSuccessRate: 0.1, avgResonance: 0.4, totalNodes: 50, avgSpecificity: 3.0 };
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        // autoSaveSnapshot failure is caught internally and returns null — apply still succeeds
        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
    });
});
