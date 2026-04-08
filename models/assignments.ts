/**
 * Subsystem assignments, concurrency control, and the main callSubsystemModel function.
 *
 * Each subsystem (synthesis, voice, embedding, etc.) can be assigned a model from the registry.
 * This module manages the assignment cache (loaded from DB), rate-limit handling with
 * retry logic, consultant model escalation, and the primary callSubsystemModel() entry point.
 * @module models/assignments
 */
import { config as appConfig } from '../config.js';
import { systemQuery, query as projectQuery } from '../db.js';
import { RC } from '../config/constants.js';
import { emitActivity } from '../services/event-bus.js';
import { getPrompt } from '../prompts.js';
import { logDecision } from '../core/governance.js';
import type { Subsystem, RegisteredModel, ModelEntry, CallOptions } from './types.js';
import { VALID_SUBSYSTEMS, isValidSubsystem, normalizeProvider, getModelProvider } from './types.js';
import { callSingleModel } from './providers.js';
import { applyReasoningBonus, logUsage } from './cost.js';
import { isBudgetExceeded } from './budget.js';
import { getProjectAbortSignal } from '../handlers/projects.js';
import { acquireModelSlot, reportRateLimit } from './semaphore.js';

// Re-export for consumers that import from assignments or models/index
export { acquireModelSlot, reportRateLimit } from './semaphore.js';

// =============================================================================
// RATE LIMIT HELPERS
// =============================================================================

/**
 * Returns true when an error looks like a provider rate-limit response (HTTP 429).
 * Matches patterns from OpenAI, Anthropic, Groq, and generic providers.
 */
function isRateLimitError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit') || msg.includes('too many requests');
}

/**
 * Parse the wait duration (ms) from a rate-limit error message.
 * Handles patterns like:
 *   "Please try again in 1m26.4s."
 *   "try again in 30s"
 *   "retry after 120 seconds"
 *   "Retry-After: 60"
 * Returns null when no parseable time is found.
 */
function parseRateLimitWaitMs(message: string): number | null {
    // "Xm Y.Ys" or "XmYs" — e.g. "1m26.4s", "2m0s"
    const minsSecsMatch = message.match(/(\d+)m\s*(\d+(?:\.\d+)?)s/i);
    if (minsSecsMatch) {
        const mins = parseFloat(minsSecsMatch[1]);
        const secs = parseFloat(minsSecsMatch[2]);
        return Math.ceil((mins * 60 + secs) * 1000);
    }
    // Minutes only — "Xm"
    const minsOnlyMatch = message.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
    if (minsOnlyMatch) {
        return Math.ceil(parseFloat(minsOnlyMatch[1]) * 60 * 1000);
    }
    // Seconds only — "Xs", "X seconds", "retry after X"
    const secsMatch = message.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
    if (secsMatch) {
        return Math.ceil(parseFloat(secsMatch[1]) * 1000);
    }
    return null;
}

// =============================================================================
// ASSIGNMENT CACHE
// =============================================================================

// In-memory cache for fast lookups in callSubsystemModel
const assignmentCache: Map<Subsystem, RegisteredModel | null> = new Map();
const consultantCache: Map<Subsystem, RegisteredModel | null> = new Map();
const noThinkOverrideCache: Map<Subsystem, boolean | null> = new Map();
const thinkingLevelCache: Map<Subsystem, string | null> = new Map();
/** Tracks which subsystems have project-level overrides (vs inherited from system baseline). */
const projectOverrideSet: Set<Subsystem> = new Set();
let assignmentCacheLoaded = false;

// Common SELECT columns for the assignment JOIN query (system and project)
const ASSIGNMENT_SELECT = `sa.subsystem, sa.model_id, sa.consultant_model_id,
                sa.no_think as sa_no_think, sa.thinking_level as sa_thinking_level,
                mr.id as mr_id, mr.name, mr.provider, mr.model_id as mr_model_id,
                mr.tier, mr.endpoint_url, mr.api_key, mr.enabled, mr.max_tokens, mr.context_size, mr.cost_per_1k, mr.sort_order,
                mr.max_retries, mr.retry_window_minutes, mr.max_concurrency, mr.request_pause_ms, mr.request_timeout, mr.rate_limit_backoff_ms, mr.supports_tools, mr.no_think,
                mr.input_cost_per_mtok, mr.output_cost_per_mtok, mr.tool_cost_per_mtok,
                cr.id as cr_id, cr.name as cr_name, cr.provider as cr_provider, cr.model_id as cr_model_id,
                cr.tier as cr_tier, cr.endpoint_url as cr_endpoint_url, cr.api_key as cr_api_key, cr.enabled as cr_enabled,
                cr.max_tokens as cr_max_tokens, cr.context_size as cr_context_size, cr.cost_per_1k as cr_cost_per_1k,
                cr.sort_order as cr_sort_order, cr.max_retries as cr_max_retries, cr.retry_window_minutes as cr_retry_window_minutes,
                cr.max_concurrency as cr_max_concurrency, cr.request_pause_ms as cr_request_pause_ms, cr.request_timeout as cr_request_timeout, cr.rate_limit_backoff_ms as cr_rate_limit_backoff_ms, cr.supports_tools as cr_supports_tools, cr.no_think as cr_no_think,
                cr.input_cost_per_mtok as cr_input_cost_per_mtok, cr.output_cost_per_mtok as cr_output_cost_per_mtok,
                cr.tool_cost_per_mtok as cr_tool_cost_per_mtok`;

