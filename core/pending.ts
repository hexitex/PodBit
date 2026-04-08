/**
 * Pending Requests Queue — database-backed request queue for MCP mode.
 *
 * Allows the GUI Chat to queue requests that an LLM IDE agent (connected via MCP)
 * can pick up and process. Requests flow: GUI -> pending_requests table -> MCP agent.
 * Results are written back to the table and can be polled by the GUI.
 */

// @ts-expect-error -- uuid has no type declarations
import { v4 as uuid } from 'uuid';
import { query } from '../db.js';
import { intervalAgo } from '../db/sql.js';

/**
 * Queue a request for an LLM IDE agent to process via MCP.
 *
 * @param type - Request type identifier (e.g. 'seed', 'voice', 'research')
 * @param params - Arbitrary parameters for the request
 * @returns The created request record with id, type, params, and status
 */
async function queueRequest(type: string, params: Record<string, any>) {
    const id = uuid();
    await query(
        `INSERT INTO pending_requests (id, type, params, queued_at, status)
         VALUES ($1, $2, $3, NOW(), 'pending')`,
        [id, type, JSON.stringify(params)]
    );
    return { id, type, params, status: 'pending' };
}

/**
 * Get all pending (unprocessed) requests, ordered by queue time ascending.
 * Parses JSON params back into objects.
 *
 * @returns Array of pending request objects with parsed params
 */
async function getPendingRequests() {
    const rows = await query(
        `SELECT id, type, params, queued_at, status FROM pending_requests
         WHERE status = 'pending' ORDER BY queued_at ASC`
    );
    return rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params,
        queuedAt: r.queued_at,
        status: r.status,
    }));
}

/**
 * Mark a request as completed and optionally store its result.
 *
 * @param id - UUID of the pending request to complete
 * @param result - Optional result data to store (will be JSON-serialized)
 * @returns True if a row was updated, false if the request ID was not found
 */
async function completeRequest(id: string, result: any = null) {
    const res = await query(
        `UPDATE pending_requests SET status = 'completed', completed_at = NOW(), result = $2
         WHERE id = $1`,
        [id, result ? JSON.stringify(result) : null]
    );
    return (res as any).rowCount > 0;
}

/**
 * Delete completed requests older than 1 hour to prevent table bloat.
 *
 * @returns 0 (row count not reliably returned across DB backends)
 */
async function cleanupRequests() {
    await query(
        `DELETE FROM pending_requests
         WHERE status = 'completed' AND completed_at < ${intervalAgo(1, 'hour')}`
    );
    return 0; // Row count not reliably returned across backends
}

export { queueRequest, getPendingRequests, completeRequest, cleanupRequests };
