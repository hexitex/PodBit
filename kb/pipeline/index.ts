/**
 * KNOWLEDGE BASE - PROCESSING PIPELINE FACADE
 *
 * Aggregates all pipeline operations (queue, folder management, admin)
 * into a single `processingPipeline` object for external consumption.
 */

import { enqueue } from './queue.js';
import { scanAndQueue, addFolder, removeFolder, updateFolder } from './folder.js';
import {
    listFolders, listFiles, getFileDetail, reprocessFile, reprocessFolder, retryFailed,
    getStatus, getStats, stop, resume, resetCounters, recoverStuckFiles,
    requeuePendingFiles, backfillFilenameKeywords,
} from './admin.js';

/**
 * Unified pipeline API surface. Collects queue, folder, and admin operations
 * into a single object exported as the public interface of the KB pipeline.
 */
export const processingPipeline = {
    enqueue,
    scanAndQueue,
    addFolder,
    removeFolder,
    listFolders,
    updateFolder,
    listFiles,
    getFileDetail,
    reprocessFile,
    reprocessFolder,
    retryFailed,
    getStatus,
    getStats,
    resetCounters,
    recoverStuckFiles,
    requeuePendingFiles,
    backfillFilenameKeywords,
    stop,
    resume,
};
