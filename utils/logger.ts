/**
 * Disk-backed logging system with daily rotation and EPIPE safety.
 *
 * Two layers:
 * 1. `interceptConsole()` — monkey-patches `console.log/error/warn` to also
 *    write to disk. All existing console calls get file logging for free.
 * 2. `Logger` class — structured API with levels, child loggers, and metadata.
 *    Use for new code; gradually replace console calls over time.
 *
 * Log files are written to `data/logs/podbit-YYYY-MM-DD[.N].log` (one per
 * day, size-rotated at 5 MB with up to {@link MAX_DAILY_PARTS} part files per
 * day). Daily total is capped at 25 MB across all processes sharing the log
 * directory. Old files are pruned after 7 days (configurable via
 * `LOG_RETENTION_DAYS` env var).
 *
 * EPIPE-safe: the `killLogging()` function permanently disables all file
 * writes when stdout breaks (MCP stdio disconnect), and `isEpipeMessage()`
 * filters EPIPE errors from ever reaching the log file. Per-process caps
 * are checked on disk (not in-memory) so they work correctly when multiple
 * Podbit processes share the same log directory.
 *
 * @module utils/logger
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RC } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.PODBIT_DATA_DIR
    ? path.resolve(process.env.PODBIT_DATA_DIR)
    : path.join(PROJECT_ROOT, 'data');
const LOG_DIR = path.join(DATA_DIR, 'logs');

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '7', 10);
const MAX_LOG_SIZE = parseInt(process.env.LOG_MAX_SIZE_MB || '5', 10) * 1024 * 1024; // 5 MB per file
const MAX_DAILY_SIZE = parseInt(process.env.LOG_MAX_DAILY_MB || '25', 10) * 1024 * 1024; // 25 MB daily cap across all processes
const MAX_DAILY_PARTS = 5; // Hard cap on part files per day (checked on disk, not in-memory)
const MAX_LINE_LENGTH = 4000; // Truncate individual log lines beyond this

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ---------------------------------------------------------------------------
// File writer (shared singleton)
// ---------------------------------------------------------------------------

let currentLogDate = '';
let currentLogPart = 0;
let currentStream: fs.WriteStream | null = null;
let _currentLogPath = '';
let bytesWritten = 0;
let dailyBytesWritten = 0;
let dailySizeExceeded = false;

// Kill switch — once set, ALL logging is suppressed immediately.
// Used by EPIPE handler to break the EPIPE → log → EPIPE feedback loop.
let loggingKilled = false;

// Stdio alive flag — once false, originalLog/Error/Warn are no longer called.
// This prevents EPIPE exceptions from writing to broken stdout/stderr.
let stdioAlive = true;

/**
 * Permanently disable all file logging. Called when stdout pipe breaks (EPIPE)
 * to prevent runaway log growth. Process should exit shortly after.
 */
export function killLogging(): void {
    loggingKilled = true;
    if (currentStream) {
        try { currentStream.end(); } catch {}
        currentStream = null;
    }
}

// Rate limiting for repeated messages
// Compares message BODY (without timestamp) so identical errors are properly deduplicated
let lastMessageBody = '';
let lastMessageCount = 0;
let lastMessageTime = 0;
const RATE_LIMIT_WINDOW_MS = RC.misc.logRateLimitWindowMs;
const RATE_LIMIT_MAX_REPEATS = RC.misc.logRateLimitMaxRepeats;

/** Returns the log filename for a given date and optional part number (e.g. podbit-2025-03-06.log). */
function getLogFileName(date: Date, part = 0): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return part === 0
        ? `podbit-${y}-${m}-${d}.log`
        : `podbit-${y}-${m}-${d}.${part}.log`;
}

/** Creates the log directory if it does not exist. */
function ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

