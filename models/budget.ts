/**
 * Cost Budget Control — configurable spending limits that pause all services when exceeded.
 *
 * Budget config stored in `settings` table as key `budget.config`.
 * Cost data sourced from existing `llm_usage_log` table.
 *
 * Two enforcement layers:
 * 1. Synchronous `isBudgetExceeded()` — zero-latency boolean checked before every LLM call
 * 2. Background monitor (10s interval) — detects transitions, pauses/resumes services
 *
 * Cost queries are cached for 60s to avoid blocking the event loop with
 * a heavy 30-day SUM aggregation on every 10s tick.
 */

import { systemQuery as query, systemQueryOne as queryOne } from '../db.js';
import { emitActivity } from '../services/event-bus.js';
import { RC } from '../config/constants.js';

// =============================================================================
// TYPES
// =============================================================================

export interface BudgetLimits {
    hourly: number | null;
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
}

export interface BudgetConfig {
    enabled: boolean;
    limits: BudgetLimits;
    warningThreshold: number;
    /** Additional budget ($) added to the exceeded period's limit on force resume */
    forceResumeBudget: number;
    pausedByBudget: boolean;
    pausedAt: string | null;
    pausedPeriod: string | null;
    /** Services that were running when budget pause triggered — used to restore on force resume */
    pausedServices: string[];
}

export interface BudgetCosts {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
}

export type BudgetPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface BudgetStatus {
    config: BudgetConfig;
    costs: BudgetCosts;
    utilization: Partial<Record<BudgetPeriod, number>>;
    exceeded: boolean;
    exceededPeriod: BudgetPeriod | null;
    warning: boolean;
    warningPeriods: BudgetPeriod[];
    /** Active override: extra budget added via force resume (null if no override active) */
    activeOverride: { period: BudgetPeriod; extraBudget: number; effectiveLimit: number; remainingExtra: number } | null;
}

// =============================================================================
// DEFAULTS & STATE
// =============================================================================

// Cost cache — avoids running the heavy 30-day SUM query every 10s tick
let _costsCache: BudgetCosts | null = null;
let _costsCacheTime = 0;
const COSTS_CACHE_TTL_MS = RC.intervals.costsCacheTtlMs;

const SETTINGS_KEY = 'budget.config';

const DEFAULTS: BudgetConfig = {
    enabled: false,
    limits: { hourly: null, daily: null, weekly: null, monthly: null },
    warningThreshold: 0.80,
    forceResumeBudget: 1.00,
    pausedByBudget: false,
    pausedAt: null,
    pausedPeriod: null,
    pausedServices: [],
};

/** Module-level cached state — updated every 10s by background monitor */
let _exceeded = false;
let _config: BudgetConfig = { ...DEFAULTS };
let _monitorInterval: ReturnType<typeof setInterval> | null = null;
let _lastStatus: BudgetStatus | null = null;
/**
 * Active budget override — temporarily raises one period's limit.
 * Set by forceResume, cleared when the override budget is consumed or period rolls over.
 */
let _override: { period: BudgetPeriod; extraBudget: number; costAtResume: number } | null = null;

// =============================================================================
// HOT-PATH API (synchronous, zero latency)
// =============================================================================

/**
 * Synchronous, zero-latency budget gate checked before every LLM call.
 * Reads a module-level boolean that the background monitor updates every 10 seconds,
 * so this never touches the database or blocks the event loop.
 */
export function isBudgetExceeded(): boolean {
    return _exceeded;
}

// =============================================================================
// SETTINGS I/O
// =============================================================================

/**
 * Load budget configuration from the settings table (system DB).
 * Falls back to defaults if no saved config exists.
 * @returns The budget configuration with defaults merged in
 */
export async function loadBudgetConfig(): Promise<BudgetConfig> {
    try {
        const row = await queryOne('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY]);
        if (row?.value) {
            const saved = JSON.parse(row.value);
            return { ...DEFAULTS, ...saved, limits: { ...DEFAULTS.limits, ...saved.limits } };
        }
    } catch { /* use defaults */ }
    return { ...DEFAULTS };
}

/**
 * Persist budget configuration to the settings table and update the module-level cache.
 * @param cfg - The complete budget config to save
 */
async function saveBudgetConfig(cfg: BudgetConfig): Promise<void> {
    const json = JSON.stringify(cfg);
    await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [SETTINGS_KEY, json],
    );
    _config = cfg;
}

