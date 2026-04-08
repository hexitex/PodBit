/**
 * Database diagnostics & instrumentation for the SQLite backend.
 *
 * Owns all shared diagnostic state (counters, latency ring buffer, slow-query
 * ring buffer, active-operation map) and exposes a beginOp/endOp API that
 * the query/transaction functions use instead of repeating the same ~20-line
 * instrumentation block inline.
 *
 * Exported mutable let — ESM live binding:
 *   activeWriteCount  (sqlite-backend.ts reads it for WAL checkpoint decisions)
 */

// =============================================================================
// CONSTANTS & TYPES
// =============================================================================

/**
 * Threshold in milliseconds above which a query is considered "slow" and logged.
 * Configurable via the `DB_SLOW_THRESHOLD_MS` environment variable (default: 50ms).
 */
export const DB_SLOW_THRESHOLD_MS = parseInt(process.env.DB_SLOW_THRESHOLD_MS || '1000', 10);

export interface SlowQueryEntry {
    sql: string;         // first 200 chars
    paramCount: number;
    durationMs: number;
    caller: string;
    timestamp: number;
    isWrite: boolean;
}

export interface DbDiagnostics {
    activeOps: { opId: number; sql: string; durationMs: number; isWrite: boolean }[];
    recentSlowQueries: SlowQueryEntry[];
    stats: {
        totalReads: number;
        totalWrites: number;
        slowCount: number;
        contentionEvents: number;
        activeWriteCount: number;
        stmtCacheSize: number;
        p50Ms: number;
        p95Ms: number;
        p99Ms: number;
        windowStartedAt: string;
        windowDurationSec: number;
    };
}

/** Handle returned by beginOp, consumed by endOp. */
export interface OpHandle {
    opId: number;
    isWrite: boolean;
    _t0: number;
}

// =============================================================================
// RING BUFFERS & COUNTERS
// =============================================================================

const SLOW_BUFFER_SIZE = 50;
const slowQueries: (SlowQueryEntry | null)[] = new Array(SLOW_BUFFER_SIZE).fill(null);
let slowHead = 0;

const LATENCY_BUFFER_SIZE = 200;
const latencies: number[] = [];
let latencyHead = 0;

let nextOpId = 1;
const activeOps = new Map<number, { sql: string; startTime: number; isWrite: boolean }>();

let statTotalReads = 0;
let statTotalWrites = 0;
let statSlowCount = 0;
let statContentionEvents = 0;
let statWindowStart = Date.now();

/** Live binding — imported modules read this to detect concurrent writes. */
export let activeWriteCount = 0;

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/** Appends a slow-query entry to the ring buffer for diagnostics. */
function recordSlowQuery(entry: SlowQueryEntry): void {
    slowQueries[slowHead] = entry;
    slowHead = (slowHead + 1) % SLOW_BUFFER_SIZE;
}

/** Appends latency to the ring buffer for percentile computation. */
function recordLatency(ms: number): void {
    if (latencies.length < LATENCY_BUFFER_SIZE) {
        latencies.push(ms);
    } else {
        latencies[latencyHead] = ms;
        latencyHead = (latencyHead + 1) % LATENCY_BUFFER_SIZE;
    }
}

/** Returns the p-th percentile (0–1) of recorded latencies. */
function computePercentile(p: number): number {
    if (latencies.length === 0) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
    return sorted[idx];
}

// =============================================================================
// EXPORTED HELPERS
// =============================================================================

