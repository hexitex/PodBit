import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { query, backupDatabase, switchProject, saveProjectCopy, createEmptyProject, getProjectDir } from '../../db.js';
import { applyEncryptionKey } from '../../db/sqlite-backend.js';
import { readProjectsMeta, writeProjectsMeta, setProjectSwitching, resetAbortController } from './meta.js';
import { stopAllBackgroundServices, clearAllCaches, restartBackgroundServices } from './services.js';
import { bootstrapProject } from './bootstrap.js';

// =============================================================================
// ACTION HANDLERS
// =============================================================================

/** Returns list of saved projects with file size and manifest; includes currentProject. */
export async function handleList() {
    const meta = readProjectsMeta();
    const pDir = getProjectDir();
    const projects = Object.entries(meta.projects).map(([name, info]) => {
        const dbPath = path.join(pDir, `${name}.db`);
        const exists = fs.existsSync(dbPath);
        const size = exists ? fs.statSync(dbPath).size : 0;

        // Read manifest from non-active project DBs (active project uses live DB)
        let manifest: any = null;
        if (exists && name !== meta.currentProject) {
            try {
                const tmpDb = new Database(dbPath, { readonly: true, fileMustExist: true });
                applyEncryptionKey(tmpDb);
                try {
                    const row = tmpDb.prepare('SELECT value FROM settings WHERE key = ?').get('project.manifest') as any;
                    if (row?.value) manifest = JSON.parse(row.value);
                } catch { /* settings table may not exist */ }
                tmpDb.close();
            } catch { /* DB may be locked or corrupt */ }
        }

        return { name, ...info, fileSize: size, fileExists: exists, manifest };
    });
    return { currentProject: meta.currentProject, projects };
}

/** Returns the currently active project name and its metadata. */
export async function handleCurrent() {
    const meta = readProjectsMeta();
    const name = meta.currentProject;
    if (!name) return { currentProject: null };
    return {
        currentProject: name,
        ...(meta.projects[name] || {}),
    };
}

/** Saves the current DB as a named project (copy file + meta); validates name and stops services. */
export async function handleSave(params: Record<string, any>) {
    const { name, description } = params;
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { error: 'Invalid project name. Use alphanumeric, hyphens, underscores only.' };
    }

    const pDir = getProjectDir();
    const destPath = path.join(pDir, `${name}.db`);

    // Gather stats
    let nodeCount = 0;
    let domainList: string[] = [];
    try {
        const countResult = await query('SELECT COUNT(*) as count FROM nodes WHERE junk = 0');
        nodeCount = parseInt((countResult[0] as any)?.count || '0', 10);
        const domainResult = await query('SELECT DISTINCT domain FROM nodes WHERE domain IS NOT NULL AND junk = 0');
        domainList = domainResult.map((d: any) => d.domain);
    } catch { /* table may not exist */ }

    await saveProjectCopy(destPath);

    const meta = readProjectsMeta();
    meta.projects[name] = {
        created: meta.projects[name]?.created || new Date().toISOString(),
        lastSaved: new Date().toISOString(),
        description: description ?? meta.projects[name]?.description ?? '',
        nodeCount,
        domains: domainList,
    };
    meta.currentProject = name;
    writeProjectsMeta(meta);

    return { success: true, name, message: `Project "${name}" saved successfully` };
}

/** Switches to a saved project: stops services, auto-saves current, backup, switchProject, clear caches, restart services and pool. */
export async function handleLoad(params: Record<string, any>) {
    const { name } = params;
    if (!name) return { error: 'name is required' };

    const pDir = getProjectDir();
    const srcPath = path.join(pDir, `${name}.db`);
    if (!fs.existsSync(srcPath)) {
        return { error: `Project "${name}" not found` };
    }

    await stopAllBackgroundServices();

    // Auto-save current project before switching (prevents data loss)
    const metaPre = readProjectsMeta();
    if (metaPre.currentProject && metaPre.currentProject !== name) {
        try {
            await handleSave({ name: metaPre.currentProject });
            console.error(`[projects] Auto-saved current project "${metaPre.currentProject}" before switching`);
        } catch (e: any) {
            console.error(`[projects] Auto-save of "${metaPre.currentProject}" failed: ${e.message}`);
        }
    }

    // Auto-backup before switch (safety net)
    try {
        await backupDatabase(`pre-switch-${Date.now()}`);
    } catch (e: any) {
        console.error(`[projects] Auto-backup failed: ${e.message}`);
    }

    await switchProject(srcPath);
    await clearAllCaches();            // Clear caches BEFORE creating new signal
    resetAbortController();
    setProjectSwitching(false);         // Only unblock after caches & signal are ready
    const kbWatchers = await restartBackgroundServices();

    // Update metadata
    const meta = readProjectsMeta();
    meta.currentProject = name;
    writeProjectsMeta(meta);

    // Activate any pending pool recruitments for this project
    let poolActivated = 0;
    try {
        const { config } = await import('../../config.js');
        if (config.partitionServer.enabled) {
            const { checkAndActivateRecruitments, startPoolReturnCheck } = await import('../../core/pool-integration.js');
            poolActivated = await checkAndActivateRecruitments();
            startPoolReturnCheck();
        }
    } catch { /* pool not available */ }


    return {
        success: true,
        name,
        message: `Project "${name}" loaded. All caches refreshed.${kbWatchers > 0 ? ` ${kbWatchers} KB watcher(s) restarted.` : ''}${poolActivated > 0 ? ` ${poolActivated} pool recruitment(s) activated.` : ''}`,
    };
}

