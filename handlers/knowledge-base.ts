/**
 * KNOWLEDGE BASE - MCP HANDLER
 *
 * Handles all podbit.kb MCP tool actions.
 * Dispatches to the processing pipeline and reader registry.
 */

import { RC } from '../config/constants.js';
import fs from 'fs';
import path from 'path';

/**
 * Dispatches podbit.kb MCP tool actions to the appropriate handler.
 *
 * @param params - Action parameters. Must include `action` string plus action-specific fields.
 * @returns Action-specific result object, or `{ error }` for unknown actions.
 */
export async function handleKnowledgeBase(params: Record<string, any>) {
    const { action } = params;

    switch (action) {
        case 'folders':
            return handleFolders();
        case 'add':
            return handleAdd(params);
        case 'remove':
            return handleRemove(params);
        case 'update':
            return handleUpdate(params);
        case 'scan':
            return handleScan(params);
        case 'status':
            return handleStatus();
        case 'files':
            return handleFiles(params);
        case 'file':
            return handleFileDetail(params);
        case 'reprocess':
            return handleReprocess(params);
        case 'retry':
            return handleRetry(params);
        case 'readers':
            return handleReaders();
        case 'stats':
            return handleStats();
        case 'stop':
            return handleStop();
        case 'defaults':
            return handleDefaults();
        case 'updateDefaults':
            return handleUpdateDefaults(params);
        case 'mapExtension':
            return handleMapExtension(params);
        case 'unmapExtension':
            return handleUnmapExtension(params);
        case 'classify':
            return handleClassify(params);
        case 'classifyStats':
            return handleClassifyStats();
        default:
            return { error: `Unknown KB action: ${action}. Valid actions: folders, add, remove, update, scan, status, files, file, reprocess, retry, readers, stats, stop, defaults, updateDefaults, mapExtension, unmapExtension, classify, classifyStats` };
    }
}

/** List all registered KB folders with their settings. */
async function handleFolders() {
    const { processingPipeline } = await import('../kb/pipeline.js');
    const folders = await processingPipeline.listFolders();
    return { folders };
}

/**
 * Normalize glob patterns to a string array.
 * Handles: string ("a, b"), array, null/undefined.
 */
function normalizePatterns(input: any): string[] | null {
    if (!input) return null;
    if (Array.isArray(input)) {
        // Flatten any comma-separated entries within the array
        return input.flatMap((p: any) =>
            typeof p === 'string' ? p.split(',').map(s => s.trim()).filter(Boolean) : []
        );
    }
    if (typeof input === 'string') {
        const parts = input.split(',').map(s => s.trim()).filter(Boolean);
        return parts.length > 0 ? parts : null;
    }
    return null;
}

/**
 * Register a new folder for KB ingestion.
 *
 * Validates folder existence, auto-derives domain from folder name if not
 * provided, detects dual-folder patterns (same path, different raw/curated modes),
 * and prevents conflicts.
 *
 * @param params - Object with `folderPath` (required), optional `domain`, `recursive`,
 *   `watchEnabled`, `includePatterns`, `excludePatterns`, `autoDomainSubfolders`, `rawMode`.
 * @returns `{ success, folder }` on success, with optional `warning` for dual-folder pattern.
 */
