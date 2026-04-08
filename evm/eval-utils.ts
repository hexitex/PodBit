/**
 * Pure evaluation utilities — used by feedback-reeval to re-evaluate
 * historical execution results. No LLM, no lab, just math.
 *
 * This is a minimal extraction of the evaluation logic that used to live
 * in evaluator.ts (now deleted — moved to the lab). Kept for backward
 * compatibility with stored lab_executions data.
 *
 * @module evm/eval-utils
 */

import type { EvaluationMode, AssertionPolarity } from './types.js';

export interface EvaluationResult {
    verified: boolean;
    claimSupported: boolean;
    confidence: number;
    score: number;
    mode: EvaluationMode;
    details: string;
    rawOutput: any;
    routingSignal?: 'preflight_halt' | 'malformed_output';
}

interface SandboxResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
    killed: boolean;
    parsedOutput?: any;
}

/**
 * Evaluate a sandbox result. Pure logic — no LLM.
 * Used for re-evaluating historical results from lab_executions.
 */
export function evaluateResult(
    sandbox: SandboxResult,
    mode: EvaluationMode,
    _expectedBehavior: string,
    polarity: AssertionPolarity = 'positive',
): EvaluationResult {
    const output = sandbox.parsedOutput;
    if (!output || sandbox.killed) {
        return { verified: false, claimSupported: false, confidence: 0, score: 0, details: 'No output', mode, rawOutput: output };
    }

    let result: EvaluationResult;

    switch (mode) {
        case 'numerical': result = evalNumerical(output, mode); break;
        case 'convergence': result = evalConvergence(output, mode); break;
        case 'pattern': result = evalPattern(output, mode); break;
        default: result = evalBoolean(output, mode); break;
    }

    if (result.confidence <= 0.2 && output.verified !== undefined) {
        result = evalBoolean(output, mode);
    }

    result.claimSupported = polarity === 'negative' ? !result.verified : result.verified;
    result.rawOutput = output;
    return result;
}

function evalBoolean(o: any, mode: EvaluationMode): EvaluationResult {
    const v = !!(o.result ?? o.verified);
    const c = o.confidence ?? (v ? 0.9 : 0.45);
    return { verified: v, claimSupported: v, confidence: c, score: c, details: o.explanation || '', mode, rawOutput: o };
}

function evalNumerical(o: any, mode: EvaluationMode): EvaluationResult {
    if (o.value == null || o.expected == null) return { verified: false, claimSupported: false, confidence: 0, score: 0, details: 'Missing value/expected', mode, rawOutput: o };
    const tol = o.tolerance ?? 0.01;
    const abs = Math.abs(o.expected);
    const diff = abs > 0 ? Math.abs(o.value - o.expected) / abs : Math.abs(o.value - o.expected);
    const v = diff <= tol;
    const c = Math.max(0, Math.min(1, 1 - diff / Math.max(tol, 0.001)));
    return { verified: v, claimSupported: v, confidence: c, score: c, details: `relDiff=${diff.toExponential(3)}`, mode, rawOutput: o };
}

function evalConvergence(o: any, mode: EvaluationMode): EvaluationResult {
    const s = o.series || o.partial_sums || o.values;
    if (!Array.isArray(s) || s.length < 4) return { verified: false, claimSupported: false, confidence: 0, score: 0, details: 'Series too short', mode, rawOutput: o };
    const mid = Math.floor(s.length / 2);
    const d = (arr: number[]) => { let sum = 0; for (let i = 1; i < arr.length; i++) sum += Math.abs(arr[i] - arr[i - 1]); return sum / (arr.length - 1); };
    const d1 = d(s.slice(0, mid)); const d2 = d(s.slice(mid));
    const ratio = d1 > 0 ? d2 / d1 : 1;
    const v = d1 > 0 && ratio < 0.5;
    const c = v ? Math.min(1, 1 - ratio) : Math.max(0, 0.3 - ratio * 0.3);
    return { verified: v, claimSupported: v, confidence: c, score: c, details: `ratio=${ratio.toFixed(4)}`, mode, rawOutput: o };
}

function evalPattern(o: any, mode: EvaluationMode): EvaluationResult {
    const v = !!o.matched;
    const c = v ? 0.75 : 0.6;
    return { verified: v, claimSupported: v, confidence: c, score: c, details: o.evidence || '', mode, rawOutput: o };
}
