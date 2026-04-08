/**
 * Lab Queue Worker — pulls jobs from the persistent queue and submits to lab servers.
 *
 * The worker is simple: claim entry → freeze → submit to lab → handle result → unfreeze.
 * All triage, codegen, execution, and evaluation happens in the lab server.
 * Podbit only decides to test, submits claims, and applies graph consequences.
 *
 * Supports concurrent submissions: fills up to maxConcurrent slots per poll tick.
 *
 * Usage:
 *   startQueueWorker()   — called on server startup
 *   stopQueueWorker()    — called on graceful shutdown
 *   processNextEntry()   — can be called manually for immediate drain
 */

import { nextPending, completeEntry, releaseEntry, requeueFailed, clearNodeQueueStatus } from './queue.js';
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

/** In-flight jobs: entryId → startTimestamp */
const inflight = new Map<number, number>();

/** Max concurrent jobs — read from config, default 3 */
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
        // Watchdog: check for stuck jobs
        const maxMs = (appConfig.lab?.freezeTimeoutMs ?? 600_000) + 60_000;
        for (const [entryId, startedAt] of inflight) {
            const stuckMs = Date.now() - startedAt;
            if (stuckMs > maxMs) {
                console.error(`[lab-queue-worker] Watchdog: entry ${entryId} stuck for ${Math.round(stuckMs / 1000)}s — removing from inflight`);
                emitActivity('system', 'evm_queue_worker', `Watchdog reset: entry ${entryId} stuck for ${Math.round(stuckMs / 1000)}s`);
                inflight.delete(entryId);
            }
        }
        fillSlots().catch(err => {
            console.error('[lab-queue-worker] Fill error:', err.message);
        });
    }, intervalMs);

    const max = getMaxConcurrent();
    console.error(`[lab-queue-worker] Started (poll every ${intervalMs}ms, maxConcurrent: ${max})`);
    emitActivity('system', 'evm_queue_worker', 'Lab queue worker started', { intervalMs, maxConcurrent: max });
}

/**
 * Stop the worker gracefully. Waits for in-flight jobs to finish.
 */
export async function stopQueueWorker(): Promise<void> {
    stopped = true;
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
    }

    const maxWait = 120_000;
    const start = Date.now();
    while (inflight.size > 0 && Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 500));
    }

    console.error('[lab-queue-worker] Stopped');
    emitActivity('system', 'evm_queue_worker', 'Lab queue worker stopped');
}

// =========================================================================
// Slot Filler — claims entries up to maxConcurrent
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

/** For backward compat — exposed for manual trigger */
export async function processNextEntry(): Promise<boolean> {
    if (stopped) return false;
    if (inflight.size >= getMaxConcurrent()) return false;
    return _claimAndStart();
}

// =========================================================================
// Core Processing — one entry at a time
// =========================================================================

async function _claimAndStart(): Promise<boolean> {
    if (stopped) return false;
    if (inflight.size >= getMaxConcurrent()) return false;

    const entry = await nextPending();
    if (!entry) return false;

    inflight.set(entry.id, Date.now());

    // Run the full pipeline in background — don't await
    _executeEntry(entry).finally(() => {
        inflight.delete(entry.id);
        // Try to fill the freed slot immediately
        if (!stopped) fillSlots();
    });

    return true;
}

async function _executeEntry(entry: any): Promise<void> {
    let frozeNode = false;
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

        // Submit claim to lab — verifyNodeInternal handles everything
        const { verifyNodeInternal } = await import('./index.js');
        const freezeTimeoutMs = appConfig.lab?.freezeTimeoutMs ?? 600_000;

        // Build hints — include chain context if this is a chain job
        const hints: import('./types.js').VerifyHints = {};
        // Manual queue entries (human-invoked via MCP/UI) opt into critique-lab fallback;
        // autonomous / retry / bulk entries do not — see verifyNodeInternal node_critique guard.
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
            console.error(`[lab-queue-worker] Resuming job ${entry.external_job_id} for entry ${entry.id}`);
        }

        // Persist lab jobId to queue entry immediately after submission (before polling starts)
        hints.onJobId = async (jobId: string) => {
            try {
                const { setExternalJobId } = await import('./queue.js');
                await setExternalJobId(entry.id, jobId);
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

        const result = await Promise.race([
            verifyNodeInternal(
                entry.node_id,
                undefined,
                Object.keys(hints).length > 0 ? hints : undefined,
            ),
            new Promise<import('./types.js').VerificationResult>((_, reject) =>
                setTimeout(() => reject(new Error(`Freeze timeout: lab did not respond within ${freezeTimeoutMs}ms`)), freezeTimeoutMs)
            ),
        ]);

        // Budget exceeded mid-pipeline — release back
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
                    `Queue entry ${entry.id} failed — requeued (retry ${entry.retry_count + 1}/${entry.max_retries})`,
                    { queueId: entry.id, nodeId: entry.node_id, retry: entry.retry_count + 1 });
            } else {
                emitActivity('system', 'evm_queue_worker',
                    `Queue entry ${entry.id} failed — max retries reached`,
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
        if (frozeNode) {
            try { await unfreezeNode(entry.node_id); } catch { /* non-fatal */ }
        }
    }
}