async function handleAdd(params: Record<string, any>) {
    const { folderPath, recursive, watchEnabled, includePatterns, excludePatterns, autoDomainSubfolders, rawMode } = params;

    if (!folderPath) return { error: 'folderPath is required' };

    // Validate folder exists
    const resolved = path.resolve(folderPath);

    // Auto-derive domain from folder name if not provided
    const domain = params.domain || path.basename(resolved).toLowerCase().replace(/\s+/g, '-');
    if (!fs.existsSync(resolved)) {
        return { error: `Folder does not exist: ${resolved}` };
    }
    if (!fs.statSync(resolved).isDirectory()) {
        return { error: `Not a directory: ${resolved}` };
    }

    const { processingPipeline } = await import('../kb/pipeline.js');

    // Check for dual-folder pattern: same path registered with different modes
    const existing = await processingPipeline.listFolders();
    const caseInsensitive = process.platform === 'win32';
    const normalizedPath = resolved.replace(/\\/g, '/');
    const overlapping = existing.filter(f => {
        const fp = (f.folder_path || '').replace(/\\/g, '/');
        return caseInsensitive
            ? fp.toLowerCase() === normalizedPath.toLowerCase()
            : fp === normalizedPath;
    });

    let warning: string | undefined;
    if (overlapping.length > 0) {
        const existingModes = overlapping.map(f => f.raw_mode ? 'raw' : 'curated');
        const newMode = rawMode ? 'raw' : 'curated';
        const hasSameMode = overlapping.some(f => (f.raw_mode ? 'raw' : 'curated') === newMode);

        if (hasSameMode) {
            return { error: `This folder is already registered in ${newMode} mode. Use a different path or update the existing folder.` };
        }
        // Valid dual-folder pattern — same path, different modes
        warning = `Dual-folder pattern detected: this path already has a ${existingModes.join('+')} folder. Adding ${newMode} mode. Raw nodes are excluded from autonomous cycles — this is expected. Use different domains for each mode.`;

        if (overlapping.some(f => f.domain === domain)) {
            return { error: `Dual-folder conflict: the existing folder for this path already uses domain "${domain}". Use a different domain for the ${newMode} mode folder.` };
        }
    }

    const folder = await processingPipeline.addFolder({
        folderPath: resolved,
        domain,
        recursive: recursive !== false,
        watchEnabled: watchEnabled !== false,
        includePatterns: normalizePatterns(includePatterns) ?? undefined,
        excludePatterns: normalizePatterns(excludePatterns) ?? undefined,
        autoDomainSubfolders: autoDomainSubfolders || false,
        rawMode: rawMode || false,
    });

    return { success: true, folder, ...(warning ? { warning } : {}) };
}

/**
 * Remove a watched folder from KB.
 * @param params - Object with `folderId` (required) and optional `deleteNodes` (boolean).
 */
async function handleRemove(params: Record<string, any>) {
    const { folderId, deleteNodes } = params;
    if (!folderId) return { error: 'folderId is required' };

    const { processingPipeline } = await import('../kb/pipeline.js');
    await processingPipeline.removeFolder(folderId, deleteNodes === true);
    return { success: true };
}

/**
 * Update folder settings (domain, patterns, watch, etc.).
 * Maps camelCase MCP params to snake_case DB column names automatically.
 * @param params - Object with `folderId` (required) plus any fields to change.
 */
async function handleUpdate(params: Record<string, any>) {
    const { folderId, ...updates } = params;
    if (!folderId) return { error: 'folderId is required' };

    // Map camelCase MCP params to snake_case DB column names
    const mapped: Record<string, any> = {};
    const camelToSnake: Record<string, string> = {
        folderPath: 'folder_path',
        excludePatterns: 'exclude_patterns',
        includePatterns: 'include_patterns',
        watchEnabled: 'watch_enabled',
        autoDomainSubfolders: 'auto_domain_subfolders',
    };
    for (const [key, value] of Object.entries(updates)) {
        const dbKey = camelToSnake[key] || key;
        if (dbKey === 'include_patterns' || dbKey === 'exclude_patterns') {
            mapped[dbKey] = normalizePatterns(value);
        } else {
            mapped[dbKey] = value;
        }
    }

    const { processingPipeline } = await import('../kb/pipeline.js');
    await processingPipeline.updateFolder(folderId, mapped);
    return { success: true };
}

/**
 * Trigger a scan-and-queue for a folder, processing new/changed files.
 * Ensures all readers (including async advanced ones) are registered and
 * custom extension mappings are loaded before scanning.
 * @param params - Object with `folderId` (required).
 */
async function handleScan(params: Record<string, any>) {
    const { folderId } = params;
    if (!folderId) return { error: 'folderId is required' };

    // Ensure ALL readers (including async advanced ones) are fully registered
    const { readersReady } = await import('../kb/readers/index.js');
    await readersReady;

    // Load any custom extension-to-reader mappings from DB
    await loadSavedExtensionMappings();

    const { processingPipeline } = await import('../kb/pipeline.js');
    // Ensure pipeline is running — scanning implies the user wants processing.
    // stopRequested may be stuck from a prior interview or project switch.
    processingPipeline.resume();
    const result = await processingPipeline.scanAndQueue(folderId);

    // Timeline marker for journal
    try {
        const { createTimelineMarker } = await import('../core/journal.js');
        const { queryOne } = await import('../db/sqlite-backend.js');
        const folder = await queryOne('SELECT folder_path, domain FROM kb_folders WHERE id = ?', [folderId]);
        await createTimelineMarker('kb_scan', `KB scan: ${folder?.folder_path || folderId}`, {
            folderId,
            domain: folder?.domain,
            ...result,
        }, 'kb');
    } catch { /* journal may not be ready yet */ }

    return {
        success: true,
        ...result,
    };
}