/** Opens a new write stream for the current log file (with optional part number); rotates away from previous stream. */
function openNewStream(now: Date, part: number): fs.WriteStream {
    if (currentStream) {
        currentStream.end();
    }
    ensureLogDir();
    const filePath = path.join(LOG_DIR, getLogFileName(now, part));
    _currentLogPath = filePath;
    currentStream = fs.createWriteStream(filePath, { flags: 'a' });
    currentLogPart = part;

    // Catch stream errors (especially EPIPE) to prevent unhandled exceptions
    currentStream.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE' || err.errno === -4047) {
            loggingKilled = true;
        }
    });

    // Track existing file size when appending
    try {
        if (fs.existsSync(filePath)) {
            bytesWritten = fs.statSync(filePath).size;
        } else {
            bytesWritten = 0;
        }
    } catch {
        bytesWritten = 0;
    }

    return currentStream;
}

/** Returns the current log stream, opening or rotating as needed (day rollover, size cap, daily part limit). */
function getStream(): fs.WriteStream | null {
    if (loggingKilled) return null;

    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    if (today !== currentLogDate || !currentStream) {
        // Day rolled over or first call — calculate daily bytes from existing files
        currentLogDate = today;
        dailyBytesWritten = 0;
        dailySizeExceeded = false;

        // Sum existing log file sizes for today to survive process restarts
        try {
            const todayPrefix = `podbit-${today}`;
            const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith(todayPrefix));
            for (const file of files) {
                try {
                    dailyBytesWritten += fs.statSync(path.join(LOG_DIR, file)).size;
                } catch {}
            }
        } catch {}

        // Find the highest part number for today to continue from
        let maxPart = 0;
        try {
            const todayPrefix = `podbit-${today}`;
            const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith(todayPrefix));
            for (const file of files) {
                const partMatch = file.match(/\.(\d+)\.log$/);
                if (partMatch) {
                    maxPart = Math.max(maxPart, parseInt(partMatch[1], 10));
                }
            }
        } catch {}

        return openNewStream(now, maxPart);
    }

    // Daily total size cap — check on-disk size (multiple processes share log dir)
    if (dailySizeExceeded) return null;
    if (dailyBytesWritten >= MAX_DAILY_SIZE) {
        dailySizeExceeded = true;
        return null;
    }

    // Size-based rotation within the same day (with hard cap on part count).
    // Check on-disk part count — not just in-memory — because multiple processes
    // share the same log directory and each has its own counter.
    if (bytesWritten >= MAX_LOG_SIZE) {
        let diskPartCount = 0;
        try {
            const todayPrefix = `podbit-${currentLogDate}`;
            diskPartCount = fs.readdirSync(LOG_DIR).filter(f => f.startsWith(todayPrefix)).length;
        } catch {}
        if (diskPartCount >= MAX_DAILY_PARTS) {
            dailySizeExceeded = true;
            return null;
        }
        return openNewStream(now, currentLogPart + 1);
    }

    return currentStream;
}

/** Writes a single line to the log file with rate limiting and truncation; no-op if logging killed or daily cap exceeded. */
function writeLine(line: string): void {
    // Kill switch — immediately bail if logging has been killed (EPIPE handler)
    if (loggingKilled) return;

    try {
        // Truncate overly long lines (e.g. full JSON bodies, base64 data)
        const safeLine = line.length > MAX_LINE_LENGTH
            ? line.slice(0, MAX_LINE_LENGTH) + `...(truncated ${line.length - MAX_LINE_LENGTH} chars)`
            : line;

        // Rate-limit repeated identical messages (prevents tight error loops from filling disk)
        // Compare message BODY only (strip ISO timestamp prefix "YYYY-MM-DDTHH:MM:SS.sssZ ")
        // so identical errors with different timestamps are properly deduplicated.
        const body = safeLine.length > 25 ? safeLine.slice(25) : safeLine;
        const now = Date.now();
        if (body === lastMessageBody && now - lastMessageTime < RATE_LIMIT_WINDOW_MS) {
            lastMessageCount++;
            if (lastMessageCount > RATE_LIMIT_MAX_REPEATS) return; // silently drop
        } else {
            // New message — if previous was suppressed, emit a summary
            if (lastMessageCount > RATE_LIMIT_MAX_REPEATS) {
                const suppressed = lastMessageCount - RATE_LIMIT_MAX_REPEATS;
                const summary = `${new Date().toISOString()} [WARN ] [system] Previous message repeated ${suppressed} more time(s) — suppressed\n`;
                const stream = getStream();
                if (stream) {
                    stream.write(summary);
                    const summaryBytes = Buffer.byteLength(summary);
                    bytesWritten += summaryBytes;
                    dailyBytesWritten += summaryBytes;
                }
            }
            lastMessageBody = body;
            lastMessageCount = 1;
            lastMessageTime = now;
        }

        const stream = getStream();
        if (!stream) return; // daily cap exceeded
        const buf = safeLine + '\n';
        stream.write(buf);
        const bytes = Buffer.byteLength(buf);
        bytesWritten += bytes;
        dailyBytesWritten += bytes;
    } catch {
        // Logging must never crash the app
    }
}

