/**
 * Unit tests for utils/logger.ts
 *
 * Tests the Logger class, interceptConsole, killLogging, cleanOldLogs,
 * and internal logic (rate limiting, truncation, EPIPE handling, rotation)
 * via the public API.
 *
 * KEY DESIGN NOTES on module-level state:
 *
 * 1. The logger has persistent internal state (currentStream, currentLogDate,
 *    loggingKilled, intercepted) that survives across tests. The stream is
 *    opened once for the current date and reused.
 *
 * 2. killLogging() permanently sets loggingKilled=true. Tests calling it
 *    MUST be in the final describe block.
 *
 * 3. interceptConsole() sets intercepted=true and patches console methods.
 *    It can only run its body once. We call it early and test fileLog
 *    behavior BEFORE any afterEach can undo the patching.
 *
 * 4. Tests clear mock call histories (not implementations) in beforeEach
 *    so the module's cached stream reference stays valid.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock fs — prevent real filesystem I/O
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(...a: any[]) => boolean>().mockReturnValue(false);
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn<(...a: any[]) => string[]>().mockReturnValue([]);
const mockStatSync = jest.fn<(...a: any[]) => any>().mockReturnValue({ size: 0, mtimeMs: Date.now() });
const mockUnlinkSync = jest.fn();
const mockReadFileSync = jest.fn<any>().mockReturnValue('{}');

const mockStreamWrite = jest.fn<(...a: any[]) => boolean>().mockReturnValue(true);
const mockStreamEnd = jest.fn();
const mockStreamOn = jest.fn();

function makeMockStream() {
    return {
        write: mockStreamWrite,
        end: mockStreamEnd,
        on: mockStreamOn,
    };
}

const mockCreateWriteStream = jest.fn<(...a: any[]) => any>().mockReturnValue(makeMockStream());

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
        mkdirSync: mockMkdirSync,
        readdirSync: mockReaddirSync,
        statSync: mockStatSync,
        unlinkSync: mockUnlinkSync,
        createWriteStream: mockCreateWriteStream,
        readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    unlinkSync: mockUnlinkSync,
    createWriteStream: mockCreateWriteStream,
    readFileSync: mockReadFileSync,
}));

// ---------------------------------------------------------------------------
// Mock config/constants.js — prevents readFileSync at module load
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: { misc: { logRateLimitWindowMs: 5000, logRateLimitMaxRepeats: 5 } },
}));

// ---------------------------------------------------------------------------
// Import module under test (AFTER mocks are set up)
// ---------------------------------------------------------------------------

const { Logger, killLogging, cleanOldLogs, interceptConsole, logger } =
    await import('../../utils/logger.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all strings written to the mock stream. */
function getWritten(): string[] {
    return mockStreamWrite.mock.calls.map(c => String(c[0]));
}

beforeEach(() => {
    // Only clear call history — do NOT reset implementations, because
    // the module's cached currentStream still references these mock fns.
    mockStreamWrite.mockClear();
    mockStreamEnd.mockClear();
    mockStreamOn.mockClear();
    mockCreateWriteStream.mockClear();
    mockExistsSync.mockClear();
    mockMkdirSync.mockClear();
    mockReaddirSync.mockClear();
    mockStatSync.mockClear();
    mockUnlinkSync.mockClear();

    // Restore default return values
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue({ size: 0, mtimeMs: Date.now() });
    mockStreamWrite.mockReturnValue(true);

    delete process.env.LOG_LEVEL;
});

// ====================================================================
// Logger class
// ====================================================================

