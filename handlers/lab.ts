/**
 * MCP Handler — Lab Registry
 *
 * Action-based dispatch for lab server registration, health checking,
 * and capability management.
 *
 * @module handlers/lab
 */

export async function handleLab(params: Record<string, any>): Promise<Record<string, any>> {
    const action = params.action;

    switch (action) {
        case 'list': return handleList(params);
        case 'get': return handleGet(params);
        case 'register': return handleRegister(params);
        case 'update': return handleUpdate(params);
        case 'remove': return handleRemove(params);
        case 'enable': return handleEnable(params);
        case 'disable': return handleDisable(params);
        case 'health': return handleHealth(params);
        case 'capabilities': return handleCapabilities(params);
        default:
            return { error: `Unknown lab action: ${action}. Valid: list, get, register, update, remove, enable, disable, health, capabilities` };
    }
}

async function handleList(_params: Record<string, any>) {
    const { listLabs } = await import('../lab/registry.js');
    const labs = await listLabs();
    return { labs, count: labs.length };
}

async function handleGet(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };
    const { getLab } = await import('../lab/registry.js');
    const lab = await getLab(params.id);
    if (!lab) return { error: `Lab "${params.id}" not found` };
    return { lab };
}

async function handleRegister(params: Record<string, any>) {
    if (!params.name) return { error: 'name is required' };
    if (!params.url) return { error: 'url is required' };

    const { createLab } = await import('../lab/registry.js');
    const lab = await createLab({
        name: params.name,
        url: params.url,
        description: params.description,
        authType: params.authType,
        authCredential: params.authCredential,
        authHeader: params.authHeader,
        specTypes: params.specTypes,
        queueLimit: params.queueLimit,
        artifactTtlSeconds: params.artifactTtlSeconds,
        priority: params.priority,
        tags: params.tags,
        templateId: params.templateId,
        uiUrl: params.uiUrl,
    });

    // Create subsystem for local labs (localhost/127.0.0.1) so they can route LLM calls through Podbit
    const subsystemCreated = await ensureLabSubsystem(lab.id, lab.name, params.url);

    return { lab, message: `Lab "${lab.name}" registered`, subsystem: subsystemCreated ? `lab:${lab.id}` : null };
}

async function handleUpdate(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };

    const { updateLab, getLab } = await import('../lab/registry.js');
    const existing = await getLab(params.id);
    if (!existing) return { error: `Lab "${params.id}" not found` };

    const changes: Record<string, any> = {};
    for (const key of ['name', 'description', 'url', 'authType', 'authCredential', 'authHeader', 'specTypes', 'queueLimit', 'artifactTtlSeconds', 'priority', 'tags', 'templateId', 'enabled', 'uiUrl']) {
        if (params[key] !== undefined) changes[key] = params[key];
    }

    await updateLab(params.id, changes);
    const lab = await getLab(params.id);
    return { lab, message: `Lab "${params.id}" updated` };
}

async function handleRemove(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };

    const { deleteLab } = await import('../lab/registry.js');
    const deleted = await deleteLab(params.id);
    if (!deleted) return { error: `Lab "${params.id}" not found` };

    // Clean up the lab's subsystem assignment
    await removeLabSubsystem(params.id);

    return { message: `Lab "${params.id}" removed` };
}

async function handleEnable(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };
    const { enableLab } = await import('../lab/registry.js');
    await enableLab(params.id);
    return { message: `Lab "${params.id}" enabled` };
}

async function handleDisable(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };
    const { disableLab } = await import('../lab/registry.js');
    await disableLab(params.id);
    return { message: `Lab "${params.id}" disabled` };
}

async function handleHealth(params: Record<string, any>) {
    if (!params.id) {
        // Check all labs
        const { checkAllLabHealth } = await import('../lab/health.js');
        await checkAllLabHealth();
        const { listLabs } = await import('../lab/registry.js');
        const labs = await listLabs();
        return { labs: labs.map(l => ({ id: l.id, name: l.name, healthStatus: l.healthStatus, queueDepth: l.queueDepth })) };
    }

    const { checkSingleLab } = await import('../lab/health.js');
    const result = await checkSingleLab(params.id);
    return result;
}

async function handleCapabilities(params: Record<string, any>) {
    if (!params.id) return { error: 'id is required' };

    const { getLab } = await import('../lab/registry.js');
    const lab = await getLab(params.id);
    if (!lab) return { error: `Lab "${params.id}" not found` };

    const { fetchCapabilities, buildAuthHeadersFromRegistry } = await import('../lab/client.js');
    const authHeaders = buildAuthHeadersFromRegistry(lab);

    try {
        const capabilities = await fetchCapabilities(lab.url, authHeaders);
        return { labId: params.id, capabilities };
    } catch (err: any) {
        return { error: `Failed to fetch capabilities: ${err.message}` };
    }
}

// =============================================================================
// LAB SUBSYSTEM LIFECYCLE
// =============================================================================

/** Check if a lab URL points to the local machine */
function isLocalLab(url: string): boolean {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
    } catch { return false; }
}

/**
 * Create a subsystem assignment row for a local lab so it can route LLM calls through Podbit.
 * No-op for remote labs or if the subsystem already exists.
 * @returns true if a subsystem was created
 */
async function ensureLabSubsystem(labId: string, labName: string, url: string): Promise<boolean> {
    if (!isLocalLab(url)) return false;

    const subsystem = `lab:${labId}`;
    try {
        const { systemQuery } = await import('../db/sqlite-backend.js');
        // Check if already exists
        const existing = await systemQuery(
            'SELECT subsystem FROM subsystem_assignments WHERE subsystem = $1', [subsystem],
        );
        if ((existing as any[]).length > 0) return false;

        // Create unassigned subsystem row — user assigns a model via the Models page
        await systemQuery(
            `INSERT INTO subsystem_assignments (subsystem, model_id, updated_at) VALUES ($1, NULL, datetime('now'))`,
            [subsystem],
        );

        // Reload cache so the new subsystem appears immediately
        const { loadAssignmentCache } = await import('../models/assignments.js');
        await loadAssignmentCache();

        console.error(`[lab] Created subsystem "${subsystem}" for local lab "${labName}"`);
        return true;
    } catch (err: any) {
        console.error(`[lab] Failed to create subsystem for lab "${labId}": ${err.message}`);
        return false;
    }
}

/**
 * Remove a lab's subsystem assignment when the lab is deleted.
 */
async function removeLabSubsystem(labId: string): Promise<void> {
    const subsystem = `lab:${labId}`;
    try {
        const { systemQuery } = await import('../db/sqlite-backend.js');
        await systemQuery('DELETE FROM subsystem_assignments WHERE subsystem = $1', [subsystem]);

        // Also clean up any project-level override
        try {
            const { query: projectQuery } = await import('../core.js');
            await projectQuery('DELETE FROM project_assignments WHERE subsystem = $1', [subsystem]);
        } catch { /* project_assignments may not exist */ }

        const { loadAssignmentCache } = await import('../models/assignments.js');
        await loadAssignmentCache();

        console.error(`[lab] Removed subsystem "${subsystem}"`);
    } catch (err: any) {
        console.error(`[lab] Failed to remove subsystem for lab "${labId}": ${err.message}`);
    }
}
