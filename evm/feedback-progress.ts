/**
 * EVM Feedback — Re-evaluation progress tracking.
 *
 * Owns the in-memory `_reevalProgress` object and the DB-flush timer.
 * Exported as a const reference so feedback-reeval.ts can mutate its
 * properties directly — safe in ESM because objects are passed by reference.
 */

import { query, queryOne } from '../core.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ReevalProgress {
    status: 'idle' | 'running' | 'done' | 'error';
    phase: 0 | 1 | 2;
    total: number;
    autoApproved: number;
    phase2Total: number;
    phase2Processed: number;
    phase2AutoApproved: number;
    unchanged: number;
    errors: number;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage?: string;
}

// =============================================================================
// STATE
// =============================================================================

const REEVAL_SETTINGS_KEY = 'evm.reeval_progress';

/** Mutable progress object — exported by reference so reeval module can update it. */
export const _reevalProgress: ReevalProgress = {
    status: 'idle', phase: 0, total: 0,
    autoApproved: 0, phase2Total: 0, phase2Processed: 0,
    phase2AutoApproved: 0, unchanged: 0, errors: 0,
    startedAt: null, finishedAt: null,
};

let _progressDirty = false;
let _flushTimer: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Persist current progress to the settings table. */
async function _flushProgress(): Promise<void> {
    if (!_progressDirty) return;
    _progressDirty = false;
    try {
        await query(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
            [REEVAL_SETTINGS_KEY, JSON.stringify(_reevalProgress)],
        );
    } catch { /* non-fatal — progress is best-effort */ }
}

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Mark progress dirty and schedule a batched flush every 2s while running.
 * Starts a periodic flush timer that auto-stops when status is no longer 'running'.
 */
export function _markDirty(): void {
    _progressDirty = true;
    if (!_flushTimer) {
        _flushTimer = setInterval(async () => {
            await _flushProgress();
            if (_reevalProgress.status !== 'running') {
                clearInterval(_flushTimer!);
                _flushTimer = null;
            }
        }, 2000);
    }
}

/**
 * Returns current reeval progress. Uses in-memory state if a run is active,
 * otherwise loads from the settings table (survives server restarts).
 * If the DB shows 'running' but no in-memory run is active, marks it as
 * interrupted by server restart.
 *
 * @returns Current or last-known ReevalProgress
 */
export async function getReevalProgress(): Promise<ReevalProgress> {
    // Return in-memory state if we have an active run
    if (_reevalProgress.status === 'running') return { ..._reevalProgress };

    // Otherwise load from DB (survives restarts)
    try {
        const row: any = await queryOne(
            `SELECT value FROM settings WHERE key = $1`,
            [REEVAL_SETTINGS_KEY],
        );
        if (row?.value) {
            const saved = JSON.parse(row.value) as ReevalProgress;
            // If DB says "running" but we're not running in-memory, it was interrupted
            if (saved.status === 'running') {
                saved.status = 'error';
                saved.errorMessage = 'Interrupted by server restart';
                saved.finishedAt = new Date().toISOString();
                await query(
                    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
                     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
                    [REEVAL_SETTINGS_KEY, JSON.stringify(saved)],
                );
            }
            return saved;
        }
    } catch { /* DB not ready yet, return default */ }
    return { ..._reevalProgress };
}

/** Resets reeval progress to idle and persists to settings. */
export async function resetReevalProgress(): Promise<void> {
    Object.assign(_reevalProgress, {
        status: 'idle', phase: 0, total: 0,
        autoApproved: 0, phase2Total: 0, phase2Processed: 0,
        phase2AutoApproved: 0, unchanged: 0, errors: 0,
        startedAt: null, finishedAt: null, errorMessage: undefined,
    });
    _progressDirty = true;
    await _flushProgress();
}
