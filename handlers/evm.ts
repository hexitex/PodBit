/**
 * Lab Verification MCP Handler — action-based dispatch.
 *
 * Actions:
 *   verify  — run full lab verification pipeline on a node (nodeId required)
 *   history — get past verification results for a node (nodeId required)
 *   stats   — aggregate verification statistics (optional: days)
 *   analyse — run post-rejection analysis on a node's last failed verification (nodeId required)
 */

import { RC } from '../config/constants.js';
import { verifyNode, verifyNodeInternal, getNodeVerifications, getEVMStats, getRecentExecutions } from '../evm/index.js';
import { resolveContent } from '../core/number-variables.js';
import { getReviewQueue, approveReview, reevaluateStoredResults, reevaluateReviewQueue, pruneOldExecutions, dismissNodeVerification } from '../evm/feedback.js';
import { enqueue, getQueue, getQueueStats, cancelEntry, cancelByNode } from '../evm/queue.js';
import { processNextEntry } from '../evm/queue-worker.js';

/**
 * Dispatch Lab Verification MCP actions.
 *
 * @param params - Action parameters. Must include `action` string plus action-specific fields.
 * @returns Action-specific result object, or `{ error }` for unknown actions.
 */
export async function handleLabVerify(params: Record<string, any>) {
    const { action } = params;

    switch (action) {
        case 'verify':
            return handleVerify(params);
        case 'history':
            return handleHistory(params);
        case 'recent':
            return handleRecent(params);
        case 'stats':
            return handleStats(params);
        case 'analyse':
            return handleAnalyse(params);
        case 'reviews':
            return handleReviews(params);
        case 'review':
            return handleReview(params);
        case 'reevaluate':
            return handleReevaluate(params);
        case 'reevaluate_reviews':
            return handleReevaluateReviews(params);
        case 'prune':
            return handlePrune(params);
        case 'suggest':
            return handleSuggest(params);
        case 'dismiss':
            return handleDismiss(params);
        case 'decompose':
            return handleDecompose(params);
        case 'decompose_apply':
            return handleDecomposeApply(params);
        case 'enqueue':
            return handleEnqueue(params);
        case 'queue':
            return handleQueue(params);
        case 'cancel':
            return handleCancel(params);
        case 'queue_stats':
            return handleQueueStats();
        default:
            return { error: `Unknown action: ${action}. Valid actions: verify, history, recent, stats, analyse, reviews, review, reevaluate, reevaluate_reviews, prune, suggest, dismiss, decompose, decompose_apply, enqueue, queue, cancel, queue_stats.` };
    }
}

/**
 * Run EVM verification on a node.
 * @param params - Object with `nodeId` (required), optional `guidance`, `direct`, `maxClaims`.
 *   When `direct=true`, runs synchronously (for GUI retry-in-place); otherwise enqueues.
 */
async function handleVerify(params: Record<string, any>) {
    const { nodeId, guidance, direct, maxClaims } = params;
    if (!nodeId) return { error: 'nodeId is required for verify action' };
    // Human-invoked (MCP/UI) — opt into critique-lab fallback. Autonomous cycles do not.
    const hints: Record<string, any> = { allowCritique: true };
    if (guidance) hints.guidance = String(guidance);
    if (maxClaims != null) hints.maxClaims = typeof maxClaims === 'number' ? maxClaims : parseInt(maxClaims, 10) || undefined;
    // direct=true for GUI retry-in-place (needs synchronous result via lab server)
    // default: enqueue for persistence + queue worker processing
    if (direct) {
        return verifyNodeInternal(nodeId, undefined, hints);
    }
    return verifyNode(nodeId, undefined, hints);
}

/**
 * Get verification history for a node.
 * @param params - Object with `nodeId` (required), optional `slim` (boolean, omits large fields).
 */
async function handleHistory(params: Record<string, any>) {
    const { nodeId, slim } = params;
    if (!nodeId) return { error: 'nodeId is required for history action' };
    const history = await getNodeVerifications(nodeId, slim === true);
    return { nodeId, count: history.length, executions: history };
}

