/**
 * Tests for core/autotune/combinatorics.ts — clamp, round2, uniqueSorted, dedup,
 * constrainGrid, generateCombos, generateRefinementCombos, groupByModel, consolidateReaders.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../core/autotune/scoring.js', () => ({
    TEXT_READER_GROUP: ['reader_text', 'reader_pdf', 'reader_doc'],
}));

const {
    clamp, round2, uniqueSorted, dedup,
    constrainGrid, generateCombos, generateRefinementCombos,
    groupByModel, consolidateReaders,
} = await import('../../core/autotune/combinatorics.js');

describe('clamp', () => {
    it('returns value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });
    it('clamps to min', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });
    it('clamps to max', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });
    it('handles equal min/max', () => {
        expect(clamp(5, 3, 3)).toBe(3);
    });
    it('handles boundary values exactly', () => {
        expect(clamp(0, 0, 10)).toBe(0);
        expect(clamp(10, 0, 10)).toBe(10);
    });
});

describe('round2', () => {
    it('rounds to 2 decimal places', () => {
        expect(round2(Math.PI)).toBe(3.14);
        // 1.005 in IEEE 754 is 1.00499... so round2 gives 1.00
        expect(round2(1.005)).toBe(1);
        expect(round2(2.556)).toBe(2.56);
    });
    it('preserves integers', () => {
        expect(round2(5)).toBe(5);
    });
    it('handles zero', () => {
        expect(round2(0)).toBe(0);
    });
    it('handles negative numbers', () => {
        expect(round2(-3.456)).toBe(-3.46);
    });
});

describe('uniqueSorted', () => {
    it('removes duplicates and sorts', () => {
        expect(uniqueSorted([3, 1, 2, 1, 3])).toEqual([1, 2, 3]);
    });
    it('handles empty array', () => {
        expect(uniqueSorted([])).toEqual([]);
    });
    it('handles single element', () => {
        expect(uniqueSorted([5])).toEqual([5]);
    });
    it('handles already sorted unique', () => {
        expect(uniqueSorted([1, 2, 3])).toEqual([1, 2, 3]);
    });
    it('handles all duplicates', () => {
        expect(uniqueSorted([7, 7, 7])).toEqual([7]);
    });
    it('sorts numerically not lexicographically', () => {
        expect(uniqueSorted([10, 2, 1])).toEqual([1, 2, 10]);
    });
});

describe('dedup', () => {
    const current = { temperature: 0.7, topP: 0.9, minP: 0.1, topK: 40, repeatPenalty: 1.0 };

    it('puts currentParams first', () => {
        const combos = [
            { temperature: 0.5, topP: 0.8, minP: 0.0, topK: 30, repeatPenalty: 1.1 },
        ];
        const result = dedup(combos, current);
        expect(result[0]).toEqual(current);
    });

    it('removes exact duplicates', () => {
        const combos = [
            { ...current },
            { ...current },
            { temperature: 0.5, topP: 0.8, minP: 0.0, topK: 30, repeatPenalty: 1.1 },
        ];
        const result = dedup(combos, current);
        // current + the one unique combo
        expect(result).toHaveLength(2);
    });

    it('preserves distinct combos', () => {
        const combos = [
            { temperature: 0.5, topP: 0.8, minP: 0.0, topK: 30, repeatPenalty: 1.0 },
            { temperature: 0.3, topP: 0.7, minP: 0.1, topK: 50, repeatPenalty: 1.2 },
        ];
        const result = dedup(combos, current);
        expect(result).toHaveLength(3); // current + 2 distinct
    });

    it('handles empty combos array', () => {
        const result = dedup([], current);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(current);
    });
});

describe('constrainGrid', () => {
    const baseGrid = {
        temperature: [0.3, 0.5, 0.7],
        topP: [0.8, 0.9, 1.0],
        minP: [0.0, 0.05, 0.1],
        topK: [20, 40, 60],
        repeatPenalty: [1.0, 1.1, 1.2],
    };

    it('returns grid unchanged when no unsupported props', () => {
        const result = constrainGrid(baseGrid, new Set());
        expect(result).toBe(baseGrid); // same reference
    });

    it('constrains minP to [0] when min_p is unsupported', () => {
        const result = constrainGrid(baseGrid, new Set(['min_p']));
        expect(result.minP).toEqual([0]);
        expect(result.temperature).toEqual([0.3, 0.5, 0.7]); // unchanged
    });

    it('constrains topK to [0] when top_k is unsupported', () => {
        const result = constrainGrid(baseGrid, new Set(['top_k']));
        expect(result.topK).toEqual([0]);
    });

    it('constrains repeatPenalty to [1.0] when frequency_penalty is unsupported', () => {
        const result = constrainGrid(baseGrid, new Set(['frequency_penalty']));
        expect(result.repeatPenalty).toEqual([1.0]);
    });

    it('constrains multiple params simultaneously', () => {
        const result = constrainGrid(baseGrid, new Set(['min_p', 'top_k', 'frequency_penalty']));
        expect(result.minP).toEqual([0]);
        expect(result.topK).toEqual([0]);
        expect(result.repeatPenalty).toEqual([1.0]);
        expect(result.temperature).toEqual([0.3, 0.5, 0.7]);
        expect(result.topP).toEqual([0.8, 0.9, 1.0]);
    });
});

describe('generateCombos', () => {
    const current = { temperature: 0.7, topP: 0.9, minP: 0.1, topK: 40, repeatPenalty: 1.0 };

    it('generates cartesian product for small grids', () => {
        const grid = {
            temperature: [0.5, 0.7],
            topP: [0.9],
            minP: [0.1],
            topK: [40],
            repeatPenalty: [1.0],
        };
        // 2*1*1*1*1 = 2 combos + current
        const result = generateCombos(grid, 100, current);
        expect(result.length).toBeGreaterThanOrEqual(2);
        expect(result[0]).toEqual(current); // current is first
    });

    it('samples when combos exceed maxCombos', () => {
        const grid = {
            temperature: [0.1, 0.3, 0.5, 0.7, 0.9],
            topP: [0.7, 0.8, 0.9, 1.0],
            minP: [0.0, 0.05, 0.1],
            topK: [20, 40, 60],
            repeatPenalty: [1.0, 1.1, 1.2],
        };
        // 5*4*3*3*3 = 540 combos, max 10
        const result = generateCombos(grid, 10, current);
        expect(result.length).toBeLessThanOrEqual(11); // 10 max + current
    });

    it('all results have expected properties', () => {
        const grid = {
            temperature: [0.5, 0.7],
            topP: [0.8, 0.9],
            minP: [0.0, 0.1],
            topK: [30, 40],
            repeatPenalty: [1.0, 1.1],
        };
        const result = generateCombos(grid, 100, current);
        for (const combo of result) {
            expect(combo).toHaveProperty('temperature');
            expect(combo).toHaveProperty('topP');
            expect(combo).toHaveProperty('minP');
            expect(combo).toHaveProperty('topK');
            expect(combo).toHaveProperty('repeatPenalty');
        }
    });

    it('contains no duplicates', () => {
        const grid = {
            temperature: [0.5, 0.7],
            topP: [0.9],
            minP: [0.1],
            topK: [40],
            repeatPenalty: [1.0],
        };
        const result = generateCombos(grid, 100, current);
        const keys = result.map(c => `${c.temperature}-${c.topP}-${c.minP}-${c.topK}-${c.repeatPenalty}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('generateRefinementCombos', () => {
    const seed = { temperature: 0.5, topP: 0.9, minP: 0.1, topK: 40, repeatPenalty: 1.2 };

    it('generates combos around the seed', () => {
        const result = generateRefinementCombos(seed, 50);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0]).toEqual(seed); // seed is the currentParams → first
    });

    it('all values are within clamped bounds', () => {
        const result = generateRefinementCombos(seed, 200);
        for (const combo of result) {
            expect(combo.temperature).toBeGreaterThanOrEqual(0);
            expect(combo.temperature).toBeLessThanOrEqual(1.5);
            expect(combo.topP).toBeGreaterThanOrEqual(0);
            expect(combo.topP).toBeLessThanOrEqual(1);
            expect(combo.minP).toBeGreaterThanOrEqual(0);
            expect(combo.minP).toBeLessThanOrEqual(0.5);
            expect(combo.topK).toBeGreaterThanOrEqual(0);
            expect(combo.topK).toBeLessThanOrEqual(100);
            expect(combo.repeatPenalty).toBeGreaterThanOrEqual(1.0);
            expect(combo.repeatPenalty).toBeLessThanOrEqual(2.0);
        }
    });

    it('constrains unsupported params', () => {
        const result = generateRefinementCombos(seed, 50, new Set(['min_p', 'top_k']));
        // The first entry is the seed itself (currentParams), skip it
        for (const combo of result.slice(1)) {
            expect(combo.minP).toBe(0);
            expect(combo.topK).toBe(0);
        }
    });

    it('handles edge seed at lower bounds', () => {
        const edgeSeed = { temperature: 0, topP: 0, minP: 0, topK: 0, repeatPenalty: 1.0 };
        const result = generateRefinementCombos(edgeSeed, 50);
        expect(result.length).toBeGreaterThan(0);
        for (const combo of result) {
            expect(combo.temperature).toBeGreaterThanOrEqual(0);
            expect(combo.repeatPenalty).toBeGreaterThanOrEqual(1.0);
        }
    });

    it('handles edge seed at upper bounds', () => {
        const edgeSeed = { temperature: 1.5, topP: 1.0, minP: 0.5, topK: 100, repeatPenalty: 2.0 };
        const result = generateRefinementCombos(edgeSeed, 50);
        expect(result.length).toBeGreaterThan(0);
        for (const combo of result) {
            expect(combo.temperature).toBeLessThanOrEqual(1.5);
            expect(combo.repeatPenalty).toBeLessThanOrEqual(2.0);
        }
    });
});

describe('groupByModel', () => {
    it('groups subsystems by model ID', () => {
        const assignments = {
            voice: { id: 'model-a', name: 'Model A' },
            chat: { id: 'model-a', name: 'Model A' },
            compress: { id: 'model-b', name: 'Model B' },
        };
        const result = groupByModel(['voice', 'chat', 'compress'], assignments);
        expect(result.get('model-a')).toEqual(['voice', 'chat']);
        expect(result.get('model-b')).toEqual(['compress']);
    });

    it('skips subsystems without assignments', () => {
        const assignments = {
            voice: { id: 'model-a' },
        };
        const result = groupByModel(['voice', 'chat'], assignments);
        expect(result.size).toBe(1);
        expect(result.get('model-a')).toEqual(['voice']);
    });

    it('handles empty inputs', () => {
        expect(groupByModel([], {}).size).toBe(0);
    });

    it('uses name as fallback ID', () => {
        const assignments = {
            voice: { name: 'fallback-name' },
        };
        const result = groupByModel(['voice'], assignments);
        expect(result.has('fallback-name')).toBe(true);
    });
});

describe('consolidateReaders', () => {
    it('consolidates text reader group to one leader', () => {
        const result = consolidateReaders(['reader_text', 'reader_pdf', 'reader_doc', 'reader_image']);
        expect(result.toTune).toContain('reader_text');
        expect(result.toTune).toContain('reader_image');
        expect(result.toTune).not.toContain('reader_pdf');
        expect(result.toTune).not.toContain('reader_doc');
        expect(result.inherited.get('reader_pdf')).toBe('reader_text');
        expect(result.inherited.get('reader_doc')).toBe('reader_text');
    });

    it('does not consolidate when only one text reader', () => {
        const result = consolidateReaders(['reader_text', 'reader_image']);
        expect(result.toTune).toEqual(['reader_text', 'reader_image']);
        expect(result.inherited.size).toBe(0);
    });

    it('handles no readers', () => {
        const result = consolidateReaders(['voice', 'chat']);
        expect(result.toTune).toEqual(['voice', 'chat']);
        expect(result.inherited.size).toBe(0);
    });

    it('handles empty input', () => {
        const result = consolidateReaders([]);
        expect(result.toTune).toEqual([]);
        expect(result.inherited.size).toBe(0);
    });
});