/** Build a RegisteredModel from a joined row (primary model columns). */
function buildPrimaryModel(row: any, saNoThink: boolean | null, saThinkingLevel: string | null): RegisteredModel | null {
    if (!row.mr_id || !row.name) return null;

    let effectiveThinkingLevel: string | null;
    if (saThinkingLevel) {
        effectiveThinkingLevel = saThinkingLevel;
    } else if (saNoThink !== null) {
        effectiveThinkingLevel = saNoThink ? 'off' : null;
    } else {
        effectiveThinkingLevel = row.no_think ? 'off' : null;
    }
    const effectiveNoThink = effectiveThinkingLevel === 'off';

    return {
        id: row.mr_id,
        name: row.name,
        provider: normalizeProvider(row.provider),
        modelId: row.mr_model_id,
        tier: row.tier || 'medium',
        endpointUrl: row.endpoint_url || null,
        apiKey: row.api_key || null,
        enabled: !!row.enabled,
        maxTokens: row.max_tokens ?? null,
        contextSize: row.context_size ?? null,
        costPer1k: row.cost_per_1k ?? 0,
        inputCostPerMtok: row.input_cost_per_mtok ?? 0,
        outputCostPerMtok: row.output_cost_per_mtok ?? 0,
        toolCostPerMtok: row.tool_cost_per_mtok ?? 0,
        sortOrder: row.sort_order ?? 0,
        maxRetries: row.max_retries ?? 3,
        retryWindowMinutes: row.retry_window_minutes ?? 2,
        maxConcurrency: row.max_concurrency ?? 1,
        requestPauseMs: row.request_pause_ms ?? 0,
        requestTimeout: row.request_timeout ?? 180,
        rateLimitBackoffMs: row.rate_limit_backoff_ms ?? 120000,
        supportsTools: row.supports_tools === 1 ? true : row.supports_tools === 0 ? false : null,
        noThink: effectiveNoThink,
        thinkingLevel: effectiveThinkingLevel,
    };
}

/** Build a RegisteredModel from a joined row (consultant model columns). */
function buildConsultantModel(row: any): RegisteredModel | null {
    if (!row.cr_id || !row.cr_name) return null;
    return {
        id: row.cr_id,
        name: row.cr_name,
        provider: normalizeProvider(row.cr_provider),
        modelId: row.cr_model_id,
        tier: row.cr_tier || 'tier1',
        endpointUrl: row.cr_endpoint_url || null,
        apiKey: row.cr_api_key || null,
        enabled: !!row.cr_enabled,
        maxTokens: row.cr_max_tokens ?? null,
        contextSize: row.cr_context_size ?? null,
        costPer1k: row.cr_cost_per_1k ?? 0,
        inputCostPerMtok: row.cr_input_cost_per_mtok ?? 0,
        outputCostPerMtok: row.cr_output_cost_per_mtok ?? 0,
        toolCostPerMtok: row.cr_tool_cost_per_mtok ?? 0,
        sortOrder: row.cr_sort_order ?? 0,
        maxRetries: row.cr_max_retries ?? 3,
        retryWindowMinutes: row.cr_retry_window_minutes ?? 2,
        maxConcurrency: row.cr_max_concurrency ?? 1,
        requestPauseMs: row.cr_request_pause_ms ?? 0,
        requestTimeout: row.cr_request_timeout ?? 180,
        rateLimitBackoffMs: row.cr_rate_limit_backoff_ms ?? 120000,
        supportsTools: row.cr_supports_tools === 1 ? true : row.cr_supports_tools === 0 ? false : null,
        noThink: !!row.cr_no_think,
        thinkingLevel: row.cr_no_think ? 'off' : null,
    };
}

/**
 * Loads subsystem→model assignments from both system DB (baseline) and project DB
 * (overrides) into in-memory caches. Project overrides win over system defaults.
 *
 * Since model_registry lives in system.db and project_assignments lives in the project DB,
 * we can't JOIN across databases. Instead we:
 * 1. Load all enabled models from system DB into a lookup map
 * 2. Load system baseline assignments (with JOIN, same DB)
 * 3. Load project override rows (plain SELECT, no JOIN)
 * 4. Resolve project override model_ids against the model lookup map
 */
