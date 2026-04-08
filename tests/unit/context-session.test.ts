/**
 * Tests for context/session.ts — session CRUD, getOrCreate, listing, cleanup, clearAll.
 *
 * Mocks: uuid, context/types.js (getConfig), context/feedback.js (persistSessionInsights).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

let uuidCounter = 0;
const mockPersistSessionInsights = jest.fn<(session: any) => Promise<void>>();

let mockSessionTTLMs = 3600000;
let mockCleanupInterval = 600000;

jest.unstable_mockModule('uuid', () => ({
    v4: () => `uuid-${++uuidCounter}`,
}));

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: () => ({
        sessionTTLMs: mockSessionTTLMs,
        sessionCleanupIntervalMs: mockCleanupInterval,
    }),
}));

jest.unstable_mockModule('../../context/feedback.js', () => ({
    persistSessionInsights: mockPersistSessionInsights,
}));

const {
    createSession,
    getSession,
    getOrCreateSession,
    listSessions,
    deleteSession,
    cleanupSessions,
    clearAllSessions,
} = await import('../../context/session.js');

beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
    mockSessionTTLMs = 3600000;
    // Clear all sessions between tests
    clearAllSessions();
});

// ─── createSession ───────────────────────────────────────────────────────────

describe('createSession', () => {
    it('creates a session with provided id', () => {
        const s = createSession('my-session');
        expect(s.id).toBe('my-session');
        expect(s.turnCount).toBe(0);
        expect(s.topics).toEqual([]);
        expect(s.domains).toEqual([]);
        expect(s.history).toEqual([]);
        expect(s.compressedHistory).toBeNull();
        expect(s.compressedUpTo).toBe(0);
        expect(s.lastContext).toBeNull();
        expect(s.lastDeliveredNodeIds).toEqual([]);
        expect(s.lastFeedback).toBeNull();
        expect(s.metrics.knowledgeUtilization).toEqual([]);
        expect(s.metrics.responseGrounding).toEqual([]);
        expect(s.metrics.topicCoverage).toEqual([]);
        expect(s.metrics.budgetEfficiency).toEqual([]);
        expect(s.metrics.qualityScores).toEqual([]);
    });

    it('generates UUID when id is null', () => {
        const s = createSession(null);
        expect(s.id).toBe('uuid-1');
    });

    it('generates UUID when id is omitted', () => {
        const s = createSession();
        expect(s.id).toBe('uuid-1');
    });

    it('sets createdAt and lastActiveAt to current time', () => {
        const before = Date.now();
        const s = createSession('ts-test');
        const after = Date.now();
        expect(s.createdAt).toBeGreaterThanOrEqual(before);
        expect(s.createdAt).toBeLessThanOrEqual(after);
        expect(s.lastActiveAt).toBeGreaterThanOrEqual(before);
        expect(s.lastActiveAt).toBeLessThanOrEqual(after);
    });

    it('stores session so getSession can retrieve it', () => {
        createSession('stored');
        expect(getSession('stored')).not.toBeNull();
    });
});

// ─── getSession ──────────────────────────────────────────────────────────────

describe('getSession', () => {
    it('returns null for nonexistent session', () => {
        expect(getSession('nonexistent')).toBeNull();
    });

    it('returns session and bumps lastActiveAt', () => {
        const s = createSession('bump-test');
        const originalActive = s.lastActiveAt;
        // Small delay to ensure timestamp difference
        const retrieved = getSession('bump-test');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe('bump-test');
        expect(retrieved!.lastActiveAt).toBeGreaterThanOrEqual(originalActive);
    });
});

// ─── getOrCreateSession ──────────────────────────────────────────────────────

describe('getOrCreateSession', () => {
    it('returns existing session if found', () => {
        const created = createSession('existing');
        created.turnCount = 42;
        const retrieved = getOrCreateSession('existing');
        expect(retrieved.turnCount).toBe(42);
    });

    it('creates new session if not found', () => {
        const s = getOrCreateSession('brand-new');
        expect(s.id).toBe('brand-new');
        expect(s.turnCount).toBe(0);
    });
});

// ─── listSessions ────────────────────────────────────────────────────────────

describe('listSessions', () => {
    it('returns empty array when no sessions exist', () => {
        expect(listSessions()).toEqual([]);
    });

    it('returns summary of all sessions', () => {
        const s1 = createSession('s1');
        s1.turnCount = 3;
        s1.topics = [
            { term: 'alpha', weight: 1 },
            { term: 'beta', weight: 0.5 },
        ];
        s1.domains = ['domain-a'];

        createSession('s2');

        const list = listSessions();
        expect(list).toHaveLength(2);

        const item1 = list.find((s: any) => s.id === 's1');
        expect(item1).toBeDefined();
        expect(item1.turnCount).toBe(3);
        expect(item1.topics).toEqual(['alpha', 'beta']);
        expect(item1.domains).toEqual(['domain-a']);
    });

    it('truncates topics to first 5', () => {
        const s = createSession('many-topics');
        s.topics = Array.from({ length: 10 }, (_, i) => ({ term: `t${i}`, weight: 1 }));

        const list = listSessions();
        const item = list.find((l: any) => l.id === 'many-topics');
        expect(item.topics).toHaveLength(5);
        expect(item.topics).toEqual(['t0', 't1', 't2', 't3', 't4']);
    });
});

// ─── deleteSession ───────────────────────────────────────────────────────────

describe('deleteSession', () => {
    it('returns true when session exists and is deleted', () => {
        createSession('to-delete');
        expect(deleteSession('to-delete')).toBe(true);
        expect(getSession('to-delete')).toBeNull();
    });

    it('returns false when session does not exist', () => {
        expect(deleteSession('nonexistent')).toBe(false);
    });
});

// ─── clearAllSessions ────────────────────────────────────────────────────────

describe('clearAllSessions', () => {
    it('removes all sessions', () => {
        createSession('a');
        createSession('b');
        createSession('c');
        expect(listSessions()).toHaveLength(3);

        clearAllSessions();
        expect(listSessions()).toEqual([]);
    });
});

// ─── cleanupSessions ────────────────────────────────────────────────────────

describe('cleanupSessions', () => {
    it('returns 0 when no sessions are expired', () => {
        createSession('fresh');
        expect(cleanupSessions()).toBe(0);
    });

    it('removes sessions older than TTL and returns count', () => {
        const s = createSession('old-session');
        // Set lastActiveAt to well past TTL
        s.lastActiveAt = Date.now() - mockSessionTTLMs - 1000;

        createSession('new-session');

        mockPersistSessionInsights.mockResolvedValue(undefined);
        const cleaned = cleanupSessions();
        expect(cleaned).toBe(1);
        expect(getSession('old-session')).toBeNull();
        expect(getSession('new-session')).not.toBeNull();
    });

    it('calls persistSessionInsights before deleting expired sessions', () => {
        const s = createSession('persist-test');
        s.lastActiveAt = Date.now() - mockSessionTTLMs - 5000;

        mockPersistSessionInsights.mockResolvedValue(undefined);
        cleanupSessions();

        expect(mockPersistSessionInsights).toHaveBeenCalledTimes(1);
        expect(mockPersistSessionInsights).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'persist-test' })
        );
    });

    it('handles persistSessionInsights rejection gracefully', () => {
        const s = createSession('fail-persist');
        s.lastActiveAt = Date.now() - mockSessionTTLMs - 1000;

        mockPersistSessionInsights.mockRejectedValue(new Error('DB error'));
        // Should not throw
        const cleaned = cleanupSessions();
        expect(cleaned).toBe(1);
        expect(getSession('fail-persist')).toBeNull();
    });

    it('cleans multiple expired sessions', () => {
        for (let i = 0; i < 5; i++) {
            const s = createSession(`expired-${i}`);
            s.lastActiveAt = Date.now() - mockSessionTTLMs - 1000;
        }
        createSession('alive');

        mockPersistSessionInsights.mockResolvedValue(undefined);
        const cleaned = cleanupSessions();
        expect(cleaned).toBe(5);
        expect(listSessions()).toHaveLength(1);
        expect(getSession('alive')).not.toBeNull();
    });

    it('returns 0 when no sessions exist', () => {
        expect(cleanupSessions()).toBe(0);
    });

    it('respects configurable TTL', () => {
        mockSessionTTLMs = 1000; // 1 second
        const s = createSession('short-ttl');
        s.lastActiveAt = Date.now() - 2000; // 2 seconds ago

        mockPersistSessionInsights.mockResolvedValue(undefined);
        expect(cleanupSessions()).toBe(1);
    });
});
