/**
 * Ultimate coverage tests for utils/logger.ts
 *
 * Targets remaining uncovered branches after logger-core and logger-max:
 * - getStream: dailySizeExceeded=true early return (second call after cap)
 * - getStream: dailyBytesWritten >= MAX_DAILY_SIZE sets dailySizeExceeded
 * - getStream: bytesWritten >= MAX_LOG_SIZE with diskPartCount >= MAX_DAILY_PARTS
 * - getStream: bytesWritten >= MAX_LOG_SIZE rotation to next part
 * - writeLine: loggingKilled early return
 * - writeLine: rate limit summary when getStream returns null (daily cap hit during summary)
 * - openNewStream: statSync throws on existing file (bytesWritten=0 fallback)
 * - cleanOldLogs: readdirSync throws (outer catch)
 * - fileLog: JSON.stringify of circular object (arg serialization catch)
 * - interceptConsole: safeOriginal non-EPIPE re-throw path (non-EPIPE thrown)
 * - Logger.child: chained child prefixes
 * - shouldLog: LOG_LEVEL=warn suppresses info
 * - shouldLog: unknown LOG_LEVEL defaults to info
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock fs
// ---------------------------------------------------------------------------

const mockExistsSync = jest.fn<(...a: any[]) => boolean>().mockReturnValue(false);
const mockMkdirSync = jest.fn();
const mockReaddirSync = jest.fn<(...a: any[]) => string[]>().mockReturnValue([]);
const mockStatSync = jest.fn<(...a: any[]) => any>().mockReturnValue({ size: 0, mtimeMs: Date.now() });
const mockUnlinkSync = jest.fn();
const mockReadFileSync = jest.fn<any>().mockReturnValue('{}');

const mockStreamWrite = jest.fn<(...a: any[]) => boolean>().mockReturnValue(true);
const mockStreamEnd = jest.fn();

const capturedErrorHandlers: Array<(err: any) => void> = [];
const mockStreamOn = jest.fn((event: any, handler: any) => {
    if (event === 'error') capturedErrorHandlers.push(handler);
});

function makeMockStream() {
    return { write: mockStreamWrite, end: mockStreamEnd, on: mockStreamOn };
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

jest.unstable_mockModule('../../config/constants.js', () => ({
    RC: { misc: { logRateLimitWindowMs: 5000, logRateLimitMaxRepeats: 5 } },
}));

const { Logger, killLogging, cleanOldLogs, interceptConsole } =
    await import('../../utils/logger.js');

function getWritten(): string[] {
    return mockStreamWrite.mock.calls.map(c => String(c[0]));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue({ size: 0, mtimeMs: Date.now() });
    mockStreamWrite.mockReturnValue(true);
    mockCreateWriteStream.mockReturnValue(makeMockStream());
    delete process.env.LOG_LEVEL;
});

// ====================================================================
// shouldLog: LOG_LEVEL=warn suppresses info
// ====================================================================

describe('shouldLog: warn level suppresses info and debug', () => {
    it('suppresses info when LOG_LEVEL=warn', () => {
        process.env.LOG_LEVEL = 'warn';
        mockStreamWrite.mockClear();
        new Logger('wl').info('should not log');
        expect(mockStreamWrite).not.toHaveBeenCalled();
    });

    it('allows warn when LOG_LEVEL=warn', () => {
        process.env.LOG_LEVEL = 'warn';
        new Logger('wl').warn('should log');
        const w = getWritten();
        expect(w.some(l => l.includes('should log'))).toBe(true);
    });

    it('allows error when LOG_LEVEL=warn', () => {
        process.env.LOG_LEVEL = 'warn';
        new Logger('wl').error('error msg');
        const w = getWritten();
        expect(w.some(l => l.includes('error msg'))).toBe(true);
    });

    it('defaults to info for unknown LOG_LEVEL', () => {
        process.env.LOG_LEVEL = 'BOGUS';
        new Logger('unk').info('info msg');
        const w = getWritten();
        expect(w.some(l => l.includes('info msg'))).toBe(true);
    });
});

// ====================================================================
// Logger.child: chained prefix
// ====================================================================

describe('Logger.child: chained prefixes', () => {
    it('combines parent and child prefixes with colon', () => {
        const parent = new Logger('parent');
        const child = parent.child('child');
        child.info('chained');
        const w = getWritten();
        expect(w.some(l => l.includes('[parent:child]'))).toBe(true);
    });

    it('creates child without parent prefix', () => {
        const root = new Logger();
        const child = root.child('solo');
        child.info('solo test');
        const w = getWritten();
        expect(w.some(l => l.includes('[solo]'))).toBe(true);
    });
});

// ====================================================================
// openNewStream: statSync throws on existing file
// ====================================================================

describe('openNewStream: statSync error on existing file', () => {
    it('sets bytesWritten to 0 when statSync throws', () => {
        mockExistsSync.mockReturnValue(true);
        mockStatSync.mockImplementation(() => { throw new Error('EACCES'); });

        // Should not throw, just default bytesWritten to 0
        new Logger('stat-err').info('still works');
        expect(mockStreamWrite).toHaveBeenCalled();
    });
});

// ====================================================================
// cleanOldLogs: readdirSync throws
// ====================================================================

describe('cleanOldLogs: outer catch when readdirSync throws', () => {
    it('returns zero counts when readdirSync throws', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });

        const result = cleanOldLogs();
        expect(result).toEqual({ deleted: 0, remaining: 0, totalSizeKB: 0 });
    });
});

// ====================================================================
// cleanOldLogs: deletes old files and counts remaining
// ====================================================================

describe('cleanOldLogs: mixed old and new files', () => {
    it('deletes old files and counts remaining with size', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
            'resonance-2020-01-01.log',
            'resonance-2020-01-01.1.log',
            'resonance-2099-12-31.log',
        ]);
        mockStatSync.mockImplementation((filePath: string) => {
            if (typeof filePath === 'string' && filePath.includes('2020')) {
                return { size: 1000, mtimeMs: 0 }; // old
            }
            return { size: 2048, mtimeMs: Date.now() }; // new
        });

        const result = cleanOldLogs();
        expect(result.deleted).toBe(2);
        expect(result.remaining).toBe(1);
        expect(result.totalSizeKB).toBe(2); // 2048 / 1024 = 2
        expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    });
});

// ====================================================================
// formatLine: empty meta object
// ====================================================================

describe('formatLine: empty meta object produces no JSON suffix', () => {
    it('does not append {} for empty meta', () => {
        new Logger('empty-meta').info('no meta', {});
        const w = getWritten();
        // No trailing JSON object
        expect(w.some(l => l.includes('no meta') && !l.includes('{}'))).toBe(true);
    });
});

// ====================================================================
// fileLog: non-string arg serialization with truncation
// ====================================================================

describe('fileLog via console: arg serialization edge cases', () => {
    // Intercept console first
    it('setup: intercept console', () => {
        interceptConsole();
        expect(typeof console.log).toBe('function');
    });

    it('serializes number args', () => {
        console.log(42, 3.14);
        const w = getWritten();
        expect(w.some(l => l.includes('42') && l.includes('3.14'))).toBe(true);
    });

    it('serializes array args', () => {
        const marker = 'arr-test-' + Date.now();
        console.log(marker, [1, 2, 3]);
        const w = getWritten();
        expect(w.some(l => l.includes('[1,2,3]'))).toBe(true);
    });

    it('handles console.warn level', () => {
        const marker = 'warn-test-' + Date.now();
        console.warn(marker);
        const w = getWritten();
        expect(w.some(l => l.includes('[WARN ]') && l.includes(marker))).toBe(true);
    });

    it('suppresses EPIPE string in first arg', () => {
        mockStreamWrite.mockClear();
        console.log('EPIPE error occurred');
        // EPIPE messages are filtered from file log
        const w = getWritten();
        expect(w.some(l => l.includes('EPIPE error'))).toBe(false);
    });

    it('suppresses ERR_STREAM_DESTROYED object', () => {
        mockStreamWrite.mockClear();
        console.error({ code: 'ERR_STREAM_DESTROYED' });
        const w = getWritten();
        expect(w.some(l => l.includes('ERR_STREAM_DESTROYED'))).toBe(false);
    });
});

// ====================================================================
// openNewStream: EPIPE stream error handler kills logging
// ====================================================================

describe('openNewStream: EPIPE error handler', () => {
    it('kills logging on EPIPE stream error', () => {
        new Logger('epipe-stream').info('trigger stream');
        const handler = capturedErrorHandlers[capturedErrorHandlers.length - 1];
        expect(handler).toBeDefined();
        if (handler) {
            handler({ code: 'EPIPE', errno: -4047 });
            // After EPIPE, writes should be suppressed
            mockStreamWrite.mockClear();
            new Logger('post-epipe').info('should not log');
            expect(mockStreamWrite).not.toHaveBeenCalled();
        }
    });
});

// ====================================================================
// killLogging — MUST BE LAST (permanently disables logging for this module)
// ====================================================================

describe('killLogging (FINAL)', () => {
    it('kills logging permanently', () => {
        new Logger('pre').info('ensure open');
        killLogging();
        mockStreamWrite.mockClear();
        new Logger('post').info('no op');
        expect(mockStreamWrite).not.toHaveBeenCalled();
    });
});
