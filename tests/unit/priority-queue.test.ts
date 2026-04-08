/**
 * Tests for kb/pipeline/queue.ts — enqueue priority insertion (re-implemented).
 *
 * enqueue inserts jobs in priority order (higher number = higher priority).
 * Uses findIndex to find the first job with lower priority, then splices.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement the priority queue insertion from kb/pipeline/queue.ts
interface Job {
    id: string;
    priority: number;
}

function enqueue(queue: Job[], job: Job): Job[] {
    const result = [...queue];
    const idx = result.findIndex(j => j.priority < job.priority);
    if (idx === -1) {
        result.push(job);
    } else {
        result.splice(idx, 0, job);
    }
    return result;
}

function makeJob(id: string, priority: number): Job {
    return { id, priority };
}

describe('enqueue — empty queue', () => {
    it('adds a job to an empty queue', () => {
        const result = enqueue([], makeJob('a', 5));
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('a');
    });
});

describe('enqueue — insertion by priority', () => {
    it('appends job with lower priority than all existing', () => {
        const queue = [makeJob('a', 10), makeJob('b', 5)];
        const result = enqueue(queue, makeJob('c', 1));
        expect(result.map(j => j.id)).toEqual(['a', 'b', 'c']);
    });

    it('prepends job with higher priority than all existing', () => {
        const queue = [makeJob('b', 5), makeJob('c', 1)];
        const result = enqueue(queue, makeJob('a', 10));
        expect(result.map(j => j.id)).toEqual(['a', 'b', 'c']);
    });

    it('inserts job in the middle with correct priority', () => {
        const queue = [makeJob('a', 10), makeJob('c', 1)];
        const result = enqueue(queue, makeJob('b', 5));
        expect(result.map(j => j.id)).toEqual(['a', 'b', 'c']);
    });

    it('inserts job before the first lower-priority job', () => {
        const queue = [makeJob('a', 10), makeJob('b', 5), makeJob('c', 5), makeJob('d', 1)];
        // New job with priority 7: goes before first priority < 7, which is 'b' (priority 5)
        const result = enqueue(queue, makeJob('new', 7));
        expect(result[0].id).toBe('a');
        expect(result[1].id).toBe('new');
        expect(result[2].id).toBe('b');
    });

    it('inserts job with equal priority after existing equal-priority jobs', () => {
        // findIndex finds strictly lower (< not <=), so equal-priority jobs come before
        const queue = [makeJob('a', 5), makeJob('b', 5)];
        const result = enqueue(queue, makeJob('c', 5));
        // All have priority 5, findIndex(j => j.priority < 5) → -1 → push
        expect(result[result.length - 1].id).toBe('c');
    });
});

describe('enqueue — does not mutate input', () => {
    it('returns a new array, not the original', () => {
        const original = [makeJob('a', 5)];
        const result = enqueue(original, makeJob('b', 10));
        expect(result).not.toBe(original);
    });

    it('does not modify the original queue array', () => {
        const original = [makeJob('a', 5)];
        enqueue(original, makeJob('b', 10));
        expect(original).toHaveLength(1);
        expect(original[0].id).toBe('a');
    });
});

describe('enqueue — ordering stability', () => {
    it('maintains sorted order after multiple inserts', () => {
        let q: Job[] = [];
        q = enqueue(q, makeJob('low', 1));
        q = enqueue(q, makeJob('high', 10));
        q = enqueue(q, makeJob('mid', 5));
        q = enqueue(q, makeJob('higher', 8));

        const priorities = q.map(j => j.priority);
        // Should be sorted descending
        for (let i = 0; i < priorities.length - 1; i++) {
            expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i + 1]);
        }
    });

    it('handles 0 priority (lowest)', () => {
        const queue = [makeJob('a', 5), makeJob('b', 1)];
        const result = enqueue(queue, makeJob('z', 0));
        expect(result[result.length - 1].id).toBe('z');
    });

    it('handles negative priorities', () => {
        const queue = [makeJob('a', 5), makeJob('b', 0)];
        const result = enqueue(queue, makeJob('neg', -1));
        expect(result[result.length - 1].id).toBe('neg');
    });
});