export async function loadAssignmentCache(): Promise<void> {
    // 1. Build model lookup from system DB (model_registry)
    const modelRows = await systemQuery(
        `SELECT id, name, provider, model_id, tier, endpoint_url, api_key, enabled,
                max_tokens, context_size, cost_per_1k, sort_order,
                max_retries, retry_window_minutes, max_concurrency, request_pause_ms,
                request_timeout, rate_limit_backoff_ms, supports_tools, no_think,
                input_cost_per_mtok, output_cost_per_mtok, tool_cost_per_mtok
         FROM model_registry WHERE enabled = 1`
    );
    const modelLookup = new Map<string, any>();
    for (const m of modelRows) modelLookup.set(m.id, m);

    // 2. Load system baseline assignments (same DB, can JOIN)
    const systemRows = await systemQuery(
        `SELECT ${ASSIGNMENT_SELECT}
         FROM subsystem_assignments sa
         LEFT JOIN model_registry mr ON sa.model_id = mr.id AND mr.enabled = 1
         LEFT JOIN model_registry cr ON sa.consultant_model_id = cr.id AND cr.enabled = 1`
    );

    // 3. Load project-level overrides (plain SELECT — no cross-DB JOIN)
    let projectRows: any[] = [];
    try {
        projectRows = await projectQuery(
            `SELECT subsystem, model_id, thinking_level, consultant_model_id FROM project_assignments`
        );
    } catch (err: any) {
        // project_assignments table may not exist yet (pre-migration DB)
        const msg = err?.message || '';
        if (!msg.includes('no such table')) {
            console.warn(`[assignments] Failed to load project overrides — using system baseline only: ${msg}`);
        }
    }

    // 4. Clear and initialize caches
    assignmentCache.clear();
    consultantCache.clear();
    noThinkOverrideCache.clear();
    thinkingLevelCache.clear();
    projectOverrideSet.clear();
    for (const sub of VALID_SUBSYSTEMS) {
        assignmentCache.set(sub, null);
        consultantCache.set(sub, null);
        noThinkOverrideCache.set(sub, null);
        thinkingLevelCache.set(sub, null);
    }

    // 5. Apply system baseline first
    for (const row of systemRows) {
        const saNoThink = row.sa_no_think != null ? !!row.sa_no_think : null;
        const saThinkingLevel = (row.sa_thinking_level as string | null) || null;
        noThinkOverrideCache.set(row.subsystem as Subsystem, saNoThink);
        thinkingLevelCache.set(row.subsystem as Subsystem, saThinkingLevel);

        const primary = buildPrimaryModel(row, saNoThink, saThinkingLevel);
        assignmentCache.set(row.subsystem as Subsystem, primary ?? null);

        const consultant = buildConsultantModel(row);
        consultantCache.set(row.subsystem as Subsystem, consultant ?? null);
    }

    // 6. Apply project overrides (wins over system baseline)
    //    Resolve model_ids against the model lookup map since we can't JOIN cross-DB
    for (const pRow of projectRows) {
        const sub = pRow.subsystem as Subsystem;
        projectOverrideSet.add(sub);

        const thinkingLevel = (pRow.thinking_level as string | null) || null;
        noThinkOverrideCache.set(sub, null); // project_assignments has no no_think column
        thinkingLevelCache.set(sub, thinkingLevel);

        // Resolve primary model from lookup
        const primaryModel = pRow.model_id ? modelLookup.get(pRow.model_id) : null;
        if (primaryModel) {
            // Build a row shape that buildPrimaryModel can consume
            const joinedRow = {
                mr_id: primaryModel.id, name: primaryModel.name,
                provider: primaryModel.provider, mr_model_id: primaryModel.model_id,
                tier: primaryModel.tier, endpoint_url: primaryModel.endpoint_url,
                api_key: primaryModel.api_key, enabled: primaryModel.enabled,
                max_tokens: primaryModel.max_tokens, context_size: primaryModel.context_size,
                cost_per_1k: primaryModel.cost_per_1k, sort_order: primaryModel.sort_order,
                max_retries: primaryModel.max_retries, retry_window_minutes: primaryModel.retry_window_minutes,
                max_concurrency: primaryModel.max_concurrency, request_pause_ms: primaryModel.request_pause_ms,
                request_timeout: primaryModel.request_timeout, rate_limit_backoff_ms: primaryModel.rate_limit_backoff_ms,
                supports_tools: primaryModel.supports_tools, no_think: primaryModel.no_think,
                input_cost_per_mtok: primaryModel.input_cost_per_mtok,
                output_cost_per_mtok: primaryModel.output_cost_per_mtok,
                tool_cost_per_mtok: primaryModel.tool_cost_per_mtok,
            };
            assignmentCache.set(sub, buildPrimaryModel(joinedRow, null, thinkingLevel));
        } else {
            // model_id is null or model not found/disabled — override to unassigned
            assignmentCache.set(sub, null);
        }

        // Resolve consultant model from lookup
        const consultantModel = pRow.consultant_model_id ? modelLookup.get(pRow.consultant_model_id) : null;
        if (consultantModel) {
            const joinedRow = {
                cr_id: consultantModel.id, cr_name: consultantModel.name,
                cr_provider: consultantModel.provider, cr_model_id: consultantModel.model_id,
                cr_tier: consultantModel.tier, cr_endpoint_url: consultantModel.endpoint_url,
                cr_api_key: consultantModel.api_key, cr_enabled: consultantModel.enabled,
                cr_max_tokens: consultantModel.max_tokens, cr_context_size: consultantModel.context_size,
                cr_cost_per_1k: consultantModel.cost_per_1k, cr_sort_order: consultantModel.sort_order,
                cr_max_retries: consultantModel.max_retries, cr_retry_window_minutes: consultantModel.retry_window_minutes,
                cr_max_concurrency: consultantModel.max_concurrency, cr_request_pause_ms: consultantModel.request_pause_ms,
                cr_request_timeout: consultantModel.request_timeout, cr_rate_limit_backoff_ms: consultantModel.rate_limit_backoff_ms,
                cr_supports_tools: consultantModel.supports_tools, cr_no_think: consultantModel.no_think,
                cr_input_cost_per_mtok: consultantModel.input_cost_per_mtok,
                cr_output_cost_per_mtok: consultantModel.output_cost_per_mtok,
                cr_tool_cost_per_mtok: consultantModel.tool_cost_per_mtok,
            };
            consultantCache.set(sub, buildConsultantModel(joinedRow));
        } else {
            consultantCache.set(sub, null);
        }
    }

    assignmentCacheLoaded = true;

    // Log all assignments so the user can verify on startup
    const assigned = [...assignmentCache.entries()]
        .filter(([_, m]) => m !== null)
        .map(([sub, m]) => {
            const tag = projectOverrideSet.has(sub) ? ' [project]' : '';
            return `${sub}→${m!.name}(${m!.provider})${tag}`;
        })
        .join(', ');
    const unassigned = [...assignmentCache.entries()]
        .filter(([_, m]) => m === null)
        .map(([sub]) => sub)
        .join(', ');
    console.error(`[models] Subsystem assignments: ${assigned || '(none)'}`);
    if (unassigned) console.error(`[models] Unassigned subsystems: ${unassigned}`);
    if (projectOverrideSet.size > 0) {
        console.error(`[models] Project overrides: ${[...projectOverrideSet].join(', ')}`);
    }

    const consultants = [...consultantCache.entries()]
        .filter(([_, m]) => m !== null)
        .map(([sub, m]) => `${sub}→${m!.name}`)
        .join(', ');
    if (consultants) console.error(`[models] Consultant models: ${consultants}`);
}

/**
 * Look up the assigned model for a subsystem from the in-memory cache.
 * Returns the full {@link RegisteredModel} record (id, provider, maxTokens, contextSize,
 * cost rates, concurrency limits, thinking config, etc.) or null if the subsystem
 * has no model assigned. A null return means callers should defer or skip the operation.
 * The cache is populated by {@link loadAssignmentCache} and refreshed on every assignment change.
 */
export function getAssignedModel(subsystem: Subsystem): RegisteredModel | null {
    return assignmentCache.get(subsystem) ?? null;
}

