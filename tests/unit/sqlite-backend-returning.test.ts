/**
 * Unit tests for db/sqlite-backend-returning.ts — RETURNING clause emulation.
 * Mocks better-sqlite3 Database and db/sql.ts translate to test INSERT/UPDATE/DELETE
 * RETURNING dispatch and row retrieval logic.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock translate to pass through (identity transform for test simplicity)
jest.unstable_mockModule('../../db/sql.js', () => ({
    translate: jest.fn((sql: string, params: any[]) => ({ sql, params })),
}));

const {
    handleReturning,
    handleInsertReturning,
    handleUpdateReturning,
    handleDeleteReturning,
    countPlaceholders,
} = await import('../../db/sqlite-backend-returning.js');

// ---------- helpers ----------

function makeMockDb(overrides: Record<string, any> = {}) {
    const stmtRun = jest.fn<any>().mockReturnValue({ changes: 1, lastInsertRowid: 99 });
    const stmtGet = jest.fn<any>().mockReturnValue({ id: 'abc', name: 'test' });
    const stmtAll = jest.fn<any>().mockReturnValue([{ id: 'abc', name: 'test' }]);

    const prepare = jest.fn<any>().mockReturnValue({
        run: overrides.run ?? stmtRun,
        get: overrides.get ?? stmtGet,
        all: overrides.all ?? stmtAll,
    });

    return { prepare, _stmtRun: stmtRun, _stmtGet: stmtGet, _stmtAll: stmtAll };
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------- countPlaceholders ----------

describe('countPlaceholders', () => {
    it('counts question marks in SQL', () => {
        expect(countPlaceholders('WHERE a = ? AND b = ?')).toBe(2);
    });

    it('returns 0 for no placeholders', () => {
        expect(countPlaceholders('SELECT 1')).toBe(0);
    });

    it('returns 0 for empty string', () => {
        expect(countPlaceholders('')).toBe(0);
    });

    it('counts single placeholder', () => {
        expect(countPlaceholders('WHERE id = ?')).toBe(1);
    });

    it('handles placeholders in complex SQL', () => {
        const sql = 'UPDATE t SET a = ?, b = ? WHERE id = ? AND status IN (?, ?)';
        expect(countPlaceholders(sql)).toBe(5);
    });
});

// ---------- handleInsertReturning ----------

describe('handleInsertReturning', () => {
    it('runs INSERT and returns the inserted row via lastInsertRowid', () => {
        const db = makeMockDb();
        const rows = handleInsertReturning(db as any, 'INSERT INTO nodes (name) VALUES (?)', ['test'], '*');

        expect(db.prepare).toHaveBeenCalledTimes(2); // INSERT + SELECT
        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('throws on unparseable INSERT', () => {
        const db = makeMockDb();
        expect(() => handleInsertReturning(db as any, 'GIBBERISH', [], '*')).toThrow(
            'Could not parse table name from INSERT'
        );
    });

    it('returns empty array when no rows changed', () => {
        const db = makeMockDb({
            run: jest.fn<any>().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
        });
        const rows = handleInsertReturning(db as any, 'INSERT INTO nodes (name) VALUES (?)', ['test'], '*');
        expect(rows).toEqual([]);
    });

    it('returns empty array when row not found after insert', () => {
        const db = makeMockDb({
            get: jest.fn<any>().mockReturnValue(undefined),
        });
        const rows = handleInsertReturning(db as any, 'INSERT INTO nodes (name) VALUES (?)', ['test'], '*');
        expect(rows).toEqual([]);
    });

    it('handles INSERT OR REPLACE syntax', () => {
        const db = makeMockDb();
        const rows = handleInsertReturning(
            db as any,
            'INSERT OR REPLACE INTO nodes (name) VALUES (?)',
            ['test'],
            'id, name'
        );
        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('uses specific columns when not *', () => {
        const db = makeMockDb();
        handleInsertReturning(db as any, 'INSERT INTO nodes (name) VALUES (?)', ['test'], 'id, name');
        // Second prepare call should use the specific columns
        const selectCall = db.prepare.mock.calls[1][0] as string;
        expect(selectCall).toContain('id, name');
    });
});

// ---------- handleUpdateReturning ----------

describe('handleUpdateReturning', () => {
    it('pre-selects affected IDs, runs UPDATE, and returns updated rows', () => {
        const db = makeMockDb();
        const rows = handleUpdateReturning(
            db as any,
            'UPDATE nodes SET name = ? WHERE id = ?',
            ['newname', 'abc'],
            '*'
        );

        // Should call prepare 3 times: pre-select IDs, UPDATE, post-select rows
        expect(db.prepare).toHaveBeenCalledTimes(3);
        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('throws on unparseable UPDATE', () => {
        const db = makeMockDb();
        expect(() => handleUpdateReturning(db as any, 'GIBBERISH', [], '*')).toThrow(
            'Could not parse table name from UPDATE'
        );
    });

    it('returns empty array when no WHERE clause', () => {
        const db = makeMockDb();
        const rows = handleUpdateReturning(
            db as any,
            'UPDATE nodes SET name = ?',
            ['newname'],
            '*'
        );
        // No WHERE → no pre-select → empty result after update
        expect(rows).toEqual([]);
    });

    it('returns empty array when pre-select finds no IDs', () => {
        const db = makeMockDb({
            all: jest.fn<any>().mockReturnValue([]),
        });
        const rows = handleUpdateReturning(
            db as any,
            'UPDATE nodes SET name = ? WHERE id = ?',
            ['newname', 'abc'],
            '*'
        );
        expect(rows).toEqual([]);
    });

    it('handles pre-select failure gracefully', () => {
        let callCount = 0;
        const db = makeMockDb();
        db.prepare = jest.fn<any>().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // Pre-select throws
                return {
                    all: jest.fn<any>().mockImplementation(() => { throw new Error('no such column'); }),
                };
            }
            // UPDATE run
            return { run: jest.fn<any>().mockReturnValue({ changes: 1 }) };
        });

        const rows = handleUpdateReturning(
            db as any,
            'UPDATE nodes SET name = ? WHERE id = ?',
            ['newname', 'abc'],
            '*'
        );
        expect(rows).toEqual([]);
    });
});

// ---------- handleDeleteReturning ----------

describe('handleDeleteReturning', () => {
    it('captures rows before deletion and returns them', () => {
        const db = makeMockDb();
        const rows = handleDeleteReturning(
            db as any,
            'DELETE FROM nodes WHERE id = ?',
            ['abc'],
            '*'
        );

        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('throws on unparseable DELETE', () => {
        const db = makeMockDb();
        expect(() => handleDeleteReturning(db as any, 'GIBBERISH', [], '*')).toThrow(
            'Could not parse table name from DELETE'
        );
    });

    it('captures all rows when no WHERE clause', () => {
        const db = makeMockDb();
        const rows = handleDeleteReturning(
            db as any,
            'DELETE FROM nodes',
            [],
            '*'
        );
        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('handles pre-select failure with WHERE clause gracefully', () => {
        let callCount = 0;
        const db = makeMockDb();
        db.prepare = jest.fn<any>().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return {
                    all: jest.fn<any>().mockImplementation(() => { throw new Error('fail'); }),
                };
            }
            return { run: jest.fn<any>().mockReturnValue({ changes: 1 }) };
        });

        const rows = handleDeleteReturning(
            db as any,
            'DELETE FROM nodes WHERE id = ?',
            ['abc'],
            '*'
        );
        expect(rows).toEqual([]);
    });

    it('handles pre-select failure without WHERE clause gracefully', () => {
        let callCount = 0;
        const db = makeMockDb();
        db.prepare = jest.fn<any>().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return {
                    all: jest.fn<any>().mockImplementation(() => { throw new Error('fail'); }),
                };
            }
            return { run: jest.fn<any>().mockReturnValue({ changes: 1 }) };
        });

        const rows = handleDeleteReturning(
            db as any,
            'DELETE FROM nodes',
            [],
            '*'
        );
        expect(rows).toEqual([]);
    });

    it('uses specific columns in pre-select', () => {
        const db = makeMockDb();
        handleDeleteReturning(db as any, 'DELETE FROM nodes WHERE id = ?', ['abc'], 'id, name');
        const selectCall = db.prepare.mock.calls[0][0] as string;
        expect(selectCall).toContain('id, name');
    });
});

// ---------- handleReturning (dispatcher) ----------

describe('handleReturning', () => {
    it('dispatches INSERT to handleInsertReturning', () => {
        const db = makeMockDb();
        const sql = 'INSERT INTO nodes (name) VALUES (?) RETURNING *';
        const match = sql.match(/RETURNING\s+(.+)$/i)!;
        const rows = handleReturning(db as any, sql, ['test'], match);
        expect(rows).toEqual([{ id: 'abc', name: 'test' }]);
    });

    it('dispatches UPDATE to handleUpdateReturning', () => {
        const db = makeMockDb();
        const sql = 'UPDATE nodes SET name = ? WHERE id = ? RETURNING *';
        const match = sql.match(/RETURNING\s+(.+)$/i)!;
        const rows = handleReturning(db as any, sql, ['newname', 'abc'], match);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('dispatches DELETE to handleDeleteReturning', () => {
        const db = makeMockDb();
        const sql = 'DELETE FROM nodes WHERE id = ? RETURNING *';
        const match = sql.match(/RETURNING\s+(.+)$/i)!;
        const rows = handleReturning(db as any, sql, ['abc'], match);
        expect(Array.isArray(rows)).toBe(true);
    });

    it('falls back to plain run for unrecognized DML', () => {
        const db = makeMockDb();
        const sql = 'MERGE INTO nodes RETURNING *';
        const match = sql.match(/RETURNING\s+(.+)$/i)!;
        const rows = handleReturning(db as any, sql, [], match);
        expect(rows).toEqual([]);
    });
});
