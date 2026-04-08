import { query } from '../../db.js';
import { setProjectSwitching, getAbortController } from './meta.js';

// =============================================================================
// BACKGROUND SERVICE LIFECYCLE
// =============================================================================

/**
 * Stop all cycles, workers, and background services that write to the project DB.
 * Waits for all loops to fully exit before returning.
 *
 * Used by both project switch and journal rollback — any operation that needs
 * exclusive DB access with no concurrent writes.
 */
export async function stopAllCyclesAndWorkers(): Promise<void> {
    // Abort ALL inflight LLM HTTP requests immediately
    getAbortController().abort();

    let synthesisWasRunning = false;
    const runningCycles: string[] = [];

    // 1. Stop synthesis engine
    try {
        const { stopSynthesisEngine, getSynthesisStatus } = await import('../../core.js');
        if (getSynthesisStatus().running) {
            stopSynthesisEngine();
            synthesisWasRunning = true;
        }
    } catch { /* engine may not be loaded */ }

    // 2. Stop all autonomous cycles
    try {
        const { stopCycle, cycleStates } = await import('../../core.js');
        for (const type of ['validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing', 'ground_rules', 'population_control'] as const) {
            if (cycleStates[type]?.running) {
                stopCycle(type);
                runningCycles.push(type);
            }
        }
    } catch { /* cycles may not be loaded */ }

    // 3. Stop KB watchers
    try {
        const { stopAllWatchers } = await import('../../kb/watcher.js');
        await stopAllWatchers();
    } catch { /* KB module may not be loaded */ }

    // 3a. Stop KB pipeline queue (critical: prevents queued jobs from writing to the new DB)
    try {
        const { processingPipeline } = await import('../../kb/pipeline.js');
        const { cleared, reset } = await processingPipeline.stop();
        if (cleared > 0 || reset > 0) {
            console.error(`[projects] Pipeline stopped: cleared ${cleared} jobs, reset ${reset} files`);
        }
    } catch { /* KB module may not be loaded */ }

    // 3b. Stop pool return check
    try {
        const { stopPoolReturnCheck } = await import('../../core/pool-integration.js');
        stopPoolReturnCheck();
    } catch { /* pool module may not be loaded */ }

    // 3c. Stop lab queue worker (polls for lab results and writes to nodes/lab_queue)
    try {
        const { stopQueueWorker } = await import('../../evm/queue-worker.js');
        await stopQueueWorker();
    } catch { /* queue worker may not be loaded */ }

    // 3d. Stop lab health checker (pings lab servers, updates lab_registry in system DB)
    try {
        const { stopLabHealthChecker } = await import('../../lab/health.js');
        stopLabHealthChecker();
    } catch { /* health checker may not be loaded */ }

    // 4. Wait for all loops to actually exit (poll running flags, max 10s)
    if (synthesisWasRunning || runningCycles.length > 0) {
        const maxWaitMs = 10_000;
        const pollMs = 100;
        const deadline = Date.now() + maxWaitMs;

        while (Date.now() < deadline) {
            let anyRunning = false;

            try {
                const { getSynthesisStatus, cycleStates } = await import('../../core.js');
                if (synthesisWasRunning && getSynthesisStatus().running) {
                    anyRunning = true;
                }
                for (const type of runningCycles) {
                    if (cycleStates[type as keyof typeof cycleStates]?.running) {
                        anyRunning = true;
                    }
                }
            } catch { break; }

            if (!anyRunning) break;
            await new Promise(r => setTimeout(r, pollMs));
        }
    }
}

/**
 * Stop ALL background services before a project switch.
 * Sets the project-switching flag and delegates to stopAllCyclesAndWorkers.
 */
export async function stopAllBackgroundServices(): Promise<void> {
    setProjectSwitching(true);
    await stopAllCyclesAndWorkers();
}

/**
 * Clear all in-memory caches and reload config/models from the new DB.
 */
export async function clearAllCaches(): Promise<void> {
    // Clear embedding cache
    try {
        const { clearAll } = await import('../../vector/embedding-cache.js');
        clearAll();
    } catch { /* cache module may not be loaded */ }

    // Reload config + models from new DB
    const { loadSavedConfig } = await import('../../config.js');
    const { loadSavedModels } = await import('../../models.js');
    await loadSavedConfig();
    await loadSavedModels();

    // Clear context engine sessions
    try {
        const { clearAllSessions } = await import('../../context-engine.js');
        clearAllSessions();
    } catch { /* context engine may not be loaded */ }

    // Clear project manifest cache (so the new project's manifest is loaded)
    try {
        const { invalidateManifestCache } = await import('../../core/project-context.js');
        invalidateManifestCache();
    } catch { /* project-context module may not be loaded */ }

    // Clear transient domain cache
    try {
        const { clearTransientCache } = await import('../../core/governance.js');
        clearTransientCache();
    } catch { /* governance module may not be loaded */ }

    // Clear number variable installation prefix cache (new DB may have different installation ID)
    try {
        const { clearInstallationPrefixCache } = await import('../../core/number-variables.js');
        clearInstallationPrefixCache();
    } catch { /* module may not be loaded */ }

    // Clear knowledge cache in new DB
    try {
        await query('DELETE FROM knowledge_cache');
    } catch { /* table may not exist */ }
}

/**
 * Restart background services for the new project.
 * Only restarts KB watchers — synthesis/autonomous cycles are user-initiated.
 */
export async function restartBackgroundServices(): Promise<number> {
    // Resume KB pipeline (was stopped during project switch)
    try {
        const { processingPipeline } = await import('../../kb/pipeline.js');
        processingPipeline.resume();
    } catch { /* KB module may not be loaded */ }

    let kbWatchers = 0;
    try {
        const { startAllWatchers } = await import('../../kb/watcher.js');
        kbWatchers = await startAllWatchers();
    } catch { /* KB module may not be loaded */ }

    // Restart lab queue worker
    try {
        const { startQueueWorker } = await import('../../evm/queue-worker.js');
        startQueueWorker();
    } catch { /* queue worker may not be loaded */ }

    // Restart lab health checker
    try {
        const { startLabHealthChecker } = await import('../../lab/health.js');
        startLabHealthChecker();
    } catch { /* health checker may not be loaded */ }

    return kbWatchers;
}
