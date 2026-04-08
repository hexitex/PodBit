/**
 * EVM Queue — persistent verification job queue.
 *
 * All verification jobs go through this queue. Entries survive server restarts.
 * The queue worker (queue-worker.ts) pulls entries and runs verifyNodeInternal().
 */

import { query, queryOne } from '../core.js';

// =========================================================================
// Types
// =========================================================================

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type QueuedBy = 'manual' | 'autonomous' | 'retry' | 'bulk';

export interface QueueEntry {
    id: number;
    node_id: string;
    status: QueueStatus;
    priority: number;
    retry_count: number;
    max_retries: number;
    guidance: string | null;
    queued_by: QueuedBy;
    error: string | null;
    execution_id: string | null;
    queued_at: string;
    started_at: string | null;
    completed_at: string | null;
    next_eligible_at: string | null;
    /** Lab template ID (resolved at runtime by routing) */
    template_id: string | null;
    /** External job ID for polling remote lab servers */
    external_job_id: string | null;
    /** Last time the lab server was polled for status */
    last_polled_at: string | null;
    /** Number of polls performed */
    poll_count: number;
    /** Chain: parent queue entry ID that triggered this chain step */
    chain_parent_id: number | null;
    /** Chain: depth in the chain (0 = original, 1 = first critique, 2 = retest, ...) */
    chain_depth: number;
    /** Chain: type of this chain step ('critique' or 'retest') */
    chain_type: string | null;
    /** Chain: pre-built ExperimentSpec JSON (skip extraction when present) */
    chain_spec: string | null;
}

export interface EnqueueOptions {
    priority?: number;
    guidance?: string;
    maxRetries?: number;
    queuedBy?: QueuedBy;
    /** Lab template to use (resolved at runtime by routing if not specified) */
    templateId?: string;
    /** Chain: parent queue entry ID */
    chainParentId?: number;
    /** Chain: depth in the chain */
    chainDepth?: number;
    /** Chain: type of this chain step */
    chainType?: 'critique' | 'retest';
    /** Chain: pre-built ExperimentSpec JSON (skip extraction) */
    chainSpec?: string;
}

export interface QueueFilters {
    status?: QueueStatus;
    nodeId?: string;
    limit?: number;
    offset?: number;
}

export interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
}

// =========================================================================
// Enqueue
// =========================================================================

/**
 * Add a node to the verification queue.
 * Rejects duplicates (existing pending/processing for same node).
 * Sets node verification_status = 'in_queue'.
 *
 * @param nodeId - UUID of the node to enqueue
 * @param opts - Queue options: priority, guidance, maxRetries, queuedBy
 * @returns Result with success flag, optional entry, and existing/error indicators
 */
export async function enqueue(nodeId: string, opts: EnqueueOptions = {}): Promise<{ success: boolean; entry?: QueueEntry; existing?: boolean; error?: string }> {
    const { priority = 0, guidance, maxRetries = 3, queuedBy = 'manual', templateId,
            chainParentId, chainDepth = 0, chainType, chainSpec } = opts;

    // Check node exists and isn't archived
    const node = await queryOne(
        'SELECT id, verification_status FROM nodes WHERE id = $1 AND archived = FALSE',
        [nodeId],
    );
    if (!node) {
        return { success: false, error: `Node ${nodeId} not found or archived` };
    }

    // Duplicate check — don't re-queue if already pending or processing
    // Chain jobs bypass this — the same node can have both an original and a critique in flight
    if (!chainType) {
        const existing = await queryOne(
            "SELECT id, status FROM lab_queue WHERE node_id = $1 AND status IN ('pending', 'processing')",
            [nodeId],
        );
        if (existing) {
            return { success: true, existing: true, entry: existing as any };
        }
    }

    // Cooldown check — don't re-queue if recently verified (completed or skipped).
    // Without this, validation cycles and auto-verify re-queue nodes every tick
    // because the pending/processing check above passes once the entry completes.
    // Manual enqueues bypass this so users can always force re-verification.
    // Chain jobs also bypass — they are system-initiated follow-ups, not autonomous re-queues.
    if (queuedBy !== 'manual' && !chainType) {
        const cooldownSeconds = 600; // 10 minutes
        const recent = await queryOne(
            `SELECT id FROM lab_executions
             WHERE node_id = $1 AND created_at > datetime('now', '-' || $2 || ' seconds')
             LIMIT 1`,
            [nodeId, cooldownSeconds],
        );
        if (recent) {
            return { success: true, existing: true };
        }
    }

    // Insert queue entry
    const rows = await query(`
        INSERT INTO lab_queue (node_id, status, priority, max_retries, guidance, queued_by, template_id,
                               chain_parent_id, chain_depth, chain_type, chain_spec)
        VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
    `, [nodeId, priority, maxRetries, guidance || null, queuedBy, templateId || null,
        chainParentId || null, chainDepth, chainType || null, chainSpec || null]);

    const entry = rows[0] as QueueEntry;

    // Mark node as in_queue (or pending_review for chain critique jobs)
    const nodeStatus = chainType === 'critique' ? 'pending_review' : 'in_queue';
    await query(
        `UPDATE nodes SET verification_status = $1, updated_at = datetime('now') WHERE id = $2`,
        [nodeStatus, nodeId],
    );

    return { success: true, entry };
}

