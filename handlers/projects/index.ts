/**
 * PROJECT MANAGEMENT HANDLER
 *
 * Shared handler for project management — used by both REST routes and MCP tool.
 * Manages project metadata (stored in data/projects.json outside the DB)
 * and background service lifecycle.
 *
 * Includes interview-based project creation: the gold-standard LLM conducts
 * a multi-turn interview to discover the project's purpose, domains, goals,
 * and structure. The resulting manifest is stored for injection into synthesis,
 * research, and question generation prompts.
 */

export type { ProjectMeta, ProjectsFile } from './meta.js';
export { readProjectsMeta, writeProjectsMeta, isProjectSwitching, getProjectAbortSignal } from './meta.js';
export { stopAllBackgroundServices, clearAllCaches, restartBackgroundServices } from './services.js';
export { handleList, handleCurrent, handleSave, handleLoad, handleNew, handleDelete, handleUpdate, handleEnsure } from './crud.js';
export { bootstrapProject, generateBootstrapSeeds } from './bootstrap.js';
export { handleInterview, cleanupStaleInterviews } from './interview.js';
export { handleManifest, handleUpdateManifest } from './manifest.js';

import { handleList, handleCurrent, handleSave, handleLoad, handleNew, handleDelete, handleUpdate, handleEnsure } from './crud.js';
import { handleInterview } from './interview.js';
import { handleManifest, handleUpdateManifest } from './manifest.js';

// =============================================================================
// DISPATCH
// =============================================================================

/** Dispatches project actions: list, current, save, load, new, delete, update, ensure, interview, manifest. */
export async function handleProjects(params: Record<string, any>) {
    const { action } = params;

    switch (action) {
        case 'list':      return handleList();
        case 'current':   return handleCurrent();
        case 'save':      return handleSave(params);
        case 'load':      return handleLoad(params);
        case 'new':       return handleNew(params);
        case 'delete':    return handleDelete(params);
        case 'update':    return handleUpdate(params);
        case 'ensure':    return handleEnsure(params); // Deprecated — returns current project without switching
        case 'interview': return handleInterview(params);
        case 'manifest':  return handleManifest();
        case 'updateManifest': return handleUpdateManifest(params);
        default:
            return { error: `Unknown action: ${action}. Valid: list, current, save, load, new, delete, update, interview, manifest, updateManifest` };
    }
}
