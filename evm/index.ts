/**
 * EVM (Execution Validation Module) — Public API
 *
 * Two-stage pipeline:
 *   1. EXTRACTION (Podbit, bias surface) — LLM extracts experiment spec from claim
 *   2. LAB (separate server) — lab runs experiment, evaluates results, returns verdict
 *   Podbit applies graph consequences (weight, taint, evidence, elite promotion)
 *
 * Lab chaining (optional):
 *   After a lab returns a verdict, the result can be auto-forwarded to a critique lab
 *   that reviews the methodology. The critique lab can confirm, correct, or request
 *   a retest with corrective guidance. Consequences are deferred until critique confirms.
 *
 * Claims that cannot be reduced to experiments are honestly
 * tagged as 'not_reducible' — no fake verification.
 *
 * Entry points:
 *   verifyNode(nodeId)         — enqueue for async verification
 *   verifyNodeInternal(nodeId) — run the pipeline directly (used by worker + cycles)
 */

import { queryOne, query } from '../core.js';
import { config } from '../config.js';
import { recordVerification, getNodeVerifications, getEVMStats, getRecentExecutions } from './feedback.js';
import { isBudgetExceeded } from '../models/budget.js';
import { emitActivity, nodeLabel } from '../services/event-bus.js';
import { resolveContent } from '../core/number-variables.js';
import { extractExperimentSpec } from './spec-extractor.js';
import { submitSpec } from '../lab/client.js';
import type { VerificationResult, VerifyHints } from './types.js';
import type { ExperimentSpec } from '../lab/types.js';


// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Enqueue a node for verification via the persistent queue.
 */
export async function verifyNode(nodeId: string, _researchData?: string, hints?: VerifyHints): Promise<VerificationResult> {
    const { enqueue } = await import('./queue.js');
    const { processNextEntry } = await import('./queue-worker.js');

    // Callers that opt into critique-lab fallback (allowCritique) are by definition
    // human-invoked. Everything else (verification cycle, validation cycle,
    // research cycle, etc.) is autonomous.
    const enqueueResult = await enqueue(nodeId, {
        guidance: hints?.guidance,
        queuedBy: hints?.allowCritique ? 'manual' : 'autonomous',
    });

    if (!enqueueResult.success) {
        return { nodeId, status: 'failed', error: enqueueResult.error || 'Enqueue failed', startedAt: new Date().toISOString() };
    }

    if (enqueueResult.existing) {
        return { nodeId, status: 'queued' as any, startedAt: new Date().toISOString() };
    }

    processNextEntry().catch(() => {});
    return { nodeId, status: 'queued' as any, startedAt: new Date().toISOString() };
}

// =============================================================================
// THREE-STAGE PIPELINE
// =============================================================================

/**
 * Run the verification pipeline:
 *   1. Extract experiment spec from claim (the ONE bias surface) — OR use chainSpec
 *   2. Submit spec to lab, receive verdict
 *   3. Apply graph consequences (weight, taint, evidence, elite promotion)
 *      OR defer consequences if lab chaining is active
 */