/** Get current pipeline processing status (queue length, active jobs, etc.). */
async function handleStatus() {
    const { processingPipeline } = await import('../kb/pipeline.js');
    return processingPipeline.getStatus();
}

/**
 * List files tracked by the KB pipeline with optional filters.
 * @param params - Object with optional `folderId`, `status`, `domain`, `limit`, `offset`.
 */
async function handleFiles(params: Record<string, any>) {
    const { folderId, status, domain, limit, offset } = params;
    const { processingPipeline } = await import('../kb/pipeline.js');
    const files = await processingPipeline.listFiles({ folderId, status, domain, limit, offset });
    return { files };
}

/**
 * Get detailed info for a single file including its chunks.
 * @param params - Object with `fileId` (required).
 */
async function handleFileDetail(params: Record<string, any>) {
    const { fileId } = params;
    if (!fileId) return { error: 'fileId is required' };

    const { processingPipeline } = await import('../kb/pipeline.js');
    const detail = await processingPipeline.getFileDetail(fileId);
    if (!detail) return { error: `File not found: ${fileId}` };
    return detail;
}

/**
 * Re-read and reprocess a single file through the KB pipeline.
 * @param params - Object with `fileId` (required).
 */
async function handleReprocess(params: Record<string, any>) {
    const { fileId } = params;
    if (!fileId) return { error: 'fileId is required' };

    await import('../kb/readers/index.js');
    const { processingPipeline } = await import('../kb/pipeline.js');
    await processingPipeline.reprocessFile(fileId);
    return { success: true };
}

/**
 * Retry all failed files, optionally scoped to a specific folder.
 * @param params - Object with optional `folderId`.
 * @returns `{ success, retriedCount }`.
 */
async function handleRetry(params: Record<string, any>) {
    const { folderId } = params;
    await import('../kb/readers/index.js');
    const { processingPipeline } = await import('../kb/pipeline.js');
    const count = await processingPipeline.retryFailed(folderId);
    return { success: true, retriedCount: count };
}

/** List all registered reader plugins with their extensions and custom mappings. */
async function handleReaders() {
    const { readersReady } = await import('../kb/readers/index.js');
    await readersReady;
    await loadSavedExtensionMappings();
    const { getAllReaders, getSupportedExtensions, getCustomMappings } = await import('../kb/readers/registry.js');
    const readers = getAllReaders().map(r => ({
        id: r.id,
        name: r.name,
        subsystem: r.subsystem,
        extensions: r.extensions,
        requiresLLM: r.requiresLLM,
    }));
    return { readers, supportedExtensions: getSupportedExtensions(), customMappings: getCustomMappings() };
}

/** Get aggregate KB ingestion statistics combined with pipeline status. */
async function handleStats() {
    const { processingPipeline } = await import('../kb/pipeline.js');
    const stats = await processingPipeline.getStats();
    const status = processingPipeline.getStatus();
    return { ...stats, pipeline: status };
}

/** Stop the KB processing pipeline, clearing queued jobs and resetting in-progress files. */
async function handleStop() {
    const { processingPipeline } = await import('../kb/pipeline.js');
    const result = await processingPipeline.stop();
    return { success: true, ...result };
}

/** Get the current KB default settings (exclude patterns, chunk sizes, etc.). */
async function handleDefaults() {
    const { config } = await import('../config.js');
    const kb = config.knowledgeBase;
    return {
        defaultExcludePatterns: kb?.defaultExcludePatterns || [],
        skipLargeFiles: kb?.skipLargeFiles || 0,
        maxChunkSize: kb?.maxChunkSize || RC.contentLimits.kbDefaultChunkSize,
        minChunkLength: kb?.minChunkLength || 50,
        curationMaxTokens: kb?.curationMaxTokens || 0,
        maxNodesPerFile: kb?.maxNodesPerFile || 12,
    };
}

/**
 * Update the default exclude patterns. Uses the config override system
 * so changes persist alongside all other tuning overrides.
 */