/**
 * Get recent EVM executions with optional filters and pagination.
 * @param params - Object with optional `days`, `limit`, `offset`, `status`, `verified`,
 *   `minConfidence`, `maxConfidence`, `search`, `nodeId`.
 */
async function handleRecent(params: Record<string, any>) {
    const { days, limit, offset, status, verified, minConfidence, maxConfidence, search, nodeId } = params;
    return getRecentExecutions({
        days: days != null ? (typeof days === 'number' ? days : parseInt(days, 10) || 30) : undefined,
        limit: limit != null ? (typeof limit === 'number' ? limit : parseInt(limit, 10) || 50) : undefined,
        offset: offset != null ? (typeof offset === 'number' ? offset : parseInt(offset, 10) || 0) : undefined,
        status: status || undefined,
        verified: verified === true || verified === 'true' ? true : verified === false || verified === 'false' ? false : undefined,
        minConfidence: minConfidence != null ? (typeof minConfidence === 'number' ? minConfidence : parseFloat(minConfidence)) : undefined,
        maxConfidence: maxConfidence != null ? (typeof maxConfidence === 'number' ? maxConfidence : parseFloat(maxConfidence)) : undefined,
        search: search || undefined,
        nodeId: nodeId || undefined,
    });
}

/**
 * Get aggregate EVM statistics.
 * @param params - Object with optional `days` (default 7).
 */
async function handleStats(params: Record<string, any>) {
    const { days = 7 } = params;
    return getEVMStats(typeof days === 'number' ? days : parseInt(days, 10) || 7);
}

/**
 * Run post-rejection analysis on a node's last failed verification.
 *
 * Reconstructs a VerificationResult from the stored execution record and
 * feeds it to the analysis module. May propose a recovery node if the
 * analysis yields an interesting finding.
 *
 * @param params - Object with `nodeId` (required).
 * @returns Analysis findings and recovery status, or `{ error }`.
 */