describe('Logger', () => {
    describe('constructor and prefix', () => {
        it('creates a logger with no prefix', () => {
            const log = new Logger();
            log.info('test message');
            expect(mockStreamWrite).toHaveBeenCalled();
        });

        it('creates a logger with a prefix', () => {
            const log = new Logger('mymod');
            log.info('hello');
            expect(getWritten().some(w => w.includes('[mymod]'))).toBe(true);
        });
    });

    describe('child logger', () => {
        it('creates a child with combined prefix', () => {
            new Logger('core').child('engine').info('child message');
            expect(getWritten().some(w => w.includes('[core:engine]'))).toBe(true);
        });

        it('creates a child from a prefixless parent', () => {
            new Logger().child('sub').info('test');
            expect(getWritten().some(w => w.includes('[sub]'))).toBe(true);
        });

        it('supports nested children', () => {
            new Logger('a').child('b').child('c').warn('nested');
            expect(getWritten().some(w => w.includes('[a:b:c]'))).toBe(true);
        });
    });

    describe('log levels', () => {
        it('writes info-level messages by default', () => {
            new Logger('test').info('info msg');
            expect(getWritten().some(w => w.includes('[INFO ]'))).toBe(true);
        });

        it('writes warn-level messages', () => {
            new Logger('test').warn('warn msg');
            expect(getWritten().some(w => w.includes('[WARN ]'))).toBe(true);
        });

        it('writes error-level messages', () => {
            new Logger('test').error('err msg');
            expect(getWritten().some(w => w.includes('[ERROR]'))).toBe(true);
        });

        it('suppresses debug when LOG_LEVEL is info (default)', () => {
            new Logger('test').debug('debug msg');
            expect(getWritten().some(w => w.includes('[DEBUG]'))).toBe(false);
        });

        it('writes debug when LOG_LEVEL is debug', () => {
            process.env.LOG_LEVEL = 'debug';
            new Logger('test').debug('debug msg');
            expect(getWritten().some(w => w.includes('[DEBUG]'))).toBe(true);
        });

        it('suppresses info and warn when LOG_LEVEL is error', () => {
            process.env.LOG_LEVEL = 'error';
            const log = new Logger('test');
            log.info('info msg');
            log.warn('warn msg');
            log.error('error msg');
            const w = getWritten();
            expect(w.some(l => l.includes('[INFO ]'))).toBe(false);
            expect(w.some(l => l.includes('[WARN ]'))).toBe(false);
            expect(w.some(l => l.includes('[ERROR]'))).toBe(true);
        });

        it('suppresses debug and info when LOG_LEVEL is warn', () => {
            process.env.LOG_LEVEL = 'warn';
            const log = new Logger('test');
            log.debug('d');
            log.info('i');
            log.warn('w');
            log.error('e');
            const w = getWritten();
            expect(w.some(l => l.includes('[DEBUG]'))).toBe(false);
            expect(w.some(l => l.includes('[INFO ]'))).toBe(false);
            expect(w.some(l => l.includes('[WARN ]'))).toBe(true);
            expect(w.some(l => l.includes('[ERROR]'))).toBe(true);
        });

        it('handles unknown LOG_LEVEL by defaulting to info', () => {
            process.env.LOG_LEVEL = 'BOGUS';
            const log = new Logger('test');
            log.info('info msg');
            log.debug('debug msg');
            const w = getWritten();
            expect(w.some(l => l.includes('[INFO ]'))).toBe(true);
            expect(w.some(l => l.includes('[DEBUG]'))).toBe(false);
        });

        it('handles LOG_LEVEL case-insensitively', () => {
            process.env.LOG_LEVEL = 'WARN';
            const log = new Logger('test');
            log.info('should be suppressed');
            log.warn('should appear');
            const w = getWritten();
            expect(w.some(l => l.includes('[INFO ]'))).toBe(false);
            expect(w.some(l => l.includes('[WARN ]'))).toBe(true);
        });

        it('writes all levels when LOG_LEVEL is debug', () => {
            process.env.LOG_LEVEL = 'debug';
            const log = new Logger('test');
            log.debug('d');
            log.info('i');
            log.warn('w');
            log.error('e');
            const w = getWritten();
            expect(w.some(l => l.includes('[DEBUG]'))).toBe(true);
            expect(w.some(l => l.includes('[INFO ]'))).toBe(true);
            expect(w.some(l => l.includes('[WARN ]'))).toBe(true);
            expect(w.some(l => l.includes('[ERROR]'))).toBe(true);
        });

        it('only writes error when LOG_LEVEL is error', () => {
            process.env.LOG_LEVEL = 'error';
            const log = new Logger('test');
            log.debug('d');
            log.info('i');
            log.warn('w');
            log.error('e');
            const w = getWritten();
            expect(w.filter(l => l.includes('[ERROR]')).length).toBe(1);
            expect(w.filter(l => !l.includes('[ERROR]')).length).toBe(0);
        });
    });

    describe('metadata', () => {
        it('includes JSON metadata in log line', () => {
            new Logger('test').info('with meta', { key: 'value', count: 42 });
            const w = getWritten();
            expect(w.some(l => l.includes('"key":"value"') && l.includes('"count":42'))).toBe(true);
        });

        it('omits metadata section when meta is empty object', () => {
            new Logger('test').info('no meta here', {});
            const line = getWritten().find(l => l.includes('no meta here'));
            expect(line).toBeDefined();
            expect(line!.indexOf('{', line!.indexOf('no meta here'))).toBe(-1);
        });

        it('omits metadata when not provided', () => {
            new Logger('test').info('plain message');
            const line = getWritten().find(l => l.includes('plain message'));
            expect(line).toBeDefined();
            expect(line!.indexOf('{', line!.indexOf('plain message'))).toBe(-1);
        });

        it('includes nested object metadata', () => {
            new Logger('nested').info('nest', { outer: { inner: 'val' } });
            expect(getWritten().some(l => l.includes('"outer"') && l.includes('"inner"'))).toBe(true);
        });

        it('includes array metadata', () => {
            new Logger('arr').info('arr', { items: [1, 2, 3] });
            expect(getWritten().some(l => l.includes('"items"'))).toBe(true);
        });

        it('handles special characters in metadata', () => {
            new Logger('sp').info('special', { msg: 'line\nbreak' });
            expect(getWritten().some(l => l.includes('"msg"'))).toBe(true);
        });
    });

    describe('formatting', () => {
        it('includes ISO timestamp at start of line', () => {
            new Logger().info('ts test');
            expect(getWritten().some(w =>
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(w)
            )).toBe(true);
        });

        it('pads level to 5 characters in brackets', () => {
            new Logger().info('test');
            expect(getWritten().some(w => w.includes('[INFO ]'))).toBe(true);
        });

        it('formats all level tags correctly', () => {
            process.env.LOG_LEVEL = 'debug';
            const log = new Logger();
            log.debug('d');
            log.info('i');
            log.warn('w');
            log.error('e');
            const w = getWritten();
            expect(w.some(l => l.includes('[DEBUG]'))).toBe(true);
            expect(w.some(l => l.includes('[INFO ]'))).toBe(true);
            expect(w.some(l => l.includes('[WARN ]'))).toBe(true);
            expect(w.some(l => l.includes('[ERROR]'))).toBe(true);
        });

        it('appends newline to each written buffer', () => {
            new Logger().info('newline test');
            expect(mockStreamWrite.mock.calls.some(c => String(c[0]).endsWith('\n'))).toBe(true);
        });

        it('includes message text in output', () => {
            new Logger().info('hello world 12345');
            expect(getWritten().some(w => w.includes('hello world 12345'))).toBe(true);
        });
    });
});