// =========================================================================
// Queue Operations
// =========================================================================

/**
 * Get next pending entry eligible for processing.
 * Atomically claims it by setting status = 'processing'.
 */
export async function nextPending(): Promise<QueueEntry | null> {
    // Find next eligible entry
    const entry = await queryOne(`
        SELECT * FROM lab_queue
        WHERE status = 'pending'
          AND (next_eligible_at IS NULL OR next_eligible_at <= datetime('now'))
        ORDER BY priority DESC, queued_at ASC
        LIMIT 1
    `, []);

    if (!entry) return null;

    // Claim it
    await query(
        "UPDATE lab_queue SET status = 'processing', started_at = datetime('now') WHERE id = $1",
        [(entry as any).id],
    );

    return { ...entry, status: 'processing', started_at: new Date().toISOString() } as QueueEntry;
}

/**
 * Mark a queue entry as completed (or failed if error is provided).
 *
 * @param id - Queue entry ID
 * @param executionId - EVM execution UUID to link, or null
 * @param error - If provided, marks entry as 'failed' instead of 'completed'
 */
export async function completeEntry(id: number, executionId: string | null, error?: string): Promise<void> {
    const status = error ? 'failed' : 'completed';
    await query(`
        UPDATE lab_queue
        SET status = $1, execution_id = $2, error = $3, completed_at = datetime('now')
        WHERE id = $4
    `, [status, executionId, error || null, id]);
}

/**
 * Store the external lab job ID on a queue entry so it can be resumed after restart.
 */
export async function setExternalJobId(id: number, externalJobId: string): Promise<void> {
    await query(`UPDATE lab_queue SET external_job_id = $1 WHERE id = $2`, [externalJobId, id]);
}

/**
 * Release a processing entry back to pending without counting as an attempt.
 * Used when budget is exceeded mid-pipeline.
 *
 * @param id - Queue entry ID to release
 */
export async function releaseEntry(id: number): Promise<void> {
    await query(
        "UPDATE lab_queue SET status = 'pending', started_at = NULL WHERE id = $1",
        [id],
    );
}

/**
 * Re-queue a failed entry if under retry limit.
 * Creates a new pending entry with incremented retry count and linear backoff
 * (30s, 60s, 90s...). Clears node queue status if max retries reached.
 *
 * @param id - Queue entry ID that failed
 * @returns Object with requeued flag and optional new queue entry
 */
export async function requeueFailed(id: number): Promise<{ requeued: boolean; entry?: QueueEntry }> {
    const original = await queryOne('SELECT * FROM lab_queue WHERE id = $1', [id]);
    if (!original) return { requeued: false };

    const o = original as QueueEntry;
    if (o.retry_count >= o.max_retries) {
        // Max retries reached — clear in_queue status on node
        await clearNodeQueueStatus(o.node_id);
        return { requeued: false };
    }

    const newRetryCount = o.retry_count + 1;
    const backoffSeconds = newRetryCount * 30; // 30s, 60s, 90s...

    const rows = await query(`
        INSERT INTO lab_queue (node_id, status, priority, retry_count, max_retries, guidance, queued_by, next_eligible_at)
        VALUES ($1, 'pending', $2, $3, $4, $5, 'retry', datetime('now', '+' || $6 || ' seconds'))
        RETURNING *
    `, [o.node_id, o.priority, newRetryCount, o.max_retries, o.guidance || null, backoffSeconds]);

    return { requeued: true, entry: rows[0] as QueueEntry };
}

/**
 * Cancel a specific queue entry. Only pending entries can be cancelled.
 *
 * @param id - Queue entry ID to cancel
 * @returns Result with success flag and optional error message
 */
