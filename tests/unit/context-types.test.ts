/**
 * Tests for context/types.ts — getConfig, estimateTokens, getBudgets, getDynamicBudgets, getModelProfiles.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockContextEngine: Record<string, any> = {};

function resetConfig() {
    Object.keys(mockContextEngine).forEach(k => delete mockContextEngine[k]);
    Object.assign(mockContextEngine, {
        totalBudget: 4000,
        allocation: {
            knowledge: 0.4,
            history: 0.3,
            systemPrompt: 0.2,
            response: 0.1,
        },
        stopWords: ['the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'],
        modelProfiles: {
            small: { label: 'Small', contextWindow: 4096, budgetMultiplier: 0.5, preferCompressed: true, maxKnowledgeNodes: 5, historyTurns: 5 },
            medium: { label: 'Medium', contextWindow: 8192, budgetMultiplier: 1.0, preferCompressed: false, maxKnowledgeNodes: 10, historyTurns: 10 },
            large: { label: 'Large', contextWindow: 65000, budgetMultiplier: 4.0, preferCompressed: false, maxKnowledgeNodes: 30, historyTurns: 50 },
        },
        dynamicBudget: {
            enabled: true,
            depthCeiling: 20,
            newProfile: {
                knowledge: 0.55,
                history: 0.05,
                systemPrompt: 0.15,
                response: 0.25,
            },
            deepProfile: {
                knowledge: 0.25,
                history: 0.45,
                systemPrompt: 0.10,
                response: 0.20,
            },
        },
    });
}

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        get contextEngine() { return mockContextEngine; },
    },
}));

const { getConfig, estimateTokens, getBudgets, getDynamicBudgets, getModelProfiles } =
    await import('../../context/types.js');

beforeEach(() => {
    jest.clearAllMocks();
    resetConfig();
});

// ─── getConfig ───────────────────────────────────────────────────────────────

describe('getConfig', () => {
    it('returns the contextEngine config block', () => {
        const cfg = getConfig();
        expect(cfg.totalBudget).toBe(4000);
        expect(cfg.allocation.knowledge).toBe(0.4);
    });

    it('reflects live config changes', () => {
        mockContextEngine.totalBudget = 9999;
        expect(getConfig().totalBudget).toBe(9999);
    });
});

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
    it('estimates ~4 chars per token', () => {
        expect(estimateTokens('1234')).toBe(1);
        expect(estimateTokens('12345678')).toBe(2);
    });

    it('rounds up', () => {
        expect(estimateTokens('12345')).toBe(2); // 5/4 = 1.25 -> ceil -> 2
    });

    it('returns 0 for empty string', () => {
        expect(estimateTokens('')).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
        expect(estimateTokens(null as any)).toBe(0);
        expect(estimateTokens(undefined as any)).toBe(0);
    });

    it('handles long text', () => {
        const text = 'a'.repeat(1000);
        expect(estimateTokens(text)).toBe(250);
    });

    it('handles text with spaces', () => {
        expect(estimateTokens('hello world')).toBe(3); // 11/4 = 2.75 -> ceil -> 3
    });
});

// ─── getBudgets ──────────────────────────────────────────────────────────────

describe('getBudgets', () => {
    it('returns correct budget allocations', () => {
        const budgets = getBudgets();
        expect(budgets.total).toBe(4000);
        expect(budgets.knowledge).toBe(1600); // 4000 * 0.4
        expect(budgets.history).toBe(1200);   // 4000 * 0.3
        expect(budgets.systemPrompt).toBe(800); // 4000 * 0.2
        expect(budgets.response).toBe(400);   // 4000 * 0.1
    });

    it('budget parts sum to total', () => {
        const budgets = getBudgets();
        expect(budgets.knowledge + budgets.history + budgets.systemPrompt + budgets.response)
            .toBe(budgets.total);
    });
});

// ─── getModelProfiles ────────────────────────────────────────────────────────

describe('getModelProfiles', () => {
    it('returns configured model profiles', () => {
        const profiles = getModelProfiles();
        expect(profiles.small.label).toBe('Small');
        expect(profiles.small.contextWindow).toBe(4096);
        expect(profiles.medium.maxKnowledgeNodes).toBe(10);
    });
});

// ─── getDynamicBudgets ───────────────────────────────────────────────────────

describe('getDynamicBudgets', () => {
    it('returns static budgets when session is null', () => {
        const b = getDynamicBudgets(null);
        expect(b.total).toBe(4000);
        expect(b.knowledge).toBe(1600);
    });

    it('returns static budgets when session is omitted (default param)', () => {
        const b = getDynamicBudgets();
        expect(b.total).toBe(4000);
    });

    it('returns static budgets when dynamicBudget is disabled', () => {
        mockContextEngine.dynamicBudget.enabled = false;
        const session = { turnCount: 10, _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        expect(b.total).toBe(4000);
        expect(b.knowledge).toBe(1600);
    });

    it('returns static budgets when dynamicBudget config is null', () => {
        mockContextEngine.dynamicBudget = null;
        const session = { turnCount: 5 };
        const b = getDynamicBudgets(session);
        expect(b.total).toBe(4000);
    });

    it('returns static budgets when dynamicBudget config is undefined', () => {
        delete mockContextEngine.dynamicBudget;
        const session = { turnCount: 5 };
        const b = getDynamicBudgets(session);
        expect(b.total).toBe(4000);
    });

    it('interpolates at depth=0 using only newProfile', () => {
        const session = { turnCount: 0, _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        // t = 0, medium multiplier = 1.0, total = 4000
        expect(b.total).toBe(4000);
        expect(b.knowledge).toBe(Math.floor(4000 * 0.55));   // 2200
        expect(b.history).toBe(Math.floor(4000 * 0.05));      // 200
        expect(b.systemPrompt).toBe(Math.floor(4000 * 0.15)); // 600
        expect(b.response).toBe(Math.floor(4000 * 0.25));     // 1000
    });

    it('interpolates at max depth using only deepProfile', () => {
        const session = { turnCount: 20, _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        // t = 1
        expect(b.knowledge).toBe(Math.floor(4000 * 0.25));
        expect(b.history).toBe(Math.floor(4000 * 0.45));
        expect(b.systemPrompt).toBe(Math.floor(4000 * 0.10));
        expect(b.response).toBe(Math.floor(4000 * 0.20));
    });

    it('interpolates at midpoint depth', () => {
        const session = { turnCount: 10, _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        // t = 0.5, knowledge: 0.55*0.5 + 0.25*0.5 = 0.40
        expect(b.knowledge).toBe(Math.floor(4000 * 0.40));
    });

    it('clamps depth beyond ceiling', () => {
        const session = { turnCount: 100, _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        // t = min(100/20, 1) = 1 => same as deepProfile
        expect(b.knowledge).toBe(Math.floor(4000 * 0.25));
        expect(b.history).toBe(Math.floor(4000 * 0.45));
    });

    it('applies model profile budgetMultiplier (large)', () => {
        const session = { turnCount: 0, _modelProfile: 'large' };
        const b = getDynamicBudgets(session);
        // large multiplier = 4.0 => total = 4000 * 4 = 16000
        expect(b.total).toBe(16000);
        expect(b.knowledge).toBe(Math.floor(16000 * 0.55));
    });

    it('applies model profile budgetMultiplier (small)', () => {
        const session = { turnCount: 0, _modelProfile: 'small' };
        const b = getDynamicBudgets(session);
        // small multiplier = 0.5 => total = 4000 * 0.5 = 2000
        expect(b.total).toBe(2000);
    });

    it('falls back to medium profile for unknown _modelProfile', () => {
        const session = { turnCount: 0, _modelProfile: 'nonexistent' };
        const b = getDynamicBudgets(session);
        // Falls back to medium (multiplier 1.0)
        expect(b.total).toBe(4000);
    });

    it('uses medium profile when _modelProfile is not set', () => {
        const session = { turnCount: 5 };
        const b = getDynamicBudgets(session);
        expect(b.total).toBe(4000); // medium multiplier 1.0
    });

    it('defaults turnCount to 0 when missing', () => {
        const session = { _modelProfile: 'medium' };
        const b = getDynamicBudgets(session);
        // depth = undefined || 0 => t = 0, newProfile
        expect(b.knowledge).toBe(Math.floor(4000 * 0.55));
    });
});