/**
 * Lazy one-time loader for the assignment cache. Calls {@link loadAssignmentCache} on first
 * invocation, then no-ops on subsequent calls (the cache stays populated until the process
 * exits or {@link loadAssignmentCache} is called explicitly to refresh).
 */
export async function ensureAssignmentsLoaded(): Promise<void> {
    if (!assignmentCacheLoaded) await loadAssignmentCache();
}

/**
 * Returns a record mapping every valid subsystem to its assigned model (or null).
 * Ensures the assignment cache is loaded before reading.
 * @returns Record of subsystem -> RegisteredModel | null
 */
export async function getSubsystemAssignments(): Promise<Record<Subsystem, RegisteredModel | null>> {
    if (!assignmentCacheLoaded) await loadAssignmentCache();
    const result: Record<string, RegisteredModel | null> = {};
    for (const sub of VALID_SUBSYSTEMS) {
        result[sub] = assignmentCache.get(sub) ?? null;
    }
    // Include dynamic lab subsystems from cache
    for (const [sub] of assignmentCache) {
        if (sub.startsWith('lab:') && !(sub in result)) {
            result[sub] = assignmentCache.get(sub as Subsystem) ?? null;
        }
    }
    return result as Record<Subsystem, RegisteredModel | null>;
}

/**
 * Assign a model to a subsystem (or clear with null). Writes to project DB (per-project override)
 * by default, or to system DB (baseline) when `options.baseline` is true.
 * @param subsystem - The subsystem to assign
 * @param modelId - Registry model UUID to assign, or null to clear
 * @param noThink - Per-subsystem thinking override: true=off, false=on, null/undefined=inherit from model
 * @param options - { baseline?: boolean } — write to system baseline instead of project override
 * @throws {Error} If subsystem is not in VALID_SUBSYSTEMS
 */
export async function setSubsystemAssignment(
    subsystem: Subsystem,
    modelId: string | null,
    noThink?: boolean | null | undefined,
    options?: { baseline?: boolean },
): Promise<void> {
    if (!isValidSubsystem(subsystem)) {
        throw new Error(`Invalid subsystem: ${subsystem}. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}`);
    }

    if (options?.baseline) {
        // Write to system DB (baseline defaults) only
        const noThinkDb = noThink === true ? 1 : noThink === false ? 0 : null;
        await systemQuery(
            `INSERT INTO subsystem_assignments (subsystem, model_id, no_think, updated_at) VALUES ($1, $2, $3, datetime('now'))
             ON CONFLICT (subsystem) DO UPDATE SET model_id = $2, no_think = $3, updated_at = datetime('now')`,
            [subsystem, modelId, noThinkDb]
        );
    } else {
        // Write to project DB (per-project override)
        await projectQuery(
            `INSERT INTO project_assignments (subsystem, model_id, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (subsystem) DO UPDATE SET model_id = $2, updated_at = datetime('now')`,
            [subsystem, modelId]
        );
        // Also update system baseline so it stays in sync as a fallback.
        // Without this, the system baseline becomes stale and if the project
        // override is ever lost (e.g. projectQuery fails during cache reload),
        // the system falls back to a wrong model.
        try {
            await systemQuery(
                `INSERT INTO subsystem_assignments (subsystem, model_id, updated_at) VALUES ($1, $2, datetime('now'))
                 ON CONFLICT (subsystem) DO UPDATE SET model_id = $2, updated_at = datetime('now')`,
                [subsystem, modelId]
            );
        } catch (err: any) {
            console.warn(`[assignments] Failed to sync system baseline for ${subsystem}: ${err.message}`);
        }
    }
    await loadAssignmentCache();
}

/**
 * Update just the no_think override for a subsystem (without changing the model assignment).
 * Writes to system baseline (no_think is a legacy column not in project_assignments).
 * @param subsystem - The subsystem to update
 * @param noThink - true=force off, false=force on, null=inherit from model default
 * @throws {Error} If subsystem is not in VALID_SUBSYSTEMS
 */
export async function setSubsystemNoThink(subsystem: Subsystem, noThink: boolean | null): Promise<void> {
    if (!isValidSubsystem(subsystem)) {
        throw new Error(`Invalid subsystem: ${subsystem}. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}`);
    }
    const noThinkDb = noThink === true ? 1 : noThink === false ? 0 : null;
    await systemQuery(
        `UPDATE subsystem_assignments SET no_think = $1, updated_at = datetime('now') WHERE subsystem = $2`,
        [noThinkDb, subsystem]
    );
    await loadAssignmentCache();
}

/**
 * Get per-subsystem no_think overrides from the in-memory cache.
 * @returns Record of subsystem -> boolean | null (null = inherit from model)
 */
export function getNoThinkOverrides(): Record<string, boolean | null> {
    const result: Record<string, boolean | null> = {};
    for (const sub of VALID_SUBSYSTEMS) {
        result[sub] = noThinkOverrideCache.get(sub) ?? null;
    }
    return result;
}

/** Get per-subsystem thinking level overrides (null = inherit from model). */
export function getThinkingLevelOverrides(): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const sub of VALID_SUBSYSTEMS) {
        result[sub] = thinkingLevelCache.get(sub) ?? null;
    }
    return result;
}

/**
 * Update the thinking level for a subsystem (without changing the model assignment).
 * If the subsystem has a project override, updates it there; otherwise updates the system baseline.
 * @param subsystem - The subsystem to update
 * @param thinkingLevel - 'off' | 'low' | 'medium' | 'high', or null to inherit from model
 * @throws {Error} If subsystem or thinkingLevel is invalid
 */