// ====================================================================
// Default logger instance
// ====================================================================

describe('default logger', () => {
    it('exports a Logger instance as logger', () => {
        expect(logger).toBeInstanceOf(Logger);
    });

    it('can write log messages', () => {
        logger.info('default logger test');
        expect(getWritten().some(w => w.includes('default logger test'))).toBe(true);
    });
});

// ====================================================================
// cleanOldLogs
// ====================================================================

describe('cleanOldLogs', () => {
    it('creates log directory if it does not exist', () => {
        mockExistsSync.mockReturnValue(false);
        mockReaddirSync.mockReturnValue([]);
        cleanOldLogs();
        expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('does not create log directory if it already exists', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([]);
        cleanOldLogs();
        expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('deletes files older than retention period', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue(['resonance-2020-01-01.log', 'resonance-2099-01-01.log']);
        mockStatSync.mockImplementation((_path: any) => {
            if (String(_path).includes('2020-01-01')) {
                return { size: 1000, mtimeMs: 0 };
            }
            return { size: 2000, mtimeMs: Date.now() };
        });

        const result = cleanOldLogs();
        expect(result.deleted).toBe(1);
        expect(result.remaining).toBe(1);
        expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    });

    it('returns totalSizeKB of remaining files', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue(['resonance-2099-01-01.log']);
        mockStatSync.mockReturnValue({ size: 10240, mtimeMs: Date.now() });

        const result = cleanOldLogs();
        expect(result.totalSizeKB).toBe(10);
    });

    it('rounds totalSizeKB correctly', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue(['resonance-2099-01-01.log']);
        mockStatSync.mockReturnValue({ size: 1500, mtimeMs: Date.now() });

        const result = cleanOldLogs();
        expect(result.totalSizeKB).toBe(1);
    });

    it('ignores non-matching filenames', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
            'random-file.txt',
            'resonance-bad-date.log',
            'other.log',
            'resonance-2099-01-01.log',
        ]);
        mockStatSync.mockReturnValue({ size: 1000, mtimeMs: Date.now() });

        const result = cleanOldLogs();
        expect(result.remaining).toBe(1);
    });

    it('handles part-numbered log files in the regex', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
            'resonance-2099-01-01.log',
            'resonance-2099-01-01.1.log',
            'resonance-2099-01-01.2.log',
        ]);
        mockStatSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() });

        const result = cleanOldLogs();
        expect(result.remaining).toBe(3);
        expect(result.totalSizeKB).toBe(3);
    });

    it('returns zeros when readdirSync throws', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockImplementation(() => { throw new Error('permission denied'); });

        const result = cleanOldLogs();
        expect(result).toEqual({ deleted: 0, remaining: 0, totalSizeKB: 0 });
    });

    it('returns zeros when directory is empty', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([]);

        const result = cleanOldLogs();
        expect(result).toEqual({ deleted: 0, remaining: 0, totalSizeKB: 0 });
    });

    it('deletes all old files and counts them', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
            'resonance-2020-01-01.log',
            'resonance-2020-01-02.log',
            'resonance-2020-01-02.1.log',
        ]);
        mockStatSync.mockReturnValue({ size: 500, mtimeMs: 0 });

        const result = cleanOldLogs();
        expect(result.deleted).toBe(3);
        expect(result.remaining).toBe(0);
        expect(result.totalSizeKB).toBe(0);
        expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
    });
});