async function handleAnalyse(params: Record<string, any>) {
    const { nodeId } = params;
    if (!nodeId) return { error: 'nodeId is required for analyse action' };

    // Fetch the node
    const { queryOne, query } = await import('../core.js');
    const node: any = await queryOne(
        'SELECT id, content, domain FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return { error: 'Node not found or archived' };

    // Find the last completed-but-rejected verification
    // Check claim_supported first (polarity-aware), fall back to verified for pre-polarity records
    const history = await getNodeVerifications(nodeId);
    const lastRejected = history.find(
        (e: any) => e.status === 'completed' && (
            e.claim_supported != null ? e.claim_supported === 0 : e.verified === 0
        ),
    );
    if (!lastRejected) {
        return { error: 'No rejected verification found for this node. Run "verify" first.' };
    }

    // Build a minimal VerificationResult from the execution record
    const { analyseRejection } = await import('../evm/analysis.js');
    const { config } = await import('../config.js');

    {
        const claimType = lastRejected.claim_type || 'qualitative';
        if (claimType === 'qualitative') {
            return { message: 'Analysis skipped — qualitative claims have nothing to analyse', claimType };
        }

        const mockResult: any = {
            nodeId,
            status: 'completed',
            codegen: {
                hypothesis: lastRejected.hypothesis,
                code: lastRejected.code,
                evaluationMode: lastRejected.evaluation_mode,
                claimType,
                expectedBehavior: '',
                raw: '',
            },
            sandbox: {
                success: true,
                stdout: lastRejected.stdout || '',
                stderr: lastRejected.stderr || '',
                exitCode: lastRejected.exit_code ?? 0,
                executionTimeMs: lastRejected.execution_time_ms ?? 0,
                killed: false,
                parsedOutput: lastRejected.stdout ? (() => {
                    try { return JSON.parse(lastRejected.stdout.trim()); } catch { return null; }
                })() : null,
            },
            evaluation: {
                verified: false,
                confidence: lastRejected.confidence ?? 0,
                score: lastRejected.score ?? 0,
                mode: lastRejected.evaluation_mode || 'boolean',
                details: '',
                rawOutput: null,
            },
            startedAt: lastRejected.created_at,
        };

        let analysis;
        try {
            analysis = await analyseRejection(mockResult, node.content, node.domain, { forceEnabled: true });
        } catch (err: any) {
            return { error: err.message || 'Analysis failed' };
        }
        if (!analysis) {
            return { message: `Analysis skipped — no analyser registered for claim type "${claimType}"`, claimType };
        }

        // Record it
        const { recordAnalysis } = await import('../evm/feedback.js');
        await recordAnalysis(nodeId, analysis);

        // Propose recovery if interesting
        if (analysis.recoveryProposal && config.labVerify.postRejection.proposalEnabled) {
            const { handlePropose } = await import('../handlers/graph.js');
            await handlePropose({
                content: analysis.recoveryProposal.content,
                nodeType: 'synthesis',
                domain: analysis.recoveryProposal.domain,
                parentIds: analysis.recoveryProposal.parentIds,
                contributor: 'evm:analysis',
            });
        }

        return {
            nodeId,
            claimType: analysis.claimType,
            findings: analysis.findings,
            recoveryProposed: !!analysis.recoveryProposal,
        };
    }
}

/**
 * Return the EVM review queue with optional filtering.
 *
 * @param params - Object with optional `status`, `limit`, and `offset` for pagination.
 * @returns Paginated list of nodes awaiting human review of their verification results.
 */
async function handleReviews(params: Record<string, any>) {
    const { status, limit, offset } = params;
    return getReviewQueue({
        status: status || undefined,
        limit: limit != null ? (typeof limit === 'number' ? limit : parseInt(limit, 10) || 20) : undefined,
        offset: offset != null ? (typeof offset === 'number' ? offset : parseInt(offset, 10) || 0) : undefined,
    });
}

/**
 * Approve or reject a node from the EVM review queue.
 *
 * @param params - Object with `nodeId` (required), `approved` (required, boolean),
 *   and optional `reviewer` (defaults to 'human').
 * @returns Result of the approval/rejection action, or `{ error }` if params are missing.
 */
async function handleReview(params: Record<string, any>) {
    const { nodeId, approved, reviewer } = params;
    if (!nodeId) return { error: 'nodeId is required for review action' };
    if (approved === undefined) return { error: 'approved (true/false) is required for review action' };
    return approveReview(nodeId, !!approved, reviewer || 'human');
}

/**
 * Remove old or failed EVM verification execution records to free storage.
 *
 * @param params - Object with optional `dryRun` (boolean, preview only) and
 *   `olderThanDays` (prune executions older than this many days).
 * @returns Summary of pruned records, or a dry-run preview.
 */
async function handlePrune(params: Record<string, any>) {
    const { dryRun, olderThanDays } = params;
    return pruneOldExecutions({
        dryRun: dryRun === true || dryRun === 'true',
        olderThanDays: olderThanDays != null ? (typeof olderThanDays === 'number' ? olderThanDays : parseInt(olderThanDays, 10) || 0) : undefined,
    });
}

/**
 * Re-evaluate stored EVM verification results using current evaluation logic.
 * Useful after changing scoring rules or thresholds to see how past results
 * would be judged under the new criteria.
 *
 * @param params - Object with optional `dryRun` (boolean, preview changes without applying)
 *   and `nodeId` (scope to a single node).
 * @returns Summary of re-evaluated results with any verdict changes.
 */
async function handleReevaluate(params: Record<string, any>) {
    const { dryRun, nodeId } = params;
    return reevaluateStoredResults({
        dryRun: dryRun === true || dryRun === 'true',
        nodeId: nodeId || undefined,
    });
}

/**
 * Fire-and-forget background re-evaluation of nodes in the review queue.
 * Unlike `handleReevaluate`, this targets the review queue specifically and
 * can optionally re-run the LLM evaluation step.
 *
 * @param params - Object with optional `rerunLLM` (boolean, re-invoke LLM evaluation)
 *   and `nodeId` (scope to a single node).
 * @returns Acknowledgement that background re-evaluation has been triggered.
 */
async function handleReevaluateReviews(params: Record<string, any>) {
    const { rerunLLM, nodeId } = params;
    return reevaluateReviewQueue({
        rerunLLM: rerunLLM === true || rerunLLM === 'true',
        nodeId: nodeId || undefined,
    });
}

/**
 * Use the evm_guidance LLM to suggest how to fix a failed verification.
 *
 * Provides the LLM with the node content, last verification attempt details
 * (hypothesis, code, errors, stdout/stderr), and asks for a diagnosis,
 * suggestion, confidence, and category.
 *
 * @param params - Object with `nodeId` (required).
 * @returns Suggestion with diagnosis, confidence, and category, or `{ error }`.
 */
async function handleSuggest(params: Record<string, any>) {
    const { nodeId } = params;
    if (!nodeId) return { error: 'nodeId is required for suggest action' };

    const { queryOne } = await import('../core.js');
    const { getPrompt } = await import('../prompts.js');
    const { callSubsystemModel } = await import('../models/index.js');

    // Fetch node
    const node: any = await queryOne(
        'SELECT id, content, domain FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return { error: 'Node not found or archived' };

    // Find the most recent execution for this node
    const history = await getNodeVerifications(nodeId);
    const lastExec = history[0];
    if (!lastExec) {
        return { error: 'No verification history found for this node. Run "verify" first.' };
    }

    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedNodeContent = await resolveContent(node.content);

    // Build the suggest prompt with full failure context
    const prompt = await getPrompt('evm.guidance_suggest', {
        nodeContent: resolvedNodeContent,
        domain: node.domain || 'general',
        hypothesis: lastExec.hypothesis || '(none)',
        code: lastExec.code || '(none)',
        error: lastExec.error || '(none)',
        stdout: lastExec.stdout?.slice(0, 2000) || '(none)',
        stderr: lastExec.stderr?.slice(0, 2000) || '(none)',
        status: lastExec.status || 'unknown',
        testCategory: lastExec.test_category || 'unknown',
        evaluationMode: lastExec.evaluation_mode || 'unknown',
        claimType: lastExec.claim_type || 'unknown',
    });

    // Use the dedicated evm_guidance subsystem — assign your most capable model
    let systemPrompt: string | undefined;
    try {
        systemPrompt = await getPrompt('evm.guidance_system', {});
    } catch {
        // System prompt is optional — falls back to inline role in the user prompt
    }

    const raw = await callSubsystemModel('evm_guidance', prompt, {
        ...(systemPrompt ? { systemPrompt } : {}),
        jsonSchema: {
            name: 'evm_guidance_suggest',
            schema: {
                type: 'object',
                properties: {
                    diagnosis: { type: 'string' },
                    suggestion: { type: 'string' },
                    confidence: { type: 'number' },
                    category: { type: 'string' },
                },
                required: ['diagnosis', 'suggestion', 'confidence', 'category'],
            },
        },
    });

    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            return { error: 'Failed to parse LLM suggestion response' };
        }
    }

    return {
        nodeId,
        diagnosis: String(parsed.diagnosis || ''),
        suggestion: String(parsed.suggestion || ''),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        category: String(parsed.category || 'unknown'),
    };
}

