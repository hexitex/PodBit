/**
 * Unit tests for handlers/config-tune/know-thyself.ts
 *
 * Covers: ensureKnowThyselfPartition, seedTuningKnowledge, resetSeedingCache,
 *         formatConfigChangeSeed, formatOverfittingSeed, formatSnapshotSeed,
 *         computeOverfittingHash.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockSystemQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockCreateNode = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 'node-1' });
const mockCreateEdge = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined);
const mockInvalidateKnowledgeCache = jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQueryOne: mockSystemQueryOne,
    createNode: mockCreateNode,
    createEdge: mockCreateEdge,
}));

jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    invalidateKnowledgeCache: mockInvalidateKnowledgeCache,
}));

// Import the state object so we can reset it between tests
const { state } = await import('../../handlers/config-tune/types.js');

const {
    ensureKnowThyselfPartition,
    seedTuningKnowledge,
    resetSeedingCache,
    formatConfigChangeSeed,
    formatOverfittingSeed,
    formatSnapshotSeed,
    computeOverfittingHash,
} = await import('../../handlers/config-tune/know-thyself.js');

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQueryOne.mockResolvedValue(null);
    mockCreateNode.mockResolvedValue({ id: 'node-1' });
    mockCreateEdge.mockResolvedValue(undefined);
    mockInvalidateKnowledgeCache.mockResolvedValue(undefined);

    // Reset module state
    state.knowThyselfInitialized = false;
    state.lastOverfittingHash = null;
    state.pendingMetricsFollow = null;
    resetSeedingCache();
});

/* ================================================================== */
/* ensureKnowThyselfPartition                                         */
/* ================================================================== */

