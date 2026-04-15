/**
 * Lab Queue Worker - pulls jobs from the persistent queue and submits to lab servers.
 *
 * The worker is simple: claim entry -> freeze -> submit to lab -> handle result -> unfreeze.
 * All triage, codegen, execution, and evaluation happens in the lab server.
 * Podbit only decides to test, submits claims, and applies graph consequences.
 *
 * Supports concurrent submissions: fills up to maxConcurrent slots per poll tick.
 *
 * Self-healing:
 *   - Tick overlap guard prevents concurrent recovery + fillSlots races
 *   - Recovery serialized before fillSlots to prevent write contention
 *   - Circuit breaker cancels entries stuck > 1.5x watchdog threshold or recovered > MAX_RECOVERIES
 *   - Orphaned lab jobs are cancelled when queue entries are cancelled or recovered
 *   - processNextEntry is a no-op outside the server process (prevents MCP/proxy inflight conflicts)
 *
 * Usage:
 *   startQueueWorker()   - called on server startup
 *   stopQueueWorker()    - called on graceful shutdown
 *   processNextEntry()   - can be called manually for immediate drain
 */

import { nextPending, completeEntry, releaseEntry, requeueFailed, clearNodeQueueStatus } from './queue.js';
import { dbDateMs, dbDateAgeSeconds } from '../utils/datetime.js';
import { query } from '../core.js';
import { emitActivity } from '../services/event-bus.js';
import { isBudgetExceeded } from '../models/budget.js';
import { config as appConfig } from '../config.js';
import { RC } from '../config/constants.js';
import { freezeNode, unfreezeNode } from '../lab/freeze.js';
import { getTemplate } from '../lab/templates.js';

// =========================================================================
// State
// =========================================================================

let workerTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;
let tickRunning = false;

/** In-flight jobs: entryId -> { startedAt, abort, nodeId } */
const inflight = new Map<number, { startedAt: number; abort: AbortController; nodeId: string }>();

/** In-flight abort controllers: nodeId -> AbortController[] (a node may have multiple inflight entries) */
const inflightAborts = new Map<string, AbortController[]>();

/** Recovery counter: entryId -> number of times recovered. Prevents infinite loops. */
const recoveryCount = new Map<number, number>();

/** Max times an entry can be recovered before being cancelled */
const MAX_RECOVERIES = 5;

/** Max concurrent jobs - read from config, default 3 */
function getMaxConcurrent(): number {
    return appConfig.lab?.maxConcurrentVerifications ?? 3;
}

// =========================================================================
// Worker Lifecycle
// =========================================================================

/**
 * Start the background worker. Polls lab_queue every intervalMs.
 * No-op if already running.
 */
export function startQueueWorker(intervalMs = RC.timeouts.queuePollingMs): void {
    if (workerTimer) return;
    stopped = false;

    workerTimer = setInterval(() => {
        // Guard: skip this tick if the previous tick is still running.
        // Prevents concurrent recovery + fillSlots from racing each other.
        if (tickRunning) return;
        tickRunning = true;

        (async () => {
            // Watchdog: abort and fail jobs that exceed the wall-clock deadline.
            // This covers the ENTIRE pipeline (spec extraction + lab + eval), not
            // just the lab polling phase. Without this, a hanging LLM call in spec
            // extraction blocks the slot forever.
            const maxMs = (appConfig.lab?.freezeTimeoutMs ?? 600_000) + 60_000;
            for (const [entryId, job] of inflight) {
                const stuckMs = Date.now() - job.startedAt;
                if (stuckMs > maxMs) {
                    const stuckSec = Math.round(stuckMs / 1000);
                    console.error(`[lab-queue-worker] Watchdog: entry ${entryId} stuck for ${stuckSec}s - aborting and failing`);
                    emitActivity('system', 'evm_queue_worker', `Watchdog killed entry ${entryId} after ${stuckSec}s`, { queueId: entryId, nodeId: job.nodeId });

                    // Abort the running pipeline - propagates to LLM calls and lab polling
                    job.abort.abort();

                    // Mark DB entry as failed so it doesn't get re-recovered as an orphan
                    try {
                        await completeEntry(entryId, null, `Watchdog: stuck for ${stuckSec}s - aborted`);
                        await clearNodeQueueStatus(job.nodeId);
                    } catch { /* non-fatal */ }
                    try { await unfreezeNode(job.nodeId); } catch { /* non-fatal */ }

                    inflight.delete(entryId);
                }
            }

            // Recover orphaned entries BEFORE filling slots to prevent races.
            await _recoverOrphanedEntries().catch(() => {});

            await fillSlots().catch(err => {
                console.error('[lab-queue-worker] Fill error:', err.message);
            });
        })().finally(() => { tickRunning = false; });
    }, intervalMs);

    const max = getMaxConcurrent();
    console.error(`[lab-queue-worker] Started (poll every ${intervalMs}ms, maxConcurrent: ${max})`);
    emitActivity('system', 'evm_queue_worker', 'Lab queue worker started', { intervalMs, maxConcurrent: max });
}

/**
 * Stop the worker gracefully. Aborts in-flight jobs and waits briefly for cleanup.
 */
