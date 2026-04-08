/**
 * Lab Health Checker
 *
 * Background service that periodically pings registered lab servers,
 * fetches their capabilities, and updates the lab_registry health status.
 *
 * @module lab/health
 */

import { listLabs, getLab, updateLabHealth } from './registry.js';
import { ping, fetchCapabilities, buildAuthHeadersFromRegistry } from './client.js';
import { emitActivity } from '../services/event-bus.js';
import type { LabRegistryEntry } from './types.js';

import type { LabCapabilities } from './types.js';

let healthInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Build a context prompt from lab capabilities for the spec extractor.
 * This is the seed value — users can edit it in the GUI.
 */
function buildContextPromptFromCapabilities(labName: string, caps: LabCapabilities): string | null {
    if (!caps.specTypes) return null;

    const lines: string[] = [];
    lines.push(`# ${labName}`);
    if (caps.description) lines.push(caps.description);
    lines.push('');
    lines.push('## Experiment Types (use the exact specType key in your response)');

    if (!Array.isArray(caps.specTypes)) {
        for (const [name, desc] of Object.entries(caps.specTypes)) {
            lines.push(`### specType: "${name}"`);
            lines.push(desc);
            lines.push('');
        }
    } else {
        for (const name of caps.specTypes) {
            lines.push(`- specType: "${name}"`);
        }
    }

    return lines.join('\n');
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Start periodic health checking for all enabled labs.
 */
export function startLabHealthChecker(intervalMs: number = 60_000): void {
    if (healthInterval) return;

    // Run immediately, then on interval
    checkAllLabHealth().catch(err =>
        console.error(`[lab-health] Initial check failed: ${err.message}`)
    );

    healthInterval = setInterval(() => {
        checkAllLabHealth().catch(err =>
            console.error(`[lab-health] Periodic check failed: ${err.message}`)
        );
    }, intervalMs);

    console.error(`[lab-health] Started health checker (interval: ${intervalMs}ms)`);
}

/**
 * Stop the health checker.
 */
export function stopLabHealthChecker(): void {
    if (healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
        console.error('[lab-health] Stopped health checker');
    }
}

/**
 * Check health of all enabled labs.
 */
export async function checkAllLabHealth(): Promise<void> {
    const labs = await listLabs({ enabled: true });
    await Promise.allSettled(labs.map(lab => checkSingleLab(lab.id)));
}

/**
 * Check a single lab's health and update registry.
 *
 * 1. Ping GET /health
 * 2. If reachable, fetch GET /capabilities
 * 3. Update registry with health status, queue depth, and capabilities
 */
export async function checkSingleLab(labId: string): Promise<{ status: string; message: string; queueDepth: number }> {
    const lab = await getLab(labId);
    if (!lab) throw new Error(`Lab ${labId} not found`);

    const authHeaders = buildAuthHeadersFromRegistry(lab);

    // Step 1: Ping health endpoint
    const reachable = await ping(lab.url + '/health', 5000);

    if (!reachable) {
        const result = { status: 'offline', message: 'Health endpoint unreachable', queueDepth: lab.queueDepth };
        await updateLabHealth(labId, 'offline', result.message);

        // Release resource lock if this lab held it
        const { onLabOffline } = await import('./resource-lock.js');
        onLabOffline(labId);

        if (lab.healthStatus !== 'offline') {
            emitActivity('lab', 'health_offline', `Lab "${lab.name}" is offline`, { labId, labName: lab.name });
        }

        return result;
    }

    // Step 2: Fetch capabilities (includes queue depth)
    try {
        const capabilities = await fetchCapabilities(lab.url, authHeaders, 10_000);

        // Fetch queue depth from health endpoint
        let queueDepth = 0;
        try {
            const healthResponse = await fetch(lab.url + '/health', {
                headers: authHeaders,
                signal: AbortSignal.timeout(5000),
            });
            if (healthResponse.ok) {
                const healthData = await healthResponse.json() as any;
                queueDepth = healthData.queueDepth ?? 0;
            }
        } catch { /* non-fatal */ }

        await updateLabHealth(labId, 'ok', 'Healthy', queueDepth, capabilities);

        // Keep context prompt in sync with lab capabilities.
        // Even if user-edited, regenerate when specType keys changed —
        // stale specType names in the prompt break routing.
        if (capabilities) {
            const prompt = buildContextPromptFromCapabilities(lab.name, capabilities);
            if (prompt) {
                let shouldUpdate = !lab.contextPromptEdited;

                // Check if edited prompt references specType names that no longer exist
                if (!shouldUpdate && lab.contextPrompt && capabilities.specTypes) {
                    const currentKeys = Array.isArray(capabilities.specTypes)
                        ? capabilities.specTypes
                        : Object.keys(capabilities.specTypes);
                    const promptMentionsAllKeys = currentKeys.every(k => lab.contextPrompt!.includes(k));
                    if (!promptMentionsAllKeys) {
                        shouldUpdate = true;
                        console.error(`[lab-health] Context prompt for "${lab.name}" has stale specType names — regenerating`);
                    }
                }

                if (shouldUpdate) {
                    const { updateLab } = await import('./registry.js');
                    await updateLab(labId, { contextPrompt: prompt } as any);
                    // Reset edited flag so future health checks keep it in sync
                    const { systemQuery } = await import('../db/sqlite-backend.js');
                    await systemQuery('UPDATE lab_registry SET context_prompt_edited = 0 WHERE id = $1', [labId]);
                }
            }
        }

        if (lab.healthStatus === 'offline' || lab.healthStatus === 'degraded') {
            emitActivity('lab', 'health_ok', `Lab "${lab.name}" is back online`, { labId, labName: lab.name, queueDepth });
        }

        return { status: 'ok', message: 'Healthy', queueDepth };
    } catch (err: any) {
        // Reachable but capabilities failed — degraded
        await updateLabHealth(labId, 'degraded', `Capabilities failed: ${err.message}`);

        if (lab.healthStatus !== 'degraded') {
            emitActivity('lab', 'health_degraded', `Lab "${lab.name}" is degraded: ${err.message}`, { labId, labName: lab.name });
        }

        return { status: 'degraded', message: err.message, queueDepth: lab.queueDepth };
    }
}
