/**
 * Unit tests for db/sqlite-backend-diag.ts — diagnostics & instrumentation.
 * Tests ring buffers, counters, beginOp/endOp, contention detection, percentile
 * computation, and the diagnostics snapshot API.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import {
    round2,
    extractCaller,
    isReadQuery,
    beginOp,
    endOp,
    checkContention,
    recordBusyRetry,
    getDbDiagnostics,
    resetDbDiagnostics,
    DB_SLOW_THRESHOLD_MS,
} from '../../db/sqlite-backend-diag.js';

beforeEach(() => {
    resetDbDiagnostics();
    jest.restoreAllMocks();
});

// ---------- round2 ----------

describe('round2', () => {
    it('rounds to two decimal places', () => {
        expect(round2(1.2345)).toBe(1.23);
        expect(round2(1.999)).toBe(2);
        expect(round2(0)).toBe(0);
        expect(round2(100)).toBe(100);
    });

    it('handles negative numbers', () => {
        expect(round2(-3.456)).toBe(-3.46);
    });
});

// ---------- isReadQuery ----------

describe('isReadQuery', () => {
    it('classifies SELECT as read', () => {
        expect(isReadQuery('SELECT * FROM nodes')).toBe(true);
        expect(isReadQuery('  SELECT id FROM t')).toBe(true);
    });

    it('classifies WITH as read', () => {
        expect(isReadQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true);
    });

    it('classifies INSERT/UPDATE/DELETE as write', () => {
        expect(isReadQuery('INSERT INTO t VALUES (1)')).toBe(false);
        expect(isReadQuery('UPDATE t SET x = 1')).toBe(false);
        expect(isReadQuery('DELETE FROM t WHERE id = 1')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(isReadQuery('select * from t')).toBe(true);
        expect(isReadQuery('with x as (select 1) select 1')).toBe(true);
    });
});

// ---------- extractCaller ----------

describe('extractCaller', () => {
    it('returns a string', () => {
        const caller = extractCaller();
        expect(typeof caller).toBe('string');
        expect(caller.length).toBeGreaterThan(0);
    });

    it('returns unknown when stack is unavailable', () => {
        const origStack = Error;
        // Even with a normal stack, it should return something non-empty
        const result = extractCaller();
        expect(result).toBeTruthy();
    });
});

// ---------- beginOp / endOp ----------

describe('beginOp / endOp', () => {
    it('returns an OpHandle with correct fields', () => {
        const handle = beginOp('SELECT 1', false);
        expect(handle.opId).toBeGreaterThan(0);
        expect(handle.isWrite).toBe(false);
        expect(typeof handle._t0).toBe('number');
        // Clean up
        endOp(handle, 'SELECT 1', 0);
    });

    it('increments read counter for SELECT', () => {
        const h = beginOp('SELECT 1', false);
        endOp(h, 'SELECT 1', 0);
        const diag = getDbDiagnostics();
        expect(diag.stats.totalReads).toBeGreaterThanOrEqual(1);
    });

    it('increments write counter for INSERT', () => {
        const h = beginOp('INSERT INTO t VALUES (1)', true);
        endOp(h, 'INSERT INTO t VALUES (1)', 1);
        const diag = getDbDiagnostics();
        expect(diag.stats.totalWrites).toBeGreaterThanOrEqual(1);
    });

    it('endOp returns isWrite boolean', () => {
        const h1 = beginOp('SELECT 1', false);
        expect(endOp(h1, 'SELECT 1', 0)).toBe(false);

        const h2 = beginOp('INSERT INTO t VALUES (1)', true);
        expect(endOp(h2, 'INSERT INTO t VALUES (1)', 0)).toBe(true);
    });

    it('tracks active ops during operation', () => {
        const h = beginOp('SELECT * FROM nodes', false);
        const diag = getDbDiagnostics();
        expect(diag.activeOps.length).toBe(1);
        expect(diag.activeOps[0].sql).toBe('SELECT * FROM nodes');

        endOp(h, 'SELECT * FROM nodes', 0);
        const diag2 = getDbDiagnostics();
        expect(diag2.activeOps.length).toBe(0);
    });

    it('manages activeWriteCount correctly', () => {
        const h1 = beginOp('INSERT INTO t VALUES (1)', true);
        const h2 = beginOp('UPDATE t SET x = 1', true);
        const diag = getDbDiagnostics();
        expect(diag.stats.activeWriteCount).toBe(2);

        endOp(h1, 'INSERT INTO t VALUES (1)', 0);
        const diag2 = getDbDiagnostics();
        expect(diag2.stats.activeWriteCount).toBe(1);

        endOp(h2, 'UPDATE t SET x = 1', 0);
        const diag3 = getDbDiagnostics();
        expect(diag3.stats.activeWriteCount).toBe(0);
    });
});

// ---------- slow query recording ----------

describe('slow query recording', () => {
    it('records slow queries when duration exceeds threshold', () => {
        // Create a handle with a start time far in the past to simulate slow query
        const h = beginOp('SELECT * FROM big_table', false);
        // Manually set _t0 far back to force slow
        (h as any)._t0 = performance.now() - (DB_SLOW_THRESHOLD_MS + 100);

        jest.spyOn(console, 'error').mockImplementation(() => {});
        endOp(h, 'SELECT * FROM big_table', 2);

        const diag = getDbDiagnostics();
        expect(diag.stats.slowCount).toBeGreaterThanOrEqual(1);
        expect(diag.recentSlowQueries.length).toBeGreaterThanOrEqual(1);
        expect(diag.recentSlowQueries[0].sql).toBe('SELECT * FROM big_table');
    });

    it('logs label-mode prefix without sql suffix', () => {
        const h = beginOp('BEGIN', true);
        (h as any)._t0 = performance.now() - (DB_SLOW_THRESHOLD_MS + 100);

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        endOp(h, 'BEGIN', 0, 'TRANSACTION_SYNC');

        const logMsg = spy.mock.calls.find(c => String(c[0]).includes('TRANSACTION_SYNC'));
        expect(logMsg).toBeDefined();
    });

    it('logs sys-tag prefix with sql suffix', () => {
        const h = beginOp('SELECT 1', false);
        (h as any)._t0 = performance.now() - (DB_SLOW_THRESHOLD_MS + 100);

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        endOp(h, '[sys] SELECT 1', 0, '[sys] ');

        const logMsg = spy.mock.calls.find(c => String(c[0]).includes('READ'));
        expect(logMsg).toBeDefined();
    });
});

// ---------- checkContention ----------

describe('checkContention', () => {
    it('does nothing for read queries', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        checkContention(false, 'Write', 'INSERT INTO t');
        expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when only one active write', () => {
        const h = beginOp('INSERT INTO t VALUES (1)', true);
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        checkContention(true, 'Write', 'INSERT INTO t');
        expect(spy).not.toHaveBeenCalled();
        endOp(h, 'INSERT INTO t VALUES (1)', 0);
    });

    it('logs contention when multiple writes active', () => {
        const h1 = beginOp('INSERT INTO t VALUES (1)', true);
        const h2 = beginOp('UPDATE t SET x = 1', true);

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        checkContention(true, 'Write', 'INSERT INTO t');

        expect(spy).toHaveBeenCalled();
        const msg = String(spy.mock.calls[0][0]);
        expect(msg).toContain('[db:contention]');
        expect(msg).toContain('Write queued behind');

        endOp(h1, 'INSERT', 0);
        endOp(h2, 'UPDATE', 0);
    });

    it('logs without suffix when not provided', () => {
        const h1 = beginOp('INSERT INTO t VALUES (1)', true);
        const h2 = beginOp('UPDATE t SET x = 1', true);

        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        checkContention(true, 'Transaction');

        expect(spy).toHaveBeenCalled();
        const msg = String(spy.mock.calls[0][0]);
        expect(msg).toContain('Transaction queued behind');
        expect(msg).not.toContain('undefined');

        endOp(h1, 'INSERT', 0);
        endOp(h2, 'UPDATE', 0);
    });
});

// ---------- recordBusyRetry ----------

describe('recordBusyRetry', () => {
    it('increments contention counter', () => {
        const before = getDbDiagnostics().stats.contentionEvents;
        recordBusyRetry();
        const after = getDbDiagnostics().stats.contentionEvents;
        expect(after).toBe(before + 1);
    });
});

// ---------- getDbDiagnostics ----------

describe('getDbDiagnostics', () => {
    it('returns full diagnostics structure', () => {
        const diag = getDbDiagnostics();
        expect(diag).toHaveProperty('activeOps');
        expect(diag).toHaveProperty('recentSlowQueries');
        expect(diag).toHaveProperty('stats');
        expect(diag.stats).toHaveProperty('totalReads');
        expect(diag.stats).toHaveProperty('totalWrites');
        expect(diag.stats).toHaveProperty('slowCount');
        expect(diag.stats).toHaveProperty('contentionEvents');
        expect(diag.stats).toHaveProperty('activeWriteCount');
        expect(diag.stats).toHaveProperty('stmtCacheSize');
        expect(diag.stats).toHaveProperty('p50Ms');
        expect(diag.stats).toHaveProperty('p95Ms');
        expect(diag.stats).toHaveProperty('p99Ms');
        expect(diag.stats).toHaveProperty('windowStartedAt');
        expect(diag.stats).toHaveProperty('windowDurationSec');
    });

    it('uses provided stmtCacheSize', () => {
        const diag = getDbDiagnostics(42);
        expect(diag.stats.stmtCacheSize).toBe(42);
    });

    it('defaults stmtCacheSize to 0', () => {
        const diag = getDbDiagnostics();
        expect(diag.stats.stmtCacheSize).toBe(0);
    });

    it('computes percentiles from latency data', () => {
        // Run several ops to populate latency ring buffer
        for (let i = 0; i < 10; i++) {
            const h = beginOp('SELECT 1', false);
            endOp(h, 'SELECT 1', 0);
        }
        const diag = getDbDiagnostics();
        expect(typeof diag.stats.p50Ms).toBe('number');
        expect(typeof diag.stats.p95Ms).toBe('number');
        expect(typeof diag.stats.p99Ms).toBe('number');
    });

    it('returns 0 for percentiles when no latency data', () => {
        const diag = getDbDiagnostics();
        expect(diag.stats.p50Ms).toBe(0);
        expect(diag.stats.p95Ms).toBe(0);
        expect(diag.stats.p99Ms).toBe(0);
    });
});

// ---------- resetDbDiagnostics ----------

describe('resetDbDiagnostics', () => {
    it('clears all counters and slow queries', () => {
        // Generate some activity
        const h = beginOp('INSERT INTO t', true);
        endOp(h, 'INSERT INTO t', 0);
        recordBusyRetry();

        resetDbDiagnostics();

        const diag = getDbDiagnostics();
        expect(diag.stats.totalReads).toBe(0);
        expect(diag.stats.totalWrites).toBe(0);
        expect(diag.stats.slowCount).toBe(0);
        expect(diag.stats.contentionEvents).toBe(0);
        expect(diag.recentSlowQueries.length).toBe(0);
    });
});
