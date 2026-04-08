/**
 * Unit tests for core/project-context.ts — project manifest cache and context block.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    queryOne: mockQueryOne,
}));

const {
    getProjectManifest,
    invalidateManifestCache,
    getProjectContextBlock,
} = await import('../../core/project-context.js');

const SAMPLE_MANIFEST = {
    purpose: 'Investigate emergent properties of complex systems',
    domains: ['complexity', 'emergence'],
    goals: ['Find universal patterns', 'Build predictive models'],
    bridges: [['complexity', 'emergence']],
    autoBridge: true,
    keyQuestions: ['What triggers phase transitions?'],
    constraints: ['Focus on biological systems'],
};

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    invalidateManifestCache();
});

// =============================================================================
// getProjectManifest
// =============================================================================

describe('getProjectManifest', () => {
    it('returns null when no manifest is stored', async () => {
        mockQueryOne.mockResolvedValue(null);
        const result = await getProjectManifest();
        expect(result).toBeNull();
    });

    it('parses and returns manifest from DB row', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });

        const result = await getProjectManifest();

        expect(result).toEqual(SAMPLE_MANIFEST);
        expect(result!.purpose).toBe('Investigate emergent properties of complex systems');
        expect(result!.domains).toEqual(['complexity', 'emergence']);
    });

    it('caches the result (no second DB call within TTL)', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });

        await getProjectManifest();
        await getProjectManifest();

        // Only one DB call despite two invocations
        expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });

    it('re-queries DB after invalidateManifestCache()', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });

        await getProjectManifest();
        invalidateManifestCache();
        await getProjectManifest();

        expect(mockQueryOne).toHaveBeenCalledTimes(2);
    });

    it('returns null and caches null when DB throws', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB error'));

        const result = await getProjectManifest();
        expect(result).toBeNull();

        // Second call uses cache — no second DB attempt
        await getProjectManifest();
        expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// getProjectContextBlock
// =============================================================================

describe('getProjectContextBlock', () => {
    it('returns empty string when no manifest exists', async () => {
        mockQueryOne.mockResolvedValue(null);
        const block = await getProjectContextBlock();
        expect(block).toBe('');
    });

    it('returns empty string when manifest has no purpose', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify({ purpose: '', domains: [] }) });
        const block = await getProjectContextBlock();
        expect(block).toBe('');
    });

    it('includes purpose line', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });
        const block = await getProjectContextBlock();
        expect(block).toContain('Investigate emergent properties of complex systems');
    });

    it('includes domains with disambiguation warning', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });
        const block = await getProjectContextBlock();
        expect(block).toContain('complexity, emergence');
        expect(block).toContain('project-specific labels');
    });

    it('includes goals', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });
        const block = await getProjectContextBlock();
        expect(block).toContain('Find universal patterns');
        expect(block).toContain('Build predictive models');
    });

    it('includes key questions', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });
        const block = await getProjectContextBlock();
        expect(block).toContain('What triggers phase transitions?');
    });

    it('includes constraints when present', async () => {
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(SAMPLE_MANIFEST) });
        const block = await getProjectContextBlock();
        expect(block).toContain('Focus on biological systems');
    });

    it('omits optional fields when absent', async () => {
        const minimal = { purpose: 'Simple purpose', domains: [], goals: [], bridges: [], autoBridge: false, keyQuestions: [] };
        mockQueryOne.mockResolvedValue({ value: JSON.stringify(minimal) });
        const block = await getProjectContextBlock();
        expect(block).toContain('Simple purpose');
        expect(block).not.toContain('Goals:');
        expect(block).not.toContain('Key questions:');
        expect(block).not.toContain('Constraints:');
        expect(block).not.toContain('Pipeline mode:');
    });
});