/**
 * Dismiss a node's verification status, clearing it from the review queue
 * and marking it as no longer pending verification.
 *
 * @param params - Object with `nodeId` (required).
 * @returns Dismissal result, or `{ error }` if nodeId is missing.
 */
async function handleDismiss(params: Record<string, any>) {
    const { nodeId } = params;
    if (!nodeId) return { error: 'nodeId is required for dismiss action' };
    return dismissNodeVerification(nodeId);
}

/**
 * Decompose a node's claim into atomic facts and research questions using LLM.
 *
 * Fetches parent contents and verification history for context, then calls
 * the evm_guidance subsystem with a structured JSON schema to extract
 * individual facts (categorized) and follow-up questions.
 *
 * @param params - Object with `nodeId` (required).
 * @returns Decomposition with facts, questions, and summary, or `{ error }`.
 */
async function handleDecompose(params: Record<string, any>) {
    const { nodeId } = params;
    if (!nodeId) return { error: 'nodeId is required for decompose action' };

    const { queryOne, query } = await import('../core.js');
    const { getPrompt } = await import('../prompts.js');
    const { callSubsystemModel } = await import('../models/index.js');
    const { config } = await import('../config.js');
    const { isBudgetExceeded } = await import('../models/budget.js');

    if (isBudgetExceeded()) {
        return { error: 'Budget exceeded — waiting for reset' };
    }

    // Fetch node
    const node: any = await queryOne(
        'SELECT id, content, domain, weight FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return { error: 'Node not found or archived' };

    // Fetch parent contents
    const parents: any[] = await query(`
        SELECT n.content FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
        ORDER BY e.created_at
    `, [nodeId]) as any[];
    // Resolve number variable placeholders so the LLM sees actual values
    const resolvedParents = await Promise.all(
        parents.map((p: any) => resolveContent(p.content))
    );
    const parentContents = resolvedParents.length > 0
        ? resolvedParents.map((content: string, i: number) => `Parent ${i + 1}: ${content}`).join('\n\n')
        : '(no parent nodes)';

    // Fetch latest verification history for context
    const history = await getNodeVerifications(nodeId);
    const lastExec = history[0];
    const verificationHistory = lastExec
        ? `Status: ${lastExec.status}, Hypothesis: ${lastExec.hypothesis || '(none)'}, Claim Type: ${lastExec.claim_type || 'unknown'}`
        : '(no verification history)';

    // Build prompt
    const resolvedDecomposeContent = await resolveContent(node.content);
    const prompt = await getPrompt('evm.decompose', {
        nodeContent: resolvedDecomposeContent,
        domain: node.domain || 'general',
        parentContents,
        verificationHistory,
    });

    // Load system prompt
    let systemPrompt: string | undefined;
    try {
        systemPrompt = await getPrompt('evm.guidance_system', {});
    } catch {
        // Optional
    }

    // Server-side timeout to prevent orphaned requests if frontend disconnects
    const abortController = new AbortController();
    const serverTimeout = setTimeout(() => abortController.abort(), RC.timeouts.evmVerificationMs); // 4.5 min (below 300s frontend)

    let raw: string;
    try {
        raw = await callSubsystemModel('evm_guidance', prompt, {
            ...(systemPrompt ? { systemPrompt } : {}),
            signal: abortController.signal,
            jsonSchema: {
                name: 'evm_decompose',
                schema: {
                    type: 'object',
                    properties: {
                        facts: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    content: { type: 'string' },
                                    category: { type: 'string', enum: ['definition', 'quantitative', 'relationship', 'mechanism', 'constraint', 'observation'] },
                                    confidence: { type: 'number' },
                                },
                                required: ['content', 'category', 'confidence'],
                            },
                        },
                        questions: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    content: { type: 'string' },
                                    reasoning: { type: 'string' },
                                },
                                required: ['content', 'reasoning'],
                            },
                        },
                        summary: { type: 'string' },
                    },
                    required: ['facts', 'questions', 'summary'],
                },
            },
        });
    } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
            return { error: 'Decomposition timed out (270s). The model may need more time for complex claims — try a simpler node.' };
        }
        throw err;
    } finally {
        clearTimeout(serverTimeout);
    }

    // Parse response
    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            return { error: 'Failed to parse LLM decomposition response' };
        }
    }

    // Validate and truncate
    const validCategories = ['definition', 'quantitative', 'relationship', 'mechanism', 'constraint', 'observation'];
    const decomposeConfig = config.labVerify.decompose;

    const facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
        .slice(0, decomposeConfig.maxFacts)
        .map((f: any) => ({
            content: String(f.content || ''),
            category: validCategories.includes(f.category) ? f.category : 'observation',
            confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
        }))
        .filter((f: any) => f.content.length > 0);

    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .slice(0, decomposeConfig.maxQuestions)
        .map((q: any) => ({
            content: String(q.content || ''),
            reasoning: String(q.reasoning || ''),
        }))
        .filter((q: any) => q.content.length > 0);

    return {
        nodeId,
        nodeContent: node.content,
        domain: node.domain || 'general',
        facts,
        questions,
        summary: String(parsed.summary || ''),
    };
}

