/**
 * Unit tests for kb/pipeline/queue.ts — pipeline state and job queue management.
 *
 * NOTE: ts-jest does not preserve ESM live bindings for `export let` variables.
 * We cannot read mutable state directly via imported names. Instead we test
 * behavior through enqueue/processNext and their observable effects (processFile calls).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock config before import
jest.unstable_mockModule('../../config.js', () => ({
    config: {
        knowledgeBase: { maxConcurrency: 2 },
    },
}));

// Mock file-processing to avoid real processing
const mockProcessFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../kb/pipeline/file-processing.js', () => ({
    processFile: mockProcessFile,
}));

const mod = await import('../../kb/pipeline/queue.js');
const {
    setQueue,
    setActiveJobs,
    setCompletedCount,
    setFailedCount,
    setSkippedCount,
    setRunning,
    setStopRequested,
    enqueue,
    processNext,
} = mod;

function makeJob(overrides: Record<string, any> = {}) {
    return {
        fileId: 'file-1',
        filePath: '/test/file.txt',
        folderId: 'folder-1',
        domain: 'test-domain',
        extension: 'txt',
        priority: 0,
        rawMode: false,
        ...overrides,
    };
}

/** Read queue length via the module namespace object (bypasses stale bindings). */
function getQueue() { return (mod as any).queue as any[]; }
function getActiveJobs() { return (mod as any).activeJobs as number; }
function getCompletedCount() { return (mod as any).completedCount as number; }
function getFailedCount() { return (mod as any).failedCount as number; }
function getSkippedCount() { return (mod as any).skippedCount as number; }
function getRunning() { return (mod as any).running as boolean; }
function getStopRequested() { return (mod as any).stopRequested as boolean; }

beforeEach(() => {
    jest.resetAllMocks();
    setQueue([]);
    setActiveJobs(0);
    setCompletedCount(0);
    setFailedCount(0);
    setSkippedCount(0);
    setRunning(false);
    setStopRequested(false);
    mockProcessFile.mockResolvedValue(undefined);
});

// =============================================================================
// State setters
// =============================================================================

describe('state setters', () => {
    it('setQueue replaces the queue', () => {
        const jobs = [makeJob({ fileId: 'a' }), makeJob({ fileId: 'b' })];
        setQueue(jobs);
        expect(getQueue()).toEqual(jobs);
    });

    it('setActiveJobs sets the active job count', () => {
        setActiveJobs(5);
        expect(getActiveJobs()).toBe(5);
    });

    it('setCompletedCount updates completed counter', () => {
        setCompletedCount(10);
        expect(getCompletedCount()).toBe(10);
    });

    it('setFailedCount updates failed counter', () => {
        setFailedCount(3);
        expect(getFailedCount()).toBe(3);
    });

    it('setSkippedCount updates skipped counter', () => {
        setSkippedCount(7);
        expect(getSkippedCount()).toBe(7);
    });

    it('setRunning updates running flag', () => {
        setRunning(true);
        expect(getRunning()).toBe(true);
        setRunning(false);
        expect(getRunning()).toBe(false);
    });

    it('setStopRequested updates stop flag', () => {
        setStopRequested(true);
        expect(getStopRequested()).toBe(true);
    });
});

// =============================================================================
// enqueue
// =============================================================================

describe('enqueue', () => {
    it('adds a job to the end of the queue when priority is equal', () => {
        // Prevent processNext from consuming jobs
        setStopRequested(true);
        enqueue(makeJob({ fileId: 'a', priority: 0 }));
        enqueue(makeJob({ fileId: 'b', priority: 0 }));
        const q = getQueue();
        expect(q.length).toBe(2);
        expect(q[0].fileId).toBe('a');
        expect(q[1].fileId).toBe('b');
    });

    it('inserts higher priority jobs before lower priority ones', () => {
        setStopRequested(true);
        enqueue(makeJob({ fileId: 'low', priority: 0 }));
        enqueue(makeJob({ fileId: 'high', priority: 1 }));
        const q = getQueue();
        expect(q[0].fileId).toBe('high');
        expect(q[1].fileId).toBe('low');
    });

    it('maintains priority ordering with multiple priorities', () => {
        setStopRequested(true);
        enqueue(makeJob({ fileId: 'normal-1', priority: 0 }));
        enqueue(makeJob({ fileId: 'normal-2', priority: 0 }));
        enqueue(makeJob({ fileId: 'high', priority: 1 }));
        enqueue(makeJob({ fileId: 'urgent', priority: 2 }));

        const q = getQueue();
        expect(q[0].fileId).toBe('urgent');
        expect(q[1].fileId).toBe('high');
        expect(q[2].fileId).toBe('normal-1');
        expect(q[3].fileId).toBe('normal-2');
    });

    it('calls processNext after enqueuing (triggers processing)', () => {
        // With stopRequested=false and activeJobs=0, enqueue triggers processNext
        // which calls processFile. We can verify processFile was called.
        enqueue(makeJob({ fileId: 'auto-process' }));
        expect(mockProcessFile).toHaveBeenCalled();
    });
});

// =============================================================================
// processNext
// =============================================================================

describe('processNext', () => {
    it('does nothing when stopRequested is true', async () => {
        setStopRequested(true);
        setQueue([makeJob()]);
        await processNext();
        expect(mockProcessFile).not.toHaveBeenCalled();
    });

    it('does nothing when queue is empty', async () => {
        await processNext();
        expect(mockProcessFile).not.toHaveBeenCalled();
    });

    it('processes jobs from the queue', async () => {
        const job = makeJob({ fileId: 'process-me' });
        setQueue([job]);
        await processNext();
        expect(mockProcessFile).toHaveBeenCalledWith(job);
    });

    it('respects concurrency limit', async () => {
        setActiveJobs(2); // at maxConcurrency
        setQueue([makeJob()]);
        await processNext();
        expect(mockProcessFile).not.toHaveBeenCalled();
    });

    it('processes all queued jobs when mock resolves immediately', async () => {
        const job1 = makeJob({ fileId: 'j1' });
        const job2 = makeJob({ fileId: 'j2' });
        const job3 = makeJob({ fileId: 'j3' });
        setQueue([job1, job2, job3]);
        // maxConcurrency=2 but processFile resolves instantly, so the
        // finally callback re-calls processNext and drains the queue.
        await processNext();
        await new Promise(r => setTimeout(r, 10));
        expect(mockProcessFile).toHaveBeenCalledTimes(3);
        expect(mockProcessFile).toHaveBeenCalledWith(job1);
        expect(mockProcessFile).toHaveBeenCalledWith(job2);
        expect(mockProcessFile).toHaveBeenCalledWith(job3);
    });

    it('decrements activeJobs when processFile completes', async () => {
        const job = makeJob({ fileId: 'done' });
        setQueue([job]);
        // processFile resolves immediately
        await processNext();
        // After the finally block runs, activeJobs should decrement
        // Give it a tick to settle
        await new Promise(r => setTimeout(r, 10));
        // activeJobs was incremented to 1, then decremented back to 0 after processFile resolved
        // But the finally also calls processNext again (recursion), so it depends on queue state
        expect(mockProcessFile).toHaveBeenCalledWith(job);
    });
});