// ---------------------------------------------------------------------------
// Log rotation / cleanup
// ---------------------------------------------------------------------------

/** Deletes log files older than retention and returns counts and total size of remaining files. */
export function cleanOldLogs(): { deleted: number; remaining: number; totalSizeKB: number } {
    ensureLogDir();
    let deleted = 0;
    let remaining = 0;
    let totalSize = 0;

    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => /^(?:podbit|resonance)-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/.test(f));
        for (const file of files) {
            const filePath = path.join(LOG_DIR, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) {
                fs.unlinkSync(filePath);
                deleted++;
            } else {
                remaining++;
                totalSize += stat.size;
            }
        }
    } catch {
        // Non-fatal
    }

    return { deleted, remaining, totalSizeKB: Math.round(totalSize / 1024) };
}

// ---------------------------------------------------------------------------
// Level filtering
// ---------------------------------------------------------------------------

/** Returns the configured log level from LOG_LEVEL env (default 'info'). */
function getConfiguredLevel(): LogLevel {
    const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
    if (env in LEVEL_ORDER) return env as LogLevel;
    return 'info';
}

/** Returns true if the given level should be logged given the configured level. */
function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[getConfiguredLevel()];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Builds a single log line: timestamp, level, optional prefix, message, optional JSON meta. */
function formatLine(level: LogLevel, prefix: string | null, msg: string, meta?: Record<string, any>): string {
    const ts = new Date().toISOString();
    const lvl = level.toUpperCase().padEnd(5);
    const pfx = prefix ? ` [${prefix}]` : '';
    const metaStr = meta && Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
    return `${ts} [${lvl}]${pfx} ${msg}${metaStr}`;
}

// ---------------------------------------------------------------------------
// Logger class
// ---------------------------------------------------------------------------

/**
 * Structured logger with level filtering and optional prefix.
 * Each log entry is written to the daily log file with ISO timestamp, level, and optional metadata.
 * Create child loggers with {@link Logger.child} for scoped prefixes (e.g. "kb:scanner").
 */
export class Logger {
    private prefix: string | null;

    /**
     * @param prefix - Optional prefix for all log lines from this logger (e.g. "kb", "proxy")
     */
    constructor(prefix?: string) {
        this.prefix = prefix || null;
    }

    /**
     * Log a debug-level message (only written if LOG_LEVEL=debug).
     * @param msg - Log message
     * @param meta - Optional structured metadata appended as JSON
     */
    debug(msg: string, meta?: Record<string, any>): void {
        if (!shouldLog('debug')) return;
        const line = formatLine('debug', this.prefix, msg, meta);
        writeLine(line);
    }

    /**
     * Log an info-level message.
     * @param msg - Log message
     * @param meta - Optional structured metadata appended as JSON
     */
    info(msg: string, meta?: Record<string, any>): void {
        if (!shouldLog('info')) return;
        const line = formatLine('info', this.prefix, msg, meta);
        writeLine(line);
    }

    /**
     * Log a warning-level message.
     * @param msg - Log message
     * @param meta - Optional structured metadata appended as JSON
     */
    warn(msg: string, meta?: Record<string, any>): void {
        if (!shouldLog('warn')) return;
        const line = formatLine('warn', this.prefix, msg, meta);
        writeLine(line);
    }