export async function verifyNodeInternal(nodeId: string, _researchData?: string, hints?: VerifyHints): Promise<VerificationResult> {
    const evmConfig = config.labVerify;
    const startedAt = new Date().toISOString();

    if (!evmConfig.enabled) {
        return { nodeId, status: 'skipped', error: 'Lab verification is disabled', startedAt };
    }

    if (isBudgetExceeded()) {
        return { nodeId, status: 'skipped', error: 'Budget exceeded — waiting for reset', startedAt };
    }

    // ─── FETCH NODE ──────────────────────────────────────────────────
    const node: any = await queryOne(
        `SELECT id, content, weight, domain, node_type, contributor, trajectory,
                specificity, salience, breedable, created_at,
                verification_status, verification_score
         FROM nodes WHERE id = $1 AND archived = 0`,
        [nodeId]
    );
    if (!node) {
        return { nodeId, status: 'failed', error: 'Node not found or archived', startedAt };
    }

    const parents: any[] = await query(`
        SELECT n.id, n.content, n.node_type, n.weight, n.domain FROM edges e
        JOIN nodes n ON n.id = e.source_id
        WHERE e.target_id = $1 AND e.edge_type = 'parent'
        ORDER BY e.created_at
    `, [nodeId]) as any[];

    const resolvedClaim = await resolveContent(node.content);
    const resolvedParents = await Promise.all(
        parents.map((p: any) => resolveContent(p.content))
    );

    // ─── RESUME FAST-PATH ────────────────────────────────────────────
    // When recovering a job after restart, the lab may already have the result.
    // Skip extraction/routing entirely and go straight to polling. This avoids
    // burning an LLM call on spec extraction only to fetch an already-completed result,
    // and prevents extraction failures from orphaning completed lab results.
    if (hints?.resumeJobId) {
        emitActivity('system', 'evm_resume',
            `${nodeLabel(nodeId, node.content)}: resuming lab job ${hints.resumeJobId}`,
            { nodeId, jobId: hints.resumeJobId });

        const templateId = hints.resumeTemplateId || 'math-lab';
        let labExperiment: import('../lab/client.js').LabExperimentResult;
        let chosenLabId: string | undefined;
        let chosenLabName: string | undefined;

        try {
            const { getLab } = await import('../lab/registry.js');
            const lab = await getLab(templateId);
            chosenLabId = lab?.id;
            chosenLabName = lab?.name;

            if (hints?.labAbort && hints?.freezeTimeoutMs) {
                setTimeout(() => hints.labAbort!.abort(), hints.freezeTimeoutMs);
            }
            const labSignal = hints?.labAbort?.signal ?? hints?.signal;

            labExperiment = await submitSpec(
                { specType: 'unknown', hypothesis: '', setup: {}, criteria: [], nodeId } as ExperimentSpec,
                templateId, lab ? { labId: lab.id, labName: lab.name } : undefined,
                { resumeJobId: hints.resumeJobId, pollBudgetMs: hints.freezeTimeoutMs ?? hints.pollBudgetMs, signal: labSignal },
            );
        } catch (e: any) {
            const result: VerificationResult = {
                nodeId, status: 'failed', error: `Lab resume failed: ${e.message}`,
                weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
            };
            await recordVerification(result);
            return result;
        }

        // Result fetched - process it through the normal verdict mapping below
        const labData = labExperiment.result;
        const labJobId = labExperiment.jobId;
        const isInconclusive = labData.verdict === 'inconclusive';
        const claimSupported = labData.verdict === 'supported';
        const isComplete = labData.verdict === 'supported' || labData.verdict === 'refuted' || isInconclusive;
        const isError = labData.verdict === 'error';

        const result: VerificationResult = {
            nodeId,
            status: isError ? 'failed' : isComplete ? 'completed' : 'skipped',
            testCategory: (labData.testCategory || 'unknown') as any,
            evaluation: isComplete ? {
                verified: claimSupported,
                claimSupported: isInconclusive ? null as any : claimSupported,
                confidence: labData.confidence,
                score: isInconclusive ? 0 : labData.confidence,
                mode: 'boolean' as any,
                details: labData.details || `Lab verdict: ${labData.verdict}`,
                structuredDetails: liftStructuredDetails(labData),
                rawOutput: labData.details || null,
                inconclusive: isInconclusive,
            } : undefined,
            codegen: {
                hypothesis: labData.hypothesis || '',
                claimType: 'unknown' as any,
                code: '', expectedBehavior: '', evaluationMode: 'boolean' as any,
                assertionPolarity: 'positive' as any, raw: '',
            },
            weightBefore: node.weight,
            error: isError ? `Lab error: ${labData.error || 'unknown'}` :
                   !isComplete ? `Lab verdict: ${labData.verdict} - ${labData.details || ''}` : undefined,
            startedAt,
            completedAt: new Date().toISOString(),
        };

        await recordVerification(result, { labJobId, labId: chosenLabId, labName: chosenLabName });

        // Pull artifacts
        try {
            const { getLab } = await import('../lab/registry.js');
            const lab = chosenLabId ? await getLab(chosenLabId) : null;
            if (lab) {
                const { pullArtifactZip } = await import('../lab/evidence.js');
                await pullArtifactZip(lab, labJobId, nodeId, node.domain, null);
            }
        } catch { /* non-fatal */ }

        // Store inline evidence
        try {
            const { storeEvidence } = await import('../lab/evidence.js');
            const { getLab } = await import('../lab/registry.js');
            const lab = chosenLabId ? await getLab(chosenLabId) : null;
            await storeEvidence(null, nodeId, node.domain, labData, { specType: 'unknown', hypothesis: '', setup: {}, criteria: [], nodeId } as ExperimentSpec, lab?.url || '');
        } catch { /* non-fatal */ }

        const verdictMsg = isError
            ? `ERROR via ${chosenLabName || 'unknown'}: ${labData.error || 'unknown'}`
            : `${claimSupported ? 'SUPPORTED' : 'REFUTED'} (confidence: ${labData.confidence?.toFixed(2) || '?'}) via ${chosenLabName || 'unknown'} [resumed]`;
        emitActivity('system', 'lab_complete',
            `${nodeLabel(nodeId, node.content)}: ${verdictMsg}`,
            { nodeId, claimSupported, confidence: labData.confidence, labJobId, labId: chosenLabId, labName: chosenLabName, verdict: labData.verdict, resumed: true });

        // Apply graph consequences (weight, taint, elite promotion)
        if (claimSupported && config.elitePool?.enabled) {
            try {
                const { promoteToElite } = await import('../core/elite-pool.js');
                await promoteToElite(nodeId, result);
            } catch { /* non-fatal */ }
        }

        return result;
    }

    // ─── CHAIN SPEC BYPASS ──────────────────────────────────────────
    // When a chain job provides a pre-built spec (e.g., experiment_review for critique,
    // or a retest with corrective guidance), skip extraction entirely.
    let spec: ExperimentSpec;
    let extractionClaimType: string | undefined;

    if (hints?.chainSpec) {
        spec = hints.chainSpec;
        extractionClaimType = spec.claimType;
        emitActivity('system', 'evm_chain_spec',
            `${nodeLabel(nodeId, node.content)}: using chain spec (${hints.chainType}, depth ${hints.chainDepth ?? 0})`,
            { nodeId, chainType: hints.chainType, chainDepth: hints.chainDepth, specType: spec.specType });
    } else {
        // ─── NORMAL PATH: EXTRACTION ─────────────────────────────────

        // PRE-LAB: API RECONNAISSANCE
        if (config.labVerify.apiVerification?.enabled && !isBudgetExceeded()) {
            try {
                const { runApiVerification } = await import('./api/orchestrator.js');
                const apiResult = await runApiVerification(nodeId, node.content, node.domain);
                if (apiResult.totalCorrections > 0) {
                    emitActivity('api', 'pre_lab_corrections',
                        `Pre-lab: ${apiResult.totalCorrections} correction(s) for ${nodeLabel(nodeId, node.content)}`,
                        { nodeId, corrections: apiResult.totalCorrections, impact: apiResult.overallImpact });
                }
            } catch (e: any) {
                emitActivity('system', 'pre_lab_api_error', `Pre-lab API failed: ${e.message}`, { nodeId });
            }
        }

        // PRE-FLIGHT: check previous "no lab" skips
        try {
            const priorNoLab = await queryOne(
                `SELECT spec FROM lab_executions
                 WHERE node_id = $1 AND status = 'skipped' AND error LIKE 'No lab registered for specType%'
                 ORDER BY created_at DESC LIMIT 1`,
                [nodeId],
            ) as any;
            if (priorNoLab?.spec) {
                const priorSpec = JSON.parse(priorNoLab.spec);
                if (priorSpec?.specType) {
                    const { getLabsForSpecType } = await import('../lab/registry.js');
                    const labs = await getLabsForSpecType(priorSpec.specType);
                    if (labs.length === 0) {
                        emitActivity('system', 'lab_no_lab',
                            `${nodeLabel(nodeId, node.content)}: still no lab for "${priorSpec.specType}" — skipping without re-extraction`,
                            { nodeId, specType: priorSpec.specType });
                        return {
                            nodeId, status: 'skipped',
                            error: `No lab registered for specType "${priorSpec.specType}" (pre-flight check)`,
                            weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
                        };
                    }
                }
            }
        } catch { /* non-fatal */ }

        // STAGE 1: EXTRACTION (bias surface)
        emitActivity('system', 'evm_start', `Spec extraction for ${nodeLabel(nodeId, node.content)}`, { nodeId });

        let priorRejections: string | undefined;
        try {
            const { systemQueryOne } = await import('../db/sqlite-backend.js');
            const lastLabChange = await systemQueryOne(
                "SELECT MAX(updated_at) as ts FROM lab_registry WHERE enabled = 1", [],
            ) as any;
            const cutoff = lastLabChange?.ts || '2000-01-01';

            const priorSkips = await query(
                `SELECT error FROM lab_executions
                 WHERE node_id = $1 AND status = 'skipped' AND error LIKE 'Not reducible%'
                   AND error NOT LIKE '%setup was empty%'
                   AND error NOT LIKE '%extraction_failure%'
                   AND error NOT LIKE '%description is empty%'
                   AND error NOT LIKE '%provided only%{}%'
                   AND error NOT LIKE '%no parameters are provided%'
                   AND error NOT LIKE '%Missing parameters%'
                   AND error NOT LIKE '%Missing specification%'
                   AND error NOT LIKE '%no details on%'
                   AND created_at > $2
                 ORDER BY created_at DESC LIMIT 3`,
                [nodeId, cutoff],
            ) as any[];
            if (priorSkips.length > 0) {
                priorRejections = priorSkips
                    .map((r: any) => r.error?.replace('Not reducible to test spec: ', ''))
                    .join('\n');
            }
        } catch { /* non-fatal */ }

        // Prior lab errors — feed back failed codegen attempts so re-extraction tries a different shape.
        // We pull recent failed executions where the lab itself errored (codegen, sandbox, etc.) as
        // opposed to "skipped/not reducible" which is handled by priorRejections above.
        let priorLabErrors: string | undefined;
        try {
            const recentLabErrors = await query(
                `SELECT error, hypothesis, created_at FROM lab_executions
                 WHERE node_id = $1 AND status = 'failed' AND error LIKE 'Lab error:%'
                 ORDER BY created_at DESC LIMIT 3`,
                [nodeId],
            ) as any[];
            if (recentLabErrors.length > 0) {
                priorLabErrors = recentLabErrors
                    .map((r: any, i: number) => {
                        const err = (r.error || '').replace(/^Lab error:\s*/, '').slice(0, 400);
                        const hyp = r.hypothesis ? ` (prior hypothesis: "${String(r.hypothesis).slice(0, 100)}")` : '';
                        return `${i + 1}. ${err}${hyp}`;
                    })
                    .join('\n');
            }
        } catch { /* non-fatal */ }

        let extraction;
        try {
            // Pass the pipeline signal so the watchdog can abort a hanging spec
            // extraction. Without this, a stuck LLM call blocks the slot forever.
            extraction = await extractExperimentSpec(
                nodeId, resolvedClaim, resolvedParents, node.domain,
                {
                    guidance: hints?.guidance,
                    precisionHint: hints?.precisionHint,
                    priorRejections,
                    priorLabErrors,
                    signal: hints?.signal,
                },
            );
        } catch (e: any) {
            // Rate-limit / overloaded errors are transient — don't permanently
            // fail the node. Return 'skipped' so the node stays eligible for
            // retry on the next EVM cycle instead of being marked as failed.
            const msg = (e.message || '').toLowerCase();
            const isTransient = msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')
                || msg.includes('overloaded') || msg.includes('too many requests') || msg.includes('temporarily');
            if (isTransient) {
                console.warn(`[evm] Spec extraction for ${nodeLabel(nodeId, node.content)} hit a transient error — will retry next cycle: ${e.message.slice(0, 200)}`);
                const result: VerificationResult = {
                    nodeId, status: 'skipped', error: `Spec extraction deferred (transient): ${e.message}`,
                    weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
                };
                await recordVerification(result);
                return result;
            }
            const result: VerificationResult = {
                nodeId, status: 'failed', error: `Spec extraction failed: ${e.message}`,
                weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
            };
            await recordVerification(result);
            return result;
        }

        // Not reducible — honest tag, no fake verification
        if (!extraction.reducible || !extraction.spec) {
            const result: VerificationResult = {
                nodeId,
                status: 'skipped',
                error: `Not reducible to test spec: ${extraction.reason}`,
                testCategory: extraction.claimType === 'qualitative' ? 'not_testable' : extraction.claimType as any,
                weightBefore: node.weight,
                startedAt,
                completedAt: new Date().toISOString(),
            };
            await recordVerification(result);

            emitActivity('system', 'evm_not_reducible',
                `${nodeLabel(nodeId, node.content)}: not reducible to experiment — ${extraction.reason?.slice(0, 80)}`,
                { nodeId, claimType: extraction.claimType, reason: extraction.reason });

            return result;
        }

        spec = extraction.spec;
        extractionClaimType = extraction.claimType;

        // Block the node_critique fallback for autonomous-cycle calls.
        // Critique-lab is LLM-on-LLM review and is only useful when a human explicitly
        // asks for it. Letting autonomous cycles route here turns "no real lab can test
        // this claim" into "another LLM rates the claim as good and we boost the weight" —
        // a circular weight-inflation loop. Manual verifications opt in via allowCritique.
        if (spec.specType === 'node_critique' && !hints?.allowCritique) {
            const result: VerificationResult = {
                nodeId,
                status: 'skipped',
                error: 'Critique-lab routing blocked: autonomous cycles must not invoke node_critique (set allowCritique to opt in for manual review)',
                testCategory: 'not_testable' as any,
                weightBefore: node.weight,
                startedAt,
                completedAt: new Date().toISOString(),
            };
            await recordVerification(result, { spec: JSON.stringify(spec) });
            emitActivity('system', 'evm_critique_blocked',
                `${nodeLabel(nodeId, node.content)}: critique-lab fallback blocked for autonomous call`,
                { nodeId, specType: spec.specType });
            return result;
        }

        // ENRICH CRITIQUE SPECS WITH FULL NODE CONTEXT
        if (spec.specType === 'node_critique' || spec.hints?.enrichContext) {
            try {
                const children: any[] = await query(`
                    SELECT n.id, n.content, n.node_type, n.weight, n.domain FROM edges e
                    JOIN nodes n ON n.id = e.target_id
                    WHERE e.source_id = $1 AND e.edge_type = 'parent' AND n.archived = 0
                    ORDER BY n.weight DESC LIMIT 10
                `, [nodeId]) as any[];

                const priorVerifications: any[] = await query(`
                    SELECT status, hypothesis, claim_type, confidence, error, created_at
                    FROM lab_executions WHERE node_id = $1
                    ORDER BY created_at DESC LIMIT 3
                `, [nodeId]) as any[];

                const resolvedParentContent = await Promise.all(
                    parents.map((p: any) => resolveContent(p.content))
                );
                const resolvedChildContent = await Promise.all(
                    children.slice(0, 5).map((c: any) => resolveContent(c.content))
                );

                spec.setup = {
                    ...spec.setup,
                    nodeContent: resolvedClaim,
                    domain: node.domain,
                    nodeType: node.node_type,
                    weight: node.weight,
                    salience: node.salience,
                    specificity: node.specificity,
                    contributor: node.contributor,
                    trajectory: node.trajectory,
                    createdAt: node.created_at,
                    verificationStatus: node.verification_status,
                    verificationScore: node.verification_score,
                    parentContent: resolvedParentContent.map((content: string, i: number) => ({
                        id: parents[i]?.id?.slice(0, 8),
                        type: parents[i]?.node_type,
                        weight: parents[i]?.weight,
                        domain: parents[i]?.domain,
                        content,
                    })),
                    childCount: children.length,
                    childSample: resolvedChildContent.map((content: string, i: number) => ({
                        id: children[i]?.id?.slice(0, 8),
                        type: children[i]?.node_type,
                        weight: children[i]?.weight,
                        content: content?.slice(0, 200),
                    })),
                    priorVerifications: priorVerifications.map((v: any) => ({
                        status: v.status,
                        hypothesis: v.hypothesis?.slice(0, 150),
                        claimType: v.claim_type,
                        confidence: v.confidence,
                        error: v.error?.slice(0, 200),
                        when: v.created_at,
                    })),
                };
            } catch { /* non-fatal */ }
        }
    }

    emitActivity('system', 'evm_spec_extracted',
        `${nodeLabel(nodeId, node.content)}: experiment spec — ${spec.specType}`,
        { nodeId, specType: spec.specType, hypothesis: spec.hypothesis?.slice(0, 80) });

    // ─── PRE-CHECK: verify a lab exists for this spec type ────────────
    const { getLabsForSpecType } = await import('../lab/registry.js');
    const availableLabs = await getLabsForSpecType(spec.specType);
    if (availableLabs.length === 0) {
        const result: VerificationResult = {
            nodeId,
            status: 'skipped',
            error: `No lab registered for specType "${spec.specType}"`,
            testCategory: extractionClaimType as any,
            weightBefore: node.weight,
            startedAt,
            completedAt: new Date().toISOString(),
        };
        await recordVerification(result, { spec: JSON.stringify(spec) });
        emitActivity('system', 'lab_no_lab',
            `${nodeLabel(nodeId, node.content)}: no lab for "${spec.specType}" — skipped`,
            { nodeId, specType: spec.specType });
        return result;
    }

    // ─── STAGE 2: EXECUTION (lab server) ─────────────────────────────
    let labExperiment: import('../lab/client.js').LabExperimentResult;
    let chosenLabId: string | undefined;
    let chosenLabName: string | undefined;
    try {
        // Route spec to best available lab
        const { routeSpec } = await import('../lab/routing.js');
        const chosenLab = await routeSpec(spec);
        chosenLabId = chosenLab.id;
        chosenLabName = chosenLab.name;

        emitActivity('lab', 'routed',
            `${nodeLabel(nodeId, node.content)}: routed to lab "${chosenLab.name}"`,
            { nodeId, labId: chosenLab.id, labName: chosenLab.name, specType: spec.specType });

        // Start the freeze timeout NOW - just before lab submission.
        // Spec extraction and routing ran without a deadline so semaphore
        // wait time doesn't eat into the lab's polling budget.
        if (hints?.labAbort && hints?.freezeTimeoutMs) {
            setTimeout(() => hints.labAbort!.abort(), hints.freezeTimeoutMs);
        }
        const labSignal = hints?.labAbort?.signal ?? hints?.signal;

        const templateId = chosenLab.templateId || chosenLab.id;
        labExperiment = await submitSpec(spec, templateId, { labId: chosenLab.id, labName: chosenLab.name }, {
            resumeJobId: hints?.resumeJobId,
            onJobId: hints?.onJobId,
            pollBudgetMs: hints?.freezeTimeoutMs ?? hints?.pollBudgetMs,
            signal: labSignal,
        });
    } catch (e: any) {
        const isRejection = (e as any).labRejected === true;
        if (isRejection) {
            emitActivity('lab', 'lab_rejected',
                `${nodeLabel(nodeId, node.content)}: lab "${chosenLabName || '?'}" rejected spec: ${e.message.slice(0, 100)}`,
                { nodeId, labId: chosenLabId, labName: chosenLabName, error: e.message });
            const rejResult: VerificationResult = {
                nodeId, status: 'skipped',
                error: `Lab rejected: ${e.message}`,
                weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
            };
            await recordVerification(rejResult);
            return rejResult;
        }
        const result: VerificationResult = {
            nodeId, status: 'failed', error: `Lab execution failed: ${e.message}`,
            weightBefore: node.weight, startedAt, completedAt: new Date().toISOString(),
        };
        await recordVerification(result);
        return result;
    }

    const labData = labExperiment.result;
    const labJobId = labExperiment.jobId;

    // ─── STAGE 3: MAP LAB VERDICT TO VERIFICATION RESULT ──────────────
    const isInconclusive = labData.verdict === 'inconclusive';
    const claimSupported = labData.verdict === 'supported';
    const claimRefuted = labData.verdict === 'refuted' && !isInconclusive;
    const isComplete = labData.verdict === 'supported' || labData.verdict === 'refuted' || isInconclusive;
    const isError = labData.verdict === 'error';

    // Determine if we should defer consequences for chaining
    const chainDepth = hints?.chainDepth ?? 0;
    const { shouldChain } = await import('./chaining.js');
    const willChain = isComplete
        && hints?.chainType !== 'critique'  // Don't chain critique results
        && shouldChain(labData.verdict, chainDepth, hints?.chainType, spec.specType);
    const deferConsequences = willChain && (config.lab?.chaining?.deferConsequences ?? true);

    const result: VerificationResult = {
        nodeId,
        status: isError ? 'failed' : isComplete ? 'completed' : 'skipped',
        testCategory: (labData.testCategory || extractionClaimType) as any,
        evaluation: isComplete ? {
            verified: claimSupported,
            // Inconclusive = neither supported nor refuted — do NOT penalize
            // Preserve the lab's actual confidence so the GUI can display it accurately.
            // Weight/archive/taint logic guards on the inconclusive flag, not on confidence=0.
            claimSupported: isInconclusive ? null as any : claimSupported,
            confidence: labData.confidence,
            score: isInconclusive ? 0 : labData.confidence,
            mode: 'boolean' as any,
            details: labData.details || `Lab verdict: ${labData.verdict}`,
            // Carry through any structured payload the lab attached (critique decisions,
            // measurement summaries, etc.). The GUI renders this as fields rather than
            // shoving everything into the prose `details` blob as escaped JSON.
            structuredDetails: liftStructuredDetails(labData),
            rawOutput: labData.details || null,
            inconclusive: isInconclusive,
        } : undefined,
        codegen: {
            hypothesis: labData.hypothesis || spec.hypothesis,
            claimType: (spec.claimType || 'unknown') as any,
            code: '', expectedBehavior: '', evaluationMode: 'boolean' as any,
            assertionPolarity: 'positive' as any, raw: '',
        },
        weightBefore: node.weight,
        error: isError ? `Lab error: ${labData.error || 'unknown'}` :
               !isComplete ? `Lab verdict: ${labData.verdict} — ${labData.details || ''}` : undefined,
        startedAt,
        completedAt: new Date().toISOString(),
    };

    // Record verification with traceability metadata
    await recordVerification(result, {
        labJobId,
        labId: chosenLabId,
        labName: chosenLabName,
        spec: JSON.stringify(spec),
        deferConsequences,
        chainParentExecutionId: hints?.chainParentExecutionId,
        chainType: hints?.chainType,
    });

    // Write inline evidence to lab_executions.evidence so the GUI can render
    // VerdictCard and SpecCard without needing the separate lab_evidence table.
    try {
        const inlineEvidence: Array<{ type: string; label: string; data: string }> = [];

        // Verdict evidence (renders as VerdictCard in GUI)
        const verdictPayload: Record<string, unknown> = {
            verdict: labData.verdict,
            confidence: labData.confidence,
            hypothesis: labData.hypothesis,
            testCategory: labData.testCategory,
            details: labData.details,
        };
        if (labData.structuredDetails) verdictPayload.structuredDetails = labData.structuredDetails;
        inlineEvidence.push({ type: 'json', label: 'verdict', data: JSON.stringify(verdictPayload) });

        // Spec evidence (renders as SpecCard in GUI)
        inlineEvidence.push({ type: 'json', label: 'spec', data: JSON.stringify(spec) });

        await query(
            `UPDATE lab_executions SET evidence = $1
             WHERE node_id = $2 AND created_at = (SELECT MAX(created_at) FROM lab_executions WHERE node_id = $2)`,
            [JSON.stringify(inlineEvidence), nodeId],
        );
    } catch (e: any) {
        console.error(`[lab] Inline evidence write failed: ${e.message}`);
    }

    // Pull artifact zip from lab and store in evidence
    let artifactZipId: string | undefined;
    try {
        const { getLab } = await import('../lab/registry.js');
        const lab = chosenLabId ? await getLab(chosenLabId) : null;

        if (lab) {
            const { pullArtifactZip } = await import('../lab/evidence.js');
            artifactZipId = await pullArtifactZip(lab, labJobId, nodeId, node.domain, null);
            emitActivity('lab', 'artifacts_pulled',
                `${nodeLabel(nodeId, node.content)}: pulled artifact zip from "${chosenLabName}"`,
                { nodeId, labJobId, labId: chosenLabId, artifactZipId });
        }
    } catch (e: any) {
        emitActivity('lab', 'artifact_pull_failed',
            `${nodeLabel(nodeId, node.content)}: artifact pull failed: ${e.message}`,
            { nodeId, labJobId, error: e.message });
    }

    // Also store verdict to lab_evidence table for artifact-based queries
    try {
        const { storeEvidence } = await import('../lab/evidence.js');
        const { getLab } = await import('../lab/registry.js');
        const lab = chosenLabId ? await getLab(chosenLabId) : null;
        await storeEvidence(null, nodeId, node.domain, labData, spec, lab?.url || '');
    } catch (e: any) {
        console.error(`[lab] Evidence storage failed: ${e.message}`);
    }

    // Update execution record with artifact zip ID
    if (artifactZipId) {
        try {
            await query(
                `UPDATE lab_executions SET artifact_zip_id = $1
                 WHERE node_id = $2 AND created_at = (SELECT MAX(created_at) FROM lab_executions WHERE node_id = $2)`,
                [artifactZipId, nodeId],
            );
        } catch { /* non-fatal */ }
    }

    const verdictMsg = isError
        ? `ERROR via ${chosenLabName || 'unknown'}: ${labData.error || 'unknown'}`
        : `${claimSupported ? 'SUPPORTED' : 'REFUTED'} (confidence: ${labData.confidence?.toFixed(2) || '?'}) via ${chosenLabName || 'unknown'}${deferConsequences ? ' [deferred — awaiting critique]' : ''}`;
    emitActivity('system', 'lab_complete',
        `${nodeLabel(nodeId, node.content)}: ${verdictMsg}`,
        { nodeId, claimSupported, confidence: labData.confidence, specType: spec.specType,
          labJobId, labId: chosenLabId, labName: chosenLabName, verdict: labData.verdict,
          deferred: deferConsequences });

    // Timeline marker for journal
    try {
        const { createTimelineMarker } = await import('../core/journal.js');
        await createTimelineMarker('lab_verdict', `Lab: ${isError ? 'ERROR' : claimSupported ? 'SUPPORTED' : 'REFUTED'} — ${node.content?.slice(0, 80)}`, {
            nodeId, verdict: labData.verdict, confidence: labData.confidence,
            specType: spec.specType, labName: chosenLabName,
            deferred: deferConsequences,
        }, 'lab');
    } catch { /* journal may not be ready yet */ }

    // ─── LAB CHAINING: HANDLE CRITIQUE RESULTS ──────────────────────
    // When this is a critique chain job returning a result, process the critique
    // decision (confirm/correct/retest) and apply or adjust deferred consequences.
    if (hints?.chainType === 'critique' && hints?.chainParentExecutionId) {
        try {
            const { handleCritiqueResult } = await import('./chaining.js');
            // The critique lab's verdict about the methodology is in labData
            await handleCritiqueResult(
                nodeId,
                labData,
                hints.chainParentExecutionId,
                hints.queueEntryId ?? 0,
                chainDepth,
            );
        } catch (e: any) {
            console.error(`[chaining] Failed to handle critique result: ${e.message}`);
            emitActivity('lab', 'chain_critique_error',
                `${nodeLabel(nodeId, node.content)}: critique result handling failed: ${e.message}`,
                { nodeId, error: e.message });
        }
        return result;
    }

    // ─── LAB CHAINING: TRIGGER CRITIQUE ──────────────────────────────
    // For completed experiments, auto-forward to critique lab if chaining is enabled.
    if (willChain) {
        try {
            const { buildExperimentReviewSpec, enqueueCritique } = await import('./chaining.js');
            const reviewSpec = await buildExperimentReviewSpec(
                nodeId, spec, labData, labJobId, chosenLabName || 'unknown',
            );
            // Get the execution ID for the parent reference
            const latestExec: any = await queryOne(
                `SELECT id FROM lab_executions WHERE node_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [nodeId],
            );
            if (latestExec?.id) {
                await enqueueCritique(nodeId, reviewSpec, hints?.queueEntryId ?? 0, chainDepth);
            }
        } catch (e: any) {
            console.error(`[chaining] Failed to enqueue critique: ${e.message}`);
            emitActivity('lab', 'chain_enqueue_error',
                `${nodeLabel(nodeId, node.content)}: failed to enqueue critique — applying consequences immediately`,
                { nodeId, error: e.message });
            // Fallback: if chaining fails, apply consequences immediately
            if (deferConsequences && result.evaluation) {
                const { applyDeferredConsequences } = await import('./chaining.js');
                const latestExec: any = await queryOne(
                    `SELECT id FROM lab_executions WHERE node_id = $1 ORDER BY created_at DESC LIMIT 1`,
                    [nodeId],
                );
                if (latestExec?.id) {
                    await applyDeferredConsequences(
                        latestExec.id, nodeId,
                        result.evaluation.claimSupported,
                        result.evaluation.confidence,
                    );
                }
            }
        }
        return result;
    }

    // ─── POST-VERIFICATION (only for non-chained results) ────────────

    // API enrichment
    if (config.labVerify.apiVerification?.enabled && !isBudgetExceeded()) {
        try {
            const { runApiVerification } = await import('./api/orchestrator.js');
            const apiResult = await runApiVerification(nodeId, node.content, node.domain);
            if (apiResult.totalCorrections > 0 || apiResult.totalEnrichments > 0) {
                emitActivity('api', 'api_verification_complete',
                    `API verification for ${nodeLabel(nodeId, node.content)}: ${apiResult.totalCorrections} corrections, ${apiResult.totalEnrichments} enrichments`,
                    { nodeId, corrections: apiResult.totalCorrections, enrichments: apiResult.totalEnrichments });
            }
        } catch (e: any) {
            emitActivity('system', 'api_verification_error', `API verification failed: ${e.message}`, { nodeId });
        }
    }

    // Elite promotion
    if (claimSupported && config.elitePool?.enabled) {
        try {
            const { promoteToElite } = await import('../core/elite-pool.js');
            await promoteToElite(nodeId, result);
        } catch (e: any) {
            emitActivity('system', 'elite_promotion_error', `Elite promotion failed: ${e.message}`, { nodeId });
        }
    }

    // ─── AUTO-RETEST: feed lab feedback back as guidance ───────────────
    // When the lab returns a verdict with improvement suggestions, untested
    // claims, or tautology warnings, re-enqueue the node so the spec
    // extractor produces a stronger test. Applies to both inconclusive
    // (weak test) and low-confidence verdicts (test ran but wasn't convincing).
    const autoRetest = config.labVerify.autoRetest;
    if (autoRetest?.enabled && isComplete && result.evaluation) {
        const sd = result.evaluation.structuredDetails || {};
        const suggestions = sd.suggestedFollowUp as string | undefined;
        const untestedClaims = sd.untestedClaims as string[] | undefined;
        const tautologyRisk = sd.tautologyRisk as string | undefined;
        const conf = result.evaluation.confidence ?? 1;
        const threshold = autoRetest.confidenceThreshold ?? 0.75;
        const maxRetests = autoRetest.maxRetests ?? 2;

        // Trigger retest when: low confidence, high tautology risk, or significant untested claims
        const needsRetest = conf < threshold
            || tautologyRisk === 'high'
            || (untestedClaims && untestedClaims.length > 0 && conf < 0.5);

        if (needsRetest && (suggestions || untestedClaims || tautologyRisk)) {
            try {
                const priorCount = await query(
                    `SELECT COUNT(*) as c FROM lab_executions WHERE node_id = $1 AND status = 'completed'`,
                    [nodeId],
                ) as any[];
                const completedCount = priorCount[0]?.c ?? 0;

                if (completedCount <= maxRetests) {
                    const { enqueue } = await import('./queue.js');
                    const parts: string[] = [];
                    parts.push(`Previous test verdict: ${labData.verdict} (confidence ${(conf * 100).toFixed(0)}%)`);
                    if (tautologyRisk === 'high') {
                        parts.push('WARNING: Previous test had HIGH TAUTOLOGY RISK - the code computed the claimed result by construction rather than testing it. The new spec MUST use a different computational approach that can genuinely fail.');
                    }
                    if (untestedClaims?.length) {
                        parts.push(`Untested claims that MUST be addressed: ${untestedClaims.join('; ')}`);
                    }
                    if (suggestions) {
                        parts.push(`Suggested improvements: ${suggestions}`);
                    }
                    await enqueue(nodeId, {
                        guidance: parts.join('\n'),
                        queuedBy: 'autonomous',
                        priority: -1,
                    });
                    emitActivity('lab', 'auto_retest',
                        `${nodeLabel(nodeId, node.content)}: auto-retest enqueued (${tautologyRisk === 'high' ? 'tautology' : `conf ${(conf * 100).toFixed(0)}%`}, attempt ${completedCount + 1}/${maxRetests + 1})`,
                        { nodeId, confidence: conf, tautologyRisk, untestedCount: untestedClaims?.length, attempt: completedCount + 1 });
                }
            } catch { /* non-fatal */ }
        }
    }

    return result;
}

// Re-export query functions
export { getNodeVerifications, getEVMStats, getRecentExecutions };

/**
 * Pull a structured payload off a LabResultResponse.
 *
 * Preferred shape: lab populates `structuredDetails` directly with an object.
 * Legacy shape: lab stuffed a JSON-encoded object into `details`. We rescue
 * those rows here so the GUI sees structured data either way and old labs
 * (or backfilled rows from before this contract change) keep working.
 */
function liftStructuredDetails(labData: { details?: string; structuredDetails?: Record<string, unknown> }): Record<string, unknown> | undefined {
    if (labData.structuredDetails && typeof labData.structuredDetails === 'object') {
        return labData.structuredDetails;
    }
    if (typeof labData.details === 'string') {
        const trimmed = labData.details.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(labData.details);
                if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
            } catch { /* not actually JSON */ }
        }
    }
    return undefined;
}