// =============================================================================
// COST AGGREGATION
// =============================================================================

/**
 * Get aggregated costs for the last hour/day/week/month from llm_usage_log.
 * Results are cached for 60s to avoid expensive SUM queries on every monitor tick.
 * @returns Cost totals for each budget period
 */
async function getCosts(): Promise<BudgetCosts> {
    const now = Date.now();
    if (_costsCache && (now - _costsCacheTime) < COSTS_CACHE_TTL_MS) {
        return _costsCache;
    }
    const row = await queryOne(`
        SELECT
            COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-1 hour')  THEN total_cost ELSE 0 END), 0) as hourly_cost,
            COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-1 day')   THEN total_cost ELSE 0 END), 0) as daily_cost,
            COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days')  THEN total_cost ELSE 0 END), 0) as weekly_cost,
            COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN total_cost ELSE 0 END), 0) as monthly_cost
        FROM llm_usage_log
        WHERE created_at >= datetime('now', '-30 days')
    `, []);
    const costs = {
        hourly: row?.hourly_cost ?? 0,
        daily: row?.daily_cost ?? 0,
        weekly: row?.weekly_cost ?? 0,
        monthly: row?.monthly_cost ?? 0,
    };
    _costsCache = costs;
    _costsCacheTime = now;
    return costs;
}

// =============================================================================
// STATUS COMPUTATION
// =============================================================================

/**
 * Evaluate budget status by comparing costs against configured limits.
 * Applies any active override (from force resume) and auto-clears exhausted overrides.
 * @param cfg - Current budget configuration
 * @param costs - Aggregated costs for each period
 * @returns Full budget status including utilization, exceeded/warning flags, and override info
 */
function evaluateStatus(cfg: BudgetConfig, costs: BudgetCosts): BudgetStatus {
    const utilization: Partial<Record<BudgetPeriod, number>> = {};
    let exceeded = false;
    let exceededPeriod: BudgetPeriod | null = null;
    let warning = false;
    const warningPeriods: BudgetPeriod[] = [];

    const periods: BudgetPeriod[] = ['hourly', 'daily', 'weekly', 'monthly'];
    for (const period of periods) {
        let limit = cfg.limits[period];
        if (limit == null || limit <= 0) continue;

        // Apply active override — temporarily raises this period's limit
        if (_override && _override.period === period) {
            limit = limit + _override.extraBudget;
        }

        const cost = costs[period];
        const util = cost / limit;
        utilization[period] = util;

        if (util >= 1.0 && !exceeded) {
            exceeded = true;
            exceededPeriod = period;
        }
        if (util >= cfg.warningThreshold && util < 1.0) {
            warning = true;
            warningPeriods.push(period);
        }
    }

    // Compute active override status for the GUI
    let activeOverride: BudgetStatus['activeOverride'] = null;
    if (_override) {
        const baseLimit = cfg.limits[_override.period] ?? 0;
        const effectiveLimit = baseLimit + _override.extraBudget;
        const currentCost = costs[_override.period];
        const spentSinceResume = currentCost - _override.costAtResume;
        const remainingExtra = Math.max(0, _override.extraBudget - spentSinceResume);
        activeOverride = {
            period: _override.period,
            extraBudget: _override.extraBudget,
            effectiveLimit,
            remainingExtra,
        };
        // Auto-clear override if extra budget is consumed
        if (remainingExtra <= 0) {
            console.error(`[budget] Force resume extra budget consumed — override cleared`);
            emitActivity('system', 'budget_override_consumed', 'Force resume extra budget consumed. Normal budget enforcement resumed.', {});
            _override = null;
        }
    }

    return { config: cfg, costs, utilization, exceeded, exceededPeriod, warning, warningPeriods, activeOverride };
}

/**
 * Full async budget status with costs, utilization ratios, exceeded/warning flags,
 * and active override info. Costs are cached for 60 seconds to avoid repeated heavy
 * 30-day SUM queries. Used by the REST API and GUI budget dashboard.
 */