describe('ensureKnowThyselfPartition', () => {
    it('short-circuits when already initialized', async () => {
        state.knowThyselfInitialized = true;
        await ensureKnowThyselfPartition();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('marks initialized and skips DB when seeding is disabled', async () => {
        mockSystemQueryOne.mockResolvedValue(null); // no setting → disabled
        await ensureKnowThyselfPartition();
        expect(state.knowThyselfInitialized).toBe(true);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('creates partition and domain when seeding is enabled', async () => {
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            if (params?.[0] === 'knowthyself.overfittingHash') return null;
            return null;
        });

        await ensureKnowThyselfPartition();

        expect(state.knowThyselfInitialized).toBe(true);
        // Should upsert partition
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO domain_partitions'),
            expect.arrayContaining(['know-thyself'])
        );
        // Should insert tuning domain
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO partition_domains'),
            ['know-thyself', 'tuning']
        );
    });

    it('reclaims tuning domain from stale partition', async () => {
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: '1' };
            return null;
        });
        // First queryOne call: stale assignment exists
        mockQueryOne
            .mockResolvedValueOnce({ partition_id: 'stale-partition' })
            // Second queryOne call: stale partition is now empty
            .mockResolvedValueOnce({ cnt: '0' });

        await ensureKnowThyselfPartition();

        // Should delete tuning from stale partition
        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM partition_domains WHERE domain = $1 AND partition_id = $2',
            ['tuning', 'stale-partition']
        );
        // Should delete bridges to stale partition
        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM partition_bridges WHERE partition_a = $1 OR partition_b = $1',
            ['stale-partition']
        );
        // Should delete stale partition itself (empty)
        expect(mockQuery).toHaveBeenCalledWith(
            'DELETE FROM domain_partitions WHERE id = $1',
            ['stale-partition']
        );
    });

    it('does not delete stale partition if it still has domains', async () => {
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            return null;
        });
        mockQueryOne
            .mockResolvedValueOnce({ partition_id: 'stale-partition' })
            .mockResolvedValueOnce({ cnt: '2' }); // still has domains

        await ensureKnowThyselfPartition();

        // Should NOT delete the partition itself
        const deleteCalls = mockQuery.mock.calls.filter(
            (c: any) => typeof c[0] === 'string' && c[0].includes('DELETE FROM domain_partitions')
        );
        expect(deleteCalls).toHaveLength(0);
    });

    it('restores persisted overfitting hash', async () => {
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            if (params?.[0] === 'knowthyself.overfittingHash') return { value: 'abc123' };
            return null;
        });

        await ensureKnowThyselfPartition();
        expect(state.lastOverfittingHash).toBe('abc123');
    });

    it('handles partition init failure gracefully', async () => {
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            return null;
        });
        mockQuery.mockRejectedValue(new Error('DB error'));

        // Should not throw
        await ensureKnowThyselfPartition();
        // knowThyselfInitialized remains false when init fails
        expect(state.knowThyselfInitialized).toBe(false);
    });

    it('caches seeding check for 60 seconds', async () => {
        mockSystemQueryOne.mockResolvedValue(null); // disabled
        await ensureKnowThyselfPartition();
        expect(state.knowThyselfInitialized).toBe(true);

        // Reset state but NOT the seeding cache
        state.knowThyselfInitialized = false;
        mockSystemQueryOne.mockResolvedValue({ value: 'true' }); // now "enabled"

        await ensureKnowThyselfPartition();
        // Should still see disabled (cached) → no query calls
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

/* ================================================================== */
/* seedTuningKnowledge                                                */
/* ================================================================== */

describe('seedTuningKnowledge', () => {
    beforeEach(() => {
        // Enable seeding for seed tests
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            return null;
        });
    });

    it('returns null when seeding is disabled', async () => {
        resetSeedingCache();
        mockSystemQueryOne.mockResolvedValue(null); // disabled
        const result = await seedTuningKnowledge({ content: 'Test content that is long enough' });
        expect(result).toBeNull();
        expect(mockCreateNode).not.toHaveBeenCalled();
    });

    it('returns null for content shorter than 20 chars', async () => {
        const result = await seedTuningKnowledge({ content: 'Too short' });
        expect(result).toBeNull();
        expect(mockCreateNode).not.toHaveBeenCalled();
    });

    it('creates a node with correct defaults', async () => {
        const result = await seedTuningKnowledge({
            content: 'Tuning change: increased resonance threshold from 0.35 to 0.55',
        });

        expect(result).toBe('node-1');
        expect(mockCreateNode).toHaveBeenCalledWith(
            'Tuning change: increased resonance threshold from 0.35 to 0.55',
            'seed',
            'config-tune',
            expect.objectContaining({
                domain: 'tuning',
                contributor: 'system',
                salience: 0.6,
                trajectory: 'knowledge',
            })
        );
    });

    it('uses provided nodeType and salience', async () => {
        await seedTuningKnowledge({
            content: 'A synthesis about tuning behavior and outcomes',
            nodeType: 'synthesis',
            salience: 0.8,
            contributor: 'human:admin',
        });

        expect(mockCreateNode).toHaveBeenCalledWith(
            expect.any(String),
            'synthesis',
            'config-tune',
            expect.objectContaining({
                contributor: 'human:admin',
                decidedByTier: 'human',
                salience: 0.8,
            })
        );
    });

    it('sets decidedByTier to system for non-human contributors', async () => {
        await seedTuningKnowledge({
            content: 'System auto-tuning generated this knowledge node',
            contributor: 'auto-tune',
        });

        expect(mockCreateNode).toHaveBeenCalledWith(
            expect.any(String),
            'seed',
            'config-tune',
            expect.objectContaining({ decidedByTier: 'system' })
        );
    });

    it('truncates content over 2000 chars at sentence boundary', async () => {
        const longContent = 'A'.repeat(1990) + '. More text after period. Even more text.';
        await seedTuningKnowledge({ content: longContent });

        const calledContent = mockCreateNode.mock.calls[0]![0] as string;
        expect(calledContent.length).toBeLessThanOrEqual(2000);
        expect(calledContent.endsWith('.')).toBe(true);
    });

    it('creates parent edges when parentIds are provided', async () => {
        await seedTuningKnowledge({
            content: 'This is child content linked to parent nodes',
            parentIds: ['parent-1', 'parent-2'],
        });

        expect(mockCreateEdge).toHaveBeenCalledTimes(2);
        expect(mockCreateEdge).toHaveBeenCalledWith('parent-1', 'node-1', 'parent');
        expect(mockCreateEdge).toHaveBeenCalledWith('parent-2', 'node-1', 'parent');
    });

    it('ignores edge creation failure for missing parents', async () => {
        mockCreateEdge.mockRejectedValueOnce(new Error('parent not found'));
        const result = await seedTuningKnowledge({
            content: 'Content with a missing parent reference',
            parentIds: ['missing-parent'],
        });
        // Should still succeed
        expect(result).toBe('node-1');
    });

    it('invalidates knowledge cache after seeding', async () => {
        await seedTuningKnowledge({ content: 'Content that triggers cache invalidation' });
        expect(mockInvalidateKnowledgeCache).toHaveBeenCalledWith('tuning');
    });

    it('returns null when createNode returns null', async () => {
        mockCreateNode.mockResolvedValue(null);
        const result = await seedTuningKnowledge({
            content: 'Content that fails to create a node',
        });
        expect(result).toBeNull();
    });

    it('returns null on createNode error', async () => {
        mockCreateNode.mockRejectedValue(new Error('DB error'));
        const result = await seedTuningKnowledge({
            content: 'Content that triggers a DB error during creation',
        });
        expect(result).toBeNull();
    });

    it('does not create edges when parentIds is empty', async () => {
        await seedTuningKnowledge({
            content: 'Content with empty parentIds array',
            parentIds: [],
        });
        expect(mockCreateEdge).not.toHaveBeenCalled();
    });
});