/**
 * Apply a decomposition by creating fact and question nodes in the graph.
 *
 * Creates seed nodes for facts and question nodes for research questions,
 * all linked as children of the original node. Downgrades the original
 * node's weight after decomposition.
 *
 * @param params - Object with `nodeId` (required), `facts` array, `questions` array.
 * @returns Created nodes summary with weight changes, or `{ error }`.
 */
async function handleDecomposeApply(params: Record<string, any>) {
    const { nodeId, facts, questions } = params;
    if (!nodeId) return { error: 'nodeId is required for decompose_apply action' };
    if (!Array.isArray(facts) && !Array.isArray(questions)) {
        return { error: 'At least one of facts[] or questions[] is required' };
    }

    const { queryOne, query } = await import('../core.js');
    const { config } = await import('../config.js');
    const { emitActivity } = await import('../services/event-bus.js');
    const { handlePropose } = await import('../handlers/graph.js');

    // Fetch original node
    const node: any = await queryOne(
        'SELECT id, content, domain, weight FROM nodes WHERE id = $1 AND archived = 0',
        [nodeId],
    );
    if (!node) return { error: 'Node not found or archived' };

    const decomposeConfig = config.labVerify.decompose;
    const createdFacts: Array<{ id: string; content: string; category: string }> = [];
    const createdQuestions: Array<{ id: string; content: string }> = [];

    // Create fact nodes
    const factList = Array.isArray(facts) ? facts : [];
    for (const fact of factList) {
        if (!fact.content || typeof fact.content !== 'string') continue;
        try {
            const result = await handlePropose({
                content: fact.content,
                nodeType: 'seed',
                domain: node.domain,
                parentIds: [nodeId],
                contributor: 'evm:decompose',
                weight: decomposeConfig.factInitialWeight,
            });
            if (result.success && result.node) {
                createdFacts.push({
                    id: result.node.id,
                    content: fact.content,
                    category: fact.category || 'observation',
                });
            }
        } catch (e: any) {
            // Continue on individual failures — partial success is OK
            console.error(`[evm:decompose] Failed to create fact node: ${e.message}`);
        }
    }

    // Create question nodes
    const questionList = Array.isArray(questions) ? questions : [];
    for (const q of questionList) {
        if (!q.content || typeof q.content !== 'string') continue;
        try {
            const result = await handlePropose({
                content: q.content,
                nodeType: 'question',
                domain: node.domain,
                parentIds: [nodeId],
                contributor: 'evm:decompose',
                weight: decomposeConfig.questionInitialWeight,
            });
            if (result.success && result.node) {
                createdQuestions.push({
                    id: result.node.id,
                    content: q.content,
                });
            }
        } catch (e: any) {
            console.error(`[evm:decompose] Failed to create question node: ${e.message}`);
        }
    }

    const totalCreated = createdFacts.length + createdQuestions.length;
    if (totalCreated === 0) {
        return { error: 'No nodes were created — all proposals were rejected (duplicates or validation failures)' };
    }

    // Downgrade original node weight
    const weightFloor = config.engine?.weightFloor ?? 0.05;
    const newWeight = Math.max(weightFloor, node.weight + decomposeConfig.weightDowngrade);
    await query('UPDATE nodes SET weight = $1 WHERE id = $2', [newWeight, nodeId]);

    // Audit trail
    try {
        const { logDecision } = await import('../core/governance.js');
        await logDecision('node', nodeId, 'weight', String(node.weight), String(newWeight), 'system', 'evm:decompose',
            `Decomposed into ${createdFacts.length} facts + ${createdQuestions.length} questions`);
    } catch {
        // Non-fatal
    }

    emitActivity('system', 'evm_decompose',
        `Decomposed "${node.content.slice(0, 60)}..." into ${createdFacts.length} facts + ${createdQuestions.length} questions`,
        { nodeId, factsCreated: createdFacts.length, questionsCreated: createdQuestions.length, weightBefore: node.weight, weightAfter: newWeight },
    );

    return {
        originalNodeId: nodeId,
        originalWeightBefore: node.weight,
        originalWeightAfter: newWeight,
        createdFacts,
        createdQuestions,
        totalCreated,
    };
}

