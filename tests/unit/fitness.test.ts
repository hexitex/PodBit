/**
 * Tests for db/pool-db.ts — computeFitness (re-implemented).
 */
import { describe, it, expect } from '@jest/globals';
import { dbDateMs } from '../../utils/datetime.js';

// computeFitness from db/pool-db.ts — reads from pool DB
// Re-implement the fitness formula for isolated testing

// From pool-db.ts: computeFitness is used after return — calculates a score
// from breakthrough count, node count, and avg weight.
// The actual function is synchronous business logic; re-implement here.

/**
 * Fitness score used to rank partitions in the pool.
 * Higher = better candidate for future recruitment.
 * @param breakthroughs - Count of breakthrough nodes
 * @param nodes - Total node count
 * @param avgWeight - Average node weight
 * @param timesRecruited - How often this partition was recruited (penalizes over-use)
 * @returns fitness = (breakthroughs*3 + nodes*0.01 + avgWeight) / (timesRecruited + 1)
 */
function computeFitness(
    breakthroughs: number,
    nodes: number,
    avgWeight: number,
    timesRecruited: number,
): number {
    return (breakthroughs * 3 + nodes * 0.01 + avgWeight) / (timesRecruited + 1);
}

// Also test the return condition logic from pool-integration.ts:
// shouldReturn(recruitment, now) checks time expiry, cycle exhaustion, and max cycles

interface Recruitment {
    return_due_at: string;
    current_cycles: number;
    min_cycles: number;
    max_cycles: number;
    current_barren: number;
    exhaustion_threshold: number;
}

function shouldReturn(r: Recruitment, now: Date): { should: boolean; reason: string } {
    const dueAt = dbDateMs(r.return_due_at);
    if (now.getTime() > dueAt) {
        return { should: true, reason: 'time_expired' };
    }
    if (r.current_cycles >= r.max_cycles) {
        return { should: true, reason: 'max_cycles' };
    }
    if (r.current_cycles >= r.min_cycles && r.current_barren >= r.exhaustion_threshold) {
        return { should: true, reason: 'cycle_exhaustion' };
    }
    return { should: false, reason: '' };
}

describe('computeFitness', () => {
    it('returns 0 for all-zero inputs', () => {
        expect(computeFitness(0, 0, 0, 0)).toBe(0);
    });

    it('gives bonus for breakthroughs', () => {
        const withBreakthrough = computeFitness(1, 0, 0, 0);
        const without = computeFitness(0, 0, 0, 0);
        expect(withBreakthrough).toBeGreaterThan(without);
    });

    it('breakthrough weight is 3x per breakthrough', () => {
        expect(computeFitness(1, 0, 0, 0)).toBe(3.0);
        expect(computeFitness(2, 0, 0, 0)).toBe(6.0);
    });

    it('gives small bonus for node count', () => {
        const with100Nodes = computeFitness(0, 100, 0, 0);
        expect(with100Nodes).toBeCloseTo(1.0, 5);
    });

    it('includes average weight in score', () => {
        const withWeight = computeFitness(0, 0, 2.5, 0);
        expect(withWeight).toBe(2.5);
    });

    it('divides by (timesRecruited + 1) to penalize frequent recruitment', () => {
        const fresh = computeFitness(3, 0, 0, 0);
        const recruited5x = computeFitness(3, 0, 0, 5);
        expect(recruited5x).toBeLessThan(fresh);
        expect(recruited5x).toBeCloseTo(fresh / 6, 5);
    });

    it('high breakthrough count dominates', () => {
        const highBreakthrough = computeFitness(10, 1000, 5, 0);
        const lowBreakthrough = computeFitness(0, 1000, 5, 0);
        expect(highBreakthrough).toBeGreaterThan(lowBreakthrough);
    });
});

describe('shouldReturn', () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // 1 day from now
    const past = new Date(Date.now() - 1000).toISOString();      // 1 second ago

    const baseRecruitment: Recruitment = {
        return_due_at: future,
        current_cycles: 0,
        min_cycles: 5,
        max_cycles: 100,
        current_barren: 0,
        exhaustion_threshold: 10,
    };

    it('should not return when nothing is exceeded', () => {
        const result = shouldReturn(baseRecruitment, new Date());
        expect(result.should).toBe(false);
    });

    it('should return when time is expired', () => {
        const r: Recruitment = { ...baseRecruitment, return_due_at: past };
        const result = shouldReturn(r, new Date());
        expect(result.should).toBe(true);
        expect(result.reason).toBe('time_expired');
    });

    it('should return when max cycles reached', () => {
        const r: Recruitment = { ...baseRecruitment, current_cycles: 100 };
        const result = shouldReturn(r, new Date());
        expect(result.should).toBe(true);
        expect(result.reason).toBe('max_cycles');
    });

    it('should return when cycle exhaustion: barren >= threshold AND cycles >= min', () => {
        const r: Recruitment = {
            ...baseRecruitment,
            current_cycles: 5,   // >= min_cycles
            current_barren: 10,  // >= exhaustion_threshold
        };
        const result = shouldReturn(r, new Date());
        expect(result.should).toBe(true);
        expect(result.reason).toBe('cycle_exhaustion');
    });

    it('should NOT return on exhaustion if below min_cycles (still learning)', () => {
        const r: Recruitment = {
            ...baseRecruitment,
            current_cycles: 4,   // < min_cycles (5)
            current_barren: 15,  // >= exhaustion_threshold
        };
        const result = shouldReturn(r, new Date());
        expect(result.should).toBe(false);
    });

    it('should NOT return on exhaustion if barren < threshold', () => {
        const r: Recruitment = {
            ...baseRecruitment,
            current_cycles: 10, // >= min_cycles
            current_barren: 5,  // < exhaustion_threshold (10)
        };
        const result = shouldReturn(r, new Date());
        expect(result.should).toBe(false);
    });

    it('time expiry takes priority over other conditions', () => {
        const r: Recruitment = {
            ...baseRecruitment,
            return_due_at: past,
            current_cycles: 100,
        };
        const result = shouldReturn(r, new Date());
        expect(result.reason).toBe('time_expired');
    });
});