/* ================================================================== */
/* formatConfigChangeSeed                                              */
/* ================================================================== */

describe('formatConfigChangeSeed', () => {
    it('formats increase with metrics', () => {
        const result = formatConfigChangeSeed(
            [{ configPath: ['quality', 'resonanceThreshold'], oldValue: 0.35, newValue: 0.55, label: 'Resonance Threshold' }],
            'improve quality',
            { synthesisSuccessRate: 0.25, totalNodes: 100, avgSpecificity: 3.5 },
            'claude'
        );
        expect(result).toContain('increased Resonance Threshold');
        expect(result).toContain('from 0.35 to 0.55');
        expect(result).toContain('Reason: improve quality');
        expect(result).toContain('25.0%');
        expect(result).toContain('100 active nodes');
        expect(result).toContain('avg specificity 3.50');
        expect(result).toContain('by claude');
    });

    it('formats decrease', () => {
        const result = formatConfigChangeSeed(
            [{ configPath: ['quality', 'maxOutputWords'], oldValue: 50, newValue: 30, label: 'Max Words' }],
            null,
            { synthesisSuccessRate: 0.1, totalNodes: 50, avgSpecificity: 2.0 },
            'system'
        );
        expect(result).toContain('decreased Max Words');
        expect(result).not.toContain('Reason:');
    });

    it('formats multiple changes', () => {
        const result = formatConfigChangeSeed(
            [
                { configPath: ['a'], oldValue: 1, newValue: 2, label: 'Param A' },
                { configPath: ['b'], oldValue: 10, newValue: 5, label: 'Param B' },
            ],
            null,
            { synthesisSuccessRate: null },
            'human'
        );
        expect(result).toContain('increased Param A');
        expect(result).toContain('decreased Param B');
        expect(result).toContain('Metrics unavailable');
    });

    it('handles unavailable specificity', () => {
        const result = formatConfigChangeSeed(
            [{ configPath: ['x'], oldValue: 1, newValue: 2, label: 'X' }],
            null,
            { synthesisSuccessRate: 0.5, totalNodes: 10, avgSpecificity: null },
            'system'
        );
        expect(result).toContain('unknown');
    });
});

/* ================================================================== */
/* formatOverfittingSeed                                               */
/* ================================================================== */