export async function cancelEntry(id: number): Promise<{ success: boolean; error?: string }> {
    const entry = await queryOne('SELECT * FROM lab_queue WHERE id = $1', [id]);
    if (!entry) return { success: false, error: 'Queue entry not found' };

    const e = entry as QueueEntry;
    if (e.status !== 'pending') {
        return { success: false, error: `Cannot cancel entry with status '${e.status}' — only pending entries can be cancelled` };
    }

    await query("UPDATE lab_queue SET status = 'cancelled', completed_at = datetime('now') WHERE id = $1", [id]);
    await clearNodeQueueStatus(e.node_id);
    return { success: true };
}

/**
 * Cancel all pending entries for a node and clear its queue status.
 *
 * @param nodeId - UUID of the node whose pending entries to cancel
 * @returns Object with count of cancelled entries
 */
export async function cancelByNode(nodeId: string): Promise<{ cancelled: number }> {
    const rows = await query(
        "UPDATE lab_queue SET status = 'cancelled', completed_at = datetime('now') WHERE node_id = $1 AND status = 'pending' RETURNING id",
        [nodeId],
    );
    if (rows.length > 0) {
        await clearNodeQueueStatus(nodeId);
    }
    return { cancelled: rows.length };
}

// =========================================================================
// Query
// =========================================================================

/**
 * List queue entries with optional filters, joined with node content/domain/weight.
 * Results are ordered by status priority, then by priority DESC and queued_at ASC.
 *
 * @param filters - Optional status, nodeId, limit (max 50), and offset filters
 * @returns Paginated entries array and total count
 */
export async function getQueue(filters: QueueFilters = {}): Promise<{ entries: QueueEntry[]; total: number }> {
    const { status, nodeId, limit = 50, offset = 0 } = filters;

    let where = '1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
        where += ` AND q.status = $${paramIdx++}`;
        params.push(status);
    }
    if (nodeId) {
        where += ` AND q.node_id = $${paramIdx++}`;
        params.push(nodeId);
    }

    const countResult = await queryOne(`SELECT COUNT(*) as total FROM lab_queue q WHERE ${where}`, params);
    const total = parseInt((countResult as any)?.total || '0', 10);

    params.push(limit, offset);
    const entries = await query(`
        SELECT q.*, substr(n.content, 1, 120) as node_content, n.domain, n.weight
        FROM lab_queue q
        LEFT JOIN nodes n ON n.id = q.node_id
        WHERE ${where}
        ORDER BY
            CASE q.status
                WHEN 'processing' THEN 0
                WHEN 'pending' THEN 1
                WHEN 'failed' THEN 2
                WHEN 'completed' THEN 3
                WHEN 'cancelled' THEN 4
            END,
            q.priority DESC, q.queued_at ASC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, params);

    return { entries: entries as QueueEntry[], total };
}

/**
 * Get aggregate queue statistics grouped by status.
 *
 * @returns QueueStats with counts per status and total
 */
export async function getQueueStats(): Promise<QueueStats> {
    const rows = await query(
        "SELECT status, COUNT(*) as count FROM lab_queue GROUP BY status",
        [],
    );

    const stats: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0, total: 0 };
    for (const row of rows) {
        const r = row as any;
        if (r.status in stats) {
            (stats as any)[r.status] = parseInt(r.count, 10);
        }
        stats.total += parseInt(r.count, 10);
    }
    return stats;
}

// =========================================================================
// Recovery
// =========================================================================

/**
 * Recover entries stuck in 'processing' from a previous crash.
 * Called on server startup. Resets them to 'pending'.
 *
 * @returns Number of entries recovered
 */
export async function recoverStuck(): Promise<number> {
    const rows = await query(
        "UPDATE lab_queue SET status = 'pending', started_at = NULL WHERE status = 'processing' RETURNING id",
        [],
    );
    return rows.length;
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Clear 'in_queue' verification_status on a node if no pending/processing entries remain.
 * Only clears the status if the current status is 'in_queue' (avoids overwriting
 * a more specific status set by verification completion).
 *
 * @param nodeId - UUID of the node to check and potentially clear
 */
export async function clearNodeQueueStatus(nodeId: string): Promise<void> {
    const remaining = await queryOne(
        "SELECT id FROM lab_queue WHERE node_id = $1 AND status IN ('pending', 'processing') LIMIT 1",
        [nodeId],
    );
    if (!remaining) {
        // No more active queue entries — revert to null (will be set properly by next verify)
        await query(
            "UPDATE nodes SET verification_status = NULL, updated_at = datetime('now') WHERE id = $1 AND verification_status = 'in_queue'",
            [nodeId],
        );
    }
}
