/**
 * Post-rejection analysis — LLM investigates why a claim was refuted.
 *
 * No code generation, no sandbox execution, no lab submission.
 * The LLM analyses the lab results and produces:
 * - Findings (what actually happened vs what was claimed)
 * - Optional recovery proposal (a corrected version of the claim)
 *
 * @module evm/analysis
 */

import { callSubsystemModel } from '../models/assignments.js';
import { getPrompt } from '../prompts.js';
import { config } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import type { VerificationResult, AnalysisResult, AnalysisFindings } from './types.js';

/**
 * Analyse a rejected verification result.
 * Returns findings + optional recovery proposal, or null if analysis not applicable.
 */
export async function analyseRejection(
    result: VerificationResult,
    nodeContent: string,
    domain: string,
    { forceEnabled = false }: { forceEnabled?: boolean } = {},
): Promise<AnalysisResult | null> {
    const postConfig = config.labVerify.postRejection;
    if (!postConfig.enabled && !forceEnabled) return null;

    // Nothing to analyse if no evaluation data
    if (!result.evaluation) return null;

    const claimType = (result as any).codegen?.claimType || 'unknown';

    emitActivity('system', 'evm_analysis',
        `Post-rejection analysis for ${result.nodeId.slice(0, 8)} (${claimType})`,
        { nodeId: result.nodeId, claimType });

    // Build analysis prompt with lab results
    const rawOutput = result.evaluation.rawOutput
        ? JSON.stringify(result.evaluation.rawOutput, null, 2)
        : '(no raw data)';

    const prompt = await getPrompt('evm.analysis', {
        nodeContent,
        claimType,
        hypothesis: (result as any).codegen?.hypothesis || 'Unknown hypothesis',
        sandboxOutput: rawOutput,
        domain: domain || 'general',
        allowedModules: 'N/A (lab handles execution)',
        polarity: '',
    });

    let raw: string;
    try {
        raw = await callSubsystemModel('evm_analysis', prompt);
    } catch (err: any) {
        emitActivity('system', 'evm_analysis', `Analysis LLM failed: ${err.message}`, { nodeId: result.nodeId });
        return null;
    }

    // Parse findings from LLM response
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
        }
    }

    if (!parsed) {
        emitActivity('system', 'evm_analysis', 'Could not parse analysis response', { nodeId: result.nodeId });
        return null;
    }

    const findings: AnalysisFindings = {
        actualValue: parsed.actualValue || parsed.actual_value,
        expectedValue: parsed.expectedValue || parsed.expected_value,
        deviation: parsed.deviation,
        alternativePattern: parsed.alternativePattern || parsed.alternative_pattern,
        alternativeConfidence: parsed.alternativeConfidence || parsed.alternative_confidence,
        isInteresting: parsed.isInteresting ?? parsed.is_interesting ?? false,
        summary: parsed.summary || parsed.explanation || 'Analysis completed',
    };

    emitActivity('system', 'evm_analysis',
        `Analysis complete: interesting=${findings.isInteresting} — ${findings.summary.slice(0, 80)}`,
        { nodeId: result.nodeId, isInteresting: findings.isInteresting });

    const analysisResult: AnalysisResult = {
        claimType,
        analysisCode: '',
        sandboxResult: {
            success: true,
            stdout: JSON.stringify(parsed),
            stderr: '',
            exitCode: 0,
            executionTimeMs: 0,
            killed: false,
            parsedOutput: parsed,
        },
        findings,
    };

    // Build recovery proposal if findings are interesting
    if (findings.isInteresting && postConfig.proposalEnabled) {
        analysisResult.recoveryProposal = buildRecoveryProposal(
            nodeContent, domain, result.nodeId, findings,
        );
    }

    return analysisResult;
}

/**
 * Record an analysis result in the execution history.
 */
export async function recordAnalysis(nodeId: string, analysis: AnalysisResult): Promise<void> {
    const { query } = await import('../core.js');
    const { generateUuid } = await import('../models/types.js');

    await query(`
        INSERT INTO lab_executions (id, node_id, status, hypothesis, code, claim_type, attempt, created_at, completed_at)
        VALUES ($1, $2, 'analysis', $3, '', $4, 1, datetime('now'), datetime('now'))
    `, [generateUuid(), nodeId, analysis.findings.summary, analysis.claimType]);
}

/**
 * Reconcile recovery content after successful re-verification.
 */
export async function reconcileRecoveryContent(
    _nodeId: string,
    _evaluation: any,
    _sandbox?: any,
): Promise<void> {
    // No-op in the lab architecture — recovery nodes are verified like any other node
}

function buildRecoveryProposal(
    _nodeContent: string,
    domain: string,
    nodeId: string,
    findings: AnalysisFindings,
): { content: string; domain: string; parentIds: string[] } {
    const parts: string[] = [];

    if (findings.actualValue && findings.expectedValue) {
        parts.push(`Corrected: the actual value is ${findings.actualValue} (claimed: ${findings.expectedValue}).`);
    }
    if (findings.alternativePattern) {
        parts.push(`Alternative finding: ${findings.alternativePattern}`);
        if (findings.alternativeConfidence) {
            parts.push(`(confidence: ${findings.alternativeConfidence})`);
        }
    }
    if (findings.summary) {
        parts.push(findings.summary);
    }

    return {
        content: parts.join(' '),
        domain,
        parentIds: [nodeId],
    };
}