// =========================================================================
// Queue Actions
// =========================================================================

/**
 * Enqueue one or more nodes for EVM verification.
 * Supports both single-node (`nodeId`) and bulk (`nodeIds` array) modes.
 * Single enqueues trigger immediate queue worker processing (fire-and-forget);
 * bulk enqueues defer to the normal queue worker polling cycle.
 *
 * @param params - Object with `nodeId` or `nodeIds` (array), plus optional
 *   `priority`, `guidance`, `maxRetries`, `queuedBy`.
 * @returns Enqueue result with success/existing counts for bulk, or single entry result.
 */
async function handleEnqueue(params: Record<string, any>) {
    const { nodeId, nodeIds, priority, guidance, maxRetries, queuedBy } = params;

    // Bulk enqueue
    if (Array.isArray(nodeIds) && nodeIds.length > 0) {
        const results = [];
        for (const nid of nodeIds) {
            results.push(await enqueue(nid, {
                priority: priority ?? 0,
                guidance,
                maxRetries,
                queuedBy: queuedBy || 'bulk',
            }));
        }
        const succeeded = results.filter(r => r.success).length;
        const existing = results.filter(r => r.existing).length;
        return { success: true, enqueued: succeeded, existing, total: nodeIds.length, results };
    }

    // Single enqueue
    if (!nodeId) return { error: 'nodeId (or nodeIds array) is required for enqueue action' };
    const result = await enqueue(nodeId, {
        priority: priority ?? 0,
        guidance,
        maxRetries,
        queuedBy: queuedBy || 'manual',
    });

    // Trigger immediate processing for manual requests
    if (result.success && !result.existing) {
        processNextEntry().catch(() => {}); // fire-and-forget
    }

    return result;
}

