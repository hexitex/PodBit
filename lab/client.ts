/**
 * Lab HTTP Client
 *
 * The lab framework's ONLY execution mechanism — a generic HTTP client
 * that talks to any lab server via the uniform 3-endpoint contract:
 *   POST /submit  → start a job
 *   GET  /status  → check progress
 *   GET  /result  → fetch results
 *
 * All labs are separate servers (local or remote). This client handles
 * auth injection, URL templating, timeouts, and error classification.
 *
 * @module lab/client
 */

import type { LabTemplate, LabSubmitRequest, LabSubmitResponse, LabStatusResponse, LabResultResponse, ExecutionConfig, LabRegistryEntry, LabCapabilities } from './types.js';

// =============================================================================
// URL BUILDING
// =============================================================================

function buildUrl(base: string, path: string, vars?: Record<string, string>): string {
    let url = base.replace(/\/+$/, '') + path;
    if (vars) {
        for (const [key, val] of Object.entries(vars)) {
            url = url.replace(`{${key}}`, encodeURIComponent(val));
        }
    }
    return url;
}

// =============================================================================
// AUTH INJECTION
// =============================================================================

async function buildHeaders(exec: ExecutionConfig): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...exec.headers,
    };

    if (exec.authType && exec.authType !== 'none' && exec.authKey) {
        // Look up auth credential from settings table
        let credential: string | null = null;
        try {
            const { queryOne } = await import('../db/sqlite-backend.js');
            const row = await queryOne(
                "SELECT value FROM settings WHERE key = $1",
                [exec.authKey]
            ) as { value: string } | null;
            credential = row?.value ?? null;
        } catch { /* settings lookup failed */ }

        if (credential) {
            const headerName = exec.authHeader || 'Authorization';
            switch (exec.authType) {
                case 'bearer':
                    headers[headerName] = `Bearer ${credential}`;
                    break;
                case 'api_key':
                    headers[headerName] = credential;
                    break;
                case 'header':
                    headers[headerName] = credential;
                    break;
            }
        }
    }

    return headers;
}

// =============================================================================
// HTTP HELPERS
// =============================================================================

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Submit an experiment to a lab server.
 * Returns the server-assigned job ID plus enriched queue info.
 */
export async function submitExperiment(
    template: LabTemplate,
    payload: LabSubmitRequest,
    options?: { signal?: AbortSignal },
): Promise<LabSubmitResponse> {
    const exec = template.executionConfig;
    const url = buildUrl(exec.url, exec.submitEndpoint || '/submit');
    const headers = await buildHeaders(exec);
    const method = exec.method || 'POST';
    const timeoutMs = exec.timeoutMs || 120_000;

    const response = await fetchWithTimeout(url, {
        method,
        headers,
        body: JSON.stringify(payload),
    }, timeoutMs);

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        // 429 = lab queue full. Wait for a slot to open rather than failing.
        // The caller's abort signal (from freezeTimeoutMs) bounds how long we wait.
        if (response.status === 429) {
            const signal = options?.signal;
            const retryAfter = parseInt(response.headers.get('retry-after') || '', 10);
            const pollMs = (retryAfter > 0 ? retryAfter * 1000 : 15_000);
            console.error(`[lab-client] Lab queue full - polling every ${Math.round(pollMs / 1000)}s until a slot opens`);

            while (true) {
                if (signal?.aborted) throw new Error('Lab submit aborted while waiting for queue slot');
                await new Promise(r => setTimeout(r, pollMs));
                const retry = await fetchWithTimeout(url, { method, headers, body: JSON.stringify(payload) }, timeoutMs);
                if (retry.ok) {
                    const body = await retry.json() as any;
                    const idField = exec.responseIdField || 'jobId';
                    const jobId = getNestedField(body, idField);
                    if (jobId == null || jobId === '') throw new Error(`Lab submit response missing "${idField}" field`);
                    return { jobId: String(jobId), accepted: body.accepted ?? true, queuePosition: body.queuePosition, estimatedCompletionMs: body.estimatedCompletionMs, resourceLock: body.resourceLock ?? false };
                }
                if (retry.status !== 429) {
                    const retryText = await retry.text().catch(() => '');
                    const err = new Error(`Lab submit failed (${retry.status}): ${retryText.slice(0, 500)}`);
                    (err as any).labRejected = retry.status === 400;
                    (err as any).statusCode = retry.status;
                    throw err;
                }
                // Still 429 - keep waiting
            }
        }
        const err = new Error(`Lab submit failed (${response.status}): ${text.slice(0, 500)}`);
        // Tag rejection errors so callers can try a different lab
        (err as any).labRejected = response.status === 400;
        (err as any).statusCode = response.status;
        throw err;
    }

    const body = await response.json() as any;
    const idField = exec.responseIdField || 'jobId';
    const jobId = getNestedField(body, idField);

    if (jobId == null || jobId === '') {
        throw new Error(`Lab submit response missing "${idField}" field`);
    }

    return {
        jobId: String(jobId),
        accepted: body.accepted ?? true,
        queuePosition: body.queuePosition ?? undefined,
        estimatedCompletionMs: body.estimatedCompletionMs ?? undefined,
        resourceLock: body.resourceLock ?? false,
    };
}