export async function getBudgetStatus(): Promise<BudgetStatus> {
    const cfg = await loadBudgetConfig();
    if (!cfg.enabled) {
        return evaluateStatus(cfg, { hourly: 0, daily: 0, weekly: 0, monthly: 0 });
    }
    const costs = await getCosts();
    return evaluateStatus(cfg, costs);
}

// =============================================================================
// RETRY-AFTER COMPUTATION
// =============================================================================

const PERIOD_SECONDS: Record<BudgetPeriod, number> = {
    hourly: 3600,
    daily: 86400,
    weekly: 604800,
    monthly: 2592000,
};

/**
 * Compute Retry-After seconds for HTTP 429 responses when budget is exceeded.
 * Suggests waiting until the exceeded period rolls over, capped at 1 hour.
 * @param status - Current budget status (must have exceededPeriod set)
 * @returns Seconds to suggest in Retry-After header (default 60 if no period)
 */
export function computeRetryAfterSeconds(status: BudgetStatus): number {
    if (!status.exceededPeriod) return 60;
    // Suggest waiting until the period rolls over (conservative estimate)
    return Math.min(PERIOD_SECONDS[status.exceededPeriod], 3600);
}

// =============================================================================
// SERVICE PAUSE / RESUME
// =============================================================================

/**
 * Pause all running LLM-dependent services when budget is exceeded.
 * Stops synthesis engine and all autonomous cycles, records which were running for later restore.
 * @param period - The budget period that was exceeded (for logging)
 */
async function pauseServices(period: BudgetPeriod): Promise<void> {
    console.error(`[budget] Budget exceeded (${period}) — pausing all services`);
    emitActivity('system', 'budget_exceeded',
        `Budget limit exceeded (${period}). All LLM calls paused.`,
        { period, timestamp: new Date().toISOString() },
    );

    const stoppedServices: string[] = [];
    try {
        const core = await import('../core.js');

        // Stop synthesis engine
        if (typeof core.getSynthesisStatus === 'function') {
            const synthStatus = core.getSynthesisStatus();
            if (synthStatus?.running) {
                core.stopSynthesisEngine();
                stoppedServices.push('synthesis');
            }
        }

        // Stop all autonomous cycles (including evm)
        const cycleTypes = ['validation', 'questions', 'tensions', 'research', 'autorating', 'evm'] as const;
        for (const type of cycleTypes) {
            if (core.cycleStates?.[type]?.running && typeof core.stopCycle === 'function') {
                core.stopCycle(type);
                stoppedServices.push(type);
            }
        }
    } catch { /* core not loaded yet */ }

    if (stoppedServices.length > 0) {
        console.error(`[budget] Stopped services: ${stoppedServices.join(', ')}`);
    }

    await saveBudgetConfig({
        ..._config,
        pausedByBudget: true,
        pausedAt: new Date().toISOString(),
        pausedPeriod: period,
        pausedServices: stoppedServices,
    });
}

/**
 * Resume services that were paused by budget enforcement.
 * Restarts synthesis engine and autonomous cycles that were running before the pause.
 */
async function resumeServices(): Promise<void> {
    console.error('[budget] Budget within limits — LLM calls unblocked');

    // Capture which services were running before clearing the config
    const servicesToRestart = [...(_config.pausedServices || [])];

    await saveBudgetConfig({
        ..._config,
        pausedByBudget: false,
        pausedAt: null,
        pausedPeriod: null,
        pausedServices: [],
    });

    // Restart services that were running when the budget paused them
    const restarted: string[] = [];
    if (servicesToRestart.length > 0) {
        try {
            const core = await import('../core.js');

            for (const svc of servicesToRestart) {
                try {
                    if (svc === 'synthesis') {
                        core.runSynthesisEngine({}).catch((err: any) => {
                            console.error(`[budget] Synthesis engine restart error: ${err.message}`);
                        });
                        restarted.push('synthesis');
                    } else {
                        const startFns: Record<string, () => Promise<any>> = {
                            validation: core.startValidationCycle,
                            questions: core.startQuestionCycle,
                            tensions: core.startTensionCycle,
                            research: core.startResearchCycle,
                            autorating: core.startAutoratingCycle,
                            evm: core.startEvmCycle,
                        };
                        const startFn = startFns[svc];
                        if (typeof startFn === 'function') {
                            await startFn();
                            restarted.push(svc);
                        }
                    }
                } catch (err: any) {
                    console.error(`[budget] Failed to restart ${svc}: ${err.message}`);
                }
            }
        } catch { /* core not loaded */ }
    }

    const restartMsg = restarted.length > 0
        ? ` Restarted: ${restarted.join(', ')}.`
        : '';

    emitActivity('system', 'budget_cleared',
        `Budget within limits. LLM calls unblocked.${restartMsg}`,
        { previousPeriod: _config.pausedPeriod, restarted },
    );
}

