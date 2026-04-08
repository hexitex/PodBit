/**
 * Unit tests for handlers/projects/services.ts —
 * stopAllBackgroundServices, clearAllCaches, restartBackgroundServices.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks for static imports
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

const mockSetProjectSwitching = jest.fn<(v: boolean) => void>();
const mockAbort = jest.fn<() => void>();
const mockGetAbortController = jest.fn<() => { abort: () => void }>().mockReturnValue({ abort: mockAbort });

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    setProjectSwitching: mockSetProjectSwitching,
    getAbortController: mockGetAbortController,
}));

// =============================================================================
// Mocks for dynamic imports
// =============================================================================

const mockStopSynthesisEngine = jest.fn<() => void>();
const mockGetSynthesisStatus = jest.fn<() => { running: boolean }>().mockReturnValue({ running: false });
const mockStopCycle = jest.fn<(type: string) => void>();
const mockCycleStates: Record<string, { running: boolean }> = {
    validation: { running: false },
    questions: { running: false },
    tensions: { running: false },
    research: { running: false },
    autorating: { running: false },
};

jest.unstable_mockModule('../../core.js', () => ({
    stopSynthesisEngine: mockStopSynthesisEngine,
    getSynthesisStatus: mockGetSynthesisStatus,
    stopCycle: mockStopCycle,
    cycleStates: mockCycleStates,
}));

const mockStopAllWatchers = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockStartAllWatchers = jest.fn<() => Promise<number>>().mockResolvedValue(0);

jest.unstable_mockModule('../../kb/watcher.js', () => ({
    stopAllWatchers: mockStopAllWatchers,
    startAllWatchers: mockStartAllWatchers,
}));

const mockPipelineStop = jest.fn<() => Promise<{ cleared: number; reset: number }>>().mockResolvedValue({ cleared: 0, reset: 0 });
const mockPipelineResume = jest.fn<() => void>();

jest.unstable_mockModule('../../kb/pipeline.js', () => ({
    processingPipeline: {
        stop: mockPipelineStop,
        resume: mockPipelineResume,
    },
}));

const mockStopPoolReturnCheck = jest.fn<() => void>();

jest.unstable_mockModule('../../core/pool-integration.js', () => ({
    stopPoolReturnCheck: mockStopPoolReturnCheck,
}));

const mockClearEmbeddingCache = jest.fn<() => void>();

jest.unstable_mockModule('../../vector/embedding-cache.js', () => ({
    clearAll: mockClearEmbeddingCache,
}));

const mockLoadSavedConfig = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLoadSavedModels = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockAppConfig = { synthesisEngine: {} };

jest.unstable_mockModule('../../config.js', () => ({
    loadSavedConfig: mockLoadSavedConfig,
    config: mockAppConfig,
}));

jest.unstable_mockModule('../../models.js', () => ({
    loadSavedModels: mockLoadSavedModels,
}));

const mockClearAllSessions = jest.fn<() => void>();

jest.unstable_mockModule('../../context-engine.js', () => ({
    clearAllSessions: mockClearAllSessions,
}));

const mockInvalidateManifestCache = jest.fn<() => void>();

jest.unstable_mockModule('../../core/project-context.js', () => ({
    invalidateManifestCache: mockInvalidateManifestCache,
}));

const mockClearTransientCache = jest.fn<() => void>();

jest.unstable_mockModule('../../core/governance.js', () => ({
    clearTransientCache: mockClearTransientCache,
}));

const mockClearInstallationPrefixCache = jest.fn<() => void>();

jest.unstable_mockModule('../../core/number-variables.js', () => ({
    clearInstallationPrefixCache: mockClearInstallationPrefixCache,
}));

const { stopAllBackgroundServices, clearAllCaches, restartBackgroundServices } =
    await import('../../handlers/projects/services.js');

beforeEach(() => {
    jest.resetAllMocks();

    // Reset cycle states
    for (const key of Object.keys(mockCycleStates)) {
        mockCycleStates[key].running = false;
    }

    // Restore defaults after resetAllMocks
    mockGetAbortController.mockReturnValue({ abort: mockAbort });
    mockGetSynthesisStatus.mockReturnValue({ running: false });
    mockPipelineStop.mockResolvedValue({ cleared: 0, reset: 0 });
    mockStartAllWatchers.mockResolvedValue(0);
    mockQuery.mockResolvedValue([]);
    mockLoadSavedConfig.mockResolvedValue(undefined);
    mockLoadSavedModels.mockResolvedValue(undefined);
});

// =============================================================================
// stopAllBackgroundServices
// =============================================================================

describe('stopAllBackgroundServices', () => {
    it('sets projectSwitching to true', async () => {
        await stopAllBackgroundServices();
        expect(mockSetProjectSwitching).toHaveBeenCalledWith(true);
    });

    it('calls abort on the abort controller', async () => {
        await stopAllBackgroundServices();
        expect(mockGetAbortController).toHaveBeenCalled();
        expect(mockAbort).toHaveBeenCalled();
    });

    it('stops synthesis engine when it is running', async () => {
        mockGetSynthesisStatus
            .mockReturnValueOnce({ running: true })  // initial check
            .mockReturnValue({ running: false });     // inside wait loop

        await stopAllBackgroundServices();

        expect(mockStopSynthesisEngine).toHaveBeenCalled();
    });

    it('does not stop synthesis engine when it is not running', async () => {
        mockGetSynthesisStatus.mockReturnValue({ running: false });

        await stopAllBackgroundServices();

        expect(mockStopSynthesisEngine).not.toHaveBeenCalled();
    });

    it('stops running autonomous cycle and removes it from running state', async () => {
        mockCycleStates.validation.running = true;
        mockStopCycle.mockImplementation((type: string) => {
            mockCycleStates[type].running = false; // simulate cycle stopping
        });

        await stopAllBackgroundServices();

        expect(mockStopCycle).toHaveBeenCalledWith('validation');
    });

    it('does not call stopCycle for cycles that are not running', async () => {
        // all cycles default to running: false
        await stopAllBackgroundServices();
        expect(mockStopCycle).not.toHaveBeenCalled();
    });

    it('calls stopAllWatchers to stop KB file watchers', async () => {
        await stopAllBackgroundServices();
        expect(mockStopAllWatchers).toHaveBeenCalled();
    });

    it('calls processingPipeline.stop to drain KB queue', async () => {
        await stopAllBackgroundServices();
        expect(mockPipelineStop).toHaveBeenCalled();
    });

    it('calls stopPoolReturnCheck', async () => {
        await stopAllBackgroundServices();
        expect(mockStopPoolReturnCheck).toHaveBeenCalled();
    });
});

// =============================================================================
// clearAllCaches
// =============================================================================

describe('clearAllCaches', () => {
    it('clears the embedding cache', async () => {
        await clearAllCaches();
        expect(mockClearEmbeddingCache).toHaveBeenCalled();
    });

    it('calls loadSavedConfig and loadSavedModels', async () => {
        await clearAllCaches();
        expect(mockLoadSavedConfig).toHaveBeenCalled();
        expect(mockLoadSavedModels).toHaveBeenCalled();
    });

    it('clears context engine sessions', async () => {
        await clearAllCaches();
        expect(mockClearAllSessions).toHaveBeenCalled();
    });

    it('invalidates the project manifest cache', async () => {
        await clearAllCaches();
        expect(mockInvalidateManifestCache).toHaveBeenCalled();
    });

    it('clears the transient domain cache', async () => {
        await clearAllCaches();
        expect(mockClearTransientCache).toHaveBeenCalled();
    });

    it('clears the number variable installation prefix cache', async () => {
        await clearAllCaches();
        expect(mockClearInstallationPrefixCache).toHaveBeenCalled();
    });

    it('deletes the knowledge_cache table contents', async () => {
        await clearAllCaches();

        const deleteCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('DELETE FROM knowledge_cache')
        );
        expect(deleteCall).toBeDefined();
    });

});

// =============================================================================
// restartBackgroundServices
// =============================================================================

describe('restartBackgroundServices', () => {
    it('resumes the KB processing pipeline', async () => {
        await restartBackgroundServices();
        expect(mockPipelineResume).toHaveBeenCalled();
    });

    it('starts all KB watchers', async () => {
        await restartBackgroundServices();
        expect(mockStartAllWatchers).toHaveBeenCalled();
    });

    it('returns the count of started watchers', async () => {
        mockStartAllWatchers.mockResolvedValue(3);

        const count = await restartBackgroundServices();

        expect(count).toBe(3);
    });

    it('returns 0 when no watchers are started', async () => {
        mockStartAllWatchers.mockResolvedValue(0);

        const count = await restartBackgroundServices();

        expect(count).toBe(0);
    });
});
