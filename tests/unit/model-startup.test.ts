/**
 * Unit tests for models/startup.ts — loadSavedModels + checkEmbeddingModelMismatch.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockLoadApiKeys = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockAutoImportToRegistry = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetEmbeddingModelName = jest.fn<() => string | null>().mockReturnValue(null);

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: jest.fn().mockResolvedValue([]),
    systemQueryOne: jest.fn().mockResolvedValue(null),
    systemTransactionSync: jest.fn(),
    transactionSync: jest.fn(),
}));

jest.unstable_mockModule('../../models/api-keys.js', () => ({
    loadApiKeys: mockLoadApiKeys,
}));

jest.unstable_mockModule('../../models/registry.js', () => ({
    autoImportToRegistry: mockAutoImportToRegistry,
}));

const mockGetEmbedding = jest.fn<() => Promise<number[] | null>>().mockResolvedValue(null);

jest.unstable_mockModule('../../models/embedding.js', () => ({
    getEmbeddingModelName: mockGetEmbeddingModelName,
    getEmbedding: mockGetEmbedding,
}));

jest.unstable_mockModule('../../core/scoring.js', () => ({
    l2Normalize: jest.fn((v: number[]) => v),
    embeddingToBuffer: jest.fn(() => Buffer.alloc(0)),
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: jest.fn(),
}));

const { loadSavedModels } = await import('../../models/startup.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockLoadApiKeys.mockResolvedValue(undefined);
    mockAutoImportToRegistry.mockResolvedValue(undefined);
    mockGetEmbeddingModelName.mockReturnValue(null);
});

// =============================================================================
// loadSavedModels
// =============================================================================

describe('loadSavedModels', () => {
    it('calls loadApiKeys, autoImportToRegistry, and embedding mismatch check', async () => {
        await loadSavedModels();

        expect(mockLoadApiKeys).toHaveBeenCalledTimes(1);
        expect(mockAutoImportToRegistry).toHaveBeenCalledTimes(1);
    });

    it('does not throw when all subsystems succeed', async () => {
        await expect(loadSavedModels()).resolves.toBeUndefined();
    });
});

// =============================================================================
// checkEmbeddingModelMismatch (via loadSavedModels)
// =============================================================================

describe('checkEmbeddingModelMismatch (via loadSavedModels)', () => {
    it('skips mismatch check when no embedding model configured', async () => {
        mockGetEmbeddingModelName.mockReturnValue(null);

        await loadSavedModels();

        // No DB query for mismatch check
        expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('skips warning when no stored nodes with provenance', async () => {
        mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
        mockQueryOne.mockResolvedValue(null); // no sample row

        // Should not throw
        await expect(loadSavedModels()).resolves.toBeUndefined();
    });

    it('suppresses warnings when stored model matches current', async () => {
        mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
        mockQueryOne
            .mockResolvedValueOnce({ // sample: stored model same as current
                embedding_model: 'nomic-embed-text',
                embedding_dims: 768,
                count: 150,
            })
            .mockResolvedValueOnce({ count: 0 }); // orphans

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await loadSavedModels();
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('MISMATCH'));
        warnSpy.mockRestore();
    });

    it('warns when stored model differs from current (auto re-embed)', async () => {
        mockGetEmbeddingModelName.mockReturnValue('text-embedding-3-small');
        mockQueryOne
            .mockResolvedValueOnce({ count: 50 }); // 50 stale nodes

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await loadSavedModels();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('EMBEDDING MODEL CHANGED'));
        warnSpy.mockRestore();
    });

    it('warns about stale nodes needing re-embedding', async () => {
        mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
        mockQueryOne
            .mockResolvedValueOnce({ count: 25 }); // 25 stale nodes

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await loadSavedModels();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('auto re-embedding 25 nodes'));
        warnSpy.mockRestore();
    });

    it('does not throw when DB fails (non-critical)', async () => {
        mockGetEmbeddingModelName.mockReturnValue('nomic-embed-text');
        mockQueryOne.mockRejectedValue(new Error('DB error'));

        await expect(loadSavedModels()).resolves.toBeUndefined();
    });
});