export async function stopQueueWorker(): Promise<void> {
    stopped = true;
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
    }

    // Abort all in-flight jobs so they don't keep running as zombies
    for (const [, job] of inflight) {
        job.abort.abort();
    }

    const maxWait = 15_000;
    const start = Date.now();
    while (inflight.size > 0 && Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 500));
    }

    console.error('[lab-queue-worker] Stopped');
    emitActivity('system', 'evm_queue_worker', 'Lab queue worker stopped');
}

// =========================================================================
// Slot Filler - claims entries up to maxConcurrent
// =========================================================================

async function fillSlots(): Promise<void> {
    if (stopped) return;
    const max = getMaxConcurrent();
    while (inflight.size < max) {
        if (isBudgetExceeded()) break;
        const started = await _claimAndStart();
        if (!started) break;
    }
}

/** Exposed for manual trigger from verifyNode / MCP handlers.
 *  No-op if the queue worker hasn't been started (e.g. in the MCP process).
 *  Without this guard, separate processes maintain independent inflight maps,
 *  causing the server's recovery to reset entries another process is still processing. */
export async function processNextEntry(): Promise<boolean> {
    if (!workerTimer) return false;   // queue worker not started (MCP, proxy, etc.)
    if (stopped) return false;
    if (inflight.size >= getMaxConcurrent()) return false;
    return _claimAndStart();
}

// =========================================================================
// Core Processing - one entry at a time
// =========================================================================

async function _claimAndStart(): Promise<boolean> {
    if (stopped) return false;
    if (inflight.size >= getMaxConcurrent()) return false;

    const entry = await nextPending();
    if (!entry) return false;

    // Create a pipeline-wide abort controller. The watchdog fires this if the
    // entire entry (spec extraction + lab + eval) exceeds the wall-clock limit.
    const pipelineAbort = new AbortController();

    // Clear recovery counter - this entry is being actively processed now
    recoveryCount.delete(entry.id);
    inflight.set(entry.id, { startedAt: Date.now(), abort: pipelineAbort, nodeId: entry.node_id });

    // Run the full pipeline in background - don't await
    _executeEntry(entry, pipelineAbort).finally(() => {
        inflight.delete(entry.id);
        // Try to fill the freed slot immediately, but NOT if a tick is
        // already running (recovery + fillSlots). Concurrent fillSlots
        // calls cause write contention on the SQLite write queue.
        if (!stopped && !tickRunning) fillSlots();
    });

    return true;
}