describe('formatOverfittingSeed', () => {
    it('formats quality plateau signal', () => {
        const result = formatOverfittingSeed({
            qualityPlateau: true,
            recentSuccessRate: 0.12,
            improvementPct: 0.5,
            recommendation: 'lower thresholds',
        });
        expect(result).toContain('quality plateau detected');
        expect(result).toContain('12.0%');
        expect(result).toContain('0.5% change');
        expect(result).toContain('lower thresholds');
    });

    it('formats diversity collapse', () => {
        const result = formatOverfittingSeed({
            diversityCollapse: true,
            recentSuccessRate: 0.1,
            recommendation: 'seed more domains',
        });
        expect(result).toContain('diversity collapse');
    });

    it('formats genuine metric oscillation', () => {
        const result = formatOverfittingSeed({
            metricOscillation: true,
            oscillationMitigated: false,
            oscillatingParameters: ['quality.resonanceThreshold', 'quality.maxOutputWords'],
            recentSuccessRate: 0.08,
            recommendation: 'stop tuning',
        });
        expect(result).toContain('genuine metric oscillation');
        expect(result).toContain('quality.resonanceThreshold, quality.maxOutputWords');
    });

    it('formats mitigated oscillation with environment changes', () => {
        const result = formatOverfittingSeed({
            metricOscillation: true,
            oscillationMitigated: true,
            environmentChanges: { signals: ['model changed', 'graph grew 50%'] },
            recentSuccessRate: 0.1,
            recommendation: 'continue monitoring',
        });
        expect(result).toContain('mitigated by environment changes');
        expect(result).toContain('model changed; graph grew 50%');
        expect(result).toContain('adaptive tuning');
    });

    it('formats mitigated oscillation without environment signals', () => {
        const result = formatOverfittingSeed({
            metricOscillation: true,
            oscillationMitigated: true,
            environmentChanges: { signals: [] },
            recentSuccessRate: 0.1,
            recommendation: 'ok',
        });
        expect(result).toContain('mitigated by environment changes');
        expect(result).not.toContain('(');
    });

    it('formats converging parameters', () => {
        const result = formatOverfittingSeed({
            convergingParameters: [
                { configPath: 'quality.resonanceThreshold', bestValue: 0.45, impactRatio: 3.2 },
            ],
            recentSuccessRate: 0.1,
            recommendation: 'lock converged params',
        });
        expect(result).toContain('behavioral convergence');
        expect(result).toContain('quality.resonanceThreshold converging toward 0.45');
        expect(result).toContain('3.2x impact ratio');
    });

    it('formats healthy rejection rate', () => {
        const result = formatOverfittingSeed({
            rejectionRateHealthy: true,
            recentSuccessRate: 0.1,
            recommendation: 'no changes needed',
        });
        expect(result).toContain('rejection rate healthy at 10.0%');
    });

    it('formats low success rate below 5% floor', () => {
        const result = formatOverfittingSeed({
            recentSuccessRate: 0.03,
            recommendation: 'increase thresholds',
        });
        expect(result).toContain('low success rate at 3.0%');
        expect(result).toContain('below the 5% floor');
    });

    it('formats high success rate above 15% ceiling', () => {
        const result = formatOverfittingSeed({
            recentSuccessRate: 0.2,
            recommendation: 'tighten quality gates',
        });
        expect(result).toContain('high success rate at 20.0%');
        expect(result).toContain('above the 15% ceiling');
    });

    it('combines multiple signals', () => {
        const result = formatOverfittingSeed({
            qualityPlateau: true,
            diversityCollapse: true,
            recentSuccessRate: 0.12,
            improvementPct: 1.0,
            recommendation: 'major intervention needed',
        });
        expect(result).toContain('quality plateau');
        expect(result).toContain('diversity collapse');
        expect(result).toContain('major intervention needed');
    });
});

/* ================================================================== */
/* formatSnapshotSeed                                                  */
/* ================================================================== */

describe('formatSnapshotSeed', () => {
    it('formats save action with metrics', () => {
        const result = formatSnapshotSeed(
            'save',
            'baseline-v1',
            { synthesisSuccessRate: 0.15, avgResonance: 0.432, totalNodes: 200 },
            undefined,
            'claude'
        );
        expect(result).toContain('snapshot saved');
        expect(result).toContain('"baseline-v1"');
        expect(result).toContain('by claude');
        expect(result).toContain('15.0%');
        expect(result).toContain('0.432');
        expect(result).toContain('200 nodes');
        expect(result).toContain('restoration point');
    });

    it('formats restore action with parameter count', () => {
        const result = formatSnapshotSeed(
            'restore',
            'baseline-v1',
            { synthesisSuccessRate: 0.1, avgResonance: 0.4, totalNodes: 100 },
            12,
            'admin'
        );
        expect(result).toContain('snapshot restored');
        expect(result).toContain('"baseline-v1"');
        expect(result).toContain('12 parameters changed');
        expect(result).toContain('reverted');
    });

    it('handles unavailable metrics', () => {
        const result = formatSnapshotSeed('save', 'test', { synthesisSuccessRate: null });
        expect(result).toContain('Metrics unavailable');
    });

    it('defaults contributor to unknown', () => {
        const result = formatSnapshotSeed('save', 'test', { synthesisSuccessRate: null });
        expect(result).toContain('by unknown');
    });

    it('handles null avgResonance', () => {
        const result = formatSnapshotSeed(
            'save', 'snap',
            { synthesisSuccessRate: 0.1, avgResonance: null, totalNodes: 5 },
            undefined, 'x'
        );
        expect(result).toContain('unknown');
    });
});