/**
 * Check the status of a running experiment.
 */
export async function checkStatus(
    template: LabTemplate,
    jobId: string,
): Promise<LabStatusResponse> {
    const exec = template.executionConfig;
    const path = (exec.statusEndpoint || '/status/{jobId}');
    const url = buildUrl(exec.url, path, { jobId });
    const headers = await buildHeaders(exec);
    const timeoutMs = exec.timeoutMs || 30_000;

    const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers,
    }, timeoutMs);

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Lab status check failed (${response.status}): ${text.slice(0, 500)}`);
    }

    const body = await response.json() as any;
    const poll = template.pollConfig;
    const statusField = poll?.statusField || 'status';
    const status = getNestedField(body, statusField);

    return {
        status: normalizeStatus(status, poll?.completionValues, poll?.failureValues),
        progress: body.progress ?? undefined,
        message: body.message ?? undefined,
        queuePosition: body.queuePosition ?? undefined,
        estimatedCompletionMs: body.estimatedCompletionMs ?? undefined,
        startedAt: body.startedAt ?? undefined,
        artifacts: body.artifacts ?? undefined,
        resourceState: body.resourceState ?? undefined,
    };
}

/**
 * Fetch the full results of a completed experiment.
 */
export async function fetchResult(
    template: LabTemplate,
    jobId: string,
): Promise<LabResultResponse> {
    const exec = template.executionConfig;
    const path = (exec.resultEndpoint || '/result/{jobId}');
    const url = buildUrl(exec.url, path, { jobId });
    const headers = await buildHeaders(exec);
    const timeoutMs = exec.timeoutMs || 60_000;

    const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers,
    }, timeoutMs);

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Lab result fetch failed (${response.status}): ${text.slice(0, 500)}`);
    }

    return await response.json() as LabResultResponse;
}

/**
 * Check if a lab server is reachable (GET /).
 */
export async function ping(baseUrl: string, timeoutMs: number = 5000): Promise<boolean> {
    try {
        const response = await fetchWithTimeout(baseUrl, { method: 'GET' }, timeoutMs);
        return response.ok;
    } catch {
        return false;
    }
}

// =============================================================================
// CAPABILITIES + ARTIFACT ZIP
// =============================================================================

/**
 * Fetch a lab server's capabilities via GET /capabilities.
 */