/** Creates a new empty project DB, updates meta, runs bootstrap (partitions, seeds); auto-saves and backs up current first. */
export async function handleNew(params: Record<string, any>) {
    const { name, description, purpose, domains, bridges, goals, autoBridge } = params;
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { error: 'Invalid project name. Use alphanumeric, hyphens, underscores only.' };
    }

    const pDir = getProjectDir();
    if (fs.existsSync(path.join(pDir, `${name}.db`))) {
        return { error: `Project "${name}" already exists` };
    }

    await stopAllBackgroundServices();

    // Auto-save current project before creating new one (prevents data loss)
    const metaPre = readProjectsMeta();
    if (metaPre.currentProject) {
        try {
            await handleSave({ name: metaPre.currentProject });
            console.error(`[projects] Auto-saved current project "${metaPre.currentProject}" before creating new`);
        } catch (e: any) {
            console.error(`[projects] Auto-save of "${metaPre.currentProject}" failed: ${e.message}`);
        }
    }

    // Auto-backup before switch (safety net)
    try {
        await backupDatabase(`pre-new-project-${Date.now()}`);
    } catch (e: any) {
        console.error(`[projects] Auto-backup failed: ${e.message}`);
    }

    // Snapshot project assignments before switching (so new project inherits model setup)
    let priorAssignments: any[] = [];
    try {
        priorAssignments = await query(
            `SELECT subsystem, model_id, thinking_level, consultant_model_id FROM project_assignments`
        );
    } catch { /* table may not exist */ }

    const newDbPath = path.join(pDir, `${name}.db`);
    await createEmptyProject(newDbPath);

    // Carry forward project assignments into the new DB
    if (priorAssignments.length > 0) {
        for (const row of priorAssignments) {
            try {
                await query(
                    `INSERT INTO project_assignments (subsystem, model_id, thinking_level, consultant_model_id, updated_at)
                     VALUES ($1, $2, $3, $4, datetime('now'))
                     ON CONFLICT (subsystem) DO UPDATE SET model_id = $2, thinking_level = $3, consultant_model_id = $4, updated_at = datetime('now')`,
                    [row.subsystem, row.model_id, row.thinking_level, row.consultant_model_id]
                );
            } catch { /* skip if schema differs */ }
        }
        console.error(`[projects] Carried forward ${priorAssignments.length} model assignment(s) to new project`);
    }

    await clearAllCaches();            // Clear caches BEFORE creating new signal
    resetAbortController();
    setProjectSwitching(false);         // Only unblock after caches & signal are ready

    // Update metadata
    const meta = readProjectsMeta();
    meta.currentProject = name;
    meta.projects[name] = {
        created: new Date().toISOString(),
        lastSaved: new Date().toISOString(),
        description: description || '',
        nodeCount: 0,
        domains: domains || [],
        purpose,
        goals,
        autoBridge,
    };
    writeProjectsMeta(meta);

    // === Bootstrap: store project-level settings in DB ===
    const bootstrapResult = await bootstrapProject({ purpose, domains, bridges, goals, autoBridge, name });

    const msg = bootstrapResult.seeded > 0
        ? `New project "${name}" created with ${bootstrapResult.partitions} partition(s), ${bootstrapResult.bridges} bridge(s), and ${bootstrapResult.seeded} foundational seed(s).`
        : `New project "${name}" created. Fresh knowledge base ready.`;


    return { success: true, name, message: msg, bootstrap: bootstrapResult };
}

/** Deletes a saved project (DB file + meta); cannot delete the active project. */
export async function handleDelete(params: Record<string, any>) {
    const { name } = params;
    if (!name) return { error: 'name is required' };

    const meta = readProjectsMeta();
    if (meta.currentProject === name) {
        return { error: 'Cannot delete the currently active project. Switch to another project first.' };
    }

    const pDir = getProjectDir();
    const dbPath = path.join(pDir, `${name}.db`);
    for (const ext of ['', '-wal', '-shm']) {
        const p = ext ? dbPath + ext : dbPath;
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    delete meta.projects[name];
    writeProjectsMeta(meta);

    return { success: true, message: `Project "${name}" deleted` };
}

/** Updates project metadata (e.g. description) in projects meta file. */
export async function handleUpdate(params: Record<string, any>) {
    const { name, description } = params;
    if (!name) return { error: 'name is required' };

    const meta = readProjectsMeta();
    if (!meta.projects[name]) {
        return { error: `Project "${name}" not found` };
    }

    if (description !== undefined) meta.projects[name].description = description;
    // NOTE: path-based auto-switching (ensure) was removed — paths are no longer used.
    writeProjectsMeta(meta);

    return { success: true, name };
}

/** Returns current project without switching; use load to switch (path-based auto-switch was removed). */
export async function handleEnsure(_params: Record<string, any>) {
    // REMOVED: Path-based auto-switching was dangerous — concurrent MCP agents
    // calling ensure() could trigger simultaneous project switches, corrupting the DB.
    // Now just reports the current project without switching.
    const meta = readProjectsMeta();
    return {
        switched: false,
        project: meta.currentProject,
        message: `Current project: "${meta.currentProject || 'none'}". Use action: "load" to switch projects explicitly.`,
    };
}
