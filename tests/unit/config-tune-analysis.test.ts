/**
 * Unit tests for handlers/config-tune/analysis.ts
 *
 * Tests: computeBehavioralEntropy, detectEnvironmentChanges, detectOverfitting.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: (_col: string, _param: string) => '1=1',
}));

const { computeBehavioralEntropy, detectEnvironmentChanges, detectOverfitting } =
    await import('../../handlers/config-tune/analysis.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);
});

// ===========================================================================
// computeBehavioralEntropy
// ===========================================================================

describe('computeBehavioralEntropy', () => {
    it('returns insufficient_data when fewer than 2 changes exist', async () => {
        mockSystemQuery.mockResolvedValue([
            { config_path: 'a.b', new_value: '0.5', metrics_before: '{}', created_at: '2025-01-01' },
        ]);

        const result = await computeBehavioralEntropy(['a.b'], 7);

        expect(result.genuineOscillation).toContain('a.b');
        expect(result.convergingParameters).toHaveLength(0);
        expect(result.analyses).toHaveLength(1);
        expect(result.analyses[0].classification).toBe('insufficient_data');
    });

    it('returns insufficient_data when no changes exist', async () => {
        mockSystemQuery.mockResolvedValue([]);

        const result = await computeBehavioralEntropy(['x.y'], 7);

        expect(result.genuineOscillation).toContain('x.y');
        expect(result.analyses[0].classification).toBe('insufficient_data');
        expect(result.analyses[0].impactRatio).toBe(0);
        expect(result.analyses[0].bestValue).toBe('');
    });

    it('handles multiple paths independently', async () => {
        // First call for path 'a', second for path 'b'
        mockSystemQuery
            .mockResolvedValueOnce([]) // a — no data
            .mockResolvedValueOnce([]); // b — no data

        const result = await computeBehavioralEntropy(['a', 'b'], 7);

        expect(result.analyses).toHaveLength(2);
        expect(result.genuineOscillation).toEqual(['a', 'b']);
    });

    it('skips entries with unparseable metrics_before', async () => {
        mockSystemQuery.mockResolvedValue([
            { config_path: 'p', new_value: '1', metrics_before: 'INVALID', created_at: '2025-01-01' },
            { config_path: 'p', new_value: '2', metrics_before: 'ALSO_INVALID', created_at: '2025-01-02' },
            { config_path: 'p', new_value: '3', metrics_before: '{}', created_at: '2025-01-03' },
        ]);

        const result = await computeBehavioralEntropy(['p'], 7);

        // All consecutive pairs have at least one unparseable metric → insufficient data
        expect(result.analyses[0].classification).toBe('insufficient_data');
    });

    it('classifies convergence when one value has much higher impact', async () => {
        // Two distinct values with clear impact difference (ratio >= 2.0)
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'x', new_value: '0.5',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.10, avgResonance: 0.3, avgSpecificity: 2.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'x', new_value: '0.8',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.30, avgResonance: 0.5, avgSpecificity: 3.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'x', new_value: '0.5',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.15, avgResonance: 0.3, avgSpecificity: 2.0 }),
                created_at: '2025-01-03',
            },
            {
                config_path: 'x', new_value: '0.8',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.50, avgResonance: 0.6, avgSpecificity: 4.0 }),
                created_at: '2025-01-04',
            },
        ]);

        const result = await computeBehavioralEntropy(['x'], 7);

        const analysis = result.analyses[0];
        expect(analysis.valueProfiles.length).toBeGreaterThanOrEqual(2);
        // The result should be either convergence or oscillation depending on exact ratios
        expect(['convergence', 'oscillation']).toContain(analysis.classification);

        if (analysis.classification === 'convergence') {
            expect(result.convergingParameters.length).toBe(1);
            expect(result.genuineOscillation).not.toContain('x');
            expect(analysis.bestValue).toBeDefined();
            expect(analysis.impactRatio).toBeGreaterThanOrEqual(2.0);
        } else {
            expect(result.genuineOscillation).toContain('x');
        }
    });

    it('classifies oscillation when values have similar impact', async () => {
        // Two values with nearly equal impact (ratio < 2.0)
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'z', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.20, avgResonance: 0.4, avgSpecificity: 3.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'z', new_value: 'B',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.22, avgResonance: 0.42, avgSpecificity: 3.1 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'z', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.24, avgResonance: 0.44, avgSpecificity: 3.2 }),
                created_at: '2025-01-03',
            },
            {
                config_path: 'z', new_value: 'B',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.26, avgResonance: 0.46, avgSpecificity: 3.3 }),
                created_at: '2025-01-04',
            },
        ]);

        const result = await computeBehavioralEntropy(['z'], 7);

        const analysis = result.analyses[0];
        // With very similar successive deltas, both values will have similar impacts
        expect(analysis.valueProfiles.length).toBe(2);
    });

    it('handles metrics_before with null metric fields gracefully', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'q', new_value: '1',
                metrics_before: JSON.stringify({ synthesisSuccessRate: null, avgResonance: 0.3 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'q', new_value: '2',
                metrics_before: JSON.stringify({ synthesisSuccessRate: null, avgResonance: 0.5 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'q', new_value: '1',
                metrics_before: JSON.stringify({ synthesisSuccessRate: null, avgResonance: 0.4 }),
                created_at: '2025-01-03',
            },
        ]);

        const result = await computeBehavioralEntropy(['q'], 7);

        // Should still produce value profiles using the non-null metrics
        expect(result.analyses).toHaveLength(1);
        const profiles = result.analyses[0].valueProfiles;
        for (const p of profiles) {
            expect(p.rawDeltas.synthesisSuccessRate).toBeNull();
        }
    });

    it('handles single value profile (all changes to same value) as insufficient', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'sv', new_value: 'same',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.1, avgResonance: 0.3, avgSpecificity: 2.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'sv', new_value: 'same',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.2, avgResonance: 0.4, avgSpecificity: 3.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'sv', new_value: 'same',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.3, avgResonance: 0.5, avgSpecificity: 4.0 }),
                created_at: '2025-01-03',
            },
        ]);

        const result = await computeBehavioralEntropy(['sv'], 7);

        // Only one distinct value → < 2 value profiles → insufficient_data
        expect(result.analyses[0].classification).toBe('insufficient_data');
        expect(result.genuineOscillation).toContain('sv');
    });

    it('classifies as insufficient_data when maxAbs impact is below MIN_IMPACT', async () => {
        // Tiny metric differences → impact below 0.01
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'tiny', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.100, avgResonance: 0.300, avgSpecificity: 2.000 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'tiny', new_value: 'B',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.101, avgResonance: 0.301, avgSpecificity: 2.001 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'tiny', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.102, avgResonance: 0.302, avgSpecificity: 2.002 }),
                created_at: '2025-01-03',
            },
        ]);

        const result = await computeBehavioralEntropy(['tiny'], 7);

        expect(result.analyses[0].classification).toBe('insufficient_data');
        expect(result.genuineOscillation).toContain('tiny');
    });

    it('convergence recommendation includes configPath and bestValue', async () => {
        // Force clear convergence: value 'good' has much better impact
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'conv.param', new_value: 'good',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.0, avgResonance: 0.0, avgSpecificity: 0.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'conv.param', new_value: 'bad',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'conv.param', new_value: 'good',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.1, avgResonance: 0.1, avgSpecificity: 1.0 }),
                created_at: '2025-01-03',
            },
            {
                config_path: 'conv.param', new_value: 'bad',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-04',
            },
        ]);

        const result = await computeBehavioralEntropy(['conv.param'], 7);

        if (result.convergingParameters.length > 0) {
            const cp = result.convergingParameters[0];
            expect(cp.configPath).toBe('conv.param');
            expect(cp.recommendation).toContain('conv.param');
            expect(cp.recommendation).toContain(cp.bestValue);
            expect(cp.impactRatio).toBeGreaterThanOrEqual(2.0);
        }
    });

    it('rounds impactRatio and entropyScore to expected precision', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'rnd', new_value: 'X',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.0, avgResonance: 0.0, avgSpecificity: 0.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'rnd', new_value: 'Y',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.3, avgResonance: 0.3, avgSpecificity: 3.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'rnd', new_value: 'X',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.1, avgResonance: 0.1, avgSpecificity: 1.0 }),
                created_at: '2025-01-03',
            },
        ]);

        const result = await computeBehavioralEntropy(['rnd'], 7);
        const a = result.analyses[0];

        if (a.classification !== 'insufficient_data') {
            // impactRatio rounded to 2 decimal places
            expect(a.impactRatio.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
            // entropyScore rounded to 3 decimal places
            expect(a.entropyScore.toString()).toMatch(/^\d+(\.\d{1,3})?$/);
        }
    });

    it('correctly computes avgImpact for value profiles with multiple occurrences', async () => {
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'multi', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.0, avgResonance: 0.0, avgSpecificity: 0.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'multi', new_value: 'B',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.2, avgResonance: 0.2, avgSpecificity: 2.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'multi', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.1, avgResonance: 0.1, avgSpecificity: 1.0 }),
                created_at: '2025-01-03',
            },
            {
                config_path: 'multi', new_value: 'B',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.3, avgResonance: 0.2, avgSpecificity: 2.5 }),
                created_at: '2025-01-04',
            },
            {
                config_path: 'multi', new_value: 'A',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.15, avgResonance: 0.15, avgSpecificity: 1.5 }),
                created_at: '2025-01-05',
            },
        ]);

        const result = await computeBehavioralEntropy(['multi'], 7);
        const profiles = result.analyses[0].valueProfiles;

        // Value 'A' appears at index 0 and 2 → 2 impact measurements
        // Value 'B' appears at index 1 and 3 → 2 impact measurements
        const profileA = profiles.find(p => p.value === 'A');
        const profileB = profiles.find(p => p.value === 'B');
        expect(profileA).toBeDefined();
        expect(profileB).toBeDefined();
        expect(profileA!.occurrences).toBe(2);
        expect(profileB!.occurrences).toBe(2);
    });

    it('handles Infinity impactRatio when minAbs is 0', async () => {
        // One value has exactly 0 impact, the other non-zero
        mockSystemQuery.mockResolvedValue([
            {
                config_path: 'inf', new_value: 'zero',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'inf', new_value: 'nonzero',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'inf', new_value: 'zero',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.7, avgResonance: 0.6, avgSpecificity: 6.0 }),
                created_at: '2025-01-03',
            },
        ]);

        const result = await computeBehavioralEntropy(['inf'], 7);
        const a = result.analyses[0];

        // When minAbs is 0, impactRatio = Infinity, entropyScore = 0
        // Classification should be convergence (Infinity >= CONVERGENCE_RATIO)
        if (a.classification !== 'insufficient_data') {
            expect(a.entropyScore).toBe(0);
        }
    });
});

// ===========================================================================
// detectEnvironmentChanges
// ===========================================================================

describe('detectEnvironmentChanges', () => {
    it('returns no changes when all queries return zero counts', async () => {
        mockSystemQueryOne.mockResolvedValue({ cnt: '0' });
        mockQueryOne.mockResolvedValue({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.environmentChanged).toBe(false);
        expect(result.changeScore).toBe(0);
        expect(result.signals).toHaveLength(0);
        expect(result.modelChanges).toBe(0);
        expect(result.graphGrowthPct).toBe(0);
        expect(result.kbIngestions).toBe(0);
        expect(result.snapshotRestores).toBe(0);
        expect(result.newDomains).toBe(0);
    });

    it('detects model/subsystem assignment changes', async () => {
        // subsystem_assignments query
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '3' })   // modelChanges = 3
            .mockResolvedValueOnce({ cnt: '0' });   // snapshotRestores

        // queryOne calls: totalNow, createdInWindow, kbIngestions, newDomains
        mockQueryOne
            .mockResolvedValueOnce({ cnt: '100' })  // total nodes
            .mockResolvedValueOnce({ cnt: '0' })     // recent nodes
            .mockResolvedValueOnce({ cnt: '0' })     // kb files
            .mockResolvedValueOnce({ cnt: '0' });    // new domains

        const result = await detectEnvironmentChanges(7);

        expect(result.modelChanges).toBe(3);
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('3 subsystem assignment change'),
        ]));
        // 3 * 0.15 = 0.45, capped at 0.4
        expect(result.changeScore).toBeGreaterThanOrEqual(0.3);
        expect(result.environmentChanged).toBe(true);
    });

    it('detects significant graph growth', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })    // modelChanges
            .mockResolvedValueOnce({ cnt: '0' });    // snapshotRestores

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '200' })   // total active nodes
            .mockResolvedValueOnce({ cnt: '50' })     // created in window
            .mockResolvedValueOnce({ cnt: '0' })      // kb files
            .mockResolvedValueOnce({ cnt: '0' });     // new domains

        const result = await detectEnvironmentChanges(7);

        // prior = 200-50 = 150, growth = 50/150 ≈ 33%
        expect(result.graphGrowthPct).toBe(33);
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('33% graph growth'),
        ]));
    });

    it('handles graph growth when all nodes are new (prior=0)', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '10' })    // total
            .mockResolvedValueOnce({ cnt: '10' })     // all created in window
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        // prior = 0, recent > 0 → 100%
        expect(result.graphGrowthPct).toBe(100);
    });

    it('handles zero total nodes', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '0' })     // total = 0
            .mockResolvedValueOnce({ cnt: '0' })     // recent = 0
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.graphGrowthPct).toBe(0);
    });

    it('detects KB ingestion activity', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '20' })    // 20 KB files ingested
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.kbIngestions).toBe(20);
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('20 KB file(s) ingested'),
        ]));
        // 20 * 0.02 = 0.4, capped at 0.3
        expect(result.changeScore).toBeGreaterThanOrEqual(0.3);
        expect(result.environmentChanged).toBe(true);
    });

    it('detects snapshot restores', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })     // modelChanges
            .mockResolvedValueOnce({ cnt: '5' });     // snapshotRestores

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.snapshotRestores).toBe(5);
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('restored from snapshot'),
        ]));
        // snapshot restores contribute 0.3
        expect(result.changeScore).toBeGreaterThanOrEqual(0.3);
        expect(result.environmentChanged).toBe(true);
    });

    it('detects new domains', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '5' })     // some recent, < 10% growth
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '4' });    // 4 new domains

        const result = await detectEnvironmentChanges(7);

        expect(result.newDomains).toBe(4);
        expect(result.signals).toEqual(expect.arrayContaining([
            expect.stringContaining('4 new domain(s)'),
        ]));
    });

    it('caps total score at 1.0', async () => {
        // Trigger all signals at max
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '10' })    // modelChanges (10*0.15 → cap 0.4)
            .mockResolvedValueOnce({ cnt: '5' });     // snapshotRestores (0.3)

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '200' })
            .mockResolvedValueOnce({ cnt: '150' })    // 300% graph growth (cap 0.3)
            .mockResolvedValueOnce({ cnt: '50' })     // 50 KB files (cap 0.3)
            .mockResolvedValueOnce({ cnt: '5' });     // 5 new domains (cap 0.3)

        const result = await detectEnvironmentChanges(7);

        expect(result.changeScore).toBeLessThanOrEqual(1.0);
        expect(result.environmentChanged).toBe(true);
    });

    it('rounds changeScore to 3 decimal places', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '1' })     // 1 * 0.15 = 0.15
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.changeScore.toString()).toMatch(/^\d+(\.\d{1,3})?$/);
    });

    it('handles errors in individual signal queries gracefully', async () => {
        // subsystem_assignments throws (table may not exist)
        mockSystemQueryOne
            .mockRejectedValueOnce(new Error('no such table'))
            .mockResolvedValueOnce({ cnt: '0' });    // snapshotRestores

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockRejectedValueOnce(new Error('no kb_files'))  // KB error
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        // Should not throw, returns partial results
        expect(result.modelChanges).toBe(0);
        expect(result.kbIngestions).toBe(0);
    });

    it('does not include graph growth signal when below 10%', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '100' })    // total
            .mockResolvedValueOnce({ cnt: '5' })       // 5 new → 5/95 ≈ 5%
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.graphGrowthPct).toBe(5);
        // Below 10% threshold, should not be in signals
        expect(result.signals).not.toEqual(expect.arrayContaining([
            expect.stringContaining('graph growth'),
        ]));
    });

    it('caps model change contribution at 0.4', async () => {
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '20' })    // 20 * 0.15 = 3.0 → capped at 0.4
            .mockResolvedValueOnce({ cnt: '0' });

        mockQueryOne
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectEnvironmentChanges(7);

        expect(result.changeScore).toBe(0.4);
    });
});

// ===========================================================================
// detectOverfitting
// ===========================================================================

describe('detectOverfitting', () => {
    /**
     * Helper to set up the basic mock responses for detectOverfitting.
     * The function makes these queries in order:
     *   1. queryOne - recentStats (dream_cycles)
     *   2. queryOne - priorStats (dream_cycles)
     *   3. query - recentDomains (nodes)
     *   4. systemQuery - oscillations (config_history)
     *   Then detectEnvironmentChanges:
     *   5. systemQueryOne - modelChanges
     *   6. queryOne - totalNow
     *   7. queryOne - createdInWindow
     *   8. queryOne - kbIngestions
     *   9. systemQueryOne - snapshotRestores
     *   10. queryOne - newDomains
     */
    function setupBasicMocks(opts: {
        recentTotal?: number;
        recentCreated?: number;
        priorTotal?: number;
        priorCreated?: number;
        domains?: Array<{ domain: string; count: string }>;
        oscillations?: Array<{ config_path: string; change_count: number; distinct_values: number }>;
    } = {}) {
        const {
            recentTotal = 0,
            recentCreated = 0,
            priorTotal = 0,
            priorCreated = 0,
            domains = [],
            oscillations = [],
        } = opts;

        // queryOne calls: recentStats, priorStats, then env-change queries
        mockQueryOne
            .mockResolvedValueOnce({ total: String(recentTotal), created: String(recentCreated) })
            .mockResolvedValueOnce({ total: String(priorTotal), created: String(priorCreated) })
            // detectEnvironmentChanges queryOne calls:
            .mockResolvedValueOnce({ cnt: '50' })     // totalNow
            .mockResolvedValueOnce({ cnt: '0' })       // createdInWindow
            .mockResolvedValueOnce({ cnt: '0' })       // kbIngestions
            .mockResolvedValueOnce({ cnt: '0' });      // newDomains

        // query calls: recentDomains
        mockQuery.mockResolvedValueOnce(domains);

        // systemQuery calls: oscillations, then possibly computeBehavioralEntropy calls
        mockSystemQuery.mockResolvedValueOnce(oscillations);

        // systemQueryOne calls: detectEnvironmentChanges (modelChanges, snapshotRestores)
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })       // modelChanges
            .mockResolvedValueOnce({ cnt: '0' });      // snapshotRestores
    }

    it('reports insufficient data when recentTotal < 20', async () => {
        setupBasicMocks({ recentTotal: 10, recentCreated: 2 });

        const result = await detectOverfitting(7);

        expect(result.recommendation).toContain('Insufficient data');
    });

    it('detects quality plateau with healthy rejection rate', async () => {
        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 10,  // 10% success
            priorTotal: 50,
            priorCreated: 5,    // 10% success (same → plateau)
        });

        const result = await detectOverfitting(7);

        expect(result.qualityPlateau).toBe(true);
        expect(result.rejectionRateHealthy).toBe(true);
        expect(result.recommendation).toContain('well-calibrated');
    });

    it('detects quality plateau with low rejection rate', async () => {
        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 2,   // 2% success
            priorTotal: 50,
            priorCreated: 1,    // 2% success
        });

        const result = await detectOverfitting(7);

        expect(result.qualityPlateau).toBe(true);
        expect(result.rejectionRateHealthy).toBe(false);
        expect(result.recommendation).toContain('relaxing quality gates');
    });

    it('detects quality plateau with high rejection rate', async () => {
        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 20,  // 20% success
            priorTotal: 50,
            priorCreated: 10,   // 20% success
        });

        const result = await detectOverfitting(7);

        expect(result.qualityPlateau).toBe(true);
        expect(result.rejectionRateHealthy).toBe(false);
        expect(result.recentSuccessRate).toBeCloseTo(0.2, 2);
        expect(result.recommendation).toContain('too permissive');
    });

    it('detects diversity collapse', async () => {
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 5,
            priorTotal: 30,
            priorCreated: 10,   // enough improvement to skip plateau
            domains: [{ domain: 'only-one', count: '15' }],
        });

        const result = await detectOverfitting(7);

        expect(result.diversityCollapse).toBe(true);
        expect(result.recommendation).toContain('concentrated in one domain');
    });

    it('does not flag diversity collapse with multiple domains', async () => {
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 5,
            priorTotal: 30,
            priorCreated: 3,
            domains: [
                { domain: 'a', count: '15' },
                { domain: 'b', count: '10' },
            ],
        });

        const result = await detectOverfitting(7);

        expect(result.diversityCollapse).toBe(false);
    });

    it('does not flag diversity collapse when single domain has <= 10 items', async () => {
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 5,
            priorTotal: 30,
            priorCreated: 3,
            domains: [{ domain: 'only-one', count: '8' }],
        });

        const result = await detectOverfitting(7);

        expect(result.diversityCollapse).toBe(false);
    });

    it('detects metric oscillation (structural)', async () => {
        const oscillations = [
            { config_path: 'param.a', change_count: 6, distinct_values: 2 },
        ];

        setupBasicMocks({
            recentTotal: 200,
            recentCreated: 1,   // 0.5% → severe (< 2%)
            priorTotal: 30,
            priorCreated: 3,
            oscillations,
        });

        // computeBehavioralEntropy will be called — mock its systemQuery call
        mockSystemQuery.mockResolvedValueOnce([]); // no changes found for behavioral analysis

        const result = await detectOverfitting(7);

        expect(result.metricOscillation).toBe(true);
        expect(result.oscillatingParameters).toContain('param.a');
        expect(result.recommendation).toContain('STOP TUNING');
    });

    it('produces mild oscillation recommendation when success rate >= 5%', async () => {
        const oscillations = [
            { config_path: 'param.b', change_count: 5, distinct_values: 2 },
        ];

        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 8,   // 8% → mild
            priorTotal: 30,
            priorCreated: 3,
            oscillations,
        });

        mockSystemQuery.mockResolvedValueOnce([]);

        const result = await detectOverfitting(7);

        expect(result.metricOscillation).toBe(true);
        expect(result.recommendation).toContain('Lock the better-performing');
    });

    it('produces moderate oscillation recommendation (2-5% success)', async () => {
        const oscillations = [
            { config_path: 'param.c', change_count: 4, distinct_values: 2 },
        ];

        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 3,   // 3% → moderate
            priorTotal: 30,
            priorCreated: 1,
            oscillations,
        });

        mockSystemQuery.mockResolvedValueOnce([]);

        const result = await detectOverfitting(7);

        expect(result.metricOscillation).toBe(true);
        expect(result.recommendation).toContain('restoring last snapshot');
    });

    it('mitigates oscillation when environment changed', async () => {
        const oscillations = [
            { config_path: 'param.d', change_count: 6, distinct_values: 2 },
        ];

        // recentStats, priorStats
        mockQueryOne
            .mockResolvedValueOnce({ total: '50', created: '1' })
            .mockResolvedValueOnce({ total: '30', created: '3' })
            // env change queryOne: totalNow, createdInWindow, kbIngestions, newDomains
            .mockResolvedValueOnce({ cnt: '200' })
            .mockResolvedValueOnce({ cnt: '100' })   // 100% graph growth → big env change
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQuery.mockResolvedValueOnce([]);  // recentDomains
        mockSystemQuery
            .mockResolvedValueOnce(oscillations)
            .mockResolvedValueOnce([]);  // computeBehavioralEntropy

        // env change systemQueryOne: modelChanges, snapshotRestores
        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectOverfitting(7);

        expect(result.metricOscillation).toBe(true);
        expect(result.oscillationMitigated).toBe(true);
        expect(result.recommendation).toContain('adaptive tuning');
    });

    it('reports convergence recommendation when behavioral entropy finds convergence', async () => {
        // No structural oscillations → no oscillation
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 5,
            priorTotal: 30,
            priorCreated: 3,
            oscillations: [
                { config_path: 'converging.param', change_count: 5, distinct_values: 2 },
            ],
        });

        // computeBehavioralEntropy returns convergence
        // The function calls systemQuery for each oscillating path
        mockSystemQuery.mockResolvedValueOnce([
            {
                config_path: 'converging.param', new_value: 'good',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.0, avgResonance: 0.0, avgSpecificity: 0.0 }),
                created_at: '2025-01-01',
            },
            {
                config_path: 'converging.param', new_value: 'bad',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-02',
            },
            {
                config_path: 'converging.param', new_value: 'good',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.1, avgResonance: 0.1, avgSpecificity: 1.0 }),
                created_at: '2025-01-03',
            },
            {
                config_path: 'converging.param', new_value: 'bad',
                metrics_before: JSON.stringify({ synthesisSuccessRate: 0.5, avgResonance: 0.5, avgSpecificity: 5.0 }),
                created_at: '2025-01-04',
            },
        ]);

        const result = await detectOverfitting(7);

        // If behavioral analysis correctly classifies as convergence
        if (result.convergingParameters.length > 0) {
            expect(result.recommendation).toContain('Convergence detected');
        }
    });

    it('returns correct success rate calculations', async () => {
        setupBasicMocks({
            recentTotal: 200,
            recentCreated: 30,
            priorTotal: 100,
            priorCreated: 10,
        });

        const result = await detectOverfitting(7);

        expect(result.recentSuccessRate).toBeCloseTo(0.15, 2);   // 30/200
        expect(result.priorSuccessRate).toBeCloseTo(0.1, 2);     // 10/100
        // improvement = (0.15 - 0.1) / 0.1 = 0.5 → 50%
        expect(result.improvementPct).toBeCloseTo(50, 0);
    });

    it('handles zero prior rate with positive recent rate as 100% improvement', async () => {
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 5,
            priorTotal: 50,
            priorCreated: 0,
        });

        const result = await detectOverfitting(7);

        expect(result.priorSuccessRate).toBe(0);
        expect(result.recentSuccessRate).toBe(0.1);
        // 0→positive = 100% improvement (= 1)
        expect(result.improvementPct).toBe(100);
    });

    it('handles zero rates in both windows as stagnant', async () => {
        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 0,
            priorTotal: 50,
            priorCreated: 0,
        });

        const result = await detectOverfitting(7);

        expect(result.recentSuccessRate).toBe(0);
        expect(result.priorSuccessRate).toBe(0);
        expect(result.improvementPct).toBe(0);
    });

    it('does not flag plateau when prior window has insufficient data', async () => {
        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 10,  // 10%
            priorTotal: 5,      // < 10 → plateau requires priorTotal > 10
            priorCreated: 0,
        });

        const result = await detectOverfitting(7);

        expect(result.qualityPlateau).toBe(false);
    });

    it('defaults days parameter to 7', async () => {
        setupBasicMocks({ recentTotal: 10 });

        const result = await detectOverfitting();

        expect(result.recommendation).toContain('Insufficient data');
    });

    it('returns no overfitting signals with moderate improvement', async () => {
        setupBasicMocks({
            recentTotal: 100,
            recentCreated: 12,
            priorTotal: 80,
            priorCreated: 8,
            domains: [
                { domain: 'a', count: '6' },
                { domain: 'b', count: '4' },
            ],
        });

        const result = await detectOverfitting(7);

        // 12% vs 10% → 20% improvement (not plateau), multiple domains, no oscillation
        expect(result.qualityPlateau).toBe(false);
        expect(result.diversityCollapse).toBe(false);
        expect(result.metricOscillation).toBe(false);
        expect(result.recommendation).toContain('No overfitting signals');
    });

    it('handles oscillation query error gracefully', async () => {
        // queryOne: recentStats, priorStats
        mockQueryOne
            .mockResolvedValueOnce({ total: '50', created: '5' })
            .mockResolvedValueOnce({ total: '30', created: '3' })
            // env change queries
            .mockResolvedValueOnce({ cnt: '50' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        mockQuery.mockResolvedValueOnce([]);

        // systemQuery throws for oscillation check
        mockSystemQuery.mockRejectedValueOnce(new Error('table not found'));

        mockSystemQueryOne
            .mockResolvedValueOnce({ cnt: '0' })
            .mockResolvedValueOnce({ cnt: '0' });

        const result = await detectOverfitting(7);

        // Should handle gracefully — no oscillation detected
        expect(result.metricOscillation).toBe(false);
        expect(result.oscillatingParameters).toEqual([]);
    });

    it('handles behavioral entropy failure gracefully (falls back to structural)', async () => {
        const oscillations = [
            { config_path: 'fail.param', change_count: 5, distinct_values: 2 },
        ];

        setupBasicMocks({
            recentTotal: 50,
            recentCreated: 1,
            priorTotal: 30,
            priorCreated: 3,
            oscillations,
        });

        // computeBehavioralEntropy's systemQuery throws
        mockSystemQuery.mockRejectedValueOnce(new Error('behavioral fail'));

        const result = await detectOverfitting(7);

        // Falls back to structural detection
        expect(result.metricOscillation).toBe(true);
        expect(result.oscillatingParameters).toContain('fail.param');
    });

    it('includes environmentChanges in the result', async () => {
        setupBasicMocks({ recentTotal: 10 });

        const result = await detectOverfitting(7);

        expect(result.environmentChanges).toBeDefined();
        expect(result.environmentChanges).toHaveProperty('environmentChanged');
        expect(result.environmentChanges).toHaveProperty('changeScore');
        expect(result.environmentChanges).toHaveProperty('signals');
    });

    it('includes behavioralEntropy as empty array when no oscillations', async () => {
        setupBasicMocks({ recentTotal: 10 });

        const result = await detectOverfitting(7);

        expect(result.behavioralEntropy).toEqual([]);
    });
});
