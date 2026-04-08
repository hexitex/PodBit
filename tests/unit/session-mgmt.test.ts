/**
 * Tests for context/session.ts — createSession, getSession, getOrCreateSession, clearAllSessions.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('uuid', () => ({
    v4: jest.fn<any>().mockReturnValue('mock-uuid-1234'),
}));

jest.unstable_mockModule('../../context/types.js', () => ({
    getConfig: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule('../../context/feedback.js', () => ({
    persistSessionInsights: jest.fn<any>().mockResolvedValue(undefined),
}));

const { createSession, getSession, getOrCreateSession, clearAllSessions } = await import('../../context/session.js');

describe('createSession', () => {
    beforeEach(() => {
        clearAllSessions();
    });

    it('creates session with provided id', () => {
        const session = createSession('my-session');
        expect(session.id).toBe('my-session');
    });

    it('generates UUID when no id provided', () => {
        const session = createSession();
        expect(session.id).toBe('mock-uuid-1234');
    });

    it('initializes turnCount to 0', () => {
        const session = createSession('s1');
        expect(session.turnCount).toBe(0);
    });

    it('initializes empty topics array', () => {
        const session = createSession('s1');
        expect(session.topics).toEqual([]);
    });

    it('initializes empty domains array', () => {
        const session = createSession('s1');
        expect(session.domains).toEqual([]);
    });

    it('initializes empty history array', () => {
        const session = createSession('s1');
        expect(session.history).toEqual([]);
    });

    it('initializes compressedHistory as null', () => {
        const session = createSession('s1');
        expect(session.compressedHistory).toBeNull();
    });

    it('initializes lastContext as null', () => {
        const session = createSession('s1');
        expect(session.lastContext).toBeNull();
    });

    it('initializes metrics with empty arrays', () => {
        const session = createSession('s1');
        expect(session.metrics.knowledgeUtilization).toEqual([]);
        expect(session.metrics.responseGrounding).toEqual([]);
        expect(session.metrics.topicCoverage).toEqual([]);
        expect(session.metrics.budgetEfficiency).toEqual([]);
        expect(session.metrics.qualityScores).toEqual([]);
    });

    it('sets createdAt and lastActiveAt timestamps', () => {
        const before = Date.now();
        const session = createSession('s1');
        const after = Date.now();
        expect(session.createdAt).toBeGreaterThanOrEqual(before);
        expect(session.createdAt).toBeLessThanOrEqual(after);
        expect(session.lastActiveAt).toBeGreaterThanOrEqual(before);
    });

    it('stores session in session map (retrievable via getSession)', () => {
        createSession('stored-session');
        const retrieved = getSession('stored-session');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe('stored-session');
    });
});

describe('getSession', () => {
    beforeEach(() => {
        clearAllSessions();
    });

    it('returns null for non-existent session', () => {
        expect(getSession('nonexistent')).toBeNull();
    });

    it('returns session for existing id', () => {
        createSession('exists');
        expect(getSession('exists')).not.toBeNull();
    });

    it('updates lastActiveAt on access', async () => {
        const session = createSession('active');
        const firstAccess = session.lastActiveAt;
        await new Promise(r => setTimeout(r, 5));
        getSession('active');
        const retrieved = getSession('active');
        expect(retrieved!.lastActiveAt).toBeGreaterThanOrEqual(firstAccess);
    });

    it('returns the same session object', () => {
        const created = createSession('same');
        const retrieved = getSession('same');
        expect(retrieved).toBe(created);
    });
});

describe('getOrCreateSession', () => {
    beforeEach(() => {
        clearAllSessions();
    });

    it('creates new session when not found', () => {
        const session = getOrCreateSession('new-session');
        expect(session.id).toBe('new-session');
    });

    it('returns existing session when found', () => {
        const original = createSession('existing');
        original.turnCount = 5; // mark it
        const retrieved = getOrCreateSession('existing');
        expect(retrieved.turnCount).toBe(5);
    });

    it('does not create duplicate sessions', () => {
        getOrCreateSession('dup');
        getOrCreateSession('dup');
        const session = getSession('dup');
        expect(session).not.toBeNull();
        // Should be the same session, not overwritten
    });
});

describe('clearAllSessions', () => {
    it('removes all sessions from store', () => {
        createSession('a');
        createSession('b');
        createSession('c');
        clearAllSessions();
        expect(getSession('a')).toBeNull();
        expect(getSession('b')).toBeNull();
        expect(getSession('c')).toBeNull();
    });

    it('allows creating sessions after clear', () => {
        createSession('before');
        clearAllSessions();
        createSession('after');
        expect(getSession('after')).not.toBeNull();
        expect(getSession('before')).toBeNull();
    });
});
