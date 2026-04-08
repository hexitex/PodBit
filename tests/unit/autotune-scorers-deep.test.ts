/**
 * Deep coverage tests for core/autotune/scorers.ts — targeting uncovered lines:
 *   Line 70: scoreCompress compression ratio >= 0.8 branch (dims.compression = 0.0)
 *   Line 109: scoreKeyword inner JSON.parse catch (malformed JSON extraction)
 *   Line 449: scoreEvmAnalysis inner JSON.parse catch on regex-extracted JSON
 *   Lines 480-481: scoreEvmEval inner JSON.parse catch on regex-extracted JSON
 */
import { describe, it, expect } from '@jest/globals';

const { SCORERS } = await import('../../core/autotune/scorers.js');

// =============================================================================
// scoreCompress — compression ratio >= 0.8 branch (line 70)
// =============================================================================

describe('scoreCompress — medium and high ratio branches', () => {
    it('sets compression to 0.5 when ratio is between 0.6 and 0.8 (line 70)', () => {
        // inputLength = 950, ratio 0.6-0.8 means output.length 570-759
        const mediumOutput = 'x'.repeat(600) + ' embedding similarity nodes weight threshold synthesis cosine decay voicing quality.';
        const result = SCORERS.compress(mediumOutput);
        expect(result.dimensions.compression).toBe(0.5);
    });

    it('sets compression to 0.0 when output is longer than 80% of input', () => {
        // ratio >= 0.8 means output.length >= 760
        const longOutput = 'a'.repeat(800) + ' embedding similarity nodes weight threshold synthesis cosine decay voicing quality.';
        const result = SCORERS.compress(longOutput);
        expect(result.dimensions.compression).toBe(0.0);
    });
});

// =============================================================================
// scoreKeyword — inner JSON.parse catch (line 109)
// =============================================================================

describe('scoreKeyword — malformed JSON inside braces', () => {
    it('sets jsonValid to 0.0 when extracted JSON is also unparseable', () => {
        // First JSON.parse fails (outer), regex finds {}, inner JSON.parse also fails
        const malformedOutput = 'some text { not: valid json !@# } more text';
        const result = SCORERS.keyword(malformedOutput);
        expect(result.dimensions.jsonValid).toBe(0.0);
    });
});

// =============================================================================
// scoreEvmAnalysis — inner JSON.parse catch (line 449)
// =============================================================================

describe('scoreEvmAnalysis — malformed JSON inside braces', () => {
    it('sets jsonValid to 0.0 when extracted JSON is also unparseable', () => {
        // Outer JSON.parse fails, regex finds {}, inner JSON.parse also fails
        const malformedOutput = 'prefix { broken: json @@@ } suffix';
        const result = SCORERS.evm_analysis(malformedOutput);
        expect(result.dimensions.jsonValid).toBe(0.0);
    });
});

// scoreEvmEval — REMOVED (evm_structural / evm_expert subsystems deprecated)