export async function setSubsystemThinking(subsystem: Subsystem, thinkingLevel: string | null): Promise<void> {
    if (!isValidSubsystem(subsystem)) {
        throw new Error(`Invalid subsystem: ${subsystem}. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}`);
    }
    const validLevels = ['off', 'low', 'medium', 'high'];
    if (thinkingLevel !== null && !validLevels.includes(thinkingLevel)) {
        throw new Error(`Invalid thinking level: ${thinkingLevel}. Must be one of: ${validLevels.join(', ')}, or null (inherit)`);
    }

    if (projectOverrideSet.has(subsystem)) {
        // Update the project override
        await projectQuery(
            `UPDATE project_assignments SET thinking_level = $1, updated_at = datetime('now') WHERE subsystem = $2`,
            [thinkingLevel, subsystem]
        );
    } else {
        // Update the system baseline
        await systemQuery(
            `UPDATE subsystem_assignments SET thinking_level = $1, updated_at = datetime('now') WHERE subsystem = $2`,
            [thinkingLevel, subsystem]
        );
    }
    await loadAssignmentCache();
}

// =============================================================================
// CONSULTANT MODEL (PER-SUBSYSTEM ESCALATION)
// =============================================================================

/**
 * Check whether a subsystem has a consultant (escalation) model assigned.
 * Consultant models provide an independent second opinion on primary model output,
 * used for low-confidence review and quality gating in the synthesis pipeline.
 */
export function hasConsultant(subsystem: Subsystem): boolean {
    return consultantCache.get(subsystem) != null;
}

/**
 * Return the consultant (escalation) model for a subsystem from the in-memory cache.
 * Returns the full {@link RegisteredModel} record or null if no consultant is assigned.
 * The cache is populated alongside the primary assignment cache by {@link loadAssignmentCache}.
 */
export function getConsultantModel(subsystem: Subsystem): RegisteredModel | null {
    return consultantCache.get(subsystem) ?? null;
}

/**
 * Return all consultant assignments as a subsystem-to-model record.
 * Ensures the assignment cache is loaded before reading, then returns a snapshot
 * mapping every valid subsystem to its consultant {@link RegisteredModel} (or null).
 */
export async function getConsultantAssignments(): Promise<Record<Subsystem, RegisteredModel | null>> {
    if (!assignmentCacheLoaded) await loadAssignmentCache();
    const result: Record<string, RegisteredModel | null> = {};
    for (const sub of VALID_SUBSYSTEMS) {
        result[sub] = consultantCache.get(sub) ?? null;
    }
    for (const [sub] of consultantCache) {
        if (sub.startsWith('lab:') && !(sub in result)) {
            result[sub] = consultantCache.get(sub as Subsystem) ?? null;
        }
    }
    return result as Record<Subsystem, RegisteredModel | null>;
}

/**
 * Assign a consultant (escalation) model to a subsystem, or pass null to clear.
 * Writes to project DB (per-project override) by default.
 * @param subsystem - The subsystem to assign a consultant for
 * @param consultantModelId - Registry model UUID, or null to remove the consultant
 * @param options - { baseline?: boolean } — write to system baseline instead of project override
 * @throws {Error} If subsystem is not in VALID_SUBSYSTEMS
 */
export async function setConsultantAssignment(
    subsystem: Subsystem,
    consultantModelId: string | null,
    options?: { baseline?: boolean },
): Promise<void> {
    if (!isValidSubsystem(subsystem)) {
        throw new Error(`Invalid subsystem: ${subsystem}. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}`);
    }

    if (options?.baseline) {
        await systemQuery(
            `INSERT INTO subsystem_assignments (subsystem, consultant_model_id, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (subsystem) DO UPDATE SET consultant_model_id = $2, updated_at = datetime('now')`,
            [subsystem, consultantModelId]
        );
    } else {
        await projectQuery(
            `INSERT INTO project_assignments (subsystem, consultant_model_id, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (subsystem) DO UPDATE SET consultant_model_id = $2, updated_at = datetime('now')`,
            [subsystem, consultantModelId]
        );
    }
    await loadAssignmentCache();
}

// =============================================================================
// PROJECT OVERRIDE MANAGEMENT
// =============================================================================

/**
 * Check whether a subsystem's assignment comes from a project-level override
 * (vs inherited from the system baseline).
 */
export function isProjectOverride(subsystem: Subsystem): boolean {
    return projectOverrideSet.has(subsystem);
}

/**
 * Returns a record of which subsystems have project-level overrides.
 * Used by the GUI to show inherited vs overridden status.
 */
export function getProjectOverrides(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const sub of VALID_SUBSYSTEMS) {
        result[sub] = projectOverrideSet.has(sub);
    }
    return result;
}

/**
 * Remove a project-level override for a subsystem, falling back to the system baseline.
 * @param subsystem - The subsystem to reset to baseline
 * @throws {Error} If subsystem is not in VALID_SUBSYSTEMS
 */
export async function resetProjectAssignment(subsystem: Subsystem): Promise<void> {
    if (!isValidSubsystem(subsystem)) {
        throw new Error(`Invalid subsystem: ${subsystem}. Must be one of: ${VALID_SUBSYSTEMS.join(', ')}`);
    }
    try {
        await projectQuery(
            `DELETE FROM project_assignments WHERE subsystem = $1`,
            [subsystem]
        );
    } catch {
        // project_assignments table may not exist yet
    }
    await loadAssignmentCache();
}

/**
 * Remove ALL project-level overrides, falling back to system baseline for everything.
 */
export async function resetAllProjectAssignments(): Promise<void> {
    try {
        await projectQuery(`DELETE FROM project_assignments`);
    } catch {
        // project_assignments table may not exist yet
    }
    await loadAssignmentCache();
}

/**
 * Call the consultant (escalation) model for a subsystem.
 * Structurally identical to callSubsystemModel but reads from consultantCache
 * and logs usage with ":consultant" suffix for cost tracking.
 * @param subsystem - The subsystem whose consultant model to call
 * @param prompt - The prompt text to send
 * @param options - Call options (maxTokens, temperature, signal, etc.)
 * @returns The model's text response
 * @throws {Error} If no consultant is assigned, budget is exceeded, or all retries fail
 */