    /**
     * Log an error-level message.
     * @param msg - Log message
     * @param meta - Optional structured metadata appended as JSON
     */
    error(msg: string, meta?: Record<string, any>): void {
        if (!shouldLog('error')) return;
        const line = formatLine('error', this.prefix, msg, meta);
        writeLine(line);
    }

    /**
     * Create a child logger with a combined prefix (e.g. parent "kb" + child "scanner" = "kb:scanner").
     * @param subPrefix - Sub-prefix to append
     * @returns New Logger instance with the combined prefix
     */
    child(subPrefix: string): Logger {
        const combined = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix;
        return new Logger(combined);
    }
}

// ---------------------------------------------------------------------------
// Console interception
// ---------------------------------------------------------------------------

const PREFIX_REGEX = /^\[([^\]]+)\]\s*/;

let intercepted = false;

/**
 * Monkey-patches console.log, console.error, console.warn to also write
 * to the daily log file. Original console output is preserved.
 *
 * Safe to call multiple times — only patches once.
 */
export function interceptConsole(): void {
    if (intercepted) return;
    intercepted = true;

    // Clean old logs on first intercept
    const cleanup = cleanOldLogs();
    if (cleanup.deleted > 0 || cleanup.remaining > 0) {
        const line = formatLine('info', 'system', `Log cleanup: deleted ${cleanup.deleted} old file(s), ${cleanup.remaining} remaining (${cleanup.totalSizeKB} KB)`);
        writeLine(line);
    }

    // Log startup
    const logFile = getLogFileName(new Date());
    const startLine = formatLine('info', 'system', `Logging to data/logs/${logFile}`);
    writeLine(startLine);

    const originalLog = console.log.bind(console);
    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);

    // Helper: call original console method, but catch EPIPE and stop trying
    function safeOriginal(fn: (...a: any[]) => void, args: any[]): void {
        if (!stdioAlive) return;
        try {
            fn(...args);
        } catch (e: any) {
            if (e?.code === 'EPIPE' || e?.errno === -4047) {
                stdioAlive = false;
            }
        }
    }

    console.log = (...args: any[]) => {
        safeOriginal(originalLog, args);
        fileLog('info', args);
    };

    console.error = (...args: any[]) => {
        safeOriginal(originalError, args);
        fileLog('error', args);
    };

    console.warn = (...args: any[]) => {
        safeOriginal(originalWarn, args);
        fileLog('warn', args);
    };
}

// EPIPE errors are infrastructure noise — never write them to the log file.
// They flood logs at thousands per second when an MCP stdio pipe breaks.
/** Returns true if the log args contain an EPIPE or stream-destroyed error (suppressed from file log). */
function isEpipeMessage(args: any[]): boolean {
    for (const a of args) {
        if (typeof a === 'string' && a.includes('EPIPE')) return true;
        if (a && typeof a === 'object') {
            if (a.code === 'EPIPE' || a.errno === -4047 || a.code === 'ERR_STREAM_DESTROYED') return true;
        }
    }
    return false;
}

/** Serializes console-style args to a string and writes to the log file (skips EPIPE). */
function fileLog(level: LogLevel, args: any[]): void {
    if (!shouldLog(level)) return;
    if (isEpipeMessage(args)) return;   // Never log EPIPE to file

    try {
        // Flatten args to a string (similar to how console does it)
        // Cap individual arg serialization to prevent massive JSON dumps
        const msg = args
            .map(a => {
                if (typeof a === 'string') return a;
                const s = JSON.stringify(a, null, 0);
                return s.length > MAX_LINE_LENGTH ? s.slice(0, MAX_LINE_LENGTH) + '...' : s;
            })
            .join(' ');

        // Extract [prefix] if present
        let prefix: string | null = null;
        let body = msg;
        const m = msg.match(PREFIX_REGEX);
        if (m) {
            prefix = m[1];
            body = msg.slice(m[0].length);
        }

        const line = formatLine(level, prefix, body);
        writeLine(line);
    } catch {
        // Never let logging crash the app
    }
}

// Default logger instance
export const logger = new Logger();