/**
 * Manual force-resume -- clears pause, adds extra budget to the exceeded period, and restarts services.
 * The override temporarily raises the limit by `forceResumeBudget` dollars until consumed.
 * @returns Result object with success status, restarted services, and extra budget details
 */
export async function forceResume(): Promise<{ success: boolean; message: string; restarted: string[]; extraBudget: number; period: string | null }> {
    _exceeded = false;

    // Set budget override — temporarily raise the limit for the exceeded period
    const extraBudget = _config.forceResumeBudget ?? DEFAULTS.forceResumeBudget;
    const pausedPeriod = _config.pausedPeriod as BudgetPeriod | null;

    if (pausedPeriod && extraBudget > 0) {
        // Get current cost so we can track spending from this point
        let costAtResume = 0;
        try {
            const costs = await getCosts();
            costAtResume = costs[pausedPeriod] ?? 0;
        } catch { /* use 0 */ }

        _override = { period: pausedPeriod, extraBudget, costAtResume };
        console.error(`[budget] Override set: +$${extraBudget.toFixed(2)} on ${pausedPeriod} limit (cost at resume: $${costAtResume.toFixed(4)})`);
    }

    // Capture which services were running before clearing the config
    const servicesToRestart = [...(_config.pausedServices || [])];

    await saveBudgetConfig({
        ..._config,
        pausedByBudget: false,
        pausedAt: null,
        pausedPeriod: null,
        pausedServices: [],
    });

    // Restart services that were running when the budget paused them
    const restarted: string[] = [];
    if (servicesToRestart.length > 0) {
        try {
            const core = await import('../core.js');

            for (const svc of servicesToRestart) {
                try {
                    if (svc === 'synthesis') {
                        core.runSynthesisEngine({}).catch((err: any) => {
                            console.error(`[budget] Synthesis engine restart error: ${err.message}`);
                        });
                        restarted.push('synthesis');
                    } else {
                        const startFns: Record<string, () => Promise<any>> = {
                            validation: core.startValidationCycle,
                            questions: core.startQuestionCycle,
                            tensions: core.startTensionCycle,
                            research: core.startResearchCycle,
                            autorating: core.startAutoratingCycle,
                            evm: core.startEvmCycle,
                        };
                        const startFn = startFns[svc];
                        if (typeof startFn === 'function') {
                            await startFn();
                            restarted.push(svc);
                        }
                    }
                } catch (err: any) {
                    console.error(`[budget] Failed to restart ${svc}: ${err.message}`);
                }
            }
        } catch { /* core not loaded */ }
    }

    const restartMsg = restarted.length > 0
        ? ` Restarted: ${restarted.join(', ')}.`
        : ' No services to restart.';
    const budgetMsg = pausedPeriod && extraBudget > 0
        ? ` Added $${extraBudget.toFixed(2)} to ${pausedPeriod} budget.`
        : '';

    emitActivity('system', 'budget_resume',
        `Budget pause manually overridden.${budgetMsg}${restartMsg}`,
        { restarted, extraBudget, period: pausedPeriod },
    );

    console.error(`[budget] Force resume — cleared pause, +$${extraBudget.toFixed(2)} on ${pausedPeriod || 'none'}, restarted: ${restarted.join(', ') || 'none'}`);
    return {
        success: true,
        message: `Budget pause cleared.${budgetMsg}${restartMsg} Will re-pause when extra budget is consumed.`,
        restarted,
        extraBudget,
        period: pausedPeriod,
    };
}