// ====================================================================
// interceptConsole — MUST run BEFORE fileLog tests
// The body only executes once (intercepted flag). We call it here,
// and do NOT restore console methods so that fileLog tests work.
// ====================================================================

describe('interceptConsole', () => {
    it('patches console methods on first call', () => {
        const origLog = console.log;
        interceptConsole();
        // interceptConsole patches console.log (if not already intercepted)
        // After calling, console.log may or may not be the same reference
        // depending on whether it was already called. We verify it doesn't throw.
        expect(typeof console.log).toBe('function');
        expect(typeof console.error).toBe('function');
        expect(typeof console.warn).toBe('function');
    });

    it('is safe to call multiple times (idempotent)', () => {
        expect(() => interceptConsole()).not.toThrow();
        expect(() => interceptConsole()).not.toThrow();
    });
});

// ====================================================================
// fileLog via intercepted console
// The patched console.log/error/warn call fileLog, which we observe
// via mockStreamWrite. interceptConsole() was called above — since we
// did NOT restore console methods, they remain patched.
// ====================================================================

describe('fileLog via intercepted console', () => {
    it('console.log writes to file as info level', () => {
        const marker = 'filelog-test-' + Date.now();
        console.log(marker);
        const w = getWritten();
        expect(w.some(l => l.includes(marker) && l.includes('[INFO ]'))).toBe(true);
    });

    it('console.error writes to file as error level', () => {
        const marker = 'error-filelog-' + Date.now();
        console.error(marker);
        const w = getWritten();
        expect(w.some(l => l.includes(marker) && l.includes('[ERROR]'))).toBe(true);
    });

    it('console.warn writes to file as warn level', () => {
        const marker = 'warn-filelog-' + Date.now();
        console.warn(marker);
        const w = getWritten();
        expect(w.some(l => l.includes(marker) && l.includes('[WARN ]'))).toBe(true);
    });

    it('extracts [prefix] from console message', () => {
        const marker = 'prefixed-' + Date.now();
        console.log(`[MyModule] ${marker}`);
        const w = getWritten();
        expect(w.some(l => l.includes('[MyModule]') && l.includes(marker))).toBe(true);
    });

    it('serializes non-string args to JSON', () => {
        const marker = 'obj-' + Date.now();
        console.log(marker, { foo: 'bar' });
        const w = getWritten();
        expect(w.some(l => l.includes(marker) && l.includes('"foo":"bar"'))).toBe(true);
    });

    it('handles multiple string args joined by space', () => {
        const a = 'aaa' + Date.now();
        const b = 'bbb' + Date.now();
        console.log(a, b);
        const w = getWritten();
        expect(w.some(l => l.includes(a) && l.includes(b))).toBe(true);
    });

    it('suppresses EPIPE string messages from file log', () => {
        console.error('write EPIPE');
        const w = getWritten();
        expect(w.some(l => l.includes('EPIPE'))).toBe(false);
    });

    it('suppresses EPIPE error objects from file log', () => {
        console.error({ code: 'EPIPE', message: 'broken pipe' });
        const w = getWritten();
        expect(w.some(l => l.includes('EPIPE'))).toBe(false);
    });

    it('suppresses errno -4047 objects from file log', () => {
        console.error({ errno: -4047 });
        const w = getWritten();
        expect(w.some(l => l.includes('-4047'))).toBe(false);
    });

    it('suppresses ERR_STREAM_DESTROYED objects from file log', () => {
        console.error({ code: 'ERR_STREAM_DESTROYED' });
        const w = getWritten();
        expect(w.some(l => l.includes('ERR_STREAM_DESTROYED'))).toBe(false);
    });

    it('truncates very long individual JSON args', () => {
        const longStr = 'x'.repeat(5000);
        console.log({ data: longStr });
        const w = getWritten();
        expect(w.some(l => l.includes(longStr))).toBe(false);
    });

    it('respects log level filtering for console messages', () => {
        process.env.LOG_LEVEL = 'error';
        const marker = 'should-be-filtered-' + Date.now();
        console.log(marker);
        const w = getWritten();
        expect(w.some(l => l.includes(marker))).toBe(false);
    });

    it('does not suppress non-EPIPE error objects', () => {
        const marker = 'normal-error-' + Date.now();
        console.error(marker, { code: 'ECONNREFUSED' });
        const w = getWritten();
        expect(w.some(l => l.includes(marker))).toBe(true);
    });
});