export async function callConsultantModel(
    subsystem: Subsystem,
    prompt: string,
    options: CallOptions = {},
): Promise<string> {
    if (isBudgetExceeded()) {
        throw new Error('Budget exceeded — all LLM calls paused. Check budget settings in the GUI.');
    }

    if (!assignmentCacheLoaded) await loadAssignmentCache();

    const assigned = consultantCache.get(subsystem);
    if (!assigned) {
        throw new Error(`No consultant model assigned to subsystem "${subsystem}".`);
    }

    const model: ModelEntry = {
        name: assigned.modelId,
        provider: assigned.provider,
        model: assigned.modelId,
        endpoint: assigned.endpointUrl || undefined,
        apiKey: assigned.apiKey || undefined,
        noThink: assigned.noThink || false,
        thinkingLevel: assigned.thinkingLevel || undefined,
        _registryId: assigned.id,
        _maxConcurrency: assigned.maxConcurrency,
        _requestPauseMs: assigned.requestPauseMs,
    };

    const baseMaxTokens = options.maxTokens
        || assigned.maxTokens
        || (assigned.contextSize ? Math.min(Math.floor(assigned.contextSize * 0.25), 16384) : undefined);
    const effectiveMaxTokens = baseMaxTokens == null ? undefined
        : assigned.noThink ? baseMaxTokens
        : applyReasoningBonus(assigned.modelId, baseMaxTokens);

    // Consultant models use their own inference params, separate from primary models.
    const effectiveTemperature = options.temperature ?? appConfig.consultantTemperatures?.[subsystem] ?? 0.15;
    const effectiveRepeatPenalty = options.repeatPenalty ?? appConfig.consultantRepeatPenalties?.[subsystem] ?? undefined;
    const effectiveTopP = options.topP ?? appConfig.consultantTopP?.[subsystem] ?? undefined;
    const effectiveMinP = options.minP ?? appConfig.consultantMinP?.[subsystem] ?? undefined;
    const effectiveTopK = options.topK ?? appConfig.consultantTopK?.[subsystem] ?? undefined;

    const maxRetries = assigned.maxRetries ?? 3;
    const retryWindowMs = (assigned.retryWindowMinutes ?? 2) * 60 * 1000;
    const startTime = Date.now();

    const consultantLabel = options.isReview ? `${subsystem}:review` : `${subsystem}:consultant`;
    console.log(`[llm] Consultant "${subsystem}" → ${assigned.name} (${getModelProvider(assigned.modelId)}), maxTokens: ${effectiveMaxTokens ?? 'dynamic'}`);
    emitActivity('llm', 'consultant_start', `${consultantLabel} → ${assigned.name}`, {
        subsystem, consultant: true, model: assigned.name, provider: getModelProvider(assigned.modelId), maxTokens: effectiveMaxTokens,
    });

    // Semaphore is acquired inside callSingleModel (keyed by _registryId)
    {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await callSingleModel(model, prompt, {
                    ...options,
                    maxTokens: effectiveMaxTokens,
                    temperature: effectiveTemperature,
                    repeatPenalty: effectiveRepeatPenalty,
                    topP: effectiveTopP,
                    minP: effectiveMinP,
                    topK: effectiveTopK,
                    signal: options.signal || getProjectAbortSignal(),
                    requestTimeout: assigned.requestTimeout,
                });
                const elapsed = Date.now() - startTime;
                emitActivity('llm', 'consultant_complete', `${consultantLabel} → ${assigned.name} (${elapsed}ms, ${result.text.length} chars)`, {
                    subsystem, consultant: true, model: assigned.name, elapsed, chars: result.text.length, usage: result.usage,
                });

                if (result.usage) {
                    logUsage({
                        subsystem: consultantLabel,
                        modelId: assigned.id,
                        modelName: assigned.name,
                        provider: assigned.provider,
                        inputTokens: result.usage.prompt_tokens,
                        outputTokens: result.usage.completion_tokens,
                        toolTokens: result.usage.tool_tokens,
                        totalTokens: result.usage.total_tokens,
                        latencyMs: elapsed,
                        finishReason: result.finishReason,
                        inputCostPerMtok: assigned.inputCostPerMtok,
                        outputCostPerMtok: assigned.outputCostPerMtok,
                        toolCostPerMtok: assigned.toolCostPerMtok,
                    }).catch(() => {});
                }

                return result.text;
            } catch (err: any) {
                lastError = err;
                if (err.name === 'AbortError') throw err;
                const elapsed = Date.now() - startTime;

                // Rate-limit errors (429) are transient — always propagate cooldown
                // and retry within the time window, regardless of attempt count.
                if (isRateLimitError(err)) {
                    const parsed = parseRateLimitWaitMs(err.message);
                    const delay = parsed ?? (assigned.rateLimitBackoffMs ?? RC.retries.rateLimitBackoffMs);
                    reportRateLimit(assigned.id, delay);
                    if (elapsed + delay >= retryWindowMs) {
                        console.error(`[llm] Consultant "${subsystem}" rate-limited and retry window exhausted after ${attempt} attempt(s): ${err.message}`);
                        emitActivity('llm', 'consultant_failed', `${consultantLabel} → ${assigned.name} FAILED (rate-limited, window exhausted): ${err.message.slice(0, 100)}`, {
                            subsystem, consultant: true, model: assigned.name, elapsed, error: err.message.slice(0, 200),
                        });
                        break;
                    }
                    console.warn(`[llm] Consultant "${subsystem}" rate-limited — waiting ${(delay / 1000).toFixed(1)}s${parsed ? ' (from error)' : ' (default backoff)'}`);
                    emitActivity('llm', 'call_rate_limited', `${consultantLabel} → ${assigned.name} rate-limited, backoff ${(delay / 1000).toFixed(0)}s`, { subsystem, attempt, delay });
                    attempt--;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                if (attempt >= maxRetries || elapsed >= retryWindowMs) {
                    emitActivity('llm', 'consultant_failed', `${consultantLabel} → ${assigned.name} FAILED: ${err.message.slice(0, 100)}`, {
                        subsystem, consultant: true, model: assigned.name, elapsed, error: err.message.slice(0, 200),
                    });
                    break;
                }
                const delay = Math.min(RC.retries.backoffBaseMs * attempt, RC.retries.backoffCapMs);
                console.warn(`[llm] Consultant "${subsystem}" attempt ${attempt}/${maxRetries} failed: ${err.message} — retrying in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError!;
    }
}

// =============================================================================
// CONSULTANT REVIEW — Low-confidence escalation
// =============================================================================

export interface ConsultantReviewResult {
    score: number;          // 0-10
    accept: boolean;
    reasoning: string;
    revisedOutput?: string; // If consultant wants to provide its own improved answer
}

/**
 * Ask the consultant model to review the primary model's output.
 * Returns null silently if no consultant is assigned (review is optional).
 * Uses low temperature (0.15) for deterministic scoring.
 * If nodeId is provided, logs the review decision to the node's audit trail.
 */
export async function consultantReview(
    subsystem: Subsystem,
    primaryOutput: string,
    context: { claim?: string; domain?: string; parentContext?: string; subsystemTask?: string; nodeId?: string },
): Promise<ConsultantReviewResult | null> {
    if (!assignmentCacheLoaded) await loadAssignmentCache();
    if (!consultantCache.get(subsystem)) return null;
    if (isBudgetExceeded()) return null;

    try {
        const prompt = await getPrompt('quality.consultant_review', {
            nodeContent: context.claim || '',
            primaryOutput,
            domain: context.domain || 'general',
            parentContext: context.parentContext || '(none)',
            subsystemTask: context.subsystemTask || subsystem,
        });

        const raw = await callConsultantModel(subsystem, prompt, {
            isReview: true,
            jsonSchema: {
                name: 'consultant_review',
                schema: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        accept: { type: 'boolean' },
                        reasoning: { type: 'string' },
                        revisedOutput: { type: 'string' },
                    },
                    required: ['score', 'accept', 'reasoning'],
                },
            },
        });

        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
        const score = Math.max(0, Math.min(10, Number(parsed.score) || 0));
        const result: ConsultantReviewResult = {
            score,
            accept: !!parsed.accept,
            reasoning: String(parsed.reasoning || '').slice(0, 500),
        };
        if (parsed.revisedOutput && typeof parsed.revisedOutput === 'string' && parsed.revisedOutput.trim()) {
            result.revisedOutput = parsed.revisedOutput.trim();
        }

        emitActivity('llm', 'consultant_review', `${subsystem}: score=${score} accept=${result.accept}${result.revisedOutput ? ' (revised)' : ''}`, {
            subsystem, score, accept: result.accept, reasoning: result.reasoning.slice(0, 200),
            hasRevision: !!result.revisedOutput,
        });

        // Audit trail — log the review decision to the node's decision history
        if (context.nodeId) {
            const decision = result.accept ? 'consultant_accept' : 'consultant_reject';
            const detail = `[${subsystem}] score=${score}/10: ${result.reasoning.slice(0, 300)}${result.revisedOutput ? ' | revised output provided' : ''}`;
            await logDecision('node', context.nodeId, decision, primaryOutput.slice(0, 200), detail, 'consultant', 'consultant:' + subsystem, `Consultant review for ${subsystem}`);
        }

        return result;
    } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        console.error(`[consultant-review] ${subsystem} review failed: ${err.message}`);
        return null;  // Review failure is non-fatal
    }
}

// =============================================================================
// SUBSYSTEM-AWARE MODEL CALLING
// =============================================================================

/**
 * Call an LLM for a specific subsystem using the assigned model from the registry.
 * Handles max-token resolution, reasoning bonuses, sampling params, retry with backoff,
 * rate-limit detection/parsing, concurrency semaphore, and usage logging.
 * @param subsystem - The subsystem making the call (determines which model to use)
 * @param prompt - The prompt text to send
 * @param options - Call options (maxTokens, temperature, signal, etc.)
 * @returns The model's text response
 * @throws {Error} If no model is assigned, budget is exceeded, or all retries fail
 */
export async function callSubsystemModel(
    subsystem: Subsystem,
    prompt: string,
    options: CallOptions = {},
): Promise<string> {
    if (isBudgetExceeded()) {
        throw new Error('Budget exceeded — all LLM calls paused. Check budget settings in the GUI.');
    }

    if (!assignmentCacheLoaded) await loadAssignmentCache();

    const assigned = assignmentCache.get(subsystem);

    if (!assigned) {
        throw new Error(`No model assigned to subsystem "${subsystem}". Assign a model in the Models page.`);
    }

    const model: ModelEntry = {
        name: assigned.modelId,
        provider: assigned.provider,
        model: assigned.modelId,
        endpoint: assigned.endpointUrl || undefined,
        apiKey: assigned.apiKey || undefined,
        noThink: assigned.noThink || false,
        thinkingLevel: assigned.thinkingLevel || undefined,
        _registryId: assigned.id,
        _maxConcurrency: assigned.maxConcurrency,
        _requestPauseMs: assigned.requestPauseMs,
    };

    // Resolve max tokens: caller override > per-model registry > derived from context size > undefined.
    // Leave undefined when unknown — let the provider use its own default rather than capping at an arbitrary value.
    // Anthropic provider handles its own required max_tokens fallback.
    const baseMaxTokens = options.maxTokens
        || assigned.maxTokens
        || (assigned.contextSize ? Math.min(Math.floor(assigned.contextSize * 0.25), 16384) : undefined);

    // Reasoning models need extra tokens for chain-of-thought.
    // Skip the bonus when noThink is active — we're stripping reasoning output anyway.
    const effectiveMaxTokens = baseMaxTokens == null ? undefined
        : assigned.noThink ? baseMaxTokens
        : applyReasoningBonus(assigned.modelId, baseMaxTokens);
    const isReasoning = !assigned.noThink && (effectiveMaxTokens ?? 0) > (baseMaxTokens ?? 0);

    // Resolve temperature: caller override > per-subsystem config > undefined (let model decide)
    const effectiveTemperature = options.temperature
        ?? appConfig.subsystemTemperatures?.[subsystem]
        ?? undefined;

    // Resolve repeat penalty: caller override > per-subsystem config > undefined
    const effectiveRepeatPenalty = options.repeatPenalty
        ?? appConfig.subsystemRepeatPenalties?.[subsystem]
        ?? undefined;

    // Resolve sampling params: caller override > per-subsystem config > undefined (model default)
    const effectiveTopP = options.topP ?? appConfig.subsystemTopP?.[subsystem] ?? undefined;
    const effectiveMinP = options.minP ?? appConfig.subsystemMinP?.[subsystem] ?? undefined;
    const effectiveTopK = options.topK ?? appConfig.subsystemTopK?.[subsystem] ?? undefined;

    const maxRetries = assigned.maxRetries ?? 3;
    const retryWindowMs = (assigned.retryWindowMinutes ?? 2) * 60 * 1000;
    const startTime = Date.now();

    console.log(`[llm] Subsystem "${subsystem}" → assigned: ${assigned.name} (${getModelProvider(assigned.modelId)}, endpoint: ${model.endpoint || 'default'}), maxTokens: ${effectiveMaxTokens ?? 'dynamic'}${isReasoning ? ' (reasoning +' + appConfig.tokenLimits.reasoningExtraTokens + ')' : ''}, temp: ${effectiveTemperature ?? 'model-default'}, maxRetries: ${maxRetries}, retryWindow: ${assigned.retryWindowMinutes ?? 2}m`);
    emitActivity('llm', 'call_start', `${subsystem} → ${assigned.name}`, { subsystem, model: assigned.name, provider: getModelProvider(assigned.modelId), maxTokens: effectiveMaxTokens, reasoning: isReasoning });

    // Semaphore is acquired inside callSingleModel (keyed by _registryId) — no
    // need to acquire here. This also means the slot is released during retry
    // backoff waits, freeing it for other callers.
    {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await callSingleModel(model, prompt, {
                    ...options,
                    maxTokens: effectiveMaxTokens,
                    temperature: effectiveTemperature,
                    repeatPenalty: effectiveRepeatPenalty,
                    topP: effectiveTopP,
                    minP: effectiveMinP,
                    topK: effectiveTopK,
                    signal: options.signal || getProjectAbortSignal(),
                    requestTimeout: assigned.requestTimeout,
                });
                const elapsed = Date.now() - startTime;
                emitActivity('llm', 'call_complete', `${subsystem} → ${assigned.name} (${elapsed}ms, ${result.text.length} chars)`, { subsystem, model: assigned.name, elapsed, chars: result.text.length, usage: result.usage });

                // Log usage to persistent store (fire-and-forget)
                if (result.usage) {
                    logUsage({
                        subsystem,
                        modelId: assigned.id,
                        modelName: assigned.name,
                        provider: assigned.provider,
                        inputTokens: result.usage.prompt_tokens,
                        outputTokens: result.usage.completion_tokens,
                        toolTokens: result.usage.tool_tokens,
                        totalTokens: result.usage.total_tokens,
                        latencyMs: elapsed,
                        finishReason: result.finishReason,
                        inputCostPerMtok: assigned.inputCostPerMtok,
                        outputCostPerMtok: assigned.outputCostPerMtok,
                        toolCostPerMtok: assigned.toolCostPerMtok,
                    }).catch(() => {});
                }

                return result.text;
            } catch (err: any) {
                lastError = err;

                // Abort errors (from project switching) — never retry, propagate immediately
                if (err.name === 'AbortError') {
                    console.warn(`[llm] Subsystem "${subsystem}" aborted (project switch)`);
                    throw err;
                }

                const elapsed = Date.now() - startTime;

                // Rate-limit errors (429) are transient — always propagate cooldown
                // and retry within the time window, regardless of attempt count.
                if (isRateLimitError(err)) {
                    const parsed = parseRateLimitWaitMs(err.message);
                    const delay = parsed ?? (assigned.rateLimitBackoffMs ?? RC.retries.rateLimitBackoffMs);
                    // Propagate cooldown to ALL callers for this model
                    reportRateLimit(assigned.id, delay);
                    if (elapsed + delay >= retryWindowMs) {
                        console.error(`[llm] Subsystem "${subsystem}" rate-limited and retry window exhausted after ${attempt} attempt(s): ${err.message}`);
                        emitActivity('llm', 'call_failed', `${subsystem} → ${assigned.name} FAILED (rate-limited, window exhausted): ${err.message.slice(0, 100)}`, { subsystem, model: assigned.name, elapsed, error: err.message.slice(0, 200) });
                        break;
                    }
                    console.warn(`[llm] Subsystem "${subsystem}" rate-limited — waiting ${(delay / 1000).toFixed(1)}s${parsed ? ' (from error)' : ' (default backoff)'}`);
                    emitActivity('llm', 'call_rate_limited', `${subsystem} → ${assigned.name} rate-limited, backoff ${(delay / 1000).toFixed(0)}s`, { subsystem, attempt, delay });
                    // Don't count rate-limit retries against maxRetries
                    attempt--;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                if (attempt >= maxRetries || elapsed >= retryWindowMs) {
                    console.error(`[llm] Subsystem "${subsystem}" failed after ${attempt} attempt(s): ${err.message}`);
                    emitActivity('llm', 'call_failed', `${subsystem} → ${assigned.name} FAILED: ${err.message.slice(0, 100)}`, { subsystem, model: assigned.name, elapsed, error: err.message.slice(0, 200) });
                    break;
                }
                const delay = Math.min(RC.retries.backoffBaseMs * attempt, RC.retries.backoffCapMs);
                console.warn(`[llm] Subsystem "${subsystem}" attempt ${attempt}/${maxRetries} failed: ${err.message} — retrying in ${delay}ms`);
                emitActivity('llm', 'call_retry', `${subsystem} → ${assigned.name} retry ${attempt}/${maxRetries}`, { subsystem, attempt, maxRetries });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError!;
    }
}
