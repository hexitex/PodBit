/**
 * Tests for evm/index.ts — isBudgetError (re-implemented, private function).
 *
 * Checks if an error message indicates a budget exceeded condition.
 * The second pattern uses regex to match 'budget...paused' with any text between.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement isBudgetError from evm/index.ts
function isBudgetError(e: any): boolean {
    const msg = e?.message?.toLowerCase() ?? '';
    return msg.includes('budget exceeded')
        || /budget.*paused/.test(msg);
}

describe('isBudgetError', () => {
    describe('budget exceeded pattern', () => {
        it('returns true for "budget exceeded"', () => {
            expect(isBudgetError(new Error('budget exceeded'))).toBe(true);
        });

        it('is case-insensitive for budget exceeded', () => {
            expect(isBudgetError(new Error('Budget Exceeded'))).toBe(true);
            expect(isBudgetError(new Error('BUDGET EXCEEDED'))).toBe(true);
        });

        it('returns true when "budget exceeded" appears in a longer message', () => {
            expect(isBudgetError(new Error('Daily budget exceeded for model gpt-4'))).toBe(true);
        });

        it('returns true with message prefix', () => {
            expect(isBudgetError(new Error('Error: budget exceeded. Reset tomorrow.'))).toBe(true);
        });
    });

    describe('budget paused regex pattern', () => {
        it('returns true for "budget.*paused" literal', () => {
            expect(isBudgetError(new Error('budget.*paused'))).toBe(true);
        });

        it('returns true for "budget is paused"', () => {
            expect(isBudgetError(new Error('budget is paused'))).toBe(true);
        });

        it('returns true for "budget paused"', () => {
            expect(isBudgetError(new Error('budget paused'))).toBe(true);
        });

        it('returns true for "Budget exceeded — cannot start services while budget is paused."', () => {
            expect(isBudgetError(new Error('Budget exceeded — cannot start services while budget is paused.'))).toBe(true);
        });
    });

    describe('non-budget errors', () => {
        it('returns false for generic errors', () => {
            expect(isBudgetError(new Error('Connection refused'))).toBe(false);
        });

        it('returns false for rate limit errors', () => {
            expect(isBudgetError(new Error('429 rate limit exceeded'))).toBe(false);
        });

        it('returns false for timeout errors', () => {
            expect(isBudgetError(new Error('Request timeout after 30s'))).toBe(false);
        });

        it('returns false for errors about other limits', () => {
            expect(isBudgetError(new Error('Token limit reached'))).toBe(false);
        });
    });

    describe('null and edge cases', () => {
        it('returns falsy for null (optional chaining short-circuits)', () => {
            // Optional chaining: e?.message?.toLowerCase().includes(...) → undefined when e is null
            expect(isBudgetError(null)).toBeFalsy();
        });

        it('returns falsy for undefined', () => {
            expect(isBudgetError(undefined)).toBeFalsy();
        });

        it('returns falsy for object without message property', () => {
            // e.message is undefined → optional chain short-circuits → undefined (falsy)
            expect(isBudgetError({})).toBeFalsy();
        });

        it('returns falsy for object with null message', () => {
            // null?.toLowerCase() → undefined (optional chain) → undefined || undefined → undefined
            expect(isBudgetError({ message: null })).toBeFalsy();
        });

        it('returns falsy for object with undefined message', () => {
            expect(isBudgetError({ message: undefined })).toBeFalsy();
        });

        it('handles non-Error objects with message property', () => {
            expect(isBudgetError({ message: 'budget exceeded for subsystem voice' })).toBe(true);
        });
    });
});