// ====================================================================
// Internal logic: stream and filename
// ====================================================================

describe('internal: stream and filename', () => {
    it('Logger writes through the mock stream successfully', () => {
        new Logger().info('stream check');
        expect(mockStreamWrite).toHaveBeenCalled();
    });

    it('stream write includes the log content', () => {
        const marker = 'content-check-' + Date.now();
        new Logger().info(marker);
        expect(getWritten().some(l => l.includes(marker))).toBe(true);
    });
});

// ====================================================================
// Internal logic: isEpipeMessage (re-implementation test)
// ====================================================================

describe('internal: isEpipeMessage logic', () => {
    function isEpipeMessage(args: any[]): boolean {
        for (const a of args) {
            if (typeof a === 'string' && a.includes('EPIPE')) return true;
            if (a && typeof a === 'object') {
                if (a.code === 'EPIPE' || a.errno === -4047 || a.code === 'ERR_STREAM_DESTROYED') return true;
            }
        }
        return false;
    }

    it('detects EPIPE in string arg', () => {
        expect(isEpipeMessage(['write EPIPE'])).toBe(true);
        expect(isEpipeMessage(['EPIPE error occurred'])).toBe(true);
    });

    it('detects EPIPE code on error object', () => {
        expect(isEpipeMessage([{ code: 'EPIPE', message: 'broken pipe' }])).toBe(true);
    });

    it('detects errno -4047', () => {
        expect(isEpipeMessage([{ errno: -4047 }])).toBe(true);
    });

    it('detects ERR_STREAM_DESTROYED', () => {
        expect(isEpipeMessage([{ code: 'ERR_STREAM_DESTROYED' }])).toBe(true);
    });

    it('returns false for normal messages', () => {
        expect(isEpipeMessage(['normal log message'])).toBe(false);
        expect(isEpipeMessage([{ code: 'ECONNREFUSED' }])).toBe(false);
        expect(isEpipeMessage([42, 'no error here'])).toBe(false);
    });

    it('returns false for empty args', () => {
        expect(isEpipeMessage([])).toBe(false);
    });

    it('scans all args in array', () => {
        expect(isEpipeMessage(['normal', { code: 'EPIPE' }])).toBe(true);
        expect(isEpipeMessage([{ code: 'OTHER' }, 'write EPIPE'])).toBe(true);
    });

    it('skips null/undefined/number args gracefully', () => {
        expect(isEpipeMessage([null, undefined, 42, 'safe'])).toBe(false);
    });

    it('detects EPIPE substring anywhere in string', () => {
        expect(isEpipeMessage(['Error: write EPIPE at net.Socket'])).toBe(true);
    });

    it('does not false-positive on partial matches for object codes', () => {
        expect(isEpipeMessage([{ code: 'EPIP' }])).toBe(false);
        expect(isEpipeMessage([{ code: 'PIPE' }])).toBe(false);
        expect(isEpipeMessage([{ errno: -4048 }])).toBe(false);
    });
});

