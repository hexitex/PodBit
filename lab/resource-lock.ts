/**
 * Lab Resource Lock — pauses Podbit's autonomous LLM cycles while a local lab
 * is using shared system resources (GPU, RAM).
 *
 * Lifecycle:
 *   1. Lab submit response includes `resourceLock: true`
 *   2. Podbit pauses all autonomous cycles (synthesis, voicing, research, etc.)
 *   3. Lab status polling returns `resourceState: "active"` while working
 *   4. Job completes or status returns `resourceState: "idle"` → lock released, cycles resume
 *   5. Safety net: auto-release after `config.lab.freezeTimeoutMs` if lab goes silent
 *   6. Safety net: health checker finds lab offline → lock released
 *
 * @module lab/resource-lock
 */

import { emitActivity } from '../services/event-bus.js';

interface ActiveLock {
    labId: string;
    labName: string;
    jobId: string;
    acquiredAt: number;
    timeoutMs: number;
    timeoutTimer: ReturnType<typeof setTimeout>;
}

let activeLock: ActiveLock | null = null;
let pauseCallback: (() => void) | null = null;
let resumeCallback: (() => void) | null = null;

/**
 * Register the pause/resume callbacks. Called once at startup.
 * pause() should stop all autonomous LLM cycles.
 * resume() should restart them.
 */
export function registerCycleControl(pause: () => void, resume: () => void): void {
    pauseCallback = pause;
    resumeCallback = resume;
}

/**
 * Acquire a resource lock. Pauses cycles.
 */
export function acquireResourceLock(labId: string, labName: string, jobId: string, timeoutMs: number): void {
    // Already locked — extend timeout if same job
    if (activeLock) {
        if (activeLock.jobId === jobId) {
            clearTimeout(activeLock.timeoutTimer);
            activeLock.timeoutTimer = setTimeout(() => autoRelease('timeout'), timeoutMs);
            return;
        }
        // Different job requesting lock — release old one first
        releaseResourceLock('superseded');
    }

    activeLock = {
        labId,
        labName,
        jobId,
        acquiredAt: Date.now(),
        timeoutMs,
        timeoutTimer: setTimeout(() => autoRelease('timeout'), timeoutMs),
    };

    if (pauseCallback) pauseCallback();

    emitActivity('lab', 'resource_lock_acquired',
        `Resource lock acquired — pausing cycles for "${labName}" job ${jobId.slice(0, 8)}`,
        { labId, labName, jobId });
}

/**
 * Release the resource lock. Resumes cycles.
 */
export function releaseResourceLock(reason: string = 'completed'): void {
    if (!activeLock) return;

    const duration = Date.now() - activeLock.acquiredAt;
    clearTimeout(activeLock.timeoutTimer);

    emitActivity('lab', 'resource_lock_released',
        `Resource lock released (${reason}) — resuming cycles. Held for ${Math.round(duration / 1000)}s`,
        { labId: activeLock.labId, jobId: activeLock.jobId, reason, durationMs: duration });

    activeLock = null;

    if (resumeCallback) resumeCallback();
}

/**
 * Check if a resource lock is active.
 */
export function isResourceLocked(): boolean {
    return activeLock !== null;
}

/**
 * Get lock status for display.
 */
export function getResourceLockStatus(): { locked: boolean; labName?: string; jobId?: string; heldMs?: number } {
    if (!activeLock) return { locked: false };
    return {
        locked: true,
        labName: activeLock.labName,
        jobId: activeLock.jobId,
        heldMs: Date.now() - activeLock.acquiredAt,
    };
}

/**
 * Called by health checker when a lab goes offline — release lock if it was held by that lab.
 */
export function onLabOffline(labId: string): void {
    if (activeLock && activeLock.labId === labId) {
        releaseResourceLock('lab_offline');
    }
}

function autoRelease(reason: string): void {
    if (!activeLock) return;
    console.error(`[resource-lock] Auto-releasing lock: ${reason} (held by ${activeLock.labName} job ${activeLock.jobId.slice(0, 8)})`);
    releaseResourceLock(reason);
}