async function _executeEntry(entry: any, pipelineAbort: AbortController): Promise<void> {
    let frozeNode = false;
    // Use the pipeline-wide abort controller. The watchdog fires this if the
    // entry exceeds the wall-clock limit, covering spec extraction + lab + eval.
    const jobAbort = pipelineAbort;
    const nodeAborts = inflightAborts.get(entry.node_id) || [];
    nodeAborts.push(jobAbort);
    inflightAborts.set(entry.node_id, nodeAborts);

    try {
        // Freeze node while lab experiment runs
        const template = entry.template_id ? await getTemplate(entry.template_id) : null;
        const shouldFreeze = template?.outcomeConfig?.freezeOnStart
            ?? appConfig.lab?.freezeOnExperiment ?? true;
        if (shouldFreeze) {
            await freezeNode(entry.node_id, String(entry.id));
            frozeNode = true;
        }

        // Budget gate
        if (isBudgetExceeded()) {
            await releaseEntry(entry.id);
            emitActivity('system', 'evm_queue_worker',
                `Queue entry ${entry.id} released (budget exceeded)`,
                { queueId: entry.id, nodeId: entry.node_id });
            return;
        }

        // Submit claim to lab - verifyNodeInternal handles everything
        const { verifyNodeInternal } = await import('./index.js');
        const freezeTimeoutMs = appConfig.lab?.freezeTimeoutMs ?? 600_000;

        // The freeze timeout governs the LAB POLLING phase only - not spec
        // extraction or LLM queue waits. The AbortController and timer are
        // created here but only attached to the lab submission via hints.
        // Spec extraction runs without a deadline so semaphore contention
        // doesn't eat into the lab's polling budget.
        // Timer is started later by verifyNodeInternal just before lab submission
        const freezeTimer: ReturnType<typeof setTimeout> | null = null;

        // Build hints - include chain context if this is a chain job
        const hints: import('./types.js').VerifyHints = {
            pollBudgetMs: freezeTimeoutMs,
            // Signal covers the ENTIRE pipeline (spec extraction + lab + eval).
            // The watchdog fires jobAbort if the wall-clock limit is exceeded.
            signal: jobAbort.signal,
            labAbort: jobAbort,
            freezeTimeoutMs,
        };
        // Manual queue entries (human-invoked via MCP/UI) opt into critique-lab fallback;
        // autonomous / retry / bulk entries do not - see verifyNodeInternal node_critique guard.
        if (entry.queued_by === 'manual') hints.allowCritique = true;
        if (entry.guidance) hints.guidance = entry.guidance;
        if (entry.chain_spec) {
            try { hints.chainSpec = JSON.parse(entry.chain_spec); } catch { /* malformed spec */ }
        }
        if (entry.chain_type) hints.chainType = entry.chain_type as any;
        if (entry.chain_depth) hints.chainDepth = entry.chain_depth;
        (hints as any).queueEntryId = entry.id;

        // Resume polling if this entry already has a lab job ID (recovery after restart)
        if (entry.external_job_id) {
            hints.resumeJobId = entry.external_job_id;
            hints.resumeTemplateId = entry.template_id || undefined;
            console.error(`[lab-queue-worker] Resuming job ${entry.external_job_id} for entry ${entry.id}`);
        }

        // Persist lab jobId (and templateId for recovery) to queue entry immediately after submission
        hints.onJobId = async (jobId: string, templateId?: string) => {
            try {
                const { setExternalJobId } = await import('./queue.js');
                await setExternalJobId(entry.id, jobId, templateId);
            } catch { /* non-fatal */ }
        };

        // For critique chain jobs, find the parent execution ID
        if (entry.chain_type === 'critique') {
            try {
                if (entry.chain_parent_id != null && entry.chain_parent_id > 0) {
                    const parentEntry = await import('../core.js').then(m =>
                        m.queryOne('SELECT execution_id FROM lab_queue WHERE id = $1', [entry.chain_parent_id])
                    ) as any;
                    if (parentEntry?.execution_id) {
                        hints.chainParentExecutionId = parentEntry.execution_id;
                    }
                }
                if (!hints.chainParentExecutionId) {
                    const latestExec = await import('../core.js').then(m =>
                        m.queryOne(
                            `SELECT id FROM lab_executions WHERE node_id = $1 AND chain_status = 'pending_review' ORDER BY created_at DESC LIMIT 1`,
                            [entry.node_id],
                        )
                    ) as any;
                    if (latestExec?.id) hints.chainParentExecutionId = latestExec.id;
                }
                if (!hints.chainParentExecutionId) {
                    const latestDeferred = await import('../core.js').then(m =>
                        m.queryOne(
                            `SELECT id FROM lab_executions WHERE node_id = $1 AND status = 'completed' ORDER BY created_at DESC LIMIT 1`,
                            [entry.node_id],
                        )
                    ) as any;
                    if (latestDeferred?.id) hints.chainParentExecutionId = latestDeferred.id;
                }
            } catch { /* non-fatal */ }
        }

        let result: import('./types.js').VerificationResult;
        try {
            result = await verifyNodeInternal(
                entry.node_id,
                undefined,
                Object.keys(hints).length > 0 ? hints : undefined,
            );
        } finally {
            if (freezeTimer) clearTimeout(freezeTimer);
        }

        // Budget exceeded mid-pipeline - release back
        if (result.status === 'skipped' && result.error?.includes('Budget exceeded')) {
            await releaseEntry(entry.id);
            emitActivity('system', 'evm_queue_worker',
                `Queue entry ${entry.id} released (budget exceeded)`,
                { queueId: entry.id, nodeId: entry.node_id });
            return;
        }

        // Handle result
        if (result.status === 'failed' || result.status === 'code_error') {
            await completeEntry(entry.id, null, result.error || 'Lab verification failed');
            const { requeued } = await requeueFailed(entry.id);
            if (requeued) {
                emitActivity('system', 'evm_queue_worker',
                    `Queue entry ${entry.id} failed - requeued (retry ${entry.retry_count + 1}/${entry.max_retries})`,
                    { queueId: entry.id, nodeId: entry.node_id, retry: entry.retry_count + 1 });
            } else {
                emitActivity('system', 'evm_queue_worker',
                    `Queue entry ${entry.id} failed - max retries reached`,
                    { queueId: entry.id, nodeId: entry.node_id });
            }
        } else {
            await completeEntry(entry.id, null);
        }

        await clearNodeQueueStatus(entry.node_id);
    } catch (err: any) {
        console.error(`[lab-queue-worker] Error processing entry ${entry.id}:`, err.message);
        try {
            await completeEntry(entry.id, null, `Worker error: ${err.message}`);
            const { requeued } = await requeueFailed(entry.id);
            if (!requeued) {
                await clearNodeQueueStatus(entry.node_id);
            }
        } catch { /* non-fatal cleanup */ }
    } finally {
        // Clean up abort controller from the per-node map
        const aborts = inflightAborts.get(entry.node_id);
        if (aborts) {
            const idx = aborts.indexOf(jobAbort);
            if (idx >= 0) aborts.splice(idx, 1);
            if (aborts.length === 0) inflightAborts.delete(entry.node_id);
        }
        if (frozeNode) {
            try { await unfreezeNode(entry.node_id); } catch { /* non-fatal */ }
        }
    }
}

// =========================================================================
// Orphaned Entry Recovery
// =========================================================================

/**
 * Find entries stuck in 'processing' in the DB that are NOT in our in-memory
 * inflight map. These are orphans from crashes or prior process instances.
 * Reset them to 'pending' so they get picked up again.
 */
