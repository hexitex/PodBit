/**
 * Unit tests for handlers/projects/manifest.ts
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockInvalidateManifestCache = jest.fn<() => void>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../core/project-context.js', () => ({
    invalidateManifestCache: mockInvalidateManifestCache,
}));

const { handleUpdateManifest, handleManifest } = await import('../../handlers/projects/manifest.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockInvalidateManifestCache.mockReturnValue(undefined);
});

// =============================================================================
// handleManifest
// =============================================================================

describe('handleManifest', () => {
    it('returns manifest from project.manifest setting', async () => {
        const stored = { purpose: 'Test purpose', goals: ['goal1'], domains: ['science'] };
        mockQuery.mockResolvedValueOnce([{ value: JSON.stringify(stored) }]);

        const result = await handleManifest();

        expect(result.manifest).toEqual(stored);
    });

    it('falls back to individual settings when project.manifest is absent', async () => {
        mockQuery
            .mockResolvedValueOnce([])                              // project.manifest not found
            .mockResolvedValueOnce([{ value: 'Fallback purpose' }]) // project.purpose
            .mockResolvedValueOnce([{ value: JSON.stringify(['fallback goal']) }]); // project.goals

        const result = await handleManifest();

        expect(result.manifest).toBeDefined();
        expect(result.manifest.purpose).toBe('Fallback purpose');
        expect(result.manifest.goals).toEqual(['fallback goal']);
    });

    it('falls back with empty goals when project.goals is absent', async () => {
        mockQuery
            .mockResolvedValueOnce([])                              // project.manifest
            .mockResolvedValueOnce([{ value: 'Purpose only' }])     // project.purpose
            .mockResolvedValueOnce([]);                             // project.goals missing

        const result = await handleManifest();

        expect(result.manifest.purpose).toBe('Purpose only');
        expect(result.manifest.goals).toEqual([]);
    });

    it('returns null manifest message when no settings exist', async () => {
        mockQuery.mockResolvedValue([]); // all queries return empty

        const result = await handleManifest();

        expect(result.manifest).toBeNull();
        expect(result.message).toContain('No project manifest found');
    });

    it('falls through to fallback when first query throws', async () => {
        mockQuery
            .mockRejectedValueOnce(new Error('table not found'))    // project.manifest throws
            .mockResolvedValueOnce([{ value: 'Error fallback' }])   // project.purpose
            .mockResolvedValueOnce([]);                             // project.goals

        const result = await handleManifest();

        expect(result.manifest.purpose).toBe('Error fallback');
    });

    it('returns null manifest when both queries throw', async () => {
        mockQuery
            .mockRejectedValueOnce(new Error('DB error 1'))
            .mockRejectedValueOnce(new Error('DB error 2'));

        const result = await handleManifest();

        expect(result.manifest).toBeNull();
    });
});

// =============================================================================
// handleUpdateManifest — validation
// =============================================================================

describe('handleUpdateManifest — validation', () => {
    it('returns error when manifest is missing', async () => {
        const result = await handleUpdateManifest({});
        expect(result.error).toContain('manifest object is required');
    });

    it('returns error when manifest is a string', async () => {
        const result = await handleUpdateManifest({ manifest: 'not-an-object' });
        expect(result.error).toContain('manifest object is required');
    });

    it('returns error when manifest is null', async () => {
        const result = await handleUpdateManifest({ manifest: null });
        expect(result.error).toContain('manifest object is required');
    });
});

// =============================================================================
// handleUpdateManifest — merge and save
// =============================================================================

describe('handleUpdateManifest — merge and save', () => {
    it('merges provided fields with existing manifest', async () => {
        const existing = { purpose: 'Old purpose', goals: ['old goal'], domains: ['x'], bridges: [], keyQuestions: [], autoBridge: false };
        mockQuery.mockResolvedValueOnce([{ value: JSON.stringify(existing) }]); // SELECT existing
        mockQuery.mockResolvedValue([]); // all subsequent INSERTs succeed

        const result = await handleUpdateManifest({ manifest: { purpose: 'New purpose' } });

        expect(result.success).toBe(true);
        expect(result.manifest.purpose).toBe('New purpose');
        expect(result.manifest.goals).toEqual(['old goal']); // preserved from existing
    });

    it('uses defaults when no existing manifest and fields not provided', async () => {
        mockQuery.mockResolvedValue([]); // no existing manifest, INSERTs succeed

        const result = await handleUpdateManifest({ manifest: { purpose: 'test' } });

        expect(result.manifest.goals).toEqual([]);
        expect(result.manifest.domains).toEqual([]);
        expect(result.manifest.bridges).toEqual([]);
        expect(result.manifest.autoBridge).toBe(false);
        expect(result.manifest.keyQuestions).toEqual([]);
    });

    it('returns error when save query throws', async () => {
        mockQuery
            .mockResolvedValueOnce([]) // SELECT existing
            .mockRejectedValueOnce(new Error('DB locked')); // INSERT fails

        const result = await handleUpdateManifest({ manifest: { purpose: 'test' } });

        expect(result.error).toContain('Failed to save manifest');
        expect(result.error).toContain('DB locked');
    });

    it('stores purpose in individual setting when provided', async () => {
        mockQuery.mockResolvedValue([]);

        await handleUpdateManifest({ manifest: { purpose: 'My purpose' } });

        const purposeCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.purpose'")
        );
        expect(purposeCall).toBeDefined();
        expect(purposeCall[1]).toContain('My purpose');
    });

    it('stores goals in individual setting when goals are non-empty', async () => {
        mockQuery.mockResolvedValue([]);

        await handleUpdateManifest({ manifest: { purpose: 'test', goals: ['goal1', 'goal2'] } });

        const goalsCall = (mockQuery.mock.calls as any[]).find(([sql, _params]) =>
            String(sql).includes("'project.goals'")
        );
        expect(goalsCall).toBeDefined();
        const stored = JSON.parse(goalsCall[1][0]);
        expect(stored).toEqual(['goal1', 'goal2']);
    });

    it('does not update individual purpose setting when purpose is empty', async () => {
        mockQuery.mockResolvedValue([]);

        await handleUpdateManifest({ manifest: { goals: ['g1'] } }); // no purpose

        const purposeCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.purpose'")
        );
        expect(purposeCall).toBeUndefined();
    });

    it('calls invalidateManifestCache after saving', async () => {
        mockQuery.mockResolvedValue([]);

        await handleUpdateManifest({ manifest: { purpose: 'test' } });

        expect(mockInvalidateManifestCache).toHaveBeenCalled();
    });

    it('returns success true with full updated manifest', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await handleUpdateManifest({
            manifest: {
                purpose: 'My project',
                goals: ['achieve something'],
                domains: ['science'],
                bridges: [['science', 'math']],
                autoBridge: true,
                keyQuestions: ['What is it?'],
                constraints: 'No scope creep',
            },
        });

        expect(result.success).toBe(true);
        expect(result.manifest.purpose).toBe('My project');
        expect(result.manifest.autoBridge).toBe(true);
        expect(result.manifest.constraints).toBe('No scope creep');
    });

    it('inserts into project.manifest with serialised JSON', async () => {
        mockQuery.mockResolvedValue([]);

        await handleUpdateManifest({ manifest: { purpose: 'Serialization test' } });

        const insertCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes('INSERT') && String(sql).includes("'project.manifest'")
        );
        expect(insertCall).toBeDefined();
        const parsed = JSON.parse(insertCall[1][0]);
        expect(parsed.purpose).toBe('Serialization test');
    });
});
