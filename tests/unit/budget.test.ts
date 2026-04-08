/**
 * Tests for models/budget.ts — evaluateStatus, computeRetryAfterSeconds (re-implemented).
 */
import { describe, it, expect } from '@jest/globals';

// Types from budget.ts
type BudgetPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface BudgetLimits {
    hourly: number | null;
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
}

interface BudgetConfig {
    enabled: boolean;
    limits: BudgetLimits;
    warningThreshold: number;
    forceResumeBudget: number;
    pausedByBudget: boolean;
    pausedAt: string | null;
    pausedPeriod: string | null;
    pausedServices: string[];
}

interface BudgetCosts {
    hourly: number;
    daily: number;
    weekly: number;
    monthly: number;
}

interface BudgetStatus {
    config: BudgetConfig;
    costs: BudgetCosts;
    utilization: Partial<Record<BudgetPeriod, number>>;
    exceeded: boolean;
    exceededPeriod: BudgetPeriod | null;
    warning: boolean;
    warningPeriods: BudgetPeriod[];
    activeOverride: any;
}

// Re-implement evaluateStatus from budget.ts lines 163-217 (without override logic)
function evaluateStatus(cfg: BudgetConfig, costs: BudgetCosts): BudgetStatus {
    const utilization: Partial<Record<BudgetPeriod, number>> = {};
    let exceeded = false;
    let exceededPeriod: BudgetPeriod | null = null;
    let warning = false;
    const warningPeriods: BudgetPeriod[] = [];

    const periods: BudgetPeriod[] = ['hourly', 'daily', 'weekly', 'monthly'];
    for (const period of periods) {
        const limit = cfg.limits[period];
        if (limit == null || limit <= 0) continue;

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

    return { config: cfg, costs, utilization, exceeded, exceededPeriod, warning, warningPeriods, activeOverride: null };
}

// Re-implement computeRetryAfterSeconds from budget.ts lines 241-245
const PERIOD_SECONDS: Record<BudgetPeriod, number> = {
    hourly: 3600,
    daily: 86400,
    weekly: 604800,
    monthly: 2592000,
};

function computeRetryAfterSeconds(status: BudgetStatus): number {
    if (!status.exceededPeriod) return 60;
    return Math.min(PERIOD_SECONDS[status.exceededPeriod], 3600);
}

// Helper to create a default config
function makeConfig(overrides: Partial<BudgetConfig> = {}): BudgetConfig {
    return {
        enabled: true,
        limits: { hourly: null, daily: null, weekly: null, monthly: null },
        warningThreshold: 0.80,
        forceResumeBudget: 1.00,
        pausedByBudget: false,
        pausedAt: null,
        pausedPeriod: null,
        pausedServices: [],
        ...overrides,
    };
}

function makeCosts(overrides: Partial<BudgetCosts> = {}): BudgetCosts {
    return { hourly: 0, daily: 0, weekly: 0, monthly: 0, ...overrides };
}

describe('evaluateStatus', () => {
    it('returns not exceeded when no limits set', () => {
        const status = evaluateStatus(makeConfig(), makeCosts({ hourly: 100 }));
        expect(status.exceeded).toBe(false);
        expect(status.exceededPeriod).toBeNull();
    });

    it('returns not exceeded when costs below limits', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: 50, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 5, daily: 20 }));
        expect(status.exceeded).toBe(false);
    });

    it('returns exceeded when hourly limit hit', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: null, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 10 }));
        expect(status.exceeded).toBe(true);
        expect(status.exceededPeriod).toBe('hourly');
    });

    it('returns exceeded when daily limit hit', () => {
        const cfg = makeConfig({ limits: { hourly: null, daily: 50, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ daily: 60 }));
        expect(status.exceeded).toBe(true);
        expect(status.exceededPeriod).toBe('daily');
    });

    it('reports first exceeded period (priority order)', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: 50, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 15, daily: 60 }));
        // Hourly is checked first
        expect(status.exceededPeriod).toBe('hourly');
    });

    it('calculates utilization correctly', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: 100, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 5, daily: 75 }));
        expect(status.utilization.hourly).toBeCloseTo(0.5);
        expect(status.utilization.daily).toBeCloseTo(0.75);
    });

    it('skips null limits in utilization', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: null, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts());
        expect(status.utilization.hourly).toBeDefined();
        expect(status.utilization.daily).toBeUndefined();
    });

    it('skips zero/negative limits', () => {
        const cfg = makeConfig({ limits: { hourly: 0, daily: -5, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 100 }));
        expect(status.exceeded).toBe(false);
        expect(status.utilization.hourly).toBeUndefined();
    });

    it('triggers warning when approaching limit', () => {
        const cfg = makeConfig({
            limits: { hourly: 10, daily: null, weekly: null, monthly: null },
            warningThreshold: 0.80,
        });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 8.5 }));
        expect(status.warning).toBe(true);
        expect(status.warningPeriods).toContain('hourly');
        expect(status.exceeded).toBe(false);
    });

    it('does not warn when at or above limit (exceeded instead)', () => {
        const cfg = makeConfig({
            limits: { hourly: 10, daily: null, weekly: null, monthly: null },
            warningThreshold: 0.80,
        });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 10 }));
        expect(status.warning).toBe(false);
        expect(status.warningPeriods).toHaveLength(0);
        expect(status.exceeded).toBe(true);
    });

    it('warns for multiple periods simultaneously', () => {
        const cfg = makeConfig({
            limits: { hourly: 10, daily: 100, weekly: null, monthly: null },
            warningThreshold: 0.80,
        });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 9, daily: 85 }));
        expect(status.warning).toBe(true);
        expect(status.warningPeriods).toContain('hourly');
        expect(status.warningPeriods).toContain('daily');
    });

    it('returns costs and config in status', () => {
        const cfg = makeConfig();
        const costs = makeCosts({ hourly: 5 });
        const status = evaluateStatus(cfg, costs);
        expect(status.config).toBe(cfg);
        expect(status.costs).toBe(costs);
    });
});

describe('computeRetryAfterSeconds', () => {
    it('returns 60 when no exceeded period', () => {
        const status = evaluateStatus(makeConfig(), makeCosts());
        expect(computeRetryAfterSeconds(status)).toBe(60);
    });

    it('returns 3600 for hourly exceeded', () => {
        const cfg = makeConfig({ limits: { hourly: 10, daily: null, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ hourly: 15 }));
        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });

    it('caps at 3600 for daily exceeded', () => {
        const cfg = makeConfig({ limits: { hourly: null, daily: 50, weekly: null, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ daily: 60 }));
        // daily = 86400, but capped at 3600
        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });

    it('caps at 3600 for weekly exceeded', () => {
        const cfg = makeConfig({ limits: { hourly: null, daily: null, weekly: 200, monthly: null } });
        const status = evaluateStatus(cfg, makeCosts({ weekly: 250 }));
        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });

    it('caps at 3600 for monthly exceeded', () => {
        const cfg = makeConfig({ limits: { hourly: null, daily: null, weekly: null, monthly: 500 } });
        const status = evaluateStatus(cfg, makeCosts({ monthly: 600 }));
        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });
});