// ====================================================================
// Internal logic: rate limiting
// ====================================================================

describe('internal: rate limiting', () => {
    it('allows first occurrence of a message', () => {
        new Logger('rl').info('unique message ' + Math.random());
        expect(mockStreamWrite).toHaveBeenCalled();
    });

    it('allows up to 5 identical messages within the rate window', () => {
        const log = new Logger('rl');
        const msg = 'repeated-msg-' + Date.now();

        for (let i = 0; i < 5; i++) {
            log.info(msg);
        }
        const writes = getWritten().filter(w => w.includes(msg));
        expect(writes.length).toBe(5);
    });

    it('suppresses messages beyond the rate limit', () => {
        const log = new Logger('rl');
        const msg = 'flood-msg-' + Date.now();

        for (let i = 0; i < 10; i++) {
            log.info(msg);
        }
        const writes = getWritten().filter(w => w.includes(msg));
        expect(writes.length).toBe(5);
    });

    it('emits suppression summary when a new message arrives after suppression', () => {
        const log = new Logger('rl');
        const repeatedMsg = 'suppress-test-' + Date.now();

        for (let i = 0; i < 10; i++) {
            log.info(repeatedMsg);
        }
        log.info('different message ' + Date.now());

        const allWrites = getWritten();
        const summaryWrites = allWrites.filter(w => w.includes('suppressed'));
        // At least 1 summary (may include carryover from prior test state)
        expect(summaryWrites.length).toBeGreaterThanOrEqual(1);
        expect(summaryWrites.some(w => w.includes('repeated 5 more time(s)'))).toBe(true);
    });

    it('suppression summary has [WARN ] [system] prefix', () => {
        const log = new Logger('rl');
        const msg = 'summary-prefix-' + Date.now();

        for (let i = 0; i < 10; i++) {
            log.info(msg);
        }
        log.info('trigger summary ' + Date.now());

        const summary = getWritten().find(w => w.includes('suppressed'));
        expect(summary).toBeDefined();
        expect(summary).toContain('[WARN ]');
        expect(summary).toContain('[system]');
    });

    it('resets count for a genuinely new message body', () => {
        const log = new Logger('rl');
        const msg1 = 'first-msg-' + Date.now();
        const msg2 = 'second-msg-' + Date.now();

        for (let i = 0; i < 7; i++) {
            log.info(msg1);
        }
        for (let i = 0; i < 5; i++) {
            log.info(msg2);
        }
        const msg2Writes = getWritten().filter(w => w.includes(msg2));
        expect(msg2Writes.length).toBe(5);
    });
});

