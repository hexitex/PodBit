/**
 * Unit tests for handlers/config-tune/handler.ts — handleConfig dispatcher.
 *
 * Tests input validation, delegation, response shaping, admin guard,
 * audit trail writes, snapshot CRUD, history filtering, and reflect action.
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
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: mockSectionMetadata,
}));

// --- helpers mock ---
const mockGetApiBaseUrl = jest.fn().mockReturnValue('http://localhost:3000');
const mockSecuredFetch = jest.fn<(...args: any[]) => Promise<any>>();
const mockGenerateUuid = jest.fn().mockReturnValue('test-uuid-1234');
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
    synthesisSuccessRate: 0.1,
    avgResonance: 0.45,
    totalNodes: 100,
    avgSpecificity: 3.5,
    capturedAt: '2026-01-01T00:00:00Z',
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
const mockFormatConfigChangeSeed = jest.fn().mockReturnValue('change seed content');
const mockFormatOverfittingSeed = jest.fn().mockReturnValue('overfitting seed content');
const mockFormatSnapshotSeed = jest.fn().mockReturnValue('snapshot seed content');
const mockComputeOverfittingHash = jest.fn().mockReturnValue('hash-abc');

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
    recentSuccessRate: 0.1,
    recommendation: 'No action needed',
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
const mockReadProjectsMeta = jest.fn().mockReturnValue({ currentProject: 'test-project' });

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
jest.unstable_mockModule('../../models.js', () => ({
    getSubsystemAssignments: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../../models/tuning-registry.js', () => ({
    saveToRegistry: jest.fn().mockResolvedValue(undefined),
    incrementTuningChanges: jest.fn().mockResolvedValue(undefined),
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
// Tests
// =============================================================================

beforeEach(() => {
    jest.resetAllMocks();

    // Re-establish default mock returns after resetAllMocks
    mockGetApiBaseUrl.mockReturnValue('http://localhost:3000');
    mockGenerateUuid.mockReturnValue('test-uuid-1234');
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
        synthesisSuccessRate: 0.1,
        avgResonance: 0.45,
        totalNodes: 100,
        avgSpecificity: 3.5,
        capturedAt: '2026-01-01T00:00:00Z',
    });
    mockDetectOverfitting.mockResolvedValue({
        qualityPlateau: false,
        diversityCollapse: false,
        metricOscillation: false,
        convergingParameters: [],
        recentSuccessRate: 0.1,
        recommendation: 'No action needed',
    });
    mockSeedTuningKnowledge.mockResolvedValue(null);
    mockReadProjectsMeta.mockReturnValue({ currentProject: 'test-project' });
    mockIsSensitiveConfigPath.mockReturnValue(false);
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(false);
    mockUpdateConfig.mockResolvedValue([]);
    mockLoadSavedConfig.mockResolvedValue(undefined);
    mockComputeOverfittingHash.mockReturnValue('hash-abc');
    mockFormatConfigChangeSeed.mockReturnValue('change seed content');
    mockFormatOverfittingSeed.mockReturnValue('overfitting seed content');
    mockFormatSnapshotSeed.mockReturnValue('snapshot seed content');
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);

    // Reset mutable state
    mockState.knowThyselfInitialized = false;
    mockState.lastOverfittingHash = null;
    mockState.pendingMetricsFollow = null;
});

// =============================================================================
// Missing action
// =============================================================================

describe('handleConfig — missing action', () => {
    it('returns error when action is missing', async () => {
        const result = await handleConfig({});
        expect(result.error).toMatch(/action is required/);
    });
});

// =============================================================================
// Unknown action
// =============================================================================

describe('handleConfig — unknown action', () => {
    it('returns error for unknown action', async () => {
        const result = await handleConfig({ action: 'bogus' });
        expect(result.error).toMatch(/Unknown action: bogus/);
        expect(result.error).toContain('get');
        expect(result.error).toContain('apply');
    });
});

// =============================================================================
// GET
// =============================================================================

describe('handleConfig — get', () => {
    it('returns full config from API', async () => {
        const apiConfig = { resonance: { threshold: 0.5 }, voicing: { maxOutputWords: 30 } };
        mockSecuredFetch.mockResolvedValue(makeFetchResponse(apiConfig));

        const result = await handleConfig({ action: 'get' });
        expect(result.config).toEqual(apiConfig);
        expect(mockSecuredFetch).toHaveBeenCalledWith('http://localhost:3000/api/config');
    });

    it('returns section-specific parameters when sectionId is given', async () => {
        const apiConfig = { resonance: { threshold: 0.42 } };
        mockSecuredFetch.mockResolvedValue(makeFetchResponse(apiConfig));

        const result = await handleConfig({ action: 'get', sectionId: 'resonance-threshold' });
        expect(result.sectionId).toBe('resonance-threshold');
        expect(result.sectionTitle).toBe('Resonance Threshold');
        expect(result.parameters).toHaveLength(1);
        expect(result.parameters[0].key).toBe('resonanceThreshold');
    });

    it('returns error for unknown sectionId', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}));

        const result = await handleConfig({ action: 'get', sectionId: 'nonexistent' });
        expect(result.error).toMatch(/Unknown section: nonexistent/);
    });

    it('returns error when API server is not responding', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}, false, 500));

        const result = await handleConfig({ action: 'get' });
        expect(result.error).toMatch(/API server not responding/);
    });

    it('returns error when API server is unreachable', async () => {
        mockSecuredFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await handleConfig({ action: 'get' });
        expect(result.error).toMatch(/Failed to reach API server/);
        expect(result.error).toContain('ECONNREFUSED');
    });
});

// =============================================================================
// SECTIONS
// =============================================================================

describe('handleConfig — sections', () => {
    it('returns all sections with parameter counts', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({ resonance: { threshold: 0.5 } }));

        const result = await handleConfig({ action: 'sections' });
        expect(result.totalSections).toBe(2);
        expect(result.totalParameters).toBe(2);
        expect(result.sections).toBeDefined();
        expect(result.sections['resonance-threshold']).toBeDefined();
        expect(result.sections['resonance-threshold'].parameterCount).toBe(1);
    });

    it('returns specific section when sectionId is provided', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({ resonance: { threshold: 0.5 } }));

        const result = await handleConfig({ action: 'sections', sectionId: 'resonance-threshold' });
        expect(result.section).toBeDefined();
        expect(result.section.title).toBe('Resonance Threshold');
        expect(result.section.parameters).toHaveLength(1);
    });

    it('returns error for unknown sectionId', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}));

        const result = await handleConfig({ action: 'sections', sectionId: 'missing' });
        expect(result.error).toMatch(/Unknown section: missing/);
    });

    it('returns sections even when API fetch fails (currentValue = null)', async () => {
        mockSecuredFetch.mockRejectedValue(new Error('down'));

        const result = await handleConfig({ action: 'sections' });
        expect(result.totalSections).toBe(2);
        // Parameters should have currentValue: null
        const params = result.sections['resonance-threshold'].parameters;
        expect(params[0].currentValue).toBeNull();
    });
});

// =============================================================================
// TUNE
// =============================================================================

describe('handleConfig — tune', () => {
    it('returns error when sectionId is missing', async () => {
        const result = await handleConfig({ action: 'tune', request: 'improve quality' });
        expect(result.error).toMatch(/sectionId is required/);
    });

    it('returns error when request is missing', async () => {
        const result = await handleConfig({ action: 'tune', sectionId: 'resonance-threshold' });
        expect(result.error).toMatch(/request is required/);
    });

    it('forwards tune request to API and returns response', async () => {
        const tuneResponse = { suggestions: [{ param: 'threshold', value: 0.4 }] };
        mockSecuredFetch.mockResolvedValue(makeFetchResponse(tuneResponse));

        const result = await handleConfig({
            action: 'tune',
            sectionId: 'resonance-threshold',
            request: 'improve quality',
        });

        expect(result).toEqual(tuneResponse);
        expect(mockSecuredFetch).toHaveBeenCalledWith(
            'http://localhost:3000/api/config/tune',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sectionId: 'resonance-threshold', request: 'improve quality' }),
            }),
        );
    });

    it('returns error when tune API fails', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse('bad request', false, 400));

        const result = await handleConfig({
            action: 'tune',
            sectionId: 'resonance-threshold',
            request: 'improve quality',
        });
        expect(result.error).toMatch(/Tune API failed \(400\)/);
    });

    it('returns error when API server is unreachable', async () => {
        mockSecuredFetch.mockRejectedValue(new Error('timeout'));

        const result = await handleConfig({
            action: 'tune',
            sectionId: 'resonance-threshold',
            request: 'improve quality',
        });
        expect(result.error).toMatch(/Failed to reach API server/);
    });
});

// =============================================================================
// APPLY
// =============================================================================

describe('handleConfig — apply', () => {
    beforeEach(() => {
        // Default: API returns current config
        mockSecuredFetch.mockImplementation(async (url: string, opts?: any) => {
            if (opts?.method === 'PUT') {
                return makeFetchResponse({ success: true });
            }
            return makeFetchResponse({ resonance: { threshold: 0.5 }, voicing: { maxOutputWords: 30 } });
        });
    });

    it('returns error when changes is missing', async () => {
        const result = await handleConfig({ action: 'apply' });
        expect(result.error).toMatch(/changes array is required/);
    });

    it('returns error when changes is empty array', async () => {
        const result = await handleConfig({ action: 'apply', changes: [] });
        expect(result.error).toMatch(/changes array is required/);
    });

    it('returns error when changes is not an array', async () => {
        const result = await handleConfig({ action: 'apply', changes: 'not-array' });
        expect(result.error).toMatch(/changes array is required/);
    });

    it('rejects change with missing configPath', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ value: 0.5 }],
        });
        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(0);
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/configPath must be a string array/);
    });

    it('rejects change with non-array configPath', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: 'resonance.threshold', value: 0.5 }],
        });
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/configPath must be a string array/);
    });

    it('rejects change with non-number value', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 'high' }],
        });
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/value must be a number/);
    });

    it('rejects change with unknown parameter path', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['unknown', 'param'], value: 0.5 }],
        });
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/Unknown parameter path/);
    });

    it('rejects change with value out of range (too low)', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.01 }],
        });
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/out of range/);
        expect(result.rejected[0].min).toBe(0.1);
        expect(result.rejected[0].max).toBe(0.9);
    });

    it('rejects change with value out of range (too high)', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 1.5 }],
        });
        expect(result.rejectedCount).toBe(1);
        expect(result.rejected[0].reason).toMatch(/out of range/);
    });

    it('applies valid change and returns success', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            reason: 'testing',
            contributor: 'claude',
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
        expect(result.rejectedCount).toBe(0);
        expect(result.applied[0].configPath).toEqual(['resonance', 'threshold']);
        expect(result.applied[0].newValue).toBe(0.4);
        expect(result.applied[0].label).toBe('Resonance Threshold');
        expect(result.rejected).toBeUndefined();
    });

    it('rounds value to step precision', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.42 }],
        });

        // step=0.05, 0.42 rounds to 0.40
        expect(result.applied[0].newValue).toBe(0.4);
    });

    it('calls loadSavedConfig, updateConfig, and syncs API', async () => {
        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(mockLoadSavedConfig).toHaveBeenCalled();
        expect(mockUpdateConfig).toHaveBeenCalled();
        // PUT call for sync
        expect(mockSecuredFetch).toHaveBeenCalledWith(
            'http://localhost:3000/api/config',
            expect.objectContaining({ method: 'PUT' }),
        );
    });

    it('writes audit trail after successful apply', async () => {
        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            reason: 'test reason',
            contributor: 'claude',
        });

        // config_history INSERT
        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining([
                'resonance.threshold',
                expect.any(String), // old_value JSON
                expect.any(String), // new_value JSON
                'system',           // changed_by (not starting with 'human')
                'claude',
                'test reason',
            ]),
        );
    });

    it('sets changed_by to human when contributor starts with human', async () => {
        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            contributor: 'human-gui',
        });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining(['human']), // changed_by
        );
    });

    it('returns error when API server is unreachable for config fetch', async () => {
        mockSecuredFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });
        expect(result.error).toMatch(/Failed to reach API server/);
    });

    it('returns error when API returns non-ok status for config fetch', async () => {
        mockSecuredFetch.mockResolvedValue(makeFetchResponse({}, false, 503));

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });
        expect(result.error).toMatch(/API server not responding/);
    });

    it('handles mixed valid and invalid changes', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [
                { configPath: ['resonance', 'threshold'], value: 0.4 },
                { configPath: ['unknown', 'param'], value: 99 },
                { value: 1 }, // missing configPath
            ],
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
        expect(result.rejectedCount).toBe(2);
        expect(result.rejected).toHaveLength(2);
    });

    it('does not omit rejected array when there are rejections', async () => {
        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['bad'], value: 0 }],
        });
        // configPath is an array but invalid path
        expect(result.rejected).toBeDefined();
    });

    // --- Admin guard ---
    it('requires admin password for sensitive config paths', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.error).toMatch(/Admin password required/);
        expect(result.adminRequired).toBe(true);
        expect(result.sensitivePaths).toEqual(['resonance.threshold']);
    });

    it('rejects invalid admin password for sensitive paths', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(false);

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            adminPassword: 'wrong',
        });

        expect(result.error).toMatch(/Invalid admin password/);
        expect(result.adminRequired).toBe(true);
    });

    it('allows sensitive change with valid admin password', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(true);

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            adminPassword: 'correct',
        });

        expect(result.success).toBe(true);
        expect(result.appliedCount).toBe(1);
    });

    it('allows sensitive change when no admin password is set', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(false);

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.success).toBe(true);
    });

    // --- Know Thyself auto-seeding ---
    it('seeds tuning knowledge for significant changes', async () => {
        mockSeedTuningKnowledge.mockResolvedValue('seed-id-abc');

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
            reason: 'experiment',
            contributor: 'claude',
        });

        expect(mockFormatConfigChangeSeed).toHaveBeenCalled();
        expect(mockSeedTuningKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'change seed content',
                nodeType: 'seed',
                salience: 0.6,
                contributor: 'claude',
            }),
        );
        expect(result.tuningSeedId).toBe('seed-id-abc');
    });

    it('sets pendingMetricsFollow when seed is created', async () => {
        mockSeedTuningKnowledge.mockResolvedValue('seed-id-xyz');

        await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(mockState.pendingMetricsFollow).toBeTruthy();
        expect(mockState.pendingMetricsFollow!.seedId).toBe('seed-id-xyz');
    });

    it('does not include tuningSeedId when seeding returns null', async () => {
        mockSeedTuningKnowledge.mockResolvedValue(null);

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.tuningSeedId).toBeUndefined();
    });

    // --- API sync failure is non-fatal ---
    it('succeeds even when API sync PUT fails', async () => {
        mockSecuredFetch.mockImplementation(async (url: string, opts?: any) => {
            if (opts?.method === 'PUT') {
                return makeFetchResponse({}, false, 500);
            }
            return makeFetchResponse({ resonance: { threshold: 0.5 } });
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.success).toBe(true);
        expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('succeeds even when API sync PUT throws', async () => {
        let callCount = 0;
        mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
            callCount++;
            if (opts?.method === 'PUT') {
                throw new Error('network error');
            }
            return makeFetchResponse({ resonance: { threshold: 0.5 } });
        });

        const result = await handleConfig({
            action: 'apply',
            changes: [{ configPath: ['resonance', 'threshold'], value: 0.4 }],
        });

        expect(result.success).toBe(true);
    });
});

// =============================================================================
// METRICS
// =============================================================================

describe('handleConfig — metrics', () => {
    beforeEach(() => {
        // Set up query mocks for the metrics action
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('dream_cycles')) {
                return { total_cycles: '50', children_created: '5', avg_resonance: '0.456' };
            }
            if (sql.includes('session_insights')) {
                return { session_count: '3', avg_topic_weight: '0.7', total_topic_usage: '15' };
            }
            if (sql.includes('avg_weight')) {
                return { total: '100', avg_weight: '0.6', avg_salience: '0.5', avg_specificity: '3.2' };
            }
            if (sql.includes('breakthrough')) {
                return { count: '2' };
            }
            return null;
        });

        mockQuery.mockImplementation(async (sql: string) => {
            if (sql.includes('rejection_reason')) {
                return [{ rejection_reason: 'low_resonance', count: '20' }];
            }
            if (sql.includes('CASE') && sql.includes('bucket')) {
                return [{ bucket: '0.3-0.5', count: '30' }];
            }
            if (sql.includes('node_type') && sql.includes('GROUP BY')) {
                return [{ type: 'seed', count: '60' }, { type: 'voiced', count: '30' }];
            }
            if (sql.includes('domain') && sql.includes('GROUP BY')) {
                return [{ domain: 'test', count: '50' }];
            }
            return [];
        });

        mockSystemQueryOne.mockResolvedValue({ count: '10' });
    });

    it('returns structured metrics with defaults', async () => {
        const result = await handleConfig({ action: 'metrics' });

        expect(result.periodDays).toBe(7);
        expect(result.synthesisEngine).toBeDefined();
        expect(result.synthesisEngine.totalCycles).toBe(50);
        expect(result.synthesisEngine.childrenCreated).toBe(5);
        expect(result.synthesisEngine.successRate).toBeCloseTo(0.1, 2);
        expect(result.synthesisEngine.avgResonanceScore).toBeCloseTo(0.456, 3);
        expect(result.graphHealth).toBeDefined();
        expect(result.graphHealth.totalNodes).toBe(100);
        expect(result.contextEngine).toBeDefined();
        expect(result.overfitting).toBeDefined();
        expect(result.tuningCycles).toBe(10);
    });

    it('accepts custom days parameter', async () => {
        const result = await handleConfig({ action: 'metrics', days: 30 });
        expect(result.periodDays).toBe(30);
        expect(mockDetectOverfitting).toHaveBeenCalledWith(30);
    });

    it('includes rejection breakdown with percentages', async () => {
        const result = await handleConfig({ action: 'metrics' });
        const breakdown = result.synthesisEngine.rejectionBreakdown;
        expect(breakdown).toHaveLength(1);
        expect(breakdown[0].reason).toBe('low_resonance');
        expect(breakdown[0].count).toBe(20);
    });

    it('includes node-type and domain distributions', async () => {
        const result = await handleConfig({ action: 'metrics' });
        expect(result.graphHealth.nodesByType).toHaveLength(2);
        expect(result.graphHealth.nodesByDomain.length).toBeGreaterThanOrEqual(1);
    });

    it('handles missing tuning count table gracefully', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('no such table'));

        const result = await handleConfig({ action: 'metrics' });
        expect(result.tuningCycles).toBe(0);
    });

    // --- Know Thyself: overfitting auto-seed ---
    it('seeds overfitting signal when new hash detected', async () => {
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: true,
            diversityCollapse: false,
            metricOscillation: false,
            convergingParameters: [],
            recentSuccessRate: 0.08,
            improvementPct: 1.0,
            recommendation: 'Reset parameters',
        });
        mockComputeOverfittingHash.mockReturnValue('new-hash');

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'overfitting seed content',
                nodeType: 'synthesis',
                salience: 0.8,
                contributor: 'system',
            }),
        );
        expect(mockState.lastOverfittingHash).toBe('new-hash');
    });

    it('does not seed overfitting when hash matches previous', async () => {
        mockState.lastOverfittingHash = 'same-hash';
        mockDetectOverfitting.mockResolvedValue({
            qualityPlateau: true,
            diversityCollapse: false,
            metricOscillation: false,
            convergingParameters: [],
            recentSuccessRate: 0.08,
            recommendation: 'Reset',
        });
        mockComputeOverfittingHash.mockReturnValue('same-hash');

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).not.toHaveBeenCalled();
    });

    it('does not seed when no actionable overfitting signals', async () => {
        // Default mock: all false, empty convergingParameters
        await handleConfig({ action: 'metrics' });
        expect(mockSeedTuningKnowledge).not.toHaveBeenCalled();
    });

    // --- Know Thyself: metrics follow-up ---
    it('seeds metrics follow-up when pending and > 5 min old', async () => {
        mockState.pendingMetricsFollow = {
            seedId: 'prior-seed-id',
            timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        };

        await handleConfig({ action: 'metrics' });

        expect(mockSeedTuningKnowledge).toHaveBeenCalledWith(
            expect.objectContaining({
                nodeType: 'seed',
                salience: 0.6,
                contributor: 'system',
                parentIds: ['prior-seed-id'],
            }),
        );
        expect(mockState.pendingMetricsFollow).toBeNull();
    });

    it('does not seed metrics follow-up when < 5 min old', async () => {
        mockState.pendingMetricsFollow = {
            seedId: 'prior-seed-id',
            timestamp: Date.now() - 2 * 60 * 1000, // 2 minutes ago
        };

        await handleConfig({ action: 'metrics' });

        // seedTuningKnowledge should NOT be called for follow-up
        // (may be called for overfitting, but not for follow-up)
        expect(mockState.pendingMetricsFollow).not.toBeNull();
    });

    it('handles zero total cycles gracefully', async () => {
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('dream_cycles')) {
                return { total_cycles: '0', children_created: '0', avg_resonance: null };
            }
            if (sql.includes('session_insights')) {
                return { session_count: '0', avg_topic_weight: null, total_topic_usage: '0' };
            }
            if (sql.includes('avg_weight')) {
                return { total: '0', avg_weight: null, avg_salience: null, avg_specificity: null };
            }
            if (sql.includes('breakthrough')) {
                return { count: '0' };
            }
            return null;
        });

        const result = await handleConfig({ action: 'metrics' });
        expect(result.synthesisEngine.totalCycles).toBe(0);
        expect(result.synthesisEngine.successRate).toBe(0);
        expect(result.graphHealth.avgWeight).toBe(0);
    });
});

// =============================================================================
// SNAPSHOT
// =============================================================================

describe('handleConfig — snapshot', () => {
    it('returns error when snapshotAction is missing', async () => {
        const result = await handleConfig({ action: 'snapshot' });
        expect(result.error).toMatch(/snapshotAction is required/);
    });

    it('returns error for unknown snapshotAction', async () => {
        const result = await handleConfig({ action: 'snapshot', snapshotAction: 'nope' });
        expect(result.error).toMatch(/Unknown snapshotAction: nope/);
    });

    // --- save ---
    describe('save', () => {
        beforeEach(() => {
            mockSecuredFetch.mockResolvedValue(
                makeFetchResponse({ resonance: { threshold: 0.5 } }),
            );
        });

        it('saves a snapshot and returns success', async () => {
            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
                snapshotLabel: 'my-snapshot',
            });

            expect(result.success).toBe(true);
            expect(result.snapshotId).toBe('test-uuid-1234');
            expect(result.label).toBe('my-snapshot');
            expect(result.metricsAtSave).toBeDefined();
        });

        it('generates default label when none provided', async () => {
            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
            });

            expect(result.label).toMatch(/^snapshot-/);
        });

        it('writes snapshot to config_snapshots table', async () => {
            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
                snapshotLabel: 'test',
            });

            expect(mockSystemQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO config_snapshots'),
                expect.arrayContaining(['test-uuid-1234', 'test']),
            );
        });

        it('prunes snapshots beyond 10 per project', async () => {
            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
            });

            expect(mockSystemQuery).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM config_snapshots'),
                expect.arrayContaining(['test-project']),
            );
        });

        it('seeds tuning knowledge on save', async () => {
            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
                snapshotLabel: 'checkpoint',
            });

            expect(mockFormatSnapshotSeed).toHaveBeenCalledWith(
                'save', 'checkpoint', expect.any(Object), undefined, expect.any(String),
            );
            expect(mockSeedTuningKnowledge).toHaveBeenCalled();
        });

        it('returns error when API server is unreachable', async () => {
            mockSecuredFetch.mockRejectedValue(new Error('down'));

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'save',
            });
            expect(result.error).toMatch(/Failed to reach API server/);
        });
    });

    // --- list ---
    describe('list', () => {
        it('lists snapshots for current project', async () => {
            mockSystemQuery.mockResolvedValue([
                {
                    id: 'snap-1',
                    label: 'test-snap',
                    created_by: 'claude',
                    created_at: '2026-01-01',
                    project_name: 'test-project',
                    metrics_at_save: JSON.stringify({ synthesisSuccessRate: 0.1 }),
                },
            ]);

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'list',
            });

            expect(result.count).toBe(1);
            expect(result.currentProject).toBe('test-project');
            expect(result.snapshots[0].id).toBe('snap-1');
            expect(result.snapshots[0].synthSuccessRate).toBe(0.1);
        });

        it('lists all project snapshots when allProjects is true', async () => {
            mockSystemQuery.mockResolvedValue([]);

            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'list',
                allProjects: true,
            });

            // Should NOT include project_name filter
            expect(mockSystemQuery).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 50'),
            );
        });

        it('filters by custom project name', async () => {
            mockSystemQuery.mockResolvedValue([]);

            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'list',
                project: 'other-project',
            });

            expect(mockSystemQuery).toHaveBeenCalledWith(
                expect.stringContaining('project_name = $1'),
                ['other-project'],
            );
        });

        it('handles null metrics_at_save gracefully', async () => {
            mockSystemQuery.mockResolvedValue([
                {
                    id: 'snap-2',
                    label: 'no-metrics',
                    created_by: 'claude',
                    created_at: '2026-01-01',
                    project_name: 'test-project',
                    metrics_at_save: null,
                },
            ]);

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'list',
            });

            expect(result.snapshots[0].synthSuccessRate).toBeNull();
        });
    });

    // --- restore ---
    describe('restore', () => {
        beforeEach(() => {
            mockSecuredFetch.mockImplementation(async (_url: string, opts?: any) => {
                if (opts?.method === 'PUT') return makeFetchResponse({ success: true });
                return makeFetchResponse({ resonance: { threshold: 0.5 }, voicing: { maxOutputWords: 30 } });
            });
        });

        it('returns error when snapshotId is missing', async () => {
            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
            });
            expect(result.error).toMatch(/snapshotId is required/);
        });

        it('returns error when snapshot not found', async () => {
            mockSystemQueryOne.mockResolvedValue(null);

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'nonexistent',
            });
            expect(result.error).toMatch(/Snapshot not found/);
        });

        it('restores snapshot and returns changed parameters', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'before-change',
                parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
            });

            // getNestedValue for current config returns 0.5 (differs from saved 0.35)
            mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
                if (path.join('.') === 'resonance.threshold') return 0.5;
                let current = obj;
                for (const key of path) {
                    if (current == null) return undefined;
                    current = current[key];
                }
                return current;
            });

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });

            expect(result.success).toBe(true);
            expect(result.snapshotLabel).toBe('before-change');
            expect(result.restoredCount).toBe(1);
            expect(result.restored[0].oldValue).toBe(0.5);
            expect(result.restored[0].newValue).toBe(0.35);
        });

        it('skips unchanged parameters during restore', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'same',
                parameters: JSON.stringify({ 'resonance.threshold': 0.5 }),
            });

            // Current config already has 0.5
            mockGetNestedValue.mockReturnValue(0.5);

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });

            expect(result.restoredCount).toBe(0);
            expect(mockUpdateConfig).not.toHaveBeenCalled();
        });

        it('calls loadSavedConfig and updateConfig on restore', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'test',
                parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
            });
            mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
                if (path.join('.') === 'resonance.threshold') return 0.5;
                return undefined;
            });

            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });

            expect(mockLoadSavedConfig).toHaveBeenCalled();
            expect(mockUpdateConfig).toHaveBeenCalled();
        });

        it('writes audit trail with snapshot_id on restore', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'rollback',
                parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
            });
            mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
                if (path.join('.') === 'resonance.threshold') return 0.5;
                return undefined;
            });

            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });

            expect(mockSystemQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO config_history'),
                expect.arrayContaining([
                    'snap-1', // snapshot_id
                    'test-project',
                ]),
            );
        });

        it('seeds tuning knowledge on successful restore', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'rollback',
                parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
            });
            mockGetNestedValue.mockImplementation((obj: any, path: string[]) => {
                if (path.join('.') === 'resonance.threshold') return 0.5;
                return undefined;
            });

            await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });

            expect(mockFormatSnapshotSeed).toHaveBeenCalledWith(
                'restore', 'rollback', expect.any(Object), 1, expect.any(String),
            );
            expect(mockSeedTuningKnowledge).toHaveBeenCalled();
        });

        it('returns error when API is unreachable during restore', async () => {
            mockSystemQueryOne.mockResolvedValue({
                id: 'snap-1',
                label: 'test',
                parameters: JSON.stringify({ 'resonance.threshold': 0.35 }),
            });
            mockSecuredFetch.mockRejectedValue(new Error('down'));

            const result = await handleConfig({
                action: 'snapshot',
                snapshotAction: 'restore',
                snapshotId: 'snap-1',
            });
            expect(result.error).toMatch(/Failed to reach API server/);
        });
    });
});

// =============================================================================
// HISTORY
// =============================================================================

describe('handleConfig — history', () => {
    it('returns formatted change history', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                id: 1,
                config_path: 'resonance.threshold',
                old_value: '"0.5"',
                new_value: '"0.4"',
                changed_by: 'system',
                contributor: 'claude',
                reason: 'test',
                section_id: 'resonance-threshold',
                snapshot_id: null,
                created_at: '2026-01-01T00:00:00Z',
            },
        ]);
        mockSystemQueryOne.mockResolvedValue({ count: '1' });

        const result = await handleConfig({ action: 'history' });

        expect(result.count).toBe(1);
        expect(result.total).toBe(1);
        expect(result.changes[0].configPath).toBe('resonance.threshold');
        expect(result.changes[0].label).toBe('Resonance Threshold');
        expect(result.changes[0].sectionTitle).toBe('Resonance Threshold');
    });

    it('defaults limit to 20', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({ action: 'history' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('LIMIT'),
            expect.arrayContaining([20]),
        );
    });

    it('filters by sectionId when provided', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({ action: 'history', sectionId: 'resonance-threshold' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('section_id'),
            expect.arrayContaining(['resonance-threshold']),
        );
    });

    it('filters by configPath when provided as string', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({ action: 'history', configPath: 'resonance.threshold' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('config_path'),
            expect.arrayContaining(['resonance.threshold']),
        );
    });

    it('joins configPath array when provided as array', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({ action: 'history', configPath: ['resonance', 'threshold'] });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('config_path'),
            expect.arrayContaining(['resonance.threshold']),
        );
    });

    it('filters by project name', async () => {
        mockSystemQuery.mockResolvedValue([]);
        mockSystemQueryOne.mockResolvedValue({ count: '0' });

        await handleConfig({ action: 'history', project: 'other' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('project_name'),
            expect.arrayContaining(['other']),
        );
    });

    it('handles null old_value', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                id: 1,
                config_path: 'resonance.threshold',
                old_value: null,
                new_value: '"0.4"',
                changed_by: 'system',
                contributor: 'claude',
                reason: null,
                section_id: null,
                snapshot_id: null,
                created_at: '2026-01-01',
            },
        ]);
        mockSystemQueryOne.mockResolvedValue({ count: '1' });

        const result = await handleConfig({ action: 'history' });
        expect(result.changes[0].oldValue).toBeNull();
    });

    it('returns unknown param metadata as null', async () => {
        // Config path not in paramLookup
        mockSystemQuery.mockResolvedValue([
            {
                id: 2,
                config_path: 'unknown.path',
                old_value: '"old"',
                new_value: '"new"',
                changed_by: 'system',
                contributor: 'claude',
                reason: null,
                section_id: null,
                snapshot_id: null,
                created_at: '2026-01-01',
            },
        ]);
        mockSystemQueryOne.mockResolvedValue({ count: '1' });

        const result = await handleConfig({ action: 'history' });
        expect(result.changes[0].label).toBeNull();
        expect(result.changes[0].description).toBeNull();
        expect(result.changes[0].sectionTitle).toBeNull();
    });
});

// =============================================================================
// REFLECT
// =============================================================================

describe('handleConfig — reflect', () => {
    it('returns failure when no config changes exist', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect' });
        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/No config changes/);
    });

    it('returns context when recent changes exist', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'resonance.threshold',
                old_value: '"0.5"',
                new_value: '"0.4"',
                reason: 'test',
                contributor: 'claude',
                created_at: '2026-01-01',
            },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect', days: 14 });

        expect(result.success).toBe(true);
        expect(result.mode).toBe('reflect');
        expect(result.context.periodDays).toBe(14);
        expect(result.context.changeCount).toBe(1);
        expect(result.context.changes).toHaveLength(1);
        expect(result.context.changes[0].path).toBe('resonance.threshold');
        expect(result.context.currentMetrics).toBeDefined();
        expect(result.context.overfitting).toBeDefined();
        expect(result.instructions).toContain('Synthesize a reflection');
    });

    it('includes recent tuning nodes in context', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'resonance.threshold',
                old_value: '"0.5"',
                new_value: '"0.4"',
                reason: null,
                contributor: 'claude',
                created_at: '2026-01-01',
            },
        ]);
        mockQuery.mockResolvedValue([
            { id: 'node-1', content: 'tuning insight', node_type: 'seed', weight: 1, created_at: '2026-01-01' },
        ]);

        const result = await handleConfig({ action: 'reflect' });

        expect(result.context.recentTuningNodes).toHaveLength(1);
        expect(result.context.recentTuningNodes[0].id).toBe('node-1');
        expect(result.instructions).toContain('node-1');
    });

    it('uses default days=7 and contributor=claude', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'x',
                old_value: '"1"',
                new_value: '"2"',
                reason: null,
                contributor: 'x',
                created_at: '2026-01-01',
            },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await handleConfig({ action: 'reflect' });
        expect(result.context.periodDays).toBe(7);
        expect(result.instructions).toContain('claude');
    });

    it('handles config_history table not existing', async () => {
        mockSystemQuery.mockRejectedValue(new Error('no such table'));

        const result = await handleConfig({ action: 'reflect' });
        expect(result.success).toBe(false);
        expect(result.reason).toMatch(/No config changes/);
    });

    it('handles tuning nodes query failure gracefully', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'x',
                old_value: '"1"',
                new_value: '"2"',
                reason: null,
                contributor: 'x',
                created_at: '2026-01-01',
            },
        ]);
        mockQuery.mockRejectedValue(new Error('no such domain'));

        const result = await handleConfig({ action: 'reflect' });
        expect(result.success).toBe(true);
        expect(result.context.recentTuningNodes).toHaveLength(0);
    });
});
