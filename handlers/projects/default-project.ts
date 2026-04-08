import fs from 'fs';
import path from 'path';
import { createEmptyProject, getProjectDir } from '../../db.js';
import { readProjectsMeta, writeProjectsMeta, resetAbortController, setProjectSwitching } from './meta.js';
import { bootstrapProject } from './bootstrap.js';
import { clearAllCaches } from './services.js';

// =============================================================================
// DEFAULT PROJECT — AUTO-CREATED ON FIRST STARTUP
// =============================================================================

const DEFAULT_PROJECT = {
    name: 'default',
    description: 'Starter project — rename or replace anytime',
    purpose: 'General-purpose knowledge workspace',
    domains: ['ideas', 'questions'],
    bridges: [['ideas', 'questions']] as string[][],
    autoBridge: true,
    goals: ['Explore and synthesize knowledge'],
};

/**
 * If no projects exist, create the default project so first-time users
 * land on a structurally ready graph instead of an empty state.
 *
 * Lightweight path — no background service stops (nothing running yet),
 * no auto-save (nothing to save), no backup, no LLM calls.
 * Returns true if a default project was created.
 */
export async function ensureDefaultProject(): Promise<boolean> {
    const meta = readProjectsMeta();

    // Already have projects — nothing to do
    if (meta.currentProject && Object.keys(meta.projects).length > 0) {
        return false;
    }

    const { name, description, purpose, domains, bridges, autoBridge, goals } = DEFAULT_PROJECT;
    const pDir = getProjectDir();
    const dbPath = path.join(pDir, `${name}.db`);

    // Project DB already exists on disk (meta was just lost) — don't overwrite
    if (fs.existsSync(dbPath)) {
        // Just restore the meta pointer
        meta.currentProject = name;
        meta.projects[name] = {
            created: new Date().toISOString(),
            lastSaved: new Date().toISOString(),
            description,
            nodeCount: 0,
            domains,
            purpose,
            goals,
            autoBridge,
        };
        writeProjectsMeta(meta);
        console.error(`[default-project] Restored meta for existing "${name}" project DB`);
        return true;
    }

    // Create the project DB and switch to it
    await createEmptyProject(dbPath);
    await clearAllCaches();
    resetAbortController();
    setProjectSwitching(false);

    // Write metadata
    meta.currentProject = name;
    meta.projects[name] = {
        created: new Date().toISOString(),
        lastSaved: new Date().toISOString(),
        description,
        nodeCount: 0,
        domains,
        purpose,
        goals,
        autoBridge,
    };
    writeProjectsMeta(meta);

    // Bootstrap partitions and bridges (no LLM seed generation — purpose not passed)
    const result = await bootstrapProject({
        domains,
        bridges,
        goals,
        autoBridge,
        name,
        // purpose intentionally omitted — skips generateBootstrapSeeds()
    });

    // Store purpose in DB settings manually (so project manifest is complete)
    try {
        const { query } = await import('../../db.js');
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.purpose', $1)`, [purpose]);
    } catch { /* non-fatal */ }

    console.error(`[default-project] Created "${name}" project: ${result.partitions} partition(s), ${result.bridges} bridge(s)`);
    return true;
}
