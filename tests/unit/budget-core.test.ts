/**
 * Unit tests for models/budget.ts — budget control system.
 *
 * Focus on the testable exported functions: loadBudgetConfig, getBudgetStatus,
 * computeRetryAfterSeconds, updateBudgetConfig, isBudgetExceeded.
 *
 * Internal state (_exceeded, _costsCache, _override) persists across tests
 * since ESM module state cannot be reset. Tests are ordered carefully.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockEmitActivity = jest.fn();

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockQuery,
    systemQueryOne: mockQueryOne,
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));
// Mock core.js for pauseServices/resumeServices
jest.unstable_mockModule('../../core.js', () => ({
    getSynthesisStatus: jest.fn().mockReturnValue({ running: false }),
    stopSynthesisEngine: jest.fn(),
    cycleStates: {},
    stopCycle: jest.fn(),
    runSynthesisEngine: jest.fn().mockResolvedValue(undefined),
    startValidationCycle: jest.fn().mockResolvedValue(undefined),
    startQuestionCycle: jest.fn().mockResolvedValue(undefined),
    startTensionCycle: jest.fn().mockResolvedValue(undefined),
    startResearchCycle: jest.fn().mockResolvedValue(undefined),
    startAutoratingCycle: jest.fn().mockResolvedValue(undefined),
    startEvmCycle: jest.fn().mockResolvedValue(undefined),
}));

const {
    loadBudgetConfig,
    getBudgetStatus,
    computeRetryAfterSeconds,
    isBudgetExceeded,
    stopBudgetSystem,
} = await import('../../models/budget.js');

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

// Clean up any intervals
afterAll(() => {
    stopBudgetSystem();
});

describe('loadBudgetConfig', () => {
    it('returns defaults when no settings exist', async () => {
        mockQueryOne.mockResolvedValue(null);

        const cfg = await loadBudgetConfig();

        expect(cfg.enabled).toBe(false);
        expect(cfg.limits.hourly).toBeNull();
        expect(cfg.limits.daily).toBeNull();
        expect(cfg.warningThreshold).toBe(0.80);
    });

    it('merges saved config with defaults', async () => {
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({ enabled: true, limits: { daily: 5.0 } }),
        });

        const cfg = await loadBudgetConfig();

        expect(cfg.enabled).toBe(true);
        expect(cfg.limits.daily).toBe(5.0);
        expect(cfg.limits.hourly).toBeNull(); // default
        expect(cfg.warningThreshold).toBe(0.80); // default
    });

    it('handles corrupt JSON gracefully', async () => {
        mockQueryOne.mockResolvedValue({ value: 'not json' });

        const cfg = await loadBudgetConfig();

        expect(cfg.enabled).toBe(false); // falls back to defaults
    });

    it('handles query errors gracefully', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB down'));

        const cfg = await loadBudgetConfig();

        expect(cfg.enabled).toBe(false); // defaults
    });
});

describe('getBudgetStatus', () => {
    it('returns zero costs when disabled', async () => {
        mockQueryOne.mockResolvedValue(null); // no config = disabled

        const status = await getBudgetStatus();

        expect(status.exceeded).toBe(false);
        expect(status.costs.hourly).toBe(0);
        expect(status.costs.daily).toBe(0);
    });

    // NOTE: getCosts() has a 60s TTL cache that persists across tests.
    // Once costs are cached by an enabled-config test, subsequent tests
    // in the same run get the cached values. We test with consistent
    // cost expectations to avoid cache interference.

    it('detects exceeded budget when costs exceed limit', async () => {
        mockQueryOne.mockImplementation(async (sql: string) => {
            if (sql.includes('settings')) {
                return { value: JSON.stringify({ enabled: true, limits: { daily: 1.0 } }) };
            }
            // Cost query — $1.50 daily cost
            return { hourly_cost: 0.5, daily_cost: 1.5, weekly_cost: 1.5, monthly_cost: 1.5 };
        });

        const status = await getBudgetStatus();

        expect(status.exceeded).toBe(true);
        expect(status.exceededPeriod).toBe('daily');
    });

    it('returns status structure with all fields', async () => {
        mockQueryOne.mockResolvedValue(null); // disabled

        const status = await getBudgetStatus();

        expect(status).toHaveProperty('config');
        expect(status).toHaveProperty('costs');
        expect(status).toHaveProperty('utilization');
        expect(status).toHaveProperty('exceeded');
        expect(status).toHaveProperty('exceededPeriod');
        expect(status).toHaveProperty('warning');
        expect(status).toHaveProperty('warningPeriods');
        expect(status).toHaveProperty('activeOverride');
    });
});

describe('computeRetryAfterSeconds', () => {
    it('returns 60 when no period exceeded', () => {
        const status = {
            config: {} as any,
            costs: {} as any,
            utilization: {},
            exceeded: false,
            exceededPeriod: null,
            warning: false,
            warningPeriods: [],
            activeOverride: null,
        };

        expect(computeRetryAfterSeconds(status)).toBe(60);
    });

    it('returns hourly period seconds for hourly exceeded', () => {
        const status = {
            config: {} as any,
            costs: {} as any,
            utilization: {},
            exceeded: true,
            exceededPeriod: 'hourly' as const,
            warning: false,
            warningPeriods: [],
            activeOverride: null,
        };

        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });

    it('caps at 3600 for longer periods', () => {
        const status = {
            config: {} as any,
            costs: {} as any,
            utilization: {},
            exceeded: true,
            exceededPeriod: 'monthly' as const,
            warning: false,
            warningPeriods: [],
            activeOverride: null,
        };

        expect(computeRetryAfterSeconds(status)).toBe(3600);
    });
});

describe('isBudgetExceeded', () => {
    it('returns a boolean', () => {
        const result = isBudgetExceeded();
        expect(typeof result).toBe('boolean');
    });
});

describe('stopBudgetSystem', () => {
    it('can be called without error', () => {
        expect(() => stopBudgetSystem()).not.toThrow();
    });
});