async function handleUpdateDefaults(params: Record<string, any>) {
    const { defaultExcludePatterns } = params;
    if (!Array.isArray(defaultExcludePatterns)) {
        return { error: 'defaultExcludePatterns must be an array of strings' };
    }
    const patterns = defaultExcludePatterns.filter((p: any) => typeof p === 'string' && p.trim()).map((p: string) => p.trim());

    // Update live config + persist via the standard config override system
    const { updateConfig } = await import('../config/loader.js');
    await updateConfig({ knowledgeBase: { defaultExcludePatterns: patterns } } as any);

    return { success: true, defaultExcludePatterns: patterns };
}

/**
 * Map a custom file extension to an existing reader.
 * Persists in the settings table so it survives restarts.
 */
async function handleMapExtension(params: Record<string, any>) {
    const { extension, readerName } = params;
    if (!extension || !readerName) return { error: 'extension and readerName are required' };

    const ext = extension.toLowerCase().replace(/^\./, '');

    // Ensure readers are loaded
    const { readersReady } = await import('../kb/readers/index.js');
    await readersReady;

    const { getReaderForExtension, mapExtensionToReader, getCustomMappings } = await import('../kb/readers/registry.js');

    // Check if this extension already maps to the requested reader natively
    const existing = getReaderForExtension(ext);
    if (existing && existing.name.toLowerCase() === readerName.toLowerCase()) {
        return { error: `.${ext} is already handled by ${existing.name}` };
    }

    const ok = mapExtensionToReader(ext, readerName);
    if (!ok) return { error: `Reader "${readerName}" not found` };

    // Persist to DB (system setting — survives project switches)
    const { systemQuery: dbQuery } = await import('../db.js');
    const mappings = getCustomMappings();
    await dbQuery(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('kb.extensionMappings', $1)`,
        [JSON.stringify(mappings)]
    );

    return { success: true, extension: ext, readerName, mappings };
}

/**
 * Remove a custom extension mapping.
 */
async function handleUnmapExtension(params: Record<string, any>) {
    const { extension } = params;
    if (!extension) return { error: 'extension is required' };

    const ext = extension.toLowerCase().replace(/^\./, '');

    const { readersReady } = await import('../kb/readers/index.js');
    await readersReady;

    const { unmapExtension, getCustomMappings } = await import('../kb/readers/registry.js');
    unmapExtension(ext);

    // Persist remaining custom mappings to DB (system setting)
    const { systemQuery: dbQuery } = await import('../db.js');
    const mappings = getCustomMappings();
    await dbQuery(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('kb.extensionMappings', $1)`,
        [JSON.stringify(mappings)]
    );

    return { success: true, extension: ext, mappings };
}

/**
 * Load saved custom extension mappings from DB into the reader registry.
 *
 * Called at scan time to ensure custom mappings (e.g., .xyz -> text-reader)
 * are active. Persisted in the system settings table under key `kb.extensionMappings`.
 *
 * @returns Number of mappings successfully loaded.
 */
export async function loadSavedExtensionMappings(): Promise<number> {
    try {
        const { systemQuery: dbQuery } = await import('../db.js');
        const rows = await dbQuery(`SELECT value FROM settings WHERE key = 'kb.extensionMappings'`);
        if (!rows || rows.length === 0 || !rows[0].value) return 0;

        const mappings = JSON.parse(rows[0].value) as Array<{ extension: string; readerName: string }>;
        const { mapExtensionToReader } = await import('../kb/readers/registry.js');

        let loaded = 0;
        for (const { extension, readerName } of mappings) {
            if (mapExtensionToReader(extension, readerName)) loaded++;
        }
        return loaded;
    } catch {
        return 0;
    }
}

/**
 * Run synthesizability classification on unclassified nodes.
 * Uses a small model (keyword subsystem) to determine if nodes contain
 * synthesizable knowledge. Non-synthesizable orphans are removed; connected
 * ones are archived.
 */
async function handleClassify(params: Record<string, any>) {
    const { classifyUnclassifiedNodes } = await import('../core/synthesizability.js');
    const limit = params.limit ?? 50;
    return classifyUnclassifiedNodes(limit);
}

/** Get synthesizability classification stats for the current graph. */
async function handleClassifyStats() {
    const { getSynthesizabilityStats } = await import('../core/synthesizability.js');
    return getSynthesizabilityStats();
}