async function _recoverOrphanedEntries(): Promise<void> {
    try {
        // 1. Reset 'processing' entries not tracked in memory (crash orphans).
        // Only recover entries stuck for > 60s to avoid racing with fillSlots -
        // an entry just claimed by nextPending() may not be in the inflight map yet.
        const stuck = await query(
            "SELECT id, node_id, started_at, external_job_id FROM lab_queue WHERE status = 'processing' AND (started_at IS NULL OR started_at < datetime('now', '-60 seconds'))",
            [],
        );
        for (const row of stuck) {
            const r = row as any;
            if (!inflight.has(r.id)) {
                const stuckSince = r.started_at ? dbDateAgeSeconds(r.started_at) : '?';
                const count = (recoveryCount.get(r.id) || 0) + 1;
                recoveryCount.set(r.id, count);

                // Entries stuck for > 1.5x the watchdog threshold are hopelessly orphaned.
                // Cancel immediately instead of wasting recovery cycles.
                const watchdogMs = (appConfig.lab?.freezeTimeoutMs ?? 600_000) + 60_000;
                const maxStuckMs = Math.round(watchdogMs * 1.5);
                const stuckMs = r.started_at ? Date.now() - dbDateMs(r.started_at) : maxStuckMs + 1;
                if (stuckMs > maxStuckMs || count > MAX_RECOVERIES) {
                    const reason = stuckMs > maxStuckMs
                        ? `stuck ${Math.round(stuckMs / 1000)}s (> ${Math.round(maxStuckMs / 1000)}s max)`
                        : `recovered ${count} times`;
                    console.error(`[lab-queue-worker] Entry ${r.id} (node ${String(r.node_id).slice(0, 8)}) ${reason} - cancelling`);
                    emitActivity('system', 'evm_queue_worker',
                        `Cancelled entry ${r.id}: ${reason}`,
                        { queueId: r.id, nodeId: r.node_id });
                    await query(
                        `UPDATE lab_queue SET status = 'cancelled', error = 'Cancelled: ${reason}', completed_at = datetime('now') WHERE id = $1`,
                        [r.id],
                    );
                    recoveryCount.delete(r.id);
                    // Cancel the orphaned job in the lab so it doesn't waste lab resources
                    await _cancelLabJob(r.external_job_id, r.id);
                    try { await unfreezeNode(r.node_id); } catch { /* non-fatal */ }
                    try { await clearNodeQueueStatus(r.node_id); } catch { /* non-fatal */ }
                    continue;
                }

                console.error(`[lab-queue-worker] Recovering orphaned entry ${r.id} (node ${String(r.node_id).slice(0, 8)}, stuck ${stuckSince}s, recovery #${count}) - resetting to pending`);
                emitActivity('system', 'evm_queue_worker', `Recovered orphaned entry ${r.id} (stuck ${stuckSince}s, attempt ${count})`, { queueId: r.id, nodeId: r.node_id });
                await query(
                    "UPDATE lab_queue SET status = 'pending', started_at = NULL WHERE id = $1 AND status = 'processing'",
                    [r.id],
                );
                // Cancel the orphaned lab job - a fresh submission will happen when the entry is re-claimed
                await _cancelLabJob(r.external_job_id, r.id);
                try { await unfreezeNode(r.node_id); } catch { /* non-fatal */ }
            }
        }

        // 2. Check 'pending' entries that already have a lab job ID - the lab may
        // have already completed the job. Peek at the lab to avoid re-submitting
        // a duplicate. If the lab reports 'completed' or 'failed', fast-track
        // by resetting the entry so the worker resumes polling (which will
        // immediately fetch the result via the resumeJobId path).
        // This is cheap: one GET /status per orphan per tick.
        const pendingWithJob = await query(
            "SELECT id, node_id, external_job_id, template_id FROM lab_queue WHERE status = 'pending' AND external_job_id IS NOT NULL",
            [],
        );
        // Limit to 5 per tick to avoid blocking the worker
        for (const row of pendingWithJob.slice(0, 5)) {
            const r = row as any;
            try {
                const { checkStatus } = await import('../lab/client.js');
                const { getTemplate: getT } = await import('../lab/templates.js');
                const { getLab, listLabs } = await import('../lab/registry.js');

                // Build list of labs to try: specific template first, then all enabled labs
                const labsToTry: Array<{ id: string; template: any }> = [];
                if (r.template_id) {
                    let template = await getT(r.template_id);
                    if (!template) {
                        const lab = await getLab(r.template_id);
                        if (lab) {
                            template = {
                                id: lab.id, name: lab.name, description: lab.description, systemTemplate: false,
                                executionConfig: { url: lab.url, authType: lab.authType, authKey: lab.authCredential || undefined, authHeader: lab.authHeader || undefined },
                                triageConfig: null,
                                pollConfig: { strategy: 'interval', pollIntervalMs: 2000, maxPollAttempts: 300, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
                                interpretConfig: null, outcomeConfig: {}, evidenceSchema: null, budgetConfig: null,
                                createdAt: lab.createdAt, updatedAt: lab.updatedAt,
                            };
                        }
                    }
                    if (template) labsToTry.push({ id: r.template_id, template });
                }
                // Fallback: try all enabled labs (the job might have been routed to any of them)
                if (labsToTry.length === 0) {
                    const allLabs = await listLabs();
                    for (const lab of allLabs.filter((l: any) => l.enabled)) {
                        labsToTry.push({
                            id: lab.id,
                            template: {
                                id: lab.id, name: lab.name, description: lab.description, systemTemplate: false,
                                executionConfig: { url: lab.url, authType: lab.authType, authKey: lab.authCredential || undefined, authHeader: lab.authHeader || undefined },
                                triageConfig: null,
                                pollConfig: { strategy: 'interval', pollIntervalMs: 2000, maxPollAttempts: 300, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
                                interpretConfig: null, outcomeConfig: {}, evidenceSchema: null, budgetConfig: null,
                                createdAt: lab.createdAt, updatedAt: lab.updatedAt,
                            },
                        });
                    }
                }

                let found = false;
                for (const { id: labId, template } of labsToTry) {
                    try {
                        const status = await checkStatus(template, r.external_job_id);
                        if (status.status === 'failed') {
                            console.error(`[lab-queue-worker] Lab job ${r.external_job_id} already failed in ${labId} for entry ${r.id} - clearing stale job ID`);
                            await query(
                                "UPDATE lab_queue SET external_job_id = NULL WHERE id = $1",
                                [r.id],
                            );
                        } else if (status.status === 'completed') {
                            console.error(`[lab-queue-worker] Lab job ${r.external_job_id} already completed in ${labId} for entry ${r.id} - will fetch result on next slot`);
                            // Store the lab's template_id so the resume fast-path knows where to poll
                            if (!r.template_id) {
                                await query("UPDATE lab_queue SET template_id = $1 WHERE id = $2", [labId, r.id]);
                            }
                        }
                        found = true;
                        break; // Found the lab that has this job
                    } catch (labErr: any) {
                        if (labErr.message?.includes('404')) continue; // Not in this lab, try next
                        throw labErr; // Network error - propagate
                    }
                }

                if (!found) {
                    // No lab has this job - clear stale job ID
                    console.error(`[lab-queue-worker] No lab has job ${r.external_job_id} for entry ${r.id} - clearing stale job ID`);
                    await query(
                        "UPDATE lab_queue SET external_job_id = NULL WHERE id = $1",
                        [r.id],
                    );
                }
            } catch (err: any) {
                const is404 = err.message?.includes('404');
                if (is404) {
                    // Job was deleted from the lab - clear immediately, no point retrying
                    console.error(`[lab-queue-worker] Lab job gone (404) for entry ${r.id} - clearing stale job ID`);
                    try {
                        await query("UPDATE lab_queue SET external_job_id = NULL, poll_count = 0 WHERE id = $1", [r.id]);
                    } catch { /* non-fatal */ }
                } else {
                    // Lab unreachable - clear stale job ID after 3 consecutive failures
                    console.error(`[lab-queue-worker] Status check failed for entry ${r.id}: ${err.message}`);
                    try {
                        const pollCount = (r.poll_count || 0) + 1;
                        if (pollCount >= 3) {
                            console.error(`[lab-queue-worker] Entry ${r.id} failed status check 3 times - clearing stale job ID`);
                            await query("UPDATE lab_queue SET external_job_id = NULL, poll_count = 0 WHERE id = $1", [r.id]);
                        } else {
                            await query("UPDATE lab_queue SET poll_count = $1 WHERE id = $2", [pollCount, r.id]);
                        }
                    } catch { /* DB write failed - will retry next tick */ }
                }
            }
        }
    } catch (err: any) {
        console.error(`[lab-queue-worker] Recovery error: ${err.message}`);
    }
}

// =========================================================================
// Lab Job Cancellation
// =========================================================================

/**
 * Cancel an orphaned job in the lab server. Best-effort - the lab might be
 * unreachable or the job might already be completed. Failures are logged
 * but never block the queue worker.
 */
async function _cancelLabJob(externalJobId: string | null, entryId: number): Promise<void> {
    if (!externalJobId) return;
    try {
        const entry = await query(
            "SELECT template_id FROM lab_queue WHERE id = $1",
            [entryId],
        );
        const templateId = (entry[0] as any)?.template_id || 'math-lab';
        const { getLab } = await import('../lab/registry.js');
        const lab = await getLab(templateId);
        if (!lab?.url) return;

        const url = `${lab.url}/jobs/${externalJobId}/cancel`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (lab.authType === 'bearer' && lab.authCredential) {
            headers['Authorization'] = `Bearer ${lab.authCredential}`;
        } else if (lab.authType === 'api_key' && lab.authCredential) {
            headers[lab.authHeader || 'X-API-Key'] = lab.authCredential;
        }

        const resp = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
            console.error(`[lab-queue-worker] Cancelled orphaned lab job ${externalJobId} for entry ${entryId}`);
        }
        // 409 = already completed/cancelled, which is fine
    } catch {
        // Lab unreachable or job already gone - not a problem
    }
}

/**
 * Cancel all lab activity for a node - pending entries, processing entries,
 * inflight abort signals, and remote lab jobs. Called when a node is deleted
 * or archived so labs don't waste resources on a node that no longer exists.
 *
 * Best-effort: failures in any step don't block the caller.
 */
export async function cancelNodeJobs(nodeId: string): Promise<{ cancelled: number }> {
    let cancelled = 0;

    try {
        // 1. Abort any inflight jobs in this process (stops lab polling immediately)
        const aborts = inflightAborts.get(nodeId);
        if (aborts) {
            for (const ac of aborts) {
                try { ac.abort(); } catch { /* already aborted */ }
            }
            inflightAborts.delete(nodeId);
        }

        // 2. Cancel pending entries in the queue
        const { cancelByNode } = await import('./queue.js');
        const { cancelled: pendingCount } = await cancelByNode(nodeId);
        cancelled += pendingCount;

        // 3. Cancel processing entries and their remote lab jobs
        const processing = await query(
            "SELECT id, external_job_id FROM lab_queue WHERE node_id = $1 AND status = 'processing'",
            [nodeId],
        );
        for (const row of processing) {
            const r = row as any;
            await query(
                "UPDATE lab_queue SET status = 'cancelled', error = 'Node deleted', completed_at = datetime('now') WHERE id = $1",
                [r.id],
            );
            const job = inflight.get(r.id);
            if (job) job.abort.abort();
            inflight.delete(r.id);
            recoveryCount.delete(r.id);
            await _cancelLabJob(r.external_job_id, r.id);
            cancelled++;
        }

        // 4. Unfreeze the node (it may be about to be deleted, but unfreeze is safe either way)
        try { await unfreezeNode(nodeId); } catch { /* non-fatal */ }
        try { await clearNodeQueueStatus(nodeId); } catch { /* non-fatal */ }

        if (cancelled > 0) {
            console.error(`[lab-queue-worker] Cancelled ${cancelled} queue entries for deleted node ${nodeId.slice(0, 8)}`);
            emitActivity('lab', 'node_deleted',
                `Cancelled ${cancelled} lab queue entries for node ${nodeId.slice(0, 8)}`,
                { nodeId, cancelled });
        }
    } catch (err: any) {
        console.error(`[lab-queue-worker] Error cancelling jobs for node ${nodeId}: ${err.message}`);
    }

    return { cancelled };
}

/**
 * Cancel all active lab jobs, optionally filtered by domain.
 * Used during bulk node deletion (wipe domain, wipe all nodes).
 * Aborts inflight polling, cancels DB entries, and cancels remote lab jobs.
 */
export async function cancelBulkLabJobs(domain?: string): Promise<number> {
    try {
        // 1. Abort all (or domain-matched) inflight controllers
        if (!domain) {
            // Cancel everything
            for (const [, aborts] of inflightAborts) {
                for (const ac of aborts) {
                    try { ac.abort(); } catch { /* already aborted */ }
                }
            }
            inflightAborts.clear();
            inflight.clear();
            recoveryCount.clear();
        } else {
            // Need to find which inflight nodes belong to this domain
            for (const [nodeId, aborts] of inflightAborts) {
                try {
                    const node = await query(
                        'SELECT domain FROM nodes WHERE id = $1',
                        [nodeId],
                    );
                    if ((node[0] as any)?.domain === domain) {
                        for (const ac of aborts) {
                            try { ac.abort(); } catch { /* already aborted */ }
                        }
                        inflightAborts.delete(nodeId);
                    }
                } catch { /* node may already be gone */ }
            }
        }

        // 2. Cancel all active DB entries and collect remote job IDs
        const { cancelAllActive } = await import('./queue.js');
        const { cancelled, externalJobs } = await cancelAllActive(domain);

        // 3. Cancel remote lab jobs (best-effort)
        for (const job of externalJobs) {
            if (job.externalJobId) {
                await _cancelLabJob(job.externalJobId, job.id);
            }
        }

        // 4. Unfreeze affected nodes
        const nodeIds = [...new Set(externalJobs.map((j: any) => j.nodeId).filter(Boolean))];
        for (const nid of nodeIds) {
            try { await unfreezeNode(nid); } catch { /* non-fatal */ }
        }

        if (cancelled > 0) {
            console.error(`[lab-queue-worker] Bulk cancelled ${cancelled} queue entries${domain ? ` for domain "${domain}"` : ''}`);
            emitActivity('lab', 'bulk_cancel',
                `Bulk cancelled ${cancelled} lab queue entries${domain ? ` for domain "${domain}"` : ''}`,
                { domain, cancelled });
        }

        return cancelled;
    } catch (err: any) {
        console.error(`[lab-queue-worker] Error in bulk cancel: ${err.message}`);
        return 0;
    }
}

// =========================================================================
// Lab Result Recovery — scan labs for orphaned completed jobs
// =========================================================================

/**
 * Scan all enabled labs for completed jobs whose results Podbit never recorded.
 * This recovers from scenarios where server restarts orphaned the link between
 * queue entries and lab jobs.
 *
 * For each completed lab job:
 *   1. Extract the nodeId from the job's spec
 *   2. Check if Podbit already has an execution record for this lab job
 *   3. If not, fetch the full result and record it
 *
 * @returns Count of recovered results
 */
export async function recoverOrphanedLabResults(): Promise<{ recovered: number; scanned: number; errors: number }> {
    let recovered = 0;
    let scanned = 0;
    let errors = 0;

    try {
        const { listLabs } = await import('../lab/registry.js');
        const { listLabJobs, fetchResult, buildAuthHeadersFromRegistry } = await import('../lab/client.js');
        const { recordVerification } = await import('./feedback.js');

        const labs = await listLabs({ enabled: true });

        for (const lab of labs) {
            try {
                const authHeaders = buildAuthHeadersFromRegistry(lab);
                const completedJobs = await listLabJobs(lab.url, 'completed', authHeaders, 200);

                for (const job of completedJobs) {
                    scanned++;
                    if (!job.id) continue;

                    // Extract nodeId from the job's spec
                    const spec = typeof job.spec === 'string' ? JSON.parse(job.spec) : job.spec;
                    const nodeId = spec?.nodeId;
                    if (!nodeId) continue;

                    // Check if we already have an execution record for this lab job
                    const existing = await query(
                        "SELECT id FROM lab_executions WHERE lab_job_id = $1 LIMIT 1",
                        [job.id],
                    );
                    if (existing.length > 0) continue;

                    // Check the node still exists (include archived - recovery should
                    // still record results for nodes that were archived by prior runs)
                    const node = await query(
                        "SELECT id, weight, domain, archived FROM nodes WHERE id = $1",
                        [nodeId],
                    ) as any[];
                    if (node.length === 0) continue;

                    // Fetch the full result from the lab
                    try {
                        const { getTemplate } = await import('../lab/templates.js');
                        let template = await getTemplate(lab.id);
                        if (!template) {
                            template = {
                                id: lab.id, name: lab.name, description: lab.description, systemTemplate: false,
                                executionConfig: { url: lab.url, authType: lab.authType, authKey: lab.authCredential || undefined, authHeader: lab.authHeader || undefined },
                                triageConfig: null,
                                pollConfig: { strategy: 'interval', pollIntervalMs: 2000, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
                                interpretConfig: null, outcomeConfig: {}, evidenceSchema: null, budgetConfig: null,
                                createdAt: lab.createdAt, updatedAt: lab.updatedAt,
                            };
                        }

                        const labData = await fetchResult(template, job.id);

                        const isInconclusive = labData.verdict === 'inconclusive';
                        const claimSupported = labData.verdict === 'supported';
                        const isComplete = labData.verdict === 'supported' || labData.verdict === 'refuted' || isInconclusive;
                        const isError = labData.verdict === 'error';

                        if (!isComplete && !isError) continue;

                        const result = {
                            nodeId,
                            status: isError ? 'failed' as const : 'completed' as const,
                            testCategory: (labData.testCategory || spec?.claimType || 'unknown') as any,
                            evaluation: isComplete ? {
                                verified: claimSupported,
                                claimSupported: isInconclusive ? null as any : claimSupported,
                                confidence: labData.confidence,
                                score: isInconclusive ? 0 : labData.confidence,
                                mode: 'boolean' as any,
                                details: labData.details || `Lab verdict: ${labData.verdict}`,
                                rawOutput: labData.details || null,
                                inconclusive: isInconclusive,
                            } : undefined,
                            codegen: {
                                hypothesis: labData.hypothesis || spec?.hypothesis || '',
                                claimType: (spec?.claimType || 'unknown') as any,
                                code: '' as string, expectedBehavior: '' as string, evaluationMode: 'boolean' as any,
                                assertionPolarity: 'positive' as any, raw: '' as string,
                            },
                            weightBefore: node[0].weight,
                            error: isError ? `Lab error: ${labData.error || 'unknown'}` : undefined,
                            startedAt: job.created_at || new Date().toISOString(),
                            completedAt: job.completed_at || new Date().toISOString(),
                        };

                        // Recovery imports historical results — skip weight changes,
                        // auto-archive, and taint propagation. These side effects should
                        // only fire during live verification, not retroactive imports.
                        await recordVerification(result, {
                            labJobId: job.id,
                            labId: lab.id,
                            labName: lab.name,
                            spec: typeof job.spec === 'string' ? job.spec : JSON.stringify(spec),
                            skipWeightAdjust: true,
                            skipNodeUpdate: node[0].archived ? true : undefined,
                        });

                        // Store verdict + spec as inline evidence so the GUI renders
                        // the VerdictCard and SpecCard without needing an artifact zip.
                        try {
                            const evidenceItems: Array<{ type: string; label: string; data: string }> = [];

                            // Verdict evidence (renders as VerdictCard in GUI)
                            const verdictPayload: Record<string, unknown> = {
                                verdict: labData.verdict,
                                confidence: labData.confidence,
                                hypothesis: labData.hypothesis,
                                testCategory: labData.testCategory,
                                details: labData.details,
                            };
                            if (labData.structuredDetails) verdictPayload.structuredDetails = labData.structuredDetails;
                            evidenceItems.push({ type: 'json', label: 'verdict', data: JSON.stringify(verdictPayload) });

                            // Spec evidence (renders as SpecCard in GUI)
                            evidenceItems.push({ type: 'json', label: 'spec', data: typeof job.spec === 'string' ? job.spec : JSON.stringify(spec) });

                            // Update the execution record's evidence column
                            const latestExec = await query(
                                `SELECT id FROM lab_executions WHERE lab_job_id = $1 ORDER BY created_at DESC LIMIT 1`,
                                [job.id],
                            );
                            if (latestExec.length > 0) {
                                await query(
                                    `UPDATE lab_executions SET evidence = $1 WHERE id = $2`,
                                    [JSON.stringify(evidenceItems), (latestExec[0] as any).id],
                                );
                            }

                            // Also pull artifact zip if available
                            try {
                                const { pullArtifactZip } = await import('../lab/evidence.js');
                                const zipId = await pullArtifactZip(lab, job.id, nodeId, node[0].domain, null);
                                if (zipId && latestExec.length > 0) {
                                    await query(
                                        `UPDATE lab_executions SET artifact_zip_id = $1 WHERE id = $2`,
                                        [zipId, (latestExec[0] as any).id],
                                    );
                                }
                            } catch { /* artifact zip optional */ }
                        } catch { /* evidence storage non-fatal */ }

                        recovered++;
                        console.error(`[lab-recovery] Recovered result for node ${nodeId.slice(0, 8)} from ${lab.name} (job ${job.id}): ${labData.verdict}`);
                        emitActivity('lab', 'orphan_recovered',
                            `Recovered orphaned result from ${lab.name}: ${labData.verdict} for node ${nodeId.slice(0, 8)}`,
                            { nodeId, labId: lab.id, labName: lab.name, jobId: job.id, verdict: labData.verdict });
                    } catch (fetchErr: any) {
                        errors++;
                        console.error(`[lab-recovery] Failed to fetch result for job ${job.id} from ${lab.name}: ${fetchErr.message}`);
                    }
                }
            } catch (labErr: any) {
                console.error(`[lab-recovery] Failed to scan lab ${lab.name}: ${labErr.message}`);
                errors++;
            }
        }

        if (recovered > 0) {
            console.error(`[lab-recovery] Recovered ${recovered} orphaned results from ${labs.length} lab(s)`);
            emitActivity('lab', 'recovery_complete',
                `Recovered ${recovered} orphaned lab result(s) (scanned ${scanned}, errors: ${errors})`,
                { recovered, scanned, errors });
        }
    } catch (err: any) {
        console.error(`[lab-recovery] Recovery failed: ${err.message}`);
    }

    return { recovered, scanned, errors };
}

/**
 * Backfill evidence data on execution records that have a lab_job_id but
 * empty evidence column. This patches records from earlier recovery runs
 * that stored the verdict/confidence but not the full evidence payload
 * the GUI needs to render VerdictCard.
 */
export async function backfillMissingEvidence(): Promise<{ patched: number; errors: number }> {
    let patched = 0;
    let errors = 0;

    try {
        // Find execution records with lab_job_id but no evidence
        const rows = await query(
            `SELECT e.id, e.lab_job_id, e.lab_id, e.lab_name, e.node_id, e.spec,
                    n.domain
             FROM lab_executions e
             LEFT JOIN nodes n ON n.id = e.node_id
             WHERE e.lab_job_id IS NOT NULL
               AND (e.evidence IS NULL OR e.evidence = '' OR e.evidence = '[]')
             ORDER BY e.created_at DESC
             LIMIT 200`,
            [],
        ) as any[];

        if (rows.length === 0) return { patched: 0, errors: 0 };

        const { listLabs } = await import('../lab/registry.js');
        const { fetchResult, buildAuthHeadersFromRegistry } = await import('../lab/client.js');
        const labs = await listLabs({ enabled: true });
        const labMap = new Map(labs.map(l => [l.id, l]));

        for (const row of rows) {
            try {
                // Find the lab that has this job
                let lab = row.lab_id ? labMap.get(row.lab_id) : null;
                if (!lab) {
                    // Try all labs
                    for (const l of labs) {
                        try {
                            const { checkStatus } = await import('../lab/client.js');
                            const template = {
                                id: l.id, name: l.name, description: '', systemTemplate: false,
                                executionConfig: { url: l.url, authType: l.authType, authKey: l.authCredential || undefined, authHeader: l.authHeader || undefined },
                                triageConfig: null,
                                pollConfig: { strategy: 'interval' as const, pollIntervalMs: 2000, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
                                interpretConfig: null, outcomeConfig: {}, evidenceSchema: null, budgetConfig: null,
                                createdAt: l.createdAt, updatedAt: l.updatedAt,
                            };
                            await checkStatus(template, row.lab_job_id);
                            lab = l;
                            break;
                        } catch { continue; }
                    }
                }
                if (!lab) continue;

                const template = {
                    id: lab.id, name: lab.name, description: '', systemTemplate: false,
                    executionConfig: { url: lab.url, authType: lab.authType, authKey: lab.authCredential || undefined, authHeader: lab.authHeader || undefined },
                    triageConfig: null,
                    pollConfig: { strategy: 'interval' as const, pollIntervalMs: 2000, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
                    interpretConfig: null, outcomeConfig: {}, evidenceSchema: null, budgetConfig: null,
                    createdAt: lab.createdAt, updatedAt: lab.updatedAt,
                };

                const labData = await fetchResult(template, row.lab_job_id);

                // Build evidence items
                const evidenceItems: Array<{ type: string; label: string; data: string }> = [];
                const verdictPayload: Record<string, unknown> = {
                    verdict: labData.verdict,
                    confidence: labData.confidence,
                    hypothesis: labData.hypothesis,
                    testCategory: labData.testCategory,
                    details: labData.details,
                };
                if (labData.structuredDetails) verdictPayload.structuredDetails = labData.structuredDetails;
                evidenceItems.push({ type: 'json', label: 'verdict', data: JSON.stringify(verdictPayload) });

                if (row.spec) {
                    evidenceItems.push({ type: 'json', label: 'spec', data: row.spec });
                }

                await query(
                    `UPDATE lab_executions SET evidence = $1 WHERE id = $2`,
                    [JSON.stringify(evidenceItems), row.id],
                );

                // Pull artifact zip if missing
                if (!row.artifact_zip_id) {
                    try {
                        const { pullArtifactZip } = await import('../lab/evidence.js');
                        const zipId = await pullArtifactZip(lab, row.lab_job_id, row.node_id, row.domain || '', null);
                        if (zipId) {
                            await query(`UPDATE lab_executions SET artifact_zip_id = $1 WHERE id = $2`, [zipId, row.id]);
                        }
                    } catch { /* optional */ }
                }

                patched++;
            } catch (err: any) {
                errors++;
            }
        }

        if (patched > 0) {
            console.error(`[lab-recovery] Backfilled evidence on ${patched} execution records`);
        }
    } catch (err: any) {
        console.error(`[lab-recovery] Backfill failed: ${err.message}`);
    }

    return { patched, errors };
}