/** Rounds a number to two decimal places for diagnostics display. */
export function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Extract caller from stack trace — only called on slow queries (not fast path). */
export function extractCaller(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    const lines = stack.split('\n');
    // Skip: Error, extractCaller, endOp, query/queryOne wrapper
    for (let i = 3; i < Math.min(lines.length, 12); i++) {
        const line = lines[i].trim();
        if (
            line.includes('sqlite-backend') ||
            line.includes('db/index') ||
            line.includes('db\\index')
        ) continue;
        const m = line.match(/at\s+(?:(.+?)\s+\()?(.*?):(\d+):\d+/);
        if (m) return `${m[1] || 'anon'} (${m[2].split(/[/\\]/).slice(-2).join('/')}:${m[3]})`;
        return line.substring(0, 80);
    }
    return 'unknown';
}

/** Classify SQL as read (SELECT/WITH) or write. */
export function isReadQuery(sql: string): boolean {
    const upper = sql.trimStart().substring(0, 8).toUpperCase();
    return upper.startsWith('SELECT') || upper.startsWith('WITH');
}

// =============================================================================
// beginOp / endOp / checkContention
// =============================================================================

/**
 * Mark the start of a tracked DB operation.
 * Updates counters and registers the op in the active-ops map.
 *
 * @param trackedSql - Pre-formatted SQL for display (caller handles truncation)
 * @param isWrite    - true for INSERT/UPDATE/DELETE/TRANSACTION
 */
export function beginOp(trackedSql: string, isWrite: boolean): OpHandle {
    const opId = nextOpId++;
    const t0 = performance.now();
    activeOps.set(opId, { sql: trackedSql, startTime: t0, isWrite });
    if (isWrite) { statTotalWrites++; activeWriteCount++; }
    else statTotalReads++;
    return { opId, isWrite, _t0: t0 };
}

/**
 * Mark the end of a tracked DB operation.
 * Records latency, logs slow queries, and cleans up the active-ops map.
 *
 * @param handle     - OpHandle from beginOp
 * @param logSql     - SQL stored in the slow-query ring buffer
 * @param paramCount - Number of bound parameters
 * @param prefix     - Controls the slow-query console line format:
 *   - omitted / ''   → auto:  "WRITE/READ from caller: sql.substring(0,100)"
 *   - ends with ' '  → sys-tag: "[sys] WRITE/READ from caller: sql"
 *   - no trailing sp → label:   "TRANSACTION_SYNC from caller" (no sql suffix)
 *
 * @returns handle.isWrite — callers use this to decide whether to checkpoint WAL
 */
export function endOp(
    handle: OpHandle,
    logSql: string,
    paramCount: number,
    prefix?: string,
): boolean {
    const dur = performance.now() - handle._t0;
    activeOps.delete(handle.opId);
    if (handle.isWrite) activeWriteCount--;
    recordLatency(dur);

    if (dur > DB_SLOW_THRESHOLD_MS) {
        statSlowCount++;
        const caller = extractCaller();
        recordSlowQuery({
            sql: logSql,
            paramCount,
            durationMs: round2(dur),
            caller,
            timestamp: Date.now(),
            isWrite: handle.isWrite,
        });

        const p = prefix ?? '';
        if (p && !p.endsWith(' ')) {
            // Label mode: TRANSACTION_SYNC, [sys] TRANSACTION_SYNC, TRANSACTION
            console.error(`[db:slow] ${Math.round(dur)}ms ${p} from ${caller}`);
        } else {
            // Auto / sys-tag mode
            const rw = handle.isWrite ? 'WRITE' : 'READ';
            // Strip the "[sys] " marker from the sql snippet shown on console
            const consoleSql = p
                ? logSql.replace(/^\[sys\]\s*/i, '').substring(0, 100)
                : logSql.substring(0, 100);
            console.error(`[db:slow] ${Math.round(dur)}ms ${p}${rw} from ${caller}: ${consoleSql}`);
        }
    }

    return handle.isWrite;
}

/**
 * Log and count write-contention events.
 *
 * @param isWrite  - Must be true for contention to be recorded
 * @param prefix   - Label before "queued behind…", e.g. "Write" or "Transaction"
 * @param suffix   - Optional SQL snippet appended after the count, e.g. sql.substring(0, 80)
 */
export function checkContention(isWrite: boolean, prefix: string, suffix?: string): void {
    if (!isWrite || activeWriteCount <= 1) return;
    statContentionEvents++;
    const msg = suffix
        ? `[db:contention] ${prefix} queued behind ${activeWriteCount - 1} active write(s): ${suffix}`
        : `[db:contention] ${prefix} queued behind ${activeWriteCount - 1} active write(s)`;
    console.error(msg);
}

/** Increment contention counter on SQLITE_BUSY retry (called by withBusyRetry). */
export function recordBusyRetry(): void {
    statContentionEvents++;
}

// =============================================================================
// DIAGNOSTICS API
// =============================================================================

/**
 * Build a full diagnostics snapshot.
 *
 * @param stmtCacheSize - Combined size of write + read prepared-statement caches
 *                        (owned by sqlite-backend.ts, injected here to avoid coupling)
 */
export function getDbDiagnostics(stmtCacheSize = 0): DbDiagnostics {
    const now = performance.now();

    const ops: DbDiagnostics['activeOps'] = [];
    for (const [opId, op] of activeOps) {
        ops.push({ opId, sql: op.sql, durationMs: round2(now - op.startTime), isWrite: op.isWrite });
    }

    const recent: SlowQueryEntry[] = [];
    for (let i = 0; i < SLOW_BUFFER_SIZE; i++) {
        const idx = (slowHead - 1 - i + SLOW_BUFFER_SIZE) % SLOW_BUFFER_SIZE;
        const entry = slowQueries[idx];
        if (entry) recent.push(entry);
    }

    return {
        activeOps: ops,
        recentSlowQueries: recent,
        stats: {
            totalReads: statTotalReads,
            totalWrites: statTotalWrites,
            slowCount: statSlowCount,
            contentionEvents: statContentionEvents,
            activeWriteCount,
            stmtCacheSize,
            p50Ms: round2(computePercentile(0.5)),
            p95Ms: round2(computePercentile(0.95)),
            p99Ms: round2(computePercentile(0.99)),
            windowStartedAt: new Date(statWindowStart).toISOString(),
            windowDurationSec: Math.floor((Date.now() - statWindowStart) / 1000),
        },
    };
}

/** Reset all diagnostic counters and ring buffers. */
export function resetDbDiagnostics(): void {
    slowQueries.fill(null);
    slowHead = 0;
    latencies.length = 0;
    latencyHead = 0;
    statTotalReads = 0;
    statTotalWrites = 0;
    statSlowCount = 0;
    statContentionEvents = 0;
    statWindowStart = Date.now();
    // activeOps intentionally not cleared — they represent in-flight operations
}