/* ================================================================== */
/* computeOverfittingHash                                              */
/* ================================================================== */

describe('computeOverfittingHash', () => {
    it('produces deterministic hash for same input', () => {
        const input = {
            qualityPlateau: true,
            diversityCollapse: false,
            metricOscillation: true,
            oscillationMitigated: false,
            oscillatingParameters: ['a', 'b'],
            convergingParameters: [],
            recentSuccessRate: 0.12,
        };
        const hash1 = computeOverfittingHash(input);
        const hash2 = computeOverfittingHash(input);
        expect(hash1).toBe(hash2);
    });

    it('includes all relevant fields in hash', () => {
        const hash = computeOverfittingHash({
            qualityPlateau: true,
            diversityCollapse: true,
            metricOscillation: true,
            oscillationMitigated: true,
            oscillatingParameters: ['x'],
            convergingParameters: [{ configPath: 'a', bestValue: '1' }],
            recentSuccessRate: 0.1,
        });
        expect(hash).toContain('1|1|1|m');
        expect(hash).toContain('x');
        expect(hash).toContain('a:1');
        expect(hash).toContain('10');
    });

    it('differs when qualityPlateau changes', () => {
        const base = {
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            oscillationMitigated: false,
            oscillatingParameters: [],
            convergingParameters: [],
            recentSuccessRate: 0.1,
        };
        const h1 = computeOverfittingHash(base);
        const h2 = computeOverfittingHash({ ...base, qualityPlateau: true });
        expect(h1).not.toBe(h2);
    });

    it('differs when success rate changes', () => {
        const base = {
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            oscillationMitigated: false,
            oscillatingParameters: [],
            convergingParameters: [],
            recentSuccessRate: 0.1,
        };
        const h1 = computeOverfittingHash(base);
        const h2 = computeOverfittingHash({ ...base, recentSuccessRate: 0.2 });
        expect(h1).not.toBe(h2);
    });

    it('sorts oscillating parameters for consistency', () => {
        const base = {
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            oscillationMitigated: false,
            convergingParameters: [],
            recentSuccessRate: 0.1,
        };
        const h1 = computeOverfittingHash({ ...base, oscillatingParameters: ['b', 'a'] });
        const h2 = computeOverfittingHash({ ...base, oscillatingParameters: ['a', 'b'] });
        expect(h1).toBe(h2);
    });

    it('sorts converging parameters for consistency', () => {
        const base = {
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            oscillationMitigated: false,
            oscillatingParameters: [],
            recentSuccessRate: 0.1,
        };
        const cp1 = [{ configPath: 'b', bestValue: '2' }, { configPath: 'a', bestValue: '1' }];
        const cp2 = [{ configPath: 'a', bestValue: '1' }, { configPath: 'b', bestValue: '2' }];
        const h1 = computeOverfittingHash({ ...base, convergingParameters: cp1 });
        const h2 = computeOverfittingHash({ ...base, convergingParameters: cp2 });
        expect(h1).toBe(h2);
    });

    it('handles missing optional fields', () => {
        const hash = computeOverfittingHash({
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: false,
            recentSuccessRate: 0.05,
        });
        expect(hash).toBeDefined();
        expect(hash).toContain('0|0|0');
    });

    it('uses m for mitigated oscillation', () => {
        const hash = computeOverfittingHash({
            qualityPlateau: false,
            diversityCollapse: false,
            metricOscillation: true,
            oscillationMitigated: true,
            oscillatingParameters: [],
            convergingParameters: [],
            recentSuccessRate: 0.1,
        });
        expect(hash).toContain('|m|');
    });
});

/* ================================================================== */
/* resetSeedingCache                                                   */
/* ================================================================== */

describe('resetSeedingCache', () => {
    it('allows re-checking seeding status after reset', async () => {
        // First call: disabled
        mockSystemQueryOne.mockResolvedValue(null);
        const r1 = await seedTuningKnowledge({ content: 'First attempt at seeding knowledge' });
        expect(r1).toBeNull();

        // Reset cache and enable
        resetSeedingCache();
        mockSystemQueryOne.mockImplementation(async (_sql: any, params?: any) => {
            if (params?.[0] === 'knowThyself.seedingEnabled') return { value: 'true' };
            return null;
        });

        const r2 = await seedTuningKnowledge({ content: 'Second attempt should now work fine' });
        expect(r2).toBe('node-1');
    });
});