export async function fetchCapabilities(
    baseUrl: string,
    authHeaders?: Record<string, string>,
    timeoutMs: number = 10_000,
): Promise<LabCapabilities> {
    const url = buildUrl(baseUrl, '/capabilities');
    const headers: Record<string, string> = { ...authHeaders };

    const response = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs);
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Capabilities fetch failed (${response.status}): ${text.slice(0, 500)}`);
    }

    return await response.json() as LabCapabilities;
}

/**
 * Download all artifacts for a job as a zip archive.
 * Returns the raw zip buffer.
 */
export async function fetchArtifactZip(
    baseUrl: string,
    jobId: string,
    authHeaders?: Record<string, string>,
    timeoutMs: number = 120_000,
): Promise<Buffer> {
    const url = buildUrl(baseUrl, `/artifacts/${jobId}`);
    const headers: Record<string, string> = { ...authHeaders };

    const response = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs);
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Artifact zip download failed (${response.status}): ${text.slice(0, 500)}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

/**
 * Build auth headers from a LabRegistryEntry.
 */
export function buildAuthHeadersFromRegistry(lab: LabRegistryEntry): Record<string, string> {
    const headers: Record<string, string> = {};

    if (lab.authType === 'none' || !lab.authCredential) return headers;

    const headerName = lab.authHeader || 'Authorization';
    switch (lab.authType) {
        case 'bearer':
            headers[headerName] = `Bearer ${lab.authCredential}`;
            break;
        case 'api_key':
        case 'header':
            headers[headerName] = lab.authCredential;
            break;
    }

    return headers;
}

/**
 * List jobs from a lab server. Used for recovering orphaned completed results.
 */
export async function listLabJobs(
    baseUrl: string,
    status: string = 'completed',
    authHeaders?: Record<string, string>,
    limit: number = 200,
    timeoutMs: number = 15_000,
): Promise<Array<{ id: string; status: string; spec?: any; verdict?: string; confidence?: number; created_at?: string; completed_at?: string }>> {
    const url = buildUrl(baseUrl, `/jobs?status=${encodeURIComponent(status)}&limit=${limit}`);
    const headers: Record<string, string> = { ...authHeaders };

    try {
        const response = await fetchWithTimeout(url, { method: 'GET', headers }, timeoutMs);
        if (!response.ok) return [];
        const body = await response.json() as any;
        return Array.isArray(body) ? body : (body.jobs || []);
    } catch {
        return [];
    }
}

// =============================================================================
// HELPERS
// =============================================================================

/** Navigate a dotted path into a nested object (e.g., "data.state" → obj.data.state) */
function getNestedField(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

/** Normalize a status string to the LabStatusResponse union */
function normalizeStatus(
    raw: string,
    completionValues?: string[],
    failureValues?: string[],
): LabStatusResponse['status'] {
    const s = String(raw).toLowerCase();
    if (failureValues?.includes(s)) return 'failed';
    if (completionValues?.includes(s)) return 'completed';
    if (s === 'queued' || s === 'pending' || s === 'waiting') return 'queued';
    if (s === 'running' || s === 'processing' || s === 'executing') return 'running';
    if (s === 'completed' || s === 'done' || s === 'success' || s === 'finished') return 'completed';
    if (s === 'failed' || s === 'error' || s === 'timeout') return 'failed';
    return 'running'; // default: assume still running
}

// =============================================================================
// HIGH-LEVEL API — submit a test spec and get raw data
// =============================================================================

/**
 * Submit a test specification to a lab server and wait for raw results.
 *
 * Podbit sends an ExperimentSpec. The lab runs the experiment and returns raw data.
 * Podbit's evaluator interprets the data against spec criteria.
 * The lab never sees the original claim narrative.
 *
 * @param spec - Test specification with computations to perform
 * @param templateId - Lab template to use (default: 'math-lab')
 * @returns LabResultResponse with raw computed values
 */
/** Full result from a lab experiment — includes the jobId for traceability */
export interface LabExperimentResult {
    jobId: string;
    templateId: string;
    result: LabResultResponse;
    /** Whether the lab requested a resource lock */
    resourceLock: boolean;
}

export async function submitSpec(
    spec: import('./types.js').ExperimentSpec,
    templateId: string = 'math-lab',
    labInfo?: { labId: string; labName: string },
    options?: { resumeJobId?: string; onJobId?: (jobId: string, templateId?: string) => void; pollBudgetMs?: number; signal?: AbortSignal },
): Promise<LabExperimentResult> {
    const { getTemplate } = await import('./templates.js');
    const { getLab } = await import('./registry.js');

    // The registry is the authoritative URL source (overlays from PORTS via port_key).
    // Template-stored URLs may be stale and are ignored when a registry entry exists.
    let liveLab = labInfo?.labId ? await getLab(labInfo.labId) : null;
    if (!liveLab) liveLab = await getLab(templateId);

    let template = await getTemplate(templateId);

    if (!template && liveLab) {
        template = {
            id: liveLab.id,
            name: liveLab.name,
            description: liveLab.description,
            systemTemplate: false,
            executionConfig: { url: liveLab.url, authType: liveLab.authType, authKey: liveLab.authCredential || undefined, authHeader: liveLab.authHeader || undefined },
            triageConfig: null,
            pollConfig: { strategy: 'interval', pollIntervalMs: 2000, completionValues: ['completed', 'failed'], failureValues: ['failed'] },
            interpretConfig: null,
            outcomeConfig: { freezeOnStart: true, taintOnRefute: true },
            evidenceSchema: null,
            budgetConfig: null,
            createdAt: liveLab.createdAt,
            updatedAt: liveLab.updatedAt,
        };
    }

    if (!template) {
        throw new Error(`Lab template "${templateId}" not found and no lab registry fallback available`);
    }

    if (liveLab) {
        template = {
            ...template,
            executionConfig: {
                ...template.executionConfig,
                url: liveLab.url,
                authType: liveLab.authType,
                authKey: liveLab.authCredential || template.executionConfig.authKey,
                authHeader: liveLab.authHeader || template.executionConfig.authHeader,
            },
        };
    }

    let jobId: string;
    let hasResourceLock = false;

    if (options?.resumeJobId) {
        // Resume polling an existing job (recovery after restart)
        jobId = options.resumeJobId;
        console.error(`[lab-client] Resuming poll for existing job ${jobId}`);
    } else {
        // Submit spec to lab
        const submitResponse = await submitExperiment(template, { spec }, { signal: options?.signal });
        jobId = submitResponse.jobId;
        hasResourceLock = submitResponse.resourceLock ?? false;

        // Notify caller of the jobId (and templateId for recovery) before polling starts
        if (options?.onJobId) options.onJobId(jobId, templateId);
    }

    // Acquire resource lock if lab requested it
    if (hasResourceLock && labInfo) {
        const { acquireResourceLock } = await import('./resource-lock.js');
        const { config } = await import('../config.js');
        acquireResourceLock(labInfo.labId, labInfo.labName, jobId, config.lab.freezeTimeoutMs);
    }

    // Poll until done. The poll loop must fit inside the caller's wall-clock budget
    // (freezeTimeoutMs from the queue worker). If no budget is provided, derive from
    // config.lab.freezeTimeoutMs so the poll timeout is never shorter than the freeze window.
    const poll = template.pollConfig;
    const intervalMs = poll.pollIntervalMs || 2000;
    const POLL_BUFFER_MS = 30_000; // 30s buffer for spec extraction + result fetch overhead
    const budgetMs = options?.pollBudgetMs;
    let maxPollAttempts: number;
    if (budgetMs) {
        maxPollAttempts = Math.max(10, Math.floor((budgetMs - POLL_BUFFER_MS) / intervalMs));
    } else {
        // No explicit budget - derive from config so the timeout stays in sync
        const { config: cfg } = await import('../config.js');
        const fallbackBudgetMs = cfg.lab?.freezeTimeoutMs ?? 600_000;
        maxPollAttempts = Math.max(10, Math.floor((fallbackBudgetMs - POLL_BUFFER_MS) / intervalMs));
    }
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    let pollCount = 0;

    const signal = options?.signal;

    try {
        while (pollCount < maxPollAttempts) {
            pollCount++;

            // Abortable sleep - wakes immediately when signal fires (freeze timeout)
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, intervalMs);
                if (signal) {
                    const onAbort = () => { clearTimeout(timer); resolve(); };
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });

            // Check status BEFORE checking abort. If the lab already finished,
            // return the result even if the freeze timeout fired - don't throw
            // away a completed result just because the budget expired.
            let status;
            try {
                status = await checkStatus(template, jobId);
                consecutiveErrors = 0;
            } catch (pollErr: any) {
                // If aborted AND the lab is unreachable, give up
                if (signal?.aborted) throw new Error(`Verification aborted during lab polling for job ${jobId}`);
                // 404 = job was deleted from the lab. Fail immediately, don't retry.
                if (pollErr.message?.includes('404')) {
                    throw new Error(`Lab job ${jobId} not found (deleted?) - ${pollErr.message}`);
                }
                consecutiveErrors++;
                if (consecutiveErrors >= maxConsecutiveErrors) {
                    throw new Error(`Lab unreachable during polling (${maxConsecutiveErrors} consecutive failures): ${pollErr.message}`);
                }
                continue;
            }

            if (status.status === 'completed' || status.status === 'failed') {
                const result = await fetchResult(template, jobId);
                return { jobId, templateId, result, resourceLock: hasResourceLock };
            }

            // Only abort AFTER confirming the job isn't done yet
            if (signal?.aborted) throw new Error(`Verification aborted during lab polling for job ${jobId}`);
        }
        // Max attempts reached - one final status check before giving up
        try {
            const finalStatus = await checkStatus(template, jobId);
            if (finalStatus.status === 'completed' || finalStatus.status === 'failed') {
                const result = await fetchResult(template, jobId);
                return { jobId, templateId, result, resourceLock: hasResourceLock };
            }
        } catch { /* lab unreachable - fall through to throw */ }
        throw new Error(`Lab polling exceeded ${maxPollAttempts} attempts (${Math.round(maxPollAttempts * intervalMs / 1000)}s) for job ${jobId}`);
    } finally {
        // Always release resource lock when polling ends (success, failure, or timeout)
        if (hasResourceLock) {
            const { releaseResourceLock } = await import('./resource-lock.js');
            releaseResourceLock('job_finished');
        }
    }
}