/**
 * Update budget config and re-evaluate immediately.
 * Starts or stops the background monitor based on the enabled flag.
 * Pause state is protected -- cannot be overridden through config update.
 * @param updates - Partial budget config to merge
 * @returns The merged and saved budget configuration
 */
export async function updateBudgetConfig(updates: Partial<BudgetConfig>): Promise<BudgetConfig> {
    const current = await loadBudgetConfig();
    const merged: BudgetConfig = {
        ...current,
        ...updates,
        limits: { ...current.limits, ...(updates.limits || {}) },
        // Don't allow overriding pause state through config update
        pausedByBudget: current.pausedByBudget,
        pausedAt: current.pausedAt,
        pausedPeriod: current.pausedPeriod,
    };
    await saveBudgetConfig(merged);

    // Start or stop the background monitor as needed
    if (merged.enabled && !_monitorInterval) {
        _monitorInterval = setInterval(monitorTick, RC.intervals.budgetMonitorMs);
        console.log('[budget] Monitor started (enabled via API)');
    } else if (!merged.enabled && _monitorInterval) {
        clearInterval(_monitorInterval);
        _monitorInterval = null;
        console.log('[budget] Monitor stopped (disabled via API)');
    }

    // Re-evaluate immediately
    await monitorTick();

    return merged;
}

// =============================================================================
// BACKGROUND MONITOR
// =============================================================================

/**
 * Background monitor tick -- runs every 10s to check costs against limits.
 * Detects transitions between exceeded/normal states and pauses/resumes services accordingly.
 * Emits warning events when utilization crosses the warning threshold.
 */
async function monitorTick(): Promise<void> {
    try {
        const cfg = await loadBudgetConfig();
        _config = cfg;

        if (!cfg.enabled) {
            if (_exceeded) {
                _exceeded = false;
                await resumeServices();
            }
            return;
        }

        const costs = await getCosts();
        const status = evaluateStatus(cfg, costs);
        _lastStatus = status;

        const wasExceeded = _exceeded;

        if (!wasExceeded && status.exceeded) {
            _exceeded = true;
            await pauseServices(status.exceededPeriod!);
        } else if (wasExceeded && !status.exceeded) {
            _exceeded = false;
            await resumeServices();
        }

        // Emit warning events (only on transition, not every tick)
        if (status.warning && status.warningPeriods.length > 0 && !wasExceeded) {
            emitActivity('system', 'budget_warning',
                `Approaching budget limit: ${status.warningPeriods.join(', ')}`,
                { periods: status.warningPeriods, utilization: status.utilization },
            );
        }
    } catch (err: any) {
        console.error(`[budget] Monitor error: ${err.message}`);
    }
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/**
 * Initialize the budget system at server startup. Loads saved config from the settings
 * table, recovers any persisted pause state from a previous session (auto-clearing if
 * the exceeded period has rolled over), runs an initial cost check, and starts the
 * background monitor on a 10-second interval.
 */
export async function initBudgetSystem(): Promise<void> {
    const cfg = await loadBudgetConfig();
    _config = cfg;

    if (!cfg.enabled) {
        console.log('  - Budget control: disabled');
        return;
    }

    // Recover pause state from previous session
    if (cfg.pausedByBudget) {
        const costs = await getCosts();
        const status = evaluateStatus(cfg, costs);
        if (status.exceeded) {
            _exceeded = true;
            console.log(`  ! Budget control: PAUSED (${cfg.pausedPeriod} limit exceeded)`);
        } else {
            // Period rolled over — clear pause
            _exceeded = false;
            await saveBudgetConfig({ ...cfg, pausedByBudget: false, pausedAt: null, pausedPeriod: null });
            console.log('  ✓ Budget control: enabled (previously paused, now within limits)');
        }
    } else {
        // Fresh start — run initial check
        await monitorTick();
        console.log(`  ✓ Budget control: enabled${_exceeded ? ' (PAUSED)' : ''}`);
    }

    // Start background monitor (10-second interval)
    _monitorInterval = setInterval(monitorTick, RC.intervals.budgetMonitorMs);
}

/** Stop budget monitor — call during graceful shutdown. */
export function stopBudgetSystem(): void {
    if (_monitorInterval) {
        clearInterval(_monitorInterval);
        _monitorInterval = null;
    }
}
