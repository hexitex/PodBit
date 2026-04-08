/**
 * Unit tests for db/migrations/context.ts — runContextInitMigrations and runContextSchemaMigrations.
 * Uses a mock Database object to verify SQL execution for table creation.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { runContextInitMigrations, runContextSchemaMigrations } from '../../db/migrations/context.js';

// ---------- helpers ----------

function makeMockDb(opts: {
    hasSessionInsights?: boolean;
    hasSessionNodeUsage?: boolean;
    hasChatConversations?: boolean;
    hasSettingsTable?: boolean;
} = {}) {
    const {
        hasSessionInsights = false,
        hasSessionNodeUsage = false,
        hasChatConversations = false,
        hasSettingsTable = false,
    } = opts;

    const execCalls: string[] = [];

    const db = {
        exec: jest.fn<any>((sql: string) => { execCalls.push(sql); }),
        prepare: jest.fn<any>((sql: string) => {
            // session_insights existence check
            if (sql.match(/SELECT\s+id\s+FROM\s+session_insights/i)) {
                if (hasSessionInsights) {
                    return { get: jest.fn<any>().mockReturnValue({ id: 'x' }) };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => {
                        throw new Error('no such table: session_insights');
                    }),
                };
            }

            // session_node_usage existence check
            if (sql.match(/SELECT\s+id\s+FROM\s+session_node_usage/i)) {
                if (hasSessionNodeUsage) {
                    return { get: jest.fn<any>().mockReturnValue({ id: 'x' }) };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => {
                        throw new Error('no such table: session_node_usage');
                    }),
                };
            }

            // chat_conversations existence check
            if (sql.match(/SELECT\s+id\s+FROM\s+chat_conversations/i)) {
                if (hasChatConversations) {
                    return { get: jest.fn<any>().mockReturnValue({ id: 'x' }) };
                }
                return {
                    get: jest.fn<any>().mockImplementation(() => {
                        throw new Error('no such table: chat_conversations');
                    }),
                };
            }

            // sqlite_master check for settings table
            if (sql.match(/SELECT\s+name\s+FROM\s+sqlite_master.*settings/i)) {
                if (hasSettingsTable) {
                    return { get: jest.fn<any>().mockReturnValue({ name: 'settings' }) };
                }
                return { get: jest.fn<any>().mockReturnValue(undefined) };
            }

            return { get: jest.fn<any>(), run: jest.fn<any>(), all: jest.fn<any>() };
        }),
        _execCalls: execCalls,
    };

    return db;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------- tests ----------

describe('runContextInitMigrations', () => {
    describe('session_insights table', () => {
        it('creates session_insights table when missing', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS session_insights')
            );
            expect(createCall).toBeDefined();
        });

        it('creates indexes for session_insights', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('idx_session_insights_topic')
            );
            expect(createCall).toBeDefined();
            const domainIdx = db._execCalls.find((s: string) =>
                s.includes('idx_session_insights_domain')
            );
            expect(domainIdx).toBeDefined();
        });

        it('skips session_insights creation when table already exists', () => {
            const db = makeMockDb({ hasSessionInsights: true });
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS session_insights')
            );
            expect(createCall).toBeUndefined();
        });
    });

    describe('session_node_usage table', () => {
        it('creates session_node_usage table when missing', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS session_node_usage')
            );
            expect(createCall).toBeDefined();
        });

        it('creates index for session_node_usage', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('idx_session_node_usage_node')
            );
            expect(createCall).toBeDefined();
        });

        it('skips session_node_usage creation when table already exists', () => {
            const db = makeMockDb({ hasSessionNodeUsage: true });
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS session_node_usage')
            );
            expect(createCall).toBeUndefined();
        });
    });

    describe('chat_conversations table', () => {
        it('creates chat_conversations table when missing', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS chat_conversations')
            );
            expect(createCall).toBeDefined();
        });

        it('creates filtered index on chat_conversations', () => {
            const db = makeMockDb();
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('idx_chat_conversations_updated')
            );
            expect(createCall).toBeDefined();
        });

        it('skips chat_conversations creation when table already exists', () => {
            const db = makeMockDb({ hasChatConversations: true });
            runContextInitMigrations(db as any);
            const createCall = db._execCalls.find((s: string) =>
                s.includes('CREATE TABLE IF NOT EXISTS chat_conversations')
            );
            expect(createCall).toBeUndefined();
        });
    });

    it('creates all three tables on a fresh database', () => {
        const db = makeMockDb();
        runContextInitMigrations(db as any);
        expect(db._execCalls.length).toBe(3);
    });

    it('creates no tables when all exist', () => {
        const db = makeMockDb({
            hasSessionInsights: true,
            hasSessionNodeUsage: true,
            hasChatConversations: true,
        });
        runContextInitMigrations(db as any);
        expect(db._execCalls.length).toBe(0);
    });

    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runContextInitMigrations(db as any)).not.toThrow();
    });
});

describe('runContextSchemaMigrations', () => {
    it('creates settings table when missing', () => {
        const db = makeMockDb();
        runContextSchemaMigrations(db as any);
        const createCall = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS settings')
        );
        expect(createCall).toBeDefined();
    });

    it('skips settings table creation when it already exists', () => {
        const db = makeMockDb({ hasSettingsTable: true });
        runContextSchemaMigrations(db as any);
        const createCall = db._execCalls.find((s: string) =>
            s.includes('CREATE TABLE IF NOT EXISTS settings')
        );
        expect(createCall).toBeUndefined();
    });

    it('logs creation message when table is added', () => {
        const db = makeMockDb();
        runContextSchemaMigrations(db as any);
        expect(console.error).toHaveBeenCalledWith('[sqlite] Added settings table');
    });

    it('does not log when settings table already exists', () => {
        const db = makeMockDb({ hasSettingsTable: true });
        runContextSchemaMigrations(db as any);
        expect(console.error).not.toHaveBeenCalledWith('[sqlite] Added settings table');
    });

    it('does not throw on a fresh database', () => {
        const db = makeMockDb();
        expect(() => runContextSchemaMigrations(db as any)).not.toThrow();
    });
});