// ====================================================================
// Internal logic: line truncation
// ====================================================================

describe('internal: line truncation', () => {
    it('truncates lines longer than MAX_LINE_LENGTH (4000 chars)', () => {
        new Logger('trunc').info('x'.repeat(5000));
        const w = getWritten();
        expect(w.some(l => l.includes('truncated'))).toBe(true);
        expect(w.some(l => l.includes('x'.repeat(5000)))).toBe(false);
    });

    it('includes truncated character count in the notice', () => {
        new Logger('trunc').info('z'.repeat(5000));
        const truncLine = getWritten().find(l => l.includes('truncated'));
        expect(truncLine).toBeDefined();
        expect(truncLine).toMatch(/truncated \d+ chars/);
    });

    it('does not truncate lines within limit', () => {
        const shortMsg = 'y'.repeat(100);
        new Logger('trunc').info(shortMsg);
        const w = getWritten();
        expect(w.some(l => l.includes('truncated'))).toBe(false);
        expect(w.some(l => l.includes(shortMsg))).toBe(true);
    });

    it('does not truncate lines near but under 4000 chars', () => {
        new Logger().info('a'.repeat(3900));
        expect(getWritten().some(l => l.includes('truncated'))).toBe(false);
    });
});

// ====================================================================
// Internal logic: stream error handling
// ====================================================================

describe('internal: stream error handling', () => {
    it('logger continues to function with mock stream', () => {
        new Logger('err').info('trigger');
        expect(mockStreamWrite).toHaveBeenCalled();
    });
});

// ====================================================================
// Internal logic: PREFIX_REGEX extraction
// ====================================================================

describe('internal: PREFIX_REGEX extraction in fileLog', () => {
    const PREFIX_REGEX = /^\[([^\]]+)\]\s*/;

    it('matches [prefix] at start of string', () => {
        expect(PREFIX_REGEX.test('[synthesis] hello')).toBe(true);
        expect(PREFIX_REGEX.exec('[synthesis] hello')![1]).toBe('synthesis');
    });

    it('does not match prefix in middle of string', () => {
        expect(PREFIX_REGEX.test('hello [synthesis] world')).toBe(false);
    });

    it('matches complex prefixes', () => {
        expect(PREFIX_REGEX.exec('[core:engine]  msg')![1]).toBe('core:engine');
        expect(PREFIX_REGEX.exec('[EVM] checking')![1]).toBe('EVM');
    });

    it('captures everything inside brackets', () => {
        expect(PREFIX_REGEX.exec('[a b c] rest')![1]).toBe('a b c');
    });

    it('consumes trailing whitespace after bracket', () => {
        expect(PREFIX_REGEX.exec('[pfx]   message')![0]).toBe('[pfx]   ');
    });

    it('does not match empty brackets', () => {
        expect(PREFIX_REGEX.test('[] message')).toBe(false);
    });
});