/**
 * Return the current EVM verification queue with optional filtering and pagination.
 *
 * @param params - Object with optional `status`, `nodeId`, `limit`, and `offset`.
 * @returns Filtered queue entries.
 */
async function handleQueue(params: Record<string, any>) {
    const { status, nodeId, limit, offset } = params;
    return getQueue({
        status: status || undefined,
        nodeId: nodeId || undefined,
        limit: limit != null ? (typeof limit === 'number' ? limit : parseInt(limit, 10) || 50) : undefined,
        offset: offset != null ? (typeof offset === 'number' ? offset : parseInt(offset, 10) || 0) : undefined,
    });
}

/**
 * Cancel a queued EVM verification by queue entry ID or node ID.
 * Only cancels entries that have not yet started processing.
 *
 * @param params - Object with `queueId` (numeric) or `nodeId` (string). One is required.
 * @returns Cancellation result, or `{ error }` if neither ID is provided.
 */
async function handleCancel(params: Record<string, any>) {
    const { queueId, nodeId } = params;
    if (queueId) {
        return cancelEntry(typeof queueId === 'number' ? queueId : parseInt(queueId, 10));
    }
    if (nodeId) {
        return cancelByNode(nodeId);
    }
    return { error: 'queueId or nodeId is required for cancel action' };
}

/**
 * Return aggregate EVM queue statistics (total, pending, processing, completed, failed counts).
 *
 * @returns Queue statistics summary object.
 */
async function handleQueueStats() {
    return getQueueStats();
}
