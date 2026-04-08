/**
 * KNOWLEDGE BASE - PROCESSING QUEUE
 *
 * In-memory priority queue with concurrency-limited processing.
 * Jobs are inserted by priority (higher first) and processed up to
 * `config.knowledgeBase.maxConcurrency` at a time.
 */

import { config } from '../../config.js';
import { processFile } from './file-processing.js';
import type { ProcessingJob } from '../types.js';

// =============================================================================
// PIPELINE STATE
// =============================================================================

export let queue: ProcessingJob[] = [];
export let activeJobs = 0;
export let completedCount = 0;
export let failedCount = 0;
export let skippedCount = 0;
export let running = false;
export let stopRequested = false;

/** Override pipeline queue (for tests). */
export function setQueue(q: ProcessingJob[]): void { queue = q; }
/** Override active job count (for tests). */
export function setActiveJobs(n: number): void { activeJobs = n; }
/** Override completed count (for tests). */
export function setCompletedCount(n: number): void { completedCount = n; }
/** Override failed count (for tests). */
export function setFailedCount(n: number): void { failedCount = n; }
/** Override skipped count (for tests). */
export function setSkippedCount(n: number): void { skippedCount = n; }
/** Override running flag (for tests). */
export function setRunning(r: boolean): void { running = r; }
/** Override stop-requested flag (for tests). */
export function setStopRequested(s: boolean): void { stopRequested = s; }

// =============================================================================
// CORE PIPELINE
// =============================================================================

/**
 * Enqueue a file for processing. Jobs are inserted by priority (higher values
 * go first). If the pipeline has capacity, immediately starts processing.
 *
 * @param job - The processing job to enqueue
 */
export function enqueue(job: ProcessingJob): void {
    // Insert by priority (higher priority first)
    const idx = queue.findIndex(j => j.priority < job.priority);
    if (idx === -1) {
        queue.push(job);
    } else {
        queue.splice(idx, 0, job);
    }
    processNext();
}

/**
 * Process the next job(s) in the queue, respecting the concurrency limit
 * from `config.knowledgeBase.maxConcurrency` (default 2). Each completed
 * job triggers another `processNext` call to drain the queue.
 * Stops immediately if `stopRequested` is set.
 */
export async function processNext(): Promise<void> {
    if (stopRequested) return;
    const maxConcurrency = config.knowledgeBase?.maxConcurrency || 2;
    while (queue.length > 0 && activeJobs < maxConcurrency && !stopRequested) {
        const job = queue.shift();
        if (!job) break;
        activeJobs++;
        // Fire and forget — errors handled inside processFile
        processFile(job).finally(() => {
            activeJobs--;
            if (!stopRequested) processNext();
        });
    }
}