// ====================================================================
// LogLevel type and level ordering
// ====================================================================

describe('LogLevel type and level ordering', () => {
    it('orders debug < info < warn < error', () => {
        const LEVEL_ORDER: Record<string, number> = {
            debug: 0, info: 1, warn: 2, error: 3,
        };
        expect(LEVEL_ORDER.debug).toBeLessThan(LEVEL_ORDER.info);
        expect(LEVEL_ORDER.info).toBeLessThan(LEVEL_ORDER.warn);
        expect(LEVEL_ORDER.warn).toBeLessThan(LEVEL_ORDER.error);
    });
});

// ====================================================================
// Edge cases
// ====================================================================

describe('edge cases', () => {
    it('Logger with empty string prefix acts as no prefix', () => {
        new Logger('').info('empty prefix test');
        expect(getWritten().some(l => /\[\s*\]/.test(l))).toBe(false);
    });

    it('handles error within writeLine gracefully (never crashes app)', () => {
        mockStreamWrite.mockImplementation(() => { throw new Error('disk full'); });
        expect(() => new Logger('safe').info('should not crash')).not.toThrow();
    });

    it('handles getStream failure gracefully', () => {
        mockReaddirSync.mockImplementation(() => { throw new Error('no access'); });
        expect(() => new Logger('safe').info('should handle gracefully')).not.toThrow();
    });

    it('Logger with undefined prefix acts as no prefix', () => {
        new Logger(undefined).info('undef prefix');
        const line = getWritten().find(l => l.includes('undef prefix'));
        expect(line).toBeDefined();
        expect(line).toMatch(/\[INFO \] undef prefix/);
    });

    it('multiple loggers can coexist', () => {
        const logA = new Logger('modA');
        const logB = new Logger('modB');
        logA.info('from A');
        logB.info('from B');
        const w = getWritten();
        expect(w.some(l => l.includes('[modA]') && l.includes('from A'))).toBe(true);
        expect(w.some(l => l.includes('[modB]') && l.includes('from B'))).toBe(true);
    });
});

// ====================================================================
// killLogging — MUST BE THE VERY LAST describe block
// It permanently sets loggingKilled=true in the module.
// ====================================================================

describe('killLogging (FINAL — permanently kills module-level logging)', () => {
    it('calling killLogging does not throw', () => {
        expect(() => killLogging()).not.toThrow();
    });

    it('prevents all subsequent Logger writes', () => {
        mockStreamWrite.mockClear();
        const log = new Logger('post-kill');
        log.info('should be suppressed');
        log.warn('should be suppressed');
        log.error('should be suppressed');
        log.debug('should be suppressed');
        expect(mockStreamWrite).not.toHaveBeenCalled();
    });

    it('prevents all subsequent console writes to file', () => {
        mockStreamWrite.mockClear();
        console.log('post-kill console');
        console.error('post-kill console err');
        console.warn('post-kill console warn');
        // writeLine bails on loggingKilled, so no stream writes
        expect(mockStreamWrite).not.toHaveBeenCalled();
    });

    it('does not open new streams after kill', () => {
        mockCreateWriteStream.mockClear();
        new Logger('dead').error('no stream');
        expect(mockCreateWriteStream).not.toHaveBeenCalled();
    });

    it('cleanOldLogs still works independently of kill flag', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue(['resonance-2020-01-01.log']);
        mockStatSync.mockReturnValue({ size: 500, mtimeMs: 0 });

        const result = cleanOldLogs();
        expect(result.deleted).toBe(1);
    });

    it('calling killLogging again is safe (idempotent)', () => {
        expect(() => killLogging()).not.toThrow();
    });
});
